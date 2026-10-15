"use strict";
/* The Unanswered Archive. Renders structured JSON with safe DOM construction (no innerHTML for data). */
const ROOT=window.__UA_ROOT__||"../";
const DESKKEY="ai_desk_v1";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const safeHref=u=>{if(!u)return null;return /^(https:\/\/|#|\.\.?\/)/.test(u)?u:null};
function h(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){const v=attrs[k];if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(k==="href"){const s=safeHref(v);if(s)e.setAttribute("href",s)}else if(k==="style")e.style.cssText=v;else e.setAttribute(k,v===true?"":v)}
  for(const kid of kids.flat(Infinity)){if(kid==null||kid===false)continue;e.append(kid.nodeType?kid:document.createTextNode(String(kid)))}return e}
const ext=(href,text,cls)=>h("a",{href,target:"_blank",rel:"noopener noreferrer",class:cls},text);
const say=t=>{const l=$("#live");l.textContent="";setTimeout(()=>l.textContent=t,30)};
let D=null,ARTICLES=[];
const QS=id=>D.questions.find(q=>q.id===id),SRC=id=>D.sources.find(s=>s.id===id),CAT=id=>D.meta.categories.find(c=>c.id===id),ST=id=>D.meta.statuses.find(s=>s.id===id);
const CON=id=>(D.meta.concepts.find(c=>c.id===id)||{name:id}).name,TH=id=>(D.meta.theories.find(t=>t.id===id)||{name:id}).name;
const slugOf=a=>(a.slug||String(a.url||"").replace(/\/+$/,"").split("/").pop());
async function load(){
  if(window.__UA_DATA__){D=window.__UA_DATA__;ARTICLES=((window.__UA_MANIFEST__||{}).articles||[])}
  else{const g=async n=>(await (await fetch("data/"+n+".json",{cache:"no-cache"})).json());
    const [meta,qs,rl,so,hi]=await Promise.all(["meta","questions","question-relations","question-sources","history"].map(g));
    D={meta,questions:qs.items,relations:rl.items,sources:so.items,history:hi.items};
    try{const r=await fetch(ROOT+"research/published/manifest.json",{cache:"no-cache"});if(r.ok){const m=await r.json();if(m&&Array.isArray(m.articles))ARTICLES=m.articles}}catch(e){}}
  ARTICLES=ARTICLES.filter(a=>a&&a.title&&/^[a-z0-9-]+$/.test(slugOf(a)));
}
/* ---------- Reading Desk (browser-local, same store as the main site; only own entries are touched) ---------- */
function deskGet(){try{const d=JSON.parse(localStorage.getItem(DESKKEY)||"null");return d&&Array.isArray(d.items)?d:{items:[],last:null}}catch(e){return {items:[],last:null}}}
function deskSet(d){try{localStorage.setItem(DESKKEY,JSON.stringify(d));return true}catch(e){return false}}
const saved=k=>deskGet().items.some(i=>i.k===k);
function saveBtn(k,label){
  let ok=true;const b=h("button",{class:"btn",type:"button","aria-pressed":String(saved(k))},"");
  const paint=()=>{const s=saved(k);b.setAttribute("aria-pressed",String(s));b.textContent=s?"Saved on this device ✓":label||"Save to Reading Desk"};
  b.addEventListener("click",()=>{const d=deskGet(),i=d.items.findIndex(x=>x.k===k);if(i>=0)d.items.splice(i,1);else d.items.push({k,note:"",coll:"",t:Date.now()});ok=deskSet(d);paint();say(ok?(i>=0?"Removed from Reading Desk":"Saved to Reading Desk, on this browser only"):"Could not save: browser storage is unavailable")});
  paint();return b}
/* ---------- helpers ---------- */
const badge=id=>{const s=ST(id);return h("span",{class:"badge b-"+id,title:s.meaning},s.label)};
const statusBadges=q=>q.status.map(badge);
const fmt=d=>d?new Date(d+"T00:00:00").toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}):"not yet reviewed";
const srcUrl=s=>s.doi?"https://doi.org/"+s.doi:s.url;
const cite=id=>{const s=SRC(id);if(!s)return h("span",{class:"cite"},id);return h("a",{class:"cite",href:srcUrl(s),target:"_blank",rel:"noopener noreferrer",title:s.title,onclick:e=>{const t=document.getElementById("src-"+id);if(t){e.preventDefault();t.open=true;t.scrollIntoView({block:"center"});t.querySelector("summary").focus()}}},s.short)};
const KL=k=>D.meta.kinds[k]||k;
function claimList(items){return h("ul",{class:"claims"},items.map(c=>h("li",null,h("span",{class:"kind k-"+c.kind},KL(c.kind)),h("div",null,c.text),c.src.length?h("div",{class:"cites"},c.src.map(cite)):h("div",{class:"note",style:"margin-top:6px"},"No source attached: shown as an unreviewed proposal."))))}
function relsOf(id){return D.relations.filter(r=>r.a===id||r.b===id).map(r=>({other:r.a===id?r.b:r.a,r}))}
function suggested(q){
  const kws=q.keywords.map(k=>k.toLowerCase()),out=[];
  for(const a of ARTICLES){const hay=((a.title||"")+" "+(a.excerpt||"")).toLowerCase(),tops=(a.topics||[]).map(t=>String(t).toLowerCase());
    const hit=kws.filter(k=>tops.some(t=>t===k||t.startsWith(k))||new RegExp("\\b"+k.replace(/[^a-z ]/g,"")).test(hay));
    if(hit.length)out.push({a,hit:[...new Set(hit)].slice(0,4)})}
  return out}
