"use strict";
/* The Inquiry Engine: interface. All data comes from the shared research index; all text is inserted with textContent. */
const ROOT = window.OBS_ROOT || "../";
const SEARCH_URL = (window.__LINKS && window.__LINKS.search) || new URL(ROOT + "search/", location.href).href;
const NS = "http://www.w3.org/2000/svg";
function h(t, a, ...k) { const e = document.createElement(t); for (const [n, v] of Object.entries(a || {})) { if (v == null || v === false) continue; if (n === "class") e.className = v; else if (n.startsWith("on")) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v === true ? "" : v); } for (const c of k.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; }
function sv(t, a, ...k) { const e = document.createElementNS(NS, t); for (const [n, v] of Object.entries(a || {})) { if (v == null) continue; if (n.startsWith("on")) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v); } for (const c of k.flat(9)) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; }
const safeHref = u => /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "#";
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
const $ = (s, r) => (r || document).querySelector(s);
const clip = (s, n) => (s || "").length > n ? s.slice(0, n - 1).trimEnd() + "…" : (s || "");
const enc = q => btoa(unescape(encodeURIComponent(q))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec = s => { try { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); } catch (e) { return ""; } };

const TYPES = { concept: "Concept", question: "Open question", theory: "Theory", source: "Publication", article: "Essay", audio: "Audio essay", museum: "Museum room", comparison: "Comparison", lesson: "Lesson", course: "Course" };
const EXAMPLES = ["Can intelligence exist without consciousness?", "Can artificial intelligence genuinely understand meaning?", "What makes an experience conscious?", "Can a machine develop self-awareness?", "Is memory necessary for personal identity?", "What distinguishes human cognition from machine learning?", "What would count as evidence of machine consciousness?", "Could consciousness exist independently of a biological brain?"];
const KIND_LABEL = { editorial: "Editorial link", "verified-metadata": "Verified from publication metadata", preliminary: "Preliminary (automatic)", automatic: "Automatic (from your wording)" };

let ENG, RULES, INQ = null, TRAIL = [], MAP = null, NOTES = "";
const UI = { tab: "guided", step: 0, insp: null, more: {}, mapView: (typeof innerWidth !== "undefined" && innerWidth < 720) ? "list" : "map", jcoll: "" };
let VERSION = "";

function say(m) { const l = $("#live"); if (l) { l.textContent = ""; setTimeout(() => l.textContent = m, 30); } }
function toast(m) { say(m); const t = h("div", { class: "toast", role: "status" }, m); document.body.append(t); setTimeout(() => t.remove(), 2600); }

/* ---------- storage: own journal + shared Reading Desk (same key and shape as the other rooms) ---------- */
const JK = "ai_inquiry_v1", DESKKEY = "ai_desk_v1";
const jget = () => { const d = LS.get(JK, null); return d && d.v === 1 ? d : { v: 1, inv: [], res: [], colls: [] }; };
const jset = d => LS.set(JK, d) || (toast("Saving is blocked by your browser settings."), false);
const deskRead = () => { const o = LS.get(DESKKEY, null); return o && Array.isArray(o.items) ? o : { items: [], last: null }; };
const deskHas = k => deskRead().items.some(x => x.k === k);
function deskToggle(k) { const o = deskRead(), i = o.items.findIndex(x => x.k === k); if (i >= 0) o.items.splice(i, 1); else o.items.push({ k, note: "", coll: "", t: Date.now() }); if (!LS.set(DESKKEY, { items: o.items, last: o.last == null ? null : o.last })) { toast("Saving is blocked by your browser settings."); return deskHas(k); } return deskHas(k); }
const resSaved = id => jget().res.some(x => x.id === id);
function resToggle(id) { const d = jget(), i = d.res.findIndex(x => x.id === id); if (i >= 0) d.res.splice(i, 1); else d.res.push({ id, t: Date.now(), coll: "" }); jset(d); return resSaved(id); }

