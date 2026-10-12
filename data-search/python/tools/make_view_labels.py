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
