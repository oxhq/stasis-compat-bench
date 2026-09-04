import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertCrawlPhaseDiagnosticV2Unpublishable,
  crawlPhaseDiagnosticV2UnpublishableIdentity,
  verifyCrawlPhaseDiagnosticV2UnpublishableObservation,
} from "../src/performance/crawl-phase-diagnostic-v2-unpublishable.mjs";
import {
  createCrawlPhaseDiagnosticHostedFixture,
} from "./fixtures/crawl-phase-diagnostic-hosted-fixture-v2.mjs";

test("the canonical V2 unpublishable record contains no reusable timing evidence", () => {
  const bytes = readFileSync(new URL(
    "../protocol/stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable.json",
    import.meta.url,
  ));
  const value = JSON.parse(bytes);
  assert.deepEqual(assertCrawlPhaseDiagnosticV2Unpublishable(value),
    crawlPhaseDiagnosticV2UnpublishableIdentity);
  assert.deepEqual(bytes, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
  assert.equal(value.exclusion.artifactPayloadConsumedByMotivationVerifier, false);
  assert.equal(value.exclusion.rawTimingImportedIntoV3ContractOrVerifier, false);
  assert.equal(value.exclusion.diagnosticOutcomeImportedIntoV3ContractOrVerifier, false);
  assert.equal(value.exclusion.comparisonValueImportedIntoV3ContractOrVerifier, false);
  assert.equal(value.claimBoundary.timingEligible, false);
  assert.equal(value.claimBoundary.comparisonEligible, false);
  assert.equal(value.hostedObservation.raw, undefined);
  assert.equal(value.hostedObservation.samples, undefined);
});

test("the actual V2 45/46/47 topology proves the frozen verifier defect", () => {
  const fixture = actualV2ObservationFixture();
  const receipt = verifyCrawlPhaseDiagnosticV2UnpublishableObservation(fixture);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.runId, 33893969529);
  assert.deepEqual(receipt.observedPostSteps.map(({ number }) => number), [45, 46, 47]);
  assert.deepEqual(receipt.v2VerifierFrozenPostSteps.map(({ number }) => number), [44, 45, 46]);
  assert.equal(receipt.verification.actualTopologyRejectedByFrozenV2Verifier, true);
  assert.equal(receipt.verification.frozenCounterfactualTopologyAcceptedByV2Verifier, true);
  assert.equal(receipt.verification.rawTimingImportedIntoV3ContractOrVerifier, false);
  assert.equal(receipt.verification.v2EvidenceReleaseAuthorized, false);
});

test("the V2 motivation rejects the counterfactual old topology as the observation", () => {
  const fixture = actualV2ObservationFixture();
  fixture.jobsListing.jobs[0].steps.slice(-3).forEach((step, index) => {
    step.number = [44, 45, 46][index];
  });
  assert.throws(
    () => verifyCrawlPhaseDiagnosticV2UnpublishableObservation(fixture),
    /Diagnostic V2 observed post-step topology changed/u,
  );
});

test("the V2 motivation rejects any attempt to authorize evidence or timing reuse", () => {
  for (const mutation of [
    (value) => { value.exclusion.rawTimingImportedIntoV3ContractOrVerifier = true; },
    (value) => { value.exclusion.v2EvidenceReleaseAuthorized = true; },
    (value) => { value.claimBoundary.comparisonEligible = true; },
  ]) {
    const value = structuredClone(crawlPhaseDiagnosticV2UnpublishableIdentity);
    mutation(value);
    assert.throws(
      () => assertCrawlPhaseDiagnosticV2Unpublishable(value),
      /Diagnostic V2 unpublishable motivation changed/u,
    );
  }
});

function actualV2ObservationFixture() {
  const fixture = createCrawlPhaseDiagnosticHostedFixture();
  const identity = crawlPhaseDiagnosticV2UnpublishableIdentity;
  const source = identity.workflowSource;
  const observation = identity.hostedObservation;
  const run = fixture.runRecord;
  Object.assign(run, {
    id: observation.runId,
    name: "Stasis v0.3.3 performance crawl phase diagnostic V2",
    path: source.workflowPath,
    head_branch: source.branch,
    head_sha: source.commitSha,
    run_attempt: observation.runAttempt,
    created_at: observation.createdAt,
    run_started_at: observation.runStartedAt,
    updated_at: observation.completedAt,
  });
  fixture.workflowRunsListing = { total_count: 1, workflow_runs: [structuredClone(run)] };

  const job = fixture.jobsListing.jobs[0];
  Object.assign(job, {
    id: observation.jobId,
    run_id: observation.runId,
    run_attempt: observation.runAttempt,
    name: "Native Ubuntu 22.04 crawl phase diagnostic V2",
    workflow_name: run.name,
    head_branch: source.branch,
    head_sha: source.commitSha,
  });
  job.steps.slice(-3).forEach((step, index) => {
    step.number = observation.observedPostSteps[index].number;
  });

  const artifact = fixture.artifactsListing.artifacts[0];
  Object.assign(artifact, {
    id: observation.artifact.id,
    name: observation.artifact.name,
    size_in_bytes: observation.artifact.bytes,
    digest: `sha256:${observation.artifact.sha256}`,
  });
  Object.assign(artifact.workflow_run, {
    id: observation.runId,
    head_branch: source.branch,
    head_sha: source.commitSha,
  });

  const contract = identity.v2Contract;
  Object.assign(fixture.diagnosticContractReleaseRecord, {
    id: contract.releaseId,
    tag_name: contract.tag,
    target_commitish: contract.commitSha,
    created_at: contract.createdAt,
    published_at: contract.publishedAt,
  });
  fixture.diagnosticContractReleaseRecord.assets = contract.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    size: asset.bytes,
    digest: `sha256:${asset.sha256}`,
  }));
  Object.assign(fixture.diagnosticContractCommitRecord, {
    sha: contract.commitSha,
    commit: { tree: { sha: contract.treeSha } },
    parents: [{ sha: contract.parentCommitSha }],
  });
  fixture.diagnosticContractTagRefRecord = {
    ref: `refs/tags/${contract.tag}`,
    object: { type: "commit", sha: contract.commitSha },
  };
  return {
    runRecord: fixture.runRecord,
    workflowRunsListing: fixture.workflowRunsListing,
    jobsListing: fixture.jobsListing,
    artifactsListing: fixture.artifactsListing,
    contractReleaseRecord: fixture.diagnosticContractReleaseRecord,
    contractCommitRecord: fixture.diagnosticContractCommitRecord,
    contractTagRefRecord: fixture.diagnosticContractTagRefRecord,
  };
}
