# 設定ファイル・フォルダ構成の見直し：成果物一覧


## このフォルダのファイル

| ファイル | 内容 |
|---|---|
| README.md（このファイル） | 1〜8・13〜16 |
| 09-12_settings-and-startup.md | 9〜12：設定読込み・再帰マージ・検証・起動のコード全文 |
| 17_tests.md | 17：テストコード全文 |
| 18_readme.md | 18：README の全文 |
| appendix-backend-*.md | 付録：そのほかのバックエンド・ツール・設定の修正ファイル全文 |
| appendix-frontend-*.md | 付録：画面側の修正ファイル全文 |

依頼書「設定ファイルおよびフォルダ構成の見直し依頼」の 12 章（成果物 1〜18）に対応する。
コードと JSON は、このリポジトリの実ファイルから自動で書き写したもの（省略なし）。

## 1. 修正後のフォルダ構成

```text
data-search/
├─ config/
│  ├─ sample/                  … 外部提供可能（Git 管理対象）
│  │  ├─ config.sample.json
│  │  ├─ schema.sample.json
│  │  └─ view.sample.json
│  ├─ local/                   … 社内専用（フォルダごと Git 管理対象外・利用者が作る）
│  │  ├─ config.local.json
│  │  ├─ schema.local.json
│  │  └─ view.local.json
│  └─ dummy/                   … ダミーデータ用の上書き（自動生成・Git 管理対象外）
├─ docs/
│  ├─ config-design.md
│  └─ report/                   … 成果物一覧（このフォルダ）
├─ python/
│  ├─ run_server.py
│  ├─ data_search/
│  │  ├─ settings/
│  │  │  ├─ __init__.py
│  │  │  ├─ loader.py        … 読み込み順・組み立て
│  │  │  ├─ merge.py         … 再帰マージ・既定値の補完
│  │  │  ├─ defaults.py      … sample に書かない運用項目の既定値
│  │  │  └─ validation.py    … 検証
│  │  └─ （キャッシュ・検索・HTTP など）
│  ├─ tools/
│  │  ├─ make_dummy_db.py
│  │  └─ sync_sample_view.py
│  └─ tests/test_backend.py
├─ src/                         … 画面
├─ data/cache/                  … キャッシュ（Git 管理対象外）
├─ logs/                        … ログ（Git 管理対象外）
├─ .gitignore
├─ start.bat / start-dummy.bat
└─ README.md
```

## 2. `config/sample/config.sample.json` の全文

`config/sample/config.sample.json`

```json
{
  "application": {
    "id": "data-search",
    "name": "Data Search",
    "version": "0.1.0"
  },
  "dataSource": {
    "id": "target-data",
    "enabled": true,
    "sourcePath": "<SHARED_SQLITE_PATH>",
    "cachePath": "./data/cache/target-data.sqlite3",
    "readOnly": true
  },
  "search": {
    "defaultMatchMode": "partial",
    "pageSize": 100,
    "maxPageSize": 500
  },
  "logging": {
    "directory": "./logs",
    "level": "info"
  }
}
```

依頼者から提供されたファイルをそのまま採用。`cache`・`devServer` は書かれていないため、アプリ内の既定値（`settings/defaults.py`）で補う（local で上書き可）。

## 3. `config/sample/schema.sample.json` の全文

`config/sample/schema.sample.json`

