// Unit tests for rowHandle(): which pointerdown starts a row gesture, and which does not.
// Since a long press now works from any control of a row, the only area that keeps its own
// pointer is the editor. The function is sliced out of index.html and run in a VM (see
// html-source.mjs) with duck-typed nodes.

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const box = {};
createContext(box);
runInContext([slice("rowHandle"), "this.rowHandle = rowHandle;"].join("\n"), box);
const rowHandle = box.rowHandle;

// Just enough Element for rowHandle(): closest(), classList, querySelector and dataset.
function node(classes, { id, children = [] } = {}) {
  const self = {
    classList: { contains: (name) => classes.includes(name) },
    dataset: id ? { id } : {},
    children,
    parent: null,
    matches(selectors) {
      return selectors.split(",").some((selector) => {
        const wanted = selector.trim().split(".").slice(1);
        return wanted.length > 0 && wanted.every((cls) => self.classList.contains(cls));
      });
    },
    closest(selectors) {
      for (let current = self; current; current = current.parent) {
        if (current.matches(selectors)) return current;
      }
      return null;
    },
    querySelector(selectors) {
      for (const child of self.children) {
        if (child.matches(selectors)) return child;
        const found = child.querySelector(selectors);
        if (found) return found;
      }
      return null;
    },
  };
  for (const child of children) child.parent = self;
  return self;
}

// Shaped like tpl-checklist / tpl-item: one card head and one item, each with a mover row,
// controls and a hidden editor. `id: null` builds the row without its data-id.
function board({ listId = "L1", itemId = "i1" } = {}) {
  const editor = (children) => node(["row-edit"], { children });
  const input = node(["input"]);
  const save = node(["act", "act--save"]);
  const collapse = node(["mark", "mark--toggle"]);
  const headMenu = node(["act", "act--menu"]);
  const add = node(["act", "act--add"]);
  const title = node(["card__title"]);
  const headRow = node(["card__row"], { children: [collapse, title, editor([input, save]), add, headMenu] });
  const head = node(["card__head"], { children: [headRow] });

  const check = node(["mark", "mark--check"]);
  const itemMenu = node(["act", "act--menu"]);
  const itemInput = node(["input"]);
  const itemSave = node(["act", "act--save"]);
  const text = node(["item__text"]);
  const itemRow = node(["item__row"], { children: [check, text, editor([itemInput, itemSave]), itemMenu] });
  const item = node(["item"], { id: itemId, children: [itemRow] });

  const card = node(["card"], { id: listId, children: [head, item] });
  return { card, head, headRow, collapse, title, add, headMenu, item, itemRow, check, text, itemMenu, input, save, itemInput, itemSave };
}

const shape = (hit) => (hit && { kind: hit.kind, id: hit.id });

test("a long press on an item control grabs the item", () => {
  const rows = board();
  for (const control of [rows.check, rows.text, rows.itemMenu]) {
    const hit = rowHandle(control);
    assert.deepEqual(shape(hit), { kind: "item", id: "i1" });
    assert.equal(hit.handle, rows.item);
    assert.equal(hit.mover, rows.itemRow);
    assert.equal(hit.row, rows.item);
  }
});

test("a long press on a checklist control grabs the list", () => {
  const rows = board();
  for (const control of [rows.collapse, rows.title, rows.add, rows.headMenu]) {
    const hit = rowHandle(control);
    assert.deepEqual(shape(hit), { kind: "list", id: "L1" });
    assert.equal(hit.handle, rows.head);
    assert.equal(hit.mover, rows.headRow);
    assert.equal(hit.row, rows.card);
  }
});

test("the editor keeps its pointer: caret and save still belong to the input", () => {
  const rows = board();
  for (const control of [rows.input, rows.save, rows.itemInput, rows.itemSave]) {
    assert.equal(rowHandle(control), null);
  }
});

test("a row without a data-id has nothing to drag", () => {
  assert.equal(rowHandle(board({ itemId: null }).check), null);
  assert.equal(rowHandle(board({ listId: null }).collapse), null);
});

test("a mover row that is not there is not a drag target", () => {
  const orphan = node(["item"], { id: "i9", children: [node(["mark", "mark--check"])] });
  assert.equal(rowHandle(orphan.children[0]), null);
});

test("a pointer that is not on a row is ignored", () => {
  const rows = board();
  assert.equal(rowHandle(rows.card), null, "the card wrapper is not a handle");
  assert.equal(rowHandle(node(["lists"])), null, "the list container is not a row");
  assert.equal(rowHandle({}), null, "a text node has no closest()");
  assert.equal(rowHandle(null), null);
  assert.equal(rowHandle(node(["elsewhere"])), null);
});
