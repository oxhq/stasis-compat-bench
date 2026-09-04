import { createHash } from "node:crypto";
import { isDeepStrictEqual, TextDecoder } from "node:util";

import AdmZip from "adm-zip";

import { jsonReplacer } from "../shared/io.mjs";
import {
  crawlPhaseDiagnosticEvidenceSchema,
} from "./crawl-phase-diagnostic.mjs";
import {
  assertCrawlPhaseDiagnosticVerificationReceipt,
  crawlPhaseDiagnosticVerificationSchema,
} from "./crawl-phase-diagnostic-verification.mjs";
import {
  assertCrawlPhaseDiagnosticHostedProvenanceReceipt,
  crawlPhaseDiagnosticArtifactEntries,
  crawlPhaseDiagnosticComparisonEvidenceIdentity,
  crawlPhaseDiagnosticExpectedArtifactNames,
  crawlPhaseDiagnosticHostedIdentity,
  crawlPhaseDiagnosticHostedProvenanceSchema,
  crawlPhaseDiagnosticJobStepIdentity,
} from "./crawl-phase-diagnostic-hosted-provenance-v4.mjs";
import {
  performanceReplicationArtifactBindingSchema,
} from "./replication-artifact-binding.mjs";
import {
  performanceReplicationPublicationAssetNames,
} from "./replication-publication.mjs";

export const crawlPhaseDiagnosticArtifactBindingSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-artifact-binding-v4";
export const crawlPhaseDiagnosticOutcomeSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-outcome-v2";
export const crawlPhaseDiagnosticComparisonInputVerificationSchema =
  "stasis-v0.3.3-performance-crawl-phase-comparison-input-verification-v2";

export const crawlPhaseDiagnosticZipSafetyPolicy = deepFreeze({
  maximumArchiveBytes: 64 * 1024 * 1024,
  maximumEntryBytes: 32 * 1024 * 1024,
  maximumTotalUncompressedBytes: 64 * 1024 * 1024,
  maximumCompressionRatio: 1_000,
  maximumEntryNameBytes: 255,
  allowedCompressionMethods: [0, 8],
});

const sha256Pattern = /^[a-f0-9]{64}$/u;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const validFailureCodes = Object.freeze({
  input_verification: "INPUT_VERIFICATION_FAILED",
  diagnostic_execution: "DIAGNOSTIC_EXECUTION_FAILED",
  offline_verification: "OFFLINE_VERIFICATION_FAILED",
  hosted_infrastructure: "HOSTED_INFRASTRUCTURE_FAILED",
});

/**
 * Joins the terminal outcome, the hosted metadata receipt, and exact Actions
 * bundle ZIP bytes. Valid diagnostics additionally bind the offline semantic
 * receipt and all five evidence entries in that same bundle. Infrastructure failures have no Actions ZIP;
 * their safe publisher-derived outcome is validated but no public binding
 * artifact is thereby required.
 */
