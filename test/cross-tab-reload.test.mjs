// What one tab does when another writes the key: flush the pending save, then reload.

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
  "function flushSave() { calls.push(\"flush\"); saveTimer = 0; }",
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

test("a write from another tab picks up a save still in the debounce", () => {
  start(true, true, true);
  reload();
  assert.equal(calls(), "flush,reload");
  assert.equal(stopSaving(), true, "the reload must not flush an older state back");
  assert.equal(externalWrite(), false, "the write is consumed");
});

test("a tab with nothing pending reloads without writing", () => {
  start(false, true, true);
  reload();
  assert.equal(calls(), "reload");
  assert.equal(stopSaving(), true);
});

test("an incoming write is left alone while a reload would interrupt something", () => {
  start(true, false, true);
  reload();
  assert.equal(calls(), "", "nothing was written elsewhere");
  assert.equal(externalWrite(), false);

  start(true, true, false);
  reload();
  assert.equal(calls(), "", "the write waits for a safe moment");
  assert.equal(externalWrite(), true);
});

// The debounced half of the same rule: saveTimer is the flag maybeReload reads, so it has to be
// empty exactly while no write is pending.
const pending = new Map();
let nextId = 0;
const writes = [];
const { queueSave, flushSave, saveTimer, breakStorage, toast } = vm([
  "let saveTimer = 0;",
  "let stopSaving = false;",
  "let storageBroken = false;",
  "let lastToast = null;",
  "const KEY = \"k\";",
  "const state = { v: 1 };",
  "function showToast(text) { lastToast = text; }",
  "function t(key) { return key; }",
  slice("save"),
  slice("queueSave"),
  slice("flushSave"),
  "({ queueSave, flushSave, saveTimer: () => saveTimer, breakStorage: () => { storageBroken = true; }, toast: () => lastToast });",
], {
  setTimeout: (fn) => {
    pending.set(++nextId, fn);
    return nextId;
  },
  clearTimeout: (id) => {
    pending.delete(id);
  },
  localStorage: { setItem: (_key, value) => writes.push(value) },
});

const runPending = () => {
  for (const fn of pending.values()) fn();
  pending.clear();
};
const clearWrites = () => (writes.length = 0);

test("the debounce leaves nothing pending once it has written", () => {
  clearWrites();
  queueSave();
  assert.ok(saveTimer(), "a queued save is pending");
  runPending();
  assert.equal(saveTimer(), 0);
  assert.equal(writes.length, 1, "the queued save wrote once");
});

test("flushing writes now and drops the queued one", () => {
  clearWrites();
  queueSave();
  flushSave();
  assert.equal(saveTimer(), 0);
  assert.equal(pending.size, 0, "the queued save is gone, not written twice");
  assert.equal(writes.length, 1, "the flush wrote it");
  runPending();
  assert.equal(writes.length, 1, "the dropped save never wrote");
});

test("a broken storage is reported once per save, not twice", () => {
  breakStorage();
  queueSave();
  assert.equal(toast(), null, "queueing alone stays quiet");
  runPending();
  assert.equal(toast(), "storage_error");
});
