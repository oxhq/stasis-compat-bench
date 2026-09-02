import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRwaPerformanceLaneResult,
  assertRwaPerformanceRaw,
  createRwaPerformanceHostIdentity,
  runRwaPerformanceAuthority,
  rwaPerformanceLaneResultSchema,
  rwaPerformanceProtocol,
  rwaPerformanceSchema,
  rwaPerformanceSemanticDifferenceDisclosure,
  rwaPerformanceTrack,
} from "../src/performance/rwa.mjs";
import { rwaAuthCases } from "../src/rwa/cases.mjs";

const host = createRwaPerformanceHostIdentity({
  platform: "win32",
  arch: "x64",
  runnerOs: "Windows",
  imageOs: "windows-2025",
  imageVersion: "20260824.1",
  cpuModel: "Test CPU",
  logicalCpuCount: 8,
});

test("RWA performance orchestration keeps the exact AB/BA lanes inside one external clock boundary", async () => {
  const events = [];
  let clockValue = 0n;
  const lane = (runner) => async (context) => {
    const label = invocationLabel(context);
    events.push(`${label}:engine-start`);
    for (const item of rwaAuthCases) {
      events.push(`${label}:seed:${item.ordinal}`);
      events.push(`${label}:intent:${item.ordinal}`);
      events.push(`${label}:oracles:${item.ordinal}`);
    }
    events.push(`${label}:cleanup`);
    return laneResult(runner);
  };

  const raw = await runRwaPerformanceAuthority({
    monotonicNow: () => {
      events.push("clock");
      clockValue += 100n;
      return clockValue;
    },
    preflight: async () => {
      events.push("preflight");
      return { sameHostVerified: true, host };
    },
    startRwaServers: async () => {
      events.push("servers:start");
      return { opaqueHandle: true };
    },
    stopRwaServers: async () => {
      events.push("servers:stop");
    },
    runCypressLane: lane("cypress"),
    runStasisLane: lane("stasis-v0.3.3"),
    writeRaw: async (value) => {
      events.push("raw:write");
      assert.equal(value.authority.valid, true);
    },
  });

  assert.equal(raw.schema, rwaPerformanceSchema);
  assert.equal(raw.protocol, rwaPerformanceProtocol);
  assert.equal(raw.track, rwaPerformanceTrack);
  assert.equal(raw.authority.valid, true);
  assert.equal(raw.warmups.length, 2);
  assert.equal(raw.samples.length, 20);
  assert.deepEqual(
    raw.samples.map(({ pairIndex, pairOrder, position, runner }) => ({
      pairIndex,
      pairOrder,
      position,
      runner,
    })),
    expectedTimedSchedule(),
  );
  assert.ok(raw.samples.every(({ timing }) => timing.durationNs === "100"));

  const expectedEvents = ["preflight", "servers:start"];
  expectedEvents.push(...laneEvents("warmup:1:cypress"));
  expectedEvents.push(...laneEvents("warmup:1:stasis-v0.3.3"));
  for (const sample of expectedTimedSchedule()) {
    expectedEvents.push("clock");
    expectedEvents.push(...laneEvents(
      `timed:${sample.pairIndex}:${sample.pairOrder}:${sample.position}:${sample.runner}`,
    ));
    expectedEvents.push("clock");
  }
  expectedEvents.push("servers:stop", "raw:write");
  assert.deepEqual(events, expectedEvents);
  assert.equal(events.filter((entry) => entry === "clock").length, 40);
  assert.equal(events.indexOf("clock") > events.lastIndexOf("warmup:1:stasis-v0.3.3:cleanup"), true);
  assert.equal(events.lastIndexOf("clock") < events.indexOf("servers:stop"), true);
  assert.equal(events.lastIndexOf("clock") < events.indexOf("raw:write"), true);
});

