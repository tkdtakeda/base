"""コピーした一時ファイルが、検索に使えるかを確かめる。"""

import os
import sqlite3

from .errors import AppError
from . import sql_functions
from .query import quote_identifier


def validate_cache_file(path, table_name):
    """SQLite として開けること・表があることを確かめ、行数を返す。

    列は確かめない（固定列などが DB になくても、データは使えるようにして画面で選び直してもらう）。
    検索では、このファイルから読み取った列（column_catalog）だけを使うため、ない列を参照することはない。
    """
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
        return conn.execute(f"SELECT COUNT(*) FROM {quote_identifier(table_name)}").fetchone()[0]
    finally:
        conn.close()


def open_readonly(path):
    """ローカルの SQLite を読み取り専用で開く。数値・文字の条件の関数（sql_functions）を足しておく。"""
    # SQLite の URI では ? と # を区切りとして扱うため、パス中の文字をエスケープする
    uri_path = os.path.abspath(path).replace("\\", "/").replace("%", "%25").replace("?", "%3F").replace("#", "%23")
    if not uri_path.startswith("/"):
        uri_path = "/" + uri_path  # Windows のドライブ文字（C:/...）
    return sql_functions.register(sqlite3.connect(f"file://{uri_path}?mode=ro", uri=True))
