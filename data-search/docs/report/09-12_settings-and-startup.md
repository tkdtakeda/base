## 9. 設定読込み処理の修正版コード全文

`python/data_search/settings/loader.py`

```python
"""設定の読み込み：config / schema / view を、それぞれ「サンプル → ローカルで部分上書き」で組み立てる。

    config/sample/config.sample.json  ＋ config/local/config.local.json （あれば）
    config/sample/schema.sample.json  ＋ config/local/schema.local.json （あれば）
    config/sample/view.sample.json    ＋ config/local/view.local.json   （あれば）

ローカルのファイルがないことは誤りにしない（サンプルの値で検証まで進む）。
検証で誤りが見つかれば SettingsError（すべての誤りを持つ）。注意（未知のキーなど）は warnings に入れて続ける。

列の考え方：表示する列は DB のテーブルから自動で読み取る（column_catalog.py）。設定に書くのは
固定列（recordKey）・番号で探す列（searchColumn）などの役割だけ。名前は DB の列名か、
schema.columns に書いた別名（論理名）で書く。DB と照らし合わせるのは実行時（column_model.py）で、
DB にない名前があっても起動は止めない（画面の「データ」で選び直せる）。
パスとテーブル名は画面に渡さない。列名は表示名として画面に出す（DB の列名をそのまま表示するため）。
相対パスはアプリのルート（data-search/）を基準に解決する。
"""

import json
import os
from dataclasses import dataclass

from ..errors import AppError
from .defaults import BUILTIN_DEFAULTS
from .merge import deep_merge, fill_defaults, type_name
from .validation import Issue, SettingSource, is_placeholder, validate_config, validate_schema, validate_view

KINDS = ("config", "schema", "view")
# 新しいキー（論理項目）を足してよい場所。ここ以外のサンプルにないキーは「未知のキー」
OPEN_MAPS = {
    "config": (),
    "schema": ("types",),
    "view": ("fields",),
}
# 以前の形の設定にあった、今は使わないキー（未知のキーとは別の文面で知らせる）
OBSOLETE_KEYS = {
    "view": {
        "listColumns": "一覧の列は DB から自動で表示します。隠す列は hiddenColumns に書いてください。",
        "detailFields": "詳細には全項目を出すため使いません。",
        "detailGroups": "詳細には全項目を出すため使いません。",
        "searchFields": "番号で探す列は 1 つにしました。schema.searchColumn に書くか、画面左の「データ」→「固定列」で選んでください。",
        "filters": "どの列でも、一覧の見出しの漏斗（じょうご）のアイコンから絞り込めるため使いません。",
    },
}


class SettingsError(AppError):
    """設定の誤り。issues に「対象ファイル・項目・理由・対応」を持つ。"""

    def __init__(self, issues):
        self.issues = issues
        super().__init__("CONFIG_INVALID", "\n\n".join(issue.format() for issue in issues))


@dataclass(frozen=True)
class ModelSettings:
    """列の役割の設定。名前は DB の列名か別名（schema.columns の論理名）。
    DB と照らし合わせて実際の列を決めるのは column_model.build_model（キャッシュのテーブルを読んだあと）。"""
    aliases: dict          # 別名 → DB の列名（schema.columns。仮の値・空は除く）
    record_key: tuple      # 固定列（schema.recordKey）
    search_column: object  # 番号で探す列（schema.searchColumn。null なら recordKey の 1 つ目）
    types: dict            # 列 → "date" / "text"（schema.types）
    default_sort: tuple    # (列, "asc" / "desc")（view.defaultSort）
    hidden: tuple          # 最初は隠しておく列（view.hiddenColumns）
    fields: dict           # 列ごとの表示の補助（view.fields）


def model_settings_of(schema, view):
    """マージ後の schema / view から ModelSettings を作る（起動時と、画面だけで試すモードの生成で共通）。"""
    aliases = {name: physical for name, physical in schema["columns"].items()
               if isinstance(physical, str) and physical.strip() and not is_placeholder(physical)}
    sort = view["defaultSort"] or {}
    return ModelSettings(
        aliases=aliases,
        record_key=tuple(schema["recordKey"]),
        search_column=schema["searchColumn"] or None,
        types=dict(schema["types"]),
        default_sort=(sort.get("field") or None, sort.get("order") or "asc"),
        hidden=tuple(view["hiddenColumns"]),
        fields=dict(view["fields"]),
    )


@dataclass(frozen=True)
class AppConfig:
    app_id: str
    app_name: str
    app_version: str
    source_path: str
    cache_path: str
    table_name: str
    temporary_extension: str
    keep_previous_on_failure: bool
    default_match_mode: str
    page_size: int
    max_page_size: int
    log_directory: str
    log_level: str
    server_host: str
    server_port: int
    open_browser: bool
    base_dir: str
    model: ModelSettings
    sources: tuple         # (種類, サンプルのファイル, ローカルのファイル or None, 上書きした項目数)
    warnings: tuple        # Issue（level="warning"）


# ── ファイル ─────────────────────────────────────────────

def _label(app_root, path):
    return os.path.relpath(path, app_root).replace("\\", "/")


def _read_json(path, label, issues):
    """JSON を読む。読めない・重複したキーがある・オブジェクトでない場合は issues に足して None を返す。"""
    duplicates = []

    def pairs_hook(pairs):
        keys = [key for key, _ in pairs]
        duplicates.extend(sorted({key for key in keys if keys.count(key) > 1}))
        return dict(pairs)

    try:
        with open(path, encoding="utf-8-sig") as fp:
            data = json.load(fp, object_pairs_hook=pairs_hook)
    except ValueError as exc:
        issues.append(Issue("error", label, f"{getattr(exc, 'lineno', '?')} 行目", f"JSON として読めません（{exc.msg if hasattr(exc, 'msg') else exc}）。",
                            "カンマ・引用符・括弧の対応を確認してください。"))
        return None
    except OSError as exc:
        issues.append(Issue("error", label, "(ファイル)", f"ファイルを開けません（{exc.strerror}）。", "ファイルの場所と権限を確認してください。"))
        return None
    for key in duplicates:
        issues.append(Issue("error", label, key, f"同じキー \"{key}\" が重複しています。", "どちらか一方を消してください（後に書いた方だけが使われてしまいます）。"))
    if not isinstance(data, dict):
        issues.append(Issue("error", label, "(全体)", "全体が { } で囲まれたオブジェクトではありません。", "{ \"キー\": 値 } の形にしてください。"))
        return None
    return data


def _load_pair(kind, sample_dir, local_dir, app_root, issues, warnings):
    """1 種類（config / schema / view）を読み込み、マージした結果と SettingSource を返す。"""
    sample_path = os.path.join(sample_dir, f"{kind}.sample.json")
    local_path = os.path.join(local_dir, f"{kind}.local.json")
    sample_label = _label(app_root, sample_path)
    local_label = _label(app_root, local_path)

    if not os.path.isfile(sample_path):
        issues.append(Issue("error", sample_label, "(ファイル)", "公開サンプルの設定ファイルがありません。",
                            "アプリのファイル一式（config/sample）がそろっているか確認してください。"))
        return None, None
    sample = _read_json(sample_path, sample_label, issues)
    if sample is None:
        return None, None
    # サンプルから省かれている任意の項目（cache・devServer など）は内部の既定値で補う
    sample = fill_defaults(sample, BUILTIN_DEFAULTS[kind])

    local_loaded = os.path.isfile(local_path)  # ないことは誤りにしない
    override = _read_json(local_path, local_label, issues) if local_loaded else {}
    if override is None:
        return None, None

    merged = deep_merge(sample, override, OPEN_MAPS[kind])
    for path, expected, actual in merged.type_errors:
        issues.append(Issue("error", local_label, path, f"{expected} であるべきところが {actual} になっています。",
                            f"{sample_label} と同じ型（{expected}）にしてください。"))
    obsolete = OBSOLETE_KEYS.get(kind, {})
    extra_columns = [path for path in merged.unknown if path.startswith("columns.")]
    if kind == "schema" and extra_columns:
        # 以前は全項目を columns に書いていた。今は役割のある列だけ（ほかは DB から自動で表示）
        names = [path.split(".", 1)[1] for path in extra_columns]
        shown = "、".join(names[:8]) + (f" ほか {len(names) - 8} 項目" if len(names) > 8 else "")
        warnings.append(Issue("warning", local_label, "columns.<役割のない項目>",
                              f"{len(names)} 項目は役割がないため使っていません（{shown}）。列は DB から自動で表示します。",
                              f"消してかまいません。columns には {sample_label} にある論理名だけを書いてください"
                              "（固定列などは、DB の列名のまま recordKey・searchColumn に書けます）。"))
    for path in merged.unknown:
        if path in extra_columns:
            continue
        if path in obsolete:
            warnings.append(Issue("warning", local_label, path, f"今は使わない項目です。{obsolete[path]}", "消してかまいません。"))
            continue
        warnings.append(Issue("warning", local_label, path, f"{sample_label} に定義されていないキーのため、使っていません。",
                              "書き間違いがないか確認してください（例：tableName を table と書いていないか）。不要なら消してください。"))
    source = SettingSource(kind, sample_label, local_label, local_loaded, merged)
    return merged.value, source


def _resolve(base_dir, path):
    if not path or os.path.isabs(path) or path.startswith("\\\\"):
        return path
    return os.path.normpath(os.path.join(base_dir, path))


# ── 読み込み ─────────────────────────────────────────────

def load_settings(app_root, local_dir=None):
    """config / schema / view を読み込み、マージ・検証して AppConfig を返す。

    local_dir を省略すると app_root/config/local。ダミー用には config/dummy などを渡せる。
    """
    app_root = os.path.abspath(app_root)
    sample_dir = os.path.join(app_root, "config", "sample")
    local_dir = os.path.abspath(local_dir or os.path.join(app_root, "config", "local"))
    issues, warnings = [], []

    loaded = {kind: _load_pair(kind, sample_dir, local_dir, app_root, issues, warnings) for kind in KINDS}
    if issues:
        raise SettingsError(issues + warnings)  # 止めるときも注意（未知のキーなど）を一緒に出す
    (config, config_src), (schema, schema_src), (view, view_src) = (loaded[k] for k in KINDS)

    issues += validate_config(config, config_src)
    issues += validate_schema(schema, schema_src, config)
    view_issues = validate_view(view, view_src, schema)
    issues += [i for i in view_issues if i.level == "error"]
    warnings += [i for i in view_issues if i.level == "warning"]
    if issues:
        raise SettingsError(issues + warnings)

    sources = tuple(
        (src.kind, src.sample_label, src.local_label if src.local_loaded else None, len(src.merge.overridden) + len(src.merge.added))
        for src in (config_src, schema_src, view_src)
    )
    return AppConfig(
        app_id=config["application"]["id"],
        app_name=config["application"]["name"],
        app_version=config["application"]["version"],
        source_path=_resolve(app_root, config["dataSource"]["sourcePath"]),
        cache_path=_resolve(app_root, config["dataSource"]["cachePath"]),
        table_name=schema["tableName"],
        temporary_extension=config["cache"]["temporaryExtension"],
        keep_previous_on_failure=config["cache"]["keepPreviousOnFailure"],
        default_match_mode=config["search"]["defaultMatchMode"],
        page_size=config["search"]["pageSize"],
        max_page_size=config["search"]["maxPageSize"],
        log_directory=_resolve(app_root, config["logging"]["directory"]),
        log_level=config["logging"]["level"].lower(),
        server_host=config["devServer"]["host"],
        server_port=config["devServer"]["port"],
        open_browser=config["devServer"]["openBrowser"],
        base_dir=app_root,
        model=model_settings_of(schema, view),
        sources=sources,
        warnings=tuple(warnings),
    )


__all__ = ["AppConfig", "ModelSettings", "SettingsError", "load_settings", "model_settings_of", "type_name"]
```

