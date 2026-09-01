import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyStasisFailure,
  evaluateRwaOracles,
  expectedNodeVersion,
  expectedStasisExecutableSha256,
  projectRwaUnsupportedWork,
  readCompleteAudit,
  rwaUnsupportedWorkRetentionLimit,
  runStasisRwaProof,
} from "../src/rwa/stasis-lane.mjs";
import { validateCandidate } from "../src/rwa/compare-lib.mjs";
import { rwaAuthCases } from "../src/rwa/cases.mjs";
import { jsonReplacer } from "../src/shared/io.mjs";

const fakeExecutable = "C:\\frozen\\stasis.exe";

test("typed Stasis failures map to the frozen result vocabulary", () => {
  assert.deepEqual(
    classifyStasisFailure({ name: "StasisProtocolError", code: "unsupported_persistent_cookie" }, "settle"),
    { classification: "PROFILE_UNSUPPORTED", typedSurface: "storage" },
  );
  assert.deepEqual(
    classifyStasisFailure({ name: "StasisProtocolError", code: "navigation_authority_changed" }, "openSession"),
    { classification: "ENGINE_BUG", typedSurface: "navigation_authority" },
  );
  assert.deepEqual(classifyStasisFailure({ name: "StasisProtocolError", code: "element_not_found" }, "query"), {
    classification: "WEB_COMPAT_BUG",
    typedSurface: "semantic_dom",
  });
  assert.deepEqual(classifyStasisFailure({ name: "RwaHarnessError", code: "stale_generation" }, "fill"), {
    classification: "BENCHMARK_INVALID",
    typedSurface: "harness_adapter",
  });
  assert.deepEqual(
    classifyStasisFailure({
      name: "RwaSettleTerminalError",
      code: "settle_blocked_on_open_ended_work",
      outcome: "blocked_on_open_ended_work",
    }, "settle"),
    { classification: "PROFILE_UNSUPPORTED", typedSurface: "open_ended_work" },
  );
  assert.deepEqual(
    classifyStasisFailure({
      name: "RwaSettleTerminalError",
      code: "unsupported_rendering",
      outcome: "runtime_error",
    }, "settle"),
    { classification: "ENGINE_BUG", typedSurface: "controlled_runtime" },
  );
  for (const code of [
    "clock_not_controlled",
    "unsupported_clock_surface",
    "unsupported_source",
    "unsupported_open_ended_source",
    "unsupported_rendering",
    "unsupported_retained_tasks",
    "ineligible_logical_timer_head",
  ]) {
    assert.deepEqual(
      classifyStasisFailure({ name: "RwaSettleTerminalError", code, outcome: "unsupported_work" }, "settle"),
      {
        classification: "PROFILE_UNSUPPORTED",
        typedSurface: code === "unsupported_open_ended_source" ? "open_ended_work" : "controlled_profile",
      },
    );
  }
});

test("audit pagination negotiates the first page and uses the advertised bound thereafter", async () => {
  const calls = [];
  const bounds = { maxRecords: 4, maxMetadataBytes: 1_024, maxPageItems: 2 };
  const pages = [
    {
      records: [{ seq: 1n }, { seq: 2n }],
      firstRetainedSeq: 1n,
      nextAfterSeq: 2n,
      latestSeq: 3n,
      complete: true,
      hasMore: true,
      bounds,
      stateToken: "token-1",
    },
    {
      records: [{ seq: 3n }],
      firstRetainedSeq: 1n,
      nextAfterSeq: 3n,
      latestSeq: 3n,
      complete: true,
      hasMore: false,
      bounds,
      stateToken: "token-2",
    },
  ];
  const result = await readCompleteAudit({
    async requests(options) {
      calls.push(options);
      return pages.shift();
    },
  }, "requests");

  assert.deepEqual(calls, [{}, { afterSeq: 2n, limit: 2 }]);
  assert.deepEqual(result.records.map(({ seq }) => seq), [1n, 2n, 3n]);
  assert.equal(result.complete, true);
  assert.equal(result.hasMore, false);
  assert.equal(result.pages.length, 2);
});

