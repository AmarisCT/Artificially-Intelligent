#!/usr/bin/env python3
"""Private preview builder for the Research Commons. It is NOT part of the live site and nothing it makes is published.

It builds a preview bundle from the real Commons data plus three things that exist only in the preview:

  * fictional demonstration contributions (ids DEMO-0001 ..., every record marked `demo`), switched on or off by the viewer. They show how the
    library, a detail page, the Correspondence Collection and the Question Constellation behave with records in them. They are never committed
    and are excluded from every count;
  * a simulated submission service ("accepts", "rate-limits", "is down" ...) so the forms can be tried end to end. It sends and stores nothing;
  * the owner's DRAFT wording for the guidelines, consent, storage and rights statements, read from the gitignored
    scripts/research-commons-src/guidelines-draft.json. It is unapproved and is labelled as such wherever it appears.

Usage: build_commons_preview.py [--artifact out.html] [--bundle out.json]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import commons_demo as D  # noqa: E402
import commons_lib as L  # noqa: E402

DRAFTS = L.ROOT / "scripts" / "research-commons-src" / "guidelines-draft.json"


def draft_guidelines():
    d = L.read_json(DRAFTS)
    if not d:
        return None
    secs = [{"id": sid, "title": s["title"], "body": [s["draft"]], "points": s.get("points", [])} for sid, s in d["sections"].items()]
    return {"draft": True, "version": d.get("version", "draft"), "sections": secs, "consent": d.get("consent", {}), "stored": d.get("stored", []), "rights": d.get("rights", [])}


def build_bundle() -> dict:
    cfg = L.read_json(L.COMMONS / "config.json")
    cfg = dict(cfg, preview=True)
    recs, rels = D.demo()
    return {
        "config": cfg,
        "taxonomy": L.read_json(L.DATA / "taxonomy.json"),
        "collections": L.read_json(L.DATA / "collections.json"),
        "contributions": L.read_json(L.DATA / "public-contributions.json")["contributions"],
        "relations": L.read_json(L.DATA / "contribution-relations.json")["relations"],
        "status": L.read_json(L.DATA / "commons-status.json"),
        "index": L.read_json(L.INDEX),
        "archiveConfig": L.read_json(L.ROOT / "unanswered-archive" / "config.json", {}),
        "lexicon": L.read_json(L.ROOT / "lexicon" / "data" / "concepts.json", {"items": []}),
        "guidelines": draft_guidelines(),
        "demo": {"records": recs, "relations": rels},
        "preview": {"simulate": True, "outcome": "accept"},
    }


def _js(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def artifact_html(bundle: dict) -> str:
    css = (L.COMMONS / "styles.css").read_text(encoding="utf-8")
    cons = (L.COMMONS / "constellation.js").read_text(encoding="utf-8")
    app = (L.COMMONS / "app.js").read_text(encoding="utf-8")
    site = L.SITE
    return f"""<title>Research Commons Preview</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&display=swap">
<style>{css}
body{{min-height:100vh}}</style>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr"><div class="wrap"><a class="brand" id="brand" href="{site}" aria-label="Artificially Intelligent, main site">Artificially <i>Intelligent</i></a><nav class="nav" id="nav" aria-label="The Research Commons"></nav></div></header>
<main id="main" tabindex="-1"><div class="wrap"><p class="note">Loading the Commons…</p></div></main>
<p id="live" class="sr" role="status" aria-live="polite"></p>
<footer class="ftr"><div class="wrap"><p>The Research Commons · Artificially Intelligent · Human × Machine Learning. A contribution shown here is a visitor's, reviewed by an editor for display. It is not original research from Artificially Intelligent, it is not peer reviewed, and it is not evidence. Showing a question does not mean it has been answered.</p></div></footer>
<script>window.COMMONS_ROOT={_js(site)};window.COMMONS_PREVIEW=true;window.__COMMONS={_js(bundle)};</script>
<script>{cons}</script>
<script>{app}</script>
"""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--artifact", help="write one self-contained HTML page for a private preview")
    ap.add_argument("--bundle", help="write the preview bundle as JSON")
    args = ap.parse_args(argv)
    bundle = build_bundle()
    print(f"preview bundle: {len(bundle['demo']['records'])} fictional demonstration records, {len(bundle['demo']['relations'])} relations, "
          f"owner drafts {'present' if bundle['guidelines'] else 'MISSING'}, real approved contributions {len(bundle['contributions'])}")
    if args.bundle:
        pathlib.Path(args.bundle).write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
    if args.artifact:
        pathlib.Path(args.artifact).write_text(artifact_html(bundle), encoding="utf-8")
        print("wrote", args.artifact)
    return 0


if __name__ == "__main__":
    sys.exit(main())
