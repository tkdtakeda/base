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
from data_search.record_service import RecordService  # noqa: E402
from data_search import commands  # noqa: E402
from data_search.column_catalog import DbColumn  # noqa: E402
from data_search.column_model import build_model  # noqa: E402
from data_search.settings import model_settings_of  # noqa: E402

APP_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SAMPLE_DIR = os.path.join(APP_ROOT, "config", "sample")

with open(os.path.join(SAMPLE_DIR, "schema.sample.json"), encoding="utf-8") as _fp:
    ROLE_FIELDS = list(json.load(_fp)["columns"])
# 別名（論理名）の DB の列名：論理名と違う名前にする（1 列は日本語。引用符の処理の確認用）
COLUMNS = {name: ("取引先_名称" if name == "customerName" else "C_" + name.upper()) for name in ROLE_FIELDS}
P = COLUMNS  # 論理名 → DB の列名（画面・API で使う列の id は DB の列名）
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
    keep = [i for i, name in enumerate(TABLE_COLUMNS) if not (variant == "missing-key" and name == COLUMNS["boxNo"])]
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

    def reload(self):
        """ローカルの設定を書き換えたあと、設定と各部品を作り直す。"""
        self.config = load_settings(self.root)
        self.cache = CacheService(self.config, SILENT)
        self.service = LotService(self.config, self.cache, SILENT)
        return self.config

    def search(self, keyword, match_mode="partial", **extra):
        return self.service.search({"keyword": keyword, "matchMode": match_mode, **extra})

    @staticmethod
    def lots_of(result):
        return [item[P["lotNo"]] for item in result["items"]]


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
        self.assertIsNone(self.config.model.search_column)       # null なら 1 件を決める列の 1 つ目で探す
        self.assertEqual(self.config.model.default_sort, ("factoryDeliveryDate", "asc"))
        self.assertEqual(self.config.model.aliases["lotNo"], "C_LOTNO")
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
        self.write_local("view", {"hiddenColumns": ["UPDATED_AT"]})
        config = load_settings(self.root)
        self.assertEqual(config.model.hidden, ("UPDATED_AT",))
        self.assertEqual(config.model.default_sort, ("factoryDeliveryDate", "asc"))  # 書いていない項目はサンプルのまま

    def test_settings_can_use_db_column_names(self):
        # 1 件を決める列・探す列・種類・隠す列・表示の補助は、DB の列名のままでも書ける（別名は不要）
        self.write_local("schema", {"tableName": "t_lot", "recordKey": ["C_LOTNO", "C_BOXNO"], "searchColumn": "C_INSPECTIONNO",
                                    "types": {"注文板厚": "text"}})
        self.write_local("view", {"hiddenColumns": ["UPDATED_AT"], "fields": {"予定設備": {"mono": True}}})
        config = load_settings(self.root)
        self.assertEqual(config.model.record_key, ("C_LOTNO", "C_BOXNO"))
        self.assertEqual(config.model.search_column, "C_INSPECTIONNO")
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
        self.assertFalse(any(i.path.startswith("columns.") for i in issues))  # 別名は任意（仮の値は使わないだけ）
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
        self.assertEqual(config.model.types, {"factoryDeliveryDate": "date"})
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
        self.write_local("schema", {"tableName": " ", "recordKey": ["A", "A"], "searchColumn": ""})
        self.assert_error("config/local/schema.local.json", "tableName", "空")
        self.assert_error("config/local/schema.local.json", "recordKey", "重複")
        self.assert_error("config/local/schema.local.json", "searchColumn", "空")
        self.write_local("schema", {"tableName": "t_lot", "recordKey": []})
        self.assert_error("config/local/schema.local.json", "recordKey", "ありません")
        self.write_local("schema", {"tableName": "t_lot", "recordKey": ["A", "B", "C", "D"]})
        self.assert_error("config/local/schema.local.json", "recordKey", "4 個")

    def test_placeholder_aliases_are_not_used(self):
        # 別名の値が仮の値のままなら、その別名は使わない（誤りにもしない）
        self.write_local("schema", {"tableName": "t_lot", "columns": {"lotNo": "C_LOTNO"}})
        config = load_settings(self.root)
        self.assertEqual(config.model.aliases, {"lotNo": "C_LOTNO"})

    def test_data_source_id_must_match(self):
        self.write_local("schema", {"dataSourceId": "other", "tableName": "t_lot", "columns": dict(COLUMNS)})
        self.assert_error("config/local/schema.local.json", "dataSourceId", "一致しません")

    # ── 検証：view ──
    def test_view_rules(self):
        self.write_local("view", {"hiddenColumns": [""], "defaultSort": {"field": "x", "order": "up"}})
        self.assert_error("config/local/view.local.json", "hiddenColumns[0]", "空")
        self.assert_error("config/local/view.local.json", "defaultSort.order", "使えません")

    def test_old_style_settings_are_warned_not_errors(self):
        # 以前の形（全項目の columns・listColumns・detailFields・表示名・searchFields・filters）は止めずに「使っていない」と知らせる
        old_columns = dict(COLUMNS, plannedEquipmentName="PLANNED", orderThickness="THICK")
        self.write_local("schema", {"tableName": "t_lot", "columns": old_columns})
        self.write_local("view", {"listColumns": [{"field": "lotNo"}], "detailFields": ["lotNo"], "detailGroups": [],
                                  "searchFields": ["lotNo"], "filters": [{"field": "cfStatus", "type": "values"}],
                                  "fields": {"lotNo": {"label": "ロット"}, "cfStatus": {"label": "状態", "group": "x"}}})
        config = load_settings(self.root)
        paths = {w.path: w for w in config.warnings}
        self.assertEqual(set(paths), {"columns.<役割のない項目>", "listColumns", "detailFields", "detailGroups",
                                      "searchFields", "filters", "fields.<列>.label"})
        self.assertIn("2 項目", paths["columns.<役割のない項目>"].reason)
        self.assertNotIn("PLANNED", paths["columns.<役割のない項目>"].reason)  # DB の列名は出さない（論理名だけ）
        self.assertNotIn("plannedEquipmentName", config.model.aliases)

    def test_error_format(self):
        self.write_local("view", {"defaultSort": {"field": "productNo", "order": "up"}})
        text = self.errors_of()[0].format()
        self.assertEqual(text.splitlines()[0], "[設定エラー]")
        self.assertIn("対象: config/local/view.local.json", text)
        self.assertIn("項目: defaultSort.order", text)
        self.assertIn("理由: ", text)
        self.assertIn("対応: ", text)

    def test_view_config_has_no_table_name_or_path(self):
        self.cache.refresh()
        context = AppContext(self.config, self.cache, self.service, SILENT)
        text = json.dumps(commands.dispatch("get_view_config", context, {}), ensure_ascii=False)
        for secret in ["t_lot", "source.sqlite3", self.root]:
            self.assertNotIn(secret, text)

    def test_mock_view_matches_sample(self):
        # 画面だけで試すモード（file://）の表示定義が、公開サンプルから本物と同じ決まりで作ったものと同じであること
        sys.path.insert(0, os.path.join(APP_ROOT, "python", "tools"))
        from sync_sample_view import build_sample_view
        path = os.path.join(APP_ROOT, "src", "js", "sample", "sample-view.js")
        with open(path, encoding="utf-8") as fp:
            text = fp.read()
        embedded = json.loads(text.split("/*VIEW_JSON_START*/", 1)[1].split("/*VIEW_JSON_END*/", 1)[0])
        self.assertEqual(embedded, build_sample_view())
        self.assertTrue(embedded["ready"])
        self.assertEqual(embedded["recordKey"], [c["id"] for c in embedded["columns"]][:2])  # 1 件を決める列が先頭


