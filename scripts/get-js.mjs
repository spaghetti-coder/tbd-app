#!/usr/bin/env node

// Extract inline JS from an HTML file for eslint / node --check.
// Usage: get-js.mjs [file.html]   (default: index.html)
// Skips external (src=) scripts and non-JS blocks (importmap, text/template, ...).

import { readFileSync } from "node:fs";

process.stdout.on("error", (e) => e.code === "EPIPE" && process.exit(0)); // clean exit for `| head`

const file = process.argv[2] ?? "index.html";
const html = readFileSync(file, "utf8");

for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const [, attrs, body] = m;
  if (/\bsrc\s*=/.test(attrs)) continue; // external file: lint it directly
  const type = /type\s*=\s*["']?([\w/-]+)/i.exec(attrs)?.[1]?.toLowerCase();
  if (type && type !== "module" && !/javascript|ecmascript/.test(type)) continue;
  process.stdout.write(body.trim() ? `${body}\n` : "");
}
