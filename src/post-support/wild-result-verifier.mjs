import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { immutablePlainJsonSnapshot } from "../shared/immutable-json.mjs";
import { sha256File } from "../shared/io.mjs";
import { serializeWildArtifact } from "../wild/artifact-privacy.mjs";
import { pairedStartPath } from "../wild/artifacts.mjs";
import { assertFrozenWildBinding } from "../wild/binding.mjs";
import { aggregateWildClassifications, classifyWildCase } from "../wild/classification.mjs";
import { networkPolicySmokePath, protocol, strata } from "../wild/config.mjs";
import { assertSmokePrecedesPairedRun } from "../wild/network-policy-smoke.mjs";
import { isExactAllowedRobotsDecision } from "../wild/robots.mjs";
import { assertWildRunGeneration } from "../wild/run-generation.mjs";
import {
  currentUrlWildPairedRules,
  wildPairedRules,
} from "../wild/result-verifier.mjs";
import {
  assertAuthoritativePostSupportCandidate,
  assertCandidateIdentity,
  postSupportNodeVersion,
  postSupportProfile,
} from "./candidate-identity.mjs";
import { projectWildCandidateIdentity } from "./wild-identity.mjs";
import { assertPostSupportArtifactPrivacy } from "./artifact-privacy.mjs";
import {
  projectPostSupportHarnessRuntime,
  readVerifiedPostSupportWildNetworkSmoke,
} from "./wild-network-smoke.mjs";
import {
  assertObservedPostSupportHarnessRuntime,
  observePostSupportHarnessRuntime,
} from "./wild-runtime-identity.mjs";
import { executePostSupportWildProcessPlan } from "./wild-process-plan.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const replayCorpusIdentity = Object.freeze({
  path: "corpora/wild-tranco-74V4X-v1.json",
  sha256: "6c21593669547e96aabebb507ed6530fb2d92efe074c43ddd08790e886a36124",
  preregistrationCommit: "b00855fcd9e716ac3e6afba978990a0c094d81c6",
  preflightLedgerPath: "corpora/wild-tranco-74V4X-v1-preflight.json",
  preflightLedgerSha256: "7255c2804329d5fff857b1f1d0695d733a09842eeb2317e17b83b5ada3e8e4c6",
});
const expectedSelectedCount = strata.reduce((total, stratum) => total + stratum.quota, 0);
const authority = new WeakMap();
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
const legacyWildEvidenceEnvelope = Object.freeze({
  version: 4,
  indexSchema: "stasis-wild-artifact-index-v4",
  summarySchema: "stasis-wild-summary-v4",
  stasisSchema: "stasis-wild-stasis-raw-v3",
  classificationSchema: "stasis-wild-case-classification-v3",
});
const currentUrlWildEvidenceEnvelope = Object.freeze({
  version: 5,
  indexSchema: "stasis-wild-artifact-index-v5",
  summarySchema: "stasis-wild-summary-v5",
  stasisSchema: "stasis-wild-stasis-raw-v4",
  classificationSchema: "stasis-wild-case-classification-v4",
});

function expectedWildRules(evidenceEnvelope) {
  return evidenceEnvelope === legacyWildEvidenceEnvelope
    ? wildPairedRules
    : currentUrlWildPairedRules;
}

function expectedIdentitySchema(evidenceEnvelope) {
  return evidenceEnvelope === legacyWildEvidenceEnvelope
    ? "stasis-post-support-wild-artifact-identity-v1"
    : "stasis-post-support-wild-artifact-identity-v2";
}

export async function verifyPostSupportWildResult({
  verifiedCandidate,
  artifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR,
  loadBinding = assertFrozenWildBinding,
  observeHarnessRuntime = observePostSupportHarnessRuntime,
} = {}) {
  return verifyInternal(
    { verifiedCandidate, artifactRoot, loadBinding, observeHarnessRuntime },
    false,
    false,
  );
}

export async function runAuthoritativePostSupportWildSequence({
  verifiedCandidate,
  artifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR,
} = {}) {
  assertAuthoritativePostSupportCandidate(verifiedCandidate);
  if (
    typeof artifactRoot !== "string" ||
    typeof process.env.STASIS_COMPAT_ARTIFACT_DIR !== "string" ||
    !samePath(artifactRoot, process.env.STASIS_COMPAT_ARTIFACT_DIR)
  ) {
    throw new Error(
      "Post-support wild authority requires the exact STASIS_COMPAT_ARTIFACT_DIR used by its children",
    );
  }
  await executePostSupportWildProcessPlan(runExactPostSupportWildChild);
  return verifyInternal(
    {
      verifiedCandidate,
      artifactRoot,
      loadBinding: assertFrozenWildBinding,
      observeHarnessRuntime: observePostSupportHarnessRuntime,
    },
    true,
    true,
  );
}

async function runExactPostSupportWildChild(step, environment) {
  const script = fileURLToPath(new URL("./run.mjs", import.meta.url));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, step], {
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 && signal === null) resolve();
      else {
        reject(
          new Error(
            `Post-support ${step} child exited with code ${code ?? "none"} and signal ${signal ?? "none"}`,
          ),
        );
      }
    });
  });
}

