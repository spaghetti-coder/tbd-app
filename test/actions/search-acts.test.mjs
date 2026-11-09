// What the search controls do: leaving it, jumping to a hit, and the empty state in between.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list, plain, searchStub, storeStub } from "../../testkit/fixtures.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";
import { searchOver, stateHarness } from "../../testkit/state.mjs";

const NAMES = [
  "FLASH",
  "JUMP_FLASH",
  "gotoHit",
  "clearSearch",
  "reduce",
  "scrollBehavior",
  "toTop",
  "setSearchScope",
  "visibleChecklists",
  "jumpTo",
  "findList",
  "findItem",
  "clamp",
];

const { api, store, search, scrollTargetOf, resetScroll, setScroll, calls, resetCalls } = stateHarness(NAMES);

const rows = () => ([
  list("l1", { title: "Молоко" }),
  list("l2", { title: "Работа", expanded: false }),
  list("l3", { title: "Прочее" }),
]);
const items = () => ([
  item("i1", "l2", { text: "молоко из магазина" }),
  item("i2", "l3", { text: "что-то" }),
]);

const typed = (text, ui) => store(rows(), items(), { search: { text, lists: true, items: true }, ...ui });

test("jumping to an item leaves the search and opens its list for real", () => {
  const state = typed("молоко");
  resetCalls();
  api.gotoHit("item", "i1");
  assert.equal(state.ui.search.text, "");
  assert.equal(state.checklists.find((cl) => cl.id === "l2").expanded, true);
  assert.deepEqual(plain(scrollTargetOf()), { kind: "item", id: "i1", flash: 1800 }, "the item itself gets revealed, with a held flash");
  assert.equal(calls(), "commit");
});

test("jumping to a list lands on the page that holds it", () => {
  const state = typed("молоко", { pageSize: 2 });
  api.gotoHit("list", "l3");
  assert.equal(state.ui.search.text, "");
  assert.equal(state.ui.page, 2, "l3 is the third of three with two per page");
  assert.deepEqual(plain(scrollTargetOf()), { kind: "list", id: "l3", flash: 1800 });
});

test("a hit that is gone closes the search without moving the screen", () => {
  const state = typed("молоко");
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
  search.refresh();
  resetScroll();
  resetCalls();
  api.gotoHit("item", "i1");
  assert.equal(scrollTargetOf(), null);
  assert.equal(state.ui.search.text, "");
});

test("a scope switch narrows the result and starts the paging again", () => {
  const state = typed("молоко", { page: 3 });
  assert.deepEqual(api.visibleChecklists().map((cl) => cl.id), ["l1", "l2"]);
  setScroll(800);
  api.setSearchScope("lists");
  search.refresh();
  assert.deepEqual(api.visibleChecklists().map((cl) => cl.id), ["l2"]);
  assert.equal(state.ui.page, 1, "the page the query was counted on is gone");
  assert.equal(calls(), "toTop,commit", "the new result starts at the top");
});

test("leaving the search returns the scope switches to their default", () => {
  const state = typed("молоко");
  api.setSearchScope("lists");
  api.setSearchScope("items");
  assert.equal(state.ui.search.lists, false);
  api.clearSearch();
  assert.deepEqual(plain(state.ui.search), { text: "", lists: true, items: true });
});

test("both switches off stops filtering without erasing the query", () => {
  const state = typed("молоко");
  api.setSearchScope("lists");
  api.setSearchScope("items");
  search.refresh();
  assert.equal(state.ui.search.text, "молоко", "the query stays typed");
  assert.equal(search.active, false, "and filters nothing");
  assert.deepEqual(api.visibleChecklists().map((cl) => cl.id), ["l1", "l2", "l3"]);
});

/* addChecklist runs over its own globals: the creation path needs a uid and no render loop. */
const created = {
  searchPanel: false,
  state: {
    checklists: rows(),
    items: items(),
    ui: { page: 4, newChecklist: "top", search: { text: "нет таких", lists: true, items: true } },
  },
  uid: () => "n1",
  editor: { flush: () => {} },
  store: storeStub(),
  jumpTo: () => {},
  commit: () => {},
};

const { addChecklist } = sliceVm(["clearSearch", "addChecklist", "findList"], created);
created.search = searchOver(() => created.state);
created.search.refresh();

test("creating a list drops a search that would hide it", () => {
  assert.equal(created.state.checklists.length, 3);
  addChecklist();
  assert.equal(created.state.ui.search.text, "");
  assert.equal(created.search.active, false, "the new empty row is on screen, not filtered out");
  assert.equal(created.state.checklists.length, 4);
});

test("a searched screen has nothing to drag: its order is the query's, not the user's", () => {
  const { createRowDrag } = sliceVm(["createRowDrag"], {});
  const rowDrag = createRowDrag({ search: searchStub({ active: true }) });
  assert.equal(rowDrag.start({ kind: "list", id: "l1" }), false, "the hold never becomes a drag");
});

/* ---------- the empty state ---------- */

const ONE = () => [list("l1", { title: "Работа" })];

// A fresh empty node and env per test, so a failing assert cannot leak into the next one.
function emptyHarness(search, checklists) {
  const empty = {
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
    empty,
    byId: () => env.empty,
    el: (tag, className, text) => ({ tag, className, text, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } }),
    t: (key) => key,
    state: { checklists, ui: { page: 9, search: { text: "нет", lists: true, items: false } } },
    commit: () => {
      env.commits += 1;
    },
    search,
    commits: 0,
  };
  return { env, ...sliceVm(["renderEmpty"], env) };
}

test("the plain empty state says there are no lists", () => {
  const none = emptyHarness(searchStub(), ONE());
  none.renderEmpty(0);
  assert.equal(none.env.empty.hidden, false);
  assert.deepEqual(none.env.empty.children.map((node) => node.text), ["empty"]);

  // Nothing to search in: still the plain message, not "no results".
  const empty = emptyHarness(searchStub({ active: true, any: true }), []);
  empty.renderEmpty(0);
  assert.deepEqual(empty.env.empty.children.map((node) => node.text), ["empty"]);
});

test("no results says so, and offers the wider search only when it has something", () => {
  const narrow = emptyHarness(searchStub({ active: true, any: false }), ONE());
  narrow.renderEmpty(0);
  assert.deepEqual(narrow.env.empty.children.map((node) => node.text), ["empty_search"]);

  const wide = emptyHarness(searchStub({ active: true, any: true }), ONE());
  wide.renderEmpty(0);
  assert.deepEqual(wide.env.empty.children.map((node) => node.text), ["empty_search", "search_everywhere"]);

  wide.env.empty.children[1].listeners.click();
  assert.deepEqual(wide.env.state.ui.search, { text: "нет", lists: true, items: true });
  assert.equal(wide.env.state.ui.page, 1);
  assert.equal(wide.env.commits, 1);
});

test("results hide the empty state without building anything", () => {
  const { env, renderEmpty } = emptyHarness(searchStub({ active: true, any: true }), ONE());
  renderEmpty(2);
  assert.equal(env.empty.hidden, true);
  assert.deepEqual(env.empty.children, []);
});
