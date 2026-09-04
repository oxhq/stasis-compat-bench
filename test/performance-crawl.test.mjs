import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCrawlPerformanceRaw,
  crawlPerformanceCorpusIdentity,
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceGithubProvenance,
  createCrawlPerformanceHostIdentity,
  createStasisPerformanceRunner,
  crawlPerformanceProtocol,
  crawlPerformanceRules,
  crawlPerformanceSchema,
  crawlPerformanceTrack,
  runCrawlPerformanceAuthority,
} from "../src/performance/crawl.mjs";
import { runStasisV03Case } from "../src/crawl-v03/stasis-lane.mjs";
import {
  expectedPrimaryScheduledUrls,
  origin,
} from "../src/crawl/corpus.mjs";
import { cleanHarnessWorktreeEvidence } from "../src/performance/harness-worktree.mjs";
import { linuxEglRuntimeSchema } from "../src/performance/linux-egl-runtime.mjs";

function eglRuntimeEvidence() {
  return {
    schema: linuxEglRuntimeSchema,
    dlopen: {
      method: "python3_ctypes_cdll_proc_maps_v1",
      status: "passed",
    },
    packages: [
      { name: "libegl1", version: "1.4.0-1" },
      { name: "libegl-mesa0", version: "22.0.5-0ubuntu0.1~22.04.1" },
      { name: "libglvnd0", version: "1.4.0-1" },
    ],
    libraries: [
      {
        package: "libegl1",
        soname: "libEGL.so.1",
        basename: "libEGL.so.1.1.0",
        bytes: 84_992,
        sha256: "4".repeat(64),
      },
      {
        package: "libegl-mesa0",
        soname: "libEGL_mesa.so.0",
        basename: "libEGL_mesa.so.0.0.0",
        bytes: 288_248,
        sha256: "5".repeat(64),
      },
      {
        package: "libglvnd0",
        soname: "libGLdispatch.so.0",
        basename: "libGLdispatch.so.0.0.0",
        bytes: 718_032,
        sha256: "6".repeat(64),
      },
    ],
  };
}

function identity() {
  const host = {
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260824.1.0",
    cpuModel: "Example Hosted CPU",
    logicalCpuCount: 4,
    bootInstanceDigest: "d".repeat(64),
  };
  const retainedHost = createCrawlPerformanceHostIdentity(host);
  const identityDigest = computeCrawlPerformanceHostIdentityDigest(retainedHost);
  return {
    host: structuredClone(retainedHost),
    provenance: createCrawlPerformanceGithubProvenance({
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "Stasis v0.3.3 performance evidence",
      job: "ubuntu-crawl",
      runId: "33599999999",
      runAttempt: "1",
      workflowSourceSha: "e".repeat(40),
      workflowSourceRef: "refs/heads/post-v033-performance-evidence",
      harnessCheckoutRevision: "f".repeat(40),
      harnessCheckoutTree: "1".repeat(40),
      harnessCheckoutWorktree: structuredClone(cleanHarnessWorktreeEvidence),
    }),
    corpus: structuredClone(crawlPerformanceCorpusIdentity),
    crawlee: {
      runner: "crawlee-playwrightcrawler",
      nodeVersion: "v22.20.0",
      crawleeVersion: "3.18.1",
      playwrightVersion: "1.62.1",
      browser: "chromium",
      chromiumVersion: "151.0.7922.34",
      chromiumExecutableBytes: 123_456_789,
      chromiumExecutableSha256: "a".repeat(64),
      hostClassDigest: identityDigest,
    },
    stasis: {
      runner: "stasis-reference-crawler-v0.3.3",
      nodeVersion: "v22.20.0",
      package: "@oxhq/stasis",
      sdkVersion: "0.3.3",
      revision: "48c5a718a9ddd63f496e45307e1484974ccf8587",
      profile: "controlled-web-session-v2",
      releaseTag: "v0.3.3",
      packageQualificationRunId: "33506181780",
      packageQualificationRunAttempt: "1",
      sdkArchiveSha256: "b".repeat(64),
      executableSha256: "c".repeat(64),
      runtimeManifestSha256: "4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4",
      eglRuntime: eglRuntimeEvidence(),
      hostClassDigest: identityDigest,
    },
  };
}

