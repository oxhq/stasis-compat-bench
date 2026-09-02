import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import {
  rwaAuthCases,
  rwaAuthSemanticDifferences,
  rwaAuthSource,
} from "../rwa/cases.mjs";

export const rwaPerformanceSchema = "stasis-v0.3.3-performance-rwa-raw-v1";
export const rwaPerformanceLaneResultSchema =
  "stasis-v0.3.3-performance-rwa-lane-result-v1";
export const rwaPerformanceProtocol = "stasis-v0.3.3-performance-rwa-v1";
export const rwaPerformanceTrack = "rwa-auth-eight-intents";

const cypressRunner = "cypress";
const stasisRunner = "stasis-v0.3.3";
const runners = Object.freeze([cypressRunner, stasisRunner]);
const passingClassifications = new Set([
  "PASS_EQUIVALENT",
  "PASS_WITH_SEMANTIC_DIFFERENCE",
]);
const classifications = new Set([
  ...passingClassifications,
  "SDK_GAP",
  "PROFILE_UNSUPPORTED",
  "ENGINE_BUG",
  "WEB_COMPAT_BUG",
  "BASELINE_FAILURE",
  "APP_MODIFICATION_REQUIRED",
  "BENCHMARK_INVALID",
]);
const runnerFailureRecordStatuses = new Set(["invalid_result", "runner_error"]);
const unsafeRecordStatuses = new Set(["clock_error", ...runnerFailureRecordStatuses]);
const decimalPattern = /^(0|[1-9][0-9]*)$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const resolvedDifferenceIds = new Set(["persistent-cookie-profile-gap"]);
const projectedErrorNames = new Set([
  "Error",
  "LaneResultContractError",
  "RangeError",
  "TypeError",
]);
const projectedErrorCodes = new Set([
  "authority_summary_invalid",
  "cleanup_not_complete",
  "clock_end_invalid",
  "clock_not_monotonic",
  "clock_start_invalid",
  "cypress_pass_classification_invalid",
  "droppedfailurecount_not_zero",
  "engine_crash",
  "engine_startup_not_included",
  "host_cpu_count_invalid",
  "host_field_invalid",
  "host_identity_digest_invalid",
  "host_identity_digest_mismatch",
  "host_instance_digest_invalid",
  "host_platform_invalid",
  "invalid_result",
  "lane_case_attempt_invalid",
  "lane_case_boolean_invalid",
  "lane_case_order_invalid",
  "lane_case_outcome_inconsistent",
  "lane_case_oracles_invalid",
  "lane_case_state_evidence_invalid",
  "lane_case_pass_without_execution",
  "lane_cases_invalid",
  "lane_classification_invalid",
  "lane_count_invalid",
  "lane_counts_inconsistent",
  "lane_denominator_invalid",
  "lane_framework_waiting_invalid",
  "lane_host_mismatch",
  "lane_host_instance_mismatch",
  "lane_identity_mismatch",
  "lane_result_not_snapshotable",
  "lane_state_attestation_invalid",
  "object_keys_invalid",
  "object_shape_invalid",
  "projected_error_invalid",
  "raw_identity_invalid",
  "record_failure_invalid",
  "record_gate_invalid",
  "record_host_mismatch",
  "record_payload_invalid",
  "record_status_invalid",
  "retrycount_not_zero",
  "runner_error",
  "runner_unknown",
  "rwa_server_shutdown_failed",
  "same_host_not_verified",
  "sample_order_invalid",
  "samples_invalid",
  "semantic_difference_disclosure_changed",
  "server_lifecycle_invalid",
  "server_shutdown_status_invalid",
  "sleepcount_not_zero",
  "stasis_semantic_difference_erased",
  "timing_boundary_invalid",
  "timing_global_order_invalid",
  "timing_value_invalid",
  "warmup_order_invalid",
  "warmups_invalid",
]);

const pairSchedule = Object.freeze(
  Array.from({ length: 10 }, (_, index) => {
    const pairIndex = index + 1;
    const order = pairIndex % 2 === 1 ? "AB" : "BA";
    return Object.freeze({
      pairIndex,
      order,
      runners: Object.freeze(
        order === "AB"
          ? [cypressRunner, stasisRunner]
          : [stasisRunner, cypressRunner],
      ),
    });
  }),
);

const caseSemanticDifferences = rwaAuthCases.map(({ id, ordinal, semanticDifferenceIds }) => ({
  id,
  ordinal,
  semanticDifferenceIds: semanticDifferenceIds.filter((entry) => !resolvedDifferenceIds.has(entry)),
  resolvedDifferenceIds: semanticDifferenceIds.filter((entry) => resolvedDifferenceIds.has(entry)),
}));
const activeDifferenceIds = new Set(
  caseSemanticDifferences.flatMap(({ semanticDifferenceIds }) => semanticDifferenceIds),
);
const activeSemanticDifferenceDefinitions = Object.fromEntries(
  Object.entries(rwaAuthSemanticDifferences).filter(([id]) => activeDifferenceIds.has(id)),
);
const cypressFrameworkNativeWaiting = "cypress-command-and-assertion-retry";
const noFrameworkNativeWaiting = "none";
const cypressTestIsolation = "upstream-cypress-test-isolation";
const cypressBeforeEachSeedHookLineIdentity = "cypress/tests/ui/auth.spec.ts:7-18";
const cypressBeforeEachSeedHookSource = [
  "  beforeEach(function () {",
  '    cy.task("db:seed");',
  "",
  '    cy.intercept("POST", "/users").as("signup");',
  '    cy.intercept("POST", apiGraphQL, (req) => {',
  "      const { body } = req;",
  "",
  '      if (body.hasOwnProperty("operationName") && body.operationName === "CreateBankAccount") {',
  '        req.alias = "gqlCreateBankAccountMutation";',
  "      }",
  "    });",
  "  });",
].join("\n");
const cypressBeforeEachSeedHookSourceSha256 =
  "970d46adadf8ef6acdf4c5544a7fae7a1d5ec525ce0549217a5ceb41414c1953";

