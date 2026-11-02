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
