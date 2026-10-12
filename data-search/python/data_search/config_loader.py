"""設定ファイルの読み込み（config.sample.json を初期値とし、config.local.json で上書きする）。

  config.sample.json … 正式な設定スキーマ兼初期値。Git 管理対象。外部 AI へ渡してよい（社内情報を含まない）
  config.local.json  … 社内専用の値。Git 管理対象外。必要な項目だけを書けばよい。なくても起動できる

読み込みの流れ
  1. config.sample.json を読み込み、設定の初期値とする
  2. config.local.json があれば読み込み、同じキーの値を上書きする（入れ子のオブジェクトはキーごとに重ねる）
  3. config.local.json にないキーは config.sample.json の値をそのまま使う
  4. 重ねた結果の型と値の範囲を確かめる

上書きしたあとも仮の値（<...>）が残る設定（データの場所・表名・列名）があるときは「設定が未完了」とし、
共有データにもキャッシュにも触れずに起動する（画面とコンソールで、残っている項目と直し方を知らせる）。

物理情報（パス・表名・列名）はここで読み込み、画面には渡さない。
相対パスは「設定ファイルのあるフォルダの 1 つ上」（＝アプリのルート）を基準に解決する。
"""

import copy
import json
import os
import re
from dataclasses import dataclass

from .errors import AppError
from .fields import DISPLAY_FIELDS, MATCH_MODES

SCHEMA_FILE_NAME = "config.sample.json"
LOCAL_FILE_NAME = "config.local.json"
PLACEHOLDER_PATTERN = re.compile(r"<[^<>]+>")
LOG_LEVELS = ("debug", "info", "warning", "error")

# 仮の値のままだと動けない設定（データの場所と、表・列の対応）。末尾の "." はその下すべて
REQUIRED_SETTINGS = ("dataSource.sourcePath", "dataSource.cachePath", "dataSource.tableName", "fieldMappings.")


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
    schema_path: str             # config.sample.json の場所
    override_path: str           # 上書きに使ったファイル（なければ空）
    config_source: str           # "local" / "sample"（上書きなし） / "other"（--config で指定）
    base_dir: str
    overridden_keys: tuple       # 上書きした設定のキー（値は含めない）
    ignored_keys: tuple          # sample にないため使わなかったキー（書き間違いの可能性）
    incomplete_settings: tuple   # 仮の値のまま残っている設定のキー

    @property
    def incomplete(self):
        return bool(self.incomplete_settings)

    @property
    def config_file(self):
        return os.path.basename(self.override_path or self.schema_path)


# ── ファイル ─────────────────────────────────────────────

def resolve_override_path(config_dir, explicit_path=None):
    """上書きに使うファイル。--config の指定があればそれ、なければ config.local.json（なければ None）。"""
    if explicit_path:
        return os.path.abspath(explicit_path)
    local = os.path.join(config_dir, LOCAL_FILE_NAME)
    return local if os.path.isfile(local) else None


def _read_json(path, missing_code):
    if not os.path.isfile(path):
        raise AppError(missing_code, f"{path} が見つかりません")
    try:
        with open(path, encoding="utf-8-sig") as fp:
            data = json.load(fp)
    except (OSError, ValueError) as exc:
        raise AppError("CONFIG_INVALID", f"{os.path.basename(path)} を JSON として読めません: {exc}") from exc
    if not isinstance(data, dict):
        raise AppError("CONFIG_INVALID", f"{os.path.basename(path)} は {{ }} で囲んだオブジェクトにしてください")
    return data


# ── 重ね合わせ ───────────────────────────────────────────

def _type_name(value):
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


def merge_settings(base, override, path=""):
    """base（sample）に override（local）を重ねた新しい設定を返す。

    戻り値: (merged, overridden, ignored, type_errors)
      ・両方がオブジェクトのキーは、中身をキーごとに重ねる
      ・それ以外は override の値で置き換える（型は base と同じであること）
      ・override にないキーは base の値のまま
      ・base にないキーは使わず ignored に入れる
    """
    merged = copy.deepcopy(base)
    overridden, ignored, type_errors = [], [], []
    for key, value in override.items():
        child = f"{path}.{key}" if path else key
        if key not in base:
            ignored.append(child)
            continue
        if isinstance(base[key], dict) and isinstance(value, dict):
            sub, sub_overridden, sub_ignored, sub_errors = merge_settings(base[key], value, child)
            merged[key] = sub
            overridden += sub_overridden
            ignored += sub_ignored
            type_errors += sub_errors
        elif _type_name(base[key]) != _type_name(value):
            type_errors.append(f"{child} は {_type_name(base[key])} にしてください（今は {_type_name(value)}）")
        else:
            merged[key] = value
            overridden.append(child)
    return merged, overridden, ignored, type_errors


def find_placeholders(data, path=""):
    """仮の値（<...>）のままの設定のキーを挙げる。"""
    found = []
    if isinstance(data, dict):
        for key, value in data.items():
            found.extend(find_placeholders(value, f"{path}.{key}" if path else key))
    elif isinstance(data, str) and PLACEHOLDER_PATTERN.search(data):
        found.append(path)
    return found


def _is_required(path):
    return any(path == item or (item.endswith(".") and path.startswith(item)) for item in REQUIRED_SETTINGS)