export function bindCrawlPhaseDiagnosticArtifacts({
  semanticReceipt = null,
  hostedReceipt,
  artifactZipBytes,
  derivedOutcome = null,
} = {}) {
  const hosted = assertCrawlPhaseDiagnosticHostedProvenanceReceipt(hostedReceipt);
  const archives = assertExactArchiveObject(artifactZipBytes, hosted);
  const archiveReceipts = bindArchiveMetadata(archives, hosted);

  let outcome;
  let statusIdentity = null;
  let evidenceIdentities = null;
  let semantic = null;
  let hostSeparation = null;
  let bundle = null;

  if (hosted.artifactMode === "no_artifact") {
    if (semanticReceipt !== null || derivedOutcome === null) {
      throw new TypeError(
        "Infrastructure-invalid diagnostics require only one publisher-derived outcome",
      );
    }
    outcome = assertCrawlPhaseDiagnosticOutcome(derivedOutcome, {
      expectedClass: "INFRASTRUCTURE_INVALID_NO_ARTIFACT",
    });
  } else {
    if (derivedOutcome !== null) {
      throw new TypeError("An Actions bundle artifact forbids a publisher-derived outcome");
    }
    bundle = parseExactZip(
      archives[crawlPhaseDiagnosticExpectedArtifactNames[0]],
      hosted.artifactMode === "bundle_valid"
        ? crawlPhaseDiagnosticArtifactEntries.valid
        : crawlPhaseDiagnosticArtifactEntries.status,
      crawlPhaseDiagnosticExpectedArtifactNames[0],
    );
    const outcomeBytes = bundle.get("diagnostic-outcome.json");
    outcome = assertCrawlPhaseDiagnosticOutcome(
      parseCanonicalJson(outcomeBytes, "diagnostic outcome"),
      { expectedClass: hosted.outcomeClass },
    );
    if (hosted.artifactMode === "bundle_status") {
      const expectedFailure = deriveHostedDiagnosticFailure(hosted.job.steps);
      if (
        outcome.phase !== expectedFailure.phase ||
        outcome.failure.code !== expectedFailure.code
      ) {
        throw new TypeError(
          "Diagnostic status outcome phase does not match the first failed hosted step",
        );
      }
    }
    statusIdentity = extractedIdentity(
      crawlPhaseDiagnosticExpectedArtifactNames[0],
      "diagnostic-outcome.json",
      outcomeBytes,
    );
  }

  if (outcome.evidenceArtifactEligible !== (hosted.artifactMode === "bundle_valid")) {
    throw new TypeError("Diagnostic outcome evidence eligibility differs from hosted artifacts");
  }

  if (hosted.artifactMode === "bundle_valid") {
    if (semanticReceipt === null) {
      throw new TypeError("Valid diagnostic evidence requires its semantic verification receipt");
    }
    semantic = assertCrawlPhaseDiagnosticVerificationReceipt(semanticReceipt);
    const evidence = bundle;
    const parsed = Object.fromEntries(crawlPhaseDiagnosticArtifactEntries.evidence.map(
      (name) => [name, parseCanonicalJson(evidence.get(name), `diagnostic evidence ${name}`)],
    ));
    if (!isDeepStrictEqual(parsed["diagnostic-verification.json"], semantic)) {
      throw new TypeError("Diagnostic verification ZIP bytes differ from the semantic receipt");
    }
    assertSemanticEvidenceFiles(semantic, evidence);
    const comparison = assertComparisonInputVerification(
      parsed["comparison-input-verification.json"],
      hosted,
      semantic,
    );
    hostSeparation = assertEvidenceHostedBinding(
      parsed["crawl-phase-localization-evidence.json"],
      parsed["crawl-phase-crawlee-raw.json"],
      parsed["crawl-phase-stasis-raw.json"],
      hosted,
      semantic,
      comparison,
    );
    evidenceIdentities = crawlPhaseDiagnosticArtifactEntries.evidence.map((name) =>
      extractedIdentity(crawlPhaseDiagnosticExpectedArtifactNames[0], name, evidence.get(name))
    );
  } else if (semanticReceipt !== null) {
    throw new TypeError("Invalid diagnostic outcomes must not borrow a semantic success receipt");
  }

  const semanticState = semantic === null ? "not_applicable" : "verified";
  const receipt = {
    schema: crawlPhaseDiagnosticArtifactBindingSchema,
    status: "passed",
    outcomeClass: hosted.outcomeClass,
    artifactMode: hosted.artifactMode,
    purpose: "phase_diagnostic_artifact_binding_only",
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    retryAuthorized: false,
    replacementRunAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    inputs: {
      hostedReceiptSchema: hosted.schema,
      semanticReceiptSchema: semantic?.schema ?? null,
      workflow: {
        repository: hosted.producer.repository,
        workflow: hosted.producer.workflowName,
        runId: hosted.producer.runId,
        runAttempt: hosted.producer.runAttempt,
        workflowSourceSha: hosted.producer.headSha,
        workflowSourceRef: hosted.workflowSource.ref,
        job: {
          key: hosted.job.key,
          name: hosted.job.name,
          hostedJobId: hosted.job.id,
        },
      },
      comparisonEvidence: {
        releaseId: hosted.comparisonEvidence.releaseId,
        tag: hosted.comparisonEvidence.tag,
        targetCommitSha: hosted.comparisonEvidence.targetCommitSha,
        artifactBinding: structuredClone(
          hosted.comparisonEvidence.selectedAssets.artifactBinding,
        ),
        freshCrawlRaw: structuredClone(
          hosted.comparisonEvidence.selectedAssets.freshCrawlRaw,
        ),
      },
    },
    artifactArchives: archiveReceipts,
    outcome: structuredClone(outcome),
    extractedFiles: hosted.artifactMode === "no_artifact" ? null : {
      statusOutcome: statusIdentity,
      evidence: evidenceIdentities,
    },
    hostSeparation,
    verification: {
      exactArchiveSet: true,
      allArchiveSizesAndDigestsMatchHostedReceipt: true,
      parsedInventoriesExactAndSafe: hosted.artifactMode === "no_artifact"
        ? "not_applicable" : "verified",
      outcomeSource: hosted.artifactMode === "no_artifact"
        ? "publisher_derived_terminal_api" : "actions_bundle_zip",
      outcomeMatchesHostedMode: true,
      evidenceEligibilityEnforced: true,
      semanticEvidence: semanticState,
      comparisonInputs: semanticState,
      distinctRunJobAndBootInstance: semanticState,
      canonicalJsonEntries: hosted.artifactMode === "no_artifact"
        ? "not_applicable" : "verified",
      retriesOrReplacementAuthorized: false,
      rawContentsRetained: false,
      urlsRetained: false,
    },
  };
  return assertCrawlPhaseDiagnosticArtifactBindingReceipt(deepFreeze(receipt));
}

