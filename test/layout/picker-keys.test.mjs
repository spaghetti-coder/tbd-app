// Keyboard navigation in the settings pickers: arrows, Home/End and type-ahead.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";

const { optionKeyIndex, prefixMatchIndex } = sliceVm(["optionKeyIndex", "prefixMatchIndex"]);

const LANGS = ["Auto", "Русский", "Български", "English", "Español", "Română"];

// [key, current, option count, expected], the count 6 unless a single option list is asked for.
test("arrows step, Home and End jump, and the ends hold", () => {
  const rows = [
    ["ArrowDown", 2, 6, 3],
    ["ArrowDown", 5, 6, 5, "the last option stays"],
    ["ArrowUp", 2, 6, 1],
    ["ArrowUp", 0, 6, 0, "the first option stays"],
    ["Home", 3, 6, 0],
    ["End", 3, 6, 5],
    ["ArrowDown", 0, 1, 0, "a single option never moves"],
    ["ArrowUp", 0, 1, 0],
    ["Enter", 3, 6, 3, "an unknown key keeps the focus"],
  ];
  for (const [key, at, count, want, note] of rows) {
    assert.equal(optionKeyIndex(at, key, count), want, `${key} on ${at} of ${count}: ${note ?? "ok"}`);
  }
});

// [labels, typed, current, expected]
test("a typed letter moves to the next label starting with it", () => {
  const rows = [
    [LANGS, "р", 0, 1],
    [LANGS, "e", 0, 3],
    [LANGS, "R", 3, 5, "typing again moves on"],
    [LANGS, "a", 5, 0, "and wraps past the end"],
    [LANGS, "z", 2, 2, "no match keeps the focus"],
    [LANGS, "б", 0, 2],
    [LANGS, "E", 0, 3, "case is ignored"],
    // A label stored with decomposed letters (macOS keyboards) answers to the composed letter.
    [["A\u030Angstrom", "Tok"], "\u00E5", 1, 0],
  ];
  for (const [labels, typed, at, want, note] of rows) {
    assert.equal(prefixMatchIndex(labels, typed, at), want, `"${typed}": ${note ?? "ok"}`);
  }
});
