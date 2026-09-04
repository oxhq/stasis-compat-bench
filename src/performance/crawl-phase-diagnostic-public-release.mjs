import { createHash } from "node:crypto";
import { isDeepStrictEqual, TextDecoder } from "node:util";

import {
  crawlPhaseDiagnosticComparisonEvidenceIdentity,
  crawlPhaseDiagnosticComparisonEvidenceTargetSha,
  crawlPhaseDiagnosticContractIdentity,
  crawlPhaseDiagnosticOutcomeClasses,
  crawlPhaseDiagnosticPublicationAssetNamesByOutcome,
  crawlPhaseDiagnosticPublicationIdentity,
  crawlPhaseDiagnosticReleaseVerificationSchema,
  verifyCrawlPhaseDiagnosticGitHubRelease,
} from "./crawl-phase-diagnostic-publication.mjs";
import {
  assertCrawlPhaseDiagnosticContractAssets,
  assertCrawlPhaseDiagnosticPreflightHostedBinding as assertPreflightProvenanceBinding,
  verifyCrawlPhaseDiagnosticWorkflowSourceProvenance,
} from "./crawl-phase-diagnostic-hosted-provenance.mjs";

export const crawlPhaseDiagnosticAnonymousReleaseVerificationSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-anonymous-release-verification-v1";

export const crawlPhaseDiagnosticAnonymousFetchPolicy = deepFreeze({
  authentication: "none",
  credentials: "omit",
  redirects: "manual_https_github_owned_hosts_only",
  maximumRedirects: 5,
  maximumApiResponseBytes: 8 * 1024 * 1024,
  maximumAssetBytes: 256 * 1024 * 1024,
  maximumTotalAssetBytes: 512 * 1024 * 1024,
  maximumContractAssetBytes: 8 * 1024 * 1024,
  maximumTotalContractAssetBytes: 16 * 1024 * 1024,
  contentEncoding: "identity",
  retries: 0,
});

const gitShaPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const positiveIntegerPattern = /^(?:0|[1-9][0-9]*)$/u;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const utf8 = new TextDecoder("utf-8", { fatal: true });

