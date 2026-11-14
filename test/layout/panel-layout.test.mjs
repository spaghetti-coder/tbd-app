// Mini panel placement: the band, the docks, the fraction.

import assert from "node:assert/strict";
import test from "node:test";
import { plain } from "../../testkit/fixtures.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";

/* Topbar ends at 68 -> band starts at 80; a 52px pill reaches 824 behind a 24px inset, 836 with the plain gap. */
const SCREEN = {
  left: 400, top: 200, width: 120, height: 52, collapsed: 52,
  topbar: 68, bottomInset: 24, innerW: 1000, innerH: 900,
  safeLeft: 0, safeRight: 0, wrapLeft: 100, wrapRight: 900,
};

// measure() answers only for the mode setRow left.
function rig({ standing = SCREEN, lying = standing } = {}) {
  const written = [];
  let row = false;
  const layout = sliceVm(["GESTURE", "clamp", "createPanelLayout"], {}).createPanelLayout({
    measure: () => ({ ...(row ? lying : standing) }),
    setRow: (value) => {
      row = value;
    },
    write: (out) => written.push({ ...plain(out), row }),
  });
  return {
    layout,
    placeAt(pct = 0.5, side = "left") {
      layout.place(side, pct);
      return written.at(-1);
    },
  };
}

test("the band starts under the topbar and ends above the bottom inset", () => {
  assert.equal(rig().placeAt(0).top, 80);
  assert.equal(rig({ standing: { ...SCREEN, topbar: 72.4 } }).placeAt(0).top, 84, "the topbar edge is rounded");
});

test("the fraction scales over the collapsed band", () => {
  for (const [pct, top] of [[0, 80], [0.5, 452], [0.71, 608], [1, 824]]) {
    assert.equal(rig().placeAt(pct).top, top, `fraction ${pct}`);
  }
});

test("the bottom inset floors the band, the gesture gap when there is none", () => {
  assert.equal(rig({ standing: { ...SCREEN, bottomInset: 0 } }).placeAt(1).top, 836, "inset 0: the 12px gap floors it");
  assert.equal(rig({ standing: { ...SCREEN, bottomInset: 4 } }).placeAt(1).top, 836, "below the gap the gap is the floor");
  assert.equal(rig({ standing: { ...SCREEN, bottomInset: 34 } }).placeAt(1).top, 814);
});

test("a taller panel is clamped into its own band", () => {
  const tall = { ...SCREEN, height: 300 };
  assert.equal(rig({ standing: tall }).placeAt(0.5).top, 452, "the fraction still holds inside both bands");
  assert.equal(rig({ standing: tall }).placeAt(1).top, 576, "the grip stops where the panel's own band ends");
});

test("a panel with no room lies down, and a panel with room stays stacked", () => {
  const short = { ...SCREEN, innerH: 390, bottomInset: 0 };
  assert.equal(rig({ standing: { ...short, height: 374 } }).placeAt(0.5).row, true, "374px of pill in 390px of screen");
  assert.equal(rig({ standing: { ...short, height: 297 } }).placeAt(0.5).row, false, "one pixel of band left");
});

test("lying down, the docks and the band are the lying panel's", () => {
  const short = { ...SCREEN, innerH: 390, bottomInset: 0 };
  const r = rig({ standing: { ...short, height: 374 }, lying: { ...short, width: 374, collapsed: 38 } });
  const out = r.placeAt(0.5, "right");
  assert.equal(out.row, true);
  assert.equal(out.left, 626, "the dock is the lying width's: pill stays on screen");
  assert.equal(out.top, 210, "the fraction scales over the lying pill's band");
  assert.equal(r.placeAt(r.layout.forDrag().fractionOf(210), "right").top, 210, "a drag's fraction survives the mode");
});

test("the docks sit beside the lists when they leave room", () => {
  const room = { ...SCREEN, wrapLeft: 300, wrapRight: 700 };
  assert.equal(rig({ standing: room }).placeAt(0.5, "left").left, 168);
  assert.equal(rig({ standing: room }).placeAt(0.5, "right").left, 712);
});

test("the docks fall back to the safe edges, and never cross them", () => {
  assert.equal(rig().placeAt(0.5, "left").left, 0, "no room beside the lists: the safe edge");
  assert.equal(rig().placeAt(0.5, "right").left, 880);
  const tight = { ...SCREEN, wrapLeft: 300, wrapRight: 900, safeLeft: 200, safeRight: 40 };
  assert.equal(rig({ standing: tight }).placeAt(0.5, "left").left, 200, "room beside the lists, but the safe edge is further in");
  assert.equal(rig({ standing: tight }).placeAt(0.5, "right").left, 840);
});

test("the fraction a drag saves puts the panel back where the drag left it", () => {
  const r = rig();
  for (const top of [80, 300, 500, 824]) {
    assert.equal(r.placeAt(r.layout.forDrag().fractionOf(top)).top, top, `left at ${top}`);
  }
});

test("a band with no room leaves the fraction at zero", () => {
  const flat = { ...SCREEN, innerH: 156 };
  assert.equal(rig({ standing: flat }).layout.forDrag().fractionOf(400), 0);
});
