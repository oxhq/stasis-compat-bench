import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createServer } from "node:http";
import { isDeepStrictEqual } from "node:util";

import {
  assertAuthoritativePostSupportCandidate,
  assertCandidateIdentity,
  postSupportExecutablePath,
  postSupportProfile,
} from "./candidate-identity.mjs";
import { assertPostSupportArtifactPrivacy } from "./artifact-privacy.mjs";

const network = Object.freeze({ mode: "live", routes: Object.freeze([]) });
const settlePolicy = Object.freeze({
  persistentWork: "report",
  maxVirtualTimeNs: 5_000_000_000n,
  maxControlTurns: 10_000n,
  wallIoTimeoutNs: 5_000_000_000n,
});
const authoritativeCookieMinimizerResults = new WeakSet();
const defaultCookieMinimizerDependencies = Object.freeze({});

const persistentScenarioEvidence = Object.freeze({
  seedRequestCount: 1,
  persistentCookieCount: 1,
  nonNullExpiryCount: 1,
  restoredRequestCount: 1,
  restoredCredentialPresent: true,
  stateArtifactTransferredInMemory: true,
});

const sameSiteScenarioEvidence = Object.freeze({
  localhostResolutionNonempty: true,
  localhostResolutionOnlyExactLoopback: true,
  localhostResolutionValidatedBeforeRequests: true,
  dualLoopbackListenerCount: 2,
  resourceListenersSharePort: true,
  resourceIpv6Only: true,
  seedRequestCount: 1,
  seedHostHeaderMatchCount: 1,
  seedCredentialCount: 0,
  seedCookiePairCount: 0,
  laxCookieCount: 1,
  canonicalCookieDomainObserved: true,
  sameSiteProbeRequestCount: 1,
  sameSiteHostHeaderMatchCount: 1,
  sameSiteCredentialCount: 1,
  sameSiteCookiePairCount: 1,
  sameSiteCredentialPresent: true,
  topLevelRequestCount: 1,
  topLevelHostHeaderMatchCount: 1,
  topLevelCredentialCount: 0,
  topLevelCookiePairCount: 0,
  crossSiteSubresourceRequestCount: 1,
  crossSiteHostHeaderMatchCount: 1,
  crossSiteCredentialCount: 0,
  crossSiteCookiePairCount: 0,
  crossSiteCredentialPresent: false,
  invalidHostRequestCount: 0,
  stateArtifactTransferredInMemory: true,
});

export async function runPositiveCookieMinimizers(
  verifiedCandidate,
  dependencies = defaultCookieMinimizerDependencies,
) {
  const canMintAuthority = dependencies === defaultCookieMinimizerDependencies;
  if (canMintAuthority) assertAuthoritativePostSupportCandidate(verifiedCandidate);
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const executablePath = postSupportExecutablePath(verifiedCandidate);
  const launch = dependencies.launch ?? verifiedCandidate.sdk.launch;
  const makeSecret = dependencies.makeSecret ?? (() => randomBytes(32).toString("hex"));
  const createPersistentFixture = dependencies.createPersistentFixture ??
    createPositivePersistentCookieFixture;
  const createSameSiteFixture = dependencies.createSameSiteFixture ??
    createPositiveSameSiteFixture;

  const result = {
    schema: "stasis-post-support-cookie-minimizers-v1",
    claimBoundary: "local positive causal proof; not corpus, hosted CI, release, or publication proof",
    candidate: identity,
    rules: {
      appCodeChanges: false,
      retries: 0,
      sleeps: false,
      polling: false,
      stateTransfer: "memory_only",
      persistedEvidence: "booleans_counts_and_typed_properties_only",
    },
    scenarios: [
      await runPersistentCookieMinimizer({
        executablePath,
        launch,
        makeSecret,
        createFixture: createPersistentFixture,
      }),
      await runSameSiteCookieMinimizer({
        executablePath,
        launch,
        makeSecret,
        createFixture: createSameSiteFixture,
      }),
    ],
  };
  const validated = assertPositiveCookieMinimizerResult(result);
  deepFreeze(validated);
  if (canMintAuthority) authoritativeCookieMinimizerResults.add(validated);
  return validated;
}

