import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { normalizeTitleIdentity, publicHttpUrlIdentity } from "../src/wild/normalize.mjs";
import { networkPolicyIdentity, protocol, strata } from "../src/wild/config.mjs";
import { sha256File } from "../src/shared/io.mjs";
import {
  createPostSupportCandidateSpec,
  postSupportProfile,
  postSupportRevision,
} from "../src/post-support/candidate-identity.mjs";
import { runPostSupportWildObservation } from "../src/post-support/wild-observation.mjs";
import {
  runPostSupportWildDiagnostic,
  runPostSupportWildProof,
} from "../src/post-support/wild-lane.mjs";
import {
  assertRetainedPostSupportWildNetworkSmoke,
  projectPostSupportHarnessRuntime,
  runPostSupportWildNetworkSmoke,
} from "../src/post-support/wild-network-smoke.mjs";
import { assertObservedPostSupportHarnessRuntime } from "../src/post-support/wild-runtime-identity.mjs";
import {
  assertAuthoritativePostSupportWildResult,
  runAuthoritativePostSupportWildSequence,
  verifyPostSupportWildResult,
} from "../src/post-support/wild-result-verifier.mjs";

test("post-support wild observation selects v2 and retains only projected audit evidence", async () => {
  let selectedProfile;
  let sessionClosed = 0;
  const candidate = verifiedCandidate(async () => ({
    async openSession(url, options) {
      selectedProfile = options.profile;
      return fakeSession(url, () => { sessionClosed += 1; });
    },
    async close() { throw new Error("graceful session close owns process termination"); },
  }));
  const entry = corpusEntry(1);
  const observation = await runPostSupportWildObservation(entry, candidate, {
    timeoutSignal: () => new AbortController().signal,
  });
  assert.equal(selectedProfile, postSupportProfile);
  assert.equal(sessionClosed, 1);
  assert.equal(observation.status, "success");
  assert.equal(observation.candidateExecutableSha256, candidate.identity.windows.executable.sha256);
  assert.equal(observation.currentUrlObservable, true);
  assert.equal(
    observation.currentUrlIdentity,
    publicHttpUrlIdentity("https://site-1.example/final?source=settle#terminal"),
  );
  assert.deepEqual(observation.audit, {
    complete: true,
    requests: [{ method: "GET" }],
    evidence: [{ kind: "response_headers" }],
    requestRecordsOmitted: 0,
    evidenceRecordsOmitted: 0,
  });
  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(serialized, /authorization|cookie|private|C:\\private/iu);
});

test("post-support wild diagnostic binds all 100 unchanged entries without claiming artifact authority", async () => {
  const entries = Array.from({ length: 100 }, (_, index) => corpusEntry(index + 1));
  let stasisCalls = 0;
  const candidate = verifiedCandidate(async () => undefined);
  const result = await runPostSupportWildDiagnostic(candidate, {
    loadBinding: async () => ({
      harnessCommit: "a".repeat(40),
      preregistrationCommit: "b".repeat(40),
      corpusSha256: "c".repeat(64),
      preflightLedgerSha256: "d".repeat(64),
      corpus: { urls: entries },
    }),
    inspect: async (url) => ({
      url,
      hostname: new URL(url).hostname,
      addressCount: 1,
      families: [4],
    }),
    robots: async () => ({ status: "allowed", reason: "robots_allowed", redirectCount: 0 }),
    baseline: async (entry) => successfulBaseline(entry),
    stasisObservation: async (entry, observedCandidate) => {
      stasisCalls += 1;
      assert.equal(observedCandidate, candidate);
      return successfulStasis(entry, candidate.identity.windows.executable.sha256);
    },
  });
  assert.equal(stasisCalls, 100);
  assert.equal(result.caseCount, 100);
  assert.equal(result.corpusBinding.exactTrackedBytesVerified, true);
  assert.equal(result.candidate.hostedSdkPackageTrain.runNumber, 33506181780);
  assert.equal(JSON.stringify(result).includes("C:\\private"), false);
});

