import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  origin,
  stasisNetwork,
} from "../crawl/corpus.mjs";
import {
  canonicalHttpUrl,
  serializeError,
} from "../shared/io.mjs";
import { assertCleanHarnessWorktreeEvidence } from "./harness-worktree.mjs";
import { linuxPerformanceCandidateIdentity } from "./linux-candidate.mjs";
import { assertLinuxEglRuntimeEvidence } from "./linux-egl-runtime.mjs";
import { assertCrawlPerformanceHostIdentity } from "./crawl.mjs";

export const navigationCausalHostRawSchema =
  "stasis-v0.3.3-navigation-causal-host-raw-v1";
export const navigationCausalProtocol =
  "stasis-v0.3.3-navigation-causal-experiment-v1";
export const navigationCausalTrack = "navigation-initial-open-one-variable";
export const navigationCausalHostOutcomeSchema =
  "stasis-v0.3.3-navigation-causal-host-outcome-v1";
export const navigationCausalWorkflowName =
  "Stasis v0.3.3 navigation causal experiment";

export const navigationCausalHostLanes = Object.freeze(["host-a", "host-b"]);
export const navigationCausalArms = Object.freeze(["A", "B"]);

const profile = "controlled-web-session-v2";
const nodeVersion = "v22.20.0";
const pairCount = 10;
const lifecycleOrder = Object.freeze([
  "processProtocolLaunch",
  "engineAndInitialOpen",
  "settle",
  "extract",
  "physicalClose",
]);
const crawlableOutcomes = new Set(["quiescent"]);
const canonicalUnsignedIntegerPattern = /^(?:0|[1-9][0-9]*)$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

const urls = deepFreeze({
  A: `${origin}/navigation-start`,
  B: `${origin}/navigation-final`,
  final: `${origin}/navigation-final`,
  link: `${origin}/leaf/navigation`,
});

const settlePolicy = Object.freeze({
  persistentWork: "report",
  maxVirtualTimeNs: 30_000_000_000n,
  maxControlTurns: 100_000n,
  wallIoTimeoutNs: 15_000_000_000n,
});

const extractionPlan = deepFreeze({
  rootSelector: "html",
  fields: [
    { name: "documentHtml", selector: "", read: "html" },
    { name: "title", selector: "title", read: "text" },
    { name: "statusText", selector: "#status", read: "text" },
    {
      name: "statusState",
      selector: "#status",
      read: "attribute",
      attribute: "data-state",
    },
    {
      name: "firstLink",
      selector: "a[href]",
      read: "resolved_url",
      attribute: "href",
    },
  ],
});

export const navigationCausalRules = deepFreeze({
  purpose: "one_variable_navigation_initial_open_causal_measurement",
  package: "@oxhq/stasis@0.3.3",
  profile,
  oneVariable: {
    name: "requested_url",
    armA: urls.A,
    armB: urls.B,
    allOtherRunnerInputsExact: true,
  },
  finalOracle: {
    url: urls.final,
    boundary: "controlled_ready",
    profile,
    settleOutcome: "quiescent",
    title: "navigation-final",
    statusText: "complete",
    statusState: "complete",
    firstLink: urls.link,
    exactDocumentHtmlEqualWithinEveryPair: true,
  },
  processOwnership: {
    freshNativeProcessPerObservation: true,
    sessionPool: false,
    processCache: false,
    gracefulTerminalOperation: "Session.close",
    runtimeCloseOnSuccessfulObservation: false,
  },
  hosts: {
    labels: ["ubuntu-22.04"],
    independentJobs: ["navigation-causal-host-a", "navigation-causal-host-b"],
    distinctBootDigestsRequired: true,
    statisticsCombinedAcrossHosts: false,
  },
  schedule: {
    correctnessWarmupsPerArmPerHost: 1,
    warmupsTimingEligible: false,
    adjacentPairsPerHost: pairCount,
    hostA: "AB_BA_repeated_5",
    hostB: "BA_AB_repeated_5",
  },
  lifecycle: {
    clock: "process.hrtime.bigint",
    unit: "nanoseconds",
    phases: lifecycleOrder,
    continuousNonOverlappingPartition: true,
    phaseSumMustEqualOuter: true,
  },
  effectRulePerHost: {
    exactCorrectEquivalentPairs: 10,
    minimumPositiveEngineAndInitialOpenDeltas: 9,
    positiveMedianEngineAndInitialOpenDelta: true,
    positiveMedianTotalDelta: true,
    minimumOpenDeltaDominatesAbsoluteCombinedOtherPhaseDeltas: 8,
  },
  replicatedEffectRule: "both_hosts_must_independently_meet_every_effect_rule",
  invalidObservationPolicy: "retain_then_fail_stop_without_retry",
  retries: false,
  sleeps: false,
  fallbacks: false,
  discardedObservations: false,
  pooling: "none",
  generalizedSpeedClaimAuthorized: false,
  implementationWorkAuthorized: false,
  decisionState: "STAY_0_4_UNASSIGNED",
});

