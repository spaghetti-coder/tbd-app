// The `state` shim the store-level functions run against: sliced by name into one sandbox,
// so a test drives the real function over a real object graph instead of a mock of it.
import { sliceVm } from "./html-source.mjs";
import { storeStub } from "./fixtures.mjs";

export function stateHarness(names) {
  // The globals the sliced functions reach for; assigning one (found, scrollTarget) writes back here.
  const sandbox = {
    state: null,
    found: null,
    scrollTarget: null,
    lastToast: null,
    calls: [],
    marked: [],
    commit: () => sandbox.calls.push("commit"),
    // The scroll a sliced function asks for lands in the same call log.
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    scrollTo: () => sandbox.calls.push("toTop"),
    repaintRow: (kind, id) => sandbox.calls.push(`repaintRow:${kind}:${id}`),
    showToast: (text) => { sandbox.lastToast = text; },
    rowById: () => null,
    t: (key) => key,
  };
  sandbox.store = storeStub(sandbox.marked, sandbox.calls);
  const api = sliceVm(["PAGE_SIZES", ...names], sandbox);

  return {
    api,
    foundOf: () => sandbox.found,
    scrollTargetOf: () => sandbox.scrollTarget,
    resetScroll: () => { sandbox.scrollTarget = null; },
    setScroll: (y) => { sandbox.scrollY = y; },
    toastOf: () => sandbox.lastToast,
    calls: () => sandbox.calls.join(","),
    marks: () => sandbox.marked.join(","),
    resetCalls: () => {
      sandbox.calls.length = 0;
    },
    store: (checklists, items, ui) => {
      sandbox.calls.length = 0;
      sandbox.marked.length = 0;
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
