// The stand's seed rows: the shape the stores take, the counts the stand promises, and the
// settings a new stand inherits.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";

const { demoData, seedRows, UI_KEY } = vm([
  slice("UI_KEY"),
  slice("STORES"),
  slice("DEMO_LISTS"),
  slice("DEMO_SIZES"),
  slice("DEMO_TASKS"),
  slice("demoList"),
  slice("demoItem"),
  slice("demoData"),
  slice("withTx"),
  slice("seedRows"),
  "({ demoData, seedRows, UI_KEY })",
]);

// A stand-in for an IDB connection: records every store call, keeps what reached the doc store,
// and completes the transaction once the caller has wired the handlers.
function fakeConn() {
  const calls = [];
  const docs = [];
  return {
    calls,
    docs,
    transaction() {
      const tx = {
        objectStore(name) {
          return {
            clear: () => calls.push(`clear:${name}`),
            put: (row) => {
              calls.push(`put:${name}`);
              if (name === "doc") {
                docs.push(row);
              }
            },
          };
        },
      };
      queueMicrotask(() => tx.oncomplete());
      return tx;
    },
  };
}

const data = demoData();
const live = data.checklists.filter((cl) => !cl.archived);
const of = (id) => data.items.filter((item) => item.checklistId === id);
const shown = (cl) => of(cl.id).filter((item) => !item.archived).length;

test("25 live checklists cover every declared size, five each", () => {
  assert.equal(data.checklists.length, 26);
  assert.equal(live.length, 25);
  const histogram = {};
  for (const cl of live) {
    histogram[shown(cl)] = (histogram[shown(cl)] ?? 0) + 1;
  }
  assert.deepEqual(histogram, { 0: 5, 1: 5, 5: 5, 20: 5, 40: 5 });
});

test("the archive holds one checklist, and three items of their own", () => {
  const archived = data.checklists.filter((cl) => cl.archived);
  assert.equal(archived.length, 1);
  const rows = of(archived[0].id);
  assert.equal(rows.length, 3);
  for (const item of rows) {
    assert.equal(item.archived, true);
    assert.equal(item.archivedBy, "list");
  }
  // Items listed under the Items tab have to live outside the archived checklist.
  const own = data.items.filter((item) => item.archived && item.archivedBy === "user");
  assert.equal(own.length, 3);
  for (const item of own) {
    assert.equal(item.archived, true);
    assert.equal(archived.some((cl) => cl.id === item.checklistId), false);
  }
});

test("every item belongs to a checklist, and no id repeats", () => {
  const ids = data.checklists.map((cl) => cl.id);
  assert.equal(new Set(ids).size, ids.length);
  const known = new Set(ids);
  for (const item of data.items) {
    assert.ok(known.has(item.checklistId), `orphan item ${item.id}`);
  }
  assert.equal(new Set(data.items.map((item) => item.id)).size, data.items.length);
});

test("labels are plain English text, and the long list does not repeat one", () => {
  for (const cl of data.checklists) {
    assert.match(cl.title, /^[\x20-\x7e]+$/);
  }
  const big = live.find((cl) => shown(cl) === 40);
  assert.equal(new Set(of(big.id).map((item) => item.text)).size, 40);
});

test("some items are checked, none in the one-item lists", () => {
  const done = data.items.filter((item) => item.done).length;
  assert.ok(done > 0 && done < data.items.length);
  for (const cl of live.filter((row) => shown(row) < 2)) {
    assert.equal(of(cl.id).filter((item) => item.done).length, 0);
  }
});

/* A fresh stand database holds no order docs, so getAll returns the rows by key: the ids have to
   sort into the order the stand shows. */
test("row keys sort into the intended order", () => {
  const ids = data.checklists.map((cl) => cl.id);
  assert.equal([...ids].sort().join(), ids.join());
  for (const cl of live) {
    const keys = of(cl.id).filter((item) => !item.archived).map((item) => item.id);
    assert.equal([...keys].sort().join(), keys.join(), cl.id);
  }
});

test("the stores are wiped before a single row lands", async () => {
  const conn = fakeConn();
  await seedRows(conn);
  const clears = conn.calls.filter((call) => call.startsWith("clear:"));
  assert.deepEqual(clears, ["clear:checklists", "clear:items", "clear:doc"]);
  assert.equal(conn.calls.indexOf("put:checklists"), clears.length);
  assert.equal(conn.calls.filter((call) => call === "put:checklists").length, data.checklists.length);
  assert.equal(conn.calls.filter((call) => call === "put:items").length, data.items.length);
});

test("a seeded stand carries the given settings, and only them", async () => {
  const conn = fakeConn();
  await seedRows(conn, {
    theme: "dark",
    lang: "ru",
    newChecklist: "bottom",
    newItem: "top",
    pageSize: 5,
    page: 3,
    panel: { side: "left", topPct: 0.5, collapsed: true },
    bulk: { kind: "list", ids: ["somewhere-else"] },
  });
  assert.deepEqual(conn.docs.map((doc) => doc.key), [UI_KEY]);
  // The seed built its object in another realm; the copy is what strict comparison accepts.
  const { bulk, ...carried } = JSON.parse(JSON.stringify(conn.docs[0].value));
  assert.deepEqual(carried, {
    theme: "dark",
    lang: "ru",
    newChecklist: "bottom",
    newItem: "top",
    pageSize: 5,
    page: 3,
    panel: { side: "left", topPct: 0.5, collapsed: true },
  });
  assert.deepEqual(bulk, { kind: null, ids: [] }, "a selection of other data is no selection here");
});

test("with nothing to carry, the stand keeps the doc store to itself", async () => {
  const conn = fakeConn();
  await seedRows(conn);
  assert.deepEqual(conn.docs, []);
});