class ColumnModelTest(unittest.TestCase):
    """設定と DB の列から、列の決まり（column_model）を作る。"""

    def settings(self, **extra):
        schema = {"columns": {"lotNo": "C_LOT", "due": "C_DUE"}, "recordKey": ["lotNo"], "searchColumn": None, "types": {}}
        view = {"defaultSort": {"field": "due", "order": "desc"}, "hiddenColumns": [], "fields": {}}
        for key, value in extra.items():
            (view if key in view else schema)[key] = value
        return model_settings_of(schema, view)

    def catalog(self, *names, dates=()):
        return tuple(DbColumn(name, name in dates) for name in names)

    def test_order_kinds_and_aliases(self):
        model = build_model(self.settings(), self.catalog("X", "C_DUE", "C_LOT", "Y", dates=("C_DUE", "Y")))
        self.assertEqual(model.ids, ("C_LOT", "C_DUE", "X", "Y"))           # 1 件を決める列 → 別名のある列 → DB の順
        self.assertEqual([c.kind for c in model.columns], ["text", "date", "text", "date"])
        self.assertEqual((model.record_key, model.search_column, model.default_sort), (("C_LOT",), "C_LOT", ("C_DUE", "desc")))
        self.assertTrue(model.ready)
        self.assertEqual(model.notices, ())

    def test_db_name_wins_over_alias(self):
        # DB に「lotNo」という列そのものがあれば、別名より DB の列を使う（画面から DB の列名で保存するため）
        model = build_model(self.settings(), self.catalog("lotNo", "C_LOT"))
        self.assertEqual(model.record_key, ("lotNo",))

    def test_missing_key_is_not_ready_and_noticed(self):
        model = build_model(self.settings(recordKey=["lotNo", "boxNo"], defaultSort={"field": "nothing", "order": "asc"}),
                            self.catalog("C_LOT", "X"))
        self.assertFalse(model.ready)
        self.assertEqual(model.search_column, "C_LOT")  # 1 つ目はあるので番号では探せる
        self.assertEqual(model.default_sort, ("C_LOT", "asc"))
        self.assertEqual({n.path for n in model.notices}, {"schema.recordKey", "view.defaultSort.field"})
        self.assertIn("boxNo", model.notices[0].reason)

    def test_without_data_there_are_no_notices(self):
        model = build_model(self.settings(), ())
        self.assertEqual((model.ids, model.notices, model.ready), ((), (), False))

    def test_identifier_columns_are_never_dates_unless_written(self):
        model = build_model(self.settings(), self.catalog("C_LOT", dates=("C_LOT",)))
        self.assertEqual(model.kind_of("C_LOT"), "text")
        model = build_model(self.settings(types={"lotNo": "date"}), self.catalog("C_LOT"))
        self.assertEqual(model.kind_of("C_LOT"), "date")

    def test_version_changes_with_key(self):
        catalog = self.catalog("C_LOT", "C_DUE")
        first = build_model(self.settings(), catalog)
        second = build_model(self.settings(recordKey=["due"]), catalog)
        self.assertNotEqual(first.version, second.version)


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

    def test_missing_key_column_keeps_data_and_asks_to_choose(self):
        # 1 件を決める列（BOX番号）がない似た DB：止めずに使い、画面で列を選び直してもらう
        make_db(self.source, "missing-key")
        self.cache.refresh()
        model = self.service.model
        self.assertFalse(model.ready)
        self.assertEqual([n.path for n in model.notices], ["schema.recordKey"])
        self.assertEqual(self.search("LOT-DUP")["totalCount"], 2)  # 番号では探せる（1 つ目の列はある）
        with self.assertRaises(AppError) as ctx:
            self.service.detail({P["lotNo"]: "LOT-001"})
        self.assertEqual(ctx.exception.code, "KEY_NOT_READY")

    def test_search_without_cache(self):
        with self.assertRaises(AppError) as ctx:
            self.search("LOT")
        self.assertEqual(ctx.exception.code, "CACHE_UNAVAILABLE")

    def test_cache_not_matching_table_is_not_used(self):
        # 作ったあとで schema のテーブル名が変わったキャッシュは、誤った値を返さないよう使わない
        self.cache.refresh()
        self.write_local("schema", {"tableName": "t_renamed", "columns": dict(COLUMNS)})
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

    def test_items_have_every_db_column_with_db_names(self):
        # 列の id は DB の列名。並びは 1 件を決める列 → 別名のある列（schema.columns の順）→ ほかの列（DB の順）
        result = self.search("LOT-001")
        item = result["items"][0]
        self.assertEqual(list(item), [COLUMNS[n] for n in ROLE_FIELDS] + EXTRA_FIRST + EXTRA_LAST)
        self.assertEqual((item[P["customerName"]], item["予定設備"], item["注文板厚"]), ("サンプル工業", "検査", "1.00"))
        self.assertEqual(self.service.detail({P["lotNo"]: "LOT-001", P["boxNo"]: "01"})["item"], item)

    def test_view_config_lists_columns_with_db_names(self):
        context = AppContext(self.config, self.cache, self.service, SILENT)
        view = commands.dispatch("get_view_config", context, {})
        self.assertEqual([c["label"] for c in view["columns"]], [COLUMNS[n] for n in ROLE_FIELDS] + EXTRA_FIRST + EXTRA_LAST)
        self.assertEqual(view["columns"][0], {"id": "C_LOTNO", "label": "C_LOTNO", "kind": "text", "role": True})
        self.assertEqual((view["recordKey"], view["searchColumn"]), (["C_LOTNO", "C_BOXNO"], "C_LOTNO"))
        self.assertEqual(view["defaultSort"], {"field": P["factoryDeliveryDate"], "order": "asc"})
        self.assertEqual(view["aliases"]["lotNo"], "C_LOTNO")
        status = commands.dispatch("get_cache_status", context, {})
        self.assertEqual(view["columnsVersion"], status["columnsVersion"])

    def test_sort_by_any_column(self):
        items = self.search("LOT", sortKey="注文板厚", sortOrder="desc")["items"]
        self.assertEqual([i["注文板厚"] for i in items], ["2.00", "1.00", "1.00", "1.00", "1.00"])
        with self.assertRaises(AppError):
            self.search("LOT", sortKey="NO_SUCH")
        with self.assertRaises(AppError):
            self.search("LOT", sortKey="lotNo")  # 別名は列の id ではない

    def test_new_db_column_appears_after_refresh(self):
        before = self.service.model.version
        conn = sqlite3.connect(self.source)
        conn.execute('ALTER TABLE "t_lot" ADD COLUMN "作業日" TEXT')
        conn.commit()
        conn.close()
        self.cache.refresh()
        self.assertIn("作業日", self.search("LOT-001")["items"][0])
        self.assertNotEqual(self.service.model.version, before)

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

    def test_search_column_setting(self):
        # 番号で探す列は 1 つ。schema.searchColumn（別名か DB の列名）で変えられる。searchType は使わない
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS), "searchColumn": "inspectionNo"})
        self.reload()
        self.cache.refresh()
        result = self.search("INS-003", "exact", searchType="lotNo")
        self.assertEqual(self.lots_of(result), ["LOT_100%-A"])

    def test_paging_and_sort(self):
        first = self.search("LOT", pageSize=2, page=1, sortKey=P["lotNo"], sortOrder="desc")
        self.assertEqual(first["totalCount"], 5)
        self.assertEqual(first["count"], 2)
        second = self.search("LOT", pageSize=2, page=3)
        self.assertEqual(second["count"], 1)

    def test_invalid_requests(self):
        bad = [
            {"keyword": ""},
            {"keyword": "A", "matchMode": "regex"},
            {"keyword": "A", "sortKey": "lotNo"},
            {"keyword": "A", "pageSize": 501},
            {"keyword": "A", "page": 0},
            {"keyword": "x" * 101},
        ]
        for payload in bad:
            with self.subTest(payload=payload), self.assertRaises(AppError) as ctx:
                self.service.search(payload)
            self.assertEqual(ctx.exception.code, "INVALID_REQUEST")

    def test_detail_by_lot_and_box(self):
        result = self.service.detail({P["lotNo"]: "LOT-DUP", P["boxNo"]: "02"})
        self.assertEqual(result["item"][P["inspectionNo"]], "INS-006")
        with self.assertRaises(AppError) as ctx:
            self.service.detail({P["lotNo"]: "LOT-DUP", P["boxNo"]: "99"})
        self.assertEqual(ctx.exception.code, "NOT_FOUND")


