// Where a dragged group aims, what a hold on a closed list does, and where the drop lands.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";
import { plain } from "../../testkit/fixtures.mjs";

const rect = (top, bottom, left = 0) => ({ top, bottom, left, height: bottom - top });
const headRect = rect(60, 100);
const item = (id, top) => fakeNode({
  classes: ["item"], id, kind: "item", rect: rect(top, top + 40, 120), height: 40,
});
const items = [item("i1", 100), item("i2", 140), item("i3", 180)];
const bodyA = fakeNode({ classes: ["items"], children: [...items] });
const headA = fakeNode({ classes: ["card__head"], rect: headRect });
const cardA = fakeNode({ classes: ["card", "is-open"], id: "A", kind: "list", rect: rect(60, 220), children: [headA, bodyA] });
const headC = fakeNode({ classes: ["card__head"], rect: rect(300, 340) });
const cardC = fakeNode({ classes: ["card"], id: "C", kind: "list", rect: rect(300, 340), children: [headC] });
const lists = fakeNode({ classes: ["lists"], children: [cardA, cardC] });

const timers = { armed: [], cleared: 0 };
const frames = [];
const calls = [];

const box = {
  setTimeout: (fn, ms) => {
    timers.armed.push([fn, ms]);
    return timers.armed.length;
  },
  clearTimeout: () => { timers.cleared += 1; },
  requestAnimationFrame: (fn) => {
    frames.push(fn);
    return frames.length;
  },
  cancelAnimationFrame: () => { frames.length = 0; },
  el: (tag, className) => fakeNode({ classes: [className], height: 40 }),
  navigator: {},
  getComputedStyle: () => ({ rowGap: "0" }),
  byId: () => lists,
  rowById: (kind, id) => (kind === "list"
    ? { A: cardA, C: cardC }[id] ?? null
    : items.find((node) => node.dataset.id === id) ?? null),
  document: {
    body: { append() {} },
    documentElement: { classList: { add() {}, remove() {} } },
    getSelection: () => null,
    querySelectorAll: (sel) => {
      if (sel.includes(":not(.is-open)")) return [headC];
      if (sel.includes(".is-open .items")) return [bodyA];
      if (sel.includes(".card")) return [cardA, cardC];
      return [];
    },
  },
  store: { markDirty: (kind, id) => calls.push(`mark:${kind}:${id}`), flushSave: () => calls.push("flush") },
  order: { place: (kind, ids, where) => calls.push(`place:${kind}:${ids.join(",")}:${JSON.stringify(where)}`) },
  findList: (id) => ({ A: { expanded: true }, C: { expanded: false } }[id] ?? null),
  commit: (kind, id) => calls.push(`commit:${kind ?? ""}:${id ?? ""}`),
  render: () => calls.push("render"),
  search: { active: false },
  autoScroll: {
    at() {}, start() {}, stop() {}, moved: () => box.scrolling === true,
  },
  getState: () => ({
    ui: { bulk: { kind: null, ids: [] } },
    checklists: [{ id: "A" }],
    items: [{ id: "i1", checklistId: "A" }],
  }),
};

const { createRowDrag, collapsedHeadAt, armHover, dropPlan } = sliceVm(
  ["GESTURE", "clamp", "visibleRows", "indexAt", "targetContainer", "collapsedHeadAt", "siblingId",
    "dragCopy", "dragBag", "gapPad", "dropPlan", "dropItemsInto", "clearHold", "armHover", "createRowDrag"], box,
);

const rowDrag = createRowDrag(box);

// A press on the first item: the ghost's top rides the press point, so the aim sits 20px under it.
// Each press starts from a clean host: a previous drag leaves markers and `is-drag-src` on the rows.
const press = () => {
  calls.length = 0;
  timers.armed.length = 0;
  frames.length = 0;
  box.scrolling = false;
  cardC.classes.delete("is-drop-hover");
  for (const node of items) {
    node.remove();
    node.classes.delete("is-drag-src");

  }
  bodyA.append(...items);
  return { kind: "item", id: "i1", handle: items[0], x0: 120, y0: 100 };
};
const frame = () => frames.splice(0, frames.length).forEach((fn) => fn());
const armed = () => timers.armed.map(([, ms]) => ms);

