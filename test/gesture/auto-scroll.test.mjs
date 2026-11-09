// Edge auto-scroll: the ramp, the frame hook, and the flag that keeps a moving page off arming a hold.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";

const page = { y: 0, max: 1000, viewport: 900 };
const frames = [];
const fired = [];

const box = {
  scrollBy: (dx, dy) => { page.y = Math.max(0, Math.min(page.max, page.y + dy)); },
  requestAnimationFrame: (fn) => {
    frames.push(fn);
    return frames.length;
  },
  cancelAnimationFrame: () => { frames.length = 0; },
};
Object.defineProperty(box, "innerHeight", { get: () => page.viewport });
Object.defineProperty(box, "scrollY", { get: () => page.y });

let held = true;
const { createAutoScroll } = sliceVm(["GESTURE", "clamp", "ramp", "createAutoScroll"], box);
const scroll = createAutoScroll(() => fired.push("frame"), () => held);

// One loop for all: stop first, so a test never inherits a frame from the one before.
const fresh = () => {
  held = true;
  scroll.stop();
  frames.length = 0;
  fired.length = 0;
};

const run = (y, times) => {
  scroll.at(y);
  for (let i = 0; i < times; i += 1) {
    const step = frames.shift();
    if (step) {
      step();
    }
  }
  return fired.join(",");
};

test("auto-scroll fires while the page moves and once more when it runs out", () => {
  page.y = 994;
  fresh();
  scroll.start();
  assert.equal(run(page.viewport - 12, 3), "frame,frame", "the last frame runs on a settled page");
  assert.equal(scroll.moved(), false);
});

test("auto-scroll leaves the aim alone off the edges", () => {
  page.y = 400;
  fresh();
  scroll.start();
  assert.equal(run(500, 3), "");
  assert.equal(page.y, 400, "no scroll, no frame: the pointermove frames own the aim");
});

test("a loop outliving its drag stops itself", () => {
  page.y = 400;
  fresh();
  scroll.start();
  held = false;
  assert.equal(run(500, 2), "", "no frame is worked after the release");
  assert.equal(frames.length, 0, "the loop is gone, not spinning");
  assert.equal(page.y, 400, "no scroll");
});

test("stopping cancels the loop and clears the moving flag", () => {
  page.y = 994;
  fresh();
  scroll.start();
  run(page.viewport - 12, 1);
  assert.equal(scroll.moved(), true);
  scroll.stop();
  assert.equal(scroll.moved(), false);
  assert.equal(frames.length, 0);
});
