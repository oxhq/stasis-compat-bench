import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  assertExactFileInventory,
  listRegularFiles,
} from "../shared/io.mjs";
import { immutablePlainJsonSnapshot } from "../shared/immutable-json.mjs";
import { serializeWildArtifact } from "./artifact-privacy.mjs";
import { pairedStartPath } from "./artifacts.mjs";
import { assertFrozenWildBinding } from "./binding.mjs";
import {
  aggregateWildClassifications,
  classifyWildCase,
} from "./classification.mjs";
import {
  candidate,
  evidenceIdentity,
  expectedVersions,
  protocol,
  repairedRerunIdentity,
  strata,
} from "./config.mjs";
import { isExactAllowedRobotsDecision } from "./robots.mjs";
import { assertPinnedRuntimeIdentity } from "./runtime-identity.mjs";
import {
  assertNetworkPolicySmokeReference,
  assertSmokePrecedesPairedRun,
  readVerifiedNetworkPolicySmoke,
} from "./network-policy-smoke.mjs";
import { assertRepairedRerunIdentity } from "./rerun-identity.mjs";
import { assertWildRunGeneration } from "./run-generation.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const expectedSelectedCount = strata.reduce((total, stratum) => total + stratum.quota, 0);
const actuallyRunStasisStatuses = new Set([
  "error",
  "policy_or_safety_rejected",
  "settlement_terminal",
  "success",
]);
const knownStasisStatuses = new Set([
  ...actuallyRunStasisStatuses,
  "harness_error",
  "not_run",
]);
const exactTreeReasons = new Set([
  "cross_event_loop_document",
  "cross_event_loop_navigation",
]);
const exactTreeTimeSurfaces = new Set([
  "cross_event_loop_iframe",
  "cross_event_loop_navigation",
  "same_event_loop_iframe",
]);
const projectedStasisErrorNames = new Set([
  "StasisAbortError",
  "StasisCommandTimeoutError",
  "StasisObservationError",
  "StasisProcessError",
  "StasisProtocolError",
  "StasisStateError",
  "StasisTransportError",
]);
const verifiedWildResultProvenance = new WeakMap();

export const wildPairedRules = Object.freeze({
  selectedOrder: "frozen_corpus_order",
  concurrency: 1,
  retries: 0,
  fallback: false,
  baselineBeforeStasis: true,
  repeatedAdjacentPublicAndRobotsGate: true,
  baselineFailuresExcludedFromOrganicBlockers: true,
  organicClassification: "first_terminal_only",
  currentUrlSdkGapSeparated: true,
  evidenceIdentity,
});

export const currentUrlWildPairedRules = Object.freeze({
  ...wildPairedRules,
  successfulCurrentUrlObservation: "owner_attested_settlement_url_identity_required",
  successfulCorrectness: "extraction_and_current_url_identity",
});

export async function verifyWildResult({
  artifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR,
  loadBinding = assertFrozenWildBinding,
} = {}) {
  return verifyWildResultInternal({ artifactRoot, loadBinding }, false);
}

export async function verifyQuiescentWildResult({
  artifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR,
  loadBinding = assertFrozenWildBinding,
} = {}) {
  if (process.env.STASIS_WILD_ARTIFACT_ROOT_QUIESCENT !== "1") {
    throw new Error(
      "Wild decision authority requires STASIS_WILD_ARTIFACT_ROOT_QUIESCENT=1 after the paired runner has exited",
    );
  }
  return verifyWildResultInternal({ artifactRoot, loadBinding }, true);
}

