## 18. README の修正後全文

`README.md`

````markdown
# 対象データ検索（data-search）

共有 SQLite のロットを一覧で表示し、絞り込み（タグで保存・再利用）とクリックで詳細を参照するツールです。
一覧には DB の全列を、DB の列名のまま表示します。番号（ロット・BOX・検査・鋳造・受注など、view の searchFields）が分かっているときは、入力して探すこともできます。
共有データは直接検索せず、**手元へコピー → 検証 → 問題がなければ入れ替え** たローカルキャッシュを検索します。

最終形は Tauri + Rust のデスクトップアプリですが、ビルド前に使用感を確かめられるよう、
**同じ画面・同じ命令（API）で動く 3 つの起動方法**を用意しています。

| 起動のしかた | 上部バーの表示 | 検索するデータ | 用途 |
|---|---|---|---|
| `src/index.html` をダブルクリック（Edge） | サンプル | ブラウザの中のサンプル | 画面の使用感を確かめる |
| `start-dummy.bat` をダブルクリック | Python 版 | ダミーの共有 SQLite（`config/dummy` の上書き設定） | Python 版の動きを確かめる（実データ不要） |
| `start.bat` をダブルクリック | Python 版 | `config/local` の上書き設定が指す共有 SQLite | 実データで使う |
| デスクトップ版（今後） | デスクトップ版 | 同上 | 本番 |

---

## 3 分で使う

1. `src/index.html` を Edge で開く（サーバーやビルドは不要）。
2. 右上の青いボタン「サンプルを読み込む」→ 左のパネルで「標準のデータ」を **読み込む**。ロットの一覧が view の `defaultSort`（標準は工場納期の近い順）で出る。1 ロットに BOX が複数あれば BOX ごとに 1 行。
3. 一覧の上の「絞り込み」で条件を選ぶ（例：状態＝仕掛中、取引先名＝架空商事）→「今の条件をタグにする」で名前を付けて保存。次回からはタグを押すだけ。
4. 一覧には全列が出る（左端のロット番号・BOX番号は横に動かしても残る）。行を押すと選ぶだけ、ダブルクリックか `Enter` で右に詳細。`↑` `↓` で行を移動、`Esc` で閉じる。`F1` で取扱説明書。
5. 番号が分かっているときは上部バーに入れて `Enter`（今の絞り込みの中から探す）。

## 実データで使う（Python 版）

前提：Python 3.12（標準ライブラリだけで動きます。pip での追加は不要）。

1. `config/local/` フォルダを作る（Git 管理対象外）。
2. `config/local/config.local.json` に、共有 SQLite のパスだけを書く。
3. `config/local/schema.local.json` に、実際のテーブル名と列名を書く。
4. 表示を変えたいときだけ `config/local/view.local.json` を書く（なくてよい）。
5. `start.bat` をダブルクリック。黒いウィンドウが開き、Edge で画面が開きます。
   - 初回はキャッシュを自動で作成します。以後は画面左の「データ」→「データを更新する」で更新します。
   - 設定に誤りがあると、**対象ファイル・項目・理由・対応**をすべて表示して止まります（ウィンドウは開いたまま）。
   - 終了は黒いウィンドウを閉じます。
6. 読み込み先（共有 SQLite のパス）は、画面左の「データ」→「読み込み先」で確かめて直せます（詳しくは「読み込み先の確認と変更」）。
7. 実データなしで流れを確かめるときは `start-dummy.bat`（ダミーの共有 SQLite と `config/dummy/` の上書き設定を自動で作ります）。

---

## 設定ファイル

詳しくは [docs/config-design.md](docs/config-design.md)（責務・読み込み順・マージ仕様・検証・起動フロー）。

### 構成と責務

```text
config/
├─ sample/                  … 外部提供できる初期値・構造定義（Git 管理対象・外部 AI へ渡してよい）
│  ├─ config.sample.json    … アプリと実行環境（データの場所はプレースホルダー）
│  ├─ schema.sample.json    … DB の論理構造（テーブル名・列名はプレースホルダー）
│  └─ view.sample.json      … 画面の表示定義（物理名は書かない）
└─ local/                   … 社内固有の上書き（フォルダごと Git 管理対象外・外部へ出さない）
   ├─ config.local.json     … 実際の共有 SQLite のパスなど、必要な項目だけ
   ├─ schema.local.json     … 実際のテーブル名・列名
   └─ view.local.json       … 社内だけの表示変更（なくてよい）
```

