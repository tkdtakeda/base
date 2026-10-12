# 対象データ検索（data-search）

共有 SQLite のロットを一覧で表示し、絞り込み（タグで保存・再利用）とクリックで詳細を参照するツールです。
一覧には DB の全列を、DB の列名のまま表示します。**どの列でも、見出しの漏斗（じょうご）から絞り込めます**（Excel のフィルターと同じ考え方）。
番号（標準はロット番号。1 つの列）が分かっているときは、上部バーに入力して探すこともできます。
**固定列（レコードキー：行を 1 件に決める列。一覧の左端に固定。標準はロット番号＋BOX番号）は画面で選べる**ので、列名の違う似た DB もそのまま読み込めます。
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
3. 見出しの右の漏斗（じょうご）を押して条件を選ぶ（例：状態＝仕掛中、取引先名＝架空商事。どの列でもよい）→「今の条件をタグにする」で名前を付けて保存。次回からはタグを押すだけ。
4. 一覧には全列が出る（左端のロット番号・BOX番号は横に動かしても残る）。行を押すと選ぶだけ、ダブルクリックか `Enter` で右に詳細。`↑` `↓` で行を移動、`Esc` で閉じる。`F1` で取扱説明書。
5. 番号が分かっているときは上部バーに入れて `Enter`（今の絞り込みの中から探す）。

## 実データで使う（Python 版）

前提：Python 3.12（標準ライブラリだけで動きます。pip での追加は不要）。

1. `config/local/` フォルダを作る（Git 管理対象外）。
2. `config/local/config.local.json` に、共有 SQLite のパスだけを書く。
3. `config/local/schema.local.json` に、実際のテーブル名を書く。固定列（`recordKey`）は DB の列名で書くか、起動後に画面左の「データ」→「固定列」で選ぶ（選ぶとこのファイルに保存される）。
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
| 実際のテーブル名・固定列・探す列 | `config/local/schema.local.json`（列は画面の「データ」→「固定列」でも選べる） |
| 外部提供用のスキーマ形式 | `config/sample/schema.sample.json` |
| 公開できる標準の表示 | `config/sample/view.sample.json`（変えたら `python python/tools/sync_sample_view.py`） |
| 社内環境だけの表示 | `config/local/view.local.json` |
| 処理仕様・業務ロジック | ソースコード |

### 読み込みとマージ

- config / schema / view のそれぞれで、**サンプルを初期値にし、ローカルがあれば必要な項目だけ上書き**します。
- ローカルにないキーはサンプルの値を使います。ローカルのファイルがないことは誤りにしません。
- オブジェクトはキーごとに再帰的に重ね、**配列はローカル側にあれば丸ごと置き換え**ます。
- サンプルにないキーは読み捨てず、**ファイル名と項目を示して注意**を出します（`schema.types`・`view.fields` は列を足せる場所なので注意しません）。
- マージ後に役割ごとに検証し、誤りがあればすべて表示して止まります。
- sample に書いていない運用上の項目（`config.cache`・`config.devServer`・`schema.types`・`view.fields` など）は、アプリ内の既定値（`settings/defaults.py`）で補います。sample に書けば sample が、local に書けば local が優先です。
- 手元のキャッシュが今の設定（読み込み先・テーブル名）と合わないときは使わず、起動時に作り直します（作り直せなければ「データを更新してください」と表示）。
- **列名が DB にあるかは、起動時ではなくデータを読んだあとに確かめます。DB にない列名があっても止めません**。黒いウィンドウと画面の「データ」パネルに「列の注意」を出し、画面で選び直せます。

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