/* ---------- views ---------- */
function entrance(){
  const rev=D.questions.filter(q=>q.review!=="awaiting").length,n=D.questions.length;
  return h("div",{class:"wrap"},h("section",{class:"hero"},
    h("p",{class:"kicker"},"Artificially Intelligent · Research archive"),
    h("h1",{class:"h-xl"},"THE UNANSWERED ARCHIVE"),
    h("p",{class:"lede"},"An evolving collection of questions at the boundaries of knowledge."),
    h("p",{class:"note",style:"max-width:60ch;font-size:1rem;color:var(--silver)"},"Some questions remain unanswered not because they have been forgotten, but because the methods, evidence, and concepts required to resolve them remain incomplete or contested. The Unanswered Archive explores these questions through science, philosophy, and the developing relationship between human consciousness and artificial intelligence."),
    h("a",{class:"enter",href:"#library"},"Enter the Archive →"),
    h("p",{class:"phil"},"Some questions do not have answers yet. That does not make them any less worth asking."),
    h("div",{class:"stats"},h("span",null,h("b",null,n)," questions in the archive"),h("span",null,h("b",null,rev)," with a reviewed investigation (preview)"),h("span",null,h("b",null,n-rev)," awaiting research review"))),
   h("section",{class:"sec"},h("h2",null,"Where to begin"),h("div",{class:"rel"},
     ...["Q001","Q003","Q008","Q009"].map(id=>{const q=QS(id);return h("a",{class:"r",href:"#q-"+id},h("span",{class:"qid"},id),h("span",{style:"font-family:var(--serif);font-size:1.3rem"},q.title),h("small",null,q.summary))}))),
   h("section",{class:"sec"},h("h2",null,"Four ways in"),h("div",{class:"chips"},h("a",{class:"btn",href:"#library"},"Browse the questions"),h("a",{class:"btn",href:"#network"},"Explore the network"),h("a",{class:"btn",href:"#history"},"Read the history of a question"),h("a",{class:"btn",href:"#status"},"How statuses work"))));
}
const LIB={q:"",cat:"all",st:"all",sort:"subject"};
function library(){
  const inp=h("input",{type:"search",id:"q",value:LIB.q,placeholder:"Search titles, concepts, theories, summaries","aria-label":"Search questions",autocomplete:"off"});
  const sel=h("select",{id:"sort","aria-label":"Sort questions"},[["subject","Sort: subject"],["reviewed","Sort: latest research review"],["added","Sort: date added"]].map(o=>h("option",{value:o[0],selected:LIB.sort===o[0]},o[1])));
  const st=h("select",{id:"stf","aria-label":"Filter by research status"},[h("option",{value:"all"},"All statuses"),...D.meta.statuses.map(s=>h("option",{value:s.id,selected:LIB.st===s.id},s.label))]);
  const cats=h("div",{class:"facet",role:"group","aria-label":"Filter by subject"});const list=h("div",{class:"list","aria-live":"polite"}),count=h("p",{class:"note",role:"status"});
  const cbtn=(id,label)=>h("button",{class:"btn",type:"button","aria-pressed":String(LIB.cat===id),onclick:()=>{LIB.cat=id;draw()}},label);
  function match(q){
    if(LIB.cat!=="all"&&q.category!==LIB.cat)return false;if(LIB.st!=="all"&&!q.status.includes(LIB.st))return false;
    if(!LIB.q.trim())return true;const hay=[q.id,q.title,q.summary,q.subject,...q.concepts.map(CON),...q.theories.map(TH),...q.keywords,...q.status.map(s=>ST(s).label)].join(" ").toLowerCase();
    return LIB.q.toLowerCase().split(/\s+/).filter(Boolean).every(w=>hay.includes(w))}
  function draw(){
    cats.replaceChildren(cbtn("all","All subjects"),...D.meta.categories.map(c=>cbtn(c.id,c.label)));
    let r=D.questions.filter(match);const ci=id=>D.meta.categories.findIndex(c=>c.id===id);
    if(LIB.sort==="subject")r.sort((a,b)=>ci(a.category)-ci(b.category)||a.id.localeCompare(b.id));
    else if(LIB.sort==="reviewed")r.sort((a,b)=>(b.lastReviewed||"").localeCompare(a.lastReviewed||"")||a.id.localeCompare(b.id));
    else r.sort((a,b)=>b.dateCreated.localeCompare(a.dateCreated)||a.id.localeCompare(b.id));
    count.textContent="Showing "+r.length+" of "+D.questions.length+" questions.";
    list.replaceChildren(...(r.length?r.map(qcard):[h("div",{class:"empty"},"No questions match this search and filter. Try fewer words, or clear the filters.")]));
  }
  inp.addEventListener("input",()=>{LIB.q=inp.value;draw()});sel.addEventListener("change",()=>{LIB.sort=sel.value;draw()});st.addEventListener("change",()=>{LIB.st=st.value;draw()});
  const n=h("div",{class:"wrap"},h("p",{class:"kicker"},"The Question Library"),h("h1",{class:"h-l"},"Questions under investigation"),
   h("p",{class:"lede",style:"margin-top:12px"},"Each entry is a research record, not an FAQ item. Statuses describe the state of the question; none is a final answer."),
   h("div",{class:"tools"},h("label",null,"Search",inp),h("label",null,"Status",st),h("label",null,"Sort",sel)),cats,count,list);
  draw();return n}
