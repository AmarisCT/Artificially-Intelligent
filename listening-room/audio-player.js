"use strict";
/* The Listening Room: audio playback engine.

   A thin, honest wrapper around one <audio> element. Every state it reports comes from the element itself:
   currentTime, duration, paused, playbackRate, volume, buffered, error. There are no timers pretending to be
   playback.

   Loading is lazy. No file is requested until load() is called for the recording the visitor opened, and
   only its metadata is fetched (preload="metadata"). The library never creates audio elements. */
(function (root) {
  var RATES = [0.75, 1, 1.25, 1.5, 2];

  function Player(audio) {
    this.a = audio;
    this.rec = null;
    this.url = null;
    this.l = {};
    this.pendingSeek = null;
    this.error = null;
    this.ready = false;
    audio.preload = "none";
    audio.controls = false;
    var self = this;
    ["loadedmetadata", "timeupdate", "play", "playing", "pause", "ended", "waiting", "canplay", "seeking", "seeked", "progress", "ratechange", "volumechange", "stalled", "durationchange"]
      .forEach(function (ev) { audio.addEventListener(ev, function () { self.handle(ev); }); });
    audio.addEventListener("error", function () { self.fail(); });
  }
  Player.RATES = RATES;

  Player.prototype.on = function (ev, fn) { (this.l[ev] = this.l[ev] || []).push(fn); return this; };
  Player.prototype.emit = function (ev, d) { (this.l[ev] || []).forEach(function (f) { try { f(d); } catch (e) { if (root.console) console.error(e); } }); };

  Player.prototype.duration = function () {
    var d = this.a.duration;
    if (isFinite(d) && d > 0) return d;
    return this.rec && this.rec.audio ? this.rec.audio.durationSec : 0;
  };
  Player.prototype.time = function () { return this.a.currentTime || 0; };
  Player.prototype.playing = function () { return !this.a.paused && !this.a.ended; };

  Player.prototype.handle = function (ev) {
    var a = this.a;
    if (ev === "loadedmetadata") {
      this.ready = true;
      if (this.pendingSeek != null) { try { a.currentTime = Math.min(this.pendingSeek, Math.max(0, (a.duration || 0) - 0.5)); } catch (e) { /* ignored */ } this.pendingSeek = null; }
      this.emit("loaded", { duration: a.duration });
    }
    if (ev === "timeupdate") this.emit("time", a.currentTime);
    if (ev === "seeked") this.emit("time", a.currentTime);
    if (ev === "playing" || ev === "play") { this.error = null; this.emit("play"); }
    if (ev === "pause") this.emit("pause");
    if (ev === "ended") this.emit("ended");
    if (ev === "waiting" || ev === "stalled") this.emit("buffering", true);
    if (ev === "canplay" || ev === "playing") this.emit("buffering", false);
    if (ev === "progress" || ev === "loadedmetadata" || ev === "canplay") this.emit("buffered", this.bufferedRanges());
    if (ev === "ratechange") this.emit("rate", a.playbackRate);
    if (ev === "volumechange") this.emit("volume", { volume: a.volume, muted: a.muted });
    if (ev === "durationchange") this.emit("duration", this.duration());
  };

  Player.prototype.bufferedRanges = function () {
    var b = this.a.buffered, out = [];
    for (var i = 0; i < b.length; i++) out.push([b.start(i), b.end(i)]);
    return out;
  };

  /* Start fetching this recording's metadata. Nothing else is requested until the visitor presses play. */
  Player.prototype.load = function (rec, url, startAt) {
    this.rec = rec; this.url = url; this.error = null; this.ready = false;
    this.pendingSeek = startAt && startAt > 0 ? startAt : null;
    var a = this.a;
    a.preload = "metadata";
    /* Audio on another origin needs CORS for the Audio Atmosphere to read the sound. If the host does not send the
       headers the file would not load at all, so on a media error play() retries once without it (see onError). */
    this.corsRetried = false;
    var cross = false;
    try { cross = new URL(url, location.href).origin !== location.origin; } catch (e) {}
    if (cross) a.crossOrigin = "anonymous"; else a.removeAttribute("crossorigin");
    a.src = url;
    a.playbackRate = this.rate || 1;
    this.applyPitch();
    this.emit("load", rec);
  };
  Player.prototype.applyPitch = function () { var a = this.a; a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true; };

  Player.prototype.play = function () {
    var self = this, a = this.a;
    if (this.error && this.error.fatal) return Promise.resolve(false);
    if (a.preload !== "auto") a.preload = "auto"; // the visitor asked to listen: let the browser buffer ahead
    var p;
    try { p = a.play(); } catch (e) { p = Promise.reject(e); }
    return (p || Promise.resolve()).then(function () { return true; }, function (e) {
      if (e && e.name === "NotAllowedError") self.fail({ kind: "blocked", message: "Your browser blocked playback until you press Play.", fatal: false });
      else if (e && e.name !== "AbortError") self.fail();
      return false;
    });
  };
  Player.prototype.pause = function () { this.a.pause(); };
  Player.prototype.toggle = function () { return this.playing() ? (this.pause(), Promise.resolve(false)) : this.play(); };
  Player.prototype.seek = function (t) {
    var d = this.duration();
    t = Math.max(0, Math.min(t, d ? d - 0.05 : t));
    if (!this.ready && this.a.readyState === 0) { this.pendingSeek = t; this.emit("time", t); return t; }
    try { this.a.currentTime = t; } catch (e) { this.pendingSeek = t; }
    this.emit("time", t);
    return t;
  };
  Player.prototype.skip = function (d) { return this.seek(this.time() + d); };
  Player.prototype.setRate = function (r) { this.rate = r; this.a.playbackRate = r; this.applyPitch(); };
  Player.prototype.setVolume = function (v) { this.a.volume = Math.max(0, Math.min(1, v)); };
  Player.prototype.setMuted = function (m) { this.a.muted = !!m; };
  /* iOS Safari ignores script volume; the slider is hidden there instead of pretending to work */
  Player.prototype.canSetVolume = function () {
    var a = this.a, v = a.volume;
    try { a.volume = v === 0.5 ? 0.4 : 0.5; var ok = Math.abs(a.volume - (v === 0.5 ? 0.4 : 0.5)) < 0.001; a.volume = v; return ok; } catch (e) { return false; }
  };

  var MSG = {
    1: "Loading the audio was cancelled.",
    2: "The connection was interrupted while loading the audio. Check your connection, then try again.",
    3: "Your browser could not decode this audio file."
  };
  Player.prototype.fail = function (custom) {
    var self = this, a = this.a;
    if (custom) { this.error = custom; this.emit("error", custom); return; }
    var code = a.error ? a.error.code : 0;
    if (!a.getAttribute("src")) return;
    if (a.crossOrigin && !this.corsRetried && this.url) {
      /* The audio host may not send CORS headers. Playback matters more than the visualization: load it the ordinary way. */
      this.corsRetried = true; this.corsFallback = true;
      var resume = a.currentTime > 0 ? a.currentTime : this.pendingSeek;
      a.removeAttribute("crossorigin"); a.src = this.url; a.load();
      this.pendingSeek = resume && resume > 0 ? resume : null;
      this.emit("corsfallback");
      return;
    }
    var err = { kind: "media", code: code, message: MSG[code] || "This audio could not be played.", fatal: true };
    this.error = err;
    this.emit("error", err);
    if (code === 4 && this.url) {
      /* "source not supported" is what browsers say for a missing file too. Ask the server which it is. */
      fetch(this.url, { method: "HEAD" }).then(function (r) {
        if (!r.ok) err.message = "The audio file could not be found on the server (HTTP " + r.status + ").";
        else err.message = "Your browser can't play this audio format. The file is MP3; try another browser. The transcript is unaffected.";
        err.status = r.status;
        self.emit("error", err);
      }, function () {
        err.message = "The audio file could not be reached. Check your connection, then try again.";
        self.emit("error", err);
      });
    }
  };
  Player.prototype.retry = function () {
    if (!this.rec || !this.url) return;
    var t = this.time();
    this.a.removeAttribute("src");
    this.a.load();
    this.load(this.rec, this.url, t);
  };

  /* Lock-screen / media-key controls where the browser provides them. This is a convenience only: background
     playback is up to the browser and has not been verified on every device, so the interface does not promise it. */
  Player.prototype.mediaSession = function (meta, actions) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new root.MediaMetadata({ title: meta.title, artist: meta.artist, album: meta.album });
      Object.keys(actions).forEach(function (k) { try { navigator.mediaSession.setActionHandler(k, actions[k]); } catch (e) { /* unsupported action */ } });
    } catch (e) { /* ignored */ }
  };
  Player.prototype.destroy = function () {
    try { this.a.pause(); this.a.removeAttribute("src"); this.a.load(); } catch (e) { /* ignored */ }
    this.rec = null; this.ready = false;
  };

  root.LRPlayer = Player;
})(typeof window !== "undefined" ? window : globalThis);
