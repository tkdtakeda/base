"""検索と詳細取得の業務ロジック。入力の検証もここで行う。"""

import sqlite3
import time
import unicodedata

from .errors import AppError
from .fields import (
    DISPLAY_FIELDS,
    KEYWORD_MAX_LENGTH,
    MATCH_MODES,
    RECORD_KEY_FIELDS,
    SEARCHABLE_FIELDS,
    SORT_ORDERS,
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


def _require_int(payload, name, default, minimum, maximum):
    value = payload.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise AppError("INVALID_REQUEST", f"{name} out of range")
    return value


class LotService:
    def __init__(self, config, cache_service, logger):
        self.config = config
        self.cache = cache_service
        self.logger = logger
        self.query = QueryBuilder(config.table_name, config.field_mappings)

    def search(self, payload):
        if not isinstance(payload, dict):
            raise AppError("INVALID_REQUEST", "payload must be an object")
        search_type = payload.get("searchType")
        if search_type not in SEARCHABLE_FIELDS:
            raise AppError("INVALID_REQUEST", "unknown searchType")
        keyword = payload.get("keyword")
        if not isinstance(keyword, str):
            raise AppError("INVALID_REQUEST", "keyword must be a string")
        keyword = normalize_keyword(keyword)
        if not keyword:
            raise AppError("INVALID_REQUEST", "keyword is empty", user_message="検索する番号を入力してください。")
        if len(keyword) > KEYWORD_MAX_LENGTH:
            raise AppError(
                "INVALID_REQUEST", "keyword too long",
                user_message=f"検索する番号は {KEYWORD_MAX_LENGTH} 文字以内で入力してください。",
            )
        match_mode = payload.get("matchMode", self.config.default_match_mode)
        if match_mode not in MATCH_MODES:
            raise AppError("INVALID_REQUEST", "unknown matchMode")
        sort_key = payload.get("sortKey") or "lotNo"
        if sort_key not in DISPLAY_FIELDS:
            raise AppError("INVALID_REQUEST", "unknown sortKey")
        sort_order = payload.get("sortOrder") or "asc"
        if sort_order not in SORT_ORDERS:
            raise AppError("INVALID_REQUEST", "unknown sortOrder")
        page = _require_int(payload, "page", 1, 1, 10_000_000)
        page_size = _require_int(payload, "pageSize", self.config.page_size, 1, self.config.max_page_size)

        started = time.perf_counter()
        count_sql, count_params = self.query.count(search_type, keyword, match_mode)
        select_sql, select_params = self.query.search(
            search_type, keyword, match_mode, sort_key, sort_order, page_size, (page - 1) * page_size
        )
        with self.cache.read_connection() as conn:
            try:
                total = conn.execute(count_sql, count_params).fetchone()[0]
                rows = conn.execute(select_sql, select_params).fetchall()
            except sqlite3.Error as exc:
                raise AppError("CACHE_INVALID", f"search failed: {exc}") from exc
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

        # 検索値そのものはログへ出さない（種類・文字数・件数だけ）
        self.logger.info(
            "search type=%s mode=%s length=%d total=%d elapsed_ms=%s",
            search_type, match_mode, len(keyword), total, elapsed_ms,
        )
        items = [_row_to_item(row) for row in rows]
        return {
            "success": True,
            "count": len(items),
            "totalCount": total,
            "page": page,
            "pageSize": page_size,
            "items": items,
            "keyword": keyword,
            "elapsedMs": elapsed_ms,
        }

    def detail(self, payload):
        if not isinstance(payload, dict):
            raise AppError("INVALID_REQUEST", "payload must be an object")
        key_values = {}
        for name in RECORD_KEY_FIELDS:
            value = payload.get(name)
            if value is not None and not isinstance(value, str):
                raise AppError("INVALID_REQUEST", f"{name} must be a string or null")
            key_values[name] = value
        if not key_values["lotNo"]:
            raise AppError("INVALID_REQUEST", "lotNo is required")

        sql, params = self.query.detail(key_values)
        with self.cache.read_connection() as conn:
            try:
                rows = conn.execute(sql, params).fetchall()
            except sqlite3.Error as exc:
                raise AppError("CACHE_INVALID", f"detail failed: {exc}") from exc
        if not rows:
            raise AppError("NOT_FOUND", "record not found")
        if len(rows) > 1:
            self.logger.warning("detail key is not unique")
        return {"success": True, "item": _row_to_item(rows[0]), "duplicated": len(rows) > 1}
