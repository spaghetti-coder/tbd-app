// The write protocol: save, paint what changed, offer cross-tab reload.

import assert from "node:assert/strict";
import test from "node:test";
import { list, searchStub } from "../../testkit/fixtures.mjs";
import { storeHarness } from "../../testkit/store-fake.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

const idle = () => new Promise(setImmediate);

test("a commit repaints the screen and queues the write", async () => {
  const h = storeHarness();
  h.state([list("c1")], []);
  h.store.commit();
  assert.deepEqual(h.painted, ["all"]);
  assert.deepEqual(h.storage.batches, [], "the save waits for its debounce");
  h.clock.run();
  await idle();
  assert.equal(h.storage.batches.length, 1, "and then goes out");
});

test("a commit naming a row paints that row alone", () => {
  const h = storeHarness();
  h.state([list("c1")], []);
  h.store.commit("list", "c1");
  assert.deepEqual(h.painted, ["list:c1"]);
});

test("a change made while another tab waits goes out before this tab reloads", async () => {
  let safe = false;
  const h = storeHarness({ canReload: () => safe });
  h.state([list("c1", { title: "old" })], []);
  h.echo.send("other");
  assert.deepEqual(h.reloads, [], "a busy tab keeps its screen");
  h.edit("list", "c1", { title: "new" });
  safe = true;
  h.store.commit("list", "c1");
  await idle();
  assert.deepEqual(h.reloads, [1]);
  assert.equal(h.storage.batches[0].checklists[0].title, "new", "the write goes out first");
});

test("a renamed row goes out in one write", async () => {
  const h = storeHarness();
  const state = h.state([list("c1", { title: "old" })], []);
  const input = fakeNode({ tag: "input", classes: ["input"] });
  input.value = "Groceries";
  const card = fakeNode({ classes: ["card"], kind: "list", id: "c1", children: [
    fakeNode({ classes: ["row-edit"], children: [input] }),
  ] });
  const ctx = {
    state,
    store: h.store,
    search: searchStub(),
    rowById: () => card,
    rowView: { parts: (row) => ({ input: row.querySelector(".row-edit input") }) },
    render: () => {},
    renderPanel: () => {},
    paintRow: () => true,
  };
  // The app's own wiring, over the live store.
  const api = sliceVm(["createEditor", "makeEditor", "repaintRow", "findList", "findItem",
    "draftText", "entityText", "patch", "removeEntity", "pruneSelection"], ctx);
  const editor = api.makeEditor();
  state.ui.editing = { kind: "list", id: "c1" };
  editor.save();
  await idle();
  h.clock.run();
  await idle();
  assert.equal(h.storage.batches.length, 1, "the flush eats the queue it opened");
  assert.deepEqual(h.echo.posts, ["tab"], "the other tabs hear about the rename once");
});