export function assertAuthoritativePostSupportWildResult(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    authority.get(value) !== true
  ) {
    throw new Error(
      "Post-support release authority requires the immutable quiescent postflight verifier output",
    );
  }
  return value;
}

export function replayPostSupportWildEvidenceClaims({
  candidateIdentity,
  corpus,
  corpusPath,
  corpusSha256,
  harnessRevision,
  index,
  pairedRun,
  preflightLedger,
  preflightLedgerPath,
  preflightLedgerSha256,
  requireFrozenCorpusIdentity = true,
  recordsByPath,
  summaryEnvelope,
}) {
  const evidenceEnvelope = assertIndexShape(index);
  assertRunTimes(index.startedAt, index.completedAt, "artifact index");
  assertDeepEqual(
    index.rules,
    expectedWildRules(evidenceEnvelope),
    `Post-support wild rules differ from v${evidenceEnvelope.version}`,
  );
  const entries = assertReplayIdentity(index.identity, {
    candidateIdentity,
    corpus,
    corpusPath,
    corpusSha256,
    harnessRevision,
    preflightLedger,
    preflightLedgerPath,
    preflightLedgerSha256,
    requireFrozenCorpusIdentity,
  }, evidenceEnvelope);
  assertPairedStart(pairedRun, index);
  assertCaseReferences(index, entries);
  assertSummaryEnvelope(summaryEnvelope, index, evidenceEnvelope);
  if (!(recordsByPath instanceof Map) || recordsByPath.size !== expectedSelectedCount * 5) {
    throw new Error("Post-support wild replay requires exactly 500 retained case records");
  }

  const cases = [];
  const consumedPaths = new Set();
  const definitions = [
    ["stasis-wild-baseline-gate-raw-v3", "gate"],
    ["stasis-wild-baseline-raw-v3", "observation"],
    ["stasis-wild-stasis-gate-raw-v3", "gate"],
    [evidenceEnvelope.stasisSchema, "observation"],
    [evidenceEnvelope.classificationSchema, "classification"],
  ];
  for (let offset = 0; offset < index.cases.length; offset += 1) {
    const slot = offset + 1;
    const expectedEntry = entries[offset];
    assertCanonicalEntry(expectedEntry, slot);
    const expectedPaths = caseRecordPaths(slot);
    const records = expectedPaths.map((relativePath) => {
      const record = recordsByPath.get(relativePath);
      if (record === undefined || consumedPaths.has(relativePath)) {
        throw new Error(`Post-support wild replay record is absent or duplicated: ${relativePath}`);
      }
      consumedPaths.add(relativePath);
      return record;
    });
    for (let recordOffset = 0; recordOffset < records.length; recordOffset += 1) {
      assertRawEnvelope(
        records[recordOffset],
        definitions[recordOffset][0],
        definitions[recordOffset][1],
        expectedEntry,
        pairedRun,
        `slot ${slot} record ${recordOffset + 1}`,
      );
    }
    const item = {
      entry: expectedEntry,
      baselineGate: records[0].gate,
      baseline: records[1].observation,
      stasisGate: records[2].gate,
      stasis: records[3].observation,
    };
    assertGateEvidence(item.baselineGate, `slot ${slot} baseline gate`);
    assertGateEvidence(item.stasisGate, `slot ${slot} Stasis gate`);
    assertStasisCandidateEvidence(
      item.stasis,
      candidateIdentity.windows.executable.sha256,
      `slot ${slot}`,
      evidenceEnvelope,
    );
    if (item.stasis.status === "success") {
      assertSuccessfulStasisEvidence(
        item.stasis,
        expectedEntry,
        candidateIdentity.windows.executable.sha256,
        evidenceEnvelope,
      );
    }
    const recomputed = classifyWildCase(item);
    assertDeepEqual(
      records[4].classification,
      recomputed,
      `Post-support classification differs from raw records at slot ${slot}`,
    );
    if (recomputed.eligibleForOrganicBlockerCensus === true) {
      assertOrganicStasisEvidence(
        item.stasis,
        expectedEntry,
        recomputed,
        candidateIdentity.windows.executable.sha256,
        evidenceEnvelope,
      );
    }
    cases.push({ ...item, classification: recomputed });
  }
  if (consumedPaths.size !== recordsByPath.size) {
    throw new Error("Post-support wild replay contains an unconsumed case record");
  }

  const recomputedSummary = aggregateWildClassifications(cases);
  assertDeepEqual(
    summaryEnvelope.summary,
    recomputedSummary,
    "Post-support wild summary differs from its 100 raw cases",
  );
  assertAggregateCounts(recomputedSummary, evidenceEnvelope);
  assertAggregateInvariants(recomputedSummary, cases, evidenceEnvelope);
  return Object.freeze({ cases, summary: recomputedSummary });
}

