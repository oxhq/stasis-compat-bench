import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCrawlPerformanceRaw,
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceHostIdentity,
  createStasisPerformanceRunner,
  crawlPerformanceProtocol,
  crawlPerformanceRules,
  crawlPerformanceSchema,
  crawlPerformanceTrack,
  runCrawlPerformanceAuthority,
} from "../src/performance/crawl.mjs";
import {
  expectedPrimaryScheduledUrls,
  origin,
} from "../src/crawl/corpus.mjs";

function identity() {
  const host = {
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260824.1.0",
    cpuModel: "Example Hosted CPU",
    logicalCpuCount: 4,
  };
  const retainedHost = createCrawlPerformanceHostIdentity(host);
  const identityDigest = computeCrawlPerformanceHostIdentityDigest(retainedHost);
  return {
    host: structuredClone(retainedHost),
    crawlee: {
      runner: "crawlee-playwrightcrawler",
      nodeVersion: "v22.20.0",
      crawleeVersion: "3.18.1",
      playwrightVersion: "1.62.1",
      browser: "chromium",
      chromiumVersion: "151.0.7922.34",
      chromiumExecutableSha256: "a".repeat(64),
      hostIdentityDigest: identityDigest,
    },
    stasis: {
      runner: "stasis-reference-crawler-v0.3.3",
      nodeVersion: "v22.20.0",
      package: "@oxhq/stasis",
      sdkVersion: "0.3.3",
      revision: "48c5a718a9ddd63f496e45307e1484974ccf8587",
      profile: "controlled-web-session-v2",
      sdkArchiveSha256: "b".repeat(64),
      executableSha256: "c".repeat(64),
      hostIdentityDigest: identityDigest,
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
  assert.equal(raw.warmups.some((item) => Object.hasOwn(item, "elapsedNs")), false);
  assert.deepEqual(raw.pairs.map(({ pairIndex, order, lanes }) => ({ pairIndex, order, lanes })),
    Array.from({ length: 10 }, (_, index) => ({
      pairIndex: index + 1,
      order: index % 2 === 0 ? "AB" : "BA",
      lanes: index % 2 === 0 ? ["crawlee", "stasis"] : ["stasis", "crawlee"],
    })),
  );
  assert.equal(raw.pairs.every((pair) => pair.observations.every((item) => item.elapsedNs === "7")), true);
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
  assert.equal(raw.controls.observations.some((item) => Object.hasOwn(item, "elapsedNs")), false);
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
    (value) => { value.identity.host.hostname = "must-not-be-retained"; },
    (value) => { value.identity.crawlee.hostIdentityDigest = "0".repeat(64); },
    (value) => { value.pairs[1].order = "AB"; },
    (value) => { value.pairs[0].observations[0].elapsedNs = "01"; },
    (value) => { value.authority.completedPairs = 9; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(raw);
    mutate(changed);
    assert.throws(() => assertCrawlPerformanceRaw(changed), /Invalid|mismatch/u);
  }
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
