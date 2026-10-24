// Unit tests for anchored popover placement: below the trigger, flip above when it would not fit,
// clamped into the viewport. The functions are sliced out of index.html and run in a VM (see html-source.mjs).

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const env = { innerWidth: 1440, innerHeight: 900, safeLeft: 0, safeRight: 0 };

const box = {
  document: { documentElement: {} },
  getComputedStyle: () => ({
    getPropertyValue: (name) => (name === "--safe-left" ? `${env.safeLeft}px` : `${env.safeRight}px`),
  }),
};
Object.defineProperty(box, "innerWidth", { get: () => env.innerWidth });
Object.defineProperty(box, "innerHeight", { get: () => env.innerHeight });
createContext(box);
runInContext(
  [
    slice("clamp"),
    slice("cssVarPx"),
    slice("anchoredBox"),
    "this.anchoredBox = anchoredBox;",
  ].join("\n"),
  box,
);

// The trigger sits at (left, top)..(right, bottom), like a getBoundingClientRect result.
const trigger = (top, bottom, left, right) => ({ top, bottom, left, right });

test("with room below the popup hangs under the trigger, right-aligned to it", () => {
  const pos = box.anchoredBox(trigger(100, 140, 700, 740), 300, 200);
  assert.deepEqual({ ...pos }, { top: 148, left: 440 });
});

test("a popup that would not fit below flips above the trigger", () => {
  // Bottom edge lands 8px above the trigger top.
  const pos = box.anchoredBox(trigger(700, 740, 700, 740), 300, 400);
  assert.equal(pos.top, 700 - 8 - 400);
});

test("a popup taller than every free edge parks below the viewport top", () => {
  const pos = box.anchoredBox(trigger(400, 440, 700, 740), 300, env.innerHeight - 10);
  assert.equal(pos.top, 8);
});

test("left stays clear of the left safe area", () => {
  env.safeLeft = 24;
  try {
    const pos = box.anchoredBox(trigger(100, 140, 0, 40), 300, 200);
    assert.equal(pos.left, 8 + 24);
  } finally {
    env.safeLeft = 0;
  }
});

test("the right edge stays clear of the right safe area", () => {
  env.safeRight = 16;
  try {
    const pos = box.anchoredBox(trigger(100, 140, env.innerWidth - 40, env.innerWidth), 300, 200);
    assert.equal(pos.left + 300, env.innerWidth - 8 - 16);
  } finally {
    env.safeRight = 0;
  }
});

test("a trigger at the last row of a long list still gets the whole popup on screen", () => {
  const rect = trigger(env.innerHeight - 88, env.innerHeight - 48, 1100, 1140);
  const height = 700;
  const pos = box.anchoredBox(rect, 300, height);
  assert.ok(pos.top >= 8, "below the top edge");
  assert.ok(pos.top + height <= env.innerHeight - 12, "above the bottom edge");
});
