// Order lives in the order docs alone: rows carry no ordinal, so a round trip has to rebuild it.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list, plain } from "../../testkit/fixtures.mjs";
import { storeHarness } from "../../testkit/store-fake.mjs";

const ACTIONS = [
  "removeEntity", "pruneSelection", "setBulk", "restore", "moveItemsTo", "moveGroup", "joinIndex", "clamp",
  "dropItemsInto", "archiveItemQuiet", "archiveChecklistQuiet", "findList", "findItem", "entityText",
  "withoutArchived",
];

const harness = () => storeHarness({ actions: ACTIONS });

// The ids of the items of one list, in the order state holds them.
const inList = (state, checklistId) => ids(state.items.filter((i) => i.checklistId === checklistId));

/* Everything in state as this tab itself wrote it: after this the order is on disk and the store knows it. */
async function seed(h, groups) {
  const state = h.state(groups.map(([id]) => list(id)),
    groups.flatMap(([id, rowIds]) => rowIds.map((itemId) => item(itemId, id))));
  for (const cl of state.checklists) h.store.markDirty("list", cl.id);
  for (const row of state.items) h.store.markDirty("item", row.id);
  h.store.markUi();
  await h.store.flushSave();
}

const reload = async (h) => h.setState(await h.store.load());

test("list order and the order inside every list survive the store", async () => {
  const h = harness();
  await seed(h, [["l2", ["i9", "i3"]], ["l1", ["i7"]]]);
  await reload(h);
  assert.deepEqual(ids(h.current().checklists), ["l2", "l1"]);
  assert.deepEqual(inList(h.current(), "l2"), ["i9", "i3"]);
  assert.deepEqual(inList(h.current(), "l1"), ["i7"]);
});

test("moves keep their order across a reload", async () => {
  const h = harness();
  await seed(h, [["b", ["i1", "i2", "i3"]], ["a", ["i4"]]]);
  h.actions.moveItemsTo(["i3"], "top");
  h.actions.dropItemsInto(["i2"], "a", "i4");
  h.setState({ ...h.current(), checklists: h.actions.moveGroup(h.current().checklists, ["a"], 0) });
  await h.store.flushSave();
  await reload(h);
  assert.deepEqual(ids(h.current().checklists), ["a", "b"]);
  assert.deepEqual(inList(h.current(), "a"), ["i2", "i4"]);
  assert.deepEqual(inList(h.current(), "b"), ["i3", "i1"]);
});

test("a restored row lands where the app put it, not where it was created", async () => {
  const h = harness();
  await seed(h, [["b", ["i5", "i6"]], ["a", ["i7"]]]);
  h.actions.archiveItemQuiet("i5");
  await h.store.flushSave();
  await reload(h);
  h.actions.restore("item", ["i5"]);
  await h.store.flushSave();
  await reload(h);
  assert.deepEqual(inList(h.current(), "b"), ["i5", "i6"]);
});

test("a restored list comes back with the items that went into the archive with it", async () => {
  const h = harness();
  await seed(h, [["b", ["i1"]], ["a", ["i2"]]]);
  h.actions.archiveChecklistQuiet("a");
  await h.store.flushSave();
  await reload(h);
  h.actions.restore("list", ["a"]);
  await h.store.flushSave();
  await reload(h);
  assert.deepEqual(ids(h.current().checklists), ["a", "b"]);
  assert.deepEqual(inList(h.current(), "a"), ["i2"]);
});

test("deleting a list takes its items and its order doc with it", async () => {
  const h = harness();
  await seed(h, [["b", ["i1", "i2"]], ["a", ["i3"]]]);
  h.actions.removeEntity("list", "b");
  await h.store.flushSave();
  const after = await h.storage.readAll();
  assert.deepEqual(ids(after.checklists), ["a"]);
  assert.deepEqual(ids(after.items), ["i3"], "the rows of a deleted list leave the store");
  assert.equal(after.docs["order:b"], undefined, "no order doc outlives its list");

  await reload(h);
  assert.deepEqual(ids(h.current().checklists), ["a"]);
  assert.deepEqual(inList(h.current(), "a"), ["i3"]);
});

