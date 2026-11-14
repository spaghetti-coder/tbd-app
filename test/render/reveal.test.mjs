// Scroll stops at the visible band. Centring puts a row under the keyboard and pans the visual
// viewport, pushing the sticky header off screen. A new result set starts at the page top.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

const { revealDelta, revealTop } = sliceVm(["revealDelta", "revealTop"]);

// The header line a card head sticks to, and the band that starts 8px under it.
const band = { header: 56, top: 64, bottom: 500 };

// The row to reveal in a card whose head paints at `head`: a list row is the card itself.
const rowUnder = (kind, head) => {
  const item = fakeNode({ kind: "item" });
  const card = fakeNode({
    classes: ["card"], kind: "list",
    children: [fakeNode({ classes: ["card__head"], rect: head }), item],
  });
  return kind === "item" ? item : card;
};

// [row top, row bottom, expected scroll]; band = header..keyboard.
test("a row is scrolled just far enough to sit inside the band", () => {
  const rows = [
    [100, 144, 0],
    [64, 108, 0],
    [456, 500, 0],
    [470, 514, 14],
    [600, 644, 144],
    [20, 64, -44],
    [60, 900, -4],
  ];
  for (const [top, bottom, want] of rows) {
    assert.equal(revealDelta({ top, bottom }, band), want, `${top}..${bottom}`);
  }
});

// A card head sticks under the header and paints over the top of the band.
test("an item revealed at the top clears the stuck head of its list", () => {
  assert.equal(revealTop(rowUnder("item", { top: 56, bottom: 108 }), band), 108);
});

test("a head above the band costs nothing", () => {
  assert.equal(revealTop(rowUnder("item", { top: -200, bottom: 4 }), band), 64);
});

test("a list head pinned to the header line has nowhere to be scrolled to", () => {
  assert.equal(revealTop(rowUnder("list", { top: 56, bottom: 108 }), band), 56);
});

test("a list head shoved above the line by its own card is still revealed", () => {
  assert.equal(revealTop(rowUnder("list", { top: 40, bottom: 92 }), band), 64);
});

// Records scrollTo args as a string; VM opts are cross-realm.
const topScroll = (offset, reduced) => {
  const calls = [];
  sliceVm(["reduce", "scrollBehavior", "toTop"], {
    matchMedia: () => ({ matches: reduced }),
    scrollY: offset,
    scrollTo: (opts) => calls.push(`${opts.top} ${opts.behavior}`),
  }).toTop();
  return calls.join(" | ");
};

test("a new result set scrolls to the top", () => {
  assert.equal(topScroll(800, false), "0 smooth");
});

test("reduced motion reaches the top at once", () => {
  assert.equal(topScroll(800, true), "0 auto");
});

test("already at the top - nothing runs", () => {
  assert.equal(topScroll(0, false), "");
});
