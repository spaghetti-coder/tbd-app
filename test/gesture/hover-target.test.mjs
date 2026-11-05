// Aiming a drag: hold targets, jitter, placeholder parking, auto-scroll, and where the drop lands.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

let board = [];
const timers = { armed: [], cleared: 0 };
const aim = { y: 0, container: null };

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

const hoverBox = {
  drag: null,
  autoScrolling: false,
  setTimeout: (fn, ms) => {
    timers.armed.push(ms);
    return timers.armed.length;
  },
  clearTimeout: () => { timers.cleared += 1; },
  // Only the aim is under test; the layout retarget() drives is stubbed out.
  cloneCenter: () => aim.y,
  targetContainer: () => aim.container,
  indexAt: () => 0,
  moveClone: () => {},
  placeGap: () => {},
  CSS: { escape: (id) => id },
  document: {
    querySelectorAll: () => board.filter((card) => !card.classes.has("is-open")).map(headOf),
    querySelector: (sel) => board.find((node) => node.dataset.id === /data-id="([^"]+)"/.exec(sel)[1]) ?? null,
  },
};

const { GESTURE, collapsedHeadAt, retarget, handleHover, clearCollapsedTarget } = sliceVm(
  ["GESTURE", "rowById", "collapsedHeadAt", "clearCollapsedTarget", "handleHover", "retarget"], hoverBox,
);

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
  timers.armed.length = 0;
  timers.cleared = 0;
  hoverBox.autoScrolling = false;
  hoverBox.drag = dragState(held);
  return { A: board[0], C: board[1], drag: hoverBox.drag };
}

// [held id, aim y, expected card id, note]
test("the aim lands on the closed head it is over, and holds within the pad of its own target", () => {
  const rows = [
    [null, 30, "A"],
    [null, 330, "C"],
    [null, 200, null, "the strip between two lists is no target"],
    [null, 290, null, "10px above C is still nothing"],
    [null, 370, null, "10px below C is still nothing"],
    ["C", 292, "C", "8px above the top edge"],
    ["C", 368, "C", "8px below the bottom edge"],
    ["C", 288, "C", "right on the pad"],
    ["C", 68, null, "a neighbour list gets no pad"],
    ["C", 270, null, "further than the pad releases the target"],
    ["C", 390, null, "and so does it below"],
  ];
  for (const [over, y, want, note] of rows) {
    const { A, C } = setup(over);
    const heads = { A: headOf(A), C: headOf(C) };
    assert.equal(collapsedHeadAt(y), want && heads[want], `${note ?? `${y} held by ${over}`}`);
  }
});

test("a scrolling page does not arm the hold, a standing one does", () => {
  const { C, drag } = setup();
  aim.y = 330;
  aim.container = null;
  hoverBox.autoScrolling = true;
  retarget();
  assert.deepEqual(timers.armed, [], "no hold while the page runs");
  assert.equal(drag.collapsedId, null);
  assert.equal(C.classes.has("is-drop-hover"), false);
  hoverBox.autoScrolling = false;
  retarget();
  assert.deepEqual(timers.armed, [GESTURE.hover]);
  assert.equal(drag.collapsedId, "C");
});

test("hovering marks the target and parks the placeholder without hiding it", () => {
  const { C, drag } = setup();
  handleHover(headOf(C));
  assert.equal(C.classes.has("is-drop-hover"), true);
  assert.equal(drag.gap.classes.has("is-standby"), true);
  assert.equal(drag.gap.style.display, undefined, "display is left alone, so the height stays");
  assert.deepEqual(timers.armed, [GESTURE.hover]);
  handleHover(headOf(C));
  assert.deepEqual(timers.armed, [GESTURE.hover], "staying on the same target does not restart the hold");
  assert.equal(timers.cleared, 1);
  clearCollapsedTarget();
  assert.equal(C.classes.has("is-drop-hover"), false);
  assert.equal(drag.gap.classes.has("is-standby"), false);
  assert.equal(drag.collapsedId, null);
});

/* ---------- auto-scroll frames ---------- */