`python/data_search/settings/__init__.py`

```python
"""設定（config / schema / view）の読み込み・マージ・検証。

    merge.py      … 再帰マージ（サンプルにローカルを重ねる）
    validation.py … マージ後の検証（役割ごと）
    loader.py     … 読み込みの順序と、実行時に使う設定の組み立て
    defaults.py   … sample に書かない運用項目の既定値
"""

from .loader import AppConfig, ModelSettings, SettingsError, load_settings, model_settings_of
from .merge import deep_merge
from .validation import Issue

__all__ = ["AppConfig", "Issue", "ModelSettings", "SettingsError", "deep_merge", "load_settings", "model_settings_of"]
```

## 10. 再帰マージ処理のコード全文

`python/data_search/settings/merge.py`

```python
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


def fill_defaults(sample, defaults):
    """サンプルにないキーだけを内部の既定値で補う（サンプルの値が常に優先）。新しいオブジェクトを返す。"""
    result = copy.deepcopy(sample)
    for key, value in defaults.items():
        if key not in result:
            result[key] = copy.deepcopy(value)
        elif isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = fill_defaults(result[key], value)
    return result


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
```

`python/data_search/settings/defaults.py`

```python
"""サンプルに書かれていないときだけ使う、内部の既定値。

config/sample の 3 ファイルが正式な設定スキーマ兼初期値である。
ここには「サンプルから省いてよい（環境や社内情報に関係しない）」項目の既定値だけを置く。
サンプルに同じキーがあれば、必ずサンプルの値が優先される。

ここに既定値があるキーは、ローカルのファイルで上書きしてもよい（未知のキーとして扱わない）。
"""

BUILTIN_DEFAULTS = {
    "config": {
        # キャッシュの作り方（一時ファイルの拡張子・失敗時は前回のキャッシュを使い続ける）
        "cache": {"temporaryExtension": ".tmp", "keepPreviousOnFailure": True},
        # Python 版の画面サーバー（手元の PC だけで待ち受ける）。デスクトップ版では使わない
        "devServer": {"host": "127.0.0.1", "port": 8765, "openBrowser": True},
    },
    "schema": {
        # 列の種類（例：{"工場納期": "date"}）。キーは DB の列名か別名。書かなければ値から判定する
        "types": {},
        # 別名（論理名 → DB の列名）。なくてよい（設定の名前は DB の列名で書ける）
        "columns": {},
        # 番号で探す列。null なら recordKey の 1 つ目
        "searchColumn": None,
    },
    "view": {
        # 列ごとの表示の補助（等幅・コピー・入力例・値の札）。表示名は DB の列名を使うため書かない
        "fields": {},
        # 最初は隠しておく列（DB の列名か別名）。各自が画面の「表示列」で変えられる
        "hiddenColumns": [],
    },
}
```

