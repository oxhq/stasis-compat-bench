import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createRwaInstalledPerformanceIdentity,
  createRwaPerformanceArtifact,
  inspectHarnessProvenance,
  loadWorkflowSourceProvenance,
  projectCypressLaneResult,
  projectStasisLaneResult,
  requestRwaHostStop,
  waitForRwaHostReady,
} from "../src/performance/run-rwa.mjs";
import { createRwaPerformanceHostIdentity } from "../src/performance/rwa.mjs";
import {
  postSupportNodeVersion,
  postSupportProfile,
  postSupportRevision,
  postSupportVersion,
} from "../src/post-support/candidate-identity.mjs";
import { assertPostSupportArtifactPrivacy } from "../src/post-support/artifact-privacy.mjs";
import { rwaAuthCases, rwaAuthSource } from "../src/rwa/cases.mjs";
import { rwaBaselineExpected } from "../src/rwa/run-cypress.mjs";
import { repositoryRoot } from "../src/shared/io.mjs";
import { FROZEN_IDENTITIES } from "../src/shared/manifest.mjs";
import { cleanHarnessWorktreeEvidence } from "../src/performance/harness-worktree.mjs";

const host = createRwaPerformanceHostIdentity({
  platform: "win32",
  arch: "x64",
  runnerOs: "Windows",
  imageOs: "windows-2025",
  imageVersion: "20260824.1",
  cpuModel: "Test CPU",
  logicalCpuCount: 8,
  instanceDigest: "b".repeat(64),
});

function validCypressResult() {
  const tests = rwaAuthCases.map((entry) => ({
    attempts: [{ state: "passed" }],
    displayError: null,
    duration: 10 + entry.ordinal,
    state: "passed",
    title: [rwaAuthSource.describeTitle, entry.source.title],
  }));
  return {
    browserName: "electron",
    browserPath: "",
    browserVersion: "138.0.7204.251",
    config: {
      baseUrl: "http://localhost:3000",
      expose: { apiUrl: "http://localhost:3001" },
      resolvedNodeVersion: "22.20.0",
      retries: { openMode: 0, runMode: 0 },
      testIsolation: true,
      viewportHeight: 1000,
      viewportWidth: 1280,
    },
    cypressVersion: "15.17.0",
    runs: [
      {
        error: null,
        spec: { relative: "cypress/tests/ui/auth.spec.ts" },
        stats: { failures: 0, passes: 8, pending: 0, skipped: 0, tests: 8 },
        tests,
      },
    ],
    totalTests: 8,
  };
}

function validStasisResult() {
  return {
    schema: "stasis-compat-rwa-stasis-raw-v1",
    protocol: "stasis-compat-bench-v1",
    track: "rwa-auth",
    runner: "stasis-v0.3.3",
    denominator: 8,
    versions: {
      sdk: "@oxhq/stasis@0.3.3",
      node: "v22.20.0",
      expectedNode: "v22.20.0",
      nodeIdentityMatches: true,
      expectedExecutableSha256: "a".repeat(64),
      candidateIdentityMatches: true,
    },
    rules: {
      retries: 0,
      fallback: false,
      sleeps: false,
      domPolling: false,
      businessApiSubstitution: false,
      processPerCase: 1,
      seedBeforeEveryCase: true,
    },
    cases: rwaAuthCases.map((entry) => ({
      id: entry.id,
      ordinal: entry.ordinal,
      classification: "PASS_WITH_SEMANTIC_DIFFERENCE",
      success: true,
      semanticDifferenceIds: [...entry.semanticDifferenceIds],
      checkpoints: [
        { sequence: 1, phase: "seed", status: "passed" },
        { sequence: 2, phase: "runtime-launch", status: "passed", freshNativeProcess: true },
        { sequence: 3, phase: "cleanup", status: "passed" },
      ],
      oracles: entry.oracles.map(({ id }) => ({ id, status: "PASS" })),
    })),
  };
}

