import assert from "node:assert/strict";
import test from "node:test";

import {
  crawlPerformanceCorpusIdentity,
  computeCrawlPerformanceHostIdentityDigest,
  createCrawlPerformanceGithubProvenance,
  createCrawlPerformanceHostIdentity,
  runCrawlPerformanceAuthority,
} from "../src/performance/crawl.mjs";
import { cleanHarnessWorktreeEvidence } from "../src/performance/harness-worktree.mjs";
import { linuxEglRuntimeSchema } from "../src/performance/linux-egl-runtime.mjs";
import {
  rwaPerformanceArtifactSchema,
} from "../src/performance/publication.mjs";
import {
  freshPerformanceTrigger,
  immutablePerformanceHarness,
  publishedPerformanceAssetDigests,
  performanceReplicationVerificationSchema,
  verifyFreshHostPerformanceReplication,
} from "../src/performance/replication.mjs";
import {
  createRwaPerformanceHostIdentity,
  runRwaPerformanceAuthority,
  rwaPerformanceLaneResultSchema,
  rwaPerformanceProtocol,
  rwaPerformanceSemanticDifferenceDisclosure,
  rwaPerformanceTrack,
} from "../src/performance/rwa.mjs";
import {
  postSupportNodeVersion,
  postSupportProfile,
  postSupportRevision,
  postSupportVersion,
} from "../src/post-support/candidate-identity.mjs";
import { rwaAuthCases, rwaAuthSource } from "../src/rwa/cases.mjs";
import { rwaBaselineExpected } from "../src/rwa/run-cypress.mjs";
import {
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "../src/rwa/runtime-identity.mjs";
import { expectedPrimaryScheduledUrls, origin } from "../src/crawl/corpus.mjs";
import { FROZEN_IDENTITIES } from "../src/shared/manifest.mjs";

const originalRwaPairs = [
  ["17158958000", "4347965100"],
  ["18172145100", "4070393500"],
  ["17578812700", "3961182500"],
  ["17726429400", "3876967400"],
  ["17313558600", "3868960200"],
  ["17322723000", "3857087500"],
  ["18076811100", "3904218000"],
  ["17426590400", "3852611800"],
  ["17572501600", "3998555100"],
  ["17329688300", "3865450200"],
];

const originalCrawlPairs = [
  ["2275757312", "2391793057"],
  ["2654969951", "2370525264"],
  ["2096457868", "2388292527"],
  ["2192630656", "2286733345"],
  ["2198962502", "2372950749"],
  ["2172905207", "2281251307"],
  ["2200101273", "2407749625"],
  ["2203183669", "2384783048"],
  ["2181104697", "2401556758"],
  ["2165590274", "2322501042"],
];

const cypressBeforeEachSeedHookSourceSha256 =
  "970d46adadf8ef6acdf4c5544a7fae7a1d5ec525ce0549217a5ceb41414c1953";

test("fresh valid authorities replay separately and accept only the path-derived RWA build projection", async () => {
  const input = await replicationInput();
  const receipt = verifyFreshHostPerformanceReplication(input);

  assert.equal(receipt.schema, performanceReplicationVerificationSchema);
  assert.equal(receipt.protocolStatus, "protocol_valid");
  assert.equal(receipt.pooling, "none");
  assert.deepEqual(
    receipt.originalAssetIdentityDeclaration.expectedSha256,
    publishedPerformanceAssetDigests,
  );
  assert.equal(receipt.originalAssetIdentityDeclaration.bytesVerifiedByThisFunction, false);
  assert.equal(receipt.tracks.rwa.outcome,
    "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT");
  assert.equal(receipt.tracks.crawl.outcome,
    "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT");
  assert.equal(
    receipt.tracks.rwa.observations.original.statistics
      .pairedBaselineOverCandidate.decimal,
    "4.479108",
  );
  assert.equal(
    receipt.tracks.crawl.observations.original.statistics
      .pairedBaselineOverCandidate.decimal,
    "0.929559",
  );
  assert.notEqual(
    receipt.tracks.rwa.observations.original.hostBinding.digest,
    receipt.tracks.rwa.observations.fresh.hostBinding.digest,
  );
  assert.notEqual(
    receipt.tracks.crawl.observations.original.hostBinding.digest,
    receipt.tracks.crawl.observations.fresh.hostBinding.digest,
  );
  assert.deepEqual(receipt.tracks.rwa.pathDerivedRwaBuildDifferencesExcluded, [
    "identities.rwa.buildTree.sha256",
    "identities.rwa.buildTree.totalBytes",
    "identities.rwa.serverBodies.frontend.sha256",
  ]);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.tracks.rwa.observations.fresh.statistics), true);
});

