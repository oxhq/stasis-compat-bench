import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, TextDecoder } from "node:util";

import AdmZip from "adm-zip";

import { assertPostSupportArtifactPrivacy } from "../post-support/artifact-privacy.mjs";
import { jsonReplacer } from "../shared/io.mjs";
import {
  assertCombinedPerformanceEvidence,
  combinedPerformanceEvidenceSchema,
  renderCombinedPerformanceEvidenceMarkdown,
} from "./evidence.mjs";
import {
  bindPerformanceReplicationArtifacts,
  performanceReplicationArtifactBindingSchema,
} from "./replication-artifact-binding.mjs";
import { renderPerformanceReplicationMarkdown } from "./replication-cli.mjs";
import {
  performanceReplicationContractIdentity,
  performanceReplicationExpectedArtifactNames,
  performanceReplicationHostedProvenanceSchema,
  verifyPerformanceReplicationHostedProvenance,
} from "./replication-hosted-provenance.mjs";
import {
  performanceReplicationVerificationSchema,
  publishedPerformanceAssetDigests,
  verifyFreshHostPerformanceReplication,
} from "./replication.mjs";

export const performanceReplicationPublicationSchema =
  "stasis-v0.3.3-performance-replication-publication-v1";
export const performanceReplicationPrivacyScanSchema =
  "stasis-v0.3.3-performance-replication-privacy-scan-v1";
export const performanceReplicationReleaseVerificationSchema =
  "stasis-v0.3.3-performance-replication-release-verification-v1";
export const performanceReplicationContractTargetSha =
  "efd08ca4a0768951d49107cc7ff3c17af06047a1";

export const performanceReplicationPublicationIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  tag: "stasis-v0.3.3-performance-replication-evidence-v1",
});

export const performanceReplicationPublicationPayloadNames = Object.freeze([
  "actions-combined-logs.zip",
  "actions-combined.zip",
  "actions-crawl-logs.zip",
  "actions-crawl-raw.zip",
  "actions-rwa-logs.zip",
  "actions-rwa-raw.zip",
  "actions-source-metadata.zip",
  "artifact-binding.json",
  "contract-commit.json",
  "contract-release.json",
  "fresh-combined-evidence.json",
  "fresh-combined-evidence.md",
  "fresh-combined-verification.json",
  "fresh-crawl-raw.json",
  "fresh-independent-statistics-replay.json",
  "fresh-rwa-raw.json",
  "hosted-provenance.json",
  "original-combined-evidence.json",
  "original-crawl-raw.json",
  "original-rwa-raw.json",
  "replication-report.md",
  "replication-verification.json",
  "workflow-artifacts.json",
  "workflow-jobs.json",
  "workflow-run.json",
  "workflow-runs.json",
]);

export const performanceReplicationPublicationAssetNames = Object.freeze([
  ...performanceReplicationPublicationPayloadNames,
  "privacy-scan.json",
  "SHA256SUMS.txt",
].sort(compareUtf8));

const semanticPrivacyNames = new Set([
  "artifact-binding.json",
  "fresh-combined-evidence.json",
  "fresh-combined-evidence.md",
  "fresh-combined-verification.json",
  "fresh-crawl-raw.json",
  "fresh-independent-statistics-replay.json",
  "fresh-rwa-raw.json",
  "hosted-provenance.json",
  "original-combined-evidence.json",
  "original-crawl-raw.json",
  "original-rwa-raw.json",
  "replication-report.md",
  "replication-verification.json",
]);

const actionsArchiveNames = Object.freeze({
  "stasis-v0.3.3-performance-source-metadata-attempt-1": "actions-source-metadata.zip",
  "stasis-v0.3.3-performance-rwa-raw-attempt-1": "actions-rwa-raw.zip",
  "stasis-v0.3.3-performance-rwa-logs-attempt-1": "actions-rwa-logs.zip",
  "stasis-v0.3.3-performance-crawl-raw-attempt-1": "actions-crawl-raw.zip",
  "stasis-v0.3.3-performance-crawl-logs-attempt-1": "actions-crawl-logs.zip",
  "stasis-v0.3.3-performance-combined-attempt-1": "actions-combined.zip",
  "stasis-v0.3.3-performance-combined-logs-attempt-1": "actions-combined-logs.zip",
});

const releasedCombinedCopies = Object.freeze({
  "fresh-combined-evidence.json": "performance/combined-evidence.json",
  "fresh-combined-evidence.md": "performance/combined-evidence.md",
  "fresh-combined-verification.json": "performance/combined-verification.json",
  "fresh-crawl-raw.json": "performance/crawl-raw.json",
  "fresh-independent-statistics-replay.json":
    "performance/independent-statistics-replay.json",
  "fresh-rwa-raw.json": "performance/rwa-raw.json",
});

const credentialRules = Object.freeze([
  ["github_token", /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/giu],
  ["npm_token", /\bnpm_[A-Za-z0-9]{20,}\b/gu],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/gu],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{35}\b/gu],
  ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu],
  ["stripe_live_key", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/gu],
  ["authorization_value", /\b(?:authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu],
  ["npm_auth_value", /(?:^|\s)_authToken\s*=\s*["']?[^$\s"'{}<>]{8,}/gimu],
  ["credentialed_url", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/giu],
  ["private_key_material", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{16,}/gu],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu],
]);

const privateTaskPathRules = Object.freeze([
  ["task_drive_checkout", /\bE:[\\/]+stasis(?:[\\/]|\b)/giu],
  ["task_windows_profile", /\bC:[\\/]+Users[\\/]+garae(?:[\\/]|\b)/giu],
  ["task_posix_profile", /\/(?:Users|home)\/garae(?:\/|\b)/giu],
]);