function successfulRun(lane) {
  const links = new Map([
    [`${origin}/`, [
      `${origin}/static`,
      `${origin}/canonical`,
      `${origin}/microtask`,
      `${origin}/timer`,
      `${origin}/raf`,
      `${origin}/fetch`,
      `${origin}/xhr`,
      `${origin}/state`,
      `${origin}/navigation-start`,
      `${origin}/interval`,
    ]],
    [`${origin}/static`, [`${origin}/leaf/static`]],
    [`${origin}/canonical`, [`${origin}/leaf/canonical`]],
    [`${origin}/microtask`, [`${origin}/leaf/microtask`]],
    [`${origin}/timer`, [`${origin}/leaf/timer`]],
    [`${origin}/raf`, [`${origin}/leaf/raf`]],
    [`${origin}/fetch`, [`${origin}/leaf/fetch`]],
    [`${origin}/xhr`, [`${origin}/leaf/xhr`]],
    [`${origin}/state`, [`${origin}/state/ready/leaf`]],
    [`${origin}/navigation-start`, [`${origin}/leaf/navigation`]],
    [`${origin}/interval`, [`${origin}/leaf/static`]],
  ]);
  const finalUrls = new Map([
    [`${origin}/state`, `${origin}/state/ready/`],
    [`${origin}/navigation-start`, `${origin}/navigation-final`],
  ]);
  const pages = expectedPrimaryScheduledUrls.map((requestedUrl, index) => ({
    requestedUrl,
    url: finalUrls.get(requestedUrl) ?? requestedUrl,
    depth: index === 0 ? 0 : index <= 10 ? 1 : 2,
    status: "crawled",
    ...(lane === "crawlee"
      ? { responseStatus: 200 }
      : {
          settleOutcome: requestedUrl === `${origin}/interval`
            ? "quiescent_with_persistent_work"
            : "quiescent",
        }),
    links: links.get(requestedUrl) ?? [],
  }));
  return {
    success: true,
    result: { pages, scheduledUrls: [...expectedPrimaryScheduledUrls] },
    ...(lane === "crawlee" ? { failures: [], fixtureMisses: [] } : {}),
    cleanup: { status: "passed", phase: "test_cleanup" },
  };
}

function runners(calls = []) {
  return Object.fromEntries(["crawlee", "stasis"].map((lane) => [
    lane,
    async (job) => {
      calls.push(`${lane}:${job.phase}:${job.pairIndex ?? job.controlId ?? "primary"}`);
      return successfulRun(lane);
    },
  ]));
}

function incrementalClock(events) {
  let value = 0n;
  return () => {
    events?.push(value % 20n === 0n ? "clock:start" : "clock:end");
    const current = value;
    value += 10n;
    return current;
  };
}

function stasisProcessExitError(stderrTail, { exitCode = null, signal = "SIGABRT" } = {}) {
  const error = new Error("private Stasis process message");
  error.name = "StasisProcessError";
  error.code = "process_exit";
  error.stderrTail = stderrTail;
  error.exitCode = exitCode;
  error.signal = signal;
  return error;
}

