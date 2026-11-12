// Minipanel drag: press, follow, release.

import assert from "node:assert/strict";
import test from "node:test";
import { fakeNode } from "../../testkit/fake-dom.mjs";
import { plain } from "../../testkit/fixtures.mjs";
import { sliceVm } from "../../testkit/html-source.mjs";

// docks 100/900 with width 120 -> dock centres 160/960, so a switch costs 33% of the span: 264.
const GEO = {
  left: 400, top: 200, width: 120, height: 300, docks: [100, 900], topMin: 80, topMax: 600, baseMin: 100, baseMax: 500,
};

// Collapsed pill: 40px grip plus 2x5px padding and 2x1px border.
const BASE = 52;
const bandEnv = { innerHeight: 900, paddingBottom: "24px", topbarBottom: 68 };
const layoutBox = {
  document: {
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: bandEnv.topbarBottom }) }),
    body: {},
  },
  getComputedStyle: () => ({ paddingBottom: bandEnv.paddingBottom }),
};
Object.defineProperty(layoutBox, "innerHeight", { get: () => bandEnv.innerHeight });
const layout = sliceVm(
  ["GESTURE", "clamp", "cssBottomInset", "panelCeiling", "panelTopRange", "panelTop"], layoutBox);

function rig({ side = "left", geo = GEO, open = false } = {}) {
  const panel = fakeNode({ id: "panel", width: geo.width, height: geo.height, rect: { left: geo.left, top: geo.top } });
  const listeners = new Map();
  const calls = [];
  const ghosts = [];
  const persisted = [];
  let measures = 0;
  const drag = sliceVm(["GESTURE", "clamp", "panelX", "el", "createPanelDrag"], {
    byId: (id) => (id === "panel" ? panel : null),
    document: {
      createElement: (tag) => fakeNode({ tag }),
      body: {
        appendChild: (node) => {
          ghosts.push(node);
          return node;
        },
      },
      documentElement: fakeNode({}),
      getSelection: () => ({ removeAllRanges: () => calls.push("clearSelection") }),
    },
    window: {
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    },
  }).createPanelDrag({
    side: () => side,
    measure: () => {
      measures += 1;
      return { ...geo };
    },
    persist: (choice) => {
      persisted.push(choice);
      calls.push("persist");
    },
    position: () => calls.push("position"),
    suppressClick: () => calls.push("suppressClick"),
    autoScroll: { start: () => calls.push("scrollStart"), stop: () => calls.push("scrollStop") },
    modalOpen: () => open,
  });
  const moveTo = (x, y = 210) => listeners.get("pointermove")({ clientX: x, clientY: y });
  return {
    drag, calls, listeners, persisted, panel,
    active: () => drag.active(),
    measures: () => measures,
    ghost: () => ghosts.at(-1),
    moveTo,
    up: () => listeners.get("pointerup")(),
    // Grab: press + first move take up the slack, panel stays put.
    grab(x = geo.left + 50) {
      drag.onDown({ clientX: geo.left + 20, clientY: 210, pointerType: "touch", button: 0 });
      moveTo(x);
    },
  };
}

const sides = (r) => r.persisted.map((p) => `${p.side} ${p.topPct}`);

test("a press that never crosses the slop stays a tap", () => {
  const r = rig();
  r.drag.onDown({ clientX: 420, clientY: 210, pointerType: "touch", button: 0 });
  r.up();
  assert.deepEqual(r.persisted, []);
  assert.equal(r.measures(), 0, "a tap reads no geometry");
  assert.equal(r.calls.includes("scrollStart"), false);
  assert.equal(r.listeners.size, 0);
});

test("listeners are dropped once the finger is up", () => {
  const r = rig();
  r.grab();
  r.moveTo(500);
  r.up();
  assert.deepEqual([...r.listeners.keys()], []);
});

test("a mouse button other than the primary never starts a drag", () => {
  const r = rig();
  r.drag.onDown({ clientX: 420, clientY: 210, pointerType: "mouse", button: 2 });
  assert.equal(r.listeners.size, 0);
});