test("valid reversed timings remain evidence and classify as directionally discordant", async () => {
  const input = await replicationInput({
    freshRwaPairs: reversePairs(originalRwaPairs),
    freshCrawlPairs: reversePairs(originalCrawlPairs),
  });
  const receipt = verifyFreshHostPerformanceReplication(input);

  assert.equal(receipt.protocolStatus, "protocol_valid");
  assert.equal(receipt.tracks.rwa.observations.fresh.ratioDirection,
    "baseline_faster_than_stasis");
  assert.equal(receipt.tracks.crawl.observations.fresh.ratioDirection,
    "baseline_slower_than_stasis");
  assert.equal(receipt.tracks.rwa.outcome,
    "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_DISCORDANT");
  assert.equal(receipt.tracks.crawl.outcome,
    "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_DISCORDANT");
});

test("an exact tie is explicit and non-concordant", async () => {
  const ties = Array.from({ length: 10 }, (_unused, index) => {
    const duration = String(1_000_000 + index);
    return [duration, duration];
  });
  const receipt = verifyFreshHostPerformanceReplication(await replicationInput({
    freshRwaPairs: ties,
    freshCrawlPairs: ties,
  }));

  for (const track of [receipt.tracks.rwa, receipt.tracks.crawl]) {
    assert.equal(track.freshRatioRelationToOne, "equal");
    assert.equal(track.observations.fresh.ratioDirection, "tie");
    assert.equal(track.outcome,
      "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_DISCORDANT");
  }
});

test("copied run provenance and copied host-instance identities fail closed", async () => {
  const copiedRun = structuredClone(await replicationInput());
  copyWorkflowExecution(copiedRun.fresh, copiedRun.original);
  assert.throws(
    () => verifyFreshHostPerformanceReplication(copiedRun),
    /published workflow run identity|preregistered workflow trigger/u,
  );

  const copiedRwaHost = structuredClone(await replicationInput());
  replaceRwaInstanceDigest(
    copiedRwaHost.fresh.rwaArtifact,
    copiedRwaHost.original.rwaArtifact.authorityRaw.host.instanceDigest,
  );
  assert.throws(
    () => verifyFreshHostPerformanceReplication(copiedRwaHost),
    /copied a published host-instance identity/u,
  );

  const copiedCrawlHost = structuredClone(await replicationInput());
  copiedCrawlHost.fresh.crawlRaw.identity.host.bootInstanceDigest =
    copiedCrawlHost.original.crawlRaw.identity.host.bootInstanceDigest;
  assert.throws(
    () => verifyFreshHostPerformanceReplication(copiedCrawlHost),
    /copied a published host-instance identity/u,
  );
});

test("individually valid immutable identity drift is rejected", async () => {
  const input = structuredClone(await replicationInput());
  input.fresh.crawlRaw.identity.crawlee.chromiumVersion = "151.0.7922.35";
  assert.throws(
    () => verifyFreshHostPerformanceReplication(input),
    /changed the frozen scientific identity/u,
  );
});

