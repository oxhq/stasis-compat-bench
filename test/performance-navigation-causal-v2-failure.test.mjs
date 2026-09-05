import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPostSupportPublicSourcePatchPrivacy } from
  "../src/post-support/artifact-privacy.mjs";
import {
  inspectNavigationCausalV2FailureLogPrivacy,
  navigationCausalInvalidV2Evidence,
  navigationCausalV2FailureVerificationSchema,
  verifyNavigationCausalV2FailureArchive,
  verifyNavigationCausalV2FailureLiveAuthority,
} from "../src/performance/navigation-causal-v2-failure.mjs";

const authorityName =
  "stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json";
const logsName = "stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip";
const contractAssetNames = Object.freeze([
  "stasis-v0.3.3-performance-navigation-causal-preflight-v2.json",
  "stasis-v0.3.3-performance-navigation-causal-v2.md",
  "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v2.json",
  "stasis-v0.3.3-performance-navigation-causal-workflow-v2.yml",
]);

const [authorityBundleBytes, actionsLogsZipBytes, contractAssetEntries] = await Promise.all([
  readProtocolAsset(authorityName),
  readProtocolAsset(logsName),
  Promise.all(contractAssetNames.map(async (name) => [name, await readProtocolAsset(name)])),
]);
const authorityBundle = JSON.parse(authorityBundleBytes.toString("utf8"));
const v2ContractAssets = Object.freeze(Object.fromEntries(contractAssetEntries));
const v2PreflightReceiptBytes = canonicalJsonBytes(authorityBundle.records.preflightReceipt);

test("the exact V2 failure archive replays one typed pre-measurement disposition", () => {
  const result = verifyNavigationCausalV2FailureArchive({
    authorityBundleBytes,
    actionsLogsZipBytes,
  });
  const { schema, archive, verification, ...disposition } = result;

  assert.equal(schema, navigationCausalV2FailureVerificationSchema);
  assert.deepEqual(disposition, navigationCausalInvalidV2Evidence);
  assert.equal(result.status, "INVALID_PRE_MEASUREMENT_HARNESS_INVOCATION");
  assert.equal(result.reasonCode, "NON_PLAIN_PROCESS_ENV_REJECTED_BEFORE_RUN_HOST");
  assert.equal(result.productMeasurementStarted, false);
  assert.equal(result.noRetainedMeasurementArtifacts, true);
  assert.equal(result.claimBoundary.authorityEligible, false);
  assert.equal(result.claimBoundary.timingEligible, false);
  assert.equal(archive.entryCount, 40);
  assert.equal(archive.actionsLogs.name, logsName);
  assert.equal(archive.capturedErrorOccurrencesInAggregateLogs, 2);
  assert.equal(archive.capturedErrorOccurrencesInStep14Logs, 2);
  assert.equal(verification.exactFailedStepTopology, true);
  assert.equal(verification.zeroActionsArtifacts, true);
  assert.equal(verification.productMeasurementStarted, false);
  assert.equal(verification.nativeLaunchCountProvenByPublicMetadata, false);
});

test("canonical bundle semantic drift and any ZIP byte drift fail exact identity", () => {
  const changedBundle = structuredClone(authorityBundle);
  changedBundle.status = "captured_valid_measurement";
  const changedBundleBytes = canonicalJsonBytes(changedBundle);
  assert.notDeepEqual(changedBundleBytes, authorityBundleBytes);
  assert.throws(
    () => verifyNavigationCausalV2FailureArchive({
      authorityBundleBytes: changedBundleBytes,
      actionsLogsZipBytes,
    }),
    /failure-authority\.json bytes changed/u,
  );

  const changedZipBytes = Buffer.from(actionsLogsZipBytes);
  changedZipBytes[changedZipBytes.length - 1] ^= 1;
  assert.throws(
    () => verifyNavigationCausalV2FailureArchive({
      authorityBundleBytes,
      actionsLogsZipBytes: changedZipBytes,
    }),
    /actions-logs\.zip bytes changed/u,
  );
});

