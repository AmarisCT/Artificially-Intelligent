#!/usr/bin/env python3
"""Compile the Research Ledger's public data.

Reads the hand-maintained and captured records under research-ledger/data and writes:

  research-ledger/data/ledger.json          everything the Ledger page needs, in one file
  research-ledger/data/article-notices.json what the article generator may show on an essay page

Rules this script keeps:
  * Deterministic. The same records always produce byte-identical output. It never reads the clock,
    so a scheduled rebuild with unchanged records changes nothing.
  * It validates first and writes nothing if validation fails, so a bad record cannot replace a
    good published file.
  * It reuses data other features already publish (Theory Chamber, Learning Institute, Lexicon,
    shared research index, Research Observatory) and labels every link it derives.
  * It never invents a relationship. Links from other features keep the other feature's wording.
  * Policy drafts and owner questions are public only if --include-drafts is given (used by the
    private preview). The deployed build never passes it.

Usage: build_research_ledger.py [--include-drafts] [--out research-ledger/data] [--check]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ledger_lib as L  # noqa: E402
import validate_research_ledger as V  # noqa: E402


def load_dir(directory):
    out = {}
    if directory.exists():
        for f in sorted(directory.glob("*.json")):
            out[f.stem] = L.read_json(f)
    return out


def tolerant(path, default):
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def doi_url(doi):
    return f"https://doi.org/{doi}" if doi else None


def source_url(cit):
    if cit.get("url"):
        return cit["url"], False
    if cit.get("doi"):
        return doi_url(cit["doi"]), True
    if cit.get("arxiv"):
        return f"https://arxiv.org/abs/{cit['arxiv']}", True
    return None, False


def build_context(root, pubs, claims, sources):
    """Links to other features, each carrying the other feature's own data and a plain label of how it was derived."""
    idx = tolerant(root / "inquiry-engine/data/research-index.json", {"resources": []})
    concept_rec = {r["id"].split(":", 1)[1]: r for r in idx["resources"] if r["type"] == "concept"}
    theories = tolerant(root / "theory-chamber/data/theories.json", {"items": []})["items"]
    courses = tolerant(root / "learning-institute/data/courses.json", {"items": []})
    courses = courses if isinstance(courses, list) else courses.get("items", [])
    lessons = tolerant(root / "learning-institute/data/lessons.json", {"items": []})
    lessons = lessons if isinstance(lessons, list) else lessons.get("items", [])
    lexicon = tolerant(root / "lexicon/data/concepts.json", {"items": []})["items"]
    questions = {r["id"].split(":", 1)[1]: r for r in idx["resources"] if r["type"] == "question"}
    obs = tolerant(root / "research-observatory/data/publications.json", {"items": []})["items"]
    out = {}
    for pid, p in pubs.items():
        art = "art:" + p["slug"]
        tags = p["contextLinks"].get("concepts", [])
        ctx = {
            "concepts": [{"id": t, "title": concept_rec[t]["title"], "url": concept_rec[t]["url"]} for t in tags if t in concept_rec],
            "conceptsNote": p["contextLinks"].get("conceptsNote"),
            "theories": [{"id": t["id"], "name": t["name"], "abbr": t.get("abbr"), "paragraph": m["paragraph"],
                          "url": f"{L.SITE}theory-chamber/#theory-{t['id']}"}
                         for t in theories for m in t.get("essayMentions", []) if m.get("slug") == p["slug"]],
            "learning": [],
            "lexicon": [{"id": c["id"], "term": c["term"], "url": f"{L.SITE}lexicon/#c-{c['id']}"} for c in lexicon if c["id"] in tags],
            "questions": [],
            "explorer": {"claims": sum(1 for c in claims.values() if c["publication"] == pid), "url": f"{L.SITE}#evidence"},
        }
        qids = {}
        for course in courses:
            if art in (course.get("articles") or []):
                entry = {"id": course["id"], "title": course["title"], "reviewStatus": course.get("reviewStatus"),
                         "url": f"{L.SITE}learning-institute/#course-{course['id']}", "lessons": []}
                for lsn in lessons:
                    if lsn.get("courseId") == course["id"] and art in (lsn.get("connections", {}).get("articles") or []):
                        entry["lessons"].append({"id": lsn["id"], "title": lsn["title"], "url": f"{L.SITE}learning-institute/#lesson-{lsn['id']}"})
                        for q in lsn["connections"].get("questions", []):
                            qids.setdefault(q, lsn["id"])
                ctx["learning"].append(entry)
        for q, via in sorted(qids.items()):
            if q in questions:
                ctx["questions"].append({"id": q, "title": questions[q]["title"], "url": questions[q]["url"],
                                         "via": f"Learning Institute lesson {via}"})
        # Research Observatory: suggestions only. Nobody has judged relevance.
        mine = set()
        for s in sources.values():
            if any(c["publication"] == pid for c in s["citedBy"]):
                mine.add((s["citation"].get("doi") or "").lower())
                mine.add(("arxiv:" + s["citation"]["arxiv"]) if s["citation"].get("arxiv") else "")
        ctx["suggestions"] = []
        for o in obs:
            if (o.get("doi") or "").lower() in mine or ("arxiv:" + (o.get("doi") or "").split("arXiv.")[-1]) in mine:
                continue
            shared = sorted(set(o.get("concepts", [])) & set(tags))
            if len(shared) >= 2:
                ctx["suggestions"].append({"observatoryId": o["id"], "title": o["title"], "year": (o.get("publicationDate") or "")[:4],
                                           "doi": o.get("doi"), "sharedTags": shared, "status": "suggested-unreviewed"})
        ctx["suggestions"] = sorted(ctx["suggestions"], key=lambda s: (-len(s["sharedTags"]), s["observatoryId"]))[:8]
        out[pid] = ctx
    return out



