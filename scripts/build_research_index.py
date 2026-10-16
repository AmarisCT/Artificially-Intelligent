#!/usr/bin/env python3
"""Build the shared research index for the Inquiry Engine (and, later, Universal Research Search).

Reads ONLY public, deployed data already in the repository and writes:
  inquiry-engine/data/research-index.json     one record per resource (any type)
  inquiry-engine/data/concept-relations.json  concept vocabulary + aliases + relations
  inquiry-engine/data/pathway-rules.json      explainable step rules (copied from pathway-rules.src.json)

Nothing here is invented: every title/summary/URL comes from a data file. Concept aliases and
the few concept-to-concept links are an EDITORIAL vocabulary and are labelled that way.
Future published articles are picked up from research/published/manifest.json on every run.

Usage: build_research_index.py REPO_ROOT [--atlas atlas_dump.json]
"""
from __future__ import annotations
import json, pathlib, re, sys, datetime as dt

SITE = "https://amarisct.github.io/Artificially-Intelligent/"


def load(p):
    return json.load(open(p, encoding="utf-8"))


def clip(s, n=420):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


# ---- editorial vocabulary: aliases (what visitors might type) ---------------------------------
# These are search aliases only. They do not assert that two terms mean the same thing.
ALIASES = {
    "consciousness": ["consciousness", "conscious", "consciously", "sentience", "sentient"],
    "subjective-experience": ["subjective experience", "experience", "experiences", "what it is like", "qualia", "phenomenal"],
    "awareness": ["awareness", "aware"],
    "self-awareness": ["self awareness", "self aware", "self-awareness", "aware of itself", "aware of oneself"],
    "self-modeling": ["self model", "self modeling", "self representation", "representation of itself", "model of itself"],
    "self": ["self", "selfhood", "sense of self"],
    "machine-consciousness": ["machine consciousness", "artificial consciousness", "conscious machine", "conscious ai", "ai consciousness", "machines conscious", "machine conscious", "ai conscious"],
    "ai": ["artificial intelligence", "ai", "machine", "machines", "computer", "computers", "robot", "algorithm", "algorithms", "llm", "llms", "language model", "language models", "chatbot"],
    "intelligence": ["intelligence", "intelligent", "smart"],
    "understanding": ["understanding", "understand", "understands", "meaning", "comprehension", "comprehend", "grasp"],
    "language": ["language", "linguistic", "words", "speech", "sentence", "sentences"],
    "learning": ["machine learning", "deep learning", "neural network", "neural networks", "training data", "learn from data", "learning"],
    "reasoning": ["reasoning", "reason", "logic", "inference"],
    "cognition": ["cognition", "cognitive", "thinking", "thought", "think", "thinks", "mind's"],
    "mind": ["mind", "minds", "mental", "mind body", "hard problem"],
    "neuroscience": ["neuroscience", "brain", "brains", "neural", "neuron", "neurons", "cortex"],
    "neural-activity": ["neural activity", "brain activity", "neural correlates", "correlates of consciousness"],
    "substrate": ["substrate", "biological brain", "biological", "independent of the brain", "without a brain", "silicon", "nonbiological", "non biological"],
    "emergence": ["emerge", "emerges", "emergence", "emergent", "fundamental"],
    "memory": ["memory", "memories", "remember", "remembering", "forget", "forgetting", "recall"],
    "identity": ["identity", "who i am", "who we are"],
    "personal-identity": ["personal identity", "persist", "continuity", "same person", "sense of self over time"],
    "archives": ["archive", "archives", "archival", "library", "libraries", "records"],
    "digital-records": ["digital records", "digital trace", "digital traces", "digital replica", "digital archive", "digital footprint", "preserve a person", "digital self"],
    "culture": ["digital culture", "culture", "internet", "platform", "platforms", "web"],
    "attention": ["attention", "attend", "attentional"],
    "perception": ["perception", "perceive", "perceives", "seeing", "visual", "vision", "sensory"],
    "prediction": ["prediction", "predictive", "predict", "predictive processing"],
    "metacognition": ["metacognition", "metacognitive", "thinking about thinking"],
    "integration": ["integration", "integrated information"],
    "global-availability": ["global workspace", "global availability", "broadcast", "ignition"],
    "recurrent-processing": ["recurrent processing", "feedback processing", "recurrence"],
    "information-processing": ["information processing", "computation", "computational", "process information"],
    "measurement": ["measure", "measured", "measurement", "measuring", "test for", "evidence", "indicator", "indicators", "detect", "detecting", "assess", "assessing"],
    "ethics": ["ethics", "ethical", "moral", "morality", "society", "societal", "fair", "fairness", "bias"],
    "moral-consideration": ["moral status", "moral consideration", "moral patient", "deserve rights", "rights", "deserve moral", "welfare"],
    "responsibility": ["responsibility", "responsible", "accountability", "accountable", "blame", "liable"],
    "method": ["method", "methodology", "scientific method", "adversarial collaboration", "preregistered", "falsifiable", "testable", "empirical"],
    "computing": ["turing", "turing test", "computing history", "history of computing", "computer science"],
}

