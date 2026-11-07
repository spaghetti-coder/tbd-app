// What the search controls do: leaving it, jumping to a hit, and the empty state in between.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list, plain, storeStub } from "../../testkit/fixtures.mjs";
import { SEARCH, sliceVm } from "../../testkit/html-source.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const NAMES = [
  ...SEARCH,
  "FLASH",
  "JUMP_FLASH",
  "gotoHit",
  "clearSearch",
  "reduce",
  "scrollBehavior",
  "toTop",
  "setSearchScope",
  "visibleChecklists",
  "indexOfVisible",
  "jumpTo",
  "findList",
  "findItem",
  "clamp",
];

const { api, store, scrollTargetOf, resetScroll, setScroll, calls, resetCalls } = stateHarness(NAMES);

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
  setScroll(800);
  api.setSearchScope("lists");
  api.refreshSearch();
  assert.deepEqual(api.visibleChecklists().map((cl) => cl.id), ["l2"]);
  assert.equal(state.ui.page, 1, "the page the query was counted on is gone");
  assert.equal(calls(), "toTop,commit", "the new result starts at the top");
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
  searchPanel: false,
  state: {
    checklists: rows(),
    items: items(),
    ui: { page: 4, newChecklist: "top", search: { text: "нет таких", lists: true, items: true } },
  },
  uid: () => "n1",
  flushPendingEdit: () => {},
  store: storeStub(),
  jumpTo: () => {},
  commit: () => {},
};

const { addChecklist, buildSearch: buildCreated } = sliceVm(
  [...SEARCH, "clearSearch", "addChecklist", "findList"],
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
  const { startDrag } = sliceVm(["startDrag"], box);
  startDrag();
  assert.equal(box.gesture.mode, "pending", "the hold never became a drag");
  assert.equal(box.drag, null);
});

/* ---------- the empty state ---------- */

const ONE = () => [list("l1", { title: "Работа" })];

// A fresh empty node and env per test, so a failing assert cannot leak into the next one.
function emptyHarness(found, checklists) {
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
    found,
    commits: 0,
  };
  return { env, ...sliceVm(["renderEmpty"], env) };
}

test("the plain empty state says there are no lists", () => {
  const none = emptyHarness(null, ONE());
  none.renderEmpty(0);
  assert.equal(none.env.empty.hidden, false);
  assert.deepEqual(none.env.empty.children.map((node) => node.text), ["empty"]);

  // Nothing to search in: still the plain message, not "no results".
  const empty = emptyHarness({ any: true }, []);
  empty.renderEmpty(0);
  assert.deepEqual(empty.env.empty.children.map((node) => node.text), ["empty"]);
});

test("no results says so, and offers the wider search only when it has something", () => {
  const narrow = emptyHarness({ any: false }, ONE());
  narrow.renderEmpty(0);
  assert.deepEqual(narrow.env.empty.children.map((node) => node.text), ["empty_search"]);

  const wide = emptyHarness({ any: true }, ONE());
  wide.renderEmpty(0);
  assert.deepEqual(wide.env.empty.children.map((node) => node.text), ["empty_search", "search_everywhere"]);

  wide.env.empty.children[1].listeners.click();
  assert.deepEqual(wide.env.state.ui.search, { text: "нет", lists: true, items: true });
  assert.equal(wide.env.state.ui.page, 1);
  assert.equal(wide.env.commits, 1);
});

test("results hide the empty state without building anything", () => {
  const { env, renderEmpty } = emptyHarness({ any: true }, ONE());
  renderEmpty(2);
  assert.equal(env.empty.hidden, true);
  assert.deepEqual(env.empty.children, []);
});
