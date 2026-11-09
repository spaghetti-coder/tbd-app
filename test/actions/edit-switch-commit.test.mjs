// Editing: draft ownership per row, what a save writes, the blur that trails it.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, plain, searchStub, storeStub } from "../../testkit/fixtures.mjs";
import { searchOver } from "../../testkit/state.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

// One card, one item, an input per row.
function board() {
  const listInput = fakeNode({ tag: "input", classes: ["input"] });
  const itemInput = fakeNode({ tag: "input", classes: ["input"] });
  listInput.value = "";
  itemInput.value = "";
  listInput.isConnected = true;
  itemInput.isConnected = true;
  const head = fakeNode({ classes: ["card__head"], children: [
    fakeNode({ classes: ["card__row"], children: [fakeNode({ classes: ["row-edit"], children: [listInput] })] }),
  ] });
  const row = fakeNode({ classes: ["item"], kind: "item", id: "i1", children: [
    fakeNode({ classes: ["item__row"], children: [fakeNode({ classes: ["row-edit"], children: [itemInput] })] }),
  ] });
  const card = fakeNode({ classes: ["card"], kind: "list", id: "L1", children: [head, row] });
  return { listInput, itemInput, rows: { L1: card, i1: row } };
}

/* The real editor over the real lookups. `saved` and `painted` record what it asked for. */
function box({ lists = [], items = [], ui = {}, onScreen = true, search = searchStub() } = {}) {
  const shape = board();
  const saved = [];
  const painted = [];
  const ctx = {
    state: {
      checklists: lists,
      items,
      ui: { page: 1, pageSize: 20, bulk: { kind: null, ids: [] }, search: { text: "", lists: true, items: true }, ...ui },
    },
    store: storeStub(saved),
    search,
    pruneSelection: () => {},
    jumpTo: () => {},
    clearSearch: () => {},
    scrollTarget: null,
    uid: () => "i2",
    order: { place: () => {} },
    commit: (kind, id) => painted.push(kind ? `${kind}:${id}` : "all"),
    rowById: (kind, id) => (onScreen ? shape.rows[id] : null) ?? null,
  };
  // The app's own wiring, over this state, store, search and commit.
  const api = sliceVm(["createEditor", "makeEditor", "commitEditor", "draftText", "findList", "findItem",
    "entityText", "removeEntity", "pruneSelection", "setBulk", "addItem", "addChecklist"], ctx);
  ctx.editor = api.makeEditor();
  return { ...api, ...shape, ctx, editor: ctx.editor, saved, painted };
}

// A nameless new item under edit.
const typing = () => box({
  lists: [{ id: "L1", title: "AAA" }],
  items: [{ id: "i1", checklistId: "L1", text: "" }],
  ui: { editing: { kind: "item", id: "i1" } },
});

/* ---------- the draft belongs to the row it was typed in ---------- */

test("a draft is committed to the row that owns it", () => {
  const { ctx, itemInput, editor } = typing();
  itemInput.value = "BBB";
  editor.flush();
  assert.equal(ctx.state.items[0].text, "BBB");
  assert.equal(ctx.state.ui.editing, null);
});

test("nothing is committed when no row is being edited", () => {
  const { ctx, itemInput, editor, saved } = box({ items: [{ id: "i1", checklistId: "L1", text: "old" }] });
  itemInput.value = "BBB";
  editor.flush();
  assert.equal(ctx.state.items[0].text, "old");
  assert.deepEqual(saved, []);
});

test("nothing is committed when the edited row is no longer on screen", () => {
  const { ctx, editor } = box({
    items: [{ id: "i1", checklistId: "L1", text: "old" }],
    ui: { editing: { kind: "item", id: "i1" } },
    onScreen: false,
  });
  editor.flush();
  assert.equal(ctx.state.items[0].text, "old");
  assert.equal(ctx.state.ui.editing.kind, "item", "the editor stays open, unwritten");
});

/* ---------- opening a row ---------- */

test("starting another edit saves the draft and opens the new row", () => {
  const { ctx, itemInput, editor, painted } = typing();
  itemInput.value = "BBB";
  editor.open("list", "L1");
  assert.equal(ctx.state.items[0].text, "BBB", "the item keeps its text");
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "list", id: "L1" });
  assert.deepEqual(painted, ["item:i1", "all"], "draft row, then the opened editor");
});

test("re-opening the row being typed in keeps its text", () => {
  const { ctx, itemInput, editor } = typing();
  itemInput.value = "BBB";
  editor.open("item", "i1");
  assert.equal(ctx.state.items[0].text, "BBB");
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "item", id: "i1" });
});

