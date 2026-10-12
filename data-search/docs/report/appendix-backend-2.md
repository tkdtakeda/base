## 付録：バックエンド・ツール・設定の修正ファイルの全文（2/2）

`python/data_search/settings/local_writer.py`

```python
"""ローカルの上書きファイル（config/local/*.local.json）へ、必要な項目だけを書き込む。

ほかの項目はそのまま残し、書き換える前の内容は <ファイル>.bak に残す。
書き込みは一時ファイル → 置き換えの順で行い、途中で止まっても壊れたファイルを残さない。
"""

import json
import os
import shutil


def local_file(local_dir, kind):
    return os.path.join(local_dir, f"{kind}.local.json")


def set_local_value(local_dir, kind, path, value):
    """path（例：("dataSource", "sourcePath")）の値を書き込む。書き込んだファイルのパスを返す。"""
    return set_local_values(local_dir, kind, {path: value})


def set_local_values(local_dir, kind, values, delete=()):
    """{path: 値} をまとめて 1 回で書き込み、delete の path を消す（控えの .bak も 1 回だけ作る）。書き込んだファイルのパスを返す。"""
    target = local_file(local_dir, kind)
    data = {}
    if os.path.isfile(target):
        with open(target, encoding="utf-8-sig") as fp:
            data = json.load(fp)
        if not isinstance(data, dict):
            raise ValueError("local file is not an object")
        shutil.copyfile(target, target + ".bak")
    for path, value in values.items():
        node = data
        for key in path[:-1]:
            child = node.get(key)
            if not isinstance(child, dict):
                child = {}
                node[key] = child
            node = child
        node[path[-1]] = value
    for path in delete:
        node = data
        for key in path[:-1]:
            node = node.get(key) if isinstance(node, dict) else None
        if isinstance(node, dict):
            node.pop(path[-1], None)
    os.makedirs(local_dir, exist_ok=True)
    temp = target + ".writing"
    with open(temp, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    os.replace(temp, target)
    return target


def restore_backup(local_dir, kind, existed):
    """書き込みを取り消す（.bak に戻す。元のファイルがなかったときは消す）。"""
    target = local_file(local_dir, kind)
    if existed and os.path.isfile(target + ".bak"):
        shutil.copyfile(target + ".bak", target)
    elif not existed and os.path.isfile(target):
        os.remove(target)
```

`python/data_search/source_check.py`

