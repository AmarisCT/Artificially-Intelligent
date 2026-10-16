"use strict";
const ROOT=window.OBS_ROOT||"../";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function h(t,a,...k){const e=document.createElement(t);for(const[n,v]of Object.entries(a||{})){if(v==null||v===false)continue;if(n==="class")e.className=v;else if(n.startsWith("on"))e.addEventListener(n.slice(2),v);else e.setAttribute(n,v===true?"":v)}for(const c of k.flat(9))if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));return e}
const NS="http://www.w3.org/2000/svg";
function s(t,a,...k){const e=document.createElementNS(NS,t);for(const[n,v]of Object.entries(a||{})){if(v==null)continue;if(n.startsWith("on"))e.addEventListener(n.slice(2),v);else e.setAttribute(n,v)}for(const c of k.flat(9))if(c!=null)e.append(c.nodeType?c:document.createTextNode(String(c)));return e}
const safeHref=u=>/^https:\/\/(doi\.org|plato\.stanford\.edu)\//.test(u||"")?u:"#";
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let D=null;const F={q:"",disc:new Set(),cat:"",sort:"az"};
const CB=id=>D.concepts.find(c=>c.id===id),SRC=id=>D.src.find(x=>x.id===id);
const DN=d=>D.meta.disciplines[d]||d;
async function load(){
  if(window.__LEX){D=window.__LEX;return}
  const g=async f=>{const r=await fetch("data/"+f);if(!r.ok)throw new Error(f);return r.json()};
  const[c,d,r,so,di]=await Promise.all(["concepts.json","definitions.json","relationships.json","sources.json","distinctions.json"].map(g));
  D={concepts:c.items,meta:c.meta,defs:d,rel:r.items,relTypes:r.types,src:so.items,srcMeta:so.meta,dist:di.items,qt:{},th:{}};
  try{const q=await (await fetch(ROOT+"unanswered-archive/data/questions.json")).json();q.items.forEach(x=>D.qt[x.id]=x.title)}catch(e){}
  try{const q=await (await fetch(ROOT+"theory-chamber/data/theories.json")).json();q.items.forEach(x=>D.th[x.id]=x.name)}catch(e){}
}
const saved=()=>LS.get("lex_saved_v1",{items:[]});
function toggleSave(id){const v=saved(),i=v.items.findIndex(x=>x.id===id);i<0?v.items.push({id,note:""}):v.items.splice(i,1);LS.set("lex_saved_v1",v)}
function setNote(id,note){const v=saved(),x=v.items.find(y=>y.id===id);if(x){x.note=note;LS.set("lex_saved_v1",v)}}
const isSaved=id=>saved().items.some(x=>x.id===id);
function shell(){const L=[["Home",ROOT],["Research Atlas",ROOT+"#atlas"],["Theory Chamber",ROOT+"theory-chamber/"],["Unanswered Archive",ROOT+"unanswered-archive/"],["Research Observatory",ROOT+"research-observatory/"]];$("#site").replaceChildren(...L.map(([t,u])=>h("a",{href:u},t)));$("#brand").href=ROOT}
function lexNav(cur){return h("nav",{class:"tabs","aria-label":"Lexicon sections"},[["library","Concept Library"],["compare","Definition Comparator"],["network","Semantic Network"],["distinctions","Not the Same Thing"],["saved","My vocabulary"]].map(([k,t])=>h("button",{type:"button","aria-selected":String(k===cur),onclick:()=>{location.hash=k}},t)))}
const wrap=(...k)=>h("div",{class:"wrap"},...k);
function cites(ids){const u=(ids||[]);return u.length?h("div",{class:"cites","aria-label":"Sources"},u.map(i=>{const x=SRC(i);return x?h("a",{class:"cite",href:"#c-"+(CUR||"x")+"-ref-"+i,onclick:e=>{e.preventDefault();const el=document.getElementById("ref-"+i);if(el){const d=el.closest("details");if(d)d.open=true;el.scrollIntoView({block:"center"});el.focus()}}},x.authors[0].split(" ").pop()+(x.authors.length>1&&x.type!=="reference-work"?" et al.":"")+" "+x.year):null})):h("p",{class:"nosrc"},"No source attached to this sense yet.")}
let CUR=null;
function badge(c){return h("span",{class:"bd pre"},c.status)}
/* ---------- entrance ---------- */
function entrance(){
  const alpha=h("div",{class:"alpha"});
  $("#main").replaceChildren(wrap(h("div",{class:"hero",style:"min-height:50vh"},h("div",null,h("p",{class:"kicker"},"Artificially Intelligent · Lexicon preview"),h("h1",null,"THE LEXICON OF INTELLIGENCE"),h("p",{class:"sub"},"An evolving vocabulary of consciousness, intelligence, and the human-machine boundary."),
    h("p",{class:"lede"},"The language we use to describe the mind shapes the questions we ask about it."),
    h("p",{class:"lede",style:"font-size:18px"},"Across philosophy, neuroscience, cognitive science, and artificial intelligence, familiar words often acquire different meanings. The Lexicon of Intelligence explores those definitions, their intellectual histories, and the relationships between the concepts that shape our understanding of human and machine intelligence."),
    h("a",{class:"btn primary",href:"#library"},"Enter the Lexicon →")),
   h("div",{class:"panel"},h("p",{class:"kicker"},"One word, several fields"),h("h2",null,"What does understanding mean?"),h("p",{class:"meta"},"Philosophy asks what it requires. AI research asks how to test it. Cognitive science asks how symbols get their meaning."),h("a",{class:"btn",href:"#compare-understanding"},"Compare the definitions"))),
   h("div",{class:"strip"},h("span",{class:"dot","aria-hidden":"true"}),h("b",null,"Preview status. "),"This first release has "+D.concepts.length+" entries. Each is original text with verified sources and is awaiting research review. No entry has been reviewed yet.")));
  document.title="The Lexicon of Intelligence · Artificially Intelligent"}
