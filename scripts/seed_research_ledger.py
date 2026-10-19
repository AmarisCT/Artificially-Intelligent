#!/usr/bin/env python3
"""One-time enrichment of the first Ledger records. Safe to re-run: it never overwrites anything.

capture_public_revisions.py creates the factual skeleton for every published essay (publication,
sources exactly as cited, baseline, awaiting-review status). This script adds what the site's own
earlier work had already documented about the two existing essays:

  * source inspection records already written in the Museum, Theory Chamber, Lexicon and shared
    research index data (copied with their origin and wording, dated 'recorded', never invented);
  * Crossref / DataCite metadata checks already recorded by the Research Observatory (2026-10-15);
  * the 23 DRAFT passage classifications already published in the Evidence Explorer, imported
    unchanged, every claim-to-source link marked 'support not assessed';
  * real timeline events (publication dates come from the feed; others from repository history).

Anything not documented stays 'Verification Incomplete'. Nothing here claims a review took place.
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ledger_lib as L  # noqa: E402

P1 = "is-human-consciousness-connected-to-artificial-intelligence"
P2 = "we-are-all-archives-now"
TODAY = "2026-10-17"
BY = "Recorded during site construction with AI assistance. No human editor has re-checked this."
OBSERVATORY = "research-observatory/data/publications.json"


def v(level, basis, origin, inspected=None, extent=None):
    return {"level": level, "recordedOn": TODAY, "inspectedOn": inspected, "basis": basis, "extent": extent,
            "origin": origin, "performedBy": BY}


def meta(pid, provider, date="2026-10-15"):
    return v("metadata-confirmed",
             f"The {provider} record was retrieved and checked against the DOI. Title, authors and date matched.",
             {"kind": "research-observatory", "id": pid, "file": OBSERVATORY}, inspected=date)


# (slug, source-list index) -> enrichment
ENRICH = {
    (P1, 0): dict(type="Journal article", links={"sharedIndexId": "src:cogitate-2025", "theoryChamberId": "cogitate-2025", "learningInstituteId": "cogitate-2025"},
                  history=[v("abstract-reviewed", "Publisher record, as retrieved through an institutional repository page. Only the abstract-level description was read.",
                             {"kind": "shared-research-index", "id": "src:cogitate-2025", "also": "theory-chamber:cogitate-2025"}, extent="abstract-level description")],
                  limitations="The registry notes that the test covers specific predictions in one experimental setting (the published Experiment 1) and that the paper does not declare either theory proven or disproven.",
                  observations=["The volume and page range printed in the publication (Nature 642, 133–142) were not compared with a bibliographic record."]),
    (P1, 1): dict(type="Journal article", links={"sharedIndexId": "src:turing-1950", "observatoryId": "P003", "lexiconId": "turing50", "learningInstituteId": "turing50"},
                  history=[meta("P003", "Crossref"),
                           v("source-content-inspected", "A scanned reproduction hosted at Princeton was read. The scan has OCR errors and one printed figure was garbled. Page numbers and DOI were not confirmed from the scan.",
                             {"kind": "shared-research-index", "id": "src:turing-1950"}, extent="scanned reproduction, read")],
                  limitations="What was read is a reproduction, not the publisher's version.",
                  observations=["The page range printed in the publication (433–460) was not compared with a bibliographic record."]),
    (P1, 2): dict(type="Journal article", links={"sharedIndexId": "src:searle-1980", "observatoryId": "P004", "lexiconId": "searle80", "learningInstituteId": "searle80"},
                  history=[meta("P004", "Crossref"),
                           v("abstract-reviewed", "The abstract was read on a repository page, and the bibliographic details on the publisher page. The full paper was not read.",
                             {"kind": "shared-research-index", "id": "src:searle-1980"}, extent="abstract and bibliographic details")],
                  limitations="The full paper was not read.", observations=[]),
    (P1, 3): dict(type="Journal article", links={}, history=[], limitations=None, observations=[]),
    (P1, 4): dict(type="Journal article", links={}, history=[], limitations=None, observations=[]),
    (P1, 5): dict(type="Journal article", links={}, history=[], limitations=None, observations=[]),
    (P1, 6): dict(type="Preprint", links={"sharedIndexId": "src:butlin-2023", "observatoryId": "P017", "lexiconId": "butlin23", "theoryChamberId": "butlin-2023", "learningInstituteId": "butlin-2023"},
                  history=[meta("P017", "DataCite (arXiv)"),
                           v("abstract-reviewed", "The arXiv abstract page was retrieved and paraphrased.",
                             {"kind": "shared-research-index", "id": "src:butlin-2023", "also": "theory-chamber:butlin-2023"}, extent="arXiv abstract page")],
                  limitations="A preprint. The registry found no journal version mentioned on the page. Its indicator properties depend on the theories it draws from.",
                  observations=[]),
    (P1, 7): dict(type="Preprint", links={}, history=[], limitations=None, observations=[]),
    (P1, 8): dict(type="Journal article", links={}, history=[], limitations=None, observations=[]),
    (P1, 9): dict(type="Journal article", links={}, history=[], limitations=None, observations=[]),
    (P1, 10): dict(type="News feature", links={}, history=[], limitations=None, observations=[]),
    (P2, 0): dict(type="Collection record", links={"museumId": "met-tablet"},
                  history=[v("source-content-inspected", "Object record read in full (date, medium, dimensions, description).",
                             {"kind": "museum", "id": "met-tablet", "file": "museum/data/museum.json"}, extent="read in full")],
                  limitations=None, observations=[]),
    (P2, 1): dict(type="Institutional page", links={"museumId": "bm-library"},
                  history=[v("source-content-inspected", "Project page read in full.", {"kind": "museum", "id": "bm-library", "file": "museum/data/museum.json"}, extent="read in full")],
                  limitations=None, observations=[]),
    (P2, 2): dict(type="Institutional page", links={"museumId": "bm-who"},
                  history=[v("source-content-inspected", "Blog post read in full.", {"kind": "museum", "id": "bm-who", "file": "museum/data/museum.json"}, extent="read in full")],
                  limitations=None, observations=[]),
    (P2, 3): dict(type="Institutional page", links={}, history=[], limitations=None, observations=[]),
    (P2, 4): dict(type="Collection record", links={"museumId": "bm-k3999"}, title="Divination tablet K.3999, Library of Ashurbanipal",
                  history=[v("source-content-inspected", "Collection record read; the page's description text is cut off after the line counts.",
                             {"kind": "museum", "id": "bm-k3999", "file": "museum/data/museum.json"}, extent="partly read (description text cut off)")],
                  limitations="Only part of the record's description could be read.", observations=[]),
    (P2, 5): dict(type="Institutional page", links={"museumId": "tna-domesday"},
                  history=[v("source-content-inspected", "Research guide read in full. It does not explain the origin of the name 'Domesday'.",
                             {"kind": "museum", "id": "tna-domesday", "file": "museum/data/museum.json"}, extent="read in full")],
                  limitations=None, observations=[]),
    (P2, 6): dict(type="Institutional page", links={"museumId": "tna-selection"},
                  history=[v("source-content-inspected", "Guidance page read in full.", {"kind": "museum", "id": "tna-selection", "file": "museum/data/museum.json"}, extent="read in full")],
                  limitations=None,
                  observations=["The page title recorded in the Museum is 'Selecting records for permanent preservation'. The publication prints 'Step 2: Selecting your records'. The address matches. Not yet checked which title the page uses."]),
    (P2, 7): dict(type="Institutional page", links={"museumId": "loc-2010"}, history=[],
                  limitations=None,
                  observations=["The Museum records that this page could not be fetched during site construction. A different Library of Congress page (a 2010 news item) was read instead, so nothing is recorded as read for the page the publication cites."]),
    (P2, 8): dict(type="Preprint", links={"sharedIndexId": "src:brown-2020", "museumId": "brown-2020", "learningInstituteId": "brown-2020"},
                  history=[v("abstract-reviewed", "The arXiv abstract page was read. The full paper was not.",
                             {"kind": "shared-research-index", "id": "src:brown-2020", "also": "museum:brown-2020"}, extent="arXiv abstract page")],
                  limitations="The publication cites Section 2.2 (Training Dataset). Only the abstract page was read, so that section has not been checked.",
                  observations=[]),
}

EVENTS = [
    {"date": "2026-10-15", "kind": "evidence-draft", "publication": None,
     "title": "Draft passage classifications released in the Evidence Explorer",
     "text": "The Evidence Explorer first showed draft classifications for passages of both published essays. They are drafts and have not been editorially reviewed.",
     "provenance": {"kind": "repository-history", "ref": "commit e334974 (2026-10-15)"}},
    {"date": "2026-10-15", "kind": "metadata-check", "publication": P1,
     "title": "Bibliographic records checked for three sources of “Is Human Consciousness Connected to Artificial Intelligence?”",
     "text": "The Research Observatory retrieved Crossref and DataCite records for Turing (1950), Searle (1980) and Butlin et al. (2023) and checked them against their DOIs.",
     "provenance": {"kind": "research-observatory", "ref": "research-observatory/data/status.json"}},
    {"date": TODAY, "kind": "source-import", "publication": None,
     "title": "Existing source-inspection records imported into the Source Registry",
     "text": "Notes already kept by the Museum, Theory Chamber, Lexicon and shared research index were copied into the Source Registry with their origin. Sources with no such note were left as Verification Incomplete.",
     "provenance": {"kind": "ledger-seed", "ref": "scripts/seed_research_ledger.py"}},
]


def explorer_claims():
    text = (L.ROOT / "index.html").read_text(encoding="utf-8")
    m = re.search(r"const CLAIMS=(\[.*?\n\]);", text, re.S)
    if not m:
        raise L.LedgerError("Could not find the CLAIMS array in index.html")
    code = f'const A2="{P1}",A1="{P2}";console.log(JSON.stringify({m.group(1)}))'
    out = subprocess.run(["node", "-e", code], capture_output=True, text=True)
    if out.returncode:
        raise L.LedgerError("node could not read CLAIMS: " + out.stderr[:200])
    return json.loads(out.stdout)


def load(dirname):
    d = L.DATA / dirname
    return {f.stem: L.read_json(f) for f in sorted(d.glob("*.json"))}


def main():
    pubs = load("publications")
    by_slug = {p["slug"]: p for p in pubs.values()}
    if P1 not in by_slug or P2 not in by_slug:
        raise L.LedgerError("Run capture_public_revisions.py first so the two publications exist.")
    sources = load("sources")
    index_of = {}  # (slug, list index) -> source id
    for sid, s in sources.items():
        for c in s["citedBy"]:
            slug = next(p["slug"] for p in pubs.values() if p["id"] == c["publication"])
            index_of[(slug, c["index"])] = sid
    registry = L.load_registry()
    wrote = []

    # 1. sources -------------------------------------------------------------------
    for key, e in ENRICH.items():
        sid = index_of.get(key)
        if not sid:
            raise L.LedgerError(f"No source at {key}")
        s = sources[sid]
        if s.get("seededOn"):
            continue
        history = e["history"]
        s["type"] = e["type"]
        if e.get("title") and not s["citation"].get("title"):
            s["citation"]["title"] = e["title"]
        s["links"] = e["links"]
        s["verification"] = {"level": max(history, key=lambda h: next(x["rank"] for x in tax["verificationLevels"] if x["id"] == h["level"]))["level"] if history else "verification-incomplete",
                             "history": history}
        s["limitations"] = e["limitations"]
        s["observations"] = [{"text": t, "status": "open", "raisedOn": TODAY} for t in e["observations"]]
        s["seededOn"] = TODAY
        s["recordNote"] = ("Citation shown as printed. Inspection notes were copied from records the site already kept, with their origin." if history
                           else "Citation shown as printed. The Ledger has no documented check of this source.") + (" See the observations." if e["observations"] else "")
        if L.write_json(L.DATA / "sources" / f"{sid}.json", s):
            wrote.append(sid)

    # 2. publication context from the shared research index (editorial tags) ------------------
    idx = json.loads((L.ROOT / "inquiry-engine/data/research-index.json").read_text(encoding="utf-8"))
    art = {r["id"]: r for r in idx["resources"] if r["type"] == "article"}
    for p in pubs.values():
        rec = art.get("art:" + p["slug"])
        if rec and not p["contextLinks"]["concepts"]:
            p["contextLinks"]["concepts"] = list(rec["concepts"])
            p["contextLinks"]["conceptsNote"] = "Topic tags from the shared research index. They are editorial and have not been reviewed."
            if L.write_json(L.DATA / "publications" / f"{p['id']}.json", p):
                wrote.append(p["id"])

    # 3. claims ------------------------------------------------------------------
    claims = load("claims")
    have = {(c["publication"], c["explorerId"]) for c in claims.values()}
    ranked = sorted(explorer_claims(), key=lambda c: (by_slug[c["a"]]["id"], c["p"]))
    tax_map = tax["explorerClassificationMap"]
    for c in ranked:
        pub = by_slug[c["a"]]
        if (pub["id"], c["id"]) in have:
            continue
        snap = L.read_json(next((L.DATA / "snapshots" / pub["slug"]).glob("v001-*.json")))["snapshot"]
        passage = snap["body"][c["p"]]
        markers = set(re.findall(r"\[(\d+)\]", passage))
        links = []
        for ref in c["refs"]:
            sid = index_of[(pub["slug"], ref)]
            label = sources[sid]["citedBy"][0].get("label")
            inline = bool(label) and label.strip("[]") in markers
            links.append({"source": sid, "support": "not-assessed",
                          "basis": "inline-marker" if inline else "explorer-draft",
                          "assessedOn": None, "assessedBy": None})
        cid = L.next_id(registry, "claim")
        rec = {
            "schema": L.SCHEMA, "id": cid, "publication": pub["id"], "explorerId": c["id"],
            "passage": {"snapshot": 1, "index": c["p"], "text": passage,
                        "textHash": __import__("hashlib").sha256(passage.encode("utf-8")).hexdigest()[:16]},
            "classification": tax_map[c["t"]], "classificationStatus": "draft",
            "classificationOrigin": {"kind": "evidence-explorer", "id": c["id"],
                                     "note": "Imported unchanged from the Evidence Explorer's draft classification. No editor has reviewed it."},
            "concepts": c.get("c", []), "sourceLinks": links,
            "limitation": c.get("lim"), "debate": c.get("deb"),
            "limitationNote": "The limit is the Evidence Explorer's draft wording." if c.get("lim") else None,
            "reviewedOn": None,
        }
        if L.write_json(L.DATA / "claims" / f"{cid}.json", rec):
            wrote.append(cid)

    # 4. timeline ------------------------------------------------------------------
    events_path = L.DATA / "timeline" / "events.json"
    doc = L.read_json(events_path)
    known = {(e["date"], e["kind"], e.get("publication"), e["title"]) for e in doc["events"]}
    for e in EVENTS:
        e = dict(e)
        if e["publication"]:
            e["publication"] = by_slug[e["publication"]]["id"]
        if (e["date"], e["kind"], e["publication"], e["title"]) in known:
            continue
        doc["events"].append({"id": L.next_id(registry, "event"), **e})
    L.write_json(events_path, doc)
    L.save_registry(registry)
    print(f"seeded: {len(wrote)} files written")


tax = L.read_json(L.DATA / "taxonomy.json")

if __name__ == "__main__":
    try:
        main()
    except L.LedgerError as exc:
        print("seed_research_ledger:", exc, file=sys.stderr)
        sys.exit(2)
