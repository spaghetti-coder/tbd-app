// Painting a search result: only the matching items survive in the body, the card opens without
// touching what the user left it as, and a match past the ellipsis pulls the line to it.

import assert from "node:assert/strict";
import test from "node:test";
import { list } from "../../testkit/fixtures.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";
import { idsOf, paintHarness, rowNode } from "../../testkit/render.mjs";

const itemRow = (id) => ({ id, checklistId: "L1" });
const byId = (id, ranges = [[0, 1]]) => new Map([[id, ranges]]);
const NONE = { byItems: true, expand: new Set(), visible: new Set(), items: new Map(), titles: new Map() };
const HIT = (id) => ({ byItems: true, expand: new Set(["L1"]), visible: new Set(["L1"]), items: byId(id), titles: new Map() });

test("only the matching items stay in the body of a searched list", () => {
  const { state, env, card, host, paintChecklist } = paintHarness([rowNode("i1"), rowNode("i2")]);
  state.items = [itemRow("i1"), itemRow("i2")];
  env.found = HIT("i1");
  paintChecklist(card, list("L1", { expanded: false }));
  assert.equal(idsOf(host), "i1");
});

test("a searched list opens without touching what the user left it as", () => {
  const { state, env, card, paintChecklist } = paintHarness([]);
  state.items = [itemRow("i1")];
  const cl = list("L1", { expanded: false });
  env.found = HIT("i1");
  paintChecklist(card, cl);
  assert.equal(card.open, true, "open for the search");
  assert.equal(card.querySelector(".card__body").hidden, false);
  assert.equal(cl.expanded, false, "the saved state is untouched");

  env.found = NONE;
  paintChecklist(card, cl);
  assert.equal(card.open, false, "left as the user had it");
  assert.equal(card.querySelector(".card__body").hidden, true);
});

test("lists-only search keeps every item inside", () => {
  const { state, env, card, host, paintChecklist } = paintHarness([rowNode("i1"), rowNode("i2")]);
  state.items = [itemRow("i1"), itemRow("i2")];
  env.found = { byItems: false, expand: new Set(), items: new Map(), titles: byId("L1") };
  paintChecklist(card, list("L1", { expanded: true }));
  assert.equal(idsOf(host), "i1,i2");
});

test("an empty body says what is empty", () => {
  const some = paintHarness([]);
  some.env.found = NONE;
  some.state.items = [itemRow("i1")];
  some.paintChecklist(some.card, list("L1", { expanded: true }));
  assert.equal(some.hint.hidden, false);
  assert.equal(some.hint.textContent, "empty_items_match", "items exist, none of them matches");

  const none = paintHarness([]);
  none.env.found = NONE;
  none.paintChecklist(none.card, list("L1", { expanded: true }));
  assert.equal(none.hint.textContent, "empty_items", "the list itself is empty");
});

/* ---------- the line itself ---------- */

const text = (n) => "x".repeat(n);

function label(id, rect, content) {
  const node = {
    children: [],
    textContent: "",
    dataset: { id },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    getBoundingClientRect: () => ({ right: rect }),
    closest: () => ({ dataset: { id } }),
  };
  if (content) node.children = [{ parentElement: node, getBoundingClientRect: () => ({ right: content }) }];
  return node;
}

const nodes = {};
const paintEnv = {
  document: {
    createTextNode: (value) => ({ text: value }),
    querySelectorAll: (selector) => {
      assert.equal(selector, "#lists .card__title mark, #lists .item__text mark");
      return Object.values(nodes);
    },
  },
  el: (tag, className, value) => ({ tag, className, text: value }),
  found: null,
};

const { paintText, fitMatches } = sliceVm(["HIT_LEAD", "hitRanges", "paintText", "fitMatches"], paintEnv);

test("text without a match stays a single string", () => {
  const node = label("i1", 0);
  paintText(node, "plain text", null);
  assert.equal(node.textContent, "plain text");
  assert.deepEqual(node.children, []);
});

test("matches become marks and keep the text around them", () => {
  const node = label("i1", 0);
  paintText(node, "купить молоко", [[3, 6], [8, 10]]);
  assert.deepEqual(node.children.map((part) => [part.tag ?? "", part.text]), [
    ["", "куп"], ["mark", "ить"], ["", " м"], ["mark", "ол"], ["", "око"],
  ]);
});