/* ---------- library ---------- */
function filtered(){const q=F.q.trim().toLowerCase();
  return D.concepts.filter(c=>{if(F.disc.size&&!c.disciplines.some(d=>F.disc.has(d)))return false;if(F.cat&&c.category!==F.cat)return false;
    if(q){const hay=[c.term,c.alt.join(" "),c.abbr||"",c.intro,c.category,c.disciplines.map(DN).join(" "),c.confused.map(x=>(CB(x)||{}).term).join(" "),c.questions.map(x=>D.qt[x]||x).join(" ")].join(" ").toLowerCase();if(!q.split(/\s+/).every(w=>hay.includes(w)))return false}return true})
   .sort((a,b)=>F.sort==="rev"?((b.lastReviewed||"").localeCompare(a.lastReviewed||"")||a.term.localeCompare(b.term)):a.term.localeCompare(b.term))}
function library(){
  const q=h("input",{type:"search",placeholder:"Search terms, alternative names, disciplines, questions","aria-label":"Search the Lexicon",value:F.q});
  q.addEventListener("input",()=>{F.q=q.value;clearTimeout(q._t);q._t=setTimeout(()=>{list(true)},150)});
  const cat=h("select",{"aria-label":"Category"},h("option",{value:""},"All categories"),...D.meta.categories.map(c=>h("option",{value:c,selected:F.cat===c},c)));cat.addEventListener("change",()=>{F.cat=cat.value;list()});
  const sort=h("select",{"aria-label":"Sort"},h("option",{value:"az",selected:F.sort==="az"},"Alphabetical"),h("option",{value:"rev",selected:F.sort==="rev"},"Recently reviewed"));sort.addEventListener("change",()=>{F.sort=sort.value;list()});
  const chips=h("div",{class:"row",role:"group","aria-label":"Disciplines"},h("label",{class:"l"},"Discipline"),...Object.entries(D.meta.disciplines).map(([k,v])=>h("button",{class:"chip",type:"button","aria-pressed":String(F.disc.has(k)),onclick:()=>{F.disc.has(k)?F.disc.delete(k):F.disc.add(k);library()}},v)));
  const out=h("div",{id:"liblist"});
  $("#main").replaceChildren(wrap(h("p",{class:"kicker"},"The Lexicon of Intelligence"),h("h1",{style:"font-size:clamp(30px,4.5vw,48px)"},"Concept Library"),lexNav("library"),h("div",{class:"filters"},h("div",{class:"row"},q,cat,sort),chips),out));
  list();document.title="Concept Library · The Lexicon of Intelligence"}
