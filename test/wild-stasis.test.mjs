import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  candidate,
  networkPolicyIdentity,
  settlePolicy,
  stasisLimits,
} from "../src/wild/config.mjs";
import {
  normalizeLinkIdentitySet,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "../src/wild/normalize.mjs";
import { stasisLiveNetworkPolicy } from "../src/wild/stasis-network.mjs";
import {
  assertHostedCandidate,
  projectSettlement,
  projectStasisError,
  runStasisObservation,
} from "../src/wild/stasis-observation.mjs";

const entry = Object.freeze({
  rank: 7,
  stratumId: "rank-1-1000",
  requestedUrl: "https://example.test/",
});

function policyAborts(policy, method, url) {
  const canonical = new URL(url).href;
  return policy.routes.some((route) =>
    route.match.method.toUpperCase() === method.toUpperCase() &&
    simpleGlobMatches(route.match.url.glob, canonical));
}

function simpleGlobMatches(pattern, value) {
  let patternIndex = 0;
  let valueIndex = 0;
  let starIndex = -1;
  let starValueIndex = 0;

  while (valueIndex < value.length) {
    if (pattern[patternIndex] === value[valueIndex] && pattern[patternIndex] !== "*") {
      patternIndex += 1;
      valueIndex += 1;
    } else if (pattern[patternIndex] === "*") {
      starIndex = patternIndex;
      patternIndex += 1;
      starValueIndex = valueIndex;
    } else if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      starValueIndex += 1;
      valueIndex = starValueIndex;
    } else {
      return false;
    }
  }
  while (pattern[patternIndex] === "*") patternIndex += 1;
  return patternIndex === pattern.length;
}

test("hosted-candidate attestation accepts only the exact frozen executable hash", async () => {
  const paths = [];
  const actual = await assertHostedCandidate("C:\\frozen\\stasis.exe", {
    hashExecutable: async (path) => {
      paths.push(path);
      return candidate.executableSha256;
    },
  });
  assert.equal(actual, candidate.executableSha256);
  assert.deepEqual(paths, ["C:\\frozen\\stasis.exe"]);

  await assert.rejects(
    assertHostedCandidate("C:\\wrong\\stasis.exe", {
      hashExecutable: async () => "0".repeat(64),
    }),
    /Hosted Stasis executable mismatch/u,
  );

  let launches = 0;
  await assert.rejects(
    runStasisObservation(entry, "C:\\wrong\\stasis.exe", {
      hashExecutable: async () => "0".repeat(64),
      launchRuntime: async () => {
        launches += 1;
        throw new Error("must not launch");
      },
    }),
    /Hosted Stasis executable mismatch/u,
  );
  assert.equal(launches, 0);
});

test("native live policy stays within the frozen runtime limit and orders bounded safety routes", () => {
  const policy = stasisLiveNetworkPolicy();
  assert.equal(policy.mode, "live");
  assert.equal(policy.routes.length, networkPolicyIdentity.routeCount);
  const encoded = JSON.stringify(policy);
  assert.equal(Buffer.byteLength(encoded, "utf8"), networkPolicyIdentity.encodedBytes);
  assert.equal(
    createHash("sha256").update(encoded, "utf8").digest("hex"),
    networkPolicyIdentity.sha256,
  );
  assert.equal(policy.routes.length <= 256, true);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.routes), true);

  const globalMethodRoutes = policy.routes.slice(0, 12);
  assert.deepEqual(
    [...new Set(globalMethodRoutes.map(({ match }) => match.method))],
    ["DELETE", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
  );
  assert.equal(
    globalMethodRoutes.every(({ match }) => ["http://*/*", "https://*/*"].includes(match.url.glob)),
    true,
  );
  assert.equal(policy.routes.slice(12).every(({ match }) => match.method === "GET"), true);
  for (const glob of [
    "http://10.*.*.*/*",
    "https://127.*.*.*/*",
    "http://localhost*/*",
    "https://[::1]/*",
  ]) {
    assert.equal(
      policy.routes.some(({ match, abort }) =>
        match.method === "GET" &&
        match.url.glob === glob &&
        abort.reason === "blocked_by_fixture"),
      true,
      `missing GET abort route for ${glob}`,
    );
  }

  for (const route of policy.routes) {
    assert.deepEqual(Object.keys(route.match.url), ["glob"]);
    const probe = route.match.url.glob.replaceAll("*", "stasisfixturewildcard");
    const parsed = new URL(probe);
    assert.equal(["http:", "https:"].includes(parsed.protocol), true);
    assert.equal(parsed.username, "");
    assert.equal(parsed.password, "");
    assert.equal(parsed.hash, "");
  }

  for (const [method, url, expected] of [
    ["GET", "http://10.1.2.3:8080/path?q=1", true],
    ["GET", "http://167838211/path", true],
    ["GET", "https://100.64.1.2/path", true],
    ["GET", "https://100.63.1.2/path", false],
    ["GET", "http://172.31.255.255/path", true],
    ["GET", "http://172.32.0.1/path", false],
    ["GET", "http://localhost:8080/path", true],
    ["GET", "http://[::]/path", true],
    ["GET", "https://[::1]/path", true],
    ["GET", "http://[::1]:8080/path", false],
    ["GET", "https://[fc00::1]/path", false],
    ["GET", "https://example.com/path", false],
    ["POST", "https://example.com/path", true],
    ["PROPFIND", "https://example.com/path", false],
  ]) {
    assert.equal(policyAborts(policy, method, url), expected, `${method} ${url}`);
  }
});

