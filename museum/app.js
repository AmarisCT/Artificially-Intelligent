"use strict";
/* The Museum of Human Memory. Safe DOM construction; no innerHTML for data. */
const $=(s,r=document)=>r.querySelector(s);
const safeHref=u=>/^(https:\/\/|#|\.\.?\/)/.test(u||"")?u:null;
function h(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){const v=attrs[k];if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);else if(k==="href"){const s=safeHref(v);if(s)e.setAttribute("href",s)}else if(k==="style")e.style.cssText=v;else e.setAttribute(k,v===true?"":v)}
  for(const kid of kids.flat(Infinity)){if(kid==null||kid===false)continue;e.append(kid.nodeType?kid:document.createTextNode(String(kid)))}return e}
const say=t=>{const l=$("#live");l.textContent="";setTimeout(()=>l.textContent=t,30)};
let D=null;const SRC=id=>D.sources.find(s=>s.id===id);
async function load(){
  if(window.__MM_DATA__)D=window.__MM_DATA__;
  else{const r=await fetch("data/museum.json",{cache:"no-cache"});if(!r.ok)throw new Error("data "+r.status);D=await r.json()}
}
function inspect(id){
  const s=SRC(id);if(!s)return;let d=$("#insp");if(d)d.remove();
  d=h("dialog",{class:"insp",id:"insp","aria-labelledby":"insp-t"},h("h2",{id:"insp-t"},s.title),
    h("dl",null,h("dt",null,"Publisher"),h("dd",null,s.publisher),h("dt",null,"What was read for this exhibit"),h("dd",null,s.read),h("dt",null,"Checked"),h("dd",null,"15 October 2026")),
    h("div",{class:"chips"},h("a",{class:"btn primary",href:s.url,target:"_blank",rel:"noopener noreferrer"},"Open the source ↗"),h("button",{class:"btn",type:"button",onclick:()=>d.close()},"Close")));
  document.body.append(d);d.addEventListener("close",()=>d.remove());d.showModal();
}
const srcBtn=id=>h("button",{class:"src",type:"button",onclick:()=>inspect(id),"aria-label":"Source: "+(SRC(id)||{}).title},SRC(id)?SRC(id).publisher.split(",")[0]:id);

