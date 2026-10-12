"""読み込み先（共有 SQLite のパス）の確認・接続テスト・変更。

変更の流れ：接続テスト（すべて ○ のときだけ次へ）→ config.local.json の dataSource.sourcePath に保存
            → 設定を読み直して検証 → 動いている設定を差し替え → キャッシュを作り直す。
読み直しで誤りが出たら、保存を取り消して元の設定のまま動かす。
ログにはパスを残さない（段階の id・結果・件数だけ）。
"""

import os

from .errors import AppError
from .settings import SettingsError, load_settings
from .settings.local_writer import local_file, restore_backup, set_local_value
from .source_check import check_source, normalize_path

SOURCE_KEY = ("dataSource", "sourcePath")


class SourceService:
    def __init__(self, context, app_root, local_dir):
        self.context = context      # http_server.AppContext（config・cache_service・lot_service を持つ）
        self.app_root = app_root
        self.local_dir = local_dir or os.path.join(app_root, "config", "local")

    def _label(self, path):
        relative = os.path.relpath(path, self.app_root)
        return path if relative.startswith("..") else relative.replace("\\", "/")

    def describe(self):
        config = self.context.config
        return {
            "success": True,
            "sourcePath": config.source_path,
            "editable": True,
            "localFile": self._label(local_file(self.local_dir, "config")),
        }

    def test(self, payload):
        config = self.context.config
        path = payload.get("sourcePath")
        if path is None:
            path = config.source_path
        if not isinstance(path, str) or len(path) > 1024:
            raise AppError("INVALID_REQUEST", "sourcePath must be a string up to 1024 chars")
        result = check_source(path, config.table_name, config.field_mappings, self.app_root)
        self.context.logger.info(
            "source check ok=%s steps=%s", result["ok"],
            ",".join(f"{step['id']}:{step['status']}" for step in result["steps"]),
        )
        return dict(result, success=True)

    def update(self, payload):
        checked = self.test(payload)
        if not checked["ok"]:
            return dict(checked, saved=False, message="接続テストで × があるため、保存していません。")

        new_path = normalize_path(payload.get("sourcePath"))
        target = local_file(self.local_dir, "config")
        existed = os.path.isfile(target)
        try:
            set_local_value(self.local_dir, "config", SOURCE_KEY, new_path)
        except (OSError, ValueError) as exc:
            raise AppError("SETTINGS_WRITE_FAILED", f"write failed: {type(exc).__name__}") from exc
        try:
            config = load_settings(self.app_root, self.local_dir)
        except SettingsError as error:
            restore_backup(self.local_dir, "config", existed)
            reasons = " / ".join(f"{issue.path}：{issue.reason}" for issue in error.issues if issue.level == "error")
            raise AppError("SETTINGS_WRITE_FAILED", "reload failed",
                           user_message=f"保存すると設定に誤りが出るため、元に戻しました（{reasons}）。") from error

        self._use_config(config)
        self.context.logger.info("source updated rows=%s", checked["rowCount"])
        response = dict(checked, saved=True, localFile=self._label(target))
        try:
            refreshed = self.context.cache_service.refresh()
            response.update(refreshed=True, refreshRowCount=refreshed["rowCount"],
                            message=f"読み込み先を保存し、データを更新しました（{refreshed['rowCount']:,} 件）。")
        except AppError as error:
            response.update(refreshed=False, message=f"読み込み先は保存しましたが、データの更新に失敗しました：{error.user_message}")
        return response

    def _use_config(self, config):
        """動いている設定を差し替える。読み込み先が変わったら、前の読み込み先のキャッシュは使わない。"""
        self.context.config = config
        self.context.cache_service.use_config(config)
        self.context.lot_service.config = config
