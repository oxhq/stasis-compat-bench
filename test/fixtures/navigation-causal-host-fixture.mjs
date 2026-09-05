import {
  buildNavigationCausalStasisIdentity,
  createNavigationCausalIdentity,
  createNavigationCausalProvenance,
  runNavigationCausalHost,
} from "../../src/performance/navigation-causal.mjs";
import {
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceHostIdentity,
} from "../../src/performance/crawl.mjs";
import { cleanHarnessWorktreeEvidence } from "../../src/performance/harness-worktree.mjs";
import { linuxPerformanceCandidateIdentity } from "../../src/performance/linux-candidate.mjs";
import { linuxEglRuntimeSchema } from "../../src/performance/linux-egl-runtime.mjs";
import { origin } from "../../src/crawl/corpus.mjs";

const phaseOrder = Object.freeze([
  "processProtocolLaunch",
  "engineAndInitialOpen",
  "settle",
  "extract",
  "physicalClose",
]);

export async function navigationCausalHostFixtureRaw(
  hostLane,
  { openDeltaNs = 70n } = {},
) {
  let cursor = 1_000n;
  return runNavigationCausalHost({
    identity: navigationCausalFixtureIdentity(hostLane),
    async runner(job) {
      const durations = [
        10n,
        job.arm === "A" ? 30n + openDeltaNs : 30n,
        20n,
        10n,
        10n,
      ];
      const boundaries = [cursor];
      for (const duration of durations) {
        cursor += duration;
        boundaries.push(cursor);
      }
      cursor += 1n;
      const phases = Object.fromEntries(phaseOrder.map((name, index) => [
        name,
        interval(boundaries[index], boundaries[index + 1]),
      ]));
      return {
        job: structuredClone(job),
        status: "completed",
        timingEligible: job.phase === "sample",
        lifecycle: {
          status: "complete",
          order: phaseOrder,
          boundaryCount: 6,
          continuous: true,
          phaseSumEqualsOuter: true,
          outer: interval(boundaries[0], boundaries[5]),
          phases,
        },
        result: {
          requestedUrl: job.requestedUrl,
          sessionRequestedUrl: job.requestedUrl,
          finalUrl: `${origin}/navigation-final`,
          boundary: "controlled_ready",
          profile: "controlled-web-session-v2",
          settleOutcome: "quiescent",
          documentHtml: finalDocumentHtml,
          title: "navigation-final",
          statusText: "complete",
          statusState: "complete",
          firstLink: `${origin}/leaf/navigation`,
        },
        oracle: { valid: true, reasons: [] },
        cleanup: { status: "passed", mode: "graceful_session_close" },
        error: null,
      };
    },
  });
}

export function navigationCausalFixtureIdentity(hostLane) {
  const retainedHost = createCrawlPerformanceHostIdentity({
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260901.1.0",
    cpuModel: "Example Hosted CPU",
    logicalCpuCount: 4,
    bootInstanceDigest: hostLane === "host-a" ? "a".repeat(64) : "b".repeat(64),
  });
  const hostClassDigest = computeCrawlPerformanceHostIdentityDigest(retainedHost);
  return createNavigationCausalIdentity({
    hostLane,
    host: retainedHost,
    provenance: createNavigationCausalProvenance({
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "Stasis v0.3.3 navigation causal experiment V3",
      job: `navigation-causal-${hostLane}`,
      hostLane,
      runId: "33900000000",
      runAttempt: "1",
      workflowSourceSha: "e".repeat(40),
      workflowSourceRef: "refs/heads/codex/stasis-v033-navigation-causal-source-v3",
      harnessCheckoutRevision: "f".repeat(40),
      harnessCheckoutTree: "1".repeat(40),
      harnessCheckoutWorktree: structuredClone(cleanHarnessWorktreeEvidence),
    }),
    stasis: buildNavigationCausalStasisIdentity(
      { identity: linuxPerformanceCandidateIdentity },
      hostClassDigest,
      eglRuntimeEvidence(),
    ),
  });
}

export function navigationCausalFixtureEglRuntime() {
  return eglRuntimeEvidence();
}

function interval(start, end) {
  return {
    startNs: start.toString(10),
    endNs: end.toString(10),
    durationNs: (end - start).toString(10),
  };
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

const finalDocumentHtml =
  '<head><meta charset="utf-8"><title>navigation-final</title></head>' +
  '<body><main><p id="status" data-state="complete">complete</p>' +
  '<a href="/leaf/navigation">navigation leaf</a></main></body>';
