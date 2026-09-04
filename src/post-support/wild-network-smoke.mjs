import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { artifactRoot, sha256File } from "../shared/io.mjs";
import { serializeWildArtifact, writeWildArtifactJson } from "../wild/artifact-privacy.mjs";
import { assertFrozenWildBinding } from "../wild/binding.mjs";
import {
  networkPolicyIdentity,
  networkPolicySmokePath,
  protocol,
} from "../wild/config.mjs";
import { verifyNetworkPolicyIdentity } from "../wild/network-policy-smoke.mjs";
import { createWildRunGeneration, assertWildRunGeneration } from "../wild/run-generation.mjs";
import { stasisLiveNetworkPolicy } from "../wild/stasis-network.mjs";
import {
  assertAuthoritativePostSupportCandidate,
  assertCandidateIdentity,
  postSupportExecutablePath,
  postSupportNodeVersion,
  postSupportProfile,
} from "./candidate-identity.mjs";
import { assertPostSupportArtifactPrivacy } from "./artifact-privacy.mjs";
import { projectWildCandidateIdentity } from "./wild-identity.mjs";
import {
  assertObservedPostSupportHarnessRuntime,
  observePostSupportHarnessRuntime,
} from "./wild-runtime-identity.mjs";

const smokeUrl = "https://stasis.invalid/";
const sha256Pattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const defaultWildSmokeDependencies = Object.freeze({});

export async function runPostSupportWildNetworkSmoke(
  verifiedCandidate,
  dependencies = defaultWildSmokeDependencies,
) {
  const authoritativeExecution = dependencies === defaultWildSmokeDependencies;
  if (authoritativeExecution) assertAuthoritativePostSupportCandidate(verifiedCandidate);
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const root = configuredArtifactRoot(dependencies.artifactRoot);
  const loadBinding = dependencies.loadBinding ?? assertFrozenWildBinding;
  const binding = await loadBinding();
  const runtime = await observePinnedHarnessRuntime(binding, dependencies);
  await claimFreshArtifactRoot(root);
  const policy = stasisLiveNetworkPolicy();
  verifyNetworkPolicyIdentity(policy);
  const network = {
    mode: "fixtures_only",
    routes: [smokeFixture(), ...policy.routes],
  };
  if (network.routes.length !== networkPolicyIdentity.routeCount + 1) {
    throw new Error("Post-support network-policy smoke omitted a frozen policy route");
  }

  const runGeneration = createWildRunGeneration(root);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  let ownedRuntime = null;
  let session = null;
  let closed = false;
  try {
    ownedRuntime = await (dependencies.launch ?? verifiedCandidate.sdk.launch)({
      executablePath: postSupportExecutablePath(verifiedCandidate),
      commandTimeoutMs: 30_000,
    });
    session = await ownedRuntime.openSession(smokeUrl, {
      profile: postSupportProfile,
      network,
      signal: (dependencies.timeoutSignal ?? AbortSignal.timeout)(30_000),
    });
    if (session.url !== smokeUrl) {
      throw new Error("Post-support network-policy smoke did not commit the synthetic URL");
    }
    const settled = await session.settle(session.stateToken, {
      persistentWork: "report",
      maxVirtualTimeNs: 1_000_000_000n,
      maxControlTurns: 10_000n,
      wallIoTimeoutNs: 5_000_000_000n,
    });
    if (settled.outcome !== "quiescent") {
      throw new Error(`Post-support network-policy smoke did not settle quiescently: ${settled.outcome}`);
    }
    const [requests, evidence] = await Promise.all([
      session.requests({ limit: 256 }),
      session.evidence({ limit: 256 }),
    ]);
    const audit = assertExactSmokeAudit(requests, evidence);
    await session.close({ timeoutMs: 5_000 });
    closed = true;

    const value = {
      schema: "stasis-post-support-wild-network-policy-smoke-v1",
      protocol,
      status: "passed",
      executionAuthority: authoritativeExecution
        ? "default_verified_candidate_uninjected"
        : "diagnostic_only",
      runGeneration,
      startedAt,
      completedAt: now(),
      harnessCommit: binding.harnessCommit,
      preregistrationCommit: binding.preregistrationCommit,
      corpusSha256: binding.corpusSha256,
      preflightLedgerSha256: binding.preflightLedgerSha256,
      runtime,
      candidate: projectWildCandidateIdentity(identity),
      policy: {
        declaredMode: policy.mode,
        appliedMode: network.mode,
        routeCount: networkPolicyIdentity.routeCount,
        sha256: networkPolicyIdentity.sha256,
        encodedBytes: networkPolicyIdentity.encodedBytes,
        compiledRouteCount: network.routes.length,
        coverage:
          "common_non_get_http_https_and_best_effort_private_ipv4_localhost_default_port_ipv6_literals",
        excluded:
          "ipv6_cidr_and_non_default_ipv6_ports_unrepresentable_in_frozen_native_url_matcher",
      },
      fixture: {
        targetClass: "synthetic_reserved_invalid_origin",
        method: "GET",
        routeDecision: "fixture_fulfill",
      },
      result: {
        outcome: settled.outcome,
        requestCount: audit.requestCount,
        requestMethods: audit.requestMethods,
        routeDecisionCount: audit.routeDecisionCount,
        liveDecisionCount: audit.liveDecisionCount,
        cleanup: "graceful_session_close",
      },
    };
    assertPostSupportWildNetworkSmoke(value, { binding, identity, runtime, root });
    assertPostSupportArtifactPrivacy(value);
    const destination = await writeWildArtifactJson(networkPolicySmokePath, value);
    return Object.freeze({
      value: Object.freeze(value),
      reference: Object.freeze({
        path: networkPolicySmokePath,
        sha256: await sha256File(destination),
      }),
    });
  } finally {
    if (!closed) {
      let sessionClosed = false;
      if (session !== null) {
        try {
          await session.close({ timeoutMs: 5_000 });
          sessionClosed = true;
        } catch {
          // The original error remains primary; fail-stop the owned process below.
        }
      }
      if (!sessionClosed && ownedRuntime !== null) {
        await ownedRuntime.close().catch(() => undefined);
      }
    }
  }
}

