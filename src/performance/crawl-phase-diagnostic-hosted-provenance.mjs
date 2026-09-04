import { createHash } from "node:crypto";
import { isDeepStrictEqual, TextDecoder } from "node:util";

import {
  performanceReplicationHostedIdentity,
} from "./replication-hosted-provenance.mjs";
import {
  performanceReplicationPublicationAssetNames,
  performanceReplicationPublicationIdentity,
} from "./replication-publication.mjs";

export const crawlPhaseDiagnosticHostedProvenanceSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-hosted-provenance-v1";
export const crawlPhaseDiagnosticPreflightSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-preflight-v1";

export const crawlPhaseDiagnosticHostedIdentity = deepFreeze({
  repository: "oxhq/stasis",
  workflow: {
    name: "Stasis v0.3.3 performance crawl phase diagnostic",
    path: ".github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic.yml",
  },
  event: "push",
  headBranch: "codex/stasis-v033-crawl-phase-diagnostic-v1",
  headRef: "refs/heads/codex/stasis-v033-crawl-phase-diagnostic-v1",
  runAttempt: 1,
  job: {
    id: "crawl-phase-diagnostic",
    name: "Native Ubuntu 22.04 crawl phase diagnostic",
    labels: ["ubuntu-22.04"],
  },
  comparison: {
    runId: 33862916068,
    crawlJobId: 100991246321,
  },
});

export const crawlPhaseDiagnosticContractIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  tag: "stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v1",
  evidenceTag: "stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v1",
  soleParentSha: "6c1a0066eb17425628293993fd7312d4cf26e0f5",
  assets: {
    protocol: "stasis-v0.3.3-performance-crawl-phase-diagnostic-v1.md",
    workflow: "stasis-v0.3.3-performance-crawl-phase-diagnostic-workflow.yml",
    preflight: "stasis-v0.3.3-performance-crawl-phase-diagnostic-preflight.json",
  },
});

export const crawlPhaseDiagnosticComparisonEvidenceIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  releaseId: 382679391,
  tag: "stasis-v0.3.3-performance-replication-evidence-v1",
  targetCommitSha: "6c1a0066eb17425628293993fd7312d4cf26e0f5",
  targetTreeSha: "0d5322a5c2c104d2065a37fb7deecfa6944100bc",
  assets: {
    artifactBinding: {
      id: 544250114,
      name: "artifact-binding.json",
      bytes: 5086,
      sha256: "78d91f9c12f85d538dff1944e772614bf9b0adc9841d647c93ab8f608f1ba4ad",
    },
    freshCrawlRaw: {
      id: 544250086,
      name: "fresh-crawl-raw.json",
      bytes: 221543,
      sha256: "52a76a4ebb726c6ab78b70356655e8abd7a5e84d9ce175a8e0d876f543c1a16b",
    },
  },
});

export const crawlPhaseDiagnosticExpectedArtifactNames = Object.freeze([
  "stasis-v0.3.3-crawl-phase-diagnostic-bundle-attempt-1",
]);

export const crawlPhaseDiagnosticArtifactEntries = deepFreeze({
  status: ["diagnostic-outcome.json"],
  evidence: [
    "comparison-input-verification.json",
    "crawl-phase-crawlee-raw.json",
    "crawl-phase-localization-evidence.json",
    "crawl-phase-stasis-raw.json",
    "diagnostic-verification.json",
  ],
  valid: [
    "comparison-input-verification.json",
    "crawl-phase-crawlee-raw.json",
    "crawl-phase-localization-evidence.json",
    "crawl-phase-stasis-raw.json",
    "diagnostic-outcome.json",
    "diagnostic-verification.json",
  ],
});

const diagnosticPreparationStepNames = Object.freeze([
  "Validate the one-shot workflow invocation",
  "Check out the exact diagnostic harness",
  "Set up exact Node 22.20.0 x64",
  "Verify the exact harness and Node runtime",
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
  "Run one Crawlee-then-Stasis phase diagnostic",
  "Verify the diagnostic artifact set offline",
  "Seal the exact five-file diagnostic evidence inventory",
]);

export const crawlPhaseDiagnosticJobStepIdentity = deepFreeze({
  setup: { number: 1, name: "Set up job" },
  preparation: diagnosticPreparationStepNames.map((name, index) => ({
    number: index + 2,
    name,
  })),
  createOutcome: { number: 19, name: "Create the bounded diagnostic outcome" },
  sealBundle: { number: 20, name: "Seal the outcome-specific diagnostic bundle" },
  uploadBundle: { number: 21, name: "Retain the outcome-specific diagnostic bundle" },
  propagate: { number: 22, name: "Propagate the terminal diagnostic outcome" },
  postSetupNode: { number: 43, name: "Post Set up exact Node 22.20.0 x64" },
  postCheckout: { number: 44, name: "Post Check out the exact diagnostic harness" },
  complete: { number: 45, name: "Complete job" },
});

export const crawlPhaseDiagnosticPublicationOutcomeAssetNames = deepFreeze({
  VALID_NON_AUTHORITATIVE: [
    "SHA256SUMS.txt",
    "actions-diagnostic-bundle.zip",
    "comparison-artifact-binding.json",
    "comparison-evidence-release-commit.json",
    "comparison-evidence-release.json",
    "comparison-fresh-crawl-raw.json",
    "comparison-input-verification.json",
    "contract-commit.json",
    "contract-release.json",
    "crawl-phase-crawlee-raw.json",
    "crawl-phase-localization-evidence.json",
    "crawl-phase-stasis-raw.json",
    "diagnostic-artifact-binding.json",
    "diagnostic-outcome.json",
    "diagnostic-verification.json",
    "hosted-provenance.json",
    "privacy-scan.json",
    "workflow-artifacts.json",
    "workflow-jobs.json",
    "workflow-run.json",
    "workflow-runs.json",
    "workflow-source-commit.json",
  ],
  DIAGNOSTIC_INVALID_WITH_STATUS: [
    "SHA256SUMS.txt",
    "actions-diagnostic-bundle.zip",
    "comparison-artifact-binding.json",
    "comparison-evidence-release-commit.json",
    "comparison-evidence-release.json",
    "comparison-fresh-crawl-raw.json",
    "contract-commit.json",
    "contract-release.json",
    "diagnostic-artifact-binding.json",
    "diagnostic-outcome.json",
    "hosted-provenance.json",
    "privacy-scan.json",
    "workflow-artifacts.json",
    "workflow-jobs.json",
    "workflow-run.json",
    "workflow-runs.json",
    "workflow-source-commit.json",
  ],
  INFRASTRUCTURE_INVALID_NO_ARTIFACT: [
    "SHA256SUMS.txt",
    "comparison-artifact-binding.json",
    "comparison-evidence-release-commit.json",
    "comparison-evidence-release.json",
    "comparison-fresh-crawl-raw.json",
    "contract-commit.json",
    "contract-release.json",
    "diagnostic-outcome.json",
    "hosted-provenance.json",
    "privacy-scan.json",
    "workflow-artifacts.json",
    "workflow-jobs.json",
    "workflow-run.json",
    "workflow-runs.json",
    "workflow-source-commit.json",
  ],
});

/**
 * Checks the three on-disk contract assets before publication. This narrow
 * gate proves that the UTF-8 protocol/mirror and canonical preflight agree,
 * including the Git blob identity preregistered for the source workflow.
 */
export function assertCrawlPhaseDiagnosticContractAssets(value) {
  const inputs = verifyContractAssetInputs(value);
  const preflight = verifyPreflight(inputs.preflight.value);
  const workflowBlobSha = gitBlobSha(inputs.workflow);
  if (workflowBlobSha !== preflight.workflowSource.workflow.blobSha) {
    throw new TypeError(
      "Diagnostic workflow mirror Git blob differs from the preregistered source blob",
    );
  }
  return deepFreeze({
    protocol: fileIdentity(inputs.protocol),
    workflow: { ...fileIdentity(inputs.workflow), blobSha: workflowBlobSha },
    preflight: fileIdentity(inputs.preflight.bytes),
  });
}

/**
 * Applies the production REST step-topology gate without requiring the other
 * hosted API records. This is intentionally narrow so publication can reject
 * a retained jobs snapshot whose tail conclusions contradict its artifact
 * mode.
 */
export function assertCrawlPhaseDiagnosticJobStepTopology(
  job,
  expectedArtifactMode = undefined,
) {
  const record = requireRecord(job, "diagnostic hosted job");
  if (record.status !== "completed") {
    throw new TypeError("Diagnostic hosted job is not terminal");
  }
  const conclusion = terminalConclusion(record.conclusion, "diagnostic hosted job conclusion");
  const started = apiInstant(record.started_at, "diagnostic hosted job started_at");
  const completed = apiInstant(record.completed_at, "diagnostic hosted job completed_at");
  if (completed.epochMilliseconds < started.epochMilliseconds) {
    throw new TypeError("Diagnostic hosted job timestamps are out of order");
  }
  const verified = verifyJobSteps(record.steps, {
    jobStartedAt: started.value,
    jobCompletedAt: completed.value,
    runConclusion: conclusion,
  });
  if (
    expectedArtifactMode !== undefined &&
    verified.expectedArtifactMode !== expectedArtifactMode
  ) {
    throw new TypeError("Diagnostic hosted job step topology differs from artifact mode");
  }
  return deepFreeze({
    artifactMode: verified.expectedArtifactMode,
    conclusion,
    startedAt: started.value,
    completedAt: completed.value,
    steps: verified.steps,
  });
}

const comparisonWorkflowPath = performanceReplicationHostedIdentity.workflow.path;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/u;
const apiRoot = "https://api.github.com/repos";
const webRoot = "https://github.com";
const uploadRoot = "https://uploads.github.com/repos";
const utf8 = new TextDecoder("utf-8", { fatal: true });
const publishableTerminalConclusions = new Set(["failure", "success"]);

/**
 * Verifies one preregistered diagnostic invocation from public GitHub records
 * and exact contract/comparison bytes. Dynamic identities that cannot exist
 * before the push (workflow ID and run/job/artifact IDs) are derived only
 * after the immutable preflight has fixed the source commit and workflow blob.
 */