export async function verifyAnonymousCrawlPhaseDiagnosticPublicRelease(
  { expectedOfflineAssetMap, expectedReleaseTargetSha } = {},
  {
    assertPreflightHostedBinding = assertContractPreflightHostedEvidence,
    fetchImpl = globalThis.fetch,
    verifyRelease = verifyCrawlPhaseDiagnosticGitHubRelease,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Anonymous diagnostic release verification requires fetch");
  }
  if (typeof verifyRelease !== "function") {
    throw new TypeError("Anonymous diagnostic release verifier dependency is invalid");
  }
  if (typeof assertPreflightHostedBinding !== "function") {
    throw new TypeError("Anonymous diagnostic preflight binding dependency is invalid");
  }
  if (!gitShaPattern.test(expectedReleaseTargetSha ?? "")) {
    throw new TypeError("Expected diagnostic evidence target must be one Git SHA");
  }
  if (expectedReleaseTargetSha === crawlPhaseDiagnosticComparisonEvidenceTargetSha) {
    throw new TypeError("Diagnostic target must differ from comparison evidence target");
  }
  const expected = validateExpectedOfflineAssetMap(expectedOfflineAssetMap);
  const identity = crawlPhaseDiagnosticPublicationIdentity;
  const apiRoot = `https://api.github.com/repos/${identity.repository}`;
  const releaseBytes = await fetchAnonymousBytes(
    `${apiRoot}/releases/tags/${encodeURIComponent(identity.tag)}`,
    {
      accept: "application/vnd.github+json",
      fetchImpl,
      label: "diagnostic evidence release API",
      maximumBytes: crawlPhaseDiagnosticAnonymousFetchPolicy.maximumApiResponseBytes,
    },
  );
  const releaseRecord = parseJsonBytes(releaseBytes, "diagnostic evidence release API");
  const releaseAssets = validateReleaseBeforeDownloads(
    releaseRecord,
    expected,
    expectedReleaseTargetSha,
  );

  const comparisonTagRefRecord = await fetchTagRef(
    crawlPhaseDiagnosticComparisonEvidenceIdentity,
    crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    "comparison evidence tag",
    fetchImpl,
  );
  const contractTagRefRecord = await fetchTagRef(
    crawlPhaseDiagnosticContractIdentity,
    expectedReleaseTargetSha,
    "diagnostic contract tag",
    fetchImpl,
  );
  const releaseTagRefRecord = await fetchTagRef(
    crawlPhaseDiagnosticPublicationIdentity,
    expectedReleaseTargetSha,
    "diagnostic evidence tag",
    fetchImpl,
  );

  const commitBytes = await fetchAnonymousBytes(
    `${apiRoot}/commits/${expectedReleaseTargetSha}`,
    {
      accept: "application/vnd.github+json",
      fetchImpl,
      label: "diagnostic evidence target commit API",
      maximumBytes: crawlPhaseDiagnosticAnonymousFetchPolicy.maximumApiResponseBytes,
    },
  );
  const releaseTargetCommitRecord = parseJsonBytes(
    commitBytes,
    "diagnostic evidence target commit API",
  );
  validateEvidenceTargetCommit(releaseTargetCommitRecord, expectedReleaseTargetSha);

  const contractReplay = await fetchAndVerifyAnonymousDiagnosticContract({
    fetchImpl,
    releaseTargetCommitRecord,
    targetSha: expectedReleaseTargetSha,
  });
  const workflowSourceReplay = await fetchAndVerifyAnonymousWorkflowSource({
    fetchImpl,
    preflightValue: contractReplay.preflightValue,
    workflowMirrorBytes: contractReplay.workflowBytes,
  });

  const anonymousDownloadedAssetBytes = {};
  for (const name of expected.names) {
    const identityEntry = expected.map[name];
    const bytes = await fetchAnonymousBytes(exactAssetDownloadUrl(name), {
      accept: "application/octet-stream",
      expectedBytes: identityEntry.bytes,
      fetchImpl,
      label: `diagnostic evidence asset ${name}`,
      maximumBytes: identityEntry.bytes,
    });
    const digest = sha256(bytes);
    if (bytes.byteLength !== identityEntry.bytes || digest !== identityEntry.sha256) {
      throw new TypeError(`Anonymous diagnostic evidence asset bytes mismatch: ${name}`);
    }
    const apiAsset = releaseAssets.get(name);
    if (apiAsset.size !== bytes.byteLength || apiAsset.digest !== `sha256:${digest}`) {
      throw new TypeError(`Anonymous diagnostic asset API binding mismatch: ${name}`);
    }
    anonymousDownloadedAssetBytes[name] = bytes;
  }

  assertRetainedContractReplay({
    currentCommitRecord: releaseTargetCommitRecord,
    currentReleaseRecord: contractReplay.releaseRecord,
    retainedCommitBytes: anonymousDownloadedAssetBytes["contract-commit.json"],
    retainedReleaseBytes: anonymousDownloadedAssetBytes["contract-release.json"],
  });
  const retainedHostedReceipt = parseJsonBytes(
    anonymousDownloadedAssetBytes["hosted-provenance.json"],
    "retained diagnostic hosted provenance receipt",
  );
  if (
    assertPreflightHostedBinding(
      contractReplay.preflightValue,
      retainedHostedReceipt,
      contractReplay.receipt,
    ) !== retainedHostedReceipt
  ) {
    throw new TypeError("Diagnostic contract preflight does not bind to hosted evidence");
  }
  if (!isDeepStrictEqual(workflowSourceReplay, retainedHostedReceipt.workflowSource)) {
    throw new TypeError("Anonymous diagnostic workflow source differs from hosted evidence");
  }

  const releaseVerification = verifyRelease({
    releaseRecord,
    comparisonTagRefRecord,
    contractTagRefRecord,
    releaseTagRefRecord,
    releaseTargetCommitRecord,
    expectedReleaseTargetSha,
    anonymousDownloadedAssetBytes,
  });
  const verifiedAssets = assertReleaseVerificationReceipt(
    releaseVerification,
    expectedReleaseTargetSha,
    releaseRecord.id,
    expected,
  );
  return deepFreeze({
    schema: crawlPhaseDiagnosticAnonymousReleaseVerificationSchema,
    status: "passed",
    diagnosticStatus: releaseVerification.diagnosticStatus,
    outcomeClass: expected.outcomeClass,
    purpose: "anonymous_non_authoritative_diagnostic_release_verification",
    release: {
      repository: identity.repository,
      tag: identity.tag,
      releaseId: releaseRecord.id,
      targetCommitSha: expectedReleaseTargetSha,
      tagBindings: structuredClone(releaseVerification.tagBindings),
      publishedAt: releaseRecord.published_at,
      immutable: true,
      draft: false,
      prerelease: false,
    },
    releaseVerifierSchema: releaseVerification.schema,
    contract: contractReplay.receipt,
    assetByteMap: verifiedAssets,
    transport: crawlPhaseDiagnosticAnonymousFetchPolicy,
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    verification: {
      exactOutcomeSpecificAssetInventory: true,
      exactUploadedAssetIdsSizesDigestsAndUrls: true,
      publicApiFetchedWithoutCredentials: true,
      publicAssetsFetchedWithoutCredentials: true,
      anonymousBytesMatchOfflineByteMap: true,
      offlinePublicationReverifiedFromAnonymousBytes: true,
      immutableContractReleaseFetchedWithoutCredentials: true,
      exactThreeContractAssetInventory: true,
      contractAssetBytesMatchReleaseMetadata: true,
      contractAssetGitBlobsMatchDiagnosticTarget: true,
      currentContractStateMatchesRetainedEvidence: true,
      contractPreflightMatchesHostedEvidence: true,
      contractWorkflowAssetMatchesHostedEvidence: true,
      targetDirectSuccessorOfComparisonEvidence: true,
      comparisonTagRefBoundToComparisonEvidenceTarget: true,
      contractTagRefBoundToDiagnosticTarget: true,
      evidenceTagRefBoundToDiagnosticTarget: true,
      allThreeTagsVerifiedLightweight: true,
      authorityGranted: false,
      timingAuthorityGranted: false,
      comparisonAuthorityGranted: false,
      optimizationAuthorityGranted: false,
      urlsRetained: false,
      responseHeadersRetained: false,
      rawPayloadsRetained: false,
    },
  });
}