test("crawl authority runs one untimed warm-up and ten alternating AB/BA pairs", async () => {
  const calls = [];
  let clockReads = 0;
  let clockValue = 0n;
  const raw = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: runners(calls),
    now() {
      clockReads += 1;
      const value = clockValue;
      clockValue += 7n;
      return value;
    },
  });

  assert.equal(raw.schema, crawlPerformanceSchema);
  assert.equal(raw.protocol, crawlPerformanceProtocol);
  assert.equal(raw.track, crawlPerformanceTrack);
  assert.deepEqual(raw.rules, crawlPerformanceRules);
  assert.equal(raw.authority.valid, true);
  assert.equal(raw.authority.status, "valid");
  assert.equal(raw.authority.completedPairs, 10);
  assert.equal(raw.authority.exactEquivalentPairs, 10);
  assert.deepEqual(raw.warmups.map(({ lane, timed }) => ({ lane, timed })), [
    { lane: "crawlee", timed: false },
    { lane: "stasis", timed: false },
  ]);
  assert.equal(raw.warmups.some((item) => Object.hasOwn(item, "timing")), false);
  assert.deepEqual(raw.pairs.map(({ pairIndex, order, lanes }) => ({ pairIndex, order, lanes })),
    Array.from({ length: 10 }, (_, index) => ({
      pairIndex: index + 1,
      order: index % 2 === 0 ? "AB" : "BA",
      lanes: index % 2 === 0 ? ["crawlee", "stasis"] : ["stasis", "crawlee"],
    })),
  );
  assert.equal(raw.pairs.every((pair) => pair.observations.every((item) =>
    item.timing.durationNs === "7" &&
    BigInt(item.timing.endNs) - BigInt(item.timing.startNs) === 7n
  )), true);
  assert.equal(clockReads, 40);
  assert.deepEqual(calls.slice(0, 6), [
    "crawlee:warmup:primary",
    "stasis:warmup:primary",
    "crawlee:sample:1",
    "stasis:sample:1",
    "stasis:sample:2",
    "crawlee:sample:2",
  ]);
  assert.deepEqual(calls.slice(-4), [
    "crawlee:control:worker",
    "stasis:control:worker",
    "crawlee:control:iframe",
    "stasis:control:iframe",
  ]);
  assert.equal(raw.controls.timed, false);
  assert.equal(raw.controls.includedInPrimaryDenominator, false);
  assert.equal(raw.controls.observations.some((item) => Object.hasOwn(item, "timing")), false);
  assert.equal(assertCrawlPerformanceRaw(raw), raw);
  assert.equal(Object.isFrozen(raw), true);
});

test("the external end clock is read only after the lane runner cleanup resolves", async () => {
  const events = [];
  let clockValue = 0n;
  const monotonic = () => {
    events.push(clockValue % 2n === 0n ? "clock:start" : "clock:end");
    const value = clockValue;
    clockValue += 1n;
    return value;
  };
  const injected = Object.fromEntries(["crawlee", "stasis"].map((lane) => [
    lane,
    async (job) => {
      if (job.phase === "sample") events.push(`${lane}:runner`);
      await Promise.resolve();
      if (job.phase === "sample") events.push(`${lane}:cleanup`);
      return successfulRun(lane);
    },
  ]));

  const raw = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: injected,
    now: monotonic,
  });
  assert.equal(raw.authority.valid, true);
  assert.deepEqual(events.slice(0, 8), [
    "clock:start",
    "crawlee:runner",
    "crawlee:cleanup",
    "clock:end",
    "clock:start",
    "stasis:runner",
    "stasis:cleanup",
    "clock:end",
  ]);
});

test("the Stasis lane retains coarse crawl and pool-close phases without inventing a page", async () => {
  const stderrTail = [
    "stasis_lifecycle_v1 phase=close_accepted",
    "Redirecting call to abort() to mozalloc_abort",
  ].join("\n");
  const crawlFailure = await runStasisV03Case({
    sdk: {
      createStasisSessionPool() {
        return { async close() {} };
      },
      async crawlWithStasis() {
        throw stasisProcessExitError(stderrTail);
      },
    },
    start: origin,
    pageLimit: 20,
    depthLimit: 2,
    executablePath: "/opt/stasis-v0.3.3/stasis",
    recordWallTime: false,
    retainFailurePhase: true,
  });
  assert.equal(crawlFailure.error.failurePhase, "crawl");
  assert.equal(crawlFailure.error.signal, "SIGABRT");
  assert.deepEqual(crawlFailure.error.crashMarkers, ["mozalloc_abort"]);
  assert.deepEqual(crawlFailure.error.lifecyclePhases, ["close_accepted"]);
  assert.equal(Object.hasOwn(crawlFailure.error, "pageOrdinal"), false);

  const cleanupFailure = await runStasisV03Case({
    sdk: {
      createStasisSessionPool() {
        return {
          async close() {
            throw stasisProcessExitError(stderrTail, { exitCode: 134, signal: null });
          },
        };
      },
      async crawlWithStasis() {
        return { pages: [], scheduledUrls: [] };
      },
    },
    start: origin,
    pageLimit: 20,
    depthLimit: 2,
    executablePath: "/opt/stasis-v0.3.3/stasis",
    recordWallTime: false,
    retainFailurePhase: true,
  });
  assert.equal(cleanupFailure.cleanup.error.failurePhase, "pool_close");
  assert.equal(cleanupFailure.cleanup.error.exitCode, 134);
  assert.equal(cleanupFailure.cleanup.error.signal, null);
  assert.equal(Object.hasOwn(cleanupFailure.cleanup.error, "pageOrdinal"), false);
});

