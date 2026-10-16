"use strict";
const ROOT=window.OBS_ROOT||"../";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function h(t,a,...k){const e=document.createElement(t);for(const[n,v]of Object.entries(a||{})){if(v==null||v===false)continue;if(n==="class")e.className=v;else if(n.startsWith("on"))e.addEventListener(n.slice(2),v);else if(n==="html")throw new Error("no html");else e.setAttribute(n,v===true?"":v)}for(const c of k.flat(9))if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));return e}
const NS="http://www.w3.org/2000/svg";
function s(t,a,...k){const e=document.createElementNS(NS,t);for(const[n,v]of Object.entries(a||{})){if(v==null)continue;if(n.startsWith("on"))e.addEventListener(n.slice(2),v);else e.setAttribute(n,v)}for(const c of k.flat(9))if(c!=null)e.append(c.nodeType?c:document.createTextNode(String(c)));return e}
const safeHref=u=>/^https:\/\/(doi\.org|arxiv\.org)\//.test(u)?u:"#";
const LS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};
let D=null;const F={q:"",disc:new Set(),type:"",range:"all",from:"",to:""};let TAB="latest",SEL=null,VB=null;
const MON=["January","February","March","April","May","June","July","August","September","October","November","December"];
function fmt(d){const p=d.split("-");if(p.length===1)return p[0];if(p.length===2)return MON[+p[1]-1]+" "+p[0];return +p[2]+" "+MON[+p[1]-1]+" "+p[0]}
const pdate=d=>{const p=d.split("-").map(Number);return new Date(p[0],(p[1]||1)-1,p[2]||1)};
const TYPES={"journal-article":"Journal article","proceedings-article":"Conference paper","preprint":"Preprint (not peer reviewed)"};
const DISC=id=>D.topics.disciplines.find(x=>x.id===id),CON=id=>D.topics.concepts.find(x=>x.id===id),PUB=id=>D.pubs.find(p=>p.id===id);
const col=p=>(DISC(p.category[0])||{}).color||"#8fe9c4";
async function load(){
  if(window.__OBS){D=window.__OBS;return}
  const g=async f=>{const r=await fetch("data/"+f);if(!r.ok)throw new Error(f);return r.json()};
  const[p,t,c,sp,st]=await Promise.all(["publications.json","research-topics.json","research-connections.json","spotlights.json","status.json"].map(g));
  D={pubs:p.items,pubMeta:p.meta,topics:t,conn:c.items,connMeta:c.meta,spot:sp.items,spotMeta:sp.meta,status:st,qt:{},th:{}};
  try{const q=await (await fetch(ROOT+"unanswered-archive/data/questions.json")).json();q.items.forEach(x=>D.qt[x.id]=x.title)}catch(e){}
  try{const q=await (await fetch(ROOT+"theory-chamber/data/theories.json")).json();q.items.forEach(x=>D.th[x.id]=x.name)}catch(e){}
}
/* ---------- filtering ---------- */
function filtered(){
  const q=F.q.trim().toLowerCase(),now=new Date();
  return D.pubs.filter(p=>{
    if(F.disc.size&&!p.category.some(c=>F.disc.has(c)))return false;
    if(F.type&&p.publicationType!==F.type)return false;
    if(q){const hay=[p.title,p.authors.join(" "),p.source,p.doi,p.concepts.map(c=>(CON(c)||{}).name).join(" "),p.category.map(c=>(DISC(c)||{}).name).join(" ")].join(" ").toLowerCase();if(!q.split(/\s+/).every(w=>hay.includes(w)))return false}
    const d=pdate(p.publicationDate);
    if(F.range==="30"&&d<new Date(now-30*864e5))return false;
    if(F.range==="90"&&d<new Date(now-90*864e5))return false;
    if(F.range==="365"&&d<new Date(now-365*864e5))return false;
    if(F.range==="custom"){if(F.from&&d<new Date(F.from))return false;if(F.to&&d>new Date(F.to))return false}
    return true})}