export const rwaPerformanceSemanticDifferenceDisclosure = deepFreeze({
  exactEquivalenceClaimed: false,
  behavioralSupportRequired: true,
  interpretation:
    "A successful Stasis lane establishes the eight frozen behavioral oracles only under the preregistered semantic differences; timing cannot promote it to Cypress semantic equivalence.",
  cases: caseSemanticDifferences,
  definitions: activeSemanticDifferenceDefinitions,
  resolvedBoundaries: [
    {
      id: "persistent-cookie-profile-gap",
      historicalProfile: "controlled-web-session-v1",
      v033Profile: "controlled-web-session-v2",
      status: "positively-supported-in-v0.3.3",
      treatment:
        "Retain as frozen-port lineage only; it is not an active v0.3.3 semantic difference or unsupported result.",
    },
  ],
});

export const rwaPerformancePlan = deepFreeze({
  platform: "windows-x64",
  comparison: "same-host-paired",
  implementations: {
    A: cypressRunner,
    B: stasisRunner,
  },
  denominator: rwaAuthCases.length,
  warmupsPerImplementation: 1,
  pairedSamples: pairSchedule.length,
  timedSamplesPerImplementation: pairSchedule.length,
  schedule: pairSchedule,
  timing: {
    clock: "one-injected-external-monotonic-clock",
    unit: "nanoseconds",
    boundaryStart: "immediately-before-full-lane-callback",
    boundaryEnd: "immediately-after-callback-resolves-with-cleanup-complete",
    included: [
      "engine-startup",
      "eight-seed-resets",
      "eight-frozen-intents",
      "all-preregistered-behavioral-oracles",
      "engine-cleanup",
    ],
    excluded: [
      "identity-and-preflight",
      "rwa-server-startup-and-shutdown",
      "one-warmup-per-implementation",
      "runner-result-validation",
      "report-and-raw-artifact-io",
    ],
  },
  controls: {
    freshStateEveryLane: true,
    seedBeforeEveryIntent: true,
    retries: 0,
    sleeps: 0,
    droppedFailures: 0,
    unsafeContinuation:
      "abort-only-when-callback-throws-cleanup-cannot-be-attested-or-the-common-clock-is-invalid",
  },
  authorityGate:
    "valid-only-if-both-warmups-and-every-one-of-the-ten-timed-samples-per-implementation-are-behaviorally-supported-eight-of-eight",
});

export function createRwaPerformanceHostIdentity(fields) {
  const projection = projectHostFields(fields);
  const instanceDigest = assertHostInstanceDigest(fields?.instanceDigest);
  return deepFreeze({
    ...projection,
    instanceDigest,
    identityDigest: digestHostFields(projection),
  });
}

export function computeRwaPerformanceHostIdentityDigest(fields) {
  return digestHostFields(projectHostFields(fields));
}

export function assertRwaPerformanceHostIdentity(value) {
  exactKeys(value, [
    "arch",
    "cpuModel",
    "identityDigest",
    "imageOs",
    "imageVersion",
    "instanceDigest",
    "logicalCpuCount",
    "platform",
    "runnerOs",
  ], "RWA performance host identity");
  const projected = projectHostFields(value);
  assertHostInstanceDigest(value.instanceDigest);
  if (!sha256Pattern.test(value.identityDigest ?? "")) {
    invalid("host_identity_digest_invalid", "RWA performance host identity digest is invalid");
  }
  if (digestHostFields(projected) !== value.identityDigest) {
    invalid("host_identity_digest_mismatch", "RWA performance host identity digest does not bind its fields");
  }
  return value;
}