## 11. 設定検証処理のコード全文

`python/data_search/settings/validation.py`

```python
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
```

接続後のテーブル・列の存在確認（7.2 の後半）は次のファイル。

`python/data_search/cache_validator.py`

```python
"""コピーした一時ファイルが、検索に使えるかを確かめる。"""

import os
import sqlite3

from .errors import AppError
from . import sql_functions
from .query import quote_identifier


def validate_cache_file(path, table_name):
    """SQLite として開けること・表があることを確かめ、行数を返す。

    列は確かめない（固定列などが DB になくても、データは使えるようにして画面で選び直してもらう）。
    検索では、このファイルから読み取った列（column_catalog）だけを使うため、ない列を参照することはない。
    """
    try:
        conn = open_readonly(path)
    except sqlite3.Error as exc:
        raise AppError("CACHE_INVALID", f"cannot open: {exc}") from exc
    try:
        try:
            result = conn.execute("PRAGMA quick_check").fetchone()
        except sqlite3.DatabaseError as exc:
            raise AppError("CACHE_INVALID", f"not a database: {exc}") from exc
        if not result or result[0] != "ok":
            raise AppError("CACHE_INVALID", f"quick_check: {result}")

        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
            (table_name,),
        ).fetchone()
        if not exists:
            raise AppError("CACHE_TABLE_MISSING", "required table not found")
        return conn.execute(f"SELECT COUNT(*) FROM {quote_identifier(table_name)}").fetchone()[0]
    finally:
        conn.close()


def open_readonly(path):
    """ローカルの SQLite を読み取り専用で開く。数値・文字の条件の関数（sql_functions）を足しておく。"""
    # SQLite の URI では ? と # を区切りとして扱うため、パス中の文字をエスケープする
    uri_path = os.path.abspath(path).replace("\\", "/").replace("%", "%25").replace("?", "%3F").replace("#", "%23")
    if not uri_path.startswith("/"):
        uri_path = "/" + uri_path  # Windows のドライブ文字（C:/...）
    return sql_functions.register(sqlite3.connect(f"file://{uri_path}?mode=ro", uri=True))
```