function list(keep){const L=filtered(),o=$("#liblist");if(!o)return;const fx=keep&&document.activeElement&&document.activeElement.type==="search",p=fx?document.activeElement.selectionStart:0;
  const az=h("div",{class:"alpha","aria-label":"Jump to letter"},[...new Set(L.map(c=>c.term[0].toUpperCase()))].sort().map(l=>h("a",{href:"#lib-"+l.toLowerCase(),onclick:e=>{e.preventDefault();const t=document.getElementById("a-"+l);t&&t.scrollIntoView()}},l)));
  o.replaceChildren(h("p",{class:"count",role:"status"},L.length+" of "+D.concepts.length+" entries"+(F.sort==="rev"?". No entry has been reviewed yet, so entries stay in alphabetical order.":"")),L.length?h("div",null,F.sort==="az"?az:null,h("div",{class:"grid3"},L.map(c=>h("article",{class:"ccard",id:"a-"+c.term[0].toUpperCase()},h("p",{class:"lexid"},c.lexId),h("h3",{style:"font-size:26px;margin:0"},h("a",{href:"#c-"+c.id},c.term)),h("p",{class:"meta"},c.intro),h("div",{class:"badges"},c.disciplines.map(d=>h("span",{class:"bd"},DN(d))),badge(c)),c.multipleMeanings?h("p",{class:"meta",style:"color:var(--amber)"},"Several meanings across fields"):null,h("div",{class:"acts"},h("a",{class:"btn sm primary",href:"#c-"+c.id},"Read the entry")))))):h("div",{class:"empty"},h("p",null,"No entries match."),h("p",{class:"meta"},"The Lexicon holds "+D.concepts.length+" entries. Clear filters or search a different word.")));
  if(fx){const q=$("input[type=search]");q.focus();q.setSelectionRange(p,p)}}
