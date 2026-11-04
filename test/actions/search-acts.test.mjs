// What the search controls do: leaving it, jumping to a hit, and the empty state in between.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list } from "../../testkit/fixtures.mjs";
import { slice, vm } from "../../testkit/html-source.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const NAMES = [
  "FLASH",
  "JUMP_FLASH",
  "gotoHit",
  "clearSearch",
  "setSearchScope",
  "refreshSearch",
  "buildSearch",
  "matchedRows",
  "matchRanges",
  "searchTokens",
  "folded",
  "fold",
  "visibleChecklists",
  "indexOfVisible",
  "jumpTo",
  "findList",
  "findItem",
  "clamp",
];

const { api, store, scrollTargetOf, resetScroll, calls, resetCalls } = stateHarness(NAMES);

// Objects built inside the VM carry that realm's prototypes, so compare plain copies of them.
const plain = (value) => value && JSON.parse(JSON.stringify(value));

const rows = () => ([
  list("l1", { title: "Молоко" }),
  list("l2", { title: "Работа", expanded: false }),
  list("l3", { title: "Прочее" }),
]);
const items = () => ([
  item("i1", "l2", { text: "молоко из магазина" }),
  item("i2", "l3", { text: "что-то" }),
]);

const search = (text, ui) => {
  const state = store(rows(), items(), { search: { text, lists: true, items: true }, ...ui });
  api.refreshSearch();
  return state;
};

test("jumping to an item leaves the search and opens its list for real", () => {
  const state = search("молоко");
  resetCalls();
  api.gotoHit("item", "i1");
  assert.equal(state.ui.search.text, "");
  assert.equal(state.checklists.find((cl) => cl.id === "l2").expanded, true);
  assert.deepEqual(plain(scrollTargetOf()), { kind: "item", id: "i1", flash: 1800 }, "the item itself gets revealed, with a held flash");
  assert.equal(calls(), "commit");
});

test("jumping to a list lands on the page that holds it", () => {
  const state = search("молоко", { pageSize: 2 });
  api.gotoHit("list", "l3");
  assert.equal(state.ui.search.text, "");
  assert.equal(state.ui.page, 2, "l3 is the third of three with two per page");
  assert.deepEqual(plain(scrollTargetOf()), { kind: "list", id: "l3", flash: 1800 });
});

test("a hit that is gone closes the search without moving the screen", () => {
  const state = search("молоко");
  resetScroll();
  resetCalls();
  api.gotoHit("item", "nope");
  assert.equal(state.ui.search.text, "");
  assert.equal(scrollTargetOf(), null);
  assert.equal(calls(), "commit");
});

test("an archived list is not scrolled to", () => {
  const state = store(rows(), items(), { search: { text: "молоко", lists: true, items: true } });
  state.checklists[1].archived = true;
  api.refreshSearch();
  resetScroll();
  resetCalls();
  api.gotoHit("item", "i1");
  assert.equal(scrollTargetOf(), null);
  assert.equal(state.ui.search.text, "");
});

test("a scope switch narrows the result and starts the paging again", () => {
  const state = search("молоко", { page: 3 });
  assert.deepEqual(api.visibleChecklists().map((cl) => cl.id), ["l1", "l2"]);
  api.setSearchScope("lists");
  api.refreshSearch();
  assert.deepEqual(api.visibleChecklists().map((cl) => cl.id), ["l2"]);
  assert.equal(state.ui.page, 1, "the page the query was counted on is gone");
});

test("leaving the search returns the scope switches to their default", () => {
  const state = search("молоко");
  api.setSearchScope("lists");
  api.setSearchScope("items");
  assert.equal(state.ui.search.lists, false);
  api.clearSearch();
  assert.deepEqual(plain(state.ui.search), { text: "", lists: true, items: true });
});