test("one fresh observation settles once, uses exact audit signatures, and closes cleanly", async () => {
  const calls = [];
  let openSignal;
  let requestPage = 0;
  const weakenedNetwork = { mode: "live", routes: [] };
  const session = {
    url: "https://example.test/committed?opaque=owner-secret#owner-fragment",
    stateToken: "open-token",
    async settle(token, policy, options) {
      calls.push("settle");
      assert.equal(token, "open-token");
      assert.equal(policy, settlePolicy);
      assert.equal(options.signal, openSignal);
      return quiescentSettlement();
    },
    async requests(options) {
      assert.equal(arguments.length, 1);
      calls.push("requests");
      assert.equal(options.limit, 256);
      assert.equal(options.signal, openSignal);
      requestPage += 1;
      if (requestPage === 1) {
        assert.equal(Object.hasOwn(options, "afterSeq"), false);
        return auditPage([
          { seq: 1n, requestId: "document", method: "GET" },
        ], { hasMore: true, nextAfterSeq: 1n });
      }
      assert.equal(options.afterSeq, 1n);
      return auditPage([
        { seq: 2n, requestId: "style", method: "GET" },
      ]);
    },
    async evidence(options) {
      assert.equal(arguments.length, 1);
      calls.push("evidence");
      assert.equal(options.limit, 256);
      assert.equal(options.signal, openSignal);
      assert.equal(Object.hasOwn(options, "afterSeq"), false);
      return auditPage([
        { seq: 1n, kind: "route_decided", requestId: "document", decision: "live" },
      ]);
    },
    async extract(plan, token, options) {
      assert.equal(options.signal, openSignal);
      if (plan.rootSelector === "title") {
        calls.push("extract-title");
        assert.equal(token, "settled-token");
        return {
          rows: [{ fields: [{ name: "title", value: "  Fixture\n title  " }] }],
          stateToken: "title-token",
        };
      }
      calls.push("extract-links");
      assert.equal(plan.rootSelector, "a[href]");
      assert.equal(token, "title-token");
      return {
        rows: [
          { fields: [{ name: "href", value: "https://example.test/z?opaque=z#fragment" }] },
          { fields: [{ name: "href", value: "https://example.test/a?first=1" }] },
          { fields: [{ name: "href", value: "https://example.test/a?second=2#duplicate" }] },
          { fields: [{ name: "href", value: "/relative-must-not-be-rebased" }] },
          { fields: [{ name: "href", value: "mailto:nobody@example.test" }] },
        ],
        stateToken: "links-token",
      };
    },
    async close(options) {
      calls.push("session-close");
      assert.deepEqual(options, { timeoutMs: 5_000 });
    },
    async pending() { assert.fail("pending is not an admitted progress primitive"); },
    async advanceToNext() { assert.fail("advanceToNext is not admitted"); },
    async navigate() { assert.fail("navigate is not admitted"); },
  };
  const runtime = {
    async openSession(url, options) {
      calls.push("open");
      assert.equal(url, entry.requestedUrl);
      assert.equal(options.profile, candidate.profile);
      assert.notEqual(options.network, weakenedNetwork);
      assert.equal(options.network.routes.length, networkPolicyIdentity.routeCount);
      openSignal = options.signal;
      assert.equal(openSignal instanceof AbortSignal, true);
      return session;
    },
    async close() {
      assert.fail("clean Session.close already terminates the owned process");
    },
  };
  let launches = 0;
  const result = await runStasisObservation(entry, "C:\\frozen\\stasis.exe", frozenDependencies({
    network: weakenedNetwork,
    launchRuntime: async (options) => {
      calls.push("launch");
      launches += 1;
      assert.deepEqual(options, {
        executablePath: "C:\\frozen\\stasis.exe",
        commandTimeoutMs: stasisLimits.commandTimeoutMs,
      });
      return runtime;
    },
  }));

  assert.equal(launches, 1);
  assert.deepEqual(calls, [
    "launch",
    "open",
    "settle",
    "requests",
    "requests",
    "evidence",
    "extract-title",
    "extract-links",
    "session-close",
  ]);
  assert.equal(result.status, "success");
  assert.equal(result.candidateExecutableSha256, candidate.executableSha256);
  assert.equal(
    result.openCommittedUrlIdentity,
    publicHttpUrlIdentity("https://example.test/committed?opaque=owner-secret"),
  );
  assert.equal(result.currentUrlObservable, false);
  assert.equal(Object.hasOwn(result, "openCommittedUrl"), false);
  assert.deepEqual(result.extraction.titleIdentity, normalizeTitleIdentity("Fixture title"));
  assert.deepEqual(result.extraction.linkIdentities, normalizeLinkIdentitySet([
    "https://example.test/z?opaque=z#fragment",
    "https://example.test/a?first=1",
    "https://example.test/a?second=2#duplicate",
  ]));
  assert.equal(result.audit.requests.some((record) => Object.hasOwn(record, "requestId")), false);
  assert.equal(result.audit.evidence.some((record) => Object.hasOwn(record, "requestId")), false);
  assert.equal(JSON.stringify(result).includes("owner-secret"), false);
  assert.deepEqual(result.cleanup, { status: "passed", mode: "graceful_session_close" });
});

