"""利用者向けメッセージと技術ログを分けるためのエラー型。

画面へ出すのは code と userMessage と detailId だけ。技術的な詳細（パス・OS エラーなど）は
detail に入れてログにだけ残す。
"""

import uuid

# code → 利用者向けメッセージ（次に取る行動が分かる文にする）
USER_MESSAGES = {
    "CONFIG_INVALID": "設定に誤りがあります。表示された「対象・項目・理由・対応」に沿って直してください。",
    "SOURCE_UNAVAILABLE": "共有データに接続できません。ネットワークと共有フォルダを確認してください。",
    "SOURCE_BUSY": "共有データが更新中のため取得できませんでした。少し待ってからもう一度更新してください。",
    "CACHE_COPY_FAILED": "共有データをコピーできませんでした。少し待ってからもう一度更新してください。",
    "CACHE_INVALID": "取得したデータが壊れていたため、使用しませんでした。",
    "CACHE_TABLE_MISSING": "取得したデータに必要な表がないため、使用しませんでした。schema.local.json の tableName を確認してください。",
    "CACHE_COLUMN_MISSING": "取得したデータに必要な列がないため、使用しませんでした。schema.local.json の columns を確認してください。",
    "CACHE_UNAVAILABLE": "検索できるデータがまだありません。データを更新してください。",
    "SETTINGS_WRITE_FAILED": "設定ファイルに書き込めませんでした。config/local フォルダの権限と、ほかのアプリで開いていないかを確認してください。",
    "INVALID_REQUEST": "検索の条件が正しくありません。入力内容を確認してください。",
    "NOT_FOUND": "選んだデータが見つかりません。データが更新された可能性があります。もう一度検索してください。",
    "UNKNOWN_COMMAND": "この操作には対応していません。",
    "INTERNAL_ERROR": "予期しないエラーが発生しました。もう一度試し、続く場合は管理者へ連絡してください。",
}


class AppError(Exception):
    """アプリケーションで扱うエラー。"""

    def __init__(self, code, detail="", user_message=None):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
        self.user_message = user_message or USER_MESSAGES.get(code, USER_MESSAGES["INTERNAL_ERROR"])


def new_detail_id():
    """ログと画面を結び付ける短い ID。"""
    return uuid.uuid4().hex[:12].upper()


def error_response(error, detail_id):
    return {
        "success": False,
        "error": {
            "code": error.code,
            "userMessage": error.user_message,
            "detailId": detail_id,
        },
    }
