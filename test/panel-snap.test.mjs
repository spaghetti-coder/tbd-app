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
    slice("sideFor"),
    slice("cssBottomInset"),
    slice("panelTopRange"),
    "this.sideFor = sideFor;",
    "this.panelTopRange = panelTopRange;",
  ].join("\n"),
  box,
);
const { sideFor, panelTopRange } = box;

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
