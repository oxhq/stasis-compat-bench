import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { isDeepStrictEqual } from "node:util";

import {
  assertAuthoritativePostSupportCandidate,
  assertCandidateIdentity,
  postSupportExecutablePath,
  postSupportProfile,
} from "./candidate-identity.mjs";
import { assertPostSupportArtifactPrivacy } from "./artifact-privacy.mjs";

export const postSupportTypedTerminalSchema =
  "stasis-post-support-typed-terminal-minimizers-v1";
export const frozenPublicWildArtifactIndexSha256 =
  "76e68ed83f3386186adbbd93e73ee2ec4a1fdc9c3977954501143342799c6e89";

const network = Object.freeze({ mode: "live", routes: Object.freeze([]) });
const settlePolicy = Object.freeze({
  persistentWork: "report",
  maxVirtualTimeNs: 5_000_000_000n,
  maxControlTurns: 10_000n,
  wallIoTimeoutNs: 5_000_000_000n,
});
const extractionPlan = Object.freeze({
  rootSelector: "a[href]",
  fields: Object.freeze([
    Object.freeze({ name: "href", selector: "", read: "resolved_url", attribute: "href" }),
  ]),
});
const authoritativeResults = new WeakSet();
const defaultDependencies = Object.freeze({});

// The native controlled-cookie policy detects the Partitioned attribute before
// cookie parsing and jar mutation. A Lax session-cookie control stays valid on
// exact loopback HTTP, so the treatment's sole wire delta is `; Partitioned`.
const finalResponseBody = "<!doctype html><meta charset=utf-8><title>final response control</title>";
const finalResponseControlHeader =
  "stasis_partitioned_final=fixture; Path=/; SameSite=Lax";
const finalResponseTreatmentHeader = `${finalResponseControlHeader}; Partitioned`;
const redirectBody = "redirecting";
const redirectFinalBody = "<!doctype html><meta charset=utf-8><title>redirect final</title>";
const redirectControlHeader =
  "stasis_partitioned_redirect=fixture; Path=/; SameSite=Lax";
const redirectTreatmentHeader = `${redirectControlHeader}; Partitioned`;

const fixtureDefinitions = deepFreeze({
  finalResponse: {
    control: responseDefinition(200, finalResponseBody, {
      "set-cookie": finalResponseControlHeader,
    }),
    treatment: responseDefinition(200, finalResponseBody, {
      "set-cookie": finalResponseTreatmentHeader,
    }),
  },
  redirectHop: {
    control: [
      responseDefinition(302, redirectBody, {
        location: "/redirect-final",
        "set-cookie": redirectControlHeader,
      }),
      responseDefinition(200, redirectFinalBody),
    ],
    treatment: [
      responseDefinition(302, redirectBody, {
        location: "/redirect-final",
        "set-cookie": redirectTreatmentHeader,
      }),
      responseDefinition(200, redirectFinalBody),
    ],
  },
  staticAnchors: {
    control: responseDefinition(200, staticAnchorDocument(128)),
    treatment: responseDefinition(200, staticAnchorDocument(129)),
  },
  synchronousDomAnchors: {
    control: responseDefinition(200, synchronousDomAnchorDocument(128)),
    treatment: responseDefinition(200, synchronousDomAnchorDocument(129)),
  },
});

export const typedMinimizerFixtureBindings = deepFreeze(Object.fromEntries(
  Object.entries(fixtureDefinitions).map(([id, variants]) => [
    id,
    {
      controlSha256: fixtureSha256(variants.control),
      treatmentSha256: fixtureSha256(variants.treatment),
    },
  ]),
));

assertPartitionedOnlyDelta(finalResponseControlHeader, finalResponseTreatmentHeader);
assertPartitionedOnlyDelta(redirectControlHeader, redirectTreatmentHeader);
assertDistinctFixtureBindings(typedMinimizerFixtureBindings);