export async function readVerifiedPostSupportWildNetworkSmoke({
  binding,
  verifiedCandidate,
  root = artifactRoot(),
  expectedReference,
}) {
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const absoluteRoot = await assertExplicitRealDirectory(root, "post-support wild artifact root");
  const absolutePath = path.join(absoluteRoot, networkPolicySmokePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(absolutePath), absolutePath)) {
    throw new Error("Post-support network-policy smoke is not one real root-level artifact");
  }
  const bytes = await readFile(absolutePath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Post-support network-policy smoke is not valid JSON");
  }
  if (!bytes.equals(Buffer.from(serializeWildArtifact(value), "utf8"))) {
    throw new Error("Post-support network-policy smoke is not its canonical privacy projection");
  }
  assertPostSupportArtifactPrivacy(value);
  const ledgerRuntime = projectPostSupportHarnessRuntime(binding?.preflightRuntime);
  const runtime = projectPostSupportHarnessRuntime(value.runtime);
  assertObservedPostSupportHarnessRuntime(
    withoutChromiumInstallationTree(runtime),
    ledgerRuntime,
    "Post-support persisted smoke harness runtime",
  );
  assertPostSupportWildNetworkSmoke(value, { binding, identity, runtime, root: absoluteRoot });
  const reference = Object.freeze({ path: networkPolicySmokePath, sha256: sha256(bytes) });
  if (expectedReference !== undefined && !isDeepStrictEqual(reference, expectedReference)) {
    throw new Error("Post-support result does not bind the exact network-policy smoke bytes");
  }
  return Object.freeze({ value: Object.freeze(value), reference });
}

