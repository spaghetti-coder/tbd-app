// Placement math: where a drop lands and which rows hold an edge, run against a `state` shim.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list, plain } from "../../testkit/fixtures.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { api, store, marks } = stateHarness([
  "clamp",
  "moveGroup",
  "refIndex",
  "joinIndex",
  "atEdge",
  "withoutArchived",
  "visibleChecklists",
  "findItem",
  "findList",
  "moveItemsTo",
  "dropItemsInto",
]);

const rows = (...picked) => picked.map((id) => ({ id }));

test("joinIndex joins the first peer, the last one, or the end when there are none", () => {
  const [a, b, c] = rows("a", "b", "c");
  const rest = [a, b, c];
  assert.equal(api.joinIndex(rest, [a, b], false), 0, "before the first peer");
  assert.equal(api.joinIndex(rest, [a, b], true), 2, "after the last peer");
  assert.equal(api.joinIndex(rest, [], false), 3, "no peers: the end of the array");
  assert.equal(api.joinIndex(rest, [], true), 3);
});

test("moveGroup splices the picked group, in list order, at the index of the rest", () => {
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3", "4", "5", "6", "7"), ["3", "7"], 2)),
    ["1", "2", "3", "7", "4", "5", "6"]);
});

test("moveGroup clamps both ends and ignores ids that are not in the list", () => {
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3", "4", "5", "6", "7"), ["3", "7"], 0)),
    ["3", "7", "1", "2", "4", "5", "6"]);
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3", "4", "5", "6", "7"), ["3", "7"], 99)),
    ["1", "2", "4", "5", "6", "3", "7"]);
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3"), ["9"], 1)), ["1", "2", "3"]);
});

test("refIndex is the position inside the list without the picked rows", () => {
  const all = rows("1", "2", "3", "4", "5", "6", "7");
  assert.equal(api.refIndex(all, ["3", "7"], "4"), 2);
  assert.equal(api.refIndex(all, ["3", "7"], "1"), 0);
});

test("refIndex falls back to the row before the gap, so a drop at the end of a page stays on it", () => {
  const all = rows("1", "2", "3", "4", "5", "6", "7");
  assert.equal(api.refIndex(all, ["3", "7"], "7"), 5, "a ref that was picked itself falls back to the end");
  assert.equal(api.refIndex(all, ["3", "7"], "gone"), 5, "a vanished ref falls back to the end");
  assert.equal(api.refIndex(all, ["3", "7"], "4", "1"), 2, "the row after the gap wins");
  assert.equal(api.refIndex(all, ["3", "7"], null, "5"), 4);
  assert.equal(api.refIndex(all, ["3", "7"], "gone", "6"), 5);
  assert.equal(api.refIndex(all, ["3", "7"], null, "gone"), 5, "neither side: the end of the list");
  assert.equal(api.refIndex(all, ["3", "7"], null), 5, "3-argument calls keep the old behaviour");
});

test("atEdge is true at the edges of the visible list and false in the middle", () => {
  store([list("a"), list("b"), list("c")], []);
  assert.equal(api.atEdge("list", ["a"], "top"), true);
  assert.equal(api.atEdge("list", ["a"], "bottom"), false);
  assert.equal(api.atEdge("list", ["b"], "top"), false, "a middle row moves either way");
  assert.equal(api.atEdge("list", ["b"], "bottom"), false);
  assert.equal(api.atEdge("list", ["c"], "bottom"), true);
});

test("atEdge counts only visible siblings: its own list's rows, archived aside", () => {
  store([list("old", { archived: true }), list("c1"), list("c2")],
    [item("gone", "c1", { archived: true }), item("p", "c1"), item("q", "c1"), item("only", "c2")]);
  assert.equal(api.atEdge("list", ["c1"], "top"), true, "the first visible list stays first");
  assert.equal(api.atEdge("item", ["p"], "top"), true, "an archived row above is no reason to move");
  assert.equal(api.atEdge("item", ["p"], "bottom"), false);
  assert.equal(api.atEdge("item", ["q"], "bottom"), true);
  assert.equal(api.atEdge("item", ["only"], "top"), true, "a lone item has no edge to reach");
  assert.equal(api.atEdge("item", ["only"], "bottom"), true);
});

