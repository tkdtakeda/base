# 対象データ検索（data-search）

共有 SQLite のロットを一覧で表示し、絞り込み（タグで保存・再利用）とクリックで詳細を参照するツールです。
番号（ロット・検査・鋳造・受注）が分かっているときは、入力して探すこともできます。
共有データは直接検索せず、**手元へコピー → 検証 → 問題がなければ入れ替え** たローカルキャッシュを検索します。

最終形は Tauri + Rust のデスクトップアプリですが、ビルド前に使用感を確かめられるよう、
**同じ画面・同じ命令（API）で動く 3 つの起動方法**を用意しています。

| 起動のしかた | 上部バーの表示 | 検索するデータ | 用途 |
|---|---|---|---|
| `src/index.html` をダブルクリック（Edge） | サンプル | ブラウザの中のサンプル | 画面の使用感を確かめる |
| `start-dummy.bat` をダブルクリック | Python 版 | ダミーの共有 SQLite | Python 版の動きを確かめる（実データ不要） |
| `start.bat` をダブルクリック | Python 版 | `config/config.local.json` が指す共有 SQLite | 実データで試す |
| デスクトップ版（今後） | デスクトップ版 | 同上 | 本番 |

---

## 3 分で使う

1. `src/index.html` を Edge で開く（サーバーやビルドは不要）。
2. 右上の青いボタン「サンプルを読み込む」→ 左のパネルで「標準のデータ」を **読み込む**。ロットの一覧が納期の近い順に出る。
3. 一覧の上の「絞り込み」で条件を選ぶ（例：状態＝仕掛中、納期＝今日〜30 日後）→「今の条件をタグにする」で名前を付けて保存。次回からはタグを押すだけ。
4. ロットの行を押すと右に詳細。`↑` `↓` で行を移動、`Esc` で閉じる。`F1` で取扱説明書。
5. 番号が分かっているときは上部バーに入れて `Enter`（今の絞り込みの中から探す）。

## 実データで試す（Python 版）

前提：Python 3.12（標準ライブラリだけで動きます。pip での追加は不要）。

1. `config/config.sample.json` をコピーして `config/config.local.json` を作る。
2. `<...>` の仮の値を実際の値に書き換える（共有 SQLite のパス・表名・列名）。**キーの名前と構造は変えない。**
3. `start.bat` をダブルクリック。黒いウィンドウが開き、Edge で画面が開きます。
   - 初回はキャッシュを自動で作成します。以後は画面左の「データ」→「データを更新する」で更新します。
   - 終了は黒いウィンドウを閉じます。
4. 実データなしで流れを確かめるときは `start-dummy.bat`（ダミーの共有 SQLite と `config/config.dummy.json` を自動で作ります）。

---

## 設定ファイルの決まり

| # | 決まり |
|---|---|
| 1 | `config/config.sample.json` がシステムの**正式な設定スキーマ**（キーの構造と値の型の定義） |
| 2 | アプリは `config.sample.json` のスキーマを基準に動く（読み込んだ設定は必ずスキーマと照合する） |
| 3 | `config.local.json` は同じスキーマで、**値だけ**を実環境のものにする（社内情報を含むため外部に出さない・Git 管理外） |
| 4 | sample と local の**キー構造の違いは許さない**。足りないキー・余分なキー・型の違い（文字列／整数／true・false／{ }）があれば起動を止め、違う箇所をすべて表示する |
| 5 | 読み込む順は `config.local.json` → なければ `config.sample.json`（`--config` で明示したときはそのファイル） |
| 6 | 設定項目を足すときは **sample と local の両方**に足す（sample だけに足すと、local は「キーがありません」で起動しない） |

`config.sample.json` で起動したとき（`config.local.json` がないとき）は、データの場所と表・列の名前が仮の値のままなので
**「設定が未完了」の状態で起動**します。共有データにもキャッシュにも触れず、黒いウィンドウと画面（上部バー右の札・左の「データ」）に、
読み込んだファイル・仮の値のままの項目・直し方を表示します。

