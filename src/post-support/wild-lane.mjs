import { isDeepStrictEqual } from "node:util";

import { assertWildArtifactPrivacy } from "../wild/artifact-privacy.mjs";
import {
  claimFreshWildArtifactLane,
  createCaseArtifactWriter,
  currentUrlWildArtifactSchemas,
  writeWildSummaryAndIndex,
} from "../wild/artifacts.mjs";
import { assertFrozenWildBinding } from "../wild/binding.mjs";
import { protocol } from "../wild/config.mjs";
import { aggregateWildClassifications } from "../wild/classification.mjs";
import { assertSmokePrecedesPairedRun } from "../wild/network-policy-smoke.mjs";
import { runPairedCases } from "../wild/paired.mjs";
import { currentUrlWildPairedRules } from "../wild/result-verifier.mjs";
import {
  assertAuthoritativePostSupportCandidate,
  assertCandidateIdentity,
  postSupportExecutablePath,
  postSupportNodeVersion,
  postSupportProfile,
} from "./candidate-identity.mjs";
import { assertPostSupportArtifactPrivacy } from "./artifact-privacy.mjs";
import { runPostSupportWildObservation } from "./wild-observation.mjs";
import { projectWildCandidateIdentity } from "./wild-identity.mjs";
import { readVerifiedPostSupportWildNetworkSmoke } from "./wild-network-smoke.mjs";

export { projectWildCandidateIdentity } from "./wild-identity.mjs";

export const postSupportWildSchema = "stasis-post-support-wild-paired-v2";
export const postSupportWildArtifactSchema = "stasis-post-support-wild-artifacts-v2";
const defaultWildProofDependencies = Object.freeze({});

export async function runPostSupportWildProof(
  verifiedCandidate,
  dependencies = defaultWildProofDependencies,
) {
  const authoritativeExecution = dependencies === defaultWildProofDependencies;
  if (authoritativeExecution) assertAuthoritativePostSupportCandidate(verifiedCandidate);
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const loadBinding = dependencies.loadBinding ?? assertFrozenWildBinding;
  const authoritativeBinding = loadBinding === assertFrozenWildBinding;
  if (!authoritativeBinding && dependencies.allowNonAuthoritativeBindingForTests !== true) {
    throw new Error("Post-support wild artifact proof requires the authoritative clean repository binding");
  }
  const binding = await loadBinding();
  if (!Array.isArray(binding?.corpus?.urls) || binding.corpus.urls.length !== 100) {
    throw new Error("Post-support wild artifact proof requires all 100 exact frozen corpus entries");
  }
  const smoke = await readVerifiedPostSupportWildNetworkSmoke({
    binding,
    verifiedCandidate,
    ...(dependencies.artifactRoot === undefined ? {} : { root: dependencies.artifactRoot }),
  });
  const expectedExecutionAuthority = authoritativeExecution
    ? "default_verified_candidate_uninjected"
    : "diagnostic_only";
  if (smoke.value.executionAuthority !== expectedExecutionAuthority) {
    throw new Error("Post-support wild smoke and paired execution authority differ");
  }
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  assertSmokePrecedesPairedRun(smoke.value, startedAt);
  const runGeneration = Object.freeze({ ...smoke.value.runGeneration });
  const pairedStart = await claimFreshWildArtifactLane({
    runGeneration,
    networkPolicySmoke: smoke.reference,
    startedAt,
    protocol,
  });
  const persistCase = createCaseArtifactWriter(
    pairedStart.value,
    currentUrlWildArtifactSchemas,
  );
  const paired = await runPostSupportWildPairedCases(binding.corpus.urls, verifiedCandidate, {
    ...dependencies,
    persistCase: async (item) => {
      assertPostSupportArtifactPrivacy(item);
      return persistCase(item);
    },
  });
  const artifactIdentity = createPostSupportWildArtifactIdentity({
    binding,
    candidate: identity,
    runtime: smoke.value.runtime,
    networkPolicySmoke: smoke.reference,
    pairedStart: pairedStart.reference,
    runGeneration,
    exactTrackedBytesVerified: authoritativeBinding,
    executionAuthority: expectedExecutionAuthority,
  });
  assertPostSupportArtifactPrivacy({
    identity: artifactIdentity,
    rules: currentUrlWildPairedRules,
    cases: paired.cases,
    summary: paired.summary,
    startedAt,
  });
  const artifacts = await writeWildSummaryAndIndex({
    identity: artifactIdentity,
    rules: currentUrlWildPairedRules,
    cases: paired.cases,
    summary: paired.summary,
    startedAt,
    schemas: currentUrlWildArtifactSchemas,
  });
  const result = {
    schema: postSupportWildArtifactSchema,
    protocol,
    authority: "requires_separate_quiescent_postflight_verification",
    candidate: projectWildCandidateIdentity(identity),
    artifactIndex: artifacts.indexPath,
    summaryArtifact: artifacts.summaryPath,
    caseCount: paired.cases.length,
    rawRecordCount: paired.cases.reduce(
      (total, item) => total + (item.artifactRecord?.records?.length ?? 0),
      0,
    ),
    summary: paired.summary,
  };
  if (result.caseCount !== 100 || result.rawRecordCount !== 500) {
    throw new Error("Post-support wild artifact proof did not persist exactly 100 cases and 500 records");
  }
  assertWildArtifactPrivacy(result);
  assertPostSupportArtifactPrivacy(result);
  return result;
}