## 12. 起動処理の修正版コード全文

`python/run_server.py`

```python
"""Python 版の起動口。画面を Edge などのブラウザで開き、実データ（SQLite）を検索できるようにする。

使い方:
    python python/run_server.py                              … config/local の上書きを使う
    python python/run_server.py --local-dir config/dummy     … config/local の代わりにダミー用の上書きを使う

設定の読み込み（config / schema / view それぞれ）:
    config/sample/*.sample.json を初期値にし、config/local/*.local.json があれば必要な項目だけ上書きする。
    ローカルのファイルがないことは誤りにしない。検証で誤りがあれば、対象・項目・理由・対応をすべて表示して止まる。
"""

import argparse
import os
import sys
import threading
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_search.cache_service import CacheService  # noqa: E402
from data_search.errors import AppError  # noqa: E402
from data_search.http_server import AppContext, create_server  # noqa: E402
from data_search.logging_setup import setup_logging  # noqa: E402
from data_search.lot_service import LotService  # noqa: E402
from data_search.record_service import RecordService  # noqa: E402
from data_search.type_service import ColumnTypeService  # noqa: E402
from data_search.settings import SettingsError, load_settings  # noqa: E402
from data_search.source_service import SourceService  # noqa: E402

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT_TRIES = 10


def parse_args():
    parser = argparse.ArgumentParser(description="対象データ検索（Python 版）")
    parser.add_argument("--local-dir", help="config/local の代わりに使う上書きフォルダ（例：config/dummy）")
    parser.add_argument("--port", type=int, help="待ち受けるポート（設定より優先）")
    parser.add_argument("--no-browser", action="store_true", help="ブラウザを自動で開かない")
    return parser.parse_args()


def print_sources(config):
    print("設定の読み込み:")
    for kind, sample, local, count in config.sources:
        override = f"{local}（{count} 項目を上書き）" if local else "なし（サンプルの値を使用）"
        print(f"  {kind:<6} {sample}  ＋ 上書き: {override}")


def print_issues(issues):
    for issue in issues:
        print()
        print(issue.format())


def print_source_check(result):
    """接続テストの結果を段階ごとに出す（パスは出さない）。"""
    print("  読み込み先の接続テスト:")
    marks = {"ok": "○", "warn": "△", "ng": "×", "skip": "－"}
    for step in result["steps"]:
        print(f"    {marks[step['status']]} {step['label']}：{step['message']}")
        if step["action"]:
            print(f"        対応：{step['action']}")
    print("    （画面左の「データ」→「読み込み先」から、パスを確かめて直せます）")


def print_column_notices(model):
    """DB と設定の食い違い（固定列がないなど）。止めずに知らせ、画面で選び直してもらう。"""
    for notice in model.notices:
        print()
        print(f"[列の注意] {notice.path}：{notice.reason}")
        print(f"  対応：{notice.action}")


def bind(context, host, port):
    for candidate in range(port, port + PORT_TRIES):
        try:
            return create_server(context, os.path.join(APP_ROOT, "src"), host, candidate)
        except OSError:
            continue
    raise OSError(f"ポート {port}〜{port + PORT_TRIES - 1} がすべて使用中です")


def main():
    args = parse_args()
    local_dir = os.path.abspath(args.local_dir) if args.local_dir else None
    try:
        config = load_settings(APP_ROOT, local_dir)
    except SettingsError as error:
        errors = [issue for issue in error.issues if issue.level == "error"]
        print(f"[起動できません] 設定に誤りが {len(errors)} 件あります。")
        print_issues(error.issues)
        return 1

    print_sources(config)
    print_issues(config.warnings)

    logger = setup_logging(config.log_directory, config.log_level)
    # ログには設定の値（パス・表名・列名）を残さない。上書きの有無と件数、注意の項目名だけ
    logger.info(
        "application start id=%s version=%s overrides=%s warnings=%s",
        config.app_id, config.app_version,
        ",".join(f"{kind}:{count if local else '-'}" for kind, _, local, count in config.sources),
        ",".join(f"{w.file}#{w.path}" for w in config.warnings) or "-",
    )
    cache_service = CacheService(config, logger)
    context = AppContext(config, cache_service, LotService(config, cache_service, logger), logger)
    context.source_service = SourceService(context, APP_ROOT, local_dir)
    context.record_service = RecordService(context, APP_ROOT, local_dir)
    context.type_service = ColumnTypeService(context, APP_ROOT, local_dir)

    has_cache = os.path.isfile(config.cache_path)
    if has_cache and not cache_service.verify_existing():
        print("手元のキャッシュが今の設定（読み込み先・テーブル名）と合わないため、作り直します…")
    if not cache_service.cache_available():
        if not has_cache:
            print("初回のため、共有データからキャッシュを作成しています…")
        try:
            result = cache_service.refresh()
            print(f"  完了：{result['rowCount']:,} 件")
        except AppError as error:
            print(f"  失敗：{error.user_message}（画面の「データ」から再度更新できます）")
            print_source_check(context.source_service.test({}))
    print_column_notices(context.lot_service.model)

    try:
        server = bind(context, config.server_host, args.port or config.server_port)
    except OSError as exc:
        print(f"[起動できません] {exc}")
        return 1

    url = f"http://{config.server_host}:{server.server_address[1]}/"
    print(f"{config.app_name} {config.app_version} を起動しました： {url}")
    print("このウィンドウを閉じるか Ctrl+C で終了します。")
    if config.open_browser and not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        logger.info("application stop")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`start.bat`

```bat
@echo off
rem Data Search - Python version
rem Settings: config\sample\*.sample.json overridden by config\local\*.local.json (if present)
chcp 65001 > nul
cd /d "%~dp0"
set "PY=python"
where py > nul 2> nul && set "PY=py -3"
%PY% python\run_server.py
if errorlevel 1 pause
```

`start-dummy.bat`

```bat
@echo off
rem Data Search - Python version with dummy data (no real data is used)
chcp 65001 > nul
cd /d "%~dp0"
set "PY=python"
where py > nul 2> nul && set "PY=py -3"
%PY% python\tools\make_dummy_db.py --if-missing
%PY% python\run_server.py --local-dir config\dummy
if errorlevel 1 pause
```

画面側の起動（表示定義を最初に読み込む）は次のファイル。

`src/js/app.js`

```javascript
/* =========================================================
   起動：アダプターを選び、状態・操作・画面の部品を組み立てる
   依存の向き：画面の部品 → 操作（controllers） → API → アダプター
   ========================================================= */
