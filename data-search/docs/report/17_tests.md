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
import subprocess
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
from data_search.source_service import SourceService  # noqa: E402
from data_search import commands  # noqa: E402
from data_search.column_catalog import build_catalog  # noqa: E402

APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SAMPLE_DIR = os.path.join(APP_ROOT, "config", "sample")

with open(os.path.join(SAMPLE_DIR, "schema.sample.json"), encoding="utf-8") as _fp:
    ROLE_FIELDS = list(json.load(_fp)["columns"])
# 役割のある列の DB の列名：論理名と違う名前にする（1 列は日本語。引用符の処理の確認用）
COLUMNS = {name: ("取引先_名称" if name == "customerName" else "C_" + name.upper()) for name in ROLE_FIELDS}
# 役割のない列（設定には書かない。DB から自動で表示される）。DB の列の順は「予定設備」が先頭、ほかは後ろ
EXTRA_FIRST, EXTRA_LAST = ["予定設備"], ["注文板厚", "UPDATED_AT"]
TABLE_COLUMNS = EXTRA_FIRST + [COLUMNS[name] for name in ROLE_FIELDS] + EXTRA_LAST

# テストで値を入れる列（論理名、または役割のない列は DB の列名。ほかは空）
ROW_FIELDS = ("lotNo", "boxNo", "inspectionNo", "castingNo", "orderNo", "manufacturingMaterial", "manufacturingTemper",
              "注文板厚", "customerName", "factoryDeliveryDate", "予定設備", "lastActualEquipmentName", "cfStatus")
ROWS = [
    ("LOT-001", "01", "INS-001", "CST-001", "ORD-1", "A5052", "H14", "1.00", "サンプル工業", "2026-10-01", "検査", "QC-01", "検査済み"),
    ("LOT-002", "01", "INS-002", "CST-002", "ORD-1", "A6061", "T6", "2.00", "テスト金属", "2026-10-02", "切断", "SL-01", "仕掛中"),
    ("LOT_100%-A", "01", "INS-003", "CST-003", "ORD-2", "A1100", "O", "1.00", "見本製作所", "2026-10-03", "鋳造", "CST-01", "保留"),
    ("試作-α-001", "01", "INS-004", "CST-004", "ORD-3", "A7075", "T651", "5.00", "架空商事", "2026-10-04", "焼鈍", "AN-01", "不適合"),
    ("LOT-DUP", "01", "INS-005", "CST-005", "ORD-4", "A3003", "H24", "1.00", "例示精工", "2026-10-05", "検査", "QC-02", "検査待ち"),
    ("LOT-DUP", "02", "INS-006", "CST-006", "ORD-4", "A3003", "H24", "1.00", "例示精工", "2026-10-05", "検査", "QC-02", "出荷済み"),
]
SILENT = logging.getLogger("test-silent")
SILENT.addHandler(logging.NullHandler())
SILENT.propagate = False


def full_row(values):
    """1 行を DB の列の順（TABLE_COLUMNS）に並べる。"""
    data = dict(zip(ROW_FIELDS, values))
    by_physical = {COLUMNS.get(name, name): value for name, value in data.items()}
    return [by_physical.get(physical) for physical in TABLE_COLUMNS]


def make_db(path, variant="normal", rows=ROWS):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        os.remove(path)
    if variant == "corrupt":
        with open(path, "wb") as fp:
            fp.write(b"broken" * 200)
        return
    keep = [i for i, name in enumerate(TABLE_COLUMNS) if not (variant == "missing-column" and name == COLUMNS["cfStatus"])]
    columns = [TABLE_COLUMNS[i] for i in keep]
    table = "other" if variant == "missing-table" else "t_lot"
    conn = sqlite3.connect(path)
    conn.execute(f'CREATE TABLE "{table}" ({", ".join(chr(34) + c + chr(34) for c in columns)})')
    conn.executemany(
        f'INSERT INTO "{table}" VALUES ({", ".join("?" for _ in columns)})',
        [[full_row(row)[i] for i in keep] for row in rows],
    )
    conn.commit()
    conn.close()