| 変えたいこと | 直すファイル |
|---|---|
| 実際の接続先・実行環境 | `config/local/config.local.json` |
| 環境設定の公開できる初期値 | `config/sample/config.sample.json` |
| 実際のテーブル名・列名 | `config/local/schema.local.json` |
| 外部提供用のスキーマ形式 | `config/sample/schema.sample.json` |
| 公開できる標準の表示 | `config/sample/view.sample.json`（変えたら `python python/tools/sync_sample_view.py`） |
| 社内環境だけの表示 | `config/local/view.local.json` |
| 処理仕様・業務ロジック | ソースコード |

### 読み込みとマージ

- config / schema / view のそれぞれで、**サンプルを初期値にし、ローカルがあれば必要な項目だけ上書き**します。
- ローカルにないキーはサンプルの値を使います。ローカルのファイルがないことは誤りにしません。
- オブジェクトはキーごとに再帰的に重ね、**配列はローカル側にあれば丸ごと置き換え**ます。
- サンプルにないキーは読み捨てず、**ファイル名と項目を示して注意**を出します（`schema.columns`・`schema.types`・`view.fields` は論理項目を足せる場所なので注意しません）。
- マージ後に役割ごとに検証し、誤りがあればすべて表示して止まります。
- sample に書いていない運用上の項目（`config.cache`・`config.devServer`・`schema.types`・`view.fields` など）は、アプリ内の既定値（`settings/defaults.py`）で補います。sample に書けば sample が、local に書けば local が優先です。
- 手元のキャッシュが今の schema（テーブル名・列名）と合わないときは使わず、起動時に作り直します（作り直せなければ「データを更新してください」と表示）。

```text
[設定エラー]
対象: config/local/schema.local.json
項目: tableName
理由: 仮の値（<TARGET_TABLE_NAME>）のままです。
対応: config/local/schema.local.json の tableName に実際のテーブル名を設定してください（ファイルがなければ作成）。
```

### ローカルの記入例（構造だけ。実際の値は外部に出さない）

`config/local/config.local.json`
```json
{
  "dataSource": {
    "sourcePath": "<実際の共有SQLiteのフルパスを設定>"
  }
}
```

`config/local/schema.local.json`（**役割のある 14 列だけ**。論理名は schema.sample.json の columns と同じ。値を実際の列名に）
```json
{
  "tableName": "<実際のテーブル名を設定>",
  "columns": {
    "lotNo": "<実際のロット番号列>",
    "boxNo": "<実際のBOX番号列>",
    "…": "（schema.sample.json の columns にある 14 の論理名）"
  },
  "types": {
    "factoryDeliveryDate": "date"
  }
}
```
ほかの列は書かなくても、DB のテーブルから自動で読み取って表示します（DB に列が増えれば自動で増える）。

`config/local/view.local.json`（必要なときだけ。配列は丸ごと置き換わる）
```json
{
  "hiddenColumns": ["<最初は隠しておく DB の列名>"]
}
```

---

## 画面の考え方（基本設計への対応）

| 原則 | この画面での実装 |
|---|---|
| 面積は頻度×重要度（1-1） | 一覧を最大に。よく使うタグは一覧の上に常に表示。条件づくり・データ・サンプルは左のアイコン列から開くパネル（最初は閉じる） |
| 次にすることを 1 つ（1-2） | 右上の青いボタンだけが主要動作。状態でラベルが変わる（サンプルを読み込む → 検索する → 読み込み中…） |
| 色だけで伝えない（1-3） | 値の札・通知・データの状態はすべて「アイコン＋文字＋色」 |
| できないことは書く（1-4） | 押せない理由を入力欄の下に表示。アイコンが読めないときは文字に切り替え |
| 危ない操作は外す（1-5） | タグの削除は選んだタグの ⋮ の中、「サンプルだけを消す」はパネルの最下部。どちらも確認ダイアログではなく 10 秒間の「元に戻す」。絞り込みの「すべて解除」も元に戻せる |
| 出どころ・根拠（1-6） | 上部バー右と一覧の下に「どのデータの何時点か」「検索時間」「全角を半角にそろえたか」。「データ」パネルに根拠と設定の注意 |
| トークン（1-7） | 生の値は `src/css/tokens.css` だけ。基本の値 → 意味づけの 2 段 |
| スクロールレス（1-8） | 画面は `100dvh`。一覧・パネル・詳細の内側だけがスクロール |