async function verifyWildResultInternal({ artifactRoot, loadBinding }, quiescentAuthority) {
  const authoritativeBinding = loadBinding === assertFrozenWildBinding;
  const root = await assertExplicitRealDirectory(artifactRoot, "Wild result artifact root");
  const wildRoot = await assertRealChildDirectory(root, "wild");
  const indexRecord = await readCanonicalJson(path.join(wildRoot, "artifact-index.json"));
  const index = indexRecord.value;

  const envelopeVersion = assertIndexShape(index);
  if (envelopeVersion === 2) assertExactLegacyV2(index, indexRecord.sha256);
  assertWildIdentity(index.identity, envelopeVersion, root);
  assertDeepEqual(index.rules, wildPairedRules, "Wild paired rules differ from the frozen rules");
  assertRunTimes(index.startedAt, index.completedAt, "artifact index");

  const binding = await loadBinding({
    expectedCommit: index.identity.harnessCommit,
    expectedCorpusSha256: index.identity.corpusSha256,
  });
  const entries = assertBindingMatchesIndex(binding, index.identity);
  let networkPolicySmoke;
  let pairedRun;
  if (envelopeVersion === 4) {
    await assertRepairedRerunIdentity(index.identity.rerun);
    networkPolicySmoke = await readVerifiedNetworkPolicySmoke({
      binding,
      executableSha256: index.identity.stasisExecutableSha256,
      runtimeIdentity: index.identity.runtime,
      root,
      expectedReference: index.identity.networkPolicySmoke,
    });
    assertDeepEqual(
      networkPolicySmoke.value.runGeneration,
      index.identity.runGeneration,
      "Wild result generation differs from its bound network-policy smoke",
    );
    assertSmokePrecedesPairedRun(networkPolicySmoke.value, index.startedAt);
    const pairedStartRecord = await readIndexedJson(
      root,
      index.identity.pairedStart,
      pairedStartPath,
    );
    pairedRun = pairedStartRecord.value;
    assertPairedStart(pairedRun, index);
  }
  assertCaseReferences(index, entries);

  const expectedInventory = [
    "artifact-index.json",
    ...(envelopeVersion === 4 ? [stripWildPrefix(index.identity.pairedStart.path)] : []),
    stripWildPrefix(index.summary.path),
    ...index.cases.flatMap((item) => item.records.map((record) => stripWildPrefix(record.path))),
  ];
  assertExactFileInventory(
    await listRegularFiles(wildRoot),
    expectedInventory,
    "wild result artifact",
  );
  const expectedRootInventory = envelopeVersion === 4
    ? completeArtifactRootInventory(index, expectedInventory)
    : null;
  if (expectedRootInventory !== null) {
    assertExactFileInventory(
      await listArtifactTreeEntries(root),
      expectedRootInventory,
      "complete wild artifact root",
    );
  }

  const summaryRecord = await readIndexedJson(root, index.summary, "wild/summary.json");
  assertSummaryEnvelope(summaryRecord.value, index, envelopeVersion);

  const cases = [];
  const ranks = new Set();
  const domains = new Set();
  const requestedUrls = new Set();
  const stratumSlots = new Map();
  for (let indexOffset = 0; indexOffset < index.cases.length; indexOffset += 1) {
    const slot = indexOffset + 1;
    const caseReference = index.cases[indexOffset];
    const expectedEntry = entries[indexOffset];
    assertCanonicalEntry(expectedEntry, slot);
    assertUnique(ranks, expectedEntry.rank, "rank");
    assertUnique(domains, expectedEntry.domain, "domain");
    assertUnique(requestedUrls, expectedEntry.requestedUrl, "requested URL");
    const slots = stratumSlots.get(expectedEntry.stratumId) ?? new Set();
    assertUnique(slots, expectedEntry.stratumSlot, `stratum slot for ${expectedEntry.stratumId}`);
    stratumSlots.set(expectedEntry.stratumId, slots);

    const prefix = String(slot).padStart(3, "0");
    const expectedPaths = [
      `wild/raw/${prefix}-baseline-gate.json`,
      `wild/raw/${prefix}-baseline.json`,
      `wild/raw/${prefix}-stasis-gate.json`,
      `wild/raw/${prefix}-stasis.json`,
      `wild/cases/${prefix}-classification.json`,
    ];
    const [baselineGateRecord, baselineRecord, stasisGateRecord, stasisRecord, classificationRecord] =
      await Promise.all(caseReference.records.map((reference, recordIndex) =>
        readIndexedJson(root, reference, expectedPaths[recordIndex])
      ));

    const rawEnvelopeVersion = envelopeVersion === 4 ? 3 : 2;
    const expectedPairedRun = envelopeVersion === 4 ? pairedRun : undefined;
    assertRawEnvelope(
      baselineGateRecord.value,
      envelopeVersion === 4
        ? "stasis-wild-baseline-gate-raw-v3"
        : "stasis-wild-gate-raw-v2",
      "gate",
      expectedEntry,
      `slot ${slot} baseline gate`,
      expectedPairedRun,
    );
    assertRawEnvelope(
      baselineRecord.value,
      `stasis-wild-baseline-raw-v${rawEnvelopeVersion}`,
      "observation",
      expectedEntry,
      `slot ${slot} baseline`,
      expectedPairedRun,
    );
    assertRawEnvelope(
      stasisGateRecord.value,
      envelopeVersion === 4
        ? "stasis-wild-stasis-gate-raw-v3"
        : "stasis-wild-gate-raw-v2",
      "gate",
      expectedEntry,
      `slot ${slot} Stasis gate`,
      expectedPairedRun,
    );
    assertRawEnvelope(
      stasisRecord.value,
      `stasis-wild-stasis-raw-v${rawEnvelopeVersion}`,
      "observation",
      expectedEntry,
      `slot ${slot} Stasis observation`,
      expectedPairedRun,
    );
    assertRawEnvelope(
      classificationRecord.value,
      `stasis-wild-case-classification-v${rawEnvelopeVersion}`,
      "classification",
      expectedEntry,
      `slot ${slot} classification`,
      expectedPairedRun,
    );

    assertGateEvidence(baselineGateRecord.value.gate, `slot ${slot} baseline gate`);
    assertGateEvidence(stasisGateRecord.value.gate, `slot ${slot} Stasis gate`);
    assertStasisCandidateEvidence(
      stasisRecord.value.observation,
      index.identity.stasisExecutableSha256,
      `slot ${slot}`,
    );

    const item = {
      entry: expectedEntry,
      baselineGate: baselineGateRecord.value.gate,
      baseline: baselineRecord.value.observation,
      stasisGate: stasisGateRecord.value.gate,
      stasis: stasisRecord.value.observation,
    };
    const recomputed = classifyWildCase(item);
    assertDeepEqual(
      classificationRecord.value.classification,
      recomputed,
      `Recorded classification differs from raw reclassification at slot ${slot}`,
    );
    if (recomputed.eligibleForOrganicBlockerCensus === true) {
      assertOrganicStasisEvidence(
        stasisRecord.value.observation,
        expectedEntry,
        recomputed,
        index.identity.stasisExecutableSha256,
      );
    }
    cases.push({ ...item, classification: recomputed });
  }
  assertStratumSlots(stratumSlots);

  const recomputedSummary = aggregateWildClassifications(cases);
  const expectedStoredSummary = summaryForEnvelope(recomputedSummary, envelopeVersion);
  assertDeepEqual(
    summaryRecord.value.summary,
    expectedStoredSummary,
    "Stored wild summary differs from the aggregate rebuilt from raw records",
  );
  assertAggregateInvariants(recomputedSummary, cases);
  await assertStableWildArtifactSnapshot({
    root,
    wildRoot,
    index,
    indexSha256: indexRecord.sha256,
    expectedInventory,
    expectedRootInventory,
  });
  if (envelopeVersion === 4) {
    networkPolicySmoke = await readVerifiedNetworkPolicySmoke({
      binding,
      executableSha256: index.identity.stasisExecutableSha256,
      runtimeIdentity: index.identity.runtime,
      root,
      expectedReference: index.identity.networkPolicySmoke,
    });
    assertDeepEqual(
      networkPolicySmoke.value.runGeneration,
      index.identity.runGeneration,
      "Wild result generation differs from its bound network-policy smoke",
    );
    assertSmokePrecedesPairedRun(networkPolicySmoke.value, index.startedAt);
    await assertRepairedRerunIdentity(index.identity.rerun);
    const finalBinding = await loadBinding({
      expectedCommit: index.identity.harnessCommit,
      expectedCorpusSha256: index.identity.corpusSha256,
    });
    assertBindingMatchesIndex(finalBinding, index.identity);
  }

  const verified = immutablePlainJsonSnapshot({
    schema: "stasis-wild-verified-result-v1",
    protocol,
    artifactIndexSha256: indexRecord.sha256,
    identity: index.identity,
    rules: index.rules,
    startedAt: index.startedAt,
    completedAt: index.completedAt,
    summary: expectedStoredSummary,
    cases,
  }, "verified wild result");
  verifiedWildResultProvenance.set(
    verified,
    quiescentAuthority && authoritativeBinding && envelopeVersion === 4,
  );
  return verified;
}