export async function runTypedTerminalMinimizers(
  verifiedCandidate,
  dependencies = defaultDependencies,
) {
  const canMintAuthority = dependencies === defaultDependencies;
  if (canMintAuthority) assertAuthoritativePostSupportCandidate(verifiedCandidate);
  const candidate = assertVerifiedCandidate(verifiedCandidate);
  const executablePath = postSupportExecutablePath(verifiedCandidate);
  const launch = dependencies.launch ?? verifiedCandidate.sdk.launch;
  const createFinalResponseFixture = dependencies.createFinalResponseFixture ??
    createFinalResponsePartitionedFixture;
  const createRedirectHopFixture = dependencies.createRedirectHopFixture ??
    createRedirectHopPartitionedFixture;
  const createStaticAnchorFixture = dependencies.createStaticAnchorFixture ??
    createStaticAnchorLimitFixture;
  const createSynchronousDomAnchorFixture = dependencies.createSynchronousDomAnchorFixture ??
    createSynchronousDomAnchorLimitFixture;

  const scenarios = [];
  scenarios.push(await runFinalResponsePartitionedMinimizer({
    executablePath,
    launch,
    createFixture: createFinalResponseFixture,
  }));
  scenarios.push(await runRedirectHopPartitionedMinimizer({
    executablePath,
    launch,
    createFixture: createRedirectHopFixture,
  }));
  scenarios.push(await runStaticAnchorLimitMinimizer({
    executablePath,
    launch,
    createFixture: createStaticAnchorFixture,
  }));
  scenarios.push(await runSynchronousDomAnchorLimitMinimizer({
    executablePath,
    launch,
    createFixture: createSynchronousDomAnchorFixture,
  }));

  const result = assertTypedTerminalMinimizerResult({
    schema: postSupportTypedTerminalSchema,
    claimBoundary:
      "local causal typed-terminal proof bound to frozen organic evidence; not a new corpus prevalence claim",
    executionAuthority: canMintAuthority
      ? "default_verified_candidate_uninjected"
      : "diagnostic_only",
    candidate,
    wildEvidenceBinding: {
      artifactIndexSha256: frozenPublicWildArtifactIndexSha256,
    },
    rules: {
      appCodeChanges: false,
      profile: postSupportProfile,
      freshNativeProcessPerVariant: true,
      processCount: 8,
      retries: 0,
      sleeps: false,
      polling: false,
      fallback: false,
      injectedDependencies: !canMintAuthority,
    },
    scenarios,
  });
  deepFreeze(result);
  if (canMintAuthority) authoritativeResults.add(result);
  return result;
}

export async function runFinalResponsePartitionedMinimizer({
  executablePath,
  launch,
  createFixture = createFinalResponsePartitionedFixture,
}) {
  const fixture = await createFixture();
  assertFixtureBinding(fixture, typedMinimizerFixtureBindings.finalResponse);
  try {
    const control = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.controlUrl,
      operationPhase: "settle",
      operation: successfulSettlement,
    });
    const treatment = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.treatmentUrl,
      operationPhase: "settle",
      operation: successfulSettlement,
      expectedError: {
        phase: "open_session",
        code: "unsupported_partitioned_cookie",
        fatal: false,
        stateEffect: "partial",
      },
    });
    const evidence = fixture.facts();
    assertExactEvidence(evidence, { controlRequests: 1, treatmentRequests: 1 });
    return {
      id: "partitioned-final-response",
      family: "storage",
      construction: "final_response_set_cookie",
      causalDelta: "one Partitioned response attribute",
      causalContract: {
        controlPartitionedAttribute: false,
        treatmentPartitionedAttribute: true,
        rejectionBoundary: "before_cookie_jar_mutation",
      },
      processCount: 2,
      fixtureBinding: typedMinimizerFixtureBindings.finalResponse,
      control,
      treatment,
      evidence,
    };
  } finally {
    await fixture.close();
  }
}

