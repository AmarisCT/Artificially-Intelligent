#!/usr/bin/env python3
"""Tests for the Research Ledger's version capture, validator and build. Run: python3 scripts/research-ledger-tests/test_pipeline.py

Every test works on a temporary copy of the real Ledger data and a modified copy of the real feed, so the
repository's own records are never touched. Nothing here reads git history, and nothing needs a network.
"""
from __future__ import annotations

import copy
import datetime as dt
import hashlib
import json
import pathlib
import shutil
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
SCRIPTS = HERE.parent
sys.path.insert(0, str(SCRIPTS))
import build_ledger_preview as P  # noqa: E402
import build_published as BP  # noqa: E402
import build_research_ledger as B  # noqa: E402
import capture_public_revisions as C  # noqa: E402
import ledger_lib as L  # noqa: E402
import validate_research_ledger as V  # noqa: E402

REAL_FEED = L.ROOT / "feed.xml"
TODAY = "2026-10-25"   # the tests capture on days up to 2026-10-20, so "today" must be later than that


def tree_digest(root: pathlib.Path) -> dict[str, str]:
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob("*")) if p.is_file()}


class Sandbox(unittest.TestCase):
    """A throwaway copy of the real data directory and feed."""

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="ledger-test-"))
        self.data = self.tmp / "data"
        shutil.copytree(L.DATA, self.data)
        self.feed = self.tmp / "feed.xml"
        shutil.copy(REAL_FEED, self.feed)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def edit_feed(self, old: str, new: str):
        text = self.feed.read_text(encoding="utf-8")
        self.assertEqual(text.count(old), 1, f"test setup: expected exactly one occurrence of {old!r}")
        self.feed.write_text(text.replace(old, new), encoding="utf-8")

    def cap(self, now: str, **kw):
        return C.capture(self.feed, self.data, now[:10], now, **kw)

    def rj(self, rel):
        return json.loads((self.data / rel).read_text(encoding="utf-8"))

    def wj(self, rel, obj):
        (self.data / rel).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

    def validate(self):
        return V.validate(self.data, L.ROOT, TODAY)


SLUG = "we-are-all-archives-now"
FIRST_WORDS = "Long before a photograph could be stored in the cloud"


class TestCaptureNoFalseRevisions(Sandbox):
    def test_rebuild_with_identical_text_changes_only_the_status_file(self):
        before = tree_digest(self.data)
        rep = self.cap("2026-10-18T03:00:00Z")
        after = tree_digest(self.data)
        changed = {k for k in after if before.get(k) != after[k]} | (set(before) - set(after))
        self.assertEqual(changed, {"ledger-status.json"})
        self.assertEqual(rep["recorded"], [])
        self.assertEqual(len(rep["unchanged"]), 2)

    def test_feed_build_date_and_pubdate_formatting_do_not_create_a_revision(self):
        self.edit_feed("<lastBuildDate>Sat, 17 Oct 2026 10:49:08 +0000</lastBuildDate>", "<lastBuildDate>Sun, 18 Oct 2026 01:00:00 +0000</lastBuildDate>")
        before = tree_digest(self.data)
        self.cap("2026-10-18T03:00:00Z")
        self.cap("2026-10-18T09:00:00Z")
        changed = {k for k, v in tree_digest(self.data).items() if before.get(k) != v}
        self.assertEqual(changed, {"ledger-status.json"})

    def test_markup_and_whitespace_only_changes_are_not_revisions(self):
        # wrapping a phrase in emphasis tags and adding whitespace leaves the readable text identical
        self.edit_feed(FIRST_WORDS, "&lt;em&gt;" + FIRST_WORDS + "&lt;/em&gt;")
        before = tree_digest(self.data / "snapshots")
        self.cap("2026-10-18T03:00:00Z")
        self.cap("2026-10-18T05:00:00Z")
        self.assertEqual(tree_digest(self.data / "snapshots"), before)
        self.assertEqual(list((self.data / "revisions").glob("*.json")), [])

    def test_hash_is_deterministic_and_matches_the_saved_baseline(self):
        arts = {a["slug"]: a for a in L.parse_feed(REAL_FEED)}
        h1 = L.content_hash(L.snapshot_from_article(arts[SLUG]))
        h2 = L.content_hash(L.snapshot_from_article(arts[SLUG]))
        self.assertEqual(h1, h2)
        saved = self.rj(f"snapshots/{SLUG}/log.json")["entries"][0]["hash"]
        self.assertEqual(h1, saved, "recomputing the hash from the real feed must reproduce the saved baseline hash")


