#!/usr/bin/env python3
"""Private preview builder for the Research Ledger. It is NOT part of the live site and nothing it makes is published.

It builds, from the real Ledger data plus one clearly fictional demonstration record:

  * a preview bundle (real ledger built with the owner-only policy drafts, plus `demo`), and
  * optionally a single self-contained HTML page (--artifact) so the interface can be tried in a private preview.

The demonstration record is produced by running the REAL capture pipeline on three versions of a fictional
essay in a temporary folder, so the saved versions, hashes, revision records and the validator are all genuine.
Every demonstration id is prefixed DEMO-, every record is marked `demo`, and the demonstration is excluded from
every integrity count. It never touches research-ledger/data.

Usage: build_ledger_preview.py [--artifact out.html] [--bundle out.json]
"""
from __future__ import annotations

import argparse
import html
import json
import pathlib
import re
import shutil
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_research_ledger as B  # noqa: E402
import capture_public_revisions as C  # noqa: E402
import ledger_lib as L  # noqa: E402
import validate_research_ledger as V  # noqa: E402

EDITOR = "Demonstration editor (fictional)"
TITLE = "A Demonstration Essay About a Lighthouse Logbook"
SRC = [
    "[1] Demonstration source A. “Notes on keeping a lamp-room logbook.” (2019). Fictional: not a real publication. https://example.org/demo/source-a",
    "[2] Demonstration source B. “A transcription of the first logbook.” (2021). Fictional: not a real publication. https://example.org/demo/source-b",
]
SRC3 = "[3] Demonstration source C. “Delayed entries in keepers' logs.” (2023). Fictional: not a real publication. https://example.org/demo/source-c"

V1 = [
    "Every lighthouse keeps two records. One is the light itself, which tells passing ships where the rocks are. The other is the logbook, which tells later readers what the light did and when.",
    "The logbook of the demonstration lighthouse begins in 1891. Its first entry records a storm that lasted three days, and the keeper's note that the lamp was lit at dusk and trimmed every four hours. [2]",
    "Logbooks are rarely read for their drama. They are read for their regularity. A gap of a single night, or a changed handwriting, tells a historian more than a paragraph of explanation could.",
    "Researchers who study maintenance records argue that routine documentation is the most reliable evidence of how an institution actually worked. This is a demonstration claim, written only to show how the Ledger separates a claim from its sources. [1]",
    "Some historians disagree. They point out that keepers sometimes wrote entries days after the events, so the date on a page is not always the date of the event.",
    "What would it mean for a research site to keep a logbook of its own essays? It would mean showing when a sentence changed, not only that it did.",
]
V2 = [
    V1[0],
    V1[1],
    "Logbooks are rarely read for their drama. They are read for their regularity. A gap of a single night, or a changed handwriting, tells a historian more than a paragraph of explanation could. Gaps in the record matter as much as the entries.",
    V1[3],
    "A second kind of evidence is the supply order. A request for extra lamp oil in a quiet month suggests a long night that the logbook never mentions. [3]",
    "Some historians disagree. They point out that keepers sometimes wrote entries days or weeks after the events, so the date on a page is not always the date of the event. [3]",
    V1[5],
]
V3 = [
    V2[0],
    V2[1].replace("three days", "two days"),
    V2[2],
    V2[3],
    V2[4],
    V2[5],
    "A research site's logbook should say plainly when it was wrong. A correction that is visible is a form of evidence too.",
]


def _feed(paras: list[str], sources: list[str], pub: str) -> str:
    body = "".join(f"<p>{html.escape(p)}</p>" for p in paras) + "<p>Sources</p>" + "".join(f"<p>{html.escape(s)}</p>" for s in sources)
    return ('<?xml version="1.0" encoding="UTF-8"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0"><channel>'
            f"<title>Demonstration feed</title><item><title>{html.escape(TITLE)}</title><link>https://example.org/demo</link>"
            '<guid isPermaLink="false">demo-guid-0001</guid>'
            "<description>A fictional essay that exists only to demonstrate version comparison in the private preview.</description>"
            f"<content:encoded>{html.escape(body)}</content:encoded><category>Essay</category><pubDate>{pub}</pubDate></item></channel></rss>")