export async function runRedirectHopPartitionedMinimizer({
  executablePath,
  launch,
  createFixture = createRedirectHopPartitionedFixture,
}) {
  const fixture = await createFixture();
  assertFixtureBinding(fixture, typedMinimizerFixtureBindings.redirectHop);
  try {
    const control = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.controlUrl,
      operationPhase: "settle",
      operation: successfulSettlement,
    });
    const treatment = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.treatmentUrl,
      operationPhase: "settle",
      operation: successfulSettlement,
      expectedError: {
        phase: "open_session",
        code: "unsupported_partitioned_cookie",
        fatal: false,
        stateEffect: "partial",
      },
    });
    const evidence = fixture.facts();
    assertExactEvidence(evidence, {
      controlStartRequests: 1,
      controlFinalRequests: 1,
      treatmentStartRequests: 1,
      treatmentFinalRequests: 0,
    });
    return {
      id: "partitioned-redirect-hop",
      family: "storage",
      construction: "redirect_hop_set_cookie",
      causalDelta: "one Partitioned response attribute",
      causalContract: {
        controlPartitionedAttribute: false,
        treatmentPartitionedAttribute: true,
        rejectionBoundary: "before_cookie_jar_mutation",
      },
      processCount: 2,
      fixtureBinding: typedMinimizerFixtureBindings.redirectHop,
      control,
      treatment,
      evidence,
    };
  } finally {
    await fixture.close();
  }
}

export async function runStaticAnchorLimitMinimizer({
  executablePath,
  launch,
  createFixture = createStaticAnchorLimitFixture,
}) {
  const fixture = await createFixture();
  assertFixtureBinding(fixture, typedMinimizerFixtureBindings.staticAnchors);
  try {
    const control = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.controlUrl,
      operationPhase: "extract",
      operation: async (session, stateToken) => {
        const result = await session.extract(extractionPlan, stateToken);
        return { observedMatches: result.rows.length };
      },
      expectedSuccess: { observedMatches: 128 },
    });
    const treatment = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.treatmentUrl,
      operationPhase: "extract",
      operation: async (session, stateToken) => {
        const result = await session.extract(extractionPlan, stateToken);
        return { observedMatches: result.rows.length };
      },
      expectedError: {
        phase: "extract",
        code: "automation_match_limit_exceeded",
        fatal: false,
        stateEffect: "none",
      },
    });
    const evidence = fixture.facts();
    assertExactEvidence(evidence, { controlRequests: 1, treatmentRequests: 1 });
    return {
      id: "static-anchor-match-limit",
      family: "extraction_limit",
      construction: "parser_inserted_static_anchors_extract",
      causalDelta: "one additional static anchor match",
      causalContract: {
        publicMaximumMatches: 128,
        controlMatches: 128,
        treatmentMatches: 129,
      },
      processCount: 2,
      fixtureBinding: typedMinimizerFixtureBindings.staticAnchors,
      control,
      treatment,
      evidence,
    };
  } finally {
    await fixture.close();
  }
}

export async function runSynchronousDomAnchorLimitMinimizer({
  executablePath,
  launch,
  createFixture = createSynchronousDomAnchorLimitFixture,
}) {
  const fixture = await createFixture();
  assertFixtureBinding(fixture, typedMinimizerFixtureBindings.synchronousDomAnchors);
  try {
    const control = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.controlUrl,
      operationPhase: "query",
      operation: async (session, stateToken) => {
        const result = await session.query("a[href]", stateToken);
        return { observedMatches: exactNonnegativeInteger(result.count, "query count") };
      },
      expectedSuccess: { observedMatches: 128 },
    });
    const treatment = await runFreshVariant({
      executablePath,
      launch,
      requestedUrl: fixture.treatmentUrl,
      operationPhase: "query",
      operation: async (session, stateToken) => {
        const result = await session.query("a[href]", stateToken);
        return { observedMatches: exactNonnegativeInteger(result.count, "query count") };
      },
      expectedError: {
        phase: "query",
        code: "automation_match_limit_exceeded",
        fatal: false,
        stateEffect: "none",
      },
    });
    const evidence = fixture.facts();
    assertExactEvidence(evidence, { controlRequests: 1, treatmentRequests: 1 });
    return {
      id: "synchronous-dom-anchor-match-limit",
      family: "extraction_limit",
      construction: "script_created_anchors_query",
      causalDelta: "one additional synchronous DOM anchor match",
      causalContract: {
        publicMaximumMatches: 128,
        controlMatches: 128,
        treatmentMatches: 129,
      },
      processCount: 2,
      fixtureBinding: typedMinimizerFixtureBindings.synchronousDomAnchors,
      control,
      treatment,
      evidence,
    };
  } finally {
    await fixture.close();
  }
}