test("audit pagination rejects malformed, unbounded, drifting, and stalled authority", async () => {
  const validBounds = { maxRecords: 4, maxMetadataBytes: 1_024, maxPageItems: 2 };
  const invalidBounds = [
    undefined,
    { ...validBounds, maxRecords: 0 },
    { ...validBounds, maxRecords: 4_097 },
    { ...validBounds, maxMetadataBytes: 8 * 1024 * 1024 + 1 },
    { ...validBounds, maxPageItems: 0 },
    { ...validBounds, maxPageItems: 1_025 },
    { ...validBounds, unexpected: 1 },
  ];
  for (const bounds of invalidBounds) {
    await assert.rejects(
      readCompleteAudit({
        async evidence(options) {
          assert.deepEqual(options, {});
          return { records: [], complete: true, hasMore: false, bounds };
        },
      }, "evidence"),
      (error) => error?.name === "RwaHarnessError" && error?.code === "invalid_result",
    );
  }

  let calls = 0;
  await assert.rejects(
    readCompleteAudit({
      async requests(options) {
        calls += 1;
        if (calls === 1) {
          assert.deepEqual(options, {});
          return {
            records: [{ seq: 1n }],
            firstRetainedSeq: 1n,
            nextAfterSeq: 1n,
            latestSeq: 1n,
            complete: true,
            hasMore: true,
            bounds: validBounds,
          };
        }
        assert.deepEqual(options, { afterSeq: 1n, limit: 2 });
        return {
          records: [],
          complete: true,
          hasMore: true,
          bounds: { ...validBounds },
        };
      },
    }, "requests"),
    (error) => error?.name === "RwaHarnessError" && error?.code === "audit_pagination_stalled",
  );
  assert.equal(calls, 2);

  calls = 0;
  await assert.rejects(
    readCompleteAudit({
      async requests() {
        calls += 1;
        return calls === 1
          ? {
              records: [{ seq: 1n }],
              firstRetainedSeq: 1n,
              nextAfterSeq: 1n,
              latestSeq: 1n,
              complete: true,
              hasMore: true,
              bounds: validBounds,
            }
          : {
              records: [{ seq: 2n }],
              firstRetainedSeq: 1n,
              nextAfterSeq: 2n,
              latestSeq: 2n,
              complete: true,
              hasMore: false,
              bounds: { ...validBounds, maxPageItems: 1 },
            };
      },
    }, "requests"),
    (error) => error?.name === "RwaHarnessError" && error?.code === "invalid_result",
  );
  assert.equal(calls, 2);

  calls = 0;
  await assert.rejects(
    readCompleteAudit({
      async requests(options) {
        calls += 1;
        assert.deepEqual(options, {});
        return {
          records: [{ seq: 1n }],
          firstRetainedSeq: 1n,
          nextAfterSeq: 1n,
          latestSeq: 1n,
          complete: true,
          hasMore: true,
          bounds: { maxRecords: 1, maxMetadataBytes: 1_024, maxPageItems: 1 },
        };
      },
    }, "requests"),
    (error) => error?.name === "RwaHarnessError" && error?.code === "invalid_result",
  );
  assert.equal(calls, 1);
});

test("audit pagination rejects false completeness and omitted evidence", async () => {
  const bounds = { maxRecords: 8, maxMetadataBytes: 1_024, maxPageItems: 4 };
  const contradictions = [
    {
      records: [{ seq: 6n }],
      firstRetainedSeq: 6n,
      nextAfterSeq: 6n,
      latestSeq: 6n,
      droppedThroughSeq: 5n,
      complete: true,
      hasMore: false,
      bounds,
    },
    {
      records: [{ seq: 1n }],
      firstRetainedSeq: 1n,
      nextAfterSeq: 1n,
      latestSeq: 2n,
      complete: true,
      hasMore: false,
      bounds,
    },
    {
      records: [{ seq: 2n }],
      firstRetainedSeq: 2n,
      nextAfterSeq: 2n,
      latestSeq: 2n,
      complete: true,
      hasMore: false,
      bounds,
    },
  ];
  for (const page of contradictions) {
    await assert.rejects(
      readCompleteAudit({ async evidence() { return page; } }, "evidence"),
      (error) => error?.name === "RwaHarnessError" && error?.code === "invalid_result",
    );
  }

  let calls = 0;
  await assert.rejects(
    readCompleteAudit({
      async evidence() {
        calls += 1;
        return calls === 1
          ? {
              records: [{ seq: 1n }],
              firstRetainedSeq: 1n,
              nextAfterSeq: 1n,
              latestSeq: 3n,
              complete: true,
              hasMore: true,
              bounds,
            }
          : {
              records: [{ seq: 3n }],
              firstRetainedSeq: 1n,
              nextAfterSeq: 3n,
              latestSeq: 3n,
              complete: true,
              hasMore: false,
              bounds,
            };
      },
    }, "evidence"),
    (error) => error?.name === "RwaHarnessError" && error?.code === "invalid_result",
  );
  assert.equal(calls, 2);
});

test("audit pagination preserves dropped-history incompleteness and filtered request gaps", async () => {
  const bounds = { maxRecords: 8, maxMetadataBytes: 1_024, maxPageItems: 2 };
  const evidencePages = [
    {
      records: [{ seq: 6n }, { seq: 7n }],
      firstRetainedSeq: 6n,
      nextAfterSeq: 7n,
      latestSeq: 8n,
      droppedThroughSeq: 5n,
      complete: false,
      hasMore: true,
      bounds,
    },
    {
      records: [{ seq: 8n }],
      firstRetainedSeq: 6n,
      nextAfterSeq: 8n,
      latestSeq: 8n,
      droppedThroughSeq: 5n,
      complete: true,
      hasMore: false,
      bounds,
    },
  ];
  const evidence = await readCompleteAudit({
    async evidence() { return evidencePages.shift(); },
  }, "evidence");
  assert.equal(evidence.complete, false);
  assert.deepEqual(evidence.records.map(({ seq }) => seq), [6n, 7n, 8n]);

  const requests = await readCompleteAudit({
    async requests() {
      return {
        records: [{ seq: 1n }, { seq: 3n }],
        firstRetainedSeq: 1n,
        nextAfterSeq: 3n,
        latestSeq: 4n,
        complete: true,
        hasMore: false,
        bounds,
      };
    },
  }, "requests");
  assert.equal(requests.complete, true);
  assert.deepEqual(requests.records.map(({ seq }) => seq), [1n, 3n]);
});