def _read(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))


def build_demo(work: pathlib.Path) -> dict:
    """Run the real capture pipeline on a fictional feed and return prefixed, marked records."""
    data = work / "data"
    for sub in ("publications", "sources", "claims", "reviews", "revisions", "corrections", "snapshots", "timeline", "policies"):
        (data / sub).mkdir(parents=True, exist_ok=True)
    shutil.copy(L.DATA / "taxonomy.json", data / "taxonomy.json")
    shutil.copy(L.DATA / "config.json", data / "config.json")
    shutil.copy(L.DATA / "policies" / "methodology.json", data / "policies" / "methodology.json")
    pub_date = "Mon, 31 Aug 2026 12:00:00 +0000"
    feed = work / "feed.xml"

    def run(paras, sources, now, **kw):
        feed.write_text(_feed(paras, sources, pub_date), encoding="utf-8")
        return C.capture(feed, data, now[:10], now, **kw)

    run(V1, SRC, "2026-09-02T09:00:00Z")                       # baseline
    run(V2, SRC + [SRC3], "2026-09-20T09:00:00Z")               # first sighting: waits, records nothing
    rep = run(V2, SRC + [SRC3], "2026-09-20T09:45:00Z")         # second sighting >= 30 minutes later: saved
    assert rep["recorded"], "the capture pipeline did not record the second version"
    run(V3, SRC + [SRC3], "2026-10-05T09:00:00Z")
    rep = run(V3, SRC + [SRC3], "2026-10-05T09:40:00Z")
    assert rep["recorded"], "the capture pipeline did not record the third version"

    reg = L.load_registry(data)
    pub = _read(data / "publications" / "PUB-001.json")
    log = _read(data / "snapshots" / pub["slug"] / "log.json")
    snap1 = _read(data / "snapshots" / pub["slug"] / log["entries"][0]["file"])["snapshot"]
    # what a person would record by hand
    pub["recordNote"] = "FICTIONAL demonstration record. It exists only in the private preview."
    pub["author"] = "Fictional author (demonstration)"
    L.write_json(data / "publications" / "PUB-001.json", pub)

    for rid, cat, summ, why, on in (
        ("RVN-001", "source-update", "Added a third source and a sentence about gaps in the record, and reworded one paragraph.", "A new source became available. (Demonstration.)", "2026-09-21"),
        ("RVN-002", "correction", "Corrected how long the first logged storm lasted, and added a closing paragraph.", "The logbook entry says two days. The essay said three. (Demonstration.)", "2026-10-06"),
    ):
        rv = _read(data / "revisions" / f"{rid}.json")
        rv.update({"state": "classified", "category": cat, "summary": summ, "reason": why, "classifiedBy": EDITOR, "classifiedOn": on, "note": None})
        L.write_json(data / "revisions" / f"{rid}.json", rv)

    src2 = _read(data / "sources" / "SRC-002.json")
    src2["verification"] = {"level": "source-content-inspected", "history": [{
        "level": "source-content-inspected", "recordedOn": "2026-09-10", "inspectedOn": "2026-09-10",
        "basis": "A fictional editor opened the fictional transcription and read the first entries.",
        "extent": "The first twelve fictional pages", "origin": {"kind": "demonstration", "id": "demo"}, "performedBy": EDITOR}]}
    L.write_json(data / "sources" / "SRC-002.json", src2)

    p1 = next(i for i, t in enumerate(snap1["body"]) if t.startswith("The logbook of"))
    p4 = next(i for i, t in enumerate(snap1["body"]) if t.startswith("Researchers who study"))
    for cid, idx, cls, status, link in (
        ("CLM-001", p1, "historical", "draft", {"source": "SRC-002", "support": "not-assessed", "basis": "inline-marker", "assessedOn": None, "assessedBy": None}),
        ("CLM-002", p4, "philosophical", "reviewed", {"source": "SRC-001", "support": "not-assessed", "basis": "inline-marker", "assessedOn": None, "assessedBy": None}),
    ):
        reg["issued"].setdefault("claim", []).append(cid)
        rec = {"schema": L.SCHEMA, "id": cid, "publication": "PUB-001", "explorerId": None,
               "passage": {"snapshot": 1, "index": idx, "text": snap1["body"][idx], "textHash": "demo"},
               "classification": cls, "classificationStatus": status,
               "classificationOrigin": {"kind": "demonstration", "id": cid, "note": "Fictional classification for the preview."},
               "concepts": ["archives", "memory"], "sourceLinks": [link],
               "limitation": "A demonstration limit: this sentence is invented to show where the Ledger records what a passage does not establish.",
               "debate": None, "limitationNote": "Fictional.", "reviewedOn": None}
        if status == "reviewed":
            rec.update({"reviewedOn": "2026-09-22", "reviewedBy": EDITOR})
        L.write_json(data / "claims" / f"{cid}.json", rec)
    # the first claim's source link is assessed so the Evidence Inspector can show a reviewed relationship
    c2 = _read(data / "claims" / "CLM-002.json")
    c2["sourceLinks"] = [{"source": "SRC-002", "support": "partly-supports", "basis": "inline-marker", "assessedOn": "2026-09-22", "assessedBy": EDITOR,
                          "explanation": "The fictional transcription supports the routine entries but says nothing about institutions in general. (Demonstration.)"}]
    L.write_json(data / "claims" / "CLM-002.json", c2)

    rvw = _read(data / "reviews" / "RVW-001.json")
    rvw.update({"status": "review-completed-with-limitations", "reviewer": EDITOR, "completedOn": "2026-09-25",
                "scope": "The whole fictional essay and its two original sources.",
                "criteria": ["Each source exists as cited", "Each cited passage matches the source it points to"],
                "materialsExamined": ["The fictional transcription (first twelve pages)"],
                "findings": "Both original sources were found. One passage rests on a source that was only partly read. (Demonstration.)",
                "limitations": "The second source was not read in full. (Demonstration.)",
                "outcome": "Completed with limitations.", "approval": f"Approved by the {EDITOR}, 2026-09-25. (Demonstration.)", "nextStep": None})
    rvw["history"].append({"status": "review-completed-with-limitations", "on": "2026-09-25", "note": "A fictional review, recorded to show how a completed review appears."})
    L.write_json(data / "reviews" / "RVW-001.json", rvw)

    reg["issued"].setdefault("correction", []).append("COR-001")
    L.write_json(data / "corrections" / "COR-001.json", {
        "schema": L.SCHEMA, "id": "COR-001", "publication": "PUB-001", "kind": "correction", "recordedOn": "2026-10-06",
        "issue": "The essay said the first logged storm lasted three days.", "corrected": "It now says two days, matching the logbook entry.",
        "reason": "The fictional transcription records a storm of two days. (Demonstration.)", "affected": "Paragraph 2.",
        "sources": ["SRC-002"], "relatedRevision": "RVN-002", "approval": "approved", "approvedBy": EDITOR, "approvedOn": "2026-10-06",
        "noticeLevel": "prominent", "noticeText": "A fictional correction: the length of the first storm was corrected."})

    events_path = data / "timeline" / "events.json"
    ev = _read(events_path)
    for date, kind, title, text, ref in (
        ("2026-09-21", "revision", "Revision recorded: source update", "A fictional editor classified the first detected change.", "demonstration"),
        ("2026-09-25", "review", "Editorial review recorded", "A fictional review was completed with limitations.", "demonstration"),
        ("2026-10-06", "correction", "Correction recorded", "A fictional correction about the length of a storm.", "demonstration"),
    ):
        ev["events"].append({"id": L.next_id(reg, "event"), "date": date, "kind": kind, "publication": "PUB-001", "title": title, "text": text,
                             "provenance": {"kind": "demonstration", "ref": ref}})
    L.write_json(events_path, ev)
    L.save_registry(reg, data)

    rep = V.validate(data, L.ROOT, "2026-10-17")
    if rep.errors:
        raise SystemExit("demonstration data failed validation:\n  " + "\n  ".join(rep.errors))
    ledger, _ = B.build(root=L.ROOT, data=data, today="2026-10-17")

    keep = {k: ledger[k] for k in ("publications", "sources", "claims", "reviews", "revisions", "corrections", "timeline")}
    text = re.sub(r'\b(PUB|SRC|CLM|RVW|RVN|COR|EVT)-(\d{3})\b', r"DEMO-\1-\2", json.dumps(keep, ensure_ascii=False))
    keep = json.loads(text)
    for k, rows in keep.items():
        for r in rows:
            r["demo"] = True
    snaps = {}
    for e in log["entries"]:
        snaps[f"{pub['slug']}/{e['file']}"] = _read(data / "snapshots" / pub["slug"] / e["file"])
    keep["snapshots"] = snaps
    keep["validation"] = {"errors": len(rep.errors), "warnings": rep.warnings}
    return keep


