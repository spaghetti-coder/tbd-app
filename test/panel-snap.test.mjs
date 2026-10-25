// Minipanel dock-switch and vertical-bounds logic.

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const env = { innerHeight: 900, paddingBottom: "24px", topbarBottom: 68 };

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
  document: {
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: env.topbarBottom }) }),
    body: {},
  },
  getComputedStyle: () => ({ paddingBottom: env.paddingBottom }),
};
Object.defineProperty(box, "innerHeight", { get: () => env.innerHeight });
createContext(box);
const { GESTURE, sideFor, panelTopRange, panelTop, panelFraction, detached } = runInContext(
  [
    slice("GESTURE"),
    slice("clamp"),
    slice("sideFor"),
    slice("cssBottomInset"),
    slice("panelTopRange"),
    slice("panelTop"),
    slice("panelFraction"),
    slice("detached"),
    "({ GESTURE, sideFor, panelTopRange, panelTop, panelFraction, detached });",
  ].join("\n"),
  box,
);

const LEFT = 100;
const RIGHT = 900;
const SPAN = RIGHT - LEFT;
const at = (fraction) => LEFT + SPAN * fraction;
// The range comes back as the VM realm's array, so rebuild it from its primitives.
const range = (height) => {
  const [min, max] = panelTopRange(height);
  return [min, max];
};

test("sideFor switches docks only past 33% of the span from the current one", () => {
  const rows = [];
  for (const [left, right] of [[0, 600], [40, 760], [LEFT, RIGHT], [120, 1240]]) {
    const trigger = (right - left) * 0.33;
    rows.push(
      [left, left, right, "left", "left"],
      [left + trigger - 1, left, right, "left", "left"],
      [left + trigger + 1, left, right, "left", "right"],
      [right, left, right, "right", "right"],
      [right - trigger + 1, left, right, "right", "right"],
      [right - trigger - 1, left, right, "right", "left"],
    );
  }
  rows.push(
    [at(0.3), LEFT, RIGHT, "left", "left"],
    [at(0.9), LEFT, RIGHT, "left", "right"],
    [at(0.1), LEFT, RIGHT, "right", "left"],
    [at(0.5), LEFT, RIGHT, "left", "right"],
    [at(0.5), LEFT, RIGHT, "right", "left"],
  );
  for (const [center, left, right, from, want] of rows) {
    assert.equal(sideFor(center, left, right, from), want, `center ${center}, from ${from}`);
  }
});

test("panelTopRange keeps the panel below the topbar and above the bottom inset", () => {
  assert.deepEqual(range(120), [80, 756]);
  withEnv({ paddingBottom: "34px" }, () => {
    assert.deepEqual(range(120), [80, 746], "the body padding bottom wins over the plain gap");
  });
  withEnv({ paddingBottom: "0px" }, () => {
    assert.deepEqual(range(120), [80, 768], "no inset: the gesture gap is the floor");
  });
});

test("panelTopRange never inverts on a viewport too short for the panel", () => {
  withEnv({ innerHeight: 200 }, () => {
    assert.deepEqual(range(120), [80, 80]);
  });
});

// Collapsed pill: 40px grip plus 2x5px padding and 2x1px border.
const BASE = 52;
const MIN = 80;
const COLLAPSED = 824;

test("detached flips exactly at the threshold and never re-docks", () => {
  const rows = [
    [300, false, true],
    [700, false, true],
  ];
  for (const offset of [-400, -24, 0, 1, 24, 400]) {
    rows.push([500 + offset, true, true]);
  }
  for (let desired = 450; desired <= 550; desired += 1) {
    rows.push([desired, false, Math.abs(desired - 500) >= GESTURE.detach]);
  }
  for (const [desired, wasDetached, want] of rows) {
    assert.equal(detached(desired, 500, wasDetached), want, `desired ${desired}, wasDetached ${wasDetached}`);
  }
});

test("panelTop on the collapsed panel is the old fraction-of-band formula", () => {
  for (let pct = 0; pct <= 1.0001; pct += 0.05) {
    const p = Math.round(pct * 100) / 100;
    assert.equal(panelTop(p, BASE, BASE), Math.round(MIN + p * (COLLAPSED - MIN)), `pct ${p}`);
  }
});

test("panelTop keeps the grip on the collapsed band and lifts a tall panel into its own", () => {
  assert.deepEqual(range(262), [80, 614]);
  const exact = [];
  for (const height of [52, 144, 262]) {
    exact.push([height, 0, 80], [height, 0.5, 452], [height, 0.71, 608]);
  }
  exact.push([262, 1, 614]);
  for (const [height, pct, want] of exact) {
    assert.equal(panelTop(pct, height, BASE), want, `height ${height}, pct ${pct}`);
  }
  for (const height of [52, 144, 262, 400]) {
    const [floor, ceiling] = range(height);
    for (let pct = 0; pct <= 1.0001; pct += 0.05) {
      const top = panelTop(pct, height, BASE);
      assert.ok(top >= floor && top <= ceiling, `height ${height}, pct ${pct}`);
    }
  }
});

test("panelFraction reads back the anchor the grip was left at", () => {
  for (const pct of [0, 0.25, 0.5, 1]) {
    assert.equal(panelFraction(panelTop(pct, BASE, BASE), BASE), pct, `pct ${pct}`);
  }
  const top = panelTop(0.717, BASE, BASE);
  const back = panelFraction(top, BASE);
  assert.ok(Math.abs(back - 0.717) * (COLLAPSED - MIN) < 0.5, `round trip lands within half a pixel: ${back}`);
});

test("a drag that ended lifted by a tall panel lands on the same grip position", () => {
  const lifted = panelTop(1, 262, BASE);
  const pct = panelFraction(lifted, BASE);
  assert.equal(panelTop(pct, BASE, BASE), lifted);
});

test("panelFraction clamps outside the band and survives a band with no room", () => {
  assert.equal(panelFraction(MIN - 40, BASE), 0);
  assert.equal(panelFraction(COLLAPSED + 40, BASE), 1);
  assert.equal(panelFraction(NaN, BASE), 0);
  withEnv({ innerHeight: 200 }, () => {
    assert.equal(panelFraction(100, 262), 0, "min equals max: no division");
  });
});
