"use strict";
/* The Listening Room: small shared helpers.
   Text from data files is always inserted with textContent / text nodes. Nothing here uses innerHTML. */
(function (root) {
  var NS = "http://www.w3.org/2000/svg";

  function h(tag, attrs) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (n) {
      var v = attrs[n];
      if (v == null || v === false) return;
      if (n === "class") e.className = v;
      else if (n.indexOf("on") === 0 && typeof v === "function") e.addEventListener(n.slice(2), v);
      else if (n === "text") e.textContent = v;
      else e.setAttribute(n, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, k) {
    if (k == null || k === false) return;
    if (Array.isArray(k)) { k.forEach(function (x) { add(e, x); }); return; }
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  function sv(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (n) { e.setAttribute(n, attrs[n]); });
    for (var i = 2; i < arguments.length; i++) [].concat(arguments[i]).forEach(function (k) { if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k))); });
    return e;
  }

  /* m:ss, or h:mm:ss for an hour or more */
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h_ = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h_ ? h_ + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }
  /* "4 minutes 32 seconds" for screen readers */
  function say(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60, out = [];
    if (m) out.push(m + (m === 1 ? " minute" : " minutes"));
    if (s || !m) out.push(s + (s === 1 ? " second" : " seconds"));
    return out.join(" ");
  }
  function approx(sec) {
    var m = Math.round(sec / 60);
    return m + (m === 1 ? " minute" : " minutes");
  }
  function enc(q) { return btoa(unescape(encodeURIComponent(q))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function safeHref(u) { return /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "#"; }
  function clip(s, n) { s = s || ""; return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }
  function fdate(iso) {
    if (!iso) return "";
    var p = iso.split("-").map(Number);
    return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][p[1] - 1] + " " + p[2] + ", " + p[0];
  }
  var reducedQuery = root.matchMedia ? root.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener: function () {} };
  function reducedMotion() { return !!reducedQuery.matches; }

  /* Italic markup in the article's Sources list: *Journal, 12* -> <em>. Everything else stays plain text. */
  function withItalics(text) {
    var out = [], parts = String(text).split(/\*([^*]+)\*/);
    parts.forEach(function (p, i) { if (!p) return; out.push(i % 2 ? h("em", null, p) : p); });
    return out;
  }
  function plain(text) { return String(text).replace(/\*([^*]+)\*/g, "$1"); }

  root.LRU = { h: h, sv: sv, fmt: fmt, say: say, approx: approx, enc: enc, safeHref: safeHref, clip: clip, fdate: fdate, reducedMotion: reducedMotion, reducedQuery: reducedQuery, withItalics: withItalics, plain: plain };
})(typeof window !== "undefined" ? window : globalThis);