test("typed settle terminals preserve exact safe failure and outcome through validator replay", async () => {
  const unsupportedWork = Array.from({ length: 35 }, (_, index) => ({
    sourceId: String(index + 1),
    kind: "rendering_update",
    count: 1n,
    reason: "inactive_rendering",
    timeSurface: "update_rendering",
  }));
  const result = await runStasisRwaProof(fakeExecutable, {
    hashExecutable: async () => expectedStasisExecutableSha256,
    nodeVersion: expectedNodeVersion,
    fetchImpl: async (url, options) => {
      if (options.method === "POST") return { ok: true, status: 200 };
      assert.equal(url.endsWith("/testData/users"), true);
      return jsonResponse([{ id: "seeded-id", username: "Heath93" }]);
    },
    launchRuntime: async () => ({
      async openSession(url) {
        const session = fakeSession(url);
        session.settle = async () => ({
          outcome: "unsupported_work",
          failure: { code: "unsupported_rendering" },
          unsupportedWork,
          stateToken: "typed-terminal-token",
          url: "http://localhost:3000/signin?opaque=PRIVATE_SETTLE_QUERY",
        });
        return session;
      },
      async close() {},
    }),
  });

  assert.deepEqual(result.cases.map(({ classification }) => classification), Array(8).fill("PROFILE_UNSUPPORTED"));
  assert.equal(result.cases[0].oracles[0].status, "PASS");
  assert.equal(
    JSON.stringify(result, jsonReplacer).includes("PRIVATE_SETTLE_QUERY"),
    false,
    "a returned terminal URL neither launders the terminal nor retains query values",
  );
  for (const entry of result.cases) {
    assert.equal(entry.terminal.error.name, "RwaSettleTerminalError");
    assert.equal(entry.terminal.error.code, "unsupported_rendering");
    assert.equal(entry.terminal.error.outcome, "unsupported_work");
    assert.equal(entry.terminal.typedSurface, "controlled_profile");
    const blocked = entry.checkpoints.find(
      ({ phase, status, action }) =>
        phase === "action" && status === "blocked" && action?.op === "settle",
    );
    assert.equal(blocked.result.unsupportedWorkCount, 35);
    assert.equal(blocked.result.unsupportedWork.length, rwaUnsupportedWorkRetentionLimit);
    assert.equal(blocked.result.unsupportedWorkOmitted, 3);
    assert.deepEqual(blocked.result.unsupportedWork[0], {
      kind: "rendering_update",
      count: "1",
      reason: "inactive_rendering",
      timeSurface: "update_rendering",
    });
    assert.equal(Object.hasOwn(blocked.result.unsupportedWork[0], "sourceId"), false);
    assert.deepEqual(
      entry.checkpoints
        .filter(({ phase }) => phase === "terminal-audit")
        .map(({ op, status }) => ({ op, status })),
      [
        { op: "requests", status: "passed" },
        { op: "evidence", status: "passed" },
      ],
    );
  }
  assert.deepEqual(validateCandidate(result), { valid: true, violations: [] });

  const renderBlockingCandidate = structuredClone(result);
  renderBlockingCandidate.cases[0].checkpoints.find(
    ({ phase, status }) => phase === "action" && status === "blocked",
  ).result.unsupportedWork[0].reason = "render_blocking_element";
  assert.deepEqual(validateCandidate(renderBlockingCandidate), { valid: true, violations: [] });

  const privateReason = structuredClone(result);
  privateReason.cases[0].checkpoints.find(
    ({ phase, status }) => phase === "action" && status === "blocked",
  ).result.unsupportedWork[0].reason = "PRIVATE_SENTINEL";
  assert.equal(validateCandidate(privateReason).valid, false);

  const inconsistentOmission = structuredClone(result);
  inconsistentOmission.cases[0].checkpoints.find(
    ({ phase, status }) => phase === "action" && status === "blocked",
  ).result.unsupportedWorkOmitted = 2;
  assert.equal(validateCandidate(inconsistentOmission).valid, false);

  const missingTerminalAudits = structuredClone(result);
  missingTerminalAudits.cases[0].checkpoints = missingTerminalAudits.cases[0].checkpoints
    .filter(({ phase }) => phase !== "terminal-audit")
    .map((checkpoint, index) => ({ ...checkpoint, sequence: index + 1 }));
  assert.equal(validateCandidate(missingTerminalAudits).valid, false);

  const reorderedTerminalAudits = structuredClone(result);
  reorderedTerminalAudits.cases[0].checkpoints.find(
    ({ phase }) => phase === "terminal-audit",
  ).op = "evidence";
  assert.equal(validateCandidate(reorderedTerminalAudits).valid, false);

  const privateTerminalAudit = structuredClone(result);
  privateTerminalAudit.cases[0].checkpoints.find(
    ({ phase, status }) => phase === "terminal-audit" && status === "passed",
  ).result.credential = "PRIVATE_SENTINEL";
  assert.equal(validateCandidate(privateTerminalAudit).valid, false);
});