test("no editor opens on a nameless row the save just dropped", () => {
  const { ctx, editor, painted } = typing();
  editor.open("item", "i1");
  assert.deepEqual(ids(ctx.state.items), []);
  assert.equal(ctx.state.ui.editing, null);
  assert.deepEqual(painted, ["all"], "gone: only the save rendered");
});

/* ---------- what a save writes, rolls back or drops ---------- */

test("a renamed entity goes out at once and its row alone is repainted", () => {
  const { ctx, listInput, editor, saved, painted } = box({
    lists: [{ id: "L1", title: "old" }],
    ui: { editing: { kind: "list", id: "L1" } },
  });
  listInput.value = "  Groceries  ";
  editor.save();
  assert.equal(ctx.state.checklists[0].title, "Groceries");
  assert.equal(ctx.state.ui.editing, null);
  assert.deepEqual(painted, ["list:L1"]);
  assert.deepEqual(saved, ["markDirty:list:L1", "flushSave"], "the flush eats the queued save");
});

test("a first name is answered with the list to continue in", () => {
  const { ctx, itemInput, editor } = typing();
  itemInput.value = "Milk";
  assert.equal(editor.save(), "L1");
  assert.equal(ctx.state.items[0].text, "Milk");
});

test("a rename is answered with nothing", () => {
  const { listInput, editor } = box({
    lists: [{ id: "L1", title: "Groceries" }],
    ui: { editing: { kind: "list", id: "L1" } },
  });
  listInput.value = "Shopping";
  assert.equal(editor.save(), null);
});

test("an empty draft rolls a named entity back", () => {
  const { ctx, itemInput, editor, painted } = box({
    lists: [{ id: "L1", title: "AAA" }],
    items: [{ id: "i1", checklistId: "L1", text: "old" }],
    ui: { editing: { kind: "item", id: "i1" } },
  });
  itemInput.value = "   ";
  editor.save();
  assert.deepEqual(ids(ctx.state.items), ["i1"]);
  assert.equal(ctx.state.items[0].text, "old");
  assert.equal(ctx.state.ui.editing, null);
  assert.deepEqual(painted, ["all"], "rollback needs a rebuild");
});

test("an empty draft discards a new checklist with its items", () => {
  const { ctx, listInput, editor } = box({
    lists: [{ id: "L1", title: "" }, { id: "c2", title: "keep" }],
    items: [{ id: "i1", checklistId: "L1" }, { id: "i2", checklistId: "c2" }],
    ui: { editing: { kind: "list", id: "L1" } },
  });
  listInput.value = "";
  editor.save();
  assert.deepEqual(ids(ctx.state.checklists), ["c2"]);
  assert.deepEqual(ids(ctx.state.items), ["i2"]);
  assert.equal(ctx.state.ui.editing, null);
});

test("a save with no editor writes nothing", () => {
  const { editor, saved } = box({ items: [{ id: "i1", checklistId: "L1", text: "old" }] });
  assert.equal(editor.save(), null);
  assert.deepEqual(saved, []);
});

test("a save on a row that is no longer on screen writes nothing", () => {
  const { editor, saved } = box({
    items: [{ id: "i1", checklistId: "L1", text: "old" }],
    ui: { editing: { kind: "item", id: "gone" } },
  });
  assert.equal(editor.save(), null);
  assert.deepEqual(saved, []);
});

test("cancelling discards a new entity and keeps a named one", () => {
  const fresh = box({
    lists: [{ id: "L1", title: "keep" }],
    items: [{ id: "i1", checklistId: "L1", text: "" }],
    ui: { editing: { kind: "item", id: "i1" } },
  });
  fresh.editor.cancel();
  assert.deepEqual(ids(fresh.ctx.state.items), []);
  assert.equal(fresh.ctx.state.ui.editing, null);

  const named = box({
    lists: [{ id: "c1", title: "keep" }],
    ui: { editing: { kind: "list", id: "c1" } },
  });
  named.editor.cancel();
  assert.deepEqual(ids(named.ctx.state.checklists), ["c1"]);
  assert.equal(named.ctx.state.checklists[0].title, "keep");
  assert.equal(named.ctx.state.ui.editing, null);
});

/* ---------- a running search counts the saved text ---------- */

test("a save inside a search recounts the result", () => {
  const b = box({
    lists: [{ id: "L1", title: "молоко" }],
    items: [{ id: "i1", checklistId: "L1", text: "молоко" }],
    ui: { editing: { kind: "item", id: "i1" }, search: { text: "молоко", lists: true, items: true } },
  });
  // Real search over the same state.
  b.ctx.search = searchOver(() => b.ctx.state);
  b.ctx.search.refresh();
  assert.deepEqual(plain(b.ctx.search.rangesFor("i1")), [[0, 6]]);
  b.itemInput.value = "хлеб";
  b.editor.save();
  assert.equal(b.ctx.search.rangesFor("i1"), null, "the row is out of the result");
});

