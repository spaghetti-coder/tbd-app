// A list render repaints rows that stayed instead of swapping nodes: a row rebuilt under the
// finger loses the swipe.

import assert from "node:assert/strict";
import test from "node:test";
import { idsOf, paintHarness, rowNode } from "../../testkit/render.mjs";

const item = (id) => ({ id, checklistId: "L1" });
const OPEN = { id: "L1", expanded: true };

test("rows that stay keep their own nodes and get repainted", () => {
  const [a, b, c] = [rowNode("i1"), rowNode("i2"), rowNode("i3")];
  const { state, card, host, painted, built, paintChecklist } = paintHarness([a, b, c]);
  state.items = [item("i1"), item("i3")];
  paintChecklist(card, OPEN);
  assert.equal(idsOf(host), "i1,i3");
  assert.equal(host.children[0], a);
  assert.equal(host.children[1], c);
  assert.deepEqual(built, [], "nothing was rebuilt");
  assert.deepEqual(painted, ["i1", "i3"]);
});

test("a row that joins the list is built, the others are left alone", () => {
  const [a, b] = [rowNode("i1"), rowNode("i2")];
  const { state, card, host, painted, built, paintChecklist } = paintHarness([a, b]);
  state.items = [item("i1"), item("i2"), item("i3")];
  paintChecklist(card, OPEN);
  assert.equal(idsOf(host), "i1,i2,i3");
  assert.deepEqual(built, ["i3"]);
  assert.deepEqual(painted, ["i1", "i2"]);
});

test("a closed list renders no rows", () => {
  const { state, card, host, painted, paintChecklist } = paintHarness([rowNode("i1")]);
  state.items = [item("i1")];
  paintChecklist(card, { id: "L1", expanded: false });
  assert.equal(idsOf(host), "i1", "rows wait for the list to reopen");
  assert.deepEqual(painted, []);
});
