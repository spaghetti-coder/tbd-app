// The dictionaries and the confirmation keys they are asked for.

import assert from "node:assert/strict";
import test from "node:test";
import { sliceVm } from "../../testkit/html-source.mjs";
// Dictionary literals: evaluate once for all tests.
const { DICTS: dicts } = sliceVm(["EN", "DICTS"]);
const { actionMessage } = sliceVm(["actionMessage"], { t: (key) => key });

test("actionMessage names the confirmation key for kind, count and verb", () => {
  for (const kind of ["list", "item"]) {
    for (const verb of ["archive", "delete"]) {
      assert.equal(actionMessage(kind, 1, verb), `c_${verb}_${kind}`);
      assert.equal(actionMessage(kind, 2, verb), `c_${verb}_${kind}s`);
    }
  }
});

test("every dictionary defines exactly the keys EN defines", () => {
  const en = Object.keys(dicts.en).sort();
  assert.ok(en.length > 50, "EN dictionary looks truncated");
  for (const [code, dict] of Object.entries(dicts)) {
    assert.deepEqual(Object.keys(dict).sort(), en, `dictionary "${code}" is out of sync with EN`);
  }
  // EN parity covers every dictionary: check the confirmation keys in EN only.
  const wanted = ["list", "item"].flatMap((kind) =>
    ["archive", "delete"].flatMap((verb) => [actionMessage(kind, 1, verb), actionMessage(kind, 2, verb)]));
  for (const key of wanted) {
    assert.ok(typeof dicts.en[key] === "string" && dicts.en[key].length > 0, `EN has no "${key}"`);
  }
});

test("every dictionary interpolates the same placeholders as EN", () => {
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [code, dict] of Object.entries(dicts)) {
    for (const key of Object.keys(dicts.en)) {
      assert.deepEqual(placeholders(dict[key]), placeholders(dicts.en[key]),
        `dictionary "${code}" key "${key}" placeholders differ from EN`);
    }
  }
});
