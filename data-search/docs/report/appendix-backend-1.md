## 付録：バックエンド・ツール・設定の修正ファイルの全文（1/2）

`docs/config-design.md`

````markdown
# 設定ファイルの設計

対象コード：`python/data_search/settings/`（`loader.py`・`merge.py`・`validation.py`）と `python/run_server.py`。
Rust 版では `src-tauri/src/config/` に同じ決まりで移す。

## 1. 目的

- ハードコーディングを避ける（DB パス・テーブル名・列名・表示項目・表示順をソースコードに書かない）
- 環境設定（config）・DB 定義（schema）・画面表示定義（view）を分ける
- 外部提供できるファイル（`config/sample`）と社内専用ファイル（`config/local`）を**フォルダで**分ける
- サンプルを初期値とし、ローカルは必要な項目だけを上書きする（全項目を重複して書かない）

## 2. フォルダ構成

```text
data-search/config/
├─ sample/                  外部提供可能（Git 管理対象・外部 AI へ渡してよい・社内情報を含めない）
│  ├─ config.sample.json
│  ├─ schema.sample.json
│  └─ view.sample.json
├─ local/                   社内専用（フォルダごと Git 管理対象外・外部へ出さない・なくても起動まで進む）
│  ├─ config.local.json
│  ├─ schema.local.json
│  └─ view.local.json
└─ dummy/                   ダミーデータ用の上書き（make_dummy_db.py が作る・Git 管理対象外）
   ├─ config.local.json
   └─ schema.local.json
```

`.gitignore` で `config/local/` と `config/dummy/` をフォルダごと除外する（`.gitkeep` は置かない。誤って中身を追跡しないため）。

## 3. 各ファイルの責務

| ファイル | 持つもの | 持たないもの |
|---|---|---|
| `config.sample.json` | アプリ基本情報、データソースの有効/無効・識別子・読み取り専用、共有 SQLite パスの**プレースホルダー**、キャッシュのパスと動作、検索の初期値、ログ、開発用サーバー | テーブル名、列名、論理と物理の対応、表示項目・表示順 |
| `config.local.json` | 実際の共有 SQLite のパスなど、環境で変わる値だけ | テーブル名、列名（schema へ） |
| `schema.sample.json` | データソース識別子、テーブル名の**プレースホルダー**、固定列（`recordKey`）、番号で探す列（`searchColumn`。`null` なら recordKey の 1 つ目）、任意の別名（`columns`：論理名 → DB の列名の**プレースホルダー**） | 全列の一覧（DB から自動で読み取る）、表示名（DB の列名を使う）、絞り込める列（全列で絞り込める） |
| `schema.local.json` | 実際のテーブル名。固定列・探す列（**DB の列名で書ける**。画面の「データ」→「固定列」で選ぶと、ここに保存される）。種類（`types`）は自動の判定を変えたいときだけ | 全列の一覧 |
| `view.sample.json` | 最初は隠す列（`hiddenColumns`）、既定の並べ替え（`defaultSort`）。任意で列ごとの補助（`fields`：等幅・コピー・入力例・値の札） | 物理列名、表示名、表示順（DB の列名・DB の順を使う）、絞り込み（全列で使える） |
| `view.local.json` | 社内環境だけの変更（なくてよい）。隠す列を DB の列名で書くのはここ | — |

`recordKey`・`searchColumn`・`types` は依頼書に明記がなかったため、**DB の論理構造**として schema に置いた（「固定列（レコードキー＝行を 1 件に決める列）」「番号で探す列」「日付として比べる列」はデータの性質であり、表示の都合ではないため）。

列名が DB にあるかは、**キャッシュのテーブルを読んだあと**に `column_model.py` が照らし合わせる（起動時の検証では書き方だけを確かめる）。
DB にない名前があっても止めず、画面の「データ」パネルと起動時の黒いウィンドウに「列の注意」を出す。固定列がそろわないときは、画面で選び直すよう案内する（似た構成の別の DB も、設定ファイルを手で直さずに使えるようにするため）。

## 4. 起動時の読み込み順

1. `config/sample/config.sample.json` を読み込む
2. `config/local/config.local.json` があれば読み込む
3. ローカルをサンプルへ再帰マージする
4. `config/sample/schema.sample.json` を読み込む
5. `config/local/schema.local.json` があれば読み込む
6. ローカルをサンプルへ再帰マージする
7. `config/sample/view.sample.json` を読み込む
8. `config/local/view.local.json` があれば読み込む
9. ローカルをサンプルへマージする
10. マージ後の config・schema・view を検証する（誤りはすべて集めてから止める）
11. schema に従って共有 SQLite をコピーし、テーブルの存在を確かめてからキャッシュとして使う
12. キャッシュのテーブルの列を読み取り、値から日付の列を判定する（`column_catalog.py`）。設定と照らし合わせて列の決まり（並び・種類・固定列・探す列・注意）を作る（`column_model.py`）
13. 画面は最初に `get_view_config` で表示定義を受け取って組み立てる

`--local-dir` で `config/local` の代わりのフォルダを指定できる（ダミー用：`config/dummy`）。

## 5. マージ仕様（`settings/merge.py` の `deep_merge`）

| ローカル側の状態 | 結果 |
|---|---|
| キーがない | サンプルの値のまま（誤りにしない。例：`devServer` を書かなくてよい） |
| 両方がオブジェクト `{ }` | キーごとに再帰的に重ねる |
| 配列 `[ ]` | 要素ごとに重ねず、**配列全体を置き換える**（例：`schema.recordKey`・`view.hiddenColumns`） |
| 型がサンプルと違う | 使わず、型の誤りとして止める（サンプルの値が `null` なら何でも受け入れる。整数は数値の代わりに使える） |
| サンプルにないキー | **読み捨てない**。ファイル名と項目の道筋を示して「設定の注意」を出し、その値は使わない |
| サンプルにないキー（列を足せる場所） | `schema.types`・`view.fields` は新しいキー（DB の列名）を受け入れて使う |

- サンプル側のオブジェクトは変更しない（新しいオブジェクトを作る）。
- サンプルを読んだ直後に、アプリ内の既定値（`settings/defaults.py` の `BUILTIN_DEFAULTS`）でサンプルにないキーを補う（`fill_defaults`）。
  サンプルに書いてある値が常に優先。補ったキーはサンプルにあるのと同じ扱いになり、local で上書きしても注意は出ない。

| 補う既定値 | 値 |
|---|---|
| `config.cache` | `temporaryExtension: ".tmp"`・`keepPreviousOnFailure: true` |
| `config.devServer` | `host: "127.0.0.1"`・`port: 8765`・`openBrowser: true` |
| `schema.types` | `{}`（種類は値から判定。手動で決めた列だけ `"date"`・`"number"`・`"text"`） |
| `schema.columns` / `schema.searchColumn` | `{}`（別名なし） / `null`（recordKey の 1 つ目で探す） |
| `view.fields` / `view.hiddenColumns` | `{}` / `[]` |
- ローカルのファイルがないときは、空の上書き `{}` として扱う。

例（view）：

```jsonc
// schema.sample.json：recordKey ["lotNo", "boxNo"]・searchColumn null
// schema.local.json
{ "tableName": "T_LOT", "recordKey": ["LOT_NO"] }
// 結果：recordKey は 1 列だけ（配列は丸ごと置き換え）。searchColumn は null のまま（LOT_NO で探す）
```

## 6. 検証（`settings/validation.py`）

