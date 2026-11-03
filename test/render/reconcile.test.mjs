// A re-render leaves the row under the pointer alone: rows are moved, never rebuilt.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

const { reconcile } = vm([slice("reconcile"), "({ reconcile })"]);

const row = (id) => fakeNode({ classes: ["item"], id });

// Every move and every removal is recorded, so "left where it was" is an observable fact.
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

const ids = (host) => host.children.map((node) => node.dataset.id).join(",");

test("rows keep their nodes when a row is added at the end", () => {
  const [a, b] = [row("a"), row("b")];
  const host = fakeNode({ classes: ["items"], children: [a, b] });
  const log = logged(host, [a, b]);
  reconcile(host, [a, b, row("c")]);
  assert.equal(ids(host), "a,b,c");
  assert.deepEqual(log, ["move:c"], "only the new row is touched");
});

test("a row that left is taken out and nothing else moves", () => {
  const [a, b, c] = [row("a"), row("b"), row("c")];
  const host = fakeNode({ classes: ["items"], children: [a, b] });
  const log = logged(host, [a, b, c]);
  reconcile(host, [a, c]);
  assert.equal(ids(host), "a,c");
  assert.equal(log.join(","), "drop:b,move:c");
});

test("a new row opens where it belongs", () => {
  const [a, b] = [row("a"), row("b")];
  const host = fakeNode({ classes: ["items"], children: [a, b] });
  const c = row("c");
  reconcile(host, [a, c, b]);
  assert.equal(ids(host), "a,c,b");
  assert.equal(c.parentElement, host);
});

test("rows are put in the asked order", () => {
  const [a, b, c] = [row("a"), row("b"), row("c")];
  const host = fakeNode({ classes: ["items"], children: [a, b, c] });
  reconcile(host, [c, a, b]);
  assert.equal(ids(host), "c,a,b");
});

test("an empty list leaves an empty host", () => {
  const host = fakeNode({ classes: ["items"], children: [row("a"), row("b")] });
  reconcile(host, []);
  assert.equal(host.children.length, 0);
});
