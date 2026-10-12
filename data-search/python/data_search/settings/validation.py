"""マージ後の設定（config / schema / view）を役割ごとに確かめる。

  config … アプリと実行環境。DB 接続に必要なパス（sourcePath / cachePath）はここで確かめる
  schema … テーブル名と物理列名。仮の値・空・重複をここで確かめる
  view   … 表示の定義。参照する論理項目が schema.columns にあるかをここで確かめる

問題はすべて集めて返す（最初の 1 つで止めない）。1 件ごとに
「対象ファイル・JSON 上の項目・理由・対応」を持たせ、利用者が直せるようにする。
"""

import re
from dataclasses import dataclass

from ..fields import MATCH_MODES, SORT_ORDERS

PLACEHOLDER_PATTERN = re.compile(r"<[^<>]+>")
LOG_LEVELS = ("debug", "info", "warning", "error")
LOOPBACK_HOSTS = ("127.0.0.1", "localhost")
FILTER_TYPES = ("values", "date")
COLUMN_TYPES = ("text", "date")
BADGE_TONES = ("success", "info", "warning", "danger", "neutral")


@dataclass(frozen=True)
class Issue:
    level: str   # "error" / "warning"
    file: str    # 例：config/local/schema.local.json
    path: str    # 例：columns.status / listColumns[2].field
    reason: str
    action: str

    def format(self):
        title = "[設定エラー]" if self.level == "error" else "[設定の注意]"
        return f"{title}\n対象: {self.file}\n項目: {self.path}\n理由: {self.reason}\n対応: {self.action}"


class SettingSource:
    """1 種類の設定（config / schema / view）の、サンプル・ローカルのファイル名と上書き状況。"""

    def __init__(self, kind, sample_label, local_label, local_loaded, merge_result):
        self.kind = kind
        self.sample_label = sample_label
        self.local_label = local_label
        self.local_loaded = local_loaded
        self.merge = merge_result

    def origin(self, path):
        """その値がどちらのファイルから来たか（上書きされていればローカル）。"""
        if self.local_loaded:
            touched = self.merge.overridden + self.merge.added
            top = path.split("[")[0]
            if any(top == key or top.startswith(key + ".") or key.startswith(top + ".") for key in touched):
                return self.local_label
        return self.sample_label


def is_placeholder(value):
    return isinstance(value, str) and bool(PLACEHOLDER_PATTERN.search(value))


def _blank(value):
    return not isinstance(value, str) or not value.strip()


# ── config ───────────────────────────────────────────────

def validate_config(config, src):
    issues = []

    def err(path, reason, action, file=None):
        issues.append(Issue("error", file or src.origin(path), path, reason, action))

    for key in ("id", "name", "version"):
        if _blank(config["application"][key]):
            err(f"application.{key}", "値が空です。", "アプリの識別子・名前・版を設定してください。")

    data_source = config["dataSource"]
    if _blank(data_source["id"]):
        err("dataSource.id", "値が空です。", "データソースの識別子を設定してください（schema の dataSourceId と同じ値）。")
    if data_source["enabled"] is not True:
        err("dataSource.enabled", "データソースが無効（false）のため、検索できません。",
            f"{src.local_label} の dataSource.enabled を true にするか、その行を消してください。")
    if data_source["readOnly"] is not True:
        err("dataSource.readOnly", "共有データは読み取り専用でなければなりません。", "true にしてください。")
    for key, what in (("sourcePath", "共有 SQLite のフルパス"), ("cachePath", "手元に置くキャッシュのパス")):
        value = data_source[key]
        if is_placeholder(value):
            err(f"dataSource.{key}", f"仮の値（{value}）のままです。",
                f"{src.local_label} の dataSource.{key} に{what}を設定してください（ファイルがなければ作成）。",
                file=src.local_label)
        elif _blank(value):
            err(f"dataSource.{key}", "値が空です。", f"{what}を設定してください。")

    if not config["cache"]["temporaryExtension"].startswith("."):
        err("cache.temporaryExtension", "拡張子は . で始めてください。", "例：\".tmp\"")

    search = config["search"]
    if search["defaultMatchMode"] not in MATCH_MODES:
        err("search.defaultMatchMode", f"\"{search['defaultMatchMode']}\" は使えません。", "partial か exact にしてください。")
    for key in ("pageSize", "maxPageSize"):
        if search[key] < 1:
            err(f"search.{key}", "正の整数ではありません。", "1 以上の整数にしてください。")
    if search["pageSize"] > search["maxPageSize"]:
        err("search.pageSize", f"pageSize（{search['pageSize']}）が maxPageSize（{search['maxPageSize']}）を超えています。",
            "pageSize を maxPageSize 以下にしてください。")

    if config["logging"]["level"].lower() not in LOG_LEVELS:
        err("logging.level", f"\"{config['logging']['level']}\" は使えません。", "debug / info / warning / error のいずれかにしてください。")

    server = config["devServer"]
    if server["host"] not in LOOPBACK_HOSTS:
        err("devServer.host", "ほかの PC から接続できる設定です。", "127.0.0.1 か localhost にしてください。")
    if not 1 <= server["port"] <= 65535:
        err("devServer.port", f"{server['port']} はポート番号として使えません。", "1〜65535 の整数にしてください。")

    for path in _placeholders(config):
        if path not in ("dataSource.sourcePath", "dataSource.cachePath"):
            err(path, "仮の値（<...>）のままです。", f"{src.local_label} に実際の値を設定してください。", file=src.local_label)
    return issues