仮の値（`<...>` の形）の判定は役割ごとに行う。`config.local.json` にテーブル名や列名がないことは誤りにしない。

### 6.1 config

- 各 JSON が解析できる・同じキーが重複していない・全体がオブジェクト
- `dataSource.sourcePath`・`cachePath` が仮の値でも空でもない（**接続先のパスは config で確かめる**）
- `dataSource.enabled` が true、`readOnly` が true
- `search.pageSize`・`maxPageSize` が正の整数で、`pageSize ≤ maxPageSize`
- `devServer.port` が 1〜65535、`devServer.host` が 127.0.0.1 か localhost
- `logging.level`・`search.defaultMatchMode`・`cache.temporaryExtension` の値

### 6.2 schema

- `tableName` が空でも仮の値でもない（**テーブル名・列名は schema で確かめる**）
- `recordKey` が 1〜3 個の空でない名前で、重複していない。`searchColumn` は `null` か空でない名前
- `columns`（別名）は任意。値が文字列でないときだけ誤り。仮の値のままの別名は使わない（誤りにしない）
- 同じキーが重複していない（JSON の読み込み時に検出）
- `dataSourceId` が config の `dataSource.id` と同じ（別のデータソースの設定を組み合わせないため）
- `types` は型が date / number / text
- 名前が DB にあるかは、ここでは確かめない（キャッシュを読んだあと `column_model.py` が照らし合わせ、ない名前は止めずに「列の注意」で知らせる）
- 接続後（キャッシュ作成時）に確かめるのはテーブルがあることだけ（`cache_validator.py`）。列はそのとき読み取る（`column_catalog.py`）
- 以前の形で全列を書いた `columns` は、サンプルにない分を「使っていない」と 1 件の注意にまとめる（止めない）

### 6.3 view

- `defaultSort.order` が asc / desc。`field` は空でない名前（DB にない名前なら、固定列の順に並べて「列の注意」を出す）
- `hiddenColumns` は空でない文字列（DB の列名か別名。DB にない名前は無視）
- `fields.<列>` の `mono`・`copy` が真偽値、`badge` のパターンと色が正しい。`label`・`group` は「今は使わない」と注意
- 以前の形の `searchFields`・`filters`・`listColumns`・`detailFields`・`detailGroups` は「今は使わない項目」と注意（止めない）

### 6.4 列の注意（キャッシュを読んだあと。`column_model.py`）

| 食い違い | 動き |
|---|---|
| 固定列が DB にない | 固定列を空にする（一部の列だけでは 1 件に決まらないため）。一覧・絞り込みは使える。1 つ目の列があれば番号でも探せる。画面は「固定列を選ぶ」へ案内 |
| 番号で探す列が DB にない | 固定列の 1 つ目で探す |
| 並べ替え・種類の指定の列が DB にない | その指定を使わない |

### 6.5 誤りの表示

誤りはすべて集め、1 件ごとに次の形で表示して止まる（注意は止めずに表示する）。

```text
[設定エラー]
対象: config/local/schema.local.json
項目: recordKey
理由: 固定列が 4 個あります。
対応: 3 個までにしてください。
```

- 「対象」は、その値を直すべきファイル。仮の値が残っているときは、サンプルではなく**ローカルのファイル**を示す（サンプルに実際の値を書かせないため）。
- ローカルのファイルがないこと自体は誤りにしない。公開サンプルだけでも検証まで進み、ローカルに書くべき項目をファイル名つきで示して止まる。

## 7. 起動フロー

```mermaid
flowchart TD
    S[起動] --> C1[config.sample.json を読む<br/>アプリ内の既定値で不足を補う]
    C1 --> C2{config/local/config.local.json がある?}
    C2 -- ある --> C3[読み込んで再帰マージ]
    C2 -- ない --> C4[サンプルのまま]
    C3 --> D1
    C4 --> D1[schema.sample.json を読む]
    D1 --> D2{schema.local.json がある?}
    D2 -- ある --> D3[読み込んで再帰マージ]
    D2 -- ない --> D4[サンプルのまま]
    D3 --> V1
    D4 --> V1[view.sample.json を読む]
    V1 --> V2{view.local.json がある?}
    V2 -- ある --> V3[読み込んでマージ<br/>配列は丸ごと置き換え]
    V2 -- ない --> V4[サンプルのまま]
    V3 --> K
    V4 --> K[config → schema → view の順に検証<br/>誤りと注意をすべて集める]
    K --> E{誤りがある?}
    E -- ある --> X[対象・項目・理由・対応をすべて表示して停止]
    E -- ない --> W[注意があれば表示して続ける]
    W --> Q{キャッシュがある?}
    Q -- ない --> R[共有 SQLite をコピー → テーブルを確認 → キャッシュに置換]
    Q -- ある --> M{今の読み込み先・テーブル名と合う?}
    M -- 合わない --> R
    M -- 合う --> L
    R --> L[列を読み取り、日付の列を判定<br/>設定と照らし合わせて列の決まりを作る]
    L --> N{列の注意がある?}
    N -- ある --> NW[表示して続ける<br/>固定列がなければ画面で選ぶよう案内]
    N -- ない --> U
    NW --> U[画面を開く]
    U --> G[画面：get_view_config で表示定義を受け取り、一覧・詳細・検索・絞り込みを組み立てる]
```

文字だけで見る場合：

```text
起動
 ├─ config：sample を読む → local があれば再帰マージ
 ├─ schema：sample を読む → local があれば再帰マージ
 ├─ view  ：sample を読む → local があればマージ（配列は丸ごと置き換え）
 ├─ 検証（config → schema → view）
 │    ├─ 誤りあり → 対象・項目・理由・対応をすべて表示して停止
 │    └─ 注意あり → 表示して続ける（未知のキーなど）
 ├─ キャッシュがない／今の読み込み先・テーブル名と合わない → 作る（コピー → テーブルの確認 → 置換）
 │    └─ 作れなければ古いキャッシュは使わず、画面で「データを更新してください」と示す
 ├─ 列を読み取り、日付の列を判定 → 設定と照らし合わせて列の決まりを作る
 │    └─ 食い違いは「列の注意」として表示して続ける（固定列がなければ画面で選ぶ）
 └─ 画面：表示定義を受け取って組み立てる
```

## 8. 旧構成からの移行

| 旧（`config/config.local.json`） | 新 |
|---|---|
| `application` | `config/local/config.local.json`（変える項目だけ） |
| `dataSource.id` | `config/local/config.local.json`（変えるときは `schema.local.json` の `dataSourceId` も同じ値に） |
| `dataSource.enabled` | 基本はサンプル。必要なときだけ `config.local.json` |
| `dataSource.sourcePath` | `config/local/config.local.json` |
| `dataSource.cachePath` | 基本はサンプル（`./data/cache/target-data.sqlite3`）。必要なときだけ `config.local.json` |
| `dataSource.tableName` | `config/local/schema.local.json` の `tableName` |
| `dataSource.readOnly` | 基本はサンプル |
| `fieldMappings` | 不要（列名は DB と同じでよい）。固定列は `config/local/schema.local.json` の `recordKey` に DB の列名で書くか、画面で選ぶ。論理名で書きたいときだけ `columns`（別名） |
| `cache` / `search` / `logging` / `devServer` | 基本はサンプル。必要なときだけ `config.local.json` |
| （ソースコード内の表示名・表示順・検索対象・絞り込み・状態の色分け・既定の並べ替え） | 表示名・表示順は DB のまま。検索対象は `schema.searchColumn`。絞り込みは全列。色分け・既定の並べ替えは `config/sample/view.sample.json`（社内だけの変更は `view.local.json`） |
| （ソースコード内の 1 件を特定する項目・日付の項目） | `schema` の `recordKey`（画面でも選べる）。日付の列は値から判定（変えたいときだけ `types`） |

