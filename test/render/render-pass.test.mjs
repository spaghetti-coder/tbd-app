// render calls focus & reveal: nothing runs the wiring, assert the source.

import assert from "node:assert/strict";
import test from "node:test";
import { slice } from "../../testkit/html-source.mjs";

test("render captures focus before rows move", () => {
  const body = slice("render");
  assert.ok(body.includes("focus.capture()"));
  assert.ok(body.indexOf("focus.capture()") < body.indexOf("renderLists()"), "rows move after");
});

test("the painter asks, the repaint answers", () => {
  assert.ok(slice("rowView").includes("askFocus: () => focus.ask()"));
  assert.ok(slice("afterRender").includes("focus.restore()"));
});

test("afterRender spends the reveal after focus", () => {
  const after = slice("afterRender");
  assert.ok(after.includes("reveal.afterPaint()"));
  assert.ok(after.indexOf("focus.restore()") < after.indexOf("reveal.afterPaint()"), "focus first, then the scroll");
});

test("a keyboard re-flow re-reveals the editor", () => {
  assert.ok(slice("onViewportChange").includes("reveal.row(row)"));
});