function deriveHostedDiagnosticFailure(steps) {
  const byNumber = new Map(steps.map((step) => [step.number, step]));
  const failureIndex = crawlPhaseDiagnosticJobStepIdentity.preparation.findIndex(
    ({ number }) => byNumber.get(number)?.conclusion === "failure",
  );
  if (failureIndex < 0) {
    throw new TypeError("Diagnostic status bundle has no failed preparation step");
  }
  if (failureIndex <= 14) {
    return { phase: "input_verification", code: "INPUT_VERIFICATION_FAILED" };
  }
  if (failureIndex === 15) {
    return { phase: "diagnostic_execution", code: "DIAGNOSTIC_EXECUTION_FAILED" };
  }
  return { phase: "offline_verification", code: "OFFLINE_VERIFICATION_FAILED" };
}

export function assertCrawlPhaseDiagnosticOutcome(value, { expectedClass } = {}) {
  exactKeys(value, [
    "schema", "status", "outcomeClass", "phase", "runAttempt",
    "evidenceArtifactEligible", "authorityEligible", "timingEligible",
    "statisticsEligible", "comparisonEligible", "optimizationEligible",
    "generalizedSpeedClaimAuthorized", "implementationWorkAuthorized",
    "decisionState", "failure",
  ], "crawl phase diagnostic outcome");
  if (
    value.schema !== crawlPhaseDiagnosticOutcomeSchema || value.runAttempt !== 1 ||
    value.authorityEligible !== false || value.timingEligible !== false ||
    value.statisticsEligible !== false || value.comparisonEligible !== false ||
    value.optimizationEligible !== false || value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    (expectedClass !== undefined && value.outcomeClass !== expectedClass)
  ) throw new TypeError("Crawl phase diagnostic outcome changes its fail-closed boundary");

  if (value.outcomeClass === "VALID_NON_AUTHORITATIVE") {
    if (
      value.status !== "passed" || value.phase !== "complete" ||
      value.evidenceArtifactEligible !== true || value.failure !== null
    ) throw new TypeError("Valid diagnostic outcome shape is invalid");
  } else if (value.outcomeClass === "DIAGNOSTIC_INVALID_WITH_STATUS") {
    assertFailureOutcome(value, [
      "input_verification", "diagnostic_execution", "offline_verification",
    ]);
  } else if (value.outcomeClass === "INFRASTRUCTURE_INVALID_NO_ARTIFACT") {
    assertFailureOutcome(value, ["hosted_infrastructure"]);
  } else {
    throw new TypeError("Unknown crawl phase diagnostic outcome class");
  }
  return value;
}

export function assertCrawlPhaseDiagnosticArtifactBindingReceipt(value) {
  exactKeys(value, [
    "schema", "status", "outcomeClass", "artifactMode", "purpose",
    "authorityEligible", "timingEligible", "statisticsEligible", "comparisonEligible",
    "optimizationEligible", "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized", "retryAuthorized", "replacementRunAuthorized",
    "decisionState", "inputs", "artifactArchives", "outcome", "extractedFiles",
    "hostSeparation", "verification",
  ], "crawl phase diagnostic artifact-binding receipt");
  if (
    value.schema !== crawlPhaseDiagnosticArtifactBindingSchema || value.status !== "passed" ||
    value.purpose !== "phase_diagnostic_artifact_binding_only" ||
    value.authorityEligible !== false || value.timingEligible !== false ||
    value.statisticsEligible !== false || value.comparisonEligible !== false ||
    value.optimizationEligible !== false || value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false || value.retryAuthorized !== false ||
    value.replacementRunAuthorized !== false || value.decisionState !== "STAY_0_4_UNASSIGNED"
  ) throw new TypeError("Diagnostic artifact-binding receipt grants forbidden authority");
  assertCrawlPhaseDiagnosticOutcome(value.outcome, { expectedClass: value.outcomeClass });
  const expectedMode = {
    VALID_NON_AUTHORITATIVE: "bundle_valid",
    DIAGNOSTIC_INVALID_WITH_STATUS: "bundle_status",
    INFRASTRUCTURE_INVALID_NO_ARTIFACT: "no_artifact",
  }[value.outcomeClass];
  if (value.artifactMode !== expectedMode) {
    throw new TypeError("Diagnostic artifact-binding outcome mode changed");
  }
  assertBindingInputs(value.inputs);
  assertBindingArchives(value.artifactArchives, expectedMode);
  assertBindingExtractedFiles(value.extractedFiles, expectedMode);
  assertHostSeparation(value.hostSeparation, expectedMode);
  assertBindingVerification(value.verification, expectedMode);
  assertUrlFree(value);
  return deepFreeze(value);
}

