#!/usr/bin/env python3
"""Validates unanswered-archive/data. Exit 1 on any error. Warnings are informational."""
import json,sys,os,re
D=os.path.join(os.path.dirname(__file__),'..','unanswered-archive','data')
L=lambda n:json.load(open(os.path.join(D,n+'.json')))
meta=L('meta');Q=L('questions')['items'];R=L('question-relations')['items'];S=L('question-sources')['items'];H=L('history')['items']
err=[];warn=[]
E=lambda m:err.append(m);W=lambda m:warn.append(m)
sid={s['id'] for s in S};qid=[q['id'] for q in Q];st={s['id'] for s in meta['statuses']};cat={c['id'] for c in meta['categories']}
kinds=set(meta['kinds']);con={c['id'] for c in meta['concepts']};th={t['id'] for t in meta['theories']}
if len(set(qid))!=len(qid):E("duplicate question ids")
if len({q['slug'] for q in Q})!=len(Q):E("duplicate slugs")
for q in Q:
    i=q['id']
    if not re.fullmatch(r'Q\d{3}',i):E(i+": bad id")
    if q['category'] not in cat:E(i+": unknown category")
    for s in q['status']:
        if s not in st:E(i+": unknown status "+s)
    for c in q['concepts']:
        if c not in con:E(i+": unknown concept "+c)
    for t in q['theories']:
        if t not in th:E(i+": unknown theory "+t)
    for r in q['related']:
        if r not in qid:E(i+": unknown related "+r)
    if not q['statusJustification']:E(i+": no status justification")
    if not q['dateCreated']:E(i+": no date created")
    I=q['investigation']
    if I is None:
        if q['status']!=['awaiting']:E(i+": unreviewed entry must be Awaiting Research Review only")
        if q['lastReviewed']:E(i+": unreviewed entry has a review date")
        W(i+": awaiting research review (no investigation)")
    else:
        if 'awaiting' in q['status']:E(i+": reviewed entry still marked awaiting")
        if not q['lastReviewed']:E(i+": reviewed entry has no review date")
        for sec in ('know','unknown','investigate'):
            for c in I[sec]:
                if c['kind'] not in kinds:E(i+": bad kind")
                for s in c['src']:
                    if s not in sid:E(i+": claim cites unknown source "+s)
                if not c['src'] and c['kind'] not in ('speculative','unreviewed'):E(i+": sourced kind without source: "+c['text'][:50])
        for c in I['competing']:
            for s in c['src']:
                if s not in sid:E(i+": competing cites unknown "+s)
        for s in I['evidence']:
            if s not in sid:E(i+": evidence unknown source "+s)
            if s not in I['findings'] or s not in I['limits']:E(i+": evidence "+s+" lacks findings or limitations")
        for t in I['understand']['terms']:
            for s in t['src']:
                if s not in sid:E(i+": term cites unknown "+s)
        if I['links'].get('compare') and not re.fullmatch(r'[a-z]+-[a-z]+',I['links']['compare']):E(i+": bad comparison id")
rel_pairs=set()
for r in R:
    if r['a'] not in qid or r['b'] not in qid:E("relation to unknown question "+str(r))
    if r['a']==r['b']:E("self relation")
    if r['type'] not in meta['relationTypes']:E("unknown relation type")
    if not r['why'].strip():E("relation without explanation")
    k=tuple(sorted((r['a'],r['b'])))
    if k in rel_pairs:E("duplicate relation "+str(k))
    rel_pairs.add(k)
for q in Q:
    for o in q['related']:
        if tuple(sorted((q['id'],o))) not in rel_pairs:E(q['id']+": related list not backed by a relation")
for s in S:
    for f in ('id','title','authors','year','url','read','description','access'):
        if not s.get(f):E("source "+s.get('id','?')+" missing "+f)
    if not str(s['url']).startswith('https://'):E("source "+s['id']+": non-https url")
    if s['access'] in('metadata-only','summary-only','secondary-web'):W("source "+s['id']+": limited reading ("+s['access']+")")
for h in H:
    for e in h['entries']:
        if e['src'] not in sid:E("history cites unknown source "+e['src'])
        if not e['date'] or not e['text']:E("history entry incomplete")
    for r in h['related']:
        if r not in qid:E("history related unknown "+r)
for w in warn:print("WARN",w)
for e in err:print("ERROR",e)
print("RESULT:","PASS" if not err else "FAIL","(%d errors, %d warnings)"%(len(err),len(warn)))
sys.exit(1 if err else 0)
