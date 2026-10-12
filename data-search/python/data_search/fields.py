"""検索・絞り込みの決まり（上限値など）。

論理項目の名前・検索できる項目・絞り込みの種類・1 件を特定する鍵は、ここには書かない。
config/sample の schema / view（とローカルの上書き）から settings.DataModel として組み立てる。
"""

FILTER_VALUES_MAX = 200      # 1 項目で選べる値の数の上限
FILTER_VALUE_LENGTH_MAX = 200
VALUE_LIST_LIMIT = 200       # 値の一覧として返す数の上限
RELATIVE_DAYS_MAX = 3650

MATCH_MODES = ("partial", "exact")
SORT_ORDERS = ("asc", "desc")

KEYWORD_MAX_LENGTH = 100
