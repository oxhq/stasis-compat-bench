import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  candidate,
  networkPolicyIdentity,
  networkPolicySmokePath,
  protocol,
} from "./config.mjs";
import { serializeWildArtifact, writeWildArtifactJson } from "./artifact-privacy.mjs";
import { candidateV03 } from "../shared/candidate-v03.mjs";
import { artifactRoot, sha256File } from "../shared/io.mjs";
import { assertWildRunGeneration } from "./run-generation.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;

export function verifyNetworkPolicyIdentity(policy) {
  const encoded = JSON.stringify(policy);
  const observed = {
    mode: policy?.mode,
    routeCount: Array.isArray(policy?.routes) ? policy.routes.length : -1,
    sha256: createHash("sha256").update(encoded, "utf8").digest("hex"),
    encodedBytes: Buffer.byteLength(encoded, "utf8"),
  };
  if (!isDeepStrictEqual(observed, networkPolicyIdentity)) {
    throw new Error("Wild native network policy differs from its frozen repaired identity");
  }
  return Object.freeze(observed);
}

export async function writeNetworkPolicySmokeArtifact(value, context) {
  assertNetworkPolicySmokeArtifact(value, { ...context, root: artifactRoot() });
  const destination = await writeWildArtifactJson(networkPolicySmokePath, value);
  return Object.freeze({
    path: networkPolicySmokePath,
    sha256: await sha256File(destination),
  });
}

export async function readVerifiedNetworkPolicySmoke({
  binding,
  executableSha256,
  runtimeIdentity,
  root = artifactRoot(),
  expectedReference,
}) {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.join(absoluteRoot, networkPolicySmokePath);
  const [rootMetadata, fileMetadata] = await Promise.all([
    lstat(absoluteRoot),
    lstat(absolutePath),
  ]);
  if (
    !rootMetadata.isDirectory() ||
    rootMetadata.isSymbolicLink() ||
    !fileMetadata.isFile() ||
    fileMetadata.isSymbolicLink()
  ) {
    throw new Error("Wild network-policy smoke must be one real root-level artifact");
  }
  const [resolvedRoot, resolvedPath] = await Promise.all([
    realpath(absoluteRoot),
    realpath(absolutePath),
  ]);
  if (!samePath(resolvedRoot, absoluteRoot) || !samePath(resolvedPath, absolutePath)) {
    throw new Error("Wild network-policy smoke resolves outside its exact artifact path");
  }

  const bytes = await readFile(absolutePath);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Wild network-policy smoke is not valid JSON");
  }
  if (!bytes.equals(Buffer.from(serializeWildArtifact(value), "utf8"))) {
    throw new Error("Wild network-policy smoke is not the canonical privacy projection");
  }
  assertNetworkPolicySmokeArtifact(value, { binding, executableSha256, runtimeIdentity, root: absoluteRoot });
  const reference = Object.freeze({
    path: networkPolicySmokePath,
    sha256: sha256(bytes),
  });
  if (expectedReference !== undefined && !isDeepStrictEqual(reference, expectedReference)) {
    throw new Error("Wild result identity does not bind the exact network-policy smoke artifact");
  }
  return Object.freeze({ value: Object.freeze(value), reference });
}

export function assertNetworkPolicySmokeReference(value) {
  assertExactKeys(value, ["path", "sha256"], "network-policy smoke reference");
  if (value.path !== networkPolicySmokePath || !sha256Pattern.test(value.sha256 ?? "")) {
    throw new Error("Wild result has an invalid network-policy smoke reference");
  }
}

export function assertSmokePrecedesPairedRun(smoke, pairedStartedAt) {
  const smokeCompleted = Date.parse(smoke?.completedAt);
  const pairedStarted = Date.parse(pairedStartedAt);
  if (
    !Number.isFinite(smokeCompleted) ||
    !Number.isFinite(pairedStarted) ||
    smokeCompleted > pairedStarted
  ) {
    throw new Error("Network-policy smoke must complete before the paired run starts");
  }
}

function assertNetworkPolicySmokeArtifact(value, { binding, executableSha256, runtimeIdentity, root }) {
  assertExactKeys(value, [
    "candidate",
    "completedAt",
    "corpusSha256",
    "fixture",
    "harnessCommit",
    "node",
    "policy",
    "preflightLedgerSha256",
    "preregistrationCommit",
    "protocol",
    "result",
    "runGeneration",
    "schema",
    "startedAt",
    "status",
  ], "network-policy smoke artifact");
  if (
    value.schema !== "stasis-wild-network-policy-smoke-v2" ||
    value.protocol !== protocol ||
    value.status !== "passed" ||
    !commitPattern.test(value.harnessCommit ?? "") ||
    !commitPattern.test(value.preregistrationCommit ?? "") ||
    !sha256Pattern.test(value.corpusSha256 ?? "") ||
    !sha256Pattern.test(value.preflightLedgerSha256 ?? "") ||
    value.harnessCommit !== binding?.harnessCommit ||
    value.preregistrationCommit !== binding?.preregistrationCommit ||
    value.corpusSha256 !== binding?.corpusSha256 ||
    value.preflightLedgerSha256 !== binding?.preflightLedgerSha256
  ) {
    throw new Error("Network-policy smoke differs from the frozen harness/corpus binding");
  }
  assertRunTimes(value.startedAt, value.completedAt);
  assertWildRunGeneration(value.runGeneration, root);

  const expectedNode = {
    version: runtimeIdentity?.node,
    executableBasename: runtimeIdentity?.nodeExecutableBasename,
    executableBytes: runtimeIdentity?.nodeExecutableBytes,
    executableSha256: runtimeIdentity?.nodeExecutableSha256,
  };
  if (!isDeepStrictEqual(value.node, expectedNode)) {
    throw new Error("Network-policy smoke Node identity differs from the paired runtime");
  }
  const expectedCandidate = {
    revision: candidate.revision,
    version: candidate.version,
    profile: candidate.profile,
    executableSha256,
    sdkArchiveSha256: candidate.sdkSha256,
    sdkTreeSha256: candidateV03.sdkTreeSha256,
    sdkTreeFileCount: candidateV03.sdkTreeFileCount,
    sdkTreeBytes: candidateV03.sdkTreeBytes,
  };
  if (!isDeepStrictEqual(value.candidate, expectedCandidate)) {
    throw new Error("Network-policy smoke differs from the exact candidate identity");
  }
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
  if (!isDeepStrictEqual(value.policy, expectedPolicy)) {
    throw new Error("Network-policy smoke differs from the exact repaired policy identity");
  }
  if (!isDeepStrictEqual(value.fixture, {
    targetClass: "synthetic_reserved_invalid_origin",
    method: "GET",
    routeDecision: "fixture_fulfill",
  })) {
    throw new Error("Network-policy smoke fixture identity is invalid");
  }
  if (!isDeepStrictEqual(value.result, {
    outcome: "quiescent",
    requestCount: 1,
    requestMethods: ["GET"],
    routeDecisionCount: 1,
    liveDecisionCount: 0,
    cleanup: "graceful_session_close",
  })) {
    throw new Error("Network-policy smoke result is not exact network-free admission proof");
  }
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
    throw new Error("Network-policy smoke timestamps are invalid");
  }
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