const sha256Pattern = /^[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const maximumArchiveEntries = 10_000;
const maximumArchiveEntryBytes = 64 * 1024 * 1024;
const maximumArchiveExpandedBytes = 256 * 1024 * 1024;

export function buildPerformanceReplicationPublication(
  { payloadAssetBytes } = {},
  { receiptChainValidator = validatePerformanceReplicationPublicationReceiptChain } = {},
) {
  const payload = assertExactByteMap(
    payloadAssetBytes,
    performanceReplicationPublicationPayloadNames,
    "replication publication payload",
  );
  const chain = assertReceiptChainIdentity(receiptChainValidator(payload));
  const privacyScan = createPerformanceReplicationPrivacyScan(payload, chain);
  const privacyScanBytes = canonicalJsonBytes(privacyScan);
  const checksumInputs = {
    ...payload,
    "privacy-scan.json": privacyScanBytes,
  };
  const checksumBytes = renderPerformanceReplicationPublicationChecksums(checksumInputs);
  const assetBytes = {
    ...checksumInputs,
    "SHA256SUMS.txt": checksumBytes,
  };
  const receipt = verifyPerformanceReplicationPublication(
    { assetBytes },
    { receiptChainValidator },
  );
  return Object.freeze({
    generatedAssets: Object.freeze({
      "privacy-scan.json": Buffer.from(privacyScanBytes),
      "SHA256SUMS.txt": Buffer.from(checksumBytes),
    }),
    receipt,
  });
}

export function verifyPerformanceReplicationPublication(
  { assetBytes } = {},
  { receiptChainValidator = validatePerformanceReplicationPublicationReceiptChain } = {},
) {
  const assets = assertExactByteMap(
    assetBytes,
    performanceReplicationPublicationAssetNames,
    "replication publication",
  );
  const payload = Object.fromEntries(
    performanceReplicationPublicationPayloadNames.map((name) => [name, assets[name]]),
  );
  const chain = assertReceiptChainIdentity(receiptChainValidator(payload));
  const expectedPrivacyScan = createPerformanceReplicationPrivacyScan(payload, chain);
  const retainedPrivacyScan = parseCanonicalJsonBytes(
    assets["privacy-scan.json"],
    "replication privacy scan",
  );
  if (!isDeepStrictEqual(retainedPrivacyScan, expectedPrivacyScan)) {
    throw new TypeError("Replication privacy-scan.json differs from the exact payload bytes");
  }
  const checksumInputs = {
    ...payload,
    "privacy-scan.json": assets["privacy-scan.json"],
  };
  const expectedChecksums = renderPerformanceReplicationPublicationChecksums(checksumInputs);
  if (!assets["SHA256SUMS.txt"].equals(expectedChecksums)) {
    throw new TypeError(
      "Replication SHA256SUMS.txt is not the canonical 27-entry non-self manifest",
    );
  }

  return deepFreeze({
    schema: performanceReplicationPublicationSchema,
    status: "passed",
    protocolStatus: "protocol_valid",
    pooling: "none",
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    contractTargetSha: chain.contractTargetSha,
    workflowRunId: chain.workflowRunId,
    receipts: chain.receipts,
    inventory: {
      payloadAssetCount: performanceReplicationPublicationPayloadNames.length,
      finalAssetCount: performanceReplicationPublicationAssetNames.length,
      privacyScannedAssetCount: expectedPrivacyScan.scope.payloadAssetCount,
      semanticPrivacyVerifiedAssetCount:
        expectedPrivacyScan.scope.semanticPrivacyVerifiedAssetCount,
      archiveAssetCount: expectedPrivacyScan.scope.archiveAssetCount,
      archiveEntryCount: expectedPrivacyScan.scope.archiveEntryCount,
      checksumEntryCount: performanceReplicationPublicationAssetNames.length - 1,
    },
    assets: performanceReplicationPublicationAssetNames.map((name) => ({
      name,
      ...fileIdentity(assets[name]),
    })),
    generated: {
      privacyScan: fileIdentity(assets["privacy-scan.json"]),
      checksums: fileIdentity(assets["SHA256SUMS.txt"]),
    },
    verification: {
      exactTwentyEightAssetInventory: true,
      threeReceiptsReplayedAndCrossBound: true,
      releasedCombinedCopiesByteIdentical: true,
      allPayloadsPrivacyScanned: true,
      allArchiveEntriesDecompressedAndScanned: true,
      canonicalTwentySevenEntryNonSelfChecksums: true,
      urlsRetained: false,
      rawPayloadsRetained: false,
    },
  });
}

export function validatePerformanceReplicationPublicationReceiptChain(payload) {
  assertExactByteMap(
    payload,
    performanceReplicationPublicationPayloadNames,
    "replication publication payload",
  );
  assertPublishedOriginalBytes(payload);

  const originalRwa = parseCanonicalJsonBytes(
    payload["original-rwa-raw.json"],
    "published original RWA",
  );
  const originalCrawl = parseCanonicalJsonBytes(
    payload["original-crawl-raw.json"],
    "published original crawl",
  );
  const originalCombined = parseCanonicalJsonBytes(
    payload["original-combined-evidence.json"],
    "published original combined evidence",
  );
  const freshRwa = parseCanonicalJsonBytes(
    payload["fresh-rwa-raw.json"],
    "fresh RWA",
  );
  const freshCrawl = parseCanonicalJsonBytes(
    payload["fresh-crawl-raw.json"],
    "fresh crawl",
  );
  const freshCombined = parseCanonicalJsonBytes(
    payload["fresh-combined-evidence.json"],
    "fresh combined evidence",
  );
  assertCombinedPerformanceEvidence(originalCombined, {
    rwaRaw: originalRwa.authorityRaw,
    crawlRaw: originalCrawl,
  });
  assertCombinedPerformanceEvidence(freshCombined, {
    rwaRaw: freshRwa.authorityRaw,
    crawlRaw: freshCrawl,
  });
  const expectedCombinedMarkdown = Buffer.from(
    renderCombinedPerformanceEvidenceMarkdown(freshCombined),
    "utf8",
  );
  if (!payload["fresh-combined-evidence.md"].equals(expectedCombinedMarkdown)) {
    throw new TypeError(
      "Fresh combined evidence Markdown does not replay from its exact JSON",
    );
  }
  const expectedCombinedVerification = {
    schema: "stasis-v0.3.3-combined-performance-verification-v1",
    status: "passed",
    combinedEvidenceSchema: combinedPerformanceEvidenceSchema,
    rwaArtifactSchema: "stasis-v0.3.3-performance-rwa-artifact-v1",
    rwaRawSchema: freshRwa.authorityRaw.schema,
    crawlRawSchema: freshCrawl.schema,
    markdownReplayVerified: true,
  };
  const retainedCombinedVerification = parseCanonicalJsonBytes(
    payload["fresh-combined-verification.json"],
    "fresh combined verification receipt",
  );
  if (!isDeepStrictEqual(retainedCombinedVerification, expectedCombinedVerification)) {
    throw new TypeError(
      "Fresh combined verification receipt does not replay from its exact authorities",
    );
  }
  const expectedIndependentReplay = {
    schema: "stasis-v0.3.3-independent-statistics-replay-v1",
    status: "passed",
    scope: {
      behavioralAuthorityReverification: "not_performed",
      name: "statistics_only",
      requiredPriorVerificationSchema: expectedCombinedVerification.schema,
    },
    inputs: {
      combinedEvidence: { sha256: sha256(payload["fresh-combined-evidence.json"]) },
      crawlRaw: { sha256: sha256(payload["fresh-crawl-raw.json"]) },
      rwaHostedWrapper: { sha256: sha256(payload["fresh-rwa-raw.json"]) },
    },
    verification: {
      combinedProjectionAndStatisticsExact: true,
      declaredAuthorityPrerequisites: { crawl: "valid", rwa: "valid" },
      crawl: { pairCount: freshCombined.crawl.pairs.length },
      rwa: { pairCount: freshCombined.rwa.pairs.length },
      statistics: {
        arithmetic: "integer_and_reduced_fraction",
        decimal: "fixed_6_half_up",
        quartiles: "median_of_halves_excluding_odd_center",
        ratio: "median_of_paired_baseline_over_stasis_ratios",
      },
    },
  };
  const retainedIndependentReplay = parseCanonicalJsonBytes(
    payload["fresh-independent-statistics-replay.json"],
    "fresh independent statistics replay receipt",
  );
  if (!isDeepStrictEqual(retainedIndependentReplay, expectedIndependentReplay)) {
    throw new TypeError(
      "Fresh independent statistics receipt does not bind the exact validated inputs",
    );
  }

  const semanticCore = verifyFreshHostPerformanceReplication({
    original: { rwaArtifact: originalRwa, crawlRaw: originalCrawl },
    fresh: { rwaArtifact: freshRwa, crawlRaw: freshCrawl },
  });
  const expectedSemantic = {
    ...semanticCore,
    fileBoundary: {
      originalAssetSha256Verified: true,
      canonicalJsonVerified: true,
      allInputAndOutputPathsDistinct: true,
      outputCreation: "fsynced_sibling_temp_no_clobber_link",
      authoritativeReceiptPromotedLast: true,
      inputs: {
        original: {
          rwa: fileIdentity(payload["original-rwa-raw.json"]),
          crawl: fileIdentity(payload["original-crawl-raw.json"]),
          combined: fileIdentity(payload["original-combined-evidence.json"]),
        },
        fresh: {
          rwa: fileIdentity(payload["fresh-rwa-raw.json"]),
          crawl: fileIdentity(payload["fresh-crawl-raw.json"]),
          combined: fileIdentity(payload["fresh-combined-evidence.json"]),
        },
      },
    },
  };
  const retainedSemantic = parseCanonicalJsonBytes(
    payload["replication-verification.json"],
    "replication semantic receipt",
  );
  if (!isDeepStrictEqual(retainedSemantic, expectedSemantic)) {
    throw new TypeError("Replication semantic receipt does not replay from the exact raw files");
  }
  const expectedReport = Buffer.from(
    renderPerformanceReplicationMarkdown(retainedSemantic),
    "utf8",
  );
  if (!payload["replication-report.md"].equals(expectedReport)) {
    throw new TypeError("Replication report does not replay from the semantic receipt");
  }

  const hostedInputs = {
    runRecord: parseCanonicalJsonBytes(payload["workflow-run.json"], "workflow run"),
    workflowRunsListing: parseCanonicalJsonBytes(
      payload["workflow-runs.json"],
      "workflow runs listing",
    ),
    jobsListing: parseCanonicalJsonBytes(payload["workflow-jobs.json"], "workflow jobs"),
    artifactsListing: parseCanonicalJsonBytes(
      payload["workflow-artifacts.json"],
      "workflow artifacts",
    ),
    contractReleaseRecord: parseCanonicalJsonBytes(
      payload["contract-release.json"],
      "contract release",
    ),
    contractCommitRecord: parseCanonicalJsonBytes(
      payload["contract-commit.json"],
      "contract commit",
    ),
  };
  const expectedHosted = verifyPerformanceReplicationHostedProvenance(hostedInputs);
  const retainedHosted = parseCanonicalJsonBytes(
    payload["hosted-provenance.json"],
    "hosted provenance receipt",
  );
  if (!isDeepStrictEqual(retainedHosted, expectedHosted)) {
    throw new TypeError("Hosted provenance receipt does not replay from the API snapshots");
  }
  if (retainedHosted.contract.targetCommitSha !== performanceReplicationContractTargetSha) {
    throw new TypeError("Hosted preregistration contract target is not the frozen efd08ca commit");
  }

  const artifactZipBytes = Object.fromEntries(
    performanceReplicationExpectedArtifactNames.map((name) => [
      name,
      payload[actionsArchiveNames[name]],
    ]),
  );
  const expectedBinding = bindPerformanceReplicationArtifacts({
    semanticReceipt: retainedSemantic,
    hostedReceipt: retainedHosted,
    artifactZipBytes,
  });
  const retainedBinding = parseCanonicalJsonBytes(
    payload["artifact-binding.json"],
    "artifact binding receipt",
  );
  if (!isDeepStrictEqual(retainedBinding, expectedBinding)) {
    throw new TypeError("Artifact binding receipt does not replay from the receipts and ZIPs");
  }
  assertReleasedCombinedCopies(payload);

  return deepFreeze({
    contractTargetSha: retainedHosted.contract.targetCommitSha,
    workflowRunId: retainedHosted.producer.runId,
    hostedCreatedAt: retainedHosted.producer.createdAt,
    hostedStartedAt: retainedHosted.producer.runStartedAt,
    receipts: {
      semantic: performanceReplicationVerificationSchema,
      hosted: performanceReplicationHostedProvenanceSchema,
      artifactBinding: performanceReplicationArtifactBindingSchema,
    },
  });
}

export function createPerformanceReplicationPrivacyScan(payload, chainIdentity) {
  assertExactByteMap(
    payload,
    performanceReplicationPublicationPayloadNames,
    "replication publication privacy payload",
  );
  const chain = assertReceiptChainIdentity(chainIdentity);
  const assets = performanceReplicationPublicationPayloadNames.map((name) =>
    scanAsset(name, payload[name])
  );
  const archiveEntryCount = assets.reduce(
    (total, asset) => total + asset.archiveEntries.length,
    0,
  );
  const semanticPrivacyVerifiedAssetCount = assets.filter(
    ({ semanticPrivacyVerified }) => semanticPrivacyVerified,
  ).length;
  if (semanticPrivacyVerifiedAssetCount !== semanticPrivacyNames.size) {
    throw new TypeError("Replication semantic privacy coverage count drifted");
  }
  return deepFreeze({
    schema: performanceReplicationPrivacyScanSchema,
    status: "passed",
    contractRevision: chain.contractTargetSha,
    workflowRunId: chain.workflowRunId,
    scope: {
      payloadAssetCount: assets.length,
      semanticPrivacyVerifiedAssetCount,
      archiveAssetCount: assets.filter(({ format }) => format === "zip").length,
      archiveEntryCount,
      checksumAndSelfExcluded: true,
    },
    policy: {
      semanticVerifier: {
        module: "src/post-support/artifact-privacy.mjs",
        revision: chain.contractTargetSha,
      },
      archiveInspection: "every exact ZIP entry path and decompressed UTF-8 byte sequence",
      encodedInspection:
        "one canonical Base64 or Base64URL layer for non-public-source payload text",
      credentialRuleIds: credentialRules.map(([name]) => name),
      privateTaskPathRuleIds: privateTaskPathRules.map(([name]) => name),
      publicApiSourceCodeTreatment:
        "public GitHub API source patches receive direct signature and private-task-path scanning but no encoded-fixture reinterpretation",
      matchDisclosure: "counts only; matching secret-like text is never emitted",
    },
    totals: {
      directCredentialSignatureMatches: 0,
      decodedCredentialSignatureMatches: 0,
      privateTaskPathMatches: 0,
    },
    assets,
  });
}

export function renderPerformanceReplicationPublicationChecksums(value) {
  const assets = assertExactByteMap(
    value,
    performanceReplicationPublicationAssetNames.filter(
      (name) => name !== "SHA256SUMS.txt",
    ),
    "replication publication checksum inputs",
  );
  return Buffer.from(
    Object.keys(assets).sort(compareUtf8)
      .map((name) => `${sha256(assets[name])}  ${name}\n`)
      .join(""),
    "utf8",
  );
}

export async function buildPerformanceReplicationPublicationDirectory(
  { payloadDirectory, outputDirectory } = {},
  options,
) {
  const root = await assertExactPublicationDirectory(
    payloadDirectory,
    performanceReplicationPublicationPayloadNames,
    "replication publication payload directory",
  );
  const output = await assertFreshPublicationOutputDirectoryPath(
    outputDirectory,
    root,
  );
  const payloadAssetBytes = await readDirectoryByteMap(
    root,
    performanceReplicationPublicationPayloadNames,
  );
  const result = buildPerformanceReplicationPublication({ payloadAssetBytes }, options);
  await writeFreshPublicationDirectory(output, {
    ...payloadAssetBytes,
    ...result.generatedAssets,
  });
  return result.receipt;
}

export async function verifyPerformanceReplicationPublicationDirectory(
  { publicationDirectory } = {},
  options,
) {
  const root = await assertExactPublicationDirectory(
    publicationDirectory,
    performanceReplicationPublicationAssetNames,
    "replication publication directory",
  );
  return verifyPerformanceReplicationPublication({
    assetBytes: await readDirectoryByteMap(
      root,
      performanceReplicationPublicationAssetNames,
    ),
  }, options);
}

export function verifyPerformanceReplicationGitHubRelease(
  {
    releaseRecord,
    contractTagRefRecord,
    releaseTagRefRecord,
    releaseTargetCommitRecord,
    expectedReleaseTargetSha,
    anonymousDownloadedAssetBytes,
  } = {},
  { receiptChainValidator = validatePerformanceReplicationPublicationReceiptChain } = {},
) {
  if (!gitShaPattern.test(expectedReleaseTargetSha ?? "")) {
    throw new TypeError("Expected replication evidence release target must be one Git SHA");
  }
  const publication = verifyPerformanceReplicationPublication(
    { assetBytes: anonymousDownloadedAssetBytes },
    { receiptChainValidator },
  );
  if (expectedReleaseTargetSha === publication.contractTargetSha) {
    throw new TypeError("Evidence release target must be distinct from the contract target");
  }
  assertEvidenceTargetCommit(
    releaseTargetCommitRecord,
    expectedReleaseTargetSha,
    publication.contractTargetSha,
  );
  const contractTagBinding = assertLightweightTagRef(
    contractTagRefRecord,
    {
      repository: performanceReplicationContractIdentity.repository,
      tag: performanceReplicationContractIdentity.tag,
      targetSha: publication.contractTargetSha,
    },
    "replication contract tag",
  );
  const evidenceTagBinding = assertLightweightTagRef(
    releaseTagRefRecord,
    {
      repository: performanceReplicationPublicationIdentity.repository,
      tag: performanceReplicationPublicationIdentity.tag,
      targetSha: expectedReleaseTargetSha,
    },
    "replication evidence tag",
  );
  const release = requireRecord(releaseRecord, "replication evidence release record");
  const identity = performanceReplicationPublicationIdentity;
  const releaseId = positiveSafeInteger(release.id, "replication evidence release ID");
  const checks = [
    [release.tag_name, identity.tag, "tag"],
    [release.target_commitish, expectedReleaseTargetSha, "target"],
    [release.immutable, true, "immutable state"],
    [release.draft, false, "draft state"],
    [release.prerelease, false, "prerelease state"],
  ];
  for (const [actual, expected, label] of checks) {
    if (actual !== expected) {
      throw new TypeError(`Replication evidence release ${label} mismatch`);
    }
  }
  const publishedAt = canonicalInstant(
    release.published_at,
    "replication evidence release published_at",
  );
  if (publishedAt <= canonicalInstant(
    publicationHostedCompletedAt(anonymousDownloadedAssetBytes),
    "hosted replication completion",
  )) {
    throw new TypeError("Replication evidence release does not postdate its terminal hosted run");
  }
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  exactUrl(release.url, `${api}/releases/${releaseId}`, "release API URL");
  exactUrl(release.assets_url, `${api}/releases/${releaseId}/assets`, "release assets URL");
  exactUrl(
    release.upload_url,
    `https://uploads.github.com/repos/${identity.repository}/releases/${releaseId}/assets{?name,label}`,
    "release upload URL",
  );
  exactUrl(release.html_url, `${web}/releases/tag/${identity.tag}`, "release web URL");
  assertReleaseAssets(release.assets, releaseId, anonymousDownloadedAssetBytes);

  return deepFreeze({
    schema: performanceReplicationReleaseVerificationSchema,
    status: "passed",
    repository: identity.repository,
    tag: identity.tag,
    releaseId,
    contractTargetSha: publication.contractTargetSha,
    evidenceTargetSha: expectedReleaseTargetSha,
    tagBindings: {
      contract: contractTagBinding,
      evidence: evidenceTagBinding,
    },
    workflowRunId: publication.workflowRunId,
    assetCount: performanceReplicationPublicationAssetNames.length,
    assets: publication.assets,
    anonymousDownloadedBytesVerified: true,
    releaseImmutable: true,
    releaseDraft: false,
    releasePrerelease: false,
    directSuccessorOfContractTarget: true,
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
  });
}

function assertReceiptChainIdentity(value) {
  exactKeys(value, [
    "contractTargetSha",
    "workflowRunId",
    "hostedCreatedAt",
    "hostedStartedAt",
    "receipts",
  ], "replication publication receipt-chain identity");
  if (value.contractTargetSha !== performanceReplicationContractTargetSha) {
    throw new TypeError("Replication publication contract target identity drifted");
  }
  positiveSafeInteger(value.workflowRunId, "replication publication workflow run ID");
  canonicalInstant(value.hostedCreatedAt, "replication publication hosted creation time");
  canonicalInstant(value.hostedStartedAt, "replication publication hosted start time");
  exactKeys(value.receipts, ["semantic", "hosted", "artifactBinding"], "receipt schemas");
  if (
    value.receipts.semantic !== performanceReplicationVerificationSchema ||
    value.receipts.hosted !== performanceReplicationHostedProvenanceSchema ||
    value.receipts.artifactBinding !== performanceReplicationArtifactBindingSchema
  ) {
    throw new TypeError("Replication publication receipt schemas drifted");
  }
  return value;
}

function assertPublishedOriginalBytes(payload) {
  const checks = [
    ["original-rwa-raw.json", publishedPerformanceAssetDigests.rwaRawJson],
    ["original-crawl-raw.json", publishedPerformanceAssetDigests.crawlRawJson],
    ["original-combined-evidence.json", publishedPerformanceAssetDigests.combinedEvidenceJson],
  ];
  for (const [name, digest] of checks) {
    if (sha256(payload[name]) !== digest) {
      throw new TypeError(`Replication publication published original bytes drifted: ${name}`);
    }
  }
}

function assertReleasedCombinedCopies(payload) {
  const rwaArchive = parseArchive(payload["actions-rwa-raw.zip"], "RWA raw archive");
  const crawlArchive = parseArchive(payload["actions-crawl-raw.zip"], "crawl raw archive");
  const combinedArchive = parseArchive(payload["actions-combined.zip"], "combined archive");
  const comparisons = [
    [payload["fresh-rwa-raw.json"], rwaArchive.get("rwa-raw.json"), "fresh RWA lane copy"],
    [payload["fresh-crawl-raw.json"], crawlArchive.get("crawl-raw.json"), "fresh crawl lane copy"],
    ...Object.entries(releasedCombinedCopies).map(([releasedName, entryName]) => [
      payload[releasedName],
      combinedArchive.get(entryName),
      releasedName,
    ]),
  ];
  for (const [released, archived, label] of comparisons) {
    if (!Buffer.isBuffer(archived) || !released.equals(archived)) {
      throw new TypeError(`Replication publication released copy differs from ZIP: ${label}`);
    }
  }
}

function scanAsset(name, bytes) {
  let semanticPrivacyVerified = false;
  let directCredentialSignatureMatches = 0;
  let decodedCredentialSignatureMatches = 0;
  let privateTaskPathMatches = 0;
  const archiveEntries = [];
  if (name.endsWith(".zip")) {
    const contents = parseArchive(bytes, name);
    for (const [entryPath, entryBytes] of contents) {
      const entryText = decodeUtf8(entryBytes, `${name}:${entryPath}`);
      const scan = mergeScans(
        scanText(entryPath, { encoded: true }),
        scanText(entryText, { encoded: true }),
      );
      directCredentialSignatureMatches += scan.directCredentialSignatureMatches;
      decodedCredentialSignatureMatches += scan.decodedCredentialSignatureMatches;
      privateTaskPathMatches += scan.privateTaskPathMatches;
      archiveEntries.push({
        path: entryPath,
        bytes: entryBytes.byteLength,
        sha256: sha256(entryBytes),
        utf8Verified: true,
        directCredentialSignatureMatches: scan.directCredentialSignatureMatches,
        decodedCredentialSignatureMatches: scan.decodedCredentialSignatureMatches,
        privateTaskPathMatches: scan.privateTaskPathMatches,
      });
    }
  } else {
    const text = decodeUtf8(bytes, name);
    let semanticValue = text.split(/\r?\n/u);
    if (name.endsWith(".json")) semanticValue = parseCanonicalJsonBytes(bytes, name);
    if (semanticPrivacyNames.has(name)) {
      assertPostSupportArtifactPrivacy(semanticValue);
      semanticPrivacyVerified = true;
    }
    const scan = scanText(text, { encoded: name !== "contract-commit.json" });
    directCredentialSignatureMatches = scan.directCredentialSignatureMatches;
    decodedCredentialSignatureMatches = scan.decodedCredentialSignatureMatches;
    privateTaskPathMatches = scan.privateTaskPathMatches;
  }
  if (
    directCredentialSignatureMatches !== 0 ||
    decodedCredentialSignatureMatches !== 0 ||
    privateTaskPathMatches !== 0
  ) {
    throw new TypeError(`Replication publication privacy scan rejected ${name}`);
  }
  return {
    name,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    format: name.endsWith(".zip") ? "zip" : name.endsWith(".json") ? "json" : "text",
    semanticPrivacyVerified,
    directCredentialSignatureMatches,
    decodedCredentialSignatureMatches,
    privateTaskPathMatches,
    archiveEntries,
  };
}

function scanText(text, { encoded }) {
  const totals = {
    directCredentialSignatureMatches: 0,
    decodedCredentialSignatureMatches: 0,
    privateTaskPathMatches: 0,
  };
  for (const projection of privacyTextProjections(text)) {
    const scan = scanTextProjection(projection, encoded);
    totals.directCredentialSignatureMatches += scan.directCredentialSignatureMatches;
    totals.decodedCredentialSignatureMatches += scan.decodedCredentialSignatureMatches;
    totals.privateTaskPathMatches += scan.privateTaskPathMatches;
  }
  return totals;
}

function scanTextProjection(text, encoded) {
  const result = {
    directCredentialSignatureMatches: countMatches(text, credentialRules),
    decodedCredentialSignatureMatches: 0,
    privateTaskPathMatches: countMatches(text, privateTaskPathRules),
  };
  if (!encoded) return result;
  for (const decoded of decodedBase64Candidates(text)) {
    result.decodedCredentialSignatureMatches += countMatches(decoded, credentialRules);
    result.privateTaskPathMatches += countMatches(decoded, privateTaskPathRules);
  }
  return result;
}

function privacyTextProjections(text) {
  const projections = [];
  const seen = new Set();
  const add = (value) => {
    if (!seen.has(value)) {
      if (projections.length >= 256) {
        throw new TypeError("Replication privacy text projection bound exceeded");
      }
      seen.add(value);
      projections.push(value);
    }
  };
  add(text);
  for (let index = 0; index < projections.length; index += 1) {
    const value = projections[index];
    add(value.replace(/[\r\n\u2028\u2029]/gu, ""));
    add(value.replace(/%([0-9a-f]{2})/giu, (_match, digits) =>
      String.fromCharCode(Number.parseInt(digits, 16))));
    add(value
      .replace(/\\n/gu, "\n")
      .replace(/\\r/gu, "\r")
      .replace(/\\x([0-9a-f]{2})/giu, (_match, digits) =>
        String.fromCharCode(Number.parseInt(digits, 16)))
      .replace(/\\u([0-9a-f]{4})/giu, (_match, digits) =>
        String.fromCharCode(Number.parseInt(digits, 16)))
      .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (match, digits) => {
        const codePoint = Number.parseInt(digits, 16);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
      }));
  }
  return projections;
}

