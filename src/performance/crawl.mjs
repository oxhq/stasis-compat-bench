import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  Configuration,
  PlaywrightCrawler,
  RequestQueue,
} from "crawlee";
import { chromium } from "playwright";

import {
  concurrency,
  expectedPrimaryScheduledUrls,
  fixtureFor,
  maxDepth,
  maxPages,
  negativeControls,
  normalizeLinks,
  origin,
  startUrl,
  stasisNetwork,
} from "../crawl/corpus.mjs";
import { runStasisV03Case } from "../crawl-v03/stasis-lane.mjs";
import {
  assertSerializedError,
  canonicalHttpUrl,
  serializeError,
} from "../shared/io.mjs";
import { assertCleanHarnessWorktreeEvidence } from "./harness-worktree.mjs";
import { assertLinuxEglRuntimeEvidence } from "./linux-egl-runtime.mjs";

export const crawlPerformanceSchema = "stasis-v0.3.3-performance-crawl-raw-v1";
export const crawlPerformanceProtocol = "stasis-v0.3.3-performance-crawl-v1";
export const crawlPerformanceTrack = "deterministic-crawl-20-page";
export const crawlPerformanceRawArtifactPath = "performance/crawl-raw.json";

const stasisVersion = "0.3.3";
const stasisRevision = "48c5a718a9ddd63f496e45307e1484974ccf8587";
const stasisProfile = "controlled-web-session-v2";
const stasisReleaseTag = "v0.3.3";
const stasisPackageQualificationRunId = "33506181780";
const stasisPackageQualificationRunAttempt = "1";
const stasisRuntimeManifestSha256 = "4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4";
const nodeVersion = "v22.20.0";
const crawleeVersion = "3.18.1";
const playwrightVersion = "1.62.1";
const performanceRepository = "oxhq/stasis";
const performanceWorkflowName = "Stasis v0.3.3 performance evidence";
const performanceCrawlJobName = "ubuntu-crawl";
const lifecycleTraceEnvironmentName = "STASIS_LIFECYCLE_TRACE_V1";
const sha256Pattern = /^[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const canonicalUnsignedIntegerPattern = /^(?:0|[1-9][0-9]*)$/u;
const laneNames = Object.freeze(["crawlee", "stasis"]);
const pairCount = 10;

const primaryCrawl = deepFreeze({
  start: startUrl,
  pageLimit: maxPages,
  depthLimit: maxDepth,
});

export const crawlPerformanceRules = deepFreeze({
  host: {
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOsPrefix: "ubuntu",
  },
  primary: {
    maxPages,
    maxDepth,
    concurrency,
    maxRequestRetries: 0,
    freshQueuePoolBrowserAndProcessesPerObservation: true,
    harnessSleeps: false,
    laneInternalTiming: false,
  },
  warmupsPerLane: 1,
  pairedSamples: pairCount,
  pairOrder: "odd_AB_crawlee_then_stasis;even_BA_stasis_then_crawlee",
  timing: {
    clock: "process.hrtime.bigint",
    unit: "nanoseconds",
    boundary: "outside_lane_runner_invocation_through_promise_settlement",
    includes: [
      "fresh_queue_or_pool_creation",
      "browser_or_process_startup",
      "twenty_pages_and_in_page_oracles",
      "all_lane_cleanup",
    ],
    excludes: [
      "package_setup",
      "identity_checks",
      "warmups",
      "post_run_validation",
      "serialization",
      "report_io",
      "worker_and_iframe_controls",
    ],
  },
  diagnostics: {
    stasisLifecycleTrace: "untimed_warmup_only",
    timedSamplesAndControlsLifecycleTrace: false,
    rawErrorTextRetained: false,
  },
  invalidObservationPolicy: "retain_then_fail_stop_without_retry",
  controls: {
    ids: negativeControls.map(({ id }) => id),
    timed: false,
    includedInPrimaryDenominator: false,
  },
});

const frozenPrimaryOracle = deepFreeze([
  oraclePage(startUrl, startUrl, 0, [
    "/static",
    "/canonical",
    "/microtask",
    "/timer",
    "/raf",
    "/fetch",
    "/xhr",
    "/state",
    "/navigation-start",
    "/interval",
  ]),
  oraclePage("/static", "/static", 1, ["/leaf/static"]),
  oraclePage("/canonical", "/canonical", 1, ["/leaf/canonical"]),
  oraclePage("/microtask", "/microtask", 1, ["/leaf/microtask"]),
  oraclePage("/timer", "/timer", 1, ["/leaf/timer"]),
  oraclePage("/raf", "/raf", 1, ["/leaf/raf"]),
  oraclePage("/fetch", "/fetch", 1, ["/leaf/fetch"]),
  oraclePage("/xhr", "/xhr", 1, ["/leaf/xhr"]),
  oraclePage("/state", "/state/ready/", 1, ["/state/ready/leaf"]),
  oraclePage("/navigation-start", "/navigation-final", 1, ["/leaf/navigation"]),
  oraclePage("/interval", "/interval", 1, ["/leaf/static"]),
  oraclePage("/leaf/static", "/leaf/static", 2),
  oraclePage("/leaf/canonical", "/leaf/canonical", 2),
  oraclePage("/leaf/microtask", "/leaf/microtask", 2),
  oraclePage("/leaf/timer", "/leaf/timer", 2),
  oraclePage("/leaf/raf", "/leaf/raf", 2),
  oraclePage("/leaf/fetch", "/leaf/fetch", 2),
  oraclePage("/leaf/xhr", "/leaf/xhr", 2),
  oraclePage("/state/ready/leaf", "/state/ready/leaf", 2),
  oraclePage("/leaf/navigation", "/leaf/navigation", 2),
]);

const corpusModuleRelativePath = "src/crawl/corpus.mjs";
const corpusModuleSource = readFileSync(
  fileURLToPath(new URL("../crawl/corpus.mjs", import.meta.url)),
);

export const crawlPerformanceCorpusIdentity = deepFreeze({
  schema: "stasis-v0.3.3-performance-crawl-corpus-v1",
  sourceModule: corpusModuleRelativePath,
  sourceSha256: sha256Bytes(corpusModuleSource),
  scheduledUrlsSha256: sha256Json(expectedPrimaryScheduledUrls),
  negativeControlsSha256: sha256Json(
    negativeControls.map(({ id, start, expectedSurface }) => ({ id, start, expectedSurface })),
  ),
  primaryOracleSha256: sha256Json(frozenPrimaryOracle),
});

/**
 * Executes the preregistered crawl performance authority. Runners and the
 * monotonic clock are explicit dependencies so orchestration can be tested
 * without launching browsers. Package/runtime identity must already have been
 * established before this function is entered; those checks are intentionally
 * outside every measured boundary.
 */
export async function runCrawlPerformanceAuthority({
  identity,
  runners,
  now = () => process.hrtime.bigint(),
}) {
  const retainedIdentity = cloneAndAssertIdentity(identity);
  assertRunners(runners);
  if (typeof now !== "function") throw new TypeError("A monotonic clock function is required");

  const raw = {
    schema: crawlPerformanceSchema,
    protocol: crawlPerformanceProtocol,
    track: crawlPerformanceTrack,
    identity: retainedIdentity,
    rules: structuredClone(crawlPerformanceRules),
    warmups: [],
    pairs: [],
    controls: {
      status: "not_run",
      timed: false,
      includedInPrimaryDenominator: false,
      observations: [],
    },
    authority: undefined,
  };
  let ordinal = 0;
  for (const lane of laneNames) {
    const job = makeJob({ phase: "warmup", lane, ordinal: ++ordinal, crawl: primaryCrawl });
    const observation = await observeUntimed(runners[lane], job, lane);
    raw.warmups.push(observation);
    if (!observation.oracle.valid) {
      return finalize(raw);
    }
  }
  const warmupEquivalence = compareExactRuns(
    raw.warmups[0].run,
    raw.warmups[1].run,
  );
  if (!warmupEquivalence.valid) {
    return finalize(raw);
  }

  for (let pairIndex = 1; pairIndex <= pairCount; pairIndex += 1) {
    const order = pairOrder(pairIndex);
    const pair = {
      pairIndex,
      order: pairIndex % 2 === 1 ? "AB" : "BA",
      lanes: order,
      observations: [],
      equivalence: { evaluated: false, valid: false, exactEquivalentPages: 0 },
    };
    raw.pairs.push(pair);

    for (let position = 0; position < order.length; position += 1) {
      const lane = order[position];
      const job = makeJob({
        phase: "sample",
        lane,
        ordinal: ++ordinal,
        pairIndex,
        position: position + 1,
        crawl: primaryCrawl,
      });
      const observation = await observeTimed(runners[lane], job, lane, now);
      pair.observations.push(observation);
      if (observation.status === "clock_error" || !observation.oracle.valid) {
        return finalize(raw);
      }
    }

    const byLane = Object.fromEntries(
      pair.observations.map((observation) => [observation.lane, observation]),
    );
    pair.equivalence = compareExactRuns(byLane.crawlee.run, byLane.stasis.run);
    if (!pair.equivalence.valid) {
      return finalize(raw);
    }
  }

  raw.controls.status = "complete";
  for (const control of negativeControls) {
    for (const lane of laneNames) {
      const job = makeJob({
        phase: "control",
        lane,
        ordinal: ++ordinal,
        controlId: control.id,
        expectedSurface: control.expectedSurface,
        crawl: { start: control.start, pageLimit: 1, depthLimit: 0 },
      });
      raw.controls.observations.push({
        id: control.id,
        expectedSurface: control.expectedSurface,
        ...(await observeUntimed(runners[lane], job, lane, false)),
      });
    }
  }

  return finalize(raw);
}

/** Creates the real Crawlee PlaywrightCrawler lane. No browser is launched here. */
export function createCrawleePerformanceRunner({ launcher = chromium } = {}) {
  if (typeof launcher?.launch !== "function") {
    throw new TypeError("The externally selected Playwright launcher is required");
  }
  return async (job) => runCrawleeObservation(job, launcher);
}

/**
 * Creates the Stasis lane from an externally imported public v0.3.3 SDK and an
 * externally materialized public runtime. This repository's historical
 * @oxhq/stasis@0.2.1 dependency is never imported by this module.
 */
export function createStasisPerformanceRunner({
  sdk,
  sdkVersion,
  executablePath,
  environment = process.env,
}) {
  if (sdkVersion !== stasisVersion) {
    throw new TypeError(`The crawl performance lane requires @oxhq/stasis@${stasisVersion}`);
  }
  if (
    typeof sdk?.crawlWithStasis !== "function" ||
    typeof sdk?.createStasisSessionPool !== "function" ||
    sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== stasisProfile
  ) {
    throw new TypeError("The external Stasis v0.3.3 SDK surface is incomplete");
  }
  if (typeof executablePath !== "string" || executablePath.length === 0) {
    throw new TypeError("An externally supplied Stasis v0.3.3 runtime is required");
  }
  if (environment === null || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("The inherited Stasis launch environment must be an object");
  }
  const networkOptions = deepFreeze(stasisNetwork());
  const inheritedLaunchEnvironment = { ...environment };

  return async (job) => {
    const launchEnv = { ...inheritedLaunchEnvironment };
    if (job.phase === "warmup") {
      launchEnv[lifecycleTraceEnvironmentName] = "1";
    } else {
      delete launchEnv[lifecycleTraceEnvironmentName];
    }
    const result = await runStasisV03Case({
      sdk,
      executablePath,
      profile: stasisProfile,
      networkOptions,
      start: job.crawl.start,
      pageLimit: job.crawl.pageLimit,
      depthLimit: job.crawl.depthLimit,
      recordWallTime: false,
      launchEnv,
      retainFailurePhase: true,
    });
    const { wallTimeMs: _nonAuthoritativeInnerTiming, ...withoutInnerTiming } = result;
    return withoutInnerTiming;
  };
}

export function createCrawlPerformanceIdentity(value) {
  return deepFreeze(cloneAndAssertIdentity({
    ...structuredClone(value),
    corpus: value?.corpus ?? crawlPerformanceCorpusIdentity,
  }));
}

export function computeCrawlPerformanceHostIdentityDigest(value) {
  const facts = projectHostFacts(value);
  return createHash("sha256").update(JSON.stringify(facts), "utf8").digest("hex");
}

export function createCrawlPerformanceHostIdentity(value) {
  const facts = projectHostFacts(value);
  return deepFreeze({
    ...facts,
    bootInstanceDigest: assertBootInstanceDigest(value?.bootInstanceDigest),
    hostClassDigest: computeCrawlPerformanceHostIdentityDigest(facts),
  });
}

export function assertCrawlPerformanceHostIdentity(value) {
  if (!hasExactKeys(value, [
    "platform",
    "arch",
    "runnerOs",
    "imageOs",
    "imageVersion",
    "cpuModel",
    "logicalCpuCount",
    "bootInstanceDigest",
    "hostClassDigest",
  ])) {
    throw new TypeError("Invalid privacy-safe Ubuntu host identity");
  }
  if (
    !sha256Pattern.test(value.hostClassDigest ?? "") ||
    value.hostClassDigest !== computeCrawlPerformanceHostIdentityDigest(value) ||
    !sha256Pattern.test(value.bootInstanceDigest ?? "")
  ) {
    throw new TypeError("Invalid privacy-safe Ubuntu host identity digest");
  }
  return value;
}

export function createCrawlPerformanceGithubProvenance(value) {
  return deepFreeze(projectGithubProvenance(value));
}

export function assertCrawlPerformanceGithubProvenance(value) {
  if (!hasExactKeys(value, [
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
  ]) || !isDeepStrictEqual(projectGithubProvenance(value), value)) {
    throw new TypeError("Invalid GitHub Actions crawl performance provenance");
  }
  return value;
}

export function assertCrawlPerformanceRaw(value) {
  if (!isPlainRecord(value)) throw new TypeError("Invalid crawl performance raw result");
  cloneAndAssertIdentity(value.identity);
  if (
    !hasExactKeys(value, [
      "schema",
      "protocol",
      "track",
      "identity",
      "rules",
      "warmups",
      "pairs",
      "controls",
      "authority",
    ]) ||
    value.schema !== crawlPerformanceSchema ||
    value.protocol !== crawlPerformanceProtocol ||
    value.track !== crawlPerformanceTrack ||
    !isDeepStrictEqual(value.rules, crawlPerformanceRules) ||
    !Array.isArray(value.warmups) ||
    value.warmups.length > laneNames.length ||
    !Array.isArray(value.pairs) ||
    value.pairs.length > pairCount ||
    !isPlainRecord(value.controls) ||
    !isPlainRecord(value.authority)
  ) {
    throw new TypeError("Invalid crawl performance raw result");
  }

  for (let index = 0; index < value.warmups.length; index += 1) {
    assertObservation(value.warmups[index], laneNames[index], false);
  }
  let priorTimedEnd = null;
  for (let index = 0; index < value.pairs.length; index += 1) {
    const pair = value.pairs[index];
    const expectedIndex = index + 1;
    const expectedOrder = pairOrder(expectedIndex);
    if (
      !isPlainRecord(pair) ||
      !hasExactKeys(pair, [
        "pairIndex",
        "order",
        "lanes",
        "observations",
        "equivalence",
      ]) ||
      pair.pairIndex !== expectedIndex ||
      pair.order !== (expectedIndex % 2 === 1 ? "AB" : "BA") ||
      !isDeepStrictEqual(pair.lanes, expectedOrder) ||
      !Array.isArray(pair.observations) ||
      pair.observations.length > 2 ||
      !isPlainRecord(pair.equivalence)
    ) {
      throw new TypeError("Invalid crawl performance pair");
    }
    pair.observations.forEach((observation, position) => {
      const timing = assertObservation(observation, expectedOrder[position], true);
      if (timing.start !== null && priorTimedEnd !== null && timing.start < priorTimedEnd) {
        throw new TypeError("Crawl performance timing boundaries overlap or move backwards");
      }
      if (timing.complete) priorTimedEnd = timing.end;
    });
    const expectedEquivalence = pair.observations.length === 2 &&
      pair.observations.every(({ status, oracle }) =>
        status === "completed" && oracle?.valid === true
      )
      ? compareExactRuns(
          pair.observations.find(({ lane }) => lane === "crawlee")?.run,
          pair.observations.find(({ lane }) => lane === "stasis")?.run,
        )
      : { evaluated: false, valid: false, exactEquivalentPages: 0 };
    if (!isDeepStrictEqual(pair.equivalence, expectedEquivalence)) {
      throw new TypeError("Crawl performance pair equivalence mismatch");
    }
  }
  assertControls(value.controls);
  assertAuthority(value);
  return value;
}

async function runCrawleeObservation(job, launcher) {
  const queueId = `stasis-performance-crawl-${job.ordinal}`;
  const config = new Configuration({
    persistStorage: false,
    purgeOnStart: true,
    defaultRequestQueueId: queueId,
    logLevel: "ERROR",
  });
  const scheduled = new Set([canonicalHttpUrl(job.crawl.start)]);
  const pages = [];
  const failures = [];
  const fixtureMisses = [];
  let terminal;

  try {
    const requestQueue = await RequestQueue.open(null, { config });
    let crawler;
    crawler = new PlaywrightCrawler(
      {
        requestQueue,
        minConcurrency: concurrency,
        maxConcurrency: concurrency,
        maxRequestRetries: 0,
        maxRequestsPerCrawl: job.crawl.pageLimit,
        requestHandlerTimeoutSecs: 20,
        navigationTimeoutSecs: 20,
        useSessionPool: false,
        headless: true,
        launchContext: {
          launcher,
          launchOptions: { headless: true },
        },
        preNavigationHooks: [
          async ({ page }) => {
            await page.route("**/*", async (route) => {
              const request = route.request();
              const fixture = fixtureFor(request.method(), request.url());
              if (fixture === undefined) {
                fixtureMisses.push({ method: request.method(), url: request.url() });
                await route.abort("failed");
                return;
              }
              await route.fulfill({
                status: fixture.status,
                headers: Object.fromEntries(fixture.headers),
                body: fixture.body,
              });
            });
          },
        ],
        async requestHandler({ page, request, response }) {
          const depth = Number(request.userData.depth ?? 0);
          await page.evaluate(() => new Promise((resolve) => {
            const ready = () =>
              document.querySelector('#status[data-state="complete"]') !== null;
            if (ready()) {
              resolve();
              return;
            }
            const observer = new MutationObserver(() => {
              if (!ready()) return;
              observer.disconnect();
              resolve();
            });
            observer.observe(document.documentElement, {
              attributes: true,
              childList: true,
              subtree: true,
            });
          }));
          const finalUrl = canonicalHttpUrl(page.url());
          const rawLinks = await page.locator("a[href]").evaluateAll((anchors) =>
            anchors.map((anchor) => anchor.href),
          );
          const links = normalizeLinks(rawLinks, finalUrl);
          pages.push({
            requestedUrl: canonicalHttpUrl(request.url),
            url: finalUrl,
            depth,
            status: "crawled",
            responseStatus: response?.status() ?? null,
            links,
          });
          if (depth >= job.crawl.depthLimit) return;
          const additions = [];
          for (const link of links) {
            if (scheduled.size >= job.crawl.pageLimit) break;
            if (new URL(link).origin !== origin || scheduled.has(link)) continue;
            scheduled.add(link);
            additions.push({ url: link, uniqueKey: link, userData: { depth: depth + 1 } });
          }
          if (additions.length > 0) await crawler.addRequests(additions);
        },
        async failedRequestHandler({ request, error }) {
          failures.push({
            requestedUrl: canonicalHttpUrl(request.url),
            depth: Number(request.userData.depth ?? 0),
            error: serializeError(error),
            errorMessageCount: Array.isArray(request.errorMessages)
              ? request.errorMessages.length
              : 0,
          });
        },
      },
      config,
    );

    await crawler.run([{
      url: job.crawl.start,
      uniqueKey: canonicalHttpUrl(job.crawl.start),
      userData: { depth: 0 },
    }]);
    terminal = {
      success: failures.length === 0 && fixtureMisses.length === 0,
      result: { pages, scheduledUrls: [...scheduled] },
      failures,
      fixtureMisses,
    };
  } catch (error) {
    terminal = {
      success: false,
      result: { pages, scheduledUrls: [...scheduled] },
      failures,
      fixtureMisses,
      error: serializeError(error),
    };
  }

  try {
    await config.getEventManager().close();
  } catch (error) {
    const cleanupError = serializeError(error);
    return {
      success: false,
      error: {
        name: "Error",
        code: "unclassified_error",
        messageOmitted: true,
        cause: cleanupError,
      },
      cleanup: {
        status: "failed",
        phase: "event_manager_close",
        error: cleanupError,
      },
      priorTerminal: terminal.success
        ? { success: true }
        : { success: false, error: terminal.error },
      result: terminal.result,
      failures: terminal.failures,
      fixtureMisses: terminal.fixtureMisses,
    };
  }

  return {
    ...terminal,
    cleanup: { status: "passed", phase: "crawler_run_and_event_manager_close" },
  };
}

async function observeUntimed(runner, job, lane, validatePrimary = true) {
  const run = materializeRunnerSettlement(await settleRunner(runner, job));
  return {
    lane,
    timed: false,
    run,
    ...(validatePrimary ? { oracle: validatePrimaryRun(lane, run) } : {}),
  };
}

async function observeTimed(runner, job, lane, now) {
  let startedAt;
  try {
    startedAt = readClock(now);
  } catch {
    return clockFailureObservation(lane, {
      startNs: null,
      endNs: null,
      durationNs: null,
    }, "clock_start_invalid");
  }
  const settlement = await settleRunner(runner, job);
  let endedAt;
  try {
    endedAt = readClock(now);
  } catch {
    return clockFailureObservation(lane, {
      startNs: startedAt.toString(10),
      endNs: null,
      durationNs: null,
    }, "clock_end_invalid", settlement);
  }
  if (endedAt <= startedAt) {
    return clockFailureObservation(lane, {
      startNs: startedAt.toString(10),
      endNs: endedAt.toString(10),
      durationNs: null,
    }, "clock_not_monotonic", settlement);
  }
  const timing = {
    startNs: startedAt.toString(10),
    endNs: endedAt.toString(10),
    durationNs: (endedAt - startedAt).toString(10),
  };
  // This validation is deliberately after the end-clock read. Page waits and
  // extraction oracles run in the lane itself and remain inside the boundary;
  // structural replay and raw materialization do not.
  const run = materializeRunnerSettlement(settlement);
  const oracle = validatePrimaryRun(lane, run);
  return { lane, timed: true, status: "completed", timing, run, oracle, error: null };
}

function clockFailureObservation(lane, timing, code, settlement = null) {
  const run = settlement === null ? null : materializeRunnerSettlement(settlement);
  return {
    lane,
    timed: true,
    status: "clock_error",
    timing,
    run,
    oracle: run === null ? null : validatePrimaryRun(lane, run),
    error: {
      name: code === "clock_not_monotonic" ? "RangeError" : "TypeError",
      code,
    },
  };
}

async function settleRunner(runner, job) {
  try {
    return { status: "fulfilled", value: await runner(job) };
  } catch (error) {
    return { status: "rejected", error };
  }
}

function materializeRunnerSettlement(settlement) {
  if (settlement.status === "rejected") {
    return {
      success: false,
      error: serializeError(settlement.error),
      cleanup: { status: "unknown", phase: "runner_rejection" },
    };
  }
  let value;
  try {
    value = structuredClone(settlement.value);
  } catch {
    return {
      success: false,
      error: { name: "Error", code: "unclassified_error", messageOmitted: true },
      cleanup: { status: "unknown", phase: "runner_contract" },
    };
  }
  if (!isPlainRecord(value)) {
    return {
      success: false,
      error: { name: "NonErrorThrow", valueOmitted: true },
      cleanup: { status: "unknown", phase: "runner_contract" },
    };
  }
  return value;
}

function validatePrimaryRun(lane, run) {
  const reasons = [];
  const pages = run?.result?.pages;
  const scheduledUrls = run?.result?.scheduledUrls;
  if (run?.success !== true) reasons.push("runner_failed");
  if (run?.cleanup?.status !== "passed") reasons.push("cleanup_not_passed");
  if (lane === "crawlee") {
    if (!isDeepStrictEqual(run?.failures, [])) reasons.push("crawlee_failures_present");
    if (!isDeepStrictEqual(run?.fixtureMisses, [])) reasons.push("fixture_misses_present");
  }
  if (!isDeepStrictEqual(scheduledUrls, expectedPrimaryScheduledUrls)) {
    reasons.push("scheduled_url_denominator_mismatch");
  }
  if (!Array.isArray(pages) || pages.length !== maxPages) {
    reasons.push("page_denominator_mismatch");
  }

  let exactOraclePages = 0;
  if (Array.isArray(pages)) {
    for (let index = 0; index < frozenPrimaryOracle.length; index += 1) {
      const page = pages[index];
      const expected = frozenPrimaryOracle[index];
      if (pageMatchesOracle(lane, page, expected)) exactOraclePages += 1;
    }
  }
  if (exactOraclePages !== maxPages) reasons.push("page_oracle_mismatch");
  return {
    valid: reasons.length === 0,
    expectedPages: maxPages,
    exactOraclePages,
    reasons,
  };
}

function pageMatchesOracle(lane, page, expected) {
  if (!isPlainRecord(page)) return false;
  const common = isDeepStrictEqual(
    {
      requestedUrl: page.requestedUrl,
      url: page.url,
      depth: page.depth,
      status: page.status,
      links: page.links,
    },
    expected,
  );
  if (!common) return false;
  if (lane === "crawlee") {
    return page.responseStatus === 200 && !Object.hasOwn(page, "settleOutcome");
  }
  const expectedSettleOutcome = page.requestedUrl === `${origin}/interval`
    ? "quiescent_with_persistent_work"
    : "quiescent";
  return lane === "stasis" && page.settleOutcome === expectedSettleOutcome;
}

function compareExactRuns(crawleeRun, stasisRun) {
  const crawleePages = crawleeRun?.result?.pages;
  const stasisPages = stasisRun?.result?.pages;
  let exactEquivalentPages = 0;
  if (Array.isArray(crawleePages) && Array.isArray(stasisPages)) {
    for (let index = 0; index < maxPages; index += 1) {
      if (isDeepStrictEqual(projectComparablePage(crawleePages[index]), projectComparablePage(stasisPages[index]))) {
        exactEquivalentPages += 1;
      }
    }
  }
  return {
    evaluated: true,
    valid: exactEquivalentPages === maxPages,
    exactEquivalentPages,
  };
}

function projectComparablePage(page) {
  if (!isPlainRecord(page)) return undefined;
  return {
    requestedUrl: page.requestedUrl,
    url: page.url,
    depth: page.depth,
    status: page.status,
    links: page.links,
  };
}

function finalize(raw) {
  raw.authority = replayCrawlAuthority(raw);
  assertCrawlPerformanceRaw(raw);
  return deepFreeze(raw);
}

function cloneAndAssertIdentity(identity) {
  let value;
  try {
    value = structuredClone(identity);
  } catch {
    throw new TypeError("Crawl performance identity must be structured-cloneable data");
  }
  const host = projectHostFacts(value?.host);
  const expectedDigest = computeCrawlPerformanceHostIdentityDigest(host);
  if (
    !hasExactKeys(value, ["host", "provenance", "corpus", "crawlee", "stasis"]) ||
    !hasExactKeys(value?.host, [
      "platform",
      "arch",
      "runnerOs",
      "imageOs",
      "imageVersion",
      "cpuModel",
      "logicalCpuCount",
      "bootInstanceDigest",
      "hostClassDigest",
    ]) ||
    !hasExactKeys(value?.provenance, [
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
    ]) ||
    !hasExactKeys(value?.corpus, [
      "schema",
      "sourceModule",
      "sourceSha256",
      "scheduledUrlsSha256",
      "negativeControlsSha256",
      "primaryOracleSha256",
    ]) ||
    !hasExactKeys(value?.crawlee, [
      "runner",
      "nodeVersion",
      "crawleeVersion",
      "playwrightVersion",
      "browser",
      "chromiumVersion",
      "chromiumExecutableBytes",
      "chromiumExecutableSha256",
      "hostClassDigest",
    ]) ||
    !hasExactKeys(value?.stasis, [
      "runner",
      "nodeVersion",
      "package",
      "sdkVersion",
      "revision",
      "profile",
      "releaseTag",
      "packageQualificationRunId",
      "packageQualificationRunAttempt",
      "sdkArchiveSha256",
      "executableSha256",
      "runtimeManifestSha256",
      "eglRuntime",
      "hostClassDigest",
    ]) ||
    assertCrawlPerformanceHostIdentity(value?.host) !== value.host ||
    assertCrawlPerformanceGithubProvenance(value?.provenance) !== value.provenance ||
    !isDeepStrictEqual(value?.corpus, crawlPerformanceCorpusIdentity) ||
    value.host.hostClassDigest !== expectedDigest ||
    value?.crawlee?.hostClassDigest !== expectedDigest ||
    value?.stasis?.hostClassDigest !== expectedDigest ||
    value?.crawlee?.runner !== "crawlee-playwrightcrawler" ||
    value?.crawlee?.nodeVersion !== nodeVersion ||
    value?.crawlee?.crawleeVersion !== crawleeVersion ||
    value?.crawlee?.playwrightVersion !== playwrightVersion ||
    value?.crawlee?.browser !== "chromium" ||
    !safeHostString(value?.crawlee?.chromiumVersion) ||
    !Number.isSafeInteger(value?.crawlee?.chromiumExecutableBytes) ||
    value?.crawlee?.chromiumExecutableBytes < 1 ||
    !sha256Pattern.test(value?.crawlee?.chromiumExecutableSha256 ?? "") ||
    value?.stasis?.runner !== "stasis-reference-crawler-v0.3.3" ||
    value?.stasis?.nodeVersion !== nodeVersion ||
    value?.stasis?.package !== "@oxhq/stasis" ||
    value?.stasis?.sdkVersion !== stasisVersion ||
    value?.stasis?.revision !== stasisRevision ||
    value?.stasis?.profile !== stasisProfile ||
    value?.stasis?.releaseTag !== stasisReleaseTag ||
    value?.stasis?.packageQualificationRunId !== stasisPackageQualificationRunId ||
    value?.stasis?.packageQualificationRunAttempt !== stasisPackageQualificationRunAttempt ||
    !sha256Pattern.test(value?.stasis?.sdkArchiveSha256 ?? "") ||
    !sha256Pattern.test(value?.stasis?.executableSha256 ?? "") ||
    value?.stasis?.runtimeManifestSha256 !== stasisRuntimeManifestSha256 ||
    assertLinuxEglRuntimeEvidence(value?.stasis?.eglRuntime) !== value.stasis.eglRuntime
  ) {
    throw new TypeError("Invalid Ubuntu crawl performance identity");
  }
  return value;
}

function projectHostFacts(value) {
  const facts = {
    platform: value?.platform,
    arch: value?.arch,
    runnerOs: value?.runnerOs,
    imageOs: value?.imageOs,
    imageVersion: value?.imageVersion,
    cpuModel: value?.cpuModel,
    logicalCpuCount: value?.logicalCpuCount,
  };
  if (
    facts.platform !== "linux" ||
    facts.arch !== "x64" ||
    facts.runnerOs !== "Linux" ||
    !safeHostString(facts.imageOs) ||
    !facts.imageOs.startsWith("ubuntu") ||
    !safeHostString(facts.imageVersion) ||
    !safeHostString(facts.cpuModel) ||
    !Number.isSafeInteger(facts.logicalCpuCount) ||
    facts.logicalCpuCount < 1
  ) {
    throw new TypeError("Invalid privacy-safe Ubuntu host facts");
  }
  return facts;
}

function projectGithubProvenance(value) {
  const facts = {
    provider: value?.provider,
    repository: value?.repository,
    workflow: value?.workflow,
    job: value?.job,
    runId: value?.runId,
    runAttempt: value?.runAttempt,
    workflowSourceSha: value?.workflowSourceSha,
    workflowSourceRef: value?.workflowSourceRef,
    harnessCheckoutRevision: value?.harnessCheckoutRevision,
    harnessCheckoutTree: value?.harnessCheckoutTree,
    harnessCheckoutWorktree: value?.harnessCheckoutWorktree,
  };
  if (
    facts.provider !== "github-actions" ||
    facts.repository !== performanceRepository ||
    facts.workflow !== performanceWorkflowName ||
    facts.job !== performanceCrawlJobName ||
    !canonicalPositiveInteger(facts.runId) ||
    !canonicalPositiveInteger(facts.runAttempt) ||
    !gitShaPattern.test(facts.workflowSourceSha ?? "") ||
    !safeHostString(facts.workflowSourceRef) ||
    !gitShaPattern.test(facts.harnessCheckoutRevision ?? "") ||
    !gitShaPattern.test(facts.harnessCheckoutTree ?? "") ||
    assertCleanHarnessWorktreeEvidence(facts.harnessCheckoutWorktree) !==
      facts.harnessCheckoutWorktree
  ) {
    throw new TypeError("Invalid GitHub Actions crawl performance provenance");
  }
  return facts;
}

function assertRunners(runners) {
  if (!isPlainRecord(runners) || laneNames.some((lane) => typeof runners[lane] !== "function")) {
    throw new TypeError("Both crawl performance lane runners are required");
  }
}

function assertObservation(value, lane, timed) {
  const expectedKeys = timed
    ? ["lane", "timed", "status", "timing", "run", "oracle", "error"]
    : ["lane", "timed", "run", "oracle"];
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    value.lane !== lane ||
    value.timed !== timed ||
    (!timed && Object.hasOwn(value, "timing"))
  ) {
    throw new TypeError("Invalid crawl performance observation");
  }
  if (timed && value.status === "clock_error") {
    return assertClockFailureObservation(value);
  }
  if (
    (timed && (value.status !== "completed" || value.error !== null)) ||
    !isPlainRecord(value.run) ||
    !isPlainRecord(value.oracle) ||
    typeof value.oracle.valid !== "boolean" ||
    !Number.isSafeInteger(value.oracle.expectedPages) ||
    !Number.isSafeInteger(value.oracle.exactOraclePages) ||
    !Array.isArray(value.oracle.reasons)
  ) {
    throw new TypeError("Invalid crawl performance observation");
  }
  assertRunErrorProjections(value.run, lane);
  if (!isDeepStrictEqual(value.oracle, validatePrimaryRun(lane, value.run))) {
    throw new TypeError("Crawl performance oracle replay mismatch");
  }
  return timed ? assertTiming(value.timing) : null;
}

