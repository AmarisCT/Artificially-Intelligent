"use strict";
(function(){
const concepts=[
{id:"ai",name:"Artificial Intelligence",color:"#9bcfda",x:524,y:344,r:56,description:"Artificial intelligence studies and builds systems that perform tasks associated with learning, inference, perception, and language. Its connection to human experience raises questions about knowledge, agency, and understanding."},
{id:"consciousness",name:"Consciousness",color:"#a4ecc3",x:560,y:128,r:43,description:"Consciousness names the subjective dimension of experience: what it is like to perceive, think, and be aware. Whether and how this could relate to machine systems remains an open philosophical and scientific question."},
{id:"memory",name:"Memory",color:"#98c9e7",x:818,y:240,r:39,description:"Memory preserves and reconstructs information across time. Comparing human remembering with computational storage raises questions about continuity, interpretation, and the limits of machine analogy."},
{id:"identity",name:"Identity",color:"#e7b1d0",x:851,y:500,r:38,description:"Identity concerns the narratives, relationships, records, and experiences through which a person becomes recognizable to themselves and others, including through digital traces."},
{id:"language",name:"Language",color:"#e7d6ad",x:268,y:339,r:39,description:"Language makes meanings shareable, yet fluent language alone does not establish understanding or awareness. It forms a bridge and a boundary between human communication and machine output."},
{id:"cognition",name:"Cognition",color:"#c0b1ee",x:307,y:155,r:39,description:"Cognition includes attention, reasoning, learning, and information processing. Studying human cognition offers useful comparisons with AI while also revealing important differences."},
{id:"culture",name:"Digital Culture",color:"#a3dfb1",x:594,y:551,r:40,description:"Digital culture describes how technologies, platforms, and shared practices shape expression, memory, creativity, and collective life."},
{id:"archives",name:"Archives",color:"#b0cbd1",x:279,y:543,r:35,description:"Archives preserve selected traces of the past. Digital archives complicate who records, organizes, remembers, and interprets the lives represented in those traces."}
];
const links=[
["ai","consciousness"],["ai","cognition"],["ai","language"],["ai","memory"],["ai","identity"],["ai","culture"],
["consciousness","cognition"],["consciousness","identity"],["memory","identity"],["memory","archives"],["archives","culture"],["language","culture"]
];

const BASE="../research/published/";
const CURATED=[
{id:"2063e8d4-c3e5-4458-a5dc-24c5844bc90b",title:"We Are All Archives Now",url:BASE+"we-are-all-archives-now/",topics:["memory","archives","culture","identity","ai"],excerpt:"On historical archives, digital traces, remembering, and how AI draws from records of human life.",publishedAt:"2026-10-07",topicSource:"editorial",category:"Essay"},
{id:"5affe752-0d79-40e0-b8b0-c2410aa11a1b",title:"Is Human Consciousness Connected to Artificial Intelligence?",url:BASE+"is-human-consciousness-connected-to-artificial-intelligence/",topics:["consciousness","ai","cognition","language","identity"],excerpt:"An examination of consciousness, machine intelligence, and the difference between simulation and subjective experience.",publishedAt:"2026-09-19",topicSource:"editorial",category:"Essay"}
];
const byId=Object.fromEntries(concepts.map(c=>[c.id,c]));
let published=CURATED.slice(),selected="consciousness",selectedArticle="",query="",zoom=1,panX=0,panY=0,activeView="graph";
const $=id=>document.getElementById(id),NS="http://www.w3.org/2000/svg";
const graph=$("graph-content"),svg=$("atlas-svg"),category=$("category-list");
const related=$("related-list"),connections=$("connection-list"),featured=$("feature-grid");
const graphNodes=new Map(),graphEdges=[],articleNodes=new Map(),articleEdges=[];
const topicNames=Object.fromEntries(concepts.map(c=>[c.id,c.name]));
const sourceLabel={editorial:"Editorial association",keyword:"Automatic keyword match"};
const CLUSTERS=[
{name:"Mind & Experience",subtitle:"How awareness, thought, and communication relate",ids:["consciousness","cognition","language"]},
{name:"Machine Intelligence",subtitle:"Questions about AI systems and their capabilities",ids:["ai","memory"]},
{name:"Identity & Digital Society",subtitle:"Memory, cultural life, and the traces we preserve",ids:["identity","culture","archives"]}
];
function svgEl(tag,props={},text){
 const el=document.createElementNS(NS,tag);
 for(const [key,value] of Object.entries(props))el.setAttribute(key,String(value));
 if(text!==undefined)el.textContent=text;
 return el;
}
function escapeText(v){return String(v??"").toLowerCase().trim()}
function articleMatches(a,q){return !q||[a.title,a.excerpt||"",a.category||"",(a.topics||[]).map(id=>topicNames[id]||id).join(" ")].join(" ").toLowerCase().includes(q)}
function visibleArticles(){return published.filter(a=>articleMatches(a,query))}
function activeArticles(id){return published.filter(a=>a.topics.includes(id))}
function datedLabel(value){
 if(!value)return "Date not provided";
 const date=new Date(value+"T12:00:00Z");
 return Number.isNaN(date.valueOf())?"Date not provided":new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(date);
}
function encodeId(id){return encodeURIComponent(id)}
function syncSelection(){
 const params=new URLSearchParams(location.search);
 params.delete("concept");params.delete("article");
 if(selectedArticle)params.set("article",selectedArticle);
 else if(selected)params.set("concept",selected);
 history.replaceState(null,"",location.pathname+(params.size?"?"+params:"")+location.hash);
}
function choose(id){
 if(!byId[id])return;
 selected=id;selectedArticle="";
 syncSelection();updateEverything();
 if(window.innerWidth<741){$("detail-panel").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest"})}
}
function chooseArticle(id,showGraph=false){
 const a=published.find(item=>item.id===id);
 if(!a)return;
 selectedArticle=a.id;selected="";
 if(showGraph){activeView="graph";setView()}
 syncSelection();updateEverything();
 if(window.innerWidth<741)$("detail-panel").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function resetChoice(){
 selected="";selectedArticle="";$("concept-search").value="";query="";
 syncSelection();updateEverything();
}
function makeGraph(){
 graph.replaceChildren();graphNodes.clear();graphEdges.length=0;
 const ambient=svgEl("g",{"aria-hidden":"true"});
 for(let i=0;i<85;i++){
  const x=24+((i*277+77)%1049),y=32+((i*173+113)%640),r=(i%8===0)?2.6:1.25;
  ambient.appendChild(svgEl("circle",{cx:x,cy:y,r,fill:i%4===0?"#b9ffde":"#adc4bc",opacity:".10"}));
 }
 graph.appendChild(ambient);
 const curves=svgEl("g",{"aria-hidden":"true"});
 for(const [from,to] of links){
  const a=byId[from],b=byId[to],dx=b.x-a.x,dy=b.y-a.y;
  const qx=(a.x+b.x)/2-dy*.085,qy=(a.y+b.y)/2+dx*.085;
  const el=svgEl("path",{d:"M "+a.x+" "+a.y+" Q "+qx+" "+qy+" "+b.x+" "+b.y,class:"edge"});
  curves.appendChild(el);graphEdges.push({from,to,el});
 }
 graph.appendChild(curves);
 const points=svgEl("g");
 for(const c of concepts){
  const g=svgEl("g",{class:"node","data-id":c.id,role:"button",tabindex:"0","aria-label":"Explore "+c.name,style:"--node-color:"+c.color});
  g.appendChild(svgEl("circle",{cx:c.x,cy:c.y,r:c.r+17,fill:c.color,class:"glow"}));
  g.appendChild(svgEl("circle",{cx:c.x,cy:c.y,r:c.r,fill:"url(#core-fill)",stroke:c.color,class:"core"}));
  g.appendChild(svgEl("circle",{cx:c.x-10,cy:c.y-12,r:Math.max(8,c.r*.21),fill:c.color,opacity:".14"}));
  const tx=c.x+c.r+16,ty=c.y-3,label=svgEl("text",{x:tx,y:ty,class:"label"+(c.name.length>14?" small":"")});
  const words=c.name.split(" ");
  if(words.length>1&&c.name.length>18){
   const mid=Math.ceil(words.length/2);
   label.appendChild(svgEl("tspan",{x:tx,dy:"0"},words.slice(0,mid).join(" ")));
   label.appendChild(svgEl("tspan",{x:tx,dy:"25"},words.slice(mid).join(" ")));
  }else label.textContent=c.name;
  g.appendChild(label);
  g.addEventListener("click",()=>choose(c.id));
  g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(c.id)}});
  points.appendChild(g);graphNodes.set(c.id,g);
 }
 graph.appendChild(points);transform();makeArticleGraph();
}
function makeArticleGraph(){
 const old=graph.querySelector("#dynamic-articles");if(old)old.remove();
 const layer=svgEl("g",{id:"dynamic-articles"});articleNodes.clear();articleEdges.length=0;
 const display=published.slice(0,36);
 const segments=display.length||1;
 display.forEach((a,i)=>{
  const angle=2*Math.PI*i/segments+Math.PI/4;
  const ring=segments>12?(i%2?315:355):320;
  const x=540+ring*Math.cos(angle),y=345+Math.min(1.0,ring/320)*260*Math.sin(angle);
  for(const topic of a.topics.slice(0,3)){
   const c=byId[topic];if(!c)continue;
   const line=svgEl("path",{d:"M "+x+" "+y+" Q "+((x+c.x)/2)+" "+((y+c.y)/2-20)+" "+c.x+" "+c.y,class:"edge article-edge"});
   line.setAttribute("stroke-dasharray","3 7");layer.appendChild(line);articleEdges.push({articleId:a.id,topic,el:line});
  }
  const el=svgEl("g",{class:"article-node",role:"button",tabindex:"0","data-article":a.id,"aria-label":"Explore article "+a.title});
  const title=svgEl("title",{},a.title);el.appendChild(title);
  el.appendChild(svgEl("circle",{cx:x,cy:y,r:19,fill:"#162825",stroke:"#a5f2ce","stroke-width":"1.2"}));
  el.appendChild(svgEl("circle",{cx:x,cy:y,r:8,fill:"#a5f2ce",opacity:".38"}));
  el.appendChild(svgEl("text",{x,y:y+4,"text-anchor":"middle",class:"article-mark"},"A"+(i+1)));
  el.addEventListener("click",()=>chooseArticle(a.id));
  el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();chooseArticle(a.id)}});
  layer.appendChild(el);articleNodes.set(a.id,el);
 });
 graph.appendChild(layer);renderGraphFocus();
}
function transform(){graph.setAttribute("transform","translate("+(550+panX)+" "+(350+panY)+") scale("+zoom+") translate(-550 -350)")}
function sidebarButton(c){
 const btn=document.createElement("button");btn.type="button";btn.className="category-button";
 btn.setAttribute("aria-current",String(selected===c.id&&!selectedArticle));btn.style.setProperty("--node-color",c.color);
 const dot=document.createElement("span");dot.className="dot";
 const name=document.createElement("span");name.className="name";name.textContent=c.name;
 const count=document.createElement("span");count.className="count";count.textContent=String(activeArticles(c.id).length).padStart(2,"0");
 btn.append(dot,name,count);btn.onclick=()=>choose(c.id);category.appendChild(btn);
}
function renderSidebar(){
 category.replaceChildren();
 const all=document.createElement("button");all.className="category-button";all.type="button";
 all.setAttribute("aria-current",String(!selected&&!selectedArticle&&!query));
 all.innerHTML='<span class="dot" style="--node-color:#a5f2ce"></span><span class="name">All Concepts</span><span class="count">08</span>';
 all.onclick=resetChoice;category.appendChild(all);
 const shown=concepts.filter(c=>!query||c.name.toLowerCase().includes(query)||c.description.toLowerCase().includes(query));
 shown.forEach(sidebarButton);
 $("concept-count").textContent=shown.length+" concepts";
 const results=$("search-results");results.replaceChildren();results.hidden=!query;
 if(query){
  const matches=visibleArticles();
  const heading=document.createElement("div");heading.className="search-heading";heading.textContent="Published articles · "+matches.length;
  results.appendChild(heading);
  if(!matches.length){const el=document.createElement("p");el.className="empty";el.textContent="No published articles match yet.";results.appendChild(el)}
  for(const a of matches){
   const button=document.createElement("button");button.type="button";button.className="search-hit";
   const title=document.createElement("strong");title.textContent=a.title;
   const desc=document.createElement("small");desc.textContent=(a.topics||[]).map(id=>topicNames[id]).filter(Boolean).join(" · ")||"Published research";
   button.append(title,desc);button.onclick=()=>chooseArticle(a.id,true);results.appendChild(button);
  }
  if(shown.length===0){const el=document.createElement("p");el.className="empty";el.textContent="No concepts match the search.";category.appendChild(el)}
 }
}
function blockLink(label,url){
 const a=document.createElement("a");a.href=url;a.className="article-small";a.textContent=label;return a;
}
function renderDetail(){
 const a=published.find(item=>item.id===selectedArticle),c=byId[selected];
 $("detail-name").textContent=a?a.title:c?c.name:"Explore the Atlas";
 $("detail-dot").style.background=c?c.color:"#a5f2ce";
 $("detail-dot").style.boxShadow="0 0 15px "+(c?c.color:"#a5f2ce");
 const matches=a?[a]:c?activeArticles(c.id):published;
 $("detail-meta").textContent=a?"PUBLISHED RESEARCH"+(a.publishedAt?" · "+datedLabel(a.publishedAt):""):c?"RESEARCH CONCEPT · "+matches.length+" LINKED "+(matches.length===1?"ARTICLE":"ARTICLES"):"8 CONNECTED CONCEPTS";
 $("detail-description").textContent=a?(a.excerpt||"A published article in the Artificially Intelligent archive."):c?c.description:"Select a concept or article to explore its connections.";
 $("explore-link").href=a?a.url:"../intelligence-index/?q="+encodeURIComponent(c?c.name:"artificial intelligence");
 $("explore-link").textContent=a?"Read full published article ↗":"Explore in the Intelligence Index ↗";
 const stream=$("stream-link");
 stream.hidden=!a;stream.href=a?"../?article="+encodeId(a.id):"../#stream";
 related.replaceChildren();connections.replaceChildren();
 if(!matches.length){const msg=document.createElement("p");msg.className="empty";msg.textContent="No published article linked to this concept yet.";related.appendChild(msg)}
 for(const item of matches){
  const link=document.createElement("a");link.className="article-small";link.href=item.url;
  const meta=document.createElement("small");meta.textContent=datedLabel(item.publishedAt);
  const strong=document.createElement("strong");strong.textContent=item.title;
  link.append(meta,strong);related.appendChild(link);
 }
 const connected=a?a.topics.map(id=>byId[id]).filter(Boolean):c?links.filter(pair=>pair.includes(c.id)).map(pair=>byId[pair[0]===c.id?pair[1]:pair[0]]):concepts;
 for(const item of connected){
  const b=document.createElement("button");b.type="button";b.className="connection";b.style.setProperty("--node-color",item.color);
  const dot=document.createElement("i"),name=document.createElement("span");name.textContent=item.name;
  const tag=document.createElement("small");tag.textContent="Explore ↗";b.append(dot,name,tag);
  b.onclick=()=>choose(item.id);connections.appendChild(b);
 }
 $("relationship-note").textContent=a?(a.topicSource==="keyword"?"Concept tags suggested automatically from the article's text. They are not scholarly citation claims.":"Concept tags are editorial associations."):"Connections represent curated or keyword-derived research pathways, not measured citation relationships.";
}
function renderGraphFocus(){
 for(const [id,el] of graphNodes){
  const relevantArticle=selectedArticle?published.find(a=>a.id===selectedArticle):null;
  const matching=!query||byId[id].name.toLowerCase().includes(query)||byId[id].description.toLowerCase().includes(query)||(relevantArticle&&relevantArticle.topics.includes(id));
  el.classList.toggle("selected",selected===id);el.classList.toggle("dim",!matching);
  el.setAttribute("aria-pressed",String(selected===id));
 }
 for(const edge of graphEdges){
  const match=selected&&(edge.from===selected||edge.to===selected);
  edge.el.classList.toggle("focused",Boolean(match));edge.el.classList.toggle("faded",Boolean(selected&&!match||selectedArticle));
 }
 for(const [id,el] of articleNodes){
  const item=published.find(a=>a.id===id);
  const active=selectedArticle===id;
  const relatedToSelected=!selected||item?.topics.includes(selected);
  const qMatch=!query||articleMatches(item,query);
  el.classList.toggle("selected",active);el.classList.toggle("dim",!active&&(!qMatch||!relatedToSelected));
  el.setAttribute("aria-pressed",String(active));
 }
 for(const edge of articleEdges){
  const focus=selectedArticle?edge.articleId===selectedArticle:selected?edge.topic===selected:!query;
  edge.el.classList.toggle("focused",Boolean(focus));edge.el.classList.toggle("faded",!focus);
 }
 const shown=Math.min(36,published.length);
 $("graph-summary").textContent=concepts.length+" concepts · "+links.length+" concept links · "+shown+" article nodes";
}
function renderPaths(){
 const paths=[
 {id:"consciousness",name:"Can machines be conscious?",desc:"Begin with consciousness, then move through cognition, language, and AI."},
 {id:"archives",name:"What does technology remember?",desc:"Follow archives into memory, identity, culture, and AI."},
 {id:"identity",name:"Who are we in digital systems?",desc:"Explore identity, memory, consciousness, and digital culture."}
 ];
 const list=$("path-grid");list.replaceChildren();
 paths.forEach((p,i)=>{
  const btn=document.createElement("button");btn.type="button";btn.className="path-item";
  const icon=document.createElement("span");icon.className="path-icon";icon.textContent=String(i+1).padStart(2,"0");
  const copy=document.createElement("span"),title=document.createElement("strong");title.textContent=p.name;
  const desc=document.createElement("small");desc.textContent=p.desc;copy.append(title,desc);btn.append(icon,copy);
  btn.onclick=()=>{activeView="graph";setView();choose(p.id)};list.appendChild(btn);
 });
}
function renderTimeline(){
 const list=$("timeline-items");list.replaceChildren();
 const items=visibleArticles().slice().sort((a,b)=>String(b.publishedAt||"").localeCompare(String(a.publishedAt||"")));
 if(!items.length){const msg=document.createElement("p");msg.className="empty";msg.textContent="No published articles match this search.";list.appendChild(msg);return}
 for(const a of items){
  const row=document.createElement("button");row.type="button";row.className="timeline-item";
  const date=document.createElement("time");date.className="timeline-date";date.textContent=datedLabel(a.publishedAt);
  if(a.publishedAt)date.dateTime=a.publishedAt;
  const body=document.createElement("div"),title=document.createElement("strong"),excerpt=document.createElement("p");
  title.textContent=a.title;excerpt.textContent=a.excerpt||"Read this published research article.";
  const meta=document.createElement("small");meta.textContent=(a.topics||[]).map(id=>topicNames[id]).filter(Boolean).join(" · ")||"Published research";
  body.append(title,excerpt,meta);row.append(date,body);
  row.onclick=()=>chooseArticle(a.id);list.appendChild(row);
 }
}
function renderConceptMap(){
 const root=$("map-clusters");root.replaceChildren();
 for(const cl of CLUSTERS){
  const section=document.createElement("section");section.className="cluster";
  const heading=document.createElement("h3");heading.textContent=cl.name;
  const desc=document.createElement("p");desc.textContent=cl.subtitle;
  const chips=document.createElement("div");chips.className="cluster-chips";
  for(const id of cl.ids){
   const c=byId[id],button=document.createElement("button");button.type="button";button.className="cluster-chip";
   button.style.setProperty("--node-color",c.color);
   button.setAttribute("aria-pressed",String(selected===id));
   const count=activeArticles(id).length;
   button.textContent=c.name+" · "+count+" "+(count===1?"article":"articles");
   button.onclick=()=>choose(id);chips.appendChild(button);
  }
  section.append(heading,desc,chips);root.appendChild(section);
 }
}
function renderFeatured(){
 featured.replaceChildren();const items=visibleArticles();
 if(!items.length){const el=document.createElement("p");el.className="empty";el.textContent="No published research matches the current search.";featured.appendChild(el);return}
 for(const a of items){
  const el=document.createElement("a");el.className="feature-card";el.href=a.url;
  const art=document.createElement("div");art.className="feature-art";art.setAttribute("aria-hidden","true");
  const copy=document.createElement("div"),label=document.createElement("small");
  label.textContent=(a.category||"PUBLISHED RESEARCH").toUpperCase()+(a.publishedAt?" · "+datedLabel(a.publishedAt):"");
  const title=document.createElement("h3");title.textContent=a.title;
  const desc=document.createElement("p");desc.textContent=a.excerpt||"Explore this research article.";
  const action=document.createElement("div");action.className="feature-footer";action.textContent="Read article ↗";
  copy.append(label,title,desc,action);el.append(art,copy);featured.appendChild(el);
 }
}
function updateEverything(){renderSidebar();renderDetail();renderGraphFocus();renderTimeline();renderConceptMap();renderFeatured()}
function setView(){
 const viewIds=["graph","timeline","map","paths"];
 for(const id of viewIds){
  const active=activeView===id;
  const panel=$(id+"-panel");panel.hidden=!active;panel.style.display=active?"block":"none";panel.classList.toggle("active",active);
  $(id+"-tab").setAttribute("aria-selected",String(active));
 }
}
for(const id of ["graph","timeline","map","paths"])$(id+"-tab").onclick=()=>{activeView=id;setView()};
$("zoom-in").onclick=()=>{zoom=Math.min(2,zoom+.16);transform()};
$("zoom-out").onclick=()=>{zoom=Math.max(.7,zoom-.16);transform()};
$("zoom-fit").onclick=()=>{zoom=1;panX=0;panY=0;transform()};
$("concept-search").addEventListener("input",e=>{query=escapeText(e.target.value);updateEverything()});
let gesture=null;
svg.addEventListener("pointerdown",e=>{
 if(e.target.closest(".node")||e.target.closest(".article-node"))return;
 gesture={x:e.clientX,y:e.clientY,startX:panX,startY:panY};
 svg.setPointerCapture(e.pointerId);$("graph-panel").classList.add("dragging");
});
svg.addEventListener("pointermove",e=>{
 if(!gesture)return;const box=svg.getBoundingClientRect();
 panX=gesture.startX+(e.clientX-gesture.x)*1100/box.width;
 panY=gesture.startY+(e.clientY-gesture.y)*700/box.height;transform();
});
function stopPan(){gesture=null;$("graph-panel").classList.remove("dragging")}
svg.addEventListener("pointerup",stopPan);svg.addEventListener("pointercancel",stopPan);
svg.addEventListener("wheel",e=>{
 if(e.ctrlKey||e.metaKey||e.shiftKey)return;
 e.preventDefault();zoom=Math.max(.7,Math.min(2,zoom+(e.deltaY<0?.09:-.09)));transform();
},{passive:false});
async function updateManifest(){
 try{
  const response=await fetch(BASE+"manifest.json",{cache:"no-cache",headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("Archive manifest unavailable");
  const manifest=await response.json();
  if(!Array.isArray(manifest.articles))throw new Error("Invalid archive manifest");
  const current=[];
  for(const entry of manifest.articles){
   if(typeof entry.id!=="string"||typeof entry.title!=="string"||typeof entry.url!=="string")continue;
   let parsed;try{parsed=new URL(entry.url,location.href)}catch{continue}
   if(parsed.origin!==location.origin||!parsed.pathname.startsWith("/Artificially-Intelligent/research/published/"))continue;
   const curated=CURATED.find(a=>a.id===entry.id);
   const allowed=Array.isArray(entry.topics)?entry.topics.filter(id=>Boolean(byId[id])):[];
   const topics=allowed.length?allowed:(curated?.topics||[]);
   const excerpt=typeof entry.excerpt==="string"?entry.excerpt:(curated?.excerpt||"");
   const publishedAt=/^\d{4}-\d{2}-\d{2}$/.test(entry.publishedAt||"")?entry.publishedAt:(curated?.publishedAt||"");
   current.push({id:entry.id,title:entry.title,url:parsed.href,topics,excerpt,publishedAt,
    category:typeof entry.category==="string"?entry.category:(curated?.category||"Research"),
    topicSource:typeof entry.topicSource==="string"?entry.topicSource:(curated?"editorial":"unclassified")});
  }
  published=current;
  if(selectedArticle&&!published.some(x=>x.id===selectedArticle)){selectedArticle="";selected="consciousness"}
  $("feed-note").textContent=current.length+" complete published "+(current.length===1?"article":"articles")+" loaded from the live publication manifest. New finished articles appear after the site's feed refresh. Connections are editorial or transparent keyword matches.";
  makeArticleGraph();updateEverything();
 }catch{
  $("feed-note").textContent="The live publication manifest is temporarily unavailable. Showing links to the last known completed articles; unfinished research remains excluded.";
 }
}
const initial=new URLSearchParams(location.search);
if(byId[initial.get("concept")])selected=initial.get("concept");
else if(initial.get("article")){selectedArticle=initial.get("article");selected=""}
makeGraph();renderPaths();setView();updateEverything();updateManifest();

})();
