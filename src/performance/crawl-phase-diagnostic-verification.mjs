import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { jsonReplacer } from "../shared/io.mjs";
import {
  assertCrawlPhaseDiagnostic,
  assertCrawlPhaseDiagnosticEvidence,
} from "./crawl-phase-diagnostic.mjs";

export const crawlPhaseDiagnosticVerificationSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-v1";

export const crawlPhaseDiagnosticVerificationFileNames = Object.freeze([
  "crawl-phase-crawlee-raw.json",
  "crawl-phase-stasis-raw.json",
  "crawl-phase-localization-evidence.json",
]);

const verificationKeys = Object.freeze([
  "standaloneCrawleeRawValid",
  "standaloneStasisRawValid",
  "laneAndOrderExact",
  "standaloneValuesMatchComposedEvidence",
  "standaloneCanonicalBytesMatchComposedObservations",
  "composedEvidenceReplayedExactly",
  "freshAuthorityBoundThroughArtifactReceipt",
  "authorityBytesStableDuringOfflineRead",
  "authorityBytesReusedForOfflineBeforeAfterReplay",
  "temporalBeforeAfterReadsReenacted",
  "timingAuthorityGranted",
  "comparisonAuthorityGranted",
  "optimizationAuthorityGranted",
]);

const fileBoundaryInputNames = Object.freeze([
  "crawleeRaw",
  "stasisRaw",
  "composedEvidence",
  "freshAuthorityRaw",
  "artifactBindingReceipt",
]);
const sha256Pattern = /^[a-f0-9]{64}$/u;

/**
 * Replays one retained diagnostic set. The authority buffer supplied here is
 * one immutable offline input. Reusing it for the composer's before/after
 * arguments proves exact retained-byte continuity; it does not reenact the two
 * temporal reads performed by the hosted diagnostic runner.
 */
export function verifyCrawlPhaseDiagnosticArtifactSet({
  crawleeDiagnostic,
  crawleeDiagnosticBytes,
  stasisDiagnostic,
  stasisDiagnosticBytes,
  composedEvidence,
  composedEvidenceBytes,
  authoritativeRaw,
  authoritativeRawBytes,
  authoritativeRawSha256,
  artifactBindingReceipt,
  artifactBindingReceiptBytes,
  fileBoundary,
}, {
  assertDiagnostic = assertCrawlPhaseDiagnostic,
  assertEvidence = assertCrawlPhaseDiagnosticEvidence,
} = {}) {
  const crawleeBytes = exactBytes(crawleeDiagnosticBytes, "Crawlee diagnostic raw");
  const stasisBytes = exactBytes(stasisDiagnosticBytes, "Stasis diagnostic raw");
  const evidenceBytes = exactBytes(composedEvidenceBytes, "composed diagnostic evidence");
  const authorityBytes = exactBytes(authoritativeRawBytes, "fresh authoritative crawl raw");
  const artifactBindingBytes = exactBytes(
    artifactBindingReceiptBytes,
    "performance artifact-binding receipt",
  );
  assertCanonicalValueBytes(
    evidenceBytes,
    composedEvidence,
    "Composed diagnostic evidence",
  );
  assertCanonicalValueBytes(
    authorityBytes,
    authoritativeRaw,
    "Fresh authoritative crawl raw",
  );
  assertCanonicalValueBytes(
    artifactBindingBytes,
    artifactBindingReceipt,
    "Performance artifact-binding receipt",
  );

  assertDiagnostic(crawleeDiagnostic);
  assertDiagnostic(stasisDiagnostic);
  if (
    crawleeDiagnostic?.lane !== "crawlee" ||
    crawleeDiagnostic?.job?.lane !== "crawlee" ||
    crawleeDiagnostic?.job?.ordinal !== 1 ||
    stasisDiagnostic?.lane !== "stasis" ||
    stasisDiagnostic?.job?.lane !== "stasis" ||
    stasisDiagnostic?.job?.ordinal !== 2
  ) {
    throw new TypeError("Diagnostic lane identity or Crawlee-then-Stasis order changed");
  }

  const retainedCrawlee = composedEvidence?.observations?.crawlee;
  const retainedStasis = composedEvidence?.observations?.stasis;
  if (
    !isDeepStrictEqual(crawleeDiagnostic, retainedCrawlee) ||
    !isDeepStrictEqual(stasisDiagnostic, retainedStasis)
  ) {
    throw new TypeError("Standalone diagnostic values do not match the composed evidence");
  }
  if (
    !crawleeBytes.equals(canonicalJsonBytes(retainedCrawlee)) ||
    !stasisBytes.equals(canonicalJsonBytes(retainedStasis))
  ) {
    throw new TypeError(
      "Standalone diagnostic bytes do not match the composed evidence observations",
    );
  }

  const replayed = assertEvidence(composedEvidence, {
    authoritativeRaw,
    authoritativeRawBytes: authorityBytes,
    authoritativeRawBytesAfterDiagnostics: authorityBytes,
    authoritativeRawSha256,
    artifactBindingReceipt,
  });
  if (replayed !== composedEvidence) {
    throw new TypeError("The diagnostic evidence verifier did not return the supplied evidence");
  }

  const expectedIdentities = {
    crawleeRaw: fileIdentity(crawleeBytes),
    stasisRaw: fileIdentity(stasisBytes),
    composedEvidence: fileIdentity(evidenceBytes),
    freshAuthorityRaw: fileIdentity(authorityBytes),
    artifactBindingReceipt: fileIdentity(artifactBindingBytes),
  };
  assertFileBoundary(fileBoundary, expectedIdentities);
  if (authoritativeRawSha256 !== expectedIdentities.freshAuthorityRaw.sha256) {
    throw new TypeError("Fresh authoritative crawl raw SHA-256 does not match its exact bytes");
  }

  return deepFreeze({
    schema: crawlPhaseDiagnosticVerificationSchema,
    status: "passed",
    purpose: "offline_phase_diagnostic_verification_only",
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    diagnosticSet: {
      order: ["crawlee", "stasis"],
      expectedInputFileNames: [...crawlPhaseDiagnosticVerificationFileNames],
      composedEvidenceSchema: composedEvidence.schema,
      authorityRawSchema: authoritativeRaw.schema,
      artifactBindingSchema: artifactBindingReceipt.schema,
      observationBindings: {
        crawlee: {
          standaloneSha256: expectedIdentities.crawleeRaw.sha256,
          composedObservationCanonicalSha256:
            sha256(canonicalJsonBytes(retainedCrawlee)),
        },
        stasis: {
          standaloneSha256: expectedIdentities.stasisRaw.sha256,
          composedObservationCanonicalSha256:
            sha256(canonicalJsonBytes(retainedStasis)),
        },
      },
    },
    authorityReplay: {
      mode: "offline_single_immutable_authority_input",
      inputSha256: expectedIdentities.freshAuthorityRaw.sha256,
      inputBytes: expectedIdentities.freshAuthorityRaw.bytes,
      exactBytesUsedForBeforeAndAfterReplay: true,
      temporalBeforeAfterReadsReenacted: false,
    },
    verification: {
      standaloneCrawleeRawValid: true,
      standaloneStasisRawValid: true,
      laneAndOrderExact: true,
      standaloneValuesMatchComposedEvidence: true,
      standaloneCanonicalBytesMatchComposedObservations: true,
      composedEvidenceReplayedExactly: true,
      freshAuthorityBoundThroughArtifactReceipt: true,
      authorityBytesStableDuringOfflineRead: true,
      authorityBytesReusedForOfflineBeforeAfterReplay: true,
      temporalBeforeAfterReadsReenacted: false,
      timingAuthorityGranted: false,
      comparisonAuthorityGranted: false,
      optimizationAuthorityGranted: false,
    },
    fileBoundary: structuredClone(fileBoundary),
  });
}

