// The archive: what the "Items" tab lists, and where restored rows land.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list } from "../../testkit/fixtures.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { api, store } = stateHarness([
  "archivedItems",
  "restore",
  "withoutArchived",
  "findList",
  "findItem",
  "moveGroup",
  "clamp",
]);

// An archived item, as the store keeps it.
const archived = (id, checklistId, by = "user") => item(id, checklistId, { archived: true, archivedBy: by });
const archivedList = (...ids) => ids.map((id) => list(id, { archived: true }));

function archivedTab(checklists, items) {
  store(checklists, items);
  return ids(api.archivedItems());
}

// [checklists, items, expected ids]
test("the Items tab: the user's own archived items, grouped in the order of the checklists", () => {
  const rows = [
    ["grouped by checklist, in the checklist order",
      [list("a"), list("b")],
      [archived("b1", "b"), archived("a1", "a"), archived("b2", "b")], ["a1", "b1", "b2"]],
    ["the order inside a checklist survives",
      [list("a")], [archived("a1", "a"), archived("a2", "a"), archived("a3", "a")], ["a1", "a2", "a3"]],
    ["only the user's own, not the ones a list took with it",
      [list("a"), ...archivedList("b")],
      [archived("kept", "a"), archived("whole", "b"), archived("with-list", "a", "list"),
        { id: "live", checklistId: "a" }], ["kept"]],
    ["an item of a lost checklist goes last", [list("a")], [archived("gone", "z"), archived("a1", "a")], ["a1", "gone"]],
    ["nothing archived is nothing listed", [list("a")], [], []],
  ];
  for (const [what, checklists, items, want] of rows) {
    assert.deepEqual(archivedTab(checklists, items), want, what);
  }
});

test("restored items keep their original order", () => {
  const state = store([list("c1")],
    [item("a", "c1"), item("b", "c1"), archived("x", "c1"), archived("y", "c1")]);
  api.restore("item", ["x", "y"]);
  assert.deepEqual(ids(state.items), ["x", "y", "a", "b"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c1")), ["x", "y", "a", "b"]);
});

test("a restored item tops a checklist that has no live items left", () => {
  const state = store([list("c1"), list("c2")], [item("keep", "c2"), archived("x", "c1")]);
  api.restore("item", ["x"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c1")), ["x"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c2")), ["keep"]);
});

test("every restored item goes on top of its own checklist", () => {
  const state = store([list("c1"), list("c2")], [
    item("a", "c1"), item("b", "c2"),
    archived("y", "c2"), archived("x", "c1"),
  ]);
  api.restore("item", ["y", "x"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c1")), ["x", "a"]);
  assert.deepEqual(ids(api.withoutArchived(state.items, "c2")), ["y", "b"]);
});

test("restoring a list un-archives only the items the list archived", () => {
  const state = store([list("c1"), ...archivedList("c2")],
    [item("keep", "c1"), archived("bylist", "c2", "list"), archived("byuser", "c2", "user")]);
  api.restore("list", ["c2"]);
  assert.deepEqual(ids(state.checklists), ["c2", "c1"]);
  assert.equal(api.findList("c2").archived, false);
  assert.equal(api.findItem("bylist").archived, false);
  assert.equal(api.findItem("byuser").archived, true);
});
