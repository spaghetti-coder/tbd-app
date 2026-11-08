// The write protocol: every change saves, paints what it touched, and offers the cross-tab reload.

import assert from "node:assert/strict";
import test from "node:test";
import { list, searchStub } from "../../testkit/fixtures.mjs";
import { storeHarness } from "../../testkit/store-fake.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";

const idle = () => new Promise(setImmediate);

const box = () => {
  const calls = [];
  const commit = sliceVm(["commit"], {
    store: {
      queueSave: () => calls.push("queueSave"),
      reloadWhenSafe: () => calls.push("reloadWhenSafe"),
    },
    render: () => calls.push("render"),
    repaintRow: (kind, id) => calls.push(`repaintRow:${kind}:${id}`),
  }).commit;
  return { calls, commit };
};

test("a commit saves, rebuilds the screen, then offers the reload", () => {
  const { calls, commit } = box();
  commit();
  assert.deepEqual(calls, ["queueSave", "render", "reloadWhenSafe"]);
});

test("a commit naming a row paints that row alone, and still offers the reload", () => {
  const { calls, commit } = box();
  commit("list", "c1");
  assert.deepEqual(calls, ["queueSave", "repaintRow:list:c1", "reloadWhenSafe"]);
});

test("a renamed row goes out in one write", async () => {
  const h = storeHarness();
  const api = sliceVm(["commitText", "commit", "repaintRow", "findList", "findItem",
    "entityText", "removeEntity", "pruneSelection"], {
    state: h.state([list("c1", { title: "old" })], []),
    store: h.store,
    search: searchStub(),
    rowById: () => null,
    render: () => {},
    renderPanel: () => {},
  });
  api.commitText("list", "c1", "Groceries");
  await idle();
  h.clock.run();
  await idle();
  assert.equal(h.storage.batches.length, 1, "the queue a commit opens is eaten by its flush, not written after it");
  assert.deepEqual(h.echo.posts, ["tab"], "the other tabs hear about the rename once");
});
