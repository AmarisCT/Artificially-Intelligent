"use strict";
/* Learning Institute: shared helpers and interactive activities. All text goes in through textContent. */
(function (root) {
  function h(t, a) { var e = document.createElement(t); a = a || {}; Object.keys(a).forEach(function (n) { var v = a[n]; if (v == null || v === false) return; if (n === "class") e.className = v; else if (n.indexOf("on") === 0) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v === true ? "" : v); }); for (var i = 2; i < arguments.length; i++) [].concat(arguments[i]).flat(9).forEach(function (k) { if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); }); return e; }
  var NS = "http://www.w3.org/2000/svg";
  function sv(t, a) { var e = document.createElementNS(NS, t); Object.keys(a || {}).forEach(function (n) { e.setAttribute(n, a[n]); }); for (var i = 2; i < arguments.length; i++) [].concat(arguments[i]).forEach(function (k) { if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k))); }); return e; }
  /* deterministic helpers */
  function hash(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, seed) { var r = rng(typeof seed === "string" ? hash(seed) : seed), a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var uid = 0; function nid(p) { return p + (++uid); }

  /* ---------- match (activity and check) ---------- */
  function match(pairs, extra, seed, onResult) {
    var rights = shuffle(pairs.map(function (p) { return p[1]; }).concat(extra || []), seed + "m");
    var rows = pairs.map(function (p, i) { var id = nid("m"); return { id: id, p: p, sel: h("select", { class: "sel", id: id }, h("option", { value: "" }, "Choose…"), rights.map(function (r) { return h("option", { value: r }, r); })) }; });
    var out = h("div", { "aria-live": "polite" });
    var box = h("div", null, rows.map(function (r) { return h("div", { class: "mrow" }, h("label", { for: r.id }, r.p[0]), r.sel); }),
      h("div", { class: "row" }, h("button", { class: "btn sm primary", type: "button", onclick: check }, "Check answers"), h("button", { class: "btn sm", type: "button", onclick: function () { rows.forEach(function (r) { r.sel.value = ""; }); out.textContent = ""; } }, "Reset")), out);
    function check() {
      var unans = rows.filter(function (r) { return !r.sel.value; });
      if (unans.length) { out.textContent = ""; out.append(h("div", { class: "fb no" }, "Choose an answer for every item first. " + unans.length + " left.")); return; }
      var ok = 0, li = rows.map(function (r) { var good = r.sel.value === r.p[1]; if (good) ok++; return h("li", null, good ? "Correct: " : "Not quite: ", h("b", null, r.p[0]), good ? " → " + r.p[1] : " → the best match is “" + r.p[1] + "”."); });
      out.textContent = ""; out.append(h("div", { class: "fb " + (ok === rows.length ? "ok" : "no") }, ok + " of " + rows.length + " matched.", h("ul", null, li)));
      if (onResult) onResult(ok === rows.length, rows.map(function (r) { return r.sel.value; }));
    }
    return box;
  }

  /* ---------- steps / thought experiment ---------- */
  function steps(steps) {
    var box = h("div"), i = 0;
    function show(n) {
      var s = steps[n], fb = h("div", { "aria-live": "polite" }), btns = [];
      var card = h("div", { class: "stepcard" }, h("p", { class: "meta" }, "Step " + (n + 1) + " of " + steps.length), h("p", null, h("b", null, s.q)),
        h("div", { class: "choice" }, s.opts.map(function (o, k) { var b = h("button", { type: "button", onclick: function () { btns.forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); fb.textContent = ""; fb.append(h("div", { class: "fb" }, o[1])); next.hidden = false; } }, o[0]); btns.push(b); return b; })), fb);
      var next = h("button", { class: "btn sm primary", type: "button", hidden: "", onclick: function () { if (n < steps.length - 1) { show(n + 1); } else { box.append(h("p", { class: "meta" }, "That is the end of the thought experiment. You can go back and try the other options.")); next.hidden = true; } } }, n < steps.length - 1 ? "Next step →" : "Finish");
      box.textContent = ""; box.append(card, next, n > 0 ? h("button", { class: "btn sm", type: "button", style: "margin-left:8px", onclick: function () { show(n - 1); } }, "← Back") : null);
    }
    show(0); return box;
  }

  /* ---------- claims (select the limitations) ---------- */
  function claims(a, seed, onResult) {
    var opts = shuffle(a.options, seed + "c"), out = h("div", { "aria-live": "polite" });
    var boxes = opts.map(function (o) { var id = nid("c"); return { o: o, id: id, cb: h("input", { type: "checkbox", id: id }) }; });
    var el = h("div", null, h("blockquote", { class: "q" }, a.claim), h("div", { class: "choice" }, boxes.map(function (b) { return h("label", { for: b.id }, b.cb, b.o[0]); })),
      h("div", { class: "row" }, h("button", { class: "btn sm primary", type: "button", onclick: function () {
        var good = 0; var li = boxes.map(function (b) { var picked = b.cb.checked, right = !!b.o[1]; var ok = picked === right; if (ok) good++; return h("li", null, h("b", null, ok ? "Correct. " : "Reconsider. "), (right ? "This applies: " : "This does not apply: ") + b.o[0] + " ", b.o[2]); });
        out.textContent = ""; out.append(h("div", { class: "fb " + (good === boxes.length ? "ok" : "no") }, good + " of " + boxes.length + " judged as expected.", h("ul", null, li)));
        if (onResult) onResult(good === boxes.length, boxes.map(function (b) { return b.cb.checked ? b.o[0] : null; }).filter(Boolean));
      } }, "Check my answer"), h("button", { class: "btn sm", type: "button", onclick: function () { boxes.forEach(function (b) { b.cb.checked = false; }); out.textContent = ""; } }, "Reset")), out);
    return el;
  }

  /* ---------- order ---------- */
  function order(items, seed) {
    var cur = shuffle(items, seed + "o"), out = h("div", { "aria-live": "polite" }), list = h("ol", { style: "padding-left:22px" });
    function draw(focusIdx) {
      list.textContent = "";
      cur.forEach(function (it, i) { list.append(h("li", { style: "margin:8px 0" }, h("span", null, it[1] + " "), h("span", { class: "row", style: "display:inline-flex;margin-left:8px" },
        h("button", { class: "btn sm", type: "button", "aria-label": "Move up: " + it[1], disabled: i === 0 ? "" : null, onclick: function () { var t = cur[i - 1]; cur[i - 1] = cur[i]; cur[i] = t; draw(i - 1); } }, "↑"),
        h("button", { class: "btn sm", type: "button", "aria-label": "Move down: " + it[1], disabled: i === cur.length - 1 ? "" : null, onclick: function () { var t = cur[i + 1]; cur[i + 1] = cur[i]; cur[i] = t; draw(i + 1); } }, "↓")))); });
      if (focusIdx != null) { var bs = list.children[focusIdx].querySelectorAll("button"); (bs[0].disabled ? bs[1] : bs[0]).focus(); }
    }
    draw();
    return h("div", null, list, h("button", { class: "btn sm primary", type: "button", onclick: function () {
      var ok = cur.every(function (it, i) { return it === items[i]; }); out.textContent = "";
      out.append(h("div", { class: "fb " + (ok ? "ok" : "no") }, ok ? "That order is correct." : "Not yet in order. The earliest item is first.", h("ul", null, items.map(function (it) { return h("li", null, it[0] + ": " + it[1]); }))));
    } }, "Check order"), out);
  }

  /* ---------- fit explorer ---------- */
  function solve(A, b) { var n = b.length; for (var i = 0; i < n; i++) { var m = i; for (var r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; var t = A[i]; A[i] = A[m]; A[m] = t; var tb = b[i]; b[i] = b[m]; b[m] = tb; var d = A[i][i] || 1e-12; for (var r2 = i + 1; r2 < n; r2++) { var f = A[r2][i] / d; for (var c = i; c < n; c++) A[r2][c] -= f * A[i][c]; b[r2] -= f * b[i]; } } var x = new Array(n).fill(0); for (var i2 = n - 1; i2 >= 0; i2--) { var s = b[i2]; for (var c2 = i2 + 1; c2 < n; c2++) s -= A[i2][c2] * x[c2]; x[i2] = s / (A[i2][i2] || 1e-12); } return x; }
  function polyfit(xs, ys, deg) { var n = deg + 1, A = [], b = []; for (var i = 0; i < n; i++) { A.push(new Array(n).fill(0)); b.push(0); } for (var k = 0; k < xs.length; k++) { var pw = [1]; for (var p = 1; p < 2 * n; p++) pw.push(pw[p - 1] * xs[k]); for (var i2 = 0; i2 < n; i2++) { b[i2] += ys[k] * pw[i2]; for (var j = 0; j < n; j++) A[i2][j] += pw[i2 + j]; } } for (var d = 0; d < n; d++) A[d][d] += 1e-9; return solve(A, b); }
  var peval = function (c, x) { var s = 0; for (var i = c.length - 1; i >= 0; i--) s = s * x + c[i]; return s; };
  function fit() {
    var r = rng(20261016), f = function (x) { return Math.sin(2.2 * x) * 0.7; };
    var train = [], test = [];
    for (var i = 0; i < 10; i++) { var x = -1 + 2 * (i + 0.5) / 10; train.push([x, f(x) + (r() - 0.5) * 0.5]); }
    for (var j = 0; j < 10; j++) { var x2 = -1 + 2 * r(); test.push([x2, f(x2) + (r() - 0.5) * 0.5]); }
    var W = 560, H = 300, px = function (x) { return 30 + (x + 1) / 2 * (W - 60); }, py = function (y) { return H / 2 - y * 120; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Scatter of training points, test points and a fitted curve" });
    var out = h("div", { "aria-live": "polite" }), tbody = h("tbody"), degEl = h("span"), slider = h("input", { type: "range", min: "1", max: "9", value: "3", id: nid("deg"), "aria-label": "Flexibility of the curve (polynomial degree)" });
    var rmse = function (c, pts) { return Math.sqrt(pts.reduce(function (s, p) { var e = peval(c, p[0]) - p[1]; return s + e * e; }, 0) / pts.length); };
    var table = {};
    function draw() {
      var deg = +slider.value, c = polyfit(train.map(function (p) { return p[0]; }), train.map(function (p) { return p[1]; }), deg);
      svg.textContent = ""; svg.append(sv("line", { x1: 30, x2: W - 30, y1: H / 2, y2: H / 2, stroke: "#232a2b" }));
      var d = ""; for (var k = 0; k <= 120; k++) { var x = -1 + 2 * k / 120, y = Math.max(-1.2, Math.min(1.2, peval(c, x))); d += (k ? "L" : "M") + px(x).toFixed(1) + " " + py(y).toFixed(1); }
      svg.append(sv("path", { d: d, fill: "none", stroke: "#b9c2c4", "stroke-width": 2 }));
      train.forEach(function (p) { svg.append(sv("circle", { cx: px(p[0]), cy: py(p[1]), r: 5, fill: "#8fe9c4" })); });
      test.forEach(function (p) { svg.append(sv("circle", { cx: px(p[0]), cy: py(p[1]), r: 5, fill: "none", stroke: "#9aa3a0", "stroke-width": 2 })); });
      var tr = rmse(c, train), te = rmse(c, test); table[deg] = [tr, te];
      slider.setAttribute("aria-valuetext", "degree " + deg); degEl.textContent = "Flexibility (degree): " + deg;
      tbody.textContent = ""; Object.keys(table).sort(function (a, b) { return a - b; }).forEach(function (k2) { tbody.append(h("tr", null, h("td", null, k2), h("td", null, table[k2][0].toFixed(2)), h("td", null, table[k2][1].toFixed(2)))); });
      out.textContent = "Degree " + deg + ": error on the points used for fitting is " + tr.toFixed(2) + "; error on the held-back points is " + te.toFixed(2) + (te > tr * 2 && deg > 4 ? ". The curve is bending to fit noise in the fitting points: this is overfitting." : deg <= 1 ? ". A straight line is too rigid to follow the pattern." : ".");
    }
    slider.addEventListener("input", draw); draw();
    return h("div", { class: "fitwrap" }, h("div", { class: "row" }, h("label", { for: slider.id }, degEl), slider), svg, h("p", { class: "meta" }, "Filled mint dots are used to fit the curve. Hollow grey dots are held back to test it."), h("p", null, out),
      h("details", null, h("summary", null, "Table of errors you have tried"), h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Degree"), h("th", null, "Fitting error"), h("th", null, "Held-back error"))), tbody)));
  }

  /* ---------- tiny network trainer ---------- */
  function neuron() {
    var tasks = { AND: [0, 0, 0, 1], OR: [0, 1, 1, 1], XOR: [0, 1, 1, 0] }, X = [[0, 0], [0, 1], [1, 0], [1, 1]];
    var sig = function (z) { return 1 / (1 + Math.exp(-z)); };
    var task = "XOR", hid = 0, seed = 1;
    var out = h("div", { "aria-live": "polite" }), svgBox = h("div", { class: "nnwrap" });
    function train() {
      var y = tasks[task], r = rng(seed * 7919 + hid * 31), H = hid;
      var W1 = [], b1 = [], W2 = [], b2 = 0;
      if (H === 0) { W2 = [r() - .5, r() - .5]; b2 = r() - .5; } else { for (var i = 0; i < H; i++) { W1.push([(r() - .5) * 2, (r() - .5) * 2]); b1.push((r() - .5)); W2.push((r() - .5) * 2); } b2 = r() - .5; }
      var lr = 1.2, epochs = 6000, hist = [];
      function fwd(x) { if (H === 0) { var z = W2[0] * x[0] + W2[1] * x[1] + b2; return { o: sig(z), a: [] }; } var a = W1.map(function (w, i) { return sig(w[0] * x[0] + w[1] * x[1] + b1[i]); }); var z2 = b2; a.forEach(function (v, i) { z2 += W2[i] * v; }); return { o: sig(z2), a: a }; }
      for (var e = 0; e <= epochs; e++) {
        var loss = 0, gW1 = W1.map(function () { return [0, 0]; }), gb1 = b1.map(function () { return 0; }), gW2 = W2.map(function () { return 0; }), gb2 = 0;
        for (var k = 0; k < 4; k++) { var f = fwd(X[k]), d = f.o - y[k]; loss += d * d; var dz = d * f.o * (1 - f.o) * 2;
          if (H === 0) { gW2[0] += dz * X[k][0]; gW2[1] += dz * X[k][1]; gb2 += dz; }
          else { gb2 += dz; for (var i2 = 0; i2 < H; i2++) { gW2[i2] += dz * f.a[i2]; var dh = dz * W2[i2] * f.a[i2] * (1 - f.a[i2]); gW1[i2][0] += dh * X[k][0]; gW1[i2][1] += dh * X[k][1]; gb1[i2] += dh; } } }
        if (e % 1000 === 0) hist.push([e, loss / 4]);
        for (var q = 0; q < W2.length; q++) W2[q] -= lr * gW2[q]; b2 -= lr * gb2;
        for (var m = 0; m < H; m++) { W1[m][0] -= lr * gW1[m][0]; W1[m][1] -= lr * gW1[m][1]; b1[m] -= lr * gb1[m]; }
      }
      var correct = 0, rows = X.map(function (x, k2) { var p = fwd(x).o, pred = p > .5 ? 1 : 0; if (pred === y[k2]) correct++; return h("tr", null, h("td", null, x.join(", ")), h("td", null, y[k2]), h("td", null, p.toFixed(2)), h("td", null, pred === y[k2] ? "right" : "wrong")); });
      out.textContent = ""; out.append(h("p", null, h("b", null, correct + " of 4 inputs correct"), " after training " + (H === 0 ? "a single unit" : "a network with " + H + " hidden units") + " on " + task + "."),
        h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Inputs"), h("th", null, "Target"), h("th", null, "Output"), h("th", null, "Result"))), h("tbody", null, rows)),
        h("p", { class: "meta" }, "Error during training: " + hist.map(function (p2) { return "step " + p2[0] + ": " + p2[1].toFixed(3); }).join("; ") + "."),
        h("div", { class: "fb" }, task === "XOR" && H === 0 ? "A single unit can only draw a straight dividing line. XOR cannot be separated that way, so more training does not fix it. Add hidden units." : correct === 4 ? "The network learned the pattern." : "Training did not find the pattern from this starting point. Try a different starting point."));
      draw(H, W1, W2);
    }
    function draw(H, W1, W2) {
      svgBox.textContent = ""; var s = sv("svg", { viewBox: "0 0 360 200", role: "img", "aria-label": H === 0 ? "Two inputs feeding one output unit" : "Two inputs, " + H + " hidden units, one output" });
      var inY = [70, 130], hy = []; for (var i = 0; i < H; i++) hy.push(100 + (i - (H - 1) / 2) * 44);
      var line = function (x1, y1, x2, y2, w) { return sv("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: w >= 0 ? "#8fe9c4" : "#e9c98a", "stroke-width": Math.min(5, .5 + Math.abs(w)) , opacity: .8}); };
      if (H === 0) { inY.forEach(function (y, i2) { s.append(line(60, y, 290, 100, W2[i2])); }); }
      else { hy.forEach(function (y, k) { inY.forEach(function (yy, i2) { s.append(line(60, yy, 180, y, W1[k][i2])); }); s.append(line(180, y, 290, 100, W2[k])); }); }
      inY.forEach(function (y, i3) { s.append(sv("circle", { cx: 60, cy: y, r: 13, fill: "#0a0d0e", stroke: "#b9c2c4" }), sv("text", { x: 60, y: y + 4, "text-anchor": "middle", fill: "#ece9e1", "font-size": 12 }, "x" + (i3 + 1))); });
      hy.forEach(function (y) { s.append(sv("circle", { cx: 180, cy: y, r: 13, fill: "#0a0d0e", stroke: "#8fe9c4" })); });
      s.append(sv("circle", { cx: 290, cy: 100, r: 15, fill: "#0a0d0e", stroke: "#8fe9c4" }), sv("text", { x: 290, y: 104, "text-anchor": "middle", fill: "#ece9e1", "font-size": 12 }, "out"));
      svgBox.append(s, h("p", { class: "meta" }, "Line thickness shows the size of each learned weight. Mint lines push up, amber lines push down."));
    }
    var mk = function (label, opts, get, set) { var id = nid("nn"); return h("div", null, h("label", { for: id, class: "meta" }, label), h("select", { class: "sel", id: id, onchange: function (e) { set(e.target.value); } }, opts.map(function (o) { return h("option", { value: o[0], selected: String(get()) === String(o[0]) ? "" : null }, o[1]); }))); };
    var root2 = h("div", null, h("div", { class: "row" }, mk("Pattern to learn", [["AND", "AND"], ["OR", "OR"], ["XOR", "XOR (exactly one input is 1)"]], function () { return task; }, function (v) { task = v; }),
      mk("Hidden units", [[0, "None (a single unit)"], [2, "2 hidden units"], [3, "3 hidden units"]], function () { return hid; }, function (v) { hid = +v; }),
      h("div", null, h("br"), h("button", { class: "btn sm primary", type: "button", onclick: train }, "Train")), h("div", null, h("br"), h("button", { class: "btn sm", type: "button", onclick: function () { seed++; train(); } }, "Try a different starting point"))), out, svgBox);
    train(); return root2;
  }

  /* ---------- toy bigram language model ---------- */
  var PASSAGE = "learning is the slow work of changing what we do after we have seen what happens . a child learns a word by hearing it used again and again . a machine learns a pattern by seeing many examples again and again . a word follows a word and a pattern follows a pattern . the model does not know what a word means . it knows which word tends to follow which word . a model can write a sentence that sounds right . a sentence that sounds right is not always a sentence that is true .";
  function bigram() {
    var toks = PASSAGE.split(/\s+/), nx = {};
    for (var i = 0; i < toks.length - 1; i++) { (nx[toks[i]] = nx[toks[i]] || {})[toks[i + 1]] = ((nx[toks[i]] || {})[toks[i + 1]] || 0) + 1; }
    var starts = Object.keys(nx).filter(function (w) { return w !== "."; }).sort(), seq = [], r = rng(99);
    var outp = h("div", { class: "gen", "aria-live": "polite" }), cand = h("div", { class: "choice" }), info = h("p", { class: "meta" });
    function show() {
      outp.textContent = seq.join(" ") || "Choose a starting word.";
      cand.textContent = ""; var last = seq[seq.length - 1]; if (!last) { info.textContent = ""; return; }
      var n = nx[last]; if (!n) { info.textContent = "The model has never seen a word follow “" + last + "” in its passage, so it has nothing to suggest."; return; }
      var tot = Object.keys(n).reduce(function (s, k) { return s + n[k]; }, 0); info.textContent = "After “" + last + "” the passage continued with:";
      Object.keys(n).sort(function (a, b) { return n[b] - n[a]; }).forEach(function (w) { cand.append(h("button", { type: "button", onclick: function () { seq.push(w); show(); } }, w + "  (" + Math.round(100 * n[w] / tot) + "%)")); });
    }
    var sid = nid("bg");
    var sel = h("select", { class: "sel", id: sid, onchange: function (e) { seq = e.target.value ? [e.target.value] : []; show(); } }, h("option", { value: "" }, "Choose…"), starts.map(function (w) { return h("option", { value: w }, w); }));
    show();
    return h("div", null, h("details", null, h("summary", null, "The passage this model learned from"), h("p", { class: "meta" }, PASSAGE)), h("div", { class: "row" }, h("label", { for: sid }, "Starting word"), sel,
      h("button", { class: "btn sm", type: "button", onclick: function () { var last = seq[seq.length - 1]; if (!last || !nx[last]) return; var n = nx[last], keys = Object.keys(n), tot = keys.reduce(function (s, k) { return s + n[k]; }, 0), x = r() * tot; for (var i = 0; i < keys.length; i++) { x -= n[keys[i]]; if (x <= 0) { seq.push(keys[i]); break; } } show(); } }, "Pick by probability"),
      h("button", { class: "btn sm", type: "button", onclick: function () { seq = []; sel.value = ""; show(); } }, "Start over")), outp, info, cand,
      h("p", { class: "meta" }, "A real language model works on the same principle of predicting what comes next, but it uses far more text, longer context and a neural network instead of a count table."));
  }

  root.LI = { h: h, sv: sv, shuffle: shuffle, hash: hash, rng: rng, nid: nid, match: match, steps: steps, claims: claims, order: order, fit: fit, neuron: neuron, bigram: bigram };
})(typeof self !== "undefined" ? self : this);
