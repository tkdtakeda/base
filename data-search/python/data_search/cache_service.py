"""ローカルキャッシュの更新と状態管理。

更新の流れ：共有データ → 一時ファイルへコピー → 検証 → 問題がなければ置換。
失敗したときは直前の正常なキャッシュを使い続ける。
"""

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime

from . import cache_copier
from .cache_validator import open_readonly, validate_cache_file
from .errors import USER_MESSAGES, AppError


def to_iso(timestamp):
    if timestamp is None:
        return None
    return datetime.fromtimestamp(timestamp).astimezone().isoformat(timespec="seconds")


class CacheService:
    def __init__(self, config, logger):
        self.config = config
        self.logger = logger
        self.cache_path = config.cache_path
        self.temp_path = config.cache_path + config.temporary_extension
        self.state_path = config.cache_path + ".status.json"
        # 置換中に検索が走らないよう、更新と読み取りを 1 本の鍵で順番にする
        self.lock = threading.RLock()

    # ── 状態の読み書き ──
    def _read_state(self):
        try:
            with open(self.state_path, encoding="utf-8") as fp:
                return json.load(fp)
        except (OSError, ValueError):
            return {}

    def _write_state(self, state):
        os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
        temp = self.state_path + ".writing"
        with open(temp, "w", encoding="utf-8") as fp:
            json.dump(state, fp, ensure_ascii=False, indent=2)
        os.replace(temp, self.state_path)

    def cache_available(self):
        # 設定が未完了のときは、仮の値のパスに触れない
        return not self.config.incomplete and os.path.isfile(self.cache_path)

    def _require_complete(self):
        if self.config.incomplete:
            raise AppError("CONFIG_INCOMPLETE", f"placeholders: {', '.join(self.config.incomplete_settings)}")

    # ── 更新 ──
    def refresh(self):
        self._require_complete()
        with self.lock:
            self.logger.info("cache refresh started")
            state = self._read_state()
            try:
                source_mtime = cache_copier.copy_to_temp(self.config.source_path, self.temp_path)
                row_count = validate_cache_file(self.temp_path, self.config.table_name, self.config.field_mappings)
                os.makedirs(os.path.dirname(self.cache_path) or ".", exist_ok=True)
                os.replace(self.temp_path, self.cache_path)
            except AppError as error:
                cache_copier.remove_quietly(self.temp_path)
                using_previous = self.cache_available()
                self.logger.warning(
                    "cache refresh failed code=%s detail=%s using_previous=%s",
                    error.code, error.detail, using_previous,
                )
                state.update({
                    "lastRefreshSucceeded": False,
                    "lastRefreshAt": to_iso(datetime.now().timestamp()),
                    "usingPreviousCache": using_previous,
                    "errorCode": error.code,
                    "errorMessage": error.user_message,
                })
                self._write_state(state)
                raise
            except OSError as exc:
                cache_copier.remove_quietly(self.temp_path)
                raise AppError("CACHE_COPY_FAILED", f"replace failed: {exc}") from exc

            now = datetime.now().timestamp()
            state = {
                "lastRefreshSucceeded": True,
                "lastRefreshAt": to_iso(now),
                "sourceModifiedAt": to_iso(source_mtime),
                "sourceModifiedTs": source_mtime,
                "cacheUpdatedAt": to_iso(now),
                "usingPreviousCache": False,
                "rowCount": row_count,
                "errorCode": None,
                "errorMessage": None,
            }
            self._write_state(state)
            self.logger.info("cache refresh succeeded rows=%s", row_count)
            return {
                "success": True,
                "sourceModifiedAt": state["sourceModifiedAt"],
                "cacheUpdatedAt": state["cacheUpdatedAt"],
                "usingPreviousCache": False,
                "rowCount": row_count,
                "message": "キャッシュを更新しました。",
            }

    # ── 状態 ──
    def status(self):
        config_info = {
            "configSource": self.config.config_source,
            "configFile": os.path.basename(self.config.config_path),
            "configIncomplete": self.config.incomplete,
            "incompleteSettings": list(self.config.incomplete_settings),
        }
        if self.config.incomplete:
            return dict(config_info, **{
                "available": False,
                "lastRefreshSucceeded": False,
                "sourceModifiedAt": None,
                "cacheUpdatedAt": None,
                "usingPreviousCache": False,
                "message": USER_MESSAGES["CONFIG_INCOMPLETE"],
                "rowCount": None,
                "sourceReachable": None,
                "sourceHasUpdate": False,
                "lastRefreshAt": None,
                "errorCode": "CONFIG_INCOMPLETE",
                "errorMessage": USER_MESSAGES["CONFIG_INCOMPLETE"],
            })
        state = self._read_state()
        available = self.cache_available()
        current_source = cache_copier.source_modified_at(self.config.source_path)
        cached_source = state.get("sourceModifiedTs")
        has_update = bool(available and current_source and cached_source and current_source > cached_source)
        succeeded = state.get("lastRefreshSucceeded", available)

        if not available:
            message = "検索できるデータがまだありません。データを更新してください。"
        elif not succeeded:
            message = "最新のデータを取得できなかったため、前回のデータを参照しています。"
        elif has_update:
            message = "共有データに新しい更新があります。必要に応じてデータを更新してください。"
        else:
            message = "最新のキャッシュを参照しています。"

        return dict(config_info, **{
            "available": available,
            "lastRefreshSucceeded": bool(succeeded),
            "sourceModifiedAt": state.get("sourceModifiedAt"),
            "cacheUpdatedAt": state.get("cacheUpdatedAt"),
            "usingPreviousCache": bool(available and not succeeded),
            "message": message,
            "rowCount": state.get("rowCount"),
            "sourceReachable": current_source is not None,
            "sourceHasUpdate": has_update,
            "lastRefreshAt": state.get("lastRefreshAt"),
            "errorCode": None if succeeded else state.get("errorCode"),
            "errorMessage": None if succeeded else state.get("errorMessage"),
        })

    # ── 読み取り ──
    @contextmanager
    def read_connection(self):
        self._require_complete()
        with self.lock:
            if not self.cache_available():
                raise AppError("CACHE_UNAVAILABLE", "cache file not found")
            try:
                conn = open_readonly(self.cache_path)
            except sqlite3.Error as exc:
                raise AppError("CACHE_UNAVAILABLE", f"cannot open cache: {exc}") from exc
            try:
                yield conn
            finally:
                conn.close()
