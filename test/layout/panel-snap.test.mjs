// Minipanel dock-switch and vertical-bounds logic.

import assert from "node:assert/strict";
import test from "node:test";
import { plain, withEnv as restoreEnv } from "../../testkit/fixtures.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";

const env = { innerHeight: 900, paddingBottom: "24px", topbarBottom: 68 };
const withEnv = (patch, fn) => restoreEnv(env, patch, fn);

const box = {
  document: {
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: env.topbarBottom }) }),
    body: {},
  },
  getComputedStyle: () => ({ paddingBottom: env.paddingBottom }),
};
Object.defineProperty(box, "innerHeight", { get: () => env.innerHeight });
const { GESTURE, sideFor, panelTopRange, panelFits, panelTop, panelFraction, detached } = sliceVm(
  ["GESTURE", "clamp", "sideFor", "cssBottomInset", "panelCeiling", "panelTopRange",
    "panelFits", "panelTop", "panelFraction", "detached"],
  box,
);

const LEFT = 100;
const RIGHT = 900;
const SPAN = RIGHT - LEFT;
const at = (fraction) => LEFT + SPAN * fraction;
const range = (height) => plain(panelTopRange(height));

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

test("panelFits is true only while the panel has a band to move within", () => {
  assert.equal(panelFits(143), true, "the plain pill on a desktop viewport");
  assert.equal(panelFits(796), false, "exactly the band leaves nowhere to move");
  withEnv({ innerHeight: 390 }, () => {
    assert.equal(panelFits(143), true, "landscape without a selection keeps the pill stacked");
    assert.equal(panelFits(374), false, "the bulk pill on a landscape phone lies down");
  });
  withEnv({ innerHeight: 390, paddingBottom: "0px" }, () => {
    assert.equal(panelFits(297), true, "no inset: the gesture gap is the only floor");
    assert.equal(panelFits(298), false);
  });
});

// Collapsed pill: 40px grip plus 2x5px padding and 2x1px border.
const BASE = 52;
const MIN = 80;
const COLLAPSED = 824;

test("detached peels at the threshold and re-glues at half of it", () => {
  assert.ok(GESTURE.detach / 2 > GESTURE.slop, "a band narrower than the jitter flickers the dock");
  const dock = 500;
  const rows = [
    // On the dock it holds until the pointer is past the peel threshold.
    [dock + 11, false, false],
    [dock + 23, false, false],
    [dock + 24, false, true],
    [dock - 24, false, true],
    // Off the dock it re-glues only inside half the threshold.
    [dock + 13, true, true],
    [dock + 12, true, true],
    [dock + 11, true, false],
    [dock, true, false],
    [dock - 11, true, false],
    [dock - 12, true, true],
    // Far on either side it stays free.
    [900, true, true],
    [300, true, true],
  ];
  for (const [desired, wasDetached, want] of rows) {
    assert.equal(detached(desired, dock, wasDetached), want, `desired ${desired}, was ${wasDetached}`);
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