export async function runPostSupportWildDiagnostic(verifiedCandidate, dependencies = {}) {
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const loadBinding = dependencies.loadBinding ?? assertFrozenWildBinding;
  const binding = await loadBinding();
  if (!Array.isArray(binding?.corpus?.urls) || binding.corpus.urls.length !== 100) {
    throw new Error("Post-support wild proof requires all 100 exact frozen corpus entries");
  }
  const paired = await runPostSupportWildPairedCases(
    binding.corpus.urls,
    verifiedCandidate,
    dependencies,
  );
  const result = {
    schema: postSupportWildSchema,
    protocol,
    candidate: projectWildCandidateIdentity(identity),
    corpusBinding: {
      harnessCommit: binding.harnessCommit,
      preregistrationCommit: binding.preregistrationCommit,
      corpusSha256: binding.corpusSha256,
      preflightLedgerSha256: binding.preflightLedgerSha256,
      selectedCount: binding.corpus.urls.length,
      exactTrackedBytesVerified: true,
    },
    rules: currentUrlWildPairedRules,
    caseCount: paired.cases.length,
    ...(paired.cases.every((item) => item.artifactRecord !== undefined)
      ? { caseArtifacts: paired.cases.map((item) => item.artifactRecord) }
      : {}),
    summary: paired.summary,
  };
  assertPostSupportWildResult(result, identity, binding.corpus.urls, paired.cases);
  return result;
}

export function createPostSupportWildArtifactIdentity({
  binding,
  candidate,
  runtime,
  networkPolicySmoke,
  pairedStart,
  runGeneration,
  exactTrackedBytesVerified,
  executionAuthority,
}) {
  assertCandidateIdentity(candidate);
  const value = {
    schema: "stasis-post-support-wild-artifact-identity-v2",
    protocol,
    harnessCommit: binding?.harnessCommit,
    preregistrationCommit: binding?.preregistrationCommit,
    corpusPath: binding?.corpusPath,
    corpusSha256: binding?.corpusSha256,
    preflightLedgerPath: binding?.preflightLedgerPath,
    preflightLedgerSha256: binding?.preflightLedgerSha256,
    exactTrackedBytesVerified,
    executionAuthority,
    runtime,
    candidate: projectWildCandidateIdentity(candidate),
    networkPolicySmoke,
    pairedStart,
    runGeneration,
  };
  assertWildArtifactPrivacy(value);
  assertPostSupportArtifactPrivacy(value);
  return value;
}

export async function runPostSupportWildPairedCases(entries, verifiedCandidate, dependencies = {}) {
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const executablePath = postSupportExecutablePath(verifiedCandidate);
  const observe = dependencies.stasisObservation ?? runPostSupportWildObservation;
  return runPairedCases(entries, {
    executablePath,
    ...(dependencies.inspect === undefined ? {} : { inspect: dependencies.inspect }),
    ...(dependencies.robots === undefined ? {} : { robots: dependencies.robots }),
    ...(dependencies.baseline === undefined ? {} : { baseline: dependencies.baseline }),
    stasis: (entry) => observe(entry, verifiedCandidate, dependencies.observationDependencies),
    ...(dependencies.persistCase === undefined ? {} : { persistCase: dependencies.persistCase }),
  });
}

export function assertPostSupportWildResult(value, identity, frozenEntries, pairedCases) {
  const expectedCandidate = projectWildCandidateIdentity(identity);
  if (
    value?.schema !== postSupportWildSchema ||
    value?.protocol !== protocol ||
    !isDeepStrictEqual(value?.candidate, expectedCandidate) ||
    !/^[a-f0-9]{40}$/u.test(value?.corpusBinding?.harnessCommit ?? "") ||
    !/^[a-f0-9]{40}$/u.test(value?.corpusBinding?.preregistrationCommit ?? "") ||
    !/^[a-f0-9]{64}$/u.test(value?.corpusBinding?.corpusSha256 ?? "") ||
    !/^[a-f0-9]{64}$/u.test(value?.corpusBinding?.preflightLedgerSha256 ?? "") ||
    value?.corpusBinding?.exactTrackedBytesVerified !== true ||
    value?.corpusBinding?.selectedCount !== 100 ||
    value?.caseCount !== 100 ||
    !Array.isArray(frozenEntries) || frozenEntries.length !== 100 ||
    !Array.isArray(pairedCases) || pairedCases.length !== 100 ||
    pairedCases.some((item, index) =>
      item === null ||
      typeof item !== "object" ||
      !isDeepStrictEqual(item.entry, frozenEntries[index]) ||
      item.classification === null ||
      typeof item.classification !== "object"
    ) ||
    !isDeepStrictEqual(value?.summary, aggregateWildClassifications(pairedCases)) ||
    (value?.caseArtifacts !== undefined && (
      !Array.isArray(value.caseArtifacts) ||
      value.caseArtifacts.length !== 100 ||
      pairedCases.some((item, index) =>
        !isDeepStrictEqual(value.caseArtifacts[index], item.artifactRecord)
      )
    ))
  ) {
    throw new TypeError("Invalid post-support wild proof result");
  }
  assertWildArtifactPrivacy(value);
  return value;
}

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    process.version !== postSupportNodeVersion ||
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile ||
    typeof value?.sdk?.launch !== "function"
  ) {
    throw new TypeError("Wild lane requires one verified post-support candidate on pinned Node");
  }
  return identity;
}
