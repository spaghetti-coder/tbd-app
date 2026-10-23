// Unit tests for the pure ordering / repair logic that lives inside index.html.
// The app is a single file with no build, so the functions are sliced out of the
// source by name and evaluated in a VM with a `state` shim.

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { html, slice, sliceObject } from "./html-source.mjs";

const NAMES = [
  "clamp",
  "defaults",
  "validBulk",
  "normalize",
  "moveGroup",
  "refIndex",
  "withoutArchived",
  "findList",
  "findItem",
  "joinIndex",
  "moveItemsTo",
  "dropItemsInto",
  "restoreLists",
  "restoreItems",
  "archivedItems",
  "removeEntity",
  "archiveChecklistQuiet",
  "archiveItemQuiet",
  "archiveMany",
  "deleteMany",
  "actionMessage",
  "bulkOwner",
  "setBulk",
  "unselect",
  "togglePick",
  "startBulk",
  "visibleChecklists",
  "indexOfVisible",
  "pageCount",
  "pagedChecklists",
  "jumpTo",
  "entityText",
  "commitText",
  "cancelEdit",
];

// The sliced functions reach for these at runtime; the harness keeps them out of the way.
const PRELUDE = `
let scrollTarget = null;
let lastToast = null;
const calls = [];
function commit() { calls.push("commit"); }
function queueSave() { calls.push("queueSave"); }
function repaintRow(kind, id) { calls.push("repaintRow:" + kind + ":" + id); }
function showToast(text) { lastToast = text; }
function t(key) { return key; }
`;

const pageSizes = /^const PAGE_SIZES = .*$/m.exec(html);
if (!pageSizes) {
  throw new Error("test harness: PAGE_SIZES not found in index.html (renamed?)");
}

const sandbox = { state: null };
createContext(sandbox);
runInContext(
  [pageSizes[0], PRELUDE, ...NAMES.map(slice),
    `this.api = { ${NAMES.join(", ")} };`,
    "this.scrollTargetOf = () => scrollTarget;",
    "this.toastOf = () => lastToast;",
    "this.calls = () => calls.join(",");",
    "this.resetCalls = () => { calls.length = 0; }",
  ].join("\n"),
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

// Objects built inside the VM have that realm's prototypes, so compare plain copies of their fields.
const plainBulk = (bulk) => ({ kind: bulk.kind, checklistId: bulk.checklistId, ids: Array.from(bulk.ids) });
const plainTarget = (target) => (target ? { kind: target.kind, id: target.id } : target);

const rows = (...ids) => ids.map((id) => ({ id }));
// Array.from, not map: the rows come from the VM realm and map() would keep that realm's Array.prototype.
const ids = (rows2) => Array.from(rows2, (row) => row.id);

const store = (checklists, items, ui) => {
  sandbox.resetCalls();
  sandbox.state = {
    checklists,
    items,
    ui: {
      pageSize: 20,
      page: 1,
      panel: { side: "right", topPct: 0.35, collapsed: false },
      bulk: { kind: null, checklistId: null, ids: [] },
      ...ui,
    },
  };
  return sandbox.state;
};

test("clamp keeps a value inside the range it is given", () => {
  assert.equal(api.clamp(5, 0, 10), 5);
  assert.equal(api.clamp(-5, 0, 10), 0);
  assert.equal(api.clamp(50, 0, 10), 10);
  assert.equal(api.clamp(0.4, 0, 1), 0.4);
});

test("joinIndex joins the first peer, the last one, or the end when there are none", () => {
  const [a, b, c] = rows("a", "b", "c");
  const rest = [a, b, c];
  assert.equal(api.joinIndex(rest, [a, b], false), 0, "before the first peer");
  assert.equal(api.joinIndex(rest, [a, b], true), 2, "after the last peer");
  assert.equal(api.joinIndex(rest, [], false), 3, "no peers: the end of the array");
  assert.equal(api.joinIndex(rest, [], true), 3);
});

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

test("refIndex falls back to the row before the gap, so a drop at the end of a page stays on it", () => {
  const all = rows("1", "2", "3", "4", "5", "6", "7");
  assert.equal(api.refIndex(all, ["3", "7"], "4", "1"), 2, "the row after the gap wins");
  assert.equal(api.refIndex(all, ["3", "7"], null, "5"), 4);
  assert.equal(api.refIndex(all, ["3", "7"], "gone", "6"), 5);
  assert.equal(api.refIndex(all, ["3", "7"], null, "gone"), 5, "neither side: the end of the list");
  assert.equal(api.refIndex(all, ["3", "7"], null), 5, "3-argument calls keep the old behaviour");
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

test("dropItemsInto re-scopes the selection to the list the group landed in", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  state.ui.bulk = { kind: "item", checklistId: "c1", ids: ["a", "b"] };
  api.dropItemsInto(["a", "b"], "c2", null);
  assert.deepEqual(state.ui.bulk, { kind: "item", checklistId: "c2", ids: ["a", "b"] });
});

test("dropItemsInto leaves the scope alone for a drag outside the selection", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  state.ui.bulk = { kind: "item", checklistId: "c1", ids: ["a", "b"] };
  api.dropItemsInto(["p"], "c1", null);
  assert.equal(state.ui.bulk.checklistId, "c1");
  const plain = store([list("c1"), list("c2")], [item("a", "c1"), item("p", "c2")]);
  api.dropItemsInto(["a"], "c2", null);
  assert.deepEqual(plain.ui.bulk, { kind: null, checklistId: null, ids: [] });
});

test("deleteMany removes a checklist with its items and ends the selection", () => {
  const state = store([list("c1"), list("c2")], [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  state.ui.bulk = { kind: "list", checklistId: null, ids: ["c1"] };
  api.deleteMany("list", ["c1"]);
  assert.deepEqual(ids(state.checklists), ["c2"]);
  assert.deepEqual(ids(state.items), ["p"], "the items of a deleted checklist go with it");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: null, checklistId: null, ids: [] });
  assert.equal(sandbox.toastOf(), "toast_deleted");
});

test("deleteMany of items leaves the rows that were not picked", () => {
  const state = store([list("c1")], [item("a", "c1"), item("b", "c1"), item("c", "c1")]);
  state.ui.bulk = { kind: "item", checklistId: "c1", ids: ["a", "c"] };
  api.deleteMany("item", ["a", "c"]);
  assert.deepEqual(ids(state.items), ["b"]);
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: null, checklistId: null, ids: [] }, "emptying it ends bulk");
});

