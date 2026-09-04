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
  assertCrawlPhaseDiagnosticVerificationReceipt,
  verifyCrawlPhaseDiagnosticArtifactSet,
} from "./crawl-phase-diagnostic-verification.mjs";
import {
  assertCrawlPhaseDiagnosticArtifactBindingReceipt,
  assertCrawlPhaseDiagnosticOutcome as assertBoundCrawlPhaseDiagnosticOutcome,
  bindCrawlPhaseDiagnosticArtifacts,
  crawlPhaseDiagnosticOutcomeSchema as boundCrawlPhaseDiagnosticOutcomeSchema,
  crawlPhaseDiagnosticZipSafetyPolicy,
} from "./crawl-phase-diagnostic-artifact-binding.mjs";
import {
  crawlPhaseDiagnosticArtifactEntries,
  crawlPhaseDiagnosticComparisonEvidenceIdentity as hostedComparisonEvidenceIdentity,
  crawlPhaseDiagnosticContractIdentity as hostedContractIdentity,
  crawlPhaseDiagnosticExpectedArtifactNames,
  crawlPhaseDiagnosticPublicationOutcomeAssetNames,
  assertCrawlPhaseDiagnosticHostedProvenanceReceipt,
  assertCrawlPhaseDiagnosticRetainedApiBinding,
} from "./crawl-phase-diagnostic-hosted-provenance.mjs";
import {
  performanceReplicationPublicationAssetNames,
} from "./replication-publication.mjs";

export const crawlPhaseDiagnosticPublicationSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-publication-v1";
export const crawlPhaseDiagnosticPrivacyScanSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-privacy-scan-v1";
export const crawlPhaseDiagnosticReleaseVerificationSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-release-verification-v1";
export const crawlPhaseDiagnosticOutcomeSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-outcome-v1";
export const crawlPhaseDiagnosticComparisonEvidenceTargetSha =
  hostedComparisonEvidenceIdentity.targetCommitSha;

export const crawlPhaseDiagnosticPublicationIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  tag: "stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v1",
});

export const crawlPhaseDiagnosticContractIdentity = hostedContractIdentity;

export const crawlPhaseDiagnosticComparisonEvidenceIdentity =
  hostedComparisonEvidenceIdentity;

export const crawlPhaseDiagnosticOutcomeClasses = Object.freeze([
  "VALID_NON_AUTHORITATIVE",
  "DIAGNOSTIC_INVALID_WITH_STATUS",
  "INFRASTRUCTURE_INVALID_NO_ARTIFACT",
]);

export const crawlPhaseDiagnosticPublicationAssetNamesByOutcome =
  crawlPhaseDiagnosticPublicationOutcomeAssetNames;

export const crawlPhaseDiagnosticPublicationPayloadNamesByOutcome = deepFreeze(
  Object.fromEntries(crawlPhaseDiagnosticOutcomeClasses.map((outcomeClass) => [
    outcomeClass,
    crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass].filter(
      (name) => name !== "privacy-scan.json" && name !== "SHA256SUMS.txt",
    ),
  ])),
);

export const crawlPhaseDiagnosticEvidenceArchiveNames =
  crawlPhaseDiagnosticArtifactEntries.evidence;

export const crawlPhaseDiagnosticStatusArchiveNames =
  crawlPhaseDiagnosticArtifactEntries.status;

export const crawlPhaseDiagnosticBundleArchiveNamesByOutcome = deepFreeze({
  VALID_NON_AUTHORITATIVE: crawlPhaseDiagnosticArtifactEntries.valid,
  DIAGNOSTIC_INVALID_WITH_STATUS: crawlPhaseDiagnosticArtifactEntries.status,
  INFRASTRUCTURE_INVALID_NO_ARTIFACT: [],
});

const semanticPrivacyNames = new Set([
  "comparison-artifact-binding.json",
  "comparison-fresh-crawl-raw.json",
  "comparison-input-verification.json",
  "crawl-phase-crawlee-raw.json",
  "crawl-phase-localization-evidence.json",
  "crawl-phase-stasis-raw.json",
  "diagnostic-artifact-binding.json",
  "diagnostic-outcome.json",
  "diagnostic-verification.json",
  "hosted-provenance.json",
]);

const apiSnapshotNames = new Set([
  "comparison-evidence-release-commit.json",
  "comparison-evidence-release.json",
  "contract-commit.json",
  "contract-release.json",
  "workflow-artifacts.json",
  "workflow-jobs.json",
  "workflow-run.json",
  "workflow-runs.json",
  "workflow-source-commit.json",
]);

