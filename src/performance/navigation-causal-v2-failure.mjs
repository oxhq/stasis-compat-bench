import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import AdmZip from "adm-zip";

export const navigationCausalV2FailureAuthoritySchema =
  "stasis-v0.3.3-performance-navigation-causal-v2-failure-authority-v1";
export const navigationCausalV2FailureVerificationSchema =
  "stasis-v0.3.3-performance-navigation-causal-v2-failure-verification-v3";

export const navigationCausalV2FailureAssetIdentities = deepFreeze({
  "stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json": {
    bytes: 370_631,
    sha256: "2fd870809f4c3198c23c8f1118d2b8f2461b318fcd8790b81f66c2ea2a9dc51a",
  },
  "stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip": {
    bytes: 113_247,
    sha256: "a7415037cbe660f632625b6b43a19ff845148a0f33669810f1171086b97e2297",
  },
});

export const navigationCausalV2ContractAssetIdentities = deepFreeze({
  "stasis-v0.3.3-performance-navigation-causal-preflight-v2.json": {
    id: 545_212_519,
    bytes: 12_257,
    sha256: "c4c0ffc0c8802e2a1b3169330a64fbda0c91bd3ced30085da53fd60de290f9a6",
  },
  "stasis-v0.3.3-performance-navigation-causal-v2.md": {
    id: 545_212_531,
    bytes: 17_688,
    sha256: "f09ea8a415ec353744c95e24196142f553881c403172c3ce3701c4c626dec558",
  },
  "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v2.json": {
    id: 545_212_525,
    bytes: 2_004,
    sha256: "1594337623688f9c15fe4b205639d67b3a7947bea16332b425ded26fb53848f9",
  },
  "stasis-v0.3.3-performance-navigation-causal-workflow-v2.yml": {
    id: 545_212_522,
    bytes: 40_758,
    sha256: "4ed396bba197d83b5033f506667df744e5d2a8b6c0e7f81081f3b850853ce472",
  },
});

export const navigationCausalV2WorkflowSourceIdentity = deepFreeze({
  repository: "oxhq/stasis",
  branch: "codex/stasis-v033-navigation-causal-source",
  ref: "refs/heads/codex/stasis-v033-navigation-causal-source",
  revision: "cb5bba41cda038fce82d2a5da6e4f853f1e97440",
  parentRevision: "b4c847b6543e34677630c311b20d9e3ff64d0925",
  tree: "9883ccb6fd3ddf72c3e4745e9fa3b1d9cc1d95da",
  workflow: {
    path: ".github/workflows/stasis-v0.3.3-performance-navigation-causal.yml",
    blob: "f24f67ac0d2c8b7b7cbd3a1e2bfc8a304c1c8038",
    bytes: 40_758,
    sha256: "4ed396bba197d83b5033f506667df744e5d2a8b6c0e7f81081f3b850853ce472",
    lineCount: 829,
    name: "Stasis v0.3.3 navigation causal experiment",
  },
});

