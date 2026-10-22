// Ending a drag has to retarget a pointermove that is still waiting for its frame, otherwise the
// drop reads the gap of the previous frame and lands a row off (see html-source.mjs for the VM).

import assert from "node:assert/strict";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

const box = {};
createContext(box);
runInContext(
  [
    "let drag = null;",
    "const calls = [];",
    // The marker placed by the last frame and the one the current clone position asks for.
    "const placed = { id: \"old\", remove() {} };",
    "const live = { id: \"new\", remove() {} };",
    "function retarget() { calls.push(\"retarget\"); drag.gap = live; }",
    "function siblingId(gap) { calls.push(gap.id); return gap.id; }",
    "let cancelled = 0;",
    // The card that was held as a collapsed drop target; endDrag has to take its progress bar off.
    "const held = [];",
    "function dropCard(id) { return id ? { classList: { remove: (name) => held.push(name) } } : null; }",
    "function cancelAnimationFrame() { cancelled++; }",
    "function clearTimeout() {}",
    "function stopAutoScroll() {}",
    "function render() {}",
    "const document = { documentElement: { classList: { remove() {} } } };",
    slice("endDrag"),
    "this.drop = (pending, collapsedId) => {",
    "  drag = { kind: \"item\", ids: [\"a\"], gap: placed, clone: { remove() {} }, hoverTimer: 0, container: null, collapsedId, raf: pending ? 7 : 0 };",
    "  calls.length = 0;",
    "  held.length = 0;",
    "  const before = cancelled;",
    "  endDrag(false);",
    "  return { calls: calls.join(\",\"), cancelled: cancelled - before, held: held.join(\",\") };",
    "};",
  ].join("\n"),
  box,
);

test("a drop with a frame still pending retargets first", () => {
  const dropped = box.drop(true);
  assert.equal(dropped.calls, "retarget,new,new", "the drop uses the pending position");
  assert.equal(dropped.cancelled, 1, "the planned frame is not run after the drop");
});

test("a drop without a pending frame keeps the placed marker", () => {
  assert.equal(box.drop(false).calls, "old,old");
});

test("dropping onto a collapsed list takes its hold bar off", () => {
  assert.equal(box.drop(false, "C").held, "is-drop-hover");
  assert.equal(box.drop(false, null).held, "", "no target, no card to clean");
});
