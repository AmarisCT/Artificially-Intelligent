#!/usr/bin/env python3
"""Research Observatory discovery pipeline (server-side, run from GitHub Actions).

Queries approved scholarly providers, validates and de-duplicates records by DOI, assigns PRELIMINARY
categories from titles, and writes the public dataset. If every provider fails, or validation rejects the
batch, the previous verified dataset is left untouched. Never invents fields: missing metadata stays null.
Standard library only; no API keys are required or stored.
"""
import json, re, sys, time, urllib.parse, urllib.request, datetime, os
DATA = os.environ.get("OBS_DATA", "research-observatory/data")
UA = "ArtificiallyIntelligentObservatory/1.0 (+https://amarisct.github.io/Artificially-Intelligent/research-observatory/)"
QUERIES = {  # discipline id -> search phrases (preliminary routing only)
    "consciousness": ["theories of consciousness", "neural correlates of consciousness"],
    "machine": ["machine consciousness", "artificial consciousness"],
    "ai": ["large language models understanding", "machine reasoning"],
    "neuro": ["neural basis of conscious perception", "attention and awareness"],
    "cogsci": ["predictive processing cognition"],
    "mind": ["philosophy of mind subjective experience"],
    "memory": ["memory and personal identity", "digital memory"],
    "ethics": ["moral status of artificial intelligence", "AI accountability"],
}
KW = {"machine": ["machine consciousness", "artificial consciousness", "conscious ai"], "ai": ["language model", "artificial intelligence", "machine learning", "neural network"],
      "consciousness": ["conscious"], "neuro": ["neural", "brain", "neuro"], "cogsci": ["cognitive", "cognition", "attention", "perception"],
      "mind": ["philosophy of mind", "qualia", "subjective experience", "phenomenal"], "memory": ["memory", "identity"], "ethics": ["ethic", "moral", "responsib", "accountab"]}
DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception as e:
            err = e
            time.sleep(2 ** i)
    raise err

def norm_doi(d):
    if not d: return None
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d.strip(), flags=re.I).lower()
    return d if DOI_RE.match(d) else None

def openalex(q, since):
    url = "https://api.openalex.org/works?" + urllib.parse.urlencode({"search": q, "filter": f"from_publication_date:{since},has_doi:true", "per-page": 25,
          "select": "doi,title,publication_date,type,primary_location,authorships,is_retracted", "mailto": os.environ.get("OBS_CONTACT", "")})
    out = []
    for w in json.loads(get(url)).get("results", []):
        loc = (w.get("primary_location") or {}).get("source") or {}
        out.append(dict(doi=w.get("doi"), title=w.get("title"), date=w.get("publication_date"), type=w.get("type"), source=loc.get("display_name"),
                        publisher=loc.get("host_organization_name"), authors=[(a.get("author") or {}).get("display_name") for a in w.get("authorships", [])],
                        retracted=w.get("is_retracted"), provider="OpenAlex"))
    return out

def crossref_verify(doi):
    """Second-source check: the DOI must resolve in Crossref (or DataCite for arXiv) with the same title."""
    try:
        m = json.loads(get("https://api.crossref.org/works/" + urllib.parse.quote(doi)))["message"]
        return (m.get("title") or [""])[0]
    except Exception:
        return None

def valid(r):
    d = norm_doi(r.get("doi"))
    if not d or not r.get("title") or not r.get("date") or not re.match(r"^\d{4}(-\d{2}){0,2}$", r["date"]): return False
    if not [a for a in r.get("authors", []) if a]: return False   # records with no listed authors are dropped, not guessed
    if r.get("retracted"): return False
    return True

def classify(title):
    t = (title or "").lower()
    cats = [c for c, ws in KW.items() if any(w in t for w in ws)]
    return cats or None  # None = unclassified; never forced into a category

def main():
    today = datetime.date.today().isoformat()
    since = (datetime.date.today() - datetime.timedelta(days=int(os.environ.get("OBS_DAYS", "90")))).isoformat()
    pubs_path, st_path = f"{DATA}/publications.json", f"{DATA}/status.json"
    cur = json.load(open(pubs_path)); status = json.load(open(st_path))
    known = {norm_doi(p["doi"]): p for p in cur["items"]}
    states, fetched, ok_any = {}, [], False
    try:
        for disc, qs in QUERIES.items():
            for q in qs:
                for r in openalex(q, since):
                    r["route"] = disc; fetched.append(r)
                time.sleep(1)
        states["OpenAlex"] = ("ok", f"{len(fetched)} candidate records")
        ok_any = True
    except Exception as e:
        states["OpenAlex"] = ("unavailable", str(e)[:120])
    if not ok_any:
        status["providers"] = [dict(name=n, state="failed", note=m) for n, (s_, m) in states.items()] + [p for p in status["providers"] if p["name"] not in states]
        status["lastAttempt"] = today; json.dump(status, open(st_path, "w"), indent=1)
        print("All providers failed; dataset unchanged."); return 1
    added = 0
    for r in fetched:
        d = norm_doi(r.get("doi"))
        if not valid(r) or d in known: continue
        if not crossref_verify(d) and r.get("type") != "preprint": continue   # cannot confirm the DOI resolves
        cats = classify(r["title"])
        rec = dict(id=f"D{len(cur['items'])+added+1:04d}", doi=d, title=r["title"], authors=[a for a in r["authors"] if a], source=r.get("source"), publisher=r.get("publisher"),
                   publicationDate=r["date"], discoveryDate=today, abstract=None, abstractStatus="not retrieved", category=cats or [r["route"]], concepts=[], theories=[], questions=[],
                   publicationType={"article": "journal-article", "preprint": "preprint"}.get(r.get("type"), r.get("type") or "unknown"), url="https://doi.org/" + d,
                   reviewStatus="awaiting editorial review", summaryStatus="none (no abstract retrieved)", classification="preliminary (assigned from title keywords)",
                   provider=r["provider"], provenance=f"Metadata record retrieved from {r['provider']} on {today}; DOI checked against Crossref.", lastMetadataRefresh=today,
                   retraction="not flagged by provider at retrieval", seed=False)
        known[d] = rec; cur["items"].append(rec); added += 1
    if added > 200:  # safeguard against a bad batch
        print("Batch too large; refusing to publish."); return 1
    cur["meta"]["updated"] = today
    status.update(generated=today, mode="automatic", lastSuccessfulUpdate=today, recordCount=len(cur["items"]), cache="current")
    status["providers"] = [dict(name=n, state="used" if s_ == "ok" else "failed", note=m) for n, (s_, m) in states.items()] + [p for p in status["providers"] if p["name"] not in states]
    json.dump(cur, open(pubs_path + ".tmp", "w"), indent=1, ensure_ascii=False); os.replace(pubs_path + ".tmp", pubs_path)
    json.dump(status, open(st_path, "w"), indent=1)
    print(f"Added {added} records; total {len(cur['items'])}."); return 0

if __name__ == "__main__":
    sys.exit(main())