export function verifyCrawlPhaseDiagnosticHostedProvenance({
  runRecord,
  workflowRunsListing,
  jobsListing,
  artifactsListing,
  diagnosticContractReleaseRecord,
  diagnosticContractCommitRecord,
  diagnosticContractTagRefRecord,
  diagnosticContractAssets,
  comparisonEvidenceReleaseRecord,
  comparisonEvidenceCommitRecord,
  comparisonEvidenceTagRefRecord,
  comparisonEvidenceAssets,
  workflowSourceCommitRecord,
  workflowSourceTreeRecord,
  workflowSourceBlobRecord,
  workflowSourceBytes,
  preservedComparisonWorkflowBlobRecord,
} = {}) {
  const contractInputs = verifyContractAssetInputs(diagnosticContractAssets);
  const preflight = verifyPreflight(contractInputs.preflight.value);
  const comparisonInputs = verifyComparisonAssetInputs(comparisonEvidenceAssets);
  const comparison = verifyComparisonEvidencePublication({
    release: comparisonEvidenceReleaseRecord,
    commit: comparisonEvidenceCommitRecord,
    tagRef: comparisonEvidenceTagRefRecord,
    assets: comparisonInputs,
    preflight,
  });
  const contract = verifyDiagnosticContractPublication({
    release: diagnosticContractReleaseRecord,
    commit: diagnosticContractCommitRecord,
    tagRef: diagnosticContractTagRefRecord,
    assets: contractInputs,
    preflight,
  });
  const source = verifyWorkflowSource({
    commit: workflowSourceCommitRecord,
    tree: workflowSourceTreeRecord,
    workflowBlob: workflowSourceBlobRecord,
    workflowBytes: exactBuffer(workflowSourceBytes, "workflow source bytes"),
    preservedBlob: preservedComparisonWorkflowBlobRecord,
    mirrorBytes: contractInputs.workflow,
    preflight,
  });
  const run = verifyRunRecord(runRecord, preflight);
  const oneShot = verifyWorkflowRunsListing(workflowRunsListing, run, preflight);
  const job = verifyJobsListing(jobsListing, run, preflight);
  const artifactResult = verifyArtifactsListing(
    artifactsListing,
    run,
    job,
  );
  verifyChronology(comparison, contract, run);

  const receipt = {
    schema: crawlPhaseDiagnosticHostedProvenanceSchema,
    status: "passed",
    outcomeClass: artifactResult.outcomeClass,
    artifactMode: artifactResult.mode,
    producer: {
      repository: crawlPhaseDiagnosticHostedIdentity.repository,
      repositoryId: run.repositoryId,
      workflowId: run.workflowId,
      workflowName: crawlPhaseDiagnosticHostedIdentity.workflow.name,
      workflowPath: crawlPhaseDiagnosticHostedIdentity.workflow.path,
      event: crawlPhaseDiagnosticHostedIdentity.event,
      headBranch: crawlPhaseDiagnosticHostedIdentity.headBranch,
      headSha: preflight.workflowSource.commitSha,
      runId: run.id,
      runAttempt: crawlPhaseDiagnosticHostedIdentity.runAttempt,
      status: "completed",
      conclusion: run.conclusion,
      createdAt: run.createdAt,
      runStartedAt: run.runStartedAt,
      completedAt: run.completedAt,
    },
    oneShot,
    comparisonEvidence: comparison.receipt,
    contract: contract.receipt,
    workflowSource: source,
    execution: projectExecution(preflight.execution),
    job: job.receipt,
    artifacts: artifactResult.artifacts,
    publicationOutcomes: structuredClone(
      crawlPhaseDiagnosticPublicationOutcomeAssetNames,
    ),
    claimBoundary: structuredClone(preflight.claimBoundary),
    verification: {
      exactPreregisteredRunIdentity: true,
      completeWorkflowRunsListing: true,
      exactlyOneInvocationAndNoRerun: true,
      firstAttemptOnly: true,
      immutableComparisonEvidencePredatesContract: true,
      immutableContractPredatesRun: true,
      contractCommitHasSoleEvidenceParent: true,
      sourceCommitHasSoleComparisonWorkflowParent: true,
      workflowMirrorMatchesSourceBlob: true,
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
  return assertCrawlPhaseDiagnosticHostedProvenanceReceipt(deepFreeze(receipt));
}

export function assertCrawlPhaseDiagnosticHostedProvenanceReceipt(value) {
  exactKeys(value, [
    "schema", "status", "outcomeClass", "artifactMode", "producer",
    "oneShot", "comparisonEvidence", "contract", "workflowSource",
    "execution", "job", "artifacts", "publicationOutcomes",
    "claimBoundary", "verification",
  ], "diagnostic hosted provenance receipt");
  if (
    value.schema !== crawlPhaseDiagnosticHostedProvenanceSchema ||
    value.status !== "passed"
  ) {
    throw new TypeError("Diagnostic hosted provenance receipt is not passed");
  }
  assertReceiptProducer(value.producer);
  assertReceiptOneShot(value.oneShot, value.producer.runId);
  assertReceiptComparison(value.comparisonEvidence, value.producer.createdAt);
  assertReceiptContract(
    value.contract,
    value.comparisonEvidence.publishedAt,
    value.producer.createdAt,
  );
  assertReceiptWorkflowSource(value.workflowSource, value.producer);
  assertReceiptExecution(value.execution);
  assertReceiptJob(value.job, value.producer, value.artifactMode);
  assertReceiptArtifacts(
    value.artifacts,
    value.artifactMode,
    value.outcomeClass,
    value.producer,
  );
  if (!isDeepStrictEqual(
    value.publicationOutcomes,
    crawlPhaseDiagnosticPublicationOutcomeAssetNames,
  )) {
    throw new TypeError("Diagnostic hosted publication outcome inventories changed");
  }
  assertClaimBoundary(value.claimBoundary);
  const verificationKeys = [
    "exactPreregisteredRunIdentity", "completeWorkflowRunsListing",
    "exactlyOneInvocationAndNoRerun", "firstAttemptOnly",
    "immutableComparisonEvidencePredatesContract", "immutableContractPredatesRun",
    "contractCommitHasSoleEvidenceParent",
    "sourceCommitHasSoleComparisonWorkflowParent", "workflowMirrorMatchesSourceBlob",
    "comparisonWorkflowBlobPreserved", "contractAssetBlobsMatchCommit",
    "exactlyOneNativeUbuntuJob",
    "comparisonRunAndJobIdsRejected", "artifactSetMatchesTerminalOutcome",
    "expiredArtifactsRejected", "retriesRejected", "sleepsRejected",
    "fallbacksRejected", "discardedObservationsRejected",
    "statisticsAndPoolingRejected", "urlsRetained",
  ];
  exactKeys(value.verification, verificationKeys, "diagnostic hosted verification");
  for (const key of verificationKeys) {
    if (value.verification[key] !== (key === "urlsRetained" ? false : true)) {
      throw new TypeError(`Diagnostic hosted verification claim changed: ${key}`);
    }
  }
  assertUrlFree(value);
  return deepFreeze(value);
}

/**
 * Cross-binds the immutable preregistration parsed by the public verifier to
 * the URL-free hosted receipt retained in the evidence release.
 */
export function assertCrawlPhaseDiagnosticPreflightHostedBinding(
  preflightValue,
  receiptValue,
  contractAssetIdentity = {},
) {
  const preflight = verifyPreflight(preflightValue);
  const hosted = assertCrawlPhaseDiagnosticHostedProvenanceReceipt(receiptValue);
  const rawWorkflowIdentity = contractAssetIdentity.workflow ??
    contractAssetIdentity.assets?.find(
      ({ name }) => name === crawlPhaseDiagnosticContractIdentity.assets.workflow,
    );
  const workflow = {
    bytes: rawWorkflowIdentity?.bytes,
    sha256: rawWorkflowIdentity?.sha256,
    blobSha: rawWorkflowIdentity?.blobSha,
  };
  exactKeys(workflow, ["bytes", "sha256", "blobSha"],
    "diagnostic contract workflow asset identity");
  if (
    !Number.isSafeInteger(workflow.bytes) || workflow.bytes < 1 ||
    !sha256Pattern.test(workflow.sha256 ?? "") ||
    !gitShaPattern.test(workflow.blobSha ?? "") ||
    workflow.blobSha !== preflight.workflowSource.workflow.blobSha ||
    hosted.workflowSource.workflow.bytes !== workflow.bytes ||
    hosted.workflowSource.workflow.sha256 !== workflow.sha256 ||
    hosted.workflowSource.workflow.blobSha !== workflow.blobSha
  ) {
    throw new TypeError("Diagnostic contract workflow asset differs from hosted receipt");
  }
  const source = preflight.workflowSource;
  const sourceProjection = {
    repository: hosted.workflowSource.repository,
    branch: hosted.workflowSource.branch,
    ref: hosted.workflowSource.ref,
    commitSha: hosted.workflowSource.commitSha,
    parentCommitSha: hosted.workflowSource.soleParentSha,
    treeSha: hosted.workflowSource.treeSha,
    changedFiles: [structuredClone(hosted.workflowSource.changedFile)],
    workflow: {
      path: hosted.workflowSource.workflow.path,
      blobSha: hosted.workflowSource.workflow.blobSha,
      name: hosted.workflowSource.workflow.name,
      jobId: hosted.workflowSource.workflow.jobId,
      jobName: hosted.workflowSource.workflow.jobName,
    },
    preservedComparisonWorkflow: structuredClone(
      hosted.workflowSource.preservedComparisonWorkflow,
    ),
  };
  if (!isDeepStrictEqual(sourceProjection, source)) {
    throw new TypeError("Diagnostic preflight workflow source differs from hosted receipt");
  }
  if (
    hosted.producer.headSha !== source.commitSha ||
    hosted.producer.headBranch !== source.branch ||
    hosted.producer.event !== preflight.execution.event ||
    hosted.producer.runAttempt !== preflight.execution.runAttempt ||
    hosted.job.key !== source.workflow.jobId ||
    hosted.job.name !== source.workflow.jobName ||
    !isDeepStrictEqual(hosted.job.labels, preflight.execution.runnerLabels)
  ) {
    throw new TypeError("Diagnostic preflight execution identity differs from hosted receipt");
  }
  if (!isDeepStrictEqual(hosted.execution, projectExecution(preflight.execution))) {
    throw new TypeError("Diagnostic preflight execution policy differs from hosted receipt");
  }
  if (
    !isDeepStrictEqual(hosted.publicationOutcomes, preflight.publicationOutcomes) ||
    !isDeepStrictEqual(hosted.claimBoundary, preflight.claimBoundary)
  ) {
    throw new TypeError("Diagnostic preflight publication boundary differs from hosted receipt");
  }
  const comparison = preflight.comparisonEvidence;
  if (
    hosted.comparisonEvidence.repository !== comparison.repository ||
    hosted.comparisonEvidence.releaseId !== comparison.releaseId ||
    hosted.comparisonEvidence.tag !== comparison.tag ||
    hosted.comparisonEvidence.targetCommitSha !== comparison.targetCommitSha ||
    hosted.comparisonEvidence.targetTreeSha !== comparison.targetTreeSha
  ) {
    throw new TypeError("Diagnostic preflight comparison evidence differs from hosted receipt");
  }
  for (const input of comparison.assets) {
    const selected = Object.values(hosted.comparisonEvidence.selectedAssets)
      .find(({ name }) => name === input.name);
    if (
      selected === undefined || selected.sizeInBytes !== input.bytes ||
      selected.digest !== `sha256:${input.sha256}`
    ) {
      throw new TypeError("Diagnostic preflight comparison input differs from hosted receipt");
    }
  }
  const contract = preflight.diagnosticContract;
  const preflightIdentity = fileIdentity(
    Buffer.from(`${JSON.stringify(preflight, null, 2)}\n`, "utf8"),
  );
  const retainedPreflightAsset = hosted.contract.assets.find(
    ({ name }) => name === crawlPhaseDiagnosticContractIdentity.assets.preflight,
  );
  if (
    hosted.contract.repository !== contract.repository ||
    hosted.contract.tag !== contract.tag ||
    hosted.contract.soleParentSha !== contract.parentCommitSha ||
    hosted.contract.preflightSha256 !== preflightIdentity.sha256 ||
    retainedPreflightAsset?.sizeInBytes !== preflightIdentity.bytes ||
    retainedPreflightAsset?.digest !== `sha256:${preflightIdentity.sha256}` ||
    !isDeepStrictEqual(
      hosted.contract.assets.map(({ name }) => name),
      contract.releaseAssetNames,
    )
  ) {
    throw new TypeError("Diagnostic preflight contract identity differs from hosted receipt");
  }
  const bundle = preflight.actionsArtifacts.bundle;
  if (
    hosted.artifacts.some(({ name }) => name !== bundle.name) ||
    (hosted.artifactMode === "no_artifact" && hosted.artifacts.length !== 0) ||
    (hosted.artifactMode !== "no_artifact" && hosted.artifacts.length !== 1)
  ) {
    throw new TypeError("Diagnostic preflight Actions bundle differs from hosted receipt");
  }
  return hosted;
}

/**
 * Rebinds the raw API snapshots retained for publication to an already
 * verified URL-free receipt. Contract/source blob contents are intentionally
 * outside the publication payload; their exact blob identities remain bound
 * through the receipt and the retained commit records.
 */
export function assertCrawlPhaseDiagnosticRetainedApiBinding({
  receipt,
  runRecord,
  workflowRunsListing,
  jobsListing,
  artifactsListing,
  workflowSourceCommitRecord,
  diagnosticContractReleaseRecord,
  diagnosticContractCommitRecord,
  comparisonEvidenceReleaseRecord,
  comparisonEvidenceCommitRecord,
} = {}) {
  const hosted = assertCrawlPhaseDiagnosticHostedProvenanceReceipt(receipt);
  const preflightProjection = {
    workflowSource: {
      commitSha: hosted.workflowSource.commitSha,
      parentCommitSha: hosted.workflowSource.soleParentSha,
      treeSha: hosted.workflowSource.treeSha,
      workflow: {
        path: hosted.workflowSource.workflow.path,
        blobSha: hosted.workflowSource.workflow.blobSha,
      },
    },
  };
  const run = verifyRunRecord(runRecord, preflightProjection);
  const producer = {
    repository: crawlPhaseDiagnosticHostedIdentity.repository,
    repositoryId: run.repositoryId,
    workflowId: run.workflowId,
    workflowName: crawlPhaseDiagnosticHostedIdentity.workflow.name,
    workflowPath: crawlPhaseDiagnosticHostedIdentity.workflow.path,
    event: crawlPhaseDiagnosticHostedIdentity.event,
    headBranch: crawlPhaseDiagnosticHostedIdentity.headBranch,
    headSha: hosted.workflowSource.commitSha,
    runId: run.id,
    runAttempt: 1,
    status: "completed",
    conclusion: run.conclusion,
    createdAt: run.createdAt,
    runStartedAt: run.runStartedAt,
    completedAt: run.completedAt,
  };
  if (!isDeepStrictEqual(producer, hosted.producer)) {
    throw new TypeError("Retained diagnostic run record differs from hosted receipt");
  }
  const oneShot = verifyWorkflowRunsListing(workflowRunsListing, run, preflightProjection);
  if (!isDeepStrictEqual(oneShot, hosted.oneShot)) {
    throw new TypeError("Retained diagnostic workflow-runs listing differs from hosted receipt");
  }
  const job = verifyJobsListing(jobsListing, run, preflightProjection);
  if (!isDeepStrictEqual(job.receipt, hosted.job)) {
    throw new TypeError("Retained diagnostic jobs listing differs from hosted receipt");
  }
  const artifacts = verifyArtifactsListing(artifactsListing, run, job);
  if (
    artifacts.mode !== hosted.artifactMode || artifacts.outcomeClass !== hosted.outcomeClass ||
    !isDeepStrictEqual(artifacts.artifacts, hosted.artifacts)
  ) {
    throw new TypeError("Retained diagnostic artifacts listing differs from hosted receipt");
  }

  const sourceCommit = verifyCommit(workflowSourceCommitRecord, {
    repository: hosted.workflowSource.repository,
    expectedSha: hosted.workflowSource.commitSha,
    expectedTreeSha: hosted.workflowSource.treeSha,
    label: "retained diagnostic workflow source commit",
  });
  if (
    sourceCommit.parents.length !== 1 ||
    sourceCommit.parents[0] !== hosted.workflowSource.soleParentSha
  ) throw new TypeError("Retained diagnostic workflow source parent differs from hosted receipt");
  verifySourceCommitFiles(workflowSourceCommitRecord, {
    repository: hosted.workflowSource.repository,
    commitSha: hosted.workflowSource.commitSha,
    workflow: hosted.workflowSource.workflow,
  });

  const contractRelease = verifyImmutableRelease(diagnosticContractReleaseRecord, {
    repository: hosted.contract.repository,
    tag: hosted.contract.tag,
    releaseId: hosted.contract.releaseId,
    targetCommitSha: hosted.contract.targetCommitSha,
    expectedAssetNames: hosted.contract.assets.map(({ name }) => name),
    label: "retained diagnostic contract release",
  });
  const contractCommit = verifyCommit(diagnosticContractCommitRecord, {
    repository: hosted.contract.repository,
    expectedSha: hosted.contract.targetCommitSha,
    expectedTreeSha: hosted.contract.treeSha,
    label: "retained diagnostic contract commit",
  });
  if (
    contractCommit.parents.length !== 1 ||
    contractCommit.parents[0] !== hosted.contract.soleParentSha ||
    contractRelease.publishedAt !== hosted.contract.publishedAt
  ) throw new TypeError("Retained diagnostic contract commit/release differs from hosted receipt");
  assertReleaseMetadataMatchesReceipt(contractRelease.assets, hosted.contract.assets,
    "retained diagnostic contract assets");
  verifyRetainedContractCommitFiles(diagnosticContractCommitRecord, hosted.contract.assets);

  const comparison = hosted.comparisonEvidence;
  const comparisonRelease = verifyImmutableRelease(comparisonEvidenceReleaseRecord, {
    repository: comparison.repository,
    tag: comparison.tag,
    releaseId: comparison.releaseId,
    targetCommitSha: comparison.targetCommitSha,
    expectedAssetNames: performanceReplicationPublicationAssetNames,
    label: "retained comparison evidence release",
  });
  const comparisonCommit = verifyCommit(comparisonEvidenceCommitRecord, {
    repository: comparison.repository,
    expectedSha: comparison.targetCommitSha,
    expectedTreeSha: comparison.targetTreeSha,
    label: "retained comparison evidence commit",
  });
  if (
    comparisonCommit.sha !== comparison.targetCommitSha ||
    comparisonRelease.publishedAt !== comparison.publishedAt
  ) throw new TypeError("Retained comparison release/commit differs from hosted receipt");
  for (const selected of Object.values(comparison.selectedAssets)) {
    const metadata = comparisonRelease.assets.get(selected.name);
    if (!isDeepStrictEqual(metadata, {
      id: selected.id,
      sizeInBytes: selected.sizeInBytes,
      digest: selected.digest,
    })) throw new TypeError("Retained comparison selected asset differs from hosted receipt");
  }
  return hosted;
}

function verifyContractAssetInputs(value) {
  exactKeys(value, ["protocol", "workflow", "preflight"], "diagnostic contract assets");
  const protocol = exactBuffer(value.protocol, "diagnostic protocol asset bytes");
  const workflow = exactBuffer(value.workflow, "diagnostic workflow mirror bytes");
  exactKeys(value.preflight, ["value", "bytes"], "diagnostic preflight asset");
  const preflightBytes = exactBuffer(value.preflight.bytes, "diagnostic preflight bytes");
  assertCanonicalJsonBytes(value.preflight.value, preflightBytes, "diagnostic preflight");
  assertUtf8Text(protocol, "diagnostic protocol asset");
  assertUtf8Text(workflow, "diagnostic workflow mirror");
  return { protocol, workflow, preflight: { value: value.preflight.value, bytes: preflightBytes } };
}

function verifyComparisonAssetInputs(value) {
  exactKeys(value, ["artifactBinding", "freshCrawlRaw"], "comparison evidence inputs");
  const output = {};
  for (const key of ["artifactBinding", "freshCrawlRaw"]) {
    const bytes = exactBuffer(value[key], `comparison ${key} bytes`);
    const parsed = parseCanonicalJson(bytes, `comparison ${key}`);
    output[key] = { bytes, parsed, identity: fileIdentity(bytes) };
  }
  return output;
}

function verifyPreflight(value) {
  exactKeys(value, [
    "schema", "status", "comparisonEvidence", "diagnosticContract",
    "workflowSource", "execution", "actionsArtifacts", "publicationOutcomes",
    "claimBoundary",
  ], "diagnostic preflight");
  if (value.schema !== crawlPhaseDiagnosticPreflightSchema || value.status !== "preregistered") {
    throw new TypeError("Diagnostic preflight identity changed");
  }
  verifyPreflightComparison(value.comparisonEvidence);
  verifyPreflightContract(value.diagnosticContract);
  verifyPreflightWorkflowSource(value.workflowSource);
  verifyPreflightExecution(value.execution);
  verifyPreflightArtifacts(value.actionsArtifacts);
  if (!isDeepStrictEqual(
    value.publicationOutcomes,
    crawlPhaseDiagnosticPublicationOutcomeAssetNames,
  )) {
    throw new TypeError("Diagnostic preflight publication outcome inventories changed");
  }
  assertClaimBoundary(value.claimBoundary);
  return value;
}

function verifyPreflightComparison(value) {
  exactKeys(value, [
    "repository", "releaseId", "tag", "targetCommitSha", "targetTreeSha", "assets",
  ], "diagnostic preflight comparison evidence");
  const expected = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  if (
    value.repository !== expected.repository || value.releaseId !== expected.releaseId ||
    value.tag !== expected.tag || value.targetCommitSha !== expected.targetCommitSha ||
    value.targetTreeSha !== expected.targetTreeSha || !Array.isArray(value.assets) ||
    value.assets.length !== 2
  ) {
    throw new TypeError("Diagnostic preflight comparison evidence changed");
  }
  const expectedAssets = [expected.assets.artifactBinding, expected.assets.freshCrawlRaw]
    .map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }));
  if (!isDeepStrictEqual(value.assets, expectedAssets)) {
    throw new TypeError("Diagnostic preflight comparison input identities changed");
  }
}