test("complete audit rejects arbitrary non-GET and fixture-aborted GET observations", async (t) => {
  await t.test("unlisted non-GET method cannot become success", async () => {
    const result = await runPolicyScenario({
      requests: [{ seq: 1n, requestId: "custom", method: "PROPFIND" }],
      evidence: [{ seq: 1n, kind: "route_decided", requestId: "custom", decision: "live" }],
    });
    assert.equal(result.status, "policy_or_safety_rejected");
    assert.equal(result.code, "non_read_only_request");
    assert.deepEqual(result.policyRejection, {
      code: "non_read_only_request",
      requestCount: 1,
    });
  });

  await t.test("GET fixture abort is retained as a literal-private safety terminal", async () => {
    const result = await runPolicyScenario({
      requests: [{ seq: 1n, requestId: "private", method: "GET" }],
      evidence: [
        { seq: 1n, kind: "route_decided", requestId: "private", decision: "fixture_abort" },
      ],
    });
    assert.equal(result.status, "policy_or_safety_rejected");
    assert.equal(result.code, "literal_private_target_aborted");
    assert.deepEqual(result.policyRejection, {
      code: "literal_private_target_aborted",
      abortCount: 1,
    });
  });
});

test("incomplete audit fails closed before extraction", async () => {
  const result = await runPolicyScenario({
    requests: [{ seq: 2n, requestId: "retained", method: "GET" }],
    evidence: [],
    requestPage: auditPage([], { complete: false, droppedThroughSeq: 1n }),
  });
  assert.equal(result.status, "policy_or_safety_rejected");
  assert.equal(result.code, "stasis_audit_incomplete");
  assert.equal(result.audit.complete, false);
});

