"use strict";
/* The Learning Institute. Text is inserted with textContent only; external links are validated (https only). */
const { h, sv, shuffle } = LI;
const ROOT = window.OBS_ROOT || "../";
const $ = (s, r) => (r || document).querySelector(s);
const clip = (s, n) => (s || "").length > n ? s.slice(0, n - 1).trimEnd() + "…" : (s || "");
const enc = q => btoa(unescape(encodeURIComponent(q))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const safeHref = u => /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "#";
const local = p => { try { const u = new URL(p, location.href); return u.origin === location.origin ? u.href : "#"; } catch (e) { return "#"; } };
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const KEY = "ai_learn_v1", DESK = "ai_desk_v1";
const D = {}; let IDX = new Map(), MANIFEST = [], LEX = {};

/* ---------- storage ---------- */
const blank = () => ({ v: 1, started: {}, done: {}, checks: {}, refl: {}, marks: [], last: null, compass: null, sem: { done: {}, refl: {} }, ver: {} });
function P() { const o = LS.get(KEY, null); if (!o || o.v !== 1) return blank(); const b = blank(); for (const k in b) if (o[k] === undefined) o[k] = b[k]; return o; }
let STORE_OK = true;
function save(o) { STORE_OK = LS.set(KEY, o); if (!STORE_OK) toast("Your browser is blocking saving, so progress will not be kept after you leave this page."); return STORE_OK; }
const deskRead = () => { const o = LS.get(DESK, null); return o && Array.isArray(o.items) ? o : { items: [], last: null }; };
const deskHas = k => deskRead().items.some(x => x.k === k);
function deskToggle(k) { const o = deskRead(), i = o.items.findIndex(x => x.k === k); if (i >= 0) o.items.splice(i, 1); else o.items.push({ k, note: "", coll: "", t: Date.now() }); LS.set(DESK, Object.assign({}, o, { items: o.items })); return deskHas(k); }
function say(m) { const l = $("#live"); if (l) { l.textContent = ""; setTimeout(() => l.textContent = m, 30); } }
function toast(m) { say(m); const t = h("div", { class: "toast", role: "status" }, m); document.body.append(t); setTimeout(() => t.remove(), 2600); }

/* ---------- lookups ---------- */
const course = id => D.courses.find(c => c.id === id);
const lesson = id => D.lessons.find(l => l.id === id);
const published = () => D.courses.filter(c => c.status === "published");
const lessonsOf = c => c.lessons.map(lesson).filter(Boolean);
const title = (pref, id) => { const r = IDX.get(pref + ":" + id); return r ? r.title : id; };
const url = {
  lex: id => local(ROOT + "lexicon/#c-" + id), theory: id => local(ROOT + "theory-chamber/#theory-" + id), cmp: id => local(ROOT + "theory-chamber/#compare-" + id),
  q: id => local(ROOT + "unanswered-archive/#q-" + id), atlas: id => local(ROOT + "#dossier-" + id), room: id => local(ROOT + "museum/#room-" + id),
  inquiry: q => local(ROOT + "inquiry-engine/#q-" + enc(q)), search: q => local(ROOT + "search/#s-" + enc(q)), obs: () => local(ROOT + "research-observatory/")
};
function lessonState(id) { const s = P(); return s.done[id] ? "done" : (s.last && s.last.l === id) || Object.keys(s.checks).some(k => k.startsWith(id)) || s.refl[id + "-r"] ? "started" : "new"; }
function courseProgress(c) { const s = P(), ls = c.lessons; const n = ls.filter(l => s.done[l]).length; return { n, of: ls.length, pct: ls.length ? Math.round(100 * n / ls.length) : 0 }; }
function nextFor(c) { const s = P(); const ls = c.lessons; const first = ls.find(l => !s.done[l]); return first ? lesson(first) : null; }

/* ---------- inline markup ---------- */
let CITES = null;
function popover(btn, content) {
  const open = btn.getAttribute("aria-expanded") === "true";
  const nxt = btn.nextElementSibling; if (nxt && nxt.classList.contains("pop")) nxt.remove();
  btn.setAttribute("aria-expanded", String(!open)); if (open) { btn.focus(); return; }
  const pop = h("span", { class: "pop", role: "note" }, content); btn.after(pop);
}
function termBtn(kind, key, text) {
  let info;
  if (kind === "lex") { const c = LEX[key]; info = { t: c ? c.term : key, d: c ? c.intro : "See the Lexicon entry.", a: [["Full Lexicon entry →", url.lex(key)]], note: "Definition from the Lexicon of Intelligence." }; }
  else { const g = D.glossary[key] || {}; const lk = g.link; const a = []; if (lk && lk.startsWith("theory:")) a.push(["Open in the Theory Chamber →", url.theory(lk.slice(7))]); info = { t: g.term || key, d: g.text || "", a, note: "Defined for this course." }; }
  const b = h("button", { type: "button", class: "term", "aria-expanded": "false", "aria-label": text + ": show definition", onclick: () => popover(b, [h("b", null, info.t), info.d + " ", h("span", { class: "meta" }, info.note + " "), info.a.map(x => h("a", { href: x[1], target: "_blank", rel: "noopener" }, x[0]))]) }, text);
  b.addEventListener("keydown", e => { if (e.key === "Escape" && b.getAttribute("aria-expanded") === "true") { popover(b); } });
  return b;
}
function rich(text) {
  const out = []; const re = /\{\{(lex|g):([^|}]+)\|([^}]+)\}\}|\[@([^\]]+)\]/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(termBtn(m[1], m[2], m[3]));
    else { const ids = m[4].split(";").map(s => s.trim().replace(/^@/, "")); out.push(h("sup", null, ids.map((id, i) => { if (CITES && !CITES.includes(id)) CITES.push(id); const n = CITES ? CITES.indexOf(id) + 1 : "?"; return [i ? ", " : "", h("a", { href: "#ref-" + id.replace(/\W/g, "_"), "aria-label": "Reference " + n, onclick: e => { e.preventDefault(); const t = document.getElementById("ref-" + id.replace(/\W/g, "_")); if (t) { t.scrollIntoView({ block: "center" }); t.focus && t.focus({ preventScroll: true }); } } }, "[" + n + "]")]; }))); }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last)); return out;
}

/* ---------- sources ---------- */
function srcItem(id, num, pre_) {
  const s = D.sourcesById[id]; if (!s) return null;
  const pre = s.preprint || /arxiv|preprint/i.test((s.venue || "") + " " + (s.type || ""));
  return h("li", { id: (pre_ || "ref-") + id.replace(/\W/g, "_"), tabindex: "-1" }, h("div", { class: "t" }, (num ? "[" + num + "] " : ""), h("a", { href: safeHref(s.url), target: "_blank", rel: "noopener" }, s.title)),
    h("div", { class: "meta" }, (s.authors || []).slice(0, 4).join(", ") + ((s.authors || []).length > 4 ? " et al." : "") + (s.year ? " (" + s.year + ")" : "") + (s.venue ? ". " + s.venue : "") + (s.doi ? ". DOI " + s.doi : "")),
    h("div", null, h("span", { class: "chip mint" }, s.kind || s.type || "Source"), pre ? h("span", { class: "chip amber" }, "Preprint, not peer reviewed") : null, h("span", { class: "chip dash" }, s.basis)),
    s.verification ? h("div", { class: "vv" }, "How this was checked: " + s.verification) : null);
}
const srcList = (ids, startNum, pre_) => h("ol", { class: "src", style: "list-style:none" }, ids.map((id, i) => srcItem(id, startNum != null ? startNum + i : null, pre_)).filter(Boolean));