function assertClockFailureObservation(value) {
  if (
    !hasExactKeys(value.error, ["name", "code"]) ||
    !hasExactKeys(value.timing, ["startNs", "endNs", "durationNs"])
  ) {
    throw new TypeError("Invalid crawl performance clock failure");
  }
  const { code, name } = value.error;
  if (code === "clock_start_invalid") {
    if (
      name !== "TypeError" ||
      value.timing.startNs !== null ||
      value.timing.endNs !== null ||
      value.timing.durationNs !== null ||
      value.run !== null ||
      value.oracle !== null
    ) {
      throw new TypeError("Invalid crawl performance start-clock failure");
    }
    return { start: null, end: null, complete: false };
  }
  if (!canonicalUnsignedIntegerPattern.test(value.timing.startNs ?? "")) {
    throw new TypeError("Invalid crawl performance partial timing start");
  }
  const start = BigInt(value.timing.startNs);
  if (!isPlainRecord(value.run) || !isPlainRecord(value.oracle)) {
    throw new TypeError("Invalid crawl performance clock-failure result");
  }
  assertRunErrorProjections(value.run, value.lane);
  if (!isDeepStrictEqual(value.oracle, validatePrimaryRun(value.lane, value.run))) {
    throw new TypeError("Crawl performance clock-failure oracle replay mismatch");
  }
  if (code === "clock_end_invalid") {
    if (
      name !== "TypeError" ||
      value.timing.endNs !== null ||
      value.timing.durationNs !== null
    ) {
      throw new TypeError("Invalid crawl performance end-clock failure");
    }
    return { start, end: null, complete: false };
  }
  if (
    code !== "clock_not_monotonic" ||
    name !== "RangeError" ||
    !canonicalUnsignedIntegerPattern.test(value.timing.endNs ?? "") ||
    value.timing.durationNs !== null
  ) {
    throw new TypeError("Invalid crawl performance monotonic-clock failure");
  }
  const end = BigInt(value.timing.endNs);
  if (end > start) {
    throw new TypeError("Invalid crawl performance monotonic-clock failure boundary");
  }
  return { start, end, complete: false };
}