function candidateIdentity() {
  return {
    schema: "stasis-post-support-candidate-identity-v1",
    repository: "oxhq/stasis",
    revision: postSupportRevision,
    version: postSupportVersion,
    profile: postSupportProfile,
    hostedSdkPackageTrain: {
      source: "github_actions_package_workflow",
      id: 33_506_181_780,
      attempt: 1,
    },
    windows: {
      source: "github_actions_package_workflow_ci_only_bundle",
      zip: { sha256: "c".repeat(64), bytes: 1 },
      executable: { sha256: "a".repeat(64), bytes: 1 },
    },
    sdk: {
      source: "hosted_package_train",
      archive: { sha256: "d".repeat(64), bytes: 1 },
      proof: { sha256: "e".repeat(64), bytes: 1 },
      tree: { sha256: "f".repeat(64), fileCount: 1, totalBytes: 1 },
    },
  };
}

function lifecycleServers() {
  const listener = {
    processId: 1234,
    processName: "node.exe",
    nodeVersion: "v22.20.0",
    executableBytes: rwaBaselineExpected.nodeExecutable.bytes,
    executableSha256: rwaBaselineExpected.nodeExecutable.sha256,
    launcherProcessId: 4321,
    launcherMatchesFrozenHost: true,
    commandMatchesPinnedRole: true,
  };
  return [
    {
      name: "frontend",
      url: "http://localhost:3000/",
      status: 200,
      contentType: rwaBaselineExpected.serverBodies.frontend.contentType,
      bodyBytes: rwaBaselineExpected.serverBodies.frontend.bytes,
      bodySha256: rwaBaselineExpected.serverBodies.frontend.sha256,
      listener: { ...listener, port: 3000, scriptRole: "scripts/testServer.ts" },
      servedBuildTree: structuredClone(rwaBaselineExpected.buildTree),
      generatedRuntimeFiles: { files: [] },
      runtimeCache: { path: ".cache", regularFileCount: 0 },
      localEnvironmentFiles: { pattern: ".env*", matchedPaths: [] },
      ambientOverrides: { presentNames: [] },
    },
    {
      name: "backend",
      url: "http://localhost:3001/",
      status: 200,
      contentType: rwaBaselineExpected.serverBodies.backend.contentType,
      bodyBytes: rwaBaselineExpected.serverBodies.backend.bytes,
      bodySha256: rwaBaselineExpected.serverBodies.backend.sha256,
      listener: { ...listener, port: 3001, scriptRole: "backend/app.ts" },
    },
  ];
}

function lifecycleCheckout() {
  return {
    valid: true,
    violations: [],
    root: "E:\\frozen-rwa",
    revision: rwaBaselineExpected.revision,
    tree: rwaBaselineExpected.tree,
    detached: true,
    authSpec: {
      path: rwaAuthSource.specPath,
      blobOid: rwaAuthSource.specBlobOid,
      blobSha256: rwaAuthSource.specBlobSha256,
      worktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
    },
    seed: structuredClone(rwaBaselineExpected.seed),
    generatedRuntimeFiles: { files: [] },
    runtimeCache: { path: ".cache", regularFileCount: 0 },
    localEnvironmentFiles: { pattern: ".env*", matchedPaths: [] },
    ambientOverrides: { presentNames: [] },
    trackedStatusEntries: [],
    runtimeDatabase: {
      path: rwaBaselineExpected.databasePath,
      blobOid: rwaBaselineExpected.seed.blobOid,
      blobSha256: rwaBaselineExpected.seed.blobSha256,
      worktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
      newlineOnlyDifference: false,
      allowedRuntimeMutation: false,
    },
  };
}

test("Cypress projection derives exact seed-hook evidence and retains structured baseline failures", () => {
  const result = validCypressResult();
  result.runs[0].tests[3].state = "failed";
  result.runs[0].tests[3].attempts[0].state = "failed";
  const projected = projectCypressLaneResult(result, {
    upstreamRoot: repositoryRoot,
    host,
  });
  assert.equal(projected.frameworkNativeWaiting, "cypress-command-and-assertion-retry");
  assert.equal(projected.cases[0].stateEvidence.beforeEachSeedHookLineIdentity, "cypress/tests/ui/auth.spec.ts:7-18");
  assert.equal(projected.cases[3].classification, "BASELINE_FAILURE");
  assert.equal(projected.cases[3].attemptCount, 1);
  assert.equal(projected.cases[3].oracles[0].status, "failed");
});