export const navigationCausalInvalidV2Evidence = deepFreeze({
  status: "INVALID_PRE_MEASUREMENT_HARNESS_INVOCATION",
  reasonCode: "NON_PLAIN_PROCESS_ENV_REJECTED_BEFORE_RUN_HOST",
  workflowObservationStarted: true,
  productMeasurementStarted: false,
  noRetainedMeasurementArtifacts: true,
  nativeLaunchCountProvenByPublicMetadata: false,
  authorizedS5CreationPushesConsumed: 1,
  authorizedS5CreationPushesRemaining: 0,
  contract: {
    releaseId: 383_100_231,
    tag: "stasis-v0.3.3-performance-navigation-causal-contract-v2",
    targetCommitSha: "a1352f2d31cb21bed7fae200c7fd638f850274f4",
    targetTreeSha: "6ad9c9e0cddcfe3b7317c9b76b1d1e38677b14b9",
    soleParentSha: "8f84642fb2c2af9e439a7fcb5da89ada1d42bb67",
    createdAt: "2026-09-05T01:56:14Z",
    publishedAt: "2026-09-05T01:56:58Z",
    assetCount: 4,
  },
  preflight: {
    releaseId: 383_100_433,
    tag: "stasis-v0.3.3-performance-navigation-causal-preflight-v2",
    targetCommitSha: "a1352f2d31cb21bed7fae200c7fd638f850274f4",
    createdAt: "2026-09-05T01:56:14Z",
    publishedAt: "2026-09-05T01:57:47Z",
    asset: {
      id: 545_213_184,
      name: "anonymous-contract-preflight-v2.json",
      bytes: 4_269,
      sha256: "cef8e82a20fb0a91de26ebbecec485af8595db6602c4e52c6013ce1ecfe74a04",
    },
  },
  workflowSource: navigationCausalV2WorkflowSourceIdentity,
  hostedFailure: {
    runId: 33_937_724_071,
    workflowId: 350_638_492,
    runAttempt: 1,
    event: "push",
    status: "completed",
    conclusion: "failure",
    createdAt: "2026-09-05T01:58:17Z",
    runStartedAt: "2026-09-05T01:58:17Z",
    completedAt: "2026-09-05T01:59:17Z",
    branchRunCount: 1,
    headShaRunCount: 1,
    artifactCount: 0,
    jobs: [
      {
        lane: "host-a",
        id: 101_228_807_491,
        name: "Native Ubuntu 22.04 navigation causal host A",
        startedAt: "2026-09-05T01:58:20Z",
        completedAt: "2026-09-05T01:59:01Z",
      },
      {
        lane: "host-b",
        id: 101_228_807_574,
        name: "Native Ubuntu 22.04 navigation causal host B",
        startedAt: "2026-09-05T01:58:20Z",
        completedAt: "2026-09-05T01:59:16Z",
      },
    ],
    failedStepNumbers: [14, 15, 17],
    skippedStepNumbers: [16, 33],
    capturedError: "The launch environment must be an object",
  },
  capture: {
    authorityAsset:
      "stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json",
    actionsLogsAsset:
      "stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip",
    actionsLogsEntryCount: 40,
    actionsLogsAuthenticatedCapture: true,
    actionsLogsAnonymousLiveRefetchSupported: false,
    credentialsRetained: false,
  },
  evidenceAbsence: {
    tag: "stasis-v0.3.3-performance-navigation-causal-evidence-v2",
    releaseStatus: 404,
    tagRefStatus: 404,
  },
  exclusion: {
    v2TimingImportedIntoV3: false,
    v2StatisticsImportedIntoV3: false,
    v2EvidencePublicationAuthorized: false,
    v2RerunAuthorized: false,
    secondS5PushAuthorized: false,
    successfulRerunAcceptedAsCorrectnessEvidence: false,
    replacementProtocol: "stasis-v0.3.3-performance-navigation-causal-v3",
  },
  claimBoundary: {
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    matchedEffectEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  },
});

const authorityName = navigationCausalInvalidV2Evidence.capture.authorityAsset;
const logsName = navigationCausalInvalidV2Evidence.capture.actionsLogsAsset;
const exactError = navigationCausalInvalidV2Evidence.hostedFailure.capturedError;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export const navigationCausalV2FailureAuthorityRoutes = deepFreeze({
  contractRelease:
    "/repos/oxhq/stasis-compat-bench/releases/tags/stasis-v0.3.3-performance-navigation-causal-contract-v2",
  contractCommit:
    "/repos/oxhq/stasis-compat-bench/commits/a1352f2d31cb21bed7fae200c7fd638f850274f4",
  contractTagRef:
    "/repos/oxhq/stasis-compat-bench/git/ref/tags/stasis-v0.3.3-performance-navigation-causal-contract-v2",
  preflightRelease:
    "/repos/oxhq/stasis-compat-bench/releases/tags/stasis-v0.3.3-performance-navigation-causal-preflight-v2",
  preflightTagRef:
    "/repos/oxhq/stasis-compat-bench/git/ref/tags/stasis-v0.3.3-performance-navigation-causal-preflight-v2",
  sourceBranchRef:
    "/repos/oxhq/stasis/git/ref/heads/codex/stasis-v033-navigation-causal-source",
  workflowSourceCommit:
    "/repos/oxhq/stasis/commits/cb5bba41cda038fce82d2a5da6e4f853f1e97440",
  workflowRun: "/repos/oxhq/stasis/actions/runs/33937724071",
  workflowRunsByBranch:
    "/repos/oxhq/stasis/actions/runs?branch=codex%2Fstasis-v033-navigation-causal-source&per_page=100",
  workflowRunsByHeadSha:
    "/repos/oxhq/stasis/actions/runs?head_sha=cb5bba41cda038fce82d2a5da6e4f853f1e97440&per_page=100",
  workflowJobsAllAttempts:
    "/repos/oxhq/stasis/actions/runs/33937724071/jobs?filter=all&per_page=100",
  workflowArtifacts:
    "/repos/oxhq/stasis/actions/runs/33937724071/artifacts?per_page=100",
  v2EvidenceRelease:
    "/repos/oxhq/stasis-compat-bench/releases/tags/stasis-v0.3.3-performance-navigation-causal-evidence-v2",
  v2EvidenceTagRef:
    "/repos/oxhq/stasis-compat-bench/git/ref/tags/stasis-v0.3.3-performance-navigation-causal-evidence-v2",
});

