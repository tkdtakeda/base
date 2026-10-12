"""読み込み先（共有 SQLite のパス）の確認・接続テスト・変更。

変更の流れ：接続テスト（× がないときだけ次へ。△ は保存してから直せる）→ config.local.json の dataSource.sourcePath に保存
            → 設定を読み直して検証 → 動いている設定を差し替え → キャッシュを作り直す。
読み直しで誤りが出たら、保存を取り消して元の設定のまま動かす。
ログにはパスを残さない（段階の id・結果・件数だけ）。
"""

import os

from .errors import AppError
from .settings.local_writer import local_file
from .settings_updater import file_label, save_local_values
from .source_check import check_source, normalize_path

SOURCE_KEY = ("dataSource", "sourcePath")


class SourceService:
    def __init__(self, context, app_root, local_dir):
        self.context = context      # http_server.AppContext（config・cache_service・lot_service を持つ）
        self.app_root = app_root
        self.local_dir = local_dir or os.path.join(app_root, "config", "local")

    def describe(self):
        config = self.context.config
        return {
            "success": True,
            "sourcePath": config.source_path,
            "editable": True,
            "localFile": file_label(self.app_root, local_file(self.local_dir, "config")),
        }

    def test(self, payload):
        config = self.context.config
        path = payload.get("sourcePath")
        if path is None:
            path = config.source_path
        if not isinstance(path, str) or len(path) > 1024:
            raise AppError("INVALID_REQUEST", "sourcePath must be a string up to 1024 chars")
        result = check_source(path, config.table_name, config.model, self.app_root)
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
        target = save_local_values(self.context, self.app_root, self.local_dir, "config", {SOURCE_KEY: new_path})
        self.context.logger.info("source updated rows=%s", checked["rowCount"])
        response = dict(checked, saved=True, localFile=file_label(self.app_root, target))
        try:
            refreshed = self.context.cache_service.refresh()
            response.update(refreshed=True, refreshRowCount=refreshed["rowCount"],
                            message=f"読み込み先を保存し、データを更新しました（{refreshed['rowCount']:,} 件）。")
        except AppError as error:
            response.update(refreshed=False, message=f"読み込み先は保存しましたが、データの更新に失敗しました：{error.user_message}")
        return response