/* ---------- entry ---------- */
function relFor(id){return D.rel.filter(r=>r.a===id||r.b===id).map(r=>({o:r.a===id?r.b:r.a,r,dir:r.a===id}))}
function typeLabel(r,dir){if(r.type==="narrower")return dir?"Narrower concept":"Broader concept";if(r.type==="broader")return dir?"Broader concept":"Narrower concept";return D.relTypes[r.type]}
function entry(id){
  const c=CB(id),m=$("#main");if(!c){m.replaceChildren(wrap(h("h1",null,"Entry not found"),h("p",null,h("a",{href:"#library"},"Back to the Concept Library"))));return}
  CUR=id;const defs=D.defs[id],rels=relFor(id),sv=isSaved(id);
  const sec=(t,open,...k)=>h("details",{class:"sec2",open:open?"":null},h("summary",null,t),h("div",{style:"padding:0 0 18px"},...k));
  const refs=c.references.map(SRC).filter(Boolean);
  const dist=D.dist.filter(d=>d.a===id||d.b===id);
  m.replaceChildren(wrap(h("a",{href:"#library"},"← Concept Library"),h("div",{class:"entry",style:"margin-top:18px"},
   h("div",null,h("p",{class:"lexid"},c.lexId),h("h1",{class:"term"},c.term),c.alt.length?h("p",{class:"meta"},"Also: "+c.alt.join("; ")):null,
    h("div",{class:"badges",style:"margin:6px 0 16px"},badge(c),h("span",{class:"bd"},c.category)),
    h("p",{class:"lede"},c.intro),c.multipleMeanings?h("p",{class:"note"},"This term has several widely used meanings. They are not interchangeable, and no single definition is presented as the definition."):null,
    h("p",{class:"note"},c.statusNote),
    sec("A. The essential definition",true,h("p",null,c.intro),h("p",{class:"meta"},"This is a short orientation, not a settled definition. The next section shows how fields use the word.")),
    sec("B. Across the disciplines",true,defs.map(d=>h("div",{class:"sn"},h("h3",null,DN(d.discipline)),h("p",null,d.text),d.contested?h("p",{class:"meta"},h("b",null,"Contested: "),d.contested):null,cites(d.sources)))),
    c.history.length?sec("C. Historical development",false,c.historyNote?h("p",{class:"meta"},c.historyNote):null,h("ol",{class:"hist"},c.history.map(x=>h("li",null,h("b",null,x.period+" · "+x.who),h("p",{class:"meta",style:"margin:4px 0"},x.text),cites([x.src]))))):null,
    c.interpretations.length?sec("D. Major interpretations",false,c.interpretations.map(x=>h("div",{class:"sn"},h("h3",null,x.name),h("p",null,x.text),cites(x.src)))):null,
    c.misconceptions.length?sec("E. Common misconceptions",false,c.misconceptions.map(x=>h("div",{class:"sn"},h("p",null,x.text),cites(x.src)))):null,
    sec("F. Connected concepts",true,rels.length?h("ul",{class:"rel"},rels.map(({o,r,dir})=>h("li",null,h("span",{class:"rt "+r.type},typeLabel(r,dir)),h("div",null,h("a",{href:"#c-"+o},CB(o).term),h("div",{class:"meta"},r.note),cites(r.basis))))):h("p",{class:"meta"},"No connections recorded."),dist.length?h("p",{style:"margin-top:14px"},"Distinctions: ",dist.map((d,i)=>h("span",null,i?" · ":"",h("a",{href:"#d-"+d.id},d.title)))):null),
    sec("G. Research references",false,h("ul",{class:"plain"},refs.map(x=>h("li",{id:"ref-"+x.id,tabindex:"-1"},h("div",null,x.authors.slice(0,3).join(", ")+(x.authors.length>3?" et al.":"")+" ("+x.year+"). "),h("div",null,h("i",null,x.title),". "+x.venue+"."),x.authorsNote?h("div",{class:"meta"},x.authorsNote):null,h("div",{class:"meta"},(x.type==="preprint"?"Preprint, not peer reviewed. ":"")+(x.type==="reference-work"?"Reference work. ":"")+x.verification),h("a",{href:safeHref(x.url),target:"_blank",rel:"noopener"},x.doi?"DOI "+x.doi:"Open the entry")))),
      h("p",{class:"meta"},"Reference-work entries are cited, not copied. The explanations on this page are original text.")),
    sec("H. Continue exploring",true,h("div",{class:"grid2"},
      h("div",null,h("h3",null,"Research Atlas"),h("div",{class:"row"},c.atlas.map(a=>h("a",{class:"btn sm",href:ROOT+"#dossier-"+a,target:"_blank",rel:"noopener"},"Atlas: "+a.replace(/-/g," ")+" →"))),
       c.theories.length?h("h3",{style:"margin-top:18px"},"Theory Chamber"):null,h("div",{class:"row"},c.theories.map(t=>h("a",{class:"btn sm",href:ROOT+"theory-chamber/#theory-"+t,target:"_blank",rel:"noopener"},(D.th[t]||t.toUpperCase())+" →")))),
      h("div",null,h("h3",null,"Unanswered Archive"),h("ul",{class:"plain"},c.questions.map(q=>h("li",null,h("a",{href:ROOT+"unanswered-archive/#q-"+q,target:"_blank",rel:"noopener"},q+(D.qt[q]?": "+D.qt[q]:"")))))),
      h("div",{style:"grid-column:1/-1"},h("div",{class:"row"},defs.length>1?h("a",{class:"btn",href:"#compare-"+id},"Compare definitions across disciplines"):null,h("a",{class:"btn",href:ROOT+"research-observatory/",target:"_blank",rel:"noopener"},"Research Observatory"),h("button",{class:"btn",type:"button","aria-pressed":String(sv),onclick:()=>{toggleSave(id);entry(id)}},sv?"Saved to my vocabulary":"Save to my vocabulary")),
       h("p",{class:"meta",style:"margin-top:10px"},"Related original articles: none are associated yet. When the site connects articles to terms, matches will appear here labelled as suggested until reviewed.")))
    )),
   h("aside",{class:"aside","aria-label":"Entry summary"},h("div",{class:"panel"},h("p",{class:"kicker"},"Review"),h("h3",null,c.status),h("p",{class:"meta"},"Date last reviewed: "+(c.lastReviewed||"not yet reviewed")),h("p",{class:"meta"},"Added: "+c.dateAdded),h("p",{class:"meta"},"Revision history: "+(c.revisions.length?c.revisions.length+" recorded":"none recorded"))),
    h("div",{class:"panel"},h("p",{class:"kicker"},"Fields using this term"),h("div",{class:"badges"},c.disciplines.map(d=>h("span",{class:"bd"},DN(d))))),
    h("div",{class:"panel"},h("p",{class:"kicker"},"Not the same as"),c.confused.length?h("div",{class:"row"},c.confused.map(x=>h("a",{class:"btn sm",href:"#c-"+x},CB(x).term))):h("p",{class:"meta"},"None recorded.")))))); 
  document.title=c.term+" · The Lexicon of Intelligence";window.scrollTo(0,0)}
