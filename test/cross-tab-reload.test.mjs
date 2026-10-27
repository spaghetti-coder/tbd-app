// What one tab does when another writes: flush the pending save, then reload.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";

const { maybeReload: reload, start, stopSaving, externalWrite, calls } = vm([
  "let saveTimer = 0;",
  "let stopSaving = false;",
  "let externalWrite = false;",
  "let isSafe = true;",
  "const calls = [];",
  "function safeToReload() { return isSafe; }",
  "function flushSave() { calls.push(\"flush\"); saveTimer = 0; return Promise.resolve(); }",
  "const location = { reload() { calls.push(\"reload\"); } };",
  slice("maybeReload"),
  "({",
  "  maybeReload,",
  "  start: (pending, written, safe) => {",
  "    saveTimer = pending ? 1 : 0;",
  "    stopSaving = false;",
  "    externalWrite = written;",
  "    isSafe = safe;",
  "    calls.length = 0;",
  "  },",
  "  stopSaving: () => stopSaving,",
  "  externalWrite: () => externalWrite,",
  "  calls: () => calls.join(\",\"),",
  "});",
]);

test("a write from another tab picks up a save still in the debounce", async () => {
  start(true, true, true);
  await reload();
  assert.equal(calls(), "flush,reload");
  assert.equal(stopSaving(), true, "the reload must not flush an older state back");
  assert.equal(externalWrite(), false, "the write is consumed");
});

test("a tab with nothing pending reloads without writing", async () => {
  start(false, true, true);
  await reload();
  assert.equal(calls(), "reload");
  assert.equal(stopSaving(), true);
});

test("an incoming write is left alone while a reload would interrupt something", async () => {
  start(true, false, true);
  await reload();
  assert.equal(calls(), "", "nothing was written elsewhere");
  assert.equal(externalWrite(), false);

  start(true, true, false);
  await reload();
  assert.equal(calls(), "", "the write waits for a safe moment");
  assert.equal(externalWrite(), true);
});

// The writing half of the same rule: the dirty sets hold the batch until a transaction takes it,
// and a transaction that fails puts the batch back. `writeBatch` stands in for IndexedDB.

const pending = new Map();
let nextId = 0;
let written = [];
let failing = false;
let held = false;
let releases = [];

const writeBatch = (batch) => {
  written.push(batch);
  if (failing) return Promise.reject(new Error("quota"));
  return held ? new Promise((done) => { releases.push(done); }) : Promise.resolve();
};

const { queueSave, flushSave, markDirty, markOrder, saveTimer, posted, toast, broken } = vm([
  "let saveTimer = 0;",
  "let stopSaving = false;",
  "let storageBroken = false;",
  "let lastToast = null;",
  "let flushing = false;",
  "let pendingFlush = false;",
  "let inflight = Promise.resolve();",
  "const db = {};",
  "const tabId = \"tab\";",
  "const posted = [];",
  "const channel = { postMessage(id) { posted.push(id); } };",
  "const state = {",
  "  checklists: [{ id: \"c1\", title: \"l\", expanded: true, createdAt: 1, archived: false }],",
  "  items: [{ id: \"i1\", checklistId: \"c1\", text: \"t\", done: false, createdAt: 1,",
  "    archived: false, archivedBy: \"user\" }],",
  "  ui: { pageSize: 20 },",
  "};",
  "function showToast(text) { lastToast = text; }",
  "function t(key) { return key; }",
  slice("dirty"),
  slice("markUi"),
  slice("markDirty"),
  slice("markGone"),
  slice("markOrder"),
  slice("emptyBatch"),
  slice("findList"),
  slice("findItem"),
  slice("orderValue"),
  slice("takeBatch"),
  slice("requeue"),
  slice("save"),
  slice("queueSave"),
  slice("flushSave"),
  "({ queueSave, flushSave, markDirty, markOrder, saveTimer: () => saveTimer,",
  "  posted: () => posted.join(\",\"), toast: () => lastToast, broken: () => storageBroken });",
], {
  setTimeout: (fn) => {
    pending.set(++nextId, fn);
    return nextId;
  },
  clearTimeout: (id) => {
    pending.delete(id);
  },
  writeBatch,
});

const runPending = () => {
  for (const fn of [...pending.values()]) fn();
  pending.clear();
};

const idle = () => new Promise(setImmediate);

test("a save with nothing dirty leaves the store alone", async () => {
  written = [];
  await flushSave();
  assert.deepEqual(written, [], "no marks, no transaction");
  assert.equal(posted(), "", "and no other tab is told to reload");
});

test("the debounce leaves nothing pending once it has written", async () => {
  written = [];
  queueSave();
  assert.ok(saveTimer(), "a queued save is pending");
  runPending();
  await idle();
  assert.equal(saveTimer(), 0);
  assert.equal(written.length, 1, "the queued save wrote once");
  assert.equal(posted(), "tab", "the other tabs hear about the write");
});

test("flushing writes now and drops the queued one", async () => {
  written = [];
  queueSave();
  await flushSave();
  assert.equal(saveTimer(), 0);
  assert.equal(pending.size, 0, "the queued save is gone, not written twice");
  assert.equal(written.length, 1, "the flush wrote it");
  runPending();
  assert.equal(written.length, 1, "the dropped save never wrote");
});

test("a rejected write is reported once and stays queued", async () => {
  written = [];
  failing = true;
  markDirty("item", "i1");
  await flushSave();
  failing = false;
  assert.equal(written.length, 1);
  assert.equal(toast(), "storage_error", "the tab says once that storage is gone");
  assert.equal(broken(), true);

  written = [];
  await flushSave();
  // Batches are built inside the VM, so compare plain values from this realm.
  assert.deepEqual(Array.from(written[0].items, (item) => item.id), ["i1"], "the failed batch went out again");
});

test("one transaction runs at a time and the edits made during it go out as soon as it closes", async () => {
  written = [];
  releases = [];
  held = true;
  markOrder("c1");
  const first = flushSave();
  markDirty("item", "i1");
  const second = flushSave();
  assert.equal(written.length, 1, "the second save waits for the open transaction");
  assert.deepEqual(Array.from(written[0].order), ["c1"], "the open transaction took the marks it started with");

  releases[0]();
  await first;
  assert.equal(written.length, 2, "the queued edit goes out right after it, without a timer");
  // Batches are built inside the VM, so compare plain values from this realm.
  assert.deepEqual(Array.from(written[1].items, (item) => item.id), ["i1"], "the edit made mid-transaction went out after it");
  releases[1]();
  await second;
  held = false;
});

test("a flush running into an open transaction waits until its own write landed", async () => {
  written = [];
  releases = [];
  held = true;
  markOrder("lists");
  const first = flushSave();
  markDirty("list", "c1");
  const second = flushSave();
  let landed = false;
  second.then(() => {
    landed = true;
  });
  assert.equal(written.length, 1, "the queued write has not started");
  assert.equal(landed, false, "and the flush does not report before it");

  releases[0]();
  await first;
  assert.equal(written.length, 2, "the queued write has started");
  assert.equal(landed, false, "the flush still waits for that transaction");

  releases[1]();
  await second;
  assert.equal(landed, true, "the flush returns once the batch is in the store");
  assert.deepEqual(Array.from(written[1].lists, (row) => row.id), ["c1"]);
  held = false;
});