function assertControls(value) {
  if (
    !hasExactKeys(value, [
      "status",
      "timed",
      "includedInPrimaryDenominator",
      "observations",
    ]) ||
    !["not_run", "complete"].includes(value.status) ||
    value.timed !== false ||
    value.includedInPrimaryDenominator !== false ||
    !Array.isArray(value.observations)
  ) {
    throw new TypeError("Invalid crawl performance controls");
  }
  if (value.status === "not_run" && value.observations.length !== 0) {
    throw new TypeError("Unrun controls cannot contain observations");
  }
  if (value.status === "complete") {
    const expected = negativeControls.flatMap((control) => laneNames.map((lane) => ({
      id: control.id,
      expectedSurface: control.expectedSurface,
      lane,
    })));
    const actual = value.observations.map(({ id, expectedSurface, lane }) => ({
      id,
      expectedSurface,
      lane,
    }));
    if (!isDeepStrictEqual(actual, expected)) throw new TypeError("Control inventory mismatch");
    for (const observation of value.observations) {
      if (
        !hasExactKeys(observation, [
          "id",
          "expectedSurface",
          "lane",
          "timed",
          "run",
        ]) ||
        observation.timed !== false ||
        Object.hasOwn(observation, "timing") ||
        !isPlainRecord(observation.run) ||
        Object.hasOwn(observation, "oracle")
      ) {
        throw new TypeError("Invalid untimed control observation");
      }
      assertRunErrorProjections(observation.run, observation.lane);
    }
  }
}

