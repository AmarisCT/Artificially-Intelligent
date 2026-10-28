/* Privacy-friendly page counts with GoatCounter (https://www.goatcounter.com).
   OFF until a site code is set below. While CODE is null this file does nothing and makes no network request.
   When on: no cookies, no personal data, page views only; Do Not Track and Global Privacy Control are respected.
   Before turning this on, the studio privacy page (amaris ct) must say that anonymous page counts are collected. */
(function () {
  "use strict";
  var CODE = null; // your GoatCounter site code, for example "artificially-intelligent" (https://CODE.goatcounter.com)

  if (!CODE || !/^[a-z0-9-]{1,40}$/i.test(CODE)) return;
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || /\.local$/.test(host)) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1" || navigator.globalPrivacyControl === true) return;

  window.goatcounter = { no_onload: true, endpoint: "https://" + CODE + ".goatcounter.com/count" };

  // The homepage is one page with #routes, so each route change is counted as its own view.
  var isApp = !!document.getElementById("nav-groups");
  function path() { return location.pathname + (isApp && location.hash.length > 1 ? location.hash : ""); }
  function count() {
    try { window.goatcounter.count({ path: path(), title: document.title }); } catch (e) { /* counting must never break the page */ }
  }

  var s = document.createElement("script");
  s.async = true;
  s.setAttribute("data-goatcounter", window.goatcounter.endpoint);
  s.src = "https://gc.zgo.at/count.js";
  s.onload = function () { count(); if (isApp) addEventListener("hashchange", count); };
  document.head.appendChild(s);
})();
