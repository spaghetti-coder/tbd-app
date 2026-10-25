// The app is a single file with no build, so the code under test is sliced out of
// index.html by name and evaluated in a VM. A parser locates the declarations, so slicing
// does not depend on indentation or formatting.
import { readFileSync } from "node:fs";
import { parse } from "acorn";
import { inlineScripts } from "../scripts/inline-scripts.mjs";

export const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// shortcut: top-level declarations only; walk nested scopes if a tested helper ever moves into a block.
const declared = new Map();
for (const body of inlineScripts(html)) {
  const program = parse(body, { ecmaVersion: "latest", sourceType: "module" });
  for (const node of program.body) {
    if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      declared.set(node.id.name, body.slice(node.start, node.end));
    } else if (node.type === "VariableDeclaration") {
      for (const d of node.declarations) declared.set(d.id.name, `${node.kind} ${body.slice(d.start, d.end)};`);
    }
  }
}

export function slice(name) {
  const src = declared.get(name);
  if (!src) {
    throw new Error(`test harness: ${name} not found in index.html (renamed?)`);
  }
  return src;
}
