/* Global search overlay (Cmd/Ctrl + K). Self-contained: any page can load this file, the shared index and
   search-engine.js. It uses the same engine and ranking as the full search page. */
(function (root) {
  "use strict";
  var NS = null;
  function h(t, a) { var e = document.createElement(t); a = a || {}; Object.keys(a).forEach(function (n) { var v = a[n]; if (v == null || v === false) return; if (n === "class") e.className = v; else if (n.indexOf("on") === 0) e.addEventListener(n.slice(2), v); else e.setAttribute(n, v === true ? "" : v); }); for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; [].concat(c).forEach(function (k) { if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); }); } return e; }
  var safeHref = function (u) { return /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "#"; };
  var enc = function (q) { return btoa(unescape(encodeURIComponent(q))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };

  function mount(opts) {
    var S = opts.engine, searchUrl = opts.searchUrl, navHost = opts.navHost, isFull = opts.isFullSearchPage;
    var overlay = null, input, list, status, last = null, active = -1, items = [];

    function editable(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
    function open() {
      if (overlay) return; last = document.activeElement;
      input = h("input", { id: "gs-q", type: "text", role: "combobox", "aria-expanded": "false", "aria-controls": "gs-list", "aria-autocomplete": "list", "aria-label": "Search all research", placeholder: "Search theories, concepts, essays, questions…", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
      list = h("ul", { id: "gs-list", role: "listbox", "aria-label": "Quick results" });
      status = h("p", { class: "gs-status", role: "status", "aria-live": "polite" }, "Type to search. Searches stay in your browser.");
      var all = h("a", { class: "gs-all", href: "#" }, "See all results →");
      var box = h("div", { class: "gs-box", role: "dialog", "aria-modal": "true", "aria-label": "Search all research" },
        h("div", { class: "gs-top" }, input, h("button", { type: "button", class: "gs-x", "aria-label": "Close search", onclick: close }, "Esc")), list, status, all);
      overlay = h("div", { class: "gs-overlay", onmousedown: function (e) { if (e.target === overlay) close(); } }, box);
      document.body.append(overlay); document.documentElement.classList.add("gs-open");
      input.focus();
      input.addEventListener("input", draw);
      overlay.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
        else if (e.key === "Enter") { e.preventDefault(); if (active >= 0 && items[active]) { go(items[active]); } else if (input.value.trim()) { toFull(); } }
        else if (e.key === "Tab") { var f = overlay.querySelectorAll("input,button,a[href]"); if (!f.length) return; var first = f[0], lastEl = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); } else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); } }
      });
      all.addEventListener("click", function (e) { e.preventDefault(); toFull(); });
    }
    function toFull() { var q = input.value.trim(); if (!q) return; var url = searchUrl + "#s-" + enc(q); close(true); if (isFull) { location.hash = "#s-" + enc(q); } else location.href = url; }
    function go(it) { if (it.url) { var u = it.url; close(true); location.href = u; } else { input.value = it.label; draw(); } }
    function move(d) { if (!items.length) return; active = (active + d + items.length) % items.length; [].forEach.call(list.children, function (li, i) { li.setAttribute("aria-selected", String(i === active)); if (i === active) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); } }); }
    function draw() {
      var q = input.value.trim(); list.textContent = ""; items = []; active = -1; input.removeAttribute("aria-activedescendant");
      if (q.length < 2) { status.textContent = "Type to search. Searches stay in your browser."; input.setAttribute("aria-expanded", "false"); return; }
      var sug = S.suggest(q, 4).filter(function (s) { return s.kind === "record"; });
      var res = S.search(q, { limit: 6 });
      var seen = new Set();
      sug.forEach(function (s) { var r = S.get(s.id); if (r && !seen.has(r.id)) { seen.add(r.id); items.push({ label: r.title, type: r.type, url: r.url, why: s.hint || "Suggestion" }); } });
      res.results.forEach(function (x) { if (!seen.has(x.record.id) && items.length < 7) { seen.add(x.record.id); items.push({ label: x.record.title, type: x.record.type, url: x.record.url, why: x.reasons[0] }); } });
      items.forEach(function (it, i) {
        list.append(h("li", { id: "gs-o" + i, role: "option", "aria-selected": "false", onmousedown: function (e) { e.preventDefault(); go(it); } }, h("span", { class: "gs-t" }, S.typeLabel[it.type]), h("span", { class: "gs-l" }, it.label), h("span", { class: "gs-w" }, it.why)));
      });
      input.setAttribute("aria-expanded", String(items.length > 0));
      status.textContent = items.length ? items.length + " quick results. " + (res.total > items.length ? res.total + " in all." : "") + (res.corrected ? " Showing results for “" + res.corrected + "”." : "") : "Nothing in the index matches. Try other words.";
    }
    function close(skipFocus) { if (!overlay) return; overlay.remove(); overlay = null; document.documentElement.classList.remove("gs-open"); if (!skipFocus && last && last.focus) last.focus(); }

    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        // do not hijack the shortcut while the visitor is typing elsewhere, except in our own fields
        if (editable(e.target) && !(e.target.id === "gs-q")) { if (!e.target.dataset || !e.target.dataset.gsAllow) return; }
        e.preventDefault(); if (overlay) close(); else open();
      }
    });
    if (navHost) {
      var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
      navHost.append(h("button", { type: "button", class: "gs-btn", "aria-haspopup": "dialog", "aria-label": "Search all research (" + (isMac ? "Command" : "Control") + " K)", onclick: open }, "Search ", h("kbd", null, isMac ? "⌘K" : "Ctrl K")));
    }
    return { open: open, close: close };
  }
  root.GlobalSearch = { mount: mount };
})(typeof self !== "undefined" ? self : this);
