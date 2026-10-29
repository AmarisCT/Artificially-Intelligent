#!/usr/bin/env python3
"""Build the Research Commons' derived files from its public data.

  * research-commons/data/commons-status.json  counts and whether submissions are open, derived only from the records and config;
  * research-commons/c/<COM-ID>/index.html     one crawlable static page per APPROVED contribution (none exist yet);

It never reads private data, never touches the Unanswered Archive, and never edits the sitemap or navigation (a sitemap change needs the
owner's approval; `--list-urls` prints what it would add). A page for a contribution that is withdrawn or no longer public is REMOVED, because
withdrawal must take the text off the site. Everything is deterministic: running it twice changes nothing.

Usage: build_research_commons.py [--check] [--list-urls] [--no-pages]
  --check   write nothing; exit 1 if a derived file is out of date
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import pathlib
import re
import shutil
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import commons_lib as L  # noqa: E402
import validate_research_commons as V  # noqa: E402

PAGE_DIR = "c"


def inquiry_hash(question: str) -> str:
    """The Inquiry Engine reads `#q-<base64url of the UTF-8 question, no padding>` (inquiry-engine/app.js: enc/dec)."""
    return "q-" + base64.urlsafe_b64encode(question.encode("utf-8")).decode("ascii").rstrip("=")


def question_endpoint_set(root: pathlib.Path, cfg: dict) -> bool:
    if cfg.get("contributionEndpoint"):
        return True
    fb = cfg.get("questionEndpointFallback")
    if not fb:
        return False
    other = L.read_json((root / "research-commons" / fb).resolve(), {}) if fb else {}
    ep = other.get("submitEndpoint")
    return isinstance(ep, str) and ep.startswith("https://")


def build_status(root: pathlib.Path, data: pathlib.Path, cfg: dict, prev: dict | None) -> dict:
    tax = L.read_json(data / "taxonomy.json")
    items = L.read_json(data / "public-contributions.json")["contributions"]
    colls = L.read_json(data / "collections.json")["collections"]
    approved = [c for c in items if c.get("status") != "withdrawn"]
    members = {c["id"]: 0 for c in colls}
    for c in approved:
        for col in c.get("collections") or []:
            members[col] = members.get(col, 0) + 1
    contributions_open = bool(cfg.get("contributionEndpoint"))
    questions_open = question_endpoint_set(root, cfg)
    if contributions_open:
        reason = "A submission service is configured."
    elif questions_open:
        reason = "Only research questions can be sent, through the Unanswered Archive's service. Other contribution types are not open."
    else:
        reason = "No receiving service exists yet, so nothing can be submitted or stored."
    st = {
        "schema": 1,
        "note": "Written by scripts/build_research_commons.py from the public data files and config. It reports what those contain, nothing else.",
        "dataAsOf": max((c["updatedOn"] for c in items), default=None),
        "counts": {"approved": len(approved), "byType": {t["id"]: sum(1 for c in approved if c["type"] == t["id"]) for t in tax["types"]},
                   "withdrawn": len(items) - len(approved), "collectionsWithMembers": sum(1 for v in members.values() if v)},
        "submissions": {"contributionsOpen": contributions_open, "questionsOpen": questions_open, "reason": reason},
        "lastSync": (prev or {}).get("lastSync"),
    }
    return st


def ld_json(obj) -> str:
    """JSON for a <script> block. '<', '>' and '&' are escaped so submitted text can never close the script element."""
    return (json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def paragraphs(text: str) -> str:
    return "".join(f"<p>{esc(p).replace(chr(10), '<br>')}</p>" for p in re.split(r"\n{2,}", (text or "").strip()) if p.strip())


def render_page(c: dict, tax: dict, colls: dict, index: dict, concept_names: dict) -> str:
    cid = c["id"]
    url = f"{L.SITE}research-commons/{PAGE_DIR}/{cid}/"
    tmap = {t["id"]: t for t in tax["types"]}
    cat = next((x["label"] for x in tax["categories"] if x["id"] == c.get("category")), None)
    status = next(s for s in tax["publicStatuses"] if s["id"] == c["status"])
    attr = c.get("attribution", {})
    by = "Submitted anonymously" if attr.get("mode") == "anonymous" else f"Shown under the name the contributor chose: {attr.get('display')}"
    desc = re.sub(r"\s+", " ", (c.get("text") or c["title"]))[:155].rstrip()
    rel = []
    for rid in c.get("related") or []:
        rec = index.get(rid)
        if rec:
            rel.append(f'<li><a href="{esc(rec["url"])}">{esc(rec["title"])}</a> <span class="note">· {esc(rec["type"])}</span></li>')
    concepts = "".join(f'<li>{esc(concept_names.get(x, x))}</li>' for x in c.get("concepts") or [])
    src = ""
    if c["type"] == "publication":
        s = c["source"]
        ver = next(v for v in tax["sourceVerification"] if v["id"] == s["verification"])
        link = f'https://doi.org/{s["doi"]}' if s.get("doi") else s.get("url")
        src = (f'<section><h2>The recommended publication</h2><p><strong>{esc(s["title"])}</strong>'
               f'{(" · " + esc(", ".join(s["authors"]) if isinstance(s.get("authors"), list) else s.get("authors"))) if s.get("authors") else ""}'
               f'{(" · " + esc(s["year"])) if s.get("year") else ""}</p><p class="note">{esc(ver["label"])}. {esc(ver["meaning"])}</p>'
               f'{(f"<p><a href=\"{esc(link)}\" rel=\"noopener noreferrer\">Open the source ↗</a></p>") if link else ""}</section>')
    inq = ""
    if c["type"] == "question":
        inq = f'<p><a class="btn" href="../../../inquiry-engine/#{inquiry_hash(c["title"])}">Investigate This Question →</a></p>'
    ld = {"@context": "https://schema.org", "@type": "WebPage", "name": c["title"], "url": url, "inLanguage": "en", "description": desc,
          "isPartOf": {"@type": "WebSite", "name": "Artificially Intelligent", "url": L.SITE}, "datePublished": c["publishedOn"], "dateModified": c["updatedOn"]}
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><link rel="icon" href="../../../favicon.ico" sizes="32x32"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="../../../apple-touch-icon.png"><link rel="manifest" href="../../../site.webmanifest"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="index,follow">
<title>{esc(c["title"])} · Research Commons · Artificially Intelligent</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(url)}">
<meta property="og:type" content="website"><meta property="og:title" content="{esc(c["title"])}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{esc(url)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300&display=swap">
<link rel="stylesheet" href="../../styles.css">
<script type="application/ld+json">{ld_json(ld)}</script></head>
<body class="static">
<a class="skip" href="#main">Skip to content</a>
<header class="top"><a class="brand" href="../../../">Artificially <i>Intelligent</i></a><nav class="site" aria-label="Research Commons"><a href="../../">The Research Commons</a><a href="../../#library">Library</a></nav></header>
<main id="main" tabindex="-1"><article class="wrap narrow">
<p class="kicker">{esc(tmap[c["type"]]["label"])}{(" · " + esc(cat)) if cat else ""} · {esc(c["id"])}</p>
<h1>{esc(c["title"])}</h1>
<p class="voice" role="note"><strong>{esc(tax["voices"]["visitor"].split(". ", 1)[0])}.</strong> {esc(tax["voices"]["visitor"].split(". ", 1)[1])}</p>
<p class="note">{esc(by)} · Approved for display {esc(c["publishedOn"])}{(" · updated " + esc(c["updatedOn"])) if c["updatedOn"] != c["publishedOn"] else ""}</p>
<p><span class="badge">{esc(status["label"])}</span> <span class="note">{esc(status["meaning"])}</span></p>
{('<section><h2>' + {"question": "Why it was asked", "publication": "Why it was recommended", "topic": "The proposal", "perspective": "The perspective"}[c["type"]] + '</h2>' + paragraphs(c["text"]) + '</section>') if c.get("text") else ""}
{src}
{('<section class="editorial"><h2>Editorial context</h2><p class="note">By ' + esc(c["editorialContextBy"]) + '. Editorial text, separate from the contribution.</p>' + paragraphs(c["editorialContext"]) + '</section>') if c.get("editorialContext") else ""}
{('<section><h2>Related concepts</h2><ul class="plain">' + concepts + '</ul></section>') if concepts else ""}
{('<section><h2>Related research</h2><ul class="plain">' + "".join(rel) + '</ul></section>') if rel else ""}
{('<section><h2>Open questions</h2><ul>' + "".join(f"<li>{esc(q)}</li>" for q in c["openQuestions"]) + '</ul></section>') if c.get("openQuestions") else ""}
{inq}
</article></main>
<footer>The Research Commons is a place for visitors to contribute questions and perspectives. A contribution shown here has been approved for display. It has not been peer reviewed, and displaying it does not mean Artificially Intelligent agrees with it or has answered it.</footer>
</body></html>
"""