test("post-support wild runtime comparison rejects every formerly replayed dependency identity", async () => {
  const binding = await syntheticBinding([]);
  const expected = withChromiumInstallationTree(
    projectPostSupportHarnessRuntime(binding.preflightRuntime),
  );
  const mutations = [
    ["harness SDK", (value) => { value.frozenHarnessSdkDependency = "999.0.0"; }],
    ["Crawlee version", (value) => { value.crawlee = "999.0.0"; }],
    ["Crawlee tree", (value) => { value.crawleeTree.sha256 = "0".repeat(64); }],
    ["Playwright version", (value) => { value.playwright = "999.0.0"; }],
    ["Playwright tree", (value) => { value.playwrightTree.sha256 = "0".repeat(64); }],
    ["installed node_modules tree", (value) => {
      value.installedNodeModulesTree.sha256 = "0".repeat(64);
    }],
    ["Chromium version", (value) => { value.chromiumVersion = "999.0.0.0"; }],
    ["Chromium executable", (value) => {
      value.chromiumExecutableSha256 = "0".repeat(64);
    }],
    ["Chromium installation tree", (value) => {
      value.chromiumInstallationTree.sha256 = "0".repeat(64);
    }],
  ];
  for (const [label, mutate] of mutations) {
    const observed = structuredClone(expected);
    mutate(observed);
    assert.throws(
      () => assertObservedPostSupportHarnessRuntime(observed, expected),
      /differs from the frozen preflight runtime/u,
      label,
    );
  }
});

test("retained post-support smoke semantics reject resealed binding and admission contradictions", () => {
  const { expected, value } = retainedSmokeFixture();
  assert.doesNotThrow(() => assertRetainedPostSupportWildNetworkSmoke(value, expected));
  const cases = [
    ["status", (mutated) => { mutated.status = "failed"; }, /differs from its exact binding/u],
    [
      "execution authority",
      (mutated) => { mutated.executionAuthority = "diagnostic_only"; },
      /differs from its exact binding/u,
    ],
    [
      "run generation",
      (mutated) => { mutated.runGeneration.nonceSha256 = "0".repeat(64); },
      /differs from its exact binding/u,
    ],
    [
      "runtime",
      (mutated) => { mutated.runtime.node = "v0.0.0"; },
      /differs from its exact binding/u,
    ],
    [
      "policy",
      (mutated) => { mutated.policy.appliedMode = "live"; },
      /not exact fixture-only admission proof/u,
    ],
    [
      "fixture",
      (mutated) => { mutated.fixture.routeDecision = "live"; },
      /not exact fixture-only admission proof/u,
    ],
    [
      "result",
      (mutated) => { mutated.result.liveDecisionCount = 1; },
      /not exact fixture-only admission proof/u,
    ],
    [
      "timestamps",
      (mutated) => { mutated.completedAt = "2026-08-29T23:59:59.000Z"; },
      /timestamps are invalid/u,
    ],
    [
      "envelope",
      (mutated) => { mutated.extra = true; },
      /invalid shape/u,
    ],
  ];
  for (const [label, mutate, error] of cases) {
    const mutated = structuredClone(value);
    mutate(mutated);
    assert.throws(
      () => assertRetainedPostSupportWildNetworkSmoke(mutated, expected),
      error,
      label,
    );
  }
});

