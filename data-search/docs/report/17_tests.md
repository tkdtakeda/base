## 17. 必要なテストコードの全文

`python/tests/test_backend.py`

```python
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
from data_search.settings import SettingsError, deep_merge, load_settings  # noqa: E402
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
APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SAMPLE_DIR = os.path.join(APP_ROOT, "config", "sample")
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
    """一時フォルダにアプリのルートを作り、公開サンプル（config/sample）をそのまま置く。
    ローカルの上書き（config/local）は、実際の運用と同じく必要な項目だけを書く。"""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        shutil.copytree(SAMPLE_DIR, os.path.join(self.root, "config", "sample"))
        self.local_dir = os.path.join(self.root, "config", "local")
        os.makedirs(self.local_dir)
        self.source = os.path.join(self.root, "shared", "source.sqlite3")
        make_db(self.source)
        self.write_local("config", {"dataSource": {"sourcePath": "./shared/source.sqlite3"}})
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS)})
        self.config = load_settings(self.root)
        self.cache = CacheService(self.config, SILENT)
        self.service = LotService(self.config, self.cache, SILENT)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def write_local(self, kind, data):
        path = os.path.join(self.local_dir, f"{kind}.local.json")
        with open(path, "w", encoding="utf-8") as fp:
            if isinstance(data, str):
                fp.write(data)
            else:
                json.dump(data, fp, ensure_ascii=False)
        return path

    def remove_local(self, kind):
        os.remove(os.path.join(self.local_dir, f"{kind}.local.json"))

    def search(self, keyword, search_type="lotNo", match_mode="partial", **extra):
        return self.service.search({"searchType": search_type, "keyword": keyword, "matchMode": match_mode, **extra})


class ConfigTest(BackendTestCase):
    def errors_of(self):
        with self.assertRaises(SettingsError) as ctx:
            load_settings(self.root)
        return ctx.exception.issues

    def assert_error(self, file, path, reason_part):
        issues = self.errors_of()
        found = [i for i in issues if i.file == file and i.path == path and reason_part in i.reason]
        self.assertTrue(found, f"見つからない: {file} {path} {reason_part}\n" + "\n".join(i.format() for i in issues))
        self.assertTrue(all(i.action for i in issues))

    # ── マージ ──
    def test_local_with_only_needed_keys_works(self):
        self.assertEqual(self.config.server_port, 8765)          # config.sample の値（local に devServer はない）
        self.assertEqual(self.config.page_size, 100)             # config.sample の値
        self.assertEqual(self.config.table_name, "t_lot")        # schema.local の値
        self.assertEqual(self.config.source_path, os.path.normpath(self.source))
        self.assertEqual(self.config.cache_path, os.path.join(self.root, "data", "cache", "target-data.sqlite3"))
        self.assertEqual(self.config.model.record_key, ("lotNo", "castingNo"))
        self.assertEqual(self.config.model.searchable, ("lotNo", "inspectionNo", "castingNo", "orderNo"))
        self.assertEqual(self.config.model.filters["deliveryDate"], "date")
        self.assertEqual(self.config.warnings, ())
        self.assertEqual([s[2] is not None for s in self.config.sources], [True, True, False])  # view.local はない

    def test_deep_merge_rules(self):
        base = {"a": {"b": 1, "c": 2}, "list": [1, 2, 3], "d": "x", "map": {"k": "v"}}
        merged = deep_merge(base, {"a": {"c": 3}, "list": [9], "e": 1, "map": {"new": "w"}}, open_maps=("map",))
        self.assertEqual(merged.value, {"a": {"b": 1, "c": 3}, "list": [9], "d": "x", "map": {"k": "v", "new": "w"}})
        self.assertEqual(merged.overridden, ["a.c", "list"])
        self.assertEqual(merged.added, ["map.new"])
        self.assertEqual(merged.unknown, ["e"])
        self.assertEqual(base["list"], [1, 2, 3])  # サンプル側は変わらない

    def test_view_array_is_replaced_whole(self):
        self.write_local("view", {"listColumns": [
            {"field": "lotNo", "label": "ロット", "visible": True, "searchable": True},
            {"field": "status", "label": "状態", "visible": True, "searchable": False},
        ]})
        config = load_settings(self.root)
        self.assertEqual([c["field"] for c in config.view["listColumns"]], ["lotNo", "status"])
        self.assertEqual(len(config.view["detailFields"]), 12)  # 上書きしていない配列はサンプルのまま
        self.assertEqual(config.model.searchable, ("lotNo",))

    def test_schema_can_add_logical_field(self):
        conn = sqlite3.connect(self.source)
        conn.execute('ALTER TABLE "t_lot" ADD COLUMN "SAGYOBI" TEXT')
        conn.commit()
        conn.close()
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS, workDate="SAGYOBI"), "types": {"workDate": "date"}})
        self.write_local("view", {"filters": [{"field": "workDate", "type": "date"}], "fields": {"workDate": {"label": "作業日"}}})
        config = load_settings(self.root)
        self.assertIn("workDate", config.model.fields)
        self.assertEqual(config.model.filters, {"workDate": "date"})
        self.assertEqual(config.warnings, ())

    def test_unknown_keys_are_warned_with_file_and_path(self):
        self.write_local("config", {"dataSource": {"sourcePath": "./shared/source.sqlite3", "tableName": "x"}, "dataSources": []})
        config = load_settings(self.root)
        self.assertEqual({(w.file, w.path) for w in config.warnings},
                         {("config/local/config.local.json", "dataSource.tableName"), ("config/local/config.local.json", "dataSources")})

    # ── ローカルがない ──
    def test_without_local_files_validation_runs_and_stops_on_placeholders(self):
        for kind in ("config", "schema"):
            self.remove_local(kind)
        issues = self.errors_of()
        places = {(i.file, i.path) for i in issues}
        self.assertIn(("config/local/config.local.json", "dataSource.sourcePath"), places)
        self.assertIn(("config/local/schema.local.json", "tableName"), places)
        self.assertIn(("config/local/schema.local.json", "columns.lotNo"), places)
        self.assertFalse(any(i.path == "(ファイル)" for i in issues))  # ローカルがないこと自体は誤りにしない

    def test_table_and_columns_are_not_required_in_config_local(self):
        # config.local.json にテーブル名・列名がないことは誤りではない（schema 側で確かめる）
        self.assertFalse(any(i.file.endswith("config.local.json") for i in self.config.warnings))

    # ── 検証：config ──
    def test_type_mismatch(self):
        self.write_local("config", {"dataSource": {"sourcePath": "./s.sqlite3"}, "search": {"pageSize": "100"}})
        self.assert_error("config/local/config.local.json", "search.pageSize", "整数")

    def test_page_size_rules(self):
        self.write_local("config", {"dataSource": {"sourcePath": "./s.sqlite3"}, "search": {"pageSize": 600}})
        self.assert_error("config/local/config.local.json", "search.pageSize", "maxPageSize")
        self.write_local("config", {"dataSource": {"sourcePath": "./s.sqlite3"}, "search": {"maxPageSize": 0}})
        self.assert_error("config/local/config.local.json", "search.maxPageSize", "正の整数")

    def test_dev_server_port(self):
        self.write_local("config", {"dataSource": {"sourcePath": "./s.sqlite3"}, "devServer": {"port": 70000}})
        self.assert_error("config/local/config.local.json", "devServer.port", "ポート番号")

    def test_broken_json_and_duplicate_keys(self):
        self.write_local("config", "{ broken")
        self.assert_error("config/local/config.local.json", "1 行目", "JSON")
        self.write_local("schema", '{"tableName": "t_lot", "tableName": "t2", "columns": {}}')
        self.write_local("config", {"dataSource": {"sourcePath": "./s.sqlite3"}})
        self.assert_error("config/local/schema.local.json", "tableName", "重複")

    # ── 検証：schema ──
    def test_schema_rules(self):
        self.write_local("schema", {"tableName": " ", "columns": dict(COLUMNS, status="")})
        self.assert_error("config/local/schema.local.json", "tableName", "空")
        self.assert_error("config/local/schema.local.json", "columns.status", "空")

    def test_data_source_id_must_match(self):
        self.write_local("schema", {"dataSourceId": "other", "tableName": "t_lot", "columns": dict(COLUMNS)})
        self.assert_error("config/local/schema.local.json", "dataSourceId", "一致しません")

    # ── 検証：view ──
    def test_view_field_must_exist_in_schema(self):
        self.write_local("view", {"listColumns": [
            {"field": "lotNo", "label": "ロット", "visible": True, "searchable": True},
            {"field": "lotNo", "label": "ロット", "visible": True, "searchable": True},
            {"field": "productNo", "label": "製品", "visible": "yes", "searchable": False},
        ]})
        self.assert_error("config/local/view.local.json", "listColumns[2].field", "schema.columns に定義されていません")
        self.assert_error("config/local/view.local.json", "listColumns[1].field", "重複")
        self.assert_error("config/local/view.local.json", "listColumns[2].visible", "真偽値")

    def test_date_filter_needs_date_type(self):
        self.write_local("view", {"filters": [{"field": "status", "type": "date"}]})
        self.assert_error("config/local/view.local.json", "filters[0].type", "date になっていません")

    def test_labels_survive_replacing_list_columns(self):
        self.write_local("view", {"listColumns": [{"field": "lotNo", "label": "ロットNo.", "visible": True, "searchable": True}]})
        config = load_settings(self.root)
        self.assertEqual(config.view["fields"]["inspectionNo"]["label"], "検査番号")  # fields はサンプルの表示名のまま
        self.assertEqual(config.warnings, ())

    def test_missing_label_is_warned(self):
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS, workDate="SAGYOBI")})
        self.write_local("view", {"detailFields": ["lotNo", "workDate"]})
        config = load_settings(self.root)
        self.assertEqual([(w.path, w.level) for w in config.warnings], [("fields.workDate.label", "warning")])

    def test_error_format(self):
        self.write_local("view", {"defaultSort": {"field": "productNo", "order": "asc"}})
        text = self.errors_of()[0].format()
        self.assertEqual(text.splitlines()[0], "[設定エラー]")
        self.assertIn("対象: config/local/view.local.json", text)
        self.assertIn("項目: defaultSort.field", text)
        self.assertIn("理由: ", text)
        self.assertIn("対応: ", text)

    def test_public_view_has_no_physical_names(self):
        text = json.dumps(self.config.public_view(), ensure_ascii=False)
        for physical in list(COLUMNS.values()) + ["t_lot"]:
            self.assertNotIn(f'"{physical}"', text)

    def test_mock_view_matches_sample(self):
        # 画面だけで試すモード（file://）の表示定義が、公開サンプルと同じであること
        path = os.path.join(APP_ROOT, "src", "js", "sample", "sample-view.js")
        with open(path, encoding="utf-8") as fp:
            text = fp.read()
        embedded = json.loads(text.split("/*VIEW_JSON_START*/", 1)[1].split("/*VIEW_JSON_END*/", 1)[0])
        self.assertEqual(embedded, self.config.public_view())


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
```

画面側の確認用スクリプト（変更なし・引き続き使用）は `tests/ui-check.js`。

