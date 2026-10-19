/* Universal Research Search: query processing, tiered ranking, aliases, conservative typo tolerance,
   filters, suggestions and connections. Static-first, no network, no AI model. Works on the SAME shared
   research index as the Inquiry Engine (research-index.json + concept-relations.json). */
(function (root) {
  "use strict";
  var IE = root.InquiryEngine || (typeof require !== "undefined" ? require("./engine.js") : null);
  var stem = IE.stem, words = IE.words;
  var STOP = new Set(("a an the of to in on at for and or is are be been can could would should do does did it its that this " +
    "what which who whom how why when where with by as from into than then there their they them about over under not no if " +
    "my your our we you i me so such very more most also just").split(" "));
  var TYPE_ORDER = ["concept", "theory", "article", "course", "lesson", "question", "comparison", "source", "museum", "contribution"];
  var TYPE_LABEL = { concept: "Concept", theory: "Theory", article: "Original essay", question: "Open question", comparison: "Theory comparison", source: "Publication", museum: "Museum room", course: "Course", lesson: "Lesson", contribution: "Visitor contribution" };
  var GROUP_NOTE = {
    article: "Original essays on this site.",
    concept: "Short working descriptions of concepts, from the Research Atlas and Theory Chamber.",
    theory: "Theoretical frameworks, awaiting evidence review. Listing a theory is not evidence for it.",
    question: "Unresolved questions and their recorded status. These are open problems, not findings.",
    comparison: "Side-by-side theory comparisons.",
    source: "External scholarly publications, with their original links. Not endorsed by this site.",
    museum: "Rooms in the Museum of Human Memory.",
    course: "Published courses in the Learning Institute. Planned courses are not listed.",
    lesson: "Lessons in the Learning Institute. They explain ideas and do not settle open questions.",
    contribution: "Approved contributions from visitors, shown in the Research Commons. They are not peer reviewed, are not research findings, and are not the site's own conclusions."
  };
  function norm(s) { return words(s).join(" "); }
  function cstems(s) { return words(s).filter(function (w) { return !STOP.has(w); }).map(stem); }
  function pairs(s) { return words(s).filter(function (w) { return !STOP.has(w); }).map(function (w) { return { w: w, s: stem(w) }; }); }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var p = [], i, j; for (j = 0; j <= b.length; j++) p[j] = j;
    for (i = 1; i <= a.length; i++) { var c = [i], mn = i; for (j = 1; j <= b.length; j++) { var v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); c[j] = v; if (v < mn) mn = v; } if (mn > max) return max + 1; p = c; }
    return p[b.length];
  }
  function yearOf(r) { var m = String(r.date || r.year || "").match(/^(\d{4})/); return m ? +m[1] : null; }

  function create(index, vocab, rules) {
    var ie = IE.create(index, vocab, rules);
    var R = new Map(), recs = [];
    var df = new Map(), lex = new Map(); // lexicon for typo tolerance: word -> frequency
    function addLex(w) { if (w.length >= 4) lex.set(w, (lex.get(w) || 0) + 1); }
    index.resources.forEach(function (r) {
      var d = {
        r: r, nt: norm(r.title), tstems: new Set(cstems(r.title)), alts: (r.alt || []).map(norm),
        tags: (r.concepts || []).map(function (c) { return { id: c, label: ie.label(c) }; }),
        sstems: new Set(cstems(r.summary || "")), bstems: new Set((r.body || []).map(stem)),
        authors: (r.authors || []).map(norm), atoks: new Set(words((r.authors || []).join(" ")).filter(function (w) { return w.length > 2; }).reduce(function (a, w) { return a.concat([w, stem(w)]); }, [])),
        year: yearOf(r)
      };
      d.tagStems = new Set(d.tags.reduce(function (a, t) { return a.concat(cstems(t.label)); }, []));
      d.subjects = r.subject || [];
      R.set(r.id, d); recs.push(d);
      words([r.title, (r.alt || []).join(" "), (r.authors || []).join(" "), r.summary || "", (r.body || []).join(" ")].join(" ")).forEach(addLex);
      d.tags.forEach(function (t) { words(t.label).forEach(addLex); });
    });
    vocab.concepts.forEach(function (c) { c.aliases.forEach(function (a) { words(a).forEach(addLex); }); });
    // every stem seen anywhere (to tell "unknown word" from "known word")
    var known = new Set(); lex.forEach(function (_, w) { known.add(w); known.add(stem(w)); });
    var facetValues = { types: new Set(), subjects: new Set(), status: new Set(), sourceTypes: new Set() };
    var yrs = [];
    recs.forEach(function (d) { facetValues.types.add(d.r.type); (d.subjects || []).forEach(function (s) { facetValues.subjects.add(s); }); if (d.r.reviewStatus) facetValues.status.add(d.r.reviewStatus); facetValues.sourceTypes.add(d.r.sourceType); if (d.year) yrs.push(d.year); });

    // ---------- query parsing ----------
    function parse(q) {
      var out = { raw: q, phrases: [], filters: {}, text: "" };
      var rest = String(q || "").replace(/"([^"]+)"/g, function (_, p) { out.phrases.push(norm(p)); return " "; });
      rest = rest.replace(/\b(author|year|type|subject|status|source|concept):("[^"]+"|\S+)/gi, function (_, k, v) {
        v = v.replace(/^"|"$/g, ""); k = k.toLowerCase();
        if (k === "year") { var m = v.match(/^(\d{4})(?:-(\d{4}))?$/); if (m) { out.filters.from = +m[1]; out.filters.to = +(m[2] || m[1]); } }
        else { var key = { type: "types", subject: "subjects", status: "status", source: "sourceTypes" }[k]; if (key) (out.filters[key] = out.filters[key] || []).push(v); else out.filters[k] = v; }
        return " ";
      });
      out.text = rest.replace(/\s+/g, " ").trim();
      return out;
    }

    // ---------- typo tolerance (conservative) ----------
    function correct(tokens) {
      var changes = [], fixed = tokens.map(function (t) {
        if (t.length < 5 || known.has(t) || known.has(stem(t)) || STOP.has(t)) return t;
        var max = t.length >= 9 ? 2 : 1, best = null, bd = 9, ties = 0;
        lex.forEach(function (f, w) { if (Math.abs(w.length - t.length) > max) return; var d = lev(t, w, max); if (d <= max) { if (d < bd || (d === bd && f > (lex.get(best) || 0))) { best = w; bd = d; ties = 1; } else if (d === bd && f === (lex.get(best) || 0) && w !== best) ties++; } });
        if (best && bd <= max && ties === 1) { changes.push({ from: t, to: best }); return best; }
        return t;
      });
      return { tokens: fixed, changes: changes };
    }

    // ---------- scoring ----------
    function passes(d, F) {
      var r = d.r;
      if (F.types && F.types.length && F.types.indexOf(r.type) < 0) return false;
      if (F.subjects && F.subjects.length && !F.subjects.some(function (s) { return d.subjects.some(function (x) { return x.toLowerCase() === s.toLowerCase(); }); })) return false;
      if (F.status && F.status.length && !F.status.some(function (s) { return (r.reviewStatus || "").toLowerCase().indexOf(s.toLowerCase()) >= 0; })) return false;
      if (F.sourceTypes && F.sourceTypes.length && !F.sourceTypes.some(function (s) { return (r.sourceType || "").toLowerCase().indexOf(s.toLowerCase()) >= 0; })) return false;
      if ((F.from || F.to)) { if (!d.year) return false; if (F.from && d.year < F.from) return false; if (F.to && d.year > F.to) return false; }
      if (F.author && !d.authors.some(function (a) { return a.indexOf(norm(F.author)) >= 0; })) return false;
      if (F.concept) { var c = norm(F.concept); if (!d.tags.some(function (t) { return norm(t.label) === c || t.id === F.concept; })) return false; }
      return true;
    }

    function score(d, ctx) {
      var r = d.r, s = 0, why = [], hit = 0, nq = ctx.nq, Q = ctx.stems, W = ctx.disp;
      var show = function (arr) { return arr.map(function (t) { return "“" + (W[t] || t) + "”"; }).slice(0, 3).join(", "); };
      if (d.nt === nq) { s += 1000; why.push("Exact title match."); hit++; }
      if (r.type === "concept" && d.nt === nq && !why.length) { s += 800; why.push("This is the concept you named."); }
      d.alts.forEach(function (a) { if (a === nq) { s += 700; why.push("Matches its abbreviation or alternative name “" + (r.alt || []).filter(function (x) { return norm(x) === a; })[0] + "”."); hit++; } });
      if (nq && d.nt !== nq && nq.length > 2 && (" " + d.nt + " ").indexOf(" " + nq + " ") >= 0) { s += 300; why.push("Your words appear together in its title."); hit++; }
      var tHit = Q.filter(function (t) { return d.tstems.has(t); });
      if (tHit.length && d.nt !== nq) { s += 200 * tHit.length / Q.length; why.push("Its title contains " + show(tHit) + "."); hit++; }
      ctx.terms.forEach(function (t) { if (d.tags.some(function (x) { return x.id === t.concept; })) { s += 60; why.push("Tagged with the concept “" + t.label + "”."); hit++; } });
      ctx.linked.forEach(function (l) { if (d.tags.some(function (x) { return x.id === l.concept; })) { s += 14; why.push("Tagged with “" + l.label + "”, which the site links to “" + l.via + "”."); } });
      var sHit = Q.filter(function (t) { return d.sstems.has(t); });
      if (sHit.length) { s += 12 * sHit.length; why.push("Its description mentions " + show(sHit) + "."); hit++; }
      if (ctx.nq.indexOf(" ") > 0 && r.summary && norm(r.summary).indexOf(nq) >= 0) s += 30;
      var aHit = Q.filter(function (t) { return d.atoks.has(t); });
      if (aHit.length) { s += 400 * aHit.length / Q.length; var nm = (r.authors || []).filter(function (a) { return words(a).some(function (w) { return aHit.indexOf(stem(w)) >= 0 || aHit.indexOf(w) >= 0; }); })[0]; why.unshift("Author match: " + nm + "."); hit++; }
      var bHit = Q.filter(function (t) { return d.bstems.has(t); });
      if (bHit.length) { s += Math.min(40, 4 * bHit.length); why.push((bHit.length > 1 ? "The words " : "The word ") + show(bHit.slice(0, 2)) + " appear" + (bHit.length > 1 ? "" : "s") + " in its text."); hit++; }
      // coverage across all fields for multiword queries
      if (Q.length > 1) { var cov = Q.filter(function (t) { return d.tstems.has(t) || d.sstems.has(t) || d.tagStems.has(t) || d.bstems.has(t) || d.atoks.has(t); }).length / Q.length; s += 150 * cov * cov; if (cov < 0.5 && !hit) return null; if (cov < 1) s *= (0.6 + 0.4 * cov); }
      ctx.phrases.forEach(function (p) { var blob = norm([r.title, r.summary, (r.alt || []).join(" ")].join(" ")); if (blob.indexOf(p) >= 0) { s += 250; why.push("Contains the exact phrase “" + p + "”."); hit++; } });
      if (!hit && !ctx.linkedHit(d)) return null;
      return { id: r.id, score: s, reasons: why };
    }

    function search(query, opts) {
      opts = opts || {};
      var p = parse(query), F = Object.assign({}, p.filters, opts.filters || {});
      var text = p.text, raw = words(text), cor = opts.exact ? { tokens: raw, changes: [] } : correct(raw);
      var corrected = cor.changes.length ? cor.tokens.join(" ") : null;
      var nq = norm(corrected || text);
      var stems = cstems(corrected || text);
      var rec = ie.recognise(corrected || text);
      var disp = {}; pairs(corrected || text).forEach(function (p) { disp[p.s] = p.w; });
      var ctx = { disp: disp, nq: nq, stems: stems, terms: rec.terms, linked: rec.linked, phrases: p.phrases, linkedHit: function () { return false; } };
      var out = [];
      var hasQuery = stems.length || p.phrases.length;
      var ql = /\?\s*$/.test(query || "") || /^(what|why|how|can|could|is|are|does|do|should|would|who|when|where)\b/i.test((query || "").trim());
      recs.forEach(function (d) {
        if (!passes(d, F)) return;
        if (!hasQuery) { out.push({ id: d.r.id, score: 0, reasons: ["Matches your filters."] }); return; }
        var x = score(d, ctx); if (x) { if (ql && d.r.type === "question") x.score += 30; out.push(x); }
      });
      // facets over results BEFORE facet filters (so counts show what each filter would give)
      var facets = { types: {}, subjects: {}, status: {}, sourceTypes: {} };
      var Fnone = { author: F.author, concept: F.concept, from: F.from, to: F.to };
      recs.forEach(function (d) { if (!passes(d, Fnone)) return; var x = hasQuery ? score(d, ctx) : { id: d.r.id }; if (!x) return; facets.types[d.r.type] = (facets.types[d.r.type] || 0) + 1; (d.subjects || []).forEach(function (s) { facets.subjects[s] = (facets.subjects[s] || 0) + 1; }); if (d.r.reviewStatus) facets.status[d.r.reviewStatus] = (facets.status[d.r.reviewStatus] || 0) + 1; facets.sourceTypes[d.r.sourceType] = (facets.sourceTypes[d.r.sourceType] || 0) + 1; });
      var sort = opts.sort || "relevance";
      var ti = function (r) { return TYPE_ORDER.indexOf(r.type); };
      out.sort(function (a, b) {
        var ra = R.get(a.id).r, rb = R.get(b.id).r;
        if (sort === "date") { var ya = R.get(a.id).year || 0, yb = R.get(b.id).year || 0; return (yb - ya) || (b.score - a.score); }
        if (sort === "title") return ra.title.localeCompare(rb.title);
        return (b.score - a.score) || (ti(ra) - ti(rb)) || ra.title.localeCompare(rb.title);
      });
      if (!out.length && hasQuery && !opts.noPrefix && raw.length) {
        var lt = raw[raw.length - 1];
        if (lt.length >= 3) { var cand = null, cf = -1; lex.forEach(function (f, w) { if (w.indexOf(lt) === 0 && w !== lt && f > cf) { cand = w; cf = f; } });
          if (cand) { var again = search(raw.slice(0, -1).concat(cand).join(" "), Object.assign({}, opts, { noPrefix: true, exact: true })); again.expanded = { from: lt, to: cand }; again.query = query; return again; } }
      }
      var total = out.length, off = opts.offset || 0, lim = opts.limit || 10;
      var qlike = ql;
      return { query: query, parsed: p, terms: rec.terms, corrected: corrected, correctedFrom: cor.changes, total: total, all: out.map(function (x) { return x.id; }),
        results: out.slice(off, off + lim).map(function (x) { return Object.assign({ record: R.get(x.id).r }, x); }), facets: facets, questionLike: qlike, usedFilters: F };
    }

    // ---------- groups by research context ----------
    function group(all, perGroup) {
      var by = {}; all.forEach(function (id) { var t = R.get(id).r.type; (by[t] = by[t] || []).push(id); });
      return TYPE_ORDER.filter(function (t) { return by[t]; }).map(function (t) { return { type: t, label: TYPE_LABEL[t], note: GROUP_NOTE[t], ids: by[t], shown: by[t].slice(0, perGroup || 3) }; });
    }

    // ---------- suggestions ----------
    function suggest(prefix, n) {
      var p = norm(prefix); if (p.length < 2) return [];
      var out = [], seen = new Set();
      function push(o) { var k = o.kind + ":" + (o.id || o.label); if (seen.has(k)) return; seen.add(k); out.push(o); }
      var starts = function (s) { var ns = norm(s); return ns.indexOf(p) === 0 || ns.split(" ").some(function (w, i, a) { return i > 0 && (a.slice(i).join(" ")).indexOf(p) === 0; }); };
      var pri = { concept: 0, theory: 1, article: 2, question: 3, museum: 4, source: 5, comparison: 6, contribution: 7 };
      var cands = [];
      recs.forEach(function (d) {
        var r = d.r;
        if (d.nt.indexOf(p) === 0) cands.push({ k: 0, pr: pri[r.type], o: { kind: "record", id: r.id, label: r.title, type: r.type } });
        else if (d.alts.some(function (a) { return a.indexOf(p) === 0; })) cands.push({ k: 1, pr: pri[r.type], o: { kind: "record", id: r.id, label: r.title, type: r.type, hint: "also “" + (r.alt || []).filter(function (a) { return norm(a).indexOf(p) === 0; })[0] + "”" } });
        else if (starts(r.title)) cands.push({ k: 2, pr: pri[r.type], o: { kind: "record", id: r.id, label: r.title, type: r.type } });
        (r.authors || []).forEach(function (a) { if (starts(a) && /\s/.test(a) && a.length < 40) cands.push({ k: 3, pr: 9, o: { kind: "author", label: a, hint: "Author" } }); });
      });
      vocab.concepts.forEach(function (c) { var rid = "concept:" + c.id; if (!R.has(rid)) return; if (c.aliases.some(function (a) { return norm(a).indexOf(p) === 0; }) && norm(c.label).indexOf(p) !== 0) cands.push({ k: 1, pr: 0, o: { kind: "record", id: rid, label: c.label, type: "concept", hint: "matches “" + c.aliases.filter(function (a) { return norm(a).indexOf(p) === 0; })[0] + "”" } }); });
      cands.sort(function (a, b) { return (a.k - b.k) || (a.pr - b.pr) || a.o.label.localeCompare(b.o.label); });
      cands.forEach(function (c) { push(c.o); });
      return out.slice(0, n || 8);
    }

    // ---------- connections ----------
    function connections(query) {
      var rec = ie.recognise(query), terms = rec.terms.map(function (t) { return t.concept; });
      var rel = [], seen = new Set(terms);
      function add(c, kind, via) { if (seen.has(c) || !vocab.concepts.some(function (v) { return v.id === c; })) return; seen.add(c); var rid = "concept:" + c; rel.push({ id: c, label: ie.label(c), kind: kind, via: ie.label(via), record: R.has(rid) ? rid : null, atlas: (R.get(rid) && /#dossier-/.test(R.get(rid).r.url)) ? R.get(rid).r.url : null }); }
      terms.forEach(function (t) {
        (vocab.atlasLinks || []).forEach(function (l) { if (l[0] === t) add(l[1], "atlas", t); else if (l[1] === t) add(l[0], "atlas", t); });
        vocab.links.forEach(function (l) { if (l.a === t) add(l.b, l.kind === "same" ? "same" : "near", t); else if (l.b === t) add(l.a, l.kind === "same" ? "same" : "near", t); });
      });
      return { terms: rec.terms, related: rel.slice(0, 12), atlas: terms.map(function (t) { var r = R.get("concept:" + t); return r && /#dossier-/.test(r.r.url) ? { label: ie.label(t), url: r.r.url } : null; }).filter(Boolean) };
    }

    return { search: search, suggest: suggest, group: group, connections: connections, parse: parse, get: function (id) { var d = R.get(id); return d ? d.r : null; },
      facetValues: function () { return { types: TYPE_ORDER.filter(function (t) { return facetValues.types.has(t); }), subjects: (vocab.subjects || []).filter(function (s) { return facetValues.subjects.has(s); }), status: Array.from(facetValues.status), sourceTypes: Array.from(facetValues.sourceTypes), years: yrs.length ? [Math.min.apply(null, yrs), Math.max.apply(null, yrs)] : null }; },
      counts: function () { return index.meta.counts; }, meta: function () { return index.meta; }, typeLabel: TYPE_LABEL, groupNote: GROUP_NOTE, engine: ie, label: ie.label };
  }
  var api = { create: create, TYPE_LABEL: TYPE_LABEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.SearchEngine = api;
})(typeof self !== "undefined" ? self : this);
