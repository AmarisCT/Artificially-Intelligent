#!/usr/bin/env python3
"""Audio production queue and revision detection (workflow steps 1-2 for future articles).

    python3 scripts/listening-room/lr_queue.py [REPO_ROOT]

Reads only public files:
  research/published/manifest.json           which essays exist
  research/published/<slug>/index.html       their approved text
  listening-room/data/audio-library.json     which recordings exist, and which article text they were made from

Writes listening-room/data/audio-queue.json, one record per published article:
  status   not-recorded | in-production | awaiting-review | published | revision-required
  eligible true when the article page exists and no recording exists yet
  flags    why an existing recording needs review (article text changed)

Rules this script enforces:
  * A new article is only ever "not-recorded". It never becomes playable by itself.
  * A recording is never created, changed, approved or published here.
  * If the narrated text of an article changes after a recording was made, the status becomes
    "revision-required". The recording is left exactly as it is for a person to review.
  * If only the Sources list changes, the narration is unaffected; the record notes it.
  * No dates are invented: "detectedOn" is the date this script first saw the difference, carried
    forward on later runs.

The script is idempotent. Running it twice in a row changes nothing, so the 6-hour workflow does not
create commits unless something real changed.
"""
from __future__ import annotations

import datetime as dt
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import lr_common as C  # noqa: E402


def main(root: pathlib.Path | None = None):
    if root:
        C.ROOT = root
        C.LR_DIR = root / "listening-room"
        C.DATA_DIR = C.LR_DIR / "data"
    lib = C.load_json(C.DATA_DIR / "audio-library.json", {"items": []})
    old_q = C.load_json(C.DATA_DIR / "audio-queue.json", {"items": []})
    prev = {i["slug"]: i for i in old_q.get("items", [])}
    by_slug = {r["source"]["slug"]: r for r in lib.get("items", [])}
    today = dt.date.today().isoformat()
    items = []
    for art in sorted(C.manifest().get("articles", []), key=lambda a: a.get("publishedAt", ""), reverse=True):
        slug = C.article_slug(art)
        page = C.read_article_page(slug)
        rec = by_slug.get(slug)
        flags, status, notes = [], "not-recorded", []
        if rec:
            status = rec["status"]
            vh = rec["versions"]["article"]
            if page and page["bodyHash"] != vh["bodyHash"]:
                status = "revision-required"
                flags.append("narrated-text-changed")
                notes.append("The article's text differs from the text this recording was made from. The recording is unchanged and needs review.")
            elif page and page["sourcesHash"] != vh.get("sourcesHash"):
                flags.append("sources-changed")
                notes.append("Only the Sources list changed. The narration is unaffected; the transcript's source list should be refreshed.")
            elif not page:
                flags.append("article-page-missing")
                notes.append("The article page could not be read, so the recording could not be compared with it.")
        item = {
            "articleId": art.get("id"),
            "slug": slug,
            "title": art.get("title"),
            "url": art.get("url"),
            "publishedAt": art.get("publishedAt"),
            "readingMinutes": art.get("readingMinutes"),
            "pageAvailable": bool(page),
            "bodyHash": page["bodyHash"] if page else None,
            "sourcesHash": page["sourcesHash"] if page else None,
            "recordingId": rec["id"] if rec else None,
            "status": status,
            "eligible": bool(page) and not rec,
            "flags": flags,
            "notes": notes,
        }
        if flags and any(f in flags for f in ("narrated-text-changed", "sources-changed")):
            p = prev.get(slug, {})
            item["detectedOn"] = p.get("detectedOn") if set(p.get("flags", [])) & set(flags) else today
        items.append(item)
    out = {
        "meta": {
            "schemaVersion": 1,
            "purpose": "Which published articles have audio, which are waiting for it, and which recordings need review because the article changed.",
            "rules": [
                "A new article is never playable until a real, reviewed audio file is published.",
                "Nothing here creates or approves a recording.",
                "A change to the narrated text sets Revision Required and leaves the recording untouched.",
            ],
        },
        "items": items,
    }
    C.dump_json(C.DATA_DIR / "audio-queue.json", out)
    return out


if __name__ == "__main__":
    root = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    q = main(root)
    for i in q["items"]:
        print(f"{i['slug'][:60]:60s} {i['status']:18s} eligible={i['eligible']} {','.join(i['flags'])}")
