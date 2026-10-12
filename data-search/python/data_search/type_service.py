"""列の種類（日付・数値・文字列）の手動の指定。画面の見出しの小窓から選ぶ。

保存先は schema.local.json の types（キーは DB の列名）。「自動」はその列の指定を消す。
別名（論理名）で書いた同じ列の指定も一緒に消し、指定が 2 つ残って食い違わないようにする。
キャッシュは作り直さない（種類は列の決まりの中だけで変わる）。ログには列名を残さない。
"""

import os

from .column_model import KINDS, setting_names_for
from .errors import AppError
from .settings_updater import file_label, save_local_values

AUTO = "auto"


class ColumnTypeService:
    def __init__(self, context, app_root, local_dir):
        self.context = context      # http_server.AppContext（config・cache_service・lot_service を持つ）
        self.app_root = app_root
        self.local_dir = local_dir or os.path.join(app_root, "config", "local")

    def update(self, payload):
        if not isinstance(payload, dict):
            raise AppError("INVALID_REQUEST", "payload must be an object")
        if not self.context.cache_service.cache_available():
            raise AppError("CACHE_UNAVAILABLE", "cache file not found")
        model = self.context.lot_service.model
        column, kind = payload.get("column"), payload.get("kind")
        if not isinstance(column, str) or not model.has(column):
            raise AppError("INVALID_REQUEST", "unknown column", user_message="種類を変える列が見つかりません。画面を読み込み直してください。")
        if kind != AUTO and kind not in KINDS:
            raise AppError("INVALID_REQUEST", "unknown kind", user_message="種類は 自動・日付・数値・文字列 から選んでください。")

        db_names = [c.name for c in self.context.cache_service.catalog()]
        old_names = setting_names_for(self.context.config.model, db_names, column)
        values = {} if kind == AUTO else {("types", column): kind}
        delete = [("types", name) for name in old_names if not (kind != AUTO and name == column)]
        target = save_local_values(self.context, self.app_root, self.local_dir, "schema", values, delete)

        updated = self.context.lot_service.model
        current = next(c for c in updated.columns if c.id == column)
        self.context.logger.info("column type updated kind=%s manual=%s", current.kind, current.manual)
        label = {"date": "日付", "number": "数値", "text": "文字列"}[current.kind]
        return {
            "success": True,
            "saved": True,
            "column": column,
            "kind": current.kind,
            "manual": current.manual,
            "localFile": file_label(self.app_root, target),
            "message": f"「{column}」の種類を{'自動（' + label + '）' if not current.manual else label}にしました。",
        }