const expectedRecordNames = Object.freeze([
  "contractRelease",
  "contractCommit",
  "contractTagRef",
  "preflightRelease",
  "preflightTagRef",
  "preflightReceipt",
  "sourceBranchRef",
  "workflowSourceCommit",
  "workflowRun",
  "workflowRunsByBranch",
  "workflowRunsByHeadSha",
  "workflowJobsAllAttempts",
  "workflowArtifacts",
]);

const aggregateLogIdentities = deepFreeze({
  "0_Native Ubuntu 22.04 navigation causal host B.txt": {
    bytes: 104_415,
    sha256: "2d004877d6ac8e03806ca0ed74249fbf21061dcd84860a6d4d7bac383314e24d",
  },
  "1_Native Ubuntu 22.04 navigation causal host A.txt": {
    bytes: 104_403,
    sha256: "e458092ed30d61fe047f4fc5664f2641adf82d6268c5d9a01634ff59f4efb548",
  },
});

const step14LogIdentities = deepFreeze({
  "Native Ubuntu 22.04 navigation causal host A/14_Run the sealed navigation causal experiment on host A.txt": {
    bytes: 2_588,
    sha256: "e356b6956b100a5277f7e8e71ce0b92abe8d58ac26b626e22833e9e2c820c3b5",
  },
  "Native Ubuntu 22.04 navigation causal host B/14_Run the sealed navigation causal experiment on host B.txt": {
    bytes: 2_588,
    sha256: "222abc67473847f0d510d096317797830d8a7fcc2def467bed6ea38ceaf2c3d8",
  },
});