def other_warnings(config):
    return list(config.warnings)


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
        self.assertEqual(self.config.server_port, 8765)          # 内部の既定値（サンプルにも local にも devServer はない）
        self.assertEqual(self.config.temporary_extension, ".tmp")  # 内部の既定値（サンプルに cache はない）
        self.assertEqual(self.config.page_size, 100)             # config.sample の値
        self.assertEqual(self.config.table_name, "t_lot")        # schema.local の値
        self.assertEqual(self.config.source_path, os.path.normpath(self.source))
        self.assertEqual(self.config.cache_path, os.path.join(self.root, "data", "cache", "target-data.sqlite3"))
        self.assertEqual(self.config.model.record_key, ("lotNo", "boxNo"))
        self.assertEqual(self.config.model.searchable, ("lotNo", "boxNo", "inspectionNo", "castingNo", "orderNo", "customerName"))
        self.assertEqual(self.config.model.filters["cfStatus"], "values")
        self.assertEqual(self.config.model.default_sort, ("factoryDeliveryDate", "asc"))
        self.assertEqual(other_warnings(self.config), [])
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
        self.write_local("view", {"searchFields": ["lotNo"]})
        config = load_settings(self.root)
        self.assertEqual(config.model.searchable, ("lotNo",))
        self.assertEqual(len(config.view["filters"]), 8)  # 上書きしていない配列はサンプルのまま

    def test_types_and_view_can_use_db_column_names(self):
        # 役割のない列（DB の列名）も、日付の型・隠す列・表示の補助に書ける
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS), "types": {"注文板厚": "text", "factoryDeliveryDate": "date"}})
        self.write_local("view", {"hiddenColumns": ["UPDATED_AT"], "fields": {"予定設備": {"mono": True}}})
        config = load_settings(self.root)
        self.assertEqual(config.public_view()["hiddenColumns"], ["UPDATED_AT"])
        self.assertEqual(other_warnings(config), [])

    def test_unknown_keys_are_warned_with_file_and_path(self):
        self.write_local("config", {"dataSource": {"sourcePath": "./shared/source.sqlite3", "tableName": "x"}, "dataSources": []})
        config = load_settings(self.root)
        self.assertEqual({(w.file, w.path) for w in other_warnings(config)},
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

    def test_builtin_defaults_can_be_overridden_without_warning(self):
        # サンプルにない devServer・cache・types も、内部の既定値があるので local で上書きできる
        self.write_local("config", {"dataSource": {"sourcePath": "./s.sqlite3"}, "devServer": {"port": 9000}, "cache": {"temporaryExtension": ".part"}})
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS), "types": {"factoryDeliveryDate": "date"}})
        config = load_settings(self.root)
        self.assertEqual((config.server_port, config.temporary_extension), (9000, ".part"))
        self.assertEqual(config.model.date_fields, ("factoryDeliveryDate",))
        self.assertEqual(other_warnings(config), [])

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
        self.write_local("schema", {"tableName": " ", "columns": dict(COLUMNS, cfStatus="")})
        self.assert_error("config/local/schema.local.json", "tableName", "空")
        self.assert_error("config/local/schema.local.json", "columns.cfStatus", "空")

    def test_data_source_id_must_match(self):
        self.write_local("schema", {"dataSourceId": "other", "tableName": "t_lot", "columns": dict(COLUMNS)})
        self.assert_error("config/local/schema.local.json", "dataSourceId", "一致しません")

    # ── 検証：view ──
    def test_view_field_must_exist_in_schema(self):
        self.write_local("view", {"searchFields": ["lotNo", "lotNo", "productNo"], "hiddenColumns": [""]})
        self.assert_error("config/local/view.local.json", "searchFields[2]", "schema.columns に定義されていません")
        self.assert_error("config/local/view.local.json", "searchFields[1]", "重複")
        self.assert_error("config/local/view.local.json", "hiddenColumns[0]", "空")
        self.write_local("view", {"searchFields": []})
        self.assert_error("config/local/view.local.json", "searchFields", "1 つもありません")

    def test_date_filter_needs_date_type(self):
        self.write_local("view", {"filters": [{"field": "cfStatus", "type": "date"}]})
        self.assert_error("config/local/view.local.json", "filters[0].type", "date になっていません")

    def test_old_style_settings_are_warned_not_errors(self):
        # 以前の形（全項目の columns・listColumns・detailFields・表示名）は止めずに「使っていない」と知らせる
        old_columns = dict(COLUMNS, plannedEquipmentName="PLANNED", orderThickness="THICK")
        self.write_local("schema", {"tableName": "t_lot", "columns": old_columns})
        self.write_local("view", {"listColumns": [{"field": "lotNo"}], "detailFields": ["lotNo"], "detailGroups": [],
                                  "fields": {"lotNo": {"label": "ロット"}, "cfStatus": {"label": "状態", "group": "x"}}})
        config = load_settings(self.root)
        paths = {w.path: w for w in config.warnings}
        self.assertEqual(set(paths), {"columns.<役割のない項目>", "listColumns", "detailFields", "detailGroups", "fields.<列>.label"})
        self.assertIn("2 項目", paths["columns.<役割のない項目>"].reason)
        self.assertNotIn("PLANNED", paths["columns.<役割のない項目>"].reason)  # DB の列名は出さない（論理名だけ）
        self.assertNotIn("plannedEquipmentName", config.field_mappings)

    def test_error_format(self):
        self.write_local("view", {"defaultSort": {"field": "productNo", "order": "asc"}})
        text = self.errors_of()[0].format()
        self.assertEqual(text.splitlines()[0], "[設定エラー]")
        self.assertIn("対象: config/local/view.local.json", text)
        self.assertIn("項目: defaultSort.field", text)
        self.assertIn("理由: ", text)
        self.assertIn("対応: ", text)

    def test_public_view_has_no_table_name_or_path(self):
        text = json.dumps(self.config.public_view(), ensure_ascii=False)
        for secret in ["t_lot", "source.sqlite3"] + list(COLUMNS.values()):
            self.assertNotIn(secret, text)

    def test_mock_view_matches_sample(self):
        # 画面だけで試すモード（file://）の表示定義が、公開サンプルと同じであること
        path = os.path.join(APP_ROOT, "src", "js", "sample", "sample-view.js")
        with open(path, encoding="utf-8") as fp:
            text = fp.read()
        embedded = json.loads(text.split("/*VIEW_JSON_START*/", 1)[1].split("/*VIEW_JSON_END*/", 1)[0])
        columns = embedded.pop("columns")
        embedded.pop("columnsVersion")
        self.assertEqual(embedded, self.config.public_view())
        self.assertEqual([c["id"] for c in columns][:len(ROLE_FIELDS)], ROLE_FIELDS)  # 役割のある列が先頭


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

    def test_cache_not_matching_schema_is_not_used(self):
        # 作ったあとで schema の列名が変わったキャッシュは、誤った値を返さないよう使わない
        self.cache.refresh()
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS, customerName="RENAMED")})
        config = load_settings(self.root)
        cache = CacheService(config, SILENT)
        self.assertFalse(cache.verify_existing())
        self.assertFalse(cache.status()["available"])
        self.assertIn("合わない", cache.status()["message"])
        with self.assertRaises(AppError) as ctx:
            LotService(config, cache, SILENT).list({})
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

    def test_items_have_every_db_column(self):
        # 役割のある列は論理名、ほかの列は DB の列名。並びは役割のある列が先、残りは DB の順
        result = self.search("LOT-001")
        item = result["items"][0]
        self.assertEqual(list(item), ROLE_FIELDS + EXTRA_FIRST + EXTRA_LAST)
        self.assertEqual((item["customerName"], item["予定設備"], item["注文板厚"]), ("サンプル工業", "検査", "1.00"))
        self.assertEqual(self.service.detail({"lotNo": "LOT-001", "boxNo": "01"})["item"], item)

    def test_view_config_lists_columns_with_db_names(self):
        self.cache.refresh()
        context = AppContext(self.config, self.cache, self.service, SILENT)
        view = commands.dispatch("get_view_config", context, {})
        self.assertEqual([c["label"] for c in view["columns"]], [COLUMNS[n] for n in ROLE_FIELDS] + EXTRA_FIRST + EXTRA_LAST)
        self.assertEqual(view["columns"][0], {"id": "lotNo", "label": "C_LOTNO", "role": True})
        self.assertEqual(view["columnsVersion"], self.cache.status()["columnsVersion"])
        self.assertNotIn("t_lot", json.dumps(view, ensure_ascii=False))

    def test_sort_by_column_without_role(self):
        items = self.search("LOT", sortKey="注文板厚", sortOrder="desc")["items"]
        self.assertEqual([i["注文板厚"] for i in items], ["2.00", "1.00", "1.00", "1.00", "1.00"])
        with self.assertRaises(AppError):
            self.search("LOT", sortKey="NO_SUCH")

    def test_new_db_column_appears_after_refresh(self):
        before = self.cache.status()["columnsVersion"]
        conn = sqlite3.connect(self.source)
        conn.execute('ALTER TABLE "t_lot" ADD COLUMN "作業日" TEXT')
        conn.commit()
        conn.close()
        self.cache.refresh()
        self.assertIn("作業日", self.search("LOT-001")["items"][0])
        self.assertNotEqual(self.cache.status()["columnsVersion"], before)

    def test_catalog_names_do_not_collide(self):
        catalog = build_catalog(["lotNo", "X", "C_LOTNO"], {"lotNo": "C_LOTNO"})
        self.assertEqual([(c.id, c.physical, c.role) for c in catalog],
                         [("lotNo", "C_LOTNO", True), ("lotNo#2", "lotNo", False), ("X", "X", False)])

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
            {"searchType": "manufacturingMaterial", "keyword": "A"},
            {"searchType": "lotNo", "keyword": ""},
            {"searchType": "lotNo", "keyword": "A", "matchMode": "regex"},
            {"searchType": "lotNo", "keyword": "A", "sortKey": "C_LOTNO"},
            {"searchType": "lotNo", "keyword": "A", "pageSize": 501},
            {"searchType": "lotNo", "keyword": "A", "page": 0},
            {"searchType": "lotNo", "keyword": "x" * 101},
        ]
        for payload in bad:
            with self.subTest(payload=payload), self.assertRaises(AppError) as ctx:
                self.service.search(payload)
            self.assertEqual(ctx.exception.code, "INVALID_REQUEST")

    def test_detail_by_lot_and_box(self):
        result = self.service.detail({"lotNo": "LOT-DUP", "boxNo": "02"})
        self.assertEqual(result["item"]["inspectionNo"], "INS-006")
        with self.assertRaises(AppError) as ctx:
            self.service.detail({"lotNo": "LOT-DUP", "boxNo": "99"})
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