function assertFailureOutcome(value, phases) {
  if (
    value.status !== "failed" || !phases.includes(value.phase) ||
    value.evidenceArtifactEligible !== false
  ) throw new TypeError("Invalid diagnostic outcome phase or eligibility changed");
  exactKeys(value.failure, ["code", "messageOmitted"], "diagnostic outcome failure");
  if (
    value.failure.code !== validFailureCodes[value.phase] ||
    value.failure.messageOmitted !== true
  ) throw new TypeError("Diagnostic outcome failure code is invalid");
}

function assertExactArchiveObject(value, hosted) {
  const expectedNames = hosted.artifacts.map(({ name }) => name);
  exactKeys(value, expectedNames, "diagnostic artifact ZIP byte object");
  for (const name of expectedNames) {
    if (!Buffer.isBuffer(value[name]) || value[name].byteLength < 1 ||
      value[name].byteLength > crawlPhaseDiagnosticZipSafetyPolicy.maximumArchiveBytes) {
      throw new TypeError(`Diagnostic artifact ZIP bytes are invalid or oversized: ${name}`);
    }
  }
  return value;
}

function bindArchiveMetadata(archives, hosted) {
  return hosted.artifacts.map((metadata) => {
    const bytes = archives[metadata.name];
    const sha256 = hash(bytes);
    if (bytes.byteLength !== metadata.sizeInBytes || `sha256:${sha256}` !== metadata.digest) {
      throw new TypeError(`Diagnostic artifact ZIP differs from hosted metadata: ${metadata.name}`);
    }
    return {
      name: metadata.name,
      artifactId: metadata.id,
      bytes: bytes.byteLength,
      sha256,
    };
  });
}

function parseExactZip(bytes, expectedNames, label) {
  let entries;
  try {
    entries = new AdmZip(bytes).getEntries();
  } catch (error) {
    throw new TypeError(`Diagnostic artifact is not a readable ZIP: ${label}`, { cause: error });
  }
  if (entries.length !== expectedNames.length) {
    throw new TypeError(`Diagnostic artifact ZIP inventory is not exact: ${label}`);
  }
  const contents = new Map();
  let totalUncompressed = 0;
  for (const entry of entries) {
    const name = rawEntryName(entry, label);
    assertSafeEntry(entry, name, label);
    if (contents.has(name)) {
      throw new TypeError(`Diagnostic artifact ZIP contains a duplicate entry: ${label}: ${name}`);
    }
    const size = entry.header?.size;
    const compressedSize = entry.header?.compressedSize;
    if (!Number.isSafeInteger(size) || size < 1 ||
      size > crawlPhaseDiagnosticZipSafetyPolicy.maximumEntryBytes ||
      !Number.isSafeInteger(compressedSize) || compressedSize < 1) {
      throw new TypeError(`Diagnostic artifact ZIP entry size is unsafe: ${label}: ${name}`);
    }
    totalUncompressed += size;
    if (totalUncompressed > crawlPhaseDiagnosticZipSafetyPolicy.maximumTotalUncompressedBytes ||
      size / compressedSize > crawlPhaseDiagnosticZipSafetyPolicy.maximumCompressionRatio) {
      throw new TypeError(`Diagnostic artifact ZIP expands beyond its safety policy: ${label}`);
    }
    let data;
    try {
      data = entry.getData();
    } catch (error) {
      throw new TypeError(`Diagnostic artifact ZIP entry cannot be read: ${label}: ${name}`, {
        cause: error,
      });
    }
    if (!Buffer.isBuffer(data) || data.byteLength !== size) {
      throw new TypeError(`Diagnostic artifact ZIP entry bytes are inconsistent: ${label}: ${name}`);
    }
    contents.set(name, Buffer.from(data));
  }
  const names = [...contents.keys()].sort(compareUtf8);
  if (!isDeepStrictEqual(names, [...expectedNames].sort(compareUtf8))) {
    throw new TypeError(`Diagnostic artifact ZIP inventory is not exact: ${label}`);
  }
  return contents;
}

function rawEntryName(entry, label) {
  if (!Buffer.isBuffer(entry.rawEntryName)) {
    throw new TypeError(`Diagnostic ZIP entry name is unavailable: ${label}`);
  }
  let name;
  try {
    name = utf8.decode(entry.rawEntryName);
  } catch (error) {
    throw new TypeError(`Diagnostic ZIP entry name is not UTF-8: ${label}`, { cause: error });
  }
  if (!Buffer.from(name, "utf8").equals(entry.rawEntryName) ||
    entry.rawEntryName.byteLength > crawlPhaseDiagnosticZipSafetyPolicy.maximumEntryNameBytes) {
    throw new TypeError(`Diagnostic ZIP entry name encoding is unsafe: ${label}`);
  }
  return name;
}

