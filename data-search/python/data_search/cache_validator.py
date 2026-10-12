"""コピーした一時ファイルが、検索に使えるかを確かめる。"""

import os
import sqlite3

from .errors import AppError
from .query import quote_identifier


def validate_cache_file(path, table_name, field_mappings):
    """SQLite として開けること・表と列がそろっていることを確かめ、行数を返す。"""
    try:
        conn = open_readonly(path)
    except sqlite3.Error as exc:
        raise AppError("CACHE_INVALID", f"cannot open: {exc}") from exc
    try:
        try:
            result = conn.execute("PRAGMA quick_check").fetchone()
        except sqlite3.DatabaseError as exc:
            raise AppError("CACHE_INVALID", f"not a database: {exc}") from exc
        if not result or result[0] != "ok":
            raise AppError("CACHE_INVALID", f"quick_check: {result}")

        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
            (table_name,),
        ).fetchone()
        if not exists:
            raise AppError("CACHE_TABLE_MISSING", "required table not found")

        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})")}
        missing = [logical for logical, physical in field_mappings.items() if physical not in columns]
        if missing:
            raise AppError(
                "CACHE_COLUMN_MISSING",
                f"missing logical fields: {', '.join(missing)}",
                user_message=(
                    f"取得したデータに、schema.local.json の columns で指定した列（{', '.join('columns.' + name for name in missing)}）が"
                    "ないため、使用しませんでした。列名を確認してください。"
                ),
            )
        return conn.execute(f"SELECT COUNT(*) FROM {quote_identifier(table_name)}").fetchone()[0]
    finally:
        conn.close()


def open_readonly(path):
    """ローカルの SQLite を読み取り専用で開く。"""
    # SQLite の URI では ? と # を区切りとして扱うため、パス中の文字をエスケープする
    uri_path = os.path.abspath(path).replace("\\", "/").replace("%", "%25").replace("?", "%3F").replace("#", "%23")
    if not uri_path.startswith("/"):
        uri_path = "/" + uri_path  # Windows のドライブ文字（C:/...）
    return sqlite3.connect(f"file://{uri_path}?mode=ro", uri=True)