旧 `config.local.json` の `dataSource.tableName` や `fieldMappings` を新しい `config.local.json` にそのまま残すと、
サンプルにないキーとして「設定の注意」が出る（使われない）。`schema.local.json` へ移すこと。

## 9. 列と表示名（column_catalog.py・column_model.py）

- 列は、キャッシュのテーブルから読み取る（`PRAGMA table_info`）。設定には役割（固定列・探す列など）だけを書く。
- **列の id も表示名も DB の列名そのもの**（詳細・一覧の見出し・絞り込み・タグ・保存した表示の設定で共通）。表示名の設定はない。
- 設定の名前の読み替え：DB に同じ名前の列があればその列、なければ別名（`schema.columns`）として DB の列名に読み替える。どちらもなければ使わない。
- 種類（日付・数値・文字列）：手動の指定（`schema.types`。画面の見出しの小窓の「種類」で選ぶと `update_column_type` で保存）が優先。指定がなければ値から判定する（自動）。
  - 日付：空でない値がすべて `YYYY-MM-DD…`・`YYYY/MM/DD…`・`YYYYMMDD`（月・日の 1 桁目まで見て番号との取り違えを減らす）
  - 数値：空でない値がすべて数値（桁区切りのカンマ可）。先頭が 0 の番号（`007`）がある列は数値にしない
  - 固定列・探す列は自動では文字列。判定はキャッシュを作り直したときに 1 回だけ、表を列のまとまりごとに 1 回ずつ読んで行う
  - 数値の読み方・文字の条件は SQLite に足した関数（`sql_functions.py`：`ds_number`・`ds_auto_number`・`ds_text`）で行い、画面のサンプルのモード（`js/domain/filters.js`）も同じ決まりにする
- 並び：固定列 → 番号で探す列 → 別名のある列（`schema.columns` の順）→ ほかの列（DB の順）。
- `get_view_config` は列の一覧（`columns`）・固定列・探す列・別名・列の注意と、並びの印（`columnsVersion`）を返す。データの更新や固定列の変更で印が変わると、画面は読み込み直す。
- 画面は、以前の形（論理名）で保存したタグ・表示列・列幅・入力の履歴を、別名を使って DB の列名に読み替える。
- テーブル名と読み込み先のパスは画面に渡さない。DB の列名は表示名として画面に渡す（ログには残さない）。

## 9.1 画面からの書き込み（読み込み先・固定列）

- 画面から書き換えるのは次の 3 つだけ。sample は書き換えない。
  - `config.local.json` の `dataSource.sourcePath`（`update_data_source`）。接続テスト（`source_check.py`）で × がないときだけ書き込む（△＝固定列がない、は保存してから選び直せる）。
  - `schema.local.json` の `recordKey`・`searchColumn`（`update_record_settings`）。DB にある列だけ。DB の列名で書く。探す列が固定列の 1 つ目と同じなら `null`。
  - `schema.local.json` の `types.<DB の列名>`（`update_column_type`）。「自動」はその列の指定を消す（別名で書いた同じ列の指定も消す）。
- ほかのキーは残し、書き換え前を `.bak` に残し、一時ファイル → 置き換えで書く（`settings/local_writer.py`）。
- 書き込み後に `load_settings` で読み直して検証し、誤りがあれば `.bak` に戻す。問題がなければ動いている設定を差し替える（`settings_updater.py`。読み込み先とで共通）。
- キャッシュの状態ファイルに読み込み先の印（パスのハッシュ）を残し、前の読み込み先のキャッシュは使わない。

## 10. 設定項目を足すときの手順

1. `config/sample/` の該当ファイルにキーを足す（社内情報でない既定値、または `<...>` の仮の値）
2. `settings/loader.py` で受け取り、`settings/validation.py` で値を確かめる
3. view / schema を変えたら `python python/tools/sync_sample_view.py`（画面だけで試すモード用の表示定義を作り直す）
4. 社内の値が必要な環境だけ、`config/local/` の該当ファイルに書き足す（不要なら何もしない）
````

`python/data_search/__init__.py`

```python
"""対象データ検索ツールの Python 版バックエンド（試用・検証用）。

Rust/Tauri 版へ移植しやすいよう、モジュール構成を src-tauri/src の構成に合わせている。

    settings/       ↔ config/（loader.rs・merge.rs・validation.rs）
    settings_updater↔ config/updater.rs
    fields          ↔ models/lot.rs
    column_catalog  ↔ models/catalog.rs（DB の列と、値から見た種類）
    column_model    ↔ models/column_model.rs（設定と DB の列から、列の決まりを作る）
    cache_copier    ↔ cache/copier.rs
    cache_validator ↔ cache/validator.rs
    cache_service   ↔ cache/mod.rs
    query           ↔ db/query.rs
    lot_service     ↔ services/lot_service.rs
    source_service  ↔ services/source_service.rs
    record_service  ↔ services/record_service.rs
    type_service    ↔ services/type_service.rs
    sql_functions   ↔ db/functions.rs（SQLite に足す関数：数値・文字の条件）
    commands        ↔ commands/*.rs
    errors          ↔ errors/mod.rs
    logging_setup   ↔ logging/mod.rs
"""
```

`python/data_search/cache_copier.py`

```python
"""共有 SQLite を一時ファイルへコピーする。共有側には書き込まない。"""

import os
import shutil
import sqlite3

from .errors import AppError

SIDE_FILE_SUFFIXES = ("-wal",)


def source_modified_at(source_path):
    """共有データの更新時刻（UNIX 秒）。接続できなければ None。"""
    try:
        return os.stat(source_path).st_mtime
    except OSError:
        return None


def remove_quietly(path):
    for target in (path, path + "-wal", path + "-shm", path + "-journal"):
        try:
            os.remove(target)
        except FileNotFoundError:
            pass
        except OSError:
            pass


def copy_to_temp(source_path, temp_path):
    """共有データを temp_path へコピーし、コピー開始時の共有データの更新時刻を返す。

    コピー中に共有データが更新された場合は、中途半端な状態を避けるため失敗とする。
    """
    before = source_modified_at(source_path)
    if before is None or not os.path.isfile(source_path):
        raise AppError("SOURCE_UNAVAILABLE", "source not reachable")  # パスはログに残さない

    os.makedirs(os.path.dirname(temp_path) or ".", exist_ok=True)
    remove_quietly(temp_path)
    try:
        shutil.copyfile(source_path, temp_path)
        for suffix in SIDE_FILE_SUFFIXES:
            if os.path.isfile(source_path + suffix):
                shutil.copyfile(source_path + suffix, temp_path + suffix)
    except OSError as exc:
        remove_quietly(temp_path)
        raise AppError("CACHE_COPY_FAILED", f"copy failed: {type(exc).__name__} errno={exc.errno}") from exc

    if source_modified_at(source_path) != before:
        remove_quietly(temp_path)
        raise AppError("SOURCE_BUSY", "source modified during copy")

    _merge_wal(temp_path)
    return before


def _merge_wal(temp_path):
    """WAL を一緒にコピーした場合は一時ファイルへ取り込み、キャッシュを 1 ファイルにする。"""
    if not os.path.isfile(temp_path + "-wal"):
        return
    try:
        conn = sqlite3.connect(temp_path)
        try:
            conn.execute("PRAGMA journal_mode=DELETE")
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        # 壊れている場合は検証で弾く
        pass
```

