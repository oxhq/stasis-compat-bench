import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  bindNavigationCausalActionArchives,
} from "./navigation-causal-artifact-binding.mjs";
import {
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
  navigationCausalV4SelectionBinding,
} from "./navigation-causal-contract.mjs";
import {
  verifyNavigationCausalHostedProvenance,
} from "./navigation-causal-hosted-provenance.mjs";
import {
  navigationCausalWorkflowSourceIdentity,
} from "./navigation-causal-replication.mjs";
import {
  verifyNavigationCausalAnonymousContractPreflight,
  verifyNavigationCausalPublicContract,
  verifyNavigationCausalV4SelectionEvidence,
} from "./navigation-causal-public-release.mjs";
import {
  navigationCausalEvidenceReleaseIdentity,
  navigationCausalPublicationAssetNames,
  verifyNavigationCausalPublication,
} from "./navigation-causal-publication.mjs";

export const navigationCausalAnonymousEvidenceVerificationSchema =
  "stasis-v0.3.3-performance-navigation-causal-anonymous-evidence-verification-v1";
export const navigationCausalAnonymousPreflightReleaseVerificationSchema =
  "stasis-v0.3.3-performance-navigation-causal-anonymous-preflight-release-verification-v1";
export const navigationCausalAnonymousFetchPolicy = deepFreeze({
  authentication: "none",
  credentials: "omit",
  redirects: "manual_https_github_owned_hosts_only",
  maximumRedirects: 5,
  maximumApiResponseBytes: 8 * 1024 * 1024,
  maximumAssetBytes: 8 * 1024 * 1024,
  maximumTotalAssetBytes: 64 * 1024 * 1024,
  contentEncoding: "identity",
  retries: 0,
});

const gitShaPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

