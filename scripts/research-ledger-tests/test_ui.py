#!/usr/bin/env python3
"""Browser tests for /research-ledger/. Run: python3 scripts/research-ledger-tests/test_ui.py

Serves the repository folder on a local port and drives it with Playwright (Chromium). It checks the real public
page (no demonstration data), then the private preview page with the fictional demonstration switched on.
It needs no internet: fonts are blocked on purpose so the page must work with its fallback fonts.
"""
from __future__ import annotations

import functools
import http.server
import json
import pathlib
import re
import sys
import tempfile
import threading
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build_ledger_preview as P  # noqa: E402
import ledger_lib as L  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def start_server():
    handler = functools.partial(Quiet, directory=str(L.ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


SRV = None
PW = None
BROWSER = None
PREVIEW_FILE = None
TMP = None


def setUpModule():
    global SRV, PW, BROWSER, PREVIEW_FILE, TMP
    SRV = start_server()
    TMP = tempfile.TemporaryDirectory(prefix="ledger-ui-")
    PREVIEW_FILE = pathlib.Path(TMP.name) / "preview.html"
    PREVIEW_FILE.write_text(P.artifact_html(P.build_bundle()), encoding="utf-8")
    PW = sync_playwright().start()
    BROWSER = PW.chromium.launch()


def tearDownModule():
    BROWSER.close()
    PW.stop()
    SRV.shutdown()
    TMP.cleanup()


class UI(unittest.TestCase):
    width = 1280
    preview = False

    def setUp(self):
        self.ctx = BROWSER.new_context(viewport={"width": self.width, "height": 900})
        self.ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(6000)
        self.problems = []
        self.page.on("pageerror", lambda e: self.problems.append(("pageerror", str(e))))
        self.page.on("console", lambda m: self.problems.append((m.type, m.text)) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
        self.addCleanup(self.ctx.close)
        self.addCleanup(lambda: self.assertEqual(self.problems, [], "the page raised errors"))

    def open(self, route="home"):
        url = f"http://127.0.0.1:{SRV.server_address[1]}/research-ledger/" if not self.preview else f"file://{PREVIEW_FILE}"
        self.page.goto(url)
        self.page.wait_for_selector("main h1")
        if route != "home":
            self.go(route)
        return self.page

    def go(self, route):
        self.page.evaluate(f"location.hash = {json.dumps(route)}")
        self.page.wait_for_timeout(250)

    def text(self, sel="main"):
        # text_content ignores CSS text-transform, so labels set in capitals on screen are matched as written in the source
        return self.page.text_content(sel)


class TestPublicPage(UI):
    def test_home_has_the_required_text_and_no_demonstration_controls(self):
        p = self.open()
        t = self.text()
        self.assertEqual(p.inner_text("main h1"), "THE RESEARCH LEDGER")
        for needle in ("An open record of sources, revisions, and the evolving life of research.",
                       "Knowledge is not static. Its development should remain visible.",
                       "Research does not end when it is published.",
                       "Its purpose is not to present knowledge as final, but to preserve an accountable record of how understanding changes."):
            self.assertIn(needle, t)
        self.assertEqual(p.query_selector_all("#demo-toggle"), [])
        self.assertNotIn("Private preview", t)
        self.assertNotIn("Demonstration", t)

    def test_all_seven_required_sections_have_a_working_view(self):
        self.open()
        for label, h1 in (("Publication Records", "Publication Records"), ("Evidence Registry", "Evidence Registry"), ("Revision History", "Revision History"),
                          ("Corrections & Clarifications", "Corrections & Clarifications"), ("Review Status", "Review Status"),
                          ("Editorial Methodology", "EDITORIAL METHODOLOGY"), ("Research Timeline", "THE RESEARCH TIMELINE")):
            self.page.click(f"nav.tabs >> text={label}")
            self.page.wait_for_timeout(200)
            self.assertEqual(self.page.inner_text("main h1"), h1, label)

    def test_publication_record_has_sections_a_to_h_and_distinct_dates(self):
        self.open("publication-PUB-001")
        heads = self.page.eval_on_selector_all("main h2", "els => els.map(e => e.textContent)")
        for letter, name in zip("ABCDEFGH", ["Publication Overview", "Source Registry", "Evidence and Interpretation", "Editorial Review", "Revision History", "Corrections and Clarifications", "Research Context", "Open Questions"]):
            self.assertTrue(any(h.startswith(letter) and name in h for h in heads), f"{letter} {name} missing from {heads}")
        t = self.text()
        self.assertIn("October 7, 2026", t)       # publication date
        self.assertIn("Entered in the Ledger", t)
        self.assertIn("October 17, 2026", t)      # ledger date
        self.assertIn("Version history for this publication begins October 17, 2026", t)

    def test_exact_empty_state_wording(self):
        self.open("publication-PUB-001")
        t = self.text()
        self.assertIn("No documented revisions are available for this publication.", t)
        self.assertIn("No formal corrections have been recorded in this Ledger.", t)
        self.assertIn("This does not mean the publication contains no errors.", t)
        self.go("corrections")
        self.assertIn("No formal corrections have been recorded in this Ledger.", self.text())

    def test_no_review_or_verification_is_overstated(self):
        self.open("publication-PUB-002")
        t = self.text().lower()
        self.assertIn("awaiting editorial review", t)
        self.assertNotIn("peer reviewed", t)
        self.assertNotIn("verified by", t)
        self.go("evidence")
        t = self.text()
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        self.assertEqual([s["id"] for s in led["sources"] if s["verification"]["level"] in ("full-source-reviewed", "editorial-interpretation-reviewed")], [],
                         "no source may claim a full or interpretive review until a person has done one")

    def test_source_filter_counts_match_the_data(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        n_inc = sum(1 for s in led["sources"] if s["verification"]["level"] == "verification-incomplete")
        self.open("evidence")
        self.page.select_option("select >> nth=0", "verification-incomplete")
        self.page.wait_for_timeout(200)
        self.assertIn(f"{n_inc} sources shown of {len(led['sources'])}", self.text())
        self.assertEqual(len(self.page.query_selector_all("table.ledger tbody tr")), n_inc)

    def test_claims_view_filters_by_classification(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        n_emp = sum(1 for c in led["claims"] if c["classification"] == "empirical")
        self.open("evidence")
        self.page.click("button:has-text('Claims')")
        self.page.click("button.chip:has-text('Empirical Claim')")
        self.page.wait_for_timeout(200)
        self.assertEqual(len(self.page.query_selector_all("table.ledger tbody tr")), n_emp)
        self.assertIn("not a measure of truth or credibility", self.text())

    def test_source_inspector_separates_verification_from_support(self):
        self.open("source-SRC-010")
        t = self.text()
        self.assertIn("THE EVIDENCE INSPECTOR", t)
        self.assertIn("Abstract Reviewed", t)
        self.assertIn("Bibliographic verification and interpretation review are different", t)
        self.assertIn("No human editor has re-checked this", t)
        self.assertIn("Not checked. The Ledger has not looked for a retraction", t)

    def test_claim_trace_says_support_was_not_assessed(self):
        self.open("claim-CLM-001")
        t = self.text()
        self.assertIn("TRACE THE CLAIM", t)
        self.assertIn("This is a draft.", t)
        self.assertIn("Nobody has compared this passage with this source", t)
        self.page.wait_for_function("document.querySelector('#c-revstat').textContent.indexOf('checking') < 0")
        self.assertIn("unchanged since the baseline", self.text("#c-revstat"))

    def test_compare_with_one_version_is_honest(self):
        self.open("compare-PUB-001")
        t = self.text()
        self.assertIn("There is nothing to compare yet.", t)
        self.assertIn("Version history begins October 17, 2026", t)

    def test_timeline_shows_only_recorded_events_and_filters(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        self.open("timeline")
        self.assertIn(f"{len(led['timeline'])} events shown of {len(led['timeline'])}", self.text())
        self.page.select_option("select >> nth=1", "publication")
        self.page.wait_for_timeout(200)
        n = sum(1 for e in led["timeline"] if e["kind"] == "publication")
        self.assertIn(f"{n} events shown", self.text())
        self.assertEqual(len(self.page.query_selector_all("ol.tl > li")), n)
        self.assertIn("Publication date", self.text("ol.tl"))

    def test_integrity_numbers_equal_the_records_and_there_is_no_score(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        self.open("integrity")
        t = self.text()
        I = led["integrity"]
        for n, label in ((I["publications"], "published original essays"), (I["sources"], "recorded sources"), (I["claims"], "mapped claims"), (I["corrections"], "published corrections")):
            self.assertRegex(t, rf"(?<!\d){n}\s*{label}")
        self.assertNotRegex(t.lower(), r"(accuracy|quality|credibility|trust) (score|rating|index)")
        self.assertIn("Zero corrections does not mean perfect accuracy", t)

    def test_methodology_marks_no_section_as_approved_and_hides_owner_drafts(self):
        self.open("methodology")
        t = self.text()
        self.assertIn("0 of 11 sections are approved standards", t)
        self.assertEqual(self.page.query_selector_all("details.owner"), [])
        self.assertNotIn("Decisions needed from the owner", t)

    def test_life_of_an_idea_is_a_map_of_records_and_admits_gaps(self):
        self.open("idea")
        t = self.text()
        self.assertIn("It is not a narrative", t)
        self.assertIn("Not yet documented", t)
        self.assertIn("No newer research has been reviewed", t)

    def test_global_search_finds_records_and_admits_no_match(self):
        self.open()
        self.page.fill("#q-all", "turing")
        self.page.wait_for_timeout(200)
        self.assertRegex(self.text(), r"\d+ results?")
        self.page.fill("#q-all", "zzzzqqq")
        self.page.wait_for_timeout(200)
        self.assertIn("No records match.", self.text())

    def test_unknown_record_ids_show_a_not_found_page(self):
        self.open("publication-PUB-999")
        self.assertEqual(self.page.inner_text("main h1"), "Record not found")
        self.go("source-<script>alert(1)</script>")
        self.assertEqual(self.page.inner_text("main h1"), "Record not found")
        self.assertNotIn("<script>", self.page.inner_html("main"))


class TestConcernComposer(UI):
    def fill_and_prepare(self, text="The second citation points to a page that has moved."):
        self.page.select_option("#cn-type", "Broken source link")
        self.page.fill("#cn-det", text)
        self.page.click("button:has-text('Prepare my message')")
        self.page.wait_for_timeout(200)

    def test_without_a_service_nothing_is_sent_and_it_says_so(self):
        reqs = []
        self.ctx.on("request", lambda r: reqs.append(r) if r.method == "POST" else None)
        self.open("concern")
        self.assertIn("This form cannot send anything yet.", self.text())
        self.fill_and_prepare()
        t = self.text()
        self.assertIn("Nothing has been sent.", t)
        self.assertEqual(self.page.query_selector_all("#cn-send"), [])
        self.assertIn("Broken source link", self.page.input_value("textarea[readonly]"))
        self.assertEqual(reqs, [])

    def test_a_too_short_report_is_refused_with_an_alert(self):
        self.open("concern")
        self.fill_and_prepare("too short")
        self.assertIn("at least a sentence", self.text())
        self.assertEqual(self.page.query_selector_all("textarea[readonly]"), [])

    def test_with_a_configured_https_service_it_posts_once_and_reports_failure_honestly(self):
        self.ctx.route("https://reports.example.test/**", lambda r: r.fulfill(status=500, body="no"))
        self.page.route(re.compile(r".*/research-ledger/data/ledger\.json"), lambda r: r.fulfill(
            status=200, content_type="application/json",
            body=json.dumps(self._with_endpoint())))
        self.open("concern")
        self.assertNotIn("This form cannot send anything yet.", self.text())
        self.fill_and_prepare()
        posts = []
        self.page.on("request", lambda r: posts.append(r) if r.method == "POST" else None)
        self.page.click("#cn-send")
        self.page.wait_for_timeout(500)
        self.assertEqual(len(posts), 1)
        self.assertEqual(json.loads(posts[0].post_data)["type"], "Broken source link")
        self.assertIn("could not be sent", self.text())
        self.assertIn("nothing was received", self.text())

    def _with_endpoint(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        led["config"]["concernChannels"]["endpoint"] = "https://reports.example.test/ledger"
        return led

    def test_a_non_https_service_address_is_never_used(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        led["config"]["concernChannels"]["endpoint"] = "http://insecure.example.test/x"
        self.page.route(re.compile(r".*/research-ledger/data/ledger\.json"), lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(led)))
        self.open("concern")
        self.fill_and_prepare()
        self.assertEqual(self.page.query_selector_all("#cn-send"), [])


class TestKeyboardAndFocus(UI):
    def test_skip_link_is_first_and_moves_focus_to_main(self):
        self.open()
        self.page.keyboard.press("Tab")
        self.assertEqual(self.page.evaluate("document.activeElement.className"), "skip")
        self.page.keyboard.press("Enter")
        self.assertEqual(self.page.evaluate("document.activeElement.id"), "main")

    def test_route_change_moves_focus_to_main_content(self):
        self.open()
        self.page.click("nav.tabs >> text=Evidence Registry")
        self.page.wait_for_timeout(200)
        self.assertEqual(self.page.evaluate("document.activeElement.id"), "main")

    def test_every_interactive_element_shows_a_visible_focus_ring(self):
        self.open("evidence")
        bad = []
        for _ in range(40):
            self.page.keyboard.press("Tab")
            info = self.page.evaluate("""() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e);
                return { tag: e.tagName, text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), width: parseFloat(cs.outlineWidth), style: cs.outlineStyle }; }""")
            if info and (info["style"] == "none" or info["width"] < 2):
                bad.append(info)
        self.assertEqual(bad, [])

    def test_scrollable_table_regions_are_keyboard_focusable_and_labelled(self):
        self.open("evidence")
        regions = self.page.eval_on_selector_all(".tw", "els => els.map(e => [e.tabIndex, e.getAttribute('role'), e.getAttribute('aria-label')])")
        self.assertTrue(regions)
        for ti, role, label in regions:
            self.assertEqual((ti, role), (0, "region"))
            self.assertTrue(label)

    def test_reduced_motion_removes_smooth_scrolling(self):
        self.ctx.close()
        self.ctx = BROWSER.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
        self.page = self.ctx.new_page()
        self.page.goto(f"http://127.0.0.1:{SRV.server_address[1]}/research-ledger/")
        self.page.wait_for_selector("main h1")
        self.assertEqual(self.page.evaluate("getComputedStyle(document.documentElement).scrollBehavior"), "auto")


class TestMobile(UI):
    width = 390

    def test_no_view_scrolls_sideways_on_a_phone(self):
        self.open()
        for r in ("home", "publications", "publication-PUB-001", "publication-PUB-002", "evidence", "source-SRC-001", "claim-CLM-001", "revisions", "compare-PUB-001",
                  "corrections", "review", "methodology", "timeline", "integrity", "idea", "concern"):
            self.go(r)
            over = self.page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            self.assertLessEqual(over, 1, f"{r} overflows by {over}px")

    def test_touch_targets_are_at_least_36px_tall(self):
        self.open("evidence")
        small = self.page.evaluate("""() => [...document.querySelectorAll('main button, main select, main input')].filter(e => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 36).map(e => e.outerHTML.slice(0, 60))""")
        self.assertEqual(small, [])


class TestPreviewDemonstration(UI):
    preview = True

    def demo_on(self):
        self.page.click("#demo-toggle")
        self.page.wait_for_timeout(250)

    def test_preview_is_labelled_and_demo_is_off_by_default(self):
        self.open()
        self.assertIn("Private preview.", self.text())
        self.assertNotIn("DEMO-PUB-001", self.text())

    def test_demo_record_is_labelled_and_excluded_from_every_count(self):
        self.open()
        before = self.text()
        self.demo_on()
        self.go("publications")
        self.assertIn("DEMO-PUB-001", self.text())
        self.assertIn("Demonstration — not a real publication", self.text())
        self.go("integrity")
        self.assertRegex(self.text(), r"(?<!\d)2\s*published original essays")
        self.go("home")
        self.assertIn("2 publications recorded", self.text())
        self.assertNotIn("DEMO-PUB-001", before)

    @unittest.skipUnless((L.ROOT / "scripts" / "research-ledger-src" / "policy-drafts.json").exists(), "the owner-only drafts file is not committed; this check needs it locally")
    def test_owner_drafts_appear_only_in_the_preview_and_are_not_official(self):
        self.open("methodology")
        self.assertGreater(len(self.page.query_selector_all("details.owner")), 5)
        self.page.click("details.owner >> nth=0 >> summary")
        self.assertIn("This text is not published and is not an official standard.", self.page.inner_text("details.owner >> nth=0"))
        self.assertIn("0 of 11 sections are approved standards", self.text())

    def test_compare_three_versions_side_by_side_and_inline(self):
        self.open()
        self.demo_on()
        self.go("compare-DEMO-PUB-001")
        self.page.wait_for_selector("text=List of changes")
        t = self.text()
        self.assertIn("v1 → v3", t)
        self.assertIn("2 added, 1 removed, 3 changed paragraphs", t)
        self.assertIn("DEMO-RVN-001", t)
        self.assertIn("DEMO-RVN-002", t)
        if self.width > 760:
            self.assertGreater(len(self.page.query_selector_all(".cmprow.add")), 0)
            # every changed row carries a text label, not colour alone
            for sel, word in ((".cmprow.add", "Added"), (".cmprow.remove", "Removed"), (".cmprow.change", "Changed")):
                for el in self.page.query_selector_all(sel):
                    self.assertIn(word, el.text_content())
        else:
            self.assertEqual(self.page.query_selector_all(".cmpgrid"), [], "phones get the inline view, never narrow side-by-side columns")
        # word-level changes are announced to screen readers and marked in text
        self.assertGreater(len(self.page.query_selector_all("ins.w .vh")), 0)
        self.assertGreater(len(self.page.query_selector_all("del.w .vh")), 0)
        self.page.click("button:has-text('Inline')")
        self.page.wait_for_timeout(200)
        self.assertEqual(self.page.query_selector_all(".cmpgrid"), [])
        for sel, word in ((".inl.add", "Added"), (".inl.remove", "Removed"), (".inl.change", "Changed")):
            for el in self.page.query_selector_all(sel):
                self.assertIn(word, el.text_content(), "inline view labels every change in text")
        self.assertGreater(len(self.page.query_selector_all(".inl.add")), 0)

    def test_compare_two_adjacent_versions_and_the_single_difference(self):
        self.open()
        self.demo_on()
        self.go("compare-DEMO-PUB-001-1-2")
        self.page.wait_for_selector("text=List of changes")
        self.assertIn("v1 → v2", self.text())
        self.assertIn("DEMO-RVN-001", self.text())
        self.assertNotIn("DEMO-RVN-002", self.text())
        self.assertIn("Source Update", self.text())

    def test_same_version_selected_twice_says_nothing_differs(self):
        self.open()
        self.demo_on()
        self.go("compare-DEMO-PUB-001")
        self.page.wait_for_selector("text=List of changes")
        self.page.select_option("#cmp-from", "3")
        self.page.wait_for_timeout(300)
        self.assertIn("Choose two different versions.", self.text())

    def test_show_everything_reveals_unchanged_paragraphs(self):
        self.open()
        self.demo_on()
        self.go("compare-DEMO-PUB-001")
        self.page.wait_for_selector("text=List of changes")
        self.page.click("button:has-text('Showing changes only')")
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.query_selector_all(".same-run"), [])

    def test_change_list_links_move_focus_to_the_change(self):
        self.open()
        self.demo_on()
        self.go("compare-DEMO-PUB-001")
        self.page.wait_for_selector("text=List of changes")
        self.page.click("ol.chlist a >> nth=2")
        self.page.wait_for_timeout(200)
        self.assertTrue(self.page.evaluate("document.activeElement.id.startsWith('chg-')"))

    def test_the_correction_record_links_to_the_revision_and_the_revision_to_the_correction(self):
        self.open()
        self.demo_on()
        self.go("publication-DEMO-PUB-001")
        t = self.text()
        self.assertIn("Original issue", t)
        self.assertIn("See what changed", t)
        self.go("compare-DEMO-PUB-001-2-3")
        self.page.wait_for_selector("text=List of changes")
        self.assertIn("View the correction record", self.text())

    def test_a_demo_claim_whose_wording_changed_is_flagged(self):
        self.open()
        self.demo_on()
        self.go("claim-DEMO-CLM-001")
        self.page.wait_for_function("document.querySelector('#c-revstat').textContent.indexOf('checking') < 0")
        self.assertIn("no longer appears in the latest saved version", self.text("#c-revstat"))

    def test_a_reviewed_claim_shows_who_assessed_support_and_why(self):
        self.open()
        self.demo_on()
        self.go("claim-DEMO-CLM-002")
        t = self.text()
        self.assertIn("Source partly supports the claim", t)
        self.assertIn("Reviewed", t)
        self.assertIn("The fictional transcription supports the routine entries", t)


class TestPreviewMobile(TestPreviewDemonstration):
    width = 390

    def test_compare_on_a_phone_defaults_to_inline_and_has_no_sideways_scroll(self):
        self.open()
        self.demo_on()
        self.go("compare-DEMO-PUB-001")
        self.page.wait_for_selector("text=List of changes")
        self.assertEqual(self.page.query_selector_all(".cmpgrid"), [])
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth"), 1)
        self.assertFalse(self.page.is_visible(".seg button.sbs"), "side-by-side is hidden at phone width")


if __name__ == "__main__":
    unittest.main(verbosity=2)
