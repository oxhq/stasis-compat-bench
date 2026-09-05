import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  navigationCausalHarnessIdentity,
  navigationCausalWorkflowSourceIdentity,
} from "./navigation-causal-replication.mjs";
import {
  navigationCausalInvalidV2Evidence,
  navigationCausalV2FailureAssetIdentities,
  verifyNavigationCausalV2FailureArchive,
} from "./navigation-causal-v2-failure.mjs";

export const navigationCausalPreflightSchema =
  "stasis-v0.3.3-performance-navigation-causal-preflight-v3";
export const navigationCausalSelectionBindingSchema =
  "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v3";

export const navigationCausalContractIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  tag: "stasis-v0.3.3-performance-navigation-causal-contract-v3",
  preflightTag: "stasis-v0.3.3-performance-navigation-causal-preflight-v3",
  preflightAsset: "anonymous-contract-preflight-v3.json",
  evidenceTag: "stasis-v0.3.3-performance-navigation-causal-evidence-v3",
  soleParentSha: "a1352f2d31cb21bed7fae200c7fd638f850274f4",
  assets: {
    protocol: "stasis-v0.3.3-performance-navigation-causal-v3.md",
    preflight: "stasis-v0.3.3-performance-navigation-causal-preflight-v3.json",
    workflow: "stasis-v0.3.3-performance-navigation-causal-workflow-v3.yml",
    selection: "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v3.json",
    invalidV2FailureAuthority:
      "stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json",
    invalidV2ActionsLogs:
      "stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip",
  },
});

export const navigationCausalContractAssetIdentities = deepFreeze({
  "stasis-v0.3.3-performance-navigation-causal-v3.md": {
    bytes: 19_525,
    sha256: "99fe27a0258d30ad93e4b6466538c33a11878182ff751dd91a6981166049f6ee",
  },
  "stasis-v0.3.3-performance-navigation-causal-preflight-v3.json": {
    bytes: 23_034,
    sha256: "b8a7d776fcaed3df61a066c9c658e9941636d883c3444c8d24cc7ee30ccbf91f",
  },
  "stasis-v0.3.3-performance-navigation-causal-workflow-v3.yml": {
    bytes: 40_950,
    sha256: "d46cfeb840d139b2cbd10c834e114fc0df7a53fd677e026cfe0145549307bdd0",
  },
  "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v3.json": {
    bytes: 2_004,
    sha256: "1e56dc8b92da31fa9a197cb430cae3bfac457c63823ca5662d3007a8775cd35c",
  },
  ...navigationCausalV2FailureAssetIdentities,
});

export const navigationCausalInvalidV1Evidence = deepFreeze({
  status: "INVALID_PREFLIGHT_CHRONOLOGY_MODEL",
  observationStarted: false,
  authorizedS5CreationPushesConsumed: 0,
  authorizedS5CreationPushesRemaining: 1,
  contract: {
    releaseId: 383003193,
    tag: "stasis-v0.3.3-performance-navigation-causal-contract-v1",
    targetCommitSha: "8f84642fb2c2af9e439a7fcb5da89ada1d42bb67",
    targetTreeSha: "a73d8a07a8c6e81032ff14640e63de4e4fc905ac",
    soleParentSha: "11948d347204e3392fb960ed2966fcc63d769271",
    createdAt: "2026-09-04T20:39:28Z",
    publishedAt: "2026-09-04T20:40:00Z",
    assetCount: 4,
  },
  preflight: {
    releaseId: 383003691,
    tag: "stasis-v0.3.3-performance-navigation-causal-preflight-v1",
    targetCommitSha: "8f84642fb2c2af9e439a7fcb5da89ada1d42bb67",
    createdAt: "2026-09-04T20:39:28Z",
    publishedAt: "2026-09-04T20:41:03Z",
    asset: {
      id: 544876950,
      name: "anonymous-contract-preflight.json",
      bytes: 1_923,
      sha256: "2ce4fb18d32d59c653e44aa6c9bc866b1ff5aa4c977ce1106f88ddcd79e90fc1",
    },
  },
  gate: {
    command: "verify-preflight-public",
    error: "Navigation causal preflight receipt release was not published after its contract",
    rootCause:
      "v1_ordered_same_target_preflight_created_at_after_contract_published_at",
    invalidPredicateObserved: "preflight.created_at <= contract.published_at",
    contractPublishedBeforePreflightPublished: true,
    sourceBranchObserved: false,
    sourceCommitObserved: false,
    workflowRunsObserved: 0,
    v1EvidenceTag: "stasis-v0.3.3-performance-navigation-causal-evidence-v1",
    v1EvidenceReleaseObserved: false,
    v1EvidenceTagObserved: false,
  },
});

