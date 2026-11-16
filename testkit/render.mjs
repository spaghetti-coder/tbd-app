// Row-shaped fake nodes for the reconcile walk.
import { fakeNode } from "./fake-dom.mjs";

export const rowNode = (id) => fakeNode({ classes: ["item"], id });

export const idsOf = (host) => host.children.map((node) => node.dataset.id).join(",");