test("post-support wild smoke re-observes the ignored dependency tree before candidate launch", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "stasis-post-support-smoke-runtime-"));
  const root = path.join(temporary, "fresh-proof-root");
  const priorArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  process.env.STASIS_COMPAT_ARTIFACT_DIR = root;
  try {
    const binding = await syntheticBinding([]);
    const expected = withChromiumInstallationTree(
      projectPostSupportHarnessRuntime(binding.preflightRuntime),
    );
    const observed = structuredClone(expected);
    observed.installedNodeModulesTree.sha256 = "0".repeat(64);
    let launchCount = 0;
    const candidate = verifiedCandidate(async () => {
      launchCount += 1;
      return smokeTestLaunch();
    });
    await assert.rejects(
      () => runPostSupportWildNetworkSmoke(candidate, {
        loadBinding: async () => binding,
        artifactRoot: root,
        observeHarnessRuntime: async () => observed,
      }),
      /Post-support smoke harness runtime differs/u,
    );
    assert.equal(launchCount, 0);
    await assert.rejects(
      () => stat(root),
      { code: "ENOENT" },
    );
  } finally {
    if (priorArtifactRoot === undefined) delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    else process.env.STASIS_COMPAT_ARTIFACT_DIR = priorArtifactRoot;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("post-support wild smoke verifies every frozen binding before claiming its artifact root", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "stasis-post-support-smoke-binding-"));
  const root = path.join(temporary, "fresh-proof-root");
  const priorArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  process.env.STASIS_COMPAT_ARTIFACT_DIR = root;
  let launchCount = 0;
  try {
    const candidate = verifiedCandidate(async () => {
      launchCount += 1;
      return smokeTestLaunch();
    });
    await assert.rejects(
      () => runPostSupportWildNetworkSmoke(candidate, {
        artifactRoot: root,
        loadBinding: async () => {
          throw new Error("frozen ignored input is unavailable");
        },
      }),
      /frozen ignored input is unavailable/u,
    );
    assert.equal(launchCount, 0);
    await assert.rejects(() => stat(root), { code: "ENOENT" });
  } finally {
    if (priorArtifactRoot === undefined) delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    else process.env.STASIS_COMPAT_ARTIFACT_DIR = priorArtifactRoot;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("post-support wild lifecycle writes v5 current-URL artifacts and ordinary or injected verification cannot mint authority", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "stasis-post-support-wild-"));
  const root = path.join(temporary, "fresh-proof-root");
  const priorArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  const priorQuiescent = process.env.STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT;
  process.env.STASIS_COMPAT_ARTIFACT_DIR = root;
  delete process.env.STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT;
  try {
    const entries = Array.from({ length: 100 }, (_, index) => authoritativeCorpusEntry(index + 1));
    const binding = await syntheticBinding(entries);
    const loadBinding = async () => binding;
    const candidate = verifiedCandidate(smokeTestLaunch);
    const projectedRuntime = withChromiumInstallationTree(
      projectPostSupportHarnessRuntime(binding.preflightRuntime),
    );
    const smoke = await runPostSupportWildNetworkSmoke(candidate, {
      loadBinding,
      artifactRoot: root,
      observeHarnessRuntime: async () => projectedRuntime,
    });
    assert.equal(smoke.reference.path, "wild-network-policy-smoke.json");

    const result = await runPostSupportWildProof(candidate, {
      loadBinding,
      allowNonAuthoritativeBindingForTests: true,
      artifactRoot: root,
      inspect: async (url) => ({
        url,
        hostname: new URL(url).hostname,
        addressCount: 1,
        families: [4],
      }),
      robots: async () => ({ status: "allowed", reason: "robots_allowed", redirectCount: 0 }),
      baseline: async (entry) => successfulBaseline(entry),
      stasisObservation: async (entry) =>
        successfulStasis(entry, candidate.identity.windows.executable.sha256),
    });
    assert.equal(result.caseCount, 100);
    assert.equal(result.rawRecordCount, 500);
    assert.equal(result.authority, "requires_separate_quiescent_postflight_verification");
    const index = JSON.parse(await readFile(path.join(root, "wild", "artifact-index.json"), "utf8"));
    const summary = JSON.parse(await readFile(path.join(root, "wild", "summary.json"), "utf8"));
    const stasis = JSON.parse(await readFile(path.join(root, "wild", "raw", "001-stasis.json"), "utf8"));
    const classification = JSON.parse(
      await readFile(path.join(root, "wild", "cases", "001-classification.json"), "utf8"),
    );
    assert.equal(index.schema, "stasis-wild-artifact-index-v5");
    assert.equal(index.identity.schema, "stasis-post-support-wild-artifact-identity-v2");
    assert.equal(summary.schema, "stasis-wild-summary-v5");
    assert.equal(stasis.schema, "stasis-wild-stasis-raw-v4");
    assert.equal(stasis.observation.currentUrlObservable, true);
    assert.match(stasis.observation.currentUrlIdentity, /^[a-f0-9]{64}$/u);
    assert.equal(classification.schema, "stasis-wild-case-classification-v4");
    assert.deepEqual(classification.classification.currentUrl, { outcome: "equivalent" });

    const mutatedPostflightRuntime = structuredClone(projectedRuntime);
    mutatedPostflightRuntime.chromiumExecutableSha256 = "0".repeat(64);
    await assert.rejects(
      () => verifyPostSupportWildResult({
        verifiedCandidate: candidate,
        artifactRoot: root,
        loadBinding,
        observeHarnessRuntime: async () => mutatedPostflightRuntime,
      }),
      /Post-support stable postflight harness runtime differs/u,
    );

    process.env.STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT = "1";
    const verified = await verifyPostSupportWildResult({
      verifiedCandidate: candidate,
      artifactRoot: root,
      loadBinding,
      observeHarnessRuntime: async () => projectedRuntime,
    });
    assert.equal(verified.summary.selectedCount, 100);
    assert.throws(
      () => assertAuthoritativePostSupportWildResult(verified),
      /quiescent postflight/u,
    );
    assert.throws(
      () => assertAuthoritativePostSupportWildResult(structuredClone(verified)),
      /quiescent postflight/u,
    );
    await assert.rejects(
      () => runAuthoritativePostSupportWildSequence({
        verifiedCandidate: candidate,
        artifactRoot: root,
      }),
      /direct default candidate verification/u,
    );

    await writeFile(path.join(root, "unexpected.txt"), "unexpected", { flag: "wx" });
    await assert.rejects(
      () => verifyPostSupportWildResult({
        verifiedCandidate: candidate,
        artifactRoot: root,
        loadBinding,
      }),
      /inventory/u,
    );
  } finally {
    if (priorArtifactRoot === undefined) delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    else process.env.STASIS_COMPAT_ARTIFACT_DIR = priorArtifactRoot;
    if (priorQuiescent === undefined) {
      delete process.env.STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT;
    } else {
      process.env.STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT = priorQuiescent;
    }
    await rm(temporary, { recursive: true, force: true });
  }
});

