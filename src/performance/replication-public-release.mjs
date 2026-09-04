import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

import {
  performanceReplicationPublicationAssetNames,
  performanceReplicationContractTargetSha,
  performanceReplicationPublicationIdentity,
  performanceReplicationReleaseVerificationSchema,
  verifyPerformanceReplicationGitHubRelease,
} from "./replication-publication.mjs";
import {
  performanceReplicationContractIdentity,
} from "./replication-hosted-provenance.mjs";

export const performanceReplicationAnonymousReleaseVerificationSchema =
  "stasis-v0.3.3-performance-replication-anonymous-release-verification-v1";

export const performanceReplicationAnonymousFetchPolicy = deepFreeze({
  authentication: "none",
  credentials: "omit",
  redirects: "manual_https_github_owned_hosts_only",
  maximumRedirects: 5,
  maximumApiResponseBytes: 8 * 1024 * 1024,
  maximumAssetBytes: 256 * 1024 * 1024,
  maximumTotalAssetBytes: 512 * 1024 * 1024,
  contentEncoding: "identity",
  retries: 0,
});

const sha256Pattern = /^[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const positiveIntegerPattern = /^(?:0|[1-9][0-9]*)$/u;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Independently fetches the immutable evidence release and all 28 public
 * assets without credentials. The caller supplies only the byte identities
 * established by the offline publication verifier and the expected release
 * target SHA; downloaded content and response metadata are never retained.
 */
export async function verifyAnonymousPerformanceReplicationPublicRelease(
  {
    expectedOfflineAssetMap,
    expectedReleaseTargetSha,
  } = {},
  {
    fetchImpl = globalThis.fetch,
    verifyRelease = verifyPerformanceReplicationGitHubRelease,
  } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Anonymous replication release verification requires fetch");
  }
  if (typeof verifyRelease !== "function") {
    throw new TypeError("Anonymous replication release verifier dependency is invalid");
  }
  if (!gitShaPattern.test(expectedReleaseTargetSha ?? "")) {
    throw new TypeError("Expected replication evidence release target must be one Git SHA");
  }
  if (expectedReleaseTargetSha === performanceReplicationContractTargetSha) {
    throw new TypeError("Replication evidence target must differ from the contract target");
  }
  const expected = validateExpectedOfflineAssetMap(expectedOfflineAssetMap);
  const identity = performanceReplicationPublicationIdentity;
  const apiRoot = `https://api.github.com/repos/${identity.repository}`;
  const releaseEndpoint = `${apiRoot}/releases/tags/${encodeURIComponent(identity.tag)}`;

  const releaseBytes = await fetchAnonymousBytes(releaseEndpoint, {
    accept: "application/vnd.github+json",
    fetchImpl,
    label: "replication evidence release API",
    maximumBytes: performanceReplicationAnonymousFetchPolicy.maximumApiResponseBytes,
  });
  const releaseRecord = parseJsonBytes(releaseBytes, "replication evidence release API");
  const releaseAssets = validateReleaseBeforeDownloads(
    releaseRecord,
    expected,
    expectedReleaseTargetSha,
  );

  const contractTagRefEndpoint =
    `${apiRoot}/git/ref/tags/${encodeURIComponent(performanceReplicationContractIdentity.tag)}`;
  const contractTagRefBytes = await fetchAnonymousBytes(contractTagRefEndpoint, {
    accept: "application/vnd.github+json",
    fetchImpl,
    label: "replication contract tag ref API",
    maximumBytes: performanceReplicationAnonymousFetchPolicy.maximumApiResponseBytes,
  });
  const contractTagRefRecord = parseJsonBytes(
    contractTagRefBytes,
    "replication contract tag ref API",
  );
  validateLightweightTagRef(contractTagRefRecord, {
    repository: performanceReplicationContractIdentity.repository,
    tag: performanceReplicationContractIdentity.tag,
    targetSha: performanceReplicationContractTargetSha,
    label: "replication contract tag",
  });

  const releaseTagRefEndpoint =
    `${apiRoot}/git/ref/tags/${encodeURIComponent(identity.tag)}`;
  const releaseTagRefBytes = await fetchAnonymousBytes(releaseTagRefEndpoint, {
    accept: "application/vnd.github+json",
    fetchImpl,
    label: "replication evidence tag ref API",
    maximumBytes: performanceReplicationAnonymousFetchPolicy.maximumApiResponseBytes,
  });
  const releaseTagRefRecord = parseJsonBytes(
    releaseTagRefBytes,
    "replication evidence tag ref API",
  );
  validateLightweightTagRef(releaseTagRefRecord, {
    repository: identity.repository,
    tag: identity.tag,
    targetSha: expectedReleaseTargetSha,
    label: "replication evidence tag",
  });

  const commitEndpoint = `${apiRoot}/commits/${expectedReleaseTargetSha}`;
  const commitBytes = await fetchAnonymousBytes(commitEndpoint, {
    accept: "application/vnd.github+json",
    fetchImpl,
    label: "replication evidence target commit API",
    maximumBytes: performanceReplicationAnonymousFetchPolicy.maximumApiResponseBytes,
  });
  const releaseTargetCommitRecord = parseJsonBytes(
    commitBytes,
    "replication evidence target commit API",
  );
  validateEvidenceTargetCommit(releaseTargetCommitRecord, expectedReleaseTargetSha);

  const anonymousDownloadedAssetBytes = {};
  for (const name of performanceReplicationPublicationAssetNames) {
    const expectedIdentity = expected[name];
    const asset = releaseAssets.get(name);
    const downloadUrl = exactAssetDownloadUrl(name);
    const bytes = await fetchAnonymousBytes(downloadUrl, {
      accept: "application/octet-stream",
      expectedBytes: expectedIdentity.bytes,
      fetchImpl,
      label: `replication evidence asset ${name}`,
      maximumBytes: expectedIdentity.bytes,
    });
    const digest = sha256(bytes);
    if (bytes.byteLength !== expectedIdentity.bytes || digest !== expectedIdentity.sha256) {
      throw new TypeError(`Anonymous replication evidence asset bytes mismatch: ${name}`);
    }
    if (asset.size !== bytes.byteLength || asset.digest !== `sha256:${digest}`) {
      throw new TypeError(`Anonymous replication evidence asset API binding mismatch: ${name}`);
    }
    anonymousDownloadedAssetBytes[name] = bytes;
  }

  const authoritativeWorkflowRunId = assertReleaseAfterAuthoritativeWorkflowCompletion(
    releaseRecord,
    anonymousDownloadedAssetBytes["workflow-run.json"],
  );

  const releaseVerification = verifyRelease({
    releaseRecord,
    contractTagRefRecord,
    releaseTagRefRecord,
    releaseTargetCommitRecord,
    expectedReleaseTargetSha,
    anonymousDownloadedAssetBytes,
  });
  const coreVerifiedAssets = assertReleaseVerificationReceipt(
    releaseVerification,
    expectedReleaseTargetSha,
    releaseRecord.id,
    expected,
    authoritativeWorkflowRunId,
  );

  return deepFreeze({
    schema: performanceReplicationAnonymousReleaseVerificationSchema,
    status: "passed",
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
    assetByteMap: coreVerifiedAssets,
    transport: performanceReplicationAnonymousFetchPolicy,
    verification: {
      exactTwentyEightAssetInventory: true,
      exactUploadedAssetIdsSizesDigestsAndUrls: true,
      publicApiFetchedWithoutCredentials: true,
      publicAssetsFetchedWithoutCredentials: true,
      anonymousBytesMatchOfflineByteMap: true,
      offlinePublicationReverifiedFromAnonymousBytes: true,
      evidenceTargetDirectSuccessorOfContract: true,
      contractTagRefBoundToContractTarget: true,
      evidenceTagRefBoundToEvidenceTarget: true,
      bothTagsVerifiedLightweight: true,
      releasePublishedAfterAuthoritativeWorkflowCompletion: true,
      urlsRetained: false,
      responseHeadersRetained: false,
      rawPayloadsRetained: false,
    },
  });
}