export async function createFinalResponsePartitionedFixture() {
  const facts = { controlRequests: 0, treatmentRequests: 0 };
  const server = await startLoopbackServer((request, response) => {
    if (request.path === "/control") {
      facts.controlRequests += 1;
      return sendDefinition(response, fixtureDefinitions.finalResponse.control);
    }
    if (request.path === "/treatment") {
      facts.treatmentRequests += 1;
      return sendDefinition(response, fixtureDefinitions.finalResponse.treatment);
    }
    return sendNotFound(response);
  });
  return fixtureValue(server, typedMinimizerFixtureBindings.finalResponse, facts, {
    controlUrl: `${server.origin}/control`,
    treatmentUrl: `${server.origin}/treatment`,
  });
}

export async function createRedirectHopPartitionedFixture() {
  const facts = {
    controlStartRequests: 0,
    controlFinalRequests: 0,
    treatmentStartRequests: 0,
    treatmentFinalRequests: 0,
  };
  const server = await startLoopbackServer((request, response) => {
    if (request.path === "/control") {
      facts.controlStartRequests += 1;
      return sendDefinition(response, fixtureDefinitions.redirectHop.control[0]);
    }
    if (request.path === "/control-final" || request.path === "/redirect-final") {
      const referer = typeof request.headers.referer === "string" ? request.headers.referer : "";
      if (referer.endsWith("/treatment")) facts.treatmentFinalRequests += 1;
      else facts.controlFinalRequests += 1;
      return sendDefinition(response, fixtureDefinitions.redirectHop.control[1]);
    }
    if (request.path === "/treatment") {
      facts.treatmentStartRequests += 1;
      return sendDefinition(response, fixtureDefinitions.redirectHop.treatment[0]);
    }
    return sendNotFound(response);
  });
  return fixtureValue(server, typedMinimizerFixtureBindings.redirectHop, facts, {
    controlUrl: `${server.origin}/control`,
    treatmentUrl: `${server.origin}/treatment`,
  });
}

export async function createStaticAnchorLimitFixture() {
  return createTwoVariantDocumentFixture(
    fixtureDefinitions.staticAnchors,
    typedMinimizerFixtureBindings.staticAnchors,
  );
}

export async function createSynchronousDomAnchorLimitFixture() {
  return createTwoVariantDocumentFixture(
    fixtureDefinitions.synchronousDomAnchors,
    typedMinimizerFixtureBindings.synchronousDomAnchors,
  );
}