function decodedBase64Candidates(text) {
  const results = [];
  const seen = new Set();
  const candidates = text.match(/[A-Za-z0-9+/_-]{24,4096}={0,2}/gu) ?? [];
  if (candidates.length > 20_000) {
    throw new TypeError("Replication encoded privacy scan candidate bound exceeded");
  }
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const canonical = candidate.replaceAll("-", "+").replaceAll("_", "/");
    const padded = canonical + "=".repeat((4 - canonical.length % 4) % 4);
    const bytes = Buffer.from(padded, "base64");
    if (bytes.byteLength < 8) continue;
    try {
      const decoded = utf8.decode(bytes);
      if (/^[\x09\x0a\x0d\x20-\x7e\p{L}\p{N}\p{P}\p{S}]+$/u.test(decoded)) {
        results.push(decoded);
      }
    } catch {
      // Binary hashes and integrity values are not textual encoded payloads.
    }
  }
  return results;
}

function countMatches(text, rules) {
  let count = 0;
  for (const [, expression] of rules) {
    expression.lastIndex = 0;
    count += [...text.matchAll(expression)].length;
  }
  return count;
}

function mergeScans(left, right) {
  return {
    directCredentialSignatureMatches:
      left.directCredentialSignatureMatches + right.directCredentialSignatureMatches,
    decodedCredentialSignatureMatches:
      left.decodedCredentialSignatureMatches + right.decodedCredentialSignatureMatches,
    privateTaskPathMatches: left.privateTaskPathMatches + right.privateTaskPathMatches,
  };
}