# Editorial links between vocabulary concepts, used ONLY to widen search with a visible reason.
# "same": the same idea under two names in the site's data; "near": closely related, not identical.
CONCEPT_LINKS = [
    ("consciousness", "subjective-experience", "near"),
    ("consciousness", "awareness", "near"),
    ("machine-consciousness", "consciousness", "near"),
    ("machine-consciousness", "ai", "near"),
    ("self-awareness", "self-modeling", "near"),
    ("self-awareness", "awareness", "near"),
    ("self", "self-awareness", "near"),
    ("identity", "personal-identity", "same"),
    ("memory", "personal-identity", "near"),
    ("digital-records", "archives", "near"),
    ("digital-records", "personal-identity", "near"),
    ("moral", "moral-consideration", "same"),
    ("accountability", "responsibility", "same"),
    ("ethics", "moral-consideration", "near"),
    ("ethics", "responsibility", "near"),
    ("mind", "consciousness", "near"),
    ("neuroscience", "neural-activity", "near"),
    ("understanding", "language", "near"),
    ("learning", "ai", "near"),
    ("intelligence", "ai", "near"),
    ("reasoning", "intelligence", "near"),
    ("digital", "digital-records", "same"),
    ("method", "measurement", "near"),
]

CONCEPT_ID_ALIAS = {"moral": "moral-consideration", "accountability": "responsibility", "digital": "digital-records"}

EVIDENCE_LABEL = {
    "empirical": "Empirical finding",
    "philosophical": "Philosophical argument",
    "proposal": "Theoretical proposal",
    "review": "Review of the literature",
    "foundational": "Foundational theoretical paper",
    "comparative": "Comparison of theories",
    "critical": "Critical response",
    "secondary": "Secondary report",
}
PUBTYPE_LABEL = {"journal-article": "Journal article", "proceedings-article": "Conference paper", "preprint": "Preprint"}



# ---- subject mapping (editorial): concept ids and Archive categories -> the eight research subjects
SUBJECTS = ["Consciousness", "Artificial Intelligence", "Neuroscience", "Cognition", "Philosophy", "Memory", "Identity", "Ethics"]
CONCEPT_SUBJECT = {
    "consciousness": "Consciousness", "subjective-experience": "Consciousness", "awareness": "Consciousness", "global-availability": "Consciousness",
    "integration": "Consciousness", "recurrent-processing": "Consciousness", "machine-consciousness": "Consciousness",
    "ai": "Artificial Intelligence", "intelligence": "Artificial Intelligence", "learning": "Artificial Intelligence", "reasoning": "Artificial Intelligence",
    "understanding": "Artificial Intelligence", "computing": "Artificial Intelligence", "language": "Artificial Intelligence",
    "neuroscience": "Neuroscience", "neural-activity": "Neuroscience",
    "cognition": "Cognition", "attention": "Cognition", "metacognition": "Cognition", "information-processing": "Cognition", "prediction": "Cognition", "perception": "Cognition", "self-modeling": "Cognition",
    "mind": "Philosophy", "method": "Philosophy", "emergence": "Philosophy", "substrate": "Philosophy", "measurement": "Philosophy",
    "memory": "Memory", "archives": "Memory", "digital-records": "Memory", "culture": "Memory", "digital": "Memory",
    "identity": "Identity", "personal-identity": "Identity", "self": "Identity", "self-awareness": "Identity",
    "ethics": "Ethics", "moral": "Ethics", "moral-consideration": "Ethics", "responsibility": "Ethics", "accountability": "Ethics",
}
CATEGORY_SUBJECT = {"human": "Consciousness", "ai": "Artificial Intelligence", "neuro": "Neuroscience", "mind": "Philosophy", "memory": "Memory", "ethics": "Ethics"}
SOURCE_TYPE = {"article": "Original essay", "source": "External publication", "question": "Site research record", "theory": "Site research record",
               "comparison": "Site research record", "concept": "Site research record", "museum": "Site research record"}