def real_snapshots(ledger: dict) -> dict:
    out = {}
    for p in ledger["publications"]:
        for v in p["versions"]:
            out[f"{p['slug']}/{v['file']}"] = _read(L.DATA / "snapshots" / p["slug"] / v["file"])
    return out


def build_bundle() -> dict:
    ledger, _ = B.build(include_drafts=True)
    ledger["config"] = dict(ledger["config"], preview=True)
    with tempfile.TemporaryDirectory(prefix="ledger-demo-") as tmp:
        ledger["demo"] = build_demo(pathlib.Path(tmp))
    return {"ledger": ledger, "snapshots": real_snapshots(ledger)}


def _js(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def artifact_html(bundle: dict) -> str:
    css = (L.LEDGER / "styles.css").read_text(encoding="utf-8")
    diff = (L.LEDGER / "diff.js").read_text(encoding="utf-8")
    app = (L.LEDGER / "app.js").read_text(encoding="utf-8")
    css = css.replace("html{scroll-behavior:smooth}", "html{scroll-behavior:smooth}")
    site = L.SITE
    return f"""<title>Research Ledger Preview</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300&display=swap">
<style>{css}
body{{min-height:100vh}}</style>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><a id="brand" class="brand" href="{site}">Artificially <i>Intelligent</i></a><nav class="site" id="site" aria-label="Site"></nav></header>
<main id="main" tabindex="-1"><div class="wrap"><p>Loading the Research Ledger…</p></div></main>
<footer>The Research Ledger is this site's own record of its research. It is not a peer-review system, and an empty list of corrections does not mean a publication is free of errors. Fingerprints show whether saved text is identical; they do not prove authorship or verification.</footer>
<script>window.LEDGER_ROOT={_js(site)};window.LEDGER_PREVIEW=true;window.__LEDGER={_js(bundle["ledger"])};window.__SNAPSHOTS={_js(bundle["snapshots"])};</script>
<script>{diff}</script>
<script>{app}</script>
"""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--artifact", help="write one self-contained HTML page for a private preview")
    ap.add_argument("--bundle", help="write the preview bundle as JSON")
    args = ap.parse_args(argv)
    bundle = build_bundle()
    d = bundle["ledger"]["demo"]
    print(f"demonstration record: {len(d['publications'])} publication, {len(d['snapshots'])} saved versions, {len(d['revisions'])} revisions, "
          f"{len(d['corrections'])} correction; validator errors {d['validation']['errors']}, warnings {len(d['validation']['warnings'])}")
    for w in d["validation"]["warnings"]:
        print("  note:", w)
    if args.bundle:
        pathlib.Path(args.bundle).write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    if args.artifact:
        pathlib.Path(args.artifact).write_text(artifact_html(bundle), encoding="utf-8")
        print("wrote", args.artifact)
    return 0


if __name__ == "__main__":
    sys.exit(main())
