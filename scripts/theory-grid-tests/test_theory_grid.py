#!/usr/bin/env python3
"""Browser and data tests for the Case Grid (theory-grid/).

Serves the repository root on a local port, so the page reads ../theory-chamber/data like the live site.
Google Fonts requests are aborted (the sandbox has no route to them); that is the only network call blocked.
Run:  python3 scripts/theory-grid-tests/test_theory_grid.py"""
import functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading, unittest, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
from playwright.sync_api import sync_playwright

def _load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


TC = _load("theory-chamber/data/theories.json")["items"]
G = _load("theory-grid/data/cases.json")
CASES = G["cases"]
CASE = {c["id"]: c for c in G["cases"]}
IDX = {c["id"]: i for i, c in enumerate(G["cases"])}
CLAIMS = {c["id"]: c for t in TC for sec in ("predictions", "mechanisms", "criticisms", "ai", "openQuestions", "evidence") for c in t.get(sec, [])}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def is_font_noise(msg):
    return "ERR_FAILED" in msg or "fonts.g" in msg


class GridTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = serve()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.srv.shutdown()
        cls.srv.server_close()

    def page(self, w=1280, h=900, path="/theory-grid/index.html", wait=".lens"):
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        self.addCleanup(ctx.close)
        pg = ctx.new_page()
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and not is_font_noise(m.text) else None)
        pg.route("**/fonts.g*/**", lambda r: r.abort())
        pg.goto(self.base + path)
        if wait:
            pg.wait_for_selector(wait)
        return pg

    # ---------- data ----------
    def test_01_validator_passes(self):
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts/validate_theory_grid.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_02_validator_rejects_bad_data(self):
        def run_with(mutate):
            tmp = tempfile.mkdtemp()
            try:
                shutil.copytree(os.path.join(ROOT, "theory-chamber/data"), os.path.join(tmp, "theory-chamber/data"))
                os.makedirs(os.path.join(tmp, "theory-grid/data"))
                g = json.loads(json.dumps(G))
                mutate(g)
                with open(os.path.join(tmp, "theory-grid/data/cases.json"), "w", encoding="utf-8") as fh:
                    json.dump(g, fh)
                return subprocess.run([sys.executable, os.path.join(ROOT, "scripts/validate_theory_grid.py"), tmp], capture_output=True, text=True)
            finally:
                shutil.rmtree(tmp)
        self.assertEqual(run_with(lambda g: None).returncode, 0)
        r = run_with(lambda g: g["cases"][2]["cells"]["gnwt"]["from"].append("gnwt.nope"))
        self.assertNotEqual(r.returncode, 0); self.assertIn("unknown claim", r.stdout)
        r = run_with(lambda g: g["cases"][0]["cells"].pop("iit"))
        self.assertNotEqual(r.returncode, 0); self.assertIn("no cell", r.stdout)
        r = run_with(lambda g: g["cases"][0]["cells"]["hot"].update(asks="Which theory has the highest score for a bat?"))
        self.assertNotEqual(r.returncode, 0); self.assertIn("verdict/score", r.stdout)
        r = run_with(lambda g: g["cases"][0]["cells"]["hot"].update(asks="A bat is conscious, so does it represent its states?"))
        self.assertNotEqual(r.returncode, 0)
        r = run_with(lambda g: g["cases"][1]["cells"]["pp"].update({"from": ["gnwt.pr1"]}))
        self.assertNotEqual(r.returncode, 0); self.assertIn("belongs to", r.stdout)
        r = run_with(lambda g: g["cases"][3].update(sources=["no-such-source"]))
        self.assertNotEqual(r.returncode, 0); self.assertIn("unknown source", r.stdout)

    def test_03_every_cell_has_a_question(self):
        for c in CASES:
            for t in TC:
                self.assertTrue((c["cells"][t["id"]].get("asks") or c.get("ask")), f"{c['id']}/{t['id']}")

    # ---------- rendering ----------
    def test_10_each_case_renders_six_theories(self):
        pg = self.page()
        for c in CASES:
            pg.click(f'.case-btn[data-case="{c["id"]}"]')
            self.assertEqual(pg.inner_text("#case-h"), c["name"])
            self.assertEqual(pg.locator(".lens").count(), len(TC))
            pressed = pg.eval_on_selector_all(".case-btn", "els=>els.filter(e=>e.getAttribute('aria-pressed')==='true').map(e=>e.dataset.case)")
            self.assertEqual(pressed, [c["id"]])
            self.assertEqual(pg.evaluate("location.hash"), "#case-" + c["id"])
        self.assertEqual(pg.errors, [])

    def test_11_quoted_records_match_theory_chamber_exactly(self):
        pg = self.page()
        for c in CASES:
            pg.click(f'.case-btn[data-case="{c["id"]}"]')
            for t in TC:
                lens_text = pg.eval_on_selector(f"#lens-{t['id']}", "e=>e.textContent")
                for cid in c["cells"][t["id"]].get("from", []):
                    self.assertIn(CLAIMS[cid]["text"], lens_text, f"{c['id']}/{t['id']}/{cid}")
                self.assertIn(c["cells"][t["id"]].get("asks") or "", lens_text)

    def test_12_case_level_question_shown_once_when_shared(self):
        pg = self.page(path="/theory-grid/index.html#case-image")
        shared = [c for c in CASES if c["id"] == "image"][0]["ask"]
        self.assertEqual(pg.locator(".panel > .asks").count(), 1)
        self.assertEqual(pg.inner_text(".panel > .asks").count(shared), 1)
        self.assertEqual(pg.locator(".lens .asks").count(), 0)

    def test_13_empty_pairing_says_so_and_is_not_a_result(self):
        pg = self.page(path="/theory-grid/index.html#case-bat")
        txt = pg.inner_text("#lens-gnwt")
        self.assertIn("Nothing on file for this pairing", txt)
        self.assertIn("not a published result", txt)

    def test_14_deep_link_fallback_and_hashchange(self):
        pg = self.page(path="/theory-grid/index.html#case-chatbot")
        self.assertEqual(pg.inner_text("#case-h"), CASE["chatbot"]["name"])
        pg.evaluate("location.hash='#case-thermostat'")
        pg.wait_for_function("document.querySelector('#case-h').textContent.includes('thermostat')")
        pg2 = self.page(path="/theory-grid/index.html#case-nope")
        self.assertEqual(pg2.inner_text("#case-h"), CASES[0]["name"])
        pg3 = self.page(path="/theory-grid/index.html#case-<script>")
        self.assertEqual(pg3.inner_text("#case-h"), CASES[0]["name"])
        self.assertEqual(pg3.errors, [])

    def test_15_overview_buttons_open_the_pairing(self):
        pg = self.page(path="/theory-grid/index.html#case-bat")
        self.assertEqual(pg.locator(".cellbtn").count(), len(CASES) * len(TC))
        pg.click(f'.ovt tbody tr:nth-child(1) td:nth-child({IDX["chatbot"] + 2}) .cellbtn')   # GNWT x chatbot
        self.assertEqual(pg.inner_text("#case-h"), CASE["chatbot"]["name"])
        self.assertTrue(pg.eval_on_selector("#lens-gnwt", "e=>e.classList.contains('hl')"))
        self.assertEqual(pg.evaluate("document.activeElement.id"), "lens-gnwt")
        self.assertTrue(pg.eval_on_selector("#lens-gnwt details.basis", "d=>d.open"))

    def test_16_overview_statuses_follow_the_records(self):
        pg = self.page()
        labels = pg.eval_on_selector_all(".cellbtn", "els=>els.map(e=>e.getAttribute('aria-label'))")
        self.assertTrue(any("Predictions on record" in l for l in labels))
        self.assertTrue(any("Conceptual assessment on record" in l for l in labels))
        self.assertTrue(any("Question only" in l for l in labels))
        # chatbot column is conceptual only; image/gnwt has predictions
        self.assertTrue(any(l.startswith("GNWT, Seen vs. missed: Predictions on record (3)") for l in labels))
        self.assertTrue(all("Predictions" not in l for l in labels if "A chatbot" in l))
        self.assertTrue(any(l.startswith("GNWT, Awake vs. asleep: Predictions on record (2)") for l in labels))
        self.assertTrue(any(l.startswith("IIT, Awake vs. asleep: Related records (1)") for l in labels))

    def test_17_source_lists_are_https_links_with_noopener(self):
        pg = self.page(path="/theory-grid/index.html#case-image")
        pg.eval_on_selector_all("details.read", "els=>els.forEach(d=>d.open=true)")
        links = pg.eval_on_selector_all("details.read a", "els=>els.map(a=>[a.href,a.rel,a.target])")
        self.assertGreater(len(links), 5)
        for href, rel, target in links:
            self.assertTrue(href.startswith("https://"), href)
            self.assertIn("noopener", rel); self.assertEqual(target, "_blank")

    def test_17b_sleep_case_quotes_records_and_labels_interpretation(self):
        pg = self.page(path="/theory-grid/index.html#case-sleep")
        iit = pg.eval_on_selector("#lens-iit", "e=>e.textContent")
        self.assertIn("Theoretical interpretation", iit)          # the record's own kind, not "supporting evidence"
        self.assertIn("This is the author's interpretation", iit)
        self.assertIn("Nothing on file for this pairing", pg.eval_on_selector("#lens-hot", "e=>e.textContent"))
        self.assertEqual(pg.locator(".panel > .asks").count(), 1)

    def test_17c_default_note_never_sits_under_a_pairing_that_has_records(self):
        pg = self.page()
        for c in CASES:
            pg.click(f'.case-btn[data-case="{c["id"]}"]')
            for th in TC:
                cell = c["cells"][th["id"]]
                text = pg.eval_on_selector(f"#lens-{th['id']}", "e=>e.textContent")
                if cell.get("from") and c.get("defaultNote"):
                    self.assertNotIn(c["defaultNote"], text, f"{c['id']}/{th['id']}")

    def test_18_nagel_source_is_listed_for_the_bat(self):
        pg = self.page(path="/theory-grid/index.html#case-bat")
        self.assertIn("Nagel 1974", pg.inner_text(".panel > .note"))

    # ---------- behaviour ----------
    def test_20_keyboard(self):
        pg = self.page()
        pg.focus('.case-btn[data-case="bat"]')
        pg.keyboard.press("Tab")
        self.assertEqual(pg.evaluate("document.activeElement.dataset.case"), "thermostat")
        pg.keyboard.press("Enter")
        self.assertEqual(pg.inner_text("#case-h"), CASES[1]["name"])
        self.assertEqual(pg.evaluate("document.activeElement.dataset.case"), "thermostat")   # focus stays put
        for _ in range(len(CASES)):
            pg.keyboard.press("Tab")
            if pg.evaluate("document.activeElement.id") == "surprise":
                break
        self.assertEqual(pg.evaluate("document.activeElement.id"), "surprise")
        before = pg.inner_text("#case-h")
        pg.keyboard.press("Space")
        self.assertNotEqual(pg.inner_text("#case-h"), before)
        pg.wait_for_function("document.querySelector('#live').textContent.startsWith('Showing:')")

    def test_21_surprise_never_repeats_the_current_case(self):
        pg = self.page()
        for _ in range(12):
            before = pg.inner_text("#case-h")
            pg.click("#surprise")
            self.assertNotEqual(pg.inner_text("#case-h"), before)

    def test_22_basis_open_on_desktop_closed_on_phone(self):
        d = self.page(1280, 900, "/theory-grid/index.html#case-image")
        self.assertEqual(d.locator("details.basis[open]").count(), 6)
        p = self.page(390, 844, "/theory-grid/index.html#case-image")
        self.assertEqual(p.locator("details.basis[open]").count(), 0)
        p.click("#lens-gnwt summary")
        self.assertEqual(p.locator("details.basis[open]").count(), 1)

    def test_23_phone_selecting_a_case_scrolls_to_its_results(self):
        pg = self.page(390, 844)
        pg.click('.case-btn[data-case="chatbot"]')
        pg.wait_for_timeout(600)
        top = pg.eval_on_selector("#panel", "e=>e.getBoundingClientRect().top")
        self.assertLess(top, 200)
        self.assertGreater(top, -50)

    def test_24_no_horizontal_overflow_or_errors_at_four_widths(self):
        for w in (320, 390, 820, 1280):
            pg = self.page(w, 900)
            for c in CASES:
                pg.click(f'.case-btn[data-case="{c["id"]}"]')
                pg.eval_on_selector_all("details", "els=>els.forEach(d=>d.open=true)")
                over = pg.evaluate("document.documentElement.scrollWidth-document.documentElement.clientWidth")
                self.assertLessEqual(over, 0, f"{w}px {c['id']} overflows by {over}")
            self.assertEqual(pg.errors, [], f"{w}px")

    def test_25_phone_overview_is_readable(self):
        pg = self.page(390, 844)
        cap = pg.eval_on_selector(".ovt caption", "e=>e.getBoundingClientRect().width")
        self.assertGreater(cap, 300)
        self.assertEqual(pg.eval_on_selector(".ovt thead", "e=>getComputedStyle(e).position"), "absolute")
        self.assertEqual(pg.locator(".ovt td").first.get_attribute("data-label"), CASES[0]["short"])

    def test_26_preview_mode_uses_injected_data_and_makes_no_data_requests(self):
        ctx = self.browser.new_context(viewport={"width": 1280, "height": 900}); self.addCleanup(ctx.close)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        reqs = []
        pg.on("request", lambda r: reqs.append(r.url) if r.url.endswith(".json") else None)
        pg.route("**/fonts.g*/**", lambda r: r.abort())
        with open(os.path.join(ROOT, "theory-chamber/data/sources.json"), encoding="utf-8") as fh:
            sources = json.load(fh)["items"]
        pg.add_init_script("window.__TG_DATA__=" + json.dumps({"theories": TC, "sources": sources, "grid": G}))
        pg.goto(self.base + "/theory-grid/index.html#case-chatbot"); pg.wait_for_selector(".lens")
        self.assertEqual(reqs, []); self.assertEqual(errs, [])
        self.assertEqual(pg.locator(".lens").count(), 6)

    def test_27_data_failure_shows_a_message_not_a_blank_page(self):
        ctx = self.browser.new_context(); self.addCleanup(ctx.close)
        pg = ctx.new_page()
        pg.route("**/fonts.g*/**", lambda r: r.abort())
        pg.route("**/theory-grid/data/cases.json", lambda r: r.fulfill(status=500, body="no"))
        pg.goto(self.base + "/theory-grid/index.html")
        pg.wait_for_selector('[role="alert"]')
        self.assertIn("could not load", pg.inner_text("#main"))

    def test_28_page_text_has_no_stray_placeholders(self):
        pg = self.page()
        for c in CASES:
            pg.click(f'.case-btn[data-case="{c["id"]}"]')
            body = pg.inner_text("main")
            for bad in ("null", "undefined", "NaN", "[object"):
                self.assertNotRegex(body, r"(?<![A-Za-z])" + re.escape(bad) + r"(?![A-Za-z])", f"{c['id']}: {bad}")

    def test_29_meta_and_landmarks(self):
        pg = self.page()
        robots = pg.get_attribute('meta[name="robots"]', "content")
        self.assertIn("index", robots); self.assertNotIn("noindex", robots)   # published
        self.assertEqual(pg.locator("h1").count(), 1)
        self.assertEqual(pg.locator("main").count(), 1)
        self.assertEqual(pg.locator("html").get_attribute("lang"), "en")

    # ---------- main site ----------
    def test_30_explore_menu_links_to_the_grid_on_desktop(self):
        pg = self.page(1280, 900, "/index.html", wait=".ng-b")
        pg.click('.ng-b:text-is("Explore")')
        link = pg.locator('.ng-m a[href="theory-grid/"]')
        self.assertTrue(link.is_visible())
        self.assertIn("Case Grid", link.inner_text())
        link.click()
        pg.wait_for_url("**/theory-grid/")
        pg.wait_for_selector(".lens")

    def test_31_explore_menu_links_to_the_grid_on_phone(self):
        pg = self.page(390, 844, "/index.html", wait=".nav-t")
        pg.click(".nav-t")
        link = pg.locator('.ng-m a[href="theory-grid/"]')
        link.scroll_into_view_if_needed()
        box = link.bounding_box()
        self.assertIsNotNone(box)
        self.assertGreaterEqual(box["x"], 0); self.assertLessEqual(box["x"] + box["width"], 391)
        link.click()
        pg.wait_for_url("**/theory-grid/")

    def test_32_homepage_change_is_exactly_one_added_line(self):
        r = subprocess.run(["git", "diff", "--numstat", "origin/main", "--", "index.html"], cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            self.skipTest("git diff unavailable")
        parts = r.stdout.split()
        if not parts:
            self.skipTest("homepage already matches origin/main (change merged)")
        self.assertEqual(parts[:2], ["1", "0"], r.stdout)

    def test_34_sitemaps_and_generator_list_the_grid(self):
        url = "https://amarisct.github.io/Artificially-Intelligent/theory-grid/"
        for f in ("sitemap.txt", "sitemap.xml"):
            with open(os.path.join(ROOT, f), encoding="utf-8") as fh:
                self.assertEqual(fh.read().count(url), 1, f)
        with open(os.path.join(ROOT, "scripts/build_published.py"), encoding="utf-8") as fh:
            self.assertIn('SITE + "theory-grid/"', fh.read())

    def test_35_theory_chamber_links_to_the_grid(self):
        pg = self.page(path="/theory-chamber/index.html", wait="#f-grid")
        self.assertTrue(pg.locator("#f-grid").is_visible())
        pg.click("#f-grid")
        pg.wait_for_url("**/theory-grid/")
        pg.wait_for_selector(".lens")

    def test_33_grid_links_resolve(self):
        pg = self.page(path="/theory-grid/index.html#case-image")
        hrefs = set(pg.eval_on_selector_all("main a[href], footer a[href], header a[href]", "els=>els.map(a=>a.getAttribute('href'))"))
        for h in sorted(hrefs):
            if h.startswith("https://") or h.startswith("#"):
                continue
            target = h.split("#")[0] or "./"
            path = os.path.normpath(os.path.join(ROOT, "theory-grid", target))
            self.assertTrue(os.path.exists(path), f"{h} -> {path}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