/* ---------- comparator ---------- */
let CMP={id:"understanding",a:0,b:1};
function compare(id){
  if(id&&CB(id)&&D.defs[id].length>1&&CMP.id!==id)CMP={id,a:0,b:1};const id2=CMP.id,defs=D.defs[id2],c=CB(id2);
  const sel=(k)=>{const x=h("select",{"aria-label":"Discipline "+(k==="a"?"A":"B")},defs.map((d,i)=>h("option",{value:i,selected:CMP[k]===i},DN(d.discipline))));x.addEventListener("change",()=>{CMP[k]=+x.value;compare()});return x};
  const cs=h("select",{"aria-label":"Term"},D.concepts.filter(x=>D.defs[x.id].length>1).map(x=>h("option",{value:x.id,selected:x.id===id2},x.term)));cs.addEventListener("change",()=>{CMP={id:cs.value,a:0,b:1};compare()});
  const A=defs[CMP.a],B=defs[CMP.b],row=(l,f)=>[h("div",null,l),h("div",null,f(A)),h("div",null,f(B))];
  const val=(k)=>d=>d[k]?d[k]:h("span",{class:"empt"},"Not yet written for this field.");
  const body=[h("div",{class:"h"},"Field"),h("div",{class:"h"},sel("a")),h("div",{class:"h"},sel("b")),
    ...row("Defined as",d=>h("span",null,d.text)),...row("Studied or measured",val("measured")),...row("Assumes",val("assumes")),...row("Contested",val("contested")),...row("Sources",d=>cites(d.sources))].flat();
  $("#main").replaceChildren(wrap(h("p",{class:"kicker"},"The Lexicon of Intelligence"),h("h1",{style:"font-size:clamp(30px,4.5vw,48px)"},"Definition Comparator"),lexNav("compare"),
    h("div",{class:"row",style:"margin-bottom:6px"},h("label",{class:"l"},"Term"),cs),h("h2",{style:"margin-top:16px"},"What does "+c.term.toLowerCase()+" mean?"),h("p",{class:"meta"},"One word, several research perspectives. Pick two fields to compare."),
    CMP.a===CMP.b?h("p",{class:"note"},"Both columns show the same field. Choose a second field to compare."):null,
    h("div",{class:"cmp"},body),
    h("div",{class:"interp",style:"margin-top:18px"},h("p",{class:"kicker"},"Where they overlap and differ"),c.comparison?h("div",null,h("p",null,h("b",null,"Overlap. "),c.comparison.overlap),h("p",null,h("b",null,"Difference. "),c.comparison.differ)):h("p",{class:"meta"},"An overlap and difference note has not been written for this term yet.")),
    h("p",{class:"meta"},"Definitions are original summaries tied to cited sources and are awaiting research review. Where fields use compatible definitions, the comparison says so.")," ",h("a",{href:"#c-"+id2},"Read the full entry for "+c.term+" →")));
  document.title="Definition Comparator · The Lexicon of Intelligence"}
