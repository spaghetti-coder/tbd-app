// A stand-in for Element: only the DOM contract the sliced functions touch.
export function fakeNode({ classes = [], id, kind, tag, rect, height = 0, width = 0, children = [] } = {}) {
  const set = new Set(classes);
  const node = {
    classes: set,
    tag: tag ?? "",
    offsetHeight: height,
    offsetWidth: width,
    classList: {
      add: (name) => set.add(name),
      remove: (name) => set.delete(name),
      contains: (name) => set.has(name),
      toggle: (name, on) => {
        const next = on ?? !set.has(name);
        set[next ? "add" : "delete"](name);
      },
    },
    dataset: { ...(kind ? { kind } : {}), ...(id ? { id } : {}) },
    style: {},
    children,
    parentElement: null,
    get firstChild() {
      return this.children[0] ?? null;
    },
    get nextSibling() {
      const at = this.parentElement?.children.indexOf(this) ?? -1;
      return at < 0 ? null : this.parentElement.children[at + 1] ?? null;
    },
    get nextElementSibling() {
      return this.nextSibling;
    },
    get previousElementSibling() {
      const at = this.parentElement?.children.indexOf(this) ?? -1;
      return at < 1 ? null : this.parentElement.children[at - 1];
    },
    append(...added) {
      for (const child of added) {
        child.remove();
        this.children.push(child);
        child.parentElement = this;
      }
    },
    before(neighbor) {
      this.parentElement?.insertBefore(neighbor, this);
    },
    cloneNode() {
      return fakeNode({
        classes: [...this.classes],
        id: this.dataset.id,
        kind: this.dataset.kind,
        tag: this.tag,
        rect: this.getBoundingClientRect ? this.getBoundingClientRect() : undefined,
        height: this.offsetHeight,
        width: this.offsetWidth,
        children: this.children.map((child) => child.cloneNode()),
      });
    },
    remove() {
      const at = this.parentElement?.children.indexOf(this) ?? -1;
      if (at >= 0) {
        this.parentElement.children.splice(at, 1);
      }
      this.parentElement = null;
    },
    insertBefore(node, ref) {
      node.remove();
      const at = ref ? this.children.indexOf(ref) : -1;
      this.children.splice(at < 0 ? this.children.length : at, 0, node);
      node.parentElement = this;
      return node;
    },
    // shortcut: descendant parts are matched by "any ancestor", no child/sibling combinators; add them when a test needs one.
    matches(selectors) {
      return selectors.replace(/:scope\s*>\s*/g, "").split(",").some((selector) => {
        const parts = selector.trim().split(/\s+/).reverse();
        if (!this.matchesPart(parts[0])) return false;
        return parts.slice(1).every((part) => {
          for (let up = this.parentElement; up; up = up.parentElement) {
            if (up.matchesPart(part)) return true;
          }
          return false;
        });
      });
    },
    matchesPart(part) {
      const classes = part.split(".").slice(1);
      return classes.length > 0 ? classes.every((cls) => this.classes.has(cls)) : this.tag === part;
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
    querySelectorAll(selectors) {
      const out = [];
      for (const child of this.children) {
        if (child.matches(selectors)) out.push(child);
        out.push(...child.querySelectorAll(selectors));
      }
      return out;
    },
  };
  if (rect) {
    node.getBoundingClientRect = () => rect;
  }
  for (const child of children) child.parentElement = node;
  return node;
}
