/* Inquiry Engine core. Pure functions over the shared research index.
   No DOM, no network, no AI model: every result can be traced to a rule and to an indexed record.
   Reusable by Universal Research Search (see engine.search). */
(function (root) {
  "use strict";

  var STOP = new Set(("a an the of to in on at for and or is are be been can could would should do does did it its that this " +
    "what which who whom how why when where with by as from into than then there their they them about over under not no if " +
    "my your our we you i me so such very more most also just")
    .split(" "));

  function stem(w) {
    w = w.toLowerCase();
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 6 && /ly$/.test(w)) w = w.slice(0, -2);
    if (w.length > 6 && /ing$/.test(w)) w = w.slice(0, -3);
    else if (w.length > 5 && /ed$/.test(w)) w = w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    return w;
  }
  function words(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean); }
  function contentStems(s) { return words(s).filter(function (w) { return !STOP.has(w); }).map(stem); }

  function create(index, vocab, rules) {
    var R = new Map();
    index.resources.forEach(function (r) { R.set(r.id, r); });
    var byType = {};
    index.resources.forEach(function (r) { (byType[r.type] = byType[r.type] || []).push(r); });
    var adj = new Map();
    index.edges.forEach(function (e) {
      (adj.get(e.a) || adj.set(e.a, []).get(e.a)).push(e);
      (adj.get(e.b) || adj.set(e.b, []).get(e.b)).push(e);
    });
    var V = new Map(); vocab.concepts.forEach(function (c) { V.set(c.id, c); });
    var aliasList = [];
    vocab.concepts.forEach(function (c) {
      c.aliases.forEach(function (a) {
        var t = words(a).map(stem);
        if (t.length) aliasList.push({ concept: c.id, alias: a, toks: t });
      });
    });
    aliasList.sort(function (x, y) { return y.toks.length - x.toks.length; });
    var links = new Map();
    vocab.links.forEach(function (l) {
      (links.get(l.a) || links.set(l.a, []).get(l.a)).push({ to: l.b, kind: l.kind });
      (links.get(l.b) || links.set(l.b, []).get(l.b)).push({ to: l.a, kind: l.kind });
    });

    // ---- document statistics for the small text scorer
    var docs = new Map(), df = new Map(), N = index.resources.length;
    index.resources.forEach(function (r) {
      var toks = contentStems([r.title, r.summary, (r.keywords || []).join(" "), (r.subjects || []).join(" "), r.scope || ""].join(" "));
      var tf = {}; toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      var title = new Set(contentStems(r.title));
      docs.set(r.id, { tf: tf, title: title, set: new Set(toks) });
      Object.keys(tf).forEach(function (t) { df.set(t, (df.get(t) || 0) + 1); });
    });
    function idf(t) { return Math.log(1 + N / (1 + (df.get(t) || 0))); }

    function label(id) { var c = V.get(id); return c ? c.label : id; }

    // ---- concept recognition (rule-based, from the editorial vocabulary)
    function recognise(query) {
      var orig = words(query), st = orig.map(stem), used = new Array(st.length).fill(false), found = [];
      aliasList.forEach(function (a) {
        for (var i = 0; i + a.toks.length <= st.length; i++) {
          var ok = true;
          for (var j = 0; j < a.toks.length; j++) { if (st[i + j] !== a.toks[j] || used[i + j]) { ok = false; break; } }
          if (ok) {
            for (var k = 0; k < a.toks.length; k++) used[i + k] = true;
            found.push({ concept: a.concept, label: label(a.concept), matched: orig.slice(i, i + a.toks.length).join(" ") });
          }
        }
      });
      var seen = {}, out = [];
      found.forEach(function (f) { if (!seen[f.concept]) { seen[f.concept] = 1; out.push(f); } });
      var linked = [], ls = {};
      out.forEach(function (f) {
        (links.get(f.concept) || []).forEach(function (l) {
          if (!seen[l.to] && !ls[l.to]) { ls[l.to] = 1; linked.push({ concept: l.to, label: label(l.to), via: f.label, kind: l.kind }); }
        });
      });
      return { tokens: orig, stems: st, terms: out, linked: linked };
    }

    // ---- scoring
    function scoreResource(r, rec, qstems) {
      var s = 0, reasons = [], dc = 0, thit = 0;
      var D = {}; rec.terms.forEach(function (t) { D[t.concept] = t; });
      var L = {}; rec.linked.forEach(function (l) { L[l.concept] = l; });
      var own = r.type === "concept" ? r.id.slice(8) : null;
      if (own && D[own]) { s += 4; reasons.push({ kind: "concept", text: "This is the description of “" + D[own].label + "”, a term in your question." }); }
      else if (own && L[own]) { s += 1.2; reasons.push({ kind: "linked", text: "Describes “" + L[own].label + "”, which the site links to “" + L[own].via + "” (" + (L[own].kind === "same" ? "same idea, two names" : "closely related, not identical") + ")." }); }
      (r.concepts || []).forEach(function (c) {
        if (own && c === own) return;
        if (D[c]) { s += 3; dc++; reasons.push({ kind: "concept", text: "Tagged with “" + D[c].label + "”, which matches your wording (“" + D[c].matched + "”)." }); }
        else if (L[c]) { s += L[c].kind === "same" ? 2.5 : 1; reasons.push({ kind: "linked", text: "Tagged with “" + L[c].label + "”, linked by the site to “" + L[c].via + "” (" + (L[c].kind === "same" ? "same idea, two names" : "closely related, not identical") + ")." }); }
      });
      var d = docs.get(r.id), hit = [], tscore = 0;
      qstems.forEach(function (t) {
        if (d.tf[t]) { tscore += idf(t) * (d.tf[t] / (d.tf[t] + 1)) * (d.title.has(t) ? 2 : 1); hit.push(t); }
      });
      thit = hit.length;
      if (hit.length) { s += Math.min(tscore * 0.9, 4); reasons.push({ kind: "text", text: "Its text uses " + hit.slice(0, 4).map(function (h) { return "“" + h + "”"; }).join(", ") + " from your question." }); }
      var sim = 0;
      if (r.type === "question") {
        var inter = 0; qstems.forEach(function (t) { if (d.title.has(t)) inter++; });
        var uni = new Set(qstems.concat(Array.from(d.title))).size || 1;
        sim = inter / uni;
        if (sim >= rules.thresholds.closestQuestionTitleSimilarity) { s += 6 * sim; reasons.unshift({ kind: "question", text: "Its wording is close to yours." }); }
      }
      return { id: r.id, score: s, reasons: reasons, sim: sim, dc: dc, thit: thit };
    }

    function gate(x) { return x.dc >= 2 || (x.dc >= 1 && x.thit >= 2) || x.thit >= 3; }
    function rank(rec, qstems, types) {
      var out = [];
      index.resources.forEach(function (r) {
        if (types && types.indexOf(r.type) < 0) return;
        var x = scoreResource(r, rec, qstems);
        if (x.score > 0) out.push(x);
      });
      out.sort(function (a, b) { return b.score - a.score; });
      return out;
    }

    function search(query, opts) {
      opts = opts || {};
      var rec = recognise(query), qs = contentStems(query);
      var all = rank(rec, qs, opts.types);
      return { query: query, terms: rec.terms, results: all.slice(0, opts.limit || 20).map(function (x) { return Object.assign({ resource: R.get(x.id) }, x); }) };
    }

    // ---- helpers over the graph
    function edgesOf(id) { return adj.get(id) || []; }
    function other(e, id) { return e.a === id ? e.b : e.a; }
    function addReason(map, id, why) {
      var x = map.get(id) || { id: id, reasons: [], n: 0, preliminary: false };
      if (!x.reasons.some(function (r) { return r.text === why.text; })) x.reasons.push(why);
      x.n++; if (why.preliminary) x.preliminary = true; map.set(id, x); return x;
    }
    function qLabel(id) { var r = R.get(id); return r ? (id.indexOf("q:") === 0 ? r.title : r.title) : id; }

    // ---- the inquiry
    function inquire(query, opts) {
      opts = opts || {};
      var visited = new Set(opts.visited || []);
      var L = rules.limits, T = rules.thresholds;
      var rec = recognise(query), qs = contentStems(query);
      var qrank = rank(rec, qs, ["question"]).filter(function (x) { return x.score >= T.minQuestionScore; });
      var top = qrank.slice(0, L.questions);
      var primary = top[0] ? R.get(top[0].id) : null;
      var res = { query: query, terms: rec.terms, linked: rec.linked, tokens: rec.tokens, primary: primary ? primary.id : null,
        questions: top.map(function (x) { return { id: x.id, reasons: x.reasons, closest: x === top[0] && x.sim >= T.closestQuestionTitleSimilarity }; }),
        steps: [], orderNotes: [], sourcesAll: [], empty: false, coverage: [],
        primaryClose: !!(top[0] && top[0].sim >= T.closestQuestionTitleSimilarity) };
      var consumed = {}; rec.terms.forEach(function (t) { t.matched.split(" ").forEach(function (w) { consumed[stem(w)] = 1; }); });
      res.unmatched = contentStems(query).filter(function (t) { return !consumed[t] && !df.get(t); });

      if (!rec.terms.length && !top.length) {
        var near = rank(rec, qs, null).slice(0, 4);
        res.empty = true; res.nearest = near.map(function (x) { return { id: x.id, reasons: x.reasons }; });
        return res;
      }

      // theories
      var th = new Map();
      top.forEach(function (x) {
        edgesOf(x.id).forEach(function (e) {
          var o = other(e, x.id);
          if (o.indexOf("theory:") === 0 && e.source === "archive") addReason(th, o, { text: "Named for the question “" + qLabel(x.id) + "” in the Unanswered Archive.", kind: "editorial", w: x === top[0] ? 3 : 1.5 });
        });
      });
      rank(rec, qs, ["theory"]).filter(function (x) { return x.score >= 3 && gate(x); }).slice(0, 3).forEach(function (x) {
        x.reasons.forEach(function (rr) { if (rr.kind === "concept") addReason(th, x.id, Object.assign({ w: 1 }, rr)); });
      });
      function wsum(x) { return x.reasons.reduce(function (a, r) { return a + (r.w || 1); }, 0); }
      var theories = Array.from(th.values()).sort(function (a, b) { return wsum(b) - wsum(a); }).slice(0, 6);

      // sources (evidence)
      var src = new Map();
      top.forEach(function (x) {
        edgesOf(x.id).forEach(function (e) {
          var o = other(e, x.id);
          if (o.indexOf("src:") === 0 || o.indexOf("pub:") === 0) {
            var pre = e.kind === "preliminary";
            addReason(src, o, { kind: pre ? "preliminary" : "editorial", preliminary: pre, w: pre ? 0.5 : (x === top[0] ? 4 : 2), text: pre ? "Preliminary: the Research Observatory assigned this paper to “" + qLabel(x.id) + "” from its title and metadata. It has not been read for this purpose." : "Listed as evidence for “" + qLabel(x.id) + "” in the Unanswered Archive." });
          }
        });
      });
      theories.forEach(function (t) {
        edgesOf(t.id).forEach(function (e) {
          var o = other(e, t.id);
          if (o.indexOf("src:") === 0) addReason(src, o, { kind: "editorial", w: 1, text: "In the reading list for " + (R.get(t.id).abbr || R.get(t.id).title) + " in the Theory Chamber." });
        });
      });
      rank(rec, qs, ["source"]).filter(function (x) { return x.score >= 4 && gate(x); }).slice(0, 6).forEach(function (x) {
        x.reasons.forEach(function (rr) { if (rr.kind === "concept" || rr.kind === "text") addReason(src, x.id, Object.assign({ w: 1.5 }, rr)); });
      });
      var primaryId = primary ? primary.id.slice(2) : null;
      var sources = Array.from(src.values()).sort(function (a, b) { return wsum(b) - wsum(a); });
      res.sourcesAll = sources.map(function (s) { return s.id; });

      // compare
      var thIds = new Set(theories.map(function (t) { return t.id; })), cmp = [];
      (byType.comparison || []).forEach(function (c) {
        var both = c.theories.every(function (t) { return thIds.has("theory:" + t); });
        if (both) cmp.push({ id: c.id, reasons: [{ kind: "editorial", text: "Both theories appear in this investigation." }] });
      });
      var contested = top.filter(function (x) { return (R.get(x.id).status || []).indexOf("Contested") >= 0; });

      // unknown
      var unknown = top.map(function (x) { var q = R.get(x.id); return { id: x.id, status: q.status, problems: q.openProblems || [] }; })
        .filter(function (u) { return u.problems.length || (u.status && u.status.length); });

      // continue: articles, rooms, branches
      var conceptSet = new Set(rec.terms.map(function (t) { return t.concept; }));
      var arts = rank(rec, qs, ["article"]).filter(function (x) { return x.score >= 3; }).slice(0, L.articles);
      var rooms = rank(rec, qs, ["museum"]).filter(function (x) { return x.score >= 3; }).slice(0, L.rooms);
      var lessonsRec = rank(rec, qs, ["lesson"]).filter(function (x) { return x.score >= 4; }).slice(0, 3);
      var branches = [];
      var seenB = new Set(top.map(function (x) { return x.id; }));
      var brSrc = new Map();
      top.forEach(function (x) {
        edgesOf(x.id).forEach(function (e) {
          var o = other(e, x.id);
          if (o.indexOf("q:") === 0 && !seenB.has(o) && !visited.has(o) && e.kind === "editorial") addReason(brSrc, o, { kind: "editorial", text: e.why });
        });
      });
      branches = Array.from(brSrc.values()).sort(function (a, b) { return b.n - a.n; }).slice(0, L.branches);
      var papers = []; // Observatory papers matched but not already in evidence
      rank(rec, qs, ["source"]).filter(function (x) { return x.score >= 4 && gate(x) && R.get(x.id).origins && R.get(x.id).origins.indexOf("The Research Observatory") >= 0 && !src.has(x.id); }).slice(0, L.observatoryPapers).forEach(function (x) { papers.push({ id: x.id, reasons: x.reasons, preliminary: true }); });

      // ---- build steps
      var ST = rules.stepText, steps = {};
      var defs = [];
      rec.terms.slice(0, L.concepts).forEach(function (t) {
        var cr = R.get("concept:" + t.concept);
        if (cr) defs.push({ id: cr.id, reasons: [{ kind: "concept", text: "A term in your question (“" + t.matched + "”)." }] });
        else defs.push({ id: null, missing: t.label, reasons: [{ kind: "concept", text: "A term in your question (“" + t.matched + "”). The site has no description of it yet." }] });
      });
      rec.linked.slice(0, 3).forEach(function (l) {
        var cr = R.get("concept:" + l.concept);
        if (cr && defs.length < L.concepts + 2) defs.push({ id: cr.id, reasons: [{ kind: "linked", text: "Linked by the site to “" + l.via + "” (" + (l.kind === "same" ? "same idea, two names" : "closely related, not identical") + ")." }] });
      });
      steps.understand = { id: "understand", terms: rec.terms, linked: rec.linked, readings: top.map(function (x) { return x.id; }), primary: primary ? primary.id : null };
      if (defs.some(function (d) { return d.id; })) steps.define = { id: "define", items: defs };
      if (theories.length) steps.theories = { id: "theories", items: theories.map(function (t) { return { id: t.id, reasons: t.reasons }; }) };
      if (sources.length) steps.evidence = { id: "evidence", items: sources.map(function (s) { return { id: s.id, reasons: s.reasons, preliminary: s.preliminary && s.reasons.length === 1 }; }), primaryQuestion: primary ? primary.id : null };
      if (cmp.length || contested.length) steps.compare = { id: "compare", items: cmp, contested: contested.map(function (x) { return x.id; }) };
      if (unknown.length) steps.unknown = { id: "unknown", items: unknown };
      var cont = []; arts.forEach(function (x) { cont.push({ id: x.id, reasons: x.reasons, group: "essay" }); });
      rooms.forEach(function (x) { cont.push({ id: x.id, reasons: x.reasons, group: "room" }); });
      lessonsRec.forEach(function (x) { cont.push({ id: x.id, reasons: x.reasons, group: "lesson" }); });
      if (cont.length || branches.length || papers.length) steps.continue = { id: "continue", items: cont, branches: branches.map(function (b) { return { id: b.id, reasons: b.reasons }; }), papers: papers };

      // ---- order, with visible reasons
      var order = rules.defaultOrder.slice();
      var qset = new Set(rec.stems);
      rules.reorder.forEach(function (rule) {
        var ok = true, w = rule.when;
        if (w.queryHasAny) ok = ok && w.queryHasAny.some(function (x) { return qset.has(stem(x)); });
        if (w.primaryCategory) ok = ok && !!primary && w.primaryCategory.indexOf(primary.category) >= 0;
        if (!ok) return;
        var from = order.indexOf(rule.move), to = order.indexOf(rule.before);
        if (from < 0 || to < 0 || from < to) return;
        order.splice(from, 1); order.splice(order.indexOf(rule.before), 0, rule.move);
        res.orderNotes.push(rule.why);
      });
      res.steps = order.filter(function (id) { return steps[id]; }).map(function (id) { return Object.assign({ title: ST[id].title, objective: ST[id].objective }, steps[id]); });

      // ---- honest coverage notes
      if (res.unmatched.length) res.coverage.push("These words in your question matched nothing on the site: " + res.unmatched.join(", ") + ". The pathway ignores them.");
      if (primary && !res.primaryClose) res.coverage.push("No Archive question matches your wording closely. The nearest one is “" + primary.title + "”, so the pathway rests mainly on the terms we recognised.");
      if (!primary) res.coverage.push("No Unanswered Archive question is close to your wording, so the pathway below is built from the terms we recognised. It may be incomplete.");
      if (!arts.length) res.coverage.push("No published essay on this site addresses these terms directly yet.");
      if (!theories.length) res.coverage.push("No theory in the Theory Chamber is linked to this question.");
      if (!rules.features.lexicon) res.coverage.push("The Lexicon of Intelligence is not published yet, so definitions come from the Research Atlas and the Theory Chamber.");
      if (!sources.length) res.coverage.push("The index holds no publication tied to this question.");
      if (rec.terms.length === 0) res.coverage.push("None of the terms in your question matched the site's vocabulary; results come from wording only.");
      return res;
    }

    // ---- map graph for the Pathway Map
    function graphFor(inq) {
      var nodes = new Map(), edges = [];
      function node(id, extra) { if (!nodes.has(id)) { var r = R.get(id); if (r) nodes.set(id, Object.assign({ id: id, type: r.type, label: r.abbr && r.type === "theory" ? r.abbr : r.title }, extra || {})); } return nodes.get(id); }
      nodes.set("ask", { id: "ask", type: "ask", label: inq.query });
      inq.terms.forEach(function (t) { var n = node("concept:" + t.concept); if (n) edges.push({ a: "ask", b: n.id, why: "Recognised in your question as “" + t.matched + "”.", kind: "automatic" }); });
      inq.questions.forEach(function (x) { var n = node(x.id); if (n) edges.push({ a: "ask", b: n.id, why: x.reasons.length ? x.reasons[0].text : "Matches your question.", kind: "automatic" }); });
      inq.steps.forEach(function (s) {
        if (s.id === "theories" || s.id === "compare") (s.items || []).forEach(function (it) { node(it.id); });
        if (s.id === "evidence") (s.items || []).slice(0, 6).forEach(function (it) { node(it.id); });
        if (s.id === "continue") (s.items || []).forEach(function (it) { node(it.id); });
      });
      var ids = Array.from(nodes.keys());
      ids.forEach(function (a) {
        edgesOf(a).forEach(function (e) {
          var b = other(e, a);
          if (nodes.has(b) && a < b) edges.push({ a: a, b: b, why: e.why, kind: e.kind });
        });
      });
      // orphans (no edge to anything) get a labelled automatic edge to the question so nothing floats free
      var linkedTo = new Set(); edges.forEach(function (e) { linkedTo.add(e.a); linkedTo.add(e.b); });
      nodes.forEach(function (n, id) { if (id !== "ask" && !linkedTo.has(id)) edges.push({ a: "ask", b: id, why: "Matched your wording or terms; no editorial link to the other nodes shown.", kind: "automatic" }); });
      return { nodes: Array.from(nodes.values()), edges: edges };
    }

    function neighbours(id, exclude) {
      exclude = exclude || new Set();
      var pri = { editorial: 0, "verified-metadata": 1, preliminary: 2 };
      return edgesOf(id).filter(function (e) { return !exclude.has(other(e, id)) && R.has(other(e, id)) && R.get(other(e, id)).type !== "comparison"; })
        .sort(function (a, b) { return (pri[a.kind] - pri[b.kind]); })
        .slice(0, rules.limits.expand)
        .map(function (e) { return { id: other(e, id), why: e.why, kind: e.kind }; });
    }

    // ---- summary
    function summarise(inq, picked) {
      picked = picked || {};
      function ids(step) { var s = inq.steps.filter(function (x) { return x.id === step; })[0]; return s ? (s.items || []) : []; }
      var qres = inq.questions.map(function (x) { return R.get(x.id); });
      var ev = ids("evidence").map(function (x) { return R.get(x.id); });
      var comp = []; var cs = inq.steps.filter(function (x) { return x.id === "compare"; })[0];
      if (cs) { (cs.items || []).forEach(function (c) { comp.push({ title: R.get(c.id).title, url: R.get(c.id).url, note: "Side-by-side comparison in the Theory Chamber." }); });
        (cs.contested || []).forEach(function (qid) { var q = R.get(qid); comp.push({ title: q.title, url: q.url, note: "Archive status includes “Contested”. " + (q.statusJustification || "") }); }); }
      var unres = [];
      ids("unknown").forEach(function (u) { var q = R.get(u.id); (u.problems || []).forEach(function (p) { unres.push({ text: p, from: q.title, url: q.url }); }); });
      var reading = [];
      ids("continue").forEach(function (c) { var r = R.get(c.id); reading.push({ title: r.title, url: r.url, kind: r.type === "article" ? "Essay on this site" : r.type === "lesson" ? "Learning Institute lesson" : "Museum room" }); });
      var src = ev.map(function (r) { return { title: r.title, authors: (r.authors || []).join(", "), year: r.year, venue: r.venue, doi: r.doi, url: r.url, kind: r.evidenceLabel }; });
      return {
        question: inq.query,
        concepts: inq.terms.map(function (t) { return t.label; }),
        theories: ids("theories").map(function (t) { return R.get(t.id).title; }),
        evidence: src, competing: comp, unresolved: unres, reading: reading,
        caveat: "This summary lists what the site's index holds. It does not answer the question, and it is not a judgement of which view is correct. Records marked preliminary were assigned by software from titles and metadata and have not been read for this purpose.",
        notes: picked.notes || ""
      };
    }
    function summaryText(s) {
      var L = [];
      L.push("INVESTIGATION SUMMARY"); L.push("Artificially Intelligent · The Inquiry Engine"); L.push("");
      L.push("Original question: " + s.question); L.push("");
      L.push("Important concepts: " + (s.concepts.length ? s.concepts.join("; ") : "none recognised")); L.push("");
      L.push("Relevant theories: " + (s.theories.length ? s.theories.join("; ") : "none linked")); L.push("");
      L.push("Available evidence:"); s.evidence.forEach(function (e) { L.push(" - " + e.authors + (e.year ? " (" + e.year + "). " : ". ") + e.title + (e.venue ? ". " + e.venue : "") + (e.doi ? ". https://doi.org/" + e.doi : e.url ? ". " + e.url : "") + " [" + e.kind + "]"); });
      if (!s.evidence.length) L.push(" - none in the index");
      L.push(""); L.push("Competing interpretations:"); s.competing.forEach(function (c) { L.push(" - " + c.title + ": " + c.note); }); if (!s.competing.length) L.push(" - none recorded on this site for this question");
      L.push(""); L.push("Unresolved questions:"); s.unresolved.forEach(function (u) { L.push(" - " + u.text + " (" + u.from + ")"); }); if (!s.unresolved.length) L.push(" - none listed");
      L.push(""); L.push("Recommended reading:"); s.reading.forEach(function (r) { L.push(" - " + r.title + " (" + r.kind + ") " + r.url); }); if (!s.reading.length) L.push(" - nothing on this site matches yet");
      if (s.notes) { L.push(""); L.push("My notes: " + s.notes); }
      L.push(""); L.push(s.caveat);
      return L.join("\n");
    }

    return { recognise: recognise, search: search, inquire: inquire, graphFor: graphFor, neighbours: neighbours, summarise: summarise,
      summaryText: summaryText, get: function (id) { return R.get(id); }, all: function () { return index.resources; }, edgesOf: edgesOf,
      counts: function () { return index.meta.counts; }, vocab: V, label: label };
  }

  var api = { create: create, stem: stem, words: words };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.InquiryEngine = api;
})(typeof self !== "undefined" ? self : this);