function verifyPreflightContract(value) {
  exactKeys(value, [
    "repository", "parentCommitSha", "tag", "evidenceTag", "releaseAssetNames",
  ], "diagnostic preflight contract");
  const expected = crawlPhaseDiagnosticContractIdentity;
  const expectedNames = Object.values(expected.assets).sort(compareUtf8);
  if (
    value.repository !== expected.repository ||
    value.parentCommitSha !== expected.soleParentSha || value.tag !== expected.tag ||
    value.evidenceTag !== expected.evidenceTag ||
    !isDeepStrictEqual(value.releaseAssetNames, expectedNames)
  ) {
    throw new TypeError("Diagnostic preflight contract identity changed");
  }
}

function verifyPreflightWorkflowSource(value) {
  exactKeys(value, [
    "repository", "branch", "ref", "commitSha", "parentCommitSha", "treeSha",
    "changedFiles", "workflow", "preservedComparisonWorkflow",
  ], "diagnostic preflight workflow source");
  exactKeys(value.workflow, [
    "path", "blobSha", "name", "jobId", "jobName",
  ], "diagnostic preflight workflow");
  exactKeys(value.preservedComparisonWorkflow, ["path", "blobSha"],
    "diagnostic preflight preserved comparison workflow");
  const expected = crawlPhaseDiagnosticHostedIdentity;
  if (
    value.repository !== expected.repository || value.branch !== expected.headBranch ||
    value.ref !== expected.headRef || !gitShaPattern.test(value.commitSha ?? "") ||
    value.commitSha === value.parentCommitSha ||
    value.parentCommitSha !== performanceReplicationHostedIdentity.headSha ||
    !gitShaPattern.test(value.treeSha ?? "") ||
    !isDeepStrictEqual(value.changedFiles, [{ status: "added", path: expected.workflow.path }]) ||
    value.workflow.path !== expected.workflow.path ||
    !gitShaPattern.test(value.workflow.blobSha ?? "") ||
    value.workflow.name !== expected.workflow.name || value.workflow.jobId !== expected.job.id ||
    value.workflow.jobName !== expected.job.name ||
    value.preservedComparisonWorkflow.path !== comparisonWorkflowPath ||
    !gitShaPattern.test(value.preservedComparisonWorkflow.blobSha ?? "") ||
    value.preservedComparisonWorkflow.blobSha === value.workflow.blobSha
  ) {
    throw new TypeError("Diagnostic preflight workflow source identity changed");
  }
}

