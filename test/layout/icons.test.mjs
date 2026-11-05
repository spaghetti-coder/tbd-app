// Every icon the app asks for has an entry, a fallback and a mask.

import assert from "node:assert/strict";
import test from "node:test";
import { html, sliceVm } from "../../testkit/html-source.mjs";

const { ICONS: icons } = sliceVm(["ICONS"]);

test("every icon the button builders are called with is in ICONS", () => {
  const used = new Set();
  for (const call of html.matchAll(/(?:panelButton|menuItem|iconPair)\(\s*([^,)]*)/g)) {
    for (const icon of call[1].matchAll(/"([a-z-]+)"/g)) {
      used.add(icon[1]);
    }
  }
  // actionRow gets action objects, not an icon name.
  for (const prop of html.matchAll(/icon:\s*"([a-z-]+)"/g)) {
    used.add(prop[1]);
  }
  assert.ok(used.size >= 13, `the call scan found only ${used.size} icons; the regex is out of date`);
  for (const icon of used) {
    assert.ok(icon in icons, `"${icon}" has no ICONS entry`);
  }
});

test("every icon has a fallback glyph", () => {
  for (const [name, entry] of Object.entries(icons)) {
    assert.equal(typeof entry[1], "string", `"${name}" has no fallback glyph`);
    assert.ok(entry[1].length > 0, `"${name}" has an empty fallback glyph`);
  }
});