async function fetchAndVerifyAnonymousDiagnosticContract({
  fetchImpl,
  releaseTargetCommitRecord,
  targetSha,
}) {
  const identity = crawlPhaseDiagnosticContractIdentity;
  const apiRoot = `https://api.github.com/repos/${identity.repository}`;
  const releaseBytes = await fetchAnonymousBytes(
    `${apiRoot}/releases/tags/${encodeURIComponent(identity.tag)}`,
    {
      accept: "application/vnd.github+json",
      fetchImpl,
      label: "diagnostic contract release API",
      maximumBytes: crawlPhaseDiagnosticAnonymousFetchPolicy.maximumApiResponseBytes,
    },
  );
  const releaseRecord = parseJsonBytes(releaseBytes, "diagnostic contract release API");
  const release = validateContractReleaseBeforeDownloads(releaseRecord, targetSha);
  const assetBytes = {};
  for (const name of release.names) {
    const metadata = release.assets.get(name);
    const bytes = await fetchAnonymousBytes(exactContractAssetDownloadUrl(name), {
      accept: "application/octet-stream",
      expectedBytes: metadata.size,
      fetchImpl,
      label: `diagnostic contract asset ${name}`,
      maximumBytes: metadata.size,
    });
    const digest = sha256(bytes);
    if (bytes.byteLength !== metadata.size || `sha256:${digest}` !== metadata.digest) {
      throw new TypeError(`Anonymous diagnostic contract asset bytes mismatch: ${name}`);
    }
    assetBytes[name] = bytes;
  }
  const preflightBytes = assetBytes[identity.assets.preflight];
  const preflightValue = parseJsonBytes(
    preflightBytes,
    "diagnostic contract preflight asset",
  );
  const contractAssets = assertCrawlPhaseDiagnosticContractAssets({
    protocol: assetBytes[identity.assets.protocol],
    workflow: assetBytes[identity.assets.workflow],
    preflight: {
      value: preflightValue,
      bytes: preflightBytes,
    },
  });
  const committed = validateContractAssetGitBlobs(
    releaseTargetCommitRecord,
    targetSha,
    assetBytes,
  );
  const assets = release.names.map((name) => {
    const metadata = release.assets.get(name);
    const bytes = assetBytes[name];
    return {
      name,
      assetId: metadata.id,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      blobSha: committed.get(name),
    };
  });
  const workflowIdentity = assets.find(({ name }) => name === identity.assets.workflow);
  if (workflowIdentity?.blobSha !== contractAssets.workflow.blobSha) {
    throw new TypeError("Diagnostic contract workflow blob does not match its preflight");
  }
  return {
    preflightValue,
    releaseRecord,
    workflowBytes: Buffer.from(assetBytes[identity.assets.workflow]),
    receipt: deepFreeze({
      repository: identity.repository,
      tag: identity.tag,
      releaseId: release.releaseId,
      targetCommitSha: targetSha,
      publishedAt: release.publishedAt,
      immutable: true,
      draft: false,
      prerelease: false,
      assetCount: assets.length,
      assets,
    }),
  };
}

async function fetchAndVerifyAnonymousWorkflowSource({
  fetchImpl,
  preflightValue,
  workflowMirrorBytes,
}) {
  const source = requireRecord(preflightValue?.workflowSource,
    "diagnostic contract workflow source");
  const repository = source.repository;
  const apiRoot = `https://api.github.com/repos/${repository}`;
  const [commitRecord, rootTreeRecord, workflowBlobRecord,
    preservedComparisonWorkflowBlobRecord] = await Promise.all([
    fetchAnonymousJson(
      `${apiRoot}/commits/${source.commitSha}`,
      "diagnostic workflow source commit API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/trees/${source.treeSha}`,
      "diagnostic workflow source root tree API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/blobs/${source.workflow?.blobSha}`,
      "diagnostic workflow source blob API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/blobs/${source.preservedComparisonWorkflow?.blobSha}`,
      "preserved comparison workflow blob API",
      fetchImpl,
    ),
  ]);
  const githubTreeSha = directoryTreeShaForFetch(rootTreeRecord, {
    repository,
    expectedTreeSha: source.treeSha,
    path: ".github",
    label: "diagnostic workflow source .github directory",
  });
  const githubTreeRecord = await fetchAnonymousJson(
    `${apiRoot}/git/trees/${githubTreeSha}`,
    "diagnostic workflow source .github tree API",
    fetchImpl,
  );
  const workflowsTreeSha = directoryTreeShaForFetch(githubTreeRecord, {
    repository,
    expectedTreeSha: githubTreeSha,
    path: "workflows",
    label: "diagnostic workflow source workflows directory",
  });
  const workflowsTreeRecord = await fetchAnonymousJson(
    `${apiRoot}/git/trees/${workflowsTreeSha}`,
    "diagnostic workflow source workflows tree API",
    fetchImpl,
  );
  return verifyCrawlPhaseDiagnosticWorkflowSourceProvenance({
    workflowSourceCommitRecord: commitRecord,
    workflowSourceTreeRecords: {
      root: rootTreeRecord,
      github: githubTreeRecord,
      workflows: workflowsTreeRecord,
    },
    workflowSourceBlobRecord: workflowBlobRecord,
    preservedComparisonWorkflowBlobRecord,
    diagnosticContractWorkflowBytes: workflowMirrorBytes,
    diagnosticContractPreflightValue: preflightValue,
  });
}

async function fetchAnonymousJson(url, label, fetchImpl) {
  const bytes = await fetchAnonymousBytes(url, {
    accept: "application/vnd.github+json",
    fetchImpl,
    label,
    maximumBytes: crawlPhaseDiagnosticAnonymousFetchPolicy.maximumApiResponseBytes,
  });
  return parseJsonBytes(bytes, label);
}