| 状態 | 起動 | 表示 |
|---|---|---|
| local がスキーマどおりで値も入っている | する | 通常どおり |
| local がない（sample で起動） | する | 設定が未完了（直し方を表示） |
| local に仮の値が残っている（データの場所・表名・列名） | する | 設定が未完了（残っている項目を表示） |
| local のキー構造・型がスキーマと違う | しない | 違う箇所をすべて表示 |
| 値の範囲がおかしい（例：pageSize が maxPageSize より大きい） | しない | 理由を表示 |

### 設定項目を足すときの手順

1. `config.sample.json` に、仮の値（または既定値）でキーを足す
2. 各環境の `config.local.json` に、同じキーを実際の値で足す
3. `python/data_search/config_loader.py` の `AppConfig` と `load_config()` で値を受け取る（値の範囲の確認もここ）
4. `config.dummy.json` は `make_dummy_db.py` が sample から作るので、作り直すだけでよい

---

## 画面の考え方（基本設計への対応）

| 原則 | この画面での実装 |
|---|---|
| 面積は頻度×重要度（1-1） | 一覧を最大に。よく使うタグは一覧の上に常に表示。条件づくり・データ・サンプルは左のアイコン列から開くパネル（最初は閉じる） |
| 次にすることを 1 つ（1-2） | 右上の青いボタンだけが主要動作。状態でラベルが変わる（サンプルを読み込む → 検索する → 検索中…） |
| 色だけで伝えない（1-3） | 状態の札・通知・データの状態はすべて「アイコン＋文字＋色」 |
| できないことは書く（1-4） | 押せない理由を入力欄の下に表示。アイコンが読めないときは文字に切り替え |
| 危ない操作は外す（1-5） | タグの削除は選んだタグの ⋮ の中、「サンプルだけを消す」はパネルの最下部。どちらも確認ダイアログではなく 10 秒間の「元に戻す」。絞り込みの「すべて解除」も元に戻せる |
| 出どころ・根拠（1-6） | 上部バー右と一覧の下に「どのデータの何時点か」「検索時間」「全角を半角にそろえたか」。「データ」パネルに根拠 |
| トークン（1-7） | 生の値は `src/css/tokens.css` だけ。基本の値 → 意味づけの 2 段 |
| スクロールレス（1-8） | 画面は `100dvh`。一覧・パネル・詳細の内側だけがスクロール |

入力欄は選ぶと全選択、`Enter` で検索（日本語の変換中は除く）、`Esc` で消去して一覧に戻る。前に探した番号が候補に出ます。
日付の指定は 年 4 桁・月 2 桁・日 2 桁 を入れると次の欄へ自動で移り、`Enter` で次へ／`Shift+Enter` で前へ移ります。

### 絞り込みとタグ

- 絞り込める項目：材質・質別・得意先・工程・設備・状態（値の一覧から複数選択。件数つき・空欄も選べる）、納期（日付の範囲）。
- 日付は「今日より前／今日／今日〜7 日後／今日〜30 日後／7 日前〜今日」のほか、今日からの日数や日付そのもので指定できる。
  **今日からの日数で決めたタグは、毎日その日を基準に絞り込む**（翌月も使える）。
- 項目どうしは「かつ」、同じ項目の中は「または」。番号の検索とも「かつ」。
- タグはブラウザに自動保存。絞り込みパネルの下で JSON に書き出し／読み込み（ファイル選択・ドラッグ＆ドロップ）でき、ほかの人と共有できる。
- 起動時の既定のタグは、今は設けていない（すべてのロットを納期の近い順に表示）。

---

## フォルダ構成

