// Pager: page math & going to a page.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, list } from "../../testkit/fixtures.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";
import { stateHarness } from "../../testkit/state.mjs";

/* --- the bar --- */

const nodes = {};
const barEnv = {
  state: { ui: { page: 1, pageSize: 20 }, checklists: [] },
  byId: (id) => (nodes[id] ??= { hidden: false, disabled: false, textContent: "" }),
  t: (key, vars) => `${key} ${vars.n}/${vars.m}`,
  document: { documentElement: { style: { setProperty() {} } } },
  tops: [],
  commits: [],
};
const { createPager, renderPager } = sliceVm(["clamp", "createPager", "renderPager"], barEnv);
barEnv.pager = createPager({
  visible: () => barEnv.state.checklists,
  top: () => barEnv.tops.push(1),
  repaint: (kind) => barEnv.commits.push(kind ?? "all"),
});

const render = (count, pageSize, page) => {
  barEnv.state.checklists = Array.from({ length: count }, (_, i) => ({ id: `l${i}` }));
  barEnv.state.ui.pageSize = pageSize;
  barEnv.state.ui.page = page;
  for (const node of Object.values(nodes)) {
    node.hidden = false;
    node.disabled = false;
    node.textContent = "";
  }
  renderPager();
  return { ...nodes, page: barEnv.state.ui.page };
};

test("a second page shows the bar", () => {
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

test("one page hides the bar", () => {
  assert.equal(render(20, 20, 1).pager.hidden, true, "exactly one page");
  assert.equal(render(0, 20, 1).pager.hidden, true, "nothing at all");
});

test("\"all\" hides the bar", () => {
  assert.equal(render(100, "all", 1).pager.hidden, true);
});

test("painting clamps a stale page and writes nothing", () => {
  const out = render(25, 10, 9);
  assert.equal(out["page-info"].textContent, "page_of 3/3", "shown as the last page");
  assert.equal(out["page-next"].disabled, true);
  assert.equal(barEnv.state.ui.page, 9, "paint does not fix the number");
});

/* --- going to a page --- */

const { api, pager, store, scrollTargetOf, calls, resetCalls } = stateHarness(["jumpTo"]);

const shelf = (count, ui) => store(Array.from({ length: count }, (_, i) => list(`l${i}`)), [], ui);

test("pages rounds up, never below one, ignores the total for \"all\"", () => {
  shelf(0, { pageSize: 20 });
  assert.equal(pager.pages(), 1, "an empty shelf is one page");
  shelf(20, { pageSize: 20 });
  assert.equal(pager.pages(), 1);
  const state = shelf(21, { pageSize: 20 });
  assert.equal(pager.pages(), 2);
  state.ui.pageSize = "all";
  assert.equal(pager.pages(), 1);
});

test("rows takes the current page, clamped", () => {
  const state = shelf(5, { pageSize: 2 });
  state.checklists[1].archived = true;
  assert.deepEqual(ids(pager.rows()), ["l0", "l2"]);
  state.ui.page = 2;
  assert.deepEqual(ids(pager.rows()), ["l3", "l4"]);
  state.ui.page = 9;
  assert.deepEqual(ids(pager.rows()), ["l3", "l4"], "past the end shows the last page");
  state.ui.page = 0;
  assert.deepEqual(ids(pager.rows()), ["l0", "l2"]);
  state.ui.pageSize = "all";
  assert.deepEqual(ids(pager.rows()), ["l0", "l2", "l3", "l4"]);
});

test("going to a page moves page, scroll & paint together", () => {
  const state = shelf(50, { pageSize: 10, page: 1 });
  resetCalls();
  pager.goTo(3);
  assert.equal(state.ui.page, 3);
  assert.equal(calls(), "toTop,commit");
  pager.goTo(99);
  assert.equal(state.ui.page, 5, "clamped to the last page");
  pager.goTo(0);
  assert.equal(state.ui.page, 1, "and to the first");
});

test("a new set on the current page still starts at the top", () => {
  shelf(50, { pageSize: 10, page: 1 });
  resetCalls();
  pager.goTo(1);
  assert.equal(calls(), "toTop,commit", "no early return");
});

/* --- jumping to a row --- */

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
