# 設定ファイル・フォルダ構成の見直し：成果物一覧


## このフォルダのファイル

| ファイル | 内容 |
|---|---|
| README.md（このファイル） | 1〜8・13〜16 |
| 09-12_settings-and-startup.md | 9〜12：設定読込み・再帰マージ・検証・起動のコード全文 |
| 17_tests.md | 17：テストコード全文 |
| 18_readme.md | 18：README の全文 |
| appendix-backend.md | 付録：そのほかのバックエンド・ツール・設定の修正ファイル全文 |
| appendix-frontend-1.md / -2.md | 付録：画面側の修正ファイル全文 |

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
│  │  │  ├─ merge.py         … 再帰マージ
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
  "cache": {
    "temporaryExtension": ".tmp",
    "keepPreviousOnFailure": true
  },
  "search": {
    "defaultMatchMode": "partial",
    "pageSize": 100,
    "maxPageSize": 500
  },
  "logging": {
    "directory": "./logs",
    "level": "info"
  },
  "devServer": {
    "host": "127.0.0.1",
    "port": 8765,
    "openBrowser": true
  }
}
```

依頼書の例との違い：`dataSource.cachePath` を仮の値ではなく `./data/cache/target-data.sqlite3` にした。11 章で cachePath は「sample を基本とし、必要時のみ local で上書き」とされており、仮の値のままだと全環境で local への記入が必須になるため。社内情報は含まない。

## 3. `config/sample/schema.sample.json` の全文

`config/sample/schema.sample.json`

```json
{
  "dataSourceId": "target-data",
  "tableName": "<TARGET_TABLE_NAME>",
  "recordKey": ["lotNo", "castingNo"],
  "types": {
    "deliveryDate": "date"
  },
  "columns": {
    "lotNo": "<LOT_NUMBER_COLUMN>",
    "inspectionNo": "<INSPECTION_NUMBER_COLUMN>",
    "castingNo": "<CASTING_NUMBER_COLUMN>",
    "orderNo": "<ORDER_NUMBER_COLUMN>",
    "material": "<MATERIAL_COLUMN>",
    "temper": "<TEMPER_COLUMN>",
    "size": "<SIZE_COLUMN>",
    "customer": "<CUSTOMER_COLUMN>",
    "deliveryDate": "<DELIVERY_DATE_COLUMN>",
    "process": "<PROCESS_COLUMN>",
    "equipment": "<EQUIPMENT_COLUMN>",
    "status": "<STATUS_COLUMN>"
  }
}
```

依頼書の例への追加：`recordKey`（1 件を特定する論理項目）と `types`（日付として扱う論理項目）。どちらも以前はソースコードに固定していたもので、DB の論理構造に当たるため schema に置いた。

## 4. `config/sample/view.sample.json` の全文

`config/sample/view.sample.json`

```json
{
  "listColumns": [
    { "field": "lotNo", "label": "ロット番号", "visible": true, "searchable": true, "width": 170 },
    { "field": "inspectionNo", "label": "検査番号", "visible": true, "searchable": true, "width": 150 },
    { "field": "castingNo", "label": "鋳造番号", "visible": true, "searchable": true, "width": 150 },
    { "field": "orderNo", "label": "受注番号", "visible": true, "searchable": true, "width": 120 },
    { "field": "material", "label": "材質", "visible": true, "searchable": false, "width": 90 },
    { "field": "temper", "label": "質別", "visible": true, "searchable": false, "width": 70 },
    { "field": "size", "label": "寸法", "visible": true, "searchable": false, "width": 150 },
    { "field": "customer", "label": "得意先", "visible": true, "searchable": false, "width": 130 },
    { "field": "deliveryDate", "label": "納期", "visible": true, "searchable": false, "width": 110 },
    { "field": "process", "label": "工程", "visible": true, "searchable": false, "width": 100 },
    { "field": "equipment", "label": "設備", "visible": true, "searchable": false, "width": 90 },
    { "field": "status", "label": "状態", "visible": true, "searchable": false, "width": 110 }
  ],
  "detailFields": [
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
    "status"
  ],
  "detailGroups": [
    { "id": "id", "label": "識別番号", "icon": "fa-hashtag" },
    { "id": "product", "label": "製品", "icon": "fa-cube" },
    { "id": "trade", "label": "取引", "icon": "fa-handshake" },
    { "id": "mfg", "label": "製造", "icon": "fa-industry" }
  ],
  "fields": {
    "lotNo": { "label": "ロット番号", "short": "ロット", "group": "id", "mono": true, "copy": true, "example": "LOT-2026-00012" },
    "inspectionNo": { "label": "検査番号", "short": "検査", "group": "id", "mono": true, "copy": true, "example": "INS-26-000012" },
    "castingNo": { "label": "鋳造番号", "short": "鋳造", "group": "id", "mono": true, "copy": true, "example": "CST-41000012" },
    "orderNo": { "label": "受注番号", "short": "受注", "group": "id", "mono": true, "copy": true, "example": "ORD-00003" },
    "material": { "label": "材質", "group": "product" },
    "temper": { "label": "質別", "group": "product" },
    "size": { "label": "寸法", "group": "product", "mono": true },
    "customer": { "label": "得意先", "group": "trade" },
    "deliveryDate": { "label": "納期", "group": "trade", "mono": true },
    "process": { "label": "工程", "group": "mfg" },
    "equipment": { "label": "設備", "group": "mfg", "mono": true },
    "status": {
      "label": "状態",
      "group": "mfg",
      "badge": [
        { "match": "不適合|不良|NG|異常|廃棄", "tone": "danger" },
        { "match": "保留|停止|要確認|遅延", "tone": "warning" },
        { "match": "完了|済|合格|OK", "tone": "success" },
        { "match": "仕掛|待ち|中$|予定", "tone": "info" }
      ]
    }
  },
  "filters": [
    { "field": "material", "type": "values" },
    { "field": "temper", "type": "values" },
    { "field": "customer", "type": "values" },
    { "field": "deliveryDate", "type": "date" },
    { "field": "process", "type": "values" },
    { "field": "equipment", "type": "values" },
    { "field": "status", "type": "values" }
  ],
  "defaultSort": { "field": "deliveryDate", "order": "asc" }
}
```

依頼書の例への追加：`detailGroups`（詳細のまとまり）、`fields`（項目ごとの表示名・等幅・コピー・入力例・値の札）、`filters`（絞り込み）、`defaultSort`（既定の並べ替え）、`listColumns[].width`。いずれも以前はソースコードに固定していた表示定義で、既存機能を保つために移した。

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
  "dataSourceId": "work-in-progress",
  "tableName": "<実際のテーブル名を設定>",
  "columns": {
    "lotNo": "<実際のロット番号列>",
    "inspectionNo": "<実際の検査番号列>",
    "castingNo": "<実際の鋳造番号列>",
    "orderNo": "<実際のオーダー番号列>",
    "material": "<実際の材質列>",
    "temper": "<実際の調質列>",
    "size": "<実際の寸法列>",
    "customer": "<実際の顧客列>",
    "deliveryDate": "<実際の納期列>",
    "process": "<実際の工程列>",
    "equipment": "<実際の設備列>",
    "status": "<実際の状態列>"
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

