#!/usr/bin/env python3
"""Static server with HTTP Range support (like GitHub Pages / any CDN), so seeking in <audio> behaves as in production.
Python's stock http.server ignores Range, which would make seek tests misleading.
Usage: [LR_CORS=1] range_server.py ROOT PORT   (LR_CORS=1 sends CORS headers, like an object-storage bucket configured for this site)"""
import os, re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def _with_charset(ct):
    return ct + "; charset=utf-8" if ct.startswith("text/") or ct in ("application/json", "application/javascript") else ct   # like GitHub Pages and the artifact host


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def guess_type(self, path):
        return _with_charset(super().guess_type(path))

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        self._remain = None
        if not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        size = os.path.getsize(path)
        if not m: return super().send_head()
        a, b = m.group(1), m.group(2)
        if a == "": start, end = max(0, size - int(b)), size - 1
        else: start, end = int(a), int(b) if b else size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(416); self.send_header("Content-Range", f"bytes */{size}"); self.end_headers(); return None
        f = open(path, "rb"); f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remain = end - start + 1
        return f
    def copyfile(self, src, dst):
        n = self._remain
        if n is None: return super().copyfile(src, dst)
        while n > 0:
            chunk = src.read(min(65536, n))
            if not chunk: break
            try: dst.write(chunk)
            except (BrokenPipeError, ConnectionResetError): break
            n -= len(chunk)
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes"); self.send_header("Cache-Control", "no-cache")
        if os.environ.get("LR_CORS"):
            self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "Range")
            self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()

if __name__ == "__main__":
    os.chdir(sys.argv[1]); ThreadingHTTPServer(("127.0.0.1", int(sys.argv[2])), H).serve_forever()