test("only the untimed Stasis warm-up receives lifecycle tracing in an inherited env copy", async () => {
  const launchEnvironments = [];
  const inherited = {
    KEEP_ME: "inherited-value",
    ANOTHER_VALUE: "also-retained",
    STASIS_LIFECYCLE_TRACE_V1: "ambient-value-must-not-leak",
  };
  const runner = createStasisPerformanceRunner({
    sdkVersion: "0.3.3",
    executablePath: "/opt/stasis-v0.3.3/stasis",
    environment: inherited,
    sdk: {
      CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
      createStasisSessionPool(options) {
        launchEnvironments.push(options.launch.env);
        return { async close() {} };
      },
      async crawlWithStasis() {
        return successfulRun("stasis").result;
      },
    },
  });
  const crawl = { start: origin, pageLimit: 20, depthLimit: 2 };
  await runner({ phase: "warmup", crawl });
  await runner({ phase: "sample", crawl });
  await runner({ phase: "control", crawl });

  assert.equal(launchEnvironments.length, 3);
  assert.equal(launchEnvironments.every((value) => value.KEEP_ME === "inherited-value"), true);
  assert.equal(launchEnvironments.every((value) => value.ANOTHER_VALUE === "also-retained"), true);
  assert.equal(launchEnvironments[0].STASIS_LIFECYCLE_TRACE_V1, "1");
  assert.equal(Object.hasOwn(launchEnvironments[1], "STASIS_LIFECYCLE_TRACE_V1"), false);
  assert.equal(Object.hasOwn(launchEnvironments[2], "STASIS_LIFECYCLE_TRACE_V1"), false);
  assert.notEqual(launchEnvironments[0], launchEnvironments[1]);
  assert.notEqual(launchEnvironments[1], launchEnvironments[2]);
  assert.deepEqual(inherited, {
    KEEP_ME: "inherited-value",
    ANOTHER_VALUE: "also-retained",
    STASIS_LIFECYCLE_TRACE_V1: "ambient-value-must-not-leak",
  });
});

test("clock failures are retained as typed terminal observations and never discarded", async () => {
  const scenarios = [
    {
      values: [new TypeError("start details")],
      code: "clock_start_invalid",
      timing: { startNs: null, endNs: null, durationNs: null },
      timedCalls: 0,
    },
    {
      values: [10n, new TypeError("end details")],
      code: "clock_end_invalid",
      timing: { startNs: "10", endNs: null, durationNs: null },
      timedCalls: 1,
    },
    {
      values: [10n, 10n],
      code: "clock_not_monotonic",
      timing: { startNs: "10", endNs: "10", durationNs: null },
      timedCalls: 1,
    },
  ];
  for (const scenario of scenarios) {
    let clockIndex = 0;
    let timedCalls = 0;
    const injected = runners();
    const baseline = injected.crawlee;
    injected.crawlee = async (job) => {
      if (job.phase === "sample") timedCalls += 1;
      return baseline(job);
    };
    const raw = await runCrawlPerformanceAuthority({
      identity: identity(),
      runners: injected,
      now() {
        const value = scenario.values[clockIndex++];
        if (value instanceof Error) throw value;
        return value;
      },
    });
    assert.equal(raw.pairs.length, 1);
    assert.equal(raw.pairs[0].observations.length, 1);
    assert.equal(raw.pairs[0].observations[0].status, "clock_error");
    assert.equal(raw.pairs[0].observations[0].error.code, scenario.code);
    assert.deepEqual(raw.pairs[0].observations[0].timing, scenario.timing);
    assert.equal(timedCalls, scenario.timedCalls);
    assert.deepEqual(raw.authority.reasonCodes, [
      "clock_failure",
      "paired_sample_schedule_incomplete",
    ]);
    assert.equal(assertCrawlPerformanceRaw(raw), raw);
  }
});