function qcard(q){
  return h("article",{class:"qcard"+(q.review!=="awaiting"?" rev":"")},
   h("div",{class:"meta"},h("span",{class:"qid"},"QUESTION "+q.id.slice(1)),h("span",null,q.subject),...statusBadges(q)),
   h("h3",null,h("a",{href:"#q-"+q.id},q.title)),h("p",{style:"margin:0;color:var(--silver)"},q.summary),
   h("div",{class:"chips"},q.concepts.slice(0,5).map(c=>h("span",{class:"tag"},CON(c))),q.theories.slice(0,4).map(t=>h("span",{class:"tag"},TH(t).replace(/ Theor(y|ies)( of Consciousness)?/,"")))),
   h("div",{class:"meta"},h("span",null,"Added "+fmt(q.dateCreated)),h("span",null,"Last reviewed: "+fmt(q.lastReviewed))),
   h("div",null,h("a",{class:"btn",href:"#q-"+q.id},"Investigate this question →")));
}
function question(id){
  const q=QS(id);if(!q)return notFound();const I=q.investigation,cat=CAT(q.category);
  const secs=I?[["a","A. Understanding the question"],["b","B. What we currently know"],["c","C. Competing explanations"],["d","D. Evidence and research"],["e","E. What remains unknown"],["f","F. How could it be investigated?"],["g","G. Related questions"],["h","H. Continue exploring"]]:[["g","Related questions"],["h","Continue exploring"]];
  const toc=h("nav",{class:"toc","aria-label":"Sections"},secs.map(s=>h("a",{href:"#q-"+id,onclick:e=>{e.preventDefault();const t=document.getElementById("s-"+s[0]);if(t){t.scrollIntoView({behavior:"smooth"});t.focus({preventScroll:true})}}},s[1])));
  const S=(k,title,...kids)=>h("section",{class:"sec",id:"s-"+k,tabindex:"-1"},h("h2",null,title),...kids);
  const body=[];
  body.push(h("div",{class:"panel statusbox"},h("p",{class:"kicker"},"Research status"),h("div",{class:"chips",style:"margin:8px 0"},statusBadges(q)),
    h("p",{style:"margin:0"},q.statusJustification),h("ul",{class:"note",style:"margin:10px 0 0;padding-left:18px"},q.status.map(s=>h("li",null,h("strong",null,ST(s).label+": "),ST(s).meaning))),
    h("p",{class:"note",style:"margin-top:10px"},"Last reviewed: "+fmt(q.lastReviewed)+" · Added "+fmt(q.dateCreated)+" · "+(I?"Preview review: abstract-level for most sources; each source states what was read.":"Entry not yet reviewed."))));
  if(I){
    body.push(S("a","A. Understanding the question",...I.understand.text.map(t=>h("p",{style:"max-width:70ch"},t)),h("div",{class:"rel",style:"margin-top:14px"},I.understand.terms.map(t=>h("div",{class:"panel"},h("strong",null,t.term),h("p",{style:"margin:6px 0"},t.def),h("div",{class:"cites"},t.src.map(cite)))))));
    body.push(S("b","B. What we currently know",h("p",{class:"note",style:"margin-bottom:12px"},"Each statement is labelled by kind and cites a source. Nothing here is offered as settled unless the source says so."),claimList(I.know)));
    body.push(S("c","C. Competing explanations",h("p",{class:"note",style:"margin-bottom:12px"},I.competingNote),h("div",{class:"rel"},I.competing.map(c=>h("div",{class:"panel"},h("strong",null,c.theory?TH(c.theory):c.label),h("p",{style:"margin:6px 0"},c.text),h("div",{class:"cites"},c.src.map(cite),c.theory?h("a",{class:"cite",href:ROOT+"theory-chamber/#theory-"+c.theory,target:"_blank",rel:"noopener noreferrer"},"Theory Chamber ↗"):null))))));
    body.push(S("d","D. Evidence and research",h("p",{class:"note",style:"margin-bottom:12px"},"Empirical reports, theoretical proposals and philosophical arguments are kept distinct. 'Limitations' states what was and was not read, and known limits of the kind of source."),
      ...I.evidence.map(sid=>{const s=SRC(sid);return h("details",{class:"src",id:"src-"+sid},h("summary",null,h("strong",null,s.title)," · ",s.authors.slice(0,3).join(", ")+(s.authors.length>3?" et al.":"")+" · "+(s.year||"")),
        h("dl",null,h("dt",null,"Kind"),h("dd",null,({review:"Review",comparative:"Adversarial collaboration",foundational:"Theoretical proposal",critical:"Critical examination",secondary:"Secondary source",philosophical:"Philosophical argument",proposal:"Proposal",empirical:"Empirical report"})[s.type]||s.type),
         h("dt",null,"Venue"),h("dd",null,[s.venue,s.volume?"vol. "+s.volume:"",s.pages?"pp. "+s.pages:""].filter(Boolean).join(", ")),
         h("dt",null,s.doi?"DOI":"Verified URL"),h("dd",null,s.doi?ext("https://doi.org/"+s.doi,s.doi):ext(s.url,s.url)),
         h("dt",null,"Relevant findings or arguments"),h("dd",null,I.findings[sid]||s.description),
         h("dt",null,"Limitations"),h("dd",null,I.limits[sid]||"Not yet reviewed."),h("dt",null,"What was read"),h("dd",null,s.read)),
        h("div",{class:"chips",style:"margin-bottom:12px"},saveBtn("source:"+sid,"Save source")))})));
    body.push(S("e","E. What remains unknown",claimList(I.unknown),q.openProblems.length?h("p",{class:"note",style:"margin-top:12px"},"Open problems recorded: "+q.openProblems.join(" · ")):null));
    body.push(S("f","F. How could this question be investigated?",h("p",{class:"note",style:"margin-bottom:12px"},"Published approaches are labelled as such. Proposals are not findings."),claimList(I.investigate)));
  }else body.push(h("div",{class:"empty",style:"margin-top:30px"},h("strong",null,"Awaiting Research Review. "),q.scope," This entry has no evidence, findings, or competing explanations yet, and none have been invented to fill the space."));
  const rels=relsOf(id);
  body.push(S("g",(I?"G. ":"")+"Related questions",rels.length?h("div",{class:"rel"},rels.map(x=>{const o=QS(x.other);return h("a",{class:"r",href:"#q-"+o.id},h("span",null,h("span",{class:"qid"},o.id+" · "+x.r.typeLabel)),h("span",{style:"font-family:var(--serif);font-size:1.2rem"},o.title),h("small",null,x.r.why))})):h("p",{class:"note"},"No related questions recorded yet."),h("p",{class:"note",style:"margin-top:10px"},"Relations are editorial and do not claim that one question causes or answers another. ",h("a",{href:"#network"},"See the network"))));
  const L=I&&I.links||{},sug=suggested(q);
  const links=[];
  if(L.compare)links.push(h("a",{class:"r",href:ROOT+"theory-chamber/#compare-"+L.compare,target:"_blank",rel:"noopener noreferrer"},h("span",null,"Theory Chamber comparison"),h("small",null,L.compare.toUpperCase().replace("-"," vs ")))); 
  (L.theories||[]).forEach(t=>links.push(h("a",{class:"r",href:ROOT+"theory-chamber/#theory-"+t,target:"_blank",rel:"noopener noreferrer"},h("span",null,"Theory: "+TH(t)),h("small",null,"Open in the Theory Chamber"))));
  links.push(h("a",{class:"r",href:ROOT+"#atlas",target:"_blank",rel:"noopener noreferrer"},h("span",null,"Research Atlas"),h("small",null,"Concepts: "+q.concepts.slice(0,4).map(CON).join(", "))));
  links.push(h("a",{class:"r",href:ROOT+"#index",target:"_blank",rel:"noopener noreferrer"},h("span",null,"Intelligence Index"),h("small",null,"Suggested search: "+(L.iq||q.title))));
  if(L.inquiry)links.push(h("a",{class:"r",href:ROOT+"#inquiry-"+L.inquiry,target:"_blank",rel:"noopener noreferrer"},h("span",null,"Inquiry Room path"),h("small",null,"Follow this question through the sources"))); 
  links.push(h("a",{class:"r",href:ROOT+"#evidence",target:"_blank",rel:"noopener noreferrer"},h("span",null,"Evidence Explorer"),h("small",null,"Claims from published essays beside their sources")));
  links.push(h("a",{class:"r",href:ROOT+"#stream",target:"_blank",rel:"noopener noreferrer"},h("span",null,"Data Stream"),h("small",null,"Every entry and its status")));
  if(L.lab)links.push(h("a",{class:"r",href:ROOT+"#lab",target:"_blank",rel:"noopener noreferrer"},h("span",null,"Experiment Lab"),h("small",null,"Thought experiments, not evidence")));
  body.push(S("h",(I?"H. ":"")+"Continue exploring",h("div",{class:"rel"},links),
    h("h3",{style:"margin:26px 0 8px;font-size:1.3rem"},"Possibly related published articles"),
    sug.length?h("div",{class:"rel"},sug.map(s=>h("a",{class:"r",href:ROOT+"#read-"+slugOf(s.a),target:"_blank",rel:"noopener noreferrer"},h("span",null,s.a.title),h("small",null,"Suggested association (automatic, not reviewed). Matched on: "+s.hit.join(", ")+". "+(s.a.publishedAt?"Published "+s.a.publishedAt+".":""))))):h("p",{class:"note"},"No published articles match this question's keywords yet. Matches are suggestions based on titles, excerpts and topics, and a new article never changes a question's status.")));
  return h("div",{class:"wrap"},h("p",{class:"kicker"},h("a",{href:"#library"},"← Question Library")," · "+cat.label),
   h("p",{class:"qid",style:"margin-top:18px"},"QUESTION "+q.id.slice(1)),h("h1",{class:"h-l",style:"margin-top:6px"},q.title),
   h("p",{class:"lede",style:"margin-top:14px"},q.summary),
   h("div",{class:"chips",style:"margin-top:18px"},saveBtn("question:"+id,"Save question to Reading Desk"),h("span",{class:"note",style:"align-self:center"},"Saved in this browser only; it does not sync across devices.")),
   h("div",{class:"qpage"},toc,h("div",null,...body)));
}
function notFound(){return h("div",{class:"wrap"},h("h1",{class:"h-l"},"Not found"),h("p",{class:"note"},"That page is not in the archive."),h("p",null,h("a",{class:"btn",href:"#library"},"Browse the questions")))}
function network(){
  const W=900,H=640,cx=W/2,cy=H/2,R=245;let sel=null,type="all";
  const order=D.meta.categories.map(c=>c.id),qs=[...D.questions].sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category)||a.id.localeCompare(b.id));
  const pos={};qs.forEach((q,i)=>{const a=-Math.PI/2+i*2*Math.PI/qs.length;pos[q.id]={x:cx+R*Math.cos(a),y:cy+R*Math.sin(a),a}});
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox",`0 0 ${W} ${H}`);svg.setAttribute("class","graph");svg.setAttribute("role","group");svg.setAttribute("aria-label","Network of related questions. Use the list below for the same information as text.");
  const panel=h("div",{class:"panel","aria-live":"polite"}),filt=h("div",{class:"facet"});
  const mk=(n,a)=>{const e=document.createElementNS("http://www.w3.org/2000/svg",n);for(const k in a)e.setAttribute(k,a[k]);return e};
  function draw(){
    svg.replaceChildren();
    D.relations.filter(r=>type==="all"||r.type===type).forEach(r=>{const a=pos[r.a],b=pos[r.b];const on=sel&&(r.a===sel||r.b===sel),dim=sel&&!on;
      svg.append(mk("path",{d:`M${a.x},${a.y} Q${cx+(a.x+b.x-2*cx)*.18},${cy+(a.y+b.y-2*cy)*.18} ${b.x},${b.y}`,class:"e"+(on?" on":dim?" dim":"")}))});
    qs.forEach(q=>{const p=pos[q.id],g=mk("g",{class:"n"+(q.review!=="awaiting"?" rev":"")+(sel===q.id?" sel":""),tabindex:"0",role:"button","aria-label":q.id+": "+q.title+(sel===q.id?" (selected)":""),transform:`translate(${p.x},${p.y})`});
      g.append(mk("circle",{r:17}));const t=mk("text",{});t.textContent=q.id.slice(1);g.append(t);
      g.addEventListener("click",()=>pick(q.id));g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(q.id)}});svg.append(g)});
    D.meta.categories.forEach(c=>{const m=qs.filter(q=>q.category===c.id);if(!m.length)return;const mid=m.map(q=>pos[q.id].a).reduce((a,b)=>a+b)/m.length;const r=R+52;const t=mk("text",{x:cx+r*Math.cos(mid),y:cy+r*Math.sin(mid),class:"lab","text-anchor":Math.cos(mid)>.2?"start":Math.cos(mid)<-.2?"end":"middle"});t.textContent=c.label;svg.append(t)});
    filt.replaceChildren(h("button",{class:"btn",type:"button","aria-pressed":String(type==="all"),onclick:()=>{type="all";draw()}},"All connections"),...Object.entries(D.meta.relationTypes).map(([k,v])=>h("button",{class:"btn",type:"button","aria-pressed":String(type===k),onclick:()=>{type=k;draw()}},v)));
    panelDraw()}
  function pick(id){sel=id;draw();say(QS(id).title+" selected")}
  function panelDraw(){
    if(!sel){panel.replaceChildren(h("p",{class:"kicker"},"Select a question"),h("p",{class:"note",style:"margin-top:8px"},"Filled outlines mark questions with a reviewed investigation (preview). Each line is an editorial relation with a stated reason; none claims that one question causes or answers another."));return}
    const q=QS(sel),rs=relsOf(sel).filter(x=>type==="all"||x.r.type===type);
    panel.replaceChildren(h("p",{class:"qid"},q.id),h("h2",{style:"font-size:1.5rem;margin:4px 0 8px"},q.title),h("div",{class:"chips"},statusBadges(q)),
      h("p",{style:"margin:10px 0"},h("a",{class:"btn primary",href:"#q-"+q.id},"Open the investigation →")),
      rs.length?h("div",{class:"rel"},rs.map(x=>{const o=QS(x.other);return h("button",{class:"r",type:"button",style:"text-align:left;background:var(--panel2);cursor:pointer",onclick:()=>pick(o.id)},h("span",{class:"qid"},o.id+" · "+x.r.typeLabel),h("span",null,o.title),h("small",null,x.r.why))})):h("p",{class:"note"},"No connections of this type."))}
  const list=h("details",{class:"sr-only-list"},h("summary",null,"Text list of all connections"),h("ul",null,D.relations.map(r=>h("li",null,r.a+" ("+QS(r.a).title+") ↔ "+r.b+" ("+QS(r.b).title+"): "+r.typeLabel+". "+r.why))));
  const n=h("div",{class:"wrap"},h("p",{class:"kicker"},"Question Network"),h("h1",{class:"h-l"},"How the questions connect"),
   h("p",{class:"lede",style:"margin-top:12px"},"Select a question to see what it connects to and why. Connections are editorial and conceptual."),filt,h("div",{class:"net"},svg,panel),list,
   h("p",{class:"note",style:"margin-top:14px"},"The network is not yet linked into the Research Atlas graph; concepts shown on question pages use the Atlas's names where they exist."));
  draw();return n}