`python/data_search/cache_service.py`

```python
"""ローカルキャッシュの更新と状態管理。

更新の流れ：共有データ → 一時ファイルへコピー → 検証 → 問題がなければ置換。
失敗したときは直前の正常なキャッシュを使い続ける。
"""

import hashlib
import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime

from . import cache_copier
from .column_catalog import catalog_from_file
from .cache_validator import open_readonly, validate_cache_file
from .errors import AppError


def source_id(path):
    """読み込み先を見分ける印（パスそのものは状態ファイルに残さない）。"""
    return hashlib.sha256(os.path.normcase(os.path.abspath(path)).encode("utf-8")).hexdigest()[:16]


def to_iso(timestamp):
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp).astimezone().isoformat(timespec="seconds")


class CacheService:
    def __init__(self, config, logger):
        self.config = config
        self.logger = logger
        self.cache_path = config.cache_path
        self.temp_path = config.cache_path + config.temporary_extension
        self.state_path = config.cache_path + ".status.json"
        # 置換中に検索が走らないよう、更新と読み取りを 1 本の鍵で順番にする
        self.lock = threading.RLock()
        # 今の設定（読み込み先・テーブル名）と合わないキャッシュは使わない
        self.stale = False
        self._catalog = None  # DB の列の一覧（キャッシュから読み取る。キャッシュが変わったら作り直す）

    # ── 列の一覧 ──
    def catalog(self):
        """DB の列（column_catalog.DbColumn の並び）。キャッシュがなければ空。"""
        with self.lock:
            if not self.cache_available():
                return ()
            if self._catalog is None:
                self._catalog = catalog_from_file(open_readonly, self.cache_path, self.config.table_name)
                self.logger.info("column catalog columns=%d dates=%d", len(self._catalog),
                                 sum(1 for column in self._catalog if column.looks_date))  # 列名は残さない
            return self._catalog

    # ── 状態の読み書き ──
    def _read_state(self):
        try:
            with open(self.state_path, encoding="utf-8") as fp:
                return json.load(fp)
        except (OSError, ValueError):
            return {}

    def _write_state(self, state):
        os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
        temp = self.state_path + ".writing"
        with open(temp, "w", encoding="utf-8") as fp:
            json.dump(state, fp, ensure_ascii=False, indent=2)
        os.replace(temp, self.state_path)

    def use_config(self, config):
        """読み込み先の変更などで設定を差し替える。前の読み込み先から作ったキャッシュは使わない。"""
        with self.lock:
            # 列の一覧は読み込み先とテーブル名だけで決まる（固定列の変更では読み直さない）
            if (config.source_path, config.table_name) != (self.config.source_path, self.config.table_name):
                self._catalog = None
            self.config = config
            if not self._same_source():
                self.stale = True

    def _same_source(self):
        recorded = self._read_state().get("sourceId")
        # 印がない（この仕組みより前に作った）キャッシュは、今の読み込み先のものとみなす
        return recorded is None or recorded == source_id(self.config.source_path)

    def cache_available(self):
        return os.path.isfile(self.cache_path) and not self.stale

    def verify_existing(self):
        """手元のキャッシュが今の設定（読み込み先・テーブル名）と合うかを確かめる（起動時）。合わなければ使わない印を付けて False。"""
        if not os.path.isfile(self.cache_path):
            return False
        if not self._same_source():
            self.stale = True
            self.logger.warning("existing cache was built from another source")
            return False
        try:
            validate_cache_file(self.cache_path, self.config.table_name)
            self.stale = False
            return True
        except AppError as error:
            self.stale = True
            self.logger.warning("existing cache does not match schema code=%s detail=%s", error.code, error.detail)
            return False

    # ── 更新 ──
    def refresh(self):
        with self.lock:
            self.logger.info("cache refresh started")
            state = self._read_state()
            try:
                source_mtime = cache_copier.copy_to_temp(self.config.source_path, self.temp_path)
                row_count = validate_cache_file(self.temp_path, self.config.table_name)
                os.makedirs(os.path.dirname(self.cache_path) or ".", exist_ok=True)
                os.replace(self.temp_path, self.cache_path)
                self.stale = False
                self._catalog = None
            except AppError as error:
                cache_copier.remove_quietly(self.temp_path)
                using_previous = self.cache_available()
                self.logger.warning(
                    "cache refresh failed code=%s detail=%s using_previous=%s",
                    error.code, error.detail, using_previous,
                )
                state.update({
                    "lastRefreshSucceeded": False,
                    "lastRefreshAt": to_iso(datetime.now().timestamp()),
                    "usingPreviousCache": using_previous,
                    "errorCode": error.code,
                    "errorMessage": error.user_message,
                })
                self._write_state(state)
                raise
            except OSError as exc:
                cache_copier.remove_quietly(self.temp_path)
                raise AppError("CACHE_COPY_FAILED", f"replace failed: {type(exc).__name__} errno={exc.errno}") from exc

            now = datetime.now().timestamp()
            state = {
                "lastRefreshSucceeded": True,
                "lastRefreshAt": to_iso(now),
                "sourceModifiedAt": to_iso(source_mtime),
                "sourceModifiedTs": source_mtime,
                "cacheUpdatedAt": to_iso(now),
                "usingPreviousCache": False,
                "rowCount": row_count,
                "sourceId": source_id(self.config.source_path),
                "errorCode": None,
                "errorMessage": None,
            }
            self._write_state(state)
            self.logger.info("cache refresh succeeded rows=%s", row_count)
            return {
                "success": True,
                "sourceModifiedAt": state["sourceModifiedAt"],
                "cacheUpdatedAt": state["cacheUpdatedAt"],
                "usingPreviousCache": False,
                "rowCount": row_count,
                "message": "キャッシュを更新しました。",
            }

    # ── 状態 ──
    def status(self):
        # 設定の注意（未知のキーなど）は画面の「データ」パネルにも出す。値は含めない
        config_info = {
            "settingsWarnings": [
                {"file": w.file, "path": w.path, "reason": w.reason, "action": w.action} for w in self.config.warnings
            ],
        }
        state = self._read_state()
        available = self.cache_available()
        current_source = cache_copier.source_modified_at(self.config.source_path)
        cached_source = state.get("sourceModifiedTs")
        has_update = bool(available and current_source and cached_source and current_source > cached_source)
        succeeded = state.get("lastRefreshSucceeded", available)

        if not available and self.stale:
            message = ("手元のキャッシュは前の読み込み先から作ったため使っていません。データを更新してください。"
                       if not self._same_source() else
                       "手元のキャッシュが今の設定（テーブル名）と合わないため使っていません。データを更新してください。")
        elif not available:
            message = "検索できるデータがまだありません。データを更新してください。"
        elif not succeeded:
            message = "最新のデータを取得できなかったため、前回のデータを参照しています。"
        elif has_update:
            message = "共有データに新しい更新があります。必要に応じてデータを更新してください。"
        else:
            message = "最新のキャッシュを参照しています。"

        return dict(config_info, **{
            "available": available,
            "lastRefreshSucceeded": bool(succeeded),
            "sourceModifiedAt": state.get("sourceModifiedAt"),
            "cacheUpdatedAt": state.get("cacheUpdatedAt"),
            "usingPreviousCache": bool(available and not succeeded),
            "message": message,
            "rowCount": state.get("rowCount"),
            "sourceReachable": current_source is not None,
            "sourceHasUpdate": has_update,
            "lastRefreshAt": state.get("lastRefreshAt"),
            "errorCode": None if succeeded else state.get("errorCode"),
            "errorMessage": None if succeeded else state.get("errorMessage"),
        })

    # ── 読み取り ──
    @contextmanager
    def read_connection(self):
        with self.lock:
            if not self.cache_available():
                raise AppError("CACHE_UNAVAILABLE", "cache file not found")
            try:
                conn = open_readonly(self.cache_path)
            except sqlite3.Error as exc:
                raise AppError("CACHE_UNAVAILABLE", f"cannot open cache: {exc}") from exc
            try:
                yield conn
            finally:
                conn.close()
```