export function navigationCausalPairOrder(hostLane, pairIndex) {
  assertHostLane(hostLane);
  if (!Number.isSafeInteger(pairIndex) || pairIndex < 1 || pairIndex > pairCount) {
    throw new TypeError("Navigation causal pair index must be 1 through 10");
  }
  const hostAOdd = hostLane === "host-a" && pairIndex % 2 === 1;
  const hostBEven = hostLane === "host-b" && pairIndex % 2 === 0;
  return Object.freeze(hostAOdd || hostBEven ? ["A", "B"] : ["B", "A"]);
}

export function navigationCausalWarmupOrder(hostLane) {
  assertHostLane(hostLane);
  return Object.freeze(hostLane === "host-a" ? ["A", "B"] : ["B", "A"]);
}

export function createNavigationCausalJob({
  hostLane,
  phase,
  arm,
  ordinal,
  pairIndex,
  position,
}) {
  assertHostLane(hostLane);
  assertArm(arm);
  if (phase !== "warmup" && phase !== "sample") {
    throw new TypeError("Navigation causal phase must be warmup or sample");
  }
  if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 22) {
    throw new TypeError("Navigation causal ordinal must be 1 through 22");
  }
  if (phase === "warmup") {
    if (pairIndex !== undefined || position !== undefined || ordinal > 2) {
      throw new TypeError("Navigation causal warmup identity is invalid");
    }
  } else if (
    !Number.isSafeInteger(pairIndex) || pairIndex < 1 || pairIndex > pairCount ||
    (position !== 1 && position !== 2) || ordinal < 3
  ) {
    throw new TypeError("Navigation causal sample identity is invalid");
  }
  return deepFreeze({
    hostLane,
    phase,
    arm,
    ordinal,
    ...(phase === "sample" ? { pairIndex, position } : {}),
    requestedUrl: urls[arm],
  });
}

export function createNavigationCausalIdentity({ hostLane, host, provenance, stasis }) {
  const value = structuredClone({ hostLane, host, provenance, stasis });
  assertNavigationCausalIdentity(value);
  return deepFreeze(value);
}

export function buildNavigationCausalStasisIdentity(verified, hostClassDigest, eglRuntime) {
  const identity = verified?.identity;
  const value = {
    runner: "stasis-direct-session-v0.3.3",
    nodeVersion: process.version,
    package: identity?.sdk?.package,
    sdkVersion: identity?.version,
    revision: identity?.revision,
    profile: identity?.profile,
    releaseTag: identity?.release?.tag,
    packageQualificationRunId: String(identity?.packageQualification?.runId ?? ""),
    packageQualificationRunAttempt: String(identity?.packageQualification?.runAttempt ?? ""),
    sdkArchiveSha256: identity?.sdk?.archive?.sha256,
    executableSha256: identity?.linux?.executable?.sha256,
    runtimeManifestSha256: identity?.release?.runtimeManifest?.sha256,
    eglRuntime: structuredClone(assertLinuxEglRuntimeEvidence(eglRuntime)),
    hostClassDigest,
  };
  assertStasisIdentity(value);
  return deepFreeze(value);
}

export function createNavigationCausalProvenance(value) {
  const retained = structuredClone(value);
  assertNavigationCausalProvenance(retained, retained.hostLane);
  return deepFreeze(retained);
}

export function createStasisNavigationCausalRunner({
  sdk,
  sdkVersion,
  executablePath,
  environment = process.env,
  now = () => process.hrtime.bigint(),
}) {
  if (
    sdkVersion !== linuxPerformanceCandidateIdentity.version ||
    typeof sdk?.launch !== "function" ||
    sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== profile
  ) {
    throw new TypeError("Navigation causal runner requires the verified Stasis v0.3.3 SDK");
  }
  if (typeof executablePath !== "string" || executablePath.length === 0) {
    throw new TypeError("Navigation causal runner requires the verified native executable");
  }
  if (typeof now !== "function") throw new TypeError("A monotonic nanosecond clock is required");
  if (!isPlainRecord(environment)) throw new TypeError("The launch environment must be an object");
  const launchEnvironment = { ...environment };
  delete launchEnvironment.STASIS_LIFECYCLE_TRACE_V1;
  const network = deepFreeze(stasisNetwork());

  return async (job) => runOneObservation({
    job: assertNavigationCausalJob(job),
    sdk,
    executablePath,
    launchEnvironment,
    network,
    now,
  });
}

