// A stand-in for Element: only the DOM contract the sliced functions touch.
export function fakeNode({ classes = [], id, kind, rect, children = [] } = {}) {
  const set = new Set(classes);
  const node = {
    classes: set,
    classList: {
      add: (name) => set.add(name),
      remove: (name) => set.delete(name),
      contains: (name) => set.has(name),
    },
    dataset: { ...(kind ? { kind } : {}), ...(id ? { id } : {}) },
    style: {},
    children,
    parentElement: null,
    matches(selectors) {
      return selectors.replace(/:scope\s*>\s*/g, "").split(",").some((selector) => {
        const wanted = selector.trim().split(".").slice(1);
        return wanted.length > 0 && wanted.every((cls) => this.classes.has(cls));
      });
    },
    closest(selectors) {
      for (let current = this; current; current = current.parentElement) {
        if (current.matches(selectors)) return current;
      }
      return null;
    },
    querySelector(selectors) {
      for (const child of this.children) {
        if (child.matches(selectors)) return child;
        const found = child.querySelector(selectors);
        if (found) return found;
      }
      return null;
    },
  };
  if (rect) {
    node.getBoundingClientRect = () => rect;
  }
  for (const child of children) child.parentElement = node;
  return node;
}