function directoryTreeShaForFetch(value, {
  repository,
  expectedTreeSha,
  path,
  label,
}) {
  const tree = requireRecord(value, `${label} parent tree`);
  if (
    tree.sha !== expectedTreeSha || tree.truncated !== false || !Array.isArray(tree.tree)
  ) {
    throw new TypeError(`${label} parent is not one complete nonrecursive tree`);
  }
  exactString(
    tree.url,
    `https://api.github.com/repos/${repository}/git/trees/${expectedTreeSha}`,
    `${label} parent tree URL`,
  );
  const matches = tree.tree.filter((entry) =>
    requireRecord(entry, `${label} candidate`).path === path);
  if (matches.length !== 1) throw new TypeError(`${label} must occur exactly once`);
  const entry = matches[0];
  if (
    entry.mode !== "040000" || entry.type !== "tree" ||
    !gitShaPattern.test(entry.sha ?? "")
  ) {
    throw new TypeError(`${label} identity is invalid`);
  }
  exactString(
    entry.url,
    `https://api.github.com/repos/${repository}/git/trees/${entry.sha}`,
    `${label} URL`,
  );
  return entry.sha;
}

function validateContractReleaseBeforeDownloads(value, targetSha) {
  const release = requireRecord(value, "diagnostic contract release record");
  const identity = crawlPhaseDiagnosticContractIdentity;
  const releaseId = positiveSafeInteger(release.id, "diagnostic contract release ID");
  if (
    release.tag_name !== identity.tag ||
    release.target_commitish !== targetSha ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  ) {
    throw new TypeError("Diagnostic contract release identity or immutable state mismatch");
  }
  const publishedAt = release.published_at;
  canonicalInstant(publishedAt, "diagnostic contract release published_at");
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  exactString(release.url, `${api}/releases/${releaseId}`, "contract release API URL");
  exactString(release.assets_url, `${api}/releases/${releaseId}/assets`,
    "contract release assets URL");
  exactString(
    release.upload_url,
    `https://uploads.github.com/repos/${identity.repository}/releases/${releaseId}/assets{?name,label}`,
    "contract release upload URL",
  );
  exactString(release.html_url, `${web}/releases/tag/${identity.tag}`,
    "contract release web URL");
  const names = Object.values(identity.assets).sort(compareUtf8);
  if (!Array.isArray(release.assets) || release.assets.length !== names.length) {
    throw new TypeError("Diagnostic contract release must contain exactly three assets");
  }
  const assets = new Map();
  const ids = new Set();
  let totalBytes = 0;
  for (const raw of release.assets) {
    const asset = requireRecord(raw, "diagnostic contract release asset");
    if (
      typeof asset.name !== "string" ||
      !names.includes(asset.name) ||
      assets.has(asset.name)
    ) {
      throw new TypeError("Diagnostic contract release asset is unknown or duplicated");
    }
    const id = positiveSafeInteger(asset.id, `diagnostic contract asset ID: ${asset.name}`);
    if (ids.has(id)) throw new TypeError("Diagnostic contract release asset ID is duplicated");
    ids.add(id);
    if (
      asset.state !== "uploaded" ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 1 ||
      asset.size > crawlPhaseDiagnosticAnonymousFetchPolicy.maximumContractAssetBytes ||
      typeof asset.digest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/u.test(asset.digest)
    ) {
      throw new TypeError(`Diagnostic contract release asset metadata is invalid: ${asset.name}`);
    }
    totalBytes += asset.size;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > crawlPhaseDiagnosticAnonymousFetchPolicy.maximumTotalContractAssetBytes
    ) {
      throw new TypeError("Diagnostic contract release assets exceed total byte bound");
    }
    exactString(asset.url, `${api}/releases/assets/${id}`,
      `contract asset API URL: ${asset.name}`);
    exactString(asset.browser_download_url, exactContractAssetDownloadUrl(asset.name),
      `contract asset download URL: ${asset.name}`);
    assets.set(asset.name, {
      id,
      name: asset.name,
      size: asset.size,
      digest: asset.digest,
      state: asset.state,
      url: asset.url,
      browserDownloadUrl: asset.browser_download_url,
    });
  }
  if (assets.size !== names.length) {
    throw new TypeError("Diagnostic contract release asset inventory is incomplete");
  }
  return { releaseId, publishedAt, names, assets };
}

