// Who holds focus after a repaint: the same control, its successor, or the list.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";

let taken = [];

// Only the contract the keeper asks.
const button = (act, { enabled = true, box = true } = {}) => ({
  act,
  disabled: !enabled,
  getClientRects: () => (box ? [{}] : []),
  focus() {
    taken.push(this);
  },
});

const actOf = (selectors) => /data-act="([^"]+)"/.exec(selectors)[1];

const row = (kind, id, acts = {}, input = null) => ({ dataset: { kind, id }, acts, input });

// Rows sit in a host; item rows in a card's body.
const host = (children, card = null) => {
  const node = { children, closest: () => card };
  children.forEach((child) => {
    child.parentElement = node;
  });
  return node;
};

const card = (id, body) => ({
  dataset: { kind: "list", id },
  querySelector: (selectors) => (selectors === ".items" ? body : null),
});

const trigger = (act, { to = null, panel = null } = {}) => ({
  tagName: "BUTTON",
  getAttribute: (key) => (key === "data-act" ? act : null),
  closest: (selectors) => (selectors === "#panel" ? panel : to),
});

function keeper({ active, rows = {}, panel = null, editing = null }) {
  taken = [];
  const lists = {
    focus() {
      taken.push(this);
    },
  };
  const focus = sliceVm(["createFocusKeeper"], {
    byId: () => lists,
    document: {
      body: {},
      activeElement: active,
      querySelector: (selectors) => (selectors.startsWith("#panel") ? panel : null),
    },
  }).createFocusKeeper({
    getState: () => ({ ui: { editing } }),
    rowById: (kind, id) => rows[`${kind}:${id}`] ?? null,
    parts: (node) => ({
      zone: { querySelector: (selectors) => node.acts?.[actOf(selectors)] ?? null },
      input: node.input ?? null,
    }),
  });
  return { focus, lists };
}

test("a repaint hands the same control back", () => {
  const again = button("menu");
  const itemRow = row("item", "i1", { menu: again });
  host([itemRow]);
  const { focus } = keeper({
    active: trigger("menu", { to: itemRow }),
    rows: { "item:i1": itemRow },
  });
  focus.capture();
  focus.restore();
  assert.equal(taken[0], again);
});

test("a row off the page hands the action to its successor", () => {
  const next = button("menu");
  const gone = row("item", "i1", {});
  const standIn = row("item", "i2", { menu: next });
  const body = host([gone, standIn]);
  const list = card("L1", body);
  gone.parentElement.closest = () => list;
  const { focus } = keeper({
    active: trigger("menu", { to: gone }),
    rows: { "list:L1": list },
  });
  focus.capture();
  body.children.shift();
  focus.restore();
  assert.equal(taken[0], next);
});

test("a panel button is looked up in the panel", () => {
  const grip = button("panel-toggle");
  const { focus } = keeper({ active: trigger("panel-toggle", { panel: {} }), panel: grip });
  focus.capture();
  focus.restore();
  assert.equal(taken[0], grip);
});

test("a control that cannot take focus leaves it with the list", () => {
  for (const [why, props] of [["disabled", { enabled: false }], ["no box to show", { box: false }]]) {
    const dead = button("menu", props);
    const itemRow = row("item", "i1", { menu: dead });
    host([itemRow]);
    const { focus, lists } = keeper({
      active: trigger("menu", { to: itemRow }),
      rows: { "item:i1": itemRow },
    });
    focus.capture();
    focus.restore();
    assert.equal(taken[0], lists, why);
  }
});

test("an input owns its own focus: nothing is remembered", () => {
  const { focus } = keeper({ active: { tagName: "INPUT" } });
  focus.capture();
  focus.restore();
  assert.deepEqual(taken, []);
});

test("a control that is nobody's action is not remembered either", () => {
  const { focus } = keeper({ active: { tagName: "BUTTON", getAttribute: () => null } });
  focus.capture();
  focus.restore();
  assert.deepEqual(taken, []);
});

test("a row painted into the editor takes the caret to the end of its text", () => {
  const caret = [];
  const input = {
    value: "молоко",
    focus() {
      taken.push(this);
    },
    setSelectionRange: (from, to) => caret.push([from, to]),
  };
  const itemRow = row("item", "i1", {}, input);
  host([itemRow]);
  const { focus } = keeper({
    active: null,
    rows: { "item:i1": itemRow },
    editing: { kind: "item", id: "i1" },
  });
  focus.ask();
  focus.restore();
  assert.equal(taken[0], input);
  assert.deepEqual(caret, [[6, 6]]);
});

test("an ask is spent on the repaint that comes", () => {
  const input = {
    value: "x",
    focus() {
      taken.push(this);
    },
    setSelectionRange: () => {},
  };
  const itemRow = row("item", "i1", {}, input);
  host([itemRow]);
  const { focus } = keeper({
    active: null,
    rows: { "item:i1": itemRow },
    editing: { kind: "item", id: "i1" },
  });
  focus.ask();
  focus.restore();
  assert.equal(taken.length, 1);
  focus.restore();
  assert.equal(taken.length, 1, "a second repaint gets no unasked focus");
});

test("an editor that never got painted is no error", () => {
  const { focus } = keeper({ active: null, rows: {}, editing: { kind: "item", id: "gone" } });
  focus.ask();
  focus.restore();
  assert.deepEqual(taken, []);
});