```json
{
  "dataSourceId": "target-data",
  "tableName": "<TARGET_TABLE_NAME>",
  "recordKey": [
    "lotNo",
    "boxNo"
  ],
  "columns": {
    "lotNo": "<LOT_NO_COLUMN>",
    "boxNo": "<BOX_NO_COLUMN>",
    "inspectionNo": "<INSPECTION_NO_COLUMN>",
    "castingNo": "<CASTING_NO_COLUMN>",
    "orderNo": "<ORDER_NO_COLUMN>",
    "plannedEquipmentName": "<PLANNED_EQUIPMENT_NAME_COLUMN>",
    "businessUnitCode": "<BUSINESS_UNIT_CODE_COLUMN>",
    "demandFieldCode": "<DEMAND_FIELD_CODE_COLUMN>",
    "applicationCode": "<APPLICATION_CODE_COLUMN>",
    "applicationName": "<APPLICATION_NAME_COLUMN>",
    "orderMaterial": "<ORDER_MATERIAL_COLUMN>",
    "orderTemper": "<ORDER_TEMPER_COLUMN>",
    "orderThickness": "<ORDER_THICKNESS_COLUMN>",
    "orderWidth": "<ORDER_WIDTH_COLUMN>",
    "orderLength": "<ORDER_LENGTH_COLUMN>",
    "manufacturingMaterial": "<MANUFACTURING_MATERIAL_COLUMN>",
    "manufacturingTemper": "<MANUFACTURING_TEMPER_COLUMN>",
    "manufacturingThickness": "<MANUFACTURING_THICKNESS_COLUMN>",
    "manufacturingWidth": "<MANUFACTURING_WIDTH_COLUMN>",
    "manufacturingLength": "<MANUFACTURING_LENGTH_COLUMN>",
    "productUnitWeight": "<PRODUCT_UNIT_WEIGHT_COLUMN>",
    "specificGravity": "<SPECIFIC_GRAVITY_COLUMN>",
    "shape": "<SHAPE_COLUMN>",
    "surface": "<SURFACE_COLUMN>",
    "processing": "<PROCESSING_COLUMN>",
    "surfaceProcessing": "<SURFACE_PROCESSING_COLUMN>",
    "cleaning": "<CLEANING_COLUMN>",
    "deliverySpecificationNo": "<DELIVERY_SPECIFICATION_NO_COLUMN>",
    "wipCategory": "<WIP_CATEGORY_COLUMN>",
    "allocationCategory": "<ALLOCATION_CATEGORY_COLUMN>",
    "holdCategory": "<HOLD_CATEGORY_COLUMN>",
    "holdReleaseDate": "<HOLD_RELEASE_DATE_COLUMN>",
    "temporaryPackingFlag": "<TEMPORARY_PACKING_FLAG_COLUMN>",
    "urgentCategory": "<URGENT_CATEGORY_COLUMN>",
    "cfStatus": "<STATUS_COLUMN>",
    "allocationCode": "<ALLOCATION_CODE_COLUMN>",
    "allocationMethod": "<ALLOCATION_METHOD_COLUMN>",
    "allocationQuantity": "<ALLOCATION_QUANTITY_COLUMN>",
    "allocationAdjustmentNo": "<ALLOCATION_ADJUSTMENT_NO_COLUMN>",
    "salesDeliveryDate": "<SALES_DELIVERY_DATE_COLUMN>",
    "factoryDeliveryDate": "<FACTORY_DELIVERY_DATE_COLUMN>",
    "promisedDeliveryDate": "<PROMISED_DELIVERY_DATE_COLUMN>",
    "shippingDate": "<SHIPPING_DATE_COLUMN>",
    "wipRetentionTime": "<WIP_RETENTION_TIME_COLUMN>",
    "deliveryDestinationCode": "<DELIVERY_DESTINATION_CODE_COLUMN>",
    "customerCode": "<CUSTOMER_CODE_COLUMN>",
    "shippingDestinationCode": "<SHIPPING_DESTINATION_CODE_COLUMN>",
    "deliveryDestinationName": "<DELIVERY_DESTINATION_NAME_COLUMN>",
    "customerName": "<CUSTOMER_NAME_COLUMN>",
    "shippingDestinationName": "<SHIPPING_DESTINATION_NAME_COLUMN>",
    "districtCode": "<DISTRICT_CODE_COLUMN>",
    "salespersonCode": "<SALESPERSON_CODE_COLUMN>",
    "plannedEquipmentCourse": "<PLANNED_EQUIPMENT_COURSE_COLUMN>",
    "actualEquipmentCourse": "<ACTUAL_EQUIPMENT_COURSE_COLUMN>",
    "remainingEquipmentCourse": "<REMAINING_EQUIPMENT_COURSE_COLUMN>",
    "totalProcessCount": "<TOTAL_PROCESS_COUNT_COLUMN>",
    "pitPlannedDate": "<PIT_PLANNED_DATE_COLUMN>",
    "pitActualDate": "<PIT_ACTUAL_DATE_COLUMN>",
    "specialSpecification": "<SPECIAL_SPECIFICATION_COLUMN>",
    "masterNo": "<MASTER_NO_COLUMN>",
    "specificationNo": "<SPECIFICATION_NO_COLUMN>",
    "qualityNo": "<QUALITY_NO_COLUMN>",
    "manufacturingNo": "<MANUFACTURING_NO_COLUMN>",
    "testNo": "<TEST_NO_COLUMN>",
    "personInCharge": "<PERSON_IN_CHARGE_COLUMN>",
    "boxPlannedThickness": "<BOX_PLANNED_THICKNESS_COLUMN>",
    "boxPlannedWidth": "<BOX_PLANNED_WIDTH_COLUMN>",
    "boxPlannedLength": "<BOX_PLANNED_LENGTH_COLUMN>",
    "boxPlannedWorkPattern": "<BOX_PLANNED_WORK_PATTERN_COLUMN>",
    "boxPlannedWeight": "<BOX_PLANNED_WEIGHT_COLUMN>",
    "boxPlannedCount": "<BOX_PLANNED_COUNT_COLUMN>",
    "qualityCode": "<QUALITY_CODE_COLUMN>",
    "annealingScheduleCategory": "<ANNEALING_SCHEDULE_CATEGORY_COLUMN>",
    "annealingFurnaceNo": "<ANNEALING_FURNACE_NO_COLUMN>",
    "lastActualProcessBoxNo": "<LAST_ACTUAL_PROCESS_BOX_NO_COLUMN>",
    "lastActualEquipmentName": "<LAST_ACTUAL_EQUIPMENT_NAME_COLUMN>",
    "lastActualThickness": "<LAST_ACTUAL_THICKNESS_COLUMN>",
    "lastActualWidth": "<LAST_ACTUAL_WIDTH_COLUMN>",
    "lastActualLength": "<LAST_ACTUAL_LENGTH_COLUMN>",
    "lastActualGoodWeight": "<LAST_ACTUAL_GOOD_WEIGHT_COLUMN>",
    "lastActualCount": "<LAST_ACTUAL_COUNT_COLUMN>",
    "workStartDate": "<WORK_START_DATE_COLUMN>",
    "workEndDate": "<WORK_END_DATE_COLUMN>"
  }
}
```

