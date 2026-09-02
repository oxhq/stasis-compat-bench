import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCombinedPerformanceEvidence,
  assertCombinedPerformanceEvidence,
  combinedPerformanceEvidenceSchema,
  renderCombinedPerformanceEvidenceMarkdown,
} from "../src/performance/evidence.mjs";
import {
  assertCrawlPerformanceRaw,
  crawlPerformanceCorpusIdentity,
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceGithubProvenance,
  createCrawlPerformanceHostIdentity,
  runCrawlPerformanceAuthority,
} from "../src/performance/crawl.mjs";
import {
  assertRwaPerformanceRaw,
  createRwaPerformanceHostIdentity,
  runRwaPerformanceAuthority,
  rwaPerformanceLaneResultSchema,
  rwaPerformanceSemanticDifferenceDisclosure,
  rwaPerformanceTrack,
} from "../src/performance/rwa.mjs";
import { rwaAuthCases } from "../src/rwa/cases.mjs";
import { expectedPrimaryScheduledUrls, origin } from "../src/crawl/corpus.mjs";

const rwaPairDurations = [
  { baselineNs: "11000000", stasisNs: "5000000" },
  { baselineNs: "13000000", stasisNs: "6000000" },
  { baselineNs: "15000000", stasisNs: "7000000" },
  { baselineNs: "17000000", stasisNs: "8000000" },
  { baselineNs: "19000000", stasisNs: "9000000" },
  { baselineNs: "21000000", stasisNs: "10000000" },
  { baselineNs: "23000000", stasisNs: "11000000" },
  { baselineNs: "25000000", stasisNs: "12000000" },
  { baselineNs: "27000000", stasisNs: "13000000" },
  { baselineNs: "29000000", stasisNs: "14000000" },
];

const crawlPairDurations = [
  { baselineNs: "9000000", stasisNs: "6000000" },
  { baselineNs: "9500000", stasisNs: "6200000" },
  { baselineNs: "10000000", stasisNs: "6400000" },
  { baselineNs: "10500000", stasisNs: "6600000" },
  { baselineNs: "11000000", stasisNs: "6800000" },
  { baselineNs: "11500000", stasisNs: "7000000" },
  { baselineNs: "12000000", stasisNs: "7200000" },
  { baselineNs: "12500000", stasisNs: "7400000" },
  { baselineNs: "13000000", stasisNs: "7600000" },
  { baselineNs: "13500000", stasisNs: "7800000" },
];

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

const rwaHost = createRwaPerformanceHostIdentity({
  platform: "win32",
  arch: "x64",
  runnerOs: "Windows",
  imageOs: "windows-2025",
  imageVersion: "20260824.1",
  cpuModel: "Test CPU",
  logicalCpuCount: 8,
  instanceDigest: "4".repeat(64),
});

test("combined performance evidence replays two valid authorities exactly", async () => {
  const rwaRaw = await buildValidRwaRaw(rwaPairDurations);
  const crawlRaw = await buildValidCrawlRaw(crawlPairDurations);

  assert.equal(assertRwaPerformanceRaw(rwaRaw), rwaRaw);
  assert.equal(assertCrawlPerformanceRaw(crawlRaw), crawlRaw);

  const evidence = buildCombinedPerformanceEvidence({ rwaRaw, crawlRaw });

  assert.equal(evidence.schema, combinedPerformanceEvidenceSchema);
  assert.equal(evidence.authority.valid, true);
  assert.equal(evidence.claimBoundary.scope, "per_track_single_host_exploratory_only");
  assert.equal(evidence.rwa.workload.denominatorCount, 8);
  assert.equal(evidence.crawl.workload.denominatorCount, 20);
  assert.deepEqual(evidence.rwa.pairs, rwaPairDurations.map((pair, index) => ({
    pairIndex: index + 1,
    order: index % 2 === 0 ? "AB" : "BA",
    baselineRunner: "cypress",
    stasisRunner: "stasis",
    baselineDurationNs: pair.baselineNs,
    stasisDurationNs: pair.stasisNs,
  })));
  assert.deepEqual(evidence.crawl.pairs, crawlPairDurations.map((pair, index) => ({
    pairIndex: index + 1,
    order: index % 2 === 0 ? "AB" : "BA",
    baselineRunner: "crawlee",
    stasisRunner: "stasis",
    baselineDurationNs: pair.baselineNs,
    stasisDurationNs: pair.stasisNs,
  })));
  assert.equal(evidence.rwa.statistics.cypress.medianMilliseconds, "20.000000");
  assert.equal(evidence.rwa.statistics.cypress.iqrMilliseconds, "10.000000");
  assert.equal(evidence.rwa.statistics.stasis.medianMilliseconds, "9.500000");
  assert.equal(evidence.rwa.statistics.stasis.iqrMilliseconds, "5.000000");
  assert.deepEqual(evidence.rwa.statistics.pairedBaselineOverCandidate.exact, {
    numerator: "379",
    denominator: "180",
  });
  assert.equal(evidence.rwa.statistics.pairedBaselineOverCandidate.decimal, "2.105556");
  assert.equal(evidence.crawl.statistics.crawlee.medianMilliseconds, "11.250000");
  assert.equal(evidence.crawl.statistics.crawlee.iqrMilliseconds, "2.500000");
  assert.equal(evidence.crawl.statistics.stasis.medianMilliseconds, "6.900000");
  assert.equal(evidence.crawl.statistics.stasis.iqrMilliseconds, "1.000000");
  assert.deepEqual(evidence.crawl.statistics.pairedBaselineOverCandidate.exact, {
    numerator: "194",
    denominator: "119",
  });
  assert.equal(evidence.crawl.statistics.pairedBaselineOverCandidate.decimal, "1.630252");
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.rwa.pairs), true);
  assert.equal(assertCombinedPerformanceEvidence(evidence, { rwaRaw, crawlRaw }), evidence);
});

