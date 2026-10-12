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


@command("get_lot_detail")
def get_lot_detail(ctx, payload):
    return ctx.lot_service.detail(payload)


@command("refresh_cache")
def refresh_cache(ctx, payload):
    return ctx.cache_service.refresh()


@command("get_cache_status")
def get_cache_status(ctx, payload):
    return ctx.cache_service.status()


@command("get_application_info")
def get_application_info(ctx, payload):
    return {
        "id": ctx.config.app_id,
        "name": ctx.config.app_name,
        "version": ctx.config.app_version,
    }