export async function runNavigationCausalHost({ identity, runner }) {
  const retainedIdentity = structuredClone(identity);
  assertNavigationCausalIdentity(retainedIdentity);
  if (typeof runner !== "function") throw new TypeError("Navigation causal runner is required");

  const raw = {
    schema: navigationCausalHostRawSchema,
    protocol: navigationCausalProtocol,
    track: navigationCausalTrack,
    purpose: navigationCausalRules.purpose,
    measurementEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    rules: structuredClone(navigationCausalRules),
    identity: retainedIdentity,
    warmups: [],
    pairs: [],
    statistics: null,
    authority: null,
  };

  let ordinal = 0;
  for (const arm of navigationCausalWarmupOrder(retainedIdentity.hostLane)) {
    const job = createNavigationCausalJob({
      hostLane: retainedIdentity.hostLane,
      phase: "warmup",
      arm,
      ordinal: ++ordinal,
    });
    const observation = await settleRunner(runner, job);
    raw.warmups.push(observation);
    if (!observationIsCorrect(observation)) return finalizeHostRaw(raw);
  }
  if (!compareObservationResults(raw.warmups[0], raw.warmups[1]).valid) {
    return finalizeHostRaw(raw);
  }

  for (let pairIndex = 1; pairIndex <= pairCount; pairIndex += 1) {
    const order = navigationCausalPairOrder(retainedIdentity.hostLane, pairIndex);
    const pair = {
      pairIndex,
      order: order.join(""),
      arms: [...order],
      observations: [],
      equivalence: { evaluated: false, valid: false, differingFields: [] },
      deltasNs: null,
    };
    raw.pairs.push(pair);
    for (let position = 0; position < 2; position += 1) {
      const arm = order[position];
      const job = createNavigationCausalJob({
        hostLane: retainedIdentity.hostLane,
        phase: "sample",
        arm,
        ordinal: ++ordinal,
        pairIndex,
        position: position + 1,
      });
      const observation = await settleRunner(runner, job);
      pair.observations.push(observation);
      if (!observationIsCorrect(observation)) return finalizeHostRaw(raw);
    }
    const byArm = Object.fromEntries(pair.observations.map((entry) => [entry.job.arm, entry]));
    pair.equivalence = compareObservationResults(byArm.A, byArm.B);
    if (!pair.equivalence.valid) return finalizeHostRaw(raw);
    pair.deltasNs = computePairDeltas(byArm.A, byArm.B);
  }
  return finalizeHostRaw(raw);
}

export function assertNavigationCausalHostRaw(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "schema",
    "protocol",
    "track",
    "purpose",
    "measurementEligible",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
    "decisionState",
    "rules",
    "identity",
    "warmups",
    "pairs",
    "statistics",
    "authority",
  ])) throw new TypeError("Invalid navigation causal host raw artifact");
  if (
    value.schema !== navigationCausalHostRawSchema ||
    value.protocol !== navigationCausalProtocol ||
    value.track !== navigationCausalTrack ||
    value.purpose !== navigationCausalRules.purpose ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    !isDeepStrictEqual(value.rules, navigationCausalRules)
  ) throw new TypeError("Navigation causal host boundary changed");
  assertNavigationCausalIdentity(value.identity);
  if (!Array.isArray(value.warmups) || value.warmups.length > 2) {
    throw new TypeError("Navigation causal warmup inventory is invalid");
  }
  const expectedWarmupOrder = navigationCausalWarmupOrder(value.identity.hostLane);
  value.warmups.forEach((observation, index) => {
    assertObservation(observation, createNavigationCausalJob({
      hostLane: value.identity.hostLane,
      phase: "warmup",
      arm: expectedWarmupOrder[index],
      ordinal: index + 1,
    }));
  });
  if (!Array.isArray(value.pairs) || value.pairs.length > pairCount) {
    throw new TypeError("Navigation causal pair inventory is invalid");
  }
  let expectedOrdinal = 3;
  value.pairs.forEach((pair, index) => {
    const pairIndex = index + 1;
    const order = navigationCausalPairOrder(value.identity.hostLane, pairIndex);
    if (!isPlainRecord(pair) || !hasExactKeys(pair, [
      "pairIndex", "order", "arms", "observations", "equivalence", "deltasNs",
    ]) || pair.pairIndex !== pairIndex || pair.order !== order.join("") ||
      !isDeepStrictEqual(pair.arms, order) || !Array.isArray(pair.observations) ||
      pair.observations.length > 2) {
      throw new TypeError("Navigation causal pair identity is invalid");
    }
    pair.observations.forEach((observation, position) => {
      assertObservation(observation, createNavigationCausalJob({
        hostLane: value.identity.hostLane,
        phase: "sample",
        arm: order[position],
        ordinal: expectedOrdinal++,
        pairIndex,
        position: position + 1,
      }));
    });
    const expectedPair = replayPair(pair);
    if (!isDeepStrictEqual(pair.equivalence, expectedPair.equivalence) ||
      !isDeepStrictEqual(pair.deltasNs, expectedPair.deltasNs)) {
      throw new TypeError("Navigation causal pair replay mismatch");
    }
  });
  const replay = replayHostConclusion(value);
  if (
    value.measurementEligible !== replay.authority.valid ||
    !isDeepStrictEqual(value.statistics, replay.statistics) ||
    !isDeepStrictEqual(value.authority, replay.authority)
  ) throw new TypeError("Navigation causal host conclusion does not replay");
  return value;
}