/* ---------- Interactive artwork: the Inscription Wall ---------- */
const ART={
 tablet:{label:"Press a mark into the clay.",rule:"Clay keeps what is pressed into it. In this room nothing you add is ever removed.",pass:"Let time pass",after:"Nothing changed. The marks are still here."},
 library:{label:"Add a mark. It is shelved in order.",rule:"The library gathers marks into rows.",pass:"Let Nineveh fall",after:"The shelves are smashed. Every piece is still here, but the order is gone. The British Museum describes a library that was sifted, deliberately smashed and dumped."},
 domesday:{label:"Click in the top band (landholders) or the lower band (everyone else).",rule:"Only the top band is written into the Book.",pass:"Write the Book",after:"Only the marks in the top band were recorded. The Domesday guide says the people named are almost all landholders."},
 print:{label:"Add a mark. Six copies are printed.",rule:"Every mark is printed as six copies.",pass:"Let the centuries pass",after:""},
 web:{label:"Add a mark. Marks outside the dashed zone are crawled.",rule:"The dashed zone stands for password-protected pages, which the Wayback Machine does not archive.",pass:"Let the technology change",after:"Marks the crawlers reached are kept. The rest are gone."},
 model:{label:"Add a mark. Watch what happens to it.",rule:"A mark you add is dissolved into a cloud of faint points.",pass:"Ask the model to recall",after:"No single original remains to point to. This is an artist's picture, not a claim about how any model works."},
 selection:{label:"Add a mark. Marks in the left half are selected for permanent keeping.",rule:"Only marks in the left half meet the selection criteria in this artwork.",pass:"Apply selection",after:"Marks outside the selected half were not kept. In real archives the criteria are published; here they are arbitrary."}
};
function artwork(era){
  const spec=ART[era.id],W=800,H=600;let marks=[],msg="";
  const cv=h("canvas",{width:W,height:H,role:"img","aria-label":"Inscription wall. "+spec.rule});const cx=cv.getContext("2d");
  const hue=era.hue;
  /* Each room has its own kind of mark. */
  function glyph(m){
    cx.lineWidth=2;cx.beginPath();
    if(m.frag){cx.moveTo(-8,6);cx.lineTo(2,-9);cx.lineTo(9,5);cx.closePath();cx.fill();return}
    switch(era.id){
      case "tablet":cx.moveTo(-10,-3);cx.lineTo(10,0);cx.lineTo(-10,3);cx.closePath();cx.fill();cx.beginPath();cx.moveTo(10,0);cx.lineTo(26,0);cx.stroke();break; /* cuneiform wedge */
      case "library":cx.rect(-16,-10,32,20);cx.fill();cx.globalAlpha=.5;cx.strokeStyle="#070706";cx.beginPath();cx.moveTo(-10,-3);cx.lineTo(10,-3);cx.moveTo(-10,3);cx.lineTo(6,3);cx.stroke();break; /* tablet on a shelf */
      case "domesday":for(let i=-2;i<=1;i++){cx.moveTo(i*7+3,-12);cx.lineTo(i*7+3,12)}cx.moveTo(-16,8);cx.lineTo(14,-8);cx.stroke();break; /* tally */
      case "print":cx.rect(-7,-13,14,26);cx.fill();cx.fillStyle="#070706";cx.fillRect(-3,-9,6,3);cx.fillRect(-1,-9,2,16);break; /* a piece of type */
      case "selection":cx.moveTo(-12,-15);cx.lineTo(6,-15);cx.lineTo(13,-8);cx.lineTo(13,15);cx.lineTo(-12,15);cx.closePath();cx.stroke();cx.moveTo(-6,-2);cx.lineTo(7,-2);cx.moveTo(-6,5);cx.lineTo(7,5);cx.stroke();break; /* a record */
      case "web":cx.moveTo(0,-13);cx.lineTo(13,0);cx.lineTo(0,13);cx.lineTo(-13,0);cx.closePath();cx.fill();break; /* a pixel */
      case "model":cx.arc(0,0,5,0,6.3);cx.fill();for(let i=0;i<6;i++){const a=i*Math.PI/3;cx.moveTo(Math.cos(a)*7,Math.sin(a)*7);cx.lineTo(Math.cos(a)*15,Math.sin(a)*15)}cx.stroke();break; /* a node */
      default:cx.arc(0,0,6,0,6.3);cx.fill()}
  }
  function draw(){
    cx.fillStyle="#070706";cx.fillRect(0,0,W,H);cx.lineWidth=2;cx.strokeStyle="rgba(255,255,255,.07)";
    if(era.id==="library"){for(let r=1;r<6;r++){cx.beginPath();cx.moveTo(40,r*95);cx.lineTo(W-40,r*95);cx.stroke()}}
    if(era.id==="domesday"){cx.fillStyle="rgba(255,255,255,.04)";cx.fillRect(0,0,W,H/2);cx.fillStyle="#968f80";cx.font="16px sans-serif";cx.fillText("Landholders (written into the Book)",16,28);cx.fillText("Everyone else (not named)",16,H/2+28);cx.beginPath();cx.moveTo(0,H/2);cx.lineTo(W,H/2);cx.stroke()}
    if(era.id==="web"){cx.setLineDash([8,8]);cx.strokeStyle="rgba(255,255,255,.3)";cx.strokeRect(W*.55,H*.15,W*.38,H*.65);cx.setLineDash([]);cx.fillStyle="#968f80";cx.font="15px sans-serif";cx.fillText("not archived",W*.57,H*.15+24)}
    if(era.id==="selection"){cx.fillStyle="rgba(255,255,255,.04)";cx.fillRect(0,0,W/2,H);cx.fillStyle="#968f80";cx.font="16px sans-serif";cx.fillText("Selected for permanent keeping",16,28)}
    for(const m of marks){
      cx.globalAlpha=m.a==null?1:m.a;cx.strokeStyle=m.c||hue;cx.fillStyle=m.c||hue;
      if(m.dot){cx.beginPath();cx.arc(m.x,m.y,m.r||2,0,6.3);cx.fill()}
      else{cx.save();cx.translate(m.x,m.y);cx.rotate(m.rot||0);glyph(m);cx.restore()}
      if(m.ring){cx.beginPath();cx.arc(m.x,m.y,18,0,6.3);cx.stroke()}
    }
    cx.globalAlpha=1;
  }
  const rot=()=>(Math.random()-.5)*.8;
  function add(x,y){
    if(era.id==="library"){const n=marks.filter(m=>!m.frag).length,col=n%14,row=Math.floor(n/14)%5;marks.push({x:70+col*50,y:70+row*95,rot:0,home:true})}
    else if(era.id==="print"){for(let i=0;i<6;i++)marks.push({x:Math.min(W-30,Math.max(30,x+(i%3-1)*70)),y:Math.min(H-20,Math.max(20,y+(i<3?-26:26))),rot:rot()})}
    else if(era.id==="model"){marks.push({x,y,rot:rot()})}
    else marks.push({x,y,rot:rot(),in:era.id==="domesday"?y<H/2:era.id==="selection"?x<W/2:null});
    msg="";draw();status()
  }
  function pass(){
    if(!marks.length){msg="Add a mark first.";status();return}
    if(era.id==="library"){const out=[];for(const m of marks){if(m.frag)continue;for(let i=0;i<3;i++)out.push({x:Math.random()*(W-60)+30,y:Math.random()*(H-60)+30,rot:Math.random()*6.3,frag:true,a:.8})}marks=out;msg=spec.after}
    else if(era.id==="domesday"){const kept=marks.filter(m=>m.in).length;marks=marks.filter(m=>m.in);msg=spec.after+" ("+kept+" recorded.)"}
    else if(era.id==="print"){const p=49/180,before=marks.length;marks=marks.filter(()=>Math.random()<p);msg=before+" printed, "+marks.length+" survive here. The survival chance used is 49 of about 180, the Library of Congress figures for the Gutenberg Bible. One run of chance, not a forecast."}
    else if(era.id==="web"){const zone=m=>m.x>W*.55&&m.x<W*.93&&m.y>H*.15&&m.y<H*.8;marks.forEach(m=>{if(!zone(m))m.ring=true});const before=marks.length;marks=marks.filter(m=>m.ring);msg=spec.after+" ("+marks.length+" of "+before+" captured.)"}
    else if(era.id==="model"){const out=[];for(const m of marks){if(m.dot)continue;for(let i=0;i<40;i++)out.push({dot:true,x:m.x+(Math.random()+Math.random()+Math.random()-1.5)*90,y:m.y+(Math.random()+Math.random()+Math.random()-1.5)*90,r:1+Math.random()*2.5,a:.25+Math.random()*.4})}marks=out.length?out:marks;msg=spec.after}
    else if(era.id==="selection"){const before=marks.length;marks=marks.filter(m=>m.in);msg=spec.after+" ("+marks.length+" of "+before+" kept.)"}
    else msg=spec.after;
    draw();status();say(msg)
  }
  const st=h("p",{role:"status"},"");function status(){st.textContent=(msg?msg+" ":"")+"Marks on the wall: "+marks.length+"."}
  cv.addEventListener("pointerdown",e=>{const r=cv.getBoundingClientRect();add((e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height)});
  const ctl=h("div",{class:"ctl"},
    h("button",{class:"btn",type:"button",onclick:()=>add(60+Math.random()*(W-120),50+Math.random()*(H-100))},"Add a mark"),
    h("button",{class:"btn primary",type:"button",onclick:pass},spec.pass),
    h("button",{class:"btn",type:"button",onclick:()=>{marks=[];msg="Cleared.";draw();status()}},"Clear"));
  const box=h("div",{class:"art"},cv,ctl,h("p",null,h("strong",null,"Artwork, not data. "),spec.label+" "+spec.rule),st);
  draw();status();return box;
}

/* ---------- views ---------- */
const view=n=>{const m=$("#main");m.replaceChildren(n);document.querySelectorAll(".nav a").forEach(a=>{a.removeAttribute("aria-current");})};
const setNav=r=>document.querySelectorAll(".nav a").forEach(a=>a.dataset.r===r?a.setAttribute("aria-current","page"):0);
function entrance(){
  const doors=D.eras.map(e=>h("a",{class:"door",href:"#room-"+e.id,style:"--hue:"+e.hue},h("span",{class:"num"},e.n),h("span",null,h("b",null,e.title),h("br"),h("span",{class:"note"},e.intro)),h("small",null,e.when)));
  return h("div",{class:"wrap"},
   h("p",{class:"kicker"},"Artificially Intelligent · A virtual exhibition"),
   h("h1",{class:"h-xl"},"The Museum of Human Memory"),
   h("p",{class:"lede",style:"margin-top:22px"},"A walk through seven rooms about how people have kept knowledge: clay, a royal library, a government survey, the printing press, archives, the web, and language models. In each room you can inspect an object, ask what was kept and what was lost, and press your own marks into an artwork."),
   h("p",{class:"note",style:"margin-top:16px"},"Every factual line is tied to a source you can open. Where this exhibit offers its own reading, it says so. Where the sources read for this exhibit are silent, the exhibit says that too."),
   h("div",{class:"chips",style:"margin-top:26px"},h("a",{class:"btn primary",href:"#room-tablet"},"Begin in the first room"),h("a",{class:"btn",href:"#sources"},"See all sources")),
   h("div",{class:"hall"},doors));
}
function room(id){
  const i=D.eras.findIndex(e=>e.id===id);if(i<0)return entrance();const e=D.eras[i],A=e.artifact;
  const answer=(label,val,sec)=>{const b=h("button",{class:"ask",type:"button","aria-expanded":"false"},label);const slot=h("div",{"aria-live":"polite"});
    b.addEventListener("click",()=>{const open=b.getAttribute("aria-expanded")==="true";b.setAttribute("aria-expanded",String(!open));slot.replaceChildren();if(!open)slot.append(h("div",{class:"ans"},val?h("p",null,val[0],srcBtn(val[1])):h("p",{class:"none"},sec||"The sources read for this exhibit don't say.")))});return h("div",null,b,slot)};
  return h("div",{class:"wrap",style:"--hue:"+e.hue},
   h("nav",{class:"tl","aria-label":"Rooms"},D.eras.map(x=>h("a",{href:"#room-"+x.id,style:"--hue:"+x.hue,"aria-current":x.id===e.id?"page":null},x.n+". "+x.id))),
   h("p",{class:"kicker",style:"margin-top:26px"},"Room "+e.n+" of "+D.eras.length),
   h("h1",{class:"h-l"},e.title),
   h("p",{style:"margin:12px 0 0"},h("span",{class:"pill"},e.when),"  ",h("span",{class:"note"},e.where)),
   h("p",{class:"lede",style:"margin-top:18px"},e.intro),
   h("div",{class:"room"},
    h("div",null,
     h("article",{class:"card"},h("p",{class:"kicker"},"Object"),h("h3",null,A.name),h("p",{class:"line"},A.line),
       h("ul",{class:"facts"},A.facts.map(f=>h("li",null,f[0],srcBtn(f[1]))))),
     e.id==="model"?h("div",{class:"ans",style:"margin-top:20px"},h("p",{class:"kicker"},"An open question"),h("p",null,e.open)):
     h("div",{class:"asks"},answer("What was kept?",e.kept),answer("What was lost?",e.lost),answer("Who decided?",e.decides,"The sources read for this exhibit don't say who decided.")),
     h("div",{class:"reading"},h("p",{class:"kicker"},"This exhibit's reading, not a sourced claim"),h("p",{style:"margin:0"},e.reading))),
    h("div",null,artwork(e))),
   h("div",{class:"pn"},i>0?h("a",{class:"btn",href:"#room-"+D.eras[i-1].id},"← "+D.eras[i-1].title):h("a",{class:"btn",href:"#entrance"},"← Entrance"),
     i<D.eras.length-1?h("a",{class:"btn primary",href:"#room-"+D.eras[i+1].id},D.eras[i+1].title+" →"):h("a",{class:"btn primary",href:"#sources"},"All sources →")));
}
function sources(){
  return h("div",{class:"wrap"},h("p",{class:"kicker"},"Sources"),h("h1",{class:"h-l"},"What this exhibit rests on"),
   h("p",{class:"lede",style:"margin-top:14px"},"Ten sources, each read on 15 October 2026. The column on the right says how much of each was actually read."),
   h("table",{class:"sec"},h("thead",null,h("tr",null,h("th",null,"Source"),h("th",null,"What was read"))),h("tbody",null,D.sources.map(s=>h("tr",null,h("td",null,h("a",{href:s.url,target:"_blank",rel:"noopener noreferrer"},s.title),h("br"),h("span",{class:"note"},s.publisher)),h("td",{class:"note"},s.read))))));
}
function notes(){
  return h("div",{class:"wrap"},h("p",{class:"kicker"},"Notes"),h("h1",{class:"h-l"},"Where sources differ, and what the exhibit does not claim"),
   h("ul",{class:"facts sec",style:"max-width:70ch"},D.notes.map(n=>h("li",null,n))));
}
function route(){
  if(!D)return;const hs=(location.hash||"#entrance").slice(1);let n,r="entrance";
  if(hs.startsWith("room-")){n=room(hs.slice(5));r="room"}else if(hs==="sources"){n=sources();r="sources"}else if(hs==="notes"){n=notes();r="notes"}else n=entrance();
  view(n);setNav(r);const t=n.querySelector("h1");document.title=(r==="entrance"?"":t.textContent+" · ")+"The Museum of Human Memory · Artificially Intelligent";window.scrollTo(0,0);$("#main").focus({preventScroll:true})
}
addEventListener("hashchange",route);
load().then(route).catch(e=>{$("#main").replaceChildren(h("p",{class:"wrap note"},"The museum data could not be loaded. "+e.message))});
