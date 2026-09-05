import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertFreshSealedArtifactRoot,
  repositoryRoot,
  writeJson,
} from "../shared/io.mjs";
import {
  buildNavigationCausalStasisIdentity,
  assertNavigationCausalHostOutcome,
  assertNavigationCausalHostRaw,
  createNavigationCausalHostOutcome,
  createNavigationCausalIdentity,
  createNavigationCausalProvenance,
  createStasisNavigationCausalRunner,
  navigationCausalHostLanes,
  runNavigationCausalHost,
} from "./navigation-causal.mjs";
import {
  assertAuthoritativeLinuxPerformanceCandidate,
  disposeLinuxPerformanceCandidate,
  linuxPerformanceExecutablePath,
  loadLinuxPerformanceCandidateSpec,
  verifyLinuxPerformanceCandidate,
} from "./linux-candidate.mjs";
import { observeLinuxEglRuntime } from "./linux-egl-runtime.mjs";
import {
  observeCrawlPerformanceHost,
  readCrawlHarnessCheckoutIdentity,
} from "./run-crawl.mjs";

export const navigationCausalHostEnvironmentName = "STASIS_NAVIGATION_CAUSAL_HOST";

const githubEnvironmentNames = Object.freeze({
  repository: "GITHUB_REPOSITORY",
  workflow: "GITHUB_WORKFLOW",
  job: "GITHUB_JOB",
  ref: "GITHUB_REF",
  runId: "GITHUB_RUN_ID",
  runAttempt: "GITHUB_RUN_ATTEMPT",
  sha: "GITHUB_SHA",
});

export function navigationCausalHostRawArtifactPath(hostLane) {
  assertHostLane(hostLane);
  return `performance/navigation-causal/navigation-causal-${hostLane}-raw.json`;
}

export function navigationCausalHostOutcomeArtifactPath(hostLane) {
  assertHostLane(hostLane);
  return `performance/navigation-causal/navigation-causal-${hostLane}-outcome.json`;
}

export async function runNavigationCausalCommand({
  environment = { ...process.env },
  now = () => process.hrtime.bigint(),
  assertFreshArtifactRoot = assertFreshSealedArtifactRoot,
  loadCandidateSpec = loadLinuxPerformanceCandidateSpec,
  verifyCandidate = verifyLinuxPerformanceCandidate,
  assertCandidate = assertAuthoritativeLinuxPerformanceCandidate,
  candidateExecutablePath = linuxPerformanceExecutablePath,
  disposeCandidate = disposeLinuxPerformanceCandidate,
  observeHost = observeCrawlPerformanceHost,
  observeEglRuntime = observeLinuxEglRuntime,
  loadProvenance = loadNavigationCausalProvenanceFromEnvironment,
  createRunner = createStasisNavigationCausalRunner,
  runHost = runNavigationCausalHost,
  writeRaw = writeJson,
} = {}) {
  const hostLane = requiredHostLane(environment);
  const spec = loadCandidateSpec(environment);
  const verified = await verifyCandidate(spec);
  assertCandidate(verified);
  let disposed = false;
  const disposeVerified = async () => {
    if (disposed) return;
    disposed = true;
    await disposeCandidate(verified);
  };

  try {
    const host = await observeHost({ environment });
    const provenance = await loadProvenance(environment, { hostLane });
    const eglRuntime = await observeEglRuntime();
    const stasis = buildNavigationCausalStasisIdentity(
      verified,
      host.hostClassDigest,
      eglRuntime,
    );
    const identity = createNavigationCausalIdentity({
      hostLane,
      host,
      provenance,
      stasis,
    });
    const artifactRoot = await assertFreshArtifactRoot();
    const raw = await runHost({
      identity,
      runner: createRunner({
        sdk: verified.sdk,
        sdkVersion: verified.identity.version,
        executablePath: candidateExecutablePath(verified),
        environment,
        now,
      }),
    });
    const rawPath = await writeRaw(navigationCausalHostRawArtifactPath(hostLane), raw);
    const outcome = createNavigationCausalHostOutcome(raw);
    const outcomePath = await writeRaw(
      navigationCausalHostOutcomeArtifactPath(hostLane),
      outcome,
    );
    await disposeVerified();
    return Object.freeze({ artifactRoot, rawPath, outcomePath, raw, outcome });
  } catch (error) {
    await disposeVerified();
    throw error;
  }
}

export async function loadNavigationCausalProvenanceFromEnvironment(
  environment = process.env,
  {
    hostLane = requiredHostLane(environment),
    checkoutRoot = repositoryRoot,
    readHarnessCheckoutIdentity = readCrawlHarnessCheckoutIdentity,
  } = {},
) {
  assertHostLane(hostLane);
  const checkout = await readHarnessCheckoutIdentity(checkoutRoot);
  return createNavigationCausalProvenance({
    provider: "github-actions",
    repository: required(environment, githubEnvironmentNames.repository),
    workflow: required(environment, githubEnvironmentNames.workflow),
    job: required(environment, githubEnvironmentNames.job),
    hostLane,
    runId: required(environment, githubEnvironmentNames.runId),
    runAttempt: required(environment, githubEnvironmentNames.runAttempt),
    workflowSourceSha: required(environment, githubEnvironmentNames.sha),
    workflowSourceRef: required(environment, githubEnvironmentNames.ref),
    harnessCheckoutRevision: checkout.revision,
    harnessCheckoutTree: checkout.tree,
    harnessCheckoutWorktree: checkout.worktree,
  });
}

export async function verifyNavigationCausalHostFiles(
  rawPath,
  outcomePath,
  { readBytes = readFile } = {},
) {
  const raw = await readCanonicalJsonFile(rawPath, "navigation causal host raw", readBytes);
  const outcome = await readCanonicalJsonFile(
    outcomePath,
    "navigation causal host outcome",
    readBytes,
  );
  assertNavigationCausalHostRaw(raw);
  assertNavigationCausalHostOutcome(outcome, raw);
  return Object.freeze({ raw, outcome });
}

function requiredHostLane(environment) {
  const value = required(environment, navigationCausalHostEnvironmentName);
  assertHostLane(value);
  return value;
}

function assertHostLane(value) {
  if (!navigationCausalHostLanes.includes(value)) {
    throw new TypeError(
      `${navigationCausalHostEnvironmentName} must be host-a or host-b`,
    );
  }
}

function required(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

async function main() {
  try {
    if (process.argv[2] === "verify") {
      if (process.argv.length !== 5) {
        throw new TypeError("verify requires absolute raw and outcome paths");
      }
      const result = await verifyNavigationCausalHostFiles(process.argv[3], process.argv[4]);
      console.log(result.outcome.status);
      return;
    }
    if (process.argv.length !== 2) {
      throw new TypeError("run-navigation-causal accepts no arguments or verify RAW OUTCOME");
    }
    const result = await runNavigationCausalCommand();
    console.log(result.rawPath);
    console.log(result.outcomePath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function readCanonicalJsonFile(filePath, label, readBytes) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new TypeError(`${label} path must be absolute`);
  }
  const bytes = await readBytes(filePath);
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  let value;
  try {
    value = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new TypeError(`${label} is not valid JSON`, { cause: error });
  }
  const canonical = Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
  if (!canonical.equals(buffer)) throw new TypeError(`${label} is not canonical JSON`);
  return value;
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
