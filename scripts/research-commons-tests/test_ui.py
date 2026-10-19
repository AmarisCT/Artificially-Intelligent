#!/usr/bin/env python3
"""Browser tests for /research-commons/. Run: python3 scripts/research-commons-tests/test_ui.py

Drives Chromium (Playwright) against four throwaway copies of the site, each served on its own local port:

  real      the repository as it is: no approved contribution, no submission service. This is what the public would see today.
  fixture   the same, with the test fixture records approved (static pages built, shared index rebuilt) and nothing else switched on.
  endpoint  fixture + a configured submission service and TEST approved-guidelines wording. The service is faked in the browser (Playwright
            intercepts https://commons.test), so no real request leaves this machine and nothing is stored anywhere.
  legacy    fixture + only the Unanswered Archive's existing question endpoint configured (the shared-inbox fallback).

and the private preview page built from the bundle. It needs no internet: fonts are blocked on purpose, so the pages must work on fallback fonts.
The request the browser really sends is fed to the reference server contract (scripts/commons_contract.py), so a form that drifts from the contract fails here.
"""
from __future__ import annotations

import functools
import http.server
import json
import pathlib
import re
import shutil
import sys
import tempfile
import threading
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build_commons_preview as P  # noqa: E402
import build_research_commons as B  # noqa: E402
import build_research_index as BI  # noqa: E402
import commons_contract as C  # noqa: E402
import commons_demo as D  # noqa: E402
import commons_lib as L  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ENDPOINT = "https://commons.test/api/public/contributions"
LEGACY = "https://archive.test/api/public/question-submissions"
ORIGIN = "https://amarisct.github.io"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(directory):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(directory)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def approved_guidelines():
    sec = lambda i, t: {"id": i, "title": t, "body": [f"TEST FIXTURE wording for {t.lower()}. Not real policy."], "points": []}
    return {"schema": 1, "version": "test-v1", "approvedOn": "2026-10-20", "approvedBy": "Owner",
            "sections": [sec("welcome", "What is welcome"), sec("evaluation", "How contributions are evaluated"), sec("moderation", "How moderation works"),
                         sec("after", "What happens after"), sec("editing", "Editing"), sec("attribution", "Attribution"), sec("declined", "Why declined"),
                         sec("sources", "Sources"), sec("privacy", "Privacy"), sec("withdrawal", "Withdrawal")],
            "consent": {"common": "TEST FIXTURE consent statement.", "publication": "TEST FIXTURE publication consent."},
            "stored": ["TEST FIXTURE stored item"], "rights": ["TEST FIXTURE rights item"]}


def make_site(tmp, name, fixture=False, endpoint=None, archive_endpoint=None, approved=False, mutate=None):
    root = tmp / name
    shutil.copytree(L.ROOT, root, ignore=shutil.ignore_patterns(".git", "__pycache__", "node_modules", "research-ledger-src", "research-commons-src"))
    d = root / "research-commons" / "data"
    cfgp = root / "research-commons" / "config.json"
    cfg = L.read_json(cfgp)
    if fixture:
        recs = D.records("COM")
        if mutate:
            mutate(recs)
        pc = L.read_json(d / "public-contributions.json")
        pc["contributions"] = recs
        L.write_json(d / "public-contributions.json", pc)
        rel = L.read_json(d / "contribution-relations.json")
        rel["relations"] = D.relations("COM")
        L.write_json(d / "contribution-relations.json", rel)
        colls = L.read_json(d / "collections.json")
        used = {x for r in recs if r["status"] != "withdrawn" for x in r.get("collections", [])}
        for c in colls["collections"]:
            c["status"] = "active" if c["id"] in used else "planned"
        L.write_json(d / "collections.json", colls)
    if endpoint:
        cfg["contributionEndpoint"] = endpoint
    if approved:
        cfg["guidelinesApproved"] = True
        L.write_json(d / "guidelines.json", approved_guidelines())
    L.write_json(cfgp, cfg)
    if archive_endpoint:
        L.write_json(root / "unanswered-archive" / "config.json", {"submitEndpoint": archive_endpoint})
    res = B.build(root)
    if res.get("errors"):
        raise AssertionError(res["errors"])
    if fixture:
        index, vocab = BI.build(root, root / "scripts" / "atlas_dump.json")
        (root / "inquiry-engine" / "data" / "research-index.json").write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    return root


SRV = {}
PW = BROWSER = TMP = PREVIEW_FILE = None
SITES = {}


def feature(recs):
    for r in recs:
        if r["id"] == "COM-0002":
            r["featured"] = True


def setUpModule():
    global PW, BROWSER, TMP, PREVIEW_FILE
    TMP = tempfile.TemporaryDirectory(prefix="commons-ui-")
    tmp = pathlib.Path(TMP.name)
    SITES["real"] = L.ROOT
    SITES["fixture"] = make_site(tmp, "fixture", fixture=True, mutate=feature)
    SITES["endpoint"] = make_site(tmp, "endpoint", fixture=True, endpoint=ENDPOINT, approved=True)
    SITES["legacy"] = make_site(tmp, "legacy", fixture=True, archive_endpoint=LEGACY, approved=True)
    for k, v in SITES.items():
        SRV[k] = serve(v)
    PREVIEW_FILE = tmp / "preview.html"
    PREVIEW_FILE.write_text(P.artifact_html(P.build_bundle()), encoding="utf-8")
    PW = sync_playwright().start()
    BROWSER = PW.chromium.launch()


def tearDownModule():
    BROWSER.close()
    PW.stop()
    for s in SRV.values():
        s.shutdown()
    TMP.cleanup()


