"use strict";
/* The Listening Room: the Audio Atmosphere.

   What it shows: a stack of fine lines. Each new line is the frequency spectrum of the sound the visitor is hearing
   at that moment, read live from the playing audio with the Web Audio API. Louder, brighter sound lifts the line;
   quiet settles it. Older lines drift away and fade. The movement is sound, nothing else.

   What it does not show: meaning, thought, consciousness or machine cognition. It is a picture of an audio signal.

   Safe by design:
   * It listens to a copy of the stream (HTMLMediaElement.captureStream). It never sits in the playback path, so if
     analysis fails the sound is unaffected. Browsers without captureStream (Safari) get the still overview instead.
   * If the analyser returns nothing while the recording is audibly playing, it says so and shows the still overview.
     It never substitutes invented motion.
   * The still overview is also real data: the loudness profile of the whole recording, measured from the file.
   * Reduced motion: the animation is off unless the visitor turns it on. The page works fully without it. */
(function (root) {
  var BANDS = 64, ROWS = 34, ROW_MS = 85;

  function Atmosphere(canvas, audio) {
    this.c = canvas;
    this.g = canvas.getContext("2d");
    this.audio = audio;
    this.status = "idle"; // idle | live | unsupported | unavailable | off
    this.rows = [];
    this.cur = new Float32Array(BANDS);
    this.frames = 0;
    this.maxLevel = 0;
    this.silentMs = 0;
    this.raf = 0;
    this.lastRow = 0;
    this.wave = null;
    this.progress = 0;
    this.marks = [];
    this.animate = false;
    this.onStatus = null;
    var self = this;
    this.ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function () { self.resize(); self.draw(); }) : null;
    if (this.ro) this.ro.observe(canvas);
    this.resize();
  }

  Atmosphere.prototype.setStatus = function (s) { if (this.status !== s) { this.status = s; if (this.onStatus) this.onStatus(s); } };
  Atmosphere.prototype.resize = function () {
    var r = this.c.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
    this.w = Math.max(10, Math.round(r.width)); this.h = Math.max(10, Math.round(r.height));
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  Atmosphere.prototype.setWave = function (wave, marks) { this.wave = wave; this.marks = marks || []; this.draw(); };
  Atmosphere.prototype.setProgress = function (p) { this.progress = Math.max(0, Math.min(1, p || 0)); if (!this.raf) this.draw(); };

  /* Listen to a copy of the playing audio. Called after the visitor has pressed play. */
  Atmosphere.prototype.connect = function () {
    var self = this, a = this.audio;
    if (this.an || this.status === "unsupported" || this.status === "unavailable") return Promise.resolve(this.status === "live");
    var cap = a.captureStream || a.mozCaptureStream;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!cap || !AC) { this.setStatus("unsupported"); return Promise.resolve(false); }
    return new Promise(function (resolve) {
      try {
        var stream = cap.call(a), tries = 0;
        var attach = function () {
          var tr = stream.getAudioTracks();
          if (!tr.length) { if (++tries < 30) { setTimeout(attach, 100); } else { self.setStatus("unavailable"); resolve(false); } return; }
          try {
            self.ctx = new AC();
            var src = self.ctx.createMediaStreamSource(new MediaStream([tr[0]]));
            self.an = self.ctx.createAnalyser();
            self.an.fftSize = 2048; self.an.smoothingTimeConstant = 0.55; self.an.minDecibels = -95; self.an.maxDecibels = -25;
            src.connect(self.an); // deliberately NOT connected to the speakers
            self.bins = new Uint8Array(self.an.frequencyBinCount);
            var lo = 80, hi = 8000, nyq = self.ctx.sampleRate / 2;
            self.map = [];
            for (var i = 0; i < BANDS; i++) {
              var f0 = lo * Math.pow(hi / lo, i / BANDS), f1 = lo * Math.pow(hi / lo, (i + 1) / BANDS);
              var b0 = Math.floor(f0 / nyq * self.an.frequencyBinCount), b1 = Math.max(b0 + 1, Math.ceil(f1 / nyq * self.an.frequencyBinCount));
              self.map.push([b0, b1]);
            }
            self.ctx.resume();
            self.setStatus("live");
            resolve(true);
          } catch (e) { self.setStatus("unavailable"); resolve(false); }
        };
        attach();
      } catch (e) { self.setStatus("unavailable"); resolve(false); }
    });
  };

  Atmosphere.prototype.sample = function (dt) {
    if (!this.an) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.an.getByteFrequencyData(this.bins);
    var mx = 0, i, j;
    for (i = 0; i < BANDS; i++) {
      var m = this.map[i], s = 0, n = 0;
      for (j = m[0]; j < m[1]; j++) { s += this.bins[j]; n++; }
      var v = n ? s / n / 255 : 0;
      v = Math.pow(v, 1.35);
      this.cur[i] += (v - this.cur[i]) * 0.55;
      if (this.cur[i] > mx) mx = this.cur[i];
    }
    this.frames++;
    if (mx > this.maxLevel) this.maxLevel = mx;
    /* If a recording that is audibly playing yields nothing for several seconds, the signal is not reaching us
       (for example a cross-origin file). Say so rather than draw anything. */
    if (mx < 0.002 && !this.audio.paused && !this.audio.muted && this.audio.volume > 0 && this.maxLevel < 0.002) {
      this.silentMs += dt;
      if (this.silentMs > 5000) { this.setStatus("unavailable"); this.stop(); }
    } else this.silentMs = 0;
  };

  Atmosphere.prototype.start = function () {
    if (this.raf || !this.animate || this.status !== "live") return;
    var self = this, last = performance.now();
    var loop = function (now) {
      self.raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      var dt = now - last; last = now;
      self.sample(dt);
      if (now - self.lastRow > ROW_MS) {
        self.lastRow = now;
        self.rows.unshift(Float32Array.from(self.cur));
        if (self.rows.length > ROWS) self.rows.pop();
      } else if (self.rows.length) self.rows[0] = Float32Array.from(self.cur);
      self.draw();
    };
    this.raf = requestAnimationFrame(loop);
  };
  Atmosphere.prototype.stop = function () { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.draw(); };
  Atmosphere.prototype.stats = function () { return { status: this.status, frames: this.frames, maxLevel: this.maxLevel, rows: this.rows.length, animating: !!this.raf }; };

  Atmosphere.prototype.draw = function () {
    var g = this.g, w = this.w, h = this.h;
    g.clearRect(0, 0, w, h);
    if (this.animate && this.status === "live" && this.rows.length) this.drawLines(); else this.drawOverview();
  };

  Atmosphere.prototype.drawLines = function () {
    var g = this.g, w = this.w, h = this.h, rows = this.rows, n = rows.length;
    var x0 = w * 0.08, x1 = w * 0.92, gap = (h * 0.7) / ROWS, amp = h * 0.3;
    for (var r = n - 1; r >= 0; r--) { // oldest first, so newer lines sit in front
      var row = rows[r], y = h * 0.2 + (ROWS - r) * gap; // newest line (r = 0) sits lowest, older ones rise and fade
      var age = r / ROWS;
      g.beginPath();
      for (var i = 0; i < BANDS; i++) {
        var t = i / (BANDS - 1), taper = Math.pow(Math.sin(Math.PI * t), 1.6);
        var x = x0 + t * (x1 - x0), yy = y - row[i] * amp * taper * (1 - 0.35 * age);
        if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      g.lineTo(x1, y + h); g.lineTo(x0, y + h); g.closePath();
      g.fillStyle = "rgba(10,13,14,0.92)"; g.fill();
      g.beginPath();
      for (i = 0; i < BANDS; i++) {
        t = i / (BANDS - 1); taper = Math.pow(Math.sin(Math.PI * t), 1.6);
        x = x0 + t * (x1 - x0); yy = y - row[i] * amp * taper * (1 - 0.35 * age);
        if (i === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
      }
      var a = Math.max(0.12, 0.95 - age * 1.05);
      g.strokeStyle = r === 0 ? "rgba(143,233,196," + a + ")" : "rgba(185,194,196," + (a * 0.8) + ")";
      g.lineWidth = r === 0 ? 1.4 : 1;
      g.stroke();
    }
  };

  /* A still picture of the whole recording's loudness, with a marker for the current position. Real data. */
  Atmosphere.prototype.drawOverview = function () {
    var g = this.g, w = this.w, h = this.h, wv = this.wave;
    var x0 = w * 0.04, x1 = w * 0.96, mid = h * 0.5;
    g.strokeStyle = "rgba(185,194,196,0.14)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, mid); g.lineTo(x1, mid); g.stroke();
    if (!wv || !wv.length) return;
    var n = wv.length, step = (x1 - x0) / n, bw = Math.max(1, step * 0.55), maxH = h * 0.42, p = this.progress;
    for (var i = 0; i < n; i++) {
      var x = x0 + i * step, hh = Math.max(1, wv[i] / 100 * maxH);
      g.fillStyle = (i / n) <= p ? "rgba(143,233,196,0.85)" : "rgba(185,194,196,0.28)";
      g.fillRect(x, mid - hh, bw, hh * 2);
    }
    var mx = x0 + p * (x1 - x0);
    g.fillStyle = "rgba(236,233,225,0.9)"; g.fillRect(mx - 0.75, mid - maxH - 6, 1.5, maxH * 2 + 12);
  };

  Atmosphere.prototype.destroy = function () { this.stop(); if (this.ro) this.ro.disconnect(); try { if (this.ctx) this.ctx.close(); } catch (e) { /* ignored */ } };

  root.LRAtmosphere = Atmosphere;
})(typeof window !== "undefined" ? window : globalThis);