def build(root=L.ROOT, check=False, pages=True):
    root = pathlib.Path(root)
    data = root / "research-commons" / "data"
    cfg = L.read_json(root / "research-commons" / "config.json", {})
    prev = L.read_json(data / "commons-status.json")
    status = build_status(root, data, cfg, prev)
    # Validate the data together with the status file it WILL have, so a stale status file is fixed by the build, not blocked by it.
    with tempfile.TemporaryDirectory(prefix="commons-build-") as tmp:
        stage = pathlib.Path(tmp) / "research-commons"
        shutil.copytree(data, stage / "data")
        shutil.copy(root / "research-commons" / "config.json", stage / "config.json")
        L.write_json(stage / "data" / "commons-status.json", status)
        rep = V.validate(stage / "data", root)
    if rep.errors:
        raise SystemExit("The public data is not valid; nothing was built:\n  " + "\n  ".join(rep.errors))
    out, stale = [], []
    if L.dumps(status) != L.dumps(prev):
        out.append(str(data / "commons-status.json"))
        if not check:
            L.write_json(data / "commons-status.json", status)
    tax = L.read_json(data / "taxonomy.json")
    colls = {c["id"]: c for c in L.read_json(data / "collections.json")["collections"]}
    ix = L.read_json(root / "inquiry-engine" / "data" / "research-index.json", {"resources": []})
    index = {r["id"]: r for r in ix["resources"]}
    cn = {k: v["title"] for k, v in index.items() if v["type"] == "concept"}
    cdir = root / "research-commons" / PAGE_DIR
    want = {}
    if pages:
        for c in L.read_json(data / "public-contributions.json")["contributions"]:
            if c["status"] != "withdrawn":
                want[c["id"]] = render_page(c, tax, colls, index, cn)
        for cid, text in want.items():
            f = cdir / cid / "index.html"
            if not f.exists() or f.read_text(encoding="utf-8") != text:
                out.append(str(f))
                if not check:
                    f.parent.mkdir(parents=True, exist_ok=True)
                    f.write_text(text, encoding="utf-8")
        if cdir.exists():
            for d in sorted(cdir.iterdir()):
                if d.is_dir() and re.fullmatch(r"COM-\d{4,}", d.name) and d.name not in want:
                    stale.append(str(d))
                    if not check:
                        shutil.rmtree(d)
            if not check and cdir.exists() and not any(cdir.iterdir()):
                cdir.rmdir()
    return {"changed": out, "removed": stale, "urls": [f"{L.SITE}research-commons/{PAGE_DIR}/{cid}/" for cid in sorted(want)]}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--list-urls", action="store_true")
    ap.add_argument("--no-pages", action="store_true")
    a = ap.parse_args(argv)
    res = build(L.ROOT, a.check, not a.no_pages)
    if a.list_urls:
        print("\n".join(res["urls"]) or "(no approved contributions, so no public contribution URLs)")
    if a.check:
        if res["changed"] or res["removed"]:
            print("out of date:", *res["changed"], *["would remove " + x for x in res["removed"]], sep="\n  ")
            return 1
        print("up to date")
        return 0
    print(f"{len(res['changed'])} file(s) written, {len(res['removed'])} stale page folder(s) removed, {len(res['urls'])} contribution page(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
