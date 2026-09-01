import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  candidate,
  expectedVersions,
  networkPolicyIdentity,
  protocol,
} from "./config.mjs";
import { assertFrozenWildBinding } from "./binding.mjs";
import {
  verifyNetworkPolicyIdentity,
  writeNetworkPolicySmokeArtifact,
} from "./network-policy-smoke.mjs";
import { stasisLiveNetworkPolicy } from "./stasis-network.mjs";
import { createWildRunGeneration } from "./run-generation.mjs";
import { assertHostedCandidate } from "./stasis-observation.mjs";
import { candidateV03, loadVerifiedCandidateV03Sdk } from "../shared/candidate-v03.mjs";
import { sha256File } from "../shared/io.mjs";

const smokeUrl = "https://stasis.invalid/";

if (process.version !== expectedVersions.node) {
  throw new Error(`Node runtime mismatch: expected ${expectedVersions.node}, got ${process.version}`);
}
const artifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
if (typeof artifactRoot !== "string" || !path.isAbsolute(artifactRoot)) {
  throw new Error("STASIS_COMPAT_ARTIFACT_DIR must be one explicit absolute fresh path");
}
try {
  await lstat(artifactRoot);
  throw new Error("Network-policy smoke requires a fresh artifact root that does not exist");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const executablePath = process.env.STASIS_EXECUTABLE;
const [binding, executableSha256, sdk, nodeMetadata, nodeExecutableSha256] = await Promise.all([
  assertFrozenWildBinding(),
  assertHostedCandidate(executablePath),
  loadVerifiedCandidateV03Sdk(),
  stat(process.execPath),
  sha256File(process.execPath),
]);
const nodeIdentity = {
  version: process.version,
  executableBasename: path.basename(process.execPath),
  executableBytes: nodeMetadata.size,
  executableSha256: nodeExecutableSha256,
};
const expectedNodeIdentity = {
  version: binding.preflightRuntime.node,
  executableBasename: binding.preflightRuntime.nodeExecutableBasename,
  executableBytes: binding.preflightRuntime.nodeExecutableBytes,
  executableSha256: binding.preflightRuntime.nodeExecutableSha256,
};
if (JSON.stringify(nodeIdentity) !== JSON.stringify(expectedNodeIdentity)) {
  throw new Error("Network-policy smoke Node executable differs from the frozen preflight runtime");
}
const policy = stasisLiveNetworkPolicy();
verifyNetworkPolicyIdentity(policy);
const network = {
  mode: "fixtures_only",
  routes: [smokeFixture(), ...policy.routes],
};
if (network.routes.length !== networkPolicyIdentity.routeCount + 1) {
  throw new Error("Network-policy smoke did not submit the complete repaired policy");
}
await mkdir(artifactRoot, { recursive: false });
const claimedMetadata = await lstat(artifactRoot);
const claimedArtifactRoot = await realpath(artifactRoot);
if (
  !claimedMetadata.isDirectory() ||
  claimedMetadata.isSymbolicLink() ||
  (
    process.platform === "win32"
      ? claimedArtifactRoot.toLowerCase() !== path.resolve(artifactRoot).toLowerCase()
      : claimedArtifactRoot !== path.resolve(artifactRoot)
  )
) {
  throw new Error("Network-policy smoke artifact root resolves elsewhere");
}
const runGeneration = createWildRunGeneration(artifactRoot);
const startedAt = new Date().toISOString();
let runtime = null;
let session = null;
let closed = false;

try {
  runtime = await sdk.launch({ executablePath, commandTimeoutMs: 30_000 });
  session = await runtime.openSession(smokeUrl, {
    profile: candidate.profile,
    network,
    signal: AbortSignal.timeout(30_000),
  });
  if (session.url !== smokeUrl) {
    throw new Error("Network-policy smoke did not commit the exact synthetic fixture URL");
  }

  const settled = await session.settle(session.stateToken, {
    persistentWork: "report",
    maxVirtualTimeNs: 1_000_000_000n,
    maxControlTurns: 10_000n,
    wallIoTimeoutNs: 5_000_000_000n,
  });
  if (settled.outcome !== "quiescent") {
    throw new Error(`Network-policy smoke did not settle quiescently: ${settled.outcome}`);
  }

  const [requests, evidence] = await Promise.all([
    session.requests({ limit: 256 }),
    session.evidence({ limit: 256 }),
  ]);
  if (
    requests.complete !== true ||
    evidence.complete !== true ||
    requests.hasMore !== false ||
    evidence.hasMore !== false
  ) {
    throw new Error("Network-policy smoke audit is incomplete");
  }
  const requestMethods = [...new Set(requests.records.map((record) => record.method))].sort();
  const routeDecisionRecords = evidence.records
    .filter((record) => record.kind === "route_decided");
  const routeDecisions = routeDecisionRecords.map((record) => record.decision);
  const liveDecisionCount = routeDecisions.filter((decision) => decision === "live").length;
  const request = requests.records[0];
  const correlatedEvidence = evidence.records.filter(
    (record) => record.requestId === request?.requestId,
  );
  const correlatedKinds = correlatedEvidence.map((record) => record.kind);
  const responseHeaders = correlatedEvidence.find((record) => record.kind === "response_headers");
  if (
    requests.records.length !== 1 ||
    requestMethods.length !== 1 ||
    requestMethods[0] !== "GET" ||
    request?.url?.origin !== "https://stasis.invalid" ||
    request?.url?.path !== "/" ||
    !Array.isArray(request?.url?.queryKeys) ||
    request.url.queryKeys.length !== 0 ||
    request.resourceKind !== "navigation" ||
    request.mainFrame !== true ||
    request.bodyBytes !== 0n ||
    routeDecisions.length !== 1 ||
    routeDecisions[0] !== "fixture_fulfill" ||
    routeDecisionRecords[0].requestId !== request.requestId ||
    JSON.stringify(correlatedKinds) !== JSON.stringify([
      "request_started",
      "route_decided",
      "response_headers",
      "request_completed",
    ]) ||
    responseHeaders?.status !== 200 ||
    liveDecisionCount !== 0
  ) {
    throw new Error("Network-policy smoke escaped its single read-only fixture route");
  }

  await session.close({ timeoutMs: 5_000 });
  closed = true;
  const artifact = {
    schema: "stasis-wild-network-policy-smoke-v2",
    protocol,
    status: "passed",
    runGeneration,
    startedAt,
    completedAt: new Date().toISOString(),
    harnessCommit: binding.harnessCommit,
    preregistrationCommit: binding.preregistrationCommit,
    corpusSha256: binding.corpusSha256,
    preflightLedgerSha256: binding.preflightLedgerSha256,
    node: nodeIdentity,
    candidate: {
      revision: candidate.revision,
      version: candidate.version,
      profile: candidate.profile,
      executableSha256,
      sdkArchiveSha256: candidate.sdkSha256,
      sdkTreeSha256: candidateV03.sdkTreeSha256,
      sdkTreeFileCount: candidateV03.sdkTreeFileCount,
      sdkTreeBytes: candidateV03.sdkTreeBytes,
    },
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
      requestCount: requests.records.length,
      requestMethods,
      routeDecisionCount: routeDecisions.length,
      liveDecisionCount,
      cleanup: "graceful_session_close",
    },
  };
  const reference = await writeNetworkPolicySmokeArtifact(artifact, {
    binding,
    executableSha256,
    runtimeIdentity: binding.preflightRuntime,
  });
  console.log(JSON.stringify({
    artifact: reference.path,
    sha256: reference.sha256,
    policyRouteCount: policy.routes.length,
    outcome: settled.outcome,
  }));
} finally {
  if (!closed) {
    let sessionClosed = false;
    if (session !== null) {
      try {
        await session.close({ timeoutMs: 5_000 });
        sessionClosed = true;
      } catch {
        // The original failure remains primary; fail-stop the owned process below.
      }
    }
    if (!sessionClosed && runtime !== null) await runtime.close().catch(() => undefined);
  }
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
