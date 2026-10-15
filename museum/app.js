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


/* ---------- A different activity in each room ---------- */
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const frame=(title,intro,...body)=>h("div",{class:"act"},h("p",{class:"kicker"},"Activity"),h("h3",null,title),h("p",{class:"note",style:"margin:6px 0 14px"},intro),...body);
const btn=(t,f,c)=>h("button",{class:"btn"+(c?" "+c:""),type:"button",onclick:f},t);

function actTablet(){
  const items=[["Malt",0],["Barley groats",0]],out=h("div",{class:"out","aria-live":"polite"});
  const rows=items.map(it=>{const n=h("output",null,"0");return h("div",{class:"row"},h("span",{class:"lab"},it[0]),btn("−",()=>{it[1]=Math.max(0,it[1]-1);n.textContent=it[1]}),n,btn("+",()=>{it[1]=Math.min(12,it[1]+1);n.textContent=it[1]}))});
  const press=()=>{out.replaceChildren(h("div",{class:"clay"},items.filter(i=>i[1]).map(i=>h("p",null,h("b",null,i[0]),"  ","▸".repeat(i[1])+"  ("+i[1]+")"))),
    h("p",{class:"note"},items.some(i=>i[1])?"Pressed. Three thousand years on, this is all a reader has: names of goods and numbers. Nothing here says who received them, when, or why. The Met says the script carried no grammatical elements, so it could not say it in sentences.":"Nothing pressed yet."))};
  return frame("Keep the temple's ledger","Record what was handed out. Your tablet may only hold names of goods and numbers, as the Met describes for this period. (The goods are those named in the Met's title.)",...rows,btn("Press into the clay",press,"primary"),out);
}
function actLibrary(){
  const N=8;let texts=0,phase=0,halves=[],pick=null,done=0;const stage=h("div",{class:"stage","aria-live":"polite"}),status=h("p",{class:"note"},"");
  const shapes=["◆","▲","●","■","★","✚","⬟","⬢"];
  function render(){
    stage.replaceChildren();
    if(phase===0){stage.append(h("div",{class:"shelf"},Array.from({length:texts},(_,i)=>h("span",{class:"vol"},shapes[i]))));status.textContent=texts+" of "+N+" texts gathered.";
      stage.append(btn("Send an agent for a text",()=>{texts++;if(texts>=N)phase=1;render()},"primary"))}
    if(phase===1){status.textContent="The shelves are full. Now Nineveh falls.";stage.append(btn("Nineveh falls (612 BC)",()=>{halves=shuf(Array.from({length:N},(_,i)=>[i,"L"]).concat(Array.from({length:N},(_,i)=>[i,"R"])));phase=2;done=0;pick=null;render()},"primary"))}
    if(phase===2){status.textContent="Every text is broken in two. Pair the halves: "+done+" of "+N+" restored.";
      stage.append(h("div",{class:"shards"},halves.map((m,k)=>m?h("button",{class:"shard"+(pick===k?" on":""),type:"button","aria-pressed":String(pick===k),"aria-label":"Fragment "+shapes[m[0]]+(m[1]==="L"?" left half":" right half"),onclick:()=>{if(pick===null){pick=k}else if(pick===k){pick=null}else{const a=halves[pick];if(a[0]===m[0]&&a[1]!==m[1]){halves[pick]=null;halves[k]=null;done++;pick=null;if(done===N){phase=3}}else pick=k}render()}},shapes[m[0]]+(m[1]==="L"?"◖":"◗")):h("span",{class:"shard gone"},"✓"))));}
    if(phase===3){status.textContent="";stage.append(h("p",null,"All "+N+" restored here. The British Museum says the real library was sifted, smashed and dumped, and its project is still working out how many tablets there were and how much survives."),btn("Start again",()=>{texts=0;phase=0;render()}))}
  }
  render();
  return frame("Gather, lose, and piece back together","Be the king's agent: collect eight texts. Then the library falls and you sift the pieces. (An exercise: the texts are placeholders.)",stage,status);
}
function actDomesday(){
  const T=["In Edward the Confessor's time (TRE)","When King William granted it","In 1086"];
  const st=T.map(()=>({teams:2,mill:false,val:10}));const out=h("div",{"aria-live":"polite"});
  const stepper=(o,k,lab,min,max)=>{const n=h("output",null,String(o[k]));return h("span",{class:"row"},h("span",{class:"lab"},lab),btn("−",()=>{o[k]=Math.max(min,o[k]-1);n.textContent=o[k]}),n,btn("+",()=>{o[k]=Math.min(max,o[k]+1);n.textContent=o[k]}))};
  const forms=T.map((t,i)=>h("fieldset",{class:"fs"},h("legend",null,t),stepper(st[i],"teams","Plough teams",0,9),stepper(st[i],"val","Value",0,99),h("label",{class:"row"},h("input",{type:"checkbox",onchange:e=>st[i].mill=e.target.checked})," A mill")));
  const record=()=>out.replaceChildren(h("table",null,h("thead",null,h("tr",null,h("th",null,"Asked about"),h("th",null,"Plough teams"),h("th",null,"Mill"),h("th",null,"Value"))),h("tbody",null,T.map((t,i)=>h("tr",null,h("td",null,t),h("td",null,st[i].teams),h("td",null,st[i].mill?"yes":"no"),h("td",null,st[i].val))))),
    h("p",{class:"note"},"Written into the Book. Only what the questions asked is here. Nothing about who lived there beyond the landholder: the National Archives says Domesday is not a census and the people named are almost all landholders."));
  return frame("Put the same questions three times","You are a commissioner. For one invented manor, answer the fixed questions for each of the three dates. The manor is made up; the question pattern (asked three times, TRE, grant, 1086) is from the National Archives guide.",...forms,btn("Write it into the Book",record,"primary"),out);
}
function actPrint(){
  const inp=h("input",{type:"text",maxlength:"60",value:"What is written once can be read many times",class:"txt","aria-label":"A line to print"});
  const grid=h("div",{class:"press","aria-hidden":"true"}),sum=h("p",{class:"note",role:"status"},"");let printed=false;
  const cells=Array.from({length:180},()=>h("i",null));
  const printIt=()=>{printed=true;cells.forEach(c=>c.className="p");grid.replaceChildren(...cells);sum.textContent="180 copies printed: \""+(inp.value.trim()||"…")+"\"."};
  const age=()=>{if(!printed){sum.textContent="Print first.";return}const idx=shuf([...cells.keys()]);idx.forEach((k,n)=>{cells[k].className=n<21?"p full":n<49?"p part":"p lost"});sum.textContent="After the centuries: 49 of 180 survive, 21 of them complete, 28 not complete. Those counts are the Library of Congress's figures for the Gutenberg Bible; which copies survive here is random. Your line is on "+49+" copies."};
  return frame("Print a run","Print 180 copies of a line you choose (the Gutenberg print run was about 180). Then let time pass and see what remains.",h("label",null,"Your line ",inp),h("div",{class:"chips",style:"margin-top:10px"},btn("Print 180 copies",printIt,"primary"),btn("Let the centuries pass",age)),grid,sum);
}
function actSelection(){
  const R=["Minutes of the meeting where a major policy was changed","Visitor parking permits from one year","Third of nine drafts of an annual report","Letters from members of the public about a new law","Duplicate copies of a circular","The staff lunch rota","The signed final contract for a new building","Photographs of a building before it was demolished"];
  const dec=R.map(()=>null),out=h("p",{role:"status"},"");
  const rows=R.map((r,i)=>{const k=h("button",{class:"btn",type:"button","aria-pressed":"false"},"Keep"),l=h("button",{class:"btn",type:"button","aria-pressed":"false"},"Let go");
    const set=v=>{dec[i]=v;k.setAttribute("aria-pressed",String(v==="k"));l.setAttribute("aria-pressed",String(v==="l"));upd()};k.onclick=()=>set("k");l.onclick=()=>set("l");return h("div",{class:"rec"},h("span",null,r),h("span",{class:"chips"},k,l))});
  const upd=()=>{const n=dec.filter(Boolean).length,kept=dec.filter(x=>x==="k").length;out.textContent=n<R.length?n+" of "+R.length+" decided.":"You kept "+kept+" of "+R.length+" and let "+(R.length-kept)+" go. Nothing here is a right answer. The National Archives says selection looks for historical value to an organisation or society, and applies written criteria and policies. You applied your own."};
  return frame("Sit at the appraisal desk","Decide which records to keep for good. The records are invented; the question of historical value is the one the National Archives guidance poses.",h("div",{class:"recs"},rows),out);
}
function actWeb(){
  const P=[["A public page of plain HTML","ok"],["A public news page","ok"],["A page driven by forms and scripts","dyn"],["A page behind a login","pw"],["A results page shown only after submitting a form","form"],["A page on a secure server","sec"],["A page whose site blocks crawlers by robots rules","rob"],["A page its owner asked to have removed","own"],["A public blog post","ok"],["A members-only forum thread","pw"],["A dynamic map page","dyn"],["A public archive index","ok"]];
  const WHY={ok:["Captured","Publicly available, standard HTML archives well."],dyn:["Captured, but not working","Dynamic pages that rely on forms or scripts don't keep their original functionality."],pw:["Not archived","Password-protected pages are not archived."],form:["Not archived","Pages reachable only after submitting a form are not archived."],sec:["Not archived","Pages on secure servers are not archived."],rob:["May be excluded","Pages may be excluded due to robots exclusions."],own:["May be excluded","Pages may be excluded at a site owner's direct request."]};
  const list=h("ul",{class:"pages"},P.map(p=>h("li",{"data-k":p[1]},h("span",null,p[0]),h("em",{class:"res"}," ")))),sum=h("p",{class:"note",role:"status"},"");
  const go=()=>{let c=0;[...list.children].forEach(li=>{const w=WHY[li.dataset.k];li.querySelector(".res").textContent=" → "+w[0]+". "+w[1];li.className=w[0].startsWith("Captured")?"cap":"no";if(w[0]==="Captured")c++});sum.replaceChildren("Fully captured: "+c+" of "+P.length+". These rules are from the Internet Archive's help page; the pages are invented. ",srcBtn("ia-wayback"))};
  return frame("Send the crawler","Twelve invented pages. See what a crawler working by the Internet Archive's stated rules would keep.",list,btn("Send the crawler",go,"primary"),sum);
}
function actModel(){
  const inp=h("textarea",{class:"txt",rows:"2",maxlength:"160","aria-label":"A sentence"},"the archive remembers what the archive can reach");
  const out=h("div",{"aria-live":"polite"});
  const fact=n=>{let r=1n;for(let i=2n;i<=BigInt(n);i++)r*=i;return r};
  const run=()=>{const w=(inp.value.toLowerCase().match(/[\p{L}']+/gu)||[]).slice(0,20);if(!w.length){out.textContent="Type a sentence first.";return}
    const c={};w.forEach(x=>c[x]=(c[x]||0)+1);let d=fact(w.length);for(const k in c)d/=fact(c[k]);
    out.replaceChildren(h("p",{class:"note"},"Reduced to counts, your sentence becomes this:"),h("div",{class:"cloud"},Object.entries(c).map(([k,v])=>h("span",{style:"font-size:"+(0.9+v*0.5)+"rem"},k+(v>1?" ×"+v:"")))),
      h("p",null,"The same counts fit "+d.toLocaleString("en-US")+" different orderings of these words. A record keeps the one you wrote; a count does not."),
      h("p",{class:"note"},"This is an illustration of the difference between a record and a pattern. It is not how GPT-3 or any model works, and the paper's abstract does not describe that. Whether a model 'remembers' is left open here."))};
  return frame("Turn a sentence into a pattern","Type a sentence and see what is left when it is reduced to counts.",inp,h("div",{style:"margin-top:10px"},btn("Reduce it to a pattern",run,"primary")),out);
}
const ACTS={tablet:actTablet,library:actLibrary,domesday:actDomesday,print:actPrint,selection:actSelection,web:actWeb,model:actModel};
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
    h("div",null,ACTS[e.id](),h("details",{class:"wall"},h("summary",null,"Also: leave your mark on the inscription wall"),artwork(e)))),
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
