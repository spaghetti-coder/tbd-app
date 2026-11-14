// The save pipeline: what the marks turn into, and when they go out.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list, plain } from "../../testkit/fixtures.mjs";
import { storeHarness } from "../../testkit/store-fake.mjs";

const idle = () => new Promise(setImmediate);

test("a save with nothing dirty leaves the store alone", async () => {
  const { store, storage, echo } = storeHarness();
  await store.flushSave();
  assert.deepEqual(storage.batches, [], "no marks, no transaction");
  assert.deepEqual(echo.posts, [], "no echo to the other tabs");
});

test("a save carries the marked rows, the order docs the state implies, and a ui doc with only the query", async () => {
  const h = storeHarness();
  const state = h.state([list("c1", { title: "l" })], [item("i1", "c1")],
    { search: { text: "milk", lists: false, items: true } });
  h.store.markDirty("item", "i1");
  h.store.markUi();
  await h.store.flushSave();
  const [batch] = h.storage.batches;
  assert.deepEqual(ids(batch.items), ["i1"]);
  assert.deepEqual(plain(batch.docs), [
    { key: "order:lists", value: ["c1"] },
    { key: "order:c1", value: ["i1"] },
    { key: "ui", value: { ...state.ui, search: { text: "milk" } } },
  ]);
  assert.deepEqual(h.echo.posts, ["tab"], "the other tabs hear about the write");
});

test("a queued save writes once, when its debounce fires", async () => {
  const h = storeHarness();
  h.state([list("c1")], []);
  h.store.queueSave();
  assert.equal(h.storage.batches.length, 0);
  h.clock.run();
  await idle();
  assert.equal(h.storage.batches.length, 1);
});

test("flushing writes now and drops the queued one", async () => {
  const h = storeHarness();
  h.state([list("c1")], []);
  h.store.queueSave();
  await h.store.flushSave();
  assert.equal(h.storage.batches.length, 1);
  h.clock.run();
  assert.equal(h.storage.batches.length, 1, "the dropped save never wrote");
});

test("a rejected write is reported once and stays queued", async () => {
  const h = storeHarness();
  h.state([list("c1")], [item("i1", "c1")]);
  h.storage.fail(true);
  h.store.markDirty("item", "i1");
  await h.store.flushSave();
  h.storage.fail(false);
  assert.equal(h.storage.batches.length, 1);
  assert.deepEqual(h.errors, ["storage_error"]);

  await h.store.flushSave();
  assert.deepEqual(ids(h.storage.batches[1].items), ["i1"], "the failed batch went out again");
});

test("one write runs at a time, and an edit made during it goes out as soon as it closes", async () => {
  const h = storeHarness();
  h.state([list("c1")], [item("i1", "c1")]);
  h.storage.hold(true);
  const first = h.store.flushSave();
  h.store.markDirty("item", "i1");
  const second = h.store.flushSave();
  assert.equal(h.storage.batches.length, 1, "the second save waits for the open transaction");
  assert.deepEqual(plain(h.storage.batches[0].docs), [
    { key: "order:lists", value: ["c1"] },
    { key: "order:c1", value: ["i1"] },
  ], "the open transaction took the order it started with");

  h.storage.release();
  await first;
  assert.equal(h.storage.batches.length, 2, "the queued edit goes out next, no timer");
  assert.deepEqual(ids(h.storage.batches[1].items), ["i1"]);
  h.storage.release();
  await second;
  h.storage.hold(false);
});

test("a flush running into an open write waits until its own batch landed", async () => {
  const h = storeHarness();
  h.state([list("c1")], []);
  h.storage.hold(true);
  h.store.markDirty("list", "c1");
  const first = h.store.flushSave();
  h.store.markUi();
  const second = h.store.flushSave();
  let landed = false;
  second.then(() => {
    landed = true;
  });
  assert.equal(h.storage.batches.length, 1, "the queued write has not started");
  assert.equal(landed, false, "the flush does not report early");

  h.storage.release();
  await first;
  assert.equal(landed, false, "the flush still waits for that transaction");
  h.storage.release();
  await second;
  assert.equal(landed, true, "the flush returns once the batch is in the store");
  h.storage.hold(false);
});

test("a gone list takes its order doc with it", async () => {
  const h = storeHarness();
  h.state([list("c1")], [item("i1", "c1")]);
  h.store.markGone("item", "i1");
  h.store.markGone("list", "c1");
  await h.store.flushSave();
  const [batch] = h.storage.batches;
  assert.deepEqual(plain([batch.goneChecklists, batch.goneItems, batch.goneDocs]),
    [["c1"], ["i1"], ["order:c1"]]);
});

test("erase clears the store and stops this tab writing back", async () => {
  const h = storeHarness();
  h.state([list("c1")], []);
  h.store.markDirty("list", "c1");
  await h.store.erase();
  assert.equal(h.storage.seen.cleared, 1);
  await h.store.flushSave();
  assert.deepEqual(h.storage.batches, [], "a wiped tab writes nothing back");
});

test("a broken store is reported and gives an empty app", async () => {
  const h = storeHarness();
  h.storage.fail(true);
  const state = await h.store.load();
  assert.deepEqual(ids(state.checklists), []);
  assert.deepEqual(h.errors, ["storage_error"]);
});

test("a store that will not open writes nothing at all", async () => {
  const h = storeHarness();
  h.storage.fail(true);
  await h.store.load();
  h.store.markDirty("list", "c1");
  h.store.queueSave();
  h.clock.run();
  await idle();
  assert.deepEqual(h.storage.batches, [], "no transaction after the store failed to open");
});

test("an empty demo stand is seeded before it is read", async () => {
  const h = storeHarness({ demo: true });
  await h.store.load();
  assert.equal(h.storage.seen.seeded.length, 1, "a stand never starts empty");
});
