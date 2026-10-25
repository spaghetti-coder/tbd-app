// Which pointerdown starts a row drag, and which controls keep their own pointer.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";
import { fakeNode } from "./fake-dom.mjs";

const { rowHandle } = vm([slice("rowHandle"), "({ rowHandle })"]);

// Shaped like tpl-checklist / tpl-item: one card head and one item, each with a mover row,
// controls and a hidden editor. `id: null` builds the row without its data-id.
function board({ listId = "L1", itemId = "i1" } = {}) {
  const editor = (children) => fakeNode({ classes: ["row-edit"], children });
  const input = fakeNode({ classes: ["input"] });
  const save = fakeNode({ classes: ["act", "act--save"] });
  const collapse = fakeNode({ classes: ["mark", "mark--toggle"] });
  const headMenu = fakeNode({ classes: ["act", "act--menu"] });
  const add = fakeNode({ classes: ["act", "act--add"] });
  const title = fakeNode({ classes: ["card__title"] });
  const headRow = fakeNode({ classes: ["card__row"], children: [collapse, title, editor([input, save]), add, headMenu] });
  const head = fakeNode({ classes: ["card__head"], children: [headRow] });

  const check = fakeNode({ classes: ["mark", "mark--check"] });
  const itemMenu = fakeNode({ classes: ["act", "act--menu"] });
  const itemInput = fakeNode({ classes: ["input"] });
  const itemSave = fakeNode({ classes: ["act", "act--save"] });
  const text = fakeNode({ classes: ["item__text"] });
  const itemRow = fakeNode({ classes: ["item__row"], children: [check, text, editor([itemInput, itemSave]), itemMenu] });
  const item = fakeNode({ classes: ["item"], id: itemId, children: [itemRow] });

  const card = fakeNode({ classes: ["card"], id: listId, children: [head, item] });
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
  const orphan = fakeNode({ classes: ["item"], id: "i9", children: [fakeNode({ classes: ["mark", "mark--check"] })] });
  assert.equal(rowHandle(orphan.children[0]), null);
});

test("a pointer that is not on a row is ignored", () => {
  const rows = board();
  assert.equal(rowHandle(rows.card), null, "the card wrapper is not a handle");
  assert.equal(rowHandle(fakeNode({ classes: ["lists"] })), null, "the list container is not a row");
  assert.equal(rowHandle({}), null, "a text node has no closest()");
  assert.equal(rowHandle(null), null);
  assert.equal(rowHandle(fakeNode({ classes: ["elsewhere"] })), null);
});
