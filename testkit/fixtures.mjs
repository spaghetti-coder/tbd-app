// Shapes shared by the store-level tests: entities as the app keeps them, ids read out of any realm.

export const list = (id, extra) => ({
  id, title: `list ${id}`, expanded: true, createdAt: 1, archived: false, ...extra,
});

export const item = (id, checklistId, extra) => ({
  id, checklistId, text: `item ${id}`, done: false, createdAt: 1, archived: false, archivedBy: "user",
  ...extra,
});

// Array.from, not map: rows may come from another realm, and map() would keep that realm's Array.prototype.
export const ids = (rows) => Array.from(rows, (row) => row.id);

// Objects built inside the VM carry that realm's prototypes, so compare plain copies of their fields.
export const plain = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

// Asserting against the env directly would leak a mutation into the next test if one fails.
export const withEnv = (env, patch, fn) => {
  const restore = { ...env };
  Object.assign(env, patch);
  try {
    fn();
  } finally {
    Object.assign(env, restore);
  }
};

// The search interface answered by hand, for tests whose subject is a painter, not a query.
// Inactive by default: the same as no search at all.
export const searchStub = (answers = {}) => ({
  refresh: () => {},
  active: false,
  any: false,
  allowsList: () => true,
  allowsItem: () => true,
  expands: () => false,
  matched: () => false,
  rangesFor: () => null,
  ...answers,
});

// Records every call and writes nothing, for hand-built sandboxes.
export const storeStub = (marks = [], calls = marks) => ({
  markDirty: (kind, id) => marks.push(`markDirty:${kind}:${id}`),
  markGone: (kind, id) => marks.push(`markGone:${kind}:${id}`),
  markUi: () => marks.push("markUi"),
  queueSave: () => calls.push("queueSave"),
  flushSave: () => calls.push("flushSave"),
  reloadWhenSafe: () => calls.push("reloadWhenSafe"),
});