test("owner-attested settle URLs cannot launder limit or runtime terminals into passes", async () => {
  const scenarios = [
    {
      result: {
        outcome: "control_turn_limit_exceeded",
        limit: { kind: "control_turns", limit: 1n },
        unsupportedWork: [],
        stateToken: "limit-terminal-token",
        url: "http://localhost:3000/signin?opaque=PRIVATE_LIMIT_QUERY",
      },
      classification: "WEB_COMPAT_BUG",
      code: "settle_control_turn_limit_exceeded",
      typedSurface: "settlement",
      privateSentinel: "PRIVATE_LIMIT_QUERY",
    },
    {
      result: {
        outcome: "runtime_error",
        failure: { code: "runtime_terminals" },
        unsupportedWork: [],
        stateToken: "runtime-terminal-token",
        url: "http://localhost:3000/signin?opaque=PRIVATE_RUNTIME_QUERY",
      },
      classification: "ENGINE_BUG",
      code: "runtime_terminals",
      typedSurface: "controlled_runtime",
      privateSentinel: "PRIVATE_RUNTIME_QUERY",
    },
  ];

  for (const scenario of scenarios) {
    let launchOrdinal = 0;
    const result = await runStasisRwaProof(fakeExecutable, {
      hashExecutable: async () => expectedStasisExecutableSha256,
      nodeVersion: expectedNodeVersion,
      fetchImpl: async (url, options) => {
        if (options.method === "POST") return { ok: true, status: 200 };
        assert.equal(url.endsWith("/testData/users"), true);
        return jsonResponse([{ id: "seeded-id", username: "Heath93" }]);
      },
      launchRuntime: async () => ({
        async openSession(url) {
          launchOrdinal += 1;
          const session = fakeSession(url);
          const quiescentSettle = session.settle.bind(session);
          const targetSettleCall = new Map([[2, 2], [3, 3], [4, 8]])
            .get(launchOrdinal) ?? 1;
          let settleCall = 0;
          session.settle = async () => {
            settleCall += 1;
            if (settleCall !== targetSettleCall) return quiescentSettle();
            return {
              ...scenario.result,
              url: launchOrdinal === 2
                ? `http://localhost:3000/?opaque=${scenario.privateSentinel}`
                : `http://localhost:3000/signin?opaque=${scenario.privateSentinel}`,
            };
          };
          return session;
        },
        async close() {},
      }),
    });

    assert.deepEqual(
      result.cases.map(({ classification }) => classification),
      Array(8).fill(scenario.classification),
    );
    for (const entry of result.cases) {
      assert.equal(entry.success, false);
      assert.equal(entry.terminal.error.code, scenario.code);
      assert.equal(entry.terminal.typedSurface, scenario.typedSurface);
    }
    assert.deepEqual(
      result.cases.slice(1, 4).map(({ oracles }) =>
        oracles.find(({ id }) => id === "final-path")?.status),
      ["PASS", "PASS", "PASS"],
      "even a matching final URL remains subordinate to the typed terminal",
    );
    assert.equal(JSON.stringify(result, jsonReplacer).includes(scenario.privateSentinel), false);
    assert.deepEqual(validateCandidate(result), { valid: true, violations: [] });
  }
});