export const navigationCausalV1ContractAssetIdentities = deepFreeze({
  "stasis-v0.3.3-performance-navigation-causal-v1.md": {
    id: 544875767,
    blob: "d7010f486720a2bda324d53eb88f03e2dc0f3a01",
    bytes: 13_708,
    sha256: "fc9629bea46426d3455bece3b2688eca8b5da9ccb4ed4b20a74c729420afabe0",
  },
  "stasis-v0.3.3-performance-navigation-causal-preflight-v1.json": {
    id: 544875768,
    blob: "b3661b563eb3151bff6176a896b9fa379a3ef7f0",
    bytes: 9_022,
    sha256: "241757bb9cedc26a5774a74585dc0f7e4c1d56363a4981b4ce944b704b2576bf",
  },
  "stasis-v0.3.3-performance-navigation-causal-workflow-v1.yml": {
    id: 544875765,
    blob: "f24f67ac0d2c8b7b7cbd3a1e2bfc8a304c1c8038",
    bytes: 40_758,
    sha256: "4ed396bba197d83b5033f506667df744e5d2a8b6c0e7f81081f3b850853ce472",
  },
  "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1.json": {
    id: 544875764,
    blob: "6707176294181154f7caf7c641d7a8133166f704",
    bytes: 2_004,
    sha256: "9fd4efb7138175cc3db6341b0fd8693956390119fd4958dcdf1b27b438cbb436",
  },
});

export const navigationCausalV4SelectionBinding = deepFreeze({
  schema: navigationCausalSelectionBindingSchema,
  status: "frozen_before_navigation_causal_observation",
  purpose: "motivation_and_one_variable_selection_only",
  source: {
    repository: "oxhq/stasis-compat-bench",
    releaseId: 382939276,
    tag: "stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v4",
    targetCommitSha: "de1c9a000cba734c549f2fcee182e92c0565dff5",
    immutable: true,
    createdAt: "2026-09-04T18:21:35Z",
    publishedAt: "2026-09-04T18:31:00Z",
    assetCount: 22,
    localizationAsset: {
      id: 544735276,
      name: "crawl-phase-localization-evidence.json",
      bytes: 130092,
      sha256: "fdc8cd495f8cd6116763ddbbc84ec896123bde828d6fb17bcb508b1bc772f34f",
      schema: "stasis-v0.3.3-performance-crawl-phase-localization-evidence-v2",
      protocol: "stasis-v0.3.3-performance-crawl-phase-localization-v2",
    },
  },
  selection: {
    runner: "stasis",
    phaseCollection: "poolRuns",
    ordinal: 10,
    requestedUrl: "http://stasis-compat.test/navigation-start",
    acquireOpenNs: "2138374998",
    settleExtractNs: "1585211",
    releasePhysicalCleanupNs: "17473395",
    largestRecordedPhase: "acquireOpen",
    selectedTreatmentVariable: "requested_url",
    armA: "http://stasis-compat.test/navigation-start",
    armB: "http://stasis-compat.test/navigation-final",
  },
  interpretation: {
    navigationStartUsesJavascriptLocationHref: true,
    navigationStartIsNotAnHttpRedirect: true,
    selectionWasMadeBeforeEitherCausalHostRun: true,
    v4TimingImportedAsCausalSample: false,
    v4TimingImportedIntoCausalStatistics: false,
    v4ComparisonCorpusChanged: false,
    causalEffectAlreadyEstablished: false,
    webrenderOwnershipAlreadyEstablished: false,
  },
  claimBoundary: {
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  },
});

export const navigationCausalExpectedJobStepTopology = deepFreeze({
  "host-a": expectedSteps("A"),
  "host-b": expectedSteps("B"),
});

export function assertNavigationCausalV4SelectionBinding(value) {
  if (!isDeepStrictEqual(value, navigationCausalV4SelectionBinding)) {
    throw new TypeError("Navigation causal V4 selection binding changed");
  }
  return value;
}

export function assertNavigationCausalWorkflowMirror(bytes) {
  if (!Buffer.isBuffer(bytes) ||
    bytes.length !== navigationCausalWorkflowSourceIdentity.workflow.bytes ||
    sha256(bytes) !== navigationCausalWorkflowSourceIdentity.workflow.sha256 ||
    countByte(bytes, 0x0a) !== navigationCausalWorkflowSourceIdentity.workflow.lineCount ||
    countByte(bytes, 0x0d) !== 0 || bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ||
    bytes.at(-1) !== 0x0a) {
    throw new TypeError("Navigation causal workflow mirror differs from frozen S6 bytes");
  }
  return bytes;
}

