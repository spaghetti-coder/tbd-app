// Swaps live in page listeners, out of a sandbox's reach: assert the source.

import assert from "node:assert/strict";
import test from "node:test";
import { html, slice } from "../../testkit/html-source.mjs";

const handler = (id, type) => {
  const at = html.indexOf(`byId("${id}").addEventListener("${type}"`);
  assert.notEqual(at, -1, `the "${id}" ${type} listener is gone (renamed?)`);
  const body = html.slice(at).match(/ => \{\n([\s\S]*?)\n {2}\}\)/);
  assert.ok(body, `"${id}" is no longer a block listener (regex out of date)`);
  return body[1];
};

test("a handler that swaps the result set goes to the top before rendering", () => {
  for (const [id, type] of [
    ["page-prev", "click"],
    ["page-next", "click"],
    ["search-input", "input"],
    ["search-clear", "click"],
  ]) {
    assert.match(handler(id, type), /pager\.goTo\(/, `"${id}" swaps the result without the pager`);
  }
});

// A shorthand here binds window.top: silent until scrolling breaks.
test("the pager gets the scroll and the paint", () => {
  assert.match(html, /createPager\(\{ visible: visibleChecklists, top: toTop, repaint: store\.commit \}\)/);
});

test("Esc leaves the search from the top", () => {
  assert.match(slice("onKey"), /clearSearch\(\);\s*pager\.goTo\(1\);/);
});