STOPW = set("a an the of to in on at for and or is are was were be been it its that this with by as from into than then there their they them not no if so such very more most also just which who what when where how why can could would should do does did has have had but about over under between through during while these those his her our your you we i".split())


def body_terms(text, cap=320):
    """Unique lowercase words from a body of text. Stored instead of the prose, so the index can match
    full text without duplicating the content."""
    seen, out = set(), []
    for w in re.findall(r"[a-z][a-z'-]{3,}", (text or "").lower()):
        w = w.strip("'-")
        if len(w) < 4 or w in STOPW or w in seen:
            continue
        seen.add(w); out.append(w)
        if len(out) >= cap:
            break
    return out


def page_text(path):
    """Visible article text from a published article page (the .article-body block)."""
    try:
        html = path.read_text(encoding="utf-8")
    except Exception:
        return ""
    m = re.search(r'<div class="article-body">(.*?)</div>\s*<div class="links"', html, re.S) or re.search(r'class="article-body"[^>]*>(.*?)</div>', html, re.S)
    if not m:
        return ""
    t = re.sub(r"<[^>]+>", " ", m.group(1))
    import html as H
    return re.sub(r"\s+", " ", H.unescape(t)).strip()


def enrich(res, vocab, root, uq, theories, manifest, today):
    qcat = {q["id"]: q.get("category") for q in uq}
    qbody = {}
    for q in uq:
        inv = q.get("investigation") or {}
        parts = [q.get("scope") or "", q.get("statusJustification") or ""] + list(q.get("openProblems") or []) + (inv.get("understand", {}).get("text", []) if inv else [])
        qbody[q["id"]] = " ".join(parts)
    tbody = {t["id"]: " ".join(t.get("explanation", [])[:3] + [t.get("proposition") if isinstance(t.get("proposition"), str) else ""]) for t in theories}
    for r in res.values():
        subs = []
        for c in r.get("concepts", []):
            s = CONCEPT_SUBJECT.get(c)
            if s and s not in subs:
                subs.append(s)
        if r["type"] == "question":
            s = CATEGORY_SUBJECT.get(r.get("category"))
            if s and s not in subs:
                subs.insert(0, s)
        if r["type"] == "museum" and "Memory" not in subs:
            subs.append("Memory")
        r["subject"] = [s for s in SUBJECTS if s in subs]
        r["sourceType"] = SOURCE_TYPE[r["type"]]
        r["added"] = today
        alt = []
        if r["type"] == "theory" and r.get("abbr"):
            alt.append(r["abbr"])
        if r["type"] == "concept":
            v = vocab.get(r["id"].split(":", 1)[1])
            if v:
                lab = r["title"].lower()
                # keep true variants only: multiword names, inflections of the label, and a few real synonyms.
                # Looser related words (machine, computer, brain...) stay out of the alt-name tier.
                alt += [a for a in v["aliases"] if a != lab and (" " in a or a[:5] == lab[:5] or a in ("ai", "llm", "llms", "qualia", "sentience"))]
        r["alt"] = sorted(set(alt))
        body = ""
        if r["type"] == "question":
            body = qbody.get(r["id"][2:], "")
        elif r["type"] == "theory":
            body = tbody.get(r["id"].split(":", 1)[1], "")
        elif r["type"] == "article":
            slug = r["id"].split(":", 1)[1]
            body = page_text(root / "research" / "published" / slug / "index.html")
            r["hasFullText"] = bool(body)
        elif r["type"] == "source":
            body = " ".join([r.get("summary") or "", (r.get("limitations") or "")])
        if body:
            r["body"] = body_terms(body)