# ── schema ───────────────────────────────────────────────

def validate_schema(schema, src, config):
    issues = []

    def err(path, reason, action, file=None):
        issues.append(Issue("error", file or src.origin(path), path, reason, action))

    if _blank(schema["dataSourceId"]):
        err("dataSourceId", "値が空です。", "config の dataSource.id と同じ値を設定してください。")
    elif schema["dataSourceId"] != config["dataSource"]["id"]:
        err("dataSourceId",
            f"\"{schema['dataSourceId']}\" が config の dataSource.id（\"{config['dataSource']['id']}\"）と一致しません。",
            "同じデータソースの設定どうしを組み合わせてください（どちらかの値をそろえる）。")

    table = schema["tableName"]
    if is_placeholder(table):
        err("tableName", f"仮の値（{table}）のままです。",
            f"{src.local_label} の tableName に実際のテーブル名を設定してください（ファイルがなければ作成）。", file=src.local_label)
    elif _blank(table):
        err("tableName", "値が空です。", "実際のテーブル名を設定してください。")

    columns = schema["columns"]
    if not isinstance(columns, dict) or not columns:
        err("columns", "論理項目と物理列名の対応がありません。", "{ \"論理名\": \"物理列名\" } の形で設定してください。")
        return issues
    for logical, physical in columns.items():
        path = f"columns.{logical}"
        if _blank(logical):
            err(path, "論理名が空です。", "論理名を設定してください。")
        if not isinstance(physical, str):
            err(path, "物理列名は文字列にしてください。", "\"物理列名\" の形で設定してください。")
        elif is_placeholder(physical):
            err(path, f"仮の値（{physical}）のままです。",
                f"{src.local_label} の columns.{logical} に実際の列名を設定してください。", file=src.local_label)
        elif not physical.strip():
            err(path, "物理列名が空です。", "実際の列名を設定してください。")

    record_key = schema["recordKey"]
    if not record_key:
        err("recordKey", "1 件を特定する論理項目がありません。", "例：[\"lotNo\", \"castingNo\"]")
    for index, name in enumerate(record_key):
        if name not in columns:
            err(f"recordKey[{index}]", f"\"{name}\" は schema.columns に定義されていません。",
                "columns に論理項目を足すか、recordKey を直してください。")
    if len(set(record_key)) != len(record_key):
        err("recordKey", "同じ論理項目が重複しています。", "重複を消してください。")

    for name, kind in schema["types"].items():
        path = f"types.{name}"
        if name not in columns:
            err(path, f"\"{name}\" は schema.columns に定義されていません。", "columns に論理項目を足すか、types から消してください。")
        if kind not in COLUMN_TYPES:
            err(path, f"\"{kind}\" は型として使えません。", "text か date にしてください。")
    return issues


# ── view ─────────────────────────────────────────────────