```python
"""読み込み先（共有 SQLite）の接続テスト。コピーも書き込みもせず、順に確かめて結果を返す。

    ① パスの書き方  ② 場所に届くか  ③ 読めるか  ④ SQLite として開けるか  ⑤ テーブル・列  ⑥ 件数
前の段階が × なら、後の段階は「確かめていない」（skip）にする。画面には段階ごとに 理由・対応 を出す。
△（warn）は「使えるが、保存のあとで直すことがある」（例：固定列がない → 画面で選び直す）。
△ だけなら保存できる（似た構成の別の DB へ切り替えられるように）。
ログにはパスを残さない（呼び出し側は段階の id と結果だけを記録する）。
"""

import os
import sqlite3
from datetime import datetime

from .column_model import missing_key_columns
from .query import quote_identifier
from .settings.validation import is_placeholder

SQLITE_HEADER = b"SQLite format 3\x00"

STEPS = (
    ("format", "パスの書き方"),
    ("reach", "場所に届くか"),
    ("read", "読めるか"),
    ("sqlite", "SQLite として開けるか"),
    ("table", "テーブルと列"),
    ("rows", "件数"),
)


class StepFailed(Exception):
    def __init__(self, message, action):
        super().__init__(message)
        self.message = message
        self.action = action


def normalize_path(text):
    """貼り付けたパスを整える：前後の空白と、エクスプローラーの「パスのコピー」で付く引用符を外す。"""
    value = (text or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1].strip()
    return value


def resolve_path(app_root, path):
    """相対パスはアプリのルート基準（設定の読み込みと同じ）。"""
    return os.path.normpath(path if os.path.isabs(path) else os.path.join(app_root, path))


def check_source(path, table_name, model_settings, app_root):
    """段階ごとの結果 [{id, label, status: ok/warn/ng/skip, message, action}] と、まとめ {ok, rowCount, modifiedAt} を返す。
    model_settings：settings.ModelSettings（固定列があるかを確かめる）"""
    results = []
    state = {"path": normalize_path(path), "conn": None, "row_count": None, "modified": None}
    checks = {
        "format": lambda: _check_format(state, app_root),
        "reach": lambda: _check_reach(state),
        "read": lambda: _check_read(state),
        "sqlite": lambda: _check_sqlite(state),
        "table": lambda: _check_table(state, table_name, model_settings),
        "rows": lambda: _check_rows(state, table_name),
    }
    failed = False
    try:
        for step_id, label in STEPS:
            if failed:
                results.append({"id": step_id, "label": label, "status": "skip", "message": "前の段階が × のため確かめていません。", "action": ""})
                continue
            try:
                outcome = checks[step_id]()
                status, message, action = outcome if isinstance(outcome, tuple) else ("ok", outcome, "")
                results.append({"id": step_id, "label": label, "status": status, "message": message, "action": action})
            except StepFailed as failure:
                failed = True
                results.append({"id": step_id, "label": label, "status": "ng", "message": failure.message, "action": failure.action})
    finally:
        if state["conn"] is not None:
            state["conn"].close()
    return {
        "ok": not failed,
        "steps": results,
        "rowCount": state["row_count"],
        "modifiedAt": state["modified"],
        "normalizedPath": state["path"],
    }


def _check_format(state, app_root):
    path = state["path"]
    if not path:
        raise StepFailed("パスが空です。", "共有 SQLite のファイルのパスを入力してください。")
    if is_placeholder(path):
        raise StepFailed("仮の値（<...>）のままです。", "実際の共有 SQLite のパスに書き換えてください。")
    if any(ch in path for ch in "\r\n\t"):
        raise StepFailed("改行やタブが入っています。", "パスを 1 行で貼り付け直してください。")
    if path.endswith(("\\", "/")):
        raise StepFailed("フォルダのパスになっています。", "フォルダの中の SQLite ファイル（例：…\\data.sqlite3）まで指定してください。")
    state["resolved"] = resolve_path(app_root, path)
    return "書き方に問題はありません。"


def _check_reach(state):
    resolved = state["resolved"]
    folder = os.path.dirname(resolved)
    if folder and not os.path.isdir(folder):
        raise StepFailed("フォルダに届きません（ないか、ネットワークがつながっていません）。",
                         "エクスプローラーで同じフォルダを開けるか、VPN・ネットワーク・ドライブの割り当てを確認してください。")
    if os.path.isdir(resolved):
        raise StepFailed("ファイルではなくフォルダです。", "フォルダの中の SQLite ファイルまで指定してください。")
    if not os.path.isfile(resolved):
        raise StepFailed("フォルダはありますが、ファイルがありません。", "ファイル名（拡張子を含む）を確認してください。")
    state["modified"] = datetime.fromtimestamp(os.stat(resolved).st_mtime).astimezone().isoformat(timespec="seconds")
    return "ファイルがあります。"


def _check_read(state):
    try:
        with open(state["resolved"], "rb") as fp:
            state["header"] = fp.read(len(SQLITE_HEADER))
    except PermissionError:
        raise StepFailed("読む権限がありません。", "共有フォルダの読み取り権限を管理者に確認してください。") from None
    except OSError:
        raise StepFailed("ファイルを開けません（ほかのアプリが使用中か、接続が切れた可能性があります）。",
                         "少し待ってからもう一度確かめてください。") from None
    return "読めます。"


def _check_sqlite(state):
    if state.get("header") != SQLITE_HEADER:
        raise StepFailed("SQLite のファイルではありません。", "指定したファイルが共有 SQLite（.sqlite3 / .db など）か確認してください。")
    try:
        # immutable=1：共有側にロックや一時ファイルを作らず、読むだけにする
        state["conn"] = sqlite3.connect(_readonly_uri(state["resolved"]), uri=True)
        state["conn"].execute("SELECT name FROM sqlite_master LIMIT 1").fetchall()
    except sqlite3.Error:
        raise StepFailed("SQLite として開けません（壊れている可能性があります）。", "共有データの管理者に、ファイルの状態を確認してください。") from None
    return "開けます。"


def _check_table(state, table_name, model_settings):
    conn = state["conn"]
    try:
        exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", (table_name,)).fetchone()
        if not exists:
            raise StepFailed("schema の tableName のテーブルがありません。",
                             "読み込み先が正しいか、schema.local.json の tableName を確認してください。")
        columns = [row[1] for row in conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})")]
    except sqlite3.Error:
        raise StepFailed("テーブルの情報を読めません。", "共有データの管理者に、ファイルの状態を確認してください。") from None
    if not columns:
        raise StepFailed("テーブルに列がありません。", "読み込み先が正しいか確認してください。")
    missing = missing_key_columns(model_settings, columns)
    if missing:
        return ("warn", f"テーブルはあります（列は {len(columns)} 個）。固定列（レコードキー）の {'、'.join(missing)} はありません。",
                "保存してデータを更新したあと、画面左の「データ」→「固定列」で選んでください。")
    return f"テーブルと、固定列がそろっています（列は全部で {len(columns)} 個）。"


def _check_rows(state, table_name):
    try:
        state["row_count"] = state["conn"].execute(f"SELECT COUNT(*) FROM {quote_identifier(table_name)}").fetchone()[0]
    except sqlite3.Error:
        raise StepFailed("件数を数えられません。", "共有データの管理者に、ファイルの状態を確認してください。") from None
    return f"{state['row_count']:,} 件あります。"


def _readonly_uri(path):
    uri_path = os.path.abspath(path).replace("\\", "/").replace("%", "%25").replace("?", "%3F").replace("#", "%23")
    if uri_path.startswith("//"):
        uri_path = "//" + uri_path  # UNC（\\server\share）→ file:////server/share
    elif not uri_path.startswith("/"):
        uri_path = "/" + uri_path   # ドライブ文字（C:/...）
    return f"file:{uri_path}?mode=ro&immutable=1"
```

`python/data_search/source_service.py`

