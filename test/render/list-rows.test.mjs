// A list render repaints the rows that stayed instead of swapping their nodes: a row rebuilt
// under the finger loses the swipe.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

const state = { items: [] };
let painted = [];
let built = [];

const { paintChecklist } = vm(
  [slice("reconcile"), slice("paintChecklist"), "({ paintChecklist })"],
  {
    state,
    t: (key) => key,
    isMuted: () => false,
    paintHead: () => {},
    withoutArchived: (items, checklistId) => items.filter((i) => i.checklistId === checklistId && !i.archived),
    paintItem: (node, item) => painted.push(item.id),
    buildItem: (item) => {
      built.push(item.id);
      return fakeNode({ classes: ["item"], id: item.id });
    },
  },
);

const row = (id) => fakeNode({ classes: ["item"], id });
const item = (id) => ({ id, checklistId: "L1" });

function board(rows) {
  painted = [];
  built = [];
  const host = fakeNode({ classes: ["items"], children: rows });
  const card = fakeNode({ classes: ["card"], kind: "list", id: "L1", children: [
    fakeNode({ classes: ["card__body"], children: [fakeNode({ classes: ["card__empty"] }), host] }),
  ] });
  return { card, host };
}

const ids = (host) => host.children.map((node) => node.dataset.id).join(",");

test("rows that stay keep their own nodes and get repainted", () => {
  const [a, b, c] = [row("i1"), row("i2"), row("i3")];
  const { card, host } = board([a, b, c]);
  state.items = [item("i1"), item("i3")];
  paintChecklist(card, { id: "L1", expanded: true });
  assert.equal(ids(host), "i1,i3");
  assert.equal(host.children[0], a);
  assert.equal(host.children[1], c);
  assert.deepEqual(built, [], "nothing was rebuilt");
  assert.deepEqual(painted, ["i1", "i3"]);
});

test("a row that joins the list is built, the others are left alone", () => {
  const [a, b] = [row("i1"), row("i2")];
  const { card, host } = board([a, b]);
  state.items = [item("i1"), item("i2"), item("i3")];
  paintChecklist(card, { id: "L1", expanded: true });
  assert.equal(ids(host), "i1,i2,i3");
  assert.deepEqual(built, ["i3"]);
  assert.deepEqual(painted, ["i1", "i2"]);
});

test("reordering keeps the nodes of both rows", () => {
  const [a, b] = [row("i1"), row("i2")];
  const { card, host } = board([a, b]);
  state.items = [item("i2"), item("i1")];
  paintChecklist(card, { id: "L1", expanded: true });
  assert.equal(ids(host), "i2,i1");
  assert.equal(host.children[0], b);
  assert.deepEqual(built, []);
});

test("a closed list renders no rows", () => {
  const [a] = [row("i1")];
  const { card, host } = board([a]);
  state.items = [item("i1")];
  paintChecklist(card, { id: "L1", expanded: false });
  assert.equal(ids(host), "i1", "the rows wait for the list to open again");
  assert.deepEqual(painted, []);
});
