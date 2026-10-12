"""設定の読み込み：config / schema / view を、それぞれ「サンプル → ローカルで部分上書き」で組み立てる。

    config/sample/config.sample.json  ＋ config/local/config.local.json （あれば）
    config/sample/schema.sample.json  ＋ config/local/schema.local.json （あれば）
    config/sample/view.sample.json    ＋ config/local/view.local.json   （あれば）

ローカルのファイルがないことは誤りにしない（サンプルの値で検証まで進む）。
検証で誤りが見つかれば SettingsError（すべての誤りを持つ）。注意（未知のキーなど）は warnings に入れて続ける。

列の考え方：表示する列は DB のテーブルから自動で読み取る（column_catalog.py）。設定に書くのは
1 件を決める列（recordKey）・番号で探す列（searchColumn）などの役割だけ。名前は DB の列名か、
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
        "searchFields": "番号で探す列は 1 つにしました。schema.searchColumn に書くか、画面左の「データ」→「1 件を決める列」で選んでください。",
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
    record_key: tuple      # 1 件を決める列（schema.recordKey）
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
                              "（1 件を決める列などは、DB の列名のまま recordKey・searchColumn に書けます）。"))
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