test("fresh EGL host-runtime drift is allowed but disclosed without normalization", async () => {
  const input = structuredClone(await replicationInput());
  const egl = input.fresh.crawlRaw.identity.stasis.eglRuntime;
  egl.packages[1].version = "22.0.5-0ubuntu0.2~22.04.1";
  egl.libraries[1].sha256 = "9".repeat(64);

  const receipt = verifyFreshHostPerformanceReplication(input);
  assert.equal(
    receipt.tracks.crawl.observations.fresh.hostRuntime.eglRuntime.packages[1].version,
    "22.0.5-0ubuntu0.2~22.04.1",
  );
  assert.equal(
    receipt.tracks.crawl.observations.original.hostRuntime.eglRuntime.packages[1].version,
    "22.0.5-0ubuntu0.1~22.04.1",
  );
});

test("a raw schedule mutation is rejected by the existing full validator", async () => {
  const input = structuredClone(await replicationInput());
  input.fresh.rwaArtifact.authorityRaw.samples.pop();
  assert.throws(
    () => verifyFreshHostPerformanceReplication(input),
    /history stopped|authority summary/u,
  );
});

async function replicationInput({
  freshRwaPairs = originalRwaPairs,
  freshCrawlPairs = originalCrawlPairs,
} = {}) {
  const original = await bundle({
    runId: "33851425108",
    sourceSha: "54dde177fe63c34ca1c5059a1381fd7434585f77",
    rwaInstanceDigest: "1".repeat(64),
    crawlBootDigest: "2".repeat(64),
    rwaPairs: originalRwaPairs,
    crawlPairs: originalCrawlPairs,
    pathDerivedBuild: false,
  });
  const fresh = await bundle({
    runId: "33860000000",
    sourceSha: freshPerformanceTrigger.workflowSourceSha,
    rwaInstanceDigest: "3".repeat(64),
    crawlBootDigest: "4".repeat(64),
    rwaPairs: freshRwaPairs,
    crawlPairs: freshCrawlPairs,
    pathDerivedBuild: true,
  });
  return { original, fresh };
}

async function bundle({
  runId,
  sourceSha,
  rwaInstanceDigest,
  crawlBootDigest,
  rwaPairs,
  crawlPairs,
  pathDerivedBuild,
}) {
  const rwaHost = createRwaPerformanceHostIdentity({
    platform: "win32",
    arch: "x64",
    runnerOs: "Windows",
    imageOs: "windows-2022",
    imageVersion: "20260824.1",
    cpuModel: "Example Hosted CPU",
    logicalCpuCount: 4,
    instanceDigest: rwaInstanceDigest,
  });
  const rwaRaw = await runRwaPerformanceAuthority({
    monotonicNow: clockForPairs(rwaPairs),
    preflight: async () => ({ sameHostVerified: true, host: rwaHost }),
    startRwaServers: async () => ({ id: "servers" }),
    stopRwaServers: async () => undefined,
    runCypressLane: async () => rwaLaneResult("cypress", rwaHost),
    runStasisLane: async () => rwaLaneResult("stasis-v0.3.3", rwaHost),
  });
  const rwaArtifact = rwaHostedArtifact(rwaRaw, {
    runId,
    sourceSha,
    pathDerivedBuild,
  });

  const crawlIdentity = hostedCrawlIdentity({ runId, sourceSha, crawlBootDigest });
  const crawlRaw = await runCrawlPerformanceAuthority({
    identity: crawlIdentity,
    runners: {
      crawlee: async () => successfulCrawlRun("crawlee"),
      stasis: async () => successfulCrawlRun("stasis"),
    },
    now: clockForPairs(crawlPairs),
  });
  return { rwaArtifact, crawlRaw };
}

function clockForPairs(pairs) {
  const durations = pairs.flatMap(([baseline, candidate], index) =>
    index % 2 === 0 ? [baseline, candidate] : [candidate, baseline]
  );
  const readings = [];
  let current = 1n;
  for (const duration of durations) {
    readings.push(current);
    current += BigInt(duration);
    readings.push(current);
    current += 1n;
  }
  let index = 0;
  return () => readings[index++];
}

