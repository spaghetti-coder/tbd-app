// Panel buttons dispatch through a table: bulk acts die without a selection.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { item, list, plain } from "../../testkit/fixtures.mjs";

// Real picks: the acts guard on current().
function harness(ids = [], kind = "item") {
  const calls = [];
  const asked = [];
  const state = {
    checklists: [list("c1"), list("c2")],
    items: [item("i1", "c1"), item("i2", "c1"), item("p1", "c2")],
    ui: { panel: { collapsed: false } },
  };
  const { createSelection } = sliceVm(["createSelection"], {});
  const selection = createSelection({
    getState: () => state,
    order: { atEdge: () => false },
    editor: { flush: () => {} },
  });
  ids.forEach((id) => selection.pick(kind, id));
  const { onPanelAct } = sliceVm(["PANEL_ACTS", "BULK_ACTS", "onPanelAct"], {
    state,
    selection,
    store: { commit: () => calls.push("commit") },
    setExpandedAll: (open) => calls.push(`setExpandedAll:${open}`),
    moveTo: (k, picked, where) => calls.push(`moveTo:${k}:${picked.join(",")}:${where}`),
    ask: (k, picked, action, button) => {
      calls.push(`ask:${k}:${picked.join(",")}:${action}`);
      asked.push({ kind: k, picked, action, button });
    },
  });
  return { calls, state, asked, onPanelAct, selection };
}

const ITEMS = ["i1", "i2"];
const LISTS = ["c1", "c2"];
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

test("bulk-cancel leaves nothing selected and repaints", () => {
  const { calls, onPanelAct, selection } = harness(ITEMS);
  onPanelAct("bulk-cancel", BUTTON);
  assert.deepEqual(calls, ["commit"]);
  assert.equal(selection.current(), null);
});

test("bulk actions do nothing while nothing is selected", () => {
  const { calls, onPanelAct } = harness([]);
  for (const act of ["bulk-top", "bulk-bottom", "bulk-archive", "bulk-delete"]) {
    onPanelAct(act, BUTTON);
  }
  assert.deepEqual(calls, []);
});

test("bulk actions act on the selection", () => {
  const { calls, onPanelAct } = harness(ITEMS);
  onPanelAct("bulk-top", BUTTON);
  onPanelAct("bulk-bottom", BUTTON);
  assert.deepEqual(calls, ["moveTo:item:i1,i2:top", "moveTo:item:i1,i2:bottom"]);
});

test("archive and delete ask about the whole selection", () => {
  const { calls, onPanelAct } = harness(ITEMS);
  onPanelAct("bulk-archive", BUTTON);
  onPanelAct("bulk-delete", BUTTON);
  assert.deepEqual(calls, ["ask:item:i1,i2:archive", "ask:item:i1,i2:delete"]);
});

test("what a dialog got stays what it got: a later pick does not reach it", () => {
  const { asked, onPanelAct, selection } = harness(LISTS, "list");
  onPanelAct("bulk-delete", BUTTON);
  assert.deepEqual(plain(asked[0].picked), LISTS);
  selection.pick("list", "c1");
  assert.deepEqual(plain(asked[0].picked), LISTS, "the open dialog holds its own ids");
  assert.equal(asked[0].kind, "list");
  assert.equal(asked[0].button, BUTTON);
});

test("an unknown act is ignored", () => {
  const { calls, onPanelAct } = harness(ITEMS);
  onPanelAct("nope", BUTTON);
  assert.deepEqual(calls, []);
});
