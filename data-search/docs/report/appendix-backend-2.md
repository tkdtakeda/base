## 付録：バックエンド・ツール・設定の修正ファイルの全文（2/2）

`python/data_search/source_check.py`

```python
"""読み込み先（共有 SQLite）の接続テスト。コピーも書き込みもせず、順に確かめて結果を返す。

    ① パスの書き方  ② 場所に届くか  ③ 読めるか  ④ SQLite として開けるか  ⑤ テーブル・列  ⑥ 件数
前の段階が × なら、後の段階は「確かめていない」（skip）にする。画面には段階ごとに 理由・対応 を出す。
ログにはパスを残さない（呼び出し側は段階の id と結果だけを記録する）。
"""

import os
import sqlite3
from datetime import datetime

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


def check_source(path, table_name, field_mappings, app_root):
    """段階ごとの結果 [{id, label, status: ok/ng/skip, message, action}] と、まとめ {ok, rowCount, modifiedAt} を返す。"""
    results = []
    state = {"path": normalize_path(path), "conn": None, "row_count": None, "modified": None}
    checks = {
        "format": lambda: _check_format(state, app_root),
        "reach": lambda: _check_reach(state),
        "read": lambda: _check_read(state),
        "sqlite": lambda: _check_sqlite(state),
        "table": lambda: _check_table(state, table_name, field_mappings),
        "rows": lambda: _check_rows(state, table_name),
    }
    failed = False
    try:
        for step_id, label in STEPS:
            if failed:
                results.append({"id": step_id, "label": label, "status": "skip", "message": "前の段階が × のため確かめていません。", "action": ""})
                continue
            try:
                message = checks[step_id]()
                results.append({"id": step_id, "label": label, "status": "ok", "message": message, "action": ""})
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


def _check_table(state, table_name, field_mappings):
    conn = state["conn"]
    try:
        exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", (table_name,)).fetchone()
        if not exists:
            raise StepFailed("schema の tableName のテーブルがありません。",
                             "読み込み先が正しいか、schema.local.json の tableName を確認してください。")
        columns = {row[1] for row in conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})")}
    except sqlite3.Error:
        raise StepFailed("テーブルの情報を読めません。", "共有データの管理者に、ファイルの状態を確認してください。") from None
    missing = [logical for logical, physical in field_mappings.items() if physical not in columns]
    if missing:
        names = "、".join(missing[:8]) + (f" ほか {len(missing) - 8} 項目" if len(missing) > 8 else "")
        raise StepFailed(f"使う列が {len(missing)} 個ありません（{names}）。",
                         "読み込み先が正しいか、schema.local.json の columns を確認してください。")
    return f"テーブルと、使う列 {len(field_mappings)} 個がそろっています。"


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

変更の流れ：接続テスト（すべて ○ のときだけ次へ）→ config.local.json の dataSource.sourcePath に保存
            → 設定を読み直して検証 → 動いている設定を差し替え → キャッシュを作り直す。
読み直しで誤りが出たら、保存を取り消して元の設定のまま動かす。
ログにはパスを残さない（段階の id・結果・件数だけ）。
"""

import os

from .errors import AppError
from .settings import SettingsError, load_settings
from .settings.local_writer import local_file, restore_backup, set_local_value
from .source_check import check_source, normalize_path

SOURCE_KEY = ("dataSource", "sourcePath")


class SourceService:
    def __init__(self, context, app_root, local_dir):
        self.context = context      # http_server.AppContext（config・cache_service・lot_service を持つ）
        self.app_root = app_root
        self.local_dir = local_dir or os.path.join(app_root, "config", "local")

    def _label(self, path):
        relative = os.path.relpath(path, self.app_root)
        return path if relative.startswith("..") else relative.replace("\\", "/")

    def describe(self):
        config = self.context.config
        return {
            "success": True,
            "sourcePath": config.source_path,
            "editable": True,
            "localFile": self._label(local_file(self.local_dir, "config")),
        }

    def test(self, payload):
        config = self.context.config
        path = payload.get("sourcePath")
        if path is None:
            path = config.source_path
        if not isinstance(path, str) or len(path) > 1024:
            raise AppError("INVALID_REQUEST", "sourcePath must be a string up to 1024 chars")
        result = check_source(path, config.table_name, config.field_mappings, self.app_root)
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
        target = local_file(self.local_dir, "config")
        existed = os.path.isfile(target)
        try:
            set_local_value(self.local_dir, "config", SOURCE_KEY, new_path)
        except (OSError, ValueError) as exc:
            raise AppError("SETTINGS_WRITE_FAILED", f"write failed: {type(exc).__name__}") from exc
        try:
            config = load_settings(self.app_root, self.local_dir)
        except SettingsError as error:
            restore_backup(self.local_dir, "config", existed)
            reasons = " / ".join(f"{issue.path}：{issue.reason}" for issue in error.issues if issue.level == "error")
            raise AppError("SETTINGS_WRITE_FAILED", "reload failed",
                           user_message=f"保存すると設定に誤りが出るため、元に戻しました（{reasons}）。") from error

        self._use_config(config)
        self.context.logger.info("source updated rows=%s", checked["rowCount"])
        response = dict(checked, saved=True, localFile=self._label(target))
        try:
            refreshed = self.context.cache_service.refresh()
            response.update(refreshed=True, refreshRowCount=refreshed["rowCount"],
                            message=f"読み込み先を保存し、データを更新しました（{refreshed['rowCount']:,} 件）。")
        except AppError as error:
            response.update(refreshed=False, message=f"読み込み先は保存しましたが、データの更新に失敗しました：{error.user_message}")
        return response

    def _use_config(self, config):
        """動いている設定を差し替える。読み込み先が変わったら、前の読み込み先のキャッシュは使わない。"""
        self.context.config = config
        self.context.cache_service.use_config(config)
        self.context.lot_service.config = config
```