const byLatest=(a,b)=>b.discoveryDate.localeCompare(a.discoveryDate)||pdate(b.publicationDate)-pdate(a.publicationDate)||a.id.localeCompare(b.id);
/* ---------- shared bits ---------- */
function shell(){
  const links=[["Home",ROOT],["Research Atlas",ROOT+"#atlas"],["Unanswered Archive",ROOT+"unanswered-archive/"],["Theory Chamber",ROOT+"theory-chamber/"],["Museum",ROOT+"museum/"]];
  $("#site").replaceChildren(...links.map(([t,u])=>h("a",{href:u},t)));$("#brand").href=ROOT}
function savedIds(){return LS.get("obs_saved_v1",[])}
function toggleSave(id){const a=savedIds(),i=a.indexOf(id);i<0?a.push(id):a.splice(i,1);LS.set("obs_saved_v1",a)}
function follow(){return LS.get("obs_follow_v1",{disc:[],concepts:[]})}
function toggleFollow(kind,id){const f=follow();const a=f[kind]=f[kind]||[];const i=a.indexOf(id);i<0?a.push(id):a.splice(i,1);LS.set("obs_follow_v1",f)}
function statusPanel(){
  const st=D.status;
  return h("section",{"aria-label":"Dataset status"},h("div",{class:"status"},
    h("div",null,h("small",null,"Dataset"),h("span",null,st.mode==="seed"?"Seed collection, "+D.pubs.length+" records":D.pubs.length+" records")),
    h("div",null,h("small",null,"Last successful automatic update"),h("span",null,st.lastSuccessfulUpdate?fmt(st.lastSuccessfulUpdate):"None yet. Automatic discovery is not running.")),
    h("div",null,h("small",null,"Displayed data"),h("span",null,"Cached copy, collected "+fmt(st.generated))),
    h("div",null,h("small",null,"Coverage"),h("span",null,"A small collection. It does not represent all research."))),
    h("div",{class:"prov",role:"list","aria-label":"Research sources"},st.providers.map(p=>h("span",{class:"pv "+p.state,role:"listitem",title:p.note},h("b",null,p.name),": "+({used:"used for seed records",planned:"planned",evaluating:"under evaluation"}[p.state]||p.state)))))}
function card(p){
  return h("article",{class:"card",style:"--c:"+col(p)},
    h("div",{class:"badges"},h("span",{class:"bd"},TYPES[p.publicationType]||p.publicationType),h("span",{class:"bd pre"},"Preliminary classification"),h("span",{class:"bd"},"Awaiting review")),
    h("h3",null,h("a",{href:"#paper-"+p.id},p.title)),
    h("p",{class:"meta"},p.authors.length>4?p.authors.slice(0,3).join(", ")+" and "+(p.authors.length-3)+" others":p.authors.join(", ")),
    h("p",{class:"meta"},h("b",null,p.source)),
    h("div",{class:"dates"},h("div",null,"Published",h("b",null,fmt(p.publicationDate))),h("div",null,"Collected by Observatory",h("b",null,fmt(p.discoveryDate)))),
    h("div",{class:"badges"},p.category.map(c=>h("span",{class:"bd"},(DISC(c)||{}).name))),
    h("div",{class:"acts"},h("a",{class:"btn sm primary",href:"#paper-"+p.id},"Investigate"),h("a",{class:"btn sm",href:safeHref(p.url),rel:"noopener",target:"_blank"},"Original publication"),
      (()=>{const on=savedIds().includes(p.id);const b=h("button",{class:"btn sm",type:"button","aria-pressed":String(on),onclick:()=>{toggleSave(p.id);route()}},on?"Saved":"Save");return b})()))}