class TestCaptureDetectsRealChanges(Sandbox):
    def test_text_change_needs_a_second_sighting_before_a_revision_is_saved(self):
        self.edit_feed(FIRST_WORDS, "Long ago, before a photograph could be stored in the cloud")
        r1 = self.cap("2026-10-18T03:00:00Z")
        self.assertEqual([p["id"] for p in r1["pending"]], ["PUB-001"])
        self.assertEqual(r1["recorded"], [])
        self.assertEqual(len(list((self.data / "snapshots" / SLUG).glob("v*.json"))), 1)
        r2 = self.cap("2026-10-18T03:10:00Z")   # only ten minutes later: still waiting
        self.assertEqual(r2["recorded"], [])
        r3 = self.cap("2026-10-18T03:45:00Z")   # 45 minutes after the first sighting
        self.assertEqual([x["revision"] for x in r3["recorded"]], ["RVN-001"])
        log = self.rj(f"snapshots/{SLUG}/log.json")
        self.assertEqual([e["n"] for e in log["entries"]], [1, 2])
        self.assertEqual(log["entries"][1]["kind"], "detected-change")
        self.assertIsNone(log["pending"])
        rvn = self.rj("revisions/RVN-001.json")
        self.assertEqual((rvn["state"], rvn["category"], rvn["summary"]), ("unclassified", None, None))
        self.assertEqual((rvn["fromSnapshot"], rvn["toSnapshot"]), (1, 2))
        rep = self.validate()
        self.assertEqual(rep.errors, [])
        self.assertTrue(any("waiting for an editor to classify" in w for w in rep.warnings))

    def test_confirm_now_skips_the_wait_but_still_needs_a_first_sighting(self):
        self.edit_feed(FIRST_WORDS, "Long ago, before a photograph could be stored in the cloud")
        r0 = self.cap("2026-10-18T03:00:00Z", confirm_now=True)
        self.assertEqual(r0["recorded"], [], "a change seen only once is never recorded, even with --confirm-now")
        r1 = self.cap("2026-10-18T03:01:00Z", confirm_now=True)
        self.assertEqual(len(r1["recorded"]), 1)

    def test_a_change_that_reverts_before_confirmation_is_dropped(self):
        original = self.feed.read_text(encoding="utf-8")
        self.edit_feed(FIRST_WORDS, "Long ago, before a photograph could be stored in the cloud")
        self.cap("2026-10-18T03:00:00Z")
        self.assertIsNotNone(self.rj(f"snapshots/{SLUG}/log.json")["pending"])
        self.feed.write_text(original, encoding="utf-8")
        rep = self.cap("2026-10-18T04:00:00Z")
        self.assertIsNone(self.rj(f"snapshots/{SLUG}/log.json")["pending"])
        self.assertEqual(rep["recorded"], [])
        self.assertTrue(any("returned to the saved version" in w for w in rep["warnings"]))

    def test_a_change_in_the_source_list_counts(self):
        self.edit_feed("Personal Digital Archiving", "Personal Digital Archiving (revised entry)")
        self.cap("2026-10-18T03:00:00Z")
        r = self.cap("2026-10-18T04:00:00Z")
        self.assertEqual(len(r["recorded"]), 1)

    def test_a_third_change_is_numbered_in_sequence_and_each_has_a_record(self):
        for i, (a, b) in enumerate([(FIRST_WORDS, "Long ago, before a photograph could be stored in the cloud"),
                                    ("Long ago, before a photograph", "Long, long ago, before a photograph")]):
            self.edit_feed(a, b)
            self.cap(f"2026-10-{18 + i}T03:00:00Z")
            self.cap(f"2026-10-{18 + i}T04:00:00Z")
        log = self.rj(f"snapshots/{SLUG}/log.json")
        self.assertEqual([e["n"] for e in log["entries"]], [1, 2, 3])
        self.assertEqual(sorted(p.stem for p in (self.data / "revisions").glob("*.json")), ["RVN-001", "RVN-002"])
        self.assertEqual(self.validate().errors, [])


