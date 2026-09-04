import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { chromium } from "playwright";

import {
  concurrency,
  maxDepth,
  maxPages,
  startUrl,
} from "../crawl/corpus.mjs";
import {
  assertSerializedError,
  serializeError,
} from "../shared/io.mjs";
import {
  assertCrawlPerformanceHostIdentity,
  assertCrawlPerformanceRaw,
  createCrawleePerformanceRunner,
  createStasisPerformanceRunner,
} from "./crawl.mjs";
import { assertCleanHarnessWorktreeEvidence } from "./harness-worktree.mjs";
import {
  performanceReplicationArtifactBindingSchema,
} from "./replication-artifact-binding.mjs";
import {
  performanceReplicationExpectedArtifactNames,
  performanceReplicationHostedIdentity,
  performanceReplicationHostedProvenanceSchema,
} from "./replication-hosted-provenance.mjs";
import {
  freshPerformanceTrigger,
  immutablePerformanceHarness,
  performanceReplicationVerificationSchema,
} from "./replication.mjs";

export const crawlPhaseDiagnosticSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-v1";
export const crawlPhaseDiagnosticProtocol =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-v1";
export const crawlPhaseDiagnosticTrack = "deterministic-crawl-20-page";
export const crawlPhaseDiagnosticEvidenceSchema =
  "stasis-v0.3.3-performance-crawl-phase-localization-evidence-v1";
export const crawlPhaseDiagnosticEvidenceProtocol =
  "stasis-v0.3.3-performance-crawl-phase-localization-v1";

const lanes = Object.freeze(["crawlee", "stasis"]);
const nonnegativeIntegerPattern = /^(?:0|[1-9][0-9]*)$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const authorityWorkflow = "Stasis v0.3.3 performance evidence";
const authorityCrawlJob = "ubuntu-crawl";
const authorityCrawlHostedJob = "Ubuntu 22.04 Crawlee vs Stasis";
const authorityCrawlArtifact = "stasis-v0.3.3-performance-crawl-raw-attempt-1";
const artifactBindingVerificationKeys = Object.freeze([
  "exactSevenArchiveSet",
  "allArchiveSizesAndDigestsMatchHostedReceipt",
  "onlyThreeEvidenceArchivesParsed",
  "parsedInventoriesExactAndSafe",
  "laneRawCopiesByteIdentical",
  "combinedChecksumsExact",
  "semanticFreshFileBoundaryMatched",
  "semanticAndHostedWorkflowMatched",
  "laneJobsMatched",
  "rawContentsRetained",
  "urlsRetained",
]);
const publishedCrawlRawSha256 =
  "7db718346d73e3acf3b6919f20318929e60e2a15d5c5f954f849a6b46fa054db";
const intervalSettlements = new Set(["fulfilled", "rejected", "not_observed"]);
const intervalClockStatuses = new Set(["complete", "invalid", "incomplete"]);
const intervalReasons = new Set([
  "callback_not_entered",
  "callback_not_settled",
  "browser_close_not_observed",
]);

/**
 * These observations explain where elapsed time was spent. They are
 * deliberately incompatible with the frozen benchmark raw/statistics schemas.
 */
export const crawlPhaseDiagnosticRules = deepFreeze({
  purpose: "phase_localization_diagnostic_only",
  workload: {
    start: startUrl,
    pageLimit: maxPages,
    depthLimit: maxDepth,
    concurrency,
  },
  runnerSource: "src/performance/crawl.mjs",
  runnerSubstitution: false,
  retries: false,
  sleeps: false,
  fallbacks: false,
  discardedFailures: false,
  clock: "injected_monotonic_nanoseconds",
  rawIntervalsRetained: true,
  phaseDurationsAreBenchmarkSamples: false,
  phaseDurationsMayBePooledAcrossObservationsOrHosts: false,
  phaseDurationsMayBeSummedWithinOneObservationAfterNonOverlapValidation: true,
  crawleeWorkloadWindowMeaning:
    "browser_launch_settlement_through_first_browser_close_invocation",
  stasisAcquireOpenMeaning:
    "pool_run_invocation_through_work_callback_entry",
  stasisSettleExtractMeaning:
    "work_callback_entry_through_work_callback_settlement",
  stasisReleasePhysicalCleanupMeaning:
    "work_callback_settlement_through_pool_run_settlement",
  stasisPoolCloseMeaning:
    "pool_close_invocation_through_pool_close_settlement",
});

export function createCrawlPhaseDiagnosticJob({ lane, ordinal }) {
  assertLane(lane);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new TypeError("A positive diagnostic observation ordinal is required");
  }
  return deepFreeze({
    phase: "diagnostic",
    lane,
    ordinal,
    crawl: {
      start: startUrl,
      pageLimit: maxPages,
      depthLimit: maxDepth,
    },
  });
}

/**
 * Wraps the public v0.3.3 SDK dependency passed to the unchanged authoritative
 * Stasis runner. The wrapper observes pool boundaries but delegates every
 * operation to the same SDK and pool objects exactly once.
 */
export function createStasisCrawlPhaseDiagnosticRunner({
  identity,
  sdk,
  sdkVersion,
  executablePath,
  environment = process.env,
  now = () => process.hrtime.bigint(),
}) {
  const retainedIdentity = cloneJsonRecord(identity, "diagnostic identity");
  const recorder = createPhaseRecorder(now);
  const instrumentedSdk = instrumentStasisSdk(sdk, recorder);
  const runner = createStasisPerformanceRunner({
    sdk: instrumentedSdk,
    sdkVersion,
    executablePath,
    environment,
  });
  return singleUseDiagnosticRunner({
    lane: "stasis",
    identity: retainedIdentity,
    runner,
    recorder,
  });
}

/**
 * Wraps the Playwright launcher passed to the unchanged authoritative Crawlee
 * runner. Browser launch, browser-resident work, and close are observed without
 * replacing Crawlee, PlaywrightCrawler, or the selected launcher.
 */
export function createCrawleeCrawlPhaseDiagnosticRunner({
  identity,
  launcher = chromium,
  now = () => process.hrtime.bigint(),
}) {
  const retainedIdentity = cloneJsonRecord(identity, "diagnostic identity");
  const recorder = createPhaseRecorder(now);
  const instrumentedLauncher = instrumentPlaywrightLauncher(launcher, recorder);
  const runner = createCrawleePerformanceRunner({ launcher: instrumentedLauncher });
  return singleUseDiagnosticRunner({
    lane: "crawlee",
    identity: retainedIdentity,
    runner,
    recorder,
  });
}

/**
 * Exposes only the dependency hook for focused verification. Production
 * diagnostic execution should use createCrawleeCrawlPhaseDiagnosticRunner so
 * the real performance runner cannot be substituted.
 */
export function createCrawleeLauncherPhaseInstrumentation({
  launcher,
  now = () => process.hrtime.bigint(),
}) {
  const recorder = createPhaseRecorder(now);
  return Object.freeze({
    launcher: instrumentPlaywrightLauncher(launcher, recorder),
    snapshot: () => recorder.snapshot(),
  });
}

export function assertCrawlPhaseDiagnostic(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "schema",
    "protocol",
    "track",
    "purpose",
    "authorityEligible",
    "timingEligible",
    "statisticsEligible",
    "comparisonEligible",
    "optimizationEligible",
    "rules",
    "identity",
    "job",
    "lane",
    "runner",
    "settlement",
    "outerInterval",
    "clockReads",
    "phases",
  ])) {
    throw new TypeError("Invalid crawl phase diagnostic artifact");
  }
  if (
    value.schema !== crawlPhaseDiagnosticSchema ||
    value.protocol !== crawlPhaseDiagnosticProtocol ||
    value.track !== crawlPhaseDiagnosticTrack ||
    value.purpose !== "phase_localization_diagnostic_only" ||
    value.authorityEligible !== false ||
    value.timingEligible !== false ||
    value.statisticsEligible !== false ||
    value.comparisonEligible !== false ||
    value.optimizationEligible !== false ||
    !isDeepStrictEqual(value.rules, crawlPhaseDiagnosticRules)
  ) {
    throw new TypeError("Crawl phase diagnostics are not benchmark authority");
  }

  assertJsonRecord(value.identity, "diagnostic identity");
  assertLane(value.lane);
  assertDiagnosticJob(value.job, value.lane);
  assertRunnerIdentity(value.runner, value.lane);
  assertRunnerSettlement(value.settlement);

  const clockReads = assertClockReads(value.clockReads);
  assertInterval(value.outerInterval, "runner_total", clockReads);
  if (value.outerInterval.settlement !== value.settlement.status) {
    throw new TypeError("Diagnostic outer interval does not match runner settlement");
  }

  if (value.lane === "stasis") {
    assertStasisPhases(value.phases, clockReads, value.outerInterval);
  } else {
    assertCrawleePhases(value.phases, clockReads, value.outerInterval);
  }
  return value;
}

