// The single confirm-then-run helper: wording, plural, verb dispatch, follow-up.

import assert from "node:assert/strict";
import test from "node:test";
import { slice, vm } from "./html-source.mjs";

const harness = () => {
  const asked = [];
  const done = [];
  const api = vm(
    [slice("ask"), "({ ask });"],
    {
      actionMessage: (kind, n, verb) => `${verb}/${kind}/${n}`,
      archiveMany: (kind, ids) => done.push(`archive ${kind} ${ids.join("+")}`),
      confirmModal: (message, yesLabel, onYes) => asked.push({ message, yesLabel, onYes }),
      deleteMany: (kind, ids) => done.push(`delete ${kind} ${ids.join("+")}`),
      t: (key) => key,
    },
  );
  return { ...api, asked, done };
};

test("ask builds the message from the group size and the verb", () => {
  const { ask, asked } = harness();
  ask("list", ["a"], "archive", "anchor");
  ask("item", ["a", "b"], "delete", "anchor");
  assert.deepEqual(asked.map(({ message, yesLabel }) => [message, yesLabel]), [
    ["archive/list/1", "a_archive"],
    ["delete/item/2", "a_delete"],
  ]);
});

test("ask runs the verb for every id, and only after the answer", () => {
  const { ask, asked, done } = harness();
  const ids = ["a", "b"];
  ask("item", ids, "archive", "anchor");
  ask("list", ids, "delete", "anchor");
  assert.deepEqual(done, [], "nothing runs before the user answers");
  asked[0].onYes();
  asked[1].onYes();
  assert.deepEqual(done, ["archive item a+b", "delete list a+b"]);
});

test("ask runs the follow-up after the action, and works without one", () => {
  const { ask, asked, done } = harness();
  const after = [];
  ask("list", ["a"], "delete", "anchor", () => after.push(done.length));
  ask("list", ["b"], "archive", "anchor");
  asked[0].onYes();
  asked[1].onYes();
  assert.deepEqual(done, ["delete list a", "archive list b"]);
  assert.deepEqual(after, [1], "follow-up sees the finished action");
});