def build(root: pathlib.Path, atlas_path: pathlib.Path):
    atlas = load(atlas_path)
    tcd, uad, obd = root / "theory-chamber/data", root / "unanswered-archive/data", root / "research-observatory/data"
    theories = load(tcd / "theories.json")["items"]
    tc_concepts = {c["id"]: c for c in load(tcd / "concepts.json")["items"]}
    tc_sources = {s["id"]: s for s in load(tcd / "sources.json")["items"]}
    comps = load(tcd / "comparisons.json")["items"]
    uq = load(uad / "questions.json")["items"]
    uq_sources = {s["id"]: s for s in load(uad / "question-sources.json")["items"]}
    uq_meta = load(uad / "meta.json")
    uq_rel = load(uad / "question-relations.json")["items"]
    pubs = load(obd / "publications.json")["items"]
    pub_conn = load(obd / "research-connections.json")["items"]
    topics = load(obd / "research-topics.json")
    museum = load(root / "museum/data/museum.json")
    manifest = load(root / "research/published/manifest.json")["articles"]
    status_labels = {s["id"]: s["label"] for s in uq_meta["statuses"]}

    res, edges = {}, []

    def add(r):
        assert r["id"] not in res, r["id"]
        res[r["id"]] = r

    def edge(a, b, why, kind, src):
        edges.append({"a": a, "b": b, "why": why, "kind": kind, "source": src})

    # ---------------- vocabulary ----------------
    vocab = {}
    for c in atlas["c"]:
        vocab[c["id"]] = {"id": c["id"], "label": c["name"], "atlas": c["id"], "description": c["description"]}
    for c in uq_meta["concepts"]:
        vocab.setdefault(c["id"], {"id": c["id"], "label": c["name"], "atlas": None, "description": None})
    for cid, c in tc_concepts.items():
        v = vocab.setdefault(cid, {"id": cid, "label": c["name"], "atlas": None, "description": None})
        v["tcDescription"] = c["description"]
        if c.get("atlas") and not v.get("atlas"):
            v["atlasNear"] = c["atlas"]
    for cid, v in vocab.items():
        v["aliases"] = sorted(set(ALIASES.get(cid, []) + [v["label"].lower()]))
        v["id"] = cid
    for alias_id, tgt in CONCEPT_ID_ALIAS.items():
        # atlas planet 'moral' etc. keep their own ids as concepts; links below tie them to the archive ids
        pass

    # ---------------- concept resources (Atlas planets) ----------------
    for c in atlas["c"]:
        g = atlas["g"].get(c["id"], {})
        add({"id": f"concept:{c['id']}", "type": "concept", "title": c["name"], "summary": clip(c["description"], 520),
             "concepts": [c["id"]], "url": f"{SITE}#dossier-{c['id']}", "date": None,
             "attribution": "Research Atlas, Artificially Intelligent", "reviewStatus": "Editorial description",
             "subjects": g.get("sub", []), "deskKey": None})
        for q in g.get("qs", []):
            edge(f"concept:{c['id']}", f"q:{q}", "Listed under this planet in the Research Atlas", "editorial", "atlas")
        for t in g.get("th", []):
            edge(f"concept:{c['id']}", f"theory:{t}", "Listed under this planet in the Research Atlas", "editorial", "atlas")
        for r in g.get("rooms", []):
            edge(f"concept:{c['id']}", f"room:{r}", "Listed under this planet in the Research Atlas", "editorial", "atlas")

    # Theory Chamber / Archive concepts that are not Atlas planets become concept resources too, so that
    # every concept node the engine shows is a real indexed resource with a real page.
    for cid, v in vocab.items():
        if v["atlas"] is None and (v.get("tcDescription")):
            add({"id": f"concept:{cid}", "type": "concept", "title": v["label"], "summary": clip(v["tcDescription"], 520),
                 "concepts": [cid], "url": f"{SITE}theory-chamber/#concepts", "date": None,
                 "attribution": "The Theory Chamber, Artificially Intelligent (concept descriptions)", "reviewStatus": "Editorial description",
                 "subjects": [], "deskKey": None})

    # ---------------- questions ----------------
    qconcepts = {}
    for q in uq:
        qconcepts[q["id"]] = q.get("concepts", [])
        inv = q.get("investigation") or {}
        unders = " ".join(inv.get("understand", {}).get("text", [])) if inv else ""
        add({"id": f"q:{q['id']}", "type": "question", "title": q["title"],
             "summary": clip(q.get("summary"), 400), "scope": clip(q.get("scope"), 400),
             "understand": [clip(t, 700) for t in (inv.get("understand", {}).get("text", []) if inv else [])][:3],
             "concepts": q.get("concepts", []) , "keywords": q.get("keywords", []),
             "category": q.get("category"), "status": [status_labels.get(s, s) for s in q.get("status", [])],
             "statusJustification": clip(q.get("statusJustification"), 700),
             "openProblems": q.get("openProblems", []),
             "url": f"{SITE}unanswered-archive/#q-{q['id']}", "date": q.get("lastReviewed"),
             "attribution": "The Unanswered Archive, Artificially Intelligent",
             "reviewStatus": "Reviewed preview" if q.get("review") == "reviewed-preview" else str(q.get("review")),
             "hasInvestigation": bool(inv), "deskKey": f"question:{q['id']}"})
        for t in q.get("theories", []):
            edge(f"q:{q['id']}", f"theory:{t}", "Theory named for this question in the Unanswered Archive", "editorial", "archive")
        for r in q.get("related", []):
            pass
    for r in uq_rel:
        edge(f"q:{r['a']}", f"q:{r['b']}", r["why"], "editorial", "archive-relation:" + r["type"])

    # ---------------- theories + comparisons ----------------
    for t in theories:
        cons = [c["concept"] for c in t.get("concepts", [])]
        add({"id": f"theory:{t['id']}", "type": "theory", "title": t["name"], "abbr": t["abbr"],
             "summary": clip(t["summary"], 520), "concepts": cons + [a for a in t.get("atlas", [])],
             "url": f"{SITE}theory-chamber/#theory-{t['id']}", "date": (t.get("review") or {}).get("lastReviewed"),
             "attribution": "The Theory Chamber, Artificially Intelligent",
             "reviewStatus": "Awaiting evidence review" if (t.get("review") or {}).get("status") == "awaiting-evidence-review" else "Reviewed",
             "tradition": t.get("tradition"), "deskKey": f"theory:{t['id']}"})
        for sid in t.get("reading", []):
            edge(f"theory:{t['id']}", f"src:{sid}", "In this theory's reading list in the Theory Chamber", "editorial", "theory-chamber")
    for c in comps:
        a, b = c["a"], c["b"]
        ta = next(t for t in theories if t["id"] == a)
        tb = next(t for t in theories if t["id"] == b)
        add({"id": f"cmp:{a}-{b}", "type": "comparison", "title": f"{ta['abbr']} compared with {tb['abbr']}",
             "summary": clip(f"Side-by-side comparison of {ta['name']} and {tb['name']}, with similarities and contrasts, each tied to sources.", 300),
             "concepts": [], "theories": [a, b], "url": f"{SITE}theory-chamber/#compare-{a}-{b}", "date": None,
             "attribution": "The Theory Chamber, Artificially Intelligent", "reviewStatus": "Awaiting evidence review",
             "deskKey": f"cmp:{a}-{b}"})
        edge(f"cmp:{a}-{b}", f"theory:{a}", "One of the two theories compared", "editorial", "theory-chamber")
        edge(f"cmp:{a}-{b}", f"theory:{b}", "One of the two theories compared", "editorial", "theory-chamber")

    # ---------------- sources (deduplicated by DOI, then by id) ----------------
    by_doi, src_alias = {}, {}

    def src_record(s, origin, desk=False):
        doi = (s.get("doi") or "").lower() or None
        key = by_doi.get(doi) if doi else None
        if key is None:
            key = f"src:{s['id']}"
            if key in res:
                src_alias[f"src:{s['id']}"] = key
                return res[key]
            rec = {"id": key, "type": "source", "title": s["title"], "authors": s.get("authors", []), "year": s.get("year"),
                   "venue": s.get("venue"), "doi": s.get("doi"), "url": (f"https://doi.org/{s['doi']}" if s.get("doi") else s.get("url")),
                   "summary": clip(s.get("description"), 520), "concepts": [], "date": str(s.get("year") or ""),
                   "evidenceType": s.get("type"), "evidenceLabel": EVIDENCE_LABEL.get(s.get("type"), s.get("type")),
                   "access": s.get("access"), "read": s.get("read"), "limitations": clip(s.get("limitations"), 400) if s.get("limitations") else None,
                   "attribution": "; ".join(origin), "reviewStatus": "Awaiting evidence review",
                   "perQuestion": {}, "deskKey": f"source:{s['id']}" if desk else None, "origins": list(origin)}
            res[key] = rec
            if doi:
                by_doi[doi] = key
        else:
            rec = res[key]
            src_alias[f"src:{s['id']}"] = key
            for o in origin:
                if o not in rec["origins"]:
                    rec["origins"].append(o); rec["attribution"] = "; ".join(rec["origins"])
        if desk and not rec.get("deskKey"):
            rec["deskKey"] = f"source:{s['id']}"
        return rec

    for sid, s in uq_sources.items():
        src_record(s, ["The Unanswered Archive"], desk=True)
    for sid, s in tc_sources.items():
        src_record(s, ["The Theory Chamber"], desk=True)
    # per-question findings/limits (source-grounded notes from the Archive investigations)
    for q in uq:
        inv = q.get("investigation") or {}
        for sid, f in (inv.get("findings") or {}).items():
            k = src_alias.get(f"src:{sid}", f"src:{sid}")
            if k in res:
                res[k]["perQuestion"].setdefault(q["id"], {})["finding"] = f
        for sid, l in (inv.get("limits") or {}).items():
            k = src_alias.get(f"src:{sid}", f"src:{sid}")
            if k in res:
                res[k]["perQuestion"].setdefault(q["id"], {})["limit"] = l
        for sid in inv.get("evidence", []) if inv else []:
            k = src_alias.get(f"src:{sid}", f"src:{sid}")
            if k in res:
                edge(f"q:{q['id']}", k, "Listed as evidence for this question in the Unanswered Archive", "editorial", "archive")

    # Observatory publications
    pid_map = {}
    for p in pubs:
        doi = (p.get("doi") or "").lower()
        ntitle = re.sub(r"[^a-z0-9]+", " ", p["title"].lower()).strip()
        pyear = int(str(p["publicationDate"])[:4]) if p.get("publicationDate") else None
        k = by_doi.get(doi) if doi else None
        if k is None:
            # second-chance merge: identical normalised title AND identical year (DOIs can differ between a
            # publisher record and a repository copy); the merge basis is recorded on the record.
            for rk, rr in res.items():
                if rr["type"] == "source" and re.sub(r"[^a-z0-9]+", " ", rr["title"].lower()).strip() == ntitle and rr.get("year") == pyear:
                    k = rk; rr.setdefault("mergedOn", []).append("title+year (" + p["id"] + ")"); break
        if k is not None:
            pid_map[p["id"]] = k
            if "The Research Observatory" not in res[k]["origins"]:
                res[k]["origins"].append("The Research Observatory"); res[k]["attribution"] = "; ".join(res[k]["origins"])
            res[k]["observatoryId"] = p["id"]
            res[k]["concepts"] = sorted(set(res[k]["concepts"] + p.get("concepts", [])))
            continue
        k = f"pub:{p['id']}"
        pid_map[p["id"]] = k
        add({"id": k, "type": "source", "title": p["title"], "authors": p.get("authors", []),
             "year": int(str(p["publicationDate"])[:4]) if p.get("publicationDate") else None,
             "venue": p.get("source"), "doi": p.get("doi"), "url": p.get("url"),
             "summary": clip(p.get("abstract"), 520) if p.get("abstract") else None,
             "concepts": p.get("concepts", []), "date": p.get("publicationDate"),
             "evidenceType": None, "evidenceLabel": PUBTYPE_LABEL.get(p.get("publicationType"), p.get("publicationType")) + " (evidence type not yet classified)",
             "access": "metadata-only", "read": "Metadata record only; no abstract retrieved.", "limitations": None,
             "attribution": "The Research Observatory (" + str(p.get("provider")) + ")", "reviewStatus": "Awaiting editorial review",
             "preprint": p.get("publicationType") == "preprint", "observatoryId": p["id"],
             "perQuestion": {}, "deskKey": None, "origins": ["The Research Observatory"],
             "classification": "Preliminary: assigned from title and metadata, not from a full reading"})
    for p in pubs:
        k = pid_map[p["id"]]
        res[k].setdefault("obsConcepts", p.get("concepts", []))
        for t in p.get("theories", []):
            edge(k, f"theory:{t}", "Preliminary: assigned by the Observatory from the title and metadata, not from reading the paper", "preliminary", "observatory")
        for qid in p.get("questions", []):
            edge(k, f"q:{qid}", "Preliminary: assigned by the Observatory from the title and metadata, not from reading the paper", "preliminary", "observatory")
    for c in pub_conn:
        a, b = pid_map.get(c["a"]), pid_map.get(c["b"])
        if not (a and b):
            continue
        if c["type"] == "shared_author":
            edge(a, b, c.get("label") or "Shared author", "verified-metadata", "observatory")
        else:
            edge(a, b, c.get("label") or "Shared preliminary concepts", "preliminary", "observatory")

    # concept tagging for sources via the questions/theories that cite them
    for e in list(edges):
        a, b = e["a"], e["b"]
        for x, y in ((a, b), (b, a)):
            if x.startswith("src:") and x in res and y.startswith("q:") and y in res:
                res[x]["concepts"] = sorted(set(res[x]["concepts"] + res[y]["concepts"]))
            if x.startswith("src:") and x in res and y.startswith("theory:") and y in res:
                res[x]["concepts"] = sorted(set(res[x]["concepts"] + [c for c in res[y]["concepts"] if c in tc_concepts]))
    # edges that referenced alias source ids
    for e in edges:
        e["a"] = src_alias.get(e["a"], e["a"]); e["b"] = src_alias.get(e["b"], e["b"])

    # ---------------- Museum rooms ----------------
    for e in museum["eras"]:
        add({"id": f"room:{e['id']}", "type": "museum", "title": e["title"], "summary": clip(e["intro"], 420),
             "concepts": [], "url": f"{SITE}museum/#room-{e['id']}", "date": None, "when": e.get("when"),
             "attribution": "The Museum of Human Memory, Artificially Intelligent", "reviewStatus": "Editorial exhibit", "deskKey": None})
    # museum rooms inherit concepts from the Atlas planets that list them
    for e in edges:
        if e["b"].startswith("room:") and e["a"].startswith("concept:") and e["b"] in res:
            cid = e["a"].split(":", 1)[1]
            res[e["b"]]["concepts"] = sorted(set(res[e["b"]]["concepts"] + [cid]))

    # ---------------- Published articles (from the public manifest) ----------------
    for a in manifest:
        slug = a["url"].rstrip("/").rsplit("/", 1)[-1]
        add({"id": f"art:{slug}", "type": "article", "title": a["title"], "summary": clip(a.get("excerpt"), 420),
             "concepts": list(a.get("topics", [])), "url": a["url"], "date": a.get("publishedAt"),
             "category": a.get("category"), "readingMinutes": a.get("readingMinutes"),
             "attribution": "Artificially Intelligent (original essay)", "reviewStatus": "Published essay; topic tags are editorial",
             "topicSource": a.get("topicSource"), "deskKey": None})

    # concept resources inherit question concepts for retrieval
    for k, r in res.items():
        r["concepts"] = sorted(set(c for c in r.get("concepts", []) if c))

    enrich(res, vocab, root, uq, theories, manifest, dt.date.today().isoformat())

    # validate: all edge endpoints exist
    ids = set(res)
    bad = [e for e in edges if e["a"] not in ids or e["b"] not in ids]
    if bad:
        raise SystemExit("Edges to unknown resources: " + json.dumps(bad[:5]))
    # dedupe edges
    seen, out = set(), []
    for e in edges:
        key = (frozenset((e["a"], e["b"])), e["kind"], e["why"])
        if key in seen:
            continue
        seen.add(key); out.append(e)

    # ---- sanity: every url is absolute https and on a known host
    for r in res.values():
        u = r.get("url")
        assert u is None or u.startswith("https://"), (r["id"], u)

    index = {
        "meta": {
            "generated": dt.date.today().isoformat(),
            "note": "Shared research index. Built only from public, deployed data on this site. Used by the Inquiry Engine and designed for Universal Research Search.",
            "counts": {},
        },
        "resources": list(res.values()),
        "edges": out,
    }
    for r in res.values():
        index["meta"]["counts"][r["type"]] = index["meta"]["counts"].get(r["type"], 0) + 1
    index["meta"]["adapters"] = adapters(root, index["meta"]["counts"])
    vocab_out = {
        "note": "Editorial vocabulary. Aliases are search conveniences; they do not claim that two terms mean the same thing. Links are labelled 'same' (one idea, two names in the site's data) or 'near' (closely related, not identical).",
        "concepts": sorted(vocab.values(), key=lambda v: v["id"]),
        "links": [{"a": a, "b": b, "kind": k} for a, b, k in CONCEPT_LINKS if a in vocab and b in vocab],
        "atlasLinks": [[a, b] for a, b in atlas.get("l", []) if a in vocab and b in vocab],
        "subjects": SUBJECTS,
    }
    missing = [x for a, b, k in CONCEPT_LINKS for x in (a, b) if x not in vocab]
    if missing:
        raise SystemExit("Concept links reference unknown concepts: " + ", ".join(sorted(set(missing))))
    return index, vocab_out