入力欄は選ぶと全選択、`Enter` で検索（日本語の変換中は除く）、`Esc` で消去して一覧に戻る。前に探した番号が候補に出ます。
日付の指定は 年 4 桁・月 2 桁・日 2 桁 を入れると次の欄へ自動で移り、`Enter` で次へ／`Shift+Enter` で前へ移ります。

### 列と表示の決まり

- **列は DB のテーブルから自動で読み取り、DB の列名をそのまま見出し・詳細・絞り込みの名前にします**（設定に表示名は書かない）。
- 並び順：役割のある列（schema.columns の順）を先頭に、残りは DB の列の順。
- 設定に書くのは「役割」だけです。

| 決めること | 書く場所 |
|---|---|
| 役割のある列の 論理名 → DB の列名（1 件を決める・検索・絞り込み・並べ替え） | `schema.columns`（14 列） |
| 1 件を特定する列（標準はロット番号＋BOX番号。一覧の左端に固定） | `schema.recordKey` |
| 日付として扱う列（日付の絞り込み・並べ替え） | `schema.types`（論理名か、役割のない列なら DB の列名） |
| 番号で探せる列（上部バーの種類） | `view.searchFields`（4 種類までは横並びのボタン、5 種類以上は選択欄。どちらも `Alt+数字` で切り替え） |
| 絞り込める列と種類 | `view.filters`（`values`＝値から選ぶ / `date`＝日付の範囲。`date` は `types` で date の列だけ） |
| 起動時の並び順 | `view.defaultSort` |
| 最初は隠しておく列 | `view.hiddenColumns`（論理名か DB の列名）。各自が画面の「表示列」で出し入れでき、選んだ内容はブラウザに保存 |
| 等幅・コピー・入力例・値の札（任意） | `view.fields.<論理名 or DB の列名>`（`mono` / `copy` / `example` / `badge`） |

以前の形の設定（全列の `columns`・`listColumns`・`detailFields`・`detailGroups`・`fields.*.label`）が残っていても止まりません。
「今は使わない項目です」という注意を出すので、消してかまいません。

### 一覧の使い方（全列表示）

- 左端の 1 件を決める列（ロット番号・BOX番号）は、横に動かしても残ります。見出しは縦に動かしても残ります。
- 長い値は「…」で省き、マウスを乗せると全文が出ます。見出しの右端をドラッグで幅を変更（ダブルクリックで元に戻す）。幅はブラウザに保存。
- 一覧の上の「列を探す」に列名の一部を入れて `Enter`：その列まで横に移動して光ります（隠している列なら「表示する」を案内）。
- 右の ⤢ ボタンで行の高さを「詰める／ゆったり」に切り替え。
- 行を 1 回押す（または `↑` `↓`）と選ぶだけ。ダブルクリックか `Enter` で右に詳細（全項目。主な項目／そのほかの項目）。詳細を開いている間は、選んだ行に合わせて詳細も切り替わります。
- データの更新で DB の列が増減したときは、自動で画面を読み込み直します（選んだ列・幅・タグは残る）。

### 読み込み先の確認と変更

画面左の「データ」→「読み込み先」で、今の共有 SQLite のパスを確かめ、変更できます（Python 版・デスクトップ版。サンプルのモードでは模擬の動き）。

- **接続を確かめる**：次の順に確かめ、段階ごとに ○ × と、× のときは理由・対応を出します。コピーも書き込みもしません（共有側にロックや一時ファイルも作りません）。

  | 順 | 段階 | × の例 |
  |---|---|---|
  | ① | パスの書き方 | 空・仮の値・フォルダのパス |
  | ② | 場所に届くか | フォルダに届かない（ネットワーク・VPN）・ファイルがない |
  | ③ | 読めるか | 権限がない・使用中 |
  | ④ | SQLite として開けるか | SQLite ではない・壊れている |
  | ⑤ | テーブルと列 | schema の tableName / columns がない（足りない論理項目名を表示） |
  | ⑥ | 件数 | 結果として件数と更新日時を表示 |

- **変更**：エクスプローラーでファイルを Shift＋右クリック →「パスとしてコピー」して貼り付け（前後の `"` は自動で外す）→ `Enter` で確かめる → すべて ○ なら「保存して更新」にフォーカスが移り、`Enter` で保存。
  - 保存先は `config/local/config.local.json` の `dataSource.sourcePath`（ほかの項目はそのまま。書き換え前は `.bak` に残す）。
  - 保存後に設定を読み直して検証し、誤りが出たら保存を取り消します。問題がなければ、そのままデータを更新します。
  - 確かめた後に入力を変えると、もう一度確かめるまで保存できません。