function validateEvidenceTargetCommit(value, expectedTargetSha) {
  const commit = requireRecord(value, "replication evidence target commit record");
  if (commit.sha !== expectedTargetSha) {
    throw new TypeError("Replication evidence target commit SHA mismatch");
  }
  const repository = performanceReplicationPublicationIdentity.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const web = `https://github.com/${repository}`;
  exactString(commit.url, `${api}/commits/${expectedTargetSha}`, "target commit API URL");
  exactString(commit.html_url, `${web}/commit/${expectedTargetSha}`, "target commit web URL");
  if (!Array.isArray(commit.parents) || commit.parents.length !== 1) {
    throw new TypeError("Replication evidence target commit must have exactly one parent");
  }
  const parent = requireRecord(commit.parents[0], "replication evidence target parent");
  if (parent.sha !== performanceReplicationContractTargetSha) {
    throw new TypeError("Replication evidence target is not a direct successor of the contract");
  }
  exactString(
    parent.url,
    `${api}/commits/${performanceReplicationContractTargetSha}`,
    "target parent API URL",
  );
  exactString(
    parent.html_url,
    `${web}/commit/${performanceReplicationContractTargetSha}`,
    "target parent web URL",
  );
}

function validateLightweightTagRef(value, { repository, tag, targetSha, label }) {
  const tagRef = requireRecord(value, `${label} ref record`);
  const expectedRef = `refs/tags/${tag}`;
  if (tagRef.ref !== expectedRef) {
    throw new TypeError(`${label} ref mismatch`);
  }
  const api = `https://api.github.com/repos/${repository}`;
  exactString(
    tagRef.url,
    `${api}/git/refs/tags/${encodeURIComponent(tag)}`,
    `${label} ref API URL`,
  );
  const object = requireRecord(tagRef.object, `${label} ref object`);
  if (object.type !== "commit") {
    throw new TypeError(`${label} must be one lightweight commit ref`);
  }
  if (object.sha !== targetSha) {
    throw new TypeError(`${label} object SHA mismatch`);
  }
  exactString(
    object.url,
    `${api}/git/commits/${targetSha}`,
    `${label} object API URL`,
  );
}