export function assertCrawlPhaseDiagnosticVerificationReceipt(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "schema",
    "status",
    "purpose",
    "authorityEligible",
    "timingEligible",
    "statisticsEligible",
    "comparisonEligible",
    "optimizationEligible",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
    "decisionState",
    "diagnosticSet",
    "authorityReplay",
    "verification",
    "fileBoundary",
  ])) {
    throw new TypeError("Invalid crawl phase diagnostic verification receipt");
  }
  if (
    value.schema !== crawlPhaseDiagnosticVerificationSchema ||
    value.status !== "passed" ||
    value.purpose !== "offline_phase_diagnostic_verification_only" ||
    value.authorityEligible !== false ||
    value.timingEligible !== false ||
    value.statisticsEligible !== false ||
    value.comparisonEligible !== false ||
    value.optimizationEligible !== false ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false ||
    value.decisionState !== "STAY_0_4_UNASSIGNED"
  ) {
    throw new TypeError("Diagnostic verification receipt grants forbidden authority");
  }
  if (
    !isPlainRecord(value.verification) ||
    !hasExactKeys(value.verification, verificationKeys) ||
    verificationKeys.some((key) => value.verification[key] !== (
      key === "temporalBeforeAfterReadsReenacted" ||
      key === "timingAuthorityGranted" ||
      key === "comparisonAuthorityGranted" ||
      key === "optimizationAuthorityGranted"
        ? false
        : true
    ))
  ) {
    throw new TypeError("Diagnostic verification receipt has invalid verification claims");
  }
  if (
    !isPlainRecord(value.authorityReplay) ||
    !hasExactKeys(value.authorityReplay, [
      "mode",
      "inputSha256",
      "inputBytes",
      "exactBytesUsedForBeforeAndAfterReplay",
      "temporalBeforeAfterReadsReenacted",
    ]) ||
    value.authorityReplay.mode !== "offline_single_immutable_authority_input" ||
    !isSha256(value.authorityReplay.inputSha256) ||
    !isPositiveSafeInteger(value.authorityReplay.inputBytes) ||
    value.authorityReplay.exactBytesUsedForBeforeAndAfterReplay !== true ||
    value.authorityReplay.temporalBeforeAfterReadsReenacted !== false
  ) {
    throw new TypeError("Diagnostic verification receipt has an invalid authority replay");
  }
  assertDiagnosticSet(value.diagnosticSet);
  assertFileBoundaryShape(value.fileBoundary);
  if (
    value.authorityReplay.inputSha256 !==
      value.fileBoundary.inputs.freshAuthorityRaw.sha256 ||
    value.authorityReplay.inputBytes !==
      value.fileBoundary.inputs.freshAuthorityRaw.bytes ||
    value.diagnosticSet.observationBindings.crawlee.standaloneSha256 !==
      value.fileBoundary.inputs.crawleeRaw.sha256 ||
    value.diagnosticSet.observationBindings.stasis.standaloneSha256 !==
      value.fileBoundary.inputs.stasisRaw.sha256
  ) {
    throw new TypeError("Diagnostic verification receipt identities are not cross-bound");
  }
  return value;
}