function parseArchive(bytes, label) {
  let archive;
  let entries;
  try {
    archive = new AdmZip(bytes);
    entries = archive.getEntries();
  } catch (error) {
    throw new TypeError(`Replication publication ZIP is unreadable: ${label}`, { cause: error });
  }
  if (archive.getZipComment() !== "") {
    throw new TypeError(`Replication publication ZIP has an opaque archive comment: ${label}`);
  }
  if (entries.length > maximumArchiveEntries) {
    throw new TypeError(`Replication publication ZIP entry bound exceeded: ${label}`);
  }
  const contents = new Map();
  const foldedNames = new Set();
  let expandedBytes = 0;
  for (const entry of entries) {
    if (!Buffer.isBuffer(entry.rawEntryName)) {
      throw new TypeError(`Replication publication ZIP raw entry name is absent: ${label}`);
    }
    const name = decodeUtf8(entry.rawEntryName, `${label}:entry-name`);
    assertSafeArchivePath(name, label);
    const foldedName = name.toLowerCase();
    const unixMode = (Number(entry.attr) >>> 16) & 0o170000;
    if (
      entry.isDirectory ||
      contents.has(name) ||
      foldedNames.has(foldedName) ||
      entry.comment !== "" ||
      entry.extra?.byteLength !== 0 ||
      entry.header?.encrypted === true ||
      ![0, 8].includes(Number(entry.header?.method)) ||
      unixMode === 0o120000
    ) {
      throw new TypeError(`Replication publication ZIP has a directory or duplicate: ${label}`);
    }
    foldedNames.add(foldedName);
    const declaredBytes = Number(entry.header?.size);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > maximumArchiveEntryBytes
    ) {
      throw new TypeError(`Replication publication ZIP entry size is invalid: ${label}:${name}`);
    }
    expandedBytes += declaredBytes;
    if (expandedBytes > maximumArchiveExpandedBytes) {
      throw new TypeError(`Replication publication ZIP expanded byte bound exceeded: ${label}`);
    }
    let data;
    try {
      data = entry.getData();
    } catch (error) {
      throw new TypeError(`Replication publication ZIP entry cannot be read: ${label}:${name}`, {
        cause: error,
      });
    }
    if (!Buffer.isBuffer(data) || data.byteLength !== declaredBytes) {
      throw new TypeError(`Replication publication ZIP entry bytes differ from header: ${label}:${name}`);
    }
    if (
      /(?:^|\/)[^/]+\.(?:zip|tar|tgz|gz|bz2|xz|7z)$/iu.test(name) ||
      (data.byteLength >= 4 && data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
    ) {
      throw new TypeError(`Replication publication ZIP contains a nested archive: ${label}:${name}`);
    }
    contents.set(name, Buffer.from(data));
  }
  return contents;
}

