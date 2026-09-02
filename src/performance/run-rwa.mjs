import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRwaPerformanceHostIdentity,
  runRwaPerformanceAuthority,
  rwaPerformanceProtocol,
  rwaPerformanceTrack,
} from "./rwa.mjs";
import { assertPostSupportArtifactPrivacy } from "../post-support/artifact-privacy.mjs";
import {
  disposePostSupportCandidate,
  loadPostSupportCandidateSpec,
  postSupportExecutablePath,
  postSupportNodeVersion,
  postSupportProfile,
  postSupportVersion,
  verifyPostSupportCandidate,
} from "../post-support/candidate-identity.mjs";
import {
  buildCypressRunOptions,
  inspectRwaCheckout,
  loadCypressFromCheckout,
  probeRwaServers,
  rwaBaselineExpected,
} from "../rwa/run-cypress.mjs";
import {
  buildRwaServerEnvironment,
} from "../rwa/server-host.mjs";
import { runStasisRwaProof } from "../rwa/stasis-lane.mjs";
import {
  assertFreshSealedArtifactRoot,
  repositoryRoot,
  sha256File,
  writeJson,
} from "../shared/io.mjs";
import { rwaAuthCases, rwaAuthSource } from "../rwa/cases.mjs";

const expectedNodePlatform = "win32";
const expectedNodeArch = "x64";
const serverHostReadyTimeoutMs = 30_000;
const serverHostScriptPath = fileURLToPath(new URL("../rwa/server-host.mjs", import.meta.url));
const serverPreloadPath = fileURLToPath(new URL("../rwa/server-ipc-preload.cjs", import.meta.url));
const nodeVersionPattern = /^v22\.20\.0$/u;
const shaPattern = /^[a-f0-9]{40}$/u;
const artifactSchema = "stasis-v0.3.3-performance-rwa-artifact-v1";

export async function runSealedRwaPerformance({
  environment = process.env,
  spawnProcess = spawn,
  randomBytesImpl = randomBytes,
  hashFile = sha256File,
  inspectCheckout = inspectRwaCheckout,
  probeServers = probeRwaServers,
  loadCypress = loadCypressFromCheckout,
  verifyCandidate = verifyPostSupportCandidate,
  now = () => new Date(),
  writeArtifact = writeJson,
} = {}) {
  assertPinnedWindowsNodeRuntime();
  const workflowSource = loadWorkflowSourceProvenance(environment);
  const harness = inspectHarnessProvenance();
  const upstreamRoot = path.resolve(
    environment.RWA_ROOT ?? path.join("inputs", "cypress-realworld-app-28ca4d0"),
  );
  const candidate = await verifyCandidate(loadPostSupportCandidateSpec(environment));
  try {
    const [nodeExecutable, initialCheckout] = await Promise.all([
      inspectPinnedNodeExecutable(hashFile),
      inspectCheckout(upstreamRoot),
    ]);
    if (!initialCheckout.valid) {
      throw new Error(`RWA checkout preflight failed: ${initialCheckout.violations.join("; ")}`);
    }
    const cypress = await loadCypress(upstreamRoot);
    if (cypress === null || typeof cypress !== "object" || typeof cypress.run !== "function") {
      throw new TypeError("The pinned checkout did not provide the Cypress module API");
    }

    const hostFacts = await collectHostFacts({
      environment,
      nodeExecutable,
      randomBytesImpl,
    });
    const lifecycleEvidence = {
      startup: null,
      postflight: null,
      shutdownSignal: null,
    };
    await assertFreshSealedArtifactRoot();

    const raw = await runRwaPerformanceAuthority({
      preflight: async () => ({
        sameHostVerified: true,
        host: hostFacts.host,
      }),
      startRwaServers: async () => {
        const child = spawnRwaServerHost({
          environment,
          spawnProcess,
          upstreamRoot,
        });
        try {
          const roles = await waitForRwaHostReady(child);
          const servers = await probeServers({ upstreamRoot });
          lifecycleEvidence.startup = {
            checkout: await inspectCheckout(upstreamRoot),
            servers,
            roles,
          };
          return { child, roles };
        } catch (error) {
          await stopRwaServerHostNow(child);
          throw error;
        }
      },
      stopRwaServers: async ({ serverContext, startupComplete }) => {
        if (startupComplete && serverContext !== null) {
          lifecycleEvidence.postflight = {
            checkout: await inspectCheckout(upstreamRoot),
            servers: await probeServers({ upstreamRoot }),
          };
          lifecycleEvidence.shutdownSignal = await requestRwaHostStop(serverContext.child);
          return;
        }
        if (serverContext?.child !== undefined) {
          lifecycleEvidence.shutdownSignal = await requestRwaHostStop(serverContext.child);
        }
      },
      runCypressLane: async () => cypress.run(buildCypressRunOptions(upstreamRoot)),
      projectCypressResult: async (value) => projectCypressLaneResult(value, { upstreamRoot, host: hostFacts.host }),
      runStasisLane: async () => runStasisRwaProof(postSupportExecutablePath(candidate), {
        launchRuntime: candidate.sdk.launch,
        expectedExecutableSha256: candidate.identity.windows.executable.sha256,
        expectedNodeVersion: postSupportNodeVersion,
        hashExecutable: hashFile,
        profile: postSupportProfile,
        runner: "stasis-v0.3.3",
        sdkLabel: `@oxhq/stasis@${postSupportVersion}`,
      }),
      projectStasisResult: async (value) => projectStasisLaneResult(value, { host: hostFacts.host, candidate }),
      writeRaw: async (raw) => {
        const artifact = createRwaPerformanceArtifact({
          raw,
          hostFacts,
          candidate,
          workflowSource,
          harness,
          nodeExecutable,
          lifecycleEvidence,
          now: now(),
        });
        assertPostSupportArtifactPrivacy(artifact);
        await writeArtifact("performance/rwa-raw.json", artifact);
      },
    });
    return raw;
  } finally {
    await disposePostSupportCandidate(candidate);
  }
}