/* ---------- network ---------- */
const NS_={f:"",t:new Set(),sel:null,vb:[0,0,1000,640]};
const RC={related:"#8fe9c4",theoretical:"#9fc9e8",confused:"#e9c98a",disputed:"#e8a6a0",narrower:"#c3ccc9",broader:"#c3ccc9",historical:"#cfa4f0"};
function netpos(){const P={"consciousness":[500,190],"subjective-experience":[250,110],"awareness":[760,110],"sentience":[200,290],"intelligence":[500,380],"cognition":[780,300],"artificial-intelligence":[500,560],"understanding":[260,470],"meaning":[100,570],"memory":[900,420],"identity":[880,560],"agency":[720,560]};const pos={};D.concepts.forEach((c,i)=>{pos[c.id]=P[c.id]||[100+(i%6)*160,620-Math.floor(i/6)*60]});return pos}
function network(){
  const pos=netpos(),q=NS_.f.trim().toLowerCase(),hit=c=>q&&(c.term+" "+c.alt.join(" ")).toLowerCase().includes(q);
  const svg=s("svg",{class:"net",viewBox:NS_.vb.join(" "),role:"group","aria-label":"Semantic network of Lexicon terms. A list alternative follows."});
  const rels=D.rel.filter(r=>!NS_.t.size||NS_.t.has(r.type));
  rels.forEach(r=>{const A=pos[r.a],B=pos[r.b],sel=NS_.sel&&(r.a===NS_.sel||r.b===NS_.sel);svg.append(s("line",{x1:A[0],y1:A[1],x2:B[0],y2:B[1],stroke:RC[r.type],"stroke-width":sel?2.4:1.2,opacity:NS_.sel&&!sel?".15":".75","stroke-dasharray":r.type==="confused"?"6 4":r.type==="disputed"?"2 4":null},s("title",null,D.relTypes[r.type]+": "+CB(r.a).term+" / "+CB(r.b).term+". "+r.note)))});
  D.concepts.forEach(c=>{const[x,y]=pos[c.id],on=NS_.sel===c.id,hl=hit(c);svg.append(s("g",{class:"nd",tabindex:"0",role:"button","aria-label":c.term,"aria-pressed":String(on),transform:`translate(${x} ${y})`,onclick:()=>{NS_.sel=c.id;network()},onkeydown:e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();NS_.sel=c.id;network()}}},
    s("circle",{r:on?15:11,fill:hl?"#fff":on?"#8fe9c4":"#1d2a26",stroke:"#8fe9c4","stroke-width":hl?3:1.5}),s("text",{y:-19,"text-anchor":"middle"},c.term)))});
  const set=v=>{NS_.vb=v;svg.setAttribute("viewBox",v.join(" "))},zoom=f=>{const[x,y,w,hh]=NS_.vb,nw=Math.min(1000,Math.max(260,w*f)),nh=nw*.64;set([Math.max(0,Math.min(1000-nw,x+(w-nw)/2)),Math.max(0,Math.min(640-nh,y+(hh-nh)/2)),nw,nh])};
  let drag=null;svg.addEventListener("pointerdown",e=>{if(e.target.closest(".nd"))return;drag={x:e.clientX,y:e.clientY,vb:[...NS_.vb]};svg.setPointerCapture(e.pointerId)});
  svg.addEventListener("pointermove",e=>{if(!drag)return;const r=svg.getBoundingClientRect(),[x,y,w,hh]=drag.vb;set([Math.max(0,Math.min(1000-w,x-(e.clientX-drag.x)/r.width*w)),Math.max(0,Math.min(640-hh,y-(e.clientY-drag.y)/r.height*hh)),w,hh])});svg.addEventListener("pointerup",()=>drag=null);
  const search=h("input",{type:"search",placeholder:"Find a term in the network","aria-label":"Find a term",value:NS_.f});search.addEventListener("input",()=>{NS_.f=search.value;clearTimeout(search._t);search._t=setTimeout(()=>{network();const q2=$("input[type=search]");q2&&(q2.focus(),q2.setSelectionRange(99,99))},200)});
  const chips=h("div",{class:"row",role:"group","aria-label":"Relationship types"},Object.entries(D.relTypes).filter(([k])=>D.rel.some(r=>r.type===k)).map(([k,v])=>h("button",{class:"chip",type:"button","aria-pressed":String(NS_.t.has(k)),onclick:()=>{NS_.t.has(k)?NS_.t.delete(k):NS_.t.add(k);network()}},h("i",{style:"background:"+RC[k]}),v)));
  const c=NS_.sel&&CB(NS_.sel);
  const panel=h("div",{class:"panel"},c?h("div",null,h("p",{class:"kicker"},"Selected term"),h("h3",null,c.term),h("p",{class:"meta"},c.intro),h("ul",{class:"plain"},relFor(c.id).filter(x=>!NS_.t.size||NS_.t.has(x.r.type)).map(({o,r,dir})=>h("li",null,h("span",{class:"rt "+r.type},typeLabel(r,dir)),h("div",null,h("a",{href:"#c-"+o},CB(o).term),h("div",{class:"meta"},r.note))))),h("a",{class:"btn primary",href:"#c-"+c.id},"Open the entry")):h("p",{class:"meta"},"Select a term to see its connections. Line styles show the kind of relationship. They are not all equivalent."));
  const lg=h("div",{class:"legend"},Object.entries(D.relTypes).filter(([k])=>D.rel.some(r=>r.type===k)).map(([k,v])=>h("span",null,s("svg",{width:30,height:8,"aria-hidden":"true"},s("line",{x1:0,y1:4,x2:30,y2:4,stroke:RC[k],"stroke-width":2,"stroke-dasharray":k==="confused"?"6 4":k==="disputed"?"2 4":null})),v)));
  const lst=h("details",{style:"margin-top:18px"},h("summary",{style:"cursor:pointer;min-height:44px;display:flex;align-items:center"},"List alternative: every relationship"),h("ul",{class:"plain"},rels.map(r=>h("li",null,h("span",{class:"rt "+r.type},D.relTypes[r.type]),h("div",null,h("a",{href:"#c-"+r.a},CB(r.a).term)," ↔ ",h("a",{href:"#c-"+r.b},CB(r.b).term)),h("div",{class:"meta"},r.note)))));
  $("#main").replaceChildren(wrap(h("p",{class:"kicker"},"The Lexicon of Intelligence"),h("h1",{style:"font-size:clamp(30px,4.5vw,48px)"},"Semantic Network"),lexNav("network"),
    h("p",{class:"note"},"This network maps the meanings of specific terms. The Research Atlas maps broad subjects and published articles. Each connection has a type and a stated basis, and unreviewed connections are not claims of fact."),
    h("div",{class:"row",style:"margin-bottom:12px"},search),chips,
    h("div",{class:"cn-wrap",style:"margin-top:14px"},h("div",null,svg,h("div",{class:"zoom",role:"group","aria-label":"Zoom controls"},h("button",{class:"btn sm",type:"button",onclick:()=>zoom(.7),"aria-label":"Zoom in"},"+"),h("button",{class:"btn sm",type:"button",onclick:()=>zoom(1.4),"aria-label":"Zoom out"},"−"),h("button",{class:"btn sm",type:"button",onclick:()=>{NS_.vb=[0,0,1000,640];NS_.sel=null;NS_.f="";NS_.t.clear();network()}},"Reset")),lg),panel),lst));
  document.title="Semantic Network · The Lexicon of Intelligence"}