export function verifyNavigationCausalV2FailureArchive({
  authorityBundleBytes,
  actionsLogsZipBytes,
} = {}) {
  assertAssetIdentity(authorityBundleBytes, authorityName);
  assertAssetIdentity(actionsLogsZipBytes, logsName);
  const bundle = parseCanonicalJson(authorityBundleBytes, "navigation causal V2 failure authority");
  if (bundle.schema !== navigationCausalV2FailureAuthoritySchema ||
    bundle.status !== "captured_invalid_infrastructure" ||
    !isDeepStrictEqual(bundle.routes, navigationCausalV2FailureAuthorityRoutes) ||
    !hasExactKeys(bundle.records, expectedRecordNames) ||
    !isDeepStrictEqual(bundle.observedAbsence, {
      v2EvidenceRelease: { status: 404 },
      v2EvidenceTagRef: { status: 404 },
    }) || bundle.capture?.repository !== "oxhq/stasis" ||
    bundle.capture?.runId !== navigationCausalInvalidV2Evidence.hostedFailure.runId ||
    bundle.capture?.terminalAt !== navigationCausalInvalidV2Evidence.hostedFailure.completedAt ||
    bundle.capture?.rawJsonValuesCanonicalizedWithoutProjection !== true ||
    bundle.capture?.credentialsRetained !== false ||
    bundle.capture?.anonymousLiveRunLogRefetchSupported !== false ||
    bundle.capture?.actionsLogs?.name !== logsName ||
    bundle.capture.actionsLogs.bytes !== actionsLogsZipBytes.length ||
    bundle.capture.actionsLogs.sha256 !== sha256(actionsLogsZipBytes) ||
    bundle.capture.actionsLogs.entryCount !== 40 ||
    bundle.capture.actionsLogs.acquisition !== "authenticated_github_actions_run_logs_api") {
    throw new TypeError("Navigation causal V2 failure authority bundle boundary changed");
  }
  verifyV2Records(bundle.records, bundle.observedAbsence);
  const preflightBytes = canonicalJsonBytes(bundle.records.preflightReceipt);
  assertFixedBytes(
    preflightBytes,
    navigationCausalInvalidV2Evidence.preflight.asset,
    "navigation causal V2 preflight receipt",
  );
  const logArchive = verifyLogArchive(actionsLogsZipBytes);
  return deepFreeze({
    schema: navigationCausalV2FailureVerificationSchema,
    ...structuredClone(navigationCausalInvalidV2Evidence),
    archive: {
      authority: { name: authorityName, ...fileIdentity(authorityBundleBytes) },
      actionsLogs: { name: logsName, ...fileIdentity(actionsLogsZipBytes) },
      entryCount: logArchive.entryCount,
      totalUncompressedBytes: logArchive.totalUncompressedBytes,
      capturedErrorOccurrencesInAggregateLogs:
        logArchive.capturedErrorOccurrencesInAggregateLogs,
      capturedErrorOccurrencesInStep14Logs:
        logArchive.capturedErrorOccurrencesInStep14Logs,
    },
    verification: {
      canonicalRawJsonValuesRetained: true,
      immutableV2ContractPredatesPreflight: true,
      immutableV2PreflightPredatesFailedRun: true,
      exactlyOneAllEventBranchRun: true,
      exactlyOneHeadShaRun: true,
      runAttemptRemainsOne: true,
      exactlyTwoFailedNativeJobs: true,
      exactFailedStepTopology: true,
      zeroActionsArtifacts: true,
      capturedLogsExactAndCredentialFreeAtRest: true,
      capturedLogsAnonymousLiveRefetchSupported: false,
      productMeasurementStarted: false,
      nativeLaunchCountProvenByPublicMetadata: false,
      v2EvidenceReleaseAndTagAbsentAtCapture: true,
      v2TimingImportedIntoV3: false,
    },
  });
}

export function verifyNavigationCausalV2FailureLiveAuthority({
  authorityBundleBytes,
  actionsLogsZipBytes,
  liveRecords,
  v2ContractAssets,
  v2PreflightReceiptBytes,
  evidenceReleaseStatus,
  evidenceTagRefStatus,
} = {}) {
  const archived = verifyNavigationCausalV2FailureArchive({
    authorityBundleBytes,
    actionsLogsZipBytes,
  });
  if (!hasExactKeys(liveRecords, expectedRecordNames.filter(
    (name) => name !== "preflightReceipt",
  ))) {
    throw new TypeError("Navigation causal live V2 failure record inventory changed");
  }
  verifyV2Records(liveRecords, {
    v2EvidenceRelease: { status: evidenceReleaseStatus },
    v2EvidenceTagRef: { status: evidenceTagRefStatus },
  });
  assertExactBytesObject(
    v2ContractAssets,
    navigationCausalV2ContractAssetIdentities,
    "navigation causal V2 contract assets",
  );
  assertFixedBytes(
    v2PreflightReceiptBytes,
    navigationCausalInvalidV2Evidence.preflight.asset,
    "navigation causal live V2 preflight receipt",
  );
  const bundle = parseCanonicalJson(authorityBundleBytes, "navigation causal V2 failure authority");
  if (!isDeepStrictEqual(
    JSON.parse(v2PreflightReceiptBytes.toString("utf8")),
    bundle.records.preflightReceipt,
  )) {
    throw new TypeError("Navigation causal live V2 preflight differs from its archived value");
  }
  return deepFreeze({
    ...structuredClone(archived),
    livePublicAuthorityReplayed: true,
    verification: {
      ...structuredClone(archived.verification),
      exactV2ContractAssetsFetchedAnonymously: true,
      exactV2PreflightReceiptFetchedAnonymously: true,
      branchAndHeadShaCensusesFetchedWithoutEventFilter: true,
      allAttemptsJobListingReplayed: true,
      v2EvidenceReleaseAndTagStillAbsent: true,
      retainedCaptureCorroboratedByLivePublicMetadata: true,
      capturedLogsRefetchedAnonymously: false,
    },
  });
}

