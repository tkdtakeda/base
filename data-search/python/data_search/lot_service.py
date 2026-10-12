"""一覧・検索・絞り込み・詳細取得の業務ロジック。入力の検証もここで行う。"""

import sqlite3
import time
import unicodedata
from datetime import date, timedelta

from .errors import AppError
from .fields import (
    DEFAULT_SORT_KEY,
    DISPLAY_FIELDS,
    FILTER_FIELDS,
    FILTER_VALUE_LENGTH_MAX,
    FILTER_VALUES_MAX,
    KEYWORD_MAX_LENGTH,
    MATCH_MODES,
    RECORD_KEY_FIELDS,
    RELATIVE_DAYS_MAX,
    SEARCHABLE_FIELDS,
    SORT_ORDERS,
    VALUE_LIST_LIMIT,
)
from .query import QueryBuilder


def normalize_keyword(value):
    """全角英数・記号を半角にそろえ、前後の空白を除く（NFKC）。"""
    return unicodedata.normalize("NFKC", value).strip()


def _to_text(value):
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _row_to_item(row):
    return {name: _to_text(row[index]) for index, name in enumerate(DISPLAY_FIELDS)}


def _invalid(detail, user_message=None):
    return AppError("INVALID_REQUEST", detail, user_message=user_message)


def _require_int(payload, name, default, minimum, maximum):
    value = payload.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise _invalid(f"{name} out of range")
    return value


def _require_object(payload):
    if not isinstance(payload, dict):
        raise _invalid("payload must be an object")
    return payload


# ── 入力の読み取り ─────────────────────────────────────────

def parse_search(payload, required):
    """(searchType, keyword, matchMode) か、検索なしなら None を返す。"""
    keyword = payload.get("keyword")
    if keyword is None and not required:
        return None
    if not isinstance(keyword, str):
        raise _invalid("keyword must be a string")
    keyword = normalize_keyword(keyword)
    if not keyword:
        if required:
            raise _invalid("keyword is empty", "検索する番号を入力してください。")
        return None
    if len(keyword) > KEYWORD_MAX_LENGTH:
        raise _invalid("keyword too long", f"検索する番号は {KEYWORD_MAX_LENGTH} 文字以内で入力してください。")
    search_type = payload.get("searchType")
    if search_type not in SEARCHABLE_FIELDS:
        raise _invalid("unknown searchType")
    match_mode = payload.get("matchMode", "partial")
    if match_mode not in MATCH_MODES:
        raise _invalid("unknown matchMode")
    return search_type, keyword, match_mode


def _parse_relative_days(spec, name):
    value = spec.get(name)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or abs(value) > RELATIVE_DAYS_MAX:
        raise _invalid(f"{name} out of range")
    return value


def _parse_iso_date(spec, name):
    value = spec.get(name)
    if value in (None, ""):
        return None
    try:
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError(value)
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise _invalid("invalid date", "日付は 年（4 桁）・月・日 で正しく入力してください。") from exc


def parse_filters(payload, today):
    """画面から来た絞り込みを、QueryBuilder が受け取る形に直す。空の条件は無視する。"""
    raw = payload.get("filters") or {}
    if not isinstance(raw, dict):
        raise _invalid("filters must be an object")
    filters = []
    for name, spec in raw.items():
        kind = FILTER_FIELDS.get(name)
        if kind is None or not isinstance(spec, dict) or spec.get("type") != kind:
            raise _invalid(f"unknown filter: {name}")
        if kind == "values":
            values = spec.get("values")
            if not isinstance(values, list) or len(values) > FILTER_VALUES_MAX:
                raise _invalid("values must be a list")
            if any(v is not None and (not isinstance(v, str) or len(v) > FILTER_VALUE_LENGTH_MAX) for v in values):
                raise _invalid("invalid value in filter")
            if values:
                filters.append((name, kind, list(dict.fromkeys(values))))
            continue
        mode = spec.get("mode")
        if mode == "relative":
            start_days = _parse_relative_days(spec, "fromDays")
            end_days = _parse_relative_days(spec, "toDays")
            start = (today + timedelta(days=start_days)).isoformat() if start_days is not None else None
            end = (today + timedelta(days=end_days)).isoformat() if end_days is not None else None
        elif mode == "absolute":
            start, end = _parse_iso_date(spec, "from"), _parse_iso_date(spec, "to")
        else:
            raise _invalid("unknown date mode")
        if start and end and start > end:
            raise _invalid("date range reversed", "日付の範囲は「から」が「まで」より前になるようにしてください。")
        if start or end:
            filters.append((name, kind, (start, end)))
    return filters