class TestCaptureSafety(Sandbox):
    def test_an_unreadable_feed_leaves_every_record_untouched(self):
        self.feed.write_text("<rss><channel><item><title>x", encoding="utf-8")
        before = tree_digest(self.data)
        with self.assertRaises(L.LedgerError):
            self.cap("2026-10-18T03:00:00Z")
        self.assertEqual(tree_digest(self.data), before)

    def test_a_missing_feed_is_an_error_not_a_deletion(self):
        self.feed.unlink()
        before = tree_digest(self.data)
        with self.assertRaises(L.LedgerError):
            self.cap("2026-10-18T03:00:00Z")
        self.assertEqual(tree_digest(self.data), before)

    def test_a_truncated_item_is_ignored_and_never_becomes_a_revision(self):
        text = self.feed.read_text(encoding="utf-8")
        start = text.index("<content:encoded>", text.index("<item>")) + len("<content:encoded>")
        end = text.index("</content:encoded>", start)
        self.feed.write_text(text[:start] + "&lt;p&gt;Truncated.&lt;/p&gt;" + text[end:], encoding="utf-8")
        rep = self.cap("2026-10-18T03:00:00Z")
        self.assertEqual(len(rep["ignored"]), 1)
        self.assertEqual(rep["recorded"], [])
        self.assertIsNone(self.rj(f"snapshots/{SLUG}/log.json")["pending"])

    def test_an_essay_removed_from_the_feed_is_kept_with_a_warning(self):
        text = self.feed.read_text(encoding="utf-8")
        a = text.index("<item>")
        b = text.index("</item>") + len("</item>")
        self.feed.write_text(text[:a] + text[b:], encoding="utf-8")
        rep = self.cap("2026-10-18T03:00:00Z")
        self.assertTrue((self.data / "publications" / "PUB-001.json").exists())
        self.assertTrue(any("not present in the current feed" in w for w in rep["warnings"]))

    def test_a_retitled_essay_keeps_its_slug_and_asks_for_a_human_decision(self):
        self.edit_feed("<title>We Are All Archives Now</title>", "<title>We Are All Archives, Now</title>")  # same slug, new title
        self.edit_feed("<title>Is Human Consciousness Connected to Artificial Intelligence?</title>", "<title>Is Human Consciousness Linked to Artificial Intelligence?</title>")
        rep = self.cap("2026-10-18T03:00:00Z")
        pub = self.rj("publications/PUB-002.json")
        self.assertEqual(pub["slug"], "is-human-consciousness-connected-to-artificial-intelligence")
        self.assertTrue(any("different page address" in w for w in rep["warnings"]))

    def test_a_changed_feed_date_never_rewrites_the_publication_date(self):
        self.edit_feed("Wed, 07 Oct 2026 19:25:23 +0000", "Thu, 08 Oct 2026 19:25:23 +0000")
        rep = self.cap("2026-10-18T03:00:00Z")
        self.assertEqual(self.rj("publications/PUB-001.json")["publishedAt"], "2026-10-07")
        self.assertTrue(any("did not change it" in w for w in rep["warnings"]))


class TestAutomaticDiscovery(Sandbox):
    def test_a_new_essay_gets_a_record_baseline_review_and_the_next_ids(self):
        text = self.feed.read_text(encoding="utf-8")
        i = text.index("<item>")
        paras = "".join(f"&lt;p&gt;Paragraph {n} of a new essay about records and memory.&lt;/p&gt;" for n in range(1, 6))
        src = "&lt;p&gt;Sources&lt;/p&gt;&lt;p&gt;Example Author. “A new reference.” (2024). https://example.org/new-reference&lt;/p&gt;"
        item = ("<item><title>A Brand New Essay</title><link>https://example.org/x</link><guid isPermaLink=\"false\">guid-new-3</guid>"
                "<description>A new essay.</description><content:encoded>" + paras + src + "</content:encoded><category>Essay</category>"
                "<pubDate>Fri, 16 Oct 2026 09:00:00 +0000</pubDate></item>")
        self.feed.write_text(text[:i] + item + text[i:], encoding="utf-8")
        ids_before = L.load_registry(self.data)["issued"]
        rep = self.cap("2026-10-18T03:00:00Z")
        self.assertEqual([c["id"] for c in rep["created"]], ["PUB-003"])
        self.assertEqual(self.rj("publications/PUB-001.json")["slug"], SLUG, "existing ids must not move")
        pub = self.rj("publications/PUB-003.json")
        self.assertEqual((pub["publishedAt"], pub["ledgerEntryDate"]), ("2026-10-16", "2026-10-18"))
        review = [self.rj(f"reviews/{p.name}") for p in (self.data / "reviews").glob("*.json") if json.loads(p.read_text())["publication"] == "PUB-003"]
        self.assertEqual([r["status"] for r in review], ["awaiting-editorial-review"])
        new_src = [json.loads(p.read_text()) for p in (self.data / "sources").glob("*.json")]
        mine = [s for s in new_src if any(c["publication"] == "PUB-003" for c in s["citedBy"])]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["verification"]["level"], "verification-incomplete")
        self.assertEqual(mine[0]["verification"]["history"], [], "an automatically created source must not claim any verification")
        ids_after = L.load_registry(self.data)["issued"]
        for kind, old in ids_before.items():
            self.assertTrue(set(old) <= set(ids_after[kind]), f"{kind} ids were lost")
        self.assertEqual(self.validate().errors, [])

    def test_ids_are_never_reused_even_if_a_record_is_deleted(self):
        reg = L.load_registry(self.data)
        first = L.next_id(reg, "publication")
        self.assertEqual(first, "PUB-003")
        again = L.next_id(reg, "publication")
        self.assertEqual(again, "PUB-004")

    def test_capture_never_calls_git(self):
        for name in ("capture_public_revisions.py", "ledger_lib.py", "build_research_ledger.py"):
            src = (SCRIPTS / name).read_text(encoding="utf-8")
            self.assertNotIn("subprocess", src, name)
            self.assertNotIn("os.system", src, name)
            self.assertNotRegex(src, r"git\s+(log|diff|show|rev-parse)", name)


