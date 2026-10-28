"use strict";
/* The Case Grid. Renders structured JSON with safe DOM construction (no innerHTML for data).
   Theory conditions, predictions and AI assessments are read from the Theory Chamber records;
   only the cases and framing questions live in data/cases.json. */
const ROOT=window.__TG_ROOT__||"../";
const SECL={predictions:"Recorded prediction",mechanisms:"Proposed mechanism",criticisms:"Criticism on record",ai:"Conceptual assessment, not experimental evidence",openQuestions:"Open question",evidence:"Supporting evidence",history:"History",foundations:"Foundation",proposition:"Central proposition"};
const STATUS={pred:"Predictions on record",ai:"Conceptual assessment on record",rel:"Related records",none:"Question only"};
const symEl=k=>h("span",{class:"sym "+k,"aria-hidden":"true"});
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const safeHref=u=>{if(!u)return null;if(/^(https:\/\/|#|\.\.?\/)/.test(u))return u;return null};
function h(tag,attrs,...kids){
  const e=document.createElement(tag);
  for(const k in attrs||{}){
    const v=attrs[k];if(v==null||v===false)continue;
    if(k==="class")e.className=v;
    else if(k==="href"){const s=safeHref(v);if(s)e.setAttribute("href",s)}
    else if(k.startsWith("on")&&typeof v==="function")e.addEventListener(k.slice(2),v);
    else e.setAttribute(k,v===true?"":String(v));
  }
  for(const kid of kids.flat(Infinity)){if(kid==null||kid===false)continue;e.append(kid.nodeType?kid:document.createTextNode(String(kid)))}
  return e;
}
const ext=(href,text,cls)=>h("a",{href,target:"_blank",rel:"noopener noreferrer",class:cls},text);
const say=t=>{const l=$("#live");if(!l)return;l.textContent="";setTimeout(()=>l.textContent=t,30)};

let D=null,CASE=null,HL=null;
const claimIdx={};
const TH=id=>D.theories.find(t=>t.id===id);
const SRC=id=>D.sources.find(s=>s.id===id);
const CASES=()=>D.grid.cases;
const CASEOF=id=>CASES().find(c=>c.id===id);

function indexData(){
  D.sources=D.sources.concat(D.grid.extraSources||[]);
  for(const t of D.theories)for(const sec of Object.keys(SECL))for(const c of t[sec]||[])claimIdx[c.id]={t,sec,c};
}
async function load(){
  if(window.__TG_DATA__){D=window.__TG_DATA__}
  else{
    const get=async u=>{const r=await fetch(u,{cache:"no-cache"});if(!r.ok)throw new Error(u+" "+r.status);return r.json()};
    const [th,so,gr]=await Promise.all([get(ROOT+"theory-chamber/data/theories.json"),get(ROOT+"theory-chamber/data/sources.json"),get("data/cases.json")]);
    D={theories:th.items,sources:so.items,grid:gr};
  }
  indexData();
}

/* ---------- small renderers ---------- */
function srcChips(ids){
  const list=[...new Set(ids||[])].map(SRC).filter(Boolean);
  if(!list.length)return null;
  return h("span",{class:"srcs"},list.map(s=>h("span",{class:"src",title:s.title},s.short||s.title)));
}
function srcLink(s){return s.url||(s.doi?"https://doi.org/"+s.doi:null)}
function readList(ids){
  const list=[...new Set(ids)].map(SRC).filter(Boolean);
  if(!list.length)return null;
  return h("details",{class:"read"},
    h("summary",null,"Sources and what was read ("+list.length+")"),
    h("ul",null,list.map(s=>{
      const link=srcLink(s);
      return h("li",null,link?ext(link,(s.short||s.title)+" — "+s.title):(s.short||s.title),
        s.read?h("small",null,"What was read: "+s.read):null,
        s.limitations?h("small",null,"Limits: "+s.limitations):null);
    })));
}
function statusOf(t,c){
  const ids=((c.cells[t.id]||{}).from)||[];
  const secs=ids.map(i=>(claimIdx[i]||{}).sec);
  if(secs.includes("predictions"))return ["pred",ids.length];
  if(secs.includes("ai"))return ["ai",ids.length];
  if(ids.length)return ["rel",ids.length];
  return ["none",0];
}

/* ---------- one theory card for the selected case ---------- */
const wide=()=>window.matchMedia("(min-width:761px)").matches;
function lensCard(t,c,forceOpen){
  const cell=c.cells[t.id]||{},lens=D.grid.lenses[t.id]||{};
  const q=cell.asks||c.ask;
  const prop=(lens.from||[]).map(i=>claimIdx[i]).filter(Boolean);
  const claims=(cell.from||[]).map(i=>claimIdx[i]).filter(Boolean);
  let note=cell.unsettled||c.defaultNote||"";
  if(!cell.unsettled&&c.useGaps&&(t.gaps||[]).length)note="The Theory Chamber lists these gaps for this theory: "+t.gaps.join("; ")+".";
  const used=[...prop.flatMap(x=>x.c.sources),...claims.flatMap(x=>x.c.sources)];
  return h("article",{class:"lens",id:"lens-"+t.id,tabindex:"-1","aria-labelledby":"lh-"+t.id},
    h("header",null,h("span",{class:"badge abbr"},t.abbr),h("h3",{id:"lh-"+t.id},t.name)),
    h("p",{class:"looks"},h("span",{class:"lbl"},"What this theory looks at"),lens.looksAt||t.summary,
      prop.length?srcChips(prop.flatMap(x=>x.c.sources)):null),
    (cell.asks||!c.ask)?h("p",{class:"asks"},h("span",{class:"lbl"},"The question it raises for this case"),q):null,
    h("details",Object.assign({class:"basis"},wide()||forceOpen?{open:true}:{}),
      h("summary",null,"On file in the Theory Chamber: "+(claims.length||"nothing")),
      claims.length?h("ul",null,claims.map(x=>h("li",null,h("span",{class:"kind"},SECL[x.sec]||x.sec),x.c.text,srcChips(x.c.sources)))):
      h("p",{class:"empty"},"Nothing on file for this pairing."+(note?" "+note:"")+" The question above is this site\u2019s framing, not a published result.")),
    claims.length&&note?h("p",{class:"unsettled"},note):null,
    readList(used),
    h("footer",null,h("span",{class:"badge"},"Awaiting Evidence Review"),
      h("a",{href:ROOT+"theory-chamber/#theory-"+t.id},"Open "+t.abbr+" in the Theory Chamber")));
}

/* ---------- panel, picker, overview ---------- */
function renderPanel(){
  const c=CASEOF(CASE),p=$("#panel");
  p.replaceChildren(...[
    h("p",{class:"kicker"},"The case"),
    h("h2",{id:"case-h",tabindex:"-1"},c.name),
    h("p",{class:"lede desc"},c.description),
    h("p",{class:"note"},c.sourceNote,srcChips(c.sources)),
    c.ask?h("p",{class:"asks"},h("span",{class:"lbl"},"The question every theory is asked"),c.ask):null,
    h("div",{class:"lenses"},D.theories.map(t=>lensCard(t,c,t.id===HL)))].filter(Boolean));
}
function markPicker(){$$(".case-btn").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.case===CASE)))}
function select(id,opts){
  opts=opts||{};
  if(!CASEOF(id))id=CASES()[0].id;
  const changed=id!==CASE;CASE=id;
  HL=opts.lens||null;markPicker();renderPanel();
  if(opts.setHash!==false){try{history.replaceState(null,"","#case-"+id)}catch(e){}}
  if((changed||opts.announce)&&!opts.quiet)say("Showing: "+CASEOF(id).name+". Six theories, one question each.");
  if(opts.lens){const el=$("#lens-"+opts.lens);if(el){el.classList.add("hl");el.scrollIntoView({block:"start"});el.focus({preventScroll:true})}}
  else if(opts.scroll){$("#panel").scrollIntoView({block:"start"})}
}
function picker(){
  return h("section",{class:"pick",id:"cases","aria-labelledby":"pick-h"},
    h("h2",{id:"pick-h"},"Choose a case"),
    h("div",{class:"pick-row",role:"group","aria-label":"Cases"},CASES().map((c,i)=>
      h("button",{type:"button",class:"case-btn","data-case":c.id,"aria-pressed":"false",onclick:()=>select(c.id,{scroll:!wide()})},
        h("small",null,"Case "+(i+1)),h("strong",null,c.short)))),
    h("div",{class:"pick-tools"},
      h("button",{type:"button",class:"btn",id:"surprise",onclick:()=>{const o=CASES().filter(c=>c.id!==CASE);select(o[Math.floor(Math.random()*o.length)].id,{announce:true,scroll:!wide()})}},"Surprise me"),
      h("span",{class:"note"},"The link in your address bar always points at the case you are viewing.")));
}
function overview(){
  const cs=CASES();
  const legend=h("ul",{class:"legend","aria-label":"Key"},Object.entries(STATUS).map(([k,l])=>h("li",null,symEl(k),l)));
  const tbl=h("table",{class:"ovt"},
    h("caption",null,"Which pairings have anything on file in the Theory Chamber. This maps what is sourced, not what is true."),
    h("thead",null,h("tr",null,h("th",{scope:"col"},"Theory"),cs.map(c=>h("th",{scope:"col"},c.short)))),
    h("tbody",null,D.theories.map(t=>h("tr",null,
      h("th",{scope:"row"},t.abbr,h("small",null,t.name)),
      cs.map(c=>{const [k,n]=statusOf(t,c),lab=STATUS[k];
        return h("td",{"data-label":c.short},
          h("button",{type:"button",class:"cellbtn "+k,"aria-label":t.abbr+", "+c.short+": "+lab+(n?" ("+n+")":"")+". Show this pairing.",onclick:()=>select(c.id,{lens:t.id})},
            symEl(k),h("span",{class:"t"},lab+(n?" ("+n+")":""))))})))));
  return h("section",{class:"ov","aria-labelledby":"ov-h"},h("h2",{id:"ov-h"},"All "+(cs.length*D.theories.length)+" pairings at a glance"),legend,h("div",{class:"tbl-wrap"},tbl));
}
function limits(){
  return h("section",{class:"limits","aria-labelledby":"lim-h"},
    h("h2",{id:"lim-h"},"What this grid is not"),
    h("ul",null,
      h("li",null,"It does not say whether any case is conscious, and it does not rank the theories."),
      h("li",null,"A question is not a prediction. The questions are this site’s framing of each theory’s stated condition. Only the items marked as on file come from sources."),
      h("li",null,"Nothing on file for a pairing means the sources read for this site do not cover it. It does not mean the theory has nothing to say."),
      h("li",null,"The records behind the grid were summarized from abstracts and pages, not read in full by a person, so every one is marked Awaiting Evidence Review."),
      h("li",null,"The cases are illustrations, not tests.")),
    h("div",{class:"next"},
      h("a",{class:"btn",href:ROOT+"theory-chamber/"},"Compare theories in the Theory Chamber"),
      h("a",{class:"btn",href:ROOT+"#map"},"Consciousness Map"),
      h("a",{class:"btn",href:ROOT+"#lab"},"Experiment Lab")));
}
function build(){
  const main=$("#main");
  main.replaceChildren(h("div",{class:"wrap view"},
    h("section",{class:"intro","aria-labelledby":"t"},
      h("p",{class:"kicker"},"Explore · Case Grid"),
      h("h1",{class:"h-l",id:"t"},"One case, six theories"),
      h("p",{class:"lede"},"Pick something that might or might not be conscious, and see what question each theory of consciousness raises about it. Same case, six different questions."),
      h("p",{class:"note"},"No verdicts and no scores. Where a source has put a theory to work on a case, you will see it. Where none has, the grid says so.")),
    picker(),
    h("section",{class:"panel",id:"panel","aria-labelledby":"case-h","aria-live":"off"}),
    overview(),
    limits()));
}
const caseFromHash=()=>{const m=/^#case-([a-z0-9-]+)$/.exec(location.hash);return m&&CASEOF(m[1])?m[1]:null};

(async function init(){
  try{await load()}
  catch(e){const m=$("#main");if(m)m.replaceChildren(h("p",{class:"note",role:"alert"},"The Case Grid could not load its records. Please try again later."));return}
  build();
  select(caseFromHash()||CASES()[0].id,{setHash:!!caseFromHash(),quiet:true});
  addEventListener("hashchange",()=>{const c=caseFromHash();if(c&&c!==CASE)select(c,{setHash:false,scroll:true})});
})();
