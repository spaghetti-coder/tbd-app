// The row view over the shipped templates: parts, painting.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list, plain } from "../../testkit/fixtures.mjs";
import { cardNode, ids, itemNode, marks, q, rowHarness, ui } from "../../testkit/row-dom.mjs";

const I1 = item("i1", "L1", { text: "buy oat milk" });
const I2 = item("i2", "L1", { text: "fix the shelf", done: true });
const GARAGE = list("L1", { title: "Garage" });

// scopes decide what counts & what lights up.
const searching = (text, scopes = { lists: false, items: true }) =>
  ui({ search: { text, ...scopes } });

/* --- parts --- */

test("a card's parts are its own", () => {
  const { view } = rowHarness();
  const p = view.parts(cardNode());
  assert.equal(p.mark.classList.contains("mark--toggle"), true);
  assert.equal(p.title.classList.contains("card__title"), true);
  assert.equal(p.zone.classList.contains("card__head"), true);
  assert.equal(p.pick.classList.contains("mark--bulk"), true);
  assert.notEqual(p.items, null);
  assert.notEqual(p.add, null);
  assert.notEqual(p.edit, null);
});

test("an item row has no list-only parts", () => {
  const { view } = rowHarness();
  const p = view.parts(itemNode());
  assert.equal(p.mark.classList.contains("mark--check"), true);
  assert.equal(p.zone.classList.contains("item__row"), true);
  assert.equal(p.add, null);
  assert.equal(p.edit, null);
  assert.equal(p.body, null);
});

test("parts are resolved once per node", () => {
  const { view } = rowHarness();
  const node = itemNode();
  assert.equal(view.parts(node), view.parts(node));
});

/* --- an item --- */

test("an item says what it is", () => {
  const { view } = rowHarness();
  const row = view.paint(itemNode(), I1);
  assert.deepEqual(plain(row.dataset), { kind: "item", id: "i1" });
  assert.equal(row.classList.contains("is-done"), false);
  const check = q(row, ":scope > .item__row > .mark--check");
  assert.equal(check.getAttribute("role"), "checkbox");
  assert.equal(check.getAttribute("aria-checked"), "false");
  assert.equal(check.getAttribute("aria-label"), "buy oat milk");
  assert.equal(q(row, ".item__text").textContent, "buy oat milk");
});

test("a done item is marked done", () => {
  const { view } = rowHarness();
  const row = view.paint(itemNode(), I2);
  assert.equal(row.classList.contains("is-done"), true);
  assert.equal(q(row, ".mark--check").getAttribute("aria-checked"), "true");
  assert.equal(q(row, ".mark__box").textContent.includes("✓"), true, "the check glyph is in");
});

test("a search match lights up in the row", () => {
  const h = rowHarness({ checklists: [GARAGE], items: [I1], ui: searching("milk") });
  h.search.refresh();
  assert.deepEqual(marks(q(h.view.paint(itemNode(), I1), ".item__text")), ["milk"]);
});

test("a dropped row paints no marks", () => {
  const h = rowHarness({ checklists: [GARAGE], items: [I1], ui: searching("noise") });
  h.search.refresh();
  assert.deepEqual(marks(q(h.view.paint(itemNode(), I1), ".item__text")), []);
});

test("bulk mode swaps the checkbox for the pick", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [], ui: ui({ bulk: { kind: "item", ids: ["i1"] } }) });
  const picked = view.paint(itemNode(), I1);
  assert.equal(q(picked, ".mark--bulk").hidden, false);
  assert.equal(q(picked, ".mark--check").hidden, true, "the real checkbox is out");
  assert.equal(q(picked, ".mark--bulk").getAttribute("aria-checked"), "true");
  assert.equal(q(view.paint(itemNode(), I2), ".mark--bulk").getAttribute("aria-checked"), "false");
});

test("the other kind's selection leaves the row alone", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [], ui: ui({ bulk: { kind: "list", ids: ["L1"] } }) });
  const row = view.paint(itemNode(), I1);
  assert.equal(q(row, ".mark--bulk").hidden, true);
  assert.equal(q(row, ".mark--check").hidden, false);
});

