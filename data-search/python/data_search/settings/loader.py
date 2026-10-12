"""設定の読み込み：config / schema / view を、それぞれ「サンプル → ローカルで部分上書き」で組み立てる。

    config/sample/config.sample.json  ＋ config/local/config.local.json （あれば）
    config/sample/schema.sample.json  ＋ config/local/schema.local.json （あれば）
    config/sample/view.sample.json    ＋ config/local/view.local.json   （あれば）

ローカルのファイルがないことは誤りにしない（サンプルの値で検証まで進む）。
検証で誤りが見つかれば SettingsError（すべての誤りを持つ）。注意（未知のキーなど）は warnings に入れて続ける。

物理情報（パス・表名・列名）はここで読み込み、画面には渡さない（画面へは public_view() の論理情報だけ）。
相対パスはアプリのルート（data-search/）を基準に解決する。
"""

import json
import os
from dataclasses import dataclass

from ..errors import AppError
from .defaults import BUILTIN_DEFAULTS
from .merge import deep_merge, fill_defaults, type_name
from .validation import Issue, SettingSource, validate_config, validate_schema, validate_view

KINDS = ("config", "schema", "view")
# 新しいキー（論理項目）を足してよい場所。ここ以外のサンプルにないキーは「未知のキー」
OPEN_MAPS = {
    "config": (),
    "schema": ("columns", "types"),
    "view": ("fields",),
}


class SettingsError(AppError):
    """設定の誤り。issues に「対象ファイル・項目・理由・対応」を持つ。"""

    def __init__(self, issues):
        self.issues = issues
        super().__init__("CONFIG_INVALID", "\n\n".join(issue.format() for issue in issues))


@dataclass(frozen=True)
class DataModel:
    """論理項目の決まり（schema と view から作る。ソースコードには項目名を書かない）。"""
    fields: tuple          # 論理項目（schema.columns の順）
    searchable: tuple      # 番号で探せる項目（view.listColumns の searchable）
    filters: dict          # 絞り込みの項目 → "values" / "date"（view.filters）
    date_fields: tuple     # 日付の項目（schema.types）
    record_key: tuple      # 1 件を特定する項目（schema.recordKey）
    default_sort: tuple    # (項目, "asc" / "desc")（view.defaultSort）


@dataclass(frozen=True)
class AppConfig:
    app_id: str
    app_name: str
    app_version: str
    source_path: str
    cache_path: str
    table_name: str
    field_mappings: dict
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
    model: DataModel
    view: dict             # マージ後の view（論理情報だけ）
    sources: tuple         # (種類, サンプルのファイル, ローカルのファイル or None, 上書きした項目数)
    warnings: tuple        # Issue（level="warning"）
    public: dict           # 画面へ渡す表示定義（public_view_of の結果）

    def public_view(self):
        return self.public


def public_view_of(schema, view):
    """画面へ渡す表示定義。schema からは論理名・鍵・型だけを取り、物理名（tableName・列名）は含めない。"""
    return {
        "logicalFields": list(schema["columns"]),
        "recordKey": list(schema["recordKey"]),
        "types": {name: kind for name, kind in schema["types"].items() if kind == "date"},
        "listColumns": view["listColumns"],
        "detailFields": view["detailFields"],
        "detailGroups": view["detailGroups"],
        "fields": view["fields"],
        "filters": view["filters"],
        "defaultSort": view["defaultSort"],
    }


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
    for path in merged.unknown:
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

    model = DataModel(
        fields=tuple(schema["columns"]),
        searchable=tuple(c["field"] for c in view["listColumns"] if c["searchable"]),
        filters={item["field"]: item["type"] for item in view["filters"]},
        date_fields=tuple(name for name, kind in schema["types"].items() if kind == "date"),
        record_key=tuple(schema["recordKey"]),
        default_sort=(view["defaultSort"]["field"], view["defaultSort"]["order"]),
    )
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
        field_mappings=dict(schema["columns"]),
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
        model=model,
        view=view,
        sources=sources,
        warnings=tuple(warnings),
        public=public_view_of(schema, view),
    )


__all__ = ["AppConfig", "DataModel", "SettingsError", "load_settings", "public_view_of", "type_name"]
