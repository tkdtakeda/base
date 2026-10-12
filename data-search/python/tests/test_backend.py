"""Python 版バックエンドのテスト（実データは使わない）。

実行: python -m unittest discover -s python/tests
"""

import json
import logging
import os
import shutil
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_search.cache_service import CacheService  # noqa: E402
from data_search.config_loader import load_config, resolve_config_path  # noqa: E402
from data_search.errors import AppError  # noqa: E402
from data_search.http_server import AppContext, create_server  # noqa: E402
from data_search.lot_service import LotService  # noqa: E402

COLUMNS = {
    "lotNo": "LOT_NO", "inspectionNo": "KENSA_NO", "castingNo": "CHUZO_NO", "orderNo": "JUCHU_NO",
    "material": "ZAISHITSU", "temper": "SHITSUBETSU", "size": "SUNPO", "customer": "得意先名",
    "deliveryDate": "NOUKI", "process": "KOUTEI", "equipment": "SETSUBI", "status": "JOUTAI",
}
ROWS = [
    ("LOT-001", "INS-001", "CST-001", "ORD-1", "A5052", "H14", "t1×1000×2000", "サンプル工業", "2026-10-01", "検査", "QC-01", "検査済み"),
    ("LOT-002", "INS-002", "CST-002", "ORD-1", "A6061", "T6", "t2×1000×2000", "テスト金属", "2026-10-02", "切断", "SL-01", "仕掛中"),
    ("LOT_100%-A", "INS-003", "CST-003", "ORD-2", "A1100", "O", "t1×1000×2000", "見本製作所", "2026-10-03", "鋳造", "CST-01", "保留"),
    ("試作-α-001", "INS-004", "CST-004", "ORD-3", "A7075", "T651", "t5×1250×2500", "架空商事", "2026-10-04", "焼鈍", "AN-01", "不適合"),
    ("LOT-DUP", "INS-005", "CST-005", "ORD-4", "A3003", "H24", "t1×1000×2000", "例示精工", "2026-10-05", "検査", "QC-02", "検査待ち"),
    ("LOT-DUP", "INS-006", "CST-006", "ORD-4", "A3003", "H24", "t1×1000×2000", "例示精工", "2026-10-05", "検査", "QC-02", "出荷済み"),
]
SAMPLE_CONFIG = os.path.join(os.path.dirname(__file__), "..", "..", "config", "config.sample.json")
SILENT = logging.getLogger("test-silent")
SILENT.addHandler(logging.NullHandler())
SILENT.propagate = False


def make_db(path, variant="normal"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        os.remove(path)
    if variant == "corrupt":
        with open(path, "wb") as fp:
            fp.write(b"broken" * 200)
        return
    columns = list(COLUMNS.values())
    if variant == "missing-column":
        columns = columns[:-1]
    table = "other" if variant == "missing-table" else "t_lot"
    conn = sqlite3.connect(path)
    conn.execute(f'CREATE TABLE "{table}" ({", ".join(chr(34) + c + chr(34) for c in columns)})')
    conn.executemany(
        f'INSERT INTO "{table}" VALUES ({", ".join("?" for _ in columns)})',
        [row[: len(columns)] for row in ROWS],
    )
    conn.commit()
    conn.close()


class BackendTestCase(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.root, "config"))
        # 正式なスキーマ（config.sample.json）をテスト用のフォルダへ置く
        shutil.copyfile(SAMPLE_CONFIG, os.path.join(self.root, "config", "config.sample.json"))
        self.source = os.path.join(self.root, "shared", "source.sqlite3")
        make_db(self.source)
        self.config_path = self.write_config()
        self.config = load_config(self.config_path)
        self.cache = CacheService(self.config, SILENT)
        self.service = LotService(self.config, self.cache, SILENT)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def write_config(self, name="config.local.json", **overrides):
        """config.sample.json と同じ形で、値だけを差し替えた設定を書く。"""
        with open(SAMPLE_CONFIG, encoding="utf-8") as fp:
            config = json.load(fp)
        config["dataSource"].update({
            "sourcePath": "./shared/source.sqlite3",
            "cachePath": "./data/cache/cache.sqlite3",
            "tableName": "t_lot",
        })
        config["fieldMappings"] = dict(COLUMNS)
        for path, value in overrides.items():
            node = config
            keys = path.split(".")
            for key in keys[:-1]:
                node = node[key]
            node[keys[-1]] = value
        path = os.path.join(self.root, "config", name)
        with open(path, "w", encoding="utf-8") as fp:
            json.dump(config, fp, ensure_ascii=False)
        return path

    def search(self, keyword, search_type="lotNo", match_mode="partial", **extra):
        return self.service.search({"searchType": search_type, "keyword": keyword, "matchMode": match_mode, **extra})