test("Stasis projection derives launch, seed, and cleanup evidence from checkpoints", () => {
  const projected = projectStasisLaneResult(validStasisResult(), {
    host,
    candidate: { identity: candidateIdentity() },
  });
  assert.equal(projected.engineStartupCount, 8);
  assert.equal(projected.frameworkNativeWaiting, "none");
  assert.deepEqual(projected.cases[0].stateEvidence, {
    cleanupCheckpointPhase: "cleanup",
    cleanupCheckpointSequence: 3,
    cleanupCheckpointStatus: "passed",
    engineInstanceOrdinal: 1,
    runtimeLaunchCheckpointPhase: "runtime-launch",
    runtimeLaunchCheckpointSequence: 2,
    runtimeLaunchCheckpointStatus: "passed",
    runtimeLaunchFreshProcess: true,
    seedCheckpointPhase: "seed",
    seedCheckpointSequence: 1,
    seedCheckpointStatus: "passed",
    seedOrdinal: 1,
  });
});

test("Stasis projection rejects non-increasing checkpoint sequences", () => {
  const result = validStasisResult();
  result.cases[0].checkpoints = [
    { sequence: 2, phase: "seed", status: "passed" },
    { sequence: 1, phase: "runtime-launch", status: "passed", freshNativeProcess: true },
    { sequence: 3, phase: "cleanup", status: "passed" },
  ];
  assert.throws(
    () => projectStasisLaneResult(result, {
      host,
      candidate: { identity: candidateIdentity() },
    }),
    /seed < runtime-launch < cleanup/u,
  );
});

test("workflow-source provenance requires exact SHA and distinct ref", () => {
  assert.deepEqual(loadWorkflowSourceProvenance({
    STASIS_PERFORMANCE_WORKFLOW_SOURCE_SHA: "1".repeat(40),
    STASIS_PERFORMANCE_WORKFLOW_SOURCE_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "oxhq/stasis",
    GITHUB_WORKFLOW: "Stasis v0.3.3 performance evidence",
    GITHUB_JOB: "windows-rwa",
    GITHUB_RUN_ID: "33840000000",
    GITHUB_RUN_ATTEMPT: "1",
    STASIS_PERFORMANCE_WORKFLOW_RUN_ID: "999",
    STASIS_PERFORMANCE_WORKFLOW_RUN_ATTEMPT: "9",
  }), {
    provider: "github-actions",
    repository: "oxhq/stasis",
    workflow: "Stasis v0.3.3 performance evidence",
    job: "windows-rwa",
    revision: "1".repeat(40),
    ref: "refs/heads/main",
    runId: "33840000000",
    runAttempt: "1",
  });
  assert.throws(
    () => loadWorkflowSourceProvenance({
      STASIS_PERFORMANCE_WORKFLOW_SOURCE_SHA: "not-a-sha",
      STASIS_PERFORMANCE_WORKFLOW_SOURCE_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "oxhq/stasis",
      GITHUB_WORKFLOW: "Stasis v0.3.3 performance evidence",
      GITHUB_JOB: "windows-rwa",
      GITHUB_RUN_ID: "33840000000",
      GITHUB_RUN_ATTEMPT: "1",
    }),
    /40-hex SHA/u,
  );
  for (const invalid of ["", "0", "01", "not-a-number"]) {
    assert.throws(
      () => loadWorkflowSourceProvenance({
        GITHUB_SHA: "1".repeat(40),
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: "oxhq/stasis",
        GITHUB_WORKFLOW: "Stasis v0.3.3 performance evidence",
        GITHUB_JOB: "windows-rwa",
        GITHUB_RUN_ID: invalid,
        GITHUB_RUN_ATTEMPT: "1",
      }),
      /canonical positive decimal/u,
    );
  }
});