- 前の読み込み先から作ったキャッシュは使いません（キャッシュの状態に読み込み先の印を残して見分ける。パスそのものは残さない）。
- 起動時にキャッシュを作れなかったときも、黒いウィンドウに同じ接続テストの結果を出します。
- 変更できる人の制限（権限）は今後の課題です。

### 絞り込みとタグ

- 絞り込める項目：view の `filters` で決める（標準は製造材質・製造調質・取引先名・残仕掛設備コース・最終実績設備・仕掛区分・保留区分・状態。値の一覧から複数選択。件数つき・空欄も選べる）。
- 日付の範囲で絞り込むには、schema の `types` で日付にし、view の `filters` に `type: "date"` で足す（標準のサンプルには未設定）。
- 日付は「今日より前／今日／今日〜7 日後／今日〜30 日後／7 日前〜今日」のほか、今日からの日数や日付そのもので指定できる。
  **今日からの日数で決めたタグは、毎日その日を基準に絞り込む**（翌月も使える）。
- 項目どうしは「かつ」、同じ項目の中は「または」。番号の検索とも「かつ」。
- タグはブラウザに自動保存。絞り込みパネルの下で JSON に書き出し／読み込み（ファイル選択・ドラッグ＆ドロップ）でき、ほかの人と共有できる。
- 起動時の既定のタグは、今は設けていない（すべてのロットを `defaultSort` の順に表示）。

---

## フォルダ構成

```text
data-search/
├─ README.md
├─ docs/
│  ├─ config-design.md            … 設定ファイルの設計（責務・マージ・検証・起動フロー）
│  └─ report/                     … 設定・フォルダ構成の見直しの成果物一覧（コード全文つき）
├─ start.bat / start-dummy.bat    … Python 版の起動（Windows）
├─ config/
│  ├─ sample/                     … 外部提供できる初期値（Git 管理対象）
│  ├─ local/                      … 社内固有の上書き（自分で作る・Git 管理対象外）
│  └─ dummy/                      … ダミー用の上書き（自動生成・Git 管理対象外）
├─ src/                           … 画面（3 つの起動方法で共通）
│  ├─ index.html
│  ├─ css/   tokens.css / base.css / components.css / layout.css / filters.css
│  ├─ js/
│  │  ├─ core/         核（EventBus・Store・登録簿・保存・道具）
│  │  ├─ domain/       論理項目の登録簿（view から組み立て）・値の札・絞り込みの種類
│  │  ├─ api/          API の窓口とアダプター（tauri / http / mock）
│  │  ├─ sample/       サンプルデータ（種を固定）と、サンプル用の表示定義（自動生成）
│  │  ├─ controllers/  操作（検索・詳細・データ更新・サンプル・タグ）
│  │  ├─ views/        画面の部品（上部バー・タグ・一覧・詳細・パネル枠・通知）
│  │  ├─ panels/       脇のパネル（絞り込み・データ・表示列・サンプル）
│  │  ├─ manual/       取扱説明書
│  │  └─ app.js        起動と組み立て（最初に表示定義を読み込む）
│  └─ assets/vendor/fontawesome/  … Font Awesome Free 6.5.2（同梱・オフラインで動く）
├─ python/                        … Python 版バックエンド（Rust 版の手本）
│  ├─ run_server.py               … 起動
│  ├─ data_search/
│  │  ├─ settings/                … 設定の読み込み（loader）・再帰マージ（merge）・検証（validation）・既定値（defaults）
│  │  └─ …                        … キャッシュ・検索・HTTP など
│  ├─ tools/make_dummy_db.py      … ダミーの共有 SQLite と config/dummy を作る
│  ├─ tools/sample_columns.json   … ダミーと画面だけのモードが使う列の一覧（実データとは無関係）
│  ├─ tools/sync_sample_view.py   … サンプルの表示定義を画面用（src/js/sample/sample-view.js）に書き写す
│  └─ tests/test_backend.py
├─ tests/ui-check.js              … 画面の動作確認（コンソールに貼って使う）
├─ data/   … キャッシュ・ダミー（Git 管理対象外）
└─ logs/   … ログ（Git 管理対象外）
```

### 機能の足し方（既存のコードを変えずに増やせる所）