export function compareObservationResults(left, right) {
  const leftResult = comparableResult(left?.result);
  const rightResult = comparableResult(right?.result);
  const differingFields = [];
  for (const key of Object.keys(leftResult)) {
    if (!isDeepStrictEqual(leftResult[key], rightResult[key])) differingFields.push(key);
  }
  return {
    evaluated: true,
    valid: differingFields.length === 0,
    differingFields,
  };
}

export function computeNavigationCausalHostStatistics(pairs) {
  if (!Array.isArray(pairs) || pairs.length !== pairCount) {
    throw new TypeError("Navigation causal statistics require exactly 10 pairs");
  }
  const deltas = pairs.map((pair) => {
    const replay = replayPair(pair);
    if (!replay.equivalence.valid || replay.deltasNs === null) {
      throw new TypeError("Navigation causal statistics require exact equivalent pairs");
    }
    return replay.deltasNs;
  });
  const openPositive = deltas.filter(({ engineAndInitialOpen }) =>
    BigInt(engineAndInitialOpen) > 0n).length;
  const openDominates = deltas.filter(({ engineAndInitialOpen, combinedOtherPhases }) => {
    const open = BigInt(engineAndInitialOpen);
    const other = BigInt(combinedOtherPhases);
    return open > 0n && open > absBigInt(other);
  }).length;
  const medians = Object.fromEntries([
    "total",
    ...lifecycleOrder,
    "combinedOtherPhases",
  ].map((name) => [name, medianRational(deltas.map((entry) => BigInt(entry[name]))) ]));
  const criteria = {
    exactCorrectEquivalentPairs: pairCount,
    engineAndInitialOpenPositiveCount: openPositive,
    medianEngineAndInitialOpenPositive: BigInt(medians.engineAndInitialOpen.numerator) > 0n,
    medianTotalPositive: BigInt(medians.total.numerator) > 0n,
    openDominatesAbsoluteCombinedOtherPhaseCount: openDominates,
  };
  const ruleMet =
    criteria.exactCorrectEquivalentPairs === 10 &&
    criteria.engineAndInitialOpenPositiveCount >= 9 &&
    criteria.medianEngineAndInitialOpenPositive &&
    criteria.medianTotalPositive &&
    criteria.openDominatesAbsoluteCombinedOtherPhaseCount >= 8;
  return deepFreeze({
    pairing: "within_host_adjacent_only",
    pairCount,
    crossHostPooling: false,
    deltasNs: structuredClone(deltas),
    mediansNs: medians,
    criteria,
    effect: ruleMet ? "host_effect_rule_met" : "host_effect_rule_not_met",
  });
}

