import json, re, sys, math, pathlib
sys.path.insert(0,'.')
from c001 import C001, LESSONS_001
from c002 import C002, LESSONS_002
from extra import *
from enrich import E
R = pathlib.Path(sys.argv[1]); OUT = R/"learning-institute"/"data"; OUT.mkdir(parents=True, exist_ok=True)
L = lambda p: json.load(open(R/p))
lexc = {c['id']:c for c in L('lexicon/data/concepts.json')['items']}
lexs = {s['id']:s for s in L('lexicon/data/sources.json')['items']}
idx = {r['id']:r for r in L('inquiry-engine/data/research-index.json')['resources']}
qids = {q['id'] for q in L('unanswered-archive/data/questions.json')['items']}
thids = {t['id'] for t in L('theory-chamber/data/theories.json')['items']}
atl = {c['id'] for c in json.load(open('/home/claude/build/inq/atlas_dump.json'))['c']}
rooms = {r['id'][5:] for r in idx.values() if r['type']=='museum'}
arts = {r['id'] for r in idx.values() if r['type']=='article'}
cmps = {r['id'][4:] for r in idx.values() if r['type']=='comparison'}
errs=[]
used_src=set(); words={}
def word_count(t): return len(re.findall(r"\w+", t))
lessons=[]; assess=[]
for C,LS in ((C001,LESSONS_001),(C002,LESSONS_002)):
    for i,l in enumerate(LS):
        e=E[l['id']]; l=dict(l); l['sections']=list(l['sections'])+[dict(h=e['ex'][0],p=e['ex'][1])]; l['misconceptions']=[dict(wrong=a,right=b) for a,b in e['mis']]
        txt=" ".join([l['intro']]+[p for s in l['sections'] for p in s['p']])
        wc=word_count(txt)
        l=dict(l); l['courseId']=C['id']; l['words']=wc
        l['minutes']=round(wc/180)+4+len(l['check'])
        l['prev']=LS[i-1]['id'] if i else None; l['next']=LS[i+1]['id'] if i<len(LS)-1 else None
        l['reviewStatus']="Awaiting editorial review"; l['reviewed']=C['reviewed']; l['version']="1.0.0"
        for c in l['check']:
            a=dict(c); a['lessonId']=l['id']; a['courseId']=C['id']; assess.append(a)
            for m in re.finditer(r"\[@([^\]]+)\]", json.dumps(a)): pass
        l['check']=[c['id'] for c in l['check']]
        lessons.append(l)
# validate links
def srcrefs(text):
    out=[]
    for m in re.finditer(r"\[@([^\]]+)\]", text):
        out += [x.strip().lstrip('@') for x in m.group(1).split(';')]
    return out
for l in lessons:
    text=json.dumps(l['sections'])+l['intro']
    for s in srcrefs(text): used_src.add(s)
    for s in l['reading']: used_src.add(s)
    for m in re.finditer(r"\{\{(lex|g):([^|}]+)\|", text):
        k,v=m.groups()
        if k=='lex' and v not in lexc: errs.append((l['id'],'lex',v))
        if k=='g' and v not in GLOSSARY: errs.append((l['id'],'g',v))
    cn=l['connections']
    for q in cn['questions']:
        if q not in qids: errs.append((l['id'],'q',q))
    for t in cn['theories']:
        if t not in thids: errs.append((l['id'],'theory',t))
    for a in cn['atlas']:
        if a not in atl: errs.append((l['id'],'atlas',a))
    for m in cn['museum']:
        if m not in rooms: errs.append((l['id'],'museum',m))
    for a in cn['articles']:
        if a not in arts: errs.append((l['id'],'article',a))
    for c in cn.get('comparisons',[]):
        if c not in cmps: errs.append((l['id'],'cmp',c))
    for cc in l['concepts']:
        if cc not in lexc: errs.append((l['id'],'concept',cc))
    if l['openQuestion']['id'] not in qids: errs.append((l['id'],'oq'))