test("lane-result contract rejects missing or false cleanup attestation", async () => {
  const missing = laneResult("cypress");
  delete missing.cleanupComplete;
  assert.throws(
    () => assertRwaPerformanceLaneResult(missing, "cypress", host.identityDigest),
    /unexpected or missing fields/u,
  );

  const incomplete = laneResult("cypress", { cleanupComplete: false });
  assert.throws(
    () => assertRwaPerformanceLaneResult(incomplete, "cypress", host.identityDigest),
    /resolve only after cleanup completes/u,
  );

  const events = [];
  const raw = await runRwaPerformanceAuthority({
    monotonicNow: () => {
      throw new Error("warmups must be untimed");
    },
    preflight: async () => ({ sameHostVerified: true, host }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => events.push("servers:stop"),
    runCypressLane: async () => incomplete,
    runStasisLane: async () => {
      events.push("unexpected-stasis-warmup");
      return laneResult("stasis-v0.3.3");
    },
    writeRaw: async () => events.push("raw:write"),
  });

  assert.equal(raw.authority.valid, false);
  assert.deepEqual(raw.warmups.map(({ status }) => status), ["invalid_result"]);
  assert.equal(raw.warmups[0].error.code, "cleanup_not_complete");
  assert.equal(raw.samples.length, 0);
  assert.deepEqual(events, ["servers:stop", "raw:write"]);
  assert.ok(raw.authority.reasonCodes.includes("runner_contract_or_cleanup_failure"));
});

test("one retained Stasis behavioral failure invalidates all ten pairs without retry or sample dropping", async () => {
  const calls = [];
  let clockValue = 10_000n;
  const raw = await runRwaPerformanceAuthority({
    monotonicNow: () => {
      clockValue += 1n;
      return clockValue;
    },
    preflight: async () => ({ sameHostVerified: true, host }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => undefined,
    runCypressLane: async (context) => {
      calls.push(invocationLabel(context));
      return laneResult("cypress");
    },
    runStasisLane: async (context) => {
      calls.push(invocationLabel(context));
      if (context.phase === "timed" && context.pairIndex === 4) {
        return laneResult("stasis-v0.3.3", {
          cases: rwaAuthCases.map((item, index) => caseResult("stasis-v0.3.3", item, index === 0
            ? {
                classification: "PROFILE_UNSUPPORTED",
                behaviorallySupported: false,
                allOraclesPassed: false,
              }
            : {})),
        });
      }
      return laneResult("stasis-v0.3.3");
    },
  });

  assert.equal(calls.length, 22, "two warmups plus all twenty scheduled samples run once");
  assert.equal(raw.samples.length, 20);
  assert.equal(raw.samples.filter(({ status }) => status === "failed").length, 1);
  assert.equal(raw.authority.retainedTimedFailures, 1);
  assert.equal(raw.authority.valid, false);
  assert.equal(raw.authority.cypressTimedEightOfEight, 10);
  assert.equal(raw.authority.stasisTimedEightOfEight, 9);
  assert.deepEqual(raw.authority.reasonCodes, [
    "stasis_not_8_of_8_every_sample",
    "timed_failure_retained",
  ]);
  assert.equal(
    raw.samples.find(({ status }) => status === "failed").result.cases[0].classification,
    "PROFILE_UNSUPPORTED",
  );
});

test("a thrown lane callback is retained once and aborts after the timed cleanup boundary becomes unknown", async () => {
  let stasisCalls = 0;
  let clockValue = 0n;
  const raw = await runRwaPerformanceAuthority({
    monotonicNow: () => ++clockValue,
    preflight: async () => ({ sameHostVerified: true, host }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => undefined,
    runCypressLane: async () => laneResult("cypress"),
    runStasisLane: async (context) => {
      stasisCalls += 1;
      if (context.phase === "timed") {
        const error = new Error("local path and details must not enter the raw result");
        error.code = "ENGINE_CRASH";
        throw error;
      }
      return laneResult("stasis-v0.3.3");
    },
  });

  assert.equal(stasisCalls, 2, "one warmup and one timed attempt; no retry");
  assert.equal(raw.samples.length, 2);
  assert.equal(raw.samples[1].status, "runner_error");
  assert.deepEqual(raw.samples[1].error, { name: "Error", code: "engine_crash" });
  assert.equal(JSON.stringify(raw).includes("local path"), false);
  assert.ok(raw.authority.reasonCodes.includes("timed_schedule_incomplete"));
  assert.ok(raw.authority.reasonCodes.includes("runner_contract_or_cleanup_failure"));
});

test("clock failures retain the attempted slot, invalidate authority, and never retry", async () => {
  const scenarios = [
    {
      label: "start read throws",
      values: [new TypeError("secret start details")],
      expectedCode: "clock_start_invalid",
      expectedTiming: { startNs: null, endNs: null, durationNs: null },
      expectedTimedCalls: 0,
    },
    {
      label: "end read throws",
      values: [10n, new TypeError("secret end details")],
      expectedCode: "clock_end_invalid",
      expectedTiming: { startNs: "10", endNs: null, durationNs: null },
      expectedTimedCalls: 1,
    },
    {
      label: "clock does not advance",
      values: [10n, 10n],
      expectedCode: "clock_not_monotonic",
      expectedTiming: { startNs: "10", endNs: "10", durationNs: null },
      expectedTimedCalls: 1,
    },
  ];

  for (const scenario of scenarios) {
    let clockIndex = 0;
    let timedCalls = 0;
    const raw = await runRwaPerformanceAuthority({
      monotonicNow: () => {
        const value = scenario.values[clockIndex++];
        if (value instanceof Error) throw value;
        return value;
      },
      preflight: async () => ({ sameHostVerified: true, host }),
      startRwaServers: async () => ({ id: "servers" }),
      stopRwaServers: async () => undefined,
      runCypressLane: async (context) => {
        if (context.phase === "timed") timedCalls += 1;
        return laneResult("cypress");
      },
      runStasisLane: async () => laneResult("stasis-v0.3.3"),
    });
    assert.equal(raw.samples.length, 1, scenario.label);
    assert.equal(raw.samples[0].status, "clock_error", scenario.label);
    assert.equal(raw.samples[0].error.code, scenario.expectedCode, scenario.label);
    assert.deepEqual(raw.samples[0].timing, scenario.expectedTiming, scenario.label);
    assert.equal(timedCalls, scenario.expectedTimedCalls, scenario.label);
    assert.equal(raw.authority.valid, false, scenario.label);
    assert.ok(raw.authority.reasonCodes.includes("clock_failure"), scenario.label);
  }
});

test("projected runner errors use closed privacy-safe name and code vocabularies", async () => {
  let clockValue = 0n;
  const raw = await runRwaPerformanceAuthority({
    monotonicNow: () => ++clockValue,
    preflight: async () => ({ sameHostVerified: true, host }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => undefined,
    runCypressLane: async (context) => {
      if (context.phase === "timed") {
        const hostile = new Error("C:\\Users\\sentinel\\token.txt");
        hostile.name = "sentinelUsername";
        hostile.code = "sentinel_secret_token";
        throw hostile;
      }
      return laneResult("cypress");
    },
    runStasisLane: async () => laneResult("stasis-v0.3.3"),
  });
  assert.deepEqual(raw.samples[0].error, { name: "Error", code: "runner_error" });
  assert.equal(JSON.stringify(raw).includes("sentinel"), false);
});

test("a failed server acquisition invokes out-of-boundary rollback without running a lane", async () => {
  const events = [];
  await assert.rejects(
    runRwaPerformanceAuthority({
      monotonicNow: () => {
        events.push("unexpected-clock");
        return 1n;
      },
      preflight: async () => ({ sameHostVerified: true, host }),
      startRwaServers: async () => {
        events.push("servers:start");
        throw new Error("partial startup");
      },
      stopRwaServers: async (context) => {
        events.push("servers:rollback");
        assert.equal(context.startupComplete, false);
        assert.equal(context.serverContext, null);
      },
      runCypressLane: async () => {
        events.push("unexpected-cypress");
      },
      runStasisLane: async () => {
        events.push("unexpected-stasis");
      },
    }),
    /partial startup/u,
  );
  assert.deepEqual(events, ["servers:start", "servers:rollback"]);
});

test("raw schema replays host, schedule, timing, authority, and semantic disclosure", async () => {
  let clockValue = 1_000n;
  const raw = await validRaw(() => {
    clockValue += 5n;
    return clockValue;
  });
  assert.doesNotThrow(() => assertRwaPerformanceRaw(raw));
  assert.doesNotThrow(() => JSON.stringify(raw));
  assert.equal(
    Object.hasOwn(raw.semanticDifferenceDisclosure.definitions, "persistent-cookie-profile-gap"),
    false,
  );
  assert.deepEqual(raw.semanticDifferenceDisclosure.resolvedBoundaries, [{
    id: "persistent-cookie-profile-gap",
    historicalProfile: "controlled-web-session-v1",
    v033Profile: "controlled-web-session-v2",
    status: "positively-supported-in-v0.3.3",
    treatment:
      "Retain as frozen-port lineage only; it is not an active v0.3.3 semantic difference or unsupported result.",
  }]);

  const mutations = [
    ["unknown root field", (value) => {
      value.unregistered = true;
    }],
    ["host digest drift", (value) => {
      value.host.imageVersion = "changed";
    }],
    ["pair-order drift", (value) => {
      value.samples[2].pairOrder = "AB";
    }],
    ["duration drift", (value) => {
      value.samples[0].timing.durationNs = "6";
    }],
    ["zero duration", (value) => {
      value.samples[0].timing.endNs = value.samples[0].timing.startNs;
      value.samples[0].timing.durationNs = "0";
    }],
    ["global clock-order drift", (value) => {
      value.samples[1].timing.startNs = "1";
      value.samples[1].timing.endNs = "2";
      value.samples[1].timing.durationNs = "1";
    }],
    ["authority drift", (value) => {
      value.authority.valid = false;
    }],
    ["semantic disclosure drift", (value) => {
      value.samples[1].result.cases[0].semanticDifferenceIds = [];
    }],
    ["oracle identity drift", (value) => {
      value.samples[0].result.cases[0].oracles[0].id = "substituted-oracle";
    }],
  ];
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(raw);
    mutate(candidate);
    assert.throws(() => assertRwaPerformanceRaw(candidate), undefined, label);
  }
});

function laneResult(runner, overrides = {}) {
  const cases = overrides.cases ?? rwaAuthCases.map((item) => caseResult(runner, item));
  return {
    schema: rwaPerformanceLaneResultSchema,
    runner,
    track: rwaPerformanceTrack,
    hostIdentityDigest: host.identityDigest,
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

function caseResult(runner, item, overrides = {}) {
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
    semanticDifferenceIds: runner === "cypress"
      ? []
      : [...rwaPerformanceSemanticDifferenceDisclosure.cases.find(({ id }) => id === item.id)
        .semanticDifferenceIds],
    ...overrides,
  };
}

function invocationLabel(context) {
  return context.phase === "warmup"
    ? `warmup:${context.warmupIndex}:${context.runner}`
    : `timed:${context.pairIndex}:${context.pairOrder}:${context.position}:${context.runner}`;
}

function laneEvents(label) {
  const events = [`${label}:engine-start`];
  for (const item of rwaAuthCases) {
    events.push(`${label}:seed:${item.ordinal}`);
    events.push(`${label}:intent:${item.ordinal}`);
    events.push(`${label}:oracles:${item.ordinal}`);
  }
  events.push(`${label}:cleanup`);
  return events;
}

function expectedTimedSchedule() {
  return Array.from({ length: 10 }, (_, index) => {
    const pairIndex = index + 1;
    const pairOrder = pairIndex % 2 === 1 ? "AB" : "BA";
    const runners = pairOrder === "AB"
      ? ["cypress", "stasis-v0.3.3"]
      : ["stasis-v0.3.3", "cypress"];
    return runners.map((runner, position) => ({
      pairIndex,
      pairOrder,
      position: position + 1,
      runner,
    }));
  }).flat();
}

async function validRaw(monotonicNow) {
  return runRwaPerformanceAuthority({
    monotonicNow,
    preflight: async () => ({ sameHostVerified: true, host }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => undefined,
    runCypressLane: async () => laneResult("cypress"),
    runStasisLane: async () => laneResult("stasis-v0.3.3"),
  });
}
