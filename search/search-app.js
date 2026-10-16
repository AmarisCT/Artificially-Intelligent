"use strict";
/* Universal Research Search: interface. Text is inserted with textContent only; links are validated. */
const ROOT = window.OBS_ROOT || "../";
const LINKS = window.__LINKS || {};
const NS = "http://www.w3.org/2000/svg";
function h(t, a, ...k) { const e = document.createElement(t); for (const [n, v] of Object.entries(a || {})) { if (v == null || v === false) continue; if (n === "class") e.className = v; else if (n.startsWith("on")) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v === true ? "" : v); } for (const c of k.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; }
const safeHref = u => /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "#";
const abs = p => { try { return new URL(p, location.href).href; } catch (e) { return "#"; } };
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
const $ = (s, r) => (r || document).querySelector(s);
const clip = (s, n) => (s || "").length > n ? s.slice(0, n - 1).trimEnd() + "…" : (s || "");
const enc = q => btoa(unescape(encodeURIComponent(q))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec = s => { try { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); } catch (e) { return ""; } };
const EXAMPLES = ["Consciousness", "Artificial Intelligence", "Global Neuronal Workspace Theory", "Alan Turing", "Memory and Identity", "Can machines understand language?", "Machine Consciousness", "The Hard Problem of Consciousness", "Predictive Processing"];
const DESKKEY = "ai_desk_v1";
const INQ_URL = LINKS.inquiry || abs(ROOT + "inquiry-engine/");

let S, META, ST = { q: "", f: { types: new Set(), subjects: new Set(), status: new Set(), sourceTypes: new Set(), from: "", to: "" }, sort: "relevance", view: "context", limit: 10, sel: null, adv: { phrase: "", author: "", concept: "", open: false }, exact: false, filtersOpen: false };

function say(m) { const l = $("#live"); if (l) { l.textContent = ""; setTimeout(() => l.textContent = m, 30); } }
function toast(m) { say(m); const t = h("div", { class: "toast", role: "status" }, m); document.body.append(t); setTimeout(() => t.remove(), 2400); }
const deskRead = () => { const o = LS.get(DESKKEY, null); return o && Array.isArray(o.items) ? o : { items: [], last: null }; };
const deskHas = k => deskRead().items.some(x => x.k === k);
function deskToggle(k) { const o = deskRead(), i = o.items.findIndex(x => x.k === k); if (i >= 0) o.items.splice(i, 1); else o.items.push({ k, note: "", coll: "", t: Date.now() }); if (!LS.set(DESKKEY, { items: o.items, last: o.last == null ? null : o.last })) toast("Saving is blocked by your browser settings."); return deskHas(k); }

function siteNav() {
  const n = $("#site"); n.textContent = "";
  [["Atlas", "research-atlas/"], ["Theory Chamber", "theory-chamber/"], ["Unanswered Archive", "unanswered-archive/"], ["Observatory", "research-observatory/"], ["Museum", "museum/"]].forEach(([t, u]) => n.append(h("a", { href: safeHref(abs(ROOT + u)) }, t)));
  if (INQ_URL) n.append(h("a", { href: safeHref(INQ_URL) }, "Inquiry Engine"));
  n.append(h("a", { href: "#", "aria-current": "page", onclick: e => { e.preventDefault(); ST.q = ""; location.hash = "#"; route(); } }, "Search"));
  window.__GS = GlobalSearch.mount({ engine: S, searchUrl: location.href.split("#")[0], navHost: n, isFullSearchPage: true });
}