export function assertRwaPerformanceLaneResult(
  value,
  expectedRunner,
  expectedHostDigest,
  expectedHostInstanceDigest,
) {
  if (!runners.includes(expectedRunner)) {
    invalid("runner_unknown", `Unknown RWA performance runner ${String(expectedRunner)}`);
  }
  exactKeys(value, [
    "cases",
    "cleanupComplete",
    "completedIntentCount",
    "droppedFailureCount",
    "engineStartupCount",
    "engineStartupIncluded",
    "frameworkNativeWaiting",
    "freshState",
    "hostIdentityDigest",
    "hostInstanceDigest",
    "retryCount",
    "runner",
    "schema",
    "seedBeforeEveryIntent",
    "seededIntentCount",
    "selectedIntentCount",
    "sleepCount",
    "track",
  ], "RWA performance lane result");
  if (
    value.schema !== rwaPerformanceLaneResultSchema ||
    value.runner !== expectedRunner ||
    value.track !== rwaPerformanceTrack
  ) {
    invalid("lane_identity_mismatch", "RWA performance lane result identity is invalid");
  }
  if (!sha256Pattern.test(expectedHostDigest ?? "") || value.hostIdentityDigest !== expectedHostDigest) {
    invalid("lane_host_mismatch", "RWA performance lane did not attest the preflight host");
  }
  if (
    !sha256Pattern.test(expectedHostInstanceDigest ?? "") ||
    value.hostInstanceDigest !== expectedHostInstanceDigest
  ) {
    invalid("lane_host_instance_mismatch", "RWA performance lane did not attest the preflight host instance");
  }
  if (value.engineStartupIncluded !== true) {
    invalid("engine_startup_not_included", "The full-lane callback must include engine startup");
  }
  if (value.cleanupComplete !== true) {
    invalid("cleanup_not_complete", "The full-lane callback must resolve only after cleanup completes");
  }
  for (const [field, upperBound] of [
    ["engineStartupCount", expectedRunner === cypressRunner ? 1 : rwaAuthCases.length],
    ["seededIntentCount", rwaAuthCases.length],
    ["completedIntentCount", rwaAuthCases.length],
  ]) {
    boundedCount(value[field], field, upperBound);
  }
  for (const field of ["retryCount", "sleepCount", "droppedFailureCount"]) {
    if (value[field] !== 0) {
      invalid(`${field}_not_zero`, `RWA performance lane ${field} must be zero`);
    }
  }
  if (typeof value.freshState !== "boolean" || typeof value.seedBeforeEveryIntent !== "boolean") {
    invalid("lane_state_attestation_invalid", "RWA performance lane state attestations must be boolean");
  }
  if (
    value.frameworkNativeWaiting !== (
      expectedRunner === cypressRunner ? cypressFrameworkNativeWaiting : noFrameworkNativeWaiting
    )
  ) {
    invalid(
      "lane_framework_waiting_invalid",
      "RWA performance lane framework-native waiting disclosure is invalid",
    );
  }
  if (value.selectedIntentCount !== rwaAuthCases.length) {
    invalid("lane_denominator_invalid", "RWA performance lane must retain all eight selected intents");
  }
  if (!Array.isArray(value.cases) || value.cases.length !== rwaAuthCases.length) {
    invalid("lane_cases_invalid", "RWA performance lane must retain exactly eight ordered case results");
  }

  let seededIntentCount = 0;
  let completedIntentCount = 0;
  const stasisEngineOrdinals = new Set();
  for (let index = 0; index < rwaAuthCases.length; index += 1) {
    const expected = rwaAuthCases[index];
    const item = value.cases[index];
    exactKeys(item, [
      "allOraclesPassed",
      "attemptCount",
      "behaviorallySupported",
      "classification",
      "id",
      "intentCompleted",
      "oracles",
      "ordinal",
      "seeded",
      "semanticDifferenceIds",
      "stateEvidence",
    ], `RWA performance case ${index + 1}`);
    if (item.id !== expected.id || item.ordinal !== expected.ordinal) {
      invalid("lane_case_order_invalid", "RWA performance lane changed the frozen case identity or order");
    }
    if (!classifications.has(item.classification)) {
      invalid("lane_classification_invalid", `RWA performance case ${index + 1} classification is invalid`);
    }
    for (const field of ["seeded", "intentCompleted", "allOraclesPassed", "behaviorallySupported"]) {
      if (typeof item[field] !== "boolean") {
        invalid("lane_case_boolean_invalid", `RWA performance case ${index + 1} ${field} is invalid`);
      }
    }
    if (!Number.isSafeInteger(item.attemptCount) || item.attemptCount < 0 || item.attemptCount > 1) {
      invalid("lane_case_attempt_invalid", `RWA performance case ${index + 1} attempt count is invalid`);
    }
    if (!Array.isArray(item.oracles) || item.oracles.length !== expected.oracles.length) {
      invalid("lane_case_oracles_invalid", `RWA performance case ${index + 1} oracle records are invalid`);
    }
    item.oracles.forEach((oracle, oracleIndex) => {
      exactKeys(oracle, ["id", "status"], `RWA performance case ${index + 1} oracle ${oracleIndex + 1}`);
      if (
        oracle.id !== expected.oracles[oracleIndex].id ||
        !["passed", "failed", "not_reached"].includes(oracle.status)
      ) {
        invalid(
          "lane_case_oracles_invalid",
          `RWA performance case ${index + 1} changed its frozen oracle identity or status vocabulary`,
        );
      }
    });
    const expectedDifferences = expectedRunner === cypressRunner
      ? []
      : caseSemanticDifferences[index].semanticDifferenceIds;
    if (!isDeepStrictEqual(item.semanticDifferenceIds, expectedDifferences)) {
      invalid(
        "semantic_difference_disclosure_changed",
        `RWA performance case ${index + 1} changed its semantic-difference disclosure`,
      );
    }
    const passes = passingClassifications.has(item.classification);
    const allOraclesPassed = item.oracles.every(({ status }) => status === "passed");
    if (
      item.behaviorallySupported !== passes ||
      item.allOraclesPassed !== allOraclesPassed ||
      item.allOraclesPassed !== passes
    ) {
      invalid(
        "lane_case_outcome_inconsistent",
        `RWA performance case ${index + 1} has inconsistent classification and oracle status`,
      );
    }
    if (expectedRunner === cypressRunner && passes && item.classification !== "PASS_EQUIVALENT") {
      invalid("cypress_pass_classification_invalid", "A passing Cypress case must be PASS_EQUIVALENT");
    }
    if (
      expectedRunner === stasisRunner &&
      passes &&
      item.classification !== "PASS_WITH_SEMANTIC_DIFFERENCE"
    ) {
      invalid(
        "stasis_semantic_difference_erased",
        "A passing Stasis RWA case must retain PASS_WITH_SEMANTIC_DIFFERENCE",
      );
    }
    if (passes && (!item.seeded || !item.intentCompleted || item.attemptCount !== 1)) {
      invalid("lane_case_pass_without_execution", "A passing case must attest seed and intent completion");
    }
    const engineInstanceOrdinal = assertCaseStateEvidence(
      item.stateEvidence,
      expectedRunner,
      expected,
      item,
      index + 1,
    );
    if (expectedRunner === stasisRunner) stasisEngineOrdinals.add(engineInstanceOrdinal);
    if (item.seeded) seededIntentCount += 1;
    if (item.intentCompleted) completedIntentCount += 1;
  }
  if (
    value.seededIntentCount !== seededIntentCount ||
    value.completedIntentCount !== completedIntentCount
  ) {
    invalid("lane_counts_inconsistent", "RWA performance lane counts do not match its case records");
  }
  if (
    expectedRunner === stasisRunner &&
    !isDeepStrictEqual(
      [...stasisEngineOrdinals].sort((left, right) => left - right),
      rwaAuthCases.map(({ ordinal }) => ordinal),
    )
  ) {
    invalid(
      "lane_case_state_evidence_invalid",
      "RWA performance Stasis lanes must retain unique engine ordinals 1..8",
    );
  }
  return value;
}