export function createNavigationCausalHostOutcome(raw) {
  assertNavigationCausalHostRaw(raw);
  const status = raw.authority.valid
    ? raw.statistics.effect === "host_effect_rule_met"
      ? "VALID_HOST_EFFECT"
      : "VALID_HOST_NO_EFFECT"
    : "INVALID_HOST_MEASUREMENT";
  return deepFreeze({
    schema: navigationCausalHostOutcomeSchema,
    protocol: navigationCausalProtocol,
    track: navigationCausalTrack,
    hostLane: raw.identity.hostLane,
    status,
    publishable: raw.authority.valid,
    workflowSuccess: raw.authority.valid,
    rawAuthorityCode: raw.authority.code,
    retriesOrReplacementAuthorized: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
}

export function assertNavigationCausalHostOutcome(value, raw) {
  const expected = createNavigationCausalHostOutcome(raw);
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError("Navigation causal host outcome does not replay from raw evidence");
  }
  return value;
}

async function runOneObservation({
  job,
  sdk,
  executablePath,
  launchEnvironment,
  network,
  now,
}) {
  const boundaries = [];
  const readBoundary = () => {
    const value = now();
    if (typeof value !== "bigint" || value < 0n ||
      (boundaries.length > 0 && value <= boundaries.at(-1))) {
      throw new TypeError("Navigation causal clock must increase at every boundary");
    }
    boundaries.push(value);
  };
  let runtime = null;
  let session = null;
  let result = null;
  let failure = null;
  let cleanup = { status: "not_started", mode: "none" };
  let stage = "processProtocolLaunch";
  try {
    readBoundary();
    runtime = await sdk.launch({
      executablePath,
      commandTimeoutMs: 30_000,
      env: { ...launchEnvironment },
    });
    readBoundary();
    stage = "engineAndInitialOpen";
    session = await runtime.openSession(job.requestedUrl, {
      profile,
      network,
    });
    const opened = {
      requestedUrl: canonicalHttpUrl(session.requestedUrl),
      finalUrl: canonicalHttpUrl(session.url),
      boundary: session.boundary,
      profile: session.profile,
    };
    readBoundary();
    stage = "settle";
    const settled = await session.settle(session.stateToken, settlePolicy);
    readBoundary();
    stage = "extract";
    const extracted = await session.extract(extractionPlan, settled.stateToken);
    result = projectResult(job, opened, settled, extracted);
    readBoundary();
    stage = "physicalClose";
    await session.close({ timeoutMs: 5_000 });
    readBoundary();
    cleanup = { status: "passed", mode: "graceful_session_close" };
  } catch (error) {
    failure = projectFailure(error, stage);
    if (session !== null && stage !== "physicalClose") {
      try {
        stage = "physicalClose";
        await session.close({ timeoutMs: 5_000 });
        readBoundary();
        cleanup = { status: "passed", mode: "graceful_session_close_after_failure" };
      } catch (closeError) {
        cleanup = {
          status: "failed",
          mode: "graceful_session_close_after_failure",
          error: projectFailure(closeError, "physicalClose"),
        };
      }
    } else if (session !== null) {
      cleanup = {
        status: "failed",
        mode: "graceful_session_close",
        error: failure,
      };
    }
    if (cleanup.status !== "passed" && runtime !== null) {
      try {
        await runtime.close();
        cleanup = {
          ...cleanup,
          failStopRuntimeClose: "passed",
        };
      } catch (closeError) {
        cleanup = {
          ...cleanup,
          failStopRuntimeClose: "failed",
          failStopError: projectFailure(closeError, "failStopRuntimeClose"),
        };
      }
    }
  }
  const complete = failure === null && cleanup.status === "passed" && boundaries.length === 6;
  const lifecycle = materializeLifecycle(boundaries, complete);
  const observation = {
    job: structuredClone(job),
    status: complete ? "completed" : "failed",
    timingEligible: complete && job.phase === "sample",
    lifecycle,
    result: complete ? result : null,
    oracle: complete ? validateResult(result, job) : {
      valid: false,
      reasons: ["observation_failed"],
    },
    cleanup,
    error: failure,
  };
  assertObservation(observation, job);
  return deepFreeze(observation);
}

function materializeLifecycle(boundaries, complete) {
  if (!complete) {
    return {
      status: "incomplete",
      order: lifecycleOrder,
      boundaryCount: boundaries.length,
      continuous: false,
      phaseSumEqualsOuter: false,
      outer: boundaries.length < 2 ? null : interval(boundaries[0], boundaries.at(-1)),
      phases: Object.fromEntries(lifecycleOrder.map((name, index) => [
        name,
        index + 1 < boundaries.length ? interval(boundaries[index], boundaries[index + 1]) : null,
      ])),
    };
  }
  const phases = Object.fromEntries(lifecycleOrder.map((name, index) => [
    name,
    interval(boundaries[index], boundaries[index + 1]),
  ]));
  const outer = interval(boundaries[0], boundaries[5]);
  const sum = Object.values(phases).reduce((total, phase) =>
    total + BigInt(phase.durationNs), 0n);
  return {
    status: "complete",
    order: lifecycleOrder,
    boundaryCount: boundaries.length,
    continuous: true,
    phaseSumEqualsOuter: sum === BigInt(outer.durationNs),
    outer,
    phases,
  };
}

function projectResult(job, opened, settled, extracted) {
  const rows = extracted?.rows;
  if (!Array.isArray(rows) || rows.length !== 1 || !Array.isArray(rows[0]?.fields)) {
    throw new TypeError("Navigation causal extraction must return exactly one document row");
  }
  const fields = Object.fromEntries(rows[0].fields.map(({ name, value }) => [name, value]));
  if (!hasExactKeys(fields, extractionPlan.fields.map(({ name }) => name))) {
    throw new TypeError("Navigation causal extraction field inventory changed");
  }
  return {
    requestedUrl: job.requestedUrl,
    sessionRequestedUrl: opened.requestedUrl,
    finalUrl: opened.finalUrl,
    boundary: opened.boundary,
    profile: opened.profile,
    settleOutcome: settled?.outcome,
    documentHtml: fields.documentHtml,
    title: fields.title,
    statusText: fields.statusText,
    statusState: fields.statusState,
    firstLink: fields.firstLink,
  };
}

function validateResult(result, job) {
  const reasons = [];
  if (!isPlainRecord(result)) return { valid: false, reasons: ["result_missing"] };
  const expected = navigationCausalRules.finalOracle;
  const checks = [
    ["requested_url", result.requestedUrl, job.requestedUrl],
    ["session_requested_url", result.sessionRequestedUrl, job.requestedUrl],
    ["final_url", result.finalUrl, expected.url],
    ["boundary", result.boundary, expected.boundary],
    ["profile", result.profile, expected.profile],
    ["settle_outcome", result.settleOutcome, expected.settleOutcome],
    ["title", result.title, expected.title],
    ["status_text", result.statusText, expected.statusText],
    ["status_state", result.statusState, expected.statusState],
    ["first_link", result.firstLink, expected.firstLink],
  ];
  for (const [name, actual, expectedValue] of checks) {
    if (actual !== expectedValue) reasons.push(`${name}_mismatch`);
  }
  if (typeof result.documentHtml !== "string" || result.documentHtml.length === 0) {
    reasons.push("document_html_missing");
  }
  return { valid: reasons.length === 0, reasons };
}

function assertObservation(value, expectedJob) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "job", "status", "timingEligible", "lifecycle", "result", "oracle", "cleanup", "error",
  ]) || !isDeepStrictEqual(value.job, expectedJob)) {
    throw new TypeError("Invalid navigation causal observation");
  }
  if (value.status === "completed") {
    if (
      value.timingEligible !== (expectedJob.phase === "sample") ||
      value.error !== null || value.cleanup?.status !== "passed" ||
      value.cleanup?.mode !== "graceful_session_close" ||
      !value.oracle?.valid || !isDeepStrictEqual(value.oracle, validateResult(value.result, expectedJob))
    ) throw new TypeError("Completed navigation causal observation is invalid");
    assertCompleteLifecycle(value.lifecycle);
  } else if (value.status === "failed") {
    if (value.timingEligible !== false || value.result !== null || value.oracle?.valid !== false ||
      !isPlainRecord(value.lifecycle) || value.lifecycle.status !== "incomplete" ||
      value.error === null) {
      throw new TypeError("Failed navigation causal observation is invalid");
    }
  } else {
    throw new TypeError("Unknown navigation causal observation status");
  }
  return value;
}

