// The search module through its interface: what a query lets through, what it opens, what it lights up.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list, plain } from "../../testkit/fixtures.mjs";
import { slice, sliceVm } from "../../testkit/html-source.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { createSearch } = sliceVm(["createSearch"]);

// Real module over a board; refresh once, then ask as render does.
function searched(checklists, items, ui = {}) {
  const state = { checklists, items, ui: { search: { text: "", lists: true, items: true }, ...ui } };
  const search = createSearch(() => state);
  search.refresh();
  return search;
}

const board = (ui) => searched([
  list("l1", { title: "Молоко" }),
  list("l2", { title: "Работа" }),
  list("l3", { title: "Пустое" }),
  list("l4", { title: "Архив", archived: true }),
], [
  item("i1", "l2", { text: "молоко из магазина" }),
  item("i2", "l3", { text: "что-то" }),
  item("i3", "l2", { text: "ни о чём" }),
], ui);

const ask = (search) => ({
  active: search.active,
  any: search.any,
  lists: ["l1", "l2", "l3", "l4"].filter((id) => search.allowsList(id)),
  items: ["i1", "i2", "i3"].filter((id) => search.allowsItem(id)),
  expanded: ["l1", "l2", "l3"].filter((id) => search.expands(id)),
});

test("no query, no scope: the search filters nothing and opens nothing", () => {
  assert.deepEqual(ask(board()), {
    active: false, any: false, lists: ["l1", "l2", "l3", "l4"], items: ["i1", "i2", "i3"], expanded: [],
  });
  assert.equal(searched([], [], { search: { text: "\u0301", lists: true, items: true } }).active, false);
  assert.equal(board({ search: { text: "\u0301", lists: true, items: true } }).active, false,
    "stored mark-only query: no hang on first render");
});

test("both scopes: a list is in by its name or by any of its items", () => {
  const found = board({ search: { text: "молоко", lists: true, items: true } });
  assert.deepEqual(ask(found), {
    active: true, any: true, lists: ["l1", "l2"], items: ["i1"], expanded: ["l2"],
  });
  assert.deepEqual(plain(found.rangesFor("l1")), [[0, 6]], "in by its own name, and lit");
  assert.equal(found.rangesFor("l2"), null, "in via an item only: name stays unlit");
  assert.deepEqual(plain(found.rangesFor("i1")), [[0, 6]]);
  assert.equal(found.rangesFor("i2"), null);
});

test("lists only: an item match stops counting, and nothing gets expanded", () => {
  const found = board({ search: { text: "молоко", lists: true, items: false } });
  assert.deepEqual(ask(found), {
    active: true, any: true, lists: ["l1"], items: ["i1", "i2", "i3"], expanded: [],
  });
  assert.deepEqual(plain(found.rangesFor("l1")), [[0, 6]], "a name in scope is lit");
  assert.equal(found.rangesFor("i1"), null, "an item that does not count is not lit either");
});

test("items only: the list name no longer saves it, a match opens it", () => {
  const found = board({ search: { text: "молоко", lists: false, items: true } });
  assert.deepEqual(ask(found), {
    active: true, any: true, lists: ["l2"], items: ["i1"], expanded: ["l2"],
  });
  assert.equal(found.rangesFor("l1"), null, "a name out of scope is not lit either");
});

test("both switches off stops filtering without erasing the query", () => {
  assert.equal(board({ search: { text: "молоко", lists: false, items: false } }).active, false);
});

test("archived rows are not searched, but a narrow miss still reports the wider one", () => {
  assert.equal(board({ search: { text: "Архив", lists: true, items: true } }).any, false);

  const narrow = board({ search: { text: "работа", lists: false, items: true } });
  assert.deepEqual(ask(narrow).lists, [], "the name is out of this scope");
  assert.equal(narrow.any, true, "it is there: offer the wider search");

  const wide = board({ search: { text: "магазин", lists: true, items: true } });
  assert.deepEqual(ask(wide), { active: true, any: true, lists: ["l2"], items: ["i1"], expanded: ["l2"] });
});

/* ---------- what gets lit up ---------- */

// [query, text, expected ranges, note?] - a piece may sit anywhere, in any order, at any distance.
test("every query piece has to be found, and the hits merge", () => {
  const rows = [
    ["ку", "стояла курица", [[7, 9]]],
    ["ку", "моя покупка", [[6, 8]]],
    ["с", "колесо", [[4, 5]]],
    ["ку", "колесо", null, "the piece is missing"],
    ["е я", "сегодня", [[1, 2], [6, 7]]],
    ["по з", "пошел в пизду", [[0, 2], [10, 11]]],
    ["купи ко", "купить сегодня молоко", [[0, 4], [19, 21]]],
    ["an a", "banana", [[1, 6]], "overlapping hits merge into one range"],
    ["FRANCAIS", "français", [[0, 8]], "case and diacritics are irrelevant on both sides"],
    ["çais", "français", [[4, 8]], "and the offsets are of the original text"],
    ["купи нет", "купить сегодня молоко", null, "one missing piece is enough"],
    ["что", "", null, "nothing to search in"],
  ];
  for (const [query, text, want, note] of rows) {
    const found = searched([list("l1", { title: text })], [], { search: { text: query, lists: true, items: true } });
    assert.deepEqual(plain(found.rangesFor("l1")), want, `"${query}" in "${text}": ${note ?? "ok"}`);
  }
});

test("a query of bare combining marks leaves no token and matches nothing", () => {
  const marks = searched([list("l1", { title: "колесо" })], [item("i1", "l1", { text: "колесо" })],
    { search: { text: "\u0301 \u0302 x", lists: true, items: true } });
  assert.equal(marks.active, true, "marks drop, the remaining token counts");
  assert.equal(marks.rangesFor("l1"), null);
});

/* ---------- how the app wires it ---------- */

// Painters read the last refresh: render must build it first.
test("render rebuilds the answer before it paints anything", () => {
  const body = slice("render");
  assert.ok(body.includes("search.refresh()"));
  assert.ok(body.indexOf("search.refresh()") < body.indexOf("renderChrome()"), "before the painters read it");
});

/* ---------- what storage is allowed to say ---------- */

const { api } = stateHarness(["normalizeSearch", "defaults"]);

test("a stored search keeps text and switches, anything else falls back", () => {
  assert.deepEqual(plain(api.normalizeSearch({ text: "ку", lists: false, items: true })),
    { text: "ку", lists: false, items: true });
  assert.deepEqual(plain(api.normalizeSearch({ text: 7, lists: "yes" })),
    { text: "", lists: true, items: true });
  assert.deepEqual(plain(api.normalizeSearch(undefined)), { text: "", lists: true, items: true });
  assert.deepEqual(plain(api.normalizeSearch("ку")), { text: "", lists: true, items: true });
});
