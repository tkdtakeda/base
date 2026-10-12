"""動作確認用のダミー共有 SQLite と、それを指す config/config.dummy.json を作る。

実データは使わない。物理名はわざと論理名と違う名前（日本語の列名を含む）にして、
設定ファイルの対応付け（fieldMappings）が効いていることを確かめられるようにしている。

使い方:
    python python/tools/make_dummy_db.py                    … 正常なダミー（5,000 件）
    python python/tools/make_dummy_db.py --rows 100000      … 大量データ
    python python/tools/make_dummy_db.py --variant corrupt  … 壊れたファイル（異常系の確認）
        variant: normal / missing-table / missing-column / corrupt
    python python/tools/make_dummy_db.py --if-missing       … すでにあれば何もしない
"""

import argparse
import json
import os
import random
import sqlite3
from datetime import date, timedelta

APP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHARED_PATH = os.path.join(APP_ROOT, "data", "dummy", "shared", "dummy_shared.sqlite3")
CONFIG_PATH = os.path.join(APP_ROOT, "config", "config.dummy.json")
TABLE = "t_dummy_lot"
SEED = 20261011

COLUMNS = {
    "lotNo": "LOT_NO",
    "inspectionNo": "KENSA_NO",
    "castingNo": "CHUZO_NO",
    "orderNo": "JUCHU_NO",
    "material": "ZAISHITSU",
    "temper": "SHITSUBETSU",
    "size": "SUNPO",
    "customer": "得意先名",
    "deliveryDate": "NOUKI",
    "process": "KOUTEI",
    "equipment": "SETSUBI",
    "status": "JOUTAI",
}

MATERIALS = ["A1100", "A3003", "A5052", "A6061", "A6063", "A7075"]
TEMPERS = ["O", "H14", "H24", "H32", "T5", "T6", "T651"]
CUSTOMERS = ["サンプル工業", "テスト金属", "見本製作所", "架空商事", "例示精工", "ダミー産業"]
PROCESSES = [("鋳造", "CST"), ("熱間圧延", "HR"), ("冷間圧延", "CR"), ("焼鈍", "AN"), ("切断", "SL"), ("検査", "QC")]
STATUSES = ["仕掛中", "検査待ち", "検査済み", "出荷済み", "保留", "不適合"]
SPECIAL_LOTS = ["試作-α-001", "LOT_100%-A", "LOT#5/特急", "LOT(再)-12", "LOT'Q\"-1"]


def build_rows(count, rng):
    rows = []
    today = date.today()  # 日付の絞り込み（今日〜7 日後など）をいつでも試せるよう、今日を基準にする
    order_no, order_left = 0, 0
    for i in range(1, count + 1):
        if order_left == 0:
            order_no += 1
            order_left = rng.randint(1, 6)
        order_left -= 1
        process, prefix = rng.choice(PROCESSES)
        lot = SPECIAL_LOTS[i - 1] if i <= len(SPECIAL_LOTS) else f"LOT-2026-{i:05d}"
        rows.append((
            lot,
            f"INS-26-{i:06d}",
            f"CST-{rng.randint(10, 99)}{i:06d}",
            f"ORD-{order_no:05d}",
            rng.choice(MATERIALS),
            rng.choice(TEMPERS),
            f"t{rng.choice([0.5, 1.0, 1.5, 2.0, 3.0, 5.0])}×{rng.choice([1000, 1250, 1525])}×{rng.choice([2000, 2500, 3000])}",
            rng.choice(CUSTOMERS),
            (today + timedelta(days=rng.randint(-60, 90))).isoformat(),
            process,
            f"{prefix}-{rng.randint(1, 4):02d}",
            rng.choice(STATUSES),
            "2026-10-11T08:00:00",
        ))
    return rows


def write_database(path, rows, variant):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for suffix in ("", "-wal", "-shm", "-journal"):
        if os.path.exists(path + suffix):
            os.remove(path + suffix)
    if variant == "corrupt":
        with open(path, "wb") as fp:
            fp.write(b"this is not a sqlite database" * 100)
        return

    columns = list(COLUMNS.values())
    if variant == "missing-column":
        columns.remove(COLUMNS["status"])
    table = "t_other" if variant == "missing-table" else TABLE
    column_defs = ", ".join(f'"{name}" TEXT' for name in columns + ["UPDATED_AT"])
    conn = sqlite3.connect(path)
    try:
        conn.execute(f'CREATE TABLE "{table}" ({column_defs})')
        keep = [i for i, name in enumerate(list(COLUMNS.values()) + ["UPDATED_AT"]) if name in columns + ["UPDATED_AT"]]
        placeholders = ", ".join("?" for _ in keep)
        conn.executemany(
            f'INSERT INTO "{table}" VALUES ({placeholders})',
            ([row[i] for i in keep] for row in rows),
        )
        conn.execute(f'CREATE INDEX "idx_lot" ON "{table}" ("{COLUMNS["lotNo"]}")')
        conn.commit()
    finally:
        conn.close()


def write_config():
    # config.local.json と同じく、config.sample.json から変えたい項目だけを書く
    config = {
        "application": {"name": "Data Search (Dummy)"},
        "dataSource": {
            "sourcePath": "./data/dummy/shared/dummy_shared.sqlite3",
            "cachePath": "./data/cache/dummy_cache.sqlite3",
            "tableName": TABLE,
        },
        "fieldMappings": dict(COLUMNS),
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as fp:
        json.dump(config, fp, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="ダミーの共有 SQLite を作る")
    parser.add_argument("--rows", type=int, default=5000)
    parser.add_argument("--variant", choices=["normal", "missing-table", "missing-column", "corrupt"], default="normal")
    parser.add_argument("--if-missing", action="store_true")
    args = parser.parse_args()

    if args.if_missing and os.path.isfile(SHARED_PATH) and os.path.isfile(CONFIG_PATH):
        print("ダミーデータはすでにあります。")
        return
    rows = build_rows(args.rows, random.Random(SEED))
    write_database(SHARED_PATH, rows, args.variant)
    write_config()
    print(f"ダミーの共有データを作成しました（{args.variant}・{len(rows):,} 件）: {SHARED_PATH}")
    print(f"設定ファイル: {CONFIG_PATH}")


if __name__ == "__main__":
    main()