function assertCompleteLifecycle(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "status", "order", "boundaryCount", "continuous", "phaseSumEqualsOuter", "outer", "phases",
  ]) || value.status !== "complete" || value.boundaryCount !== 6 ||
    value.continuous !== true || value.phaseSumEqualsOuter !== true ||
    !isDeepStrictEqual(value.order, lifecycleOrder) ||
    !hasExactKeys(value.phases, lifecycleOrder)) {
    throw new TypeError("Navigation causal lifecycle is not a complete five-phase partition");
  }
  const outer = assertInterval(value.outer);
  let cursor = outer.start;
  let sum = 0n;
  for (const name of lifecycleOrder) {
    const phase = assertInterval(value.phases[name]);
    if (phase.start !== cursor) throw new TypeError("Navigation causal phase continuity changed");
    cursor = phase.end;
    sum += phase.duration;
  }
  if (cursor !== outer.end || sum !== outer.duration) {
    throw new TypeError("Navigation causal phases do not exactly partition the outer interval");
  }
}

function replayPair(pair) {
  if (!Array.isArray(pair?.observations) || pair.observations.length !== 2 ||
    pair.observations.some((entry) => !observationIsCorrect(entry))) {
    return {
      equivalence: { evaluated: false, valid: false, differingFields: [] },
      deltasNs: null,
    };
  }
  const byArm = Object.fromEntries(pair.observations.map((entry) => [entry.job.arm, entry]));
  const equivalence = compareObservationResults(byArm.A, byArm.B);
  return {
    equivalence,
    deltasNs: equivalence.valid ? computePairDeltas(byArm.A, byArm.B) : null,
  };
}

function computePairDeltas(armA, armB) {
  const delta = (left, right) => (BigInt(left) - BigInt(right)).toString(10);
  const phases = Object.fromEntries(lifecycleOrder.map((name) => [
    name,
    delta(
      armA.lifecycle.phases[name].durationNs,
      armB.lifecycle.phases[name].durationNs,
    ),
  ]));
  const combinedOther = lifecycleOrder
    .filter((name) => name !== "engineAndInitialOpen")
    .reduce((total, name) => total + BigInt(phases[name]), 0n);
  return {
    total: delta(armA.lifecycle.outer.durationNs, armB.lifecycle.outer.durationNs),
    ...phases,
    combinedOtherPhases: combinedOther.toString(10),
  };
}