/* ---------- shell ---------- */
const TABS = [["", "Home"], ["library", "Learning pathways"], ["map", "Journey map"], ["compass", "Learning Compass"], ["seminar", "Research seminar"], ["progress", "My learning"], ["how", "How it works"]];
function siteNav() {
  const n = $("#site"); n.textContent = "";
  [["Atlas", "research-atlas/"], ["Theory Chamber", "theory-chamber/"], ["Unanswered Archive", "unanswered-archive/"], ["Observatory", "research-observatory/"], ["Museum", "museum/"], ["Lexicon", "lexicon/"], ["Inquiry Engine", "inquiry-engine/"], ["Search", "search/"]].forEach(([t, u]) => n.append(h("a", { href: local(ROOT + u) }, t)));
  n.append(h("a", { href: "#", "aria-current": "page" }, "Learning Institute"));
}
function tabs(cur) { return h("nav", { class: "tabsrow", "aria-label": "Learning Institute sections" }, TABS.map(([k, t]) => h("a", { href: "#" + k, "aria-current": k === cur ? "page" : null }, t))); }
function mount(cur, ...k) { const a = $("#app"); a.textContent = ""; a.append(tabs(cur), ...k.flat().filter(Boolean)); const m = $("#main"); m.focus({ preventScroll: true }); window.scrollTo(0, 0); }

/* ---------- cards ---------- */
function courseCard(c) {
  const pl = c.status !== "published", pr = !pl ? courseProgress(c) : null;
  return h("article", { class: "course" + (pl ? " planned" : ""), "aria-label": c.title },
    h("div", { class: "cid" }, "Course " + c.n), h("h3", null, h("a", { href: "#course-" + c.id }, c.title)),
    h("div", null, h("span", { class: "chip " + (pl ? "dash" : "mint") }, pl ? "Planned, not yet available" : "Available"), h("span", { class: "chip" }, c.level), !pl ? h("span", { class: "chip" }, "About " + c.hours + " hours") : null, !pl ? h("span", { class: "chip" }, c.lessonCount + " lessons") : null),
    h("p", { class: "grow" }, h("i", null, c.question)), pl ? h("p", { class: "meta" }, c.modules.length + " modules are outlined. The material has not been written or reviewed.") : h("p", { class: "meta" }, clip(c.description, 170)),
    !pl ? [h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pr.pct), "aria-label": "Your progress in " + c.title }, h("i", { style: "width:" + pr.pct + "%" })), h("p", { class: "meta" }, pr.n ? pr.n + " of " + pr.of + " lessons completed" : "Not started")] : null,
    h("div", { class: "row" }, h("a", { class: "btn sm" + (pl ? "" : " primary"), href: "#course-" + c.id }, pl ? "See the outline" : (pr.n && pr.n < pr.of ? "Continue →" : pr.n ? "Review →" : "Begin →"))));
}

/* ---------- home ---------- */
function continueCard() {
  const s = P(); if (!s.last) return null; const l = lesson(s.last.l), c = l && course(l.courseId); if (!l) return null;
  const pr = courseProgress(c), nx = nextFor(c);
  return h("section", { class: "cont", "aria-labelledby": "cl" }, h("h2", { id: "cl" }, "Continue learning"), h("p", null, h("b", null, c.title)), nx ? h("p", { class: "meta" }, "Next lesson: " + nx.title + " (lesson " + nx.n + " of " + c.lessonCount + "). " + pr.n + " completed.") : h("p", { class: "meta" }, "You have marked every lesson in this course as complete."),
    h("div", { class: "row" }, h("a", { class: "btn primary", href: "#lesson-" + (nx ? nx.id : l.id) }, nx ? "Continue Learning →" : "Review the course →"), s.last.l !== (nx && nx.id) ? h("a", { class: "btn", href: "#lesson-" + s.last.l }, "Return to " + clip(l.title, 36)) : null, !nx ? h("a", { class: "btn", href: "#record-" + c.id }, "View completion record") : null));
}
function home() {
  document.title = "The Learning Institute · Artificially Intelligent";
  const pub = published(), pl = D.courses.filter(c => c.status !== "published"), cont = continueCard();
  const svg = sv("svg", { viewBox: "0 0 400 400", "aria-hidden": "true" });
  svg.innerHTML = '<circle cx="200" cy="200" r="190" fill="none" stroke="#232a2b" stroke-dasharray="3 6"/><circle cx="200" cy="200" r="130" fill="none" stroke="#2b3a35"/><circle cx="200" cy="200" r="70" fill="none" stroke="#232a2b" stroke-dasharray="3 6"/><path d="M200 30 L212 200 L200 370 L188 200 Z" fill="none" stroke="#3e5c50"/><path d="M30 200 L200 188 L370 200 L200 212 Z" fill="none" stroke="#2b3a35"/><circle cx="200" cy="200" r="9" fill="#8fe9c4"/><circle cx="200" cy="30" r="5" fill="#0a0d0e" stroke="#8fe9c4"/><circle cx="370" cy="200" r="5" fill="#0a0d0e" stroke="#8fe9c4"/><circle cx="200" cy="370" r="5" fill="#0a0d0e" stroke="#8fe9c4"/><circle cx="30" cy="200" r="5" fill="#0a0d0e" stroke="#8fe9c4"/>';
  mount("", h("section", { class: "li-hero" }, h("div", null, h("p", { class: "kicker" }, "Human × Machine Learning"), h("h1", null, "THE LEARNING INSTITUTE"), h("p", { class: "sub" }, "An interdisciplinary education in human consciousness and artificial intelligence."),
    h("p", { class: "lede" }, "Understanding the relationship between human consciousness and artificial intelligence requires more than familiarity with technology."),
    h("p", { class: "lede", style: "font-size:18px" }, "It requires an exploration of philosophy, neuroscience, psychology, computation, language, memory, and the many questions that connect these disciplines. The Learning Institute offers structured educational journeys through these subjects, combining research-based explanations, interactive investigation, and opportunities for independent thought."),
    h("div", { class: "row", style: "margin-top:20px" }, h("a", { class: "btn primary", href: "#library" }, "Explore Learning Pathways →"), h("a", { class: "btn", href: "#course-C001" }, "Begin Learning →"), cont ? h("a", { class: "btn", href: "#lesson-" + (nextFor(course(lesson(P().last.l).courseId)) || lesson(P().last.l)).id }, "Continue Learning →") : null),
    h("p", { class: "meta", style: "margin-top:14px" }, "Free. No account needed. Your progress stays in this browser.")), svg),
    cont, h("blockquote", { class: "q" }, "Knowledge begins with curiosity. Understanding develops through inquiry."),
    h("section", { class: "sec" }, h("h2", null, "Open now"), h("p", { class: "lede" }, "Two foundational courses are complete. Each lesson has real material, a working activity, knowledge checks with explained feedback, and cited sources."), h("div", { class: "cards" }, pub.map(courseCard))),
    h("section", { class: "sec" }, h("h2", null, "Planned pathways"), h("p", { class: "lede" }, "These courses are outlined but not yet written. They are shown so you can see where the curriculum is going, and they are not available to study."), h("div", { class: "cards" }, pl.map(courseCard))),
    h("section", { class: "sec" }, h("h2", null, "Find your starting point"), h("p", { class: "lede" }, "The Learning Compass asks a few optional questions and suggests where to begin, with a reason for each suggestion. It does not measure ability or personality."), h("div", { class: "row" }, h("a", { class: "btn", href: "#compass" }, "Open the Learning Compass →"), h("a", { class: "btn", href: "#map" }, "See the Journey Map →"), h("a", { class: "btn", href: "#seminar" }, "Research Seminar →"))),
    h("section", { class: "sec" }, h("h2", null, "Part of the archive"), h("div", { class: "conn2" },
      [["Research Atlas", "Concepts introduced in lessons open as dossiers.", local(ROOT + "#atlas")], ["Theory Chamber", "Compare competing theories side by side.", local(ROOT + "theory-chamber/")], ["Lexicon of Intelligence", "Key terms, defined with sources.", local(ROOT + "lexicon/")], ["Unanswered Archive", "Open questions, kept open.", local(ROOT + "unanswered-archive/")], ["Inquiry Engine", "Take any lesson question further.", local(ROOT + "inquiry-engine/")], ["Research Observatory", "Scholarly publications with their evidence types.", url.obs()]].map(([t, d, u]) => h("div", null, h("h3", null, t), h("p", { class: "meta" }, d), h("a", { href: u }, "Open →"))))),
    h("p", { class: "meta", style: "margin-top:30px" }, "Understanding is not the destination of curiosity. It is what allows curiosity to go further."));
}

