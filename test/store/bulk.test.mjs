// Bulk mode: what a selection accepts, what survives a delete or an archive, and what it does to the panel.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list, plain } from "../../testkit/fixtures.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { api, store, marks } = stateHarness([
  "setBulk",
  "startBulk",
  "togglePick",
  "pruneSelection",
  "spansLists",
  "deleteMany",
  "archiveMany",
  "archiveChecklistQuiet",
  "archiveItemQuiet",
  "removeEntity",
  "flushPendingEdit",
  "commitText",
  "cancelEdit",
  "entityText",
  "findList",
  "findItem",
]);

test("deleteMany removes a checklist with its items and ends the selection", () => {
  const state = store([list("c1"), list("c2")], [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  state.ui.bulk = { kind: "list", ids: ["c1"] };
  api.deleteMany("list", ["c1"]);
  assert.deepEqual(ids(state.checklists), ["c2"]);
  assert.deepEqual(ids(state.items), ["p"], "the items of a deleted checklist go with it");
  assert.equal(marks(), "markGone:item:a,markGone:item:b,markGone:list:c1,markOrder:lists",
    "the deleted list names every row it takes with it, while state still holds them");
  assert.deepEqual(plain(state.ui.bulk), { kind: null, ids: [] });
});

test("deleteMany of items leaves the rows that were not picked", () => {
  const state = store([list("c1")], [item("a", "c1"), item("b", "c1"), item("c", "c1")]);
  state.ui.bulk = { kind: "item", ids: ["a", "c"] };
  api.deleteMany("item", ["a", "c"]);
  assert.deepEqual(ids(state.items), ["b"]);
  assert.deepEqual(plain(state.ui.bulk), { kind: null, ids: [] }, "emptying it ends bulk");
});

test("archiveMany marks lists as list-archived and items as user-archived", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c2"), item("kept", "c2", { archived: true, archivedBy: "user" })]);
  state.ui.bulk = { kind: "list", ids: ["c1", "c2"] };
  api.archiveMany("list", ["c1", "c2"]);
  assert.deepEqual([api.findList("c1").archived, api.findList("c2").archived], [true, true]);
  assert.equal(api.findItem("a").archivedBy, "list");
  assert.equal(api.findItem("b").archivedBy, "list");
  assert.deepEqual(plain(state.ui.bulk), { kind: null, ids: [] });
  state.ui.bulk = { kind: "item", ids: ["b", "kept"] };
  assert.equal(marks(), "markDirty:list:c1,markDirty:item:a,markDirty:list:c2,markDirty:item:b", "every archived row is marked");
  api.archiveMany("item", ["b", "kept"]);
  assert.equal(api.findItem("b").archived, true);
  assert.equal(api.findItem("b").archivedBy, "user");
  assert.equal(api.findList("c2").archived, true, "the checklist stays archived");
});

test("pruneSelection drops the picks that are gone and keeps the rest", () => {
  const archived = store([list("c1"), list("c2")], [item("a", "c1"), item("p", "c2")]);
  archived.ui.bulk = { kind: "item", ids: ["a", "p"] };
  api.archiveMany("item", ["p"]);
  assert.deepEqual(plain(archived.ui.bulk), { kind: "item", ids: ["a"] }, "an archived pick leaves, the rest survives");

  const gone = store([list("c1"), list("c2")], [item("a", "c1"), item("p", "c2")]);
  gone.ui.bulk = { kind: "item", ids: ["a", "p"] };
  api.deleteMany("list", ["c1"]);
  assert.deepEqual(plain(gone.ui.bulk), { kind: "item", ids: ["p"] }, "deleting a list keeps the picks of the others");

  const empty = store([list("c1")], [item("a", "c1")]);
  empty.ui.bulk = { kind: "item", ids: ["a"] };
  api.deleteMany("item", ["a"]);
  assert.deepEqual(plain(empty.ui.bulk), { kind: null, ids: [] }, "emptying it ends bulk");

  const untouched = store([list("c1"), list("c2")], [item("a", "c1"), item("p", "c2")]);
  untouched.ui.bulk = { kind: "item", ids: ["a", "p"] };
  api.deleteMany("item", ["gone"]);
  assert.deepEqual(plain(untouched.ui.bulk), { kind: "item", ids: ["a", "p"] });
});

test("spansLists is true only for an item selection spread over two checklists", () => {
  store([list("c1"), list("c2")], [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  assert.equal(api.spansLists({ kind: "list", ids: ["c1", "c2"] }), false, "a list selection is one list per row");
  assert.equal(api.spansLists({ kind: "item", ids: [] }), false, "no picks, no lists");
  assert.equal(api.spansLists({ kind: "item", ids: ["a"] }), false);
  assert.equal(api.spansLists({ kind: "item", ids: ["a", "b"] }), false, "both picks live in c1");
  assert.equal(api.spansLists({ kind: "item", ids: ["a", "p"] }), true, "adding a pick from c2 makes it mixed");
  assert.equal(api.spansLists({ kind: "item", ids: ["gone", "gone2"] }), false, "unknown ids are not a second list");
  assert.equal(api.spansLists({ kind: "item", ids: ["a", "gone"] }), true, "a live pick plus an unknown one counts as mixed");
});

test("togglePick picks items across checklists", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  api.togglePick("item", "a");
  assert.deepEqual(plain(state.ui.bulk), { kind: "item", ids: ["a"] });
  api.togglePick("item", "p");
  assert.deepEqual(plain(state.ui.bulk), { kind: "item", ids: ["a", "p"] }, "a pick in another checklist joins it");
  api.togglePick("item", "a");
  api.togglePick("item", "p");
  assert.deepEqual(plain(state.ui.bulk), { kind: null, ids: [] }, "emptying it ends bulk");
  api.togglePick("item", "a");
  api.togglePick("list", "c1");
  assert.deepEqual(plain(state.ui.bulk), { kind: "list", ids: ["c1"] }, "another kind starts a new selection");
});

test("starting a selection expands a collapsed panel", () => {
  const collapsedPanel = { side: "right", topPct: 0.35, collapsed: true };
  const state = store([list("c1")], [item("a", "c1"), item("b", "c1")], { panel: collapsedPanel });
  api.startBulk("list", "c1");
  assert.equal(state.ui.panel.collapsed, false, "bulk mode from the menu expands the panel");

  state.ui.panel.collapsed = true;
  api.togglePick("item", "a");
  assert.equal(state.ui.panel.collapsed, false, "starting a selection of another kind expands it");

  state.ui.panel.collapsed = true;
  api.togglePick("item", "b");
  assert.equal(state.ui.panel.collapsed, true, "picking inside a running selection keeps it collapsed");
});