```python
"""読み込み先（共有 SQLite のパス）の確認・接続テスト・変更。

変更の流れ：接続テスト（× がないときだけ次へ。△ は保存してから直せる）→ config.local.json の dataSource.sourcePath に保存
            → 設定を読み直して検証 → 動いている設定を差し替え → キャッシュを作り直す。
読み直しで誤りが出たら、保存を取り消して元の設定のまま動かす。
ログにはパスを残さない（段階の id・結果・件数だけ）。
"""

import os

from .errors import AppError
from .settings.local_writer import local_file
from .settings_updater import file_label, save_local_values
from .source_check import check_source, normalize_path

SOURCE_KEY = ("dataSource", "sourcePath")


class SourceService:
    def __init__(self, context, app_root, local_dir):
        self.context = context      # http_server.AppContext（config・cache_service・lot_service を持つ）
        self.app_root = app_root
        self.local_dir = local_dir or os.path.join(app_root, "config", "local")

    def describe(self):
        config = self.context.config
        return {
            "success": True,
            "sourcePath": config.source_path,
            "editable": True,
            "localFile": file_label(self.app_root, local_file(self.local_dir, "config")),
        }

    def test(self, payload):
        config = self.context.config
        path = payload.get("sourcePath")
        if path is None:
            path = config.source_path
        if not isinstance(path, str) or len(path) > 1024:
            raise AppError("INVALID_REQUEST", "sourcePath must be a string up to 1024 chars")
        result = check_source(path, config.table_name, config.model, self.app_root)
        self.context.logger.info(
            "source check ok=%s steps=%s", result["ok"],
            ",".join(f"{step['id']}:{step['status']}" for step in result["steps"]),
        )
        return dict(result, success=True)

    def update(self, payload):
        checked = self.test(payload)
        if not checked["ok"]:
            return dict(checked, saved=False, message="接続テストで × があるため、保存していません。")

        new_path = normalize_path(payload.get("sourcePath"))
        target = save_local_values(self.context, self.app_root, self.local_dir, "config", {SOURCE_KEY: new_path})
        self.context.logger.info("source updated rows=%s", checked["rowCount"])
        response = dict(checked, saved=True, localFile=file_label(self.app_root, target))
        try:
            refreshed = self.context.cache_service.refresh()
            response.update(refreshed=True, refreshRowCount=refreshed["rowCount"],
                            message=f"読み込み先を保存し、データを更新しました（{refreshed['rowCount']:,} 件）。")
        except AppError as error:
            response.update(refreshed=False, message=f"読み込み先は保存しましたが、データの更新に失敗しました：{error.user_message}")
        return response
```

`python/tools/make_dummy_db.py`

