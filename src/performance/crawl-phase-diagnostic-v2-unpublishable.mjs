import { isDeepStrictEqual } from "node:util";

import {
  assertCrawlPhaseDiagnosticJobStepTopology as assertV2JobStepTopology,
} from "./crawl-phase-diagnostic-hosted-provenance-v2.mjs";

export const crawlPhaseDiagnosticV2UnpublishableSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable-v1";
export const crawlPhaseDiagnosticV2UnpublishableVerificationSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable-verification-v3";
export const crawlPhaseDiagnosticV2UnpublishableContractAssetIdentity = deepFreeze({
  name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable.json",
  bytes: 4715,
  sha256: "e4c05eb998ba8101d14b1307db587c09a1acc1649a4589460a6a9e788a7f5e23",
});

export const crawlPhaseDiagnosticV2UnpublishableIdentity = deepFreeze({
  schema: crawlPhaseDiagnosticV2UnpublishableSchema,
  status: "unpublishable",
  reasonCode: "HOSTED_POST_STEP_ORDINAL_CONTRACT_DEFECT",
  v2Contract: {
    repository: "oxhq/stasis-compat-bench",
    commitSha: "54a08f2f63718658a2ed60309eba94c9a00efbc3",
    parentCommitSha: "58742c0f35939558b334eeb792cbf17ae8ab3426",
    treeSha: "f4d02631892cee126970a3fa3485aef37f1aee35",
    tag: "stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v2",
    releaseId: 382863604,
    createdAt: "2026-09-04T16:07:49Z",
    publishedAt: "2026-09-04T16:12:51Z",
    immutable: true,
    assets: [
      {
        id: 544579433,
        name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-preflight.json",
        bytes: 9825,
        sha256: "19e7546167ffa4155f8112241b0c573e8d79e6ac6251561154a5f670981eade2",
      },
      {
        id: 544579435,
        name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-workflow.yml",
        bytes: 63031,
        sha256: "43d4dee4df84277b99cb680056705b8ed77d2e6cb5de6c37a6f6cba34a8cdc91",
      },
      {
        id: 544579432,
        name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v2.md",
        bytes: 12602,
        sha256: "5ce74846500a0c273ec1761e37e9dc920c0fa55fe240bf57eba890b6f2ea0914",
      },
    ],
  },
  workflowSource: {
    repository: "oxhq/stasis",
    branch: "codex/stasis-v033-crawl-phase-diagnostic-v2",
    commitSha: "6dbe0cafd261e7a171c84929233bb9131b9d4b3e",
    parentCommitSha: "6c142d18631b910ab9e7ce842b52ed817b46ecc5",
    treeSha: "f7fc355e14eab45e74710521d7e13b16d4b4a922",
    workflowPath: ".github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v2.yml",
    workflowBlobSha: "0de4bb7e6d7f623ccf38633991f999e1dc38bc45",
  },
  hostedObservation: {
    runId: 33893969529,
    runAttempt: 1,
    jobId: 101092105779,
    createdAt: "2026-09-04T16:13:58Z",
    runStartedAt: "2026-09-04T16:13:58Z",
    completedAt: "2026-09-04T16:15:23Z",
    conclusion: "success",
    invocationCount: 1,
    rerunCount: 0,
    artifact: {
      id: 9945005103,
      name: "stasis-v0.3.3-crawl-phase-diagnostic-v2-bundle-attempt-1",
      bytes: 24466,
      sha256: "388572d4e90a6d6aa30ec208cb4d34e0f1ce2d5dba30b246a61488c54653675c",
      unexpiredAtFreeze: true,
    },
    coreStepCount: 23,
    lastCoreStepNumber: 23,
    observedPostSteps: [
      { number: 45, name: "Post Set up exact Node 22.20.0 x64" },
      { number: 46, name: "Post Check out the exact diagnostic harness" },
      { number: 47, name: "Complete job" },
    ],
    v2VerifierFrozenPostSteps: [
      { number: 44, name: "Post Set up exact Node 22.20.0 x64" },
      { number: 45, name: "Post Check out the exact diagnostic harness" },
      { number: 46, name: "Complete job" },
    ],
    v2VerifierError: "Diagnostic hosted job step topology changed",
  },
  captureManifest: [
    { name: "workflow-run.json", bytes: 12689, sha256: "715d1a635c78e76ae3d2bee09abf60446a9d4ce01d483cca8aa5a162dda151ee" },
    { name: "workflow-runs.json", bytes: 13630, sha256: "7450250c3064b849e86ad8ad5a1d306b83f5dcf40ef499547819448b428d7c79" },
    { name: "workflow-jobs.json", bytes: 8322, sha256: "aee7ab5e447b1d29e693aa87a1df8293f8ac2076c7fbba3a7aaaf4dcdba80334" },
    { name: "workflow-artifacts.json", bytes: 945, sha256: "5063a43b9ace1bcebcb3b41fc22f6274b70248c8558146d874244b705b9ae570" },
    { name: "actions-diagnostic-bundle.zip", bytes: 24466, sha256: "388572d4e90a6d6aa30ec208cb4d34e0f1ce2d5dba30b246a61488c54653675c" },
  ],
  exclusion: {
    artifactPayloadConsumedByMotivationVerifier: false,
    rawTimingImportedIntoV3ContractOrVerifier: false,
    diagnosticOutcomeImportedIntoV3ContractOrVerifier: false,
    comparisonValueImportedIntoV3ContractOrVerifier: false,
    v2EvidenceReleaseAuthorized: false,
    v2RerunAuthorized: false,
    postHocVerifierRepairAuthorized: false,
    replacementProtocol: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v3",
  },
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
});