for s in SEMINAR['stages']:
    for r in s.get('sources',[]): used_src.add(r)
for a in assess:
    for s in srcrefs(json.dumps(a)): used_src.add(s)
# sources
sources=[]
for sid in sorted(used_src):
    if sid in NEW_SOURCES:
        d=dict(NEW_SOURCES[sid]); d['id']=sid; d['basis']='Verified for this course'
    elif sid in lexs:
        s=lexs[sid]; d=dict(id=sid,type=s.get('type'),authors=s['authors'],title=s['title'],venue=s.get('venue'),year=s.get('year'),doi=s.get('doi'),url=s.get('url'),kind=s.get('type'),verification=s.get('verification'),basis='Lexicon of Intelligence source record')
    else:
        r=idx.get(sid) or idx.get('src:'+sid)
        if not r: errs.append(('source',sid)); continue
        d=dict(id=sid,type=r.get('evidenceLabel'),authors=r.get('authors'),title=r['title'],venue=r.get('venue'),year=r.get('year'),doi=r.get('doi'),url=r['url'],kind=r.get('evidenceLabel'),preprint=bool(r.get('preprint')) or 'preprint' in (r.get('venue') or '').lower(),verification=r.get('read'),basis='Research Observatory and Archive record')
    sources.append(d)
if errs: print("ERRORS",errs); sys.exit(1)
courses=[]
for C,LS in ((C001,LESSONS_001),(C002,LESSONS_002)):
    ls=[l for l in lessons if l['courseId']==C['id']]
    c=dict(C); c['status']='published'; c['lessons']=[l['id'] for l in ls]; c['lessonCount']=len(ls)
    c['minutes']=sum(l['minutes'] for l in ls); c['hours']=round(c['minutes']/60,1)
    c['durationBasis']="Estimated from word count (about 180 words a minute) plus 4 minutes for the activity and 1 minute per knowledge check."
    c['sources']=sorted({s for l in ls for s in l['reading']})
    courses.append(c)
for P in PLANNED:
    c=dict(P); c['status']='planned'; c['description']="Planned pathway. Not yet written or reviewed, and not available to study."; c['lessons']=[]; c['lessonCount']=0; c['reviewStatus']="Not started"; c['version']=None; c['reviewed']=None; courses.append(c)
