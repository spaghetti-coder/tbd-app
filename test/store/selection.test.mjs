// Bulk mode selection: pick answers, leaving rows, move rule.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list, plain } from "../../testkit/fixtures.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { api, order, store } = stateHarness(["createSelection"]);

let state = null;
let flushes = 0;

// Fresh rows per test: patch mutates the array in place.
const board = (ui) => {
  state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("c", "c1"), item("p", "c2")],
    { pageSize: "all", page: 1, ...ui });
  flushes = 0;
  return api.createSelection({
    getState: () => state,
    order,
    editor: { flush: () => { flushes += 1; } },
  });
};

/* --- membership --- */

test("nothing picked is no Bulk mode", () => {
  const sel = board();
  assert.equal(sel.current(), null);
  assert.equal(sel.mark("item", "a"), null, "no kind yet");
});

test("picks answer as one set, in the order they were made", () => {
  const sel = board();
  assert.equal(sel.pick("item", "b"), "all", "the first pick hits every row");
  assert.equal(sel.pick("item", "a"), "row", "inside a set: this row + panel");
  assert.deepEqual(plain(sel.current()), { kind: "item", ids: ["b", "a"] }, "the group keeps the pick order");
  assert.equal(sel.mark("item", "a"), true);
  assert.equal(sel.mark("item", "b"), true);
  assert.equal(sel.mark("item", "p"), false);
  assert.equal(sel.mark("list", "c1"), null, "other kind: own control");
});

test("the last pick out ends it", () => {
  const sel = board();
  sel.pick("item", "a");
  assert.equal(sel.pick("item", "a"), "all", "own controls back");
  assert.equal(sel.current(), null);
});

test("another kind replaces the set", () => {
  const sel = board();
  sel.pick("item", "a");
  assert.equal(sel.pick("list", "c1"), "all");
  assert.deepEqual(plain(sel.current()), { kind: "list", ids: ["c1"] });
  assert.equal(sel.mark("item", "a"), null);
});

test("an end clears it", () => {
  const sel = board();
  sel.pick("item", "a");
  sel.pick("item", "p");
  sel.end();
  assert.equal(sel.current(), null);
  assert.equal(sel.mark("item", "a"), null);
});

/* --- rows that leave --- */

test("a pick archived anywhere is out of the set, the rest stays", () => {
  const sel = board();
  sel.pick("item", "a");
  sel.pick("item", "p");
  api.patch("item", "p", { archived: true, archivedBy: "user" });
  assert.deepEqual(plain(sel.current()), { kind: "item", ids: ["a"] });
});

test("a pick deleted with its checklist is out of the set", () => {
  const sel = board();
  sel.pick("item", "a");
  sel.pick("item", "p");
  state.checklists = state.checklists.filter((row) => row.id !== "c1");
  state.items = state.items.filter((row) => row.checklistId !== "c1");
  assert.deepEqual(plain(sel.current()), { kind: "item", ids: ["p"] });
});

test("a checklist archived while picked stops counting", () => {
  const sel = board();
  sel.pick("list", "c1");
  sel.pick("list", "c2");
  api.patch("list", "c2", { archived: true });
  assert.deepEqual(plain(sel.current()), { kind: "list", ids: ["c1"] });
});

test("the last live pick gone ends it, the rows keep their own controls", () => {
  const sel = board();
  sel.pick("item", "a");
  sel.pick("item", "p");
  api.patch("item", "a", { archived: true, archivedBy: "user" });
  api.patch("item", "p", { archived: true, archivedBy: "user" });
  assert.equal(sel.current(), null);
  assert.equal(sel.mark("item", "b"), null, "own control kept");
  assert.equal(sel.pick("item", "b"), "all", "a later pick starts a fresh set");
});

/* --- starting from the menu --- */

test("a start takes the row alone and closes what was being typed", () => {
  const sel = board({
    panel: { side: "right", topPct: 0.5, collapsed: true },
    editing: { kind: "item", id: "a" },
  });
  sel.pick("item", "p");
  sel.start("list", "c1");
  assert.equal(flushes, 1, "editor flushed first");
  assert.deepEqual(plain(sel.current()), { kind: "list", ids: ["c1"] }, "not added to the set");
  assert.equal(state.ui.editing, null);
  assert.equal(state.ui.panel.collapsed, false, "else the buttons are hidden");
});

test("a pick of another kind expands a collapsed panel", () => {
  const sel = board({ panel: { side: "right", topPct: 0.5, collapsed: true } });
  sel.pick("item", "a");
  assert.equal(state.ui.panel.collapsed, false);
  sel.pick("item", "b");
  state.ui.panel.collapsed = true;
  sel.pick("item", "c");
  assert.equal(state.ui.panel.collapsed, true, "same kind: no expand");
});

/* --- move rule --- */

test("a move is offered while the set has somewhere to go", () => {
  const sel = board();
  assert.equal(sel.canMove("list", ["c2"], "top"), true);
  assert.equal(sel.canMove("list", ["c1"], "bottom"), true);
  assert.equal(sel.canMove("list", ["c1"], "top"), false, "already at the top");
  assert.equal(sel.canMove("list", ["c2"], "bottom"), false, "already at the bottom");
  assert.equal(sel.canMove("list", ["c1", "c2"], "top"), false, "both, already in order");
  assert.equal(sel.canMove("list", [], "top"), false, "nothing to move");
});

test("items from two checklists have no top or bottom of their own", () => {
  const sel = board();
  assert.equal(sel.canMove("item", ["b", "c"], "top"), true, "one checklist, off the edge");
  assert.equal(sel.canMove("item", ["a"], "top"), false, "one row, already at the top");
  assert.equal(sel.canMove("item", ["a", "b"], "top"), false, "the two at the top, in order");
  assert.equal(sel.canMove("item", ["a", "p"], "top"), false, "two lists: no single top");
  assert.equal(sel.canMove("item", ["c", "p"], "bottom"), false);
});

test("an id that stopped counting is not a second checklist", () => {
  const sel = board();
  assert.equal(sel.canMove("item", ["b", "gone"], "top"), true);
});
