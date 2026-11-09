// The `state` shim the store-level functions run against: sliced by name into one sandbox,
// so a test drives the real function over a real object graph instead of a mock of it.
import { sliceVm } from "./html-source.mjs";
import { storeStub } from "./fixtures.mjs";

// The real search module over a state a hand-built sandbox owns.
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
    // Editing has its own module; store-level tests only need the collaborator.
    editor: { flush: () => {}, open: () => {}, save: () => null, cancel: () => {}, blur: () => {} },
  };
  sandbox.store = storeStub(sandbox.marked, sandbox.calls);
  const base = ["PAGE_SIZES", "createSearch", ...ORDER];
  const api = sliceVm([...base, ...names.filter((name) => !base.includes(name))], sandbox);
  // The real search module over the same state the actions write, so a test refreshes and asks it.
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
    // The search is rebuilt with it: a stored state never answers from the previous test's query.
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