test("unsupported-work projection is bounded, typed, privacy-safe, and fail-closed", () => {
  const input = Array.from({ length: 35 }, (_, index) => ({
    sourceId: String(index + 1),
    kind: index === 0 ? "tracked_presence" : "rendering_update",
    count: index === 0 ? 2n : "1",
    reason: index === 0 ? "image_load" : "inactive_rendering",
    ...(index === 0 ? {} : { timeSurface: "update_rendering" }),
  }));
  const projected = projectRwaUnsupportedWork(input);
  assert.equal(projected.unsupportedWorkCount, 35);
  assert.equal(projected.unsupportedWork.length, rwaUnsupportedWorkRetentionLimit);
  assert.equal(projected.unsupportedWorkOmitted, 3);
  assert.deepEqual(projected.unsupportedWork[0], {
    kind: "tracked_presence",
    count: "2",
    reason: "image_load",
  });
  assert.equal(JSON.stringify(projected).includes("sourceId"), false);

  const renderBlocking = projectRwaUnsupportedWork([
    {
      sourceId: "36",
      kind: "rendering_update",
      count: 2n,
      reason: "render_blocking_element",
    },
  ]);
  assert.deepEqual(renderBlocking, {
    unsupportedWorkCount: 1,
    unsupportedWork: [
      {
        kind: "rendering_update",
        count: "2",
        reason: "render_blocking_element",
      },
    ],
    unsupportedWorkOmitted: 0,
  });
  assert.equal(JSON.stringify(renderBlocking).includes("sourceId"), false);

  const extendedArray = [];
  extendedArray.credential = "PRIVATE_SENTINEL";
  const accessorEntry = {
    sourceId: "1",
    kind: "tracked_presence",
    reason: "image_load",
  };
  Object.defineProperty(accessorEntry, "count", {
    enumerable: true,
    get() { return 1n; },
  });

  for (const [label, value] of [
    ["missing array", null],
    ["sparse array", Array(1)],
    ["extended array", extendedArray],
    ["accessor entry", [accessorEntry]],
    ["unknown kind", [{ sourceId: "1", kind: "PRIVATE_SENTINEL", count: 1n, reason: "image_load" }]],
    ["unknown reason", [{ sourceId: "1", kind: "tracked_presence", count: 1n, reason: "PRIVATE_SENTINEL" }]],
    ["zero count", [{ sourceId: "1", kind: "tracked_presence", count: 0n, reason: "image_load" }]],
    ["negative count", [{ sourceId: "1", kind: "tracked_presence", count: -1n, reason: "image_load" }]],
    ["u128 overflow", [{ sourceId: "1", kind: "tracked_presence", count: "340282366920938463463374607431768211456", reason: "image_load" }]],
    ["oversized decimal", [{ sourceId: "1", kind: "tracked_presence", count: "1".repeat(10_000), reason: "image_load" }]],
    ["unknown time surface", [{ sourceId: "1", kind: "tracked_presence", count: 1n, reason: "image_load", timeSurface: "PRIVATE_SENTINEL" }]],
    ["noncanonical source identity", [{ sourceId: "01", kind: "tracked_presence", count: 1n, reason: "image_load" }]],
    ["private extension", [{ sourceId: "1", kind: "tracked_presence", count: 1n, reason: "image_load", credential: "PRIVATE_SENTINEL" }]],
  ]) {
    assert.throws(() => projectRwaUnsupportedWork(value), /settle unsupported work/u, label);
  }
});

test("terminal oracle replay evaluates evidence observed before the terminal", () => {
  const terminal = { classification: "PROFILE_UNSUPPORTED", phase: "settle" };
  const oracles = evaluateRwaOracles(
    rwaAuthCases[3],
    [{
      actionIndex: 4,
      op: "text",
      selector: '[data-test="signup-title"]',
      result: { value: "Sign Up" },
    }],
    null,
    terminal,
  );
  assert.equal(oracles[0].id, "signup-title");
  assert.equal(oracles[0].status, "PASS");
  assert.equal(oracles.slice(1).every(({ status }) => status === "NOT_REACHED"), true);

  const withTerminalAudits = evaluateRwaOracles(
    rwaAuthCases[3],
    [
      {
        actionIndex: 4,
        op: "text",
        selector: '[data-test="signup-title"]',
        result: { value: "Sign Up" },
      },
      {
        actionIndex: null,
        op: "requests",
        diagnostic: true,
        result: {
          complete: true,
          hasMore: false,
          records: [{ method: "POST", requestKeySha256: "request-key", url: { path: "/users" } }],
        },
      },
      {
        actionIndex: null,
        op: "evidence",
        diagnostic: true,
        result: {
          complete: true,
          hasMore: false,
          records: [{ kind: "response_headers", requestKeySha256: "request-key", status: 201 }],
        },
      },
    ],
    null,
    terminal,
  );
  assert.equal(withTerminalAudits[0].status, "PASS");
  assert.equal(withTerminalAudits[1].status, "PASS");
  assert.equal(
    withTerminalAudits.find(({ id }) => id === "bank-account-response").status,
    "NOT_REACHED",
  );
});

test("pathname oracles bind only to their designated owner-attested open or settle result", () => {
  const caseOne = evaluateRwaOracles(
    rwaAuthCases[0],
    [{
      actionIndex: 0,
      op: "openSession",
      result: {
        boundary: "controlled_ready",
        requestedUrl: "http://localhost:3000/personal",
        path: "/signin",
      },
    }],
    null,
    { classification: "PROFILE_UNSUPPORTED", phase: "settle" },
  );
  assert.equal(caseOne[0].status, "PASS");
  assert.deepEqual(caseOne[0].observed, "/signin");

  const laterNavigation = evaluateRwaOracles(
    rwaAuthCases[1],
    [{
      actionIndex: 6,
      op: "settle",
      result: { outcome: "quiescent", unsupportedWorkCount: 0, path: "/" },
    }],
    null,
    null,
  );
  assert.equal(laterNavigation[0].status, "PASS");
  assert.equal(laterNavigation[0].observed, "/");

  const unrelatedSettle = evaluateRwaOracles(
    rwaAuthCases[1],
    [{
      actionIndex: 1,
      op: "settle",
      result: { outcome: "quiescent", unsupportedWorkCount: 0 },
    }],
    null,
    null,
  );
  assert.equal(unrelatedSettle[0].status, "FAIL");
  assert.equal(unrelatedSettle[0].classification, "WEB_COMPAT_BUG");
});

