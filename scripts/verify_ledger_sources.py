#!/usr/bin/env python3
"""Check the bibliographic metadata of Ledger sources against Crossref, DataCite and arXiv. Proposes by default; writes only with --apply.

What it can honestly establish: that a record with the printed DOI (or arXiv id) exists, and that its title and year match the
citation as the essay prints it. That is "Metadata Confirmed" and nothing higher. It does not read the work, so it can never raise a
source to Abstract Reviewed, Source Content Inspected or any later step, and it says nothing about whether an essay uses the source
correctly. A mismatch is never turned into a verification: it becomes an open observation for a person to look at. Retraction status
is not checked (Crossref's retraction data is incomplete), so every source stays "not checked" for retraction.

Safe to re-run: a source that already has an automated Metadata Confirmed entry for the same identifier is skipped. A failed request
changes nothing. Existing, higher verification levels are never lowered or rewritten.

Usage: verify_ledger_sources.py [--apply] [--data research-ledger/data] [--only SRC-001,SRC-004] [--today 2026-10-18]
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ledger_lib as L  # noqa: E402

UA = "ArtificiallyIntelligent-ResearchLedger/1.0 (+https://amarisct.github.io/Artificially-Intelligent/research-ledger/)"
TOOL = "scripts/verify_ledger_sources.py"
PERFORMED_BY = f"Automated metadata check ({TOOL}). No human editor has re-checked this."


class Unavailable(Exception):
    """The metadata service could not be reached or did not answer usefully. Nothing is recorded."""


def http_get(url: str, timeout: int = 25) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, application/atom+xml;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise Unavailable(str(exc)) from exc


def norm_title(t: str) -> str:
    t = re.sub(r"<[^>]+>", " ", t or "")
    t = re.sub(r"[^\w\s]", " ", t.lower())
    return re.sub(r"\s+", " ", t).strip()


def titles_match(printed: str, record: str) -> bool:
    a, b = norm_title(printed), norm_title(record)
    if not a or not b:
        return False
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    # One title inside the other counts only when it is most of it (a dropped subtitle). A short title that merely appears
    # inside a longer, different one ("The Extended Mind" in "The Extended Mind and Its Critics") is a different work.
    if short in long_ and len(short) >= 12 and len(short) / len(long_) >= 0.7:
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.9


def _year_from_parts(msg: dict) -> int | None:
    for key in ("issued", "published-print", "published-online", "published"):
        parts = (msg.get(key) or {}).get("date-parts") or []
        if parts and parts[0] and parts[0][0]:
            return int(parts[0][0])
    return None


def fetch_doi(doi: str, get=http_get) -> dict | None:
    """Return {'service','title','year','container'} or None if no service holds the DOI."""
    enc = urllib.parse.quote(doi, safe="/")
    code, body = get(f"https://api.crossref.org/works/{enc}")
    if code == 200:
        msg = json.loads(body).get("message", {})
        return {"service": "Crossref", "title": (msg.get("title") or [""])[0], "year": _year_from_parts(msg),
                "container": (msg.get("container-title") or [""])[0]}
    if code not in (404,):
        raise Unavailable(f"Crossref answered {code}")
    code, body = get(f"https://api.datacite.org/dois/{enc}")
    if code == 200:
        attrs = json.loads(body).get("data", {}).get("attributes", {})
        t = (attrs.get("titles") or [{}])[0].get("title", "")
        return {"service": "DataCite", "title": t, "year": attrs.get("publicationYear"), "container": ((attrs.get("container") or {}).get("title") or "")}
    if code == 404:
        return None
    raise Unavailable(f"DataCite answered {code}")


def fetch_arxiv(arxiv_id: str, get=http_get) -> dict | None:
    code, body = get(f"https://export.arxiv.org/api/query?id_list={urllib.parse.quote(arxiv_id)}")
    if code != 200:
        raise Unavailable(f"arXiv answered {code}")
    ns = {"a": "http://www.w3.org/2005/Atom"}
    try:
        entry = ET.fromstring(body).find("a:entry", ns)
    except ET.ParseError as exc:
        raise Unavailable(f"arXiv answer was not readable ({exc})") from exc
    if entry is None or entry.findtext("a:id", default="", namespaces=ns).endswith("api/errors"):
        return None
    pub = entry.findtext("a:published", default="", namespaces=ns)
    return {"service": "arXiv", "title": " ".join((entry.findtext("a:title", default="", namespaces=ns)).split()),
            "year": int(pub[:4]) if pub[:4].isdigit() else None, "container": "arXiv preprint"}


def judge(src: dict, rec: dict | None, ident: str) -> dict:
    """Decide what the retrieved record can honestly support. Returns {'verdict', 'text', ...}."""
    cit = src["citation"]
    if rec is None:
        return {"verdict": "not-found", "text": f"No record was found for {ident} at the metadata services. The identifier may be mistyped, or the work may be registered elsewhere."}
    title_ok = titles_match(cit.get("title") or "", rec["title"]) if cit.get("title") else False
    year_ok = (not cit.get("year")) or (rec["year"] is not None and abs(int(cit["year"]) - int(rec["year"])) <= 1)
    year_exact = bool(cit.get("year")) and rec["year"] is not None and int(cit["year"]) == int(rec["year"])
    if title_ok and year_ok:
        yr = "" if not cit.get("year") else (f" and its year ({rec['year']}) matches" if year_exact else
                                            f" and its year ({rec['year']}) is within one year of the printed {cit['year']}, which is normal for online and print dates")
        return {"verdict": "match", "record": rec,
                "text": (f"A {rec['service']} record for {ident} was retrieved. Its title matches the printed citation{yr}. "
                         "This shows that the work exists as cited. It says nothing about what the work contains or whether the essay uses it correctly.")}
    why = []
    if not title_ok:
        why.append(f"the record's title is “{rec['title']}” but the citation prints “{cit.get('title') or '(no separable title)'}”")
    if not year_ok:
        why.append(f"the record's year is {rec['year']} but the citation prints {cit.get('year')}")
    return {"verdict": "mismatch", "record": rec, "text": f"{rec['service']} holds a record for {ident}, but " + " and ".join(why) + ". A person should check which is right."}


def already_checked(src: dict, ident: str) -> bool:
    return any(h["level"] == "metadata-confirmed" and (h.get("origin") or {}).get("id") == ident and TOOL in (h.get("performedBy") or "")
               for h in src["verification"]["history"])


def already_flagged(src: dict, text: str) -> bool:
    return any(o["text"] == text for o in src.get("observations", []))


def run(data: pathlib.Path, today: str, apply: bool, only: set[str] | None = None, doi_fetch=fetch_doi, arxiv_fetch=fetch_arxiv) -> dict:
    data = pathlib.Path(data)
    levels = {x["id"]: x["rank"] for x in L.read_json(data / "taxonomy.json")["verificationLevels"]}
    out = {"confirmed": [], "flagged": [], "skipped": [], "unavailable": [], "nothing-to-check": []}
    for f in sorted((data / "sources").glob("*.json")):
        src = L.read_json(f)
        sid = src["id"]
        if only and sid not in only:
            continue
        cit = src["citation"]
        ident, fetch = (f"DOI {cit['doi']}", lambda: doi_fetch(cit["doi"])) if cit.get("doi") else \
                       ((f"arXiv {cit['arxiv']}", lambda: arxiv_fetch(cit["arxiv"])) if cit.get("arxiv") else (None, None))
        if not ident:
            out["nothing-to-check"].append(sid)
            continue
        key = ident.split(" ", 1)[1]
        if already_checked(src, key):
            out["skipped"].append(sid)
            continue
        try:
            res = judge(src, fetch(), ident)
        except Unavailable as exc:
            out["unavailable"].append({"id": sid, "why": str(exc)})
            continue
        if res["verdict"] == "match":
            src["verification"]["history"].append({
                "level": "metadata-confirmed", "recordedOn": today, "inspectedOn": today, "basis": res["text"],
                "extent": f"Bibliographic record only ({res['record']['service']})", "origin": {"kind": res["record"]["service"].lower(), "id": key},
                "performedBy": PERFORMED_BY})
            if levels["metadata-confirmed"] > levels[src["verification"]["level"]]:
                src["verification"]["level"] = "metadata-confirmed"
            out["confirmed"].append(sid)
        else:
            if not already_flagged(src, res["text"]):
                src.setdefault("observations", []).append({"status": "open", "raisedOn": today, "text": res["text"]})
            out["flagged"].append({"id": sid, "why": res["text"]})
        if apply:
            L.write_json(f, src)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(L.DATA))
    ap.add_argument("--apply", action="store_true", help="write the results (default: only report what would be written)")
    ap.add_argument("--only", default="", help="comma-separated source ids")
    ap.add_argument("--today", default=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"))
    args = ap.parse_args(argv)
    res = run(pathlib.Path(args.data), args.today, args.apply, set(filter(None, args.only.split(","))) or None)
    verb = "recorded" if args.apply else "would record"
    print(f"{verb} Metadata Confirmed for {len(res['confirmed'])}; flagged {len(res['flagged'])} for a person to check; "
          f"skipped {len(res['skipped'])} already checked; {len(res['nothing-to-check'])} have no DOI or arXiv id; {len(res['unavailable'])} could not be reached")
    for x in res["flagged"]:
        print("  check:", x["id"], x["why"])
    for x in res["unavailable"]:
        print("  unreachable:", x["id"], x["why"])
    if res["unavailable"] and not res["confirmed"] and not res["flagged"]:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
