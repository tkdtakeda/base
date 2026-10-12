"""DB のテーブルから読み取る列の一覧（カタログ）。設定に関係なく、DB の事実だけを持つ。

    name         … DB の列名（そのまま画面の列の id・見出しになる）
    looks_date   … 空でない値がすべて日付の書き方か（YYYY-MM-DD… / YYYY/MM/DD… / YYYYMMDD）
    looks_number … 空でない値がすべて数値か（桁区切りのカンマ可。先頭が 0 の番号があれば False。sql_functions.looks_number）
                   どちらも、1 つでも当てはまらない値があれば、または値がすべて空なら False
並びは DB の順。どの列に役割（1 件を決める・番号で探す）を持たせるかは、column_model.py が設定から決める。
"""

import sqlite3
from dataclasses import dataclass

from .query import blank_expression, quote_identifier

# 月・日の 1 桁目まで見て、ただの数字の並び（番号など）を日付と取り違えにくくする
DATE_GLOBS = (
    "[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]*",
    "[12][0-9][0-9][0-9]/[01][0-9]/[0-3][0-9]*",
)
COMPACT_DATE_GLOB = "[12][0-9][0-9][0-9][01][0-9][0-3][0-9]"
DETECT_CHUNK = 200  # 1 つの SQL で調べる列の数（1 列につき 3 つ。SQLite の結果列数の上限より十分小さく）


@dataclass(frozen=True)
class DbColumn:
    name: str
    looks_date: bool = False
    looks_number: bool = False


def _date_test(column):
    text = f"CAST({column} AS TEXT)"
    parts = [f"{text} GLOB '{pattern}'" for pattern in DATE_GLOBS]
    parts.append(f"(length({text}) = 8 AND {text} GLOB '{COMPACT_DATE_GLOB}')")
    return "(" + " OR ".join(parts) + ")"


def detect_kinds(conn, table_name, names):
    """値から見た種類：(日付の列の名前, 数値の列の名前) を返す（表を列のまとまりごとに 1 回ずつ読む）。
    接続には sql_functions.register で関数を足しておくこと。"""
    dates, numbers = set(), set()
    table = quote_identifier(table_name)
    for start in range(0, len(names), DETECT_CHUNK):
        chunk = names[start:start + DETECT_CHUNK]
        terms = []
        for name in chunk:
            column = quote_identifier(name)
            filled = f"NOT {blank_expression(column)}"
            terms.append(f"SUM(CASE WHEN {filled} THEN 1 ELSE 0 END)")
            terms.append(f"SUM(CASE WHEN {filled} AND NOT {_date_test(column)} THEN 1 ELSE 0 END)")
            terms.append(f"SUM(CASE WHEN {filled} AND ds_auto_number({column}) = 0 THEN 1 ELSE 0 END)")
        row = conn.execute(f"SELECT {', '.join(terms)} FROM {table}").fetchone()
        for index, name in enumerate(chunk):
            filled, not_date, not_number = (row[index * 3 + offset] or 0 for offset in range(3))
            if filled and not not_date:
                dates.add(name)
            elif filled and not not_number:
                numbers.add(name)
    return dates, numbers


def read_table_columns(conn, table_name):
    return [row[1] for row in conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})")]


def read_catalog(conn, table_name):
    names = read_table_columns(conn, table_name)
    dates, numbers = detect_kinds(conn, table_name, names) if names else (set(), set())
    return tuple(DbColumn(name, name in dates, name in numbers) for name in names)


def catalog_from_file(open_connection, path, table_name):
    """キャッシュのファイルから作る。読めなければ空（画面は「データを更新してください」と出す）。"""
    try:
        conn = open_connection(path)
        try:
            return read_catalog(conn, table_name)
        finally:
            conn.close()
    except sqlite3.Error:
        return ()
