# 対象データ検索（data-search）

ロット番号・検査番号・鋳造番号・受注番号から、共有 SQLite のデータを検索して参照するツールです。
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
2. 右上の青いボタン「サンプルを読み込む」→ 左のパネルで「標準のデータ」を **読み込む**。
3. 上部バーで番号の種類を選び（`Alt+1〜4`）、番号を入れて `Enter`。
4. 行を選ぶと右に詳細。`↑` `↓` で行を移動、`Esc` で閉じる。`F1` で取扱説明書。

## 実データで試す（Python 版）

前提：Python 3.12（標準ライブラリだけで動きます。pip での追加は不要）。

1. `config/config.sample.json` をコピーして `config/config.local.json` を作る。
2. `<...>` のプレースホルダーを実際の値に書き換える（共有 SQLite のパス・表名・列名）。
3. `start.bat` をダブルクリック。黒いウィンドウが開き、Edge で画面が開きます。
   - 初回はキャッシュを自動で作成します。以後は画面左の「データ」→「データを更新する」で更新します。
   - 終了は黒いウィンドウを閉じます。
4. 実データなしで流れを確かめるときは `start-dummy.bat`（ダミーの共有 SQLite と `config/config.dummy.json` を自動で作ります）。

設定に誤りがあるときは、黒いウィンドウに理由（例：`dataSource.tableName がプレースホルダーのままです`）が出ます。

---

## 画面の考え方（基本設計への対応）

| 原則 | この画面での実装 |
|---|---|
| 面積は頻度×重要度（1-1） | 一覧を最大に。設定・データ・サンプルは左のアイコン列から開くパネル（最初は閉じる） |
| 次にすることを 1 つ（1-2） | 右上の青いボタンだけが主要動作。状態でラベルが変わる（サンプルを読み込む → 検索する → 検索中…） |
| 色だけで伝えない（1-3） | 状態の札・通知・データの状態はすべて「アイコン＋文字＋色」 |
| できないことは書く（1-4） | 押せない理由を入力欄の下に表示。アイコンが読めないときは文字に切り替え |
| 危ない操作は外す（1-5） | 「サンプルだけを消す」はパネルの最下部。確認ダイアログではなく 10 秒間の「元に戻す」 |
| 出どころ・根拠（1-6） | 上部バー右と一覧の下に「どのデータの何時点か」「検索時間」「全角を半角にそろえたか」。「データ」パネルに根拠 |
| トークン（1-7） | 生の値は `src/css/tokens.css` だけ。基本の値 → 意味づけの 2 段 |
| スクロールレス（1-8） | 画面は `100dvh`。一覧・パネル・詳細の内側だけがスクロール |

入力欄は選ぶと全選択、`Enter` で検索（日本語の変換中は除く）、`Esc` で消去。前に探した番号が候補に出ます。

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
│  ├─ css/   tokens.css / base.css / components.css / layout.css
│  ├─ js/
│  │  ├─ core/         核（EventBus・Store・登録簿・保存・道具）
│  │  ├─ domain/       論理項目と表示名・状態の札
│  │  ├─ api/          API の窓口とアダプター（tauri / http / mock）
│  │  ├─ sample/       サンプルデータ（種を固定）
│  │  ├─ controllers/  操作（検索・詳細・データ更新・サンプル）
│  │  ├─ views/        画面の部品（上部バー・一覧・詳細・パネル枠・通知）
│  │  ├─ panels/       脇のパネル（データ・表示列・サンプル）
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
| `search_lots` | 入力に `sortKey`（論理名）・`sortOrder`（asc/desc）を追加（省略可） | 見出しでの並べ替えをページをまたいで正しく行うため |
| `search_lots` | 戻り値に `keyword`（正規化後）・`elapsedMs` を追加 | 画面に根拠（全角→半角・検索時間）を出すため |
| `get_lot_detail` | 入力を `{ lotNo, castingNo }` に変更。戻り値は `{ success, item, duplicated }` | ロット番号＋鋳造番号で 1 件に決まるため |
| `get_cache_status` | `rowCount`・`sourceReachable`・`sourceHasUpdate`・`lastRefreshAt`・`errorCode`・`errorMessage` を追加 | 「データ」パネルで状態の根拠を示すため |
| `refresh_cache` | 戻り値に `rowCount` を追加 | 更新の結果を件数で示すため |
| 設定 | `devServer`（host / port / openBrowser）を追加 | Python 版のみで使用。Tauri 版では無視してよい |

検索の決まり：検索値は前後の空白を除き、全角英数・記号を半角にそろえ（NFKC）、大文字小文字を区別しません。
部分一致の `%` `_` は文字として扱います。SQL はすべてパラメーター化しています。

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

- 絞り込み（納期の範囲・状態・工程・得意先）：パネルを `register()` で追加し、Rust/Python 側で SQL として絞り込む（ページ分割と整合させるため）
- Tauri 版（Rust）の実装
- 一覧の CSV／Excel 出力