export async function runRwaPerformanceAuthority({
  monotonicNow = process.hrtime.bigint,
  preflight,
  startRwaServers,
  stopRwaServers,
  runCypressLane,
  runStasisLane,
  projectCypressResult = passthroughResult,
  projectStasisResult = passthroughResult,
  writeRaw = async () => undefined,
} = {}) {
  for (const [name, dependency] of Object.entries({
    monotonicNow,
    preflight,
    startRwaServers,
    stopRwaServers,
    runCypressLane,
    runStasisLane,
    projectCypressResult,
    projectStasisResult,
    writeRaw,
  })) {
    if (typeof dependency !== "function") {
      throw new TypeError(`${name} must be a function`);
    }
  }

  const preflightResult = assertPreflight(await preflight({
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    source: rwaAuthSource,
    plan: rwaPerformancePlan,
  }));
  const host = structuredClone(preflightResult.host);
  let serverContext;
  try {
    serverContext = await startRwaServers({
      protocol: rwaPerformanceProtocol,
      track: rwaPerformanceTrack,
      host,
    });
  } catch (startupError) {
    try {
      await stopRwaServers({
        protocol: rwaPerformanceProtocol,
        track: rwaPerformanceTrack,
        host,
        serverContext: null,
        startupComplete: false,
      });
    } catch (rollbackError) {
      throw new AggregateError(
        [startupError, rollbackError],
        "RWA server startup and rollback both failed",
      );
    }
    throw startupError;
  }
  const runLane = {
    [cypressRunner]: runCypressLane,
    [stasisRunner]: runStasisLane,
  };
  const projectLane = {
    [cypressRunner]: projectCypressResult,
    [stasisRunner]: projectStasisResult,
  };
  const warmups = [];
  const samples = [];
  let unsafeToContinue = false;
  let shutdownComplete = false;
  let shutdownError = null;

  try {
    for (let index = 0; index < runners.length; index += 1) {
      const runner = runners[index];
      const record = await runUntimedLane(runLane[runner], projectLane[runner], {
        phase: "warmup",
        sequence: index + 1,
        warmupIndex: 1,
        runner,
        host,
        serverContext,
      });
      warmups.push(record);
      if (unsafeRecordStatuses.has(record.status)) {
        unsafeToContinue = true;
        break;
      }
    }

    if (!unsafeToContinue && warmups.length === runners.length && warmups.every(isPassingRecord)) {
      outer: for (const pair of pairSchedule) {
        for (let position = 0; position < pair.runners.length; position += 1) {
          const runner = pair.runners[position];
          const record = await runTimedLane(
            runLane[runner],
            projectLane[runner],
            monotonicNow,
            {
              phase: "timed",
              sequence: samples.length + 1,
              pairIndex: pair.pairIndex,
              pairOrder: pair.order,
              position: position + 1,
              runner,
              host,
              serverContext,
            },
          );
          samples.push(record);
          if (unsafeRecordStatuses.has(record.status)) {
            unsafeToContinue = true;
            break outer;
          }
        }
      }
    }
  } finally {
    try {
      await stopRwaServers({
        protocol: rwaPerformanceProtocol,
        track: rwaPerformanceTrack,
        host,
        serverContext,
        startupComplete: true,
      });
      shutdownComplete = true;
    } catch (error) {
      shutdownError = projectError(error, "rwa_server_shutdown_failed");
    }
  }

  const serverLifecycle = {
    startupComplete: true,
    startupOutsideTiming: true,
    shutdownComplete,
    shutdownOutsideTiming: true,
    error: shutdownError,
  };
  const authority = deriveAuthority(warmups, samples, serverLifecycle);
  const raw = {
    schema: rwaPerformanceSchema,
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    source: rwaAuthSource,
    host,
    plan: rwaPerformancePlan,
    semanticDifferenceDisclosure: rwaPerformanceSemanticDifferenceDisclosure,
    serverLifecycle,
    warmups,
    samples,
    authority,
  };
  assertRwaPerformanceRaw(raw);
  deepFreeze(raw);
  await writeRaw(raw);
  return raw;

  async function runUntimedLane(callback, projector, context) {
    try {
      const callbackValue = await callback(callbackContext(context));
      const result = snapshotLaneResult(await projector(callbackValue, callbackContext(context)));
      assertRwaPerformanceLaneResult(
        result,
        context.runner,
        host.identityDigest,
        host.instanceDigest,
      );
      return {
        hostIdentityDigest: host.identityDigest,
        hostInstanceDigest: host.instanceDigest,
        sequence: context.sequence,
        warmupIndex: context.warmupIndex,
        runner: context.runner,
        status: isEightOfEight(result) ? "passed" : "failed",
        result,
        error: null,
      };
    } catch (error) {
      const status = error instanceof LaneResultContractError ? "invalid_result" : "runner_error";
      return {
        hostIdentityDigest: host.identityDigest,
        hostInstanceDigest: host.instanceDigest,
        sequence: context.sequence,
        warmupIndex: context.warmupIndex,
        runner: context.runner,
        status,
        result: null,
        error: projectError(error, status),
      };
    }
  }

  async function runTimedLane(callback, projector, clock, context) {
    let start;
    try {
      start = readMonotonicClock(clock);
    } catch (error) {
      return clockFailureRecord(context, projector, {
        startNs: null,
        endNs: null,
        durationNs: null,
      }, projectFixedError(error, "clock_start_invalid"));
    }
    let candidate = null;
    let callbackError = null;
    try {
      candidate = await callback(callbackContext(context));
    } catch (error) {
      callbackError = error;
    }
    let end;
    try {
      end = readMonotonicClock(clock);
    } catch (error) {
      return clockFailureRecord(context, projector, {
        startNs: start.toString(),
        endNs: null,
        durationNs: null,
      }, projectFixedError(error, "clock_end_invalid"), candidate, callbackError);
    }
    if (end <= start) {
      return clockFailureRecord(context, projector, {
        startNs: start.toString(),
        endNs: end.toString(),
        durationNs: null,
      }, { name: "RangeError", code: "clock_not_monotonic" }, candidate, callbackError);
    }
    const timing = {
      startNs: start.toString(),
      endNs: end.toString(),
      durationNs: (end - start).toString(),
    };
    if (callbackError !== null) {
      return {
        hostIdentityDigest: host.identityDigest,
        hostInstanceDigest: host.instanceDigest,
        sequence: context.sequence,
        pairIndex: context.pairIndex,
        pairOrder: context.pairOrder,
        position: context.position,
        runner: context.runner,
        status: "runner_error",
        timing,
        result: null,
        error: projectError(callbackError, "runner_error"),
      };
    }
    try {
      const result = snapshotLaneResult(await projector(candidate, callbackContext(context)));
      assertRwaPerformanceLaneResult(
        result,
        context.runner,
        host.identityDigest,
        host.instanceDigest,
      );
      return {
        hostIdentityDigest: host.identityDigest,
        hostInstanceDigest: host.instanceDigest,
        sequence: context.sequence,
        pairIndex: context.pairIndex,
        pairOrder: context.pairOrder,
        position: context.position,
        runner: context.runner,
        status: isEightOfEight(result) ? "passed" : "failed",
        timing,
        result,
        error: null,
      };
    } catch (error) {
      return {
        hostIdentityDigest: host.identityDigest,
        hostInstanceDigest: host.instanceDigest,
        sequence: context.sequence,
        pairIndex: context.pairIndex,
        pairOrder: context.pairOrder,
        position: context.position,
        runner: context.runner,
        status: "invalid_result",
        timing,
        result: null,
        error: projectError(error, "invalid_result"),
      };
    }
  }

  async function clockFailureRecord(
    context,
    projector,
    timing,
    error,
    candidate = null,
    callbackError = null,
  ) {
    let result = null;
    if (callbackError === null && candidate !== null) {
      try {
        result = snapshotLaneResult(await projector(candidate, callbackContext(context)));
        assertRwaPerformanceLaneResult(
          result,
          context.runner,
          host.identityDigest,
          host.instanceDigest,
        );
      } catch {
        result = null;
      }
    }
    return {
      hostIdentityDigest: host.identityDigest,
      hostInstanceDigest: host.instanceDigest,
      sequence: context.sequence,
      pairIndex: context.pairIndex,
      pairOrder: context.pairOrder,
      position: context.position,
      runner: context.runner,
      status: "clock_error",
      timing,
      result,
      error,
    };
  }
}