def validate_view(view, src, schema):
    issues = []
    columns = schema["columns"]
    types = schema["types"]

    def err(path, reason, action):
        issues.append(Issue("error", src.origin(path), path, reason, action))

    def check_field(path, name):
        if not isinstance(name, str) or name not in columns:
            err(path, f"\"{name}\" はマージ後の schema.columns に定義されていません。",
                "schema 側へ論理項目を追加するか、view 側の field を修正してください。")
            return False
        return True

    seen = set()
    for index, column in enumerate(view["listColumns"]):
        base = f"listColumns[{index}]"
        if not isinstance(column, dict):
            err(base, "{ \"field\": ..., \"label\": ..., \"visible\": ..., \"searchable\": ... } の形ではありません。", "形を直してください。")
            continue
        field = column.get("field")
        if check_field(f"{base}.field", field):
            if field in seen:
                err(f"{base}.field", f"\"{field}\" が listColumns の中で重複しています。", "どちらか一方を消してください。")
            seen.add(field)
        if _blank(column.get("label")):
            err(f"{base}.label", "表示名がありません。", "\"label\": \"表示名\" を設定してください。")
        for flag in ("visible", "searchable"):
            if not isinstance(column.get(flag), bool):
                err(f"{base}.{flag}", f"{flag} が真偽値ではありません。", "true か false にしてください。")
        width = column.get("width")
        if width is not None and (isinstance(width, bool) or not isinstance(width, int) or width < 1):
            err(f"{base}.width", "幅が正の整数ではありません。", "1 以上の整数（px）にするか、消してください。")
    if not any(isinstance(c, dict) and c.get("searchable") is True for c in view["listColumns"]):
        err("listColumns", "番号で探せる項目（searchable: true）が 1 つもありません。", "少なくとも 1 つを searchable: true にしてください。")

    seen = set()
    for index, name in enumerate(view["detailFields"]):
        path = f"detailFields[{index}]"
        if check_field(path, name):
            if name in seen:
                err(path, f"\"{name}\" が detailFields の中で重複しています。", "どちらか一方を消してください。")
            seen.add(name)

    group_ids = []
    for index, group in enumerate(view["detailGroups"]):
        path = f"detailGroups[{index}]"
        if not isinstance(group, dict) or _blank(group.get("id")) or _blank(group.get("label")):
            err(path, "id と label が必要です。", "{ \"id\": \"...\", \"label\": \"...\", \"icon\": \"fa-...\" } の形にしてください。")
            continue
        if group["id"] in group_ids:
            err(f"{path}.id", f"\"{group['id']}\" が重複しています。", "別の id にしてください。")
        group_ids.append(group["id"])

    for name, options in view["fields"].items():
        path = f"fields.{name}"
        check_field(path, name)
        if not isinstance(options, dict):
            err(path, "オブジェクト { } ではありません。", "{ \"group\": ..., \"mono\": ... } の形にしてください。")
            continue
        if "label" in options and _blank(options["label"]):
            err(f"{path}.label", "表示名が空です。", "表示名を設定するか、label の行を消してください。")
        if "group" in options and options["group"] not in group_ids:
            err(f"{path}.group", f"\"{options['group']}\" は detailGroups に定義されていません。", "detailGroups に足すか、group を直してください。")
        for flag in ("mono", "copy"):
            if flag in options and not isinstance(options[flag], bool):
                err(f"{path}.{flag}", f"{flag} が真偽値ではありません。", "true か false にしてください。")
        for index, rule in enumerate(options.get("badge", [])):
            rule_path = f"{path}.badge[{index}]"
            if not isinstance(rule, dict) or _blank(rule.get("match")):
                err(rule_path, "match（当てはめる文字のパターン）がありません。", "{ \"match\": \"完了|済\", \"tone\": \"success\" } の形にしてください。")
                continue
            try:
                re.compile(rule["match"])
            except re.error as exc:
                err(f"{rule_path}.match", f"パターンとして読めません（{exc}）。", "正規表現を直してください。")
            if rule.get("tone") not in BADGE_TONES:
                err(f"{rule_path}.tone", f"\"{rule.get('tone')}\" は使えません。", " / ".join(BADGE_TONES) + " のいずれかにしてください。")

    seen = set()
    for index, item in enumerate(view["filters"]):
        base = f"filters[{index}]"
        if not isinstance(item, dict):
            err(base, "{ \"field\": ..., \"type\": ... } の形ではありません。", "形を直してください。")
            continue
        field = item.get("field")
        if check_field(f"{base}.field", field):
            if field in seen:
                err(f"{base}.field", f"\"{field}\" が filters の中で重複しています。", "どちらか一方を消してください。")
            seen.add(field)
        kind = item.get("type")
        if kind not in FILTER_TYPES:
            err(f"{base}.type", f"\"{kind}\" は絞り込みの種類として使えません。", "values か date にしてください。")
        elif kind == "date" and types.get(field) != "date":
            err(f"{base}.type", f"\"{field}\" は schema.types で date になっていません。",
                f"schema の types に \"{field}\": \"date\" を足すか、type を values にしてください。")

    # 表示名がどこにもない項目は、論理名（英字）がそのまま画面に出てしまう
    listed = {c.get("field"): c.get("label") for c in view["listColumns"] if isinstance(c, dict)}
    used = list(view["detailFields"]) + [f.get("field") for f in view["filters"] if isinstance(f, dict)]
    for name in dict.fromkeys(used):
        if name in columns and _blank(view["fields"].get(name, {}).get("label")) and _blank(listed.get(name)):
            issues.append(Issue("warning", src.local_label, f"fields.{name}.label",
                                f"\"{name}\" の表示名がないため、画面に論理名がそのまま表示されます。",
                                f"view の fields.{name} に \"label\": \"表示名\" を設定してください。"))

    sort = view["defaultSort"]
    check_field("defaultSort.field", sort.get("field"))
    if sort.get("order") not in SORT_ORDERS:
        err("defaultSort.order", f"\"{sort.get('order')}\" は使えません。", "asc か desc にしてください。")
    return issues


def _placeholders(data, path=""):
    found = []
    if isinstance(data, dict):
        for key, value in data.items():
            found.extend(_placeholders(value, f"{path}.{key}" if path else key))
    elif is_placeholder(data):
        found.append(path)
    return found