export function inspectNavigationCausalV2FailureLogPrivacy(actionsLogsZipBytes, inspectText) {
  assertAssetIdentity(actionsLogsZipBytes, logsName);
  if (typeof inspectText !== "function") {
    throw new TypeError("Navigation causal V2 log privacy inspector must be a function");
  }
  const entries = safeZipEntries(actionsLogsZipBytes);
  const identities = [];
  for (const [name, bytes] of entries) {
    inspectText(bytes.toString("utf8"));
    identities.push({ name, ...fileIdentity(bytes) });
  }
  return deepFreeze({
    entryCount: entries.size,
    entries: identities.sort((left, right) => left.name.localeCompare(right.name)),
  });
}

function verifyV2Records(records, absence) {
  const expected = navigationCausalInvalidV2Evidence;
  verifyRelease(
    records.contractRelease,
    expected.contract,
    navigationCausalV2ContractAssetIdentities,
    "V2 contract",
  );
  const contractCommit = record(records.contractCommit, "V2 contract commit");
  if (contractCommit.sha !== expected.contract.targetCommitSha ||
    contractCommit.commit?.tree?.sha !== expected.contract.targetTreeSha ||
    !isDeepStrictEqual(contractCommit.parents?.map(({ sha }) => sha), [expected.contract.soleParentSha]) ||
    contractCommit.url !==
      `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${expected.contract.targetCommitSha}` ||
    !Array.isArray(contractCommit.files)) {
    throw new TypeError("Navigation causal V2 contract commit identity changed");
  }
  verifyDirectTag(records.contractTagRef, expected.contract.tag, expected.contract.targetCommitSha);
  verifyRelease(
    records.preflightRelease,
    expected.preflight,
    { [expected.preflight.asset.name]: expected.preflight.asset },
    "V2 preflight",
  );
  verifyDirectTag(records.preflightTagRef, expected.preflight.tag, expected.preflight.targetCommitSha);
  verifySource(records.sourceBranchRef, records.workflowSourceCommit);
  const run = verifyRun(records.workflowRun);
  verifyRunListing(records.workflowRunsByBranch, run, "branch");
  verifyRunListing(records.workflowRunsByHeadSha, run, "head SHA");
  verifyFailedJobs(records.workflowJobsAllAttempts, run);
  const artifacts = record(records.workflowArtifacts, "V2 workflow artifacts");
  if (artifacts.total_count !== 0 || !Array.isArray(artifacts.artifacts) ||
    artifacts.artifacts.length !== 0) {
    throw new TypeError("Navigation causal V2 failed run retained Actions artifacts");
  }
  if (absence?.v2EvidenceRelease?.status !== 404 ||
    absence?.v2EvidenceTagRef?.status !== 404) {
    throw new TypeError("Navigation causal V2 evidence release or tag is no longer absent");
  }
  const contractCreated = instant(expected.contract.createdAt, "V2 contract created_at");
  const contractPublished = instant(expected.contract.publishedAt, "V2 contract published_at");
  const preflightCreated = instant(expected.preflight.createdAt, "V2 preflight created_at");
  const preflightPublished = instant(expected.preflight.publishedAt, "V2 preflight published_at");
  if (contractCreated.epoch > contractPublished.epoch ||
    preflightCreated.epoch > preflightPublished.epoch ||
    contractPublished.epoch >= preflightPublished.epoch ||
    preflightPublished.epoch >= run.createdEpoch) {
    throw new TypeError("Navigation causal V2 contract, preflight, and failed-run chronology changed");
  }
  return run;
}

function verifyRelease(value, expected, identities, label) {
  const release = record(value, label);
  if (release.id !== expected.releaseId || release.tag_name !== expected.tag ||
    release.target_commitish !== expected.targetCommitSha || release.immutable !== true ||
    release.draft !== false || release.prerelease !== false ||
    release.created_at !== expected.createdAt || release.published_at !== expected.publishedAt ||
    release.url !== `https://api.github.com/repos/oxhq/stasis-compat-bench/releases/${expected.releaseId}` ||
    !Array.isArray(release.assets) || release.assets.length !== Object.keys(identities).length) {
    throw new TypeError(`Navigation causal ${label} release identity changed`);
  }
  const seenNames = new Set();
  const seenIds = new Set();
  for (const asset of release.assets) {
    const identity = identities[asset.name];
    if (identity === undefined || seenNames.has(asset.name) || seenIds.has(asset.id) ||
      asset.id !== identity.id || asset.state !== "uploaded" || asset.size !== identity.bytes ||
      asset.digest !== `sha256:${identity.sha256}` ||
      asset.browser_download_url !==
        `https://github.com/oxhq/stasis-compat-bench/releases/download/${expected.tag}/${asset.name}`) {
      throw new TypeError(`Navigation causal ${label} release assets changed`);
    }
    seenNames.add(asset.name);
    seenIds.add(asset.id);
  }
}

