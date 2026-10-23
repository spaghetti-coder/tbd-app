// The pager must stay out of the way unless there is more than one page (see html-source.mjs for the VM).

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const box = {};
createContext(box);
runInContext(
  [
    "const state = { ui: { page: 1, pageSize: 20 }, checklists: [] };",
    "const nodes = {};",
    "function byId(id) { return (nodes[id] ??= { hidden: false, disabled: false, textContent: \"\" }); }",
    "function clamp(value, low, high) { return Math.min(Math.max(value, low), high); }",
    "function t(key, vars) { return `${key} ${vars.n}/${vars.m}`; }",
    "function visibleChecklists() { return state.checklists; }",
    slice("pageCount"),
    slice("renderPager"),
    "this.render = (count, pageSize, page) => {",
    "  state.checklists = Array.from({ length: count }, (_, i) => ({ id: `l${i}` }));",
    "  state.ui.pageSize = pageSize;",
    "  state.ui.page = page;",
    "  for (const node of Object.values(nodes)) { node.hidden = false; node.disabled = false; node.textContent = \"\"; }",
    "  renderPager();",
    "  return { ...nodes, page: state.ui.page };",
    "};",
  ].join("\n"),
  box,
);

test("a second page shows the pager", () => {
  const out = box.render(21, 20, 1);
  assert.equal(out.pager.hidden, false);
  assert.equal(out["page-info"].textContent, "page_of 1/2");
  assert.equal(out["page-prev"].disabled, true, "no page before the first");
  assert.equal(out["page-next"].disabled, false);
});

test("the last page has no next", () => {
  const out = box.render(25, 10, 3);
  assert.equal(out["page-info"].textContent, "page_of 3/3");
  assert.equal(out["page-prev"].disabled, false);
  assert.equal(out["page-next"].disabled, true);
});

test("one page hides the pager", () => {
  assert.equal(box.render(20, 20, 1).pager.hidden, true, "exactly one page");
  assert.equal(box.render(0, 20, 1).pager.hidden, true, "nothing at all");
});

test("\"all\" hides the pager", () => {
  assert.equal(box.render(100, "all", 1).pager.hidden, true);
});

test("a stale page number is clamped back into range", () => {
  assert.equal(box.render(25, 10, 9).page, 3);
});