function validateContractAssetGitBlobs(commitRecord, targetSha, assetBytes) {
  const commit = requireRecord(commitRecord, "diagnostic contract target commit record");
  if (!Array.isArray(commit.files)) {
    throw new TypeError("Diagnostic contract target commit files are unavailable");
  }
  const identity = crawlPhaseDiagnosticContractIdentity;
  const expected = new Map(Object.entries(assetBytes).map(([name, bytes]) => [
    `protocol/${name}`,
    { name, blobSha: gitBlobSha(bytes) },
  ]));
  const matched = new Map();
  const seenPaths = new Set();
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  for (const raw of commit.files) {
    const file = requireRecord(raw, "diagnostic contract target changed file");
    if (typeof file.filename !== "string" || seenPaths.has(file.filename)) {
      throw new TypeError("Diagnostic contract target changed-file paths are invalid or duplicated");
    }
    seenPaths.add(file.filename);
    const expectedFile = expected.get(file.filename);
    if (expectedFile === undefined) continue;
    if (file.status !== "added" || file.sha !== expectedFile.blobSha) {
      throw new TypeError(`Diagnostic contract target Git blob mismatch: ${expectedFile.name}`);
    }
    const encodedFilename = encodeURIComponent(file.filename);
    exactString(file.blob_url, `${web}/blob/${targetSha}/${encodedFilename}`,
      `contract target blob URL: ${expectedFile.name}`);
    exactString(file.raw_url, `${web}/raw/${targetSha}/${encodedFilename}`,
      `contract target raw URL: ${expectedFile.name}`);
    exactString(file.contents_url, `${api}/contents/${encodedFilename}?ref=${targetSha}`,
      `contract target contents URL: ${expectedFile.name}`);
    matched.set(expectedFile.name, expectedFile.blobSha);
  }
  if (matched.size !== expected.size) {
    throw new TypeError("Diagnostic contract assets are not exact added blobs in H2");
  }
  return matched;
}

function assertRetainedContractReplay({
  currentCommitRecord,
  currentReleaseRecord,
  retainedCommitBytes,
  retainedReleaseBytes,
}) {
  const retainedCommit = parseJsonBytes(retainedCommitBytes, "retained diagnostic contract commit");
  const retainedRelease = parseJsonBytes(retainedReleaseBytes,
    "retained diagnostic contract release");
  const currentRelease = contractReleaseProjection(currentReleaseRecord);
  if (!isDeepStrictEqual(contractReleaseProjection(retainedRelease), currentRelease)) {
    throw new TypeError("Current diagnostic contract release differs from retained evidence");
  }
  if (!isDeepStrictEqual(
    contractCommitProjection(retainedCommit),
    contractCommitProjection(currentCommitRecord),
  )) {
    throw new TypeError("Current diagnostic contract commit differs from retained evidence");
  }
}

function assertContractPreflightHostedEvidence(preflightValue, hostedReceipt, contractReceipt) {
  const contract = requireRecord(contractReceipt, "verified diagnostic contract receipt");
  if (!Array.isArray(contract.assets)) {
    throw new TypeError("Verified diagnostic contract asset identities are unavailable");
  }
  const workflowName = crawlPhaseDiagnosticContractIdentity.assets.workflow;
  const workflowAsset = contract.assets.find(({ name }) => name === workflowName);
  if (workflowAsset === undefined) {
    throw new TypeError("Verified diagnostic contract workflow asset is unavailable");
  }
  if (assertPreflightProvenanceBinding(preflightValue, hostedReceipt, {
    workflow: {
      bytes: workflowAsset.bytes,
      sha256: workflowAsset.sha256,
      blobSha: workflowAsset.blobSha,
    },
  }) !== hostedReceipt) {
    throw new TypeError("Diagnostic preflight provenance binding rejected hosted evidence");
  }
  return hostedReceipt;
}

function contractReleaseProjection(value) {
  const release = requireRecord(value, "diagnostic contract release projection");
  if (!Array.isArray(release.assets)) {
    throw new TypeError("Diagnostic contract release projection assets are invalid");
  }
  return {
    id: release.id,
    tagName: release.tag_name,
    targetCommitish: release.target_commitish,
    immutable: release.immutable,
    draft: release.draft,
    prerelease: release.prerelease,
    publishedAt: release.published_at,
    url: release.url,
    assetsUrl: release.assets_url,
    uploadUrl: release.upload_url,
    htmlUrl: release.html_url,
    assets: release.assets.map((asset) => {
      requireRecord(asset, "diagnostic contract release projection asset");
      return {
        id: asset.id,
        name: asset.name,
        state: asset.state,
        size: asset.size,
        digest: asset.digest,
        url: asset.url,
        browserDownloadUrl: asset.browser_download_url,
      };
    }).sort((left, right) => compareUtf8(left.name, right.name)),
  };
}

function contractCommitProjection(value) {
  const commit = requireRecord(value, "diagnostic contract commit projection");
  const payload = requireRecord(commit.commit, "diagnostic contract commit payload");
  const tree = requireRecord(payload.tree, "diagnostic contract commit tree");
  if (!Array.isArray(commit.parents) || !Array.isArray(commit.files)) {
    throw new TypeError("Diagnostic contract commit projection is incomplete");
  }
  const prefix = "protocol/";
  const expectedNames = new Set(Object.values(crawlPhaseDiagnosticContractIdentity.assets));
  const contractFiles = commit.files.filter((file) => {
    requireRecord(file, "diagnostic contract commit projection file");
    return typeof file.filename === "string" && file.filename.startsWith(prefix) &&
      expectedNames.has(file.filename.slice(prefix.length));
  });
  return {
    sha: commit.sha,
    url: commit.url,
    htmlUrl: commit.html_url,
    treeSha: tree.sha,
    treeUrl: tree.url,
    parents: commit.parents.map((parent) => {
      requireRecord(parent, "diagnostic contract commit projection parent");
      return { sha: parent.sha, url: parent.url, htmlUrl: parent.html_url };
    }),
    files: contractFiles.map((file) => ({
      filename: file.filename,
      status: file.status,
      sha: file.sha,
      blobUrl: file.blob_url,
      rawUrl: file.raw_url,
      contentsUrl: file.contents_url,
    })).sort((left, right) => compareUtf8(left.filename, right.filename)),
  };
}