/* ---------- distinctions ---------- */
function distinctions(id){
  const L=id?D.dist.filter(d=>d.id===id):D.dist;
  const term=(k,n)=>k?h("a",{href:"#c-"+k},CB(k).term):h("span",null,n||"");
  $("#main").replaceChildren(wrap(h("p",{class:"kicker"},"The Lexicon of Intelligence"),h("h1",{style:"font-size:clamp(30px,4.5vw,48px)"},"Not the Same Thing"),lexNav("distinctions"),
    h("p",{class:"lede",style:"font-size:18px"},"Terms that are often run together, and how they differ."),id?h("p",null,h("a",{href:"#distinctions"},"← All distinctions")):null,
    L.map(d=>h("article",{class:"dcard",id:"d-"+d.id},h("h2",null,d.title),h("div",{class:"dpair"},h("div",null,h("p",{class:"vs"},"Term A"),term(d.a)),h("div",null,h("p",{class:"vs"},"Term B"),term(d.b,d.bname))),
      h("p",null,h("b",null,"How they differ. "),d.differ),h("p",null,h("b",null,"Where they overlap. "),d.overlap),h("p",null,h("b",null,"Still debated. "),d.debated),cites(d.src)))));
  document.title="Not the Same Thing · The Lexicon of Intelligence"}