class UI(unittest.TestCase):
    site = "real"
    width = 1280
    preview = False

    def setUp(self):
        self.ctx = BROWSER.new_context(viewport={"width": self.width, "height": 900})
        self.ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
        self.sent = []          # every request that would leave the page for a submission service
        self.reply = lambda req: {"status": 202, "body": {"ok": True, "receipt": "rcpt_test"}}
        self.ctx.route(re.compile(r"https://(commons|archive)\.test/.*"), self._svc)
        self.page = self.ctx.new_page()
        self.page.set_default_timeout(6000)
        self.problems = []
        self.page.on("pageerror", lambda e: self.problems.append(("pageerror", str(e))))
        self.page.on("console", lambda m: self.problems.append((m.type, m.text)) if m.type == "error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
        self.requests = []
        self.page.on("request", lambda r: self.requests.append((r.method, r.url)))
        self.addCleanup(self.ctx.close)
        self.addCleanup(lambda: self.assertEqual(self.problems, [], "the page raised errors"))

    def _svc(self, route, request):
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST", "access-control-expose-headers": "Retry-After"}
        if request.method == "OPTIONS":
            return route.fulfill(status=204, headers=cors)
        self.sent.append({"url": request.url, "headers": request.headers, "body": request.post_data})
        out = self.reply(request)
        if out.get("abort"):
            return route.abort()
        route.fulfill(status=out["status"], headers={**cors, **out.get("headers", {}), "content-type": "application/json"}, body=json.dumps(out["body"]) if out.get("body") is not None else "")

    def url(self):
        if self.preview:
            return f"file://{PREVIEW_FILE}"
        return f"http://127.0.0.1:{SRV[self.site].server_address[1]}/research-commons/"

    def open(self, route="home"):
        self.page.goto(self.url())
        self.page.wait_for_selector("#fallback", state="detached")        # the static fallback has its own h1; wait for the real view
        self.page.wait_for_selector("main h1")
        if route != "home":
            self.go(route)
        return self.page

    def go(self, route):
        self.page.evaluate(f"location.hash = {json.dumps(route)}")
        self.page.wait_for_timeout(250)

    def text(self, sel="main"):
        return self.page.text_content(sel)

    def advance(self, ms=10000):
        """Make the page believe the form has been open a while, without waiting. The page's own minimum-time check is tested separately."""
        self.page.evaluate(f"(() => {{ const o = Date.now; Date.now = () => o() + {ms}; }})()")

    def contract_says(self, body, alias="contributions"):
        path = "/api/public/" + alias
        return C.handle("POST", path, {"Content-Type": "application/json", "Origin": ORIGIN}, body.encode("utf-8"))


QUESTION = "Could an artificial intelligence system develop an autobiographical sense of self?"
PERSPECTIVE = ("Memory, I would suggest, needs a past that mattered to someone. A recording holds yesterday without having lived through it, and a model that "
               "has read a million diaries can describe a childhood it never had. If we call both memory, we use the word in a thinner sense than we do for a person.")


# ---------------------------------------------------------------------------------------------------------------- real data, nothing approved
class TestRealPublicPage(UI):
    def test_home_has_the_required_text_and_nothing_invented(self):
        p = self.open()
        t = self.text()
        self.assertEqual(p.inner_text("main h1"), "THE RESEARCH COMMONS")
        for needle in ("An open invitation to question, contribute, and think beyond what is known.",
                       "Research develops through questions, disagreement, observation, and the exchange of ideas.",
                       "The Research Commons invites visitors to contribute to the intellectual conversations explored throughout Artificially Intelligent.",
                       "Whether proposing an unresolved question, recommending a scholarly publication, or offering a perspective worth examining, every contribution begins with curiosity.",
                       "Submissions are considered through an editorial process before any material becomes part of the public research archive.",
                       "The most important questions are not always the ones we ask alone.",
                       "Contributions are not open yet", "Nothing yet.", "awaiting activation"):
            self.assertIn(needle, t)
        for label in ("Explore the Commons →", "Propose a Research Question →", "Recommend a Publication →", "Suggest a Research Topic →", "Read the Contribution Guidelines →"):
            self.assertIn(label, t)
        self.assertEqual(p.query_selector_all("#pv"), [], "no preview controls on the public page")
        self.assertNotIn("DEMO", t)
        self.assertNotIn("Demonstration", t)

    def test_submission_actions_say_they_are_not_open(self):
        self.open()
        acts = self.page.eval_on_selector_all(".actions[aria-label='Primary actions'] a", "els => els.map(e => e.textContent)")
        self.assertEqual(len(acts), 5)
        for a in acts:
            if a.startswith(("Propose", "Recommend", "Suggest")):
                self.assertIn("not open yet", a)
            else:
                self.assertNotIn("not open yet", a)

    def test_featured_inquiry_is_the_editorial_question_and_is_not_presented_as_a_visitor_contribution(self):
        self.open()
        f = self.text("section[aria-labelledby='feat-h']")
        self.assertIn("Can an artificial system genuinely understand meaning?", f)
        self.assertIn("not a visitor's question", f)
        self.assertIn("posed by Artificially Intelligent", f)
        href = self.page.get_attribute("section[aria-labelledby='feat-h'] a:has-text('Investigate This Question')", "href")
        self.assertTrue(href.startswith("../inquiry-engine/#q-"))
        import base64
        enc = href.split("#q-")[1]
        self.assertEqual(base64.urlsafe_b64decode(enc + "=" * (-len(enc) % 4)).decode("utf-8"), "Can an artificial system genuinely understand meaning?")

    def test_every_view_loads_and_sets_its_title_without_errors(self):
        self.open()
        for route, h1 in (("home", "THE RESEARCH COMMONS"), ("contribute", "What would you like to contribute?"), ("library", "Library"),
                          ("correspondence", "The Correspondence Collection"), ("open-inquiries", "Open Inquiries"), ("constellation", "The Question Constellation"),
                          ("collections", "Collections"), ("guidelines", "Contribution Guidelines"), ("about", "How the Commons works")):
            self.go(route)
            self.assertEqual(self.page.inner_text("main h1").upper(), h1.upper(), route)
            self.assertIn("Artificially Intelligent", self.page.title())
        self.go("library")
        self.assertEqual(self.page.title(), "Library · The Research Commons · Artificially Intelligent")

    def test_empty_states_are_honest(self):
        self.open("library")
        self.assertIn("The library is empty.", self.text())
        self.assertEqual(self.page.query_selector_all("article.card"), [])
        self.go("correspondence")
        self.assertIn("No correspondence yet.", self.text())
        self.assertIn("No exchange has been written to fill the collection", self.text())
        self.go("open-inquiries")
        t = self.text()
        self.assertIn("None yet.", t)
        self.assertIn("These are not visitor questions", t)
        self.assertEqual(len(self.page.query_selector_all("article.card.visitor")), 0)
        self.go("collections")
        cards = self.page.query_selector_all("article.card")
        self.assertEqual(len(cards), 5)
        for c in cards:
            self.assertIn("Planned", c.text_content())
            self.assertIn("No approved contribution belongs to this collection yet.", c.text_content())

    def test_constellation_with_no_contributions_draws_nothing_until_asked_to_show_the_archive(self):
        self.open("constellation")
        self.assertIn("No visitor contribution has been approved yet", self.text())
        self.assertEqual(self.page.query_selector_all(".cn-map svg"), [])
        self.page.click("text=Show the Archive's questions")
        self.page.wait_for_timeout(300)
        self.assertGreater(len(self.page.query_selector_all(".cn-map svg .nd")), 20)
        self.assertEqual(len(self.page.query_selector_all(".cn-map svg .nd.contribution")), 0, "no visitor nodes")
        self.assertGreater(len(self.page.query_selector_all("#cn-list button.r")), 20, "the list holds the same records")

    def test_the_forms_cannot_send_and_say_why(self):
        self.open("contribute")
        self.assertEqual(len(self.page.query_selector_all(".chooser button")), 4)
        for typ in ("question", "publication", "topic", "perspective"):
            self.go(f"contribute-{typ}")
            t = self.text()
            self.assertIn("sending is not connected", t.lower())
            self.assertIn("The consent and rights wording is not approved yet", t)
            self.assertEqual(self.page.query_selector_all("#consent"), [], "no consent checkbox for wording that is not approved")
            btn = self.page.query_selector("form button[type=submit]")
            self.assertTrue(btn.is_disabled())
            self.assertEqual(btn.text_content(), "Sending is not connected yet")
            self.page.evaluate("document.querySelector('form.pf').requestSubmit()")
            self.page.wait_for_timeout(150)
            self.assertIn("nothing was sent", self.text("#form-msg"))
        self.assertEqual([r for r in self.requests if r[0] == "POST"], [], "not a single POST left the page")

    def test_unapproved_policy_wording_is_nowhere_on_the_public_page(self):
        draft = L.read_json(P.DRAFTS)
        self.assertTrue(draft, "the owner's draft file must exist for this check to mean something")
        chunks = [s["draft"] for s in draft["sections"].values()] + list(draft["consent"].values()) + draft["rights"] + draft["stored"]
        self.open()
        for route in ("home", "contribute-question", "contribute-perspective", "guidelines", "about", "library"):
            self.go(route)
            body = " ".join(self.text("body").split())
            for c in chunks:
                self.assertNotIn(" ".join(c.split())[:60], body, f"draft wording leaked into {route}")
        self.go("guidelines")
        self.assertIn("The guidelines are not published yet", self.text())

    def test_unknown_and_hostile_routes_are_harmless(self):
        self.open()
        self.go("c-COM-9999")
        self.assertIn("No such contribution", self.text())
        self.go("c-%3Cimg%20src%3Dx%20onerror%3D%22window.__pwn%3D1%22%3E")
        self.page.wait_for_timeout(200)
        self.assertIsNone(self.page.evaluate("window.__pwn"))
        self.assertEqual(self.page.query_selector_all("main img"), [])
        self.go("collection-%3Cb%3Ex")
        self.assertIn("No such collection", self.text())

    def test_the_about_page_says_what_is_built_and_what_is_only_specified(self):
        self.open("about")
        t = self.text()
        self.assertIn("A curated space, not a forum.", t)
        row = self.page.eval_on_selector_all("table tbody tr", "rows => rows.map(r => r.textContent)")
        arch = next(r for r in row if r.startswith("Architect moderation inbox"))
        self.assertIn("Specified, not built", arch)
        obs = next(r for r in row if r.startswith("Research Observatory"))
        self.assertIn("Specified, not built", obs)

    def test_copying_an_empty_draft_does_not_pretend_to_copy(self):
        self.open("contribute-question")
        self.page.click("text=Copy my draft")
        self.assertIn("nothing to copy", self.text("#form-msg").lower())

    def test_html_robots_is_noindex_while_the_library_is_empty(self):
        html = (L.COMMONS / "index.html").read_text(encoding="utf-8")
        n = len(L.read_json(L.DATA / "public-contributions.json")["contributions"])
        self.assertEqual('<meta name="robots" content="noindex,follow">' in html, n == 0, "index.html robots must be noindex exactly while the library is empty")


# ---------------------------------------------------------------------------------------------------------------- approved records, no service
class TestFixtureSite(UI):
    site = "fixture"

    def test_library_lists_approved_records_newest_first_and_never_the_withdrawn_text(self):
        self.open("library")
        ids = self.page.eval_on_selector_all("article.card", "els => els.map(e => e.dataset.id)")
        self.assertEqual(ids, ["COM-0006", "COM-0005", "COM-0004", "COM-0003", "COM-0002", "COM-0001"])
        self.assertIn("6 of 6 approved contributions, newest first.", self.text())
        self.assertNotIn("COM-0007", self.text())
        for c in self.page.query_selector_all("article.card"):
            self.assertIn("Visitor contribution", c.text_content())

    def test_filters_and_search_work_and_clear(self):
        self.open("library")
        self.page.select_option("#lt", "perspective")
        self.assertEqual(self.page.eval_on_selector_all("article.card", "els => els.map(e => e.dataset.id)"), ["COM-0006", "COM-0003"])
        self.page.select_option("#lt", "")
        self.page.select_option("#lc", "memory")
        self.assertEqual(sorted(self.page.eval_on_selector_all("article.card", "els => els.map(e => e.dataset.id)")), ["COM-0001", "COM-0003"])
        self.page.select_option("#lc", "")
        self.page.select_option("#ll", "the-digital-self")
        self.assertEqual(sorted(self.page.eval_on_selector_all("article.card", "els => els.map(e => e.dataset.id)")), ["COM-0001", "COM-0003"])
        self.page.select_option("#ll", "")
        self.page.fill("#lq", "chalmers")
        self.assertEqual(self.page.eval_on_selector_all("article.card", "els => els.map(e => e.dataset.id)"), ["COM-0004"], "search reaches the source's author")
        self.page.fill("#lq", "zzzz nothing")
        self.assertIn("No approved contribution matches", self.text())
        self.page.click("text=Clear filters")
        self.assertEqual(len(self.page.query_selector_all("article.card")), 6)

    def test_there_are_no_popularity_controls_or_rankings_anywhere(self):
        self.open("library")
        for route in ("library", "correspondence", "constellation", "c-COM-0001", "open-inquiries"):
            self.go(route)
            names = [b.text_content().strip().lower() for b in self.page.query_selector_all("main button, main a.btn")]
            for bad in ("like", "upvote", "react", "reply", "comment", "follow", "share", "trending", "popular"):
                self.assertFalse(any(bad == n or n.startswith(bad + " ") for n in names), f"{bad!r} control on {route}")
            self.assertEqual(self.page.query_selector_all("main textarea"), [], f"no free-text posting on {route}")
        self.go("library")
        self.assertEqual([o for o in self.page.eval_on_selector_all("main select option", "els => els.map(e => e.textContent)") if re.search(r"popular|trending|most", o, re.I)], [])

    def test_question_detail_is_complete_and_honest(self):
        self.open("c-COM-0001")
        self.assertEqual(self.page.inner_text("main h1"), "Can memory exist without lived experience?")
        t = self.text()
        for needle in ("Visitor contribution. It is not original research from Artificially Intelligent, it is not peer reviewed, and it is not evidence.",
                       "Editorial Context", "Related Concepts", "Related Research", "Open Questions", "Editorial Status", "Selected for further investigation",
                       "Selection is not an answer.", "Submitted anonymously", "Showing a contribution does not mean Artificially Intelligent has answered it"):
            self.assertIn(needle, t)
        self.assertIn("Editorial · Artificially Intelligent", t, "editorial text is labelled as the editor's")
        href = self.page.get_attribute("a:has-text('Investigate This Question')", "href")
        import base64
        enc = href.split("#q-")[1]
        self.assertEqual(base64.urlsafe_b64decode(enc + "=" * (-len(enc) % 4)).decode("utf-8"), "Can memory exist without lived experience?")
        self.assertIn("Memory", self.text("#concepts"))
        self.assertTrue(self.page.query_selector("#concepts a[href*='lexicon/#c-memory']"), "a link to the Lexicon's entry")
        related = self.text("#research")
        self.assertIn("Can artificial memory systems reproduce important functions of human remembering?", related, "the Archive's Q020 title, from the real index")
        self.assertIn("Editorial relationship", related)
        self.assertTrue(self.page.query_selector("a[href='./c/COM-0001/']"), "link to the permanent static page")

    def test_publication_detail_does_not_present_a_recommendation_as_credible(self):
        self.open("c-COM-0004")
        t = self.text()
        self.assertIn("Recommended by a visitor. Not verified.", t)
        self.assertIn("not a claim that the work is credible, peer reviewed", t)
        self.assertTrue(self.page.query_selector("#source a[href^='https://arxiv.org/abs/2303.07103']"))
        self.assertNotIn("Investigate This Question", t)
        self.assertEqual(self.page.eval_on_selector("#source a", "a => a.rel"), "noopener noreferrer")

    def test_withdrawn_contribution_shows_only_a_notice(self):
        self.open("c-COM-0007")
        t = self.text()
        self.assertEqual(self.page.inner_text("main h1"), "Withdrawn")
        self.assertIn("Withdrawn at the contributor's request.", t)
        self.assertIn("Its text is no longer shown.", t)
        self.assertNotIn("Investigate", t)

    def test_correspondence_pairs_perspectives_with_their_questions_and_labels_who_wrote_what(self):
        self.open("correspondence")
        letters = self.page.query_selector_all("article.letter")
        self.assertEqual(len(letters), 2)
        first = letters[0].text_content() if "COM-0006" in letters[0].text_content() else letters[1].text_content()
        arch = next(l.text_content() for l in letters if "COM-0006" in l.text_content())
        self.assertIn("Can an artificial system genuinely understand meaning?", arch)
        self.assertIn("A question in the Unanswered Archive, posed by Artificially Intelligent", arch)
        vis = next(l.text_content() for l in letters if "COM-0003" in l.text_content())
        self.assertIn("Can memory exist without lived experience?", vis)
        self.assertIn("A visitor's question", vis)
        self.assertIn("A reasoned view from a visitor. It is an argument, not a finding.", vis)
        self.assertIn("Editorial Context", vis)
        self.assertIn("A. Reader", vis)
        self.assertIn("Continue Exploring", vis)
        self.assertNotIn("COM-0007", self.text())

    def test_open_inquiries_contains_only_editor_selected_visitor_questions(self):
        self.open("open-inquiries")
        sel = self.page.eval_on_selector_all("section[aria-labelledby='oi1'] article.card", "els => els.map(e => e.textContent)")
        self.assertEqual(len(sel), 1)
        self.assertIn("COM-0001", sel[0])
        self.assertNotIn("COM-0002", " ".join(sel), "an approved question that no editor selected is not an Open Inquiry")
        self.assertIn("does not mean a question has had a full literature review", self.text())

    def test_collections_are_active_only_when_they_have_approved_members(self):
        self.open("collections")
        cards = {c.query_selector("h2").text_content(): c.text_content() for c in self.page.query_selector_all("article.card")}
        self.assertIn("Active", cards["The Digital Self"])
        self.assertIn("2 approved contributions", cards["The Digital Self"])
        self.assertIn("Planned", cards["The Future of Research"])
        self.go("collection-the-digital-self")
        self.assertEqual(sorted(self.page.eval_on_selector_all("article.card", "els => els.map(e => e.dataset.id)")), ["COM-0001", "COM-0003"])

    def test_featured_inquiry_shows_an_approved_contribution_only_when_an_editor_marked_one_featured(self):
        self.open()
        f = self.text("section[aria-labelledby='feat-h']")
        self.assertIn("Could an artificial intelligence system develop an autobiographical sense of self?", f)
        self.assertIn("Visitor contribution", f)
        self.assertNotIn("not a visitor's question", f)

    def test_static_page_for_an_approved_contribution_is_crawlable_and_inert(self):
        p = self.page
        p.goto(f"http://127.0.0.1:{SRV['fixture'].server_address[1]}/research-commons/c/COM-0001/")
        self.assertIn("Can memory exist without lived experience?", p.title())
        self.assertIn("Visitor contribution.", p.text_content("body"))
        types = p.eval_on_selector_all("script", "els => els.map(e => e.type)")
        self.assertTrue(all(t == "application/ld+json" for t in types), "the only script on a contribution page is data")
        self.assertEqual(p.get_attribute("meta[name=robots]", "content"), "index,follow")

    def test_the_constellation_derives_exactly_the_edges_the_build_script_does(self):
        self.open("constellation")
        js = self.page.evaluate("JSON.stringify(window.__commonsTest.deriveEdges(window.__commonsTest.state().C.contributions, window.__commonsTest.state().C.relations))")
        mine = json.loads(js)
        theirs = L.contribution_edges(D.records("COM"), D.relations("COM"))
        key = lambda e: (e["a"], e["b"], e["kind"], e["why"])
        self.assertEqual(sorted(map(key, mine)), sorted(map(key, theirs)))
        self.assertTrue(any(e["kind"] == "suggested" for e in mine))

    def test_constellation_select_filter_search_zoom_and_keyboard(self):
        self.open("constellation")
        nodes = self.page.query_selector_all(".cn-map svg .nd")
        self.assertGreaterEqual(len(nodes), 12)
        self.assertEqual(len(self.page.query_selector_all(".cn-map svg .nd.contribution")), 6)
        for n in nodes:
            self.assertEqual(n.get_attribute("tabindex"), "0")
            self.assertEqual(n.get_attribute("role"), "button")
            self.assertTrue(n.get_attribute("aria-label"))
        # select by click: the panel states every connection and how it was made
        self.page.click(".cn-map svg .nd.contribution >> nth=0", force=True)
        side = self.text("#cn-side")
        self.assertIn("Visitor contribution", side)
        self.assertIn("Editorial relationship.", side)
        self.assertEqual(self.page.get_attribute(".cn-map svg .nd.sel", "aria-pressed"), "true")
        self.page.evaluate("window.__constellation.ctl.select(null, true)")
        self.assertEqual(len(self.page.query_selector_all(".cn-map svg .nd.sel")), 0)
        # search dims what does not match, and keeps what does
        self.page.fill("#cq", "autobiographical")
        self.page.wait_for_timeout(150)
        self.assertGreaterEqual(len(self.page.query_selector_all(".cn-map svg .nd:not(.dim)")), 1)
        self.page.fill("#cq", "")
        self.page.select_option("#ct", "concept")
        self.page.wait_for_timeout(150)
        visible = self.page.eval_on_selector_all(".cn-map svg .nd", "els => els.filter(e => e.style.display !== 'none').map(e => e.getAttribute('class'))")
        self.assertTrue(visible and all("concept" in c for c in visible))
        self.page.select_option("#ct", "")
        # zoom buttons and keyboard
        before = self.page.get_attribute(".cn-map svg g.vp", "transform")
        self.page.click("button[aria-label='Zoom in']")
        after = self.page.get_attribute(".cn-map svg g.vp", "transform")
        self.assertNotEqual(before, after)
        self.page.focus(".cn-map svg")
        self.page.keyboard.press("+")
        self.assertNotEqual(self.page.get_attribute(".cn-map svg g.vp", "transform"), after)
        self.page.click("button[aria-label='Reset the view']")
        self.assertEqual(self.page.get_attribute(".cn-map svg g.vp", "transform"), before)

    def test_constellation_list_alternative_selects_the_same_node(self):
        self.open("constellation")
        self.page.click("#cn-list button.r >> nth=2")
        self.page.wait_for_timeout(150)
        self.assertEqual(len(self.page.query_selector_all(".cn-map svg .nd.sel")), 1)
        self.assertIn("connection", self.text("#cn-side"))
        self.page.click("button:has-text('Show the list only')")
        self.assertFalse(self.page.is_visible(".cn-map"))
        self.assertTrue(self.page.is_visible("#cn-list"))

    def test_constellation_suggested_edge_is_drawn_dashed_and_labelled(self):
        self.open("constellation")
        n = self.page.query_selector_all(".cn-map svg line.e.suggested")
        self.assertEqual(len(n), 1)
        self.assertIn("Automated suggestion", self.page.text_content(".cn-map svg line.e.suggested title"))

    def test_hostile_text_in_an_approved_record_is_shown_as_text_never_run(self):
        root = SITES["fixture"]
        p = root / "research-commons" / "data" / "public-contributions.json"
        original = p.read_text(encoding="utf-8")
        self.addCleanup(p.write_text, original, "utf-8")
        d = json.loads(original)
        d["contributions"][0]["title"] = '<img src=x onerror="window.__pwn=1">Hostile title?'
        d["contributions"][0]["text"] = '<script>window.__pwn=2</script>\n\n<b>bold</b>'
        d["contributions"][2]["attribution"]["display"] = '<i onmouseover="window.__pwn=3">name</i>'
        d["contributions"][3]["source"]["url"] = "javascript:window.__pwn=4"
        p.write_text(json.dumps(d), encoding="utf-8")
        self.open("library")
        self.go("c-COM-0001")
        self.go("c-COM-0003")
        self.go("c-COM-0004")
        self.go("constellation")
        self.assertIsNone(self.page.evaluate("window.__pwn"))
        self.go("library")
        self.assertIn('<img src=x onerror="window.__pwn=1">Hostile title?', self.text())
        self.assertEqual(self.page.query_selector_all("main img"), [])
        self.assertEqual(self.page.query_selector_all("a[href^='javascript:']"), [])
        self.go("c-COM-0004")
        self.assertEqual(self.page.query_selector_all("a[href^='javascript:']"), [])


# ---------------------------------------------------------------------------------------------------------------- a configured service (faked in the browser)
class TestSubmissionFlow(UI):
    site = "endpoint"

    def fill_valid(self, typ):
        p = self.page
        self.go(f"contribute-{typ}")
        if typ == "question":
            p.fill("#f-question", QUESTION)
            p.select_option("#f-category", "ai")
            p.fill("#f-explanation", "An autobiographical self would need a remembered past.")
        elif typ == "publication":
            p.fill("#f-title", "Could a Large Language Model Be Conscious?")
            p.fill("#f-authors", "David J. Chalmers")
            p.fill("#f-venue", "arXiv")
            p.fill("#f-year", "2023")
            p.fill("#f-doi", "https://doi.org/10.48550/ARXIV.2303.07103")
            p.fill("#f-url", "https://arxiv.org/abs/2303.07103")
            p.select_option("#f-category", "ai")
            p.fill("#f-why", "It sets out reasons for and against machine consciousness and what would change the answer.")
        elif typ == "topic":
            p.fill("#f-title", "Autobiographical narratives in artificial systems")
            p.fill("#f-description", "How a system might build, store and revise an account of its own past, and whether that resembles how people build a life story.")
            p.fill("#f-why", "Language models are already asked to speak about themselves, so the question is no longer abstract.")
        else:
            p.fill("#f-title", "Memory may need a past that mattered to someone")
            p.select_option("#f-relatedQuestion", index=1)
            p.fill("#f-text", PERSPECTIVE)
            p.fill("#f-references", "Searle, J. (1980). Minds, brains, and programs.")
        p.check("#consent")
        self.advance()

    def submit(self):
        self.page.click("form.pf button[type=submit]")
        self.page.wait_for_timeout(500)

    def test_when_the_service_and_the_approved_wording_exist_the_page_says_so_and_does_not_hedge(self):
        self.open()
        self.assertIn("Open for contributions", self.text())
        acts = self.page.eval_on_selector_all(".actions[aria-label='Primary actions'] a", "els => els.map(e => e.textContent)")
        self.assertFalse(any("not open yet" in a for a in acts))
        self.go("guidelines")
        t = self.text()
        self.assertIn("Version test-v1, approved", t)
        self.assertIn("TEST FIXTURE wording for what is welcome.", t)
        self.assertNotIn("not published yet", t)

    def test_empty_submit_shows_a_summary_names_each_problem_and_sends_nothing(self):
        self.open("contribute-question")
        self.advance()
        self.page.click("form.pf button[type=submit]")
        self.page.wait_for_timeout(200)
        s = self.text("#errsum")
        self.assertIn("2 things need attention", s)
        self.assertIn("This is required.", s)
        self.assertIn("Please confirm to continue.", s)
        self.assertEqual(self.page.get_attribute("#f-question", "aria-invalid"), "true")
        self.assertEqual(self.page.evaluate("document.activeElement.id"), "errsum", "focus moves to the summary")
        self.assertEqual(self.sent, [])
        self.page.click("#errsum a:has-text('Your research question')")
        self.assertEqual(self.page.evaluate("document.activeElement.id"), "f-question")

    def test_submitting_too_quickly_is_refused_by_the_page_before_anything_is_sent(self):
        self.open("contribute-question")
        self.page.fill("#f-question", QUESTION)
        self.page.check("#consent")
        self.submit()
        self.assertIn("Please take a moment", self.text("#form-msg"))
        self.assertEqual(self.sent, [])

    def test_the_honeypot_sends_nothing_and_says_nothing(self):
        self.open("contribute-question")
        self.page.evaluate("document.querySelector('input[name=website]').value = 'http://spam.example'")
        self.page.fill("#f-question", QUESTION)
        self.page.check("#consent")
        self.advance()
        self.submit()
        self.assertEqual(self.sent, [])
        self.assertNotIn("Received", self.text())

    def test_each_kind_sends_what_the_server_contract_accepts_and_success_waits_for_the_server(self):
        for typ in ("question", "publication", "topic", "perspective"):
            with self.subTest(typ):
                self.sent.clear()
                self.open()
                self.fill_valid(typ)
                self.submit()
                self.assertEqual(len(self.sent), 1, "exactly one request")
                req = self.sent[0]
                self.assertEqual(req["url"], ENDPOINT)
                self.assertEqual(req["headers"]["content-type"], "application/json")
                body = json.loads(req["body"])
                self.assertEqual(body["type"], typ)
                self.assertIs(body["consent"], True)
                self.assertEqual(body["consentVersion"], "test-v1")
                self.assertEqual(body["hp"], "")
                self.assertEqual(body["origin"], "research-commons")
                self.assertEqual(body["attribution"], {"mode": "anonymous"})
                r = self.contract_says(req["body"])
                self.assertEqual(r.status, 202, r.body)
                self.assertEqual(r.stored["state"], "pending-review")
                self.assertFalse(r.stored["published"])
                t = self.text("#result")
                self.assertIn("Contribution Received", t)
                self.assertIn("Publication is not guaranteed.", t)
                self.assertIn("rcpt_test", t)
                self.assertIn("a receipt cannot show you one", t)

    def test_publication_payload_is_normalised_the_way_the_server_expects(self):
        self.open()
        self.fill_valid("publication")
        self.submit()
        body = json.loads(self.sent[0]["body"])
        self.assertEqual(body["year"], 2023)
        self.assertIsInstance(body["year"], int)
        self.assertEqual(body["doi"], "10.48550/arxiv.2303.07103")
        self.assertEqual(body["url"], "https://arxiv.org/abs/2303.07103")
        self.assertEqual(self.contract_says(self.sent[0]["body"]).stored["content"]["doi"], "10.48550/arxiv.2303.07103")

    def test_a_chosen_display_name_is_sent_only_if_chosen_and_is_validated(self):
        self.open()
        self.fill_valid("perspective")
        self.page.check("#a-name")
        self.page.fill("#a-display", "A. Reader")
        self.submit()
        body = json.loads(self.sent[0]["body"])
        self.assertEqual(body["attribution"], {"mode": "display-name", "name": "A. Reader"})
        self.assertIn("Memory may need", body["title"])
        self.assertTrue(body["relatedQuestion"].startswith("Q"))
        self.assertEqual(self.contract_says(self.sent[0]["body"]).status, 202)
        self.sent.clear()
        self.open()
        self.fill_valid("perspective")
        self.page.check("#a-name")
        self.page.fill("#a-display", "x@example.com")
        self.submit()
        self.assertEqual(self.sent, [])
        self.assertIn("A display name needs 2 to 40 characters", self.text("#a-err"))

    def test_the_form_checks_what_the_server_checks_with_the_same_words(self):
        self.open("contribute-question")
        v = lambda t, vals, attr=None: self.page.evaluate("([t, v, a]) => window.__commonsTest.validateValues(t, v, a || {mode: 'anonymous'}).errs", [t, vals, attr])
        self.assertIn("question", v("question", {"question": "Too short?"}))
        self.assertIn("question", v("question", {"question": "See https://example.org for what I mean by this question"}))
        self.assertIn("question", v("question", {"question": "Write to me at someone@example.org about whether minds are special?"}))
        self.assertIn("question", v("question", {"question": "1234567890123456"}))
        self.assertIn("question", v("question", {"question": "x" * 401}))
        self.assertEqual(v("question", {"question": QUESTION}), {})
        base = {"title": "A paper title", "why": "w" * 45}
        self.assertIn("doi", v("publication", {**base, "doi": "not a doi"}))
        self.assertIn("url", v("publication", {**base, "url": "http://example.org/paper"}))
        self.assertIn("url", v("publication", {**base, "url": "https://bit.ly/abc"}))
        self.assertIn("url", v("publication", {**base, "url": "https://127.0.0.1/paper"}))
        self.assertIn("url", v("publication", {**base, "url": "https://user:pw@example.org/paper"}))
        self.assertIn("year", v("publication", {**base, "year": "99"}))
        self.assertEqual(v("publication", {**base, "doi": "doi:10.1000/xyz123.", "url": "https://example.org/paper", "year": "2021"}), {})
        self.assertIn("title", v("publication", {**base, "title": "Link https://example.org inside the title"}))
        self.assertIn("references", v("perspective", {"title": "A perspective title", "text": "t" * 205, "references": "http://a.org https://b.org https://c.org https://d.org"}))
        self.assertIn("title", v("topic", {"title": "short", "description": "d" * 70, "why": "w" * 45}))

    def test_server_refusals_keep_the_text_and_never_claim_success(self):
        cases = [
            ({"status": 429, "headers": {"retry-after": "1800"}, "body": {"ok": False, "error": {"code": "rate-limited", "message": "x"}}}, "Too many submissions", "about 30 minutes"),
            ({"status": 503, "body": None}, "had a problem on its side", "Your text is still here"),
            ({"status": 413, "body": {"ok": False, "error": {"code": "too-large", "message": "x"}}}, "did not accept the request (413)", "Your text is still here"),
            ({"abort": True}, "could not be reached", "Your text is still here"),
            ({"status": 200, "body": {"hello": "world"}}, "did not confirm", "treat it as not sent"),
            ({"status": 202, "body": {"ok": False}}, "did not confirm", "treat it as not sent"),
        ]
        for out, a, b in cases:
            with self.subTest(a=a, status=out.get("status")):
                self.reply = lambda req, out=out: out
                self.sent.clear()
                self.open()
                self.fill_valid("question")
                self.submit()
                self.assertEqual(len(self.sent), 1)
                msg = self.text("#form-msg")
                self.assertIn(a, msg)
                self.assertIn(b, msg)
                self.assertNotIn("Contribution Received", self.text())
                self.assertEqual(self.page.input_value("#f-question"), QUESTION, "the visitor's text is preserved")
                self.assertFalse(self.page.is_disabled("form.pf button[type=submit]"), "they can try again")

    def test_a_field_the_server_rejects_is_shown_beside_that_field(self):
        self.reply = lambda req: {"status": 422, "body": {"ok": False, "error": {"code": "invalid-field", "message": "x", "fields": {"question": "links-not-allowed-here"}}}}
        self.open()
        self.fill_valid("question")
        self.submit()
        self.assertIn("The service said: links-not-allowed-here", self.text("#f-question-err"))
        self.assertEqual(self.page.get_attribute("#f-question", "aria-invalid"), "true")
        self.assertNotIn("Contribution Received", self.text())

    def test_a_repeat_the_server_recognises_is_reported_as_such(self):
        self.reply = lambda req: {"status": 200, "body": {"ok": True, "receipt": "rcpt_test", "duplicate": True}}
        self.open()
        self.fill_valid("question")
        self.submit()
        self.assertIn("had already been received, so nothing new was created", self.text("#result"))

    def test_no_credentials_or_cookies_are_sent_and_the_request_goes_only_to_the_configured_service(self):
        self.open()
        self.fill_valid("topic")
        self.submit()
        self.assertEqual({s["url"] for s in self.sent}, {ENDPOINT})
        self.assertNotIn("cookie", self.sent[0]["headers"])
        self.assertNotIn("authorization", self.sent[0]["headers"])
        posts = [r for r in self.requests if r[0] == "POST"]
        self.assertEqual(posts, [("POST", ENDPOINT)])

    def test_words_the_lexicon_defines_and_similar_questions_are_suggested_while_writing(self):
        self.open("contribute-question")
        self.page.fill("#f-question", "Can an artificial system genuinely understand meaning?")
        self.page.wait_for_timeout(600)
        a = self.text("#assist")
        self.assertIn("Terms in your text that the Lexicon defines.", a)
        self.assertIn("Meaning", a)
        self.assertIn("A similar question may already exist (automatic suggestion).", a)
        self.assertIn("Yours is still welcome.", a)


class TestSharedInboxFallback(UI):
    site = "legacy"

    def test_only_questions_open_and_they_use_the_archives_exact_request(self):
        self.open()
        self.assertIn("Partly open", self.text())
        acts = self.page.eval_on_selector_all(".actions[aria-label='Primary actions'] a", "els => els.map(e => e.textContent)")
        self.assertNotIn("not open yet", next(a for a in acts if a.startswith("Propose")))
        self.assertIn("not open yet", next(a for a in acts if a.startswith("Recommend")))
        self.go("contribute-publication")
        self.assertTrue(self.page.is_disabled("form.pf button[type=submit]"))
        self.go("contribute-question")
        self.assertIn("share the Unanswered Archive's question inbox", self.text())
        self.assertEqual(self.page.query_selector_all("#f-explanation"), [], "the Archive's contract has no explanation field")
        self.assertEqual(self.page.query_selector_all("#a-name"), [], "and no attribution: a question there is anonymous")
        self.assertEqual(self.page.query_selector_all("#f-category option[value='human-machine']"), [], "only the Archive's six subjects")
        self.page.fill("#f-question", QUESTION)
        self.page.select_option("#f-category", "ai")
        self.page.check("#consent")
        self.advance()
        self.page.click("form.pf button[type=submit]")
        self.page.wait_for_timeout(400)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0]["url"], LEGACY)
        body = json.loads(self.sent[0]["body"])
        self.assertEqual(sorted(body), ["category", "consent", "elapsedMs", "hp", "question"], "exactly the existing request format, nothing more")
        self.assertEqual((body["question"], body["category"], body["consent"], body["hp"]), (QUESTION, "ai", True, ""))
        r = self.contract_says(self.sent[0]["body"], alias="question-submissions")
        self.assertEqual(r.status, 202, r.body)
        self.assertEqual(r.stored["origin"], "unanswered-archive")
        self.assertIn("Contribution Received", self.text("#result"))

    def test_a_legacy_2xx_is_enough_because_that_is_the_archives_contract(self):
        self.reply = lambda req: {"status": 200, "body": {}}
        self.open("contribute-question")
        self.page.fill("#f-question", QUESTION)
        self.page.check("#consent")
        self.advance()
        self.page.click("form.pf button[type=submit]")
        self.page.wait_for_timeout(400)
        t = self.text("#result")
        self.assertIn("Contribution Received", t)
        self.assertNotIn("Receipt:", t, "no receipt is shown unless the service returned one")


