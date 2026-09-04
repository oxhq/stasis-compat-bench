import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import AdmZip from "adm-zip";

import { jsonReplacer } from "../src/shared/io.mjs";
import {
  assertCrawlPhaseDiagnosticArtifactBindingReceipt,
  bindCrawlPhaseDiagnosticArtifacts,
  crawlPhaseDiagnosticArtifactBindingSchema,
  crawlPhaseDiagnosticComparisonInputVerificationSchema,
  crawlPhaseDiagnosticOutcomeSchema,
  crawlPhaseDiagnosticZipSafetyPolicy,
} from "../src/performance/crawl-phase-diagnostic-artifact-binding-v3.mjs";
import {
  crawlPhaseDiagnosticEvidenceProtocol,
  crawlPhaseDiagnosticEvidenceSchema,
} from "../src/performance/crawl-phase-diagnostic.mjs";
import {
  crawlPhaseDiagnosticVerificationSchema,
} from "../src/performance/crawl-phase-diagnostic-verification.mjs";
import {
  crawlPhaseDiagnosticComparisonEvidenceIdentity,
  crawlPhaseDiagnosticContractIdentity,
  crawlPhaseDiagnosticExpectedArtifactNames,
  crawlPhaseDiagnosticHarnessIdentity,
  crawlPhaseDiagnosticHostedIdentity,
  crawlPhaseDiagnosticHostedProvenanceSchema,
  crawlPhaseDiagnosticJobStepIdentity,
  crawlPhaseDiagnosticPublicationOutcomeAssetNames,
  crawlPhaseDiagnosticV1InvalidIdentity,
  crawlPhaseDiagnosticWorkflowSourceIdentity,
} from "../src/performance/crawl-phase-diagnostic-hosted-provenance-v3.mjs";
import {
  crawlPhaseDiagnosticV2UnpublishableContractAssetIdentity,
  crawlPhaseDiagnosticV2UnpublishableIdentity,
} from "../src/performance/crawl-phase-diagnostic-v2-unpublishable.mjs";
import {
  performanceReplicationArtifactBindingSchema,
} from "../src/performance/replication-artifact-binding.mjs";
import {
  performanceReplicationHostedIdentity,
} from "../src/performance/replication-hosted-provenance.mjs";
import {
  performanceReplicationPublicationAssetNames,
} from "../src/performance/replication-publication.mjs";

const runId = 33870000001;
const jobId = 101100000001;
const authorityBoot = "a".repeat(64);
const diagnosticBoot = "b".repeat(64);

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  return Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
}

function identity(bytes) {
  return { bytes: bytes.byteLength, sha256: hash(bytes) };
}

function zip(entries) {
  const archive = new AdmZip();
  for (const [name, bytes] of entries) archive.addFile(name, bytes);
  return archive.toBuffer();
}

function zipWithEntryMutation(entries, name, mutate) {
  const archive = new AdmZip();
  for (const [entryName, bytes] of entries) archive.addFile(entryName, bytes);
  const entry = archive.getEntry(name);
  assert.notEqual(entry, null);
  mutate(entry);
  return archive.toBuffer();
}

function outcome(outcomeClass = "VALID_NON_AUTHORITATIVE", phase = "complete") {
  const valid = outcomeClass === "VALID_NON_AUTHORITATIVE";
  const code = {
    input_verification: "INPUT_VERIFICATION_FAILED",
    diagnostic_execution: "DIAGNOSTIC_EXECUTION_FAILED",
    offline_verification: "OFFLINE_VERIFICATION_FAILED",
    hosted_infrastructure: "HOSTED_INFRASTRUCTURE_FAILED",
  }[phase];
  return {
    schema: crawlPhaseDiagnosticOutcomeSchema,
    status: valid ? "passed" : "failed",
    outcomeClass,
    phase,
    runAttempt: 1,
    evidenceArtifactEligible: valid,
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    failure: valid ? null : { code, messageOmitted: true },
  };
}