function assertSafeEntry(entry, name, label) {
  const segments = name.split("/");
  const method = entry.header?.method;
  const flags = entry.header?.flags ?? 0;
  const unixMode = (entry.attr >>> 16) & 0xffff;
  const fileType = unixMode & 0o170000;
  if (
    entry.isDirectory || name.length === 0 || name.includes("\\") || name.includes("\0") ||
    name.startsWith("/") || /^[A-Za-z]:/u.test(name) ||
    /[\u0000-\u001f\u007f]/u.test(name) || name.normalize("NFC") !== name ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    !crawlPhaseDiagnosticZipSafetyPolicy.allowedCompressionMethods.includes(method) ||
    (flags & 0x1) !== 0 || (fileType !== 0 && fileType !== 0o100000)
  ) throw new TypeError(`Diagnostic artifact ZIP contains an unsafe entry: ${label}: ${name}`);
}

function assertSemanticEvidenceFiles(semantic, evidence) {
  const boundaries = semantic.fileBoundary.inputs;
  const checks = [
    [boundaries.crawleeRaw, evidence.get("crawl-phase-crawlee-raw.json"), "Crawlee raw"],
    [boundaries.stasisRaw, evidence.get("crawl-phase-stasis-raw.json"), "Stasis raw"],
    [boundaries.composedEvidence, evidence.get("crawl-phase-localization-evidence.json"),
      "localization evidence"],
  ];
  for (const [identity, bytes, label] of checks) assertFileIdentity(identity, bytes, label);
}

function assertComparisonInputVerification(value, hosted, semantic) {
  exactKeys(value, [
    "schema", "status", "mode", "retries", "credentialsUsed",
    "comparisonEvidenceRelease", "inputs", "verification",
  ], "comparison input verification");
  if (
    value.schema !== crawlPhaseDiagnosticComparisonInputVerificationSchema ||
    value.status !== "passed" || value.mode !== "anonymous_https" ||
    value.retries !== false || value.credentialsUsed !== false
  ) throw new TypeError("Comparison input verification boundary changed");
  const release = value.comparisonEvidenceRelease;
  exactKeys(release, [
    "repository", "releaseId", "tag", "targetCommitish", "apiUrl", "webUrl",
    "createdAt", "publishedAt", "immutable", "draft", "prerelease", "assetNames",
    "tagReference",
  ], "comparison input release");
  const expected = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  if (
    release.repository !== expected.repository || release.releaseId !== expected.releaseId ||
    release.tag !== expected.tag || release.targetCommitish !== expected.targetCommitSha ||
    release.apiUrl !== `https://api.github.com/repos/${expected.repository}/releases/${expected.releaseId}` ||
    release.webUrl !== `https://github.com/${expected.repository}/releases/tag/${expected.tag}` ||
    release.createdAt !== "2026-09-04T11:36:56Z" ||
    release.publishedAt !== "2026-09-04T11:37:42Z" || release.immutable !== true ||
    release.draft !== false || release.prerelease !== false ||
    !isDeepStrictEqual(release.assetNames, performanceReplicationPublicationAssetNames)
  ) throw new TypeError("Comparison input release identity changed");
  exactKeys(release.tagReference, ["ref", "apiUrl", "objectType", "objectSha", "objectUrl"],
    "comparison input release tag reference");
  if (
    release.tagReference.ref !== `refs/tags/${expected.tag}` ||
    release.tagReference.apiUrl !==
      `https://api.github.com/repos/${expected.repository}/git/refs/tags/${expected.tag}` ||
    release.tagReference.objectType !== "commit" ||
    release.tagReference.objectSha !== expected.targetCommitSha ||
    release.tagReference.objectUrl !==
      `https://api.github.com/repos/${expected.repository}/git/commits/${expected.targetCommitSha}`
  ) throw new TypeError("Comparison input lightweight tag reference changed");
  exactKeys(value.inputs, ["freshCrawlRaw", "artifactBinding"], "comparison inputs");
  assertComparisonAssetInput(value.inputs.freshCrawlRaw, expected.assets.freshCrawlRaw,
    semantic.fileBoundary.inputs.freshAuthorityRaw, hosted);
  assertComparisonAssetInput(value.inputs.artifactBinding, expected.assets.artifactBinding,
    semantic.fileBoundary.inputs.artifactBindingReceipt, hosted);
  const verificationKeys = [
    "releaseMetadataExact", "releaseChronologyExact", "exactTwentyEightNameAssetInventory",
    "lightweightTagReferenceExact", "selectedAssetMetadataExact", "anonymousDownloads",
    "downloadedBytesExact", "downloadedSha256Exact", "canonicalJsonExact",
  ];
  exactKeys(value.verification, verificationKeys, "comparison input verification claims");
  if (verificationKeys.some((key) => value.verification[key] !== true)) {
    throw new TypeError("Comparison input verification claim is not true");
  }
  return value;
}

