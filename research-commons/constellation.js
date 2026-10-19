/* The Question Constellation: drawing and layout only.
   It draws exactly the nodes and links it is given. It never invents a link, ranks anything, or counts popularity. Position carries no meaning:
   the layout only keeps linked records near each other so the picture is readable, and it is deterministic (same records, same picture).
   All text is inserted with textContent. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  function sv(t, a, ...k) {
    const e = document.createElementNS(NS, t);
    for (const [n, v] of Object.entries(a || {})) { if (v == null || v === false) continue; if (n.startsWith("on")) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v === true ? "" : v); }
    for (const c of k.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  function seeded(str) {            // mulberry32 over an FNV-1a hash of the ids, so the layout is reproducible
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const W = 1000, H = 680;
  /* Layout: each connected group of records is arranged on its own (a force layout that keeps linked records near each other), then the groups are
     packed side by side, and records with no link at all are set out in a tidy grid below. Position carries no meaning. Deterministic. */
  function components(ids, edges) {
    const parent = {}; ids.forEach(i => { parent[i] = i; });
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    edges.forEach(e => { if (parent[e.a] !== undefined && parent[e.b] !== undefined) { const a = find(e.a), b = find(e.b); if (a !== b) parent[a < b ? b : a] = a < b ? a : b; } });
    const groups = {};
    ids.forEach(i => { (groups[find(i)] = groups[find(i)] || []).push(i); });
    return Object.values(groups);
  }
  function forceLayout(ids, edges, side, rnd) {
    const pos = {}, n = ids.length;
    if (n === 1) { pos[ids[0]] = { x: side / 2, y: side / 2 }; return pos; }
    ids.forEach((id, i) => { const a = (i / n) * Math.PI * 2, r = side * .3 + rnd() * side * .15; pos[id] = { x: side / 2 + Math.cos(a) * r, y: side / 2 + Math.sin(a) * r, dx: 0, dy: 0 }; });
    const k = side / Math.sqrt(n) * .85, E = edges.filter(e => pos[e.a] && pos[e.b] && e.a !== e.b);
    let t = side / 6;
    for (let it = 0; it < 300; it++) {
      ids.forEach(id => { pos[id].dx = 0; pos[id].dy = 0; });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const p = pos[ids[i]], q = pos[ids[j]];
        let dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 < .01) { dx = rnd() - .5; dy = rnd() - .5; d2 = dx * dx + dy * dy + .01; }
        const d = Math.sqrt(d2), f = (k * k) / d;
        p.dx += (dx / d) * f; p.dy += (dy / d) * f; q.dx -= (dx / d) * f; q.dy -= (dy / d) * f;
      }
      for (const e of E) {
        const p = pos[e.a], q = pos[e.b], dx = p.x - q.x, dy = p.y - q.y, d = Math.sqrt(dx * dx + dy * dy) || .01, f = (d * d) / k;
        p.dx -= (dx / d) * f; p.dy -= (dy / d) * f; q.dx += (dx / d) * f; q.dy += (dy / d) * f;
      }
      ids.forEach(id => {
        const p = pos[id];
        p.dx += (side / 2 - p.x) * .03; p.dy += (side / 2 - p.y) * .03;
        const d = Math.sqrt(p.dx * p.dx + p.dy * p.dy) || .01, m = Math.min(d, t);
        p.x += (p.dx / d) * m; p.y += (p.dy / d) * m;
      });
      t *= .985;
    }
    // normalise into [0, side]
    const xs = ids.map(i => pos[i].x), ys = ids.map(i => pos[i].y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = x1 - x0 > .01 ? Math.min(3, side / (x1 - x0)) : 1, sy = y1 - y0 > .01 ? Math.min(3, side / (y1 - y0)) : 1;
    const out = {}; ids.forEach(i => { out[i] = { x: (pos[i].x - x0) * sx, y: (pos[i].y - y0) * sy }; });
    return out;
  }
  function layout(nodes, edges) {
    const ids = nodes.map(n => n.id).sort(), rnd = seeded(ids.join("|")), pos = {};
    const comps = components(ids, edges).sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
    const linked = comps.filter(c => c.length > 1), lone = comps.filter(c => c.length === 1).map(c => c[0]).sort();
    let x = 0, y = 0, rowH = 0; const maxW = 1250, gap = 110;
    for (const c of linked) {
      const side = Math.max(170, 165 * Math.sqrt(c.length)), local = forceLayout(c.slice().sort(), edges, side, rnd), w = side + 160;
      if (x > 0 && x + w > maxW) { x = 0; y += rowH + gap; rowH = 0; }
      c.forEach(id => { pos[id] = { x: x + local[id].x, y: y + local[id].y }; });
      x += w + gap / 2; rowH = Math.max(rowH, side);
    }
    if (lone.length) {
      if (linked.length) { y += rowH + gap; }
      const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(lone.length)))), cw = 260;
      lone.forEach((id, i) => { pos[id] = { x: (i % cols) * cw, y: y + Math.floor(i / cols) * 46 }; });
    }
    for (const id of ids) { pos[id].x = Math.round(pos[id].x * 10) / 10; pos[id].y = Math.round(pos[id].y * 10) / 10; }
    return pos;
  }
  const SHAPE = {
    contribution: (c) => sv("path", { class: "sh", d: `M0 -13 L13 0 L0 13 L-13 0Z` }),                  // diamond
    question: () => sv("circle", { class: "sh", r: 11 }),                                              // circle
    concept: () => sv("rect", { class: "sh", x: -10, y: -10, width: 20, height: 20, rx: 3 }),          // rounded square
    other: () => sv("path", { class: "sh", d: "M0 -12 L11 -6 L11 6 L0 12 L-11 6 L-11 -6Z" }),         // hexagon
  };

  function mount(host, opts) {
    const { nodes, edges, kindLabel, nodeLabel, onSelect } = opts;
    const pos = layout(nodes, edges);
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const nbr = {};
    edges.forEach(e => { (nbr[e.a] = nbr[e.a] || []).push(e); (nbr[e.b] = nbr[e.b] || []).push(e); });
    let sel = null, vp = { x: 0, y: 0, k: 1 }, hidden = new Set(), marked = null;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Question constellation map. The same records are listed below the map, and you can explore them there without the map.", tabindex: "0" });
    const g = sv("g", { class: "vp" }), eg = sv("g"), lg = sv("g"), ng = sv("g");
    g.append(eg, ng, lg); svg.append(g);
    const eEls = new Map(), nEls = new Map();
    edges.forEach((e, i) => {
      if (!pos[e.a] || !pos[e.b]) return;
      const el = sv("line", { class: "e " + e.kind, x1: pos[e.a].x, y1: pos[e.a].y, x2: pos[e.b].x, y2: pos[e.b].y }, sv("title", null, `${nodeLabel(byId[e.a])} — ${nodeLabel(byId[e.b])}: ${kindLabel(e.kind)}`));
      eg.append(el); eEls.set(i, el);
    });
    nodes.slice().sort((a, b) => a.id < b.id ? -1 : 1).forEach(nd => {
      const p = pos[nd.id], deg = (nbr[nd.id] || []).length;
      const shape = (SHAPE[nd.type] || SHAPE.other)();
      const lab = (nd.label || "").length > 24 ? nd.label.slice(0, 23) + "…" : nd.label;
      const el = sv("g", { class: "nd " + (SHAPE[nd.type] ? nd.type : "other"), transform: `translate(${p.x} ${p.y})`, tabindex: "0", role: "button", "aria-pressed": "false",
        "aria-label": `${nodeLabel(nd)}, ${nd.typeLabel || nd.type}, ${deg} ${deg === 1 ? "connection" : "connections"}` },
        sv("rect", { class: "hit", x: -16, y: -16, width: 30 + lab.length * 8.6, height: 32, fill: "transparent" }), shape, sv("text", { x: 18, y: 5 }, lab));
      el.addEventListener("click", ev => { ev.stopPropagation(); api.select(sel === nd.id ? null : nd.id, true); });
      el.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); api.select(sel === nd.id ? null : nd.id, true); } });
      ng.append(el); nEls.set(nd.id, el);
    });
    function apply() { g.setAttribute("transform", `translate(${vp.x} ${vp.y}) scale(${vp.k})`); }
    function fit() {
      const vis = nodes.filter(n => !hidden.has(n.id));
      if (!vis.length) { vp = { x: 0, y: 0, k: 1 }; apply(); return; }
      const xs = vis.map(n => pos[n.id].x), ys = vis.map(n => pos[n.id].y);
      const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 230, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
      const k = Math.max(.3, Math.min(2.2, Math.min(W / (x1 - x0), H / (y1 - y0))));
      vp = { k, x: (W - (x1 + x0) * k) / 2, y: (H - (y1 + y0) * k) / 2 }; apply();
    }
    function zoomBy(f, cx = W / 2, cy = H / 2) {
      const nk = Math.max(.35, Math.min(4, vp.k * f)), r = nk / vp.k;
      vp = { k: nk, x: cx - (cx - vp.x) * r, y: cy - (cy - vp.y) * r }; apply();
    }
    function toSvg(ev) { const b = svg.getBoundingClientRect(); return [(ev.clientX - b.left) * (W / b.width), (ev.clientY - b.top) * (H / b.height)]; }
    // pan with a pointer; pinch with two
    const ptrs = new Map(); let last = null, pinch = 0, moved = false;
    svg.addEventListener("pointerdown", ev => {
      if (ev.target.closest(".nd")) return;
      svg.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, ev); moved = false;
      last = toSvg(ev); svg.classList.add("drag");
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    });
    svg.addEventListener("pointermove", ev => {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.set(ev.pointerId, ev);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch) zoomBy(d / pinch, ...toSvg({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }));
        pinch = d; moved = true; return;
      }
      const p = toSvg(ev); vp.x += p[0] - last[0]; vp.y += p[1] - last[1]; last = p; moved = true; apply();
    });
    const end = ev => { ptrs.delete(ev.pointerId); if (!ptrs.size) { svg.classList.remove("drag"); pinch = 0; } };
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    svg.addEventListener("click", ev => { if (!ev.target.closest(".nd") && !moved && sel) api.select(null, true); });
    svg.addEventListener("wheel", ev => { if (!(ev.ctrlKey || ev.metaKey)) return; ev.preventDefault(); zoomBy(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ...toSvg(ev)); }, { passive: false });
    svg.addEventListener("keydown", ev => {
      if (ev.target !== svg) return;
      const s = 40;
      if (ev.key === "+" || ev.key === "=") zoomBy(1.2); else if (ev.key === "-" || ev.key === "_") zoomBy(1 / 1.2); else if (ev.key === "0") fit();
      else if (ev.key === "ArrowLeft") vp.x += s; else if (ev.key === "ArrowRight") vp.x -= s; else if (ev.key === "ArrowUp") vp.y += s; else if (ev.key === "ArrowDown") vp.y -= s;
      else return;
      ev.preventDefault(); apply();
    });
    function paint() {
      const hl = sel ? new Set([sel, ...(nbr[sel] || []).flatMap(e => [e.a, e.b])]) : null;
      nodes.forEach(n => {
        const el = nEls.get(n.id);
        el.style.display = hidden.has(n.id) ? "none" : "";
        el.classList.toggle("sel", sel === n.id);
        el.setAttribute("aria-pressed", String(sel === n.id));
        el.classList.toggle("dim", !!((hl && !hl.has(n.id)) || (marked && !marked.has(n.id))));
      });
      edges.forEach((e, i) => {
        const el = eEls.get(i); if (!el) return;
        el.style.display = hidden.has(e.a) || hidden.has(e.b) ? "none" : "";
        const on = sel && (e.a === sel || e.b === sel);
        el.classList.toggle("on", !!on); el.classList.toggle("dim", !!(sel && !on) || !!(marked && !(marked.has(e.a) && marked.has(e.b))));
      });
      lg.replaceChildren();
      if (sel) (nbr[sel] || []).forEach(e => {
        if (hidden.has(e.a) || hidden.has(e.b)) return;
        const p = pos[e.a], q = pos[e.b];
        lg.append(sv("text", { class: "elab", x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 - 4, "text-anchor": "middle", style: "fill:#ece9e1;font-size:10px;paint-order:stroke;stroke:#070908;stroke-width:3px;pointer-events:none" }, kindLabel(e.kind)));
      });
    }
    const api = {
      el: svg,
      select(id, user) { sel = id && byId[id] ? id : null; paint(); if (onSelect) onSelect(sel, !!user); },
      get selected() { return sel; },
      show(ids) { hidden = new Set(nodes.filter(n => ids && !ids.has(n.id)).map(n => n.id)); if (sel && hidden.has(sel)) sel = null; paint(); },
      mark(ids) { marked = ids && ids.size ? ids : null; paint(); },
      zoomIn() { zoomBy(1.25); }, zoomOut() { zoomBy(1 / 1.25); }, reset() { fit(); },
      focusNode(id) { const el = nEls.get(id); if (el) el.focus(); },
      positions: pos,
    };
    host.replaceChildren(svg);
    fit(); paint();
    return api;
  }
  window.Constellation = { mount, layout, W, H };
})();