/* ---------- shared bits ---------- */
function saveBtn(r) {
  if (!r.deskKey) return null;
  const b = h("button", { class: "btn sm", type: "button", "aria-pressed": String(deskHas(r.deskKey)) }, deskHas(r.deskKey) ? "On Reading Desk" : "Save to Reading Desk");
  b.addEventListener("click", ev => { ev.stopPropagation(); const on = deskToggle(r.deskKey); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "On Reading Desk" : "Save to Reading Desk"; say(on ? "Saved to your Reading Desk in this browser." : "Removed from your Reading Desk."); });
  return b;
}
const statusTags = r => [r.type === "source" ? h("span", { class: "tag mint" }, r.evidenceLabel || "Publication") : null, r.preprint ? h("span", { class: "tag amber" }, "Preprint, not peer reviewed") : null, r.classification ? h("span", { class: "tag amber dash" }, "Preliminary classification") : null];
function meta(r) {
  const p = [];
  if (r.type === "source") p.push((r.authors || []).slice(0, 3).join(", ") + ((r.authors || []).length > 3 ? " et al." : "") + (r.year ? " (" + r.year + ")" : "") + (r.venue ? ". " + r.venue : ""));
  if (r.type === "article") p.push((r.category || "Essay") + (r.date ? " · " + r.date : "") + (r.readingMinutes ? " · " + r.readingMinutes + " min read" : ""));
  if (r.type === "question") p.push("Status: " + (r.status || []).join(", "));
  if (r.type === "museum" && r.when) p.push(r.when);
  return p.join(" ");
}
function investigateLink(q) { if (!INQ_URL) return null; return h("a", { class: "btn sm", href: safeHref(INQ_URL.split("#")[0] + "#q-" + enc(q)), target: "_blank", rel: "noopener" }, "Investigate this question →"); }

