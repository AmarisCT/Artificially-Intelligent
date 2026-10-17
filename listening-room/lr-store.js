"use strict";
/* The Listening Room: browser storage.

   Two keys are used, and nothing is ever sent anywhere:
     ai_listen_v1  this feature's own data: playback position per recording, saved moments' excerpts, preferences.
     ai_desk_v1    the site's existing Reading Desk. The Listening Room only ADDS items of its own kinds
                   ("listen:<id>" and "moment:<id>") and edits those. Every other item, and every unknown field
                   of the Reading Desk, is left exactly as it was. If the stored Reading Desk cannot be parsed,
                   the Listening Room refuses to write to it rather than replace it.

   If the browser blocks storage, everything still works for the visit; nothing is kept. `Store.ok` says which. */
(function (root) {
  var KEY = "ai_listen_v1", DESK = "ai_desk_v1";
  var mem = {};
  var ok = true;
  function rawGet(k) { try { var v = root.localStorage.getItem(k); return v; } catch (e) { ok = false; return mem[k] == null ? null : mem[k]; } }
  function rawSet(k, s) { try { root.localStorage.setItem(k, s); return true; } catch (e) { ok = false; mem[k] = s; return false; } }
  function rawDel(k) { try { root.localStorage.removeItem(k); } catch (e) { ok = false; } delete mem[k]; }
  try { root.localStorage.setItem("ai_listen_probe", "1"); root.localStorage.removeItem("ai_listen_probe"); } catch (e) { ok = false; }

  var DEFAULT_PREFS = { mode: "read", rate: 1, volume: 1, muted: false, viz: true, follow: true, pauseOnContext: false, newTab: false };
  function blank() { return { v: 1, progress: {}, moments: {}, prefs: {}, last: null }; }

  function load() {
    var s = rawGet(KEY), o = null;
    if (s) { try { o = JSON.parse(s); } catch (e) { o = null; } }
    if (!o || o.v !== 1 || typeof o !== "object") o = blank();
    var b = blank();
    Object.keys(b).forEach(function (k) { if (o[k] == null) o[k] = b[k]; });
    return o;
  }
  var state = load();
  function persist() { return rawSet(KEY, JSON.stringify(state)); }

  var Store = {
    get ok() { return ok; },
    reload: function () { state = load(); },
    prefs: function () { return Object.assign({}, DEFAULT_PREFS, state.prefs || {}); },
    setPref: function (k, v) { state.prefs = state.prefs || {}; state.prefs[k] = v; persist(); },
    progress: function (id) { return state.progress[id] || null; },
    allProgress: function () { return state.progress; },
    setProgress: function (id, p) {
      var prev = state.progress[id] || {};
      state.progress[id] = Object.assign({}, prev, p, { at: Date.now() });
      state.last = id;
      return persist();
    },
    clearProgress: function (id) { if (id) delete state.progress[id]; else state.progress = {}; state.last = null; persist(); },
    last: function () { return state.last; },
    moment: function (id) { return state.moments[id] || null; },
    moments: function () { return Object.keys(state.moments).map(function (k) { return state.moments[k]; }); },
    putMoment: function (m) { state.moments[m.id] = m; return persist(); },
    removeMoment: function (id) { delete state.moments[id]; persist(); },
    clearMoments: function () { state.moments = {}; persist(); },
    clearAll: function () { state = blank(); rawDel(KEY); },
    momentId: function (rec, sec) { return rec + "@" + Math.max(0, Math.floor(sec)); }
  };

  /* ---------------- Reading Desk adapter: additive only ---------------- */
  var Desk = {
    broken: false,
    read: function () {
      var s = rawGet(DESK);
      if (s == null) return { items: [], last: null };
      try {
        var o = JSON.parse(s);
        if (!o || typeof o !== "object" || !Array.isArray(o.items)) throw new Error("shape");
        Desk.broken = false;
        return o;
      } catch (e) { Desk.broken = true; return null; }
    },
    has: function (k) { var o = Desk.read(); return !!o && o.items.some(function (x) { return x && x.k === k; }); },
    get: function (k) { var o = Desk.read(); return o ? o.items.find(function (x) { return x && x.k === k; }) || null : null; },
    keys: function (prefix) { var o = Desk.read(); return o ? o.items.filter(function (x) { return x && typeof x.k === "string" && x.k.indexOf(prefix) === 0; }) : []; },
    write: function (o) { return rawSet(DESK, JSON.stringify(o)); },
    /* add an item if absent; never touches other items */
    add: function (k) {
      var o = Desk.read(); if (!o) return false;
      if (!o.items.some(function (x) { return x && x.k === k; })) o.items.push({ k: k, note: "", coll: "", t: Date.now() });
      return Desk.write(o);
    },
    remove: function (k) {
      var o = Desk.read(); if (!o) return false;
      o.items = o.items.filter(function (x) { return !(x && x.k === k); });
      return Desk.write(o);
    },
    patch: function (k, fields) {
      var o = Desk.read(); if (!o) return false;
      var it = o.items.find(function (x) { return x && x.k === k; });
      if (!it) { it = { k: k, note: "", coll: "", t: Date.now() }; o.items.push(it); }
      Object.keys(fields).forEach(function (f) { it[f] = fields[f]; });
      return Desk.write(o);
    },
    removePrefix: function (prefix) {
      var o = Desk.read(); if (!o) return 0;
      var n = o.items.length;
      o.items = o.items.filter(function (x) { return !(x && typeof x.k === "string" && x.k.indexOf(prefix) === 0); });
      Desk.write(o);
      return n - o.items.length;
    }
  };

  root.LRS = { Store: Store, Desk: Desk, DEFAULT_PREFS: DEFAULT_PREFS, KEY: KEY, DESK_KEY: DESK };
})(typeof window !== "undefined" ? window : globalThis);
