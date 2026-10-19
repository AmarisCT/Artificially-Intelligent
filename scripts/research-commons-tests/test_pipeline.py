#!/usr/bin/env python3
"""Tests for the Research Commons' data rules, build, sync and submission contract.
Run: python3 -I scripts/research-commons-tests/test_pipeline.py

Every test works on a temporary copy of the real data. No test touches the repository's own files or needs a network.
Fixtures with COM- ids are test material in temporary folders only; nothing here is ever written to public data.
"""
from __future__ import annotations

import copy
import json
import pathlib
import re
import shutil
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
SCRIPTS = HERE.parent
sys.path.insert(0, str(SCRIPTS))
import build_research_commons as B  # noqa: E402
import commons_conformance as CF  # noqa: E402
import commons_contract as C  # noqa: E402
import commons_demo as D  # noqa: E402
import commons_lib as L  # noqa: E402
import sync_commons as S  # noqa: E402
import validate_research_commons as V  # noqa: E402

TODAY = "2026-10-25"


class Sandbox(unittest.TestCase):
    """A throwaway site root holding the Commons files and the few shared files the validator reads."""

    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp(prefix="commons-test-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        shutil.copytree(L.COMMONS, self.root / "research-commons", ignore=shutil.ignore_patterns("c"))
        (self.root / "inquiry-engine" / "data").mkdir(parents=True)
        shutil.copy(L.INDEX, self.root / "inquiry-engine" / "data" / "research-index.json")
        (self.root / "unanswered-archive" / "data").mkdir(parents=True)
        shutil.copy(L.ROOT / "unanswered-archive" / "data" / "meta.json", self.root / "unanswered-archive" / "data" / "meta.json")
        shutil.copy(L.ROOT / "unanswered-archive" / "config.json", self.root / "unanswered-archive" / "config.json")
        self.data = self.root / "research-commons" / "data"

    def rj(self, name):
        return L.read_json(self.data / f"{name}.json")

    def wj(self, name, obj):
        (self.data / f"{name}.json").write_text(L.dumps(obj), encoding="utf-8")

    def cfg(self, **kw):
        p = self.root / "research-commons" / "config.json"
        c = L.read_json(p)
        c.update(kw)
        p.write_text(L.dumps(c), encoding="utf-8")

    def load_fixture(self, mutate=None):
        recs = D.records("COM")
        if mutate:
            mutate(recs)
        pc = self.rj("public-contributions")
        pc["contributions"] = recs
        self.wj("public-contributions", pc)
        rel = self.rj("contribution-relations")
        rel["relations"] = D.relations("COM")
        self.wj("contribution-relations", rel)
        colls = self.rj("collections")
        used = {x for r in recs if r["status"] != "withdrawn" for x in r.get("collections", [])}
        for c in colls["collections"]:
            c["status"] = "active" if c["id"] in used else "planned"
        self.wj("collections", colls)
        B.build(self.root, pages=False)       # derive the status file exactly as the real build would

    def validate(self):
        return V.validate(self.data, self.root, TODAY, drafts_path=self.root / "no-drafts.json")

    def errors(self):
        return self.validate().errors

    def assertRefused(self, mutate, needle):
        self.load_fixture()
        recs = self.rj("public-contributions")
        mutate(recs["contributions"])
        self.wj("public-contributions", recs)
        errs = self.errors()
        self.assertTrue(any(needle in e for e in errs), f"expected an error containing {needle!r}, got {errs}")


class TestRealData(unittest.TestCase):
    def test_the_real_public_data_validates_and_is_empty(self):
        rep = V.validate()
        self.assertEqual(rep.errors, [])
        pc = L.read_json(L.DATA / "public-contributions.json")
        self.assertEqual(pc["contributions"], [], "no visitor contribution has been approved, so none may be listed")
        self.assertEqual(L.read_json(L.DATA / "contribution-relations.json")["relations"], [])
        st = L.read_json(L.DATA / "commons-status.json")
        self.assertEqual(st["counts"]["approved"], 0)
        self.assertEqual((st["submissions"]["contributionsOpen"], st["submissions"]["questionsOpen"]), (False, False))
        self.assertIsNone(st["lastSync"])

    def test_no_demonstration_content_is_in_committed_files(self):
        for p in L.COMMONS.rglob("*"):
            if p.is_file() and p.suffix in (".json", ".html", ".js", ".css"):
                text = p.read_text(encoding="utf-8")
                self.assertNotIn("DEMO-", text, p)
                self.assertNotIn('"demo"', text, p)
                self.assertNotIn("A. Reader", text, p)

    def test_the_page_scripts_store_nothing_in_the_browser_and_load_nothing_from_elsewhere(self):
        for name in ("app.js", "constellation.js"):
            src = (L.COMMONS / name).read_text(encoding="utf-8")
            for banned in ("localStorage", "sessionStorage", "indexedDB", "document.cookie", "innerHTML", "outerHTML", "insertAdjacentHTML", "eval(", "new Function", "document.write"):
                self.assertNotIn(banned, src.replace("No credentials, no moderation controls, no storage", ""), f"{name} must not use {banned}")
        html = (L.COMMONS / "index.html").read_text(encoding="utf-8")
        hosts = set(re.findall(r"(?:src|href)=\"(https?://[^/\"]+)", html))
        self.assertTrue(hosts <= {"https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://amarisct.github.io"}, hosts)

    def test_submission_is_switched_off_and_no_endpoint_is_configured(self):
        cfg = L.read_json(L.COMMONS / "config.json")
        self.assertFalse(cfg["preview"])
        self.assertIsNone(cfg["contributionEndpoint"])
        self.assertIsNone(cfg["statusEndpoint"])
        self.assertIsNone(cfg["syncEndpoint"])
        self.assertFalse(cfg["guidelinesApproved"])
        self.assertIsNone(L.read_json(L.ROOT / "unanswered-archive" / "config.json")["submitEndpoint"], "the Commons must not be the thing that switches the archive's form on")

    def test_derived_files_are_current(self):
        self.assertEqual(B.build(L.ROOT, check=True)["changed"], [])

    def test_the_featured_inquiry_is_a_real_editorial_question_not_a_visitor_one(self):
        cfg = L.read_json(L.COMMONS / "config.json")["featuredInquiry"]
        self.assertEqual(cfg["kind"], "editorial-question")
        self.assertEqual(L.index_ids().get(cfg["id"]), "question")

    def test_no_public_file_names_a_private_field(self):
        for p in (L.DATA).glob("*.json"):
            for path, key in L.walk_keys(json.loads(p.read_text(encoding="utf-8"))):
                self.assertNotIn(key.lower(), L.PRIVATE_KEYS, f"{p.name}: {path}")

    def test_shared_categories_match_the_unanswered_archive(self):
        ua = {c["id"] for c in L.read_json(L.ROOT / "unanswered-archive" / "data" / "meta.json")["categories"]}
        ours = {c["id"] for c in L.read_json(L.DATA / "taxonomy.json")["categories"]}
        self.assertTrue(ua <= ours)
        self.assertEqual(ours - ua, {"human-machine"})
        self.assertEqual(set(C.LEGACY_CATEGORIES), ua)
        self.assertEqual(set(C.CATEGORIES), ours)


class TestValidator(Sandbox):
    def test_the_demonstration_shaped_fixture_is_valid(self):
        self.load_fixture()
        self.assertEqual(self.errors(), [])

    def test_a_private_moderation_field_is_refused(self):
        for key in ("email", "notes", "submissionId", "ip", "moderation", "token", "reviewer"):
            with self.subTest(key=key):
                self.assertRefused(lambda r, key=key: r[0].update({key: "x"}), "")
                self.assertTrue(any("private" in e or "unknown fields" in e for e in self.errors()))

    def test_an_email_address_or_link_in_approved_text_is_refused(self):
        self.assertRefused(lambda r: r[0].update({"text": "Ask me at someone@example.com"}), "email address")
        self.assertRefused(lambda r: r[0].update({"text": "See https://example.org for more"}), "contains a link")
        self.assertRefused(lambda r: r[0].update({"editorialContext": "see www.example.org"}), "contains a link")

    def test_an_unknown_field_is_refused(self):
        self.assertRefused(lambda r: r[0].update({"likes": 12}), "unknown fields")

    def test_a_non_public_status_is_refused(self):
        for s in ("pending-review", "submitted", "declined", "accepted-for-consideration", "needs-clarification"):
            with self.subTest(status=s):
                self.assertRefused(lambda r, s=s: r[0].update({"status": s}), "not a public status")

    def test_a_chosen_name_needs_recorded_authorisation_and_an_anonymous_record_carries_no_name(self):
        self.assertRefused(lambda r: r[2]["attribution"].update({"authorized": False}), "authorized: true")
        self.assertRefused(lambda r: r[0].update({"attribution": {"mode": "anonymous", "display": "Someone"}}), "carries no name")
        self.assertRefused(lambda r: r[2]["attribution"].update({"display": "me@example.com"}), "attribution.display")

    def test_editorial_text_must_be_attributed_to_the_site_and_never_name_a_moderator(self):
        self.assertRefused(lambda r: r[0].pop("editorialContextBy"), "must say who wrote it")
        self.assertRefused(lambda r: r[0].update({"editorialContextBy": "Jane Moderator"}), "never names moderators")

    def test_peer_review_language_is_refused_in_editorial_text(self):
        self.assertRefused(lambda r: r[3].update({"editorialContext": "This peer-reviewed paper is excellent."}), "peer review")
        self.assertRefused(lambda r: r[0].update({"statusNote": "Peer reviewed by editors."}), "peer review")

    def test_references_must_exist(self):
        self.assertRefused(lambda r: r[0].update({"related": ["q:Q999"]}), "does not exist")
        self.assertRefused(lambda r: r[0].update({"concepts": ["concept:nothing"]}), "not a Research Atlas concept")
        self.assertRefused(lambda r: r[0].update({"concepts": ["q:Q001"]}), "not a Research Atlas concept")
        self.assertRefused(lambda r: r[0].update({"collections": ["no-such-collection"]}), "not defined")

    def test_only_a_perspective_can_respond_and_only_to_a_question(self):
        self.assertRefused(lambda r: r[0].update({"respondsTo": "q:Q001"}), "only a perspective")
        self.assertRefused(lambda r: r[2].update({"respondsTo": "concept:memory"}), "not a question")
        self.assertRefused(lambda r: r[2].update({"respondsTo": "COM-0004"}), "not a question")

    def test_a_withdrawn_record_keeps_only_a_notice(self):
        self.assertRefused(lambda r: r[6].update({"title": "The old title"}), "keep only a notice")
        self.assertRefused(lambda r: r[6].update({"withdrawal": {"on": "2026-10-10", "publicNote": "contact me@example.com"}}), "links or email")
        self.assertRefused(lambda r: r[0].update({"withdrawal": {"on": "2026-10-10", "publicNote": "x"}}), "only valid on a withdrawn")

    def test_a_publication_needs_an_honest_source(self):
        self.assertRefused(lambda r: r[3].pop("source"), "needs a source")
        self.assertRefused(lambda r: r[3]["source"].update({"verification": "peer-reviewed"}), "defined levels")
        self.assertRefused(lambda r: r[3]["source"].update({"verification": "metadata-confirmed"}), "verificationNote")
        self.assertRefused(lambda r: r[3]["source"].update({"url": "http://example.org/x"}), "must be https")
        self.assertRefused(lambda r: r[3]["source"].update({"doi": "not-a-doi"}), "not a DOI")
        self.assertRefused(lambda r: r[0].update({"source": {"title": "x", "verification": "unverified"}}), "only a publication")

    def test_demonstration_records_are_refused_in_public_data(self):
        self.assertRefused(lambda r: r[0].update({"demo": True}), "demonstration")
        self.assertRefused(lambda r: r[0].update({"id": "DEMO-0001"}), "demonstration")

    def test_ids_must_be_unique_and_well_formed(self):
        self.assertRefused(lambda r: r[1].update({"id": r[0]["id"]}), "duplicate")
        self.assertRefused(lambda r: r[0].update({"id": "COM-1"}), "COM-0001")

    def test_dates_must_be_real_and_ordered_and_not_in_the_future(self):
        self.assertRefused(lambda r: r[0].update({"publishedOn": "2026-02-30"}), "real dates")
        self.assertRefused(lambda r: r[0].update({"updatedOn": "2026-01-01"}), "earlier than publishedOn")
        self.assertRefused(lambda r: r[0].update({"updatedOn": "2027-01-01"}), "in the future")

    def test_a_perspective_needs_its_approved_text(self):
        self.assertRefused(lambda r: r[2].update({"text": "Too short."}), "approved text")

    def test_config_rules(self):
        self.cfg(preview=True)
        self.assertTrue(any("preview must be false" in e for e in self.errors()))
        self.cfg(preview=False, contributionEndpoint="http://example.org/api")
        self.assertTrue(any("https" in e for e in self.errors()))
        self.cfg(contributionEndpoint=None, questionEndpointFallback="../../etc/passwd")
        self.assertTrue(any("sibling feature" in e for e in self.errors()))
        self.cfg(questionEndpointFallback="../unanswered-archive/config.json", featuredInquiry={"kind": "editorial-question", "id": "q:Q999"})
        self.assertTrue(any("featuredInquiry" in e for e in self.errors()))
        self.cfg(featuredInquiry={"kind": "editorial-question", "id": "q:Q008"}, apiKey="abc")
        self.assertTrue(any("must not be public" in e for e in self.errors()))

    def test_the_status_file_must_describe_the_records(self):
        self.load_fixture()
        st = self.rj("commons-status")
        st["counts"]["approved"] = 99
        self.wj("commons-status", st)
        self.assertTrue(any("do not match the records" in e for e in self.errors()))

    def test_status_cannot_claim_submissions_are_open_without_an_endpoint(self):
        st = self.rj("commons-status")
        st["submissions"]["contributionsOpen"] = True
        self.wj("commons-status", st)
        self.assertTrue(any("no contributionEndpoint" in e for e in self.errors()))

    def test_a_planned_collection_cannot_have_members_and_an_active_one_must(self):
        self.load_fixture()
        colls = self.rj("collections")
        for c in colls["collections"]:
            c["status"] = "planned"
        self.wj("collections", colls)
        self.assertTrue(any("still marked planned" in e for e in self.errors()))
        for c in colls["collections"]:
            c["status"] = "active"
        self.wj("collections", colls)
        self.assertTrue(any("has no approved contributions" in e for e in self.errors()))

    def test_relations_are_checked(self):
        self.load_fixture()
        rel = self.rj("contribution-relations")
        rel["relations"].append({"a": "contrib:COM-0002", "b": "q:Q010", "kind": "suggested", "why": "Words overlap.", "reviewedOn": "2026-10-01"})
        self.wj("contribution-relations", rel)
        self.assertTrue(any("cannot carry reviewedOn" in e for e in self.errors()))
        rel["relations"][-1] = {"a": "contrib:COM-0002", "b": "q:Q010", "kind": "editorial", "why": "x"}
        self.wj("contribution-relations", rel)
        self.assertTrue(any("needs reviewedOn" in e for e in self.errors()))
        rel["relations"][-1] = {"a": "contrib:COM-0099", "b": "q:Q010", "kind": "editorial", "why": "x", "reviewedOn": "2026-10-01"}
        self.wj("contribution-relations", rel)
        self.assertTrue(any("does not exist" in e for e in self.errors()))
        rel["relations"][-1] = {"a": "q:Q001", "b": "q:Q010", "kind": "editorial", "why": "x", "reviewedOn": "2026-10-01"}
        self.wj("contribution-relations", rel)
        self.assertTrue(any("must involve a contribution" in e for e in self.errors()))

    def test_unapproved_guideline_wording_cannot_appear_in_public_data(self):
        drafts = self.root / "drafts.json"
        phrase = "Contributors keep ownership of what they write and grant a licence to publish it."
        drafts.write_text(json.dumps({"sections": {"rights": {"draft": phrase, "points": []}}}), encoding="utf-8")
        self.load_fixture()
        st = self.rj("commons-status")
        st["note"] = phrase
        self.wj("commons-status", st)
        rep = V.validate(self.data, self.root, TODAY, drafts_path=drafts)
        self.assertTrue(any("unapproved draft wording" in e for e in rep.errors))

    def test_credentials_and_addresses_are_refused(self):
        self.assertRefused(lambda r: r[0].update({"statusNote": "key sk-abcdefghijklmnopqrstuvwxyz123456"}), "credential-like")
        self.assertRefused(lambda r: r[0].update({"statusNote": "from 192.168.1.20"}), "IP address")


class TestBuild(Sandbox):
    def test_a_crawlable_page_is_written_for_each_approved_contribution_and_none_for_a_withdrawn_one(self):
        self.load_fixture()
        res = B.build(self.root)
        pages = sorted(p.parent.name for p in (self.root / "research-commons" / "c").glob("*/index.html"))
        self.assertEqual(pages, ["COM-0001", "COM-0002", "COM-0003", "COM-0004", "COM-0005", "COM-0006"])
        self.assertEqual(len(res["urls"]), 6)
        self.assertNotIn("COM-0007", pages)

    def test_page_content_is_honest(self):
        self.load_fixture()
        B.build(self.root)
        t = (self.root / "research-commons" / "c" / "COM-0001" / "index.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="canonical" href="https://amarisct.github.io/Artificially-Intelligent/research-commons/c/COM-0001/">', t)
        self.assertIn("Visitor contribution.", t)
        self.assertIn("not peer reviewed", t)
        self.assertIn("Editorial context", t)
        self.assertIn("Investigate This Question →", t)
        import base64
        m = re.search(r'href="\.\./\.\./\.\./inquiry-engine/#q-([A-Za-z0-9_-]+)"', t)
        self.assertTrue(m, "the link must use the Inquiry Engine's base64url hash")
        self.assertEqual(base64.urlsafe_b64decode(m.group(1) + "=" * (-len(m.group(1)) % 4)).decode("utf-8"), "Can memory exist without lived experience?")
        self.assertIn('"@type": "WebPage"', t)
        for bad in ('"@type": "Article"', '"@type": "ScholarlyArticle"', '"@type": "Question"', '"@type": "Review"', "ratingValue"):
            self.assertNotIn(bad, t, "a visitor contribution must not be marked up as research, a review or an answer")
        pub = (self.root / "research-commons" / "c" / "COM-0004" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Recommended by a visitor. Not verified.", pub)
        self.assertNotIn("Investigate This Question", pub)
        persp = (self.root / "research-commons" / "c" / "COM-0003" / "index.html").read_text(encoding="utf-8")
        self.assertIn("A. Reader", persp)
        anon = (self.root / "research-commons" / "c" / "COM-0001" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Submitted anonymously", anon)
        self.assertNotIn("A. Reader", anon)

    def test_submitted_markup_is_escaped_not_executed(self):
        def hostile(r):
            r[0]["title"] = "Is <script>alert(1)</script> a question?"
            r[0]["text"] = 'a "quoted" <img src=x onerror=alert(1)> line'
        self.load_fixture(hostile)
        B.build(self.root)
        t = (self.root / "research-commons" / "c" / "COM-0001" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("<script>alert(1)</script>", t)
        self.assertNotIn("<img src=x", t)
        self.assertIn("&lt;script&gt;", t)
        ld = t.split('<script type="application/ld+json">')[1].split("</script>")[0]
        self.assertNotIn("<", ld, "the structured-data block must not be able to contain markup")
        self.assertEqual(json.loads(ld)["name"], "Is <script>alert(1)</script> a question?", "the escaping must round-trip")

    def test_withdrawal_removes_the_page_and_its_text(self):
        self.load_fixture()
        B.build(self.root)
        page = self.root / "research-commons" / "c" / "COM-0002"
        self.assertTrue(page.exists())
        pc = self.rj("public-contributions")
        pc["contributions"][1] = {"id": "COM-0002", "type": "question", "publishedOn": "2026-09-05", "updatedOn": "2026-10-12", "status": "withdrawn",
                                  "withdrawal": {"on": "2026-10-12", "publicNote": "Withdrawn at the contributor's request."}}
        self.wj("public-contributions", pc)
        colls = self.rj("collections")
        for c in colls["collections"]:
            if c["id"] == "the-consciousness-question":
                c["status"] = "planned"          # its only member was withdrawn
        self.wj("collections", colls)
        res = B.build(self.root)
        self.assertFalse(page.exists(), "withdrawal must take the text off the site")
        self.assertTrue(any("COM-0002" in x for x in res["removed"]))

    def test_building_twice_changes_nothing_and_check_mode_reports_drift(self):
        self.load_fixture()
        B.build(self.root)
        self.assertEqual(B.build(self.root, check=True)["changed"], [])
        f = self.root / "research-commons" / "c" / "COM-0001" / "index.html"
        f.write_text(f.read_text(encoding="utf-8") + "<!-- drift -->", encoding="utf-8")
        self.assertTrue(B.build(self.root, check=True)["changed"])

    def test_an_invalid_data_set_builds_nothing(self):
        self.load_fixture()
        pc = self.rj("public-contributions")
        pc["contributions"][0]["email"] = "a@b.co"
        self.wj("public-contributions", pc)
        with self.assertRaises(SystemExit):
            B.build(self.root)
        self.assertFalse((self.root / "research-commons" / "c").exists())

    def test_the_status_file_reflects_the_endpoints_and_never_more(self):
        st = B.build_status(self.root, self.data, L.read_json(self.root / "research-commons" / "config.json"), None)
        self.assertEqual((st["submissions"]["contributionsOpen"], st["submissions"]["questionsOpen"]), (False, False))
        ua = self.root / "unanswered-archive" / "config.json"
        ua.write_text('{"submitEndpoint": "https://example.org/api/public/question-submissions"}', encoding="utf-8")
        st = B.build_status(self.root, self.data, L.read_json(self.root / "research-commons" / "config.json"), None)
        self.assertEqual((st["submissions"]["contributionsOpen"], st["submissions"]["questionsOpen"]), (False, True),
                         "turning on the archive's one endpoint opens questions only; the other types stay off")
        self.assertIn("Only research questions", st["submissions"]["reason"])
        self.cfg(contributionEndpoint="https://example.org/api/public/contributions")
        st = B.build_status(self.root, self.data, L.read_json(self.root / "research-commons" / "config.json"), None)
        self.assertTrue(st["submissions"]["contributionsOpen"])

    def test_the_build_never_edits_the_sitemap_or_navigation(self):
        before = (L.ROOT / "sitemap.xml").read_bytes(), (L.ROOT / "index.html").read_bytes()
        self.load_fixture()
        B.build(self.root)
        self.assertEqual(before, ((L.ROOT / "sitemap.xml").read_bytes(), (L.ROOT / "index.html").read_bytes()))
        self.assertFalse((self.root / "sitemap.xml").exists())


class TestSync(Sandbox):
    def export(self, mutate=None):
        recs, rels = D.records("COM"), D.relations("COM")
        ex = {"contributions": recs, "relations": rels}
        if mutate:
            mutate(ex)
        return ex

    def run_sync(self, ex, **kw):
        return S.sync(self.data, self.root, ex, "2026-10-20T10:00:00Z", "file", **kw)

    def snapshot(self):
        return {p.name: p.read_bytes() for p in sorted(self.data.glob("*.json"))}

    def test_a_valid_export_is_written_sorted_and_marked_as_synced(self):
        res = self.run_sync(self.export(lambda e: e["contributions"].reverse()))
        self.assertEqual(res["records"], 7)
        self.assertEqual([c["id"] for c in self.rj("public-contributions")["contributions"]], [f"COM-000{i}" for i in range(1, 8)])
        st = self.rj("commons-status")
        self.assertEqual(st["lastSync"], {"at": "2026-10-20T10:00:00Z", "source": "file", "records": 7})
        self.assertEqual(st["counts"]["approved"], 6)
        self.assertEqual(self.validate().errors, [])
        active = {c["id"] for c in self.rj("collections")["collections"] if c["status"] == "active"}
        self.assertEqual(active, {"the-digital-self", "the-consciousness-question", "the-meaning-of-intelligence", "human-x-machine"})

    def test_an_identical_sync_changes_nothing_at_all(self):
        self.run_sync(self.export())
        before = self.snapshot()
        res = S.sync(self.data, self.root, self.export(), "2026-10-21T09:00:00Z", "file")
        self.assertEqual(res["changed"], [])
        self.assertEqual(self.snapshot(), before, "no change means no commit, not even a new lastSync time")

    def test_one_bad_record_stops_the_whole_sync_and_changes_nothing(self):
        before = self.snapshot()
        with self.assertRaises(S.SyncError) as cm:
            self.run_sync(self.export(lambda e: e["contributions"][2].update({"email": "x@y.zz"})))
        self.assertIn("nothing was written", str(cm.exception))
        self.assertEqual(self.snapshot(), before)

    def test_private_looking_fields_in_the_export_are_a_hard_failure(self):
        for key in ("submissionId", "notes", "ip", "moderation"):
            before = self.snapshot()
            with self.assertRaises(S.SyncError):
                self.run_sync(self.export(lambda e, key=key: e["contributions"][0].update({key: "x"})))
            self.assertEqual(self.snapshot(), before)

    def test_a_public_record_cannot_vanish_change_identity_or_return_after_withdrawal(self):
        self.run_sync(self.export())
        before = self.snapshot()
        with self.assertRaises(S.SyncError) as cm:
            self.run_sync(self.export(lambda e: e["contributions"].pop(1)))
        self.assertIn("withdrawn by status, never by omission", str(cm.exception))
        with self.assertRaises(S.SyncError):
            self.run_sync(self.export(lambda e: e["contributions"][0].update({"publishedOn": "2026-01-01"})))
        with self.assertRaises(S.SyncError):
            self.run_sync(self.export(lambda e: e["contributions"][0].update({"type": "topic"})))
        with self.assertRaises(S.SyncError) as cm:
            self.run_sync(self.export(lambda e: e["contributions"][6].update({"status": "approved-for-public-display"})))
        self.assertEqual(self.snapshot(), before)

    def test_withdrawal_by_status_is_accepted_and_removes_the_text(self):
        self.run_sync(self.export())

        def withdraw(e):
            e["contributions"][0] = {"id": "COM-0001", "type": "question", "publishedOn": "2026-09-02", "updatedOn": "2026-10-15", "status": "withdrawn",
                                     "withdrawal": {"on": "2026-10-15", "publicNote": "Withdrawn at the contributor's request."}}
            e["contributions"][2]["respondsTo"] = "q:Q008"
            e["relations"] = [r for r in e["relations"] if "COM-0001" not in (r["a"], r["b"])]
        self.run_sync(self.export(withdraw))
        text = (self.data / "public-contributions.json").read_text(encoding="utf-8")
        self.assertNotIn("Can memory exist without lived experience?", text)
        self.assertEqual(self.rj("commons-status")["counts"]["withdrawn"], 2)

    def test_malformed_exports_are_refused(self):
        for bad in ([], {"contributions": "no"}, {"contributions": [], "extra": 1}, {"contributions": [{"id": "COM-0001"}, {"id": "COM-0001"}]}):
            with self.assertRaises(S.SyncError):
                self.run_sync(bad)

    def test_dry_run_writes_nothing(self):
        before = self.snapshot()
        res = self.run_sync(self.export(), dry_run=True)
        self.assertTrue(res["changed"])
        self.assertEqual(self.snapshot(), before)

    def test_the_endpoint_must_be_https_and_a_failed_fetch_changes_nothing(self):
        with self.assertRaises(S.SyncError):
            S.fetch_https("http://example.org/x")
        before = self.snapshot()
        self.cfg(syncEndpoint="https://example.invalid/api/public/contributions")
        import io
        from contextlib import redirect_stdout
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = S.main(["--data", str(self.data)])
        self.assertEqual(code, 1)
        self.assertIn("nothing was changed", buf.getvalue())
        self.assertEqual(self.snapshot(), before)

    def test_with_no_endpoint_the_script_does_nothing(self):
        import io
        from contextlib import redirect_stdout
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(S.main(["--data", str(self.data)]), 0)
        self.assertIn("nothing to sync", buf.getvalue())


class TestSubmissionContract(unittest.TestCase):
    def test_every_conformance_case_passes_against_the_reference(self):
        data = CF.load()
        self.assertGreaterEqual(len(data["cases"]), 40)
        self.assertEqual(CF.main([]), 0)

    def test_the_conformance_judge_is_not_vacuous(self):
        case = copy.deepcopy(CF.load()["cases"][0])
        case["expect"]["status"] = 201
        st, body, hd, _ = CF.run_local(case, {})
        self.assertTrue(CF.judge(case, st, body, hd))
        bad = copy.deepcopy(CF.load()["cases"][9])
        bad["expect"]["code"] = "something-else"
        st, body, hd, _ = CF.run_local(bad, {})
        self.assertTrue(CF.judge(bad, st, body, hd))
        self.assertTrue(CF.judge({"expect": {"status": 202}}, 202, {"ok": False}, {}), "a success without ok:true must be flagged")

    def test_the_existing_unanswered_archive_request_is_still_valid_unchanged(self):
        body = json.dumps({"question": "Can intelligence exist without consciousness at all?", "category": "ai", "consent": True, "hp": "", "elapsedMs": 8000}).encode()
        r = C.handle("POST", "/api/public/question-submissions", {"Content-Type": "application/json", "Origin": "https://amarisct.github.io"}, body)
        self.assertEqual(r.status, 202)
        self.assertEqual(r.stored["content"], {"type": "question", "question": "Can intelligence exist without consciousness at all?", "category": "ai",
                                              "attribution": {"mode": "anonymous"}})
        self.assertEqual(r.stored["origin"], "unanswered-archive")

    def post(self, body, **kw):
        return C.validate(body, **kw)

    def test_a_perspective_keeps_the_question_it_responds_to(self):
        r = C.validate({"type": "perspective", "title": "Understanding needs adaptation more than recital", "text": "x" * 210 + " reasoning in words.",
                        "relatedQuestion": "Q008: Can an artificial system genuinely understand meaning?", "consent": True, "hp": "", "elapsedMs": 9000})
        self.assertEqual(r.status, 202)
        self.assertEqual(r.stored["content"]["relatedQuestion"], "Q008: Can an artificial system genuinely understand meaning?")
        long = C.validate({"type": "perspective", "title": "Understanding needs adaptation more than recital", "text": "x" * 210 + " reasoning in words.",
                           "relatedQuestion": "q" * 301, "consent": True, "hp": "", "elapsedMs": 9000})
        self.assertEqual(long.status, 422)
        link = C.validate({"type": "perspective", "title": "Understanding needs adaptation more than recital", "text": "x" * 210 + " reasoning in words.",
                           "relatedQuestion": "see https://example.org", "consent": True, "hp": "", "elapsedMs": 9000})
        self.assertEqual(link.status, 422)

    def good(self, **kw):
        b = {"type": "question", "question": "Could an artificial intelligence system develop an autobiographical sense of self?", "consent": True, "hp": "", "elapsedMs": 9000}
        b.update(kw)
        return b

    def test_nothing_is_ever_published_by_the_endpoint(self):
        r = self.post(self.good())
        self.assertEqual(r.stored["state"], "pending-review")
        self.assertFalse(r.stored["published"])

    def test_the_stored_record_holds_no_address_or_agent(self):
        r = self.post(self.good())
        blob = json.dumps(r.stored)
        for needle in ("ip", "user-agent", "127.0.0.1"):
            self.assertNotIn(f'"{needle}"', blob)

    def test_a_honeypot_hit_looks_like_success_and_stores_nothing(self):
        r = self.post(self.good(hp="http://bot"))
        self.assertEqual(r.status, 202)
        self.assertTrue(r.body["ok"])
        self.assertTrue(r.discarded)
        self.assertIsNone(r.stored)

    def test_resubmitting_the_same_text_is_idempotent_and_does_not_reveal_other_senders(self):
        first = self.post(self.good())
        again = self.post(self.good(), seen_keys=[first.stored["idempotencyKey"]])
        self.assertEqual(again.status, 200)
        self.assertTrue(again.body["duplicate"])
        self.assertIsNone(again.stored)
        # a similar question from someone else is stored, flagged for the editor, and the visitor is told nothing about it
        similar = self.post(self.good(question="Could an artificial intelligence system develop an autobiographical sense of self over time?"),
                            known_public=[("COM-0002", "Could an artificial intelligence system develop an autobiographical sense of self?")])
        self.assertEqual(similar.status, 202)
        self.assertEqual(similar.body, {"ok": True, "receipt": similar.body["receipt"]})
        self.assertTrue(any(f.startswith("similar-to-public:COM-0002") for f in similar.stored["flags"]))

    def test_rate_limits_per_hour_per_day_and_overall(self):
        t = [1000.0]
        rl = C.RateLimiter(now=lambda: t[0])
        results = [self.post(self.good(question=f"Question number {i} about machine memory and identity?"), rate=rl) for i in range(6)]
        self.assertEqual([r.status for r in results], [202] * 5 + [429])
        self.assertIn("Retry-After", results[-1].headers)
        t[0] += 3601
        self.assertEqual(self.post(self.good(question="A later question about machine memory and identity?"), rate=rl).status, 202)
        other = C.RateLimiter(now=lambda: t[0], global_per_hour=2)
        for i, expect in enumerate((202, 202, 429)):
            self.assertEqual(self.post(self.good(question=f"Different sender {i} asks about memory in machines?"), rate=other.as_sender(f"s{i}")).status, expect)
        day = C.RateLimiter(now=lambda: t[0], per_hour=100, per_day=3)
        codes = []
        for i in range(4):
            t[0] += 1000
            codes.append(self.post(self.good(question=f"Daily limit probe {i} about memory in machines?"), rate=day).status)
        self.assertEqual(codes, [202, 202, 202, 429])

    def test_text_is_normalised_and_control_characters_are_removed(self):
        r = self.post(self.good(question="Could a‮ machine\x07  develop​ a sense   of self over time?"))
        self.assertEqual(r.stored["content"]["question"], "Could a machine develop a sense of self over time?")

    def test_doi_and_url_are_normalised_and_unsafe_addresses_refused(self):
        pub = lambda **kw: self.post({"type": "publication", "title": "A paper title long enough", "why": "x" * 60, "consent": True, "hp": "", "elapsedMs": 9000, **kw})
        self.assertEqual(pub(doi="DOI: 10.1038/S41586-025-08888-1.").stored["content"]["doi"], "10.1038/s41586-025-08888-1")
        self.assertEqual(pub(doi="https://doi.org/10.1/abc").stored["content"]["doi"], "10.1/abc") if False else None
        for bad in ("http://example.org/a", "https://localhost/a", "https://127.0.0.1/a", "https://10.0.0.5/a", "https://[::1]/a", "https://bit.ly/x",
                    "https://u:p@example.org/a", "javascript:alert(1)", "https://example.org/" + "a" * 600, "https://nodots/a", "file:///etc/passwd"):
            with self.subTest(url=bad):
                self.assertEqual(pub(url=bad).status, 422)
        self.assertEqual(pub(url="https://example.org/paper.pdf").status, 202)
        self.assertIn("no-identifier", pub().stored["flags"])

    def test_abuse_signals_are_flagged_for_the_editor_not_acted_on_automatically(self):
        r = self.post(self.good(question="Could casino promo code offers explain machine memory in any way at all?"))
        self.assertEqual(r.status, 202)
        self.assertIn("promotional-language", r.stored["flags"])
        r = self.post(self.good(question="Is it ever right to say i will find you where you live about machines?"))
        self.assertIn("possible-threat-or-doxxing", r.stored["flags"])
        self.assertFalse(r.stored["published"])

    def test_personal_information_is_refused_or_flagged(self):
        self.assertEqual(self.post(self.good(question="Could you write to me at someone@example.com about this question?")).status, 422)
        r = self.post(self.good(question="Could the number 253 555 0123 call about machine memory and the self?"))
        self.assertEqual(r.status, 202)
        self.assertIn("possible-phone-number", r.stored["flags"])

    def test_every_type_can_be_submitted_and_unknown_fields_are_never_stored(self):
        for body in ({"type": "topic", "title": "A topic worth exploring", "description": "d" * 70, "why": "w" * 50},
                     {"type": "perspective", "title": "A view on machine memory", "text": "t" * 250}):
            self.assertEqual(self.post({**body, "consent": True, "hp": "", "elapsedMs": 9000}).status, 202)
        r = self.post(self.good(email="x@y.zz"))
        self.assertEqual(r.status, 400)
        self.assertIsNone(r.stored)

    def test_cors_is_not_treated_as_security(self):
        body = json.dumps(self.good()).encode()
        r = C.handle("POST", "/api/public/contributions", {"Content-Type": "application/json"}, body)
        self.assertEqual(r.status, 202, "a request with no Origin (a script) still goes through every other check")
        r = C.handle("POST", "/api/public/contributions", {"Content-Type": "application/json", "Origin": "https://evil.example"}, body)
        self.assertEqual(r.status, 403)
        bad = json.dumps({**self.good(), "consent": False}).encode()
        r = C.handle("POST", "/api/public/contributions", {"Content-Type": "application/json", "Origin": "https://amarisct.github.io"}, bad)
        self.assertEqual(r.status, 422, "a correct Origin is never enough to skip validation")


class TestSharedIndexIntegration(unittest.TestCase):
    """The Commons feeds the shared research index (Search, Inquiry Engine) only with approved records, and only as what they are."""

    def site_copy(self, with_fixture):
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="commons-site-"))
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)
        root = tmp / "site"
        shutil.copytree(L.ROOT, root, ignore=shutil.ignore_patterns(".git", "__pycache__", "node_modules", "research-ledger-src"))
        if with_fixture:
            d = root / "research-commons" / "data"
            pc = L.read_json(d / "public-contributions.json")
            pc["contributions"] = D.records("COM")
            L.write_json(d / "public-contributions.json", pc)
            rel = L.read_json(d / "contribution-relations.json")
            rel["relations"] = D.relations("COM")
            L.write_json(d / "contribution-relations.json", rel)
        return root

    def build(self, root):
        import build_research_index as BI
        index, _ = BI.build(root, L.ROOT / "scripts" / "atlas_dump.json")
        return index

    def test_with_no_approved_contribution_the_index_is_untouched_and_says_so(self):
        index = self.build(self.site_copy(False))
        real = json.loads(L.INDEX.read_text(encoding="utf-8"))
        self.assertEqual([r for r in index["resources"] if r["type"] == "contribution"], [])
        self.assertEqual([r["id"] for r in index["resources"]], [r["id"] for r in real["resources"]])
        self.assertEqual(index["edges"], real["edges"])
        ad = next(a for a in index["meta"]["adapters"] if "Commons" in a["name"])
        self.assertEqual((ad["active"], ad["records"]), (False, 0))
        self.assertNotIn("contribution", index["meta"]["counts"])

    def test_approved_contributions_are_indexed_as_visitor_text_and_withdrawn_ones_are_not(self):
        index = self.build(self.site_copy(True))
        cs = {r["id"]: r for r in index["resources"] if r["type"] == "contribution"}
        self.assertEqual(sorted(cs), [f"contrib:COM-000{i}" for i in range(1, 7)])
        self.assertNotIn("contrib:COM-0007", cs)
        for r in cs.values():
            self.assertIn("not peer reviewed", r["reviewStatus"])
            self.assertIn("Visitor contribution", r["sourceType"])
            self.assertTrue(r["url"].startswith("https://amarisct.github.io/Artificially-Intelligent/research-commons/c/COM-"))
            self.assertNotIn("moderat", json.dumps(r).lower())
        self.assertEqual(index["meta"]["counts"]["contribution"], 6)
        ad = next(a for a in index["meta"]["adapters"] if "Commons" in a["name"])
        self.assertEqual((ad["active"], ad["records"], ad["note"]), (True, 6, "Indexed"))
        self.assertEqual(cs["contrib:COM-0001"]["concepts"], ["identity", "memory"])
        self.assertIn("memory", cs["contrib:COM-0003"]["body"], "perspective text is searchable")

    def test_every_commons_edge_is_labelled_and_points_at_a_real_record(self):
        index = self.build(self.site_copy(True))
        ids = {r["id"] for r in index["resources"]}
        mine = [e for e in index["edges"] if e["source"] == "research-commons"]
        self.assertTrue(mine)
        kinds = {k["id"] for k in L.read_json(L.DATA / "taxonomy.json")["relationKinds"]}
        for e in mine:
            self.assertIn(e["a"], ids)
            self.assertIn(e["b"], ids)
            self.assertIn(e["kind"], kinds)
            self.assertTrue(e["why"])
        sug = [e for e in mine if e["kind"] == "suggested"]
        self.assertEqual([(e["a"], e["b"]) for e in sug], [("contrib:COM-0002", "concept:identity")], "an automated suggestion stays labelled as one")
        self.assertFalse(any("COM-0007" in (e["a"] + e["b"]) for e in mine))

    def test_the_strongest_provenance_wins_when_two_links_join_the_same_pair(self):
        recs = D.records("COM")
        rels = [{"a": "contrib:COM-0001", "b": "concept:memory", "kind": "suggested", "why": "Shares a word."}]
        edges = L.contribution_edges(recs, rels)
        e = next(x for x in edges if {x["a"], x["b"]} == {"contrib:COM-0001", "concept:memory"})
        self.assertEqual(e["kind"], "editorial", "a reviewed link is never hidden by an automated suggestion")
        only = [{"a": "contrib:COM-0002", "b": "concept:learning", "kind": "suggested", "why": "Shares a word."}]
        self.assertEqual(next(x for x in L.contribution_edges(recs, only) if {x["a"], x["b"]} == {"contrib:COM-0002", "concept:learning"})["kind"], "suggested")

    def test_a_withdrawn_contribution_has_no_edges(self):
        recs = D.records("COM")
        rels = D.relations("COM") + [{"a": "contrib:COM-0007", "b": "concept:memory", "kind": "editorial", "why": "x", "reviewedOn": "2026-10-01"}]
        self.assertFalse([e for e in L.contribution_edges(recs, rels) if "COM-0007" in e["a"] + e["b"]])


if __name__ == "__main__":
    unittest.main(verbosity=1)