class ConfigTest(BackendTestCase):
    def test_relative_paths_resolve_from_app_root(self):
        self.assertEqual(self.config.source_path, os.path.normpath(self.source))

    def test_local_is_preferred_then_sample(self):
        config_dir = os.path.join(self.root, "config")
        self.assertTrue(resolve_config_path(config_dir).endswith("config.local.json"))
        self.assertEqual(self.config.config_source, "local")
        self.assertFalse(self.config.incomplete)
        os.remove(self.config_path)
        self.assertTrue(resolve_config_path(config_dir).endswith("config.sample.json"))

    def test_sample_fallback_starts_as_incomplete(self):
        os.remove(self.config_path)
        config = load_config(resolve_config_path(os.path.join(self.root, "config")))
        self.assertEqual(config.config_source, "sample")
        self.assertIn("dataSource.sourcePath", config.incomplete_settings)
        self.assertIn("fieldMappings.lotNo", config.incomplete_settings)
        cache = CacheService(config, SILENT)
        status = cache.status()
        self.assertTrue(status["configIncomplete"])
        self.assertFalse(status["available"])
        with self.assertRaises(AppError) as ctx:
            cache.refresh()
        self.assertEqual(ctx.exception.code, "CONFIG_INCOMPLETE")
        with self.assertRaises(AppError) as ctx:
            LotService(config, cache, SILENT).list({})
        self.assertEqual(ctx.exception.code, "CONFIG_INCOMPLETE")

    def test_placeholder_left_in_local_is_incomplete(self):
        path = self.write_config(**{"dataSource.tableName": "<TARGET_TABLE_NAME>"})
        config = load_config(path)
        self.assertEqual(config.incomplete_settings, ("dataSource.tableName",))

    def assert_structure_error(self, mutate, expected):
        with open(self.config_path, encoding="utf-8") as fp:
            data = json.load(fp)
        mutate(data)
        with open(self.config_path, "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False)
        with self.assertRaises(AppError) as ctx:
            load_config(self.config_path)
        self.assertEqual(ctx.exception.code, "CONFIG_INVALID")
        self.assertIn(expected, ctx.exception.detail)

    def test_missing_key_is_rejected(self):
        self.assert_structure_error(lambda d: d["dataSource"].pop("tableName"), "dataSource.tableName がありません")

    def test_extra_key_is_rejected(self):
        self.assert_structure_error(lambda d: d["dataSource"].update({"table": "x"}), "dataSource.table は config.sample.json にないキーです")

    def test_old_structure_is_rejected(self):
        def to_old(d):
            d["dataSources"] = [d.pop("dataSource")]
        self.assert_structure_error(to_old, "dataSource がありません")

    def test_type_mismatch_is_rejected(self):
        self.assert_structure_error(lambda d: d["search"].update({"pageSize": "100"}), "search.pageSize は 整数 にしてください")
        self.assert_structure_error(lambda d: d["dataSource"].update({"readOnly": 1}), "dataSource.readOnly は true/false にしてください")

    def test_missing_explicit_config(self):
        with self.assertRaises(AppError) as ctx:
            load_config(os.path.join(self.root, "config", "nothing.json"))
        self.assertEqual(ctx.exception.code, "CONFIG_NOT_FOUND")


class CacheTest(BackendTestCase):
    def test_refresh_creates_cache_and_removes_temp(self):
        result = self.cache.refresh()
        self.assertTrue(result["success"])
        self.assertEqual(result["rowCount"], len(ROWS))
        self.assertTrue(os.path.isfile(self.config.cache_path))
        self.assertFalse(os.path.exists(self.cache.temp_path))
        status = self.cache.status()
        self.assertTrue(status["available"])
        self.assertFalse(status["usingPreviousCache"])

    def test_unreachable_source_keeps_previous_cache(self):
        self.cache.refresh()
        os.remove(self.source)
        with self.assertRaises(AppError) as ctx:
            self.cache.refresh()
        self.assertEqual(ctx.exception.code, "SOURCE_UNAVAILABLE")
        status = self.cache.status()
        self.assertTrue(status["available"])
        self.assertTrue(status["usingPreviousCache"])
        self.assertFalse(status["sourceReachable"])
        self.assertEqual(self.search("LOT")["totalCount"], 5)

    def assert_variant_rejected(self, variant, code):
        self.cache.refresh()
        make_db(self.source, variant)
        with self.assertRaises(AppError) as ctx:
            self.cache.refresh()
        self.assertEqual(ctx.exception.code, code)
        self.assertFalse(os.path.exists(self.cache.temp_path))
        self.assertEqual(self.search("LOT-001")["totalCount"], 1)

    def test_corrupt_copy_is_rejected(self):
        self.assert_variant_rejected("corrupt", "CACHE_INVALID")

    def test_missing_table_is_rejected(self):
        self.assert_variant_rejected("missing-table", "CACHE_TABLE_MISSING")

    def test_missing_column_is_rejected(self):
        self.assert_variant_rejected("missing-column", "CACHE_COLUMN_MISSING")

    def test_search_without_cache(self):
        with self.assertRaises(AppError) as ctx:
            self.search("LOT")
        self.assertEqual(ctx.exception.code, "CACHE_UNAVAILABLE")

    def test_source_is_not_modified(self):
        before = os.stat(self.source).st_mtime_ns
        self.cache.refresh()
        self.search("LOT")
        self.assertEqual(os.stat(self.source).st_mtime_ns, before)


class SearchTest(BackendTestCase):
    def setUp(self):
        super().setUp()
        self.cache.refresh()

    def test_partial_and_exact(self):
        self.assertEqual(self.search("LOT-00")["totalCount"], 2)
        self.assertEqual(self.search("LOT-00", match_mode="exact")["totalCount"], 0)
        self.assertEqual(self.search("lot-001", match_mode="exact")["totalCount"], 1)

    def test_items_use_logical_names(self):
        item = self.search("LOT-001")["items"][0]
        self.assertEqual(set(item), set(COLUMNS))
        self.assertEqual(item["customer"], "サンプル工業")

    def test_zero_results_is_success(self):
        result = self.search("NOTHING")
        self.assertTrue(result["success"])
        self.assertEqual(result["totalCount"], 0)
        self.assertEqual(result["items"], [])

    def test_like_wildcards_are_literal(self):
        self.assertEqual(self.search("%")["totalCount"], 1)
        self.assertEqual(self.search("_")["totalCount"], 1)
        self.assertEqual(self.search("LOT_100%-A", match_mode="exact")["totalCount"], 1)

    def test_japanese_and_full_width_keyword(self):
        self.assertEqual(self.search("試作")["totalCount"], 1)
        self.assertEqual(self.search("ＬＯＴ－００１")["totalCount"], 1)
        self.assertEqual(self.search("  LOT-001  ", match_mode="exact")["keyword"], "LOT-001")

    def test_injection_like_keyword_is_harmless(self):
        result = self.search("'; DROP TABLE t_lot; --")
        self.assertEqual(result["totalCount"], 0)
        self.assertEqual(self.search("LOT")["totalCount"], 5)

    def test_other_search_types(self):
        self.assertEqual(self.search("INS-003", "inspectionNo", "exact")["items"][0]["lotNo"], "LOT_100%-A")
        self.assertEqual(self.search("CST-004", "castingNo")["totalCount"], 1)
        self.assertEqual(self.search("ORD-1", "orderNo", "exact")["totalCount"], 2)

    def test_paging_and_sort(self):
        first = self.search("LOT", pageSize=2, page=1, sortKey="lotNo", sortOrder="desc")
        self.assertEqual(first["totalCount"], 5)
        self.assertEqual(first["count"], 2)
        second = self.search("LOT", pageSize=2, page=3)
        self.assertEqual(second["count"], 1)

    def test_invalid_requests(self):
        bad = [
            {"searchType": "material", "keyword": "A"},
            {"searchType": "lotNo", "keyword": ""},
            {"searchType": "lotNo", "keyword": "A", "matchMode": "regex"},
            {"searchType": "lotNo", "keyword": "A", "sortKey": "LOT_NO"},
            {"searchType": "lotNo", "keyword": "A", "pageSize": 501},
            {"searchType": "lotNo", "keyword": "A", "page": 0},
            {"searchType": "lotNo", "keyword": "x" * 101},
        ]
        for payload in bad:
            with self.subTest(payload=payload), self.assertRaises(AppError) as ctx:
                self.service.search(payload)
            self.assertEqual(ctx.exception.code, "INVALID_REQUEST")

    def test_detail_by_lot_and_casting(self):
        result = self.service.detail({"lotNo": "LOT-DUP", "castingNo": "CST-006"})
        self.assertEqual(result["item"]["inspectionNo"], "INS-006")
        with self.assertRaises(AppError) as ctx:
            self.service.detail({"lotNo": "LOT-DUP", "castingNo": "CST-999"})
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


class FilterTest(BackendTestCase):
    """絞り込み。今日は 2026-10-03 に固定する。"""

    EXTRA = [
        ("LOT-SLASH", "INS-101", "CST-101", "ORD-9", "A5052", "H14", "-", "サンプル工業", "2026/10/10", "検査", "QC-01", "仕掛中"),
        ("LOT-COMPACT", "INS-102", "CST-102", "ORD-9", "A5052", "H14", "-", "サンプル工業", "20261020", "検査", "QC-01", "仕掛中"),
        ("LOT-BLANK", "INS-103", "CST-103", "ORD-9", "A5052", "H14", "-", "", None, "検査", "QC-01", None),
    ]

    def setUp(self):
        super().setUp()
        conn = sqlite3.connect(self.source)
        conn.executemany(f'INSERT INTO "t_lot" VALUES ({", ".join("?" for _ in COLUMNS)})', self.EXTRA)
        conn.commit()
        conn.close()
        self.cache.refresh()
        from datetime import date
        self.service = LotService(self.config, self.cache, SILENT, today=lambda: date(2026, 10, 3))

    def lots(self, filters, **extra):
        result = self.service.list({"filters": filters, **extra})
        return [item["lotNo"] for item in result["items"]], result

    def test_list_without_keyword_sorted_by_date_blank_last(self):
        lots, result = self.lots({})
        self.assertEqual(result["totalCount"], len(ROWS) + len(self.EXTRA))
        self.assertEqual(lots[0], "LOT-001")
        self.assertEqual(lots[-1], "LOT-BLANK")
        self.assertEqual(lots[-3:-1], ["LOT-SLASH", "LOT-COMPACT"])
        self.assertEqual(result["today"], "2026-10-03")

    def test_values_filter_with_blank(self):
        lots, _ = self.lots({"status": {"type": "values", "values": ["仕掛中", None]}})
        self.assertEqual(sorted(lots), ["LOT-002", "LOT-BLANK", "LOT-COMPACT", "LOT-SLASH"])
        lots, _ = self.lots({"customer": {"type": "values", "values": [None]}})
        self.assertEqual(lots, ["LOT-BLANK"])

    def test_relative_date_filter(self):
        overdue, _ = self.lots({"deliveryDate": {"type": "date", "mode": "relative", "fromDays": None, "toDays": -1}})
        self.assertEqual(overdue, ["LOT-001", "LOT-002"])
        within, _ = self.lots({"deliveryDate": {"type": "date", "mode": "relative", "fromDays": 0, "toDays": 7}})
        self.assertEqual(within, ["LOT_100%-A", "試作-α-001", "LOT-DUP", "LOT-DUP", "LOT-SLASH"])

    def test_absolute_date_filter_handles_formats(self):
        lots, _ = self.lots({"deliveryDate": {"type": "date", "mode": "absolute", "from": "2026-10-10", "to": "2026-10-20"}})
        self.assertEqual(lots, ["LOT-SLASH", "LOT-COMPACT"])

    def test_filters_combine_with_keyword(self):
        lots, _ = self.lots(
            {"status": {"type": "values", "values": ["仕掛中"]}},
            searchType="lotNo", keyword="LOT-", matchMode="partial",
        )
        self.assertEqual(lots, ["LOT-002", "LOT-SLASH", "LOT-COMPACT"])

    def test_filter_values_are_faceted(self):
        result = self.service.filter_values({
            "field": "status",
            "filters": {
                "status": {"type": "values", "values": ["保留"]},
                "customer": {"type": "values", "values": ["サンプル工業"]},
            },
        })
        counts = {row["value"]: row["count"] for row in result["values"]}
        self.assertEqual(counts, {"仕掛中": 2, "検査済み": 1})

    def test_invalid_filters(self):
        bad = [
            {"lotNo": {"type": "values", "values": ["x"]}},
            {"status": {"type": "date", "mode": "relative", "fromDays": 0}},
            {"status": {"type": "values", "values": "仕掛中"}},
            {"deliveryDate": {"type": "date", "mode": "absolute", "from": "2026-13-01"}},
            {"deliveryDate": {"type": "date", "mode": "absolute", "from": "2026-10-10", "to": "2026-10-01"}},
            {"deliveryDate": {"type": "date", "mode": "relative", "fromDays": 99999}},
        ]
        for filters in bad:
            with self.subTest(filters=filters), self.assertRaises(AppError) as ctx:
                self.service.list({"filters": filters})
            self.assertEqual(ctx.exception.code, "INVALID_REQUEST")

    def test_empty_conditions_are_ignored(self):
        _, result = self.lots({
            "status": {"type": "values", "values": []},
            "deliveryDate": {"type": "date", "mode": "relative", "fromDays": None, "toDays": None},
        })
        self.assertEqual(result["totalCount"], len(ROWS) + len(self.EXTRA))


class HttpTest(BackendTestCase):
    def setUp(self):
        super().setUp()
        self.cache.refresh()
        context = AppContext(self.config, self.cache, self.service, SILENT)
        static = os.path.join(os.path.dirname(__file__), "..", "..", "src")
        self.server = create_server(context, static, "127.0.0.1", 0)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        super().tearDown()

    def post(self, name, payload, headers=None):
        request = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/{name}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", **(headers or {})},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_commands(self):
        status, body = self.post("search_lots", {"searchType": "lotNo", "keyword": "LOT-001"})
        self.assertEqual((status, body["totalCount"]), (200, 1))
        status, body = self.post("get_application_info", {})
        self.assertEqual(body["id"], "data-search")
        status, body = self.post("get_cache_status", {})
        self.assertTrue(body["available"])
        status, body = self.post("list_lots", {"filters": {"status": {"type": "values", "values": ["保留"]}}})
        self.assertEqual(body["totalCount"], 1)
        status, body = self.post("get_filter_values", {"field": "status"})
        self.assertEqual(len(body["values"]), 6)

    def test_error_shape_hides_internal_detail(self):
        status, body = self.post("search_lots", {"searchType": "LOT_NO", "keyword": "x"})
        self.assertFalse(body["success"])
        self.assertEqual(set(body["error"]), {"code", "userMessage", "detailId"})
        self.assertNotIn("LOT_NO", json.dumps(body, ensure_ascii=False))

    def test_unknown_command_and_foreign_origin(self):
        self.assertEqual(self.post("drop_table", {})[0], 404)
        self.assertEqual(self.post("search_lots", {}, {"Origin": "http://evil.example"})[0], 403)

    def test_static_files_are_served_with_js_mime(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/js/app.js") as response:
            self.assertIn("javascript", response.headers["Content-Type"])


if __name__ == "__main__":
    unittest.main()
