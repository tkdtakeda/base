"""表示する列の一覧（カタログ）。キャッシュのテーブルから列を読み取り、DB の列名をそのまま表示名にする。

    並び順 … 役割のある列（schema.columns の順）を先に、残りは DB の列の順
    id     … 役割のある列は論理名（検索・絞り込みなどで使う）。ほかの列は DB の列名
             （DB の列名が、別の列の論理名と同じになったときは「名前#2」のように区別する）
    label  … DB の列名（画面の見出し・詳細・絞り込みで共通）

設定に書くのは役割のある列だけでよく、DB に列が増えれば自動で表示される。
"""

import hashlib
import sqlite3
from dataclasses import dataclass

from .query import quote_identifier


@dataclass(frozen=True)
class Column:
    id: str
    physical: str
    role: bool

    def public(self):
        return {"id": self.id, "label": self.physical, "role": self.role}


def build_catalog(table_columns, field_mappings):
    """table_columns：DB の列名（DB の順）。field_mappings：役割のある列の 論理名 → DB の列名。"""
    role_physical = set(field_mappings.values())
    columns = [Column(name, physical, True) for name, physical in field_mappings.items()]
    used = set(field_mappings)
    for physical in table_columns:
        if physical in role_physical:
            continue
        column_id, number = physical, 2
        while column_id in used:
            column_id, number = f"{physical}#{number}", number + 1
        used.add(column_id)
        columns.append(Column(column_id, physical, False))
    return tuple(columns)


def read_table_columns(conn, table_name):
    return [row[1] for row in conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})")]


def catalog_from_file(open_connection, path, table_name, field_mappings):
    """キャッシュのファイルから作る。読めなければ役割のある列だけ（画面はそれだけで動く）。"""
    try:
        conn = open_connection(path)
        try:
            return build_catalog(read_table_columns(conn, table_name), field_mappings)
        finally:
            conn.close()
    except sqlite3.Error:
        return build_catalog([], field_mappings)


def catalog_version(columns):
    """列の並びが変わったかを画面が見分けるための印。"""
    text = "\u001f".join(f"{c.id}\u001e{c.physical}" for c in columns)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