async function verifyInternal(
  { verifiedCandidate, artifactRoot, loadBinding, observeHarnessRuntime },
  quiescentPostflight,
  candidateIsAuthoritative,
) {
  const candidateIdentity = assertVerifiedCandidate(verifiedCandidate);
  const authoritativeBinding = loadBinding === assertFrozenWildBinding;
  const root = await assertExplicitRealDirectory(artifactRoot, "post-support wild artifact root");
  const wildRoot = await assertRealChildDirectory(root, "wild");
  const indexRecord = await readCanonicalJson(path.join(wildRoot, "artifact-index.json"));
  const index = indexRecord.value;
  const evidenceEnvelope = assertIndexShape(index);
  assertRunTimes(index.startedAt, index.completedAt, "artifact index");
  assertDeepEqual(
    index.rules,
    expectedWildRules(evidenceEnvelope),
    `Post-support wild rules differ from v${evidenceEnvelope.version}`,
  );

  const binding = await loadBinding({
    expectedCommit: index.identity?.harnessCommit,
    expectedCorpusSha256: index.identity?.corpusSha256,
  });
  const entries = assertIdentity(index.identity, {
    binding,
    candidateIdentity,
    root,
  }, evidenceEnvelope);
  const smoke = await readVerifiedPostSupportWildNetworkSmoke({
    binding,
    verifiedCandidate,
    root,
    expectedReference: index.identity.networkPolicySmoke,
  });
  assertDeepEqual(
    smoke.value.runGeneration,
    index.identity.runGeneration,
    "Post-support wild generation differs from its smoke",
  );
  assertSmokePrecedesPairedRun(smoke.value, index.startedAt);

  const pairedStartRecord = await readIndexedJson(
    root,
    index.identity.pairedStart,
    pairedStartPath,
  );
  const pairedRun = pairedStartRecord.value;

  const indexedReferences = [
    index.identity.networkPolicySmoke,
    index.identity.pairedStart,
    index.summary,
    ...index.cases.flatMap((item) => item.records),
  ];
  const expectedInventory = completeInventory(index);
  assertDeepEqual(
    await listArtifactTreeEntries(root),
    expectedInventory,
    "Post-support wild artifact root inventory is not exact",
  );

  const summaryRecord = await readIndexedJson(root, index.summary, "wild/summary.json");
  const recordsByPath = new Map();
  for (let offset = 0; offset < index.cases.length; offset += 1) {
    const slot = offset + 1;
    const expectedPaths = caseRecordPaths(slot);
    const records = await Promise.all(index.cases[offset].records.map(
      (reference, recordOffset) => readIndexedJson(root, reference, expectedPaths[recordOffset]),
    ));
    for (let recordOffset = 0; recordOffset < records.length; recordOffset += 1) {
      recordsByPath.set(expectedPaths[recordOffset], records[recordOffset].value);
    }
  }
  const replay = replayPostSupportWildEvidenceClaims({
    candidateIdentity,
    corpus: binding.corpus,
    corpusPath: binding.corpusPath,
    corpusSha256: binding.corpusSha256,
    harnessRevision: binding.harnessCommit,
    index,
    pairedRun,
    preflightLedger: {
      schema: "stasis-wild-preflight-ledger-v2",
      protocol,
      preregistrationCommit: binding.preregistrationCommit,
      runtime: binding.preflightRuntime,
    },
    preflightLedgerPath: binding.preflightLedgerPath,
    preflightLedgerSha256: binding.preflightLedgerSha256,
    requireFrozenCorpusIdentity: authoritativeBinding,
    recordsByPath,
    summaryEnvelope: summaryRecord.value,
  });
  const { cases, summary: recomputedSummary } = replay;
  await assertStablePostflight({
    root,
    index,
    indexSha256: indexRecord.sha256,
    indexedReferences,
    expectedInventory,
    binding,
    candidateIdentity,
    verifiedCandidate,
    loadBinding,
    observeHarnessRuntime,
  });

  const verified = immutablePlainJsonSnapshot({
    schema: evidenceEnvelope === legacyWildEvidenceEnvelope
      ? "stasis-post-support-wild-verified-result-v1"
      : "stasis-post-support-wild-verified-result-v2",
    protocol,
    artifactIndexSha256: indexRecord.sha256,
    identity: index.identity,
    rules: index.rules,
    startedAt: index.startedAt,
    completedAt: index.completedAt,
    summary: recomputedSummary,
    cases,
  }, "verified post-support wild result");
  authority.set(
    verified,
    quiescentPostflight &&
      candidateIsAuthoritative &&
      authoritativeBinding &&
      index.identity.exactTrackedBytesVerified === true &&
      index.identity.executionAuthority === "default_verified_candidate_uninjected" &&
      smoke.value.executionAuthority === "default_verified_candidate_uninjected",
  );
  return verified;
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
  ], "post-support wild artifact index");
  const evidenceEnvelope = index?.schema === legacyWildEvidenceEnvelope.indexSchema
    ? legacyWildEvidenceEnvelope
    : index?.schema === currentUrlWildEvidenceEnvelope.indexSchema
      ? currentUrlWildEvidenceEnvelope
      : undefined;
  if (
    evidenceEnvelope === undefined ||
    index.protocol !== protocol ||
    index.selectedCount !== expectedSelectedCount ||
    !Array.isArray(index.cases) ||
    index.cases.length !== expectedSelectedCount
  ) {
    throw new Error("Post-support wild artifact index has an invalid supported envelope");
  }
  assertReference(index.summary, "summary");
  if (index.summary.path !== "wild/summary.json") {
    throw new Error("Post-support wild index does not bind the exact summary path");
  }
  return evidenceEnvelope;
}