`python/tools/make_dummy_db.py`

```python
"""動作確認用のダミー共有 SQLite と、それを指す上書き設定（config/dummy/）を作る。

  config/dummy/config.local.json … 共有 SQLite のパスだけ
  config/dummy/schema.local.json … テーブル名と列名だけ
  （view は上書きしない。config/sample/view.sample.json をそのまま使う）

実データは使わない。列は config/sample/schema.sample.json の論理項目すべてについて作り、
物理名はわざと論理名と違う名前（大文字のスネークケース。1 列は日本語）にして、
schema の columns（論理名 → 物理列名）が効いていることを確かめられるようにしている。

使い方:
    python python/tools/make_dummy_db.py                    … 正常なダミー（ロット 2,500 件・BOX 約 5,000 件）
    python python/tools/make_dummy_db.py --lots 50000       … 大量データ
    python python/tools/make_dummy_db.py --variant corrupt  … 壊れたファイル（異常系の確認）
        variant: normal / missing-table / missing-column / corrupt
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
SHARED_PATH = os.path.join(APP_ROOT, "data", "dummy", "shared", "dummy_shared.sqlite3")
DUMMY_DIR = os.path.join(APP_ROOT, "config", "dummy")
CONFIG_PATH = os.path.join(DUMMY_DIR, "config.local.json")
SCHEMA_PATH = os.path.join(DUMMY_DIR, "schema.local.json")
TABLE = "t_dummy_lot_box"
SEED = 20261011

# 物理名を日本語にする列（引用符で囲む処理の確認用）
JAPANESE_COLUMNS = {"customerName": "取引先_名称"}
# missing-column の確認で消す論理項目
DROP_FOR_MISSING = "cfStatus"

MATERIALS = ["A1100", "A3003", "A5052", "A6061", "A6063", "A7075"]
TEMPERS = ["O", "H14", "H24", "H32", "T5", "T6", "T651"]
CUSTOMERS = [("C0101", "サンプル工業"), ("C0102", "テスト金属"), ("C0103", "見本製作所"),
             ("C0104", "架空商事"), ("C0105", "例示精工"), ("C0106", "ダミー産業")]
EQUIPMENTS = ["鋳造1号", "熱間圧延1号", "冷間圧延1号", "冷間圧延2号", "焼鈍炉3号", "スリッター1号", "検査ライン1号"]
COURSES = ["HR→CR→AN→SL", "CR→AN→SL", "AN→SL", "SL", "CR→SL", "—"]
STATUSES = ["仕掛中", "検査待ち", "検査済み", "出荷済み", "保留", "不適合"]
SPECIAL_LOTS = ["試作-α-001", "LOT_100%-A", "LOT#5/特急", "LOT(再)-12", "LOT'Q\"-1"]


def physical_name(logical):
    if logical in JAPANESE_COLUMNS:
        return JAPANESE_COLUMNS[logical]
    return re.sub(r"(?<!^)(?=[A-Z])", "_", logical).upper()


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


def write_database(path, rows, logical_fields, variant):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for suffix in ("", "-wal", "-shm", "-journal"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    if variant == "corrupt":
        with open(path, "wb") as fp:
            fp.write(b"this is not a sqlite database" * 100)
        return

    fields = [f for f in logical_fields if not (variant == "missing-column" and f == DROP_FOR_MISSING)]
    table = "t_other" if variant == "missing-table" else TABLE
    columns = [physical_name(f) for f in fields] + ["UPDATED_AT"]
    conn = sqlite3.connect(path)
    try:
        conn.execute(f'CREATE TABLE "{table}" ({", ".join(f"""\"{c}\" TEXT""" for c in columns)})')
        conn.executemany(
            f'INSERT INTO "{table}" VALUES ({", ".join("?" for _ in columns)})',
            ([row[f] for f in fields] + ["2026-10-11T08:00:00"] for row in rows),
        )
        conn.execute(f'CREATE INDEX "idx_lot" ON "{table}" ("{physical_name("lotNo")}")')
        conn.commit()
    finally:
        conn.close()


def write_config(logical_fields):
    # config/local と同じく、サンプルから変えたい項目だけを書く
    os.makedirs(DUMMY_DIR, exist_ok=True)
    config = {
        "application": {"name": "Data Search (Dummy)"},
        "dataSource": {"sourcePath": "./data/dummy/shared/dummy_shared.sqlite3", "cachePath": "./data/cache/dummy_cache.sqlite3"},
    }
    schema = {"tableName": TABLE, "columns": {f: physical_name(f) for f in logical_fields}}
    for path, data in ((CONFIG_PATH, config), (SCHEMA_PATH, schema)):
        with open(path, "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="ダミーの共有 SQLite を作る")
    parser.add_argument("--lots", type=int, default=2500, help="ロットの数（1 ロットに BOX 1〜3 件）")
    parser.add_argument("--variant", choices=["normal", "missing-table", "missing-column", "corrupt"], default="normal")
    parser.add_argument("--if-missing", action="store_true")
    args = parser.parse_args()

    if args.if_missing and all(os.path.isfile(p) for p in (SHARED_PATH, CONFIG_PATH, SCHEMA_PATH)):
        print("ダミーデータはすでにあります。")
        return
    with open(SCHEMA_SAMPLE, encoding="utf-8") as fp:
        logical_fields = list(json.load(fp)["columns"])
    rows = build_rows(args.lots, logical_fields, random.Random(SEED))
    write_database(SHARED_PATH, rows, logical_fields, args.variant)
    write_config(logical_fields)
    print(f"ダミーの共有データを作成しました（{args.variant}・ロット {args.lots:,} 件・BOX {len(rows):,} 件）: {SHARED_PATH}")
    print(f"上書き設定: {DUMMY_DIR}（config.local.json / schema.local.json）")


if __name__ == "__main__":
    main()
```

