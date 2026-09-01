import assert from "node:assert/strict";
import test from "node:test";

import { validateCandidate } from "../src/rwa/compare-lib.mjs";
import { rwaBaselineExpected } from "../src/rwa/run-cypress.mjs";
import {
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "../src/rwa/runtime-identity.mjs";
import {
  createPostSupportCandidateSpec,
  postSupportProfile,
  postSupportRevision,
} from "../src/post-support/candidate-identity.mjs";
import {
  adaptPostSupportRwaForFrozenValidator,
  assertPostSupportRwaRuntimeBinding,
  comparePostSupportRwa,
  postSupportRwaRunner,
  postSupportRwaRuntimeBindingSchema,
  postSupportRwaSchema,
  projectPostSupportRwaComparisonCases,
  projectResolvedCookieBoundaries,
  runPostSupportRwaProof,
} from "../src/post-support/rwa-lane.mjs";

test("post-support RWA lane passes the exact hash and v2 profile into all eight fresh cases", async () => {
  let seedCalls = 0;
  let launches = 0;
  let closes = 0;
  const selectedProfiles = [];
  const candidate = verifiedCandidate(async () => {
    launches += 1;
    return {
      async openSession(_url, options) {
        selectedProfiles.push(options.profile);
        throw Object.assign(new Error("typed boundary"), {
          name: "StasisProtocolError",
          code: "unsupported_work",
          fatal: false,
          stateEffect: "none",
        });
      },
      async close() { closes += 1; },
    };
  });
  const result = await runPostSupportRwaProof(candidate, {
    inspectCheckout: async () => {
      throw new Error("injected checkout observers must not grant authority");
    },
    probeServers: async () => {
      throw new Error("injected server observers must not grant authority");
    },
    hashExecutable: async () => candidate.identity.windows.executable.sha256,
    nodeVersion: "v22.20.0",
    fetchImpl: async (url, options) => {
      if (options.method === "POST") {
        seedCalls += 1;
        return { ok: true, status: 200 };
      }
      assert.match(url, /\/testData\/users$/u);
      return jsonResponse([{ id: "fixture-id", username: "fixture-user" }]);
    },
  });
  assert.equal(result.schema, postSupportRwaSchema);
  assert.equal(result.runner, postSupportRwaRunner);
  assert.equal(result.denominator, 8);
  assert.deepEqual(result.runtimeAuthority, {
    mode: "diagnostic_injected_dependencies",
    authoritative: false,
  });
  assert.equal(seedCalls, 8);
  assert.equal(launches, 8);
  assert.equal(closes, 8);
  assert.deepEqual(selectedProfiles, Array(8).fill(postSupportProfile));
  assert.equal(Object.hasOwn(result.versions, "executablePath"), false);
  assert.equal(JSON.stringify(result).includes("C:\\private"), false);
  assert.deepEqual(
    validateCandidate(adaptPostSupportRwaForFrozenValidator(result)),
    { valid: true, violations: [] },
  );

  const forged = validCookieResult(result.candidate);
  assert.throws(
    () => comparePostSupportRwa({}, result, forged),
    /fresh direct in-process RWA/u,
    "an injected RWA execution cannot mint comparison authority",
  );
});

test("sealed RWA authority rejects fake localhost servers and observation drift", () => {
  assert.doesNotThrow(() => assertPostSupportRwaRuntimeBinding(sealedRuntimeBinding()));

  const allowedDatabaseMutation = sealedRuntimeBinding();
  allowedDatabaseMutation.postflight.checkout.trackedStatusEntries = [
    ` M ${rwaBaselineExpected.databasePath}`,
  ];
  allowedDatabaseMutation.postflight.checkout.runtimeDatabase = {
    ...allowedDatabaseMutation.postflight.checkout.runtimeDatabase,
    worktreeSha256: "a".repeat(64),
    newlineOnlyDifference: true,
    allowedRuntimeMutation: true,
  };
  assert.doesNotThrow(
    () => assertPostSupportRwaRuntimeBinding(allowedDatabaseMutation),
    "the frozen baseline contract permits only the server-owned newline transition",
  );

  const mutations = [
    ["frozen checkout revision", (value) => {
      value.preflight.checkout.revision = "0".repeat(40);
    }],
    ["served production build", (value) => {
      value.preflight.servers[0].servedBuildTree.sha256 = "0".repeat(64);
    }],
    ["listener command identity", (value) => {
      value.preflight.servers[0].listener.commandMatchesPinnedRole = false;
    }],
    ["fake backend body", (value) => {
      value.postflight.servers[1].bodySha256 = "0".repeat(64);
    }],
    ["listener process continuity", (value) => {
      value.postflight.servers[0].listener.processId += 1;
    }],
    ["shared sealed host continuity", (value) => {
      value.postflight.servers[1].listener.launcherProcessId += 1;
    }],
  ];
  for (const [label, mutate] of mutations) {
    const value = sealedRuntimeBinding();
    mutate(value);
    assert.throws(
      () => assertPostSupportRwaRuntimeBinding(value),
      undefined,
      label,
    );
  }
});

test("post-support RWA comparison renames the frozen baseline state before privacy projection", () => {
  const projected = projectPostSupportRwaComparisonCases([{
    ordinal: 1,
    id: "sign-up-and-login",
    title: "sign-up-and-login",
    classification: "PASS_EQUIVALENT",
    baseline: {
      state: "passed",
      attempts: 1,
      durationMilliseconds: 123,
    },
    candidate: {
      classification: "PASS_EQUIVALENT",
      phase: "completed",
      code: null,
      checkpointCount: 4,
      oracleCounts: { passed: 1 },
      semanticDifferenceIds: [],
    },
  }]);

  assert.deepEqual(projected[0].baseline, {
    executionStatus: "passed",
    attempts: 1,
    durationMilliseconds: 123,
  });
  assert.equal(JSON.stringify(projected).includes('"state"'), false);

  const hostileState = structuredClone(projected);
  hostileState[0].baseline = {
    state: "PRIVATE_SENTINEL",
    attempts: 1,
    durationMilliseconds: 1,
  };
  assert.deepEqual(projectPostSupportRwaComparisonCases(hostileState)[0].baseline, {
    executionStatus: "INVALID",
    attempts: 1,
    durationMilliseconds: 1,
  });

  for (const baseline of [
    { state: "passed", attempts: "PRIVATE_SENTINEL", durationMilliseconds: 1 },
    { state: "passed", attempts: -1, durationMilliseconds: 1 },
    { state: "passed", attempts: 1, durationMilliseconds: "PRIVATE_SENTINEL" },
    { state: "passed", attempts: 1, durationMilliseconds: -1 },
  ]) {
    const hostileScalar = structuredClone(projected);
    hostileScalar[0].baseline = baseline;
    assert.throws(
      () => projectPostSupportRwaComparisonCases(hostileScalar),
      /Post-support RWA comparison baseline 1 (?:attempts are|duration is) invalid/u,
    );
  }
});

test("resolved cookie boundaries retain separate positive-scenario provenance", () => {
  const cookieResult = validCookieResult(verifiedCandidate(async () => {}).identity);
  const projected = projectResolvedCookieBoundaries(cookieResult);
  assert.deepEqual(projected, [
    {
      id: "persistent-cookie-profile-gap",
      priorTerminalCode: "unsupported_persistent_cookie",
      status: "positively_supported",
      authority: "fresh_direct_in_process_cookie_minimizer_scenario",
      scenarioId: "persistent-cookie-fresh-process-restore",
      processCount: 2,
      persistentRestorePassed: true,
    },
    {
      id: "cookie-same-site-context-gap",
      priorTerminalCode: "unsupported_cookie_same_site_context",
      status: "positively_supported",
      authority: "fresh_direct_in_process_cookie_minimizer_scenario",
      scenarioId: "same-site-lax-cross-site-subresource",
      processCount: 3,
      sameSitePolicyPassed: true,
    },
  ]);
  assert.equal(JSON.stringify(projected).includes("PRIVATE_SENTINEL"), false);

  const weakenedPersistent = structuredClone(cookieResult);
  weakenedPersistent.scenarios[0].evidence.restoredCredentialPresent = false;
  assert.throws(
    () => projectResolvedCookieBoundaries(weakenedPersistent),
    /Invalid positive cookie minimizer result/u,
  );

  const privateSameSiteExtension = structuredClone(cookieResult);
  privateSameSiteExtension.scenarios[1].evidence.credential = "PRIVATE_SENTINEL";
  assert.throws(
    () => projectResolvedCookieBoundaries(privateSameSiteExtension),
    /Invalid positive cookie minimizer result/u,
  );
});

function jsonResponse(results) {
  return { ok: true, status: 200, async json() { return { results }; } };
}

function verifiedCandidate(launch) {
  const identity = createPostSupportCandidateSpec({
    packageRunId: "33506181780",
    packageRunAttempt: "1",
    revision: postSupportRevision,
    windowsZipPath: "C:\\private\\stasis-0.3.3-windows-x86_64-ci.zip",
    windowsZipSha256: "1".repeat(64),
    windowsZipBytes: "10",
    executablePath: "C:\\private\\stasis.exe",
    executableSha256: "2".repeat(64),
    executableBytes: "20",
    sdkArchivePath: "C:\\private\\oxhq-stasis-0.3.3.tgz",
    sdkArchiveSha256: "3".repeat(64),
    sdkArchiveBytes: "30",
    sdkProofPath: "C:\\private\\stasis-0.3.3-typescript-act-settle-inspect.json",
    sdkProofSha256: "5".repeat(64),
    sdkProofBytes: "50",
    sdkPackageRoot: "C:\\private\\oxhq-stasis-0.3.3\\package",
    sdkTreeSha256: "4".repeat(64),
    sdkTreeFileCount: "5",
    sdkTreeBytes: "40",
  });
  return {
    identity,
    executableSha256: identity.windows.executable.sha256,
    sdk: { launch, CONTROLLED_WEB_SESSION_V2_PROFILE: postSupportProfile },
  };
}

function validCookieResult(candidate) {
  return {
    schema: "stasis-post-support-cookie-minimizers-v1",
    claimBoundary: "local positive causal proof; not corpus, hosted CI, release, or publication proof",
    candidate,
    rules: {
      appCodeChanges: false,
      retries: 0,
      sleeps: false,
      polling: false,
      stateTransfer: "memory_only",
      persistedEvidence: "booleans_counts_and_typed_properties_only",
    },
    scenarios: [
      {
        id: "persistent-cookie-fresh-process-restore",
        status: "passed",
        processCount: 2,
        cookiePersistence: "max_age",
        evidence: {
          seedRequestCount: 1,
          persistentCookieCount: 1,
          nonNullExpiryCount: 1,
          restoredRequestCount: 1,
          restoredCredentialPresent: true,
          stateArtifactTransferredInMemory: true,
        },
      },
      {
        id: "same-site-lax-cross-site-subresource",
        status: "passed",
        processCount: 3,
        sameSitePolicy: "lax",
        evidence: {
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
        },
      },
    ],
  };
}

function sealedRuntimeBinding() {
  const preflight = sealedRuntimeObservation();
  const postflight = structuredClone(preflight);
  return {
    schema: postSupportRwaRuntimeBindingSchema,
    mode: "sealed_frozen_rwa_runtime",
    authoritative: true,
    preflight,
    postflight,
    continuity: {
      immutableCheckoutIdentity: true,
      exactServerEvidence: true,
      sameFrozenServerHostProcesses: true,
    },
  };
}

function sealedRuntimeObservation() {
  return {
    checkout: {
      valid: true,
      violations: [],
      revision: rwaBaselineExpected.revision,
      tree: rwaBaselineExpected.tree,
      detached: true,
      authSpec: structuredClone(rwaBaselineExpected.spec),
      seed: structuredClone(rwaBaselineExpected.seed),
      generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
      runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
      localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
      ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
      trackedStatusEntries: [],
      runtimeDatabase: {
        path: rwaBaselineExpected.databasePath,
        blobOid: rwaBaselineExpected.seed.blobOid,
        blobSha256: rwaBaselineExpected.seed.blobSha256,
        worktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
        newlineOnlyDifference: false,
        allowedRuntimeMutation: false,
      },
    },
    servers: sealedServers(),
  };
}

function sealedServers() {
  const commonListener = {
    processId: 1234,
    processName: "node.exe",
    nodeVersion: rwaBaselineExpected.node,
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
      listener: {
        ...commonListener,
        port: 3000,
        scriptRole: "scripts/testServer.ts",
      },
      servedBuildTree: structuredClone(rwaBaselineExpected.buildTree),
      generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
      runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
      localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
      ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
    },
    {
      name: "backend",
      url: "http://localhost:3001/",
      status: 200,
      contentType: rwaBaselineExpected.serverBodies.backend.contentType,
      bodyBytes: rwaBaselineExpected.serverBodies.backend.bytes,
      bodySha256: rwaBaselineExpected.serverBodies.backend.sha256,
      listener: {
        ...commonListener,
        port: 3001,
        scriptRole: "backend/app.ts",
      },
    },
  ];
}