function assertSafeArchivePath(value, label) {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.normalize("NFC") !== value ||
    /^[A-Za-z]:/u.test(value) ||
    path.posix.normalize(value) !== value ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new TypeError(`Replication publication ZIP contains an unsafe path: ${label}`);
  }
}

function assertEvidenceTargetCommit(value, targetSha, contractTargetSha) {
  const commitRecord = requireRecord(value, "replication evidence target commit record");
  if (commitRecord.sha !== targetSha) {
    throw new TypeError("Replication evidence target commit SHA mismatch");
  }
  const repository = performanceReplicationPublicationIdentity.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const web = `https://github.com/${repository}`;
  exactUrl(commitRecord.url, `${api}/commits/${targetSha}`, "target commit API URL");
  exactUrl(commitRecord.html_url, `${web}/commit/${targetSha}`, "target commit web URL");
  const commit = requireRecord(commitRecord.commit, "replication evidence target commit payload");
  const tree = requireRecord(commit.tree, "replication evidence target commit tree");
  if (!gitShaPattern.test(tree.sha ?? "")) {
    throw new TypeError("Replication evidence target commit tree SHA is invalid");
  }
  exactUrl(tree.url, `${api}/git/trees/${tree.sha}`, "target commit tree URL");
  if (!Array.isArray(commitRecord.parents) || commitRecord.parents.length !== 1) {
    throw new TypeError("Replication evidence target commit must have one parent");
  }
  const parent = requireRecord(commitRecord.parents[0], "replication evidence target parent");
  if (parent.sha !== contractTargetSha) {
    throw new TypeError("Replication evidence target is not a direct successor of the contract");
  }
  exactUrl(parent.url, `${api}/commits/${contractTargetSha}`, "target parent API URL");
  exactUrl(parent.html_url, `${web}/commit/${contractTargetSha}`, "target parent web URL");
}