# ── 業務ロジック ─────────────────────────────────────────

class LotService:
    def __init__(self, config, cache_service, logger, today=None):
        self.config = config
        self.cache = cache_service
        self.logger = logger
        self.query = QueryBuilder(config.table_name, config.field_mappings)
        self._today = today  # テストで日付を固定するため

    def today(self):
        return self._today() if self._today else date.today()

    def _execute(self, sql, params, fetch):
        with self.cache.read_connection() as conn:
            try:
                cursor = conn.execute(sql, params)
                return cursor.fetchone() if fetch == "one" else cursor.fetchall()
            except sqlite3.Error as exc:
                raise AppError("CACHE_INVALID", f"query failed: {exc}") from exc

    def search(self, payload):
        """番号で検索する（04_api_spec.md の search_lots。番号は必須）"""
        return self._list(_require_object(payload), keyword_required=True)

    def list(self, payload):
        """一覧を出す。番号の検索と絞り込みはどちらも任意"""
        return self._list(_require_object(payload), keyword_required=False)

    def _list(self, payload, keyword_required):
        today = self.today()
        search = parse_search(payload, keyword_required)
        filters = parse_filters(payload, today)
        sort_key = payload.get("sortKey") or DEFAULT_SORT_KEY
        if sort_key not in DISPLAY_FIELDS:
            raise _invalid("unknown sortKey")
        sort_order = payload.get("sortOrder") or "asc"
        if sort_order not in SORT_ORDERS:
            raise _invalid("unknown sortOrder")
        page = _require_int(payload, "page", 1, 1, 10_000_000)
        page_size = _require_int(payload, "pageSize", self.config.page_size, 1, self.config.max_page_size)

        started = time.perf_counter()
        count_sql, count_params = self.query.count(search, filters)
        rows_sql, rows_params = self.query.rows(search, filters, sort_key, sort_order, page_size, (page - 1) * page_size)
        total = self._execute(count_sql, count_params, "one")[0]
        rows = self._execute(rows_sql, rows_params, "all")
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

        # 検索値・絞り込みの値そのものはログへ出さない（種類・件数だけ）
        self.logger.info(
            "list search=%s filters=%s total=%d elapsed_ms=%s",
            f"{search[0]}/{search[2]}/len{len(search[1])}" if search else "-",
            ",".join(name for name, _, _ in filters) or "-",
            total, elapsed_ms,
        )
        items = [_row_to_item(row) for row in rows]
        return {
            "success": True,
            "count": len(items),
            "totalCount": total,
            "page": page,
            "pageSize": page_size,
            "items": items,
            "keyword": search[1] if search else None,
            "today": today.isoformat(),
            "elapsedMs": elapsed_ms,
        }

    def filter_values(self, payload):
        """絞り込みの候補（値と件数）。ほかの絞り込みと番号の検索を反映して数える"""
        payload = _require_object(payload)
        name = payload.get("field")
        if FILTER_FIELDS.get(name) != "values":
            raise _invalid("field is not a value filter")
        search = parse_search(payload, required=False)
        filters = parse_filters(payload, self.today())
        sql, params = self.query.values(name, search, filters, VALUE_LIST_LIMIT + 1)
        rows = self._execute(sql, params, "all")
        return {
            "success": True,
            "field": name,
            "values": [{"value": row[0], "count": row[1]} for row in rows[:VALUE_LIST_LIMIT]],
            "truncated": len(rows) > VALUE_LIST_LIMIT,
        }

    def detail(self, payload):
        payload = _require_object(payload)
        key_values = {}
        for name in RECORD_KEY_FIELDS:
            value = payload.get(name)
            if value is not None and not isinstance(value, str):
                raise _invalid(f"{name} must be a string or null")
            key_values[name] = value
        if not key_values["lotNo"]:
            raise _invalid("lotNo is required")

        sql, params = self.query.detail(key_values)
        rows = self._execute(sql, params, "all")
        if not rows:
            raise AppError("NOT_FOUND", "record not found")
        if len(rows) > 1:
            self.logger.warning("detail key is not unique")
        return {"success": True, "item": _row_to_item(rows[0]), "duplicated": len(rows) > 1}