```text
data-search/
├─ README.md
├─ start.bat / start-dummy.bat    … Python 版の起動（Windows）
├─ config/
│  ├─ config.sample.json          … 外部提示用（プレースホルダー）
│  ├─ config.local.json           … 実環境用（自分で作る・Git 管理外）
│  └─ config.dummy.json           … ダミー用（自動生成・Git 管理外）
├─ src/                           … 画面（3 つの起動方法で共通）
│  ├─ index.html
│  ├─ css/   tokens.css / base.css / components.css / layout.css / filters.css
│  ├─ js/
│  │  ├─ core/         核（EventBus・Store・登録簿・保存・道具）
│  │  ├─ domain/       論理項目と表示名・状態の札
│  │  ├─ api/          API の窓口とアダプター（tauri / http / mock）
│  │  ├─ sample/       サンプルデータ（種を固定）
│  │  ├─ controllers/  操作（検索・詳細・データ更新・サンプル）
│  │  ├─ views/        画面の部品（上部バー・一覧・詳細・パネル枠・通知）
│  │  ├─ panels/       脇のパネル（絞り込み・データ・表示列・サンプル）
│  │  ├─ manual/       取扱説明書
│  │  └─ app.js        起動と組み立て
│  └─ assets/vendor/fontawesome/  … Font Awesome Free 6.5.2（同梱・オフラインで動く）
├─ python/                        … Python 版バックエンド（Rust 版の手本）
│  ├─ run_server.py
│  ├─ data_search/
│  ├─ tools/make_dummy_db.py
│  └─ tests/test_backend.py
├─ tests/ui-check.js              … 画面の動作確認（コンソールに貼って使う）
├─ data/   … キャッシュ・ダミー（Git 管理外）
└─ logs/   … ログ（Git 管理外）
```

### 機能の足し方（既存のコードを変えずに増やせる所）

| 増やすもの | 足す場所 |
|---|---|
| 表示項目 | `js/domain/fields.js` の `register()`（＋ Python の `fields.py` と設定の `fieldMappings`） |
| 日付の絞り込み（作業日など） | 上の項目に `type: 'date', filter: 'date'` を付け、Python の `FILTER_FIELDS` に `"date"` で足す。それだけで納期と同じ絞り込みが使える |
| 値の絞り込み | 項目に `filter: 'values'`（＋ `FILTER_FIELDS` に `"values"`） |
| 絞り込みの種類（例：数値の範囲） | `js/domain/filters.js` の `filterTypes.register()` と `panels/filter-panel.js` の `editors.register()`、Python の `query.py` |
| 別のツールへ渡すボタン | `DS.handoffs.register({ id, label, icon, send(item) })` で詳細の下にボタンが出る（item は 12 項目） |
| 状態の札の種類 | `js/domain/status-tones.js` の `register()` |
| 脇のパネル（例：絞り込み） | `DS.panels.register()` |
| サンプルのパターン | `js/sample/sample-data.js` の `patterns.register()` |
| 取扱説明書の章 | `js/manual/manual-content.js` の `register()` |
| 命令（API） | Python：`commands.py` の `@command()`／画面：`api-client.js` の `COMMANDS` |
| 接続先 | `DS.api.adapters.register()` |

---

## Python 版 → Rust 版への対応

Python 版は Rust 版の構成（`05_directory_structure.md`）に合わせています。移植時はファイル単位で置き換えられます。

| Python | Rust |
|---|---|
| `config_loader.py` | `config/loader.rs` |
| `fields.py` | `models/lot.rs` |
| `cache_copier.py` / `cache_validator.py` / `cache_service.py` | `cache/copier.rs` / `cache/validator.rs` / `cache/mod.rs` |
| `query.py` | `db/query.rs` |
| `lot_service.py` | `services/lot_service.rs` |
| `commands.py` | `commands/search.rs`・`commands/cache.rs` |
| `errors.py` / `logging_setup.py` | `errors/mod.rs` / `logging/mod.rs` |
| `http_server.py`（Python 版だけ） | 不要（Tauri の invoke に置き換わる） |

Tauri 版の画面側は `js/api/remote-adapters.js` の `tauri` アダプターが `invoke(命令名, { request })` で呼びます。
`tauri.conf.json` で `app.withGlobalTauri: true` にしてください。Font Awesome は同梱済みなので、そのまま組み込めます。

---

## API（04_api_spec.md からの追加・変更点）

命令名と基本の入出力は `04_api_spec.md` のとおりです。以下を追加・変更しました。**`04_api_spec.md` への反映をお願いします。**