test("archiveMany marks lists as list-archived and items as user-archived", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c2"), item("kept", "c2", { archived: true, archivedBy: "user" })]);
  state.ui.bulk = { kind: "list", checklistId: null, ids: ["c1", "c2"] };
  api.archiveMany("list", ["c1", "c2"]);
  assert.deepEqual([api.findList("c1").archived, api.findList("c2").archived], [true, true]);
  assert.equal(api.findItem("a").archivedBy, "list");
  assert.equal(api.findItem("b").archivedBy, "list");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: null, checklistId: null, ids: [] });
  assert.equal(sandbox.toastOf(), "toast_archived");
  state.ui.bulk = { kind: "item", checklistId: "c2", ids: ["b", "kept"] };
  api.archiveMany("item", ["b", "kept"]);
  assert.equal(api.findItem("b").archived, true);
  assert.equal(api.findItem("b").archivedBy, "user");
  assert.equal(api.findList("c2").archived, true, "the checklist stays archived");
});

test("unselect clears a selection whose checklist is gone and drops a stale id otherwise", () => {
  const state = store([list("c1"), list("c2")], [item("a", "c1"), item("b", "c1")]);
  state.ui.bulk = { kind: "item", checklistId: "c1", ids: ["a", "b"] };
  api.unselect("c1");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: null, checklistId: null, ids: [] });
  state.ui.bulk = { kind: "item", checklistId: "c2", ids: ["a", "b"] };
  api.unselect("a");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: "item", checklistId: "c2", ids: ["b"] });
  api.unselect("gone");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: "item", checklistId: "c2", ids: ["b"] });
  api.unselect("b");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: null, checklistId: null, ids: [] });
});

test("togglePick scopes an item selection to one checklist and re-scopes when it restarts", () => {
  const state = store([list("c1"), list("c2")],
    [item("a", "c1"), item("b", "c1"), item("p", "c2")]);
  api.togglePick("item", "a");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: "item", checklistId: "c1", ids: ["a"] });
  api.togglePick("item", "b");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: "item", checklistId: "c1", ids: ["a", "b"] });
  api.togglePick("item", "a");
  api.togglePick("item", "b");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: null, checklistId: null, ids: [] }, "emptying it ends bulk");
  api.togglePick("item", "p");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: "item", checklistId: "c2", ids: ["p"] });
  api.togglePick("list", "c1");
  assert.deepEqual(plainBulk(state.ui.bulk), { kind: "list", checklistId: null, ids: ["c1"] });
});