export async function runPersistentCookieMinimizer({
  executablePath,
  launch,
  makeSecret = () => randomBytes(32).toString("hex"),
  createFixture = createPositivePersistentCookieFixture,
}) {
  const secret = exactSecret(makeSecret());
  const fixture = await createFixture(secret);
  let state;
  let cookieFacts;
  try {
    await withFreshRuntime(executablePath, launch, async (runtime) => {
      const session = await runtime.openSession(fixture.seedUrl, {
        profile: postSupportProfile,
        network,
      });
      try {
        await settle(session);
        cookieFacts = projectPersistentCookieFacts(await session.getCookies(), fixture.cookieName);
        state = (await session.exportState()).state;
        assertStateProfile(state);
      } finally {
        await session.close();
      }
    });
    await withFreshRuntime(executablePath, launch, async (runtime) => {
      const session = await runtime.openSession(fixture.probeUrl, {
        profile: postSupportProfile,
        state,
        network,
      });
      try {
        await settle(session);
      } finally {
        await session.close();
      }
    });
    const observed = fixture.facts();
    const evidence = {
      seedRequestCount: observed.seedRequestCount,
      persistentCookieCount: cookieFacts.persistentCookieCount,
      nonNullExpiryCount: cookieFacts.nonNullExpiryCount,
      restoredRequestCount: observed.restoredRequestCount,
      restoredCredentialPresent: observed.restoredCredentialPresent,
      stateArtifactTransferredInMemory: true,
    };
    if (
      evidence.seedRequestCount !== 1 ||
      evidence.persistentCookieCount !== 1 ||
      evidence.nonNullExpiryCount !== 1 ||
      evidence.restoredRequestCount !== 1 ||
      evidence.restoredCredentialPresent !== true
    ) {
      throw new Error("Persistent-cookie positive proof did not satisfy its exact observations");
    }
    return {
      id: "persistent-cookie-fresh-process-restore",
      status: "passed",
      processCount: 2,
      cookiePersistence: "max_age",
      evidence,
    };
  } finally {
    state = undefined;
    await fixture.close();
  }
}