export function assertVerifiedWildResultProvenance(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    verifiedWildResultProvenance.get(value) !== true
  ) {
    throw new Error("Context-tree decision requires one immutable authoritative verifyWildResult output");
  }
  return value;
}

function assertIndexShape(index) {
  assertExactKeys(index, [
    "cases",
    "completedAt",
    "identity",
    "protocol",
    "rules",
    "schema",
    "selectedCount",
    "startedAt",
    "summary",
  ], "wild artifact index");
  const envelopeVersion = index.schema === "stasis-wild-artifact-index-v2"
    ? 2
    : index.schema === "stasis-wild-artifact-index-v4"
      ? 4
      : 0;
  if (
    envelopeVersion === 0 ||
    index.protocol !== protocol ||
    index.selectedCount !== expectedSelectedCount ||
    !Array.isArray(index.cases) ||
    index.cases.length !== expectedSelectedCount
  ) {
    throw new Error("Wild artifact index has an invalid supported envelope");
  }
  assertReference(index.summary, "wild summary reference");
  if (index.summary.path !== "wild/summary.json") {
    throw new Error("Wild artifact index must reference the exact summary path");
  }
  return envelopeVersion;
}

function assertExactLegacyV2(index, indexSha256) {
  const prior = repairedRerunIdentity.priorInvalidAttempt;
  if (
    indexSha256 !== prior.artifactIndexSha256 ||
    index.identity?.harnessCommit !== prior.harnessCommit ||
    index.summary?.sha256 !== prior.summarySha256 ||
    index.selectedCount !== prior.selectedCount
  ) {
    throw new Error("Wild v2 inspection is restricted to the exact retained invalid attempt");
  }
}

function assertWildIdentity(identity, envelopeVersion, root) {
  const commonKeys = [
    "corpusPath",
    "corpusSha256",
    "harnessCommit",
    "node",
    "preflightLedgerPath",
    "preflightLedgerSha256",
    "preregistrationCommit",
    "protocol",
    "runtime",
    "stasisExecutableSha256",
    "stasisProfile",
    "stasisRevision",
    "stasisSdkArchiveSha256",
    "stasisSdkTree",
    "stasisVersion",
  ];
  assertExactKeys(
    identity,
    envelopeVersion === 4
      ? [...commonKeys, "networkPolicySmoke", "pairedStart", "rerun", "runGeneration"]
      : commonKeys,
    "wild result identity",
  );
  if (
    identity.protocol !== protocol ||
    !commitPattern.test(identity.harnessCommit ?? "") ||
    !commitPattern.test(identity.preregistrationCommit ?? "") ||
    identity.corpusPath !== "corpora/wild-tranco-74V4X-v1.json" ||
    identity.preflightLedgerPath !== "corpora/wild-tranco-74V4X-v1-preflight.json" ||
    !sha256Pattern.test(identity.corpusSha256 ?? "") ||
    !sha256Pattern.test(identity.preflightLedgerSha256 ?? "") ||
    identity.node !== expectedVersions.node ||
    identity.stasisRevision !== candidate.revision ||
    identity.stasisVersion !== candidate.version ||
    identity.stasisProfile !== candidate.profile ||
    identity.stasisExecutableSha256 !== candidate.executableSha256 ||
    identity.stasisSdkArchiveSha256 !== candidate.sdkSha256
  ) {
    throw new Error("Wild result identity differs from the exact frozen candidate or corpus contract");
  }
  if (envelopeVersion === 4) {
    assertNetworkPolicySmokeReference(identity.networkPolicySmoke);
    assertReference(identity.pairedStart, "wild paired-start reference");
    if (identity.pairedStart.path !== pairedStartPath) {
      throw new Error("Wild result does not bind the exact paired-start claim path");
    }
    assertWildRunGeneration(identity.runGeneration, root);
    if (!isDeepStrictEqual(identity.rerun, repairedRerunIdentity)) {
      throw new Error("Wild repaired-run identity differs from its frozen v4 contract");
    }
  }
  assertRuntimeShape(identity.runtime);
  assertPinnedRuntimeIdentity(identity.runtime);
  if (
    identity.runtime.candidateSdkTarballSha256 !== identity.stasisSdkArchiveSha256 ||
    !isDeepStrictEqual(identity.runtime.candidateSdkTree, identity.stasisSdkTree)
  ) {
    throw new Error("Wild result SDK identity is internally inconsistent");
  }
}