test("a move within a list writes its order doc and no rows", async () => {
  const h = harness();
  await seed(h, [["c1", ["a", "b"]], ["c2", ["p"]]]);
  h.actions.moveItemsTo(["b"], "top");
  await h.store.flushSave();
  const batch = h.storage.batches.at(-1);
  assert.deepEqual(ids(batch.items), [], "no row changed, so no row goes out");
  assert.deepEqual(plain(batch.docs), [{ key: "order:c1", value: ["b", "a"] }]);
});

test("a drop into another list writes both order docs and only the row that moved", async () => {
  const h = harness();
  await seed(h, [["c1", ["a", "x"]], ["c2", ["p"]]]);
  h.actions.dropItemsInto(["a"], "c2", null);
  await h.store.flushSave();
  const batch = h.storage.batches.at(-1);
  assert.deepEqual(ids(batch.items), ["a"], "the moved row goes out: its list changed");
  assert.deepEqual(plain(batch.docs), [
    { key: "order:c1", value: ["x"] },
    { key: "order:c2", value: ["p", "a"] },
  ]);
});

test("a row that only changed its text writes no order doc", async () => {
  const h = harness();
  await seed(h, [["c1", ["a"]]]);
  h.current().items[0].text = "renamed";
  h.store.markDirty("item", "a");
  await h.store.flushSave();
  const batch = h.storage.batches.at(-1);
  assert.deepEqual(ids(batch.items), ["a"]);
  assert.deepEqual(plain(batch.docs), [], "the order did not move");
});

test("a write that failed to land leaves the order still owed", async () => {
  const h = harness();
  await seed(h, [["c1", ["a", "b"]]]);
  h.actions.moveItemsTo(["b"], "top");
  h.storage.fail(true);
  await h.store.flushSave().catch(() => {});
  h.storage.fail(false);
  await h.store.flushSave();
  assert.deepEqual(plain(h.storage.batches.at(-1).docs), [{ key: "order:c1", value: ["b", "a"] }],
    "the rejected write did not talk the store out of the change");
});

test("a move made while a write is open still reaches the store", async () => {
  const h = harness();
  await seed(h, [["c1", ["a", "b", "c"]]]);
  h.storage.hold(true);
  h.actions.moveItemsTo(["c"], "top");
  const first = h.store.flushSave();
  h.actions.moveItemsTo(["b"], "top");
  const second = h.store.flushSave();
  h.storage.release();
  await first;
  h.storage.release();
  await second;
  h.storage.hold(false);
  await reload(h);
  assert.deepEqual(inList(h.current(), "c1"), ["b", "c", "a"],
    "the order on disk is the order the user last saw, not the one the open write carried");
});

test("a list that lost its last item loses its order doc too", async () => {
  const h = harness();
  await seed(h, [["c1", ["a", "b"]], ["c2", ["p"]]]);
  h.actions.removeEntity("item", "a");
  h.actions.removeEntity("item", "b");
  await h.store.flushSave();
  const docs = plain((await h.storage.readAll()).docs);
  assert.equal(docs["order:c1"], undefined, "a list with no rows leaves no order behind");
  assert.deepEqual(docs["order:c2"], ["p"], "the lists that still have rows keep theirs");
});

test("rows an order doc does not name come last, in the order they were read", () => {
  const h = harness();
  const rows = [list("x1"), list("x2"), list("x3")];
  assert.deepEqual(ids(h.api.byOrder(rows, ["x3", "x1"])), ["x3", "x1", "x2"]);
  assert.deepEqual(ids(h.api.byOrder(rows, ["x2", "gone", "x1"])), ["x2", "x1", "x3"]);
});
