// Panel buttons dispatch through a table; bulk actions stay dead without a selection.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";

function harness(ids, kind = "item") {
  const calls = [];
  const state = { ui: { panel: { collapsed: false }, bulk: { kind, ids } } };
  const { onPanelAct } = vm(
    [slice("PANEL_ACTS"), slice("BULK_ACTS"), slice("onPanelAct"), "({ onPanelAct })"],
    {
      state,
      commit: () => calls.push("commit"),
      setExpandedAll: (open) => calls.push(`setExpandedAll:${open}`),
      cancelBulk: () => calls.push("cancelBulk"),
      moveTo: (k, picked, where) => calls.push(`moveTo:${k}:${picked.join(",")}:${where}`),
      ask: (k, picked, action) => calls.push(`ask:${k}:${picked.join(",")}:${action}`),
    },
  );
  return { calls, state, onPanelAct };
}

const BULK = ["i1", "i2"];
const BUTTON = { name: "button" };

test("panel-toggle collapses and expands without a selection", () => {
  const { calls, state, onPanelAct } = harness([]);
  onPanelAct("panel-toggle", BUTTON);
  assert.equal(state.ui.panel.collapsed, true);
  onPanelAct("panel-toggle", BUTTON);
  assert.equal(state.ui.panel.collapsed, false);
  assert.deepEqual(calls, ["commit", "commit"]);
});

test("expand-all and collapse-all run without a selection", () => {
  const { calls, onPanelAct } = harness([]);
  onPanelAct("expand-all", BUTTON);
  onPanelAct("collapse-all", BUTTON);
  assert.deepEqual(calls, ["setExpandedAll:true", "setExpandedAll:false"]);
});

test("bulk-cancel runs without a selection", () => {
  const { calls, onPanelAct } = harness([]);
  onPanelAct("bulk-cancel", BUTTON);
  assert.deepEqual(calls, ["cancelBulk"]);
});

test("bulk actions do nothing while nothing is selected", () => {
  const { calls, onPanelAct } = harness([]);
  for (const act of ["bulk-top", "bulk-bottom", "bulk-archive", "bulk-delete"]) {
    onPanelAct(act, BUTTON);
  }
  assert.deepEqual(calls, []);
});

test("bulk actions act on the selection", () => {
  const { calls, onPanelAct } = harness(BULK);
  onPanelAct("bulk-top", BUTTON);
  onPanelAct("bulk-bottom", BUTTON);
  assert.deepEqual(calls, ["moveTo:item:i1,i2:top", "moveTo:item:i1,i2:bottom"]);
});

test("archive and delete ask about the whole selection", () => {
  const { calls, onPanelAct } = harness(BULK);
  onPanelAct("bulk-archive", BUTTON);
  onPanelAct("bulk-delete", BUTTON);
  assert.deepEqual(calls, ["ask:item:i1,i2:archive", "ask:item:i1,i2:delete"]);
});

test("ask receives the selection as a copy, not the live array", () => {
  const ids = [...BULK];
  const asked = [];
  const { onPanelAct } = vm(
    [slice("PANEL_ACTS"), slice("BULK_ACTS"), slice("onPanelAct"), "({ onPanelAct })"],
    {
      state: { ui: { panel: { collapsed: false }, bulk: { kind: "list", ids } } },
      commit() {},
      setExpandedAll() {},
      cancelBulk() {},
      moveTo() {},
      ask: (kind, picked, action, button) => asked.push({ kind, picked, action, button }),
    },
  );
  onPanelAct("bulk-delete", BUTTON);
  assert.equal(asked.length, 1);
  // Cross-realm arrays: compare by value, identity only for the "is it the live array" check.
  assert.equal(asked[0].picked.join(","), BULK.join(","));
  assert.notEqual(asked[0].picked, ids, "a copy: the confirm dialog must not see later selection changes");
  assert.equal(asked[0].kind, "list");
  assert.equal(asked[0].button, BUTTON);
});

test("an unknown act is ignored", () => {
  const { calls, onPanelAct } = harness(BULK);
  onPanelAct("nope", BUTTON);
  assert.deepEqual(calls, []);
});
