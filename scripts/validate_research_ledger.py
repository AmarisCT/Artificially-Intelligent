#!/usr/bin/env python3
"""Validate every Research Ledger record.

Exit status 0 = no errors (warnings may remain); 1 = at least one error; 2 = the data could not be read.

The checks protect the Ledger's honesty rules as well as its structure: a verification level needs
recorded work behind it, a claim can only be marked as supported by a source that was actually
inspected, a review needs a named reviewer, saved snapshots must still match their hashes, and
public files must not carry credentials or unapproved policy drafts.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ledger_lib as L  # noqa: E402

ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
ISO_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
CRED = re.compile(r"(password|passwd|secret|api[_-]?key|bearer\s+[a-z0-9]|authorization:|private[_ -]?key)", re.I)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PEER = re.compile(r"peer[- ]review", re.I)
PREFIX = L.ID_PREFIX


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def load_dir(directory: pathlib.Path, report: Report, kind: str):
    out = {}
    if not directory.exists():
        return out
    for f in sorted(directory.glob("*.json")):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            report.err(str(f.relative_to(directory.parent)), f"not valid JSON ({exc})")
            continue
        rid = rec.get("id")
        if rid != f.stem:
            report.err(f"{kind}/{f.name}", f"record id {rid!r} does not match the file name")
        if not re.fullmatch(PREFIX[kind] + r"-\d{3,}", f.stem):
            report.err(f"{kind}/{f.name}", f"file name is not a valid {PREFIX[kind]} id")
        if rec.get("schema") != L.SCHEMA:
            report.err(f"{kind}/{f.name}", f"schema is {rec.get('schema')!r}, expected {L.SCHEMA}")
        out[f.stem] = rec
    return out


def ids_of(tax, key):
    return {x["id"] for x in tax[key]}


def check_date(report, where, value, field, allow_none=False):
    if value is None and allow_none:
        return
    if not isinstance(value, str) or not ISO.match(value):
        report.err(where, f"{field} must be a date like 2026-10-17, got {value!r}")


def validate(data=L.DATA, root=L.ROOT, today: str | None = None) -> Report:
    data, root = pathlib.Path(data), pathlib.Path(root)
    r = Report()
    today = today or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    try:
        tax = json.loads((data / "taxonomy.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        r.err("taxonomy.json", f"cannot be read ({exc})")
        return r
    levels = {x["id"]: x["rank"] for x in tax["verificationLevels"]}
    cls_ids = ids_of(tax, "claimClassifications")
    claim_status = ids_of(tax, "claimStatuses")
    support_ids = ids_of(tax, "supportStatuses")
    review_ids = ids_of(tax, "reviewStatuses")
    rev_cat = ids_of(tax, "revisionCategories")
    corr_kinds = ids_of(tax, "correctionKinds")
    policy_status = ids_of(tax, "policyStatuses")

    pubs = load_dir(data / "publications", r, "publication")
    sources = load_dir(data / "sources", r, "source")
    claims = load_dir(data / "claims", r, "claim")
    reviews = load_dir(data / "reviews", r, "review")
    revisions = load_dir(data / "revisions", r, "revision")
    corrections = load_dir(data / "corrections", r, "correction")

    # ---------------------------------------------------------------- registry
    reg_path = data / "id-registry.json"
    try:
        registry = json.loads(reg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        registry = None
        r.err("id-registry.json", "missing or unreadable")
    if registry:
        for kind, records in (("publication", pubs), ("source", sources), ("claim", claims), ("review", reviews),
                              ("revision", revisions), ("correction", corrections)):
            issued = set(registry["issued"].get(kind, []))
            for rid in records:
                if rid not in issued:
                    r.err(f"{kind}/{rid}", "id is not in id-registry.json (ids must be issued, never invented)")
            if len(registry["issued"].get(kind, [])) != len(issued):
                r.err("id-registry.json", f"duplicate ids under {kind}")

    # ---------------------------------------------------------------- publications + snapshots
    logs = {}
    seen_slugs = set()
    manifest = {}
    mp = root / "research" / "published" / "manifest.json"
    if mp.exists():
        try:
            manifest = {a["url"]: a for a in json.loads(mp.read_text(encoding="utf-8")).get("articles", [])}
        except (json.JSONDecodeError, KeyError):
            r.warn("research/published/manifest.json", "could not be read; canonical URLs were not cross-checked")
    for pid, p in pubs.items():
        w = f"publication/{pid}"
        for f in ("slug", "title", "url", "category", "ledgerEntryDate"):
            if not p.get(f):
                r.err(w, f"missing {f}")
        if p.get("slug") in seen_slugs:
            r.err(w, "duplicate slug")
        seen_slugs.add(p.get("slug"))
        check_date(r, w, p.get("publishedAt"), "publishedAt", allow_none=True)
        check_date(r, w, p.get("ledgerEntryDate"), "ledgerEntryDate")
        if p.get("publishedAt") and p.get("ledgerEntryDate") and p["ledgerEntryDate"] < p["publishedAt"]:
            r.err(w, "ledgerEntryDate is before the publication date")
        expected = f"{L.SITE}research/published/{p.get('slug')}/"
        if p.get("url") != expected:
            r.err(w, f"url should be {expected}")
        if manifest and p.get("url") not in manifest:
            r.warn(w, "this publication is not in research/published/manifest.json")
        sub = p.get("substack") or {}
        if sub.get("url"):
            if not re.match(r"^https://artificialxintelligence\.substack\.com/p/[\w-]+/?$", sub["url"]):
                r.err(w, "substack.url must be a real post address on artificialxintelligence.substack.com")
            for f in ("relationship", "verifiedOn", "authoritativeVersion"):
                if not sub.get(f):
                    r.err(w, f"substack.{f} is required when a Substack address is recorded")
        if PEER.search(json.dumps({k: p.get(k) for k in ("title", "deck", "recordNote", "author")})):
            r.warn(w, "mentions peer review; original essays must not be described as peer reviewed")
        logp = data / "snapshots" / str(p.get("slug")) / "log.json"
        if not logp.exists():
            r.err(w, "no snapshot log (every publication needs a baseline)")
            continue
        log = json.loads(logp.read_text(encoding="utf-8"))
        logs[pid] = log
        if log.get("publication") != pid:
            r.err(f"snapshots/{p['slug']}/log.json", "publication id does not match")
        entries = log.get("entries", [])
        if not entries or entries[0].get("kind") != "baseline":
            r.err(f"snapshots/{p['slug']}/log.json", "first entry must be the baseline")
        for i, e in enumerate(entries, 1):
            sw = f"snapshots/{p['slug']}/{e.get('file')}"
            if e.get("n") != i:
                r.err(sw, f"entry number should be {i}")
            if i > 1 and e.get("kind") != "detected-change":
                r.err(sw, "only the first entry may be a baseline")
            fp = data / "snapshots" / p["slug"] / str(e.get("file"))
            if not fp.exists():
                r.err(sw, "snapshot file is missing")
                continue
            doc = json.loads(fp.read_text(encoding="utf-8"))
            actual = L.content_hash(doc["snapshot"])
            if actual != e["hash"] or doc.get("hash") != e["hash"]:
                r.err(sw, "saved text no longer matches its recorded hash (a snapshot was altered)")
            if doc.get("n") != i:
                r.err(sw, "file number does not match the log")
            if i > 1 and e["hash"] == entries[i - 2]["hash"]:
                r.err(sw, "identical to the previous version (false revision)")
            if not ISO.match(e.get("capturedOn", "")) or e["capturedOn"] > today:
                r.err(sw, "capturedOn is not a valid past or present date")
        on_disk = {f.name for f in (data / "snapshots" / p["slug"]).glob("v*.json")}
        for orphan in on_disk - {e["file"] for e in entries}:
            r.warn(f"snapshots/{p['slug']}/{orphan}", "snapshot file is not listed in the log")

    # ---------------------------------------------------------------- sources
    seen_keys = {}
    for sid, s in sources.items():
        w = f"source/{sid}"
        cit = s.get("citation", {})
        if not cit.get("raw"):
            r.err(w, "citation.raw (the citation as printed) is required")
        cited = s.get("citedBy", [])
        if not cited:
            r.err(w, "orphan source: not cited by any publication")
        for c in cited:
            if c.get("publication") not in pubs:
                r.err(w, f"cites unknown publication {c.get('publication')!r}")
                continue
            log = logs.get(c["publication"])
            if log:
                snap_file = data / "snapshots" / pubs[c["publication"]]["slug"] / log["entries"][-1]["file"]
                n = len(json.loads(snap_file.read_text(encoding="utf-8"))["snapshot"]["sources"])
                if not (0 <= c.get("index", -1) < n):
                    r.warn(w, f"citation index {c.get('index')} is outside the current source list ({n} entries)")
        for key in ("doi", "arxiv", "url"):
            val = cit.get(key)
            if val:
                norm = (key, str(val).lower().rstrip("/").replace("http://", "https://"))
                if norm in seen_keys and seen_keys[norm] != sid:
                    r.err(w, f"duplicate source: same {key} as {seen_keys[norm]}")
                seen_keys.setdefault(norm, sid)
        if cit.get("url") and not str(cit["url"]).startswith("https://"):
            r.warn(w, "source address is not https")
        ver = s.get("verification", {})
        hist = ver.get("history", [])
        level = ver.get("level")
        if level not in levels:
            r.err(w, f"unknown verification level {level!r}")
            continue
        top = max((levels.get(h.get("level"), -1) for h in hist), default=0)
        if levels[level] != top:
            r.err(w, "verification.level must equal the highest completed level in its history")
        for h in hist:
            hw = f"{w} history"
            if h.get("level") not in levels:
                r.err(hw, f"unknown level {h.get('level')!r}")
                continue
            for f in ("recordedOn", "basis", "origin", "performedBy"):
                if not h.get(f):
                    r.err(hw, f"{h['level']} entry is missing {f}")
            check_date(r, hw, h.get("recordedOn"), "recordedOn")
            check_date(r, hw, h.get("inspectedOn"), "inspectedOn", allow_none=True)
            if levels[h["level"]] >= levels["abstract-reviewed"] and not h.get("extent"):
                r.err(hw, f"{h['level']} must say what was actually read (extent)")
            if levels[h["level"]] >= levels["full-source-reviewed"] and not (h.get("reviewer") and h.get("inspectedOn")):
                r.err(hw, f"{h['level']} needs a named reviewer and an inspection date")
            if h.get("recordedOn", "") > today:
                r.err(hw, "recordedOn is in the future")
        if not hist and level != "verification-incomplete":
            r.err(w, "a level above Verification Incomplete needs a history entry")
        for ob in s.get("observations", []):
            if ob.get("status") not in ("open", "resolved"):
                r.err(w, "observation status must be open or resolved")
        if s.get("retraction", {}).get("status") not in ("not checked", "checked: none found", "retracted", "expression of concern"):
            r.err(w, "retraction.status is not a recognised value")

    # ---------------------------------------------------------------- claims
    seen_passages = set()
    for cid, c in claims.items():
        w = f"claim/{cid}"
        if c.get("publication") not in pubs:
            r.err(w, f"unknown publication {c.get('publication')!r}")
            continue
        if c.get("classification") not in cls_ids:
            r.err(w, f"unknown classification {c.get('classification')!r}")
        if c.get("classificationStatus") not in claim_status:
            r.err(w, "unknown classificationStatus")
        if c.get("classificationStatus") == "reviewed" and not (c.get("reviewedOn") and c.get("reviewedBy")):
            r.err(w, "a reviewed classification needs reviewedOn and reviewedBy")
        pas = c.get("passage", {})
        log = logs.get(c["publication"])
        key = (c["publication"], pas.get("index"), c.get("explorerId"))
        if key in seen_passages:
            r.err(w, "duplicate claim for the same passage")
        seen_passages.add(key)
        if log:
            entry = next((e for e in log["entries"] if e["n"] == pas.get("snapshot")), None)
            if not entry:
                r.err(w, f"passage points to snapshot {pas.get('snapshot')} which does not exist")
            else:
                snap = json.loads((data / "snapshots" / pubs[c["publication"]]["slug"] / entry["file"]).read_text(encoding="utf-8"))["snapshot"]
                idx = pas.get("index", -1)
                if not (0 <= idx < len(snap["body"])) or snap["body"][idx] != pas.get("text"):
                    r.err(w, "passage text is not the text at that position in the saved snapshot")
                latest = json.loads((data / "snapshots" / pubs[c["publication"]]["slug"] / log["entries"][-1]["file"]).read_text(encoding="utf-8"))["snapshot"]
                if pas.get("text") not in latest["body"]:
                    r.warn(w, "this passage no longer appears word for word in the latest version; the claim needs re-mapping")
        for ln in c.get("sourceLinks", []):
            sid = ln.get("source")
            if sid not in sources:
                r.err(w, f"links to unknown source {sid!r}")
                continue
            if c["publication"] not in {x["publication"] for x in sources[sid]["citedBy"]}:
                r.err(w, f"{sid} is not cited by {c['publication']}")
            if ln.get("support") not in support_ids:
                r.err(w, f"unknown support status {ln.get('support')!r}")
            if ln.get("support") in ("supports", "partly-supports", "does-not-support"):
                if levels[sources[sid]["verification"]["level"]] < levels["source-content-inspected"]:
                    r.err(w, f"{sid} cannot be marked as supporting a claim: its content was not inspected")
                if not (ln.get("assessedOn") and ln.get("assessedBy") and ln.get("explanation")):
                    r.err(w, "a reviewed support relationship needs assessedOn, assessedBy and an explanation")

    # ---------------------------------------------------------------- reviews
    per_pub = {}
    for rid, rv in reviews.items():
        w = f"review/{rid}"
        if rv.get("publication") not in pubs:
            r.err(w, f"unknown publication {rv.get('publication')!r}")
            continue
        per_pub.setdefault(rv["publication"], []).append(rid)
        if rv.get("status") not in review_ids:
            r.err(w, f"unknown review status {rv.get('status')!r}")
        hist = rv.get("history", [])
        if not hist or hist[-1].get("status") != rv.get("status"):
            r.err(w, "the last history entry must match the current status")
        dates = [h.get("on", "") for h in hist]
        if dates != sorted(dates):
            r.err(w, "status history is not in date order")
        if rv.get("status") in ("editorially-reviewed", "review-completed-with-limitations"):
            for f in ("reviewer", "completedOn", "scope", "criteria", "materialsExamined", "findings", "outcome", "approval"):
                if not rv.get(f):
                    r.err(w, f"a completed review needs {f}")
        if PEER.search(json.dumps(rv)) and not rv.get("externalPeerReview"):
            r.err(w, "mentions peer review without an externalPeerReview record")
    for pid in pubs:
        if len(per_pub.get(pid, [])) != 1:
            r.err(f"publication/{pid}", f"needs exactly one review record, has {len(per_pub.get(pid, []))}")

    # ---------------------------------------------------------------- revisions
    for rid, rv in revisions.items():
        w = f"revision/{rid}"
        pid = rv.get("publication")
        if pid not in pubs:
            r.err(w, f"unknown publication {pid!r}")
            continue
        ns = {e["n"] for e in logs.get(pid, {}).get("entries", [])}
        for f in ("fromSnapshot", "toSnapshot"):
            if rv.get(f) not in ns:
                r.err(w, f"{f} {rv.get(f)!r} is not a saved version")
        if rv.get("toSnapshot") and rv.get("fromSnapshot") and rv["toSnapshot"] <= rv["fromSnapshot"]:
            r.err(w, "toSnapshot must be later than fromSnapshot")
        if rv.get("state") == "classified":
            if rv.get("category") not in rev_cat:
                r.err(w, "a classified revision needs a known category")
            for f in ("summary", "classifiedBy", "classifiedOn"):
                if not rv.get(f):
                    r.err(w, f"a classified revision needs {f}")
        elif rv.get("state") == "unclassified":
            if rv.get("category") or rv.get("summary"):
                r.err(w, "an unclassified change must not carry a category or summary")
        else:
            r.err(w, f"unknown state {rv.get('state')!r}")
        entry = next((e for e in logs.get(pid, {}).get("entries", []) if e["n"] == rv.get("toSnapshot")), None)
        if entry and entry["capturedOn"] != rv.get("detectedOn"):
            r.err(w, "detectedOn does not match the capture date of the new version")
        if rv.get("category") == "correction" and not any(c.get("relatedRevision") == rid for c in corrections.values()):
            r.warn(w, "classified as a Correction but no correction record points to it")
    for pid, log in logs.items():
        covered = {rv["toSnapshot"] for rv in revisions.values() if rv.get("publication") == pid}
        for e in log["entries"][1:]:
            if e["n"] not in covered:
                r.err(f"snapshots/{pubs[pid]['slug']}", f"version {e['n']} has no revision record")

    # ---------------------------------------------------------------- corrections
    for cid, c in corrections.items():
        w = f"correction/{cid}"
        if c.get("publication") not in pubs:
            r.err(w, f"unknown publication {c.get('publication')!r}")
        if c.get("kind") not in corr_kinds:
            r.err(w, f"unknown kind {c.get('kind')!r}")
        for f in ("recordedOn", "issue", "corrected", "reason", "affected", "approval"):
            if not c.get(f):
                r.err(w, f"missing {f}")
        if c.get("approval") not in ("approved", "pending"):
            r.err(w, "approval must be approved or pending")
        if c.get("approval") == "approved" and not (c.get("approvedBy") and c.get("approvedOn")):
            r.err(w, "an approved correction needs approvedBy and approvedOn")
        if c.get("relatedRevision") and c["relatedRevision"] not in revisions:
            r.err(w, f"unknown relatedRevision {c['relatedRevision']!r}")
        for sid in c.get("sources", []):
            if sid not in sources:
                r.err(w, f"unknown source {sid!r}")

    # ---------------------------------------------------------------- timeline
    tl = json.loads((data / "timeline" / "events.json").read_text(encoding="utf-8")) if (data / "timeline" / "events.json").exists() else {"events": []}
    seen_ev = set()
    for e in tl["events"]:
        w = f"timeline/{e.get('id')}"
        if not re.fullmatch(r"EVT-\d{3,}", str(e.get("id"))):
            r.err(w, "invalid event id")
        if registry and e.get("id") not in registry["issued"].get("event", []):
            r.err(w, "event id is not in id-registry.json")
        check_date(r, w, e.get("date"), "date")
        if str(e.get("date", "")) > today:
            r.err(w, "event is dated in the future")
        if not e.get("provenance", {}).get("kind"):
            r.err(w, "every event needs provenance (where the date comes from)")
        if e.get("publication") and e["publication"] not in pubs:
            r.err(w, f"unknown publication {e['publication']!r}")
        k = (e.get("date"), e.get("kind"), e.get("publication"), e.get("title"))
        if k in seen_ev:
            r.err(w, "duplicate event")
        seen_ev.add(k)
        if e.get("kind") == "publication" and e.get("publication") in pubs and pubs[e["publication"]].get("publishedAt") != e.get("date"):
            r.err(w, "publication event date differs from the publication record")
        if e.get("kind") == "baseline" and e.get("publication") in logs and logs[e["publication"]]["entries"][0]["capturedOn"] != e.get("date"):
            r.err(w, "baseline event date differs from the baseline capture date")

    # ---------------------------------------------------------------- policies (public file)
    pol = json.loads((data / "policies" / "methodology.json").read_text(encoding="utf-8")) if (data / "policies" / "methodology.json").exists() else {"policies": []}
    keys = set()
    for p in pol["policies"]:
        w = f"policy/{p.get('id')}"
        if p.get("status") not in policy_status:
            r.err(w, f"unknown status {p.get('status')!r}")
        if "draft" in p or "ownerQuestions" in p:
            r.err(w, "unapproved draft text must not be in the public policies file (keep it in scripts/research-ledger-src)")
        if p.get("status") == "approved" and not (p.get("approvedBy") and p.get("approvedOn") and p.get("text")):
            r.err(w, "an approved policy needs approvedBy, approvedOn and public text")
        if p.get("status") != "approved" and p.get("text"):
            r.err(w, "only an approved policy may carry public text")
        if p.get("key") in keys:
            r.err(w, "duplicate key")
        keys.add(p.get("key"))

    # ---------------------------------------------------------------- privacy scan of every public data file
    for f in sorted(data.rglob("*.json")):
        text = f.read_text(encoding="utf-8")
        rel = str(f.relative_to(data))
        if rel.startswith("snapshots/"):
            continue  # public essay text; quoted passages may contain any words
        if CRED.search(text):
            r.err(rel, "contains credential-like wording; public Ledger data must never hold secrets")
        if EMAIL.search(text):
            r.warn(rel, "contains an email address; confirm it is meant to be public")
    cfg = data / "config.json"
    if cfg.exists():
        c = json.loads(cfg.read_text(encoding="utf-8"))
        ep = (c.get("concernChannels") or {}).get("endpoint")
        if ep and not str(ep).startswith("https://"):
            r.err("config.json", "concernChannels.endpoint must be https")
        for flag in ("preview", "articlePageLinks"):
            if flag in c and not isinstance(c[flag], bool):
                r.err("config.json", f"{flag} must be true or false")
        if c.get("preview"):
            r.err("config.json", "preview must be false in the committed data (the private preview sets it only in its own bundle)")

    # ---------------------------------------------------------------- status file
    stp = data / "ledger-status.json"
    if stp.exists():
        st = json.loads(stp.read_text(encoding="utf-8"))
        for w_ in st.get("warnings", []):
            r.warn("ledger-status.json", w_)
        for c_ in st.get("candidateChanges", []):
            r.warn("ledger-status.json", f"{c_} has a candidate text change waiting to be confirmed on a later run")
    for rid, rv in revisions.items():
        if rv.get("state") == "unclassified":
            r.warn(f"revision/{rid}", "a detected change is waiting for an editor to classify it")
    for sid, s in sources.items():
        if s["verification"]["level"] == "verification-incomplete":
            pass  # expected state, reported by the integrity overview, not a warning
    return r


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(L.DATA))
    ap.add_argument("--root", default=str(L.ROOT))
    ap.add_argument("--today", default=None)
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args(argv)
    try:
        rep = validate(args.data, args.root, args.today)
    except (L.LedgerError, OSError, KeyError, ValueError) as exc:
        print(f"validate_research_ledger: could not read the data ({exc})", file=sys.stderr)
        return 2
    for e in rep.errors:
        print("ERROR  ", e)
    if not args.quiet:
        for w in rep.warnings:
            print("warning", w)
    print(f"{len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
    return 1 if rep.errors or (args.strict and rep.warnings) else 0


if __name__ == "__main__":
    sys.exit(main())
