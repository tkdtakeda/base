"""一覧・検索・絞り込み・詳細取得の業務ロジック。入力の検証もここで行う。"""

import sqlite3
import time
import unicodedata
from datetime import date, timedelta

from .errors import AppError
from .fields import (
    FILTER_VALUE_LENGTH_MAX,
    FILTER_VALUES_MAX,
    KEYWORD_MAX_LENGTH,
    MATCH_MODES,
    RELATIVE_DAYS_MAX,
    SORT_ORDERS,
    VALUE_LIST_LIMIT,
)
from .column_model import ColumnModelProvider
from .query import QueryBuilder
from .settings.validation import RECORD_KEY_MAX


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


def _row_to_item(row, ids):
    return {name: _to_text(row[index]) for index, name in enumerate(ids)}


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

def _not_ready():
    return AppError("KEY_NOT_READY", "record key is not resolved")


def parse_search(payload, required, model):
    """(番号で探す列, keyword, matchMode) か、検索なしなら None を返す。探す列は設定（model）で決まる。"""
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
    if model.search_column is None:
        raise _not_ready()
    match_mode = payload.get("matchMode", "partial")
    if match_mode not in MATCH_MODES:
        raise _invalid("unknown matchMode")
    return model.search_column, keyword, match_mode


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


def filter_kind(model, name):
    """その列の絞り込みの種類。日付の列は日付の範囲、ほかは値から選ぶ。列がなければ None。"""
    kind = model.kind_of(name)
    if kind is None:
        return None
    return "date" if kind == "date" else "values"


def parse_filters(payload, today, model):
    """画面から来た絞り込みを、QueryBuilder が受け取る形に直す。空の条件は無視する。どの列でも絞り込める。"""
    raw = payload.get("filters") or {}
    if not isinstance(raw, dict):
        raise _invalid("filters must be an object")
    filters = []
    for name, spec in raw.items():
        kind = filter_kind(model, name)
        if kind is None or not isinstance(spec, dict) or spec.get("type") != kind:
            raise _invalid("unknown filter")
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


def parse_key_columns(payload, model, name="recordKey"):
    """1 件を決める列の候補（1〜3 個・重複なし・テーブルにある列）。"""
    names = payload.get(name)
    if not isinstance(names, list) or not 1 <= len(names) <= RECORD_KEY_MAX:
        raise _invalid(f"{name} must be a list", f"1 件を決める列は 1〜{RECORD_KEY_MAX} 個選んでください。")
    if len(set(map(str, names))) != len(names) or not all(isinstance(n, str) and model.has(n) for n in names):
        raise _invalid(f"unknown column in {name}", "1 件を決める列は、一覧にある列から重ならないように選んでください。")
    return names


# ── 業務ロジック ─────────────────────────────────────────

