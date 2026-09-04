import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStatisticsForPairs,
  performanceStatisticsSchema,
  summarizePairedDurations,
} from "../src/performance/statistics.mjs";

const pairs = [
  { baselineNs: "10000000", candidateNs: "5000000" },
  { baselineNs: "12000000", candidateNs: "4000000" },
  { baselineNs: "8000000", candidateNs: "4000000" },
  { baselineNs: "14000000", candidateNs: "7000000" },
];

test("paired statistics retain exact samples and deterministic medians", () => {
  const result = summarizePairedDurations(pairs, {
    baselineLabel: "cypress",
  });

  assert.equal(result.schema, performanceStatisticsSchema);
  assert.equal(result.sampleCount, 4);
  assert.deepEqual(result.cypress.sortedNs, [
    "8000000",
    "10000000",
    "12000000",
    "14000000",
  ]);
  assert.deepEqual(result.cypress.medianNs, {
    numerator: "11000000",
    denominator: "1",
  });
  assert.equal(result.cypress.medianMilliseconds, "11.000000");
  assert.equal(result.cypress.iqrMilliseconds, "4.000000");
  assert.equal(result.stasis.medianMilliseconds, "4.500000");
  assert.deepEqual(result.pairedBaselineOverCandidate.exact, {
    numerator: "2",
    denominator: "1",
  });
  assert.equal(result.pairedBaselineOverCandidate.decimal, "2.000000");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.cypress), true);
  assert.equal(assertStatisticsForPairs(result, pairs, { baselineLabel: "cypress" }), result);
});

test("ratio ordering and even medians use exact rational arithmetic", () => {
  const result = summarizePairedDurations([
    { baselineNs: "1", candidateNs: "3" },
    { baselineNs: "1", candidateNs: "2" },
  ], { baselineLabel: "crawlee" });

  assert.deepEqual(result.pairedBaselineOverCandidate.exact, {
    numerator: "5",
    denominator: "12",
  });
  assert.equal(result.pairedBaselineOverCandidate.decimal, "0.416667");
  assert.equal(result.crawlee.medianMilliseconds, "0.000001");
});

test("statistics reject malformed or selectively missing samples", () => {
  const invalid = [
    [],
    [{ baselineNs: "1", candidateNs: "1" }],
    [pairs[0], { baselineNs: "0", candidateNs: "1" }],
    [pairs[0], { baselineNs: "01", candidateNs: "1" }],
    [pairs[0], { baselineNs: "1", candidateNs: "1", dropped: true }],
  ];
  for (const value of invalid) {
    assert.throws(
      () => summarizePairedDurations(value, { baselineLabel: "cypress" }),
      TypeError,
    );
  }
  assert.throws(
    () => summarizePairedDurations(pairs, { baselineLabel: "schema" }),
    /non-reserved/u,
  );
});

test("statistics replay fails closed after any retained-duration mutation", () => {
  const result = summarizePairedDurations(pairs, { baselineLabel: "cypress" });
  const tampered = structuredClone(result);
  tampered.pairedBaselineOverCandidate.decimal = "9.999999";
  assert.throws(
    () => assertStatisticsForPairs(tampered, pairs, { baselineLabel: "cypress" }),
    /do not replay exactly/u,
  );
});