function assertLightweightTagRef(value, { repository, tag, targetSha }, label) {
  const tagRef = requireRecord(value, `${label} ref record`);
  const expectedRef = `refs/tags/${tag}`;
  if (tagRef.ref !== expectedRef) {
    throw new TypeError(`${label} ref mismatch`);
  }
  const api = `https://api.github.com/repos/${repository}`;
  exactUrl(
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
  exactUrl(
    object.url,
    `${api}/git/commits/${targetSha}`,
    `${label} object API URL`,
  );
  return deepFreeze({
    ref: expectedRef,
    objectType: "commit",
    objectSha: targetSha,
    lightweight: true,
  });
}

function assertReleaseAssets(value, releaseId, downloaded) {
  if (!Array.isArray(value) || value.length !== performanceReplicationPublicationAssetNames.length) {
    throw new TypeError("Replication evidence release does not have exactly 28 assets");
  }
  const names = new Set();
  const ids = new Set();
  const identity = performanceReplicationPublicationIdentity;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  for (const rawAsset of value) {
    const asset = requireRecord(rawAsset, "replication evidence release asset");
    if (
      typeof asset.name !== "string" ||
      !performanceReplicationPublicationAssetNames.includes(asset.name) ||
      names.has(asset.name)
    ) {
      throw new TypeError("Replication evidence release asset name is unknown or duplicated");
    }
    names.add(asset.name);
    const id = positiveSafeInteger(asset.id, `release asset ID: ${asset.name}`);
    if (ids.has(id)) throw new TypeError("Replication evidence release asset ID is duplicated");
    ids.add(id);
    const bytes = downloaded[asset.name];
    if (
      asset.state !== "uploaded" ||
      asset.size !== bytes.byteLength ||
      asset.digest !== `sha256:${sha256(bytes)}`
    ) {
      throw new TypeError(`Replication evidence release asset bytes mismatch: ${asset.name}`);
    }
    exactUrl(asset.url, `${api}/releases/assets/${id}`, `release asset API URL: ${asset.name}`);
    exactUrl(
      asset.browser_download_url,
      `${web}/releases/download/${identity.tag}/${asset.name}`,
      `release asset download URL: ${asset.name}`,
    );
  }
  if (names.size !== performanceReplicationPublicationAssetNames.length) {
    throw new TypeError("Replication evidence release asset inventory is incomplete");
  }
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) {
    throw new TypeError("Replication evidence release ID is invalid");
  }
}