test("archived records plus exact V2 assets replay direct live public authority", () => {
  const result = verifyNavigationCausalV2FailureLiveAuthority(liveFixture());

  assert.equal(result.livePublicAuthorityReplayed, true);
  assert.equal(result.archive.entryCount, 40);
  assert.equal(result.verification.exactV2ContractAssetsFetchedAnonymously, true);
  assert.equal(result.verification.exactV2PreflightReceiptFetchedAnonymously, true);
  assert.equal(result.verification.branchAndHeadShaCensusesFetchedWithoutEventFilter, true);
  assert.equal(result.verification.allAttemptsJobListingReplayed, true);
  assert.equal(result.verification.v2EvidenceReleaseAndTagStillAbsent, true);
  assert.equal(result.verification.retainedCaptureCorroboratedByLivePublicMetadata, true);
  assert.equal(result.verification.capturedLogsRefetchedAnonymously, false);
});

test("live authority rejects every requested hosted false-green", () => {
  const mutations = [
    {
      name: "an extra all-event branch run",
      change(fixture) {
        const listing = fixture.liveRecords.workflowRunsByBranch;
        listing.total_count = 2;
        listing.workflow_runs.push({ ...listing.workflow_runs[0], id: 33_937_724_072 });
      },
      error: /branch run census is not exactly one/u,
    },
    {
      name: "run attempt two",
      change(fixture) {
        fixture.liveRecords.workflowRun.run_attempt = 2;
      },
      error: /failed run identity changed/u,
    },
    {
      name: "an extra all-attempt job",
      change(fixture) {
        const listing = fixture.liveRecords.workflowJobsAllAttempts;
        listing.total_count = 3;
        listing.jobs.push({ ...listing.jobs[0], id: 101_228_807_575 });
      },
      error: /all-attempt job census changed/u,
    },
    {
      name: "a retained Actions artifact where the census was zero",
      change(fixture) {
        fixture.liveRecords.workflowArtifacts = {
          total_count: 1,
          artifacts: [{ id: 1, name: "unexpected-v2-measurement" }],
        };
      },
      error: /failed run retained Actions artifacts/u,
    },
    {
      name: "a V2 evidence release",
      change(fixture) {
        fixture.evidenceReleaseStatus = 200;
      },
      error: /evidence release or tag is no longer absent/u,
    },
    {
      name: "a V2 evidence tag",
      change(fixture) {
        fixture.evidenceTagRefStatus = 200;
      },
      error: /evidence release or tag is no longer absent/u,
    },
  ];

  for (const mutation of mutations) {
    const fixture = liveFixture();
    mutation.change(fixture);
    assert.throws(
      () => verifyNavigationCausalV2FailureLiveAuthority(fixture),
      mutation.error,
      mutation.name,
    );
  }
});

test("all 40 retained logs pass the existing public-source privacy scanner", () => {
  let inspected = 0;
  const result = inspectNavigationCausalV2FailureLogPrivacy(
    actionsLogsZipBytes,
    (value) => {
      inspected += 1;
      assertPostSupportPublicSourcePatchPrivacy(value);
    },
  );

  assert.equal(inspected, 40);
  assert.equal(result.entryCount, 40);
  assert.equal(result.entries.length, 40);
  assert.equal(new Set(result.entries.map(({ name }) => name)).size, 40);
});

function liveFixture() {
  const liveRecords = structuredClone(authorityBundle.records);
  delete liveRecords.preflightReceipt;
  return {
    authorityBundleBytes,
    actionsLogsZipBytes,
    liveRecords,
    v2ContractAssets,
    v2PreflightReceiptBytes,
    evidenceReleaseStatus: 404,
    evidenceTagRefStatus: 404,
  };
}

function readProtocolAsset(name) {
  return readFile(new URL(`../protocol/${name}`, import.meta.url));
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}