function assertRuntimeShape(runtime) {
  assertExactKeys(runtime, [
    "candidateSdk",
    "candidateSdkTarball",
    "candidateSdkTarballBytes",
    "candidateSdkTarballSha256",
    "candidateSdkTree",
    "chromiumExecutableBasename",
    "chromiumExecutableBytes",
    "chromiumExecutableSha256",
    "chromiumVersion",
    "crawlee",
    "crawleeTree",
    "harnessSdk",
    "installedNodeModulesTree",
    "node",
    "nodeExecutableBasename",
    "nodeExecutableBytes",
    "nodeExecutableSha256",
    "playwright",
    "playwrightTree",
  ], "wild runtime identity");
}

function assertBindingMatchesIndex(binding, identity) {
  if (
    typeof binding !== "object" ||
    binding === null ||
    binding.harnessCommit !== identity.harnessCommit ||
    binding.preregistrationCommit !== identity.preregistrationCommit ||
    binding.corpusPath !== identity.corpusPath ||
    binding.corpusSha256 !== identity.corpusSha256 ||
    binding.preflightLedgerPath !== identity.preflightLedgerPath ||
    binding.preflightLedgerSha256 !== identity.preflightLedgerSha256 ||
    !isDeepStrictEqual(binding.preflightRuntime, identity.runtime) ||
    !Array.isArray(binding.corpus?.urls) ||
    binding.corpus.urls.length !== expectedSelectedCount
  ) {
    throw new Error("Wild result identity does not match the clean frozen repository binding");
  }
  return binding.corpus.urls;
}

function assertCaseReferences(index, entries) {
  const referencedPaths = new Set([index.summary.path]);
  for (let offset = 0; offset < index.cases.length; offset += 1) {
    const slot = offset + 1;
    const item = index.cases[offset];
    assertExactKeys(item, ["rank", "records", "slot"], `wild case reference at slot ${slot}`);
    if (
      item.slot !== slot ||
      item.rank !== entries[offset]?.rank ||
      !Array.isArray(item.records) ||
      item.records.length !== 5
    ) {
      throw new Error(`Wild case reference is reordered or mismatched at slot ${slot}`);
    }
    const prefix = String(slot).padStart(3, "0");
    const expectedPaths = [
      `wild/raw/${prefix}-baseline-gate.json`,
      `wild/raw/${prefix}-baseline.json`,
      `wild/raw/${prefix}-stasis-gate.json`,
      `wild/raw/${prefix}-stasis.json`,
      `wild/cases/${prefix}-classification.json`,
    ];
    for (let recordIndex = 0; recordIndex < item.records.length; recordIndex += 1) {
      const reference = item.records[recordIndex];
      assertReference(reference, `wild case ${slot} record ${recordIndex + 1}`);
      if (reference.path !== expectedPaths[recordIndex]) {
        throw new Error(`Wild case ${slot} does not contain the exact five ordered record paths`);
      }
      if (referencedPaths.has(reference.path)) {
        throw new Error(`Wild artifact index contains a duplicate reference: ${reference.path}`);
      }
      referencedPaths.add(reference.path);
    }
  }
}

function assertSummaryEnvelope(summary, index, envelopeVersion) {
  assertExactKeys(summary, [
    "completedAt",
    "identity",
    "protocol",
    "rules",
    "schema",
    "startedAt",
    "summary",
  ], "wild summary");
  if (
    summary.schema !== `stasis-wild-summary-v${envelopeVersion}` ||
    summary.protocol !== protocol ||
    summary.startedAt !== index.startedAt ||
    summary.completedAt !== index.completedAt ||
    !isDeepStrictEqual(summary.identity, index.identity) ||
    !isDeepStrictEqual(summary.rules, index.rules)
  ) {
    throw new Error("Wild summary envelope differs from the artifact index");
  }
  assertRunTimes(summary.startedAt, summary.completedAt, "summary");
}

function assertRawEnvelope(value, schema, payloadKey, entry, label, expectedPairedRun) {
  const expectedKeys = expectedPairedRun === undefined
    ? ["entry", payloadKey, "schema"]
    : ["entry", "pairedRun", payloadKey, "schema"];
  assertExactKeys(value, expectedKeys, label);
  if (
    value.schema !== schema ||
    !isDeepStrictEqual(value.entry, entry) ||
    (expectedPairedRun !== undefined &&
      !isDeepStrictEqual(value.pairedRun, expectedPairedRun))
  ) {
    throw new Error(`${label} has a mismatched schema, corpus entry, or paired-run binding`);
  }
}

function assertPairedStart(value, index) {
  assertExactKeys(value, [
    "networkPolicySmoke",
    "nonceSha256",
    "protocol",
    "runGeneration",
    "schema",
    "startedAt",
  ], "wild paired-start claim");
  if (
    value.schema !== "stasis-wild-paired-start-v1" ||
    value.protocol !== protocol ||
    !sha256Pattern.test(value.nonceSha256 ?? "") ||
    value.startedAt !== index.startedAt ||
    !isDeepStrictEqual(value.runGeneration, index.identity.runGeneration) ||
    !isDeepStrictEqual(value.networkPolicySmoke, index.identity.networkPolicySmoke)
  ) {
    throw new Error("Wild paired-start claim differs from the result run binding");
  }
  assertRunTimes(value.startedAt, value.startedAt, "paired-start claim");
}

function assertGateEvidence(gate, label) {
  if (gate?.status === "allowed") {
    assertExactKeys(gate, ["code", "robots", "root", "status"], label);
    assertExactKeys(gate.root, ["addressCount", "families"], `${label} root gate`);
    if (
      gate.code !== "eligible" ||
      !isExactAllowedRobotsDecision(gate.robots) ||
      !Number.isSafeInteger(gate.root.addressCount) ||
      gate.root.addressCount <= 0 ||
      !Array.isArray(gate.root.families) ||
      gate.root.families.length === 0 ||
      !gate.root.families.every((family, index, values) =>
        [4, 6].includes(family) && (index === 0 || values[index - 1] < family)
      )
    ) {
      throw new Error(`${label} is not the exact allowed public-target and robots decision`);
    }
    return;
  }
  if (gate?.status === "not_run") {
    assertExactKeys(gate, ["code", "status"], label);
    return;
  }
  if (!["harness_error", "rejected"].includes(gate?.status)) {
    throw new Error(`${label} has an unknown gate status`);
  }
}