```python
"""動作確認用のダミー共有 SQLite と、それを指す上書き設定（config/dummy/）を作る。

  config/dummy/config.local.json … 共有 SQLite のパスだけ
  config/dummy/schema.local.json … テーブル名と、別名（論理名 → DB の列名）だけ
  config/dummy/view.local.json   … 隠す列（UPDATED_AT）だけ

実データは使わない。列は python/tools/sample_columns.json（画面だけで試すモードと共通）の順に作る。
別名のある列は日本語の列名、ほかの列は英字の列名にしてあり、DB の列名がそのまま表示されることと、
schema の columns（論理名 → DB の列名）が効いていることを確かめられる。

使い方:
    python python/tools/make_dummy_db.py                    … 正常なダミー（ロット 2,500 件・BOX 約 5,000 件）
    python python/tools/make_dummy_db.py --lots 50000       … 大量データ
    python python/tools/make_dummy_db.py --variant corrupt  … 壊れたファイル（異常系の確認）
        variant: normal / missing-table / missing-key / corrupt
        missing-key … 固定列（BOX番号）がない似た DB。画面で列を選び直す流れを確かめる
    python python/tools/make_dummy_db.py --if-missing       … すでにあれば何もしない
起動: python python/run_server.py --local-dir config/dummy
"""

import argparse
import json
import os
import random
import re
import sqlite3
from datetime import date, timedelta

APP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEMA_SAMPLE = os.path.join(APP_ROOT, "config", "sample", "schema.sample.json")
SAMPLE_COLUMNS = os.path.join(APP_ROOT, "python", "tools", "sample_columns.json")
SHARED_PATH = os.path.join(APP_ROOT, "data", "dummy", "shared", "dummy_shared.sqlite3")
DUMMY_DIR = os.path.join(APP_ROOT, "config", "dummy")
CONFIG_PATH = os.path.join(DUMMY_DIR, "config.local.json")
SCHEMA_PATH = os.path.join(DUMMY_DIR, "schema.local.json")
VIEW_PATH = os.path.join(DUMMY_DIR, "view.local.json")
SEED = 20261011

# missing-key の確認で消す列（固定列の 2 つ目）
DROP_FOR_MISSING = "boxNo"

MATERIALS = ["A1100", "A3003", "A5052", "A6061", "A6063", "A7075"]
TEMPERS = ["O", "H14", "H24", "H32", "T5", "T6", "T651"]
CUSTOMERS = [("C0101", "サンプル工業"), ("C0102", "テスト金属"), ("C0103", "見本製作所"),
             ("C0104", "架空商事"), ("C0105", "例示精工"), ("C0106", "ダミー産業")]
EQUIPMENTS = ["鋳造1号", "熱間圧延1号", "冷間圧延1号", "冷間圧延2号", "焼鈍炉3号", "スリッター1号", "検査ライン1号"]
COURSES = ["HR→CR→AN→SL", "CR→AN→SL", "AN→SL", "SL", "CR→SL", "—"]
STATUSES = ["仕掛中", "検査待ち", "検査済み", "出荷済み", "保留", "不適合"]
SPECIAL_LOTS = ["試作-α-001", "LOT_100%-A", "LOT#5/特急", "LOT(再)-12", "LOT'Q\"-1"]


def load_columns():
    """[(値を作るときの名前＝論理名か列名, DB の列名, 論理名 or None)] を DB の順に返す。"""
    with open(SAMPLE_COLUMNS, encoding="utf-8") as fp:
        data = json.load(fp)
    return data["table"], [(c.get("role", c["name"]), c["name"], c.get("role")) for c in data["columns"]]


def value_of(field, ctx, rng, today):
    """主な項目は候補から、それ以外は項目名の形から値を作る（画面のサンプルと同じ考え方）。"""
    fixed = {
        "inspectionNo": f"INS-26-{ctx['serial']:06d}",
        "castingNo": f"CST-{ctx['cast']}{ctx['lot']:06d}",
        "orderNo": f"ORD-{ctx['order']:05d}",
        "customerCode": ctx["customer"][0],
        "customerName": ctx["customer"][1],
        "orderMaterial": ctx["material"], "manufacturingMaterial": ctx["material"],
        "orderTemper": ctx["temper"], "manufacturingTemper": ctx["temper"],
        "factoryDeliveryDate": (today + timedelta(days=ctx["due"])).isoformat(),
        "salesDeliveryDate": (today + timedelta(days=ctx["due"] + 3)).isoformat(),
        "specificGravity": "2.71",
    }
    if field in fixed:
        return fixed[field]
    choices = {
        "plannedEquipmentName": EQUIPMENTS, "lastActualEquipmentName": EQUIPMENTS,
        "remainingEquipmentCourse": COURSES, "cfStatus": STATUSES,
        "wipCategory": ["仕掛", "完成", "出荷待ち"], "holdCategory": ["", "", "", "品質保留", "客先保留"],
    }
    if field in choices:
        return rng.choice(choices[field])
    rules = [
        (r"Date$", lambda: (today + timedelta(days=rng.randint(-60, 90))).isoformat()),
        (r"Thickness$", lambda: ctx["thickness"]),
        (r"Width$", lambda: ctx["width"]),
        (r"Length$", lambda: ctx["length"]),
        (r"Weight$", lambda: str(rng.randint(300, 3000))),
        (r"(Count|Quantity)$", lambda: str(rng.randint(1, 20))),
        (r"Time$", lambda: f"{rng.randint(10, 900) / 10:.1f}"),
        (r"(Category|Flag)$", lambda: rng.choice(["0", "1", "2"])),
        (r"Code$", lambda: f"{rng.choice('ABKM')}{rng.randint(1, 99):02d}"),
        (r"No$", lambda: f"{re.sub('[a-z]', '', field[:-2]).upper() or 'N'}{rng.randint(1, 99999):05d}"),
        (r"Course$", lambda: rng.choice(COURSES)),
        (r"Name$", lambda: f"{field[:-4]}-{rng.randint(1, 9)}"),
    ]
    for pattern, make in rules:
        if re.search(pattern, field):
            return make()
    return f"{field}-{rng.randint(1, 9)}"


def build_rows(lot_count, logical_fields, rng):
    today = date.today()  # 日付の絞り込み（今日〜7 日後など）をいつでも試せるよう、今日を基準にする
    rows, order, order_left, serial = [], 0, 0, 0
    for lot in range(1, lot_count + 1):
        if order_left == 0:
            order += 1
            order_left = rng.randint(1, 4)
        order_left -= 1
        lot_no = SPECIAL_LOTS[lot - 1] if lot <= len(SPECIAL_LOTS) else f"LOT-2026-{lot:05d}"
        ctx = {
            "lot": lot, "order": order, "cast": rng.randint(10, 99),
            "customer": rng.choice(CUSTOMERS), "material": rng.choice(MATERIALS), "temper": rng.choice(TEMPERS),
            "thickness": rng.choice(["0.50", "1.00", "1.50", "2.00", "3.00", "5.00"]),
            "width": str(rng.choice([1000, 1250, 1525])), "length": str(rng.choice([2000, 2500, 3000])),
            "due": rng.randint(-45, 90),
        }
        for box in range(1, rng.randint(1, 3) + 1):
            serial += 1
            ctx["serial"] = serial
            row = {field: value_of(field, ctx, rng, today) for field in logical_fields}
            row["lotNo"], row["boxNo"] = lot_no, f"{box:02d}"
            rows.append(row)
    return rows


def write_database(path, rows, table, columns, variant):
    """columns：load_columns() の並び。行は「値を作るときの名前」で引く。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for suffix in ("", "-wal", "-shm", "-journal"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    if variant == "corrupt":
        with open(path, "wb") as fp:
            fp.write(b"this is not a sqlite database" * 100)
        return

    kept = [c for c in columns if not (variant == "missing-key" and c[2] == DROP_FOR_MISSING)]
    table_name = "t_other" if variant == "missing-table" else table
    names = [physical for _, physical, _ in kept] + ["UPDATED_AT"]
    lot_column = next(physical for _, physical, role in columns if role == "lotNo")
    conn = sqlite3.connect(path)
    try:
        conn.execute(f'CREATE TABLE "{table_name}" ({", ".join(f"""\"{c}\" TEXT""" for c in names)})')
        conn.executemany(
            f'INSERT INTO "{table_name}" VALUES ({", ".join("?" for _ in names)})',
            ([row[key] for key, _, _ in kept] + ["2026-10-11T08:00:00"] for row in rows),
        )
        conn.execute(f'CREATE INDEX "idx_lot" ON "{table_name}" ("{lot_column}")')
        conn.commit()
    finally:
        conn.close()


def write_config(table, columns):
    # config/local と同じく、サンプルから変えたい項目だけを書く
    os.makedirs(DUMMY_DIR, exist_ok=True)
    config = {
        "application": {"name": "Data Search (Dummy)"},
        "dataSource": {"sourcePath": "./data/dummy/shared/dummy_shared.sqlite3", "cachePath": "./data/cache/dummy_cache.sqlite3"},
    }
    with open(SCHEMA_SAMPLE, encoding="utf-8") as fp:
        roles = list(json.load(fp)["columns"])
    physical = {role: name for _, name, role in columns if role}
    schema = {"tableName": table, "columns": {role: physical[role] for role in roles}}
    view = {"hiddenColumns": ["UPDATED_AT"]}  # 隠す列の例（画面の「表示列」で出せる）
    for path, data in ((CONFIG_PATH, config), (SCHEMA_PATH, schema), (VIEW_PATH, view)):
        with open(path, "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="ダミーの共有 SQLite を作る")
    parser.add_argument("--lots", type=int, default=2500, help="ロットの数（1 ロットに BOX 1〜3 件）")
    parser.add_argument("--variant", choices=["normal", "missing-table", "missing-key", "corrupt"], default="normal")
    parser.add_argument("--if-missing", action="store_true")
    args = parser.parse_args()

    if args.if_missing and all(os.path.isfile(p) for p in (SHARED_PATH, CONFIG_PATH, SCHEMA_PATH, VIEW_PATH)):
        print("ダミーデータはすでにあります。")
        return
    table, columns = load_columns()
    rows = build_rows(args.lots, [key for key, _, _ in columns], random.Random(SEED))
    write_database(SHARED_PATH, rows, table, columns, args.variant)
    write_config(table, columns)
    print(f"ダミーの共有データを作成しました（{args.variant}・ロット {args.lots:,} 件・BOX {len(rows):,} 件・列 {len(columns) + 1} 個）: {SHARED_PATH}")
    print(f"上書き設定: {DUMMY_DIR}（config.local.json / schema.local.json / view.local.json）")


if __name__ == "__main__":
    main()
```

