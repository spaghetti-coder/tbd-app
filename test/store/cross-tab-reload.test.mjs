// What one tab does when another writes: flush the pending save, then reload.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list } from "../../testkit/fixtures.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";
import { storeHarness } from "../../testkit/store-fake.mjs";

const idle = () => new Promise(setImmediate);

test("a write from another tab picks up a save still in the debounce", async () => {
  const h = storeHarness();
  h.state([list("c1")], [item("i1", "c1")]);
  h.store.markDirty("item", "i1");
  h.store.queueSave();
  h.echo.send("other");
  await idle();
  assert.equal(h.storage.batches.length, 1, "the pending save went out first");
  assert.deepEqual(h.reloads, [1]);
});

test("a tab with nothing pending reloads without writing", async () => {
  const h = storeHarness();
  h.echo.send("other");
  await idle();
  assert.deepEqual(h.storage.batches, []);
  assert.deepEqual(h.reloads, [1]);
});

test("this tab's own echo is not a write from elsewhere", async () => {
  const h = storeHarness();
  h.echo.send("tab");
  await idle();
  assert.deepEqual(h.reloads, []);
});

test("a write waits for a safe moment, and is acted on when it comes", async () => {
  const safe = { on: false };
  const h = storeHarness({ canReload: () => safe.on });
  h.echo.send("other");
  await idle();
  assert.deepEqual(h.reloads, [], "nothing reloads while something would be interrupted");

  safe.on = true;
  h.store.reloadWhenSafe();
  await idle();
  assert.deepEqual(h.reloads, [1]);
});

test("after reloading for another tab nothing is written back", async () => {
  const h = storeHarness();
  h.state([list("c1")], []);
  h.store.markDirty("list", "c1");
  h.store.queueSave();
  h.echo.send("other");
  await idle();
  const writes = h.storage.batches.length;
  await h.store.flushSave();
  assert.equal(h.storage.batches.length, writes, "a late flush must not put an older state back");
});

// The conditions a reload waits for, on their own.
const safeWhen = ({ editing = null, gesture = null, drag = null, dialogs = false } = {}) =>
  sliceVm(["safeToReload"], {
    state: { ui: { editing } }, gesture, drag, modalOpen: () => dialogs,
  }).safeToReload();

test("a reload waits until nothing on screen would lose work", () => {
  assert.equal(safeWhen(), true);
  assert.equal(safeWhen({ editing: { kind: "item", id: "i1" } }), false, "a typed draft");
  assert.equal(safeWhen({ gesture: {} }), false, "a row gesture under a finger");
  assert.equal(safeWhen({ drag: {} }), false, "a drag in flight");
  assert.equal(safeWhen({ dialogs: true }), false, "an open dialog");
});
