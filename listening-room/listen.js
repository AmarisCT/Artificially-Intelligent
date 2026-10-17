"use strict";
/* The Listening Room: the listening page.
   One audio element and one Player live for the whole visit to a recording. The three modes only change layout and
   how the transcript is drawn, so switching modes never restarts or interrupts the audio. */
(function (root) {
  var App = root.LRApp, U = root.LRU, S = root.LRS, h = U.h, fmt = U.fmt, say = U.say, clip = U.clip, fdate = U.fdate, enc = U.enc;
  var Store = S.Store, Desk = S.Desk, CFG = App.CFG;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var MODES = [
    ["immersive", "Immersive Listening", "The player and a quiet visual. Text stays one button away."],
    ["read", "Listen and Read", "Narration with the transcript, highlighted as it is spoken."],
    ["research", "Research Listening", "The transcript with concept notes, citations and related research."]
  ];
  var TYPE_LABEL = { "concept:": "Atlas concept", "q:": "Unresolved question", "theory:": "Theory", "cmp:": "Theory comparison", "room:": "Museum room", "lesson:": "Learning Institute lesson", "art:": "Published essay" };
  function typeLabel(id) { var k = Object.keys(TYPE_LABEL).find(function (p) { return id.indexOf(p) === 0; }); return k ? TYPE_LABEL[k] : "Resource"; }
  var ICON = {
    play: "M8 5v14l11-7z", pause: "M7 5h4v14H7zM13 5h4v14h-4z", back: "M12 5V2L7 6.5 12 11V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z", fwd: "M12 5V2l5 4.5L12 11V8a6 6 0 1 0 6 6h2a8 8 0 1 1-8-9z",
    prev: "M6 5h2v14H6zM20 5v14L9 12z", next: "M16 5h2v14h-2zM4 5v14l11-7z", vol: "M4 9v6h4l5 4V5L8 9zM16 8a5 5 0 0 1 0 8", mute: "M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6",
    mark: "M6 3h12v18l-6-4-6 4z", save: "M12 4v16M4 12h16"
  };
  function icon(name, stroke) {
    var s = U.sv("svg", { viewBox: "0 0 24 24", width: "22", height: "22", "aria-hidden": "true", focusable: "false" });
    s.append(U.sv("path", { d: ICON[name], fill: stroke ? "none" : "currentColor", stroke: stroke ? "currentColor" : "none", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }));
    return s;
  }
  function ibtn(name, label, onclick, extra) {
    var b = h("button", Object.assign({ type: "button", class: "ib", "aria-label": label, title: label, onclick: onclick }, extra || {}), icon(name, name === "vol" || name === "mute" || name === "save"));
    return b;
  }

  App.views.listen = function (r) {
    var rec = App.rec(r.id);
    if (!rec) {
      App.mount("listen", [h("div", { class: "panel" }, h("h2", null, "That recording is not in the library"), h("p", null, "It may not exist, or it has not been published. "), h("a", { class: "btn", href: "#" }, "Back to the audio library"))]);
      return null;
    }
    if (!App.playable(rec)) {
      var q = App.queueItem(rec);
      App.mount("listen", [h("div", { class: "panel" }, h("p", { class: "label" }, rec.label), h("h2", null, rec.title), App.badge(App.effStatus(rec)),
        h("p", null, "There is no playable recording of this essay yet. " + App.status(App.effStatus(rec)).definition), q && q.notes && q.notes.length ? h("p", null, q.notes.join(" ")) : null,
        h("div", { class: "row" }, h("a", { class: "btn primary", href: App.rebase(rec.source.url) }, "Read the essay →"), h("a", { class: "btn", href: "#" }, "Audio library")))]);
      return null;
    }
    App.mount("listen", [h("p", { class: "loading" }, "Opening the recording…")]);
    var CHP = App.getJSON(CFG.dataBase + "audio-chapters.json"), RLP = App.getJSON(CFG.dataBase + "audio-relations.json");
    return Promise.all([App.loadTranscripts(), CHP, RLP]).then(function (res) {
      var tr = res[0][rec.id], ch = res[1].items.find(function (x) { return x.recordingId === rec.id; }), rel = res[2].items.find(function (x) { return x.recordingId === rec.id; });
      if (!tr) throw new Error("no transcript");
      return build(rec, tr, ch || { chapters: [], proposed: [] }, rel || { annotations: [], resources: {}, concepts: [], lexicon: [], citations: [], sourceMatches: [] }, r);
    }).catch(function (e) {
      if (root.console) console.error(e);
      App.mount("listen", [h("div", { class: "panel" }, h("h2", null, "This recording's transcript could not be loaded"), h("p", null, "Please reload the page. You can read the essay now."), h("a", { class: "btn", href: App.rebase(rec.source.url) }, "Read the essay →"))]);
      return null;
    });
  };

  function build(rec, tr, chData, rel, route) {
    var prefs = Store.prefs();
    var mode = MODES.some(function (m) { return m[0] === prefs.mode; }) ? prefs.mode : "read";
    var dur = rec.audio.durationSec;
    var audio = h("audio", { preload: "none", "aria-hidden": "true" });
    var player = new root.LRPlayer(audio);
    player.rate = prefs.rate || 1;
    var sync = new root.TranscriptSync(tr.blocks);
    var blockById = {}; tr.blocks.forEach(function (b) { blockById[b.id] = b; });
    var sourcesBlock = blockById.sources;
    var alive = true, touched = false, lastSave = 0, pausedByCtx = false, userScrollAt = 0, progScrollAt = 0, activeK = -2, activeBlock = null;
    var resumeFrom = null, jumpBack = null;
    var motion = prefs.vizMotion == null ? !U.reducedMotion() : !!prefs.vizMotion;
    var follow = !!prefs.follow;
    var offs = [];
    function listen(t, ev, fn, o) { t.addEventListener(ev, fn, o); offs.push(function () { t.removeEventListener(ev, fn, o); }); }

    /* ---- where to start ---- */
    var saved = Store.progress(rec.id), startAt = 0;
    if (route.t != null) { startAt = route.t; if (saved && !saved.done && Math.abs(saved.t - route.t) <= 2 && saved.t > 5) resumeFrom = route.t; }
    else if (saved && !saved.done && saved.t > 5 && saved.t < dur - 8) { startAt = saved.t; resumeFrom = saved.t; }

    var all = App.playables().sort(function (a, b) { return a.id.localeCompare(b.id); });
    var ix = all.findIndex(function (x) { return x.id === rec.id; });
    var prevRec = all[ix - 1] || null, nextRec = all[ix + 1] || null;

    /* ---------------- header ---------------- */
    var head = h("header", { class: "ls-head" },
      h("a", { class: "back", href: "#" }, "← Audio library"),
      h("p", { class: "label" }, rec.label + " · " + App.cat(rec.category).label + (rec.series.length ? " · " + rec.series.map(function (s) { return App.series(s).title; }).join(", ") : "")),
      h("h1", { class: "ls-title" }, rec.title),
      h("p", { class: "deck" }, rec.description),
      h("div", { class: "chips" }, App.badge(App.effStatus(rec)), App.narrationBadge(rec), h("span", { class: "chip" }, fmt(dur) + " long"), h("span", { class: "chip" }, "Essay published " + fdate(rec.source.publishedAt))),
      h("p", { class: "disclose", role: "note" }, h("b", null, "Voice: "), rec.narration.disclosure, " ", h("span", { class: "dim" }, rec.narration.credit)),
      App.storageNotice(),
      App.effStatus(rec) === "revision-required" ? h("p", { class: "note warn", role: "note" }, "The written essay has changed since this recording was approved, so this recording may not match it. Read the current essay for the authoritative text.") : null,
      h("div", { class: "row" }, h("a", { class: "btn sm", href: App.rebase(rec.source.url) }, "Read the original essay →"),
        h("a", { class: "btn sm", href: "#journal" }, "My listening journal")));

    /* ---------------- modes ---------------- */
    var modeBtns = MODES.map(function (m) {
      return h("button", { type: "button", role: "radio", class: "mode", "aria-checked": String(m[0] === mode), "data-m": m[0], onclick: function () { setMode(m[0]); }, title: m[2] },
        h("span", { class: "mname" }, m[1]), h("span", { class: "mdesc" }, m[2]));
    });
    var modebar = h("div", { class: "modebar", role: "radiogroup", "aria-label": "Listening mode. Switching modes never restarts the audio." }, modeBtns);
    listen(modebar, "keydown", function (e) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return;
      var i = MODES.findIndex(function (m) { return m[0] === mode; }), d = (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 1;
      var n = MODES[(i + d + MODES.length) % MODES.length][0]; setMode(n); $("[data-m=" + n + "]", modebar).focus(); e.preventDefault();
    });

    /* ---------------- atmosphere / stage ---------------- */
    var canvas = h("canvas", { class: "atmo-canvas", "aria-hidden": "true" });
    var caption = h("p", { class: "caption", "aria-hidden": "true" }, "");
    var atmoState = h("p", { class: "atmo-state", role: "status" }, "");
    var atmo = new root.LRAtmosphere(canvas, audio);
    var motionBtn = h("button", { type: "button", class: "btn sm", "aria-pressed": String(motion), onclick: function () { motion = !motion; Store.setPref("vizMotion", motion); motionBtn.setAttribute("aria-pressed", String(motion)); applyMotion(); } }, "Animate the Audio Atmosphere");
    var stage = h("figure", { class: "stage" },
      h("div", { class: "stage-in" }, canvas, caption),
      h("figcaption", { class: "stage-cap" },
        h("p", { class: "atmo-note" }, h("b", null, "Audio Atmosphere. "), "The lines draw the sound of this recording as it plays: louder, brighter sound lifts a line, quiet lets it settle. It shows sound only. It does not represent meaning, thought or consciousness. Everything it accompanies is in the transcript."),
        h("div", { class: "row" }, motionBtn, atmoState)));
    atmo.setWave(rec.waveform);
    atmo.onStatus = function (s) {
      atmoState.textContent = s === "live" ? "Live: reading the sound you are hearing." : s === "unsupported" ? "Live analysis is not available in this browser, so a still picture of the recording's loudness is shown." : s === "unavailable" ? "The browser did not provide the audio signal for analysis, so a still picture of the recording's loudness is shown." : "";
    };
    function applyMotion() {
      atmo.animate = motion && atmo.status === "live";
      if (!motion) { atmoState.textContent = U.reducedMotion() ? "Animation is off. Your device asks for reduced motion. A still picture of the recording's loudness is shown." : "Animation is off. A still picture of the recording's loudness is shown."; atmo.stop(); return; }
      if (player.playing()) atmo.connect().then(function () { atmo.animate = motion && atmo.status === "live"; if (atmo.animate) atmo.start(); else atmo.draw(); });
      else { atmoState.textContent = "Starts when you press play."; atmo.draw(); }
    }

    /* ---------------- player ---------------- */
    var btnPlay = h("button", { type: "button", class: "play", "aria-label": "Play", onclick: function () { toggle(); } }, icon("play"));
    var tCur = h("span", { class: "t-cur" }, "0:00"), tDur = h("span", { class: "t-dur" }, fmt(dur));
    var scrub = h("div", { class: "scrub", role: "slider", tabindex: "0", "aria-label": "Playback position", "aria-valuemin": "0", "aria-valuemax": String(Math.round(dur)), "aria-valuenow": "0", "aria-valuetext": "0 seconds of " + U.say(dur) });
    var wb = h("canvas", { class: "wv base", "aria-hidden": "true" }), wf = h("canvas", { class: "wv top", "aria-hidden": "true" });
    var fill = h("div", { class: "scrub-fill" }, wf), buf = h("div", { class: "scrub-buf" }), thumb = h("div", { class: "scrub-thumb" });
    var ticks = h("div", { class: "ticks", "aria-hidden": "true" });
    scrub.append(wb, buf, fill, ticks, thumb);

    function drawWave(c, color) {
      var w = scrub.clientWidth || 600, hh = scrub.clientHeight || 44, dpr = Math.min(2, root.devicePixelRatio || 1);
      c.width = w * dpr; c.height = hh * dpr; c.style.width = w + "px"; c.style.height = hh + "px";
      var g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
      g.fillStyle = color; var wv = rec.waveform, n = wv.length, step = w / n;
      for (var i = 0; i < n; i++) { var bh = Math.max(1.5, wv[i] / 100 * hh * 0.86); g.fillRect(i * step, (hh - bh) / 2, Math.max(1, step * 0.62), bh); }
    }
    function layoutScrub() {
      drawWave(wb, "rgba(185,194,196,0.30)"); drawWave(wf, "rgba(143,233,196,0.95)");
      wf.style.width = scrub.clientWidth + "px";
      ticks.textContent = "";
      var marks = [];
      chData.chapters.forEach(function (c) { if (c.start != null && c.approved) marks.push([c.start, "ch", c.title]); });
      Moments().forEach(function (m) { marks.push([m.t, "mo", "Saved moment " + fmt(m.t)]); });
      marks.forEach(function (m) { ticks.append(h("i", { class: "tick " + m[1], style: "left:" + (100 * m[0] / dur) + "%", title: m[2] })); });
    }
    function Moments() { return App.moments.forRec(rec.id); }
    var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function () { layoutScrub(); }) : null; if (ro) ro.observe(scrub);

    function seekFrac(clientX) { var r = scrub.getBoundingClientRect(); var f = Math.max(0, Math.min(1, (clientX - r.left) / r.width)); doSeek(f * dur); }
    var dragging = false;
    listen(scrub, "pointerdown", function (e) { dragging = true; scrub.setPointerCapture(e.pointerId); seekFrac(e.clientX); e.preventDefault(); scrub.focus({ preventScroll: true }); });
    listen(scrub, "pointermove", function (e) { if (dragging) seekFrac(e.clientX); });
    listen(scrub, "pointerup", function (e) { dragging = false; try { scrub.releasePointerCapture(e.pointerId); } catch (x) { /* ignored */ } });
    listen(scrub, "pointercancel", function () { dragging = false; });
    listen(scrub, "keydown", function (e) {
      var step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -30, PageUp: 30 }[e.key];
      if (step != null) { doSeek(player.time() + step); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === "Home") { doSeek(0); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === "End") { doSeek(dur - 1); e.preventDefault(); e.stopPropagation(); }
    });

    var rateBtns = player.constructor.RATES.map(function (r) {
      return h("button", { type: "button", role: "radio", class: "rate", "aria-checked": String(r === player.rate), "data-r": String(r), "aria-label": r + " times speed", onclick: function () { setRate(r); } }, r + "×");
    });
    var rateGroup = h("div", { class: "rates", role: "radiogroup", "aria-label": "Playback speed" }, rateBtns);
    var vol = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(prefs.volume), class: "vol", "aria-label": "Volume", oninput: function (e) { player.setVolume(+e.target.value); Store.setPref("volume", +e.target.value); if (+e.target.value > 0 && audio.muted) { player.setMuted(false); Store.setPref("muted", false); } } });
    var muteBtn = ibtn("vol", "Mute", function () { player.setMuted(!audio.muted); Store.setPref("muted", audio.muted); updateVol(); });
    var volWrap = h("div", { class: "volwrap" }, muteBtn, vol);
    function updateVol() { var m = audio.muted || audio.volume === 0; muteBtn.textContent = ""; muteBtn.append(icon(m ? "mute" : "vol", true)); muteBtn.setAttribute("aria-label", m ? "Unmute" : "Mute"); muteBtn.title = m ? "Unmute" : "Mute"; muteBtn.setAttribute("aria-pressed", String(m)); }
    var bookBtn = h("button", { type: "button", class: "btn sm", "aria-label": "Bookmark this recording", "aria-pressed": String(App.moments.bookmarked(rec.id)), onclick: function () { var on = App.moments.toggleBookmark(rec.id); bookBtn.setAttribute("aria-pressed", String(on)); bookBtn.textContent = on ? "Bookmarked" : "Bookmark"; App.toast(on ? "Recording bookmarked and added to your Reading Desk." : "Bookmark removed."); } }, App.moments.bookmarked(rec.id) ? "Bookmarked" : "Bookmark");
    var momBtn = h("button", { type: "button", class: "btn sm primary", onclick: function () { saveMomentNow(); }, title: "Keep this timestamp and the passage being spoken (T)" }, "Save moment");
    var keysBtn = h("button", { type: "button", class: "btn sm", "aria-label": "Keyboard shortcuts", "aria-expanded": "false", onclick: function () { var open = keysPanel.hidden; keysPanel.hidden = !open; keysBtn.setAttribute("aria-expanded", String(open)); } }, "Shortcuts");
    var keysPanel = h("div", { class: "keys-panel", hidden: "" }, h("dl", { class: "keys" }, [["Space / K", "Play or pause"], ["← / J", "Back 10 s"], ["→ / L", "Forward 10 s"], ["N / P", "Next / previous recording"], ["M", "Mute"], ["S", "Next speed"], ["T", "Save this moment"]].map(function (k) { return h("div", null, h("dt", null, h("kbd", null, k[0])), h("dd", null, k[1])); })), h("p", { class: "note" }, "On the position bar, use ← → for 5 s, Page Up / Down for 30 s, Home and End."));
    var statusLine = h("p", { class: "pl-status", role: "status" }, "");
    var errBox = h("div", { class: "pl-err", role: "alert", hidden: "" });
    var resumeBox = h("p", { class: "resume", hidden: "" });

    var pl = h("section", { class: "player", "aria-label": "Audio player for " + rec.title },
      h("div", { class: "pl-main" },
        h("div", { class: "pl-btns" },
          ibtn("prev", prevRec ? "Previous recording: " + prevRec.title : "Previous recording (none yet)", function () { if (prevRec) App.go("#listen-" + prevRec.id); }, prevRec ? {} : { disabled: "" }),
          ibtn("back", "Back 10 seconds", function () { doSeek(player.time() - 10); }),
          btnPlay,
          ibtn("fwd", "Forward 10 seconds", function () { doSeek(player.time() + 10); }),
          ibtn("next", nextRec ? "Next recording: " + nextRec.title : "Next recording (none yet)", function () { if (nextRec) App.go("#listen-" + nextRec.id); }, nextRec ? {} : { disabled: "" })),
        h("div", { class: "pl-time", "aria-hidden": "false" }, tCur, h("span", { class: "sep" }, " / "), tDur, h("span", { class: "sr" }, " verified length " + U.say(dur))),
        h("button", { type: "button", class: "btn sm more-toggle", "aria-expanded": "false", onclick: function (e) { var o = !pl.classList.contains("more"); pl.classList.toggle("more", o); e.currentTarget.setAttribute("aria-expanded", String(o)); e.currentTarget.textContent = o ? "Fewer controls" : "Speed, volume, more"; } }, "Speed, volume, more")),
      scrub, statusLine, errBox, resumeBox,
      h("div", { class: "pl-more" }, rateGroup, volWrap, momBtn, bookBtn, keysBtn), keysPanel);

    function setRate(r) {
      player.setRate(r); Store.setPref("rate", r);
      rateBtns.forEach(function (b) { b.setAttribute("aria-checked", String(+b.dataset.r === r)); });
    }
    function toggle() { touched = true; return player.toggle(); }
    function doSeek(t) {
      var from = player.time(); touched = true;
      var to = player.seek(t);
      if (Math.abs(to - from) > 20) { jumpBack = from; showJumpBack(); }
      update(to, true);
    }

    /* ---------------- chapters ---------------- */
    var chBox = h("nav", { class: "chapters", "aria-label": "Chapters" });
    var jumpEl = h("button", { type: "button", class: "btn sm jumpback", hidden: "", onclick: function () { if (jumpBack != null) { var t = jumpBack; jumpBack = null; jumpEl.hidden = true; doSeek(t); } } }, "");
    function showJumpBack() { if (jumpBack == null) return; jumpEl.textContent = "↩ Back to " + fmt(jumpBack); jumpEl.hidden = false; }
    function buildChapters() {
      chBox.textContent = "";
      var ok = chData.chapters.filter(function (c) { return c.approved; });
      chBox.append(h("h2", { class: "mini" }, "Chapters"), h("p", { class: "note" }, chData.basis));
      var ul = h("ul", { class: "chlist" });
      ok.forEach(function (c) { ul.append(chapterItem(c)); });
      chBox.append(ul);
      if (CFG.showProposedChapters && chData.proposed.length) {
        chBox.append(h("details", { class: "proposed" }, h("summary", null, "Proposed chapters, awaiting the author's approval (" + chData.proposed.length + ")"),
          h("p", { class: "note" }, chData.proposedStatus), h("ul", { class: "chlist" }, chData.proposed.map(function (c) { return chapterItem(c, true); }))));
      }
      chBox.append(jumpEl);
    }
    function chapterItem(c, prop) {
      var b = h("button", { type: "button", class: "chbtn", "data-ch": c.id, onclick: function () {
        if (c.start == null) { scrollToBlock(c.fromBlock); return; }
        var from = player.time(); touched = true; var to = player.seek(c.start); if (Math.abs(to - from) > 10) { jumpBack = from; showJumpBack(); }
        update(to, true); if (!player.playing()) toggle(); scrollToBlock(c.fromBlock, true);
      } }, h("span", { class: "cn" }, c.title), h("span", { class: "ct" }, c.start == null ? "text only" : fmt(c.start)));
      return h("li", { class: prop ? "prop" : null }, b, c.note ? h("span", { class: "dim cnote" }, c.note) : null);
    }
    function markChapter(t) {
      var list = chData.chapters.filter(function (c) { return c.approved; });
      var i = root.TranscriptSync.chapterAt(list, t);
      Array.prototype.forEach.call(chBox.querySelectorAll(".chbtn"), function (b) { b.removeAttribute("aria-current"); });
      if (i >= 0) { var b = chBox.querySelector("[data-ch=" + list[i].id + "]"); if (b) b.setAttribute("aria-current", "true"); }
    }

    /* ---------------- transcript ---------------- */
    var trBox = h("section", { class: "tr", "aria-labelledby": "tr-h" });
    var trBody = h("div", { class: "tr-body", tabindex: "-1" });
    var followBtn = h("button", { type: "button", id: "follow", class: "btn sm", "aria-pressed": String(follow), onclick: function () { follow = !follow; Store.setPref("follow", follow); followBtn.setAttribute("aria-pressed", String(follow)); if (follow) scrollToActive(true); } }, "Follow narration");
    var trToggle = h("button", { type: "button", class: "btn sm trtoggle", "aria-expanded": "false", onclick: function () { var open = !trBox.classList.contains("open"); trBox.classList.toggle("open", open); trToggle.setAttribute("aria-expanded", String(open)); trToggle.textContent = open ? "Hide transcript" : "Show transcript"; if (open) scrollToActive(true); } }, "Show transcript");
    var toCur = h("button", { type: "button", class: "btn sm tocur", hidden: "", onclick: function () { scrollToActive(true); } }, "Jump to current passage");
    trBox.append(h("div", { class: "tr-head" }, h("h2", { id: "tr-h" }, "Transcript"), h("div", { class: "row" }, followBtn, trToggle)),
      h("p", { class: "note" }, tr.spoken + " Highlighting is by sentence."),
      trBody, toCur);

    var annByBlock = {};
    rel.annotations.forEach(function (a) { (annByBlock[a.block] = annByBlock[a.block] || []).push(a); });
    var citeByBlock = {};
    rel.citations.forEach(function (c) { (citeByBlock[c.block] = citeByBlock[c.block] || []).push(c.n); });
    var savedTimes = {};

    function sentenceNodes(b, k, research) {
      var s = b.sentences[k], text = b.text, c0 = s[0], c1 = s[1];
      var anns = research ? (annByBlock[b.id] || []).filter(function (a) { return a.start >= c0 && a.end <= c1; }).sort(function (a, c) { return a.start - c.start; }) : [];
      var out = [], pos = c0;
      anns.forEach(function (a) {
        if (a.start < pos) return;
        if (a.start > pos) out.push(text.slice(pos, a.start));
        out.push(h("button", { type: "button", class: "term t-" + a.type, "data-a": rel.annotations.indexOf(a), "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": text.slice(a.start, a.end) + ": research note" }, text.slice(a.start, a.end)));
        pos = a.end;
      });
      if (pos < c1) out.push(text.slice(pos, c1));
      return out;
    }

    function renderTranscript() {
      var research = mode === "research";
      trBody.textContent = "";
      tr.blocks.forEach(function (b) {
        if (b.kind === "sources") { trBody.append(sourcesNode(b)); return; }
        var el = h("div", { class: "blk " + b.kind, id: "b-" + b.id, "data-b": b.id });
        var p = h("p", { class: "txt" });
        var pos = 0;
        b.sentences.forEach(function (s, k) {
          if (s[0] > pos) p.append(b.text.slice(pos, s[0]));
          p.append(h("span", { class: "s", "data-b": b.id, "data-k": k }, sentenceNodes(b, k, research)));
          pos = s[1];
        });
        if (pos < b.text.length) {
          var tail = b.text.slice(pos);
          var m = /^\s*(\[\d+\])$/.exec(tail);
          if (m && research) { p.append(" ", h("button", { type: "button", class: "cite", "data-n": m[1].replace(/\D/g, ""), "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": "Source " + m[1].replace(/\D/g, "") + " for this paragraph" }, m[1])); }
          else p.append(h("span", { class: "cite-txt" }, tail));
        }
        if (b.kind === "frame") {
          el.append(h("span", { class: "tag" }, "Recording note, not part of the essay"), p);
        } else {
          el.append(h("div", { class: "gut" }, h("button", { type: "button", class: "ts", "data-t": b.start, "aria-label": "Play from " + U.say(b.start) }, fmt(b.start))), p,
            h("div", { class: "acts" }, h("button", { type: "button", class: "btn sm save-p", "data-b": b.id }, "Save passage")));
        }
        trBody.append(el);
      });
      markSaved();
      activeK = -2; activeBlock = null; update(player.time(), false, true);
    }
    function sourcesNode(b) {
      var wrap = h("section", { class: "blk sources", id: "b-sources", "aria-labelledby": "src-h" }, h("h3", { id: "src-h" }, b.heading), h("p", { class: "note" }, b.note));
      b.groups.forEach(function (g) {
        var li = h("div", { class: "sg", id: g.n != null ? "src-" + g.n : null });
        g.entries.forEach(function (e) {
          li.append(h("p", { class: "src" }, U.withItalics(e.text), " ", e.links.map(function (l) { return h("a", { class: "slink", href: U.safeHref(l.url), target: "_blank", rel: "noopener noreferrer" }, l.label + " ↗"); })));
        });
        wrap.append(li);
      });
      return wrap;
    }
    function markSaved() {
      Array.prototype.forEach.call(trBody.querySelectorAll(".blk.body"), function (el) {
        var b = blockById[el.dataset.b], on = Moments().some(function (m) { return m.t >= Math.floor(b.start) && m.t <= Math.ceil(b.end); });
        el.classList.toggle("saved", on);
      });
    }

    function scrollToBlock(id, soft) {
      var el = $("#b-" + id, trBody); if (!el) return;
      if (mode === "immersive" && !trBox.classList.contains("open")) { trToggle.click(); }
      progScrollAt = Date.now();
      el.scrollIntoView({ behavior: U.reducedMotion() ? "auto" : "smooth", block: soft ? "center" : "start" });
    }
    function scrollToActive(force) {
      if (!activeBlock) return;
      var el = $("#b-" + activeBlock, trBody); if (!el) return;
      if (!force && (!follow || Date.now() - userScrollAt < 6000)) return;
      if (mode === "immersive" && !trBox.classList.contains("open")) return;
      progScrollAt = Date.now();
      el.scrollIntoView({ behavior: U.reducedMotion() ? "auto" : "smooth", block: "center" });
    }
    ["wheel", "touchmove", "keydown"].forEach(function (ev) { listen(window, ev, function (e) { if (ev === "keydown" && ["PageUp", "PageDown", "Home", "End", " ", "ArrowUp", "ArrowDown"].indexOf(e.key) < 0) return; if (Date.now() - progScrollAt > 800) userScrollAt = Date.now(); }, { passive: true }); });
    var io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(function (es) { es.forEach(function (e) { toCur.hidden = e.isIntersecting || !activeBlock || mode === "immersive"; }); }, { threshold: 0.1 }) : null;
    var ioEl = null;
    function watchActive(el) { if (!io) return; if (ioEl) io.unobserve(ioEl); ioEl = el; if (el) io.observe(el); }

    /* ---------------- time updates: the only place highlighting is decided ---------------- */
    function update(t, force, rebuild) {
      var d = player.duration() || dur;
      tCur.textContent = fmt(t);
      var f = Math.max(0, Math.min(1, t / d));
      fill.style.width = (f * 100) + "%"; thumb.style.left = (f * 100) + "%";
      scrub.setAttribute("aria-valuenow", String(Math.round(t))); scrub.setAttribute("aria-valuetext", U.say(t) + " of " + U.say(d));
      atmo.setProgress(f);
      markChapter(t);
      var k = sync.find(t);
      if (k === activeK && !rebuild) return;
      var prevK = activeK; activeK = k;
      var cur = k >= 0 ? sync.flat[k] : null;
      Array.prototype.forEach.call(trBody.querySelectorAll(".s.now"), function (n) { n.classList.remove("now"); });
      Array.prototype.forEach.call(trBody.querySelectorAll(".blk.cur"), function (n) { n.classList.remove("cur"); n.removeAttribute("aria-current"); });
      if (!cur) { caption.textContent = ""; activeBlock = null; return; }
      var b = tr.blocks[cur.block];
      var sp = $(".s[data-b=" + b.id + "][data-k='" + cur.i + "']", trBody);
      if (sp) sp.classList.add("now");
      var bl = $("#b-" + b.id, trBody);
      if (bl) { bl.classList.add("cur"); bl.setAttribute("aria-current", "true"); }
      caption.textContent = b.text.slice(cur.c0, cur.c1);
      var changedBlock = activeBlock !== b.id; activeBlock = b.id;
      if (changedBlock) { watchActive(bl); refreshPassage(); if (player.playing()) scrollToActive(false); }
      else if (force && prevK !== k) { /* seek within the same paragraph */ }
    }

    /* ---------------- research context ---------------- */
    var ctx = h("aside", { class: "ctx", "aria-labelledby": "ctx-h" });
    var passageBox = h("div", { class: "ctx-pass" });
    var ctxBody = h("div", { class: "ctx-body" }, h("p", { class: "dim" }, "Loading related research…"));
    var newTabBtn = h("button", { type: "button", class: "btn sm", "aria-pressed": String(prefs.newTab), onclick: function () { prefs.newTab = !prefs.newTab; Store.setPref("newTab", prefs.newTab); newTabBtn.setAttribute("aria-pressed", String(prefs.newTab)); applyTargets(); } }, "Open research in a new tab");
    var pauseBtn = h("button", { type: "button", class: "btn sm", "aria-pressed": String(prefs.pauseOnContext), onclick: function () { prefs.pauseOnContext = !prefs.pauseOnContext; Store.setPref("pauseOnContext", prefs.pauseOnContext); pauseBtn.setAttribute("aria-pressed", String(prefs.pauseOnContext)); } }, "Pause audio while I read research notes");
    var ctxHead = h("div", { class: "ctx-head" }, h("h2", { id: "ctx-h", class: "sr" }, "Research context"),
      h("p", { class: "note" }, "Your place is saved. Opening research does not stop the audio unless you choose that below."), h("div", { class: "row" }, pauseBtn, newTabBtn));
    var ctxDetails = h("details", { class: "ctxd", open: mode === "research" || window.innerWidth >= 1000 ? "" : null }, h("summary", null, "Research context"), ctxHead, passageBox, ctxBody);
    ctx.append(ctxDetails);

    function link(href, text, opts) {
      opts = opts || {};
      var ext = /^https:\/\/(?!amarisct\.github\.io)/.test(href) || /^https:\/\/artificial/.test(href);
      var a = h("a", { class: "ra", href: href, "data-site": opts.site === false ? null : "1" }, text);
      if (ext) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      return a;
    }
    function applyTargets() {
      Array.prototype.forEach.call(document.querySelectorAll("#app a[data-site]"), function (a) {
        if (prefs.newTab) { a.target = "_blank"; a.rel = "noopener"; } else if (a.rel === "noopener") { a.removeAttribute("target"); a.removeAttribute("rel"); }
      });
    }
    function resCard(id, why) {
      var IDX = App.idx(), r = IDX && IDX.get(id);
      if (!r) return h("li", { class: "dim" }, id);
      var li = h("li", null, h("span", { class: "rt" }, typeLabel(id)), h("a", { class: "ra", "data-site": "1", href: App.rebase(r.url) }, r.title), r.summary ? h("span", { class: "rs" }, clip(r.summary, 150)) : null);
      if (why) li.append(h("span", { class: "dim why" }, why));
      return li;
    }
    function fillContext() {
      var IDX = App.idx(), LEX = App.lex();
      ctxBody.textContent = "";
      var R = rel.resources;
      ctxBody.append(
        h("section", null, h("h3", null, "About this essay"),
          h("p", null, rec.description),
          h("p", { class: "meta" }, "Published " + fdate(rec.source.publishedAt) + ". Reading time about " + rec.source.readingMinutes + " minutes; this recording runs " + fmt(dur) + "."),
          h("p", null, link(App.rebase(rec.source.url), "Read the original essay →"), " ", link(App.SUBSTACK, "Artificially Intelligent on Substack ↗", { site: false })),
          h("p", { class: "note" }, "No Substack post is linked because none has been verified for this essay.")));
      if (!IDX) { ctxBody.append(h("p", { class: "note warn" }, "Related research could not be loaded just now. You can still " , h("a", { href: App.site("search/#s-" + enc(rec.title)) }, "search the archive"), ".")); }
      if (IDX) {
        var groups = [["Concepts in the Research Atlas", rel.concepts], ["Unresolved questions", R.questions], ["Theories", R.theories.concat(R.comparisons)], ["Museum of Human Memory", R.museum], ["Related essays", R.articles], ["Learning Institute lessons", R.lessons]];
        groups.forEach(function (g) {
          if (!g[1] || !g[1].length) return;
          var sec = h("section", null, h("h3", null, g[0]), h("ul", { class: "rl" }, g[1].map(function (id) { return resCard(id); })));
          if (g[0] === "Theories") sec.append(h("p", { class: "note" }, "This recording presents research. It is not independent evidence for or against any theory."));
          if (g[0] === "Unresolved questions") sec.append(h("p", { class: "note" }, "Pause here and explore a question; your place in the recording is saved, and Back returns you to it."));
          ctxBody.append(sec);
        });
      }
      if (rel.lexicon.length) {
        ctxBody.append(h("section", null, h("h3", null, "In the Lexicon of Intelligence"), h("ul", { class: "rl" }, rel.lexicon.map(function (id) {
          var e = LEX && LEX[id];
          return h("li", null, h("span", { class: "rt" }, "Lexicon entry"), h("a", { class: "ra", "data-site": "1", href: App.site("lexicon/#c-" + id) }, e ? e.term : id), e ? h("span", { class: "rs" }, clip(e.intro, 140)) : null);
        })), LEX ? h("p", { class: "note" }, "Definitions are shown as the Lexicon has them. Entries carry their own review status.") : null));
      }
      var srcs = sourcesBlock ? sourcesBlock.groups : [];
      if (srcs.length) {
        ctxBody.append(h("section", null, h("h3", null, "Sources in the essay"), h("ol", { class: "srcl" }, srcs.map(function (g, gi) {
          return h("li", { id: "csrc-" + gi }, g.entries.map(function (e) { return h("p", { class: "src" }, U.withItalics(e.text.replace(/^\[\d+\]\s*/, "")), " ", e.links.map(function (l) { return h("a", { class: "slink", href: U.safeHref(l.url), target: "_blank", rel: "noopener noreferrer" }, l.label + " ↗"); })); }));
        }))));
      }
      ctxBody.append(h("section", null, h("h3", null, "Investigate further"), h("div", { class: "row" },
        link(App.site("inquiry-engine/#q-" + enc(rec.title)), "Open an inquiry on this essay →"), link(App.site("search/#s-" + enc(rec.title)), "Search all research →"))));
      applyTargets();
    }
    function refreshPassage() {
      passageBox.textContent = "";
      var as = rel.annotations.filter(function (a) { return a.block === activeBlock; });
      if (!as.length) return;
      passageBox.append(h("h3", null, "In this passage"), h("ul", { class: "inpass" }, as.map(function (a) {
        var label = blockById[a.block].text.slice(a.start, a.end);
        return h("li", null, h("button", { type: "button", class: "linkbtn", onclick: function (e) { openAnn(a, e.currentTarget); } }, label), h("span", { class: "dim" }, " " + annTypeLabel(a)));
      })));
    }
    function annTypeLabel(a) { return a.type === "lexicon" ? "Lexicon" : a.type === "atlas" ? "Atlas" : a.type === "museum" ? "Museum" : a.type === "theory" ? "Theory" : a.type === "comparison" ? "Comparison" : a.type === "question" ? "Question" : "Source"; }

    /* ---------------- annotation popover ---------------- */
    var pop = null, popAnchor = null;
    function closePop(restoreFocus) {
      if (!pop) return;
      pop.remove(); pop = null;
      if (popAnchor) { popAnchor.setAttribute("aria-expanded", "false"); if (restoreFocus !== false && document.contains(popAnchor)) popAnchor.focus(); }
      popAnchor = null;
      if (pausedByCtx) { pausedByCtx = false; player.play(); }
    }
    function popContent(a) {
      var IDX = App.idx(), LEX = App.lex(), body = [], title = "", links = [];
      var phrase = a.block ? blockById[a.block].text.slice(a.start, a.end) : "";
      if (a.type === "lexicon") {
        var e = LEX && LEX[a.id]; title = e ? e.term : a.id;
        body.push(h("p", null, e ? e.intro : "Open the Lexicon for this term."));
        if (e) body.push(h("p", { class: "meta" }, "Lexicon of Intelligence · " + e.category + " · status: " + e.status + "."));
        links.push(link(App.site("lexicon/#c-" + a.id), "Full Lexicon entry →"));
        if (e && e.atlas && e.atlas.length && IDX) e.atlas.slice(0, 4).forEach(function (id) { var r = IDX.get("concept:" + id); if (r) links.push(link(App.rebase(r.url), "Atlas: " + r.title)); });
        if (e && e.articles && e.articles.length) { /* Lexicon-listed essays are not repeated here */ }
        links.push(link(App.site("inquiry-engine/#q-" + enc(e ? e.term : a.id)), "Investigate “" + (e ? e.term : a.id) + "” →"));
      } else if (a.type === "source") {
        var g = sourcesBlock.groups[a.index]; title = "Source referred to here";
        g.entries.forEach(function (en) { body.push(h("p", { class: "src" }, U.withItalics(en.text), " ", en.links.map(function (l) { return h("a", { class: "slink", href: U.safeHref(l.url), target: "_blank", rel: "noopener noreferrer" }, l.label + " ↗"); }))); });
      } else {
        var r = IDX && IDX.get(a.id); title = r ? r.title : a.id;
        body.push(h("p", { class: "meta" }, typeLabel(a.id)));
        body.push(h("p", null, r ? clip(r.summary || "", 320) : "The related-research index could not be loaded."));
        if (a.type === "theory" || a.type === "comparison") body.push(h("p", { class: "note" }, "This recording presents research. It is not independent evidence for or against the theory."));
        if (a.type === "question") body.push(h("p", { class: "note" }, "An open question. Your place in the recording is saved; use Back to return, or open it in a new tab to keep listening."));
        if (r) links.push(link(App.rebase(r.url), (a.type === "question" ? "Open in the Unanswered Archive →" : a.type === "museum" ? "Open the Museum room →" : a.type === "atlas" ? "Open in the Research Atlas →" : "Open in the Theory Chamber →")));
      }
      return { title: title, phrase: phrase, body: body, links: links };
    }
    function openCite(n, anchor) {
      var g = sourcesBlock.groups.find(function (x) { return x.n === n; });
      mountPop(anchor, { title: "Source " + n, phrase: "", body: g ? g.entries.map(function (en) { return h("p", { class: "src" }, U.withItalics(en.text.replace(/^\[\d+\]\s*/, "")), " ", en.links.map(function (l) { return h("a", { class: "slink", href: U.safeHref(l.url), target: "_blank", rel: "noopener noreferrer" }, l.label + " ↗"); })); }) : [h("p", null, "Source not found.")], links: [] });
    }
    function openAnn(a, anchor) { mountPop(anchor, popContent(a)); }
    function mountPop(anchor, c) {
      if (pop && popAnchor === anchor) { closePop(); return; }
      var wasOpen = !!pop; if (pop) { pop.remove(); pop = null; if (popAnchor) popAnchor.setAttribute("aria-expanded", "false"); }
      popAnchor = anchor; anchor.setAttribute("aria-expanded", "true");
      var close = h("button", { type: "button", class: "ib sm", "aria-label": "Close research note", onclick: function () { closePop(); } }, "×");
      pop = h("div", { class: "pop", role: "dialog", "aria-label": "Research note: " + c.title, tabindex: "-1" }, h("div", { class: "pop-h" }, h("b", null, c.title), close), c.body, c.links.length ? h("div", { class: "pop-l" }, c.links) : null);
      document.body.append(pop);
      applyTargets();
      if (window.innerWidth > 720) {
        var r = anchor.getBoundingClientRect();
        pop.style.top = (window.scrollY + r.bottom + 8) + "px";
        pop.style.left = Math.max(12, Math.min(window.innerWidth - 392, r.left + window.scrollX - 20)) + "px";
      }
      if (prefs.pauseOnContext && player.playing() && !wasOpen) { player.pause(); pausedByCtx = true; }
      pop.focus();
    }
    listen(document, "keydown", function (e) { if (e.key === "Escape" && pop) { e.stopPropagation(); closePop(); } }, true);
    listen(document, "pointerdown", function (e) { if (pop && !pop.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closePop(false); });

    /* ---------------- transcript interactions ---------------- */
    listen(trBody, "click", function (e) {
      var t = e.target;
      var ts = t.closest(".ts"); if (ts) { playFrom(+ts.dataset.t); return; }
      var tm = t.closest(".term"); if (tm) { openAnn(rel.annotations[+tm.dataset.a], tm); return; }
      var ci = t.closest(".cite"); if (ci) { openCite(+ci.dataset.n, ci); return; }
      var sv = t.closest(".save-p"); if (sv) { var b = blockById[sv.dataset.b]; saveMoment(b.start, b.text.replace(/\s*\[\d+\]/g, "")); return; }
      var s = t.closest(".s");
      if (s && !t.closest("a")) {
        var sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
        var b2 = blockById[s.dataset.b], k = +s.dataset.k; if (b2.kind !== "body" && b2.kind !== "frame") return;
        playFrom(b2.sentences[k][2]);
      }
    });
    function playFrom(t) {
      var from = player.time(); touched = true; var to = player.seek(t);
      if (Math.abs(to - from) > 20) { jumpBack = from; showJumpBack(); }
      update(to, true); player.play();
    }

    /* selection toolbar: mouse and touch alternative to the per-paragraph button */
    var selTool = h("button", { type: "button", class: "seltool", hidden: "", onpointerdown: function (e) { e.preventDefault(); }, onclick: function () { saveSelection(); } }, "Save passage");
    document.body.append(selTool);
    var selTimer;
    listen(document, "selectionchange", function () {
      clearTimeout(selTimer);
      selTimer = setTimeout(function () {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) { selTool.hidden = true; return; }
        var r = sel.getRangeAt(0), node = r.commonAncestorContainer; node = node.nodeType === 1 ? node : node.parentElement;
        if (!node || !node.closest || !node.closest(".blk.body .txt")) { selTool.hidden = true; return; }
        var rect = r.getBoundingClientRect();
        selTool.hidden = false; selTool.style.top = Math.max(8, rect.top - 44) + "px"; selTool.style.left = Math.max(8, Math.min(window.innerWidth - 130, rect.left)) + "px";
      }, 160);
    });
    function saveSelection() {
      var sel = window.getSelection(); if (!sel || sel.isCollapsed) return;
      var r = sel.getRangeAt(0), n = r.startContainer; n = n.nodeType === 1 ? n : n.parentElement;
      var s = n.closest(".s") || (n.querySelector && n.querySelector(".s"));
      var b = blockById[(n.closest(".blk") || {}).dataset ? n.closest(".blk").dataset.b : activeBlock];
      var t = s ? blockById[s.dataset.b].sentences[+s.dataset.k][2] : b.start;
      saveMoment(t, sel.toString()); selTool.hidden = true; sel.removeAllRanges();
    }

    /* ---------------- moments ---------------- */
    var momBox = h("section", { class: "moms", "aria-labelledby": "mom-h" });
    function renderMoments() {
      momBox.textContent = "";
      var ms = Moments();
      momBox.append(h("h2", { class: "mini", id: "mom-h" }, "Your moments in this essay"));
      if (!ms.length) { momBox.append(h("p", { class: "note" }, "Press Save moment (or T) to keep a timestamp and the passage being spoken. Moments are private to this browser and appear in your Reading Desk.")); }
      else momBox.append(h("ul", { class: "ml" }, ms.map(function (m) {
        return h("li", null, h("button", { type: "button", class: "linkbtn", onclick: function () { playFrom(m.t); } }, fmt(m.t)), h("span", { class: "mt" }, " “" + clip(m.text, 140) + "”"),
          h("button", { type: "button", class: "linkbtn rm", "aria-label": "Remove saved moment at " + fmt(m.t), onclick: function () { App.moments.remove(m.id); renderMoments(); layoutScrub(); markSaved(); App.toast("Moment removed."); } }, "Remove"));
      })));
      momBox.append(h("a", { href: "#journal" }, "Open my listening journal →"));
    }
    function saveMoment(t, text) {
      var s = sync.sentenceFor(t);
      var res = App.moments.save({ rec: rec.id, t: t, text: text || (s ? sync.textOf(s) : "") });
      renderMoments(); layoutScrub(); markSaved();
      App.toast(!Store.ok ? "Moment kept for this visit only: your browser is blocking storage." : res.desk ? "Moment saved at " + fmt(t) + " and added to your Reading Desk." : "Moment saved at " + fmt(t) + ". Your Reading Desk could not be updated.");
    }
    function saveMomentNow() { var t = player.time(), s = sync.sentenceFor(t); saveMoment(s && s.start <= t ? s.start : t, s ? sync.textOf(s) : ""); }

    /* ---------------- persistence ---------------- */
    function persist(force) {
      if (!touched || !alive) return;
      var now = Date.now(); if (!force && now - lastSave < 4000) return; lastSave = now;
      var t = player.time(), d = player.duration() || dur, done = audio.ended || t >= d - 2;
      Store.setProgress(rec.id, { t: done ? d : t, dur: d, rate: player.rate, done: done });
    }

    /* ---------------- player events ---------------- */
    player.on("play", function () {
      btnPlay.textContent = ""; btnPlay.append(icon("pause")); btnPlay.setAttribute("aria-label", "Pause"); btnPlay.classList.add("on"); touched = true; errBox.hidden = true;
      if (motion) atmo.connect().then(function () { atmo.animate = motion && atmo.status === "live"; if (atmo.animate) { atmoState.textContent = "Live: reading the sound you are hearing."; atmo.start(); } });
      persist(true);
    });
    player.on("pause", function () { btnPlay.textContent = ""; btnPlay.append(icon("play")); btnPlay.setAttribute("aria-label", "Play"); btnPlay.classList.remove("on"); atmo.stop(); persist(true); });
    player.on("ended", function () { persist(true); statusLine.textContent = "End of the recording."; App.say("End of the recording."); });
    player.on("time", function (t) { update(t); persist(false); });
    player.on("buffering", function (b) { statusLine.textContent = b && player.playing() ? "Loading audio…" : ""; });
    player.on("buffered", function (ranges) { var t = player.time(), r = ranges.find(function (x) { return t >= x[0] - 0.5 && t <= x[1] + 0.5; }); buf.style.width = r ? (100 * r[1] / (player.duration() || dur)) + "%" : "0%"; });
    player.on("loaded", function (d) {
      var real = d.duration; if (isFinite(real) && Math.abs(real - dur) > 1.5) statusLine.textContent = "Note: the browser measured " + fmt(real) + " but the record says " + fmt(dur) + ".";
    });
    player.on("error", function (err) {
      errBox.hidden = false; errBox.textContent = "";
      errBox.append(h("p", null, h("b", null, "Playback problem. "), err.message), h("div", { class: "row" },
        err.fatal ? h("button", { class: "btn sm primary", type: "button", onclick: function () { errBox.hidden = true; player.retry(); } }, "Try again") : null,
        h("a", { class: "btn sm", href: "#b-" + (activeBlock || "p00"), onclick: function (e) { e.preventDefault(); trToggle.click(); if (mode === "immersive" && !trBox.classList.contains("open")) trToggle.click(); trBody.focus(); } }, "Read the transcript instead")));
      btnPlay.disabled = !!err.fatal;
    });

    /* ---------------- modes ---------------- */
    var rootEl = h("div", { class: "listen", "data-mode": mode });
    function setMode(m) {
      if (m === mode) return;
      mode = m; Store.setPref("mode", m);
      rootEl.dataset.mode = m;
      modeBtns.forEach(function (b) { b.setAttribute("aria-checked", String(b.dataset.m === m)); });
      closePop(false);
      renderTranscript();
      if (m === "research") { App.loadIndex().then(function () { if (alive) { fillContext(); } }); App.loadLexicon().then(function () { if (alive && App.idx()) fillContext(); }); ctxDetails.open = true; }
      if (m === "immersive") { trBox.classList.remove("open"); trToggle.setAttribute("aria-expanded", "false"); trToggle.textContent = "Show transcript"; toCur.hidden = true; }
      App.say(MODES.find(function (x) { return x[0] === m; })[1] + " mode. The audio continues.");
      layoutScrub(); atmo.resize(); atmo.draw();
      if (m !== "immersive") setTimeout(function () { scrollToActive(true); }, 60);
    }

    /* ---------------- keyboard ---------------- */
    listen(document, "keydown", function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if ((t && t.getAttribute && t.getAttribute("role") === "slider")) return;
      var onBtn = tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
      var k = e.key;
      if (k === " " || k === "Spacebar") { if (onBtn) return; toggle(); e.preventDefault(); }
      else if (k === "k" || k === "K") { toggle(); e.preventDefault(); }
      else if (k === "ArrowLeft" || k === "j" || k === "J") { if (k === "ArrowLeft" && onBtn && t.closest && t.closest("[role=radiogroup]")) return; doSeek(player.time() - 10); e.preventDefault(); }
      else if (k === "ArrowRight" || k === "l" || k === "L") { if (k === "ArrowRight" && onBtn && t.closest && t.closest("[role=radiogroup]")) return; doSeek(player.time() + 10); e.preventDefault(); }
      else if (k === "m" || k === "M") { player.setMuted(!audio.muted); Store.setPref("muted", audio.muted); updateVol(); }
      else if (k === "s" || k === "S") { var R = player.constructor.RATES; setRate(R[(R.indexOf(player.rate) + 1) % R.length]); App.say("Speed " + player.rate + " times"); }
      else if (k === "n" || k === "N") { if (nextRec) App.go("#listen-" + nextRec.id); }
      else if (k === "p" || k === "P") { if (prevRec) App.go("#listen-" + prevRec.id); }
      else if (k === "t" || k === "T") { saveMomentNow(); }
    });
    listen(document, "visibilitychange", function () { if (document.hidden) persist(true); });
    listen(window, "pagehide", function () { persist(true); });
    listen(window, "resize", function () { if (pop) closePop(false); });

    /* ---------------- assemble ---------------- */
    buildChapters(); renderMoments();
    var left = h("div", { class: "lmain" }, stage, pl, chBox, trBox, momBox);
    rootEl.append(head, modebar, h("div", { class: "lgrid" }, left, ctx), audio);
    App.mount("listen", [rootEl]);
    renderTranscript();
    layoutScrub();
    atmo.resize(); atmo.draw();
    player.setVolume(prefs.volume); player.setMuted(prefs.muted);
    if (!player.canSetVolume()) volWrap.hidden = true;
    updateVol(); setRate(player.rate);
    if (mode === "research") ctxDetails.open = true;
    App.loadIndex().then(function () { if (alive) fillContext(); });
    App.loadLexicon().then(function () { if (alive && App.idx()) fillContext(); });
    fillContext();
    motionBtn.setAttribute("aria-pressed", String(motion));
    atmoState.textContent = motion ? "Starts when you press play." : (U.reducedMotion() ? "Animation is off. Your device asks for reduced motion. A still picture of the recording's loudness is shown." : "Animation is off. A still picture of the recording's loudness is shown.");

    player.load(rec, App.audioUrl(rec), startAt);
    if (startAt > 0) { update(startAt, true); }
    if (resumeFrom != null) {
      resumeBox.hidden = false;
      resumeBox.append("Picked up where you left off, at " + fmt(resumeFrom) + ". ", h("button", { type: "button", class: "linkbtn", onclick: function () { resumeBox.hidden = true; doSeek(0); } }, "Start from the beginning"));
    } else if (route.t != null) { resumeBox.hidden = false; resumeBox.textContent = "Opened at " + fmt(route.t) + "."; }

    player.mediaSession({ title: rec.title, artist: "Artificially Intelligent", album: "The Listening Room" }, {
      play: function () { toggle(); }, pause: function () { player.pause(); }, seekbackward: function () { doSeek(player.time() - 10); }, seekforward: function () { doSeek(player.time() + 10); },
      previoustrack: prevRec ? function () { App.go("#listen-" + prevRec.id); } : null, nexttrack: nextRec ? function () { App.go("#listen-" + nextRec.id); } : null
    });

    var api = {
      rec: rec.id, player: player, atmo: atmo, sync: sync,
      seekTo: function (t) { touched = true; var to = player.seek(t); update(to, true); resumeBox.hidden = false; resumeBox.textContent = "Moved to " + fmt(to) + "."; },
      destroy: function () {
        persist(true); alive = false; closePop(false); player.pause(); atmo.destroy(); if (ro) ro.disconnect(); if (io) io.disconnect(); offs.forEach(function (f) { f(); }); selTool.remove(); player.destroy();
      }
    };
    root.__lr = api; // for tests only
    return api;
  }
})(window);