function assertReleaseAfterAuthoritativeWorkflowCompletion(release, workflowRunBytes) {
  const workflowRun = parseJsonBytes(
    workflowRunBytes,
    "anonymous authoritative workflow-run.json",
  );
  if (workflowRun.status !== "completed" || workflowRun.conclusion !== "success") {
    throw new TypeError("Anonymous authoritative workflow run is not completed successfully");
  }
  const completedAt = canonicalInstant(
    workflowRun.updated_at,
    "anonymous authoritative workflow run updated_at",
  );
  const publishedAt = canonicalInstant(
    release.published_at,
    "replication evidence release published_at",
  );
  if (publishedAt <= completedAt) {
    throw new TypeError(
      "Replication evidence release was not published after authoritative workflow completion",
    );
  }
  return positiveSafeInteger(
    workflowRun.id,
    "anonymous authoritative workflow run ID",
  );
}

function validateExpectedOfflineAssetMap(value) {
  const record = requireRecord(value, "expected offline replication asset map");
  const actualNames = Reflect.ownKeys(record);
  if (
    actualNames.some((name) => typeof name !== "string") ||
    actualNames.length !== performanceReplicationPublicationAssetNames.length ||
    performanceReplicationPublicationAssetNames.some((name) => !Object.hasOwn(record, name))
  ) {
    throw new TypeError("Expected offline replication asset map is not the exact 28-asset set");
  }
  let totalBytes = 0;
  const result = {};
  for (const name of performanceReplicationPublicationAssetNames) {
    const entry = requireRecord(record[name], `expected offline asset identity: ${name}`);
    exactKeys(entry, ["bytes", "sha256"], `expected offline asset identity: ${name}`);
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > performanceReplicationAnonymousFetchPolicy.maximumAssetBytes ||
      !sha256Pattern.test(entry.sha256 ?? "")
    ) {
      throw new TypeError(`Expected offline asset identity is invalid: ${name}`);
    }
    totalBytes += entry.bytes;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > performanceReplicationAnonymousFetchPolicy.maximumTotalAssetBytes
    ) {
      throw new TypeError("Expected offline replication assets exceed the total byte bound");
    }
    result[name] = { bytes: entry.bytes, sha256: entry.sha256 };
  }
  return deepFreeze(result);
}