async function fetchTagRef(identity, targetSha, label, fetchImpl) {
  const endpoint = `https://api.github.com/repos/${identity.repository}/git/ref/tags/${encodeURIComponent(identity.tag)}`;
  const bytes = await fetchAnonymousBytes(endpoint, {
    accept: "application/vnd.github+json",
    fetchImpl,
    label: `${label} ref API`,
    maximumBytes: crawlPhaseDiagnosticAnonymousFetchPolicy.maximumApiResponseBytes,
  });
  const record = parseJsonBytes(bytes, `${label} ref API`);
  validateLightweightTagRef(record, identity, targetSha, label);
  return record;
}

function validateExpectedOfflineAssetMap(value) {
  const record = requireRecord(value, "expected offline diagnostic asset map");
  const actualNames = Reflect.ownKeys(record);
  const matchingClasses = crawlPhaseDiagnosticOutcomeClasses.filter((outcomeClass) => {
    const names = crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass];
    return actualNames.every((name) => typeof name === "string") &&
      actualNames.length === names.length && names.every((name) => Object.hasOwn(record, name));
  });
  if (matchingClasses.length !== 1) {
    throw new TypeError("Expected offline diagnostic map is not one exact outcome inventory");
  }
  const outcomeClass = matchingClasses[0];
  const names = crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass];
  let totalBytes = 0;
  const map = {};
  for (const name of names) {
    const entry = exactKeys(record[name], ["bytes", "sha256"], `offline diagnostic identity: ${name}`);
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > crawlPhaseDiagnosticAnonymousFetchPolicy.maximumAssetBytes ||
      !sha256Pattern.test(entry.sha256 ?? "")
    ) {
      throw new TypeError(`Expected offline diagnostic identity is invalid: ${name}`);
    }
    totalBytes += entry.bytes;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > crawlPhaseDiagnosticAnonymousFetchPolicy.maximumTotalAssetBytes
    ) {
      throw new TypeError("Expected offline diagnostic assets exceed total byte bound");
    }
    map[name] = { bytes: entry.bytes, sha256: entry.sha256 };
  }
  return deepFreeze({ outcomeClass, names: [...names], map });
}

function validateReleaseBeforeDownloads(releaseRecord, expected, targetSha) {
  const release = requireRecord(releaseRecord, "diagnostic evidence release record");
  const identity = crawlPhaseDiagnosticPublicationIdentity;
  const releaseId = positiveSafeInteger(release.id, "diagnostic evidence release ID");
  if (
    release.tag_name !== identity.tag ||
    release.target_commitish !== targetSha ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  ) {
    throw new TypeError("Diagnostic evidence release identity or immutable state mismatch");
  }
  canonicalInstant(release.published_at, "diagnostic evidence release published_at");
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  exactString(release.url, `${api}/releases/${releaseId}`, "release API URL");
  exactString(release.assets_url, `${api}/releases/${releaseId}/assets`, "release assets URL");
  exactString(
    release.upload_url,
    `https://uploads.github.com/repos/${identity.repository}/releases/${releaseId}/assets{?name,label}`,
    "release upload URL",
  );
  exactString(release.html_url, `${web}/releases/tag/${identity.tag}`, "release web URL");
  if (!Array.isArray(release.assets) || release.assets.length !== expected.names.length) {
    throw new TypeError("Diagnostic evidence release asset count differs from outcome inventory");
  }
  const assets = new Map();
  const ids = new Set();
  for (const raw of release.assets) {
    const asset = requireRecord(raw, "diagnostic evidence release asset");
    if (typeof asset.name !== "string" || !Object.hasOwn(expected.map, asset.name) || assets.has(asset.name)) {
      throw new TypeError("Diagnostic evidence release asset is unknown or duplicated");
    }
    const id = positiveSafeInteger(asset.id, `diagnostic asset ID: ${asset.name}`);
    if (ids.has(id)) throw new TypeError("Diagnostic evidence release asset ID is duplicated");
    ids.add(id);
    const identityEntry = expected.map[asset.name];
    if (
      asset.state !== "uploaded" ||
      asset.size !== identityEntry.bytes ||
      asset.digest !== `sha256:${identityEntry.sha256}`
    ) {
      throw new TypeError(`Diagnostic evidence release metadata mismatch: ${asset.name}`);
    }
    exactString(asset.url, `${api}/releases/assets/${id}`, `asset API URL: ${asset.name}`);
    exactString(asset.browser_download_url, exactAssetDownloadUrl(asset.name), `asset download URL: ${asset.name}`);
    assets.set(asset.name, asset);
  }
  if (assets.size !== expected.names.length) {
    throw new TypeError("Diagnostic evidence release inventory is incomplete");
  }
  return assets;
}

