// Tests for research-ledger/diff.js (the comparison logic behind COMPARE VERSIONS). Run: node scripts/research-ledger-tests/test_diff.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../../research-ledger/diff.js");

const para = n => Array.from({ length: n }, (_, i) => `Paragraph ${i} says something about archives, memory and the records that people leave behind in ${1900 + i}.`);

test("identical texts produce no changes at all", () => {
  const a = para(40), rows = D.paragraphs(a, a.slice());
  assert.equal(rows.length, 40);
  assert.ok(rows.every(r => r.kind === "same"));
  assert.equal(D.summarize(rows).changed, 0);
});

test("a changed word is a single changed paragraph with word-level runs", () => {
  const a = ["One.", "The storm lasted three days and the lamp was lit at dusk.", "Three."], b = a.slice(); b[1] = "The storm lasted two days and the lamp was lit at dusk.";
  const rows = D.paragraphs(a, b), ch = rows.filter(r => r.kind !== "same");
  assert.equal(ch.length, 1);
  assert.equal(ch[0].kind, "change");
  assert.deepEqual(ch[0].runs.filter(r => r.t !== "same").map(r => [r.t, r.text.trim()]).sort(), [["add", "two"], ["del", "three"]]);
  assert.equal(ch[0].runs.map(r => r.text).filter((_, i) => ch[0].runs[i].t !== "add").join(""), a[1], "old text is reconstructable from the runs");
  assert.equal(ch[0].runs.map(r => r.text).filter((_, i) => ch[0].runs[i].t !== "del").join(""), b[1], "new text is reconstructable from the runs");
});

test("added and removed paragraphs are labelled as such, never as changes", () => {
  const a = ["Alpha is the first paragraph of the text.", "Beta is the second paragraph of the text.", "Gamma closes the text with a final thought."];
  const b = ["Alpha is the first paragraph of the text.", "A completely different paragraph about lighthouses and logbooks appears here.", "Gamma closes the text with a final thought."];
  const s = D.summarize(D.paragraphs(a, b));
  assert.equal(s.same, 2);
  assert.equal(s.add + s.remove + s.change, 2);
  assert.equal(s.change, 0, "two unrelated paragraphs are one removal and one addition");
});

test("pure additions and pure removals", () => {
  const a = ["x one two three four five six.", "y seven eight nine ten eleven twelve."];
  assert.deepEqual(D.summarize(D.paragraphs(a, a.concat(["z new paragraph about something else entirely."]))), { same: 2, add: 1, remove: 0, change: 0, changed: 1 });
  assert.deepEqual(D.summarize(D.paragraphs(a, a.slice(0, 1))), { same: 1, add: 0, remove: 1, change: 0, changed: 1 });
});

test("empty inputs are safe", () => {
  assert.deepEqual(D.paragraphs([], []), []);
  assert.equal(D.summarize(D.paragraphs([], ["a b c"])).add, 1);
  assert.equal(D.summarize(D.paragraphs(["a b c"], [])).remove, 1);
  assert.deepEqual(D.wordDiff("", "").map(r => r.text), []);
});

test("every row can be described in words for screen readers and the change list", () => {
  const rows = D.paragraphs(["Old paragraph about archives and memory."], ["New paragraph about archives and memory and records."]);
  for (const r of rows) assert.match(D.describe(r), /^(Paragraph (added|removed|changed)|Unchanged)/);
  assert.match(D.describe({ kind: "change", runs: [{ t: "add", text: "one" }, { t: "del", text: "two words" }], newText: "x" }), /1 word added, 2 removed/);
});

test("text with markup characters is never interpreted", () => {
  const rows = D.paragraphs(["Use <b>bold</b> & <script>alert(1)</script> here please now."], ["Use <i>bold</i> & <script>alert(2)</script> here please now."]);
  assert.equal(rows[0].kind, "change");
  assert.ok(rows[0].runs.every(r => typeof r.text === "string"));
});

test("a long essay compares quickly", () => {
  const a = para(150), b = a.slice(); b[10] = b[10] + " Edited."; b.splice(70, 1); b.splice(100, 0, "A brand new paragraph that was inserted into the middle of the essay for this test.");
  const t = Date.now(), s = D.summarize(D.paragraphs(a, b));
  assert.ok(Date.now() - t < 1500, "comparison took too long");
  assert.equal(s.change, 1); assert.equal(s.remove, 1); assert.equal(s.add, 1);
});

test("similarity is symmetric and bounded", () => {
  const x = "the cat sat on the mat", y = "a dog sat on a log";
  assert.equal(D.similarity(x, y), D.similarity(y, x));
  assert.equal(D.similarity(x, x), 1);
  assert.ok(D.similarity(x, y) > 0 && D.similarity(x, y) < 1);
  assert.equal(D.similarity("", ""), 1);
});