function verifyDirectTag(value, tag, target) {
  if (value?.ref !== `refs/tags/${tag}` || value?.object?.type !== "commit" ||
    value.object.sha !== target) {
    throw new TypeError(`Navigation causal V2 tag is not direct: ${tag}`);
  }
}

function verifySource(branchRef, commitValue) {
  const source = navigationCausalV2WorkflowSourceIdentity;
  if (branchRef?.ref !== source.ref || branchRef?.object?.type !== "commit" ||
    branchRef.object.sha !== source.revision) {
    throw new TypeError("Navigation causal V2 source branch changed");
  }
  const commit = record(commitValue, "V2 workflow source commit");
  if (commit.sha !== source.revision || commit.commit?.tree?.sha !== source.tree ||
    !isDeepStrictEqual(commit.parents?.map(({ sha }) => sha), [source.parentRevision]) ||
    commit.url !== `https://api.github.com/repos/oxhq/stasis/commits/${source.revision}` ||
    !Array.isArray(commit.files) || commit.files.length !== 1) {
    throw new TypeError("Navigation causal V2 workflow source commit identity changed");
  }
  const file = commit.files[0];
  if (file.filename !== source.workflow.path || file.status !== "added" ||
    file.sha !== source.workflow.blob || file.additions !== source.workflow.lineCount ||
    file.deletions !== 0 || file.changes !== source.workflow.lineCount) {
    throw new TypeError("Navigation causal V2 workflow source change is not exact");
  }
}

function verifyRun(value) {
  const run = record(value, "V2 workflow run");
  const expected = navigationCausalInvalidV2Evidence.hostedFailure;
  const source = navigationCausalV2WorkflowSourceIdentity;
  if (run.id !== expected.runId || run.workflow_id !== expected.workflowId ||
    run.run_attempt !== expected.runAttempt || run.event !== expected.event ||
    run.status !== expected.status || run.conclusion !== expected.conclusion ||
    run.head_branch !== source.branch || run.head_sha !== source.revision ||
    run.path !== source.workflow.path || run.name !== source.workflow.name ||
    run.created_at !== expected.createdAt || run.run_started_at !== expected.runStartedAt ||
    run.updated_at !== expected.completedAt ||
    run.url !== `https://api.github.com/repos/oxhq/stasis/actions/runs/${expected.runId}` ||
    run.repository?.full_name !== "oxhq/stasis" ||
    run.head_repository?.full_name !== "oxhq/stasis") {
    throw new TypeError("Navigation causal V2 failed run identity changed");
  }
  const created = instant(run.created_at, "V2 run created_at");
  const started = instant(run.run_started_at, "V2 run_started_at");
  const completed = instant(run.updated_at, "V2 run updated_at");
  if (started.epoch < created.epoch || completed.epoch < started.epoch) {
    throw new TypeError("Navigation causal V2 failed run timestamps are invalid");
  }
  return { ...expected, createdEpoch: created.epoch, startedEpoch: started.epoch, completedEpoch: completed.epoch };
}

function verifyRunListing(value, selected, label) {
  const listing = record(value, `V2 ${label} workflow runs listing`);
  if (listing.total_count !== 1 || !Array.isArray(listing.workflow_runs) ||
    listing.workflow_runs.length !== 1) {
    throw new TypeError(`Navigation causal V2 ${label} run census is not exactly one`);
  }
  const run = listing.workflow_runs[0];
  const source = navigationCausalV2WorkflowSourceIdentity;
  if (run.id !== selected.runId || run.workflow_id !== selected.workflowId ||
    run.run_attempt !== 1 || run.event !== "push" || run.status !== "completed" ||
    run.conclusion !== "failure" || run.head_branch !== source.branch ||
    run.head_sha !== source.revision || run.path !== source.workflow.path ||
    run.name !== source.workflow.name) {
    throw new TypeError(`Navigation causal V2 ${label} run census changed`);
  }
}