`config/local/schema.local.json`（**列名は DB と同じでよい**。固定列は画面で選んでもよい）
```json
{
  "tableName": "<実際のテーブル名を設定>",
  "recordKey": ["<固定列（DB の列名）>", "<2 つ目（なくてよい。3 つまで）>"],
  "searchColumn": null
}
```
- `searchColumn`：上部バーで番号を探す列。`null` なら `recordKey` の 1 つ目。
- ほかの列は書かなくても、DB のテーブルから自動で読み取って表示し、どの列でも絞り込めます（DB に列が増えれば自動で増える）。
- 日付の列（日付の範囲で絞り込む列）は**値から自動で判定**します。判定を変えたいときだけ `"types": { "<DB の列名>": "date" か "text" }` を書きます。
- `columns`（論理名 → DB の列名の別名）は任意です。公開サンプル（`view.sample.json` の `defaultSort` など）が論理名で書いてあるため残しています。書かなくても動きます。

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
| 次にすることを 1 つ（1-2） | 右上の青いボタンだけが主要動作。状態でラベルが変わる（サンプルを読み込む → 固定列を選ぶ → 検索する → 読み込み中…） |
| 色だけで伝えない（1-3） | 値の札・通知・データの状態はすべて「アイコン＋文字＋色」 |
| できないことは書く（1-4） | 押せない理由を入力欄の下に表示。アイコンが読めないときは文字に切り替え |
| 危ない操作は外す（1-5） | タグの削除は選んだタグの ⋮ の中、「サンプルだけを消す」はパネルの最下部。どちらも確認ダイアログではなく 10 秒間の「元に戻す」。絞り込みの「すべて解除」も元に戻せる |
| 出どころ・根拠（1-6） | 上部バー右と一覧の下に「どのデータの何時点か」「検索時間」「全角を半角にそろえたか」。「データ」パネルに根拠と設定の注意 |
| トークン（1-7） | 生の値は `src/css/tokens.css` だけ。基本の値 → 意味づけの 2 段 |
| スクロールレス（1-8） | 画面は `100dvh`。一覧・パネル・詳細の内側だけがスクロール |

入力欄は選ぶと全選択、`Enter` で検索（日本語の変換中は除く）、`Esc` で消去して一覧に戻る。前に探した番号が候補に出ます。
日付の指定は 年 4 桁・月 2 桁・日 2 桁 を入れると次の欄へ自動で移り、`Enter` で次へ／`Shift+Enter` で前へ移ります。

### 列と表示の決まり

- **列は DB のテーブルから自動で読み取り、DB の列名をそのまま見出し・詳細・絞り込みの名前（列の id）にします**（設定に表示名は書かない）。
- 並び順：固定列 → 番号で探す列 → 別名（`schema.columns`）のある列 → 残りは DB の列の順。
- 列の種類：日付（日付の範囲で絞り込む・日付として並べ替える）か、文字（値から選んで絞り込む）。**値から自動で判定**します（空でない値がすべて `YYYY-MM-DD`・`YYYY/MM/DD`・`YYYYMMDD` の形なら日付。固定列・探す列は番号の取り違えを防ぐため文字）。
- 設定に書くのは「役割」だけです。名前は **DB の列名**で書けます（別名を `schema.columns` に書いた場合は、その論理名でもよい）。

| 決めること | 書く場所 |
|---|---|
| 固定列（レコードキー。行を 1 件に決める 1〜3 列。標準はロット番号＋BOX番号。一覧の左端に固定し、見出しに鍵のアイコン） | `schema.recordKey`（画面の「データ」→「固定列」で選んで保存できる） |
| 番号で探す列（上部バーの入力欄） | `schema.searchColumn`（`null` なら recordKey の 1 つ目。画面でも選べる） |
| 列の種類（自動の判定を変えたいときだけ） | `schema.types`（`"date"` か `"text"`） |
| 起動時の並び順 | `view.defaultSort`（列がなければ固定列の順） |
| 最初は隠しておく列 | `view.hiddenColumns`。各自が画面の「表示列」で出し入れでき、選んだ内容はブラウザに保存 |
| 等幅・コピー・入力例・値の札（任意） | `view.fields.<DB の列名>`（`mono` / `copy` / `example` / `badge`） |
| 別名（任意） | `schema.columns`（論理名 → DB の列名。公開サンプルを論理名で書くため） |

絞り込める列は設定しません（全列で絞り込める）。以前の形の設定（`view.searchFields`・`view.filters`・全列の `columns`・`listColumns`・`detailFields`・`detailGroups`・`fields.*.label`）が残っていても止まりません。
「今は使わない項目です」という注意を出すので、消してかまいません。以前の形で保存したタグ・表示列・列幅は、起動時に DB の列名へ自動で読み替えます。