/**
 * Binds a parsed authoritative crawl result to the exact bytes supplied by the
 * hosted authority job. The published observation is explicitly rejected: a
 * phase-localization run must consume the fresh replication authority.
 */
export function bindAuthoritativeCrawlRaw({
  raw,
  bytes,
  sha256,
  artifactBindingReceipt,
}) {
  if (!sha256Pattern.test(sha256 ?? "")) {
    throw new TypeError("The authoritative crawl raw SHA-256 is invalid");
  }
  const retainedBytes = exactBytes(bytes);
  const actualSha256 = createHash("sha256").update(retainedBytes).digest("hex");
  if (actualSha256 !== sha256) {
    throw new TypeError("The authoritative crawl raw file SHA-256 does not match its bytes");
  }
  if (actualSha256 === publishedCrawlRawSha256) {
    throw new TypeError("Phase localization requires a fresh crawl authority, not the published raw");
  }
  let parsed;
  try {
    parsed = JSON.parse(retainedBytes.toString("utf8"));
  } catch (error) {
    throw new TypeError("The authoritative crawl raw file is not valid JSON", { cause: error });
  }
  if (!isDeepStrictEqual(parsed, raw)) {
    throw new TypeError("The parsed crawl authority does not match the exact supplied file bytes");
  }
  const retainedRaw = structuredClone(raw);
  assertCrawlPerformanceRaw(retainedRaw);
  if (
    retainedRaw.authority.valid !== true ||
    retainedRaw.authority.status !== "valid" ||
    retainedRaw.identity.provenance.runAttempt !== "1"
  ) {
    throw new TypeError("Phase localization requires one valid first-attempt crawl authority");
  }
  const artifactBinding = assertArtifactBindingReceipt({
    value: artifactBindingReceipt,
    provenance: retainedRaw.identity.provenance,
    authorityBytes: retainedBytes.byteLength,
    authoritySha256: actualSha256,
  });
  const oracle = authorityOracle(retainedRaw);
  const binding = deepFreeze({
    fileSha256: actualSha256,
    fileBytes: retainedBytes.byteLength,
    schema: retainedRaw.schema,
    protocol: retainedRaw.protocol,
    track: retainedRaw.track,
    workflowProvenance: structuredClone(retainedRaw.identity.provenance),
    host: structuredClone(retainedRaw.identity.host),
    softwareIdentity: {
      crawlee: projectHostIndependentSoftwareIdentity(retainedRaw.identity.crawlee),
      stasis: projectHostIndependentSoftwareIdentity(retainedRaw.identity.stasis),
    },
    hostRuntime: {
      stasisEglRuntime: structuredClone(retainedRaw.identity.stasis.eglRuntime),
    },
    artifactBinding,
    oraclePairIndex: 1,
    oracleResultSha256: {
      crawlee: sha256Json(oracle.crawlee.run.result),
      stasis: sha256Json(oracle.stasis.run.result),
    },
  });
  return deepFreeze({ raw: retainedRaw, binding });
}

export function createCrawlPhaseDiagnosticInputIdentity({
  authorityBinding,
  diagnosticAttestation,
}) {
  assertAuthorityBinding(authorityBinding);
  assertDiagnosticAttestation(diagnosticAttestation, authorityBinding);
  return deepFreeze({
    authorityInput: structuredClone(authorityBinding),
    diagnosticAttestation: structuredClone(diagnosticAttestation),
  });
}

/**
 * Produces the only statistics-like view permitted for phase diagnostics:
 * within-one-observation sums after interval non-overlap has been proven. It
 * never reads or combines the authority sample's elapsed time.
 */
export function composeCrawlPhaseDiagnosticEvidence({
  authoritativeRaw,
  authoritativeRawBytes,
  authoritativeRawBytesAfterDiagnostics,
  authoritativeRawSha256,
  artifactBindingReceipt,
  diagnosticAttestation,
  crawleeDiagnostic,
  stasisDiagnostic,
}) {
  return deepFreeze(buildCrawlPhaseDiagnosticEvidence({
    authoritativeRaw,
    authoritativeRawBytes,
    authoritativeRawBytesAfterDiagnostics,
    authoritativeRawSha256,
    artifactBindingReceipt,
    diagnosticAttestation,
    crawleeDiagnostic,
    stasisDiagnostic,
  }));
}

export function assertCrawlPhaseDiagnosticEvidence(value, {
  authoritativeRaw,
  authoritativeRawBytes,
  authoritativeRawBytesAfterDiagnostics,
  authoritativeRawSha256,
  artifactBindingReceipt,
} = {}) {
  if (!isPlainRecord(value)) {
    throw new TypeError("Invalid crawl phase localization evidence");
  }
  const expected = buildCrawlPhaseDiagnosticEvidence({
    authoritativeRaw,
    authoritativeRawBytes,
    authoritativeRawBytesAfterDiagnostics,
    authoritativeRawSha256,
    artifactBindingReceipt,
    diagnosticAttestation: value.diagnosticAttestation,
    crawleeDiagnostic: value.observations?.crawlee,
    stasisDiagnostic: value.observations?.stasis,
  });
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError("Crawl phase localization evidence does not replay exactly");
  }
  return value;
}

function buildCrawlPhaseDiagnosticEvidence({
  authoritativeRaw,
  authoritativeRawBytes,
  authoritativeRawBytesAfterDiagnostics,
  authoritativeRawSha256,
  artifactBindingReceipt,
  diagnosticAttestation,
  crawleeDiagnostic,
  stasisDiagnostic,
}) {
  const beforeBytes = exactBytes(authoritativeRawBytes);
  const afterBytes = exactBytes(authoritativeRawBytesAfterDiagnostics);
  if (!beforeBytes.equals(afterBytes)) {
    throw new TypeError("The authoritative crawl raw file changed during phase diagnostics");
  }
  const authority = bindAuthoritativeCrawlRaw({
    raw: authoritativeRaw,
    bytes: beforeBytes,
    sha256: authoritativeRawSha256,
    artifactBindingReceipt,
  });
  const authorityReadback = bindAuthoritativeCrawlRaw({
    raw: authoritativeRaw,
    bytes: afterBytes,
    sha256: authoritativeRawSha256,
    artifactBindingReceipt,
  });
  if (!isDeepStrictEqual(authority.binding, authorityReadback.binding)) {
    throw new TypeError("The authoritative crawl raw binding changed during phase diagnostics");
  }
  assertDiagnosticAttestation(diagnosticAttestation, authority.binding);
  const inputIdentity = createCrawlPhaseDiagnosticInputIdentity({
    authorityBinding: authority.binding,
    diagnosticAttestation,
  });
  const oracle = authorityOracle(authority.raw);
  const crawlee = assertSuccessfulDiagnostic({
    artifact: crawleeDiagnostic,
    lane: "crawlee",
    ordinal: 1,
    inputIdentity,
    oracleObservation: oracle.crawlee,
  });
  const stasis = assertSuccessfulDiagnostic({
    artifact: stasisDiagnostic,
    lane: "stasis",
    ordinal: 2,
    inputIdentity,
    oracleObservation: oracle.stasis,
  });
  const crawleeLocalization = localizeCrawlee(crawlee);
  const stasisLocalization = localizeStasis(stasis);

  return {
    schema: crawlPhaseDiagnosticEvidenceSchema,
    protocol: crawlPhaseDiagnosticEvidenceProtocol,
    track: crawlPhaseDiagnosticTrack,
    purpose: "phase_localization_diagnostic_only",
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    authorityInput: structuredClone(authority.binding),
    authorityInputContinuity: {
      beforeSha256: authority.binding.fileSha256,
      afterSha256: authorityReadback.binding.fileSha256,
      beforeBytes: authority.binding.fileBytes,
      afterBytes: authorityReadback.binding.fileBytes,
      exactBytesUnchanged: true,
    },
    diagnosticAttestation: structuredClone(diagnosticAttestation),
    hostRelation: {
      authorityHostClassDigest: authority.binding.host.hostClassDigest,
      diagnosticHostClassDigest: diagnosticAttestation.host.hostClassDigest,
      hostClass: authority.binding.host.hostClassDigest ===
          diagnosticAttestation.host.hostClassDigest
        ? "same_class"
        : "different_class",
      bootInstance: "distinct",
      stasisEglRuntime: isDeepStrictEqual(
          authority.binding.hostRuntime.stasisEglRuntime,
          diagnosticAttestation.stasis.eglRuntime,
        )
        ? "same"
        : "different",
      timingCombinedAcrossHosts: false,
    },
    order: ["crawlee", "stasis"],
    observations: {
      crawlee: structuredClone(crawlee),
      stasis: structuredClone(stasis),
    },
    correctness: {
      oraclePairIndex: 1,
      crawlee: {
        status: "exact_page_result_match",
        pages: crawlee.settlement.run.result.pages.length,
        resultSha256: sha256Json(crawlee.settlement.run.result),
      },
      stasis: {
        status: "exact_page_result_match",
        pages: stasis.settlement.run.result.pages.length,
        resultSha256: sha256Json(stasis.settlement.run.result),
      },
    },
    localization: {
      status: "valid_non_authoritative_within_observation_localization",
      concurrency,
      intervalNonOverlapValidated: true,
      authorityTimingReadOrCombined: false,
      crossHostPooling: "none",
      phaseSumsAreBenchmarkSamples: false,
      phaseSumsAuthorizeOptimization: false,
      crawlee: crawleeLocalization,
      stasis: stasisLocalization,
    },
  };
}

