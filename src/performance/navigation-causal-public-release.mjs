import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  assertNavigationCausalContractAssets,
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
  navigationCausalV4SelectionBinding,
} from "./navigation-causal-contract.mjs";
import {
  navigationCausalWorkflowSourceIdentity,
} from "./navigation-causal-replication.mjs";

export const navigationCausalAnonymousContractPreflightSchema =
  "stasis-v0.3.3-performance-navigation-causal-anonymous-contract-preflight-v1";

export const navigationCausalV4EvidenceAssets = deepFreeze({
  "actions-diagnostic-bundle.zip": [24504, "8b7459bed0699d561a1a0e1af8502f02a5865bd0b0558fb5718fd7ad735f0ff4"],
  "comparison-artifact-binding.json": [5086, "78d91f9c12f85d538dff1944e772614bf9b0adc9841d647c93ab8f608f1ba4ad"],
  "comparison-evidence-release-commit.json": [228009, "59981d35875e61909e1a16b3c007baf676d8e49e5e10870999dff588adc1f543"],
  "comparison-evidence-release.json": [55969, "c96beb535ca282cf03edb093de85a5c085d972a956fab3bfdcebd82d9bd184b8"],
  "comparison-fresh-crawl-raw.json": [221543, "52a76a4ebb726c6ab78b70356655e8abd7a5e84d9ce175a8e0d876f543c1a16b"],
  "comparison-input-verification.json": [3308, "7310e5bac0915965de5781db973518a6a2d63913c983ad63e60779e2248d1297"],
  "contract-commit.json": [595898, "3852064c04db33b02db19cb8934dd870c202a1decdf94e3be6e37c922c5fca6d"],
  "contract-release.json": [10415, "d1d409b4cdbdac64ee6d041d873e8b9965aaad33a478bf4da82d252749b1c4cc"],
  "crawl-phase-crawlee-raw.json": [24165, "f9ad3c26367f623727fd5c2f087a19da4ab9b9010b75c5ae91d389c0fd559276"],
  "crawl-phase-localization-evidence.json": [130092, "fdc8cd495f8cd6116763ddbbc84ec896123bde828d6fb17bcb508b1bc772f34f"],
  "crawl-phase-stasis-raw.json": [79590, "141d43e9fce3ff5ec99bcc3868403ffe708398f5300b99491949fdb8c23da86d"],
  "diagnostic-artifact-binding.json": [5011, "70f61a11684fd47cb8175a76b2c55e0b6789d98a88b9cb7f090df2bca78b7b58"],
  "diagnostic-outcome.json": [521, "6b7bb955b2f8cd557d6a57142918c8858dbced62612aa3a15183cd931a8815cd"],
  "diagnostic-verification.json": [3545, "fd22dc3b2861e09e3ec72298424f459d4e81cff4f9303807494e9f1ce103b63c"],
  "hosted-provenance.json": [21433, "ea47efa04d9232826cd9026c0347234731e3bd0f98bc6dcedb4acab652d325c5"],
  "privacy-scan.json": [12876, "8ff2f46e53319da00f34bdcdf0a4f6ab241f12c85245f5baa317a8c42e1efedd"],
  "SHA256SUMS.txt": [1963, "378997f743c815ca733a71cdcb5c818aff7786d2547e133c416e4f53b02ac082"],
  "workflow-artifacts.json": [945, "26a03a748e701b47effba3205a877ed2735de9f211539875c2e46dd2906c30ea"],
  "workflow-jobs.json": [8322, "52ff355526695c13f4ec9b2c18ae688482549c3414ec1dde3e2073649e4a26e6"],
  "workflow-run.json": [12689, "83f3941a5256222bd0c334a5ceb47d3be9e433a29627eb914bd33f31ca61c24e"],
  "workflow-runs.json": [13630, "4d3819806d23479a84fde10a707a06b2145b93569461df914b00bfb09716a7c2"],
  "workflow-source-commit.json": [71272, "5c4e3c8c7b9a72a3a2b928abd96d9c7fbbcd45175b0ea0a0c819f3cee33c9fbb"],
});