test("the editor opens on the editing row and closes on the others", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [], ui: ui({ editing: { kind: "item", id: "i1" } }) });
  const open = view.paint(itemNode(), I1);
  assert.equal(q(open, ".row-edit").hidden, false);
  assert.equal(q(open, ".item__text").hidden, true, "the label steps out");
  assert.equal(q(open, ".row-edit input").value, "buy oat milk");
  assert.equal(q(open, ".row-edit input").placeholder, "edit_item_ph");
  assert.equal(q(open, ".row-edit input").getAttribute("aria-label"), "edit_item_ph");
  assert.equal(q(open, ".act--save").getAttribute("aria-label"), "a_save");
  const closed = view.paint(itemNode(), I2);
  assert.equal(q(closed, ".row-edit").hidden, true);
  assert.equal(q(closed, ".item__text").hidden, false);
});

test("a nameless row asks for the new-row placeholder", () => {
  const h = rowHarness({ checklists: [GARAGE], items: [], ui: ui({ editing: { kind: "item", id: "i1" } }) });
  const row = h.view.paint(itemNode(), { ...I1, text: "" });
  assert.equal(q(row, ".row-edit input").placeholder, "new_item_ph");
  assert.equal(h.focusAsked(), true, "asks render for focus");
});

/* --- a checklist --- */

test("a card head speaks its open state", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [], ui: ui() });
  const card = view.paint(cardNode(), GARAGE);
  assert.deepEqual(plain(card.dataset), { kind: "list", id: "L1" });
  const toggle = q(card, ":scope > .card__head > .card__row > .mark--toggle");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(toggle.getAttribute("aria-label"), "Garage");
  assert.equal(q(toggle, ".ic").classList.contains("ic--chevron-down"), true);
  assert.equal(q(toggle, ".ic-alt").textContent, "⌄");
  assert.equal(q(card, ".act--add").hidden, false, "an open list offers an item");
  assert.equal(q(card, ".act--add").getAttribute("title"), "add_item", "icon-only buttons tooltip");
  assert.equal(q(card, ".act--edit").getAttribute("aria-label"), "a_edit");
  assert.equal(q(card, ".act--menu").getAttribute("aria-label"), "a_menu");
});

test("a closed head flips the chevron and hides the add button", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [], ui: ui() });
  const card = view.paint(cardNode(), { ...GARAGE, expanded: false });
  const toggle = q(card, ".mark--toggle");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(q(toggle, ".ic").classList.contains("ic--chevron-right"), true);
  assert.equal(q(card, ".act--add").hidden, true);
});

test("a head opened by the search cannot be collapsed", () => {
  const h = rowHarness({
    checklists: [GARAGE],
    items: [item("i9", "L1", { text: "drill bits" })],
    ui: searching("drill"),
  });
  h.search.refresh();
  const card = h.view.paint(cardNode(), { ...GARAGE, expanded: false });
  assert.equal(h.search.expands("L1"), true);
  assert.equal(q(card, ".mark--toggle").disabled, true, "not opened by the user");
});

test("goto appears on a title match only", () => {
  const hit = rowHarness({ checklists: [GARAGE], items: [], ui: searching("gar", { lists: true, items: true }) });
  hit.search.refresh();
  const card = hit.view.paint(cardNode(), GARAGE);
  assert.equal(q(card, ".act--goto").hidden, false);
  assert.deepEqual(marks(q(card, ".card__title")), ["Gar"], "the mark keeps the text's case");

  const miss = rowHarness({ checklists: [GARAGE], items: [], ui: searching("noise", { lists: true, items: true }) });
  miss.search.refresh();
  assert.equal(q(miss.view.paint(cardNode(), GARAGE), ".act--goto").hidden, true);
});