function authorityOracle(raw) {
  const pair = raw.pairs.find(({ pairIndex }) => pairIndex === 1);
  if (pair?.observations?.length !== 2) {
    throw new TypeError("The authoritative crawl oracle pair is incomplete");
  }
  const selected = {};
  for (const lane of lanes) {
    const observation = pair.observations.find((entry) => entry.lane === lane);
    if (
      observation?.status !== "completed" ||
      observation.oracle?.valid !== true ||
      observation.run?.success !== true ||
      observation.run?.cleanup?.status !== "passed" ||
      observation.run?.result?.pages?.length !== maxPages
    ) {
      throw new TypeError(`The authoritative ${lane} crawl oracle sample is invalid`);
    }
    selected[lane] = observation;
  }
  return selected;
}

function assertSuccessfulDiagnostic({
  artifact,
  lane,
  ordinal,
  inputIdentity,
  oracleObservation,
}) {
  assertCrawlPhaseDiagnostic(artifact);
  if (!isDeepStrictEqual(artifact.identity, inputIdentity)) {
    throw new TypeError(`${lane} diagnostic is not bound to the authority and host attestation`);
  }
  if (!isDeepStrictEqual(
    artifact.job,
    createCrawlPhaseDiagnosticJob({ lane, ordinal }),
  )) {
    throw new TypeError(`${lane} diagnostic order or workload changed`);
  }
  if (
    artifact.settlement.status !== "fulfilled" ||
    artifact.settlement.run?.success !== true ||
    artifact.settlement.run?.cleanup?.status !== "passed"
  ) {
    throw new TypeError(`${lane} diagnostic run or cleanup did not fulfill successfully`);
  }
  if (!isDeepStrictEqual(artifact.settlement.run.result, oracleObservation.run.result)) {
    throw new TypeError(`${lane} diagnostic page result does not match its authoritative sample`);
  }
  return artifact;
}

function localizeStasis(artifact) {
  const phases = artifact.phases;
  if (
    phases.poolCreations.length !== 1 ||
    phases.poolRuns.length !== maxPages ||
    phases.poolCloses.length !== 1
  ) {
    throw new TypeError("Stasis localization requires 1 pool, 20 runs, and 1 pool close");
  }
  const poolCreation = [requiredCompleteInterval(
    phases.poolCreations[0].interval,
    "Stasis pool creation",
  )];
  const acquireOpen = [];
  const settleExtract = [];
  const releasePhysicalCleanup = [];
  let priorRunEnd = null;
  phases.poolRuns.forEach((run, index) => {
    if (run.requestedUrl !== artifact.settlement.run.result.pages[index]?.requestedUrl) {
      throw new TypeError("Stasis pool-run URL order does not match its exact page result");
    }
    const acquire = requiredCompleteInterval(run.acquireOpen, "Stasis acquire/open");
    if (
      priorRunEnd !== null &&
      BigInt(acquire.start.nanoseconds) < BigInt(priorRunEnd.nanoseconds)
    ) {
      throw new TypeError("Stasis pool runs are not sequential");
    }
    acquireOpen.push(acquire);
    settleExtract.push(requiredCompleteInterval(run.settleExtract, "Stasis settle/extract"));
    const release = requiredCompleteInterval(
      run.releasePhysicalCleanup,
      "Stasis release/physical cleanup",
    );
    releasePhysicalCleanup.push(release);
    priorRunEnd = release.end;
  });
  const poolClose = [requiredCompleteInterval(
    phases.poolCloses[0].interval,
    "Stasis pool close",
  )];
  if (
    BigInt(poolCreation[0].end.nanoseconds) > BigInt(acquireOpen[0].start.nanoseconds) ||
    BigInt(releasePhysicalCleanup.at(-1).end.nanoseconds) >
      BigInt(poolClose[0].start.nanoseconds)
  ) {
    throw new TypeError("Stasis pool lifecycle is not sequential");
  }
  const all = [
    ...poolCreation,
    ...acquireOpen,
    ...settleExtract,
    ...releasePhysicalCleanup,
    ...poolClose,
  ];
  assertNonOverlappingIntervals(all, "Stasis");
  const total = requiredCompleteInterval(artifact.outerInterval, "Stasis runner total");
  return localizationSums({
    total,
    components: {
      poolCreationNs: poolCreation,
      acquireOpenNs: acquireOpen,
      settleExtractNs: settleExtract,
      releasePhysicalCleanupNs: releasePhysicalCleanup,
      poolCloseNs: poolClose,
    },
    counts: {
      poolCreations: 1,
      poolRuns: maxPages,
      poolCloses: 1,
    },
  });
}

function localizeCrawlee(artifact) {
  const phases = artifact.phases;
  if (
    phases.launches.length !== 1 ||
    phases.browsers.length !== 1 ||
    phases.browsers[0].closes.length !== 1
  ) {
    throw new TypeError("Crawlee localization requires 1 launch, 1 browser, and 1 close");
  }
  const launch = [requiredCompleteInterval(
    phases.launches[0].interval,
    "Crawlee launch",
  )];
  const workload = [requiredCompleteInterval(
    phases.browsers[0].workloadWindow,
    "Crawlee browser workload",
  )];
  const close = [requiredCompleteInterval(
    phases.browsers[0].closes[0].interval,
    "Crawlee browser close",
  )];
  const all = [...launch, ...workload, ...close];
  assertNonOverlappingIntervals(all, "Crawlee");
  const total = requiredCompleteInterval(artifact.outerInterval, "Crawlee runner total");
  return localizationSums({
    total,
    components: {
      browserLaunchNs: launch,
      browserResidentWorkloadNs: workload,
      browserCloseNs: close,
    },
    counts: { launches: 1, browsers: 1, closes: 1 },
  });
}

function requiredCompleteInterval(interval, label) {
  if (
    interval?.settlement !== "fulfilled" ||
    interval.clockStatus !== "complete" ||
    typeof interval.durationNs !== "string"
  ) {
    throw new TypeError(`${label} must be one fulfilled complete interval`);
  }
  return interval;
}

