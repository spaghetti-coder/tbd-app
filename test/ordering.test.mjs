// Unit tests for the pure ordering / repair logic that lives inside index.html.
// The app is a single file with no build, so the functions are sliced out of the
// source by name and evaluated in a VM with a `state` shim.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const NAMES = [
  "clamp",
  "defaults",
  "normalize",
  "moveGroup",
  "refIndex",
  "withoutArchived",
  "findList",
  "findItem",
  "moveItemsTo",
  "dropItemsInto",
  "restoreLists",
  "restoreItems",
  "archivedItems",
];

// Every app function sits at column 0, so the first `^}` ends it.
function slice(name) {
  const found = new RegExp(`^function ${name}\\b[\\s\\S]*?^\\}`, "m").exec(html);
  if (!found) {
    throw new Error(`test harness: function ${name}() not found in index.html (renamed?)`);
  }
  return found[0];
}

const pageSizes = /^const PAGE_SIZES = .*$/m.exec(html);
if (!pageSizes) {
  throw new Error("test harness: PAGE_SIZES not found in index.html (renamed?)");
}

const sandbox = { state: null };
createContext(sandbox);
runInContext(
  [pageSizes[0], ...NAMES.map(slice), `this.api = { ${NAMES.join(", ")} };`].join("\n"),
  sandbox,
);
const api = sandbox.api;

const list = (id, extra) => ({
  id,
  title: `list ${id}`,
  expanded: true,
  createdAt: 1,
  archived: false,
  ...extra,
});

const item = (id, checklistId, extra) => ({
  id,
  checklistId,
  text: `item ${id}`,
  done: false,
  createdAt: 1,
  archived: false,
  archivedBy: "user",
  ...extra,
});

const rows = (...ids) => ids.map((id) => ({ id }));
// Array.from, not map: the rows come from the VM realm and map() would keep that realm's Array.prototype.
const ids = (rows2) => Array.from(rows2, (row) => row.id);

const store = (checklists, items) => {
  sandbox.state = { checklists, items, ui: { pageSize: 20, bulk: { kind: null, checklistId: null, ids: [] } } };
  return sandbox.state;
};

test("moveGroup splices the picked group, in list order, at the index of the rest", () => {
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3", "4", "5", "6", "7"), ["3", "7"], 2)),
    ["1", "2", "3", "7", "4", "5", "6"]);
});

test("moveGroup clamps both ends and ignores ids that are not in the list", () => {
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3", "4", "5", "6", "7"), ["3", "7"], 0)),
    ["3", "7", "1", "2", "4", "5", "6"]);
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3", "4", "5", "6", "7"), ["3", "7"], 99)),
    ["1", "2", "4", "5", "6", "3", "7"]);
  assert.deepEqual(ids(api.moveGroup(rows("1", "2", "3"), ["9"], 1)), ["1", "2", "3"]);
});

test("refIndex is the position inside the list without the picked rows", () => {
  const all = rows("1", "2", "3", "4", "5", "6", "7");
  assert.equal(api.refIndex(all, ["3", "7"], "4"), 2);
  assert.equal(api.refIndex(all, ["3", "7"], "1"), 0);
});

test("refIndex falls back to the end when there is nothing to aim at", () => {
  const all = rows("1", "2", "3", "4", "5", "6", "7");
  assert.equal(api.refIndex(all, ["3", "7"], null), 5);
  assert.equal(api.refIndex(all, ["3", "7"], "gone"), 5);
  assert.equal(api.refIndex(all, ["3", "7"], "7"), 5);
});

test("moveItemsTo keeps a bulk group together and in order", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("c", "c1"), item("d", "c1"), item("e", "c2")]);
  api.moveItemsTo(["c", "a"], "top");
  assert.deepEqual(ids(state.items), ["a", "c", "b", "d", "e"]);
  api.moveItemsTo(["c", "a"], "bottom");
  assert.deepEqual(ids(state.items), ["b", "d", "a", "c", "e"]);
});