function filterBar(){
  const bar=h("div",{class:"filters"});
  const q=h("input",{type:"search",placeholder:"Search titles, authors, journals, concepts",value:F.q,"aria-label":"Search research"});
  q.addEventListener("input",()=>{F.q=q.value;clearTimeout(q._t);q._t=setTimeout(()=>{renderTab(true)},150)});
  const type=h("select",{"aria-label":"Publication type"},h("option",{value:""},"All publication types"),...Object.entries(TYPES).map(([k,v])=>h("option",{value:k,selected:F.type===k},v)));
  type.addEventListener("change",()=>{F.type=type.value;renderTab()});
  const rng=h("select",{"aria-label":"Publication date range"},...[["all","Any publication date"],["30","Published in the past 30 days"],["90","Published in the past 90 days"],["365","Published in the past year"],["custom","Custom range"]].map(([k,v])=>h("option",{value:k,selected:F.range===k},v)));
  rng.addEventListener("change",()=>{F.range=rng.value;renderTab()});
  const r1=h("div",{class:"row"},q,type,rng);
  if(F.range==="custom"){const f=h("input",{type:"date",value:F.from,"aria-label":"From date"}),t=h("input",{type:"date",value:F.to,"aria-label":"To date"});f.addEventListener("change",()=>{F.from=f.value;renderTab()});t.addEventListener("change",()=>{F.to=t.value;renderTab()});r1.append(f,t)}
  const r2=h("div",{class:"row",role:"group","aria-label":"Research disciplines"},h("label",{class:"l"},"Discipline"),...D.topics.disciplines.map(d=>h("button",{class:"chip",type:"button","aria-pressed":String(F.disc.has(d.id)),onclick:()=>{F.disc.has(d.id)?F.disc.delete(d.id):F.disc.add(d.id);renderTab()}},h("i",{style:"background:"+d.color}),d.name)));
  if(F.disc.size||F.q||F.type||F.range!=="all")r2.append(h("button",{class:"btn sm",type:"button",onclick:()=>{F.q="";F.disc.clear();F.type="";F.range="all";F.from=F.to="";renderTab()}},"Clear filters"));
  bar.append(r1,r2);return bar}
function emptyState(){return h("div",{class:"empty"},h("p",null,F.range!=="all"?"No records in the collection match this period. The Observatory only shows records it has actually retrieved, and this collection holds no publications from the selected dates.":"No records match these filters."),h("p",{class:"meta"},"Try clearing filters. The collection currently holds "+D.pubs.length+" records."))}
/* ---------- tabs ---------- */
const TABS=[["latest","Latest research"],["timeline","Timeline"],["constellation","Constellation"],["trends","Trends"],["spotlight","Spotlight"],["following","Following"]];
function dash(tab){
  TAB=tab||TAB;const m=$("#main");
  m.replaceChildren(h("div",{class:"wrap"},h("p",{class:"kicker"},"The Research Observatory"),h("h1",{style:"font-size:clamp(30px,4.5vw,48px)"},"Observatory"),
    h("p",{class:"lede",style:"font-size:19px"},"What researchers are investigating, what evidence is available, and which questions remain open."),statusPanel(),
    h("nav",{class:"tabs",role:"tablist","aria-label":"Observatory sections"},TABS.map(([k,t])=>h("button",{role:"tab",id:"tab-"+k,"aria-selected":String(k===TAB),onclick:()=>{location.hash="dash-"+k}},t))),
    h("div",{id:"tabbody",role:"tabpanel"})));
  renderTab()}
function renderTab(keepFocus){
  const b=$("#tabbody");if(!b)return;const fx=document.activeElement&&document.activeElement.type==="search"&&keepFocus;
  const pos=fx?document.activeElement.selectionStart:0;
  $$("nav.tabs button").forEach(x=>x.setAttribute("aria-selected",String(x.id==="tab-"+TAB)));
  const view={latest:vLatest,timeline:vTimeline,constellation:vConstellation,trends:vTrends,spotlight:vSpotlight,following:vFollowing}[TAB]();
  b.replaceChildren(...view);
  if(fx){const q=$("input[type=search]");if(q){q.focus();q.setSelectionRange(pos,pos)}}}
function vLatest(){const L=filtered().sort(byLatest);
  return[h("p",{class:"note"},"These "+D.pubs.length+" records are the development seed collection, gathered on "+fmt(D.status.generated)+". They are landmark and recent works, not newly published research. The Observatory records when it found each record separately from when it was published."),
    filterBar(),h("p",{class:"count",role:"status"},L.length+" of "+D.pubs.length+" records in this collection"),L.length?h("div",{class:"cards"},L.map(card)):emptyState()]}