test("combined performance evidence fails closed after any retained mutation", async () => {
  const rwaRaw = await buildValidRwaRaw(rwaPairDurations);
  const crawlRaw = await buildValidCrawlRaw(crawlPairDurations);
  const evidence = buildCombinedPerformanceEvidence({ rwaRaw, crawlRaw });
  const tampered = structuredClone(evidence);
  tampered.crawl.statistics.pairedBaselineOverCandidate.decimal = "9.999999";
  assert.throws(
    () => assertCombinedPerformanceEvidence(tampered, { rwaRaw, crawlRaw }),
    /do(?:es)? not replay exactly/u,
  );
});

test("combined performance evidence rejects invalid track authority even when raw shape replays", async () => {
  const rwaRaw = await buildInvalidRwaRaw();
  const crawlRaw = await buildValidCrawlRaw(crawlPairDurations);

  assert.equal(assertRwaPerformanceRaw(rwaRaw), rwaRaw);
  assert.equal(rwaRaw.authority.valid, false);

  assert.throws(
    () => buildCombinedPerformanceEvidence({ rwaRaw, crawlRaw }),
    /requires a valid RWA raw authority/u,
  );
});

test("combined performance Markdown rendering is deterministic and explicitly bounded", async () => {
  const rwaRaw = await buildValidRwaRaw(rwaPairDurations);
  const crawlRaw = await buildValidCrawlRaw(crawlPairDurations);
  const evidence = buildCombinedPerformanceEvidence({ rwaRaw, crawlRaw });

  const expected = [
    "# Stasis v0.3.3 combined performance evidence",
    "",
    "Each retained timing summary is single-host and exploratory within its own preregistered track. This combined artifact does not pool the Windows RWA and hosted Linux crawl timings into a cross-host benchmark and does not support a general speed claim.",
    "",
    "## RWA track",
    "",
    `- Protocol: \`${evidence.rwa.protocol}\``,
    `- Raw schema: \`${evidence.rwa.rawSchema}\``,
    `- Track: \`${evidence.rwa.track}\``,
    `- Host: \`${evidence.rwa.host.platform}/${evidence.rwa.host.arch}\` on \`${evidence.rwa.host.imageOs}\` \`${evidence.rwa.host.imageVersion}\``,
    `- Host instance digest: \`${evidence.rwa.hostBinding.digest}\``,
    "- Workload: 8 complete application intents across 10 exact AB/BA pairs",
    "- Boundary: RWA timings compare the same complete eight application intents from the frozen authentication slice. They are not a Cypress API-equivalence claim and not a claim about all 45 RWA tests.",
    `- Cypress median / IQR: ${evidence.rwa.statistics.cypress.medianMilliseconds} ms / ${evidence.rwa.statistics.cypress.iqrMilliseconds} ms`,
    `- Stasis median / IQR: ${evidence.rwa.statistics.stasis.medianMilliseconds} ms / ${evidence.rwa.statistics.stasis.iqrMilliseconds} ms`,
    `- Median paired Cypress-over-Stasis ratio: ${evidence.rwa.statistics.pairedBaselineOverCandidate.decimal}x`,
    "",
    "| Pair | Order | Cypress ns | Stasis ns |",
    "| ---: | :---: | ---: | ---: |",
    ...evidence.rwa.pairs.map((pair) =>
      `| ${pair.pairIndex} | ${pair.order} | ${pair.baselineDurationNs} | ${pair.stasisDurationNs} |`
    ),
    "",
    "## Crawl track",
    "",
    `- Protocol: \`${evidence.crawl.protocol}\``,
    `- Raw schema: \`${evidence.crawl.rawSchema}\``,
    `- Track: \`${evidence.crawl.track}\``,
    `- Host: \`${evidence.crawl.host.platform}/${evidence.crawl.host.arch}\` on \`${evidence.crawl.host.imageOs}\` \`${evidence.crawl.host.imageVersion}\``,
    `- Host boot-instance digest: \`${evidence.crawl.hostBinding.digest}\``,
    "- Workload: 20 complete frozen pages across 10 exact AB/BA pairs",
    "- Boundary: Crawl timings compare the complete frozen deterministic 20-page workload on its retained host only. They do not support a cross-host or general speed claim.",
    `- Crawlee median / IQR: ${evidence.crawl.statistics.crawlee.medianMilliseconds} ms / ${evidence.crawl.statistics.crawlee.iqrMilliseconds} ms`,
    `- Stasis median / IQR: ${evidence.crawl.statistics.stasis.medianMilliseconds} ms / ${evidence.crawl.statistics.stasis.iqrMilliseconds} ms`,
    `- Median paired Crawlee-over-Stasis ratio: ${evidence.crawl.statistics.pairedBaselineOverCandidate.decimal}x`,
    "",
    "| Pair | Order | Crawlee ns | Stasis ns |",
    "| ---: | :---: | ---: | ---: |",
    ...evidence.crawl.pairs.map((pair) =>
      `| ${pair.pairIndex} | ${pair.order} | ${pair.baselineDurationNs} | ${pair.stasisDurationNs} |`
    ),
    "",
  ].join("\n");

  assert.equal(renderCombinedPerformanceEvidenceMarkdown(evidence), expected);
  assert.equal(renderCombinedPerformanceEvidenceMarkdown(evidence), expected);
});