function verifyPreflightExecution(value) {
  exactKeys(value, [
    "event", "runAttempt", "runnerLabels", "runnerOs", "runnerArch", "nodeVersion",
    "comparisonRunId", "comparisonCrawlJobId", "order", "warmups", "retries",
    "sleeps", "fallbacks", "discardedObservations", "statistics", "pooling",
  ], "diagnostic preflight execution");
  const expected = crawlPhaseDiagnosticHostedIdentity;
  if (
    value.event !== expected.event || value.runAttempt !== 1 ||
    !isDeepStrictEqual(value.runnerLabels, expected.job.labels) ||
    value.runnerOs !== "Linux" || value.runnerArch !== "X64" ||
    value.nodeVersion !== "22.20.0" ||
    value.comparisonRunId !== expected.comparison.runId ||
    value.comparisonCrawlJobId !== expected.comparison.crawlJobId ||
    !isDeepStrictEqual(value.order, ["crawlee", "stasis"]) || value.warmups !== 0 ||
    value.retries !== false || value.sleeps !== false || value.fallbacks !== false ||
    value.discardedObservations !== false || value.statistics !== false ||
    value.pooling !== "none"
  ) {
    throw new TypeError("Diagnostic preflight execution boundary changed");
  }
}

function verifyPreflightArtifacts(value) {
  exactKeys(value, ["bundle"], "diagnostic preflight Actions artifacts");
  const expected = {
    bundle: {
      name: crawlPhaseDiagnosticExpectedArtifactNames[0],
      availability: "outcome_dependent",
      validRequiredEntries: crawlPhaseDiagnosticArtifactEntries.valid,
      invalidRequiredEntries: crawlPhaseDiagnosticArtifactEntries.status,
      optionalEntries: [],
    },
  };
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError("Diagnostic preflight Actions artifact contract changed");
  }
}

function verifyComparisonEvidencePublication({ release, commit, tagRef, assets, preflight }) {
  const expected = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  const verifiedRelease = verifyImmutableRelease(release, {
    repository: expected.repository,
    tag: expected.tag,
    releaseId: expected.releaseId,
    targetCommitSha: expected.targetCommitSha,
    expectedAssetNames: performanceReplicationPublicationAssetNames,
    label: "comparison evidence release",
  });
  const verifiedCommit = verifyCommit(commit, {
    repository: expected.repository,
    expectedSha: expected.targetCommitSha,
    expectedTreeSha: expected.targetTreeSha,
    label: "comparison evidence commit",
  });
  verifyLightweightTagRef(tagRef, {
    repository: expected.repository,
    tag: expected.tag,
    targetSha: expected.targetCommitSha,
    label: "comparison evidence tag",
  });
  const selected = {};
  for (const key of ["artifactBinding", "freshCrawlRaw"]) {
    const identity = expected.assets[key];
    const input = assets[key];
    if (!isDeepStrictEqual(input.identity, { bytes: identity.bytes, sha256: identity.sha256 })) {
      throw new TypeError(`Comparison ${identity.name} exact bytes changed`);
    }
    const metadata = verifiedRelease.assets.get(identity.name);
    if (
      metadata.id !== identity.id || metadata.sizeInBytes !== identity.bytes ||
      metadata.digest !== `sha256:${identity.sha256}`
    ) {
      throw new TypeError(`Comparison ${identity.name} release metadata changed`);
    }
    selected[key] = {
      name: identity.name,
      id: identity.id,
      sizeInBytes: identity.bytes,
      digest: `sha256:${identity.sha256}`,
    };
  }
  if (
    preflight.comparisonEvidence.targetCommitSha !== verifiedCommit.sha ||
    preflight.comparisonEvidence.targetTreeSha !== verifiedCommit.treeSha
  ) {
    throw new TypeError("Comparison evidence commit differs from the preflight");
  }
  return {
    publishedAtMilliseconds: verifiedRelease.publishedAtMilliseconds,
    receipt: {
      repository: expected.repository, releaseId: expected.releaseId, tag: expected.tag,
      immutable: true, draft: false, prerelease: false,
      publishedAt: verifiedRelease.publishedAt, targetCommitSha: verifiedCommit.sha,
      targetTreeSha: verifiedCommit.treeSha,
      selectedAssets: selected,
    },
  };
}

function verifyDiagnosticContractPublication({ release, commit, tagRef, assets, preflight }) {
  const expected = crawlPhaseDiagnosticContractIdentity;
  const expectedNames = Object.values(expected.assets).sort(compareUtf8);
  const verifiedRelease = verifyImmutableRelease(release, {
    repository: expected.repository,
    tag: expected.tag,
    targetCommitSha: undefined,
    expectedAssetNames: expectedNames,
    label: "diagnostic contract release",
  });
  const verifiedCommit = verifyCommit(commit, {
    repository: expected.repository,
    expectedSha: verifiedRelease.targetCommitSha,
    label: "diagnostic contract commit",
  });
  if (
    verifiedCommit.parents.length !== 1 ||
    verifiedCommit.parents[0] !== expected.soleParentSha
  ) {
    throw new TypeError("Diagnostic contract commit must have sole comparison-evidence parent");
  }
  verifyLightweightTagRef(tagRef, {
    repository: expected.repository,
    tag: expected.tag,
    targetSha: verifiedCommit.sha,
    label: "diagnostic contract tag",
  });
  const byName = {
    [expected.assets.protocol]: assets.protocol,
    [expected.assets.workflow]: assets.workflow,
    [expected.assets.preflight]: assets.preflight.bytes,
  };
  const commitFiles = verifyContractCommitAssets(commit, verifiedCommit.sha, byName);
  const projectedAssets = expectedNames.map((name) => {
    const identity = fileIdentity(byName[name]);
    const metadata = verifiedRelease.assets.get(name);
    if (
      metadata.sizeInBytes !== identity.bytes ||
      metadata.digest !== `sha256:${identity.sha256}`
    ) {
      throw new TypeError(`Diagnostic contract asset bytes differ from release: ${name}`);
    }
    const committed = commitFiles.get(name);
    return {
      name,
      path: committed.path,
      blobSha: committed.blobSha,
      id: metadata.id,
      sizeInBytes: identity.bytes,
      digest: metadata.digest,
    };
  });
  if (preflight.diagnosticContract.parentCommitSha !== expected.soleParentSha) {
    throw new TypeError("Diagnostic contract preflight parent changed");
  }
  return {
    publishedAtMilliseconds: verifiedRelease.publishedAtMilliseconds,
    receipt: {
      repository: expected.repository, tag: expected.tag,
      releaseId: verifiedRelease.id, immutable: true, draft: false, prerelease: false,
      publishedAt: verifiedRelease.publishedAt, targetCommitSha: verifiedCommit.sha,
      soleParentSha: expected.soleParentSha, treeSha: verifiedCommit.treeSha,
      assets: projectedAssets,
      preflightSha256: fileIdentity(assets.preflight.bytes).sha256,
    },
  };
}

function verifyWorkflowSource({
  commit, tree, workflowBlob, workflowBytes, preservedBlob, mirrorBytes, preflight,
}) {
  const source = preflight.workflowSource;
  const verifiedCommit = verifyCommit(commit, {
    repository: source.repository,
    expectedSha: source.commitSha,
    expectedTreeSha: source.treeSha,
    label: "diagnostic workflow source commit",
  });
  if (verifiedCommit.parents.length !== 1 || verifiedCommit.parents[0] !== source.parentCommitSha) {
    throw new TypeError("Diagnostic workflow source commit parent changed");
  }
  verifySourceCommitFiles(commit, source);
  verifyRecursiveTree(tree, source);
  verifyGitBlob(workflowBlob, {
    repository: source.repository,
    expectedSha: source.workflow.blobSha,
    expectedBytes: workflowBytes,
    label: "diagnostic workflow blob",
  });
  verifyGitBlob(preservedBlob, {
    repository: source.repository,
    expectedSha: source.preservedComparisonWorkflow.blobSha,
    label: "preserved comparison workflow blob",
  });
  if (!workflowBytes.equals(mirrorBytes)) {
    throw new TypeError("Diagnostic workflow source bytes differ from contract mirror bytes");
  }
  const identity = fileIdentity(workflowBytes);
  return {
    repository: source.repository,
    branch: source.branch,
    ref: source.ref,
    commitSha: source.commitSha,
    soleParentSha: source.parentCommitSha,
    treeSha: source.treeSha,
    changedFile: { status: "added", path: source.workflow.path },
    workflow: {
      path: source.workflow.path, blobSha: source.workflow.blobSha,
      bytes: identity.bytes, sha256: identity.sha256,
      name: source.workflow.name, jobId: source.workflow.jobId,
      jobName: source.workflow.jobName,
    },
    preservedComparisonWorkflow: structuredClone(source.preservedComparisonWorkflow),
  };
}

function verifyRunRecord(value, preflight) {
  const run = requireRecord(value, "diagnostic workflow run");
  const repository = verifyRepository(run.repository, crawlPhaseDiagnosticHostedIdentity.repository,
    "diagnostic run repository");
  const headRepository = verifyRepository(run.head_repository,
    crawlPhaseDiagnosticHostedIdentity.repository, "diagnostic run head repository");
  const workflowId = positiveSafeInteger(run.workflow_id, "diagnostic workflow ID");
  const checks = [
    [headRepository.id, repository.id, "head repository ID"],
    [run.run_attempt, 1, "run attempt"], [run.event, "push", "event"],
    [run.status, "completed", "status"],
    [run.head_branch, crawlPhaseDiagnosticHostedIdentity.headBranch, "head branch"],
    [run.head_sha, preflight.workflowSource.commitSha, "head SHA"],
    [run.path, crawlPhaseDiagnosticHostedIdentity.workflow.path, "workflow path"],
    [run.name, crawlPhaseDiagnosticHostedIdentity.workflow.name, "workflow name"],
  ];
  for (const [actual, expected, label] of checks) {
    if (actual !== expected) throw new TypeError(`Diagnostic run ${label} mismatch`);
  }
  const id = positiveSafeInteger(run.id, "diagnostic run ID");
  if (id === crawlPhaseDiagnosticHostedIdentity.comparison.runId) {
    throw new TypeError("Diagnostic run reuses comparison run ID");
  }
  const conclusion = terminalConclusion(run.conclusion, "diagnostic run conclusion");
  verifyRunUrls(run, id);
  const created = apiInstant(run.created_at, "diagnostic run created_at");
  const started = apiInstant(run.run_started_at, "diagnostic run run_started_at");
  const completed = apiInstant(run.updated_at, "diagnostic run updated_at");
  if (
    started.epochMilliseconds < created.epochMilliseconds ||
    completed.epochMilliseconds < started.epochMilliseconds
  ) {
    throw new TypeError("Diagnostic run timestamps are out of order");
  }
  return {
    id, repositoryId: repository.id, workflowId,
    headSha: preflight.workflowSource.commitSha,
    conclusion,
    createdAt: created.value, createdAtMilliseconds: created.epochMilliseconds,
    runStartedAt: started.value, runStartedAtMilliseconds: started.epochMilliseconds,
    completedAt: completed.value, completedAtMilliseconds: completed.epochMilliseconds,
  };
}