class TestValidatorRefusesDishonestRecords(Sandbox):
    def errors(self):
        return self.validate().errors

    def assertRefuses(self, fragment):
        errs = self.errors()
        self.assertTrue(any(fragment in e for e in errs), f"expected an error containing {fragment!r}, got {errs}")

    def test_clean_data_passes(self):
        self.assertEqual(self.errors(), [])

    def test_a_claim_cannot_be_marked_supported_by_an_uninspected_source(self):
        c = self.rj("claims/CLM-001.json")
        c["sourceLinks"][0].update({"support": "supports", "assessedOn": TODAY, "assessedBy": "X", "explanation": "x"})
        sid = c["sourceLinks"][0]["source"]
        s = self.rj(f"sources/{sid}.json")
        s["verification"] = {"level": "verification-incomplete", "history": []}
        self.wj("claims/CLM-001.json", c)
        self.wj(f"sources/{sid}.json", s)
        self.assertRefuses("content was not inspected")

    def test_a_verification_level_needs_a_history_entry(self):
        s = self.rj("sources/SRC-001.json")
        s["verification"] = {"level": "full-source-reviewed", "history": []}
        self.wj("sources/SRC-001.json", s)
        self.assertRefuses("needs a history entry")

    def test_a_verification_entry_needs_its_origin_and_who_recorded_it(self):
        sid = next(p.stem for p in (self.data / "sources").glob("*.json") if json.loads(p.read_text())["verification"]["history"])
        s = self.rj(f"sources/{sid}.json")
        del s["verification"]["history"][0]["origin"]
        self.wj(f"sources/{sid}.json", s)
        self.assertRefuses("missing origin")

    def test_a_high_level_needs_a_named_reviewer(self):
        sid = next(p.stem for p in (self.data / "sources").glob("*.json") if json.loads(p.read_text())["verification"]["history"])
        s = self.rj(f"sources/{sid}.json")
        s["verification"]["history"][0]["level"] = "full-source-reviewed"
        s["verification"]["level"] = "full-source-reviewed"
        self.wj(f"sources/{sid}.json", s)
        self.assertRefuses("needs a named reviewer")

    def test_a_completed_review_needs_a_reviewer(self):
        r = self.rj("reviews/RVW-001.json")
        r["status"] = "editorially-reviewed"
        r["history"].append({"status": "editorially-reviewed", "on": TODAY, "note": "x"})
        self.wj("reviews/RVW-001.json", r)
        self.assertRefuses("a completed review needs reviewer")

    def test_peer_review_language_is_refused(self):
        r = self.rj("reviews/RVW-001.json")
        r["nextStep"] = "Send for peer review."
        self.wj("reviews/RVW-001.json", r)
        self.assertRefuses("peer review")

    def test_a_tampered_snapshot_is_detected(self):
        f = next((self.data / "snapshots" / SLUG).glob("v001-*.json"))
        d = json.loads(f.read_text(encoding="utf-8"))
        d["snapshot"]["body"][0] += " tampered"
        f.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
        self.assertRefuses("hash")

    def test_a_claim_whose_passage_does_not_match_the_snapshot_is_refused(self):
        c = self.rj("claims/CLM-001.json")
        c["passage"]["text"] += " extra"
        self.wj("claims/CLM-001.json", c)
        self.assertRefuses("passage text is not the text")

    def test_an_unissued_id_is_refused(self):
        reg = self.rj("id-registry.json")
        reg["issued"]["claim"].remove("CLM-001")
        self.wj("id-registry.json", reg)
        self.assertRefuses("not in id-registry.json")

    def test_a_credential_like_string_in_public_data_is_refused(self):
        cfg = self.rj("config.json")
        cfg["note"] = "password: hunter2"
        self.wj("config.json", cfg)
        self.assertRefuses("credential-like")

    def test_a_non_https_concern_endpoint_is_refused(self):
        cfg = self.rj("config.json")
        cfg["concernChannels"]["endpoint"] = "http://example.org/report"
        self.wj("config.json", cfg)
        self.assertRefuses("must be https")

    def test_unapproved_policy_draft_text_must_not_be_public(self):
        pol = self.rj("policies/methodology.json")
        pol["policies"][0]["draft"] = "Proposed wording"
        self.wj("policies/methodology.json", pol)
        self.assertRefuses("must not be in the public policies file")

    def test_an_approved_policy_needs_an_approver(self):
        pol = self.rj("policies/methodology.json")
        pol["policies"][0].update({"status": "approved", "text": "x"})
        self.wj("policies/methodology.json", pol)
        self.assertRefuses("needs approvedBy")

    def test_an_unclassified_change_cannot_carry_a_category(self):
        self.edit_feed(FIRST_WORDS, "Long ago, before a photograph could be stored in the cloud")
        self.cap("2026-10-18T03:00:00Z")
        self.cap("2026-10-18T04:00:00Z")
        rv = self.rj("revisions/RVN-001.json")
        rv["category"] = "correction"
        self.wj("revisions/RVN-001.json", rv)
        self.assertRefuses("must not carry a category")

    def test_a_new_snapshot_without_a_revision_record_is_refused(self):
        self.edit_feed(FIRST_WORDS, "Long ago, before a photograph could be stored in the cloud")
        self.cap("2026-10-18T03:00:00Z")
        self.cap("2026-10-18T04:00:00Z")
        (self.data / "revisions" / "RVN-001.json").unlink()
        self.assertRefuses("has no revision record")

    def test_a_correction_needs_every_required_field(self):
        self.wj("corrections/COR-001.json", {"schema": 1, "id": "COR-001", "publication": "PUB-001", "kind": "correction", "approval": "pending"})
        reg = self.rj("id-registry.json")
        reg["issued"]["correction"] = ["COR-001"]
        self.wj("id-registry.json", reg)
        errs = self.errors()
        for f in ("recordedOn", "issue", "corrected", "reason", "affected"):
            self.assertTrue(any(f"missing {f}" in e for e in errs), f)

    def test_a_future_dated_verification_is_refused(self):
        sid = next(p.stem for p in (self.data / "sources").glob("*.json") if json.loads(p.read_text())["verification"]["history"])
        s = self.rj(f"sources/{sid}.json")
        s["verification"]["history"][0]["recordedOn"] = "2027-01-01"
        self.wj(f"sources/{sid}.json", s)
        self.assertRefuses("in the future")


