// What a stored doc is allowed to say: anything else falls back to defaults.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list } from "../../testkit/fixtures.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { api, plainBulk } = stateHarness(["normalize", "defaults", "validBulk", "clamp"]);

test("normalize drops items whose checklist is gone", () => {
  const out = api.normalize({
    version: 1,
    checklists: [list("c1")],
    items: [item("a", "c1"), item("b", "nope")],
  });
  assert.deepEqual(ids(out.items), ["a"]);
});

test("normalize resets a page size that is not on the allowed list", () => {
  for (const pageSize of [0, "9", null, undefined, -20, 25]) {
    assert.equal(api.normalize({ version: 1, ui: { pageSize } }).ui.pageSize, 20, `pageSize ${pageSize}`);
  }
  assert.equal(api.normalize({ version: 1, ui: { pageSize: "all" } }).ui.pageSize, "all");
  assert.equal(api.normalize({ version: 1, ui: { pageSize: 50 } }).ui.pageSize, 50);
  assert.equal(api.normalize(null).ui.pageSize, 20);
});

test("normalize keeps the theme, panel and bulk rules", () => {
  assert.equal(api.normalize({ version: 1, ui: { theme: "neon" } }).ui.theme, "system");
  assert.equal(api.normalize({ version: 1, ui: { theme: "dark" } }).ui.theme, "dark");
  assert.equal(api.normalize({ version: 1, ui: { panel: { side: "left", topPct: 9 } } }).ui.panel.topPct, 1);
  assert.equal(api.normalize({ version: 1, ui: { bulk: { kind: "weird", ids: ["a"] } } }).ui.bulk.kind, null);
  assert.deepEqual(api.normalize({ version: 1, ui: { bulk: { kind: "item", ids: ["a"] } } }).ui.bulk,
    { kind: "item", ids: ["a"] });
  assert.deepEqual(plainBulk(api.normalize({ version: 1, ui: { bulk: { kind: "item", ids: "abc" } } }).ui.bulk),
    { kind: null, ids: [] }, "ids has to be a list");
  assert.deepEqual(plainBulk(api.normalize({ version: 1, ui: { bulk: { kind: "list" } } }).ui.bulk),
    { kind: null, ids: [] });
  const legacy = api.normalize({ version: 1, ui: { bulk: { kind: "item", checklistId: "c1", ids: ["a"] } } }).ui.bulk;
  assert.equal(legacy.kind, "item", "a selection saved by an older build still restores");
  assert.deepEqual(Array.from(legacy.ids), ["a"]);
  assert.equal(api.normalize({ version: 1 }).ui.panel.collapsed, false, "panel starts expanded");
  assert.equal(api.normalize({ version: 1, ui: { panel: { side: "left", topPct: 0.5, collapsed: true } } }).ui.panel.collapsed, true);
  assert.equal(api.normalize({ version: 1, ui: { panel: { collapsed: "yes" } } }).ui.panel.collapsed, false);
  assert.equal(api.normalize({ version: 1, ui: { panel: { collapsed: 1 } } }).ui.panel.collapsed, false);
});

test("normalize returns defaults for anything that is not version 1", () => {
  assert.deepEqual(api.normalize({ version: 2, checklists: [list("c1")] }), api.defaults());
  assert.deepEqual(api.normalize(undefined), api.defaults());
  assert.equal(api.defaults().ui.pageSize, 20);
});