const page = { y: 0, max: 1000, viewport: 900 };
const frames = [];
const scrollCalls = [];
const scrollBox = {
  pointerY: 0,
  autoScrolling: false,
  scrollRaf: 0,
  panelDrag: null,
  drag: { kind: "item" },
  scrollBy: (dx, dy) => { page.y = Math.max(0, Math.min(page.max, page.y + dy)); },
  requestAnimationFrame: (fn) => {
    frames.push(fn);
    return frames.length;
  },
  cancelAnimationFrame: () => { frames.length = 0; },
  retarget: () => scrollCalls.push(scrollBox.autoScrolling ? "scrolling" : "held"),
};
Object.defineProperty(scrollBox, "innerHeight", { get: () => page.viewport });
Object.defineProperty(scrollBox, "scrollY", { get: () => page.y });

const { startAutoScroll, stopAutoScroll } = sliceVm(
  ["GESTURE", "clamp", "ramp", "startAutoScroll", "stopAutoScroll"], scrollBox,
);

const start = () => {
  scrollCalls.length = 0;
  startAutoScroll();
};
const run = (pointer, times) => {
  scrollBox.pointerY = pointer;
  for (let i = 0; i < times; i += 1) {
    const step = frames.shift();
    if (step) {
      step();
    }
  }
  return scrollCalls.join(",");
};
const scrolling = () => scrollBox.autoScrolling;

test("auto-scroll retargets while it moves and once more when it runs out of page", () => {
  page.y = 994;
  start();
  assert.equal(run(page.viewport - 12, 3), "scrolling,held", "the hold arms on the frame the scroll stops");
  assert.equal(scrolling(), false);
  stopAutoScroll();
  assert.equal(scrolling(), false, "stopping clears the flag");
});

test("auto-scroll leaves the aim alone off the edges", () => {
  page.y = 400;
  start();
  assert.equal(run(500, 3), "");
  assert.equal(page.y, 400, "no scroll, no retarget: the pointermove frames own the aim");
});

/* ---------- the drop at the end of a drag ---------- */

const dropCalls = [];
const held = [];
let cancelled = 0;
const dropBox = {
  drag: null,
  // The marker placed by the last frame and the one the current clone position asks for.
  placed: { id: "old", remove() {} },
  live: { id: "new", remove() {} },
  retarget: () => {
    dropCalls.push("retarget");
    dropBox.drag.gap = dropBox.live;
  },
  siblingId: (gap) => {
    dropCalls.push(gap.id);
    return gap.id;
  },
  // The card that was held as a collapsed drop target; endDrag has to take its hold bar off.
  rowById: (kind, id) => (id ? { classList: { remove: (name) => held.push(name) } } : null),
  cancelAnimationFrame: () => { cancelled += 1; },
  clearTimeout: () => {},
  stopAutoScroll: () => {},
  render: () => {},
  document: { documentElement: { classList: { remove() {} } } },
};

const { endDrag } = sliceVm(["endDrag"], dropBox);

const drop = (pending, collapsedId) => {
  dropBox.drag = {
    kind: "item", ids: ["a"], gap: dropBox.placed, clone: { remove() {} }, hoverTimer: 0,
    container: null, collapsedId, raf: pending ? 7 : 0,
  };
  dropCalls.length = 0;
  held.length = 0;
  const before = cancelled;
  endDrag(false);
  return { calls: dropCalls.join(","), cancelled: cancelled - before, held: held.join(",") };
};

test("a drop with a frame still pending retargets first", () => {
  const dropped = drop(true);
  assert.equal(dropped.calls, "retarget,new,new", "the drop uses the pending position");
  assert.equal(dropped.cancelled, 1, "the planned frame is not run after the drop");
});

test("a drop without a pending frame keeps the placed marker", () => {
  assert.equal(drop(false).calls, "old,old");
});

test("dropping onto a collapsed list takes its hold bar off", () => {
  assert.equal(drop(false, "C").held, "is-drop-hover");
  assert.equal(drop(false, null).held, "", "no target, no card to clean");
});
