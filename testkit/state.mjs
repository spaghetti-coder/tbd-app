// The `state` shim store-level functions run against: real code sliced into one sandbox.
import { sliceVm } from "./html-source.mjs";
import { storeStub } from "./fixtures.mjs";

export const searchOver = (getState) => sliceVm(["createSearch"], {}).createSearch(getState);

// What the order module reaches for; it runs for real over the same state the actions write.
const ORDER = ["createOrder", "clamp", "withoutArchived", "findItem", "visibleChecklists", "pageCount"];

export function stateHarness(names) {
  // The globals the sliced functions reach for; assigning one (search, scrollTarget) writes back here.
  const sandbox = {
    state: null,
    search: null,
    scrollTarget: null,
    lastToast: null,
    calls: [],
    marked: [],
    commit: (kind, id) => sandbox.calls.push(kind ? `commit:${kind}:${id}` : "commit"),
    // The scroll a sliced function asks for lands in the same call log.
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    scrollTo: () => sandbox.calls.push("toTop"),
    showToast: (text) => { sandbox.lastToast = text; },
    rowById: () => null,
    t: (key) => key,
    // editor stub: editing has its own module and tests.
    editor: { flush: () => {}, open: () => {}, save: () => null, cancel: () => {}, blur: () => {} },
  };
  sandbox.store = storeStub(sandbox.marked, sandbox.calls);
  const base = ["PAGE_SIZES", "createSearch", ...ORDER];
  const api = sliceVm([...base, ...names.filter((name) => !base.includes(name))], sandbox);
  // Real search over the same state the actions write: a test refreshes, then asks it.
  sandbox.search = api.createSearch(() => sandbox.state);
  sandbox.order = api.createOrder(() => sandbox.state);

  return {
    api,
    search: sandbox.search,
    order: sandbox.order,
    scrollTargetOf: () => sandbox.scrollTarget,
    resetScroll: () => { sandbox.scrollTarget = null; },
    setScroll: (y) => { sandbox.scrollY = y; },
    toastOf: () => sandbox.lastToast,
    calls: () => sandbox.calls.join(","),
    marks: () => sandbox.marked.join(","),
    resetCalls: () => {
      sandbox.calls.length = 0;
    },
    // Rebuilt with each state: no stale query from a previous test.
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
      sandbox.search.refresh();
      return sandbox.state;
    },
  };
}
