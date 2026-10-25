// Aiming a drag at a collapsed checklist: hold targets, jitter, placeholder parking, auto-scroll.

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice, vm } from "./html-source.mjs";
import { fakeNode } from "./fake-dom.mjs";

let board = [];

const { GESTURE, aim, timers, setDrag, setScrolling, collapsedHeadAt, retarget, handleHover, clearCollapsedTarget } = vm(
  [
    slice("GESTURE"),
    "let drag = null;",
    "let autoScrolling = false;",
    "const timers = { armed: [], cleared: 0 };",
    "function setTimeout(fn, ms) { timers.armed.push(ms); return timers.armed.length; }",
    "function clearTimeout() { timers.cleared++; }",
    slice("dropCard"),
    slice("collapsedHeadAt"),
    slice("clearCollapsedTarget"),
    slice("handleHover"),
    // Only the aim is under test; the layout retarget() drives is stubbed out.
    "function cloneCenter() { return aim.y; }",
    "function targetContainer() { return aim.container; }",
    "function indexAt() { return 0; }",
    "function moveClone() {}",
    "function placeGap() {}",
    slice("retarget"),
    "const aim = { y: 0, container: null };",
    "({ GESTURE, aim, timers, setDrag: (value) => { drag = value; }, setScrolling: (value) => { autoScrolling = value; }, collapsedHeadAt, retarget, handleHover, clearCollapsedTarget });",
  ],
  {
    CSS: { escape: (id) => id },
    document: {
      querySelectorAll: () => board.filter((card) => !card.classes.has("is-open")).map(headOf),
      querySelector: (sel) => board.find((card) => card.dataset.id === /data-id="([^"]+)"/.exec(sel)[1]) ?? null,
    },
  },
);

// A collapsed card is its head: the body is hidden, so both share a rect.
function card(id, top, bottom, { open = false } = {}) {
  const rect = { top, bottom };
  return fakeNode({
    classes: ["card", ...(open ? ["is-open"] : [])],
    kind: "list",
    id,
    rect,
    children: [fakeNode({ classes: ["card__head"], rect })],
  });
}

const headOf = (node) => node.querySelector(":scope > .card__head");

// timers.armed comes back as the VM realm's array, so copy it into a plain one.
const armed = () => [...timers.armed];

const dragState = (over = null) => ({
  kind: "item",
  ids: ["i1"],
  gap: fakeNode({ classes: ["drop-gap"] }),
  container: null,
  index: 0,
  hoverId: over,
  hoverTimer: 0,
  collapsedId: null,
});

// A is at the top, C below it, with a gap in between that belongs to neither.
function setup(held = null) {
  board = [card("A", 0, 60), card("C", 300, 360)];
  const drag = dragState(held);
  setDrag(drag);
  timers.armed.length = 0;
  timers.cleared = 0;
  setScrolling(false);
  return { A: board[0], C: board[1], drag };
}

test("the aim lands on the closed head it is over", () => {
  const { A, C } = setup();
  assert.equal(collapsedHeadAt(30), headOf(A));
  assert.equal(collapsedHeadAt(330), headOf(C));
  assert.equal(collapsedHeadAt(200), null, "the strip between two lists is no target");
});

test("a list that is not held is only hit inside its own rect", () => {
  setup();
  assert.equal(collapsedHeadAt(290), null, "10px above C is still nothing");
  assert.equal(collapsedHeadAt(370), null, "10px below C is still nothing");
});

test("jitter on the held target keeps it", () => {
  const { C } = setup("C");
  assert.equal(collapsedHeadAt(300 - 8), headOf(C), "8px above the top edge");
  assert.equal(collapsedHeadAt(360 + 8), headOf(C), "8px below the bottom edge");
  assert.equal(collapsedHeadAt(300 - GESTURE.hoverPad), headOf(C), "right on the pad");
  assert.equal(collapsedHeadAt(68), null, "a neighbour list gets no pad");
});

test("aiming further than the pad away releases the target", () => {
  setup("C");
  assert.equal(collapsedHeadAt(300 - 30), null);
  assert.equal(collapsedHeadAt(360 + 30), null);
});

test("a scrolling page does not arm the hold, a standing one does", () => {
  const { C, drag } = setup();
  aim.y = 330;
  aim.container = null;
  setScrolling(true);
  retarget();
  assert.deepEqual(armed(), [], "no hold while the page runs");
  assert.equal(drag.collapsedId, null);
  assert.equal(C.classes.has("is-drop-hover"), false);
  setScrolling(false);
  retarget();
  assert.deepEqual(armed(), [GESTURE.hover]);
  assert.equal(drag.collapsedId, "C");
});

test("hovering marks the target and parks the placeholder without hiding it", () => {
  const { C, drag } = setup();
  handleHover(headOf(C));
  assert.equal(C.classes.has("is-drop-hover"), true);
  assert.equal(drag.gap.classes.has("is-standby"), true);
  assert.equal(drag.gap.style.display, undefined, "display is left alone, so the height stays");
  assert.deepEqual(armed(), [GESTURE.hover]);
  handleHover(headOf(C));
  assert.deepEqual(armed(), [GESTURE.hover], "staying on the same target does not restart the hold");
  assert.equal(timers.cleared, 1);
  clearCollapsedTarget();
  assert.equal(C.classes.has("is-drop-hover"), false);
  assert.equal(drag.gap.classes.has("is-standby"), false);
  assert.equal(drag.collapsedId, null);
});

/* ---------- auto-scroll frames ---------- */

const page = { y: 0, max: 1000, viewport: 900 };
const frameBox = {
  scrollBy: (dx, dy) => {
    page.y = Math.max(0, Math.min(page.max, page.y + dy));
  },
};
Object.defineProperty(frameBox, "innerHeight", { get: () => page.viewport });
Object.defineProperty(frameBox, "scrollY", { get: () => page.y });
createContext(frameBox);
const { start, run, stop, scrolling } = runInContext(
  [
    slice("GESTURE"),
    slice("clamp"),
    slice("ramp"),
    "let pointerY = 0;",
    "let autoScrolling = false;",
    "let scrollRaf = 0;",
    "let panelDrag = null;",
    "const drag = { kind: \"item\" };",
    "const frames = [];",
    "const calls = [];",
    "function requestAnimationFrame(fn) { frames.push(fn); return frames.length; }",
    "function cancelAnimationFrame() { frames.length = 0; }",
    "function retarget() { calls.push(autoScrolling ? \"scrolling\" : \"held\"); }",
    slice("startAutoScroll"),
    slice("stopAutoScroll"),
    "({",
    "  start: () => { calls.length = 0; startAutoScroll(); },",
    "  run: (pointer, times) => {",
    "    pointerY = pointer;",
    "    for (let i = 0; i < times; i++) { const step = frames.shift(); if (step) step(); }",
    "    return calls.join(\",\");",
    "  },",
    "  stop: stopAutoScroll,",
    "  scrolling: () => autoScrolling,",
    "});",
  ].join("\n"),
  frameBox,
);

test("auto-scroll retargets while it moves and once more when it runs out of page", () => {
  page.y = 994;
  start();
  assert.equal(run(page.viewport - 12, 3), "scrolling,held", "the hold arms on the frame the scroll stops");
  assert.equal(scrolling(), false);
  stop();
  assert.equal(scrolling(), false, "stopping clears the flag");
});

test("auto-scroll leaves the aim alone off the edges", () => {
  page.y = 400;
  start();
  assert.equal(run(500, 3), "");
  assert.equal(page.y, 400, "no scroll, no retarget: the pointermove frames own the aim");
});
