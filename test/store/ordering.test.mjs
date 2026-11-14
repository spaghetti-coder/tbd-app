// Placement: where a group lands, which rows hold an edge, which page shows a list.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list } from "../../testkit/fixtures.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { order, store } = stateHarness([]);

test("a group of lists goes to either edge and keeps its order through it", () => {
  const state = store([list("1"), list("2"), list("3"), list("4"), list("5"), list("6"), list("7")], []);
  order.place("list", ["3", "7"], "top");
  assert.deepEqual(ids(state.checklists), ["3", "7", "1", "2", "4", "5", "6"]);
  order.place("list", ["3", "7"], "bottom");
  assert.deepEqual(ids(state.checklists), ["1", "2", "4", "5", "6", "3", "7"]);
});

test("a list moving to an edge is followed onto the page it lands on", () => {
  const state = store([list("a"), list("b"), list("c")], [], { pageSize: 2, page: 1 });
  order.place("list", ["c"], "bottom");
  assert.equal(state.ui.page, 2, "the last list is on the last page");
  order.place("list", ["c"], "top");
  assert.equal(state.ui.page, 1);
});

test("a neighbour target lands where the gap was", () => {
  const state = store([list("a"), list("b"), list("c")], []);
  order.place("list", ["a"], { before: "c" });
  assert.deepEqual(ids(state.checklists), ["b", "a", "c"]);
  order.place("list", ["a"], { after: "c" });
  assert.deepEqual(ids(state.checklists), ["b", "c", "a"]);
});

test("a neighbour that vanished falls back to the row behind the gap, and past both to the end", () => {
  const state = store([list("a"), list("b"), list("c")], []);
  order.place("list", ["a"], { before: "gone", after: "c" });
  assert.deepEqual(ids(state.checklists), ["b", "c", "a"]);
  order.place("list", ["a"], { before: "gone", after: "gone too" });
  assert.deepEqual(ids(state.checklists), ["b", "c", "a"], "already last: nowhere to go");
});

test("an item's edges are its own list's, archived rows aside", () => {
  const state = store([list("c1"), list("c2")],
    [item("p", "c1"), item("q", "c1"), item("hidden", "c1", { archived: true }), item("k", "c2")]);
  order.place("item", ["q"], "top");
  assert.deepEqual(ids(state.items), ["q", "p", "hidden", "k"]);
  order.place("item", ["p"], "bottom");
  assert.deepEqual(ids(state.items), ["q", "p", "hidden", "k"], "an archived row is no peer to pass");
});

test("a lone item has no edge to reach", () => {
  const state = store([list("c1"), list("c2")], [item("a", "c1"), item("e", "c2")]);
  order.place("item", ["e"], "top");
  assert.deepEqual(ids(state.items), ["a", "e"]);
});

test("into another list re-parents the group, at its end or at a neighbour", () => {
  const state = store([list("c1"), list("c2", { expanded: false })],
    [item("a", "c1"), item("b", "c1"), item("p", "c2"), item("q", "c2"), item("r", "c2", { archived: true })]);
  order.place("item", ["a", "b"], { into: "c2" });
  assert.deepEqual(ids(state.items), ["p", "q", "r", "a", "b"], "last of the live rows it joins");
  assert.deepEqual([state.items.find((i) => i.id === "a").checklistId], ["c2"]);
  order.place("item", ["a", "b"], { into: "c2", before: "q" });
  assert.deepEqual(ids(state.items), ["p", "a", "b", "q", "r"]);
});

test("a group spanning lists is placed once per list, each at the top of its own", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2"), item("q", "c2")]);
  order.place("item", ["b", "p"], "top");
  assert.deepEqual(ids(state.items.filter((i) => i.checklistId === "c1")), ["b", "a"]);
  assert.deepEqual(ids(state.items.filter((i) => i.checklistId === "c2")), ["p", "q"]);
});

test("ids that no longer exist are a no-op, not a crash", () => {
  const state = store([list("c1")], [item("a", "c1"), item("b", "c1")]);
  order.place("item", ["gone-1", "gone-2"], "top");
  assert.deepEqual(ids(state.items), ["a", "b"]);
  order.place("list", [], "top");
  assert.deepEqual(ids(state.checklists), ["c1"]);
});

test("atEdge is true at the edges of the visible list and false in the middle", () => {
  store([list("a"), list("b"), list("c")], []);
  assert.equal(order.atEdge("list", ["a"], "top"), true);
  assert.equal(order.atEdge("list", ["a"], "bottom"), false);
  assert.equal(order.atEdge("list", ["b"], "top"), false, "a middle row moves either way");
  assert.equal(order.atEdge("list", ["b"], "bottom"), false);
  assert.equal(order.atEdge("list", ["c"], "bottom"), true);
});

test("atEdge counts only visible siblings: its own list's rows, archived aside", () => {
  store([list("old", { archived: true }), list("c1"), list("c2")],
    [item("gone", "c1", { archived: true }), item("p", "c1"), item("q", "c1"), item("only", "c2")]);
  assert.equal(order.atEdge("list", ["c1"], "top"), true, "the first visible list stays first");
  assert.equal(order.atEdge("item", ["p"], "top"), true, "an archived row above is no reason to move");
  assert.equal(order.atEdge("item", ["p"], "bottom"), false);
  assert.equal(order.atEdge("item", ["q"], "bottom"), true);
  assert.equal(order.atEdge("item", ["only"], "top"), true, "a lone item has no edge to reach");
  assert.equal(order.atEdge("item", ["only"], "bottom"), true);
});

test("atEdge is false for a bulk group that still has room, even when one row holds the edge", () => {
  store([list("a"), list("b"), list("c")], [item("p", "c1"), item("q", "c1"), item("r", "c1")]);
  assert.equal(order.atEdge("item", ["p", "r"], "top"), false, "the last one moves up past the middle");
  assert.equal(order.atEdge("item", ["p", "r"], "bottom"), false, "the first one moves down past the middle");
  assert.equal(order.atEdge("item", ["p", "q"], "top"), true, "a contiguous group at the edge");
  assert.equal(order.atEdge("item", ["p", "q"], "bottom"), false);
  assert.equal(order.atEdge("item", ["q", "r"], "top"), false);
  assert.equal(order.atEdge("item", ["q", "r"], "bottom"), true);
  assert.equal(order.atEdge("item", ["p", "q", "r"], "top"), true, "everything has nowhere to go");
  assert.equal(order.atEdge("item", ["p", "q", "r"], "bottom"), true);
});

test("pageFor is the page a list shows on, and 0 when it is not on screen", () => {
  store([list("a"), list("b"), list("c")], [], { pageSize: 2, page: 1 });
  assert.equal(order.pageFor("a"), 1);
  assert.equal(order.pageFor("c"), 2);
  assert.equal(order.pageFor("gone"), 0);
});

test("pageFor leaves the page where it is while everything fits on one", () => {
  store([list("a"), list("b"), list("c")], [], { pageSize: "all", page: 2 });
  assert.equal(order.pageFor("c"), 2);
});