export function verifyNavigationCausalAnonymousEvidenceRelease({
  releaseRecord,
  evidenceTagRefRecord,
  contractTagRefRecord,
  v4TagRefRecord,
  assets,
} = {}) {
  const offline = verifyNavigationCausalPublication({ assets, v4TagRefRecord });
  requireRecord(releaseRecord, "navigation causal evidence release");
  const contractRelease = parseJson(assets["contract-release.json"], "contract release asset");
  const contractCommit = parseJson(assets["contract-commit.json"], "contract commit asset");
  const hosted = parseJson(
    assets["navigation-causal-hosted-provenance.json"],
    "hosted provenance asset",
  );
  const target = requireGitSha(contractRelease.target_commitish, "contract target SHA");
  if (contractCommit.sha !== target || releaseRecord.tag_name !== navigationCausalContractIdentity.evidenceTag ||
    releaseRecord.target_commitish !== target || releaseRecord.immutable !== true ||
    releaseRecord.draft !== false || releaseRecord.prerelease !== false) {
    throw new TypeError("Navigation causal public evidence release identity is invalid");
  }
  verifyLightweightTag(evidenceTagRefRecord, navigationCausalContractIdentity.evidenceTag, target);
  verifyLightweightTag(contractTagRefRecord, navigationCausalContractIdentity.tag, target);
  const releaseId = positiveInteger(releaseRecord.id, "evidence release ID");
  if (releaseRecord.url !==
    `https://api.github.com/repos/${navigationCausalEvidenceReleaseIdentity.repository}/releases/${releaseId}`) {
    throw new TypeError("Navigation causal evidence release API URL changed");
  }
  const created = instant(releaseRecord.created_at, "evidence release created_at");
  const published = instant(releaseRecord.published_at, "evidence release published_at");
  const terminal = instant(hosted?.producer?.completedAt, "hosted terminal time");
  if (created.epoch <= terminal.epoch || created.epoch > published.epoch ||
    published.epoch <= terminal.epoch) {
    throw new TypeError("Navigation causal evidence was not published after the hosted run became terminal");
  }
  const releasedAssets = verifyReleasedAssets(releaseRecord.assets, assets);
  return deepFreeze({
    schema: navigationCausalAnonymousEvidenceVerificationSchema,
    status: "passed",
    credentialsUsed: false,
    retries: false,
    redirectPolicy: navigationCausalAnonymousFetchPolicy.redirects,
    release: {
      id: releaseId,
      tag: releaseRecord.tag_name,
      targetCommitSha: target,
      immutable: true,
      lightweightTagDirectToTarget: true,
      contractLightweightTagDirectToTarget: true,
      createdAt: created.text,
      publishedAt: published.text,
      hostedCompletedAt: terminal.text,
      assetCount: releasedAssets.length,
    },
    outcome: offline.outcome,
    validMeasurement: offline.validMeasurement,
    evidencePublicationAuthorized: offline.evidencePublicationAuthorized,
    assets: releasedAssets,
    claimBoundary: {
      matchedNavigationCausalEffectAuthorized:
        offline.outcome === "VALID_REPLICATED_EFFECT",
      noEffectClaimAuthorized: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      comparisonCorpusChanged: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
  });
}

export async function verifyAnonymousNavigationCausalContractPreflight(
  { expectedContractTargetSha } = {},
  { fetchImpl = globalThis.fetch } = {},
) {
  requireFetch(fetchImpl);
  const target = requireGitSha(expectedContractTargetSha, "expected contract target SHA");
  const harnessApi =
    `https://api.github.com/repos/${navigationCausalContractIdentity.repository}`;
  const sourceApi =
    `https://api.github.com/repos/${navigationCausalWorkflowSourceIdentity.repository}`;
  const contractReleaseRecord = await fetchAnonymousJson(
    `${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`,
    "navigation causal contract release",
    fetchImpl,
  );
  if (contractReleaseRecord.target_commitish !== target) {
    throw new TypeError("Navigation causal contract release target differs from the expected H8b SHA");
  }
  const contractCommitRecord = await fetchAnonymousJson(
    `${harnessApi}/commits/${target}`,
    "navigation causal contract commit",
    fetchImpl,
  );
  const [contractTagRefRecord, v4ReleaseRecord, v4TagRefRecord,
    latestReleaseRecord] = await Promise.all([
    fetchAnonymousJson(
      `${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`,
      "navigation causal contract tag",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalV4SelectionBinding.source.tag)}`,
      "V4 evidence release",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalV4SelectionBinding.source.tag)}`,
      "V4 evidence tag",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${harnessApi}/releases/latest`,
      "latest public release during navigation causal contract preflight",
      fetchImpl,
    ),
  ]);
  const contractAssets = {};
  for (const [name, identity] of Object.entries(navigationCausalContractAssetIdentities)) {
    contractAssets[name] = await fetchAnonymousBytes(
      exactReleaseAssetUrl(navigationCausalContractIdentity.tag, name),
      {
        expectedBytes: identity.bytes,
        label: `navigation causal contract asset ${name}`,
        maximumBytes: identity.bytes,
        fetchImpl,
      },
    );
  }
  const localization = navigationCausalV4SelectionBinding.source.localizationAsset;
  const v4LocalizationBytes = await fetchAnonymousBytes(
    exactReleaseAssetUrl(navigationCausalV4SelectionBinding.source.tag, localization.name),
    {
      expectedBytes: localization.bytes,
      label: "V4 localization evidence asset",
      maximumBytes: localization.bytes,
      fetchImpl,
    },
  );
  const absence = {
    sourceRef: {
      status: await fetchAnonymousStatus(
        `${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`,
        404,
        "S5 source ref absence",
        fetchImpl,
      ),
    },
    sourceCommit: {
      status: await fetchAnonymousStatus(
        `${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`,
        422,
        "S5 source commit absence",
        fetchImpl,
      ),
    },
    evidenceRelease: {
      status: await fetchAnonymousStatus(
        `${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`,
        404,
        "navigation causal evidence release absence",
        fetchImpl,
      ),
    },
    evidenceTagRef: {
      status: await fetchAnonymousStatus(
        `${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`,
        404,
        "navigation causal evidence tag absence",
        fetchImpl,
      ),
    },
    workflowRuns: { status: 200 },
  };
  const workflowRunsListing = await fetchAnonymousJson(
    `${sourceApi}/actions/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&event=push&per_page=100`,
    "S5 workflow runs absence",
    fetchImpl,
  );
  return verifyNavigationCausalAnonymousContractPreflight({
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
  });
}

export async function verifyAnonymousNavigationCausalPreflightRelease(
  { expectedContractTargetSha, expectedReceiptBytes } = {},
  { fetchImpl = globalThis.fetch } = {},
) {
  requireFetch(fetchImpl);
  const target = requireGitSha(expectedContractTargetSha, "expected contract target SHA");
  const retainedReceiptBytes = requireCanonicalJsonBytes(
    expectedReceiptBytes,
    "expected anonymous contract preflight receipt",
  );
  const harnessApi =
    `https://api.github.com/repos/${navigationCausalContractIdentity.repository}`;
  const [contractReleaseRecord, latestReleaseRecord] = await Promise.all([
    fetchAnonymousJson(
      `${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`,
      "navigation causal contract release before receipt anchoring",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${harnessApi}/releases/latest`,
      "latest public release during navigation causal receipt anchoring",
      fetchImpl,
    ),
  ]);
  const release = await fetchPreflightReceiptReleaseAuthority({
    target,
    expectedReceiptBytes: retainedReceiptBytes,
    contractReleaseRecord,
    latestReleaseRecord,
    fetchImpl,
  });
  const refreshedReceipt = await verifyAnonymousNavigationCausalContractPreflight(
    { expectedContractTargetSha: target },
    { fetchImpl },
  );
  if (!canonicalJsonBytes(refreshedReceipt).equals(retainedReceiptBytes)) {
    throw new TypeError("Anchored navigation causal preflight receipt differs from the fresh absence gate");
  }
  return deepFreeze({
    schema: navigationCausalAnonymousPreflightReleaseVerificationSchema,
    status: "passed",
    credentialsUsed: false,
    retries: false,
    release,
    contractPreflightReceiptSchema: refreshedReceipt.schema,
    sourceAbsenceRecheckedAfterReceiptRelease: true,
    contractReleaseLatest: false,
    preflightReceiptReleaseLatest: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
}

export async function verifyAnonymousNavigationCausalPublicRelease(
  { expectedReleaseTargetSha } = {},
  { fetchImpl = globalThis.fetch } = {},
) {
  requireFetch(fetchImpl);
  const target = requireGitSha(expectedReleaseTargetSha, "expected evidence target SHA");
  const apiRoot =
    `https://api.github.com/repos/${navigationCausalEvidenceReleaseIdentity.repository}`;
  const [releaseRecord, latestReleaseRecord] = await Promise.all([
    fetchAnonymousJson(
      `${apiRoot}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`,
      "navigation causal evidence release",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/releases/latest`,
      "latest public release during navigation causal evidence verification",
      fetchImpl,
    ),
  ]);
  assertReleaseIsNotLatest(releaseRecord, latestReleaseRecord, "evidence");
  if (releaseRecord.target_commitish !== target || !Array.isArray(releaseRecord.assets) ||
    releaseRecord.assets.length !== navigationCausalPublicationAssetNames.length) {
    throw new TypeError("Navigation causal public evidence release pre-download identity changed");
  }
  const metadata = new Map(releaseRecord.assets.map((entry) => [entry.name, entry]));
  if (metadata.size !== navigationCausalPublicationAssetNames.length ||
    !isDeepStrictEqual([...metadata.keys()].sort(), [...navigationCausalPublicationAssetNames].sort())) {
    throw new TypeError("Navigation causal public evidence release pre-download inventory changed");
  }
  let total = 0;
  for (const name of navigationCausalPublicationAssetNames) {
    const size = metadata.get(name)?.size;
    if (!Number.isSafeInteger(size) || size < 1 ||
      size > navigationCausalAnonymousFetchPolicy.maximumAssetBytes) {
      throw new TypeError(`Navigation causal evidence asset is outside download bounds: ${name}`);
    }
    total += size;
  }
  if (total > navigationCausalAnonymousFetchPolicy.maximumTotalAssetBytes) {
    throw new TypeError("Navigation causal evidence release exceeds its total download bound");
  }
  const [evidenceTagRefRecord, contractTagRefRecord, v4TagRefRecord] = await Promise.all([
    fetchAnonymousJson(
      `${apiRoot}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`,
      "navigation causal evidence tag",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`,
      "navigation causal contract tag",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/ref/tags/${encodeURIComponent(navigationCausalV4SelectionBinding.source.tag)}`,
      "V4 evidence tag",
      fetchImpl,
    ),
  ]);
  const contractReleaseRecord = await fetchAnonymousJson(
    `${apiRoot}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`,
    "navigation causal live contract release",
    fetchImpl,
  );
  if (contractReleaseRecord.target_commitish !== target) {
    throw new TypeError("Navigation causal live contract target differs from evidence target");
  }
  assertReleaseIsNotLatest(contractReleaseRecord, latestReleaseRecord, "contract");
  const contractCommitRecord = await fetchAnonymousJson(
    `${apiRoot}/commits/${target}`,
    "navigation causal live contract commit",
    fetchImpl,
  );
  const contractAssets = {};
  for (const [name, identity] of Object.entries(navigationCausalContractAssetIdentities)) {
    contractAssets[name] = await fetchAnonymousBytes(
      exactReleaseAssetUrl(navigationCausalContractIdentity.tag, name),
      {
        expectedBytes: identity.bytes,
        label: `navigation causal live contract asset ${name}`,
        maximumBytes: identity.bytes,
        fetchImpl,
      },
    );
  }
  const publicContract = verifyNavigationCausalPublicContract({
    contractReleaseRecord,
    contractCommitRecord,
    contractTagRefRecord,
    contractAssets,
  });
  const liveV4Release = await fetchAnonymousJson(
    `${apiRoot}/releases/tags/${encodeURIComponent(navigationCausalV4SelectionBinding.source.tag)}`,
    "navigation causal live V4 evidence release",
    fetchImpl,
  );
  const liveV4Localization = await fetchAnonymousBytes(
    exactReleaseAssetUrl(
      navigationCausalV4SelectionBinding.source.tag,
      navigationCausalV4SelectionBinding.source.localizationAsset.name,
    ),
    {
      expectedBytes: navigationCausalV4SelectionBinding.source.localizationAsset.bytes,
      label: "navigation causal live V4 localization evidence",
      maximumBytes: navigationCausalV4SelectionBinding.source.localizationAsset.bytes,
      fetchImpl,
    },
  );
  verifyNavigationCausalV4SelectionEvidence(
    liveV4Release,
    v4TagRefRecord,
    liveV4Localization,
  );
  const assets = {};
  for (const name of navigationCausalPublicationAssetNames) {
    const size = metadata.get(name).size;
    assets[name] = await fetchAnonymousBytes(
      exactReleaseAssetUrl(navigationCausalContractIdentity.evidenceTag, name),
      {
        expectedBytes: size,
        label: `navigation causal evidence asset ${name}`,
        maximumBytes: size,
        fetchImpl,
      },
    );
  }
  const retainedContract = parseJson(assets["contract-release.json"], "retained contract release");
  const retainedCommit = parseJson(assets["contract-commit.json"], "retained contract commit");
  if (retainedContract.id !== publicContract.releaseId ||
    retainedContract.target_commitish !== publicContract.targetCommitSha ||
    retainedContract.published_at !== contractReleaseRecord.published_at ||
    retainedContract.url !== contractReleaseRecord.url ||
    retainedCommit.sha !== publicContract.targetCommitSha ||
    retainedCommit.commit?.tree?.sha !== publicContract.targetTreeSha) {
    throw new TypeError("Navigation causal retained contract records differ from live public authority");
  }
  const liveHostedAuthority = await verifyLiveHostedAuthority({
    assets,
    contractReleaseRecord,
    contractCommitRecord,
    fetchImpl,
  });
  const preflightReceiptRelease = await fetchPreflightReceiptReleaseAuthority({
    target,
    expectedReceiptBytes: assets["anonymous-contract-preflight.json"],
    contractReleaseRecord,
    latestReleaseRecord,
    mustBePublishedBefore: liveHostedAuthority.workflowRunCreatedAt,
    fetchImpl,
  });
  const verified = verifyNavigationCausalAnonymousEvidenceRelease({
    releaseRecord,
    evidenceTagRefRecord,
    contractTagRefRecord,
    v4TagRefRecord,
    assets,
  });
  return deepFreeze({ ...verified, preflightReceiptRelease, liveHostedAuthority });
}

async function fetchPreflightReceiptReleaseAuthority({
  target,
  expectedReceiptBytes,
  contractReleaseRecord,
  latestReleaseRecord,
  mustBePublishedBefore = undefined,
  fetchImpl,
}) {
  const receiptBytes = requireCanonicalJsonBytes(
    expectedReceiptBytes,
    "anonymous contract preflight receipt",
  );
  if (contractReleaseRecord?.target_commitish !== target) {
    throw new TypeError("Navigation causal contract and preflight receipt targets differ");
  }
  assertReleaseIsNotLatest(contractReleaseRecord, latestReleaseRecord, "contract");
  const contractPublished = instant(
    contractReleaseRecord.published_at,
    "contract release published_at",
  );
  const apiRoot =
    `https://api.github.com/repos/${navigationCausalContractIdentity.repository}`;
  const [releaseRecord, tagRefRecord] = await Promise.all([
    fetchAnonymousJson(
      `${apiRoot}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`,
      "navigation causal preflight receipt release",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`,
      "navigation causal preflight receipt tag",
      fetchImpl,
    ),
  ]);
  if (releaseRecord.tag_name !== navigationCausalContractIdentity.preflightTag ||
    releaseRecord.target_commitish !== target || releaseRecord.immutable !== true ||
    releaseRecord.draft !== false || releaseRecord.prerelease !== false ||
    !Array.isArray(releaseRecord.assets) || releaseRecord.assets.length !== 1) {
    throw new TypeError("Navigation causal preflight receipt release identity is invalid");
  }
  assertReleaseIsNotLatest(releaseRecord, latestReleaseRecord, "preflight receipt");
  verifyLightweightTag(tagRefRecord, navigationCausalContractIdentity.preflightTag, target);
  const releaseId = positiveInteger(releaseRecord.id, "preflight receipt release ID");
  if (releaseRecord.url !==
    `${apiRoot}/releases/${releaseId}`) {
    throw new TypeError("Navigation causal preflight receipt release API URL changed");
  }
  const created = instant(releaseRecord.created_at, "preflight receipt release created_at");
  const published = instant(releaseRecord.published_at, "preflight receipt release published_at");
  if (created.epoch <= contractPublished.epoch || created.epoch > published.epoch ||
    published.epoch <= contractPublished.epoch) {
    throw new TypeError("Navigation causal preflight receipt release was not published after its contract");
  }
  if (mustBePublishedBefore !== undefined &&
    published.epoch >= instant(
      mustBePublishedBefore,
      "navigation causal live workflow run created_at",
    ).epoch) {
    throw new TypeError("Navigation causal preflight receipt release was not published before S5 ran");
  }
  const asset = releaseRecord.assets[0];
  const digest = sha256(receiptBytes);
  const assetId = positiveInteger(asset?.id, "preflight receipt asset ID");
  if (asset.name !== navigationCausalContractIdentity.preflightAsset ||
    asset.state !== "uploaded" || asset.size !== receiptBytes.length ||
    asset.digest !== `sha256:${digest}` ||
    asset.browser_download_url !== exactReleaseAssetUrl(
      navigationCausalContractIdentity.preflightTag,
      navigationCausalContractIdentity.preflightAsset,
    )) {
    throw new TypeError("Navigation causal preflight receipt release asset identity changed");
  }
  const downloaded = await fetchAnonymousBytes(
    exactReleaseAssetUrl(
      navigationCausalContractIdentity.preflightTag,
      navigationCausalContractIdentity.preflightAsset,
    ),
    {
      expectedBytes: receiptBytes.length,
      label: "navigation causal anchored preflight receipt asset",
      maximumBytes: receiptBytes.length,
      fetchImpl,
    },
  );
  if (!downloaded.equals(receiptBytes)) {
    throw new TypeError("Navigation causal anchored preflight receipt bytes changed");
  }
  return {
    id: releaseId,
    tag: releaseRecord.tag_name,
    targetCommitSha: target,
    immutable: true,
    lightweightTagDirectToTarget: true,
    latest: false,
    createdAt: created.text,
    publishedAt: published.text,
    contractPublishedAt: contractPublished.text,
    asset: {
      id: assetId,
      name: asset.name,
      bytes: receiptBytes.length,
      sha256: digest,
    },
  };
}

async function verifyLiveHostedAuthority({
  assets,
  contractReleaseRecord,
  contractCommitRecord,
  fetchImpl,
}) {
  const retainedRun = parseJson(assets["workflow-run.json"], "retained workflow run");
  const retainedArtifacts = parseJson(
    assets["workflow-artifacts.json"],
    "retained workflow artifacts",
  );
  const runId = positiveInteger(retainedRun.id, "retained workflow run ID");
  const workflowId = positiveInteger(
    retainedRun.workflow_id,
    "retained workflow ID",
  );
  const sourceApi =
    `https://api.github.com/repos/${navigationCausalWorkflowSourceIdentity.repository}`;
  const [sourceBranchRefRecord, workflowSourceCommitRecord, runRecord,
    workflowRunsListing, jobsListing, liveArtifactsListing] = await Promise.all([
    fetchAnonymousJson(
      `${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`,
      "navigation causal live source branch ref",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`,
      "navigation causal live workflow source commit",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/actions/runs/${runId}`,
      "navigation causal live workflow run",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/actions/workflows/${workflowId}/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&event=push&per_page=100`,
      "navigation causal live workflow runs listing",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/actions/runs/${runId}/jobs?filter=all&per_page=100`,
      "navigation causal live workflow jobs listing",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/actions/runs/${runId}/artifacts?per_page=100`,
      "navigation causal live workflow artifacts listing",
      fetchImpl,
    ),
  ]);
  verifySourceBranchRef(sourceBranchRefRecord);
  const hostedInput = {
    runRecord,
    workflowRunsListing,
    jobsListing,
    artifactsListing: liveArtifactsListing,
    contractReleaseRecord,
    contractCommitRecord,
    workflowSourceCommitRecord,
  };
  const liveHosted = verifyNavigationCausalHostedProvenance(hostedInput);
  const retainedHosted = parseJson(
    assets["navigation-causal-hosted-provenance.json"],
    "retained hosted provenance",
  );
  if (!isDeepStrictEqual(liveHosted, retainedHosted)) {
    throw new TypeError("Navigation causal live hosted authority differs from released provenance");
  }
  const archives = Object.fromEntries(
    navigationCausalWorkflowSourceIdentity.workflow.jobs.map((job) => {
      const lane = job.id.endsWith("host-a") ? "host-a" : "host-b";
      return [job.artifact, assets[`actions-navigation-causal-${lane}.zip`]];
    }),
  );
  const liveBinding = bindNavigationCausalActionArchives({ hostedInput, archives });
  const retainedBinding = parseJson(
    assets["navigation-causal-artifact-binding.json"],
    "retained artifact binding",
  );
  const retainedReplication = parseJson(
    assets["navigation-causal-replication.json"],
    "retained replication",
  );
  if (!isDeepStrictEqual(liveBinding, retainedBinding) ||
    !isDeepStrictEqual(liveBinding.replication, retainedReplication)) {
    throw new TypeError("Navigation causal live Actions authority differs from released payload binding");
  }
  const retainedArtifactById = new Map(
    retainedArtifacts.artifacts?.map((artifact) => [artifact.id, artifact]) ?? [],
  );
  return {
    sourceBranchRef: navigationCausalWorkflowSourceIdentity.ref,
    workflowSourceCommitSha: liveHosted.source.commitSha,
    workflowId: liveHosted.producer.workflowId,
    workflowRunId: liveHosted.producer.runId,
    workflowRunAttempt: liveHosted.producer.runAttempt,
    workflowRunCreatedAt: liveHosted.producer.createdAt,
    jobs: liveHosted.jobs.map(({ lane, id }) => ({ lane, id })),
    artifacts: liveHosted.artifacts.map(({ lane, id, name }) => ({
      lane,
      id,
      name,
      expiredAtVerification: liveArtifactsListing.artifacts.find(
        (artifact) => artifact.id === id,
      )?.expired,
      retainedUnexpiredAtObservation: retainedArtifactById.get(id)?.expired === false,
    })),
    completeWorkflowListingReplayed: true,
    stableHostedProjectionMatchesReleasedReceipt: true,
    releasedArchiveBindingReplayedAgainstLiveMetadata: true,
    releasedReplicationReplayedAgainstLiveMetadata: true,
    actionsMetadataRetentionBoundary:
      "verification_requires_two_public_nonexpired_actions_artifacts",
    indefiniteLiveActionsReverificationClaimed: false,
  };
}

function verifySourceBranchRef(value) {
  if (value?.ref !== navigationCausalWorkflowSourceIdentity.ref ||
    value?.object?.type !== "commit" ||
    value.object.sha !== navigationCausalWorkflowSourceIdentity.revision) {
    throw new TypeError("Navigation causal live source branch no longer names the sole S5 commit");
  }
}

function verifyReleasedAssets(value, assets) {
  if (!Array.isArray(value) || value.length !== navigationCausalPublicationAssetNames.length) {
    throw new TypeError("Navigation causal public evidence release asset count changed");
  }
  const byName = new Map(value.map((entry) => [entry.name, entry]));
  if (byName.size !== navigationCausalPublicationAssetNames.length ||
    !isDeepStrictEqual([...byName.keys()].sort(), [...navigationCausalPublicationAssetNames].sort())) {
    throw new TypeError("Navigation causal public evidence release asset inventory changed");
  }
  const retained = navigationCausalPublicationAssetNames.map((name) => {
    const metadata = byName.get(name);
    const bytes = assets[name];
    const digest = sha256(bytes);
    const id = positiveInteger(metadata?.id, `evidence asset ${name} ID`);
    if (metadata.state !== "uploaded" || metadata.size !== bytes.length ||
      metadata.digest !== `sha256:${digest}` ||
      metadata.browser_download_url !==
        `https://github.com/${navigationCausalEvidenceReleaseIdentity.repository}/releases/download/${navigationCausalContractIdentity.evidenceTag}/${name}`) {
      throw new TypeError(`Navigation causal public evidence asset changed: ${name}`);
    }
    return { id, name, bytes: bytes.length, sha256: digest };
  });
  if (new Set(retained.map(({ id }) => id)).size !== retained.length) {
    throw new TypeError("Navigation causal public evidence assets reuse an ID");
  }
  return retained;
}

async function fetchAnonymousJson(url, label, fetchImpl) {
  const bytes = await fetchAnonymousBytes(url, {
    accept: "application/vnd.github+json",
    label,
    maximumBytes: navigationCausalAnonymousFetchPolicy.maximumApiResponseBytes,
    fetchImpl,
  });
  return parseJson(bytes, label);
}

async function fetchAnonymousStatus(url, expectedStatus, label, fetchImpl) {
  const response = await fetchOne(url, {
    accept: "application/vnd.github+json",
    fetchImpl,
    label,
    redirectCount: 0,
  });
  if (response.status !== expectedStatus) {
    await cancelBody(response);
    throw new TypeError(`${label} returned HTTP ${response.status}, expected ${expectedStatus}`);
  }
  await cancelBody(response);
  return response.status;
}

async function fetchAnonymousBytes(url, {
  accept = "application/octet-stream",
  expectedBytes,
  fetchImpl,
  label,
  maximumBytes,
}) {
  let current = url;
  for (let redirectCount = 0;
    redirectCount <= navigationCausalAnonymousFetchPolicy.maximumRedirects;
    redirectCount += 1) {
    const response = await fetchOne(current, { accept, fetchImpl, label, redirectCount });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === navigationCausalAnonymousFetchPolicy.maximumRedirects) {
        await cancelBody(response);
        throw new TypeError(`${label} exceeded the redirect limit`);
      }
      const location = response.headers.get("location");
      await cancelBody(response);
      current = requireAllowedRedirect(current, location, label);
      continue;
    }
    if (response.status !== 200) {
      await cancelBody(response);
      throw new TypeError(`${label} returned HTTP ${response.status}`);
    }
    const encoding = response.headers.get("content-encoding");
    if (encoding !== null && encoding.toLowerCase() !== "identity") {
      await cancelBody(response);
      throw new TypeError(`${label} returned encoded bytes`);
    }
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader !== null) {
      const length = Number(lengthHeader);
      if (!Number.isSafeInteger(length) || length < 0 || length > maximumBytes ||
        (expectedBytes !== undefined && length !== expectedBytes)) {
        await cancelBody(response);
        throw new TypeError(`${label} content length changed`);
      }
    }
    const bytes = await readBoundedBody(response, maximumBytes, label);
    if (expectedBytes !== undefined && bytes.length !== expectedBytes) {
      throw new TypeError(`${label} byte length changed`);
    }
    return bytes;
  }
  throw new TypeError(`${label} did not produce bytes`);
}

async function fetchOne(url, { accept, fetchImpl, label, redirectCount }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new TypeError(`${label} URL is invalid`, { cause: error });
  }
  if (parsed.protocol !== "https:" || !allowedGitHubHost(parsed.hostname)) {
    throw new TypeError(`${label} URL is not an allowed HTTPS GitHub host`);
  }
  const response = await fetchImpl(parsed, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    headers: {
      accept,
      "accept-encoding": "identity",
      "user-agent": "stasis-navigation-causal-anonymous-verifier-v1",
    },
  });
  if (response === null || typeof response !== "object" ||
    !Number.isSafeInteger(response.status) || response.headers === undefined) {
    throw new TypeError(`${label} fetch response ${redirectCount} is invalid`);
  }
  return response;
}

async function readBoundedBody(response, maximumBytes, label) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError(`${label} maximum byte bound is invalid`);
  }
  if (response.body === null || typeof response.body?.getReader !== "function") {
    throw new TypeError(`${label} response body is unavailable`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new TypeError(`${label} exceeded its byte bound`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function cancelBody(response) {
  if (response.body !== null && typeof response.body?.cancel === "function") {
    await response.body.cancel();
  }
}

function requireAllowedRedirect(from, location, label) {
  if (typeof location !== "string" || location.length === 0) {
    throw new TypeError(`${label} redirect has no location`);
  }
  const target = new URL(location, from);
  if (target.protocol !== "https:" || !allowedGitHubHost(target.hostname)) {
    throw new TypeError(`${label} redirect left the allowed HTTPS GitHub hosts`);
  }
  return target.href;
}

function allowedGitHubHost(hostname) {
  return hostname === "api.github.com" || hostname === "github.com" ||
    hostname.endsWith(".githubusercontent.com");
}

function exactReleaseAssetUrl(tag, name) {
  return `https://github.com/${navigationCausalEvidenceReleaseIdentity.repository}/releases/download/${tag}/${name}`;
}

function requireFetch(value) {
  if (typeof value !== "function") throw new TypeError("Anonymous navigation causal verification requires fetch");
}

function verifyLightweightTag(value, tag, target) {
  if (value?.ref !== `refs/tags/${tag}` || value?.object?.type !== "commit" ||
    value.object.sha !== target) {
    throw new TypeError(`Navigation causal tag is not a direct lightweight ref: ${tag}`);
  }
}

function parseJson(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new TypeError(`${label} is empty`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new TypeError(`${label} is not JSON`, { cause: error });
  }
}

function requireCanonicalJsonBytes(value, label) {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    throw new TypeError(`${label} must be nonempty bytes`);
  }
  const parsed = parseJson(value, label);
  if (!canonicalJsonBytes(parsed).equals(value)) {
    throw new TypeError(`${label} is not canonical pretty JSON`);
  }
  return value;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertReleaseIsNotLatest(release, latest, label) {
  const releaseId = positiveInteger(release?.id, `${label} release ID`);
  const latestId = positiveInteger(latest?.id, "latest release ID");
  if (releaseId === latestId) {
    throw new TypeError(`Navigation causal ${label} release unexpectedly became latest`);
  }
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireGitSha(value, label) {
  if (!gitShaPattern.test(value ?? "")) throw new TypeError(`${label} is invalid`);
  return value;
}

function instant(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new TypeError(`${label} is invalid`);
  return { text: value, epoch };
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} is invalid`);
  return value;
}

function sha256(bytes) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (!sha256Pattern.test(digest)) throw new TypeError("SHA-256 implementation returned an invalid digest");
  return digest;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
