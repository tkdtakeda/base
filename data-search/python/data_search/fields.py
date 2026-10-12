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

MATCH_MODES = ("partial", "exact")
SORT_ORDERS = ("asc", "desc")

KEYWORD_MAX_LENGTH = 100