function rwaLaneResult(runner, host) {
  return {
    schema: rwaPerformanceLaneResultSchema,
    runner,
    track: rwaPerformanceTrack,
    frameworkNativeWaiting: runner === "cypress"
      ? "cypress-command-and-assertion-retry"
      : "none",
    hostIdentityDigest: host.identityDigest,
    hostInstanceDigest: host.instanceDigest,
    engineStartupIncluded: true,
    engineStartupCount: runner === "cypress" ? 1 : 8,
    cleanupComplete: true,
    freshState: true,
    seedBeforeEveryIntent: true,
    selectedIntentCount: 8,
    seededIntentCount: 8,
    completedIntentCount: 8,
    retryCount: 0,
    sleepCount: 0,
    droppedFailureCount: 0,
    cases: rwaAuthCases.map((item) => rwaCaseResult(runner, item)),
  };
}

function rwaCaseResult(runner, item) {
  return {
    ordinal: item.ordinal,
    id: item.id,
    classification: runner === "cypress"
      ? "PASS_EQUIVALENT"
      : "PASS_WITH_SEMANTIC_DIFFERENCE",
    seeded: true,
    intentCompleted: true,
    attemptCount: 1,
    oracles: item.oracles.map(({ id }) => ({ id, status: "passed" })),
    allOraclesPassed: true,
    behaviorallySupported: true,
    stateEvidence: runner === "cypress"
      ? {
          attemptOrdinal: 1,
          beforeEachSeedHookLineIdentity: "cypress/tests/ui/auth.spec.ts:7-18",
          beforeEachSeedHookSpecBlobOid: rwaAuthSource.specBlobOid,
          beforeEachSeedHookSourceSha256: cypressBeforeEachSeedHookSourceSha256,
          engineInstanceOrdinal: 1,
          seedHookOrdinal: item.ordinal,
          testIsolation: "upstream-cypress-test-isolation",
        }
      : {
          cleanupCheckpointPhase: "cleanup",
          cleanupCheckpointSequence: 4,
          cleanupCheckpointStatus: "passed",
          engineInstanceOrdinal: item.ordinal,
          runtimeLaunchCheckpointPhase: "runtime-launch",
          runtimeLaunchCheckpointSequence: 3,
          runtimeLaunchCheckpointStatus: "passed",
          runtimeLaunchFreshProcess: true,
          seedCheckpointPhase: "seed",
          seedCheckpointSequence: 2,
          seedCheckpointStatus: "passed",
          seedOrdinal: item.ordinal,
        },
    semanticDifferenceIds: runner === "cypress"
      ? []
      : [...rwaPerformanceSemanticDifferenceDisclosure.cases
        .find(({ id }) => id === item.id).semanticDifferenceIds],
  };
}

function rwaHostedArtifact(raw, { runId, sourceSha, pathDerivedBuild }) {
  const identities = rwaIdentities();
  if (pathDerivedBuild) {
    identities.rwa.buildTree.sha256 = "7".repeat(64);
    identities.rwa.buildTree.totalBytes += 1_337;
    identities.rwa.serverBodies.frontend.sha256 = "8".repeat(64);
  }
  const phase = () => ({
    checkout: rwaCheckout(),
    servers: rwaServers(identities),
  });
  return {
    schema: rwaPerformanceArtifactSchema,
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    recordedAt: sourceSha === freshPerformanceTrigger.workflowSourceSha
      ? "2026-09-04T12:00:00.000Z"
      : "2026-09-04T08:00:00.000Z",
    provenance: {
      harness: {
        ...immutablePerformanceHarness,
        worktree: structuredClone(cleanHarnessWorktreeEvidence),
      },
      workflowSource: {
        provider: "github-actions",
        repository: "oxhq/stasis",
        workflow: "Stasis v0.3.3 performance evidence",
        job: "windows-rwa",
        revision: sourceSha,
        ref: freshPerformanceTrigger.workflowSourceRef,
        runId,
        runAttempt: "1",
      },
    },
    host: {
      facts: Object.fromEntries([
        "platform", "arch", "runnerOs", "imageOs", "imageVersion", "cpuModel",
        "logicalCpuCount",
      ].map((key) => [key, raw.host[key]])),
      classDigest: raw.host.identityDigest,
      machineInstanceSaltedDigest: raw.host.instanceDigest,
    },
    identities,
    sealedRuntime: {
      startup: phase(),
      postflight: phase(),
      continuity: {
        immutableCheckoutIdentity: true,
        sameFrozenServerHostProcesses: true,
        shutdownAcknowledged: true,
      },
    },
    authorityRaw: raw,
  };
}