/* ---------- pieces ---------- */
const R = id => ENG.get(id);
function badge(t) { return h("span", { class: "tag" }, TYPES[t] || t); }
function reasonList(reasons) {
  if (!reasons || !reasons.length) return null;
  return h("details", { class: "w" }, h("summary", null, "Why this appears (" + reasons.length + ")"),
    h("ul", { class: "why" }, reasons.map(r => h("li", { class: r.kind === "preliminary" ? "pre" : "" }, r.text))));
}
function openLink(r, label) { return h("a", { class: "btn sm", href: safeHref(r.url), target: "_blank", rel: "noopener" }, label || "Open ↗"); }
function saveBar(r) {
  const bar = h("span", { class: "row" });
  const b = h("button", { class: "btn sm", type: "button", "aria-pressed": String(resSaved(r.id)) }, resSaved(r.id) ? "Saved to Journal" : "Save to Journal");
  b.addEventListener("click", () => { const on = resToggle(r.id); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Saved to Journal" : "Save to Journal"; say(on ? "Saved to your Inquiry Journal in this browser." : "Removed from your Inquiry Journal."); });
  bar.append(b);
  if (r.deskKey) {
    const d = h("button", { class: "btn sm", type: "button", "aria-pressed": String(deskHas(r.deskKey)) }, deskHas(r.deskKey) ? "On Reading Desk" : "Save to Reading Desk");
    d.addEventListener("click", () => { const on = deskToggle(r.deskKey); d.setAttribute("aria-pressed", String(on)); d.textContent = on ? "On Reading Desk" : "Save to Reading Desk"; say(on ? "Saved to your Reading Desk in this browser." : "Removed from your Reading Desk."); });
    bar.append(d);
  }
  return bar;
}
function evTags(r) {
  const t = [];
  if (r.evidenceLabel) t.push(h("span", { class: "tag mint" }, r.evidenceLabel));
  if (r.preprint) t.push(h("span", { class: "tag amber" }, "Preprint, not peer reviewed"));
  if (r.classification) t.push(h("span", { class: "tag amber dash" }, "Preliminary classification"));
  return t;
}
function resCard(id, o) {
  o = o || {}; const r = R(id); if (!r) return null;
  const meta = [];
  if (r.type === "source") meta.push((r.authors || []).slice(0, 3).join(", ") + ((r.authors || []).length > 3 ? " et al." : "") + (r.year ? " (" + r.year + "). " : ". ") + (r.venue || ""));
  if (r.type === "article") meta.push((r.category || "Essay") + " · " + (r.date || "") + (r.readingMinutes ? " · " + r.readingMinutes + " min read" : ""));
  if (r.type === "question") meta.push("Status: " + (r.status || []).join(", "));
  if (r.type === "museum" && r.when) meta.push(r.when);
  if (r.type === "lesson" || r.type === "course") meta.push((r.course ? r.course + " · " : "") + r.level + " · " + (r.type === "lesson" ? r.minutes + " min" : "about " + Math.round(r.minutes / 6) / 10 + " hours"));
  const acts = h("div", { class: "row", style: "margin-top:8px" });
  if (r.type === "source") acts.append(h("button", { class: "btn sm", type: "button", onclick: () => inspect(id) }, "Inspect source"));
  if (r.type === "question") acts.append(h("button", { class: "btn sm", type: "button", onclick: () => branch(r) }, "Investigate this question →"));
  acts.append(openLink(r, r.type === "source" ? "Original publication ↗" : "Open ↗"));
  if (!o.noSave) acts.append(saveBar(r));
  return h("article", { class: "card" }, h("div", null, badge(r.type), o.tags || null, r.type === "source" ? evTags(r) : null, o.preliminary ? h("span", { class: "tag amber dash" }, "Unreviewed association") : null),
    h("h4", null, h("a", { href: safeHref(r.url), target: "_blank", rel: "noopener" }, r.title)),
    meta.length ? h("p", { class: "meta" }, meta.join(" ")) : null,
    r.summary && !o.noSummary ? h("p", null, clip(r.summary, o.long ? 560 : 260)) : null,
    h("p", { class: "meta" }, r.attribution + " · " + r.reviewStatus), reasonList(o.reasons), acts);
}
function moreList(key, items, make, n) {
  n = n || 4; const wrap = h("div"); const shown = UI.more[key] ? items : items.slice(0, n);
  shown.forEach(i => wrap.append(make(i)));
  if (items.length > n) wrap.append(h("button", { class: "btn sm", type: "button", onclick: () => { UI.more[key] = !UI.more[key]; paint(); } }, UI.more[key] ? "Show fewer" : "Show all " + items.length));
  return wrap;
}

/* ---------- source inspector ---------- */
function inspect(id) { UI.insp = id; paint(); const p = $("#insp"); if (p) p.focus(); }
function closeInspector() { UI.insp = null; paint(); }
function inspectorPanel() {
  const r = R(UI.insp); if (!r) return null;
  const dl = h("dl");
  const row = (k, v) => { if (v == null || v === "" || (Array.isArray(v) && !v.length)) return; dl.append(h("dt", null, k), h("dd", null, v)); };
  row("Type", TYPES[r.type]);
  if (r.type === "source") {
    row("Authors", (r.authors || []).join(", ") || "Not recorded");
    row("Published", [r.year, r.venue].filter(Boolean).join(" · "));
    row("Identifier", r.doi ? h("a", { href: safeHref("https://doi.org/" + r.doi), target: "_blank", rel: "noopener" }, "DOI " + r.doi) : "No DOI recorded");
    row("Kind of work", r.evidenceLabel);
    row("How this site read it", r.read || (r.access === "metadata-only" ? "Metadata record only; no abstract retrieved." : r.access));
    row("Site description (a paraphrase, awaiting review)", r.summary || "No abstract was retrieved, so the site has no description of this work.");
    const pq = r.perQuestion || {}, qid = INQ && INQ.primary ? INQ.primary.slice(2) : null;
    if (qid && pq[qid]) { row("What it contributes to the question “" + clip(R(INQ.primary).title, 70) + "”", pq[qid].finding); row("Limits noted for this question", pq[qid].limit); }
    else Object.entries(pq).slice(0, 2).forEach(([q, v]) => row("Noted for " + (R("q:" + q) ? clip(R("q:" + q).title, 60) : q), [v.finding, v.limit].filter(Boolean).join(" Limits: ")));
    row("Limitations (as recorded)", r.limitations);
    row("Classification", r.classification);
    row("In the index from", (r.origins || []).join("; "));
  } else {
    row("Description", r.summary); row("Source", r.attribution);
  }
  row("Review status", r.reviewStatus);
  if (r.mergedOn) row("Merged records", "This record was merged from " + (r.mergedOn.length + 1) + " listings by " + r.mergedOn.join("; "));
  const lab = h("details", { class: "w" }, h("summary", null, "How to read the labels on this page"), h("ul", { class: "why" },
    h("li", null, "Empirical finding, philosophical argument, theoretical proposal, review: the kind of work, as recorded for the source."),
    h("li", null, "Site description / contribution: the site's paraphrase, written from the abstract or page named above. Editorial interpretation, not the authors' words."),
    h("li", null, "Unreviewed association (dashed): assigned by software from titles and metadata; no one has read the paper for this purpose."),
    h("li", null, "AI-generated summaries: none. This index contains no AI-written summaries.")));
  return h("aside", { class: "panel insp", id: "insp", tabindex: "-1", "aria-label": "Source inspector" },
    h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "kicker", style: "margin:0" }, "Source inspector"), h("button", { class: "btn sm", type: "button", onclick: closeInspector }, "Close")),
    h("h3", null, r.title), dl, lab, h("div", { class: "row", style: "margin-top:14px" }, openLink(r, r.type === "source" ? "Original publication ↗" : "Open ↗"), saveBar(r)));
}