(function () {
  'use strict';

  const DS = window.DS;

  /** アイコンのフォントが読めないときは文字の代替に切り替える */
  function watchIconFont() {
    if (!document.fonts || !document.fonts.load) return;
    document.fonts.load('900 16px "Font Awesome 6 Free"').then((faces) => {
      if (!faces.length) document.documentElement.classList.add('no-icons');
    }).catch(() => document.documentElement.classList.add('no-icons'));
  }

  /** 表示定義を読めないときは、画面の部品を作らずに理由だけを出す */
  function showFatal(message, detailId) {
    const box = document.createElement('div');
    box.className = 'fatal';
    box.innerHTML = '<h1 class="fatal__title">画面を準備できませんでした</h1><p class="fatal__text"></p><p class="fatal__id mono"></p>';
    box.querySelector('.fatal__text').textContent = message;
    box.querySelector('.fatal__id').textContent = detailId ? `問い合わせ番号 ${detailId}` : '';
    document.body.replaceChildren(box);
  }

  async function start() {
    watchIconFont();
    const bus = DS.core.createEventBus();
    const api = DS.api.createClient(DS.api.selectAdapter());

    // 表示定義（DB の全列・種類・固定列・探す列）を最初に読み込み、列の登録簿を組み立てる
    try {
      DS.domain.applyView(await api.call('get_view_config'));
    } catch (error) {
      showFatal(error.userMessage || String(error), error.detailId);
      return;
    }

    const mode = {
      mode: api.mode,
      label: api.adapter.label,
      description: api.adapter.description,
      capabilities: api.capabilities,
    };
    const store = DS.core.createStore(DS.controllers.createInitialState(mode), bus);
    DS.controllers.attachPrefsPersistence(store, bus);
    document.documentElement.dataset.mode = api.mode;

    const toast = DS.views.createToast(document.getElementById('toast-host'));
    bus.on('prefs:failed', (reason) => toast.show({ tone: 'warning', message: `設定を保存できませんでした：${reason}` }));

    const search = DS.controllers.createSearchController({ store, bus, api, toast });
    const cache = DS.controllers.createCacheController({ store, api, toast, search });
    const samples = DS.controllers.createSampleController({ store, api, toast, search, cache });
    const source = DS.controllers.createSourceController({ store, api, toast, search, cache });
    const tags = DS.controllers.createTagController({ store, bus, toast, search });
    const record = DS.controllers.createRecordController({ store, api, toast });

    const manual = DS.views.createManualView(document.getElementById('manual-host'));
    const openPanel = (id) => store.merge('ui', { panel: id });
    const refresh = () => cache.refresh();
    // 「固定列を選ぶ」：データのパネルを開き、その場所で変更を始める
    const chooseKey = () => {
      openPanel('data');
      bus.emit('record:edit');
    };
    bus.on('record:choose', chooseKey);
    const ctx = { store, bus, api, toast, search, cache, samples, tags, source, record };
    const columnFilter = DS.views.createColumnFilter({ store, bus, ctx });

    DS.views.createSidePanel({
      rail: document.getElementById('rail'),
      host: document.getElementById('sidepanel'),
      store, bus, ctx,
      openManual: manual.toggle,
    });
    const searchBar = DS.views.createSearchBar(document.getElementById('search-host'), { store, bus, search, openPanel, refresh, chooseKey });
    DS.views.createStatusChips(document.getElementById('status-host'), { store, bus, openPanel });
    DS.views.createTagBar(document.getElementById('tagbar'), { store, bus, tags, openPanel });
    const results = DS.views.createResultsView(document.getElementById('results'), { store, bus, search, toast, openPanel, refresh, columnFilter, chooseKey });
    DS.views.createDetailView(document.getElementById('detail'), { store, bus, search, toast });

    // Esc：開いているものを手前から順に閉じる（入力中の Esc は入力欄が受け持つ）
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
      if (store.get().selection.open) search.closeDetail();
      else if (store.get().ui.panel) openPanel(null);
    });

    try {
      const info = await api.call('get_application_info');
      store.set({ appInfo: info });
      document.getElementById('app-version').textContent = `v${info.version}`;
    } catch (error) {
      toast.show({ tone: 'danger', message: error.userMessage, detailId: error.detailId });
    }
    await Promise.all([cache.loadStatus(), source.load()]);
    await search.run({ page: 1 }); // 起動したらすぐ一覧を出す（入力は不要）
    searchBar.focus();

    DS.app = { store, bus, api, search, cache, samples, tags, source, record, manual, columnFilter, results }; // 確認用スクリプト（tests/ui-check.js）から使う
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
```

## 13. 既存ファイルから新構成への移行内容

`docs/config-design.md` の 8 章を参照（旧 `config.local.json` の各項目の移し先と、ソースコードから設定へ移した表示定義の一覧）。要点：

- `dataSource.tableName` → `config/local/schema.local.json` の `tableName`
- `fieldMappings` → `config/local/schema.local.json` の `columns`
- `dataSource.sourcePath` → `config/local/config.local.json`
- それ以外（`cache`・`search`・`logging`・`devServer` など）→ サンプルを基本とし、必要なときだけ `config.local.json`
- ソースコード内の表示名・表示順・検索対象・絞り込み・状態の色分け・既定の並べ替え → `view.sample.json`
- ソースコード内の 1 件を特定する項目・日付の項目 → `schema.sample.json` の `recordKey`・`types`

### 削除・仕様変更（対象・理由・影響範囲）

| 対象 | 内容 | 理由 | 影響範囲 |
|---|---|---|---|
| `config/sample/*.sample.json` | 依頼者提供のファイルに差し替え | 正式なサンプルとして提供されたため | 検索項目 6 種・一覧 17 列・詳細 83 項目・絞り込み 8 種（すべて値から選ぶ）。日付の絞り込みと状態の色分けは、sample に定義がないため出ない |
| `config/config.sample.json` | 削除（`config/sample/` の 3 ファイルへ分割） | 環境・DB 定義・表示定義を分けるため | 旧パスを読む処理はすべて置き換え済み |
| `python/data_search/config_loader.py` | 削除（`settings/` へ置き換え） | 読み込み・マージ・検証を役割ごとのファイルに分けるため | `run_server.py`・テストを置き換え済み |
| 「設定が未完了」状態での起動 | 廃止。仮の値が残っていれば、対象ファイルと項目を示して**停止**する | 依頼書 13 章「実データ利用に必要なローカル値が未設定の場合は、対象ファイルと項目を明示して停止する」 | 画面の「設定が未完了」表示・直し方の表示を削除。`get_cache_status` の `configSource`・`configFile`・`configIncomplete`・`incompleteSettings`・`ignoredSettings` を削除し、`settingsWarnings` に置き換え |
| `--config` 起動オプション | `--local-dir`（上書きフォルダの指定）に置き換え | 上書きが 3 ファイルになったため | `start-dummy.bat` を変更済み |
| `config/config.dummy.json` | `config/dummy/config.local.json`・`schema.local.json` に置き換え | 同上 | `make_dummy_db.py` を変更済み |
| `fields.py` の論理項目の定数 | 削除（schema・view から `DataModel` を組み立てる） | 項目名・検索対象・絞り込みをソースコードに固定しないため | `query.py`・`lot_service.py` を変更済み |
| 画面 `fields.js` の項目定義・`status-tones.js` の色分け | 削除（view から組み立てる） | 表示項目・表示順・表示設定をソースコードに固定しないため | 画面の全部品が表示定義を参照するよう変更済み |
| 状態の札の大文字小文字の区別 | `OK` / `NG` は大文字だけに当たる（以前は大文字小文字を区別しなかった） | JSON の正規表現に区別しない指定（フラグ）を持たせないため | 小文字の ok / ng を札にしたいときは `badge` の `match` に足す |

## 14. 変更した全ファイルの一覧

| 区分 | ファイル |
|---|---|
| 修正 | `.gitignore` |
| 修正 | `README.md` |
| 削除 | `config/config.sample.json` |
| 新規 | `config/sample/config.sample.json` |
| 新規 | `config/sample/schema.sample.json` |
| 新規 | `config/sample/view.sample.json` |
| 修正 | `docs/config-design.md` |
| 修正 | `python/data_search/__init__.py` |
| 修正 | `python/data_search/cache_copier.py` |
| 修正 | `python/data_search/cache_service.py` |
| 修正 | `python/data_search/cache_validator.py` |
| 新規 | `python/data_search/column_catalog.py` |
| 修正 | `python/data_search/commands.py` |
| 削除 | `python/data_search/config_loader.py` |
| 修正 | `python/data_search/errors.py` |
| 修正 | `python/data_search/fields.py` |
| 修正 | `python/data_search/http_server.py` |
| 修正 | `python/data_search/lot_service.py` |
| 修正 | `python/data_search/query.py` |
| 新規 | `python/data_search/settings/__init__.py` |
| 新規 | `python/data_search/settings/defaults.py` |
| 新規 | `python/data_search/settings/loader.py` |
| 新規 | `python/data_search/settings/local_writer.py` |
| 新規 | `python/data_search/settings/merge.py` |
| 新規 | `python/data_search/settings/validation.py` |
| 新規 | `python/data_search/source_check.py` |
| 新規 | `python/data_search/source_service.py` |
| 修正 | `python/run_server.py` |
| 修正 | `python/tests/test_backend.py` |
| 修正 | `python/tools/make_dummy_db.py` |
| 新規 | `python/tools/sample_columns.json` |
| 新規 | `python/tools/sync_sample_view.py` |
| 修正 | `src/css/components.css` |
| 修正 | `src/css/layout.css` |
| 修正 | `src/css/tokens.css` |
| 修正 | `src/index.html` |
| 修正 | `src/js/api/api-client.js` |
| 修正 | `src/js/api/mock-adapter.js` |
| 修正 | `src/js/app.js` |
| 修正 | `src/js/controllers/app-state.js` |
| 修正 | `src/js/controllers/data-controller.js` |
| 修正 | `src/js/controllers/search-controller.js` |
| 新規 | `src/js/controllers/source-controller.js` |
| 修正 | `src/js/domain/fields.js` |
| 修正 | `src/js/domain/status-tones.js` |
| 修正 | `src/js/manual/manual-content.js` |
| 新規 | `src/js/panels/columns-panel.js` |
| 修正 | `src/js/panels/panels.js` |
| 修正 | `src/js/sample/sample-data.js` |
| 新規 | `src/js/sample/sample-view.js` |
| 修正 | `src/js/views/detail-view.js` |
| 新規 | `src/js/views/grid-tools.js` |
| 修正 | `src/js/views/results-view.js` |
| 修正 | `src/js/views/search-bar.js` |
| 修正 | `src/js/views/side-panel.js` |
| 新規 | `src/js/views/source-editor.js` |
| 修正 | `src/js/views/status-chips.js` |
| 修正 | `src/js/views/tag-bar.js` |
| 修正 | `start-dummy.bat` |
| 修正 | `start.bat` |
| 修正 | `tests/ui-check.js` |
| 新規 | `docs/report/*.md`（この成果物一覧） |

リポジトリ直下の `01_external_ai_spec.md`・`05_directory_structure.md`・`06_external_ai_prompt.txt` は依頼者の資料のため変更していない。旧パス（`config/config.sample.json`）が書かれているので、必要に応じて更新をお願いしたい。

## 15. 起動時の処理フロー

`docs/config-design.md` の 7 章（図と文字の両方）。

## 16. 各設定ファイルの責務説明

`docs/config-design.md` の 3 章（責務）と、README の「設定ファイル」（変更時の責務分担表）。