function vTimeline(){
  const L=filtered().sort((a,b)=>pdate(b.publicationDate)-pdate(a.publicationDate));
  const out=[filterBar(),h("p",{class:"count",role:"status"},L.length+" records shown, by publication date. Only records retrieved for this collection appear.")];
  if(!L.length)return[...out,emptyState()];
  const ys=L.map(p=>pdate(p.publicationDate).getFullYear()),y0=Math.min(...ys),y1=Math.max(...ys),W=1000,H=150,x=y=>40+(W-80)*(y1===y0?.5:(y-y0)/(y1-y0));
  const svg=s("svg",{class:"tl",viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Publication years of the records shown, "+y0+" to "+y1});
  svg.append(s("line",{x1:40,x2:W-40,y1:100,y2:100,stroke:"#39423f"}));
  const step=Math.max(1,Math.ceil((y1-y0)/9));for(let y=y0;y<=y1;y+=step){svg.append(s("line",{x1:x(y),x2:x(y),y1:100,y2:106,stroke:"#39423f"}),s("text",{x:x(y),y:124,"text-anchor":"middle"},y))}
  const stack={};L.forEach(p=>{const d=pdate(p.publicationDate),y=d.getFullYear()+d.getMonth()/12;const k=Math.round(x(y)/14);stack[k]=(stack[k]||0)+1;svg.append(s("circle",{cx:x(y),cy:92-(stack[k]-1)*15,r:6,fill:col(p),opacity:".9"},s("title",null,p.title+" ("+fmt(p.publicationDate)+")")))});
  out.push(svg);
  const grp={};L.forEach(p=>{(grp[pdate(p.publicationDate).getFullYear()]=grp[pdate(p.publicationDate).getFullYear()]||[]).push(p)});
  Object.keys(grp).sort((a,b)=>b-a).forEach(y=>{out.push(h("h2",{class:"yrgrp"},y),h("ul",{class:"plain"},grp[y].map(p=>h("li",null,h("a",{href:"#paper-"+p.id},p.title),h("div",{class:"meta"},fmt(p.publicationDate)+" · "+p.authors.slice(0,2).join(", ")+(p.authors.length>2?" et al.":"")+" · "+p.source)))))});
  return out}
function vTrends(){
  const L=filtered(),mk=(title,rows,total)=>h("section",{class:"sec"},h("h2",null,title),L.length?h("div",{class:"bars"},rows.map(([n,v,c])=>h("div",{class:"bar"},h("span",null,n),h("div",null,h("i",{style:`width:${total?Math.max(2,v/total*100):0}%;--c:${c||"var(--mint)"}`})),h("span",{class:"n"},v)))):h("p",{class:"meta"},"Not enough records for this view."));
  const dc=D.topics.disciplines.map(d=>[d.name,L.filter(p=>p.category.includes(d.id)).length,d.color]),mx=Math.max(1,...dc.map(r=>r[1]));
  const dec={};L.forEach(p=>{const k=Math.floor(pdate(p.publicationDate).getFullYear()/10)*10;dec[k]=(dec[k]||0)+1});
  const dr=Object.keys(dec).sort().map(k=>[k+"s",dec[k]]),cc={};L.forEach(p=>p.concepts.forEach(c=>cc[c]=(cc[c]||0)+1));
  const cr=Object.entries(cc).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10).map(([k,v])=>[(CON(k)||{}).name||k,v]);
  return[filterBar(),h("p",{class:"note"},"These counts describe only this collection of "+D.pubs.length+" seed records ("+(L.length)+" shown). They are not research trends and say nothing about activity in the wider literature. A record can belong to more than one discipline."),
    mk("Records by discipline (preliminary labels)",dc,mx),mk("Records by decade of publication",dr,Math.max(1,...dr.map(r=>r[1]))),mk("Most frequent concepts in this collection",cr,Math.max(1,...cr.map(r=>r[1])))]}
function vSpotlight(){
  const items=D.spot;
  return[h("p",{class:"note"},D.spotMeta.note),items.length?items.map(()=>h("div")):h("div",{class:"empty"},h("h3",null,"No Spotlight has been published"),h("p",null,"A Research Spotlight explains what researchers investigated, the methods, the findings and the limitations. That needs a full reading of the paper and an editorial review, so the Observatory does not generate one automatically."),h("p",{class:"meta"},"Automated candidates can be suggested to Architect for review once the review queue exists. Until then this section stays empty.")),
    h("p",{class:"meta"},"To read any record in the collection, open it from the ",h("a",{href:"#dash-latest"},"Latest research")," list.")]}
function vFollowing(){
  const f=follow(),sv=savedIds();
  const topics=h("div",{class:"row",role:"group","aria-label":"Follow disciplines"},D.topics.disciplines.map(d=>h("button",{class:"chip",type:"button","aria-pressed":String((f.disc||[]).includes(d.id)),onclick:()=>{toggleFollow("disc",d.id);renderTab()}},h("i",{style:"background:"+d.color}),(f.disc||[]).includes(d.id)?"Following: "+d.name:d.name)));
  const fl=D.pubs.filter(p=>p.category.some(c=>(f.disc||[]).includes(c))).sort(byLatest),sl=D.pubs.filter(p=>sv.includes(p.id));
  return[h("p",{class:"note"},"Following and saving are kept in this browser only. They do not sync between devices, and the Observatory sends no alerts or notifications."),
    h("h2",null,"Follow a research subject"),topics,
    h("h2",{style:"margin-top:28px"},"Records in your followed subjects"),(f.disc||[]).length?(fl.length?h("div",{class:"cards"},fl.map(card)):h("div",{class:"empty"},"No records in the collection yet.")):h("div",{class:"empty"},"Follow a subject above to list its records here."),
    h("h2",{style:"margin-top:28px"},"Saved papers"),sl.length?h("div",{class:"cards"},sl.map(card)):h("div",{class:"empty"},"No saved papers. Use Save on any record. Showing saved papers inside the site's Reading Desk is not built yet.")]}
/* ---------- constellation ---------- */
function layout(){
  const cx=500,cy=345,pos={},idx={};
  D.topics.disciplines.forEach((d,i)=>{const a=-Math.PI/2+i*2*Math.PI/8;d.cx=cx+Math.cos(a)*350;d.cy=cy+Math.sin(a)*205});
  D.pubs.forEach(p=>{const d=DISC(p.category[0]);const k=idx[d.id]=(idx[d.id]||0)+1;const a=k*2.399,r=22+Math.sqrt(k)*20;pos[p.id]=[d.cx+Math.cos(a)*r,d.cy+Math.sin(a)*r]});return pos}
function constSVG(list,opts){
  const pos=layout(),ids=new Set(list.map(p=>p.id)),o=opts||{};
  const svg=s("svg",{class:"cn",viewBox:o.vb||"0 0 1000 640",role:"group","aria-label":"Research constellation. A list alternative follows."});
  D.topics.disciplines.forEach(d=>{svg.append(s("circle",{cx:d.cx,cy:d.cy,r:92,fill:d.color,opacity:".04"}),s("text",{x:d.cx,y:d.cy-102,"text-anchor":"middle",fill:d.color,style:"fill:"+d.color},d.name))});
  const eg=s("g");svg.append(eg);
  D.conn.forEach(c=>{if(!ids.has(c.a)||!ids.has(c.b))return;if(o.min&&c.type!=="shared_author")return;const A=pos[c.a],B=pos[c.b];eg.append(s("line",c.type==="shared_author"?{x1:A[0],y1:A[1],x2:B[0],y2:B[1],stroke:"#8fe9c4","stroke-width":1.6,opacity:".8"}:{x1:A[0],y1:A[1],x2:B[0],y2:B[1],stroke:"#c3ccc9","stroke-width":1,"stroke-dasharray":"2 5",opacity:".45"},s("title",null,c.label)))});
  list.forEach(p=>{const[x,y]=pos[p.id];const g=s("g",{class:"nd",tabindex:o.min?null:"0",role:o.min?null:"button","aria-label":p.title+", "+fmt(p.publicationDate),"aria-pressed":String(SEL===p.id),transform:`translate(${x} ${y})`,onclick:o.min?null:()=>{SEL=p.id;renderTab()},onkeydown:o.min?null:e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();SEL=p.id;renderTab()}}});
    g.append(s("circle",{class:"hit",r:14,fill:"transparent"}),s("circle",{class:"core",r:p.publicationType==="preprint"?5:7,fill:p.publicationType==="preprint"?"none":col(p),stroke:col(p),"stroke-width":p.publicationType==="preprint"?2:0}),s("title",null,p.title));
    if(!o.min)g.append(s("text",{y:22,"text-anchor":"middle"},p.authors[0].split(" ").pop()+" "+p.publicationDate.slice(0,4)));svg.append(g)});
  return svg}
