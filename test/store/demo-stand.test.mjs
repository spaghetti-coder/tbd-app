// Stand seed rows: store shapes, promised counts, inherited settings.

import assert from "node:assert/strict";
import test from "node:test";
import { ids, plain } from "../../testkit/fixtures.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";

const { demoData, seedRows, UI_KEY } = sliceVm([
  "UI_KEY", "STORES", "DEMO_LISTS", "DEMO_SIZES", "DEMO_TASKS", "demoList", "demoItem", "demoData",
  "withTx", "seedRows",
]);

// IDB connection stand-in: records store calls, keeps what reached the doc store,
// completes the tx after the caller wires the handlers.
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

test("the stand's rows are well formed", () => {
  // 25 live checklists, five at each declared size.
  assert.equal(data.checklists.length, 26);
  assert.equal(live.length, 25);
  const histogram = {};
  for (const cl of live) {
    histogram[shown(cl)] = (histogram[shown(cl)] ?? 0) + 1;
  }
  assert.deepEqual(histogram, { 0: 5, 1: 5, 5: 5, 20: 5, 40: 5 });

  assert.equal(new Set(ids(data.checklists)).size, data.checklists.length, "a checklist id repeats");
  assert.equal(new Set(ids(data.items)).size, data.items.length, "an item id repeats");
  const known = new Set(ids(data.checklists));
  for (const row of data.items) {
    assert.ok(known.has(row.checklistId), `orphan item ${row.id}`);
  }

  for (const cl of data.checklists) {
    assert.match(cl.title, /^[\x20-\x7e]+$/, `"${cl.title}" is not plain text`);
  }
  const big = live.find((cl) => shown(cl) === 40);
  assert.equal(new Set(of(big.id).map((row) => row.text)).size, 40, "the long list repeats a label");

  const done = data.items.filter((row) => row.done).length;
  assert.ok(done > 0 && done < data.items.length, "all items checked, or none");
  for (const cl of live.filter((row) => shown(row) < 2)) {
    assert.equal(of(cl.id).filter((row) => row.done).length, 0, `a checked item in the one-item list ${cl.id}`);
  }
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

/* A fresh stand db holds no order docs: getAll returns rows by key, so ids must sort into the
   shown order. */
test("row keys sort into the intended order", () => {
  const keys = ids(data.checklists);
  assert.equal([...keys].sort().join(), keys.join());
  for (const cl of live) {
    const inList = ids(of(cl.id).filter((item) => !item.archived));
    assert.equal([...inList].sort().join(), inList.join(), cl.id);
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
    search: { text: "ку", lists: false, items: true },
    bulk: { kind: "list", ids: ["somewhere-else"] },
  });
  assert.deepEqual(conn.docs.map((doc) => doc.key), [UI_KEY]);
  const { bulk, ...carried } = plain(conn.docs[0].value);
  assert.deepEqual(carried, {
    theme: "dark",
    lang: "ru",
    newChecklist: "bottom",
    newItem: "top",
    pageSize: 5,
    page: 3,
    panel: { side: "left", topPct: 0.5, collapsed: true },
    search: { text: "ку" },
  });
  assert.deepEqual(bulk, { kind: null, ids: [] }, "a selection of other data is no selection here");
});

test("with nothing to carry, the stand keeps the doc store to itself", async () => {
  const conn = fakeConn();
  await seedRows(conn);
  assert.deepEqual(conn.docs, []);
});