function verifyWorkflowRunsListing(value, selected, preflight) {
  const listing = requireRecord(value, "diagnostic workflow-runs listing");
  const total = nonnegativeSafeInteger(listing.total_count,
    "diagnostic workflow-runs total_count");
  if (!Array.isArray(listing.workflow_runs) || listing.workflow_runs.length !== total) {
    throw new TypeError("Diagnostic workflow-runs listing is not fully paginated");
  }
  if (total !== 1) {
    throw new TypeError(
      "Diagnostic workflow branch must have exactly one total invocation and no rerun",
    );
  }
  const ids = new Set();
  const invocations = [];
  for (const candidate of listing.workflow_runs) {
    requireRecord(candidate, "diagnostic enumerated workflow run");
    const id = positiveSafeInteger(candidate.id, "diagnostic enumerated run ID");
    if (ids.has(id)) throw new TypeError("Diagnostic workflow-runs listing duplicates a run ID");
    ids.add(id);
    if (candidate.workflow_id !== selected.workflowId) {
      throw new TypeError("Diagnostic workflow-runs listing contains another workflow ID");
    }
    verifyRunUrls(candidate, id);
    if (
      candidate.head_branch === crawlPhaseDiagnosticHostedIdentity.headBranch &&
      candidate.head_sha === preflight.workflowSource.commitSha &&
      candidate.event === crawlPhaseDiagnosticHostedIdentity.event
    ) {
      invocations.push(candidate);
    }
  }
  if (invocations.length !== 1 || invocations[0].run_attempt !== 1) {
    throw new TypeError("Diagnostic requires exactly one invocation and no rerun");
  }
  const match = invocations[0];
  const checks = [
    [match.id, selected.id], [match.status, "completed"],
    [match.conclusion, selected.conclusion],
    [match.path, crawlPhaseDiagnosticHostedIdentity.workflow.path],
    [match.name, crawlPhaseDiagnosticHostedIdentity.workflow.name],
    [match.created_at, selected.createdAt], [match.run_started_at, selected.runStartedAt],
    [match.updated_at, selected.completedAt],
  ];
  if (checks.some(([actual, expected]) => actual !== expected)) {
    throw new TypeError("Diagnostic enumerated invocation differs from selected run");
  }
  verifyRepository(match.repository, crawlPhaseDiagnosticHostedIdentity.repository,
    "diagnostic enumerated repository");
  verifyRepository(match.head_repository, crawlPhaseDiagnosticHostedIdentity.repository,
    "diagnostic enumerated head repository");
  return {
    completeListing: true, enumeratedRunCount: total,
    invocationCount: 1, rerunCount: 0, selectedRunId: selected.id,
  };
}

function verifyJobsListing(value, run, preflight) {
  const listing = requireRecord(value, "diagnostic jobs listing");
  if (listing.total_count !== 1 || !Array.isArray(listing.jobs) || listing.jobs.length !== 1) {
    throw new TypeError("Diagnostic requires exactly one hosted job");
  }
  const job = requireRecord(listing.jobs[0], "diagnostic hosted job");
  const id = positiveSafeInteger(job.id, "diagnostic hosted job ID");
  if (id === crawlPhaseDiagnosticHostedIdentity.comparison.crawlJobId) {
    throw new TypeError("Diagnostic job reuses comparison crawl job ID");
  }
  const checks = [
    [job.name, crawlPhaseDiagnosticHostedIdentity.job.name, "name"],
    [job.run_id, run.id, "run ID"], [job.run_attempt, 1, "run attempt"],
    [job.head_sha, preflight.workflowSource.commitSha, "head SHA"],
    [job.workflow_name, crawlPhaseDiagnosticHostedIdentity.workflow.name, "workflow name"],
    [job.status, "completed", "status"], [job.conclusion, run.conclusion, "conclusion"],
  ];
  for (const [actual, expected, label] of checks) {
    if (actual !== expected) throw new TypeError(`Diagnostic hosted job ${label} mismatch`);
  }
  if (!isDeepStrictEqual(job.labels, crawlPhaseDiagnosticHostedIdentity.job.labels)) {
    throw new TypeError("Diagnostic hosted job is not the preregistered Ubuntu 22.04 label");
  }
  verifyExactUrl(job.url, `${apiRoot}/${crawlPhaseDiagnosticHostedIdentity.repository}/actions/jobs/${id}`,
    "diagnostic job API URL");
  verifyExactUrl(job.html_url,
    `${webRoot}/${crawlPhaseDiagnosticHostedIdentity.repository}/actions/runs/${run.id}/job/${id}`,
    "diagnostic job web URL");
  const started = apiInstant(job.started_at, "diagnostic job started_at");
  const completed = apiInstant(job.completed_at, "diagnostic job completed_at");
  if (
    started.epochMilliseconds < run.runStartedAtMilliseconds ||
    completed.epochMilliseconds < started.epochMilliseconds ||
    completed.epochMilliseconds > run.completedAtMilliseconds
  ) {
    throw new TypeError("Diagnostic hosted job timestamps are outside the run");
  }
  const stepResult = assertCrawlPhaseDiagnosticJobStepTopology(job);
  return {
    id,
    expectedArtifactMode: stepResult.artifactMode,
    receipt: {
      id, key: crawlPhaseDiagnosticHostedIdentity.job.id,
      name: crawlPhaseDiagnosticHostedIdentity.job.name,
      labels: [...crawlPhaseDiagnosticHostedIdentity.job.labels],
      status: "completed", conclusion: run.conclusion,
      startedAt: started.value, completedAt: completed.value,
      steps: stepResult.steps,
    },
  };
}

function verifyJobSteps(value, { jobStartedAt, jobCompletedAt, runConclusion }) {
  if (!Array.isArray(value)) {
    throw new TypeError("Diagnostic hosted job steps are unavailable");
  }
  const expected = expectedJobSteps(value);
  const jobStarted = apiInstant(jobStartedAt, "diagnostic job step lower bound");
  const jobCompleted = apiInstant(jobCompletedAt, "diagnostic job step upper bound");
  let priorCompleted = jobStarted.epochMilliseconds;
  const steps = value.map((raw, index) => {
    const step = requireRecord(raw, `diagnostic hosted job step ${index + 1}`);
    const identity = expected[index];
    if (
      step.number !== identity.number || step.name !== identity.name ||
      step.status !== "completed"
    ) {
      throw new TypeError(`Diagnostic hosted job step identity changed: ${identity.name}`);
    }
    if (!["success", "failure", "skipped"].includes(step.conclusion)) {
      throw new TypeError(`Diagnostic hosted job step conclusion is invalid: ${identity.name}`);
    }
    const started = apiInstant(step.started_at,
      `diagnostic hosted job step started_at: ${identity.name}`);
    const completed = apiInstant(step.completed_at,
      `diagnostic hosted job step completed_at: ${identity.name}`);
    if (
      started.epochMilliseconds < priorCompleted ||
      completed.epochMilliseconds < started.epochMilliseconds ||
      completed.epochMilliseconds > jobCompleted.epochMilliseconds
    ) {
      throw new TypeError(`Diagnostic hosted job step timestamps are out of order: ${identity.name}`);
    }
    priorCompleted = completed.epochMilliseconds;
    return {
      number: identity.number,
      name: identity.name,
      status: "completed",
      conclusion: step.conclusion,
      startedAt: started.value,
      completedAt: completed.value,
    };
  });
  return {
    steps,
    expectedArtifactMode: classifyJobStepMode(steps, runConclusion),
  };
}

function expectedJobSteps(value) {
  const identity = crawlPhaseDiagnosticJobStepIdentity;
  const core = [
    identity.setup,
    ...identity.preparation,
    identity.createOutcome,
    identity.sealBundle,
    identity.uploadBundle,
    identity.propagate,
  ];
  if (value.length < core.length + 1 || value.length > core.length + 3) {
    throw new TypeError("Diagnostic hosted job step topology length changed");
  }
  for (let index = 0; index < core.length; index += 1) {
    const step = requireRecord(value[index], `diagnostic hosted core job step ${index + 1}`);
    if (step.number !== core[index].number || step.name !== core[index].name) {
      throw new TypeError(`Diagnostic hosted job step identity changed: ${core[index].name}`);
    }
  }
  const postOptions = (mainConclusion, postIdentity) => {
    if (mainConclusion === "success") return [[postIdentity]];
    if (mainConclusion === "skipped") return [[]];
    if (mainConclusion === "failure") return [[], [postIdentity]];
    return [[postIdentity]];
  };
  const setupMain = value.find(({ number }) => number === identity.preparation[2].number);
  const checkoutMain = value.find(({ number }) => number === identity.preparation[1].number);
  const options = [];
  for (const setupPosts of postOptions(setupMain?.conclusion, identity.postSetupNode)) {
    for (const checkoutPosts of postOptions(checkoutMain?.conclusion, identity.postCheckout)) {
      options.push([...core, ...setupPosts, ...checkoutPosts, identity.complete]);
    }
  }
  const expected = options.find((candidate) =>
    candidate.length === value.length && candidate.every((entry, index) =>
      value[index]?.number === entry.number && value[index]?.name === entry.name
    )
  );
  if (expected === undefined) {
    throw new TypeError("Diagnostic hosted job step topology changed");
  }
  return expected;
}

