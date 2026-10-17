# TBD — single-file todo app (greenfield build)

## Summary

Build the whole `docs/spec.md` app in one new file, `index.html`: vanilla ES module (inline `<style>` + inline `<script type="module">`), LocalStorage persistence, hand-rolled pointer gestures (long-press drag, swipe edit/archive), Lucide icons as external CSS `mask-image` with CDN host fallback chain, 11 inline language dictionaries, theming (system/dark/light), pagination of the **checklist list only**, archive overlay, bulk mode with grouped drag, minipanel that slides and re-sticks to the edges of the list container.

Verified with the existing lint gates plus an `agent-browser` smoke pass over `file://` (no server), as you chose.

## Architecture (inside index.html)

Order in the file: `<head>` (viewport `viewport-fit=cover`, `color-scheme`, `theme-color`, title) → one `<style>` → body markup (header, minipanel, `#lists`, overlay root, `<template>`s) → one `<script type="module">`.

JS sections, in order, each small and single-purpose (ESLint caps: 150 lines/function, complexity 15, depth 4):

1. `icons` — pinned Lucide version, host chain `jsdelivr → unpkg → cdnjs`. Probe by loading `…/icons/check.svg` through `new Image()` (no CORS needed); first host to load sets `--ic-<name>: url(...)` for the whole pinned icon set on `:root`. Icon boxes have fixed `width/height`, so a slow/failed probe causes no layout shift.
2. `i18n` — dictionaries + `t(key, params)` with `en` fallback.
3. `store` — plain state object, `set(patch)` → `save()` (debounced 150 ms + flush on `visibilitychange: hidden`) → `render()`; `uid()` via `crypto.randomUUID()` with a random-string fallback.
4. `persist` — `tbd.v1` key, JSON blob, `try/catch`, in-memory fallback + one-shot banner when storage is unavailable or quota is exceeded.
5. `render` — full re-render of the checklist list from state; rows built by cloning `<template id="tpl-checklist">` / `tpl-item`; user text only via `textContent`/`.value`.
6. `gestures` — one Pointer-Events implementation for touch + mouse.
7. `drag` — drag model, placeholder, auto-scroll, group moves.
8. `menu` / `bulk`, `archive`, `settings`, `help`, `boot`.

Editing inputs are **uncontrolled** (value set once at render, committed on Enter / save-icon; Esc cancels), so keystrokes never trigger a state write and focus is never lost. `ui.editing = {kind, id}` marks the row that must render as an input.

## Data model & persistence

```
{
  version: 1,
  checklists: [{ id, title, expanded, createdAt, archived }],
  items:      [{ id, checklistId, text, done, createdAt, archived, archivedBy: 'user' | 'list' }],
  ui: { theme: 'system'|'dark'|'light', lang: 'auto'|code, newChecklist: 'top'|'bottom',
        newItem: 'top'|'bottom', pageSize: 'all'|number, page, panel: { side, topPct } }
}
```

* `archivedBy` is the whole trick behind the archive rules: archiving a checklist sets `archived + archivedBy:'list'` on its currently-visible items; items the user archived earlier keep `archivedBy:'user'`. Restoring a checklist restores only `archivedBy:'list'` items; `archived:'user'` items stay in the archive. Deleting a checklist deletes its items including archived ones.
* Archive overlay "Пункты" tab = `archived && archivedBy === 'user' && !checklist(checkboxId).archived`.
* Restores go to the top of their category (item → top of its checklist, checklist → top of the list, i.e. page 1).
* All UI prefs persist immediately on change; `expanded` persists per checklist.

## Behavior by subsystem

**Shell.** Sticky header: title left; `+`, settings, help right. Horizontal padding shared with the list container (`--gutter`, one token) so edges align. Lists container `max-width: 720px` centered.

**Checklist.** Click header → toggle `expanded`, persisted; chevron right/down. New checklist → inserted per setting, expanded, in edit mode with focus. All items done → header gets `is-muted` (grayed, not struck). Item rows: checkbox toggles done; completed text grayed (no line-through); tapping text does nothing.