function validateReleaseBeforeDownloads(releaseRecord, expected, expectedTargetSha) {
  const release = requireRecord(releaseRecord, "replication evidence release record");
  const identity = performanceReplicationPublicationIdentity;
  const releaseId = positiveSafeInteger(release.id, "replication evidence release ID");
  if (
    release.tag_name !== identity.tag ||
    release.target_commitish !== expectedTargetSha ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  ) {
    throw new TypeError("Replication evidence release identity or immutable state mismatch");
  }
  canonicalInstant(release.published_at, "replication evidence release published_at");
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
  if (!Array.isArray(release.assets) ||
    release.assets.length !== performanceReplicationPublicationAssetNames.length) {
    throw new TypeError("Replication evidence release does not have exactly 28 assets");
  }
  const assets = new Map();
  const ids = new Set();
  for (const rawAsset of release.assets) {
    const asset = requireRecord(rawAsset, "replication evidence release asset");
    const name = asset.name;
    if (
      typeof name !== "string" ||
      !Object.hasOwn(expected, name) ||
      assets.has(name)
    ) {
      throw new TypeError("Replication evidence release asset name is unknown or duplicated");
    }
    const id = positiveSafeInteger(asset.id, `replication evidence release asset ID: ${name}`);
    if (ids.has(id)) {
      throw new TypeError("Replication evidence release asset ID is duplicated");
    }
    ids.add(id);
    const identityEntry = expected[name];
    if (
      asset.state !== "uploaded" ||
      asset.size !== identityEntry.bytes ||
      asset.digest !== `sha256:${identityEntry.sha256}`
    ) {
      throw new TypeError(`Replication evidence release asset metadata mismatch: ${name}`);
    }
    exactString(
      asset.url,
      `${api}/releases/assets/${id}`,
      `release asset API URL: ${name}`,
    );
    exactString(
      asset.browser_download_url,
      exactAssetDownloadUrl(name),
      `release asset download URL: ${name}`,
    );
    assets.set(name, asset);
  }
  if (assets.size !== performanceReplicationPublicationAssetNames.length) {
    throw new TypeError("Replication evidence release asset inventory is incomplete");
  }
  return assets;
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
    if (visited.has(current.href)) {
      throw new TypeError(`${label} redirect loop detected`);
    }
    visited.add(current.href);
    let response;
    try {
      response = await fetchImpl(current.href, {
        method: "GET",
        headers: {
          Accept: accept,
          "Accept-Encoding": "identity",
        },
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch (error) {
      throw new TypeError(`${label} request failed`, { cause: error });
    }
    assertResponseShape(response, label);
    if (redirectStatuses.has(response.status)) {
      if (redirects >= performanceReplicationAnonymousFetchPolicy.maximumRedirects) {
        await discardBody(response);
        throw new TypeError(`${label} exceeded the redirect bound`);
      }
      const location = response.headers.get("location");
      await discardBody(response);
      if (typeof location !== "string" || location.length === 0) {
        throw new TypeError(`${label} redirect is missing a location`);
      }
      let redirected;
      try {
        redirected = new URL(location, current);
      } catch (error) {
        throw new TypeError(`${label} redirect location is invalid`, { cause: error });
      }
      current = requireSafePublicUrl(redirected.href, `${label} redirect`);
      continue;
    }
    if (response.status !== 200) {
      await discardBody(response);
      throw new TypeError(`${label} returned HTTP ${response.status}`);
    }
    const contentEncoding = response.headers.get("content-encoding");
    if (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity") {
      await discardBody(response);
      throw new TypeError(`${label} returned an encoded response body`);
    }
    const contentLength = parseContentLength(response.headers.get("content-length"), label);
    if (expectedBytes !== undefined && contentLength !== null && contentLength !== expectedBytes) {
      await discardBody(response);
      throw new TypeError(`${label} Content-Length differs from the offline byte map`);
    }
    if (contentLength !== null && contentLength > maximumBytes) {
      await discardBody(response);
      throw new TypeError(`${label} exceeds its byte bound`);
    }
    const body = await readBoundedBody(response, maximumBytes, label);
    if (expectedBytes !== undefined && body.byteLength !== expectedBytes) {
      throw new TypeError(`${label} byte length differs from the offline byte map`);
    }
    return body;
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
    throw new TypeError(`${label} URL is outside the anonymous HTTPS policy`);
  }
  return url;
}

function isGitHubOwnedHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "github.com" ||
    normalized === "api.github.com" ||
    normalized === "objects.githubusercontent.com" ||
    normalized === "release-assets.githubusercontent.com" ||
    normalized.endsWith(".githubusercontent.com");
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
    throw new TypeError(`${label} returned an invalid response`);
  }
}

