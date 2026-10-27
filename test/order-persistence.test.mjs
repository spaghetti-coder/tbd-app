// Order lives in the order docs alone: rows carry no ordinal, so a round trip through the store has
// to rebuild it. IndexedDB is replaced by maps that return rows in key order, the way getAll does.

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const NAMES = [
  "clamp",
  "PAGE_SIZES",
  "defaults",
  "validBulk",
  "normalize",
  "UI_KEY",
  "orderKey",
  "byOrder",
  "applyOrder",
  "orderValue",
  "dirty",
  "markUi",
  "markDirty",
  "markGone",
  "markOrder",
  "takeBatch",
  "findList",
  "findItem",
  "entityText",
  "setBulk",
  "pruneSelection",
  "removeEntity",
  "archiveChecklistQuiet",
  "moveGroup",
  "joinIndex",
  "withoutArchived",
  "moveItemsTo",
  "dropItemsInto",
  "archiveItemQuiet",
  "restoreLists",
  "restoreItems",
  "visibleChecklists",
];

const api = runInContext(
  ["let state = null;", ...NAMES.map(slice), `({ ${NAMES.join(", ")},`,
    "  get state() { return state; }, set state(value) { state = value; } });"].join("\n"),
  createContext({}),
);

const list = (id, extra) => ({
  id, title: `list ${id}`, expanded: true, createdAt: 1, archived: false, ...extra,
});

const item = (id, checklistId, extra) => ({
  id, checklistId, text: `item ${id}`, done: false, createdAt: 1, archived: false, archivedBy: "user",
  ...extra,
});

const stateOf = (groups) => ({
  version: 1,
  checklists: groups.map(([id]) => list(id)),
  items: groups.flatMap(([id, ids]) => ids.map((itemId) => item(itemId, id))),
  ui: { pageSize: 20, bulk: { kind: null, ids: [] } },
});

// The ids of rows, and of the items of one list, in the order state holds them.
const ids = (rows) => Array.from(rows, (row) => row.id);
const inList = (data, checklistId) => ids(data.items.filter((i) => i.checklistId === checklistId));

const open = () => ({ lists: new Map(), items: new Map(), docs: new Map() });
let db = open();
const copy = (value) => JSON.parse(JSON.stringify(value));

/* What writeBatch would hand the transaction: rows, order docs read out of state, the ui doc, and a
   list's items deleted with it, the way the checklistId index does. */
function flush() {
  const batch = api.takeBatch();
  for (const row of batch.lists) db.lists.set(row.id, copy(row));
  for (const row of batch.items) db.items.set(row.id, copy(row));
  for (const id of batch.order) db.docs.set(api.orderKey(id), [...api.orderValue(id)]);
  if (batch.ui) db.docs.set(api.UI_KEY, copy(api.state.ui));
  for (const id of batch.goneItems) db.items.delete(id);
  for (const id of batch.goneLists) {
    db.lists.delete(id);
    db.docs.delete(api.orderKey(id));
    for (const [itemId, row] of db.items) {
      if (row.checklistId === id) db.items.delete(itemId);
    }
  }
}

/* A fresh page: getAll answers in key order, so the rows come back in no useful order at all. */
function reload() {
  const docs = Object.fromEntries([...db.docs].map(([key, value]) => [key, copy(value)]));
  const read = (rows) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  api.state = api.applyOrder(api.normalize({
    version: 1,
    checklists: read([...db.lists.values()]),
    items: read([...db.items.values()]),
    ui: docs[api.UI_KEY],
  }), docs);
}

/* Everything in state as if this tab had just built it: every row and every order doc marked. */
function seed(groups) {
  db = open();
  api.state = stateOf(groups);
  for (const cl of api.state.checklists) {
    api.markDirty("list", cl.id);
    api.markOrder(cl.id);
  }
  for (const row of api.state.items) api.markDirty("item", row.id);
  api.markOrder("lists");
  api.markUi();
  flush();
}

test("list order and the order inside every list survive the store", () => {
  seed([["l2", ["i9", "i3"]], ["l1", ["i7"]]]);
  reload();
  assert.deepEqual(ids(api.state.checklists), ["l2", "l1"]);
  assert.deepEqual(inList(api.state, "l2"), ["i9", "i3"]);
  assert.deepEqual(inList(api.state, "l1"), ["i7"]);
});

test("moves keep their order across a reload", () => {
  seed([["b", ["i1", "i2", "i3"]], ["a", ["i4"]]]);
  api.moveItemsTo(["i3"], "top");
  api.dropItemsInto(["i2"], "a", "i4");
  api.state.checklists = api.moveGroup(api.state.checklists, ["a"], 0);
  api.markOrder("lists");
  flush();
  reload();
  assert.deepEqual(ids(api.state.checklists), ["a", "b"]);
  assert.deepEqual(inList(api.state, "a"), ["i2", "i4"]);
  assert.deepEqual(inList(api.state, "b"), ["i3", "i1"]);
});

test("a restored row lands where the app put it, not where it was created", () => {
  seed([["b", ["i5", "i6"]], ["a", ["i7"]]]);
  api.archiveItemQuiet("i5");
  flush();
  reload();
  api.restoreItems(["i5"]);
  flush();
  reload();
  assert.deepEqual(inList(api.state, "b"), ["i5", "i6"]);
});

test("a restored list comes back with the items that went into the archive with it", () => {
  seed([["b", ["i1"]], ["a", ["i2"]]]);
  api.archiveChecklistQuiet("a");
  flush();
  reload();
  api.restoreLists(["a"]);
  flush();
  reload();
  assert.deepEqual(ids(api.state.checklists), ["a", "b"]);
  assert.deepEqual(inList(api.state, "a"), ["i2"]);
});

test("deleting a list takes its items and its order doc with it", () => {
  seed([["b", ["i1", "i2"]], ["a", ["i3"]]]);
  api.removeEntity("list", "b");
  flush();
  assert.equal(db.lists.has("b"), false);
  assert.equal(db.items.has("i1"), false);
  assert.equal(db.items.has("i2"), false);
  assert.equal(db.docs.has(api.orderKey("b")), false, "no order doc outlives its list");

  reload();
  assert.deepEqual(ids(api.state.checklists), ["a"]);
  assert.deepEqual(inList(api.state, "a"), ["i3"]);
});

test("rows an order doc does not name come last, in the order they were read", () => {
  const rows = [list("x1"), list("x2"), list("x3")];
  assert.deepEqual(ids(api.byOrder(rows, ["x3", "x1"])), ["x3", "x1", "x2"]);
  assert.deepEqual(ids(api.byOrder(rows, ["x2", "gone", "x1"])), ["x2", "x1", "x3"],
    "an id with no row behind it is ignored");
  assert.deepEqual(ids(api.byOrder(rows, [])), ["x1", "x2", "x3"]);
  assert.deepEqual(ids(api.byOrder(rows, undefined)), ["x1", "x2", "x3"], "a broken doc is no doc");
});

test("without an order doc the read order stands", () => {
  const out = api.applyOrder({ checklists: [list("b"), list("a")], items: [item("i2", "a"), item("i1", "b")] }, {});
  assert.deepEqual(ids(out.checklists), ["b", "a"]);
  assert.deepEqual(ids(out.items), ["i1", "i2"], "items are grouped by their list");
  assert.deepEqual(inList(out, "a"), ["i2"]);
});