function rwaCheckout() {
  return {
    valid: true,
    violations: [],
    revision: rwaAuthSource.revision,
    tree: rwaBaselineExpected.tree,
    detached: true,
    authSpec: {
      blobOid: rwaAuthSource.specBlobOid,
      blobSha256: rwaAuthSource.specBlobSha256,
      worktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
    },
    seed: {
      blobOid: rwaBaselineExpected.seed.blobOid,
      blobSha256: rwaBaselineExpected.seed.blobSha256,
      worktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
    },
    generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
    runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
    localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
    ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
    trackedStatusEntries: [],
    runtimeDatabase: {
      blobOid: rwaBaselineExpected.seed.blobOid,
      blobSha256: rwaBaselineExpected.seed.blobSha256,
      worktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
      newlineOnlyDifference: false,
      allowedRuntimeMutation: false,
    },
  };
}

function rwaServers(identities) {
  const listener = (port, scriptRole) => ({
    port,
    processName: "node.exe",
    nodeVersion: identities.node.version,
    executableBytes: identities.node.executableBytes,
    executableSha256: identities.node.executableSha256,
    launcherMatchesFrozenHost: true,
    commandMatchesPinnedRole: true,
    scriptRole,
  });
  return [
    {
      name: "frontend",
      url: `${identities.rwa.endpoints.appOrigin}/`,
      status: 200,
      contentType: identities.rwa.serverBodies.frontend.contentType,
      bodyBytes: identities.rwa.serverBodies.frontend.bytes,
      bodySha256: identities.rwa.serverBodies.frontend.sha256,
      listener: listener(3000, "scripts/testServer.ts"),
      servedBuildTree: structuredClone(identities.rwa.buildTree),
      generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
      runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
      localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
      ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
    },
    {
      name: "backend",
      url: `${identities.rwa.endpoints.apiOrigin}/`,
      status: 200,
      contentType: identities.rwa.serverBodies.backend.contentType,
      bodyBytes: identities.rwa.serverBodies.backend.bytes,
      bodySha256: identities.rwa.serverBodies.backend.sha256,
      listener: listener(3001, "backend/app.ts"),
    },
  ];
}