function validFixture() {
  const crawlee = {
    schema: "test-diagnostic",
    lane: "crawlee",
    job: { lane: "crawlee", ordinal: 1 },
    marker: "crawlee",
  };
  const stasis = {
    schema: "test-diagnostic",
    lane: "stasis",
    job: { lane: "stasis", ordinal: 2 },
    marker: "stasis",
  };
  const crawleeBytes = canonical(crawlee);
  const stasisBytes = canonical(stasis);
  const evidence = {
    schema: crawlPhaseDiagnosticEvidenceSchema,
    protocol: crawlPhaseDiagnosticEvidenceProtocol,
    track: "deterministic-crawl-20-page",
    purpose: "phase_localization_diagnostic_only",
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    authorityInput: {
      fileSha256: crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.freshCrawlRaw.sha256,
      fileBytes: crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.freshCrawlRaw.bytes,
      workflowProvenance: {
        runId: String(crawlPhaseDiagnosticHostedIdentity.comparison.runId),
        job: "ubuntu-crawl",
      },
      host: { bootInstanceDigest: authorityBoot },
    },
    diagnosticAttestation: {
      host: { bootInstanceDigest: diagnosticBoot },
      provenance: {
        provider: "github-actions",
        repository: crawlPhaseDiagnosticHostedIdentity.repository,
        workflow: crawlPhaseDiagnosticHostedIdentity.workflow.name,
        job: crawlPhaseDiagnosticHostedIdentity.job.id,
        runId: String(runId),
        runAttempt: "1",
        workflowSourceSha: crawlPhaseDiagnosticWorkflowSourceIdentity.commitSha,
        workflowSourceRef: crawlPhaseDiagnosticHostedIdentity.headRef,
      },
    },
    hostRelation: {
      bootInstance: "distinct",
      timingCombinedAcrossHosts: false,
    },
    order: ["crawlee", "stasis"],
    observations: { crawlee, stasis },
    localization: {
      authorityTimingReadOrCombined: false,
      crossHostPooling: "none",
      phaseSumsAreBenchmarkSamples: false,
      phaseSumsAuthorizeOptimization: false,
    },
  };
  const evidenceBytes = canonical(evidence);
  const semantic = semanticReceipt({ crawleeBytes, stasisBytes, evidenceBytes });
  const comparisonInput = comparisonInputReceipt();
  const evidenceEntries = new Map([
    ["comparison-input-verification.json", canonical(comparisonInput)],
    ["crawl-phase-crawlee-raw.json", crawleeBytes],
    ["crawl-phase-stasis-raw.json", stasisBytes],
    ["crawl-phase-localization-evidence.json", evidenceBytes],
    ["diagnostic-verification.json", canonical(semantic)],
  ]);
  const validOutcome = outcome();
  const bundleEntries = new Map([
    ...evidenceEntries,
    ["diagnostic-outcome.json", canonical(validOutcome)],
  ]);
  const archives = {
    [crawlPhaseDiagnosticExpectedArtifactNames[0]]: zip([...bundleEntries]),
  };
  return {
    semanticReceipt: semantic,
    hostedReceipt: hostedReceipt("bundle_valid", archives),
    artifactZipBytes: archives,
    derivedOutcome: null,
    values: {
      crawlee, stasis, evidence, comparisonInput, evidenceEntries, bundleEntries,
      outcome: validOutcome,
    },
  };
}

function semanticReceipt({ crawleeBytes, stasisBytes, evidenceBytes }) {
  const authorityIdentity = {
    bytes: crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.freshCrawlRaw.bytes,
    sha256: crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.freshCrawlRaw.sha256,
  };
  const bindingIdentity = {
    bytes: crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.artifactBinding.bytes,
    sha256: crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.artifactBinding.sha256,
  };
  return {
    schema: crawlPhaseDiagnosticVerificationSchema,
    status: "passed",
    purpose: "offline_phase_diagnostic_verification_only",
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    diagnosticSet: {
      order: ["crawlee", "stasis"],
      expectedInputFileNames: [
        "crawl-phase-crawlee-raw.json",
        "crawl-phase-stasis-raw.json",
        "crawl-phase-localization-evidence.json",
      ],
      composedEvidenceSchema: crawlPhaseDiagnosticEvidenceSchema,
      authorityRawSchema: "stasis-v0.3.3-performance-crawl-raw-v1",
      artifactBindingSchema: performanceReplicationArtifactBindingSchema,
      observationBindings: {
        crawlee: {
          standaloneSha256: hash(crawleeBytes),
          composedObservationCanonicalSha256: hash(crawleeBytes),
        },
        stasis: {
          standaloneSha256: hash(stasisBytes),
          composedObservationCanonicalSha256: hash(stasisBytes),
        },
      },
    },
    authorityReplay: {
      mode: "offline_single_immutable_authority_input",
      inputSha256: authorityIdentity.sha256,
      inputBytes: authorityIdentity.bytes,
      exactBytesUsedForBeforeAndAfterReplay: true,
      temporalBeforeAfterReadsReenacted: false,
    },
    verification: {
      standaloneCrawleeRawValid: true,
      standaloneStasisRawValid: true,
      laneAndOrderExact: true,
      standaloneValuesMatchComposedEvidence: true,
      standaloneCanonicalBytesMatchComposedObservations: true,
      composedEvidenceReplayedExactly: true,
      freshAuthorityBoundThroughArtifactReceipt: true,
      authorityBytesStableDuringOfflineRead: true,
      authorityBytesReusedForOfflineBeforeAfterReplay: true,
      temporalBeforeAfterReadsReenacted: false,
      timingAuthorityGranted: false,
      comparisonAuthorityGranted: false,
      optimizationAuthorityGranted: false,
    },
    fileBoundary: {
      exactThreeFileDiagnosticInventoryBeforeOutput: true,
      eachInputJsonReadExactlyOnce: true,
      canonicalJsonVerified: true,
      allInputAndOutputPathsAbsoluteAndDistinct: true,
      allInputsRealStableRegularFiles: true,
      symlinksRejected: true,
      fileIdentityCollisionsRejected: true,
      outputInitiallyAbsent: true,
      outputCreation: "fsynced_sibling_temp_no_clobber_link",
      inputs: {
        crawleeRaw: identity(crawleeBytes),
        stasisRaw: identity(stasisBytes),
        composedEvidence: identity(evidenceBytes),
        freshAuthorityRaw: authorityIdentity,
        artifactBindingReceipt: bindingIdentity,
      },
    },
  };
}