const coreStepNames = Object.freeze([
  "Set up job",
  "Validate the one-shot workflow invocation",
  "Check out the exact diagnostic harness",
  "Set up exact Node 22.20.0 x64",
  "Verify the exact harness and Node runtime",
  "Verify the published V1 invalid motivation anonymously",
  "Install the frozen diagnostic harness",
  "Install the exact Playwright Chromium runtime",
  "Provision the exact Stasis EGL runtime prerequisite",
  "Verify and download the immutable comparison inputs anonymously",
  "Verify the exact package source records",
  "Download the exact Linux package artifact",
  "Download the exact Linux package proof",
  "Download the exact TypeScript package artifact",
  "Download the exact runtime manifest",
  "Verify and extract the exact Linux candidate inputs",
  "Run one Crawlee-then-Stasis phase diagnostic V2",
  "Verify the diagnostic V2 artifact set offline",
  "Seal the exact five-file diagnostic V2 evidence inventory",
  "Create the bounded diagnostic V2 outcome",
  "Seal the outcome-specific diagnostic V2 bundle",
  "Retain the outcome-specific diagnostic V2 bundle",
  "Propagate the terminal diagnostic V2 outcome",
]);

export function assertCrawlPhaseDiagnosticV2Unpublishable(value) {
  if (!isDeepStrictEqual(value, crawlPhaseDiagnosticV2UnpublishableIdentity)) {
    throw new TypeError("Diagnostic V2 unpublishable motivation changed");
  }
  return crawlPhaseDiagnosticV2UnpublishableIdentity;
}

