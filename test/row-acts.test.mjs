// Row buttons dispatch through a table; every act must reach exactly its own helper.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";

function harness({ checklists = [], items = [], editing, input } = {}) {
  const calls = [];
  const find = (rows) => (id) => rows.find((row) => row.id === id);
  const onRowAct = vm(
    [slice("flipFlag"), slice("ROW_ACTS"), slice("onRowAct"), "onRowAct"],
    {
      state: { ui: { editing } },
      findList: find(checklists),
      findItem: find(items),
      markDirty: (kind, id) => calls.push(`markDirty:${kind}:${id}`),
      queueSave: () => calls.push("queueSave"),
      repaintRow: (kind, id) => calls.push(`repaintRow:${kind}:${id}`),
      togglePick: (kind, id) => calls.push(`togglePick:${kind}:${id}`),
      startEdit: (kind, id) => calls.push(`startEdit:${kind}:${id}`),
      addItem: (id) => calls.push(`addItem:${id}`),
      openEntityMenu: (kind, id, trigger) => calls.push(`openEntityMenu:${kind}:${id}:${trigger.name}`),
      commitText: (kind, id, raw) => calls.push(`commitText:${kind}:${id}:${raw}`),
    },
  );
  const row = { querySelector: () => input };
  return { calls, onRowAct, row };
}

const TRIGGER = { name: "trigger" };

test("toggle flips a checklist and repaints its row", () => {
  const cl = { id: "c1", expanded: false };
  const { calls, onRowAct, row } = harness({ checklists: [cl] });
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(cl.expanded, true);
  assert.deepEqual(calls, ["markDirty:list:c1", "queueSave", "repaintRow:list:c1"]);
  onRowAct("toggle", "list", "c1", row, TRIGGER);
  assert.equal(cl.expanded, false);
});

test("toggle-done flips an item and repaints its row", () => {
  const item = { id: "i1", done: false };
  const { calls, onRowAct, row } = harness({ items: [item] });
  onRowAct("toggle-done", "item", "i1", row, TRIGGER);
  assert.equal(item.done, true);
  assert.deepEqual(calls, ["markDirty:item:i1", "queueSave", "repaintRow:item:i1"]);
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

test("save commits the text of the row being edited", () => {
  const { calls, onRowAct, row } = harness({ editing: { kind: "item", id: "i1" }, input: { value: "New" } });
  onRowAct("save", "item", "i1", row, TRIGGER);
  assert.deepEqual(calls, ["commitText:item:i1:New"]);
});

test("save without an editor or without an input does nothing", () => {
  const noEditor = harness({ input: { value: "New" } });
  noEditor.onRowAct("save", "item", "i1", noEditor.row, TRIGGER);
  assert.deepEqual(noEditor.calls, []);

  const noInput = harness({ editing: { kind: "list", id: "c1" } });
  noInput.onRowAct("save", "list", "c1", noInput.row, TRIGGER);
  assert.deepEqual(noInput.calls, []);
});

test("an unknown act is ignored", () => {
  const { calls, onRowAct, row } = harness();
  onRowAct("nope", "list", "c1", row, TRIGGER);
  assert.deepEqual(calls, []);
});