function classifyJobStepMode(steps, runConclusion) {
  const identity = crawlPhaseDiagnosticJobStepIdentity;
  const byNumber = new Map(steps.map((step) => [step.number, step]));
  const conclusion = (stepIdentity) => byNumber.get(stepIdentity.number)?.conclusion;
  if (conclusion(identity.setup) !== "success") {
    throw new TypeError("Diagnostic hosted job setup did not complete successfully");
  }

  let firstFailure = -1;
  for (let index = 0; index < identity.preparation.length; index += 1) {
    const current = conclusion(identity.preparation[index]);
    if (firstFailure === -1 && current === "success") continue;
    if (firstFailure === -1 && current === "failure") {
      firstFailure = index;
      continue;
    }
    if (firstFailure !== -1 && current === "skipped") continue;
    throw new TypeError("Diagnostic hosted preparation step chain is not fail-closed");
  }

  const create = conclusion(identity.createOutcome);
  const seal = conclusion(identity.sealBundle);
  const upload = conclusion(identity.uploadBundle);
  const propagate = conclusion(identity.propagate);
  const postSetup = conclusion(identity.postSetupNode);
  const checkout = conclusion(identity.preparation[1]);
  const postCheckout = conclusion(identity.postCheckout);
  const complete = conclusion(identity.complete);
  const setupNode = conclusion(identity.preparation[2]);
  const expectedPostSetup = setupNode === "skipped" ||
    (setupNode === "failure" && postSetup === undefined)
    ? undefined : runConclusion === "success" ? "success" : "skipped";
  const expectedPostCheckout = checkout === "skipped" ||
    (checkout === "failure" && postCheckout === undefined)
    ? undefined : "success";
  if (
    postSetup !== expectedPostSetup || postCheckout !== expectedPostCheckout ||
    complete !== "success"
  ) {
    throw new TypeError("Diagnostic hosted cleanup step conclusions changed");
  }

  if (
    runConclusion === "success" && firstFailure === -1 &&
    create === "success" && seal === "success" && upload === "success" &&
    propagate === "skipped"
  ) return "bundle_valid";

  if (
    runConclusion === "failure" && firstFailure !== -1 &&
    create === "success" && seal === "success" && upload === "success" &&
    propagate === "failure"
  ) return "bundle_status";

  const infrastructureTail =
    (create === "failure" && seal === "skipped" && upload === "skipped") ||
    (create === "success" && seal === "failure" && upload === "skipped") ||
    (create === "success" && seal === "success" && upload === "failure");
  if (runConclusion === "failure" && infrastructureTail && propagate === "failure") {
    return "no_artifact";
  }
  throw new TypeError("Diagnostic hosted job step conclusions do not match a terminal mode");
}

function verifyArtifactsListing(value, run, job) {
  const listing = requireRecord(value, "diagnostic artifacts listing");
  const total = nonnegativeSafeInteger(listing.total_count, "diagnostic artifacts total_count");
  if (!Array.isArray(listing.artifacts) || listing.artifacts.length !== total || total > 1) {
    throw new TypeError("Diagnostic artifacts listing is incomplete or out of bounds");
  }
  const mode = job.expectedArtifactMode;
  const requiredCount = mode === "no_artifact" ? 0 : 1;
  if (total !== requiredCount) {
    if (mode === "no_artifact" && total === 1) {
      throw new TypeError(
        "Diagnostic artifact retained after an outcome, seal, or upload failure is ambiguous",
      );
    }
    throw new TypeError(`Diagnostic artifact count differs from terminal step mode: ${mode}`);
  }
  const expectedNames = requiredCount === 1 ? crawlPhaseDiagnosticExpectedArtifactNames : [];
  const byName = new Map();
  const ids = new Set();
  for (const artifact of listing.artifacts) {
    requireRecord(artifact, "diagnostic artifact");
    if (!expectedNames.includes(artifact.name) || byName.has(artifact.name)) {
      throw new TypeError("Diagnostic artifact name is unexpected or duplicated");
    }
    const id = positiveSafeInteger(artifact.id, `diagnostic artifact ID: ${artifact.name}`);
    if (ids.has(id) || id === job.id) throw new TypeError("Diagnostic artifact IDs are invalid");
    ids.add(id);
    const sizeInBytes = positiveSafeInteger(artifact.size_in_bytes,
      `diagnostic artifact size: ${artifact.name}`);
    if (artifact.expired !== false || !sha256DigestPattern.test(artifact.digest ?? "")) {
      throw new TypeError(`Diagnostic artifact is expired or unbound: ${artifact.name}`);
    }
    verifyExactUrl(artifact.url,
      `${apiRoot}/${crawlPhaseDiagnosticHostedIdentity.repository}/actions/artifacts/${id}`,
      `diagnostic artifact API URL: ${artifact.name}`);
    verifyExactUrl(artifact.archive_download_url,
      `${apiRoot}/${crawlPhaseDiagnosticHostedIdentity.repository}/actions/artifacts/${id}/zip`,
      `diagnostic artifact archive URL: ${artifact.name}`);
    const workflowRun = requireRecord(artifact.workflow_run,
      `diagnostic artifact workflow binding: ${artifact.name}`);
    const checks = [
      [workflowRun.id, run.id],
      [workflowRun.head_branch, crawlPhaseDiagnosticHostedIdentity.headBranch],
      [workflowRun.head_sha, runRecordHeadSha(run)],
      [workflowRun.repository_id, run.repositoryId],
      [workflowRun.head_repository_id, run.repositoryId],
    ];
    if (checks.some(([actual, expected]) => actual !== expected)) {
      throw new TypeError(`Diagnostic artifact workflow binding changed: ${artifact.name}`);
    }
    byName.set(artifact.name, { name: artifact.name, id, sizeInBytes, digest: artifact.digest });
  }
  const artifacts = expectedNames.map((name) => byName.get(name));
  const outcomeClass = {
    bundle_valid: "VALID_NON_AUTHORITATIVE",
    bundle_status: "DIAGNOSTIC_INVALID_WITH_STATUS",
    no_artifact: "INFRASTRUCTURE_INVALID_NO_ARTIFACT",
  }[mode];
  return { artifacts, outcomeClass, mode };
}

function runRecordHeadSha(run) {
  return run.headSha;
}

function verifyChronology(comparison, contract, run) {
  if (
    comparison.publishedAtMilliseconds >= contract.publishedAtMilliseconds ||
    contract.publishedAtMilliseconds >= run.createdAtMilliseconds ||
    contract.publishedAtMilliseconds >= run.runStartedAtMilliseconds
  ) {
    throw new TypeError("Comparison evidence, diagnostic contract, and run are not chronological");
  }
}

function verifyImmutableRelease(value, {
  repository, tag, releaseId, targetCommitSha, expectedAssetNames, label,
}) {
  const release = requireRecord(value, label);
  const id = positiveSafeInteger(release.id, `${label} ID`);
  if (releaseId !== undefined && id !== releaseId) throw new TypeError(`${label} ID changed`);
  if (
    release.tag_name !== tag || release.draft !== false || release.prerelease !== false ||
    release.immutable !== true || !gitShaPattern.test(release.target_commitish ?? "") ||
    (targetCommitSha !== undefined && release.target_commitish !== targetCommitSha)
  ) {
    throw new TypeError(`${label} identity is invalid`);
  }
  verifyReleaseUrls(release, { repository, tag, id, label });
  const published = apiInstant(release.published_at, `${label} published_at`);
  if (!Array.isArray(release.assets) || release.assets.length !== expectedAssetNames.length) {
    throw new TypeError(`${label} asset inventory length changed`);
  }
  const assets = new Map();
  const ids = new Set();
  for (const asset of release.assets) {
    requireRecord(asset, `${label} asset`);
    if (!expectedAssetNames.includes(asset.name) || assets.has(asset.name)) {
      throw new TypeError(`${label} asset name is unexpected or duplicated`);
    }
    const assetId = positiveSafeInteger(asset.id, `${label} asset ID`);
    if (ids.has(assetId)) throw new TypeError(`${label} asset ID is duplicated`);
    ids.add(assetId);
    const sizeInBytes = positiveSafeInteger(asset.size, `${label} asset size`);
    if (asset.state !== "uploaded" || !sha256DigestPattern.test(asset.digest ?? "")) {
      throw new TypeError(`${label} asset state or digest is invalid`);
    }
    verifyReleaseAssetUrls(asset, { repository, tag, name: asset.name, id: assetId, label });
    assets.set(asset.name, { id: assetId, sizeInBytes, digest: asset.digest });
  }
  if (assets.size !== expectedAssetNames.length) throw new TypeError(`${label} assets are incomplete`);
  return {
    id, targetCommitSha: release.target_commitish, publishedAt: published.value,
    publishedAtMilliseconds: published.epochMilliseconds, assets,
  };
}

function verifyCommit(value, { repository, expectedSha, expectedTreeSha, label }) {
  const commit = requireRecord(value, label);
  if (commit.sha !== expectedSha) throw new TypeError(`${label} SHA changed`);
  verifyExactUrl(commit.url, `${apiRoot}/${repository}/commits/${expectedSha}`, `${label} API URL`);
  verifyExactUrl(commit.html_url, `${webRoot}/${repository}/commit/${expectedSha}`, `${label} web URL`);
  const payload = requireRecord(commit.commit, `${label} payload`);
  const tree = requireRecord(payload.tree, `${label} tree`);
  if (!gitShaPattern.test(tree.sha ?? "") ||
    (expectedTreeSha !== undefined && tree.sha !== expectedTreeSha)) {
    throw new TypeError(`${label} tree SHA changed`);
  }
  verifyExactUrl(tree.url, `${apiRoot}/${repository}/git/trees/${tree.sha}`, `${label} tree URL`);
  if (!Array.isArray(commit.parents)) throw new TypeError(`${label} parents are invalid`);
  const parents = commit.parents.map((parent) => {
    requireRecord(parent, `${label} parent`);
    if (!gitShaPattern.test(parent.sha ?? "")) throw new TypeError(`${label} parent SHA is invalid`);
    verifyExactUrl(parent.url, `${apiRoot}/${repository}/commits/${parent.sha}`,
      `${label} parent API URL`);
    verifyExactUrl(parent.html_url, `${webRoot}/${repository}/commit/${parent.sha}`,
      `${label} parent web URL`);
    return parent.sha;
  });
  return { sha: expectedSha, treeSha: tree.sha, parents };
}

function verifyLightweightTagRef(value, { repository, tag, targetSha, label }) {
  const ref = requireRecord(value, label);
  const object = requireRecord(ref.object, `${label} object`);
  if (
    ref.ref !== `refs/tags/${tag}` || object.type !== "commit" || object.sha !== targetSha
  ) {
    throw new TypeError(`${label} is not the exact lightweight commit tag`);
  }
  verifyExactUrl(ref.url, `${apiRoot}/${repository}/git/refs/tags/${tag}`, `${label} URL`);
  verifyExactUrl(object.url, `${apiRoot}/${repository}/git/commits/${targetSha}`,
    `${label} object URL`);
}

function verifyContractCommitAssets(commit, targetSha, assets) {
  if (!Array.isArray(commit.files)) {
    throw new TypeError("Diagnostic contract commit changed files are unavailable");
  }
  const repository = crawlPhaseDiagnosticContractIdentity.repository;
  const expected = new Map(Object.entries(assets).map(([name, bytes]) => [
    `protocol/${name}`,
    { name, bytes, blobSha: gitBlobSha(bytes) },
  ]));
  const matched = new Map();
  const seenPaths = new Set();
  for (const file of commit.files) {
    requireRecord(file, "diagnostic contract commit changed file");
    if (typeof file.filename !== "string" || seenPaths.has(file.filename)) {
      throw new TypeError("Diagnostic contract commit changed-file paths are invalid or duplicated");
    }
    seenPaths.add(file.filename);
    const identity = expected.get(file.filename);
    if (identity === undefined) continue;
    if (file.status !== "added" || file.sha !== identity.blobSha) {
      throw new TypeError(`Diagnostic contract asset commit blob changed: ${identity.name}`);
    }
    verifyExactUrl(
      file.blob_url,
      `${webRoot}/${repository}/blob/${targetSha}/${file.filename}`,
      `diagnostic contract asset blob URL: ${identity.name}`,
    );
    verifyExactUrl(
      file.raw_url,
      `${webRoot}/${repository}/raw/${targetSha}/${file.filename}`,
      `diagnostic contract asset raw URL: ${identity.name}`,
    );
    verifyExactUrl(
      file.contents_url,
      `${apiRoot}/${repository}/contents/${file.filename}?ref=${targetSha}`,
      `diagnostic contract asset contents URL: ${identity.name}`,
    );
    matched.set(identity.name, {
      path: file.filename,
      blobSha: identity.blobSha,
    });
  }
  if (matched.size !== expected.size) {
    throw new TypeError("Diagnostic contract assets are not all exact added blobs in the tagged commit");
  }
  return matched;
}

