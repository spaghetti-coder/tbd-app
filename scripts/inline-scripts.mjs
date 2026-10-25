// Inline JS <script> bodies of an HTML file. Skips external (src=) scripts and
// non-JS blocks (importmap, text/template, ...).
export function* inlineScripts(html) {
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = m;
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = /type\s*=\s*["']?([\w/-]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== "module" && !/javascript|ecmascript/.test(type)) continue;
    yield body;
  }
}