# ---------------------------------------------------------------------------------------------------------------- the private preview
class TestPrivatePreview(UI):
    preview = True

    def test_demonstration_records_are_off_until_switched_on_and_always_labelled(self):
        self.open("library")
        self.assertTrue(self.page.is_visible("#pv"))
        self.assertIn("Not the live site.", self.text("#pv"))
        self.assertEqual(self.page.query_selector_all("article.card"), [])
        self.page.check("#pv-demo")
        self.page.wait_for_timeout(250)
        cards = self.page.query_selector_all("article.card")
        self.assertEqual(len(cards), 6)
        for c in cards:
            self.assertIn("Demonstration (fictional)", c.text_content())
            self.assertIn("DEMO-", c.text_content())
        self.go("c-DEMO-0001")
        self.assertIn("invented for the private preview. It was not submitted by anyone.", self.text())
        self.page.uncheck("#pv-demo")
        self.page.wait_for_timeout(250)
        self.assertIn("No such contribution", self.text())

    def test_the_real_data_in_the_bundle_is_untouched_by_the_demonstration(self):
        self.open()
        n = self.page.evaluate("window.__commonsTest.state().C.contributions.length")
        self.assertEqual(n, 0)
        self.page.check("#pv-demo")
        self.assertEqual(self.page.evaluate("window.__commonsTest.state().C.contributions.length"), 0)
        self.assertIn("fictional demonstration records are switched on", self.text())

    def test_owner_drafts_are_labelled_unapproved_wherever_they_appear(self):
        self.open("guidelines")
        t = self.text()
        self.assertIn("Draft for the owner. Not adopted.", t)
        self.assertIn("visible only in this private preview", t)
        for head in ("What kinds of contribution are welcome", "How moderation works", "How to ask for a correction or withdrawal"):
            self.assertIn(head, t)
        self.go("contribute-question")
        f = self.text()
        self.assertIn("Draft wording for the owner. Not adopted.", f)
        self.assertIn("What would be stored", f)

    def test_simulated_service_shows_every_outcome_and_says_nothing_was_sent(self):
        outcomes = {"accept": ("Contribution Received", "Simulated. Nothing was sent or stored."), "429": ("Too many submissions", None), "503": ("had a problem on its side", None),
                    "422": ("did not accept some fields", None), "offline": ("could not be reached", None)}
        for key, (a, b) in outcomes.items():
            with self.subTest(key):
                self.open("contribute-question")
                self.page.select_option("#pv-out", key)
                self.page.fill("#f-question", QUESTION)
                self.page.check("#consent")
                self.advance()
                self.page.click("form.pf button[type=submit]")
                self.page.wait_for_timeout(900)
                self.assertIn(a, self.text("#form-area"))
                if b:
                    self.assertIn(b, self.text("#result"))
                else:
                    self.assertNotIn("Contribution Received", self.text("#form-area"))
                    self.assertEqual(self.page.input_value("#f-question"), QUESTION)
        self.assertEqual([r for r in self.requests if r[0] == "POST"], [])
        self.assertTrue(all(u.startswith(("file:", "data:")) or "fonts." in u for _, u in self.requests), "the preview touches no network")


