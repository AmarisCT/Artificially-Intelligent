#!/usr/bin/env python3
"""Tests for the share image, newsletter button, footer link to the Research Commons and the analytics hook.

Run: python3 scripts/trust-tests/test_trust_and_sharing.py
Needs Chromium via Playwright. Nothing here contacts the live site, Substack or GoatCounter: the browser is given
a pretend host and every outside request is answered by the test itself.
"""
import mimetypes
import pathlib
import re
import struct
import unittest

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = "https://amarisct.github.io/Artificially-Intelligent/"
HOST = "http://example.test"
PAGES = ["index.html", "research/published/index.html"] + sorted(
    str(p.relative_to(ROOT)) for p in (ROOT / "research" / "published").glob("*/index.html")
)


def png_size(path):
    d = path.read_bytes()
    assert d[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", d[16:24])


def meta(html, key, attr="property"):
    m = re.search(r'<meta %s="%s" content="([^"]*)"' % (attr, re.escape(key)), html)
    return m.group(1) if m else None


class StaticTests(unittest.TestCase):
    def test_share_image_is_a_real_1200x630_png_that_is_small_enough(self):
        f = ROOT / "share" / "og-home.png"
        self.assertEqual(png_size(f), (1200, 630))
        self.assertLess(f.stat().st_size, 1_000_000)

    def test_every_public_page_with_a_share_card_uses_the_large_card_and_a_real_image(self):
        self.assertGreaterEqual(len(PAGES), 4)
        for rel in PAGES:
            html = (ROOT / rel).read_text(encoding="utf-8")
            img = meta(html, "og:image")
            self.assertTrue(img and img.startswith(SITE), rel)
            self.assertTrue((ROOT / img[len(SITE):]).is_file(), rel + " points at a file that does not exist")
            self.assertEqual(meta(html, "twitter:card", "name"), "summary_large_image", rel)
            self.assertEqual(meta(html, "twitter:image", "name"), img, rel)
            self.assertEqual(meta(html, "og:image:width"), "1200", rel)
            self.assertEqual(meta(html, "og:image:height"), "630", rel)
            self.assertTrue(meta(html, "og:image:alt") and meta(html, "twitter:image:alt", "name"), rel + " needs alt text")
            self.assertEqual(html.count('property="og:image"'), 1, rel)

    def test_share_image_alt_text_says_what_the_picture_is(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        alt = meta(html, "og:image:alt")
        self.assertIn("Artificially Intelligent", alt)
        self.assertIn("consciousness", alt)

    def test_article_pages_offer_the_newsletter_and_load_the_analytics_file(self):
        for rel in PAGES[2:]:
            html = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("artificialxintelligence.substack.com/subscribe", html, rel)
            self.assertIn('rel="noopener noreferrer"', html, rel)
            self.assertIn("analytics.js", html, rel)

    def test_footer_has_one_link_to_the_commons_and_it_exists(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        foot = html[html.index('<footer class="ftr">'):]
        self.assertEqual(foot.count('href="research-commons/"'), 1)
        self.assertTrue((ROOT / "research-commons" / "index.html").is_file())
        # decided: footer only. It must not appear in the main menu.
        menu = html[html.index('id="nav-groups"'):html.index('</nav>')]
        self.assertNotIn("research-commons", menu)

    def test_the_commons_page_loads_no_analytics(self):
        html = (ROOT / "research-commons" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("analytics", html.lower())
        self.assertNotIn("goatcounter", html.lower())

    def test_analytics_ships_switched_off(self):
        js = (ROOT / "analytics.js").read_text(encoding="utf-8")
        self.assertRegex(js, r"var CODE = null;")


class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def page(self, patched_code=None, dnt=False, host=HOST, mobile=False):
        ctx = self.browser.new_context(viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 800}, is_mobile=mobile)
        seen = {"external": [], "counted": []}

        def handle(route):
            url = route.request.url
            if url.startswith(host):
                p = url[len(host):].split("?")[0].split("#")[0]
                f = ROOT / p.lstrip("/")
                if f.is_dir():
                    f = f / "index.html"
                if not f.is_file():
                    return route.fulfill(status=404, body="not found")
                body = f.read_bytes()
                if p.endswith("analytics.js") and patched_code:
                    body = body.replace(b"var CODE = null;", ('var CODE = "%s";' % patched_code).encode())
                return route.fulfill(status=200, body=body, content_type=mimetypes.guess_type(str(f))[0] or "text/plain")
            if "gc.zgo.at/count.js" in url:
                seen["external"].append(url)
                return route.fulfill(status=200, content_type="application/javascript",
                                     body="window.goatcounter.count=function(v){(window.__gc=window.__gc||[]).push(v)};")
            if "fonts.g" in url:
                return route.abort()
            seen["external"].append(url)
            route.abort()

        ctx.route("**/*", handle)
        if dnt:
            ctx.add_init_script("Object.defineProperty(navigator,'doNotTrack',{get:()=>'1'})")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        return ctx, pg, seen, errs

    def test_homepage_main_button_is_the_newsletter(self):
        ctx, pg, seen, errs = self.page()
        pg.goto(HOST + "/index.html")
        pg.wait_for_selector(".hero .btn.primary")
        prim = pg.locator(".hero .btn.primary")
        self.assertEqual(prim.count(), 1)
        self.assertIn("Get new research by email", prim.inner_text())
        self.assertEqual(prim.get_attribute("href"), "https://artificialxintelligence.substack.com/subscribe")
        self.assertEqual(prim.get_attribute("target"), "_blank")
        self.assertIn("noopener", prim.get_attribute("rel"))
        # the other ways in are still there
        txt = pg.locator(".hero").inner_text()
        for label in ("Begin an inquiry", "Enter the Research Atlas", "Read the research", "Architect login"):
            self.assertIn(label, txt)
        self.assertEqual(errs, [])
        ctx.close()

    def test_newsletter_button_also_on_the_reader_and_footer_link_works(self):
        ctx, pg, seen, errs = self.page()
        pg.goto(HOST + "/index.html#read-we-are-all-archives-now")
        try:
            pg.wait_for_selector(".rail .btn.primary", timeout=8000)
            self.assertEqual(pg.locator(".rail .btn.primary").get_attribute("href"),
                             "https://artificialxintelligence.substack.com/subscribe")
        except Exception:
            # the reader needs the published manifest; it is served from the repo here, so this must work
            raise
        pg.goto(HOST + "/index.html")
        pg.wait_for_selector(".ftr")
        pg.click('.ftr a[href="research-commons/"]')
        pg.wait_for_url("**/research-commons/")
        self.assertIn("Research Commons", pg.title())
        ctx.close()

    def test_analytics_off_makes_no_outside_request(self):
        ctx, pg, seen, errs = self.page()
        pg.goto(HOST + "/index.html")
        pg.wait_for_timeout(600)
        pg.evaluate("location.hash='#library'")
        pg.wait_for_timeout(300)
        self.assertEqual(seen["external"], [])
        self.assertFalse(pg.evaluate("'goatcounter' in window"))
        self.assertEqual(errs, [])
        ctx.close()

    def test_analytics_on_counts_the_page_and_each_route_once(self):
        ctx, pg, seen, errs = self.page(patched_code="demo-site")
        pg.goto(HOST + "/index.html")
        pg.wait_for_function("window.__gc && window.__gc.length>=1")
        self.assertEqual(pg.evaluate("window.goatcounter.endpoint"), "https://demo-site.goatcounter.com/count")
        self.assertEqual(pg.evaluate("document.querySelector('script[src*=\"gc.zgo.at\"]').getAttribute('data-goatcounter')"), "https://demo-site.goatcounter.com/count")
        pg.evaluate("location.hash='#library'")
        pg.wait_for_function("window.__gc.length>=2")
        paths = [c["path"] for c in pg.evaluate("window.__gc")]
        self.assertEqual(paths[0], "/index.html")
        self.assertEqual(paths[1], "/index.html#library")
        self.assertEqual(len(seen["external"]), 1)
        self.assertEqual(errs, [])
        ctx.close()

    def test_analytics_on_static_article_counts_without_hash_tracking(self):
        ctx, pg, seen, errs = self.page(patched_code="demo-site")
        pg.goto(HOST + "/research/published/we-are-all-archives-now/")
        pg.wait_for_function("window.__gc && window.__gc.length>=1")
        pg.evaluate("location.hash='#x'")
        pg.wait_for_timeout(300)
        self.assertEqual(pg.evaluate("window.__gc.length"), 1)
        self.assertEqual(pg.evaluate("window.__gc[0].path"), "/research/published/we-are-all-archives-now/")
        ctx.close()

    def test_do_not_track_and_local_hosts_are_never_counted(self):
        ctx, pg, seen, errs = self.page(patched_code="demo-site", dnt=True)
        pg.goto(HOST + "/index.html")
        pg.wait_for_timeout(700)
        self.assertEqual(seen["external"], [])
        ctx.close()
        # a local address is never counted either
        ctx = self.browser.new_context()
        calls = []
        ctx.route("**/*", lambda r: (calls.append(r.request.url), r.abort())[1] if "gc.zgo.at" in r.request.url else r.fulfill(
            status=200, content_type=mimetypes.guess_type(r.request.url)[0] or "text/html",
            body=(ROOT / "analytics.js").read_bytes().replace(b"var CODE = null;", b'var CODE = "demo-site";')
            if r.request.url.endswith("analytics.js") else b"<!doctype html><title>x</title><script src='/analytics.js'></script>"))
        pg = ctx.new_page()
        pg.goto("http://localhost:9/")
        pg.wait_for_timeout(500)
        self.assertEqual([c for c in calls if "gc.zgo.at" in c], [])
        ctx.close()

    def test_a_malformed_site_code_is_ignored(self):
        ctx, pg, seen, errs = self.page(patched_code="bad code\"><script>")
        pg.goto(HOST + "/index.html")
        pg.wait_for_timeout(500)
        self.assertEqual(seen["external"], [])
        ctx.close()


if __name__ == "__main__":
    unittest.main(verbosity=1)
