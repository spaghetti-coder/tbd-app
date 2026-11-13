// What a held row does: ghost, marker, the hold that opens a closed list, the drop.
// The aiming rules themselves are in test/gesture/aim.test.mjs.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";
import { plain } from "../../testkit/fixtures.mjs";

const rect = (top, bottom, left = 0) => ({ top, bottom, left, height: bottom - top });
const item = (id, top) => fakeNode({
  classes: ["item"], id, kind: "item", rect: rect(top, top + 40, 120), height: 40,
});
const items = [item("i1", 100), item("i2", 140), item("i3", 180)];
const bodyA = fakeNode({ classes: ["items"], rect: rect(100, 220), children: [...items] });
const headA = fakeNode({ classes: ["card__head"], rect: rect(60, 100) });
const cardA = fakeNode({
  classes: ["card", "is-open"], id: "A", kind: "list", rect: rect(60, 220),
  children: [headA, fakeNode({ classes: ["card__body"], children: [bodyA] })],
});
const headC = fakeNode({ classes: ["card__head"], rect: rect(300, 340) });
const wrapC = fakeNode({ classes: ["card__body"], children: [] });
const cardC = fakeNode({ classes: ["card"], id: "C", kind: "list", rect: rect(300, 340), children: [headC, wrapC] });
const lists = fakeNode({ classes: ["lists"], children: [cardA, cardC] });
const heldItem = fakeNode({ classes: ["item"], id: "i9", kind: "item", rect: rect(340, 380), height: 40 });
const bodyC = fakeNode({ classes: ["items"], rect: rect(340, 500), children: [heldItem] });

const timers = { armed: [], cleared: 0 };
const frames = [];
const calls = [];
const clones = [];
const held = { A: { expanded: true }, C: { expanded: false } };

// Renders state, as the app does after a commit.
const sync = () => {
  cardC.classList.toggle("is-open", held.C.expanded);
  if (held.C.expanded) {
    if (bodyC.parentElement !== wrapC) wrapC.append(bodyC);
  } else {
    bodyC.remove();
  }
};

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
  el: (tag, className) => {
    const node = fakeNode({ classes: [className], height: 40 });
    if (className === "drag-clone") clones.push(node);
    return node;
  },
  navigator: { vibrate: () => {} },
  getComputedStyle: () => ({ rowGap: box.rowGap ?? "0" }),
  byId: () => lists,
  rowById: (kind, id) => (kind === "list"
    ? { A: cardA, C: cardC }[id] ?? null
    : items.find((node) => node.dataset.id === id) ?? heldItem),
  document: {
    body: { append() {} },
    documentElement: { classList: { add() {}, remove() {} } },
    getSelection: () => null,
  },
  store: { markDirty: (kind, id) => calls.push(`mark:${kind}:${id}`), flushSave: () => calls.push("flush") },
  order: { place: (kind, ids, where) => calls.push(`place:${kind}:${ids.join(",")}:${JSON.stringify(where)}`) },
  findList: (id) => held[id] ?? null,
  commit: (kind, id) => { calls.push(`commit:${kind ?? ""}:${id ?? ""}`); sync(); },
  render: () => { calls.push("render"); sync(); },
  search: { active: false },
  autoScroll: { at() {}, start() {}, stop() {}, moved: () => box.scrolling === true },
  screen: () => ({
    moved: () => box.scrolling === true,
    root: () => lists,
    heads: () => [...lists.children].map((card) => {
      const head = card.querySelector(":scope > .card__head");
      return { node: head, id: card.dataset.id, open: card.classes.has("is-open"), rect: head.getBoundingClientRect() };
    }),
    cards: () => [...lists.children].map((card) => ({
      node: card, id: card.dataset.id, open: card.classes.has("is-open"), rect: card.getBoundingClientRect(),
    })),
    body: (card) => {
      const node = card.node.querySelector(".items");
      return { node, rect: node.getBoundingClientRect() };
    },
    rows: (container) => [...container.children],
  }),
  getState: () => ({
    ui: { bulk: box.bulk ?? { kind: null, ids: [] } },
    checklists: [{ id: "A" }, { id: "C" }],
    items: [{ id: "i1", checklistId: "A" }, { id: "i2", checklistId: "A" }, { id: "i3", checklistId: "A" }],
  }),
};

const { createRowDrag, armHover, gapPad, dropPlan } = sliceVm(
  ["GESTURE", "clamp", "liveRows", "indexAt", "headAt", "containerAt", "aim", "dragCopy", "dragBag", "gapPad",
    "dropPlan", "dropItemsInto", "siblingId", "clearHold", "armHover", "createRowDrag"], box,
);

const rowDrag = createRowDrag(box);