function rwaIdentities() {
  return {
    node: {
      version: postSupportNodeVersion,
      executableSha256: rwaBaselineExpected.nodeExecutable.sha256,
      executableBytes: rwaBaselineExpected.nodeExecutable.bytes,
    },
    cypress: {
      packageVersion: rwaBaselineExpected.cypressVersion,
      browserName: "electron",
      browserVersion: rwaBaselineExpected.electronVersion,
      resolvedNodeVersion: rwaBaselineExpected.resolvedNodeVersion,
      viewport: structuredClone(rwaBaselineExpected.viewport),
      retries: structuredClone(rwaBaselineExpected.primaryRetries),
      installed: {
        nodeModulesTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.nodeModulesTree),
        cypressPackageTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.cypressPackageTree),
        tsNodePackageTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.tsNodePackageTree),
        cypressRuntimeTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.cypressRuntimeTree),
        executable: {
          bytes: FROZEN_IDENTITIES.rwa.installed.cypressExecutableBytes,
          sha256: FROZEN_IDENTITIES.rwa.installed.cypressExecutableSha256,
        },
      },
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
      candidate: {
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
          zip: {
            sha256: "5e95ed4123ee2b03d579313bae637cb35e3050114377072c603b0b5cbd1d217b",
            bytes: 37_188_148,
          },
          executable: {
            sha256: "e12230ec8659775353af50fed0d98fbaad0c2888143baf37667c90d469e738d9",
            bytes: 87_334_400,
          },
        },
        sdk: {
          source: "hosted_package_train",
          archive: {
            sha256: "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec",
            bytes: 181_292,
          },
          proof: {
            sha256: "ec6df3f07f3a27f16bf9fb91b5c2b09daf796bd8f2aed455f6879598f06b9ba4",
            bytes: 10_695,
          },
          tree: {
            sha256: "20f52ace92961030f8dc5d2743d941eb3445a86949097b194ec97312f5eface8",
            fileCount: 55,
            totalBytes: 896_631,
          },
        },
      },
      runtime: {
        implementationName: "stasis-shell",
        implementationVersion: postSupportVersion,
        stasisRevision: postSupportRevision,
        v2ProfileAdvertised: true,
      },
    },
  };
}

function hostedCrawlIdentity({ runId, sourceSha, crawlBootDigest }) {
  const host = createCrawlPerformanceHostIdentity({
    platform: "linux",
    arch: "x64",
    runnerOs: "Linux",
    imageOs: "ubuntu22",
    imageVersion: "20260824.1.0",
    cpuModel: "Example Hosted CPU",
    logicalCpuCount: 4,
    bootInstanceDigest: crawlBootDigest,
  });
  const hostClassDigest = computeCrawlPerformanceHostIdentityDigest(host);
  return {
    host: structuredClone(host),
    provenance: createCrawlPerformanceGithubProvenance({
      provider: "github-actions",
      repository: "oxhq/stasis",
      workflow: "Stasis v0.3.3 performance evidence",
      job: "ubuntu-crawl",
      runId,
      runAttempt: "1",
      workflowSourceSha: sourceSha,
      workflowSourceRef: freshPerformanceTrigger.workflowSourceRef,
      harnessCheckoutRevision: immutablePerformanceHarness.revision,
      harnessCheckoutTree: immutablePerformanceHarness.tree,
      harnessCheckoutWorktree: structuredClone(cleanHarnessWorktreeEvidence),
    }),
    corpus: structuredClone(crawlPerformanceCorpusIdentity),
    crawlee: {
      runner: "crawlee-playwrightcrawler",
      nodeVersion: "v22.20.0",
      crawleeVersion: "3.18.1",
      playwrightVersion: "1.62.1",
      browser: "chromium",
      chromiumVersion: "151.0.7922.34",
      chromiumExecutableBytes: 123_456_789,
      chromiumExecutableSha256: "a".repeat(64),
      hostClassDigest,
    },
    stasis: {
      runner: "stasis-reference-crawler-v0.3.3",
      nodeVersion: "v22.20.0",
      package: "@oxhq/stasis",
      sdkVersion: "0.3.3",
      revision: "48c5a718a9ddd63f496e45307e1484974ccf8587",
      profile: "controlled-web-session-v2",
      releaseTag: "v0.3.3",
      packageQualificationRunId: "33506181780",
      packageQualificationRunAttempt: "1",
      sdkArchiveSha256: "b".repeat(64),
      executableSha256: "c".repeat(64),
      runtimeManifestSha256: "4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4",
      eglRuntime: eglRuntimeIdentity(),
      hostClassDigest,
    },
  };
}

