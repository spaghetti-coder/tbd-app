// `state` shim for store-level tests: real code sliced into one sandbox.
import { sliceVm } from "./html-source.mjs";
import { storeStub } from "./fixtures.mjs";

export const searchOver = (getState) => sliceVm(["createSearch"], {}).createSearch(getState);

export const wireOrder = (api, getState, pages) => api.createOrder({
  getState,
  visibleChecklists: api.visibleChecklists,
  withoutArchived: api.withoutArchived,
  pages,
});

const ORDER = ["createOrder", "createPager", "clamp", "withoutArchived", "visibleChecklists"];

export function stateHarness(names) {
  // Globals the sliced functions reach; assigning one (search, scrollTarget)
  // writes back here.
  const sandbox = {
    state: null,
    search: null,
    scrollTarget: null,
    lastToast: null,
    calls: [],
    // scrollY is set by tests; scrollTo logs like every other call.
    scrollY: 0,
    matchMedia: () => ({ matches: false }),
    scrollTo: () => sandbox.calls.push("toTop"),
    showToast: (text) => { sandbox.lastToast = text; },
    rowById: () => null,
    t: (key) => key,
    // editor stub: editing has its own module and tests.
    editor: { flush: () => {}, open: () => {}, save: () => null, cancel: () => {}, blur: () => {} },
  };
  sandbox.store = storeStub(sandbox.calls);
  const base = ["PAGE_SIZES", "defaults", "createSearch", "patch", "normalizeSearch", ...ORDER];
  const api = sliceVm([...base, ...names.filter((name) => !base.includes(name))], sandbox);
  // Real search over the state the actions write: refresh, then ask.
  sandbox.search = api.createSearch(() => sandbox.state);
  sandbox.pager = api.createPager({
    visible: api.visibleChecklists,
    top: () => sandbox.calls.push("toTop"),
    repaint: (kind, id) => sandbox.store.commit(kind, id),
  });
  sandbox.order = wireOrder(api, () => sandbox.state, () => sandbox.pager.pages());

  return {
    api,
    search: sandbox.search,
    order: sandbox.order,
    pager: sandbox.pager,
    scrollTargetOf: () => sandbox.scrollTarget,
    resetScroll: () => { sandbox.scrollTarget = null; },
    setScroll: (y) => { sandbox.scrollY = y; },
    toastOf: () => sandbox.lastToast,
    calls: () => sandbox.calls.join(","),
    resetCalls: () => {
      sandbox.calls.length = 0;
    },
    edit: (kind, id, props) => sandbox.api.patch(kind, id, props),
    // Rebuilt with each state: no stale query from a previous test.
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
          ...ui,
          search: api.normalizeSearch(ui?.search),
        },
      };
      sandbox.search.refresh();
      return sandbox.state;
    },
  };
}
