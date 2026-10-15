"use strict";
/* The Theory Chamber. Renders structured JSON with safe DOM construction (no innerHTML for data). */
const ROOT=window.__TC_ROOT__||"../";
const DESKKEY="ai_desk_v1";
const PERSP={neuroscience:"Neuroscience","cognitive-science":"Cognitive science",philosophy:"Philosophy"};
const REL={"proposed-mechanism":"Proposed mechanism","related-concept":"Related concept","empirical-prediction":"Empirical prediction"};
const STYPES={foundational:"Foundational theoretical papers",empirical:"Empirical studies",review:"Reviews and syntheses",critical:"Critical examinations",comparative:"Direct comparative studies",secondary:"Secondary sources (pointers only)"};
const KIND={direct:"Direct evidence",indirect:"Indirect consistency",interpretation:"Theoretical interpretation",conceptual:"Conceptual possibility, not experimental evidence"};
const CATS=[["proposition","Central proposition"],["foundations","Theoretical foundations"],["mechanisms","Proposed mechanisms"],["predictions","Empirical predictions"],["evidence","Supporting evidence"],["criticisms","Challenges and criticisms"],["contrast","Contrasting predictions"],["openQuestions","Current research questions"],["ai","Implications for artificial intelligence"],["reading","Further reading"]];
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const safeHref=u=>{if(!u)return null;if(/^(https:\/\/|#|\.\.?\/)/.test(u))return u;return null};
function h(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){const v=attrs[k];if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k==="href"){const s=safeHref(v);if(s)e.setAttribute("href",s)}else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?"":v)}
  for(const kid of kids.flat(Infinity)){if(kid==null||kid===false)continue;e.append(kid.nodeType?kid:document.createTextNode(String(kid)))}return e}
const ext=(href,text,cls)=>h("a",{href,target:"_blank",rel:"noopener noreferrer",class:cls},text);
const say=t=>{const l=$("#live");l.textContent="";setTimeout(()=>l.textContent=t,30)};

