// The archive "Items" tab lists one block per checklist, in the order the checklists show.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";

const { archived } = vm([
  "const state = { checklists: [], items: [] };",
  "function findList(id) { return state.checklists.find((c) => c.id === id); }",
  slice("archivedItems"),
  "({",
  "  archived: (checklists, items) => {",
  "    state.checklists = checklists;",
  "    state.items = items;",
  "    return archivedItems().map((i) => i.id);",
  "  },",
  "});",
]);

const list = (id, archived = false) => ({ id, archived });
const item = (id, checklistId, by = "user") => ({ id, checklistId, archived: true, archivedBy: by });

test("items of one checklist are listed together, in the order of the checklists", () => {
  assert.deepEqual(archived([list("a"), list("b")], [item("b1", "b"), item("a1", "a"), item("b2", "b")]),
    ["a1", "b1", "b2"]);
});

test("the order inside a checklist survives", () => {
  assert.deepEqual(archived([list("a")], [item("a1", "a"), item("a2", "a"), item("a3", "a")]), ["a1", "a2", "a3"]);
});

test("only the user's own archived items are listed", () => {
  const items = [item("kept", "a"), item("whole", "b"), item("with-list", "a", "list"), { id: "live", checklistId: "a" }];
  assert.deepEqual(archived([list("a"), list("b", true)], items), ["kept"]);
});

test("an item of a lost checklist goes last", () => {
  assert.deepEqual(archived([list("a")], [item("gone", "z"), item("a1", "a")]), ["a1", "gone"]);
});

test("nothing archived is nothing listed", () => {
  assert.deepEqual(archived([list("a")], []), []);
});
