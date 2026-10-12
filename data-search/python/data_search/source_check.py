"""読み込み先（共有 SQLite）の接続テスト。コピーも書き込みもせず、順に確かめて結果を返す。

    ① パスの書き方  ② 場所に届くか  ③ 読めるか  ④ SQLite として開けるか  ⑤ テーブル・列  ⑥ 件数
前の段階が × なら、後の段階は「確かめていない」（skip）にする。画面には段階ごとに 理由・対応 を出す。
△（warn）は「使えるが、保存のあとで直すことがある」（例：固定列がない → 画面で選び直す）。
△ だけなら保存できる（似た構成の別の DB へ切り替えられるように）。
ログにはパスを残さない（呼び出し側は段階の id と結果だけを記録する）。
"""

import os
import sqlite3
from datetime import datetime

from .column_model import missing_key_columns
from .query import quote_identifier
from .settings.validation import is_placeholder

SQLITE_HEADER = b"SQLite format 3\x00"

STEPS = (
    ("format", "パスの書き方"),
    ("reach", "場所に届くか"),
    ("read", "読めるか"),
    ("sqlite", "SQLite として開けるか"),
    ("table", "テーブルと列"),
    ("rows", "件数"),
)


class StepFailed(Exception):
    def __init__(self, message, action):
        super().__init__(message)
        self.message = message
        self.action = action


def normalize_path(text):
    """貼り付けたパスを整える：前後の空白と、エクスプローラーの「パスのコピー」で付く引用符を外す。"""
    value = (text or "").strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1].strip()
    return value


def resolve_path(app_root, path):
    """相対パスはアプリのルート基準（設定の読み込みと同じ）。"""
    return os.path.normpath(path if os.path.isabs(path) else os.path.join(app_root, path))


def check_source(path, table_name, model_settings, app_root):
    """段階ごとの結果 [{id, label, status: ok/warn/ng/skip, message, action}] と、まとめ {ok, rowCount, modifiedAt} を返す。
    model_settings：settings.ModelSettings（固定列があるかを確かめる）"""
    results = []
    state = {"path": normalize_path(path), "conn": None, "row_count": None, "modified": None}
    checks = {
        "format": lambda: _check_format(state, app_root),
        "reach": lambda: _check_reach(state),
        "read": lambda: _check_read(state),
        "sqlite": lambda: _check_sqlite(state),
        "table": lambda: _check_table(state, table_name, model_settings),
        "rows": lambda: _check_rows(state, table_name),
    }
    failed = False
    try:
        for step_id, label in STEPS:
            if failed:
                results.append({"id": step_id, "label": label, "status": "skip", "message": "前の段階が × のため確かめていません。", "action": ""})
                continue
            try:
                outcome = checks[step_id]()
                status, message, action = outcome if isinstance(outcome, tuple) else ("ok", outcome, "")
                results.append({"id": step_id, "label": label, "status": status, "message": message, "action": action})
            except StepFailed as failure:
                failed = True
                results.append({"id": step_id, "label": label, "status": "ng", "message": failure.message, "action": failure.action})
    finally:
        if state["conn"] is not None:
            state["conn"].close()
    return {
        "ok": not failed,
        "steps": results,
        "rowCount": state["row_count"],
        "modifiedAt": state["modified"],
        "normalizedPath": state["path"],
    }


def _check_format(state, app_root):
    path = state["path"]
    if not path:
        raise StepFailed("パスが空です。", "共有 SQLite のファイルのパスを入力してください。")
    if is_placeholder(path):
        raise StepFailed("仮の値（<...>）のままです。", "実際の共有 SQLite のパスに書き換えてください。")
    if any(ch in path for ch in "\r\n\t"):
        raise StepFailed("改行やタブが入っています。", "パスを 1 行で貼り付け直してください。")
    if path.endswith(("\\", "/")):
        raise StepFailed("フォルダのパスになっています。", "フォルダの中の SQLite ファイル（例：…\\data.sqlite3）まで指定してください。")
    state["resolved"] = resolve_path(app_root, path)
    return "書き方に問題はありません。"