/* ---------- library ---------- */
const LF = { q: "", level: "", status: "published", disc: "" };
function library() {
  document.title = "Learning pathways · The Learning Institute";
  const levels = ["Foundations", "Foundations to Intermediate", "Intermediate", "Intermediate to Advanced", "Advanced"], discs = [...new Set(D.courses.flatMap(c => c.disciplines || []).concat(["philosophy", "neuroscience", "cognitive science", "psychology", "computer science", "ethics"]))].sort();
  const list = h("div", { class: "cards", "aria-live": "polite" });
  const draw = () => {
    const q = LF.q.trim().toLowerCase();
    const res = D.courses.filter(c => (!LF.status || (LF.status === "published") === (c.status === "published")) && (!LF.level || c.level === LF.level) && (!LF.disc || (c.disciplines || []).includes(LF.disc)) &&
      (!q || [c.title, c.question, c.description, c.level, (c.disciplines || []).join(" "), (c.objectives || []).join(" "), (c.modules || []).join(" "), c.lessons.map(l => (lesson(l) || {}).title).join(" ")].join(" ").toLowerCase().includes(q)));
    list.textContent = ""; res.forEach(c => list.append(courseCard(c))); if (!res.length) list.append(h("div", { class: "panel" }, h("p", null, "No pathway matches. Clear a filter or change the words."), h("p", { class: "meta" }, "To search lessons, concepts and sources across the whole archive, use ", h("a", { href: url.search(LF.q || "") }, "Universal Research Search"), ".")));
    $("#cnt").textContent = res.length + (res.length === 1 ? " pathway" : " pathways");
  };
  const sel = (id, label, opts, key) => h("div", null, h("label", { for: id, class: "meta" }, label), h("select", { class: "sel", id, onchange: e => { LF[key] = e.target.value; draw(); } }, opts.map(o => h("option", { value: o[0], selected: LF[key] === o[0] ? "" : null }, o[1]))));
  mount("library", h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Learning pathways"), h("p", { class: "lede" }, "Browse without registering. Each pathway is a structured mini-course. Pathways marked planned are not yet available."),
    h("div", { class: "row", style: "margin:18px 0" }, h("div", { style: "flex:1 1 280px" }, h("label", { for: "lq", class: "meta" }, "Search pathways"), h("input", { id: "lq", class: "sel", style: "width:100%;font-size:16px", type: "search", placeholder: "Title, topic, objective or lesson", value: LF.q, oninput: e => { LF.q = e.target.value; draw(); } })),
      sel("lst", "Availability", [["published", "Available"], ["planned", "Planned"], ["", "All"]], "status"), sel("llv", "Difficulty", [["", "Any level"]].concat(levels.map(l => [l, l])), "level"), sel("lds", "Discipline", [["", "Any discipline"]].concat(discs.map(d => [d, d])), "disc")),
    h("p", { class: "meta", id: "cnt" }), h("h2", { class: "sr" }, "Pathways"), list,
    h("section", { class: "sec" }, h("h2", null, "Difficulty levels"), h("ul", null, h("li", null, h("b", null, "Foundations. "), "Introduces essential concepts and requires little or no prior knowledge."), h("li", null, h("b", null, "Intermediate. "), "Assumes familiarity with core terminology and introduces more complex reasoning or research."), h("li", null, h("b", null, "Advanced. "), "Engages directly with scholarly debates, technical frameworks, experimental methods and difficult philosophical arguments.")), h("p", { class: "meta" }, "Levels are assigned by reading the lesson material. Durations are estimated from the length of each lesson, and the method is stated on each course page.")));
  draw();
}

/* ---------- course ---------- */
function relatedFor(c) {
  const ls = lessonsOf(c), set = k => [...new Set(ls.flatMap(l => l.connections[k] || []))];
  return { theories: set("theories"), questions: set("questions"), atlas: set("atlas"), museum: set("museum"), articles: [...new Set([...(c.articles || []), ...set("articles")])], comparisons: set("comparisons") };
}
function suggested(c) {
  const topics = c.id === "C001" ? ["consciousness", "mind", "perception", "attention", "neuroscience", "cognition"] : c.id === "C002" ? ["ai", "learning", "computing", "intelligence", "language"] : [];
  const have = new Set(relatedFor(c).articles.map(a => a.replace(/^art:/, "")));
  return MANIFEST.filter(a => !have.has(slugOf(a)) && (a.topics || []).some(t => topics.includes(t)));
}
const slugOf = a => (a.url || "").replace(/\/$/, "").split("/").pop();
function course_(id) {
  const c = course(id); if (!c) return notFound();
  document.title = c.title + " · The Learning Institute";
  if (c.status !== "published") return planned(c);
  const s = P(), pr = courseProgress(c), nx = nextFor(c), rel = relatedFor(c), sug = suggested(c);
  mount("library", h("p", { class: "crumbs" }, h("a", { href: "#library" }, "Learning pathways"), " / ", "Course " + c.n), h("p", { class: "kicker" }, "Course " + c.n + " · " + c.level), h("h1", { style: "font-size:clamp(30px,5vw,52px)" }, c.title),
    h("blockquote", { class: "q" }, c.question), h("p", { class: "lede" }, c.description),
    h("div", { class: "facts" }, [[c.id, "Course ID"], [c.level, "Difficulty"], ["About " + c.hours + " h", "Estimated time"], [String(c.lessonCount), "Lessons"], ["v" + c.version, "Version"], [c.reviewed, "Last reviewed"]].map(([b, sp]) => h("div", null, h("b", null, b), h("span", null, sp)))),
    h("p", { class: "meta" }, "Review status: " + c.reviewStatus + ". Time estimate: " + c.durationBasis), 
    h("div", { class: "row", style: "margin:14px 0" }, h("a", { class: "btn primary", href: "#lesson-" + (nx ? nx.id : c.lessons[0]) }, !pr.n ? "Begin Learning →" : nx ? "Continue Learning →" : "Review lessons →"), pr.n ? h("span", { class: "meta" }, pr.n + " of " + pr.of + " completed") : null, pr.n === pr.of ? h("a", { class: "btn", href: "#record-" + c.id }, "Completion record") : null),
    h("section", { class: "sec" }, h("h2", null, "What you will be able to do"), h("ul", { class: "objs" }, c.objectives.map(o => h("li", null, o)))),
    h("section", { class: "sec" }, h("h2", null, "Before you begin"), h("p", null, h("b", null, "Audience: "), c.audience), h("p", null, h("b", null, "Required background: "), "None. " + (c.id === "C002" ? "Three lessons include small working demonstrations; no programming is needed." : "Terms are explained as they arise.")), h("p", null, h("b", null, "Related disciplines: "), c.disciplines.join(", "))),
    h("section", { class: "sec" }, h("h2", null, "Lessons"), h("ol", { class: "lessons" }, lessonsOf(c).map(l => { const st = lessonState(l.id); return h("li", null, h("span", { class: "n" }, String(l.n).padStart(2, "0")), h("a", { href: "#lesson-" + l.id }, l.title), h("span", { class: "st" + (st === "done" ? " done" : "") }, (st === "done" ? "Completed · " : st === "started" ? "In progress · " : "") + l.minutes + " min")); }))),
    h("section", { class: "sec" }, h("h2", null, "Research connections"), h("div", { class: "conn2" },
      conn("Theory Chamber", rel.theories.map(t => [title("theory", t), url.theory(t)]).concat(rel.comparisons.map(x => [title("cmp", x), url.cmp(x)]))), conn("Unanswered Archive", rel.questions.map(q => [q + ": " + title("q", q), url.q(q)])),
      conn("Research Atlas", rel.atlas.map(a => [a.replace(/-/g, " "), url.atlas(a)])), conn("Museum of Human Memory", rel.museum.map(r => [title("room", r), url.room(r)])), conn("Published research", rel.articles.map(a => [title("art", a.replace(/^art:/, "")), (IDX.get(a) || {}).url || "#"])))),
    sug.length ? h("section", { class: "sec" }, h("h2", null, "Suggested further reading"), h("p", { class: "meta" }, "These essays were published after, or outside, the reviewed course. They are matched by topic automatically. They are suggestions only: they have not been reviewed for this course, and they do not change its lessons or checks."), h("ul", null, sug.map(a => h("li", null, h("a", { href: local(a.url) }, a.title), h("span", { class: "chip dash", style: "margin-left:8px" }, "Suggested, not reviewed"))))) : null,
    h("section", { class: "sec" }, h("h2", null, "Sources for this course"), srcList(c.sources)),
    h("div", { class: "row", style: "margin-top:30px" }, bookmarkBtn("course:" + c.id, "Save course to Reading Desk"), h("a", { class: "btn", href: url.inquiry(c.question), target: "_blank", rel: "noopener" }, "Investigate this further →")));
}
function conn(t, items) { return items.length ? h("div", null, h("h3", null, t), h("ul", null, items.map(([x, u]) => h("li", null, h("a", { href: u, target: "_blank", rel: "noopener" }, x))))) : null; }
function bookmarkBtn(k, label) {
  const b = h("button", { class: "btn sm", type: "button", "aria-pressed": String(deskHas(k)) }, deskHas(k) ? "On Reading Desk" : label);
  b.addEventListener("click", () => { const on = deskToggle(k); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "On Reading Desk" : label; say(on ? "Saved to your Reading Desk in this browser." : "Removed from your Reading Desk."); }); return b;
}
function planned(c) {
  mount("library", h("p", { class: "crumbs" }, h("a", { href: "#library" }, "Learning pathways"), " / ", "Course " + c.n), h("p", { class: "kicker" }, "Course " + c.n + " · " + c.level + " · Planned"), h("h1", { style: "font-size:clamp(30px,5vw,52px)" }, c.title), h("blockquote", { class: "q" }, c.question),
    h("div", { class: "notice2" }, "This course is planned. Its material has not been written or reviewed, so it cannot be studied yet."),
    h("section", { class: "sec" }, h("h2", null, "Planned modules"), h("ol", null, c.modules.map(m => h("li", null, m)))),
    h("section", { class: "sec" }, h("h2", null, "Start somewhere real"), h("p", null, "These courses are open now:"), h("div", { class: "cards" }, published().map(courseCard))));
}
function notFound() { mount("", h("div", { class: "panel" }, h("h2", null, "That page is not part of the Institute"), h("p", null, "The course or lesson was not found."), h("a", { class: "btn", href: "#library" }, "Browse pathways"))); }