export function spawnRwaServerHost({
  environment = process.env,
  spawnProcess = spawn,
  upstreamRoot,
} = {}) {
  const root = path.resolve(upstreamRoot);
  return spawnProcess(process.execPath, [serverHostScriptPath], {
    cwd: root,
    env: {
      ...buildRwaServerEnvironment(root, environment),
      RWA_ROOT: root,
      STASIS_COMPAT_RWA_SERVER_PRELOAD_PATH: serverPreloadPath,
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true,
  });
}

export function waitForRwaHostReady(child, timeoutMs = serverHostReadyTimeoutMs) {
  return waitForRwaHostLifecycle(child, "rwa-host-ready", timeoutMs);
}

export async function requestRwaHostStop(child, timeoutMs = serverHostReadyTimeoutMs) {
  if (child.exitCode !== null || child.killed === true) {
    return { stopped: true, status: child.exitCode ?? 0 };
  }
  if (typeof child.send !== "function") {
    throw new TypeError("The sealed RWA server host does not expose an IPC channel");
  }
  child.send({ type: "rwa-host-stop" });
  const message = await waitForRwaHostLifecycle(child, "rwa-host-stopped", timeoutMs);
  return { stopped: true, status: child.exitCode ?? 0, message };
}

export function projectCypressLaneResult(value, { upstreamRoot, host } = {}) {
  const root = path.resolve(upstreamRoot ?? ".");
  if (value === null || typeof value !== "object" || !Array.isArray(value.runs)) {
    throw new TypeError("Cypress did not return a structured single-spec result");
  }
  const run = value.runs[0];
  if (value.runs.length !== 1 || run === undefined || run === null || typeof run !== "object") {
    throw new TypeError("Cypress must retain exactly one structured spec run");
  }
  if (
    value.cypressVersion !== rwaBaselineExpected.cypressVersion ||
    value.browserName !== "electron" ||
    value.browserVersion !== rwaBaselineExpected.electronVersion ||
    value.browserPath !== "" ||
    value.config?.baseUrl !== rwaBaselineExpected.baseUrl ||
    value.config?.expose?.apiUrl !== rwaBaselineExpected.apiUrl ||
    value.config?.resolvedNodeVersion !== rwaBaselineExpected.resolvedNodeVersion ||
    value.config?.testIsolation !== true ||
    value.config?.viewportWidth !== rwaBaselineExpected.viewport.width ||
    value.config?.viewportHeight !== rwaBaselineExpected.viewport.height
  ) {
    throw new TypeError("Cypress runtime identity drifted from the preregistered runner");
  }
  const retries = projectRetryCounts(value.config?.retries);
  if (retries.openMode !== 0 || retries.runMode !== 0) {
    throw new TypeError("Cypress retries must remain zero in both open and run modes");
  }
  const relativeSpec = normalizeRelativeSpec(run.spec, root);
  if (relativeSpec !== rwaAuthSource.specPath) {
    throw new TypeError("Cypress executed a different spec than the frozen auth track");
  }
  if (run.error !== null) {
    throw new TypeError("Cypress spec execution retained a run-level error");
  }
  const tests = Array.isArray(run.tests) ? run.tests : [];
  if (tests.length !== rwaAuthCases.length || value.totalTests !== rwaAuthCases.length || run.stats?.tests !== rwaAuthCases.length) {
    throw new TypeError("Cypress must retain the exact eight-case denominator");
  }

  const cases = rwaAuthCases.map((expectedCase, index) => {
    const observed = tests[index];
    const expectedTitle = [rwaAuthSource.describeTitle, expectedCase.source.title];
    if (observed === null || typeof observed !== "object") {
      throw new TypeError(`Cypress test ${index + 1} is not structured`);
    }
    if (!sameStringArray(observed.title, expectedTitle)) {
      throw new TypeError("Cypress test order or title drifted from the frozen source");
    }
    const attempts = Array.isArray(observed.attempts) ? observed.attempts : [];
    if (attempts.length > 1) throw new TypeError("Cypress test retries must remain zero");
    const state = canonicalCypressState(observed.state);
    const passed = state === "passed" && attempts.length === 1 && canonicalCypressState(attempts[0]?.state) === "passed";
    const executed = attempts.length === 1;
    const oracleStatus = passed ? "passed" : executed ? "failed" : "not_reached";
    return {
      ordinal: expectedCase.ordinal,
      id: expectedCase.id,
      classification: passed ? "PASS_EQUIVALENT" : "BASELINE_FAILURE",
      seeded: executed,
      intentCompleted: executed,
        attemptCount: attempts.length,
        oracles: expectedCase.oracles.map(({ id }) => ({ id, status: oracleStatus })),
        allOraclesPassed: passed,
        behaviorallySupported: passed,
        stateEvidence: {
          attemptOrdinal: attempts.length,
          beforeEachSeedHookLineIdentity: "cypress/tests/ui/auth.spec.ts:7-18",
          beforeEachSeedHookSource: cypressBeforeEachSeedHookSource,
          beforeEachSeedHookSourceSha256: cypressBeforeEachSeedHookSourceSha256,
          engineInstanceOrdinal: 1,
          seedHookOrdinal: expectedCase.ordinal,
        testIsolation: "upstream-cypress-test-isolation",
      },
      semanticDifferenceIds: [],
    };
  });
  const seededIntentCount = cases.filter(({ seeded }) => seeded).length;
  const completedIntentCount = cases.filter(({ intentCompleted }) => intentCompleted).length;
  return {
    schema: "stasis-v0.3.3-performance-rwa-lane-result-v1",
    runner: "cypress",
    track: rwaPerformanceTrack,
    hostIdentityDigest: host?.identityDigest,
    hostInstanceDigest: host?.instanceDigest,
    engineStartupIncluded: true,
    engineStartupCount: 1,
    frameworkNativeWaiting: "cypress-command-and-assertion-retry",
    cleanupComplete: true,
    freshState: true,
    seedBeforeEveryIntent: true,
    selectedIntentCount: rwaAuthCases.length,
    seededIntentCount,
    completedIntentCount,
    retryCount: 0,
    sleepCount: 0,
    droppedFailureCount: 0,
    cases,
  };
}

export function projectStasisLaneResult(value, { host, candidate } = {}) {
  if (value === null || typeof value !== "object" || !Array.isArray(value.cases)) {
    throw new TypeError("Stasis did not return a structured eight-case result");
  }
  if (
    value.schema !== "stasis-compat-rwa-stasis-raw-v1" ||
    value.protocol !== "stasis-compat-bench-v1" ||
    value.track !== "rwa-auth" ||
    value.runner !== "stasis-v0.3.3" ||
    value.denominator !== rwaAuthCases.length ||
    value.versions?.sdk !== `@oxhq/stasis@${postSupportVersion}` ||
    value.versions?.node !== postSupportNodeVersion ||
    value.versions?.expectedNode !== postSupportNodeVersion ||
    value.versions?.nodeIdentityMatches !== true ||
    value.versions?.expectedExecutableSha256 !== candidate?.identity?.windows?.executable?.sha256 ||
    value.versions?.candidateIdentityMatches !== true ||
    value.rules?.retries !== 0 ||
    value.rules?.fallback !== false ||
    value.rules?.sleeps !== false ||
    value.rules?.domPolling !== false ||
    value.rules?.businessApiSubstitution !== false ||
    value.rules?.processPerCase !== 1 ||
    value.rules?.seedBeforeEveryCase !== true
  ) {
    throw new TypeError("Stasis runtime identity or runner rules drifted from the preregistered lane");
  }
  if (value.cases.length !== rwaAuthCases.length) {
    throw new TypeError("Stasis must retain the exact eight-case denominator");
  }
  let engineStartupCount = 0;
  let seededIntentCount = 0;
  let completedIntentCount = 0;
  let cleanupComplete = true;
  const cases = rwaAuthCases.map((expectedCase, index) => {
    const observed = value.cases[index];
    if (observed === null || typeof observed !== "object") {
      throw new TypeError(`Stasis case ${index + 1} is not structured`);
    }
    if (observed.id !== expectedCase.id || observed.ordinal !== expectedCase.ordinal) {
      throw new TypeError("Stasis case order drifted from the frozen auth track");
    }
    if (!sameStringArray(observed.semanticDifferenceIds, expectedCase.semanticDifferenceIds)) {
      throw new TypeError("Stasis semantic-difference disclosure drifted from the frozen auth track");
    }
    const stateEvidence = projectStasisStateEvidence(observed.checkpoints, expectedCase.ordinal);
    const seeded = stateEvidence.seedCheckpointStatus === "passed";
    const launched = stateEvidence.runtimeLaunchCheckpointStatus === "passed";
    const cleanedUp = stateEvidence.cleanupCheckpointStatus === "passed";
    const behaviorallySupported = observed.success === true;
    const oracles = expectedCase.oracles.map((oracle, oracleIndex) => ({
      id: oracle.id,
      status: projectOracleStatus(observed.oracles?.[oracleIndex]?.status),
    }));
    const allOraclesPassed = oracles.every(({ status }) => status === "passed");
    if (launched) engineStartupCount += 1;
    if (seeded) seededIntentCount += 1;
    if (behaviorallySupported) completedIntentCount += 1;
    cleanupComplete &&= cleanedUp;
    return {
      ordinal: expectedCase.ordinal,
      id: expectedCase.id,
      classification: observed.classification,
      seeded,
      intentCompleted: behaviorallySupported,
      attemptCount: launched ? 1 : 0,
      oracles,
      allOraclesPassed,
      behaviorallySupported,
      stateEvidence,
      semanticDifferenceIds: [...observed.semanticDifferenceIds],
    };
  });
  return {
    schema: "stasis-v0.3.3-performance-rwa-lane-result-v1",
    runner: "stasis-v0.3.3",
    track: rwaPerformanceTrack,
    hostIdentityDigest: host?.identityDigest,
    hostInstanceDigest: host?.instanceDigest,
    engineStartupIncluded: true,
    engineStartupCount,
    frameworkNativeWaiting: "none",
    cleanupComplete,
    freshState: engineStartupCount === rwaAuthCases.length,
    seedBeforeEveryIntent: seededIntentCount === rwaAuthCases.length,
    selectedIntentCount: rwaAuthCases.length,
    seededIntentCount,
    completedIntentCount,
    retryCount: 0,
    sleepCount: 0,
    droppedFailureCount: 0,
    cases,
  };
}

export function createRwaPerformanceArtifact({
  raw,
  hostFacts,
  candidate,
  workflowSource,
  harness,
  nodeExecutable,
  lifecycleEvidence,
  now,
}) {
  const startup = lifecycleEvidence.startup;
  const postflight = lifecycleEvidence.postflight;
  const artifact = {
    schema: artifactSchema,
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    recordedAt: now.toISOString(),
    provenance: {
      harness: normalizeHarnessProvenance(harness),
      workflowSource: normalizeWorkflowSourceProvenance(workflowSource),
    },
    host: {
      facts: {
        platform: raw.host.platform,
        arch: raw.host.arch,
        runnerOs: raw.host.runnerOs,
        imageOs: raw.host.imageOs,
        imageVersion: raw.host.imageVersion,
        cpuModel: raw.host.cpuModel,
        logicalCpuCount: raw.host.logicalCpuCount,
      },
      classDigest: raw.host.identityDigest,
      machineInstanceSaltedDigest: raw.host.instanceDigest,
    },
    identities: {
      node: nodeExecutable,
      cypress: {
        packageVersion: rwaBaselineExpected.cypressVersion,
        browserName: "electron",
        browserVersion: rwaBaselineExpected.electronVersion,
        resolvedNodeVersion: rwaBaselineExpected.resolvedNodeVersion,
        viewport: structuredClone(rwaBaselineExpected.viewport),
        retries: structuredClone(rwaBaselineExpected.primaryRetries),
      },
      rwa: {
        repository: rwaAuthSource.repository,
        revision: rwaAuthSource.revision,
        tree: rwaBaselineExpected.tree,
        specBlobOid: rwaAuthSource.specBlobOid,
        specBlobSha256: rwaAuthSource.specBlobSha256,
        specWorktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
        seedBlobOid: rwaBaselineExpected.seed.blobOid,
        seedBlobSha256: rwaBaselineExpected.seed.blobSha256,
        seedWorktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
        buildTree: structuredClone(rwaBaselineExpected.buildTree),
        serverBodies: structuredClone(rwaBaselineExpected.serverBodies),
        endpoints: {
          appOrigin: rwaBaselineExpected.baseUrl,
          apiOrigin: rwaBaselineExpected.apiUrl,
        },
      },
      stasis: {
        candidate: structuredClone(candidate.identity),
        runtime: structuredClone(candidate.runtime),
      },
    },
    sealedRuntime: {
      startup: startup === null
        ? null
        : {
            checkout: projectCheckoutForArtifact(startup.checkout),
            servers: projectServersForArtifact(startup.servers),
          },
      postflight: postflight === null
        ? null
        : {
            checkout: projectCheckoutForArtifact(postflight.checkout),
            servers: projectServersForArtifact(postflight.servers),
          },
      continuity: {
        immutableCheckoutIdentity: startup !== null &&
          postflight !== null &&
          sameJson(
            projectCheckoutForArtifact(startup.checkout),
            projectCheckoutForArtifact(postflight.checkout),
          ),
        sameFrozenServerHostProcesses: startup !== null &&
          postflight !== null &&
          sameServerProcesses(startup.servers, postflight.servers),
        shutdownAcknowledged: lifecycleEvidence.shutdownSignal?.stopped === true,
      },
    },
    authorityRaw: projectAuthorityRawForArtifact(raw),
  };
  return artifact;
}

export async function collectHostFacts({
  environment = process.env,
  nodeExecutable,
  randomBytesImpl = randomBytes,
} = {}) {
  const imageOs = stringFact(environment.ImageOS ?? environment.IMAGE_OS ?? "windows-local", "imageOs");
  const imageVersion = stringFact(
    environment.ImageVersion ?? environment.IMAGE_VERSION ?? os.release(),
    "imageVersion",
  );
  const cpuModel = stringFact(os.cpus()?.[0]?.model ?? "unknown-cpu", "cpuModel");
  const logicalCpuCount = typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
  const salt = randomBytesImpl(32);
  const host = createRwaPerformanceHostIdentity({
    platform: process.platform,
    arch: process.arch,
    runnerOs: environment.RUNNER_OS ?? "Windows",
    imageOs,
    imageVersion,
    cpuModel,
    logicalCpuCount,
    instanceDigest: createHash("sha256").update(salt).update(
      JSON.stringify({
        computerName: environment.COMPUTERNAME ?? os.hostname(),
        cpuModel,
        logicalCpuCount,
        nodeExecutableSha256: nodeExecutable.sha256,
      }),
      "utf8",
    ).digest("hex"),
  });
  return { host };
}

export function inspectHarnessProvenance() {
  return {
    revision: exactGitSha(runGit(repositoryRoot, ["rev-parse", "--verify", "HEAD"]), "Harness revision"),
    tree: exactGitSha(runGit(repositoryRoot, ["rev-parse", "HEAD^{tree}"]), "Harness tree"),
  };
}

export function loadWorkflowSourceProvenance(environment = process.env) {
  const revision = exactGitSha(
    environment.STASIS_PERFORMANCE_WORKFLOW_SOURCE_SHA ?? environment.GITHUB_SHA,
    "Workflow source SHA",
  );
  const ref = exactRef(
    environment.STASIS_PERFORMANCE_WORKFLOW_SOURCE_REF ?? environment.GITHUB_REF,
    "Workflow source ref",
  );
  return { revision, ref };
}

export async function inspectPinnedNodeExecutable(hashFile = sha256File) {
  const metadata = await stat(process.execPath);
  const sha256 = await hashFile(process.execPath);
  if (
    metadata.size !== rwaBaselineExpected.nodeExecutable.bytes ||
    sha256 !== rwaBaselineExpected.nodeExecutable.sha256
  ) {
    throw new Error("The benchmark runner requires the exact frozen Node executable bytes");
  }
  return {
    version: process.version,
    executableSha256: sha256,
    executableBytes: metadata.size,
  };
}

function assertPinnedWindowsNodeRuntime() {
  if (
    process.platform !== expectedNodePlatform ||
    process.arch !== expectedNodeArch ||
    !nodeVersionPattern.test(process.version)
  ) {
    throw new Error("The RWA performance adapter requires Node v22.20.0 on Windows x64");
  }
}

function waitForRwaHostLifecycle(child, expectedType, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedType}`));
    }, timeoutMs);
    timer.unref?.();
    const onMessage = (message) => {
      if (message?.type !== expectedType) return;
      cleanup();
      resolve(message);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`RWA server host exited before ${expectedType}: ${signal ?? code}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function stopRwaServerHostNow(child, timeoutMs = 5_000) {
  try {
    await requestRwaHostStop(child, timeoutMs);
    return;
  } catch {
    terminateProcessTree(child.pid);
    await waitForChildExit(child, timeoutMs).catch(() => {});
  }
}

function projectAuthorityRawForArtifact(raw) {
  return structuredClone(raw);
}

function projectCheckoutForArtifact(value) {
  return {
    valid: value.valid,
    violations: [...value.violations],
    revision: value.revision,
    tree: value.tree,
    detached: value.detached,
    authSpec: {
      blobOid: value.authSpec.blobOid,
      blobSha256: value.authSpec.blobSha256,
      worktreeSha256: value.authSpec.worktreeSha256,
    },
    seed: {
      blobOid: value.seed.blobOid,
      blobSha256: value.seed.blobSha256,
      worktreeSha256: value.seed.worktreeSha256,
    },
    generatedRuntimeFiles: structuredClone(value.generatedRuntimeFiles),
    runtimeCache: structuredClone(value.runtimeCache),
    localEnvironmentFiles: structuredClone(value.localEnvironmentFiles),
    ambientOverrides: structuredClone(value.ambientOverrides),
    trackedStatusEntries: [...value.trackedStatusEntries],
    runtimeDatabase: {
      blobOid: value.runtimeDatabase.blobOid,
      blobSha256: value.runtimeDatabase.blobSha256,
      worktreeSha256: value.runtimeDatabase.worktreeSha256,
      newlineOnlyDifference: value.runtimeDatabase.newlineOnlyDifference,
      allowedRuntimeMutation: value.runtimeDatabase.allowedRuntimeMutation,
    },
  };
}

function projectServersForArtifact(value) {
  return value.map((server) => ({
    name: server.name,
    url: server.url,
    status: server.status,
    contentType: server.contentType,
    bodyBytes: server.bodyBytes,
    bodySha256: server.bodySha256,
    listener: {
      port: server.listener.port,
      processName: server.listener.processName,
      nodeVersion: server.listener.nodeVersion,
      executableBytes: server.listener.executableBytes,
      executableSha256: server.listener.executableSha256,
      launcherMatchesFrozenHost: server.listener.launcherMatchesFrozenHost,
      commandMatchesPinnedRole: server.listener.commandMatchesPinnedRole,
      scriptRole: server.listener.scriptRole,
    },
    ...(server.name !== "frontend"
      ? {}
      : {
          servedBuildTree: structuredClone(server.servedBuildTree),
          generatedRuntimeFiles: structuredClone(server.generatedRuntimeFiles),
          runtimeCache: structuredClone(server.runtimeCache),
          localEnvironmentFiles: structuredClone(server.localEnvironmentFiles),
          ambientOverrides: structuredClone(server.ambientOverrides),
        }),
  }));
}

function sameServerProcesses(left, right) {
  return sameJson(
    left.map(({ listener }) => ({
      port: listener.port,
      processId: listener.processId,
      launcherProcessId: listener.launcherProcessId,
    })),
    right.map(({ listener }) => ({
      port: listener.port,
      processId: listener.processId,
      launcherProcessId: listener.launcherProcessId,
    })),
  );
}

function projectRetryCounts(value) {
  if (typeof value === "number") return { openMode: 0, runMode: value };
  return {
    openMode: value?.openMode ?? 0,
    runMode: value?.runMode ?? 0,
  };
}

function canonicalCypressState(value) {
  if (value === "passed" || value === "failed" || value === "pending" || value === "skipped") {
    return value;
  }
  throw new TypeError("Cypress test state drifted from the structured result vocabulary");
}

function normalizeRelativeSpec(spec, upstreamRoot) {
  if (typeof spec === "string") {
    return path.relative(upstreamRoot, path.resolve(spec)).replaceAll("\\", "/");
  }
  if (spec !== null && typeof spec === "object" && typeof spec.relative === "string") {
    return spec.relative.replaceAll("\\", "/");
  }
  throw new TypeError("Cypress spec projection is invalid");
}

function findCheckpoint(checkpoints, phase) {
  if (!Array.isArray(checkpoints)) throw new TypeError("Stasis checkpoints must remain structured");
  const matches = checkpoints.filter((checkpoint) =>
    checkpoint !== null &&
    typeof checkpoint === "object" &&
    checkpoint.phase === phase,
  );
  if (matches.length !== 1) {
    throw new TypeError(`Stasis checkpoints must retain exactly one ${phase} checkpoint`);
  }
  return matches[0];
}

function projectStasisStateEvidence(checkpoints, expectedOrdinal) {
  const seedCheckpoint = findCheckpoint(checkpoints, "seed");
  const runtimeLaunchCheckpoint = findCheckpoint(checkpoints, "runtime-launch");
  const cleanupCheckpoint = findCheckpoint(checkpoints, "cleanup");
  const seedCheckpointSequence = exactPositiveSafeInteger(
    seedCheckpoint.sequence,
    "Stasis seed checkpoint sequence",
  );
  const runtimeLaunchCheckpointSequence = exactPositiveSafeInteger(
    runtimeLaunchCheckpoint.sequence,
    "Stasis runtime-launch checkpoint sequence",
  );
  const cleanupCheckpointSequence = exactPositiveSafeInteger(
    cleanupCheckpoint.sequence,
    "Stasis cleanup checkpoint sequence",
  );
  if (
    seedCheckpointSequence >= runtimeLaunchCheckpointSequence ||
    runtimeLaunchCheckpointSequence >= cleanupCheckpointSequence
  ) {
    throw new TypeError(
      "Stasis checkpoint sequences must increase seed < runtime-launch < cleanup",
    );
  }
  if (
    seedCheckpoint.status !== "passed" ||
    runtimeLaunchCheckpoint.status !== "passed" ||
    cleanupCheckpoint.status !== "passed" ||
    runtimeLaunchCheckpoint.freshNativeProcess !== true
  ) {
    throw new TypeError("Stasis checkpoint evidence drifted from the sealed runner contract");
  }
  return {
    cleanupCheckpointPhase: cleanupCheckpoint.phase,
    cleanupCheckpointSequence,
    cleanupCheckpointStatus: cleanupCheckpoint.status,
    engineInstanceOrdinal: expectedOrdinal,
    runtimeLaunchCheckpointPhase: runtimeLaunchCheckpoint.phase,
    runtimeLaunchCheckpointSequence,
    runtimeLaunchCheckpointStatus: runtimeLaunchCheckpoint.status,
    runtimeLaunchFreshProcess: runtimeLaunchCheckpoint.freshNativeProcess,
    seedCheckpointPhase: seedCheckpoint.phase,
    seedCheckpointSequence,
    seedCheckpointStatus: seedCheckpoint.status,
    seedOrdinal: expectedOrdinal,
  };
}

function projectOracleStatus(value) {
  if (value === "PASS") return "passed";
  if (value === "FAIL") return "failed";
  if (value === "NOT_REACHED") return "not_reached";
  throw new TypeError("Stasis oracle status drifted from the frozen vocabulary");
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStringArray(left, right) {
  return Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function stringFact(value, name) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError(`Invalid host ${name}`);
  }
  return value;
}

function exactPositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be one positive safe integer`);
  }
  return value;
}

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function exactGitSha(value, label) {
  if (typeof value !== "string" || !shaPattern.test(value)) {
    throw new TypeError(`${label} must be one exact lowercase 40-hex SHA`);
  }
  return value;
}

function exactRef(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new TypeError(`${label} is required`);
  }
  return value;
}

function normalizeHarnessProvenance(value) {
  if (value === null || typeof value !== "object") {
    throw new TypeError("Harness provenance is required");
  }
  return {
    revision: exactGitSha(value.revision, "Harness revision"),
    tree: exactGitSha(value.tree, "Harness tree"),
  };
}

function normalizeWorkflowSourceProvenance(value) {
  if (value === null || typeof value !== "object") {
    throw new TypeError("Workflow source provenance is required");
  }
  return {
    revision: exactGitSha(value.revision, "Workflow source SHA"),
    ref: exactRef(value.ref, "Workflow source ref"),
  };
}

function terminateProcessTree(processId) {
  if (!Number.isSafeInteger(processId) || processId < 1) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(processId), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(processId, "SIGTERM");
  } catch {}
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.killed === true) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the RWA server host to exit"));
    }, timeoutMs);
    timer.unref?.();
    const onExit = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

const cypressBeforeEachSeedHookSource = [
  "  beforeEach(function () {",
  '    cy.task("db:seed");',
  "",
  '    cy.intercept("POST", "/users").as("signup");',
  '    cy.intercept("POST", apiGraphQL, (req) => {',
  "      const { body } = req;",
  "",
  '      if (body.hasOwnProperty("operationName") && body.operationName === "CreateBankAccount") {',
  '        req.alias = "gqlCreateBankAccountMutation";',
  "      }",
  "    });",
  "  });",
].join("\n");
const cypressBeforeEachSeedHookSourceSha256 =
  "970d46adadf8ef6acdf4c5544a7fae7a1d5ec525ce0549217a5ceb41414c1953";

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

async function main() {
  const raw = await runSealedRwaPerformance();
  console.log(JSON.stringify({
    schema: raw.schema,
    protocol: raw.protocol,
    track: raw.track,
    authority: raw.authority,
  }));
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  await main();
}
