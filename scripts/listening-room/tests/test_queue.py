#!/usr/bin/env python3
"""Fixture tests for revision detection and the production queue (lr_queue.py). Uses a throwaway repo in a temp dir;
the real library, queue and articles are never touched."""
import hashlib, json, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import lr_common as C
import lr_queue as Q

PASS = FAIL = 0
def check(desc, ok, detail=""):
    global PASS, FAIL
    PASS += bool(ok); FAIL += (not ok)
    print(("PASS " if ok else "FAIL ") + f"[T24] {desc}" + (f"  -- {detail}" if detail != "" else ""))

def page(slug, body, sources):
    ps = "".join(f"<p>{b}</p>" for b in body) + "<p>Sources</p>" + "".join(f"<p>{s}</p>" for s in sources)
    return f'<html><body><article><div class="article-body">{ps}</div><div class="links"></div></article></body></html>'

def write_article(root, slug, body, sources):
    d = root / "research" / "published" / slug; d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(page(slug, body, sources), encoding="utf-8")

def manifest(root, slugs):
    arts = [{"id": f"id-{s}", "title": s.replace("-", " ").title(), "url": C.SITE + f"research/published/{s}/", "publishedAt": f"2026-10-{i + 1:02d}", "readingMinutes": 5, "topics": []} for i, s in enumerate(slugs)]
    (root / "research" / "published").mkdir(parents=True, exist_ok=True)
    (root / "research" / "published" / "manifest.json").write_text(json.dumps({"articles": arts}))

def hashes(root, slug):
    C.ROOT = root
    p = C.read_article_page(slug)
    return {"bodyHash": p["bodyHash"], "sourcesHash": p["sourcesHash"]}

def run(root):
    q = Q.main(root)
    return {i["slug"]: i for i in q["items"]}

with tempfile.TemporaryDirectory() as td:
    root = Path(td)
    write_article(root, "alpha", ["Alpha paragraph one.", "Alpha paragraph two."], ["[1] A source."])
    write_article(root, "beta", ["Beta text."], [])
    manifest(root, ["alpha", "beta", "gamma"])  # gamma has no page
    lib = {"items": [{"id": "LR901", "status": "published", "releaseDate": "2026-10-20", "source": {"slug": "alpha"}, "versions": {"article": hashes(root, "alpha")}, "audio": {"url": "audio/LR901.mp3"}}]}
    libp = root / "listening-room" / "data" / "audio-library.json"; libp.parent.mkdir(parents=True, exist_ok=True)
    libp.write_text(json.dumps(lib)); lib_bytes = libp.read_bytes()

    q = run(root)
    check("A recording whose article is unchanged keeps its status and has no flags", q["alpha"]["status"] == "published" and q["alpha"]["flags"] == [])
    check("A new article with no recording is 'Not Yet Recorded' and eligible — never playable by itself", q["beta"]["status"] == "not-recorded" and q["beta"]["eligible"] is True and q["beta"]["recordingId"] is None)
    check("An article whose page cannot be read is not eligible and is reported", q["gamma"]["pageAvailable"] is False and q["gamma"]["eligible"] is False and q["gamma"]["status"] == "not-recorded")
    qb1 = (root / "listening-room/data/audio-queue.json").read_bytes()
    run(root)
    check("Running the queue twice changes nothing (no spurious commits from the 6-hourly workflow)", (root / "listening-room/data/audio-queue.json").read_bytes() == qb1)

    write_article(root, "alpha", ["Alpha paragraph one, edited.", "Alpha paragraph two."], ["[1] A source."])
    q = run(root)
    check("Editing the narrated text sets Revision Required and flags it", q["alpha"]["status"] == "revision-required" and q["alpha"]["flags"] == ["narrated-text-changed"] and q["alpha"].get("detectedOn"))
    check("…and the recording's own record is left exactly as it was (nothing replaced automatically)", libp.read_bytes() == lib_bytes)
    d1 = q["alpha"]["detectedOn"]
    qp = root / "listening-room/data/audio-queue.json"; j = json.loads(qp.read_text()); [i.update(detectedOn="2020-01-01") for i in j["items"] if i["slug"] == "alpha"]; qp.write_text(json.dumps(j))
    q = run(root)
    check("The first-detected date is carried forward, not rewritten each run", q["alpha"]["detectedOn"] == "2020-01-01", q["alpha"]["detectedOn"])

    write_article(root, "alpha", ["Alpha paragraph one.", "Alpha paragraph two."], ["[1] A source."])
    q = run(root)
    check("Restoring the original text clears the flag", q["alpha"]["status"] == "published" and q["alpha"]["flags"] == [])

    write_article(root, "alpha", ["Alpha paragraph one.", "Alpha paragraph two."], ["[1] A source, with a corrected link."])
    q = run(root)
    check("A change to the Sources list only is flagged but does not invalidate the narration", q["alpha"]["status"] == "published" and q["alpha"]["flags"] == ["sources-changed"])

    lib["items"][0]["status"] = "awaiting-review"; libp.write_text(json.dumps(lib)); lib_bytes = libp.read_bytes()
    write_article(root, "alpha", ["Alpha paragraph one.", "Alpha paragraph two, changed."], ["[1] A source."])
    q = run(root)
    check("An unreviewed recording is also marked Revision Required when its article changes", q["alpha"]["status"] == "revision-required")

    write_article(root, "delta", ["Delta."], ["[1] x"]); manifest(root, ["alpha", "beta", "gamma", "delta"])
    q = run(root)
    check("A newly published article appears in the queue as eligible and not playable, with no recording created", q["delta"]["status"] == "not-recorded" and q["delta"]["eligible"] and libp.read_bytes() == lib_bytes and len(json.loads(libp.read_text())["items"]) == 1)

    (root / "research/published/beta/index.html").unlink()
    q = run(root)
    check("If an article page disappears it is no longer eligible", q["beta"]["eligible"] is False)

# the real repository: both recordings were made from the articles as currently published
C.ROOT = Path(__file__).resolve().parents[3]; C.LR_DIR = C.ROOT / "listening-room"; C.DATA_DIR = C.LR_DIR / "data"
real = json.loads((C.DATA_DIR / "audio-queue.json").read_text())["items"]
check("Real repo: no recording is flagged for revision", all(not i["flags"] for i in real if i["recordingId"]), [(i["slug"], i["flags"]) for i in real if i["flags"]])
check("Real repo: no recording is marked Published Audio without a real approval", all(i["status"] != "published" for i in real))
print(f"\n{PASS}/{PASS + FAIL} queue checks passed")
sys.exit(1 if FAIL else 0)
