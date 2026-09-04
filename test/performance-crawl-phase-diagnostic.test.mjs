import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  assertCrawlPhaseDiagnostic,
  assertCrawlPhaseDiagnosticEvidence,
  bindAuthoritativeCrawlRaw,
  composeCrawlPhaseDiagnosticEvidence,
  createCrawlPhaseDiagnosticInputIdentity,
  createCrawlPhaseDiagnosticJob,
  createCrawleeLauncherPhaseInstrumentation,
  createStasisCrawlPhaseDiagnosticRunner,
  crawlPhaseDiagnosticEvidenceSchema,
  crawlPhaseDiagnosticProtocol,
  crawlPhaseDiagnosticRules,
  crawlPhaseDiagnosticSchema,
  crawlPhaseDiagnosticTrack,
} from "../src/performance/crawl-phase-diagnostic.mjs";
import {
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceGithubProvenance,
  createCrawlPerformanceHostIdentity,
  crawlPerformanceCorpusIdentity,
  runCrawlPerformanceAuthority,
} from "../src/performance/crawl.mjs";
import {
  expectedPrimaryScheduledUrls,
  origin,
} from "../src/crawl/corpus.mjs";
import { cleanHarnessWorktreeEvidence } from "../src/performance/harness-worktree.mjs";
import { linuxEglRuntimeSchema } from "../src/performance/linux-egl-runtime.mjs";
import {
  performanceReplicationArtifactBindingSchema,
} from "../src/performance/replication-artifact-binding.mjs";
import {
  performanceReplicationExpectedArtifactNames,
  performanceReplicationHostedProvenanceSchema,
} from "../src/performance/replication-hosted-provenance.mjs";
import {
  performanceReplicationVerificationSchema,
} from "../src/performance/replication.mjs";
import {
  crawlPhaseDiagnosticCrawleeRawArtifactPath,
  crawlPhaseDiagnosticEvidenceArtifactPath,
  crawlPhaseDiagnosticStasisRawArtifactPath,
  runCrawlPhaseDiagnosticCommand,
} from "../src/performance/run-crawl-phase-diagnostic.mjs";
import { summarizePairedDurations } from "../src/performance/statistics.mjs";

const start = "http://stasis-compat.test/";

function identity() {
  return {
    authorityRawSha256: "a".repeat(64),
    harnessRevision: "b".repeat(40),
    host: {
      classDigest: "c".repeat(64),
      bootInstanceDigest: "d".repeat(64),
    },
  };
}

function incrementalClock(step = 10n) {
  let value = 0n;
  return () => {
    const current = value;
    value += step;
    return current;
  };
}

function successfulSdk(events = []) {
  const session = { exactSessionObject: true };
  const pool = {
    maxProcesses: 1,
    async run(request, callback, options) {
      events.push("real-pool-run");
      assert.equal(this, pool);
      assert.deepEqual(request, {
        url: start,
        options: { profile: "controlled-web-session-v2" },
      });
      assert.deepEqual(options, { signal: undefined });
      const result = await callback(session);
      events.push("real-pool-release-complete");
      return result;
    },
    async close() {
      events.push("real-pool-close");
      assert.equal(this, pool);
    },
  };
  const sdk = {
    CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
    createStasisSessionPool(options) {
      events.push("real-sdk-create-pool");
      assert.equal(this, sdk);
      assert.equal(options.maxProcesses, 1);
      assert.equal(options.maxQueue, 20);
      assert.equal(options.launch.executablePath, "/opt/stasis-v0.3.3/stasis");
      assert.equal(Object.hasOwn(options.launch.env, "STASIS_LIFECYCLE_TRACE_V1"), false);
      return pool;
    },
    async crawlWithStasis(observedPool, options) {
      events.push("real-sdk-crawl");
      assert.equal(this, sdk);
      assert.notEqual(observedPool, pool);
      assert.equal(observedPool.maxProcesses, pool.maxProcesses);
      assert.equal(options.start, start);
      assert.equal(options.maxPages, 20);
      assert.equal(options.maxDepth, 2);
      assert.equal(options.concurrency, 1);
      const page = await observedPool.run({
        url: options.start,
        options: { profile: options.profile },
      }, async (observedSession) => {
        events.push("real-sdk-work-callback");
        assert.equal(observedSession, session);
        return {
          requestedUrl: start,
          url: start,
          depth: 0,
          status: "crawled",
          settleOutcome: "quiescent",
          links: [],
        };
      }, { signal: undefined });
      return { pages: [page], scheduledUrls: [start] };
    },
  };
  return sdk;
}

async function successfulStasisArtifact() {
  const runner = createStasisCrawlPhaseDiagnosticRunner({
    identity: identity(),
    sdk: successfulSdk(),
    sdkVersion: "0.3.3",
    executablePath: "/opt/stasis-v0.3.3/stasis",
    environment: { KEEP_ME: "yes", STASIS_LIFECYCLE_TRACE_V1: "must-not-leak" },
    now: incrementalClock(),
  });
  return runner(createCrawlPhaseDiagnosticJob({ lane: "stasis", ordinal: 1 }));
}

