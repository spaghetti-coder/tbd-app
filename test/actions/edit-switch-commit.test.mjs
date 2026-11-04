// Editing a name: which row a typed draft belongs to, and what the save does with it.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, item, list } from "../../testkit/fixtures.mjs";
import { slice, vm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const SRC = [
  slice("flushPendingEdit"),
  slice("startEdit"),
  slice("addItem"),
  slice("addChecklist"),
  slice("onListBlur"),
  "({ flushPendingEdit, startEdit, addItem, addChecklist, onListBlur })",
];

// One card with a nameless item, each row carrying its own editor input.
function board() {
  const listInput = fakeNode({ tag: "input", classes: ["input"] });
  const itemInput = fakeNode({ tag: "input", classes: ["input"] });
  listInput.isConnected = true;
  itemInput.isConnected = true;
  const head = fakeNode({ classes: ["card__head"], children: [
    fakeNode({ classes: ["card__row"], children: [fakeNode({ classes: ["row-edit"], children: [listInput] })] }),
  ] });
  const item = fakeNode({ classes: ["item"], kind: "item", id: "i1", children: [
    fakeNode({ classes: ["item__row"], children: [fakeNode({ classes: ["row-edit"], children: [itemInput] })] }),
  ] });
  const card = fakeNode({ classes: ["card"], kind: "list", id: "L1", children: [head, item] });
  return {
    listInput,
    itemInput,
    rows: { L1: card, i1: item },
    lists: [{ id: "L1", title: "AAA" }],
    items: [{ id: "i1", checklistId: "L1", text: "" }],
  };
}

const textOf = (kind, entity) => (kind === "list" ? entity?.title : entity?.text);
// Objects built inside the VM carry that realm's prototype, so compare plain copies of their fields.
const plain = (editing) => editing && { kind: editing.kind, id: editing.id };

function harness({ editing = null, ...shape } = {}) {
  const rows = shape.rows ?? {};
  const ctx = {
    state: { checklists: shape.lists ?? [], items: shape.items ?? [], ui: { editing } },
    lists: new Map((shape.lists ?? []).map((cl) => [cl.id, cl])),
    items: new Map((shape.items ?? []).map((item) => [item.id, item])),
    nodes: new Map(Object.entries(rows)),
    commits: [],
    renders: 0,
    blurSuppress: false,
    uid: () => "i2",
    markDirty: () => {},
    markOrder: () => {},
    joinIndex: (all) => all.length,
    jumpTo: () => {},
    clearSearch: () => {},
    commit: () => {
      ctx.renders += 1;
    },
  };
  ctx.findList = (id) => ctx.lists.get(id) ?? null;
  ctx.findItem = (id) => ctx.items.get(id) ?? null;
  ctx.rowById = (kind, id) => ctx.nodes.get(id) ?? null;
  ctx.commitText = (kind, id, raw) => {
    const text = raw.trim();
    ctx.commits.push(`${kind}:${id}:${text}`);
    ctx.state.ui.editing = null;
    const entity = kind === "list" ? ctx.lists.get(id) : ctx.items.get(id);
    if (!entity) return;
    if (text) {
      Object.assign(entity, kind === "list" ? { title: text } : { text });
    } else if (!textOf(kind, entity)) {
      ctx[kind === "list" ? "lists" : "items"].delete(id);
      ctx.commit();
    }
  };
  return { ...vm(SRC, ctx), ctx };
}

const typed = () => {
  const shape = board();
  shape.itemInput.value = "BBB";
  return { ...harness({ ...shape, editing: { kind: "item", id: "i1" } }), ...shape };
};

test("a draft is committed to the row that owns it", () => {
  const { flushPendingEdit, ctx } = typed();
  flushPendingEdit();
  assert.deepEqual(ctx.commits, ["item:i1:BBB"]);
  assert.equal(ctx.items.get("i1").text, "BBB");
});

test("nothing is committed when no row is being edited", () => {
  const shape = board();
  const { flushPendingEdit, ctx } = harness(shape);
  flushPendingEdit();
  assert.deepEqual(ctx.commits, []);
});

test("nothing is committed when the edited row is no longer on screen", () => {
  const { flushPendingEdit, ctx } = harness({ items: [{ id: "i1", text: "" }], editing: { kind: "item", id: "i1" } });
  flushPendingEdit();
  assert.deepEqual(ctx.commits, []);
});

test("starting another edit saves the draft and opens the new row", () => {
  const { startEdit, ctx } = typed();
  startEdit("list", "L1");
  assert.deepEqual(ctx.commits, ["item:i1:BBB"], "the item keeps its text");
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "list", id: "L1" });
  assert.equal(ctx.renders, 1);
});

test("re-opening the row being typed in keeps its text", () => {
  const { startEdit, ctx } = typed();
  startEdit("item", "i1");
  assert.deepEqual(ctx.commits, ["item:i1:BBB"]);
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "item", id: "i1" });
});

test("no editor opens on a nameless row the save just dropped", () => {
  const shape = board();
  const { startEdit, ctx } = harness({ ...shape, editing: { kind: "item", id: "i1" } });
  shape.itemInput.value = "";
  startEdit("item", "i1");
  assert.deepEqual(ctx.commits, ["item:i1:"]);
  assert.equal(ctx.state.ui.editing, null);
  assert.equal(ctx.renders, 1, "the row is gone, and only the save rendered");
});

test("a blur from the edited row commits it", () => {
  const { onListBlur, ctx, itemInput } = typed();
  onListBlur({ target: itemInput });
  assert.deepEqual(ctx.commits, ["item:i1:BBB"]);
});