function history(id){
  if(!id){return h("div",{class:"wrap"},h("p",{class:"kicker"},"The History of a Question"),h("h1",{class:"h-l"},"How a question has changed"),
    h("p",{class:"lede",style:"margin:12px 0 22px"},"Documented milestones in the broader scholarly history of a research problem. This is separate from the Living Archive, which records changes to this website and its essays."),
    h("div",{class:"rel"},D.history.map(x=>h("a",{class:"r",href:"#history-"+x.id},h("span",{style:"font-family:var(--serif);font-size:1.4rem"},x.title),h("small",null,x.entries.length+" documented milestones ("+x.entries[0].date+" to "+x.entries[x.entries.length-1].date+")")))))}
  const x=D.history.find(y=>y.id===id);if(!x)return notFound();
  return h("div",{class:"wrap"},h("p",{class:"kicker"},h("a",{href:"#history"},"← The History of a Question")),h("h1",{class:"h-l",style:"margin-top:10px"},x.title),h("p",{class:"note",style:"margin:12px 0"},x.intro),
   h("ol",{class:"tl"},x.entries.map(e=>h("li",null,h("div",{class:"d"},e.date),h("strong",null,e.title),h("p",{style:"margin:4px 0 6px;max-width:64ch"},e.text),h("span",{class:"kind k-"+e.kind},KL(e.kind))," ",h("div",{class:"cites"},cite(e.src))))),
   h("h2",{style:"margin-top:40px;font-size:1.4rem"},"Questions connected to this history"),h("div",{class:"chips",style:"margin-top:10px"},x.related.map(i=>h("a",{class:"btn",href:"#q-"+i},i+" · "+QS(i).title))),
   h("div",{style:"margin-top:30px"},...D.sources.filter(s=>x.entries.some(e=>e.src===s.id)).map(s=>h("details",{class:"src",id:"src-"+s.id},h("summary",null,s.short+" · "+s.title),h("dl",null,h("dt",null,"Source"),h("dd",null,(s.doi?ext("https://doi.org/"+s.doi,s.doi):ext(s.url,s.url))),h("dt",null,"What was read"),h("dd",null,s.read))))));
}
function status(){
  return h("div",{class:"wrap"},h("p",{class:"kicker"},"Research status"),h("h1",{class:"h-l"},"How statuses work"),
   h("p",{class:"lede",style:"margin:12px 0 22px"},"A status describes the state of a question. It is not a score, a ranking, or a measure of consensus, and a question can carry more than one."),
   h("div",{class:"rel"},D.meta.statuses.map(s=>h("div",{class:"panel"},badge(s.id),h("p",{style:"margin:8px 0 0"},s.meaning),h("p",{class:"note",style:"margin-top:8px"},D.questions.filter(q=>q.status.includes(s.id)).length+" questions currently carry this status.")))),
   h("section",{class:"sec"},h("h2",null,"Review, updates and corrections"),h("ul",{class:"claims"},
     h("li",null,"Every status on a reviewed question has a written justification and a last-reviewed date. Entries without a review say so."),
     h("li",null,"A newly published article is only ever shown as a suggested association. It never changes a status, and it is never presented as proving, disproving or resolving a question."),
     h("li",null,"Summaries cite the sources they rest on, and each source states what was and was not read. AI-written explanations are not treated as verified scholarship."),
     h("li",null,"Revision log: 15 October 2026 · first preview, 25 questions, 5 with reviewed investigations, 2 history timelines."),
     h("li",null,"A public route for reporting corrections has not been set up yet, so this page does not offer one."))),
   h("section",{class:"sec"},h("h2",null,"Suggest a question"),h("div",{class:"disabled"},h("p",{style:"margin:0 0 10px"},h("strong",null,"Not available yet.")),h("p",{class:"note"},"Visitor suggestions need a secure submission service with validation, spam prevention and moderation, and none is connected. Rather than show a form that does nothing, this feature is switched off. Nothing would be published without review."),h("p",{style:"margin-top:10px"},h("input",{type:"text",disabled:true,placeholder:"Your question (disabled)","aria-label":"Question (disabled)"})," ",h("button",{class:"btn",disabled:true,type:"button"},"Submit (disabled)")))));
}
function route(){
  if(!D)return;const hs=(location.hash||"#entrance").slice(1);let n,r="entrance";
  if(hs.startsWith("q-")){n=question(hs.slice(2));r="library"}else if(hs==="library"){n=library();r="library"}else if(hs==="network"){n=network();r="network"}
  else if(hs==="history"||hs.startsWith("history-")){n=history(hs.slice(8));r="history"}else if(hs==="status"){n=status();r="status"}else if(hs==="entrance"||!hs)n=entrance();else n=notFound();
  $("#main").replaceChildren(n);$$(".nav a").forEach(a=>a.dataset.r===r?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current"));
  const t=n.querySelector("h1");document.title=(r==="entrance"?"":(t?t.textContent+" · ":""))+"The Unanswered Archive · Artificially Intelligent";window.scrollTo(0,0);$("#main").focus({preventScroll:true})}
addEventListener("hashchange",route);
load().then(()=>{$("#brand").href=ROOT;$("#f-main").href=ROOT;$("#f-lib").href=ROOT+"#library";$("#f-tc").href=ROOT+"theory-chamber/";$("#f-atlas").href=ROOT+"#atlas";route()}).catch(e=>{$("#main").replaceChildren(h("p",{class:"wrap note"},"The archive data could not be loaded. "+e.message))});