/* ---------- lesson ---------- */
const SECT = [["A", "Introduction"], ["B", "Learning objectives"], ["C", "Core material"], ["D", "Essential concepts"], ["E", "Interactive exploration"], ["F", "Research connections"], ["G", "Reflection"], ["H", "Knowledge check"], ["I", "Further reading"], ["J", "Continue learning"]];
function lessonPage(id) {
  const l = lesson(id); if (!l) return notFound(); const c = course(l.courseId);
  document.title = l.title + " · " + c.title + " · The Learning Institute";
  const s = P(); s.last = { c: c.id, l: l.id, ts: Date.now() }; if (!s.started[c.id]) s.started[c.id] = Date.now();
  const revised = s.ver[l.id] && s.ver[l.id] !== l.version; save(s);
  CITES = [];
  const sec = (k, body) => { const [lt, name] = SECT.find(x => x[0] === k); return h("section", { id: "sec-" + lt, "aria-labelledby": "h-" + lt }, h("h2", { class: "sh", id: "h-" + lt, tabindex: "-1" }, h("b", null, lt), name), body); };
  const prose = h("div", { class: "prose" }, l.sections.map(x => [h("h3", null, x.h), x.p.map(p => h("p", null, rich(p)))]));
  const intro = h("div", { class: "prose" }, h("p", null, rich(l.intro)));
  const pr = courseProgress(c), A = l.activity, ass = D.assessments.filter(a => a.lessonId === l.id), chk = ass.filter(a => a.type !== "reflect"), rf = ass.find(a => a.type === "reflect");
  const rec = (kind, ok, sel) => { const t = P(); t.checks[kind] = { ok, sel, ts: Date.now() }; save(t); };
  const act = h("div", { class: "act" }, h("h3", null, A.title), h("p", { class: "pr" }, A.prompt), activityNode(A, l.id));
  const body = h("div", { class: "lesson" },
    h("p", { class: "crumbs" }, h("a", { href: "#library" }, "Learning pathways"), " / ", h("a", { href: "#course-" + c.id }, c.title), " / Lesson " + l.n),
    h("p", { class: "kicker" }, "Course " + c.n + " · Lesson " + l.n + " of " + c.lessonCount + " · " + l.minutes + " min"), h("h1", null, l.title),
    h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pr.pct), "aria-label": "Course progress" }, h("i", { style: "width:" + pr.pct + "%" })),
    revised ? h("div", { class: "notice2" }, "This lesson was revised since you completed it (version " + s.ver[l.id] + " to " + l.version + "). Your progress and saved answers have been kept.") : null,
    sec("A", intro),
    sec("B", [h("p", { class: "meta" }, "By the end of this lesson you should be able to:"), h("ul", { class: "objs" }, l.objectives.map(o => h("li", null, o)))]),
    sec("C", [prose, (l.misconceptions || []).length ? h("div", { class: "openq", style: "border-color:#39423f;background:var(--panel)" }, h("b", { style: "color:var(--mint)" }, "Common misunderstandings"), h("ul", { class: "objs", style: "margin-top:8px" }, l.misconceptions.map(m => h("li", null, h("i", null, "“" + m.wrong + "” "), m.right)))) : null]),
    sec("D", [h("p", { class: "meta" }, "Select a term for a short definition without leaving the lesson."), h("div", null, l.concepts.map(k => h("span", { style: "margin-right:8px;display:inline-block" }, termBtn("lex", k, (LEX[k] || { term: k }).term)))), h("p", { class: "meta" }, "Definitions come from the Lexicon of Intelligence so that they do not conflict across courses.")]),
    sec("E", act),
    sec("F", relPanel(l)),
    sec("G", reflectNode(l, rf)),
    sec("H", h("div", null, h("p", { class: "meta" }, "Optional. These check what the lesson explained. Feedback is given for every answer, nothing is graded, and you can try again."), chk.map(a => checkNode(a, rec)))),
    sec("I", furtherReading(l)),
    sec("J", ending(l, c)));
  const outline = h("nav", { class: "outline", "aria-label": "In this lesson" }, h("details", { class: "m" }, h("summary", null, "In this lesson"), outlineList()), h("div", { class: "d" }, outlineList()));
  mount("library", h("div", { class: "reader" }, outline, body));
  const spy = () => { let cur = "A"; SECT.forEach(([k]) => { const e = document.getElementById("sec-" + k); if (e && e.getBoundingClientRect().top < 140) cur = k; }); document.querySelectorAll(".outline a").forEach(a => a.toggleAttribute("aria-current", a.dataset.k === cur)); };
  window.onscroll = spy; spy();
}
function outlineList() { return h("ol", null, SECT.map(([k, t]) => h("li", null, h("a", { href: "#sec-" + k, "data-k": k, onclick: e => { e.preventDefault(); const t2 = document.getElementById("h-" + k); t2.scrollIntoView({ block: "start" }); t2.focus({ preventScroll: true }); } }, k + ". " + t)))); }
function activityNode(A, lid) {
  const seed = lid;
  switch (A.type) {
    case "match": return LI.match(A.pairs, A.extra, seed, null);
    case "steps": return LI.steps(A.steps);
    case "claims": return LI.claims({ claim: A.claim, options: A.options }, seed, null);
    case "order": return LI.order(A.items, seed);
    case "fit": return LI.fit(); case "neuron": return LI.neuron(); case "bigram": return LI.bigram();
  }
  return h("p", null, "Activity unavailable.");
}
function relPanel(l) {
  const cn = l.connections;
  const items = [
    ["Theory Chamber", (cn.theories || []).map(t => [title("theory", t), url.theory(t)]).concat((cn.comparisons || []).map(x => [title("cmp", x) + " (interactive comparison)", url.cmp(x)]))],
    ["Unanswered Archive", (cn.questions || []).map(q => [q + ": " + title("q", q), url.q(q)])],
    ["Research Atlas", (cn.atlas || []).map(a => [a.replace(/-/g, " ") + " dossier", url.atlas(a)])],
    ["Museum of Human Memory", (cn.museum || []).map(r => [title("room", r), url.room(r)])],
    ["Published research", (cn.articles || []).map(a => [title("art", a.replace(/^art:/, "")), (IDX.get(a) || {}).url || "#"])],
    ["Lexicon", (l.concepts || []).map(k => [(LEX[k] || { term: k }).term + " (full entry)", url.lex(k)])]];
  return h("div", null, h("p", { class: "meta" }, "These open in the rest of the archive. Links come from existing records, not from automatic matching."), h("div", { class: "conn2" }, items.map(([t, it]) => conn(t, it))));
}
function reflectNode(l, a) {
  const k = l.id + "-r", s = P(), ta = h("textarea", { class: "ta", id: "ta-" + k, "aria-label": "Your reflection", maxlength: "4000", placeholder: "Write here. This is saved only in your browser." }); ta.value = (s.refl[k] || {}).text || "";
  const pts = h("div"); const showPts = () => { pts.textContent = ""; pts.append(h("div", { class: "fb" }, h("b", null, "Discussion points to compare with your answer"), h("p", { class: "meta" }, "These are not a grade or a model answer. Strong responses vary."), h("ul", { class: "pts" }, l.reflection.points.map(p => h("li", null, p))))); };
  const savedMsg = h("span", { class: "meta", "aria-live": "polite" }, (s.refl[k] || {}).ts ? "Saved " + new Date(s.refl[k].ts).toLocaleDateString() : "");
  return h("div", { class: "refl" }, h("h3", null, "Reflection question"), h("p", null, h("i", null, l.reflection.prompt)), ta, h("div", { class: "row", style: "margin-top:10px" },
    h("button", { class: "btn sm primary", type: "button", onclick: () => { const t = P(); t.refl[k] = { text: ta.value.slice(0, 4000), ts: Date.now() }; save(t); savedMsg.textContent = "Saved just now. Stays in this browser."; showPts(); } }, "Save and see discussion points"), h("button", { class: "btn sm", type: "button", onclick: showPts }, "Show points without saving"), savedMsg), pts);
}
function checkNode(a, rec) {
  const out = h("div", { "aria-live": "polite" }), seed = a.id;
  const card = h("div", { class: "chk" }, h("p", { class: "kicker" }, a.kind), h("h3", { style: "font-size:19px" }, a.prompt));
  const prev = P().checks[a.id];
  if (a.type === "match") { card.append(LI.match(a.pairs, a.extra, seed, (ok, sel) => rec(a.id, ok, sel)), h("p", { class: "meta" }, a.explain)); return card; }
  const opts = shuffle(a.options, seed), multi = a.type === "ms", name = LI.nid("g"), ins = opts.map(o => { const i = h("input", { type: multi ? "checkbox" : "radio", name, id: LI.nid("o") }); return { o, i }; });
  card.append(h("fieldset", { style: "border:0;padding:0;margin:0" }, h("legend", { class: "sr" }, a.prompt), h("div", { class: "choice" }, ins.map(x => h("label", { for: x.i.id }, x.i, x.o.text)))),
    h("div", { class: "row" }, h("button", { class: "btn sm primary", type: "button", onclick: () => {
      const picked = ins.filter(x => x.i.checked); if (!picked.length) { out.textContent = ""; out.append(h("div", { class: "fb no" }, multi ? "Select at least one answer first." : "Choose an answer first.")); return; }
      const right = ins.every(x => x.i.checked === x.o.ok); rec(a.id, right, picked.map(x => x.o.id));
      out.textContent = ""; out.append(h("div", { class: "fb " + (right ? "ok" : "no") }, h("b", null, right ? "That is right. " : multi ? "Not quite. " : "Not quite. "), a.explain, h("ul", null, (multi ? ins : picked).map(x => h("li", null, h("b", null, (multi ? (x.i.checked ? "You selected: " : "Not selected: ") : "You chose: ") + x.o.text + " "), x.o.fb))), !right && !multi ? h("p", { class: "meta" }, "The best answer: " + a.options.find(o => o.ok).text) : null));
    } }, "Check answer"), h("button", { class: "btn sm", type: "button", onclick: () => { ins.forEach(x => x.i.checked = false); out.textContent = ""; } }, "Clear")), out);
  if (prev) card.append(h("p", { class: "meta" }, "Last time: " + (prev.ok ? "answered correctly." : "answered, not fully correct.") + " You can try again."));
  return card;
}
function furtherReading(l) {
  const cited = CITES.slice(), extra = l.reading.filter(r => !cited.includes(r));
  return h("div", null, cited.length ? [h("p", { class: "meta" }, "Cited in this lesson"), srcList(cited, 1)] : null, extra.length ? [h("p", { class: "meta" }, "Also recommended"), srcList(extra)] : null,
    h("p", { class: "meta" }, "Each record says how it was checked. A preprint has not been through formal peer review. A source is cited for what it says, and listing it is not a claim that it settles a question."));
}
/* The Listening Room: a lesson shows a recording only when a released recording lists the lesson among its related
   resources. Nothing is shown for unreleased audio, and listening progress is kept separately from lesson progress. */