class RecordKeyTest(BackendTestCase):
    """1 件を決める列の確認・変更（check_record_key / update_record_settings）"""

    def setUp(self):
        super().setUp()
        self.cache.refresh()
        self.context = AppContext(self.config, self.cache, self.service, SILENT)
        self.context.record_service = RecordService(self.context, self.root, None)

    def call(self, name, payload=None):
        return commands.dispatch(name, self.context, payload or {})

    def test_check_counts_duplicates_and_blanks(self):
        lot_only = self.call("check_record_key", {"recordKey": [P["lotNo"]]})
        self.assertFalse(lot_only["unique"])
        self.assertEqual((lot_only["rowCount"], lot_only["duplicateGroups"], lot_only["duplicateRows"]), (len(ROWS), 1, 2))
        self.assertEqual(lot_only["example"], {"values": {P["lotNo"]: "LOT-DUP"}, "count": 2})
        both = self.call("check_record_key", {"recordKey": [P["lotNo"], P["boxNo"]]})
        self.assertTrue(both["unique"])
        self.assertIsNone(both["example"])
        blank = self.call("check_record_key", {"recordKey": ["UPDATED_AT"]})
        self.assertEqual(blank["blankRows"], len(ROWS))

    def test_update_saves_db_names_and_switches_model(self):
        result = self.call("update_record_settings", {"recordKey": [P["inspectionNo"]], "searchColumn": P["lotNo"]})
        self.assertTrue(result["saved"])
        with open(os.path.join(self.local_dir, "schema.local.json"), encoding="utf-8") as fp:
            saved = json.load(fp)
        self.assertEqual(saved, {"tableName": "t_lot", "columns": dict(COLUMNS),
                                 "recordKey": [P["inspectionNo"]], "searchColumn": P["lotNo"]})
        model = self.context.lot_service.model
        self.assertEqual((model.record_key, model.search_column, model.ids[0]), ((P["inspectionNo"],), P["lotNo"], P["inspectionNo"]))
        self.assertEqual(self.context.lot_service.detail({P["inspectionNo"]: "INS-006"})["item"][P["boxNo"]], "02")
        self.assertEqual(self.context.lot_service.search({"keyword": "LOT-001"})["totalCount"], 1)
        # 探す列が 1 つ目と同じなら null で保存する（あとで 1 つ目を変えたときに一緒に変わる）
        self.call("update_record_settings", {"recordKey": [P["lotNo"], P["boxNo"]], "searchColumn": P["lotNo"]})
        with open(os.path.join(self.local_dir, "schema.local.json"), encoding="utf-8") as fp:
            self.assertIsNone(json.load(fp)["searchColumn"])

    def test_update_fixes_missing_key_after_switching_db(self):
        make_db(self.source, "missing-key")
        self.cache.refresh()
        self.assertFalse(self.context.lot_service.model.ready)
        self.call("update_record_settings", {"recordKey": [P["inspectionNo"]]})
        self.assertTrue(self.context.lot_service.model.ready)

    def test_invalid_updates(self):
        bad = [
            {"recordKey": []},
            {"recordKey": ["NO_SUCH"]},
            {"recordKey": [P["lotNo"], P["lotNo"]]},
            {"recordKey": [P["lotNo"], P["boxNo"], P["orderNo"], P["castingNo"]]},
            {"recordKey": [P["lotNo"]], "searchColumn": "NO_SUCH"},
        ]
        for payload in bad:
            with self.subTest(payload=payload), self.assertRaises(AppError) as ctx:
                self.call("update_record_settings", payload)
            self.assertEqual(ctx.exception.code, "INVALID_REQUEST")
        self.assertFalse(os.path.isfile(os.path.join(self.local_dir, "schema.local.json.bak")))  # 書き込んでいない


