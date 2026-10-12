"""論理項目の定義。画面と API はここに書いた論理名だけを使う。"""

# 検索に使える論理項目（画面の「番号の種類」と同じ順）
SEARCHABLE_FIELDS = ("lotNo", "inspectionNo", "castingNo", "orderNo")

# 一覧・詳細に表示する論理項目
DISPLAY_FIELDS = (
    "lotNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "material",
    "temper",
    "size",
    "customer",
    "deliveryDate",
    "process",
    "equipment",
    "status",
)

# 1 件を特定する鍵（ロット番号＋鋳造番号）
RECORD_KEY_FIELDS = ("lotNo", "castingNo")

# 絞り込みに使える項目と、その種類
#   values … 値の一覧から選ぶ（複数可）
#   date   … 日付の範囲（今日を基準にした相対指定、または日付そのもの）
# 日付の項目を増やしたら、ここに "date" で足すだけで同じ絞り込みが使える。
FILTER_FIELDS = {
    "material": "values",
    "temper": "values",
    "customer": "values",
    "process": "values",
    "equipment": "values",
    "status": "values",
    "deliveryDate": "date",
}
DATE_FIELDS = tuple(name for name, kind in FILTER_FIELDS.items() if kind == "date")

FILTER_VALUES_MAX = 200      # 1 項目で選べる値の数の上限
FILTER_VALUE_LENGTH_MAX = 200
VALUE_LIST_LIMIT = 200       # 値の一覧として返す数の上限
RELATIVE_DAYS_MAX = 3650

DEFAULT_SORT_KEY = "deliveryDate"

MATCH_MODES = ("partial", "exact")
SORT_ORDERS = ("asc", "desc")

KEYWORD_MAX_LENGTH = 100