function verifyRetainedContractCommitFiles(commit, assets) {
  if (!Array.isArray(commit.files)) {
    throw new TypeError("Retained diagnostic contract commit files are unavailable");
  }
  const expected = new Map(assets.map((asset) => [asset.path, asset.blobSha]));
  const matched = new Set();
  const seen = new Set();
  for (const file of commit.files) {
    requireRecord(file, "retained diagnostic contract changed file");
    if (typeof file.filename !== "string" || seen.has(file.filename)) {
      throw new TypeError("Retained diagnostic contract paths are invalid or duplicated");
    }
    seen.add(file.filename);
    if (!expected.has(file.filename)) continue;
    if (file.status !== "added" || file.sha !== expected.get(file.filename)) {
      throw new TypeError("Retained diagnostic contract asset blob differs from hosted receipt");
    }
    matched.add(file.filename);
  }
  if (matched.size !== expected.size) {
    throw new TypeError("Retained diagnostic contract omits an asset blob from hosted receipt");
  }
}

function assertReleaseMetadataMatchesReceipt(metadata, receiptAssets, label) {
  if (metadata.size !== receiptAssets.length) throw new TypeError(`${label} count changed`);
  for (const asset of receiptAssets) {
    const retained = metadata.get(asset.name);
    if (!isDeepStrictEqual(retained, {
      id: asset.id,
      sizeInBytes: asset.sizeInBytes,
      digest: asset.digest,
    })) throw new TypeError(`${label} differ from the hosted receipt`);
  }
}

function verifySourceCommitFiles(commit, source) {
  if (!Array.isArray(commit.files) || commit.files.length !== 1) {
    throw new TypeError("Diagnostic workflow source commit must change exactly one file");
  }
  const file = requireRecord(commit.files[0], "diagnostic workflow source changed file");
  if (
    file.status !== "added" || file.filename !== source.workflow.path ||
    file.sha !== source.workflow.blobSha
  ) {
    throw new TypeError("Diagnostic workflow source changed-file identity changed");
  }
  const repository = source.repository;
  verifyExactUrl(file.blob_url,
    `${webRoot}/${repository}/blob/${source.commitSha}/${source.workflow.path}`,
    "diagnostic workflow source blob web URL");
  verifyExactUrl(file.raw_url,
    `${webRoot}/${repository}/raw/${source.commitSha}/${source.workflow.path}`,
    "diagnostic workflow source raw URL");
  verifyExactUrl(file.contents_url,
    `${apiRoot}/${repository}/contents/${source.workflow.path}?ref=${source.commitSha}`,
    "diagnostic workflow source contents URL");
}

function verifyRecursiveTree(value, source) {
  const tree = requireRecord(value, "diagnostic workflow source recursive tree");
  if (tree.sha !== source.treeSha || tree.truncated !== false || !Array.isArray(tree.tree)) {
    throw new TypeError("Diagnostic workflow source recursive tree is incomplete");
  }
  verifyExactUrl(tree.url, `${apiRoot}/${source.repository}/git/trees/${source.treeSha}`,
    "diagnostic workflow source tree URL");
  const expected = new Map([
    [source.workflow.path, source.workflow.blobSha],
    [source.preservedComparisonWorkflow.path, source.preservedComparisonWorkflow.blobSha],
  ]);
  const matches = new Map();
  for (const entry of tree.tree) {
    requireRecord(entry, "diagnostic workflow source tree entry");
    if (!expected.has(entry.path)) continue;
    if (matches.has(entry.path)) throw new TypeError("Diagnostic workflow tree duplicates a bound path");
    const expectedSha = expected.get(entry.path);
    if (
      entry.mode !== "100644" || entry.type !== "blob" || entry.sha !== expectedSha
    ) {
      throw new TypeError(`Diagnostic workflow tree entry changed: ${entry.path}`);
    }
    verifyExactUrl(entry.url, `${apiRoot}/${source.repository}/git/blobs/${expectedSha}`,
      `diagnostic workflow tree blob URL: ${entry.path}`);
    matches.set(entry.path, true);
  }
  if (matches.size !== expected.size) throw new TypeError("Diagnostic workflow tree omits a bound workflow");
}

function verifyGitBlob(value, { repository, expectedSha, expectedBytes, label }) {
  const blob = requireRecord(value, label);
  if (
    blob.sha !== expectedSha || blob.encoding !== "base64" ||
    !Number.isSafeInteger(blob.size) || blob.size < 1 || typeof blob.content !== "string"
  ) {
    throw new TypeError(`${label} identity is invalid`);
  }
  verifyExactUrl(blob.url, `${apiRoot}/${repository}/git/blobs/${expectedSha}`, `${label} URL`);
  const decoded = decodeCanonicalBase64(blob.content, label);
  if (decoded.byteLength !== blob.size || gitBlobSha(decoded) !== expectedSha) {
    throw new TypeError(`${label} content does not match its Git identity`);
  }
  if (expectedBytes !== undefined && !decoded.equals(expectedBytes)) {
    throw new TypeError(`${label} content differs from supplied exact bytes`);
  }
}

function assertReceiptProducer(value) {
  exactKeys(value, [
    "repository", "repositoryId", "workflowId", "workflowName", "workflowPath",
    "event", "headBranch", "headSha", "runId", "runAttempt", "status",
    "conclusion", "createdAt", "runStartedAt", "completedAt",
  ], "diagnostic hosted producer");
  const expected = crawlPhaseDiagnosticHostedIdentity;
  if (
    value.repository !== expected.repository || value.workflowName !== expected.workflow.name ||
    value.workflowPath !== expected.workflow.path || value.event !== expected.event ||
    value.headBranch !== expected.headBranch || !gitShaPattern.test(value.headSha ?? "") ||
    value.runAttempt !== 1 || value.status !== "completed" ||
    !Number.isSafeInteger(value.repositoryId) || value.repositoryId < 1 ||
    !Number.isSafeInteger(value.workflowId) || value.workflowId < 1 ||
    !Number.isSafeInteger(value.runId) || value.runId < 1 ||
    value.runId === expected.comparison.runId
  ) {
    throw new TypeError("Diagnostic hosted producer identity is invalid");
  }
  terminalConclusion(value.conclusion, "diagnostic hosted producer conclusion");
  const created = apiInstant(value.createdAt, "diagnostic hosted producer createdAt");
  const started = apiInstant(value.runStartedAt, "diagnostic hosted producer runStartedAt");
  const completed = apiInstant(value.completedAt, "diagnostic hosted producer completedAt");
  if (started.epochMilliseconds < created.epochMilliseconds ||
    completed.epochMilliseconds < started.epochMilliseconds) {
    throw new TypeError("Diagnostic hosted producer timestamps are out of order");
  }
}

function assertReceiptOneShot(value, runId) {
  exactKeys(value, [
    "completeListing", "enumeratedRunCount", "invocationCount", "rerunCount", "selectedRunId",
  ], "diagnostic hosted one-shot receipt");
  if (
    value.completeListing !== true || !Number.isSafeInteger(value.enumeratedRunCount) ||
    value.enumeratedRunCount < 1 || value.invocationCount !== 1 || value.rerunCount !== 0 ||
    value.selectedRunId !== runId
  ) throw new TypeError("Diagnostic hosted one-shot receipt is invalid");
}

function assertReceiptComparison(value, runCreatedAt) {
  exactKeys(value, [
    "repository", "releaseId", "tag", "immutable", "draft", "prerelease",
    "publishedAt", "targetCommitSha", "targetTreeSha", "selectedAssets",
  ], "diagnostic hosted comparison evidence");
  exactKeys(value.selectedAssets, ["artifactBinding", "freshCrawlRaw"],
    "diagnostic hosted comparison selected assets");
  const expected = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  if (
    value.repository !== expected.repository || value.releaseId !== expected.releaseId ||
    value.tag !== expected.tag || value.immutable !== true || value.draft !== false ||
    value.prerelease !== false || value.targetCommitSha !== expected.targetCommitSha ||
    value.targetTreeSha !== expected.targetTreeSha ||
    apiInstant(value.publishedAt, "comparison evidence publishedAt").epochMilliseconds >=
      apiInstant(runCreatedAt, "diagnostic run createdAt").epochMilliseconds
  ) throw new TypeError("Diagnostic hosted comparison evidence receipt is invalid");
  for (const key of ["artifactBinding", "freshCrawlRaw"]) {
    assertReleaseAssetProjection(value.selectedAssets[key], expected.assets[key],
      `diagnostic comparison ${key}`);
  }
}

function assertReceiptContract(value, comparisonPublishedAt, runCreatedAt) {
  exactKeys(value, [
    "repository", "tag", "releaseId", "immutable", "draft", "prerelease",
    "publishedAt", "targetCommitSha", "soleParentSha", "treeSha", "assets",
    "preflightSha256",
  ], "diagnostic hosted contract");
  const expected = crawlPhaseDiagnosticContractIdentity;
  if (
    value.repository !== expected.repository || value.tag !== expected.tag ||
    !Number.isSafeInteger(value.releaseId) || value.releaseId < 1 ||
    value.immutable !== true || value.draft !== false || value.prerelease !== false ||
    !gitShaPattern.test(value.targetCommitSha ?? "") ||
    value.soleParentSha !== expected.soleParentSha || !gitShaPattern.test(value.treeSha ?? "") ||
    !sha256Pattern.test(value.preflightSha256 ?? "")
  ) throw new TypeError("Diagnostic hosted contract receipt is invalid");
  const comparisonTime = apiInstant(comparisonPublishedAt, "comparison publishedAt").epochMilliseconds;
  const contractTime = apiInstant(value.publishedAt, "diagnostic contract publishedAt").epochMilliseconds;
  const runTime = apiInstant(runCreatedAt, "diagnostic run createdAt").epochMilliseconds;
  if (!(comparisonTime < contractTime && contractTime < runTime)) {
    throw new TypeError("Diagnostic hosted contract chronology is invalid");
  }
  const names = Object.values(expected.assets).sort(compareUtf8);
  if (!Array.isArray(value.assets) || value.assets.length !== names.length) {
    throw new TypeError("Diagnostic hosted contract asset inventory changed");
  }
  value.assets.forEach((asset, index) => {
    if (asset.name !== names[index]) throw new TypeError("Diagnostic hosted contract asset order changed");
    exactKeys(asset, ["name", "path", "blobSha", "id", "sizeInBytes", "digest"],
      "diagnostic contract asset");
    if (
      asset.path !== `protocol/${asset.name}` || !gitShaPattern.test(asset.blobSha ?? "")
    ) throw new TypeError("Diagnostic hosted contract asset commit binding is invalid");
    assertReleaseAssetProjection({
      name: asset.name,
      id: asset.id,
      sizeInBytes: asset.sizeInBytes,
      digest: asset.digest,
    }, undefined, "diagnostic contract asset");
  });
}