export async function runSameSiteCookieMinimizer({
  executablePath,
  launch,
  makeSecret = () => randomBytes(32).toString("hex"),
  createFixture = createPositiveSameSiteFixture,
}) {
  const secret = exactSecret(makeSecret());
  const fixture = await createFixture(secret);
  assertLocalDistinctSameSiteFixture(fixture);
  let state;
  let cookieFacts;
  try {
    await withFreshRuntime(executablePath, launch, async (runtime) => {
      const session = await runtime.openSession(fixture.seedUrl, {
        profile: postSupportProfile,
        network,
      });
      try {
        await settle(session);
        cookieFacts = projectSameSiteCookieFacts(
          await session.getCookies(),
          fixture.cookieName,
          fixture.canonicalCookieDomain,
        );
        state = (await session.exportState()).state;
        assertStateProfile(state);
      } finally {
        await session.close();
      }
    });
    await withFreshRuntime(executablePath, launch, async (runtime) => {
      const session = await runtime.openSession(fixture.sameSiteProbeUrl, {
        profile: postSupportProfile,
        state,
        network,
      });
      try {
        await settle(session);
      } finally {
        await session.close();
      }
    });
    await withFreshRuntime(executablePath, launch, async (runtime) => {
      const session = await runtime.openSession(fixture.crossSiteTopLevelUrl, {
        profile: postSupportProfile,
        state,
        network,
      });
      try {
        await settle(session);
      } finally {
        await session.close();
      }
    });
    const observed = fixture.facts();
    const evidence = {
      localhostResolutionNonempty: observed.localhostResolutionNonempty,
      localhostResolutionOnlyExactLoopback: observed.localhostResolutionOnlyExactLoopback,
      localhostResolutionValidatedBeforeRequests:
        observed.localhostResolutionValidatedBeforeRequests,
      dualLoopbackListenerCount: observed.dualLoopbackListenerCount,
      resourceListenersSharePort: observed.resourceListenersSharePort,
      resourceIpv6Only: observed.resourceIpv6Only,
      seedRequestCount: observed.seedRequestCount,
      seedHostHeaderMatchCount: observed.seedHostHeaderMatchCount,
      seedCredentialCount: observed.seedCredentialCount,
      seedCookiePairCount: observed.seedCookiePairCount,
      laxCookieCount: cookieFacts.laxCookieCount,
      canonicalCookieDomainObserved: cookieFacts.canonicalCookieDomainObserved,
      sameSiteProbeRequestCount: observed.sameSiteProbeRequestCount,
      sameSiteHostHeaderMatchCount: observed.sameSiteHostHeaderMatchCount,
      sameSiteCredentialCount: observed.sameSiteCredentialCount,
      sameSiteCookiePairCount: observed.sameSiteCookiePairCount,
      sameSiteCredentialPresent: observed.sameSiteCredentialPresent,
      topLevelRequestCount: observed.topLevelRequestCount,
      topLevelHostHeaderMatchCount: observed.topLevelHostHeaderMatchCount,
      topLevelCredentialCount: observed.topLevelCredentialCount,
      topLevelCookiePairCount: observed.topLevelCookiePairCount,
      crossSiteSubresourceRequestCount: observed.crossSiteSubresourceRequestCount,
      crossSiteHostHeaderMatchCount: observed.crossSiteHostHeaderMatchCount,
      crossSiteCredentialCount: observed.crossSiteCredentialCount,
      crossSiteCookiePairCount: observed.crossSiteCookiePairCount,
      crossSiteCredentialPresent: observed.crossSiteCredentialPresent,
      invalidHostRequestCount: observed.invalidHostRequestCount,
      stateArtifactTransferredInMemory: true,
    };
    if (
      evidence.localhostResolutionNonempty !== true ||
      evidence.localhostResolutionOnlyExactLoopback !== true ||
      evidence.localhostResolutionValidatedBeforeRequests !== true ||
      evidence.dualLoopbackListenerCount !== 2 ||
      evidence.resourceListenersSharePort !== true ||
      evidence.resourceIpv6Only !== true ||
      evidence.seedRequestCount !== 1 ||
      evidence.seedHostHeaderMatchCount !== 1 ||
      evidence.seedCredentialCount !== 0 ||
      evidence.seedCookiePairCount !== 0 ||
      evidence.laxCookieCount !== 1 ||
      evidence.canonicalCookieDomainObserved !== true ||
      evidence.sameSiteProbeRequestCount !== 1 ||
      evidence.sameSiteHostHeaderMatchCount !== 1 ||
      evidence.sameSiteCredentialCount !== 1 ||
      evidence.sameSiteCookiePairCount !== 1 ||
      evidence.sameSiteCredentialPresent !== true ||
      evidence.topLevelRequestCount !== 1 ||
      evidence.topLevelHostHeaderMatchCount !== 1 ||
      evidence.topLevelCredentialCount !== 0 ||
      evidence.topLevelCookiePairCount !== 0 ||
      evidence.crossSiteSubresourceRequestCount !== 1 ||
      evidence.crossSiteHostHeaderMatchCount !== 1 ||
      evidence.crossSiteCredentialCount !== 0 ||
      evidence.crossSiteCookiePairCount !== 0 ||
      evidence.crossSiteCredentialPresent !== false ||
      evidence.invalidHostRequestCount !== 0
    ) {
      throw new Error("SameSite positive proof did not satisfy its exact observations");
    }
    return {
      id: "same-site-lax-cross-site-subresource",
      status: "passed",
      processCount: 3,
      sameSitePolicy: "lax",
      evidence,
    };
  } finally {
    state = undefined;
    await fixture.close();
  }
}