function assertIdentity(value, { binding, candidateIdentity, root }, evidenceEnvelope) {
  assertExactKeys(value, [
    "candidate",
    "corpusPath",
    "corpusSha256",
    "exactTrackedBytesVerified",
    "executionAuthority",
    "harnessCommit",
    "networkPolicySmoke",
    "pairedStart",
    "preflightLedgerPath",
    "preflightLedgerSha256",
    "preregistrationCommit",
    "protocol",
    "runGeneration",
    "runtime",
    "schema",
  ], "post-support wild identity");
  const expectedRuntime = projectPostSupportHarnessRuntime(binding?.preflightRuntime);
  const observedRuntime = projectPostSupportHarnessRuntime(value?.runtime);
  const {
    chromiumInstallationTree: observedChromiumInstallationTree,
    ...observedPreflightRuntime
  } = observedRuntime;
  if (
    value.schema !== expectedIdentitySchema(evidenceEnvelope) ||
    value.protocol !== protocol ||
    !commitPattern.test(value.harnessCommit ?? "") ||
    !commitPattern.test(value.preregistrationCommit ?? "") ||
    value.harnessCommit !== binding?.harnessCommit ||
    value.preregistrationCommit !== binding?.preregistrationCommit ||
    value.corpusPath !== binding?.corpusPath ||
    value.corpusSha256 !== binding?.corpusSha256 ||
    value.preflightLedgerPath !== binding?.preflightLedgerPath ||
    value.preflightLedgerSha256 !== binding?.preflightLedgerSha256 ||
    !sha256Pattern.test(value.corpusSha256 ?? "") ||
    !sha256Pattern.test(value.preflightLedgerSha256 ?? "") ||
    typeof value.exactTrackedBytesVerified !== "boolean" ||
    !["default_verified_candidate_uninjected", "diagnostic_only"].includes(
      value.executionAuthority,
    ) ||
    observedChromiumInstallationTree === undefined ||
    !isDeepStrictEqual(observedPreflightRuntime, expectedRuntime) ||
    !isDeepStrictEqual(value.runtime, observedRuntime) ||
    !isDeepStrictEqual(value.candidate, projectWildCandidateIdentity(candidateIdentity)) ||
    !Array.isArray(binding?.corpus?.urls) ||
    binding.corpus.urls.length !== expectedSelectedCount
  ) {
    throw new Error("Post-support wild identity differs from its candidate or corpus binding");
  }
  assertReference(value.networkPolicySmoke, "network-policy smoke");
  if (value.networkPolicySmoke.path !== networkPolicySmokePath) {
    throw new Error("Post-support wild identity has the wrong smoke path");
  }
  assertReference(value.pairedStart, "paired start");
  if (value.pairedStart.path !== pairedStartPath) {
    throw new Error("Post-support wild identity has the wrong paired-start path");
  }
  assertWildRunGeneration(value.runGeneration, root);
  return binding.corpus.urls;
}