function validateEvidenceTargetCommit(value, targetSha) {
  const commit = requireRecord(value, "diagnostic evidence target commit record");
  const identity = crawlPhaseDiagnosticPublicationIdentity;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  if (commit.sha !== targetSha) throw new TypeError("Diagnostic target commit SHA mismatch");
  exactString(commit.url, `${api}/commits/${targetSha}`, "target commit API URL");
  exactString(commit.html_url, `${web}/commit/${targetSha}`, "target commit web URL");
  const payload = requireRecord(commit.commit, "diagnostic target commit payload");
  const tree = requireRecord(payload.tree, "diagnostic target commit tree");
  if (!gitShaPattern.test(tree.sha ?? "")) {
    throw new TypeError("Diagnostic target commit tree SHA is invalid");
  }
  exactString(tree.url, `${api}/git/trees/${tree.sha}`, "target commit tree URL");
  if (!Array.isArray(commit.parents) || commit.parents.length !== 1) {
    throw new TypeError("Diagnostic target commit must have exactly one parent");
  }
  const parent = requireRecord(commit.parents[0], "diagnostic target parent");
  if (parent.sha !== crawlPhaseDiagnosticComparisonEvidenceTargetSha) {
    throw new TypeError("Diagnostic target is not a direct successor of comparison evidence");
  }
  exactString(
    parent.url,
    `${api}/commits/${crawlPhaseDiagnosticComparisonEvidenceTargetSha}`,
    "target parent API URL",
  );
  exactString(
    parent.html_url,
    `${web}/commit/${crawlPhaseDiagnosticComparisonEvidenceTargetSha}`,
    "target parent web URL",
  );
}

function validateLightweightTagRef(value, identity, targetSha, label) {
  const record = requireRecord(value, `${label} ref record`);
  const expectedRef = `refs/tags/${identity.tag}`;
  if (record.ref !== expectedRef) throw new TypeError(`${label} ref mismatch`);
  const api = `https://api.github.com/repos/${identity.repository}`;
  exactString(record.url, `${api}/git/refs/tags/${encodeURIComponent(identity.tag)}`, `${label} API URL`);
  const object = requireRecord(record.object, `${label} object`);
  if (object.type !== "commit" || object.sha !== targetSha) {
    throw new TypeError(`${label} must resolve as the exact lightweight commit ref`);
  }
  exactString(object.url, `${api}/git/commits/${targetSha}`, `${label} object API URL`);
}

function assertReleaseVerificationReceipt(receipt, targetSha, releaseId, expected) {
  const value = requireRecord(receipt, "diagnostic release verification receipt");
  if (
    value.schema !== crawlPhaseDiagnosticReleaseVerificationSchema ||
    value.status !== "passed" ||
    value.diagnosticStatus !==
      (expected.outcomeClass === "VALID_NON_AUTHORITATIVE" ? "passed" : "failed") ||
    value.outcomeClass !== expected.outcomeClass ||
    value.releaseId !== releaseId ||
    value.contractTargetSha !== targetSha ||
    value.evidenceTargetSha !== targetSha ||
    value.comparisonEvidenceTargetSha !== crawlPhaseDiagnosticComparisonEvidenceTargetSha ||
    value.assetCount !== expected.names.length ||
    value.anonymousDownloadedBytesVerified !== true ||
    value.releaseImmutable !== true ||
    value.releaseDraft !== false ||
    value.releasePrerelease !== false ||
    value.contractAndEvidenceTagsShareExactTarget !== true ||
    value.targetDirectSuccessorOfComparisonEvidence !== true ||
    value.authorityEligible !== false ||
    value.timingEligible !== false ||
    value.statisticsEligible !== false ||
    value.comparisonEligible !== false ||
    value.optimizationEligible !== false ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    !Array.isArray(value.assets) ||
    value.assets.length !== expected.names.length
  ) {
    throw new TypeError("Diagnostic release verification receipt is invalid");
  }
  const bindings = requireRecord(value.tagBindings, "diagnostic release tag bindings");
  for (const [key, identity, sha] of [
    ["comparison", crawlPhaseDiagnosticComparisonEvidenceIdentity, crawlPhaseDiagnosticComparisonEvidenceTargetSha],
    ["contract", crawlPhaseDiagnosticContractIdentity, targetSha],
    ["evidence", crawlPhaseDiagnosticPublicationIdentity, targetSha],
  ]) {
    const binding = exactKeys(bindings[key], ["ref", "objectType", "objectSha", "lightweight"], `${key} tag binding`);
    if (
      binding.ref !== `refs/tags/${identity.tag}` ||
      binding.objectType !== "commit" ||
      binding.objectSha !== sha ||
      binding.lightweight !== true
    ) {
      throw new TypeError(`Diagnostic ${key} tag binding is invalid`);
    }
  }
  const assets = [];
  for (let index = 0; index < expected.names.length; index += 1) {
    const name = expected.names[index];
    const asset = exactKeys(value.assets[index], ["name", "bytes", "sha256"], `verified asset: ${name}`);
    const identityEntry = expected.map[name];
    if (
      asset.name !== name ||
      asset.bytes !== identityEntry.bytes ||
      asset.sha256 !== identityEntry.sha256
    ) {
      throw new TypeError(`Diagnostic verified asset mismatch: ${name}`);
    }
    assets.push({ name, bytes: asset.bytes, sha256: asset.sha256 });
  }
  return deepFreeze(assets);
}