export async function createPositivePersistentCookieFixture(secret) {
  const cookieName = "stasis_persistent_proof";
  const observations = {
    seedRequestCount: 0,
    restoredRequestCount: 0,
    restoredCredentialPresent: false,
  };
  const server = await startServer("127.0.0.1", (request, response) => {
    if (request.method === "GET" && request.path === "/seed") {
      observations.seedRequestCount += 1;
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "set-cookie": `${cookieName}=${secret}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`,
      });
      return response.end("<!doctype html><title>seeded</title>");
    }
    if (request.method === "GET" && request.path === "/probe") {
      observations.restoredRequestCount += 1;
      observations.restoredCredentialPresent = request.credentialCount(cookieName, secret) === 1;
      return respond(response, 200, "<!doctype html><title>restored</title>", "text/html; charset=utf-8");
    }
    return respond(response, 404, "not found");
  });
  const origin = `http://127.0.0.1:${server.port}`;
  return {
    cookieName,
    seedUrl: `${origin}/seed`,
    probeUrl: `${origin}/probe`,
    facts: () => ({ ...observations }),
    close: server.close,
  };
}

export async function createPositiveSameSiteFixture(secret, dependencies = {}) {
  const cookieName = "stasis_samesite_proof";
  const resolveLocalhost = dependencies.resolveLocalhost ?? resolveExactLocalhost;
  const localhostResolution = assertExactLocalhostResolution(await resolveLocalhost());
  const observations = {
    localhostResolutionNonempty: localhostResolution.length > 0,
    localhostResolutionOnlyExactLoopback: true,
    localhostResolutionValidatedBeforeRequests: true,
    dualLoopbackListenerCount: 0,
    resourceListenersSharePort: false,
    resourceIpv6Only: false,
    seedRequestCount: 0,
    seedHostHeaderMatchCount: 0,
    seedCredentialCount: 0,
    seedCookiePairCount: 0,
    sameSiteProbeRequestCount: 0,
    sameSiteHostHeaderMatchCount: 0,
    sameSiteCredentialCount: 0,
    sameSiteCookiePairCount: 0,
    sameSiteCredentialPresent: false,
    topLevelRequestCount: 0,
    topLevelHostHeaderMatchCount: 0,
    topLevelCredentialCount: 0,
    topLevelCookiePairCount: 0,
    crossSiteSubresourceRequestCount: 0,
    crossSiteHostHeaderMatchCount: 0,
    crossSiteCredentialCount: 0,
    crossSiteCookiePairCount: 0,
    crossSiteCredentialPresent: false,
    invalidHostRequestCount: 0,
  };
  let resourcePort;
  const resource = await startDualLoopbackServer((request, response) => {
    if (request.method === "GET" && request.path === "/seed") {
      observations.seedRequestCount += 1;
      if (!recordExactHost(request, response, `localhost:${resourcePort}`, observations)) return;
      observations.seedHostHeaderMatchCount += 1;
      observations.seedCredentialCount += request.credentialCount(cookieName, secret);
      observations.seedCookiePairCount += request.cookiePairCount;
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "set-cookie": `${cookieName}=${secret}; Path=/; HttpOnly; SameSite=Lax`,
      });
      return response.end("<!doctype html><title>seeded</title>");
    }
    if (request.method === "GET" && request.path === "/same-site-probe") {
      observations.sameSiteProbeRequestCount += 1;
      if (!recordExactHost(request, response, `localhost:${resourcePort}`, observations)) return;
      observations.sameSiteHostHeaderMatchCount += 1;
      const credentialCount = request.credentialCount(cookieName, secret);
      observations.sameSiteCredentialCount += credentialCount;
      observations.sameSiteCookiePairCount += request.cookiePairCount;
      observations.sameSiteCredentialPresent = credentialCount === 1;
      return respond(response, 200, "<!doctype html><title>same-site</title>", "text/html; charset=utf-8");
    }
    if (request.method === "GET" && request.path === "/cross-site.js") {
      observations.crossSiteSubresourceRequestCount += 1;
      if (!recordExactHost(request, response, `localhost:${resourcePort}`, observations)) return;
      observations.crossSiteHostHeaderMatchCount += 1;
      const credentialCount = request.credentialCount(cookieName, secret);
      observations.crossSiteCredentialCount += credentialCount;
      observations.crossSiteCookiePairCount += request.cookiePairCount;
      observations.crossSiteCredentialPresent = credentialCount !== 0;
      return respond(response, 200, "globalThis.stasisCrossSiteProof=true;", "text/javascript; charset=utf-8");
    }
    return respond(response, 404, "not found");
  });
  resourcePort = resource.port;
  observations.dualLoopbackListenerCount = resource.listenerHosts.length;
  observations.resourceListenersSharePort = new Set(resource.listenerPorts).size === 1;
  observations.resourceIpv6Only = resource.ipv6Only;
  const resourceOrigin = `http://localhost:${resource.port}`;
  let topLevelPort;
  let topLevel;
  try {
    topLevel = await startServer("127.0.0.1", (request, response) => {
      if (request.method === "GET" && request.path === "/") {
        observations.topLevelRequestCount += 1;
        if (!recordExactHost(request, response, `127.0.0.1:${topLevelPort}`, observations)) return;
        observations.topLevelHostHeaderMatchCount += 1;
        observations.topLevelCredentialCount += request.credentialCount(cookieName, secret);
        observations.topLevelCookiePairCount += request.cookiePairCount;
        return respond(
          response,
          200,
          `<!doctype html><script src="${resourceOrigin}/cross-site.js"></script><title>cross-site</title>`,
          "text/html; charset=utf-8",
        );
      }
      return respond(response, 404, "not found");
    });
  } catch (error) {
    await resource.close();
    throw error;
  }
  topLevelPort = topLevel.port;
  const fixtureValue = {
    cookieName,
    canonicalCookieDomain: "localhost",
    localhostResolution,
    resourceListenerHosts: [...resource.listenerHosts],
    resourceListenerPorts: [...resource.listenerPorts],
    resourceListenerIpv6Only: resource.ipv6Only,
    seedUrl: `${resourceOrigin}/seed`,
    sameSiteProbeUrl: `${resourceOrigin}/same-site-probe`,
    crossSiteTopLevelUrl: `http://127.0.0.1:${topLevel.port}/`,
    facts: () => ({ ...observations }),
    close: async () => Promise.all([resource.close(), topLevel.close()]),
  };
  assertLocalDistinctSameSiteFixture(fixtureValue);
  return fixtureValue;
}