function passthroughResult(value) {
  return value;
}

export function assertRwaPerformanceRaw(value) {
  exactKeys(value, [
    "authority",
    "host",
    "plan",
    "protocol",
    "samples",
    "schema",
    "semanticDifferenceDisclosure",
    "serverLifecycle",
    "source",
    "track",
    "warmups",
  ], "RWA performance raw result");
  if (
    value.schema !== rwaPerformanceSchema ||
    value.protocol !== rwaPerformanceProtocol ||
    value.track !== rwaPerformanceTrack ||
    !isDeepStrictEqual(value.source, rwaAuthSource) ||
    !isDeepStrictEqual(value.plan, rwaPerformancePlan) ||
    !isDeepStrictEqual(
      value.semanticDifferenceDisclosure,
      rwaPerformanceSemanticDifferenceDisclosure,
    )
  ) {
    invalid("raw_identity_invalid", "RWA performance raw result changed its preregistration");
  }
  assertRwaPerformanceHostIdentity(value.host);
  assertServerLifecycle(value.serverLifecycle);
  assertWarmups(value.warmups, value.host.identityDigest, value.host.instanceDigest);
  assertSamples(value.samples, value.host.identityDigest, value.host.instanceDigest);
  const expectedAuthority = deriveAuthority(value.warmups, value.samples, value.serverLifecycle);
  if (!isDeepStrictEqual(value.authority, expectedAuthority)) {
    invalid("authority_summary_invalid", "RWA performance authority summary does not replay from raw samples");
  }
  return value;
}