# ---------------------------------------------------------------------------------------------------------------- phones
class TestPhone(UI):
    site = "fixture"
    width = 390

    def test_no_view_scrolls_sideways_and_nothing_is_wider_than_the_screen(self):
        self.open()
        for route in ("home", "contribute", "contribute-question", "contribute-publication", "contribute-perspective", "library", "c-COM-0001", "c-COM-0004", "correspondence",
                      "open-inquiries", "constellation", "collections", "guidelines", "about"):
            self.go(route)
            over = self.page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            self.assertLessEqual(over, 1, f"{route} scrolls sideways by {over}px")

    def test_the_constellation_starts_as_a_list_on_a_phone_and_the_map_can_be_shown(self):
        self.open("constellation")
        self.assertFalse(self.page.is_visible(".cn-map"))
        self.assertTrue(self.page.is_visible("#cn-list"))
        self.page.click("button:has-text('Show the map')")
        self.assertTrue(self.page.is_visible(".cn-map"))

    def test_form_controls_are_comfortable_to_tap(self):
        self.open("contribute-question")
        for sel in ("#f-question", "#f-category", "form.pf button[type=submit]", "text=Copy my draft", ".chooser button >> nth=0"):
            box = self.page.locator(sel).first.bounding_box()
            self.assertGreaterEqual(box["height"], 43, sel)
            self.assertLessEqual(box["width"], 390, sel)


if __name__ == "__main__":
    unittest.main(verbosity=1)
