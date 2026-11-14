"""Serve the Skylab Phoenix dashboard locally without browser caching.

Usage: python scripts/serve.py [port]   ->  http://127.0.0.1:8765
"""
import functools
import http.server
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web"


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCache, directory=str(WEB))
    print(f"Skylab Phoenix dashboard -> http://127.0.0.1:{port}")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
