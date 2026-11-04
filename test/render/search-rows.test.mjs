// Painting a search result: only the matching items survive in the body, the card opens without
// touching what the user left it as, and a match past the ellipsis pulls the line to it.

import assert from "node:assert/strict";
import test from "node:test";
import { item, list } from "../../testkit/fixtures.mjs";
import { slice, vm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

const state = { items: [] };
let painted = [];

const env = {
  state,
  found: null,
  t: (key) => key,
  isMuted: () => false,
  paintHead: (node, cl, open) => {
    node.open = open;
  },
  withoutArchived: (items, checklistId) => items.filter((i) => i.checklistId === checklistId && !i.archived),
  paintItem: (node) => painted.push(node.dataset.id),
  buildItem: (row) => {
    painted.push(row.id);
    return fakeNode({ classes: ["item"], id: row.id });
  },
};

const { paintChecklist } = vm(
  [slice("reconcile"), slice("paintChecklist"), "({ paintChecklist })"],
  env,
);

function board(rows) {
  painted = [];
  const host = fakeNode({ classes: ["items"], children: rows });
  const hint = fakeNode({ classes: ["card__empty"] });
  const card = fakeNode({ classes: ["card"], kind: "list", id: "L1", children: [
    fakeNode({ classes: ["card__body"], children: [hint, host] }),
  ] });
  return { card, host, hint };
}

const row = (id) => fakeNode({ classes: ["item"], id });
const itemRow = (id) => ({ id, checklistId: "L1" });
const byId = (id, ranges = [[0, 1]]) => new Map([[id, ranges]]);

test("only the matching items stay in the body of a searched list", () => {
  const [a, b] = [row("i1"), row("i2")];
  const { card, host } = board([a, b]);
  state.items = [itemRow("i1"), itemRow("i2")];
  env.found = { byItems: true, expand: new Set(["L1"]), items: byId("i1"), titles: new Map() };
  paintChecklist(card, list("L1", { expanded: false }));
  assert.deepEqual(host.children.map((node) => node.dataset.id), ["i1"]);
});

test("a searched list opens without touching what the user left it as", () => {
  const { card } = board([]);
  state.items = [itemRow("i1")];
  const cl = list("L1", { expanded: false });
  env.found = { byItems: true, expand: new Set(["L1"]), items: byId("i1"), titles: new Map() };
  paintChecklist(card, cl);
  assert.equal(card.open, true, "open for the search");
  assert.equal(card.querySelector(".card__body").hidden, false);
  assert.equal(cl.expanded, false, "the saved state is untouched");

  env.found = { byItems: true, expand: new Set(), items: new Map(), titles: new Map() };
  paintChecklist(card, cl);
  assert.equal(card.open, false, "left as the user had it");
  assert.equal(card.querySelector(".card__body").hidden, true);
});

test("lists-only search keeps every item inside", () => {
  const [a, b] = [row("i1"), row("i2")];
  const { card, host } = board([a, b]);
  state.items = [itemRow("i1"), itemRow("i2")];
  env.found = { byItems: false, expand: new Set(), items: new Map(), titles: byId("L1") };
  paintChecklist(card, list("L1", { expanded: true }));
  assert.deepEqual(host.children.map((node) => node.dataset.id), ["i1", "i2"]);
});

test("an empty body says what is empty", () => {
  state.items = [itemRow("i1")];
  env.found = { byItems: true, expand: new Set(), items: new Map(), titles: new Map() };
  const nothing = board([]);
  paintChecklist(nothing.card, list("L1", { expanded: true }));
  assert.equal(nothing.hint.hidden, false);
  assert.equal(nothing.hint.textContent, "empty_items_match", "items exist, none of them matches");

  state.items = [];
  const empty = board([]);
  paintChecklist(empty.card, list("L1", { expanded: true }));
  assert.equal(empty.hint.textContent, "empty_items", "the list itself is empty");
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

const { paintText, fitMatches } = vm(
  [slice("HIT_LEAD"), slice("hitRanges"), slice("paintText"), slice("fitMatches"), "({ paintText, fitMatches })"],
  paintEnv,
);

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