function assertComparisonAssetInput(value, expected, semanticIdentity, hosted) {
  exactKeys(value, ["assetId", "name", "bytes", "sha256", "browserDownloadUrl"],
    `comparison input ${expected.name}`);
  const hostedEntry = expected.name === expectedName("freshCrawlRaw")
    ? hosted.comparisonEvidence.selectedAssets.freshCrawlRaw
    : hosted.comparisonEvidence.selectedAssets.artifactBinding;
  if (
    value.assetId !== expected.id || value.name !== expected.name ||
    value.bytes !== expected.bytes || value.sha256 !== expected.sha256 ||
    value.browserDownloadUrl !==
      `https://github.com/${crawlPhaseDiagnosticComparisonEvidenceIdentity.repository}/releases/download/${crawlPhaseDiagnosticComparisonEvidenceIdentity.tag}/${expected.name}` ||
    semanticIdentity.bytes !== expected.bytes || semanticIdentity.sha256 !== expected.sha256 ||
    hostedEntry.id !== expected.id || hostedEntry.sizeInBytes !== expected.bytes ||
    hostedEntry.digest !== `sha256:${expected.sha256}`
  ) throw new TypeError(`Comparison input ${expected.name} is not cross-bound`);
}

function expectedName(key) {
  return crawlPhaseDiagnosticComparisonEvidenceIdentity.assets[key].name;
}

function assertEvidenceHostedBinding(evidence, crawleeRaw, stasisRaw, hosted, semantic) {
  if (
    evidence?.schema !== crawlPhaseDiagnosticEvidenceSchema ||
    evidence?.purpose !== "phase_localization_diagnostic_only" ||
    evidence?.authorityEligible !== false || evidence?.timingEligible !== false ||
    evidence?.statisticsEligible !== false || evidence?.comparisonEligible !== false ||
    evidence?.optimizationEligible !== false ||
    !isDeepStrictEqual(evidence?.order, ["crawlee", "stasis"]) ||
    !isDeepStrictEqual(evidence?.observations?.crawlee, crawleeRaw) ||
    !isDeepStrictEqual(evidence?.observations?.stasis, stasisRaw)
  ) throw new TypeError("Diagnostic localization evidence changes its non-authoritative boundary");
  const authority = evidence.authorityInput;
  const diagnostic = evidence.diagnosticAttestation;
  const authorityProvenance = authority?.workflowProvenance;
  const diagnosticProvenance = diagnostic?.provenance;
  const mismatches = [
    ["authority digest", authority?.fileSha256, semantic.fileBoundary.inputs.freshAuthorityRaw.sha256],
    ["authority bytes", authority?.fileBytes, semantic.fileBoundary.inputs.freshAuthorityRaw.bytes],
    ["authority run", authorityProvenance?.runId,
      String(crawlPhaseDiagnosticHostedIdentity.comparison.runId)],
    ["authority job", authorityProvenance?.job, "ubuntu-crawl"],
    ["provider", diagnosticProvenance?.provider, "github-actions"],
    ["repository", diagnosticProvenance?.repository, hosted.producer.repository],
    ["workflow", diagnosticProvenance?.workflow, hosted.producer.workflowName],
    ["job", diagnosticProvenance?.job, hosted.job.key],
    ["run", diagnosticProvenance?.runId, String(hosted.producer.runId)],
    ["attempt", diagnosticProvenance?.runAttempt, "1"],
    ["source SHA", diagnosticProvenance?.workflowSourceSha, hosted.producer.headSha],
    ["source ref", diagnosticProvenance?.workflowSourceRef, hosted.workflowSource.ref],
    ["boot relation", diagnostic?.host?.bootInstanceDigest === authority?.host?.bootInstanceDigest,
      false],
    ["boot declaration", evidence.hostRelation?.bootInstance, "distinct"],
    ["host timing", evidence.hostRelation?.timingCombinedAcrossHosts, false],
    ["authority timing", evidence.localization?.authorityTimingReadOrCombined, false],
    ["pooling", evidence.localization?.crossHostPooling, "none"],
    ["phase sample", evidence.localization?.phaseSumsAreBenchmarkSamples, false],
    ["optimization", evidence.localization?.phaseSumsAuthorizeOptimization, false],
  ].filter(([, actual, expected]) => !isDeepStrictEqual(actual, expected));
  if (mismatches.length > 0) {
    throw new TypeError(
      `Diagnostic evidence is not bound to distinct hosted run/job/VM identities: ${
        mismatches.map(([name]) => name).join(", ")}`,
    );
  }
  return { runDistinct: true, jobDistinct: true, bootInstanceDistinct: true };
}