/* ---------- entrance ---------- */
function combo(initial, onGo) {
  const input = h("input", { id: "q", type: "text", role: "combobox", "aria-expanded": "false", "aria-controls": "sug", "aria-autocomplete": "list", "aria-label": "Search the archive", placeholder: "Search theories, concepts, articles, thinkers, and questions...", autocomplete: "off", "data-gs-allow": "1", maxlength: "240", value: initial || "" });
  const list = h("ul", { class: "sugg", id: "sug", role: "listbox", "aria-label": "Suggestions", hidden: "" });
  let items = [], act = -1;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); act = -1; input.removeAttribute("aria-activedescendant"); };
  function draw() {
    const v = input.value.trim(); list.textContent = ""; items = []; act = -1;
    if (v.length < 2) { close(); return; }
    S.suggest(v, 8).forEach(s => items.push(s));
    if (!items.length) { close(); return; }
    items.forEach((s, i) => list.append(h("li", { id: "sg" + i, role: "option", "aria-selected": "false", onmousedown: e => { e.preventDefault(); pick(i); } }, h("span", { class: "st" }, s.kind === "author" ? "Author" : S.typeLabel[s.type]), h("span", { class: "sl" }, s.label), s.hint ? h("span", { class: "sh" }, s.hint) : null)));
    list.hidden = false; input.setAttribute("aria-expanded", "true");
  }
  function pick(i) { const s = items[i]; close(); input.value = s.kind === "author" ? "author:\"" + s.label + "\"" : s.label; onGo(input.value); }
  function move(d) { if (list.hidden) return; act = (act + d + items.length) % items.length; [].forEach.call(list.children, (li, i) => li.setAttribute("aria-selected", String(i === act))); input.setAttribute("aria-activedescendant", "sg" + act); }
  input.addEventListener("input", draw);
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) draw(); else move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && act >= 0) { e.preventDefault(); pick(act); }
    else if (e.key === "Escape" && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
  return { input, list, wrap: h("div", { class: "combo" }, input, list) };
}
function advancedPanel() {
  const f = ST.adv, fv = S.facetValues();
  const sel = (id, label, opts, val, on) => h("div", null, h("label", { for: id }, label), h("select", { id, onchange: e => on(e.target.value) }, h("option", { value: "" }, "Any"), opts.map(o => h("option", { value: o, selected: o === val ? "" : null }, o))));
  const inp = (id, label, val, on, ph) => h("div", null, h("label", { for: id }, label), h("input", { id, type: "text", value: val, placeholder: ph || "", oninput: e => on(e.target.value) }));
  const concepts = S.engine ? [] : [];
  return h("div", { class: "adv", id: "adv" }, h("div", { class: "g" },
    inp("a-phrase", "Exact phrase", f.phrase, v => f.phrase = v, "e.g. hard problem"),
    inp("a-author", "Author or thinker", f.author, v => f.author = v, "e.g. Turing"),
    fv.years ? h("div", null, h("label", { for: "a-from" }, "Publication year"), h("div", { class: "row" }, h("input", { id: "a-from", type: "text", inputmode: "numeric", placeholder: fv.years[0], value: ST.f.from, style: "width:90px", oninput: e => ST.f.from = e.target.value }), "–", h("input", { id: "a-to", type: "text", inputmode: "numeric", placeholder: fv.years[1], value: ST.f.to, style: "width:90px", oninput: e => ST.f.to = e.target.value }))) : null,
    sel("a-subj", "Research discipline", fv.subjects, [...ST.f.subjects][0] || "", v => { ST.f.subjects = new Set(v ? [v] : []); }),
    sel("a-type", "Content type", fv.types.map(t => S.typeLabel[t]), [...ST.f.types].map(t => S.typeLabel[t])[0] || "", v => { const t = fv.types.find(x => S.typeLabel[x] === v); ST.f.types = new Set(t ? [t] : []); }),
    sel("a-src", "Source", fv.sourceTypes, [...ST.f.sourceTypes][0] || "", v => { ST.f.sourceTypes = new Set(v ? [v] : []); }),
    sel("a-stat", "Review status", fv.status, [...ST.f.status][0] || "", v => { ST.f.status = new Set(v ? [v] : []); }),
    inp("a-conc", "Related concept", f.concept, v => f.concept = v, "e.g. Memory")),
    h("p", { class: "meta", style: "margin:10px 0 0" }, "Only fields that exist in the index are offered. You can also type operators: author:Turing  year:2015-2022  type:theory  subject:memory"));
}
function entrance() {
  const c = S.counts(), adapters = META.adapters || [];
  const go = q => ask(q);
  const cb = combo("", go);
  const form = h("form", { class: "ask", role: "search", onsubmit: e => { e.preventDefault(); go(cb.input.value); } }, cb.wrap, h("button", { class: "btn primary", type: "submit" }, "Explore Research →"));
  const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 400 400"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<circle cx="200" cy="200" r="190" fill="none" stroke="#232a2b" stroke-dasharray="3 6"/><circle cx="200" cy="200" r="140" fill="none" stroke="#2b3a35"/><circle cx="200" cy="200" r="90" fill="none" stroke="#232a2b" stroke-dasharray="3 6"/><circle cx="200" cy="200" r="38" fill="none" stroke="#2b3a35"/><line x1="200" y1="200" x2="292" y2="146" stroke="#3e5c50"/><circle cx="292" cy="146" r="5" fill="#0a0d0e" stroke="#8fe9c4"/><circle cx="130" cy="120" r="5" fill="#0a0d0e" stroke="#8fe9c4"/><circle cx="118" cy="268" r="5" fill="#0a0d0e" stroke="#8fe9c4"/><circle cx="268" cy="318" r="5" fill="#0a0d0e" stroke="#8fe9c4"/><circle cx="200" cy="200" r="15" fill="#8fe9c4"/><path d="M193 193 l14 14 m0 -14 l-14 14" stroke="#04100b" stroke-width="0" fill="none"/>';
  const inactive = adapters.filter(a => !a.active).map(a => a.name);
  return [
    h("section", { class: "hero" }, h("div", null, h("p", { class: "kicker" }, "Feature 9 · Preview"), h("h1", null, "SEARCH THE ARCHIVE"), h("p", { class: "sub" }, "Every idea is connected. Begin with what you want to understand."),
      h("p", { class: "lede" }, "One search across every published theory, concept, essay, open question, publication and museum room on this site."), form, h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", "aria-expanded": String(ST.adv.open), "aria-controls": "adv", onclick: () => { ST.adv.open = !ST.adv.open; render(); } }, ST.adv.open ? "Hide advanced search" : "Advanced search")), ST.adv.open ? advancedPanel() : null), svg),
    h("section", null, h("h2", null, "Try a search"), h("div", { class: "chips" }, EXAMPLES.map(q => h("button", { type: "button", onclick: () => ask(q) }, q)))),
    statusStrip(c, inactive)];
}
function statusStrip(c, inactive) {
  const L = { article: "essays", concept: "concepts", theory: "theories", comparison: "comparisons", question: "open questions", source: "publications", museum: "museum rooms" };
  return h("div", { class: "strip" }, h("b", null, "What is searchable: "), "records that are published on this site today.",
    h("ul", { class: "counts" }, Object.keys(L).filter(t => c[t]).map(t => h("li", null, h("b", null, c[t]), " " + L[t]))),
    h("p", { class: "inact" }, "Index built " + META.generated + ". New essays appear after the next rebuild of the index." + (inactive.length ? " Not searchable yet: " + inactive.join(", ") + "." : "")),
    h("p", { class: "inact" }, "Searches run in your browser. Nothing you type is sent anywhere or stored."));
}

/* ---------- search + results ---------- */
function ask(q) { q = (q || "").trim(); if (!q) { toast("Type something to search for."); return; } ST.q = q; ST.limit = 10; ST.sel = null; ST.exact = false; const hh = "#s-" + enc(q); if (location.hash === hh) render(); else location.hash = hh; }
function fullQuery() { let q = ST.q; if (ST.adv.phrase.trim()) q += ' "' + ST.adv.phrase.trim().replace(/"/g, "") + '"'; return q; }
function currentFilters() {
  const F = { types: [...ST.f.types], subjects: [...ST.f.subjects], status: [...ST.f.status], sourceTypes: [...ST.f.sourceTypes] };
  if (/^\d{4}$/.test(ST.f.from)) F.from = +ST.f.from; if (/^\d{4}$/.test(ST.f.to)) F.to = +ST.f.to;
  if (ST.adv.author.trim()) F.author = ST.adv.author.trim(); if (ST.adv.concept.trim()) F.concept = ST.adv.concept.trim();
  return F;
}
function runSearch(limit) { return S.search(fullQuery(), { filters: currentFilters(), sort: ST.sort, limit: limit || ST.limit, exact: ST.exact }); }

function resultCard(x, o) {
  const r = x.record; o = o || {};
  const why = x.reasons.filter(Boolean);
  const card = h("article", { class: "res" + (ST.sel === r.id ? " sel" : ""), "aria-label": r.title },
    h("div", null, h("span", { class: "tag" }, S.typeLabel[r.type]), statusTags(r), (r.subject || []).slice(0, 3).map(s => h("span", { class: "tag dash" }, s))),
    h("h4", null, h("a", { href: safeHref(r.url), target: "_blank", rel: "noopener" }, r.title)),
    meta(r) ? h("p", { class: "meta" }, meta(r)) : null,
    r.summary ? h("p", null, clip(r.summary, 230)) : null,
    why.length ? h("p", { class: "rel" }, h("b", null, "Related because: "), why[0], why.length > 1 ? h("details", { class: "w" }, h("summary", null, "More reasons (" + (why.length - 1) + ")"), h("ul", { class: "why" }, why.slice(1).map(w => h("li", null, w)))) : null) : null,
    h("p", { class: "meta" }, r.attribution + " · " + r.reviewStatus + (r.date && r.type !== "source" ? " · " + r.date : "")),
    h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => { ST.sel = r.id; renderResults(); const p = $("#pv"); if (p) p.focus({ preventScroll: true }); } }, "Preview"), h("a", { class: "btn sm", href: safeHref(r.url), target: "_blank", rel: "noopener" }, r.type === "source" ? "Original publication ↗" : "Open ↗"), saveBtn(r)));
  return card;
}
function preview() {
  const r = ST.sel && S.get(ST.sel); if (!r) return null;
  const dl = h("dl"); const row = (k, v) => { if (v == null || v === "" || (Array.isArray(v) && !v.length)) return; dl.append(h("dt", null, k), h("dd", null, v)); };
  row("Type", S.typeLabel[r.type] + " · " + r.sourceType);
  row("Description", r.summary || "No description is recorded for this item.");
  if (r.type === "article") { row("Published", r.date); row("Reading time", r.readingMinutes ? r.readingMinutes + " minutes" : null); row("Related topics", (r.concepts || []).map(c => S.label(c)).join(", ")); row("Topic tags", "Assigned by the editor"); }
  if (r.type === "theory") { row("Tradition", r.tradition); row("Review status", r.reviewStatus); row("Note", "Listing a theory is not evidence for it. See the Theory Chamber for sources and criticisms."); }
  if (r.type === "source") { row("Authors", (r.authors || []).join(", ") || "Not recorded"); row("Published", [r.year, r.venue].filter(Boolean).join(" · ")); row("Kind of work", r.evidenceLabel); row("DOI", r.doi); row("How the site read it", r.read); row("Limitations (as recorded)", r.limitations); row("Classification", r.classification); }
  if (r.type === "question") { row("Status", (r.status || []).join(", ")); row("Why this status", r.statusJustification); row("Open problems", (r.openProblems || []).slice(0, 3).map(p => "• " + p).join("\n")); }
  if (r.type === "concept") { row("Subjects explored", (r.subjects || []).join(", ")); }
  if (r.type === "museum") { row("Period", r.when); }
  row("Research subjects", (r.subject || []).join(", "));
  row("Source", r.attribution); row("Review status", r.reviewStatus); row("Added to the index", r.added);
  const rel = (S.engine.neighbours(r.id) || []).slice(0, 4);
  const acts = h("div", { class: "row", style: "margin-top:14px" }, h("a", { class: "btn", href: safeHref(r.url), target: "_blank", rel: "noopener" }, r.type === "source" ? "Original publication ↗" : "Open ↗"), r.type === "question" ? investigateLink(r.title) : null, r.type === "concept" && /#dossier-/.test(r.url) ? h("a", { class: "btn", href: safeHref(r.url), target: "_blank", rel: "noopener" }, "Explore in the Atlas →") : null, saveBtn(r));
  return h("aside", { class: "panel pv", id: "pv", tabindex: "-1", "aria-label": "Result preview" }, h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "kicker", style: "margin:0" }, "Preview"), h("button", { class: "btn sm", type: "button", onclick: () => { ST.sel = null; renderResults(); } }, "Close")), h("h3", null, r.title), dl,
    rel.length ? h("div", null, h("p", { class: "grp" }, "Linked records"), h("ul", { class: "why" }, rel.map(n => { const o = S.get(n.id); return h("li", { class: n.kind === "preliminary" ? "pre" : "" }, h("a", { href: "#", onclick: e => { e.preventDefault(); ST.sel = n.id; renderResults(); } }, o.title), " · " + (n.kind === "preliminary" ? "unreviewed association" : "editorial link")); }))) : null, acts);
}
function filtersPanel(res) {
  const fc = res.facets, fv = S.facetValues(), box = (key, label, vals, labelFn) => {
    const present = vals.filter(v => fc[key][v]); if (!present.length) return null;
    return h("div", null, h("h3", null, label), present.map(v => { const id = "f-" + key + "-" + v.replace(/\W/g, ""); return h("label", { for: id }, h("input", { id, type: "checkbox", checked: ST.f[key].has(v) ? "" : null, onchange: e => { e.target.checked ? ST.f[key].add(v) : ST.f[key].delete(v); ST.limit = 10; renderResults(); } }), labelFn ? labelFn(v) : v, h("span", { class: "n" }, fc[key][v])); }));
  };
  const any = ST.f.types.size || ST.f.subjects.size || ST.f.status.size || ST.f.sourceTypes.size || ST.f.from || ST.f.to;
  const hasDated = fv.years;
  return h("aside", { class: "filters", "aria-label": "Filters", "data-open": ST.filtersOpen ? "" : null },
    h("button", { class: "btn sm fbtn", type: "button", "aria-expanded": String(ST.filtersOpen), onclick: () => { ST.filtersOpen = !ST.filtersOpen; renderResults(); } }, ST.filtersOpen ? "Hide filters" : "Filters" + (any ? " (on)" : "")),
    h("div", { class: "grp-body" },
      box("types", "Content type", fv.types, t => S.typeLabel[t]), box("subjects", "Research subject", fv.subjects), box("sourceTypes", "Source", fv.sourceTypes), box("status", "Review status", fv.status),
      hasDated ? h("div", null, h("h3", null, "Publication period"), h("div", { class: "row" }, h("input", { type: "text", inputmode: "numeric", "aria-label": "From year", placeholder: fv.years[0], value: ST.f.from, style: "width:84px", onchange: e => { ST.f.from = e.target.value.trim(); renderResults(); } }), "–", h("input", { type: "text", inputmode: "numeric", "aria-label": "To year", placeholder: fv.years[1], value: ST.f.to, style: "width:84px", onchange: e => { ST.f.to = e.target.value.trim(); renderResults(); } })), h("p", { class: "meta", style: "margin:6px 0 0" }, "Only records with a valid year are matched when a period is set.")) : null,
      any ? h("button", { class: "btn sm", type: "button", style: "margin-top:14px", onclick: () => { ST.f = { types: new Set(), subjects: new Set(), status: new Set(), sourceTypes: new Set(), from: "", to: "" }; renderResults(); } }, "Clear filters") : null));
}
function connectionsPanel(q) {
  let c = S.connections(q);
  if (!c.terms.length) { const top = S.search(q, { limit: 1 }).results[0]; const cs = top && (top.record.concepts || []).slice(0, 2).map(x => S.label(x)).join(" "); if (cs) c = S.connections(cs); }
  if (!c.terms.length) return null;
  return h("section", { class: "conn", "aria-labelledby": "ch" }, h("h2", { id: "ch" }, "Explore the connections"),
    h("p", { class: "meta", style: "margin:0" }, "Concepts linked to " + c.terms.map(t => "“" + t.label + "”").join(", ") + ". Select one to refine your search."),
    c.related.length ? h("div", { class: "chips" }, c.related.map(r => h("button", { type: "button", title: r.kind === "atlas" ? "Linked in the Research Atlas" : r.kind === "same" ? "Same idea under two names in the site's data" : "Closely related, not identical", onclick: () => ask(r.label) }, r.label, h("span", { class: "k" }, r.kind === "atlas" ? "Atlas" : r.kind === "same" ? "same idea" : "related")))) : h("p", { class: "meta" }, "No linked concepts are recorded for this term yet."),
    c.atlas.length ? h("div", { class: "row" }, c.atlas.map(a => h("a", { class: "btn sm", href: safeHref(a.url), target: "_blank", rel: "noopener" }, "Open “" + a.label + "” in the Research Atlas →"))) : null,
    h("p", { class: "meta", style: "margin:10px 0 0" }, "These links come from the Research Atlas and the site's concept vocabulary. They show how this site organises ideas, not that a scientific relationship has been demonstrated."));
}
function emptyState(res) {
  return h("div", { class: "panel" }, h("h3", null, "Nothing in the index matches"),
    h("p", null, "The archive has no published record for “" + ST.q + "”" + (currentFilters().types.length || ST.f.subjects.size || ST.f.status.size || ST.f.sourceTypes.size || ST.f.from || ST.f.to ? " with these filters" : "") + ". It would rather say so than show something unrelated."),
    h("ul", null, h("li", null, "Check the spelling, or try fewer or broader words."), h("li", null, "Clear any filters on the left."), h("li", null, "Browse the ", h("a", { href: safeHref(abs(ROOT + "research-observatory/")), target: "_blank", rel: "noopener" }, "Research Observatory"), " or search external scholarship in the ", h("a", { href: safeHref(abs(ROOT + "intelligence-index/")), target: "_blank", rel: "noopener" }, "Intelligence Index"), ". The archive does not include every publication.")),
    h("div", { class: "chips" }, EXAMPLES.slice(0, 5).map(q => h("button", { type: "button", onclick: () => ask(q) }, q))));
}
function renderResults() {
  const box = $("#results"); if (!box) return; box.textContent = "";
  const res = runSearch(ST.view === "context" ? 9999 : ST.limit);
  const hasFilter = ST.f.types.size || ST.f.subjects.size || ST.f.status.size || ST.f.sourceTypes.size || ST.f.from || ST.f.to;
  const main = h("div");
  const bar = h("div", { class: "rbar" }, h("div", null, h("b", null, res.total + (res.total === 1 ? " result" : " results")), h("span", { class: "meta" }, hasFilter ? " with filters" : "")),
    h("div", { class: "row" }, h("label", { class: "meta", for: "sort" }, "Sort"), h("select", { id: "sort", onchange: e => { ST.sort = e.target.value; ST.limit = 10; renderResults(); } }, [["relevance", "Relevance"], ["date", "Newest first"], ["title", "Title A–Z"]].map(([v, l]) => h("option", { value: v, selected: v === ST.sort ? "" : null }, l))),
      h("button", { class: "btn sm", type: "button", "aria-pressed": String(ST.view === "context"), onclick: () => { ST.view = "context"; renderResults(); } }, "By research context"), h("button", { class: "btn sm", type: "button", "aria-pressed": String(ST.view === "list"), onclick: () => { ST.view = "list"; renderResults(); } }, "Ranked list")));
  main.append(bar);
  if (res.correctedFrom.length) main.append(h("p", { class: "notice" }, "Showing results for “" + res.corrected + "”. ", h("button", { type: "button", onclick: () => { ST.exact = true; renderResults(); } }, "Search for “" + res.parsed.text + "” instead")));
  if (res.expanded) main.append(h("p", { class: "notice" }, "Showing results for words starting with “" + res.expanded.from + "”, such as “" + res.expanded.to + "”."));
  if (res.questionLike && INQ_URL) main.append(h("div", { class: "notice" }, "This looks like a research question. ", investigateLink(ST.q), " builds a step-by-step pathway from the same records."));
  if (!res.total) main.append(emptyState(res));
  else if (ST.view === "context") {
    const all = runSearch(9999).all, groups = S.group(all, 3), byId = new Map(runSearch(9999).results.map(x => [x.id, x]));
    groups.forEach(g => { const open = ST["g" + g.type]; const ids = open ? g.ids : g.shown;
      main.append(h("div", { class: "ghd" }, h("h3", null, g.label + (g.ids.length > 1 ? "s" : "") + " (" + g.ids.length + ")"), h("p", null, g.note)));
      ids.forEach(id => main.append(resultCard(byId.get(id))));
      if (g.ids.length > 3) main.append(h("button", { class: "btn sm", type: "button", onclick: () => { ST["g" + g.type] = !open; renderResults(); } }, open ? "Show fewer" : "Show all " + g.ids.length)); });
  } else {
    res.results.forEach(x => main.append(resultCard(x)));
    if (res.total > res.results.length) main.append(h("button", { class: "btn", type: "button", onclick: () => { ST.limit += 10; renderResults(); } }, "Show 10 more (" + (res.total - res.results.length) + " left)"));
  }
  const pv = preview();
  box.append(h("div", { class: "rl" + (pv ? "" : " nopv") }, filtersPanel(res), main, pv));
  say(res.total + " results for " + ST.q);
}
function results() {
  const cb = combo(ST.q, q => ask(q));
  const form = h("form", { class: "ask", role: "search", onsubmit: e => { e.preventDefault(); ask(cb.input.value); } }, cb.wrap, h("button", { class: "btn primary", type: "submit" }, "Explore Research →"));
  const advBtn = h("button", { class: "btn sm", type: "button", "aria-expanded": String(ST.adv.open), "aria-controls": "adv", onclick: () => { ST.adv.open = !ST.adv.open; render(); } }, ST.adv.open ? "Hide advanced search" : "Advanced search");
  const apply = ST.adv.open ? h("button", { class: "btn sm primary", type: "button", onclick: () => { ask(cb.input.value || ST.q); } }, "Apply advanced search") : null;
  return [h("p", { class: "kicker" }, "Search the archive"), form, h("div", { class: "row" }, advBtn, apply, h("a", { class: "btn sm", href: "#", onclick: e => { e.preventDefault(); ST.q = ""; location.hash = "#"; render(); } }, "New search")), ST.adv.open ? advancedPanel() : null, connectionsPanel(fullQuery()), h("div", { id: "results" })];
}

