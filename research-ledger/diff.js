/* Paragraph and word comparison for COMPARE VERSIONS. Pure functions, no DOM, no network.
   It compares only the two texts it is given. It never invents text, and identical paragraphs are never marked as changed. */
(function (root) {
  "use strict";

  /* Longest common subsequence of two arrays under an equality predicate. Returns ops in order. */
  function lcsOps(a, b, eq) {
    var n = a.length, m = b.length, i, j;
    var w = m + 1, dp = new Uint32Array((n + 1) * w);
    for (i = n - 1; i >= 0; i--) {
      for (j = m - 1; j >= 0; j--) {
        dp[i * w + j] = eq(a[i], b[j]) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { ops.push({ t: "eq", ai: i, bi: j }); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ t: "del", ai: i }); i++; }
      else { ops.push({ t: "ins", bi: j }); j++; }
    }
    while (i < n) { ops.push({ t: "del", ai: i++ }); }
    while (j < m) { ops.push({ t: "ins", bi: j++ }); }
    return ops;
  }

  function tokens(s) { return String(s).match(/\s+|[^\s]+/g) || []; }

  function wordSet(s) {
    var set = Object.create(null), t = String(s).toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
    for (var i = 0; i < t.length; i++) set[t[i]] = 1;
    return set;
  }

  function similarity(a, b) {
    var sa = wordSet(a), sb = wordSet(b), inter = 0, ua = 0, ub = 0, k;
    for (k in sa) { ua++; if (sb[k]) inter++; }
    for (k in sb) ub++;
    var union = ua + ub - inter;
    return union === 0 ? 1 : inter / union;
  }

  /* Word-level runs for one changed paragraph: [{t:"same"|"add"|"del", text}] */
  function wordDiff(oldText, newText) {
    var ops = lcsOps(tokens(oldText), tokens(newText), function (x, y) { return x === y; });
    var ta = tokens(oldText), tb = tokens(newText), runs = [];
    function push(t, text) {
      var last = runs[runs.length - 1];
      if (last && last.t === t) last.text += text; else runs.push({ t: t, text: text });
    }
    for (var k = 0; k < ops.length; k++) {
      var op = ops[k];
      if (op.t === "eq") push("same", ta[op.ai]);
      else if (op.t === "del") push("del", ta[op.ai]);
      else push("add", tb[op.bi]);
    }
    return runs;
  }

  /* Paragraph rows: {kind:"same"|"add"|"remove"|"change", oldIndex, newIndex, oldText, newText, runs}
     A removed and an added paragraph are shown as one "change" only when they are clearly versions of each other. */
  function paragraphs(oldArr, newArr, threshold) {
    threshold = threshold == null ? 0.45 : threshold;
    var base = lcsOps(oldArr, newArr, function (x, y) { return x === y; });
    var rows = [], k = 0;
    while (k < base.length) {
      if (base[k].t === "eq") {
        rows.push({ kind: "same", oldIndex: base[k].ai, newIndex: base[k].bi, oldText: oldArr[base[k].ai], newText: newArr[base[k].bi] });
        k++; continue;
      }
      var dels = [], inss = [];
      while (k < base.length && base[k].t !== "eq") {
        if (base[k].t === "del") dels.push(base[k].ai); else inss.push(base[k].bi);
        k++;
      }
      var pair = lcsOps(dels, inss, function (x, y) { return similarity(oldArr[x], newArr[y]) >= threshold; });
      for (var p = 0; p < pair.length; p++) {
        var o = pair[p];
        if (o.t === "eq") {
          var oi = dels[o.ai], ni = inss[o.bi];
          rows.push({ kind: "change", oldIndex: oi, newIndex: ni, oldText: oldArr[oi], newText: newArr[ni], runs: wordDiff(oldArr[oi], newArr[ni]) });
        } else if (o.t === "del") {
          rows.push({ kind: "remove", oldIndex: dels[o.ai], newIndex: null, oldText: oldArr[dels[o.ai]], newText: null });
        } else {
          rows.push({ kind: "add", oldIndex: null, newIndex: inss[o.bi], oldText: null, newText: newArr[inss[o.bi]] });
        }
      }
    }
    return rows;
  }

  function summarize(rows) {
    var s = { same: 0, add: 0, remove: 0, change: 0 };
    rows.forEach(function (r) { s[r.kind]++; });
    s.changed = s.add + s.remove + s.change;
    return s;
  }

  /* Plain-text description of one row for screen readers and the change list. */
  function describe(row) {
    function cut(t) { t = String(t); return t.length > 110 ? t.slice(0, 107).trimEnd() + "…" : t; }
    if (row.kind === "add") return "Paragraph added: " + cut(row.newText);
    if (row.kind === "remove") return "Paragraph removed: " + cut(row.oldText);
    if (row.kind === "change") {
      var add = 0, del = 0;
      row.runs.forEach(function (r) { if (r.t === "add") add += r.text.trim().split(/\s+/).filter(Boolean).length; if (r.t === "del") del += r.text.trim().split(/\s+/).filter(Boolean).length; });
      function w(n) { return n + (n === 1 ? " word" : " words"); }
      return "Paragraph changed (" + w(add) + " added, " + del + " removed): " + cut(row.newText);
    }
    return "Unchanged: " + cut(row.newText);
  }

  var api = { lcsOps: lcsOps, similarity: similarity, wordDiff: wordDiff, paragraphs: paragraphs, summarize: summarize, describe: describe };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LedgerDiff = api;
})(typeof window !== "undefined" ? window : this);
