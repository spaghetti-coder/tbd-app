// The pager must stay out of the way unless there is more than one page.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, list } from "../../testkit/fixtures.mjs";
import { slice, vm } from "../../testkit/html-source.mjs";
import { stateHarness } from "../../testkit/state.mjs";

const { render } = vm([
  "const state = { ui: { page: 1, pageSize: 20 }, checklists: [] };",
  "const nodes = {};",
  "function byId(id) { return (nodes[id] ??= { hidden: false, disabled: false, textContent: \"\" }); }",
  "function t(key, vars) { return `${key} ${vars.n}/${vars.m}`; }",
  "function visibleChecklists() { return state.checklists; }",
  "const document = { documentElement: { style: { setProperty() {} } } };",
  slice("clamp"),
  slice("pageCount"),
  slice("renderPager"),
  "({",
  "  render: (count, pageSize, page) => {",
  "    state.checklists = Array.from({ length: count }, (_, i) => ({ id: `l${i}` }));",
  "    state.ui.pageSize = pageSize;",
  "    state.ui.page = page;",
  "    for (const node of Object.values(nodes)) { node.hidden = false; node.disabled = false; node.textContent = \"\"; }",
  "    renderPager();",
  "    return { ...nodes, page: state.ui.page };",
  "  },",
  "});",
]);

test("a second page shows the pager", () => {
  const out = render(21, 20, 1);
  assert.equal(out.pager.hidden, false);
  assert.equal(out["page-info"].textContent, "page_of 1/2");
  assert.equal(out["page-prev"].disabled, true, "no page before the first");
  assert.equal(out["page-next"].disabled, false);
});

test("the last page has no next", () => {
  const out = render(25, 10, 3);
  assert.equal(out["page-info"].textContent, "page_of 3/3");
  assert.equal(out["page-prev"].disabled, false);
  assert.equal(out["page-next"].disabled, true);
});

test("one page hides the pager", () => {
  assert.equal(render(20, 20, 1).pager.hidden, true, "exactly one page");
  assert.equal(render(0, 20, 1).pager.hidden, true, "nothing at all");
});

test("\"all\" hides the pager", () => {
  assert.equal(render(100, "all", 1).pager.hidden, true);
});

test("a stale page number is clamped back into range", () => {
  assert.equal(render(25, 10, 9).page, 3);
});

/* ---------- page math ---------- */

const { api, store, scrollTargetOf } = stateHarness([
  "pageCount",
  "pagedChecklists",
  "jumpTo",
  "visibleChecklists",
  "indexOfVisible",
  "clamp",
]);

test("pageCount rounds up, never drops below one page and ignores totals for \"all\"", () => {
  const state = store([], []);
  state.ui.pageSize = 20;
  assert.equal(api.pageCount(0), 1);
  assert.equal(api.pageCount(20), 1);
  assert.equal(api.pageCount(21), 2);
  state.ui.pageSize = "all";
  assert.equal(api.pageCount(999), 1);
});

test("pagedChecklists pages the visible checklists and clamps the page index", () => {
  const state = store(
    [list("c1"), list("c2", { archived: true }), list("c3"), list("c4"), list("c5")], [], { pageSize: 2 });
  assert.deepEqual(ids(api.pagedChecklists()), ["c1", "c3"]);
  state.ui.page = 2;
  assert.deepEqual(ids(api.pagedChecklists()), ["c4", "c5"]);
  state.ui.page = 9;
  assert.deepEqual(ids(api.pagedChecklists()), ["c4", "c5"], "past the last page shows the last page");
  state.ui.page = 0;
  assert.deepEqual(ids(api.pagedChecklists()), ["c1", "c3"]);
  state.ui.pageSize = "all";
  assert.deepEqual(ids(api.pagedChecklists()), ["c1", "c3", "c4", "c5"]);
});

test("jumpTo moves to the page that holds the checklist", () => {
  const state = store([list("c1"), list("c2"), list("c3"), list("c4"), list("c5")], [], { pageSize: 2, page: 1 });
  api.jumpTo("c1");
  assert.equal(state.ui.page, 1);
  assert.deepEqual({ ...scrollTargetOf() }, { kind: "list", id: "c1" });
  api.jumpTo("c4");
  assert.equal(state.ui.page, 2);
  api.jumpTo("c5");
  assert.equal(state.ui.page, 3);
  state.ui.pageSize = "all";
  state.ui.page = 1;
  api.jumpTo("c5");
  assert.equal(state.ui.page, 1, "\"all\" has no pages to move");
  api.jumpTo("gone");
  assert.equal(state.ui.page, 1, "an unknown id changes nothing");
});