function assertNonOverlappingIntervals(intervals, lane) {
  const ordered = [...intervals].sort((left, right) => {
    const a = BigInt(left.start.nanoseconds);
    const b = BigInt(right.start.nanoseconds);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  let priorEnd = null;
  for (const interval of ordered) {
    const startNs = BigInt(interval.start.nanoseconds);
    const endNs = BigInt(interval.end.nanoseconds);
    if (endNs < startNs || (priorEnd !== null && startNs < priorEnd)) {
      throw new TypeError(`${lane} diagnostic phase intervals overlap`);
    }
    priorEnd = endNs;
  }
}

function localizationSums({ total, components, counts }) {
  const componentSums = Object.fromEntries(Object.entries(components).map(
    ([name, intervals]) => [name, sumIntervals(intervals).toString(10)],
  ));
  const observed = Object.values(componentSums)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  const runnerTotal = BigInt(total.durationNs);
  const residual = runnerTotal - observed;
  if (residual < 0n) {
    throw new TypeError("Diagnostic observed phase sum exceeds its runner boundary");
  }
  return {
    scope: "one_diagnostic_observation_on_one_host",
    intervalsNonOverlapping: true,
    counts,
    runnerTotalNs: runnerTotal.toString(10),
    ...componentSums,
    observedPhaseSumNs: observed.toString(10),
    residualNs: residual.toString(10),
    authorityTimingCombined: false,
    benchmarkSample: false,
    optimizationProof: false,
  };
}

function sumIntervals(intervals) {
  return intervals.reduce((sum, interval) => sum + BigInt(interval.durationNs), 0n);
}

function assertArtifactBindingReceipt({
  value,
  provenance,
  authorityBytes,
  authoritySha256,
}) {
  assertExactRecord(value, [
    "schema",
    "status",
    "pooling",
    "claimBoundary",
    "decisionState",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
    "inputs",
    "artifactArchives",
    "extractedFiles",
    "verification",
  ], "performance replication artifact-binding receipt");
  if (
    value.schema !== performanceReplicationArtifactBindingSchema ||
    value.status !== "passed" ||
    value.pooling !== "none" ||
    value.claimBoundary !== "two_separate_single_host_observations_only" ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false
  ) {
    throw new TypeError("Artifact-binding receipt changes the sealed replication claim boundary");
  }

  assertExactRecord(value.inputs, [
    "semanticReceiptSchema",
    "hostedReceiptSchema",
    "workflow",
  ], "artifact-binding inputs");
  if (
    value.inputs.semanticReceiptSchema !== performanceReplicationVerificationSchema ||
    value.inputs.hostedReceiptSchema !== performanceReplicationHostedProvenanceSchema
  ) {
    throw new TypeError("Artifact-binding receipt input schemas are not the stabilized replication schemas");
  }

  const workflow = assertArtifactBindingWorkflow(value.inputs.workflow, provenance);
  assertArtifactArchives(value.artifactArchives);
  const crawlLaneRaw = assertArtifactBindingExtractedFiles(
    value.extractedFiles,
    authorityBytes,
    authoritySha256,
  );
  assertArtifactBindingVerification(value.verification);

  return deepFreeze({
    schema: value.schema,
    status: value.status,
    pooling: value.pooling,
    claimBoundary: value.claimBoundary,
    decisionState: value.decisionState,
    generalizedSpeedClaimAuthorized: value.generalizedSpeedClaimAuthorized,
    implementationWorkAuthorized: value.implementationWorkAuthorized,
    inputs: {
      semanticReceiptSchema: value.inputs.semanticReceiptSchema,
      hostedReceiptSchema: value.inputs.hostedReceiptSchema,
      workflow,
    },
    crawlLaneRaw,
    verification: {
      exactSevenArchiveSet: true,
      laneRawCopiesByteIdentical: true,
      semanticFreshFileBoundaryMatched: true,
      semanticAndHostedWorkflowMatched: true,
      laneJobsMatched: true,
      rawContentsRetained: false,
      urlsRetained: false,
    },
  });
}

function assertArtifactBindingWorkflow(value, provenance) {
  assertExactRecord(value, [
    "provider",
    "repository",
    "workflow",
    "runId",
    "runAttempt",
    "workflowSourceSha",
    "workflowSourceRef",
    "jobs",
  ], "artifact-binding workflow");
  assertDiagnosticSourceProvenance(provenance, { authoritative: true });
  const frozenChecks = [
    [provenance.provider, "github-actions", "authority provider"],
    [provenance.repository, performanceReplicationHostedIdentity.repository, "authority repository"],
    [provenance.workflow, authorityWorkflow, "authority workflow"],
    [provenance.job, authorityCrawlJob, "authority job"],
    [provenance.runAttempt, freshPerformanceTrigger.workflowRunAttempt, "authority run attempt"],
    [provenance.workflowSourceSha, freshPerformanceTrigger.workflowSourceSha, "authority source SHA"],
    [provenance.workflowSourceRef, freshPerformanceTrigger.workflowSourceRef, "authority source ref"],
    [provenance.harnessCheckoutRevision, immutablePerformanceHarness.revision, "authority harness revision"],
    [provenance.harnessCheckoutTree, immutablePerformanceHarness.tree, "authority harness tree"],
    [value.provider, provenance.provider, "receipt provider"],
    [value.repository, provenance.repository, "receipt repository"],
    [value.workflow, provenance.workflow, "receipt workflow"],
    [String(value.runId), provenance.runId, "receipt run ID"],
    [String(value.runAttempt), provenance.runAttempt, "receipt run attempt"],
    [value.workflowSourceSha, provenance.workflowSourceSha, "receipt source SHA"],
    [value.workflowSourceRef, provenance.workflowSourceRef, "receipt source ref"],
  ];
  for (const [actual, expected, label] of frozenChecks) {
    if (actual !== expected) {
      throw new TypeError(`Artifact-binding ${label} does not match the fresh crawl authority`);
    }
  }
  if (!Number.isSafeInteger(value.runId) || value.runId < 1 || value.runId === 33851425108 ||
    value.runAttempt !== 1) {
    throw new TypeError("Artifact-binding workflow run identity is not the fresh first attempt");
  }

  assertExactRecord(value.jobs, ["rwa", "crawl", "combined"], "artifact-binding workflow jobs");
  assertExactRecord(value.jobs.rwa, ["lane", "hostedName", "hostedJobId"], "artifact-binding RWA job");
  assertExactRecord(value.jobs.crawl, ["lane", "hostedName", "hostedJobId"], "artifact-binding crawl job");
  assertExactRecord(value.jobs.combined, ["hostedName", "hostedJobId"], "artifact-binding combined job");
  if (
    value.jobs.rwa.lane !== "windows-rwa" ||
    value.jobs.rwa.hostedName !== "Windows 2022 RWA Cypress vs Stasis" ||
    value.jobs.crawl.lane !== authorityCrawlJob ||
    value.jobs.crawl.hostedName !== authorityCrawlHostedJob ||
    value.jobs.combined.hostedName !== "Combine and verify performance evidence"
  ) {
    throw new TypeError("Artifact-binding workflow jobs differ from the frozen replication jobs");
  }
  const jobIds = [
    value.jobs.rwa.hostedJobId,
    value.jobs.crawl.hostedJobId,
    value.jobs.combined.hostedJobId,
  ];
  if (jobIds.some((id) => !Number.isSafeInteger(id) || id < 1) ||
    new Set(jobIds).size !== jobIds.length) {
    throw new TypeError("Artifact-binding workflow job IDs are invalid or duplicated");
  }

  return {
    provider: value.provider,
    repository: value.repository,
    workflow: value.workflow,
    runId: value.runId,
    runAttempt: value.runAttempt,
    workflowSourceSha: value.workflowSourceSha,
    workflowSourceRef: value.workflowSourceRef,
    crawlJob: structuredClone(value.jobs.crawl),
  };
}

function assertArtifactArchives(value) {
  if (!Array.isArray(value) || value.length !== performanceReplicationExpectedArtifactNames.length) {
    throw new TypeError("Artifact-binding receipt does not retain the exact seven archives");
  }
  const ids = new Set();
  value.forEach((entry, index) => {
    assertExactRecord(entry, ["name", "artifactId", "bytes", "sha256"], "artifact-binding archive");
    if (
      entry.name !== performanceReplicationExpectedArtifactNames[index] ||
      !Number.isSafeInteger(entry.artifactId) || entry.artifactId < 1 || ids.has(entry.artifactId) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 ||
      !sha256Pattern.test(entry.sha256 ?? "")
    ) {
      throw new TypeError("Artifact-binding archive inventory is invalid");
    }
    ids.add(entry.artifactId);
  });
}

function assertArtifactBindingExtractedFiles(value, authorityBytes, authoritySha256) {
  assertExactRecord(value, [
    "rwaLaneRaw",
    "crawlLaneRaw",
    "combinedArchive",
  ], "artifact-binding extracted files");
  assertExtractedFile(value.rwaLaneRaw, "artifact-binding RWA lane raw");
  const crawl = assertExtractedFile(value.crawlLaneRaw, "artifact-binding crawl lane raw");
  if (
    crawl.archive !== authorityCrawlArtifact ||
    crawl.name !== "crawl-raw.json" ||
    crawl.bytes !== authorityBytes ||
    crawl.sha256 !== authoritySha256
  ) {
    throw new TypeError("Artifact-binding crawl lane raw does not match the exact authority bytes");
  }
  const combinedNames = [
    "performance/SHA256SUMS.txt",
    "performance/combined-evidence.json",
    "performance/combined-evidence.md",
    "performance/combined-verification.json",
    "performance/crawl-raw.json",
    "performance/independent-statistics-replay.json",
    "performance/rwa-raw.json",
  ];
  if (!Array.isArray(value.combinedArchive) || value.combinedArchive.length !== combinedNames.length) {
    throw new TypeError("Artifact-binding combined extracted-file inventory is invalid");
  }
  value.combinedArchive.forEach((entry, index) => {
    assertExactRecord(entry, ["name", "bytes", "sha256"], "artifact-binding combined file");
    if (entry.name !== combinedNames[index] || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 ||
      !sha256Pattern.test(entry.sha256 ?? "")) {
      throw new TypeError("Artifact-binding combined extracted-file inventory is invalid");
    }
  });
  const combinedCrawl = value.combinedArchive[4];
  if (combinedCrawl.bytes !== authorityBytes || combinedCrawl.sha256 !== authoritySha256) {
    throw new TypeError("Artifact-binding combined crawl copy does not match the exact authority bytes");
  }
  return structuredClone(crawl);
}

function assertExtractedFile(value, label) {
  assertExactRecord(value, ["archive", "name", "bytes", "sha256"], label);
  if (typeof value.archive !== "string" || value.archive.length === 0 ||
    typeof value.name !== "string" || value.name.length === 0 ||
    !Number.isSafeInteger(value.bytes) || value.bytes < 1 ||
    !sha256Pattern.test(value.sha256 ?? "")) {
    throw new TypeError(`${label} identity is invalid`);
  }
  return value;
}

function assertArtifactBindingVerification(value) {
  assertExactRecord(value, artifactBindingVerificationKeys, "artifact-binding verification");
  for (const key of artifactBindingVerificationKeys) {
    const expected = key === "rawContentsRetained" || key === "urlsRetained" ? false : true;
    if (value[key] !== expected) {
      throw new TypeError(`Artifact-binding verification is not sealed: ${key}`);
    }
  }
}

function assertExactRecord(value, keys, label) {
  if (!hasExactKeys(value, keys)) {
    throw new TypeError(`${label} has an invalid exact shape`);
  }
  return value;
}

function assertAuthorityBinding(value) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "fileSha256",
    "fileBytes",
    "schema",
    "protocol",
    "track",
    "workflowProvenance",
    "host",
    "softwareIdentity",
    "hostRuntime",
    "artifactBinding",
    "oraclePairIndex",
    "oracleResultSha256",
  ]) || !sha256Pattern.test(value.fileSha256 ?? "") ||
    !Number.isSafeInteger(value.fileBytes) || value.fileBytes < 1 ||
    value.oraclePairIndex !== 1 ||
    !isPlainRecord(value.softwareIdentity) ||
    !hasExactKeys(value.softwareIdentity, ["crawlee", "stasis"]) ||
    !isPlainRecord(value.hostRuntime) ||
    !hasExactKeys(value.hostRuntime, ["stasisEglRuntime"]) ||
    !isPlainRecord(value.oracleResultSha256) ||
    !hasExactKeys(value.oracleResultSha256, ["crawlee", "stasis"]) ||
    !sha256Pattern.test(value.oracleResultSha256.crawlee ?? "") ||
    !sha256Pattern.test(value.oracleResultSha256.stasis ?? "")) {
    throw new TypeError("Invalid authoritative crawl input binding");
  }
  assertCrawlPerformanceHostIdentity(value.host);
  assertJsonRecord(value.softwareIdentity.crawlee, "authoritative Crawlee software identity");
  assertJsonRecord(value.softwareIdentity.stasis, "authoritative Stasis software identity");
  assertJsonRecord(value.hostRuntime.stasisEglRuntime, "authoritative Stasis host runtime");
  assertBoundedArtifactBinding(value.artifactBinding, value);
  assertDiagnosticSourceProvenance(value.workflowProvenance, { authoritative: true });
  return value;
}