`python/tools/sample_columns.json`

```json
{
  "_comment": "ダミーの共有 SQLite（make_dummy_db.py）と、画面だけで試すモードのサンプル（sync_sample_view.py）が使う列の一覧。実データとは無関係。name は DB の列名（この順が DB の列の順）、role は schema.sample.json の論理名（役割のある列だけ）。",
  "table": "t_dummy_lot_box",
  "columns": [
    {
      "name": "ロット番号",
      "role": "lotNo"
    },
    {
      "name": "BOX番号",
      "role": "boxNo"
    },
    {
      "name": "検査番号",
      "role": "inspectionNo"
    },
    {
      "name": "鋳造番号",
      "role": "castingNo"
    },
    {
      "name": "オーダー番号",
      "role": "orderNo"
    },
    {
      "name": "plannedEquipmentName"
    },
    {
      "name": "businessUnitCode"
    },
    {
      "name": "demandFieldCode"
    },
    {
      "name": "applicationCode"
    },
    {
      "name": "applicationName"
    },
    {
      "name": "orderMaterial"
    },
    {
      "name": "orderTemper"
    },
    {
      "name": "orderThickness"
    },
    {
      "name": "orderWidth"
    },
    {
      "name": "orderLength"
    },
    {
      "name": "製造材質",
      "role": "manufacturingMaterial"
    },
    {
      "name": "製造調質",
      "role": "manufacturingTemper"
    },
    {
      "name": "manufacturingThickness"
    },
    {
      "name": "manufacturingWidth"
    },
    {
      "name": "manufacturingLength"
    },
    {
      "name": "productUnitWeight"
    },
    {
      "name": "specificGravity"
    },
    {
      "name": "shape"
    },
    {
      "name": "surface"
    },
    {
      "name": "processing"
    },
    {
      "name": "surfaceProcessing"
    },
    {
      "name": "cleaning"
    },
    {
      "name": "deliverySpecificationNo"
    },
    {
      "name": "仕掛区分",
      "role": "wipCategory"
    },
    {
      "name": "allocationCategory"
    },
    {
      "name": "保留区分",
      "role": "holdCategory"
    },
    {
      "name": "holdReleaseDate"
    },
    {
      "name": "temporaryPackingFlag"
    },
    {
      "name": "urgentCategory"
    },
    {
      "name": "状態",
      "role": "cfStatus"
    },
    {
      "name": "allocationCode"
    },
    {
      "name": "allocationMethod"
    },
    {
      "name": "allocationQuantity"
    },
    {
      "name": "allocationAdjustmentNo"
    },
    {
      "name": "salesDeliveryDate"
    },
    {
      "name": "工場納期",
      "role": "factoryDeliveryDate"
    },
    {
      "name": "promisedDeliveryDate"
    },
    {
      "name": "shippingDate"
    },
    {
      "name": "wipRetentionTime"
    },
    {
      "name": "deliveryDestinationCode"
    },
    {
      "name": "customerCode"
    },
    {
      "name": "shippingDestinationCode"
    },
    {
      "name": "deliveryDestinationName"
    },
    {
      "name": "取引先名",
      "role": "customerName"
    },
    {
      "name": "shippingDestinationName"
    },
    {
      "name": "districtCode"
    },
    {
      "name": "salespersonCode"
    },
    {
      "name": "plannedEquipmentCourse"
    },
    {
      "name": "actualEquipmentCourse"
    },
    {
      "name": "残仕掛設備コース",
      "role": "remainingEquipmentCourse"
    },
    {
      "name": "totalProcessCount"
    },
    {
      "name": "pitPlannedDate"
    },
    {
      "name": "pitActualDate"
    },
    {
      "name": "specialSpecification"
    },
    {
      "name": "masterNo"
    },
    {
      "name": "specificationNo"
    },
    {
      "name": "qualityNo"
    },
    {
      "name": "manufacturingNo"
    },
    {
      "name": "testNo"
    },
    {
      "name": "personInCharge"
    },
    {
      "name": "boxPlannedThickness"
    },
    {
      "name": "boxPlannedWidth"
    },
    {
      "name": "boxPlannedLength"
    },
    {
      "name": "boxPlannedWorkPattern"
    },
    {
      "name": "boxPlannedWeight"
    },
    {
      "name": "boxPlannedCount"
    },
    {
      "name": "qualityCode"
    },
    {
      "name": "annealingScheduleCategory"
    },
    {
      "name": "annealingFurnaceNo"
    },
    {
      "name": "lastActualProcessBoxNo"
    },
    {
      "name": "最終実績設備",
      "role": "lastActualEquipmentName"
    },
    {
      "name": "lastActualThickness"
    },
    {
      "name": "lastActualWidth"
    },
    {
      "name": "lastActualLength"
    },
    {
      "name": "lastActualGoodWeight"
    },
    {
      "name": "lastActualCount"
    },
    {
      "name": "workStartDate"
    },
    {
      "name": "workEndDate"
    }
  ]
}
```