`python/data_search/column_catalog.py`

```python
"""DB のテーブルから読み取る列の一覧（カタログ）。設定に関係なく、DB の事実だけを持つ。

    name         … DB の列名（そのまま画面の列の id・見出しになる）
    looks_date   … 空でない値がすべて日付の書き方か（YYYY-MM-DD… / YYYY/MM/DD… / YYYYMMDD）
    looks_number … 空でない値がすべて数値か（桁区切りのカンマ可。先頭が 0 の番号があれば False。sql_functions.looks_number）
                   どちらも、1 つでも当てはまらない値があれば、または値がすべて空なら False
並びは DB の順。どの列に役割（1 件を決める・番号で探す）を持たせるかは、column_model.py が設定から決める。
"""

import sqlite3
from dataclasses import dataclass

from .query import blank_expression, quote_identifier

# 月・日の 1 桁目まで見て、ただの数字の並び（番号など）を日付と取り違えにくくする
DATE_GLOBS = (
    "[12][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]*",
    "[12][0-9][0-9][0-9]/[01][0-9]/[0-3][0-9]*",
)
COMPACT_DATE_GLOB = "[12][0-9][0-9][0-9][01][0-9][0-3][0-9]"
DETECT_CHUNK = 200  # 1 つの SQL で調べる列の数（1 列につき 3 つ。SQLite の結果列数の上限より十分小さく）


@dataclass(frozen=True)
class DbColumn:
    name: str
    looks_date: bool = False
    looks_number: bool = False


def _date_test(column):
    text = f"CAST({column} AS TEXT)"
    parts = [f"{text} GLOB '{pattern}'" for pattern in DATE_GLOBS]
    parts.append(f"(length({text}) = 8 AND {text} GLOB '{COMPACT_DATE_GLOB}')")
    return "(" + " OR ".join(parts) + ")"


def detect_kinds(conn, table_name, names):
    """値から見た種類：(日付の列の名前, 数値の列の名前) を返す（表を列のまとまりごとに 1 回ずつ読む）。
    接続には sql_functions.register で関数を足しておくこと。"""
    dates, numbers = set(), set()
    table = quote_identifier(table_name)
    for start in range(0, len(names), DETECT_CHUNK):
        chunk = names[start:start + DETECT_CHUNK]
        terms = []
        for name in chunk:
            column = quote_identifier(name)
            filled = f"NOT {blank_expression(column)}"
            terms.append(f"SUM(CASE WHEN {filled} THEN 1 ELSE 0 END)")
            terms.append(f"SUM(CASE WHEN {filled} AND NOT {_date_test(column)} THEN 1 ELSE 0 END)")
            terms.append(f"SUM(CASE WHEN {filled} AND ds_auto_number({column}) = 0 THEN 1 ELSE 0 END)")
        row = conn.execute(f"SELECT {', '.join(terms)} FROM {table}").fetchone()
        for index, name in enumerate(chunk):
            filled, not_date, not_number = (row[index * 3 + offset] or 0 for offset in range(3))
            if filled and not not_date:
                dates.add(name)
            elif filled and not not_number:
                numbers.add(name)
    return dates, numbers


def read_table_columns(conn, table_name):
    return [row[1] for row in conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})")]


def read_catalog(conn, table_name):
    names = read_table_columns(conn, table_name)
    dates, numbers = detect_kinds(conn, table_name, names) if names else (set(), set())
    return tuple(DbColumn(name, name in dates, name in numbers) for name in names)


def catalog_from_file(open_connection, path, table_name):
    """キャッシュのファイルから作る。読めなければ空（画面は「データを更新してください」と出す）。"""
    try:
        conn = open_connection(path)
        try:
            return read_catalog(conn, table_name)
        finally:
            conn.close()
    except sqlite3.Error:
        return ()
```

`python/data_search/commands.py`

```python
"""Tauri Command と同じ名前・同じ入出力の命令を登録する。

命令を増やすときは @command("名前") を付けた関数を足すだけでよい（既存の処理は変えない）。
"""

from .errors import AppError

_REGISTRY = {}


def command(name):
    def decorator(func):
        _REGISTRY[name] = func
        return func
    return decorator


def command_names():
    return sorted(_REGISTRY)


def dispatch(name, context, payload):
    handler = _REGISTRY.get(name)
    if handler is None:
        raise AppError("UNKNOWN_COMMAND", f"unknown command: {name}")
    return handler(context, payload)


@command("search_lots")
def search_lots(ctx, payload):
    return ctx.lot_service.search(payload)


@command("list_lots")
def list_lots(ctx, payload):
    return ctx.lot_service.list(payload)


@command("get_filter_values")
def get_filter_values(ctx, payload):
    return ctx.lot_service.filter_values(payload)


@command("get_lot_detail")
def get_lot_detail(ctx, payload):
    return ctx.lot_service.detail(payload)


@command("refresh_cache")
def refresh_cache(ctx, payload):
    return ctx.cache_service.refresh()


@command("get_cache_status")
def get_cache_status(ctx, payload):
    # 列の決まりの印。変わったら（DB の列が増えた・固定列を変えた）画面は表示定義を読み直す
    return dict(ctx.cache_service.status(), columnsVersion=ctx.lot_service.model.version)


@command("get_data_source")
def get_data_source(ctx, payload):
    """今の読み込み先（共有 SQLite のパス）。手元の画面にだけ出す（ログには残さない）。"""
    return ctx.source_service.describe()


@command("test_data_source")
def test_data_source(ctx, payload):
    """接続テスト。sourcePath を省くと今の読み込み先を確かめる。コピーも書き込みもしない。"""
    return ctx.source_service.test(payload)


@command("update_data_source")
def update_data_source(ctx, payload):
    """接続テストがすべて ○ なら config.local.json に保存し、キャッシュを作り直す。"""
    return ctx.source_service.update(payload)


@command("get_view_config")
def get_view_config(ctx, payload):
    """画面の表示定義：DB の全列（DB の列名が id・表示名）と種類、固定列、番号で探す列、注意。
    テーブル名・パスは含めない。"""
    return dict(ctx.lot_service.model.public(), success=True,
                recordSettingsFile=ctx.record_service.describe()["localFile"] if ctx.record_service else None)


@command("check_record_key")
def check_record_key(ctx, payload):
    """選んだ列の組み合わせで 1 件に決まるかを数える（保存はしない）。"""
    return ctx.record_service.check(payload)


@command("update_column_type")
def update_column_type(ctx, payload):
    """列の種類（auto / date / number / text）を schema.local.json の types に保存し、列の決まりを差し替える。"""
    return ctx.type_service.update(payload)


@command("update_record_settings")
def update_record_settings(ctx, payload):
    """固定列と番号で探す列を schema.local.json に保存し、列の決まりを差し替える。"""
    return ctx.record_service.update(payload)


@command("get_application_info")
def get_application_info(ctx, payload):
    return {
        "id": ctx.config.app_id,
        "name": ctx.config.app_name,
        "version": ctx.config.app_version,
    }
```

