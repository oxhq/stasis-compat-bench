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
} from "./crawl-phase-diagnostic-publication-v4.mjs";
import {
  assertCrawlPhaseDiagnosticContractAssets,
  crawlPhaseDiagnosticHostedIdentity,
  crawlPhaseDiagnosticV1InvalidIdentity,
  crawlPhaseDiagnosticWorkflowSourceIdentity,
  assertCrawlPhaseDiagnosticPreflightHostedBinding as assertPreflightProvenanceBinding,
  verifyCrawlPhaseDiagnosticWorkflowSourceProvenance,
} from "./crawl-phase-diagnostic-hosted-provenance-v4.mjs";
import {
  crawlPhaseDiagnosticV3UnpublishableIdentity,
  verifyCrawlPhaseDiagnosticV3UnpublishableObservation,
} from "./crawl-phase-diagnostic-v3-unpublishable.mjs";
import {
  crawlPhaseDiagnosticComparisonEvidenceIdentity as v3ComparisonEvidenceIdentity,
  crawlPhaseDiagnosticContractIdentity as v3ContractIdentity,
  crawlPhaseDiagnosticWorkflowSourceIdentity as v3WorkflowSourceIdentity,
} from "./crawl-phase-diagnostic-hosted-provenance-v3.mjs";

export const crawlPhaseDiagnosticAnonymousReleaseVerificationSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-anonymous-release-verification-v4";
export const crawlPhaseDiagnosticAnonymousContractPreflightSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-anonymous-contract-preflight-v4";

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

/**
 * Anonymous, pre-S4 publication gate. It proves the immutable V4 contract was
 * created with an explicit H7 target and that neither S4 nor V4 evidence is
 * public yet. It grants no product, timing, comparison, or implementation
 * authority.
 */