`python/tools/sync_sample_view.py`

```python
"""画面だけで試すモード（index.html を直接開いたとき）用の表示定義を、公開サンプルから作り直す。

file:// で開いた画面は JSON ファイルを読めないため、config/sample/schema.sample.json と
view.sample.json の設定を、本物と同じ決まり（column_model.build_model）で表示定義にして
src/js/sample/sample-view.js に書き写す。
DB の列は、ダミーと共通の列の一覧 python/tools/sample_columns.json を使う（実データとは無関係）。
別名（schema.columns）の DB の列名は sample_columns.json の role から、日付の列は名前が Date で終わる列、
数値の列は名前が NUMBER_NAME に当てはまる列とする（サンプルデータ・ダミーデータは、その列に日付・数値を入れる）。
サンプルの view / schema を変えたら、このスクリプトを実行する（テストで一致を確かめている）。

使い方: python python/tools/sync_sample_view.py
"""

import json
import os
import re
import sys

APP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(APP_ROOT, "python"))

from data_search.column_catalog import DbColumn  # noqa: E402
from data_search.column_model import build_model  # noqa: E402
from data_search.settings import model_settings_of  # noqa: E402
from data_search.settings.defaults import BUILTIN_DEFAULTS  # noqa: E402
from data_search.settings.merge import fill_defaults  # noqa: E402

SAMPLE_DIR = os.path.join(APP_ROOT, "config", "sample")
SAMPLE_COLUMNS = os.path.join(APP_ROOT, "python", "tools", "sample_columns.json")
OUTPUT = os.path.join(APP_ROOT, "src", "js", "sample", "sample-view.js")
# サンプルデータ（sample-data.js）・ダミーデータ（make_dummy_db.py）が数値を入れる列の名前の形
NUMBER_NAME = re.compile(r"(Thickness|Width|Length|Weight|Count|Quantity|Time|Gravity)$")

TEMPLATE = """/* =========================================================
   画面だけで試すモード用の表示定義（自動生成。手で直さない）
   元: config/sample/view.sample.json と schema.sample.json、python/tools/sample_columns.json（DB の列）
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {{
  'use strict';

  window.DS = window.DS || {{}};
  window.DS.sampleView = /*VIEW_JSON_START*/{json}/*VIEW_JSON_END*/;
}})();
"""


def build_sample_view():
    """公開サンプルの設定と sample_columns.json から、画面へ渡す表示定義（get_view_config と同じ形）を作る。"""
    with open(os.path.join(SAMPLE_DIR, "schema.sample.json"), encoding="utf-8") as fp:
        schema = json.load(fp)
    with open(os.path.join(SAMPLE_DIR, "view.sample.json"), encoding="utf-8") as fp:
        view = json.load(fp)
    # サンプルから省かれた任意の項目は、起動時と同じく内部の既定値で補う
    schema = fill_defaults(schema, BUILTIN_DEFAULTS["schema"])
    view = fill_defaults(view, BUILTIN_DEFAULTS["view"])
    with open(SAMPLE_COLUMNS, encoding="utf-8") as fp:
        sample_columns = json.load(fp)["columns"]
    physical = {c["role"]: c["name"] for c in sample_columns if "role" in c}
    schema["columns"] = {name: physical[name] for name in schema["columns"] if name in physical}
    def column_of(entry):
        name = entry.get("role", entry["name"])
        return DbColumn(entry["name"], name.endswith("Date"), bool(NUMBER_NAME.search(name)))

    catalog = tuple(column_of(c) for c in sample_columns)
    return build_model(model_settings_of(schema, view), catalog).public()


def main():
    text = json.dumps(build_sample_view(), ensure_ascii=False, indent=2)
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as fp:
        fp.write(TEMPLATE.format(json=text))
    print(f"書き出しました: {OUTPUT}")


if __name__ == "__main__":
    main()
```

`tests/ui-check.js`