### 固定列（レコードキー）の選び直し（似た DB を読み込んだとき・使わない列を外したいとき）

列名の違う似た DB に切り替えると、固定列が見つからないことがあります。そのときも止めずに起動し、次のように案内します。

1. 右上の青いボタンが「固定列を選ぶ」に変わり、左の「データ」に赤い印が付く（黒いウィンドウにも「列の注意」）。
2. 「データ」→「固定列」→「変更」で、列名を 1〜3 つ入れる（候補から選べる。`Enter` で次の欄へ）。番号で探す列も選べる（空欄なら 1 つ目）。
3. 「確かめる」で、その組み合わせで 1 件に決まるかを数える。重なりがあれば △ と例を出す（保存はできる。詳細は重なった中の最初の 1 件）。
4. 「保存」で `schema.local.json` の `recordKey`・`searchColumn` に DB の列名で書き込み（ほかの項目はそのまま。書き換え前は `.bak`）、画面を読み込み直す。キャッシュは作り直さない。

### 一覧の使い方（全列表示）

- 左端の固定列（レコードキー。標準はロット番号・BOX番号）は、横に動かしても残ります。見出しの鍵のアイコンを押すと、固定列を変える場所が開きます。見出しは縦に動かしても残ります。
- 長い値は「…」で省き、マウスを乗せると全文が出ます。見出しの右端をドラッグで幅を変更（ダブルクリックで元に戻す）。幅はブラウザに保存。
- 一覧の上の「列を探す」に列名の一部を入れて `Enter`：その列まで横に移動して光ります（隠している列なら「表示する」を案内）。
- 右の ⤢ ボタンで行の高さを「詰める／ゆったり」に切り替え。
- 行を 1 回押す（または `↑` `↓`）と選ぶだけ。ダブルクリックか `Enter` で右に詳細（全項目。主な項目／そのほかの項目）。詳細を開いている間は、選んだ行に合わせて詳細も切り替わります。
- 見出しの列名を押すと並べ替え、右の漏斗（じょうご）を押すとその列の絞り込みが列の真下に開きます（`Tab` で漏斗に移って `Enter` でも開く。`Esc`・小窓の外を押す・押し直しで閉じる）。絞り込み中の列は見出しの色が変わり、漏斗が塗りつぶされます。
- データの更新で DB の列が増減したとき・固定列を変えたときは、自動で画面を読み込み直します（選んだ列・幅・タグは残る）。

### 読み込み先の確認と変更

画面左の「データ」→「読み込み先」で、今の共有 SQLite のパスを確かめ、変更できます（Python 版・デスクトップ版。サンプルのモードでは模擬の動き）。

- **接続を確かめる**：次の順に確かめ、段階ごとに ○ △ × と、△ × のときは理由・対応を出します。コピーも書き込みもしません（共有側にロックや一時ファイルも作りません）。

  | 順 | 段階 | × の例 |
  |---|---|---|
  | ① | パスの書き方 | 空・仮の値・フォルダのパス |
  | ② | 場所に届くか | フォルダに届かない（ネットワーク・VPN）・ファイルがない |
  | ③ | 読めるか | 権限がない・使用中 |
  | ④ | SQLite として開けるか | SQLite ではない・壊れている |
  | ⑤ | テーブルと列 | schema の tableName のテーブルがない（×）。固定列がない（△：保存したあと画面で選び直せる） |
  | ⑥ | 件数 | 結果として件数と更新日時を表示 |

- **変更**：エクスプローラーでファイルを Shift＋右クリック →「パスとしてコピー」して貼り付け（前後の `"` は自動で外す）→ `Enter` で確かめる → × がなければ「保存して更新」にフォーカスが移り、`Enter` で保存。
  - 保存先は `config/local/config.local.json` の `dataSource.sourcePath`（ほかの項目はそのまま。書き換え前は `.bak` に残す）。
  - 保存後に設定を読み直して検証し、誤りが出たら保存を取り消します。問題がなければ、そのままデータを更新します。
  - 確かめた後に入力を変えると、もう一度確かめるまで保存できません。
