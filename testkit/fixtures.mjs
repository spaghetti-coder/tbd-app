// Shapes shared by the store-level tests: entities as the app keeps them, ids from any realm.

export const list = (id, extra) => ({
  id, title: `list ${id}`, expanded: true, createdAt: 1, archived: false, ...extra,
});

export const item = (id, checklistId, extra) => ({
  id, checklistId, text: `item ${id}`, done: false, createdAt: 1, archived: false, archivedBy: "user",
  ...extra,
});

// Array.from, not map: cross-realm rows would keep that realm's Array.prototype.
export const ids = (rows) => Array.from(rows, (row) => row.id);

// VM objects carry VM prototypes: compare plain copies.
export const plain = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

// Restores env afterwards: a failing assert must not leak a mutation.
export const withEnv = (env, patch, fn) => {
  const restore = { ...env };
  Object.assign(env, patch);
  try {
    fn();
  } finally {
    Object.assign(env, restore);
  }
};

// Hand-answered search interface, for painter tests. Inactive by default = no search.
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
