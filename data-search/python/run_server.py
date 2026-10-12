"""Python 版の起動口。画面を Edge などのブラウザで開き、実データ（SQLite）を検索できるようにする。

使い方:
    python python/run_server.py                       … config/config.local.json を使う
    python python/run_server.py --config config/config.dummy.json
"""

import argparse
import os
import sys
import threading
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_search.cache_service import CacheService  # noqa: E402
from data_search.config_loader import load_config  # noqa: E402
from data_search.errors import AppError  # noqa: E402
from data_search.http_server import AppContext, create_server  # noqa: E402
from data_search.logging_setup import setup_logging  # noqa: E402
from data_search.lot_service import LotService  # noqa: E402

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT_TRIES = 10


def parse_args():
    parser = argparse.ArgumentParser(description="対象データ検索（Python 版）")
    parser.add_argument("--config", default=os.path.join(APP_ROOT, "config", "config.local.json"))
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
    try:
        config = load_config(args.config)
    except AppError as error:
        print(f"[起動できません] {error.user_message}")
        print(f"  詳細: {error.detail}")
        return 1

    logger = setup_logging(config.log_directory, config.log_level)
    logger.info("application start id=%s version=%s", config.app_id, config.app_version)
    cache_service = CacheService(config, logger)
    context = AppContext(config, cache_service, LotService(config, cache_service, logger), logger)

    if not cache_service.cache_available():
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