export function assertRetainedPostSupportWildNetworkSmoke(value, expected) {
  assertExactKeys(expected, [
    "candidate",
    "corpusSha256",
    "executionAuthority",
    "harnessCommit",
    "preflightLedgerSha256",
    "preregistrationCommit",
    "runGeneration",
    "runtime",
  ], "retained post-support network-policy smoke binding");
  if (
    !commitPattern.test(expected.harnessCommit ?? "") ||
    !commitPattern.test(expected.preregistrationCommit ?? "") ||
    !sha256Pattern.test(expected.corpusSha256 ?? "") ||
    !sha256Pattern.test(expected.preflightLedgerSha256 ?? "") ||
    !["default_verified_candidate_uninjected", "diagnostic_only"].includes(
      expected.executionAuthority,
    ) ||
    typeof expected.candidate !== "object" ||
    expected.candidate === null ||
    Array.isArray(expected.candidate) ||
    typeof expected.runtime !== "object" ||
    expected.runtime === null ||
    Array.isArray(expected.runtime)
  ) {
    throw new Error("Retained post-support network-policy smoke binding is incomplete");
  }
  assertRetainedRunGeneration(expected.runGeneration);
  assertExactKeys(value, [
    "candidate",
    "completedAt",
    "corpusSha256",
    "executionAuthority",
    "fixture",
    "harnessCommit",
    "policy",
    "preflightLedgerSha256",
    "preregistrationCommit",
    "protocol",
    "result",
    "runGeneration",
    "runtime",
    "schema",
    "startedAt",
    "status",
  ], "post-support network-policy smoke");
  if (
    value.schema !== "stasis-post-support-wild-network-policy-smoke-v1" ||
    value.protocol !== protocol ||
    value.status !== "passed" ||
    value.executionAuthority !== expected.executionAuthority ||
    value.harnessCommit !== expected.harnessCommit ||
    value.preregistrationCommit !== expected.preregistrationCommit ||
    value.corpusSha256 !== expected.corpusSha256 ||
    value.preflightLedgerSha256 !== expected.preflightLedgerSha256 ||
    !isDeepStrictEqual(value.runGeneration, expected.runGeneration) ||
    !isDeepStrictEqual(value.runtime, expected.runtime) ||
    !isDeepStrictEqual(value.candidate, expected.candidate)
  ) {
    throw new Error("Post-support network-policy smoke differs from its exact binding");
  }
  assertRetainedRunGeneration(value.runGeneration);
  assertRunTimes(value.startedAt, value.completedAt);
  const expectedPolicy = {
    declaredMode: networkPolicyIdentity.mode,
    appliedMode: "fixtures_only",
    routeCount: networkPolicyIdentity.routeCount,
    sha256: networkPolicyIdentity.sha256,
    encodedBytes: networkPolicyIdentity.encodedBytes,
    compiledRouteCount: networkPolicyIdentity.routeCount + 1,
    coverage:
      "common_non_get_http_https_and_best_effort_private_ipv4_localhost_default_port_ipv6_literals",
    excluded:
      "ipv6_cidr_and_non_default_ipv6_ports_unrepresentable_in_frozen_native_url_matcher",
  };
  if (
    !isDeepStrictEqual(value.policy, expectedPolicy) ||
    !isDeepStrictEqual(value.fixture, {
      targetClass: "synthetic_reserved_invalid_origin",
      method: "GET",
      routeDecision: "fixture_fulfill",
    }) ||
    !isDeepStrictEqual(value.result, {
      outcome: "quiescent",
      requestCount: 1,
      requestMethods: ["GET"],
      routeDecisionCount: 1,
      liveDecisionCount: 0,
      cleanup: "graceful_session_close",
    })
  ) {
    throw new Error("Post-support network-policy smoke is not exact fixture-only admission proof");
  }
  return value;
}

export function assertPostSupportWildNetworkSmoke(value, { binding, identity, runtime, root }) {
  assertRetainedPostSupportWildNetworkSmoke(value, {
    candidate: projectWildCandidateIdentity(identity),
    corpusSha256: binding?.corpusSha256,
    executionAuthority: value?.executionAuthority,
    harnessCommit: binding?.harnessCommit,
    preflightLedgerSha256: binding?.preflightLedgerSha256,
    preregistrationCommit: binding?.preregistrationCommit,
    runGeneration: value?.runGeneration,
    runtime,
  });
  assertWildRunGeneration(value.runGeneration, root);
  return value;
}

