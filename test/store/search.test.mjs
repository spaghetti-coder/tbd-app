// Query folding and the scope matrix: what the search lets through, and what it lights up.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list } from "../../testkit/fixtures.mjs";
import { slice, vm } from "../../testkit/html-source.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { fold, searchTokens, matchRanges } = vm(
  [slice("folded"), slice("fold"), slice("searchTokens"), slice("matchRanges"),
    "({ fold, searchTokens, matchRanges })"],
);

// Values built inside the VM carry that realm's prototypes, so compare plain copies of them.
const plain = (value) => JSON.parse(JSON.stringify(value));
const hits = (text, query) => plain(matchRanges(text, searchTokens(query)));

test("fold ignores case and diacritics and keeps its offsets mapped to the original", () => {
  assert.equal(fold("français").s, "francais");
  assert.deepEqual(plain(fold("français").map), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(fold("É").s, "e");
  assert.deepEqual(plain(fold("É").map), [0]);
});

test("a query of one piece matches wherever it sits in the text", () => {
  assert.deepEqual(hits("стояла курица", "ку"), [[7, 9]]);
  assert.deepEqual(hits("моя покупка", "ку"), [[6, 8]]);
  assert.deepEqual(hits("колесо", "с"), [[4, 5]]);
  assert.equal(hits("колесо", "ку"), null);
});

test("pieces of a query may come in any order and any distance apart", () => {
  assert.deepEqual(hits("сегодня", "е я"), [[1, 2], [6, 7]]);
  assert.deepEqual(hits("пошел в пизду", "по з"), [[0, 2], [10, 11]]);
  assert.deepEqual(hits("купить сегодня молоко", "купи ко"), [[0, 4], [19, 21]]);
});

test("accents and case are irrelevant on both sides", () => {
  assert.deepEqual(hits("français", "FRANCAIS"), [[0, 8]]);
  assert.deepEqual(hits("français", "çais"), [[4, 8]]);
});

test("overlapping hits merge into one range", () => {
  assert.deepEqual(hits("banana", "an a"), [[1, 6]]);
});

test("a query of bare combining marks leaves no token and matches nothing", () => {
  assert.deepEqual(plain(searchTokens("\u0301 \u0302 x")), ["x"]);
  assert.equal(hits("колесо", "\u0301"), null, "and does not loop over an empty token");
});

test("a piece missing from the text is out, however well the rest fits", () => {
  assert.equal(hits("купить сегодня молоко", "купи нет"), null);
  assert.equal(hits("", "что"), null);
});

/* ---------- which rows a query lets through ---------- */

const { api, store } = stateHarness([
  "buildSearch",
  "matchedRows",
  "matchRanges",
  "searchTokens",
  "folded",
  "fold",
  "normalizeSearch",
  "defaults",
]);

const board = (ui) => {
  store([
    list("l1", { title: "Молоко" }),
    list("l2", { title: "Работа" }),
    list("l3", { title: "Пустое" }),
    list("l4", { title: "Архив", archived: true }),
  ], [
    item("i1", "l2", { text: "молоко из магазина" }),
    item("i2", "l3", { text: "что-то" }),
    item("i3", "l2", { text: "ни о чём" }),
  ], ui);
  return api.buildSearch();
};

test("both scopes: a list is in by its name or by any of its items", () => {
  const found = board({ search: { text: "молоко", lists: true, items: true } });
  assert.deepEqual([...found.visible].sort(), ["l1", "l2"]);
  assert.deepEqual([...found.expand], ["l2"]);
  assert.deepEqual([...found.titles.keys()], ["l1"]);
  assert.deepEqual([...found.items.keys()], ["i1"]);
  assert.equal(found.byItems, true);
  assert.equal(found.any, true);
});

test("lists only: an item match stops counting, and nothing gets expanded", () => {
  const found = board({ search: { text: "молоко", lists: true, items: false } });
  assert.deepEqual([...found.visible], ["l1"]);
  assert.equal(found.expand.size, 0);
  assert.equal(found.items.size, 0);
  assert.equal(found.byItems, false);
  assert.equal(found.any, true);
});

test("items only: the list name no longer saves it, a match expands it", () => {
  const found = board({ search: { text: "молоко", lists: false, items: true } });
  assert.deepEqual([...found.visible], ["l2"]);
  assert.deepEqual([...found.expand], ["l2"]);
  assert.equal(found.titles.size, 0);
  assert.equal(found.any, true);
});

test("an empty scope and an empty query apply no filter at all", () => {
  assert.equal(board({ search: { text: "молоко", lists: false, items: false } }), null);
  assert.equal(board({ search: { text: "   ", lists: true, items: true } }), null);
  assert.equal(board({ search: { text: "\u0301", lists: true, items: true } }), null,
    "a stored mark-only query must not hang the first render either");
});

test("archived rows are not searched, but a narrow miss still reports the wider one", () => {
  const narrow = board({ search: { text: "работа", lists: false, items: true } });
  assert.equal(narrow.visible.size, 0);
  assert.equal(narrow.any, true, "the name is there, just not in this scope");

  assert.equal(board({ search: { text: "Архив", lists: true, items: true } }).any, false, "archived");

  const wide = board({ search: { text: "магазин", lists: true, items: true } });
  assert.deepEqual([...wide.visible], ["l2"]);
  assert.deepEqual([...wide.expand], ["l2"]);
});

/* ---------- what storage is allowed to say ---------- */

test("a stored search keeps text and switches, anything else falls back", () => {
  assert.deepEqual(plain(api.normalizeSearch({ text: "ку", lists: false, items: true })),
    { text: "ку", lists: false, items: true });
  assert.deepEqual(plain(api.normalizeSearch({ text: 7, lists: "yes" })),
    { text: "", lists: true, items: true });
  assert.deepEqual(plain(api.normalizeSearch(undefined)), { text: "", lists: true, items: true });
  assert.deepEqual(plain(api.normalizeSearch("ку")), { text: "", lists: true, items: true });
});
