// The archive: what the "Items" tab lists, and where restored rows land.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list } from "../../testkit/fixtures.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { api, store } = stateHarness([
  "archivedItems",
  "restoreItems",
  "restoreLists",
  "withoutArchived",
  "findList",
  "findItem",
  "moveGroup",
  "clamp",
]);

// An archived item, as the store keeps it.
const archived = (id, checklistId, by = "user") => item(id, checklistId, { archived: true, archivedBy: by });
const archivedList = (...ids) => ids.map((id) => list(id, { archived: true }));

const archivedTab = (checklists, items) => (store(checklists, items), ids(api.archivedItems()));

test("items of one checklist are listed together, in the order of the checklists", () => {
  assert.deepEqual(archivedTab([list("a"), list("b")], [archived("b1", "b"), archived("a1", "a"), archived("b2", "b")]),
    ["a1", "b1", "b2"]);
});

test("the order inside a checklist survives", () => {
  assert.deepEqual(archivedTab([list("a")], [archived("a1", "a"), archived("a2", "a"), archived("a3", "a")]),
    ["a1", "a2", "a3"]);
});

test("only the user's own archived items are listed", () => {
  const items = [archived("kept", "a"), archived("whole", "b"), archived("with-list", "a", "list"), { id: "live", checklistId: "a" }];
  assert.deepEqual(archivedTab([list("a"), ...archivedList("b")], items), ["kept"]);
});

test("an item of a lost checklist goes last", () => {
  assert.deepEqual(archivedTab([list("a")], [archived("gone", "z"), archived("a1", "a")]), ["a1", "gone"]);
});

test("nothing archived is nothing listed", () => {
  assert.deepEqual(archivedTab([list("a")], []), []);
});

test("restoreItems keeps the restored group in its original order", () => {
  const state = store([list("c1")],
    [item("a", "c1"), item("b", "c1"), archived("x", "c1"), archived("y", "c1")]);
  api.restoreItems(["x", "y"]);
  assert.deepEqual(ids(state.items), ["x", "y", "a", "b"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c1")), ["x", "y", "a", "b"]);
});

test("restoreItems tops a checklist that has no live items left", () => {
  const state = store([list("c1"), list("c2")], [item("keep", "c2"), archived("x", "c1")]);
  api.restoreItems(["x"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c1")), ["x"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c2")), ["keep"]);
});

test("restoreItems puts every restored item on top of its own checklist", () => {
  const state = store([list("c1"), list("c2")], [
    item("a", "c1"), item("b", "c2"),
    archived("y", "c2"), archived("x", "c1"),
  ]);
  api.restoreItems(["y", "x"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c1")), ["x", "a"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c2")), ["y", "b"]);
});

test("restoreLists un-archives only the items the list archived", () => {
  const state = store([list("c1"), ...archivedList("c2")],
    [item("keep", "c1"), archived("bylist", "c2", "list"), archived("byuser", "c2", "user")]);
  api.restoreLists(["c2"]);
  assert.deepEqual(ids(state.checklists), ["c2", "c1"]);
  assert.equal(api.findList("c2").archived, false);
  assert.equal(api.findItem("bylist").archived, false);
  assert.equal(api.findItem("byuser").archived, true);
});
