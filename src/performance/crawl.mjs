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
import { canonicalHttpUrl, serializeError } from "../shared/io.mjs";

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
  const reasons = [];

  for (const lane of laneNames) {
    const job = makeJob({ phase: "warmup", lane, ordinal: ++ordinal, crawl: primaryCrawl });
    const observation = await observeUntimed(runners[lane], job, lane);
    raw.warmups.push(observation);
    if (!observation.oracle.valid) {
      reasons.push(`${lane}_warmup_invalid`);
      return finalize(raw, reasons);
    }
  }
  const warmupEquivalence = compareExactRuns(
    raw.warmups[0].run,
    raw.warmups[1].run,
  );
  if (!warmupEquivalence.valid) {
    reasons.push("warmups_not_exact_equivalent");
    return finalize(raw, reasons);
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
      if (!observation.oracle.valid) {
        reasons.push(`${lane}_sample_invalid`);
        return finalize(raw, reasons);
      }
    }

    const byLane = Object.fromEntries(
      pair.observations.map((observation) => [observation.lane, observation]),
    );
    pair.equivalence = compareExactRuns(byLane.crawlee.run, byLane.stasis.run);
    if (!pair.equivalence.valid) {
      reasons.push("pair_not_exact_equivalent");
      return finalize(raw, reasons);
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

  return finalize(raw, reasons);
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
export function createStasisPerformanceRunner({ sdk, sdkVersion, executablePath }) {
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
  const networkOptions = deepFreeze(stasisNetwork());

  return async (job) => {
    const result = await runStasisV03Case({
      sdk,
      executablePath,
      profile: stasisProfile,
      networkOptions,
      start: job.crawl.start,
      pageLimit: job.crawl.pageLimit,
      depthLimit: job.crawl.depthLimit,
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
      assertObservation(observation, expectedOrder[position], true);
    });
    const expectedEquivalence = pair.observations.length === 2 &&
      pair.observations.every(({ oracle }) => oracle.valid)
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
  const startedAt = readClock(now);
  const settlement = await settleRunner(runner, job);
  const endedAt = readClock(now);
  if (endedAt < startedAt) throw new Error("Monotonic clock moved backwards");
  const elapsedNs = (endedAt - startedAt).toString(10);
  // This validation is deliberately after the end-clock read. Page waits and
  // extraction oracles run in the lane itself and remain inside the boundary;
  // structural replay and raw materialization do not.
  const run = materializeRunnerSettlement(settlement);
  const oracle = validatePrimaryRun(lane, run);
  return { lane, timed: true, elapsedNs, run, oracle };
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

function finalize(raw, reasons) {
  const completePairs = raw.pairs.filter((pair) => pair.observations.length === 2).length;
  const exactEquivalentPairs = raw.pairs.filter((pair) => pair.equivalence.valid === true).length;
  const warmupsValid = raw.warmups.length === 2 && raw.warmups.every((item) => item.oracle.valid);
  const valid = reasons.length === 0 && warmupsValid &&
    completePairs === pairCount && exactEquivalentPairs === pairCount;
  const reasonCodes = [...new Set([
    ...reasons,
    ...(valid || completePairs === pairCount ? [] : ["paired_sample_schedule_incomplete"]),
  ])];
  raw.authority = {
    status: valid ? "valid" : "invalid",
    valid,
    requiredPairs: pairCount,
    completedPairs: completePairs,
    exactEquivalentPairs,
    primaryPagesPerLane: maxPages,
    reasonCodes,
  };
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
    value?.stasis?.runtimeManifestSha256 !== stasisRuntimeManifestSha256
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
  };
  if (
    facts.provider !== "github-actions" ||
    !safeHostString(facts.repository) ||
    !/^[^/\s]+\/[^/\s]+$/u.test(facts.repository) ||
    !safeHostString(facts.workflow) ||
    !safeHostString(facts.job) ||
    !canonicalPositiveInteger(facts.runId) ||
    !canonicalPositiveInteger(facts.runAttempt) ||
    !gitShaPattern.test(facts.workflowSourceSha ?? "") ||
    !safeHostString(facts.workflowSourceRef) ||
    !gitShaPattern.test(facts.harnessCheckoutRevision ?? "") ||
    !gitShaPattern.test(facts.harnessCheckoutTree ?? "")
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
    ? ["lane", "timed", "elapsedNs", "run", "oracle"]
    : ["lane", "timed", "run", "oracle"];
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    value.lane !== lane ||
    value.timed !== timed ||
    !isPlainRecord(value.run) ||
    !isPlainRecord(value.oracle) ||
    typeof value.oracle.valid !== "boolean" ||
    !Number.isSafeInteger(value.oracle.expectedPages) ||
    !Number.isSafeInteger(value.oracle.exactOraclePages) ||
    !Array.isArray(value.oracle.reasons) ||
    (timed && !canonicalUnsignedIntegerPattern.test(value.elapsedNs ?? "")) ||
    (!timed && Object.hasOwn(value, "elapsedNs"))
  ) {
    throw new TypeError("Invalid crawl performance observation");
  }
  if (!isDeepStrictEqual(value.oracle, validatePrimaryRun(lane, value.run))) {
    throw new TypeError("Crawl performance oracle replay mismatch");
  }
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
        Object.hasOwn(observation, "elapsedNs") ||
        !isPlainRecord(observation.run) ||
        Object.hasOwn(observation, "oracle")
      ) {
        throw new TypeError("Invalid untimed control observation");
      }
    }
  }
}

function assertAuthority(value) {
  const authority = value.authority;
  const validPairs = value.pairs.filter((pair) => pair.equivalence.valid === true).length;
  const completedPairs = value.pairs.filter((pair) => pair.observations.length === 2).length;
  const shouldBeValid =
    value.warmups.length === 2 &&
    value.warmups.every((observation) => observation.oracle.valid) &&
    completedPairs === pairCount &&
    validPairs === pairCount &&
    value.pairs.every((pair) =>
      pair.observations.length === 2 &&
      pair.observations.every((observation) => observation.oracle.valid)
    );
  if (
    !hasExactKeys(authority, [
      "status",
      "valid",
      "requiredPairs",
      "completedPairs",
      "exactEquivalentPairs",
      "primaryPagesPerLane",
      "reasonCodes",
    ]) ||
    authority.valid !== shouldBeValid ||
    authority.status !== (shouldBeValid ? "valid" : "invalid") ||
    authority.requiredPairs !== pairCount ||
    authority.completedPairs !== completedPairs ||
    authority.exactEquivalentPairs !== validPairs ||
    authority.primaryPagesPerLane !== maxPages ||
    !Array.isArray(authority.reasonCodes) ||
    value.controls.status !== (shouldBeValid ? "complete" : "not_run") ||
    (shouldBeValid && authority.reasonCodes.length !== 0) ||
    (!shouldBeValid && authority.reasonCodes.length === 0)
  ) {
    throw new TypeError("Invalid crawl performance authority verdict");
  }
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
