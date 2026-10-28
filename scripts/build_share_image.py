#!/usr/bin/env python3
"""Render share/og-home.html to share/og-home.png (1200x630) with Chromium via Playwright.

Run: python3 scripts/build_share_image.py
The page uses only fonts installed on the machine (no network), so the output is reproducible offline.
The PNG is then losslessly re-compressed with Pillow if it is installed.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "share" / "og-home.html"
OUT = ROOT / "share" / "og-home.png"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    pg.route("**/*", lambda r: r.continue_() if r.request.url.startswith("file:") else r.abort())
    pg.goto(SRC.as_uri(), wait_until="load")
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
    b.close()

try:
    from PIL import Image
    Image.open(OUT).convert("RGB").save(OUT, optimize=True)
except Exception as e:  # Pillow is optional; the uncompressed PNG is still valid
    print("note: re-compression skipped:", e, file=sys.stderr)
print(OUT.relative_to(ROOT), OUT.stat().st_size, "bytes")
