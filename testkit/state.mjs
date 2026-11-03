// The `state` shim the store-level functions run against: sliced by name into one sandbox,
// so a test drives the real function over a real object graph instead of a mock of it.
import { createContext, runInContext } from "node:vm";
import { slice } from "./html-source.mjs";

// The sliced functions reach for these at runtime; the harness keeps them out of the way.
const PRELUDE = `
let scrollTarget = null;
let lastToast = null;
const calls = [];
function commit() { calls.push("commit"); }
function queueSave() { calls.push("queueSave"); }
function flushSave() { calls.push("flushSave"); }
function repaintRow(kind, id) { calls.push("repaintRow:" + kind + ":" + id); }
function rowById() { return null; }
function markDirty() {}
function markGone() {}
function markOrder() {}
function showToast(text) { lastToast = text; }
function t(key) { return key; }
`;

export function stateHarness(names) {
  const sandbox = { state: null };
  createContext(sandbox);
  const { api, scrollTargetOf, toastOf, calls, resetCalls } = runInContext(
    [slice("PAGE_SIZES"), PRELUDE, ...names.map(slice),
      `({ api: { ${names.join(", ")} }, scrollTargetOf: () => scrollTarget,`,
      "  toastOf: () => lastToast, calls: () => calls.join(\",\"), resetCalls: () => { calls.length = 0; } });",
    ].join("\n"),
    sandbox,
  );

  return {
    api, scrollTargetOf, toastOf, calls, resetCalls,
    // Objects built inside the VM have that realm's prototypes, so compare plain copies of their fields.
    plainBulk: (bulk) => ({ kind: bulk.kind, ids: Array.from(bulk.ids) }),
    store: (checklists, items, ui) => {
      resetCalls();
      sandbox.state = {
        checklists,
        items,
        ui: {
          pageSize: 20,
          page: 1,
          panel: { side: "right", topPct: 0.35, collapsed: false },
          bulk: { kind: null, ids: [] },
          ...ui,
        },
      };
      return sandbox.state;
    },
  };
}