function finalizeHostRaw(raw) {
  const replay = replayHostConclusion(raw);
  raw.statistics = replay.statistics;
  raw.authority = replay.authority;
  raw.measurementEligible = replay.authority.valid;
  assertNavigationCausalHostRaw(raw);
  return deepFreeze(raw);
}

function replayHostConclusion(raw) {
  const completeWarmups = raw.warmups.length === 2 &&
    raw.warmups.every(observationIsCorrect) &&
    compareObservationResults(raw.warmups[0], raw.warmups[1]).valid;
  const completePairs = raw.pairs.length === pairCount && raw.pairs.every((pair) => {
    const replay = replayPair(pair);
    return replay.equivalence.valid && replay.deltasNs !== null;
  });
  const valid = completeWarmups && completePairs;
  const statistics = valid ? computeNavigationCausalHostStatistics(raw.pairs) : null;
  const failure = valid ? null : firstFailure(raw);
  return {
    statistics,
    authority: {
      status: valid ? "valid" : "invalid",
      valid,
      code: valid ? "COMPLETE_CORRECT_EQUIVALENT_HOST_MEASUREMENT" : failure.code,
      firstInvalidOrdinal: failure?.ordinal ?? null,
      retriesOrReplacementAuthorized: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
  };
}

function firstFailure(raw) {
  const observations = [
    ...raw.warmups,
    ...raw.pairs.flatMap((pair) => pair.observations),
  ];
  const invalid = observations.find((entry) => !observationIsCorrect(entry));
  if (invalid !== undefined) {
    return { code: "OBSERVATION_INVALID", ordinal: invalid.job.ordinal };
  }
  const nonEquivalentWarmups = raw.warmups.length === 2 &&
    !compareObservationResults(raw.warmups[0], raw.warmups[1]).valid;
  if (nonEquivalentWarmups) return { code: "WARMUP_NOT_EQUIVALENT", ordinal: 2 };
  const pair = raw.pairs.find((entry) => entry.observations.length === 2 &&
    !replayPair(entry).equivalence.valid);
  if (pair !== undefined) {
    return {
      code: "PAIR_NOT_EQUIVALENT",
      ordinal: pair.observations[1]?.job?.ordinal ?? null,
    };
  }
  return { code: "MEASUREMENT_INCOMPLETE", ordinal: null };
}

function comparableResult(value) {
  if (!isPlainRecord(value)) return {};
  return {
    finalUrl: value.finalUrl,
    boundary: value.boundary,
    profile: value.profile,
    settleOutcome: value.settleOutcome,
    documentHtml: value.documentHtml,
    title: value.title,
    statusText: value.statusText,
    statusState: value.statusState,
    firstLink: value.firstLink,
  };
}

function observationIsCorrect(value) {
  return value?.status === "completed" && value?.oracle?.valid === true &&
    value?.cleanup?.status === "passed" && value?.lifecycle?.status === "complete";
}

async function settleRunner(runner, job) {
  try {
    const value = await runner(job);
    assertObservation(value, job);
    return value;
  } catch (error) {
    return deepFreeze({
      job: structuredClone(job),
      status: "failed",
      timingEligible: false,
      lifecycle: {
        status: "incomplete",
        order: lifecycleOrder,
        boundaryCount: 0,
        continuous: false,
        phaseSumEqualsOuter: false,
        outer: null,
        phases: Object.fromEntries(lifecycleOrder.map((name) => [name, null])),
      },
      result: null,
      oracle: { valid: false, reasons: ["runner_rejected"] },
      cleanup: { status: "unknown", mode: "runner_rejected" },
      error: projectFailure(error, "runner"),
    });
  }
}

function assertNavigationCausalJob(value) {
  if (!isPlainRecord(value)) throw new TypeError("Navigation causal job must be an object");
  const expected = createNavigationCausalJob(value);
  if (!isDeepStrictEqual(value, expected)) throw new TypeError("Navigation causal job changed");
  return value;
}

function assertNavigationCausalIdentity(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "hostLane", "host", "provenance", "stasis",
  ])) throw new TypeError("Invalid navigation causal identity");
  assertHostLane(value.hostLane);
  assertCrawlPerformanceHostIdentity(value.host);
  assertNavigationCausalProvenance(value.provenance, value.hostLane);
  assertStasisIdentity(value.stasis);
  if (
    value.stasis.hostClassDigest !== value.host.hostClassDigest ||
    value.provenance.hostLane !== value.hostLane
  ) throw new TypeError("Navigation causal identity is not internally bound");
  return value;
}