// A finished drag leaves markers and `is-drag-src` behind: start every test clean.
const reset = () => {
  calls.length = 0;
  timers.armed.length = 0;
  frames.length = 0;
  clones.length = 0;
  box.scrolling = false;
  box.bulk = null;
  box.rowGap = "0";
  held.C.expanded = false;
  sync();
  cardC.classes.delete("is-drop-hover");
  for (const node of items) {
    node.remove();
    node.classes.delete("is-drag-src");
  }
  bodyA.append(...items);
};
// A ghost's top rides the press point: the aim sits 20px under the finger.
const hitItem = () => ({ kind: "item", id: "i1", handle: items[0], x0: 120, y0: 100 });
const hitList = () => ({ kind: "list", id: "C", handle: headC, x0: 0, y0: 300 });

const frame = () => frames.splice(0, frames.length).forEach((fn) => fn());
const armed = () => timers.armed.map(([, ms]) => ms);
const marker = () => [...lists.querySelectorAll(".drop-gap")].find((node) => node.parentElement) ?? null;

test("the ghost carries a picked group in the order the app holds it, not in tap order", () => {
  reset();
  box.bulk = { kind: "item", ids: ["i3", "i1"] };
  assert.equal(rowDrag.start(hitItem()), true);
  assert.deepEqual(clones[0].children.map((node) => node.dataset.id), ["i1", "i3"]);
  rowDrag.cancel();
});

test("a drag aims where the ghost is, and drops there", () => {
  reset();
  assert.equal(rowDrag.start(hitItem()), true);
  // 190 sits past the middle of i2 and short of i3's.
  rowDrag.update(120, 170);
  frame();
  calls.length = 0;
  rowDrag.release();
  assert.deepEqual(calls, ["mark:item:i1", 'place:item:i1:{"into":"A","before":"i3"}', "mark:list:A", "commit::", "flush"]);
  assert.equal(rowDrag.active(), false);
});

test("a drop with a frame still pending lands where the last move pointed", () => {
  reset();
  rowDrag.start(hitItem());
  rowDrag.update(120, 170);
  calls.length = 0;
  rowDrag.release();
  assert.ok(calls.includes('place:item:i1:{"into":"A","before":"i3"}'),
    `the planned frame was dropped instead of run: ${calls.join(",")}`);
});

test("a running page does not arm the hold, a standing one does", () => {
  reset();
  rowDrag.start(hitItem());
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

test("a hold arms on the aimed head, once, and comes off with it", () => {
  reset();
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

test("dropping onto a closed list opens it for the item and takes the hold bar off", () => {
  reset();
  rowDrag.start(hitItem());
  timers.armed.length = 0;
  rowDrag.update(120, 300);
  frame();
  calls.length = 0;
  rowDrag.release();
  assert.ok(calls.includes('place:item:i1:{"into":"C","before":null}'), calls.join(","));
  assert.equal(cardC.classes.has("is-drop-hover"), false, "the progress bar leaves the target head");
});

test("a hold that fills opens the list and the marker follows it into the body", () => {
  reset();
  rowDrag.start(hitItem());
  rowDrag.update(120, 300);
  frame();
  assert.deepEqual(armed(), [600]);
  calls.length = 0;
  timers.armed.shift()[0]();
  assert.equal(held.C.expanded, true, "the aimed list opens");
  assert.equal(marker().parentElement, bodyC, "the marker moves in with it");
  rowDrag.release();
  assert.ok(calls.includes('place:item:i1:{"into":"C","before":"i9"}'),
    `the item lands where the marker got to inside the opened list: ${calls.join(",")}`);
});

test("a rebuilt list parks the marker and the styling back under the drag", () => {
  reset();
  rowDrag.start(hitItem());
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

test("a dragged list lands among the lists", () => {
  reset();
  assert.equal(rowDrag.start(hitList()), true);
  rowDrag.update(0, 80);
  frame();
  calls.length = 0;
  rowDrag.release();
  assert.deepEqual(calls, ["place:list:C:{\"before\":\"A\",\"after\":null}", "commit::", "flush"]);
});

test("the marker is as tall as the ghost plus the pads between the carried rows", () => {
  box.rowGap = "8";
  assert.equal(gapPad([]), 0);
  assert.equal(gapPad([items[0]]), 0);
  assert.equal(gapPad([items[0], items[1], items[2]]), 16);
});

test("the plan reads the drop off the marker and the card", () => {
  assert.deepEqual(plain(dropPlan("list", null, null, "l3", "l1")), { before: "l3", after: "l1" });
  assert.deepEqual(plain(dropPlan("item", "C", "A", "i3", "i2")), { into: "C", before: null });
  assert.deepEqual(plain(dropPlan("item", null, "A", "i3", "i2")), { into: "A", before: "i3" });
  assert.equal(dropPlan("item", null, null, "i3", "i2"), null, "nowhere to put it");
});