const comparisonAssets = deepFreeze({
  "comparison-fresh-crawl-raw.json": {
    sourceName: "fresh-crawl-raw.json",
    assetId: 544250086,
    bytes: 221543,
    sha256: "52a76a4ebb726c6ab78b70356655e8abd7a5e84d9ce175a8e0d876f543c1a16b",
  },
  "comparison-artifact-binding.json": {
    sourceName: "artifact-binding.json",
    assetId: 544250114,
    bytes: 5086,
    sha256: "78d91f9c12f85d538dff1944e772614bf9b0adc9841d647c93ab8f608f1ba4ad",
  },
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

const invalidPhaseCodes = deepFreeze({
  input_verification: "INPUT_VERIFICATION_FAILED",
  diagnostic_execution: "DIAGNOSTIC_EXECUTION_FAILED",
  offline_verification: "OFFLINE_VERIFICATION_FAILED",
});
const terminalNonSuccessConclusions = new Set([
  "action_required",
  "cancelled",
  "failure",
  "neutral",
  "skipped",
  "stale",
  "startup_failure",
  "timed_out",
]);
const sha256Pattern = /^[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const maximumArchiveEntries = 32;

export function publicationAssetNamesForCrawlPhaseDiagnosticOutcome(outcomeClass) {
  if (!crawlPhaseDiagnosticOutcomeClasses.includes(outcomeClass)) {
    throw new TypeError("Unknown crawl phase diagnostic outcome class");
  }
  return crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass];
}

export function publicationPayloadNamesForCrawlPhaseDiagnosticOutcome(outcomeClass) {
  if (!crawlPhaseDiagnosticOutcomeClasses.includes(outcomeClass)) {
    throw new TypeError("Unknown crawl phase diagnostic outcome class");
  }
  return crawlPhaseDiagnosticPublicationPayloadNamesByOutcome[outcomeClass];
}

export function assertCrawlPhaseDiagnosticOutcome(value) {
  if (boundCrawlPhaseDiagnosticOutcomeSchema !== crawlPhaseDiagnosticOutcomeSchema) {
    throw new TypeError("Crawl phase diagnostic outcome schema dependency drifted");
  }
  if (assertBoundCrawlPhaseDiagnosticOutcome(value) !== value) {
    throw new TypeError("Crawl phase diagnostic outcome dependency rejected its input");
  }
  const outcome = exactKeys(value, [
    "schema",
    "status",
    "outcomeClass",
    "phase",
    "runAttempt",
    "evidenceArtifactEligible",
    "authorityEligible",
    "timingEligible",
    "statisticsEligible",
    "comparisonEligible",
    "optimizationEligible",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
    "decisionState",
    "failure",
  ], "crawl phase diagnostic outcome");
  if (
    outcome.schema !== crawlPhaseDiagnosticOutcomeSchema ||
    !crawlPhaseDiagnosticOutcomeClasses.includes(outcome.outcomeClass) ||
    outcome.runAttempt !== 1 ||
    outcome.authorityEligible !== false ||
    outcome.timingEligible !== false ||
    outcome.statisticsEligible !== false ||
    outcome.comparisonEligible !== false ||
    outcome.optimizationEligible !== false ||
    outcome.generalizedSpeedClaimAuthorized !== false ||
    outcome.implementationWorkAuthorized !== false ||
    outcome.decisionState !== "STAY_0_4_UNASSIGNED"
  ) {
    throw new TypeError("Crawl phase diagnostic outcome grants forbidden authority or drifted");
  }
  if (outcome.outcomeClass === "VALID_NON_AUTHORITATIVE") {
    if (
      outcome.status !== "passed" ||
      outcome.phase !== "complete" ||
      outcome.evidenceArtifactEligible !== true ||
      outcome.failure !== null
    ) {
      throw new TypeError("Valid crawl phase diagnostic outcome is malformed");
    }
    return outcome;
  }
  if (
    outcome.status !== "failed" ||
    outcome.evidenceArtifactEligible !== false ||
    !isPlainRecord(outcome.failure) ||
    !hasExactKeys(outcome.failure, ["code", "messageOmitted"]) ||
    outcome.failure.messageOmitted !== true
  ) {
    throw new TypeError("Invalid crawl phase diagnostic outcome is malformed");
  }
  if (outcome.outcomeClass === "DIAGNOSTIC_INVALID_WITH_STATUS") {
    if (invalidPhaseCodes[outcome.phase] !== outcome.failure.code) {
      throw new TypeError("Diagnostic-invalid phase and failure code differ");
    }
  } else if (
    outcome.phase !== "hosted_infrastructure" ||
    outcome.failure.code !== "HOSTED_INFRASTRUCTURE_FAILED"
  ) {
    throw new TypeError("Infrastructure-invalid phase and failure code differ");
  }
  return outcome;
}

export function buildCrawlPhaseDiagnosticPublication(
  { payloadAssetBytes } = {},
  { receiptChainValidator = validateCrawlPhaseDiagnosticPublicationReceiptChain } = {},
) {
  const { outcome, assets: payload } = assertOutcomeBoundByteMap(
    payloadAssetBytes,
    false,
    "crawl phase diagnostic publication payload",
  );
  const chain = assertReceiptChainIdentity(receiptChainValidator(payload, outcome), outcome);
  const privacyScan = createCrawlPhaseDiagnosticPrivacyScan(payload, chain, outcome);
  const privacyScanBytes = canonicalJsonBytes(privacyScan);
  const checksumInputs = { ...payload, "privacy-scan.json": privacyScanBytes };
  const checksumBytes = renderCrawlPhaseDiagnosticPublicationChecksums(
    checksumInputs,
    outcome.outcomeClass,
  );
  const assetBytes = { ...checksumInputs, "SHA256SUMS.txt": checksumBytes };
  const receipt = verifyCrawlPhaseDiagnosticPublication(
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

export function verifyCrawlPhaseDiagnosticPublication(
  { assetBytes } = {},
  { receiptChainValidator = validateCrawlPhaseDiagnosticPublicationReceiptChain } = {},
) {
  const { outcome, assets } = assertOutcomeBoundByteMap(
    assetBytes,
    true,
    "crawl phase diagnostic publication",
  );
  const payloadNames = publicationPayloadNamesForCrawlPhaseDiagnosticOutcome(
    outcome.outcomeClass,
  );
  const payload = Object.fromEntries(payloadNames.map((name) => [name, assets[name]]));
  const chain = assertReceiptChainIdentity(receiptChainValidator(payload, outcome), outcome);
  const expectedPrivacy = createCrawlPhaseDiagnosticPrivacyScan(payload, chain, outcome);
  const retainedPrivacy = parseCanonicalJsonBytes(
    assets["privacy-scan.json"],
    "crawl phase diagnostic privacy scan",
  );
  if (!isDeepStrictEqual(retainedPrivacy, expectedPrivacy)) {
    throw new TypeError("Diagnostic privacy-scan.json differs from the exact payload bytes");
  }
  const expectedChecksums = renderCrawlPhaseDiagnosticPublicationChecksums(
    { ...payload, "privacy-scan.json": assets["privacy-scan.json"] },
    outcome.outcomeClass,
  );
  if (!assets["SHA256SUMS.txt"].equals(expectedChecksums)) {
    throw new TypeError("Diagnostic SHA256SUMS.txt is not the canonical non-self manifest");
  }
  const names = publicationAssetNamesForCrawlPhaseDiagnosticOutcome(outcome.outcomeClass);
  return deepFreeze({
    schema: crawlPhaseDiagnosticPublicationSchema,
    status: "passed",
    diagnosticStatus: outcome.status,
    outcomeClass: outcome.outcomeClass,
    purpose: "non_authoritative_crawl_phase_diagnostic_evidence",
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    contractTargetSha: chain.contractTargetSha,
    comparisonEvidenceTargetSha: chain.comparisonEvidenceTargetSha,
    workflowSourceSha: chain.workflowSourceSha,
    workflowRunId: chain.workflowRunId,
    hostedCompletedAt: chain.hostedCompletedAt,
    receipts: chain.receipts,
    inventory: {
      payloadAssetCount: payloadNames.length,
      finalAssetCount: names.length,
      privacyScannedAssetCount: expectedPrivacy.scope.payloadAssetCount,
      semanticPrivacyVerifiedAssetCount:
        expectedPrivacy.scope.semanticPrivacyVerifiedAssetCount,
      archiveAssetCount: expectedPrivacy.scope.archiveAssetCount,
      archiveEntryCount: expectedPrivacy.scope.archiveEntryCount,
      checksumEntryCount: names.length - 1,
    },
    assets: names.map((name) => ({ name, ...fileIdentity(assets[name]) })),
    generated: {
      privacyScan: fileIdentity(assets["privacy-scan.json"]),
      checksums: fileIdentity(assets["SHA256SUMS.txt"]),
    },
    verification: {
      exactOutcomeSpecificAssetInventory: true,
      outcomeClassAndInventoryCrossBound: true,
      comparisonEvidenceAssetsByteIdentical: true,
      diagnosticActionsArtifactsCrossBound: true,
      allPayloadsPrivacyScanned: true,
      allArchiveEntriesDecompressedAndScanned: true,
      canonicalNonSelfChecksums: true,
      authorityGranted: false,
      timingAuthorityGranted: false,
      statisticsAuthorityGranted: false,
      comparisonAuthorityGranted: false,
      optimizationAuthorityGranted: false,
      urlsRetained: false,
      rawPayloadsRetained: false,
    },
  });
}

export function validateCrawlPhaseDiagnosticPublicationReceiptChain(
  payload,
  outcome,
  {
    assertHostedReceipt = assertCrawlPhaseDiagnosticHostedProvenanceReceipt,
    bindArtifacts = bindCrawlPhaseDiagnosticArtifacts,
    assertArtifactBindingReceipt = assertCrawlPhaseDiagnosticArtifactBindingReceipt,
  } = {},
) {
  const expectedPayloadNames = publicationPayloadNamesForCrawlPhaseDiagnosticOutcome(
    outcome?.outcomeClass,
  );
  assertExactByteMap(
    payload,
    expectedPayloadNames,
    "crawl phase diagnostic publication payload",
  );
  assertCrawlPhaseDiagnosticOutcome(outcome);
  if (typeof assertHostedReceipt !== "function" || typeof bindArtifacts !== "function") {
    throw new TypeError("Diagnostic publication provenance dependencies are unavailable");
  }

  const comparisonRawBytes = payload["comparison-fresh-crawl-raw.json"];
  const comparisonBindingBytes = payload["comparison-artifact-binding.json"];
  assertKnownComparisonAssetBytes(
    "comparison-fresh-crawl-raw.json",
    comparisonRawBytes,
  );
  assertKnownComparisonAssetBytes(
    "comparison-artifact-binding.json",
    comparisonBindingBytes,
  );
  const comparisonRaw = parseCanonicalJsonBytes(
    comparisonRawBytes,
    "comparison fresh crawl raw",
  );
  const comparisonBinding = parseCanonicalJsonBytes(
    comparisonBindingBytes,
    "comparison artifact binding",
  );
  const comparisonRelease = parseCanonicalJsonBytes(
    payload["comparison-evidence-release.json"],
    "comparison evidence release",
  );
  const comparisonCommit = parseCanonicalJsonBytes(
    payload["comparison-evidence-release-commit.json"],
    "comparison evidence release commit",
  );
  assertComparisonEvidenceRelease(comparisonRelease);
  assertCommitRecord(
    comparisonCommit,
    crawlPhaseDiagnosticComparisonEvidenceIdentity.repository,
    crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    "efd08ca4a0768951d49107cc7ff3c17af06047a1",
    "comparison evidence release commit",
  );

  const contractCommit = parseCanonicalJsonBytes(
    payload["contract-commit.json"],
    "diagnostic contract commit",
  );
  const contractTargetSha = assertCommitRecord(
    contractCommit,
    crawlPhaseDiagnosticContractIdentity.repository,
    undefined,
    crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    "diagnostic contract commit",
  );
  const contractRelease = parseCanonicalJsonBytes(
    payload["contract-release.json"],
    "diagnostic contract release",
  );
  const contractPublishedAt = assertDiagnosticContractRelease(
    contractRelease,
    contractTargetSha,
  );
  const comparisonPublishedAt = canonicalInstant(
    comparisonRelease.published_at,
    "comparison evidence release published_at",
  );
  if (contractPublishedAt <= comparisonPublishedAt) {
    throw new TypeError("Diagnostic contract release does not postdate comparison evidence");
  }

  const workflowSourceCommit = parseCanonicalJsonBytes(
    payload["workflow-source-commit.json"],
    "diagnostic workflow source commit",
  );
  const workflowSourceSha = assertCommitRecord(
    workflowSourceCommit,
    "oxhq/stasis",
    undefined,
    "6c7a6013e00584c8cb8d54c80cee5dbbcf3ca1b9",
    "diagnostic workflow source commit",
  );
  const runRecord = parseCanonicalJsonBytes(payload["workflow-run.json"], "workflow run");
  const workflowRunsListing = parseCanonicalJsonBytes(
    payload["workflow-runs.json"],
    "workflow runs listing",
  );
  const jobsListing = parseCanonicalJsonBytes(payload["workflow-jobs.json"], "workflow jobs");
  const artifactsListing = parseCanonicalJsonBytes(
    payload["workflow-artifacts.json"],
    "workflow artifacts",
  );
  const run = assertTerminalDiagnosticRun(
    runRecord,
    outcome,
    workflowSourceSha,
    contractPublishedAt,
  );

  const hostedReceipt = parseCanonicalJsonBytes(
    payload["hosted-provenance.json"],
    "diagnostic hosted provenance receipt",
  );
  if (assertHostedReceipt(hostedReceipt) !== hostedReceipt) {
    throw new TypeError("Diagnostic hosted provenance validator did not return its receipt");
  }
  assertCrawlPhaseDiagnosticRetainedApiBinding({
    receipt: hostedReceipt,
    runRecord,
    workflowRunsListing,
    jobsListing,
    artifactsListing,
    workflowSourceCommitRecord: workflowSourceCommit,
    diagnosticContractReleaseRecord: contractRelease,
    diagnosticContractCommitRecord: contractCommit,
    comparisonEvidenceReleaseRecord: comparisonRelease,
    comparisonEvidenceCommitRecord: comparisonCommit,
  });

  let semanticReceipt = null;
  let diagnosticBundle = null;
  const artifactZipBytes = {};
  if (outcome.outcomeClass !== "INFRASTRUCTURE_INVALID_NO_ARTIFACT") {
    diagnosticBundle = parseArchive(
      payload["actions-diagnostic-bundle.zip"],
      "actions-diagnostic-bundle.zip",
    );
    assertArchiveInventory(
      diagnosticBundle,
      crawlPhaseDiagnosticBundleArchiveNamesByOutcome[outcome.outcomeClass],
      "diagnostic bundle Actions artifact",
    );
    if (!diagnosticBundle.get("diagnostic-outcome.json").equals(payload["diagnostic-outcome.json"])) {
      throw new TypeError("Released diagnostic outcome differs from the Actions bundle ZIP");
    }
    artifactZipBytes[crawlPhaseDiagnosticExpectedArtifactNames[0]] =
      payload["actions-diagnostic-bundle.zip"];
  }

  if (outcome.outcomeClass === "VALID_NON_AUTHORITATIVE") {
    const comparisonInput = parseCanonicalJsonBytes(
      payload["comparison-input-verification.json"],
      "comparison input verification",
    );
    assertComparisonInputVerification(comparisonInput);
    const crawlee = parseCanonicalJsonBytes(
      payload["crawl-phase-crawlee-raw.json"],
      "Crawlee phase diagnostic raw",
    );
    const stasis = parseCanonicalJsonBytes(
      payload["crawl-phase-stasis-raw.json"],
      "Stasis phase diagnostic raw",
    );
    const evidence = parseCanonicalJsonBytes(
      payload["crawl-phase-localization-evidence.json"],
      "crawl phase localization evidence",
    );
    semanticReceipt = parseCanonicalJsonBytes(
      payload["diagnostic-verification.json"],
      "crawl phase diagnostic verification receipt",
    );
    assertCrawlPhaseDiagnosticVerificationReceipt(semanticReceipt);
    const replayed = verifyCrawlPhaseDiagnosticArtifactSet({
      crawleeDiagnostic: crawlee,
      crawleeDiagnosticBytes: payload["crawl-phase-crawlee-raw.json"],
      stasisDiagnostic: stasis,
      stasisDiagnosticBytes: payload["crawl-phase-stasis-raw.json"],
      composedEvidence: evidence,
      composedEvidenceBytes: payload["crawl-phase-localization-evidence.json"],
      authoritativeRaw: comparisonRaw,
      authoritativeRawBytes: comparisonRawBytes,
      authoritativeRawSha256: comparisonAssets["comparison-fresh-crawl-raw.json"].sha256,
      artifactBindingReceipt: comparisonBinding,
      artifactBindingReceiptBytes: comparisonBindingBytes,
      fileBoundary: semanticReceipt.fileBoundary,
    });
    if (!isDeepStrictEqual(replayed, semanticReceipt)) {
      throw new TypeError("Diagnostic semantic receipt does not replay from released bytes");
    }
    for (const name of crawlPhaseDiagnosticEvidenceArchiveNames) {
      if (!diagnosticBundle.get(name).equals(payload[name])) {
        throw new TypeError(`Released diagnostic copy differs from Actions bundle ZIP: ${name}`);
      }
    }
  }

  const expectedBinding = bindArtifacts({
    semanticReceipt,
    hostedReceipt,
    artifactZipBytes,
    derivedOutcome: outcome.outcomeClass === "INFRASTRUCTURE_INVALID_NO_ARTIFACT"
      ? outcome
      : undefined,
  });
  if (assertArtifactBindingReceipt !== undefined) {
    if (typeof assertArtifactBindingReceipt !== "function" ||
      assertArtifactBindingReceipt(expectedBinding) !== expectedBinding) {
      throw new TypeError("Diagnostic artifact-binding validator rejected recomputed receipt");
    }
  }
  if (outcome.outcomeClass !== "INFRASTRUCTURE_INVALID_NO_ARTIFACT") {
    const retainedBinding = parseCanonicalJsonBytes(
      payload["diagnostic-artifact-binding.json"],
      "diagnostic artifact binding receipt",
    );
    if (!isDeepStrictEqual(retainedBinding, expectedBinding)) {
      throw new TypeError("Diagnostic artifact binding does not replay from the exact Actions bundle");
    }
  } else if (Object.hasOwn(payload, "diagnostic-artifact-binding.json")) {
    throw new TypeError("Infrastructure-invalid publication must not retain an artifact binding");
  }

  return deepFreeze({
    outcomeClass: outcome.outcomeClass,
    contractTargetSha,
    comparisonEvidenceTargetSha: crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    workflowSourceSha,
    workflowRunId: run.workflowRunId,
    hostedCreatedAt: run.createdAt,
    hostedStartedAt: run.startedAt,
    hostedCompletedAt: run.completedAt,
    receipts: {
      semantic: semanticReceipt?.schema ?? null,
      hosted: hostedReceipt.schema,
      artifactBinding: outcome.outcomeClass === "INFRASTRUCTURE_INVALID_NO_ARTIFACT"
        ? null
        : expectedBinding.schema,
    },
  });
}

export function createCrawlPhaseDiagnosticPrivacyScan(payload, chainIdentity, outcome) {
  assertCrawlPhaseDiagnosticOutcome(outcome);
  const names = publicationPayloadNamesForCrawlPhaseDiagnosticOutcome(outcome.outcomeClass);
  assertExactByteMap(payload, names, "crawl phase diagnostic privacy payload");
  const chain = assertReceiptChainIdentity(chainIdentity, outcome);
  const assets = names.map((name) => scanAsset(name, payload[name]));
  const archiveEntryCount = assets.reduce(
    (total, asset) => total + asset.archiveEntries.length,
    0,
  );
  const semanticPrivacyVerifiedAssetCount = assets.filter(
    (asset) => asset.semanticPrivacyVerified,
  ).length;
  return deepFreeze({
    schema: crawlPhaseDiagnosticPrivacyScanSchema,
    status: "passed",
    outcomeClass: outcome.outcomeClass,
    contractRevision: chain.contractTargetSha,
    comparisonEvidenceRevision: chain.comparisonEvidenceTargetSha,
    workflowSourceRevision: chain.workflowSourceSha,
    workflowRunId: chain.workflowRunId,
    scope: {
      payloadAssetCount: assets.length,
      semanticPrivacyVerifiedAssetCount,
      archiveAssetCount: assets.filter((asset) => asset.format === "zip").length,
      archiveEntryCount,
      checksumAndSelfExcluded: true,
    },
    policy: {
      semanticVerifier: "src/post-support/artifact-privacy.mjs",
      archiveInspection: "every exact ZIP entry path and decompressed UTF-8 byte sequence",
      nestedArchives: "rejected",
      archivePathCaseCollisions: "rejected",
      archiveSymlinks: "rejected",
      encodedInspection: "one canonical Base64 or Base64URL layer",
      credentialRuleIds: credentialRules.map(([name]) => name),
      privateTaskPathRuleIds: privateTaskPathRules.map(([name]) => name),
      publicApiSourceTreatment:
        "direct signature and private-task-path scan without encoded source reinterpretation",
      matchDisclosure: "counts only; matching text is never emitted",
    },
    totals: {
      directCredentialSignatureMatches: 0,
      decodedCredentialSignatureMatches: 0,
      privateTaskPathMatches: 0,
    },
    assets,
  });
}

export function renderCrawlPhaseDiagnosticPublicationChecksums(value, outcomeClass) {
  const names = publicationAssetNamesForCrawlPhaseDiagnosticOutcome(outcomeClass).filter(
    (name) => name !== "SHA256SUMS.txt",
  );
  const assets = assertExactByteMap(
    value,
    names,
    "crawl phase diagnostic publication checksum inputs",
  );
  return Buffer.from(
    names.map((name) => `${sha256(assets[name])}  ${name}\n`).join(""),
    "utf8",
  );
}

export async function buildCrawlPhaseDiagnosticPublicationDirectory(
  { payloadDirectory, outputDirectory } = {},
  options,
) {
  const payload = await readOutcomeBoundPublicationDirectory(
    payloadDirectory,
    false,
    "crawl phase diagnostic publication payload directory",
  );
  const output = await assertFreshPublicationOutputDirectoryPath(
    outputDirectory,
    payload.root,
  );
  const result = buildCrawlPhaseDiagnosticPublication(
    { payloadAssetBytes: payload.assets },
    options,
  );
  await writeFreshPublicationDirectory(
    output,
    {
      ...payload.assets,
      ...result.generatedAssets,
    },
    publicationAssetNamesForCrawlPhaseDiagnosticOutcome(payload.outcome.outcomeClass),
  );
  return result.receipt;
}

export async function verifyCrawlPhaseDiagnosticPublicationDirectory(
  { publicationDirectory } = {},
  options,
) {
  const publication = await readOutcomeBoundPublicationDirectory(
    publicationDirectory,
    true,
    "crawl phase diagnostic publication directory",
  );
  return verifyCrawlPhaseDiagnosticPublication(
    { assetBytes: publication.assets },
    options,
  );
}

export function verifyCrawlPhaseDiagnosticGitHubRelease(
  {
    releaseRecord,
    comparisonTagRefRecord,
    contractTagRefRecord,
    releaseTagRefRecord,
    releaseTargetCommitRecord,
    expectedReleaseTargetSha,
    anonymousDownloadedAssetBytes,
  } = {},
  { receiptChainValidator = validateCrawlPhaseDiagnosticPublicationReceiptChain } = {},
) {
  if (!gitShaPattern.test(expectedReleaseTargetSha ?? "")) {
    throw new TypeError("Expected diagnostic evidence release target must be one Git SHA");
  }
  const publication = verifyCrawlPhaseDiagnosticPublication(
    { assetBytes: anonymousDownloadedAssetBytes },
    { receiptChainValidator },
  );
  if (publication.contractTargetSha !== expectedReleaseTargetSha) {
    throw new TypeError("Diagnostic evidence target differs from the preregistered contract target");
  }
  assertCommitRecord(
    releaseTargetCommitRecord,
    crawlPhaseDiagnosticPublicationIdentity.repository,
    expectedReleaseTargetSha,
    crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    "diagnostic evidence target commit",
  );
  const comparisonTagBinding = assertLightweightTagRef(
    comparisonTagRefRecord,
    crawlPhaseDiagnosticComparisonEvidenceIdentity,
    crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    "comparison evidence tag",
  );
  const contractTagBinding = assertLightweightTagRef(
    contractTagRefRecord,
    crawlPhaseDiagnosticContractIdentity,
    expectedReleaseTargetSha,
    "diagnostic contract tag",
  );
  const evidenceTagBinding = assertLightweightTagRef(
    releaseTagRefRecord,
    crawlPhaseDiagnosticPublicationIdentity,
    expectedReleaseTargetSha,
    "diagnostic evidence tag",
  );
  const release = requireRecord(releaseRecord, "diagnostic evidence release record");
  const identity = crawlPhaseDiagnosticPublicationIdentity;
  const releaseId = positiveSafeInteger(release.id, "diagnostic evidence release ID");
  for (const [actual, expected, label] of [
    [release.tag_name, identity.tag, "tag"],
    [release.target_commitish, expectedReleaseTargetSha, "target"],
    [release.immutable, true, "immutable state"],
    [release.draft, false, "draft state"],
    [release.prerelease, false, "prerelease state"],
  ]) {
    if (actual !== expected) {
      throw new TypeError(`Diagnostic evidence release ${label} mismatch`);
    }
  }
  const publishedAt = canonicalInstant(
    release.published_at,
    "diagnostic evidence release published_at",
  );
  if (publishedAt <= canonicalInstant(
    publication.hostedCompletedAt,
    "diagnostic hosted completion",
  )) {
    throw new TypeError("Diagnostic evidence release does not postdate its terminal hosted run");
  }
  assertReleaseUrls(release, identity, releaseId, "diagnostic evidence release");
  assertReleaseAssets(
    release.assets,
    releaseId,
    anonymousDownloadedAssetBytes,
    publication.outcomeClass,
  );
  return deepFreeze({
    schema: crawlPhaseDiagnosticReleaseVerificationSchema,
    status: "passed",
    diagnosticStatus: publication.diagnosticStatus,
    outcomeClass: publication.outcomeClass,
    purpose: "non_authoritative_crawl_phase_diagnostic_evidence",
    repository: identity.repository,
    tag: identity.tag,
    releaseId,
    contractTargetSha: expectedReleaseTargetSha,
    evidenceTargetSha: expectedReleaseTargetSha,
    comparisonEvidenceTargetSha: crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    tagBindings: {
      comparison: comparisonTagBinding,
      contract: contractTagBinding,
      evidence: evidenceTagBinding,
    },
    workflowRunId: publication.workflowRunId,
    assetCount: publication.assets.length,
    assets: publication.assets,
    anonymousDownloadedBytesVerified: true,
    releaseImmutable: true,
    releaseDraft: false,
    releasePrerelease: false,
    contractAndEvidenceTagsShareExactTarget: true,
    targetDirectSuccessorOfComparisonEvidence: true,
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

function assertReceiptChainIdentity(value, outcome) {
  const chain = exactKeys(value, [
    "outcomeClass",
    "contractTargetSha",
    "comparisonEvidenceTargetSha",
    "workflowSourceSha",
    "workflowRunId",
    "hostedCreatedAt",
    "hostedStartedAt",
    "hostedCompletedAt",
    "receipts",
  ], "crawl phase diagnostic publication receipt-chain identity");
  if (
    chain.outcomeClass !== outcome.outcomeClass ||
    !gitShaPattern.test(chain.contractTargetSha ?? "") ||
    chain.comparisonEvidenceTargetSha !== crawlPhaseDiagnosticComparisonEvidenceTargetSha ||
    !gitShaPattern.test(chain.workflowSourceSha ?? "")
  ) {
    throw new TypeError("Diagnostic publication receipt-chain identity drifted");
  }
  positiveSafeInteger(chain.workflowRunId, "diagnostic publication workflow run ID");
  const created = canonicalInstant(chain.hostedCreatedAt, "diagnostic hosted creation time");
  const started = canonicalInstant(chain.hostedStartedAt, "diagnostic hosted start time");
  const completed = canonicalInstant(chain.hostedCompletedAt, "diagnostic hosted completion time");
  if (started < created || completed < started) {
    throw new TypeError("Diagnostic hosted receipt-chain chronology is invalid");
  }
  exactKeys(chain.receipts, ["semantic", "hosted", "artifactBinding"], "diagnostic receipt schemas");
  if (
    typeof chain.receipts.hosted !== "string" ||
    chain.receipts.hosted.length === 0 ||
    (outcome.outcomeClass === "VALID_NON_AUTHORITATIVE"
      ? typeof chain.receipts.semantic !== "string" ||
        chain.receipts.semantic.length === 0 ||
        typeof chain.receipts.artifactBinding !== "string" ||
        chain.receipts.artifactBinding.length === 0
      : outcome.outcomeClass === "DIAGNOSTIC_INVALID_WITH_STATUS"
        ? chain.receipts.semantic !== null ||
          typeof chain.receipts.artifactBinding !== "string" ||
          chain.receipts.artifactBinding.length === 0
        : chain.receipts.semantic !== null || chain.receipts.artifactBinding !== null)
  ) {
    throw new TypeError("Diagnostic publication receipt schemas do not match outcome class");
  }
  return chain;
}

function assertKnownComparisonAssetBytes(releasedName, bytes) {
  const expected = comparisonAssets[releasedName];
  if (
    expected === undefined ||
    bytes.byteLength !== expected.bytes ||
    sha256(bytes) !== expected.sha256
  ) {
    throw new TypeError(`Comparison evidence asset bytes changed: ${releasedName}`);
  }
}

function assertComparisonEvidenceRelease(value) {
  const release = requireRecord(value, "comparison evidence release");
  const identity = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  if (
    release.id !== identity.releaseId ||
    release.tag_name !== identity.tag ||
    release.target_commitish !== identity.targetCommitSha ||
    release.created_at !== "2026-09-04T11:36:56Z" ||
    release.published_at !== "2026-09-04T11:37:42Z" ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  ) {
    throw new TypeError("Comparison evidence release identity or immutable state changed");
  }
  canonicalInstant(release.published_at, "comparison evidence release published_at");
  assertReleaseUrls(release, identity, identity.releaseId, "comparison evidence release");
  if (!Array.isArray(release.assets) || release.assets.length !== 28) {
    throw new TypeError("Comparison evidence release no longer has exactly 28 assets");
  }
  const observedNames = release.assets.map((asset) => asset?.name).sort(compareUtf8);
  if (!isDeepStrictEqual(observedNames, performanceReplicationPublicationAssetNames)) {
    throw new TypeError("Comparison evidence release 28-name inventory changed");
  }
  const selected = new Map();
  for (const raw of release.assets) {
    const asset = requireRecord(raw, "comparison evidence release asset");
    for (const expected of Object.values(comparisonAssets)) {
      if (asset.name !== expected.sourceName) continue;
      if (selected.has(asset.name)) {
        throw new TypeError("Comparison evidence release selected asset is duplicated");
      }
      if (
        asset.id !== expected.assetId ||
        asset.state !== "uploaded" ||
        asset.size !== expected.bytes ||
        asset.digest !== `sha256:${expected.sha256}`
      ) {
        throw new TypeError(`Comparison evidence release metadata changed: ${asset.name}`);
      }
      const api = `https://api.github.com/repos/${identity.repository}`;
      const web = `https://github.com/${identity.repository}`;
      exactUrl(
        asset.url,
        `${api}/releases/assets/${expected.assetId}`,
        `comparison asset API URL: ${asset.name}`,
      );
      exactUrl(
        asset.browser_download_url,
        `${web}/releases/download/${identity.tag}/${asset.name}`,
        `comparison asset download URL: ${asset.name}`,
      );
      selected.set(asset.name, asset);
    }
  }
  if (selected.size !== Object.keys(comparisonAssets).length) {
    throw new TypeError("Comparison evidence release selected assets are missing");
  }
}

function assertComparisonInputVerification(value) {
  const receipt = exactKeys(value, [
    "schema",
    "status",
    "mode",
    "retries",
    "credentialsUsed",
    "comparisonEvidenceRelease",
    "inputs",
    "verification",
  ], "comparison input verification");
  if (
    receipt.schema !==
      "stasis-v0.3.3-performance-crawl-phase-comparison-input-verification-v1" ||
    receipt.status !== "passed" ||
    receipt.mode !== "anonymous_https" ||
    receipt.retries !== false ||
    receipt.credentialsUsed !== false
  ) {
    throw new TypeError("Comparison input verification policy changed");
  }
  const release = exactKeys(receipt.comparisonEvidenceRelease, [
    "repository",
    "releaseId",
    "tag",
    "targetCommitish",
    "apiUrl",
    "webUrl",
    "createdAt",
    "publishedAt",
    "immutable",
    "draft",
    "prerelease",
    "assetNames",
    "tagReference",
  ], "comparison input verification release");
  const identity = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  if (
    release.repository !== identity.repository ||
    release.releaseId !== identity.releaseId ||
    release.tag !== identity.tag ||
    release.targetCommitish !== identity.targetCommitSha ||
    release.apiUrl !==
      `https://api.github.com/repos/${identity.repository}/releases/${identity.releaseId}` ||
    release.webUrl !==
      `https://github.com/${identity.repository}/releases/tag/${identity.tag}` ||
    release.createdAt !== "2026-09-04T11:36:56Z" ||
    release.publishedAt !== "2026-09-04T11:37:42Z" ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false ||
    !isDeepStrictEqual(release.assetNames, performanceReplicationPublicationAssetNames)
  ) {
    throw new TypeError("Comparison input verification release identity changed");
  }
  const tagReference = exactKeys(release.tagReference, [
    "ref",
    "apiUrl",
    "objectType",
    "objectSha",
    "objectUrl",
  ], "comparison input verification tag reference");
  if (
    tagReference.ref !== `refs/tags/${identity.tag}` ||
    tagReference.apiUrl !==
      `https://api.github.com/repos/${identity.repository}/git/refs/tags/${identity.tag}` ||
    tagReference.objectType !== "commit" ||
    tagReference.objectSha !== identity.targetCommitSha ||
    tagReference.objectUrl !==
      `https://api.github.com/repos/${identity.repository}/git/commits/${identity.targetCommitSha}`
  ) {
    throw new TypeError("Comparison input verification lightweight tag changed");
  }
  exactKeys(receipt.inputs, ["freshCrawlRaw", "artifactBinding"], "comparison inputs");
  for (const [field, releasedName] of [
    ["freshCrawlRaw", "comparison-fresh-crawl-raw.json"],
    ["artifactBinding", "comparison-artifact-binding.json"],
  ]) {
    const input = exactKeys(receipt.inputs[field], [
      "assetId",
      "name",
      "bytes",
      "sha256",
      "browserDownloadUrl",
    ], `comparison input ${field}`);
    const expected = comparisonAssets[releasedName];
    if (
      input.assetId !== expected.assetId ||
      input.name !== expected.sourceName ||
      input.bytes !== expected.bytes ||
      input.sha256 !== expected.sha256 ||
      input.browserDownloadUrl !==
        `https://github.com/${identity.repository}/releases/download/${identity.tag}/${expected.sourceName}`
    ) {
      throw new TypeError(`Comparison input identity changed: ${field}`);
    }
  }
  const verification = exactKeys(receipt.verification, [
    "releaseMetadataExact",
    "releaseChronologyExact",
    "exactTwentyEightNameAssetInventory",
    "lightweightTagReferenceExact",
    "selectedAssetMetadataExact",
    "anonymousDownloads",
    "downloadedBytesExact",
    "downloadedSha256Exact",
    "canonicalJsonExact",
  ], "comparison input verification claims");
  if (Object.values(verification).some((claim) => claim !== true)) {
    throw new TypeError("Comparison input verification claim is not true");
  }
}

function assertDiagnosticContractRelease(value, targetSha) {
  const release = requireRecord(value, "diagnostic contract release");
  const identity = crawlPhaseDiagnosticContractIdentity;
  const releaseId = positiveSafeInteger(release.id, "diagnostic contract release ID");
  if (
    release.tag_name !== identity.tag ||
    release.target_commitish !== targetSha ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  ) {
    throw new TypeError("Diagnostic contract release identity or immutable state changed");
  }
  assertReleaseUrls(release, identity, releaseId, "diagnostic contract release");
  const expectedNames = [
    "stasis-v0.3.3-performance-crawl-phase-diagnostic-preflight.json",
    "stasis-v0.3.3-performance-crawl-phase-diagnostic-v1.md",
    "stasis-v0.3.3-performance-crawl-phase-diagnostic-workflow.yml",
  ];
  if (!Array.isArray(release.assets) || release.assets.length !== expectedNames.length) {
    throw new TypeError("Diagnostic contract release must have exactly three assets");
  }
  const names = new Set();
  const ids = new Set();
  for (const raw of release.assets) {
    const asset = requireRecord(raw, "diagnostic contract release asset");
    if (
      typeof asset.name !== "string" ||
      !expectedNames.includes(asset.name) ||
      names.has(asset.name) ||
      asset.state !== "uploaded" ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 1 ||
      typeof asset.digest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/u.test(asset.digest)
    ) {
      throw new TypeError("Diagnostic contract release asset metadata is invalid");
    }
    const id = positiveSafeInteger(asset.id, `diagnostic contract asset ID: ${asset.name}`);
    if (ids.has(id)) throw new TypeError("Diagnostic contract release asset ID is duplicated");
    ids.add(id);
    names.add(asset.name);
    const api = `https://api.github.com/repos/${identity.repository}`;
    const web = `https://github.com/${identity.repository}`;
    exactUrl(asset.url, `${api}/releases/assets/${id}`, `contract asset API URL: ${asset.name}`);
    exactUrl(
      asset.browser_download_url,
      `${web}/releases/download/${identity.tag}/${asset.name}`,
      `contract asset download URL: ${asset.name}`,
    );
  }
  if (names.size !== expectedNames.length) {
    throw new TypeError("Diagnostic contract release asset inventory is incomplete");
  }
  return canonicalInstant(release.published_at, "diagnostic contract release published_at");
}

function assertTerminalDiagnosticRun(value, outcome, workflowSourceSha, contractPublishedAt) {
  const run = requireRecord(value, "diagnostic workflow run record");
  if (
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    run.name !== "Stasis v0.3.3 performance crawl phase diagnostic" ||
    run.path !== ".github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic.yml" ||
    run.head_sha !== workflowSourceSha ||
    run.run_attempt !== 1 ||
    run.status !== "completed" ||
    (run.conclusion !== "success" && !terminalNonSuccessConclusions.has(run.conclusion))
  ) {
    throw new TypeError("Diagnostic workflow run identity or terminal state changed");
  }
  if (
    (outcome.outcomeClass === "VALID_NON_AUTHORITATIVE") !==
      (run.conclusion === "success")
  ) {
    throw new TypeError("Diagnostic workflow conclusion differs from outcome class");
  }
  const createdAt = canonicalInstant(run.created_at, "diagnostic run created_at");
  const startedAt = canonicalInstant(run.run_started_at, "diagnostic run run_started_at");
  const completedAt = canonicalInstant(run.updated_at, "diagnostic run updated_at");
  if (createdAt <= contractPublishedAt || startedAt < createdAt || completedAt < startedAt) {
    throw new TypeError("Diagnostic workflow chronology is invalid");
  }
  return {
    workflowRunId: run.id,
    createdAt: run.created_at,
    startedAt: run.run_started_at,
    completedAt: run.updated_at,
  };
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
      if (entryPath.endsWith(".json")) {
        parseCanonicalJsonBytes(entryBytes, `${name}:${entryPath}`);
      }
      const scan = mergeScans(
        scanText(entryPath, true),
        scanText(entryText, true),
      );
      directCredentialSignatureMatches += scan.directCredentialSignatureMatches;
      decodedCredentialSignatureMatches += scan.decodedCredentialSignatureMatches;
      privateTaskPathMatches += scan.privateTaskPathMatches;
      archiveEntries.push({
        path: entryPath,
        bytes: entryBytes.byteLength,
        sha256: sha256(entryBytes),
        utf8Verified: true,
        canonicalJsonVerified: entryPath.endsWith(".json"),
        directCredentialSignatureMatches: scan.directCredentialSignatureMatches,
        decodedCredentialSignatureMatches: scan.decodedCredentialSignatureMatches,
        privateTaskPathMatches: scan.privateTaskPathMatches,
      });
    }
  } else {
    const text = decodeUtf8(bytes, name);
    let value = text.split(/\r?\n/u);
    if (name.endsWith(".json")) value = parseCanonicalJsonBytes(bytes, name);
    if (semanticPrivacyNames.has(name)) {
      assertPostSupportArtifactPrivacy(value);
      semanticPrivacyVerified = true;
    }
    const scan = scanText(text, !apiSnapshotNames.has(name));
    directCredentialSignatureMatches = scan.directCredentialSignatureMatches;
    decodedCredentialSignatureMatches = scan.decodedCredentialSignatureMatches;
    privateTaskPathMatches = scan.privateTaskPathMatches;
  }
  if (
    directCredentialSignatureMatches !== 0 ||
    decodedCredentialSignatureMatches !== 0 ||
    privateTaskPathMatches !== 0
  ) {
    throw new TypeError(`Diagnostic publication privacy scan rejected ${name}`);
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

function scanText(text, encoded) {
  let totals = {
    directCredentialSignatureMatches: 0,
    decodedCredentialSignatureMatches: 0,
    privateTaskPathMatches: 0,
  };
  for (const projection of privacyTextProjections(text)) {
    totals = mergeScans(totals, scanTextProjection(projection, encoded));
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
    if (seen.has(value)) return;
    if (projections.length >= 256) {
      throw new TypeError("Diagnostic privacy text projection bound exceeded");
    }
    seen.add(value);
    projections.push(value);
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
    throw new TypeError("Diagnostic encoded privacy candidate bound exceeded");
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
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.byteLength < 1 ||
    bytes.byteLength > crawlPhaseDiagnosticZipSafetyPolicy.maximumArchiveBytes
  ) {
    throw new TypeError(`Diagnostic publication ZIP byte size is invalid: ${label}`);
  }
  let archive;
  let entries;
  try {
    archive = new AdmZip(bytes);
    entries = archive.getEntries();
  } catch (error) {
    throw new TypeError(`Diagnostic publication ZIP is unreadable: ${label}`, { cause: error });
  }
  if (archive.getZipComment() !== "") {
    throw new TypeError(`Diagnostic publication ZIP has an opaque comment: ${label}`);
  }
  if (entries.length > maximumArchiveEntries) {
    throw new TypeError(`Diagnostic publication ZIP entry bound exceeded: ${label}`);
  }
  const contents = new Map();
  const foldedNames = new Set();
  let expandedBytes = 0;
  for (const entry of entries) {
    if (!Buffer.isBuffer(entry.rawEntryName)) {
      throw new TypeError(`Diagnostic publication ZIP raw name is absent: ${label}`);
    }
    const name = decodeUtf8(entry.rawEntryName, `${label}:entry-name`);
    if (
      !Buffer.from(name, "utf8").equals(entry.rawEntryName) ||
      entry.rawEntryName.byteLength > crawlPhaseDiagnosticZipSafetyPolicy.maximumEntryNameBytes
    ) {
      throw new TypeError(`Diagnostic publication ZIP name encoding is unsafe: ${label}`);
    }
    assertSafeArchivePath(name, label);
    const folded = name.toLowerCase();
    const unixMode = (Number(entry.attr) >>> 16) & 0xffff;
    const fileType = unixMode & 0o170000;
    const flags = Number(entry.header?.flags ?? 0);
    if (
      entry.isDirectory ||
      contents.has(name) ||
      foldedNames.has(folded) ||
      entry.comment !== "" ||
      entry.extra?.byteLength !== 0 ||
      entry.header?.encrypted === true ||
      (flags & 0x1) !== 0 ||
      !crawlPhaseDiagnosticZipSafetyPolicy.allowedCompressionMethods.includes(
        Number(entry.header?.method),
      ) ||
      (fileType !== 0 && fileType !== 0o100000)
    ) {
      throw new TypeError(`Diagnostic publication ZIP has unsafe metadata: ${label}`);
    }
    foldedNames.add(folded);
    const declared = Number(entry.header?.size);
    const compressed = Number(entry.header?.compressedSize);
    if (
      !Number.isSafeInteger(declared) ||
      declared < 1 ||
      declared > crawlPhaseDiagnosticZipSafetyPolicy.maximumEntryBytes ||
      !Number.isSafeInteger(compressed) ||
      compressed < 1 ||
      declared / compressed > crawlPhaseDiagnosticZipSafetyPolicy.maximumCompressionRatio
    ) {
      throw new TypeError(`Diagnostic publication ZIP entry size is invalid: ${label}:${name}`);
    }
    expandedBytes += declared;
    if (expandedBytes > crawlPhaseDiagnosticZipSafetyPolicy.maximumTotalUncompressedBytes) {
      throw new TypeError(`Diagnostic publication ZIP expanded bound exceeded: ${label}`);
    }
    let data;
    try {
      data = entry.getData();
    } catch (error) {
      throw new TypeError(`Diagnostic publication ZIP entry cannot be read: ${label}:${name}`, {
        cause: error,
      });
    }
    if (!Buffer.isBuffer(data) || data.byteLength !== declared) {
      throw new TypeError(`Diagnostic publication ZIP entry bytes differ from header: ${label}:${name}`);
    }
    const signature = data.byteLength >= 4 ? data.readUInt32LE(0) : null;
    if (
      /(?:^|\/)[^/]+\.(?:zip|tar|tgz|gz|bz2|xz|7z)$/iu.test(name) ||
      [0x04034b50, 0x06054b50, 0x08074b50, 0x02014b50].includes(signature)
    ) {
      throw new TypeError(`Diagnostic publication ZIP contains nested archive: ${label}:${name}`);
    }
    contents.set(name, Buffer.from(data));
  }
  return contents;
}

function assertArchiveInventory(contents, expectedNames, label) {
  assertExactNames([...contents.keys()], expectedNames, label);
}

function assertSafeArchivePath(value, label) {
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    value.normalize("NFC") !== value ||
    /^[A-Za-z]:/u.test(value) ||
    path.posix.normalize(value) !== value ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new TypeError(`Diagnostic publication ZIP contains unsafe path: ${label}`);
  }
}

async function readOutcomeBoundPublicationDirectory(value, finalInventory, label) {
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
  const outcomeEntry = entries.find((entry) => entry.name === "diagnostic-outcome.json");
  if (outcomeEntry === undefined) {
    throw new TypeError(`${label} is missing diagnostic-outcome.json`);
  }
  const outcomeBytes = await readOneRegularFile(
    path.join(root, "diagnostic-outcome.json"),
    "diagnostic-outcome.json",
  );
  const outcome = assertCrawlPhaseDiagnosticOutcome(
    parseCanonicalJsonBytes(outcomeBytes, "diagnostic outcome"),
  );
  const names = finalInventory
    ? publicationAssetNamesForCrawlPhaseDiagnosticOutcome(outcome.outcomeClass)
    : publicationPayloadNamesForCrawlPhaseDiagnosticOutcome(outcome.outcomeClass);
  assertExactNames(entries.map((entry) => entry.name), names, label);
  const assets = Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    name === "diagnostic-outcome.json"
      ? outcomeBytes
      : await readOneRegularFile(path.join(root, name), name),
  ])));
  return { root, outcome, assets };
}

async function readOneRegularFile(filePath, name) {
  const handle = await open(filePath, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size < 1) {
      throw new TypeError(`Diagnostic publication asset is not non-empty: ${name}`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function assertFreshPublicationOutputDirectoryPath(value, payloadRoot) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError("Diagnostic publication output must be one explicit absolute path");
  }
  const output = path.resolve(value);
  if (
    samePath(output, payloadRoot) ||
    isWithinPath(output, payloadRoot) ||
    isWithinPath(payloadRoot, output)
  ) {
    throw new TypeError("Diagnostic publication input and output must be distinct and unnested");
  }
  const parent = path.dirname(output);
  const metadata = await lstat(parent);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(parent), parent)) {
    throw new TypeError("Diagnostic publication output parent must be one real directory");
  }
  try {
    await lstat(output);
  } catch (error) {
    if (error?.code === "ENOENT") return output;
    throw error;
  }
  throw new TypeError("Diagnostic publication output directory already exists");
}

async function writeFreshPublicationDirectory(output, assetBytes, names) {
  let created = false;
  try {
    await mkdir(output, { recursive: false, mode: 0o700 });
    created = true;
    const metadata = await lstat(output);
    if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(output), output)) {
      throw new TypeError("Diagnostic publication output is not one real directory");
    }
    for (const name of names) {
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
        throw new TypeError(`Diagnostic publication output readback mismatch: ${name}`);
      }
    }
  } catch (error) {
    if (created) await rm(output, { recursive: true, force: true });
    throw error;
  }
}

