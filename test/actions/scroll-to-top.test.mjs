// A new result set starts at its top. These are toTop() call sites in page listeners, out of a
// sandbox's reach, so the source is asserted.

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
    assert.match(handler(id, type), /toTop\(\);\s*commit\(\);/, `"${id}" renders without going up`);
  }
});

test("Esc leaves the search from the top", () => {
  assert.match(slice("onKey"), /clearSearch\(\);\s*toTop\(\);\s*commit\(\);/);
});