function assertBoundedArtifactBinding(value, authorityBinding) {
  assertExactRecord(value, [
    "schema",
    "status",
    "pooling",
    "claimBoundary",
    "decisionState",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
    "inputs",
    "crawlLaneRaw",
    "verification",
  ], "bounded artifact-binding identity");
  if (
    value.schema !== performanceReplicationArtifactBindingSchema ||
    value.status !== "passed" || value.pooling !== "none" ||
    value.claimBoundary !== "two_separate_single_host_observations_only" ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false
  ) {
    throw new TypeError("Invalid bounded artifact-binding claim boundary");
  }
  assertExactRecord(value.inputs, [
    "semanticReceiptSchema",
    "hostedReceiptSchema",
    "workflow",
  ], "bounded artifact-binding inputs");
  if (value.inputs.semanticReceiptSchema !== performanceReplicationVerificationSchema ||
    value.inputs.hostedReceiptSchema !== performanceReplicationHostedProvenanceSchema) {
    throw new TypeError("Invalid bounded artifact-binding input schemas");
  }
  const workflow = value.inputs.workflow;
  assertExactRecord(workflow, [
    "provider",
    "repository",
    "workflow",
    "runId",
    "runAttempt",
    "workflowSourceSha",
    "workflowSourceRef",
    "crawlJob",
  ], "bounded artifact-binding workflow");
  assertExactRecord(workflow.crawlJob, ["lane", "hostedName", "hostedJobId"], "bounded crawl job");
  assertExtractedFile(value.crawlLaneRaw, "bounded artifact-binding crawl raw");
  if (
    value.crawlLaneRaw.bytes !== authorityBinding.fileBytes ||
    value.crawlLaneRaw.sha256 !== authorityBinding.fileSha256 ||
    workflow.provider !== authorityBinding.workflowProvenance.provider ||
    workflow.repository !== authorityBinding.workflowProvenance.repository ||
    workflow.workflow !== authorityBinding.workflowProvenance.workflow ||
    String(workflow.runId) !== authorityBinding.workflowProvenance.runId ||
    String(workflow.runAttempt) !== authorityBinding.workflowProvenance.runAttempt ||
    workflow.workflowSourceSha !== authorityBinding.workflowProvenance.workflowSourceSha ||
    workflow.workflowSourceRef !== authorityBinding.workflowProvenance.workflowSourceRef ||
    workflow.crawlJob.lane !== authorityBinding.workflowProvenance.job
  ) {
    throw new TypeError("Bounded artifact-binding identity differs from its crawl authority");
  }
  assertExactRecord(value.verification, [
    "exactSevenArchiveSet",
    "laneRawCopiesByteIdentical",
    "semanticFreshFileBoundaryMatched",
    "semanticAndHostedWorkflowMatched",
    "laneJobsMatched",
    "rawContentsRetained",
    "urlsRetained",
  ], "bounded artifact-binding verification");
  if (
    value.verification.exactSevenArchiveSet !== true ||
    value.verification.laneRawCopiesByteIdentical !== true ||
    value.verification.semanticFreshFileBoundaryMatched !== true ||
    value.verification.semanticAndHostedWorkflowMatched !== true ||
    value.verification.laneJobsMatched !== true ||
    value.verification.rawContentsRetained !== false ||
    value.verification.urlsRetained !== false
  ) {
    throw new TypeError("Bounded artifact-binding verification is invalid");
  }
}

function assertDiagnosticAttestation(value, authorityBinding) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "host",
    "provenance",
    "crawlee",
    "stasis",
  ])) {
    throw new TypeError("Invalid crawl phase diagnostic host attestation");
  }
  assertCrawlPerformanceHostIdentity(value.host);
  assertDiagnosticSourceProvenance(value.provenance, { authoritative: false });
  if (value.host.bootInstanceDigest === authorityBinding.host.bootInstanceDigest) {
    throw new TypeError("Crawl phase diagnostics require a distinct hosted VM instance");
  }
  if (value.provenance.job === authorityBinding.workflowProvenance.job) {
    throw new TypeError("Crawl phase diagnostics require a distinct hosted job");
  }
  if (value.provenance.runAttempt !== "1") {
    throw new TypeError("Crawl phase diagnostics require a first-attempt hosted job");
  }
  assertJsonRecord(value.crawlee, "diagnostic Crawlee identity");
  assertJsonRecord(value.stasis, "diagnostic Stasis identity");
  if (
    value.crawlee.hostClassDigest !== value.host.hostClassDigest ||
    value.stasis.hostClassDigest !== value.host.hostClassDigest
  ) {
    throw new TypeError("Diagnostic software identities do not bind to the attested host class");
  }
  if (
    !isDeepStrictEqual(
      projectHostIndependentSoftwareIdentity(value.crawlee),
      authorityBinding.softwareIdentity.crawlee,
    ) ||
    !isDeepStrictEqual(
      projectHostIndependentSoftwareIdentity(value.stasis),
      authorityBinding.softwareIdentity.stasis,
    )
  ) {
    throw new TypeError("Diagnostic software identity differs from the crawl authority");
  }
  return value;
}

function projectHostIndependentSoftwareIdentity(value) {
  const retained = structuredClone(value);
  delete retained.hostClassDigest;
  delete retained.eglRuntime;
  return retained;
}

