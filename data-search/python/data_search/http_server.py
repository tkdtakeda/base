"""画面（src/）の配信と、命令（POST /api/<命令名>）の受付を行うローカル専用サーバー。

・127.0.0.1 だけで待ち受け、ほかの PC からは接続させない。
・Host / Origin を確かめ、ほかのサイトから命令を呼ばれないようにする。
・ファイルの配信は src/ の中だけに限る（任意のファイルパスは受け付けない）。
"""

import json
import os
from dataclasses import dataclass
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from . import commands
from .errors import AppError, error_response, new_detail_id

MAX_BODY_BYTES = 64 * 1024
API_PREFIX = "/api/"

# Windows のレジストリ次第で .js が text/plain になるのを防ぐ
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
}


@dataclass
class AppContext:
    config: object
    cache_service: object
    lot_service: object
    logger: object
    source_service: object = None   # 読み込み先の確認・変更（SourceService）。作成後に入れる


class RequestHandler(SimpleHTTPRequestHandler):
    extensions_map = CONTENT_TYPES
    server_version = "DataSearchDev"
    sys_version = ""

    def __init__(self, *args, context=None, **kwargs):
        self.context = context
        super().__init__(*args, **kwargs)

    # ── 共通 ──
    def _allowed_hosts(self):
        port = self.server.server_address[1]
        return {f"127.0.0.1:{port}", f"localhost:{port}"}

    def _host_ok(self):
        return self.headers.get("Host", "") in self._allowed_hosts()

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        return origin.split("://", 1)[-1] in self._allowed_hosts()

    def _send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _send_error_json(self, status, code, detail):
        detail_id = new_detail_id()
        self.context.logger.warning("request rejected id=%s code=%s detail=%s", detail_id, code, detail)
        self._send_json(status, error_response(AppError(code, detail), detail_id))

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        # フォルダの中身の一覧は見せない
        self.send_error(404)
        return None

    def log_message(self, fmt, *args):
        self.context.logger.debug("http " + fmt, *args)

    # ── 画面の配信 ──
    def do_GET(self):
        if not self._host_ok():
            self.send_error(403)
            return
        if self.path.startswith(API_PREFIX):
            self.send_error(405)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._host_ok():
            self.send_error(403)
            return
        super().do_HEAD()

    # ── 命令の受付 ──
    def do_POST(self):
        if not self._host_ok() or not self._origin_ok():
            self._send_error_json(403, "INVALID_REQUEST", "host or origin not allowed")
            return
        if not self.path.startswith(API_PREFIX):
            self._send_error_json(404, "UNKNOWN_COMMAND", "not an api path")
            return
        name = self.path[len(API_PREFIX):].split("?", 1)[0]
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY_BYTES:
            self._send_error_json(413, "INVALID_REQUEST", "body too large")
            return
        if "application/json" not in self.headers.get("Content-Type", ""):
            self._send_error_json(415, "INVALID_REQUEST", "content-type must be application/json")
            return
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._send_error_json(400, "INVALID_REQUEST", "invalid json")
            return

        try:
            result = commands.dispatch(name, self.context, payload)
            self._send_json(200, result)
        except AppError as error:
            detail_id = new_detail_id()
            self.context.logger.warning(
                "command failed id=%s command=%s code=%s detail=%s", detail_id, name, error.code, error.detail
            )
            status = 404 if error.code == "UNKNOWN_COMMAND" else 200
            self._send_json(status, error_response(error, detail_id))
        except Exception:  # noqa: BLE001 - 想定外の例外も利用者向けの形にして返す
            detail_id = new_detail_id()
            self.context.logger.exception("unexpected error id=%s command=%s", detail_id, name)
            self._send_json(500, error_response(AppError("INTERNAL_ERROR"), detail_id))


def create_server(context, static_dir, host, port):
    handler = partial(RequestHandler, context=context, directory=os.path.abspath(static_dir))
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    return server