test("a match past the visible edge pulls the line to it", () => {
  const node = label("i9", 100, 300);
  node.textContent = text(60);
  nodes.m = node.children[0];
  paintEnv.found = { items: byId("i9", [[40, 42]]), titles: new Map() };
  fitMatches();
  assert.equal(node.children[0].text, "…", "what fell off is behind an ellipsis");
  assert.equal(node.children[1].text, text(8), "the line starts eight chars before the match");
  assert.equal(node.children[2].text, "xx", "and the match itself is marked");
  delete nodes.m;
});

test("a match that is already visible is left alone", () => {
  const node = label("i9", 100, 60);
  node.textContent = text(60);
  nodes.m = node.children[0];
  paintEnv.found = { items: byId("i9", [[40, 42]]), titles: new Map() };
  fitMatches();
  assert.equal(node.children.length, 1, "re-painted only when it had to be");
  delete nodes.m;
});

/* ---------- one row under a running search ---------- */

function rowHarness(found) {
  const hit = { id: "i1", checklistId: "L1", text: "молоко" };
  const card = fakeNode({ classes: ["card"], kind: "list", id: "L1", children: [
    fakeNode({ classes: ["item"], kind: "item", id: "i1" }),
  ] });
  const painted = [];
  const rebuilt = [];
  const env = {
    state: { items: [hit] },
    found,
    findList: (id) => (id === "L1" ? { id: "L1", expanded: true } : null),
    findItem: (id) => (id === "i1" ? hit : null),
    isMuted: () => false,
    withoutArchived: (items) => items,
    paintChecklist: (node, cl) => painted.push(`list:${cl.id}`),
    paintItem: (node, item) => painted.push(`item:${item.id}`),
    rowById: (kind, id) => (kind === "item" && id === "i1" ? card.children[0] : null),
    render: () => rebuilt.push("render"),
    renderPanel: () => {},
    maybeReload: () => {},
  };
  return { card, itemRow: card.children[0], painted, rebuilt, ...sliceVm(["paintRow", "repaintRow"], env) };
}

test("a row the search keeps is painted in place", () => {
  const { itemRow, painted, paintRow } = rowHarness(HIT("i1"));
  assert.equal(paintRow(itemRow, "item", "i1"), true);
  assert.deepEqual(painted, ["item:i1"]);
});

test("a row the item search dropped needs a rebuild", () => {
  const { itemRow, painted, paintRow } = rowHarness(NONE);
  assert.equal(paintRow(itemRow, "item", "i1"), false);
  assert.deepEqual(painted, [], "nothing is painted for a row that is leaving");
});

test("a search over lists alone never drops an item row", () => {
  const { itemRow, painted, paintRow } = rowHarness({ ...NONE, byItems: false });
  assert.equal(paintRow(itemRow, "item", "i1"), true);
  assert.deepEqual(painted, ["item:i1"]);
});

test("a list the search dropped needs a rebuild", () => {
  const kept = rowHarness({ ...NONE, visible: new Set(["L1"]) });
  assert.equal(kept.paintRow(kept.card, "list", "L1"), true);
  assert.deepEqual(kept.painted, ["list:L1"]);

  const dropped = rowHarness(NONE);
  assert.equal(dropped.paintRow(dropped.card, "list", "L1"), false);
  assert.deepEqual(dropped.painted, []);
});

test("only a row that leaves the result takes the rebuild", () => {
  const stays = rowHarness(HIT("i1"));
  stays.repaintRow("item", "i1");
  assert.deepEqual(stays.painted, ["item:i1"]);
  assert.deepEqual(stays.rebuilt, [], "a row that stays is patched in place");

  const leaves = rowHarness(NONE);
  leaves.repaintRow("item", "i1");
  assert.deepEqual(leaves.painted, [], "a leaving row is not patched");
  assert.deepEqual(leaves.rebuilt, ["render"], "the rebuild takes it out");

  const fresh = rowHarness(HIT("i9"));
  fresh.repaintRow("item", "i9");
  assert.deepEqual(fresh.rebuilt, ["render"], "a row that just entered the result is rendered");
});