function assertStasisCandidateEvidence(observation, executableSha256, label) {
  if (typeof observation !== "object" || observation === null || Array.isArray(observation)) {
    throw new Error(`${label} has no Stasis observation object`);
  }
  if (!knownStasisStatuses.has(observation.status)) {
    throw new Error(`${label} has an unknown Stasis observation status`);
  }
  if (observation.status === "not_run") {
    assertExactKeys(observation, ["code", "status"], `${label} not-run Stasis observation`);
    return;
  }
  if (
    actuallyRunStasisStatuses.has(observation.status) &&
    observation.candidateExecutableSha256 !== executableSha256
  ) {
    throw new Error(`${label} is not attributable to the exact candidate executable`);
  }
  if (
    Object.hasOwn(observation, "candidateExecutableSha256") &&
    observation.candidateExecutableSha256 !== executableSha256
  ) {
    throw new Error(`${label} carries a mismatched candidate executable hash`);
  }
}

function assertOrganicStasisEvidence(observation, entry, classification, executableSha256) {
  const label = `slot ${entry.slot} organic Stasis observation`;
  if (
    observation.requestedUrl !== entry.requestedUrl ||
    observation.candidateExecutableSha256 !== executableSha256 ||
    typeof observation.wallTimeMs !== "number" ||
    !Number.isFinite(observation.wallTimeMs) ||
    observation.wallTimeMs < 0
  ) {
    throw new Error(`${label} lacks exact candidate, requested-root, or bounded wall-time evidence`);
  }
  if (observation.status === "settlement_terminal") {
    assertExactKeys(observation, [
      "audit",
      "candidateExecutableSha256",
      "cleanup",
      "currentUrlObservable",
      "openCommittedUrlIdentity",
      "requestedUrl",
      "settlement",
      "status",
      "wallTimeMs",
    ], label);
    if (
      observation.currentUrlObservable !== false ||
      !sha256Pattern.test(observation.openCommittedUrlIdentity ?? "")
    ) {
      throw new Error(`${label} lacks exact committed-URL evidence`);
    }
    assertCompleteSafeAudit(observation.audit, label);
    assertProjectedSettlement(observation.settlement, label);
    assertCleanupEvidence(observation.cleanup, label);
    assertClassificationHasRawTerminal(classification, observation.settlement, label);
    return;
  }
  if (observation.status === "error") {
    const optional = [];
    if (Object.hasOwn(observation, "openCommittedUrlIdentity")) optional.push("openCommittedUrlIdentity");
    if (Object.hasOwn(observation, "currentUrlObservable")) optional.push("currentUrlObservable");
    assertExactKeys(observation, [
      "candidateExecutableSha256",
      "cleanup",
      "code",
      "error",
      "requestedUrl",
      "status",
      "wallTimeMs",
      ...optional,
    ], label);
    if (
      observation.code !== "stasis_operation_failed" ||
      (Object.hasOwn(observation, "openCommittedUrlIdentity") &&
        !sha256Pattern.test(observation.openCommittedUrlIdentity ?? "")) ||
      (Object.hasOwn(observation, "currentUrlObservable") &&
        observation.currentUrlObservable !== false)
    ) {
      throw new Error(`${label} has an invalid operation-error envelope`);
    }
    assertProjectedStasisError(observation.error, label);
    assertCleanupEvidence(observation.cleanup, label);
    if (
      classification.reason !== observation.error.code ||
      classification.firstTerminal?.code !== observation.error.code ||
      (classification.blockerFamily === "browsing_context_tree" &&
        !exactTreeReasons.has(observation.error.code))
    ) {
      throw new Error(`${label} classification is not rooted in the projected operation error`);
    }
    return;
  }
  throw new Error(`${label} uses a status that cannot carry an organic blocker`);
}

function assertCompleteSafeAudit(audit, label) {
  assertExactKeys(audit, [
    "complete",
    "evidence",
    "evidenceRecordsOmitted",
    "requestRecordsOmitted",
    "requests",
  ], `${label} audit`);
  if (
    audit.complete !== true ||
    audit.requestRecordsOmitted !== 0 ||
    audit.evidenceRecordsOmitted !== 0 ||
    !Array.isArray(audit.requests) ||
    audit.requests.length > 2048 ||
    !Array.isArray(audit.evidence) ||
    audit.evidence.length > 2048
  ) {
    throw new Error(`${label} does not carry one complete uncensored audit`);
  }
  for (const request of audit.requests) {
    assertExactKeys(request, ["method"], `${label} request audit record`);
    if (request.method !== "GET") {
      throw new Error(`${label} audit contains non-read-only work`);
    }
  }
  for (const evidence of audit.evidence) {
    if (evidence?.kind === "route_decided") {
      assertExactKeys(evidence, ["decision", "kind"], `${label} route audit record`);
      if (
        typeof evidence.decision !== "string" ||
        evidence.decision.length === 0 ||
        evidence.decision.length > 32 ||
        evidence.decision === "fixture_abort"
      ) {
        throw new Error(`${label} audit contains a safety-policy abort`);
      }
    } else {
      assertExactKeys(evidence, ["kind"], `${label} evidence audit record`);
    }
    if (typeof evidence.kind !== "string" || evidence.kind.length === 0 || evidence.kind.length > 64) {
      throw new Error(`${label} audit contains an invalid evidence kind`);
    }
  }
}

