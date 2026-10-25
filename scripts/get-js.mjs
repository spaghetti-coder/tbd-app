#!/usr/bin/env node

// Extract inline JS from an HTML file for eslint / node --check.
// Usage: get-js.mjs [file.html]   (default: index.html)

import { readFileSync } from "node:fs";
import { inlineScripts } from "./inline-scripts.mjs";

process.stdout.on("error", (e) => e.code === "EPIPE" && process.exit(0)); // clean exit for `| head`

const file = process.argv[2] ?? "index.html";

for (const body of inlineScripts(readFileSync(file, "utf8"))) {
  process.stdout.write(body.trim() ? `${body}\n` : "");
}