def adapters(root, counts):
    """Adapter contract: each content type declares where its PUBLIC data lives. An adapter is active only when
    that data exists. Inactive adapters add nothing to the index and no link to them is ever produced."""
    def exists(p):
        return (root / p).exists()
    spec = [
        ("Published essays", "article", "research/published/manifest.json", "Public article manifest"),
        ("Research Atlas concepts", "concept", None, "Atlas snapshot"),
        ("Theory Chamber theories and comparisons", "theory", "theory-chamber/data/theories.json", "Theory Chamber data"),
        ("Unanswered Archive questions", "question", "unanswered-archive/data/questions.json", "Archive data"),
        ("Publications (Archive, Theory Chamber, Observatory)", "source", "research-observatory/data/publications.json", "Observatory data"),
        ("Museum of Human Memory rooms", "museum", "museum/data/museum.json", "Museum data"),
        ("Lexicon of Intelligence", None, "lexicon/data/concepts.json", "Not published yet"),
        ("Thinkers Archive", None, "thinkers/data/thinkers.json", "Not published yet"),
        ("Human × Machine Dialogues", None, "dialogues/data/dialogues.json", "Not published yet"),
        ("Public Inquiry Engine pathways", None, "inquiry-engine/data/curated-pathways.json", "No curated pathways published yet"),
    ]
    out = []
    for name, typ, path, note in spec:
        active = bool(typ and counts.get(typ)) if typ else exists(path)
        out.append({"name": name, "active": active, "records": counts.get(typ, 0) if typ else 0, "note": ("Indexed" if typ else "Published, not yet included in search") if active else note})
    return out


def main():
    root = pathlib.Path(sys.argv[1])
    atlas = pathlib.Path(sys.argv[sys.argv.index("--atlas") + 1]) if "--atlas" in sys.argv else root / "inquiry-engine/data/atlas-snapshot.json"
    outdir = pathlib.Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else root / "inquiry-engine/data"
    outdir.mkdir(parents=True, exist_ok=True)
    index, vocab = build(root, atlas)
    json.dump(index, open(outdir / "research-index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(vocab, open(outdir / "concept-relations.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    status = {"generated": index["meta"]["generated"], "counts": index["meta"]["counts"], "adapters": index["meta"]["adapters"],
              "refresh": "Rebuilt by scripts/build_research_index.py. New essays appear after the next rebuild."}
    json.dump(status, open(outdir / "index-status.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("resources:", index["meta"]["counts"], "edges:", len(index["edges"]))


if __name__ == "__main__":
    main()