export function assertTypedTerminalMinimizerResult(result) {
  const candidate = assertCandidateIdentity(result?.candidate);
  const executionAuthority = result?.executionAuthority;
  const injectedDependencies = executionAuthority === "diagnostic_only";
  const expectedRules = {
    appCodeChanges: false,
    profile: postSupportProfile,
    freshNativeProcessPerVariant: true,
    processCount: 8,
    retries: 0,
    sleeps: false,
    polling: false,
    fallback: false,
    injectedDependencies,
  };
  if (
    result?.schema !== postSupportTypedTerminalSchema ||
    result?.claimBoundary !==
      "local causal typed-terminal proof bound to frozen organic evidence; not a new corpus prevalence claim" ||
    !["default_verified_candidate_uninjected", "diagnostic_only"].includes(
      executionAuthority,
    ) ||
    candidate.profile !== postSupportProfile ||
    !isDeepStrictEqual(result?.wildEvidenceBinding, {
      artifactIndexSha256: frozenPublicWildArtifactIndexSha256,
    }) ||
    !isDeepStrictEqual(result?.rules, expectedRules) ||
    !sameKeys(result, [
      "schema",
      "claimBoundary",
      "executionAuthority",
      "candidate",
      "wildEvidenceBinding",
      "rules",
      "scenarios",
    ]) ||
    !Array.isArray(result?.scenarios) ||
    result.scenarios.length !== 4
  ) {
    throw new TypeError("Invalid typed-terminal minimizer result envelope");
  }

  assertScenario(result.scenarios[0], {
    id: "partitioned-final-response",
    family: "storage",
    construction: "final_response_set_cookie",
    causalDelta: "one Partitioned response attribute",
    causalContract: {
      controlPartitionedAttribute: false,
      treatmentPartitionedAttribute: true,
      rejectionBoundary: "before_cookie_jar_mutation",
    },
    binding: typedMinimizerFixtureBindings.finalResponse,
    controlPhase: "settle",
    treatment: {
      phase: "open_session",
      code: "unsupported_partitioned_cookie",
      fatal: false,
      stateEffect: "partial",
    },
    evidence: { controlRequests: 1, treatmentRequests: 1 },
  });
  assertScenario(result.scenarios[1], {
    id: "partitioned-redirect-hop",
    family: "storage",
    construction: "redirect_hop_set_cookie",
    causalDelta: "one Partitioned response attribute",
    causalContract: {
      controlPartitionedAttribute: false,
      treatmentPartitionedAttribute: true,
      rejectionBoundary: "before_cookie_jar_mutation",
    },
    binding: typedMinimizerFixtureBindings.redirectHop,
    controlPhase: "settle",
    treatment: {
      phase: "open_session",
      code: "unsupported_partitioned_cookie",
      fatal: false,
      stateEffect: "partial",
    },
    evidence: {
      controlStartRequests: 1,
      controlFinalRequests: 1,
      treatmentStartRequests: 1,
      treatmentFinalRequests: 0,
    },
  });
  assertScenario(result.scenarios[2], {
    id: "static-anchor-match-limit",
    family: "extraction_limit",
    construction: "parser_inserted_static_anchors_extract",
    causalDelta: "one additional static anchor match",
    causalContract: {
      publicMaximumMatches: 128,
      controlMatches: 128,
      treatmentMatches: 129,
    },
    binding: typedMinimizerFixtureBindings.staticAnchors,
    controlPhase: "extract",
    observedMatches: 128,
    treatment: {
      phase: "extract",
      code: "automation_match_limit_exceeded",
      fatal: false,
      stateEffect: "none",
    },
    evidence: { controlRequests: 1, treatmentRequests: 1 },
  });
  assertScenario(result.scenarios[3], {
    id: "synchronous-dom-anchor-match-limit",
    family: "extraction_limit",
    construction: "script_created_anchors_query",
    causalDelta: "one additional synchronous DOM anchor match",
    causalContract: {
      publicMaximumMatches: 128,
      controlMatches: 128,
      treatmentMatches: 129,
    },
    binding: typedMinimizerFixtureBindings.synchronousDomAnchors,
    controlPhase: "query",
    observedMatches: 128,
    treatment: {
      phase: "query",
      code: "automation_match_limit_exceeded",
      fatal: false,
      stateEffect: "none",
    },
    evidence: { controlRequests: 1, treatmentRequests: 1 },
  });
  assertPostSupportArtifactPrivacy(result);
  return result;
}

export function assertAuthoritativeTypedTerminalMinimizerResult(result) {
  assertTypedTerminalMinimizerResult(result);
  if (!authoritativeResults.has(result)) {
    throw new Error(
      "Typed-terminal authority requires a fresh direct in-process minimizer run",
    );
  }
  return result;
}