class TestBuild(Sandbox):
    def test_build_is_deterministic_and_idempotent(self):
        a, n1 = B.build(root=L.ROOT, data=self.data, today=TODAY)
        b, n2 = B.build(root=L.ROOT, data=self.data, today=TODAY)
        self.assertEqual(L.dump_json(a), L.dump_json(b))
        self.assertEqual(L.dump_json(n1), L.dump_json(n2))

    def test_the_committed_bundle_matches_a_fresh_build(self):
        ledger, notices = B.build()
        self.assertEqual((L.DATA / "ledger.json").read_text(encoding="utf-8"), L.dump_json(ledger), "ledger.json is stale: run build_research_ledger.py")
        self.assertEqual((L.DATA / "article-notices.json").read_text(encoding="utf-8"), L.dump_json(notices))

    def test_the_public_bundle_contains_no_owner_drafts_or_credentials(self):
        text = (L.DATA / "ledger.json").read_text(encoding="utf-8")
        self.assertNotIn("ownerQuestions", text)
        self.assertNotIn('"draft": "', text.replace('"classificationStatus": "draft"', ""))
        self.assertNotRegex(text, r"(?i)(api[_-]?key|bearer\s+[a-z0-9]|authorization:|private[_ -]?key|passwd)")
        led = json.loads(text)
        for pol in led["policies"]:
            self.assertNotIn("draft", pol)
            self.assertNotEqual(pol["status"], "approved", "no policy may be approved until the owner approves it")

    def test_a_failed_validation_stops_the_build(self):
        c = self.rj("claims/CLM-001.json")
        c["passage"]["text"] += " x"
        self.wj("claims/CLM-001.json", c)
        with self.assertRaises(L.LedgerError):
            B.build(root=L.ROOT, data=self.data, today=TODAY)

    def test_no_numbers_are_invented(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        I = led["integrity"]
        self.assertEqual(I["publications"], len(list((L.DATA / "publications").glob("*.json"))))
        self.assertEqual(I["sources"], len(list((L.DATA / "sources").glob("*.json"))))
        self.assertEqual(I["claims"], len(list((L.DATA / "claims").glob("*.json"))))
        self.assertEqual(sum(I["sourcesByLevel"].values()), I["sources"])
        self.assertEqual(I["revisionsClassified"] + I["changesUnclassified"], len(list((L.DATA / "revisions").glob("*.json"))))
        self.assertEqual(I["corrections"], len(list((L.DATA / "corrections").glob("*.json"))))

    def test_the_real_ledger_has_no_fabricated_review_correction_or_revision(self):
        led = json.loads((L.DATA / "ledger.json").read_text(encoding="utf-8"))
        self.assertEqual(led["integrity"]["editoriallyReviewed"], 0)
        self.assertEqual(led["integrity"]["corrections"], 0)
        self.assertEqual(led["revisions"], [])
        self.assertTrue(all(c["classificationStatus"] == "draft" for c in led["claims"]))
        self.assertTrue(all(l["support"] == "not-assessed" for c in led["claims"] for l in c["sourceLinks"]))
        for s in led["sources"]:
            for h in s["verification"]["history"]:
                self.assertIn("No human editor has re-checked this", h["performedBy"])


class TestArticleNotices(unittest.TestCase):
    def test_only_an_approved_prominent_correction_produces_an_article_notice(self):
        work = pathlib.Path(tempfile.mkdtemp(prefix="ledger-notice-"))
        self.addCleanup(shutil.rmtree, work, ignore_errors=True)
        P.build_demo(work)
        ledger, notices = B.build(root=L.ROOT, data=work / "data", today=TODAY)
        n = notices["notices"]["a-demonstration-essay-about-a-lighthouse-logbook"]
        self.assertEqual(n["correction"]["id"], "COR-001")
        self.assertEqual(n["reviewStatus"], "Review Completed With Limitations")
        # a pending correction produces no notice
        cor = json.loads((work / "data" / "corrections" / "COR-001.json").read_text(encoding="utf-8"))
        cor.update({"approval": "pending", "approvedBy": None, "approvedOn": None})
        (work / "data" / "corrections" / "COR-001.json").write_text(json.dumps(cor), encoding="utf-8")
        _, notices2 = B.build(root=L.ROOT, data=work / "data", today=TODAY)
        self.assertIsNone(notices2["notices"]["a-demonstration-essay-about-a-lighthouse-logbook"]["correction"])

    def test_the_real_notices_contain_no_corrections(self):
        notices = json.loads((L.DATA / "article-notices.json").read_text(encoding="utf-8"))["notices"]
        self.assertTrue(notices)
        self.assertTrue(all(v["correction"] is None for v in notices.values()))


class TestDemonstrationIsolation(unittest.TestCase):
    def test_the_demonstration_runs_through_the_real_pipeline_and_leaves_the_real_data_alone(self):
        before = tree_digest(L.DATA)
        with tempfile.TemporaryDirectory(prefix="ledger-demo-test-") as tmp:
            demo = P.build_demo(pathlib.Path(tmp))
        self.assertEqual(tree_digest(L.DATA), before)
        self.assertEqual(len(demo["snapshots"]), 3)
        self.assertTrue(all(r["demo"] for k in ("publications", "sources", "claims", "reviews", "revisions", "corrections") for r in demo[k]))
        self.assertTrue(all(r["id"].startswith("DEMO-") for r in demo["publications"] + demo["revisions"]))
        self.assertEqual(demo["validation"]["errors"], 0)

    def test_the_demonstration_never_enters_the_live_bundle(self):
        text = (L.DATA / "ledger.json").read_text(encoding="utf-8")
        self.assertNotIn("DEMO-", text)
        self.assertNotIn("lighthouse", text.lower())


class TestArticlePageHook(unittest.TestCase):
    """build_published.py: article pages stay byte-identical unless the owner switches the Ledger link on or a correction is approved."""

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp(prefix="ledger-pages-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        shutil.copy(REAL_FEED, self.tmp / "feed.xml")
        (self.tmp / "learning-institute" / "data").mkdir(parents=True)
        shutil.copytree(L.LEDGER, self.tmp / "research-ledger", ignore=shutil.ignore_patterns("tests"))
        self.saved = (BP.ROOT, BP.FEED, BP.OUTPUT, BP.LEDGER_DATA)
        BP.ROOT, BP.FEED, BP.OUTPUT, BP.LEDGER_DATA = self.tmp, self.tmp / "feed.xml", self.tmp / "research" / "published", self.tmp / "research-ledger" / "data"
        self.addCleanup(lambda: setattr_all(BP, ("ROOT", "FEED", "OUTPUT", "LEDGER_DATA"), self.saved))
        import contextlib, io
        self.quiet = contextlib.redirect_stdout(io.StringIO())

    def build(self):
        with self.quiet:
            BP.make()
        return {p.parent.name: p.read_text(encoding="utf-8") for p in (self.tmp / "research" / "published").glob("*/index.html")}

    def page(self, slug):
        return (self.tmp / "research" / "published" / slug / "index.html").read_text(encoding="utf-8")

    def test_default_output_is_identical_to_the_committed_pages(self):
        pages = self.build()
        self.assertEqual(set(pages), {SLUG, "is-human-consciousness-connected-to-artificial-intelligence"})
        for slug, text in pages.items():
            committed = (L.ROOT / "research" / "published" / slug / "index.html").read_text(encoding="utf-8")
            self.assertEqual(text, committed, f"{slug}: the Ledger hook must not alter published pages by default")
            self.assertNotIn("research-ledger", text)

    def test_missing_or_corrupt_ledger_data_changes_nothing_and_never_stops_publishing(self):
        baseline = self.build()
        (self.tmp / "research-ledger" / "data" / "article-notices.json").write_text("{not json", encoding="utf-8")
        self.assertEqual(self.build(), baseline)
        (self.tmp / "research-ledger" / "data" / "article-notices.json").unlink()
        self.assertEqual(self.build(), baseline)

    def test_the_ledger_link_appears_only_when_the_owner_switches_it_on_and_the_page_exists(self):
        cfg = self.tmp / "research-ledger" / "data" / "config.json"
        c = json.loads(cfg.read_text(encoding="utf-8"))
        c["articlePageLinks"] = True
        cfg.write_text(json.dumps(c), encoding="utf-8")
        on = self.build()
        self.assertIn('href="../../../research-ledger/#publication-PUB-001"', on[SLUG])
        self.assertIn("#publication-PUB-002", on["is-human-consciousness-connected-to-artificial-intelligence"])
        self.assertNotIn("correction-notice", on[SLUG])
        (self.tmp / "research-ledger" / "index.html").unlink()
        self.assertNotIn("research-ledger", self.build()[SLUG], "no link to a Ledger page that does not exist")

    def test_only_an_approved_prominent_correction_produces_a_notice_on_the_article(self):
        notices_path = self.tmp / "research-ledger" / "data" / "article-notices.json"
        n = json.loads(notices_path.read_text(encoding="utf-8"))
        n["notices"][SLUG]["correction"] = {"id": "COR-001", "date": "2026-10-20", "summary": "A figure was corrected.", "url": "x"}
        notices_path.write_text(json.dumps(n), encoding="utf-8")
        text = self.build()[SLUG]
        self.assertIn('role="note" aria-label="Correction notice"', text)
        self.assertIn("A figure was corrected.", text)
        self.assertIn('href="../../../research-ledger/#correction-COR-001"', text)
        self.assertLess(text.index("Correction notice"), text.index("<h1>"), "the notice sits above the headline")
        self.assertNotIn("Correction notice", self.build()["is-human-consciousness-connected-to-artificial-intelligence"])

    def test_notice_text_is_escaped(self):
        notices_path = self.tmp / "research-ledger" / "data" / "article-notices.json"
        n = json.loads(notices_path.read_text(encoding="utf-8"))
        n["notices"][SLUG]["correction"] = {"id": "COR-001", "date": "2026-10-20", "summary": "<script>alert(1)</script>", "url": "x"}
        notices_path.write_text(json.dumps(n), encoding="utf-8")
        text = self.build()[SLUG]
        self.assertNotIn("<script>alert(1)</script>", text)
        self.assertIn("&lt;script&gt;", text)


class TestSharedIndex(unittest.TestCase):
    def test_the_index_only_gains_a_ledger_link_and_only_for_real_publications(self):
        import build_research_index as BI
        urls = BI.ledger_record_urls(L.ROOT)
        self.assertEqual(set(urls), {SLUG, "is-human-consciousness-connected-to-artificial-intelligence"})
        self.assertTrue(all(u.startswith("https://") and "#publication-PUB-" in u for u in urls.values()))
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(BI.ledger_record_urls(pathlib.Path(t)), {}, "no Ledger deployed, no links")

    def test_the_committed_index_matches_what_the_builder_would_produce(self):
        idx = json.loads((L.ROOT / "inquiry-engine" / "data" / "research-index.json").read_text(encoding="utf-8"))
        arts = {r["id"]: r for r in idx["resources"] if r["type"] == "article"}
        self.assertEqual(arts["art:" + SLUG].get("ledgerUrl"), "https://amarisct.github.io/Artificially-Intelligent/research-ledger/#publication-PUB-001")


class TestSourceMetadataCheck(Sandbox):
    """The metadata checker is exercised with canned answers only: the sandbox (and CI) never needs a network for these tests."""

    def setUp(self):
        super().setUp()
        import verify_ledger_sources as VS
        self.VS = VS

    def answer_for(self, **by_doi):
        def fetch(doi):
            return by_doi.get(doi)
        return fetch

    def rec(self, sid):
        return self.rj(f"sources/{sid}.json")

    def test_a_matching_record_is_confirmed_but_only_as_metadata(self):
        before = self.rec("SRC-013")
        self.assertEqual(before["verification"]["level"], "verification-incomplete")
        doi = before["citation"]["doi"]
        match = {"service": "Crossref", "title": before["citation"]["title"], "year": before["citation"]["year"], "container": "Analysis"}
        res = self.VS.run(self.data, "2026-10-18", True, {"SRC-013"}, doi_fetch=self.answer_for(**{doi: match}))
        self.assertEqual(res["confirmed"], ["SRC-013"])
        after = self.rec("SRC-013")
        self.assertEqual(after["verification"]["level"], "metadata-confirmed")
        entry = after["verification"]["history"][-1]
        self.assertIn("No human editor has re-checked this", entry["performedBy"])
        self.assertIn("says nothing about what the work contains", entry["basis"])
        self.assertEqual(after["retraction"]["status"], "not checked", "retraction is never inferred from a metadata match")
        self.assertEqual(self.validate().errors, [], "the records still validate after an automated metadata entry")

    def test_it_never_lowers_or_raises_an_existing_higher_level(self):
        before = self.rec("SRC-011")
        self.assertEqual(before["verification"]["level"], "source-content-inspected")
        doi = before["citation"]["doi"]
        match = {"service": "Crossref", "title": before["citation"]["title"], "year": before["citation"]["year"], "container": "Mind"}
        self.VS.run(self.data, "2026-10-18", True, {"SRC-011"}, doi_fetch=self.answer_for(**{doi: match}))
        after = self.rec("SRC-011")
        self.assertEqual(after["verification"]["level"], "source-content-inspected")
        self.assertEqual(after["verification"]["history"][0], before["verification"]["history"][0], "the earlier entry is untouched")

    def test_a_mismatch_becomes_an_observation_not_a_verification(self):
        before = self.rec("SRC-014")
        doi = before["citation"]["doi"]
        wrong = {"service": "Crossref", "title": "An entirely different paper about marine biology", "year": 2019, "container": "Other"}
        res = self.VS.run(self.data, "2026-10-18", True, {"SRC-014"}, doi_fetch=self.answer_for(**{doi: wrong}))
        self.assertEqual([x["id"] for x in res["flagged"]], ["SRC-014"])
        after = self.rec("SRC-014")
        self.assertEqual(after["verification"]["level"], "verification-incomplete")
        self.assertEqual(len(after["verification"]["history"]), len(before["verification"]["history"]))
        self.assertTrue(any(o["status"] == "open" and "A person should check" in o["text"] for o in after["observations"]))

    def test_an_unknown_identifier_is_flagged_and_an_unreachable_service_changes_nothing(self):
        before = self.rec("SRC-015")
        doi = before["citation"]["doi"]
        res = self.VS.run(self.data, "2026-10-18", True, {"SRC-015"}, doi_fetch=self.answer_for())   # service holds no such DOI
        self.assertEqual(len(res["flagged"]), 1)
        self.assertIn("No record was found", res["flagged"][0]["why"])
        snap = self.rec("SRC-018")

        def down(_doi):
            raise self.VS.Unavailable("connection refused")
        res = self.VS.run(self.data, "2026-10-18", True, {"SRC-018"}, doi_fetch=down)
        self.assertEqual(res["unavailable"][0]["id"], "SRC-018")
        self.assertEqual(self.rec("SRC-018"), snap, "a failed request must not write anything")

    def test_re_running_does_not_pile_up_entries_and_a_dry_run_writes_nothing(self):
        before = self.rec("SRC-019")
        doi = before["citation"]["doi"]
        match = {"service": "Crossref", "title": before["citation"]["title"], "year": before["citation"]["year"], "container": "X"}
        fetch = self.answer_for(**{doi: match})
        self.VS.run(self.data, "2026-10-18", False, {"SRC-019"}, doi_fetch=fetch)
        self.assertEqual(self.rec("SRC-019"), before, "dry run (no --apply) writes nothing")
        self.VS.run(self.data, "2026-10-18", True, {"SRC-019"}, doi_fetch=fetch)
        once = self.rec("SRC-019")
        again = self.VS.run(self.data, "2026-10-19", True, {"SRC-019"}, doi_fetch=fetch)
        self.assertEqual(again["skipped"], ["SRC-019"])
        self.assertEqual(self.rec("SRC-019"), once)

    def test_sources_with_no_identifier_are_left_alone(self):
        res = self.VS.run(self.data, "2026-10-18", True, {"SRC-001"}, doi_fetch=self.answer_for())
        self.assertEqual(res["nothing-to-check"], ["SRC-001"])
        self.assertEqual(res["confirmed"] + res["flagged"], [])

    def test_title_and_year_matching_is_strict_enough_to_catch_a_wrong_paper(self):
        self.assertTrue(self.VS.titles_match("The Extended Mind", "The Extended Mind"))
        self.assertTrue(self.VS.titles_match("Computing machinery and intelligence", "COMPUTING MACHINERY AND INTELLIGENCE."))
        self.assertFalse(self.VS.titles_match("The Extended Mind", "The Extended Mind and Its Critics: A Survey"), "short titles do not match by containment alone")
        self.assertFalse(self.VS.titles_match("", "Anything"))

    def test_responses_from_crossref_datacite_and_arxiv_are_parsed(self):
        crossref = json.dumps({"message": {"title": ["A title"], "issued": {"date-parts": [[2024, 5]]}, "container-title": ["Journal"]}})
        datacite = json.dumps({"data": {"attributes": {"titles": [{"title": "Dataset title"}], "publicationYear": 2023, "container": {}}}})
        atom = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2005.14165v4</id>'
                '<published>2020-05-28T17:29:03Z</published><title>Language Models are\n Few-Shot Learners</title></entry></feed>')

        def get(url):
            if "crossref.org/works/10.1/ok" in url:
                return 200, crossref
            if "crossref.org" in url:
                return 404, ""
            if "datacite.org/dois/10.2/ds" in url:
                return 200, datacite
            if "datacite.org" in url:
                return 404, ""
            return 200, atom
        self.assertEqual(self.VS.fetch_doi("10.1/ok", get)["year"], 2024)
        self.assertEqual(self.VS.fetch_doi("10.2/ds", get)["service"], "DataCite")
        self.assertIsNone(self.VS.fetch_doi("10.3/none", get))
        ar = self.VS.fetch_arxiv("2005.14165", get)
        self.assertEqual((ar["title"], ar["year"]), ("Language Models are Few-Shot Learners", 2020))
        with self.assertRaises(self.VS.Unavailable):
            self.VS.fetch_doi("10.4/x", lambda u: (503, ""))


def setattr_all(obj, names, values):
    for n, v in zip(names, values):
        setattr(obj, n, v)


if __name__ == "__main__":
    unittest.main(verbosity=2)