function vConstellation(){
  const L=filtered(),panel=h("div",{class:"panel"}),p=SEL&&PUB(SEL);
  if(p){panel.append(h("p",{class:"kicker"},"Selected record"),h("h3",null,p.title),h("p",{class:"meta"},p.authors.slice(0,3).join(", ")+(p.authors.length>3?" et al.":"")),h("p",{class:"meta"},p.source+" · "+fmt(p.publicationDate)),
    h("p",{class:"meta"},"Connections: "),h("ul",{class:"plain"},D.conn.filter(c=>c.a===p.id||c.b===p.id).map(c=>{const o=PUB(c.a===p.id?c.b:c.a);return h("li",null,h("a",{href:"#paper-"+o.id},o.title),h("div",{class:"meta"},c.label+(c.verified?"":" (automated, preliminary)")))})),
    h("a",{class:"btn primary",href:"#paper-"+p.id},"Open investigation"))}
  else panel.append(h("p",{class:"kicker"},"Details"),h("p",{class:"meta"},"Select a point to see its record. Each point is one real record in the collection. Hollow points are preprints."));
  const svg=constSVG(L),vb=VB||[0,0,1000,640];svg.setAttribute("viewBox",vb.join(" "));
  const set=v=>{VB=v;svg.setAttribute("viewBox",v.join(" "))};
  const zoom=f=>{const[x,y,w,hh]=VB||[0,0,1000,640];const nw=Math.min(1000,Math.max(250,w*f)),nh=nw*.64;set([Math.max(0,Math.min(1000-nw,x+(w-nw)/2)),Math.max(0,Math.min(640-nh,y+(hh-nh)/2)),nw,nh])};
  let drag=null;svg.addEventListener("pointerdown",e=>{if(e.target.closest(".nd"))return;drag={x:e.clientX,y:e.clientY,vb:[...(VB||[0,0,1000,640])]};svg.setPointerCapture(e.pointerId)});
  svg.addEventListener("pointermove",e=>{if(!drag)return;const r=svg.getBoundingClientRect(),[x,y,w,hh]=drag.vb;set([Math.max(0,Math.min(1000-w,x-(e.clientX-drag.x)/r.width*w)),Math.max(0,Math.min(640-hh,y-(e.clientY-drag.y)/r.height*hh)),w,hh])});
  svg.addEventListener("pointerup",()=>drag=null);
  const lg=h("div",{class:"legend"},h("span",null,constLine("#8fe9c4",false),"Shared author (from metadata)"),h("span",null,constLine("#c3ccc9",true),"Topic similarity (automated, preliminary)"),h("span",null,"Verified citation links: none retrieved yet"),h("span",null,"Filled point = published; hollow = preprint"));
  const rel=D.conn.filter(c=>L.some(x=>x.id===c.a)&&L.some(x=>x.id===c.b));
  const listAlt=h("details",{style:"margin-top:18px"},h("summary",{style:"cursor:pointer;min-height:44px;display:flex;align-items:center"},"List alternative: all records and relationships"),
    h("ul",{class:"plain"},L.map(q=>h("li",null,h("a",{href:"#paper-"+q.id},q.title),h("div",{class:"meta"},q.category.map(c=>DISC(c).name).join(", ")+" · "+fmt(q.publicationDate))))),
    h("h3",{style:"margin-top:16px"},"Relationships"),rel.length?h("ul",{class:"plain"},rel.map(c=>h("li",null,PUB(c.a).title+" ↔ "+PUB(c.b).title,h("div",{class:"meta"},c.label+(c.verified?"":" (automated, preliminary)"))))):h("p",{class:"meta"},"No relationships among the records shown."));
  return[h("p",{class:"note"},D.connMeta.note),filterBar(),L.length?h("div",null,h("div",{class:"cn-wrap"},h("div",null,svg,h("div",{class:"zoom",role:"group","aria-label":"Zoom controls"},h("button",{class:"btn sm",type:"button",onclick:()=>zoom(.7),"aria-label":"Zoom in"},"+"),h("button",{class:"btn sm",type:"button",onclick:()=>zoom(1.4),"aria-label":"Zoom out"},"−"),h("button",{class:"btn sm",type:"button",onclick:()=>set([0,0,1000,640])},"Reset"),h("button",{class:"btn sm",type:"button",onclick:()=>{SEL=null;renderTab()}},"Clear selection")),lg),panel),listAlt):emptyState()]}