test("the aim lands on the closed head it is over, and holds within the pad of its own target", () => {
  const rows = [
    [null, 320, "C"],
    [null, 80, null, "an open head is no hold target"],
    [null, 200, null, "the strip between two lists is no target"],
    [null, 290, null, "10px above C is still nothing"],
    [null, 348, null, "and 8px below it, once nothing is held"],
    ["C", 292, "C", "8px above the top edge"],
    ["C", 348, "C", "8px below the bottom edge"],
    ["C", 288, "C", "right on the pad"],
    ["C", 112, null, "a neighbour list gets no pad"],
    ["C", 270, null, "further than the pad releases the target"],
  ];
  for (const [held, y, want, note] of rows) {
    assert.equal(collapsedHeadAt(y, held), want ? headC : null, `${note ?? `${y} held by ${held}`}`);
  }
});

test("a hold arms on the aimed head, once, and comes off with it", () => {
  const drag = { gap: fakeNode({ classes: ["drop-gap"] }), hoverId: null, hoverTimer: 0, collapsedId: null };
  armHover(drag, headC, () => calls.push("open"));
  assert.equal(cardC.classes.has("is-drop-hover"), true);
  assert.equal(drag.gap.classes.has("is-standby"), true);
  assert.deepEqual(armed(), [600]);
  armHover(drag, headC, () => calls.push("open"));
  assert.deepEqual(armed(), [600], "staying on the same target does not restart the hold");
  armHover(drag, null, () => calls.push("open"));
  assert.equal(cardC.classes.has("is-drop-hover"), false);
  assert.equal(drag.gap.classes.has("is-standby"), false);
  assert.equal(drag.collapsedId, null);
});

test("a drag aims where the ghost is, and drops there", () => {
  box.scrolling = false;
  assert.equal(rowDrag.start(press()), true);
  // 190 sits past the middle of i2 and short of i3's.
  rowDrag.update(120, 170);
  frame();
  calls.length = 0;
  rowDrag.release();
  assert.ok(calls.includes('place:item:i1:{"into":"A","before":"i3"}'), calls.join(","));
  assert.deepEqual(calls, ["mark:item:i1", 'place:item:i1:{"into":"A","before":"i3"}', "mark:list:A", "commit::", "flush"]);
  assert.equal(rowDrag.active(), false);
});

test("a drop with a frame still pending lands where the last move pointed", () => {
  rowDrag.start(press());
  rowDrag.update(120, 170);
  calls.length = 0;
  rowDrag.release();
  assert.ok(calls.includes('place:item:i1:{"into":"A","before":"i3"}'),
    `the planned frame was dropped instead of run: ${calls.join(",")}`);
});

test("a running page does not arm the hold, a standing one does", () => {
  rowDrag.start(press());
  calls.length = 0;
  timers.armed.length = 0;
  box.scrolling = true;
  rowDrag.update(120, 300);
  frame();
  assert.deepEqual(armed(), [], "no hold while the page runs");
  assert.equal(cardC.classes.has("is-drop-hover"), false);
  box.scrolling = false;
  rowDrag.scrollFrame();
  assert.deepEqual(armed(), [600]);
  assert.equal(cardC.classes.has("is-drop-hover"), true);
  box.scrolling = false;
  rowDrag.cancel();
});

test("dropping onto a closed list opens it for the item and takes the hold bar off", () => {
  rowDrag.start(press());
  timers.armed.length = 0;
  rowDrag.update(120, 300);
  frame();
  calls.length = 0;
  rowDrag.release();
  assert.ok(calls.includes('place:item:i1:{"into":"C","before":null}'), calls.join(","));
  assert.equal(cardC.classes.has("is-drop-hover"), false, "the progress bar leaves the target head");
});

test("a rebuilt list parks the marker and the styling back under the drag", () => {
  rowDrag.start(press());
  rowDrag.update(120, 170);
  frame();
  const gap = bodyA.children.find((node) => node.classes.has("drop-gap"));
  assert.ok(gap, "the marker sits in the list");
  // A render keeps data rows only, so the marker goes with everything else it does not know.
  gap.remove();
  for (const node of items) {
    node.classes.delete("is-drag-src");
  }
  rowDrag.afterRender();
  assert.equal(gap.parentElement, bodyA, "the marker is parked back");
  assert.equal(items[0].classes.has("is-drag-src"), true, "the held row is marked again");
  calls.length = 0;
  rowDrag.release();
  assert.ok(calls.includes('place:item:i1:{"into":"A","before":"i3"}'), calls.join(","));
});

test("the plan reads the drop off the marker and the card", () => {
  assert.deepEqual(plain(dropPlan("list", null, null, "l3", "l1")), { before: "l3", after: "l1" });
  assert.deepEqual(plain(dropPlan("item", "C", "A", "i3", "i2")), { into: "C", before: null });
  assert.deepEqual(plain(dropPlan("item", null, "A", "i3", "i2")), { into: "A", before: "i3" });
  assert.equal(dropPlan("item", null, null, "i3", "i2"), null, "nowhere to put it");
});
