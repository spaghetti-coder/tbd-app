// Anchored popover placement: below, flipped above, or pinned to the edge when neither fits.

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const env = { innerWidth: 1440, innerHeight: 900, safeLeft: 0, safeRight: 0 };

// Asserting against the env directly would leak a mutation into the next test if one fails.
const withEnv = (patch, fn) => {
  const restore = { ...env };
  Object.assign(env, patch);
  try {
    fn();
  } finally {
    Object.assign(env, restore);
  }
};

const box = {
  document: { documentElement: {} },
  getComputedStyle: () => ({
    getPropertyValue: (name) => (name === "--safe-left" ? `${env.safeLeft}px` : `${env.safeRight}px`),
  }),
};
Object.defineProperty(box, "innerWidth", { get: () => env.innerWidth });
Object.defineProperty(box, "innerHeight", { get: () => env.innerHeight });
createContext(box);
const { anchoredBox } = runInContext(
  [slice("clamp"), slice("cssVarPx"), slice("anchoredBox"), "({ anchoredBox });"].join("\n"),
  box,
);

// The trigger sits at (left, top)..(right, bottom), like a getBoundingClientRect result.
const trigger = (top, bottom, left, right) => ({ top, bottom, left, right });

test("with room below the popup hangs under the trigger, right-aligned to it", () => {
  const pos = anchoredBox(trigger(100, 140, 700, 740), 300, 200);
  assert.deepEqual({ ...pos }, { top: 148, left: 440, maxHeight: 740 });
});

test("a popup that would not fit below flips above the trigger", () => {
  // Bottom edge lands 8px above the trigger top.
  const pos = anchoredBox(trigger(700, 740, 700, 740), 300, 400);
  assert.equal(pos.top, 700 - 8 - 400);
});

test("a list taller than both free edges stays under its trigger and scrolls", () => {
  const pos = anchoredBox(trigger(400, 440, 700, 740), 300, env.innerHeight - 10);
  assert.equal(pos.top, 448, "starts right below the trigger");
  assert.equal(pos.top + pos.maxHeight, env.innerHeight - 12, "reaches the bottom margin");
});

test("a too-tall list with room above hangs on the trigger's top edge instead", () => {
  const pos = anchoredBox(trigger(700, 740, 700, 740), 300, env.innerHeight - 100);
  assert.equal(pos.top, 8, "clamped to the top edge");
  assert.equal(pos.top + pos.maxHeight, 700 - 8, "its bottom edge touches the trigger");
});

test("left stays clear of the left safe area", () => {
  withEnv({ safeLeft: 24 }, () => {
    const pos = anchoredBox(trigger(100, 140, 0, 40), 300, 200);
    assert.equal(pos.left, 8 + 24);
  });
});

test("the right edge stays clear of the right safe area", () => {
  withEnv({ safeRight: 16 }, () => {
    const pos = anchoredBox(trigger(100, 140, env.innerWidth - 40, env.innerWidth), 300, 200);
    assert.equal(pos.left + 300, env.innerWidth - 8 - 16);
  });
});

test("a trigger at the last row of a long list still gets the whole popup on screen", () => {
  const rect = trigger(env.innerHeight - 88, env.innerHeight - 48, 1100, 1140);
  const height = 700;
  const pos = anchoredBox(rect, 300, height);
  assert.ok(pos.top >= 8, "below the top edge");
  assert.ok(pos.top + height <= env.innerHeight - 12, "above the bottom edge");
});
