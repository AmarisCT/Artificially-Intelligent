#!/usr/bin/env python3
"""Validate the Case Grid data against the Theory Chamber records.

Checks: every theory x case pairing has a cell; every claim id and source id used exists;
every cell has a question (its own or the case's); no verdict, score, or ranking wording;
the case descriptions and notes are non-empty where required.
Usage: validate_theory_grid.py [REPO_ROOT]
Exit code 0 = no errors."""
import json, os, re, sys

root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
tc = os.path.join(root, "theory-chamber", "data")
G = json.load(open(os.path.join(root, "theory-grid", "data", "cases.json"), encoding="utf-8"))
T = json.load(open(os.path.join(tc, "theories.json"), encoding="utf-8"))["items"]
S = json.load(open(os.path.join(tc, "sources.json"), encoding="utf-8"))["items"]

err, warn = [], []
tids = [t["id"] for t in T]
claims = {}
for t in T:
    for sec in ("history", "proposition", "foundations", "mechanisms", "predictions", "evidence", "criticisms", "openQuestions", "ai"):
        for c in t.get(sec, []):
            claims[c["id"]] = (t["id"], sec, c)
sids = {s["id"] for s in S} | {s["id"] for s in G.get("extraSources", [])}
for s in G.get("extraSources", []):
    for f in ("id", "short", "title", "authors", "year", "description", "access", "read", "limitations"):
        if not s.get(f):
            err.append(f"extra source {s.get('id')}: missing {f}")
    if not (s.get("doi") or s.get("url")):
        err.append(f"extra source {s['id']}: no DOI or URL")
    if s.get("url") and not s["url"].startswith("https://"):
        err.append(f"extra source {s['id']}: non-https url")
    if s["id"] in {x["id"] for x in S}:
        err.append(f"extra source {s['id']}: duplicates a Theory Chamber source id")

BANNED = re.compile(r"\b(score[sd]?|scoring|rank(s|ed|ing)?|rating|rated|probabilit\w*|likelihood|percent|verdict|winner|wins?)\b|%", re.I)
CLAIM_WORDS = re.compile(r"\b(is conscious|is not conscious|isn't conscious|are conscious|has experience|is sentient|feels pain)\b", re.I)

for tid in tids:
    if tid not in G["lenses"]:
        err.append(f"lens missing for theory {tid}")
for tid, lens in G["lenses"].items():
    if tid not in tids:
        err.append(f"lens for unknown theory {tid}")
    if not lens.get("looksAt"):
        err.append(f"lens {tid}: empty looksAt")
    for cid in lens.get("from", []):
        if cid not in claims:
            err.append(f"lens {tid}: unknown claim {cid}")
        elif claims[cid][0] != tid:
            err.append(f"lens {tid}: claim {cid} belongs to {claims[cid][0]}")

seen = set()
for case in G["cases"]:
    cid = case["id"]
    if cid in seen:
        err.append(f"duplicate case id {cid}")
    seen.add(cid)
    if not re.match(r"^[a-z0-9-]+$", cid):
        err.append(f"case {cid}: id must be lowercase letters, digits, hyphens")
    for f in ("short", "name", "description", "sourceNote"):
        if not case.get(f):
            err.append(f"case {cid}: missing {f}")
    for sid in case.get("sources", []):
        if sid not in sids:
            err.append(f"case {cid}: unknown source {sid}")
    for f in ("name", "description", "sourceNote", "ask", "defaultNote"):
        v = case.get(f) or ""
        if BANNED.search(v) or CLAIM_WORDS.search(v):
            err.append(f"case {cid}.{f}: verdict/score wording: {v[:60]!r}")
    for tid in tids:
        cell = case.get("cells", {}).get(tid)
        if cell is None:
            err.append(f"case {cid}: no cell for theory {tid}")
            continue
        q = cell.get("asks") or case.get("ask")
        if not q:
            err.append(f"case {cid}/{tid}: no question (cell 'asks' or case 'ask')")
        elif len(q) > 600:
            err.append(f"case {cid}/{tid}: question over 600 characters")
        for f in ("asks", "unsettled"):
            v = cell.get(f) or ""
            if BANNED.search(v) or CLAIM_WORDS.search(v):
                err.append(f"case {cid}/{tid}.{f}: verdict/score wording: {v[:60]!r}")
        for clid in cell.get("from", []):
            if clid not in claims:
                err.append(f"case {cid}/{tid}: unknown claim {clid}")
            elif claims[clid][0] != tid:
                err.append(f"case {cid}/{tid}: claim {clid} belongs to {claims[clid][0]}")
            else:
                for sid in claims[clid][2].get("sources", []):
                    if sid not in sids:
                        err.append(f"case {cid}/{tid}: claim {clid} cites unknown source {sid}")
    for tid in case.get("cells", {}):
        if tid not in tids:
            err.append(f"case {cid}: cell for unknown theory {tid}")
    if not case.get("defaultNote") and not case.get("useGaps") and not all(
            case["cells"].get(t, {}).get("unsettled") or case["cells"].get(t, {}).get("from") for t in tids):
        warn.append(f"case {cid}: some cells have no unsettled note and no records")

if len(G["cases"]) < 2:
    err.append("fewer than two cases")

n_cells = len(G["cases"]) * len(tids)
n_with = sum(1 for c in G["cases"] for t in tids if c["cells"].get(t, {}).get("from"))
print(f"{len(G['cases'])} cases x {len(tids)} theories = {n_cells} cells; {n_with} with records from the Theory Chamber")
for w in warn:
    print("warn:", w)
for e in err:
    print("ERROR:", e)
print("OK" if not err else f"{len(err)} error(s)")
sys.exit(1 if err else 0)