export function assertLocalDistinctSameSiteFixture(value) {
  assertExactLocalhostResolution(value?.localhostResolution);
  const seed = new URL(value?.seedUrl);
  const sameSiteProbe = new URL(value?.sameSiteProbeUrl);
  const top = new URL(value?.crossSiteTopLevelUrl);
  const resourcePort = Number(seed.port);
  if (
    seed.protocol !== "http:" ||
    seed.hostname !== "localhost" ||
    seed.username !== "" ||
    seed.password !== "" ||
    seed.pathname !== "/seed" ||
    !Number.isSafeInteger(resourcePort) ||
    resourcePort < 1 ||
    sameSiteProbe.origin !== seed.origin ||
    sameSiteProbe.pathname !== "/same-site-probe" ||
    top.protocol !== "http:" ||
    top.hostname !== "127.0.0.1" ||
    top.username !== "" ||
    top.password !== "" ||
    top.pathname !== "/" ||
    top.port === "" ||
    seed.origin === top.origin ||
    seed.port === top.port ||
    value?.canonicalCookieDomain !== "localhost" ||
    !sameArray(value?.resourceListenerHosts, ["127.0.0.1", "::1"]) ||
    !sameArray(value?.resourceListenerPorts, [resourcePort, resourcePort]) ||
    value?.resourceListenerIpv6Only !== true
  ) {
    throw new TypeError(
      "SameSite fixture requires one exact dual-loopback localhost resource site and a distinct IPv4 top-level site",
    );
  }
  return value;
}

