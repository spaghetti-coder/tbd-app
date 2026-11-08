// Row buttons dispatch through a table; every act must reach exactly its own helper.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { searchStub, storeStub } from "../../testkit/fixtures.mjs";

function harness({ checklists = [], items = [], editing, search = searchStub() } = {}) {
  const calls = [];
  const find = (rows) => (id) => rows.find((row) => row.id === id);
  const { onRowAct } = sliceVm(["flipFlag", "ROW_ACTS", "onRowAct"], {
    state: { ui: { editing } },
    search,
    findList: find(checklists),
    findItem: find(items),
    store: storeStub(calls),
    commit: (kind, id) => calls.push(`commit:${kind}:${id}`),
    togglePick: (kind, id) => calls.push(`togglePick:${kind}:${id}`),
    startEdit: (kind, id) => calls.push(`startEdit:${kind}:${id}`),
    addItem: (id) => calls.push(`addItem:${id}`),
    openEntityMenu: (kind, id, trigger) => calls.push(`openEntityMenu:${kind}:${id}:${trigger.name}`),
    commitEditor: () => calls.push("commitEditor"),
  });
  const row = {};
  return { calls, onRowAct, row };
}

const TRIGGER = { name: "trigger" };

test("toggle flips a checklist and commits its row", () => {
  const cl = { id: "c1", expanded: false };
  const { calls, onRowAct, row } = harness({ checklists: [cl] });
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(cl.expanded, true);
  assert.deepEqual(calls, ["markDirty:list:c1", "commit:list:c1"]);
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(cl.expanded, false);
});

test("a list the search holds open is not toggled", () => {
  const cl = { id: "c1", expanded: false };
  const { calls, onRowAct, row } = harness({ checklists: [cl], search: searchStub({ expands: (id) => id === "c1" }) });
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(cl.expanded, false, "the saved state stays as the user left it");
  assert.deepEqual(calls, []);
});

test("toggle-done flips an item and commits its row", () => {
  const item = { id: "i1", done: false };
  const { calls, onRowAct, row } = harness({ items: [item] });
  onRowAct("toggle-done", "item", "i1", row, TRIGGER);
  assert.equal(item.done, true);
  assert.deepEqual(calls, ["markDirty:item:i1", "commit:item:i1"]);
});

test("a row whose entity is gone does nothing", () => {
  const { calls, onRowAct, row } = harness();
  onRowAct("toggle", "list", "gone", row, TRIGGER);
  onRowAct("toggle-done", "item", "gone", row, TRIGGER);
  assert.deepEqual(calls, []);
});

test("pick, edit, add-item and menu forward their arguments", () => {
  const { calls, onRowAct, row } = harness();
  onRowAct("pick", "item", "i1", row, TRIGGER);
  onRowAct("edit", "list", "c1", row, TRIGGER);
  onRowAct("add-item", "list", "c1", row, TRIGGER);
  onRowAct("menu", "item", "i1", row, TRIGGER);
  assert.deepEqual(calls, [
    "togglePick:item:i1",
    "startEdit:list:c1",
    "addItem:c1",
    "openEntityMenu:item:i1:trigger",
  ]);
});

test("save routes to the editor commit", () => {
  const { calls, onRowAct, row } = harness({ editing: { kind: "item", id: "i1" } });
  onRowAct("save", "item", "i1", row, TRIGGER);
  assert.deepEqual(calls, ["commitEditor"]);
});

test("an unknown act is ignored", () => {
  const { calls, onRowAct, row } = harness();
  onRowAct("nope", "list", "c1", row, TRIGGER);
  assert.deepEqual(calls, []);
});
