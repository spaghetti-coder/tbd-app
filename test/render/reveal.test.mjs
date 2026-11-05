// Scroll stops at the visible band; centring is what leaves a row under the keyboard and makes
// Chrome pan the visual viewport, taking the sticky header off screen.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";

const { revealDelta } = sliceVm(["revealDelta"]);

const band = { top: 64, bottom: 500 };

// [row top, row bottom, expected scroll], the band being the area between header and keyboard.
test("a row is scrolled just far enough to sit inside the band", () => {
  const rows = [
    [100, 144, 0],
    [64, 108, 0],
    [456, 500, 0],
    [470, 514, 14],
    [600, 644, 144],
    [20, 64, -44],
    [60, 900, -4],
  ];
  for (const [top, bottom, want] of rows) {
    assert.equal(revealDelta({ top, bottom }, band), want, `${top}..${bottom}`);
  }
});
