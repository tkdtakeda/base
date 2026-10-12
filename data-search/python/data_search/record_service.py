"""固定列（schema.recordKey）と、番号で探す列（schema.searchColumn）の確認・変更。

確認：選んだ列の組み合わせで 1 件に決まるかを数える（重なり・空欄の行の数）。保存はしない。
変更：schema.local.json の recordKey・searchColumn に DB の列名で保存 → 設定を読み直して検証 → 差し替える。
      キャッシュは作り直さない（列の決まりだけが変わる）。重なりがあっても保存はできる（画面で注意を出す）。
ログには列名を残さない（数だけ）。
"""

import os

from .errors import AppError
from .lot_service import parse_key_columns
from .settings.local_writer import local_file
from .settings_updater import file_label, save_local_values

KEY_PATH = ("recordKey",)
SEARCH_PATH = ("searchColumn",)


class RecordService:
    def __init__(self, context, app_root, local_dir):
        self.context = context      # http_server.AppContext（config・cache_service・lot_service を持つ）
        self.app_root = app_root
        self.local_dir = local_dir or os.path.join(app_root, "config", "local")

    def check(self, payload):
        return self.context.lot_service.check_record_key(payload)

    def update(self, payload):
        if not isinstance(payload, dict):
            raise AppError("INVALID_REQUEST", "payload must be an object")
        if not self.context.cache_service.cache_available():
            raise AppError("CACHE_UNAVAILABLE", "cache file not found")
        model = self.context.lot_service.model
        names = parse_key_columns(payload, model)
        search_column = payload.get("searchColumn")
        if search_column is not None and not (isinstance(search_column, str) and model.has(search_column)):
            raise AppError("INVALID_REQUEST", "unknown searchColumn",
                           user_message="番号で探す列は、一覧にある列から選んでください。")
        # 番号で探す列が固定列の 1 つ目と同じなら null（あとで 1 つ目を変えたときに一緒に変わるように）
        stored_search = None if search_column in (None, names[0]) else search_column
        target = save_local_values(self.context, self.app_root, self.local_dir, "schema",
                                   {KEY_PATH: names, SEARCH_PATH: stored_search})
        updated = self.context.lot_service.model
        self.context.logger.info("record key updated columns=%d search=%s", len(names), "key" if stored_search is None else "other")
        return {
            "success": True,
            "saved": True,
            "recordKey": list(updated.record_key),
            "searchColumn": updated.search_column,
            "localFile": file_label(self.app_root, target),
            "message": "固定列を保存しました。",
        }

    def describe(self):
        return {"success": True, "localFile": file_label(self.app_root, local_file(self.local_dir, "schema"))}
