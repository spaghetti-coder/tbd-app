// Painting under a running search: a match past the ellipsis pulls the line to
// it, and a row the query dropped takes the rebuild instead of a patch.

import assert from "node:assert/strict";
import test from "node:test";
import { searchStub } from "../../testkit/fixtures.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";

const NONE = searchStub({ active: true, allowsList: () => false, allowsItem: () => false });
const HIT = (id) => searchStub({
  active: true,
  allowsList: (id) => id === "L1",
  allowsItem: (row) => row === id,
  expands: () => true,
  matched: (kind, row) => kind === "item" && row === id,
});
// Names-only search: every item of a list that is in stays inside.
const BY_NAME = searchStub({ active: true, allowsList: () => true });

/* --- the line itself --- */

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
  search: searchStub(),
};

const { paintText, fitMatches } = sliceVm(["HIT_LEAD", "paintText", "fitMatches"], paintEnv);

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
  paintEnv.search = searchStub({ active: true, rangesFor: (id) => (id === "i9" ? [[40, 42]] : null) });
  fitMatches();
  assert.equal(node.children[0].text, "…", "what fell off is behind an ellipsis");
  assert.equal(node.children[1].text, text(8), "the line starts 8 chars before the match");
  assert.equal(node.children[2].text, "xx", "and the match itself is marked");
  delete nodes.m;
});

test("a match that is already visible is left alone", () => {
  const node = label("i9", 100, 60);
  node.textContent = text(60);
  nodes.m = node.children[0];
  paintEnv.search = searchStub({ active: true, rangesFor: (id) => (id === "i9" ? [[40, 42]] : null) });
  fitMatches();
  assert.equal(node.children.length, 1, "repainted only when needed");
  delete nodes.m;
});

test("with no search there is nothing to fit", () => {
  const node = label("i9", 100, 300);
  node.textContent = text(60);
  nodes.m = node.children[0];
  paintEnv.search = searchStub();
  fitMatches();
  assert.equal(node.children.length, 1, "the painted line is left as it was");
  delete nodes.m;
});

/* --- one row under a running search --- */

function rowHarness(search) {
  const hit = { id: "i1", checklistId: "L1", text: "молоко" };
  const card = fakeNode({ classes: ["card"], kind: "list", id: "L1", children: [
    fakeNode({ classes: ["item"], kind: "item", id: "i1" }),
  ] });
  const painted = [];
  const rebuilt = [];
  const env = {
    state: { items: [hit] },
    search,
    findList: (id) => (id === "L1" ? { id: "L1", expanded: true } : null),
    findItem: (id) => (id === "i1" ? hit : null),
    isMuted: () => false,
    withoutArchived: (items) => items,
    rowView: {
      paint: (node, row) => painted.push(`${row.checklistId === undefined ? "list" : "item"}:${row.id}`),
    },
    rowById: (kind, id) => (kind === "item" && id === "i1" ? card.children[0] : null),
    render: () => rebuilt.push("render"),
    renderPanel: () => {},
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
  const { itemRow, painted, paintRow } = rowHarness(BY_NAME);
  assert.equal(paintRow(itemRow, "item", "i1"), true);
  assert.deepEqual(painted, ["item:i1"]);
});

test("a list the search dropped needs a rebuild", () => {
  const kept = rowHarness(searchStub({ active: true }));
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
  assert.deepEqual(fresh.rebuilt, ["render"], "a row entering the result is rendered");
});
