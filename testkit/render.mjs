// paintChecklist over a real fakeNode graph: one card, its item host and the empty hint.
import { fakeNode } from "./fake-dom.mjs";
import { searchStub } from "./fixtures.mjs";
import { sliceVm } from "./html-source.mjs";

export const rowNode = (id) => fakeNode({ classes: ["item"], id });

export const idsOf = (host) => host.children.map((node) => node.dataset.id).join(",");

export function paintHarness(rows = []) {
  const state = { items: [] };
  const painted = [];
  const built = [];
  const host = fakeNode({ classes: ["items"], children: rows });
  const hint = fakeNode({ classes: ["card__empty"] });
  const card = fakeNode({ classes: ["card"], kind: "list", id: "L1", children: [
    fakeNode({ classes: ["card__body"], children: [hint, host] }),
  ] });
  const env = {
    state,
    search: searchStub(),
    t: (key) => key,
    isMuted: () => false,
    paintHead: (node, cl, open) => {
      node.open = open;
    },
    withoutArchived: (items, checklistId) => items.filter((i) => i.checklistId === checklistId && !i.archived),
    paintItem: (node, item) => painted.push(item.id),
    buildItem: (item) => {
      built.push(item.id);
      return rowNode(item.id);
    },
  };
  return { env, state, painted, built, card, host, hint, ...sliceVm(["reconcile", "paintChecklist"], env) };
}