def build(root=L.ROOT, data=L.DATA, include_drafts=False, today=None) -> tuple[dict, dict]:
    root, data = pathlib.Path(root), pathlib.Path(data)
    rep = V.validate(data, root, today)
    if rep.errors:
        raise L.LedgerError("validation failed:\n  " + "\n  ".join(rep.errors))
    tax = L.read_json(data / "taxonomy.json")
    cfg = L.read_json(data / "config.json")
    pubs = load_dir(data / "publications")
    sources = load_dir(data / "sources")
    claims = load_dir(data / "claims")
    reviews = load_dir(data / "reviews")
    revisions = load_dir(data / "revisions")
    corrections = load_dir(data / "corrections")
    events = L.read_json(data / "timeline" / "events.json", default={"events": []})["events"]
    policies = L.read_json(data / "policies" / "methodology.json")["policies"]

    out_pubs = []
    for pid, p in sorted(pubs.items()):
        log = L.read_json(data / "snapshots" / p["slug"] / "log.json")
        review = next(r for r in reviews.values() if r["publication"] == pid)
        revs = sorted([r for r in revisions.values() if r["publication"] == pid], key=lambda r: r["id"])
        cors = sorted([c for c in corrections.values() if c["publication"] == pid and c["approval"] == "approved"], key=lambda c: c["id"])
        classified = [r for r in revs if r["state"] == "classified"]
        current = log["entries"][-1]
        out_pubs.append({
            **p,
            "sourceIds": sorted(sid for sid, s in sources.items() if any(c["publication"] == pid for c in s["citedBy"])),
            "claimIds": sorted(cid for cid, c in claims.items() if c["publication"] == pid),
            "reviewId": review["id"],
            "revisionIds": [r["id"] for r in revs],
            "correctionIds": [c["id"] for c in cors],
            "versions": [{k: e[k] for k in ("n", "hash", "kind", "capturedOn", "capturedAt", "file", "words", "paragraphs", "sources")} for e in log["entries"]],
            "current": {"n": current["n"], "hash": current["hash"], "words": current["words"], "capturedOn": current["capturedOn"]},
            "historyBegins": log["entries"][0]["capturedOn"],
            "latestRevisionDate": max((r.get("classifiedOn") or r["detectedOn"] for r in classified), default=None),
            "readingMinutes": max(1, round(current["words"] / 220)),
        })
    ctx = build_context(root, pubs, claims, sources)
    for p in out_pubs:
        p["context"] = ctx[p["id"]]

    out_sources = []
    for sid, s in sorted(sources.items()):
        url, derived = source_url(s["citation"])
        out_sources.append({**s, "href": url, "hrefDerived": derived,
                            "claimIds": sorted(cid for cid, c in claims.items() if any(l["source"] == sid for l in c["sourceLinks"]))})

    ordered_events = sorted(events, key=lambda e: (e["date"], e["id"]))
    pol_out = []
    owner = {}
    if include_drafts:
        owner = L.read_json(L.ROOT / "scripts" / "research-ledger-src" / "policy-drafts.json", default={"drafts": {}})["drafts"]
    for pol in policies:
        rec = dict(pol)
        if include_drafts and pol["id"] in owner:
            rec["draft"] = owner[pol["id"]]["draft"]
            rec["ownerQuestions"] = owner[pol["id"]]["ownerQuestions"]
        pol_out.append(rec)

    levels = {x["id"]: x["label"] for x in tax["verificationLevels"]}
    by_level = {k: 0 for k in levels}
    for s in sources.values():
        by_level[s["verification"]["level"]] += 1
    by_class = {x["id"]: 0 for x in tax["claimClassifications"]}
    for c in claims.values():
        by_class[c["classification"]] += 1
    by_support = {x["id"]: 0 for x in tax["supportStatuses"]}
    links = 0
    for c in claims.values():
        for ln in c["sourceLinks"]:
            by_support[ln["support"]] += 1
            links += 1
    by_review = {x["id"]: 0 for x in tax["reviewStatuses"]}
    for r in reviews.values():
        by_review[r["status"]] += 1
    dates = [p["ledgerEntryDate"] for p in pubs.values()]
    for s in sources.values():
        dates += [h["recordedOn"] for h in s["verification"]["history"]] + [s["recordedOn"]]
    for r in reviews.values():
        dates += [h["on"] for h in r["history"]]
    dates += [r["detectedOn"] for r in revisions.values()] + [r.get("classifiedOn") for r in revisions.values() if r.get("classifiedOn")]
    dates += [c["recordedOn"] for c in corrections.values()]
    dates += [e["capturedOn"] for pb in out_pubs for e in pb["versions"]]
    integrity = {
        "publications": len(pubs), "sources": len(sources), "claims": len(claims), "claimSourceLinks": links,
        "sourcesByLevel": by_level, "claimsByClassification": by_class, "linksBySupport": by_support,
        "claimsDraft": sum(1 for c in claims.values() if c["classificationStatus"] == "draft"),
        "claimsReviewed": sum(1 for c in claims.values() if c["classificationStatus"] == "reviewed"),
        "claimsWithoutSource": sum(1 for c in claims.values() if not c["sourceLinks"]),
        "reviewsByStatus": by_review,
        "editoriallyReviewed": by_review["editorially-reviewed"] + by_review["review-completed-with-limitations"],
        "awaitingReview": by_review["awaiting-editorial-review"],
        "verificationRecords": sum(len(s["verification"]["history"]) for s in sources.values()),
        "snapshots": sum(len(p["versions"]) for p in out_pubs),
        "revisionsClassified": sum(1 for r in revisions.values() if r["state"] == "classified"),
        "changesUnclassified": sum(1 for r in revisions.values() if r["state"] == "unclassified"),
        "corrections": sum(1 for c in corrections.values() if c["approval"] == "approved"),
        "openObservations": sum(1 for s in sources.values() for o in s.get("observations", []) if o["status"] == "open"),
        "policiesApproved": sum(1 for p in policies if p["status"] == "approved"),
        "policiesTotal": len(policies),
        "ledgerUpdated": max(dates),
    }
    integrations = [
        {"name": "Evidence Explorer", "state": "connected", "note": "Claims are imported from the Explorer as drafts and link back to it. The Explorer's own text was not changed."},
        {"name": "Living Archive", "state": "connected", "note": "The Ledger takes publication dates from the same feed. It keeps one set of dates."},
        {"name": "Published Research", "state": "connected", "note": "Each record links to the essay's page and the essay is linked back after approval."},
        {"name": "Theory Chamber", "state": "connected", "note": "Shows theories whose records already mention an essay."},
        {"name": "Learning Institute", "state": "connected", "note": "Shows courses and lessons that already cite an essay."},
        {"name": "Lexicon of Intelligence", "state": "connected", "note": "Shows entries that share a topic tag with an essay."},
        {"name": "Research Observatory", "state": "suggestions-only", "note": "Suggests newly found papers for review by shared topic tags. Nobody has judged their relevance."},
        {"name": "Unanswered Archive", "state": "connected", "note": "Shows questions that Learning Institute lessons already link to an essay. Status changes will be recorded when an editor makes them."},
        {"name": "Museum of Human Memory", "state": "connected", "note": "Source inspection notes kept by the Museum were imported into the Source Registry with their origin."},
        {"name": "Thinkers Archive", "state": "not-deployed", "note": "This feature does not exist on the site yet. The Ledger links to nothing there."},
    ]
    ledger = {
        "schema": L.SCHEMA, "ledgerAsOf": max(dates), "taxonomy": tax, "config": cfg,
        "publications": out_pubs, "sources": out_sources,
        "claims": [dict(c) for _, c in sorted(claims.items())],
        "reviews": [r for _, r in sorted(reviews.items())],
        "revisions": [r for _, r in sorted(revisions.items())],
        "corrections": [c for _, c in sorted(corrections.items()) if c["approval"] == "approved"],
        "timeline": ordered_events, "policies": pol_out, "integrity": integrity, "integrations": integrations,
        "site": L.SITE,
    }

    notices = {}
    rv_label = {x["id"]: x["label"] for x in tax["reviewStatuses"]}
    for p in out_pubs:
        review = reviews[p["reviewId"]]
        note = {"publication": p["id"], "ledgerUrl": f"{L.SITE}research-ledger/#publication-{p['id']}",
                "reviewStatus": rv_label[review["status"]], "correction": None}
        for cid in p["correctionIds"]:
            c = corrections[cid]
            if c.get("noticeLevel") == "prominent":
                note["correction"] = {"id": cid, "date": c["recordedOn"], "summary": c.get("noticeText") or c["issue"],
                                      "url": f"{L.SITE}research-ledger/#correction-{cid}"}
        notices[p["slug"]] = note
    return ledger, {"schema": L.SCHEMA, "note": "Read by scripts/build_published.py. Only approved correction records appear here.", "notices": notices}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(L.DATA))
    ap.add_argument("--include-drafts", action="store_true", help="private preview only: include unapproved policy drafts")
    ap.add_argument("--check", action="store_true", help="exit 1 if the files on disk differ from a fresh build")
    args = ap.parse_args(argv)
    out = pathlib.Path(args.out)
    try:
        ledger, notices = build(data=out, include_drafts=args.include_drafts)
    except L.LedgerError as exc:
        print(f"build_research_ledger: {exc}\nNothing was written; the previously published Ledger data is unchanged.", file=sys.stderr)
        return 1
    if args.check:
        same = all((out / n).exists() and (out / n).read_text(encoding="utf-8") == L.dump_json(o)
                   for n, o in (("ledger.json", ledger), ("article-notices.json", notices)))
        print("up to date" if same else "out of date")
        return 0 if same else 1
    changed = [n for n, o in (("ledger.json", ledger), ("article-notices.json", notices)) if L.write_json(out / n, o)]
    print("wrote " + ", ".join(changed) if changed else "no changes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