test("RWA harness checkout evidence fails closed on tracked or untracked non-ignored files", () => {
  const calls = [];
  const clean = inspectHarnessProvenance({
    checkoutRoot: "C:\\harness",
    runGitImpl(root, args) {
      calls.push({ root, args });
      if (args[0] === "status") return "";
      return args.at(-1) === "HEAD" ? "3".repeat(40) : "4".repeat(40);
    },
  });
  assert.deepEqual(clean, {
    revision: "3".repeat(40),
    tree: "4".repeat(40),
    worktree: cleanHarnessWorktreeEvidence,
  });
  assert.deepEqual(calls.at(-1).args, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  for (const dirtyStatus of [" M tracked.mjs\0", "?? untracked.mjs\0"]) {
    assert.throws(
      () => inspectHarnessProvenance({
        checkoutRoot: "C:\\harness",
        runGitImpl(_root, args) {
          if (args[0] === "status") return dirtyStatus;
          return args.at(-1) === "HEAD" ? "3".repeat(40) : "4".repeat(40);
        },
      }),
      /must match HEAD/u,
    );
  }
});

test("installed Cypress execution identity binds package, runtime, and executable bytes", () => {
  const actual = frozenInstalledRwaEvidence();
  const identity = createRwaInstalledPerformanceIdentity(actual);
  assert.deepEqual(identity, {
    nodeModulesTree: FROZEN_IDENTITIES.rwa.installed.nodeModulesTree,
    cypressPackageTree: FROZEN_IDENTITIES.rwa.installed.cypressPackageTree,
    tsNodePackageTree: FROZEN_IDENTITIES.rwa.installed.tsNodePackageTree,
    cypressRuntimeTree: FROZEN_IDENTITIES.rwa.installed.cypressRuntimeTree,
    executable: {
      bytes: 205_927_728,
      sha256: "3af48298e0deb0202601e18dbbb3c1ec0da29a18edd842528e83ea3e53126ecf",
    },
  });
  assert.equal(JSON.stringify(identity).includes("C:\\private"), false);

  for (const mutate of [
    (value) => { value.cypressPackageTree.sha256 = "0".repeat(64); },
    (value) => { value.cypressRuntimeTree.totalBytes += 1; },
    (value) => { value.cypressExecutableBytes += 1; },
    (value) => { value.cypressExecutableSha256 = "0".repeat(64); },
  ]) {
    const changed = frozenInstalledRwaEvidence();
    mutate(changed);
    assert.throws(
      () => createRwaInstalledPerformanceIdentity(changed),
      /execution bytes differ/u,
    );
  }
});

test("server-host lifecycle waits on IPC readiness and stop without polling", async () => {
  class FakeChild extends EventEmitter {
    constructor() {
      super();
      this.exitCode = null;
      this.signalCode = null;
      this.killed = false;
      this.connected = true;
      this.sent = [];
    }

    send(message) {
      this.sent.push(message);
    }
  }
  const child = new FakeChild();
  const ready = waitForRwaHostReady(child, 1000);
  setImmediate(() => {
    child.emit("message", {
      type: "rwa-host-ready",
      roles: [{ name: "frontend", port: 3000 }, { name: "backend", port: 3001 }],
    });
  });
  assert.deepEqual(await ready, {
    type: "rwa-host-ready",
    roles: [{ name: "frontend", port: 3000 }, { name: "backend", port: 3001 }],
  });
  let stopResolved = false;
  const stopping = requestRwaHostStop(child, 1000).then((value) => {
    stopResolved = true;
    return value;
  });
  assert.deepEqual(child.sent, [{ type: "rwa-host-stop" }]);
  child.emit("message", { type: "rwa-host-stopped" });
  await Promise.resolve();
  assert.equal(stopResolved, false, "acknowledgement alone must not complete shutdown");
  child.connected = false;
  child.emit("disconnect");
  await Promise.resolve();
  assert.equal(stopResolved, false, "IPC disconnect alone must not replace physical exit");
  child.exitCode = 0;
  child.emit("exit", 0, null);
  const stopped = await stopping;
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.status, 0);
  assert.equal(stopResolved, true);
});