- 前の読み込み先から作ったキャッシュは使いません（キャッシュの状態に読み込み先の印を残して見分ける。パスそのものは残さない）。
- 起動時にキャッシュを作れなかったときも、黒いウィンドウに同じ接続テストの結果を出します。
- 変更できる人の制限（権限）は今後の課題です。

### 絞り込みとタグ

- **どの列でも絞り込める**。見出しの漏斗から開く小窓（列ごと）と、左の「絞り込み」パネル（今の条件の一覧・すべて解除・隠している列への「条件を足す」）は同じ部品。
- 文字の列は値の一覧から複数選択（件数つき・空欄も選べる）。値が多い列（200 個を超える）は、上の欄に打つとデータ全体から探す。数値で入っている値も、一覧に出た文字のまま選べる。
- 日付の列（値から自動で判定）は「今日より前／今日／今日〜7 日後／今日〜30 日後／7 日前〜今日」のほか、今日からの日数や日付そのもので指定できる。
  **今日からの日数で決めたタグは、毎日その日を基準に絞り込む**（翌月も使える）。
- 列どうしは「かつ」、同じ列の中は「または」。番号の検索とも「かつ」。
- 今のデータにない列の条件を持つタグは、その条件を外して絞り込む（タグそのものは消さない。別の読み込み先に戻すとまた使える）。
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
│  │  ├─ domain/       列の登録簿（表示定義から組み立て）・値の札・絞り込みの種類
│  │  ├─ api/          API の窓口とアダプター（tauri / http / mock）
│  │  ├─ sample/       サンプルデータ（種を固定）と、サンプル用の表示定義（自動生成）
│  │  ├─ controllers/  操作（検索・詳細・データ更新・サンプル・タグ・読み込み先・固定列）
│  │  ├─ views/        画面の部品（上部バー・タグ・一覧・見出しの絞り込み・絞り込みの部品・詳細・パネル枠・通知・固定列）
│  │  ├─ panels/       脇のパネル（絞り込み・データ・表示列・サンプル）
│  │  ├─ manual/       取扱説明書
│  │  └─ app.js        起動と組み立て（最初に表示定義を読み込む）
│  └─ assets/vendor/fontawesome/  … Font Awesome Free 6.5.2（同梱・オフラインで動く）
├─ python/                        … Python 版バックエンド（Rust 版の手本）
│  ├─ run_server.py               … 起動
│  ├─ data_search/
│  │  ├─ settings/                … 設定の読み込み（loader）・再帰マージ（merge）・検証（validation）・既定値（defaults）
│  │  ├─ column_catalog.py        … DB の列と、値から見た種類（日付か）
│  │  ├─ column_model.py          … 設定と DB の列から、列の決まり（並び・種類・固定列・探す列・注意）を作る
│  │  ├─ record_service.py        … 固定列の確認・保存
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
| 絞り込める列 | 何もしない（全列で絞り込める。日付の列は値から自動で判定。変えたいときだけ `schema.types`） |
| 値の札の色分け | `view` の `fields.<DB の列名>.badge` |
| 絞り込みの種類（例：数値の範囲） | `js/domain/filters.js` の `filterTypes.register()` と `views/filter-editors.js` の `DS.filterEditors.register()`、Python の `column_model.py`（種類の判定）・`lot_service.py`（`filter_kind`・`parse_filters`）・`query.py` |
| 別のツールへ渡すボタン | `DS.handoffs.register({ id, label, icon, send(item) })` で詳細の下にボタンが出る（item は全列。キーは DB の列名。論理名で取るときは `DS.domain.migrateId('lotNo')` で読み替える） |
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
| `column_catalog.py` / `column_model.py` | `models/catalog.rs` / `models/column_model.rs` |
| `lot_service.py` | `services/lot_service.rs` |
| `source_check.py` / `source_service.py` / `settings/local_writer.py` / `settings_updater.py` | `cache/source_check.rs` / `services/source_service.rs` / `config/local_writer.rs` / `config/updater.rs` |
| `record_service.py` | `services/record_service.rs` |
| `commands.py` | `commands/search.rs`・`commands/cache.rs`・`commands/view.rs`・`commands/source.rs`・`commands/record.rs` |
| `errors.py` / `logging_setup.py` | `errors/mod.rs` / `logging/mod.rs` |
| `http_server.py`（Python 版だけ） | 不要（Tauri の invoke に置き換わる） |

