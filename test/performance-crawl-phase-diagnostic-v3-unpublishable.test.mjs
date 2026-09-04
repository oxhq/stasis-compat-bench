import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertCrawlPhaseDiagnosticV3Unpublishable,
  crawlPhaseDiagnosticV3UnpublishableIdentity,
  verifyCrawlPhaseDiagnosticV3UnpublishableObservation,
} from "../src/performance/crawl-phase-diagnostic-v3-unpublishable.mjs";
import {
  createCrawlPhaseDiagnosticV3UnpublishableFixture,
} from "./fixtures/crawl-phase-diagnostic-v3-unpublishable-fixture.mjs";

test("the canonical V3 unpublishable record contains no reusable observation values", () => {
  const bytes = readFileSync(new URL(
    "../protocol/stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-unpublishable.json",
    import.meta.url,
  ));
  const value = JSON.parse(bytes);
  assert.deepEqual(
    assertCrawlPhaseDiagnosticV3Unpublishable(value),
    crawlPhaseDiagnosticV3UnpublishableIdentity,
  );
  assert.deepEqual(bytes, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
  assert.equal(value.exclusion.artifactPayloadConsumedByMotivationVerifier, false);
  assert.equal(value.exclusion.rawTimingImportedIntoV4ContractOrVerifier, false);
  assert.equal(value.exclusion.diagnosticOutcomeImportedIntoV4ContractOrVerifier, false);
  assert.equal(value.exclusion.comparisonValueImportedIntoV4ContractOrVerifier, false);
  assert.equal(value.claimBoundary.timingEligible, false);
  assert.equal(value.claimBoundary.comparisonEligible, false);
  assert.equal(value.hostedObservation.raw, undefined);
  assert.equal(value.hostedObservation.samples, undefined);
});

test("the actual V3 metadata reproduces the H6 target failure and exact-target counterfactual", () => {
  const receipt = verifyCrawlPhaseDiagnosticV3UnpublishableObservation(
    createCrawlPhaseDiagnosticV3UnpublishableFixture(),
  );
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.runId, 33899303292);
  assert.deepEqual(receipt.observedPostSteps.map(({ number }) => number), [45, 46, 47]);
  assert.equal(receipt.h6VerifierObservedTargetCommitish, "main");
  assert.equal(
    receipt.h6VerifierRequiredTargetCommitish,
    "c71a6c1d9ecf4cc27f72b60f7b51050880665fc5",
  );
  assert.equal(
    receipt.h6VerifierError,
    "diagnostic contract release identity is invalid",
  );
  assert.equal(receipt.verification.actualMainTargetRejectedByFrozenH6Verifier, true);
  assert.equal(
    receipt.verification.exactH6TargetCounterfactualAcceptedByFrozenH6Verifier,
    true,
  );
  assert.equal(receipt.verification.exactV3TopologyAcceptedUnderTargetCounterfactual, true);
  assert.equal(receipt.verification.rawTimingImportedIntoV4ContractOrVerifier, false);
  assert.equal(receipt.verification.v3EvidenceReleaseAuthorized, false);
});

test("future Actions artifact expiry does not invalidate the frozen V3 motivation", () => {
  const fixture = createCrawlPhaseDiagnosticV3UnpublishableFixture();
  fixture.artifactsListing.artifacts[0].expired = true;
  const receipt = verifyCrawlPhaseDiagnosticV3UnpublishableObservation(fixture);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.verification.artifactWasUnexpiredAtFreeze, true);
  assert.equal(receipt.verification.futureArtifactExpiryIgnoredAfterFreeze, true);
});

test("the V3 motivation rejects any changed observed target, tag, or topology", () => {
  for (const [mutation, pattern] of [
    [
      (fixture) => { fixture.contractReleaseRecord.target_commitish = "a".repeat(40); },
      /V3 contract release identity changed/u,
    ],
    [
      (fixture) => { fixture.contractTagRefRecord.object.sha = "a".repeat(40); },
      /V3 contract tag identity changed/u,
    ],
    [
      (fixture) => { fixture.jobsListing.jobs[0].steps.at(-1).number = 46; },
      /V3 observed post-step topology changed/u,
    ],
  ]) {
    const fixture = createCrawlPhaseDiagnosticV3UnpublishableFixture();
    mutation(fixture);
    assert.throws(
      () => verifyCrawlPhaseDiagnosticV3UnpublishableObservation(fixture),
      pattern,
    );
  }
});

test("the V3 motivation rejects any attempt to authorize reuse", () => {
  for (const mutation of [
    (value) => { value.exclusion.rawTimingImportedIntoV4ContractOrVerifier = true; },
    (value) => { value.exclusion.v3EvidenceReleaseAuthorized = true; },
    (value) => { value.claimBoundary.comparisonEligible = true; },
  ]) {
    const value = structuredClone(crawlPhaseDiagnosticV3UnpublishableIdentity);
    mutation(value);
    assert.throws(
      () => assertCrawlPhaseDiagnosticV3Unpublishable(value),
      /Diagnostic V3 unpublishable motivation changed/u,
    );
  }
});
