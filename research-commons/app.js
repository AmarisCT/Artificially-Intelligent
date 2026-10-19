/* The Research Commons.
   Reads only public JSON: research-commons/data/*.json, the shared research index, the Unanswered Archive's data and the Lexicon.
   No credentials, no moderation controls, no storage of anything a visitor types. The only network write is the submission request,
   and only when a secure service is configured. All text is inserted with textContent; links are https or relative only. */
"use strict";
const ROOT = window.COMMONS_ROOT || "../";
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
const okHref = u => (/^https:\/\/[^\s"'<>]+$/.test(u || "") || /^[./#][^:\s"'<>]*$/.test(u || "") ? u : "#");
const ext = (u, ...k) => h("a", { href: okHref(u), target: "_blank", rel: "noopener noreferrer" }, ...k);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ""; }
const time = iso => iso ? h("time", { datetime: iso }, fmtDate(iso)) : null;
const clip = (s, n) => { s = (s || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(" "), n - 20)).replace(/[,;:\s]+$/, "") + "…"; };
const paras = t => (t || "").split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
const enc64 = q => btoa(unescape(encodeURIComponent(q))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const inquiryUrl = q => ROOT + "inquiry-engine/#q-" + enc64(q);
function say(m) { const l = $("#live"); if (l) { l.textContent = ""; setTimeout(() => { l.textContent = m; }, 30); } }

/* ============================================================ data */
let C = null;                  // everything loaded
let PREVIEW = false, DEMO_ON = false;
let X = {};                    // derived: indexes
const MIN_MS = 3000;           // the browser waits at least this long before sending; the server enforces its own minimum

async function getJSON(path, optional) {
  try { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(path + " " + r.status); return await r.json(); }
  catch (e) { if (optional) return null; throw e; }
}
async function load() {
  if (window.__COMMONS) C = window.__COMMONS;
  else {
    const [config, taxonomy, collections, pub, rel, status, index] = await Promise.all([
      getJSON("config.json"), getJSON("data/taxonomy.json"), getJSON("data/collections.json"), getJSON("data/public-contributions.json"),
      getJSON("data/contribution-relations.json"), getJSON("data/commons-status.json"), getJSON(ROOT + "inquiry-engine/data/research-index.json", true)]);
    const [archiveConfig, lexicon, guidelines] = await Promise.all([getJSON(ROOT + "unanswered-archive/config.json", true), getJSON(ROOT + "lexicon/data/concepts.json", true), getJSON("data/guidelines.json", true)]);
    C = { config, taxonomy, collections, contributions: pub.contributions || [], relations: rel.relations || [], status, index, archiveConfig, lexicon, guidelines };
  }
  PREVIEW = !!(window.COMMONS_PREVIEW || (C.config && C.config.preview));
  prepare();
}
function prepare() {
  const t = C.taxonomy;
  X.type = Object.fromEntries(t.types.map(x => [x.id, x]));
  X.cat = Object.fromEntries(t.categories.map(x => [x.id, x]));
  X.life = Object.fromEntries(t.lifecycle.map(x => [x.id, x]));
  X.pstat = Object.fromEntries(t.publicStatuses.map(x => [x.id, x]));
  X.kind = Object.fromEntries(t.relationKinds.map(x => [x.id, x]));
  X.verif = Object.fromEntries(t.sourceVerification.map(x => [x.id, x]));
  const ix = C.index || { resources: [], edges: [] };
  X.res = Object.fromEntries(ix.resources.map(r => [r.id, r]));
  X.ixEdges = ix.edges || [];
  X.coll = Object.fromEntries((C.collections.collections || []).map(x => [x.id, x]));
  X.lex = (C.lexicon && C.lexicon.items) || [];
  X.lexById = Object.fromEntries(X.lex.map(x => [x.id, x]));
}
/* what is public right now: the approved records, plus (private preview only, and only when switched on) the fictional demonstration records */
const demoPack = () => (PREVIEW && C.demo) || null;
const allContribs = () => C.contributions.concat(DEMO_ON && demoPack() ? demoPack().records : []);
const allRelations = () => C.relations.concat(DEMO_ON && demoPack() ? demoPack().relations : []);
const shown = () => allContribs().filter(c => c.status !== "withdrawn");
const byId = id => allContribs().find(c => c.id === id) || null;
const isDemo = c => !!(c && c.demo);
const approvedGuidelines = () => (C.config.guidelinesApproved && C.guidelines && !C.guidelines.draft) ? C.guidelines : null;
const guidelinesInUse = () => approvedGuidelines() || (PREVIEW && C.guidelines && C.guidelines.draft ? C.guidelines : null);

/* ============================================================ research records */
const TYPE_LABEL = { concept: "Concept", question: "Open question (Archive)", theory: "Theory", source: "Publication", article: "Published research", museum: "Museum room", comparison: "Comparison", lesson: "Lesson", course: "Course", contribution: "Visitor contribution" };
function ref(x) { return /^(?:COM|DEMO)-\d{4,}$/.test(x) ? "contrib:" + x : x; }
function resolve(id) {
  if (id.startsWith("contrib:")) {
    const c = byId(id.slice(8));
    return c && c.status !== "withdrawn" ? { id, type: "contribution", title: c.title, url: "#c-" + c.id, internal: true, c } : null;
  }
  const r = X.res[id];
  return r ? { id, type: r.type, title: r.title, url: r.url, summary: r.summary, r } : null;
}
const typeLabel = t => TYPE_LABEL[t] || t;
function conceptRef(slug) { return slug.includes(":") ? slug : "concept:" + slug; }

/* The same rule the build script uses (scripts/commons_lib.contribution_edges); a test compares the two. */
const EDGE_PRIORITY = { editorial: 0, "verified-metadata": 1, preliminary: 2, suggested: 3 };
function deriveEdges(contribs, relations) {
  const live = new Set(contribs.filter(c => c.status !== "withdrawn").map(c => c.id)), raw = [];
  for (const c of contribs) {
    if (c.status === "withdrawn") continue;
    const me = "contrib:" + c.id;
    (c.concepts || []).forEach(x => raw.push({ a: me, b: x, why: "Tagged with this concept by the editor.", kind: "editorial" }));
    (c.related || []).forEach(x => raw.push({ a: me, b: ref(x), why: "Listed as related research by the editor.", kind: "editorial" }));
    if (c.respondsTo) raw.push({ a: me, b: ref(c.respondsTo), why: "Written in response to this question.", kind: "editorial" });
  }
  relations.forEach(r => raw.push({ a: r.a, b: r.b, why: r.why, kind: r.kind }));
  const best = new Map();
  for (const e of raw) {
    if ([e.a, e.b].some(x => x.startsWith("contrib:") && !live.has(x.slice(8)))) continue;
    const key = [e.a, e.b].sort().join("\u0000"), cur = best.get(key);
    if (!cur || EDGE_PRIORITY[e.kind] < EDGE_PRIORITY[cur.kind]) best.set(key, { ...e });
    else if (e.kind === cur.kind && !cur.why.includes(e.why)) cur.why = cur.why.replace(/\.+$/, "") + ". " + e.why;
  }
  return [...best.values()].sort((x, y) => x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0);
}
const edgesOfContribution = c => deriveEdges(allContribs(), allRelations()).filter(e => e.a === "contrib:" + c.id || e.b === "contrib:" + c.id);
const kindLabel = k => (X.kind[k] || { label: k }).label;

/* ============================================================ small components */
function voiceTag(kind, demo) {
  if (demo) return h("span", { class: "voice demo" }, "Demonstration (fictional)");
  return kind === "editorial" ? h("span", { class: "voice editorial" }, "Editorial · Artificially Intelligent") : h("span", { class: "voice visitor" }, "Visitor contribution");
}
function statusBadge(c) {
  const s = X.pstat[c.status] || { label: c.status };
  return h("span", { class: "badge " + (c.status === "selected-for-investigation" ? "sel" : c.status === "incorporated" ? "inc" : c.status === "withdrawn" ? "wd" : "") }, s.label);
}
const attribution = c => !c.attribution || c.attribution.mode === "anonymous" ? "Submitted anonymously" : c.attribution.display ? c.attribution.display + " (a name the contributor chose; not verified)" : "Submitted anonymously";
function catName(id) { return id && X.cat[id] ? X.cat[id].label : ""; }
function contribCard(c, opts) {
  opts = opts || {};
  const typ = X.type[c.type] || { label: c.type };
  const ex = c.text ? clip(c.text, opts.long ? 340 : 220) : "";
  return h("article", { class: "card visitor" + (isDemo(c) ? " demo" : ""), "data-id": c.id },
    h("div", { class: "meta" }, h("span", { class: "cid" }, c.id), h("span", null, typ.label), catName(c.category) && h("span", null, catName(c.category)), c.publishedOn && h("span", null, "Approved ", time(c.publishedOn))),
    h(opts.h || "h2", null, h("a", { href: "#c-" + c.id }, c.title)),
    ex && h("p", { class: "ex" }, ex),
    h("div", { class: "meta" }, voiceTag("visitor", isDemo(c)), statusBadge(c), h("span", null, attribution(c))));
}
function crumbs(...items) { return h("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, items.map((x, i) => [i ? " / " : "", x])); }
function empty(...k) { return h("div", { class: "empty" }, ...k); }
function linkBtn(href, text, primary, extra) { return h("a", { class: "btn" + (primary ? " primary" : ""), href: okHref(href) }, text, extra); }

/* ============================================================ submission availability (never claim what does not exist) */
function endpoint(type) {
  if (PREVIEW && C.preview && C.preview.simulate) return { mode: "simulated", url: null };
  const u = C.config.contributionEndpoint;
  if (u && /^https:\/\/[^\s"'<>]+$/.test(u)) return { mode: "contributions", url: u };
  if (type === "question") {
    const a = C.archiveConfig && C.archiveConfig.submitEndpoint;
    if (a && /^https:\/\/[^\s"'<>]+$/.test(a)) return { mode: "legacy", url: a };
  }
  return null;
}
const consentReady = () => !!guidelinesInUse();
const isOpen = type => !!endpoint(type) && consentReady();
function openState() {
  const t = C.taxonomy.types.map(x => x.id), open = t.filter(isOpen);
  return { any: open.length > 0, all: open.length === t.length, open };
}

/* ============================================================ views */
const NAV = [["home", "Commons"], ["contribute", "Contribute"], ["library", "Library"], ["correspondence", "Correspondence"], ["open-inquiries", "Open Inquiries"], ["constellation", "Constellation"], ["collections", "Collections"], ["guidelines", "Guidelines"], ["about", "How it works"]];
const wrapIn = (...k) => h("div", { class: "wrap" }, ...k);
function setNav(r) { $$("#nav a").forEach(a => { if (a.dataset.r === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }); }
function shell() {
  $("#nav").replaceChildren(...NAV.map(([r, t]) => h("a", { href: "#" + r, "data-r": r }, t)));
}

/* ---------- home */
function submissionBanner() {
  const st = openState();
  if (st.all) return h("div", { class: "banner ok", role: "note" }, h("b", null, "Open for contributions"), h("p", null, "Every contribution is read by an editor before anything is published."));
  if (st.any) return h("div", { class: "banner", role: "note" }, h("b", null, "Partly open"), h("p", null, "Some kinds of contribution can be sent now: " + st.open.map(t => X.type[t].plural.toLowerCase()).join(", ") + ". The others are not open yet."));
  return h("div", { class: "banner", role: "note" }, h("b", null, "Contributions are not open yet"),
    h("p", null, "No secure receiving service is connected, so nothing can be sent from this page and nothing is stored. You can look at the forms and prepare a draft. Nothing here was written by visitors yet."));
}
function actionLink(href, label, type) {
  const open = type ? isOpen(type) : true;
  return h("a", { class: "btn" + (label.startsWith("Explore") ? " primary" : ""), href }, label, !open && h("span", { class: "soon" }, "not open yet"));
}
function featuredBlock() {
  const feat = shown().find(c => c.featured);
  if (feat) {
    const eds = edgesOfContribution(feat);
    return h("section", { class: "sec", "aria-labelledby": "feat-h" }, h("h2", { id: "feat-h" }, "Featured Inquiry"),
      h("div", { class: "featured" },
        h("div", { class: "chips" }, voiceTag("visitor", isDemo(feat)), h("span", { class: "badge" }, X.type[feat.type].label), statusBadge(feat)),
        h("h3", null, feat.title),
        feat.editorialContext && h("p", { class: "note", style: "max-width:62ch" }, h("b", null, "Editorial context, " + (feat.editorialContextBy || "Artificially Intelligent") + ". "), clip(feat.editorialContext, 320)),
        h("div", { class: "chips" }, edgeChips(eds, 5, feat.id)),
        h("div", { class: "actions" }, linkBtn("#c-" + feat.id, "Read the whole contribution →", true), feat.type === "question" && linkBtn(inquiryUrl(feat.title), "Investigate This Question →"))));
  }
  const fi = C.config.featuredInquiry || {}, r = fi.id && X.res[fi.id];
  if (!r) return h("section", { class: "sec", "aria-labelledby": "feat-h" }, h("h2", { id: "feat-h" }, "Featured Inquiry"), empty("No inquiry is featured yet."));
  const rel = X.ixEdges.filter(e => (e.a === r.id || e.b === r.id) && e.kind !== "preliminary").map(e => ({ e, o: X.res[e.a === r.id ? e.b : e.a] })).filter(x => x.o && ["article", "source", "theory", "concept"].includes(x.o.type));
  const arts = rel.filter(x => x.o.type === "article"), cons = rel.filter(x => x.o.type === "concept").slice(0, 6), srcs = rel.filter(x => x.o.type === "source").slice(0, 3);
  return h("section", { class: "sec", "aria-labelledby": "feat-h" }, h("h2", { id: "feat-h" }, "Featured Inquiry"),
    h("div", { class: "featured" },
      h("div", { class: "chips" }, voiceTag("editorial"), h("span", { class: "badge" }, "From the Unanswered Archive")),
      h("h3", null, r.title),
      h("p", { class: "note", style: "max-width:62ch" }, "No visitor contribution has been approved yet, so this is not a visitor's question. It is a question posed by Artificially Intelligent and listed in the Unanswered Archive, shown here to illustrate what a featured inquiry will look like."),
      r.summary && h("p", { style: "max-width:62ch;color:var(--silver);margin:0" }, r.summary),
      cons.length > 0 && h("div", null, h("p", { class: "kicker" }, "Related concepts (Research Atlas)"), h("div", { class: "chips", style: "margin-top:6px" }, cons.map(x => h("a", { class: "tag", href: okHref(x.o.url) }, x.o.title)))),
      (arts.length + srcs.length) > 0 && h("div", null, h("p", { class: "kicker" }, "Related research"), h("div", { class: "rel", style: "margin-top:6px" }, arts.concat(srcs).slice(0, 4).map(x => h("a", { class: "r", href: okHref(x.o.url), target: "_blank", rel: "noopener noreferrer" }, h("span", null, x.o.title), h("small", null, typeLabel(x.o.type) + " · " + kindLabel(x.e.kind)))))),
      h("div", { class: "actions" }, ext(r.url, "Read the entry in the Archive →"), linkBtn(inquiryUrl(r.title), "Investigate This Question →"))));
}
function edgeChips(eds, n, selfId, exclude) {
  const seen = new Set(), out = [];
  for (const e of eds) {
    const otherId = e.a === "contrib:" + selfId ? e.b : e.a;
    if (exclude && otherId === exclude) continue;
    const o = resolve(otherId);
    if (!o || seen.has(o.id)) continue;
    seen.add(o.id); out.push(h("a", { class: "tag", href: okHref(o.url), title: kindLabel(e.kind) }, o.title));
    if (out.length >= n) break;
  }
  return out;
}
function home() {
  const n = shown().length, demoN = shown().filter(isDemo).length, real = n - demoN;
  return wrapIn(
    h("section", { class: "hero", "aria-labelledby": "t" },
      h("p", { class: "kicker" }, "Artificially Intelligent · Human × Machine Learning"),
      h("h1", { class: "h-xl", id: "t" }, "The Research Commons"),
      h("p", { class: "lede" }, h("em", null, "An open invitation to question, contribute, and think beyond what is known.")),
      h("div", { class: "intro" },
        h("p", null, "Research develops through questions, disagreement, observation, and the exchange of ideas."),
        h("p", null, "The Research Commons invites visitors to contribute to the intellectual conversations explored throughout Artificially Intelligent."),
        h("p", null, "Whether proposing an unresolved question, recommending a scholarly publication, or offering a perspective worth examining, every contribution begins with curiosity."),
        h("p", null, "Submissions are considered through an editorial process before any material becomes part of the public research archive.")),
      submissionBanner(),
      h("div", { class: "actions", role: "group", "aria-label": "Primary actions" },
        actionLink("#library", "Explore the Commons →"), actionLink("#contribute-question", "Propose a Research Question →", "question"),
        actionLink("#contribute-publication", "Recommend a Publication →", "publication"), actionLink("#contribute-topic", "Suggest a Research Topic →", "topic"),
        actionLink("#guidelines", "Read the Contribution Guidelines →")),
      h("p", { class: "guide" }, "The most important questions are not always the ones we ask alone.")),
    featuredBlock(),
    h("section", { class: "sec", "aria-labelledby": "tiers-h" }, h("h2", { id: "tiers-h" }, "Three different things"),
      h("p", { class: "note" }, "The Commons keeps a visitor's suggestion apart from research this site has chosen to develop, and from research it has published."),
      h("div", { class: "grid2" },
        h("div", { class: "panel tier t1" }, h("h3", null, "Visitor suggestion"), h("p", { class: "note" }, "A question, source, topic or perspective offered by a visitor and approved for display. It is not original research from this site, not peer reviewed, and not evidence."), h("p", null, h("a", { href: "#library" }, "Browse the library"))),
        h("div", { class: "panel tier t2" }, h("h3", null, "Research selected for development"), h("p", { class: "note" }, "A subject an editor chose to study. Being listed as in development does not mean any text exists yet. It is an editorial decision, never automatic."), h("p", null, ext(ROOT + "#stream", "See the Data Stream"))),
        h("div", { class: "panel tier t3" }, h("h3", null, "Completed published research"), h("p", { class: "note" }, "Original articles published by Artificially Intelligent, with sources. A visitor contribution never becomes one automatically."), h("p", null, ext(ROOT + "#library", "Read Published Research"))))),
    h("section", { class: "sec", "aria-labelledby": "state-h" }, h("h2", { id: "state-h" }, "What is in the library"),
      real === 0 && demoN === 0
        ? empty(h("b", null, "Nothing yet. "), "No visitor contribution has been approved, because no submission has ever been received. The Commons is awaiting activation. Nothing has been written to fill the space.")
        : h("p", { class: "note" }, demoN ? `${demoN} fictional demonstration records are switched on in this private preview. They are not real submissions.` : `${real} approved ${real === 1 ? "contribution" : "contributions"}.`),
      h("div", { class: "actions", style: "margin-top:14px" }, linkBtn("#correspondence", "The Correspondence Collection"), linkBtn("#open-inquiries", "Open Inquiries"), linkBtn("#constellation", "The Question Constellation"), linkBtn("#collections", "Collections"))),
    h("section", { class: "sec", "aria-labelledby": "life-h" }, h("h2", { id: "life-h" }, "What happens to a contribution"),
      h("p", { class: "note" }, "Nothing is published automatically. Visitors can see a status only if a status mechanism exists; none does yet, so nobody is shown a status they cannot trust."),
      h("ol", { class: "life", "aria-label": "Contribution lifecycle" }, C.taxonomy.lifecycle.map(s => h("li", { class: s.id === "declined" || s.id === "withdrawn" ? "end" : "" }, h("span", { title: s.meaning }, s.label)))),
      h("p", { class: "note", style: "margin-top:10px" }, h("a", { href: "#about" }, "How the Commons works, and what is and is not connected yet →"))));
}

/* ---------- guidelines */
const GUIDE_OUTLINE = [["welcome", "What kinds of contribution are welcome"], ["evaluation", "How contributions are evaluated"], ["moderation", "How moderation works"], ["after", "What happens after you send something"],
  ["editing", "Whether a contribution may be edited"], ["attribution", "How attribution works"], ["declined", "Why a contribution might be declined"], ["sources", "How recommended sources are checked"],
  ["privacy", "How your privacy is protected"], ["withdrawal", "How to ask for a correction or withdrawal"]];
function guidelines() {
  const G = guidelinesInUse();
  const kids = [h("p", { class: "kicker" }, "Participate"), h("h1", { class: "h-l" }, "Contribution Guidelines")];
  if (!G) {
    kids.push(h("div", { class: "banner" }, h("b", null, "The guidelines are not published yet"),
      h("p", null, "The wording is prepared for the site owner's approval and is not adopted. Until it is, this page does not state any rules, rights or promises, and contributions cannot be sent.")),
      h("section", { class: "sec" }, h("h2", null, "What the guidelines will cover"), h("ul", { class: "prose" }, GUIDE_OUTLINE.map(([, t]) => h("li", null, t)))),
      h("section", { class: "sec" }, h("h2", null, "Standards that already apply"), h("div", { class: "prose" },
        h("p", null, "Everything this site publishes about its own research is held to the standards in the project's methodology. A visitor's contribution is always labelled as a visitor's, never as research from Artificially Intelligent, and never as peer reviewed."))));
    return wrapIn(...kids);
  }
  if (G.draft) kids.push(h("div", { class: "draftbox" }, h("span", { class: "voice demo" }, "Draft for the owner. Not adopted."), h("p", null, "This wording is visible only in this private preview. It is not published, not approved and not a statement of the project's terms.")));
  else kids.push(h("p", { class: "note" }, "Version " + G.version + (G.approvedOn ? ", approved " + fmtDate(G.approvedOn) : "") + "."));
  kids.push(h("nav", { class: "toc", "aria-label": "On this page", style: "position:static;margin:18px 0" }, (G.sections || []).map(s => h("a", { href: "#guidelines-" + s.id }, s.title))));
  (G.sections || []).forEach(s => kids.push(h("section", { class: "sec", id: "guidelines-" + s.id }, h("h2", null, s.title), h("div", { class: "prose" }, (s.body || []).map(p => h("p", null, p))), (s.points || []).length > 0 && h("ul", { class: "prose" }, s.points.map(p => h("li", null, p))))));
  return wrapIn(...kids);
}

/* ---------- library */
const F = { q: "", type: "", cat: "", coll: "" };
function matches(c, toks) {
  if (!toks.length) return true;
  const hay = [c.title, c.text, c.editorialContext, catName(c.category), c.attribution && c.attribution.display, c.source && [c.source.title, (c.source.authors || []).join(" "), c.source.venue].join(" ")].filter(Boolean).join(" ").toLowerCase();
  return toks.every(t => hay.includes(t));
}
function library(preType) {
  if (preType && X.type[preType]) F.type = preType;
  const list = h("div", { class: "list", id: "lib-list" }), count = h("p", { class: "note", role: "status", "aria-live": "polite", id: "lib-count" });
  const q = h("input", { type: "search", id: "lq", value: F.q, autocomplete: "off", placeholder: "Words from a title, text or source" });
  const typ = h("select", { id: "lt" }, h("option", { value: "" }, "All kinds"), C.taxonomy.types.map(t => h("option", { value: t.id }, t.plural)));
  const cat = h("select", { id: "lc" }, h("option", { value: "" }, "All subjects"), C.taxonomy.categories.map(t => h("option", { value: t.id }, t.label)));
  const col = h("select", { id: "ll" }, h("option", { value: "" }, "All collections"), Object.values(X.coll).map(t => h("option", { value: t.id }, t.title)));
  typ.value = F.type; cat.value = F.cat; col.value = F.coll;
  function draw() {
    F.q = q.value; F.type = typ.value; F.cat = cat.value; F.coll = col.value;
    const toks = F.q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = shown().filter(c => (!F.type || c.type === F.type) && (!F.cat || c.category === F.cat) && (!F.coll || (c.collections || []).includes(F.coll)) && matches(c, toks))
      .sort((a, b) => (b.publishedOn || "").localeCompare(a.publishedOn || "") || (a.id < b.id ? -1 : 1));
    list.replaceChildren();
    const total = shown().length;
    if (!total) list.append(empty(h("b", null, "The library is empty. "), "No contribution has been approved yet, because none has been received. When an editor approves one, it appears here with its type, subject and date. Nothing is shown that an editor has not approved."));
    else if (!rows.length) list.append(empty("No approved contribution matches these filters. ", h("button", { class: "btn", type: "button", onclick: () => { q.value = ""; typ.value = ""; cat.value = ""; col.value = ""; draw(); } }, "Clear filters")));
    else rows.forEach(c => list.append(contribCard(c)));
    count.textContent = total ? `${rows.length} of ${total} approved ${total === 1 ? "contribution" : "contributions"}, newest first.` : "";
  }
  [q, typ, cat, col].forEach(e => e.addEventListener(e === q ? "input" : "change", draw));
  draw();
  return wrapIn(h("p", { class: "kicker" }, "The Public Commons Library"), h("h1", { class: "h-l" }, "Library"),
    h("p", { class: "lede" }, "Approved contributions only. They are listed by date, never by popularity, and each is a visitor's, not the site's."),
    h("div", { class: "tools", role: "search", "aria-label": "Filter the library" },
      h("label", null, "Search", q), h("label", null, "Kind", typ), h("label", null, "Subject", cat), h("label", null, "Collection", col)), count, list);
}

/* ---------- a single contribution */
function sectionBlock(id, title, ...k) { return h("section", { id, "aria-labelledby": id + "-h" }, h("h2", { id: id + "-h" }, title), ...k); }
function relRow(o, e) {
  const inner = [h("span", null, o.title), h("small", null, typeLabel(o.type) + (e ? " · " + kindLabel(e.kind) + (e.why ? ". " + e.why : "") : ""))];
  return o.internal ? h("a", { class: "r", href: o.url }, inner) : h("a", { class: "r", href: okHref(o.url), target: "_blank", rel: "noopener noreferrer" }, inner);
}
function detail(id) {
  const c = byId(id);
  if (!c) return wrapIn(crumbs(h("a", { href: "#library" }, "Library"), "Not found"), h("h1", { class: "h-l" }, "No such contribution"), empty("There is no approved contribution with the identifier ", h("code", { class: "rc" }, id), ". It may never have existed, or it may not be public."));
  if (c.status === "withdrawn") {
    return wrapIn(crumbs(h("a", { href: "#library" }, "Library"), c.id), h("p", { class: "kicker" }, c.id + " · " + (X.type[c.type] ? X.type[c.type].label : "")), h("h1", { class: "h-l" }, "Withdrawn"),
      h("div", { class: "panel", style: "max-width:60ch;margin-top:16px" }, h("p", null, (c.withdrawal && c.withdrawal.publicNote) || "This contribution has been withdrawn."), h("p", { class: "note" }, "Withdrawn " + fmtDate(c.withdrawal && c.withdrawal.on) + ". Its text is no longer shown.")));
  }
  const typ = X.type[c.type] || { label: c.type }, eds = edgesOfContribution(c);
  const other = e => resolve(e.a === "contrib:" + c.id ? e.b : e.a);
  const rowsAll = eds.map(e => ({ e, o: other(e) })).filter(x => x.o);
  const concepts = rowsAll.filter(x => x.o.type === "concept"), research = rowsAll.filter(x => x.o.type !== "concept" && x.o.id !== (c.respondsTo ? ref(c.respondsTo) : ""));
  const resp = c.respondsTo ? resolve(ref(c.respondsTo)) : null;
  const noun = { question: "The Question", publication: "The Recommendation", topic: "The Proposal", perspective: "The Perspective" }[c.type] || "The Contribution";
  const toc = [["body", noun]];
  if (c.source) toc.push(["source", "The Source"]);
  if (c.editorialContext) toc.push(["ctx", "Editorial Context"]);
  toc.push(["concepts", "Related Concepts"], ["research", "Related Research"]);
  if ((c.openQuestions || []).length) toc.push(["open", "Open Questions"]);
  toc.push(["status", "Editorial Status"]);
  const lexLinks = concepts.map(x => (X.lexById[x.o.id.replace(/^concept:/, "")] || null)).filter(Boolean);
  const body = h("div", { class: "cbody" },
    h("div", { class: "banner", role: "note", style: "margin:0" }, h("b", null, isDemo(c) ? "Demonstration (fictional)" : "Visitor contribution"), h("p", null, isDemo(c) ? "This record is invented for the private preview. It was not submitted by anyone." : C.taxonomy.voices.visitor)),
    sectionBlock("body", noun, c.type === "question" ? h("p", { class: "note", style: "margin-bottom:8px" }, "Sent by a visitor as a research question, and approved for display. The question is the title of this page.") : null,
      resp && h("p", { class: "note" }, "In response to: ", resp.internal ? h("a", { href: resp.url }, resp.title) : ext(resp.url, resp.title), " (" + typeLabel(resp.type) + ")."),
      h("div", { class: "prose" }, paras(c.text).map(p => h("p", null, p))),
      c.type === "question" && !c.text && h("p", { class: "note" }, "The contributor gave only the question."),
      c.type === "question" && h("div", { class: "actions", style: "margin-top:14px" }, linkBtn(inquiryUrl(c.title), "Investigate This Question →"))),
    c.source && sectionBlock("source", "The Source",
      h("dl", { class: "facts" },
        h("dt", null, "Title"), h("dd", null, c.source.title), c.source.authors && c.source.authors.length > 0 && [h("dt", null, "Authors"), h("dd", null, c.source.authors.join("; "))],
        c.source.venue && [h("dt", null, "Venue"), h("dd", null, c.source.venue)], c.source.year && [h("dt", null, "Year"), h("dd", null, String(c.source.year))],
        c.source.doi && [h("dt", null, "DOI"), h("dd", null, ext("https://doi.org/" + c.source.doi, c.source.doi))],
        c.source.url && [h("dt", null, "Link"), h("dd", null, ext(c.source.url, c.source.url))],
        h("dt", null, "Checked?"), h("dd", null, (X.verif[c.source.verification] || { label: c.source.verification }).label)),
      h("p", { class: "note", style: "margin-top:10px" }, (X.verif[c.source.verification] || {}).meaning, " A recommendation is not a claim that the work is credible, peer reviewed, or supports any theory. The link is the visitor's; open it with care.")),
    c.editorialContext && sectionBlock("ctx", "Editorial Context", h("p", { class: "note", style: "margin-bottom:8px" }, h("span", { class: "voice editorial" }, "Editorial · " + (c.editorialContextBy || "Artificially Intelligent"))), h("div", { class: "prose" }, paras(c.editorialContext).map(p => h("p", null, p)))),
    sectionBlock("concepts", "Related Concepts", concepts.length ? h("div", { class: "rel" }, concepts.map(x => relRow(x.o, x.e))) : h("p", { class: "note" }, "No concept has been linked to this contribution."),
      lexLinks.length > 0 && h("p", { class: "note", style: "margin-top:10px" }, "Lexicon of Intelligence: ", lexLinks.map((l, i) => [i ? ", " : "", ext(ROOT + "lexicon/#c-" + l.id, l.term)]), ". The Lexicon gives one reviewed account of each term; other accounts exist.")),
    sectionBlock("research", "Related Research", research.length ? h("div", { class: "rel" }, research.map(x => relRow(x.o, x.e))) : h("p", { class: "note" }, "No related research has been linked yet."),
      h("p", { class: "note", style: "margin-top:10px" }, "A link means an editor saw a connection, or it is labelled as an automatic suggestion. A link is not evidence that a claim is true.")),
    (c.openQuestions || []).length > 0 && sectionBlock("open", "Open Questions", h("ul", { class: "prose" }, c.openQuestions.map(q => h("li", null, q)))),
    sectionBlock("status", "Editorial Status", h("dl", { class: "facts" },
      h("dt", null, "Status"), h("dd", null, h("b", null, (X.pstat[c.status] || { label: c.status }).label), h("br"), (X.pstat[c.status] || {}).meaning, c.statusNote && h("span", null, " ", c.statusNote)),
      h("dt", null, "Attribution"), h("dd", null, attribution(c)), h("dt", null, "Approved"), h("dd", null, time(c.publishedOn)), c.updatedOn && c.updatedOn !== c.publishedOn && [h("dt", null, "Updated"), h("dd", null, time(c.updatedOn))],
      c.category && [h("dt", null, "Subject"), h("dd", null, catName(c.category))], (c.collections || []).length > 0 && [h("dt", null, "Collections"), h("dd", null, c.collections.map((x, i) => [i ? ", " : "", X.coll[x] ? h("a", { href: "#collection-" + x }, X.coll[x].title) : x]))],
      h("dt", null, "Identifier"), h("dd", null, h("code", { class: "rc" }, c.id), !isDemo(c) && [" ", h("a", { href: okHref("./c/" + c.id + "/") }, "permanent page")])),
      h("p", { class: "note", style: "margin-top:10px" }, "Showing a contribution does not mean Artificially Intelligent has answered it, investigated it, or agrees with it.")));
  return wrapIn(crumbs(h("a", { href: "#library" }, "Library"), c.id), h("p", { class: "kicker" }, (typ.label) + " · " + c.id), h("h1", { class: "h-l", style: "margin-top:6px" }, c.title),
    h("div", { class: "cpage" }, h("nav", { class: "toc", "aria-label": "On this page" }, toc.map(([i, t]) => h("a", { href: "#c-" + c.id, onclick: ev => { ev.preventDefault(); const t2 = document.getElementById(i + "-h"); if (t2) { t2.scrollIntoView({ behavior: "smooth", block: "start" }); t2.setAttribute("tabindex", "-1"); t2.focus({ preventScroll: true }); } } }, t))), body));
}

/* ---------- correspondence */
function qOf(c) {  // the question a perspective responds to, from the Commons or the Unanswered Archive
  if (!c.respondsTo) return null;
  const r = resolve(ref(c.respondsTo));
  if (!r) return null;
  if (r.type === "contribution") return { title: r.c.title, url: r.url, internal: true, who: "A visitor's question", sub: r.c.text };
  return { title: r.title, url: r.url, internal: false, who: "A question in the Unanswered Archive, posed by Artificially Intelligent", sub: r.summary };
}
function letter(c, lvl) {
  const q = qOf(c), eds = edgesOfContribution(c);
  return h("article", { class: "letter" + (isDemo(c) ? " demo" : ""), "aria-label": c.title },
    h("div", { class: "meta" }, h("span", { class: "cid" }, c.id), voiceTag("visitor", isDemo(c)), h("span", null, attribution(c)), c.publishedOn && h("span", null, time(c.publishedOn))),
    q && h("div", { class: "seg q" }, h("span", { class: "lab" }, "Question"), h("p", { class: "qt", style: "margin:0" }, q.title), h("p", { class: "note" }, q.who + ". ", q.internal ? h("a", { href: q.url }, "Open it") : ext(q.url, "Open it in the Archive"), ".")),
    h("div", { class: "seg p" }, h("span", { class: "lab" }, "Submitted Perspective"), h(lvl || "h2", { style: "font-size:1.3rem" }, h("a", { href: "#c-" + c.id, style: "text-decoration:none" }, c.title)), h("p", { class: "pt", style: "margin:0" }, clip(c.text, 520)), h("p", { class: "note" }, "A reasoned view from a visitor. It is an argument, not a finding.")),
    c.editorialContext && h("div", { class: "seg e" }, h("span", { class: "lab" }, "Editorial Context · " + (c.editorialContextBy || "Artificially Intelligent")), h("p", { class: "note", style: "max-width:66ch" }, clip(c.editorialContext, 420))),
    h("div", { class: "seg" }, h("span", { class: "lab" }, "Continue Exploring"), h("div", { class: "chips" }, linkBtn("#c-" + c.id, "Read in full →"), edgeChips(eds, 4, c.id, c.respondsTo ? ref(c.respondsTo) : null))));
}
function correspondence() {
  const ps = shown().filter(c => c.type === "perspective").sort((a, b) => (b.publishedOn || "").localeCompare(a.publishedOn || ""));
  const answered = ps.filter(c => c.respondsTo), free = ps.filter(c => !c.respondsTo);
  return wrapIn(h("p", { class: "kicker" }, "A curated archive of approved perspectives"), h("h1", { class: "h-l" }, "The Correspondence Collection"),
    h("p", { class: "lede" }, "Approved visitor perspectives, set beside the questions they respond to and the context an editor adds. Contemporary submissions, not historical letters."),
    h("p", { class: "note", style: "margin-top:10px" }, "Every entry here is a real, approved submission. No exchange has been written to fill the collection, and no real person's words are invented."),
    !ps.length ? h("div", { class: "list" }, empty(h("b", null, "No correspondence yet. "), "A perspective appears here only after a visitor sends one and an editor approves it. None has been received. The collection is awaiting its first approved perspective.")) :
      h("div", { class: "list" }, answered.map(c => letter(c, "h2")), free.length > 0 && [h("h2", { style: "margin-top:26px;font-size:1.3rem" }, "Perspectives not tied to a single question"), free.map(c => letter(c, "h3"))]));
}

/* ---------- open inquiries */
function openInquiries() {
  const sel = shown().filter(c => c.type === "question" && (c.status === "selected-for-investigation" || c.status === "incorporated")).sort((a, b) => (b.publishedOn || "").localeCompare(a.publishedOn || ""));
  const starters = Object.values(X.res).filter(r => r.type === "question" && /review/i.test(r.reviewStatus || "") && !/awaiting/i.test(r.reviewStatus || "")).slice(0, 5);
  return wrapIn(h("p", { class: "kicker" }, "Selected from public participation"), h("h1", { class: "h-l" }, "Open Inquiries"),
    h("p", { class: "lede" }, "Questions chosen from visitor contributions because they merit further investigation. This is different from the Unanswered Archive, which documents the scholarly status of research questions."),
    h("p", { class: "note", style: "margin-top:10px" }, "Being listed here does not mean a question has had a full literature review, and it does not mean it has been answered."),
    h("section", { class: "sec", "aria-labelledby": "oi1" }, h("h2", { id: "oi1" }, "Selected from visitor contributions"),
      sel.length ? h("div", { class: "list" }, sel.map(c => h("article", { class: "card visitor" + (isDemo(c) ? " demo" : "") },
        h("div", { class: "meta" }, h("span", { class: "cid" }, c.id), catName(c.category) && h("span", null, catName(c.category)), voiceTag("visitor", isDemo(c)), statusBadge(c)),
        h("h3", null, h("a", { href: "#c-" + c.id }, c.title)), c.editorialContext && h("p", { class: "ex" }, clip(c.editorialContext, 260)),
        h("div", { class: "chips" }, linkBtn("#c-" + c.id, "Open →"), linkBtn(inquiryUrl(c.title), "Investigate This Question →"))))) :
        empty(h("b", null, "None yet. "), "An editor has not selected any visitor question for further investigation, because none has been received. Nothing is shown as selected that was not.")),
    h("section", { class: "sec", "aria-labelledby": "oi2" }, h("h2", { id: "oi2" }, "Starting points while the Commons awaits its first selections"),
      h("p", { class: "note" }, "These are not visitor questions. They are questions posed by Artificially Intelligent, already in the Unanswered Archive and already investigated in the Inquiry Engine."),
      starters.length ? h("div", { class: "list" }, starters.map(r => h("article", { class: "card editorial" }, h("div", { class: "meta" }, voiceTag("editorial"), h("span", null, "Unanswered Archive")),
        h("h3", null, ext(r.url, r.title)), r.summary && h("p", { class: "ex" }, clip(r.summary, 220)), h("div", { class: "chips" }, ext(r.url, "Open the entry →"), linkBtn(inquiryUrl(r.title), "Investigate This Question →"))))) : empty("The Unanswered Archive could not be read just now.")));
}

/* ---------- collections */
function collections() {
  const cols = Object.values(X.coll);
  return wrapIn(h("p", { class: "kicker" }, "Curated by editors"), h("h1", { class: "h-l" }, "Collections"),
    h("p", { class: "lede" }, "A collection is filled only with approved contributions. A collection with no members is shown as planned, not as if it had activity."),
    h("div", { class: "list" }, cols.map(k => {
      const m = shown().filter(c => (c.collections || []).includes(k.id));
      return h("article", { class: "card" }, h("div", { class: "meta" }, h("span", { class: "badge" }, m.length ? "Active" : "Planned"), h("span", null, m.length + (m.length === 1 ? " approved contribution" : " approved contributions"))),
        h("h2", null, m.length ? h("a", { href: "#collection-" + k.id }, k.title) : k.title), h("p", { class: "ex" }, k.description), !m.length && h("p", { class: "note" }, "No approved contribution belongs to this collection yet."));
    })));
}
function collectionPage(id) {
  const k = X.coll[id];
  if (!k) return wrapIn(crumbs(h("a", { href: "#collections" }, "Collections"), "Not found"), h("h1", { class: "h-l" }, "No such collection"));
  const m = shown().filter(c => (c.collections || []).includes(id));
  return wrapIn(crumbs(h("a", { href: "#collections" }, "Collections"), k.title), h("h1", { class: "h-l" }, k.title), h("p", { class: "lede" }, k.description),
    h("div", { class: "list" }, m.length ? m.map(c => contribCard(c)) : empty("No approved contribution belongs to this collection yet.")));
}

/* ---------- constellation */
let CN = { scope: "commons", type: "", q: "", ctl: null, selected: null, listOnly: null };
function constellationData() {
  const contribs = shown(), edges = deriveEdges(allContribs(), allRelations()), nodes = new Map();
  const add = (id) => { if (nodes.has(id)) return nodes.get(id); const r = resolve(id); if (!r) return null; const n = { id, type: r.type, typeLabel: typeLabel(r.type), label: r.title, url: r.url, internal: !!r.internal, summary: r.summary, demo: !!(r.c && r.c.demo) }; nodes.set(id, n); return n; };
  contribs.forEach(c => add("contrib:" + c.id));
  const outE = [];
  edges.forEach(e => { if (add(e.a) && add(e.b)) outE.push({ a: e.a, b: e.b, kind: e.kind, why: e.why }); });
  if (CN.scope === "all") {
    const qs = Object.values(X.res).filter(r => r.type === "question");
    qs.forEach(r => add(r.id));
    X.ixEdges.forEach(e => {
      const A = X.res[e.a], B = X.res[e.b];
      if (!A || !B) return;
      const keep = (A.type === "question" || B.type === "question") && ["question", "concept", "article"].includes(A.type) && ["question", "concept", "article"].includes(B.type);
      if (keep && add(e.a) && add(e.b)) outE.push({ a: e.a, b: e.b, kind: e.kind, why: e.why });
    });
  }
  return { nodes: [...nodes.values()], edges: outE };
}
function constellation() {
  const D = constellationData(), host = h("div", { class: "cn-map" }), side = h("div", { class: "cn-side", id: "cn-side", tabindex: "-1" }), listEl = h("div", { class: "cn-list", id: "cn-list" });
  const q = h("input", { type: "search", id: "cq", value: CN.q, autocomplete: "off", placeholder: "Search titles" });
  const typ = h("select", { id: "ct" }, h("option", { value: "" }, "All kinds of record"), [["contribution", "Visitor contributions"], ["question", "Archive questions"], ["concept", "Concepts"], ["article", "Published research"], ["source", "Publications"], ["theory", "Theories"]].map(([v, t]) => h("option", { value: v }, t)));
  typ.value = CN.type;
  const scope = h("select", { id: "cs" }, h("option", { value: "commons" }, "Commons contributions and what they link to"), h("option", { value: "all" }, "Also all Unanswered Archive questions"));
  scope.value = CN.scope;
  const nCon = D.nodes.filter(n => n.type === "contribution").length;
  const info = h("p", { class: "note", role: "status", "aria-live": "polite" });
  const legend = h("div", { class: "cn-leg", "aria-label": "Key" },
    [["editorial", "Editorial link: an editor connected them"], ["suggested", "Automatic suggestion: not reviewed"], ["preliminary", "Preliminary: from titles and metadata"], ["verified-metadata", "Verified metadata"]].map(([k, t]) => h("span", null, (() => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 34 10"); s.setAttribute("aria-hidden", "true"); const l = document.createElementNS("http://www.w3.org/2000/svg", "line"); l.setAttribute("x1", 1); l.setAttribute("x2", 33); l.setAttribute("y1", 5); l.setAttribute("y2", 5); l.setAttribute("class", "e " + k); s.append(l); return s; })(), t)),
    h("span", null, "Shapes: ◆ visitor contribution · ● archive question · ■ concept · ⬢ other research"));
  let ctl = null;
  function visibleIds() {
    const toks = CN.q.toLowerCase().split(/\s+/).filter(Boolean);
    const ids = new Set(D.nodes.filter(n => (!CN.type || n.type === CN.type)).map(n => n.id));
    const hit = toks.length ? new Set(D.nodes.filter(n => ids.has(n.id) && toks.every(t => n.label.toLowerCase().includes(t))).map(n => n.id)) : null;
    return { ids, hit };
  }
  function renderList(sel) {
    const { ids, hit } = visibleIds();
    const rows = D.nodes.filter(n => ids.has(n.id) && (!hit || hit.has(n.id))).sort((a, b) => a.type === b.type ? (a.label < b.label ? -1 : 1) : (a.type === "contribution" ? -1 : b.type === "contribution" ? 1 : a.type < b.type ? -1 : 1));
    listEl.replaceChildren(...(rows.length ? rows.map(n => { const deg = D.edges.filter(e => e.a === n.id || e.b === n.id).length; return h("button", { class: "r", type: "button", "aria-current": sel === n.id ? "true" : "false", onclick: () => { ctl ? ctl.select(sel === n.id ? null : n.id, true) : pick(n.id); } }, h("span", null, n.label), h("small", null, n.typeLabel + " · " + deg + (deg === 1 ? " connection" : " connections"))); }) : [empty("Nothing matches. Clear the search or choose another kind.")]));
    info.textContent = `${rows.length} of ${D.nodes.length} records shown. ${D.edges.length} ${D.edges.length === 1 ? "link" : "links"}, each labelled by how it was made.`;
  }
  function pick(id) {
    CN.selected = id;
    const n = D.nodes.find(x => x.id === id);
    if (!n) { side.replaceChildren(h("div", { class: "panel" }, h("h2", null, "Select a record"), h("p", { class: "note" }, "Choose a node on the map or a record in the list to see what it connects to and why. The picture shows links an editor made or that are labelled automatic; it does not show how important or how true anything is."))); renderList(null); return; }
    const es = D.edges.filter(e => e.a === id || e.b === id);
    say(n.label + ", " + n.typeLabel + ", " + es.length + (es.length === 1 ? " connection." : " connections."));
    side.replaceChildren(h("div", { class: "panel" },
      h("p", { class: "kicker" }, n.typeLabel), h("h2", null, n.label), n.demo && h("p", null, voiceTag("visitor", true)),
      n.type === "contribution" ? h("p", { class: "note" }, C.taxonomy.voices.visitor) : n.type === "question" ? h("p", { class: "note" }, "A question in the Unanswered Archive, posed by Artificially Intelligent.") : null,
      n.summary && h("p", { class: "note" }, clip(n.summary, 220)),
      h("div", { class: "actions", style: "margin-top:10px" }, n.internal ? linkBtn(n.url, "Open this contribution →") : ext(n.url, "Open this record →"), (n.type === "question" || n.type === "contribution") && linkBtn(inquiryUrl(n.label), "Investigate This Question →"))),
      h("div", { class: "panel" }, h("h2", { style: "font-size:1.25rem" }, es.length + (es.length === 1 ? " connection" : " connections")),
        es.length ? h("ul", { style: "list-style:none;margin:10px 0 0;padding:0;display:grid;gap:10px" }, es.map(e => { const oid = e.a === id ? e.b : e.a, o = D.nodes.find(x => x.id === oid); return h("li", null, h("button", { class: "tag", type: "button", style: "cursor:pointer;margin-bottom:4px", onclick: () => ctl ? ctl.select(oid, true) : pick(oid) }, o ? o.label : oid), h("br"), h("small", { class: "note" }, h("b", null, kindLabel(e.kind) + ". "), e.why)); })) : h("p", { class: "note" }, "Nothing links to this record yet.")));
    renderList(id);
  }
  function build() {
    if (!D.nodes.length) { host.replaceChildren(); ctl = null; return; }
    ctl = window.Constellation.mount(host, { nodes: D.nodes, edges: D.edges, kindLabel, nodeLabel: n => n.label, onSelect: (id) => pick(id) });
    const z = h("div", { class: "cn-zoom", role: "group", "aria-label": "Map zoom" }, h("button", { class: "btn", type: "button", "aria-label": "Zoom in", onclick: () => ctl.zoomIn() }, "+"), h("button", { class: "btn", type: "button", "aria-label": "Zoom out", onclick: () => ctl.zoomOut() }, "−"), h("button", { class: "btn", type: "button", "aria-label": "Reset the view", onclick: () => ctl.reset() }, "⟲"));
    host.append(z);
    apply();
  }
  function apply() {
    CN.q = q.value; CN.type = typ.value;
    const { ids, hit } = visibleIds();
    if (ctl) { ctl.show(ids); ctl.mark(hit); }
    renderList(ctl ? ctl.selected : CN.selected);
  }
  q.addEventListener("input", apply); typ.addEventListener("change", apply);
  scope.addEventListener("change", () => { CN.scope = scope.value; CN.selected = null; renderView(); });
  const phone = matchMedia("(max-width: 720px)").matches;
  const toggle = h("button", { class: "btn", type: "button", "aria-pressed": String(CN.listOnly || (phone && CN.listOnly !== false)), onclick: ev => { CN.listOnly = ev.currentTarget.getAttribute("aria-pressed") !== "true"; ev.currentTarget.setAttribute("aria-pressed", String(CN.listOnly)); ev.currentTarget.textContent = CN.listOnly ? "Show the map" : "Show the list only"; $(".cn").classList.toggle("listonly", CN.listOnly); } }, "");
  const startList = CN.listOnly || (phone && CN.listOnly !== false);
  toggle.textContent = startList ? "Show the map" : "Show the list only"; toggle.setAttribute("aria-pressed", String(startList));
  const view = wrapIn(h("p", { class: "kicker" }, "How approved contributions relate to existing research"), h("h1", { class: "h-l" }, "The Question Constellation"),
    h("p", { class: "lede" }, "A map of approved contributions and the records of this site they connect to. Each line says how it was made. The list below the map holds the same records and is the way to explore without the map."),
    nCon === 0 && h("div", { class: "banner", style: "margin-top:14px" }, h("b", null, "No visitor contribution has been approved yet"), h("p", null, D.nodes.length ? "So there are no visitor nodes. The map shows the Archive's questions and what they link to, which are this site's own records." : "So there is nothing to draw. Nothing is invented to fill the map. You can switch to see the Unanswered Archive's own questions.")),
    h("div", { class: "cn-tools" }, h("label", null, "Search", q), h("label", null, "Show", typ), h("label", null, "Scope", scope), h("div", null, toggle)),
    info, legend,
    h("div", { class: "cn" + (startList ? " listonly" : ""), style: "margin-top:12px" }, h("div", { class: "cn-map-wrap", style: "min-width:0" }, host), h("div", { class: "cn-side-wrap", style: "min-width:0;display:grid;gap:14px;align-content:start" }, side, h("div", null, h("h2", { style: "font-size:1.2rem" }, "All records in this view"), listEl))));
  if (CN.scope === "commons" && !D.nodes.length) {
    host.replaceChildren(); side.replaceChildren(h("div", { class: "panel" }, h("h2", null, "Nothing to draw yet"), h("p", { class: "note" }, "The Commons has no approved contribution, so it has no connections. The research it will connect to is the Unanswered Archive's questions and the concepts they use."),
      h("p", null, h("button", { class: "btn", type: "button", onclick: () => { CN.scope = "all"; renderView(); } }, "Show the Archive's questions"))));
    listEl.replaceChildren(); info.textContent = "0 records."; setTimeout(() => $(".cn") && $(".cn").classList.add("nomap"), 0);
  } else { build(); pick(null); }
  window.__constellation = { get ctl() { return ctl; }, data: D };
  return view;
}

/* ---------- contribute (the portal) */
const FIELDS = {
  question: [
    { name: "question", label: "Your research question", kind: "textarea", rows: 3, min: 15, max: 400, req: true, help: "One question, specific enough to investigate. Write it in words and leave out links and personal details." },
    { name: "category", kind: "category" },
    { name: "explanation", label: "Why does it matter? (optional)", kind: "textarea", rows: 4, min: 0, max: 1000, help: "A short explanation can help an editor understand the question. No links." }],
  publication: [
    { name: "title", label: "Title of the publication", kind: "text", min: 5, max: 300, req: true },
    { name: "authors", label: "Author or authors, if you know", kind: "text", min: 0, max: 300 },
    { name: "venue", label: "Journal, publisher or place it appeared (optional)", kind: "text", min: 0, max: 200 },
    { name: "year", label: "Year (optional)", kind: "year" },
    { name: "doi", label: "DOI (optional)", kind: "text", help: "For example 10.1000/xyz123. A DOI or a link helps an editor find the work." },
    { name: "url", label: "Link to the work (optional)", kind: "text", help: "A public https link. It is shown only after an editor has looked at it." },
    { name: "category", kind: "category" },
    { name: "why", label: "Why does it matter to this research?", kind: "textarea", rows: 5, min: 40, max: 1200, req: true, help: "What does it add, and to which question? Recommending a work does not make it credible or peer reviewed, and you are not asked to prove either." }],
  topic: [
    { name: "title", label: "The subject, in a short phrase", kind: "text", min: 8, max: 200, req: true },
    { name: "description", label: "Describe the subject", kind: "textarea", rows: 5, min: 60, max: 2000, req: true, help: "What would exploring it involve?" },
    { name: "why", label: "Why might it be worth exploring?", kind: "textarea", rows: 4, min: 40, max: 1200, req: true },
    { name: "category", kind: "category" }],
  perspective: [
    { name: "title", label: "A short title for your perspective", kind: "text", min: 8, max: 300, req: true },
    { name: "relatedQuestion", label: "A question it responds to (optional)", kind: "relq" },
    { name: "text", label: "Your perspective", kind: "textarea", rows: 10, min: 200, max: 4000, req: true, help: "A reasoned view, in your own words. Give your reasons rather than only your conclusion, and say where you may be wrong. It will be shown as a visitor's perspective, not as research." },
    { name: "references", label: "References (optional)", kind: "textarea", rows: 3, min: 0, max: 800, help: "Works you drew on. Up to three links." },
    { name: "category", kind: "category" }],
};
const NO_LINK = new Set(["question", "explanation", "title", "authors", "venue", "why", "description", "text", "relatedQuestion"]);
const LINK_RE = /(?:https?:\/\/|www\.)\S+/i, EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, DOI_RE = /^10\.\d{4,9}\/[^\s"<>]+$/;
const SHORTENERS = ["bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at"];
const norm = (s, multi) => { s = (s || "").normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ""); return multi ? s.split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim() : s.replace(/\s+/g, " ").trim(); };
const MULTI = new Set(["explanation", "why", "description", "text", "references"]);
function safeHttps(u) {
  try { const p = new URL(u); const host = p.hostname.toLowerCase();
    if (p.protocol !== "https:" || !host || p.username || p.password || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /\.(local|internal|localhost)$/.test(host) || SHORTENERS.includes(host) || u.length > 500) return false; return true; } catch (e) { return false; }
}
function validateValues(type, vals, attr) {
  const errs = {}, clean = {};
  for (const f of FIELDS[type]) {
    if (f.kind === "category") { if (vals.category) clean.category = vals.category; continue; }
    if (f.name === "year") { const y = (vals.year || "").trim(); if (y) { if (!/^\d{4}$/.test(y) || +y < 1000 || +y > 2100) errs.year = "Enter a four-digit year."; else clean.year = +y; } continue; }
    if (f.name === "doi") { const d = (vals.doi || "").trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "").replace(/[.,;]+$/, ""); if (d) { if (DOI_RE.test(d)) clean.doi = d.toLowerCase(); else errs.doi = "That does not look like a DOI. It starts with 10. and has a slash."; } continue; }
    if (f.name === "url") { const u = (vals.url || "").trim(); if (u) { if (safeHttps(u)) clean.url = u; else errs.url = "Use a public link that starts with https://. Short links and addresses with numbers are not accepted."; } continue; }
    if (f.kind === "relq") { const v = norm(vals.relatedQuestion || "", false); if (v) { if (v.length > 300) errs.relatedQuestion = "Keep it to 300 characters."; else clean.relatedQuestion = v; } continue; }
    const v = norm(vals[f.name] || "", MULTI.has(f.name));
    if (!v) { if (f.req) errs[f.name] = "This is required."; continue; }
    if (v.length < (f.min || 0)) errs[f.name] = `Please write at least ${f.min} characters (you have ${v.length}).`;
    else if (v.length > f.max) errs[f.name] = `Please keep it to ${f.max} characters or fewer (you have ${v.length}).`;
    else if (NO_LINK.has(f.name) && LINK_RE.test(v)) errs[f.name] = "Please leave links out of this field" + (type === "publication" ? ". There is a field for the link." : type === "perspective" ? ". References has room for links." : ".");
    else if (EMAIL_RE.test(v)) errs[f.name] = "Please do not include email addresses.";
    else if (["question", "title", "text"].includes(f.name) && !/[A-Za-zÀ-ɏ]/.test(v)) errs[f.name] = "Please write in words.";
    else clean[f.name] = v;
  }
  if (type === "perspective" && clean.references && (clean.references.match(new RegExp(LINK_RE.source, "gi")) || []).length > 3) errs.references = "Please include at most three links.";
  if (attr.mode === "display-name") { const nm = norm(attr.name || "", false); if (nm.length < 2 || nm.length > 40 || LINK_RE.test(nm) || EMAIL_RE.test(nm)) errs.attribution = "A display name needs 2 to 40 characters, with no links or email address."; else clean.__name = nm; }
  return { errs, clean };
}
function buildPayload(ep, type, clean, attr, t0) {
  const elapsed = Math.max(0, Date.now() - t0);
  if (ep.mode === "legacy") return { question: clean.question, category: clean.category || null, consent: true, hp: "", elapsedMs: elapsed };   // exactly the Unanswered Archive's request
  const body = { type };
  for (const k of Object.keys(clean)) if (k !== "__name") body[k] = clean[k];
  body.attribution = attr.mode === "display-name" ? { mode: "display-name", name: clean.__name } : { mode: "anonymous" };
  body.consent = true; const G = guidelinesInUse(); if (G && G.version) body.consentVersion = G.version;
  body.hp = ""; body.elapsedMs = elapsed; body.origin = "research-commons";
  return body;
}
async function send(ep, payload) {
  if (ep.mode === "simulated") return simulate(payload);
  const r = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", referrerPolicy: "no-referrer", mode: "cors", body: JSON.stringify(payload) });
  let body = null; try { body = await r.json(); } catch (e) { /* not JSON */ }
  const confirmed = ep.mode === "legacy" ? r.ok : !!(r.ok && body && body.ok === true);
  return { status: r.status, ok: confirmed, answeredButUnconfirmed: r.ok && !confirmed, body, retryAfter: r.headers.get("Retry-After") };
}
function simulate(payload) {            // private preview only: nothing is sent or stored
  const mode = (C.preview && C.preview.outcome) || "accept";
  return new Promise((res, rej) => setTimeout(() => {
    if (mode === "offline") return rej(new Error("offline"));
    if (mode === "429") return res({ status: 429, ok: false, body: { ok: false, error: { code: "rate-limited", message: "Too many submissions just now." } }, retryAfter: "1800", simulated: true });
    if (mode === "503") return res({ status: 503, ok: false, body: null, simulated: true });
    if (mode === "422") return res({ status: 422, ok: false, body: { ok: false, error: { code: "invalid-field", message: "Some fields need attention.", fields: { [Object.keys(payload).find(k => !["type", "consent", "consentVersion", "attribution", "hp", "elapsedMs", "origin", "category"].includes(k)) || "type"]: "rejected by the simulated service" } } }, simulated: true });
    res({ status: 202, ok: true, body: { ok: true, receipt: "rcpt_preview_" + Math.random().toString(16).slice(2, 14) }, simulated: true });
  }, 450));
}
function contribute(type) {
  const wrap = wrapIn(h("p", { class: "kicker" }, "The Contribution Portal"), h("h1", { class: "h-l" }, "What would you like to contribute?"),
    h("p", { class: "lede" }, "Choose a kind of contribution. Every one is read by an editor before anything is published, and publication is never guaranteed."), submissionBanner());
  const chooser = h("div", { class: "chooser", role: "group", "aria-label": "Kind of contribution" }, C.taxonomy.types.map(t => h("button", { type: "button", "aria-pressed": String(type === t.id), onclick: () => { location.hash = "#contribute-" + t.id; } }, h("b", null, t.label), h("span", null, t.purpose))));
  wrap.append(chooser);
  const area = h("div", { id: "form-area" });
  wrap.append(area);
  if (type && X.type[type]) area.append(contribForm(type)); else area.append(h("p", { class: "note", style: "margin-top:14px" }, "Choose one of the four to see its form."));
  return wrap;
}
function contribForm(type) {
  const T = X.type[type], ep = endpoint(type), G = guidelinesInUse(), live = !!ep && !!G, legacy = !!ep && ep.mode === "legacy", t0 = Date.now();
  const fields = FIELDS[type].filter(f => !(legacy && f.name === "explanation"));
  const els = {}, errEls = {}, wrapEls = {};
  const msg = h("div", { id: "form-msg", role: "status", "aria-live": "polite", tabindex: "-1" });
  const sum = h("div", { id: "errsum", tabindex: "-1" });
  const assist = h("div", { class: "assist", id: "assist" });
  function field(f) {
    const id = "f-" + f.name, eid = id + "-err", hid = id + "-help";
    let ctl;
    if (f.kind === "textarea") { ctl = h("textarea", { id, name: f.name, rows: String(f.rows || 4), "aria-describedby": [f.help ? hid : null, eid, id + "-n"].filter(Boolean).join(" "), "aria-required": f.req ? "true" : null }); }
    else if (f.kind === "category") {
      const cats = C.taxonomy.categories.filter(c => !(legacy && c.id === "human-machine"));
      ctl = h("select", { id, name: "category", "aria-describedby": eid }, h("option", { value: "" }, "Not sure"), cats.map(c => h("option", { value: c.id }, c.label)));
    } else if (f.kind === "relq") {
      const qs = Object.values(X.res).filter(r => r.type === "question").sort((a, b) => a.id < b.id ? -1 : 1);
      ctl = h("select", { id, name: "relatedQuestion", "aria-describedby": eid }, h("option", { value: "" }, "None, or another question"), qs.map(r => h("option", { value: r.id.replace(/^q:/, "") + ": " + r.title }, r.id.replace(/^q:/, "") + ": " + clip(r.title, 90))));
    } else if (f.kind === "year") ctl = h("input", { id, name: "year", type: "text", inputmode: "numeric", maxlength: "4", autocomplete: "off", "aria-describedby": eid });
    else ctl = h("input", { id, name: f.name, type: "text", autocomplete: "off", "aria-describedby": [f.help ? hid : null, eid].filter(Boolean).join(" "), "aria-required": f.req ? "true" : null });
    els[f.name] = ctl; const e = h("p", { class: "err", id: eid }); errEls[f.name] = e;
    const label = f.kind === "category" ? "Subject (optional)" : f.kind === "relq" ? f.label : f.label;
    const cnt = f.kind === "textarea" ? h("p", { class: "count", id: id + "-n" }, "0 / " + f.max) : null;
    if (cnt) ctl.addEventListener("input", () => { cnt.textContent = norm(ctl.value, MULTI.has(f.name)).length + " / " + f.max; });
    const w = h("div", { class: "fld" }, h("label", { for: id }, label + (f.req ? " " : ""), f.req && h("span", { class: "sr" }, "(required)")), f.help && h("p", { class: "help", id: hid }, f.help), ctl, cnt, e);
    wrapEls[f.name] = w; return w;
  }
  const hp = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", class: "hp" });
  // attribution
  const aAnon = h("input", { type: "radio", name: "attr", id: "a-anon", value: "anonymous", checked: true }), aName = h("input", { type: "radio", name: "attr", id: "a-name", value: "display-name" });
  const nameIn = h("input", { type: "text", id: "a-display", maxlength: "40", autocomplete: "off", disabled: true, "aria-describedby": "a-help a-err" }), aErr = h("p", { class: "err", id: "a-err" });
  [aAnon, aName].forEach(r => r.addEventListener("change", () => { nameIn.disabled = !aName.checked; if (aName.checked) nameIn.focus(); }));
  const attrBlock = legacy ? h("p", { class: "note" }, "This question goes to the Unanswered Archive's question inbox, which carries the question and its subject only, so it is anonymous.") :
    h("fieldset", { class: "fld" }, h("legend", null, "How should you be credited, if this is published?"),
      h("div", { class: "opt" }, aAnon, h("label", { for: "a-anon" }, "Anonymously. No name is shown.")),
      h("div", { class: "opt" }, aName, h("label", { for: "a-name" }, "With a name I choose.")),
      h("div", { class: "fld", style: "margin-left:30px" }, h("label", { for: "a-display" }, "Name to show"), nameIn),
      h("p", { class: "help", id: "a-help" }, "A name you choose is shown publicly next to your contribution if it is published. It does not need to be your real name, and it is not verified. Do not use an email address."), aErr);
  // consent
  const consent = h("input", { type: "checkbox", id: "consent", "aria-describedby": "consent-err" }), cErr = h("p", { class: "err", id: "consent-err" });
  const cText = G && G.consent ? (G.consent[type] || G.consent.common) : null;
  const consentBlock = G ? h("div", { class: "fld" },
      G.draft && h("div", { class: "draftbox" }, h("span", { class: "voice demo" }, "Draft wording for the owner. Not adopted."), G.stored && h("div", null, h("b", null, "What would be stored"), h("ul", null, G.stored.map(s => h("li", null, s)))), G.rights && h("div", null, h("b", null, "How a contribution may be used"), h("ul", null, G.rights.map(s => h("li", null, s))))),
      !G.draft && G.stored && h("div", { class: "panel" }, h("h3", { style: "font-size:1.1rem" }, "What is stored"), h("ul", { style: "margin:6px 0 0;padding-left:20px" }, G.stored.map(s => h("li", null, s))), G.rights && h("h3", { style: "font-size:1.1rem;margin-top:12px" }, "How a contribution may be used"), G.rights && h("ul", { style: "margin:6px 0 0;padding-left:20px" }, G.rights.map(s => h("li", null, s)))),
      h("div", { class: "opt" }, consent, h("label", { for: "consent" }, cText || "I have read the guidelines.")), cErr) :
    h("div", { class: "banner" }, h("b", null, "The consent and rights wording is not approved yet"), h("p", null, "How a contribution is stored, edited, credited and used must be stated before anything can be sent, and that wording is waiting for the site owner's approval. Until then this form cannot be sent."));
  const send_ = h("button", { class: "btn primary", type: "submit", disabled: !live }, live ? (ep.mode === "simulated" ? "Send for review (simulated)" : "Send for review") : "Sending is not connected yet");
  const copy = h("button", { class: "btn", type: "button" }, "Copy my draft");
  copy.addEventListener("click", async () => {
    const txt = FIELDS[type].filter(f => f.kind !== "category" || els.category).map(f => { const el = els[f.name]; if (!el || !el.value.trim()) return ""; const lab = f.kind === "category" ? "Subject" : f.label.replace(/ \(optional\)$/, ""); return lab + ":\n" + el.value.trim(); }).filter(Boolean).join("\n\n");
    if (!txt) { msg.replaceChildren(h("p", { class: "note" }, "There is nothing to copy yet.")); return; }
    try { await navigator.clipboard.writeText(txt); msg.replaceChildren(h("p", { class: "note" }, "Copied. Nothing was sent and nothing was stored.")); } catch (e) { msg.replaceChildren(h("p", { class: "note" }, "Could not copy automatically. Select the text in the fields and copy it yourself.")); }
  });
  const form = h("form", { class: "pf" + (live ? "" : " off"), novalidate: true, "aria-labelledby": "form-h" },
    h("h2", { id: "form-h", style: "font-size:1.6rem" }, T.label),
    h("p", { class: "note" }, T.purpose),
    !live && h("div", { class: "banner" }, h("b", null, "This form is a preview: sending is not connected"), h("p", null, ep ? "The submission service is configured, but the consent and rights wording is not approved yet." : "No secure receiving service exists yet. You can write and copy a draft. Nothing you type is sent or stored by this page.")),
    legacy && h("p", { class: "note" }, "Research questions share the Unanswered Archive's question inbox, so there is one place where questions are reviewed."),
    sum, ...fields.map(field), assist, attrBlock, hp, consentBlock, msg, h("div", { class: "chips" }, send_, copy),
    h("p", { class: "note" }, "Please do not include personal information about yourself or anyone else. Contributions are read by a person, and may be edited for clarity, declined, or never published."));
  // Words from the Lexicon, similar questions and automatic concept suggestions while you write
  let tm = null;
  const assistInputs = () => { const v = ["question", "title", "text", "description", "why", "explanation"].map(k => els[k] ? els[k].value : "").join(" "); return { all: v, head: (els.question || els.title || { value: "" }).value }; };
  function runAssist() {
    const { all, head } = assistInputs(), low = all.toLowerCase();
    if (all.trim().length < 12) { assist.replaceChildren(); return; }
    const out = [];
    const terms = X.lex.filter(l => [l.term, ...(l.alt || []).map(a => a.replace(/\s*\(.*\)$/, "")), l.abbr].filter(Boolean).some(n => new RegExp("\\b" + n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(low))).slice(0, 6);
    if (terms.length) out.push(h("div", null, h("b", null, "Terms in your text that the Lexicon defines. "), "The Lexicon gives one reviewed account of each; other accounts exist.", h("ul", null, terms.map(l => h("li", null, ext(ROOT + "lexicon/#c-" + l.id, l.term), l.intro ? " — " + clip(l.intro, 90) : "")))));
    const tok = s => new Set((s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2));
    const th = tok(head);
    if (th.size >= 3) {
      const pool = Object.values(X.res).filter(r => r.type === "question").map(r => ({ t: r.title, url: r.url, internal: false })).concat(shown().filter(c => c.type === "question").map(c => ({ t: c.title, url: "#c-" + c.id, internal: true })));
      const sims = pool.map(p => { const tp = tok(p.t); let i = 0; th.forEach(w => { if (tp.has(w)) i++; }); return { p, s: i / (th.size + tp.size - i) }; }).filter(x => x.s >= .45).sort((a, b) => b.s - a.s).slice(0, 3);
      if (sims.length) out.push(h("div", null, h("b", null, "A similar question may already exist (automatic suggestion). "), "Yours is still welcome. Looking first can help you sharpen it.", h("ul", null, sims.map(x => h("li", null, x.p.internal ? h("a", { href: x.p.url }, x.p.t) : ext(x.p.url, x.p.t))))));
    }
    const cons = Object.values(X.res).filter(r => r.type === "concept" && new RegExp("\\b" + r.title.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(low)).slice(0, 5);
    if (cons.length) out.push(h("div", null, h("b", null, "Concepts in the Research Atlas that your words mention (automatic, not reviewed). "), "A match shows a shared word. It does not show that your idea is related in substance.", h("div", { class: "chips", style: "margin-top:6px" }, cons.map(r => ext(r.url, h("span", { class: "tag" }, r.title))))));
    assist.replaceChildren(...out);
  }
  Object.values(els).forEach(e => e.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(runAssist, 350); }));
  function showErrors(errs, fieldMap) {
    Object.values(errEls).forEach(e => { e.textContent = ""; }); aErr.textContent = ""; cErr.textContent = "";
    Object.values(els).forEach(e => e.removeAttribute("aria-invalid")); nameIn.removeAttribute("aria-invalid"); consent.removeAttribute("aria-invalid");
    const items = [];
    for (const [k, m] of Object.entries(errs)) {
      const lab = k === "attribution" ? "Credit" : k === "consent" ? "Confirmation" : ((FIELDS[type].find(f => f.name === k) || {}).label || k).replace(/ \(optional\)$/, "");
      const target = k === "attribution" ? nameIn : k === "consent" ? consent : els[k];
      const e = k === "attribution" ? aErr : k === "consent" ? cErr : errEls[k];
      if (e) e.textContent = m; if (target) target.setAttribute("aria-invalid", "true");
      items.push(h("li", null, h("a", { href: "#" + (target ? target.id : ""), onclick: ev => { ev.preventDefault(); if (target) target.focus(); } }, lab), ": " + m));
    }
    sum.replaceChildren(...(items.length ? [h("div", { class: "errsum", role: "alert" }, h("h3", null, items.length === 1 ? "One thing needs attention" : items.length + " things need attention"), h("ul", null, items))] : []));
    if (items.length) sum.focus();
  }
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (hp.value) return;                                  // a bot filled the hidden field; do nothing and say nothing
    if (!live) { msg.replaceChildren(h("p", { class: "note" }, "Sending is not connected yet, so nothing was sent.")); return; }
    const vals = {}; Object.entries(els).forEach(([k, e]) => { vals[k] = e.value; });
    const attr = { mode: aName.checked ? "display-name" : "anonymous", name: nameIn.value };
    const { errs, clean } = validateValues(type, vals, legacy ? { mode: "anonymous" } : attr);
    if (!consent.checked) errs.consent = "Please confirm to continue.";
    if (Object.keys(errs).length) { showErrors(errs); return; }
    showErrors({});
    if (Date.now() - t0 < MIN_MS) { msg.replaceChildren(h("p", { class: "note" }, "Please take a moment to check what you wrote, then send again.")); return; }
    send_.disabled = true; msg.replaceChildren(h("p", { class: "note" }, "Sending…"));
    let res;
    try { res = await send(ep, buildPayload(ep, type, clean, attr, t0)); } catch (e) { res = null; }
    send_.disabled = false;
    if (res && res.ok) { form.replaceWith(success(res, ep)); const r = $("#result"); if (r) r.focus(); say("Contribution received."); return; }
    msg.replaceChildren(failure(res));
    if (res && res.status === 422 && res.body && res.body.error && res.body.error.fields) showErrors(Object.fromEntries(Object.entries(res.body.error.fields).map(([k, v]) => [k, "The service said: " + v])));
    msg.focus();
  });
  return form;
}
function success(res, ep) {
  const sim = ep.mode === "simulated", b = res.body || {};
  return h("div", { class: "result" + (sim ? " sim" : ""), id: "result", tabindex: "-1", role: "status" },
    sim && h("p", { class: "voice demo", style: "margin-bottom:8px" }, "Simulated. Nothing was sent or stored."),
    h("h3", null, "Contribution Received"),
    h("p", null, b.duplicate ? "A contribution with exactly this content had already been received, so nothing new was created." : "Your submission has been received for editorial consideration. Publication is not guaranteed."),
    b.receipt && h("p", { class: "note" }, "Receipt: ", h("code", { class: "rc" }, b.receipt), h("br"), "Keep this if you want to refer to your submission. There is no page to look up a status yet, so a receipt cannot show you one."),
    sim && h("p", { class: "note" }, "In the live Commons this panel appears only after the service confirms that it has received the contribution."),
    h("p", null, linkBtn("#contribute", "Make another contribution")));
}
function failure(res) {
  if (!res) return h("div", { class: "errsum", role: "alert" }, h("h3", null, "Not sent"), h("p", null, "The service could not be reached, so nothing was sent. Your text is still here. You can try again, or copy it."));
  if (res.answeredButUnconfirmed) return h("div", { class: "errsum", role: "alert" }, h("h3", null, "Receipt not confirmed"), h("p", null, "The service answered but did not confirm that it received your contribution. Please treat it as not sent. Your text is still here."));
  const wait = res.retryAfter && /^\d+$/.test(res.retryAfter) ? " Please try again in about " + Math.max(1, Math.round(+res.retryAfter / 60)) + " minutes." : " Please try again later.";
  const m = res.status === 429 ? "Too many submissions were sent just now." + wait : res.status === 422 ? "The service did not accept some fields. See the notes above." : res.status >= 500 ? "The service had a problem on its side, so nothing was received. Your text is still here." : "The service did not accept the request (" + res.status + "). Your text is still here.";
  return h("div", { class: "errsum", role: "alert" }, h("h3", null, "Not sent"), h("p", null, m + (res.simulated ? " (Simulated.)" : "")));
}

/* ---------- how it works */
function about() {
  const rows = [
    ["Unanswered Archive", "Shared question inbox specified; links to questions", "Built (links). Sending: awaiting a receiving service", "Questions use the Archive's existing request format, so there is one inbox. Archive statuses are never changed by a contribution."],
    ["Research Atlas", "Concept links using the Atlas's own identifiers", "Built", "A link shows a shared subject, not that a claim is true. Automatic suggestions are labelled."],
    ["Lexicon of Intelligence", "Term hints while writing; links from contributions", "Built", "Reviewed entries only. The Lexicon offers one account of each term."],
    ["Inquiry Engine", "“Investigate This Question →” keeps the question", "Built", "A visitor's perspective is never used as evidence."],
    ["Universal Research Search", "Approved contributions become a search type", "Built, inactive", "Nothing is indexed until a contribution is approved. Pending and declined items are never indexed."],
    ["Published Research", "Links to the site's own articles", "Built (links)", "Only articles that exist are linked."],
    ["Research Observatory", "A recommended paper could become a candidate for review", "Specified, not built", "An editor would check it first. A recommendation is never treated as peer reviewed."],
    ["Research Ledger", "Documented public outcomes of concerns that lead to corrections", "Specified, not built", "Only the public editorial outcome, never private moderation."],
    ["Learning Institute", "Optional reflective prompts chosen by an editor", "Not built", "Lessons and assessments are never changed automatically."],
    ["Architect moderation inbox", "Login-only review, approve, decline, publish, withdraw", "Specified, not built", "Uses Architect's existing login. This repository does not contain Architect."],
    ["Substack", "Links only, by hand", "Link to the publication only", "No contribution is sent to Substack, and no essay link is invented."]];
  return wrapIn(h("p", { class: "kicker" }, "Honest status"), h("h1", { class: "h-l" }, "How the Commons works"),
    h("p", { class: "lede" }, "A curated space, not a forum. There are no likes, followers, rankings or comment threads, and there will not be."),
    h("section", { class: "sec" }, h("h2", null, "The path of a contribution"), h("ol", { class: "life", "aria-label": "Lifecycle" }, C.taxonomy.lifecycle.map(s => h("li", { class: s.id === "declined" || s.id === "withdrawn" ? "end" : "" }, h("span", null, s.label)))),
      h("div", { class: "tbl", style: "margin-top:14px", role: "region", "aria-label": "Contribution states", tabindex: "0" }, h("table", null, h("caption", { class: "sr" }, "The states a contribution can be in"), h("thead", null, h("tr", null, h("th", { scope: "col" }, "State"), h("th", { scope: "col" }, "What it means"), h("th", { scope: "col" }, "Public?"))), h("tbody", null, C.taxonomy.lifecycle.map(s => h("tr", null, h("th", { scope: "row" }, s.label), h("td", null, s.meaning), h("td", null, s.visitorVisible ? "Yes" : "No"))))))),
    h("section", { class: "sec" }, h("h2", null, "Two environments"), h("div", { class: "grid2" },
      h("div", { class: "panel" }, h("h3", null, "Private submission environment"), h("p", { class: "note" }, "Where submitted material is received and reviewed, behind Architect's login. It is not part of this site and holds the original submissions and private notes. None of it is in this repository.")),
      h("div", { class: "panel" }, h("h3", null, "Public Commons Library"), h("p", { class: "note" }, "What an editor approved, as plain files in this site: the text, the subject, the date and the credit the contributor chose. No contact details, no private notes, no moderation history.")))),
    h("section", { class: "sec" }, h("h2", null, "What is connected today"), h("p", { class: "note" }, "Built means it exists in this site. Specified means it is designed and documented but nobody has built it."),
      h("div", { class: "tbl", role: "region", "aria-label": "What is connected today", tabindex: "0" }, h("table", null, h("caption", { class: "sr" }, "Parts of the site the Commons connects to, and the state of each connection"), h("thead", null, h("tr", null, ["Part of the site", "How the Commons uses it", "State", "Limit"].map(t => h("th", { scope: "col" }, t)))), h("tbody", null, rows.map(r => h("tr", null, h("th", { scope: "row" }, r[0]), h("td", null, r[1]), h("td", null, r[2]), h("td", null, r[3]))))))),
    h("section", { class: "sec" }, h("h2", null, "Why there is no popularity ranking"), h("div", { class: "prose" }, h("p", null, "Contributions are listed by date, subject, kind and collection. They are not ranked by likes or views, because how many people agree with something says little about whether it is well reasoned or true, and because counting attention rewards the loudest voices over the carefully argued ones."))));
}

/* ============================================================ preview bar (private preview only) */
function previewBar() {
  if (!PREVIEW || $("#pv")) return;
  const demo = demoPack();
  const cb = h("input", { type: "checkbox", id: "pv-demo", disabled: !demo, onchange: ev => { DEMO_ON = ev.target.checked; renderView(); say(DEMO_ON ? "Demonstration records switched on." : "Demonstration records switched off."); } });
  const out = h("select", { id: "pv-out", "aria-label": "Simulated service response", onchange: ev => { C.preview.outcome = ev.target.value; } }, [["accept", "accepts"], ["429", "rate-limits (429)"], ["503", "is down (503)"], ["422", "rejects a field (422)"], ["offline", "is unreachable"]].map(([v, t]) => h("option", { value: v }, t)));
  const bar = h("div", { class: "pv", id: "pv", role: "region", "aria-label": "Private preview controls" }, h("div", { class: "wrap" },
    h("b", null, "Private preview"), h("span", null, "Not the live site. Nothing here is saved, sent or published."),
    h("label", null, cb, "Show fictional demonstration records"),
    C.preview && C.preview.simulate && h("label", null, "Simulated service ", out)));
  document.body.insertBefore(bar, $(".hdr")); document.body.classList.add("has-pv");
  const set = () => document.documentElement.style.setProperty("--pvh", bar.offsetHeight + "px"); set(); addEventListener("resize", set);
}

/* ============================================================ router */
let firstRoute = true;
function renderView() {
  const hs = (location.hash || "#home").slice(1) || "home";
  let node, nav = "home", title = "The Research Commons";
  const m = /^([a-z]+)(?:-(.+))?$/.exec(hs) || [], a = m[1], b = m[2];
  if (hs === "open-inquiries") { node = openInquiries(); nav = "open-inquiries"; title = "Open Inquiries"; }
  else if (a === "contribute") { node = contribute(b); nav = "contribute"; title = "Contribute"; }
  else if (a === "library") { node = library(b); nav = "library"; title = "Library"; }
  else if (a === "questions") { node = library("question"); nav = "library"; title = "Questions"; }
  else if (a === "c" && b) { node = detail(b); nav = "library"; const c = byId(b); title = c && c.status !== "withdrawn" ? c.title : "Contribution"; }
  else if (a === "correspondence") { node = correspondence(); nav = "correspondence"; title = "The Correspondence Collection"; }
  else if (a === "constellation") { node = constellation(); nav = "constellation"; title = "The Question Constellation"; }
  else if (a === "collections") { node = collections(); nav = "collections"; title = "Collections"; }
  else if (a === "collection" && b) { node = collectionPage(b); nav = "collections"; title = (X.coll[b] || {}).title || "Collection"; }
  else if (a === "guidelines") { node = guidelines(); nav = "guidelines"; title = "Contribution Guidelines"; if (b) setTimeout(() => { const t = document.getElementById("guidelines-" + b); if (t) t.scrollIntoView(); }, 0); }
  else if (a === "about") { node = about(); nav = "about"; title = "How it works"; }
  else { node = home(); }
  $("#main").replaceChildren(node); setNav(nav);
  document.title = (title === "The Research Commons" ? title : title + " · The Research Commons") + " · Artificially Intelligent";
  if (!firstRoute) { const f = $("h1", $("#main")); if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); } window.scrollTo(0, 0); say(title); }
  firstRoute = false;
}
function route() { if (C) renderView(); }
addEventListener("hashchange", route);
window.__commonsTest = { deriveEdges, validateValues, buildPayload, norm, inquiryUrl, state: () => ({ C, X, DEMO_ON }), setDemo: v => { DEMO_ON = v; renderView(); } };
shell();
load().then(() => { previewBar(); route(); }).catch(e => {
  $("#main").replaceChildren(wrapIn(h("h1", { class: "h-l" }, "The Research Commons could not load its data"), h("p", { class: "note" }, "Nothing is shown rather than a partial or invented list. Please try again later."), h("p", { class: "note" }, String(e.message))));
});