**Sticky in-list header.** Pure CSS: `.checklist__head { position: sticky; top: var(--header-h); z-index: 2 }`, no JS, and no ancestor with `overflow` clipping. Gives exactly the spec'd "sticks while the checklist is visible, then leaves with it".

**Truncation.** Single line + ellipsis; after render (and on debounced resize) compare `scrollWidth > clientWidth` and only then show a trailing `…` button that opens the full-text modal (same modal helper used by menu modals, which show full text in their title).

**Pagination (checklists only).** `pageSize` applies to the checklist list; items of an expanded checklist all render. Prev/next + page number under the list, aligned to list edges. Creating a checklist/item whose target is off-page → set `page` to the containing page, re-render, `scrollIntoView` + brief highlight flash. "To top" = index 0 + page 1 + scroll to top.

**Theme.** `data-theme` on `<html>`; token blocks: `:root` (light), `@media (prefers-color-scheme: dark)` scoped to `[data-theme="system"]`, `[data-theme="dark"]`, `[data-theme="light"]`; `color-scheme` follows so native inputs/scrollbars match. System is default, dark fallback when the media query is unsupported.

**i18n.** `ru, bg, en, es, fr, ro, zh, ja, eo, ia, tok` complete, inline. Language menu shows native names; `auto` resolves from `navigator.language` (prefix match) → `en`. Every user-visible string, aria-label and confirmation goes through `t()`; zero literals in render code. Switching language re-renders chrome and labels without dropping edit state; `lang` set on `<html>`.

**Settings dropdown.** Anchored under the gear, right edge aligned with the button; native `<select>` for theme / language / page size, segmented radio for "new checklist top/bottom" (default bottom… per spec: top) and "new item top/bottom" (default bottom), then the Архив button. Closes on outside click / Esc.

**Minipanel.** Fixed cluster (expand all / collapse all; each disabled when it would be a no-op). Drag: long-press → moves along the current edge; live ghost indicator marks the snap target; on release it snaps to the nearer edge of the **lists container** (desktop, with margin outside the container) or of the **viewport** (mobile, overlapping the lists); exact tie → keep current side. Persisted as `{side, topPct}`; animated with a transform transition, skipped under `prefers-reduced-motion`.

**Gestures (one implementation, Pointer Events, `touch-action: pan-y`).**
* Long-press **350 ms** with **10 px** slop → capture drag (row lifts, clone follows pointer, gap placeholder shows landing slot); click suppressed after a drag.
* Auto-scroll near viewport edges (24 px band, ramped speed, rAF).
* Horizontal swipe: |dx| > 40 px and |dx| > 1.8·|dy| → row follows the finger with rubber-band and reveals the action icon behind it; release past **96 px**: left → archive confirmation, right → inline edit.
* Item drag also crosses checklists; hovering a collapsed checklist's header for **600 ms** expands it and retargets the placeholder into its body.
* Double-tap / double-click on an item text also enters edit (desktop path); checklists additionally get a pencil icon on hover/focus.
* Save icon appears at the right end of a row only while that row is in edit mode; Enter saves.

**3-dot menu modal** (checklists and items): Архивировать · Удалить (confirm) · — · To top · To bottom · — · Bulk mode; header carries the full text.

**Bulk mode.** Checkboxes turn accent-colored and replace chevrons (checklists) / ordinary checkboxes (items). Item scope = the current checklist. Minipanel becomes: separator + delete, archive, to top, to bottom, cancel. Delete/archive ask for confirmation. Drag moves the selection as an ordered block preserving relative order — `[3,7] → position 2` yields `[1,3,7,2,4,…]`.

**Archive overlay.** Full-screen overlay with tabs Чеклисты / Пункты, checkbox rows, Восстановить / Удалить (with confirm). Rules from the data model above.