let D=null,ARTICLES=[],SEL=[];
const TH=id=>D.theories.find(t=>t.id===id),SRC=id=>D.sources.find(s=>s.id===id),CON=id=>D.concepts.find(c=>c.id===id);
const claimIdx={},srcClaims={};
function indexData(){
  for(const t of D.theories)for(const sec of ["history","proposition","foundations","mechanisms","predictions","evidence","criticisms","openQuestions","ai"])for(const c of t[sec]||[]){claimIdx[c.id]={t,sec,c};for(const s of c.sources)(srcClaims[s]=srcClaims[s]||[]).push({t,sec,c})}
  for(const q of D.questions)for(const c of q.notes||[]){claimIdx[c.id]={q,sec:"question",c};for(const s of c.sources)(srcClaims[s]=srcClaims[s]||[]).push({q,sec:"question",c})}
}
async function load(){
  if(window.__TC_DATA__){D=window.__TC_DATA__;ARTICLES=(window.__TC_MANIFEST__||{}).articles||[]}
  else{
    const get=async n=>{const r=await fetch("data/"+n+".json",{cache:"no-cache"});if(!r.ok)throw new Error(n+" "+r.status);return (await r.json()).items};
    const [theories,sources,concepts,comparisons,questions]=await Promise.all(["theories","sources","concepts","comparisons","questions"].map(get));
    D={theories,sources,concepts,comparisons,questions};
  }
  indexData();
  if(!window.__TC_DATA__||!ARTICLES.length){try{const r=await fetch(ROOT+"research/published/manifest.json",{cache:"no-cache"});if(r.ok){const m=await r.json();if(m&&Array.isArray(m.articles))ARTICLES=m.articles.filter(a=>a&&/^[a-z0-9-]+$/.test(a.slug||slugOf(a)))}}catch(e){}}
}
const slugOf=a=>a.slug||((a.url||"").replace(/\/$/,"").split("/").pop());
/* ---------- Reading Desk (shares localStorage with the main site; never overwrites other items) ---------- */
function deskRead(){try{const j=localStorage.getItem(DESKKEY);if(j){const o=JSON.parse(j);if(o&&Array.isArray(o.items))return o}}catch(e){}return{items:[],last:null}}
function deskHas(k){return deskRead().items.some(x=>x.k===k)}
function deskToggle(k){const o=deskRead(),i=o.items.findIndex(x=>x.k===k);if(i>=0)o.items.splice(i,1);else o.items.push({k,note:"",coll:"",t:Date.now()});try{localStorage.setItem(DESKKEY,JSON.stringify({items:o.items,last:o.last??null}))}catch(e){say("Saving is blocked by your browser settings.");return false}return deskHas(k)}
function saveBtn(k,label){const b=h("button",{class:"chip","aria-pressed":String(deskHas(k)),type:"button"},deskHas(k)?"Saved to Reading Desk":label||"Save to Reading Desk");b.addEventListener("click",()=>{const on=deskToggle(k);b.setAttribute("aria-pressed",String(on));b.textContent=on?"Saved to Reading Desk":label||"Save to Reading Desk";say(on?"Saved to your Reading Desk in this browser.":"Removed from your Reading Desk.")});return b}
/* ---------- source chips and inspector ---------- */
let lastFocus=null;
function srcChips(ids){return h("span",{class:"src"},ids.map(id=>{const s=SRC(id);const b=h("button",{class:"sc",type:"button","aria-expanded":"false","aria-label":"Inspect source: "+(s?s.short||s.title:id)},s?(s.short||s.title):id);b.addEventListener("click",()=>openSource(id,b));return b}))}
function openSource(id,from){
  const s=SRC(id),box=$("#inspector");if(!s)return;lastFocus=from||document.activeElement;
  $$(".sc[aria-expanded=true]").forEach(x=>x.setAttribute("aria-expanded","false"));if(from)from.setAttribute("aria-expanded","true");
  const claims=(srcClaims[id]||[]).slice(0,12);
  box.replaceChildren(h("button",{class:"btn x",type:"button",onclick:closeSource},"Close"),h("p",{class:"kicker"},STYPES[s.type]||s.type),h("h2",{id:"insp-t"},s.title),sourceBody(s,claims),h("div",{class:"chips"},saveBtn("source:"+s.id,"Save source"),h("button",{class:"chip",type:"button",onclick:()=>{go("evidence");closeSource()}},"All sources")));
  box.hidden=false;box.setAttribute("aria-labelledby","insp-t");$(".x",box).focus();
}
function closeSource(){const b=$("#inspector");b.hidden=true;$$(".sc[aria-expanded=true]").forEach(x=>x.setAttribute("aria-expanded","false"));if(lastFocus&&lastFocus.isConnected)lastFocus.focus()}
addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#inspector").hidden)closeSource()});
function authorLine(s){return s.authors.length>6?s.authors.slice(0,3).join(", ")+" and "+(s.authors.length-3)+" others":s.authors.join(", ")}
function sourceBody(s,claims){
  const row=(k,v)=>v?[h("dt",null,k),h("dd",null,v)]:[];
  return h("dl",null,
    row("Authors",authorLine(s)),row("Year, venue",[s.year,s.venue,s.volume&&"vol. "+s.volume,s.pages&&"pp. "+s.pages].filter(Boolean).join(" · ")),
    h("dt",null,"DOI or link"),h("dd",null,s.doi?ext("https://doi.org/"+s.doi,s.doi):s.url?ext(s.url,s.url):"None"),
    h("dt",null,"What was read for this record"),h("dd",null,h("span",{class:"access"+(/metadata|secondary|summary/.test(s.access)?" low":"")},s.access.replace(/-/g," ")),h("br"),s.read),
    row("Source-grounded description",s.description),row("Why it is relevant",s.relevance),row("Methodological limitations",s.limitations),
    claims.length?[h("dt",null,"Claims in this chamber that cite it"),h("dd",null,h("ul",{class:"claims"},claims.map(x=>h("li",{class:"claim"},h("span",{class:"kind"},x.t?x.t.abbr+" · "+secLabel(x.sec):"Question"),h("p",null,x.c.text)))))]:[]);
}
const secLabel=s=>({history:"History",proposition:"Central proposition",foundations:"Foundations",mechanisms:"Mechanisms",predictions:"Prediction",evidence:"Evidence",criticisms:"Criticism",openQuestions:"Open question",ai:"AI implications"}[s]||s);
/* ---------- claim lists ---------- */
function claimList(items,opts={}){
  if(!items||!items.length)return h("div",{class:"empty"},"Awaiting Evidence Review. No sourced record has been prepared for this section yet.");
  return h("ul",{class:"claims"},items.map(c=>h("li",{class:"claim"+(c.kind?" k-"+c.kind:"")},c.kind?h("span",{class:"kind"},KIND[c.kind]):null,h("p",null,c.text),srcChips(c.sources))));
}
function readingList(t){return h("ul",{class:"claims"},t.reading.map(id=>{const s=SRC(id);return h("li",{class:"claim"},h("span",{class:"kind"},STYPES[s.type]),h("p",null,s.authors.length>3?s.authors[0]+" et al.":s.authors.join(", "),` (${s.year||"n.d."}). `,s.doi||s.url?ext(s.doi?"https://doi.org/"+s.doi:s.url,s.title):s.title,`. ${s.venue}.`),srcChips([id]))}))}
/* ---------- router ---------- */
const VIEWS={};
function go(r){if(location.hash.slice(1)===r)route();else location.hash=r}
function route(){
  const r=location.hash.slice(1)||"entrance",main=$("#main");
  closeSource();
  const [name,...rest]=r.split("-"),arg=rest.join("-");
  let key=name,view;
  if(r==="entrance")view=entrance;else if(name==="library")view=library;else if(name==="theory"&&TH(arg))view=el=>theoryPage(el,TH(arg));
  else if(name==="compare")view=el=>comparePage(el,arg);else if(name==="evidence")view=el=>evidencePage(el,arg);
  else if(name==="concepts")view=el=>conceptsPage(el,arg);else if(name==="questions")view=el=>questionsPage(el,"");else if(name==="question")view=el=>questionsPage(el,arg);
  else{view=entrance;key="entrance"}
  const el=h("div",{class:"view wrap"});main.replaceChildren(el);view(el);
  $$(".nav a").forEach(a=>{const k=key==="theory"?"library":key==="question"?"questions":key;a.toggleAttribute("aria-current",a.dataset.r===k);if(a.dataset.r===k)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  const h1=$("h1",el);if(h1){h1.setAttribute("tabindex","-1");}
  document.title=(h1&&!/Theory Chamber/.test(h1.textContent)?h1.textContent+" · ":"")+"The Theory Chamber · Artificially Intelligent";
  trayRender();window.scrollTo(0,0);
}
/* ---------- selection tray ---------- */
function trayRender(){
  const t=$("#tray");if(!/^(library|theory)/.test(location.hash.slice(1))&&SEL.length===0){t.hidden=true;return}
  if(/^(entrance|compare|evidence|concepts|question)/.test(location.hash.slice(1)||"entrance")){t.hidden=true;return}
  const slot=(i)=>{const id=SEL[i];return id?h("span",{class:"slot f"},h("strong",null,TH(id).abbr),TH(id).name,h("button",{type:"button","aria-label":"Remove "+TH(id).name,onclick:()=>{SEL.splice(i,1);route0()}},"×")):h("span",{class:"slot"},i?"Theory B: choose another":"Theory A: choose one")};
  t.replaceChildren(h("div",{class:"in"},h("div",{class:"slots","aria-label":"Selected theories"},slot(0),h("span",{"aria-hidden":"true"},"vs"),slot(1)),h("div",{class:"chips"},h("button",{class:"btn",type:"button",disabled:SEL.length===0,onclick:()=>{SEL=[];route0()}},"Clear"),h("a",{class:"btn primary",href:SEL.length===2?"#compare-"+SEL[0]+"-"+SEL[1]:null,"aria-disabled":String(SEL.length!==2),onclick:e=>{if(SEL.length!==2)e.preventDefault()}},"Compare →"))));
  t.hidden=false;
}
function route0(){const y=scrollY;route();scrollTo(0,y)}
function toggleSel(id){const i=SEL.indexOf(id);if(i>=0)SEL.splice(i,1);else{if(SEL.length===2)SEL.shift();SEL.push(id)}say(SEL.length+" of 2 theories selected.");route0()}
/* ---------- entrance ---------- */
VIEWS.entrance=entrance;
function entrance(el){
  const stage=h("div",{class:"stage"},h("canvas",{id:"cv","aria-hidden":"true"}),h("div",{class:"core"},"How can different theories explain consciousness, and what evidence would distinguish them?"));
  el.append(h("section",{class:"hero","aria-labelledby":"t"},h("div",{class:"hero-copy"},
    h("p",{class:"kicker"},"Artificially Intelligent · Research instrument"),
    h("h1",{class:"h-xl",id:"t"},"The Theory Chamber"),
    h("p",{class:"sub"},"Competing explanations. Shared questions. An unfinished understanding of consciousness."),
    h("p",{class:"lede"},"Consciousness research contains several competing theoretical frameworks. Each makes different assumptions, predicts different things, and faces different challenges. Here you can compare them side by side, trace each claim to a source, and see where researchers disagree."),
    h("div",{class:"chips"},h("a",{class:"btn primary",href:"#library"},"Enter the Chamber →"),h("a",{class:"btn",href:"#questions"},"Start from a question"))),stage));
  el.append(h("section",{class:"legend","aria-label":"How to read this chamber"},
    h("div",null,h("strong",null,"Sourced, not summarized from memory"),"Every claim links to a publication record that shows what was actually read."),
    h("div",null,h("strong",null,"No rankings or scores"),"The chamber does not say which theory is winning, and it shows disagreement rather than smoothing it away."),
    h("div",null,h("strong",null,"Awaiting Evidence Review"),"Every record is a draft until an editor has reviewed it against the full papers."),
    h("div",null,h("strong",null,"Machine consciousness is not claimed"),"AI sections separate conceptual possibility from experimental evidence.")));
  el.append(h("section",{class:"sec",style:"margin-top:36px"},h("h2",null,"Six frameworks"),h("div",{class:"chips"},D.theories.map(t=>h("a",{class:"btn",href:"#theory-"+t.id},h("strong",null,t.abbr)," ",t.name)))));
  drawHero($("#cv",el),stage);
}
function drawHero(cv,stage){
  const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches,ctx=cv.getContext("2d");let w=0,hh=0,raf=0,t0=performance.now();
  const names=D.theories.map(t=>t.abbr);
  function size(){const r=stage.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);w=r.width;hh=r.height;cv.width=w*d;cv.height=hh*d;ctx.setTransform(d,0,0,d,0,0);draw(performance.now())}
  function pt(i){const a=-Math.PI/2+i*2*Math.PI/names.length,R=Math.min(w,hh)*.40;return[w/2+Math.cos(a)*R,hh/2+Math.sin(a)*R,a]}
  function draw(now){
    if(!cv.isConnected){cancelAnimationFrame(raf);return}
    ctx.clearRect(0,0,w,hh);const cx=w/2,cy=hh/2,ph=reduce?0:(now-t0)/1000;
    ctx.strokeStyle="rgba(255,255,255,.06)";ctx.lineWidth=1;[.2,.31,.42].forEach(f=>{ctx.beginPath();ctx.arc(cx,cy,Math.min(w,hh)*f,0,7);ctx.stroke()});
    names.forEach((n,i)=>{const[x,y,a]=pt(i),bx=cx+Math.cos(a+.5)*Math.min(w,hh)*.2,by=cy+Math.sin(a+.5)*Math.min(w,hh)*.2;
      ctx.strokeStyle="rgba(181,242,214,.34)";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(bx,by,cx,cy);ctx.stroke();
      const u=((ph*.12+i/names.length)%1),q=1-u,px=q*q*x+2*q*u*bx+u*u*cx,py=q*q*y+2*q*u*by+u*u*cy;
      if(!reduce||true){ctx.fillStyle="rgba(181,242,214,"+(reduce?.5:.9*Math.sin(Math.PI*u))+")";ctx.beginPath();ctx.arc(px,py,2.4,0,7);ctx.fill()}
      ctx.fillStyle="#101513";ctx.strokeStyle="rgba(255,255,255,.28)";ctx.beginPath();ctx.arc(x,y,Math.max(20,Math.min(w,hh)*.05),0,7);ctx.fill();ctx.stroke();
      ctx.fillStyle="#ece9e1";ctx.font="500 "+Math.max(11,Math.min(w,hh)*.026)+"px Hanken Grotesk, system-ui, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(n,x,y)});
    const rr=Math.min(w,hh)*(.17+(reduce?0:.006*Math.sin(ph*1.4)));ctx.strokeStyle="rgba(181,242,214,.5)";ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(cx,cy,rr,0,7);ctx.stroke();
    if(!reduce)raf=requestAnimationFrame(draw)
  }
  size();new ResizeObserver(()=>{size()}).observe(stage);
}
/* ---------- library ---------- */
let LQ="",LF="all";
function matches(t){const q=LQ.trim().toLowerCase();if(LF!=="all"&&!t.perspectives.includes(LF))return false;if(!q)return true;
  const cn=t.concepts.map(c=>(CON(c.concept)||{}).name||"").join(" ");return [t.name,t.abbr,t.summary,t.tradition,t.contributors.join(" "),cn].join(" ").toLowerCase().includes(q)}
function library(el){
  const grid=h("div",{class:"grid",id:"grid"}),count=h("p",{class:"note",role:"status"});
  const fchips=h("div",{class:"chips","aria-label":"Filter by research perspective"},[["all","All"],...Object.entries(PERSP)].map(([k,v])=>h("button",{class:"chip",type:"button","aria-pressed":String(LF===k),onclick:e=>{LF=k;$$(".chip",fchips).forEach(b=>b.setAttribute("aria-pressed",String(b===e.currentTarget)));paint()}},v)));
  const input=h("input",{type:"search",placeholder:"Search theories, contributors, concepts",value:LQ,"aria-label":"Search theories and concepts",oninput:e=>{LQ=e.target.value;paint()}});
  el.append(h("div",{class:"lib-head"},h("p",{class:"kicker"},"The Theory Library"),h("h1",{class:"h-l"},"Choose two theories to compare"),h("p",{class:"lede"},"Examine one theory on its own, or add two to the comparison tray and open them side by side."),
    h("div",{class:"lib-bar"},input,fchips),h("p",{class:"note"},"Perspective filters are editorial and limited to what the sources support. A theory can appear under more than one."),count),grid);
  function paint(){const r=D.theories.filter(matches);grid.replaceChildren(...(r.length?r.map(card):[h("div",{class:"empty"},"No theory matches. Try a contributor, concept, or abbreviation.")]));count.textContent=r.length+" of "+D.theories.length+" theories"}
  paint();
}
function card(t){
  const found=t.reading.map(SRC).filter(s=>s&&s.type==="foundational");
  const selected=SEL.includes(t.id);
  return h("article",{class:"card"+(selected?" sel":""),"aria-labelledby":"c-"+t.id},
    h("div",{class:"row"},h("span",{class:"badge abbr"},t.abbr),h("span",{class:"badge"},"Awaiting Evidence Review")),
    h("h3",{id:"c-"+t.id},t.name),h("p",null,t.summary),
    h("dl",null,h("dt",null,"Contributors"),h("dd",null,t.contributors.join(", ")),h("dt",null,"Tradition"),h("dd",null,t.tradition),h("dt",null,"Central proposition"),h("dd",null,t.proposition[0].text),h("dt",null,"History"),h("dd",null,t.history[0].text),
      h("dt",null,"Foundational"),h("dd",null,found.length?found.map((s,i)=>[i?"; ":"",s.doi||s.url?ext(s.doi?"https://doi.org/"+s.doi:s.url,s.short):s.short]):"Awaiting Evidence Review")),
    h("div",{class:"acts"},h("a",{class:"btn",href:"#theory-"+t.id},"Examine Theory"),h("button",{class:"btn",type:"button","aria-pressed":String(selected),onclick:()=>toggleSel(t.id)},selected?"Added to Comparison":"Add to Comparison")));
}
/* ---------- theory detail ---------- */
function relatedArticles(t){
  const out=[],seen=new Set();
  for(const m of t.essayMentions||[]){const a=ARTICLES.find(x=>slugOf(x)===m.slug);if(a){seen.add(slugOf(a));out.push({a,why:"Named in the essay text (paragraph "+(m.paragraph+1)+")",basis:"text"})}}
  for(const a of ARTICLES){if(seen.has(slugOf(a)))continue;if((a.topics||[]).some(x=>t.atlas.includes(x)))out.push({a,why:"Suggested topic connection (shares the Atlas topic "+(a.topics||[]).filter(x=>t.atlas.includes(x)).join(", ")+"). Not reviewed, and not evidence for or against this theory.",basis:"topic"})}
  return out;
}
function articleLinks(t){const r=relatedArticles(t);if(!r.length)return h("div",{class:"empty"},"No published essay is connected to this theory yet. New essays will appear here as suggested topic connections.");
  return h("div",{class:"linklist"},r.map(x=>h("a",{href:ROOT+"#read-"+slugOf(x.a),target:"_blank",rel:"noopener noreferrer"},h("span",null,x.a.title),h("small",null,x.why))))}
function conceptRows(t){return h("ul",{class:"claims"},t.concepts.map(c=>{const cn=CON(c.concept);return h("li",{class:"claim"},h("span",{class:"kind"},REL[c.relation]),h("p",null,h("a",{href:"#concepts-"+t.id},cn.name)),srcChips(c.sources))}))}
function theoryPage(el,t){
  const s=(title,body)=>h("section",{class:"sec"},h("h2",null,title),body);
  const others=D.theories.filter(x=>x.id!==t.id);
  el.append(h("div",{class:"stack"},
    h("p",{class:"kicker"},h("a",{href:"#library",style:"text-decoration:none"},"← Theory Library")),
    h("div",{class:"row chips"},h("span",{class:"badge abbr"},t.abbr),h("span",{class:"badge"},"Awaiting Evidence Review · last reviewed: "+(t.review.lastReviewed||"not yet"))),
    h("h1",{class:"h-l"},t.name),h("p",{class:"lede"},t.summary),
    h("div",{class:"chips"},h("button",{class:"btn",type:"button","aria-pressed":String(SEL.includes(t.id)),onclick:()=>toggleSel(t.id)},SEL.includes(t.id)?"Added to Comparison":"Add to Comparison"),saveBtn("theory:"+t.id,"Save theory"),h("a",{class:"btn",href:"#concepts-"+t.id},"See its concepts")),
    h("p",{class:"note"},t.explanation.join(" ")),
    t.gaps?h("div",{class:"empty"},"Not yet covered in this record: "+t.gaps.join("; ")+"."):null,
    s("Central proposition",claimList(t.proposition)),s("Foundations",claimList(t.foundations)),s("Proposed mechanisms",claimList(t.mechanisms)),
    s("Empirical predictions",claimList(t.predictions)),s("Supporting evidence",claimList(t.evidence)),s("Challenges and criticisms",claimList(t.criticisms)),
    s("Current research questions",claimList(t.openQuestions)),s("Implications for artificial intelligence",claimList(t.ai)),
    s("Concepts and relationships",conceptRows(t)),
    s("Related published research",articleLinks(t)),
    s("Further reading",readingList(t)),
    s("Compare with…",h("div",{class:"chips"},others.map(o=>h("a",{class:"btn",href:"#compare-"+t.id+"-"+o.id},t.abbr+" vs "+o.abbr)))))); 
}
/* ---------- comparison ---------- */
const pairKey=(a,b)=>[a,b].sort().join("|");
function findComp(a,b){return D.comparisons.find(c=>(c.a===a&&c.b===b)||(c.a===b&&c.b===a))}
const OPEN=new Set(["proposition","predictions","contrast"]);
function comparePage(el,arg){
  let [a,b]=arg.split("-");if(!TH(a)||!TH(b)||a===b){a=SEL[0]||"gnwt";b=SEL[1]||(a==="iit"?"gnwt":"iit")}
  const ta=TH(a),tb=TH(b),comp=findComp(a,b),flip=comp&&comp.a!==a;
  const wrap=h("div",{class:"cmp","data-view":innerWidth<=900?"both":"both"});
  const sel=(cur,other,which)=>h("select",{"aria-label":"Choose theory "+which,onchange:e=>{const v=e.target.value;go(which==="A"?"compare-"+v+"-"+other:"compare-"+other+"-"+v)}},D.theories.map(t=>h("option",{value:t.id,selected:t.id===cur?true:null,disabled:t.id===other?true:null},t.name+" ("+t.abbr+")")));
  const copy=h("button",{class:"btn",type:"button",onclick:async()=>{try{await navigator.clipboard.writeText(location.href);say("Link copied.");copy.textContent="Link copied"}catch(e){prompt("Copy this link",location.href)}setTimeout(()=>copy.textContent="Copy link",1800)}},"Copy link");
  const simB=h("button",{class:"btn",type:"button","aria-pressed":"false",onclick:e=>{const on=e.currentTarget.getAttribute("aria-pressed")!=="true";e.currentTarget.setAttribute("aria-pressed",String(on));wrap.classList.toggle("hl-sim",on);if(on)openCat("contrast")}},"Highlight similarities");
  const difB=h("button",{class:"btn",type:"button","aria-pressed":"false",onclick:e=>{const on=e.currentTarget.getAttribute("aria-pressed")!=="true";e.currentTarget.setAttribute("aria-pressed",String(on));wrap.classList.toggle("hl-diff",on);if(on)openCat("contrast")}},"Highlight differences");
  const cats=[];
  const tabs=h("div",{class:"tabs",role:"tablist","aria-label":"Choose what to view"},[["a",ta.abbr],["both","Compare"],["b",tb.abbr]].map(([v,l])=>h("button",{role:"tab",type:"button","aria-selected":String(v==="both"),"data-v":v,onclick:()=>setView(v)},v==="both"?"Side by side":l)));
  function setView(v){wrap.dataset.view=v;$$("[role=tab]",tabs).forEach(x=>x.setAttribute("aria-selected",String(x.dataset.v===v)))}
  tabs.addEventListener("keydown",e=>{const bs=$$("[role=tab]",tabs),i=bs.indexOf(document.activeElement);if(e.key==="ArrowRight"||e.key==="ArrowLeft"){const n=bs[(i+(e.key==="ArrowRight"?1:bs.length-1))%bs.length];n.focus();setView(n.dataset.v)}});
  function openCat(id){const c=cats.find(x=>x.id===id);if(c&&c.btn.getAttribute("aria-expanded")!=="true")c.btn.click()}
  const saveCmp=saveBtn("cmp:"+a+"-"+b,"Save comparison");
  el.append(h("div",{class:"stack"},h("p",{class:"kicker"},"The Comparison Chamber"),h("h1",{class:"h-l"},ta.abbr+" vs "+tb.abbr),
    h("p",{class:"note"},"Selected theories are in the page address, so you can bookmark or share this exact comparison. The chamber shows each theory's own record and the documented contrasts between them. It does not rank them or declare a winner.")));
  el.append(h("div",{class:"cmp-bar",style:"margin-top:18px"},h("label",null,"Theory A",sel(a,b,"A")),h("button",{class:"btn",type:"button",onclick:()=>go("compare-"+b+"-"+a)},"⇄ Swap"),h("label",null,"Theory B",sel(b,a,"B"))));
  el.append(h("div",{class:"cmp-tools",role:"group","aria-label":"Comparison controls"},simB,difB,h("button",{class:"btn",type:"button",onclick:()=>{const all=cats.every(c=>c.btn.getAttribute("aria-expanded")==="true");cats.forEach(c=>c.set(!all))}},"Expand or collapse all"),copy,saveCmp,h("button",{class:"btn",type:"button",onclick:()=>{SEL=[];go("library")}},"Reset")));
  wrap.append(tabs,h("div",{class:"heads"},h("div",{class:"a"},h("span",{class:"badge abbr"},ta.abbr),h("h2",null,ta.name),h("a",{href:"#theory-"+ta.id},"Open full record")),h("div",{class:"b"},h("span",{class:"badge abbr"},tb.abbr),h("h2",null,tb.name),h("a",{href:"#theory-"+tb.id},"Open full record"))));
  for(const [id,label] of CATS){
    const body=h("div",{class:"body"}),open=OPEN.has(id);
    const btn=h("button",{type:"button","aria-expanded":String(open),"aria-controls":"cat-"+id},label);
    body.id="cat-"+id;body.hidden=!open;
    const set=v=>{btn.setAttribute("aria-expanded",String(v));body.hidden=!v};btn.addEventListener("click",()=>set(btn.getAttribute("aria-expanded")!=="true"));
    if(id==="contrast")body.append(contrastBlock(ta,tb,comp,flip));
    else{const f=t=>id==="reading"?readingList(t):claimList(t[id]);
      body.append(h("div",{class:"cols"},h("div",{class:"cell a"},h("span",{class:"who"},ta.abbr),f(ta)),h("div",{class:"cell b"},h("span",{class:"who"},tb.abbr),f(tb))))}
    wrap.append(h("section",{class:"cat"},h("h3",null,btn),body));cats.push({id,btn,body,set});
  }
  el.append(wrap);
  el.append(h("section",{class:"sec",style:"margin-top:30px"},h("h2",null,"Continue"),h("div",{class:"chips"},
    h("a",{class:"btn",href:"#concepts-"+a},"Concepts for "+ta.abbr),h("a",{class:"btn",href:"#concepts-"+b},"Concepts for "+tb.abbr),h("a",{class:"btn",href:"#evidence-"+a},"Evidence for "+ta.abbr),h("a",{class:"btn",href:"#evidence-"+b},"Evidence for "+tb.abbr),
    ext(ROOT+"#library","Published Research"),ext(ROOT+"#stream","Data Stream"),ext(ROOT+"#map","Consciousness Map (broader perspectives)"))));
}
function contrastBlock(ta,tb,comp,flip){
  const out=h("div",null);
  if(!comp||(!comp.similarities.length&&!comp.contrasts.length&&!comp.reported)){out.append(h("div",{class:"empty"},"Awaiting Evidence Review. No documented contrast between these two theories has been prepared yet, so none is shown. Compare each theory's own predictions above."));return out}
  if(comp.similarities.length)out.append(h("h4",{style:"font-family:var(--serif);font-weight:400;font-size:1.15rem;margin:0 0 8px"},"Shared ground"),h("ul",{class:"shared"},comp.similarities.map(s=>h("li",null,h("span",null,s.text),srcChips(s.sources)))));
  out.append(h("h4",{style:"font-family:var(--serif);font-weight:400;font-size:1.15rem;margin:0 0 8px"},"Contrasting predictions"));
  if(comp.contrasts.length)for(const c of comp.contrasts){const A=flip?c.b:c.a,B=flip?c.a:c.b;out.append(h("div",{class:"contrast"},h("h4",null,c.aspect),h("div",{class:"pair"},h("div",null,h("b",null,ta.abbr),A),h("div",null,h("b",null,tb.abbr),B)),h("p",{class:"how"},h("strong",null,"How it might be tested: "),c.test),srcChips(c.sources)))}
  else out.append(h("div",{class:"empty"},"Awaiting Evidence Review. No concrete contrasting prediction has been documented for this pair."));
  if(comp.reported)out.append(h("div",{class:"contrast"},h("h4",null,"What has been reported so far"),h("p",{style:"margin:0"},comp.reported.text),srcChips(comp.reported.sources)));
  if(comp.note)out.append(h("p",{class:"note"},comp.note));
  return out;
}
/* ---------- evidence explorer ---------- */
let EV={theory:"all",type:"all"};
function evidencePage(el,arg){
  if(arg&&TH(arg))EV.theory=arg;
  const list=h("div",{class:"ev-grid"}),count=h("p",{class:"note",role:"status"}),claimsBox=h("div",null);
  const tchips=h("div",{class:"chips","aria-label":"Filter by theory"},[["all","All theories"],...D.theories.map(t=>[t.id,t.abbr])].map(([k,v])=>h("button",{class:"chip",type:"button","aria-pressed":String(EV.theory===k),"data-k":k,onclick:()=>{EV.theory=k;paint()}},v)));
  const types=Object.keys(STYPES);
  const ychips=h("div",{class:"chips","aria-label":"Filter by source type"},[["all","All types"],...types.map(k=>[k,STYPES[k]])].map(([k,v])=>h("button",{class:"chip",type:"button","aria-pressed":String(EV.type===k),"data-k":k,onclick:()=>{EV.type=k;paint()}},v)));
  el.append(h("div",{class:"stack"},h("p",{class:"kicker"},"Evidence Explorer"),h("h1",{class:"h-l"},"Sources behind the claims"),
    h("p",{class:"lede"},"Each source record shows what was actually read, why the source matters, which claims cite it, and its limitations. Select any claim to inspect its source."),
    h("p",null,h("span",{class:"badge"},"Awaiting Evidence Review"),"  ",h("span",{class:"note"},"Where only an abstract or a summary was available, the record says so. No source here is treated as definitive evidence of a finding that requires reading the full paper.")),
    tchips,ychips,count),h("div",{style:"height:18px"}),list,h("section",{class:"sec",style:"margin-top:36px"},h("h2",null,"Claims you can inspect"),claimsBox));
  function paint(){
    $$("button",tchips).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.k===EV.theory)));$$("button",ychips).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.k===EV.type)));
    const theory=EV.theory==="all"?null:TH(EV.theory);
    const ids=theory?new Set([...theory.reading,...Object.entries(srcClaims).filter(([id,cl])=>cl.some(x=>x.t&&x.t.id===theory.id)).map(([id])=>id)]):null;
    const src=D.sources.filter(s=>(!ids||ids.has(s.id))&&(EV.type==="all"||s.type===EV.type));
    count.textContent=src.length+" of "+D.sources.length+" sources";
    list.replaceChildren(...(src.length?src.map(srcCard):[h("div",{class:"empty"},"No source matches. Awaiting Evidence Review.")]));
    const cl=[];(theory?[theory]:D.theories).forEach(t=>["predictions","evidence","criticisms"].forEach(sec=>(t[sec]||[]).forEach(c=>cl.push({t,sec,c}))));
    claimsBox.replaceChildren(h("ul",{class:"claims"},cl.map(x=>h("li",{class:"claim"+(x.c.kind?" k-"+x.c.kind:"")},h("span",{class:"kind"},x.t.abbr+" · "+secLabel(x.sec)+(x.c.kind?" · "+KIND[x.c.kind]:"")),h("p",null,x.c.text),srcChips(x.c.sources)))));
  }
  paint();
}
function srcCard(s){
  const cl=srcClaims[s.id]||[];
  return h("article",{class:"srcrec"},h("div",{class:"chips"},h("span",{class:"badge abbr"},STYPES[s.type].split(" ")[0]),h("span",{class:"access"+(/metadata|secondary|summary/.test(s.access)?" low":"")},s.access.replace(/-/g," "))),
    h("h3",null,s.doi||s.url?ext(s.doi?"https://doi.org/"+s.doi:s.url,s.title):s.title),
    h("p",{class:"meta"},authorLine(s)+" · "+[s.year,s.venue,s.volume&&"vol. "+s.volume,s.pages&&"pp. "+s.pages].filter(Boolean).join(" · ")+(s.doi?" · DOI "+s.doi:"")),
    h("p",null,s.description),h("p",null,h("strong",null,"Why it is here: "),s.relevance),
    h("p",{class:"lim"},h("b",null,"Limitations. "),s.limitations||"Not yet assessed. Awaiting Evidence Review."),
    h("p",{class:"note"},cl.length?"Cited by "+cl.length+" claim"+(cl.length===1?"":"s")+" in this chamber.":"Not cited by any claim yet."),
    h("div",{class:"chips"},h("button",{class:"chip",type:"button",onclick:e=>openSource(s.id,e.currentTarget)},"Inspect with claims"),saveBtn("source:"+s.id,"Save source")));
}
/* ---------- concepts diagram ---------- */
let CSEL=null;
function conceptsPage(el,arg){
  if(arg&&TH(arg))CSEL={t:arg};else if(arg&&CON(arg))CSEL={c:arg};
  const svgHost=h("div",{class:"diagram"}),side=h("aside",{"aria-live":"polite"});
  el.append(h("div",{class:"stack"},h("p",{class:"kicker"},"Conceptual relationships"),h("h1",{class:"h-l"},"How the theories meet the concepts"),
    h("p",{class:"lede"},"Choose a theory or a concept to see how they are linked in the sources. Each line carries a label for the kind of relationship."),
    h("p",{class:"note"},"Links show what a source says the theory proposes, predicts, or relates to. They are not causal claims, and they are not measurements of similarity.")),
    h("div",{class:"keyrow",style:"margin-top:14px"},h("span",{class:"m"},"Proposed mechanism"),h("span",{class:"r"},"Related concept"),h("span",{class:"p"},"Empirical prediction")),
    h("div",{class:"cgrid"},svgHost,side));
  const NS="http://www.w3.org/2000/svg",E=(n,a)=>{const e=document.createElementNS(NS,n);for(const k in a||{})e.setAttribute(k,a[k]);return e};
  function draw(){
    const narrow=svgHost.clientWidth<560||innerWidth<700,W=narrow?420:900,rowT=narrow?46:56,rowC=narrow?36:44,Ht=Math.max(D.theories.length*rowT,D.concepts.length*rowC)+30;
    const bw=narrow?150:230,svg=E("svg",{viewBox:`0 0 ${W} ${Ht}`,role:"group","aria-label":"Diagram linking theories to concepts"});svg.style.setProperty("--fs",narrow?"12px":"13px");
    const ty=i=>20+i*rowT+rowT/2-4,cy=i=>20+i*rowC+rowC/2-4,tx=10,cx=W-bw-10;
    const edges=[];D.theories.forEach((t,i)=>t.concepts.forEach(c=>{const j=D.concepts.findIndex(x=>x.id===c.concept);edges.push({t,c,i,j})}));
    const active=e=>!CSEL||(CSEL.t?e.t.id===CSEL.t:e.c.concept===CSEL.c);
    const eg=E("g");edges.forEach(e=>{const x1=tx+bw,y1=ty(e.i),x2=cx,y2=cy(e.j),m=(x1+x2)/2;const p=E("path",{d:`M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`,class:"ed "+e.c.relation+(active(e)?"":" dim")});const tt=E("title");tt.textContent=`${e.t.abbr}: ${REL[e.c.relation]}: ${CON(e.c.concept).name}`;p.append(tt);eg.append(p)});svg.append(eg);
    const node=(x,y,label,cls,on,dim,fn,aria)=>{const g=E("g",{class:"nd "+cls+(on?" on":"")+(dim?" dim":""),tabindex:"0",role:"button","aria-pressed":String(!!on),"aria-label":aria});g.append(E("rect",{x,y:y-17,width:bw,height:34,rx:3}));const tx_=E("text",{x:x+12,y:y+4});tx_.textContent=label;g.append(tx_);g.addEventListener("click",fn);g.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();fn()}});return g};
    D.theories.forEach((t,i)=>{const on=CSEL&&CSEL.t===t.id,dim=CSEL&&!on&&!(CSEL.c&&t.concepts.some(c=>c.concept===CSEL.c));svg.append(node(tx,ty(i),t.abbr+" · "+t.name.replace(" Theory","").replace(" of Consciousness","").slice(0,narrow?18:30),"t",on,dim,()=>{CSEL={t:t.id};refresh()},"Theory: "+t.name))});
    D.concepts.forEach((c,j)=>{const on=CSEL&&CSEL.c===c.id,dim=CSEL&&!on&&!(CSEL.t&&TH(CSEL.t).concepts.some(x=>x.concept===c.id));svg.append(node(cx,cy(j),c.name,"c",on,dim,()=>{CSEL={c:c.id};refresh()},"Concept: "+c.name))});
    svgHost.replaceChildren(svg);
  }
  function panel(){
    if(!CSEL){side.replaceChildren(h("div",{class:"empty"},"Select a theory or a concept to see its documented relationships."));return}
    if(CSEL.t){const t=TH(CSEL.t);side.replaceChildren(h("h2",{style:"font-size:1.5rem;margin-bottom:10px"},t.name),h("ul",{class:"claims"},t.concepts.map(c=>{const cn=CON(c.concept);return h("li",{class:"claim"},h("span",{class:"kind"},REL[c.relation]),h("p",null,h("button",{class:"chip",type:"button",onclick:()=>{CSEL={c:c.concept};refresh()}},cn.name)),srcChips(c.sources))})),h("div",{class:"chips",style:"margin-top:14px"},h("a",{class:"btn",href:"#theory-"+t.id},"Open theory"),h("button",{class:"btn",type:"button",onclick:()=>{CSEL=null;refresh()}},"Clear")));return}
    const c=CON(CSEL.c),ts=D.theories.filter(t=>t.concepts.some(x=>x.concept===c.id));
    side.replaceChildren(h("h2",{style:"font-size:1.5rem;margin-bottom:6px"},c.name),h("p",{class:"note"},c.description+" "+c.note),
      h("ul",{class:"claims",style:"margin-top:12px"},ts.map(t=>{const r=t.concepts.find(x=>x.concept===c.id);return h("li",{class:"claim"},h("span",{class:"kind"},REL[r.relation]),h("p",null,h("a",{href:"#theory-"+t.id},t.name)),srcChips(r.sources))})),
      h("div",{class:"chips",style:"margin-top:14px"},c.atlas?ext(ROOT+"#atlas","Open the Research Atlas ("+({consciousness:"Consciousness",cognition:"Cognition",ai:"Artificial Intelligence"}[c.atlas]||c.atlas)+")"):h("span",{class:"note"},"No matching Atlas concept; none is implied."),h("button",{class:"btn",type:"button",onclick:()=>{CSEL=null;refresh()}},"Clear")));
  }
  const refresh=()=>{draw();panel();history.replaceState(null,"",CSEL?(CSEL.t?"#concepts-"+CSEL.t:"#concepts-"+CSEL.c):"#concepts")};
  draw();panel();new ResizeObserver(()=>draw()).observe(svgHost);
}
/* ---------- unanswered questions ---------- */
function questionsPage(el,arg){
  const q=D.questions.find(x=>x.id===arg);
  const list=h("div",{class:"linklist"},D.questions.map(x=>h("a",{href:"#question-"+x.id,"aria-current":x.id===arg?"true":null,style:x.id===arg?"border-color:var(--mint)":""},h("span",{style:"font-family:var(--serif);font-size:1.15rem"},x.q),h("small",null,x.theories.length+" theories"))));
  el.append(h("div",{class:"stack"},h("p",{class:"kicker"},"Unanswered questions"),h("h1",{class:"h-l"},"What remains open"),h("p",{class:"lede"},"Choose a question to see related theories, sourced notes, criticisms, and where to go next. These questions are explored, not resolved."),h("div",{class:"cgrid",style:"margin-top:10px"},list,q?qDetail(q):h("div",{class:"empty"},"Select a question."))));
}
function qDetail(q){
  const crit=(q.criticisms||[]).map(id=>claimIdx[id]).filter(Boolean);
  return h("div",{class:"stack","aria-live":"polite"},h("h2",{style:"font-size:1.8rem"},q.q),
    h("section",{class:"sec"},h("h3",{style:"font-size:1.2rem"},"Related theories"),h("div",{class:"chips"},q.theories.map(id=>h("a",{class:"btn",href:"#theory-"+id},TH(id).abbr)))),
    h("section",{class:"sec"},h("h3",{style:"font-size:1.2rem"},"What the sources say"),q.notes&&q.notes.length?claimList(q.notes):h("div",{class:"empty"},"Awaiting Evidence Review. No source in this chamber addresses this question directly yet.")),
    h("section",{class:"sec"},h("h3",{style:"font-size:1.2rem"},"Relevant criticisms"),crit.length?h("ul",{class:"claims"},crit.map(x=>h("li",{class:"claim"},h("span",{class:"kind"},x.t.abbr),h("p",null,x.c.text),srcChips(x.c.sources)))):h("div",{class:"empty"},"No criticism has been linked to this question yet.")),
    h("section",{class:"sec"},h("h3",{style:"font-size:1.2rem"},"Keep exploring"),h("div",{class:"linklist"},
      ext(ROOT+"#inquiry-"+q.inquiry,h("span",null,"Follow this in the Inquiry Room")),ext(ROOT+"#atlas","Research Atlas"),ext(ROOT+"#stream","Data Stream"),
      h("div",{style:"border:1px solid var(--line);background:var(--panel);border-radius:3px;padding:11px 14px"},ext(ROOT+"#index","Intelligence Index"),h("small",{style:"display:block;color:var(--muted)"},"Suggested search term: ",h("strong",null,q.iq),". Search results are not endorsements of any theory.")))));
}
/* ---------- boot ---------- */
(async function(){
  $("#brand").href=ROOT;$("#f-main").href=ROOT;$("#f-atlas").href=ROOT+"#atlas";$("#f-lib").href=ROOT+"#library";$("#f-map").href=ROOT+"#map";
  try{await load()}catch(e){$("#main").replaceChildren(h("div",{class:"wrap view"},h("div",{class:"empty"},"The research data could not be loaded, so nothing is shown. Details: "+e.message)));return}
  addEventListener("hashchange",route);route();
})();