let LRP = null;
function listenData() {
  if (!LRP) {
    const g = u => fetch(ROOT + u, { cache: "no-cache" }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }));
    LRP = Promise.all([g("listening-room/data/audio-library.json"), g("listening-room/data/audio-queue.json"), g("listening-room/data/audio-relations.json")]).then(([lib, q, rel]) => {
      const qs = new Map(q.items.filter(i => i.recordingId).map(i => [i.recordingId, i.status]));
      return lib.items.filter(r => { const st = qs.get(r.id) || r.status; return (st === "published" || st === "revision-required") && !!r.releaseDate; })
        .map(r => ({ rec: r, lessons: ((rel.items.find(x => x.recordingId === r.id) || { resources: {} }).resources.lessons) || [] }));
    });
  }
  return LRP;
}
function fillListen(slot, lessonId) {
  listenData().then(list => {
    const m = list.filter(x => x.lessons.includes("lesson:" + lessonId));
    if (!m.length) return;
    slot.append(h("div", { class: "cont" }, h("p", { class: "meta" }, "Listen"), m.map(x => h("p", null, h("a", { href: ROOT + "listening-room/#listen-" + encodeURIComponent(x.rec.id) }, x.rec.title + " (audio essay) →"), " A recording that discusses ideas from this lesson. Your lesson progress and your listening progress are kept separately."))));
  });
}
function ending(l, c) {
  const slot = h("div", { class: "listen-slot" }); fillListen(slot, l.id);
  const s = P(), done = !!s.done[l.id], nx = l.next && lesson(l.next), pv = l.prev && lesson(l.prev);
  const btn = h("button", { class: "btn" + (done ? "" : " primary"), type: "button", "aria-pressed": String(done) }, done ? "Completed. Mark as not complete" : "Mark this lesson complete");
  btn.addEventListener("click", () => { const t = P(); if (t.done[l.id]) { delete t.done[l.id]; delete t.ver[l.id]; } else { t.done[l.id] = Date.now(); t.ver[l.id] = l.version; } save(t); lessonPage(l.id); say(t.done[l.id] ? "Lesson marked complete." : "Lesson marked not complete."); });
  const all = c.lessons.every(x => P().done[x]);
  return h("div", null, slot, h("div", { class: "openq" }, h("b", null, "Open question"), h("p", null, l.openQuestion.text), h("a", { class: "btn sm", href: url.q(l.openQuestion.id), target: "_blank", rel: "noopener" }, "Explore it in the Unanswered Archive →"), h("p", { class: "meta", style: "margin:10px 0 0" }, "The Archive keeps this question open. Nothing in this lesson resolves it.")),
    h("div", { class: "row" }, btn, h("a", { class: "btn", href: url.inquiry(l.investigate), target: "_blank", rel: "noopener" }, "Investigate This Further →"), bookmarkBtn("lesson:" + l.id, "Save lesson to Reading Desk")),
    all ? h("div", { class: "cont" }, h("p", null, "You have marked every lesson in this course complete."), h("a", { class: "btn primary", href: "#record-" + c.id }, "View your completion record")) : null,
    h("div", { class: "lessonnav" }, pv ? h("a", { class: "btn", href: "#lesson-" + pv.id }, "← " + pv.title) : h("a", { class: "btn", href: "#course-" + c.id }, "← Course overview"), nx ? h("a", { class: "btn primary", href: "#lesson-" + nx.id }, "Next: " + nx.title + " →") : h("a", { class: "btn primary", href: "#course-" + c.id }, "Back to the course →")));
}

