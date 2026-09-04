import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNavigationCausalHostOutcome,
  assertNavigationCausalHostRaw,
  buildNavigationCausalStasisIdentity,
  createNavigationCausalHostOutcome,
  createNavigationCausalIdentity,
  createNavigationCausalProvenance,
  createStasisNavigationCausalRunner,
  navigationCausalPairOrder,
  navigationCausalRules,
  navigationCausalWarmupOrder,
  runNavigationCausalHost,
} from "../src/performance/navigation-causal.mjs";
import {
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceHostIdentity,
} from "../src/performance/crawl.mjs";
import { cleanHarnessWorktreeEvidence } from "../src/performance/harness-worktree.mjs";
import { linuxPerformanceCandidateIdentity } from "../src/performance/linux-candidate.mjs";
import { linuxEglRuntimeSchema } from "../src/performance/linux-egl-runtime.mjs";
import { origin } from "../src/crawl/corpus.mjs";

test("the two independent hosts use opposite preregistered adjacent pair schedules", () => {
  assert.deepEqual(navigationCausalWarmupOrder("host-a"), ["A", "B"]);
  assert.deepEqual(navigationCausalWarmupOrder("host-b"), ["B", "A"]);
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) =>
      navigationCausalPairOrder("host-a", index + 1).join("")),
    ["AB", "BA", "AB", "BA", "AB", "BA", "AB", "BA", "AB", "BA"],
  );
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) =>
      navigationCausalPairOrder("host-b", index + 1).join("")),
    ["BA", "AB", "BA", "AB", "BA", "AB", "BA", "AB", "BA", "AB"],
  );
  assert.equal(navigationCausalRules.retries, false);
  assert.equal(navigationCausalRules.sleeps, false);
  assert.equal(navigationCausalRules.fallbacks, false);
  assert.equal(navigationCausalRules.pooling, "none");
});

for (const hostLane of ["host-a", "host-b"]) {
  test(`${hostLane} retains 22 fresh processes and independently meets the effect rule`, async () => {
    const fixture = successfulRunnerFixture(hostLane, { openDeltaNs: 70n });
    const raw = await runNavigationCausalHost({
      identity: identity(hostLane),
      runner: fixture.runner,
    });

    assertNavigationCausalHostRaw(raw);
    assert.equal(raw.measurementEligible, true);
    assert.equal(raw.authority.status, "valid");
    assert.equal(raw.warmups.length, 2);
    assert.equal(raw.pairs.length, 10);
    assert.equal(raw.statistics.effect, "host_effect_rule_met");
    assert.equal(raw.statistics.criteria.engineAndInitialOpenPositiveCount, 10);
    assert.equal(raw.statistics.criteria.openDominatesAbsoluteCombinedOtherPhaseCount, 10);
    assert.equal(raw.statistics.mediansNs.engineAndInitialOpen.numerator, "140");
    assert.equal(raw.statistics.mediansNs.engineAndInitialOpen.denominator, "2");
    assert.equal(fixture.launchCount(), 22);
    assert.equal(fixture.sessionCloseCount(), 22);
    assert.equal(fixture.runtimeCloseCount(), 0);
    assert.equal(fixture.pendingClockReads(), 0);

    for (const observation of [
      ...raw.warmups,
      ...raw.pairs.flatMap(({ observations }) => observations),
    ]) {
      assert.equal(observation.cleanup.mode, "graceful_session_close");
      assert.equal(observation.result.finalUrl, `${origin}/navigation-final`);
      assert.equal(observation.result.title, "navigation-final");
      assert.equal(observation.result.statusState, "complete");
      assert.equal(observation.result.firstLink, `${origin}/leaf/navigation`);
      assert.equal(observation.lifecycle.phaseSumEqualsOuter, true);
    }

    const outcome = createNavigationCausalHostOutcome(raw);
    assertNavigationCausalHostOutcome(outcome, raw);
    assert.equal(outcome.status, "VALID_HOST_EFFECT");
    assert.equal(outcome.workflowSuccess, true);
  });
}

test("a threshold miss remains a valid publishable host measurement", async () => {
  const fixture = successfulRunnerFixture("host-a", { openDeltaNs: 0n });
  const raw = await runNavigationCausalHost({
    identity: identity("host-a"),
    runner: fixture.runner,
  });
  assertNavigationCausalHostRaw(raw);
  assert.equal(raw.authority.valid, true);
  assert.equal(raw.statistics.effect, "host_effect_rule_not_met");
  const outcome = createNavigationCausalHostOutcome(raw);
  assert.equal(outcome.status, "VALID_HOST_NO_EFFECT");
  assert.equal(outcome.publishable, true);
  assert.equal(outcome.workflowSuccess, true);
});

