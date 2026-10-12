"""マージ後の設定（config / schema / view）を役割ごとに確かめる。

  config … アプリと実行環境。DB 接続に必要なパス（sourcePath / cachePath）はここで確かめる
  schema … テーブル名・固定列・番号で探す列・別名・種類。書き方（空・重複・数）をここで確かめる
  view   … 並べ替え・隠す列・表示の補助。書き方をここで確かめる
（列名が DB にあるかは、キャッシュのテーブルを読んでから column_model.py が確かめる。
  DB にない名前は止めずに画面の「データ」で知らせ、選び直せるようにする）

問題はすべて集めて返す（最初の 1 つで止めない）。1 件ごとに
「対象ファイル・JSON 上の項目・理由・対応」を持たせ、利用者が直せるようにする。
"""

import re
from dataclasses import dataclass

from ..fields import MATCH_MODES, SORT_ORDERS

PLACEHOLDER_PATTERN = re.compile(r"<[^<>]+>")
LOG_LEVELS = ("debug", "info", "warning", "error")
LOOPBACK_HOSTS = ("127.0.0.1", "localhost")
COLUMN_TYPES = ("text", "date", "number")
RECORD_KEY_MAX = 3  # 固定列の数の上限
BADGE_TONES = ("success", "info", "warning", "danger", "neutral")


@dataclass(frozen=True)
class Issue:
    level: str   # "error" / "warning"
    file: str    # 例：config/local/schema.local.json
    path: str    # 例：columns.cfStatus / searchFields[2]
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

    # 別名（論理名 → DB の列名）は任意。仮の値のままの別名は使わない（実行時に読み飛ばす）
    for logical, physical in schema["columns"].items():
        path = f"columns.{logical}"
        if _blank(logical):
            err(path, "論理名が空です。", "論理名を設定してください。")
        if physical is not None and not isinstance(physical, str):
            err(path, "DB の列名は文字列にしてください。", "\"DB の列名\" の形で設定してください（使わないならその行を消す）。")

    record_key = schema["recordKey"]
    if not record_key:
        err("recordKey", "固定列（レコードキー）がありません。",
            "DB の列名を 1〜3 個書いてください（例：[\"ロット番号\", \"BOX番号\"]）。画面左の「データ」→「固定列」でも選べます。")
    elif len(record_key) > RECORD_KEY_MAX:
        err("recordKey", f"固定列（レコードキー）が {len(record_key)} 個あります。", f"{RECORD_KEY_MAX} 個までにしてください。")
    for index, name in enumerate(record_key):
        if _blank(name):
            err(f"recordKey[{index}]", "列の名前が空か、文字列ではありません。", "DB の列名か別名を書いてください。")
    if len(set(map(str, record_key))) != len(record_key):
        err("recordKey", "同じ列が重複しています。", "重複を消してください。")

    search_column = schema["searchColumn"]
    if search_column is not None and _blank(search_column):
        err("searchColumn", "列の名前が空か、文字列ではありません。",
            "DB の列名か別名を書くか、null にしてください（null なら recordKey の 1 つ目で探します）。")

    # types のキーは DB の列名か別名（DB から読み取るため、ここでは有無を確かめない）
    for name, kind in schema["types"].items():
        path = f"types.{name}"
        if _blank(name):
            err(path, "列の名前が空です。", "DB の列名か別名を書いてください。")
        if kind not in COLUMN_TYPES:
            err(path, f"\"{kind}\" は型として使えません。", "date（日付）・number（数値）・text（文字列）のどれかにしてください。")
    return issues


# ── view ─────────────────────────────────────────────────

def validate_view(view, src, schema):
    issues = []

    def err(path, reason, action):
        issues.append(Issue("error", src.origin(path), path, reason, action))

    def warn(path, reason, action):
        issues.append(Issue("warning", src.origin(path), path, reason, action))

    for index, name in enumerate(view["hiddenColumns"]):
        if _blank(name):
            err(f"hiddenColumns[{index}]", "列の名前が空か、文字列ではありません。", "DB の列名か別名を書いてください。")

    # fields のキーは DB の列名か別名（DB から読み取るため、ここでは有無を確かめない）
    unused = []
    for name, options in view["fields"].items():
        path = f"fields.{name}"
        if not isinstance(options, dict):
            err(path, "オブジェクト { } ではありません。", "{ \"mono\": true } の形にしてください。")
            continue
        unused += [f"{path}.{key}" for key in ("label", "group") if key in options]
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

    # 以前の形の表示名・まとまりは使わない（表示名は DB の列名。まとめて 1 件の注意にする）
    if unused:
        shown = "、".join(unused[:4]) + (f" ほか {len(unused) - 4} 件" if len(unused) > 4 else "")
        warn("fields.<列>.label", f"表示名（label）とまとまり（group）は今は使いません（{shown}）。表示名は DB の列名をそのまま使います。",
             "消してかまいません。")

    sort = view["defaultSort"]
    if not isinstance(sort, dict):
        err("defaultSort", "{ \"field\": ..., \"order\": ... } の形ではありません。", "形を直してください。")
        return issues
    if sort.get("field") is not None and _blank(sort.get("field")):
        err("defaultSort.field", "列の名前が空か、文字列ではありません。", "DB の列名か別名を書いてください。")
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
