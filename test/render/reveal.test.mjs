// Scroll stops at the visible band; centring is what leaves a row under the keyboard and makes
// Chrome pan the visual viewport, taking the sticky header off screen.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "../../testkit/html-source.mjs";

const { revealDelta } = vm([slice("revealDelta"), "({ revealDelta })"]);

const band = { top: 64, bottom: 500 };
const rect = (top, bottom) => ({ top, bottom });

test("a row inside the band is left alone", () => {
  assert.equal(revealDelta(rect(100, 144), band), 0);
  assert.equal(revealDelta(rect(64, 108), band), 0, "top edge on the band edge");
  assert.equal(revealDelta(rect(456, 500), band), 0, "bottom edge on the band edge");
});

test("a row under the keyboard comes up by what sticks out, no further", () => {
  assert.equal(revealDelta(rect(470, 514), band), 14);
  assert.equal(revealDelta(rect(600, 644), band), 144, "a far row still lands on the band edge");
});

test("a row scrolled past the header comes back down to it", () => {
  assert.equal(revealDelta(rect(20, 64), band), -44);
});

test("a row taller than the band shows its top", () => {
  assert.equal(revealDelta(rect(60, 900), band), -4);
});