| 増やすもの | 足す場所 |
|---|---|
| 表示する列 | 何もしない（DB に列を足せば、データの更新で自動で表示される） |
| 役割のある列（例：作業日で絞り込む） | `schema.columns` に論理名と列名（sample と local の両方）、日付なら `types` に `"date"`、`view.filters` に足す |
| 日付の絞り込み | 上の項目を `view` の `filters` に `{ "field": "...", "type": "date" }` で足す |
| 値の絞り込み | `view` の `filters` に `{ "field": "...", "type": "values" }` |
| 値の札の色分け | `view` の `fields.<項目>.badge` |
| 絞り込みの種類（例：数値の範囲） | `js/domain/filters.js` の `filterTypes.register()` と `panels/filter-panel.js` の `editors.register()`、Python の `query.py` と `settings/validation.py` |
| 別のツールへ渡すボタン | `DS.handoffs.register({ id, label, icon, send(item) })` で詳細の下にボタンが出る（item は全列。役割のある列は論理名、ほかは DB の列名がキー） |
| 脇のパネル | `DS.panels.register()` |
| サンプルのパターン | `js/sample/sample-data.js` の `patterns.register()` |
| 取扱説明書の章 | `js/manual/manual-content.js` の `register()` |
| 命令（API） | Python：`commands.py` の `@command()`／画面：`api-client.js` の `COMMANDS` |
| 接続先 | `DS.api.adapters.register()` |
| 設定項目 | `config/sample/*.sample.json` に足し、`settings/loader.py` で受け取り、`settings/validation.py` で確かめる。ローカルへの追記は必要なときだけ |

---

## Python 版 → Rust 版への対応

Python 版は Rust 版の構成（`05_directory_structure.md`）に合わせています。移植時はファイル単位で置き換えられます。

| Python | Rust |
|---|---|
| `settings/loader.py` / `settings/merge.py` / `settings/validation.py` | `config/loader.rs` / `config/merge.rs` / `config/validation.rs` |
| `fields.py`（上限値などの決まり） | `models/lot.rs` |
| `cache_copier.py` / `cache_validator.py` / `cache_service.py` | `cache/copier.rs` / `cache/validator.rs` / `cache/mod.rs` |
| `query.py` | `db/query.rs` |
| `lot_service.py` | `services/lot_service.rs` |
| `source_check.py` / `source_service.py` / `settings/local_writer.py` | `cache/source_check.rs` / `services/source_service.rs` / `config/local_writer.rs` |
| `commands.py` | `commands/search.rs`・`commands/cache.rs`・`commands/view.rs`・`commands/source.rs` |
| `errors.py` / `logging_setup.py` | `errors/mod.rs` / `logging/mod.rs` |
| `http_server.py`（Python 版だけ） | 不要（Tauri の invoke に置き換わる） |

Tauri 版の画面側は `js/api/remote-adapters.js` の `tauri` アダプターが `invoke(命令名, { request })` で呼びます。
`tauri.conf.json` で `app.withGlobalTauri: true` にしてください。Font Awesome は同梱済みなので、そのまま組み込めます。

---

## API（04_api_spec.md からの追加・変更点）

命令名と基本の入出力は `04_api_spec.md` のとおりです。以下を追加・変更しました。**`04_api_spec.md` への反映をお願いします。**

