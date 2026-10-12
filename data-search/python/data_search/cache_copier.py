"""共有 SQLite を一時ファイルへコピーする。共有側には書き込まない。"""

import os
import shutil
import sqlite3

from .errors import AppError

SIDE_FILE_SUFFIXES = ("-wal",)


def source_modified_at(source_path):
    """共有データの更新時刻（UNIX 秒）。接続できなければ None。"""
    try:
        return os.stat(source_path).st_mtime
    except OSError:
        return None


def remove_quietly(path):
    for target in (path, path + "-wal", path + "-shm", path + "-journal"):
        try:
            os.remove(target)
        except FileNotFoundError:
            pass
        except OSError:
            pass


def copy_to_temp(source_path, temp_path):
    """共有データを temp_path へコピーし、コピー開始時の共有データの更新時刻を返す。

    コピー中に共有データが更新された場合は、中途半端な状態を避けるため失敗とする。
    """
    before = source_modified_at(source_path)
    if before is None or not os.path.isfile(source_path):
        raise AppError("SOURCE_UNAVAILABLE", f"source not reachable: {source_path}")

    os.makedirs(os.path.dirname(temp_path) or ".", exist_ok=True)
    remove_quietly(temp_path)
    try:
        shutil.copyfile(source_path, temp_path)
        for suffix in SIDE_FILE_SUFFIXES:
            if os.path.isfile(source_path + suffix):
                shutil.copyfile(source_path + suffix, temp_path + suffix)
    except OSError as exc:
        remove_quietly(temp_path)
        raise AppError("CACHE_COPY_FAILED", f"copy failed: {exc}") from exc

    if source_modified_at(source_path) != before:
        remove_quietly(temp_path)
        raise AppError("SOURCE_BUSY", "source modified during copy")

    _merge_wal(temp_path)
    return before


def _merge_wal(temp_path):
    """WAL を一緒にコピーした場合は一時ファイルへ取り込み、キャッシュを 1 ファイルにする。"""
    if not os.path.isfile(temp_path + "-wal"):
        return
    try:
        conn = sqlite3.connect(temp_path)
        try:
            conn.execute("PRAGMA journal_mode=DELETE")
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        # 壊れている場合は検証で弾く
        pass