Tauri 版の画面側は `js/api/remote-adapters.js` の `tauri` アダプターが `invoke(命令名, { request })` で呼びます。
`tauri.conf.json` で `app.withGlobalTauri: true` にしてください。Font Awesome は同梱済みなので、そのまま組み込めます。

---

## API（04_api_spec.md からの追加・変更点）

命令名と基本の入出力は `04_api_spec.md` のとおりです。以下を追加・変更しました。**`04_api_spec.md` への反映をお願いします。**

| 命令 | 変更点 | 理由 |
|---|---|---|
| `get_view_config`（新規） | 戻り値は DB の全列 `columns: [{ id（DB の列名）, label（同じ）, kind: date/text, role }]`、`recordKey`・`searchColumn`（DB の列名）、`defaultSort`・`hiddenColumns`・`fields`、`aliases`（別名 → DB の列名）、`notices`（設定と DB の食い違い）、`ready`（固定列がそろったか）、`columnsVersion`、`recordSettingsFile`。**テーブル名・パスは含めない** | 列をソースコードにも設定にも固定せず、DB の列名で表示・絞り込みするため |
| `list_lots`（新規） | 入力は `search_lots` と同じで、番号（`keyword`）は省略可。`filters` を追加。戻り値も同じ形 | 起動時に入力なしで一覧を出し、絞り込むため |
| `get_filter_values`（新規） | 入力 `{ field（DB の列名）, filters, (番号の検索), match? }`、戻り値 `{ success, field, values: [{ value, count }], truncated, match }`。`match` を渡すとその文字を含む値だけ。日付の列は対象外 | 絞り込みの値を件数つきで見て選ぶため。値が多い列でも探せるように |
| `search_lots` | **`searchType` は使わない**（探す列は設定の `searchColumn` で 1 つに決まる。送っても無視）。入力に `sortKey`（DB の列名・既定は defaultSort）・`sortOrder`（asc/desc）・`filters`（キーは DB の列名。全列で使える）を追加（省略可） | 番号の検索は 1 列、ほかの列は見出しから絞り込むため |
| `search_lots` / `list_lots` | 戻り値に `keyword`（正規化後）・`today`（日付の基準日）・`elapsedMs` を追加。`items` は全列（キーは DB の列名） | 画面に根拠（全角→半角・基準日・検索時間）を出すため |
| `get_lot_detail` | 入力は固定列の `{ DB の列名: 値 }`。戻り値は `{ success, item, duplicated }`。固定列がそろっていなければ `KEY_NOT_READY` | 選んだ列で 1 件に決まるため |
| `check_record_key`（新規） | 入力 `{ recordKey: [DB の列名 1〜3 個] }`。戻り値 `{ success, recordKey, rowCount, duplicateGroups, duplicateRows, blankRows, unique, example: { values, count } \| null }`。保存しない | 選んだ列で 1 件に決まるかを、保存の前に確かめるため |
| `update_record_settings`（新規） | 入力 `{ recordKey, searchColumn? }`。`schema.local.json` の `recordKey`・`searchColumn` に DB の列名で保存し、列の決まりを差し替える（キャッシュは作り直さない）。戻り値 `{ success, saved, recordKey, searchColumn, localFile, message }` | 似た DB でも、画面から列を選び直して使えるように |
| `get_data_source`（新規） | 戻り値 `{ success, sourcePath, editable, localFile }` | 画面で今の読み込み先を示すため |
| `test_data_source`（新規） | 入力 `{ sourcePath? }`（省くと今の読み込み先）。戻り値 `{ success, ok, steps: [{ id, label, status: ok/warn/ng/skip, message, action }], rowCount, modifiedAt, normalizedPath }`。`ok` は × がないこと（△ は含む） | 段階ごとに接続を確かめるため |
| `update_data_source`（新規） | 入力 `{ sourcePath }`。接続テストで × がないときだけ保存してデータを更新。戻り値は test の結果＋`{ saved, refreshed, message, localFile }` | 読み込み先を画面から直すため |
| `get_cache_status` | `columnsVersion`（列の決まりが変わったかの印）・`rowCount`・`sourceReachable`・`sourceHasUpdate`・`lastRefreshAt`・`errorCode`・`errorMessage`・`settingsWarnings` を追加 | 「データ」パネルで状態の根拠と設定の注意を示すため |
| `refresh_cache` | 戻り値に `rowCount` を追加 | 更新の結果を件数で示すため |
| 設定 | `devServer`（host / port / openBrowser）・`cache`（temporaryExtension / keepPreviousOnFailure）は sample に書かなくてもアプリ内の既定値を使う。変えたいときだけ sample か local に書く | sample を簡潔に保つため。`devServer` は Python 版のみ |

