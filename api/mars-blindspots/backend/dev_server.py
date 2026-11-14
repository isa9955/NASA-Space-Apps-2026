"""Local API server for the UI (no Azure tooling needed).

    cd api/mars-blindspots
    python -m backend.dev_server            # http://localhost:7071/api/region

Then in ui/: `npm run dev:live` (proxies /api to this server).
"""
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from . import api_service

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 7071


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        url = urlsplit(self.path)
        t0 = time.perf_counter()
        status, ctype, body = api_service.handle(url.path, url.query)
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if ctype == "application/json" else "max-age=300")
        self.end_headers()
        self.wfile.write(body)
        print(f"{status} {url.path} {(time.perf_counter() - t0) * 1000:.0f} ms", flush=True)

    def log_message(self, *args):  # quieter than the default access log
        pass


if __name__ == "__main__":
    print("Loading Deuteronilus data…", flush=True)
    t0 = time.perf_counter()
    api_service.get_site()
    print(f"Ready in {time.perf_counter() - t0:.1f} s. Serving http://localhost:{PORT}/api/region", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
