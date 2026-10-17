"use strict";
/* The Listening Journal: saved moments, bookmarks, notes, collections, resume.

   Where things live:
     moment details (recording, time, excerpt)   ai_listen_v1  (this feature's own key)
     the note and the collection name            ai_desk_v1    (the Reading Desk item "moment:<id>"), so the Reading Desk
                                                 and the journal always show the same note
     a bookmarked recording                      ai_desk_v1    (the Reading Desk item "listen:<id>")
   Only these two kinds of Reading Desk item are ever created, edited or removed here. */
(function (root) {
  var App = root.LRApp, U = root.LRU, S = root.LRS, h = U.h, fmt = U.fmt, clip = U.clip;
  var Store = S.Store, Desk = S.Desk;

  var Moments = {
    key: function (id) { return "moment:" + id; },
    save: function (o) {
      var id = Store.momentId(o.rec, o.t);
      var existing = Store.moment(id);
      var m = { id: id, rec: o.rec, t: Math.max(0, Math.floor(o.t)), text: clip((o.text || (existing && existing.text) || "").replace(/\s+/g, " ").trim(), 900), at: existing ? existing.at : Date.now() };
      var ok = Store.putMoment(m);
      var deskOk = Desk.add(Moments.key(id));
      return { id: id, stored: ok, desk: deskOk, isNew: !existing };
    },
    remove: function (id) { Store.removeMoment(id); Desk.remove(Moments.key(id)); },
    forRec: function (rec) { return Store.moments().filter(function (m) { return m.rec === rec; }).sort(function (a, b) { return a.t - b.t; }); },
    all: function () { return Store.moments().sort(function (a, b) { return b.at - a.at; }); },
    has: function (id) { return !!Store.moment(id); },
    bookmarked: function (rec) { return Desk.has("listen:" + rec); },
    toggleBookmark: function (rec) {
      var k = "listen:" + rec;
      if (Desk.has(k)) { Desk.remove(k); return false; }
      return Desk.add(k);
    }
  };
  App.moments = Moments;

  var confirmFor = null;

  function noteFields(key) {
    var it = Desk.get(key) || { note: "", coll: "" };
    var timer;
    var save = function (f) { clearTimeout(timer); timer = setTimeout(function () { Desk.patch(key, f); }, 350); };
    var note = h("textarea", { class: "dk-note", maxlength: "1000", placeholder: "Your private note", "aria-label": "Private note" });
    note.value = it.note || "";
    note.addEventListener("input", function () { save({ note: note.value }); });
    var coll = h("input", { type: "text", class: "dk-coll", maxlength: "40", placeholder: "Collection, e.g. Memory listening", "aria-label": "Collection" });
    coll.value = it.coll || "";
    coll.addEventListener("input", function () { save({ coll: coll.value }); });
    coll.addEventListener("change", function () { Desk.patch(key, { coll: coll.value }); render(); });
    return [h("label", { class: "note" }, "Collection", coll), h("label", { class: "note" }, "Private note", note)];
  }

  function momentCard(m) {
    var rec = App.rec(m.rec);
    var key = Moments.key(m.id);
    return h("article", { class: "moment", "data-id": m.id },
      h("p", { class: "label" }, "Saved moment"),
      h("h3", null, rec ? rec.title : m.rec),
      h("p", { class: "meta" }, "Timestamp " + fmt(m.t)),
      h("blockquote", null, m.text || "(No passage was saved with this moment.)"),
      noteFields(key),
      h("div", { class: "row" },
        rec && App.playable(rec) ? h("a", { class: "btn sm primary", href: "#listen-" + m.rec + "-t" + m.t }, "Play from " + fmt(m.t) + " →") : h("span", { class: "dim" }, "This recording is not currently playable."),
        h("button", { class: "btn sm", type: "button", onclick: function () { Moments.remove(m.id); App.toast("Moment removed."); render(); } }, "Remove")));
  }

  function bookmarkCard(it) {
    var id = it.k.slice(7), rec = App.rec(id);
    if (!rec) return null;
    return h("article", { class: "moment", "data-id": it.k },
      h("p", { class: "label" }, "Bookmarked recording"), h("h3", null, rec.title),
      noteFields(it.k),
      h("div", { class: "row" },
        App.playable(rec) ? h("a", { class: "btn sm primary", href: "#listen-" + id }, "Open →") : h("span", { class: "dim" }, "Not currently playable"),
        h("button", { class: "btn sm", type: "button", onclick: function () { Moments.toggleBookmark(id); render(); } }, "Remove bookmark")));
  }

  var filter = "";
  function render() {
    var main = document.getElementById("jmain");
    if (!main) return;
    main.textContent = "";
    var moments = Moments.all(), marks = Desk.keys("listen:");
    var colls = {};
    moments.forEach(function (m) { var c = ((Desk.get(Moments.key(m.id)) || {}).coll || "").trim(); if (c) colls[c] = true; });
    marks.forEach(function (b) { var c = (b.coll || "").trim(); if (c) colls[c] = true; });
    var names = Object.keys(colls).sort();
    if (filter && !colls[filter]) filter = "";
    var inColl = function (k) { return !filter || ((Desk.get(k) || {}).coll || "").trim() === filter; };
    var shownM = moments.filter(function (m) { return inColl(Moments.key(m.id)); });
    var shownB = marks.filter(function (b) { return inColl(b.k); });

    var prog = Store.allProgress(), items = Object.keys(prog).map(function (id) { return { rec: App.rec(id), p: prog[id] }; }).filter(function (x) { return x.rec && x.p.t > 0; }).sort(function (a, b) { return b.p.at - a.p.at; });

    main.append(
      h("section", { class: "sec" }, h("h2", null, "Listening progress"),
        items.length ? h("div", { class: "cards2" }, items.map(function (x) {
          var pct = Math.round(100 * x.p.t / (x.p.dur || x.rec.audio.durationSec));
          return h("article", { class: "moment" }, h("h3", null, x.rec.title),
            h("p", { class: "meta" }, x.p.done ? "Listened to the end." : "You are at " + fmt(x.p.t) + " of " + fmt(x.rec.audio.durationSec) + "."),
            h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": "Progress in " + x.rec.title }, h("i", { style: "width:" + Math.min(100, pct) + "%" })),
            App.playable(x.rec) ? h("a", { class: "btn sm primary", href: "#listen-" + x.rec.id + (x.p.done ? "" : "-t" + Math.floor(x.p.t)) }, x.p.done ? "Listen again →" : "Resume from " + fmt(x.p.t) + " →") : null);
        })) : h("p", { class: "empty" }, "Nothing yet. When you start a recording, your place is saved here automatically so you can pick up where you left off.")),
      names.length ? h("div", { class: "chips filter", role: "group", "aria-label": "Show one collection" }, h("span", { class: "dim" }, "Collections"),
        h("button", { class: "chip btn-chip", type: "button", "aria-pressed": String(!filter), onclick: function () { filter = ""; render(); } }, "All"),
        names.map(function (n) { return h("button", { class: "chip btn-chip", type: "button", "aria-pressed": String(filter === n), onclick: function () { filter = n; render(); } }, n); })) : null,
      h("section", { class: "sec" }, h("h2", null, "Saved moments"),
        shownM.length ? h("div", { class: "cards2" }, shownM.map(momentCard)) : h("p", { class: "empty" }, filter ? "No moments in this collection." : "No moments saved yet. While listening, press Save moment (or T) to keep a timestamp and the passage spoken at that point. You can add a private note to each.")),
      h("section", { class: "sec" }, h("h2", null, "Bookmarked recordings"),
        shownB.length ? h("div", { class: "cards2" }, shownB.map(bookmarkCard)) : h("p", { class: "empty" }, filter ? "No bookmarked recordings in this collection." : "No recordings bookmarked. Use Bookmark on a listening page.")),
      h("section", { class: "sec" }, h("h2", null, "In your Reading Desk"),
        h("p", null, "Saved moments and bookmarks also appear on your Reading Desk with the same notes and collections, next to your saved essays and theories. The Reading Desk is on the main site: "),
        h("a", { class: "btn sm", href: App.site("#desk") }, "Open the Reading Desk →")),
      clearSection());
  }

  function clearSection() {
    var counts = { m: Moments.all().length, b: Desk.keys("listen:").length, p: Object.keys(Store.allProgress()).length };
    var confirmBox = function (what, label, fn) {
      if (confirmFor !== what) return h("button", { class: "btn", type: "button", onclick: function () { confirmFor = what; render(); } }, label + "…");
      return h("div", { class: "fb no", role: "alert" }, h("p", null, "This cannot be undone. " + label + "?"),
        h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: function () { fn(); confirmFor = null; render(); } }, "Yes, do it"), h("button", { class: "btn", type: "button", onclick: function () { confirmFor = null; render(); } }, "Cancel")));
    };
    return h("section", { class: "sec" }, h("h2", null, "What is saved, and how to clear it"),
      h("p", null, "Your listening position, saved moments, notes and preferences are stored only in this browser on this device. They are never sent anywhere and they do not sync between devices. Clearing your browser's site data removes them."),
      h("ul", { class: "plain" }, h("li", null, counts.p + " recording" + (counts.p === 1 ? "" : "s") + " with a saved position"), h("li", null, counts.m + " saved moment" + (counts.m === 1 ? "" : "s")), h("li", null, counts.b + " bookmarked recording" + (counts.b === 1 ? "" : "s"))),
      h("div", { class: "stack" },
        confirmBox("p", "Clear my listening positions", function () { Store.clearProgress(); App.toast("Listening positions cleared."); }),
        confirmBox("m", "Remove all my saved moments and their notes", function () { var n = Moments.all(); n.forEach(function (m) { Desk.remove(Moments.key(m.id)); }); Store.clearMoments(); App.toast("Saved moments removed."); }),
        confirmBox("a", "Remove everything the Listening Room saved (positions, moments, bookmarks, preferences)", function () { Desk.removePrefix("moment:"); Desk.removePrefix("listen:"); Store.clearAll(); App.toast("Listening Room data removed."); })),
      h("p", { class: "note" }, "None of these touches your other Reading Desk items. Essays, theories and questions you saved elsewhere on the site stay exactly as they are."));
  }

  App.views.journal = function () {
    var warn = [];
    if (!Store.ok) warn.push(App.storageNotice());
    if (Desk.read() === null) warn.push(h("p", { class: "note warn", role: "note" }, "Your Reading Desk data in this browser could not be read, so the Listening Room will not write to it. It has not been changed."));
    App.mount("journal", [
      h("div", { class: "pagehead" }, h("p", { class: "kicker" }, "The Listening Room"), h("h1", null, "My listening journal"),
        h("p", { class: "lede" }, "Moments you chose to keep, in your own words."),
        h("p", { class: "local" }, "Stored only in this browser, on this device. Not synced, not sent anywhere.")),
      warn, h("div", { id: "jmain" })]);
    render();
    return { destroy: function () {} };
  };
})(window);