function publicationHostedCompletedAt(assetBytes) {
  const run = parseCanonicalJsonBytes(
    assetBytes["workflow-run.json"],
    "anonymous hosted workflow run record",
  );
  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new TypeError("Replication evidence publication requires a successful terminal run");
  }
  return run.updated_at;
}

async function assertExactPublicationDirectory(value, expectedNames, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be one explicit absolute path`);
  }
  const root = path.resolve(value);
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(root), root)) {
    throw new TypeError(`${label} must be one real directory`);
  }
  const entries = await readdir(root, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) {
    throw new TypeError(`${label} contains a non-regular entry`);
  }
  assertExactNames(entries.map(({ name }) => name), expectedNames, label);
  return root;
}

async function readDirectoryByteMap(root, names) {
  return Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    await readOneRegularFile(path.join(root, name), name),
  ])));
}

async function readOneRegularFile(filePath, name) {
  const handle = await open(filePath, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size < 1) {
      throw new TypeError(`Replication publication asset is not one non-empty file: ${name}`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function assertFreshPublicationOutputDirectoryPath(value, payloadRoot) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(
      "replication publication output directory must be one explicit absolute path",
    );
  }
  const output = path.resolve(value);
  if (
    samePath(output, payloadRoot) ||
    isWithinPath(output, payloadRoot) ||
    isWithinPath(payloadRoot, output)
  ) {
    throw new TypeError(
      "replication publication input and output directories must be distinct and unnested",
    );
  }
  const parent = path.dirname(output);
  const parentMetadata = await lstat(parent);
  if (
    !parentMetadata.isDirectory() ||
    parentMetadata.isSymbolicLink() ||
    !samePath(await realpath(parent), parent)
  ) {
    throw new TypeError("replication publication output parent must be one real directory");
  }
  try {
    await lstat(output);
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  throw new TypeError("replication publication output directory already exists");
}

async function writeFreshPublicationDirectory(output, assetBytes) {
  let outputCreated = false;
  try {
    await mkdir(output, { recursive: false, mode: 0o700 });
    outputCreated = true;
    const metadata = await lstat(output);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      !samePath(await realpath(output), output)
    ) {
      throw new TypeError("replication publication output is not one real directory");
    }
    for (const name of performanceReplicationPublicationAssetNames) {
      const destination = path.join(output, name);
      const handle = await open(destination, "wx", 0o600);
      try {
        await handle.writeFile(assetBytes[name]);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const retained = await readOneRegularFile(destination, name);
      if (!retained.equals(assetBytes[name])) {
        throw new TypeError(`Replication publication output readback mismatch: ${name}`);
      }
    }
  } catch (error) {
    if (outputCreated) {
      await rm(output, { recursive: true, force: true });
    }
    throw error;
  }
}

function assertExactByteMap(value, expectedNames, label) {
  const record = requireRecord(value, label);
  assertExactNames(Reflect.ownKeys(record), expectedNames, label);
  for (const name of expectedNames) {
    if (!Buffer.isBuffer(record[name]) || record[name].byteLength < 1) {
      throw new TypeError(`${label} asset must be one non-empty Buffer: ${name}`);
    }
  }
  return record;
}

function assertExactNames(actual, expected, label) {
  if (
    actual.some((name) => typeof name !== "string") ||
    !isDeepStrictEqual([...actual].sort(compareUtf8), [...expected].sort(compareUtf8))
  ) {
    throw new TypeError(`${label} does not have the exact asset inventory`);
  }
}

function parseCanonicalJsonBytes(bytes, label) {
  const text = decodeUtf8(bytes, label);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${label} is not valid JSON`, { cause: error });
  }
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new TypeError(`${label} is not canonical deterministic JSON`);
  }
  return value;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
}

function decodeUtf8(bytes, label) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError(`${label} must be one Buffer`);
  try {
    return utf8.decode(bytes);
  } catch (error) {
    throw new TypeError(`${label} is not valid UTF-8`, { cause: error });
  }
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

function exactUrl(actual, expected, label) {
  if (actual !== expected) {
    throw new TypeError(`Replication evidence ${label} repository binding mismatch`);
  }
}

function fileIdentity(bytes) {
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const record = requireRecord(value, label);
  const keys = Reflect.ownKeys(record);
  if (
    keys.some((key) => typeof key !== "string") ||
    !isDeepStrictEqual(keys.sort(compareUtf8), [...expected].sort(compareUtf8))
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
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be one plain object`);
  }
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isWithinPath(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function deepFreeze(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !Buffer.isBuffer(value) &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