async function fetchAnonymousBytes(initialUrl, {
  accept,
  expectedBytes,
  fetchImpl,
  label,
  maximumBytes,
}) {
  let current = requireSafePublicUrl(initialUrl, label);
  const visited = new Set();
  for (let redirects = 0; ; redirects += 1) {
    if (visited.has(current.href)) throw new TypeError(`${label} redirect loop detected`);
    visited.add(current.href);
    let response;
    try {
      response = await fetchImpl(current.href, {
        method: "GET",
        headers: { Accept: accept, "Accept-Encoding": "identity" },
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      throw new TypeError(`${label} request failed`, { cause: error });
    }
    assertResponseShape(response, label);
    if (redirectStatuses.has(response.status)) {
      await discardBody(response);
      if (redirects >= crawlPhaseDiagnosticAnonymousFetchPolicy.maximumRedirects) {
        throw new TypeError(`${label} exceeded redirect bound`);
      }
      const location = response.headers.get("location");
      if (typeof location !== "string" || location.length === 0) {
        throw new TypeError(`${label} redirect has no Location`);
      }
      current = requireSafePublicUrl(new URL(location, current).href, label);
      continue;
    }
    if (response.status !== 200) {
      await discardBody(response);
      throw new TypeError(`${label} returned HTTP ${response.status}`);
    }
    const contentEncoding = response.headers.get("content-encoding");
    if (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity") {
      await discardBody(response);
      throw new TypeError(`${label} returned encoded response body`);
    }
    const contentLength = parseContentLength(response.headers.get("content-length"), label);
    if (expectedBytes !== undefined && contentLength !== null && contentLength !== expectedBytes) {
      await discardBody(response);
      throw new TypeError(`${label} Content-Length differs from offline byte map`);
    }
    if (contentLength !== null && contentLength > maximumBytes) {
      await discardBody(response);
      throw new TypeError(`${label} exceeds byte bound`);
    }
    const bytes = await readBoundedBody(response, maximumBytes, label);
    if (expectedBytes !== undefined && bytes.byteLength !== expectedBytes) {
      throw new TypeError(`${label} byte length differs from offline byte map`);
    }
    return bytes;
  }
}

function requireSafePublicUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new TypeError(`${label} URL is invalid`, { cause: error });
  }
  if (
    url.protocol !== "https:" ||
    url.username.length !== 0 ||
    url.password.length !== 0 ||
    url.hash.length !== 0 ||
    (url.port.length !== 0 && url.port !== "443") ||
    !isGitHubOwnedHost(url.hostname)
  ) {
    throw new TypeError(`${label} URL is outside anonymous HTTPS policy`);
  }
  return url;
}

function isGitHubOwnedHost(hostname) {
  const value = hostname.toLowerCase();
  return value === "github.com" || value === "api.github.com" ||
    value === "objects.githubusercontent.com" ||
    value === "release-assets.githubusercontent.com" ||
    value.endsWith(".githubusercontent.com");
}

function assertResponseShape(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    !Number.isSafeInteger(value.status) ||
    value.headers === null ||
    typeof value.headers !== "object" ||
    typeof value.headers.get !== "function"
  ) {
    throw new TypeError(`${label} returned invalid response`);
  }
}

async function readBoundedBody(response, maximumBytes, label) {
  if (response.body === null || typeof response.body?.getReader !== "function") {
    throw new TypeError(`${label} response body is not readable bytes`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result?.done === true) {
        complete = true;
        break;
      }
      if (!(result?.value instanceof Uint8Array)) {
        throw new TypeError(`${label} response yielded non-byte chunk`);
      }
      const chunk = Buffer.from(result.value.buffer, result.value.byteOffset, result.value.byteLength);
      total += chunk.byteLength;
      if (!Number.isSafeInteger(total) || total > maximumBytes) {
        throw new TypeError(`${label} exceeds byte bound`);
      }
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    if (!complete) await Promise.resolve(reader.cancel()).catch(() => {});
    if (typeof reader.releaseLock === "function") reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function discardBody(response) {
  if (response.body !== null && typeof response.body?.cancel === "function") {
    await Promise.resolve(response.body.cancel()).catch(() => {});
  }
}

function parseJsonBytes(bytes, label) {
  let text;
  try {
    text = utf8.decode(bytes);
  } catch (error) {
    throw new TypeError(`${label} is not UTF-8`, { cause: error });
  }
  try {
    return requireRecord(JSON.parse(text), label);
  } catch (error) {
    throw new TypeError(`${label} is not valid JSON`, { cause: error });
  }
}

function parseContentLength(value, label) {
  if (value === null) return null;
  if (!positiveIntegerPattern.test(value)) throw new TypeError(`${label} returned invalid Content-Length`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new TypeError(`${label} returned unsafe Content-Length`);
  return parsed;
}

function exactAssetDownloadUrl(name) {
  const identity = crawlPhaseDiagnosticPublicationIdentity;
  return `https://github.com/${identity.repository}/releases/download/${identity.tag}/${name}`;
}

function exactContractAssetDownloadUrl(name) {
  const identity = crawlPhaseDiagnosticContractIdentity;
  return `https://github.com/${identity.repository}/releases/download/${identity.tag}/${name}`;
}

function exactString(actual, expected, label) {
  if (actual !== expected) throw new TypeError(`Diagnostic evidence ${label} mismatch`);
}

function canonicalInstant(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) {
    throw new TypeError(`${label} is not canonical UTC instant`);
  }
  const milliseconds = Date.parse(value);
  const canonical = value.includes(".") ? value : value.replace(/Z$/u, ".000Z");
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== canonical) {
    throw new TypeError(`${label} is not valid UTC instant`);
  }
  return milliseconds;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be positive integer`);
  return value;
}

function exactKeys(value, expected, label) {
  const record = requireRecord(value, label);
  const actual = Reflect.ownKeys(record);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(record, key))
  ) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  return record;
}

function requireRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be one plain object`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
