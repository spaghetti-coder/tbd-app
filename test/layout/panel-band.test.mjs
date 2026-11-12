// The band the minipanel may sit in: its bounds, the row-mode cut, the fraction → pixel map.

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
const { panelTopRange, panelFits, panelTop } = sliceVm(
  ["GESTURE", "clamp", "cssBottomInset", "panelCeiling", "panelTopRange", "panelFits", "panelTop"],
  box,
);

const range = (height) => plain(panelTopRange(height));

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
  assert.equal(panelFits(795), true, "one pixel of band left");
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

test("panelTop spreads the fraction over the collapsed band and lifts a tall panel into its own", () => {
  for (const [pct, want] of [[0, 80], [0.5, 452], [0.71, 608], [1, 824]]) {
    assert.equal(panelTop(pct, BASE, BASE), want, `pct ${pct}`);
  }
  assert.equal(panelTop(1, 262, BASE), 614, "a tall panel stops at its own ceiling");
  for (const height of [BASE, 144, 262, 400]) {
    const [floor, ceiling] = range(height);
    for (let pct = 0; pct <= 1.0001; pct += 0.05) {
      const top = panelTop(pct, height, BASE);
      assert.ok(top >= floor && top <= ceiling, `height ${height}, pct ${pct}`);
    }
  }
});