export function verifyNavigationCausalAnonymousContractPreflight({
  contractReleaseRecord,
  contractCommitRecord,
  contractTagRefRecord,
  contractAssets,
  latestReleaseRecord,
  absence,
  workflowRunsListing,
  v4ReleaseRecord,
  v4TagRefRecord,
  v4LocalizationBytes,
} = {}) {
  const contract = verifyContractPublication(
    contractReleaseRecord,
    contractCommitRecord,
    contractTagRefRecord,
    contractAssets,
  );
  assertReleaseIsNotLatest(contractReleaseRecord, latestReleaseRecord, "contract");
  verifyPreObservationAbsence({
    absence,
    workflowRunsListing,
  });
  const v4 = verifyV4Selection(v4ReleaseRecord, v4TagRefRecord, v4LocalizationBytes);
  return deepFreeze(createAnonymousContractPreflightReceipt({ contract, v4 }));
}

export function assertNavigationCausalAnonymousContractPreflightReceipt(
  value,
  { contractReleaseRecord, contractCommitRecord, v4ReleaseRecord } = {},
) {
  const contractTarget = requireGitSha(
    contractReleaseRecord?.target_commitish,
    "retained preflight contract target",
  );
  if (contractCommitRecord?.sha !== contractTarget) {
    throw new TypeError("Retained preflight contract records disagree");
  }
  const expected = createAnonymousContractPreflightReceipt({
    contract: {
      releaseId: positiveInteger(contractReleaseRecord.id, "retained preflight contract release ID"),
      tag: navigationCausalContractIdentity.tag,
      targetCommitSha: contractTarget,
      targetTreeSha: requireGitSha(
        contractCommitRecord?.commit?.tree?.sha,
        "retained preflight contract tree SHA",
      ),
      lightweightTagDirectToTarget: true,
      soleParentSha: navigationCausalContractIdentity.soleParentSha,
      publishedAt: canonicalInstant(
        contractReleaseRecord?.published_at,
        "retained preflight contract published_at",
      ),
      assetCount: Object.keys(navigationCausalContractAssetIdentities).length,
    },
    v4: expectedV4Receipt(v4ReleaseRecord),
  });
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError("Anonymous navigation causal contract preflight receipt does not replay");
  }
  return value;
}