function assertOutcomeBoundByteMap(value, finalInventory, label) {
  const assets = requireRecord(value, label);
  if (!Buffer.isBuffer(assets["diagnostic-outcome.json"])) {
    throw new TypeError(`${label} must include diagnostic-outcome.json bytes`);
  }
  const outcome = assertCrawlPhaseDiagnosticOutcome(parseCanonicalJsonBytes(
    assets["diagnostic-outcome.json"],
    "diagnostic outcome",
  ));
  const names = finalInventory
    ? publicationAssetNamesForCrawlPhaseDiagnosticOutcome(outcome.outcomeClass)
    : publicationPayloadNamesForCrawlPhaseDiagnosticOutcome(outcome.outcomeClass);
  return { outcome, assets: assertExactByteMap(assets, names, label) };
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

function assertCommitRecord(value, repository, expectedSha, expectedParentSha, label) {
  const commit = requireRecord(value, label);
  const sha = expectedSha ?? commit.sha;
  if (!gitShaPattern.test(sha ?? "") || commit.sha !== sha) {
    throw new TypeError(`${label} SHA is invalid`);
  }
  const api = `https://api.github.com/repos/${repository}`;
  const web = `https://github.com/${repository}`;
  exactUrl(commit.url, `${api}/commits/${sha}`, `${label} API URL`);
  exactUrl(commit.html_url, `${web}/commit/${sha}`, `${label} web URL`);
  const payload = requireRecord(commit.commit, `${label} payload`);
  const tree = requireRecord(payload.tree, `${label} tree`);
  if (!gitShaPattern.test(tree.sha ?? "")) throw new TypeError(`${label} tree SHA is invalid`);
  exactUrl(tree.url, `${api}/git/trees/${tree.sha}`, `${label} tree URL`);
  if (!Array.isArray(commit.parents) || commit.parents.length !== 1) {
    throw new TypeError(`${label} must have exactly one parent`);
  }
  const parent = requireRecord(commit.parents[0], `${label} parent`);
  if (parent.sha !== expectedParentSha) throw new TypeError(`${label} parent SHA changed`);
  exactUrl(parent.url, `${api}/commits/${expectedParentSha}`, `${label} parent API URL`);
  exactUrl(parent.html_url, `${web}/commit/${expectedParentSha}`, `${label} parent web URL`);
  return sha;
}

function assertLightweightTagRef(value, identity, targetSha, label) {
  const tag = requireRecord(value, `${label} ref record`);
  const expectedRef = `refs/tags/${identity.tag}`;
  if (tag.ref !== expectedRef) throw new TypeError(`${label} ref mismatch`);
  const api = `https://api.github.com/repos/${identity.repository}`;
  exactUrl(tag.url, `${api}/git/refs/tags/${encodeURIComponent(identity.tag)}`, `${label} API URL`);
  const object = requireRecord(tag.object, `${label} object`);
  if (object.type !== "commit" || object.sha !== targetSha) {
    throw new TypeError(`${label} is not the exact lightweight commit ref`);
  }
  exactUrl(object.url, `${api}/git/commits/${targetSha}`, `${label} object API URL`);
  return deepFreeze({
    ref: expectedRef,
    objectType: "commit",
    objectSha: targetSha,
    lightweight: true,
  });
}

function assertReleaseUrls(release, identity, releaseId, label) {
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  exactUrl(release.url, `${api}/releases/${releaseId}`, `${label} API URL`);
  exactUrl(release.assets_url, `${api}/releases/${releaseId}/assets`, `${label} assets URL`);
  exactUrl(
    release.upload_url,
    `https://uploads.github.com/repos/${identity.repository}/releases/${releaseId}/assets{?name,label}`,
    `${label} upload URL`,
  );
  exactUrl(release.html_url, `${web}/releases/tag/${identity.tag}`, `${label} web URL`);
}

function assertReleaseAssets(value, releaseId, downloaded, outcomeClass) {
  const names = publicationAssetNamesForCrawlPhaseDiagnosticOutcome(outcomeClass);
  if (!Array.isArray(value) || value.length !== names.length) {
    throw new TypeError("Diagnostic evidence release asset count changed");
  }
  const retainedNames = new Set();
  const ids = new Set();
  const identity = crawlPhaseDiagnosticPublicationIdentity;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  for (const raw of value) {
    const asset = requireRecord(raw, "diagnostic evidence release asset");
    if (!names.includes(asset.name) || retainedNames.has(asset.name)) {
      throw new TypeError("Diagnostic evidence release asset is unknown or duplicated");
    }
    retainedNames.add(asset.name);
    const id = positiveSafeInteger(asset.id, `diagnostic evidence asset ID: ${asset.name}`);
    if (ids.has(id)) throw new TypeError("Diagnostic evidence release asset ID is duplicated");
    ids.add(id);
    const bytes = downloaded[asset.name];
    if (
      asset.state !== "uploaded" ||
      asset.size !== bytes.byteLength ||
      asset.digest !== `sha256:${sha256(bytes)}`
    ) {
      throw new TypeError(`Diagnostic evidence release asset bytes mismatch: ${asset.name}`);
    }
    exactUrl(asset.url, `${api}/releases/assets/${id}`, `evidence asset API URL: ${asset.name}`);
    exactUrl(
      asset.browser_download_url,
      `${web}/releases/download/${identity.tag}/${asset.name}`,
      `evidence asset download URL: ${asset.name}`,
    );
  }
  if (retainedNames.size !== names.length || !Number.isSafeInteger(releaseId)) {
    throw new TypeError("Diagnostic evidence release asset inventory is incomplete");
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
  if (actual !== expected) throw new TypeError(`${label} repository binding mismatch`);
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
  if (!hasExactKeys(record, expected)) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  return record;
}

function hasExactKeys(value, expected) {
  const actual = Reflect.ownKeys(value);
  return actual.every((key) => typeof key === "string") &&
    isDeepStrictEqual(actual.sort(compareUtf8), [...expected].sort(compareUtf8));
}

function requireRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be one plain object`);
  return value;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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