function assertProjectedSettlement(settlement, label) {
  const optional = [];
  if (Object.hasOwn(settlement ?? {}, "failureCode")) optional.push("failureCode");
  if (Object.hasOwn(settlement ?? {}, "limitKind")) optional.push("limitKind");
  assertExactKeys(settlement, [
    "externalIoCount",
    "outcome",
    "persistentWork",
    "persistentWorkOmitted",
    "processed",
    "unsupportedWork",
    "unsupportedWorkOmitted",
    ...optional,
  ], `${label} settlement`);
  if (
    typeof settlement.outcome !== "string" ||
    settlement.outcome.length === 0 ||
    settlement.outcome.length > 64 ||
    !Number.isSafeInteger(settlement.externalIoCount) || settlement.externalIoCount < 0 ||
    !Number.isSafeInteger(settlement.unsupportedWorkOmitted) || settlement.unsupportedWorkOmitted < 0 ||
    !Number.isSafeInteger(settlement.persistentWorkOmitted) || settlement.persistentWorkOmitted < 0 ||
    !Array.isArray(settlement.unsupportedWork) || settlement.unsupportedWork.length > 32 ||
    (settlement.unsupportedWorkOmitted > 0 && settlement.unsupportedWork.length !== 32) ||
    !Array.isArray(settlement.persistentWork) || settlement.persistentWork.length > 32 ||
    (settlement.persistentWorkOmitted > 0 && settlement.persistentWork.length !== 32)
  ) {
    throw new Error(`${label} settlement is not the exact bounded projection`);
  }
  if (Object.hasOwn(settlement, "failureCode")) assertBoundedCode(settlement.failureCode, 128, `${label} failureCode`);
  if (Object.hasOwn(settlement, "limitKind")) assertBoundedCode(settlement.limitKind, 64, `${label} limitKind`);
  for (const item of settlement.unsupportedWork) {
    const optionalWork = Object.hasOwn(item ?? {}, "timeSurface") ? ["timeSurface"] : [];
    assertExactKeys(item, ["count", "kind", "reason", ...optionalWork], `${label} unsupported work`);
    assertBoundedCode(item.kind, 64, `${label} unsupported kind`);
    assertBoundedCode(item.reason, 128, `${label} unsupported reason`);
    assertIntegerString(item.count, `${label} unsupported count`);
    if (Object.hasOwn(item, "timeSurface")) {
      assertBoundedCode(item.timeSurface, 128, `${label} unsupported time surface`);
    }
  }
  for (const item of settlement.persistentWork) {
    assertExactKeys(item, ["count", "kind", "reason"], `${label} persistent work`);
    assertBoundedCode(item.kind, 64, `${label} persistent kind`);
    assertBoundedCode(item.reason, 128, `${label} persistent reason`);
    assertIntegerString(item.count, `${label} persistent count`);
  }
  assertExactKeys(settlement.processed, [
    "controlTurns",
    "microtasks",
    "mutations",
    "renderingOpportunities",
    "tasks",
  ], `${label} processed counters`);
  for (const [name, value] of Object.entries(settlement.processed)) {
    assertIntegerString(value, `${label} processed ${name}`);
  }
}

function assertProjectedStasisError(error, label) {
  const optional = [];
  if (Object.hasOwn(error ?? {}, "fatal")) optional.push("fatal");
  if (Object.hasOwn(error ?? {}, "stateEffect")) optional.push("stateEffect");
  assertExactKeys(error, [
    "code",
    "messageOmitted",
    "name",
    "stderrTailBytes",
    "stderrTailOmitted",
    ...optional,
  ], `${label} error`);
  if (
    !projectedStasisErrorNames.has(error.name) ||
    typeof error.code !== "string" || error.code.length === 0 || error.code.length > 128 ||
    typeof error.messageOmitted !== "boolean" ||
    typeof error.stderrTailOmitted !== "boolean" ||
    !Number.isSafeInteger(error.stderrTailBytes) || error.stderrTailBytes < 0 ||
    error.stderrTailOmitted !== (error.stderrTailBytes > 0) ||
    (Object.hasOwn(error, "fatal") && typeof error.fatal !== "boolean") ||
    (Object.hasOwn(error, "stateEffect") &&
      !["indeterminate", "none", "partial", "unknown"].includes(error.stateEffect))
  ) {
    throw new Error(`${label} error is not the bounded projected Stasis error`);
  }
}

function assertCleanupEvidence(cleanup, label) {
  if (cleanup?.status === "passed" && cleanup.mode === "graceful_session_close") {
    assertExactKeys(cleanup, ["mode", "status"], `${label} cleanup`);
    return;
  }
  if (cleanup?.status === "passed" && cleanup.mode === "fail_stop_runtime_close") {
    const optional = Object.hasOwn(cleanup, "gracefulCloseError") ? ["gracefulCloseError"] : [];
    assertExactKeys(cleanup, ["mode", "status", ...optional], `${label} cleanup`);
    if (optional.length > 0) assertProjectedStasisError(cleanup.gracefulCloseError, `${label} cleanup`);
    return;
  }
  if (cleanup?.status === "failed" && cleanup.mode === "fail_stop_runtime_close") {
    const optional = Object.hasOwn(cleanup, "gracefulCloseError") ? ["gracefulCloseError"] : [];
    assertExactKeys(cleanup, ["failStopError", "mode", "status", ...optional], `${label} cleanup`);
    assertProjectedStasisError(cleanup.failStopError, `${label} cleanup fail-stop`);
    if (optional.length > 0) assertProjectedStasisError(cleanup.gracefulCloseError, `${label} cleanup graceful`);
    return;
  }
  throw new Error(`${label} lacks exact owned-process cleanup evidence`);
}