class LotService:
    def __init__(self, config, cache_service, logger, today=None):
        self.config = config
        self.cache = cache_service
        self.logger = logger
        # 列の決まり（設定とキャッシュの列から作る）。設定を差し替えたら self.config を変えるだけでよい
        self.models = ColumnModelProvider(lambda: self.config, cache_service)
        self._query, self._query_key = None, None
        self._today = today  # テストで日付を固定するため

    @property
    def model(self):
        return self.models.get()

    def _data_model(self):
        """検索できるデータがあるときの列の決まり。なければ CACHE_UNAVAILABLE（列の決まりより先に知らせる）。"""
        if not self.cache.cache_available():
            raise AppError("CACHE_UNAVAILABLE", "cache file not found")
        return self.model

    @property
    def query(self):
        """列の決まりか設定が変わったら、SQL の組み立て役を作り直す。"""
        model = self.model
        key = (model.version, self.config.table_name)
        if key != self._query_key:
            self._query = QueryBuilder(self.config.table_name, model)
            self._query_key = key
        return self._query

    def today(self):
        return self._today() if self._today else date.today()

    def execute(self, sql, params, fetch):
        with self.cache.read_connection() as conn:
            try:
                cursor = conn.execute(sql, params)
                return cursor.fetchone() if fetch == "one" else cursor.fetchall()
            except sqlite3.Error as exc:
                # SQLite の文面には列名が入るため、ログには種類だけを残す
                raise AppError("CACHE_INVALID", f"query failed: {type(exc).__name__}") from exc

    def search(self, payload):
        """番号で検索する（04_api_spec.md の search_lots。番号は必須）"""
        return self._list(_require_object(payload), keyword_required=True)

    def list(self, payload):
        """一覧を出す。番号の検索と絞り込みはどちらも任意"""
        return self._list(_require_object(payload), keyword_required=False)

    def _list(self, payload, keyword_required):
        today = self.today()
        model = self._data_model()
        search = parse_search(payload, keyword_required, model)
        filters = parse_filters(payload, today, model)
        query = self.query
        default_key, default_order = model.default_sort
        sort_key = payload.get("sortKey") or default_key
        if sort_key not in query.columns:
            raise _invalid("unknown sortKey")
        sort_order = payload.get("sortOrder") or (default_order if sort_key == default_key else "asc")
        if sort_order not in SORT_ORDERS:
            raise _invalid("unknown sortOrder")
        page = _require_int(payload, "page", 1, 1, 10_000_000)
        page_size = _require_int(payload, "pageSize", self.config.page_size, 1, self.config.max_page_size)

        started = time.perf_counter()
        count_sql, count_params = query.count(search, filters)
        rows_sql, rows_params = query.rows(search, filters, sort_key, sort_order, page_size, (page - 1) * page_size)
        total = self.execute(count_sql, count_params, "one")[0]
        rows = self.execute(rows_sql, rows_params, "all")
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

        # 検索値・絞り込みの値・列名はログへ出さない（種類・件数だけ）
        self.logger.info(
            "list search=%s filters=%d total=%d elapsed_ms=%s",
            f"{search[2]}/len{len(search[1])}" if search else "-", len(filters), total, elapsed_ms,
        )
        items = [_row_to_item(row, query.ids) for row in rows]
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
        """絞り込みの候補（値と件数）。ほかの絞り込みと番号の検索を反映して数える。
        match を渡すと、その文字を含む値だけを数える（値が多い列で、上位に出ない値を探すため）。"""
        payload = _require_object(payload)
        model = self._data_model()
        name = payload.get("field")
        if filter_kind(model, name) != "values":
            raise _invalid("field is not a value filter")
        match = payload.get("match")
        if match is not None:
            if not isinstance(match, str):
                raise _invalid("match must be a string")
            match = normalize_keyword(match)
            if len(match) > KEYWORD_MAX_LENGTH:
                raise _invalid("match too long", f"探す文字は {KEYWORD_MAX_LENGTH} 文字以内で入力してください。")
        search = parse_search(payload, False, model)
        filters = parse_filters(payload, self.today(), model)
        sql, params = self.query.values(name, search, filters, VALUE_LIST_LIMIT + 1, match or None)
        rows = self.execute(sql, params, "all")
        return {
            "success": True,
            "field": name,
            "values": [{"value": row[0], "count": row[1]} for row in rows[:VALUE_LIST_LIMIT]],
            "truncated": len(rows) > VALUE_LIST_LIMIT,
            "match": match or None,
        }

    def detail(self, payload):
        """1 件の全項目。payload は 1 件を決める列の 列名 → 値（空欄は null）"""
        payload = _require_object(payload)
        model = self._data_model()
        if not model.ready:
            raise _not_ready()
        key_values = {}
        for name in model.record_key:
            value = payload.get(name)
            if value is not None and not isinstance(value, str):
                raise _invalid("key value must be a string or null")
            key_values[name] = value
        if not any(key_values.values()):
            raise _invalid("key values are empty")

        query = self.query
        sql, params = query.detail(key_values)
        rows = self.execute(sql, params, "all")
        if not rows:
            raise AppError("NOT_FOUND", "record not found")
        if len(rows) > 1:
            self.logger.warning("detail key is not unique")
        return {"success": True, "item": _row_to_item(rows[0], query.ids), "duplicated": len(rows) > 1}

    def check_record_key(self, payload):
        """選んだ列の組み合わせで 1 件に決まるかを数える（保存はしない）。"""
        payload = _require_object(payload)
        names = parse_key_columns(payload, self._data_model())
        query = self.query
        total = self.execute(*query.count(None, []), "one")[0]
        groups, rows = self.execute(*query.key_duplicates(names), "one")
        example = None
        if groups:
            found = self.execute(*query.key_duplicate_example(names), "one")
            example = {"values": dict(zip(names, (_to_text(v) for v in found[:-1]))), "count": found[-1]}
        blank = self.execute(*query.key_blank_rows(names), "one")[0]
        self.logger.info("record key check columns=%d rows=%d duplicate_groups=%d blank=%d", len(names), total, groups, blank)
        return {
            "success": True,
            "recordKey": names,
            "rowCount": total,
            "duplicateGroups": groups,
            "duplicateRows": rows,
            "blankRows": blank,
            "unique": groups == 0,
            "example": example,
        }