test("a physical-close failure is retained once and fail-stops without retry", async () => {
  const fixture = successfulRunnerFixture("host-a", {
    openDeltaNs: 70n,
    failCloseAtObservation: 3,
  });
  const raw = await runNavigationCausalHost({
    identity: identity("host-a"),
    runner: fixture.runner,
  });
  assertNavigationCausalHostRaw(raw);
  assert.equal(raw.authority.valid, false);
  assert.equal(raw.authority.code, "CLEAN_EXIT_INVALID");
  assert.equal(raw.authority.firstInvalidOrdinal, 3);
  assert.equal(raw.pairs.length, 1);
  assert.equal(raw.pairs[0].observations.length, 1);
  assert.equal(raw.pairs[0].observations[0].error.phase, "physicalClose");
  assert.equal(fixture.launchCount(), 3);
  assert.equal(fixture.sessionCloseCount(), 3);
  assert.equal(fixture.runtimeCloseCount(), 1);
  const outcome = createNavigationCausalHostOutcome(raw);
  assert.equal(outcome.status, "INVALID_CLEAN_EXIT");
  assert.equal(outcome.publishable, false);
  assert.equal(outcome.workflowSuccess, false);
});

test("a real final-URL oracle mismatch retains lifecycle and result as typed correctness invalid", async () => {
  const fixture = successfulRunnerFixture("host-a", {
    openDeltaNs: 70n,
    wrongFinalAtObservation: 3,
  });
  const raw = await runNavigationCausalHost({
    identity: identity("host-a"),
    runner: fixture.runner,
  });
  assertNavigationCausalHostRaw(raw);
  const observation = raw.pairs[0].observations[0];
  assert.equal(observation.status, "incorrect");
  assert.equal(observation.lifecycle.status, "complete");
  assert.equal(observation.cleanup.status, "passed");
  assert.equal(observation.result.finalUrl, `${origin}/wrong-final`);
  assert.deepEqual(observation.oracle.reasons, ["final_url_mismatch"]);
  assert.equal(raw.authority.code, "CORRECTNESS_INVALID");
  assert.equal(createNavigationCausalHostOutcome(raw).status, "INVALID_CORRECTNESS");
  assert.equal(fixture.launchCount(), 3);
  assert.equal(fixture.sessionCloseCount(), 3);
  assert.equal(fixture.runtimeCloseCount(), 0);
});