```javascript
/* =========================================================
   画面の動作確認スクリプト（本体とは別。必要なときだけ使う）

   使い方：
     1. src/index.html を Edge で直接開く（サンプルのモード）
     2. F12 → コンソール に、このファイルの中身をすべて貼り付けて Enter
     3. 結果が表で出る。最後に「すべて成功」と出れば OK

   ※ 確認のためにサンプルデータ・絞り込み・タグを使います（終わると元の状態に戻します）。
   ========================================================= */
(async function uiCheck() {
  'use strict';

  const app = window.DS && window.DS.app;
  const results = [];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const check = (name, ok, note) => results.push({ 確認: name, 結果: ok ? '成功' : '失敗', 補足: note || '' });

  if (!app) {
    console.error('DS.app が見つかりません。index.html を開いてから実行してください。');
    return;
  }
  if (app.api.mode !== 'mock') {
    console.error('サンプルのモード（index.html を直接開いたとき）で実行してください。');
    return;
  }

  const { store, search, samples, tags } = app;
  const before = { samples: samples.loadedIds(), tags: store.get().tags.items.slice(), filters: store.get().filters };
  const result = () => store.get().search.result;
  const col = window.DS.sample.columnOf; // 論理名 → DB の列名（画面の列の id）
  const LOT = col('lotNo');
  const STATUS = col('cfStatus');
  const CUSTOMER = col('customerName');
  const searchFor = async (keyword, matchMode) => {
    search.setQuery({ keyword, matchMode: matchMode || 'partial' });
    await search.run({ page: 1 });
    return result();
  };

  try {
    // ── データなし ──
    await samples.clear();
    check('データなしのとき CTA はサンプルへ案内する', search.readiness().action === 'open-samples');

    // ── 読み込むと一覧が出る（入力は不要） ──
    search.setQuery({ keyword: '' });
    await search.setFilters({});
    await samples.load('standard');
    const total = store.get().cache.status.rowCount;
    check('読み込むと入力なしで一覧が出る', result() && result().totalCount === total && total > 300, `${total} 件（ロット 300・BOX ごと）`);
    check('一覧は 100 件ずつ', result().count === 100);
    const sortKey = window.DS.domain.DEFAULT_SORT.key;
    const dates = result().items.map((item) => item[sortKey]);
    check('既定の並べ替え（view の defaultSort）の順に並ぶ', dates.every((date, i) => i === 0 || dates[i - 1] <= date), sortKey);

    // ── 番号の検索（任意。探す列は 1 つ） ──
    check('探す列は固定列の 1 つ目', window.DS.domain.searchField().id === LOT && document.querySelector('.search__column').textContent.includes(LOT));
    let r = await searchFor('LOT-2026-00012', 'exact');
    const boxes = r.totalCount;
    check('完全一致でそのロットの BOX だけが出る', boxes >= 1 && boxes <= 3 && r.items.every((item) => item[LOT] === 'LOT-2026-00012'), `${boxes} 件`);
    r = await searchFor('ｌｏｔ－２０２６－０００１２', 'exact');
    check('全角・小文字でも見つかる', r.totalCount === boxes);
    r = await searchFor('NOTHING-0', 'partial');
    check('0 件も正常に表示する', r.totalCount === 0 && document.querySelector('.empty').hidden === false);
    await search.clearKeyword();
    check('入力を消すと一覧に戻る', result().totalCount === total && !store.get().search.request.keyword);

    // ── 絞り込み（どの列でも） ──
    await search.setFilter(STATUS, { type: 'values', values: ['仕掛中'] });
    const wip = result().totalCount;
    check('状態で絞り込める', wip > 0 && wip < total && result().items.every((item) => item[STATUS] === '仕掛中'), `${wip} 件`);
    await search.setFilter(CUSTOMER, { type: 'values', values: ['架空商事'] });
    check('取引先名でも絞り込める（かつ）', result().items.every((item) => item[STATUS] === '仕掛中' && item[CUSTOMER] === '架空商事'), `${result().totalCount} 件`);
    const values = await app.api.call('get_filter_values', { field: STATUS, filters: store.get().filters });
    check('値の一覧に件数が出る（自分の条件は外して数える）', values.values.length > 1);
    check('見出しで絞り込み中の列に印が付く', document.querySelector(`.grid thead th[data-field="${CSS.escape(STATUS)}"]`).classList.contains('is-filtered'));
    const other = window.DS.domain.listFields().find((field) => !field.role && field.filter === 'values');
    document.querySelector(`.grid thead th[data-field="${CSS.escape(other.id)}"] [data-filter]`).click();
    await wait(400);
    const pop = document.querySelector('.col-filter');
    check('見出しの漏斗で、役割のない列の絞り込みが開く', !pop.hidden && pop.textContent.includes(other.label), other.label);
    const box = pop.querySelector('.value-list input[type="checkbox"]');
    box.click();
    await wait(400);
    check('小窓で選ぶとすぐ一覧に反映される', Boolean(store.get().filters[other.id]) && result().items.every((item) => item[other.id] === store.get().filters[other.id].values[0]));
    app.columnFilter.close(false);
    check('小窓を閉じられる', pop.hidden);
    const due = window.DS.domain.fields.get(col('factoryDeliveryDate'));
    check('日付の列は値から判定し、日付の範囲で絞り込む', due.filter === 'date');
    const matched = await app.api.call('get_filter_values', { field: LOT, match: 'lot-2026-0001' });
    check('値が多い列は、文字でデータ全体から探せる', matched.values.length > 0 && matched.values.every((entry) => entry.value.toLowerCase().includes('lot-2026-0001')), `${matched.values.length} 個`);
    await search.clearFilter(other.id);

    // ── 文字の条件・数値の範囲・種類（ほかの絞り込みを外して確かめ、あとで戻す） ──
    const filtersBefore = Object.assign({}, store.get().filters);
    await search.setFilters({});
    await search.setFilter(LOT, { type: 'text', op: 'contains', value: 'lot2026 00012', fuzzy: true });
    check('条件で絞る：記号・空白を無視し、空白で区切った語をすべて含む', result().totalCount >= 1 && result().items.every((item) => item[LOT] === 'LOT-2026-00012'), `${result().totalCount} 件`);
    await search.setFilter(LOT, { type: 'text', op: 'contains', value: 'lot202600012', fuzzy: false });
    check('記号・空白を無視しないと見つからない', result().totalCount === 0);
    await search.setFilter(LOT, { type: 'text', op: 'not_starts', value: 'LOT-2026', fuzzy: true });
    check('「で始まらない」で外せる', result().totalCount === 0);
    await search.clearFilter(LOT);
    const width = window.DS.domain.listFields().find((field) => field.type === 'number');
    check('数値の列は値から判定する', Boolean(width), width && width.label);
    await search.setFilter(width.id, { type: 'number', min: 1.5, max: null });
    check('数値の範囲で絞り込める', result().totalCount > 0 && result().items.every((item) => Number(String(item[width.id]).replace(/,/g, '')) >= 1.5), `${result().totalCount} 件`);
    await search.setFilter(width.id, { type: 'number', min: null, max: null });
    const typed = await app.api.call('update_column_type', { column: width.id, kind: 'text' });
    check('種類を手動で変えて保存できる', typed.kind === 'text' && typed.manual === true);
    const back = await app.api.call('update_column_type', { column: width.id, kind: 'auto' });
    check('「自動」で値からの判定に戻せる', back.kind === 'number' && back.manual === false);
    await search.setFilters(filtersBefore);

    // ── タグ ──
    const saved = tags.save('確認用タグ');
    check('今の条件をタグにできる', saved.ok && store.get().tags.activeId === saved.tag.id);
    check('同じ名前のタグは作れない', tags.save('確認用タグ').ok === false);
    await tags.apply(null);
    check('「すべて」で絞り込みを外せる', result().totalCount === total && store.get().tags.activeId === null);
    await tags.apply(saved.tag.id);
    check('タグを押すと同じ条件に戻る', Object.keys(store.get().filters).length === 2 && store.get().tags.activeId === saved.tag.id);
    await search.setFilter(STATUS, { type: 'values', values: ['仕掛中', '保留'] });
    check('条件を変えると「変更あり」になる', tags.isModified() === true);
    tags.remove(saved.tag.id);
    check('タグを消せる', !store.get().tags.items.some((tag) => tag.id === saved.tag.id));

    // ── 全列の一覧と詳細 ──
    await search.setFilters({});
    const columnCount = window.DS.domain.listFields().length;
    check('一覧に全列が出る（隠した列を除く）', document.querySelectorAll('.grid thead th').length === columnCount - store.get().columns.hidden.length, `${columnCount} 列`);
    check('見出しは DB の列名', document.querySelector('.grid thead th').textContent.trim() === window.DS.domain.listFields()[0].label);
    check('固定列（レコードキー）は左端に固定し、鍵が付く', document.querySelectorAll('.grid thead th.is-pinned').length === window.DS.domain.keyFields().length && document.querySelectorAll('.grid thead th.is-pinned [data-key-edit]').length === window.DS.domain.keyFields().length);
    await search.highlight(result().items[0]);
    check('行を 1 回押すと選ぶだけ（詳細は開かない）', store.get().selection.key && document.getElementById('detail').hidden === true);
    await search.select(result().items[0]);
    check('ダブルクリック／Enter で詳細が出る', document.getElementById('detail').hidden === false);
    search.closeDetail();
    check('詳細を閉じても行の選択は残る', Boolean(store.get().selection.key) && document.getElementById('detail').hidden === true);
    const beforeColumns = store.get().columns;
    const hideId = window.DS.domain.listFields().find((field) => !field.key).id;
    store.merge('columns', { hidden: beforeColumns.hidden.concat([hideId]) });
    check('表示列で隠すと一覧から消える', !document.querySelector(`.grid thead th[data-field="${hideId}"]`));
    store.set({ columns: beforeColumns });

    // ── 1 ロットに BOX が複数 ──
    await samples.load('multi-box');
    r = result();
    check('同じロット番号の 3 BOX が出る', r.totalCount === 3);
    await search.select(r.items[2]);
    check('ロット番号＋BOX番号で 1 件に決まる', store.get().selection.item[col('boxNo')] === r.items[2][col('boxNo')]);
    search.closeDetail();

    // ── 固定列の確認（保存すると画面を読み込み直すため、確かめるだけ） ──
    let keyCheck = await app.api.call('check_record_key', { recordKey: [LOT] });
    check('ロット番号だけでは重なりを知らせる', keyCheck.unique === false && keyCheck.example && keyCheck.example.count === 3, `${keyCheck.duplicateGroups} 組`);
    keyCheck = await app.api.call('check_record_key', { recordKey: [LOT, col('boxNo')] });
    check('ロット番号＋BOX番号なら 1 件に決まる', keyCheck.unique === true);

    // ── 更新の失敗 ──
    await samples.load('refresh-failure');
    check('更新失敗の状態では前回のデータを使う', store.get().cache.status.usingPreviousCache === true);

    // ── 読み込み先（このモードでは模擬） ──
    const { source } = app;
    const beforePath = store.get().source.path;
    let checked = await source.test('"\\\\srv\\share\\memo.txt"');
    check('接続テストは × の段階と対応を示す', checked.ok === false && checked.steps.some((step) => step.status === 'ng' && step.action));
    check('× のときは保存できない', source.canSave('\\\\srv\\share\\memo.txt') === false);
    checked = await source.test('"\\\\srv\\share\\new.sqlite3"');
    check('貼り付けた " は外して確かめる', checked.ok && checked.normalizedPath === '\\\\srv\\share\\new.sqlite3');
    check('確かめた後に入力を変えると保存できない', source.canSave('\\\\srv\\share\\other.sqlite3') === false);
    check('すべて ○ なら保存できる', await source.save('\\\\srv\\share\\new.sqlite3') && store.get().source.path === '\\\\srv\\share\\new.sqlite3');
    await source.test(beforePath);
    await source.save(beforePath);

    // ── 片付け ──
    await samples.clear();
    check('サンプルだけを消せる', store.get().cache.status.available === false);
  } catch (error) {
    check('途中でエラー', false, error.message);
  } finally {
    // 元の状態に戻す
    await samples.clear();
    for (const id of before.samples) await samples.load(id);
    window.DS.core.storage.write('tags', before.tags);
    store.set({ tags: { items: before.tags, activeId: null } });
    search.setQuery({ keyword: '' });
    await search.setFilters(before.filters);
  }

  console.table(results);
  const failed = results.filter((row) => row.結果 !== '成功').length;
  if (failed) console.error(`${failed} 件の確認が失敗しました`);
  else console.log('%cすべて成功', 'color: green; font-weight: bold');
})();
```