test("a modal holds the panel still", () => {
  const r = rig({ open: true });
  r.drag.onDown({ clientX: 420, clientY: 210, pointerType: "touch", button: 0 });
  assert.equal(r.listeners.size, 0);
});

test("a running drag is visible to the rest of the app", () => {
  const r = rig();
  assert.equal(r.active(), false);
  r.grab();
  assert.equal(r.active(), true);
  r.up();
  assert.equal(r.active(), false);
});

test("the dock holds while the finger stays within the peel threshold", () => {
  const r = rig({ geo: { ...GEO, left: 100 } });
  r.grab();
  r.moveTo(140);
  assert.equal(r.panel.style.left, "100px");
});

test("the panel follows the finger once it peels off the dock", () => {
  const r = rig({ geo: { ...GEO, left: 100 } });
  r.grab();
  r.moveTo(180);
  assert.equal(r.panel.style.left, "130px");
});

test("a peeled panel re-glues at half the threshold", () => {
  const r = rig({ geo: { ...GEO, left: 100 } });
  r.grab();
  r.moveTo(180);
  r.moveTo(170);
  assert.equal(r.panel.style.left, "120px");
  r.moveTo(155);
  assert.equal(r.panel.style.left, "100px");
});

test("release past a third of the span switches the dock", () => {
  const r = rig();
  r.grab();
  r.moveTo(600);
  r.up();
  assert.deepEqual(sides(r), ["right 0.25"]);
});

test("release short of a third keeps the side it was on", () => {
  const r = rig({ side: "right" });
  r.grab();
  r.moveTo(800);
  r.up();
  assert.deepEqual(sides(r), ["right 0.25"]);
});

test("crossing past the middle from the right dock switches to the left", () => {
  const r = rig({ side: "right" });
  r.grab();
  r.moveTo(500);
  r.up();
  assert.deepEqual(sides(r), ["left 0.25"]);
});

test("the top is clamped into the band, saved as a fraction of the collapsed one", () => {
  const low = rig();
  low.grab();
  low.moveTo(450, 60);
  low.up();
  assert.equal(low.persisted[0].topPct, 0);
  const high = rig();
  high.grab();
  high.moveTo(450, 700);
  high.up();
  assert.equal(high.persisted[0].topPct, 1);
});

test("the ghost marks the dock the release will choose, then hides", () => {
  const r = rig();
  r.grab();
  assert.equal(r.ghost().style.left, "900px");
  assert.equal(r.ghost().hidden, false);
  r.up();
  assert.equal(r.ghost().hidden, true);
});

test("geometry is read once per gesture, not per move", () => {
  const r = rig();
  r.grab();
  for (const x of [470, 500, 560, 620, 700]) {
    r.moveTo(x, 240);
  }
  r.up();
  assert.equal(r.measures(), 1);
});

test("a band with no room leaves the fraction at zero", () => {
  const r = rig({ geo: { ...GEO, baseMin: 100, baseMax: 100 } });
  r.grab();
  r.moveTo(450, 300);
  r.up();
  assert.equal(r.persisted[0].topPct, 0);
});

const DY = 210 - GEO.top;   // the offset grab() leaves between finger and panel top

test("the saved fraction puts the grip back where the drag left it", () => {
  const [min, max] = plain(layout.panelTopRange(BASE));
  for (const top of [min, 300, 500, max]) {
    const r = rig({ geo: { ...GEO, topMin: min, topMax: max, baseMin: min, baseMax: max } });
    r.grab();
    r.moveTo(450, top + DY);
    r.up();
    assert.equal(layout.panelTop(r.persisted[0].topPct, BASE, BASE), top, `grip left at ${top}`);
  }
});

test("the choice is kept before the panel is repositioned", () => {
  const r = rig();
  r.grab();
  r.moveTo(600);
  r.up();
  assert.deepEqual(r.calls, ["clearSelection", "scrollStart", "persist", "scrollStop", "position", "suppressClick"]);
});