function eglRuntimeIdentity() {
  return {
    schema: linuxEglRuntimeSchema,
    dlopen: { method: "python3_ctypes_cdll_proc_maps_v1", status: "passed" },
    packages: [
      { name: "libegl1", version: "1.4.0-1" },
      { name: "libegl-mesa0", version: "22.0.5-0ubuntu0.1~22.04.1" },
      { name: "libglvnd0", version: "1.4.0-1" },
    ],
    libraries: [
      { package: "libegl1", soname: "libEGL.so.1", basename: "libEGL.so.1.1.0", bytes: 84_992, sha256: "4".repeat(64) },
      { package: "libegl-mesa0", soname: "libEGL_mesa.so.0", basename: "libEGL_mesa.so.0.0.0", bytes: 288_248, sha256: "5".repeat(64) },
      { package: "libglvnd0", soname: "libGLdispatch.so.0", basename: "libGLdispatch.so.0.0.0", bytes: 718_032, sha256: "6".repeat(64) },
    ],
  };
}

function successfulCrawlRun(lane) {
  const links = new Map([
    [`${origin}/`, [
      `${origin}/static`, `${origin}/canonical`, `${origin}/microtask`,
      `${origin}/timer`, `${origin}/raf`, `${origin}/fetch`, `${origin}/xhr`,
      `${origin}/state`, `${origin}/navigation-start`, `${origin}/interval`,
    ]],
    [`${origin}/static`, [`${origin}/leaf/static`]],
    [`${origin}/canonical`, [`${origin}/leaf/canonical`]],
    [`${origin}/microtask`, [`${origin}/leaf/microtask`]],
    [`${origin}/timer`, [`${origin}/leaf/timer`]],
    [`${origin}/raf`, [`${origin}/leaf/raf`]],
    [`${origin}/fetch`, [`${origin}/leaf/fetch`]],
    [`${origin}/xhr`, [`${origin}/leaf/xhr`]],
    [`${origin}/state`, [`${origin}/state/ready/leaf`]],
    [`${origin}/navigation-start`, [`${origin}/leaf/navigation`]],
    [`${origin}/interval`, [`${origin}/leaf/static`]],
  ]);
  const finalUrls = new Map([
    [`${origin}/state`, `${origin}/state/ready/`],
    [`${origin}/navigation-start`, `${origin}/navigation-final`],
  ]);
  const pages = expectedPrimaryScheduledUrls.map((requestedUrl, index) => ({
    requestedUrl,
    url: finalUrls.get(requestedUrl) ?? requestedUrl,
    depth: index === 0 ? 0 : index <= 10 ? 1 : 2,
    status: "crawled",
    ...(lane === "crawlee"
      ? { responseStatus: 200 }
      : {
          settleOutcome: requestedUrl === `${origin}/interval`
            ? "quiescent_with_persistent_work"
            : "quiescent",
        }),
    links: links.get(requestedUrl) ?? [],
  }));
  return {
    success: true,
    result: { pages, scheduledUrls: [...expectedPrimaryScheduledUrls] },
    ...(lane === "crawlee" ? { failures: [], fixtureMisses: [] } : {}),
    cleanup: { status: "passed", phase: "test_cleanup" },
  };
}

function reversePairs(pairs) {
  return pairs.map(([baseline, stasis]) => [stasis, baseline]);
}

function copyWorkflowExecution(destination, source) {
  destination.rwaArtifact.provenance.workflowSource = structuredClone(
    source.rwaArtifact.provenance.workflowSource,
  );
  destination.crawlRaw.identity.provenance = structuredClone(
    source.crawlRaw.identity.provenance,
  );
}

function replaceRwaInstanceDigest(artifact, digest) {
  artifact.authorityRaw.host.instanceDigest = digest;
  artifact.host.machineInstanceSaltedDigest = digest;
  for (const record of [
    ...artifact.authorityRaw.warmups,
    ...artifact.authorityRaw.samples,
  ]) {
    record.hostInstanceDigest = digest;
    record.result.hostInstanceDigest = digest;
  }
}