| 命令 | 変更点 | 理由 |
|---|---|---|
| `get_view_config`（新規） | 戻り値は表示定義（`searchFields`・`hiddenColumns`・`fields`・`filters`・`defaultSort`）、schema の論理情報（`roleFields`・`recordKey`・`types`）、表示する列 `columns: [{ id, label（DB の列名）, role }]` と `columnsVersion`。**テーブル名・パスは含めない** | 列をソースコードにも設定にも固定せず、DB の列名で表示するため |
| `list_lots`（新規） | 入力は `search_lots` と同じで、番号（`keyword` など）は省略可。`filters` を追加。戻り値も同じ形 | 起動時に入力なしで一覧を出し、絞り込むため |
| `get_filter_values`（新規） | 入力 `{ field, filters, (番号の検索) }`、戻り値 `{ success, field, values: [{ value, count }], truncated }` | 絞り込みの値を件数つきで見て選ぶため |
| `search_lots` | 入力に `sortKey`（論理名・既定は view の defaultSort）・`sortOrder`（asc/desc）・`filters` を追加（省略可） | 見出しでの並べ替えをページをまたいで正しく行うため |
| `search_lots` / `list_lots` | 戻り値に `keyword`（正規化後）・`today`（日付の基準日）・`elapsedMs` を追加。`items` は schema の全論理項目 | 画面に根拠（全角→半角・基準日・検索時間）を出すため |
| `get_lot_detail` | 入力は schema の `recordKey` の項目（標準は `{ lotNo, boxNo }`）。戻り値は `{ success, item, duplicated }` | ロット番号＋BOX番号で 1 件に決まるため |
| `get_data_source`（新規） | 戻り値 `{ success, sourcePath, editable, localFile }` | 画面で今の読み込み先を示すため |
| `test_data_source`（新規） | 入力 `{ sourcePath? }`（省くと今の読み込み先）。戻り値 `{ success, ok, steps: [{ id, label, status: ok/ng/skip, message, action }], rowCount, modifiedAt, normalizedPath }` | 段階ごとに接続を確かめるため |
| `update_data_source`（新規） | 入力 `{ sourcePath }`。接続テストがすべて ○ のときだけ保存してデータを更新。戻り値は test の結果＋`{ saved, refreshed, message, localFile }` | 読み込み先を画面から直すため |
| `get_cache_status` | `columnsVersion`（列が変わったかの印）・`rowCount`・`sourceReachable`・`sourceHasUpdate`・`lastRefreshAt`・`errorCode`・`errorMessage`・`settingsWarnings` を追加 | 「データ」パネルで状態の根拠と設定の注意を示すため |
| `refresh_cache` | 戻り値に `rowCount` を追加 | 更新の結果を件数で示すため |
| 設定 | `devServer`（host / port / openBrowser）・`cache`（temporaryExtension / keepPreviousOnFailure）は sample に書かなくてもアプリ内の既定値を使う。変えたいときだけ sample か local に書く | sample を簡潔に保つため。`devServer` は Python 版のみ |

検索の決まり：検索値は前後の空白を除き、全角英数・記号を半角にそろえ（NFKC）、大文字小文字を区別しません。
部分一致の `%` `_` は文字として扱います。SQL はすべてパラメーター化しています。

`filters` の形：

```json
{
  "cfStatus":            { "type": "values", "values": ["仕掛中", null] },
  "factoryDeliveryDate": { "type": "date", "mode": "relative", "fromDays": 0, "toDays": 7 }
}
```

- `values` の `null` は空欄。日付の `mode` は `relative`（今日を 0 とした日数。片方 `null` で制限なし）か `absolute`（`from` / `to` に `YYYY-MM-DD`）。
- 相対の日付はバックエンドが「今日」で具体的な日付に直す。
- 実データの日付は `YYYY-MM-DD`・`YYYY/MM/DD`・`YYYYMMDD`（時刻付きも可）に対応。月日が 1 桁の書き方（`2026/1/5`）は未対応。
- 並べ替えでは空欄を昇順・降順どちらでも最後に回す。

エラーは `{ success: false, error: { code, userMessage, detailId } }`。`detailId` でログの該当行を探せます。
ログには検索値そのもの・検索結果・設定の値（パス・表名・列名）は出さず、種類・件数・時間・項目名だけを記録します。

---

## 確かめ方

```bash
# バックエンド（実データ不要。設定のマージ・検証、キャッシュの正常・接続不可・破損・表なし・列なし、
# 検索の 0 件・日本語・記号・SQL 注入、絞り込み、HTTP を確認）
python -m unittest discover -s python/tests -v
```

画面：`src/index.html` を開き、F12 → コンソールに `tests/ui-check.js` の中身を貼って Enter。「すべて成功」と出れば OK。

大量データ：画面は「サンプル → 大量のデータ（ロット 10,000 件）」、Python 版は
`python python/tools/make_dummy_db.py --lots 50000` でロット 5 万件（BOX 約 10 万件）のダミーを作れます。

異常系の再現：`python python/tools/make_dummy_db.py --variant corrupt`（`missing-table` / `missing-column` も可）の後に、
画面で「データを更新する」→ 前回のデータを使い続けることを確認。`--variant normal` で元に戻ります。

---

## 今後の候補

- 別ツールとの連携（詳細の全項目を渡す）：`DS.handoffs.register()` で送り先を足す
- 起動時に使う既定のタグ
- 全員で同じタグを共有する仕組み（共有フォルダへの保存）
- Tauri 版（Rust）の実装
- 一覧の CSV／Excel 出力
````