`python/tools/make_view_labels.py`

```python
"""schema の列名から、詳細・一覧・検索・絞り込みで使う表示名の下書きを作る。

  読む   : config/sample/schema.sample.json ＋ <上書きフォルダ>/schema.local.json（columns の列名）
  書き出す: <上書きフォルダ>/view.local.json の fields.<項目>.label（ほかの設定はそのまま残す）

  ・すでに表示名がある項目は残す（手で直した表示名は消えない）。schema に項目が増えたら、もう一度実行すれば足りない分だけ入る
  ・--overwrite で、すでにある表示名も列名で置き換える
  ・書き換える前の view.local.json は view.local.json.bak に残す
  ・画面での優先順：view の表示名（このツールで入れたものを含む）→ 論理名

使い方:
    python python/tools/make_view_labels.py                         … config/local に書く
    python python/tools/make_view_labels.py --local-dir config/dummy
    python python/tools/make_view_labels.py --dry-run               … 書き込まずに件数だけ見る
    python python/tools/make_view_labels.py --overwrite
"""

import argparse
import json
import os
import shutil
import sys

APP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(APP_ROOT, "python"))

from data_search.settings.labels import plan_labels  # noqa: E402
from data_search.settings.loader import read_settings_json  # noqa: E402

SAMPLE_DIR = os.path.join(APP_ROOT, "config", "sample")


def shown(path):
    relative = os.path.relpath(path, APP_ROOT)
    return path if relative.startswith("..") else relative


def read_or_stop(path, required):
    if not os.path.isfile(path):
        if required:
            print(f"[止めました] {shown(path)} がありません。")
            sys.exit(1)
        return {}
    issues = []
    data = read_settings_json(path, shown(path), issues)
    if issues:
        print("[止めました] 設定ファイルを読めません。")
        for issue in issues:
            print()
            print(issue.format())
        sys.exit(1)
    return data


def preview(names, limit=8):
    shown = "、".join(names[:limit])
    return f"{shown} ほか {len(names) - limit} 項目" if len(names) > limit else shown


def main():
    parser = argparse.ArgumentParser(description="schema の列名から表示名の下書きを作る")
    parser.add_argument("--local-dir", default=os.path.join(APP_ROOT, "config", "local"), help="上書きフォルダ（既定：config/local）")
    parser.add_argument("--overwrite", action="store_true", help="すでにある表示名も列名で置き換える")
    parser.add_argument("--dry-run", action="store_true", help="書き込まずに件数だけ表示する")
    args = parser.parse_args()

    local_dir = os.path.abspath(args.local_dir)
    sample_schema = read_or_stop(os.path.join(SAMPLE_DIR, "schema.sample.json"), required=True)
    local_schema = read_or_stop(os.path.join(local_dir, "schema.local.json"), required=True)
    view_path = os.path.join(local_dir, "view.local.json")
    view = read_or_stop(view_path, required=False)

    # 項目の並びはサンプルの schema、列名はローカルの schema を優先（社内だけで足した項目も含める）
    columns = dict(sample_schema.get("columns") or {})
    columns.update(local_schema.get("columns") or {})
    plan = plan_labels(columns, view.get("fields"), overwrite=args.overwrite)

    # 列名そのものは表示しない（画面に出すのは書き込み後の表示名だけ）。項目名と件数だけ
    print(f"新しく入れる: {len(plan.added)} 項目")
    if args.overwrite:
        print(f"置き換える  : {len(plan.replaced)} 項目")
    print(f"そのまま残す: {len(plan.kept)} 項目（すでに表示名あり）")
    if plan.skipped:
        print(f"書かない    : {len(plan.skipped)} 項目（列名が仮の値・空・論理名と同じ）: {preview(plan.skipped)}")
    if args.dry_run:
        print("（--dry-run のため書き込んでいません）")
        return 0
    if not plan.added and not plan.replaced:
        print("変更はありません。")
        return 0

    if os.path.isfile(view_path):
        shutil.copyfile(view_path, view_path + ".bak")
    view["fields"] = plan.fields
    os.makedirs(local_dir, exist_ok=True)
    with open(view_path, "w", encoding="utf-8") as fp:
        json.dump(view, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    print(f"書き込みました: {shown(view_path)}（表示名は手で直せます。直した表示名は次回も残ります）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`python/tools/sync_sample_view.py`

```python
"""画面だけで試すモード（index.html を直接開いたとき）用の表示定義を、公開サンプルから作り直す。

file:// で開いた画面は JSON ファイルを読めないため、config/sample/schema.sample.json と
view.sample.json の論理情報を src/js/sample/sample-view.js に書き写して使う。
サンプルの view / schema を変えたら、このスクリプトを実行する（テストで一致を確かめている）。

使い方: python python/tools/sync_sample_view.py
"""