/* ---------- navigation helpers ---------- */
function ask(q) { q = (q || "").trim(); if (!q) { toast("Type a question first."); return; } const hh = "#q-" + enc(q); if (location.hash === hh) route(); else location.hash = hh; }
function branch(r) { ask(r.title); }
function siteNav() {
  const n = $("#site"); n.textContent = "";
  [["Atlas", ROOT + "research-atlas/"], ["Theory Chamber", ROOT + "theory-chamber/"], ["Unanswered Archive", ROOT + "unanswered-archive/"], ["Observatory", ROOT + "research-observatory/"], ["Museum", ROOT + "museum/"], ["Learning Institute", ROOT + "learning-institute/"], ["Search", SEARCH_URL]].forEach(([t, u]) => n.append(h("a", { href: safeHref(u.startsWith("http") ? u : new URL(u, location.href).href) }, t)));
  [["Inquiry Engine", "#entrance", /^#(entrance|q-.*)?$/.test(location.hash) || !location.hash], ["Index", "#index", location.hash === "#index"], ["Journal", "#journal", location.hash === "#journal"], ["How it works", "#how", location.hash === "#how"]].forEach(([t, u, cur]) => n.append(h("a", { href: u, "aria-current": cur ? "page" : null }, t)));
}

/* ---------- pages ---------- */
function app() { return $("#app"); }
function mount(...k) { const a = app(); a.textContent = ""; a.append(...k.flat().filter(Boolean)); const m = $("#main"); m.focus({ preventScroll: true }); window.scrollTo(0, 0); }

function pageEntrance() {
  document.title = "The Inquiry Engine · Artificially Intelligent";
  const c = ENG.counts(); const inp = h("input", { id: "q", type: "text", placeholder: "What would you like to understand?", "aria-label": "Your research question", autocomplete: "off", maxlength: "240" });
  const form = h("form", { class: "ask", role: "search", onsubmit: e => { e.preventDefault(); ask(inp.value); } }, inp, h("button", { class: "btn primary", type: "submit" }, "Begin Investigation →"));
  const svg = sv("svg", { viewBox: "0 0 400 400", "aria-hidden": "true" });
  [60, 110, 160, 190].forEach((r, i) => svg.append(sv("circle", { cx: 200, cy: 200, r, fill: "none", stroke: i % 2 ? "#232a2b" : "#2b3a35", "stroke-dasharray": i % 2 ? "3 6" : "none" })));
  [[200, 140], [286, 168], [122, 238], [262, 300], [150, 98]].forEach(([x, y]) => { svg.append(sv("line", { x1: 200, y1: 200, x2: x, y2: y, stroke: "#3e5c50", "stroke-width": 1 }), sv("circle", { cx: x, cy: y, r: 5, fill: "#0a0d0e", stroke: "#8fe9c4" })); });
  svg.append(sv("circle", { cx: 200, cy: 200, r: 17, fill: "#8fe9c4" }), sv("text", { x: 200, y: 208, "text-anchor": "middle", "font-family": "Newsreader, Georgia, serif", "font-size": 22, fill: "#04100b" }, "?"));
  const ex = h("ol", { class: "ex" }, EXAMPLES.map((q, i) => h("li", null, h("button", { type: "button", onclick: () => ask(q) }, h("span", { class: "n" }, String(i + 1).padStart(2, "0")), q))));
  mount(
    h("section", { class: "hero" }, h("div", null, h("p", { class: "kicker" }, "Feature 8 · Preview"), h("h1", null, "THE INQUIRY ENGINE"), h("p", { class: "sub" }, "Begin with a question. Discover the connections."),
      h("p", { class: "lede" }, "Ask about intelligence, consciousness, memory or identity. The Engine builds a pathway through the concepts, theories, open questions, publications and essays published on this site, and shows why each one appears."), form), svg),
    h("section", null, h("h2", null, "Or begin with one of these"), ex),
    h("div", { class: "strip" }, h("b", null, "What the Engine searches: "), "only what is published on Artificially Intelligent. It does not write answers and it does not send your question anywhere.",
      h("ul", { class: "counts" }, ["question", "theory", "comparison", "concept", "source", "article", "museum"].map(t => h("li", null, h("b", null, c[t]), " " + ({ question: "open questions", theory: "theories", comparison: "theory comparisons", concept: "concepts", source: "publications", article: "published essays", museum: "museum rooms" })[t]))),
      h("p", { class: "meta", style: "margin:10px 0 0" }, "Not searched: private Architect content, unfinished drafts, and the placeholder articles still in development. Not yet connected, because they are not published: the Lexicon of Intelligence, Human × Machine Dialogues and the Thinkers Archive.")));
  inp.focus({ preventScroll: true });
}

function pageHow() {
  document.title = "How the Inquiry Engine works · Artificially Intelligent";
  const c = ENG.counts();
  mount(h("p", { class: "kicker" }, "How it works"), h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "How the Engine builds a pathway"),
    h("div", { class: "grid2" },
      h("div", null, h("h3", null, "1. It reads your wording"), h("p", null, "Your question is split into words and matched, by fixed rules, against an editorial vocabulary of concepts (for example “consciousness”, “self awareness”, “biological brain”). Matching words is not proof that two ideas are related, so every match is shown with the words that triggered it."),
        h("h3", null, "2. It looks up real records"), h("p", null, "It scores the shared research index: " + Object.entries(c).map(([k, v]) => v + " " + (TYPES[k] || k).toLowerCase() + "s").join(", ") + ". The score is only used to order results. No score, count of citations or consensus rating is shown, because none is available to the site."),
        h("h3", null, "3. It explains each result"), h("p", null, "Each card has a “Why this appears” note: a concept in your question, a link recorded in the Unanswered Archive or Theory Chamber, or wording in the record's text.")),
      h("div", null, h("h3", null, "Two kinds of link"), h("p", null, h("b", null, "Editorial links"), " were recorded by a person in the Archive, Theory Chamber or Atlas and are drawn as solid lines. ", h("b", null, "Automatic or preliminary links"), " were assigned by software from titles, metadata or your wording and are drawn as dashed lines and labelled “unreviewed association”."),
        h("h3", null, "No generated answers"), h("p", null, "This version does not use an AI model. Every sentence it shows comes from a site record. A future AI step would need a server so that keys stay private, and it would be restricted to quoting retrieved records with their citations; none is included here."),
        h("h3", null, "Your privacy"), h("p", null, "Questions are processed in your browser. The Journal and Reading Desk save to this browser only. They do not sync between devices."),
        h("h3", null, "New essays"), h("p", null, "The index is rebuilt by a script from the public article list; a newly published essay appears after the next rebuild. Index built: " + (VERSION || "unknown") + "."))),
    h("div", { class: "row", style: "margin-top:18px" }, h("a", { class: "btn", href: "#entrance" }, "← Ask a question")));
}

function pageIndex() {
  document.title = "The research index · Artificially Intelligent";
  const state = { q: "", types: new Set() }; const out = h("div"); const q = h("input", { type: "text", "aria-label": "Search the index", placeholder: "Search every indexed resource" });
  const chips = h("div", { class: "row", style: "margin:10px 0" }, Object.keys(TYPES).filter(t => ENG.counts()[t]).map(t => h("button", { class: "btn sm", type: "button", "aria-pressed": "false", onclick: e => { if (state.types.has(t)) state.types.delete(t); else state.types.add(t); e.currentTarget.setAttribute("aria-pressed", String(state.types.has(t))); draw(); } }, TYPES[t] + " (" + ENG.counts()[t] + ")")));
  function draw() {
    out.textContent = ""; const types = state.types.size ? Array.from(state.types) : null;
    if (state.q.trim()) {
      const res = ENG.search(state.q, { types, limit: 25 }).results;
      if (!res.length) { out.append(h("p", { class: "note" }, "Nothing in the index matches. Try fewer or different words.")); return; }
      out.append(h("p", { class: "meta" }, res.length + " results, ordered by how well they match (no score is shown)."));
      res.forEach(x => out.append(resCard(x.id, { reasons: x.reasons })));
    } else {
      const list = ENG.all().filter(r => !types || types.includes(r.type)).slice(0, 40);
      out.append(h("p", { class: "meta" }, "Showing " + list.length + " of " + ENG.all().filter(r => !types || types.includes(r.type)).length + ". Type to search."));
      list.forEach(r => out.append(resCard(r.id, { noSummary: false })));
    }
  }
  q.addEventListener("input", () => { state.q = q.value; draw(); });
  mount(h("p", { class: "kicker" }, "Shared research index"), h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Everything the Engine can search"),
    h("p", { class: "lede" }, "One index of the site's published research: the same one the Inquiry Engine uses, and the one a site-wide search can use."), q, chips, out);
  draw();
}

function pageJournal() {
  document.title = "Inquiry Journal · Artificially Intelligent";
  const d = jget(); const f = UI.jcoll;
  const collSel = h("select", { "aria-label": "Filter by collection", onchange: e => { UI.jcoll = e.target.value; pageJournal(); } }, h("option", { value: "" }, "All collections"), d.colls.map(c => h("option", { value: c, selected: c === f ? "" : null }, c)));
  const newC = h("input", { type: "text", placeholder: "Name a new collection", "aria-label": "New collection name", maxlength: "60" });
  const assign = (list, i) => h("select", { "aria-label": "Collection", onchange: e => { const dd = jget(); dd[list][i].coll = e.target.value; jset(dd); } }, h("option", { value: "" }, "No collection"), d.colls.map(c => h("option", { value: c, selected: c === d[list][i].coll ? "" : null }, c)));
  const inv = d.inv.map((x, i) => ({ x, i })).filter(o => !f || o.x.coll === f);
  const res = d.res.map((x, i) => ({ x, i })).filter(o => !f || o.x.coll === f);
  mount(h("p", { class: "kicker" }, "Inquiry Journal"), h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Your saved research"),
    h("p", { class: "note ok" }, "Saved in this browser only. It does not sync to other devices, and clearing your browser data removes it. Items saved to the Reading Desk stay in the Reading Desk and are not removed from here."),
    h("div", { class: "row" }, collSel, newC, h("button", { class: "btn sm", type: "button", onclick: () => { const v = newC.value.trim(); if (!v) return; const dd = jget(); if (!dd.colls.includes(v)) dd.colls.push(v); jset(dd); pageJournal(); } }, "Create collection")),
    h("h2", { style: "margin-top:24px" }, "Saved investigations"),
    inv.length ? inv.map(({ x, i }) => h("article", { class: "card" }, h("h4", null, x.q), h("p", { class: "meta" }, "Saved " + new Date(x.t).toLocaleDateString() + ". Opening it runs the question again against the current index."),
      h("label", { class: "meta", for: "nt" + i }, "Private notes"), h("textarea", { id: "nt" + i, onchange: e => { const dd = jget(); dd.inv[i].notes = e.target.value; jset(dd); say("Notes saved in this browser."); } }, x.notes || ""),
      h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn sm", type: "button", onclick: () => ask(x.q) }, "Open investigation"), assign("inv", i), h("button", { class: "btn sm", type: "button", onclick: () => { const dd = jget(); dd.inv.splice(i, 1); jset(dd); pageJournal(); } }, "Remove")))) : h("p", { class: "meta" }, "None yet. Save an investigation from its Summary tab."),
    h("h2", { style: "margin-top:24px" }, "Saved resources"),
    res.length ? res.map(({ x, i }) => { const r = R(x.id); if (!r) return null; return h("article", { class: "card" }, badge(r.type), h("h4", null, h("a", { href: safeHref(r.url), target: "_blank", rel: "noopener" }, r.title)), h("p", { class: "meta" }, r.attribution),
      h("div", { class: "row" }, assign("res", i), r.deskKey ? h("a", { class: "btn sm", href: safeHref(new URL(ROOT + "#desk", location.href).href) }, "Open Reading Desk") : null, h("button", { class: "btn sm", type: "button", onclick: () => { const dd = jget(); dd.res.splice(i, 1); jset(dd); pageJournal(); } }, "Remove"))); }) : h("p", { class: "meta" }, "None yet."),
    h("p", { class: "meta", style: "margin-top:18px" }, "Observatory papers and essays are saved here only. The Reading Desk accepts questions, theories, comparisons and sources."));
}

/* ---------- inquiry ---------- */
function route() {
  siteNav();
  const hs = (location.hash || "#entrance").slice(1);
  if (hs.startsWith("q-")) { const q = dec(hs.slice(2)); if (q) return openInquiry(q); }
  if (hs === "journal") return pageJournal();
  if (hs === "index") return pageIndex();
  if (hs === "how") return pageHow();
  pageEntrance();
}
function openInquiry(q) {
  const i = TRAIL.findIndex(t => t.q === q);
  if (i >= 0) { if (i < TRAIL.length - 1) toast("That question is already on your path, so you have returned to it."); TRAIL = TRAIL.slice(0, i + 1); }
  const visited = TRAIL.slice(0, i >= 0 ? i : TRAIL.length).map(t => t.primary).filter(Boolean);
  INQ = ENG.inquire(q, { visited }); NOTES = "";
  if (i < 0) TRAIL.push({ q, primary: INQ.primary }); else TRAIL[i].primary = INQ.primary;
  UI.tab = "guided"; UI.step = 0; UI.insp = null; UI.more = {}; MAP = null;
  document.title = clip(q, 70) + " · Inquiry Engine";
  pageInquiry(); say("Investigation ready: " + INQ.steps.length + " steps.");
}

function pageInquiry() {
  const head = h("div", null,
    h("nav", { class: "crumbs", "aria-label": "Your path" }, h("button", { type: "button", onclick: () => { location.hash = "#entrance"; } }, "New question"),
      TRAIL.map((t, i) => [h("span", { "aria-hidden": "true" }, "›"), i === TRAIL.length - 1 ? h("span", { class: "cur", "aria-current": "page" }, t.q) : h("button", { type: "button", onclick: () => ask(t.q) }, t.q)])),
    h("h1", { class: "qhead", tabindex: "-1", id: "qh" }, INQ.query),
    h("div", null, INQ.terms.map(t => h("span", { class: "tag mint" }, t.label)), INQ.terms.length ? null : h("span", { class: "meta" }, "No vocabulary terms recognised")));
  const tabs = h("nav", { class: "tabs", role: "tablist", "aria-label": "Investigation views" }, [["guided", "Guided Inquiry"], ["map", "Independent Inquiry · Pathway Map"], ["sources", "Sources"], ["summary", "Summary"]].map(([k, t]) =>
    h("button", { role: "tab", id: "tab-" + k, "aria-selected": String(UI.tab === k), onclick: () => { UI.tab = k; paint(); } }, t)));
  const body = h("div", { id: "body" });
  mount(head, INQ.empty ? null : tabs, body); paint();
}
function paint() {
  const body = $("#body"); if (!body) return;
  body.textContent = ""; document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", String(b.id === "tab-" + UI.tab)));
  if (INQ.empty) { body.append(emptyState()); return; }
  const main = UI.tab === "guided" ? guided() : UI.tab === "map" ? mapTab() : UI.tab === "sources" ? sourcesTab() : summaryTab();
  const insp = inspectorPanel();
  body.append(h("div", { class: "layout" + (insp ? " has-insp" : "") + (UI.tab === "guided" ? "" : " one") }, ...main, insp));
  if (UI.tab !== "guided") body.firstChild.style.gridTemplateColumns = insp && innerWidth > 1100 ? "1fr 340px" : "1fr";
}

function emptyState() {
  const near = (INQ.nearest || []).map(n => resCard(n.id, { reasons: n.reasons }));
  return h("div", { class: "panel" }, h("h3", null, "The site does not cover this yet"),
    h("p", null, "None of the words in your question matched the site's vocabulary or any open question, so the Engine has not built a pathway. It would rather say so than guess."),
    near.length ? [h("p", { class: "meta" }, "Closest records by wording only:"), near] : null,
    h("p", null, "Try one of these instead:"), h("ul", { class: "ex", style: "grid-template-columns:1fr" }, EXAMPLES.slice(0, 4).map(q => h("li", null, h("button", { type: "button", onclick: () => ask(q) }, q)))));
}

/* ----- guided ----- */
function guided() {
  const steps = INQ.steps; if (UI.step >= steps.length) UI.step = steps.length - 1;
  const s = steps[UI.step];
  const list = h("ol", { class: "steps", "aria-label": "Steps" }, steps.map((st, i) => h("li", null, h("button", { type: "button", "aria-current": i === UI.step ? "step" : null, onclick: () => { UI.step = i; paint(); } }, h("span", { class: "n" }, String(i + 1).padStart(2, "0")), st.title))));
  const why = INQ.orderNotes.length ? h("p", { class: "meta", style: "margin-top:12px" }, "Why this order: " + INQ.orderNotes.join(" ")) : null;
  const prev = h("button", { class: "btn", type: "button", disabled: UI.step === 0 ? "" : null, onclick: () => { UI.step--; paint(); window.scrollTo(0, 0); } }, "← Previous");
  const next = UI.step < steps.length - 1 ? h("button", { class: "btn primary", type: "button", onclick: () => { UI.step++; paint(); window.scrollTo(0, 0); } }, "Next: " + steps[UI.step + 1].title + " →") : h("button", { class: "btn primary", type: "button", onclick: () => { UI.tab = "summary"; paint(); window.scrollTo(0, 0); } }, "See the summary →");
  const cov = INQ.coverage.length ? h("div", { class: "cov" }, h("b", null, "Coverage notes"), h("ul", null, INQ.coverage.map(c => h("li", null, c)))) : null;
  return [h("div", null, list, why), h("div", null, h("section", { class: "panel", "aria-labelledby": "sh" }, h("div", { class: "stephd" }, h("h2", { id: "sh" }, "Step " + String(UI.step + 1).padStart(2, "0") + " · " + s.title), h("p", null, s.objective)), STEP[s.id](s)), h("div", { class: "nav2" }, prev, next), h("p", { style: "margin:10px 0 0" }, h("a", { class: "btn sm", href: safeHref(SEARCH_URL.split("#")[0] + "#s-" + enc((TRAIL[TRAIL.length - 1] || {}).q || "")), target: "_blank", rel: "noopener" }, "Search All Research →"), h("span", { class: "meta" }, "  Opens the same records as a keyword search.")), UI.step === steps.length - 1 || UI.step === 0 ? cov : null)];
}
const STEP = {
  understand(s) {
    const p = s.primary ? R(s.primary) : null; const out = [h("p", null, "You asked: ", h("i", null, "“" + INQ.query + "”"))];
    if (INQ.terms.length) out.push(h("div", null, h("p", { class: "grp" }, "Terms recognised"), INQ.terms.map(t => h("span", { class: "tag mint", title: "Matched “" + t.matched + "”" }, t.label + " (“" + t.matched + "”)")), INQ.linked.length ? [h("p", { class: "grp" }, "Related terms, linked by the site"), INQ.linked.slice(0, 6).map(l => h("span", { class: "tag dash", title: l.kind === "same" ? "Same idea under two names" : "Closely related, not identical" }, l.label + " ↔ " + l.via))] : null));
    if (p) {
      out.push(h("p", { class: "grp" }, INQ.primaryClose ? "The closest open question on this site" : "The nearest open question on this site (not a close match)"));
      const u = p.understand && p.understand.length ? p.understand : [p.summary, p.scope].filter(Boolean);
      out.push(h("article", { class: "card" }, badge("question"), h("h4", null, h("a", { href: safeHref(p.url), target: "_blank", rel: "noopener" }, p.title)),
        h("p", { class: "meta" }, "Status: " + (p.status || []).join(", ") + " · " + p.reviewStatus), u.map(t => h("p", null, t)), h("p", { class: "meta" }, p.understand && p.understand.length ? "Editorial framing from the Unanswered Archive investigation." : "From the Unanswered Archive question record."),
        reasonList((INQ.questions[0] || {}).reasons), h("div", { class: "row" }, openLink(p, "Open in the Archive ↗"), saveBar(p))));
      const others = s.readings.filter(x => x !== s.primary);
      if (others.length) { out.push(h("p", { class: "grp" }, "Other ways the question can be read")); others.forEach(id => { const q = R(id); out.push(h("article", { class: "card" }, badge("question"), h("h4", null, q.title), h("p", null, clip(q.summary, 240)), reasonList((INQ.questions.find(x => x.id === id) || {}).reasons), h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => branch(q) }, "Investigate this reading →"), openLink(q)))); }); }
    } else out.push(h("p", { class: "note" }, "No open question on this site matches your wording. The steps that follow rely on the terms recognised above."));
    return out;
  },
  define(s) {
    const out = [INQ && !RULES.features.lexicon ? h("p", { class: "note" }, "The Lexicon of Intelligence is not published yet, so these descriptions come from the Research Atlas and the Theory Chamber. They are short working descriptions, not full definitions.") : null];
    s.items.forEach(it => { if (!it.id) out.push(h("div", { class: "card" }, h("h4", null, it.missing), h("p", { class: "meta" }, it.reasons[0].text))); else out.push(resCard(it.id, { reasons: it.reasons, long: true, noSave: false })); });
    return out;
  },
  theories(s) {
    return [h("p", { class: "note" }, "Listed as potentially related. The Engine does not say whether a theory is supported or refuted; that needs a reading of the research, and the Theory Chamber records are still awaiting evidence review."),
      moreList("theories", s.items, it => resCard(it.id, { reasons: it.reasons }), 4)];
  },
  evidence(s) {
    const groups = RULES.evidenceGroups, byG = {}; groups.forEach(g => byG[g.id] = []);
    s.items.forEach(it => { const r = R(it.id), g = groups.find(g => g.types.includes(r.evidenceType == null ? null : r.evidenceType)) || groups[groups.length - 1]; byG[g.id].push(it); });
    const out = [h("p", { class: "note" }, "These are the publications the site holds for this question. They are grouped by the kind of work the site recorded. The Engine does not weigh the evidence or say which side it favours.")];
    let shown = 0; const cap = UI.more.evidence ? 999 : 8;
    groups.forEach(g => { const items = byG[g.id]; if (!items.length) return; out.push(h("p", { class: "grp" }, g.label + " (" + items.length + ")")); items.forEach(it => { if (shown++ < cap) out.push(resCard(it.id, { reasons: it.reasons, preliminary: it.preliminary })); }); });
    if (s.items.length > 8) out.push(h("button", { class: "btn sm", type: "button", onclick: () => { UI.more.evidence = !UI.more.evidence; paint(); } }, UI.more.evidence ? "Show fewer" : "Show all " + s.items.length));
    return out;
  },
  compare(s) {
    const out = [];
    if (s.contested.length) { out.push(h("p", { class: "grp" }, "Disagreement recorded in the Archive")); s.contested.forEach(id => { const q = R(id); out.push(h("article", { class: "card" }, badge("question"), h("h4", null, q.title), h("p", null, q.statusJustification || "Marked as contested in the Unanswered Archive."), h("div", { class: "row" }, openLink(q, "Read the full record ↗")))); }); }
    if (s.items.length) { out.push(h("p", { class: "grp" }, "Side-by-side comparisons in the Theory Chamber")); s.items.forEach(it => out.push(resCard(it.id, { reasons: it.reasons }))); }
    return out;
  },
  unknown(s) {
    return [h("p", { class: "note" }, "Status labels and open problems are copied from the Unanswered Archive. Finding a publication does not change a question's status; only an editorial review does."),
      s.items.map(u => { const q = R(u.id); return h("article", { class: "card" }, badge("question"), h("h4", null, h("a", { href: safeHref(q.url), target: "_blank", rel: "noopener" }, q.title)), h("div", null, (u.status || []).map(x => h("span", { class: "tag mint" }, x))), u.problems.length ? h("ul", null, u.problems.map(p => h("li", null, p))) : h("p", { class: "meta" }, "No open problems are listed for this question yet."), h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => branch(q) }, "Investigate this question →"), openLink(q, "Open in the Archive ↗"))); })];
  },
  continue(s) {
    const out = [];
    const aud = s.items.filter(i => i.group === "audio");
    const ess = s.items.filter(i => i.group === "essay"), rooms = s.items.filter(i => i.group === "room"), lessons = s.items.filter(i => i.group === "lesson");
    if (ess.length) { out.push(h("p", { class: "grp" }, "Essays on this site")); ess.forEach(i => out.push(resCard(i.id, { reasons: i.reasons }))); }
    if (aud.length) { out.push(h("p", { class: "grp" }, "Listen"), h("p", { class: "meta" }, "Recordings of published essays in the Listening Room. A recording presents an essay; it is not additional evidence."), ...aud.map(i => resCard(i.id, { reasons: i.reasons }))); }
    if (lessons.length) { out.push(h("p", { class: "grp" }, "Learn the foundations"), h("p", { class: "meta" }, "Lessons in the Learning Institute that explain ideas behind this question. They explain concepts and do not settle open questions."), ...lessons.map(i => resCard(i.id, { reasons: i.reasons }))); }
    if (rooms.length) { out.push(h("p", { class: "grp" }, "A place to explore")); rooms.forEach(i => out.push(resCard(i.id, { reasons: i.reasons }))); }
    if (s.branches.length) { out.push(h("p", { class: "grp" }, "Questions this one leads to")); s.branches.forEach(b => out.push(resCard(b.id, { reasons: b.reasons, tags: h("span", { class: "tag mint" }, "Editorial link") }))); }
    if (s.papers.length) { out.push(h("p", { class: "grp" }, "Recently collected papers (unreviewed)")); s.papers.forEach(p => out.push(resCard(p.id, { reasons: p.reasons, preliminary: true }))); }
    const first = INQ.terms[0] && R("concept:" + INQ.terms[0].concept);
    out.push(h("p", { class: "grp" }, "Elsewhere on the site"), h("div", { class: "row" },
      first && first.url.indexOf("#dossier-") > 0 ? h("a", { class: "btn sm", href: safeHref(first.url) }, "Explore “" + first.title + "” in the Research Atlas →") : null,
      h("a", { class: "btn sm", href: safeHref(new URL(ROOT + "research-observatory/", location.href).href) }, "Browse the Research Observatory →"),
      h("a", { class: "btn sm", href: safeHref(new URL(ROOT + "intelligence-index/", location.href).href) }, "Search external scholarly sources →")));
    if (!ess.length) out.push(h("p", { class: "note", style: "margin-top:12px" }, "No published essay on this site addresses these terms directly yet."));
    return out;
  }
};