検索の決まり：検索値は前後の空白を除き、全角英数・記号を半角にそろえ（NFKC）、大文字小文字を区別しません。
部分一致の `%` `_` は文字として扱います。SQL はすべてパラメーター化しています。

`filters` の形：

```json
{
  "状態":     { "type": "values", "values": ["仕掛中", null] },
  "工場納期": { "type": "date", "mode": "relative", "fromDays": 0, "toDays": 7 }
}
```

- キーは DB の列名。`type` は列の種類で決まる（日付の列は `date`、ほかは `values`）。
- `values` の `null` は空欄。日付の `mode` は `relative`（今日を 0 とした日数。片方 `null` で制限なし）か `absolute`（`from` / `to` に `YYYY-MM-DD`）。
- 相対の日付はバックエンドが「今日」で具体的な日付に直す。
- 実データの日付は `YYYY-MM-DD`・`YYYY/MM/DD`・`YYYYMMDD`（時刻付きも可）に対応。月日が 1 桁の書き方（`2026/1/5`）は未対応。
- 並べ替えでは空欄を昇順・降順どちらでも最後に回す。

エラーは `{ success: false, error: { code, userMessage, detailId } }`。`detailId` でログの該当行を探せます。
ログには検索値そのもの・検索結果・設定の値（パス・表名・列名）は出さず、種類・件数・時間・項目名だけを記録します。

---

## 確かめ方

```bash
# バックエンド（実データ不要。設定のマージ・検証、列の決まり（並び・日付の判定・別名）、キャッシュの正常・接続不可・破損・表なし・
# 固定列なし、検索の 0 件・日本語・記号・SQL 注入、全列の絞り込み、固定列の確認・保存、HTTP を確認）
python -m unittest discover -s python/tests -v
```

画面：`src/index.html` を開き、F12 → コンソールに `tests/ui-check.js` の中身を貼って Enter。「すべて成功」と出れば OK。

大量データ：画面は「サンプル → 大量のデータ（ロット 10,000 件）」、Python 版は
`python python/tools/make_dummy_db.py --lots 50000` でロット 5 万件（BOX 約 10 万件）のダミーを作れます。

異常系の再現：`python python/tools/make_dummy_db.py --variant corrupt`（`missing-table` も可）の後に、
画面で「データを更新する」→ 前回のデータを使い続けることを確認。`--variant normal` で元に戻ります。
似た DB（固定列の BOX番号 がない）：`--variant missing-key` の後に「データを更新する」→ 青いボタンが「固定列を選ぶ」に変わり、選び直して使えることを確認。

---

## 今後の候補

- 別ツールとの連携（詳細の全項目を渡す）：`DS.handoffs.register()` で送り先を足す
- 起動時に使う既定のタグ
- 全員で同じタグを共有する仕組み（共有フォルダへの保存）
- Tauri 版（Rust）の実装
- 一覧の CSV／Excel 出力
