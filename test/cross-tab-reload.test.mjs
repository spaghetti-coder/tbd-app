// Unit tests for what one tab does when another one writes the key (see html-source.mjs for how the
// functions are sliced out of index.html and run in a VM).
// A save still sitting in the debounce is newer than the incoming write, so it is flushed before the
// reload; a tab with nothing pending reloads without writing, which is what keeps the two from
// reloading each other forever.

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const box = {};
createContext(box);
runInContext([
  "let saveTimer = 0;",
  "let stopSaving = false;",
  "let externalWrite = false;",
  "let isSafe = true;",
  "const calls = [];",
  "function safeToReload() { return isSafe; }",
  "function flushSave() { calls.push(\"flush\"); saveTimer = 0; }",
  "const location = { reload() { calls.push(\"reload\"); } };",
  slice("maybeReload"),
  "this.maybeReload = maybeReload;",
  "this.start = (pending, written, safe) => {",
  "  saveTimer = pending ? 1 : 0;",
  "  stopSaving = false;",
  "  externalWrite = written;",
  "  isSafe = safe;",
  "  calls.length = 0;",
  "};",
  "this.stopSaving = () => stopSaving;",
  "this.externalWrite = () => externalWrite;",
  "this.calls = () => calls.join(\",\");",
].join("\n"), box);
const reload = box.maybeReload;
const start = box.start;

test("a write from another tab picks up a save still in the debounce", () => {
  start(true, true, true);
  reload();
  assert.equal(box.calls(), "flush,reload");
  assert.equal(box.stopSaving(), true, "the reload must not flush an older state back");
  assert.equal(box.externalWrite(), false, "the write is consumed");
});

test("a tab with nothing pending reloads without writing", () => {
  start(false, true, true);
  reload();
  assert.equal(box.calls(), "reload");
  assert.equal(box.stopSaving(), true);
});

test("an incoming write is left alone while a reload would interrupt something", () => {
  start(true, false, true);
  reload();
  assert.equal(box.calls(), "", "nothing was written elsewhere");
  assert.equal(box.externalWrite(), false);

  start(true, true, false);
  reload();
  assert.equal(box.calls(), "", "the write waits for a safe moment");
  assert.equal(box.externalWrite(), true);
});

// The debounced half of the same rule: saveTimer is the flag maybeReload reads, so it has to be
// empty exactly while no write is pending.
const pending = new Map();
let nextId = 0;
const storeBox = {
  setTimeout: (fn) => {
    pending.set(++nextId, fn);
    return nextId;
  },
  clearTimeout: (id) => {
    pending.delete(id);
  },
  localStorage: { setItem: (_key, value) => storeBox.writes.push(value) },
  writes: [],
};
createContext(storeBox);
runInContext([
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
  "this.queueSave = queueSave;",
  "this.flushSave = flushSave;",
  "this.saveTimer = () => saveTimer;",
  "this.breakStorage = () => { storageBroken = true; };",
  "this.toast = () => lastToast;",
].join("\n"), storeBox);

const runPending = () => {
  for (const fn of pending.values()) fn();
  pending.clear();
};
const queued = () => pending.size;
const clearWrites = () => (storeBox.writes.length = 0);

test("the debounce leaves nothing pending once it has written", () => {
  clearWrites();
  storeBox.queueSave();
  assert.ok(storeBox.saveTimer(), "a queued save is pending");
  runPending();
  assert.equal(storeBox.saveTimer(), 0);
  assert.equal(storeBox.writes.length, 1, "the queued save wrote once");
});

test("flushing writes now and drops the queued one", () => {
  clearWrites();
  storeBox.queueSave();
  storeBox.flushSave();
  assert.equal(storeBox.saveTimer(), 0);
  assert.equal(queued(), 0, "the queued save is gone, not written twice");
  assert.equal(storeBox.writes.length, 1, "the flush wrote it");
  runPending();
  assert.equal(storeBox.writes.length, 1, "the dropped save never wrote");
});

test("a broken storage is reported once per save, not twice", () => {
  storeBox.breakStorage();
  storeBox.queueSave();
  assert.equal(storeBox.toast(), null, "queueing alone stays quiet");
  runPending();
  assert.equal(storeBox.toast(), "storage_error");
});