async function readBoundedBody(response, maximumBytes, label) {
  if (
    response.body === null ||
    typeof response.body !== "object" ||
    typeof response.body.getReader !== "function"
  ) {
    throw new TypeError(`${label} response body is not a readable byte stream`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let completed = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result?.done === true) {
        completed = true;
        break;
      }
      if (!(result?.value instanceof Uint8Array)) {
        throw new TypeError(`${label} response yielded a non-byte chunk`);
      }
      const chunk = Buffer.from(
        result.value.buffer,
        result.value.byteOffset,
        result.value.byteLength,
      );
      total += chunk.byteLength;
      if (!Number.isSafeInteger(total) || total > maximumBytes) {
        throw new TypeError(`${label} exceeds its byte bound`);
      }
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    if (!completed) await Promise.resolve(reader.cancel()).catch(() => {});
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
    throw new TypeError(`${label} is not valid UTF-8`, { cause: error });
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${label} is not valid JSON`, { cause: error });
  }
  return requireRecord(value, label);
}

function parseContentLength(value, label) {
  if (value === null) return null;
  if (!positiveIntegerPattern.test(value)) {
    throw new TypeError(`${label} returned an invalid Content-Length`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError(`${label} returned an unsafe Content-Length`);
  }
  return parsed;
}

function assertReleaseVerificationReceipt(
  value,
  expectedTargetSha,
  expectedReleaseId,
  expectedAssetMap,
  expectedWorkflowRunId,
) {
  const receipt = requireRecord(value, "replication GitHub release verification receipt");
  exactKeys(receipt, [
    "schema",
    "status",
    "repository",
    "tag",
    "releaseId",
    "contractTargetSha",
    "evidenceTargetSha",
    "tagBindings",
    "workflowRunId",
    "assetCount",
    "assets",
    "anonymousDownloadedBytesVerified",
    "releaseImmutable",
    "releaseDraft",
    "releasePrerelease",
    "directSuccessorOfContractTarget",
    "decisionState",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
  ], "replication GitHub release verification receipt");
  if (
    receipt.schema !== performanceReplicationReleaseVerificationSchema ||
    receipt.status !== "passed" ||
    receipt.repository !== performanceReplicationPublicationIdentity.repository ||
    receipt.tag !== performanceReplicationPublicationIdentity.tag ||
    receipt.releaseId !== expectedReleaseId ||
    receipt.contractTargetSha !== performanceReplicationContractTargetSha ||
    receipt.evidenceTargetSha !== expectedTargetSha ||
    receipt.workflowRunId !== expectedWorkflowRunId ||
    receipt.assetCount !== performanceReplicationPublicationAssetNames.length ||
    receipt.anonymousDownloadedBytesVerified !== true ||
    receipt.releaseImmutable !== true ||
    receipt.releaseDraft !== false ||
    receipt.releasePrerelease !== false ||
    receipt.directSuccessorOfContractTarget !== true ||
    receipt.decisionState !== "STAY_0_4_UNASSIGNED" ||
    receipt.generalizedSpeedClaimAuthorized !== false ||
    receipt.implementationWorkAuthorized !== false
  ) {
    throw new TypeError("Replication GitHub release verification receipt is invalid");
  }
  assertReceiptTagBinding(
    receipt.tagBindings,
    expectedTargetSha,
  );
  if (
    !Array.isArray(receipt.assets) ||
    receipt.assets.length !== performanceReplicationPublicationAssetNames.length
  ) {
    throw new TypeError("Replication GitHub release verification asset map is invalid");
  }
  const verified = [];
  for (let index = 0; index < performanceReplicationPublicationAssetNames.length; index += 1) {
    const expectedName = performanceReplicationPublicationAssetNames[index];
    const asset = requireRecord(
      receipt.assets[index],
      `replication GitHub release verification asset: ${expectedName}`,
    );
    exactKeys(
      asset,
      ["name", "bytes", "sha256"],
      `replication GitHub release verification asset: ${expectedName}`,
    );
    const expectedIdentity = expectedAssetMap[expectedName];
    if (
      asset.name !== expectedName ||
      asset.bytes !== expectedIdentity.bytes ||
      asset.sha256 !== expectedIdentity.sha256
    ) {
      throw new TypeError(
        `Replication GitHub release verification asset map mismatch: ${expectedName}`,
      );
    }
    verified.push({ name: asset.name, bytes: asset.bytes, sha256: asset.sha256 });
  }
  return deepFreeze(verified);
}

function assertReceiptTagBinding(value, expectedTargetSha) {
  const bindings = requireRecord(value, "replication GitHub release tag bindings");
  exactKeys(
    bindings,
    ["contract", "evidence"],
    "replication GitHub release tag bindings",
  );
  for (const [name, expected] of [
    ["contract", {
      ref: `refs/tags/${performanceReplicationContractIdentity.tag}`,
      objectSha: performanceReplicationContractTargetSha,
    }],
    ["evidence", {
      ref: `refs/tags/${performanceReplicationPublicationIdentity.tag}`,
      objectSha: expectedTargetSha,
    }],
  ]) {
    const binding = requireRecord(
      bindings[name],
      `replication GitHub release ${name} tag binding`,
    );
    exactKeys(
      binding,
      ["ref", "objectType", "objectSha", "lightweight"],
      `replication GitHub release ${name} tag binding`,
    );
    if (
      binding.ref !== expected.ref ||
      binding.objectType !== "commit" ||
      binding.objectSha !== expected.objectSha ||
      binding.lightweight !== true
    ) {
      throw new TypeError(
        `Replication GitHub release verification receipt ${name} tag binding is invalid`,
      );
    }
  }
}

function exactAssetDownloadUrl(name) {
  const identity = performanceReplicationPublicationIdentity;
  return `https://github.com/${identity.repository}/releases/download/${identity.tag}/${name}`;
}

function exactString(actual, expected, label) {
  if (actual !== expected) throw new TypeError(`Replication evidence ${label} mismatch`);
}

function canonicalInstant(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) {
    throw new TypeError(`${label} is not a canonical UTC instant`);
  }
  const milliseconds = Date.parse(value);
  const canonical = value.includes(".") ? value : value.replace(/Z$/u, ".000Z");
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== canonical) {
    throw new TypeError(`${label} is not a valid UTC instant`);
  }
  return milliseconds;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be one positive safe integer`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Reflect.ownKeys(value);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
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

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