`python/data_search/errors.py`

```python
"""利用者向けメッセージと技術ログを分けるためのエラー型。

画面へ出すのは code と userMessage と detailId だけ。技術的な詳細（パス・OS エラーなど）は
detail に入れてログにだけ残す。
"""

import uuid

# code → 利用者向けメッセージ（次に取る行動が分かる文にする）
USER_MESSAGES = {
    "CONFIG_INVALID": "設定に誤りがあります。表示された「対象・項目・理由・対応」に沿って直してください。",
    "SOURCE_UNAVAILABLE": "共有データに接続できません。ネットワークと共有フォルダを確認してください。",
    "SOURCE_BUSY": "共有データが更新中のため取得できませんでした。少し待ってからもう一度更新してください。",
    "CACHE_COPY_FAILED": "共有データをコピーできませんでした。少し待ってからもう一度更新してください。",
    "CACHE_INVALID": "取得したデータが壊れていたため、使用しませんでした。",
    "CACHE_TABLE_MISSING": "取得したデータに必要な表がないため、使用しませんでした。schema.local.json の tableName を確認してください。",
    "CACHE_UNAVAILABLE": "検索できるデータがまだありません。データを更新してください。",
    "SETTINGS_WRITE_FAILED": "設定ファイルに書き込めませんでした。config/local フォルダの権限と、ほかのアプリで開いていないかを確認してください。",
    "KEY_NOT_READY": "固定列（レコードキー）が決まっていません。画面左の「データ」→「固定列」で選んでください。",
    "INVALID_REQUEST": "検索の条件が正しくありません。入力内容を確認してください。",
    "NOT_FOUND": "選んだデータが見つかりません。データが更新された可能性があります。もう一度検索してください。",
    "UNKNOWN_COMMAND": "この操作には対応していません。",
    "INTERNAL_ERROR": "予期しないエラーが発生しました。もう一度試し、続く場合は管理者へ連絡してください。",
}


class AppError(Exception):
    """アプリケーションで扱うエラー。"""

    def __init__(self, code, detail="", user_message=None):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
        self.user_message = user_message or USER_MESSAGES.get(code, USER_MESSAGES["INTERNAL_ERROR"])


def new_detail_id():
    """ログと画面を結び付ける短い ID。"""
    return uuid.uuid4().hex[:12].upper()


def error_response(error, detail_id):
    return {
        "success": False,
        "error": {
            "code": error.code,
            "userMessage": error.user_message,
            "detailId": detail_id,
        },
    }
```

`python/data_search/fields.py`

```python
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
```

`python/data_search/http_server.py`

```python
"""画面（src/）の配信と、命令（POST /api/<命令名>）の受付を行うローカル専用サーバー。

・127.0.0.1 だけで待ち受け、ほかの PC からは接続させない。
・Host / Origin を確かめ、ほかのサイトから命令を呼ばれないようにする。
・ファイルの配信は src/ の中だけに限る（任意のファイルパスは受け付けない）。
"""

import json
import os
from dataclasses import dataclass
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from . import commands
from .errors import AppError, error_response, new_detail_id

MAX_BODY_BYTES = 64 * 1024
API_PREFIX = "/api/"

# Windows のレジストリ次第で .js が text/plain になるのを防ぐ
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
}


@dataclass
class AppContext:
    config: object
    cache_service: object
    lot_service: object
    logger: object
    source_service: object = None   # 読み込み先の確認・変更（SourceService）。作成後に入れる
    record_service: object = None   # 固定列の確認・変更（RecordService）。作成後に入れる
    type_service: object = None     # 列の種類の手動の指定（ColumnTypeService）。作成後に入れる


class RequestHandler(SimpleHTTPRequestHandler):
    extensions_map = CONTENT_TYPES
    server_version = "DataSearchDev"
    sys_version = ""

    def __init__(self, *args, context=None, **kwargs):
        self.context = context
        super().__init__(*args, **kwargs)

    # ── 共通 ──
    def _allowed_hosts(self):
        port = self.server.server_address[1]
        return {f"127.0.0.1:{port}", f"localhost:{port}"}

    def _host_ok(self):
        return self.headers.get("Host", "") in self._allowed_hosts()

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        return origin.split("://", 1)[-1] in self._allowed_hosts()

    def _send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_error_json(self, status, code, detail):
        detail_id = new_detail_id()
        self.context.logger.warning("request rejected id=%s code=%s detail=%s", detail_id, code, detail)
        self._send_json(status, error_response(AppError(code, detail), detail_id))

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        # フォルダの中身の一覧は見せない
        self.send_error(404)
        return None

    def log_message(self, fmt, *args):
        self.context.logger.debug("http " + fmt, *args)

    # ── 画面の配信 ──
    def do_GET(self):
        if not self._host_ok():
            self.send_error(403)
            return
        if self.path.startswith(API_PREFIX):
            self.send_error(405)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._host_ok():
            self.send_error(403)
            return
        super().do_HEAD()

    # ── 命令の受付 ──
    def do_POST(self):
        if not self._host_ok() or not self._origin_ok():
            self._send_error_json(403, "INVALID_REQUEST", "host or origin not allowed")
            return
        if not self.path.startswith(API_PREFIX):
            self._send_error_json(404, "UNKNOWN_COMMAND", "not an api path")
            return
        name = self.path[len(API_PREFIX):].split("?", 1)[0]
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY_BYTES:
            self._send_error_json(413, "INVALID_REQUEST", "body too large")
            return
        if "application/json" not in self.headers.get("Content-Type", ""):
            self._send_error_json(415, "INVALID_REQUEST", "content-type must be application/json")
            return
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._send_error_json(400, "INVALID_REQUEST", "invalid json")
            return

        try:
            result = commands.dispatch(name, self.context, payload)
            self._send_json(200, result)
        except AppError as error:
            detail_id = new_detail_id()
            self.context.logger.warning(
                "command failed id=%s command=%s code=%s detail=%s", detail_id, name, error.code, error.detail
            )
            status = 404 if error.code == "UNKNOWN_COMMAND" else 200
            self._send_json(status, error_response(error, detail_id))
        except Exception:  # noqa: BLE001 - 想定外の例外も利用者向けの形にして返す
            detail_id = new_detail_id()
            self.context.logger.exception("unexpected error id=%s command=%s", detail_id, name)
            self._send_json(500, error_response(AppError("INTERNAL_ERROR"), detail_id))


def create_server(context, static_dir, host, port):
    handler = partial(RequestHandler, context=context, directory=os.path.abspath(static_dir))
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    return server
```

`python/data_search/lot_service.py`

