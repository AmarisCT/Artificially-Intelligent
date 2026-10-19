#!/usr/bin/env python3
"""Regression tests for the shared features the Research Commons touches: Universal Research Search and the Inquiry Engine.

Run: python3 scripts/research-commons-tests/test_shared.py

The Commons adds one record type ("contribution") to the shared research index. These tests prove, in a real browser and against throwaway copies of the site:
  * with NO approved contribution (the real repository today), Search and the Inquiry Engine show nothing new and nothing breaks;
  * with approved contributions in the index, Search lists them last, labels them as visitor contributions that are not peer reviewed, links to their public
    page, and never shows a withdrawn one; the Inquiry Engine's starting map and guided answer never include them, and its map labels one (and adds the legend entry) only if the visitor expands to it.
"""
from __future__ import annotations

import base64
import json
import pathlib
import re
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import test_ui as T  # noqa: E402
import commons_lib as L  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

PW = BROWSER = TMP = None
SRV = {}


def enc(q):
    return base64.urlsafe_b64encode(q.encode("utf-8")).decode("ascii").rstrip("=")


def setUpModule():
    global PW, BROWSER, TMP
    TMP = tempfile.TemporaryDirectory(prefix="commons-shared-")
    fixture = T.make_site(pathlib.Path(TMP.name), "fixture", fixture=True)
    SRV["real"] = T.serve(L.ROOT)
    SRV["fixture"] = T.serve(fixture)
    PW = sync_playwright().start()
    BROWSER = PW.chromium.launch()


def tearDownModule():
    BROWSER.close()
    PW.stop()
    for s in SRV.values():
        s.shutdown()
    TMP.cleanup()


class Shared(unittest.TestCase):
    site = "fixture"

    def setUp(self):
        self.ctx = BROWSER.new_context(viewport={"width": 1280, "height": 900})
        self.ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(8000)
        self.problems = []
        self.page.on("pageerror", lambda e: self.problems.append(("pageerror", str(e))))
        self.page.on("console", lambda m: self.problems.append((m.type, m.text)) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
        self.addCleanup(self.ctx.close)
        self.addCleanup(lambda: self.assertEqual(self.problems, [], "the page raised errors"))

    def base(self):
        return f"http://127.0.0.1:{SRV[self.site].server_address[1]}/"

    def search(self, q):
        self.page.goto(self.base() + "search/#s-" + enc(q))
        self.page.wait_for_selector("text=results")
        self.page.wait_for_timeout(400)
        return self.page.inner_text("#app")

    def inquiry_map(self, q):
        self.page.goto(self.base() + "inquiry-engine/#q-" + enc(q))
        self.page.wait_for_selector("text=Pathway Map")
        self.page.click("button:has-text('Pathway Map')")
        self.page.wait_for_selector(".legend")
        return self.page.inner_text(".legend")


class TestWithoutContributions(Shared):
    site = "real"

    def test_search_shows_no_visitor_type_and_still_finds_the_research(self):
        t = self.search("memory without lived experience")
        self.assertNotIn("Visitor contribution", t)
        self.assertIn("Concepts (", t)

    def test_inquiry_engine_legend_has_no_contribution_entry(self):
        legend = self.inquiry_map("Can memory exist without lived experience?")
        self.assertNotIn("Visitor contribution", legend)
        self.assertIn("Concept", legend)


class TestWithContributions(Shared):
    site = "fixture"

    def test_search_lists_contributions_last_and_labels_them(self):
        t = self.search("memory without lived experience")
        self.assertIn("Visitor contribution\n4", t.replace("\n\n", "\n"), "the content-type facet counts the approved ones")
        self.assertIn("Approved contributions from visitors, shown in the Research Commons. They are not peer reviewed, are not research findings, and are not the site's own conclusions.", t)
        self.assertGreater(t.index("Approved contributions from visitors"), t.index("Original essays ("), "contributions sort after the site's own research")
        self.assertIn("Approved for display; not peer reviewed", t)
        self.assertIn("Can memory exist without lived experience?", t)

    def test_every_contribution_result_links_to_its_public_page_and_none_is_withdrawn(self):
        self.search("memory without lived experience")
        hrefs = self.page.eval_on_selector_all("a[href*='research-commons/c/']", "els => els.map(e => e.getAttribute('href'))")
        self.assertTrue(hrefs)
        for h in hrefs:
            self.assertRegex(h, r"^https://amarisct\.github\.io/Artificially-Intelligent/research-commons/c/COM-000[1-6]/$")
        self.assertFalse(any("COM-0007" in h for h in hrefs))
        for q in ("withdrawn", "COM-0007"):
            t = self.search(q)
            self.assertIn("0 results", t, "a withdrawn record is never searchable by its words or its id")
            self.assertFalse(self.page.query_selector_all("a[href*='research-commons/c/COM-0007']"))

    def test_a_perspective_is_findable_by_its_words(self):
        t = self.search("thinner sense than the one we use for a person who remembers a summer")
        self.assertIn("Memory may need a past that mattered to someone", t)

    def test_inquiry_engine_map_starts_without_contributions_and_labels_them_if_the_visitor_expands_to_them(self):
        legend = self.inquiry_map("Can memory exist without lived experience?")
        self.assertNotIn("Visitor contribution", legend, "contributions are never part of the starting map: they are not evidence")
        self.assertEqual(self.page.eval_on_selector_all(".nd.contribution[role=button]", "els => els.length"), 0)
        # expanding every node's connections is the visitor's own choice; contributions may then appear, always labelled, and the legend follows
        for i in range(40):
            els = self.page.query_selector_all(".nd[role=button]")
            if i >= len(els):
                break
            els[i].focus()
            self.page.keyboard.press("Enter")
            self.page.wait_for_timeout(60)
            btn = self.page.query_selector("button:has-text('Expand connections')")
            if btn:
                btn.click()
                self.page.wait_for_timeout(80)
        names = self.page.eval_on_selector_all(".nd.contribution[role=button]", "els => els.map(e => e.getAttribute('aria-label') || '')")
        self.assertTrue(names, "expanding reaches the approved contributions through editorial relationships")
        self.assertTrue(all(n.startswith("Visitor contribution: ") for n in names), names)
        self.assertIn("Visitor contribution", self.page.inner_text(".legend"), "the legend gains its entry once such a node is on the map")
        self.assertFalse(any("COM-0007" in n or "withdrawn" in n.lower() for n in names))

    def test_the_guided_inquiry_does_not_present_a_visitor_contribution_as_evidence(self):
        self.page.goto(self.base() + "inquiry-engine/#q-" + enc("Can memory exist without lived experience?"))
        self.page.wait_for_selector("text=Guided Inquiry")
        self.page.wait_for_timeout(600)
        body = self.page.inner_text("main")
        for c in ("Memory may need a past that mattered to someone", "COM-0003"):
            self.assertNotIn(c, body, "visitor perspectives do not appear in the guided answer")


if __name__ == "__main__":
    unittest.main(verbosity=1)