test("pageCount rounds up, never drops below one page and ignores totals for \"all\"", () => {
  const state = store([], []);
  state.ui.pageSize = 20;
  assert.equal(api.pageCount(0), 1);
  assert.equal(api.pageCount(20), 1);
  assert.equal(api.pageCount(21), 2);
  state.ui.pageSize = "all";
  assert.equal(api.pageCount(999), 1);
});

test("pagedChecklists pages the visible checklists and clamps the page index", () => {
  const state = store(
    [list("c1"), list("c2", { archived: true }), list("c3"), list("c4"), list("c5")], [], { pageSize: 2 });
  assert.deepEqual(ids(api.pagedChecklists()), ["c1", "c3"]);
  state.ui.page = 2;
  assert.deepEqual(ids(api.pagedChecklists()), ["c4", "c5"]);
  state.ui.page = 9;
  assert.deepEqual(ids(api.pagedChecklists()), ["c4", "c5"], "past the last page shows the last page");
  state.ui.page = 0;
  assert.deepEqual(ids(api.pagedChecklists()), ["c1", "c3"]);
  state.ui.pageSize = "all";
  assert.deepEqual(ids(api.pagedChecklists()), ["c1", "c3", "c4", "c5"]);
});

test("jumpTo moves to the page that holds the checklist", () => {
  const state = store([list("c1"), list("c2"), list("c3"), list("c4"), list("c5")], [], { pageSize: 2, page: 1 });
  api.jumpTo("c1");
  assert.equal(state.ui.page, 1);
  assert.deepEqual(plainTarget(sandbox.scrollTargetOf()), { kind: "list", id: "c1" });
  api.jumpTo("c4");
  assert.equal(state.ui.page, 2);
  api.jumpTo("c5");
  assert.equal(state.ui.page, 3);
  state.ui.pageSize = "all";
  state.ui.page = 1;
  api.jumpTo("c5");
  assert.equal(state.ui.page, 1, "\"all\" has no pages to move");
  api.jumpTo("gone");
  assert.equal(state.ui.page, 1, "an unknown id changes nothing");
});

test("restoreItems keeps the restored group in its original order", () => {
  const state = store([list("c1")],
    [item("a", "c1"), item("b", "c1"), item("x", "c1", { archived: true }), item("y", "c1", { archived: true })]);
  api.restoreItems(["x", "y"]);
  assert.deepEqual(ids(state.items), ["x", "y", "a", "b"]);
  assert.deepEqual(withoutArchivedIds(state), ["x", "y", "a", "b"]);
});

test("restoreItems appends to a checklist that has no live items left", () => {
  const state = store([list("c1"), list("c2")], [item("keep", "c2"), item("x", "c1", { archived: true })]);
  api.restoreItems(["x"]);
  assert.deepEqual(ids(state.items), ["keep", "x"]);
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
  assert.deepEqual(plainBulk(api.normalize({ version: 1, ui: { bulk: { kind: "item", checklistId: "c1", ids: "abc" } } }).ui.bulk),
    { kind: null, checklistId: null, ids: [] }, "ids has to be a list");
  assert.deepEqual(plainBulk(api.normalize({ version: 1, ui: { bulk: { kind: "list" } } }).ui.bulk),
    { kind: null, checklistId: null, ids: [] });
  assert.equal(api.normalize({ version: 1 }).ui.panel.collapsed, false, "panel starts expanded");
  assert.equal(api.normalize({ version: 1, ui: { panel: { side: "left", topPct: 0.5, collapsed: true } } }).ui.panel.collapsed, true);
  assert.equal(api.normalize({ version: 1, ui: { panel: { collapsed: "yes" } } }).ui.panel.collapsed, false);
  assert.equal(api.normalize({ version: 1, ui: { panel: { collapsed: 1 } } }).ui.panel.collapsed, false);
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

test("a renamed entity is saved and only its row is repainted", () => {
  const state = store([list("c1", { title: "old" })], [item("i1", "c1", { text: "old" })]);
  api.commitText("list", "c1", "  Groceries  ");
  assert.equal(state.checklists[0].title, "Groceries");
  assert.equal(state.ui.editing, null);
  assert.equal(sandbox.calls(), "queueSave,repaintRow:list:c1");

  sandbox.resetCalls();
  api.commitText("item", "i1", "Milk");
  assert.equal(state.items[0].text, "Milk");
  assert.equal(state.ui.editing, null);
  assert.equal(sandbox.calls(), "queueSave,repaintRow:item:i1");
});

test("committing an empty name rolls a named entity back", () => {
  const state = store([list("c1", { title: "old" })], [item("i1", "c1", { text: "old" })], { editing: { kind: "item", id: "i1" } });
  api.commitText("item", "i1", "   ");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].text, "old");
  assert.equal(state.ui.editing, null);
  assert.equal(sandbox.calls(), "commit");
});