```python
"""一覧・検索・絞り込み・詳細取得の業務ロジック。入力の検証もここで行う。"""

import math
import sqlite3
import time
import unicodedata
from datetime import date, timedelta

from .errors import AppError
from .fields import (
    FILTER_VALUE_LENGTH_MAX,
    FILTER_VALUES_MAX,
    KEYWORD_MAX_LENGTH,
    MATCH_MODES,
    RELATIVE_DAYS_MAX,
    SORT_ORDERS,
    VALUE_LIST_LIMIT,
)
from .column_model import ColumnModelProvider
from .sql_functions import TEXT_OPS, terms_of
from .query import QueryBuilder
from .settings.validation import RECORD_KEY_MAX


def normalize_keyword(value):
    """全角英数・記号を半角にそろえ、前後の空白を除く（NFKC）。"""
    return unicodedata.normalize("NFKC", value).strip()


def _to_text(value):
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _row_to_item(row, ids):
    return {name: _to_text(row[index]) for index, name in enumerate(ids)}


def _invalid(detail, user_message=None):
    return AppError("INVALID_REQUEST", detail, user_message=user_message)


def _require_int(payload, name, default, minimum, maximum):
    value = payload.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise _invalid(f"{name} out of range")
    return value


def _require_object(payload):
    if not isinstance(payload, dict):
        raise _invalid("payload must be an object")
    return payload


# ── 入力の読み取り ─────────────────────────────────────────

def _not_ready():
    return AppError("KEY_NOT_READY", "record key is not resolved")


def parse_search(payload, required, model):
    """(番号で探す列, keyword, matchMode) か、検索なしなら None を返す。探す列は設定（model）で決まる。"""
    keyword = payload.get("keyword")
    if keyword is None and not required:
        return None
    if not isinstance(keyword, str):
        raise _invalid("keyword must be a string")
    keyword = normalize_keyword(keyword)
    if not keyword:
        if required:
            raise _invalid("keyword is empty", "検索する番号を入力してください。")
        return None
    if len(keyword) > KEYWORD_MAX_LENGTH:
        raise _invalid("keyword too long", f"検索する番号は {KEYWORD_MAX_LENGTH} 文字以内で入力してください。")
    if model.search_column is None:
        raise _not_ready()
    match_mode = payload.get("matchMode", "partial")
    if match_mode not in MATCH_MODES:
        raise _invalid("unknown matchMode")
    return model.search_column, keyword, match_mode


def _parse_relative_days(spec, name):
    value = spec.get(name)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or abs(value) > RELATIVE_DAYS_MAX:
        raise _invalid(f"{name} out of range")
    return value


def _parse_iso_date(spec, name):
    value = spec.get(name)
    if value in (None, ""):
        return None
    try:
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError(value)
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise _invalid("invalid date", "日付は 年（4 桁）・月・日 で正しく入力してください。") from exc


# 列の種類ごとに使える絞り込み（1 つの列では、どれか 1 つの条件だけが有効）
FILTERS_BY_KIND = {
    "date": ("date",),               # 日付の範囲
    "number": ("number", "values"),  # 数値の範囲／値から選ぶ
    "text": ("values", "text"),      # 値から選ぶ／文字の条件（含む・始まる…）
}
NUMBER_LIMIT = 1e15


def filter_kinds(model, name):
    """その列で使える絞り込みの種類。列がなければ空。"""
    return FILTERS_BY_KIND.get(model.kind_of(name), ())


def _parse_number(spec, name):
    value = spec.get(name)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > NUMBER_LIMIT:
        raise _invalid(f"{name} must be a number", "範囲は数値で入力してください。")
    return float(value)


def parse_filters(payload, today, model):
    """画面から来た絞り込みを、QueryBuilder が受け取る形に直す。空の条件は無視する。どの列でも絞り込める。"""
    raw = payload.get("filters") or {}
    if not isinstance(raw, dict):
        raise _invalid("filters must be an object")
    filters = []
    for name, spec in raw.items():
        kind = spec.get("type") if isinstance(spec, dict) else None
        if kind not in filter_kinds(model, name):
            raise _invalid("unknown filter")
        if kind == "number":
            low, high = _parse_number(spec, "min"), _parse_number(spec, "max")
            if low is not None and high is not None and low > high:
                raise _invalid("number range reversed", "範囲は「以上」が「以下」より小さくなるようにしてください。")
            if low is not None or high is not None:
                filters.append((name, kind, (low, high)))
            continue
        if kind == "text":
            op, needle, fuzzy = spec.get("op"), spec.get("value"), spec.get("fuzzy", True)
            if op not in TEXT_OPS or not isinstance(needle, str) or not isinstance(fuzzy, bool):
                raise _invalid("invalid text filter")
            needle = normalize_keyword(needle)
            if len(needle) > KEYWORD_MAX_LENGTH:
                raise _invalid("text filter too long", f"条件の文字は {KEYWORD_MAX_LENGTH} 文字以内で入力してください。")
            if terms_of(needle, op, fuzzy):  # 比べられる文字がなければ（記号だけなど）条件なし
                filters.append((name, kind, (op, needle, fuzzy)))
            continue
        if kind == "values":
            values = spec.get("values")
            if not isinstance(values, list) or len(values) > FILTER_VALUES_MAX:
                raise _invalid("values must be a list")
            if any(v is not None and (not isinstance(v, str) or len(v) > FILTER_VALUE_LENGTH_MAX) for v in values):
                raise _invalid("invalid value in filter")
            if values:
                filters.append((name, kind, list(dict.fromkeys(values))))
            continue
        mode = spec.get("mode")
        if mode == "relative":
            start_days = _parse_relative_days(spec, "fromDays")
            end_days = _parse_relative_days(spec, "toDays")
            start = (today + timedelta(days=start_days)).isoformat() if start_days is not None else None
            end = (today + timedelta(days=end_days)).isoformat() if end_days is not None else None
        elif mode == "absolute":
            start, end = _parse_iso_date(spec, "from"), _parse_iso_date(spec, "to")
        else:
            raise _invalid("unknown date mode")
        if start and end and start > end:
            raise _invalid("date range reversed", "日付の範囲は「から」が「まで」より前になるようにしてください。")
        if start or end:
            filters.append((name, kind, (start, end)))
    return filters


def parse_key_columns(payload, model, name="recordKey"):
    """固定列の候補（1〜3 個・重複なし・テーブルにある列）。"""
    names = payload.get(name)
    if not isinstance(names, list) or not 1 <= len(names) <= RECORD_KEY_MAX:
        raise _invalid(f"{name} must be a list", f"固定列は 1〜{RECORD_KEY_MAX} 個選んでください。")
    if len(set(map(str, names))) != len(names) or not all(isinstance(n, str) and model.has(n) for n in names):
        raise _invalid(f"unknown column in {name}", "固定列は、一覧にある列から重ならないように選んでください。")
    return names


# ── 業務ロジック ─────────────────────────────────────────

class LotService:
    def __init__(self, config, cache_service, logger, today=None):
        self.config = config
        self.cache = cache_service
        self.logger = logger
        # 列の決まり（設定とキャッシュの列から作る）。設定を差し替えたら self.config を変えるだけでよい
        self.models = ColumnModelProvider(lambda: self.config, cache_service)
        self._query, self._query_key = None, None
        self._today = today  # テストで日付を固定するため

    @property
    def model(self):
        return self.models.get()

    def _data_model(self):
        """検索できるデータがあるときの列の決まり。なければ CACHE_UNAVAILABLE（列の決まりより先に知らせる）。"""
        if not self.cache.cache_available():
            raise AppError("CACHE_UNAVAILABLE", "cache file not found")
        return self.model

    @property
    def query(self):
        """列の決まりか設定が変わったら、SQL の組み立て役を作り直す。"""
        model = self.model
        key = (model.version, self.config.table_name)
        if key != self._query_key:
            self._query = QueryBuilder(self.config.table_name, model)
            self._query_key = key
        return self._query

    def today(self):
        return self._today() if self._today else date.today()

    def execute(self, sql, params, fetch):
        with self.cache.read_connection() as conn:
            try:
                cursor = conn.execute(sql, params)
                return cursor.fetchone() if fetch == "one" else cursor.fetchall()
            except sqlite3.Error as exc:
                # SQLite の文面には列名が入るため、ログには種類だけを残す
                raise AppError("CACHE_INVALID", f"query failed: {type(exc).__name__}") from exc

    def search(self, payload):
        """番号で検索する（04_api_spec.md の search_lots。番号は必須）"""
        return self._list(_require_object(payload), keyword_required=True)

    def list(self, payload):
        """一覧を出す。番号の検索と絞り込みはどちらも任意"""
        return self._list(_require_object(payload), keyword_required=False)

    def _list(self, payload, keyword_required):
        today = self.today()
        model = self._data_model()
        search = parse_search(payload, keyword_required, model)
        filters = parse_filters(payload, today, model)
        query = self.query
        default_key, default_order = model.default_sort
        sort_key = payload.get("sortKey") or default_key
        if sort_key not in query.columns:
            raise _invalid("unknown sortKey")
        sort_order = payload.get("sortOrder") or (default_order if sort_key == default_key else "asc")
        if sort_order not in SORT_ORDERS:
            raise _invalid("unknown sortOrder")
        page = _require_int(payload, "page", 1, 1, 10_000_000)
        page_size = _require_int(payload, "pageSize", self.config.page_size, 1, self.config.max_page_size)

        started = time.perf_counter()
        count_sql, count_params = query.count(search, filters)
        rows_sql, rows_params = query.rows(search, filters, sort_key, sort_order, page_size, (page - 1) * page_size)
        total = self.execute(count_sql, count_params, "one")[0]
        rows = self.execute(rows_sql, rows_params, "all")
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)

        # 検索値・絞り込みの値・列名はログへ出さない（種類・件数だけ）
        self.logger.info(
            "list search=%s filters=%d total=%d elapsed_ms=%s",
            f"{search[2]}/len{len(search[1])}" if search else "-", len(filters), total, elapsed_ms,
        )
        items = [_row_to_item(row, query.ids) for row in rows]
        return {
            "success": True,
            "count": len(items),
            "totalCount": total,
            "page": page,
            "pageSize": page_size,
            "items": items,
            "keyword": search[1] if search else None,
            "today": today.isoformat(),
            "elapsedMs": elapsed_ms,
        }

    def filter_values(self, payload):
        """絞り込みの候補（値と件数）。ほかの絞り込みと番号の検索を反映して数える。
        match を渡すと、その文字を含む値だけを数える（値が多い列で、上位に出ない値を探すため）。"""
        payload = _require_object(payload)
        model = self._data_model()
        name = payload.get("field")
        if "values" not in filter_kinds(model, name):
            raise _invalid("field is not a value filter")
        match = payload.get("match")
        if match is not None:
            if not isinstance(match, str):
                raise _invalid("match must be a string")
            match = normalize_keyword(match)
            if len(match) > KEYWORD_MAX_LENGTH:
                raise _invalid("match too long", f"探す文字は {KEYWORD_MAX_LENGTH} 文字以内で入力してください。")
        search = parse_search(payload, False, model)
        filters = parse_filters(payload, self.today(), model)
        sql, params = self.query.values(name, search, filters, VALUE_LIST_LIMIT + 1, match or None)
        rows = self.execute(sql, params, "all")
        return {
            "success": True,
            "field": name,
            "values": [{"value": row[0], "count": row[1]} for row in rows[:VALUE_LIST_LIMIT]],
            "truncated": len(rows) > VALUE_LIST_LIMIT,
            "match": match or None,
        }

    def detail(self, payload):
        """1 件の全項目。payload は固定列の 列名 → 値（空欄は null）"""
        payload = _require_object(payload)
        model = self._data_model()
        if not model.ready:
            raise _not_ready()
        key_values = {}
        for name in model.record_key:
            value = payload.get(name)
            if value is not None and not isinstance(value, str):
                raise _invalid("key value must be a string or null")
            key_values[name] = value
        if not any(key_values.values()):
            raise _invalid("key values are empty")

        query = self.query
        sql, params = query.detail(key_values)
        rows = self.execute(sql, params, "all")
        if not rows:
            raise AppError("NOT_FOUND", "record not found")
        if len(rows) > 1:
            self.logger.warning("detail key is not unique")
        return {"success": True, "item": _row_to_item(rows[0], query.ids), "duplicated": len(rows) > 1}

    def check_record_key(self, payload):
        """選んだ列の組み合わせで 1 件に決まるかを数える（保存はしない）。"""
        payload = _require_object(payload)
        names = parse_key_columns(payload, self._data_model())
        query = self.query
        total = self.execute(*query.count(None, []), "one")[0]
        groups, rows = self.execute(*query.key_duplicates(names), "one")
        example = None
        if groups:
            found = self.execute(*query.key_duplicate_example(names), "one")
            example = {"values": dict(zip(names, (_to_text(v) for v in found[:-1]))), "count": found[-1]}
        blank = self.execute(*query.key_blank_rows(names), "one")[0]
        self.logger.info("record key check columns=%d rows=%d duplicate_groups=%d blank=%d", len(names), total, groups, blank)
        return {
            "success": True,
            "recordKey": names,
            "rowCount": total,
            "duplicateGroups": groups,
            "duplicateRows": rows,
            "blankRows": blank,
            "unique": groups == 0,
            "example": example,
        }
```