function assertReplayIdentity(
  value,
  {
    candidateIdentity,
    corpus,
    corpusPath,
    corpusSha256,
    harnessRevision,
    preflightLedger,
    preflightLedgerPath,
    preflightLedgerSha256,
    requireFrozenCorpusIdentity,
  },
  evidenceEnvelope,
) {
  assertCandidateIdentity(candidateIdentity);
  assertExactKeys(value, [
    "candidate",
    "corpusPath",
    "corpusSha256",
    "exactTrackedBytesVerified",
    "executionAuthority",
    "harnessCommit",
    "networkPolicySmoke",
    "pairedStart",
    "preflightLedgerPath",
    "preflightLedgerSha256",
    "preregistrationCommit",
    "protocol",
    "runGeneration",
    "runtime",
    "schema",
  ], "post-support wild replay identity");
  const expectedPreflightPath = preflightLedgerPath;
  const expectedPreregistrationCommit = requireFrozenCorpusIdentity
    ? corpus?.preregistrationCommit
    : preflightLedger?.preregistrationCommit;
  const expectedRuntime = projectPostSupportHarnessRuntime(preflightLedger?.runtime);
  const observedRuntime = projectPostSupportHarnessRuntime(value?.runtime);
  const {
    chromiumInstallationTree: observedChromiumInstallationTree,
    ...observedPreflightRuntime
  } = observedRuntime;
  if (
    value.schema !== expectedIdentitySchema(evidenceEnvelope) ||
    value.protocol !== protocol ||
    !Array.isArray(corpus?.urls) ||
    corpus.urls.length !== expectedSelectedCount ||
    (requireFrozenCorpusIdentity && (
      corpus?.schema !== "stasis-wild-corpus-v1" ||
      corpus?.protocol !== protocol ||
      corpus?.count !== expectedSelectedCount
    )) ||
    preflightLedger?.schema !== "stasis-wild-preflight-ledger-v2" ||
    preflightLedger?.protocol !== protocol ||
    preflightLedger?.preregistrationCommit !== expectedPreregistrationCommit ||
    !commitPattern.test(harnessRevision ?? "") ||
    !sha256Pattern.test(corpusSha256 ?? "") ||
    !sha256Pattern.test(preflightLedgerSha256 ?? "") ||
    typeof preflightLedgerPath !== "string" ||
    typeof corpusPath !== "string" ||
    (requireFrozenCorpusIdentity && (
      corpusPath !== replayCorpusIdentity.path ||
      corpusSha256 !== replayCorpusIdentity.sha256 ||
      corpus.preregistrationCommit !== replayCorpusIdentity.preregistrationCommit ||
      expectedPreflightPath !== replayCorpusIdentity.preflightLedgerPath ||
      preflightLedgerSha256 !== replayCorpusIdentity.preflightLedgerSha256
    )) ||
    value.harnessCommit !== harnessRevision ||
    value.corpusPath !== corpusPath ||
    value.corpusSha256 !== corpusSha256 ||
    value.preregistrationCommit !== expectedPreregistrationCommit ||
    value.preflightLedgerPath !== expectedPreflightPath ||
    value.preflightLedgerSha256 !== preflightLedgerSha256 ||
    (requireFrozenCorpusIdentity &&
      preflightLedgerSha256 !== corpus?.selection?.preflightLedgerSha256) ||
    (requireFrozenCorpusIdentity && value.exactTrackedBytesVerified !== true) ||
    (requireFrozenCorpusIdentity &&
      value.executionAuthority !== "default_verified_candidate_uninjected") ||
    !isDeepStrictEqual(value.candidate, projectWildCandidateIdentity(candidateIdentity)) ||
    observedChromiumInstallationTree === undefined ||
    !isDeepStrictEqual(observedPreflightRuntime, expectedRuntime)
  ) {
    throw new Error(
      "Post-support wild replay identity differs from the tracked corpus or public harness revision",
    );
  }
  assertReplayRunGeneration(value.runGeneration);
  assertReference(value.networkPolicySmoke, "network-policy smoke");
  if (value.networkPolicySmoke.path !== networkPolicySmokePath) {
    throw new Error("Post-support wild replay identity has the wrong smoke path");
  }
  assertReference(value.pairedStart, "paired start");
  if (value.pairedStart.path !== pairedStartPath) {
    throw new Error("Post-support wild replay identity has the wrong paired-start path");
  }
  return corpus.urls;
}

function assertReplayRunGeneration(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Post-support wild replay generation has an invalid shape");
  }
  assertExactKeys(value, [
    "artifactRootPathSha256",
    "nonceSha256",
    "schema",
  ], "post-support wild replay generation");
  if (
    value.schema !== "stasis-wild-run-generation-v1" ||
    !sha256Pattern.test(value.nonceSha256 ?? "") ||
    !sha256Pattern.test(value.artifactRootPathSha256 ?? "")
  ) {
    throw new Error("Post-support wild replay generation has an invalid shape");
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
  ], "post-support paired start");
  if (
    value.schema !== "stasis-wild-paired-start-v1" ||
    value.protocol !== protocol ||
    !sha256Pattern.test(value.nonceSha256 ?? "") ||
    value.startedAt !== index.startedAt ||
    !isDeepStrictEqual(value.networkPolicySmoke, index.identity.networkPolicySmoke) ||
    !isDeepStrictEqual(value.runGeneration, index.identity.runGeneration)
  ) {
    throw new Error("Post-support paired-start claim differs from the index generation");
  }
  assertRunTimes(value.startedAt, index.completedAt, "paired run");
}

function assertCaseReferences(index, entries) {
  const paths = new Set([index.summary.path, index.identity.pairedStart.path]);
  for (let offset = 0; offset < index.cases.length; offset += 1) {
    const slot = offset + 1;
    const item = index.cases[offset];
    assertExactKeys(item, ["rank", "records", "slot"], `slot ${slot} artifact reference`);
    const expectedPaths = caseRecordPaths(slot);
    if (
      item.slot !== slot ||
      item.rank !== entries[offset]?.rank ||
      !Array.isArray(item.records) ||
      item.records.length !== 5
    ) {
      throw new Error(`Post-support wild case reference is reordered at slot ${slot}`);
    }
    for (let recordOffset = 0; recordOffset < 5; recordOffset += 1) {
      const reference = item.records[recordOffset];
      assertReference(reference, `slot ${slot} record ${recordOffset + 1}`);
      if (reference.path !== expectedPaths[recordOffset] || paths.has(reference.path)) {
        throw new Error(`Post-support wild case has a duplicate or unexpected path at slot ${slot}`);
      }
      paths.add(reference.path);
    }
  }
}

function caseRecordPaths(slot) {
  const prefix = String(slot).padStart(3, "0");
  return [
    `wild/raw/${prefix}-baseline-gate.json`,
    `wild/raw/${prefix}-baseline.json`,
    `wild/raw/${prefix}-stasis-gate.json`,
    `wild/raw/${prefix}-stasis.json`,
    `wild/cases/${prefix}-classification.json`,
  ];
}