export async function verifyAnonymousCrawlPhaseDiagnosticV4ContractPreflight(
  { expectedContractTargetSha } = {},
  { fetchImpl = globalThis.fetch } = {},
) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Anonymous V4 contract preflight requires fetch");
  }
  if (!gitShaPattern.test(expectedContractTargetSha ?? "")) {
    throw new TypeError("Expected V4 contract target must be one Git SHA");
  }
  const identity = crawlPhaseDiagnosticContractIdentity;
  const apiRoot = `https://api.github.com/repos/${identity.repository}`;
  const source = crawlPhaseDiagnosticWorkflowSourceIdentity;
  const sourceApi = `https://api.github.com/repos/${crawlPhaseDiagnosticHostedIdentity.repository}`;
  const contractCommitRecord = await fetchAnonymousJson(
    `${apiRoot}/commits/${expectedContractTargetSha}`,
    "V4 contract target commit API",
    fetchImpl,
  );
  validateEvidenceTargetCommit(contractCommitRecord, expectedContractTargetSha);
  const contractTagRefRecord = await fetchTagRef(
    identity,
    expectedContractTargetSha,
    "V4 contract tag",
    fetchImpl,
  );
  const contract = await fetchAndVerifyAnonymousDiagnosticContract({
    fetchImpl,
    releaseTargetCommitRecord: contractCommitRecord,
    targetSha: expectedContractTargetSha,
  });
  const v3Unpublishable =
    await verifyAnonymousCrawlPhaseDiagnosticV3UnpublishableMotivation({ fetchImpl });

  await Promise.all([
    assertAnonymousNotFound(
      `${apiRoot}/releases/tags/${encodeURIComponent(identity.evidenceTag)}`,
      "V4 evidence release pre-S4 absence",
      fetchImpl,
    ),
    assertAnonymousNotFound(
      `${apiRoot}/git/ref/tags/${encodeURIComponent(identity.evidenceTag)}`,
      "V4 evidence tag pre-S4 absence",
      fetchImpl,
    ),
    assertAnonymousNotFound(
      `${sourceApi}/git/ref/heads/${encodeURIComponent(crawlPhaseDiagnosticHostedIdentity.headBranch)}`,
      "S4 source branch pre-S4 absence",
      fetchImpl,
    ),
    assertAnonymousCommitAbsent(
      `${sourceApi}/commits/${source.commitSha}`,
      source.commitSha,
      "S4 source commit pre-S4 absence",
      fetchImpl,
    ),
  ]);
  const sourceRuns = await fetchAnonymousJson(
    `${sourceApi}/actions/runs?branch=${encodeURIComponent(crawlPhaseDiagnosticHostedIdentity.headBranch)}&event=push&per_page=100`,
    "S4 source workflow runs preflight API",
    fetchImpl,
  );
  if (
    sourceRuns.total_count !== 0 ||
    !Array.isArray(sourceRuns.workflow_runs) ||
    sourceRuns.workflow_runs.length !== 0
  ) {
    throw new TypeError("S4 source workflow already has a hosted observation");
  }

  return deepFreeze({
    schema: crawlPhaseDiagnosticAnonymousContractPreflightSchema,
    status: "passed",
    purpose: "anonymous_pre_s4_contract_publication_gate",
    contract: contract.receipt,
    contractTag: {
      ref: contractTagRefRecord.ref,
      objectType: contractTagRefRecord.object.type,
      objectSha: contractTagRefRecord.object.sha,
      lightweight: true,
    },
    v3Unpublishable: {
      status: v3Unpublishable.status,
      reasonCode: v3Unpublishable.reasonCode,
      runId: v3Unpublishable.runId,
      h6VerifierError: v3Unpublishable.h6VerifierError,
    },
    source: {
      branch: crawlPhaseDiagnosticHostedIdentity.headBranch,
      commitSha: source.commitSha,
      branchAbsent: true,
      commitAbsent: true,
      pushRunCount: 0,
    },
    evidenceReleaseAbsent: true,
    evidenceTagAbsent: true,
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
}

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
  const invalidV1Motivation = await verifyAnonymousCrawlPhaseDiagnosticV1Motivation({
    fetchImpl,
  });
  const unpublishableV3Motivation =
    await verifyAnonymousCrawlPhaseDiagnosticV3UnpublishableMotivation({ fetchImpl });

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
    invalidV1Motivation,
    unpublishableV3Motivation,
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
      exactFourContractAssetInventory: true,
      contractAssetBytesMatchReleaseMetadata: true,
      contractAssetGitBlobsMatchDiagnosticTarget: true,
      currentContractStateMatchesRetainedEvidence: true,
      contractPreflightMatchesHostedEvidence: true,
      contractWorkflowAssetMatchesHostedEvidence: true,
      targetDirectSuccessorOfH6: true,
      invalidV1EvidenceReleaseFetchedWithoutCredentials: true,
      invalidV1EvidenceTagBoundToH2: true,
      verifierErratumTagBoundToH3: true,
      publicVerificationTagBoundToH3: true,
      exactInvalidV1PublicReceiptBytesVerified: true,
      unpublishableV3ObservationFetchedWithoutCredentials: true,
      unpublishableV3ArtifactPayloadNotDownloaded: true,
      actualMainTargetRejectedByFrozenH6Verifier: true,
      exactH6TargetCounterfactualAcceptedByFrozenH6Verifier: true,
      v3TimingOutcomeAndComparisonNotImported: true,
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

/**
 * Replays the immutable public record that motivated V4. The two H3 releases
 * deliberately bind through their lightweight tag refs because GitHub records
 * their incidental target_commitish as "main". No timing observation is
 * reached through this verifier.
 */
export async function verifyAnonymousCrawlPhaseDiagnosticV1Motivation({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Anonymous invalid V1 motivation verification requires fetch");
  }
  const identity = crawlPhaseDiagnosticV1InvalidIdentity;
  const repository = identity.evidenceRelease.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const [evidenceRelease, evidenceTagRef, erratumRelease, erratumTagRef,
    publicVerificationRelease, publicVerificationTagRef] = await Promise.all([
    fetchAnonymousJson(
      `${api}/releases/${identity.evidenceRelease.releaseId}`,
      "invalid V1 evidence release API",
      fetchImpl,
    ),
    fetchAnonymousTagRef(identity.evidenceRelease, "invalid V1 evidence tag", fetchImpl),
    fetchAnonymousJson(
      `${api}/releases/${identity.verifierErratumRelease.releaseId}`,
      "V1 verifier erratum release API",
      fetchImpl,
    ),
    fetchAnonymousTagRef(
      identity.verifierErratumRelease,
      "V1 verifier erratum tag",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${api}/releases/${identity.publicVerificationRelease.releaseId}`,
      "V1 public verification release API",
      fetchImpl,
    ),
    fetchAnonymousTagRef(
      identity.publicVerificationRelease,
      "V1 public verification tag",
      fetchImpl,
    ),
  ]);

  verifyFrozenMotivationRelease(evidenceRelease, identity.evidenceRelease, {
    exactTargetCommitish: identity.evidenceRelease.targetCommitSha,
    expectedAssetCount: identity.evidenceRelease.assetCount,
    selectedAssets: Object.values(identity.evidenceRelease.selectedAssets),
  });
  validateLightweightTagRef(
    evidenceTagRef,
    identity.evidenceRelease,
    identity.evidenceRelease.targetCommitSha,
    "invalid V1 evidence tag",
  );
  verifyFrozenMotivationRelease(erratumRelease, identity.verifierErratumRelease, {
    expectedAssetCount: 0,
  });
  validateLightweightTagRef(
    erratumTagRef,
    identity.verifierErratumRelease,
    identity.verifierErratumRelease.targetCommitSha,
    "V1 verifier erratum tag",
  );
  verifyFrozenMotivationRelease(
    publicVerificationRelease,
    identity.publicVerificationRelease,
    {
      expectedAssetCount: 1,
      selectedAssets: [identity.publicVerificationRelease.receipt],
    },
  );
  validateLightweightTagRef(
    publicVerificationTagRef,
    identity.publicVerificationRelease,
    identity.publicVerificationRelease.targetCommitSha,
    "V1 public verification tag",
  );

  const receiptIdentity = identity.publicVerificationRelease.receipt;
  const receiptBytes = await fetchAnonymousBytes(
    `https://github.com/${repository}/releases/download/${identity.publicVerificationRelease.tag}/${receiptIdentity.name}`,
    {
      accept: "application/octet-stream",
      expectedBytes: receiptIdentity.bytes,
      fetchImpl,
      label: "invalid V1 anonymous public receipt",
      maximumBytes: receiptIdentity.bytes,
    },
  );
  if (
    receiptBytes.byteLength !== receiptIdentity.bytes ||
    sha256(receiptBytes) !== receiptIdentity.sha256
  ) {
    throw new TypeError("Invalid V1 anonymous public receipt byte identity changed");
  }
  const receipt = parseJsonBytes(receiptBytes, "invalid V1 anonymous public receipt");
  const canonicalReceiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (!canonicalReceiptBytes.equals(receiptBytes)) {
    throw new TypeError("Invalid V1 anonymous public receipt is not canonical JSON");
  }
  assertInvalidV1PublicReceipt(receipt, identity);

  return deepFreeze({
    status: "passed",
    purpose: "invalid_v1_public_motivation_only",
    evidenceRelease: frozenMotivationReleaseProjection(
      evidenceRelease,
      identity.evidenceRelease.targetCommitSha,
    ),
    verifierErratumRelease: frozenMotivationReleaseProjection(
      erratumRelease,
      identity.verifierErratumRelease.targetCommitSha,
    ),
    publicVerificationRelease: frozenMotivationReleaseProjection(
      publicVerificationRelease,
      identity.publicVerificationRelease.targetCommitSha,
    ),
    receipt: {
      name: receiptIdentity.name,
      id: receiptIdentity.id,
      bytes: receiptIdentity.bytes,
      sha256: receiptIdentity.sha256,
      schema: receipt.schema,
      outcomeClass: receipt.outcomeClass,
    },
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
}

/**
 * Replays only the bounded public metadata that proves why the successful V3
 * run is unpublishable. The artifact ZIP is deliberately never downloaded,
 * and the verifier returns no timing, diagnostic-outcome, or comparison value.
 */
export async function verifyAnonymousCrawlPhaseDiagnosticV3UnpublishableMotivation({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("Anonymous unpublishable V3 motivation verification requires fetch");
  }
  const identity = crawlPhaseDiagnosticV3UnpublishableIdentity;
  const source = identity.workflowSource;
  const observation = identity.hostedObservation;
  const contract = identity.v3Contract;
  const sourceApi = `https://api.github.com/repos/${source.repository}`;
  const contractApi = `https://api.github.com/repos/${contract.repository}`;
  const runRecord = await fetchAnonymousJson(
    `${sourceApi}/actions/runs/${observation.runId}`,
    "unpublishable V3 workflow run API",
    fetchImpl,
  );
  if (runRecord.workflow_id !== 350_375_679) {
    throw new TypeError("Diagnostic V3 workflow ID changed");
  }
  const [workflowRunsListing, jobsListing, artifactsListing,
    contractReleaseRecord, contractCommitRecord, contractTagRefRecord,
    comparisonEvidenceReleaseRecord, comparisonEvidenceCommitRecord,
    comparisonEvidenceTagRefRecord] = await Promise.all([
    fetchAnonymousJson(
      `${sourceApi}/actions/workflows/${runRecord.workflow_id}/runs?branch=${encodeURIComponent(source.branch)}&event=push&per_page=100`,
      "unpublishable V3 workflow runs API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/actions/runs/${observation.runId}/jobs?filter=all&per_page=100`,
      "unpublishable V3 workflow jobs API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/actions/runs/${observation.runId}/artifacts?per_page=100`,
      "unpublishable V3 workflow artifacts API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${contractApi}/releases/${contract.releaseId}`,
      "unpublishable V3 contract release API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${contractApi}/commits/${contract.commitSha}`,
      "unpublishable V3 contract commit API",
      fetchImpl,
    ),
    fetchTagRef(
      contract,
      contract.commitSha,
      "unpublishable V3 contract tag",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${contractApi}/releases/${v3ComparisonEvidenceIdentity.releaseId}`,
      "V3 frozen comparison evidence release API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${contractApi}/commits/${v3ComparisonEvidenceIdentity.targetCommitSha}`,
      "V3 frozen comparison evidence commit API",
      fetchImpl,
    ),
    fetchTagRef(
      v3ComparisonEvidenceIdentity,
      v3ComparisonEvidenceIdentity.targetCommitSha,
      "V3 frozen comparison evidence tag",
      fetchImpl,
    ),
  ]);

  const v3ContractAssetBytes = await fetchFrozenAssetBytes({
    repository: contract.repository,
    tag: contract.tag,
    assets: contract.assets,
    fetchImpl,
    label: "V3 contract asset",
  });
  const diagnosticContractAssets = {
    protocol: v3ContractAssetBytes[v3ContractIdentity.assets.protocol],
    workflow: v3ContractAssetBytes[v3ContractIdentity.assets.workflow],
    preflight: {
      bytes: v3ContractAssetBytes[v3ContractIdentity.assets.preflight],
      value: parseJsonBytes(
        v3ContractAssetBytes[v3ContractIdentity.assets.preflight],
        "V3 contract preflight asset",
      ),
    },
    v2Unpublishable: v3ContractAssetBytes[v3ContractIdentity.assets.v2Unpublishable],
  };
  const comparisonAssets = Object.values(v3ComparisonEvidenceIdentity.assets);
  const comparisonAssetBytes = await fetchFrozenAssetBytes({
    repository: v3ComparisonEvidenceIdentity.repository,
    tag: v3ComparisonEvidenceIdentity.tag,
    assets: comparisonAssets,
    fetchImpl,
    label: "V3 frozen comparison input",
  });
  const comparisonEvidenceAssets = {
    artifactBinding: comparisonAssetBytes[
      v3ComparisonEvidenceIdentity.assets.artifactBinding.name
    ],
    freshCrawlRaw: comparisonAssetBytes[
      v3ComparisonEvidenceIdentity.assets.freshCrawlRaw.name
    ],
  };

  const sourcePreflight = requireRecord(
    diagnosticContractAssets.preflight.value.workflowSource,
    "V3 source preflight",
  );
  if (
    sourcePreflight.commitSha !== v3WorkflowSourceIdentity.commitSha ||
    sourcePreflight.treeSha !== v3WorkflowSourceIdentity.treeSha
  ) {
    throw new TypeError("V3 source preflight identity changed");
  }
  const [workflowSourceCommitRecord, rootTreeRecord, workflowSourceBlobRecord,
    preservedV2DiagnosticWorkflowBlobRecord,
    preservedV1DiagnosticWorkflowBlobRecord,
    preservedComparisonWorkflowBlobRecord] = await Promise.all([
    fetchAnonymousJson(
      `${sourceApi}/commits/${sourcePreflight.commitSha}`,
      "V3 workflow source commit API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/git/trees/${sourcePreflight.treeSha}`,
      "V3 workflow source root tree API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/git/blobs/${sourcePreflight.workflow.blobSha}`,
      "V3 workflow source blob API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/git/blobs/${sourcePreflight.preservedV2DiagnosticWorkflow.blobSha}`,
      "V3 preserved V2 workflow blob API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/git/blobs/${sourcePreflight.preservedV1DiagnosticWorkflow.blobSha}`,
      "V3 preserved V1 workflow blob API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${sourceApi}/git/blobs/${sourcePreflight.preservedComparisonWorkflow.blobSha}`,
      "V3 preserved comparison workflow blob API",
      fetchImpl,
    ),
  ]);
  const githubTreeSha = directoryTreeShaForFetch(rootTreeRecord, {
    repository: source.repository,
    expectedTreeSha: sourcePreflight.treeSha,
    path: ".github",
    label: "V3 workflow source .github directory",
  });
  const githubTreeRecord = await fetchAnonymousJson(
    `${sourceApi}/git/trees/${githubTreeSha}`,
    "V3 workflow source .github tree API",
    fetchImpl,
  );
  const workflowsTreeSha = directoryTreeShaForFetch(githubTreeRecord, {
    repository: source.repository,
    expectedTreeSha: githubTreeSha,
    path: "workflows",
    label: "V3 workflow source workflows directory",
  });
  const workflowsTreeRecord = await fetchAnonymousJson(
    `${sourceApi}/git/trees/${workflowsTreeSha}`,
    "V3 workflow source workflows tree API",
    fetchImpl,
  );
  const workflowSourceBytes = decodeGitBlobBytes(
    workflowSourceBlobRecord,
    "V3 workflow source blob",
  );

  return verifyCrawlPhaseDiagnosticV3UnpublishableObservation({
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
    workflowSourceTreeRecords: {
      root: rootTreeRecord,
      github: githubTreeRecord,
      workflows: workflowsTreeRecord,
    },
    workflowSourceBlobRecord,
    workflowSourceBytes,
    preservedV2DiagnosticWorkflowBlobRecord,
    preservedV1DiagnosticWorkflowBlobRecord,
    preservedComparisonWorkflowBlobRecord,
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
    v3Unpublishable: assetBytes[identity.assets.v3Unpublishable],
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
    preservedV3DiagnosticWorkflowBlobRecord,
    preservedV2DiagnosticWorkflowBlobRecord,
    preservedV1DiagnosticWorkflowBlobRecord,
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
      `${apiRoot}/git/blobs/${source.preservedV3DiagnosticWorkflow?.blobSha}`,
      "preserved V3 diagnostic workflow blob API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/blobs/${source.preservedV2DiagnosticWorkflow?.blobSha}`,
      "preserved V2 diagnostic workflow blob API",
      fetchImpl,
    ),
    fetchAnonymousJson(
      `${apiRoot}/git/blobs/${source.preservedV1DiagnosticWorkflow?.blobSha}`,
      "preserved V1 diagnostic workflow blob API",
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
    preservedV3DiagnosticWorkflowBlobRecord,
    preservedV2DiagnosticWorkflowBlobRecord,
    preservedV1DiagnosticWorkflowBlobRecord,
    preservedComparisonWorkflowBlobRecord,
    diagnosticContractWorkflowBytes: workflowMirrorBytes,
    diagnosticContractPreflightValue: preflightValue,
  });
}

async function fetchFrozenAssetBytes({ repository, tag, assets, fetchImpl, label }) {
  if (!Array.isArray(assets) || assets.length < 1) {
    throw new TypeError(`${label} identity inventory is invalid`);
  }
  const result = {};
  for (const asset of assets) {
    const identity = requireRecord(asset, `${label} identity`);
    const bytes = await fetchAnonymousBytes(
      `https://github.com/${repository}/releases/download/${tag}/${identity.name}`,
      {
        accept: "application/octet-stream",
        expectedBytes: identity.bytes,
        fetchImpl,
        label: `${label} ${identity.name}`,
        maximumBytes: identity.bytes,
      },
    );
    if (
      bytes.byteLength !== identity.bytes ||
      sha256(bytes) !== identity.sha256
    ) {
      throw new TypeError(`${label} byte identity changed: ${identity.name}`);
    }
    result[identity.name] = bytes;
  }
  return result;
}

function decodeGitBlobBytes(value, label) {
  const record = requireRecord(value, label);
  if (
    record.encoding !== "base64" ||
    typeof record.content !== "string" ||
    !Number.isSafeInteger(record.size) ||
    record.size < 1
  ) {
    throw new TypeError(`${label} encoding is invalid`);
  }
  const compact = record.content.replace(/[\r\n]/gu, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(compact)) {
    throw new TypeError(`${label} base64 is invalid`);
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.byteLength !== record.size) {
    throw new TypeError(`${label} size changed`);
  }
  return bytes;
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
    throw new TypeError("Diagnostic contract release must contain exactly four assets");
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
    throw new TypeError("Diagnostic contract assets are not exact added blobs in H7");
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

async function fetchAnonymousTagRef(identity, label, fetchImpl) {
  return fetchTagRef(identity, identity.targetCommitSha, label, fetchImpl);
}

function verifyFrozenMotivationRelease(value, identity, {
  exactTargetCommitish = undefined,
  expectedAssetCount,
  selectedAssets = [],
} = {}) {
  const release = requireRecord(value, `${identity.tag} release`);
  const repository = identity.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const web = `https://github.com/${repository}`;
  if (
    release.id !== identity.releaseId ||
    release.tag_name !== identity.tag ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false ||
    release.created_at !== identity.createdAt ||
    release.published_at !== identity.publishedAt ||
    typeof release.target_commitish !== "string" ||
    release.target_commitish.length === 0 ||
    (exactTargetCommitish !== undefined &&
      release.target_commitish !== exactTargetCommitish)
  ) {
    throw new TypeError(`Frozen motivation release identity changed: ${identity.tag}`);
  }
  canonicalInstant(release.created_at, `${identity.tag} created_at`);
  canonicalInstant(release.published_at, `${identity.tag} published_at`);
  exactString(release.url, `${api}/releases/${identity.releaseId}`,
    `${identity.tag} release API URL`);
  exactString(release.assets_url, `${api}/releases/${identity.releaseId}/assets`,
    `${identity.tag} release assets URL`);
  exactString(
    release.upload_url,
    `https://uploads.github.com/repos/${repository}/releases/${identity.releaseId}/assets{?name,label}`,
    `${identity.tag} release upload URL`,
  );
  exactString(release.html_url, `${web}/releases/tag/${identity.tag}`,
    `${identity.tag} release web URL`);
  if (
    !Array.isArray(release.assets) ||
    release.assets.length !== expectedAssetCount
  ) {
    throw new TypeError(`Frozen motivation release asset count changed: ${identity.tag}`);
  }
  const byName = new Map();
  const ids = new Set();
  for (const raw of release.assets) {
    const asset = requireRecord(raw, `${identity.tag} release asset`);
    if (
      typeof asset.name !== "string" ||
      byName.has(asset.name) ||
      !Number.isSafeInteger(asset.id) ||
      asset.id < 1 ||
      ids.has(asset.id) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 1 ||
      asset.state !== "uploaded" ||
      !/^sha256:[a-f0-9]{64}$/u.test(asset.digest ?? "")
    ) {
      throw new TypeError(`Frozen motivation release asset metadata is invalid: ${identity.tag}`);
    }
    ids.add(asset.id);
    exactString(asset.url, `${api}/releases/assets/${asset.id}`,
      `${identity.tag} asset API URL`);
    exactString(
      asset.browser_download_url,
      `${web}/releases/download/${identity.tag}/${asset.name}`,
      `${identity.tag} asset download URL`,
    );
    byName.set(asset.name, asset);
  }
  for (const selected of selectedAssets) {
    const asset = byName.get(selected.name);
    if (
      asset?.id !== selected.id ||
      asset?.size !== selected.bytes ||
      asset?.digest !== `sha256:${selected.sha256}`
    ) {
      throw new TypeError(`Frozen motivation selected asset changed: ${selected.name}`);
    }
  }
  return release;
}

function frozenMotivationReleaseProjection(value, tagTargetSha) {
  return {
    releaseId: value.id,
    tag: value.tag_name,
    tagTargetSha,
    immutable: true,
    draft: false,
    prerelease: false,
    createdAt: value.created_at,
    publishedAt: value.published_at,
    assetCount: value.assets.length,
  };
}

function assertInvalidV1PublicReceipt(value, identity) {
  const receipt = requireRecord(value, "invalid V1 public verification receipt");
  const release = requireRecord(receipt.release, "invalid V1 receipt release");
  const claims = [
    "authorityEligible",
    "timingEligible",
    "statisticsEligible",
    "comparisonEligible",
    "optimizationEligible",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
  ];
  if (
    receipt.schema !==
      "stasis-v0.3.3-performance-crawl-phase-diagnostic-anonymous-release-verification-v1" ||
    receipt.status !== "passed" ||
    receipt.diagnosticStatus !== "failed" ||
    receipt.outcomeClass !== "DIAGNOSTIC_INVALID_WITH_STATUS" ||
    receipt.releaseVerifierSchema !==
      "stasis-v0.3.3-performance-crawl-phase-diagnostic-release-verification-v1" ||
    receipt.decisionState !== "STAY_0_4_UNASSIGNED" ||
    claims.some((name) => receipt[name] !== false) ||
    release.repository !== identity.evidenceRelease.repository ||
    release.tag !== identity.evidenceRelease.tag ||
    release.releaseId !== identity.evidenceRelease.releaseId ||
    release.targetCommitSha !== identity.evidenceRelease.targetCommitSha ||
    release.publishedAt !== identity.evidenceRelease.publishedAt ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  ) {
    throw new TypeError("Invalid V1 public verification receipt identity changed");
  }
  const bindings = requireRecord(release.tagBindings, "invalid V1 receipt tag bindings");
  const expectedBindings = [
    ["comparison", crawlPhaseDiagnosticComparisonEvidenceIdentity.tag,
      crawlPhaseDiagnosticComparisonEvidenceTargetSha],
    ["contract", "stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v1",
      identity.evidenceRelease.targetCommitSha],
    ["evidence", identity.evidenceRelease.tag,
      identity.evidenceRelease.targetCommitSha],
  ];
  for (const [key, tag, sha] of expectedBindings) {
    const binding = requireRecord(bindings[key], `invalid V1 ${key} tag binding`);
    if (
      binding.ref !== `refs/tags/${tag}` ||
      binding.objectType !== "commit" ||
      binding.objectSha !== sha ||
      binding.lightweight !== true
    ) {
      throw new TypeError(`Invalid V1 ${key} tag binding changed`);
    }
  }
  if (
    receipt.contract?.targetCommitSha !== identity.evidenceRelease.targetCommitSha ||
    receipt.contract?.tag !==
      "stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v1" ||
    !Array.isArray(receipt.assetByteMap) ||
    receipt.assetByteMap.length !== identity.evidenceRelease.assetCount
  ) {
    throw new TypeError("Invalid V1 receipt contract or asset inventory changed");
  }
  const assets = new Map(receipt.assetByteMap.map((entry) => [entry?.name, entry]));
  for (const expected of Object.values(identity.evidenceRelease.selectedAssets)) {
    const asset = assets.get(expected.name);
    if (asset?.bytes !== expected.bytes || asset?.sha256 !== expected.sha256) {
      throw new TypeError(`Invalid V1 receipt asset byte map changed: ${expected.name}`);
    }
  }
  return receipt;
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
  if (parent.sha !== crawlPhaseDiagnosticContractIdentity.soleParentSha) {
    throw new TypeError("Diagnostic V4 target is not a direct successor of H6");
  }
  exactString(
    parent.url,
    `${api}/commits/${crawlPhaseDiagnosticContractIdentity.soleParentSha}`,
    "target parent API URL",
  );
  exactString(
    parent.html_url,
    `${web}/commit/${crawlPhaseDiagnosticContractIdentity.soleParentSha}`,
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
    value.targetDirectSuccessorOfH6 !== true ||
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

async function assertAnonymousNotFound(initialUrl, label, fetchImpl) {
  const url = requireSafePublicUrl(initialUrl, label);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
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
  await discardBody(response);
  if (response.status !== 404) {
    throw new TypeError(`${label} expected HTTP 404 but received ${response.status}`);
  }
  return true;
}

async function assertAnonymousCommitAbsent(initialUrl, expectedSha, label, fetchImpl) {
  if (!gitShaPattern.test(expectedSha ?? "")) {
    throw new TypeError(`${label} expected SHA is invalid`);
  }
  const url = requireSafePublicUrl(initialUrl, label);
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
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
  if (response.status !== 422) {
    await discardBody(response);
    throw new TypeError(`${label} expected HTTP 422 but received ${response.status}`);
  }
  const contentEncoding = response.headers.get("content-encoding");
  if (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity") {
    await discardBody(response);
    throw new TypeError(`${label} returned encoded response body`);
  }
  const maximumBytes = 16 * 1024;
  const contentLength = parseContentLength(response.headers.get("content-length"), label);
  if (contentLength !== null && contentLength > maximumBytes) {
    await discardBody(response);
    throw new TypeError(`${label} exceeds byte bound`);
  }
  const body = parseJsonBytes(await readBoundedBody(response, maximumBytes, label), label);
  exactKeys(body, ["message", "documentation_url", "status"], label);
  if (
    body.message !== `No commit found for SHA: ${expectedSha}` ||
    body.documentation_url !== "https://docs.github.com/rest/commits/commits#get-a-commit" ||
    body.status !== "422"
  ) {
    throw new TypeError(`${label} returned an unexpected HTTP 422 body`);
  }
  return true;
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