export function projectPostSupportHarnessRuntime(value) {
  const hasHarnessSdk = Object.prototype.hasOwnProperty.call(value ?? {}, "harnessSdk");
  const hasFrozenHarnessSdkDependency = Object.prototype.hasOwnProperty.call(
    value ?? {},
    "frozenHarnessSdkDependency",
  );
  if (hasHarnessSdk === hasFrozenHarnessSdkDependency) {
    throw new Error(
      "Post-support wild harness runtime must expose exactly one SDK dependency identity",
    );
  }
  const projected = {
    node: value?.node,
    nodeExecutableBasename: value?.nodeExecutableBasename,
    nodeExecutableBytes: value?.nodeExecutableBytes,
    nodeExecutableSha256: value?.nodeExecutableSha256,
    frozenHarnessSdkDependency: hasHarnessSdk
      ? value.harnessSdk
      : value.frozenHarnessSdkDependency,
    crawlee: value?.crawlee,
    crawleeTree: value?.crawleeTree,
    playwright: value?.playwright,
    playwrightTree: value?.playwrightTree,
    installedNodeModulesTree: value?.installedNodeModulesTree,
    chromiumVersion: value?.chromiumVersion,
    chromiumExecutableBasename: value?.chromiumExecutableBasename,
    chromiumExecutableBytes: value?.chromiumExecutableBytes,
    chromiumExecutableSha256: value?.chromiumExecutableSha256,
    ...(value?.chromiumInstallationTree === undefined
      ? {}
      : { chromiumInstallationTree: value.chromiumInstallationTree }),
  };
  if (
    projected.node !== postSupportNodeVersion ||
    typeof projected.nodeExecutableBasename !== "string" ||
    !Number.isSafeInteger(projected.nodeExecutableBytes) ||
    projected.nodeExecutableBytes < 1 ||
    !sha256Pattern.test(projected.nodeExecutableSha256 ?? "") ||
    typeof projected.frozenHarnessSdkDependency !== "string" ||
    typeof projected.crawlee !== "string" ||
    !validTree(projected.crawleeTree) ||
    typeof projected.playwright !== "string" ||
    !validTree(projected.playwrightTree) ||
    !validTree(projected.installedNodeModulesTree) ||
    typeof projected.chromiumVersion !== "string" ||
    typeof projected.chromiumExecutableBasename !== "string" ||
    !Number.isSafeInteger(projected.chromiumExecutableBytes) ||
    projected.chromiumExecutableBytes < 1 ||
    !sha256Pattern.test(projected.chromiumExecutableSha256 ?? "") ||
    (projected.chromiumInstallationTree !== undefined &&
      !validTree(projected.chromiumInstallationTree))
  ) {
    throw new Error("Post-support wild harness runtime identity is incomplete");
  }
  return Object.freeze(projected);
}

async function observePinnedHarnessRuntime(binding, dependencies) {
  const projected = projectPostSupportHarnessRuntime(binding?.preflightRuntime);
  const observeHarnessRuntime =
    dependencies.observeHarnessRuntime ?? observePostSupportHarnessRuntime;
  const observed = projectPostSupportHarnessRuntime(await observeHarnessRuntime());
  if (!validTree(observed.chromiumInstallationTree)) {
    throw new Error("Post-support smoke Chromium installation tree identity is incomplete");
  }
  assertObservedPostSupportHarnessRuntime(
    withoutChromiumInstallationTree(observed),
    projected,
    "Post-support smoke harness runtime",
  );
  return observed;
}

function withoutChromiumInstallationTree(value) {
  const { chromiumInstallationTree: _installationTree, ...projected } = value;
  return Object.freeze(projected);
}