function assertReceiptWorkflowSource(value, producer) {
  exactKeys(value, [
    "repository", "branch", "ref", "commitSha", "soleParentSha", "treeSha",
    "changedFile", "workflow", "preservedComparisonWorkflow",
  ], "diagnostic hosted workflow source");
  exactKeys(value.changedFile, ["status", "path"], "diagnostic changed file");
  exactKeys(value.workflow, [
    "path", "blobSha", "bytes", "sha256", "name", "jobId", "jobName",
  ], "diagnostic hosted source workflow");
  exactKeys(value.preservedComparisonWorkflow, ["path", "blobSha"],
    "diagnostic hosted preserved workflow");
  const expected = crawlPhaseDiagnosticHostedIdentity;
  if (
    value.repository !== expected.repository || value.branch !== expected.headBranch ||
    value.ref !== expected.headRef || value.commitSha !== producer.headSha ||
    value.soleParentSha !== performanceReplicationHostedIdentity.headSha ||
    !gitShaPattern.test(value.treeSha ?? "") ||
    !isDeepStrictEqual(value.changedFile, { status: "added", path: expected.workflow.path }) ||
    value.workflow.path !== expected.workflow.path || !gitShaPattern.test(value.workflow.blobSha ?? "") ||
    !Number.isSafeInteger(value.workflow.bytes) || value.workflow.bytes < 1 ||
    !sha256Pattern.test(value.workflow.sha256 ?? "") || value.workflow.name !== expected.workflow.name ||
    value.workflow.jobId !== expected.job.id || value.workflow.jobName !== expected.job.name ||
    value.preservedComparisonWorkflow.path !== comparisonWorkflowPath ||
    !gitShaPattern.test(value.preservedComparisonWorkflow.blobSha ?? "")
  ) throw new TypeError("Diagnostic hosted workflow source receipt is invalid");
}

function assertReceiptExecution(value) {
  verifyPreflightExecution(value);
}

function assertReceiptJob(value, producer, artifactMode) {
  exactKeys(value, [
    "id", "key", "name", "labels", "status", "conclusion", "startedAt", "completedAt",
    "steps",
  ], "diagnostic hosted job receipt");
  const expected = crawlPhaseDiagnosticHostedIdentity.job;
  if (
    !Number.isSafeInteger(value.id) || value.id < 1 ||
    value.id === crawlPhaseDiagnosticHostedIdentity.comparison.crawlJobId ||
    value.key !== expected.id || value.name !== expected.name ||
    !isDeepStrictEqual(value.labels, expected.labels) || value.status !== "completed" ||
    value.conclusion !== producer.conclusion
  ) throw new TypeError("Diagnostic hosted job receipt is invalid");
  const started = apiInstant(value.startedAt, "diagnostic hosted job startedAt").epochMilliseconds;
  const completed = apiInstant(value.completedAt, "diagnostic hosted job completedAt").epochMilliseconds;
  if (started > completed) throw new TypeError("Diagnostic hosted job timestamps are invalid");
  if (!Array.isArray(value.steps)) {
    throw new TypeError("Diagnostic hosted job receipt omits its exact step topology");
  }
  const rawSteps = value.steps.map((step) => {
    exactKeys(step, [
      "number", "name", "status", "conclusion", "startedAt", "completedAt",
    ], "diagnostic hosted receipt step");
    return {
      number: step.number,
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      started_at: step.startedAt,
      completed_at: step.completedAt,
    };
  });
  const result = verifyJobSteps(rawSteps, {
    jobStartedAt: value.startedAt,
    jobCompletedAt: value.completedAt,
    runConclusion: producer.conclusion,
  });
  if (result.expectedArtifactMode !== artifactMode || !isDeepStrictEqual(result.steps, value.steps)) {
    throw new TypeError("Diagnostic hosted receipt steps differ from its artifact mode");
  }
}

function assertReceiptArtifacts(value, mode, outcomeClass, producer) {
  const modes = {
    bundle_valid: { outcomeClass: "VALID_NON_AUTHORITATIVE", count: 1, success: true },
    bundle_status: { outcomeClass: "DIAGNOSTIC_INVALID_WITH_STATUS", count: 1, success: false },
    no_artifact: { outcomeClass: "INFRASTRUCTURE_INVALID_NO_ARTIFACT", count: 0, success: false },
  };
  const expected = modes[mode];
  if (
    expected === undefined || expected.outcomeClass !== outcomeClass ||
    (producer.conclusion === "success") !== expected.success ||
    !Array.isArray(value) || value.length !== expected.count
  ) throw new TypeError("Diagnostic hosted artifact mode is invalid");
  value.forEach((artifact, index) => {
    exactKeys(artifact, ["name", "id", "sizeInBytes", "digest"],
      "diagnostic hosted artifact receipt");
    if (
      artifact.name !== crawlPhaseDiagnosticExpectedArtifactNames[index] ||
      !Number.isSafeInteger(artifact.id) || artifact.id < 1 ||
      !Number.isSafeInteger(artifact.sizeInBytes) || artifact.sizeInBytes < 1 ||
      !sha256DigestPattern.test(artifact.digest ?? "")
    ) throw new TypeError("Diagnostic hosted artifact receipt is invalid");
  });
}

function projectExecution(value) {
  return structuredClone(value);
}

function assertClaimBoundary(value) {
  exactKeys(value, [
    "authorityEligible", "timingEligible", "statisticsEligible", "comparisonEligible",
    "optimizationEligible", "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized", "decisionState",
  ], "diagnostic claim boundary");
  for (const key of [
    "authorityEligible", "timingEligible", "statisticsEligible", "comparisonEligible",
    "optimizationEligible", "generalizedSpeedClaimAuthorized", "implementationWorkAuthorized",
  ]) {
    if (value[key] !== false) throw new TypeError(`Diagnostic claim boundary grants ${key}`);
  }
  if (value.decisionState !== "STAY_0_4_UNASSIGNED") {
    throw new TypeError("Diagnostic decision state changed");
  }
}

function assertReleaseAssetProjection(value, expected, label) {
  exactKeys(value, ["name", "id", "sizeInBytes", "digest"], label);
  if (
    typeof value.name !== "string" || value.name.length === 0 ||
    !Number.isSafeInteger(value.id) || value.id < 1 ||
    !Number.isSafeInteger(value.sizeInBytes) || value.sizeInBytes < 1 ||
    !sha256DigestPattern.test(value.digest ?? "") ||
    (expected !== undefined && (
      value.name !== expected.name || value.id !== expected.id ||
      value.sizeInBytes !== expected.bytes || value.digest !== `sha256:${expected.sha256}`
    ))
  ) throw new TypeError(`${label} identity is invalid`);
}

function verifyRepository(value, expectedName, label) {
  const repository = requireRecord(value, label);
  const id = positiveSafeInteger(repository.id, `${label} ID`);
  if (repository.full_name !== expectedName) throw new TypeError(`${label} full name changed`);
  verifyExactUrl(repository.url, `${apiRoot}/${expectedName}`, `${label} API URL`);
  return { id };
}

function verifyRunUrls(value, id) {
  const repository = crawlPhaseDiagnosticHostedIdentity.repository;
  verifyExactUrl(value.url, `${apiRoot}/${repository}/actions/runs/${id}`, "diagnostic run API URL");
  verifyExactUrl(value.html_url, `${webRoot}/${repository}/actions/runs/${id}`,
    "diagnostic run web URL");
  verifyExactUrl(value.jobs_url, `${apiRoot}/${repository}/actions/runs/${id}/jobs`,
    "diagnostic run jobs URL");
  verifyExactUrl(value.artifacts_url, `${apiRoot}/${repository}/actions/runs/${id}/artifacts`,
    "diagnostic run artifacts URL");
}

function verifyReleaseUrls(value, { repository, tag, id, label }) {
  verifyExactUrl(value.url, `${apiRoot}/${repository}/releases/${id}`, `${label} API URL`);
  verifyExactUrl(value.html_url, `${webRoot}/${repository}/releases/tag/${tag}`, `${label} web URL`);
  verifyExactUrl(value.assets_url, `${apiRoot}/${repository}/releases/${id}/assets`,
    `${label} assets URL`);
  verifyExactUrl(value.upload_url, `${uploadRoot}/${repository}/releases/${id}/assets{?name,label}`,
    `${label} upload URL`);
}

function verifyReleaseAssetUrls(value, { repository, tag, name, id, label }) {
  verifyExactUrl(value.url, `${apiRoot}/${repository}/releases/assets/${id}`, `${label} asset API URL`);
  verifyExactUrl(value.browser_download_url,
    `${webRoot}/${repository}/releases/download/${tag}/${name}`, `${label} asset download URL`);
}

function verifyExactUrl(actual, expected, label) {
  if (actual !== expected) throw new TypeError(`${label} repository binding mismatch`);
}

function apiInstant(value, label) {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    throw new TypeError(`${label} must be one canonical UTC instant`);
  }
  const epochMilliseconds = Date.parse(value);
  const normalized = value.includes(".") ? value : value.replace(/Z$/u, ".000Z");
  if (!Number.isFinite(epochMilliseconds) || new Date(epochMilliseconds).toISOString() !== normalized) {
    throw new TypeError(`${label} must be one valid canonical UTC instant`);
  }
  return { value, epochMilliseconds };
}

function terminalConclusion(value, label) {
  if (!publishableTerminalConclusions.has(value)) {
    throw new TypeError(`${label} is not a publishable terminal conclusion`);
  }
  return value;
}

function parseCanonicalJson(bytes, label) {
  let text;
  let value;
  try {
    text = utf8.decode(bytes);
    value = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${label} is not valid UTF-8 JSON`, { cause: error });
  }
  assertCanonicalJsonBytes(value, bytes, label);
  return value;
}

function assertCanonicalJsonBytes(value, bytes, label) {
  const canonical = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (!canonical.equals(bytes)) throw new TypeError(`${label} bytes are not canonical pretty JSON`);
}

function assertUtf8Text(bytes, label) {
  try {
    const text = utf8.decode(bytes);
    if (text.length === 0) throw new TypeError(`${label} is empty`);
  } catch (error) {
    throw new TypeError(`${label} is not non-empty UTF-8 text`, { cause: error });
  }
}

function decodeCanonicalBase64(value, label) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?:\r?\n)?$/u.test(value)) {
    throw new TypeError(`${label} content is not canonical base64`);
  }
  const compact = value.replace(/\r?\n$/u, "");
  const decoded = Buffer.from(compact, "base64");
  if (decoded.toString("base64") !== compact) throw new TypeError(`${label} content is not canonical base64`);
  return decoded;
}

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

function exactBuffer(value, label) {
  if (!Buffer.isBuffer(value) || value.byteLength < 1) {
    throw new TypeError(`${label} must be a non-empty exact byte Buffer`);
  }
  return Buffer.from(value);
}

function fileIdentity(bytes) {
  return { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function exactKeys(value, expected, label) {
  if (!isPlainRecord(value) ||
    !isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...expected].sort())) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  return value;
}

function requireRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object`);
  return value;
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be positive`);
  return value;
}

function nonnegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be nonnegative`);
  return value;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertUrlFree(value) {
  const seen = new WeakSet();
  const visit = (current) => {
    if (typeof current === "string") {
      if (/(?:https?:\/\/|api\.github\.com\/|github\.com\/)/iu.test(current)) {
        throw new TypeError("Diagnostic hosted receipt must not retain URLs");
      }
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (seen.has(current)) throw new TypeError("Diagnostic hosted receipt must be acyclic");
    seen.add(current);
    for (const child of Array.isArray(current) ? current : Object.values(current)) visit(child);
  };
  visit(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
