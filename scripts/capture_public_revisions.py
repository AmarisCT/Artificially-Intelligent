#!/usr/bin/env python3
"""Record what is publicly published, and notice when it changes.

Reads feed.xml (the same public source build_published.py uses). For each published essay it:

  1. creates a Ledger record the first time the essay is seen (publication, one source record per
     cited source, an "Awaiting Editorial Review" status, a baseline snapshot, timeline events);
  2. computes a deterministic hash of the normalised public text (title, deck, category, body, sources);
  3. does NOTHING when the hash equals the last saved one (so scheduled rebuilds create no revisions);
  4. when the hash differs, waits until the same new text is seen again on a later run (guards against
     a partial or transient feed) and then saves a snapshot and an UNCLASSIFIED change record.

It never decides what a change means. It never reads git history, so a deployment commit can never
be mistaken for an editorial revision. It never deletes anything. If the feed is unreadable it exits
with an error and leaves every record as it was.

Usage: capture_public_revisions.py [--feed feed.xml] [--data research-ledger/data] [--now 2026-10-17T10:00:00Z]
                                   [--confirm-now] [--dry-run] [--min-gap-minutes 30]
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ledger_lib as L  # noqa: E402

MIN_BODY_BLOCKS = 3


class Plan:
    """Collects writes so a failure part-way leaves the repository untouched."""

    def __init__(self):
        self.writes: dict[pathlib.Path, object] = {}

    def put(self, path, obj):
        self.writes[pathlib.Path(path)] = obj

    def apply(self) -> list[str]:
        changed = []
        for path, obj in sorted(self.writes.items()):
            if L.write_json(path, obj):
                changed.append(str(path))
        return changed


def _load_dir(directory: pathlib.Path) -> dict[str, dict]:
    out = {}
    if directory.exists():
        for f in sorted(directory.glob("*.json")):
            out[f.stem] = L.read_json(f)
    return out


def _norm_url(u):
    return (u or "").lower().rstrip("/").replace("http://", "https://")


def find_existing_source(sources: dict[str, dict], entry: dict):
    for sid, s in sources.items():
        c = s["citation"]
        if entry["doi"] and c.get("doi") and entry["doi"].lower() == c["doi"].lower():
            return sid
        if entry["arxiv"] and c.get("arxiv") and entry["arxiv"] == c["arxiv"]:
            return sid
        if entry["url"] and c.get("url") and _norm_url(entry["url"]) == _norm_url(c["url"]):
            return sid
    return None


def snapshot_file_name(n: int, digest: str) -> str:
    return f"v{n:03d}-{digest[:12]}.json"


def create_publication_records(plan: Plan, data: pathlib.Path, registry: dict, article: dict, snap: dict,
                               digest: str, today: str, now_iso: str, sources: dict[str, dict],
                               events: list[dict]) -> str:
    pub_id = L.next_id(registry, "publication")
    entries = L.parse_source_entries(snap["sources"])
    cited_ids = []
    for e in entries:
        sid = find_existing_source(sources, e)
        cite = {"publication": pub_id, "index": e["index"], "label": e["label"], "labelInherited": e["labelInherited"]}
        if sid:
            sources[sid]["citedBy"].append(cite)
        else:
            sid = L.next_id(registry, "source")
            sources[sid] = {
                "schema": L.SCHEMA, "id": sid,
                "citation": {"raw": e["raw"], "title": e["title"], "year": e["year"], "doi": e["doi"],
                             "arxiv": e["arxiv"], "url": e["url"]},
                "citedBy": [cite],
                "verification": {"level": "verification-incomplete", "history": []},
                "links": {},
                "retraction": {"status": "not checked", "checkedOn": None},
                "recordedOn": today,
                "recordNote": "Created automatically from the publication's own source list. The citation is shown as printed. Nothing about it has been checked.",
            }
        cited_ids.append(sid)
        plan.put(data / "sources" / f"{sid}.json", sources[sid])
    for sid in set(cited_ids):
        plan.put(data / "sources" / f"{sid}.json", sources[sid])

    pub = {
        "schema": L.SCHEMA, "id": pub_id, "slug": article["slug"], "feedGuid": article["guid"] or None,
        "title": snap["title"], "deck": snap["deck"], "category": snap["category"],
        "author": "Artificially Intelligent (original essay)",
        "publishedAt": article["publishedAt"] or None, "ledgerEntryDate": today,
        "url": f"{L.SITE}research/published/{article['slug']}/",
        "substack": {"status": "not recorded", "url": None,
                     "note": "No Substack address has been recorded for this publication."},
        "contextLinks": {"concepts": [], "questions": [], "theories": [], "lexicon": [], "sharedIndexId": f"art:{article['slug']}"},
        "recordNote": "Created automatically when the Ledger first saw this publication. Links to other parts of the research archive have not been reviewed.",
    }
    plan.put(data / "publications" / f"{pub_id}.json", pub)

    rvw_id = L.next_id(registry, "review")
    plan.put(data / "reviews" / f"{rvw_id}.json", {
        "schema": L.SCHEMA, "id": rvw_id, "publication": pub_id, "status": "awaiting-editorial-review",
        "history": [{"status": "awaiting-editorial-review", "on": today,
                     "note": "Initial status when the publication was recorded in the Ledger. No editorial review has been recorded."}],
        "reviewer": None, "limitations": None, "nextStep": None,
    })

    snap_name = snapshot_file_name(1, digest)
    plan.put(data / "snapshots" / article["slug"] / snap_name,
             {"schema": L.SCHEMA, "n": 1, "hash": digest, "hashVersion": L.HASH_VERSION, "kind": "baseline",
              "capturedOn": today, "capturedAt": now_iso, "snapshot": snap})
    plan.put(data / "snapshots" / article["slug"] / "log.json", {
        "schema": L.SCHEMA, "publication": pub_id, "slug": article["slug"],
        "note": "Saved versions of the public text, oldest first. The first entry is a baseline: the text as it stood on the capture date. Earlier edits, if there were any, were not recorded.",
        "entries": [{"n": 1, "hash": digest, "kind": "baseline", "capturedOn": today, "capturedAt": now_iso,
                     "file": snap_name, "words": L.word_count(snap), "paragraphs": len(snap["body"]),
                     "sources": len(snap["sources"])}],
        "pending": None,
    })

    if article["publishedAt"]:
        events.append({"date": article["publishedAt"], "kind": "publication", "publication": pub_id,
                       "title": f"“{snap['title']}” published",
                       "text": "Date taken from the publication feed.",
                       "provenance": {"kind": "feed", "ref": "feed.xml pubDate"}})
    events.append({"date": today, "kind": "baseline", "publication": pub_id,
                   "title": f"Baseline captured for “{snap['title']}”",
                   "text": "The Ledger saved the public text as it stood on this date. This is the earliest version held.",
                   "provenance": {"kind": "ledger-capture", "ref": f"snapshots/{article['slug']}/{snap_name}"}})
    return pub_id


def capture(feed, data, today: str, now_iso: str, *, confirm_now=False, min_gap_minutes=30, dry_run=False) -> dict:
    data = pathlib.Path(data)
    # Newest first, the order of the public manifest, so the first ids match it (PUB-001 is the newest essay).
    # Ids are issued once and never reused, so later essays simply take the next number.
    articles = sorted(L.parse_feed(feed), key=lambda a: (a["publishedAt"] or "", a["slug"]), reverse=True)
    now = dt.datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
    plan = Plan()
    registry = L.load_registry(data)
    registry_before = L.dump_json(registry)

    pubs = _load_dir(data / "publications")
    sources = _load_dir(data / "sources")
    by_slug = {p["slug"]: p for p in pubs.values()}
    by_guid = {p["feedGuid"]: p for p in pubs.values() if p.get("feedGuid")}
    events_path = data / "timeline" / "events.json"
    events_doc = L.read_json(events_path, default={"schema": L.SCHEMA, "events": []})
    new_events: list[dict] = []
    report = {"created": [], "unchanged": [], "pending": [], "recorded": [], "ignored": [], "warnings": []}

    for article in articles:
        snap = L.snapshot_from_article(article)
        if len(snap["body"]) < MIN_BODY_BLOCKS:
            report["ignored"].append({"slug": article["slug"], "reason": f"fewer than {MIN_BODY_BLOCKS} text blocks; treated as an incomplete feed item"})
            continue
        digest = L.content_hash(snap)
        pub = by_guid.get(article["guid"]) or by_slug.get(article["slug"])
        if pub is None:
            pub_id = create_publication_records(plan, data, registry, article, snap, digest, today, now_iso, sources, new_events)
            report["created"].append({"id": pub_id, "slug": article["slug"]})
            continue
        if pub["slug"] != article["slug"]:
            report["warnings"].append(f"{pub['id']}: the title now produces a different page address ({pub['slug']} -> {article['slug']}). The Ledger kept the original slug. This needs a human decision.")
        if article["publishedAt"] and pub.get("publishedAt") and article["publishedAt"] != pub["publishedAt"]:
            report["warnings"].append(f"{pub['id']}: the feed publication date is {article['publishedAt']} but the Ledger holds {pub['publishedAt']}. The Ledger did not change it and did not record a revision.")
        slug = pub["slug"]
        log_path = data / "snapshots" / slug / "log.json"
        log = L.read_json(log_path)
        last = log["entries"][-1]
        pending = log.get("pending")
        if digest == last["hash"]:
            if pending:
                log["pending"] = None
                plan.put(log_path, log)
                report["warnings"].append(f"{pub['id']}: a candidate change was seen earlier but the text returned to the saved version, so nothing was recorded.")
            report["unchanged"].append(pub["id"])
            continue
        if pending and pending["hash"] == digest:
            first = dt.datetime.fromisoformat(pending["firstSeenAt"].replace("Z", "+00:00"))
            persisted = (now - first) >= dt.timedelta(minutes=min_gap_minutes)
            if not (persisted or confirm_now):
                report["pending"].append({"id": pub["id"], "waitingUntil": (first + dt.timedelta(minutes=min_gap_minutes)).isoformat()})
                continue
            n = last["n"] + 1
            name = snapshot_file_name(n, digest)
            plan.put(data / "snapshots" / slug / name,
                     {"schema": L.SCHEMA, "n": n, "hash": digest, "hashVersion": L.HASH_VERSION, "kind": "detected-change",
                      "capturedOn": today, "capturedAt": now_iso, "snapshot": snap})
            previous = L.read_json(data / "snapshots" / slug / last["file"])["snapshot"]
            log["entries"].append({"n": n, "hash": digest, "kind": "detected-change", "capturedOn": today, "capturedAt": now_iso,
                                   "file": name, "words": L.word_count(snap), "paragraphs": len(snap["body"]),
                                   "sources": len(snap["sources"])})
            log["pending"] = None
            plan.put(log_path, log)
            rvn_id = L.next_id(registry, "revision")
            plan.put(data / "revisions" / f"{rvn_id}.json", {
                "schema": L.SCHEMA, "id": rvn_id, "publication": pub["id"], "state": "unclassified",
                "fromSnapshot": last["n"], "toSnapshot": n, "detectedOn": today,
                "category": None, "summary": None, "reason": None, "classifiedBy": None, "classifiedOn": None,
                "stats": L.diff_stats(previous, snap),
                "note": "The published text differs from the previous saved version. Nobody has yet recorded what changed or why.",
            })
            new_events.append({"date": today, "kind": "change-detected", "publication": pub["id"],
                               "title": f"Change detected in “{snap['title']}”",
                               "text": "The published text differs from the previous saved version. The change has not been classified.",
                               "provenance": {"kind": "ledger-capture", "ref": f"snapshots/{slug}/{name}"}})
            report["recorded"].append({"id": pub["id"], "revision": rvn_id, "snapshot": n})
        else:
            log["pending"] = {"hash": digest, "firstSeenAt": now_iso}
            plan.put(log_path, log)
            report["pending"].append({"id": pub["id"], "waitingUntil": (now + dt.timedelta(minutes=min_gap_minutes)).isoformat()})

    for p in pubs.values():
        if p["slug"] not in {a["slug"] for a in articles} and p.get("feedGuid") not in {a["guid"] for a in articles}:
            report["warnings"].append(f"{p['id']}: not present in the current feed. The Ledger did not remove it. If it was withdrawn, record that in Corrections & Clarifications.")

    if new_events:
        known = {(e["date"], e["kind"], e.get("publication"), e["title"]) for e in events_doc["events"]}
        for e in new_events:
            if (e["date"], e["kind"], e.get("publication"), e["title"]) in known:
                continue
            counter = L.next_id(registry, "event")
            events_doc["events"].append({"id": counter, **e})
        plan.put(events_path, events_doc)

    if not dry_run and L.dump_json(registry) != registry_before:
        L.save_registry(registry, data)
    status = {
        "schema": L.SCHEMA, "lastCheckedAt": now_iso, "feedItems": len(articles),
        "publicationsTracked": len(pubs) + len(report["created"]),
        "created": len(report["created"]), "unchanged": len(report["unchanged"]),
        "candidateChanges": [p["id"] for p in report["pending"]], "recordedChanges": len(report["recorded"]),
        "ignored": report["ignored"], "warnings": report["warnings"],
        "note": "Written by capture_public_revisions.py. The time is when the Ledger last compared the public text with its saved versions.",
    }
    plan.put(data / "ledger-status.json", status)
    if dry_run:
        report["wouldWrite"] = sorted(str(p) for p in plan.writes)
    else:
        report["written"] = plan.apply()
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--feed", default=str(L.ROOT / "feed.xml"))
    ap.add_argument("--data", default=str(L.DATA))
    ap.add_argument("--now", default=None, help="UTC time, e.g. 2026-10-17T10:00:00Z (default: the real time)")
    ap.add_argument("--confirm-now", action="store_true", help="record a changed text immediately instead of waiting for a second sighting")
    ap.add_argument("--min-gap-minutes", type=int, default=30)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    now_iso = args.now or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    today = now_iso[:10]
    try:
        report = capture(args.feed, args.data, today, now_iso, confirm_now=args.confirm_now,
                         min_gap_minutes=args.min_gap_minutes, dry_run=args.dry_run)
    except L.LedgerError as exc:
        print(f"capture_public_revisions: {exc}. Existing Ledger records were left as they are.", file=sys.stderr)
        return 2
    print(f"created {len(report['created'])}, unchanged {len(report['unchanged'])}, waiting {len(report['pending'])}, "
          f"recorded {len(report['recorded'])}, ignored {len(report['ignored'])}")
    for w in report["warnings"]:
        print("warning:", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())