function assertRunErrorProjections(run, lane) {
  if (Object.hasOwn(run, "error")) {
    assertSerializedError(run.error);
    assertStasisProcessFailurePhase(run.error, lane, "crawl");
  }
  if (isPlainRecord(run.cleanup) && Object.hasOwn(run.cleanup, "error")) {
    assertSerializedError(run.cleanup.error);
    assertStasisProcessFailurePhase(run.cleanup.error, lane, "pool_close");
  }
  if (isPlainRecord(run.priorTerminal) && Object.hasOwn(run.priorTerminal, "error")) {
    assertSerializedError(run.priorTerminal.error);
    assertStasisProcessFailurePhase(run.priorTerminal.error, lane, "crawl");
  }
  if (Array.isArray(run.failures)) {
    for (const failure of run.failures) {
      if (isPlainRecord(failure) && Object.hasOwn(failure, "error")) {
        assertSerializedError(failure.error);
      }
    }
  }
}

function assertStasisProcessFailurePhase(error, lane, expected) {
  if (
    lane === "stasis" &&
    error?.name === "StasisProcessError" &&
    error?.code === "process_exit" &&
    error.failurePhase !== expected
  ) {
    throw new TypeError("Invalid Stasis process failure phase");
  }
}

function assertAuthority(value) {
  const expected = replayCrawlAuthority(value);
  if (!isDeepStrictEqual(value.authority, expected)) {
    throw new TypeError("Invalid crawl performance authority verdict");
  }
  if (value.controls.status !== (expected.valid ? "complete" : "not_run")) {
    throw new TypeError("Invalid crawl performance control execution state");
  }
}