依頼者から提供されたファイルをそのまま採用。1 件を特定する項目は `recordKey`（ロット番号＋BOX番号）。`types` は書かれていないため既定値 `{}`（日付の項目なし）で補う。

## 4. `config/sample/view.sample.json` の全文

`config/sample/view.sample.json`

```json
{
  "listColumns": [
    {
      "field": "lotNo",
      "label": "ロット番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "boxNo",
      "label": "BOX番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "inspectionNo",
      "label": "検査番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "castingNo",
      "label": "鋳造番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "orderNo",
      "label": "オーダー番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "manufacturingMaterial",
      "label": "製造材質",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingTemper",
      "label": "製造調質",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingThickness",
      "label": "製造板厚",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingWidth",
      "label": "製造板幅",
      "visible": true,
      "searchable": false
    },
    {
      "field": "manufacturingLength",
      "label": "製造板丈",
      "visible": true,
      "searchable": false
    },
    {
      "field": "customerName",
      "label": "取引先名",
      "visible": true,
      "searchable": true
    },
    {
      "field": "factoryDeliveryDate",
      "label": "工場納期",
      "visible": true,
      "searchable": false
    },
    {
      "field": "remainingEquipmentCourse",
      "label": "残仕掛設備コース",
      "visible": true,
      "searchable": false
    },
    {
      "field": "lastActualEquipmentName",
      "label": "最終実績設備",
      "visible": true,
      "searchable": false
    },
    {
      "field": "wipCategory",
      "label": "仕掛区分",
      "visible": true,
      "searchable": false
    },
    {
      "field": "holdCategory",
      "label": "保留区分",
      "visible": true,
      "searchable": false
    },
    {
      "field": "cfStatus",
      "label": "状態",
      "visible": true,
      "searchable": false
    }
  ],
  "detailGroups": [
    {
      "id": "identity",
      "label": "識別情報",
      "fields": [
        "lotNo",
        "boxNo",
        "inspectionNo",
        "castingNo",
        "orderNo"
      ]
    },
    {
      "id": "product",
      "label": "製品・製造仕様",
      "fields": [
        "orderMaterial",
        "orderTemper",
        "orderThickness",
        "orderWidth",
        "orderLength",
        "manufacturingMaterial",
        "manufacturingTemper",
        "manufacturingThickness",
        "manufacturingWidth",
        "manufacturingLength",
        "shape",
        "surface",
        "processing",
        "surfaceProcessing",
        "cleaning",
        "productUnitWeight",
        "specificGravity"
      ]
    },
    {
      "id": "trade",
      "label": "取引・納期",
      "fields": [
        "deliveryDestinationCode",
        "deliveryDestinationName",
        "customerCode",
        "customerName",
        "shippingDestinationCode",
        "shippingDestinationName",
        "salesDeliveryDate",
        "factoryDeliveryDate",
        "promisedDeliveryDate",
        "shippingDate",
        "districtCode",
        "salespersonCode"
      ]
    },
    {
      "id": "process",
      "label": "工程・設備",
      "fields": [
        "plannedEquipmentName",
        "plannedEquipmentCourse",
        "actualEquipmentCourse",
        "remainingEquipmentCourse",
        "totalProcessCount",
        "lastActualProcessBoxNo",
        "lastActualEquipmentName",
        "workStartDate",
        "workEndDate"
      ]
    },
    {
      "id": "wip",
      "label": "仕掛・引当",
      "fields": [
        "wipCategory",
        "allocationCategory",
        "allocationCode",
        "allocationMethod",
        "allocationQuantity",
        "allocationAdjustmentNo",
        "wipRetentionTime",
        "holdCategory",
        "holdReleaseDate",
        "temporaryPackingFlag",
        "urgentCategory",
        "cfStatus"
      ]
    },
    {
      "id": "box",
      "label": "BOX情報",
      "fields": [
        "boxPlannedThickness",
        "boxPlannedWidth",
        "boxPlannedLength",
        "boxPlannedWorkPattern",
        "boxPlannedWeight",
        "boxPlannedCount",
        "lastActualThickness",
        "lastActualWidth",
        "lastActualLength",
        "lastActualGoodWeight",
        "lastActualCount"
      ]
    },
    {
      "id": "quality",
      "label": "品質・仕様",
      "fields": [
        "qualityCode",
        "deliverySpecificationNo",
        "specialSpecification",
        "masterNo",
        "specificationNo",
        "qualityNo",
        "manufacturingNo",
        "testNo",
        "personInCharge"
      ]
    },
    {
      "id": "other",
      "label": "用途・管理情報",
      "fields": [
        "businessUnitCode",
        "demandFieldCode",
        "applicationCode",
        "applicationName",
        "pitPlannedDate",
        "pitActualDate",
        "annealingScheduleCategory",
        "annealingFurnaceNo"
      ]
    }
  ],
  "detailFields": [
    "lotNo",
    "boxNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "plannedEquipmentName",
    "businessUnitCode",
    "demandFieldCode",
    "applicationCode",
    "applicationName",
    "orderMaterial",
    "orderTemper",
    "orderThickness",
    "orderWidth",
    "orderLength",
    "manufacturingMaterial",
    "manufacturingTemper",
    "manufacturingThickness",
    "manufacturingWidth",
    "manufacturingLength",
    "productUnitWeight",
    "specificGravity",
    "shape",
    "surface",
    "processing",
    "surfaceProcessing",
    "cleaning",
    "deliverySpecificationNo",
    "wipCategory",
    "allocationCategory",
    "holdCategory",
    "holdReleaseDate",
    "temporaryPackingFlag",
    "urgentCategory",
    "cfStatus",
    "allocationCode",
    "allocationMethod",
    "allocationQuantity",
    "allocationAdjustmentNo",
    "salesDeliveryDate",
    "factoryDeliveryDate",
    "promisedDeliveryDate",
    "shippingDate",
    "wipRetentionTime",
    "deliveryDestinationCode",
    "customerCode",
    "shippingDestinationCode",
    "deliveryDestinationName",
    "customerName",
    "shippingDestinationName",
    "districtCode",
    "salespersonCode",
    "plannedEquipmentCourse",
    "actualEquipmentCourse",
    "remainingEquipmentCourse",
    "totalProcessCount",
    "pitPlannedDate",
    "pitActualDate",
    "specialSpecification",
    "masterNo",
    "specificationNo",
    "qualityNo",
    "manufacturingNo",
    "testNo",
    "personInCharge",
    "boxPlannedThickness",
    "boxPlannedWidth",
    "boxPlannedLength",
    "boxPlannedWorkPattern",
    "boxPlannedWeight",
    "boxPlannedCount",
    "qualityCode",
    "annealingScheduleCategory",
    "annealingFurnaceNo",
    "lastActualProcessBoxNo",
    "lastActualEquipmentName",
    "lastActualThickness",
    "lastActualWidth",
    "lastActualLength",
    "lastActualGoodWeight",
    "lastActualCount",
    "workStartDate",
    "workEndDate"
  ],
  "filters": [
    {
      "field": "manufacturingMaterial",
      "type": "values"
    },
    {
      "field": "manufacturingTemper",
      "type": "values"
    },
    {
      "field": "customerName",
      "type": "values"
    },
    {
      "field": "remainingEquipmentCourse",
      "type": "values"
    },
    {
      "field": "lastActualEquipmentName",
      "type": "values"
    },
    {
      "field": "wipCategory",
      "type": "values"
    },
    {
      "field": "holdCategory",
      "type": "values"
    },
    {
      "field": "cfStatus",
      "type": "values"
    }
  ],
  "defaultSort": {
    "field": "factoryDeliveryDate",
    "order": "asc"
  }
}
```

