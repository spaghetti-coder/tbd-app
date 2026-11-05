// The `state` shim the store-level functions run against: sliced by name into one sandbox,
// so a test drives the real function over a real object graph instead of a mock of it.
import { sliceVm } from "./html-source.mjs";

export function stateHarness(names) {
  // The globals the sliced functions reach for; assigning one (found, scrollTarget) writes back here.
  const sandbox = {
    state: null,
    found: null,
    scrollTarget: null,
    lastToast: null,
    calls: [],
    commit: () => sandbox.calls.push("commit"),
    queueSave: () => sandbox.calls.push("queueSave"),
    flushSave: () => sandbox.calls.push("flushSave"),
    repaintRow: (kind, id) => sandbox.calls.push(`repaintRow:${kind}:${id}`),
    showToast: (text) => { sandbox.lastToast = text; },
    rowById: () => null,
    markDirty: () => {},
    markGone: () => {},
    markOrder: () => {},
    t: (key) => key,
  };
  const api = sliceVm(["PAGE_SIZES", ...names], sandbox);

  return {
    api,
    scrollTargetOf: () => sandbox.scrollTarget,
    resetScroll: () => { sandbox.scrollTarget = null; },
    toastOf: () => sandbox.lastToast,
    calls: () => sandbox.calls.join(","),
    resetCalls: () => {
      sandbox.calls.length = 0;
    },
    store: (checklists, items, ui) => {
      sandbox.calls.length = 0;
      sandbox.state = {
        checklists,
        items,
        ui: {
          pageSize: 20,
          page: 1,
          panel: { side: "right", topPct: 0.35, collapsed: false },
          bulk: { kind: null, ids: [] },
          search: { text: "", lists: true, items: true },
          ...ui,
        },
      };
      return sandbox.state;
    },
  };
}