test("open-ended settle terminals retain the frozen unsupported-work classification", async () => {
  const result = await runStasisRwaProof(fakeExecutable, {
    hashExecutable: async () => expectedStasisExecutableSha256,
    nodeVersion: expectedNodeVersion,
    fetchImpl: async (url, options) => {
      if (options.method === "POST") return { ok: true, status: 200 };
      assert.equal(url.endsWith("/testData/users"), true);
      return jsonResponse([{ id: "seeded-id", username: "Heath93" }]);
    },
    launchRuntime: async () => ({
      async openSession(url) {
        const session = fakeSession(url);
        session.settle = async () => ({
          outcome: "blocked_on_open_ended_work",
          unsupportedWork: [],
          stateToken: "open-ended-token",
        });
        return session;
      },
      async close() {},
    }),
  });

  assert.deepEqual(result.cases.map(({ classification }) => classification), Array(8).fill("PROFILE_UNSUPPORTED"));
  for (const entry of result.cases) {
    assert.equal(entry.terminal.error.code, "settle_blocked_on_open_ended_work");
    assert.equal(entry.terminal.error.outcome, "blocked_on_open_ended_work");
    assert.equal(entry.terminal.typedSurface, "open_ended_work");
  }
  assert.deepEqual(validateCandidate(result), { valid: true, violations: [] });
});

test("one shared open blocker still yields eight classified outcomes without retries", async () => {
  let seedCalls = 0;
  let userReads = 0;
  let launches = 0;
  let opens = 0;
  let runtimeCloses = 0;
  const failure = Object.assign(new Error("the admitted navigation did not activate the exact controlled document"), {
    name: "StasisProtocolError",
    code: "navigation_authority_changed",
    fatal: true,
    stateEffect: "partial",
  });

  const result = await runStasisRwaProof(fakeExecutable, {
    hashExecutable: async () => expectedStasisExecutableSha256,
    nodeVersion: expectedNodeVersion,
    fetchImpl: async (url, options) => {
      if (options.method === "POST") {
        seedCalls += 1;
        return { ok: true, status: 200 };
      }
      assert.equal(url.endsWith("/testData/users"), true);
      userReads += 1;
      return jsonResponse([{ id: "seeded-id", username: "Heath93" }]);
    },
    launchRuntime: async () => {
      launches += 1;
      return {
        async openSession() {
          opens += 1;
          throw failure;
        },
        async close() {
          runtimeCloses += 1;
        },
      };
    },
  });

  assert.equal(seedCalls, 8);
  assert.equal(userReads, 3);
  assert.equal(launches, 8);
  assert.equal(opens, 8);
  assert.equal(runtimeCloses, 8);
  assert.equal(result.cases.length, 8);
  assert.deepEqual(result.cases.map(({ classification }) => classification), Array(8).fill("ENGINE_BUG"));
  assert.deepEqual(result.sharedBlocker, {
    classification: "ENGINE_BUG",
    typedSurface: "navigation_authority",
    phase: "openSession",
    code: "navigation_authority_changed",
    affectedCases: [1, 2, 3, 4, 5, 6, 7, 8],
  });
  for (const entry of result.cases) {
    assert.equal(entry.oracles.every(({ status }) => status === "NOT_REACHED"), true);
    assert.equal(entry.checkpoints.some(({ phase }) => phase === "seed"), true);
    assert.equal(entry.checkpoints.some(({ phase }) => phase === "cleanup"), true);
  }
  assert.deepEqual(result.cases[2].preRegisteredBoundaries.map(({ classification }) => classification), [
    "PROFILE_UNSUPPORTED",
  ]);
  assert.equal(result.cases[4].preRegisteredBoundaries[0].typedSurface, "visibility");
});

test("candidate identity drift is classified for the full denominator before execution", async () => {
  let invoked = false;
  const result = await runStasisRwaProof(fakeExecutable, {
    hashExecutable: async () => "0".repeat(64),
    nodeVersion: expectedNodeVersion,
    fetchImpl: async () => {
      invoked = true;
      throw new Error("must not fetch");
    },
    launchRuntime: async () => {
      invoked = true;
      throw new Error("must not launch");
    },
  });
  assert.equal(invoked, false);
  assert.deepEqual(result.cases.map(({ classification }) => classification), Array(8).fill("BENCHMARK_INVALID"));
  assert.equal(result.sharedBlocker.code, "stasis_executable_hash_mismatch");
});