test("one invalid timed observation is retained, invalidates all authority, and fail-stops", async () => {
  const calls = [];
  const injected = runners(calls);
  const original = injected.crawlee;
  injected.crawlee = async (job) => {
    const result = await original(job);
    if (job.phase === "sample") {
      result.cleanup = {
        status: "failed",
        phase: "browser_close",
        error: { name: "Error", messageOmitted: true },
      };
    }
    return result;
  };
  let clockReads = 0;
  const raw = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: injected,
    now() {
      clockReads += 1;
      return BigInt(clockReads);
    },
  });

  assert.equal(raw.authority.valid, false);
  assert.equal(raw.authority.status, "invalid");
  assert.deepEqual(raw.authority.reasonCodes, [
    "crawlee_sample_invalid",
    "paired_sample_schedule_incomplete",
  ]);
  assert.equal(raw.pairs.length, 1);
  assert.equal(raw.pairs[0].observations.length, 1);
  assert.equal(raw.pairs[0].observations[0].run.cleanup.status, "failed");
  assert.deepEqual(raw.pairs[0].observations[0].oracle.reasons, ["cleanup_not_passed"]);
  assert.equal(clockReads, 2);
  assert.deepEqual(calls, [
    "crawlee:warmup:primary",
    "stasis:warmup:primary",
    "crawlee:sample:1",
  ]);
  assert.equal(raw.controls.status, "not_run");
  assert.equal(assertCrawlPerformanceRaw(raw), raw);
});

test("crawl raw validation rejects forged Stasis process diagnostics at every retained error site", async () => {
  const stderrTail = [
    `private ${["", "home", "runner", "work"].join("/")} path`,
    "stasis_lifecycle_v1 phase=close_accepted",
    "Redirecting call to abort() to mozalloc_abort",
  ].join("\n");
  const failedRun = await runStasisV03Case({
    sdk: {
      createStasisSessionPool() {
        return { async close() {} };
      },
      async crawlWithStasis() {
        throw stasisProcessExitError(stderrTail);
      },
    },
    start: origin,
    pageLimit: 20,
    depthLimit: 2,
    executablePath: "/opt/stasis-v0.3.3/stasis",
    recordWallTime: false,
    retainFailurePhase: true,
  });
  const injected = runners();
  injected.stasis = async () => structuredClone(failedRun);
  const raw = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: injected,
    now: incrementalClock(),
  });
  assert.equal(raw.authority.valid, false);
  assert.equal(raw.warmups.length, 2);
  assert.equal(assertCrawlPerformanceRaw(raw), raw);

  const mutations = [
    (error) => { error.extra = "forged"; },
    (error) => { delete error.stderrTailSha256; },
    (error) => { delete error.failurePhase; },
    (error) => { error.exitCode = -1; },
    (error) => { error.signal = "PRIVATE_SIGNAL"; },
    (error) => { error.crashMarkers.push("private_marker"); },
    (error) => { error.lifecyclePhases.push("hostile_secret"); },
    (error) => { error.failurePhase = "page_19"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(raw);
    mutate(changed.warmups[1].run.error);
    assert.throws(
      () => assertCrawlPerformanceRaw(changed),
      /Invalid|unknown/u,
    );
  }

  const cleanupFailedRun = await runStasisV03Case({
    sdk: {
      createStasisSessionPool() {
        return {
          async close() {
            throw stasisProcessExitError(stderrTail);
          },
        };
      },
      async crawlWithStasis() {
        return { pages: [], scheduledUrls: [] };
      },
    },
    start: origin,
    pageLimit: 20,
    depthLimit: 2,
    executablePath: "/opt/stasis-v0.3.3/stasis",
    recordWallTime: false,
    retainFailurePhase: true,
  });
  const cleanupInjected = runners();
  cleanupInjected.stasis = async () => structuredClone(cleanupFailedRun);
  const cleanupRaw = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: cleanupInjected,
    now: incrementalClock(),
  });
  const changed = structuredClone(cleanupRaw);
  changed.warmups[1].run.cleanup.error.extra = "forged";
  assert.throws(
    () => assertCrawlPerformanceRaw(changed),
    /unknown/u,
  );
});