export function verifyCrawlPhaseDiagnosticV2UnpublishableObservation({
  runRecord,
  workflowRunsListing,
  jobsListing,
  artifactsListing,
  contractReleaseRecord,
  contractCommitRecord,
  contractTagRefRecord,
} = {}) {
  const identity = crawlPhaseDiagnosticV2UnpublishableIdentity;
  const run = record(runRecord, "V2 workflow run");
  const runs = record(workflowRunsListing, "V2 workflow runs listing");
  const jobs = record(jobsListing, "V2 workflow jobs listing");
  const artifacts = record(artifactsListing, "V2 workflow artifacts listing");
  const release = record(contractReleaseRecord, "V2 contract release");
  const commit = record(contractCommitRecord, "V2 contract commit");
  const tagRef = record(contractTagRefRecord, "V2 contract tag ref");
  const expectedRun = identity.hostedObservation;
  const expectedSource = identity.workflowSource;

  if (
    run.id !== expectedRun.runId || run.name !== "Stasis v0.3.3 performance crawl phase diagnostic V2" ||
    run.path !== expectedSource.workflowPath || run.head_branch !== expectedSource.branch ||
    run.head_sha !== expectedSource.commitSha || run.event !== "push" ||
    run.run_attempt !== expectedRun.runAttempt || run.status !== "completed" ||
    run.conclusion !== expectedRun.conclusion || run.created_at !== expectedRun.createdAt ||
    run.run_started_at !== expectedRun.runStartedAt || run.updated_at !== expectedRun.completedAt
  ) throw new TypeError("Diagnostic V2 unpublishable run identity changed");

  if (
    runs.total_count !== expectedRun.invocationCount || !Array.isArray(runs.workflow_runs) ||
    runs.workflow_runs.length !== expectedRun.invocationCount ||
    runs.workflow_runs[0]?.id !== expectedRun.runId ||
    runs.workflow_runs[0]?.run_attempt !== expectedRun.runAttempt
  ) throw new TypeError("Diagnostic V2 unpublishable one-shot identity changed");

  if (jobs.total_count !== 1 || !Array.isArray(jobs.jobs) || jobs.jobs.length !== 1) {
    throw new TypeError("Diagnostic V2 unpublishable job inventory changed");
  }
  const job = record(jobs.jobs[0], "V2 workflow job");
  if (
    job.id !== expectedRun.jobId || job.run_id !== expectedRun.runId ||
    job.name !== "Native Ubuntu 22.04 crawl phase diagnostic V2" ||
    job.head_branch !== expectedSource.branch || job.head_sha !== expectedSource.commitSha ||
    job.run_attempt !== expectedRun.runAttempt || job.status !== "completed" ||
    job.conclusion !== expectedRun.conclusion ||
    !isDeepStrictEqual(job.labels, ["ubuntu-22.04"])
  ) throw new TypeError("Diagnostic V2 unpublishable job identity changed");
  assertObservedTopology(job.steps, identity);

  let observedError;
  try {
    assertV2JobStepTopology(job, "bundle_valid");
  } catch (error) {
    observedError = error;
  }
  if (!(observedError instanceof TypeError) || observedError.message !== expectedRun.v2VerifierError) {
    throw new TypeError("Diagnostic V2 verifier defect is not reproducible");
  }
  const counterfactual = structuredClone(job);
  counterfactual.steps.slice(-3).forEach((step, index) => {
    step.number = expectedRun.v2VerifierFrozenPostSteps[index].number;
  });
  const accepted = assertV2JobStepTopology(counterfactual, "bundle_valid");
  if (accepted.artifactMode !== "bundle_valid") {
    throw new TypeError("Diagnostic V2 frozen counterfactual topology was not accepted");
  }

  if (artifacts.total_count !== 1 || !Array.isArray(artifacts.artifacts) || artifacts.artifacts.length !== 1) {
    throw new TypeError("Diagnostic V2 unpublishable artifact inventory changed");
  }
  const artifact = record(artifacts.artifacts[0], "V2 workflow artifact");
  if (
    artifact.id !== expectedRun.artifact.id || artifact.name !== expectedRun.artifact.name ||
    artifact.size_in_bytes !== expectedRun.artifact.bytes ||
    artifact.digest !== `sha256:${expectedRun.artifact.sha256}` ||
    typeof artifact.expired !== "boolean" ||
    artifact.workflow_run?.id !== expectedRun.runId ||
    artifact.workflow_run?.head_sha !== expectedSource.commitSha
  ) throw new TypeError("Diagnostic V2 unpublishable artifact identity changed");

  assertV2Contract(release, commit, tagRef, identity);
  if (!(Date.parse(identity.v2Contract.publishedAt) < Date.parse(expectedRun.createdAt))) {
    throw new TypeError("Diagnostic V2 contract did not precede its observation");
  }

  return deepFreeze({
    schema: crawlPhaseDiagnosticV2UnpublishableVerificationSchema,
    status: "passed",
    reasonCode: identity.reasonCode,
    contractCommitSha: identity.v2Contract.commitSha,
    workflowSourceSha: expectedSource.commitSha,
    runId: expectedRun.runId,
    jobId: expectedRun.jobId,
    artifactId: expectedRun.artifact.id,
    coreStepCount: expectedRun.coreStepCount,
    observedPostSteps: structuredClone(expectedRun.observedPostSteps),
    v2VerifierFrozenPostSteps: structuredClone(expectedRun.v2VerifierFrozenPostSteps),
    v2VerifierError: expectedRun.v2VerifierError,
    verification: {
      immutableV2ContractPredatesObservation: true,
      exactlyOneInvocationAndNoRerun: true,
      actualTopologyRejectedByFrozenV2Verifier: true,
      frozenCounterfactualTopologyAcceptedByV2Verifier: true,
      artifactMetadataBoundWithoutPayloadConsumption: true,
      artifactWasUnexpiredAtFreeze: expectedRun.artifact.unexpiredAtFreeze,
      rawTimingImportedIntoV3ContractOrVerifier: false,
      diagnosticOutcomeImportedIntoV3ContractOrVerifier: false,
      comparisonValueImportedIntoV3ContractOrVerifier: false,
      v2EvidenceReleaseAuthorized: false,
      replacementRequiresPreregisteredV3: true,
    },
    claimBoundary: structuredClone(identity.claimBoundary),
  });
}