test("the adapter executes all public mappings and binds v2 settle paths without hidden state", async () => {
  let seedCalls = 0;
  let launches = 0;
  const result = await runStasisRwaProof(fakeExecutable, {
    hashExecutable: async () => expectedStasisExecutableSha256,
    nodeVersion: expectedNodeVersion,
    fetchImpl: async (url, options) => {
      if (options.method === "POST") {
        seedCalls += 1;
        return { ok: true, status: 200 };
      }
      if (url.endsWith("/testData/users")) {
        return jsonResponse([
          { id: "seeded-id", username: "Heath93" },
          { id: "created-id", firstName: "Bob", lastName: "Ross", username: "PainterJoy90" },
        ]);
      }
      if (url.endsWith("/testData/bankaccounts")) {
        return jsonResponse([
          {
            id: "bank-id",
            userId: "created-id",
            bankName: "The Best Bank",
            accountNumber: "123456789",
            routingNumber: "987654321",
            isDeleted: false,
          },
        ]);
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    launchRuntime: async () => {
      launches += 1;
      return fakeRuntime();
    },
  });

  assert.equal(seedCalls, 8);
  assert.equal(launches, 8);
  assert.deepEqual(result.cases.slice(0, 4).map(({ classification }) => classification), [
    "PASS_WITH_SEMANTIC_DIFFERENCE",
    "PASS_WITH_SEMANTIC_DIFFERENCE",
    "PASS_WITH_SEMANTIC_DIFFERENCE",
    "PASS_WITH_SEMANTIC_DIFFERENCE",
  ]);
  assert.deepEqual(result.cases.slice(4).map(({ classification }) => classification), [
    "PASS_WITH_SEMANTIC_DIFFERENCE",
    "PASS_WITH_SEMANTIC_DIFFERENCE",
    "PASS_WITH_SEMANTIC_DIFFERENCE",
    "PASS_WITH_SEMANTIC_DIFFERENCE",
  ]);
  assert.equal(result.cases[3].oracles.every(({ status }) => status === "PASS"), true);
  assert.deepEqual(
    result.cases.slice(1, 4).map(({ checkpoints }) =>
      checkpoints.find(({ action }) => action?.observeSettledPath === true)?.result.path),
    ["/", "/signin", "/signin"],
  );
  assert.equal(result.cases[4].checkpoints.some(({ action }) => Object.hasOwn(action ?? {}, "value")), false);
  const serialized = JSON.stringify(result, jsonReplacer);
  assert.doesNotMatch(serialized, /"(?:stateToken|sessionStateToken)"/u);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("session-token"), false);
  assert.equal(serialized.includes("PRIVATE_SETTLE_QUERY"), false);
  assert.equal(serialized.includes("OPEN_ROUTE_CANARY_7f29a1"), false);
  assert.equal(serialized.includes("OPEN_FRAGMENT_CANARY_c841d0"), false);

  const retained = JSON.parse(serialized);
  assert.deepEqual(validateCandidate(retained), { valid: true, violations: [] });

  const impossibleSettle = structuredClone(retained);
  const settleCheckpoint = impossibleSettle.cases
    .flatMap(({ checkpoints }) => checkpoints)
    .find((checkpoint) => checkpoint.action?.op === "settle" && checkpoint.status === "passed");
  settleCheckpoint.result.outcome = "unsupported_work";
  assert.equal(validateCandidate(impossibleSettle).valid, false);

  const wrongOpenProfile = structuredClone(retained);
  const openCheckpoint = wrongOpenProfile.cases[4].checkpoints.find(
    (checkpoint) => checkpoint.action?.op === "openSession",
  );
  openCheckpoint.result.boundary = "uncontrolled";
  assert.equal(validateCandidate(wrongOpenProfile).valid, false);

  const leakedFullOpenUrl = structuredClone(retained);
  const leakedOpenCheckpoint = leakedFullOpenUrl.cases[0].checkpoints.find(
    (checkpoint) => checkpoint.action?.op === "openSession",
  );
  leakedOpenCheckpoint.result.url =
    "http://localhost:3000/signin?palette=OPEN_ROUTE_CANARY_7f29a1#OPEN_FRAGMENT_CANARY_c841d0";
  assert.equal(validateCandidate(leakedFullOpenUrl).valid, false);

  const nonCorpusOpenPath = structuredClone(retained);
  nonCorpusOpenPath.cases[0].checkpoints.find(
    (checkpoint) => checkpoint.action?.op === "openSession",
  ).result.path = "/private-user-route";
  assert.equal(validateCandidate(nonCorpusOpenPath).valid, false);

  const incompleteAudit = structuredClone(retained);
  const requestCheckpoint = incompleteAudit.cases
    .flatMap(({ checkpoints }) => checkpoints)
    .find((checkpoint) => checkpoint.action?.op === "requests");
  requestCheckpoint.result.complete = false;
  assert.equal(validateCandidate(incompleteAudit).valid, false);

  const nonCorpusSettlePath = structuredClone(retained);
  nonCorpusSettlePath.cases[1].checkpoints.find(
    ({ action }) => action?.observeSettledPath === true,
  ).result.path = "/private-user-route";
  assert.equal(validateCandidate(nonCorpusSettlePath).valid, false);

  const leakedFullSettleUrl = structuredClone(retained);
  leakedFullSettleUrl.cases[1].checkpoints.find(
    ({ action }) => action?.observeSettledPath === true,
  ).result.url = "http://localhost:3000/?opaque=PRIVATE_SETTLE_QUERY";
  assert.equal(validateCandidate(leakedFullSettleUrl).valid, false);
});

function fakeRuntime() {
  return {
    async openSession(url) {
      return fakeSession(url);
    },
    async close() {},
  };
}

function fakeSession(url) {
  let token = 0;
  let onboardingTitleReads = 0;
  const next = () => `token-${++token}`;
  const mutation = async () => ({ stateToken: next() });
  const finalUrl = new URL(url);
  if (finalUrl.pathname === "/personal") finalUrl.pathname = "/signin";
  const openedUrl = new URL(finalUrl);
  openedUrl.searchParams.set("palette", "OPEN_ROUTE_CANARY_7f29a1");
  openedUrl.hash = "OPEN_FRAGMENT_CANARY_c841d0";
  return {
    requestedUrl: url,
    url: openedUrl.href,
    boundary: "controlled_ready",
    clockMode: "controlled",
    profile: "controlled-web-session-v1",
    stateToken: next(),
    fill: mutation,
    focus: mutation,
    check: async () => ({ changed: true, checked: true, stateToken: next() }),
    async activate(selector) {
      if (selector === '[data-test="signup"]') finalUrl.pathname = "/signup";
      if (selector === '[data-test="signup-submit"]') finalUrl.pathname = "/signin";
      if (selector === '[data-test="signin-submit"]') finalUrl.pathname = "/";
      if (selector === '[data-test="sidenav-signout"]') finalUrl.pathname = "/signin";
      return mutation();
    },
    async settle() {
      const settledUrl = new URL(finalUrl);
      settledUrl.searchParams.set("opaque", "PRIVATE_SETTLE_QUERY");
      settledUrl.hash = "PRIVATE_SETTLE_FRAGMENT";
      return {
        outcome: "quiescent",
        stateToken: next(),
        unsupportedWork: [],
        url: settledUrl.href,
      };
    },
    async query(selector) {
      return { count: selector === '[data-test="list-skeleton"]' ? 0n : 1n, stateToken: next() };
    },
    async text(selector) {
      const values = {
        '[data-test="signup-title"]': "Sign Up",
        '[data-test="user-onboarding-dialog-content"]': "You're all set!",
        "#username-helper-text": "Username is required",
        "#password-helper-text": "Password must contain at least 4 characters Enter your password",
        "#firstName-helper-text": "First Name is required",
        "#lastName-helper-text": "Last Name is required",
        "#confirmPassword-helper-text": "Password does not match",
        '[data-test="signin-error"]': "Username or password is invalid",
      };
      let value = values[selector];
      if (selector === '[data-test="user-onboarding-dialog-title"]') {
        value = onboardingTitleReads++ === 0 ? "Create Bank Account" : "Finished";
      }
      return { value, stateToken: next() };
    },
    async extract() {
      return { rows: [{ fields: [{ name: "disabled", value: "" }] }], stateToken: next() };
    },
    async getCookies() {
      return {
        cookies: [{ name: "connect.sid", value: "secret", expiresUnixTimeNs: 1n }],
        sessionStateToken: "session-token",
      };
    },
    async requests() {
      return auditPage([
        requestRecord(1n, "signup-request", "POST", "/users"),
        requestRecord(2n, "bank-request", "POST", "/graphql"),
      ], next());
    },
    async evidence() {
      return auditPage([
        { seq: 1n, atVirtualNs: 0n, kind: "response_headers", requestId: "signup-request", status: 201 },
        { seq: 2n, atVirtualNs: 0n, kind: "response_headers", requestId: "bank-request", status: 200 },
      ], next(), { schemaVersion: 2 });
    },
    async close() {},
  };
}

function requestRecord(seq, requestId, method, path) {
  return {
    seq,
    requestId,
    method,
    url: { origin: "http://localhost:3001", path, queryKeys: [] },
    resourceKind: "fetch",
    mainFrame: false,
    headerNames: [],
    bodyBytes: 0n,
  };
}

function auditPage(records, stateToken, extra = {}) {
  const first = records[0]?.seq;
  const last = records.at(-1)?.seq;
  return {
    ...extra,
    records,
    ...(first === undefined ? {} : { firstRetainedSeq: first }),
    ...(last === undefined ? {} : { nextAfterSeq: last, latestSeq: last }),
    complete: true,
    hasMore: false,
    bounds: { maxRecords: 1_024, maxMetadataBytes: 1_048_576, maxPageItems: 256 },
    stateToken,
  };
}

function jsonResponse(results) {
  return { ok: true, status: 200, async json() { return { results }; } };
}