| 命令 | 変更点 | 理由 |
|---|---|---|
| `list_lots`（新規） | 入力は `search_lots` と同じで、番号（`keyword` など）は省略可。`filters` を追加。戻り値も同じ形 | 起動時に入力なしで一覧を出し、絞り込むため |
| `get_filter_values`（新規） | 入力 `{ field, filters, (番号の検索) }`、戻り値 `{ success, field, values: [{ value, count }], truncated }` | 絞り込みの値を件数つきで見て選ぶため |
| `search_lots` | 入力に `sortKey`（論理名・既定は deliveryDate）・`sortOrder`（asc/desc）・`filters` を追加（省略可） | 見出しでの並べ替えをページをまたいで正しく行うため |
| `search_lots` / `list_lots` | 戻り値に `keyword`（正規化後）・`today`（日付の基準日）・`elapsedMs` を追加 | 画面に根拠（全角→半角・基準日・検索時間）を出すため |
| `get_lot_detail` | 入力を `{ lotNo, castingNo }` に変更。戻り値は `{ success, item, duplicated }` | ロット番号＋鋳造番号で 1 件に決まるため |
| `get_cache_status` | `rowCount`・`sourceReachable`・`sourceHasUpdate`・`lastRefreshAt`・`errorCode`・`errorMessage` を追加 | 「データ」パネルで状態の根拠を示すため |
| `refresh_cache` | 戻り値に `rowCount` を追加 | 更新の結果を件数で示すため |
| 設定 | `devServer`（host / port / openBrowser）を追加 | Python 版のみで使用。Tauri 版では無視してよい（キーは残す。スキーマを sample と一致させるため） |
| `get_cache_status` | `configSource`・`configFile`・`configIncomplete`・`incompleteSettings` を追加 | 設定が未完了のとき、画面で読み込んだファイルと直す項目を示すため |

検索の決まり：検索値は前後の空白を除き、全角英数・記号を半角にそろえ（NFKC）、大文字小文字を区別しません。
部分一致の `%` `_` は文字として扱います。SQL はすべてパラメーター化しています。

`filters` の形：

```json
{
  "status":       { "type": "values", "values": ["仕掛中", null] },
  "deliveryDate": { "type": "date", "mode": "relative", "fromDays": 0, "toDays": 7 }
}
```

- `values` の `null` は空欄。日付の `mode` は `relative`（今日を 0 とした日数。片方 `null` で制限なし）か `absolute`（`from` / `to` に `YYYY-MM-DD`）。
- 相対の日付はバックエンドが「今日」で具体的な日付に直す。
- 実データの日付は `YYYY-MM-DD`・`YYYY/MM/DD`・`YYYYMMDD`（時刻付きも可）に対応。月日が 1 桁の書き方（`2026/1/5`）は未対応。
- 並べ替えでは空欄を昇順・降順どちらでも最後に回す。

エラーは `{ success: false, error: { code, userMessage, detailId } }`。`detailId` でログの該当行を探せます。
ログには検索値そのものと検索結果は出さず、種類・文字数・件数・時間だけを記録します。

---

## 確かめ方

```bash
# バックエンド（実データ不要。正常・接続不可・破損・表なし・列なし・0 件・日本語・記号・SQL 注入を確認）
python -m unittest discover -s python/tests -v
```

画面：`src/index.html` を開き、F12 → コンソールに `tests/ui-check.js` の中身を貼って Enter。「すべて成功」と出れば OK。

大量データ：画面は「サンプル → 大量のデータ（20,000 件）」、Python 版は
`python python/tools/make_dummy_db.py --rows 100000` で 10 万件のダミーを作れます。

異常系の再現：`python python/tools/make_dummy_db.py --variant corrupt`（`missing-table` / `missing-column` も可）の後に、
画面で「データを更新する」→ 前回のデータを使い続けることを確認。`--variant normal` で元に戻ります。

---

## 今後の候補

- 別ツールとの連携（詳細の 12 項目を渡す）：`DS.handoffs.register()` で送り先を足す
- 起動時に使う既定のタグ
- 全員で同じタグを共有する仕組み（共有フォルダへの保存）
- Tauri 版（Rust）の実装
- 一覧の CSV／Excel 出力