function assertTiming(value) {
  if (!hasExactKeys(value, ["startNs", "endNs", "durationNs"])) {
    throw new TypeError("Invalid crawl performance timing boundary");
  }
  if (
    !canonicalUnsignedIntegerPattern.test(value.startNs ?? "") ||
    !canonicalUnsignedIntegerPattern.test(value.endNs ?? "") ||
    !/^[1-9][0-9]*$/u.test(value.durationNs ?? "")
  ) {
    throw new TypeError("Invalid crawl performance timing value");
  }
  const start = BigInt(value.startNs);
  const end = BigInt(value.endNs);
  if (end <= start || BigInt(value.durationNs) !== end - start) {
    throw new TypeError("Invalid crawl performance timing duration");
  }
  return { start, end, complete: true };
}

function replayCrawlAuthority(raw) {
  const completePairs = raw.pairs.filter((pair) => pair.observations.length === 2).length;
  const exactEquivalentPairs = raw.pairs.filter((pair) => pair.equivalence.valid === true).length;
  const reasons = [];

  if (raw.warmups.length < 1) {
    throw new TypeError("Crawl performance raw result lacks its first retained warm-up");
  }
  for (let index = 0; index < raw.warmups.length; index += 1) {
    if (!raw.warmups[index].oracle.valid) {
      if (index !== raw.warmups.length - 1 || raw.pairs.length !== 0) {
        throw new TypeError("Crawl performance history continued after an invalid warm-up");
      }
      reasons.push(`${raw.warmups[index].lane}_warmup_invalid`);
      return crawlAuthorityValue(false, completePairs, exactEquivalentPairs, reasons);
    }
  }
  if (raw.warmups.length !== laneNames.length) {
    throw new TypeError("Crawl performance warm-up history stopped without a retained failure");
  }
  if (!compareExactRuns(raw.warmups[0].run, raw.warmups[1].run).valid) {
    if (raw.pairs.length !== 0) {
      throw new TypeError("Crawl performance history continued after warm-up divergence");
    }
    reasons.push("warmups_not_exact_equivalent");
    return crawlAuthorityValue(false, completePairs, exactEquivalentPairs, reasons);
  }

  for (let pairIndex = 0; pairIndex < raw.pairs.length; pairIndex += 1) {
    const pair = raw.pairs[pairIndex];
    if (pair.observations.length < 1) {
      throw new TypeError("Crawl performance pair stopped without a retained observation");
    }
    for (let observationIndex = 0; observationIndex < pair.observations.length; observationIndex += 1) {
      const observation = pair.observations[observationIndex];
      if (observation.status === "clock_error") {
        if (
          pairIndex !== raw.pairs.length - 1 ||
          observationIndex !== pair.observations.length - 1
        ) {
          throw new TypeError("Crawl performance history continued after a clock failure");
        }
        reasons.push("clock_failure");
        return crawlAuthorityValue(false, completePairs, exactEquivalentPairs, reasons);
      }
      if (!observation.oracle.valid) {
        if (
          pairIndex !== raw.pairs.length - 1 ||
          observationIndex !== pair.observations.length - 1
        ) {
          throw new TypeError("Crawl performance history continued after an invalid observation");
        }
        reasons.push(`${observation.lane}_sample_invalid`);
        return crawlAuthorityValue(false, completePairs, exactEquivalentPairs, reasons);
      }
    }
    if (pair.observations.length !== laneNames.length) {
      throw new TypeError("Crawl performance pair stopped without a retained failure");
    }
    if (!pair.equivalence.valid) {
      if (pairIndex !== raw.pairs.length - 1) {
        throw new TypeError("Crawl performance history continued after pair divergence");
      }
      reasons.push("pair_not_exact_equivalent");
      return crawlAuthorityValue(false, completePairs, exactEquivalentPairs, reasons);
    }
  }

  if (raw.pairs.length !== pairCount) {
    throw new TypeError("Crawl performance schedule stopped without a retained failure");
  }
  return crawlAuthorityValue(true, completePairs, exactEquivalentPairs, reasons);
}

