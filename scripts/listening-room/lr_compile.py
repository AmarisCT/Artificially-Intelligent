#!/usr/bin/env python3
"""Compile the public Listening Room data files (workflow steps 9-11).

    python3 scripts/listening-room/lr_compile.py [--work DIR]

Inputs
  scripts/listening-room/editorial.json     human decisions (categories, status, associations, proposed chapters)
  <work>/<ID>.narration.json                timings and measurements from lr_narrate.py
  <work>/<ID>.verification.json             results from lr_verify.py
  research/published/*                      the approved article text and manifest
  inquiry-engine/data/research-index.json   the shared index, used only to check that every id exists
  lexicon/data/concepts.json                used only to check that every Lexicon id exists

Outputs (listening-room/data/)
  audio-library.json     recordings and the vocabularies (statuses, categories, narration types, series)
  audio-transcripts.json transcript blocks with sentence timing
  audio-chapters.json    real structural chapters, plus proposed titles that are NOT shown until approved
  audio-relations.json   links to Atlas, Lexicon, Theory Chamber, Unanswered Archive, Museum, Learning Institute
  audio-queue.json       (via lr_queue.py)

The compiler refuses to run if an id does not resolve or if an annotated phrase is missing from its paragraph.
It does not copy any audio into the repository. Audio is added only when a recording is approved for release.
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import lr_common as C  # noqa: E402
import lr_queue  # noqa: E402

URL_RE = re.compile(r"https?://[^\s<>\"]+")
DOI_RE = re.compile(r"DOI:\s*(10\.\d{4,9}/[^\s]+?)\.?\s*$|DOI:\s*(10\.\d{4,9}/[^\s]+)")
ARXIV_RE = re.compile(r"arXiv:(\d{4}\.\d{4,5})")


def source_links(text: str) -> list[dict]:
    links = []
    for m in URL_RE.finditer(text):
        u = m.group(0).rstrip(".,;)")
        if u.startswith("https://"):
            links.append({"label": re.sub(r"^https://(www\.)?", "", u).split("/")[0], "url": u})
    m = re.search(r"DOI:\s*(10\.\d{4,9}/\S+)", text)
    if m:
        doi = m.group(1).rstrip(".")
        links.append({"label": "DOI " + doi, "url": "https://doi.org/" + doi})
    m = ARXIV_RE.search(text)
    if m:
        links.append({"label": "arXiv " + m.group(1), "url": "https://arxiv.org/abs/" + m.group(1)})
    seen, out = set(), []
    for l in links:
        if l["url"] not in seen:
            seen.add(l["url"])
            out.append(l)
    return out


def group_sources(sources: list[str]) -> list[dict]:
    """Group the Sources paragraphs. A paragraph starting '[n]' opens group n; following paragraphs without a
    number belong to the same group. When the article numbers nothing, every entry stands alone."""
    groups = []
    numbered = any(re.match(r"^\[\d+\]", s) for s in sources)
    for s in sources:
        m = re.match(r"^\[(\d+)\]\s*", s)
        if m:
            groups.append({"n": int(m.group(1)), "entries": []})
        elif not numbered or not groups:
            groups.append({"n": None, "entries": []})
        groups[-1]["entries"].append({"text": s, "links": source_links(s)})
    return groups


def block_json(b: dict) -> dict:
    text = b["text"]
    pos, sents = 0, []
    for s in b["sentences"]:
        i = text.index(s["text"], pos)
        sents.append([i, i + len(s["text"]), s["start"], s["end"]])
        pos = i + len(s["text"])
    return {"id": b["id"], "kind": b["kind"], "text": text, "cite": b["cite"], "start": b["start"], "end": b["end"], "sentences": sents}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default=str(C.ROOT.parent.parent / "build" / "lr" / "work"))
    ap.add_argument("--config", default=str(C.SRC_DIR / "editorial.json"))
    a = ap.parse_args()
    work = pathlib.Path(a.work)
    ed = C.load_json(a.config)
    mani = {C.article_slug(x): x for x in C.manifest()["articles"]}
    index = C.load_json(C.ROOT / "inquiry-engine" / "data" / "research-index.json")
    rid_ok = {r["id"] for r in index["resources"]}
    lex_ok = {i["id"] for i in C.load_json(C.ROOT / "lexicon" / "data" / "concepts.json")["items"]}
    today = dt.date.today().isoformat()
    cat_ids = {c["id"] for c in ed["categories"]}
    stat_ids = {s["id"] for s in ed["statuses"]}
    ntype = {n["id"]: n for n in ed["narrationTypes"]}
    ser_ids = {s["id"] for s in ed["series"]}

    lib_items, tr_items, ch_items, rel_items = [], [], [], []
    for r in ed["recordings"]:
        rid, slug = r["id"], r["slug"]
        assert r["category"] in cat_ids and r["status"] in stat_ids and r["narration"]["type"] in ntype, rid
        assert all(s in ser_ids for s in r.get("series", [])), rid
        nar = C.load_json(work / f"{rid}.narration.json")
        ver = C.load_json(work / f"{rid}.verification.json")
        assert nar and ver, f"run lr_narrate.py and lr_verify.py for {rid} first"
        art = C.read_article_page(slug)
        meta = mani[slug]
        assert art["bodyHash"] == nar["article"]["bodyHash"], f"{rid}: article changed since narration; re-run lr_narrate.py"
        au = nar["audio"]

        # ---- transcript ---------------------------------------------------------------------------------
        blocks = [block_json(b) for b in nar["blocks"]]
        by_id = {b["id"]: b for b in blocks}
        blocks.append({"id": "sources", "kind": "sources", "heading": "Sources", "start": None, "end": None,
                       "note": "Shown as published in the written article. Not read aloud in this recording.",
                       "groups": group_sources(art["sources"])})
        tr_items.append({"id": rid, "recordingId": rid, "language": "en", "version": r["audioVersion"],
                         "granularity": "sentence",
                         "timing": {"method": "Each sentence was voiced as its own clip and the clips were joined at known sample positions; start and end are those positions. Checked against the decoded MP3.",
                                    "precision": "Sentence level. No word-level timing exists or is claimed.",
                                    "worstOnsetMs": ver["timing"]["worstOnsetMs"], "globalOffsetMs": ver["timing"]["globalOffsetMs"]},
                         "spoken": "The transcript is what the recording says: a short recording note, the essay exactly as published, and a closing note. Citation markers such as [1] are shown but not spoken.",
                         "blocks": blocks})

        # ---- chapters ---------------------------------------------------------------------------------------
        body = [b for b in nar["blocks"] if b["kind"] == "body"]
        chapters = [
            {"id": "c-note", "title": "Recording note", "kind": "structure", "approved": True, "start": by_id["f-open"]["start"], "fromBlock": "f-open", "toBlock": "f-open"},
            {"id": "c-essay", "title": "The essay", "kind": "structure", "approved": True, "start": body[0]["start"], "fromBlock": body[0]["id"], "toBlock": body[-1]["id"]},
            {"id": "c-close", "title": "Closing note", "kind": "structure", "approved": True, "start": by_id["f-close"]["start"], "fromBlock": "f-close", "toBlock": "f-close"},
            {"id": "c-sources", "title": "Sources", "kind": "structure", "approved": True, "start": None, "fromBlock": "sources", "toBlock": "sources",
             "note": "Listed in the written article and shown in the transcript. Not read aloud."},
        ]
        proposed = []
        for k, c in enumerate(r["chapters"]["proposed"]):
            assert c["from"] in by_id and c["to"] in by_id, (rid, c)
            proposed.append({"id": f"pc{k+1:02d}", "title": c["title"], "kind": "editorial", "approved": False, "start": by_id[c["from"]]["start"],
                             "fromBlock": c["from"], "toBlock": c["to"]})
        ch_items.append({"recordingId": rid,
                         "basis": "The published essay has no section headings. These chapters follow its real structure: the essay body and its Sources list, plus the recording's own spoken notes.",
                         "chapters": chapters, "proposed": proposed,
                         "proposedStatus": "Draft titles written during the build. They are shown only in preview and only after the author approves them."})

        # ---- relations --------------------------------------------------------------------------------------
        def rids(prefix, ids):
            out = [f"{prefix}{i}" for i in ids]
            for o in out:
                assert o in rid_ok, f"{rid}: {o} is not in the research index"
            return out

        concepts = rids("concept:", r["concepts"])
        for l in r["lexicon"]:
            assert l in lex_ok, f"{rid}: unknown Lexicon id {l}"
        rel = r["relations"]
        resources = {"questions": rids("q:", rel["questions"]), "theories": rids("theory:", rel["theories"]),
                     "comparisons": rids("cmp:", rel["comparisons"]), "museum": rids("room:", rel["museum"]),
                     "lessons": rids("lesson:", rel["lessons"]), "articles": rids("art:", rel["articles"])}
        anns = []
        for an in r["annotations"]:
            blk = by_id[an["block"]]
            i = blk["text"].find(an["phrase"])
            assert i >= 0, f"{rid}: phrase not found in {an['block']}: {an['phrase']}"
            e = {"block": an["block"], "start": i, "end": i + len(an["phrase"]), "type": an["type"]}
            t = an["type"]
            if t == "lexicon":
                assert an["id"] in lex_ok
                e["id"] = an["id"]
            elif t == "atlas":
                assert f"concept:{an['id']}" in rid_ok
                e["id"] = f"concept:{an['id']}"
            elif t == "museum":
                assert f"room:{an['id']}" in rid_ok
                e["id"] = f"room:{an['id']}"
            elif t == "theory":
                assert f"theory:{an['id']}" in rid_ok
                e["id"] = f"theory:{an['id']}"
            elif t == "comparison":
                assert f"cmp:{an['id']}" in rid_ok
                e["id"] = f"cmp:{an['id']}"
            elif t == "question":
                assert f"q:{an['id']}" in rid_ok
                e["id"] = f"q:{an['id']}"
            elif t == "source":
                e["index"] = an["index"]
            anns.append(e)
        cites = []
        for b in body:
            for m in b["cite"]:
                n = int(re.sub(r"\D", "", m))
                cites.append({"block": b["id"], "n": n})
        smatch = [{"block": m["block"], "source": m["source"],
                   "basis": "Matched by year, venue and subject in the passage. The article does not mark this source inline."} for m in r.get("sourceMatches", [])]
        rel_items.append({"recordingId": rid, "concepts": concepts, "lexicon": r["lexicon"], "resources": resources,
                          "annotations": sorted(anns, key=lambda x: (x["block"], x["start"])), "citations": cites, "sourceMatches": smatch,
                          "status": "Associations drafted during the build; awaiting author review."})

        # ---- library record ------------------------------------------------------------------------------------
        lib_items.append({
            "id": rid, "label": r["label"], "slug": slug,
            "source": {"type": "article", "articleId": meta["id"], "slug": slug, "url": meta["url"], "path": f"research/published/{slug}/",
                       "publishedAt": meta["publishedAt"], "readingMinutes": meta.get("readingMinutes"), "topics": meta.get("topics", [])},
            "title": meta["title"], "description": meta["excerpt"],
            "category": r["category"], "series": r.get("series", []),
            "narration": {"type": r["narration"]["type"], "narrator": r["narration"]["narrator"], "credit": r["narration"]["credit"],
                          "disclosure": ntype[r["narration"]["type"]]["disclosure"], "engine": nar["engine"]["name"], "voice": nar["engine"]["voice"],
                          "network": False, "paid": False, "script": f"scripts/listening-room/narration-scripts/{rid}.script.json"},
            "status": r["status"],
            "review": {"editorial": "not-reviewed", "audio": "pending", "reviewer": None, "lastReviewed": None},
            "releaseDate": None, "producedAt": today,
            "audio": {"url": f"audio/{rid}.mp3", "format": au["format"], "codec": au["codec"], "bytes": au["bytes"], "bitrate": au["bitrate"],
                      "sampleRate": au["sampleRate"], "channels": au["channels"], "durationSec": au["durationSec"],
                      "loudnessLUFS": au["loudnessLUFS"], "truePeakDBTP": au["truePeakDBTP"], "sha256": au["sha256"]},
            "versions": {"audio": r["audioVersion"],
                         "article": {"bodyHash": art["bodyHash"], "sourcesHash": art["sourcesHash"], "publishedAt": meta["publishedAt"],
                                     "basis": "SHA-256 of the article's body paragraphs as published (narrated text) and of its Sources list."}},
            "transcript": {"id": rid, "granularity": "sentence"},
            "verification": {"checkedAt": ver["checkedAt"], "passed": ver["passed"], "total": ver["total"],
                             "checks": [{"name": c["name"], "pass": c["pass"]} for c in ver["checks"]], "notChecked": ver["notChecked"]},
            "waveform": nar["waveform"],
            "concepts": r["concepts"], "lexicon": r["lexicon"],
        })

    lib = {"meta": {"schemaVersion": 1,
                    "note": "A recording is publicly playable only when its status is 'published'. Statuses are records, not labels: they change only when a person changes them.",
                    "statuses": ed["statuses"], "categories": ed["categories"], "narrationTypes": ed["narrationTypes"], "series": ed["series"]},
           "items": lib_items}
    D = C.DATA_DIR
    C.dump_json(D / "audio-library.json", lib)
    C.dump_json(D / "audio-transcripts.json", {"meta": {"schemaVersion": 1}, "items": tr_items}, indent=None)
    C.dump_json(D / "audio-chapters.json", {"meta": {"schemaVersion": 1}, "items": ch_items})
    C.dump_json(D / "audio-relations.json", {"meta": {"schemaVersion": 1, "resolve": "ids resolve against inquiry-engine/data/research-index.json and lexicon/data/concepts.json"}, "items": rel_items})
    lr_queue.main()
    # narration scripts for review (what is spoken, and what is deliberately not)
    for r in ed["recordings"]:
        nar = C.load_json(work / f"{r['id']}.narration.json")
        C.dump_json(C.SRC_DIR / "narration-scripts" / f"{r['id']}.script.json", {
            "id": r["id"], "title": mani[r["slug"]]["title"], "engine": nar["engine"], "article": nar["article"],
            "omittedFromSpeech": [{"what": "Citation markers such as [1]", "where": "end of paragraphs that carry them", "shownInTranscript": True},
                                  {"what": "The Sources list", "where": "after the essay", "shownInTranscript": True}],
            "addedToSpeech": [{"what": "Recording note before the essay and a closing line after it", "reason": "Discloses the synthetic voice inside the audio file itself"}],
            "blocks": [{"id": b["id"], "kind": b["kind"], "sentences": [{"text": s["text"], "spoken": s["tts"]} for s in b["sentences"]]} for b in nar["blocks"]],
        })
    print("wrote", ", ".join(p.name for p in sorted(D.glob("*.json"))))


if __name__ == "__main__":
    main()
