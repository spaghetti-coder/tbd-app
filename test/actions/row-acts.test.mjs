// Row buttons dispatch through a table: each act must reach exactly its helper.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { searchStub, storeStub } from "../../testkit/fixtures.mjs";

function harness({ checklists = [], items = [], editing, search = searchStub(), scope = "row" } = {}) {
  const calls = [];
  const { onRowAct } = sliceVm(["flipFlag", "patch", "findList", "findItem", "ROW_ACTS", "onRowAct"], {
    state: { checklists, items, ui: { editing } },
    search,
    store: storeStub(calls),
    // Stub scope: the pick -> commit mapping is under test.
    selection: { pick: (kind, id) => { calls.push(`pick:${kind}:${id}`); return scope; } },
    editor: { open: (kind, id) => calls.push(`open:${kind}:${id}`) },
    addItem: (id) => calls.push(`addItem:${id}`),
    openEntityMenu: (kind, id, trigger) => calls.push(`openEntityMenu:${kind}:${id}:${trigger.name}`),
    commitEditor: () => calls.push("commitEditor"),
  });
  const row = {};
  const find = (kind) => (id) => (kind === "list" ? checklists : items).find((r) => r.id === id);
  return { calls, onRowAct, row, find };
}

const TRIGGER = { name: "trigger" };

test("toggle flips a checklist and commits its row", () => {
  const { calls, onRowAct, row, find } = harness({ checklists: [{ id: "c1", expanded: false }] });
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(find("list")("c1").expanded, true);
  assert.deepEqual(calls, ["commit:list:c1"]);
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(find("list")("c1").expanded, false);
});

test("a list the search holds open is not toggled", () => {
  const { calls, onRowAct, row, find } = harness({
    checklists: [{ id: "c1", expanded: false }], search: searchStub({ expands: (id) => id === "c1" }),
  });
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(find("list")("c1").expanded, false, "the saved state stays as the user left it");
  assert.deepEqual(calls, []);
});

test("toggle-done flips an item and commits its row", () => {
  const { calls, onRowAct, row, find } = harness({ items: [{ id: "i1", done: false }] });
  onRowAct("toggle-done", "item", "i1", row, TRIGGER);
  assert.equal(find("item")("i1").done, true);
  assert.deepEqual(calls, ["commit:item:i1"]);
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
    "pick:item:i1",
    "commit:item:i1",
    "open:list:c1",
    "addItem:c1",
    "openEntityMenu:item:i1:trigger",
  ]);
});

test("a pick that changes every row repaints them all", () => {
  const { calls, onRowAct, row } = harness({ scope: "all" });
  onRowAct("pick", "item", "i1", row, TRIGGER);
  assert.deepEqual(calls, ["pick:item:i1", "commit"]);
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