function crawlAuthorityValue(valid, completePairs, exactEquivalentPairs, reasons) {
  const reasonCodes = [
    ...reasons,
    ...(valid || completePairs === pairCount ? [] : ["paired_sample_schedule_incomplete"]),
  ];
  return {
    status: valid ? "valid" : "invalid",
    valid,
    requiredPairs: pairCount,
    completedPairs: completePairs,
    exactEquivalentPairs,
    primaryPagesPerLane: maxPages,
    reasonCodes,
  };
}

function makeJob(value) {
  return deepFreeze(structuredClone(value));
}

function pairOrder(pairIndex) {
  return pairIndex % 2 === 1 ? ["crawlee", "stasis"] : ["stasis", "crawlee"];
}

function readClock(now) {
  const value = now();
  if (typeof value !== "bigint" || value < 0n) {
    throw new TypeError("Monotonic clock must return non-negative bigint nanoseconds");
  }
  return value;
}

function oraclePage(requestedPath, finalPath, depth, links = []) {
  const absolute = (value) => value.startsWith("http") ? value : `${origin}${value}`;
  return {
    requestedUrl: absolute(requestedPath),
    url: absolute(finalPath),
    depth,
    status: "crawled",
    links: links.map(absolute),
  };
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function nonempty(value) {
  return typeof value === "string" && value.length > 0;
}

function canonicalPositiveInteger(value) {
  return typeof value === "string" && /^[1-9][0-9]*$/u.test(value);
}

function assertBootInstanceDigest(value) {
  if (!sha256Pattern.test(value ?? "")) {
    throw new TypeError("Invalid privacy-safe Ubuntu boot-instance digest");
  }
  return value;
}

function safeHostString(value) {
  return nonempty(value) && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function hasExactKeys(value, expected) {
  return isPlainRecord(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(value), "utf8"));
}
