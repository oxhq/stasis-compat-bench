import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";

import {
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceGithubProvenance,
  createCrawlPerformanceHostIdentity,
  crawlPerformanceRawArtifactPath,
  runCrawlPerformanceAuthority,
} from "../src/performance/crawl.mjs";
import { linuxPerformanceCandidateIdentity } from "../src/performance/linux-candidate.mjs";
import {
  buildCrawlPerformanceStasisIdentity,
  loadCrawlPerformanceProvenanceFromEnvironment,
  observeCrawleePerformanceIdentity,
  observeCrawlPerformanceHost,
  runCrawlPerformanceCommand,
} from "../src/performance/run-crawl.mjs";
import {
  expectedPrimaryScheduledUrls,
  origin,
} from "../src/crawl/corpus.mjs";

function baseEnvironment() {
  return {
    STASIS_PERFORMANCE_BOOT_SALT: "reviewer-owned-salt",
    ImageOS: "ubuntu22",
    ImageVersion: "20260824.1.0",
    GITHUB_REPOSITORY: "oxhq/stasis",
    GITHUB_WORKFLOW: "performance",
    GITHUB_JOB: "crawl-benchmark",
    GITHUB_REF: "refs/heads/post-v033-performance-evidence",
    GITHUB_RUN_ID: "33599999999",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: "a".repeat(40),
    RUNNER_ARCH: "X64",
    RUNNER_OS: "Linux",
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

test("host observation keeps the salted boot-instance digest separate from the host-class digest", async () => {
  const environment = baseEnvironment();
  const bootId = "12345678-1234-1234-1234-1234567890ab";
  const host = await observeCrawlPerformanceHost({
    environment,
    runtime: () => ({ platform: "linux", arch: "x64" }),
    cpuInfo: () => [{ model: "Example Hosted CPU" }, { model: "Example Hosted CPU" }],
    readBootId: async () => bootId,
  });

  assert.equal(
    host.bootInstanceDigest,
    createHash("sha256").update(`${environment.STASIS_PERFORMANCE_BOOT_SALT}\0${bootId}`, "utf8").digest("hex"),
  );
  assert.equal(host.hostClassDigest, computeCrawlPerformanceHostIdentityDigest(host));
  assert.notEqual(host.bootInstanceDigest, host.hostClassDigest);
});

test("provenance keeps workflow-source and harness-checkout revisions separate", async () => {
  const provenance = await loadCrawlPerformanceProvenanceFromEnvironment(
    baseEnvironment(),
    {
      readHarnessCheckoutIdentity: async () => ({
        revision: "b".repeat(40),
        tree: "c".repeat(40),
      }),
    },
  );

  assert.deepEqual(provenance, createCrawlPerformanceGithubProvenance({
    provider: "github-actions",
    repository: "oxhq/stasis",
    workflow: "performance",
    job: "crawl-benchmark",
    runId: "33599999999",
    runAttempt: "1",
    workflowSourceSha: "a".repeat(40),
    workflowSourceRef: "refs/heads/post-v033-performance-evidence",
    harnessCheckoutRevision: "b".repeat(40),
    harnessCheckoutTree: "c".repeat(40),
  }));
});

test("command preflight builds the exact identity, writes raw, and disposes the verified candidate", async () => {
  const events = [];
  const environment = baseEnvironment();
  const host = createCrawlPerformanceHostIdentity({
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260824.1.0",
    cpuModel: "Example Hosted CPU",
    logicalCpuCount: 4,
    bootInstanceDigest: "d".repeat(64),
  });
  const verified = {
    identity: linuxPerformanceCandidateIdentity,
    sdk: {
      crawlWithStasis() {},
      createStasisSessionPool() {},
      CONTROLLED_WEB_SESSION_V2_PROFILE: linuxPerformanceCandidateIdentity.profile,
    },
  };
  const provenance = createCrawlPerformanceGithubProvenance({
    provider: "github-actions",
    repository: "oxhq/stasis",
    workflow: "performance",
    job: "crawl-benchmark",
    runId: "33599999999",
    runAttempt: "1",
    workflowSourceSha: "a".repeat(40),
    workflowSourceRef: "refs/heads/post-v033-performance-evidence",
    harnessCheckoutRevision: "b".repeat(40),
    harnessCheckoutTree: "c".repeat(40),
  });

  const result = await runCrawlPerformanceCommand({
    environment,
    loadCandidateSpec: () => {
      events.push("load-spec");
      return { identity: linuxPerformanceCandidateIdentity };
    },
    verifyCandidate: async () => {
      events.push("verify-candidate");
      return verified;
    },
    assertCandidate: () => {
      events.push("assert-candidate");
    },
    candidateExecutablePath: () => "/tmp/stasis",
    disposeCandidate: async () => {
      events.push("dispose-candidate");
    },
    observeHost: async () => {
      events.push("observe-host");
      return host;
    },
    loadProvenance: async () => {
      events.push("load-provenance");
      return provenance;
    },
    observeBaseline: async ({ host: observedHost }) => {
      events.push("observe-baseline");
      return {
        runner: "crawlee-playwrightcrawler",
        nodeVersion: "v22.20.0",
        crawleeVersion: "3.18.1",
        playwrightVersion: "1.62.1",
        browser: "chromium",
        chromiumVersion: "Chromium 151.0.7922.34",
        chromiumExecutableBytes: 123_456,
        chromiumExecutableSha256: "e".repeat(64),
        hostClassDigest: observedHost.hostClassDigest,
      };
    },
    assertFreshArtifactRoot: async () => {
      events.push("assert-fresh-root");
      return path.resolve("artifacts", "runs", "crawl-cli-test");
    },
    createCrawleeRunner: () => {
      events.push("create-crawlee-runner");
      return async () => successfulRun("crawlee");
    },
    createStasisRunner: ({ executablePath }) => {
      events.push(`create-stasis-runner:${executablePath}`);
      return async () => successfulRun("stasis");
    },
    runAuthority: async ({ identity, runners }) => {
      events.push("run-authority");
      assert.equal(identity.provenance.harnessCheckoutRevision, "b".repeat(40));
      assert.equal(identity.host.bootInstanceDigest, "d".repeat(64));
      assert.equal(identity.crawlee.hostClassDigest, host.hostClassDigest);
      assert.equal(identity.stasis.hostClassDigest, host.hostClassDigest);
      return runCrawlPerformanceAuthority({
        identity,
        runners,
        now: (() => {
          let tick = 0n;
          return () => {
            const value = tick;
            tick += 5n;
            return value;
          };
        })(),
      });
    },
    writeRaw: async (relativePath, raw) => {
      events.push(`write-raw:${relativePath}`);
      assert.equal(relativePath, crawlPerformanceRawArtifactPath);
      assert.equal(raw.authority.valid, true);
      return `/tmp/${relativePath}`;
    },
  });

  assert.equal(result.raw.authority.valid, true);
  assert.deepEqual(events, [
    "load-spec",
    "verify-candidate",
    "assert-candidate",
    "observe-host",
    "load-provenance",
    "observe-baseline",
    "assert-fresh-root",
    "create-crawlee-runner",
    "create-stasis-runner:/tmp/stasis",
    "run-authority",
    `write-raw:${crawlPerformanceRawArtifactPath}`,
    "dispose-candidate",
  ]);
});

test("candidate disposal still runs when command execution fails after verification", async () => {
  let disposed = 0;
  await assert.rejects(
    runCrawlPerformanceCommand({
      environment: baseEnvironment(),
      loadCandidateSpec: () => ({ identity: linuxPerformanceCandidateIdentity }),
      verifyCandidate: async () => ({
        identity: linuxPerformanceCandidateIdentity,
        sdk: {
          crawlWithStasis() {},
          createStasisSessionPool() {},
          CONTROLLED_WEB_SESSION_V2_PROFILE: linuxPerformanceCandidateIdentity.profile,
        },
      }),
      assertCandidate: () => undefined,
      candidateExecutablePath: () => "/tmp/stasis",
      disposeCandidate: async () => {
        disposed += 1;
      },
      observeHost: async () => createCrawlPerformanceHostIdentity({
        platform: "linux",
        arch: "x64",
        runnerOs: "Linux",
        imageOs: "ubuntu22",
        imageVersion: "20260824.1.0",
        cpuModel: "Example Hosted CPU",
        logicalCpuCount: 4,
        bootInstanceDigest: "d".repeat(64),
      }),
      loadProvenance: async () => createCrawlPerformanceGithubProvenance({
        provider: "github-actions",
        repository: "oxhq/stasis",
        workflow: "performance",
        job: "crawl-benchmark",
        runId: "33599999999",
        runAttempt: "1",
        workflowSourceSha: "a".repeat(40),
        workflowSourceRef: "refs/heads/post-v033-performance-evidence",
        harnessCheckoutRevision: "b".repeat(40),
        harnessCheckoutTree: "c".repeat(40),
      }),
      observeBaseline: async ({ host }) => ({
        runner: "crawlee-playwrightcrawler",
        nodeVersion: "v22.20.0",
        crawleeVersion: "3.18.1",
        playwrightVersion: "1.62.1",
        browser: "chromium",
        chromiumVersion: "Chromium 151.0.7922.34",
        chromiumExecutableBytes: 123_456,
        chromiumExecutableSha256: "e".repeat(64),
        hostClassDigest: host.hostClassDigest,
      }),
      assertFreshArtifactRoot: async () => path.resolve("artifacts", "runs", "crawl-cli-test-fail"),
      createCrawleeRunner: () => async () => successfulRun("crawlee"),
      createStasisRunner: () => async () => successfulRun("stasis"),
      runAuthority: async () => {
        throw new Error("planned failure");
      },
      writeRaw: async () => {
        throw new Error("unreachable");
      },
    }),
    /planned failure/u,
  );
  assert.equal(disposed, 1);
});

test("baseline identity observation attests exact package versions and Chromium bytes", async () => {
  const host = createCrawlPerformanceHostIdentity({
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260824.1.0",
    cpuModel: "Example Hosted CPU",
    logicalCpuCount: 4,
    bootInstanceDigest: "d".repeat(64),
  });

  const observed = await observeCrawleePerformanceIdentity({
    host,
    environment: baseEnvironment(),
    launcher: {
      executablePath() {
        return "/opt/chromium/chrome";
      },
    },
    readPackageVersion: async (name) => name === "crawlee" ? "3.18.1" : "1.62.1",
    statPath: async () => ({ isFile: () => true, size: 765_432_1 }),
    hashFile: async () => "f".repeat(64),
    runExecutable: async () => "Chromium 151.0.7922.34",
  });

  assert.equal(observed.chromiumExecutableBytes, 7_654_321);
  assert.equal(observed.hostClassDigest, host.hostClassDigest);
  assert.equal(observed.chromiumExecutableSha256, "f".repeat(64));
});

test("Stasis identity builder projects the verified Linux release binding into the crawl lane", () => {
  const built = buildCrawlPerformanceStasisIdentity(
    { identity: linuxPerformanceCandidateIdentity },
    "f".repeat(64),
  );
  assert.deepEqual(built, {
    runner: "stasis-reference-crawler-v0.3.3",
    nodeVersion: process.version,
    package: "@oxhq/stasis",
    sdkVersion: "0.3.3",
    revision: "48c5a718a9ddd63f496e45307e1484974ccf8587",
    profile: "controlled-web-session-v2",
    releaseTag: "v0.3.3",
    packageQualificationRunId: "33506181780",
    packageQualificationRunAttempt: "1",
    sdkArchiveSha256: "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec",
    executableSha256: "c6a37995cde25275454d7f1ee61c2803964b04bf0d35f8fde7c78e9575c74c37",
    runtimeManifestSha256: "4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4",
    hostClassDigest: "f".repeat(64),
  });
});