function fakeSession(url, onClose) {
  let extraction = 0;
  return {
    url,
    stateToken: "opaque-document-authority",
    async settle() {
      return {
        outcome: "quiescent",
        url: "https://site-1.example/final?source=settle#terminal",
        stateToken: "settled-document-authority",
        unsupportedWork: [],
        persistentWork: [],
        externalIo: [],
        processed: {
          controlTurns: 1n,
          tasks: 1n,
          microtasks: 0n,
          renderingOpportunities: 1n,
          mutations: 0n,
        },
      };
    },
    async requests() {
      return { complete: true, hasMore: false, records: [{ method: "GET", headers: { authorization: "private" } }] };
    },
    async evidence() {
      return { complete: true, hasMore: false, records: [{ kind: "response_headers", headers: { "set-cookie": "private" } }] };
    },
    async extract() {
      extraction += 1;
      return extraction === 1
        ? { stateToken: "title-authority", rows: [{ fields: [{ name: "title", value: "Example" }] }] }
        : { stateToken: "link-authority", rows: [{ fields: [{ name: "href", value: "https://example.com/next" }] }] };
    },
    async close() { onClose(); },
  };
}

function successfulBaseline(entry) {
  return {
    status: "success",
    code: "eligible",
    requestedUrl: entry.requestedUrl,
    finalUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
    responseStatus: 200,
    contentType: "text/html",
    extraction: { titleIdentity: normalizeTitleIdentity("Example"), linkIdentities: [] },
    wallTimeMs: 1,
  };
}

function successfulStasis(entry, executableSha256) {
  return {
    status: "success",
    code: "extracted",
    requestedUrl: entry.requestedUrl,
    candidateExecutableSha256: executableSha256,
    openCommittedUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
    currentUrlObservable: true,
    currentUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
    settlement: {
      outcome: "quiescent",
      processed: {
        controlTurns: "1",
        tasks: "1",
        microtasks: "0",
        renderingOpportunities: "1",
        mutations: "0",
      },
      unsupportedWork: [],
      unsupportedWorkOmitted: 0,
      persistentWork: [],
      persistentWorkOmitted: 0,
      externalIoCount: 0,
    },
    audit: { complete: true, requests: [], evidence: [], requestRecordsOmitted: 0, evidenceRecordsOmitted: 0 },
    extraction: { titleIdentity: normalizeTitleIdentity("Example"), linkIdentities: [] },
    cleanup: { status: "passed", mode: "graceful_session_close" },
    wallTimeMs: 1,
  };
}

function corpusEntry(slot) {
  return {
    slot,
    stratumId: "rank-1-1000",
    stratumSlot: slot,
    permutationIndex: slot - 1,
    rank: slot,
    domain: `site-${slot}.example`,
    requestedUrl: `https://site-${slot}.example/`,
  };
}

