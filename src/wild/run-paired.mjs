import {
  candidate,
  evidenceIdentity,
  expectedVersions,
  protocol,
  repairedRerunIdentity,
} from "./config.mjs";
import {
  claimFreshWildArtifactLane,
  createCaseArtifactWriter,
  writeWildSummaryAndIndex,
} from "./artifacts.mjs";
import { assertFrozenWildBinding } from "./binding.mjs";
import {
  assertSmokePrecedesPairedRun,
  readVerifiedNetworkPolicySmoke,
} from "./network-policy-smoke.mjs";
import { runPairedCases } from "./paired.mjs";
import { assertRepairedRerunIdentity } from "./rerun-identity.mjs";
import { assertHostedCandidate } from "./stasis-observation.mjs";
import {
  assertMatchesPreflightRuntime,
  readAndVerifyWildRuntimeIdentity,
} from "./runtime-identity.mjs";

if (process.version !== expectedVersions.node) {
  throw new Error(`Node runtime mismatch: expected ${expectedVersions.node}, got ${process.version}`);
}

const executablePath = process.env.STASIS_EXECUTABLE;
const [binding, executableSha256, runtimeIdentity] = await Promise.all([
  assertFrozenWildBinding(),
  assertHostedCandidate(executablePath),
  readAndVerifyWildRuntimeIdentity(),
]);
assertMatchesPreflightRuntime(runtimeIdentity, binding.preflightRuntime);
await assertRepairedRerunIdentity();
const networkPolicySmoke = await readVerifiedNetworkPolicySmoke({
  binding,
  executableSha256,
  runtimeIdentity,
});
const startedAt = new Date().toISOString();
assertSmokePrecedesPairedRun(networkPolicySmoke.value, startedAt);
const runGeneration = Object.freeze({ ...networkPolicySmoke.value.runGeneration });
const pairedStart = await claimFreshWildArtifactLane({
  runGeneration,
  networkPolicySmoke: networkPolicySmoke.reference,
  startedAt,
  protocol,
});
const result = await runPairedCases(binding.corpus.urls, {
  executablePath,
  persistCase: createCaseArtifactWriter(pairedStart.value),
});
const identity = {
  protocol,
  harnessCommit: binding.harnessCommit,
  preregistrationCommit: binding.preregistrationCommit,
  corpusPath: binding.corpusPath,
  corpusSha256: binding.corpusSha256,
  preflightLedgerPath: binding.preflightLedgerPath,
  preflightLedgerSha256: binding.preflightLedgerSha256,
  node: process.version,
  runtime: runtimeIdentity,
  networkPolicySmoke: networkPolicySmoke.reference,
  pairedStart: pairedStart.reference,
  runGeneration,
  rerun: repairedRerunIdentity,
  stasisRevision: candidate.revision,
  stasisVersion: candidate.version,
  stasisProfile: candidate.profile,
  stasisExecutableSha256: executableSha256,
  stasisSdkArchiveSha256: runtimeIdentity.candidateSdkTarballSha256,
  stasisSdkTree: runtimeIdentity.candidateSdkTree,
};
const rules = {
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
};
const artifacts = await writeWildSummaryAndIndex({
  identity,
  rules,
  cases: result.cases,
  summary: result.summary,
  startedAt,
});
console.log(JSON.stringify({ ...artifacts, summary: result.summary }));