function callbackContext(context) {
  return Object.freeze({
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    source: rwaAuthSource,
    expectedCases: rwaAuthCases,
    plan: rwaPerformancePlan,
    ...context,
  });
}

function snapshotLaneResult(value) {
  try {
    return structuredClone(value);
  } catch {
    invalid("lane_result_not_snapshotable", "RWA performance lane result must be plain snapshotable data");
  }
}

function assertPreflight(value) {
  exactKeys(value, ["host", "sameHostVerified"], "RWA performance preflight");
  if (value.sameHostVerified !== true) {
    invalid("same_host_not_verified", "RWA performance preflight must verify the common host");
  }
  assertRwaPerformanceHostIdentity(value.host);
  return value;
}

function assertServerLifecycle(value) {
  exactKeys(value, [
    "error",
    "shutdownComplete",
    "shutdownOutsideTiming",
    "startupComplete",
    "startupOutsideTiming",
  ], "RWA performance server lifecycle");
  if (
    value.startupComplete !== true ||
    value.startupOutsideTiming !== true ||
    value.shutdownOutsideTiming !== true ||
    typeof value.shutdownComplete !== "boolean"
  ) {
    invalid("server_lifecycle_invalid", "RWA performance server lifecycle is invalid");
  }
  if (value.shutdownComplete === (value.error !== null)) {
    invalid("server_shutdown_status_invalid", "RWA performance server shutdown status is inconsistent");
  }
  if (value.error !== null) assertProjectedError(value.error);
}

function assertWarmups(value, hostDigest, hostInstanceDigest) {
  if (!Array.isArray(value) || value.length > runners.length) {
    invalid("warmups_invalid", "RWA performance warmups are invalid");
  }
  value.forEach((record, index) => {
    exactKeys(record, [
      "error",
      "hostIdentityDigest",
      "hostInstanceDigest",
      "result",
      "runner",
      "sequence",
      "status",
      "warmupIndex",
    ], `RWA performance warmup ${index + 1}`);
    if (
      record.sequence !== index + 1 ||
      record.warmupIndex !== 1 ||
      record.runner !== runners[index]
    ) {
      invalid("warmup_order_invalid", "RWA performance warmups changed order or multiplicity");
    }
    assertExecutionRecord(record, hostDigest, hostInstanceDigest);
  });
}

function assertSamples(value, hostDigest, hostInstanceDigest) {
  if (!Array.isArray(value) || value.length > pairSchedule.length * 2) {
    invalid("samples_invalid", "RWA performance timed samples are invalid");
  }
  const expected = pairSchedule.flatMap((pair) =>
    pair.runners.map((runner, index) => ({
      pairIndex: pair.pairIndex,
      pairOrder: pair.order,
      position: index + 1,
      runner,
    }))
  );
  let priorEnd = null;
  value.forEach((record, index) => {
    exactKeys(record, [
      "error",
      "hostIdentityDigest",
      "hostInstanceDigest",
      "pairIndex",
      "pairOrder",
      "position",
      "result",
      "runner",
      "sequence",
      "status",
      "timing",
    ], `RWA performance timed sample ${index + 1}`);
    const planned = expected[index];
    if (
      record.sequence !== index + 1 ||
      record.pairIndex !== planned.pairIndex ||
      record.pairOrder !== planned.pairOrder ||
      record.position !== planned.position ||
      record.runner !== planned.runner
    ) {
      invalid("sample_order_invalid", "RWA performance timed samples changed the AB/BA schedule");
    }
    const timing = record.status === "clock_error"
      ? assertPartialTiming(record.timing, record.error)
      : assertTiming(record.timing);
    if (priorEnd !== null && timing.start !== null && timing.start < priorEnd) {
      invalid(
        "timing_global_order_invalid",
        "RWA performance timing boundaries do not preserve global clock order",
      );
    }
    if (timing.end !== null) priorEnd = timing.end;
    assertExecutionRecord(record, hostDigest, hostInstanceDigest);
  });
}

function assertTiming(value) {
  exactKeys(value, ["durationNs", "endNs", "startNs"], "RWA performance timing");
  for (const field of ["startNs", "endNs", "durationNs"]) {
    if (typeof value[field] !== "string" || !decimalPattern.test(value[field])) {
      invalid("timing_value_invalid", `RWA performance ${field} is not a canonical integer`);
    }
  }
  const start = BigInt(value.startNs);
  const end = BigInt(value.endNs);
  if (end <= start || BigInt(value.durationNs) !== end - start) {
    invalid("timing_boundary_invalid", "RWA performance duration does not replay from its boundaries");
  }
  return { start, end };
}

function assertPartialTiming(value, error) {
  exactKeys(value, ["durationNs", "endNs", "startNs"], "RWA performance partial timing");
  if (value.durationNs !== null) {
    invalid("timing_value_invalid", "RWA performance clock failure cannot retain a duration");
  }
  if (error?.code === "clock_start_invalid") {
    if (value.startNs !== null || value.endNs !== null) {
      invalid("timing_value_invalid", "RWA performance invalid start clock retained a boundary");
    }
    return { start: null, end: null };
  }
  if (typeof value.startNs !== "string" || !decimalPattern.test(value.startNs)) {
    invalid("timing_value_invalid", "RWA performance partial start boundary is invalid");
  }
  const start = BigInt(value.startNs);
  if (error?.code === "clock_end_invalid") {
    if (value.endNs !== null) {
      invalid("timing_value_invalid", "RWA performance invalid end clock retained a boundary");
    }
    return { start, end: null };
  }
  if (
    error?.code !== "clock_not_monotonic" ||
    typeof value.endNs !== "string" ||
    !decimalPattern.test(value.endNs)
  ) {
    invalid("timing_value_invalid", "RWA performance non-monotonic boundary is invalid");
  }
  const end = BigInt(value.endNs);
  if (end > start) {
    invalid("timing_boundary_invalid", "RWA performance clock-error boundaries unexpectedly advanced");
  }
  return { start, end };
}