依頼者から提供されたファイルをそのまま採用。`detailGroups[].fields` で詳細のまとまりと並び順を決める。`fields`（項目ごとの表示名・値の札など）は書かれていないため既定値 `{}` で補い、表示名は listColumns の見出し、なければ論理名を使う。

## 5. `config/local/config.local.json` の安全な記入例

```json
{
  "application": {
    "id": "lot-search",
    "name": "Lot Search"
  },
  "dataSource": {
    "id": "work-in-progress",
    "sourcePath": "<実際の共有SQLiteのフルパスを設定>",
    "cachePath": "./data/cache/work.sqlite3"
  }
}
```

`dataSource.id` を変えるときは、`schema.local.json` の `dataSourceId` も同じ値にする（一致しないと検証で止まる）。書いていない項目（devServer など）はサンプルの値を使う。

## 6. `config/local/schema.local.json` の安全な記入例

```json
{
  "tableName": "<実際のテーブル名を設定>",
  "columns": {
    "lotNo": "<実際のロット番号列>",
    "boxNo": "<実際のBOX番号列>",
    "inspectionNo": "<実際の検査番号列>",
    "…": "（schema.sample.json の columns にある論理名すべて）"
  }
}
```

上の `<...>` は記入例であり、このまま置くと仮の値として検証で止まる（実際の値に置き換える）。

## 7. `config/local/view.local.json` の安全な記入例

```json
{
  "listColumns": [
    {
      "field": "lotNo",
      "label": "ロット番号",
      "visible": true,
      "searchable": true
    },
    {
      "field": "inspectionNo",
      "label": "検査番号",
      "visible": true,
      "searchable": true
    }
  ]
}
```

配列（listColumns）は丸ごと置き換わる。詳細・絞り込みの表示名は `fields.<項目>.label`（サンプル）が残るので、一覧の列を減らしても詳細の表示名は消えない。

## 8. `.gitignore` の全文

`.gitignore`

```gitignore
# 社内固有の設定（実際のパス・テーブル名・列名など）はフォルダごと管理しない
config/local/
# ダミーデータ用の上書き設定（make_dummy_db.py が作る）
config/dummy/

# データ・ログ・一時ファイル
data/
logs/
*.tmp
*.sqlite3-wal
*.sqlite3-shm
__pycache__/
*.pyc
```