function constLine(c,dash){return s("svg",{width:30,height:8,"aria-hidden":"true"},s("line",{x1:0,y1:4,x2:30,y2:4,stroke:c,"stroke-width":dash?1:2,"stroke-dasharray":dash?"2 4":null}))}
/* ---------- paper ---------- */
function paper(id){
  const p=PUB(id),m=$("#main");if(!p){m.replaceChildren(h("div",{class:"wrap"},h("h1",null,"Record not found"),h("p",null,h("a",{href:"#dash-latest"},"Back to the Observatory"))));return}
  const rel=D.conn.filter(c=>c.a===id||c.b===id),sv=savedIds().includes(id),f=follow();
  const sec=(t,...k)=>h("section",{class:"sec"},h("h2",null,t),...k);
  const ni=(t)=>h("div",{class:"interp"},h("p",{class:"kicker"},"Observatory note"),h("p",null,t));
  m.replaceChildren(h("div",{class:"wrap"},h("a",{href:"#dash-latest"},"← Observatory"),
    h("div",{class:"badges",style:"margin-top:18px"},h("span",{class:"bd"},TYPES[p.publicationType]||p.publicationType),h("span",{class:"bd pre"},"Preliminary classification"),h("span",{class:"bd"},"Awaiting editorial review"),h("span",{class:"bd"},"Seed record")),
    h("h1",{style:"font-size:clamp(28px,4vw,44px);margin-top:12px"},p.title),h("p",{class:"lede",style:"font-size:18px"},p.authors.join(", ")),
    h("p",{class:"meta"},h("b",null,p.source),p.publisher&&p.publisher!==p.source?" · "+p.publisher:""),
    h("div",{class:"dates",style:"max-width:420px;margin:14px 0"},h("div",null,"Published",h("b",null,fmt(p.publicationDate))),h("div",null,"Collected by Observatory",h("b",null,fmt(p.discoveryDate)))),
    h("div",{class:"acts",style:"margin:0 0 8px"},h("a",{class:"btn primary",href:safeHref(p.url),target:"_blank",rel:"noopener"},"Read the original publication"),h("button",{class:"btn",type:"button","aria-pressed":String(sv),onclick:()=>{toggleSave(id);paper(id)}},sv?"Saved":"Save to this browser")),
    sec("Research overview",ni("No abstract was retrieved for this record, so the Observatory does not summarize the study. Read the original publication for the central question. A source-grounded summary will be added only when an abstract or full text is available, and it will be labelled as AI-assisted.")),
    sec("Research context",h("p",null,"Preliminary disciplines: ",p.category.map(c=>DISC(c).name).join(", "),". These were assigned from the title and metadata, not from reading the paper."),
      h("div",{class:"row"},p.category.map(c=>{const on=(f.disc||[]).includes(c);return h("button",{class:"chip",type:"button","aria-pressed":String(on),onclick:()=>{toggleFollow("disc",c);paper(id)}},on?"Following: "+DISC(c).name:"Follow "+DISC(c).name)}))),
    sec("Methodology",ni("The provider lists this record as a "+(TYPES[p.publicationType]||p.publicationType).toLowerCase()+". Whether the work is experimental, observational, theoretical or a review has not been determined, because that requires reading it.")),
    sec("Findings or arguments",ni("Not summarized. No source text was retrieved.")),
    sec("Limitations",ni("Limitations stated by the authors have not been extracted. "+(p.abstractStatus==="not retrieved"?"Only citation metadata is available here.":""))),
    sec("Related research",rel.length?h("ul",{class:"plain"},rel.map(c=>{const o=PUB(c.a===id?c.b:c.a);return h("li",null,h("a",{href:"#paper-"+o.id},o.title),h("div",{class:"meta"},c.label+(c.verified?" (from metadata)":" (automated, preliminary; not a citation link)")))})):h("p",{class:"meta"},"No related records in the collection. No verified citation links have been retrieved.")),
    sec("Research connections",h("div",{class:"grid2"},
      h("div",null,h("h3",null,"Research Atlas concepts"),h("p",{class:"meta"},"Labels from title and metadata. Keyword similarity is not proof of a scientific relationship."),h("div",{class:"row"},p.concepts.map(c=>h("a",{class:"btn sm",href:ROOT+"#dossier-"+c,target:"_blank",rel:"noopener"},"Explore "+((CON(c)||{}).name||c)+" →")))),
      h("div",null,h("h3",null,"Theory Chamber"),p.theories.length?h("p",{class:"meta"},"Potentially related research. This does not mean the paper supports or refutes the theory."):h("p",{class:"meta"},"No theory has been associated with this record."),h("div",{class:"row"},p.theories.map(t=>h("a",{class:"btn sm",href:ROOT+"theory-chamber/#theory-"+t,target:"_blank",rel:"noopener"},D.th[t]||t.toUpperCase())))),
      h("div",{style:"grid-column:1/-1"},h("h3",null,"Unanswered Archive"),h("p",{class:"meta"},"Potentially related questions. Linking a record to a question never changes the question's status."),h("ul",{class:"plain"},p.questions.map(q=>h("li",null,h("a",{href:ROOT+"unanswered-archive/#q-"+q,target:"_blank",rel:"noopener"},q+(D.qt[q]?": "+D.qt[q]:""))))))) ),
    sec("Original publication",h("div",{class:"orig"},h("p",{class:"kicker"},"From the provider's record"),h("p",{class:"meta"},"DOI: ",h("a",{href:safeHref(p.url),target:"_blank",rel:"noopener"},p.doi)),h("p",{class:"meta"},"Source provider: "+p.provider),h("p",{class:"meta"},"Metadata refreshed: "+fmt(p.lastMetadataRefresh)),h("p",{class:"meta"},"Abstract: "+p.abstractStatus),h("p",{class:"meta"},"Retraction or correction status: "+p.retraction+" (not checked yet)"),h("p",{class:"meta"},p.provenance)))));
  document.title=p.title+" · The Research Observatory";window.scrollTo(0,0)}