function assertSummaryEnvelope(value, index, evidenceEnvelope) {
  assertExactKeys(value, [
    "completedAt",
    "identity",
    "protocol",
    "rules",
    "schema",
    "startedAt",
    "summary",
  ], "post-support wild summary");
  if (
    value.schema !== evidenceEnvelope.summarySchema ||
    value.protocol !== protocol ||
    value.startedAt !== index.startedAt ||
    value.completedAt !== index.completedAt ||
    !isDeepStrictEqual(value.identity, index.identity) ||
    !isDeepStrictEqual(value.rules, index.rules)
  ) {
    throw new Error("Post-support wild summary envelope differs from the index");
  }
  assertRunTimes(value.startedAt, value.completedAt, "wild summary");
}

function assertRawEnvelope(value, schema, payloadKey, entry, pairedRun, label) {
  assertExactKeys(value, ["entry", "pairedRun", "schema", payloadKey], label);
  if (
    value.schema !== schema ||
    !isDeepStrictEqual(value.entry, entry) ||
    !isDeepStrictEqual(value.pairedRun, pairedRun) ||
    typeof value[payloadKey] !== "object" ||
    value[payloadKey] === null ||
    Array.isArray(value[payloadKey])
  ) {
    throw new Error(`${label} differs from its exact raw envelope`);
  }
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

function assertStasisCandidateEvidence(
  observation,
  executableSha256,
  label,
  evidenceEnvelope,
) {
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
  assertCurrentUrlProjection(observation, evidenceEnvelope, label);
}

function assertCurrentUrlProjection(observation, evidenceEnvelope, label) {
  if (!hasValidOptionalCurrentUrl(observation, evidenceEnvelope)) {
    throw new Error(`${label} has an invalid current-URL evidence projection`);
  }
}

function hasValidOptionalCurrentUrl(observation, evidenceEnvelope) {
  const hasObservable = Object.hasOwn(observation, "currentUrlObservable");
  const hasIdentity = Object.hasOwn(observation, "currentUrlIdentity");
  if (evidenceEnvelope === legacyWildEvidenceEnvelope) {
    return !hasIdentity && (!hasObservable || observation.currentUrlObservable === false);
  }
  if (!hasObservable) return !hasIdentity;
  if (observation.currentUrlObservable === false) return !hasIdentity;
  return observation.currentUrlObservable === true &&
    hasIdentity &&
    sha256Pattern.test(observation.currentUrlIdentity ?? "");
}

function hasRequiredSettledCurrentUrl(observation, evidenceEnvelope) {
  return evidenceEnvelope === legacyWildEvidenceEnvelope
    ? observation.currentUrlObservable === false &&
      !Object.hasOwn(observation, "currentUrlIdentity")
    : observation.currentUrlObservable === true &&
      sha256Pattern.test(observation.currentUrlIdentity ?? "");
}

function assertOrganicStasisEvidence(
  observation,
  entry,
  classification,
  executableSha256,
  evidenceEnvelope,
) {
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
      ...(evidenceEnvelope === currentUrlWildEvidenceEnvelope ? ["currentUrlIdentity"] : []),
      "openCommittedUrlIdentity",
      "requestedUrl",
      "settlement",
      "status",
      "wallTimeMs",
    ], label);
    if (
      !hasRequiredSettledCurrentUrl(observation, evidenceEnvelope) ||
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
    if (Object.hasOwn(observation, "currentUrlIdentity")) optional.push("currentUrlIdentity");
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
      !hasValidOptionalCurrentUrl(observation, evidenceEnvelope)
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

function assertSuccessfulStasisEvidence(
  observation,
  entry,
  executableSha256,
  evidenceEnvelope,
) {
  const label = `slot ${entry.slot} successful Stasis observation`;
  assertExactKeys(observation, [
    "audit",
    "candidateExecutableSha256",
    "cleanup",
    "code",
    "currentUrlObservable",
    ...(evidenceEnvelope === currentUrlWildEvidenceEnvelope ? ["currentUrlIdentity"] : []),
    "extraction",
    "openCommittedUrlIdentity",
    "requestedUrl",
    "settlement",
    "status",
    "wallTimeMs",
  ], label);
  if (
    observation.code !== "extracted" ||
    observation.requestedUrl !== entry.requestedUrl ||
    observation.candidateExecutableSha256 !== executableSha256 ||
    !hasRequiredSettledCurrentUrl(observation, evidenceEnvelope) ||
    !sha256Pattern.test(observation.openCommittedUrlIdentity ?? "") ||
    typeof observation.wallTimeMs !== "number" ||
    !Number.isFinite(observation.wallTimeMs) ||
    observation.wallTimeMs < 0
  ) {
    throw new Error(`${label} lacks its exact candidate, URL, or bounded-time evidence`);
  }
  assertCompleteSafeAudit(observation.audit, label);
  assertProjectedSettlement(observation.settlement, label);
  if (!new Set(["quiescent", "quiescent_with_persistent_work"]).has(observation.settlement.outcome)) {
    throw new Error(`${label} does not carry one crawlable settlement outcome`);
  }
  assertCleanupEvidence(observation.cleanup, label);
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
  if (Object.hasOwn(settlement, "failureCode")) {
    assertBoundedCode(settlement.failureCode, 128, `${label} failureCode`);
  }
  if (Object.hasOwn(settlement, "limitKind")) {
    assertBoundedCode(settlement.limitKind, 64, `${label} limitKind`);
  }
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

function assertCanonicalEntry(entry, slot) {
  assertExactKeys(entry, [
    "domain",
    "permutationIndex",
    "rank",
    "requestedUrl",
    "slot",
    "stratumId",
    "stratumSlot",
  ], `corpus entry ${slot}`);
  const stratum = strata.find((item) => item.id === entry.stratumId);
  let url;
  try {
    url = new URL(entry.requestedUrl);
  } catch {
    throw new Error(`Post-support corpus entry ${slot} has an invalid URL`);
  }
  if (
    entry.slot !== slot ||
    stratum === undefined ||
    !Number.isSafeInteger(entry.rank) ||
    entry.rank < stratum.minRank ||
    entry.rank > stratum.maxRank ||
    !Number.isSafeInteger(entry.stratumSlot) ||
    entry.stratumSlot < 1 ||
    entry.stratumSlot > stratum.quota ||
    !Number.isSafeInteger(entry.permutationIndex) || entry.permutationIndex < 0 ||
    typeof entry.stratumId !== "string" ||
    entry.requestedUrl !== `https://${entry.domain}/` ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname !== entry.domain ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`Post-support corpus entry ${slot} is not one canonical HTTPS root`);
  }
}

function assertAggregateCounts(summary, evidenceEnvelope) {
  const primaryTotal = sumCounts(summary?.primaryCounts);
  const extractionTotal = sumCounts(summary?.extractionCounts);
  const currentUrlTotal = Object.hasOwn(summary ?? {}, "currentUrlCounts")
    ? sumCounts(summary.currentUrlCounts)
    : 0;
  if (
    summary?.selectedCount !== expectedSelectedCount ||
    primaryTotal !== expectedSelectedCount ||
    !Number.isSafeInteger(summary?.baselineExcluded) ||
    !Number.isSafeInteger(summary?.stasisAttempted) ||
    !Number.isSafeInteger(summary?.validPairedDenominator) ||
    !Number.isSafeInteger(summary?.diagnosedOrganicBlockerCount) ||
    summary.organicBlockerDenominator !== summary.diagnosedOrganicBlockerCount ||
    extractionTotal > expectedSelectedCount ||
    currentUrlTotal > expectedSelectedCount ||
    (evidenceEnvelope === currentUrlWildEvidenceEnvelope && (
      currentUrlTotal !== extractionTotal ||
      (summary.sdkGapCounts.current_url_observability ?? 0) !== 0
    ))
  ) {
    throw new Error("Post-support wild aggregate counts are inconsistent");
  }
}

function assertAggregateInvariants(summary, cases, evidenceEnvelope) {
  if (!Array.isArray(summary.organicRootClusters)) {
    throw new Error("Post-support aggregate must use the v4 causal-cluster array");
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
    throw new Error("Post-support causal clusters must be sorted and unique");
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
  const successfulCases = cases.filter((item) => item.stasis.status === "success");
  const currentUrlCountKeys = Object.keys(summary.currentUrlCounts ?? {});
  const currentUrlTotal = Object.hasOwn(summary, "currentUrlCounts")
    ? sumCounts(summary.currentUrlCounts)
    : 0;
  const extractionTotal = sumCounts(summary.extractionCounts);
  const invalidCurrentUrlAggregate = evidenceEnvelope === currentUrlWildEvidenceEnvelope && (
    currentUrlCountKeys.some((key) => !["equivalent", "divergent"].includes(key)) ||
    currentUrlTotal !== successfulCases.length ||
    extractionTotal !== successfulCases.length ||
    successfulCases.some((item) =>
      item.classification.primary === "SDK_GAP" ||
      !["equivalent", "divergent"].includes(item.classification.currentUrl?.outcome)
    )
  );
  if (
    blockerSum !== summary.diagnosedOrganicBlockerCount ||
    summary.organicBlockerDenominator !== summary.diagnosedOrganicBlockerCount ||
    treeCases.length !== treeCount ||
    treeOrigins.size !== treeCount ||
    (summary.organicIndependentOriginCounts.browsing_context_tree !== undefined &&
      summary.organicIndependentOriginCounts.browsing_context_tree !== treeCount) ||
    treeStratumSum !== treeCount ||
    clusterSum !== summary.diagnosedOrganicBlockerCount ||
    invalidCurrentUrlAggregate
  ) {
    throw new Error("Post-support aggregate violates blocker, tree-origin, stratum, or cluster invariants");
  }
}

async function assertStablePostflight({
  root,
  index,
  indexSha256,
  indexedReferences,
  expectedInventory,
  binding,
  candidateIdentity,
  verifiedCandidate,
  loadBinding,
  observeHarnessRuntime,
}) {
  const expectedHashes = new Map(indexedReferences.map((reference) => [reference.path, reference.sha256]));
  for (const [relativePath, expectedSha256] of expectedHashes) {
    const absolutePath = resolveExactPath(root, relativePath);
    if (await sha256File(absolutePath) !== expectedSha256) {
      throw new Error(`Post-support wild artifact changed during verification: ${relativePath}`);
    }
  }
  if (!isDeepStrictEqual(await listArtifactTreeEntries(root), expectedInventory)) {
    throw new Error("Post-support wild artifact inventory changed during verification");
  }
  const finalIndex = await readCanonicalJson(path.join(root, "wild", "artifact-index.json"));
  if (finalIndex.sha256 !== indexSha256 || !isDeepStrictEqual(finalIndex.value, index)) {
    throw new Error("Post-support wild index changed during verification");
  }
  const finalSmoke = await readVerifiedPostSupportWildNetworkSmoke({
    binding,
    verifiedCandidate,
    root,
    expectedReference: index.identity.networkPolicySmoke,
  });
  assertDeepEqual(
    finalSmoke.value.runGeneration,
    index.identity.runGeneration,
    "Post-support smoke generation changed during verification",
  );
  const finalBinding = await loadBinding({
    expectedCommit: index.identity.harnessCommit,
    expectedCorpusSha256: index.identity.corpusSha256,
  });
  assertIdentity(
    index.identity,
    { binding: finalBinding, candidateIdentity, root },
    assertIndexShape(index),
  );
  const observedRuntime = await observeHarnessRuntime();
  assertObservedPostSupportHarnessRuntime(
    projectPostSupportHarnessRuntime(observedRuntime),
    index.identity.runtime,
    "Post-support stable postflight harness runtime",
  );
}

function completeInventory(index) {
  return [
    "dir:wild",
    "dir:wild/cases",
    "dir:wild/raw",
    `file:${networkPolicySmokePath}`,
    "file:wild/artifact-index.json",
    `file:${index.identity.pairedStart.path}`,
    `file:${index.summary.path}`,
    ...index.cases.flatMap((item) => item.records.map((record) => `file:${record.path}`)),
  ].sort();
}

async function listArtifactTreeEntries(root) {
  const found = [];
  async function visit(relativeDirectory) {
    const absolute = path.join(root, ...relativeDirectory.split("/").filter(Boolean));
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relative = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        found.push(`dir:${relative}`);
        await visit(relative);
      } else if (entry.isFile()) {
        found.push(`file:${relative}`);
      } else {
        throw new Error(`Post-support wild artifact tree contains a non-regular entry: ${relative}`);
      }
    }
  }
  await visit("");
  return found.sort();
}