/* ---------- Learning Compass ---------- */
function compass() {
  document.title = "Learning Compass · The Learning Institute";
  const Cm = D.pathways.compass, saved = P().compass; const ans = Object.assign({}, saved && saved.answers);
  const res = h("div", { "aria-live": "polite" });
  const form = h("form", { class: "compass", onsubmit: e => { e.preventDefault(); show(); } }, Cm.questions.map(q => h("fieldset", null, h("legend", null, q.text), q.opts.map(o => { const id = LI.nid("cp"); return h("label", { class: "opt", for: id }, h("input", { type: "radio", name: q.id, id, value: o[0], checked: ans[q.id] === o[0] ? "" : null, onchange: () => ans[q.id] = o[0] }), o[1]); }))),
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit" }, "Suggest where to begin"), h("a", { class: "btn", href: "#course-C001" }, "Skip the Compass")));
  function recommend(a) {
    const out = [], push = (id, why) => { if (!out.find(x => x.id === id)) out.push({ id, why: [why] }); else out.find(x => x.id === id).why.push(why); };
    const aiNew = a.ai === "new", conNew = a.neuro === "new", g = a.goal;
    if (g === "consciousness") { push("C001", "You want to understand what consciousness is, and this course defines it and the main ways it is studied."); if (a.depth === "deep" && a.methods === "good") push("C007", "You want depth and are comfortable with how studies work. This course is planned and not yet available."); }
    if (g === "ai") { push("C002", "You want to understand how AI works, and this course covers learning, neural networks, language models and evaluation."); }
    if (g === "machine") {
      if (aiNew) { push("C002", "You are new to AI, so the foundations of how these systems work come first."); push("C001", "Then definitions of consciousness, so that questions about machines are clear about what is being asked."); }
      else { push("C001", "You know some AI, so start with what consciousness is and how it is studied."); push("C002", "Then fill in how AI systems are built and evaluated. Its last lessons meet the machine-consciousness question directly."); }
      push("S001", "When both are done, the Research Seminar works through the primary sources on this exact question.");
    }
    if (g === "memory") { push("C001", "Memory and awareness overlap, and this course is the nearest available. Its lessons on perception and attention introduce how experience is studied."); push("C005", "This course on memory, identity and the digital self is planned and not yet available. The Museum of Human Memory is open now."); }
    if (g === "ethics") { push("C002", "Its final lesson covers limitations, risks and risk management, and the earlier lessons explain what the systems are."); push("C008", "A full course on AI ethics is planned and not yet available."); }
    if (a.phil === "high" && g !== "consciousness") push("C001", "You are interested in philosophy, and this course introduces the philosophical side of consciousness as well as the scientific.");
    if (a.neuro === "good" && a.ai === "good" && !out.some(x => x.id === "S001")) push("S001", "You already know the background, so the Research Seminar may suit you.");
    if (!out.length) push("C001", "A good place to begin.");
    if (a.depth === "intro") out.forEach(o => { if (o.id.startsWith("C00") && course(o.id) && course(o.id).status === "published") o.why.push("You asked for a clear introduction, and this course is at Foundations level."); });
    return out;
  }
  function show() {
    const need = Cm.questions.filter(q => !ans[q.id]); res.textContent = "";
    if (need.length) { res.append(h("div", { class: "fb no" }, "You have not answered " + need.length + " question" + (need.length > 1 ? "s" : "") + ". You can answer them all, or skip the Compass and choose a course yourself.")); }
    const r = recommend(ans);
    res.append(h("h2", null, "Suggested order"), ...r.map((x, i) => { const c = x.id === "S001" ? { title: "Research Seminar: " + D.seminars[0].title, status: "published", level: "Advanced" } : course(x.id), pl = c.status !== "published"; return h("div", { class: "rec" + (pl ? " pl" : "") }, h("p", { class: "meta", style: "margin:0" }, (i + 1) + ". " + (pl ? "Planned, not yet available" : c.level)), h("h3", { style: "margin:2px 0 4px" }, pl ? c.title : h("a", { href: x.id === "S001" ? "#seminar" : "#course-" + x.id }, c.title)), x.why.map(w => h("p", { class: "why" }, w))); }),
      h("p", { class: "meta" }, "Each suggestion is based only on your answers and the course descriptions. It is not a measure of ability."),
      h("div", { class: "row" }, h("button", { class: "btn sm", type: "button", onclick: () => { const t = P(); t.compass = { answers: ans, ts: Date.now() }; save(t); toast("Your answers are saved in this browser."); } }, "Remember my answers in this browser"), h("button", { class: "btn sm", type: "button", onclick: () => { const t = P(); t.compass = null; save(t); toast("Saved Compass answers deleted."); } }, "Forget saved answers")));
  }
  mount("compass", h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "The Learning Compass"), h("p", { class: "lede" }, Cm.intro), form, res);
  if (saved) show();
}