function verifyFailedJobs(value, run) {
  const listing = record(value, "V2 all-attempt jobs listing");
  const expectedJobs = navigationCausalInvalidV2Evidence.hostedFailure.jobs;
  if (listing.total_count !== 2 || !Array.isArray(listing.jobs) || listing.jobs.length !== 2) {
    throw new TypeError("Navigation causal V2 all-attempt job census changed");
  }
  const byId = new Map(listing.jobs.map((job) => [job.id, job]));
  if (byId.size !== 2) throw new TypeError("Navigation causal V2 jobs reuse an ID");
  for (const expected of expectedJobs) {
    const job = record(byId.get(expected.id), `V2 ${expected.lane} job`);
    if (job.run_id !== run.runId || job.run_attempt !== 1 || job.name !== expected.name ||
      job.head_sha !== navigationCausalV2WorkflowSourceIdentity.revision ||
      job.status !== "completed" || job.conclusion !== "failure" ||
      !isDeepStrictEqual(job.labels, ["ubuntu-22.04"]) ||
      job.started_at !== expected.startedAt || job.completed_at !== expected.completedAt ||
      job.url !== `https://api.github.com/repos/oxhq/stasis/actions/jobs/${expected.id}`) {
      throw new TypeError(`Navigation causal V2 ${expected.lane} job identity changed`);
    }
    verifyFailedSteps(job.steps, expected.lane);
  }
}

function verifyFailedSteps(value, lane) {
  const expected = expectedSteps(lane === "host-a" ? "A" : "B");
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new TypeError(`Navigation causal V2 ${lane} step count changed`);
  }
  const failed = new Set(navigationCausalInvalidV2Evidence.hostedFailure.failedStepNumbers);
  const skipped = new Set(navigationCausalInvalidV2Evidence.hostedFailure.skippedStepNumbers);
  value.forEach((step, index) => {
    const wanted = expected[index];
    const conclusion = failed.has(wanted.number) ? "failure" :
      skipped.has(wanted.number) ? "skipped" : "success";
    if (step.number !== wanted.number || step.name !== wanted.name ||
      step.status !== "completed" || step.conclusion !== conclusion) {
      throw new TypeError(`Navigation causal V2 ${lane} failed step topology changed`);
    }
  });
}

function expectedSteps(label) {
  const host = `host ${label}`;
  return [{ number: 1, name: "Set up job" }].concat([
    `Validate the one-shot ${host} invocation`,
    "Check out the exact navigation causal runner",
    "Set up exact Node 22.20.0 x64",
    `Verify the exact ${host} harness and Node runtime`,
    `Install the frozen navigation causal runner for ${host}`,
    `Provision the exact Stasis EGL runtime prerequisite for ${host}`,
    `Verify the exact package source records for ${host}`,
    `Download the exact Linux package artifact for ${host}`,
    `Download the exact Linux package proof for ${host}`,
    `Download the exact TypeScript package artifact for ${host}`,
    `Download the exact runtime manifest for ${host}`,
    `Verify and extract the exact Linux candidate inputs for ${host}`,
    `Run the sealed navigation causal experiment on ${host}`,
    `Verify the exact ${host} correctness and clean-exit gates`,
    `Retain the exact ${host} causal evidence`,
    `Propagate the terminal ${host} outcome after retention`,
  ].map((name, index) => ({ number: index + 2, name })), [
    { number: 33, name: "Post Set up exact Node 22.20.0 x64" },
    { number: 34, name: "Post Check out the exact navigation causal runner" },
    { number: 35, name: "Complete job" },
  ]);
}