function assertBindingInputs(value) {
  exactKeys(value, ["hostedReceiptSchema", "semanticReceiptSchema", "workflow", "comparisonEvidence"],
    "diagnostic binding inputs");
  if (
    value.hostedReceiptSchema !== crawlPhaseDiagnosticHostedProvenanceSchema ||
    (value.semanticReceiptSchema !== null &&
      value.semanticReceiptSchema !== crawlPhaseDiagnosticVerificationSchema)
  ) throw new TypeError("Diagnostic binding input schemas changed");
  exactKeys(value.workflow, [
    "repository", "workflow", "runId", "runAttempt", "workflowSourceSha",
    "workflowSourceRef", "job",
  ], "diagnostic binding workflow");
  exactKeys(value.workflow.job, ["key", "name", "hostedJobId"], "diagnostic binding job");
  if (
    value.workflow.repository !== crawlPhaseDiagnosticHostedIdentity.repository ||
    value.workflow.workflow !== crawlPhaseDiagnosticHostedIdentity.workflow.name ||
    !Number.isSafeInteger(value.workflow.runId) || value.workflow.runId < 1 ||
    value.workflow.runId === crawlPhaseDiagnosticHostedIdentity.comparison.runId ||
    value.workflow.runAttempt !== 1 || !sha256OrGitSha(value.workflow.workflowSourceSha, 40) ||
    value.workflow.workflowSourceRef !== crawlPhaseDiagnosticHostedIdentity.headRef ||
    value.workflow.job.key !== crawlPhaseDiagnosticHostedIdentity.job.id ||
    value.workflow.job.name !== crawlPhaseDiagnosticHostedIdentity.job.name ||
    !Number.isSafeInteger(value.workflow.job.hostedJobId) ||
    value.workflow.job.hostedJobId < 1 ||
    value.workflow.job.hostedJobId === crawlPhaseDiagnosticHostedIdentity.comparison.crawlJobId
  ) throw new TypeError("Diagnostic binding workflow identity changed");
  exactKeys(value.comparisonEvidence, [
    "releaseId", "tag", "targetCommitSha", "artifactBinding", "freshCrawlRaw",
  ], "diagnostic binding comparison evidence");
  const expected = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  if (
    value.comparisonEvidence.releaseId !== expected.releaseId ||
    value.comparisonEvidence.tag !== expected.tag ||
    value.comparisonEvidence.targetCommitSha !== expected.targetCommitSha
  ) throw new TypeError("Diagnostic binding comparison release changed");
  assertHostedSelectedAsset(value.comparisonEvidence.artifactBinding, expected.assets.artifactBinding);
  assertHostedSelectedAsset(value.comparisonEvidence.freshCrawlRaw, expected.assets.freshCrawlRaw);
}

function assertBindingArchives(value, mode) {
  const count = { bundle_valid: 1, bundle_status: 1, no_artifact: 0 }[mode];
  if (!Array.isArray(value) || value.length !== count) {
    throw new TypeError("Diagnostic binding archive inventory changed");
  }
  value.forEach((entry, index) => {
    exactKeys(entry, ["name", "artifactId", "bytes", "sha256"],
      "diagnostic binding archive");
    if (
      entry.name !== crawlPhaseDiagnosticExpectedArtifactNames[index] ||
      !Number.isSafeInteger(entry.artifactId) || entry.artifactId < 1 ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 ||
      !sha256Pattern.test(entry.sha256 ?? "")
    ) throw new TypeError("Diagnostic binding archive identity is invalid");
  });
}

function assertBindingExtractedFiles(value, mode) {
  if (mode === "no_artifact") {
    if (value !== null) throw new TypeError("No-artifact binding must omit extracted files");
    return;
  }
  exactKeys(value, ["statusOutcome", "evidence"], "diagnostic binding extracted files");
  assertExtractedIdentity(value.statusOutcome, crawlPhaseDiagnosticExpectedArtifactNames[0],
    "diagnostic-outcome.json");
  if (mode === "bundle_status") {
    if (value.evidence !== null) throw new TypeError("Status bundle binding must omit evidence files");
    return;
  }
  if (!Array.isArray(value.evidence) || value.evidence.length !== 5) {
    throw new TypeError("Valid diagnostic binding evidence inventory changed");
  }
  value.evidence.forEach((entry, index) => assertExtractedIdentity(
    entry, crawlPhaseDiagnosticExpectedArtifactNames[0],
    crawlPhaseDiagnosticArtifactEntries.evidence[index],
  ));
}