test("both switches off stops filtering without erasing the query", () => {
  const state = search("молоко");
  api.setSearchScope("lists");
  api.setSearchScope("items");
  api.refreshSearch();
  assert.equal(state.ui.search.text, "молоко", "the query stays typed");
  assert.equal(api.buildSearch(), null, "and filters nothing");
  assert.deepEqual(api.visibleChecklists().map((cl) => cl.id), ["l1", "l2", "l3"]);
});

/* addChecklist runs over its own globals: the creation path needs a uid and no render loop. */
const created = {
  found: null,
  state: {
    checklists: rows(),
    items: items(),
    ui: { page: 4, newChecklist: "top", search: { text: "нет таких", lists: true, items: true } },
  },
  uid: () => "n1",
  flushPendingEdit: () => {},
  markDirty: () => {},
  markOrder: () => {},
  jumpTo: () => {},
  commit: () => {},
};

const { addChecklist, buildSearch: buildCreated } = vm(
  ["let searchPanel = false;", ...["folded", "fold", "searchTokens", "matchRanges", "matchedRows",
    "buildSearch", "refreshSearch", "clearSearch", "addChecklist", "findList"].map(slice),
    "({ addChecklist, buildSearch })"],
  created,
);

test("creating a list drops a search that would hide it", () => {
  assert.equal(created.state.checklists.length, 3);
  addChecklist();
  assert.equal(created.state.ui.search.text, "");
  assert.equal(buildCreated(), null, "the new empty row is on screen, not filtered out");
  assert.equal(created.state.checklists.length, 4);
});

test("a searched screen has nothing to drag: its order is the query's, not the user's", () => {
  const box = { found: { visible: new Set() }, drag: null, gesture: { kind: "list", id: "l1", mode: "pending" } };
  const { startDrag } = vm([slice("startDrag"), "({ startDrag })"], box);
  startDrag();
  assert.equal(box.gesture.mode, "pending", "the hold never became a drag");
  assert.equal(box.drag, null);
});

/* ---------- the empty state ---------- */

const emptyNode = {
  hidden: true,
  children: [],
  replaceChildren() {
    this.children = [];
  },
  append(...nodes) {
    this.children.push(...nodes);
  },
};

const env = {
  byId: () => emptyNode,
  el: (tag, className, text) => ({ tag, className, text, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } }),
  t: (key) => key,
  state: {
    checklists: [{ id: "l1", title: "Работа", archived: false }],
    ui: { page: 9, search: { text: "нет", lists: true, items: false } },
  },
  commit: () => {
    env.commits += 1;
  },
  found: null,
  commits: 0,
};

const { renderEmpty } = vm([slice("renderEmpty"), "({ renderEmpty })"], env);

test("the plain empty state says there are no lists", () => {
  env.found = null;
  renderEmpty(0);
  assert.equal(emptyNode.hidden, false);
  assert.deepEqual(emptyNode.children.map((node) => node.text), ["empty"]);

  env.found = { any: true };
  env.state.checklists = [];
  renderEmpty(0);
  assert.deepEqual(emptyNode.children.map((node) => node.text), ["empty"], "nothing to search in");
  env.state.checklists = [{ id: "l1", title: "Работа", archived: false }];
});

test("no results says so, and offers the wider search only when it has something", () => {
  env.found = { any: false };
  renderEmpty(0);
  assert.deepEqual(emptyNode.children.map((node) => node.text), ["empty_search"]);

  env.found = { any: true };
  renderEmpty(0);
  assert.deepEqual(emptyNode.children.map((node) => node.text), ["empty_search", "search_everywhere"]);

  env.commits = 0;
  emptyNode.children[1].listeners.click();
  assert.deepEqual(env.state.ui.search, { text: "нет", lists: true, items: true });
  assert.equal(env.state.ui.page, 1);
  assert.equal(env.commits, 1);
});

test("results hide the empty state without building anything", () => {
  env.found = { any: true };
  renderEmpty(2);
  assert.equal(emptyNode.hidden, true);
  assert.deepEqual(emptyNode.children, []);
});
