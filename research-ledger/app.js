/* The Research Ledger. Reads data/ledger.json (and saved snapshots on demand). No credentials, no editing controls,
   no network calls except reading public JSON. All text is inserted with textContent, all links are https or relative. */
"use strict";
const ROOT = window.LEDGER_ROOT || "../";
const NS_SVG = "http://www.w3.org/2000/svg";
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(t, a, ...k) {
  const e = document.createElement(t);
  for (const [n, v] of Object.entries(a || {})) {
    if (v == null || v === false) continue;
    if (n === "class") e.className = v; else if (n.startsWith("on")) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v === true ? "" : v);
  }
  for (const c of k.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
function sv(t, a, ...k) {
  const e = document.createElementNS(NS_SVG, t);
  for (const [n, v] of Object.entries(a || {})) if (v != null) e.setAttribute(n, v);
  for (const c of k.flat(9)) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const okHref = u => (/^https:\/\//.test(u || "") || /^[./#][^:]*$/.test(u || "") ? u : "#");
const ext = (u, ...k) => h("a", { href: okHref(u), target: "_blank", rel: "noopener noreferrer" }, ...k);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : "date not recorded";
}
const time = iso => iso ? h("time", { datetime: iso }, fmtDate(iso)) : h("span", null, "not recorded");
const n1 = n => Number(n).toLocaleString("en-US");
const plural = (n, a, b) => `${n1(n)} ${n === 1 ? a : b}`;

let LED = null, IX = {}, TX = {}, PREVIEW = false, DEMO_ON = false;
const SNAP_CACHE = {};

/* ---------------------------------------------------------------- data */
async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}
async function load() {
  LED = window.__LEDGER || await getJSON("data/ledger.json");
  PREVIEW = !!(window.LEDGER_PREVIEW || (LED.config && LED.config.preview));
  index();
}
function index() {
  const t = LED.taxonomy;
  TX = {};
  for (const k of ["verificationLevels", "claimClassifications", "claimStatuses", "supportStatuses", "reviewStatuses", "revisionCategories", "revisionStates", "correctionKinds", "policyStatuses", "snapshotKinds", "lifeOfAnIdea"]) {
    TX[k] = Object.fromEntries(t[k].map(x => [x.id, x]));
  }
  // Records created automatically by the capture script carry only the fields it could know. Give every optional field a safe empty value.
  LED.sources.forEach(s => { s.observations = s.observations || []; s.links = s.links || {}; s.claimIds = s.claimIds || []; s.citedBy = s.citedBy || []; s.verification.history = s.verification.history || []; });
  LED.claims.forEach(c => { c.sourceLinks = c.sourceLinks || []; c.concepts = c.concepts || []; });
  LED.publications.forEach(p => { p.context = p.context || {}; for (const k of ["theories", "learning", "lexicon", "concepts", "questions", "suggestions"]) p.context[k] = p.context[k] || []; p.contextLinks = p.contextLinks || {}; });
  IX = { pub: {}, src: {}, clm: {}, rvw: {}, rvn: {}, cor: {} };
  LED.publications.forEach(x => IX.pub[x.id] = x);
  LED.sources.forEach(x => IX.src[x.id] = x);
  LED.claims.forEach(x => IX.clm[x.id] = x);
  LED.reviews.forEach(x => IX.rvw[x.id] = x);
  LED.revisions.forEach(x => IX.rvn[x.id] = x);
  LED.corrections.forEach(x => IX.cor[x.id] = x);
}
async function snapshot(pub, entry) {
  const key = pub.slug + "/" + entry.file;
  if (SNAP_CACHE[key]) return SNAP_CACHE[key];
  const inline = window.__SNAPSHOTS && window.__SNAPSHOTS[key];
  const doc = inline || await getJSON("data/snapshots/" + key);
  return (SNAP_CACHE[key] = doc.snapshot);
}
const reviewOf = p => IX.rvw[p.reviewId];
const label = (map, id) => (TX[map][id] || { label: id }).label;

/* ---------------------------------------------------------------- small components */
const GLYPH = { "awaiting-editorial-review": "○", "source-verification-in-progress": "◔", "editorially-reviewed": "●", "revision-requested": "◐", "review-completed-with-limitations": "◑", "new-evidence-review-pending": "◇" };
function reviewStamp(id) {
  const cls = id === "editorially-reviewed" || id === "review-completed-with-limitations" ? "ok" : id === "awaiting-editorial-review" ? "none" : "warn";
  return h("span", { class: "stamp " + cls }, h("span", { class: "g", "aria-hidden": "true" }, GLYPH[id] || "○"), label("reviewStatuses", id));
}
function ladder(levelId) {
  const lv = TX.verificationLevels[levelId], rank = lv ? lv.rank : 0;
  return h("span", { class: "lv" },
    h("span", { class: "ladder", "aria-hidden": "true" }, [1, 2, 3, 4, 5].map(i => h("i", { class: i <= rank ? "on" : "" }))),
    h("span", { class: "lvname" }, lv ? lv.label : levelId),
    h("span", { class: "vh" }, ` (step ${rank} of 5)`));
}
function classStamp(c) {
  return h("span", { class: "stamp " + (c.classificationStatus === "draft" ? "draft" : "ok") },
    label("claimClassifications", c.classification), h("span", { class: "vh" }, ". "),
    h("span", { "aria-hidden": "true" }, " · "), c.classificationStatus === "draft" ? "Draft" : "Reviewed");
}
function supportStamp(id) { return h("span", { class: "stamp " + (id === "not-assessed" ? "none" : id === "supports" ? "ok" : "warn") }, label("supportStatuses", id)); }
function policyStamp(id) { return h("span", { class: "stamp " + (id === "approved" ? "ok" : id === "proposed" ? "draft" : "warn") }, label("policyStatuses", id)); }
function demoStamp() { return h("span", { class: "stamp demo" }, "Demonstration — not a real publication"); }
const isDemo = r => !!(r && r.demo);
const empty = (title, text) => h("div", { class: "empty", role: "note" }, h("strong", null, title), text);
function crumbs(...items) {
  return h("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, items.map((x, i) => [i ? " / " : "", x.href ? h("a", { href: x.href }, x.t) : h("span", { "aria-current": "page" }, x.t)]));
}
function table(caption, head, rows, cls) {
  return h("div", { class: "tw", tabindex: "0", role: "region", "aria-label": caption + " (scrolls sideways on narrow screens)" },
    h("table", { class: "ledger" }, h("caption", null, caption),
      h("thead", null, h("tr", null, head.map(c => h("th", { scope: "col", class: c.cls || "" }, c.t)))),
      h("tbody", null, rows)));
}
function shortText(t, n = 150) { t = String(t || ""); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; }
function pubLink(p, text) { return h("a", { href: "#publication-" + p.id }, text || p.title); }
function essayHref(p) { return p.demo ? "#publication-" + p.id : ROOT + "research/published/" + p.slug + "/"; }

/* ---------------------------------------------------------------- shell */
const NAV = [["home", "Home"], ["publications", "Publication Records"], ["evidence", "Evidence Registry"], ["revisions", "Revision History"], ["corrections", "Corrections & Clarifications"], ["review", "Review Status"], ["methodology", "Editorial Methodology"], ["timeline", "Research Timeline"], ["integrity", "Research Integrity"], ["idea", "Life of an Idea"]];
function shell() {
  const L = [["Home", ROOT], ["Published Research", ROOT + "#library"], ["Evidence Explorer", ROOT + "#evidence"], ["Living Archive", ROOT + "#living"], ["Methodology", ROOT + "#methodology"]];
  $("#site").replaceChildren(...L.map(([t, u]) => h("a", { href: u }, t)));
  $("#brand").href = ROOT;
}
function tabs(cur) {
  return h("nav", { class: "tabs", "aria-label": "Research Ledger sections" }, NAV.map(([k, t]) => h("a", { href: "#" + k, "aria-current": k === cur ? "page" : null }, t)));
}
function previewStrip() {
  if (!PREVIEW) return null;
  return h("p", { class: "strip preview", role: "note" }, h("b", null, "Private preview. "), "This is a working preview of a feature that is not on the live website. ",
    LED.demo ? h("span", null, "A fictional demonstration record can be switched on to try Compare Versions. ",
      h("button", { class: "btn sm", type: "button", "aria-pressed": String(DEMO_ON), id: "demo-toggle", onclick: toggleDemo }, DEMO_ON ? "Hide demonstration record" : "Show demonstration record")) : null);
}
function page(cur, ...kids) {
  $("#main").replaceChildren(h("div", { class: "wrap" }, previewStrip(), tabs(cur), ...kids));
  const here = $("nav.tabs a[aria-current=page]");   // keep the current section visible when the tab bar scrolls on a phone
  if (here && here.parentNode.scrollWidth > here.parentNode.clientWidth) here.parentNode.scrollLeft = Math.max(0, here.offsetLeft - 24);
}
function setTitle(t) { document.title = t + " · The Research Ledger · Artificially Intelligent"; }

/* ---------------------------------------------------------------- home */
function ledgerStatusStrip() {
  const I = LED.integrity, first = LED.publications.filter(p => !p.demo).map(p => p.historyBegins).sort()[0];
  return h("p", { class: "strip", role: "note" }, h("b", null, "Where things stand. "),
    `${plural(I.publications, "publication", "publications")} recorded. Version history begins ${fmtDate(first)}; earlier edits, if there were any, were not recorded. `,
    `${I.editoriallyReviewed} ${I.editoriallyReviewed === 1 ? "publication has" : "publications have"} a recorded editorial review. `,
    `${I.corrections} formal corrections recorded. Last Ledger update: `, time(LED.ledgerAsOf), ".");
}
function viewHome() {
  setTitle("Home");
  const I = LED.integrity;
  const pubs = LED.publications.filter(p => !p.demo);
  page("home",
    h("section", { class: "hero" },
      h("p", { class: "kicker" }, "Artificially Intelligent · Research Ledger"),
      h("h1", null, "THE RESEARCH LEDGER"),
      h("p", { class: "sub" }, "An open record of sources, revisions, and the evolving life of research."),
      h("p", { class: "tagline" }, "Knowledge is not static. Its development should remain visible."),
      h("p", { class: "lede" }, "Research does not end when it is published."),
      h("p", { class: "lede", style: "font-size:18px" }, "Ideas develop, interpretations change, evidence is reconsidered, and new questions emerge. The Research Ledger documents that process. Through publication histories, source records, editorial reviews, and transparent corrections, it makes the development of research visible."),
      h("p", { class: "lede", style: "font-size:18px" }, "Its purpose is not to present knowledge as final, but to preserve an accountable record of how understanding changes."),
      h("div", { class: "acts" }, h("a", { class: "btn primary", href: "#publications" }, "Browse publication records →"), h("a", { class: "btn", href: "#evidence" }, "Open the Evidence Registry"), h("a", { class: "btn", href: "#methodology" }, "Read the methodology")),
      ledgerStatusStrip()),
    h("section", { class: "sec", "aria-labelledby": "h-find" }, h("h2", { id: "h-find" }, "Search the Ledger"),
      h("p", { class: "small" }, "Search publication titles, source titles and authors, concepts, claims, review statuses, revision categories, correction types and policies."),
      searchBox()),
    h("section", { class: "sec", "aria-labelledby": "h-pubs" }, h("h2", { id: "h-pubs" }, "Publication records"),
      h("div", null, pubs.map(x => pubCard(x, "h3"))),
      h("p", null, h("a", { href: "#publications" }, "Open the full registry →"))),
    h("section", { class: "sec", "aria-labelledby": "h-read" }, h("h2", { id: "h-read" }, "How to read what you find here"),
      h("div", { class: "grid2" },
        h("div", null, h("h3", null, "Source verification is a ladder"),
          h("p", { class: "small" }, "Each step describes work that was actually done. A higher step needs more reading, never more citations. Confirming that a paper exists is not the same as confirming that it supports what an essay says."),
          h("ul", { class: "plain" }, LED.taxonomy.verificationLevels.map(l => h("li", null, ladder(l.id), h("p", { class: "small", style: "margin:4px 0 0" }, l.meaning))))),
        h("div", null, h("h3", null, "What the Ledger is not"),
          h("p", { class: "small" }, "The Ledger is this site's own record of its research. Editorial review here is not peer review, and Artificially Intelligent is an independent site, not a university, laboratory, journal or review board. A claim classification says what kind of statement a passage is. It does not say whether the statement is true."),
          h("p", { class: "small" }, "An empty corrections list does not show that a publication has no errors. It shows that none has been recorded."),
          h("h3", { style: "margin-top:20px" }, "Right now"),
          h("ul", { class: "plain" },
            [[`${I.sourcesByLevel["verification-incomplete"]} of ${I.sources} sources`, "have no documented check yet."],
             [`${I.claimsDraft} of ${I.claims} mapped claims`, "are draft classifications that no editor has reviewed."],
             [`${I.editoriallyReviewed} of ${I.publications} publications`, "have a recorded editorial review."],
             [`${I.policiesApproved} of ${I.policiesTotal} methodology sections`, "have been approved as official standards."]].map(([a, b]) => h("li", null, h("b", null, a), " ", b)))))),
    h("section", { class: "sec", "aria-labelledby": "h-conn" }, h("h2", { id: "h-conn" }, "Connected research"),
      h("p", { class: "small" }, "The Ledger holds the editorial records behind the rest of the archive. It reuses their data and does not replace them."),
      h("ul", { class: "plain" }, LED.integrations.map(x => h("li", null, h("b", null, x.name), " ", h("span", { class: "stamp " + (x.state === "connected" ? "ok" : x.state === "not-deployed" ? "none" : "warn") }, x.state === "connected" ? "Connected" : x.state === "not-deployed" ? "Not on the site yet" : "Suggestions only"), h("p", { class: "small", style: "margin:4px 0 0" }, x.note))))));
}
function pubCard(p, lvl) {   // lvl is the heading element name; never pass it implicitly (Array.map would pass an index)
  const r = reviewOf(p), I = p;
  return h("article", { class: "pubcard" },
    h("div", { class: "pid" }, p.id),
    h("div", { class: "body" },
      h(lvl || "h3", { class: "pt" }, pubLink(p)),
      p.demo ? demoStamp() : null,
      h("div", { class: "dates" },
        h("span", null, h("small", null, "Published"), time(p.publishedAt)),
        h("span", null, h("small", null, "Entered in the Ledger"), time(p.ledgerEntryDate)),
        h("span", null, h("small", null, "Review status"), reviewStamp(r.status))),
      h("p", { class: "small" }, shortText(p.deck, 220)),
      h("p", { class: "counts" },
        h("span", null, h("b", null, I.sourceIds.length), " sources"), h("span", null, h("b", null, I.claimIds.length), " mapped claims"),
        h("span", null, h("b", null, I.versions.length), I.versions.length === 1 ? " saved version" : " saved versions"),
        h("span", null, h("b", null, I.revisionIds.length), " revisions"), h("span", null, h("b", null, I.correctionIds.length), " corrections")),
      h("div", { class: "acts" }, h("a", { class: "btn sm primary", href: "#publication-" + p.id }, "Open record"), h("a", { class: "btn sm", href: essayHref(p) }, "Read the essay"))));
}

/* ---------------------------------------------------------------- search */
function searchRecords() {
  const out = [], T = LED.taxonomy;
  LED.publications.forEach(p => out.push({ type: "Publication", id: p.id, title: p.title, href: "#publication-" + p.id,
    text: [p.title, p.deck, p.slug, p.publishedAt, label("reviewStatuses", reviewOf(p).status), (p.contextLinks.concepts || []).join(" "), (p.context.concepts || []).map(c => c.title).join(" ")].join(" ") }));
  LED.sources.forEach(s => out.push({ type: "Source", id: s.id, title: s.citation.title || s.citation.raw, href: "#source-" + s.id,
    text: [s.citation.raw, s.citation.title, s.type, label("verificationLevels", s.verification.level), s.citation.doi, s.citation.arxiv].join(" ") }));
  LED.claims.forEach(c => out.push({ type: "Claim", id: c.id, title: shortText(c.passage.text, 100), href: "#claim-" + c.id,
    text: [c.passage.text, label("claimClassifications", c.classification), (c.concepts || []).join(" ")].join(" ") }));
  LED.revisions.forEach(r => out.push({ type: "Revision", id: r.id, title: r.summary || "Change detected, not yet classified", href: "#compare-" + r.publication + "-" + r.fromSnapshot + "-" + r.toSnapshot,
    text: [r.id, r.summary, r.category ? label("revisionCategories", r.category) : "unclassified change detected"].join(" ") }));
  LED.corrections.forEach(c => out.push({ type: "Correction", id: c.id, title: shortText(c.issue, 100), href: "#correction-" + c.id, text: [c.issue, c.corrected, c.reason, label("correctionKinds", c.kind)].join(" ") }));
  LED.policies.forEach(p => out.push({ type: "Policy", id: p.id, title: p.title, href: "#methodology", text: [p.title, p.covers, label("policyStatuses", p.status)].join(" ") }));
  T.reviewStatuses.forEach(r => out.push({ type: "Review status", id: r.id, title: r.label, href: "#review", text: r.label + " " + r.meaning }));
  return out;
}
function searchBox() {
  const box = h("div", null), res = h("div", { "aria-live": "polite" });
  const input = h("input", { type: "search", id: "q-all", "aria-label": "Search the Ledger", placeholder: "Try: Turing, abstract reviewed, open question, Domesday…", autocomplete: "off" });
  let recs = null;
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { res.replaceChildren(); return; }
    recs = recs || searchRecords();
    const words = q.split(/\s+/);
    const hits = recs.filter(r => words.every(w => (r.type + " " + r.id + " " + r.text).toLowerCase().includes(w)));
    res.replaceChildren(h("p", { class: "count" }, hits.length ? `${plural(hits.length, "result", "results")}${hits.length > 30 ? ", showing the first 30" : ""}` : "No records match."),
      hits.length ? h("ul", { class: "plain" }, hits.slice(0, 30).map(r => h("li", null, h("span", { class: "stamp none" }, r.type), " ", h("a", { href: r.href }, r.title), " ", h("span", { class: "mono small" }, r.id)))) : empty("Nothing found", "Try a shorter word, or browse the sections above. The Ledger only searches records it holds."));
  };
  input.addEventListener("input", run);
  box.append(h("div", { class: "row" }, input), res);
  return box;
}

/* ---------------------------------------------------------------- publications registry */
function viewPublications() {
  setTitle("Publication Records");
  const st = { q: "", cat: "", rev: "", year: "", sort: "newest" };
  const list = h("div", null), count = h("p", { class: "count", "aria-live": "polite" });
  const cats = [...new Set(LED.publications.map(p => p.category))].sort();
  const revs = [...new Set(LED.publications.map(p => reviewOf(p).status))];
  const years = [...new Set(LED.publications.map(p => (p.publishedAt || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const sel = (id, lab, opts, key) => h("label", { class: "l" }, lab, h("select", { id, onchange: e => { st[key] = e.target.value; paint(); } }, h("option", { value: "" }, "All"), opts));
  const paint = () => {
    let rows = LED.publications.filter(p => {
      const hay = [p.title, p.deck, p.id, p.category, label("reviewStatuses", reviewOf(p).status), (p.context.concepts || []).map(c => c.title).join(" ")].join(" ").toLowerCase();
      return (!st.q || st.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) && (!st.cat || p.category === st.cat) && (!st.rev || reviewOf(p).status === st.rev) && (!st.year || (p.publishedAt || "").startsWith(st.year));
    });
    rows = rows.sort((a, b) => st.sort === "oldest" ? (a.publishedAt || "").localeCompare(b.publishedAt || "") : st.sort === "title" ? a.title.localeCompare(b.title) : (b.publishedAt || "").localeCompare(a.publishedAt || ""));
    count.textContent = `${plural(rows.length, "publication", "publications")} shown of ${LED.publications.length}.`;
    list.replaceChildren(...(rows.length ? rows.map(x => pubCard(x, "h2")) : [empty("No publication matches these filters", "Clear a filter or search for a different word.")]));
  };
  page("publications",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Publication Records"),
    h("p", { class: "lede" }, "Every completed original essay has a Ledger record. The record shows when the essay was published and, separately, when the Ledger first recorded it."),
    h("div", { class: "filters" },
      h("div", { class: "row" }, h("input", { type: "search", "aria-label": "Search publications", placeholder: "Search title, summary, concept or status", oninput: e => { st.q = e.target.value; paint(); } })),
      h("div", { class: "row" },
        sel("f-cat", "Category", cats.map(c => h("option", { value: c }, c)), "cat"),
        sel("f-rev", "Review status", revs.map(c => h("option", { value: c }, label("reviewStatuses", c))), "rev"),
        sel("f-year", "Year published", years.map(c => h("option", { value: c }, c)), "year"),
        h("label", { class: "l" }, "Sort", h("select", { onchange: e => { st.sort = e.target.value; paint(); } }, h("option", { value: "newest" }, "Newest first"), h("option", { value: "oldest" }, "Oldest first"), h("option", { value: "title" }, "Title A–Z"))))),
    count, list);
  paint();
}

/* ---------------------------------------------------------------- publication record */
function sec(letter, id, title, ...kids) {
  return h("section", { class: "sec", id, "aria-labelledby": id + "-h" }, h("h2", { id: id + "-h" }, h("span", { class: "letter" }, letter), title), ...kids);
}
function claimsOf(p) { return p.claimIds.map(i => IX.clm[i]).sort((a, b) => a.passage.index - b.passage.index); }
function viewPublication(id) {
  const p = IX.pub[id];
  if (!p) return notFound("publication record", id);
  setTitle(p.title);
  const r = reviewOf(p), srcs = p.sourceIds.map(i => IX.src[i]).sort((a, b) => citedIndex(a, p) - citedIndex(b, p)), claims = claimsOf(p);
  const jump = [["A", "overview", "Overview"], ["B", "sources", "Sources"], ["C", "evidence", "Evidence"], ["D", "review", "Review"], ["E", "history", "Revisions"], ["F", "corrections", "Corrections"], ["G", "context", "Context"], ["H", "open", "Open questions"]];
  page("publications",
    crumbs({ t: "Ledger", href: "#home" }, { t: "Publication Records", href: "#publications" }, { t: p.id }),
    p.demo ? h("p", { class: "note", role: "note" }, demoStamp(), " This record is fictional. It exists only in this private preview so the version comparison can be tried. It is not counted anywhere.") : null,
    h("p", { class: "kicker" }, `Publication record ${p.id}`),
    h("h1", { style: "font-size:clamp(30px,5vw,54px)" }, p.title),
    h("nav", { class: "row", "aria-label": "Jump to a part of this record" }, jump.map(([l, a, t]) => h("a", { class: "chip", href: "#publication-" + id, onclick: e => { e.preventDefault(); const el = document.getElementById(id + "-" + a); if (el) { el.scrollIntoView(); el.querySelector("h2").setAttribute("tabindex", "-1"); el.querySelector("h2").focus(); } } }, `${l} · ${t}`))),
    // A
    sec("A", id + "-overview", "Publication Overview",
      h("p", { class: "lede", style: "font-size:19px" }, p.deck),
      h("dl", { class: "kv" },
        h("dt", null, "Record ID"), h("dd", { class: "mono" }, p.id),
        h("dt", null, "Published"), h("dd", null, time(p.publishedAt), h("span", { class: "small" }, "  · taken from the publication feed")),
        h("dt", null, "Entered in the Ledger"), h("dd", null, time(p.ledgerEntryDate), h("span", { class: "small" }, "  · the date the Ledger first recorded it, not the publication date")),
        h("dt", null, "Category"), h("dd", null, p.category),
        h("dt", null, "Attribution"), h("dd", null, p.author, h("div", { class: "small" }, "As shown in the site's research index. A confirmed byline has not been recorded in the Ledger.")),
        h("dt", null, "Original publication"), p.demo ? h("dd", null, "Fictional. This essay is not published anywhere.") : h("dd", null, h("a", { href: essayHref(p) }, "Read the essay on this site →"), h("div", { class: "small mono", style: "word-break:break-all" }, p.url)),
        h("dt", null, "Substack edition"), h("dd", null, p.substack.url ? ext(p.substack.url, p.substack.url) : p.substack.note),
        h("dt", null, "Current version"), h("dd", null, `Version ${p.current.n} of ${p.versions.length} saved · ${n1(p.current.words)} words · about ${p.readingMinutes} min read`,
          h("div", { class: "small mono" }, "Fingerprint " + p.current.hash.slice(0, 12)),
          h("div", { class: "small" }, "A fingerprint shows whether the saved text changed. It does not prove who wrote it or that its content has been verified.")),
        h("dt", null, "Latest documented revision"), h("dd", null, p.latestRevisionDate ? time(p.latestRevisionDate) : "None recorded"),
        h("dt", null, "Review status"), h("dd", null, reviewStamp(r.status)),
        h("dt", null, "Topics"), h("dd", null, (p.context.concepts || []).length ? [p.context.concepts.map(c => h("span", { class: "stamp none", style: "margin:0 6px 4px 0" }, c.title)), h("div", { class: "small" }, p.context.conceptsNote || "")] : "None recorded"),
        h("dt", null, "Last Ledger update"), h("dd", null, time(LED.ledgerAsOf))),
      h("p", { class: "counts" }, h("span", null, h("b", null, srcs.length), " sources"), h("span", null, h("b", null, claims.length), " mapped claims"), h("span", null, h("b", null, p.revisionIds.length), " revisions"), h("span", null, h("b", null, p.correctionIds.length), " corrections"))),
    // B
    sec("B", id + "-sources", "Source Registry",
      h("p", { class: "small" }, "The sources this publication cites, in its own order, exactly as printed. The verification step shows what the Ledger has documented, nothing more."),
      table(`Sources cited by ${p.title}`, [{ t: "No.", cls: "id" }, { t: "Source as printed" }, { t: "Type" }, { t: "Verification" }, { t: "Claims" }, { t: "Record" }],
        srcs.map(s => h("tr", null, h("td", { class: "id" }, (citeOf(s, p).label || (citedIndex(s, p) + 1))), h("td", null, h("span", { class: "t" }, s.citation.title || shortText(s.citation.raw, 90)), s.citation.year ? h("div", { class: "small" }, s.citation.year) : null),
          h("td", null, s.type || "—"), h("td", null, ladder(s.verification.level)), h("td", null, s.claimIds.filter(c => IX.clm[c].publication === p.id).length || "—"), h("td", null, h("a", { href: "#source-" + s.id }, "Inspect " + s.id))))),
      h("p", { class: "small", style: "margin-top:10px" }, `${srcs.filter(s => s.verification.level === "verification-incomplete").length} of ${srcs.length} sources have no documented check.`)),
    // C
    sec("C", id + "-evidence", "Evidence and Interpretation",
      h("p", { class: "small" }, "TRACE THE CLAIM. Passages that make substantive claims, the sources the essay cites near them, and what has and has not been checked. A classification says what kind of statement a passage is. It is not a measure of truth or credibility."),
      claims.length ? [h("p", { class: "note", role: "note" }, "All classifications here are drafts imported from the Evidence Explorer. No editor has reviewed them, and no source has been marked as supporting any claim yet."),
        table(`Mapped claims in ${p.title}`, [{ t: "Claim", cls: "id" }, { t: "Passage" }, { t: "Classification" }, { t: "Sources" }, { t: "Trace" }],
          claims.map(c => h("tr", null, h("td", { class: "id" }, c.id), h("td", null, shortText(c.passage.text, 170)), h("td", null, classStamp(c)), h("td", null, c.sourceLinks.length ? c.sourceLinks.map(l => h("div", null, h("a", { href: "#source-" + l.source }, l.source))) : h("span", { class: "small" }, "none linked")), h("td", null, h("a", { href: "#claim-" + c.id }, "Trace the claim →")))))]
        : empty("No claims have been mapped for this publication yet.", "Claim records are created by an editor. Nothing is generated automatically."),
      h("p", { class: "small", style: "margin-top:10px" }, "The Evidence Explorer remains the place to read these passages in context: ", h("a", { href: ROOT + "#evidence" }, "open the Evidence Explorer →"))),
    // D
    sec("D", id + "-review", "Editorial Review", reviewBlock(p, r)),
    // E
    sec("E", id + "-history", "Revision History", historyBlock(p)),
    // F
    sec("F", id + "-corrections", "Corrections and Clarifications", correctionsBlock(p)),
    // G
    sec("G", id + "-context", "Research Context", contextBlock(p)),
    // H
    sec("H", id + "-open", "Open Questions", openBlock(p, claims)));
}
const citeOf = (s, p) => s.citedBy.find(c => c.publication === p.id) || {};
const citedIndex = (s, p) => (citeOf(s, p).index || 0);

function reviewBlock(p, r) {
  const srcs = p.sourceIds.map(i => IX.src[i]), checked = srcs.filter(s => s.verification.level !== "verification-incomplete").length;
  const claims = claimsOf(p), done = r.status === "editorially-reviewed" || r.status === "review-completed-with-limitations";
  const step = (cls, t, st, txt) => h("li", { class: cls }, h("b", null, t), txt, h("span", { class: "st" }, st));
  return [
    h("p", null, reviewStamp(r.status), " ", h("span", { class: "small" }, label2(TX.reviewStatuses[r.status].meaning))),
    h("p", { class: "small" }, "This is the site's own editorial review status. It is separate from the review status of the sources an essay cites, and it is not peer review."),
    h("ol", { class: "steps", "aria-label": "Review steps" },
      step("done", "1. Sources listed", "Done", `${srcs.length} sources recorded as cited.`),
      step(checked === srcs.length ? "done" : checked ? "partial" : "open", "2. Sources checked", checked === srcs.length ? "Done" : checked ? "Partly" : "Not started", `${checked} of ${srcs.length} have a documented check.`),
      step(claims.length ? "partial" : "open", "3. Claims mapped", claims.length ? "Draft only" : "Not started", `${claims.length} draft claim${claims.length === 1 ? "" : "s"}.`),
      step(done ? "done" : "open", "4. Editor review", done ? "Done" : "Not recorded", done ? "See the review record." : "No editor review has been recorded."),
      step(done && r.approval ? "done" : "open", "5. Approval", done && r.approval ? "Recorded" : "Not recorded", "The Ledger never approves its own reviews.")),
    done ? h("dl", { class: "kv" }, ["reviewer", "completedOn", "scope", "criteria", "materialsExamined", "findings", "limitations", "outcome", "approval"].map(k => r[k] ? [h("dt", null, k.replace(/([A-Z])/g, " $1")), h("dd", null, Array.isArray(r[k]) ? r[k].join("; ") : String(r[k]))] : null))
      : h("p", { class: "small" }, "Reviewer: none identified. Review date: none. A review record will list its scope, criteria, materials examined, findings, limitations, outcome and approval when one exists."),
    h("details", null, h("summary", null, "Status history"), h("div", null, h("ul", { class: "plain" }, r.history.map(x => h("li", null, time(x.on), " · ", label("reviewStatuses", x.status), h("div", { class: "small" }, x.note || ""))))))
  ];
}
const label2 = s => s;

function historyBlock(p) {
  const out = [];
  out.push(h("p", { class: "note info", role: "note" }, `Version history for this publication begins ${fmtDate(p.historyBegins)}, when the Ledger saved its first copy of the public text. Earlier edits, if there were any, were not recorded and are not reconstructed.`));
  if (!p.revisionIds.length) out.push(empty("No documented revisions are available for this publication.", "This means none has been recorded. It does not say the text has never changed before the Ledger began."));
  else out.push(table("Recorded revisions", [{ t: "Revision", cls: "id" }, { t: "Detected" }, { t: "Category" }, { t: "Summary" }, { t: "Compare" }], p.revisionIds.map(i => revisionRow(IX.rvn[i]))));
  out.push(table("Saved versions of the public text", [{ t: "Version", cls: "id" }, { t: "Kind" }, { t: "Captured" }, { t: "Words" }, { t: "Fingerprint" }],
    p.versions.map(v => h("tr", null, h("td", { class: "id" }, "v" + v.n), h("td", null, label("snapshotKinds", v.kind)), h("td", null, time(v.capturedOn)), h("td", null, n1(v.words)), h("td", { class: "mono" }, v.hash.slice(0, 12))))));
  out.push(p.versions.length > 1 ? h("p", null, h("a", { class: "btn primary", href: "#compare-" + p.id }, "Compare versions →"))
    : h("p", { class: "small" }, "Compare Versions needs two saved versions. It will work as soon as the published text changes and a second version is saved. ", h("a", { href: "#compare-" + p.id }, "Open it anyway →")));
  return out;
}
function revisionRow(r) {
  return h("tr", null, h("td", { class: "id" }, r.id), h("td", null, time(r.detectedOn)),
    h("td", null, r.state === "classified" ? h("span", { class: "stamp ok" }, label("revisionCategories", r.category)) : h("span", { class: "stamp warn" }, "Not yet classified")),
    h("td", null, r.state === "classified" ? r.summary : "A change in the published text was detected. Nobody has yet recorded what changed or why."),
    h("td", null, h("a", { href: `#compare-${r.publication}-${r.fromSnapshot}-${r.toSnapshot}` }, `v${r.fromSnapshot} → v${r.toSnapshot}`)));
}
function correctionsBlock(p) {
  const cs = p.correctionIds.map(i => IX.cor[i]);
  if (!cs.length) return [empty("No formal corrections have been recorded in this Ledger.", "This does not mean the publication contains no errors. It means none has been recorded. If you think something is wrong, you can report a concern."), h("p", null, h("a", { href: "#concern" }, "Report a research concern →"))];
  return cs.map(correctionCard);
}
function correctionCard(c) {
  return h("article", { class: "card", id: "correction-" + c.id }, h("div", { class: "row" }, h("span", { class: "stamp ok" }, label("correctionKinds", c.kind)), h("span", { class: "mono small" }, c.id), time(c.recordedOn)),
    h("dl", { class: "kv" }, h("dt", null, "Original issue"), h("dd", null, c.issue), h("dt", null, "Corrected"), h("dd", null, c.corrected), h("dt", null, "Reason"), h("dd", null, c.reason), h("dt", null, "Affected"), h("dd", null, c.affected),
      c.sources && c.sources.length ? [h("dt", null, "Supporting sources"), h("dd", null, c.sources.map(s => h("a", { href: "#source-" + s, style: "margin-right:10px" }, s)))] : null,
      h("dt", null, "Approval"), h("dd", null, c.approval === "approved" ? `Approved by ${c.approvedBy}, ${fmtDate(c.approvedOn)}` : "Pending"),
      c.relatedRevision && IX.rvn[c.relatedRevision] ? [h("dt", null, "Revised version"), h("dd", null, h("a", { href: `#compare-${IX.rvn[c.relatedRevision].publication}-${IX.rvn[c.relatedRevision].fromSnapshot}-${IX.rvn[c.relatedRevision].toSnapshot}` }, "See what changed →"))] : null));
}
function contextBlock(p) {
  const c = p.context, parts = [];
  const list = (t, items, render, note) => items.length ? h("div", null, h("h3", { style: "font-size:18px" }, t), note ? h("p", { class: "small" }, note) : null, h("ul", { class: "plain" }, items.map(render))) : null;
  parts.push(list("Theories (Theory Chamber)", c.theories, t => h("li", null, ext(t.url, t.name), t.abbr ? ` (${t.abbr})` : "", h("span", { class: "small" }, `  · the Theory Chamber records a mention in paragraph ${t.paragraph + 1}`)), "These theories already list this essay in their own records."));
  parts.push(list("Courses and lessons (Learning Institute)", c.learning, l => h("li", null, ext(l.url, l.title), h("span", { class: "small" }, ` · ${l.reviewStatus || ""}`), l.lessons.length ? h("div", { class: "small" }, "Lessons that cite this essay: ", l.lessons.map(x => ext(x.url, x.id)).flatMap((a, i) => i ? [", ", a] : [a])) : null)));
  parts.push(list("Lexicon entries sharing a topic tag", c.lexicon, x => h("li", null, ext(x.url, x.term)), "Matched by shared topic tag only. Nobody has reviewed whether the essay uses the term as the Lexicon defines it."));
  parts.push(c.concepts.length ? h("div", null, h("h3", { style: "font-size:18px" }, "Research Atlas concepts"), h("p", { class: "small" }, c.conceptsNote || ""), h("div", { class: "row" }, c.concepts.map(x => ext(x.url, x.title)).map(a => h("span", { class: "stamp none" }, a)))) : null);
  parts.push(c.questions.length ? h("details", null, h("summary", null, `Unanswered Archive questions linked from those lessons (${c.questions.length})`), h("div", null, h("p", { class: "small" }, "These questions are linked from Learning Institute lessons that cite this essay. The link runs through the lesson. It is not a judgement that the essay addresses the question."), h("ul", { class: "plain" }, c.questions.map(q => h("li", null, ext(q.url, `${q.id} ${q.title}`), h("div", { class: "small" }, q.via)))))) : null);
  parts.push(c.suggestions.length ? h("details", null, h("summary", null, `Papers the Research Observatory suggests (${c.suggestions.length}) — automatic, not reviewed`), h("div", null, h("p", { class: "small" }, "Suggested only because they share topic tags with this essay. Nobody has judged whether they are relevant. A suggestion does not mean newer evidence exists or that the essay needs changing."), h("ul", { class: "plain" }, c.suggestions.map(s => h("li", null, s.title, " ", h("span", { class: "small" }, `(${s.year}; shared tags: ${s.sharedTags.join(", ")}; Observatory ${s.observatoryId})`)))))) : null);
  parts.push(h("p", { class: "acts" }, h("a", { class: "btn sm", href: ROOT + "#evidence" }, "Evidence Explorer"), h("a", { class: "btn sm", href: ROOT + "#living" }, "Living Archive"), h("a", { class: "btn sm", href: ROOT + "#library" }, "Published Research")));
  return parts.filter(Boolean);
}
function openBlock(p, claims) {
  const open = claims.filter(c => c.classification === "open-question"), lim = claims.filter(c => c.limitation);
  return [
    h("p", { class: "small" }, "Questions and limits the publication itself states, as far as they have been mapped."),
    open.length ? h("ul", { class: "plain" }, open.map(c => h("li", null, h("blockquote", { class: "passage" }, c.passage.text), classStamp(c), " ", h("a", { href: "#claim-" + c.id }, "Trace the claim →")))) : empty("No open questions have been mapped for this publication.", "An editor can record them as claims classified as Open Question."),
    lim.length ? h("details", null, h("summary", null, `Draft limits noted in the Evidence Explorer (${lim.length})`), h("div", null, h("p", { class: "small" }, "Each is the Explorer's draft wording about what a passage does not establish. None has been editorially reviewed."), h("ul", { class: "plain" }, lim.map(c => h("li", null, h("span", { class: "mono small" }, c.id), " — ", c.limitation))))) : null
  ];
}

/* ---------------------------------------------------------------- evidence registry */
function viewEvidence() {
  setTitle("Evidence Registry");
  const st = { mode: "sources", q: "", level: "", type: "", pub: "", cls: "" };
  const out = h("div", null), modeBar = h("div", { class: "seg", role: "group", "aria-label": "Registry view" });
  const render = () => {
    modeBar.replaceChildren(...[["sources", "Sources"], ["claims", "Claims"]].map(([k, t]) => h("button", { type: "button", "aria-pressed": String(st.mode === k), onclick: () => { st.mode = k; render(); } }, t)));
    out.replaceChildren(...(st.mode === "sources" ? sourcesPanel(st, render) : claimsPanel(st, render)));
  };
  page("evidence",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Evidence Registry"),
    h("p", { class: "lede" }, "A structured record of the sources the publications cite, and of the claims mapped to them. The registry separates two things: whether a source has been checked, and whether it supports what an essay says. Only the first has been recorded so far."),
    h("div", { class: "row", style: "margin-bottom:18px" }, modeBar), out);
  render();
}
function sourcesPanel(st, render) {
  const all = LED.sources;
  const types = [...new Set(all.map(s => s.type).filter(Boolean))].sort(), lvls = [...new Set(all.map(s => s.verification.level))];
  let rows = all.filter(s => {
    const hay = [s.id, s.citation.raw, s.citation.title, s.citation.doi, s.citation.arxiv, s.type, label("verificationLevels", s.verification.level)].join(" ").toLowerCase();
    return (!st.q || st.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) && (!st.level || s.verification.level === st.level) && (!st.type || s.type === st.type) && (!st.pub || s.citedBy.some(c => c.publication === st.pub));
  });
  const sel = (lab, key, opts) => h("label", { class: "l" }, lab, h("select", { onchange: e => { st[key] = e.target.value; render(); } }, h("option", { value: "" }, "All"), opts.map(([v, t]) => h("option", { value: v, selected: st[key] === v }, t))));
  return [
    h("div", { class: "filters" }, h("input", { type: "search", "aria-label": "Search sources", value: st.q, placeholder: "Search title, author, DOI or type", oninput: e => { st.q = e.target.value; clearTimeout(st.t); st.t = setTimeout(() => { render(); const el = $("[aria-label='Search sources']"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 200); } }),
      h("div", { class: "row" }, sel("Verification", "level", lvls.map(l => [l, label("verificationLevels", l)])), sel("Source type", "type", types.map(t => [t, t])), sel("Cited in", "pub", LED.publications.map(p => [p.id, p.title])))),
    h("p", { class: "count", "aria-live": "polite" }, `${plural(rows.length, "source", "sources")} shown of ${all.length}.`),
    rows.length ? table("Sources in the Evidence Registry", [{ t: "ID", cls: "id" }, { t: "Source as printed" }, { t: "Type" }, { t: "Verification" }, { t: "Cited in" }, { t: "Record" }],
      rows.map(s => h("tr", null, h("td", { class: "id" }, s.id), h("td", null, h("span", { class: "t" }, s.citation.title || shortText(s.citation.raw, 90)), h("div", { class: "small" }, shortText(s.citation.raw, 130))),
        h("td", null, s.type || "—"), h("td", null, ladder(s.verification.level)), h("td", null, s.citedBy.map(c => IX.pub[c.publication]).filter(Boolean).map(p => h("div", null, pubLink(p, p.id)))), h("td", null, h("a", { href: "#source-" + s.id }, "Inspect"))))) : empty("No source matches.", "Clear a filter or search for a different word.")
  ];
}
function claimsPanel(st, render) {
  const all = LED.claims;
  let rows = all.filter(c => {
    const hay = [c.id, c.passage.text, label("claimClassifications", c.classification), (c.concepts || []).join(" ")].join(" ").toLowerCase();
    return (!st.q || st.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) && (!st.cls || c.classification === st.cls) && (!st.pub || c.publication === st.pub);
  });
  const present = [...new Set(all.map(c => c.classification))];
  return [
    h("p", { class: "note", role: "note" }, "A classification says what kind of statement a passage is. It is not a measure of truth or credibility. Every classification here is a draft."),
    h("div", { class: "filters" }, h("input", { type: "search", "aria-label": "Search claims", value: st.q, placeholder: "Search passage text or concept", oninput: e => { st.q = e.target.value; clearTimeout(st.t); st.t = setTimeout(() => { render(); const el = $("[aria-label='Search claims']"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 200); } }),
      h("div", { class: "row", role: "group", "aria-label": "Filter by classification" }, h("button", { class: "chip", type: "button", "aria-pressed": String(!st.cls), onclick: () => { st.cls = ""; render(); } }, "All"),
        present.map(k => h("button", { class: "chip", type: "button", "aria-pressed": String(st.cls === k), onclick: () => { st.cls = k; render(); } }, `${label("claimClassifications", k)} (${all.filter(c => c.classification === k).length})`))),
      h("div", { class: "row" }, h("label", { class: "l" }, "Publication", h("select", { onchange: e => { st.pub = e.target.value; render(); } }, h("option", { value: "" }, "All"), LED.publications.map(p => h("option", { value: p.id, selected: st.pub === p.id }, p.title)))))),
    h("p", { class: "count", "aria-live": "polite" }, `${plural(rows.length, "claim", "claims")} shown of ${all.length}.`),
    rows.length ? table("Mapped claims", [{ t: "Claim", cls: "id" }, { t: "Passage" }, { t: "Classification" }, { t: "Publication" }, { t: "Sources" }, { t: "Trace" }],
      rows.map(c => h("tr", null, h("td", { class: "id" }, c.id), h("td", null, shortText(c.passage.text, 150)), h("td", null, classStamp(c)), h("td", null, pubLink(IX.pub[c.publication], c.publication)), h("td", null, c.sourceLinks.length || "none"), h("td", null, h("a", { href: "#claim-" + c.id }, "Trace →"))))) : empty("No claim matches.", "Clear a filter or search for a different word.")
  ];
}

/* ---------------------------------------------------------------- source inspector */
function viewSource(id) {
  const s = IX.src[id];
  if (!s) return notFound("source record", id);
  setTitle(s.citation.title || id);
  const c = s.citation, lv = TX.verificationLevels[s.verification.level], hist = s.verification.history;
  const originText = o => o ? `${o.kind.replace(/-/g, " ")} · ${o.id}${o.also ? " (also " + o.also + ")" : ""}` : "";
  page("evidence",
    crumbs({ t: "Ledger", href: "#home" }, { t: "Evidence Registry", href: "#evidence" }, { t: s.id }),
    h("p", { class: "kicker" }, `THE EVIDENCE INSPECTOR · source ${s.id}`),
    h("h1", { style: "font-size:clamp(28px,4.4vw,46px)" }, c.title || shortText(c.raw, 90)),
    h("p", null, ladder(s.verification.level), " ", h("span", { class: "small" }, lv.short)),
    h("section", { class: "sec", "aria-labelledby": "i-bib" }, h("h2", { id: "i-bib" }, "Bibliographic record"),
      h("p", { class: "small" }, "The citation exactly as the publication prints it:"),
      h("blockquote", { class: "passage", style: "font-size:17px" }, c.raw),
      h("dl", { class: "kv" },
        h("dt", null, "Title"), h("dd", null, c.title || "not separated from the citation"), h("dt", null, "Year"), h("dd", null, c.year || "not stated in the citation"),
        h("dt", null, "Type"), h("dd", null, s.type || "not recorded"), h("dt", null, "DOI"), h("dd", { class: "mono" }, c.doi || "none printed"),
        c.arxiv ? [h("dt", null, "arXiv"), h("dd", { class: "mono" }, c.arxiv)] : null,
        h("dt", null, "Link"), h("dd", null, s.href ? [ext(s.href, "Open the source ↗"), h("div", { class: "small mono", style: "word-break:break-all" }, s.href), s.hrefDerived ? h("div", { class: "small" }, "This address was built from the identifier printed in the citation. It was not checked.") : null] : "No address is printed in the citation."),
        h("dt", null, "Peer review of the source"), h("dd", null, "Not recorded in the Ledger. This is separate from the review status of any essay that cites it.")),
      h("p", { class: "small" }, "The fields above were read from the printed citation by a script. Check them against the quoted citation.")),
    h("section", { class: "sec", "aria-labelledby": "i-ver" }, h("h2", { id: "i-ver" }, "What has been verified"),
      h("p", null, h("b", null, lv.label + ". "), lv.meaning),
      hist.length ? h("div", { role: "list", "aria-label": "Verification records" }, hist.map(x => h("article", { class: "card", role: "listitem", style: "margin-bottom:14px" },
        h("p", { style: "margin:0" }, ladder(x.level)),
        h("dl", { class: "kv", style: "margin:0" },
          h("dt", null, "Recorded"), h("dd", null, time(x.recordedOn)),
          h("dt", null, "Inspected"), h("dd", null, x.inspectedOn ? time(x.inspectedOn) : h("span", { class: "small" }, "date not recorded")),
          h("dt", null, "What was read"), h("dd", null, x.basis, x.extent ? h("div", { class: "small" }, "Extent: " + x.extent) : null),
          h("dt", null, "Recorded by"), h("dd", null, x.performedBy),
          h("dt", null, "Origin of the note"), h("dd", { class: "small" }, originText(x.origin))))))
        : empty("No check is documented for this source.", "It is listed exactly as the publication cites it. Nothing has been confirmed about it."),
      h("p", { class: "small" }, "Bibliographic verification and interpretation review are different. A source can be confirmed to exist while the way an essay uses it remains unreviewed. No source has an interpretation review yet.")),
    s.limitations ? h("section", { class: "sec" }, h("h2", null, "Limitations noted"), h("p", null, s.limitations)) : null,
    s.observations && s.observations.length ? h("section", { class: "sec", "aria-labelledby": "i-obs" }, h("h2", { id: "i-obs" }, "Open observations"), h("p", { class: "small" }, "Things worth checking. They are observations, not corrections."), h("ul", { class: "plain" }, s.observations.map(o => h("li", null, h("span", { class: "stamp warn" }, o.status === "open" ? "Open" : "Resolved"), " ", o.text, h("div", { class: "small" }, "Raised ", fmtDate(o.raisedOn)))))) : null,
    h("section", { class: "sec", "aria-labelledby": "i-use" }, h("h2", { id: "i-use" }, "Where it is used"),
      h("ul", { class: "plain" }, s.citedBy.map(cb => { const p = IX.pub[cb.publication]; return p ? h("li", null, pubLink(p), h("span", { class: "small" }, ` · ${cb.label ? "marker " + cb.label + ", " : ""}entry ${cb.index + 1} of its source list`)) : null; })),
      s.claimIds.length ? [h("h3", { style: "font-size:18px;margin-top:16px" }, "Claims mapped near this source"), h("ul", { class: "plain" }, s.claimIds.map(cid => { const cl = IX.clm[cid]; return h("li", null, h("a", { href: "#claim-" + cid }, cid), " — ", shortText(cl.passage.text, 120), " ", supportStamp(cl.sourceLinks.find(l => l.source === s.id).support)); }))]
        : h("p", { class: "small" }, "No mapped claim points to this source yet.")),
    h("section", { class: "sec", "aria-labelledby": "i-x" }, h("h2", { id: "i-x" }, "Elsewhere on the site"),
      h("dl", { class: "kv" }, h("dt", null, "Retraction check"), h("dd", null, s.retraction.status === "not checked" ? "Not checked. The Ledger has not looked for a retraction or expression of concern." : s.retraction.status),
        Object.entries(s.links || {}).map(([k, v]) => [h("dt", null, k.replace(/Id$/, "").replace(/([A-Z])/g, " $1")), h("dd", { class: "mono" }, v)])),
      h("p", { class: "small" }, "These identifiers show where other parts of the archive already hold a record of this source.")),
    s.recordNote ? h("p", { class: "small" }, s.recordNote) : null);
}

/* ---------------------------------------------------------------- claim inspector */
function viewClaim(id) {
  const c = IX.clm[id];
  if (!c) return notFound("claim record", id);
  const p = IX.pub[c.publication];
  setTitle("Claim " + id);
  const cl = TX.claimClassifications[c.classification];
  const latest = SNAP_LATEST[p.id];
  page("evidence",
    crumbs({ t: "Ledger", href: "#home" }, { t: p.id, href: "#publication-" + p.id }, { t: c.id }),
    h("p", { class: "kicker" }, `TRACE THE CLAIM · ${c.id}`),
    h("h1", { style: "font-size:clamp(26px,4vw,40px)" }, "The passage and what stands behind it"),
    h("section", { class: "sec", "aria-labelledby": "c-pas" }, h("h2", { id: "c-pas" }, "The article passage"),
      h("blockquote", { class: "passage" }, c.passage.text),
      h("p", { class: "small" }, `Paragraph ${c.passage.index + 1} of `, pubLink(p), `, version ${c.passage.snapshot}. `, h("a", { href: essayHref(p) }, "Read it in context →")),
      h("p", { class: "small", id: "c-drift", "aria-live": "polite" })),
    h("section", { class: "sec", "aria-labelledby": "c-cl" }, h("h2", { id: "c-cl" }, "Classification"),
      h("p", null, classStamp(c)), h("p", null, cl.meaning),
      h("p", { class: "note", role: "note" }, c.classificationStatus === "draft" ? "This is a draft. " + c.classificationOrigin.note : `Reviewed ${fmtDate(c.reviewedOn)} by ${c.reviewedBy}.`),
      h("p", { class: "small" }, "A classification is not a measure of truth or credibility. One essay can contain several kinds of statement.")),
    h("section", { class: "sec", "aria-labelledby": "c-src" }, h("h2", { id: "c-src" }, "Sources the essay cites near this passage"),
      c.sourceLinks.length ? c.sourceLinks.map(l => sourceLinkCard(l, p)) : empty("No source is linked to this passage.", "The essay does not cite a source here, or no editor has linked one. The Ledger does not guess.")),
    h("section", { class: "sec", "aria-labelledby": "c-lim" }, h("h2", { id: "c-lim" }, "What this does not establish"),
      c.limitation ? [h("p", null, c.limitation), h("p", { class: "small" }, c.limitationNote || "")] : h("p", { class: "small" }, "No limit has been recorded for this passage."),
      c.debate ? h("p", null, h("b", null, "Related debate (draft): "), c.debate) : null,
      c.concepts && c.concepts.length ? h("p", { class: "small" }, "Concepts: " + c.concepts.join(", ")) : null),
    h("section", { class: "sec", "aria-labelledby": "c-rev" }, h("h2", { id: "c-rev" }, "Has the interpretation been reviewed?"),
      h("p", null, c.classificationStatus === "reviewed" ? "The classification has been reviewed." : "No. Neither the classification nor the way the essay uses its sources has been reviewed by an editor."),
      h("p", { class: "small" }, "Current revision status of the passage: ", h("span", { id: "c-revstat" }, "checking the latest saved version…"))),
    h("p", { class: "acts" }, h("a", { class: "btn", href: ROOT + "#evidence" }, "Open the Evidence Explorer"), h("a", { class: "btn", href: "#publication-" + p.id }, "Back to the publication record")));
  checkDrift(c, p);
}
const SNAP_LATEST = {};
async function checkDrift(c, p) {
  const out = $("#c-revstat"), drift = $("#c-drift");
  try {
    const snap = await snapshot(p, p.versions[p.versions.length - 1]);
    const same = snap.body.includes(c.passage.text);
    if (out) out.textContent = same ? (p.versions.length === 1 ? "unchanged since the baseline (only one version is saved)." : "this wording is unchanged in the latest saved version.") : "this wording no longer appears in the latest saved version. The claim needs to be re-mapped.";
    if (!same && drift) drift.textContent = "Notice: the passage above is the wording from the version the claim was mapped to.";
  } catch (e) { if (out) out.textContent = "could not be checked (the saved version could not be loaded)."; }
}
function sourceLinkCard(l, p) {
  const s = IX.src[l.source];
  return h("article", { class: "card", style: "margin-bottom:14px" },
    h("h3", null, h("a", { href: "#source-" + s.id }, s.citation.title || shortText(s.citation.raw, 80)), " ", h("span", { class: "mono small" }, s.id)),
    h("p", { class: "small" }, shortText(s.citation.raw, 220)),
    h("p", null, ladder(s.verification.level)),
    h("dl", { class: "kv" },
      h("dt", null, "Why it is listed"), h("dd", null, l.basis === "inline-marker" ? "The passage carries a citation marker that points to this source." : "The Evidence Explorer's draft lists this source for the passage. The essay has no citation marker at this spot."),
      h("dt", null, "Does it support the claim?"), h("dd", null, supportStamp(l.support), h("div", { class: "small" }, l.support === "not-assessed" ? "Nobody has compared this passage with this source, so the Ledger does not say it supports the claim." : l.explanation || "")),
      h("dt", null, "What was read"), h("dd", null, s.verification.history.length ? s.verification.history.map(x => x.basis).join(" ") : "Nothing is documented."),
      h("dt", null, "What the source establishes"), h("dd", null, "Not assessed by the Ledger."),
      s.limitations ? [h("dt", null, "Limitations noted"), h("dd", null, s.limitations)] : null,
      s.observations.filter(o => o.status === "open").length ? [h("dt", null, "Open observation"), h("dd", null, s.observations.filter(o => o.status === "open").map(o => o.text).join(" "))] : null),
    s.href ? h("p", { class: "small" }, ext(s.href, "Open the source ↗")) : null);
}

/* ---------------------------------------------------------------- revisions + compare */
function viewRevisions() {
  setTitle("Revision History");
  const revs = LED.revisions;
  const cats = [...new Set(revs.map(r => r.category || "unclassified"))];
  const st = { cat: "" }, out = h("div", null);
  const paint = () => {
    const rows = revs.filter(r => !st.cat || (r.category || "unclassified") === st.cat);
    out.replaceChildren(rows.length ? table("Recorded revisions and detected changes", [{ t: "Revision", cls: "id" }, { t: "Detected" }, { t: "Category" }, { t: "Summary" }, { t: "Compare" }], rows.map(r => revisionRow(r)))
      : empty("No documented revisions are available.", "No change to any published text has been recorded since version history began. This does not say the texts never changed earlier."));
  };
  page("revisions",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Revision History"),
    h("p", { class: "lede" }, "How published work has changed, from the first version the Ledger saved. A change appears here only when the public text really differs from the last saved version. Rebuilding the website without changing the text creates nothing."),
    h("p", { class: "note info", role: "note" }, "A detected change is first shown as “not yet classified”. It becomes an Editorial Revision, a Correction or another category only when an editor records what changed and why. A text difference is never called a correction automatically."),
    revs.length ? h("div", { class: "filters" }, h("div", { class: "row", role: "group", "aria-label": "Filter by category" }, h("button", { class: "chip", type: "button", "aria-pressed": "true", onclick: e => { st.cat = ""; $$(".chip", e.target.parentNode).forEach(b => b.setAttribute("aria-pressed", String(b === e.target))); paint(); } }, "All"),
      cats.map(k => h("button", { class: "chip", type: "button", "aria-pressed": "false", onclick: e => { st.cat = k; $$(".chip", e.target.parentNode).forEach(b => b.setAttribute("aria-pressed", String(b === e.target))); paint(); } }, k === "unclassified" ? "Not yet classified" : label("revisionCategories", k))))) : null,
    out,
    h("h2", { style: "margin-top:34px" }, "Saved versions"),
    table("Every saved version, oldest first within each publication", [{ t: "Publication", cls: "id" }, { t: "Version" }, { t: "Kind" }, { t: "Captured" }, { t: "Words" }, { t: "Fingerprint" }, { t: "Compare" }],
      LED.publications.flatMap(p => p.versions.map(v => h("tr", null, h("td", { class: "id" }, pubLink(p, p.id)), h("td", null, "v" + v.n), h("td", null, label("snapshotKinds", v.kind)), h("td", null, time(v.capturedOn)), h("td", null, n1(v.words)), h("td", { class: "mono" }, v.hash.slice(0, 12)), h("td", null, h("a", { href: "#compare-" + p.id }, "Open")))))),
    h("details", null, h("summary", null, "How change detection works, and what it cannot show"), h("div", null,
      h("p", null, "The Ledger reads the public text of each essay, removes only formatting differences (spacing, markup), and computes a fingerprint (a SHA-256 hash). If the fingerprint matches the last saved version, nothing is recorded. If it differs and the same new text is seen again on a later check, the new version is saved and flagged for an editor."),
      h("p", null, "A fingerprint shows that two texts are or are not identical. It does not show who changed a text, why, whether the change is correct, or that the content has been verified. It cannot see edits made and reversed between two checks, or anything before the first saved version."),
      h("p", null, "Website deployments are not revisions. The Ledger never reads the repository's commit history to decide that an essay changed."))));
}

function parseCompare(arg, p) {
  const m = /^(\d+)-(\d+)$/.exec(arg || "");
  const last = p.versions.length;
  return m ? { from: +m[1], to: +m[2] } : { from: 1, to: last };
}
function viewCompare(arg) {
  const m = /^(.+?)(?:-(\d+-\d+))?$/.exec(arg);
  const pid = m ? m[1] : arg, p = IX.pub[pid];
  if (!p) return notFound("publication record", arg);
  setTitle("Compare versions of " + p.title);
  const sel = parseCompare(m && m[2], p);
  const st = { from: Math.min(Math.max(1, sel.from), p.versions.length), to: Math.min(Math.max(1, sel.to), p.versions.length), mode: window.matchMedia && window.matchMedia("(max-width:760px)").matches ? "inline" : "side", only: true };
  const body = h("div", { "aria-live": "polite" });
  const head = [crumbs({ t: "Ledger", href: "#home" }, { t: "Revision History", href: "#revisions" }, { t: p.id, href: "#publication-" + p.id }, { t: "Compare" }),
    p.demo ? h("p", { class: "note", role: "note" }, demoStamp(), " Fictional text for trying this tool in the private preview.") : null,
    h("p", { class: "kicker" }, "COMPARE VERSIONS"), h("h1", { style: "font-size:clamp(26px,4.4vw,44px)" }, p.title),
    h("p", { class: "note info", role: "note" }, `Version history begins ${fmtDate(p.historyBegins)}. Only versions the Ledger actually saved can be compared. Earlier text is not reconstructed.`)];
  if (p.versions.length < 2) {
    const v = p.versions[0];
    page("revisions", ...head, empty("There is nothing to compare yet.", `Only one version is saved: the baseline captured ${fmtDate(v.capturedOn)} (${n1(v.words)} words, fingerprint ${v.hash.slice(0, 12)}). When the published text changes and a second version is saved, this page will show exactly what differs.`),
      h("p", { class: "acts" }, h("a", { class: "btn", href: "#publication-" + p.id }, "Back to the record"), h("a", { class: "btn", href: essayHref(p) }, "Read the essay")));
    return;
  }
  const verSel = (key, lab) => h("label", { class: "l" }, lab, h("select", { id: "cmp-" + key, onchange: e => { st[key] = +e.target.value; go(); } }, p.versions.map(v => h("option", { value: v.n, selected: st[key] === v.n }, `v${v.n} · ${fmtDate(v.capturedOn)}${v.kind === "baseline" ? " (baseline)" : ""}`))));
  const bar = h("div", { class: "cmpbar" }, verSel("from", "Earlier version"), verSel("to", "Later version"),
    h("div", { class: "seg", role: "group", "aria-label": "Display mode" }, [["side", "Side by side"], ["inline", "Inline"]].map(([k, t]) => h("button", { type: "button", class: k === "side" ? "sbs" : "", "aria-pressed": String(st.mode === k), onclick: () => { st.mode = k; go(); } }, t))),
    h("button", { class: "btn sm", type: "button", "aria-pressed": String(st.only), onclick: () => { st.only = !st.only; go(); } }, st.only ? "Showing changes only" : "Showing everything"));
  page("revisions", ...head, bar, body);
  async function go() {
    if (st.from === st.to) { body.replaceChildren(empty("Choose two different versions.", "The earlier and later version are the same, so nothing differs.")); return; }
    const a = Math.min(st.from, st.to), b = Math.max(st.from, st.to);
    $$("[aria-pressed]", bar).forEach(btn => { if (btn.closest(".seg")) btn.setAttribute("aria-pressed", String((btn.textContent === "Inline" ? "inline" : "side") === st.mode)); else btn.setAttribute("aria-pressed", String(st.only)); if (!btn.closest(".seg")) btn.textContent = st.only ? "Showing changes only" : "Showing everything"; });
    $("#cmp-from").value = st.from; $("#cmp-to").value = st.to;
    try { history.replaceState(null, "", `#compare-${p.id}-${a}-${b}`); } catch (e) { /* some embedded frames refuse; the page still works */ }
    body.replaceChildren(h("p", { class: "small" }, "Loading the saved versions…"));
    try {
      const [sa, sb] = await Promise.all([snapshot(p, p.versions[a - 1]), snapshot(p, p.versions[b - 1])]);
      body.replaceChildren(...compareView(p, a, b, sa, sb, st));
    } catch (e) { body.replaceChildren(h("div", { class: "empty", role: "alert" }, h("strong", null, "The saved versions could not be loaded."), "Try again later. Nothing was changed.")); }
  }
  go();
}
function runsNode(runs, side) {
  return runs.map(r => r.t === "same" ? r.text : r.t === "add" ? (side === "old" ? "" : h("ins", { class: "w" }, h("span", { class: "vh" }, "added: "), r.text)) : (side === "new" ? "" : h("del", { class: "w" }, h("span", { class: "vh" }, "removed: "), r.text)));
}
function compareView(p, a, b, sa, sb, st) {
  const D = window.LedgerDiff, out = [];
  const bodyRows = D.paragraphs(sa.body, sb.body), srcRows = D.paragraphs(sa.sources, sb.sources);
  const sumB = D.summarize(bodyRows), sumS = D.summarize(srcRows);
  const metaRows = [["Title", sa.title, sb.title], ["Summary line", sa.deck, sb.deck], ["Category", sa.category, sb.category]].filter(x => x[1] !== x[2]);
  const va = p.versions[a - 1], vb = p.versions[b - 1];
  out.push(h("div", { class: "cmpsum" }, h("span", null, h("b", null, `v${a} → v${b}`), ` · ${fmtDate(va.capturedOn)} → ${fmtDate(vb.capturedOn)}`),
    h("span", null, `Article text: ${sumB.add} added, ${sumB.remove} removed, ${sumB.change} changed paragraphs`), h("span", null, `Source list: ${sumS.add} added, ${sumS.remove} removed, ${sumS.change} changed`), metaRows.length ? h("span", null, `Also changed: ${metaRows.map(x => x[0].toLowerCase()).join(", ")}`) : null));
  // why: revision records for this span
  const spanRevs = LED.revisions.filter(r => r.publication === p.id && r.toSnapshot > a && r.toSnapshot <= b);
  out.push(h("div", { class: "note info", role: "note" }, h("b", null, "Why it changed. "), spanRevs.length ? spanRevs.map(r => h("div", null, r.id, ": ", r.state === "classified" ? [h("span", { class: "stamp ok" }, label("revisionCategories", r.category)), " " + r.summary + (r.reason ? " Reason: " + r.reason : "")] : "A change was detected on " + fmtDate(r.detectedOn) + " and has not yet been classified. The Ledger does not say why it happened.",
    r.category === "correction" ? [" ", Object.values(IX.cor).filter(c => c.relatedRevision === r.id).map(c => h("a", { href: "#correction-" + c.id }, "View the correction record →"))] : null)) : "No revision record covers this span."));
  if (sumB.changed + sumS.changed + metaRows.length === 0) { out.push(empty("These two versions have identical text.", "Nothing is marked as changed.")); return out; }
  if (metaRows.length) out.push(h("div", { class: "inlwrap", style: "margin-bottom:16px" }, metaRows.map(([k, x, y]) => h("div", { class: "inl change" }, h("span", { class: "tag change" }, "Changed"), h("b", null, k + ": "), runsNode(D.wordDiff(x, y), "both")))));
  const changes = [];
  const section = (title, rows, kind) => {
    const sb = h("section", { "aria-label": title, style: "margin-bottom:26px" }, h("h2", { style: "font-size:22px" }, title));
    const mk = (r, i) => { const idn = `chg-${kind}-${i}`; changes.push({ id: idn, text: D.describe(r), where: title }); return idn; };
    if (st.mode === "side") {
      const grid = h("div", { class: "cmpgrid", role: "group", "aria-label": title + ", side by side" }, h("div", { class: "colh" }, `Earlier · v${a}`), h("div", { class: "colh" }, `Later · v${b}`));
      const rowsHost = h("div", { style: "grid-column:1/-1" });
      grid.append(rowsHost);
      collapse(rows, st.only).forEach(item => {
        if (item.skip) { rowsHost.append(skipRow(item)); return; }
        const r = item.row, idn = r.kind === "same" ? null : mk(r, item.i);
        rowsHost.append(h("div", { class: "cmprow " + r.kind, id: idn },
          h("div", null, r.kind === "add" ? h("span", { class: "empty-cell" }, "(not in this version)") : [r.kind !== "same" ? tag(r.kind === "remove" ? "remove" : "change") : null, r.kind === "change" ? runsNode(r.runs, "old") : r.oldText]),
          h("div", null, r.kind === "remove" ? h("span", { class: "empty-cell" }, "(not in this version)") : [r.kind !== "same" ? tag(r.kind === "add" ? "add" : "change") : null, r.kind === "change" ? runsNode(r.runs, "new") : r.newText])));
      });
      sb.append(grid);
    } else {
      const wrap = h("div", { class: "inlwrap", role: "group", "aria-label": title + ", inline" });
      collapse(rows, st.only).forEach(item => {
        if (item.skip) { wrap.append(skipRow(item)); return; }
        const r = item.row, idn = r.kind === "same" ? null : mk(r, item.i);
        wrap.append(h("div", { class: "inl " + r.kind, id: idn },
          r.kind === "same" ? r.newText : r.kind === "add" ? [tag("add"), h("ins", { class: "w" }, h("span", { class: "vh" }, "added paragraph: "), r.newText)] : r.kind === "remove" ? [tag("remove"), h("del", { class: "w" }, h("span", { class: "vh" }, "removed paragraph: "), r.oldText)] : [tag("change"), runsNode(r.runs, "both")]));
      });
      sb.append(wrap);
    }
    return sb;
  };
  const secB = section("Article text", bodyRows, "b"), secS = section("Source list", srcRows, "s");
  out.push(h("details", { open: "" }, h("summary", null, "How to read this comparison"), h("div", null, h("p", { class: "small" }, "Every difference carries a text label: ADDED, REMOVED or CHANGED. Inside a changed paragraph, added words sit in [+brackets] with an underline and removed words in [−brackets] with a line through them. Colour is only a reinforcement. Screen readers announce “added:” and “removed:” before each piece. Unchanged paragraphs are never marked."))));
  out.push(h("div", { id: "chg-list-host" })); out.push(secB, secS);
  const lst = changes.length ? h("details", { open: "" }, h("summary", null, `List of changes (${changes.length})`), h("div", null, h("ol", { class: "chlist", style: "display:block;list-style:decimal;padding-left:22px" }, changes.map(c => h("li", { style: "margin-bottom:6px" }, h("a", { href: "#" + c.id, onclick: e => { e.preventDefault(); const el = document.getElementById(c.id); if (el) { el.scrollIntoView({ block: "center" }); el.setAttribute("tabindex", "-1"); el.focus(); } } }, c.text), h("span", { class: "small" }, " · " + c.where))))) ) : null;
  if (lst) out.splice(out.findIndex(x => x.id === "chg-list-host"), 1, lst); else out.splice(out.findIndex(x => x.id === "chg-list-host"), 1);
  out.push(h("p", { class: "small" }, `Fingerprints: v${a} ${va.hash.slice(0, 12)} · v${b} ${vb.hash.slice(0, 12)}. A fingerprint shows whether two texts are identical. It does not prove authorship or that the content is verified.`));
  return out;
}
const tag = k => h("span", { class: "tag " + k }, k === "add" ? "Added" : k === "remove" ? "Removed" : "Changed");
function collapse(rows, only) {
  const out = []; let run = [];
  const flush = () => { if (run.length) { out.push(run.length > 2 && only ? { skip: true, rows: run } : null); if (!(run.length > 2 && only)) run.forEach(x => out.push(x)); } run = []; };
  rows.forEach((row, i) => { const it = { row, i }; if (row.kind === "same") run.push(it); else { flush(); out.push(it); } });
  flush();
  return out.filter(Boolean);
}
function skipRow(item) {
  const box = h("div", { class: "same-run" });
  const show = () => { box.replaceWith(...item.rows.map(it => h("div", { class: "inl" }, it.row.newText))); };
  box.append(`${plural(item.rows.length, "unchanged paragraph", "unchanged paragraphs")} hidden. `, h("button", { type: "button", onclick: show }, "Show them"));
  return box;
}

/* ---------------------------------------------------------------- corrections view */
function viewCorrections() {
  setTitle("Corrections & Clarifications");
  const cs = LED.corrections;
  page("corrections",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Corrections & Clarifications"),
    h("p", { class: "lede" }, "A correction should be visible rather than silently hidden. Each one records what was wrong, what it now says, why, and where."),
    cs.length ? cs.map(correctionCard) : empty("No formal corrections have been recorded in this Ledger.", "This does not mean the publications contain no errors. It means none has been recorded. Nothing is shown here to fill the space."),
    h("section", { class: "sec" }, h("h2", null, "What counts, and how it is shown"),
      h("ul", { class: "plain" }, LED.taxonomy.correctionKinds.map(k => h("li", null, h("b", null, k.label), " — ", k.meaning))),
      h("p", { class: "small" }, "A correction that materially changes what an essay says will carry a notice at the top of that essay, linked to its record here. Minor formatting fixes are recorded in Revision History and do not need a prominent notice.")),
    h("p", null, h("a", { class: "btn", href: "#concern" }, "Report a research concern →")),
    concernPanel());
}

/* ---------------------------------------------------------------- review status */
function viewReview() {
  setTitle("Review Status");
  page("review",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Review Status"),
    h("p", { class: "lede" }, "What has actually been examined. These statuses describe this site's own editorial process. They are not peer review, and the site is not affiliated with a university, laboratory, journal or review board."),
    table("Review status of each publication", [{ t: "Publication", cls: "id" }, { t: "Status" }, { t: "Sources checked" }, { t: "Claims" }, { t: "Last status change" }],
      LED.publications.map(p => { const r = reviewOf(p), s = p.sourceIds.map(i => IX.src[i]); return h("tr", null, h("td", null, pubLink(p)), h("td", null, reviewStamp(r.status)), h("td", null, `${s.filter(x => x.verification.level !== "verification-incomplete").length} of ${s.length}`), h("td", null, `${p.claimIds.length} (draft)`), h("td", null, time(r.history[r.history.length - 1].on))); })),
    h("section", { class: "sec" }, h("h2", null, "The six statuses"),
      h("ul", { class: "plain" }, LED.taxonomy.reviewStatuses.map(s => h("li", null, reviewStamp(s.id), h("p", { class: "small", style: "margin:6px 0 0" }, s.meaning, " ", LED.publications.filter(p => reviewOf(p).status === s.id).length ? "Used by " + LED.publications.filter(p => reviewOf(p).status === s.id).length + " publication(s) now." : "No publication has this status now.")))),
      h("p", { class: "small" }, "A publication's status is separate from the review status of the sources it cites. The Ledger never approves its own reviews. Each completed review will record its reviewer, date, scope, criteria, materials examined, findings, limitations, outcome and approval. Where a reviewer has not been identified, none is shown.")),
    h("section", { class: "sec" }, h("h2", null, "How the editorial decision process is meant to work"),
      h("ol", null, ["Issue or update identified: a source concern, revision proposal, new publication or correction request is recorded.", "Review: the article, claim or source is examined.", "Editorial decision: an authorised editor decides what to do.", "Revision prepared: updated content or a new explanatory record is written.", "Approval: the change is approved under the documented policy.", "Publication: the authorised publishing system releases the change.", "Ledger update: the Ledger records what was actually published.", "Public transparency: visitors can inspect the revision or correction."].map(t => h("li", null, t))),
      h("p", { class: "small" }, "This is the proposed process. It becomes an official standard only when the owner approves it. See Editorial Methodology.")));
}

/* ---------------------------------------------------------------- methodology */
function viewMethodology() {
  setTitle("Editorial Methodology");
  const approved = LED.integrity.policiesApproved, total = LED.integrity.policiesTotal;
  page("methodology",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "EDITORIAL METHODOLOGY"),
    h("p", { class: "lede" }, "The standards used to prepare and maintain research here. A section is called an approved standard only after the site owner has approved it. Until then it is listed honestly, with what is already documented."),
    h("p", { class: "note", role: "note" }, `${approved} of ${total} sections are approved standards. The rest are either proposed drafts awaiting the owner's approval, or need a decision from the owner before a draft can be written. Nothing below describes an institutional process that does not exist.`),
    LED.policies.map(p => h("section", { class: "sec", id: "pol-" + p.key, "aria-labelledby": "pt-" + p.key },
      h("h2", { id: "pt-" + p.key }, p.title, " ", policyStamp(p.status)), h("p", { class: "small" }, "This section will cover: " + p.covers),
      p.status === "approved" ? [h("p", null, p.text), h("p", { class: "small" }, `Approved by ${p.approvedBy}, ${fmtDate(p.approvedOn)}.`)] : h("p", { class: "small" }, p.status === "proposed" ? "Not yet an official standard." : "No draft can be written until the owner decides."),
      p.documentedPractice.length ? [h("h3", { class: "mini" }, "Already documented on this site"), h("ul", { class: "plain" }, p.documentedPractice.map(x => h("li", null, x.text, h("div", { class: "small mono" }, x.provenance))))] : null,
      PREVIEW && p.draft ? h("details", { class: "owner" }, h("summary", null, "Owner review only: proposed draft and questions"), h("div", null, h("p", { class: "note", role: "note" }, "Private preview. This text is not published and is not an official standard."), h("p", null, p.draft), h("h3", { class: "mini" }, "Decisions needed from the owner"), h("ul", null, p.ownerQuestions.map(q => h("li", null, q))))) : null)),
    h("section", { class: "sec" }, h("h2", null, "How the Ledger's software works"), h("p", { class: "small" }, "This describes the tools, not an editorial policy."),
      h("ul", { class: "plain" },
        h("li", null, h("b", null, "Version capture. "), "A scheduled script reads each published essay, normalises spacing and markup, and computes a SHA-256 fingerprint. It saves a new version only when the fingerprint differs from the last one and the same new text is seen again on a later check."),
        h("li", null, h("b", null, "What it cannot do. "), "It cannot reconstruct edits made before the first saved version, see changes made and undone between checks, or tell who changed a text or why. A fingerprint is not proof of authenticity or verification."),
        h("li", null, h("b", null, "Deployments are not revisions. "), "The Ledger ignores the repository's commit history and the feed's rebuild time when deciding whether an essay changed."),
        h("li", null, h("b", null, "Nothing is approved by software. "), "Verification levels, classifications, reviews and corrections are recorded by people. Imported notes keep their origin and say who recorded them."))));
}

/* ---------------------------------------------------------------- timeline */
const EV = { publication: ["Article published", "Publication date"], baseline: ["Ledger record created · baseline captured", "Ledger record date"], "metadata-check": ["Source metadata checked", "Event date"], "source-import": ["Source records imported", "Ledger record date"], "evidence-draft": ["Draft classifications released", "Event date"], "change-detected": ["Change detected", "Ledger record date"], revision: ["Revision recorded", "Event date"], correction: ["Correction recorded", "Event date"], review: ["Editorial review recorded", "Event date"] };
const evLabel = k => (EV[k] || [k.replace(/-/g, " "), "Event date"])[0];
function eventHref(e) {
  if (e.kind === "publication") return "#publication-" + e.publication;
  if (e.kind === "baseline" || e.kind === "change-detected") return "#compare-" + e.publication;
  if (e.kind === "metadata-check") return "#publication-" + e.publication;
  if (e.kind === "evidence-draft") return "#evidence";
  if (e.kind === "source-import") return "#evidence";
  return "#publications";
}
function viewTimeline() {
  setTitle("Research Timeline");
  const evs = LED.timeline, st = { pub: "", kind: "", from: "", to: "", rev: "", topic: "" };
  const list = h("ol", { class: "tl", "aria-label": "Documented research events, oldest first" }), count = h("p", { class: "count", "aria-live": "polite" }), viz = h("div", null);
  const kinds = [...new Set(evs.map(e => e.kind))];
  const topics = [...new Set(LED.publications.flatMap(p => (p.context.concepts || []).map(c => c.title)))].sort();
  const revs = [...new Set(LED.publications.map(p => reviewOf(p).status))];
  const keep = e => {
    const p = e.publication ? IX.pub[e.publication] : null;
    if (st.pub && e.publication !== st.pub) return false;
    if (st.kind && e.kind !== st.kind) return false;
    if (st.from && e.date < st.from) return false;
    if (st.to && e.date > st.to) return false;
    if (st.rev && !(p && reviewOf(p).status === st.rev)) return false;
    if (st.topic && !(p && (p.context.concepts || []).some(c => c.title === st.topic))) return false;
    return true;
  };
  const paint = () => {
    const rows = evs.filter(keep);
    count.textContent = `${plural(rows.length, "event", "events")} shown of ${evs.length}.`;
    list.replaceChildren(...(rows.length ? rows.map(e => { const p = e.publication ? IX.pub[e.publication] : null; return h("li", { class: EV[e.kind] && EV[e.kind][1] === "Ledger record date" ? "ledgerdate" : "" },
      h("time", { datetime: e.date }, fmtDate(e.date)), " ", h("span", { class: "stamp none" }, evLabel(e.kind)), " ", h("span", { class: "small" }, (EV[e.kind] || [0, "Event date"])[1]),
      h("h3", null, h("a", { href: eventHref(e) }, e.title)), h("p", null, e.text), h("p", { class: "small" }, "Where this date comes from: " + (e.provenance.ref || e.provenance.kind)), p ? h("p", { class: "small" }, "Publication: ", pubLink(p, p.id)) : null); }) : [h("li", null, empty("No event matches these filters."))]));
    viz.replaceChildren(timelineSvg(rows));
  };
  const sel = (lab, key, opts) => h("label", { class: "l" }, lab, h("select", { onchange: e => { st[key] = e.target.value; paint(); } }, h("option", { value: "" }, "All"), opts.map(([v, t]) => h("option", { value: v }, t))));
  page("timeline",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "THE RESEARCH TIMELINE"),
    h("p", { class: "lede" }, "Documented research events, with their real dates. The Living Archive shows when essays were published; the Timeline shows what the Ledger has recorded about them. No past event has been filled in."),
    h("p", { class: "note info", role: "note" }, "Square markers are publication dates. Round markers are dates the Ledger recorded something. The two are different and are never merged. ", h("a", { href: ROOT + "#living" }, "Open the Living Archive →")),
    h("div", { class: "filters" }, h("div", { class: "row" },
      sel("Publication", "pub", LED.publications.map(p => [p.id, p.title])), sel("Event type", "kind", kinds.map(k => [k, evLabel(k)])), sel("Review status", "rev", revs.map(r => [r, label("reviewStatuses", r)])), sel("Research topic", "topic", topics.map(t => [t, t])),
      h("label", { class: "l" }, "From", h("input", { type: "date", onchange: e => { st.from = e.target.value; paint(); } })), h("label", { class: "l" }, "To", h("input", { type: "date", onchange: e => { st.to = e.target.value; paint(); } })))),
    count, viz, h("h2", { style: "font-size:22px" }, "The same events as a list"), list);
  paint();
}
function timelineSvg(rows) {
  if (!rows.length) return h("div");
  const W = 900, H = 190, pad = 56, ds = rows.map(r => Date.parse(r.date + "T00:00:00Z")), lo = Math.min(...ds), hi = Math.max(...ds), span = Math.max(hi - lo, 86400000);
  const x = d => pad + ((Date.parse(d + "T00:00:00Z") - lo) / span) * (W - 2 * pad);
  const svg = sv("svg", { class: "tlsvg", viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true", focusable: "false" });
  svg.append(sv("line", { x1: pad, y1: 95, x2: W - pad, y2: 95, stroke: "#333c3a", "stroke-width": 1 }),
    sv("text", { x: pad, y: 178, "text-anchor": "start" }, fmtDate(rows.map(r => r.date).sort()[0])), sv("text", { x: W - pad, y: 178, "text-anchor": "end" }, fmtDate(rows.map(r => r.date).sort().slice(-1)[0])),
    sv("text", { x: pad, y: 22 }, "Publication dates (squares, above the line)"), sv("text", { x: pad, y: 38, fill: "#e9c98a" }, "Dates the Ledger recorded something (circles, below the line)"));
  const seen = {};
  rows.forEach(r => {
    const isPub = r.kind === "publication", k = r.date + isPub; seen[k] = (seen[k] || 0) + 1;
    const cx = x(r.date), cy = isPub ? 70 - (seen[k] - 1) * 18 : 120 + (seen[k] - 1) * 18;
    const mark = isPub ? sv("rect", { x: cx - 6, y: cy - 6, width: 12, height: 12, fill: "#8fe9c4" }) : sv("circle", { cx, cy, r: 6, fill: "#e9c98a" });
    mark.append(sv("title", null, `${fmtDate(r.date)}: ${r.title}`)); svg.append(mark);
  });
  return h("div", { style: "margin:14px 0 22px" }, svg, h("p", { class: "small" }, "A visual summary of the same events. The list below holds all of the detail."));
}

/* ---------------------------------------------------------------- integrity */
function viewIntegrity() {
  setTitle("Research Integrity");
  const I = LED.integrity, T = LED.taxonomy;
  const bar = (items, total) => items.map(([l, v]) => h("div", { class: "meterrow" }, h("span", null, l), h("span", { class: "bar", "aria-hidden": "true" }, h("i", { style: `width:${total ? Math.max(v ? 2 : 0, (v / total) * 100) : 0}%` })), h("span", { class: "n" }, v)));
  const stat = (n, t) => h("div", { class: "stat" }, h("b", null, n), h("span", null, t));
  page("integrity",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "RESEARCH INTEGRITY"),
    h("p", { class: "lede" }, "A factual overview of the archive's records. Every number is counted from the records. There is no score, no accuracy percentage and no quality ranking, and none is implied."),
    h("div", { class: "stats" }, stat(I.publications, "published original essays"), stat(I.sources, "recorded sources"), stat(I.verificationRecords, "source verification records"), stat(I.claims, "mapped claims (all drafts)"), stat(I.editoriallyReviewed, "editorially reviewed publications"), stat(I.awaitingReview, "awaiting editorial review"), stat(I.revisionsClassified, "documented revisions"), stat(I.corrections, "published corrections"), stat(I.snapshots, "saved versions"), stat(fmtDate(I.ledgerUpdated), "latest Ledger update")),
    h("p", { class: "note", role: "note" }, "Zero corrections does not mean perfect accuracy. It means no correction has been recorded. More sources do not mean better research."),
    h("div", { class: "grid2" },
      h("section", null, h("h2", { style: "font-size:22px" }, "Sources by verification step"), bar(T.verificationLevels.map(l => [l.label, I.sourcesByLevel[l.id]]), I.sources)),
      h("section", null, h("h2", { style: "font-size:22px" }, "Claims by classification (drafts)"), bar(T.claimClassifications.map(l => [l.label, I.claimsByClassification[l.id]]), I.claims))),
    h("div", { class: "grid2" },
      h("section", null, h("h2", { style: "font-size:22px" }, "Claim-to-source links"), h("p", { class: "small" }, `${I.claimSourceLinks} links. ${I.claimsWithoutSource} claims have no source linked.`), bar(T.supportStatuses.map(l => [l.label, I.linksBySupport[l.id]]), I.claimSourceLinks)),
      h("section", null, h("h2", { style: "font-size:22px" }, "Publications by review status"), bar(T.reviewStatuses.map(l => [l.label, I.reviewsByStatus[l.id]]), I.publications))),
    h("section", { class: "sec" }, h("h2", null, "Waiting for a person"),
      h("ul", { class: "plain" }, [[I.changesUnclassified, "detected text changes waiting to be classified"], [I.openObservations, "open observations about sources"], [I.sourcesByLevel["verification-incomplete"], "sources with no documented check"], [I.policiesTotal - I.policiesApproved, "methodology sections not yet approved"]].map(([n, t]) => h("li", null, h("b", null, n), " ", t)))));
}

/* ---------------------------------------------------------------- life of an idea */
function viewIdea() {
  setTitle("The Life of an Idea");
  const pubs = LED.publications.filter(p => !p.demo);
  const concepts = {};
  pubs.forEach(p => (p.context.concepts || []).forEach(c => (concepts[c.id] = concepts[c.id] || { id: c.id, title: c.title, pubs: [] }).pubs.push(p)));
  const list = Object.values(concepts).sort((a, b) => b.pubs.length - a.pubs.length || a.title.localeCompare(b.title));
  const host = h("div", null);
  const draw = id => {
    const c = concepts[id], ps = c.pubs.slice().sort((a, b) => (a.publishedAt || "").localeCompare(b.publishedAt || ""));
    const srcs = [...new Set(ps.flatMap(p => p.sourceIds))].map(i => IX.src[i]);
    const checked = srcs.filter(s => s.verification.level !== "verification-incomplete").length;
    const theories = ps.flatMap(p => p.context.theories.map(t => ({ ...t, pub: p })));
    const open = ps.flatMap(p => claimsOf(p).filter(x => x.classification === "open-question"));
    const revs = ps.flatMap(p => p.revisionIds.map(i => IX.rvn[i])), cors = ps.flatMap(p => p.correctionIds);
    const stages = [
      ["published", ps.length ? "documented" : "none", ps.map(p => h("div", null, time(p.publishedAt), " · ", pubLink(p)))],
      ["sources", srcs.length ? "documented" : "none", [h("div", null, `${srcs.length} sources cited; ${checked} have a documented check, ${srcs.length - checked} do not.`), h("div", { class: "small" }, "Levels reached: " + [...new Set(srcs.map(s => label("verificationLevels", s.verification.level)))].join(", ")), h("a", { href: "#evidence" }, "Open the Evidence Registry →")]],
      ["theories", theories.length ? "documented" : "none", theories.length ? theories.map(t => h("div", null, ext(t.url, t.name), h("span", { class: "small" }, ` · recorded by the Theory Chamber for “${t.pub.title}”`))) : [h("div", null, "No theory records mention these essays.")]],
      ["questions", open.length ? "documented" : "none", open.length ? open.map(c => h("div", { style: "margin-bottom:8px" }, h("a", { href: "#claim-" + c.id }, shortText(c.passage.text, 140)))) : [h("div", null, "No open question has been mapped from these essays.")]],
      ["review", ps.some(p => ["editorially-reviewed", "review-completed-with-limitations"].includes(reviewOf(p).status)) ? "documented" : "none", ps.map(p => h("div", null, pubLink(p, p.id), ": ", reviewStamp(reviewOf(p).status)))],
      ["revised", revs.length || cors.length ? "documented" : "none", revs.length || cors.length ? [h("div", null, `${revs.length} revision records, ${cors.length} corrections.`)] : [h("div", null, "Not yet documented. Version history begins " + fmtDate(ps[0].historyBegins) + ".")]],
      ["newer", "none", [h("div", null, "No newer research has been reviewed against these essays."), ps.some(p => p.context.suggestions.length) ? h("div", { class: "small" }, "The Research Observatory has suggested papers by topic tag. Nobody has reviewed them, so they are not counted here.") : null]]
    ];
    host.replaceChildren(h("ol", { class: "steps", style: "flex-direction:column", "aria-label": "Documented stages for " + c.title }, stages.map(([k, state, body]) => h("li", { class: state === "documented" ? "done" : "open", style: "flex:none" }, h("b", null, label("lifeOfAnIdea", k)), h("span", { class: "small" }, TX.lifeOfAnIdea[k].meaning), h("div", { style: "margin-top:8px" }, body), h("span", { class: "st" }, state === "documented" ? "Documented" : "Not yet documented")))),
      h("p", { class: "small" }, "This is a map of records that exist. Where there are none, it says so. It is not a narrative, and it does not guess what happened between records."));
  };
  page("idea",
    h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "THE LIFE OF AN IDEA"),
    h("p", { class: "lede" }, "Follow the documented development of a concept across the essays that address it: when they were published, which sources they cite, which theories and questions they raise, and whether anything has been reviewed, revised or corrected."),
    h("div", { class: "filters" }, h("label", { class: "l" }, "Concept", h("select", { id: "idea-sel", onchange: e => draw(e.target.value) }, list.map(c => h("option", { value: c.id, selected: c.id === "consciousness" }, `${c.title} (${plural(c.pubs.length, "essay", "essays")})`))))),
    host);
  draw($("#idea-sel").value);
}

/* ---------------------------------------------------------------- report a concern */
function composeConcern(f) {
  return ["REPORT A RESEARCH CONCERN", `Type: ${f.type}`, `Publication: ${f.pub || "not specified"}`, `Where: ${f.where || "not specified"}`, "", f.details.trim(), "", `Prepared on the Research Ledger page, ${fmtDate(new Date().toISOString().slice(0, 10))}. Not yet sent to anyone.`].join("\n");
}
const CONCERN_TYPES = ["Incorrect citation", "Broken source link", "Potential factual error", "Misleading interpretation", "Outdated research claim", "Attribution concern", "Accessibility problem"];
function concernPanel() {
  const cfg = (LED.config && LED.config.concernChannels) || {}, hasEndpoint = !!(cfg.endpoint && /^https:\/\//.test(cfg.endpoint));
  const gh = cfg.githubIssues && cfg.githubIssues.enabled ? cfg.githubIssues : null;
  const out = h("div", { "aria-live": "polite" });
  const sel = h("select", { id: "cn-type", name: "type" }, CONCERN_TYPES.map(t => h("option", { value: t }, t)));
  const pub = h("select", { id: "cn-pub" }, h("option", { value: "" }, "Not specified"), LED.publications.filter(p => !p.demo).map(p => h("option", { value: p.title + " (" + p.id + ")" }, p.title)));
  const where = h("input", { type: "text", id: "cn-where", placeholder: "For example: paragraph 12, or source 4" });
  const det = h("textarea", { id: "cn-det", "aria-describedby": "cn-hint" });
  const form = h("form", { novalidate: "", onsubmit: e => {
    e.preventDefault();
    const f = { type: sel.value, pub: pub.value, where: where.value, details: det.value };
    if (f.details.trim().length < 15) { out.replaceChildren(h("p", { class: "note", role: "alert" }, "Please describe the concern in at least a sentence (15 characters).")); det.focus(); return; }
    const text = composeConcern(f);
    const box = h("textarea", { readonly: "", "aria-label": "Your prepared message", style: "min-height:190px" }); box.value = text;
    const copy = h("button", { class: "btn", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; } catch (x) { box.select(); copy.textContent = "Select and copy the text above"; } } }, "Copy the message");
    out.replaceChildren(h("div", { class: "note", role: "status" }, h("b", null, "Nothing has been sent. "), "The Ledger has no secure submission service yet, so it cannot receive reports. The message below was prepared in your browser and exists only on this page. Copy it and send it through a channel you trust once one is published."),
      box, h("div", { class: "acts", style: "margin-top:10px" }, copy,
        hasEndpoint ? h("button", { class: "btn primary", type: "button", id: "cn-send", onclick: () => sendConcern(cfg.endpoint, f, out) }, "Send to the Ledger") : null,
        gh ? ext(`https://github.com/${gh.repository}/issues/new?title=${encodeURIComponent("Research concern: " + f.type)}&body=${encodeURIComponent(text)}`, "Open as a public GitHub issue ↗") : null),
      gh ? h("p", { class: "small" }, "A GitHub issue is public. Anyone can read it.") : null);
  } },
    h("label", { class: "l" }, "What kind of concern?", sel), h("label", { class: "l", style: "margin-top:12px" }, "Which publication?", pub), h("label", { class: "l", style: "margin-top:12px" }, "Where in it? (optional)", where),
    h("label", { class: "l", style: "margin-top:12px" }, "Describe the concern", det), h("p", { class: "small", id: "cn-hint" }, "Do not include personal details you want to keep private."),
    h("div", { class: "acts" }, h("button", { class: "btn primary", type: "submit" }, "Prepare my message")));
  return h("section", { class: "sec", id: "concern", "aria-labelledby": "cn-h" }, h("h2", { id: "cn-h" }, "REPORT A RESEARCH CONCERN"),
    h("p", { class: "note", role: "note" }, hasEndpoint ? "Reports are read privately by an editor before any public correction is made." : h("span", null, h("b", null, "This form cannot send anything yet. "), "A secure submission and moderation service has not been built, and the site has no public contact address. Until one exists, the form prepares a message for you to keep.")),
    h("p", { class: "small" }, "You can report: ", CONCERN_TYPES.join(", ").toLowerCase(), ". All reports should be read privately before any public correction is issued."),
    form, out);
}
async function sendConcern(endpoint, f, out) {
  const btn = $("#cn-send"); if (btn) btn.disabled = true;
  try {
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: f.type, publication: f.pub, where: f.where, details: f.details }), credentials: "omit" });
    if (r.ok) out.prepend(h("p", { class: "note", role: "status" }, "The Ledger's service accepted your report. It will be read privately before anything is published."));
    else out.prepend(h("p", { class: "note", role: "alert" }, r.status === 429 ? "Too many reports just now. Your text is still here. Try again later." : "The report could not be sent. Your text is still here, and nothing was received."));
  } catch (e) { out.prepend(h("p", { class: "note", role: "alert" }, "The report could not be sent. Your text is still here, and nothing was received.")); }
  if (btn) btn.disabled = false;
}
function viewConcern() { setTitle("Report a research concern"); page("corrections", h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Report a research concern"), concernPanel()); }

/* ---------------------------------------------------------------- misc views + router */
function notFound(kind, id) {
  setTitle("Not found");
  page("home", h("h1", { style: "font-size:36px" }, "Record not found"), empty(`No ${kind} “${String(id).replace(/[^\w-]/g, "")}” exists in the Ledger.`, "It may not have been recorded yet. Browse the sections above."), h("p", null, h("a", { class: "btn", href: "#publications" }, "Publication Records")));
}
function viewCorrectionRecord(id) {
  const c = IX.cor[id]; if (!c) return notFound("correction record", id);
  setTitle("Correction " + id); page("corrections", crumbs({ t: "Ledger", href: "#home" }, { t: "Corrections & Clarifications", href: "#corrections" }, { t: id }), h("h1", { style: "font-size:clamp(28px,4.4vw,44px)" }, "Correction record " + id), correctionCard(c));
}
function viewRevisionRecord(id) {
  const r = IX.rvn[id]; if (!r) return notFound("revision record", id);
  location.replace(`#compare-${r.publication}-${r.fromSnapshot}-${r.toSnapshot}`);
}
function route(initial) {
  if (!LED) return;
  const hs = decodeURIComponent((location.hash || "#home").slice(1));
  let m;
  const view = () => {
    if ((m = /^publication-(.+)$/.exec(hs))) return viewPublication(m[1]);
    if ((m = /^source-(.+)$/.exec(hs))) return viewSource(m[1]);
    if ((m = /^claim-(.+)$/.exec(hs))) return viewClaim(m[1]);
    if ((m = /^compare-(.+)$/.exec(hs))) return viewCompare(m[1]);
    if ((m = /^correction-(.+)$/.exec(hs))) return viewCorrectionRecord(m[1]);
    if ((m = /^revision-(.+)$/.exec(hs))) return viewRevisionRecord(m[1]);
    const v = { home: viewHome, publications: viewPublications, evidence: viewEvidence, revisions: viewRevisions, corrections: viewCorrections, review: viewReview, methodology: viewMethodology, timeline: viewTimeline, integrity: viewIntegrity, idea: viewIdea, concern: viewConcern }[hs];
    return v ? v() : notFound("page", hs);
  };
  view();
  // After a navigation, move focus to the new content so keyboard and screen-reader users start at the top of it.
  // On first load do not: the first Tab should reach the "Skip to content" link.
  const main = $("#main"); if (main && !initial && !/^compare-/.test(hs)) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
}
function toggleDemo() {
  DEMO_ON = !DEMO_ON;
  const base = window.__LEDGER_BASE || (window.__LEDGER_BASE = JSON.parse(JSON.stringify(LED)));
  LED = JSON.parse(JSON.stringify(base));
  if (DEMO_ON && LED.demo) {
    const d = LED.demo;
    for (const k of ["publications", "sources", "claims", "reviews", "revisions", "corrections"]) LED[k] = LED[k].concat(d[k] || []);
    LED.timeline = LED.timeline.concat(d.timeline || []);
    if (d.snapshots) window.__SNAPSHOTS = Object.assign(window.__SNAPSHOTS || {}, d.snapshots);
  }
  index(); route(true);
  const t = $("#demo-toggle"); if (t) t.focus();   // keep the keyboard where it was
}
async function boot() {
  shell();
  try { await load(); }
  catch (e) { $("#main").replaceChildren(h("div", { class: "wrap" }, h("div", { class: "empty", role: "alert" }, h("strong", null, "The Research Ledger could not be loaded."), "The Ledger data is missing or unreadable. Nothing has been changed. Please try again later."))); return; }
  window.addEventListener("hashchange", () => route());
  route(true);
}
if (typeof document !== "undefined") boot();