function authoritativeCorpusEntry(slot) {
  const stratum = strata[Math.floor((slot - 1) / 20)];
  const stratumSlot = ((slot - 1) % 20) + 1;
  const rank = stratum.minRank + stratumSlot - 1;
  return {
    slot,
    stratumId: stratum.id,
    stratumSlot,
    permutationIndex: stratumSlot - 1,
    rank,
    domain: `site-${slot}.example`,
    requestedUrl: `https://site-${slot}.example/`,
  };
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

async function syntheticBinding(entries) {
  const nodeMetadata = await stat(process.execPath);
  const tree = { sha256: "e".repeat(64), fileCount: 1, totalBytes: 1 };
  return {
    harnessCommit: "a".repeat(40),
    preregistrationCommit: "b".repeat(40),
    corpusPath: "corpora/wild-tranco-74V4X-v1.json",
    corpusSha256: "c".repeat(64),
    preflightLedgerPath: "corpora/wild-tranco-74V4X-v1-preflight.json",
    preflightLedgerSha256: "d".repeat(64),
    corpus: { urls: entries },
    preflightRuntime: {
      node: process.version,
      nodeExecutableBasename: path.basename(process.execPath),
      nodeExecutableBytes: nodeMetadata.size,
      nodeExecutableSha256: await sha256File(process.execPath),
      harnessSdk: "0.2.1",
      crawlee: "3.18.1",
      crawleeTree: tree,
      playwright: "1.62.1",
      playwrightTree: tree,
      installedNodeModulesTree: tree,
      chromiumVersion: "test",
      chromiumExecutableBasename: "chrome.exe",
      chromiumExecutableBytes: 1,
      chromiumExecutableSha256: "f".repeat(64),
    },
  };
}

async function smokeTestLaunch() {
  const requestId = "opaque-smoke-request";
  return {
    async openSession(url) {
      return {
        url,
        stateToken: "opaque-smoke-authority",
        async settle() { return { outcome: "quiescent" }; },
        async requests() {
          return {
            complete: true,
            hasMore: false,
            records: [{
              requestId,
              method: "GET",
              url: { origin: "https://stasis.invalid", path: "/", queryKeys: [] },
              resourceKind: "navigation",
              mainFrame: true,
              bodyBytes: 0n,
            }],
          };
        },
        async evidence() {
          return {
            complete: true,
            hasMore: false,
            records: [
              { requestId, kind: "request_started" },
              { requestId, kind: "route_decided", decision: "fixture_fulfill" },
              { requestId, kind: "response_headers", status: 200 },
              { requestId, kind: "request_completed" },
            ],
          };
        },
        async close() {},
      };
    },
    async close() {},
  };
}

function withChromiumInstallationTree(runtime) {
  return {
    ...structuredClone(runtime),
    chromiumInstallationTree: {
      sha256: "9".repeat(64),
      fileCount: 309,
      totalBytes: 447_418_087,
    },
  };
}

function retainedSmokeFixture() {
  const runGeneration = {
    schema: "stasis-wild-run-generation-v1",
    nonceSha256: "1".repeat(64),
    artifactRootPathSha256: "2".repeat(64),
  };
  const candidate = { schema: "stasis-post-support-wild-candidate-v1" };
  const runtime = { node: "v22.20.0" };
  const expected = {
    candidate,
    corpusSha256: "3".repeat(64),
    executionAuthority: "default_verified_candidate_uninjected",
    harnessCommit: "4".repeat(40),
    preflightLedgerSha256: "5".repeat(64),
    preregistrationCommit: "6".repeat(40),
    runGeneration,
    runtime,
  };
  return {
    expected,
    value: {
      schema: "stasis-post-support-wild-network-policy-smoke-v1",
      protocol,
      status: "passed",
      executionAuthority: expected.executionAuthority,
      runGeneration: structuredClone(runGeneration),
      startedAt: "2026-08-30T00:00:00.000Z",
      completedAt: "2026-08-30T00:00:01.000Z",
      harnessCommit: expected.harnessCommit,
      preregistrationCommit: expected.preregistrationCommit,
      corpusSha256: expected.corpusSha256,
      preflightLedgerSha256: expected.preflightLedgerSha256,
      runtime: structuredClone(runtime),
      candidate: structuredClone(candidate),
      policy: {
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
      },
      fixture: {
        targetClass: "synthetic_reserved_invalid_origin",
        method: "GET",
        routeDecision: "fixture_fulfill",
      },
      result: {
        outcome: "quiescent",
        requestCount: 1,
        requestMethods: ["GET"],
        routeDecisionCount: 1,
        liveDecisionCount: 0,
        cleanup: "graceful_session_close",
      },
    },
  };
}
