// Row menu: each entry reaches exactly its helper.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { storeStub } from "../../testkit/fixtures.mjs";

function menuHarness({ canMove = () => true } = {}) {
  const calls = [];
  const menu = {};
  const { openEntityMenu } = sliceVm(["openEntityMenu"], {
    entityText: () => "Buy oat milk",
    t: (key) => key,
    el: (tag, cls) => ({ className: cls, append() {} }),
    menuItem: (icon, label, onClick, danger, disabled = false) => {
      menu[icon] = { onClick, disabled };
      return {};
    },
    menuSep: () => ({}),
    openModal: (opts) => calls.push(`openModal:${opts.title}`),
    closeModal: () => calls.push("closeModal"),
    ask: (kind, ids, verb) => calls.push(`ask:${kind}:${ids.join("+")}:${verb}`),
    moveTo: (kind, ids, where) => calls.push(`moveTo:${kind}:${ids.join("+")}:${where}`),
    selection: {
      start: (kind, id) => calls.push(`start:${kind}:${id}`),
      canMove,
    },
    store: storeStub(calls),
  });
  return { calls, menu, openEntityMenu };
}

test("the bulk entry takes the row alone and repaints all", () => {
  const { calls, menu, openEntityMenu } = menuHarness();
  openEntityMenu("item", "i1", {});
  menu.bulk.onClick();
  assert.deepEqual(calls, ["openModal:Buy oat milk", "closeModal", "start:item:i1", "commit"]);
});

test("archive and delete ask about exactly this row", () => {
  const { calls, menu, openEntityMenu } = menuHarness();
  openEntityMenu("list", "c1", {});
  menu.archive.onClick();
  menu.trash.onClick();
  assert.deepEqual(calls.slice(1), [
    "closeModal", "ask:list:c1:archive",
    "closeModal", "ask:list:c1:delete",
  ]);
});

test("move entries follow the move rule, not the edge alone", () => {
  const on = menuHarness();
  on.openEntityMenu("list", "c1", {});
  assert.equal(on.menu.top.disabled, false);
  assert.equal(on.menu.bottom.disabled, false);
  on.menu.top.onClick();
  assert.deepEqual(on.calls.slice(1), ["closeModal", "moveTo:list:c1:top"]);

  const off = menuHarness({ canMove: () => false });
  off.openEntityMenu("list", "c1", {});
  assert.equal(off.menu.top.disabled, true);
  assert.equal(off.menu.bottom.disabled, true);
});
