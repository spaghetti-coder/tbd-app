// Hold-to-enter on the Archive row: a short press taps, a full hold lands once, and the click
// trailing any hold - finished or broken mid-fill - is swallowed.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";
import { fakeNode } from "./fake-dom.mjs";

// Virtual clock: timers fire only when the test advances it, in due order.
function clock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout: (fn, ms) => {
      seq += 1;
      timers.set(seq, { fn, at: now + (ms || 0) });
      return seq;
    },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      const limit = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= limit)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) {
          break;
        }
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = limit;
    },
  };
}

function control() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(fn);
    },
    // Returns whether any handler prevented the default.
    fire(type, event = {}) {
      let prevented = false;
      for (const fn of listeners.get(type) ?? []) {
        fn({ repeat: false, preventDefault: () => { prevented = true; }, ...event });
      }
      return prevented;
    },
  };
}

function rig() {
  const timers = clock();
  const { demoHold } = vm(
    [slice("DEMO_HOLD"), slice("demoHold"), "({ demoHold })"],
    { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout },
  );
  const button = control();
  const bar = fakeNode({ classes: ["hold"] });
  const taps = [];
  const holds = [];
  const holdConsumed = demoHold(button, bar, () => taps.push(1), () => holds.push(1));
  return { timers, button, bar, taps, holds, holdConsumed };
}

const filling = (r) => r.bar.classList.contains("is-run");

test("a short press never arms the hold, so the click taps", () => {
  const r = rig();
  r.button.fire("pointerdown");
  r.timers.advance(599);
  assert.equal(filling(r), false, "the silent window stays silent");
  r.button.fire("pointerup");
  assert.equal(r.holdConsumed(), false, "the trailing click runs the tap");
  r.timers.advance(10000);
  assert.equal(r.holds.length, 0);
});

test("the fill starts when the silent window ends", () => {
  const r = rig();
  r.button.fire("pointerdown");
  r.timers.advance(600);
  assert.equal(filling(r), true);
});

test("releasing mid-fill is a cancelled hold: the bar resets, the click is swallowed", () => {
  const r = rig();
  r.button.fire("pointerdown");
  r.timers.advance(900);
  assert.equal(filling(r), true);
  r.button.fire("pointerup");
  assert.equal(filling(r), false);
  r.timers.advance(10000);
  assert.equal(r.holds.length, 0);
  assert.equal(r.holdConsumed(), true, "a broken hold is a hold, not a tap");
  assert.equal(r.taps.length, 0);
});

test("leaving the button mid-fill cancels the same way", () => {
  const r = rig();
  r.button.fire("pointerdown");
  r.timers.advance(900);
  r.button.fire("pointerleave");
  assert.equal(filling(r), false);
  r.timers.advance(10000);
  assert.equal(r.holds.length, 0);
  assert.equal(r.holdConsumed(), true);
});

test("the full hold lands once, and the trailing click is swallowed", () => {
  const r = rig();
  r.button.fire("pointerdown");
  r.timers.advance(1799);
  assert.equal(r.holds.length, 0, "not yet");
  r.timers.advance(1);
  assert.equal(r.holds.length, 1);
  assert.equal(r.taps.length, 0);
  assert.equal(r.holdConsumed(), true, "the click after a finished hold is swallowed");
  assert.equal(r.holdConsumed(), false, "and only once");
});

test("after a finished hold the next short press taps again", () => {
  const r = rig();
  r.button.fire("pointerdown");
  r.timers.advance(1800);
  r.button.fire("pointerup");
  r.button.fire("pointerdown");
  r.button.fire("pointerup");
  assert.equal(r.holdConsumed(), false);
});

test("the long-press menu is suppressed", () => {
  const r = rig();
  assert.equal(r.button.fire("contextmenu"), true);
});

test("key repeat while held does not restart the hold", () => {
  const r = rig();
  r.button.fire("keydown", { key: " " });
  r.timers.advance(500);
  r.button.fire("keydown", { key: " ", repeat: true });
  r.timers.advance(1300);
  assert.equal(r.holds.length, 1, "the hold lands at the mark of the first press");
});

test("a quick Enter tap fires the tap from keyup, not the hold", () => {
  const r = rig();
  assert.equal(r.button.fire("keydown", { key: "Enter" }), true, "the browser click is taken over");
  r.timers.advance(200);
  r.button.fire("keyup", { key: "Enter" });
  assert.equal(r.taps.length, 1);
  r.timers.advance(10000);
  assert.equal(r.holds.length, 0);
});

test("Enter held for the full hold lands it, and its keyup stays silent", () => {
  const r = rig();
  r.button.fire("keydown", { key: "Enter" });
  r.timers.advance(1800);
  assert.equal(r.holds.length, 1);
  r.button.fire("keyup", { key: "Enter" });
  assert.equal(r.taps.length, 0);
});

test("Enter released mid-fill cancels: no hold, no tap", () => {
  const r = rig();
  r.button.fire("keydown", { key: "Enter" });
  r.timers.advance(900);
  assert.equal(filling(r), true);
  r.button.fire("keyup", { key: "Enter" });
  assert.equal(filling(r), false);
  r.timers.advance(10000);
  assert.equal(r.holds.length, 0);
  assert.equal(r.taps.length, 0);
});