/* ---------- saved ---------- */
function savedPage(){
  const v=saved().items;
  $("#main").replaceChildren(wrap(h("p",{class:"kicker"},"The Lexicon of Intelligence"),h("h1",{style:"font-size:clamp(30px,4.5vw,48px)"},"My vocabulary"),lexNav("saved"),
    h("p",{class:"note"},"Saved terms and notes stay in this browser only. They do not sync between devices, and showing them in the site's Reading Desk is not built yet."),
    v.length?v.map(x=>{const c=CB(x.id);if(!c)return null;const t=h("textarea",{"aria-label":"Private note on "+c.term,placeholder:"Private note",id:"n-"+c.id});t.value=x.note||"";t.addEventListener("input",()=>setNote(c.id,t.value));
      return h("div",{class:"dcard"},h("h2",null,h("a",{href:"#c-"+c.id,style:"color:inherit"},c.term)),h("p",{class:"meta"},c.intro),t,h("div",{class:"acts",style:"margin-top:10px"},h("button",{class:"btn sm",type:"button",onclick:()=>{toggleSave(c.id);savedPage()}},"Remove")))}):h("div",{class:"empty"},"No saved terms. Use Save on any entry.")));
  document.title="My vocabulary · The Lexicon of Intelligence"}
function route(){if(!D)return;const hs=(location.hash||"#entrance").slice(1);const m=hs.match(/^([a-z]+)(?:-(.+))?$/)||[],a=m[1],b=m[2];
  if(a==="library")library();else if(a==="c")entry(b);else if(a==="compare")compare(b);else if(a==="network")network();else if(a==="distinctions")distinctions();else if(a==="d")distinctions(b);else if(a==="saved")savedPage();else entrance();window.scrollTo(0,0)}
addEventListener("hashchange",route);
shell();load().then(route).catch(e=>{$("#main").replaceChildren(wrap(h("h1",null,"The Lexicon could not load its data"),h("p",null,"The data did not load, so nothing is shown rather than showing a partial or invented list. Please try again later."),h("p",{class:"meta"},String(e.message))))});