function eglRuntimeEvidence() {
  return {
    schema: linuxEglRuntimeSchema,
    dlopen: { method: "python3_ctypes_cdll_proc_maps_v1", status: "passed" },
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

function authoritativeIdentity() {
  const host = createCrawlPerformanceHostIdentity({
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260824.1.0",
    cpuModel: "Authority Hosted CPU",
    logicalCpuCount: 4,
    bootInstanceDigest: "1".repeat(64),
  });
  const hostClassDigest = computeCrawlPerformanceHostIdentityDigest(host);
  return {
    host: structuredClone(host),
    provenance: createCrawlPerformanceGithubProvenance({
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "Stasis v0.3.3 performance evidence",
      job: "ubuntu-crawl",
      runId: "33859999999",
      runAttempt: "1",
      workflowSourceSha: "6c7a6013e00584c8cb8d54c80cee5dbbcf3ca1b9",
      workflowSourceRef: "refs/heads/codex/stasis-v033-performance-evidence",
      harnessCheckoutRevision: "c5678b045852a29b89ed4b853da0aa39e6e3bf06",
      harnessCheckoutTree: "4e491acd7d781878a5e84f57ac769e863ee58ac2",
      harnessCheckoutWorktree: structuredClone(cleanHarnessWorktreeEvidence),
    }),
    corpus: structuredClone(crawlPerformanceCorpusIdentity),
    crawlee: {
      runner: "crawlee-playwrightcrawler",
      nodeVersion: "v22.20.0",
      crawleeVersion: "3.18.1",
      playwrightVersion: "1.62.1",
      browser: "chromium",
      chromiumVersion: "Chromium 151.0.7922.34",
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
      runtimeManifestSha256:
        "4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4",
      eglRuntime: eglRuntimeEvidence(),
      hostClassDigest,
    },
  };
}

function primaryRun(lane) {
  const links = new Map([
    [`${origin}/`, [
      `${origin}/static`, `${origin}/canonical`, `${origin}/microtask`,
      `${origin}/timer`, `${origin}/raf`, `${origin}/fetch`, `${origin}/xhr`,
      `${origin}/state`, `${origin}/navigation-start`, `${origin}/interval`,
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

async function authoritativeRawAndBytes() {
  const raw = await runCrawlPerformanceAuthority({
    identity: authoritativeIdentity(),
    runners: Object.fromEntries(["crawlee", "stasis"].map((lane) => [
      lane,
      async () => primaryRun(lane),
    ])),
    now: incrementalClock(7n),
  });
  const bytes = Buffer.from(`${JSON.stringify(raw, null, 2)}\n`, "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { raw: JSON.parse(bytes.toString("utf8")), bytes, sha256 };
}

function artifactBindingReceipt(authority) {
  const provenance = authority.raw.identity.provenance;
  const combinedNames = [
    "performance/SHA256SUMS.txt",
    "performance/combined-evidence.json",
    "performance/combined-evidence.md",
    "performance/combined-verification.json",
    "performance/crawl-raw.json",
    "performance/independent-statistics-replay.json",
    "performance/rwa-raw.json",
  ];
  const artifactArchives = performanceReplicationExpectedArtifactNames.map((name, index) => ({
    name,
    artifactId: 9000 + index,
    bytes: 1000 + index,
    sha256: (index + 1).toString(16).repeat(64),
  }));
  return {
    schema: performanceReplicationArtifactBindingSchema,
    status: "passed",
    pooling: "none",
    claimBoundary: "two_separate_single_host_observations_only",
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    inputs: {
      semanticReceiptSchema: performanceReplicationVerificationSchema,
      hostedReceiptSchema: performanceReplicationHostedProvenanceSchema,
      workflow: {
        provider: provenance.provider,
        repository: provenance.repository,
        workflow: provenance.workflow,
        runId: Number(provenance.runId),
        runAttempt: Number(provenance.runAttempt),
        workflowSourceSha: provenance.workflowSourceSha,
        workflowSourceRef: provenance.workflowSourceRef,
        jobs: {
          rwa: {
            lane: "windows-rwa",
            hostedName: "Windows 2022 RWA Cypress vs Stasis",
            hostedJobId: 10001,
          },
          crawl: {
            lane: "ubuntu-crawl",
            hostedName: "Ubuntu 22.04 Crawlee vs Stasis",
            hostedJobId: 10002,
          },
          combined: {
            hostedName: "Combine and verify performance evidence",
            hostedJobId: 10003,
          },
        },
      },
    },
    artifactArchives,
    extractedFiles: {
      rwaLaneRaw: {
        archive: "stasis-v0.3.3-performance-rwa-raw-attempt-1",
        name: "rwa-raw.json",
        bytes: 123,
        sha256: "a".repeat(64),
      },
      crawlLaneRaw: {
        archive: "stasis-v0.3.3-performance-crawl-raw-attempt-1",
        name: "crawl-raw.json",
        bytes: authority.bytes.byteLength,
        sha256: authority.sha256,
      },
      combinedArchive: combinedNames.map((name, index) => ({
        name,
        bytes: name === "performance/crawl-raw.json"
          ? authority.bytes.byteLength
          : 200 + index,
        sha256: name === "performance/crawl-raw.json"
          ? authority.sha256
          : "b".repeat(64),
      })),
    },
    verification: {
      exactSevenArchiveSet: true,
      allArchiveSizesAndDigestsMatchHostedReceipt: true,
      onlyThreeEvidenceArchivesParsed: true,
      parsedInventoriesExactAndSafe: true,
      laneRawCopiesByteIdentical: true,
      combinedChecksumsExact: true,
      semanticFreshFileBoundaryMatched: true,
      semanticAndHostedWorkflowMatched: true,
      laneJobsMatched: true,
      rawContentsRetained: false,
      urlsRetained: false,
    },
  };
}

function diagnosticAttestation(authorityIdentity = authoritativeIdentity()) {
  const host = createCrawlPerformanceHostIdentity({
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260824.1.0",
    cpuModel: "Different Diagnostic CPU",
    logicalCpuCount: 4,
    bootInstanceDigest: "2".repeat(64),
  });
  const hostClassDigest = host.hostClassDigest;
  return {
    host,
    provenance: {
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "Stasis v0.3.3 crawl phase diagnostics",
      job: "ubuntu-crawl-phase-diagnostic",
      runId: "33860000001",
      runAttempt: "1",
      workflowSourceSha: "8".repeat(40),
      workflowSourceRef: "refs/heads/codex/stasis-v033-performance-replication",
      harnessCheckoutRevision: "9".repeat(40),
      harnessCheckoutTree: "a".repeat(40),
      harnessCheckoutWorktree: structuredClone(cleanHarnessWorktreeEvidence),
    },
    crawlee: { ...structuredClone(authorityIdentity.crawlee), hostClassDigest },
    stasis: { ...structuredClone(authorityIdentity.stasis), hostClassDigest },
  };
}

function twentyPageSdk(stasisResult) {
  const pool = {
    maxProcesses: 1,
    async run(request, callback) {
      return callback({ requestedUrl: request.url });
    },
    async close() {},
  };
  return {
    CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
    createStasisSessionPool() {
      return pool;
    },
    async crawlWithStasis(observedPool) {
      const pages = [];
      for (const page of stasisResult.pages) {
        pages.push(await observedPool.run({ url: page.requestedUrl }, async () =>
          structuredClone(page)));
      }
      return { pages, scheduledUrls: [...stasisResult.scheduledUrls] };
    },
  };
}

function interval(label, startPoint, endPoint) {
  return {
    label,
    settlement: "fulfilled",
    clockStatus: "complete",
    start: structuredClone(startPoint),
    end: structuredClone(endPoint),
    durationNs: (BigInt(endPoint.nanoseconds) - BigInt(startPoint.nanoseconds)).toString(),
    error: null,
    reason: null,
  };
}

function crawleeArtifact(inputIdentity, run = primaryRun("crawlee")) {
  const clockReads = [
    ["crawlee:runner:start", "0"],
    ["crawlee:launch:1:start", "10"],
    ["crawlee:launch:1:end", "20"],
    ["crawlee:browser:1:close:1:start", "70"],
    ["crawlee:browser:1:close:1:end", "80"],
    ["crawlee:runner:end", "100"],
  ].map(([label, nanoseconds], index) => ({
    readOrdinal: index + 1,
    label,
    status: "recorded",
    nanoseconds,
    error: null,
  }));
  return {
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
    identity: structuredClone(inputIdentity),
    job: structuredClone(createCrawlPhaseDiagnosticJob({ lane: "crawlee", ordinal: 1 })),
    lane: "crawlee",
    runner: {
      sourceModule: "src/performance/crawl.mjs",
      factory: "createCrawleePerformanceRunner",
      dependencyHook: "playwright_launcher_proxy",
      substituted: false,
    },
    settlement: { status: "fulfilled", run: structuredClone(run) },
    outerInterval: interval("runner_total", clockReads[0], clockReads[5]),
    clockReads,
    phases: {
      launches: [{ ordinal: 1, interval: interval("browser_launch", clockReads[1], clockReads[2]) }],
      browsers: [{
        ordinal: 1,
        launchOrdinal: 1,
        workloadWindow: interval(
          "browser_resident_workload",
          clockReads[2],
          clockReads[3],
        ),
        closes: [{ ordinal: 1, interval: interval("browser_close", clockReads[3], clockReads[4]) }],
      }],
    },
  };
}

async function diagnosticFixture() {
  const authority = await authoritativeRawAndBytes();
  const bindingReceipt = artifactBindingReceipt(authority);
  const bound = bindAuthoritativeCrawlRaw({
    raw: authority.raw,
    bytes: authority.bytes,
    sha256: authority.sha256,
    artifactBindingReceipt: bindingReceipt,
  });
  const attestation = diagnosticAttestation(authority.raw.identity);
  const inputIdentity = createCrawlPhaseDiagnosticInputIdentity({
    authorityBinding: bound.binding,
    diagnosticAttestation: attestation,
  });
  const stasisRunner = createStasisCrawlPhaseDiagnosticRunner({
    identity: inputIdentity,
    sdk: twentyPageSdk(primaryRun("stasis").result),
    sdkVersion: "0.3.3",
    executablePath: "/opt/stasis-v0.3.3/stasis",
    now: incrementalClock(),
  });
  const stasis = await stasisRunner(createCrawlPhaseDiagnosticJob({
    lane: "stasis",
    ordinal: 2,
  }));
  const crawlee = crawleeArtifact(inputIdentity);
  assertCrawlPhaseDiagnostic(crawlee);
  return { authority, bindingReceipt, attestation, inputIdentity, crawlee, stasis };
}

test("diagnostic jobs freeze the exact unchanged primary crawl and reject drift", async () => {
  const job = createCrawlPhaseDiagnosticJob({ lane: "stasis", ordinal: 7 });
  assert.deepEqual(job, {
    phase: "diagnostic",
    lane: "stasis",
    ordinal: 7,
    crawl: { start, pageLimit: 20, depthLimit: 2 },
  });
  assert.equal(Object.isFrozen(job), true);
  assert.equal(Object.isFrozen(job.crawl), true);
  assert.deepEqual(crawlPhaseDiagnosticRules.workload, {
    start,
    pageLimit: 20,
    depthLimit: 2,
    concurrency: 1,
  });

  const runner = createStasisCrawlPhaseDiagnosticRunner({
    identity: identity(),
    sdk: successfulSdk(),
    sdkVersion: "0.3.3",
    executablePath: "/opt/stasis-v0.3.3/stasis",
    now: incrementalClock(),
  });
  const changed = structuredClone(job);
  changed.crawl.pageLimit = 19;
  await assert.rejects(
    runner(changed),
    /unchanged primary workload/u,
  );
});

test("Stasis diagnostics traverse the real runner and retain localization phase ordering", async () => {
  const events = [];
  const retainedIdentity = identity();
  const runner = createStasisCrawlPhaseDiagnosticRunner({
    identity: retainedIdentity,
    sdk: successfulSdk(events),
    sdkVersion: "0.3.3",
    executablePath: "/opt/stasis-v0.3.3/stasis",
    environment: { KEEP_ME: "yes", STASIS_LIFECYCLE_TRACE_V1: "must-not-leak" },
    now: incrementalClock(),
  });
  const job = createCrawlPhaseDiagnosticJob({ lane: "stasis", ordinal: 1 });
  const artifact = await runner(job);

  assert.equal(artifact.schema, crawlPhaseDiagnosticSchema);
  assert.equal(assertCrawlPhaseDiagnostic(artifact), artifact);
  assert.deepEqual(artifact.identity, retainedIdentity);
  assert.deepEqual(artifact.job, job);
  assert.deepEqual(artifact.runner, {
    sourceModule: "src/performance/crawl.mjs",
    factory: "createStasisPerformanceRunner",
    dependencyHook: "sdk_createStasisSessionPool_proxy",
    substituted: false,
  });
  assert.deepEqual(events, [
    "real-sdk-create-pool",
    "real-sdk-crawl",
    "real-pool-run",
    "real-sdk-work-callback",
    "real-pool-release-complete",
    "real-pool-close",
  ]);
  assert.equal(artifact.settlement.status, "fulfilled");
  assert.equal(artifact.settlement.run.success, true);
  assert.equal(artifact.settlement.run.cleanup.status, "passed");

  const poolRun = artifact.phases.poolRuns[0];
  assert.equal(poolRun.requestedUrl, start);
  assert.deepEqual({
    acquireOpen: poolRun.acquireOpen.durationNs,
    settleExtract: poolRun.settleExtract.durationNs,
    releasePhysicalCleanup: poolRun.releasePhysicalCleanup.durationNs,
    poolClose: artifact.phases.poolCloses[0].interval.durationNs,
  }, {
    acquireOpen: "10",
    settleExtract: "10",
    releasePhysicalCleanup: "10",
    poolClose: "10",
  });
  assert.equal(poolRun.acquireOpen.end.readOrdinal, poolRun.settleExtract.start.readOrdinal);
  assert.equal(
    poolRun.settleExtract.end.readOrdinal,
    poolRun.releasePhysicalCleanup.start.readOrdinal,
  );
  assert.equal(artifact.outerInterval.durationNs, "90");
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.phases.poolRuns[0]), true);

  await assert.rejects(
    runner(job),
    /single-use; retries are forbidden/u,
  );
  assert.equal(events.length, 6);
});

test("Stasis crawl and physical-close failures remain in the diagnostic artifact", async () => {
  const workError = new Error("private workload failure");
  const closeError = new Error("private physical close failure");
  let poolRuns = 0;
  let poolCloses = 0;
  const pool = {
    maxProcesses: 1,
    async run(_request, callback) {
      poolRuns += 1;
      try {
        return await callback({});
      } catch (error) {
        assert.equal(error, workError);
        throw error;
      }
    },
    async close() {
      poolCloses += 1;
      throw closeError;
    },
  };
  const sdk = {
    CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
    createStasisSessionPool() {
      return pool;
    },
    async crawlWithStasis(observedPool) {
      return observedPool.run({ url: start }, async () => {
        throw workError;
      });
    },
  };
  const runner = createStasisCrawlPhaseDiagnosticRunner({
    identity: identity(),
    sdk,
    sdkVersion: "0.3.3",
    executablePath: "/opt/stasis-v0.3.3/stasis",
    now: incrementalClock(),
  });
  const artifact = await runner(createCrawlPhaseDiagnosticJob({
    lane: "stasis",
    ordinal: 2,
  }));

  assert.equal(poolRuns, 1);
  assert.equal(poolCloses, 1);
  assert.equal(artifact.settlement.status, "fulfilled");
  assert.equal(artifact.settlement.run.success, false);
  assert.equal(artifact.settlement.run.cleanup.status, "failed");
  assert.equal(artifact.settlement.run.priorTerminal.success, false);
  assert.equal(artifact.phases.poolRuns[0].settleExtract.settlement, "rejected");
  assert.equal(artifact.phases.poolRuns[0].settleExtract.error.messageOmitted, true);
  assert.equal(
    artifact.phases.poolRuns[0].releasePhysicalCleanup.settlement,
    "rejected",
  );
  assert.equal(artifact.phases.poolCloses[0].interval.settlement, "rejected");
  assert.equal(artifact.phases.poolCloses[0].interval.error.messageOmitted, true);
  assert.equal(assertCrawlPhaseDiagnostic(artifact), artifact);
});

test("Crawlee launcher instrumentation delegates unchanged and records launch, work, and close", async () => {
  const calls = [];
  const browser = {
    marker: "same-browser",
    work(value) {
      assert.equal(this, browser);
      calls.push(["work", value]);
      return value + 1;
    },
    async close(options) {
      assert.equal(this, browser);
      calls.push(["close", options]);
      return this;
    },
  };
  const launcher = {
    async launch(options) {
      assert.equal(this, launcher);
      calls.push(["launch", options]);
      return browser;
    },
  };
  const instrumentation = createCrawleeLauncherPhaseInstrumentation({
    launcher,
    now: incrementalClock(5n),
  });
  const launchOptions = { headless: true };
  const observedBrowser = await instrumentation.launcher.launch(launchOptions);
  assert.notEqual(observedBrowser, browser);
  assert.equal(observedBrowser.marker, "same-browser");
  assert.equal(observedBrowser.work(4), 5);
  const closeOptions = { reason: "diagnostic-complete" };
  assert.equal(await observedBrowser.close(closeOptions), observedBrowser);

  const snapshot = instrumentation.snapshot();
  assert.deepEqual(calls, [
    ["launch", launchOptions],
    ["work", 4],
    ["close", closeOptions],
  ]);
  assert.equal(snapshot.crawlee.launches.length, 1);
  assert.equal(snapshot.crawlee.launches[0].interval.durationNs, "5");
  assert.equal(snapshot.crawlee.browsers.length, 1);
  assert.equal(snapshot.crawlee.browsers[0].workloadWindow.durationNs, "5");
  assert.equal(snapshot.crawlee.browsers[0].closes[0].interval.durationNs, "5");
  assert.deepEqual(snapshot.clockReads.map(({ label }) => label), [
    "crawlee:launch:1:start",
    "crawlee:launch:1:end",
    "crawlee:browser:1:close:1:start",
    "crawlee:browser:1:close:1:end",
  ]);
});

test("a rejected Crawlee launch is rethrown once and retained by the phase recorder", async () => {
  const failure = new Error("private launch failure");
  let calls = 0;
  const instrumentation = createCrawleeLauncherPhaseInstrumentation({
    launcher: {
      async launch() {
        calls += 1;
        throw failure;
      },
    },
    now: incrementalClock(),
  });
  await assert.rejects(instrumentation.launcher.launch({ headless: true }), (error) => {
    assert.equal(error, failure);
    return true;
  });
  const snapshot = instrumentation.snapshot();
  assert.equal(calls, 1);
  assert.equal(snapshot.crawlee.launches[0].interval.settlement, "rejected");
  assert.equal(snapshot.crawlee.launches[0].interval.error.messageOmitted, true);
  assert.equal(snapshot.crawlee.browsers.length, 0);
});

test("diagnostic artifacts cannot claim authority, timing, statistics, or comparison eligibility", async () => {
  const artifact = await successfulStasisArtifact();
  for (const field of [
    "authorityEligible",
    "timingEligible",
    "statisticsEligible",
    "comparisonEligible",
    "optimizationEligible",
  ]) {
    const changed = structuredClone(artifact);
    changed[field] = true;
    assert.throws(
      () => assertCrawlPhaseDiagnostic(changed),
      /not benchmark authority/u,
    );
  }

  const withStatistics = structuredClone(artifact);
  withStatistics.statistics = { invented: true };
  assert.throws(
    () => assertCrawlPhaseDiagnostic(withStatistics),
    /Invalid crawl phase diagnostic artifact/u,
  );
  assert.throws(
    () => summarizePairedDurations([artifact, artifact], {
      baselineLabel: "crawlee",
      candidateLabel: "stasis",
    }),
    /must contain only baselineNs and candidateNs/u,
  );
});

test("diagnostic validation fails closed when localization phase ordering is forged", async () => {
  const artifact = await successfulStasisArtifact();
  const changed = structuredClone(artifact);
  changed.phases.poolRuns[0].settleExtract.start =
    structuredClone(changed.clockReads[1]);
  changed.phases.poolRuns[0].settleExtract.durationNs = "40";
  assert.throws(
    () => assertCrawlPhaseDiagnostic(changed),
    /discontinuous/u,
  );
});

test("composer gates exact authority equality and derives only within-observation phase sums", async () => {
  const fixture = await diagnosticFixture();
  const evidence = composeCrawlPhaseDiagnosticEvidence({
    authoritativeRaw: fixture.authority.raw,
    authoritativeRawBytes: fixture.authority.bytes,
    authoritativeRawBytesAfterDiagnostics: fixture.authority.bytes,
    authoritativeRawSha256: fixture.authority.sha256,
    artifactBindingReceipt: fixture.bindingReceipt,
    diagnosticAttestation: fixture.attestation,
    crawleeDiagnostic: fixture.crawlee,
    stasisDiagnostic: fixture.stasis,
  });

  assert.equal(evidence.schema, crawlPhaseDiagnosticEvidenceSchema);
  assert.equal(evidence.purpose, "phase_localization_diagnostic_only");
  assert.deepEqual(evidence.order, ["crawlee", "stasis"]);
  assert.equal(evidence.correctness.crawlee.status, "exact_page_result_match");
  assert.equal(evidence.correctness.stasis.status, "exact_page_result_match");
  assert.equal(evidence.correctness.crawlee.pages, 20);
  assert.equal(evidence.correctness.stasis.pages, 20);
  assert.equal(evidence.hostRelation.hostClass, "different_class");
  assert.equal(evidence.hostRelation.bootInstance, "distinct");
  assert.equal(evidence.hostRelation.timingCombinedAcrossHosts, false);
  assert.deepEqual(evidence.authorityInputContinuity, {
    beforeSha256: fixture.authority.sha256,
    afterSha256: fixture.authority.sha256,
    beforeBytes: fixture.authority.bytes.byteLength,
    afterBytes: fixture.authority.bytes.byteLength,
    exactBytesUnchanged: true,
  });
  assert.equal(
    evidence.authorityInput.artifactBinding.schema,
    performanceReplicationArtifactBindingSchema,
  );
  assert.equal(
    evidence.authorityInput.artifactBinding.crawlLaneRaw.sha256,
    fixture.authority.sha256,
  );
  assert.equal(evidence.authorityInput.artifactBinding.inputs.workflow.runId, 33859999999);
  assert.equal(Object.hasOwn(evidence.authorityInput.artifactBinding, "artifactArchives"), false);

  assert.deepEqual(evidence.localization.crawlee, {
    scope: "one_diagnostic_observation_on_one_host",
    intervalsNonOverlapping: true,
    counts: { launches: 1, browsers: 1, closes: 1 },
    runnerTotalNs: "100",
    browserLaunchNs: "10",
    browserResidentWorkloadNs: "50",
    browserCloseNs: "10",
    observedPhaseSumNs: "70",
    residualNs: "30",
    authorityTimingCombined: false,
    benchmarkSample: false,
    optimizationProof: false,
  });
  assert.deepEqual(evidence.localization.stasis, {
    scope: "one_diagnostic_observation_on_one_host",
    intervalsNonOverlapping: true,
    counts: { poolCreations: 1, poolRuns: 20, poolCloses: 1 },
    runnerTotalNs: "850",
    poolCreationNs: "10",
    acquireOpenNs: "200",
    settleExtractNs: "200",
    releasePhysicalCleanupNs: "200",
    poolCloseNs: "10",
    observedPhaseSumNs: "620",
    residualNs: "230",
    authorityTimingCombined: false,
    benchmarkSample: false,
    optimizationProof: false,
  });
  assert.equal(evidence.localization.authorityTimingReadOrCombined, false);
  assert.equal(evidence.localization.crossHostPooling, "none");
  assert.equal(evidence.localization.phaseSumsAreBenchmarkSamples, false);
  assert.equal(evidence.localization.phaseSumsAuthorizeOptimization, false);
  assert.equal(assertCrawlPhaseDiagnosticEvidence(evidence, {
    authoritativeRaw: fixture.authority.raw,
    authoritativeRawBytes: fixture.authority.bytes,
    authoritativeRawBytesAfterDiagnostics: fixture.authority.bytes,
    authoritativeRawSha256: fixture.authority.sha256,
    artifactBindingReceipt: fixture.bindingReceipt,
  }), evidence);
  assert.equal(Object.isFrozen(evidence), true);
});

test("composer rejects overlapping phases, wrong counts, and page-result drift", async () => {
  const fixture = await diagnosticFixture();
  const compose = (changes = {}) => composeCrawlPhaseDiagnosticEvidence({
    authoritativeRaw: fixture.authority.raw,
    authoritativeRawBytes: fixture.authority.bytes,
    authoritativeRawBytesAfterDiagnostics:
      changes.authorityBytesAfter ?? fixture.authority.bytes,
    authoritativeRawSha256: fixture.authority.sha256,
    artifactBindingReceipt: fixture.bindingReceipt,
    diagnosticAttestation: fixture.attestation,
    crawleeDiagnostic: changes.crawlee ?? fixture.crawlee,
    stasisDiagnostic: changes.stasis ?? fixture.stasis,
  });

  const wrongCount = structuredClone(fixture.stasis);
  wrongCount.phases.poolRuns.pop();
  assert.throws(() => compose({ stasis: wrongCount }), /20 runs/u);

  const overlap = structuredClone(fixture.stasis);
  const second = overlap.phases.poolRuns[1].acquireOpen;
  second.start = structuredClone(overlap.phases.poolRuns[0].settleExtract.start);
  second.durationNs = (
    BigInt(second.end.nanoseconds) - BigInt(second.start.nanoseconds)
  ).toString();
  assert.throws(() => compose({ stasis: overlap }), /overlap|not sequential/u);

  const mismatched = structuredClone(fixture.crawlee);
  mismatched.settlement.run.result.pages[0].url = `${origin}/changed`;
  assert.throws(
    () => compose({ crawlee: mismatched }),
    /does not match its authoritative sample/u,
  );

  const failed = structuredClone(fixture.crawlee);
  failed.settlement.run.success = false;
  assert.throws(
    () => compose({ crawlee: failed }),
    /run or cleanup did not fulfill/u,
  );

  const changedAuthorityBytes = Buffer.concat([
    fixture.authority.bytes,
    Buffer.from("\n", "utf8"),
  ]);
  assert.throws(
    () => compose({ authorityBytesAfter: changedAuthorityBytes }),
    /changed during phase diagnostics/u,
  );
});

test("authority binding rejects a wrong file hash, different parsed input, and invalid authority", async () => {
  const authority = await authoritativeRawAndBytes();
  const { raw, bytes, sha256 } = authority;
  const bindingReceipt = artifactBindingReceipt(authority);
  assert.throws(
    () => bindAuthoritativeCrawlRaw({ raw, bytes, sha256: "f".repeat(64) }),
    /does not match its bytes/u,
  );

  const different = structuredClone(raw);
  different.identity.host.cpuModel = "changed after parse";
  assert.throws(
    () => bindAuthoritativeCrawlRaw({ raw: different, bytes, sha256 }),
    /does not match the exact supplied file bytes/u,
  );

  const invalid = structuredClone(raw);
  invalid.authority.valid = false;
  const invalidBytes = Buffer.from(`${JSON.stringify(invalid)}\n`, "utf8");
  const invalidSha = createHash("sha256").update(invalidBytes).digest("hex");
  assert.throws(
    () => bindAuthoritativeCrawlRaw({
      raw: invalid,
      bytes: invalidBytes,
      sha256: invalidSha,
      artifactBindingReceipt: bindingReceipt,
    }),
    /authority|raw result/u,
  );
  assert.throws(
    () => bindAuthoritativeCrawlRaw({ raw, bytes, sha256 }),
    /artifact-binding receipt/u,
  );
});

test("authority binding rejects receipt and fresh-run identity drift", async (context) => {
  const authority = await authoritativeRawAndBytes();
  const invoke = ({ changedAuthority = authority, changeReceipt } = {}) => {
    const receipt = artifactBindingReceipt(changedAuthority);
    changeReceipt?.(receipt);
    return () => bindAuthoritativeCrawlRaw({
      raw: changedAuthority.raw,
      bytes: changedAuthority.bytes,
      sha256: changedAuthority.sha256,
      artifactBindingReceipt: receipt,
    });
  };
  const changedAuthority = (change) => {
    const raw = structuredClone(authority.raw);
    change(raw.identity.provenance);
    const bytes = Buffer.from(`${JSON.stringify(raw, null, 2)}\n`, "utf8");
    return {
      raw,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };

  const cases = [
    ["wrong run", invoke({
      changeReceipt: (receipt) => { receipt.inputs.workflow.runId += 1; },
    })],
    ["wrong SHA", invoke({
      changedAuthority: changedAuthority((provenance) => {
        provenance.workflowSourceSha = "7".repeat(40);
      }),
    })],
    ["wrong ref", invoke({
      changedAuthority: changedAuthority((provenance) => {
        provenance.workflowSourceRef = "refs/heads/not-the-replication-ref";
      }),
    })],
    ["wrong harness revision", invoke({
      changedAuthority: changedAuthority((provenance) => {
        provenance.harnessCheckoutRevision = "7".repeat(40);
      }),
    })],
    ["wrong harness tree", invoke({
      changedAuthority: changedAuthority((provenance) => {
        provenance.harnessCheckoutTree = "8".repeat(40);
      }),
    })],
    ["wrong raw hash", invoke({
      changeReceipt: (receipt) => {
        receipt.extractedFiles.crawlLaneRaw.sha256 = "f".repeat(64);
      },
    })],
    ["wrong raw bytes", invoke({
      changeReceipt: (receipt) => { receipt.extractedFiles.crawlLaneRaw.bytes += 1; },
    })],
    ["wrong schema", invoke({
      changeReceipt: (receipt) => { receipt.schema = "wrong-schema"; },
    })],
    ["claim escalation", invoke({
      changeReceipt: (receipt) => { receipt.generalizedSpeedClaimAuthorized = true; },
    })],
  ];
  for (const [name, operation] of cases) {
    await context.test(name, () => {
      assert.throws(operation, /artifact-binding|fresh crawl authority|raw result/iu);
    });
  }
});

test("hosted command requires the artifact-binding receipt path before any authority work", async () => {
  await assert.rejects(
    runCrawlPhaseDiagnosticCommand({
      environment: {
        STASIS_PERFORMANCE_AUTHORITY_CRAWL_RAW_PATH: "/tmp/fresh-crawl-raw.json",
        STASIS_PERFORMANCE_AUTHORITY_CRAWL_RAW_SHA256: "a".repeat(64),
      },
      readAuthorityFile: async () => {
        throw new Error("authority must not be read without the binding path");
      },
    }),
    /STASIS_PERFORMANCE_ARTIFACT_BINDING_PATH is required/u,
  );
});

test("hosted command verifies once, runs Crawlee then Stasis, retains lane raws, and writes wx evidence", async () => {
  const fixture = await diagnosticFixture();
  const events = [];
  const environment = {
    STASIS_PERFORMANCE_AUTHORITY_CRAWL_RAW_PATH: "/tmp/fresh-crawl-raw.json",
    STASIS_PERFORMANCE_AUTHORITY_CRAWL_RAW_SHA256: fixture.authority.sha256,
    STASIS_PERFORMANCE_ARTIFACT_BINDING_PATH: "/tmp/artifact-binding.json",
  };
  const bindingBytes = Buffer.from(`${JSON.stringify(fixture.bindingReceipt, null, 2)}\n`, "utf8");
  const verified = {
    identity: {
      version: "0.3.3",
      revision: "48c5a718a9ddd63f496e45307e1484974ccf8587",
      profile: "controlled-web-session-v2",
      sdk: { package: "@oxhq/stasis", archive: { sha256: "b".repeat(64) } },
      release: {
        tag: "v0.3.3",
        runtimeManifest: {
          sha256: "4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4",
        },
      },
      packageQualification: { runId: "33506181780", runAttempt: "1" },
      linux: { executable: { sha256: "c".repeat(64) } },
    },
    sdk: { exact: "verified-sdk" },
  };
  const writes = [];
  const result = await runCrawlPhaseDiagnosticCommand({
    environment,
    readArtifactBindingFile: async (filePath) => {
      events.push(`read-binding:${filePath}`);
      return bindingBytes;
    },
    readAuthorityFile: async (filePath) => {
      events.push(`read:${filePath}`);
      return fixture.authority.bytes;
    },
    loadCandidateSpec: () => {
      events.push("load-candidate-spec");
      return { exact: "spec" };
    },
    verifyCandidate: async () => {
      events.push("verify-candidate");
      return verified;
    },
    assertCandidate: (value) => {
      events.push("assert-candidate");
      assert.equal(value, verified);
    },
    disposeCandidate: async (value) => {
      events.push("dispose-candidate");
      assert.equal(value, verified);
    },
    observeHost: async () => {
      events.push("observe-host");
      return fixture.attestation.host;
    },
    loadDiagnosticProvenance: async () => {
      events.push("load-provenance");
      return fixture.attestation.provenance;
    },
    observeEglRuntime: async () => {
      events.push("observe-egl");
      return eglRuntimeEvidence();
    },
    observeBaseline: async () => {
      events.push("observe-baseline");
      return fixture.attestation.crawlee;
    },
    candidateExecutablePath: () => "/opt/stasis-v0.3.3/stasis",
    assertFreshArtifactRoot: async () => {
      events.push("fresh-artifact-root");
      return "/tmp/phase-diagnostic";
    },
    createCrawleeDiagnosticRunner: ({ identity: supplied }) => {
      events.push("create-crawlee-runner");
      assert.deepEqual(supplied, fixture.inputIdentity);
      return async (job) => {
        events.push(`run:${job.lane}:${job.ordinal}`);
        return fixture.crawlee;
      };
    },
    createStasisDiagnosticRunner: ({ identity: supplied, sdk }) => {
      events.push("create-stasis-runner");
      assert.deepEqual(supplied, fixture.inputIdentity);
      assert.equal(sdk, verified.sdk);
      return async (job) => {
        events.push(`run:${job.lane}:${job.ordinal}`);
        return fixture.stasis;
      };
    },
    writeRaw: async (relativePath, value) => {
      events.push(`write:${relativePath}`);
      writes.push({ relativePath, value });
      return `/tmp/phase-diagnostic/${relativePath}`;
    },
  });

  assert.deepEqual(events, [
    "read-binding:/tmp/artifact-binding.json",
    "read:/tmp/fresh-crawl-raw.json",
    "load-candidate-spec",
    "verify-candidate",
    "assert-candidate",
    "observe-host",
    "load-provenance",
    "observe-egl",
    "observe-baseline",
    "fresh-artifact-root",
    "create-crawlee-runner",
    "create-stasis-runner",
    "run:crawlee:1",
    `write:${crawlPhaseDiagnosticCrawleeRawArtifactPath}`,
    "run:stasis:2",
    `write:${crawlPhaseDiagnosticStasisRawArtifactPath}`,
    "read:/tmp/fresh-crawl-raw.json",
    `write:${crawlPhaseDiagnosticEvidenceArtifactPath}`,
    "dispose-candidate",
  ]);
  assert.equal(writes.length, 3);
  assert.equal(writes[0].value, fixture.crawlee);
  assert.equal(writes[1].value, fixture.stasis);
  assert.equal(writes[2].value.schema, crawlPhaseDiagnosticEvidenceSchema);
  assert.equal(result.artifactRoot, "/tmp/phase-diagnostic");
  assert.equal(result.evidence.localization.stasis.counts.poolRuns, 20);
});