/* ---------- entrance ---------- */
function entrance(){
  const svg=constSVG(D.pubs,{min:true,vb:"60 20 880 600"});svg.style.cursor="default";svg.querySelectorAll("circle.core").forEach((c,i)=>{if(i%3===0)c.classList.add("tw")});svg.setAttribute("aria-hidden","true");svg.removeAttribute("role");svg.removeAttribute("aria-label");
  $("#main").replaceChildren(h("div",{class:"wrap"},h("div",{class:"hero"},h("div",null,h("p",{class:"kicker"},"Artificially Intelligent · Research Observatory preview"),h("h1",null,"THE RESEARCH OBSERVATORY"),h("p",{class:"sub"},"Tracking discoveries at the boundaries of human and machine intelligence."),
    h("p",{class:"lede"},"The boundaries of intelligence, consciousness, and cognition are constantly being examined through new research."),
    h("p",{class:"lede",style:"font-size:18px"},"The Research Observatory follows emerging publications, evolving theories, and interdisciplinary developments to provide a clearer view of what researchers are investigating, what evidence is available, and which questions remain open."),
    h("a",{class:"btn primary",href:"#dash-latest"},"Enter the Observatory →")),h("div",null,svg,h("p",{class:"meta",style:"text-align:center"},"Each point is one real record in the collection."))),
    h("div",{class:"strip"},h("span",{class:"dot","aria-hidden":"true"}),h("b",null,"Preview status. "),"This preview holds a seed collection of "+D.pubs.length+" records whose DOIs were checked on "+fmt(D.status.generated)+". The automatic daily discovery has not run, so nothing here is newly published research.")));
  document.title="The Research Observatory · Artificially Intelligent"}
function route(){
  if(!D)return;const hs=(location.hash||"#entrance").slice(1);const mm=hs.match(/^([a-z]+)(?:-(.+))?$/)||[],a=mm[1],b=mm[2];
  $$("nav.site a").forEach(x=>x.removeAttribute("aria-current"));
  if(a==="dash"){if(b&&TABS.some(t=>t[0]===b))TAB=b;dash(TAB);document.title="Observatory · The Research Observatory"}
  else if(a==="paper")paper(b);else entrance();
  if(a!=="paper")window.scrollTo(0,0)}
addEventListener("hashchange",()=>{VB=null;route()});
shell();load().then(route).catch(e=>{$("#main").replaceChildren(h("div",{class:"wrap"},h("h1",null,"The Observatory could not load its data"),h("p",null,"The dataset did not load, so nothing is shown rather than showing a stale or invented list. Please try again later."),h("p",{class:"meta"},String(e.message))))});