function assertFileBoundary(value, expectedIdentities) {
  assertFileBoundaryShape(value);
  if (!isDeepStrictEqual(value.inputs, expectedIdentities)) {
    throw new TypeError("Diagnostic verifier file identities do not match exact input bytes");
  }
}

function assertFileBoundaryShape(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "exactThreeFileDiagnosticInventoryBeforeOutput",
    "eachInputJsonReadExactlyOnce",
    "canonicalJsonVerified",
    "allInputAndOutputPathsAbsoluteAndDistinct",
    "allInputsRealStableRegularFiles",
    "symlinksRejected",
    "fileIdentityCollisionsRejected",
    "outputInitiallyAbsent",
    "outputCreation",
    "inputs",
  ])) {
    throw new TypeError("Invalid diagnostic verifier file boundary");
  }
  for (const key of [
    "exactThreeFileDiagnosticInventoryBeforeOutput",
    "eachInputJsonReadExactlyOnce",
    "canonicalJsonVerified",
    "allInputAndOutputPathsAbsoluteAndDistinct",
    "allInputsRealStableRegularFiles",
    "symlinksRejected",
    "fileIdentityCollisionsRejected",
    "outputInitiallyAbsent",
  ]) {
    if (value[key] !== true) {
      throw new TypeError(`Diagnostic verifier file-boundary claim is not true: ${key}`);
    }
  }
  if (value.outputCreation !== "fsynced_sibling_temp_no_clobber_link") {
    throw new TypeError("Diagnostic verifier output creation mode changed");
  }
  if (!isPlainRecord(value.inputs) || !hasExactKeys(value.inputs, fileBoundaryInputNames)) {
    throw new TypeError("Diagnostic verifier file-boundary inputs changed");
  }
  for (const name of fileBoundaryInputNames) {
    if (!isFileIdentity(value.inputs[name])) {
      throw new TypeError(`Diagnostic verifier file identity is invalid: ${name}`);
    }
  }
}

function assertDiagnosticSet(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "order",
    "expectedInputFileNames",
    "composedEvidenceSchema",
    "authorityRawSchema",
    "artifactBindingSchema",
    "observationBindings",
  ])) {
    throw new TypeError("Diagnostic verification receipt has an invalid diagnostic set");
  }
  if (
    !isDeepStrictEqual(value.order, ["crawlee", "stasis"]) ||
    !isDeepStrictEqual(
      value.expectedInputFileNames,
      crawlPhaseDiagnosticVerificationFileNames,
    ) ||
    !isNonEmptyString(value.composedEvidenceSchema) ||
    !isNonEmptyString(value.authorityRawSchema) ||
    !isNonEmptyString(value.artifactBindingSchema) ||
    !isPlainRecord(value.observationBindings) ||
    !hasExactKeys(value.observationBindings, ["crawlee", "stasis"])
  ) {
    throw new TypeError("Diagnostic verification receipt has an invalid diagnostic set");
  }
  for (const lane of ["crawlee", "stasis"]) {
    const binding = value.observationBindings[lane];
    if (
      !isPlainRecord(binding) ||
      !hasExactKeys(binding, [
        "standaloneSha256",
        "composedObservationCanonicalSha256",
      ]) ||
      !isSha256(binding.standaloneSha256) ||
      binding.composedObservationCanonicalSha256 !== binding.standaloneSha256
    ) {
      throw new TypeError(
        `Diagnostic verification receipt has an invalid ${lane} observation binding`,
      );
    }
  }
}

function isFileIdentity(value) {
  return isPlainRecord(value) &&
    hasExactKeys(value, ["bytes", "sha256"]) &&
    isPositiveSafeInteger(value.bytes) &&
    isSha256(value.sha256);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSha256(value) {
  return typeof value === "string" && sha256Pattern.test(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
}

function assertCanonicalValueBytes(bytes, value, label) {
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new TypeError(`${label} bytes do not represent the supplied canonical value`);
  }
}

function exactBytes(value, label) {
  if (!Buffer.isBuffer(value)) {
    throw new TypeError(`${label} must be supplied as exact bytes`);
  }
  return Buffer.from(value);
}

function fileIdentity(bytes) {
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