function render() {
  const app = $("#app"); app.textContent = "";
  document.title = (ST.q ? clip(ST.q, 60) + " · " : "") + "Search the Archive · Artificially Intelligent";
  app.append(...(ST.q ? results() : entrance()).filter(Boolean));
  if (ST.q) renderResults();
  const m = $("#main"); if (m && ST.q) m.focus({ preventScroll: true });
  if (!ST.q) { const q = $("#q"); if (q) q.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}
function route() {
  const hs = (location.hash || "").slice(1);
  if (hs.startsWith("s-")) { const q = dec(hs.slice(2)); if (q) { if (q !== ST.q) { ST.limit = 10; ST.sel = null; ST.exact = false; } ST.q = q; } }
  else if (!hs) ST.q = "";
  render();
}
async function load() {
  if (window.__INQ) return window.__INQ;
  const g = f => fetch("../inquiry-engine/data/" + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const [index, vocab, rules] = await Promise.all([g("research-index.json"), g("concept-relations.json"), g("pathway-rules.json")]);
  return { index, vocab, rules };
}
(async function () {
  try { const d = await load(); META = d.index.meta; S = SearchEngine.create(d.index, d.vocab, d.rules); }
  catch (e) { $("#app").textContent = ""; $("#app").append(h("div", { class: "panel" }, h("h3", null, "The research index could not be loaded"), h("p", null, "Please reload the page. Nothing on the site has been changed."))); return; }
  siteNav(); addEventListener("hashchange", route); route();
})();
