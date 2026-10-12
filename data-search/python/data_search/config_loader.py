"""設定ファイル（config.local.json など）の読み込みと検証。

物理情報（パス・表名・列名）はここで読み込み、画面には渡さない。
相対パスは「設定ファイルのあるフォルダの 1 つ上」（＝アプリのルート）を基準に解決する。
"""

import json
import os
import re
from dataclasses import dataclass

from .errors import AppError
from .fields import DISPLAY_FIELDS, MATCH_MODES

PLACEHOLDER_PATTERN = re.compile(r"<[^<>]+>")
LOG_LEVELS = ("debug", "info", "warning", "error")


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
    server_host: str = "127.0.0.1"
    server_port: int = 8765
    open_browser: bool = True
    config_path: str = ""
    base_dir: str = ""


class _Reader:
    """必須項目と型を確かめながら値を取り出す。問題はまとめて報告する。"""

    def __init__(self, data):
        self.data = data
        self.problems = []

    def get(self, path, kind, required=True, default=None):
        node = self.data
        for key in path.split("."):
            if not isinstance(node, dict) or key not in node:
                if required:
                    self.problems.append(f"{path} がありません")
                return default
            node = node[key]
        if kind is int and isinstance(node, bool):
            self.problems.append(f"{path} は整数で指定してください")
            return default
        if not isinstance(node, kind):
            self.problems.append(f"{path} の型が正しくありません（{kind.__name__} が必要）")
            return default
        return node

    def text(self, path, required=True, default=""):
        value = self.get(path, str, required, default)
        if required and isinstance(value, str):
            if not value.strip():
                self.problems.append(f"{path} が空です")
            elif PLACEHOLDER_PATTERN.search(value):
                self.problems.append(f"{path} がプレースホルダーのままです")
        return value


def _resolve(base_dir, path):
    if not path:
        return path
    return path if os.path.isabs(path) or path.startswith("\\\\") else os.path.normpath(os.path.join(base_dir, path))


def load_config(config_path):
    config_path = os.path.abspath(config_path)
    if not os.path.isfile(config_path):
        raise AppError("CONFIG_NOT_FOUND", f"config not found: {config_path}")
    try:
        with open(config_path, encoding="utf-8-sig") as fp:
            data = json.load(fp)
    except (OSError, ValueError) as exc:
        raise AppError("CONFIG_INVALID", f"cannot parse config: {exc}") from exc

    base_dir = os.path.dirname(os.path.dirname(config_path))
    r = _Reader(data)

    mappings = r.get("fieldMappings", dict, default={}) or {}
    for name in DISPLAY_FIELDS:
        value = mappings.get(name)
        if not isinstance(value, str) or not value.strip():
            r.problems.append(f"fieldMappings.{name} がありません")
        elif PLACEHOLDER_PATTERN.search(value):
            r.problems.append(f"fieldMappings.{name} がプレースホルダーのままです")

    if r.get("dataSource.readOnly", bool) is False:
        r.problems.append("dataSource.readOnly は true にしてください（共有データは読み取り専用）")

    match_mode = r.text("search.defaultMatchMode")
    if match_mode not in MATCH_MODES:
        r.problems.append("search.defaultMatchMode は partial か exact にしてください")
    page_size = r.get("search.pageSize", int, default=100)
    max_page_size = r.get("search.maxPageSize", int, default=500)
    if isinstance(page_size, int) and isinstance(max_page_size, int):
        if not 1 <= page_size <= max_page_size:
            r.problems.append("search.pageSize は 1 以上 maxPageSize 以下にしてください")

    level = r.text("logging.level", required=False, default="info").lower()
    if level not in LOG_LEVELS:
        r.problems.append("logging.level は debug / info / warning / error のいずれかにしてください")

    config = AppConfig(
        app_id=r.text("application.id"),
        app_name=r.text("application.name"),
        app_version=r.text("application.version"),
        source_path=_resolve(base_dir, r.text("dataSource.sourcePath")),
        cache_path=_resolve(base_dir, r.text("dataSource.cachePath")),
        table_name=r.text("dataSource.tableName"),
        field_mappings={name: mappings.get(name) for name in DISPLAY_FIELDS},
        temporary_extension=r.text("cache.temporaryExtension", required=False, default=".tmp") or ".tmp",
        keep_previous_on_failure=r.get("cache.keepPreviousOnFailure", bool, required=False, default=True),
        default_match_mode=match_mode,
        page_size=page_size,
        max_page_size=max_page_size,
        log_directory=_resolve(base_dir, r.text("logging.directory", required=False, default="./logs") or "./logs"),
        log_level=level,
        server_host=r.text("devServer.host", required=False, default="127.0.0.1") or "127.0.0.1",
        server_port=r.get("devServer.port", int, required=False, default=8765),
        open_browser=r.get("devServer.openBrowser", bool, required=False, default=True),
        config_path=config_path,
        base_dir=base_dir,
    )
    if config.server_host not in ("127.0.0.1", "localhost"):
        r.problems.append("devServer.host は 127.0.0.1 か localhost にしてください（ほかの PC から接続させない）")
    if r.problems:
        raise AppError("CONFIG_INVALID", "; ".join(r.problems))
    return config
