// Reveal stops at the visible band; an ask dies on the next paint.

import assert from "node:assert/strict";
import test from "node:test";
import { clockFake } from "../../testkit/store-fake.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";
import { fakeNode } from "../../testkit/fake-dom.mjs";

const { revealDelta, revealTop } = sliceVm(["revealDelta", "revealTop"]);

// Header line a card head sticks to, band starting 8px under it.
const band = { header: 56, top: 64, bottom: 500 };

// Row to reveal in a card whose head paints at `head`: a list row is the card.
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

// A stuck head paints over the top of the band.
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

/* --- who is revealed --- */

const REVEAL = [
  "reduce", "scrollBehavior", "visibleBand", "revealDelta", "revealTop",
  "FLASH", "LONG_FLASH", "flashTimers", "createReveal",
];

// A screen: header to 56, pager 44, viewport 800 -> band 64..740.
const stage = (rect) => {
  const clock = clockFake();
  const scrolls = [];
  const topbar = fakeNode({ rect: { top: 0, bottom: 56 } });
  const pager = fakeNode({ classes: ["pager"], height: 44 });
  const zone = fakeNode({ classes: ["card__row"], rect });
  const row = fakeNode({
    classes: ["card"], kind: "list", id: "L1",
    children: [fakeNode({ classes: ["card__head"], rect: { top: 56, bottom: 100 } }), zone],
  });
  const props = {};
  row.style = {
    setProperty: (name, value) => {
      props[name] = value;
    },
    removeProperty: (name) => {
      delete props[name];
    },
  };
  const reveal = sliceVm(REVEAL, {
    matchMedia: () => ({ matches: false }),
    document: { querySelector: (selectors) => (selectors === ".topbar" ? topbar : null) },
    byId: (id) => (id === "pager" ? pager : null),
    visualViewport: { height: 800, offsetTop: 0 },
    scrollBy: (opts) => scrolls.push(`${opts.top} ${opts.behavior}`),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  }).createReveal({
    rowById: (kind, id) => (id === "L1" ? row : null),
    parts: () => ({ zone }),
  });
  return { reveal, scrolls, row, props, clock };
};

// 204px of scroll reach the bottom edge.
const below = { top: 900, bottom: 944 };

test("a jump is revealed by the paint that brings it, once", () => {
  const { reveal, scrolls } = stage(below);
  reveal.afterPaint();
  assert.deepEqual(scrolls, [], "nothing asked for yet");
  reveal.to("list", "L1");
  reveal.afterPaint();
  assert.deepEqual(scrolls, ["204 smooth"]);
  reveal.afterPaint();
  assert.equal(scrolls.length, 1, "spent on the paint it waited for");
});

test("a revealed row flashes and stops on its own", () => {
  const { reveal, row, props, clock } = stage(below);
  reveal.to("list", "L1");
  reveal.afterPaint();
  assert.equal(props["--flash"], "900ms");
  assert.ok(row.classes.has("is-flash"));
  clock.run();
  assert.equal(props["--flash"], undefined);
  assert.ok(!row.classes.has("is-flash"));
});

test("a jump across screens flashes twice as long", () => {
  const { reveal, props } = stage(below);
  reveal.to("item", "L1", { flash: "long" });
  reveal.afterPaint();
  assert.equal(props["--flash"], "1800ms");
});

test("a row the paint did not bring is dropped, not held", () => {
  const { reveal, scrolls } = stage(below);
  reveal.to("item", "gone");
  reveal.afterPaint();
  assert.deepEqual(scrolls, []);
  reveal.to("list", "L1");
  reveal.afterPaint();
  assert.deepEqual(scrolls, ["204 smooth"], "the next ask still lands");
});

test("a keyboard re-flow re-reveals, nothing flashes", () => {
  const { reveal, row, props, scrolls } = stage(below);
  reveal.row(row);
  reveal.row(row);
  assert.deepEqual(scrolls, ["204 smooth", "204 smooth"]);
  assert.equal(props["--flash"], undefined);
});