test("a 19-of-20 lane cannot contribute a performance sample even when its pair completes", async () => {
  const calls = [];
  const injected = runners(calls);
  const original = injected.stasis;
  injected.stasis = async (job) => {
    const result = await original(job);
    if (job.phase === "sample") result.result.pages.pop();
    return result;
  };
  let clock = 0n;
  const raw = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: injected,
    now() {
      const value = clock;
      clock += 1n;
      return value;
    },
  });

  assert.equal(raw.authority.valid, false);
  assert.equal(raw.authority.completedPairs, 1);
  assert.equal(raw.authority.exactEquivalentPairs, 0);
  assert.deepEqual(raw.authority.reasonCodes, [
    "stasis_sample_invalid",
    "paired_sample_schedule_incomplete",
  ]);
  assert.equal(raw.pairs[0].observations[1].oracle.exactOraclePages, 19);
  assert.equal(raw.pairs[0].observations[1].run.result.pages.length, 19);
  assert.equal(calls.some((call) => call.endsWith(":2")), false);
});

test("raw schema rejects host, order, timing, and authority mutations", async () => {
  const raw = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: runners(),
    now: incrementalClock(),
  });
  const mutations = [
    (value) => { value.identity.host.hostClassDigest = "0".repeat(64); },
    (value) => { value.identity.provenance.runId = "01"; },
    (value) => { value.identity.provenance.harnessCheckoutTree = "0".repeat(39); },
    (value) => { value.identity.provenance.harnessCheckoutWorktree.clean = false; },
    (value) => { value.identity.corpus.sourceSha256 = "0".repeat(64); },
    (value) => { value.identity.crawlee.hostClassDigest = "0".repeat(64); },
    (value) => { value.identity.crawlee.chromiumExecutableBytes = 0; },
    (value) => { value.identity.stasis.eglRuntime.libraries[0].sha256 = "0".repeat(63); },
    (value) => { value.identity.stasis.eglRuntime.libraries[0].basename = "/private/libEGL.so.1"; },
    (value) => { delete value.identity.stasis.eglRuntime.packages[1].version; },
    (value) => { value.pairs[1].order = "AB"; },
    (value) => { value.pairs[0].observations[0].timing.durationNs = "01"; },
    (value) => { value.pairs[0].observations[0].timing.durationNs = "0"; },
    (value) => { value.pairs[0].observations[0].timing.endNs = "11"; },
    (value) => {
      const prior = value.pairs[0].observations[0].timing;
      const next = value.pairs[0].observations[1].timing;
      next.startNs = (BigInt(prior.endNs) - 1n).toString();
      next.durationNs = (BigInt(next.endNs) - BigInt(next.startNs)).toString();
    },
    (value) => { value.authority.completedPairs = 9; },
    (value) => { value.authority.reasonCodes.push("arbitrary_extra"); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(raw);
    mutate(changed);
    assert.throws(
      () => assertCrawlPerformanceRaw(changed),
      /[Ii]nvalid|mismatch|overlap|backwards/u,
    );
  }
});

test("raw replay rejects every observation retained after the first invalid result", async () => {
  const valid = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: runners(),
    now: incrementalClock(),
  });
  const injected = runners();
  const original = injected.crawlee;
  injected.crawlee = async (job) => {
    const result = await original(job);
    if (job.phase === "sample") result.result.pages.pop();
    return result;
  };
  const failed = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: injected,
    now: incrementalClock(),
  });
  const changed = structuredClone(failed);
  changed.pairs[0].observations.push(structuredClone(valid.pairs[0].observations[1]));
  assert.throws(
    () => assertCrawlPerformanceRaw(changed),
    /continued after an invalid observation/u,
  );
});

test("raw replay rejects an observation retained after a terminal clock failure", async () => {
  const valid = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: runners(),
    now: incrementalClock(),
  });
  let read = 0;
  const failed = await runCrawlPerformanceAuthority({
    identity: identity(),
    runners: runners(),
    now() {
      read += 1;
      return read === 1 ? 10n : 10n;
    },
  });
  const changed = structuredClone(failed);
  changed.pairs[0].observations.push(structuredClone(valid.pairs[0].observations[1]));
  assert.throws(
    () => assertCrawlPerformanceRaw(changed),
    /continued after a clock failure/u,
  );
});

test("Stasis runner factory rejects the root historical 0.2.1 SDK identity", () => {
  const sdk = {
    CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
    crawlWithStasis() {},
    createStasisSessionPool() {},
  };
  assert.throws(
    () => createStasisPerformanceRunner({
      sdk,
      sdkVersion: "0.2.1",
      executablePath: "/opt/stasis-v0.3.3/stasis",
    }),
    /requires @oxhq\/stasis@0\.3\.3/u,
  );
});