// The state swipe-right leaves behind: the list owns the editor, the item input still holds "BBB".
test("a blur left behind by another row taking the editor commits nothing", () => {
  const { onListBlur, ctx, itemInput } = typed();
  ctx.state.ui.editing = { kind: "list", id: "L1" };
  onListBlur({ target: itemInput });
  assert.deepEqual(ctx.commits, []);
});

test("a suppressed blur commits nothing and stops being suppressed", () => {
  const { onListBlur, ctx, itemInput } = typed();
  ctx.blurSuppress = true;
  onListBlur({ target: itemInput });
  assert.deepEqual(ctx.commits, []);
  assert.equal(ctx.blurSuppress, false);
});

test("a blur on a detached input is a rebuild artifact, not a commit", () => {
  const { onListBlur, ctx, itemInput } = typed();
  itemInput.isConnected = false;
  onListBlur({ target: itemInput });
  assert.deepEqual(ctx.commits, []);
});

test("adding a row saves the draft that was still open", () => {
  const { addItem, ctx } = typed();
  addItem("L1");
  assert.deepEqual(ctx.commits, ["item:i1:BBB"]);
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "item", id: "i2" });
});

test("adding a row after a commit does not commit twice", () => {
  const shape = board();
  const { addItem, ctx } = harness(shape);
  shape.itemInput.value = "BBB";
  addItem("L1");
  assert.deepEqual(ctx.commits, []);
});

test("creating a list saves the draft that was still open", () => {
  const { addChecklist, ctx } = typed();
  addChecklist();
  assert.deepEqual(ctx.commits, ["item:i1:BBB"]);
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "list", id: "i2" });
});

// The same flow over the real save path, where commitText itself writes, rolls back or drops the row.
const REAL = [
  slice("findList"),
  slice("findItem"),
  slice("entityText"),
  slice("removeEntity"),
  slice("cancelEdit"),
  slice("commitText"),
  slice("flushPendingEdit"),
  slice("startEdit"),
  "({ flushPendingEdit, startEdit })",
];

function realPath(editing, draft) {
  const shape = board();
  shape.listInput.value = draft;
  shape.itemInput.value = draft;
  const ctx = {
    state: { checklists: shape.lists, items: shape.items, ui: { editing } },
    markDirty: () => {},
    markGone: () => {},
    markOrder: () => {},
    pruneSelection: () => {},
    flushSave: () => {},
    repaintRow: () => {},
    commit: () => {},
  };
  ctx.rowById = (kind, id) => shape.rows[id] ?? null;
  return { ...vm(REAL, ctx), ctx };
}

test("the real save puts the draft in its own row", () => {
  const { startEdit, ctx } = realPath({ kind: "item", id: "i1" }, "BBB");
  startEdit("list", "L1");
  assert.equal(ctx.state.items[0].text, "BBB");
  assert.deepEqual(plain(ctx.state.ui.editing), { kind: "list", id: "L1" });
});

test("the real save drops a nameless row and opens no editor on it", () => {
  const { startEdit, ctx } = realPath({ kind: "item", id: "i1" }, "");
  startEdit("item", "i1");
  assert.equal(ctx.state.items.length, 0);
  assert.equal(ctx.state.ui.editing, null);
});

/* ---------- what a save writes, rolls back or drops ---------- */

const { api, store, calls, resetCalls } = stateHarness([
  "commitText",
  "cancelEdit",
  "entityText",
  "removeEntity",
  "pruneSelection",
  "setBulk",
  "findList",
  "findItem",
]);

test("a renamed entity is saved and only its row is repainted", () => {
  const state = store([list("c1", { title: "old" })], [item("i1", "c1", { text: "old" })]);
  api.commitText("list", "c1", "  Groceries  ");
  assert.equal(state.checklists[0].title, "Groceries");
  assert.equal(state.ui.editing, null);
  assert.equal(calls(), "flushSave,repaintRow:list:c1");

  resetCalls();
  api.commitText("item", "i1", "Milk");
  assert.equal(state.items[0].text, "Milk");
  assert.equal(state.ui.editing, null);
  assert.equal(calls(), "flushSave,repaintRow:item:i1");
});

test("committing an empty name rolls a named entity back", () => {
  const state = store([list("c1", { title: "old" })], [item("i1", "c1", { text: "old" })], { editing: { kind: "item", id: "i1" } });
  api.commitText("item", "i1", "   ");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].text, "old");
  assert.equal(state.ui.editing, null);
  assert.equal(calls(), "commit");
});

test("committing an empty name discards a new checklist with its items", () => {
  const state = store([list("c1", { title: "" }), list("c2")], [item("i1", "c1"), item("i2", "c2")], { editing: { kind: "list", id: "c1" } });
  api.commitText("list", "c1", "");
  assert.deepEqual(ids(state.checklists), ["c2"]);
  assert.deepEqual(ids(state.items), ["i2"]);
  assert.equal(state.ui.editing, null);
  assert.equal(calls(), "commit");
});

test("cancelling discards a new entity and keeps a named one", () => {
  const fresh = store([list("c1", { title: "" })], [item("i1", "c1", { text: "" })], { editing: { kind: "item", id: "i1" } });
  api.cancelEdit();
  assert.deepEqual(ids(fresh.items), []);
  assert.equal(fresh.ui.editing, null);
  assert.equal(calls(), "commit");

  const named = store([list("c1", { title: "keep" })], [], { editing: { kind: "list", id: "c1" } });
  api.cancelEdit();
  assert.deepEqual(ids(named.checklists), ["c1"]);
  assert.equal(named.checklists[0].title, "keep");
  assert.equal(named.ui.editing, null);
});