export function assertNavigationCausalContractAssets(assets) {
  const expectedNames = Object.keys(navigationCausalContractAssetIdentities).sort();
  if (assets === null || typeof assets !== "object" || Array.isArray(assets) ||
    !isDeepStrictEqual(Object.keys(assets).sort(), expectedNames)) {
    throw new TypeError("Navigation causal contract asset inventory is not exact");
  }
  for (const name of expectedNames) {
    const bytes = assets[name];
    const identity = navigationCausalContractAssetIdentities[name];
    if (!Buffer.isBuffer(bytes) || bytes.length !== identity.bytes ||
      sha256(bytes) !== identity.sha256) {
      throw new TypeError(`Navigation causal contract asset bytes changed: ${name}`);
    }
  }
  assertNavigationCausalWorkflowMirror(assets[navigationCausalContractIdentity.assets.workflow]);
  verifyNavigationCausalV2FailureArchive({
    authorityBundleBytes:
      assets[navigationCausalContractIdentity.assets.invalidV2FailureAuthority],
    actionsLogsZipBytes:
      assets[navigationCausalContractIdentity.assets.invalidV2ActionsLogs],
  });
  const selection = parseCanonicalJson(
    assets[navigationCausalContractIdentity.assets.selection],
    "Navigation causal V4 selection binding",
  );
  assertNavigationCausalV4SelectionBinding(selection);
  const preflight = parseCanonicalJson(
    assets[navigationCausalContractIdentity.assets.preflight],
    "Navigation causal preflight",
  );
  if (preflight.schema !== navigationCausalPreflightSchema ||
    preflight.status !== "preregistered" ||
    !isDeepStrictEqual(
      preflight.contract.assetNames,
      Object.values(navigationCausalContractIdentity.assets),
    ) ||
    preflight.contract.preflightTag !== navigationCausalContractIdentity.preflightTag ||
    preflight.contract.preflightAsset !== navigationCausalContractIdentity.preflightAsset ||
    preflight.workflowSource.revision !== navigationCausalWorkflowSourceIdentity.revision ||
    preflight.harness.revision !== navigationCausalHarnessIdentity.revision ||
    !isDeepStrictEqual(preflight.harness, navigationCausalHarnessIdentity) ||
    preflight.bootIndependence.sameSaltRequiredAcrossJobs !== true ||
    preflight.bootIndependence.distinctHostClassDigestRequired !== false ||
    preflight.replication.statisticsPooledAcrossHosts !== false ||
    preflight.invocation.immutablePreflightReceiptReleaseRequired !== true ||
    preflight.invocation.contractReleaseLatest !== false ||
    preflight.invocation.preflightReceiptReleaseLatest !== false ||
    preflight.invocation.evidenceReleaseLatest !== false ||
    preflight.publicationPrivacy.documentHtmlPrivacyScannedBeforeOmission !== true ||
    preflight.publicationPrivacy.credentialLikeTextMayBeOmittedWithoutRejection !== false ||
    preflight.publicVerification.actionsArtifactMetadataRequiredPresentAndNonexpired !== true ||
    preflight.publicVerification.liveActionsReverificationRetentionBounded !== true ||
    preflight.publicVerification.indefiniteLiveActionsReverificationClaimed !== false ||
    !isDeepStrictEqual(preflight.invalidV1PreObservation, navigationCausalInvalidV1Evidence) ||
    !isDeepStrictEqual(preflight.invalidV2Infrastructure, navigationCausalInvalidV2Evidence) ||
    preflight.executionCorrection.environmentSnapshotExpression !== "{ ...process.env }" ||
    preflight.executionCorrection.environmentSnapshotCreatedOncePerCliInvocation !== true ||
    preflight.executionCorrection.ownEnumerableStringKeyValueEquivalenceRequired !== true ||
    preflight.executionCorrection.snapshotPrototypeRequired !== "Object.prototype" ||
    preflight.executionCorrection.measurementRunnerChanged !== false ||
    preflight.executionCorrection.candidateChanged !== false ||
    preflight.executionCorrection.armScheduleChanged !== false ||
    preflight.executionCorrection.successfulRerunAcceptedAsCorrectnessEvidence !== false ||
    preflight.chronology.crossReleaseOrderingField !== "published_at" ||
    preflight.chronology.createdAtOrderedAcrossSameTargetReleases !== false ||
    preflight.chronology.v2FailureTerminalBeforeV3ContractPublished !== true ||
    preflight.claimBoundary.decisionState !== "STAY_0_4_UNASSIGNED") {
    throw new TypeError("Navigation causal preflight boundary changed");
  }
  return assets;
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

function countByte(bytes, expected) {
  let count = 0;
  for (const value of bytes) if (value === expected) count += 1;
  return count;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseCanonicalJson(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new TypeError(`${label} is not JSON`, { cause: error });
  }
  if (!Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").equals(bytes)) {
    throw new TypeError(`${label} is not canonical pretty JSON`);
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
