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
