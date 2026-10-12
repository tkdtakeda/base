"""表示名の下書き：schema の列名（DB の段階で利用者向けの名前になっている）を、view の表示名として書き写す。

画面には列名を渡さない決まりのため、実行時に schema を表示名へ使うことはせず、
この処理で view.local.json の fields.<項目>.label に書き出す（あとから手で直せる・何度でも使える）。

    すでに表示名がある項目 … 残す（手で直した表示名を消さない）。overwrite=True のときだけ置き換える
    列名が仮の値・空・論理名と同じ … 書かない（画面には listColumns の見出しか論理名が出る）
"""

from dataclasses import dataclass, field

from .validation import is_placeholder


@dataclass
class LabelPlan:
    fields: dict                                  # 書き出す view.fields（既存の設定も含む）
    added: list = field(default_factory=list)     # 新しく表示名を入れた項目
    replaced: list = field(default_factory=list)  # 表示名を置き換えた項目（overwrite のとき）
    kept: list = field(default_factory=list)      # すでに表示名があり、残した項目
    skipped: list = field(default_factory=list)   # 列名が使えず、書かなかった項目


def plan_labels(columns, existing_fields, overwrite=False):
    """columns：マージ後の schema.columns（論理名 → 列名）。existing_fields：今の view.local.json の fields。"""
    result = {name: dict(option) for name, option in (existing_fields or {}).items() if isinstance(option, dict)}
    plan = LabelPlan(fields=result)
    for name, physical in columns.items():
        label = physical.strip() if isinstance(physical, str) else ""
        if not label or is_placeholder(label) or label == name:
            plan.skipped.append(name)
            continue
        option = result.setdefault(name, {})
        current = option.get("label")
        if current and not overwrite:
            plan.kept.append(name)
            continue
        if current == label:
            plan.kept.append(name)
            continue
        (plan.replaced if current else plan.added).append(name)
        option["label"] = label
    # 項目の並びは schema の順（読みやすさのため）。schema にない項目は後ろに残す
    order = {name: index for index, name in enumerate(columns)}
    plan.fields = dict(sorted(result.items(), key=lambda item: order.get(item[0], len(order))))
    return plan