test("committing an empty name discards a new checklist with its items", () => {
  const state = store([list("c1", { title: "" }), list("c2")], [item("i1", "c1"), item("i2", "c2")], { editing: { kind: "list", id: "c1" } });
  api.commitText("list", "c1", "");
  assert.deepEqual(ids(state.checklists), ["c2"]);
  assert.deepEqual(ids(state.items), ["i2"]);
  assert.equal(state.ui.editing, null);
  assert.equal(sandbox.calls(), "commit");
});

test("cancelling discards a new entity and keeps a named one", () => {
  const fresh = store([list("c1", { title: "" })], [item("i1", "c1", { text: "" })], { editing: { kind: "item", id: "i1" } });
  api.cancelEdit();
  assert.deepEqual(ids(fresh.items), []);
  assert.equal(fresh.ui.editing, null);
  assert.equal(sandbox.calls(), "commit");

  const named = store([list("c1", { title: "keep" })], [], { editing: { kind: "list", id: "c1" } });
  api.cancelEdit();
  assert.deepEqual(ids(named.checklists), ["c1"]);
  assert.equal(named.checklists[0].title, "keep");
  assert.equal(named.ui.editing, null);
});

test("normalize returns defaults for anything that is not version 1", () => {
  assert.deepEqual(api.normalize({ version: 2, checklists: [list("c1")] }), api.defaults());
  assert.deepEqual(api.normalize(undefined), api.defaults());
  assert.equal(api.defaults().ui.pageSize, 20);
});

function withoutArchivedIds(state) {
  return ids(api.withoutArchived(state.items, "c1"));
}

// The dictionaries are literals in the file; they are evaluated in their own box so the tests can read them.
function dictionaries() {
  const box = {};
  createContext(box);
  runInContext([sliceObject("EN"), sliceObject("DICTS"), "this.dicts = DICTS;"].join("\n"), box);
  return box.dicts;
}

test("actionMessage names the confirmation key for kind, count and verb", () => {
  for (const kind of ["list", "item"]) {
    for (const verb of ["archive", "delete"]) {
      assert.equal(api.actionMessage(kind, 1, verb), `c_${verb}_${kind}`);
      assert.equal(api.actionMessage(kind, 2, verb), `c_${verb}_${kind}s`);
    }
  }
});

test("every dictionary holds the eight confirmation keys actionMessage builds", () => {
  const wanted = [];
  for (const kind of ["list", "item"]) {
    for (const verb of ["archive", "delete"]) {
      wanted.push(`c_${verb}_${kind}`, `c_${verb}_${kind}s`);
    }
  }
  for (const [code, dict] of Object.entries(dictionaries())) {
    for (const key of wanted) {
      assert.ok(typeof dict[key] === "string" && dict[key].length > 0, `"${code}" has no "${key}"`);
    }
  }
});

test("every dictionary defines exactly the keys EN defines", () => {
  const dicts = dictionaries();
  const en = Object.keys(dicts.en).sort();
  assert.ok(en.length > 50, "EN dictionary looks truncated");
  for (const [code, dict] of Object.entries(dicts)) {
    assert.deepEqual(Object.keys(dict).sort(), en, `dictionary "${code}" is out of sync with EN`);
  }
});

// The builders take the icon name only, so a missing map entry means a button with no fallback glyph.
test("every icon the button builders are called with has a fallback glyph", () => {
  const box = {};
  createContext(box);
  runInContext([sliceObject("GLYPHS"), "this.glyphs = GLYPHS;"].join("\n"), box);
  const glyphs = box.glyphs;

  const used = new Set();
  for (const call of html.matchAll(/(?:^|[^.\w])(?:panelButton|menuItem|act)\(\s*([^,)]*)/g)) {
    for (const icon of call[1].matchAll(/"([a-z-]+)"/g)) {
      used.add(icon[1]);
    }
  }
  assert.ok(used.size >= 10, `the call scan found only ${used.size} icons; the regex is out of date`);
  for (const icon of used) {
    assert.equal(typeof glyphs[icon], "string", `"${icon}" has no fallback glyph`);
  }
});

test("every dictionary interpolates the same placeholders as EN", () => {
  const dicts = dictionaries();
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [code, dict] of Object.entries(dicts)) {
    for (const key of Object.keys(dicts.en)) {
      assert.deepEqual(placeholders(dict[key]), placeholders(dicts.en[key]),
        `dictionary "${code}" key "${key}" placeholders differ from EN`);
    }
  }
});