function assertExecutionRecord(record, hostDigest, hostInstanceDigest) {
  if (
    !sha256Pattern.test(record.hostIdentityDigest ?? "") ||
    record.hostIdentityDigest !== hostDigest ||
    !sha256Pattern.test(record.hostInstanceDigest ?? "") ||
    record.hostInstanceDigest !== hostInstanceDigest
  ) {
    invalid("record_host_mismatch", "RWA performance execution record host digests are invalid");
  }
  if (!["passed", "failed", ...unsafeRecordStatuses].includes(record.status)) {
    invalid("record_status_invalid", "RWA performance execution status is invalid");
  }
  if (record.status === "passed" || record.status === "failed") {
    if (record.error !== null || record.result === null) {
      invalid("record_payload_invalid", "RWA performance result record is inconsistent");
    }
    assertRwaPerformanceLaneResult(
      record.result,
      record.runner,
      hostDigest,
      hostInstanceDigest,
    );
    const expectedStatus = isEightOfEight(record.result) ? "passed" : "failed";
    if (record.status !== expectedStatus) {
      invalid("record_gate_invalid", "RWA performance record status does not match eight-of-eight");
    }
    return;
  }
  if (record.error === null) {
    invalid("record_failure_invalid", "RWA performance failure record is inconsistent");
  }
  if (record.status !== "clock_error" && record.result !== null) {
    invalid("record_failure_invalid", "RWA performance runner failure retained an invalid result");
  }
  if (record.status === "clock_error" && record.result !== null) {
    assertRwaPerformanceLaneResult(
      record.result,
      record.runner,
      hostDigest,
      hostInstanceDigest,
    );
  }
  assertProjectedError(record.error);
}

function assertProjectedError(value) {
  exactKeys(value, ["code", "name"], "RWA performance projected error");
  if (!projectedErrorNames.has(value.name) || !projectedErrorCodes.has(value.code)) {
    invalid("projected_error_invalid", "RWA performance projected error is invalid");
  }
}

function deriveAuthority(warmups, samples, serverLifecycle) {
  const cypressPassed = samples.filter(
    ({ runner, status }) => runner === cypressRunner && status === "passed",
  ).length;
  const stasisPassed = samples.filter(
    ({ runner, status }) => runner === stasisRunner && status === "passed",
  ).length;
  const retainedTimedFailures = samples.filter(({ status }) => status !== "passed").length;
  const reasonCodes = [];
  if (!serverLifecycle.shutdownComplete) reasonCodes.push("rwa_server_shutdown_failed");
  if (warmups.length !== runners.length) reasonCodes.push("warmup_schedule_incomplete");
  if (!warmups.every(isPassingRecord) || warmups.length !== runners.length) {
    reasonCodes.push("warmup_not_8_of_8");
  }
  if (samples.length !== pairSchedule.length * 2) reasonCodes.push("timed_schedule_incomplete");
  if (cypressPassed !== pairSchedule.length) {
    reasonCodes.push("cypress_not_8_of_8_every_sample");
  }
  if (stasisPassed !== pairSchedule.length) {
    reasonCodes.push("stasis_not_8_of_8_every_sample");
  }
  if ([...warmups, ...samples].some(({ status }) => runnerFailureRecordStatuses.has(status))) {
    reasonCodes.push("runner_contract_or_cleanup_failure");
  }
  if (samples.some(({ status }) => status === "clock_error")) reasonCodes.push("clock_failure");
  if (retainedTimedFailures > 0) reasonCodes.push("timed_failure_retained");
  const valid = reasonCodes.length === 0;
  return {
    status: valid ? "valid" : "invalid",
    valid,
    reasonCodes,
    plannedWarmups: runners.length,
    completedWarmups: warmups.length,
    plannedTimedSamples: pairSchedule.length * 2,
    completedTimedSamples: samples.length,
    retainedTimedFailures,
    cypressTimedEightOfEight: cypressPassed,
    stasisTimedEightOfEight: stasisPassed,
  };
}

function isPassingRecord(record) {
  return record.status === "passed";
}

function isEightOfEight(result) {
  const expectedStartups = result.runner === cypressRunner ? 1 : rwaAuthCases.length;
  return (
    result.freshState === true &&
    result.seedBeforeEveryIntent === true &&
    result.engineStartupCount === expectedStartups &&
    result.seededIntentCount === rwaAuthCases.length &&
    result.completedIntentCount === rwaAuthCases.length &&
    result.cases.every(({ behaviorallySupported }) => behaviorallySupported)
  );
}

function readMonotonicClock(clock) {
  const value = clock();
  if (typeof value !== "bigint" || value < 0n) {
    throw new TypeError("The injected monotonic clock must return a non-negative bigint");
  }
  return value;
}