function assertClassificationHasRawTerminal(classification, settlement, label) {
  const firstUnsupported = settlement.unsupportedWork[0];
  if (
    classification.firstTerminal?.outcome !== settlement.outcome ||
    (firstUnsupported !== undefined &&
      !isDeepStrictEqual(classification.firstTerminal.unsupportedWork, firstUnsupported))
  ) {
    throw new Error(`${label} classification is not rooted in the first projected settlement terminal`);
  }
  if (
    classification.blockerFamily === "browsing_context_tree" &&
    !exactTreeReasons.has(settlement.failureCode) &&
    !exactTreeReasons.has(firstUnsupported?.reason) &&
    !exactTreeTimeSurfaces.has(firstUnsupported?.timeSurface)
  ) {
    throw new Error(`${label} tree classification has no exact tree source in the raw terminal`);
  }
}

function assertIntegerString(value, label) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`${label} is not one nonnegative integer string`);
  }
}

function assertBoundedCode(value, maximum, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} is not one bounded typed code`);
  }
}

function assertCanonicalEntry(entry, expectedSlot) {
  assertExactKeys(entry, [
    "domain",
    "permutationIndex",
    "rank",
    "requestedUrl",
    "slot",
    "stratumId",
    "stratumSlot",
  ], `wild corpus entry at slot ${expectedSlot}`);
  const stratum = strata.find((item) => item.id === entry.stratumId);
  let url;
  try {
    url = new URL(entry.requestedUrl);
  } catch {
    throw new Error(`Wild corpus entry at slot ${expectedSlot} has an invalid requested URL`);
  }
  if (
    entry.slot !== expectedSlot ||
    stratum === undefined ||
    !Number.isSafeInteger(entry.rank) ||
    entry.rank < stratum.minRank ||
    entry.rank > stratum.maxRank ||
    !Number.isSafeInteger(entry.stratumSlot) ||
    entry.stratumSlot < 1 ||
    entry.stratumSlot > stratum.quota ||
    !Number.isSafeInteger(entry.permutationIndex) ||
    entry.permutationIndex < 0 ||
    typeof entry.domain !== "string" ||
    entry.domain !== url.hostname ||
    entry.requestedUrl !== `https://${entry.domain}/` ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(`Wild corpus entry at slot ${expectedSlot} is not one canonical frozen root`);
  }
}

function assertStratumSlots(stratumSlots) {
  for (const stratum of strata) {
    const slots = [...(stratumSlots.get(stratum.id) ?? [])].sort((left, right) => left - right);
    if (
      slots.length !== stratum.quota ||
      slots.some((value, index) => value !== index + 1)
    ) {
      throw new Error(`Wild result does not contain the exact quota slots for ${stratum.id}`);
    }
  }
}

function assertAggregateInvariants(summary, cases) {
  if (!Array.isArray(summary.organicRootClusters)) {
    throw new Error("Rebuilt wild aggregate must use the v4 causal-cluster array");
  }
  const rootClusterIds = summary.organicRootClusters.map((cluster) => cluster?.rootClusterId);
  if (
    rootClusterIds.some((value) => typeof value !== "string" || value.length === 0) ||
    rootClusterIds.some((value, index) =>
      index > 0 && Buffer.compare(
        Buffer.from(rootClusterIds[index - 1], "utf8"),
        Buffer.from(value, "utf8"),
      ) >= 0
    )
  ) {
    throw new Error("Rebuilt wild causal clusters must be sorted and unique by rootClusterId");
  }
  const blockerSum = sumCounts(summary.organicBlockerCounts);
  const treeCount = summary.organicBlockerCounts.browsing_context_tree ?? 0;
  const treeCases = cases.filter((item) =>
    item.classification.eligibleForOrganicBlockerCensus === true &&
    item.classification.blockerFamily === "browsing_context_tree"
  );
  const treeOrigins = new Set(treeCases.map((item) => new URL(item.entry.requestedUrl).origin));
  const treeStratumSum = Object.values(summary.organicManifestationsByStratum)
    .reduce((total, counts) => total + (counts.browsing_context_tree ?? 0), 0);
  const clusterSum = summary.organicRootClusters
    .reduce((total, cluster) => total + cluster.manifestations, 0);
  if (
    blockerSum !== summary.diagnosedOrganicBlockerCount ||
    summary.organicBlockerDenominator !== summary.diagnosedOrganicBlockerCount ||
    treeCases.length !== treeCount ||
    treeOrigins.size !== treeCount ||
    summary.organicIndependentOriginCounts.browsing_context_tree !== undefined &&
      summary.organicIndependentOriginCounts.browsing_context_tree !== treeCount ||
    treeStratumSum !== treeCount ||
    clusterSum !== summary.diagnosedOrganicBlockerCount
  ) {
    throw new Error("Rebuilt wild aggregate violates blocker, tree-origin, stratum, or cluster invariants");
  }
}

function summaryForEnvelope(summary, envelopeVersion) {
  if (envelopeVersion !== 2) return summary;
  if (!Array.isArray(summary.organicRootClusters) || summary.organicRootClusters.length !== 0) {
    throw new Error("The exact retained v2 attempt cannot contain organic causal clusters");
  }
  return { ...summary, organicRootClusters: {} };
}

async function readIndexedJson(root, reference, expectedPath) {
  assertReference(reference, `${expectedPath} reference`);
  if (reference.path !== expectedPath) {
    throw new Error(`Expected indexed record ${expectedPath}, got ${reference.path}`);
  }
  const absolutePath = resolveExactArtifactPath(root, reference.path);
  const record = await readCanonicalJson(absolutePath);
  if (record.sha256 !== reference.sha256) {
    throw new Error(`SHA-256 mismatch for indexed wild record ${reference.path}`);
  }
  return record;
}

