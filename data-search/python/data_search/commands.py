"""Tauri Command と同じ名前・同じ入出力の命令を登録する。

命令を増やすときは @command("名前") を付けた関数を足すだけでよい（既存の処理は変えない）。
"""

from .errors import AppError

_REGISTRY = {}


def command(name):
    def decorator(func):
        _REGISTRY[name] = func
        return func
    return decorator


def command_names():
    return sorted(_REGISTRY)


def dispatch(name, context, payload):
    handler = _REGISTRY.get(name)
    if handler is None:
        raise AppError("UNKNOWN_COMMAND", f"unknown command: {name}")
    return handler(context, payload)


@command("search_lots")
def search_lots(ctx, payload):
    return ctx.lot_service.search(payload)


@command("list_lots")
def list_lots(ctx, payload):
    return ctx.lot_service.list(payload)


@command("get_filter_values")
def get_filter_values(ctx, payload):
    return ctx.lot_service.filter_values(payload)


@command("get_lot_detail")
def get_lot_detail(ctx, payload):
    return ctx.lot_service.detail(payload)


@command("refresh_cache")
def refresh_cache(ctx, payload):
    return ctx.cache_service.refresh()


@command("get_cache_status")
def get_cache_status(ctx, payload):
    return ctx.cache_service.status()


@command("get_data_source")
def get_data_source(ctx, payload):
    """今の読み込み先（共有 SQLite のパス）。手元の画面にだけ出す（ログには残さない）。"""
    return ctx.source_service.describe()


@command("test_data_source")
def test_data_source(ctx, payload):
    """接続テスト。sourcePath を省くと今の読み込み先を確かめる。コピーも書き込みもしない。"""
    return ctx.source_service.test(payload)


@command("update_data_source")
def update_data_source(ctx, payload):
    """接続テストがすべて ○ なら config.local.json に保存し、キャッシュを作り直す。"""
    return ctx.source_service.update(payload)


@command("get_view_config")
def get_view_config(ctx, payload):
    """画面の表示定義（view と、schema の論理情報）。物理名は含めない。"""
    return dict(ctx.config.public_view(), success=True)


@command("get_application_info")
def get_application_info(ctx, payload):
    return {
        "id": ctx.config.app_id,
        "name": ctx.config.app_name,
        "version": ctx.config.app_version,
    }