import json
import os
import sys

APP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(APP_ROOT, "python"))

from data_search.settings import public_view_of  # noqa: E402
from data_search.settings.defaults import BUILTIN_DEFAULTS  # noqa: E402
from data_search.settings.merge import fill_defaults  # noqa: E402

SAMPLE_DIR = os.path.join(APP_ROOT, "config", "sample")
OUTPUT = os.path.join(APP_ROOT, "src", "js", "sample", "sample-view.js")

TEMPLATE = """/* =========================================================
   画面だけで試すモード用の表示定義（自動生成。手で直さない）
   元: config/sample/view.sample.json と schema.sample.json の論理情報
   作り直し: python python/tools/sync_sample_view.py
   ========================================================= */
(function () {{
  'use strict';

  window.DS = window.DS || {{}};
  window.DS.sampleView = /*VIEW_JSON_START*/{json}/*VIEW_JSON_END*/;
}})();
"""


def main():
    with open(os.path.join(SAMPLE_DIR, "schema.sample.json"), encoding="utf-8") as fp:
        schema = json.load(fp)
    with open(os.path.join(SAMPLE_DIR, "view.sample.json"), encoding="utf-8") as fp:
        view = json.load(fp)
    # サンプルから省かれた任意の項目は、起動時と同じく内部の既定値で補う
    schema = fill_defaults(schema, BUILTIN_DEFAULTS["schema"])
    view = fill_defaults(view, BUILTIN_DEFAULTS["view"])
    text = json.dumps(public_view_of(schema, view), ensure_ascii=False, indent=2)
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
  const searchFor = async (searchType, keyword, matchMode) => {
    search.setQuery({ searchType, keyword, matchMode: matchMode || 'partial' });
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

    // ── 番号の検索（任意） ──
    let r = await searchFor('lotNo', 'LOT-2026-00012', 'exact');
    const boxes = r.totalCount;
    check('完全一致でそのロットの BOX だけが出る', boxes >= 1 && boxes <= 3 && r.items.every((item) => item.lotNo === 'LOT-2026-00012'), `${boxes} 件`);
    r = await searchFor('lotNo', 'ｌｏｔ－２０２６－０００１２', 'exact');
    check('全角・小文字でも見つかる', r.totalCount === boxes);
    r = await searchFor('lotNo', 'NOTHING-0', 'partial');
    check('0 件も正常に表示する', r.totalCount === 0 && document.querySelector('.empty').hidden === false);
    await search.clearKeyword();
    check('入力を消すと一覧に戻る', result().totalCount === total && !store.get().search.request.keyword);

    // ── 絞り込み ──
    await search.setFilter('cfStatus', { type: 'values', values: ['仕掛中'] });
    const wip = result().totalCount;
    check('状態で絞り込める', wip > 0 && wip < total && result().items.every((item) => item.cfStatus === '仕掛中'), `${wip} 件`);
    await search.setFilter('customerName', { type: 'values', values: ['架空商事'] });
    check('取引先名でも絞り込める（かつ）', result().items.every((item) => item.cfStatus === '仕掛中' && item.customerName === '架空商事'), `${result().totalCount} 件`);
    const values = await app.api.call('get_filter_values', { field: 'cfStatus', filters: store.get().filters });
    check('値の一覧に件数が出る（自分の条件は外して数える）', values.values.length > 1);

    // ── タグ ──
    const saved = tags.save('確認用タグ');
    check('今の条件をタグにできる', saved.ok && store.get().tags.activeId === saved.tag.id);
    check('同じ名前のタグは作れない', tags.save('確認用タグ').ok === false);
    await tags.apply(null);
    check('「すべて」で絞り込みを外せる', result().totalCount === total && store.get().tags.activeId === null);
    await tags.apply(saved.tag.id);
    check('タグを押すと同じ条件に戻る', Object.keys(store.get().filters).length === 2 && store.get().tags.activeId === saved.tag.id);
    await search.setFilter('cfStatus', { type: 'values', values: ['仕掛中', '保留'] });
    check('条件を変えると「変更あり」になる', tags.isModified() === true);
    tags.remove(saved.tag.id);
    check('タグを消せる', !store.get().tags.items.some((tag) => tag.id === saved.tag.id));

    // ── 詳細 ──
    await search.setFilters({});
    await search.select(result().items[0]);
    check('行を選ぶと詳細が出る', document.getElementById('detail').hidden === false);
    search.closeDetail();

    // ── 1 ロットに BOX が複数 ──
    await samples.load('multi-box');
    r = result();
    check('同じロット番号の 3 BOX が出る', r.totalCount === 3);
    await search.select(r.items[2]);
    check('ロット番号＋BOX番号で 1 件に決まる', store.get().selection.item.boxNo === r.items[2].boxNo);
    search.closeDetail();

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

