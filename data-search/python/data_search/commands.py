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
    # 列の決まりの印。変わったら（DB の列が増えた・固定列を変えた）画面は表示定義を読み直す
    return dict(ctx.cache_service.status(), columnsVersion=ctx.lot_service.model.version)


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
    """画面の表示定義：DB の全列（DB の列名が id・表示名）と種類、固定列、番号で探す列、注意。
    テーブル名・パスは含めない。"""
    return dict(ctx.lot_service.model.public(), success=True,
                recordSettingsFile=ctx.record_service.describe()["localFile"] if ctx.record_service else None)


@command("check_record_key")
def check_record_key(ctx, payload):
    """選んだ列の組み合わせで 1 件に決まるかを数える（保存はしない）。"""
    return ctx.record_service.check(payload)


@command("update_record_settings")
def update_record_settings(ctx, payload):
    """固定列と番号で探す列を schema.local.json に保存し、列の決まりを差し替える。"""
    return ctx.record_service.update(payload)


@command("get_application_info")
def get_application_info(ctx, payload):
    return {
        "id": ctx.config.app_id,
        "name": ctx.config.app_name,
        "version": ctx.config.app_version,
    }
