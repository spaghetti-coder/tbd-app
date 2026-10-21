// The app is a single file with no build, so the functions under test are sliced out of
// index.html by name and evaluated in a VM.
import { readFileSync } from "node:fs";

export const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Every app function sits at column 0, so the first `^}` ends it.
export function slice(name) {
  const found = new RegExp(`^function ${name}\\b[\\s\\S]*?^\\}`, "m").exec(html);
  if (!found) {
    throw new Error(`test harness: function ${name}() not found in index.html (renamed?)`);
  }
  return found[0];
}

// Same trick for the dictionary literals: they end with `^};` at column 0.
export function sliceObject(name) {
  const found = new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`, "m").exec(html);
  if (!found) {
    throw new Error(`test harness: const ${name} not found in index.html (renamed?)`);
  }
  return found[0];
}