function projectHostFields(value) {
  const fields = {
    platform: value?.platform,
    arch: value?.arch,
    runnerOs: value?.runnerOs,
    imageOs: value?.imageOs,
    imageVersion: value?.imageVersion,
    cpuModel: value?.cpuModel,
    logicalCpuCount: value?.logicalCpuCount,
  };
  if (fields.platform !== "win32" || fields.arch !== "x64" || fields.runnerOs !== "Windows") {
    invalid("host_platform_invalid", "RWA performance host must be Windows x64");
  }
  for (const field of ["imageOs", "imageVersion", "cpuModel"]) {
    if (
      typeof fields[field] !== "string" ||
      fields[field].length === 0 ||
      fields[field].length > 256 ||
      /[\u0000-\u001f\u007f]/u.test(fields[field])
    ) {
      invalid("host_field_invalid", `RWA performance host ${field} is invalid`);
    }
  }
  if (!Number.isSafeInteger(fields.logicalCpuCount) || fields.logicalCpuCount < 1) {
    invalid("host_cpu_count_invalid", "RWA performance logical CPU count is invalid");
  }
  return fields;
}

function assertHostInstanceDigest(value) {
  if (!sha256Pattern.test(value ?? "")) {
    invalid("host_instance_digest_invalid", "RWA performance host instance digest is invalid");
  }
  return value;
}

function digestHostFields(fields) {
  return createHash("sha256").update(JSON.stringify(fields), "utf8").digest("hex");
}

function assertCaseStateEvidence(value, expectedRunner, expectedCase, item, caseIndex) {
  if (expectedRunner === cypressRunner) {
    exactKeys(value, [
      "attemptOrdinal",
      "beforeEachSeedHookLineIdentity",
      "beforeEachSeedHookSource",
      "beforeEachSeedHookSourceSha256",
      "engineInstanceOrdinal",
      "seedHookOrdinal",
      "testIsolation",
    ], `RWA performance case ${caseIndex} state evidence`);
    if (
      value.attemptOrdinal !== item.attemptCount ||
      value.beforeEachSeedHookLineIdentity !== cypressBeforeEachSeedHookLineIdentity ||
      value.beforeEachSeedHookSource !== cypressBeforeEachSeedHookSource ||
      value.beforeEachSeedHookSourceSha256 !== cypressBeforeEachSeedHookSourceSha256 ||
      createHash("sha256").update(value.beforeEachSeedHookSource, "utf8").digest("hex") !==
        value.beforeEachSeedHookSourceSha256 ||
      value.engineInstanceOrdinal !== 1 ||
      value.seedHookOrdinal !== expectedCase.ordinal ||
      value.testIsolation !== cypressTestIsolation
    ) {
      invalid(
        "lane_case_state_evidence_invalid",
        `RWA performance case ${caseIndex} Cypress state evidence is invalid`,
      );
    }
    return value.engineInstanceOrdinal;
  }
  exactKeys(value, [
    "cleanupCheckpointPhase",
    "cleanupCheckpointSequence",
    "cleanupCheckpointStatus",
    "engineInstanceOrdinal",
    "runtimeLaunchCheckpointPhase",
    "runtimeLaunchCheckpointSequence",
    "runtimeLaunchCheckpointStatus",
    "runtimeLaunchFreshProcess",
    "seedCheckpointPhase",
    "seedCheckpointSequence",
    "seedCheckpointStatus",
    "seedOrdinal",
  ], `RWA performance case ${caseIndex} state evidence`);
  if (
    value.cleanupCheckpointPhase !== "cleanup" ||
    value.cleanupCheckpointStatus !== "passed" ||
    value.engineInstanceOrdinal !== expectedCase.ordinal ||
    value.runtimeLaunchCheckpointPhase !== "runtime-launch" ||
    value.runtimeLaunchCheckpointStatus !== "passed" ||
    value.runtimeLaunchFreshProcess !== true ||
    value.seedCheckpointPhase !== "seed" ||
    value.seedCheckpointStatus !== "passed" ||
    value.seedOrdinal !== expectedCase.ordinal ||
    !isPositiveSafeInteger(value.seedCheckpointSequence) ||
    !isPositiveSafeInteger(value.runtimeLaunchCheckpointSequence) ||
    !isPositiveSafeInteger(value.cleanupCheckpointSequence) ||
    value.seedCheckpointSequence >= value.runtimeLaunchCheckpointSequence ||
    value.runtimeLaunchCheckpointSequence >= value.cleanupCheckpointSequence
  ) {
    invalid(
      "lane_case_state_evidence_invalid",
      `RWA performance case ${caseIndex} Stasis state evidence is invalid`,
    );
  }
  return value.engineInstanceOrdinal;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function projectError(error, fallbackCode) {
  const candidateName = typeof error?.name === "string" ? error.name : "";
  const name = projectedErrorNames.has(candidateName) ? candidateName : "Error";
  const candidateCode = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const code = projectedErrorCodes.has(candidateCode) ? candidateCode : fallbackCode;
  return { name, code };
}

function projectFixedError(error, code) {
  const candidateName = typeof error?.name === "string" ? error.name : "";
  const name = projectedErrorNames.has(candidateName) ? candidateName : "Error";
  return { name, code };
}

function boundedCount(value, field, upperBound) {
  if (!Number.isSafeInteger(value) || value < 0 || value > upperBound) {
    invalid("lane_count_invalid", `RWA performance lane ${field} is invalid`);
  }
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid("object_shape_invalid", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    invalid("object_keys_invalid", `${label} has unexpected or missing fields`);
  }
}

function invalid(code, message) {
  throw new LaneResultContractError(code, message);
}

class LaneResultContractError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = "LaneResultContractError";
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