function comparisonInputReceipt() {
  const expected = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  const releaseUrl = `https://api.github.com/repos/${expected.repository}/releases/${expected.releaseId}`;
  const webUrl = `https://github.com/${expected.repository}/releases/tag/${expected.tag}`;
  const asset = (identityValue) => ({
    assetId: identityValue.id,
    name: identityValue.name,
    bytes: identityValue.bytes,
    sha256: identityValue.sha256,
    browserDownloadUrl:
      `https://github.com/${expected.repository}/releases/download/${expected.tag}/${identityValue.name}`,
  });
  return {
    schema: crawlPhaseDiagnosticComparisonInputVerificationSchema,
    status: "passed",
    mode: "anonymous_https",
    retries: false,
    credentialsUsed: false,
    comparisonEvidenceRelease: {
      repository: expected.repository,
      releaseId: expected.releaseId,
      tag: expected.tag,
      targetCommitish: expected.targetCommitSha,
      apiUrl: releaseUrl,
      webUrl,
      createdAt: "2026-09-04T11:36:56Z",
      publishedAt: "2026-09-04T11:37:42Z",
      immutable: true,
      draft: false,
      prerelease: false,
      assetNames: [...performanceReplicationPublicationAssetNames],
      tagReference: {
        ref: `refs/tags/${expected.tag}`,
        apiUrl: `https://api.github.com/repos/${expected.repository}/git/refs/tags/${expected.tag}`,
        objectType: "commit",
        objectSha: expected.targetCommitSha,
        objectUrl: `https://api.github.com/repos/${expected.repository}/git/commits/${expected.targetCommitSha}`,
      },
    },
    inputs: {
      freshCrawlRaw: asset(expected.assets.freshCrawlRaw),
      artifactBinding: asset(expected.assets.artifactBinding),
    },
    verification: {
      releaseMetadataExact: true,
      releaseChronologyExact: true,
      exactTwentyEightNameAssetInventory: true,
      lightweightTagReferenceExact: true,
      selectedAssetMetadataExact: true,
      anonymousDownloads: true,
      downloadedBytesExact: true,
      downloadedSha256Exact: true,
      canonicalJsonExact: true,
    },
  };
}

