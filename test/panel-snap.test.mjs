// Unit tests for the minipanel dock-switch and vertical-bounds logic that lives inside index.html.
// The functions are sliced out of the source by name and evaluated in a VM (see html-source.mjs).

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice, sliceObject } from "./html-source.mjs";

const env = { innerHeight: 900, paddingBottom: "24px", topbarBottom: 68 };

const box = {
  document: {
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: env.topbarBottom }) }),
    body: {},
  },
  getComputedStyle: () => ({ paddingBottom: env.paddingBottom }),
};
Object.defineProperty(box, "innerHeight", { get: () => env.innerHeight });
createContext(box);
runInContext(
  [
    sliceObject("GESTURE"),
    slice("clamp"),
    slice("sideFor"),
    slice("cssBottomInset"),
    slice("panelTopRange"),
    slice("panelTop"),
    slice("panelFraction"),
    slice("detached"),
    "this.GESTURE = GESTURE;",
    "this.sideFor = sideFor;",
    "this.panelTopRange = panelTopRange;",
    "this.panelTop = panelTop;",
    "this.panelFraction = panelFraction;",
    "this.detached = detached;",
  ].join("\n"),
  box,
);
const { GESTURE, sideFor, panelTopRange, panelTop, panelFraction, detached } = box;

const LEFT = 100;
const RIGHT = 900;
const SPAN = RIGHT - LEFT;
const at = (fraction) => LEFT + SPAN * fraction;
// The range comes back as the VM realm's array, so rebuild it from its primitives.
const range = (height) => {
  const [min, max] = panelTopRange(height);
  return [min, max];
};

// The trigger is 33% of the path from the dock the panel is on; that is 264px over this span.
test("a panel on the left dock switches right a third of the way over", () => {
  assert.equal(sideFor(LEFT, LEFT, RIGHT, "left"), "left");
  assert.equal(sideFor(at(0.3), LEFT, RIGHT, "left"), "left");
  assert.equal(sideFor(LEFT + 264 - 1, LEFT, RIGHT, "left"), "left");
  assert.equal(sideFor(LEFT + 264 + 1, LEFT, RIGHT, "left"), "right");
  assert.equal(sideFor(at(0.9), LEFT, RIGHT, "left"), "right");
});

test("a panel on the right dock switches left a third of the way back", () => {
  assert.equal(sideFor(RIGHT, LEFT, RIGHT, "right"), "right");
  assert.equal(sideFor(RIGHT - SPAN * 0.3, LEFT, RIGHT, "right"), "right");
  assert.equal(sideFor(RIGHT - 264 + 1, LEFT, RIGHT, "right"), "right");
  assert.equal(sideFor(RIGHT - 264 - 1, LEFT, RIGHT, "right"), "left");
  assert.equal(sideFor(at(0.1), LEFT, RIGHT, "right"), "left");
});

test("a panel sitting in the middle goes to the side it moved away from last", () => {
  assert.equal(sideFor(at(0.5), LEFT, RIGHT, "left"), "right");
  assert.equal(sideFor(at(0.5), LEFT, RIGHT, "right"), "left");
});

test("sideFor answers left or right for any center", () => {
  for (let center = -50; center <= 1050; center += 25) {
    for (const side of ["left", "right"]) {
      assert.ok(["left", "right"].includes(sideFor(center, LEFT, RIGHT, side)), `center ${center}, ${side}`);
    }
  }
});

test("the trigger is 33% of the distance between the two docks", () => {
  for (const [left, right] of [[0, 600], [40, 760], [120, 1240]]) {
    const trigger = (right - left) * 0.33;
    assert.equal(sideFor(left + trigger - 1, left, right, "left"), "left");
    assert.equal(sideFor(left + trigger + 1, left, right, "left"), "right");
    assert.equal(sideFor(right - trigger + 1, left, right, "right"), "right");
    assert.equal(sideFor(right - trigger - 1, left, right, "right"), "left");
  }
});

test("panelTopRange keeps the panel below the topbar and above the bottom inset", () => {
  assert.deepEqual(range(120), [80, 756]);
  env.paddingBottom = "34px";
  assert.deepEqual(range(120), [80, 746], "the body padding bottom wins over the plain gap");
  env.paddingBottom = "0px";
  assert.deepEqual(range(120), [80, 768], "no inset: the gesture gap is the floor");
  env.paddingBottom = "24px";
});

test("panelTopRange never inverts on a viewport too short for the panel", () => {
  env.innerHeight = 200;
  assert.deepEqual(range(120), [80, 80]);
  env.innerHeight = 900;
});

// Collapsed pill: 40px grip plus 2x5px padding and 2x1px border.
const BASE = 52;
const MIN = 80;
const COLLAPSED = 824;

test("the panel stays on its dock until the finger is 24px away", () => {
  assert.equal(detached(500, 500, false), false);
  assert.equal(detached(512, 500, false), false);
  assert.equal(detached(488, 500, false), false);
  assert.equal(detached(500 + GESTURE.detach - 1, 500, false), false);
  assert.equal(detached(500 + GESTURE.detach, 500, false), true);
  assert.equal(detached(500 - GESTURE.detach, 500, false), true);
  assert.equal(detached(700, 500, false), true, "a finger on the other side of the dock");
});

test("a detached panel is never re-docked by the threshold", () => {
  for (const offset of [-400, -24, 0, 1, 24, 400]) {
    assert.equal(detached(500 + offset, 500, true), true, `offset ${offset}`);
  }
});

test("detached flips exactly at the threshold and answers only true or false", () => {
  for (let desired = 450; desired <= 550; desired += 1) {
    const answer = detached(desired, 500, false);
    assert.equal(typeof answer, "boolean", `desired ${desired}`);
    assert.equal(answer, Math.abs(desired - 500) >= GESTURE.detach, `desired ${desired}`);
  }
});

test("panelTop on the collapsed panel is the old fraction-of-band formula", () => {
  for (let pct = 0; pct <= 1.0001; pct += 0.05) {
    const p = Math.round(pct * 100) / 100;
    assert.equal(panelTop(p, BASE, BASE), Math.round(MIN + p * (COLLAPSED - MIN)), `pct ${p}`);
  }
});

test("the grip holds its place while the panel grows", () => {
  for (const height of [52, 144, 262]) {
    assert.equal(panelTop(0, height, BASE), 80, `height ${height}`);
    assert.equal(panelTop(0.5, height, BASE), 452, `height ${height}`);
    assert.equal(panelTop(0.71, height, BASE), 608, `height ${height}`);
  }
});

test("a tall panel is lifted into the band instead of hanging off the bottom", () => {
  assert.equal(panelTop(1, 262, BASE), 614);
  assert.deepEqual(range(262), [80, 614]);
  for (const height of [52, 144, 262, 400]) {
    const [floor, ceiling] = range(height);
    for (let pct = 0; pct <= 1.0001; pct += 0.05) {
      const top = panelTop(pct, height, BASE);
      assert.ok(top >= floor && top <= ceiling, `height ${height}, pct ${pct}`);
    }
    assert.ok(floor <= ceiling);
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
  env.innerHeight = 200;
  assert.equal(panelFraction(100, 262), 0, "min equals max: no division");
  env.innerHeight = 900;
});