async function assertStableWildArtifactSnapshot({
  root,
  wildRoot,
  index,
  indexSha256,
  expectedInventory,
  expectedRootInventory,
}) {
  assertExactFileInventory(
    await listRegularFiles(wildRoot),
    expectedInventory,
    "stable wild result artifact",
  );
  if (expectedRootInventory !== null) {
    assertExactFileInventory(
      await listArtifactTreeEntries(root),
      expectedRootInventory,
      "stable complete wild artifact root",
    );
  }
  const indexBefore = await readCanonicalJson(path.join(wildRoot, "artifact-index.json"));
  if (indexBefore.sha256 !== indexSha256) {
    throw new Error("Wild artifact index changed during postflight verification");
  }
  await readIndexedJson(root, index.summary, "wild/summary.json");
  if (index.identity.pairedStart !== undefined) {
    await readIndexedJson(root, index.identity.pairedStart, pairedStartPath);
  }
  for (let offset = 0; offset < index.cases.length; offset += 1) {
    const prefix = String(offset + 1).padStart(3, "0");
    const expectedPaths = [
      `wild/raw/${prefix}-baseline-gate.json`,
      `wild/raw/${prefix}-baseline.json`,
      `wild/raw/${prefix}-stasis-gate.json`,
      `wild/raw/${prefix}-stasis.json`,
      `wild/cases/${prefix}-classification.json`,
    ];
    for (let recordOffset = 0; recordOffset < expectedPaths.length; recordOffset += 1) {
      await readIndexedJson(root, index.cases[offset].records[recordOffset], expectedPaths[recordOffset]);
    }
  }
  assertExactFileInventory(
    await listRegularFiles(wildRoot),
    expectedInventory,
    "stable wild result artifact",
  );
  if (expectedRootInventory !== null) {
    assertExactFileInventory(
      await listArtifactTreeEntries(root),
      expectedRootInventory,
      "final complete wild artifact root",
    );
  }
  const indexAfter = await readCanonicalJson(path.join(wildRoot, "artifact-index.json"));
  if (indexAfter.sha256 !== indexSha256) {
    throw new Error("Wild artifact index changed during final postflight recheck");
  }
}

function completeArtifactRootInventory(index, wildFiles) {
  const files = [
    index.identity.networkPolicySmoke.path,
    ...wildFiles.map((relativePath) => `wild/${relativePath}`),
  ];
  const directories = new Set();
  for (const file of files) {
    const segments = file.split("/");
    for (let length = 1; length < segments.length; length += 1) {
      directories.add(`${segments.slice(0, length).join("/")}/`);
    }
  }
  return [...directories, ...files];
}

async function listArtifactTreeEntries(root) {
  const found = [];
  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(
      root,
      ...relativeDirectory.split("/").filter(Boolean),
    );
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = relativeDirectory.length === 0
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        found.push(`${relativePath.replaceAll("\\", "/")}/`);
        await visit(relativePath);
      } else if (entry.isFile()) {
        found.push(relativePath.replaceAll("\\", "/"));
      } else {
        throw new Error(`Wild artifact root contains a non-regular entry: ${relativePath}`);
      }
    }
  }
  await visit("");
  return found;
}

async function readCanonicalJson(absolutePath) {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Wild artifact is not one regular file: ${absolutePath}`);
  }
  const resolved = await realpath(absolutePath);
  if (!samePath(resolved, absolutePath)) {
    throw new Error(`Wild artifact resolves elsewhere: ${absolutePath}`);
  }
  const bytes = await readFile(absolutePath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Wild artifact is not valid JSON: ${absolutePath}`);
  }
  const canonical = Buffer.from(serializeWildArtifact(value), "utf8");
  if (!bytes.equals(canonical)) {
    throw new Error(`Wild artifact bytes are not the canonical v2 JSON projection: ${absolutePath}`);
  }
  return { value, sha256: sha256(bytes) };
}

function resolveExactArtifactPath(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error("Wild artifact reference is not one portable relative path");
  }
  const target = path.resolve(root, ...relativePath.split("/"));
  if (!isPathInside(root, target)) {
    throw new Error("Wild artifact reference escapes the configured root");
  }
  return target;
}

async function assertExplicitRealDirectory(value, label) {
  if (typeof value !== "string" || value.length === 0 || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  const target = path.resolve(value);
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} is not one real directory`);
  }
  if (!samePath(await realpath(target), target)) {
    throw new Error(`${label} resolves elsewhere`);
  }
  return target;
}

async function assertRealChildDirectory(root, child) {
  const target = path.join(root, child);
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Wild result lane is not one real directory: ${target}`);
  }
  const resolved = await realpath(target);
  if (!samePath(resolved, target) || !isPathInside(root, target)) {
    throw new Error("Wild result lane resolves outside the artifact root");
  }
  return target;
}

function assertReference(value, label) {
  assertExactKeys(value, ["path", "sha256"], label);
  if (typeof value.path !== "string" || !sha256Pattern.test(value.sha256 ?? "")) {
    throw new Error(`${label} is not one exact path and SHA-256 reference`);
  }
}

function assertRunTimes(startedAt, completedAt, label) {
  if (
    !validIsoInstant(startedAt) ||
    !validIsoInstant(completedAt) ||
    completedAt < startedAt
  ) {
    throw new Error(`Wild ${label} has invalid run timestamps`);
  }
}

function assertUnique(set, value, label) {
  if (set.has(value)) throw new Error(`Wild result contains a duplicate ${label}`);
  set.add(value);
}

function assertExactKeys(value, expected, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not one exact object`);
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(message);
}

function stripWildPrefix(value) {
  if (!value.startsWith("wild/")) throw new Error("Wild artifact reference is outside the wild lane");
  return value.slice("wild/".length);
}

function sumCounts(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return Number.NaN;
  let total = 0;
  for (const count of Object.values(value)) {
    if (!Number.isSafeInteger(count) || count < 0) return Number.NaN;
    total += count;
  }
  return total;
}

function validIsoInstant(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
