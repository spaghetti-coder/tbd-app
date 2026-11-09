// The mode machine: what a press turns into, and what a release leaves behind.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

const timers = { armed: [], cleared: 0 };
const calls = [];

const board = () => ({
  kind: "item",
  id: "i1",
  handle: fakeNode({ classes: ["item"], children: [fakeNode({ classes: ["swipe-bg"] }), fakeNode({ classes: ["swipe-bg", "swipe-bg--right"] })] }),
  mover: fakeNode({ classes: ["item__row"] }),
});

const box = {
  setTimeout: (fn, ms) => {
    timers.armed.push([fn, ms]);
    return timers.armed.length;
  },
  clearTimeout: () => { timers.cleared += 1; },
  document: { documentElement: { classList: { add() {}, remove() {} } } },
  autoScroll: { at() {} },
  editor: { open: (kind, id) => calls.push(`edit:${kind}:${id}`) },
  ask: (kind, ids, verb) => calls.push(`${verb}:${ids.join(",")}`),
  modalOpen: () => box.open === true,
  rowHandle: () => box.hit,
  rowDrag: {
    active: () => box.dragging === true,
    start: (hit) => { calls.push(`drag:${hit.id}`); return true; },
    update: (x, y) => calls.push(`aim:${x},${y}`),
    release: () => calls.push("release"),
  },
};

const { GESTURE, createPointer } = sliceVm(["GESTURE", "clamp", "rubber", "createPointer"], box);
const pointer = createPointer({
  rowDrag: box.rowDrag, autoScroll: box.autoScroll, editor: box.editor, ask: box.ask, modalOpen: box.modalOpen,
});

const press = (x = 100, y = 100) => {
  timers.armed.length = 0;
  calls.length = 0;
  box.hit = board();
  pointer.down({ clientX: x, clientY: y, pointerType: "mouse", button: 0, target: {} });
  return box.hit;
};
const fire = () => timers.armed.at(-1)[0]();const move = (x, y) => pointer.move({ clientX: x, clientY: y });
const moved = () => box.hit.mover.style.transform ?? "";

test("a hold that fills becomes a drag, at the press interval", () => {
  press();
  assert.deepEqual(timers.armed.at(-1)[1], GESTURE.press);
  fire();
  assert.deepEqual(calls, ["drag:i1"]);
  assert.equal(pointer.active(), true);
});

test("a fast horizontal pull is a swipe, and the hold never fires", () => {
  press();
  move(100 + GESTURE.swipeMin + 1, 102);
  assert.match(moved(), /translateX\(/, "the row rides with the finger");
  assert.equal(timers.cleared, 1, "the hold is off");
  assert.deepEqual(calls, []);
});

test("a vertical pull off the row drops the gesture", () => {
  press();
  move(102, 100 + GESTURE.slop + 1);
  assert.equal(pointer.active(), false);
  assert.match(moved(), /^$/, "no swipe painted");
  assert.deepEqual(calls, []);
});

test("a released drag suppresses the click the browser fires after it", () => {
  press();
  fire();
  calls.length = 0;
  pointer.up();
  assert.deepEqual(calls, ["release"]);
  assert.equal(pointer.clickSuppressed(), true);
  timers.armed.at(-1)[0]();
  assert.equal(pointer.clickSuppressed(), false);
});

test("a swipe that does not reach the trigger neither edits nor archives", () => {
  press();
  move(100 + GESTURE.swipeMin + 1, 100);
  pointer.up();
  assert.deepEqual(calls, []);
});

test("a swipe past the trigger edits to the right and archives to the left", () => {
  press();
  move(100 + GESTURE.trigger + 1, 100);
  pointer.up();
  assert.deepEqual(calls, ["edit:item:i1"]);

  press();
  move(100 - GESTURE.trigger - 1, 100);
  pointer.up();
  assert.deepEqual(calls, ["archive:i1"]);
});

test("a press on a dialog starts nothing", () => {
  box.open = true;
  press();
  assert.deepEqual(timers.armed, []);
  assert.equal(pointer.active(), false);
  box.open = false;
});