/* ---------- Journey map ---------- */
const POS = { C003: [110, 70], C001: [110, 160], C002: [110, 250], C008: [110, 340], C004: [390, 110], C005: [390, 300], C006: [640, 205], C007: [850, 110] };
function journey() {
  document.title = "Learning Journey Map · The Learning Institute";
  const ED = D.pathways.edges, mapView = h("div"), listView = h("div");
  const svg = sv("svg", { class: "map", viewBox: "0 0 960 400", role: "group", "aria-label": "Map of courses and how they relate. A list version is available." });
  ED.forEach(e => { const a = POS[e.a], b = POS[e.b]; if (!a || !b) return; svg.append(sv("line", { x1: a[0] + 70, y1: a[1], x2: b[0] - 70, y2: b[1], stroke: e.type === "prerequisite" ? "#8fe9c4" : e.type === "recommended" ? "#b9c2c4" : "#6f7875", "stroke-width": e.type === "prerequisite" ? 3 : 1.6, "stroke-dasharray": e.type === "related" ? "5 5" : "none", opacity: .85 })); });
  D.courses.forEach(c => { const p = POS[c.id]; if (!p) return; const pl = c.status !== "published"; const a = sv("a", { href: "#course-" + c.id, "aria-label": c.title + (pl ? ", planned" : ", available") }); a.append(sv("g", { class: "nd" + (pl ? " pl" : "") }, sv("rect", { x: p[0] - 70, y: p[1] - 24, width: 140, height: 48, rx: 4, fill: "#0d1210" }), sv("text", { x: p[0], y: p[1] - 3, "text-anchor": "middle" }, clip(c.title, 21)), sv("text", { x: p[0], y: p[1] + 14, "text-anchor": "middle", "font-size": 11, fill: "#9aa3a0" }, "Course " + c.n + (pl ? " · planned" : ""))));
    svg.append(a); });
  mapView.append(svg, h("div", { class: "legend" }, h("span", null, "━ Prerequisite: the later course depends on it"), h("span", null, "─ Recommended first"), h("span", null, "┄ Related"), h("span", null, "Dashed boxes are planned, not available")));
  const rows = D.courses.map(c => { const into = ED.filter(e => e.b === c.id), out = ED.filter(e => e.a === c.id); return h("li", { style: "margin:14px 0" }, h("b", null, h("a", { href: "#course-" + c.id }, c.title)), " · ", c.level, c.status !== "published" ? " · planned" : "", into.length ? h("div", { class: "meta" }, "Leads from: ", into.map(e => course(e.a).title + " (" + e.type + ")").join("; ")) : null, out.length ? h("div", { class: "meta" }, "Leads to: ", out.map(e => course(e.b).title + " (" + e.type + ")").join("; ")) : null); });
  listView.append(h("ul", { class: "plain", style: "list-style:none;padding:0" }, rows), h("h3", null, "Why the links exist"), h("ul", null, ED.map(e => h("li", null, h("b", null, course(e.a).title + " → " + course(e.b).title + " (" + e.type + "). "), e.why))));
  let view = window.innerWidth < 720 ? "list" : "map"; const holder = h("div");
  const set = v => { view = v; holder.textContent = ""; holder.append(v === "map" ? mapView : listView); $("#bm").setAttribute("aria-pressed", String(v === "map")); $("#bl").setAttribute("aria-pressed", String(v === "list")); };
  mount("map", h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "Learning Journey Map"), h("p", { class: "lede" }, "How the courses connect. Only one link is a true prerequisite. Everything else is a recommendation, so you can explore freely."),
    h("div", { class: "row" }, h("button", { id: "bm", class: "btn sm", type: "button", onclick: () => set("map") }, "Map view"), h("button", { id: "bl", class: "btn sm", type: "button", onclick: () => set("list") }, "List view")), holder);
  set(view);
}

/* ---------- Research seminar ---------- */
function seminar() {
  const S = D.seminars[0]; document.title = S.title + " · Research Seminar";
  const s = P(), mk = (st) => { const done = !!s.sem.done[st.id]; const box = h("input", { type: "checkbox", id: "sd-" + st.id, checked: done ? "" : null, onchange: e => { const t = P(); if (e.target.checked) t.sem.done[st.id] = Date.now(); else delete t.sem.done[st.id]; save(t); box.closest(".stage").classList.toggle("done", e.target.checked); } });
    const refl = st.reflect ? (() => { const ta = h("textarea", { class: "ta", "aria-label": "Your response", maxlength: "4000" }); ta.value = s.sem.refl[st.id] || ""; return h("div", null, ta, h("button", { class: "btn sm", type: "button", style: "margin-top:8px", onclick: () => { const t = P(); t.sem.refl[st.id] = ta.value.slice(0, 4000); save(t); toast("Saved in this browser."); } }, "Save response")); })() : null;
    const links = (st.links || []).map(([k, v]) => k === "q" ? [v + ": " + title("q", v), url.q(v)] : k === "lex" ? [(LEX[v] || { term: v }).term + " in the Lexicon", url.lex(v)] : k === "cmp" ? [title("cmp", v), url.cmp(v)] : ["Research Observatory", url.obs()]);
    return h("div", { class: "stage" + (done ? " done" : "") }, h("h3", null, st.title), st.body.map(p => h("p", null, p)), h("p", null, h("b", null, "Task: "), st.task), refl, links.length ? h("div", { class: "row" }, links.map(([t, u]) => h("a", { class: "btn sm", href: u, target: "_blank", rel: "noopener" }, t + " ↗"))) : null,
      st.sources ? [h("p", { class: "meta", style: "margin-top:12px" }, "Sources for this stage"), srcList(st.sources, null, "sem-" + st.id + "-")] : null, h("label", { class: "opt", for: "sd-" + st.id }, box, "I have worked through this stage")); };
  mount("seminar", h("p", { class: "kicker" }, "Research Seminar · " + S.level), h("h1", { style: "font-size:clamp(30px,5vw,50px)" }, S.title), h("blockquote", { class: "q" }, S.question), h("div", { class: "notice2" }, S.note),
    h("p", { class: "meta" }, "Recommended before starting: " + S.prerequisites.map(i => course(i).title).join(" and ") + ". This is advice, not a requirement."), h("h2", { class: "sr" }, "Stages"), S.stages.map(mk));
}