W=lambda n,o: json.dump(o,open(OUT/n,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
W('courses.json',dict(meta=dict(generated="2026-10-16",schema=1,note="Only courses with status 'published' are shown as available, indexed for search, or linked to as learning resources."),items=courses))
W('lessons.json',dict(meta=dict(schema=1),items=lessons))
W('assessments.json',dict(meta=dict(schema=1,note="Objective checks have feedback for every option. Reflections show discussion points and are never graded."),items=assess))
W('sources.json',dict(meta=dict(schema=1,note="Every record is a source already verified on this site, or was verified for this course. See each record's verification note."),items=sources))
W('glossary.json',dict(meta=dict(schema=1,note="Terms defined here are for this course only. Lexicon terms are not redefined here; they link to the Lexicon."),items={k:dict(term=v[0],text=v[1],link=(v[2] if len(v)>2 else None)) for k,v in GLOSSARY.items()}))
W('learning-pathways.json',dict(meta=dict(schema=1),edges=EDGES,compass=COMPASS))
W('seminars.json',dict(meta=dict(schema=1),items=[SEMINAR]))
print("lessons",len(lessons),"assessments",len(assess),"sources",len(sources),"words",{c['id']:sum(l['words'] for l in lessons if l['courseId']==c['id']) for c in courses[:2]},"minutes",[ (c['id'],c['minutes']) for c in courses[:2]])

# ---------------- static, crawlable course and lesson pages (progressive enhancement; the interactive app is the main experience) -------------
import html as H
SITE="https://amarisct.github.io/Artificially-Intelligent/"
STAT=R/"learning-institute"/"courses"
import shutil
if STAT.exists(): shutil.rmtree(STAT)
def plain(t, cites):
    t=re.sub(r"\{\{[a-z]+:[^|}]+\|([^}]+)\}\}", r"\1", t)
    def c(m):
        ids=[x.strip().lstrip('@') for x in m.group(1).split(';')]
        for i in ids:
            if i not in cites: cites.append(i)
        return " ["+", ".join(str(cites.index(i)+1) for i in ids)+"]"
    return re.sub(r"\s?\[@([^\]]+)\]", c, t)
E_=H.escape
SRC={s['id']:s for s in sources}
def page(title,desc,canon,body,ld=None):
    ldt='<script type="application/ld+json">'+json.dumps(ld,ensure_ascii=False).replace("</","<\\/")+'</script>' if ld else ''
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E_(title)}</title><meta name="description" content="{E_(desc)}"><link rel="canonical" href="{SITE}{canon}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300&display=swap">
<link rel="stylesheet" href="{'../'*(canon.count('/')-1)}styles.css">{ldt}</head><body>
<a class="skip" href="#main">Skip to content</a><header class="top"><a class="brand" href="{SITE}">Artificially <i>Intelligent</i></a><nav class="site" aria-label="Site"><a href="{SITE}learning-institute/">Learning Institute</a><a href="{SITE}learning-institute/courses/">Courses</a><a href="{SITE}search/">Search</a></nav></header>
<main id="main"><div class="wrap"><div class="prose" style="max-width:72ch">{body}</div></div></main>
<footer>The Learning Institute is not accredited and awards no credit or certification. This is the plain-text version of the lesson; the interactive version has activities, knowledge checks and progress saving.</footer></body></html>'''
def srcli(i,n):
    s=SRC[i]; au=", ".join((s.get('authors') or [])[:4])+(" et al." if len(s.get('authors') or [])>4 else "")
    return f'<li id="r{n}"><a href="{E_(s["url"])}">{E_(s["title"])}</a>. {E_(au)}{" ("+str(s["year"])+")" if s.get("year") else ""}{". "+E_(s["venue"]) if s.get("venue") else ""}</li>'
cl=[]
for c in courses:
    if c['status']!='published': continue
    ls=[l for l in lessons if l['courseId']==c['id']]
    d=STAT/c['slug']; d.mkdir(parents=True,exist_ok=True)
    body=f'<p class="kicker">Course {c["n"]} · {E_(c["level"])}</p><h1>{E_(c["title"])}</h1><p><i>{E_(c["question"])}</i></p><p>{E_(c["description"])}</p><p>About {c["hours"]} hours across {len(ls)} lessons. Version {c["version"]}, last reviewed {c["reviewed"]}. Review status: {E_(c["reviewStatus"])}.</p><h2>Learning objectives</h2><ul>'+"".join(f"<li>{E_(o)}</li>" for o in c['objectives'])+'</ul><h2>Lessons</h2><ol>'+"".join(f'<li><a href="{l["slugpage"]}/">{E_(l["title"])}</a></li>' for l in [dict(x,slugpage=f"{x['n']:02d}-"+re.sub(r"[^a-z0-9]+","-",x['title'].lower()).strip("-")) for x in ls])+f'</ol><p><a href="{SITE}learning-institute/#course-{c["id"]}">Open the interactive course</a></p>'
    (d/'index.html').write_text(page(f"{c['title']} · The Learning Institute",c['description'],f"learning-institute/courses/{c['slug']}/",body,
      {"@context":"https://schema.org","@type":"LearningResource","name":c['title'],"description":c['description'],"educationalLevel":c['level'],"inLanguage":"en","isAccessibleForFree":True,"learningResourceType":"course overview","teaches":c['objectives']}),encoding='utf-8')
    cl.append((c,ls))
    for l in ls:
        slug=f"{l['n']:02d}-"+re.sub(r"[^a-z0-9]+","-",l['title'].lower()).strip("-"); l['staticSlug']=slug
        (d/slug).mkdir(exist_ok=True); cites=[]
        secs="".join(f"<h2>{E_(s['h'])}</h2>"+"".join(f"<p>{E_(plain(p,cites))}</p>" for p in s['p']) for s in l['sections'])
        mis="<h2>Common misunderstandings</h2><ul>"+"".join(f"<li><i>“{E_(m['wrong'])}”</i> {E_(m['right'])}</li>" for m in l['misconceptions'])+"</ul>"
        refs=cites[:]; extra=[r for r in l['reading'] if r not in refs]
        reflist="".join(srcli(i,n+1) for n,i in enumerate(refs))
        extlist="".join(srcli(i,len(refs)+n+1) for n,i in enumerate(extra))
        prev=next((x for x in ls if x['id']==l['prev']),None); nxt=next((x for x in ls if x['id']==l['next']),None)
        def sl(x): return f"{x['n']:02d}-"+re.sub(r"[^a-z0-9]+","-",x['title'].lower()).strip("-")
        nav="".join([f'<a href="../{sl(prev)}/">← {E_(prev["title"])}</a> ' if prev else '', f'<a href="../{sl(nxt)}/">{E_(nxt["title"])} →</a>' if nxt else ''])
        body=f'<p class="crumbs"><a href="../">{E_(c["title"])}</a> / Lesson {l["n"]}</p><p class="kicker">Lesson {l["n"]} of {len(ls)} · about {l["minutes"]} minutes</p><h1>{E_(l["title"])}</h1><p>{E_(plain(l["intro"],cites))}</p><h2>Learning objectives</h2><ul>'+"".join(f"<li>{E_(o)}</li>" for o in l['objectives'])+f'</ul>{secs}{mis}<h2>Reflection question</h2><p><i>{E_(l["reflection"]["prompt"])}</i></p><h2>Open question</h2><p>{E_(l["openQuestion"]["text"])} The Unanswered Archive keeps this question open.</p><h2>Sources</h2><ol>{reflist}</ol>'+(f'<h3>Also recommended</h3><ol start="{len(refs)+1}">{extlist}</ol>' if extra else '')+f'<p><a href="{SITE}learning-institute/#lesson-{l["id"]}"><b>Open the interactive lesson</b></a> with its activity, knowledge checks and progress saving.</p><p>{nav}</p>'
        (d/slug/'index.html').write_text(page(f"{l['title']} · {c['title']} · The Learning Institute",l['intro'][:290],f"learning-institute/courses/{c['slug']}/{slug}/",body,
          {"@context":"https://schema.org","@type":"LearningResource","name":l['title'],"description":l['intro'],"educationalLevel":c['level'],"inLanguage":"en","isAccessibleForFree":True,"learningResourceType":"lesson","teaches":l['objectives'],"isPartOf":{"@type":"LearningResource","name":c['title'],"url":f"{SITE}learning-institute/courses/{c['slug']}/"}}),encoding='utf-8')
idxbody='<p class="kicker">The Learning Institute</p><h1>Courses</h1><p>Plain-text versions of the available courses. The interactive Institute has activities, knowledge checks and progress saving.</p><ul>'+"".join(f'<li><a href="{c["slug"]}/">{E_(c["title"])}</a>: {E_(c["question"])}</li>' for c,_ in cl)+f'</ul><p><a href="{SITE}learning-institute/">Open the Learning Institute</a></p>'
(STAT/'index.html').write_text(page("Courses · The Learning Institute","Available courses in the Learning Institute: Introduction to Consciousness and Foundations of Artificial Intelligence.","learning-institute/courses/",idxbody),encoding='utf-8')
# urls for the sitemap
urls=[SITE+"learning-institute/",SITE+"learning-institute/courses/"]
for c,ls in cl:
    urls.append(SITE+f"learning-institute/courses/{c['slug']}/")
    for l in ls: urls.append(SITE+f"learning-institute/courses/{c['slug']}/{l['staticSlug']}/")
json.dump(urls,open(OUT/'sitemap-urls.json','w'),indent=1)
print("static pages",len(urls))