class FilterTest(BackendTestCase):
    """絞り込み。今日は 2026-10-03 に固定する。
    工場納期（factoryDeliveryDate）を日付として絞り込めるよう、local の schema に types、view に日付の絞り込みを足す。"""

    EXTRA = [
        ("LOT-SLASH", "01", "INS-101", "CST-101", "ORD-9", "A5052", "H14", "-", "サンプル工業", "2026/10/10", "検査", "QC-01", "仕掛中"),
        ("LOT-COMPACT", "01", "INS-102", "CST-102", "ORD-9", "A5052", "H14", "-", "サンプル工業", "20261020", "検査", "QC-01", "仕掛中"),
        ("LOT-BLANK", "01", "INS-103", "CST-103", "ORD-9", "A5052", "H14", "-", "", None, "検査", "QC-01", None),
    ]

    def setUp(self):
        super().setUp()
        make_db(self.source, rows=ROWS + self.EXTRA)
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS), "types": {"factoryDeliveryDate": "date"}})
        with open(os.path.join(SAMPLE_DIR, "view.sample.json"), encoding="utf-8") as fp:
            filters = json.load(fp)["filters"]
        self.write_local("view", {"filters": filters + [{"field": "factoryDeliveryDate", "type": "date"}]})
        self.config = load_settings(self.root)
        self.cache = CacheService(self.config, SILENT)
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
        lots, _ = self.lots({"cfStatus": {"type": "values", "values": ["仕掛中", None]}})
        self.assertEqual(sorted(lots), ["LOT-002", "LOT-BLANK", "LOT-COMPACT", "LOT-SLASH"])
        lots, _ = self.lots({"customerName": {"type": "values", "values": [None]}})
        self.assertEqual(lots, ["LOT-BLANK"])

    def test_relative_date_filter(self):
        overdue, _ = self.lots({"factoryDeliveryDate": {"type": "date", "mode": "relative", "fromDays": None, "toDays": -1}})
        self.assertEqual(overdue, ["LOT-001", "LOT-002"])
        within, _ = self.lots({"factoryDeliveryDate": {"type": "date", "mode": "relative", "fromDays": 0, "toDays": 7}})
        self.assertEqual(within, ["LOT_100%-A", "試作-α-001", "LOT-DUP", "LOT-DUP", "LOT-SLASH"])

    def test_absolute_date_filter_handles_formats(self):
        lots, _ = self.lots({"factoryDeliveryDate": {"type": "date", "mode": "absolute", "from": "2026-10-10", "to": "2026-10-20"}})
        self.assertEqual(lots, ["LOT-SLASH", "LOT-COMPACT"])

    def test_filters_combine_with_keyword(self):
        lots, _ = self.lots(
            {"cfStatus": {"type": "values", "values": ["仕掛中"]}},
            searchType="lotNo", keyword="LOT-", matchMode="partial",
        )
        self.assertEqual(lots, ["LOT-002", "LOT-SLASH", "LOT-COMPACT"])

    def test_filter_values_are_faceted(self):
        result = self.service.filter_values({
            "field": "cfStatus",
            "filters": {
                "cfStatus": {"type": "values", "values": ["保留"]},
                "customerName": {"type": "values", "values": ["サンプル工業"]},
            },
        })
        counts = {row["value"]: row["count"] for row in result["values"]}
        self.assertEqual(counts, {"仕掛中": 2, "検査済み": 1})

    def test_invalid_filters(self):
        bad = [
            {"lotNo": {"type": "values", "values": ["x"]}},
            {"cfStatus": {"type": "date", "mode": "relative", "fromDays": 0}},
            {"cfStatus": {"type": "values", "values": "仕掛中"}},
            {"factoryDeliveryDate": {"type": "date", "mode": "absolute", "from": "2026-13-01"}},
            {"factoryDeliveryDate": {"type": "date", "mode": "absolute", "from": "2026-10-10", "to": "2026-10-01"}},
            {"factoryDeliveryDate": {"type": "date", "mode": "relative", "fromDays": 99999}},
        ]
        for filters in bad:
            with self.subTest(filters=filters), self.assertRaises(AppError) as ctx:
                self.service.list({"filters": filters})
            self.assertEqual(ctx.exception.code, "INVALID_REQUEST")

    def test_empty_conditions_are_ignored(self):
        _, result = self.lots({
            "cfStatus": {"type": "values", "values": []},
            "factoryDeliveryDate": {"type": "date", "mode": "relative", "fromDays": None, "toDays": None},
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
        status, body = self.post("list_lots", {"filters": {"cfStatus": {"type": "values", "values": ["保留"]}}})
        self.assertEqual(body["totalCount"], 1)
        status, body = self.post("get_filter_values", {"field": "cfStatus"})
        self.assertEqual(len(body["values"]), 6)

    def test_error_shape_hides_internal_detail(self):
        status, body = self.post("search_lots", {"searchType": "C_LOTNO", "keyword": "x"})
        self.assertFalse(body["success"])
        self.assertEqual(set(body["error"]), {"code", "userMessage", "detailId"})
        self.assertNotIn("C_LOTNO", json.dumps(body, ensure_ascii=False))

    def test_unknown_command_and_foreign_origin(self):
        self.assertEqual(self.post("drop_table", {})[0], 404)
        self.assertEqual(self.post("search_lots", {}, {"Origin": "http://evil.example"})[0], 403)

    def test_static_files_are_served_with_js_mime(self):
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/js/app.js") as response:
            self.assertIn("javascript", response.headers["Content-Type"])


class SourceTest(BackendTestCase):
    """読み込み先の接続テストと変更（get/test/update_data_source）"""

    def setUp(self):
        super().setUp()
        self.context = AppContext(self.config, self.cache, self.service, SILENT)
        self.context.source_service = SourceService(self.context, self.root, None)

    def call(self, name, payload=None):
        return commands.dispatch(name, self.context, payload or {})

    def statuses(self, result):
        return {step["id"]: step["status"] for step in result["steps"]}

    def first_ng(self, path):
        result = self.call("test_data_source", {"sourcePath": path})
        self.assertFalse(result["ok"])
        return next(step for step in result["steps"] if step["status"] == "ng")

    def test_current_source_passes_all_steps(self):
        result = self.call("test_data_source")
        self.assertTrue(result["ok"], result)
        self.assertEqual(set(self.statuses(result).values()), {"ok"})
        self.assertEqual(result["rowCount"], len(ROWS))
        self.assertTrue(result["modifiedAt"])
        described = self.call("get_data_source")
        self.assertEqual(described["sourcePath"], self.config.source_path)
        self.assertEqual(described["localFile"], "config/local/config.local.json")

    def test_quotes_from_explorer_are_removed(self):
        result = self.call("test_data_source", {"sourcePath": f'  "{self.source}"  '})
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["normalizedPath"], self.source)

    def test_each_step_reports_its_own_failure(self):
        self.assertEqual(self.first_ng("")["id"], "format")
        self.assertEqual(self.first_ng("<SHARED_SQLITE_PATH>")["id"], "format")
        self.assertEqual(self.first_ng(os.path.join(self.root, "no-such-folder", "x.sqlite3"))["id"], "reach")
        self.assertEqual(self.first_ng(os.path.join(self.root, "shared", "missing.sqlite3"))["id"], "reach")
        self.assertEqual(self.first_ng(os.path.join(self.root, "shared"))["id"], "reach")
        text = os.path.join(self.root, "shared", "note.txt")
        with open(text, "w", encoding="utf-8") as fp:
            fp.write("not sqlite")
        self.assertEqual(self.first_ng(text)["id"], "sqlite")
        for variant in ("missing-table", "missing-column"):
            other = os.path.join(self.root, "shared", f"{variant}.sqlite3")
            make_db(other, variant)
            step = self.first_ng(other)
            self.assertEqual(step["id"], "table")
            self.assertTrue(step["action"])
        result = self.call("test_data_source", {"sourcePath": ""})
        self.assertEqual(self.statuses(result)["rows"], "skip")       # × の後は確かめない

    def test_relative_path_is_from_app_root(self):
        self.assertTrue(self.call("test_data_source", {"sourcePath": "./shared/source.sqlite3"})["ok"])

    def test_failed_check_does_not_save(self):
        def read():
            with open(os.path.join(self.local_dir, "config.local.json"), encoding="utf-8") as fp:
                return fp.read()
        before = read()
        result = self.call("update_data_source", {"sourcePath": os.path.join(self.root, "none.sqlite3")})
        self.assertFalse(result["saved"])
        self.assertEqual(read(), before)

    def test_update_saves_path_keeps_other_keys_and_rebuilds_cache(self):
        self.write_local("config", {"application": {"name": "残す名前"}, "dataSource": {"sourcePath": "./shared/source.sqlite3"}})
        self.cache.refresh()
        other = os.path.join(self.root, "shared2", "other.sqlite3")
        make_db(other, rows=ROWS[:2])
        result = self.call("update_data_source", {"sourcePath": f'"{other}"'})
        self.assertTrue(result["saved"] and result["refreshed"], result)
        with open(os.path.join(self.local_dir, "config.local.json"), encoding="utf-8") as fp:
            saved = json.load(fp)
        self.assertEqual(saved, {"application": {"name": "残す名前"}, "dataSource": {"sourcePath": other}})
        self.assertTrue(os.path.isfile(os.path.join(self.local_dir, "config.local.json.bak")))
        self.assertEqual(self.context.config.source_path, os.path.normpath(other))
        self.assertEqual(self.search("LOT")["totalCount"], 2)                # 新しい読み込み先のデータ
        self.assertEqual(self.call("get_data_source")["sourcePath"], os.path.normpath(other))

    def test_cache_from_previous_source_is_not_used(self):
        self.cache.refresh()
        other = os.path.join(self.root, "shared2", "other.sqlite3")
        make_db(other, rows=ROWS[:2])
        self.write_local("config", {"dataSource": {"sourcePath": other}})
        moved = load_settings(self.root)
        self.cache.use_config(moved)
        self.assertFalse(self.cache.cache_available())
        self.assertIn("前の読み込み先", self.cache.status()["message"])
        # 起動し直したときも同じ（状態ファイルの印で見分ける）
        restarted = CacheService(moved, SILENT)
        self.assertFalse(restarted.verify_existing())
        restarted.refresh()
        self.assertTrue(restarted.cache_available())
        self.assertTrue(restarted.verify_existing())


if __name__ == "__main__":
    unittest.main()
```

画面側の確認用スクリプト（変更なし・引き続き使用）は `tests/ui-check.js`。