async function readIndexedJson(root, reference, expectedPath) {
  assertReference(reference, expectedPath);
  if (reference.path !== expectedPath) {
    throw new Error(`Post-support wild reference differs from exact path: ${expectedPath}`);
  }
  const record = await readCanonicalJson(resolveExactPath(root, reference.path));
  if (record.sha256 !== reference.sha256) {
    throw new Error(`Post-support wild artifact hash mismatch: ${expectedPath}`);
  }
  return record;
}

async function readCanonicalJson(absolutePath) {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(absolutePath), absolutePath)) {
    throw new Error(`Post-support wild artifact is not one real file: ${absolutePath}`);
  }
  const bytes = await readFile(absolutePath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Post-support wild artifact is not JSON: ${absolutePath}`);
  }
  if (!bytes.equals(Buffer.from(serializeWildArtifact(value), "utf8"))) {
    throw new Error(`Post-support wild artifact is not canonical: ${absolutePath}`);
  }
  assertPostSupportArtifactPrivacy(value);
  return { value, sha256: sha256(bytes) };
}

function resolveExactPath(root, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.startsWith("/") ||
    relativePath.split("/").includes("..")
  ) {
    throw new Error("Post-support wild artifact reference is not one canonical relative path");
  }
  const absolute = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, absolute);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Post-support wild artifact reference escapes its root");
  }
  return absolute;
}

async function assertExplicitRealDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  const root = path.resolve(value);
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(root), root)) {
    throw new Error(`${label} must be one real directory`);
  }
  return root;
}

async function assertRealChildDirectory(root, child) {
  const value = path.join(root, child);
  const metadata = await lstat(value);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(value), value)) {
    throw new Error(`Post-support wild ${child} lane must be one real directory`);
  }
  return value;
}

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    process.version !== postSupportNodeVersion ||
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile
  ) {
    throw new TypeError("Post-support verifier requires one candidate on pinned Node");
  }
  return identity;
}

function assertReference(value, label) {
  assertExactKeys(value, ["path", "sha256"], `${label} reference`);
  if (typeof value.path !== "string" || !sha256Pattern.test(value.sha256 ?? "")) {
    throw new Error(`Post-support wild ${label} reference is invalid`);
  }
}

function assertExactKeys(value, expected, label) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())
  ) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
}

function assertRunTimes(startedAt, completedAt, label) {
  const start = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (
    typeof startedAt !== "string" ||
    typeof completedAt !== "string" ||
    !Number.isFinite(start) ||
    !Number.isFinite(completed) ||
    new Date(start).toISOString() !== startedAt ||
    new Date(completed).toISOString() !== completedAt ||
    completed < start
  ) {
    throw new Error(`Post-support wild ${label} timestamps are invalid`);
  }
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

function assertDeepEqual(actual, expected, message) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