/* ---------- progress, records, privacy ---------- */
function recordText(c) {
  const s = P(), ls = lessonsOf(c), dts = ls.map(l => s.done[l.id]).filter(Boolean); const date = dts.length ? new Date(Math.max(...dts)).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "not recorded";
  return ["INFORMAL COMPLETION RECORD", "", "This is a personal record made in your own browser. It is not a certificate or credential. The Learning Institute is not accredited and its courses carry no academic credit, professional certification or continuing education credit. Nothing here has been independently verified.", "", "Course: " + c.title + " (Course " + c.n + ", version " + c.version + ")", "Level: " + c.level, "Lessons marked complete: " + ls.filter(l => s.done[l.id]).length + " of " + ls.length, "Date of last completion: " + date, "", "Lessons:", ...ls.map(l => " - " + l.n + ". " + l.title + (s.done[l.id] ? "" : " (not complete)")), "", "Learning objectives of the course:", ...c.objectives.map(o => " - " + o), "", "Objectives are listed as the course's aims. Completion records which lessons you chose to mark complete, not what you have mastered."].join("\n");
}
function record(id) {
  const c = course(id); if (!c || c.status !== "published") return notFound(); const txt = recordText(c), s = P(), all = c.lessons.every(x => s.done[x]);
  mount("progress", h("p", { class: "crumbs" }, h("a", { href: "#progress" }, "My learning"), " / Completion record"), h("h1", { style: "font-size:clamp(28px,4.4vw,44px)" }, "Informal completion record"),
    !all ? h("div", { class: "notice2" }, "Not every lesson in this course is marked complete yet, so this record shows your progress so far.") : null, h("div", { class: "recordbox" }, txt),
    h("div", { class: "row noprint", style: "margin-top:16px" }, h("button", { class: "btn primary", type: "button", onclick: () => { const u = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); const a = h("a", { href: u, download: "learning-record-" + c.slug + ".txt" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); } }, "Download as text"), h("button", { class: "btn", type: "button", onclick: () => window.print() }, "Print"), h("a", { class: "btn", href: "#progress" }, "Back")));
}
let CONFIRM = false;
function progress() {
  document.title = "My learning · The Learning Institute"; const s = P();
  const started = published().filter(c => s.started[c.id]);
  const refl = Object.entries(s.refl).map(([k, v]) => { const lid = k.replace(/-r$/, ""), l = lesson(lid); return l ? { l, v } : null; }).filter(Boolean);
  const checkIds = Object.keys(s.checks), okN = checkIds.filter(k => s.checks[k].ok).length;
  const desk = deskRead().items.filter(x => /^(lesson|course):/.test(x.k));
  mount("progress", h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "My learning"),
    h("div", { class: "notice2" }, "Everything on this page is stored only in this browser on this device. It does not sync to other devices, and clearing your browser data removes it. No account is used and nothing is sent to a server."),
    s.last ? continueCard() : h("p", { class: "lede" }, "You have not started a course yet. ", h("a", { href: "#library" }, "Browse the pathways"), "."),
    h("div", { class: "facts" }, [[String(started.length), "Courses started"], [String(Object.keys(s.done).length), "Lessons completed"], [String(checkIds.length), "Checks answered"], [String(okN), "Answered correctly (latest)"], [String(refl.length), "Saved reflections"], [String(desk.length), "On Reading Desk"]].map(([b, sp]) => h("div", null, h("b", null, b), h("span", null, sp)))),
    started.length ? h("section", { class: "sec" }, h("h2", null, "Courses"), h("div", { class: "cards" }, started.map(courseCard))) : null,
    started.filter(c => courseProgress(c).n).length ? h("section", { class: "sec" }, h("h2", null, "Completion records"), h("p", { class: "meta" }, "Informal summaries you can keep. They are not certificates."), h("div", { class: "row" }, started.filter(c => courseProgress(c).n).map(c => h("a", { class: "btn", href: "#record-" + c.id }, c.title)))) : null,
    h("section", { class: "sec" }, h("h2", null, "Saved reflections"), refl.length ? [h("ul", null, refl.map(r => h("li", { style: "margin:12px 0" }, h("a", { href: "#lesson-" + r.l.id }, r.l.title), h("div", { class: "meta" }, new Date(r.v.ts).toLocaleDateString()), h("div", null, clip(r.v.text || "(empty)", 280))))), h("button", { class: "btn sm", type: "button", onclick: () => { const txt = refl.map(r => r.l.title + "\n" + (r.v.text || "") + "\n").join("\n"); const u = URL.createObjectURL(new Blob([txt], { type: "text/plain" })); const a = h("a", { href: u, download: "my-reflections.txt" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); } }, "Download my reflections")] : h("p", { class: "meta" }, "Reflections you save in lessons appear here.")),
    h("section", { class: "sec" }, h("h2", null, "Bookmarked resources"), desk.length ? h("ul", null, desk.map(x => { const id = x.k.split(":")[1]; const l = x.k.startsWith("lesson:") ? lesson(id) : null, c = x.k.startsWith("course:") ? course(id) : null; return h("li", null, l ? h("a", { href: "#lesson-" + id }, l.title) : c ? h("a", { href: "#course-" + id }, c.title) : x.k); })) : h("p", { class: "meta" }, "Lessons and courses you save appear here and in your Reading Desk.")),
    h("section", { class: "sec" }, h("h2", null, "Delete my learning data"), h("p", null, "This removes your progress, answers, reflections and Compass answers from this browser. It does not touch your Reading Desk or anything else on the site."), CONFIRM ? h("div", { class: "fb no" }, h("p", null, "This cannot be undone. Delete all Learning Institute data in this browser?"), h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: () => { LS.del(KEY); CONFIRM = false; toast("Learning data deleted."); progress(); } }, "Yes, delete it"), h("button", { class: "btn", type: "button", onclick: () => { CONFIRM = false; progress(); } }, "Cancel"))) : h("button", { class: "btn", type: "button", onclick: () => { CONFIRM = true; progress(); } }, "Delete my learning data…"),
      desk.length ? h("p", { style: "margin-top:16px" }, h("button", { class: "btn sm", type: "button", onclick: () => { const o = deskRead(); LS.set(DESK, Object.assign({}, o, { items: o.items.filter(x => !/^(lesson|course):/.test(x.k)) })); toast("Learning Institute items removed from your Reading Desk."); progress(); } }, "Remove only the Institute items from my Reading Desk")) : null));
}
function how() {
  document.title = "How the Institute works"; const L = D.lessons.length, A = D.assessments.length;
  mount("how", h("h1", { style: "font-size:clamp(30px,5vw,48px)" }, "How the Institute works"),
    h("section", { class: "sec" }, h("h2", null, "What is here today"), h("p", null, "Two complete foundational courses (" + L + " lessons and " + A + " knowledge checks), a Research Seminar, the Learning Compass and the Journey Map. Six further courses are planned and are labelled as such. Planned courses are not offered, indexed for search or linked as learning resources.")),
    h("section", { class: "sec" }, h("h2", null, "Standards"), h("ul", null,
      ["Every lesson states measurable learning objectives.", "Explanations are original writing. They cite sources and do not reproduce textbooks or articles.", "Sources come from records already checked on this site, or were checked for this course. Each record says how it was checked and whether it is a preprint.", "Contested questions are presented as contested. Open questions link to the Unanswered Archive.", "Statements by AI systems about their own mental states are never treated as scientific evidence.", "Knowledge checks test what each lesson explained. Reflections show discussion points and are never graded.", "Every course carries a version, a last-reviewed date and a review status. Current status: awaiting editorial review."].map(t => h("li", null, t)))),
    h("section", { class: "sec" }, h("h2", null, "Review and revisions"), h("p", null, "New research does not rewrite approved lessons. Essays published later appear only as clearly labelled suggestions for further reading. Changes to lessons or checks require editorial approval and a new version number. If a lesson is revised after you complete it, your progress and answers are kept and you are told."), h("p", null, "Planned review work: a named reviewer's sign-off for each course. Until then, courses are labelled as awaiting editorial review.")),
    h("section", { class: "sec" }, h("h2", null, "Credentials"), h("p", null, "The Learning Institute is not accredited. Completion records are informal personal summaries. They are not certificates and carry no academic credit, professional certification or continuing education credit.")),
    h("section", { class: "sec" }, h("h2", null, "Privacy"), h("p", null, "No account is needed. Progress, answers, reflections and Compass answers are stored in your browser only. Nothing you enter is sent to a server. Progress does not sync between devices. You can export your reflections and delete everything from the My learning page. Your Reading Desk is separate and is never overwritten.")),
    h("section", { class: "sec" }, h("h2", null, "Administration"), h("p", null, "Content is maintained as structured data files in the site repository and published through GitHub. Managing courses through the Architect backend would need a secure backend integration, and nothing in the Institute asks for or exposes Architect credentials.")));
}

/* ---------- routing ---------- */
function route() {
  window.onscroll = null; const hs = (location.hash || "#").slice(1); let m;
  if (hs.startsWith("sec-")) return;
  if (!hs) return home(); if (hs === "library") return library(); if (hs === "map") return journey(); if (hs === "compass") return compass(); if (hs === "seminar") return seminar(); if (hs === "progress") return progress(); if (hs === "how") return how();
  if ((m = hs.match(/^course-(C\d{3})$/))) return course_(m[1]); if ((m = hs.match(/^lesson-(C\d{3}-L\d{2})$/))) return lessonPage(m[1]); if ((m = hs.match(/^record-(C\d{3})$/))) return record(m[1]);
  notFound();
}
async function load() {
  const j = f => fetch("data/" + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const [c, l, a, s, g, p, sm] = await Promise.all(["courses", "lessons", "assessments", "sources", "glossary", "learning-pathways", "seminars"].map(n => j(n + ".json")));
  D.courses = c.items.filter(x => x.status === "published" || x.status === "planned"); D.lessons = l.items.filter(x => { const co = c.items.find(y => y.id === x.courseId); return co && co.status === "published"; });
  D.assessments = a.items; D.sources = s.items; D.sourcesById = Object.fromEntries(s.items.map(x => [x.id, x])); D.glossary = g.items; D.pathways = p; D.seminars = sm.items;
  const opt = async (u, f) => { try { const r = await fetch(u); if (r.ok) f(await r.json()); } catch (e) {} };
  await Promise.all([opt(ROOT + "lexicon/data/concepts.json", d => d.items.forEach(x => LEX[x.id] = x)), opt(ROOT + "inquiry-engine/data/research-index.json", d => d.resources.forEach(r => IDX.set(r.id, r))), opt(ROOT + "research/published/manifest.json", d => MANIFEST = d.articles || [])]);
}
(async function () {
  try { await load(); } catch (e) { $("#app").textContent = ""; $("#app").append(h("div", { class: "panel" }, h("h2", null, "The Institute could not load its curriculum"), h("p", null, "Please reload the page. Nothing on the site has been changed."))); return; }
  siteNav(); addEventListener("hashchange", route); route();
})();
