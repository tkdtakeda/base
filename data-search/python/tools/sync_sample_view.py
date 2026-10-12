"""画面だけで試すモード（index.html を直接開いたとき）用の表示定義を、公開サンプルから作り直す。

file:// で開いた画面は JSON ファイルを読めないため、config/sample/schema.sample.json と
view.sample.json の設定を、本物と同じ決まり（column_model.build_model）で表示定義にして
src/js/sample/sample-view.js に書き写す。
DB の列は、ダミーと共通の列の一覧 python/tools/sample_columns.json を使う（実データとは無関係）。
別名（schema.columns）の DB の列名は sample_columns.json の role から、日付の列は名前が Date で終わる列とする
（サンプルデータ・ダミーデータは、その列に日付を入れる）。
サンプルの view / schema を変えたら、このスクリプトを実行する（テストで一致を確かめている）。

使い方: python python/tools/sync_sample_view.py
"""

import json
import os
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
    catalog = tuple(DbColumn(c["name"], c.get("role", c["name"]).endswith("Date")) for c in sample_columns)
    return build_model(model_settings_of(schema, view), catalog).public()


def main():
    text = json.dumps(build_sample_view(), ensure_ascii=False, indent=2)
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as fp:
        fp.write(TEMPLATE.format(json=text))
    print(f"書き出しました: {OUTPUT}")


if __name__ == "__main__":
    main()