class FilterTest(BackendTestCase):
    """絞り込み。今日は 2026-10-03 に固定する。
    工場納期（factoryDeliveryDate）は types に書かず、値から日付の列と判定させる（3 種類の書き方が混ざる）。"""

    EXTRA = [
        ("LOT-SLASH", "01", "INS-101", "CST-101", "ORD-9", "A5052", "H14", "-", "サンプル工業", "2026/10/10", "検査", "QC-01", "仕掛中"),
        ("LOT-COMPACT", "01", "INS-102", "CST-102", "ORD-9", "A5052", "H14", "-", "サンプル工業", "20261020", "検査", "QC-01", "仕掛中"),
        ("LOT-BLANK", "01", "INS-103", "CST-103", "ORD-9", "A5052", "H14", 5, "", None, "検査", "QC-01", None),
    ]

    def setUp(self):
        super().setUp()
        make_db(self.source, rows=ROWS + self.EXTRA)
        self.cache.refresh()
        from datetime import date
        self.service = LotService(self.config, self.cache, SILENT, today=lambda: date(2026, 10, 3))

    def lots(self, filters, **extra):
        result = self.service.list({"filters": filters, **extra})
        return self.lots_of(result), result

    def test_date_column_is_detected_from_values(self):
        model = self.service.model
        self.assertEqual(model.kind_of(P["factoryDeliveryDate"]), "date")
        self.assertEqual(model.kind_of("注文板厚"), "text")
        self.assertEqual(model.kind_of(P["lotNo"]), "text")

    def test_list_without_keyword_sorted_by_date_blank_last(self):
        lots, result = self.lots({})
        self.assertEqual(result["totalCount"], len(ROWS) + len(self.EXTRA))
        self.assertEqual(lots[0], "LOT-001")
        self.assertEqual(lots[-1], "LOT-BLANK")
        self.assertEqual(lots[-3:-1], ["LOT-SLASH", "LOT-COMPACT"])
        self.assertEqual(result["today"], "2026-10-03")

    def test_values_filter_with_blank(self):
        lots, _ = self.lots({P["cfStatus"]: {"type": "values", "values": ["仕掛中", None]}})
        self.assertEqual(sorted(lots), ["LOT-002", "LOT-BLANK", "LOT-COMPACT", "LOT-SLASH"])
        lots, _ = self.lots({P["customerName"]: {"type": "values", "values": [None]}})
        self.assertEqual(lots, ["LOT-BLANK"])

    def test_any_column_can_be_filtered(self):
        lots, _ = self.lots({"注文板厚": {"type": "values", "values": ["2.00"]}})
        self.assertEqual(lots, ["LOT-002"])
        lots, _ = self.lots({P["lotNo"]: {"type": "values", "values": ["LOT-DUP"]}, "予定設備": {"type": "values", "values": ["検査"]}})
        self.assertEqual(lots, ["LOT-DUP", "LOT-DUP"])
        # 数値で入っている値も、一覧に出した文字のまま選べる
        values = self.service.filter_values({"field": "注文板厚"})["values"]
        self.assertIn({"value": "5", "count": 1}, values)
        lots, _ = self.lots({"注文板厚": {"type": "values", "values": ["5"]}})
        self.assertEqual(lots, ["LOT-BLANK"])

    def test_relative_date_filter(self):
        due = P["factoryDeliveryDate"]
        overdue, _ = self.lots({due: {"type": "date", "mode": "relative", "fromDays": None, "toDays": -1}})
        self.assertEqual(overdue, ["LOT-001", "LOT-002"])
        within, _ = self.lots({due: {"type": "date", "mode": "relative", "fromDays": 0, "toDays": 7}})
        self.assertEqual(within, ["LOT_100%-A", "試作-α-001", "LOT-DUP", "LOT-DUP", "LOT-SLASH"])

    def test_absolute_date_filter_handles_formats(self):
        lots, _ = self.lots({P["factoryDeliveryDate"]: {"type": "date", "mode": "absolute", "from": "2026-10-10", "to": "2026-10-20"}})
        self.assertEqual(lots, ["LOT-SLASH", "LOT-COMPACT"])

    def test_text_type_overrides_detection(self):
        self.write_local("schema", {"tableName": "t_lot", "columns": dict(COLUMNS), "types": {"factoryDeliveryDate": "text"}})
        self.reload()
        self.assertEqual(self.service.model.kind_of(P["factoryDeliveryDate"]), "text")
        lots, _ = self.lots({P["factoryDeliveryDate"]: {"type": "values", "values": ["20261020"]}})
        self.assertEqual(lots, ["LOT-COMPACT"])

    def test_filters_combine_with_keyword(self):
        lots, _ = self.lots({P["cfStatus"]: {"type": "values", "values": ["仕掛中"]}}, keyword="LOT-", matchMode="partial")
        self.assertEqual(lots, ["LOT-002", "LOT-SLASH", "LOT-COMPACT"])

    def test_filter_values_are_faceted(self):
        result = self.service.filter_values({
            "field": P["cfStatus"],
            "filters": {
                P["cfStatus"]: {"type": "values", "values": ["保留"]},
                P["customerName"]: {"type": "values", "values": ["サンプル工業"]},
            },
        })
        counts = {row["value"]: row["count"] for row in result["values"]}
        self.assertEqual(counts, {"仕掛中": 2, "検査済み": 1})

    def test_filter_values_match(self):
        # 値が多い列では、上位に出ない値を文字で探せる（大文字小文字・全角半角を区別しない）
        result = self.service.filter_values({"field": P["inspectionNo"], "match": "ｉｎｓ－１０"})
        self.assertEqual([row["value"] for row in result["values"]], ["INS-101", "INS-102", "INS-103"])
        self.assertEqual(result["match"], "ins-10")
        with self.assertRaises(AppError):
            self.service.filter_values({"field": P["factoryDeliveryDate"]})  # 日付の列は範囲で絞り込む

    def test_invalid_filters(self):
        due = P["factoryDeliveryDate"]
        bad = [
            {"lotNo": {"type": "values", "values": ["x"]}},          # 別名は列の id ではない
            {"NO_SUCH": {"type": "values", "values": ["x"]}},
            {P["cfStatus"]: {"type": "date", "mode": "relative", "fromDays": 0}},
            {P["cfStatus"]: {"type": "values", "values": "仕掛中"}},
            {due: {"type": "date", "mode": "absolute", "from": "2026-13-01"}},
            {due: {"type": "date", "mode": "absolute", "from": "2026-10-10", "to": "2026-10-01"}},
            {due: {"type": "date", "mode": "relative", "fromDays": 99999}},
        ]
        for filters in bad:
            with self.subTest(filters=filters), self.assertRaises(AppError) as ctx:
                self.service.list({"filters": filters})
            self.assertEqual(ctx.exception.code, "INVALID_REQUEST")

    def test_empty_conditions_are_ignored(self):
        _, result = self.lots({
            P["cfStatus"]: {"type": "values", "values": []},
            P["factoryDeliveryDate"]: {"type": "date", "mode": "relative", "fromDays": None, "toDays": None},
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
        status, body = self.post("search_lots", {"keyword": "LOT-001"})
        self.assertEqual((status, body["totalCount"]), (200, 1))
        status, body = self.post("get_application_info", {})
        self.assertEqual(body["id"], "data-search")
        status, body = self.post("get_cache_status", {})
        self.assertTrue(body["available"])
        status, body = self.post("list_lots", {"filters": {P["cfStatus"]: {"type": "values", "values": ["保留"]}}})
        self.assertEqual(body["totalCount"], 1)
        status, body = self.post("get_filter_values", {"field": P["cfStatus"]})
        self.assertEqual(len(body["values"]), 6)

    def test_error_shape_hides_internal_detail(self):
        status, body = self.post("list_lots", {"filters": {"NO_SUCH_COLUMN": {"type": "values", "values": ["x"]}}})
        self.assertFalse(body["success"])
        self.assertEqual(set(body["error"]), {"code", "userMessage", "detailId"})
        self.assertNotIn("NO_SUCH_COLUMN", json.dumps(body, ensure_ascii=False))
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
        other = os.path.join(self.root, "shared", "missing-table.sqlite3")
        make_db(other, "missing-table")
        step = self.first_ng(other)
        self.assertEqual(step["id"], "table")
        self.assertTrue(step["action"])
        result = self.call("test_data_source", {"sourcePath": ""})
        self.assertEqual(self.statuses(result)["rows"], "skip")       # × の後は確かめない

    def test_missing_key_column_is_warned_but_can_be_saved(self):
        # 1 件を決める列がない似た DB は △：保存してから画面で列を選び直せる
        other = os.path.join(self.root, "shared", "missing-key.sqlite3")
        make_db(other, "missing-key")
        result = self.call("test_data_source", {"sourcePath": other})
        self.assertTrue(result["ok"])
        self.assertEqual(self.statuses(result)["table"], "warn")
        table = next(step for step in result["steps"] if step["id"] == "table")
        self.assertIn("boxNo", table["message"])
        self.assertTrue(table["action"])
        self.assertTrue(self.call("update_data_source", {"sourcePath": other})["saved"])
        self.assertFalse(self.context.lot_service.model.ready)

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
        self.assertEqual(self.context.lot_service.search({"keyword": "LOT"})["totalCount"], 2)  # 新しい読み込み先のデータ
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
