import { createServer } from "node:http";
import path from "node:path";

import { candidateV03, loadVerifiedCandidateV03Sdk } from "../shared/candidate-v03.mjs";
import { repositoryRoot, sha256File } from "../shared/io.mjs";
import { expectedVersions, runtimePins } from "../wild/config.mjs";
import { projectStasisError, runStasisObservation } from "../wild/stasis-observation.mjs";

const wildRunId = "wild-paired-4a73bea-authoritative-v4";

export const cookieProfileReproductionDefinitions = Object.freeze({
  persistent: Object.freeze({
    id: "persistent-login-response",
    code: "unsupported_persistent_cookie",
    phase: "settle",
    rwa: Object.freeze({
      runId: "rwa-hosted-cd471fb2-bd6715f5-attempt1-20260826T144836Z",
      caseIds: Object.freeze([
        "auth-02-login-home-redirect",
        "auth-03-remember-user-thirty-days",
      ]),
    }),
    wild: Object.freeze({
      runId: wildRunId,
      slot: 1,
      stratumId: "rank-1-1000",
      stratumSlot: 1,
      permutationIndex: 19,
      rank: 635,
      domain: "dyndns.org",
      requestedUrl: "https://dyndns.org/",
    }),
  }),
  sameSite: Object.freeze({
    id: "cross-site-subresource",
    code: "unsupported_cookie_same_site_context",
    phase: "openSession",
    wild: Object.freeze({
      runId: wildRunId,
      slot: 9,
      stratumId: "rank-1-1000",
      stratumSlot: 9,
      permutationIndex: 52,
      rank: 642,
      domain: "ovh.net",
      requestedUrl: "https://ovh.net/",
    }),
  }),
});

export const defaultCandidateExecutablePath = path.join(
  repositoryRoot,
  "candidate",
  "stasis-0.3.0-windows-x86_64-ci",
  "stasis.exe",
);

const network = Object.freeze({ mode: "live", routes: Object.freeze([]) });
const settlePolicy = Object.freeze({
  persistentWork: "report",
  maxVirtualTimeNs: 5_000_000_000n,
  maxControlTurns: 10_000n,
  wallIoTimeoutNs: 5_000_000_000n,
});
const rules = Object.freeze({
  retries: 0,
  fallback: false,
  sleeps: false,
  polling: false,
  processPerScenario: 1,
});

export async function runLocalCookieProfileReproductions(
  executablePath = defaultCandidateExecutablePath,
) {
  const identity = await assertCookieReproductionIdentity(executablePath);
  const { launch } = await loadVerifiedCandidateV03Sdk();
  return {
    schema: "stasis-cookie-profile-local-reproductions-v1",
    claimBoundary: "local causal reproductions; not corpus, CI, release, or publication proof",
    identity,
    rules: { ...rules, appCodeChanges: false, network: "real_loopback_http" },
    scenarios: [
      await reproducePersistentCookie(executablePath, launch),
      await reproduceSameSiteContext(executablePath, launch),
    ],
  };
}

export async function runUnchangedWildCookieProfileReproductions(
  executablePath = defaultCandidateExecutablePath,
) {
  const identity = await assertCookieReproductionIdentity(executablePath);
  const scenarios = [];
  for (const definition of Object.values(cookieProfileReproductionDefinitions)) {
    const observation = await runStasisObservation(definition.wild, executablePath);
    if (observation.status !== "error") {
      throw new Error(`Expected ${definition.code}, got ${observation.status}`);
    }
    const terminal = {
      phase: "stasis_operation",
      error: observation.error,
      cleanup: observation.cleanup,
    };
    assertTypedTerminal(terminal, definition.code, "stasis_operation");
    scenarios.push({
      id: `unchanged-wild-${definition.id}`,
      source: definition.wild,
      status: observation.status,
      ...terminal,
    });
  }
  return {
    schema: "stasis-cookie-profile-unchanged-wild-reproductions-v1",
    claimBoundary: "diagnostic unchanged-page replay; not a paired census or release denominator",
    identity,
    rules: { ...rules, pageChanges: false },
    scenarios,
  };
}

export async function assertCookieReproductionIdentity(executablePath) {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Cookie-profile native reproductions require Windows x64");
  }
  if (process.version !== expectedVersions.node) {
    throw new Error(`Expected ${expectedVersions.node}, got ${process.version}`);
  }
  const [nodeExecutableSha256, candidateExecutableSha256] = await Promise.all([
    sha256File(process.execPath),
    sha256File(executablePath),
  ]);
  if (nodeExecutableSha256 !== runtimePins.nodeExecutableSha256) {
    throw new Error("Pinned Node executable SHA-256 mismatch");
  }
  if (candidateExecutableSha256 !== candidateV03.executableSha256) {
    throw new Error("Stasis candidate executable SHA-256 mismatch");
  }
  return {
    stasisRevision: candidateV03.revision,
    stasisVersion: candidateV03.version,
    profile: candidateV03.profile,
    candidateExecutableSha256,
    candidateSdkArchiveSha256: candidateV03.sdkArchiveSha256,
    node: process.version,
    nodeExecutableSha256,
  };
}

export function assertTypedTerminal(terminal, code, phase) {
  if (
    terminal?.phase !== phase ||
    terminal.error?.name !== "StasisProtocolError" ||
    terminal.error?.code !== code ||
    terminal.error?.fatal !== false ||
    terminal.error?.stateEffect !== "partial" ||
    terminal.cleanup?.status !== "passed" ||
    terminal.cleanup?.mode !== "fail_stop_runtime_close"
  ) {
    throw new Error(`Expected ${code} at ${phase} with a clean fail-stop`);
  }
  return terminal;
}