function assertExactSmokeAudit(requests, evidence) {
  if (
    requests?.complete !== true ||
    requests?.hasMore !== false ||
    evidence?.complete !== true ||
    evidence?.hasMore !== false ||
    !Array.isArray(requests.records) ||
    !Array.isArray(evidence.records)
  ) {
    throw new Error("Post-support network-policy smoke audit is incomplete");
  }
  const request = requests.records[0];
  const requestMethods = [...new Set(requests.records.map((record) => record.method))].sort();
  const routeDecisionRecords = evidence.records.filter((record) => record.kind === "route_decided");
  const correlated = evidence.records.filter((record) => record.requestId === request?.requestId);
  const responseHeaders = correlated.find((record) => record.kind === "response_headers");
  const liveDecisionCount = routeDecisionRecords.filter((record) => record.decision === "live").length;
  if (
    requests.records.length !== 1 ||
    !isDeepStrictEqual(requestMethods, ["GET"]) ||
    request?.url?.origin !== "https://stasis.invalid" ||
    request?.url?.path !== "/" ||
    !isDeepStrictEqual(request?.url?.queryKeys, []) ||
    request?.resourceKind !== "navigation" ||
    request?.mainFrame !== true ||
    request?.bodyBytes !== 0n ||
    routeDecisionRecords.length !== 1 ||
    routeDecisionRecords[0].decision !== "fixture_fulfill" ||
    routeDecisionRecords[0].requestId !== request.requestId ||
    !isDeepStrictEqual(correlated.map((record) => record.kind), [
      "request_started",
      "route_decided",
      "response_headers",
      "request_completed",
    ]) ||
    responseHeaders?.status !== 200 ||
    liveDecisionCount !== 0
  ) {
    throw new Error("Post-support network-policy smoke escaped its one synthetic read-only route");
  }
  return {
    requestCount: requests.records.length,
    requestMethods,
    routeDecisionCount: routeDecisionRecords.length,
    liveDecisionCount,
  };
}

async function claimFreshArtifactRoot(root) {
  try {
    await lstat(root);
    throw new Error("Post-support network-policy smoke requires a fresh nonexistent artifact root");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(root, { recursive: false });
  await assertExplicitRealDirectory(root, "post-support wild artifact root");
}

function configuredArtifactRoot(explicit) {
  const configured = explicit ?? process.env.STASIS_COMPAT_ARTIFACT_DIR;
  if (typeof configured !== "string" || !path.isAbsolute(configured)) {
    throw new Error("STASIS_COMPAT_ARTIFACT_DIR must be one explicit absolute fresh path");
  }
  const root = path.resolve(configured);
  if (!samePath(root, artifactRoot())) {
    throw new Error("Post-support smoke artifact root differs from STASIS_COMPAT_ARTIFACT_DIR");
  }
  return root;
}

async function assertExplicitRealDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  const root = path.resolve(value);
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(root), root)) {
    throw new Error(`${label} must be one real directory`);
  }
  return root;
}

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    process.version !== postSupportNodeVersion ||
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile ||
    typeof value?.sdk?.launch !== "function"
  ) {
    throw new TypeError("Post-support smoke requires one verified candidate on pinned Node");
  }
  return identity;
}

function assertExactKeys(value, keys, label) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())
  ) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function assertRetainedRunGeneration(value) {
  assertExactKeys(value, [
    "artifactRootPathSha256",
    "nonceSha256",
    "schema",
  ], "retained post-support network-policy smoke run generation");
  if (
    value.schema !== "stasis-wild-run-generation-v1" ||
    !sha256Pattern.test(value.nonceSha256 ?? "") ||
    !sha256Pattern.test(value.artifactRootPathSha256 ?? "")
  ) {
    throw new Error("Retained post-support network-policy smoke run generation is invalid");
  }
}

function assertRunTimes(startedAt, completedAt) {
  const start = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (
    typeof startedAt !== "string" ||
    typeof completedAt !== "string" ||
    !Number.isFinite(start) ||
    !Number.isFinite(completed) ||
    new Date(start).toISOString() !== startedAt ||
    new Date(completed).toISOString() !== completedAt ||
    completed < start
  ) {
    throw new Error("Post-support network-policy smoke timestamps are invalid");
  }
}

function validTree(value) {
  return value !== null &&
    typeof value === "object" &&
    sha256Pattern.test(value.sha256 ?? "") &&
    Number.isSafeInteger(value.fileCount) && value.fileCount > 0 &&
    Number.isSafeInteger(value.totalBytes) && value.totalBytes > 0;
}

function smokeFixture() {
  return {
    match: { method: "GET", url: { exact: smokeUrl } },
    fulfill: {
      status: 200,
      headers: [
        ["Content-Type", "text/html; charset=utf-8"],
        ["Cache-Control", "no-store"],
      ],
      body: {
        utf8: "<!doctype html><html><head><title>policy-smoke</title></head><body>ok</body></html>",
      },
    },
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