function createAnonymousContractPreflightReceipt({ contract, v4 }) {
  return {
    schema: navigationCausalAnonymousContractPreflightSchema,
    status: "passed",
    credentialsUsed: false,
    retries: false,
    redirectPolicy: "manual_https_github_owned_hosts_only",
    contract,
    sourceAbsence: {
      repository: navigationCausalWorkflowSourceIdentity.repository,
      branch: navigationCausalWorkflowSourceIdentity.branch,
      ref: navigationCausalWorkflowSourceIdentity.ref,
      commitSha: navigationCausalWorkflowSourceIdentity.revision,
      evidenceTag: navigationCausalContractIdentity.evidenceTag,
      httpStatuses: {
        sourceRef: 404,
        sourceCommit: 422,
        workflowRuns: 200,
        evidenceRelease: 404,
        evidenceTagRef: 404,
      },
      workflowRunCount: 0,
      verified: true,
    },
    v4,
    oneShotRules: {
      oneS5CreationPush: true,
      contractReleaseLatest: false,
      rerun: false,
      replacementRun: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
  };
}

export function verifyNavigationCausalV4SelectionEvidence(
  releaseRecord,
  tagRefRecord,
  localizationBytes,
) {
  return deepFreeze(verifyV4Selection(releaseRecord, tagRefRecord, localizationBytes));
}

export function verifyNavigationCausalPublicContract({
  contractReleaseRecord,
  contractCommitRecord,
  contractTagRefRecord,
  contractAssets,
} = {}) {
  return deepFreeze(verifyContractPublication(
    contractReleaseRecord,
    contractCommitRecord,
    contractTagRefRecord,
    contractAssets,
  ));
}

function verifyContractPublication(release, commit, tagRef, assets) {
  if (release?.tag_name !== navigationCausalContractIdentity.tag || release.immutable !== true ||
    release.draft !== false || release.prerelease !== false ||
    !/^[a-f0-9]{40}$/u.test(release.target_commitish ?? "") ||
    commit?.sha !== release.target_commitish || !Array.isArray(commit.parents) ||
    commit.parents.length !== 1 || commit.parents[0]?.sha !== navigationCausalContractIdentity.soleParentSha ||
    tagRef?.ref !== `refs/tags/${navigationCausalContractIdentity.tag}` ||
    tagRef?.object?.type !== "commit" || tagRef.object.sha !== commit.sha) {
    throw new TypeError("Navigation causal public contract identity is invalid");
  }
  assertNavigationCausalContractAssets(assets);
  const expected = Object.keys(navigationCausalContractAssetIdentities).sort();
  if (!Array.isArray(release.assets) || release.assets.length !== expected.length ||
    release.assets.some((asset) => {
      const identity = navigationCausalContractAssetIdentities[asset.name];
      return identity === undefined || asset.size !== identity.bytes ||
        asset.digest !== `sha256:${identity.sha256}`;
    }) || new Set(release.assets.map(({ name }) => name)).size !== expected.length) {
    throw new TypeError("Navigation causal public contract release assets changed");
  }
  if (!Array.isArray(commit.files)) {
    throw new TypeError("Navigation causal contract commit file inventory is unavailable");
  }
  for (const [name, bytes] of Object.entries(assets)) {
    const path = `protocol/${name}`;
    const file = commit.files.find((entry) => entry.filename === path);
    if (file?.status !== "added" || file.sha !== gitBlobSha(bytes)) {
      throw new TypeError(`Navigation causal contract asset is not its H8b Git blob: ${name}`);
    }
  }
  return {
    releaseId: positiveInteger(release.id, "contract release ID"),
    tag: release.tag_name,
    targetCommitSha: commit.sha,
    targetTreeSha: requireGitSha(commit.commit?.tree?.sha, "contract tree SHA"),
    lightweightTagDirectToTarget: true,
    soleParentSha: navigationCausalContractIdentity.soleParentSha,
    publishedAt: canonicalInstant(release.published_at, "contract published_at"),
    assetCount: expected.length,
  };
}

function assertReleaseIsNotLatest(release, latest, label) {
  const releaseId = positiveInteger(release?.id, `${label} release ID`);
  const latestId = positiveInteger(latest?.id, "latest release ID");
  if (releaseId === latestId) {
    throw new TypeError(`Navigation causal ${label} release unexpectedly became latest`);
  }
}

function canonicalInstant(value, label) {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function verifyPreObservationAbsence(value) {
  const expectedStatuses = {
    sourceRef: 404,
    sourceCommit: 422,
    evidenceRelease: 404,
    evidenceTagRef: 404,
    workflowRuns: 200,
  };
  if (value.absence === null || typeof value.absence !== "object" ||
    Object.keys(expectedStatuses).some((name) =>
      value.absence[name]?.status !== expectedStatuses[name]) ||
    value.workflowRunsListing?.total_count !== 0 ||
    !Array.isArray(value.workflowRunsListing?.workflow_runs) ||
    value.workflowRunsListing.workflow_runs.length !== 0) {
    throw new TypeError("Navigation causal pre-observation source or evidence is not absent");
  }
}

function expectedV4Receipt(release) {
  const binding = navigationCausalV4SelectionBinding;
  if (release?.id !== binding.source.releaseId || release.tag_name !== binding.source.tag ||
    release.target_commitish !== binding.source.targetCommitSha) {
    throw new TypeError("Retained preflight V4 release identity changed");
  }
  return {
    releaseId: binding.source.releaseId,
    tag: binding.source.tag,
    targetCommitSha: binding.source.targetCommitSha,
    localizationAssetId: binding.source.localizationAsset.id,
    localizationAssetSha256: binding.source.localizationAsset.sha256,
    selectedJsonPointer: "/observations/stasis/phases/poolRuns/9",
    selectedOrdinal: binding.selection.ordinal,
    timingImportedIntoCausalStatistics: false,
  };
}

function verifyV4Selection(release, tagRef, localizationBytes) {
  const binding = navigationCausalV4SelectionBinding;
  if (release?.id !== binding.source.releaseId || release.tag_name !== binding.source.tag ||
    release.target_commitish !== binding.source.targetCommitSha || release.immutable !== true ||
    release.draft !== false || release.prerelease !== false ||
    tagRef?.ref !== `refs/tags/${binding.source.tag}` || tagRef?.object?.type !== "commit" ||
    tagRef.object.sha !== binding.source.targetCommitSha || !Array.isArray(release.assets) ||
    release.assets.length !== Object.keys(navigationCausalV4EvidenceAssets).length) {
    throw new TypeError("Navigation causal V4 public release identity is invalid");
  }
  const seen = new Set();
  for (const asset of release.assets) {
    const identity = navigationCausalV4EvidenceAssets[asset.name];
    if (identity === undefined || seen.has(asset.name) || asset.size !== identity[0] ||
      asset.digest !== `sha256:${identity[1]}`) {
      throw new TypeError("Navigation causal V4 public release asset inventory changed");
    }
    seen.add(asset.name);
  }
  const selectedAsset = release.assets.find(
    ({ name }) => name === binding.source.localizationAsset.name,
  );
  if (selectedAsset?.id !== binding.source.localizationAsset.id) {
    throw new TypeError("Navigation causal V4 localization asset ID changed");
  }
  if (!Buffer.isBuffer(localizationBytes) ||
    localizationBytes.length !== binding.source.localizationAsset.bytes ||
    sha256(localizationBytes) !== binding.source.localizationAsset.sha256) {
    throw new TypeError("Navigation causal V4 localization bytes changed");
  }
  const localization = JSON.parse(localizationBytes.toString("utf8"));
  const selected = localization?.observations?.stasis?.phases?.poolRuns?.[9];
  const provenance = localization?.diagnosticAttestation?.provenance;
  if (localization.schema !== binding.source.localizationAsset.schema ||
    localization.protocol !== binding.source.localizationAsset.protocol ||
    selected?.ordinal !== binding.selection.ordinal ||
    selected.requestedUrl !== binding.selection.requestedUrl ||
    selected.acquireOpen?.durationNs !== binding.selection.acquireOpenNs ||
    selected.settleExtract?.durationNs !== binding.selection.settleExtractNs ||
    selected.releasePhysicalCleanup?.durationNs !== binding.selection.releasePhysicalCleanupNs ||
    provenance?.runId !== "33905672027" || provenance.runAttempt !== "1" ||
    provenance.workflowSourceSha !== "b4c847b6543e34677630c311b20d9e3ff64d0925") {
    throw new TypeError("Navigation causal V4 selected observation changed");
  }
  return {
    releaseId: binding.source.releaseId,
    tag: binding.source.tag,
    targetCommitSha: binding.source.targetCommitSha,
    localizationAssetId: binding.source.localizationAsset.id,
    localizationAssetSha256: binding.source.localizationAsset.sha256,
    selectedJsonPointer: "/observations/stasis/phases/poolRuns/9",
    selectedOrdinal: selected.ordinal,
    timingImportedIntoCausalStatistics: false,
  };
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} is invalid`);
  return value;
}

function requireGitSha(value, label) {
  if (!/^[a-f0-9]{40}$/u.test(value ?? "")) throw new TypeError(`${label} is invalid`);
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
