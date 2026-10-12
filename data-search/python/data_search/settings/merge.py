"""再帰マージ：サンプル（初期値）にローカル（部分上書き）を重ねる。

決まり
  ・ローカル側にあるキーだけを上書きする。ローカル側にないキーはサンプル側の値のまま
  ・両方がオブジェクトのときは、キーごとに再帰的に重ねる
  ・配列は要素ごとに重ねず、ローカル側に配列があれば配列全体を置き換える
  ・サンプル側の値と型が違うときは使わず、型の誤りとして返す（null のサンプル値はどの型でも受け入れる）
  ・サンプル側にないキーは「未知のキー」として返す（読み捨てない）。
    ただし open_maps に挙げた場所（例：schema の columns）は、論理項目を足せるよう新しいキーを受け入れる
  ・サンプル側の値は変更しない（新しいオブジェクトを返す）
"""

import copy
from dataclasses import dataclass, field


@dataclass
class MergeResult:
    value: dict
    overridden: list = field(default_factory=list)   # 上書きしたキーの道筋
    added: list = field(default_factory=list)        # open_maps に新しく足したキーの道筋
    unknown: list = field(default_factory=list)      # サンプルにないため使わなかったキーの道筋
    type_errors: list = field(default_factory=list)  # (道筋, 期待する型, 実際の型)


def type_name(value):
    if isinstance(value, bool):
        return "true/false"
    if isinstance(value, int):
        return "整数"
    if isinstance(value, float):
        return "数値"
    if isinstance(value, str):
        return "文字列"
    if isinstance(value, dict):
        return "オブジェクト { }"
    if isinstance(value, list):
        return "配列 [ ]"
    return "null"


def _compatible(base_value, value):
    if base_value is None:
        return True
    if isinstance(base_value, float) and isinstance(value, int) and not isinstance(value, bool):
        return True
    return type_name(base_value) == type_name(value)


def deep_merge(base, override, open_maps=(), path=""):
    """base（サンプル）に override（ローカル）を重ねた結果を返す。"""
    result = MergeResult(value=copy.deepcopy(base))
    _merge_into(result, result.value, base, override, tuple(open_maps), path)
    return result


def _merge_into(result, target, base, override, open_maps, path):
    for key, value in override.items():
        child = f"{path}.{key}" if path else key
        if key not in base:
            if path in open_maps:
                target[key] = copy.deepcopy(value)
                result.added.append(child)
            else:
                result.unknown.append(child)
            continue
        base_value = base[key]
        if isinstance(base_value, dict) and isinstance(value, dict):
            _merge_into(result, target[key], base_value, value, open_maps, child)
        elif not _compatible(base_value, value):
            result.type_errors.append((child, type_name(base_value), type_name(value)))
        else:
            target[key] = copy.deepcopy(value)  # 配列もここで丸ごと置き換える
            result.overridden.append(child)