export function assertPositiveCookieMinimizerResult(result) {
  const candidate = assertCandidateIdentity(result?.candidate);
  if (
    result?.schema !== "stasis-post-support-cookie-minimizers-v1" ||
    candidate.profile !== postSupportProfile ||
    result?.claimBoundary !==
      "local positive causal proof; not corpus, hosted CI, release, or publication proof" ||
    !isDeepStrictEqual(result?.rules, {
      appCodeChanges: false,
      retries: 0,
      sleeps: false,
      polling: false,
      stateTransfer: "memory_only",
      persistedEvidence: "booleans_counts_and_typed_properties_only",
    }) ||
    !sameObjectKeys(result, ["schema", "claimBoundary", "candidate", "rules", "scenarios"]) ||
    !Array.isArray(result?.scenarios) ||
    result.scenarios.length !== 2 ||
    !isDeepStrictEqual(result.scenarios[0], {
      id: "persistent-cookie-fresh-process-restore",
      status: "passed",
      processCount: 2,
      cookiePersistence: "max_age",
      evidence: persistentScenarioEvidence,
    }) ||
    !isDeepStrictEqual(result.scenarios[1], {
      id: "same-site-lax-cross-site-subresource",
      status: "passed",
      processCount: 3,
      sameSitePolicy: "lax",
      evidence: sameSiteScenarioEvidence,
    })
  ) {
    throw new TypeError("Invalid positive cookie minimizer result");
  }
  assertSafeProofShape(result);
  assertPostSupportArtifactPrivacy(result);
  return result;
}

export function assertAuthoritativePositiveCookieMinimizerResult(value) {
  assertPositiveCookieMinimizerResult(value);
  if (!authoritativeCookieMinimizerResults.has(value)) {
    throw new Error(
      "Cookie boundary authority requires a fresh direct in-process positive minimizer run",
    );
  }
  return value;
}

export function assertExactLocalhostResolution(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("localhost must resolve to at least one exact loopback address");
  }
  const projected = value.map((entry) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !sameObjectKeys(entry, ["address", "family"]) ||
      !(
        (entry.address === "127.0.0.1" && entry.family === 4) ||
        (entry.address === "::1" && entry.family === 6)
      )
    ) {
      throw new TypeError("localhost resolved outside exact IPv4/IPv6 loopback families");
    }
    return Object.freeze({ address: entry.address, family: entry.family });
  });
  if (new Set(projected.map(({ address, family }) => `${family}|${address}`)).size !== projected.length) {
    throw new TypeError("localhost resolution contains duplicate loopback records");
  }
  return Object.freeze(projected);
}

export function exactLoopbackListenOptions(host, port) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("Loopback listener port is invalid");
  }
  if (host === "127.0.0.1") return Object.freeze({ host, port });
  if (host === "::1") return Object.freeze({ host, port, ipv6Only: true });
  throw new TypeError("Fixture listeners require one exact loopback address");
}

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile ||
    typeof value?.sdk?.launch !== "function"
  ) {
    throw new TypeError("Cookie minimizers require one verified post-support candidate");
  }
  return identity;
}

async function withFreshRuntime(executablePath, launch, execute) {
  const runtime = await launch({ executablePath, commandTimeoutMs: 30_000 });
  try {
    await execute(runtime);
  } finally {
    await runtime.close();
  }
}

async function settle(session) {
  const result = await session.settle(session.stateToken, settlePolicy);
  if (!["quiescent", "quiescent_with_persistent_work"].includes(result?.outcome)) {
    throw new Error("Cookie minimizer did not settle successfully");
  }
  return result;
}

function projectPersistentCookieFacts(snapshot, cookieName) {
  const selected = snapshot?.cookies?.filter((cookie) => cookie?.name === cookieName) ?? [];
  return {
    persistentCookieCount: selected.length,
    nonNullExpiryCount: selected.filter((cookie) => typeof cookie.expiresUnixTimeNs === "bigint").length,
  };
}

