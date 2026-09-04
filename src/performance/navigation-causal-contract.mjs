import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  navigationCausalHarnessIdentity,
  navigationCausalWorkflowSourceIdentity,
} from "./navigation-causal-replication.mjs";

export const navigationCausalPreflightSchema =
  "stasis-v0.3.3-performance-navigation-causal-preflight-v1";
export const navigationCausalSelectionBindingSchema =
  "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1";

export const navigationCausalContractIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  tag: "stasis-v0.3.3-performance-navigation-causal-contract-v1",
  preflightTag: "stasis-v0.3.3-performance-navigation-causal-preflight-v1",
  preflightAsset: "anonymous-contract-preflight.json",
  evidenceTag: "stasis-v0.3.3-performance-navigation-causal-evidence-v1",
  soleParentSha: navigationCausalHarnessIdentity.revision,
  assets: {
    protocol: "stasis-v0.3.3-performance-navigation-causal-v1.md",
    preflight: "stasis-v0.3.3-performance-navigation-causal-preflight-v1.json",
    workflow: "stasis-v0.3.3-performance-navigation-causal-workflow-v1.yml",
    selection: "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1.json",
  },
});

export const navigationCausalContractAssetIdentities = deepFreeze({
  "stasis-v0.3.3-performance-navigation-causal-v1.md": {
    bytes: 13_708,
    sha256: "fc9629bea46426d3455bece3b2688eca8b5da9ccb4ed4b20a74c729420afabe0",
  },
  "stasis-v0.3.3-performance-navigation-causal-preflight-v1.json": {
    bytes: 9_022,
    sha256: "241757bb9cedc26a5774a74585dc0f7e4c1d56363a4981b4ce944b704b2576bf",
  },
  "stasis-v0.3.3-performance-navigation-causal-workflow-v1.yml": {
    bytes: 40_758,
    sha256: "4ed396bba197d83b5033f506667df744e5d2a8b6c0e7f81081f3b850853ce472",
  },
  "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1.json": {
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
    throw new TypeError("Navigation causal workflow mirror differs from frozen S5 bytes");
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