function verifyLogArchive(bytes) {
  const entries = safeZipEntries(bytes);
  if (entries.size !== navigationCausalInvalidV2Evidence.capture.actionsLogsEntryCount) {
    throw new TypeError("Navigation causal V2 Actions log entry count changed");
  }
  let capturedErrorOccurrencesInAggregateLogs = 0;
  let capturedErrorOccurrencesInStep14Logs = 0;
  for (const [name, identity] of Object.entries(aggregateLogIdentities)) {
    const entry = entries.get(name);
    assertFixedBytes(entry, identity, `navigation causal V2 aggregate log ${name}`);
    const count = countOccurrences(entry.toString("utf8"), exactError);
    if (count !== 1) throw new TypeError(`Navigation causal V2 aggregate log error changed: ${name}`);
    capturedErrorOccurrencesInAggregateLogs += count;
  }
  for (const [name, identity] of Object.entries(step14LogIdentities)) {
    const entry = entries.get(name);
    assertFixedBytes(entry, identity, `navigation causal V2 step 14 log ${name}`);
    const count = countOccurrences(entry.toString("utf8"), exactError);
    if (count !== 1) throw new TypeError(`Navigation causal V2 step 14 error changed: ${name}`);
    capturedErrorOccurrencesInStep14Logs += count;
  }
  return {
    entryCount: entries.size,
    totalUncompressedBytes: [...entries.values()].reduce((sum, entry) => sum + entry.length, 0),
    capturedErrorOccurrencesInAggregateLogs,
    capturedErrorOccurrencesInStep14Logs,
  };
}

function safeZipEntries(bytes) {
  let entries;
  try {
    entries = new AdmZip(bytes).getEntries();
  } catch (error) {
    throw new TypeError("Navigation causal V2 Actions logs are not a ZIP", { cause: error });
  }
  const result = new Map();
  let total = 0;
  for (const entry of entries) {
    if (!Buffer.isBuffer(entry.rawEntryName)) {
      throw new TypeError("Navigation causal V2 Actions log name is unavailable");
    }
    let name;
    try {
      name = utf8.decode(entry.rawEntryName);
    } catch (error) {
      throw new TypeError("Navigation causal V2 Actions log name is not UTF-8", { cause: error });
    }
    const header = entry.header ?? {};
    const segments = name.split(/[\\/]/u);
    if (!Buffer.from(name, "utf8").equals(entry.rawEntryName) || entry.isDirectory ||
      name.includes("\0") || name.normalize("NFC") !== name ||
      segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
      /^[A-Za-z]:/u.test(name) || result.has(name) ||
      ![0, 8].includes(header.method) || ((header.flags ?? 0) & 1) !== 0 ||
      !Number.isSafeInteger(header.size) || header.size < 1 || header.size > 256 * 1024 ||
      !Number.isSafeInteger(header.compressedSize) || header.compressedSize < 1 ||
      header.size / header.compressedSize > 200) {
      throw new TypeError(`Navigation causal V2 Actions log entry is unsafe: ${name}`);
    }
    total += header.size;
    if (total > 2 * 1024 * 1024) {
      throw new TypeError("Navigation causal V2 Actions logs expand beyond their bound");
    }
    const data = entry.getData();
    if (!Buffer.isBuffer(data) || data.length !== header.size) {
      throw new TypeError(`Navigation causal V2 Actions log entry bytes changed: ${name}`);
    }
    result.set(name, Buffer.from(data));
  }
  return result;
}

function assertAssetIdentity(bytes, name) {
  assertFixedBytes(bytes, navigationCausalV2FailureAssetIdentities[name], name);
}

function assertExactBytesObject(value, identities, label) {
  const names = Object.keys(identities).sort();
  if (!hasExactKeys(value, names)) throw new TypeError(`${label} inventory changed`);
  for (const name of names) assertFixedBytes(value[name], identities[name], `${label}: ${name}`);
}

function assertFixedBytes(bytes, identity, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== identity?.bytes ||
    sha256(bytes) !== identity.sha256) {
    throw new TypeError(`${label} bytes changed`);
  }
}

function parseCanonicalJson(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new TypeError(`${label} is empty`);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new TypeError(`${label} is not JSON`, { cause: error });
  }
  if (!canonicalJsonBytes(value).equals(bytes)) {
    throw new TypeError(`${label} is not canonical pretty JSON`);
  }
  return value;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fileIdentity(bytes) {
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function countOccurrences(value, needle) {
  let count = 0;
  for (let offset = 0; offset <= value.length - needle.length;) {
    const found = value.indexOf(needle, offset);
    if (found === -1) break;
    count += 1;
    offset = found + needle.length;
  }
  return count;
}

function hasExactKeys(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
}

function instant(value, label) {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} is invalid`);
  }
  return { text: value, epoch: Date.parse(value) };
}

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
