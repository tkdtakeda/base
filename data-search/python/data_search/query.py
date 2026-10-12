"""論理条件から SQL を組み立てる。値は必ずパラメーターで渡し、文字列連結しない。

表名は設定ファイル、列名はキャッシュのテーブルから読み取った値だけを使う。
画面から受け取った列の名前は、列の決まり（column_model）と照合してから使う。
"""


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
    search  … None または (DB の列名, keyword, matchMode)
    filters … [(DB の列名, "values", [値 or None, ...]) / (DB の列名, "date", (from, to))]
              date の from / to は 'YYYY-MM-DD' か None（日付は呼び出し側で確定させる）
    """

    def __init__(self, table_name, model):
        """model：column_model.ColumnModel（列はすべてキャッシュのテーブルにある）"""
        self.model = model
        self.table = quote_identifier(table_name)
        self.ids = model.ids
        self.columns = {name: quote_identifier(name) for name in self.ids}
        self.select_list = ", ".join(self.columns[name] for name in self.ids)

    # ── 条件 ──
    def _search_condition(self, search):
        name, keyword, match_mode = search
        column = self.columns[name]
        if match_mode == "exact":
            return f"{column} = ? COLLATE NOCASE", [keyword]
        return f"{column} LIKE ? ESCAPE '{LIKE_ESCAPE}'", [f"%{escape_like(keyword)}%"]

    def _filter_condition(self, name, kind, data):
        column = self.columns[name]
        if kind == "values":
            parts, params = [], []
            values = [value for value in data if value is not None]
            if values:
                # 値は文字列で比べる（数値で入っている列でも、一覧に出した文字のまま選べるように）
                parts.append(f"CAST({column} AS TEXT) IN ({', '.join('?' for _ in values)})")
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

    def _where(self, search, filters, exclude=None, extra=None):
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
        if extra:
            parts.append(extra[0])
            params.extend(extra[1])
        return (" WHERE " + " AND ".join(parts)) if parts else "", params

    def _sort_expression(self, name):
        return date_expression(self.columns[name]) if self.model.kind_of(name) == "date" else self.columns[name]

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
        order_terms += [f"{self.columns[name]} ASC" for name in self.model.record_key if name != sort_key]
        sql = (
            f"SELECT {self.select_list} FROM {self.table}{where} "
            f"ORDER BY {', '.join(order_terms)} LIMIT ? OFFSET ?"
        )
        return sql, params + [limit, offset]

    def values(self, name, search, filters, limit, match=None):
        """項目の値の一覧と件数。自分自身の絞り込みは外して数える（選び直せるように）。
        match を渡すと、その文字を含む値だけ（値が多い列で、上位に出ない値を探すため）。"""
        column = self.columns[name]
        extra = None
        if match:
            extra = (f"CAST({column} AS TEXT) LIKE ? ESCAPE '{LIKE_ESCAPE}'", [f"%{escape_like(match)}%"])
        where, params = self._where(search, filters, exclude=name, extra=extra)
        value = f"CASE WHEN {blank_expression(column)} THEN NULL ELSE CAST({column} AS TEXT) END"
        sql = (
            f"SELECT {value} AS v, COUNT(*) AS c FROM {self.table}{where} "
            f"GROUP BY v ORDER BY c DESC, v ASC LIMIT ?"
        )
        return sql, params + [limit]

    def detail(self, key_values):
        # IS は NULL 同士も一致とみなす（鋳造番号が空の行にも対応する）
        where = " AND ".join(f"{self.columns[name]} IS ?" for name in self.model.record_key)
        sql = f"SELECT {self.select_list} FROM {self.table} WHERE {where} LIMIT 2"
        return sql, [key_values[name] for name in self.model.record_key]

    # ── 固定列の確認 ──
    def key_duplicates(self, names):
        """同じ値の組み合わせが 2 行以上ある組の数と、その行の合計。"""
        group = ", ".join(self.columns[name] for name in names)
        return (f"SELECT COUNT(*), COALESCE(SUM(c), 0) FROM "
                f"(SELECT COUNT(*) AS c FROM {self.table} GROUP BY {group} HAVING COUNT(*) > 1)"), []

    def key_duplicate_example(self, names):
        """重なっている組み合わせのうち、行がいちばん多いもの（例として見せる）。"""
        group = ", ".join(self.columns[name] for name in names)
        texts = ", ".join(f"CAST({self.columns[name]} AS TEXT)" for name in names)
        return (f"SELECT {texts}, COUNT(*) AS c FROM {self.table} GROUP BY {group} "
                f"HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 1"), []

    def key_blank_rows(self, names):
        """固定列がすべて空欄の行の数。"""
        where = " AND ".join(blank_expression(self.columns[name]) for name in names)
        return f"SELECT COUNT(*) FROM {self.table} WHERE {where}", []
