// A re-render leaves the row under the pointer alone: rows are moved, never rebuilt.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";
import { idsOf, rowNode } from "../../testkit/render.mjs";

const { reconcile } = sliceVm(["reconcile"]);

// A move out of nowhere (a fresh row) is not a removal; only leaving the list counts.
function logged(host, nodes) {
  const log = [];
  const insertBefore = host.insertBefore.bind(host);
  host.insertBefore = (node, ref) => {
    log.push(`move:${node.dataset.id}`);
    return insertBefore(node, ref);
  };
  for (const node of nodes) {
    const remove = node.remove.bind(node);
    node.remove = () => {
      if (node.parentElement) {
        log.push(`drop:${node.dataset.id}`);
      }
      remove();
    };
  }
  return log;
}

test("rows keep their nodes when a row is added at the end", () => {
  const [a, b] = [rowNode("a"), rowNode("b")];
  const host = fakeNode({ classes: ["items"], children: [a, b] });
  const log = logged(host, [a, b]);
  reconcile(host, [a, b, rowNode("c")]);
  assert.equal(idsOf(host), "a,b,c");
  assert.deepEqual(log, ["move:c"], "only the new row is touched");
});

test("a row that left is taken out and nothing else moves", () => {
  const [a, b, c] = [rowNode("a"), rowNode("b"), rowNode("c")];
  const host = fakeNode({ classes: ["items"], children: [a, b] });
  const log = logged(host, [a, b, c]);
  reconcile(host, [a, c]);
  assert.equal(idsOf(host), "a,c");
  assert.equal(log.join(","), "drop:b,move:c");
});

test("rows are put in the asked order", () => {
  const [a, b, c] = [rowNode("a"), rowNode("b"), rowNode("c")];
  const host = fakeNode({ classes: ["items"], children: [a, b, c] });
  reconcile(host, [c, a, b]);
  assert.equal(idsOf(host), "c,a,b");
});

test("an empty list leaves an empty host", () => {
  const host = fakeNode({ classes: ["items"], children: [rowNode("a"), rowNode("b")] });
  reconcile(host, []);
  assert.equal(host.children.length, 0);
});