function assertDiagnosticSourceProvenance(value, { authoritative }) {
  const keys = [
    "provider",
    "repository",
    "workflow",
    "job",
    "runId",
    "runAttempt",
    "workflowSourceSha",
    "workflowSourceRef",
    "harnessCheckoutRevision",
    "harnessCheckoutTree",
    "harnessCheckoutWorktree",
  ];
  if (!isPlainRecord(value) || !hasExactKeys(value, keys) ||
    value.provider !== "github-actions" || value.repository !== "oxhq/stasis" ||
    typeof value.workflow !== "string" || value.workflow.length === 0 ||
    typeof value.job !== "string" || value.job.length === 0 ||
    typeof value.runId !== "string" || !/^[1-9][0-9]*$/u.test(value.runId) ||
    typeof value.runAttempt !== "string" || !/^[1-9][0-9]*$/u.test(value.runAttempt) ||
    !gitShaPattern.test(value.workflowSourceSha ?? "") ||
    typeof value.workflowSourceRef !== "string" || value.workflowSourceRef.length === 0 ||
    !gitShaPattern.test(value.harnessCheckoutRevision ?? "") ||
    !gitShaPattern.test(value.harnessCheckoutTree ?? "")) {
    throw new TypeError(`Invalid ${authoritative ? "authoritative" : "diagnostic"} workflow provenance`);
  }
  assertCleanHarnessWorktreeEvidence(value.harnessCheckoutWorktree);
  return value;
}

