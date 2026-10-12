"""Python 版の起動口。画面を Edge などのブラウザで開き、実データ（SQLite）を検索できるようにする。

使い方:
    python python/run_server.py                       … config.sample.json を初期値に、config.local.json（あれば）で上書き
    python python/run_server.py --config config/config.dummy.json   … config.local.json の代わりに指定のファイルで上書き

config.local.json には、変えたい項目だけを書けばよい（書いていない項目は config.sample.json の値を使う）。
"""

import argparse
import os
import sys
import threading
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_search.cache_service import CacheService  # noqa: E402
from data_search.config_loader import LOCAL_FILE_NAME, SCHEMA_FILE_NAME, load_config, resolve_override_path  # noqa: E402
from data_search.errors import AppError  # noqa: E402
from data_search.http_server import AppContext, create_server  # noqa: E402
from data_search.logging_setup import setup_logging  # noqa: E402
from data_search.lot_service import LotService  # noqa: E402

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT_TRIES = 10


def parse_args():
    parser = argparse.ArgumentParser(description="対象データ検索（Python 版）")
    parser.add_argument("--config", help=f"{LOCAL_FILE_NAME} の代わりに上書きに使う設定ファイル")
    parser.add_argument("--port", type=int, help="待ち受けるポート（設定ファイルより優先）")
    parser.add_argument("--no-browser", action="store_true", help="ブラウザを自動で開かない")
    return parser.parse_args()


def bind(context, host, port):
    for candidate in range(port, port + PORT_TRIES):
        try:
            return create_server(context, os.path.join(APP_ROOT, "src"), host, candidate)
        except OSError:
            continue
    raise OSError(f"ポート {port}〜{port + PORT_TRIES - 1} がすべて使用中です")


def main():
    args = parse_args()
    config_dir = os.path.join(APP_ROOT, "config")
    override_path = resolve_override_path(config_dir, args.config)
    print(f"設定の初期値: {os.path.join(config_dir, SCHEMA_FILE_NAME)}")
    print(f"上書き      : {override_path or f'なし（{LOCAL_FILE_NAME} がないため初期値だけで起動）'}")
    try:
        config = load_config(config_dir, override_path)
    except AppError as error:
        print(f"[起動できません] {error.user_message}")
        for line in str(error.detail).splitlines():
            print(f"  ・{line}")
        return 1
    if override_path:
        print(f"  上書きした項目: {len(config.overridden_keys)} 個")
    if config.ignored_keys:
        print(f"  [注意] 次の項目は {SCHEMA_FILE_NAME} にないため使いませんでした（書き間違いの可能性）:")
        for key in config.ignored_keys:
            print(f"    ・{key}")

    logger = setup_logging(config.log_directory, config.log_level)
    logger.info(
        "application start id=%s version=%s source=%s overridden=%d ignored=%s",
        config.app_id, config.app_version, config.config_source, len(config.overridden_keys), ",".join(config.ignored_keys) or "-",
    )
    cache_service = CacheService(config, logger)
    context = AppContext(config, cache_service, LotService(config, cache_service, logger), logger)

    if config.incomplete:
        logger.info("config incomplete source=%s settings=%s", config.config_source, ",".join(config.incomplete_settings))
        print("[設定が未完了] 次の項目が仮の値（<...>）のままのため、データは表示できません。")
        for path in config.incomplete_settings:
            print(f"  ・{path}")
        print(f"  → config/{LOCAL_FILE_NAME} に上の項目の実際の値を書いてから起動し直してください（ほかの項目は書かなくてよい）。")
        print("  → 実データなしで試すときは start-dummy.bat を使ってください。")
    elif not cache_service.cache_available():
        print("初回のため、共有データからキャッシュを作成しています…")
        try:
            result = cache_service.refresh()
            print(f"  完了：{result['rowCount']:,} 件")
        except AppError as error:
            print(f"  失敗：{error.user_message}（画面の「データ」から再度更新できます）")

    try:
        server = bind(context, config.server_host, args.port or config.server_port)
    except OSError as exc:
        print(f"[起動できません] {exc}")
        return 1

    url = f"http://{config.server_host}:{server.server_address[1]}/"
    print(f"{config.app_name} {config.app_version} を起動しました： {url}")
    print("このウィンドウを閉じるか Ctrl+C で終了します。")
    if config.open_browser and not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        logger.info("application stop")
    return 0


if __name__ == "__main__":
    sys.exit(main())