test("a card with every item done is muted", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [I1, I2], ui: ui() });
  assert.equal(view.paint(cardNode(), GARAGE).classList.contains("is-muted"), false);

  const all = rowHarness({ checklists: [GARAGE], items: [{ ...I1, done: true }, I2], ui: ui() });
  assert.equal(all.view.paint(cardNode(), GARAGE).classList.contains("is-muted"), true);
});

test("an empty body says which empty it is", () => {
  const empty = rowHarness({ checklists: [GARAGE], items: [], ui: ui() });
  const card = empty.view.paint(cardNode(), GARAGE);
  assert.equal(q(card, ".card__empty").hidden, false);
  assert.equal(q(card, ".card__empty").textContent, "empty_items");

  const searched = rowHarness({
    checklists: [GARAGE],
    items: [I1],
    ui: searching("noise"),
  });
  searched.search.refresh();
  const searchedCard = searched.view.paint(cardNode(), GARAGE);
  assert.equal(q(searchedCard, ".card__empty").hidden, false);
  assert.equal(q(searchedCard, ".card__empty").textContent, "empty_items_match", "items exist, none matches");
});

/* --- the body --- */

test("a card paints its items from state", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [I1, I2], ui: ui() });
  const card = view.paint(cardNode(), GARAGE);
  assert.equal(card.classList.contains("is-open"), true);
  assert.equal(ids(q(card, ".items")), "i1,i2");
  assert.equal(q(card, ".card__empty").hidden, true);
});

test("rows that stay keep their own nodes", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [I1, I2], ui: ui() });
  const host = view.parts(cardNode()).items;
  view.sync(host, [I1, I2]);
  const [a, b] = [...host.children];
  view.sync(host, [I2, I1]);
  assert.equal(ids(host), "i2,i1");
  assert.equal(host.children[0], b, "moved, not rebuilt");
  assert.equal(host.children[1], a);
});

test("a joining row is built, the rest are left alone", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [I1, I2], ui: ui() });
  const host = view.parts(cardNode()).items;
  view.sync(host, [I1]);
  const a = host.children[0];
  view.sync(host, [I1, I2]);
  assert.equal(ids(host), "i1,i2");
  assert.equal(host.children[0], a);
  assert.equal(host.children[1], q(host, "[data-id='i2']"));
});

test("only matching items stay in a searched body", () => {
  const h = rowHarness({
    checklists: [GARAGE],
    items: [item("i1", "L1", { text: "milk" }), item("i2", "L1", { text: "oil" })],
    ui: searching("milk"),
  });
  h.search.refresh();
  const card = h.view.paint(cardNode(), { ...GARAGE, expanded: false });
  assert.equal(ids(q(card, ".items")), "i1");
});

test("a searched list opens, the saved state untouched", () => {
  const h = rowHarness({ checklists: [GARAGE], items: [item("i1", "L1", { text: "milk" })], ui: searching("milk") });
  h.search.refresh();
  const kept = { ...GARAGE, expanded: false };
  const card = h.view.paint(cardNode(), kept);
  assert.equal(card.classList.contains("is-open"), true);
  assert.equal(q(card, ".card__body").hidden, false);
  assert.equal(kept.expanded, false, "saved state untouched");
});

test("lists-only search keeps every item inside", () => {
  const h = rowHarness({
    checklists: [GARAGE],
    items: [item("i1", "L1", { text: "milk" }), item("i2", "L1", { text: "oil" })],
    ui: searching("garage", { lists: true, items: false }),
  });
  h.search.refresh();
  const card = h.view.paint(cardNode(), GARAGE);
  assert.equal(ids(q(card, ".items")), "i1,i2");
});

test("a closed card keeps its rows off screen", () => {
  const { view } = rowHarness({ checklists: [GARAGE], items: [I1], ui: ui() });
  const card = view.paint(cardNode(), { ...GARAGE, expanded: false });
  assert.equal(card.classList.contains("is-open"), false);
  assert.equal(q(card, ".card__body").hidden, true);
  assert.equal(ids(q(card, ".items")), "", "a closed card paints no rows");
});