/* ----- sources tab ----- */
function sourcesTab() {
  const ids = INQ.sourcesAll;
  return [h("div", null, h("p", { class: "note" }, "Every publication tied to this investigation, in one place. Use “Inspect source” to see how the site read it and what is known about its limits."),
    ids.length ? ids.map(id => { const it = INQ.steps.find(s => s.id === "evidence"); const x = it && it.items.find(i => i.id === id); return resCard(id, { reasons: x ? x.reasons : [], preliminary: x && x.preliminary }); }) : h("p", { class: "panel" }, "The index holds no publication tied to this question yet."))];
}

/* ----- summary tab ----- */
function summaryTab() {
  const S = ENG.summarise(INQ, { notes: NOTES }); const sec = (t, body) => h("section", { class: "sumsec" }, h("h4", null, t), body);
  const li = (a, f) => a.length ? h("ul", null, a.map(f)) : h("p", { class: "meta" }, "None in the index.");
  const notes = h("textarea", { "aria-label": "Your private notes", placeholder: "Your own notes (saved with the investigation if you choose to save it)", oninput: e => { NOTES = e.target.value; } }, NOTES);
  const text = () => ENG.summaryText(ENG.summarise(INQ, { notes: NOTES }));
  const copy = h("button", { class: "btn", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(text()); toast("Summary copied."); } catch (e) { const ta = h("textarea", null, text()); document.body.append(ta); ta.select(); try { document.execCommand("copy"); toast("Summary copied."); } catch (er) { toast("Copying is blocked here. Use Download instead."); } ta.remove(); } } }, "Copy summary");
  const dl = h("button", { class: "btn", type: "button", onclick: () => { const a = h("a", { href: URL.createObjectURL(new Blob([text()], { type: "text/plain" })), download: "investigation-summary.txt" }); document.body.append(a); a.click(); a.remove(); } }, "Download as text");
  const save = h("button", { class: "btn primary", type: "button", onclick: () => { const d = jget(); const ex = d.inv.find(x => x.q === INQ.query); if (ex) { ex.notes = NOTES || ex.notes; ex.t = Date.now(); } else d.inv.push({ id: Date.now().toString(36), q: INQ.query, t: Date.now(), notes: NOTES, coll: "" }); if (jset(d)) toast("Investigation saved to your Journal in this browser."); } }, "Save investigation");
  return [h("div", { class: "panel" }, h("div", { class: "stephd" }, h("h2", null, "Investigation summary"), h("p", null, "What the site's index holds. Not an answer.")),
    sec("Original question", h("p", null, S.question)),
    sec("Important concepts", S.concepts.length ? h("p", null, S.concepts.join(" · ")) : h("p", { class: "meta" }, "None recognised.")),
    sec("Relevant theories", S.theories.length ? h("p", null, S.theories.join(" · ")) : h("p", { class: "meta" }, "None linked.")),
    sec("Available evidence", li(S.evidence, e => h("li", null, e.authors + (e.year ? " (" + e.year + "). " : ". "), h("i", null, e.title), (e.venue ? ". " + e.venue : "") + " ", e.url ? h("a", { href: safeHref(e.doi ? "https://doi.org/" + e.doi : e.url), target: "_blank", rel: "noopener" }, e.doi ? "DOI" : "link") : null, h("span", { class: "meta" }, " · " + e.kind)))),
    sec("Competing interpretations", S.competing.length ? h("ul", null, S.competing.map(c => h("li", null, h("a", { href: safeHref(c.url), target: "_blank", rel: "noopener" }, c.title), ": " + clip(c.note, 240)))) : h("p", { class: "meta" }, "None recorded on this site for this question.")),
    sec("Unresolved questions", li(S.unresolved, u => h("li", null, u.text, h("span", { class: "meta" }, " · " + clip(u.from, 60))))),
    sec("Recommended reading", li(S.reading, r => h("li", null, h("a", { href: safeHref(r.url), target: "_blank", rel: "noopener" }, r.title), h("span", { class: "meta" }, " · " + r.kind)))),
    sec("Sources used", h("p", { class: "meta" }, S.evidence.length + " publications listed above, all from the site's index (Unanswered Archive, Theory Chamber, Research Observatory).")),
    h("p", { class: "note" }, S.caveat), sec("Your notes", notes), h("div", { class: "row" }, save, copy, dl, h("a", { class: "btn", href: "#journal" }, "Open Journal")))];
}