function assertObservedTopology(value, identity) {
  if (!Array.isArray(value) || value.length !== 26) {
    throw new TypeError("Diagnostic V2 observed step topology length changed");
  }
  for (let index = 0; index < coreStepNames.length; index += 1) {
    const step = record(value[index], `V2 core step ${index + 1}`);
    if (step.number !== index + 1 || step.name !== coreStepNames[index] || step.status !== "completed") {
      throw new TypeError(`Diagnostic V2 observed core step changed: ${index + 1}`);
    }
  }
  const posts = value.slice(-3).map(({ number, name }) => ({ number, name }));
  if (!isDeepStrictEqual(posts, identity.hostedObservation.observedPostSteps)) {
    throw new TypeError("Diagnostic V2 observed post-step topology changed");
  }
  const conclusions = value.map(({ conclusion }) => conclusion);
  if (
    conclusions.some((value, index) => value !== (index === 22 ? "skipped" : "success"))
  ) throw new TypeError("Diagnostic V2 observed step conclusions changed");
}

function assertV2Contract(release, commit, tagRef, identity) {
  const expected = identity.v2Contract;
  if (
    release.id !== expected.releaseId || release.tag_name !== expected.tag ||
    release.target_commitish !== expected.commitSha || release.immutable !== true ||
    release.draft !== false || release.prerelease !== false ||
    release.created_at !== expected.createdAt || release.published_at !== expected.publishedAt ||
    !Array.isArray(release.assets) || release.assets.length !== expected.assets.length
  ) throw new TypeError("Diagnostic V2 contract release identity changed");
  const projectedAssets = [...release.assets]
    .map(({ id, name, size, digest }) => ({ id, name, bytes: size, sha256: digest?.replace(/^sha256:/u, "") }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  const expectedAssets = [...expected.assets]
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  if (!isDeepStrictEqual(projectedAssets, expectedAssets)) {
    throw new TypeError("Diagnostic V2 contract release assets changed");
  }
  if (
    commit.sha !== expected.commitSha || commit.commit?.tree?.sha !== expected.treeSha ||
    !isDeepStrictEqual(commit.parents?.map(({ sha }) => sha), [expected.parentCommitSha])
  ) throw new TypeError("Diagnostic V2 contract commit identity changed");
  if (
    tagRef.ref !== `refs/tags/${expected.tag}` || tagRef.object?.type !== "commit" ||
    tagRef.object?.sha !== expected.commitSha
  ) throw new TypeError("Diagnostic V2 contract tag identity changed");
}

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