async function buildValidRwaRaw(pairDurations) {
  const durations = pairDurations.flatMap((pair, index) =>
    index % 2 === 0
      ? [pair.baselineNs, pair.stasisNs]
      : [pair.stasisNs, pair.baselineNs]
  );
  return runRwaPerformanceAuthority({
    monotonicNow: monotonicClockFromDurations(durations),
    preflight: async () => ({ sameHostVerified: true, host: rwaHost }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => undefined,
    runCypressLane: async () => rwaLaneResult("cypress"),
    runStasisLane: async () => rwaLaneResult("stasis-v0.3.3"),
  });
}

async function buildInvalidRwaRaw() {
  return runRwaPerformanceAuthority({
    monotonicNow: monotonicClockFromDurations(
      Array.from({ length: 20 }, (_, index) => (index % 2 === 0 ? "1000000" : "500000")),
    ),
    preflight: async () => ({ sameHostVerified: true, host: rwaHost }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => undefined,
    runCypressLane: async () => rwaLaneResult("cypress"),
    runStasisLane: async (context) => context.phase === "timed" && context.pairIndex === 1
      ? rwaLaneResult("stasis-v0.3.3", {
          cases: rwaAuthCases.map((item, index) => rwaCaseResult("stasis-v0.3.3", item, index === 0
            ? {
                classification: "PROFILE_UNSUPPORTED",
                behaviorallySupported: false,
                allOraclesPassed: false,
              }
            : {})),
        })
      : rwaLaneResult("stasis-v0.3.3"),
  });
}

async function buildValidCrawlRaw(pairDurations) {
  const durations = pairDurations.flatMap((pair, index) =>
    index % 2 === 0
      ? [pair.baselineNs, pair.stasisNs]
      : [pair.stasisNs, pair.baselineNs]
  );
  return runCrawlPerformanceAuthority({
    identity: crawlIdentity(),
    runners: {
      crawlee: async () => successfulCrawlRun("crawlee"),
      stasis: async () => successfulCrawlRun("stasis"),
    },
    now: monotonicClockFromDurations(durations),
  });
}

function monotonicClockFromDurations(durations) {
  let current = 1n;
  const calls = [];
  for (const duration of durations) {
    const delta = BigInt(duration);
    calls.push(current);
    current += delta;
    calls.push(current);
    current += 1n;
  }
  let index = 0;
  return () => {
    const next = calls[index];
    if (next === undefined) throw new Error("No retained monotonic clock value");
    index += 1;
    return next;
  };
}

function rwaLaneResult(runner, overrides = {}) {
  const cases = overrides.cases ?? rwaAuthCases.map((item) => rwaCaseResult(runner, item));
  return {
    schema: rwaPerformanceLaneResultSchema,
    runner,
    track: rwaPerformanceTrack,
    frameworkNativeWaiting: runner === "cypress"
      ? "cypress-command-and-assertion-retry"
      : "none",
    hostIdentityDigest: rwaHost.identityDigest,
    hostInstanceDigest: rwaHost.instanceDigest,
    engineStartupIncluded: true,
    engineStartupCount: runner === "cypress" ? 1 : 8,
    cleanupComplete: true,
    freshState: true,
    seedBeforeEveryIntent: true,
    selectedIntentCount: 8,
    seededIntentCount: cases.filter(({ seeded }) => seeded).length,
    completedIntentCount: cases.filter(({ intentCompleted }) => intentCompleted).length,
    retryCount: 0,
    sleepCount: 0,
    droppedFailureCount: 0,
    cases,
    ...overrides,
  };
}

function rwaCaseResult(runner, item, overrides = {}) {
  const allOraclesPassed = overrides.allOraclesPassed ?? true;
  return {
    ordinal: item.ordinal,
    id: item.id,
    classification: runner === "cypress"
      ? "PASS_EQUIVALENT"
      : "PASS_WITH_SEMANTIC_DIFFERENCE",
    seeded: true,
    intentCompleted: true,
    attemptCount: 1,
    oracles: item.oracles.map(({ id }) => ({
      id,
      status: allOraclesPassed ? "passed" : "failed",
    })),
    allOraclesPassed,
    behaviorallySupported: true,
    stateEvidence: rwaCaseStateEvidence(runner, item),
    semanticDifferenceIds: runner === "cypress"
      ? []
      : [...rwaPerformanceSemanticDifferenceDisclosure.cases.find(({ id }) => id === item.id)
        .semanticDifferenceIds],
    ...overrides,
  };
}

function rwaCaseStateEvidence(runner, item) {
  if (runner === "cypress") {
    return {
      attemptOrdinal: 1,
      beforeEachSeedHookLineIdentity: "cypress/tests/ui/auth.spec.ts:7-18",
      beforeEachSeedHookSource: cypressBeforeEachSeedHookSource,
      beforeEachSeedHookSourceSha256: cypressBeforeEachSeedHookSourceSha256,
      engineInstanceOrdinal: 1,
      seedHookOrdinal: item.ordinal,
      testIsolation: "upstream-cypress-test-isolation",
    };
  }
  return {
    cleanupCheckpointPhase: "cleanup",
    cleanupCheckpointSequence: 4,
    cleanupCheckpointStatus: "passed",
    engineInstanceOrdinal: item.ordinal,
    runtimeLaunchCheckpointPhase: "runtime-launch",
    runtimeLaunchCheckpointSequence: 3,
    runtimeLaunchCheckpointStatus: "passed",
    runtimeLaunchFreshProcess: true,
    seedCheckpointPhase: "seed",
    seedCheckpointSequence: 2,
    seedCheckpointStatus: "passed",
    seedOrdinal: item.ordinal,
  };
}

function crawlIdentity() {
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
  const hostClassDigest = computeCrawlPerformanceHostIdentityDigest(retainedHost);
  return {
    host: structuredClone(retainedHost),
    provenance: createCrawlPerformanceGithubProvenance({
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "performance",
      job: "crawl-benchmark",
      runId: "33599999999",
      runAttempt: "1",
      workflowSourceSha: "e".repeat(40),
      workflowSourceRef: "refs/heads/post-v033-performance-evidence",
      harnessCheckoutRevision: "f".repeat(40),
      harnessCheckoutTree: "1".repeat(40),
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
      hostClassDigest,
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
      hostClassDigest,
    },
  };
}

function successfulCrawlRun(lane) {
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