export async function createPersistentLoginFixture() {
  let frontendOrigin;
  const api = await startServer("127.0.0.1", ({ method, path: requestPath }, response) => {
    if (method !== "POST" || requestPath !== "/login") return respond(response, 404, "not found");
    response.writeHead(200, {
      "access-control-allow-credentials": "true",
      "access-control-allow-origin": frontendOrigin,
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "set-cookie": "connect.sid=repro; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax",
    });
    response.end('{"ok":true}');
  });
  const apiOrigin = `http://127.0.0.1:${api.port}`;
  const frontend = await startServer("127.0.0.1", ({ method, path: requestPath }, response) => {
    if (method !== "GET" || requestPath !== "/") return respond(response, 404, "not found");
    respond(response, 200, `<!doctype html><button id="login">login</button><script>document.querySelector("#login").addEventListener("click",()=>{fetch("${apiOrigin}/login",{method:"POST",credentials:"include"}).catch(()=>{});});</script>`, "text/html; charset=utf-8");
  });
  frontendOrigin = `http://127.0.0.1:${frontend.port}`;
  return fixture(`${frontendOrigin}/`, frontend, api);
}

export async function createCrossSiteSubresourceFixture() {
  const resource = await startServer("127.0.0.2", ({ method, path: requestPath }, response) => {
    if (method === "GET" && requestPath === "/cross-site.js") {
      return respond(response, 200, "globalThis.crossSiteLoaded=true;", "text/javascript; charset=utf-8");
    }
    respond(response, 404, "not found");
  });
  const resourceUrl = `http://127.0.0.2:${resource.port}/cross-site.js`;
  const topLevel = await startServer("127.0.0.1", ({ method, path: requestPath }, response) => {
    if (method === "GET" && requestPath === "/") {
      return respond(response, 200, `<!doctype html><script src="${resourceUrl}"></script>`, "text/html; charset=utf-8");
    }
    respond(response, 404, "not found");
  });
  return {
    ...fixture(`http://127.0.0.1:${topLevel.port}/`, topLevel, resource),
    resourceUrl,
  };
}

async function reproducePersistentCookie(executablePath, launch) {
  const definition = cookieProfileReproductionDefinitions.persistent;
  const local = await createPersistentLoginFixture();
  try {
    const terminal = await runNative(executablePath, launch, async (runtime, setPhase) => {
      setPhase("openSession");
      const session = await runtime.openSession(local.url, { profile: candidateV03.profile, network });
      setPhase("activate");
      const activated = await session.activate("#login", session.stateToken);
      setPhase("settle");
      await session.settle(activated.stateToken, settlePolicy);
    });
    assertTypedTerminal(terminal, definition.code, definition.phase);
    const topLevelGetObserved = saw(local.first.requests, "GET", "/");
    const loginPostObserved = saw(local.second.requests, "POST", "/login");
    if (!topLevelGetObserved || !loginPostObserved) throw new Error("Expected GET / then POST /login");
    return {
      id: definition.id,
      networkEvidence: { topLevelGetObserved, loginPostObserved, responseCookieAttribute: "Max-Age" },
      ...terminal,
    };
  } finally {
    await local.close();
  }
}

async function reproduceSameSiteContext(executablePath, launch) {
  const definition = cookieProfileReproductionDefinitions.sameSite;
  const local = await createCrossSiteSubresourceFixture();
  try {
    const terminal = await runNative(executablePath, launch, async (runtime, setPhase) => {
      setPhase("openSession");
      const session = await runtime.openSession(local.url, { profile: candidateV03.profile, network });
      setPhase("settle");
      await session.settle(session.stateToken, settlePolicy);
    });
    assertTypedTerminal(terminal, definition.code, definition.phase);
    const topLevelGetObserved = saw(local.first.requests, "GET", "/");
    const crossSiteRequestReachedServer = saw(local.second.requests, "GET", "/cross-site.js");
    if (!topLevelGetObserved || crossSiteRequestReachedServer) {
      throw new Error("Expected top-level GET and pre-network cross-site rejection");
    }
    return {
      id: definition.id,
      networkEvidence: { topLevelGetObserved, crossSiteRequestReachedServer },
      ...terminal,
    };
  } finally {
    await local.close();
  }
}

async function runNative(executablePath, launch, execute) {
  let runtime;
  let phase = "runtime_launch";
  let error;
  let cleanup;
  try {
    runtime = await launch({ executablePath, commandTimeoutMs: 30_000 });
    await execute(runtime, (nextPhase) => { phase = nextPhase; });
  } catch (caught) {
    error = projectStasisError(caught);
  } finally {
    if (runtime !== undefined) {
      try {
        await runtime.close();
        cleanup = { status: "passed", mode: "fail_stop_runtime_close" };
      } catch (caught) {
        cleanup = { status: "failed", mode: "fail_stop_runtime_close", error: projectStasisError(caught) };
      }
    }
  }
  if (error === undefined) throw new Error(`No typed terminal at ${phase}`);
  return { phase, error, cleanup };
}

async function startServer(host, handler) {
  const requests = [];
  const server = createServer((request, response) => {
    const method = request.method ?? "UNKNOWN";
    const requestPath = new URL(request.url ?? "/", "http://fixture.invalid").pathname;
    requests.push({ method, path: requestPath });
    handler({ method, path: requestPath }, response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Fixture has no TCP port");
  return {
    port: address.port,
    requests,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
    }),
  };
}

function fixture(url, first, second) {
  return {
    url,
    first,
    second,
    close: () => Promise.all([first.close(), second.close()]),
  };
}

function respond(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "cache-control": "no-store", "content-type": contentType });
  response.end(body);
}

function saw(requests, method, requestPath) {
  return requests.some((request) => request.method === method && request.path === requestPath);
}
