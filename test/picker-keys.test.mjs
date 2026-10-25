// Keyboard navigation in the settings pickers: arrows, Home/End and type-ahead.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";

const { optionKeyIndex, prefixMatchIndex } = vm(
  [slice("optionKeyIndex"), slice("prefixMatchIndex"), "({ optionKeyIndex, prefixMatchIndex });"],
);

const LANGS = ["Auto", "Русский", "Български", "English", "Español", "Română"];

test("arrow down walks the list and stops at the last option", () => {
  assert.equal(optionKeyIndex(2, "ArrowDown", 6), 3);
  assert.equal(optionKeyIndex(5, "ArrowDown", 6), 5);
});

test("arrow up walks back and stops at the first option", () => {
  assert.equal(optionKeyIndex(2, "ArrowUp", 6), 1);
  assert.equal(optionKeyIndex(0, "ArrowUp", 6), 0);
});

test("Home and End jump to the ends", () => {
  assert.equal(optionKeyIndex(3, "Home", 6), 0);
  assert.equal(optionKeyIndex(3, "End", 6), 5);
});

test("a single option list never moves, and unknown keys keep the focus", () => {
  assert.equal(optionKeyIndex(0, "ArrowDown", 1), 0);
  assert.equal(optionKeyIndex(0, "ArrowUp", 1), 0);
  assert.equal(optionKeyIndex(3, "Enter", 6), 3);
});

test("a typed letter moves to the next label starting with it", () => {
  assert.equal(prefixMatchIndex(LANGS, "\u0440", 0), 1);
  assert.equal(prefixMatchIndex(LANGS, "e", 0), 3);
});

test("typing again moves on and wraps past the end", () => {
  assert.equal(prefixMatchIndex(LANGS, "R", 3), 5);
  assert.equal(prefixMatchIndex(LANGS, "a", 5), 0);
});

test("typing without a match keeps the focus", () => {
  assert.equal(prefixMatchIndex(LANGS, "z", 2), 2);
});

test("typing matches case and accents", () => {
  assert.equal(prefixMatchIndex(LANGS, "б", 0), 2);
  assert.equal(prefixMatchIndex(LANGS, "E", 0), 3);
  // A label stored with decomposed letters (macOS keyboards) answers to the composed letter.
  assert.equal(prefixMatchIndex(["A\u030Angstrom", "Tok"], "\u00E5", 1), 0);
});