test("moveItemsTo with a lone item just leaves it where it is", () => {
  const state = store([list("c1"), list("c2")], [item("a", "c1"), item("e", "c2")]);
  api.moveItemsTo(["e"], "top");
  assert.deepEqual(ids(state.items), ["a", "e"]);
});

test("moveItemsTo with ids that no longer exist is a no-op, not a crash", () => {
  const state = store([list("c1")], [item("a", "c1"), item("b", "c1")]);
  api.moveItemsTo(["gone-1", "gone-2"], "top");
  assert.deepEqual(ids(state.items), ["a", "b"]);
});

test("dropItemsInto re-parents items after the last live peer", () => {
  const state = store([list("c1"), list("c2", { expanded: false })],
    [item("a", "c1"), item("b", "c1"), item("p", "c2"), item("q", "c2"), item("r", "c2", { archived: true })]);
  api.dropItemsInto(["a", "b"], "c2", null);
  assert.deepEqual(ids(state.items), ["p", "q", "a", "b", "r"]);
  assert.deepEqual([api.findItem("a").checklistId, api.findItem("b").checklistId], ["c2", "c2"]);
  assert.equal(api.findList("c2").expanded, true);
});

test("dropItemsInto aims at the row under the gap when it still exists", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2"), item("q", "c2")]);
  api.dropItemsInto(["a", "b"], "c2", "q");
  assert.deepEqual(ids(state.items), ["p", "a", "b", "q"]);
});

test("dropItemsInto with a dropped-on ref falls back to the end of the target list", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("p", "c2"), item("hidden", "c2", { archived: true, archivedBy: "list" })]);
  api.dropItemsInto(["a"], "c2", "gone");
  assert.deepEqual(ids(state.items), ["p", "a", "hidden"]);
});

test("restoreItems keeps the restored group in its original order", () => {
  const state = store([list("c1")],
    [item("a", "c1"), item("b", "c1"), item("x", "c1", { archived: true }), item("y", "c1", { archived: true })]);
  api.restoreItems(["x", "y"]);
  assert.deepEqual(ids(state.items), ["x", "y", "a", "b"]);
  assert.deepEqual(withoutArchivedIds(state), ["x", "y", "a", "b"]);
});

test("restoreLists un-archives only the items the list archived", () => {
  const state = store([list("c1"), list("c2", { archived: true })],
    [item("keep", "c1"), item("bylist", "c2", { archived: true, archivedBy: "list" }),
      item("byuser", "c2", { archived: true, archivedBy: "user" })]);
  api.restoreLists(["c2"]);
  assert.deepEqual(ids(state.checklists), ["c2", "c1"]);
  assert.equal(api.findList("c2").archived, false);
  assert.equal(api.findItem("bylist").archived, false);
  assert.equal(api.findItem("byuser").archived, true);
});

test("archivedItems hides items whose checklist is archived too", () => {
  store([list("c1"), list("c2", { archived: true })],
    [item("mine", "c1", { archived: true }), item("bylist", "c1", { archived: true, archivedBy: "list" }),
      item("orphan", "c2", { archived: true })]);
  assert.deepEqual(ids(api.archivedItems()), ["mine"]);
});

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
  assert.deepEqual(api.normalize({ version: 1, ui: { bulk: { kind: "item", checklistId: "c1", ids: ["a"] } } }).ui.bulk,
    { kind: "item", checklistId: "c1", ids: ["a"] });
});

test("normalize returns defaults for anything that is not version 1", () => {
  assert.deepEqual(api.normalize({ version: 2, checklists: [list("c1")] }), api.defaults());
  assert.deepEqual(api.normalize(undefined), api.defaults());
  assert.equal(api.defaults().ui.pageSize, 20);
});

function withoutArchivedIds(state) {
  return ids(api.withoutArchived(state.items, "c1"));
}
