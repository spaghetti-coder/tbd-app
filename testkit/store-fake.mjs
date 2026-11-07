// The store over a map-backed adapter: the real createStore and the real batch arithmetic run, and
// what lands in the adapter is what a test asserts on.
import { sliceVm } from "./html-source.mjs";

// The slice store tests run: createStore and the pure helpers around it.
export const STORE = [
  "createStore", "writes", "orderKey", "orderSnapshot", "orderChanges", "sameIds",
  "clamp", "UI_KEY", "PAGE_SIZES", "defaults", "normalizeSearch", "validBulk", "normalize",
  "applyOrder", "byOrder",
];

// Reads come back sorted by key, the way getAll answers: no row carries an ordinal of its own.
const byKey = (a, b) => (a.id < b.id ? -1 : 1);

const put = (rows, row) => {
  const at = rows.findIndex((held) => held.id === row.id);
  if (at < 0) rows.push(row);
  else rows[at] = row;
};

export function storageFake({ checklists = [], items = [], docs = {} } = {}) {
  const rows = { checklists: [...checklists], items: [...items] };
  const docsMap = { ...docs };
  const batches = [];
  const seen = { cleared: 0, seeded: [] };
  let failing = false;
  let held = false;
  const releases = [];

  const apply = (batch) => {
    for (const row of batch.checklists) put(rows.checklists, row);
    for (const row of batch.items) put(rows.items, row);
    for (const doc of batch.docs) docsMap[doc.key] = doc.value;
    rows.checklists = rows.checklists.filter((row) => !batch.goneChecklists.includes(row.id));
    rows.items = rows.items.filter((row) => !batch.goneItems.includes(row.id));
    for (const key of batch.goneDocs) delete docsMap[key];
  };

  return {
    batches,
    seen,
    fail: (on) => { failing = on; },
    hold: (on) => { held = on; },
    release: () => releases.shift()?.(),
    async readAll() {
      if (failing) return Promise.reject(new Error("quota"));
      return {
        checklists: rows.checklists.slice().sort(byKey),
        items: rows.items.slice().sort(byKey),
        docs: { ...docsMap },
      };
    },
    write(batch) {
      batches.push(batch);
      if (failing) return Promise.reject(new Error("quota"));
      const settle = held ? new Promise((done) => { releases.push(done); }) : Promise.resolve();
      return settle.then(() => apply(batch));
    },
    clear() {
      seen.cleared += 1;
      rows.checklists = [];
      rows.items = [];
      for (const key of Object.keys(docsMap)) delete docsMap[key];
      return Promise.resolve();
    },
    seed(ui) {
      seen.seeded.push(ui);
      return Promise.resolve();
    },
  };
}

// The other tabs: `send` is a message arriving, `posts` is what this tab echoed.
export function echoFake() {
  const posts = [];
  let hand = null;
  return {
    posts,
    post: (id) => posts.push(id),
    onMessage: (handler) => { hand = handler; },
    send: (id) => hand?.(id),
  };
}

// Timers that only fire when a test says so.
export function clockFake() {
  const pending = new Map();
  let next = 0;
  return {
    pending,
    setTimeout: (fn) => { pending.set(++next, fn); return next; },
    clearTimeout: (id) => pending.delete(id),
    run() {
      for (const fn of [...pending.values()]) fn();
      pending.clear();
    },
  };
}

// A live store: real code, with storage, timers and tabs under the test's hand.
export function storeHarness({ canReload = () => true, demo = false, storage = storageFake(), actions = [] } = {}) {
  const echo = echoFake();
  const clock = clockFake();
  const errors = [];
  const reloads = [];
  const globals = {
    demo,
    uid: () => "tab",
    setTimeout: (fn) => clock.setTimeout(fn),
    clearTimeout: (id) => clock.clearTimeout(id),
    location: { reload: () => reloads.push(1) },
  };
  const api = sliceVm(STORE, globals);
  let state = api.defaults();
  const store = api.createStore({
    storage, echo, getState: () => state, canReload, onError: () => errors.push("storage_error"),
  });
  // The app's action functions, marking through the store interface over the same state object.
  const actBox = { ...globals, store };
  const act = sliceVm(actions, actBox);
  const assign = (value) => {
    state = value;
    actBox.state = value;
    return value;
  };
  return {
    store, storage, echo, clock, errors, reloads, api, actions: act,
    state: (checklists, items, ui) => assign({
      checklists, items, ui: { pageSize: 20, page: 1, search: { text: "" }, bulk: { kind: null, ids: [] }, ...ui },
    }),
    setState: assign,
    current: () => state,
  };
}