test("atEdge is false for a bulk group that still has room, even when one row holds the edge", () => {
  store([list("a"), list("b"), list("c")], [item("p", "c1"), item("q", "c1"), item("r", "c1")]);
  assert.equal(api.atEdge("item", ["p", "r"], "top"), false, "the last one moves up past the middle");
  assert.equal(api.atEdge("item", ["p", "r"], "bottom"), false, "the first one moves down past the middle");
  assert.equal(api.atEdge("item", ["p", "q"], "top"), true, "a group already at the edge in order");
  assert.equal(api.atEdge("item", ["p", "q"], "bottom"), false);
  assert.equal(api.atEdge("item", ["q", "r"], "top"), false);
  assert.equal(api.atEdge("item", ["q", "r"], "bottom"), true);
  assert.equal(api.atEdge("item", ["p", "q", "r"], "top"), true, "everything has nowhere to go");
  assert.equal(api.atEdge("item", ["p", "q", "r"], "bottom"), true);
});

test("moveItemsTo keeps a bulk group together and in order", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("c", "c1"), item("d", "c1"), item("e", "c2")]);
  api.moveItemsTo(["c", "a"], "top");
  assert.deepEqual(ids(state.items), ["a", "c", "b", "d", "e"]);
  api.moveItemsTo(["c", "a"], "bottom");
  assert.deepEqual(ids(state.items), ["b", "d", "a", "c", "e"]);
  assert.equal(marks(), "markOrder:c1,markOrder:c1", "a move marks the order doc, not the rows it moved");
});

test("moveItemsTo with a lone item just leaves it where it is", () => {
  const state = store([list("c1"), list("c2")], [item("a", "c1"), item("e", "c2")]);
  api.moveItemsTo(["e"], "top");
  assert.deepEqual(ids(state.items), ["a", "e"]);
});

test("moveItemsTo with ids that no longer exist is a no-op, not a crash", () => {
  const state = store([list("c1")], [item("a", "c1"), item("b", "c1")]);
  api.moveItemsTo(["gone-1", "gone-2"], "top");
  assert.deepEqual(ids(state.items), ["a", "b"]);
});

test("dropItemsInto re-parents items after the last live peer", () => {
  const state = store([list("c1"), list("c2", { expanded: false })],
    [item("a", "c1"), item("b", "c1"), item("p", "c2"), item("q", "c2"), item("r", "c2", { archived: true })]);
  api.dropItemsInto(["a", "b"], "c2", null);
  assert.deepEqual(ids(state.items), ["p", "q", "a", "b", "r"]);
  assert.deepEqual([api.findItem("a").checklistId, api.findItem("b").checklistId], ["c2", "c2"]);
  assert.equal(api.findList("c2").expanded, true);
});

test("dropItemsInto aims at the row under the gap when it still exists", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2"), item("q", "c2")]);
  api.dropItemsInto(["a", "b"], "c2", "q");
  assert.deepEqual(ids(state.items), ["p", "a", "b", "q"]);
});

test("dropItemsInto with a dropped-on ref falls back to the end of the target list", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("p", "c2"), item("hidden", "c2", { archived: true, archivedBy: "list" })]);
  api.dropItemsInto(["a"], "c2", "gone");
  assert.deepEqual(ids(state.items), ["p", "a", "hidden"]);
});

test("dropItemsInto leaves the selection untouched, so a bulk drop keeps every picked id", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  state.ui.bulk = { kind: "item", ids: ["a", "p"] };
  api.dropItemsInto(["a", "b"], "c2", null);
  assert.deepEqual(plain(state.ui.bulk), { kind: "item", ids: ["a", "p"] });
  const single = store([list("c1"), list("c2")], [item("a", "c1"), item("p", "c2")]);
  api.dropItemsInto(["a"], "c2", null);
  assert.deepEqual(single.ui.bulk, { kind: null, ids: [] });
});
