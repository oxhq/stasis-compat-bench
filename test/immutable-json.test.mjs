import assert from "node:assert/strict";
import test from "node:test";

import {
  immutablePlainJsonSnapshot,
  snapshotOwnDataReferences,
} from "../src/shared/immutable-json.mjs";

test("immutable JSON snapshot detaches aliases, preserves __proto__, and freezes recursively", () => {
  const shared = { reason: "cross_event_loop_document" };
  const source = {
    first: shared,
    second: shared,
    parsed: JSON.parse('{"__proto__":{"polluted":true}}'),
  };
  const snapshot = immutablePlainJsonSnapshot(source);
  assert.deepEqual(snapshot.first, snapshot.second);
  assert.notEqual(snapshot.first, snapshot.second);
  assert.equal(Object.getPrototypeOf(snapshot.parsed), Object.prototype);
  assert.equal(Object.hasOwn(snapshot.parsed, "__proto__"), true);
  assert.equal(snapshot.parsed.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
  assertDeepFrozen(snapshot);
  assert.throws(() => { snapshot.first.reason = "forged"; }, TypeError);
  assert.throws(() => { Object.defineProperty(snapshot, "toJSON", { value: () => source }); }, TypeError);
  assert.throws(() => { Object.setPrototypeOf(snapshot, { toJSON() { return source; } }); }, TypeError);
});

test("immutable JSON snapshot rejects toJSON, accessors, custom prototypes, proxies, and cycles", () => {
  const toJson = { safe: true };
  Object.defineProperty(toJson, "toJSON", { value: () => ({ safe: true }), enumerable: false });
  assert.throws(() => immutablePlainJsonSnapshot(toJson), /own data property/u);

  let reads = 0;
  const accessor = {};
  Object.defineProperty(accessor, "value", {
    enumerable: true,
    get() { reads += 1; return reads % 2; },
  });
  assert.throws(() => immutablePlainJsonSnapshot(accessor), /own data property/u);
  assert.equal(reads, 0);

  const inherited = Object.create({ toJSON() { return {}; } });
  inherited.safe = true;
  assert.throws(() => immutablePlainJsonSnapshot(inherited), /non-plain object prototype/u);
  assert.throws(
    () => immutablePlainJsonSnapshot({ nested: new Proxy({ safe: true }, {}) }),
    /contains a Proxy/u,
  );

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => immutablePlainJsonSnapshot(cyclic), /contains a cycle/u);
});

test("reference snapshot captures each allowed own data property exactly once", () => {
  const first = Object.freeze({ sha256: "a".repeat(64) });
  const references = snapshotOwnDataReferences({ criterion5: first }, ["criterion5", "criterion7"]);
  assert.equal(references.criterion5, first);
  assert.equal(references.criterion7, undefined);
  assert.equal(Object.isFrozen(references), true);

  let reads = 0;
  const alternating = {};
  Object.defineProperty(alternating, "criterion5", {
    enumerable: true,
    get() { reads += 1; return reads % 2 === 1 ? first : null; },
  });
  assert.throws(
    () => snapshotOwnDataReferences(alternating, ["criterion5"]),
    /own data property/u,
  );
  assert.equal(reads, 0);
  assert.throws(
    () => snapshotOwnDataReferences(new Proxy({ criterion5: first }, {}), ["criterion5"]),
    /plain own-data object/u,
  );
});

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}
