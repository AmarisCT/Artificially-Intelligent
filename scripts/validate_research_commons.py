#!/usr/bin/env python3
"""Validate the Research Commons' public data. Exit status 1 if anything is wrong.

The public files may only ever contain approved material. This script refuses:
  * a record with any field outside the documented public set, or with a field that names private moderation data;
  * an email address, link or credential-like string in approved text; a displayed name without recorded authorisation;
  * a status that is not a public status, a related record that does not exist, a collection that is not defined;
  * a demonstration record, or `preview: true`, in committed data;
  * unapproved guideline wording (from the owner-only drafts file) appearing anywhere in public data;
  * a status file or collection whose numbers do not match the records.

Usage: validate_research_commons.py [--data research-commons/data] [--today YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import commons_lib as L  # noqa: E402

SECRET_RE = re.compile(r"(?:api[_-]?key|secret|password|bearer\s+[a-z0-9]|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|-----BEGIN)", re.I)
IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


def validate(data=L.DATA, root=L.ROOT, today=None, drafts_path=None) -> L.Report:
    r = L.Report()
    data, root = pathlib.Path(data), pathlib.Path(root)
    today = today or L.today_utc()
    cfg_path = root / "research-commons" / "config.json" if data == L.DATA else data.parent / "config.json"
    docs = {}
    for name in ("taxonomy", "public-contributions", "collections", "contribution-relations", "commons-status"):
        doc = L.read_json(data / f"{name}.json")
        if doc is None:
            r.err(name, "file is missing or empty")
            continue
        if doc.get("schema") != 1:
            r.err(name, "schema must be 1")
        docs[name] = doc
    cfg = L.read_json(cfg_path)
    if cfg is None:
        r.err("config", "config.json is missing")
        cfg = {}
    if r.errors:
        return r
    tax = docs["taxonomy"]

    # ---- config
    if cfg.get("preview") is not False:
        r.err("config", "preview must be false in committed data")
    for k in ("contributionEndpoint", "statusEndpoint", "syncEndpoint"):
        v = cfg.get(k)
        if v is not None and not (isinstance(v, str) and v.startswith("https://")):
            r.err("config", f"{k} must be null or an https URL")
    if not isinstance(cfg.get("guidelinesApproved"), bool):
        r.err("config", "guidelinesApproved must be true or false")
    gpath = data / "guidelines.json"
    if cfg.get("guidelinesApproved") is True:
        g = L.read_json(gpath)
        if not isinstance(g, dict):
            r.err("config", "guidelinesApproved is true but data/guidelines.json is missing")
        else:
            if g.get("schema") != 1 or not isinstance(g.get("version"), str) or not L.DATE_RE.match(str(g.get("approvedOn", ""))) or g.get("approvedBy") != "Owner":
                r.err("guidelines", "must have schema 1, a version, an approvedOn date and approvedBy \"Owner\"")
            secs = g.get("sections")
            need = {"welcome", "evaluation", "moderation", "after", "editing", "attribution", "declined", "sources", "privacy", "withdrawal"}
            if not isinstance(secs, list) or need - {x.get("id") for x in secs if isinstance(x, dict)}:
                r.err("guidelines", "must contain every section: " + ", ".join(sorted(need)))
            elif any(not x.get("title") or not x.get("body") for x in secs):
                r.err("guidelines", "every section needs a title and body text")
            if not (isinstance(g.get("consent"), dict) and isinstance(g["consent"].get("common"), str) and g["consent"]["common"].strip()):
                r.err("guidelines", "consent.common must be the approved consent statement")
            if not g.get("stored") or not g.get("rights"):
                r.err("guidelines", "stored and rights statements are required")
            if g.get("draft"):
                r.err("guidelines", "an approved file must not be marked draft")
            for k in L.walk_keys({kk: vv for kk, vv in g.items() if kk != "consent"}):   # "consent" is the statement itself here
                if k[1].lower() in L.PRIVATE_KEYS:
                    r.err("guidelines", f"key {k[0]!r} must not be public")
    elif gpath.exists():
        r.err("config", "data/guidelines.json exists but guidelinesApproved is false: unapproved wording must not be in public data")
    fb = cfg.get("questionEndpointFallback")
    if fb is not None and not (isinstance(fb, str) and re.fullmatch(r"\.\./[a-z0-9-]+/config\.json", fb)):
        r.err("config", "questionEndpointFallback must be a sibling feature's config.json, e.g. ../unanswered-archive/config.json")
    ids = L.index_ids(root)
    fi = cfg.get("featuredInquiry") or {}
    if fi.get("kind") == "editorial-question":
        if ids.get(fi.get("id")) != "question":
            r.err("config", f"featuredInquiry.id {fi.get('id')!r} is not an Unanswered Archive question in the shared index")
    elif fi:
        r.err("config", "featuredInquiry.kind must be editorial-question")
    for k in L.walk_keys(cfg):
        if k[1].lower() in L.PRIVATE_KEYS:
            r.err("config", f"key {k[0]!r} must not be public")

    # ---- taxonomy (small sanity checks; the page depends on these ids)
    for key in ("types", "categories", "lifecycle", "publicStatuses", "attributionModes", "relationKinds", "sourceVerification"):
        seen = [x["id"] for x in tax.get(key, [])]
        if not seen or len(seen) != len(set(seen)):
            r.err("taxonomy", f"{key} must be a non-empty list with unique ids")
    ua = L.read_json(root / "unanswered-archive" / "data" / "meta.json")
    if ua:
        shared = {c["id"] for c in ua["categories"]}
        missing = shared - {c["id"] for c in tax["categories"]}
        if missing:
            r.err("taxonomy", f"categories missing from the Unanswered Archive's set: {sorted(missing)}")

    # ---- collections
    colls = docs["collections"]["collections"]
    cids = [c["id"] for c in colls]
    if len(cids) != len(set(cids)):
        r.err("collections", "duplicate collection ids")
    for c in colls:
        if c.get("status") not in ("planned", "active"):
            r.err(f"collection {c.get('id')}", "status must be planned or active")

    # ---- contributions
    items = docs["public-contributions"]["contributions"]
    all_ids = [c.get("id") for c in items if isinstance(c, dict)]
    if len(all_ids) != len(set(all_ids)):
        r.err("public-contributions", "duplicate contribution ids")
    for c in items:
        L.check_contribution(c, tax, ids, set(cids), {x["id"]: x.get("type") for x in items if isinstance(x, dict) and x.get("id")}, today, r, "contribution")
    members: dict[str, int] = {}
    for c in items:
        if isinstance(c, dict) and c.get("status") != "withdrawn":
            for col in c.get("collections") or []:
                members[col] = members.get(col, 0) + 1
    for c in colls:
        if c.get("status") == "planned" and members.get(c["id"]):
            r.err(f"collection {c['id']}", "has approved members but is still marked planned")
        if c.get("status") == "active" and not members.get(c["id"]):
            r.err(f"collection {c['id']}", "is marked active but has no approved contributions")

    # ---- relations
    kinds = {k["id"] for k in tax["relationKinds"]}
    for rel in docs["contribution-relations"]["relations"]:
        w = f"relation {rel.get('a')}→{rel.get('b')}"
        for end in ("a", "b"):
            v = str(rel.get(end, ""))
            ok = (v.startswith("contrib:") and v[8:] in all_ids) or v in ids
            if not ok:
                r.err(w, f"{end} {v!r} does not exist")
        if not any(str(rel.get(e, "")).startswith("contrib:") for e in ("a", "b")):
            r.err(w, "a Commons relation must involve a contribution")
        if rel.get("kind") not in kinds:
            r.err(w, "unknown relation kind")
        if not (isinstance(rel.get("why"), str) and rel["why"].strip()):
            r.err(w, "every relation says why")
        if rel.get("kind") == "editorial" and not L.valid_date(rel.get("reviewedOn")):
            r.err(w, "an editorial relation needs reviewedOn")
        if rel.get("kind") in ("suggested", "preliminary") and rel.get("reviewedOn"):
            r.err(w, "a relation that nobody reviewed cannot carry reviewedOn")

    # ---- status file must describe the records, nothing else
    st = docs["commons-status"]
    approved = [c for c in items if isinstance(c, dict) and c.get("status") != "withdrawn"]
    by_type = {t["id"]: sum(1 for c in approved if c.get("type") == t["id"]) for t in tax["types"]}
    want = {"approved": len(approved), "byType": by_type, "withdrawn": len(items) - len(approved),
            "collectionsWithMembers": sum(1 for v in members.values() if v)}
    if st.get("counts") != want:
        r.err("commons-status", f"counts {st.get('counts')} do not match the records {want}")
    sub = st.get("submissions", {})
    if sub.get("contributionsOpen") is True and not cfg.get("contributionEndpoint"):
        r.err("commons-status", "claims contributions are open but no contributionEndpoint is configured")
    if sub.get("questionsOpen") is True and not (cfg.get("contributionEndpoint") or cfg.get("questionEndpointFallback")):
        r.err("commons-status", "claims questions are open but no endpoint is configured")

    # ---- public files must not carry credentials, addresses or unapproved wording
    for name in ("public-contributions", "collections", "contribution-relations", "commons-status", "taxonomy"):
        blob = (data / f"{name}.json").read_text(encoding="utf-8")
        if SECRET_RE.search(blob):
            r.err(name, "contains a credential-like string")
        if name in ("public-contributions", "contribution-relations") and IPV4_RE.search(blob):
            r.err(name, "contains an IP address")
    draft_file = pathlib.Path(drafts_path) if drafts_path else root / "scripts" / "research-commons-src" / "guidelines-draft.json"
    drafts = L.read_json(draft_file)
    if drafts:
        pub = "".join((data / f"{n}.json").read_text(encoding="utf-8") for n in ("public-contributions", "collections", "contribution-relations", "commons-status")) + \
              (cfg_path.read_text(encoding="utf-8") if cfg_path.exists() else "")
        for sid, sec in (drafts.get("sections") or {}).items():
            for chunk in ([sec.get("draft", "")] + list(sec.get("points", []))):
                if isinstance(chunk, str) and len(chunk) > 25 and chunk in pub:
                    r.err("guidelines", f"unapproved draft wording for {sid} appears in public data")
        extra = list((drafts.get("consent") or {}).values()) + list(drafts.get("stored") or []) + list(drafts.get("rights") or [])
        for chunk in extra:
            if isinstance(chunk, str) and len(chunk) > 25 and chunk in pub:
                r.err("guidelines", "unapproved consent, storage or rights wording appears in public data")
    return r


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(L.DATA))
    ap.add_argument("--today", default=None)
    a = ap.parse_args(argv)
    rep = validate(pathlib.Path(a.data), L.ROOT, a.today)
    for w in rep.warnings:
        print("warning:", w)
    for e in rep.errors:
        print("ERROR:", e)
    print(f"{len(rep.errors)} error(s), {len(rep.warnings)} warning(s)")
    return 1 if rep.errors else 0


if __name__ == "__main__":
    sys.exit(main())
