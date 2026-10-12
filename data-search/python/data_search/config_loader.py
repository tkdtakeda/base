"""設定ファイルの読み込みと検証。

方針
  1. config/config.sample.json がシステムの正式な設定スキーマ（キーの構造と値の型）である
  2. アプリは config.sample.json のスキーマを基準に動く
  3. config.local.json は同じスキーマで、値だけを持つ
  4. sample と local のキー構造の違いは許さない（足りないキー・余分なキー・型の違いは起動を止める）
  5. 読み込む順は config.local.json → なければ config.sample.json
  6. 設定項目を足すときは sample と local の両方に足す

config.sample.json の値は仮の値（<...>）なので、sample で起動したときは「設定が未完了」の状態になる。
そのときは共有データにもキャッシュにも触れず、画面とコンソールで理由と次にすることを知らせる。

物理情報（パス・表名・列名）はここで読み込み、画面には渡さない。
相対パスは「設定ファイルのあるフォルダの 1 つ上」（＝アプリのルート）を基準に解決する。
"""

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

# 仮の値のままだと動けない設定（データの場所と、表・列の対応）
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
    config_path: str
    config_source: str          # "local" / "sample" / "other"（--config で指定したとき）
    base_dir: str
    incomplete_settings: tuple  # 仮の値のままの設定（キーの道筋。値は含めない）

    @property
    def incomplete(self):
        return bool(self.incomplete_settings)


# ── ファイルの選び方 ─────────────────────────────────────────

def resolve_config_path(config_dir, explicit_path=None):
    """読み込む設定ファイルを決める。--config の指定があればそれ、なければ local → sample の順。"""
    if explicit_path:
        return os.path.abspath(explicit_path)
    local = os.path.join(config_dir, LOCAL_FILE_NAME)
    return local if os.path.isfile(local) else os.path.join(config_dir, SCHEMA_FILE_NAME)


def _read_json(path, missing_code):
    if not os.path.isfile(path):
        raise AppError(missing_code, f"not found: {path}")
    try:
        with open(path, encoding="utf-8-sig") as fp:
            return json.load(fp)
    except (OSError, ValueError) as exc:
        raise AppError("CONFIG_INVALID", f"{os.path.basename(path)} を JSON として読めません: {exc}") from exc


# ── スキーマとの照合 ─────────────────────────────────────────

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


def compare_structure(schema, data, path=""):
    """schema（config.sample.json）と data のキー構造・値の型の違いを、すべて挙げる。"""
    problems = []
    if isinstance(schema, dict):
        if not isinstance(data, dict):
            return [f"{path or '(全体)'} は {_type_name(schema)} にしてください（今は {_type_name(data)}）"]
        for key in schema:
            child = f"{path}.{key}" if path else key
            if key not in data:
                problems.append(f"{child} がありません")
            else:
                problems.extend(compare_structure(schema[key], data[key], child))
        for key in data:
            if key not in schema:
                child = f"{path}.{key}" if path else key
                problems.append(f"{child} は {SCHEMA_FILE_NAME} にないキーです")
        return problems
    if _type_name(schema) != _type_name(data):
        return [f"{path} は {_type_name(schema)} にしてください（今は {_type_name(data)}）"]
    return []


def find_placeholders(data, path=""):
    """仮の値（<...>）のままの設定のキーの道筋を挙げる。"""
    found = []
    if isinstance(data, dict):
        for key, value in data.items():
            found.extend(find_placeholders(value, f"{path}.{key}" if path else key))
    elif isinstance(data, str) and PLACEHOLDER_PATTERN.search(data):
        found.append(path)
    return found


def _get(data, path):
    node = data
    for key in path.split("."):
        node = node[key]
    return node


def _resolve(base_dir, path):
    if not path or PLACEHOLDER_PATTERN.search(path):
        return path
    return path if os.path.isabs(path) or path.startswith("\\\\") else os.path.normpath(os.path.join(base_dir, path))


# ── 読み込み ─────────────────────────────────────────────

def load_config(config_path, schema_path=None):
    """設定を読み込み、スキーマ（config.sample.json）と照合する。

    キー構造・型・値の範囲に問題があれば AppError（CONFIG_INVALID）。
    仮の値が残っているだけなら止めずに incomplete_settings に入れて返す。
    """
    config_path = os.path.abspath(config_path)
    config_dir = os.path.dirname(config_path)
    schema_path = os.path.abspath(schema_path or os.path.join(config_dir, SCHEMA_FILE_NAME))

    schema = _read_json(schema_path, "CONFIG_SCHEMA_NOT_FOUND")
    data = schema if config_path == schema_path else _read_json(config_path, "CONFIG_NOT_FOUND")
    file_name = os.path.basename(config_path)

    # スキーマとプログラムの論理項目がずれていないか（開発時の取り違えを防ぐ）
    schema_fields = set(schema.get("fieldMappings", {})) if isinstance(schema.get("fieldMappings"), dict) else set()
    if schema_fields != set(DISPLAY_FIELDS):
        raise AppError(
            "CONFIG_INVALID",
            f"{SCHEMA_FILE_NAME} の fieldMappings がプログラムの論理項目と一致しません"
            f"（不足: {sorted(set(DISPLAY_FIELDS) - schema_fields)} / 余分: {sorted(schema_fields - set(DISPLAY_FIELDS))}）",
        )

    problems = compare_structure(schema, data)
    if problems:
        raise AppError("CONFIG_INVALID", "\n".join(f"{file_name}: {p}" for p in problems))

    # 値の範囲（キーと型はスキーマで確認済み）
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
    for path in ("dataSource.sourcePath", "dataSource.cachePath", "dataSource.tableName"):
        if not _get(data, path).strip():
            problems.append(f"{path} が空です")
    if problems:
        raise AppError("CONFIG_INVALID", "\n".join(f"{file_name}: {p}" for p in problems))

    placeholders = find_placeholders(data)
    incomplete = tuple(path for path in placeholders if any(
        path == required or (required.endswith(".") and path.startswith(required)) for required in REQUIRED_SETTINGS))
    other = [path for path in placeholders if path not in incomplete]
    if other:
        # データの場所以外（アプリ名など）に仮の値が残っているのは、書き換え漏れとして止める
        raise AppError("CONFIG_INVALID", "\n".join(f"{file_name}: {p} が仮の値（<...>）のままです" for p in other))

    if config_path == schema_path:
        source = "sample"
    elif os.path.basename(config_path) == LOCAL_FILE_NAME:
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
        config_path=config_path,
        config_source=source,
        base_dir=base_dir,
        incomplete_settings=incomplete,
    )