function assertNavigationCausalProvenance(value, hostLane) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "provider", "repository", "workflow", "job", "hostLane", "runId", "runAttempt",
    "workflowSourceSha", "workflowSourceRef", "harnessCheckoutRevision",
    "harnessCheckoutTree", "harnessCheckoutWorktree",
  ]) || value.provider !== "github-actions" || value.repository !== "oxhq/stasis" ||
    value.workflow !== navigationCausalWorkflowName || value.hostLane !== hostLane ||
    value.job !== `navigation-causal-${hostLane}` || !positiveIntegerString(value.runId) ||
    value.runAttempt !== "1" || !gitShaPattern.test(value.workflowSourceSha ?? "") ||
    value.workflowSourceRef !== "refs/heads/codex/stasis-v033-navigation-causal-source" ||
    !gitShaPattern.test(value.harnessCheckoutRevision ?? "") ||
    !gitShaPattern.test(value.harnessCheckoutTree ?? "") ||
    assertCleanHarnessWorktreeEvidence(value.harnessCheckoutWorktree) !==
      value.harnessCheckoutWorktree) {
    throw new TypeError("Invalid navigation causal GitHub provenance");
  }
  return value;
}

function assertStasisIdentity(value) {
  const expected = linuxPerformanceCandidateIdentity;
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "runner", "nodeVersion", "package", "sdkVersion", "revision", "profile", "releaseTag",
    "packageQualificationRunId", "packageQualificationRunAttempt", "sdkArchiveSha256",
    "executableSha256", "runtimeManifestSha256", "eglRuntime", "hostClassDigest",
  ]) || value.runner !== "stasis-direct-session-v0.3.3" || value.nodeVersion !== nodeVersion ||
    value.package !== expected.sdk.package || value.sdkVersion !== expected.version ||
    value.revision !== expected.revision || value.profile !== expected.profile ||
    value.releaseTag !== expected.release.tag ||
    value.packageQualificationRunId !== String(expected.packageQualification.runId) ||
    value.packageQualificationRunAttempt !== String(expected.packageQualification.runAttempt) ||
    value.sdkArchiveSha256 !== expected.sdk.archive.sha256 ||
    value.executableSha256 !== expected.linux.executable.sha256 ||
    value.runtimeManifestSha256 !== expected.release.runtimeManifest.sha256 ||
    !sha256Pattern.test(value.hostClassDigest ?? "") ||
    assertLinuxEglRuntimeEvidence(value.eglRuntime) !== value.eglRuntime) {
    throw new TypeError("Invalid navigation causal Stasis identity");
  }
  return value;
}

function assertInterval(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["startNs", "endNs", "durationNs"]) ||
    !canonicalUnsignedIntegerPattern.test(value.startNs ?? "") ||
    !canonicalUnsignedIntegerPattern.test(value.endNs ?? "") ||
    !canonicalUnsignedIntegerPattern.test(value.durationNs ?? "")) {
    throw new TypeError("Invalid navigation causal interval");
  }
  const start = BigInt(value.startNs);
  const end = BigInt(value.endNs);
  const duration = BigInt(value.durationNs);
  if (end <= start || duration !== end - start) {
    throw new TypeError("Navigation causal interval is not strictly monotonic");
  }
  return { start, end, duration };
}

function interval(start, end) {
  return {
    startNs: start.toString(10),
    endNs: end.toString(10),
    durationNs: (end - start).toString(10),
  };
}

function medianRational(values) {
  if (!Array.isArray(values) || values.length !== pairCount ||
    values.some((value) => typeof value !== "bigint")) {
    throw new TypeError("Navigation causal median requires exactly 10 integer deltas");
  }
  const ordered = [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return {
    numerator: (ordered[4] + ordered[5]).toString(10),
    denominator: "2",
  };
}

function projectFailure(error, phase) {
  const serialized = serializeError(error);
  return {
    phase,
    name: serialized.name,
    code: serialized.code,
    ...(serialized.fatal === undefined ? {} : { fatal: serialized.fatal }),
    ...(serialized.stateEffect === undefined ? {} : { stateEffect: serialized.stateEffect }),
    messageOmitted: true,
  };
}

function positiveIntegerString(value) {
  return typeof value === "string" && /^[1-9][0-9]*$/u.test(value);
}

function assertHostLane(value) {
  if (!navigationCausalHostLanes.includes(value)) {
    throw new TypeError("Navigation causal host lane must be host-a or host-b");
  }
}

function assertArm(value) {
  if (!navigationCausalArms.includes(value)) {
    throw new TypeError("Navigation causal arm must be A or B");
  }
}

function absBigInt(value) {
  return value < 0n ? -value : value;
}

function hasExactKeys(value, expected) {
  return isPlainRecord(value) && isDeepStrictEqual(
    Reflect.ownKeys(value).sort(),
    [...expected].sort(),
  );
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function navigationCausalResultSha256(result) {
  return createHash("sha256").update(JSON.stringify(comparableResult(result)), "utf8").digest("hex");
}
