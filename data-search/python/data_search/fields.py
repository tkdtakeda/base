"""検索・絞り込みの決まり（上限値など）。

列の名前・探す列・絞り込みの種類・固定列は、ここには書かない。
設定（settings.ModelSettings）とキャッシュのテーブルの列から column_model.ColumnModel として組み立てる。
"""

FILTER_VALUES_MAX = 200      # 1 項目で選べる値の数の上限
FILTER_VALUE_LENGTH_MAX = 200
VALUE_LIST_LIMIT = 200       # 値の一覧として返す数の上限
RELATIVE_DAYS_MAX = 3650

MATCH_MODES = ("partial", "exact")
SORT_ORDERS = ("asc", "desc")

KEYWORD_MAX_LENGTH = 100