function assertHostSeparation(value, mode) {
  if (mode !== "bundle_valid") {
    if (value !== null) throw new TypeError("Invalid diagnostics cannot assert VM separation");
    return;
  }
  exactKeys(value, ["runDistinct", "jobDistinct", "bootInstanceDistinct"],
    "diagnostic host separation");
  if (Object.values(value).some((entry) => entry !== true)) {
    throw new TypeError("Valid diagnostic host separation is incomplete");
  }
}

function assertBindingVerification(value, mode) {
  exactKeys(value, [
    "exactArchiveSet", "allArchiveSizesAndDigestsMatchHostedReceipt",
    "parsedInventoriesExactAndSafe", "outcomeSource", "outcomeMatchesHostedMode",
    "evidenceEligibilityEnforced", "semanticEvidence", "comparisonInputs",
    "distinctRunJobAndBootInstance", "canonicalJsonEntries",
    "retriesOrReplacementAuthorized", "rawContentsRetained", "urlsRetained",
  ], "diagnostic binding verification");
  const semantic = mode === "bundle_valid" ? "verified" : "not_applicable";
  const parsed = mode === "no_artifact" ? "not_applicable" : "verified";
  const source = mode === "no_artifact"
    ? "publisher_derived_terminal_api" : "actions_bundle_zip";
  if (
    value.exactArchiveSet !== true ||
    value.allArchiveSizesAndDigestsMatchHostedReceipt !== true ||
    value.parsedInventoriesExactAndSafe !== parsed || value.outcomeSource !== source ||
    value.outcomeMatchesHostedMode !== true || value.evidenceEligibilityEnforced !== true ||
    value.semanticEvidence !== semantic || value.comparisonInputs !== semantic ||
    value.distinctRunJobAndBootInstance !== semantic || value.canonicalJsonEntries !== parsed ||
    value.retriesOrReplacementAuthorized !== false || value.rawContentsRetained !== false ||
    value.urlsRetained !== false
  ) throw new TypeError("Diagnostic binding verification boundary changed");
}

function assertHostedSelectedAsset(value, expected) {
  exactKeys(value, ["name", "id", "sizeInBytes", "digest"],
    `diagnostic selected comparison asset ${expected.name}`);
  if (
    value.name !== expected.name || value.id !== expected.id ||
    value.sizeInBytes !== expected.bytes || value.digest !== `sha256:${expected.sha256}`
  ) throw new TypeError(`Diagnostic selected comparison asset changed: ${expected.name}`);
}

function assertExtractedIdentity(value, archive, name) {
  exactKeys(value, ["archive", "name", "bytes", "sha256"],
    "diagnostic extracted file identity");
  if (
    value.archive !== archive || value.name !== name ||
    !Number.isSafeInteger(value.bytes) || value.bytes < 1 ||
    !sha256Pattern.test(value.sha256 ?? "")
  ) throw new TypeError("Diagnostic extracted file identity is invalid");
}

function assertFileIdentity(identity, bytes, label) {
  if (
    identity?.bytes !== bytes.byteLength || identity?.sha256 !== hash(bytes)
  ) throw new TypeError(`${label} bytes differ from the semantic file boundary`);
}

function extractedIdentity(archive, name, bytes) {
  return { archive, name, bytes: bytes.byteLength, sha256: hash(bytes) };
}

function parseCanonicalJson(bytes, label) {
  let value;
  try {
    value = JSON.parse(utf8.decode(bytes));
  } catch (error) {
    throw new TypeError(`${label} is not valid UTF-8 JSON`, { cause: error });
  }
  const canonical = Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
  if (!canonical.equals(bytes)) throw new TypeError(`${label} is not canonical pretty JSON`);
  return value;
}

function sha256OrGitSha(value, length) {
  return typeof value === "string" && value.length === length && /^[a-f0-9]+$/u.test(value);
}

function exactKeys(value, expected, label) {
  if (!isPlainRecord(value) ||
    !isDeepStrictEqual(Reflect.ownKeys(value).sort(), [...expected].sort())) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  return value;
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function assertUrlFree(value) {
  const seen = new WeakSet();
  const visit = (current) => {
    if (typeof current === "string") {
      if (/(?:https?:\/\/|api\.github\.com\/|github\.com\/)/iu.test(current)) {
        throw new TypeError("Diagnostic artifact-binding receipt must not retain URLs");
      }
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (seen.has(current)) throw new TypeError("Diagnostic artifact-binding receipt must be acyclic");
    seen.add(current);
    for (const child of Array.isArray(current) ? current : Object.values(current)) visit(child);
  };
  visit(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
