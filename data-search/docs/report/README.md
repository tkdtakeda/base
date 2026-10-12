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
│  │  │  ├─ validation.py    … 検証
│  │  │  └─ local_writer.py  … 画面からの読み込み先の保存
│  │  ├─ column_catalog.py   … 表示する列を DB から読み取る
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
    "customerName": "<CUSTOMER_NAME_COLUMN>",
    "factoryDeliveryDate": "<FACTORY_DELIVERY_DATE_COLUMN>",
    "cfStatus": "<STATUS_COLUMN>",
    "manufacturingMaterial": "<MANUFACTURING_MATERIAL_COLUMN>",
    "manufacturingTemper": "<MANUFACTURING_TEMPER_COLUMN>",
    "remainingEquipmentCourse": "<REMAINING_EQUIPMENT_COURSE_COLUMN>",
    "lastActualEquipmentName": "<LAST_ACTUAL_EQUIPMENT_NAME_COLUMN>",
    "wipCategory": "<WIP_CATEGORY_COLUMN>",
    "holdCategory": "<HOLD_CATEGORY_COLUMN>"
  }
}
```

依頼者提供のファイルから、役割のある 14 列だけに絞った（ほかの列は DB から自動で読み取る）。1 件を特定する項目は `recordKey`（ロット番号＋BOX番号）。`types` は既定値 `{}`（日付の項目なし）で補う。

## 4. `config/sample/view.sample.json` の全文

`config/sample/view.sample.json`

```json
{
  "searchFields": [
    "lotNo",
    "boxNo",
    "inspectionNo",
    "castingNo",
    "orderNo",
    "customerName"
  ],
  "hiddenColumns": [],
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

表示名・表示順・詳細の項目は DB の列名・DB の順を使うため、依頼者提供のファイルから `listColumns`・`detailFields`・`detailGroups` を外し、`searchFields`（番号で探せる列）・`hiddenColumns`（最初は隠す列）・`filters`・`defaultSort` だけにした。

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

