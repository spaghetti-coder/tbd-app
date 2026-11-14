// The save pipeline: what state owes the disk.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list, plain } from "../../testkit/fixtures.mjs";
import { storeHarness } from "../../testkit/store-fake.mjs";

const idle = () => new Promise(setImmediate);

// Disk -> state: nothing owed.
const booted = async (rows = {}, extra = {}) => {
  const h = storeHarness({ disk: rows, ...extra });
  await h.load();
  return h;
};

test("a save with nothing owed leaves the store alone", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  await h.store.flushSave();
  assert.deepEqual(h.storage.batches, [], "nothing changed, no transaction");
  assert.deepEqual(h.echo.posts, [], "no echo to the other tabs");
});

test("a save carries the rows the disk has never seen, the order they imply, and a ui doc with only the query", async () => {
  const h = storeHarness();
  const state = h.state([list("c1", { title: "l" })], [item("i1", "c1")],
    { search: { text: "milk", lists: false, items: true } });
  await h.store.flushSave();
  const [batch] = h.storage.batches;
  assert.deepEqual(ids(batch.checklists), ["c1"]);
  assert.deepEqual(ids(batch.items), ["i1"]);
  assert.deepEqual(plain(batch.docs), [
    { key: "order:lists", value: ["c1"] },
    { key: "order:c1", value: ["i1"] },
    { key: "ui", value: { ...state.ui, search: { text: "milk" }, bulk: { kind: null, ids: [] } } },
  ]);
  assert.deepEqual(h.echo.posts, ["tab"], "the other tabs hear about the write");
});

test("a changed row goes out, the rows that did not change stay home", async () => {
  const h = await booted({ checklists: [list("c1"), list("c2")], items: [item("i1", "c1"), item("i2", "c2")] });
  h.edit("item", "i1", { done: true });
  await h.store.flushSave();
  const [batch] = h.storage.batches;
  assert.deepEqual(ids(batch.items), ["i1"]);
  assert.deepEqual(ids(batch.checklists), [], "untouched lists owe nothing");
});

test("a row deleted before it was ever written leaves nothing owed", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  const state = h.current();
  state.items = [...state.items, item("i2", "c1")];
  state.items = state.items.filter((row) => row.id !== "i2");
  await h.store.flushSave();
  assert.deepEqual(h.storage.batches, [], "a row that never landed is not a deletion");
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

test("a rejected write is reported once and stays owed", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  h.storage.fail(true);
  h.edit("item", "i1", { done: true });
  await h.store.flushSave();
  h.storage.fail(false);
  assert.equal(h.storage.batches.length, 1);
  assert.deepEqual(h.errors, ["storage_error"]);

  await h.store.flushSave();
  assert.deepEqual(ids(h.storage.batches[1].items), ["i1"], "the failed row went out again");
});

test("one write runs at a time, and a change made during it goes out as soon as it closes", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  h.storage.hold(true);
  h.edit("item", "i1", { done: true });
  const first = h.store.flushSave();
  h.edit("item", "i1", { text: "renamed" });
  const second = h.store.flushSave();
  assert.equal(h.storage.batches.length, 1, "the second save waits for the open transaction");
  assert.deepEqual(plain(h.storage.batches[0].docs), [], "the row alone was owed");

  h.storage.release();
  await first;
  assert.equal(h.storage.batches.length, 2, "the owed change goes out next, no timer");
  assert.deepEqual(ids(h.storage.batches[1].items), ["i1"]);
  assert.equal(h.storage.batches[1].items[0].text, "renamed", "the latest state");
  h.storage.release();
  await second;
  h.storage.hold(false);
});

test("a row deleted while its own write is open is removed once that write lands", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  const state = h.current();
  h.storage.hold(true);
  state.items = [...state.items, item("i2", "c1")];
  const first = h.store.flushSave();
  state.items = state.items.filter((row) => row.id !== "i2");
  const second = h.store.flushSave();
  assert.equal(h.storage.batches.length, 1, "the delete cannot be judged yet");

  h.storage.release();
  await first;
  assert.deepEqual(plain(h.storage.batches[1].goneItems), ["i2"], "delete goes out after the add lands");
  h.storage.release();
  await second;
  const disk = await h.storage.readAll();
  assert.deepEqual(ids(disk.items), ["i1"], "no zombie row survives");
  assert.deepEqual(plain(disk.docs["order:c1"]), ["i1"], "and its order doc does not name it");
  h.storage.hold(false);
});

test("a flush running into an open write waits until its own batch landed", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  h.storage.hold(true);
  h.edit("item", "i1", { done: true });
  const first = h.store.flushSave();
  h.edit("item", "i1", { text: "renamed" });
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
  assert.equal(landed, true, "the batch landed");
  h.storage.hold(false);
});

test("a gone list takes its rows and its order doc with it", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  const state = h.current();
  state.checklists = [];
  state.items = [];
  await h.store.flushSave();
  const [batch] = h.storage.batches;
  assert.deepEqual(plain([batch.goneChecklists, batch.goneItems, batch.goneDocs]),
    [["c1"], ["i1"], ["order:c1"]]);
});

test("the ui doc goes out only when it differs", async () => {
  const h = await booted({ checklists: [list("c1")], items: [item("i1", "c1")] });
  const state = h.current();
  const uiDocOf = (batch) => batch.docs.find((doc) => doc.key === "ui");
  h.edit("item", "i1", { done: true });
  await h.store.flushSave();
  assert.equal(uiDocOf(h.storage.batches[0]), undefined, "settings unchanged, no ui doc in the batch");

  state.ui.theme = "dark";
  await h.store.flushSave();
  const doc = uiDocOf(h.storage.batches[1]);
  assert.equal(doc.value.theme, "dark");
  assert.deepEqual(plain(doc.value.search), { text: "" }, "only the query text outlives the tab");
  assert.deepEqual(plain(doc.value.bulk), { kind: null, ids: [] });
});

test("erase clears the store and stops this tab writing back", async () => {
  const h = await booted({ checklists: [list("c1")], items: [] });
  h.edit("list", "c1", { title: "renamed" });
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
  h.state([list("c1")], []);
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