function exactBytes(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new TypeError("The authoritative crawl raw exact file bytes are required");
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function singleUseDiagnosticRunner({ lane, identity, runner, recorder }) {
  let used = false;
  return async (job) => {
    if (used) {
      throw new TypeError("A crawl phase diagnostic runner is single-use; retries are forbidden");
    }
    used = true;
    assertDiagnosticJob(job, lane);

    const outerStart = recorder.point(`${lane}:runner:start`);
    let settlement;
    try {
      const run = await runner(job);
      settlement = { status: "fulfilled", run: cloneJsonValue(run, "runner result") };
    } catch (error) {
      settlement = { status: "rejected", error: serializeError(error) };
    }
    const outerEnd = recorder.point(`${lane}:runner:end`);
    const outerInterval = makeInterval({
      label: "runner_total",
      start: outerStart,
      end: outerEnd,
      settlement: settlement.status,
      error: settlement.status === "rejected" ? settlement.error : null,
    });
    const snapshot = recorder.snapshot();
    const artifact = {
      schema: crawlPhaseDiagnosticSchema,
      protocol: crawlPhaseDiagnosticProtocol,
      track: crawlPhaseDiagnosticTrack,
      purpose: "phase_localization_diagnostic_only",
      authorityEligible: false,
      timingEligible: false,
      statisticsEligible: false,
      comparisonEligible: false,
      optimizationEligible: false,
      rules: structuredClone(crawlPhaseDiagnosticRules),
      identity: structuredClone(identity),
      job: structuredClone(job),
      lane,
      runner: runnerIdentity(lane),
      settlement,
      outerInterval,
      clockReads: snapshot.clockReads,
      phases: lane === "stasis" ? snapshot.stasis : snapshot.crawlee,
    };
    assertCrawlPhaseDiagnostic(artifact);
    return deepFreeze(artifact);
  };
}

function createPhaseRecorder(now) {
  if (typeof now !== "function") {
    throw new TypeError("A monotonic diagnostic clock function is required");
  }
  const clockReads = [];
  const stasis = {
    poolCreations: [],
    poolRuns: [],
    poolCloses: [],
  };
  const crawlee = {
    launches: [],
    browsers: [],
  };
  let lastNanoseconds = null;

  function point(label) {
    const readOrdinal = clockReads.length + 1;
    let current;
    try {
      current = now();
      if (typeof current !== "bigint" || current < 0n) {
        throw new TypeError("Diagnostic clock values must be nonnegative BigInts");
      }
      if (lastNanoseconds !== null && current < lastNanoseconds) {
        throw new TypeError("Diagnostic clock values must not move backwards");
      }
      lastNanoseconds = current;
      const retained = {
        readOrdinal,
        label,
        status: "recorded",
        nanoseconds: current.toString(10),
        error: null,
      };
      clockReads.push(retained);
      return retained;
    } catch (error) {
      const retained = {
        readOrdinal,
        label,
        status: "failed",
        nanoseconds: null,
        error: serializeError(error),
      };
      clockReads.push(retained);
      return retained;
    }
  }

  return {
    point,
    stasis,
    crawlee,
    snapshot() {
      finalizeIncompletePhases(stasis, crawlee);
      return structuredClone({ clockReads, stasis, crawlee });
    },
  };
}

function instrumentStasisSdk(sdk, recorder) {
  if (
    sdk === null ||
    (typeof sdk !== "object" && typeof sdk !== "function") ||
    typeof sdk.createStasisSessionPool !== "function"
  ) {
    throw new TypeError("The Stasis SDK pool factory is required for phase diagnostics");
  }
  const originalCreatePool = sdk.createStasisSessionPool;
  return new Proxy(sdk, {
    get(target, property) {
      if (property === "createStasisSessionPool") {
        return (...args) => {
          const ordinal = recorder.stasis.poolCreations.length + 1;
          const started = recorder.point(`stasis:pool-create:${ordinal}:start`);
          try {
            const pool = Reflect.apply(originalCreatePool, target, args);
            const ended = recorder.point(`stasis:pool-create:${ordinal}:end`);
            recorder.stasis.poolCreations.push({
              ordinal,
              interval: makeInterval({
                label: "pool_creation",
                start: started,
                end: ended,
                settlement: "fulfilled",
              }),
            });
            return instrumentStasisPool(pool, recorder);
          } catch (error) {
            const ended = recorder.point(`stasis:pool-create:${ordinal}:end`);
            recorder.stasis.poolCreations.push({
              ordinal,
              interval: makeInterval({
                label: "pool_creation",
                start: started,
                end: ended,
                settlement: "rejected",
                error: serializeError(error),
              }),
            });
            throw error;
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function instrumentStasisPool(pool, recorder) {
  if (pool === null || (typeof pool !== "object" && typeof pool !== "function")) {
    throw new TypeError("The Stasis pool factory returned a non-object");
  }
  const originalRun = pool.run;
  const originalClose = pool.close;
  return new Proxy(pool, {
    get(target, property) {
      if (property === "run" && typeof originalRun === "function") {
        return async (request, callback, ...rest) => {
          const ordinal = recorder.stasis.poolRuns.length + 1;
          const record = {
            ordinal,
            requestedUrl: typeof request?.url === "string" ? request.url : null,
            acquireOpen: null,
            settleExtract: null,
            releasePhysicalCleanup: null,
          };
          recorder.stasis.poolRuns.push(record);
          const runStarted = recorder.point(`stasis:pool-run:${ordinal}:start`);
          let callbackStarted = null;
          let callbackEnded = null;

          const wrappedCallback = typeof callback === "function"
            ? async (...callbackArgs) => {
                callbackStarted = recorder.point(`stasis:pool-run:${ordinal}:callback-start`);
                record.acquireOpen = makeInterval({
                  label: "acquire_open",
                  start: runStarted,
                  end: callbackStarted,
                  settlement: "fulfilled",
                });
                try {
                  const result = await Reflect.apply(callback, undefined, callbackArgs);
                  callbackEnded = recorder.point(`stasis:pool-run:${ordinal}:callback-end`);
                  record.settleExtract = makeInterval({
                    label: "settle_extract",
                    start: callbackStarted,
                    end: callbackEnded,
                    settlement: "fulfilled",
                  });
                  return result;
                } catch (error) {
                  callbackEnded = recorder.point(`stasis:pool-run:${ordinal}:callback-end`);
                  record.settleExtract = makeInterval({
                    label: "settle_extract",
                    start: callbackStarted,
                    end: callbackEnded,
                    settlement: "rejected",
                    error: serializeError(error),
                  });
                  throw error;
                }
              }
            : callback;

          try {
            const result = await Reflect.apply(originalRun, target, [
              request,
              wrappedCallback,
              ...rest,
            ]);
            const runEnded = recorder.point(`stasis:pool-run:${ordinal}:end`);
            finishPoolRunRecord(record, runStarted, callbackStarted, callbackEnded, runEnded, {
              status: "fulfilled",
              error: null,
            });
            return result;
          } catch (error) {
            const runEnded = recorder.point(`stasis:pool-run:${ordinal}:end`);
            finishPoolRunRecord(record, runStarted, callbackStarted, callbackEnded, runEnded, {
              status: "rejected",
              error: serializeError(error),
            });
            throw error;
          }
        };
      }
      if (property === "close" && typeof originalClose === "function") {
        return async (...args) => {
          const ordinal = recorder.stasis.poolCloses.length + 1;
          const started = recorder.point(`stasis:pool-close:${ordinal}:start`);
          try {
            const result = await Reflect.apply(originalClose, target, args);
            const ended = recorder.point(`stasis:pool-close:${ordinal}:end`);
            recorder.stasis.poolCloses.push({
              ordinal,
              interval: makeInterval({
                label: "pool_close",
                start: started,
                end: ended,
                settlement: "fulfilled",
              }),
            });
            return result;
          } catch (error) {
            const ended = recorder.point(`stasis:pool-close:${ordinal}:end`);
            recorder.stasis.poolCloses.push({
              ordinal,
              interval: makeInterval({
                label: "pool_close",
                start: started,
                end: ended,
                settlement: "rejected",
                error: serializeError(error),
              }),
            });
            throw error;
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function finishPoolRunRecord(
  record,
  runStarted,
  callbackStarted,
  callbackEnded,
  runEnded,
  settlement,
) {
  if (callbackStarted === null) {
    record.acquireOpen = makeInterval({
      label: "acquire_open",
      start: runStarted,
      end: runEnded,
      settlement: "not_observed",
      error: settlement.error,
      reason: "callback_not_entered",
    });
    record.settleExtract = makeInterval({
      label: "settle_extract",
      start: null,
      end: null,
      settlement: "not_observed",
      reason: "callback_not_entered",
    });
    record.releasePhysicalCleanup = makeInterval({
      label: "release_physical_cleanup",
      start: null,
      end: null,
      settlement: "not_observed",
      reason: "callback_not_entered",
    });
    return;
  }
  if (callbackEnded === null) {
    record.settleExtract = makeInterval({
      label: "settle_extract",
      start: callbackStarted,
      end: runEnded,
      settlement: "not_observed",
      error: settlement.error,
      reason: "callback_not_settled",
    });
    record.releasePhysicalCleanup = makeInterval({
      label: "release_physical_cleanup",
      start: null,
      end: null,
      settlement: "not_observed",
      reason: "callback_not_settled",
    });
    return;
  }
  record.releasePhysicalCleanup = makeInterval({
    label: "release_physical_cleanup",
    start: callbackEnded,
    end: runEnded,
    settlement: settlement.status,
    error: settlement.error,
  });
}

function instrumentPlaywrightLauncher(launcher, recorder) {
  if (
    launcher === null ||
    (typeof launcher !== "object" && typeof launcher !== "function") ||
    typeof launcher.launch !== "function"
  ) {
    throw new TypeError("The externally selected Playwright launcher is required");
  }
  const originalLaunch = launcher.launch;
  return new Proxy(launcher, {
    get(target, property) {
      if (property === "launch") {
        return async (...args) => {
          const ordinal = recorder.crawlee.launches.length + 1;
          const started = recorder.point(`crawlee:launch:${ordinal}:start`);
          try {
            const browser = await Reflect.apply(originalLaunch, target, args);
            const ended = recorder.point(`crawlee:launch:${ordinal}:end`);
            recorder.crawlee.launches.push({
              ordinal,
              interval: makeInterval({
                label: "browser_launch",
                start: started,
                end: ended,
                settlement: "fulfilled",
              }),
            });
            return instrumentPlaywrightBrowser(browser, ordinal, ended, recorder);
          } catch (error) {
            const ended = recorder.point(`crawlee:launch:${ordinal}:end`);
            recorder.crawlee.launches.push({
              ordinal,
              interval: makeInterval({
                label: "browser_launch",
                start: started,
                end: ended,
                settlement: "rejected",
                error: serializeError(error),
              }),
            });
            throw error;
          }
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function instrumentPlaywrightBrowser(browser, launchOrdinal, launchEnded, recorder) {
  if (browser === null || (typeof browser !== "object" && typeof browser !== "function")) {
    throw new TypeError("The Playwright launcher returned a non-object browser");
  }
  const ordinal = recorder.crawlee.browsers.length + 1;
  const record = {
    ordinal,
    launchOrdinal,
    workloadWindow: null,
    closes: [],
  };
  recorder.crawlee.browsers.push(record);
  const originalClose = browser.close;
  let proxy;
  proxy = new Proxy(browser, {
    get(target, property) {
      if (property === "close" && typeof originalClose === "function") {
        return async (...args) => {
          const closeOrdinal = record.closes.length + 1;
          const started = recorder.point(`crawlee:browser:${ordinal}:close:${closeOrdinal}:start`);
          if (record.workloadWindow === null) {
            record.workloadWindow = makeInterval({
              label: "browser_resident_workload",
              start: launchEnded,
              end: started,
              settlement: "fulfilled",
            });
          }
          try {
            const result = await Reflect.apply(originalClose, target, args);
            const ended = recorder.point(`crawlee:browser:${ordinal}:close:${closeOrdinal}:end`);
            record.closes.push({
              ordinal: closeOrdinal,
              interval: makeInterval({
                label: "browser_close",
                start: started,
                end: ended,
                settlement: "fulfilled",
              }),
            });
            return result === target ? proxy : result;
          } catch (error) {
            const ended = recorder.point(`crawlee:browser:${ordinal}:close:${closeOrdinal}:end`);
            record.closes.push({
              ordinal: closeOrdinal,
              interval: makeInterval({
                label: "browser_close",
                start: started,
                end: ended,
                settlement: "rejected",
                error: serializeError(error),
              }),
            });
            throw error;
          }
        };
      }
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      return (...args) => {
        const result = Reflect.apply(value, target, args);
        return result === target ? proxy : result;
      };
    },
  });
  return proxy;
}

function finalizeIncompletePhases(_stasis, crawlee) {
  for (const browser of crawlee.browsers) {
    browser.workloadWindow ??= makeInterval({
      label: "browser_resident_workload",
      start: findLaunchEnd(crawlee.launches, browser.launchOrdinal),
      end: null,
      settlement: "not_observed",
      reason: "browser_close_not_observed",
    });
  }
}

function findLaunchEnd(launches, ordinal) {
  return launches.find((entry) => entry.ordinal === ordinal)?.interval.end ?? null;
}

function makeInterval({
  label,
  start,
  end,
  settlement,
  error = null,
  reason = null,
}) {
  const completeClock = start?.status === "recorded" && end?.status === "recorded";
  const clockStatus = end === null
    ? "incomplete"
    : completeClock ? "complete" : "invalid";
  return {
    label,
    settlement,
    clockStatus,
    start,
    end,
    durationNs: completeClock
      ? (BigInt(end.nanoseconds) - BigInt(start.nanoseconds)).toString(10)
      : null,
    error,
    reason,
  };
}

function runnerIdentity(lane) {
  return lane === "stasis"
    ? {
        sourceModule: "src/performance/crawl.mjs",
        factory: "createStasisPerformanceRunner",
        dependencyHook: "sdk_createStasisSessionPool_proxy",
        substituted: false,
      }
    : {
        sourceModule: "src/performance/crawl.mjs",
        factory: "createCrawleePerformanceRunner",
        dependencyHook: "playwright_launcher_proxy",
        substituted: false,
      };
}

function assertRunnerIdentity(value, lane) {
  if (!isDeepStrictEqual(value, runnerIdentity(lane))) {
    throw new TypeError("Crawl phase diagnostic runner substitution is forbidden");
  }
}

function assertRunnerSettlement(value) {
  if (!isPlainRecord(value)) throw new TypeError("Invalid diagnostic runner settlement");
  if (value.status === "fulfilled") {
    if (!hasExactKeys(value, ["status", "run"])) {
      throw new TypeError("Invalid fulfilled diagnostic runner settlement");
    }
    assertJsonValue(value.run, "runner result");
    return;
  }
  if (value.status === "rejected") {
    if (!hasExactKeys(value, ["status", "error"])) {
      throw new TypeError("Invalid rejected diagnostic runner settlement");
    }
    assertSerializedError(value.error);
    return;
  }
  throw new TypeError("Invalid diagnostic runner settlement status");
}

function assertClockReads(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError("Diagnostic raw clock reads are required");
  }
  const byOrdinal = new Map();
  let prior = null;
  value.forEach((point, index) => {
    if (!isPlainRecord(point) || !hasExactKeys(point, [
      "readOrdinal",
      "label",
      "status",
      "nanoseconds",
      "error",
    ]) || point.readOrdinal !== index + 1 || typeof point.label !== "string") {
      throw new TypeError("Invalid diagnostic raw clock read");
    }
    if (point.status === "recorded") {
      if (
        typeof point.nanoseconds !== "string" ||
        !nonnegativeIntegerPattern.test(point.nanoseconds) ||
        point.error !== null
      ) {
        throw new TypeError("Invalid recorded diagnostic clock read");
      }
      const current = BigInt(point.nanoseconds);
      if (prior !== null && current < prior) {
        throw new TypeError("Diagnostic raw clock reads move backwards");
      }
      prior = current;
    } else if (point.status === "failed") {
      if (point.nanoseconds !== null) {
        throw new TypeError("Invalid failed diagnostic clock read");
      }
      assertSerializedError(point.error);
    } else {
      throw new TypeError("Invalid diagnostic clock read status");
    }
    byOrdinal.set(point.readOrdinal, point);
  });
  return byOrdinal;
}

function assertInterval(value, label, clockReads) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "label",
    "settlement",
    "clockStatus",
    "start",
    "end",
    "durationNs",
    "error",
    "reason",
  ]) || value.label !== label || !intervalSettlements.has(value.settlement) ||
    !intervalClockStatuses.has(value.clockStatus)) {
    throw new TypeError(`Invalid ${label} diagnostic interval`);
  }
  assertIntervalPoint(value.start, clockReads);
  assertIntervalPoint(value.end, clockReads);
  const complete = value.start?.status === "recorded" && value.end?.status === "recorded";
  const expectedClockStatus = value.end === null
    ? "incomplete"
    : complete ? "complete" : "invalid";
  if (value.clockStatus !== expectedClockStatus) {
    throw new TypeError(`Invalid ${label} diagnostic clock status`);
  }
  const expectedDuration = complete
    ? (BigInt(value.end.nanoseconds) - BigInt(value.start.nanoseconds)).toString(10)
    : null;
  if (value.durationNs !== expectedDuration) {
    throw new TypeError(`Invalid ${label} diagnostic duration`);
  }
  if (value.error !== null) assertSerializedError(value.error);
  if (value.reason !== null && !intervalReasons.has(value.reason)) {
    throw new TypeError(`Invalid ${label} diagnostic omission reason`);
  }
  if (value.settlement === "rejected" && value.error === null) {
    throw new TypeError(`Rejected ${label} diagnostic interval must retain its error`);
  }
  if (value.settlement === "not_observed" && value.reason === null) {
    throw new TypeError(`Unobserved ${label} diagnostic interval must retain its reason`);
  }
  if (value.settlement === "fulfilled" && (value.error !== null || value.reason !== null)) {
    throw new TypeError(`Fulfilled ${label} diagnostic interval contains failure metadata`);
  }
  return value;
}

function assertIntervalPoint(value, clockReads) {
  if (value === null) return;
  if (!isPlainRecord(value) || !Number.isSafeInteger(value.readOrdinal)) {
    throw new TypeError("Invalid diagnostic interval clock point");
  }
  if (!isDeepStrictEqual(clockReads.get(value.readOrdinal), value)) {
    throw new TypeError("Diagnostic interval does not reference a retained raw clock read");
  }
}

function assertStasisPhases(value, clockReads, outer) {
  if (!isPlainRecord(value) || !hasExactKeys(value, [
    "poolCreations",
    "poolRuns",
    "poolCloses",
  ])) {
    throw new TypeError("Invalid Stasis crawl phase diagnostics");
  }
  assertOrdinalIntervals(value.poolCreations, "pool_creation", clockReads);
  assertOrdinalIntervals(value.poolCloses, "pool_close", clockReads);
  if (!Array.isArray(value.poolRuns)) {
    throw new TypeError("Invalid Stasis pool-run diagnostics");
  }
  value.poolRuns.forEach((entry, index) => {
    if (!isPlainRecord(entry) || !hasExactKeys(entry, [
      "ordinal",
      "requestedUrl",
      "acquireOpen",
      "settleExtract",
      "releasePhysicalCleanup",
    ]) || entry.ordinal !== index + 1 ||
      !(entry.requestedUrl === null || typeof entry.requestedUrl === "string")) {
      throw new TypeError("Invalid Stasis pool-run diagnostic");
    }
    assertInterval(entry.acquireOpen, "acquire_open", clockReads);
    assertInterval(entry.settleExtract, "settle_extract", clockReads);
    assertInterval(entry.releasePhysicalCleanup, "release_physical_cleanup", clockReads);
    assertStasisRunOrdering(entry);
  });
  assertNestedWithinOuter(value, outer);
}

function assertStasisRunOrdering(entry) {
  const acquire = entry.acquireOpen;
  const work = entry.settleExtract;
  const release = entry.releasePhysicalCleanup;
  if (acquire.settlement === "fulfilled") {
    if (
      work.start === null ||
      !isDeepStrictEqual(acquire.end, work.start)
    ) {
      throw new TypeError("Stasis acquire/open and settle/extract phases are discontinuous");
    }
  }
  if (work.settlement !== "not_observed") {
    if (
      release.start === null ||
      !isDeepStrictEqual(work.end, release.start)
    ) {
      throw new TypeError("Stasis settle/extract and physical cleanup phases are discontinuous");
    }
  }
}

function assertCrawleePhases(value, clockReads, outer) {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["launches", "browsers"])) {
    throw new TypeError("Invalid Crawlee crawl phase diagnostics");
  }
  assertOrdinalIntervals(value.launches, "browser_launch", clockReads);
  if (!Array.isArray(value.browsers)) {
    throw new TypeError("Invalid Crawlee browser diagnostics");
  }
  value.browsers.forEach((browser, index) => {
    if (!isPlainRecord(browser) || !hasExactKeys(browser, [
      "ordinal",
      "launchOrdinal",
      "workloadWindow",
      "closes",
    ]) || browser.ordinal !== index + 1 ||
      !Number.isSafeInteger(browser.launchOrdinal) || browser.launchOrdinal < 1) {
      throw new TypeError("Invalid Crawlee browser diagnostic");
    }
    const launch = value.launches[browser.launchOrdinal - 1];
    if (launch?.interval.settlement !== "fulfilled") {
      throw new TypeError("Crawlee browser diagnostic lacks a fulfilled launch");
    }
    assertInterval(browser.workloadWindow, "browser_resident_workload", clockReads);
    if (!isDeepStrictEqual(browser.workloadWindow.start, launch.interval.end)) {
      throw new TypeError("Crawlee workload window does not begin at launch settlement");
    }
    assertOrdinalIntervals(browser.closes, "browser_close", clockReads);
    if (
      browser.closes.length > 0 &&
      !isDeepStrictEqual(browser.workloadWindow.end, browser.closes[0].interval.start)
    ) {
      throw new TypeError("Crawlee workload window does not end at first close invocation");
    }
  });
  assertNestedWithinOuter(value, outer);
}

function assertOrdinalIntervals(value, label, clockReads) {
  if (!Array.isArray(value)) throw new TypeError(`Invalid ${label} diagnostics`);
  value.forEach((entry, index) => {
    if (!isPlainRecord(entry) || !hasExactKeys(entry, ["ordinal", "interval"]) ||
      entry.ordinal !== index + 1) {
      throw new TypeError(`Invalid ${label} diagnostic ordinal`);
    }
    assertInterval(entry.interval, label, clockReads);
  });
}

function assertNestedWithinOuter(phases, outer) {
  if (outer.start?.status !== "recorded" || outer.end?.status !== "recorded") return;
  const lower = outer.start.readOrdinal;
  const upper = outer.end.readOrdinal;
  visitIntervals(phases, (interval) => {
    for (const point of [interval.start, interval.end]) {
      if (point !== null && (point.readOrdinal < lower || point.readOrdinal > upper)) {
        throw new TypeError("Diagnostic phase lies outside its runner boundary");
      }
    }
  });
}

function visitIntervals(value, callback) {
  if (Array.isArray(value)) {
    value.forEach((entry) => visitIntervals(entry, callback));
    return;
  }
  if (!isPlainRecord(value)) return;
  if (hasExactKeys(value, [
    "label",
    "settlement",
    "clockStatus",
    "start",
    "end",
    "durationNs",
    "error",
    "reason",
  ])) {
    callback(value);
    return;
  }
  Object.values(value).forEach((entry) => visitIntervals(entry, callback));
}

function assertDiagnosticJob(value, lane) {
  const expected = createCrawlPhaseDiagnosticJob({ lane, ordinal: value?.ordinal });
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError("Crawl phase diagnostics require the unchanged primary workload");
  }
  return value;
}

function assertLane(value) {
  if (!lanes.includes(value)) throw new TypeError("Invalid crawl phase diagnostic lane");
}

function cloneJsonRecord(value, label) {
  assertJsonRecord(value, label);
  return deepFreeze(structuredClone(value));
}

function cloneJsonValue(value, label) {
  assertJsonValue(value, label);
  return structuredClone(value);
}

function assertJsonRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain JSON object`);
  assertJsonValue(value, label);
  return value;
}

function assertJsonValue(value, label) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) return value;
  if (Array.isArray(value)) {
    value.forEach((entry) => assertJsonValue(entry, label));
    return value;
  }
  if (isPlainRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof key !== "string" || entry === undefined) {
        throw new TypeError(`${label} must contain only JSON values`);
      }
      assertJsonValue(entry, label);
    }
    return value;
  }
  throw new TypeError(`${label} must contain only JSON values`);
}

function hasExactKeys(value, keys) {
  return isPlainRecord(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
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
