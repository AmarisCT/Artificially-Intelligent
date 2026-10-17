#!/usr/bin/env python3
"""Integration tests on a THROWAWAY COPY of the repository (the real files are never modified):
  * with the real records (both recordings Awaiting Audio Review) nothing about audio appears in article pages, the
    sitemap, the research index, Search or the Inquiry Engine;
  * with a clearly marked FIXTURE in which LR001 is Published Audio, the article page gets 'Listen to This Essay →',
    the sitemap gains /listening-room/, the research index gains one 'audio' resource, Search and the Inquiry Engine
    can surface it — and the recording is NOT flagged for revision (the added link sits outside the narrated text)."""
import json, re, shutil, subprocess, sys, tempfile
from pathlib import Path
REPO = Path(__file__).resolve().parents[3]
PASS = FAIL = 0
def check(desc, ok, detail=""):
    global PASS, FAIL
    PASS += bool(ok); FAIL += (not ok)
    print(("PASS " if ok else "FAIL ") + f"[T26] {desc}" + (f"  -- {detail}" if detail != "" else ""), flush=True)
def sh(cwd, *cmd):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode: print(r.stdout, r.stderr)
    return r
SLUG1, SLUG2 = "we-are-all-archives-now", "is-human-consciousness-connected-to-artificial-intelligence"
NODE = r'''
const path=require("path"),fs=require("fs");const root=process.argv[2];
const IE=require(path.join(root,"inquiry-engine/engine.js")),SE=require(path.join(root,"search/search-engine.js"));
const rd=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const idx=rd("inquiry-engine/data/research-index.json"),voc=rd("inquiry-engine/data/concept-relations.json"),rules=rd("inquiry-engine/data/pathway-rules.json");
const ie=IE.create(idx,voc,rules),se=SE.create(idx,voc,rules);
const inq=ie.inquire("How do archives shape memory and identity?",{visited:[]});
const cstep=(inq.steps||[]).find(s=>s.id==="continue"),cont=cstep?cstep.items:[];
const hits=se.search("archives",{limit:40}).results.map(r=>({id:r.record.id,type:r.record.type}));
const hits2=se.search("We Are All Archives Now",{limit:10}).results.map(r=>({id:r.record.id,type:r.record.type}));
console.log(JSON.stringify({cont:cont.map(c=>({id:c.id,group:c.group})),hits,hits2,label:se.typeLabel.audio,facets:se.facetValues().types,order:Object.keys(se.typeLabel)}));
'''
with tempfile.TemporaryDirectory() as td:
    T = Path(td) / "repo"
    shutil.copytree(REPO, T, ignore=shutil.ignore_patterns(".git", "__pycache__", "*.zip", "*.mp3", "node_modules"))
    (T / "scripts/listening-room/tests/_probe.js").write_text(NODE)
    def build_all():
        r1 = sh(T, "python3", "scripts/build_published.py")
        r2 = sh(T, "python3", "scripts/listening-room/lr_queue.py")
        r3 = sh(T, "python3", "scripts/build_research_index.py", ".", "--atlas", "scripts/atlas_dump.json")
        return r1.returncode == 0 and r2.returncode == 0 and r3.returncode == 0
    def page(slug): return (T / "research/published" / slug / "index.html").read_text(encoding="utf-8")
    def probe():
        r = subprocess.run(["node", str(T / "scripts/listening-room/tests/_probe.js"), str(T)], capture_output=True, text=True)
        return json.loads(r.stdout) if r.returncode == 0 else {"err": r.stderr[-400:]}

    # ---- A: real records
    ok = build_all()
    check("Generators run cleanly on the real records", ok)
    check("A: article pages have no Listen link while recordings are unapproved", "Listen to This Essay" not in page(SLUG1) and "Listen to This Essay" not in page(SLUG2) and "AudioObject" not in page(SLUG1))
    same = all((REPO / "research/published" / s / "index.html").read_bytes() == (T / "research/published" / s / "index.html").read_bytes() for s in (SLUG1, SLUG2))
    check("A: article pages are byte-identical to the committed ones (the feature changes nothing until audio is published)", same)
    check("A: sitemap does not list /listening-room/ for an empty room", "listening-room" not in (T / "sitemap.txt").read_text() and "listening-room" not in (T / "sitemap.xml").read_text())
    idx = json.loads((T / "inquiry-engine/data/research-index.json").read_text())
    check("A: research index has no audio resources for unapproved recordings", not any(r["type"] == "audio" for r in idx["resources"]) and "audio" not in idx["meta"]["counts"], idx["meta"]["counts"])
    ad = [a for a in idx["meta"]["adapters"] if a["name"].startswith("Listening Room")]
    check("A: the adapter list says no recording has been published", ad and ad[0]["active"] is False and "No recording" in ad[0]["note"], ad)
    p = probe()
    check("A: Inquiry Engine and Search surface no audio", "err" not in p and not any(c["group"] == "audio" for c in p["cont"]) and not any(h["type"] == "audio" for h in p["hits"] + p["hits2"]), p.get("err", ""))
    check("A: Search knows the 'Audio essay' type label", p.get("label") == "Audio essay")
    q = json.loads((T / "listening-room/data/audio-queue.json").read_text())["items"]
    check("A: no recording is flagged for revision", all(not i["flags"] for i in q))

    # ---- B: FIXTURE ONLY. LR001 marked Published Audio in the throwaway copy.
    lib = json.loads((T / "listening-room/data/audio-library.json").read_text())
    for r in lib["items"]:
        if r["id"] == "LR001": r["status"] = "published"; r["releaseDate"] = "2026-10-20"
    (T / "listening-room/data/audio-library.json").write_text(json.dumps(lib))
    ok = build_all()
    check("B (fixture): generators run cleanly", ok)
    h1, h2 = page(SLUG1), page(SLUG2)
    check("B: only the essay whose recording is published gets 'Listen to This Essay →'", "Listen to This Essay →" in h1 and "Listen to This Essay" not in h2)
    m = re.search(r'<p class="listen-cta"><a href="([^"]+)"', h1)
    check("B: the link points to that recording's page", bool(m) and m.group(1) == "../../../listening-room/#listen-LR001", m.group(1) if m else "")
    body = re.search(r'<div class="article-body">(.*?)</div>', h1, re.S).group(1)
    check("B: the link is outside the essay body, so the narrated text is unchanged", "Listen to This Essay" not in body and h1.index("listen-cta") < h1.index('class="article-body"'))
    ld = re.search(r'application/ld\+json">(.*?)</script>', h1, re.S)
    sch = json.loads(ld.group(1).replace("\\u003c", "<")) if ld else {}
    check("B: structured data gains an AudioObject with real duration and format", sch.get("audio", {}).get("@type") == "AudioObject" and sch["audio"]["encodingFormat"] == "audio/mpeg" and re.match(r"PT10M1[45]S$", sch["audio"]["duration"]), sch.get("audio"))
    check("B: sitemap now lists /listening-room/", "https://amarisct.github.io/Artificially-Intelligent/listening-room/" in (T / "sitemap.txt").read_text().split())
    q = {i["recordingId"]: i for i in json.loads((T / "listening-room/data/audio-queue.json").read_text())["items"] if i["recordingId"]}
    check("B: adding the link did NOT flag the recording for revision (narrated text unchanged)", q["LR001"]["status"] == "published" and q["LR001"]["flags"] == [], q["LR001"])
    idx = json.loads((T / "inquiry-engine/data/research-index.json").read_text())
    au = [r for r in idx["resources"] if r["type"] == "audio"]
    check("B: the index gains exactly one audio resource, for the published recording only", [r["id"] for r in au] == ["audio:LR001"] and idx["meta"]["counts"].get("audio") == 1, [r["id"] for r in au])
    check("B: it links to the recording page, carries its concepts, and creates no graph edges", au and au[0]["url"].endswith("/listening-room/#listen-LR001") and "memory" in au[0]["concepts"] and not any("audio:" in (e["a"] + e["b"]) for e in idx["edges"]))
    check("B: it is saved to the Reading Desk under listen:LR001", au and au[0]["deskKey"] == "listen:LR001")
    p = probe()
    aud = [c for c in p.get("cont", []) if c["group"] == "audio"]
    check("B: the Inquiry Engine recommends the recording under 'Listen' for a question about archives and memory, and not the unpublished one", [c["id"] for c in aud] == ["audio:LR001"], p.get("cont") or p.get("err"))
    check("B: Search finds it, typed 'audio', next to the essay", any(h["id"] == "audio:LR001" and h["type"] == "audio" for h in p.get("hits2", [])) and any(h["id"] == "art:" + SLUG1 for h in p.get("hits2", [])), p.get("hits2"))
    check("B: Search offers Audio essay as a content-type facet", "audio" in p.get("facets", []), p.get("facets"))

    # ---- C: revision flow with a published recording
    s = (T / "research/published" / SLUG1 / "index.html").read_text()
    (T / "research/published" / SLUG1 / "index.html").write_text(s.replace("a human being pressed a mark into clay", "a human being pressed a mark into wet clay"))
    sh(T, "python3", "scripts/listening-room/lr_queue.py")
    q = {i["recordingId"]: i for i in json.loads((T / "listening-room/data/audio-queue.json").read_text())["items"] if i["recordingId"]}
    check("C: editing a word of the essay flags the published recording Revision Required", q["LR001"]["status"] == "revision-required" and "narrated-text-changed" in q["LR001"]["flags"], q["LR001"]["flags"])
    sh(T, "python3", "scripts/build_research_index.py", ".", "--atlas", "scripts/atlas_dump.json")
    idx = json.loads((T / "inquiry-engine/data/research-index.json").read_text())
    check("C: a Revision Required recording that was approved stays in the index (still playable, with a notice)", any(r["id"] == "audio:LR001" for r in idx["resources"]))

    # ---- D: a hand-edited recording record with a syntax error must not stop the existing publishing jobs
    (T / "listening-room/data/audio-library.json").write_text('{"items": [ {"id": "LR001", ')   # truncated, invalid JSON
    r1 = sh(T, "python3", "scripts/build_published.py")
    r3 = sh(T, "python3", "scripts/build_research_index.py", ".", "--atlas", "scripts/atlas_dump.json")
    check("D: a corrupt audio-library.json does not stop the article pages or sitemaps from building", r1.returncode == 0 and "WARNING" in r1.stderr, r1.stderr[-160:])
    check("D: ...nor the research index (it is built without audio, with a warning)", r3.returncode == 0 and "WARNING" in r3.stderr, r3.stderr[-160:])
    same = all((REPO / "research/published" / x / "index.html").read_bytes() == (T / "research/published" / x / "index.html").read_bytes() for x in (SLUG1, SLUG2))
    check("D: ...and the article pages are unchanged", same)
print(f"\n{PASS}/{PASS + FAIL} integration checks passed")
sys.exit(1 if FAIL else 0)
