"use strict";
/* The Listening Room: transcript synchronisation.

   Pure logic, no DOM. It answers one question: given the audio's current time, which sentence and which
   paragraph is being spoken? The answer uses only the timing in audio-transcripts.json, which was measured
   from the produced recording. Precision is the sentence; there is no word-level timing and none is implied.

   If a transcript has no timing (start/end null), `timed` is false and nothing is ever reported as current,
   so the transcript is simply a readable text. */
(function (root) {
  function TranscriptSync(blocks) {
    var flat = [];
    blocks.forEach(function (b, bi) {
      if (b.start == null || !b.sentences) return;
      b.sentences.forEach(function (s, si) { flat.push({ block: bi, blockId: b.id, i: si, c0: s[0], c1: s[1], start: s[2], end: s[3] }); });
    });
    flat.sort(function (a, b) { return a.start - b.start; });
    this.flat = flat;
    this.blocks = blocks;
    this.timed = flat.length > 0;
    this.byBlock = {};
    blocks.forEach(function (b, bi) { if (b.start != null) this.byBlock[b.id] = bi; }, this);
  }

  /* index into flat of the sentence being spoken at t. Before the first sentence: -1. During the silence after a
     sentence, that sentence stays current until the next one starts (so the highlight never flickers off). */
  TranscriptSync.prototype.find = function (t) {
    var f = this.flat, lo = 0, hi = f.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (f[mid].start <= t + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };
  TranscriptSync.prototype.at = function (t) { var k = this.find(t); return k < 0 ? null : this.flat[k]; };
  /* the sentence whose interval contains t, or the nearest earlier one (for saving a moment) */
  TranscriptSync.prototype.sentenceFor = function (t) { var s = this.at(t); return s || this.flat[0] || null; };
  TranscriptSync.prototype.textOf = function (s) { var b = this.blocks[s.block]; return b.text.slice(s.c0, s.c1); };
  TranscriptSync.prototype.blockStart = function (id) { var b = this.blocks[this.byBlock[id]]; return b ? b.start : null; };

  /* chapters: list of {start}, with start possibly null (transcript-only). Returns the last chapter that has begun. */
  TranscriptSync.chapterAt = function (chapters, t) {
    var cur = -1;
    chapters.forEach(function (c, i) { if (c.start != null && c.start <= t + 1e-6) cur = i; });
    return cur;
  };

  root.TranscriptSync = TranscriptSync;
  if (typeof module !== "undefined" && module.exports) module.exports = TranscriptSync;
})(typeof window !== "undefined" ? window : globalThis);
