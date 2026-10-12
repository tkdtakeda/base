"""論理条件から SQL を組み立てる。値は必ずパラメーターで渡し、文字列連結しない。

表名・列名は設定ファイルから来る値だけを使い、画面から受け取った値は論理名の一覧と照合してから使う。
"""

from .fields import DISPLAY_FIELDS, RECORD_KEY_FIELDS

LIKE_ESCAPE = "\\"


def quote_identifier(name):
    return '"' + str(name).replace('"', '""') + '"'


def escape_like(value):
    return (
        value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )


class QueryBuilder:
    def __init__(self, table_name, field_mappings):
        self.table = quote_identifier(table_name)
        self.columns = {name: quote_identifier(field_mappings[name]) for name in DISPLAY_FIELDS}
        self.select_list = ", ".join(f"{self.columns[name]} AS {quote_identifier(name)}" for name in DISPLAY_FIELDS)

    def _where(self, search_type, keyword, match_mode):
        column = self.columns[search_type]
        if match_mode == "exact":
            return f"{column} = ? COLLATE NOCASE", [keyword]
        return f"{column} LIKE ? ESCAPE '{LIKE_ESCAPE}'", [f"%{escape_like(keyword)}%"]

    def count(self, search_type, keyword, match_mode):
        where, params = self._where(search_type, keyword, match_mode)
        return f"SELECT COUNT(*) FROM {self.table} WHERE {where}", params

    def search(self, search_type, keyword, match_mode, sort_key, sort_order, limit, offset):
        where, params = self._where(search_type, keyword, match_mode)
        direction = "DESC" if sort_order == "desc" else "ASC"
        order_terms = [f"{self.columns[sort_key]} {direction}"]
        order_terms += [f"{self.columns[name]} ASC" for name in RECORD_KEY_FIELDS if name != sort_key]
        sql = (
            f"SELECT {self.select_list} FROM {self.table} WHERE {where} "
            f"ORDER BY {', '.join(order_terms)} LIMIT ? OFFSET ?"
        )
        return sql, params + [limit, offset]

    def detail(self, key_values):
        # IS は NULL 同士も一致とみなす（鋳造番号が空の行にも対応する）
        where = " AND ".join(f"{self.columns[name]} IS ?" for name in RECORD_KEY_FIELDS)
        sql = f"SELECT {self.select_list} FROM {self.table} WHERE {where} LIMIT 2"
        return sql, [key_values[name] for name in RECORD_KEY_FIELDS]