`python/data_search/query.py`

```python
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
    filters … [(DB の列名, 種類, 条件)]
              "values" … [値 or None, ...]（None は空欄）
              "date"   … (from, to)。'YYYY-MM-DD' か None（日付は呼び出し側で確定させる）
              "number" … (min, max)。数値か None（以上・以下）
              "text"   … (op, needle, fuzzy)。判定は SQLite に足した ds_text（sql_functions.py）
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
        if kind == "number":
            low, high = data
            parts, params = [f"ds_number({column}) IS NOT NULL"], []
            if low is not None:
                parts.append(f"ds_number({column}) >= ?")
                params.append(low)
            if high is not None:
                parts.append(f"ds_number({column}) <= ?")
                params.append(high)
            return "(" + " AND ".join(parts) + ")", params
        if kind == "text":
            op, needle, fuzzy = data
            return f"ds_text({column}, ?, ?, ?) = 1", [op, needle, 1 if fuzzy else 0]
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
        kind = self.model.kind_of(name)
        if kind == "date":
            return date_expression(self.columns[name])
        if kind == "number":
            return f"ds_number({self.columns[name]})"
        return self.columns[name]

    # ── 文 ──
    def count(self, search, filters):
        where, params = self._where(search, filters)
        return f"SELECT COUNT(*) FROM {self.table}{where}", params

    def rows(self, search, filters, sort_key, sort_order, limit, offset):
        where, params = self._where(search, filters)
        direction = "DESC" if sort_order == "desc" else "ASC"
        # 空欄は昇順・降順どちらでも最後に回す
        order_terms = [f"{blank_expression(self.columns[sort_key])} ASC"]
        if self.model.kind_of(sort_key) == "number":
            # 数値の列で数値として読めない値は、空欄の手前（数値の後ろ）に回す
            order_terms.append(f"(ds_number({self.columns[sort_key]}) IS NULL) ASC")
        order_terms.append(f"{self._sort_expression(sort_key)} {direction}")
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
```