async function runFreshVariant({
  executablePath,
  launch,
  requestedUrl,
  operationPhase,
  operation,
  expectedSuccess = {},
  expectedError,
}) {
  let runtime = null;
  let session = null;
  let phase = "runtime_launch";
  let terminal;
  let cleanup;
  let runtimeCloseAttempted = false;
  try {
    runtime = await launch({ executablePath, commandTimeoutMs: 30_000 });
    phase = "open_session";
    session = await runtime.openSession(requestedUrl, {
      profile: postSupportProfile,
      network,
    });
    phase = "settle";
    const settled = await settle(session);
    phase = operationPhase;
    const observation = await operation(session, settled.stateToken, settled);
    if (expectedError !== undefined) {
      throw new Error(`Expected ${expectedError.code} at ${expectedError.phase}`);
    }
    if (!isDeepStrictEqual(observation, expectedSuccess)) {
      throw new Error(`Typed-terminal control produced unexpected ${operationPhase} evidence`);
    }
    terminal = {
      kind: "success",
      phase: operationPhase,
      code: "completed",
      fatal: null,
      stateEffect: null,
      settleOutcome: settled.outcome,
      ...observation,
    };
    await session.close();
    runtimeCloseAttempted = true;
    await runtime.close();
    cleanup = { status: "passed", mode: "graceful_session_close_then_runtime_close" };
  } catch (error) {
    const projected = projectTypedError(error, phase);
    if (runtime !== null && !runtimeCloseAttempted) {
      try {
        runtimeCloseAttempted = true;
        await runtime.close();
        cleanup = { status: "passed", mode: "fail_stop_runtime_close" };
      } catch {
        throw new Error("Typed-terminal fail-stop cleanup failed");
      }
    } else if (runtimeCloseAttempted) {
      throw new Error("Typed-terminal runtime cleanup failed");
    }
    if (expectedError === undefined || !isDeepStrictEqual(projected, {
      name: "StasisProtocolError",
      ...expectedError,
    })) {
      throw new Error(
        `Typed-terminal variant produced unexpected ${projected.code} at ${projected.phase}`,
      );
    }
    terminal = { kind: "error", ...projected };
  }
  if (cleanup?.status !== "passed") {
    throw new Error("Typed-terminal variant lacks exact passing cleanup evidence");
  }
  return { status: "passed", terminal, cleanup };
}

async function settle(session) {
  const result = await session.settle(session.stateToken, settlePolicy);
  if (!["quiescent", "quiescent_with_persistent_work"].includes(result?.outcome)) {
    throw new Error("Typed-terminal fixture did not reach a successful settlement outcome");
  }
  return result;
}

function successfulSettlement() {
  return {};
}

function projectTypedError(error, phase) {
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    phase,
    code: typeof error?.code === "string" ? error.code : "unclassified_error",
    fatal: typeof error?.fatal === "boolean" ? error.fatal : null,
    stateEffect: typeof error?.stateEffect === "string" ? error.stateEffect : null,
  };
}

async function createTwoVariantDocumentFixture(definitions, binding) {
  const facts = { controlRequests: 0, treatmentRequests: 0 };
  const server = await startLoopbackServer((request, response) => {
    if (request.path === "/control") {
      facts.controlRequests += 1;
      return sendDefinition(response, definitions.control);
    }
    if (request.path === "/treatment") {
      facts.treatmentRequests += 1;
      return sendDefinition(response, definitions.treatment);
    }
    return sendNotFound(response);
  });
  return fixtureValue(server, binding, facts, {
    controlUrl: `${server.origin}/control`,
    treatmentUrl: `${server.origin}/treatment`,
  });
}

async function startLoopbackServer(handler) {
  const server = createServer((incoming, response) => {
    const request = {
      method: incoming.method ?? "UNKNOWN",
      path: new URL(incoming.url ?? "/", "http://fixture.invalid").pathname,
      headers: incoming.headers,
    };
    if (request.method !== "GET") return send(response, 405, "method not allowed");
    handler(request, response);
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== "127.0.0.1") {
    await closeServer(server);
    throw new Error("Typed-terminal fixture did not bind exact IPv4 loopback");
  }
  let closePromise;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => {
      closePromise ??= closeServer(server);
      return closePromise;
    },
  };
}

function fixtureValue(server, binding, facts, urls) {
  return {
    ...urls,
    binding,
    facts: () => ({ ...facts }),
    close: server.close,
  };
}

function responseDefinition(status, body, additionalHeaders = {}) {
  return {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      ...additionalHeaders,
    },
    body,
  };
}

function sendDefinition(response, definition) {
  response.writeHead(definition.status, definition.headers);
  response.end(definition.body);
}

function sendNotFound(response) {
  send(response, 404, "not found");
}

