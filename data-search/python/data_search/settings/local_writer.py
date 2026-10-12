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


def set_local_values(local_dir, kind, values):
    """{path: 値} をまとめて 1 回で書き込む（控えの .bak も 1 回だけ作る）。書き込んだファイルのパスを返す。"""
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