def _check_reach(state):
    resolved = state["resolved"]
    folder = os.path.dirname(resolved)
    if folder and not os.path.isdir(folder):
        raise StepFailed("フォルダに届きません（ないか、ネットワークがつながっていません）。",
                         "エクスプローラーで同じフォルダを開けるか、VPN・ネットワーク・ドライブの割り当てを確認してください。")
    if os.path.isdir(resolved):
        raise StepFailed("ファイルではなくフォルダです。", "フォルダの中の SQLite ファイルまで指定してください。")
    if not os.path.isfile(resolved):
        raise StepFailed("フォルダはありますが、ファイルがありません。", "ファイル名（拡張子を含む）を確認してください。")
    state["modified"] = datetime.fromtimestamp(os.stat(resolved).st_mtime).astimezone().isoformat(timespec="seconds")
    return "ファイルがあります。"


def _check_read(state):
    try:
        with open(state["resolved"], "rb") as fp:
            state["header"] = fp.read(len(SQLITE_HEADER))
    except PermissionError:
        raise StepFailed("読む権限がありません。", "共有フォルダの読み取り権限を管理者に確認してください。") from None
    except OSError:
        raise StepFailed("ファイルを開けません（ほかのアプリが使用中か、接続が切れた可能性があります）。",
                         "少し待ってからもう一度確かめてください。") from None
    return "読めます。"


def _check_sqlite(state):
    if state.get("header") != SQLITE_HEADER:
        raise StepFailed("SQLite のファイルではありません。", "指定したファイルが共有 SQLite（.sqlite3 / .db など）か確認してください。")
    try:
        # immutable=1：共有側にロックや一時ファイルを作らず、読むだけにする
        state["conn"] = sqlite3.connect(_readonly_uri(state["resolved"]), uri=True)
        state["conn"].execute("SELECT name FROM sqlite_master LIMIT 1").fetchall()
    except sqlite3.Error:
        raise StepFailed("SQLite として開けません（壊れている可能性があります）。", "共有データの管理者に、ファイルの状態を確認してください。") from None
    return "開けます。"


def _check_table(state, table_name, model_settings):
    conn = state["conn"]
    try:
        exists = conn.execute("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", (table_name,)).fetchone()
        if not exists:
            raise StepFailed("schema の tableName のテーブルがありません。",
                             "読み込み先が正しいか、schema.local.json の tableName を確認してください。")
        columns = [row[1] for row in conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})")]
    except sqlite3.Error:
        raise StepFailed("テーブルの情報を読めません。", "共有データの管理者に、ファイルの状態を確認してください。") from None
    if not columns:
        raise StepFailed("テーブルに列がありません。", "読み込み先が正しいか確認してください。")
    missing = missing_key_columns(model_settings, columns)
    if missing:
        return ("warn", f"テーブルはあります（列は {len(columns)} 個）。固定列（レコードキー）の {'、'.join(missing)} はありません。",
                "保存してデータを更新したあと、画面左の「データ」→「固定列」で選んでください。")
    return f"テーブルと、固定列がそろっています（列は全部で {len(columns)} 個）。"


def _check_rows(state, table_name):
    try:
        state["row_count"] = state["conn"].execute(f"SELECT COUNT(*) FROM {quote_identifier(table_name)}").fetchone()[0]
    except sqlite3.Error:
        raise StepFailed("件数を数えられません。", "共有データの管理者に、ファイルの状態を確認してください。") from None
    return f"{state['row_count']:,} 件あります。"


def _readonly_uri(path):
    uri_path = os.path.abspath(path).replace("\\", "/").replace("%", "%25").replace("?", "%3F").replace("#", "%23")
    if uri_path.startswith("//"):
        uri_path = "//" + uri_path  # UNC（\\server\share）→ file:////server/share
    elif not uri_path.startswith("/"):
        uri_path = "/" + uri_path   # ドライブ文字（C:/...）
    return f"file:{uri_path}?mode=ro&immutable=1"
