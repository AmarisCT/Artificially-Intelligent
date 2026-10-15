#!/usr/bin/env python3
"""Validate Theory Chamber data: schema, references, duplicates, descriptions, review status.
Usage: validate_theory_chamber.py [DATA_DIR] [--online]   (--online checks DOIs against Crossref; needs network)"""
import json,re,sys,os,collections
d=sys.argv[1] if len(sys.argv)>1 and not sys.argv[1].startswith("--") else os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","theory-chamber","data")
online="--online" in sys.argv
L=lambda n:json.load(open(os.path.join(d,n+".json")))["items"]
T,S,C,CM,Q=[L(x) for x in ("theories","sources","concepts","comparisons","questions")]
err=[];warn=[];info=[]
sid=[s["id"] for s in S];cid=[c["id"] for c in C];tid=[t["id"] for t in T]
for name,ids in (("source",sid),("concept",cid),("theory",tid)):
    for k,n in collections.Counter(ids).items():
        if n>1: err.append(f"duplicate {name} id: {k}")
dois=[s["doi"].lower() for s in S if s.get("doi")]
for k,n in collections.Counter(dois).items():
    if n>1: err.append(f"duplicate DOI: {k}")
for s in S:
    for f in ("id","type","title","authors","description","relevance","access","read"):
        if not s.get(f): err.append(f"source {s.get('id')}: missing {f}")
    if s["type"] not in ("foundational","empirical","review","critical","comparative","secondary"): err.append(f"source {s['id']}: bad type")
    if s.get("doi") and not re.match(r"^10\.\d{4,9}/\S+$",s["doi"]): err.append(f"source {s['id']}: malformed DOI")
    if not s.get("doi") and not s.get("url"): err.append(f"source {s['id']}: no DOI or URL")
    if s.get("url") and not s["url"].startswith("https://"): err.append(f"source {s['id']}: non-https url")
    if s["access"]=="metadata-only": warn.append(f"source {s['id']}: metadata only (content not read)")
    if not s.get("limitations"): warn.append(f"source {s['id']}: no limitations text")
used=set()
def chk(item,where):
    if not item.get("text"): err.append(f"{where}: empty text")
    if not item.get("sources"): err.append(f"{where}: claim without a source")
    for x in item.get("sources",[]):
        used.add(x)
        if x not in sid: err.append(f"{where}: unknown source {x}")
    if item.get("review")!="awaiting-evidence-review" and item.get("review")!="reviewed": err.append(f"{where}: bad review status")
unrev=0;total=0;claimids=set()
for t in T:
    for f in ("id","name","abbr","summary","proposition","perspectives","review"):
        if not t.get(f): err.append(f"theory {t['id']}: missing {f}")
    for sec in ("history","proposition","foundations","mechanisms","predictions","evidence","criticisms","openQuestions","ai"):
        for it in t.get(sec,[]):
            chk(it,f"{t['id']}.{sec}:{it.get('id')}");total+=1
            if it["id"] in claimids: err.append(f"duplicate claim id {it['id']}")
            claimids.add(it["id"])
            if it.get("review")!="reviewed": unrev+=1
        if not t.get(sec) and sec in ("predictions","evidence","criticisms","mechanisms","foundations"): warn.append(f"theory {t['id']}: no {sec} (shown as Awaiting Evidence Review)")
    for r in t.get("reading",[]):
        used.add(r)
        if r not in sid: err.append(f"theory {t['id']}: unknown reading {r}")
    for cn in t.get("concepts",[]):
        if cn["concept"] not in cid: err.append(f"theory {t['id']}: unknown concept {cn['concept']}")
        if cn["relation"] not in ("proposed-mechanism","related-concept","empirical-prediction"): err.append(f"theory {t['id']}: bad relation")
        if not cn.get("sources"): err.append(f"theory {t['id']}: concept edge {cn['concept']} has no source")
        for x in cn.get("sources",[]):
            used.add(x)
            if x not in sid: err.append(f"theory {t['id']}: concept edge unknown source {x}")
    if t["review"].get("lastReviewed") is None: warn.append(f"theory {t['id']}: never reviewed")
for c in CM:
    for x in (c["a"],c["b"]):
        if x not in tid: err.append(f"comparison {c['a']}|{c['b']}: unknown theory {x}")
    for sec in ("similarities","contrasts"):
        for it in c.get(sec,[]):
            if not it.get("sources"): err.append(f"comparison {c['a']}|{c['b']}.{sec}: item without source")
            for x in it.get("sources",[]):
                used.add(x)
                if x not in sid: err.append(f"comparison: unknown source {x}")
for q in Q:
    for x in q["theories"]:
        if x not in tid: err.append(f"question {q['id']}: unknown theory {x}")
    for n in q.get("notes",[]): chk(n,f"question {q['id']}:{n.get('id')}")
    for x in q.get("criticisms",[]):
        if x not in claimids: err.append(f"question {q['id']}: unknown claim {x}")
    if not q.get("notes"): warn.append(f"question {q['id']}: no sourced notes (shown as Awaiting Evidence Review)")
for s in sid:
    if s not in used: warn.append(f"source {s}: not referenced by any claim")
info.append(f"{len(T)} theories, {len(S)} sources, {len(C)} concepts, {len(CM)} comparisons, {len(Q)} questions")
info.append(f"{unrev} of {total} theory claims are Awaiting Evidence Review")
if online:
    import urllib.request
    for s in S:
        if s.get("doi"):
            try:
                with urllib.request.urlopen("https://api.crossref.org/works/"+s["doi"],timeout=15) as r: json.load(r)
            except Exception as e: err.append(f"DOI check failed {s['doi']}: {e}")
for l in info: print("INFO",l)
for l in warn: print("WARN",l)
for l in err: print("ERROR",l)
print("RESULT:", "FAIL" if err else "PASS", f"({len(err)} errors, {len(warn)} warnings)")
sys.exit(1 if err else 0)
