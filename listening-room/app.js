"use strict";
/* The Listening Room: core application (data, routing, library, how-it-works).
   Text from data files is inserted with textContent only. External links must be https. */
(function (root) {
  var U = root.LRU, S = root.LRS;
  var h = U.h, fmt = U.fmt, safeHref = U.safeHref, clip = U.clip, fdate = U.fdate, enc = U.enc;
  var SITE = "https://amarisct.github.io/Artificially-Intelligent/";
  var SUBSTACK = "https://artificialxintelligence.substack.com/";
  var CFG = Object.assign({
    preview: false,                 // true only in the owner preview: lets recordings that are Awaiting Audio Review play
    siteRoot: "../",                // where the rest of the site lives, relative or absolute
    showPipeline: true,             // show each published article and the real status of its audio
    showProposedChapters: false,    // preview only: draft chapter titles that the author has not approved
    dataBase: "data/",
    audioBase: "",                  // prefix for relative audio paths; set only if the files live on another host
    indexUrl: "../inquiry-engine/data/research-index.json",
    lexiconUrl: "../lexicon/data/concepts.json",
    previewNote: ""
  }, root.LR_CONFIG || {});
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var D = { lib: null, queue: null, tr: null, ch: null, rel: null };
  var IDX = null, LEX = null, idxP = null, lexP = null, trP = null;
  var App = { CFG: CFG, D: D, SITE: SITE, SUBSTACK: SUBSTACK, views: {}, current: null };

  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  App.getJSON = getJSON;
  App.site = function (path) { var u = CFG.siteRoot + path; return u; };
  App.rebase = function (u) { if (!u) return "#"; if (u.indexOf(SITE) === 0) return CFG.siteRoot + u.slice(SITE.length); return safeHref(u); };
  App.loadIndex = function () {
    if (!idxP) idxP = getJSON(CFG.indexUrl).then(function (j) { IDX = new Map(j.resources.map(function (r) { return [r.id, r]; })); return IDX; }).catch(function () { IDX = null; idxP = null; return null; });
    return idxP;
  };
  App.loadLexicon = function () {
    if (!lexP) lexP = getJSON(CFG.lexiconUrl).then(function (j) { LEX = {}; j.items.forEach(function (i) { LEX[i.id] = i; }); return LEX; }).catch(function () { LEX = null; lexP = null; return null; });
    return lexP;
  };
  App.loadTranscripts = function () {
    if (!trP) trP = getJSON(CFG.dataBase + "audio-transcripts.json").then(function (j) { D.tr = {}; j.items.forEach(function (t) { D.tr[t.recordingId] = t; }); return D.tr; }).catch(function (e) { trP = null; throw e; });
    return trP;
  };
  App.idx = function () { return IDX; };
  App.lex = function () { return LEX; };

  /* ---------------- status and playability: always from records ---------------- */
  App.status = function (id) { return D.lib.meta.statuses.find(function (s) { return s.id === id; }) || { id: id, label: id }; };
  App.queueItem = function (rec) { return D.queue ? D.queue.items.find(function (i) { return i.recordingId === rec.id; }) : null; };
  App.effStatus = function (rec) { var q = App.queueItem(rec); return q ? q.status : rec.status; };
  App.playable = function (rec) {
    if (!rec.audio || !rec.audio.url) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(rec.audio.url) && !/^https:\/\//i.test(rec.audio.url)) return false; // audio must be a site-relative path or https
    var st = App.effStatus(rec);
    if (st === "published" || st === "revision-required") return !!rec.releaseDate; // a release date records the approval; a revised recording stays available, with a notice
    return CFG.preview && st === "awaiting-review";
  };
  App.cat = function (id) { return D.lib.meta.categories.find(function (c) { return c.id === id; }) || { id: id, label: id }; };
  App.series = function (id) { return D.lib.meta.series.find(function (c) { return c.id === id; }) || { id: id, title: id }; };
  App.rec = function (id) { return D.lib.items.find(function (r) { return r.id === id; }); };
  App.playables = function () { return D.lib.items.filter(App.playable); };
  /* A record's audio.url is relative to this directory (GitHub Pages) or an absolute https URL (object storage / CDN).
     CFG.audioBase can move every relative file to another host without editing the records. */
  App.audioUrl = function (rec) { var u = rec.audio.url; return /^https:\/\//i.test(u) ? u : (CFG.audioBase || "") + u; };

  App.badge = function (statusId) {
    var s = App.status(statusId);
    return h("span", { class: "badge st-" + s.id }, s.label);
  };
  App.narrationBadge = function (rec) {
    var t = D.lib.meta.narrationTypes.find(function (n) { return n.id === rec.narration.type; });
    return h("span", { class: "badge nar-" + rec.narration.type, title: rec.narration.disclosure }, t ? t.label : rec.narration.type);
  };

  /* ---------------- small UI services ---------------- */
  App.say = function (m) { var l = $("#live"); if (l) { l.textContent = ""; setTimeout(function () { l.textContent = m; }, 30); } };
  App.toast = function (m) { App.say(m); var t = h("div", { class: "toast", role: "status" }, m); document.body.append(t); setTimeout(function () { t.remove(); }, 2800); };
  App.storageNotice = function () {
    if (S.Store.ok) return null;
    return h("p", { class: "note warn", role: "note" }, "This browser is blocking storage, so your place, saved moments and preferences will not be kept after you leave this page. Listening works normally.");
  };

  var NAV = [["Atlas", "research-atlas/"], ["Theory Chamber", "theory-chamber/"], ["Unanswered Archive", "unanswered-archive/"], ["Observatory", "research-observatory/"], ["Museum", "museum/"], ["Lexicon", "lexicon/"], ["Inquiry Engine", "inquiry-engine/"], ["Search", "search/"], ["Learning Institute", "learning-institute/"]];
  function siteNav() {
    var n = $("#site"); n.textContent = "";
    NAV.forEach(function (x) { n.append(h("a", { href: App.site(x[1]) }, x[0])); });
    n.append(h("a", { href: "#", "aria-current": "page" }, "Listening Room"));
  }
  var TABS = [["", "Audio library"], ["journal", "My listening journal"], ["how", "How it works"]];
  function tabs(cur) {
    return h("nav", { class: "tabsrow", "aria-label": "Listening Room sections" }, TABS.map(function (t) { return h("a", { href: "#" + t[0], "aria-current": t[0] === cur ? "page" : null }, t[1]); }));
  }
  App.mount = function (cur, nodes, opts) {
    opts = opts || {};
    var a = $("#app"); a.textContent = "";
    if (CFG.preview) a.append(App.previewBanner());
    if (cur !== "listen") a.append(tabs(cur));
    var flat = function (n, out) { [].concat(n).forEach(function (x) { if (Array.isArray(x)) flat(x, out); else if (x != null && x !== false) out.push(x); }); return out; };
    a.append.apply(a, flat(nodes, []));
    var m = $("#main");
    if (!opts.keepScroll) { m.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  };
  App.previewBanner = function () {
    return h("div", { class: "preview-banner", role: "note" },
      h("b", null, "Preview. "), "These recordings use a synthetic demonstration voice from an open-source engine. They have not been reviewed or approved and nothing here is published. " + (CFG.previewNote || ""));
  };

  /* ---------------- library ---------------- */
  var F = { q: "", cat: "", series: "", sort: "new" };
  function continueItem() {
    var best = null, all = S.Store.allProgress();
    Object.keys(all).forEach(function (id) {
      var p = all[id], rec = App.rec(id);
      if (!rec || !App.playable(rec) || p.done || !(p.t > 5)) return;
      if (p.dur && p.t > p.dur - 8) return;
      if (!best || p.at > best.p.at) best = { rec: rec, p: p };
    });
    return best;
  }
  App.continueItem = continueItem;

  function heroArt() {
    var recs = App.playables().slice(0, 3);
    var svg = U.sv("svg", { viewBox: "0 0 1000 240", role: "img", "aria-label": "A quiet line drawing of the loudness of the available recordings", class: "hero-art", preserveAspectRatio: "none" });
    if (!recs.length) {
      svg.append(U.sv("line", { x1: 40, x2: 960, y1: 150, y2: 150, stroke: "currentColor", "stroke-opacity": .35, "stroke-width": 1 }));
      return svg;
    }
    recs.forEach(function (r, k) {
      var w = r.waveform, n = w.length, pts = [];
      for (var i = 0; i < n; i++) { var x = 40 + 920 * i / (n - 1), y = 70 + k * 52 - (w[i] / 100) * 38 * Math.pow(Math.sin(Math.PI * i / (n - 1)), .5); pts.push(x.toFixed(1) + "," + y.toFixed(1)); }
      svg.append(U.sv("polyline", { points: pts.join(" "), fill: "none", stroke: k === 0 ? "#8fe9c4" : "#b9c2c4", "stroke-opacity": k === 0 ? .9 : .4 - k * .08, "stroke-width": k === 0 ? 1.4 : 1, "stroke-linejoin": "round" }));
    });
    return svg;
  }

  function hero(cont) {
    return h("section", { class: "hero", "aria-labelledby": "h1" },
      h("div", { class: "hero-text" },
        h("p", { class: "kicker" }, "Artificially Intelligent · Human × Machine Learning"),
        h("h1", { id: "h1", class: "display" }, "THE LISTENING ROOM"),
        h("p", { class: "sub" }, "Research, reflection, and the ideas that remain with us."),
        h("p", { class: "lede" }, "Some questions cannot be resolved in a moment."),
        h("p", { class: "lede soft" }, "They require attention, reflection, and a willingness to remain with uncertainty."),
        h("p", { class: "body" }, "The Listening Room offers an auditory experience of the ideas explored throughout Artificially Intelligent, from consciousness and artificial intelligence to memory, identity, and the changing relationship between humanity and technology."),
        h("p", { class: "body" }, "Through narrated essays, curated dialogues, and research-based reflections, visitors are invited to listen more closely."),
        h("div", { class: "row actions" },
          h("a", { class: "btn primary", href: "#library", onclick: function (e) { e.preventDefault(); jump("lib-title"); } }, "Enter the Listening Room →"),
          h("a", { class: "btn", href: "#library", onclick: function (e) { e.preventDefault(); if (visibleCats().some(function (c) { return c.id === "narrated-research"; })) F.cat = "narrated-research"; renderResults(); syncChips(); jump("lib-title"); } }, "Explore Audio Essays →"),
          cont ? h("a", { class: "btn mint", href: "#listen-" + cont.rec.id + "-t" + Math.floor(cont.p.t) }, "Continue Listening →") : null)),
      h("div", { class: "hero-visual", "aria-hidden": "false" }, heroArt()));
  }
  function jump(id) { var e = document.getElementById(id); if (e) { e.scrollIntoView({ behavior: U.reducedMotion() ? "auto" : "smooth", block: "start" }); e.focus({ preventScroll: true }); } }

  function continueCard(c) {
    if (!c) return null;
    var pct = Math.round(100 * c.p.t / (c.p.dur || c.rec.audio.durationSec));
    return h("section", { class: "continue", "aria-labelledby": "cont-h" },
      h("h2", { id: "cont-h", class: "mini" }, "Continue Listening"),
      h("p", { class: "ct" }, h("i", null, c.rec.title)),
      h("p", { class: "meta" }, "Resume from " + fmt(c.p.t) + " of " + fmt(c.rec.audio.durationSec) + ". Saved in this browser."),
      h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": "How far you have listened" }, h("i", { style: "width:" + pct + "%" })),
      h("a", { class: "btn sm primary", href: "#listen-" + c.rec.id + "-t" + Math.floor(c.p.t) }, "Resume from " + fmt(c.p.t) + " →"));
  }

  function matchRec(rec, q) {
    if (!q) return { ok: true, hits: [] };
    var toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    var hay = [rec.title, rec.description, rec.label, App.cat(rec.category).label, rec.narration.narrator, rec.concepts.join(" "), rec.lexicon.join(" "), rec.series.map(function (s) { return App.series(s).title; }).join(" ")].join(" ").toLowerCase();
    var meta = toks.every(function (t) { return hay.indexOf(t) >= 0; });
    var hits = [];
    if (D.tr && D.tr[rec.id]) {
      var tr = D.tr[rec.id];
      tr.blocks.forEach(function (b) {
        if (!b.sentences) return;
        b.sentences.forEach(function (s) {
          var tx = b.text.slice(s[0], s[1]), low = tx.toLowerCase();
          if (toks.every(function (t) { return low.indexOf(t) >= 0; })) hits.push({ t: s[2], text: tx, kind: b.kind });
        });
      });
    }
    return { ok: meta || hits.length > 0, hits: hits.slice(0, 2), more: Math.max(0, hits.length - 2) };
  }

  function recCard(rec, m) {
    var prog = S.Store.progress(rec.id), ok = App.playable(rec);
    var pct = prog && prog.dur ? Math.min(100, Math.round(100 * prog.t / prog.dur)) : 0;
    var st = App.effStatus(rec);
    return h("article", { class: "rec", "aria-labelledby": "rt-" + rec.id },
      h("p", { class: "label" }, rec.label + " · " + App.cat(rec.category).label),
      h("h3", { id: "rt-" + rec.id }, h("a", { href: "#listen-" + rec.id }, rec.title)),
      h("div", { class: "chips" }, App.badge(st), App.narrationBadge(rec),
        prog && prog.done ? h("span", { class: "chip" }, "Listened") : null,
        rec.series.map(function (s) { return h("span", { class: "chip" }, App.series(s).title); })),
      h("p", { class: "desc" }, rec.description),
      h("dl", { class: "facts" },
        h("div", null, h("dt", null, "Length"), h("dd", null, fmt(rec.audio.durationSec), h("span", { class: "dim" }, " measured from the file"))),
        h("div", null, h("dt", null, "Essay published"), h("dd", null, fdate(rec.source.publishedAt))),
        h("div", null, h("dt", null, "Audio release"), h("dd", null, rec.releaseDate ? fdate(rec.releaseDate) : "Not released")),
        h("div", null, h("dt", null, "Voice"), h("dd", null, rec.narration.narrator)),
        h("div", null, h("dt", null, "Transcript"), h("dd", null, "Full text, synchronized by sentence"))),
      m && m.hits.length ? h("ul", { class: "hits", "aria-label": "Matches in the transcript" }, m.hits.map(function (x) { return h("li", null, h("a", { href: "#listen-" + rec.id + "-t" + Math.floor(x.t) }, fmt(x.t)), " “" + clip(x.text, 160) + "”"); }), m.more ? h("li", { class: "dim" }, "and " + m.more + " more in the transcript") : null) : null,
      pct ? h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": "Your progress in " + rec.title }, h("i", { style: "width:" + pct + "%" })) : null,
      h("div", { class: "row" },
        ok ? h("a", { class: "btn sm primary", href: "#listen-" + rec.id }, pct && !(prog && prog.done) ? "Resume →" : "Listen →") : h("span", { class: "btn sm", "aria-disabled": "true" }, "Not yet playable"),
        h("a", { class: "btn sm", href: App.rebase(rec.source.url) }, "Read the essay →")));
  }

  function visibleCats() {
    var ids = {}; App.playables().forEach(function (r) { ids[r.category] = true; });
    return D.lib.meta.categories.filter(function (c) { return ids[c.id]; });
  }
  function visibleSeries() {
    var ids = {}; App.playables().forEach(function (r) { r.series.forEach(function (s) { ids[s] = true; }); });
    return D.lib.meta.series.filter(function (c) { return ids[c.id]; });
  }

  var resultsEl = null, chipsEl = null;
  function renderResults() {
    if (!resultsEl) return;
    var list = App.playables().map(function (r) { return [r, matchRec(r, F.q)]; }).filter(function (x) { return x[1].ok && (!F.cat || x[0].category === F.cat) && (!F.series || x[0].series.indexOf(F.series) >= 0); });
    var cmp = { new: function (a, b) { return b[0].source.publishedAt.localeCompare(a[0].source.publishedAt) || a[0].id.localeCompare(b[0].id); },
      short: function (a, b) { return a[0].audio.durationSec - b[0].audio.durationSec; }, long: function (a, b) { return b[0].audio.durationSec - a[0].audio.durationSec; },
      title: function (a, b) { return a[0].title.localeCompare(b[0].title); } }[F.sort];
    list.sort(cmp);
    resultsEl.textContent = "";
    var n = list.length;
    $("#lib-count").textContent = n === 0 ? "No recordings match." : n + (n === 1 ? " recording" : " recordings");
    if (!App.playables().length) {
      resultsEl.append(h("div", { class: "empty" }, h("h3", null, "No approved recordings yet"),
        h("p", null, "Recordings appear here only after a real audio file has been produced, reviewed and approved. Nothing is shown as playable before then."),
        h("p", null, "The written essays are available now in "), h("a", { class: "btn sm", href: App.site("research/published/") }, "Published research →")));
      return;
    }
    if (!n) { resultsEl.append(h("div", { class: "empty" }, h("p", null, "Nothing matches your search. Try fewer words, or clear the filters."))); return; }
    list.forEach(function (x) { resultsEl.append(recCard(x[0], F.q ? x[1] : null)); });
  }
  function syncChips() {
    if (!chipsEl) return;
    Array.prototype.forEach.call(chipsEl.querySelectorAll("button[data-c]"), function (b) { b.setAttribute("aria-pressed", String((b.dataset.k === "cat" ? F.cat : F.series) === b.dataset.c)); });
  }

  function toolbar() {
    var cats = visibleCats(), sers = visibleSeries();
    var input = h("input", { id: "lib-q", type: "search", class: "q", placeholder: "Search titles, topics, and what is said in the transcripts", "aria-describedby": "lib-count", autocomplete: "off", value: F.q });
    var loaded = false;
    var ensure = function () { if (!loaded) { loaded = true; App.loadTranscripts().then(renderResults, function () { /* title search still works */ }); } };
    input.addEventListener("focus", ensure);
    input.addEventListener("input", function () { F.q = input.value.trim(); if (F.q) ensure(); renderResults(); });
    chipsEl = h("div", { class: "chips filter", role: "group", "aria-label": "Filter recordings" },
      cats.length ? [h("span", { class: "dim" }, "Category")].concat(cats.map(function (c) { return h("button", { type: "button", class: "chip btn-chip", "data-k": "cat", "data-c": c.id, "aria-pressed": String(F.cat === c.id), title: c.description, onclick: function () { F.cat = F.cat === c.id ? "" : c.id; renderResults(); syncChips(); } }, c.label); })) : null,
      sers.length ? [h("span", { class: "dim" }, "Series")].concat(sers.map(function (c) { return h("button", { type: "button", class: "chip btn-chip", "data-k": "series", "data-c": c.id, "aria-pressed": String(F.series === c.id), title: c.description, onclick: function () { F.series = F.series === c.id ? "" : c.id; renderResults(); syncChips(); } }, c.title); })) : null);
    var sort = h("select", { id: "lib-sort", "aria-label": "Sort recordings", onchange: function (e) { F.sort = e.target.value; renderResults(); } },
      [["new", "Newest essay first"], ["short", "Shortest first"], ["long", "Longest first"], ["title", "Title A to Z"]].map(function (o) { return h("option", { value: o[0], selected: F.sort === o[0] ? "" : null }, o[1]); }));
    return h("div", { class: "toolbar" }, h("label", { class: "sr", for: "lib-q" }, "Search the audio library"), input, h("label", { class: "sr", for: "lib-sort" }, "Sort"), sort, chipsEl);
  }

  function pipeline() {
    if (!CFG.showPipeline || !D.queue) return null;
    var items = D.queue.items;
    var counts = {};
    D.lib.meta.statuses.forEach(function (s) { counts[s.id] = 0; });
    items.forEach(function (i) { counts[i.status] = (counts[i.status] || 0) + 1; });
    return h("section", { class: "pipeline", "aria-labelledby": "pipe-h" },
      h("h2", { id: "pipe-h" }, "Published articles and their audio"),
      h("p", { class: "note" }, "Every published article is eligible for a recorded version, but none becomes playable until a real audio file has been produced, reviewed and approved by the author. The status below is read from the production records."),
      h("div", { class: "tablewrap" }, h("table", { class: "ptable" },
        h("caption", { class: "sr" }, "Audio status of each published article"),
        h("thead", null, h("tr", null, ["Article", "Published", "Audio status", ""].map(function (t) { return h("th", { scope: "col" }, t); }))),
        h("tbody", null, items.map(function (i) {
          var rec = i.recordingId ? App.rec(i.recordingId) : null;
          return h("tr", null,
            h("th", { scope: "row" }, h("a", { href: App.rebase(i.url) }, i.title)),
            h("td", null, fdate(i.publishedAt)),
            h("td", null, App.badge(i.status), i.flags.length ? h("span", { class: "dim" }, " " + i.notes.join(" ")) : null),
            h("td", null, rec && App.playable(rec) ? h("a", { href: "#listen-" + rec.id }, "Listen →") : h("span", { class: "dim" }, i.eligible ? "Eligible for audio" : "No audio")));
        })))),
      h("ul", { class: "statdefs" }, D.lib.meta.statuses.map(function (s) { return h("li", null, App.badge(s.id), " " + s.definition); })));
  }

  App.views.library = function (hashRest) {
    var cont = continueItem();
    resultsEl = h("div", { class: "results" });
    App.mount("", [
      hero(cont),
      App.storageNotice(),
      continueCard(cont),
      h("section", { class: "library", "aria-labelledby": "lib-title" },
        h("h2", { id: "lib-title", tabindex: "-1" }, "Audio library"),
        toolbar(), h("p", { id: "lib-count", class: "count", "aria-live": "polite" }, ""), resultsEl),
      pipeline(),
      h("section", { class: "policy" },
        h("h2", { class: "mini" }, "How recordings are made"),
        h("p", null, "Each recording narrates a published essay word for word. A synthetic voice is always disclosed, both on the page and inside the audio. No recording is published until the author has listened to it and approved it. "),
        h("a", { href: "#how" }, "Read how it works →"), " ",
        h("a", { href: SUBSTACK, target: "_blank", rel: "noopener noreferrer" }, "Artificially Intelligent on Substack ↗"))
    ]);
    renderResults(); syncChips();
    if (F.q) App.loadTranscripts().then(renderResults, function () {});
    if (hashRest === "library") setTimeout(function () { jump("lib-title"); }, 30);
  };

  /* ---------------- how it works ---------------- */
  App.views.how = function () {
    var steps = [
      ["Retrieve the article", "The completed essay is read from the public research page."],
      ["Extract the approved text", "Only the essay as published is used. Nothing is rewritten."],
      ["Prepare a narration script", "The script is the essay, plus a short recording note. Any change for speech, such as leaving out [1]-style citation markers, is listed for the author to approve."],
      ["Identify pronunciation needs", "Names, numbers and abbreviations are listed, with how they should be said."],
      ["Narrate with an authorized method", "A human narrator, or a licensed synthetic voice approved by the author. No paid service is used without approval."],
      ["Produce the audio file", "A mono MP3 tuned for the voice, so files stay small and load quickly."],
      ["Review the recording", "A person listens for pronunciation, omissions and tone."],
      ["Confirm it matches the article", "The recording is checked against the exact article version it was made from."],
      ["Align the transcript", "Timestamps are measured from the audio itself. Highlighting is by sentence."],
      ["Store the approved audio", "The approved file is kept with its checksum."],
      ["Publish its record", "Duration, narrator, version and review date are written to the public record."],
      ["Make it available here", "Only then does it become playable. Approval is separate from publishing the article."]];
    var keys = [["Space or K", "Play or pause"], ["← or J", "Back 10 seconds"], ["→ or L", "Forward 10 seconds"], ["N / P", "Next / previous recording"], ["M", "Mute"], ["S", "Next playback speed"], ["T", "Save this moment"], ["On the position bar: ← →, Page Up / Page Down, Home / End", "Move by 5 s, 30 s, start or end"]];
    App.mount("how", [
      h("div", { class: "pagehead" }, h("p", { class: "kicker" }, "The Listening Room"), h("h1", null, "How it works"),
        h("p", { class: "lede" }, "A listening room should be honest about where its voices come from.")),
      h("section", { class: "sec" }, h("h2", null, "Voices and disclosure"),
        h("p", null, "Recordings are labelled by how they were narrated: human narration, a synthetic voice that the author has reviewed and approved, or a demonstration voice that has not been approved. A synthetic voice is stated on the page, in the recording's record, and spoken at the start of the audio, so the disclosure travels with the file."),
        h("p", null, "The written essay is always the authoritative text. If a recording ever differs from it, the transcript shows what the recording actually says, and the difference is described.")),
      h("section", { class: "sec" }, h("h2", null, "From article to audio"), h("ol", { class: "steps" }, steps.map(function (s) { return h("li", null, h("b", null, s[0] + ". "), s[1]); })),
        h("p", { class: "note" }, "A new article never turns into a playable recording on its own. It appears in the production list as “Not Yet Recorded”, and stays there until a person completes the steps above.")),
      h("section", { class: "sec" }, h("h2", null, "Audio statuses"), h("ul", { class: "statdefs" }, D.lib.meta.statuses.map(function (s) { return h("li", null, App.badge(s.id), " " + s.definition); })),
        h("p", { class: "note" }, "If an essay's text changes after a recording was made, the recording is flagged “Revision Required” and left exactly as it was until a person reviews it. Nothing is replaced automatically.")),
      h("section", { class: "sec" }, h("h2", null, "Transcripts and timing"),
        h("p", null, "Every recording has a full transcript. Highlighting follows the narration sentence by sentence, using timings measured from the audio file. There is no word-by-word timing, and none is implied. If timing is ever unavailable, the transcript stays readable on its own.")),
      h("section", { class: "sec" }, h("h2", null, "The Audio Atmosphere"),
        h("p", null, "The moving lines draw the sound of the recording as it plays: louder, brighter sound lifts a line, quiet lets it settle. It is a picture of an audio signal. It does not show meaning, thought, or anything about consciousness or machine cognition."),
        h("p", null, "It can be turned off, it is off by default if your device asks for reduced motion, and everything it accompanies is available as text. If your browser cannot provide the live signal, a still picture of the recording's loudness is shown instead.")),
      h("section", { class: "sec" }, h("h2", null, "Keyboard shortcuts"), h("dl", { class: "keys" }, keys.map(function (k) { return h("div", null, h("dt", null, h("kbd", null, k[0])), h("dd", null, k[1])); }))),
      h("section", { class: "sec" }, h("h2", null, "What is stored, and where"),
        h("p", null, "You do not need an account. Your listening position, saved moments, notes and preferences are stored only in this browser on this device, under the keys ", h("code", null, "ai_listen_v1"), " and, for items you save to your Reading Desk, ", h("code", null, "ai_desk_v1"), ". Nothing is sent to a server, and nothing syncs between devices."),
        h("p", null, "Clearing your browser's site data removes it. If your browser blocks storage, listening still works but nothing is kept. Controls to clear what is saved are on the ", h("a", { href: "#journal" }, "journal page"), "."),
        h("p", null, "Audio files are served by the same site as this page. This page does not use analytics or third-party audio hosting.")),
      h("section", { class: "sec" }, h("h2", null, "Accessibility"),
        h("p", null, "Every control is a real button or slider with a label and a visible focus ring. The full transcript is always available as text, including in Immersive mode. Playback speed ranges from 0.75× to 2×. Motion can be turned off. If you cannot or prefer not to listen, you can read the essay: nothing is available only as audio.")),
      h("section", { class: "sec" }, h("h2", null, "Limits"),
        h("p", null, "Background playback and lock-screen controls depend on your browser and have not been verified on every device. A recording is a presentation of the essay, not independent evidence for any claim in it."))
    ]);
  };

  /* ---------------- router ---------------- */
  function parse() {
    var s = (location.hash || "").replace(/^#/, "");
    var m = /^listen-([A-Za-z0-9]+)(?:-t(\d+))?$/.exec(s);
    if (m) return { v: "listen", id: m[1], t: m[2] != null ? +m[2] : null };
    if (s === "journal" || s === "how") return { v: s };
    return { v: "library", rest: s };
  }
  var ROUTING = 0;
  function route() {
    var r = parse();
    if (App.current && App.current.destroy) {
      /* same recording, new time: just seek, do not rebuild or restart */
      if (r.v === "listen" && App.current.rec === r.id && App.current.seekTo) { if (r.t != null) App.current.seekTo(r.t); return; }
      App.current.destroy(); App.current = null;
    }
    var my = ++ROUTING;
    var view = App.views[r.v];
    var out = view(r.v === "library" ? r.rest : r);
    if (out && out.then) out.then(function (c) { if (my === ROUTING) App.current = c || null; });
    else App.current = out || null;
    document.title = r.v === "listen" && App.rec(r.id) ? App.rec(r.id).title + " · The Listening Room · Artificially Intelligent" : "The Listening Room · Artificially Intelligent";
  }
  App.route = route;
  App.go = function (hash) { if (location.hash === hash) route(); else location.hash = hash; };

  App.start = function () {
    siteNav();
    Promise.all([getJSON(CFG.dataBase + "audio-library.json"), getJSON(CFG.dataBase + "audio-queue.json").catch(function () { return null; })]).then(function (r) {
      D.lib = r[0]; D.queue = r[1];
      /* An empty room (nothing approved yet) must not be indexed as a thin page. The sitemap omits it for the same reason. */
      if (!App.playables().length) { var rb = document.createElement("meta"); rb.name = "robots"; rb.content = "noindex,follow"; document.head.appendChild(rb); }
      window.addEventListener("hashchange", route);
      route();
    }, function () {
      $("#app").textContent = "";
      $("#app").append(h("div", { class: "panel" }, h("h2", null, "The Listening Room could not load its audio records"), h("p", null, "Please reload the page. Nothing on the site has been changed. You can still read every essay in "), h("a", { href: App.site("research/published/") }, "Published research")));
    });
  };

  root.LRApp = App;
})(window);