test("operation errors use one abrupt fail-stop and sanitize diagnostics", async () => {
  let sessionCloses = 0;
  let runtimeCloses = 0;
  const secret = "sensitive stderr text";
  const session = {
    url: "https://example.test/committed",
    stateToken: "open-token",
    async settle() {
      const error = new Error("sensitive message text");
      error.name = "StasisProtocolError";
      error.code = "navigation_transport_failure";
      error.fatal = true;
      error.stateEffect = "indeterminate";
      error.stderrTail = secret;
      throw error;
    },
    async close() { sessionCloses += 1; },
  };
  const runtime = {
    async openSession() { return session; },
    async close() { runtimeCloses += 1; },
  };
  const result = await runStasisObservation(entry, "C:\\frozen\\stasis.exe", frozenDependencies({
    launchRuntime: async () => runtime,
  }));
  assert.equal(result.status, "error");
  assert.equal(result.code, "stasis_operation_failed");
  assert.equal(result.error.code, "navigation_transport_failure");
  assert.equal(result.error.messageOmitted, true);
  assert.equal(result.error.stderrTailOmitted, true);
  assert.equal(result.error.stderrTailBytes, Buffer.byteLength(secret));
  assert.equal(sessionCloses, 0);
  assert.equal(runtimeCloses, 1);
  assert.deepEqual(result.cleanup, { status: "passed", mode: "fail_stop_runtime_close" });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("failed fail-stop preserves the typed operation as the first terminal", async () => {
  let sessionCloses = 0;
  let runtimeCloses = 0;
  const session = {
    url: "https://example.test/committed",
    stateToken: "open-token",
    async settle() {
      const error = stasisError("navigation_transport_failure", "operation secret");
      error.name = "StasisProtocolError";
      throw error;
    },
    async close() { sessionCloses += 1; },
  };
  const result = await runStasisObservation(entry, "C:\\frozen\\stasis.exe", frozenDependencies({
    launchRuntime: async () => ({
      async openSession() { return session; },
      async close() {
        runtimeCloses += 1;
        throw stasisError("runtime_close_failed", "cleanup secret");
      },
    }),
  }));
  assert.equal(sessionCloses, 0);
  assert.equal(runtimeCloses, 1);
  assert.equal(result.status, "error");
  assert.equal(result.code, "stasis_operation_failed");
  assert.equal(result.error.code, "navigation_transport_failure");
  assert.equal(result.cleanup.status, "failed");
  assert.equal(result.cleanup.failStopError.code, "runtime_close_failed");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("operation secret"), false);
  assert.equal(serialized.includes("cleanup secret"), false);
});

test("failed graceful close falls back once and a failed fail-stop cannot be green", async (t) => {
  await t.test("successful abrupt fallback is retained", async () => {
    let runtimeCloses = 0;
    const { session } = crawlableSession({
      close: async () => {
        throw stasisError("session_close_failed", "graceful secret");
      },
    });
    const result = await runStasisObservation(entry, "C:\\frozen\\stasis.exe", frozenDependencies({
      launchRuntime: async () => ({
        async openSession() { return session; },
        async close() { runtimeCloses += 1; },
      }),
    }));
    assert.equal(result.status, "success");
    assert.equal(runtimeCloses, 1);
    assert.equal(result.cleanup.status, "passed");
    assert.equal(result.cleanup.mode, "fail_stop_runtime_close");
    assert.equal(result.cleanup.gracefulCloseError.code, "session_close_failed");
    assert.equal(JSON.stringify(result).includes("graceful secret"), false);
  });

  await t.test("failed abrupt fallback overrides the prior success", async () => {
    let runtimeCloses = 0;
    const { session } = crawlableSession({
      close: async () => {
        throw stasisError("session_close_failed", "graceful secret");
      },
    });
    const result = await runStasisObservation(entry, "C:\\frozen\\stasis.exe", frozenDependencies({
      launchRuntime: async () => ({
        async openSession() { return session; },
        async close() {
          runtimeCloses += 1;
          throw stasisError("runtime_close_failed", "fail-stop secret");
        },
      }),
    }));
    assert.equal(runtimeCloses, 1);
    assert.equal(result.status, "error");
    assert.equal(result.code, "stasis_cleanup_failed");
    assert.deepEqual(result.priorTerminal, { status: "success", code: "extracted" });
    assert.equal(result.error.code, "stasis_cleanup_failed");
    assert.equal(result.cleanup.status, "failed");
    assert.equal(result.cleanup.failStopError.code, "runtime_close_failed");
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("graceful secret"), false);
    assert.equal(serialized.includes("fail-stop secret"), false);
  });
});