/* ----- pathway map ----- */
const SHAPE = {
  circle: (s) => sv("circle", { r: 11, class: "sh" }),
  diamond: () => sv("path", { d: "M0,-14 L14,0 L0,14 L-14,0Z", class: "sh" }),
  hex: () => sv("path", { d: "M-13,0 L-6.5,-11.3 L6.5,-11.3 L13,0 L6.5,11.3 L-6.5,11.3Z", class: "sh" }),
  square: () => sv("rect", { x: -10, y: -10, width: 20, height: 20, class: "sh" }),
  page: () => sv("path", { d: "M-9,-12 L4,-12 L9,-7 L9,12 L-9,12Z M4,-12 L4,-7 L9,-7", class: "sh" }),
  tri: () => sv("path", { d: "M0,-13 L13,10 L-13,10Z", class: "sh" }),
};
const NSHAPE = { concept: "circle", question: "diamond", theory: "hex", source: "square", article: "page", museum: "tri", comparison: "hex" };
const ORDER = ["concept", "question", "theory", "source", "article", "museum", "comparison"], RAD = { concept: 120, question: 185, theory: 190, source: 215, article: 225, museum: 225, comparison: 215 };
function mapInit() {
  const g = ENG.graphFor(INQ); MAP = { nodes: new Map(), edges: g.edges.map(e => Object.assign({}, e)), sel: null, hist: [], view: { x: 0, y: 0, k: 1 } };
  const groups = {}; g.nodes.forEach(n => { if (n.id === "ask") MAP.nodes.set("ask", Object.assign({ x: 0, y: 0, a: 0, r: 0 }, n)); else (groups[n.type] = groups[n.type] || []).push(n); });
  const RANK = { ask: 0, concept: 1, question: 1, theory: 2, comparison: 3, source: 3, article: 3, museum: 3 };
  MAP.all = false;
  const present = ORDER.filter(t => groups[t]), total = Math.max(1, g.nodes.length - 1), gap = 16, avail = 360 - gap * present.length;
  let spans = present.map(t => Math.max(groups[t].length > 1 ? 44 : 26, avail * groups[t].length / total)); const sum = spans.reduce((a, b) => a + b, 0); spans = spans.map(s => s * avail / sum);
  let a0 = -100;
  const typeOf = id => id === "ask" ? "ask" : (R(id) || {}).type;
  const prim = INQ.primary;
  g.nodes.forEach(n => { if (n.id === "ask") return; const cands = MAP.edges.filter(e => (e.a === n.id || e.b === n.id)).map(e => ({ e, o: e.a === n.id ? e.b : e.a })).filter(c => RANK[typeOf(c.o)] < RANK[n.type] || (RANK[typeOf(c.o)] === RANK[n.type] && c.o === "ask"));
    cands.sort((x, y) => ((x.e.kind === "editorial" || x.e.kind === "verified-metadata" ? 0 : 1) - (y.e.kind === "editorial" || y.e.kind === "verified-metadata" ? 0 : 1)) || ((y.o === prim) - (x.o === prim)) || (RANK[typeOf(y.o)] - RANK[typeOf(x.o)]));
    if (cands[0]) cands[0].e.main = true; });
  MAP.edges.forEach(e => { if (e.a === "ask" || e.b === "ask") { const o = e.a === "ask" ? e.b : e.a; if (typeOf(o) === "concept" || typeOf(o) === "question") e.main = true; } });
  present.forEach((t, gi) => { const list = groups[t]; list.forEach((n, i) => { const a = (a0 + spans[gi] * (i + .5) / list.length) * Math.PI / 180, r = RAD[t] + (list.length > 3 ? [0, 34, 68, 17][i % 4] : 0); MAP.nodes.set(n.id, Object.assign({ x: Math.cos(a) * r * 1.25, y: Math.sin(a) * r, a, r }, n)); }); a0 += spans[gi] + gap; });
  fitView();
}
function mapSelect(id, push) { if (push !== false && MAP.sel) MAP.hist.push(MAP.sel); MAP.sel = id; paintMap(); }
function mapExpand(id) {
  const p = MAP.nodes.get(id), ex = new Set(MAP.nodes.keys()), nb = ENG.neighbours(id, ex); if (!nb.length) { toast("No further connections in the index."); return; }
  const base = Math.atan2(p.y, p.x / 1.25), spread = 0.9;
  nb.forEach((n, i) => { const r = R(n.id), a = base + (i - (nb.length - 1) / 2) * (spread / Math.max(1, nb.length - 1)), rad = Math.hypot(p.x / 1.25, p.y) + 80 + (i % 2) * 28;
    MAP.nodes.set(n.id, { id: n.id, type: r.type, label: r.abbr && r.type === "theory" ? r.abbr : r.title, x: Math.cos(a) * rad * 1.25, y: Math.sin(a) * rad, a, r: rad, added: true }); });
  nb.forEach(n => MAP.edges.push({ a: id, b: n.id, why: n.why, kind: n.kind, main: true }));
  nb.forEach(n => ENG.edgesOf(n.id).forEach(e => { const o = e.a === n.id ? e.b : e.a; if (o !== id && MAP.nodes.has(o) && !MAP.edges.some(x => (x.a === n.id && x.b === o) || (x.a === o && x.b === n.id))) MAP.edges.push({ a: n.id, b: o, why: e.why, kind: e.kind }); }));
  say("Added " + nb.length + " connected resources to the map."); paintMap();
}
function edgesFor(id) { return MAP.edges.filter(e => e.a === id || e.b === id); }
function mapTab() {
  if (!MAP) mapInit();
  const legend = h("div", { class: "legend" }, ["concept", "question", "theory", "source", "article", "museum"].map(t => h("span", null, (() => { const s = sv("svg", { width: 24, height: 24, viewBox: "-16 -16 32 32", "aria-hidden": "true", class: "nd " + t }); s.append(SHAPE[NSHAPE[t]]()); return s; })(), TYPES[t])),
    h("span", null, sv("svg", { width: 34, height: 10, "aria-hidden": "true" }, sv("line", { x1: 0, y1: 5, x2: 34, y2: 5, class: "ed" })), "Editorial link"), h("span", null, sv("svg", { width: 34, height: 10, "aria-hidden": "true" }, sv("line", { x1: 0, y1: 5, x2: 34, y2: 5, class: "ed auto" })), "Automatic or preliminary"));
  const tog = h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", "aria-pressed": String(UI.mapView === "map"), onclick: () => { UI.mapView = "map"; paint(); } }, "Map"), h("button", { class: "btn sm", type: "button", "aria-pressed": String(UI.mapView === "list"), onclick: () => { UI.mapView = "list"; paint(); } }, "List view"),
    h("button", { class: "btn sm", type: "button", "aria-pressed": String(!!MAP.all), onclick: () => { MAP.all = !MAP.all; paint(); } }, MAP.all ? "Showing all links" : "Show all links (" + MAP.edges.length + ")"), h("button", { class: "btn sm", type: "button", onclick: () => { MAP = null; mapInit(); paint(); say("Map reset."); } }, "Reset map"), MAP.hist.length ? h("button", { class: "btn sm", type: "button", onclick: () => { const p = MAP.hist.pop(); mapSelect(p, false); } }, "← Back to previous node") : null);
  const out = [h("p", { class: "note" }, "Every node is a record in the site's index. Each node shows its strongest link to something nearer the centre. Select a node to reveal all of its links and the reason for each, expand it to add its neighbours, or choose “Show all links”. Your question stays at the centre."), legend, tog];
  if (UI.mapView === "list") out.push(mapList()); else { out.push(h("div", { class: "mapwrap", id: "mapwrap" })); out.push(h("div", { id: "mapdetail", "aria-live": "polite" })); }
  const wrap = h("div", null, out);
  setTimeout(() => { if (UI.mapView === "map") { paintMap(); } }, 0);
  return [wrap];
}
function nodeLabel(n) { return clip(n.label, n.id === "ask" ? 44 : 24); }
function fitView() {
  let x0 = 0, x1 = 0, y0 = -30, y1 = 50;
  MAP.nodes.forEach(n => { const w = nodeLabel(n).length * 6.6 + 26; if (n.id === "ask") { x0 = Math.min(x0, -w / 2); x1 = Math.max(x1, w / 2); y1 = Math.max(y1, 50); return; } if (n.x >= 0) { x0 = Math.min(x0, n.x - 16); x1 = Math.max(x1, n.x + w); } else { x0 = Math.min(x0, n.x - w); x1 = Math.max(x1, n.x + 16); } y0 = Math.min(y0, n.y - 18); y1 = Math.max(y1, n.y + 22); });
  const w = x1 - x0, hh = y1 - y0, k = Math.max(.55, Math.min(1.25, 960 / w, 600 / hh));
  MAP.view = { k, x: -(x0 + w / 2) * k, y: -(y0 + hh / 2) * k };
}
function paintMap() {
  const wrap = $("#mapwrap"); if (!wrap) return; wrap.textContent = "";
  const sel = MAP.sel, nb = new Set(); if (sel) edgesFor(sel).forEach(e => { nb.add(e.a); nb.add(e.b); });
  const svg = sv("svg", { viewBox: "-500 -320 1000 640", role: "group", "aria-label": "Pathway Map. Use Tab to move between nodes and Enter to select. A list view is available." });
  const vp = sv("g", { id: "vp", transform: `translate(${MAP.view.x} ${MAP.view.y}) scale(${MAP.view.k})` });
  MAP.edges.forEach(e => { const a = MAP.nodes.get(e.a), b = MAP.nodes.get(e.b); if (!a || !b) return; const auto = e.kind === "automatic" || e.kind === "preliminary"; const hi = sel && (e.a === sel || e.b === sel); if (!e.main && !MAP.all && !hi) return;
    vp.append(sv("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "ed" + (auto ? " auto" : "") + (hi ? " hi" : "") + (sel && !hi ? " dim" : "") }, sv("title", null, e.why))); });
  MAP.nodes.forEach(n => {
    const g = sv("g", { class: "nd " + n.type + (sel === n.id ? " sel" : "") + (sel && sel !== n.id && !nb.has(n.id) ? " dim" : ""), transform: `translate(${n.x} ${n.y})`, tabindex: "0", role: "button", "aria-label": (n.id === "ask" ? "Your question: " : TYPES[n.type] + ": ") + n.label + (sel === n.id ? ", selected" : "") });
    if (n.id === "ask") g.append(sv("circle", { r: 20, class: "sh" }), sv("text", { y: 38, "text-anchor": "middle" }, nodeLabel(n)));
    else { g.append(SHAPE[NSHAPE[n.type]](), sv("text", { x: n.x >= 0 ? 20 : -20, y: 4, "text-anchor": n.x >= 0 ? "start" : "end" }, nodeLabel(n))); }
    g.append(sv("title", null, n.label));
    const act = () => mapSelect(n.id); g.addEventListener("click", ev => { ev.stopPropagation(); act(); }); g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); act(); } });
    vp.append(g);
  });
  svg.append(vp); wrap.append(svg);
  const zoom = (f, cx, cy) => { const v = MAP.view, k = Math.max(.5, Math.min(3, v.k * f)), r = k / v.k; v.x = cx - (cx - v.x) * r; v.y = cy - (cy - v.y) * r; v.k = k; vp.setAttribute("transform", `translate(${v.x} ${v.y}) scale(${v.k})`); };
  wrap.append(h("div", { class: "mapctl" }, h("button", { type: "button", "aria-label": "Zoom in", onclick: () => zoom(1.25, 0, 0) }, "+"), h("button", { type: "button", "aria-label": "Zoom out", onclick: () => zoom(.8, 0, 0) }, "−"), h("button", { type: "button", "aria-label": "Reset view", onclick: () => { fitView(); vp.setAttribute("transform", `translate(${MAP.view.x} ${MAP.view.y}) scale(${MAP.view.k})`); } }, "⌖")));
  // pan + pinch
  const ptrs = new Map(); let last = null;
  const toSvg = (x, y) => { const r = svg.getBoundingClientRect(); return [(x - r.left) / r.width * 1000 - 500, (y - r.top) / r.height * 640 - 320]; };
  svg.addEventListener("pointerdown", ev => { if (ev.target.closest(".nd")) return; ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]); try { svg.setPointerCapture(ev.pointerId); } catch (e) { } svg.classList.add("drag"); last = null; });
  svg.addEventListener("pointermove", ev => { if (!ptrs.has(ev.pointerId)) return; const prev = ptrs.get(ev.pointerId); ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (ptrs.size === 1) { const r = svg.getBoundingClientRect(); MAP.view.x += (ev.clientX - prev[0]) / r.width * 1000; MAP.view.y += (ev.clientY - prev[1]) / r.height * 640; vp.setAttribute("transform", `translate(${MAP.view.x} ${MAP.view.y}) scale(${MAP.view.k})`); }
    else if (ptrs.size === 2) { const [p1, p2] = Array.from(ptrs.values()), d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]); if (last) { const [cx, cy] = toSvg((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2); zoom(d / last, cx, cy); } last = d; } });
  const end = ev => { ptrs.delete(ev.pointerId); if (!ptrs.size) svg.classList.remove("drag"); last = null; };
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  svg.addEventListener("wheel", ev => { if (!(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); const [cx, cy] = toSvg(ev.clientX, ev.clientY); zoom(ev.deltaY < 0 ? 1.12 : .89, cx, cy); }, { passive: false });
  svg.addEventListener("click", () => { if (MAP.sel) { MAP.sel = null; paintMap(); } });
  mapDetail();
}
function mapDetail() {
  const box = $("#mapdetail"); if (!box) return; box.textContent = ""; const id = MAP.sel;
  if (!id) { box.append(h("p", { class: "meta", style: "margin-top:10px" }, "Select a node to see what it is and why it is connected. Pan by dragging; zoom with the buttons, a pinch, or Ctrl + scroll.")); return; }
  if (id === "ask") { box.append(h("div", { class: "panel", style: "margin-top:12px" }, h("h3", null, "Your question"), h("p", null, INQ.query), h("p", { class: "meta" }, "Solid or dashed lines from here show which records matched your wording. Dashed means software matched them, not a person."))); return; }
  const r = R(id), es = edgesFor(id);
  box.append(h("div", { class: "panel", style: "margin-top:12px" }, badge(r.type), r.type === "source" ? evTags(r) : null, h("h3", null, r.title), r.summary ? h("p", null, clip(r.summary, 360)) : null, h("p", { class: "meta" }, r.attribution + " · " + r.reviewStatus),
    h("p", { class: "grp" }, "Why it is connected (" + es.length + ")"), h("ul", { class: "why" }, es.slice(0, UI.moreWhy === id ? 99 : 8).map(e => { const o = MAP.nodes.get(e.a === id ? e.b : e.a); return h("li", { class: e.kind === "preliminary" || e.kind === "automatic" ? "pre" : "" }, h("b", null, KIND_LABEL[e.kind] || e.kind), " · " + (o ? clip(o.label, 50) : "") + ": " + e.why); })), es.length > 8 ? h("button", { class: "btn sm", type: "button", onclick: () => { UI.moreWhy = UI.moreWhy === id ? null : id; mapDetail(); } }, UI.moreWhy === id ? "Show fewer" : "Show all " + es.length) : null,
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn sm", type: "button", onclick: () => mapExpand(id) }, "Expand connections"), r.type === "question" ? h("button", { class: "btn sm", type: "button", onclick: () => branch(r) }, "Investigate this question →") : null, r.type === "source" ? h("button", { class: "btn sm", type: "button", onclick: () => inspect(id) }, "Inspect source") : null, openLink(r), saveBar(r))));
}
function mapList() {
  const nodes = Array.from(MAP.nodes.values()); const ul = h("ul");
  ORDER.concat(["ask"]).forEach(t => nodes.filter(n => n.type === t).forEach(n => {
    const es = edgesFor(n.id), r = n.id === "ask" ? null : R(n.id);
    ul.append(h("li", null, n.id === "ask" ? h("span", { class: "tag mint" }, "Your question") : badge(n.type), h("b", null, " " + n.label),
      es.length ? h("details", { class: "w" }, h("summary", null, "Connections (" + es.length + ")"), h("ul", { class: "conn" }, es.map(e => { const o = MAP.nodes.get(e.a === n.id ? e.b : e.a); return h("li", null, (KIND_LABEL[e.kind] || e.kind) + " → " + (o ? o.label : "") + ": " + e.why); }))) : null,
      h("div", { class: "row", style: "margin-top:6px" }, n.id === "ask" ? null : [h("button", { class: "btn sm", type: "button", onclick: () => { mapExpand(n.id); UI.mapView = "list"; paint(); } }, "Expand connections"), r.type === "question" ? h("button", { class: "btn sm", type: "button", onclick: () => branch(r) }, "Investigate →") : null, r.type === "source" ? h("button", { class: "btn sm", type: "button", onclick: () => inspect(n.id) }, "Inspect") : null, openLink(r)])));
  }));
  return h("div", { class: "maplist panel" }, ul);
}

/* ---------- start ---------- */
async function load() {
  if (window.__INQ) return window.__INQ;
  const g = f => fetch("data/" + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const [index, vocab, rules] = await Promise.all([g("research-index.json"), g("concept-relations.json"), g("pathway-rules.json")]);
  return { index, vocab, rules };
}
(async function () {
  try {
    const d = await load(); RULES = d.rules; VERSION = d.index.meta.generated; ENG = InquiryEngine.create(d.index, d.vocab, d.rules);
  } catch (e) { app().textContent = ""; app().append(h("div", { class: "panel" }, h("h3", null, "The research index could not be loaded"), h("p", null, "Please reload the page. If it keeps happening, the index file may be missing; nothing has been changed on the site."))); return; }
  addEventListener("hashchange", route); route();
})();