def _resolve(base_dir, path):
    if not path or PLACEHOLDER_PATTERN.search(path):
        return path
    return path if os.path.isabs(path) or path.startswith("\\\\") else os.path.normpath(os.path.join(base_dir, path))


# ── 値の確認 ─────────────────────────────────────────────

def _check_values(data):
    problems = []
    if data["dataSource"]["readOnly"] is not True:
        problems.append("dataSource.readOnly は true にしてください（共有データは読み取り専用）")
    if data["search"]["defaultMatchMode"] not in MATCH_MODES:
        problems.append("search.defaultMatchMode は partial か exact にしてください")
    if not 1 <= data["search"]["pageSize"] <= data["search"]["maxPageSize"]:
        problems.append("search.pageSize は 1 以上 maxPageSize 以下にしてください")
    if data["logging"]["level"].lower() not in LOG_LEVELS:
        problems.append("logging.level は debug / info / warning / error のいずれかにしてください")
    if data["devServer"]["host"] not in ("127.0.0.1", "localhost"):
        problems.append("devServer.host は 127.0.0.1 か localhost にしてください（ほかの PC から接続させない）")
    if not 1 <= data["devServer"]["port"] <= 65535:
        problems.append("devServer.port は 1〜65535 にしてください")
    if not data["cache"]["temporaryExtension"].startswith("."):
        problems.append("cache.temporaryExtension は . で始めてください（例：.tmp）")
    for name, value in data["fieldMappings"].items():
        if not value.strip():
            problems.append(f"fieldMappings.{name} が空です")
    for key in ("sourcePath", "cachePath", "tableName"):
        if not data["dataSource"][key].strip():
            problems.append(f"dataSource.{key} が空です")
    return problems


# ── 読み込み ─────────────────────────────────────────────

def load_config(config_dir, override_path=None):
    """config.sample.json を初期値にし、override_path（通常は config.local.json）で上書きした設定を返す。

    override_path が None なら sample の値だけで起動する（config.local.json がない場合）。
    型や値の範囲に誤りがあれば AppError（CONFIG_INVALID）。キーが足りないことはエラーにしない。
    """
    config_dir = os.path.abspath(config_dir)
    schema_path = os.path.join(config_dir, SCHEMA_FILE_NAME)
    schema = _read_json(schema_path, "CONFIG_SCHEMA_NOT_FOUND")

    # スキーマとプログラムの論理項目がずれていないか（開発時の取り違えを防ぐ）
    schema_fields = set(schema.get("fieldMappings", {})) if isinstance(schema.get("fieldMappings"), dict) else set()
    if schema_fields != set(DISPLAY_FIELDS):
        raise AppError(
            "CONFIG_INVALID",
            f"{SCHEMA_FILE_NAME} の fieldMappings がプログラムの論理項目と一致しません"
            f"（不足: {sorted(set(DISPLAY_FIELDS) - schema_fields)} / 余分: {sorted(schema_fields - set(DISPLAY_FIELDS))}）",
        )

    overridden, ignored = [], []
    data = copy.deepcopy(schema)
    if override_path:
        override_path = os.path.abspath(override_path)
        override = _read_json(override_path, "CONFIG_NOT_FOUND")
        data, overridden, ignored, type_errors = merge_settings(schema, override)
        if type_errors:
            name = os.path.basename(override_path)
            raise AppError("CONFIG_INVALID", "\n".join(f"{name}: {line}" for line in type_errors))

    problems = _check_values(data)
    if problems:
        raise AppError("CONFIG_INVALID", "\n".join(problems))

    placeholders = find_placeholders(data)
    incomplete = tuple(path for path in placeholders if _is_required(path))
    other = [path for path in placeholders if not _is_required(path)]
    if other:
        # データの場所以外（アプリ名など）に仮の値があるのは sample の作り方の誤り
        raise AppError("CONFIG_INVALID", "\n".join(f"{path} が仮の値（<...>）のままです" for path in other))

    if not override_path:
        source = "sample"
    elif os.path.basename(override_path) == LOCAL_FILE_NAME:
        source = "local"
    else:
        source = "other"

    base_dir = os.path.dirname(config_dir)
    return AppConfig(
        app_id=data["application"]["id"],
        app_name=data["application"]["name"],
        app_version=data["application"]["version"],
        source_path=_resolve(base_dir, data["dataSource"]["sourcePath"]),
        cache_path=_resolve(base_dir, data["dataSource"]["cachePath"]),
        table_name=data["dataSource"]["tableName"],
        field_mappings=dict(data["fieldMappings"]),
        temporary_extension=data["cache"]["temporaryExtension"],
        keep_previous_on_failure=data["cache"]["keepPreviousOnFailure"],
        default_match_mode=data["search"]["defaultMatchMode"],
        page_size=data["search"]["pageSize"],
        max_page_size=data["search"]["maxPageSize"],
        log_directory=_resolve(base_dir, data["logging"]["directory"]),
        log_level=data["logging"]["level"].lower(),
        server_host=data["devServer"]["host"],
        server_port=data["devServer"]["port"],
        open_browser=data["devServer"]["openBrowser"],
        schema_path=schema_path,
        override_path=override_path or "",
        config_source=source,
        base_dir=base_dir,
        overridden_keys=tuple(overridden),
        ignored_keys=tuple(ignored),
        incomplete_settings=incomplete,
    )