test("settlement and error projections are bounded and value-redacted", () => {
  const unsupportedWork = Array.from({ length: 35 }, (_, index) => ({
    kind: index === 0 ? "worker" : "rendering",
    count: BigInt(index + 1),
    reason: index === 0 ? "unsupported_worker" : "unsupported_rendering",
    timeSurface: "controlled",
  }));
  const persistentWork = Array.from({ length: 34 }, (_, index) => ({
    kind: "interval",
    count: index + 1,
    reason: "persistent_interval",
  }));
  const projected = projectSettlement({
    outcome: "unsupported_work",
    unsupportedWork,
    persistentWork,
    externalIo: [{}, {}],
    processed: {
      controlTurns: 1n,
      tasks: 2n,
      microtasks: 3n,
      renderingOpportunities: 4n,
      mutations: 5n,
    },
  });
  assert.equal(projected.unsupportedWork.length, 32);
  assert.equal(projected.unsupportedWorkOmitted, 3);
  assert.equal(projected.persistentWork.length, 32);
  assert.equal(projected.persistentWorkOmitted, 2);
  assert.equal(projected.unsupportedWork[0].count, "1");
  assert.equal(projected.externalIoCount, 2);
  assert.deepEqual(projected.processed, {
    controlTurns: "1",
    tasks: "2",
    microtasks: "3",
    renderingOpportunities: "4",
    mutations: "5",
  });

  const error = stasisError("navigation_transport_failure", "private message and stderr");
  const errorProjection = projectStasisError(error);
  assert.equal(errorProjection.code, "navigation_transport_failure");
  assert.equal(errorProjection.messageOmitted, true);
  assert.equal(errorProjection.stderrTailOmitted, true);
  assert.equal(JSON.stringify(errorProjection).includes("private message"), false);

  const arbitraryProjection = projectStasisError(
    stasisError("C:\\Users\\person\\opaque-code", "private"),
  );
  assert.equal(arbitraryProjection.code, "unclassified_error");
  assert.equal(JSON.stringify(arbitraryProjection).includes("person"), false);
  assert.equal(
    projectStasisError(stasisError("unsupported_profile_method", "private")).code,
    "unsupported_profile_method",
  );
});

async function runPolicyScenario({ requests, evidence, requestPage }) {
  let settleCalls = 0;
  let extractCalls = 0;
  let sessionCloses = 0;
  const session = {
    url: "https://example.test/committed",
    stateToken: "open-token",
    async settle() {
      settleCalls += 1;
      return quiescentSettlement();
    },
    async requests() {
      return requestPage ?? auditPage(requests);
    },
    async evidence() {
      return auditPage(evidence);
    },
    async extract() {
      extractCalls += 1;
      throw new Error("extraction must not run after a policy terminal");
    },
    async close() { sessionCloses += 1; },
  };
  let runtimeCloses = 0;
  const result = await runStasisObservation(entry, "C:\\frozen\\stasis.exe", frozenDependencies({
    launchRuntime: async () => ({
      async openSession() { return session; },
      async close() { runtimeCloses += 1; },
    }),
  }));
  assert.equal(settleCalls, 1);
  assert.equal(extractCalls, 0);
  assert.equal(sessionCloses, 1);
  assert.equal(runtimeCloses, 0);
  return result;
}

function crawlableSession({ close = async () => undefined } = {}) {
  return {
    session: {
      url: "https://example.test/committed",
      stateToken: "open-token",
      async settle() { return quiescentSettlement(); },
      async requests() {
        return auditPage([{ seq: 1n, requestId: "document", method: "GET" }]);
      },
      async evidence() {
        return auditPage([
          { seq: 1n, kind: "route_decided", requestId: "document", decision: "live" },
        ]);
      },
      async extract(plan) {
        return plan.rootSelector === "title"
          ? { rows: [{ fields: [{ name: "title", value: "title" }] }], stateToken: "title-token" }
          : { rows: [], stateToken: "links-token" };
      },
      close,
    },
  };
}

function quiescentSettlement() {
  return {
    outcome: "quiescent",
    stateToken: "settled-token",
    unsupportedWork: [],
    persistentWork: [],
    externalIo: [],
    processed: {
      controlTurns: 1n,
      tasks: 1n,
      microtasks: 1n,
      renderingOpportunities: 1n,
      mutations: 1n,
    },
  };
}

function auditPage(records, overrides = {}) {
  return {
    records,
    complete: true,
    hasMore: false,
    ...overrides,
  };
}

function stasisError(code, secret) {
  const error = new Error(secret);
  error.name = "StasisProcessError";
  error.code = code;
  error.stderrTail = secret;
  return error;
}

function frozenDependencies(dependencies) {
  return {
    hashExecutable: async () => candidate.executableSha256,
    ...dependencies,
  };
}