function send(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}

function staticAnchorDocument(count) {
  const anchors = Array.from(
    { length: count },
    (_unused, index) => `<a href="/static-${index}">static-${index}</a>`,
  ).join("");
  return `<!doctype html><meta charset=utf-8><title>static ${count}</title>${anchors}`;
}

function synchronousDomAnchorDocument(count) {
  return `<!doctype html><meta charset=utf-8><title>script ${count}</title><body><script>\n` +
    `var root = document.body;\n` +
    `for (var index = 0; index < ${count}; index += 1) {\n` +
    `  var anchor = document.createElement("a");\n` +
    `  anchor.setAttribute("href", "/script-" + index);\n` +
    `  anchor.textContent = "script-" + index;\n` +
    `  root.appendChild(anchor);\n` +
    `}\n` +
    `</script></body>`;
}

function fixtureSha256(definition) {
  return createHash("sha256")
    .update("stasis-post-support-typed-minimizer-fixture-v1\0", "utf8")
    .update(JSON.stringify(definition), "utf8")
    .digest("hex");
}

function assertPartitionedOnlyDelta(control, treatment) {
  if (`${control}; Partitioned` !== treatment) {
    throw new Error("Partitioned minimizer treatment must add exactly one response attribute");
  }
}

function assertDistinctFixtureBindings(bindings) {
  const hashes = Object.values(bindings).flatMap(Object.values);
  if (hashes.length !== 8 || new Set(hashes).size !== hashes.length) {
    throw new Error("Every typed-terminal fixture variant requires an independent SHA-256 binding");
  }
}

function assertFixtureBinding(fixture, expected) {
  if (!isDeepStrictEqual(fixture?.binding, expected)) {
    throw new TypeError("Typed-terminal fixture binding differs from its frozen source identity");
  }
}

function assertExactEvidence(actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error("Typed-terminal fixture request evidence differs from the exact causal plan");
  }
}

function assertScenario(value, expected) {
  if (
    value?.id !== expected.id ||
    value?.family !== expected.family ||
    value?.construction !== expected.construction ||
    value?.causalDelta !== expected.causalDelta ||
    !isDeepStrictEqual(value?.causalContract, expected.causalContract) ||
    value?.processCount !== 2 ||
    !isDeepStrictEqual(value?.fixtureBinding, expected.binding) ||
    !sameKeys(value, [
      "id",
      "family",
      "construction",
      "causalDelta",
      "causalContract",
      "processCount",
      "fixtureBinding",
      "control",
      "treatment",
      "evidence",
    ]) ||
    !isDeepStrictEqual(value?.evidence, expected.evidence)
  ) {
    throw new TypeError(`Invalid typed-terminal scenario ${expected.id}`);
  }
  const expectedControlTerminal = {
    kind: "success",
    phase: expected.controlPhase,
    code: "completed",
    fatal: null,
    stateEffect: null,
    settleOutcome: "quiescent",
    ...(expected.observedMatches === undefined
      ? {}
      : { observedMatches: expected.observedMatches }),
  };
  if (!isDeepStrictEqual(value.control, {
    status: "passed",
    terminal: expectedControlTerminal,
    cleanup: { status: "passed", mode: "graceful_session_close_then_runtime_close" },
  })) {
    throw new TypeError(`Invalid typed-terminal control ${expected.id}`);
  }
  if (!isDeepStrictEqual(value.treatment, {
    status: "passed",
    terminal: {
      kind: "error",
      name: "StasisProtocolError",
      ...expected.treatment,
    },
    cleanup: { status: "passed", mode: "fail_stop_runtime_close" },
  })) {
    throw new TypeError(`Invalid typed-terminal treatment ${expected.id}`);
  }
}

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile ||
    typeof value?.sdk?.launch !== "function"
  ) {
    throw new TypeError("Typed-terminal minimizers require one verified post-support candidate");
  }
  return identity;
}

function exactNonnegativeInteger(value, label) {
  const converted = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new TypeError(`${label} is not an exact non-negative integer`);
  }
  return converted;
}

function sameKeys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
