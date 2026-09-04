import { isDeepStrictEqual } from "node:util";

import {
  verifyCrawlPhaseDiagnosticHostedProvenance as verifyV3HostedProvenance,
} from "./crawl-phase-diagnostic-hosted-provenance-v3.mjs";

export const crawlPhaseDiagnosticV3UnpublishableSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-unpublishable-v1";
export const crawlPhaseDiagnosticV3UnpublishableVerificationSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-unpublishable-verification-v4";
export const crawlPhaseDiagnosticV3UnpublishableContractAssetIdentity = deepFreeze({
  name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-unpublishable.json",
  bytes: 5368,
  sha256: "8ac79a01296fe13c127b1809602a82e905323a9f59bf2f9c2b9a39d4ec881528",
});

export const crawlPhaseDiagnosticV3UnpublishableIdentity = deepFreeze({
  schema: crawlPhaseDiagnosticV3UnpublishableSchema,
  status: "unpublishable",
  reasonCode: "CONTRACT_TARGET_COMMITISH_METADATA_MISMATCH",
  v3Contract: {
    repository: "oxhq/stasis-compat-bench",
    commitSha: "c71a6c1d9ecf4cc27f72b60f7b51050880665fc5",
    parentCommitSha: "54a08f2f63718658a2ed60309eba94c9a00efbc3",
    treeSha: "10ef173b0fdcbd619fe7bcd8451cf20ddd759e7f",
    tag: "stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v3",
    releaseId: 382895048,
    createdAt: "2026-09-04T17:07:48Z",
    publishedAt: "2026-09-04T17:10:56Z",
    targetCommitish: "main",
    requiredTargetCommitish: "c71a6c1d9ecf4cc27f72b60f7b51050880665fc5",
    immutable: true,
    assets: [
      {
        id: 544647259,
        name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable.json",
        bytes: 4715,
        sha256: "e4c05eb998ba8101d14b1307db587c09a1acc1649a4589460a6a9e788a7f5e23",
      },
      {
        id: 544647261,
        name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-preflight.json",
        bytes: 10756,
        sha256: "988fb57464ca504592f70927234a67713634cf6efb7ac4702ac969431dbb9ce5",
      },
      {
        id: 544647264,
        name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-workflow.yml",
        bytes: 63031,
        sha256: "58d309cae7286f9ed7858e3f5247e6b4999a7f647070bc7010a498a082571cba",
      },
      {
        id: 544647262,
        name: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v3.md",
        bytes: 18482,
        sha256: "84567d9555d97d5206b36d080b4a701efc95eacecf10d63d449ccb2dc5405fb1",
      },
    ],
  },
  workflowSource: {
    repository: "oxhq/stasis",
    branch: "codex/stasis-v033-crawl-phase-diagnostic-v3",
    commitSha: "fc1dfca00b0f25d1da35cae23fa206d511aa876e",
    parentCommitSha: "6dbe0cafd261e7a171c84929233bb9131b9d4b3e",
    treeSha: "5d25832a1678d57359980df4b1f1dacbe5e6bacc",
    workflowPath: ".github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v3.yml",
    workflowBlobSha: "a9914cdd9c4146a898df3753949e3a864141fc0a",
  },
  hostedObservation: {
    runId: 33899303292,
    runAttempt: 1,
    jobId: 101109351746,
    createdAt: "2026-09-04T17:12:16Z",
    runStartedAt: "2026-09-04T17:12:16Z",
    completedAt: "2026-09-04T17:13:36Z",
    conclusion: "success",
    invocationCount: 1,
    rerunCount: 0,
    artifact: {
      id: 9947025197,
      name: "stasis-v0.3.3-crawl-phase-diagnostic-v3-bundle-attempt-1",
      bytes: 24531,
      sha256: "d0c9cd619e95664e8fb0ce9758f45b738248bd1a81b4f5bf522b7c988177380c",
      unexpiredAtFreeze: true,
    },
    coreStepCount: 23,
    lastCoreStepNumber: 23,
    observedPostSteps: [
      { number: 45, name: "Post Set up exact Node 22.20.0 x64" },
      { number: 46, name: "Post Check out the exact diagnostic harness" },
      { number: 47, name: "Complete job" },
    ],
    h6VerifierRequiredTargetCommitish:
      "c71a6c1d9ecf4cc27f72b60f7b51050880665fc5",
    h6VerifierObservedTargetCommitish: "main",
    h6VerifierError: "diagnostic contract release identity is invalid",
  },
  captureManifest: [
    { name: "contract-release.json", bytes: 10329, sha256: "6990ccfd9bc5a779efc79360f34506e0776ac1ea7d03f0b66b37efe4a93c12ee" },
    { name: "contract-commit.json", bytes: 571659, sha256: "c0be7b40c36a5a0c28d576e89e8b7d6c065e264586a572320893d42aade8e5ac" },
    { name: "contract-tag-ref.json", bytes: 571, sha256: "1ed8aeedb3c9ff4586df628a0edea51e0505884c3bffdda481d49d3029a8d986" },
    { name: "workflow-run.json", bytes: 12689, sha256: "a531ec2efa4655b43a7aba9ef43f54f6e6b8dc16a3457d2be37d782014db05e0" },
    { name: "workflow-runs.json", bytes: 13630, sha256: "531f7c69a9424205eff8563afd8fa2c9216073ef584def843a702a1b4384752a" },
    { name: "workflow-jobs.json", bytes: 8322, sha256: "f1d9c0a3944324c5453f66fcee15c711901d0623c60e3b96f84676f3c2ea8cd4" },
    { name: "workflow-artifacts.json", bytes: 945, sha256: "62448648d15ddbf62ccc1a639f463ecc837155e751f057480789da32aaaf8437" },
    { name: "actions-diagnostic-bundle.zip", bytes: 24531, sha256: "d0c9cd619e95664e8fb0ce9758f45b738248bd1a81b4f5bf522b7c988177380c" },
  ],
  exclusion: {
    artifactPayloadConsumedByMotivationVerifier: false,
    rawTimingImportedIntoV4ContractOrVerifier: false,
    diagnosticOutcomeImportedIntoV4ContractOrVerifier: false,
    comparisonValueImportedIntoV4ContractOrVerifier: false,
    v3EvidenceReleaseAuthorized: false,
    v3RerunAuthorized: false,
    postHocVerifierRepairAuthorized: false,
    replacementProtocol: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v4",
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

export function assertCrawlPhaseDiagnosticV3Unpublishable(value) {
  if (!isDeepStrictEqual(value, crawlPhaseDiagnosticV3UnpublishableIdentity)) {
    throw new TypeError("Diagnostic V3 unpublishable motivation changed");
  }
  return crawlPhaseDiagnosticV3UnpublishableIdentity;
}

export function verifyCrawlPhaseDiagnosticV3UnpublishableObservation({
  runRecord,
  workflowRunsListing,
  jobsListing,
  artifactsListing,
  contractReleaseRecord,
  contractCommitRecord,
  contractTagRefRecord,
  diagnosticContractAssets,
  comparisonEvidenceReleaseRecord,
  comparisonEvidenceCommitRecord,
  comparisonEvidenceTagRefRecord,
  comparisonEvidenceAssets,
  workflowSourceCommitRecord,
  workflowSourceTreeRecords,
  workflowSourceBlobRecord,
  workflowSourceBytes,
  preservedV2DiagnosticWorkflowBlobRecord,
  preservedV1DiagnosticWorkflowBlobRecord,
  preservedComparisonWorkflowBlobRecord,
} = {}) {
  const identity = crawlPhaseDiagnosticV3UnpublishableIdentity;
  const run = record(runRecord, "V3 workflow run");
  const runs = record(workflowRunsListing, "V3 workflow runs listing");
  const jobs = record(jobsListing, "V3 workflow jobs listing");
  const artifacts = record(artifactsListing, "V3 workflow artifacts listing");
  const release = record(contractReleaseRecord, "V3 contract release");
  const commit = record(contractCommitRecord, "V3 contract commit");
  const tagRef = record(contractTagRefRecord, "V3 contract tag ref");
  const expectedRun = identity.hostedObservation;
  const expectedSource = identity.workflowSource;

  if (
    run.id !== expectedRun.runId || run.name !== "Stasis v0.3.3 performance crawl phase diagnostic V3" ||
    run.path !== expectedSource.workflowPath || run.head_branch !== expectedSource.branch ||
    run.head_sha !== expectedSource.commitSha || run.event !== "push" ||
    run.run_attempt !== expectedRun.runAttempt || run.status !== "completed" ||
    run.conclusion !== expectedRun.conclusion || run.created_at !== expectedRun.createdAt ||
    run.run_started_at !== expectedRun.runStartedAt || run.updated_at !== expectedRun.completedAt
  ) throw new TypeError("Diagnostic V3 unpublishable run identity changed");

  if (
    runs.total_count !== expectedRun.invocationCount || !Array.isArray(runs.workflow_runs) ||
    runs.workflow_runs.length !== expectedRun.invocationCount ||
    runs.workflow_runs[0]?.id !== expectedRun.runId ||
    runs.workflow_runs[0]?.run_attempt !== expectedRun.runAttempt
  ) throw new TypeError("Diagnostic V3 unpublishable one-shot identity changed");

  if (jobs.total_count !== 1 || !Array.isArray(jobs.jobs) || jobs.jobs.length !== 1) {
    throw new TypeError("Diagnostic V3 unpublishable job inventory changed");
  }
  const job = record(jobs.jobs[0], "V3 workflow job");
  if (
    job.id !== expectedRun.jobId || job.run_id !== expectedRun.runId ||
    job.name !== "Native Ubuntu 22.04 crawl phase diagnostic V3" ||
    job.head_branch !== expectedSource.branch || job.head_sha !== expectedSource.commitSha ||
    job.run_attempt !== expectedRun.runAttempt || job.status !== "completed" ||
    job.conclusion !== expectedRun.conclusion ||
    !isDeepStrictEqual(job.labels, ["ubuntu-22.04"])
  ) throw new TypeError("Diagnostic V3 unpublishable job identity changed");
  assertObservedTopology(job.steps, identity);

  if (artifacts.total_count !== 1 || !Array.isArray(artifacts.artifacts) || artifacts.artifacts.length !== 1) {
    throw new TypeError("Diagnostic V3 unpublishable artifact inventory changed");
  }
  const artifact = record(artifacts.artifacts[0], "V3 workflow artifact");
  if (
    artifact.id !== expectedRun.artifact.id || artifact.name !== expectedRun.artifact.name ||
    artifact.size_in_bytes !== expectedRun.artifact.bytes ||
    artifact.digest !== `sha256:${expectedRun.artifact.sha256}` ||
    typeof artifact.expired !== "boolean" ||
    artifact.workflow_run?.id !== expectedRun.runId ||
    artifact.workflow_run?.head_sha !== expectedSource.commitSha
  ) throw new TypeError("Diagnostic V3 unpublishable artifact identity changed");

  assertV3Contract(release, commit, tagRef, identity);
  if (!(Date.parse(identity.v3Contract.publishedAt) < Date.parse(expectedRun.createdAt))) {
    throw new TypeError("Diagnostic V3 contract did not precede its observation");
  }

  const verifierInputs = {
    runRecord,
    workflowRunsListing,
    jobsListing,
    artifactsListing,
    diagnosticContractReleaseRecord: contractReleaseRecord,
    diagnosticContractCommitRecord: contractCommitRecord,
    diagnosticContractTagRefRecord: contractTagRefRecord,
    diagnosticContractAssets,
    comparisonEvidenceReleaseRecord,
    comparisonEvidenceCommitRecord,
    comparisonEvidenceTagRefRecord,
    comparisonEvidenceAssets,
    workflowSourceCommitRecord,
    workflowSourceTreeRecords,
    workflowSourceBlobRecord,
    workflowSourceBytes,
    preservedV2DiagnosticWorkflowBlobRecord,
    preservedV1DiagnosticWorkflowBlobRecord,
    preservedComparisonWorkflowBlobRecord,
  };
  let observedError;
  try {
    verifyV3HostedProvenance(verifierInputs);
  } catch (error) {
    observedError = error;
  }
  if (
    !(observedError instanceof TypeError) ||
    observedError.message !== expectedRun.h6VerifierError
  ) {
    throw new TypeError("Diagnostic V3 H6 verifier defect is not reproducible");
  }
  const correctedRelease = structuredClone(contractReleaseRecord);
  correctedRelease.target_commitish = expectedRun.h6VerifierRequiredTargetCommitish;
  const frozenArtifacts = structuredClone(artifactsListing);
  frozenArtifacts.artifacts[0].expired = !expectedRun.artifact.unexpiredAtFreeze;
  const accepted = verifyV3HostedProvenance({
    ...verifierInputs,
    artifactsListing: frozenArtifacts,
    diagnosticContractReleaseRecord: correctedRelease,
  });
  if (
    accepted.outcomeClass !== "VALID_NON_AUTHORITATIVE" ||
    accepted.artifactMode !== "bundle_valid" ||
    accepted.producer.runId !== expectedRun.runId
  ) {
    throw new TypeError("Diagnostic V3 exact-target counterfactual was not accepted");
  }

  return deepFreeze({
    schema: crawlPhaseDiagnosticV3UnpublishableVerificationSchema,
    status: "passed",
    reasonCode: identity.reasonCode,
    contractCommitSha: identity.v3Contract.commitSha,
    workflowSourceSha: expectedSource.commitSha,
    runId: expectedRun.runId,
    jobId: expectedRun.jobId,
    artifactId: expectedRun.artifact.id,
    coreStepCount: expectedRun.coreStepCount,
    observedPostSteps: structuredClone(expectedRun.observedPostSteps),
    h6VerifierRequiredTargetCommitish: expectedRun.h6VerifierRequiredTargetCommitish,
    h6VerifierObservedTargetCommitish: expectedRun.h6VerifierObservedTargetCommitish,
    h6VerifierError: expectedRun.h6VerifierError,
    verification: {
      immutableV3ContractPredatesObservation: true,
      exactlyOneInvocationAndNoRerun: true,
      actualMainTargetRejectedByFrozenH6Verifier: true,
      exactH6TargetCounterfactualAcceptedByFrozenH6Verifier: true,
      exactV3TopologyAcceptedUnderTargetCounterfactual: true,
      artifactMetadataBoundWithoutPayloadConsumption: true,
      artifactWasUnexpiredAtFreeze: expectedRun.artifact.unexpiredAtFreeze,
      futureArtifactExpiryIgnoredAfterFreeze: true,
      rawTimingImportedIntoV4ContractOrVerifier: false,
      diagnosticOutcomeImportedIntoV4ContractOrVerifier: false,
      comparisonValueImportedIntoV4ContractOrVerifier: false,
      v3EvidenceReleaseAuthorized: false,
      replacementRequiresPreregisteredV4: true,
    },
    claimBoundary: structuredClone(identity.claimBoundary),
  });
}

function assertObservedTopology(value, identity) {
  if (!Array.isArray(value) || value.length !== 26) {
    throw new TypeError("Diagnostic V3 observed step topology length changed");
  }
  for (let index = 0; index < coreStepNames.length; index += 1) {
    const step = record(value[index], `V3 core step ${index + 1}`);
    if (step.number !== index + 1 || step.name !== coreStepNames[index] || step.status !== "completed") {
      throw new TypeError(`Diagnostic V3 observed core step changed: ${index + 1}`);
    }
  }
  const posts = value.slice(-3).map(({ number, name }) => ({ number, name }));
  if (!isDeepStrictEqual(posts, identity.hostedObservation.observedPostSteps)) {
    throw new TypeError("Diagnostic V3 observed post-step topology changed");
  }
  const conclusions = value.map(({ conclusion }) => conclusion);
  if (
    conclusions.some((value, index) => value !== (index === 22 ? "skipped" : "success"))
  ) throw new TypeError("Diagnostic V3 observed step conclusions changed");
}

function assertV3Contract(release, commit, tagRef, identity) {
  const expected = identity.v3Contract;
  if (
    release.id !== expected.releaseId || release.tag_name !== expected.tag ||
    release.target_commitish !== expected.targetCommitish || release.immutable !== true ||
    release.draft !== false || release.prerelease !== false ||
    release.created_at !== expected.createdAt || release.published_at !== expected.publishedAt ||
    !Array.isArray(release.assets) || release.assets.length !== expected.assets.length
  ) throw new TypeError("Diagnostic V3 contract release identity changed");
  const projectedAssets = [...release.assets]
    .map(({ id, name, size, digest }) => ({ id, name, bytes: size, sha256: digest?.replace(/^sha256:/u, "") }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  const expectedAssets = [...expected.assets]
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  if (!isDeepStrictEqual(projectedAssets, expectedAssets)) {
    throw new TypeError("Diagnostic V3 contract release assets changed");
  }
  if (
    commit.sha !== expected.commitSha || commit.commit?.tree?.sha !== expected.treeSha ||
    !isDeepStrictEqual(commit.parents?.map(({ sha }) => sha), [expected.parentCommitSha])
  ) throw new TypeError("Diagnostic V3 contract commit identity changed");
  if (
    tagRef.ref !== `refs/tags/${expected.tag}` || tagRef.object?.type !== "commit" ||
    tagRef.object?.sha !== expected.commitSha
  ) throw new TypeError("Diagnostic V3 contract tag identity changed");
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
