"""Python 版の起動口。画面を Edge などのブラウザで開き、実データ（SQLite）を検索できるようにする。

使い方:
    python python/run_server.py                              … config/local の上書きを使う
    python python/run_server.py --local-dir config/dummy     … config/local の代わりにダミー用の上書きを使う

設定の読み込み（config / schema / view それぞれ）:
    config/sample/*.sample.json を初期値にし、config/local/*.local.json があれば必要な項目だけ上書きする。
    ローカルのファイルがないことは誤りにしない。検証で誤りがあれば、対象・項目・理由・対応をすべて表示して止まる。
"""

import argparse
import os
import sys
import threading
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_search.cache_service import CacheService  # noqa: E402
from data_search.errors import AppError  # noqa: E402
from data_search.http_server import AppContext, create_server  # noqa: E402
from data_search.logging_setup import setup_logging  # noqa: E402
from data_search.lot_service import LotService  # noqa: E402
from data_search.settings import SettingsError, load_settings  # noqa: E402

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT_TRIES = 10


def parse_args():
    parser = argparse.ArgumentParser(description="対象データ検索（Python 版）")
    parser.add_argument("--local-dir", help="config/local の代わりに使う上書きフォルダ（例：config/dummy）")
    parser.add_argument("--port", type=int, help="待ち受けるポート（設定より優先）")
    parser.add_argument("--no-browser", action="store_true", help="ブラウザを自動で開かない")
    return parser.parse_args()


def print_sources(config):
    print("設定の読み込み:")
    for kind, sample, local, count in config.sources:
        override = f"{local}（{count} 項目を上書き）" if local else "なし（サンプルの値を使用）"
        print(f"  {kind:<6} {sample}  ＋ 上書き: {override}")


def print_issues(issues):
    for issue in issues:
        print()
        print(issue.format())


def bind(context, host, port):
    for candidate in range(port, port + PORT_TRIES):
        try:
            return create_server(context, os.path.join(APP_ROOT, "src"), host, candidate)
        except OSError:
            continue
    raise OSError(f"ポート {port}〜{port + PORT_TRIES - 1} がすべて使用中です")


def main():
    args = parse_args()
    local_dir = os.path.abspath(args.local_dir) if args.local_dir else None
    try:
        config = load_settings(APP_ROOT, local_dir)
    except SettingsError as error:
        errors = [issue for issue in error.issues if issue.level == "error"]
        print(f"[起動できません] 設定に誤りが {len(errors)} 件あります。")
        print_issues(error.issues)
        return 1

    print_sources(config)
    print_issues(config.warnings)

    logger = setup_logging(config.log_directory, config.log_level)
    # ログには設定の値（パス・表名・列名）を残さない。上書きの有無と件数、注意の項目名だけ
    logger.info(
        "application start id=%s version=%s overrides=%s warnings=%s",
        config.app_id, config.app_version,
        ",".join(f"{kind}:{count if local else '-'}" for kind, _, local, count in config.sources),
        ",".join(f"{w.file}#{w.path}" for w in config.warnings) or "-",
    )
    cache_service = CacheService(config, logger)
    context = AppContext(config, cache_service, LotService(config, cache_service, logger), logger)

    has_cache = os.path.isfile(config.cache_path)
    if has_cache and not cache_service.verify_existing():
        print("手元のキャッシュが今の schema（テーブル名・列名）と合わないため、作り直します…")
    if not cache_service.cache_available():
        if not has_cache:
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
