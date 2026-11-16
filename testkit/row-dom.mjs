// Rows cloned from the shipped <template>; answers from the real search module.
import { JSDOM } from "jsdom";
import { html, sliceVm } from "./html-source.mjs";

const doc = new JSDOM(html).window.document;

// Sliced from index.html, not faked.
const DEPS = [
  "el", "byId", "ICONS", "iconPair", "labelNode", "paintText", "reconcile",
  "isMuted", "withoutArchived", "createSearch", "createRowView",
];

export const ui = (extra = {}) => ({
  pageSize: 20,
  page: 1,
  bulk: { kind: null, ids: [] },
  search: { text: "", lists: true, items: true },
  editing: null,
  ...extra,
});

// search reads the same state object the test mutates.
export function rowHarness(state = { checklists: [], items: [], ui: ui() }) {
  const sandbox = { document: doc, state, t: (key) => key, needFocus: false };
  const api = sliceVm(DEPS, sandbox);
  const search = api.createSearch(() => sandbox.state);
  return {
    state,
    search,
    view: api.createRowView({
      getState: () => sandbox.state,
      search,
      askFocus: () => {
        sandbox.needFocus = true;
      },
    }),
    // What the painter asked render for.
    focusAsked: () => sandbox.needFocus,
    resetFocus: () => {
      sandbox.needFocus = false;
    },
  };
}

export const cardNode = () =>
  doc.getElementById("tpl-checklist").content.firstElementChild.cloneNode(true);

export const itemNode = () =>
  doc.getElementById("tpl-item").content.firstElementChild.cloneNode(true);

export const marks = (node) => [...node.querySelectorAll("mark")].map((m) => m.textContent);

export const q = (node, selector) => node.querySelector(selector);

export const ids = (host) => [...host.children].map((node) => node.dataset.id).join(",");
