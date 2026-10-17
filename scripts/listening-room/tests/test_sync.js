// Unit tests for listening-room/transcript-sync.js (pure logic). Run: node scripts/listening-room/tests/test_sync.js
const path = require("path"), fs = require("fs"), assert = require("assert");
const TS = require(path.join(__dirname, "../../../listening-room/transcript-sync.js"));
let n = 0, failed = 0;
function t(name, fn) { n++; try { fn(); console.log("PASS [T23] " + name); } catch (e) { failed++; console.log("FAIL [T23] " + name + "  -- " + e.message); } }

const blocks = [
  { id: "a", text: "One. Two.", start: 1, end: 5, sentences: [[0, 4, 1, 2], [5, 9, 3, 5]] },
  { id: "src", kind: "sources", start: null, end: null },
  { id: "b", text: "Three.", start: 6, end: 8, sentences: [[0, 6, 6, 8]] },
];
const s = new TS(blocks);
t("before the first sentence nothing is current", () => assert.strictEqual(s.find(0.5), -1));
t("a sentence is current from exactly its start", () => assert.strictEqual(s.find(1), 0));
t("current within a sentence", () => assert.strictEqual(s.find(1.9), 0));
t("during the gap after a sentence it stays current (no flicker)", () => assert.strictEqual(s.find(2.5), 0));
t("next sentence takes over at its start", () => assert.strictEqual(s.find(3), 1));
t("a sentence spans to the next block's start across a gap", () => assert.strictEqual(s.find(5.5), 1));
t("after the last sentence it stays on the last", () => assert.strictEqual(s.find(99), 2));
t("untimed blocks (sources) are ignored", () => assert.strictEqual(s.flat.length, 3));
t("textOf returns exactly the sentence's characters", () => assert.strictEqual(s.textOf(s.flat[1]), "Two."));
t("sentenceFor before the first returns the first (for saving a moment)", () => assert.strictEqual(s.sentenceFor(0).blockId, "a"));
t("blockStart", () => assert.strictEqual(s.blockStart("b"), 6));
t("timed is true when timing exists", () => assert.strictEqual(s.timed, true));
const none = new TS([{ id: "x", text: "Hello.", start: null, end: null, sentences: [[0, 6, null, null]] }]);
t("a transcript with no timing is never 'current' anywhere", () => { assert.strictEqual(none.timed, false); assert.strictEqual(none.find(10), -1); assert.strictEqual(none.at(10), null); });
const shuffled = new TS([blocks[2], blocks[0]]);
t("blocks given out of order are still searched in time order", () => assert.strictEqual(shuffled.at(3.2).blockId, "a"));
t("chapterAt ignores text-only chapters (start null) and returns the last begun", () => {
  const ch = [{ start: 0 }, { start: 10 }, { start: 30 }, { start: null }];
  assert.strictEqual(TS.chapterAt(ch, 9.9), 0); assert.strictEqual(TS.chapterAt(ch, 10), 1); assert.strictEqual(TS.chapterAt(ch, 500), 2); assert.strictEqual(TS.chapterAt(ch, -1), -1);
});

// the real transcripts: every sentence resolves to itself, at both edges and in the gap that follows it
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../listening-room/data/audio-transcripts.json"), "utf8"));
for (const tr of data.items) {
  const sy = new TS(tr.blocks);
  t(`${tr.id}: ${sy.flat.length} real sentences are strictly ordered and non-overlapping`, () => { for (let i = 1; i < sy.flat.length; i++) { assert(sy.flat[i].start >= sy.flat[i - 1].end - 1e-6, `overlap at ${i}`); } });
  t(`${tr.id}: every sentence resolves to itself just after its start, just before its end, and mid-gap`, () => {
    for (let i = 0; i < sy.flat.length; i++) {
      const f = sy.flat[i];
      assert.strictEqual(sy.find(f.start + 0.001), i, "start " + i);
      assert.strictEqual(sy.find(f.end - 0.001), i, "end " + i);
      if (i + 1 < sy.flat.length) { const g = (f.end + sy.flat[i + 1].start) / 2; assert.strictEqual(sy.find(g), i, "gap " + i); }
    }
  });
  t(`${tr.id}: sentence character ranges lie inside their paragraph and rebuild it`, () => {
    for (const b of tr.blocks) { if (!b.sentences) continue; let last = -1; for (const [c0, c1] of b.sentences) { assert(c0 >= 0 && c1 <= b.text.length && c1 > c0 && c0 > last, b.id); last = c1 - 1; } }
  });
}
console.log(`\n${n - failed}/${n} sync unit checks passed`);
process.exit(failed ? 1 : 0);