test("a saved name that leaves nothing matching drops the list", () => {
  const b = box({
    lists: [{ id: "L1", title: "молоко" }],
    items: [{ id: "i1", checklistId: "L1", text: "хлеб" }],
    ui: { editing: { kind: "list", id: "L1" }, search: { text: "молоко", lists: true, items: true } },
  });
  b.ctx.search = searchOver(() => b.ctx.state);
  b.ctx.search.refresh();
  b.listInput.value = "соль";
  b.editor.save();
  assert.equal(b.ctx.search.allowsList("L1"), false);
});

test("a saved name that keeps the match moves the highlight", () => {
  const b = box({
    lists: [{ id: "L1", title: "работа" }],
    items: [{ id: "i1", checklistId: "L1", text: "молоко" }],
    ui: { editing: { kind: "item", id: "i1" }, search: { text: "молоко", lists: true, items: true } },
  });
  b.ctx.search = searchOver(() => b.ctx.state);
  b.ctx.search.refresh();
  b.itemInput.value = "купить молоко";
  b.editor.save();
  assert.deepEqual(plain(b.ctx.search.rangesFor("i1")), [[7, 13]]);
});

/* ---------- the blur ---------- */

test("a blur from the edited row commits it", () => {
  const { ctx, editor } = typing();
  editor.blur({ kind: "item", id: "i1" }, "BBB");
  assert.equal(ctx.state.items[0].text, "BBB");
});

test("a blur of another row's input commits nothing", () => {
  const { ctx, editor, saved } = typing();
  editor.blur({ kind: "list", id: "L1" }, "BBB");
  assert.equal(ctx.state.checklists[0].title, "AAA");
  assert.deepEqual(saved, []);
});

test("a blur arriving after the editor closed commits nothing", () => {
  const { ctx, itemInput, editor, saved } = typing();
  itemInput.value = "Milk";
  editor.save();
  editor.blur({ kind: "item", id: "i1" }, "Milk");
  assert.equal(ctx.state.items[0].text, "Milk");
  assert.equal(saved.filter((mark) => mark === "markDirty:item:i1").length, 1, "no second write");
});

// onListBlur keeps only what the event can tell.
const blur = (editor) => sliceVm(["onListBlur"], { editor }).onListBlur;

test("a blur handed to the save button commits nothing", () => {
  const { ctx, itemInput, editor } = typing();
  const save = fakeNode({ tag: "button", classes: ["act", "act--save"] });
  blur(editor)({ target: itemInput, relatedTarget: save });
  assert.equal(ctx.state.items[0].text, "");
});

test("a blur on a detached input is a rebuild artifact, not a commit", () => {
  const { ctx, itemInput, editor } = typing();
  itemInput.isConnected = false;
  blur(editor)({ target: itemInput });
  assert.equal(ctx.state.items[0].text, "");
});

test("a blur from the edited row reaches the editor with its owner", () => {
  const { ctx, itemInput, editor } = typing();
  itemInput.value = "BBB";
  blur(editor)({ target: itemInput });
  assert.equal(ctx.state.items[0].text, "BBB");
});

/* ---------- a row added over an open draft ---------- */

test("adding a row saves the draft that was still open", () => {
  const { ctx, itemInput, addItem } = typing();
  itemInput.value = "BBB";
  addItem("L1");
  assert.equal(ctx.state.items[0].text, "BBB");
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "item", id: "i2" });
});

test("adding a row with nothing open writes nothing", () => {
  const { ctx, itemInput, addItem } = box({
    lists: [{ id: "L1", title: "AAA" }],
    items: [{ id: "i1", checklistId: "L1", text: "old" }],
  });
  itemInput.value = "BBB";
  addItem("L1");
  assert.equal(ctx.state.items[0].text, "old");
});

test("naming a new item opens the next row in the same list", () => {
  const b = typing();
  b.itemInput.value = "Milk";
  b.commitEditor();
  assert.deepEqual(ids(b.ctx.state.items), ["i1", "i2"]);
  assert.deepEqual(plain(b.ctx.state.ui.editing), { kind: "item", id: "i2" });
});

test("naming a new checklist opens its first item", () => {
  const b = box({ lists: [{ id: "L1", title: "" }], ui: { editing: { kind: "list", id: "L1" } } });
  b.listInput.value = "Groceries";
  b.commitEditor();
  assert.equal(b.ctx.state.checklists[0].title, "Groceries");
  assert.deepEqual(plain(b.ctx.state.ui.editing), { kind: "item", id: "i2" });
});

test("creating a list saves the draft that was still open", () => {
  const { ctx, itemInput, addChecklist } = typing();
  itemInput.value = "BBB";
  addChecklist();
  assert.equal(ctx.state.items[0].text, "BBB");
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "list", id: "i2" });
});
