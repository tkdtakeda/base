"""画面からの設定の変更（config/local・schema.local などへの書き込み）を、安全に動いている設定へ反映する。

流れ：書き込む（控えを .bak に残す）→ 設定を読み直して検証 → 誤りがあれば書き込みを取り消して止める
      → 誤りがなければ、動いている設定（context.config・キャッシュ・検索）を差し替える。
"""

import os

from .errors import AppError
from .settings import SettingsError, load_settings
from .settings.local_writer import local_file, restore_backup, set_local_values


def file_label(app_root, path):
    """画面に出すファイル名（アプリのルートからの相対。外にあればそのまま）。"""
    relative = os.path.relpath(path, app_root)
    return path if relative.startswith("..") else relative.replace("\\", "/")


def use_config(context, config):
    """動いている設定を差し替える。読み込み先が変わったら、前の読み込み先のキャッシュは使わない。"""
    context.config = config
    context.cache_service.use_config(config)
    context.lot_service.config = config


def save_local_values(context, app_root, local_dir, kind, values, delete=()):
    """values（{path: 値}）を <kind>.local.json に書き（delete の path は消す）、読み直して差し替える。書き込んだファイルのパスを返す。"""
    target = local_file(local_dir, kind)
    existed = os.path.isfile(target)
    try:
        set_local_values(local_dir, kind, values, delete)
    except (OSError, ValueError) as exc:
        raise AppError("SETTINGS_WRITE_FAILED", f"write failed: {type(exc).__name__}") from exc
    try:
        config = load_settings(app_root, local_dir)
    except SettingsError as error:
        restore_backup(local_dir, kind, existed)
        reasons = " / ".join(f"{issue.path}：{issue.reason}" for issue in error.issues if issue.level == "error")
        raise AppError("SETTINGS_WRITE_FAILED", "reload failed",
                       user_message=f"保存すると設定に誤りが出るため、元に戻しました（{reasons}）。") from error
    use_config(context, config)
    return target