test("raw replay rejects changed final correctness, phase continuity, and effect statistics", async () => {
  const raw = await validRaw("host-a");
  const mutations = [
    (value) => { value.pairs[0].observations[0].result.finalUrl = `${origin}/wrong`; },
    (value) => {
      value.pairs[0].observations[0].lifecycle.phases.settle.startNs =
        (BigInt(value.pairs[0].observations[0].lifecycle.phases.settle.startNs) + 1n)
          .toString();
    },
    (value) => { value.statistics.effect = "host_effect_rule_not_met"; },
    (value) => { value.rules.retries = true; },
    (value) => {
      for (const observation of value.pairs[1].observations) {
        observation.result.documentHtml = "<head></head><body>different</body>";
      }
      value.pairs[1].equivalence = {
        evaluated: true,
        valid: true,
        differingFields: [],
      };
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(raw);
    mutate(changed);
    assert.throws(() => assertNavigationCausalHostRaw(changed));
  }
});

test("the runner changes only requested URL and never calls Runtime.close on success", async () => {
  const fixture = successfulRunnerFixture("host-a", { openDeltaNs: 70n });
  const raw = await runNavigationCausalHost({
    identity: identity("host-a"),
    runner: fixture.runner,
  });
  const pair = raw.pairs[0];
  const armA = pair.observations.find(({ job }) => job.arm === "A");
  const armB = pair.observations.find(({ job }) => job.arm === "B");
  assert.equal(armA.result.requestedUrl, `${origin}/navigation-start`);
  assert.equal(armB.result.requestedUrl, `${origin}/navigation-final`);
  assert.deepEqual(
    { ...armA.result, requestedUrl: undefined, sessionRequestedUrl: undefined },
    { ...armB.result, requestedUrl: undefined, sessionRequestedUrl: undefined },
  );
  assert.equal(fixture.runtimeCloseCount(), 0);
});

async function validRaw(hostLane) {
  const fixture = successfulRunnerFixture(hostLane, { openDeltaNs: 70n });
  return runNavigationCausalHost({ identity: identity(hostLane), runner: fixture.runner });
}

function successfulRunnerFixture(hostLane, {
  openDeltaNs,
  failCloseAtObservation = null,
  wrongFinalAtObservation = null,
}) {
  const jobs = expectedJobs(hostLane);
  const clockValues = clockValuesFor(jobs, openDeltaNs);
  let launches = 0;
  let sessionCloses = 0;
  let runtimeCloses = 0;
  const sdk = {
    CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
    async launch(options) {
      launches += 1;
      assert.equal(options.executablePath, "/verified/stasis");
      assert.equal(options.commandTimeoutMs, 30_000);
      assert.equal(options.env.STASIS_LIFECYCLE_TRACE_V1, undefined);
      const observation = launches;
      return {
        async openSession(requestedUrl, openOptions) {
          assert.equal(requestedUrl, jobs[observation - 1].requestedUrl);
          assert.equal(openOptions.profile, "controlled-web-session-v2");
          assert.ok(Array.isArray(openOptions.network.routes));
          return {
            requestedUrl,
            url: observation === wrongFinalAtObservation
              ? `${origin}/wrong-final`
              : `${origin}/navigation-final`,
            boundary: "controlled_ready",
            profile: "controlled-web-session-v2",
            stateToken: `open-${observation}`,
            async settle(expectedToken, policy) {
              assert.equal(expectedToken, `open-${observation}`);
              assert.equal(policy.persistentWork, "report");
              return { outcome: "quiescent", stateToken: `settled-${observation}` };
            },
            async extract(plan, expectedToken) {
              assert.equal(expectedToken, `settled-${observation}`);
              assert.deepEqual(
                plan.fields.map(({ name }) => name),
                ["documentHtml", "title", "statusText", "statusState", "firstLink"],
              );
              return {
                stateToken: `extracted-${observation}`,
                rows: [{
                  fields: [
                    { name: "documentHtml", value: finalDocumentHtml },
                    { name: "title", value: "navigation-final" },
                    { name: "statusText", value: "complete" },
                    { name: "statusState", value: "complete" },
                    { name: "firstLink", value: `${origin}/leaf/navigation` },
                  ],
                }],
              };
            },
            async close(options) {
              sessionCloses += 1;
              assert.equal(options.timeoutMs, 5_000);
              if (observation === failCloseAtObservation) {
                const error = new Error("redacted close failure");
                error.code = "session_close_failed";
                throw error;
              }
            },
          };
        },
        async close() {
          runtimeCloses += 1;
        },
      };
    },
  };
  const runner = createStasisNavigationCausalRunner({
    sdk,
    sdkVersion: "0.3.3",
    executablePath: "/verified/stasis",
    environment: { STASIS_LIFECYCLE_TRACE_V1: "1", DISPLAY: ":99" },
    now() {
      if (clockValues.length === 0) throw new Error("unexpected clock read");
      return clockValues.shift();
    },
  });
  return {
    runner,
    launchCount: () => launches,
    sessionCloseCount: () => sessionCloses,
    runtimeCloseCount: () => runtimeCloses,
    pendingClockReads: () => clockValues.length,
  };
}

function expectedJobs(hostLane) {
  const jobs = navigationCausalWarmupOrder(hostLane).map((arm) => ({
    arm,
    requestedUrl: arm === "A"
      ? `${origin}/navigation-start`
      : `${origin}/navigation-final`,
  }));
  for (let pairIndex = 1; pairIndex <= 10; pairIndex += 1) {
    for (const arm of navigationCausalPairOrder(hostLane, pairIndex)) {
      jobs.push({
        arm,
        requestedUrl: arm === "A"
          ? `${origin}/navigation-start`
          : `${origin}/navigation-final`,
      });
    }
  }
  return jobs;
}

function clockValuesFor(jobs, openDeltaNs) {
  const values = [];
  let cursor = 1_000n;
  for (const { arm } of jobs) {
    const durations = [
      10n,
      arm === "A" ? 30n + openDeltaNs : 30n,
      20n,
      10n,
      10n,
    ];
    values.push(cursor);
    for (const duration of durations) {
      cursor += duration;
      values.push(cursor);
    }
    cursor += 1n;
  }
  return values;
}

function identity(hostLane) {
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
  const verified = { identity: linuxPerformanceCandidateIdentity };
  return createNavigationCausalIdentity({
    hostLane,
    host: retainedHost,
    provenance: createNavigationCausalProvenance({
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "Stasis v0.3.3 navigation causal experiment",
      job: `navigation-causal-${hostLane}`,
      hostLane,
      runId: "33900000000",
      runAttempt: "1",
      workflowSourceSha: "e".repeat(40),
      workflowSourceRef: "refs/heads/codex/stasis-v033-navigation-causal-source",
      harnessCheckoutRevision: "f".repeat(40),
      harnessCheckoutTree: "1".repeat(40),
      harnessCheckoutWorktree: structuredClone(cleanHarnessWorktreeEvidence),
    }),
    stasis: buildNavigationCausalStasisIdentity(verified, hostClassDigest, eglRuntimeEvidence()),
  });
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
