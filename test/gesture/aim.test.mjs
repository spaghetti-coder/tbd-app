// The aiming rules, the screen answered by data.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";

const rect = (top, bottom) => ({ top, bottom, height: bottom - top });
const node = (id) => ({ dataset: { id } });
const measurable = (id, top, bottom) => ({
  ...node(id), getBoundingClientRect: () => rect(top, bottom),
});

const { liveRows, indexAt, headAt, containerAt, aim } = sliceVm(
  ["GESTURE", "liveRows", "indexAt", "headAt", "containerAt", "aim"],
);

const headA = node("headA");
const headC = node("headC");
const bodyA = node("bodyA");
const bodyC = node("bodyC");
const root = node("root");
const items = [measurable("i1", 100, 140), measurable("i2", 140, 180), measurable("i3", 180, 220)];

const HEADS = [
  { node: headA, id: "A", open: true, rect: rect(60, 100) },
  { node: headC, id: "C", open: false, rect: rect(300, 340) },
];
const CARDS = [
  { node: node("cardA"), id: "A", open: true, rect: rect(60, 220) },
  { node: node("cardC"), id: "C", open: false, rect: rect(300, 340) },
];
const BODIES = { A: { node: bodyA, rect: rect(100, 220) }, C: { node: bodyC, rect: rect(340, 500) } };

const screenOver = ({ moved = false, heads = HEADS, cards = CARDS, bodies = BODIES } = {}) => ({
  moved: () => moved,
  root: () => root,
  heads: () => heads,
  cards: () => cards,
  body: (card) => bodies[card.id],
  rows: (container) => (container === bodyA ? items : []),
});

const dragOver = (over) => ({
  kind: "item", ids: ["i1"], gap: node("gap"), y: 0, dy: 0, cardHalf: 0,
  hoverId: null, index: 0, container: null, ...over,
});

test("a point counts the rows whose middle it has passed", () => {
  for (const [y, want] of [[119, 0], [120, 1], [159, 1], [160, 2], [199, 2], [200, 3]]) {
    assert.equal(indexAt(items, y), want, `${y} is past ${want} of them`);
  }
});

test("the marker and the dragged rows are not in the way of counting", () => {
  const gap = node("gap");
  const rows = [items[0], gap, items[1], items[2]];
  const dragged = (ids) => liveRows(rows, { gap, ids });
  assert.deepEqual(dragged(["i1"]).map((n) => n.dataset.id), ["i2", "i3"]);
  assert.deepEqual(dragged(["i1", "i3"]).map((n) => n.dataset.id), ["i2"]);
  assert.deepEqual(dragged([]).map((n) => n.dataset.id), ["i1", "i2", "i3"], "a group not yet moving");
});

test("the card a hold owns keeps the pad, a neighbour must be hit dead on", () => {
  const rows = [
    [null, 320, headC, "a neighbour head is hit inside"],
    [null, 80, null, "an open head is no hold target"],
    [null, 200, null, "the strip between two lists is no target"],
    [null, 290, null, "10px above C is still nothing"],
    [null, 348, null, "and 8px below it, once nothing is held"],
    ["C", 292, headC, "8px above the top edge"],
    ["C", 348, headC, "and 8px below it"],
    ["C", 288, headC, "right on the pad"],
    ["C", 112, null, "a neighbour list gets no pad"],
    ["C", 270, null, "further than the pad releases the target"],
  ];
  for (const [held, y, want, note] of rows) {
    assert.equal(headAt(y, held, HEADS), want, note);
  }
});

test("an open card hands over its body, a closed one hands over nothing", () => {
  const screen = screenOver();
  assert.equal(containerAt(150, screen), bodyA);
  assert.equal(containerAt(320, screen), null, "a closed card has no body to take the row");
});

test("off every card the nearest open body takes the drop", () => {
  const open = [CARDS[0], { ...CARDS[1], open: true }];
  assert.equal(containerAt(260, screenOver({ cards: open })), bodyA, "100px from A, 160 from C");
  assert.equal(containerAt(295, screenOver({ cards: open })), bodyC, "135 from A, 125 from C");
});

test("a drag of lists aims at the list host", () => {
  const target = aim(dragOver({ kind: "list", index: 7 }), screenOver());
  assert.equal(target.container, root);
  assert.equal(target.hover, null, "a list is never held over a head");
});

test("a drag of items aims at the body and the row the ghost is over", () => {
  const target = aim(dragOver({ y: 170, ids: [] }), screenOver());
  assert.equal(target.container, bodyA);
  assert.equal(target.index, 2, "past i1 and i2, short of i3");
});

test("the aim rides the held card's middle, not the middle of a carried group", () => {
  const target = aim(dragOver({ y: 190, dy: 20, cardHalf: 20, ids: [] }), screenOver());
  assert.equal(target.index, 2, "the finger point, as a lone row aims");
});

test("a held head freezes the index, a running page leaves the hold alone", () => {
  const held = aim(dragOver({ y: 320, hoverId: "C", index: 5 }), screenOver());
  assert.equal(held.hover, headC);
  assert.equal(held.index, 5, "moving down a list being held open must not shuffle the marker");

  const running = aim(dragOver({ y: 320, index: 5 }), screenOver({ moved: true }));
  assert.equal(running.hover, null, "a page running under the finger arms nothing");
});

test("with every card shut the aim comes back empty and the index stays put", () => {
  const shut = CARDS.map((card) => ({ ...card, open: false }));
  const none = aim(dragOver({ y: 260, index: 3 }), screenOver({ cards: shut }));
  assert.equal(none.container, null);
  assert.equal(none.index, 3, "nothing to move the marker to");
});