function projectSameSiteCookieFacts(snapshot, cookieName, canonicalCookieDomain) {
  const selected = snapshot?.cookies?.filter((cookie) => cookie?.name === cookieName) ?? [];
  return {
    laxCookieCount: selected.filter((cookie) => cookie.sameSite === "lax").length,
    canonicalCookieDomainObserved:
      selected.length === 1 && selected[0]?.domain === canonicalCookieDomain,
  };
}

function assertStateProfile(state) {
  if (state?.profile !== postSupportProfile || state?.sensitive !== true) {
    throw new Error("Exported cookie state lacks the exact controlled-web-session-v2 identity");
  }
}

async function startServer(host, handler, port = 0) {
  const server = createServer((incoming, response) => {
    const method = incoming.method ?? "UNKNOWN";
    const requestPath = new URL(incoming.url ?? "/", "http://fixture.invalid").pathname;
    const hostHeader = typeof incoming.headers.host === "string" ? incoming.headers.host : "";
    const cookieHeader = typeof incoming.headers.cookie === "string" ? incoming.headers.cookie : "";
    const cookiePairs = cookieHeader === ""
      ? []
      : cookieHeader.split(";").map((part) => part.trim()).filter((part) => part !== "");
    handler({
      method,
      path: requestPath,
      host: hostHeader,
      cookiePairCount: cookiePairs.length,
      credentialCount: (name, value) => cookiePairs
        .filter((part) => part === `${name}=${value}`).length,
    }, response);
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(exactLoopbackListenOptions(host, port), () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  if (
    address === null ||
    typeof address === "string" ||
    address.address !== host ||
    (port !== 0 && address.port !== port)
  ) {
    await closeServer(server);
    throw new Error("Fixture did not bind its exact requested loopback address and port");
  }
  return {
    host: address.address,
    port: address.port,
    close: () => closeServer(server),
  };
}

async function startDualLoopbackServer(handler) {
  const ipv4 = await startServer("127.0.0.1", handler);
  try {
    const ipv6 = await startServer("::1", handler, ipv4.port);
    return {
      port: ipv4.port,
      listenerHosts: Object.freeze([ipv4.host, ipv6.host]),
      listenerPorts: Object.freeze([ipv4.port, ipv6.port]),
      ipv6Only: true,
      close: async () => Promise.all([ipv4.close(), ipv6.close()]),
    };
  } catch (error) {
    await ipv4.close();
    throw error;
  }
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}

function recordExactHost(request, response, expectedHost, observations) {
  if (request.host !== expectedHost) {
    observations.invalidHostRequestCount += 1;
    respond(response, 400, "invalid host");
    return false;
  }
  return true;
}

function sameArray(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function sameObjectKeys(actual, expected) {
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
  const keys = Reflect.ownKeys(actual);
  return keys.every((key) => typeof key === "string") &&
    sameArray(keys.sort(), [...expected].sort());
}

async function resolveExactLocalhost() {
  return lookup("localhost", { all: true, verbatim: true });
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}


function respond(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "cache-control": "no-store", "content-type": contentType });
  response.end(body);
}

function exactSecret(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError("Cookie minimizer secret must be 32 random bytes encoded as lowercase hex");
  }
  return value;
}

function assertSafeProofShape(value) {
  const forbiddenKeys = /(?:cookie(?:value|header)?|set-cookie|state(?:blob|artifact)?|authorization|secret|token|path|url)$/iu;
  const localPath = /(?:[a-z]:[\\/]|\\\\|\/(?:home|users|tmp|var)\/)/iu;
  const visit = (entry, key = "") => {
    if (forbiddenKeys.test(key)) throw new TypeError(`Unsafe cookie proof property: ${key}`);
    if (typeof entry === "string" && localPath.test(entry)) {
      throw new TypeError("Cookie proof contains a local path");
    }
    if (entry !== null && typeof entry === "object") {
      for (const [childKey, child] of Object.entries(entry)) visit(child, childKey);
    }
  };
  visit(value);
}