**Help overlay.** Short gesture guide split mobile / desktop; opened from the header; also the target of the empty-state hint. **First run:** no seed data, one-line empty state pointing at `+`.

**Modals.** Hand-rolled layer (backdrop + panel) rather than native `<dialog>`, for iOS-14-era reach and animation control: focus trap, Esc, backdrop click, focus restore, `aria-modal`, body scroll lock. One `openModal({title, body, actions})` helper feeds confirmations, full-text and menu modals.

**Security.** User text never enters `innerHTML`; no eval; `rel="noopener"` on external links; storage access wrapped in `try/catch`; `X-Frame`/CSP untouched (single portable file, CDN icons require internet per spec).

## Milestones

1. Tokens, shell, theme, icon loader, i18n layer, store/persist, empty state.
2. Checklists + items CRUD, expand/collapse, done state, sticky header, truncation modal, pagination + jump-to-new.
3. Settings dropdown (all options) + minipanel expand/collapse-all.
4. Gestures: long-press drag (vertical + cross-list + hover-expand), swipe edit/archive, confirms, inline edit.
5. Minipanel drag, re-stick, snap indicator, animation.
6. 3-dot menu modals + bulk mode incl. grouped drag.
7. Archive overlay, help overlay, a11y/keyboard pass, lint + browser verification.

## Verification

Gates after every milestone: `npm run syntax`, `npm run lint:js`, `npm run lint:css` clean.

`agent-browser` smoke pass against `file://` (Chromium; no server), covering:
* create/rename/delete checklist and item; edit via Enter, via save icon, via double-click, via swipe right; Esc cancels.
* checkbox toggles + grayed text; all-done checklist header grays.
* expand/collapse survives reload; sticky header tracks the topmost open checklist.
* pagination: page sizes, "new checklist off-page jumps to it", "To top → page 1", "To bottom".
* archive: swipe-left confirm; overlay tabs; restore to top; item archived *before* its checklist → stays archived after the checklist is restored; deleting a checklist removes its archived items.
* bulk: multi-select, group drag order assertion `[3,7] → 2 ⇒ [1,3,7,2,4,…]`, confirm dialogs.
* drag: cross-list drop, drop into a collapsed checklist after hover-expand.
* minipanel: drag, snap left/right, persistence, disabled states.
* settings: theme override vs system, all 11 languages render (incl. `tok`/`ia`) with `en` fallback, insert-position settings, page size.
* icons: with the CDN blocked, layout stays intact and controls remain labelled.
* persistence + reload round-trip; storage-unavailable fallback banner.
* reorder/move math asserted by `eval` on pure helpers exposed as `window.__tbd` (verification hook only, no test framework).
* mobile viewport (390×844) and desktop viewport screenshots for responsive review.

## Assumptions & defaults

* You approve `rmdir` of the root-owned `index.html/` directory as the first implementation step.
* `file://` must work: only **inline** `<script type="module">` (no external/local module imports, no `fetch` of local files), `crypto.randomUUID` guarded, Lucide fetched from CDN only. Chrome/Firefox LocalStorage on `file://` is treated as a single origin, so data survives reloads but is shared across `file://` apps.
* Thresholds above (350 ms / 10 px / 96 px / 600 ms / 24 px auto-scroll) are my defaults, tunable in one `GESTURE` token object.
* Page size paginates checklists only; expanded checklists render all their items.
* Native `<select>` for settings (matches "one file, no component library"); custom listbox deferred unless it looks bad.
* No `<dialog>`; no framework; no build step; no dependencies added (`node_modules` stays dev-only for lint).
* Lucide version is pinned at implementation time (jsdelivr → unpkg → cdnjs, exact paths confirmed then, since `web_search` is blocked in this Plan policy).

## Explicitly out of scope

Multi-tab sync, undo, export/import, PWA/service worker, search, due dates, notes/subtasks, sync/server, test framework or CI, Caddy/compose changes.