function hostedReceipt(mode, archives = {}) {
  const success = mode === "bundle_valid";
  const outcomeClass = {
    bundle_valid: "VALID_NON_AUTHORITATIVE",
    bundle_status: "DIAGNOSTIC_INVALID_WITH_STATUS",
    no_artifact: "INFRASTRUCTURE_INVALID_NO_ARTIFACT",
  }[mode];
  const artifactNames = mode === "no_artifact" ? [] : crawlPhaseDiagnosticExpectedArtifactNames;
  return {
    schema: crawlPhaseDiagnosticHostedProvenanceSchema,
    status: "passed",
    outcomeClass,
    artifactMode: mode,
    producer: {
      repository: crawlPhaseDiagnosticHostedIdentity.repository,
      repositoryId: 1342978708,
      workflowId: 400000001,
      workflowName: crawlPhaseDiagnosticHostedIdentity.workflow.name,
      workflowPath: crawlPhaseDiagnosticHostedIdentity.workflow.path,
      event: "push",
      headBranch: crawlPhaseDiagnosticHostedIdentity.headBranch,
      headSha: crawlPhaseDiagnosticWorkflowSourceIdentity.commitSha,
      runId,
      runAttempt: 1,
      status: "completed",
      conclusion: success ? "success" : "failure",
      createdAt: "2026-09-04T13:00:00Z",
      runStartedAt: "2026-09-04T13:01:00Z",
      completedAt: "2026-09-04T13:10:00Z",
    },
    oneShot: {
      completeListing: true,
      enumeratedRunCount: 1,
      invocationCount: 1,
      rerunCount: 0,
      selectedRunId: runId,
    },
    comparisonEvidence: {
      repository: crawlPhaseDiagnosticComparisonEvidenceIdentity.repository,
      releaseId: crawlPhaseDiagnosticComparisonEvidenceIdentity.releaseId,
      tag: crawlPhaseDiagnosticComparisonEvidenceIdentity.tag,
      immutable: true,
      draft: false,
      prerelease: false,
      publishedAt: "2026-09-04T11:37:42Z",
      targetCommitSha: crawlPhaseDiagnosticComparisonEvidenceIdentity.targetCommitSha,
      targetTreeSha: crawlPhaseDiagnosticComparisonEvidenceIdentity.targetTreeSha,
      selectedAssets: {
        artifactBinding: selectedAsset("artifactBinding"),
        freshCrawlRaw: selectedAsset("freshCrawlRaw"),
      },
    },
    diagnosticHarness: structuredClone(crawlPhaseDiagnosticHarnessIdentity),
    invalidV1Motivation: structuredClone(crawlPhaseDiagnosticV1InvalidIdentity),
    unpublishableV2Motivation: v2UnpublishableReference(),
    contract: {
      repository: crawlPhaseDiagnosticContractIdentity.repository,
      tag: crawlPhaseDiagnosticContractIdentity.tag,
      releaseId: 382700001,
      immutable: true,
      draft: false,
      prerelease: false,
      publishedAt: "2026-09-04T12:00:00Z",
      targetCommitSha: "d".repeat(40),
      soleParentSha: crawlPhaseDiagnosticContractIdentity.soleParentSha,
      treeSha: "e".repeat(40),
      assets: Object.values(crawlPhaseDiagnosticContractIdentity.assets).sort().map(
        (name, index) => ({
          name,
          path: `protocol/${name}`,
          blobSha: String(index + 1).repeat(40),
          id: 600000001 + index,
          sizeInBytes: 100 + index,
          digest: `sha256:${String(index + 1).repeat(64)}`,
        }),
      ),
      preflightSha256: "f".repeat(64),
    },
    workflowSource: {
      repository: crawlPhaseDiagnosticHostedIdentity.repository,
      branch: crawlPhaseDiagnosticHostedIdentity.headBranch,
      ref: crawlPhaseDiagnosticHostedIdentity.headRef,
      commitSha: crawlPhaseDiagnosticWorkflowSourceIdentity.commitSha,
      soleParentSha: crawlPhaseDiagnosticWorkflowSourceIdentity.parentCommitSha,
      treeSha: crawlPhaseDiagnosticWorkflowSourceIdentity.treeSha,
      changedFile: { status: "added", path: crawlPhaseDiagnosticHostedIdentity.workflow.path },
      workflow: {
        path: crawlPhaseDiagnosticHostedIdentity.workflow.path,
        blobSha: "c".repeat(40),
        bytes: 100,
        sha256: "d".repeat(64),
        name: crawlPhaseDiagnosticHostedIdentity.workflow.name,
        jobId: crawlPhaseDiagnosticHostedIdentity.job.id,
        jobName: crawlPhaseDiagnosticHostedIdentity.job.name,
      },
      preservedComparisonWorkflow: {
        path: performanceReplicationHostedIdentity.workflow.path,
        blobSha: "e31601363f2506df87f05a585f8adb0c790c5481",
      },
      preservedV1DiagnosticWorkflow: {
        path: ".github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic.yml",
        blobSha: "61675d581be0f8d40accadef531ff1a7c71deb76",
      },
      preservedV2DiagnosticWorkflow: structuredClone(
        crawlPhaseDiagnosticWorkflowSourceIdentity.preservedV2DiagnosticWorkflow,
      ),
    },
    execution: {
      event: "push",
      runAttempt: 1,
      runnerLabels: ["ubuntu-22.04"],
      runnerOs: "Linux",
      runnerArch: "X64",
      nodeVersion: "22.20.0",
      comparisonRunId: crawlPhaseDiagnosticHostedIdentity.comparison.runId,
      comparisonCrawlJobId: crawlPhaseDiagnosticHostedIdentity.comparison.crawlJobId,
      order: ["crawlee", "stasis"],
      warmups: 0,
      retries: false,
      sleeps: false,
      fallbacks: false,
      discardedObservations: false,
      statistics: false,
      pooling: "none",
    },
    job: {
      id: jobId,
      key: crawlPhaseDiagnosticHostedIdentity.job.id,
      name: crawlPhaseDiagnosticHostedIdentity.job.name,
      labels: ["ubuntu-22.04"],
      status: "completed",
      conclusion: success ? "success" : "failure",
      startedAt: "2026-09-04T13:01:30Z",
      completedAt: "2026-09-04T13:09:30Z",
      steps: hostedJobSteps(mode),
    },
    artifacts: artifactNames.map((name, index) => {
      const bytes = archives[name];
      return {
        name,
        id: 500000001 + index,
        sizeInBytes: bytes.byteLength,
        digest: `sha256:${hash(bytes)}`,
      };
    }),
    publicationOutcomes: structuredClone(crawlPhaseDiagnosticPublicationOutcomeAssetNames),
    claimBoundary: {
      authorityEligible: false,
      timingEligible: false,
      statisticsEligible: false,
      comparisonEligible: false,
      optimizationEligible: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
    verification: {
      exactPreregisteredRunIdentity: true,
      completeWorkflowRunsListing: true,
      exactlyOneInvocationAndNoRerun: true,
      firstAttemptOnly: true,
      immutableComparisonEvidencePredatesContract: true,
      immutableContractPredatesRun: true,
      contractCommitHasSoleHarnessParent: true,
      harnessIsExactChildOfPublicVerifierErratum: true,
      invalidV1PublicEvidenceFrozenBeforeObservation: true,
      invalidV2ObservationFrozenWithoutTimingReuse: true,
      sourceCommitHasSoleV2SourceParent: true,
      workflowMirrorMatchesSourceBlob: true,
      v2DiagnosticWorkflowBlobPreserved: true,
      comparisonWorkflowBlobPreserved: true,
      contractAssetBlobsMatchCommit: true,
      exactlyOneNativeUbuntuJob: true,
      comparisonRunAndJobIdsRejected: true,
      artifactSetMatchesTerminalOutcome: true,
      expiredArtifactsRejected: true,
      retriesRejected: true,
      sleepsRejected: true,
      fallbacksRejected: true,
      discardedObservationsRejected: true,
      statisticsAndPoolingRejected: true,
      urlsRetained: false,
    },
  };
}

function v2UnpublishableReference() {
  return {
    schema: crawlPhaseDiagnosticV2UnpublishableIdentity.schema,
    status: crawlPhaseDiagnosticV2UnpublishableIdentity.status,
    reasonCode: crawlPhaseDiagnosticV2UnpublishableIdentity.reasonCode,
    contractAssetName: crawlPhaseDiagnosticV2UnpublishableContractAssetIdentity.name,
    contractAssetBytes: crawlPhaseDiagnosticV2UnpublishableContractAssetIdentity.bytes,
    contractAssetSha256: crawlPhaseDiagnosticV2UnpublishableContractAssetIdentity.sha256,
    rawTimingImportedIntoV3ContractOrVerifier: false,
    v2EvidenceReleaseAuthorized: false,
    v2RerunAuthorized: false,
    replacementProtocol:
      crawlPhaseDiagnosticV2UnpublishableIdentity.exclusion.replacementProtocol,
  };
}

function hostedJobSteps(mode) {
  const identity = crawlPhaseDiagnosticJobStepIdentity;
  const preparation = identity.preparation.map((step) => ({ ...step, conclusion: "success" }));
  if (mode === "bundle_status") {
    const failureIndex = 15;
    preparation.forEach((step, index) => {
      step.conclusion = index < failureIndex ? "success" : index === failureIndex ? "failure" : "skipped";
    });
  }
  const tail = {
    bundle_valid: ["success", "success", "success", "skipped"],
    bundle_status: ["success", "success", "success", "failure"],
    no_artifact: ["success", "success", "failure", "failure"],
  }[mode];
  assert.notEqual(tail, undefined);
  const specifications = [
    { ...identity.setup, conclusion: "success" },
    ...preparation,
    { ...identity.createOutcome, conclusion: tail[0] },
    { ...identity.sealBundle, conclusion: tail[1] },
    { ...identity.uploadBundle, conclusion: tail[2] },
    { ...identity.propagate, conclusion: tail[3] },
    { ...identity.postSetupNode, conclusion: mode === "bundle_valid" ? "success" : "skipped" },
    { ...identity.postCheckout, conclusion: "success" },
    { ...identity.complete, conclusion: "success" },
  ];
  const origin = Date.parse("2026-09-04T13:01:30Z");
  return specifications.map((step, index) => ({
    number: step.number,
    name: step.name,
    status: "completed",
    conclusion: step.conclusion,
    startedAt: new Date(origin + index * 1_000).toISOString().replace(".000Z", "Z"),
    completedAt: new Date(origin + (index + 1) * 1_000).toISOString().replace(".000Z", "Z"),
  }));
}

function setStatusPreparationFailure(hosted, failureIndex) {
  const preparation = crawlPhaseDiagnosticJobStepIdentity.preparation;
  for (let index = 0; index < preparation.length; index += 1) {
    const step = hosted.job.steps.find(({ number }) => number === preparation[index].number);
    step.conclusion = index < failureIndex
      ? "success"
      : index === failureIndex ? "failure" : "skipped";
  }
}

function selectedAsset(key) {
  const value = crawlPhaseDiagnosticComparisonEvidenceIdentity.assets[key];
  return { name: value.name, id: value.id, sizeInBytes: value.bytes, digest: `sha256:${value.sha256}` };
}

test("valid V3 bundle accepts the exact H4 V1 semantic receipt and rejects an invented V3 schema", () => {
  const fixture = validFixture();
  assert.equal(
    fixture.semanticReceipt.schema,
    "stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-v1",
  );
  const receipt = bindCrawlPhaseDiagnosticArtifacts(fixture);
  assert.equal(receipt.schema, crawlPhaseDiagnosticArtifactBindingSchema);
  assert.equal(receipt.outcomeClass, "VALID_NON_AUTHORITATIVE");
  assert.equal(receipt.artifactArchives.length, 1);
  assert.equal(receipt.extractedFiles.evidence.length, 5);
  assert.deepEqual(receipt.hostSeparation, {
    runDistinct: true,
    jobDistinct: true,
    bootInstanceDistinct: true,
  });
  assert.equal(receipt.verification.semanticEvidence, "verified");
  assert.equal(receipt.timingEligible, false);
  assert.equal(receipt.optimizationEligible, false);
  assert.equal(/https?:\/\//u.test(JSON.stringify(receipt)), false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(assertCrawlPhaseDiagnosticArtifactBindingReceipt(receipt), receipt);

  const inventedV3Semantic = validFixture();
  inventedV3Semantic.semanticReceipt.schema =
    "stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-v3";
  rebuildBundle(inventedV3Semantic);
  assert.throws(
    () => bindCrawlPhaseDiagnosticArtifacts(inventedV3Semantic),
    /Diagnostic verification receipt|semantic/u,
  );
});

test("binder closes over outcome-only bundle and publisher-derived no-artifact outcomes", () => {
  const invalidOutcome = outcome("DIAGNOSTIC_INVALID_WITH_STATUS", "diagnostic_execution");
  const statusArchive = zip([["diagnostic-outcome.json", canonical(invalidOutcome)]]);
  const archives = { [crawlPhaseDiagnosticExpectedArtifactNames[0]]: statusArchive };
  const invalid = bindCrawlPhaseDiagnosticArtifacts({
    semanticReceipt: null,
    hostedReceipt: hostedReceipt("bundle_status", archives),
    artifactZipBytes: archives,
  });
  assert.equal(invalid.outcome.failure.code, "DIAGNOSTIC_EXECUTION_FAILED");
  assert.equal(invalid.verification.outcomeSource, "actions_bundle_zip");
  assert.equal(invalid.extractedFiles.evidence, null);

  const infrastructure = bindCrawlPhaseDiagnosticArtifacts({
    hostedReceipt: hostedReceipt("no_artifact"),
    artifactZipBytes: {},
    derivedOutcome: outcome("INFRASTRUCTURE_INVALID_NO_ARTIFACT", "hosted_infrastructure"),
  });
  assert.equal(infrastructure.artifactArchives.length, 0);
  assert.equal(infrastructure.extractedFiles, null);
  assert.equal(infrastructure.verification.outcomeSource, "publisher_derived_terminal_api");
  assert.equal(infrastructure.verification.parsedInventoriesExactAndSafe, "not_applicable");
});

test("status bundles bind phase and code to the first failed hosted preparation group", () => {
  const groups = [
    { failureIndex: 14, phase: "input_verification", substitute: "diagnostic_execution" },
    { failureIndex: 15, phase: "diagnostic_execution", substitute: "offline_verification" },
    { failureIndex: 16, phase: "offline_verification", substitute: "input_verification" },
    { failureIndex: 17, phase: "offline_verification", substitute: "diagnostic_execution" },
  ];
  for (const { failureIndex, phase, substitute } of groups) {
    const expectedOutcome = outcome("DIAGNOSTIC_INVALID_WITH_STATUS", phase);
    const expectedArchive = zip([["diagnostic-outcome.json", canonical(expectedOutcome)]]);
    const expectedArchives = {
      [crawlPhaseDiagnosticExpectedArtifactNames[0]]: expectedArchive,
    };
    const hosted = hostedReceipt("bundle_status", expectedArchives);
    setStatusPreparationFailure(hosted, failureIndex);
    const receipt = bindCrawlPhaseDiagnosticArtifacts({
      semanticReceipt: null,
      hostedReceipt: hosted,
      artifactZipBytes: expectedArchives,
    });
    assert.equal(receipt.outcome.phase, phase);

    const substitutedOutcome = outcome("DIAGNOSTIC_INVALID_WITH_STATUS", substitute);
    const substitutedArchive = zip([
      ["diagnostic-outcome.json", canonical(substitutedOutcome)],
    ]);
    const substitutedArchives = {
      [crawlPhaseDiagnosticExpectedArtifactNames[0]]: substitutedArchive,
    };
    const substitutedHosted = hostedReceipt("bundle_status", substitutedArchives);
    setStatusPreparationFailure(substitutedHosted, failureIndex);
    assert.throws(
      () => bindCrawlPhaseDiagnosticArtifacts({
        semanticReceipt: null,
        hostedReceipt: substitutedHosted,
        artifactZipBytes: substitutedArchives,
      }),
      /phase does not match the first failed hosted step/u,
    );
  }
});

test("binder rejects ZIP digest, inventory, paths, directories, duplicates, bombs, and noncanonical JSON", async (context) => {
  const cases = [
    ["digest", (fixture) => {
      const bytes = Buffer.from(fixture.artifactZipBytes[crawlPhaseDiagnosticExpectedArtifactNames[0]]);
      bytes[bytes.length - 1] ^= 1;
      fixture.artifactZipBytes[crawlPhaseDiagnosticExpectedArtifactNames[0]] = bytes;
    }, /differs from hosted metadata/u],
    ["extra", (fixture) => replaceBundleZip(fixture, zip([
      ...fixture.values.bundleEntries,
      ["extra.json", canonical({ extra: true })],
    ])), /inventory is not exact/u],
    ["directory", (fixture) => replaceBundleZip(fixture, zip([
      ...[...fixture.values.bundleEntries].filter(([name]) => name !== "diagnostic-outcome.json"),
      ["diagnostic-outcome.json/", canonical(outcome())],
    ])), /unsafe entry|inventory/u],
    ["traversal", (fixture) => {
      const ordinary = zip([
        ...[...fixture.values.bundleEntries].filter(([name]) => name !== "diagnostic-outcome.json"),
        ["xx/diagnostic-outcome.json", canonical(outcome())],
      ]);
      replaceBundleZip(fixture,
        replaceBytes(ordinary, "xx/diagnostic-outcome.json", "../diagnostic-outcome.json"));
    }, /unsafe entry/u],
    ["backslash path", (fixture) => replaceBundleZip(fixture, replaceBytes(
      zip([...fixture.values.bundleEntries]),
      "diagnostic-outcome.json",
      "diagnostic\\outcome.json",
    )), /unsafe entry/u],
    ["symlink", (fixture) => replaceBundleZip(fixture, zipWithEntryMutation(
      [...fixture.values.bundleEntries],
      "diagnostic-outcome.json",
      (entry) => { entry.attr = (0o120777 << 16) >>> 0; },
    )), /unsafe entry/u],
    ["encrypted flag", (fixture) => replaceBundleZip(fixture, zipWithEntryMutation(
      [...fixture.values.bundleEntries],
      "diagnostic-outcome.json",
      (entry) => { entry.header.flags |= 0x1; },
    )), /unsafe entry/u],
    ["unsupported compression", (fixture) => replaceBundleZip(fixture, zipWithEntryMutation(
      [...fixture.values.bundleEntries],
      "diagnostic-outcome.json",
      (entry) => { entry.header.method = 99; },
    )), /unsafe entry/u],
    ["duplicate", (fixture) => {
      const ordinary = zip([
        ...fixture.values.bundleEntries,
        ["xxxxxxxxxx-outcome.json", canonical(outcome())],
      ]);
      replaceBundleZip(fixture,
        replaceBytes(ordinary, "xxxxxxxxxx-outcome.json", "diagnostic-outcome.json"));
    }, /inventory is not exact|duplicate entry/u],
    ["oversized", (fixture) => replaceBundleZip(fixture, zip([
      ...[...fixture.values.bundleEntries].filter(([name]) => name !== "diagnostic-outcome.json"),
      ["diagnostic-outcome.json",
        Buffer.alloc(crawlPhaseDiagnosticZipSafetyPolicy.maximumEntryBytes + 1, 0x20)],
    ])),
    /entry size is unsafe|expands beyond/u],
    ["noncanonical", (fixture) => replaceBundleZip(fixture, zip([
      ...[...fixture.values.bundleEntries].filter(([name]) => name !== "diagnostic-outcome.json"),
      ["diagnostic-outcome.json", Buffer.from(JSON.stringify(outcome()), "utf8")],
    ])),
    /not canonical pretty JSON/u],
  ];
  for (const [name, mutate, pattern] of cases) {
    await context.test(name, () => {
      const fixture = validFixture();
      mutate(fixture);
      assert.throws(() => bindCrawlPhaseDiagnosticArtifacts(fixture), pattern);
    });
  }
});

test("binder rejects outcome escalation, evidence mismatch, comparison drift, and same boot", async (context) => {
  const cases = [
    ["outcome class", (fixture) => {
      fixture.values.outcome = outcome("DIAGNOSTIC_INVALID_WITH_STATUS", "offline_verification");
      rebuildBundle(fixture);
    }, /fail-closed boundary|expected/u],
    ["timing authority", (fixture) => {
      const changed = outcome(); changed.timingEligible = true;
      fixture.values.outcome = changed;
      rebuildBundle(fixture);
    }, /fail-closed boundary/u],
    ["semantic raw hash", (fixture) => {
      fixture.semanticReceipt.fileBoundary.inputs.crawleeRaw.sha256 = "f".repeat(64);
      rebuildBundle(fixture);
    }, /identities are not cross-bound|semantic file boundary/u],
    ["comparison asset", (fixture) => {
      fixture.values.comparisonInput.inputs.freshCrawlRaw.sha256 = "f".repeat(64);
      rebuildBundle(fixture);
    }, /not cross-bound/u],
    ["same boot", (fixture) => {
      fixture.values.evidence.diagnosticAttestation.host.bootInstanceDigest = authorityBoot;
      fixture.semanticReceipt.fileBoundary.inputs.composedEvidence = identity(
        canonical(fixture.values.evidence),
      );
      rebuildBundle(fixture);
    }, /distinct hosted run\/job\/VM/u],
    ["observation drift", (fixture) => {
      fixture.values.evidence.observations.crawlee.marker = "changed";
      fixture.semanticReceipt.fileBoundary.inputs.composedEvidence = identity(
        canonical(fixture.values.evidence),
      );
      rebuildBundle(fixture);
    }, /non-authoritative boundary/u],
  ];
  for (const [name, mutate, pattern] of cases) {
    await context.test(name, () => {
      const fixture = validFixture();
      mutate(fixture);
      assert.throws(() => bindCrawlPhaseDiagnosticArtifacts(fixture), pattern);
    });
  }
});

test("H4 V1 semantic evidence is required only for the valid V3 bundle", () => {
  const valid = validFixture();
  assert.throws(
    () => bindCrawlPhaseDiagnosticArtifacts({ ...valid, semanticReceipt: null }),
    /requires its semantic/u,
  );
  assert.throws(
    () => bindCrawlPhaseDiagnosticArtifacts({ ...valid, derivedOutcome: outcome() }),
    /forbids a publisher-derived/u,
  );

  const invalidOutcome = outcome("DIAGNOSTIC_INVALID_WITH_STATUS", "diagnostic_execution");
  const bytes = zip([["diagnostic-outcome.json", canonical(invalidOutcome)]]);
  const archives = { [crawlPhaseDiagnosticExpectedArtifactNames[0]]: bytes };
  assert.throws(
    () => bindCrawlPhaseDiagnosticArtifacts({
      semanticReceipt: valid.semanticReceipt,
      hostedReceipt: hostedReceipt("bundle_status", archives),
      artifactZipBytes: archives,
    }),
    /must not borrow/u,
  );
  assert.throws(
    () => bindCrawlPhaseDiagnosticArtifacts({
      hostedReceipt: hostedReceipt("no_artifact"), artifactZipBytes: {},
    }),
    /require only one publisher-derived/u,
  );
});

test("strict binding receipt rejects retry, raw content, URLs, and eligibility mutation", async (context) => {
  const receipt = bindCrawlPhaseDiagnosticArtifacts(validFixture());
  const cases = [
    ["retry", (value) => { value.retryAuthorized = true; }],
    ["optimization", (value) => { value.optimizationEligible = true; }],
    ["raw", (value) => { value.raw = { secret: "retained" }; }],
    ["URL", (value) => { value.inputs.source = "https://example.test"; }],
    ["mode", (value) => { value.artifactMode = "status_only"; }],
  ];
  for (const [name, mutate] of cases) {
    await context.test(name, () => {
      const changed = structuredClone(receipt);
      mutate(changed);
      assert.throws(() => assertCrawlPhaseDiagnosticArtifactBindingReceipt(changed));
    });
  }
});

function replaceBundleZip(fixture, bytes) {
  const name = crawlPhaseDiagnosticExpectedArtifactNames[0];
  fixture.artifactZipBytes[name] = bytes;
  fixture.hostedReceipt.artifacts[0].sizeInBytes = bytes.byteLength;
  fixture.hostedReceipt.artifacts[0].digest = `sha256:${hash(bytes)}`;
}

function rebuildBundle(fixture) {
  const entries = fixture.values.evidenceEntries;
  entries.set("comparison-input-verification.json", canonical(fixture.values.comparisonInput));
  entries.set("crawl-phase-localization-evidence.json", canonical(fixture.values.evidence));
  entries.set("diagnostic-verification.json", canonical(fixture.semanticReceipt));
  fixture.values.bundleEntries = new Map([
    ...entries,
    ["diagnostic-outcome.json", canonical(fixture.values.outcome)],
  ]);
  replaceBundleZip(fixture, zip([...fixture.values.bundleEntries]));
}

function replaceBytes(bytes, from, to) {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to));
  const changed = Buffer.from(bytes);
  const needle = Buffer.from(from);
  const replacement = Buffer.from(to);
  let offset = 0;
  let matches = 0;
  for (;;) {
    const index = changed.indexOf(needle, offset);
    if (index < 0) break;
    replacement.copy(changed, index);
    offset = index + replacement.length;
    matches += 1;
  }
  assert.equal(matches >= 2, true);
  return changed;
}
