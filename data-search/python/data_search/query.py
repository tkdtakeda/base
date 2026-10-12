"""論理条件から SQL を組み立てる。値は必ずパラメーターで渡し、文字列連結しない。

表名・列名は設定ファイルから来る値だけを使い、画面から受け取った値は論理名の一覧と照合してから使う。
"""

from .fields import DATE_FIELDS, DISPLAY_FIELDS, RECORD_KEY_FIELDS

LIKE_ESCAPE = "\\"


def quote_identifier(name):
    return '"' + str(name).replace('"', '""') + '"'


def escape_like(value):
    return (
        value.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )


def date_expression(column):
    """日付の列を 'YYYY-MM-DD' にそろえる式。

    'YYYY-MM-DD…'・'YYYY/MM/DD…'・'YYYYMMDD'（文字・数値どちらも）に対応する。
    月日が 1 桁の書き方（2026/1/5 など）は対象外。
    """
    text = f"CAST({column} AS TEXT)"
    return (
        f"(CASE WHEN {text} GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]*' "
        f"THEN substr({text}, 1, 4) || '-' || substr({text}, 5, 2) || '-' || substr({text}, 7, 2) "
        f"ELSE replace(substr({text}, 1, 10), '/', '-') END)"
    )


def blank_expression(column):
    return f"({column} IS NULL OR TRIM(CAST({column} AS TEXT)) = '')"


class QueryBuilder:
    """
    search  … None または (searchType, keyword, matchMode)
    filters … [(論理名, "values", [値 or None, ...]) / (論理名, "date", (from, to))]
              date の from / to は 'YYYY-MM-DD' か None（日付は呼び出し側で確定させる）
    """

    def __init__(self, table_name, field_mappings):
        self.table = quote_identifier(table_name)
        self.columns = {name: quote_identifier(field_mappings[name]) for name in DISPLAY_FIELDS}
        self.select_list = ", ".join(f"{self.columns[name]} AS {quote_identifier(name)}" for name in DISPLAY_FIELDS)

    # ── 条件 ──
    def _search_condition(self, search):
        search_type, keyword, match_mode = search
        column = self.columns[search_type]
        if match_mode == "exact":
            return f"{column} = ? COLLATE NOCASE", [keyword]
        return f"{column} LIKE ? ESCAPE '{LIKE_ESCAPE}'", [f"%{escape_like(keyword)}%"]

    def _filter_condition(self, name, kind, data):
        column = self.columns[name]
        if kind == "values":
            parts, params = [], []
            values = [value for value in data if value is not None]
            if values:
                parts.append(f"{column} IN ({', '.join('?' for _ in values)})")
                params.extend(values)
            if any(value is None for value in data):
                parts.append(blank_expression(column))
            return "(" + " OR ".join(parts) + ")", params
        # date
        start, end = data
        expression = date_expression(column)
        parts, params = [f"NOT {blank_expression(column)}"], []
        if start:
            parts.append(f"{expression} >= ?")
            params.append(start)
        if end:
            parts.append(f"{expression} <= ?")
            params.append(end)
        return "(" + " AND ".join(parts) + ")", params

    def _where(self, search, filters, exclude=None):
        parts, params = [], []
        if search:
            sql, values = self._search_condition(search)
            parts.append(sql)
            params.extend(values)
        for name, kind, data in filters:
            if name == exclude:
                continue
            sql, values = self._filter_condition(name, kind, data)
            parts.append(sql)
            params.extend(values)
        return (" WHERE " + " AND ".join(parts)) if parts else "", params

    def _sort_expression(self, name):
        return date_expression(self.columns[name]) if name in DATE_FIELDS else self.columns[name]

    # ── 文 ──
    def count(self, search, filters):
        where, params = self._where(search, filters)
        return f"SELECT COUNT(*) FROM {self.table}{where}", params

    def rows(self, search, filters, sort_key, sort_order, limit, offset):
        where, params = self._where(search, filters)
        direction = "DESC" if sort_order == "desc" else "ASC"
        # 空欄は昇順・降順どちらでも最後に回す
        order_terms = [
            f"{blank_expression(self.columns[sort_key])} ASC",
            f"{self._sort_expression(sort_key)} {direction}",
        ]
        order_terms += [f"{self.columns[name]} ASC" for name in RECORD_KEY_FIELDS if name != sort_key]
        sql = (
            f"SELECT {self.select_list} FROM {self.table}{where} "
            f"ORDER BY {', '.join(order_terms)} LIMIT ? OFFSET ?"
        )
        return sql, params + [limit, offset]

    def values(self, name, search, filters, limit):
        """項目の値の一覧と件数。自分自身の絞り込みは外して数える（選び直せるように）。"""
        column = self.columns[name]
        where, params = self._where(search, filters, exclude=name)
        value = f"CASE WHEN {blank_expression(column)} THEN NULL ELSE CAST({column} AS TEXT) END"
        sql = (
            f"SELECT {value} AS v, COUNT(*) AS c FROM {self.table}{where} "
            f"GROUP BY v ORDER BY c DESC, v ASC LIMIT ?"
        )
        return sql, params + [limit]

    def detail(self, key_values):
        # IS は NULL 同士も一致とみなす（鋳造番号が空の行にも対応する）
        where = " AND ".join(f"{self.columns[name]} IS ?" for name in RECORD_KEY_FIELDS)
        sql = f"SELECT {self.select_list} FROM {self.table} WHERE {where} LIMIT 2"
        return sql, [key_values[name] for name in RECORD_KEY_FIELDS]
