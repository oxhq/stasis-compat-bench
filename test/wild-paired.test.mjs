import assert from "node:assert/strict";
import test from "node:test";

import {
  projectRobotsGateReason,
  runAdjacentGate,
  runPairedCases,
} from "../src/wild/paired.mjs";
import { normalizeTitleIdentity, publicHttpUrlIdentity } from "../src/wild/normalize.mjs";

test("paired orchestration is sequential, adjacent-gated, and never runs Stasis after baseline failure", async () => {
  const entries = [
    { slot: 1, rank: 1, stratumId: "rank-1-1000", requestedUrl: "https://one.example/" },
    { slot: 2, rank: 2, stratumId: "rank-1-1000", requestedUrl: "https://two.example/" },
  ];
  const events = [];
  const inspect = async (url) => {
    events.push(`inspect:${new URL(url).hostname}`);
    return { url, hostname: new URL(url).hostname, addressCount: 1, families: [4] };
  };
  const robots = async (url) => {
    events.push(`robots:${new URL(url).hostname}`);
    return { status: "allowed", reason: "robots_allowed", redirectCount: 0 };
  };
  const baseline = async (entry) => {
    events.push(`baseline:${entry.slot}`);
    if (entry.slot === 2) return { status: "failure", code: "navigation_failed" };
    return successfulBaseline(entry);
  };
  const stasis = async (entry) => {
    events.push(`stasis:${entry.slot}`);
    return {
      status: "success",
      openCommittedUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
      currentUrlObservable: false,
      settlement: { outcome: "quiescent" },
      extraction: { titleIdentity: normalizeTitleIdentity("One"), linkIdentities: [] },
    };
  };
  const persistCase = async (item) => {
    events.push(`persist:${item.entry.slot}`);
    return { slot: item.entry.slot, records: [] };
  };

  const result = await runPairedCases(entries, {
    executablePath: "unused-by-mock",
    inspect,
    robots,
    baseline,
    stasis,
    persistCase,
  });

  assert.deepEqual(events, [
    "inspect:one.example",
    "robots:one.example",
    "baseline:1",
    "inspect:one.example",
    "robots:one.example",
    "stasis:1",
    "persist:1",
    "inspect:two.example",
    "robots:two.example",
    "baseline:2",
    "persist:2",
  ]);
  assert.equal(result.cases[0].classification.primary, "SDK_GAP");
  assert.equal(result.cases[1].classification.primary, "BASELINE_FAILURE");
  assert.equal(result.cases[1].stasis.status, "not_run");
  assert.equal(result.summary.stasisAttempted, 1);
});

test("a changed robots decision between lanes prevents the native run", async () => {
  let robotsCalls = 0;
  let stasisCalls = 0;
  const result = await runPairedCases([
    { slot: 1, rank: 1, stratumId: "rank-1-1000", requestedUrl: "https://one.example/" },
  ], {
    executablePath: "unused-by-mock",
    inspect: async (url) => ({ url, hostname: new URL(url).hostname, addressCount: 1, families: [4] }),
    robots: async () => {
      robotsCalls += 1;
      return robotsCalls === 1
        ? { status: "allowed", reason: "robots_allowed", redirectCount: 0 }
        : { status: "denied", reason: "robots_disallowed", redirectCount: 0 };
    },
    baseline: async (entry) => successfulBaseline(entry),
    stasis: async () => {
      stasisCalls += 1;
      return { status: "success" };
    },
  });
  assert.equal(stasisCalls, 0);
  assert.equal(result.cases[0].stasis.status, "not_run");
  assert.equal(result.cases[0].classification.reason, "paired_gate_drift");
});

test("paired catch boundaries sanitize dependency errors before persistence", async () => {
  const entries = [
    { slot: 1, rank: 1, stratumId: "rank-1-1000", requestedUrl: "https://one.example/" },
    { slot: 2, rank: 2, stratumId: "rank-1-1000", requestedUrl: "https://two.example/" },
  ];
  const persisted = [];
  const result = await runPairedCases(entries, {
    executablePath: "unused-by-mock",
    inspect: async (url) => ({
      url,
      hostname: new URL(url).hostname,
      addressCount: 1,
      families: [4],
    }),
    robots: async () => ({ status: "allowed", reason: "robots_allowed", redirectCount: 0 }),
    baseline: async (entry) => {
      const error = new Error("private baseline detail");
      error.code = entry.slot === 1 ? "ENOTFOUND" : "PRIVATE_BASELINE_CODE";
      throw error;
    },
    stasis: async () => {
      throw new Error("must not run");
    },
    persistCase: async (item) => {
      persisted.push(structuredClone(item));
    },
  });

  assert.equal(result.cases[0].baseline.error.code, "ENOTFOUND");
  assert.equal(result.cases[1].baseline.error.code, "unclassified_error");
  assert.equal(persisted[0].baseline.error.code, "ENOTFOUND");
  assert.equal(persisted[1].baseline.error.code, "unclassified_error");
  assert.equal(JSON.stringify(persisted).includes("PRIVATE_BASELINE_CODE"), false);
  assert.equal(JSON.stringify(persisted).includes("private baseline detail"), false);
});

test("robots gate reasons use an exact closed vocabulary", async () => {
  assert.equal(projectRobotsGateReason("robots_disallowed"), "robots_disallowed");
  assert.equal(projectRobotsGateReason("PRIVATE_ROBOTS_REASON"), "unclassified_error");

  const gate = await runAdjacentGate(
    { requestedUrl: "https://one.example/" },
    {
      inspect: async (url) => ({ url, addressCount: 1, families: [4] }),
      robots: async () => ({
        status: "denied",
        reason: "PRIVATE_ROBOTS_REASON",
        redirectCount: 0,
      }),
    },
  );
  assert.equal(gate.code, "unclassified_error");
  assert.equal(gate.robots.reason, "unclassified_error");
  assert.equal(JSON.stringify(gate).includes("PRIVATE_ROBOTS_REASON"), false);

  const malformedAllowed = await runAdjacentGate(
    { requestedUrl: "https://one.example/" },
    {
      inspect: async (url) => ({ url, addressCount: 1, families: [4] }),
      robots: async () => ({
        status: "allowed",
        reason: "PRIVATE_ROBOTS_REASON",
        redirectCount: 0,
      }),
    },
  );
  assert.deepEqual(malformedAllowed, {
    status: "harness_error",
    code: "robots_gate_invalid",
    root: { addressCount: 1, families: [4] },
  });
});

function successfulBaseline(entry) {
  return {
    status: "success",
    code: "eligible",
    requestedUrl: entry.requestedUrl,
    finalUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
    responseStatus: 200,
    contentType: "text/html",
    extraction: { titleIdentity: normalizeTitleIdentity("One"), linkIdentities: [] },
    wallTimeMs: 1,
  };
}