test("server-host shutdown rejects an acknowledged nonzero physical exit", async () => {
  class FakeChild extends EventEmitter {
    exitCode = null;
    signalCode = null;
    connected = true;
    send() {}
  }
  const child = new FakeChild();
  const stopping = requestRwaHostStop(child, 1000);
  child.emit("message", { type: "rwa-host-stopped" });
  child.exitCode = 1;
  child.emit("exit", 1, null);
  await assert.rejects(stopping, /exited unexpectedly after shutdown acknowledgement/u);
});

test("the sealed artifact omits local paths and listener PIDs while binding exact identities", () => {
  const raw = {
    schema: "stasis-v0.3.3-performance-rwa-raw-v1",
    protocol: "stasis-v0.3.3-performance-rwa-v1",
    track: "rwa-auth-eight-intents",
    source: structuredClone(rwaAuthSource),
    host,
    plan: { retained: true },
    semanticDifferenceDisclosure: { retained: true },
    serverLifecycle: { startupComplete: true, startupOutsideTiming: true, shutdownComplete: true, shutdownOutsideTiming: true, error: null },
    warmups: [],
    samples: [],
    authority: { valid: true },
  };
  const artifact = createRwaPerformanceArtifact({
    raw,
    hostFacts: { host },
    candidate: {
      identity: candidateIdentity(),
      runtime: {
        implementationName: "stasis-shell",
        implementationVersion: postSupportVersion,
        stasisRevision: postSupportRevision,
        v2ProfileAdvertised: true,
      },
    },
    workflowSource: {
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "Stasis v0.3.3 performance evidence",
      job: "windows-rwa",
      revision: "2".repeat(40),
      ref: "refs/heads/main",
      runId: "33840000000",
      runAttempt: "1",
    },
    harness: {
      revision: "3".repeat(40),
      tree: "4".repeat(40),
      worktree: structuredClone(cleanHarnessWorktreeEvidence),
    },
    nodeExecutable: {
      version: postSupportNodeVersion,
      executableSha256: rwaBaselineExpected.nodeExecutable.sha256,
      executableBytes: rwaBaselineExpected.nodeExecutable.bytes,
    },
    cypressInstalled: createRwaInstalledPerformanceIdentity(frozenInstalledRwaEvidence()),
    lifecycleEvidence: {
      startup: { checkout: lifecycleCheckout(), servers: lifecycleServers() },
      postflight: { checkout: lifecycleCheckout(), servers: lifecycleServers() },
      shutdownSignal: { stopped: true },
    },
    now: new Date("2026-09-02T00:00:00.000Z"),
  });
  const json = JSON.stringify(artifact);
  assert.equal(json.includes("E:\\frozen-rwa"), false);
  assert.equal(json.includes("1234"), false);
  assert.equal(artifact.provenance.harness.revision, "3".repeat(40));
  assert.equal(artifact.provenance.workflowSource.revision, "2".repeat(40));
  assert.equal(artifact.host.classDigest, host.identityDigest);
  assert.equal(artifact.host.machineInstanceSaltedDigest, host.instanceDigest);
  assert.deepEqual(artifact.authorityRaw, raw);
  assert.equal(assertPostSupportArtifactPrivacy(artifact), artifact);
});

function frozenInstalledRwaEvidence() {
  return {
    nodeModulesRoot: "C:\\private\\node_modules",
    nodeModulesTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.nodeModulesTree),
    cypressPackageRoot: "C:\\private\\node_modules\\cypress",
    cypressPackageTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.cypressPackageTree),
    tsNodePackageRoot: "C:\\private\\node_modules\\ts-node",
    tsNodePackageTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.tsNodePackageTree),
    cypressRuntimeRoot: "C:\\private\\Cypress",
    cypressRuntimeTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.cypressRuntimeTree),
    cypressExecutablePath: "C:\\private\\Cypress\\Cypress.exe",
    cypressExecutableBytes: FROZEN_IDENTITIES.rwa.installed.cypressExecutableBytes,
    cypressExecutableSha256: FROZEN_IDENTITIES.rwa.installed.cypressExecutableSha256,
  };
}
