import assert from "node:assert/strict";
import test from "node:test";

import { compareRwa, validateBaseline, validateCandidate } from "../src/rwa/compare-lib.mjs";
import { rwaAuthCases, rwaAuthSource } from "../src/rwa/cases.mjs";
import { evaluateRwaOracles } from "../src/rwa/stasis-lane.mjs";
import {
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "../src/rwa/runtime-identity.mjs";

const root = "E:\\frozen-rwa";
const rwaTree = "04c8874fbdcfd56a4d6fb74e7810304622fe787f";
const seed = {
  path: "data/database-seed.json",
  blobOid: "9a785bdf968bfdc33d5ae8493ed544121254f4cf",
  blobSha256: "694f9f9e955211cc6037a1d58eb020671375491ea670a3fcf6183a81a34da715",
  worktreeSha256: "c2449435bbf44bcef412a178fb51b8561d3c2d7ba9fc55b10d0b8a09ea66c3a1",
};
const executableSha256 = "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d";
const boundaryCatalog = {
  "current-path-sdk-gap": {
    classification: "SDK_GAP",
    typedSurface: "current_top_level_url",
    code: "current_top_level_path_unobservable",
  },
  "persistent-cookie-profile-gap": {
    classification: "PROFILE_UNSUPPORTED",
    typedSurface: "storage",
    code: "unsupported_persistent_cookie",
  },
  "visibility-reduced-to-semantic-dom": {
    classification: "PASS_WITH_SEMANTIC_DIFFERENCE",
    typedSurface: "visibility",
    code: "semantic_dom_oracle_only",
  },
};

function checkout() {
  return {
    valid: true,
    violations: [],
    root,
    revision: rwaAuthSource.revision,
    tree: rwaTree,
    detached: true,
    authSpec: {
      path: rwaAuthSource.specPath,
      blobOid: rwaAuthSource.specBlobOid,
      blobSha256: rwaAuthSource.specBlobSha256,
      worktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
    },
    seed: { ...seed },
    generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
    runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
    localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
    ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
    trackedStatusEntries: [],
    runtimeDatabase: {
      path: "data/database.json",
      blobOid: seed.blobOid,
      blobSha256: seed.blobSha256,
      worktreeSha256: seed.worktreeSha256,
      newlineOnlyDifference: false,
      allowedRuntimeMutation: false,
    },
  };
}

function baseline(valid = true) {
  const tests = rwaAuthCases.map((entry) => ({
    title: [rwaAuthSource.describeTitle, entry.source.title],
    state: "passed",
    duration: 1,
    attempts: [{ state: "passed" }],
    displayError: null,
  }));
  const cases = rwaAuthCases.map((entry) => ({
    id: entry.id,
    ordinal: entry.ordinal,
    title: [rwaAuthSource.describeTitle, entry.source.title],
    state: "passed",
    attempts: [{ state: "passed" }],
    durationMilliseconds: 1,
    displayError: null,
  }));
  return {
    schema: "stasis-compat-rwa-cypress-raw-v1",
    protocol: "stasis-compat-bench-v1",
    lane: "unchanged-rwa-cypress-baseline",
    valid,
    violations: [],
    source: { preflight: checkout(), postflight: checkout() },
    runtime: {
      node: "v22.20.0",
      configuredRetries: { runMode: 2 },
      primaryRetryOverride: { runMode: 0, openMode: 0 },
      externalServers: externalServers(),
    },
    invocation: {
      browser: "electron",
      config: { retries: { runMode: 0, openMode: 0 } },
      configFile: `${root}\\cypress.config.ts`,
      headless: true,
      project: root,
      quiet: true,
      record: false,
      spec: `${root}\\cypress\\tests\\ui\\auth.spec.ts`,
      testingType: "e2e",
    },
    cypress: {
      validation: {
        valid,
        violations: [],
        cases,
      },
      executionError: null,
      result: {
        browserName: "electron",
        browserPath: "",
        browserVersion: "138.0.7204.251",
        cypressVersion: "15.17.0",
        osName: "win32",
        totalSuites: 1,
        totalTests: 8,
        totalPassed: 8,
        totalFailed: 0,
        totalPending: 0,
        totalSkipped: 0,
        totalDuration: 8,
        config: {
          apiUrl: "http://localhost:3001",
          baseUrl: "http://localhost:3000",
          resolvedNodeVersion: "22.20.0",
          retries: { runMode: 0, openMode: 0 },
          testIsolation: true,
          viewportHeight: 1000,
          viewportWidth: 1280,
        },
        runs: [
          {
            error: null,
            stats: { tests: 8, passes: 8, failures: 0, pending: 0, skipped: 0 },
            spec: { relative: rwaAuthSource.specPath },
            tests,
          },
        ],
      },
    },
  };
}

function externalServers() {
  const node = {
    processId: 1234,
    processName: "node.exe",
    nodeVersion: "v22.20.0",
    executableBytes: 85_588_976,
    executableSha256: "fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d",
    launcherProcessId: 4321,
    launcherMatchesFrozenHost: true,
    commandMatchesPinnedRole: true,
  };
  return [
    {
      name: "frontend",
      url: "http://localhost:3000/",
      status: 200,
      contentType: "text/html; charset=UTF-8",
      bodyBytes: 1_986,
      bodySha256: "ac35f7a0c820e107e30fba1fda385af1f0356a3b235aea25c008ac4d5d838f0a",
      listener: { ...node, port: 3000, scriptRole: "scripts/testServer.ts" },
      servedBuildTree: {
        sha256: "769186804dfdda106af44894a8f9d065fe840db5835a1c515debff3e9c469a09",
        fileCount: 10,
        totalBytes: 12_961_036,
      },
      generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
      runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
      localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
      ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
    },
    {
      name: "backend",
      url: "http://localhost:3001/",
      status: 200,
      contentType: "text/html; charset=utf-8",
      bodyBytes: 31,
      bodySha256: "d6b1c376168804954c90cc66eb240ce7859e5276ddae40e0fcb07a9bfceff412",
      listener: { ...node, port: 3001, scriptRole: "backend/app.ts" },
    },
  ];
}

function candidate(classification = "ENGINE_BUG") {
  const cases = rwaAuthCases.map((entry) => candidateCase(entry, classification));
  const passed = cases.filter(({ success }) => success).length;
  const classifications = { [classification]: cases.length };
  const value = {
    schema: "stasis-compat-rwa-stasis-raw-v1",
    protocol: "stasis-compat-bench-v1",
    track: "rwa-auth",
    runner: "stasis-controlled-web-session-v1",
    source: structuredClone(rwaAuthSource),
    versions: {
      sdk: "@oxhq/stasis@0.2.1",
      node: "v22.20.0",
      expectedNode: "v22.20.0",
      nodeIdentityMatches: true,
      executablePath: "E:\\stasis\\stasis.exe",
      executableSha256,
      expectedExecutableSha256: executableSha256,
      candidateIdentityMatches: true,
    },
    endpoints: {
      appOrigin: "http://localhost:3000",
      apiOrigin: "http://localhost:3001",
      seed: "http://localhost:3001/testData/seed",
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
    denominator: 8,
    sharedBlocker: classification === "ENGINE_BUG"
      ? {
          classification,
          typedSurface: "navigation_authority",
          phase: "openSession",
          code: "navigation_authority_changed",
          affectedCases: rwaAuthCases.map(({ ordinal }) => ordinal),
        }
      : null,
    cases,
    summary: {
      complete: true,
      classified: cases.length,
      passed,
      failedOrUnsupported: cases.length - passed,
      classifications,
    },
  };
  return value;
}

function candidateCase(entry, classification) {
  const engineBug = classification === "ENGINE_BUG";
  const error = engineBug
    ? {
        name: "StasisProtocolError",
        message: "the admitted navigation did not activate the exact controlled document",
        code: "navigation_authority_changed",
        fatal: true,
        stateEffect: "partial",
      }
    : null;
  const boundaries = entry.semanticDifferenceIds.flatMap((id) =>
    boundaryCatalog[id] === undefined ? [] : [{ id, ...boundaryCatalog[id] }],
  );
  const checkpoints = [
    { sequence: 1, phase: "pre-registered-capability-boundary", status: "recorded", boundaries },
    {
      sequence: 2,
      phase: "seed",
      status: "passed",
      method: "POST",
      path: "/testData/seed",
      httpStatus: 200,
    },
  ];
  if (entry.adapterRequirements.includes("seeded-user-fixture")) {
    checkpoints.push({
      sequence: checkpoints.length + 1,
      phase: "seeded-user-fixture",
      status: "passed",
      user: { id: "user-1", username: "user@example.test" },
    });
  }
  checkpoints.push({
    sequence: checkpoints.length + 1,
    phase: "runtime-launch",
    status: "passed",
    freshNativeProcess: true,
  });
  if (engineBug) {
    checkpoints.push({
      sequence: checkpoints.length + 1,
      phase: "action",
      status: "failed",
      actionIndex: 0,
      action: retainedAction(entry.stasisActions[0]),
      error,
    });
  } else {
    for (let actionIndex = 0; actionIndex < entry.stasisActions.length; actionIndex += 1) {
      checkpoints.push({
        sequence: checkpoints.length + 1,
        phase: "action",
        status: "passed",
        actionIndex,
        action: retainedAction(entry.stasisActions[actionIndex]),
        result: {},
      });
    }
    if (entry.adapterRequirements.includes("backend-state-observer")) {
      checkpoints.push({
        sequence: checkpoints.length + 1,
        phase: "backend-state-observer",
        status: "passed",
        state: {},
      });
    }
  }
  checkpoints.push({
    sequence: checkpoints.length + 1,
    phase: "cleanup",
    status: "passed",
    mode: engineBug ? "fail-stop-runtime-close" : "graceful-session-close",
  });
  const terminal = engineBug
    ? {
        phase: "openSession",
        actionIndex: 0,
        classification,
        typedSurface: "navigation_authority",
        error,
      }
    : null;
  return {
    id: entry.id,
    ordinal: entry.ordinal,
    title: entry.source.title,
    source: structuredClone(entry.source),
    classification,
    ...(engineBug ? { typedSurface: "navigation_authority" } : {}),
    success: classification.startsWith("PASS_"),
    semanticDifferenceIds: [...entry.semanticDifferenceIds],
    preRegisteredBoundaries: boundaries,
    terminal,
    checkpoints,
    oracles: engineBug
      ? evaluateRwaOracles(entry, [], null, terminal)
      : entry.oracles.map(({ id, kind, expected }) => ({
          id,
          kind,
          expected: structuredClone(expected),
          status: "PASS",
        })),
    wallTimeMs: 1,
  };
}

function retainedAction(action) {
  const copy = structuredClone(action);
  if (Object.hasOwn(copy, "value")) {
    copy.valueLength = String(copy.value).length;
    delete copy.value;
  }
  return copy;
}

test("a valid shared engine terminal remains visible for all eight RWA cases", () => {
  const result = compareRwa(baseline(), candidate());
  assert.equal(result.baselineValid, true);
  assert.equal(result.candidateValid, true);
  assert.deepEqual(result.counts, { ENGINE_BUG: 8 });
  assert.equal(result.exactEquivalentRate, 0);
  assert.equal(result.behaviorallySupportedRate, 0);
  assert.equal(result.sharedBlocker.code, "navigation_authority_changed");
});

test("an invalid baseline forces BASELINE_FAILURE across the frozen denominator", () => {
  const result = compareRwa(baseline(false), candidate());
  assert.equal(result.baselineValid, false);
  assert.deepEqual(result.counts, { BASELINE_FAILURE: 8 });
});

test("missing candidate cases cannot become a scientific result", () => {
  const value = candidate();
  value.cases.pop();
  const result = compareRwa(baseline(), value);
  assert.equal(result.candidateValid, false);
  assert.deepEqual(result.counts, { BENCHMARK_INVALID: 8 });
});

test("malformed candidate case entries become benchmark-invalid instead of crashing comparison", () => {
  const value = candidate();
  value.cases[0] = null;
  const result = compareRwa(baseline(), value);
  assert.equal(result.candidateValid, false);
  assert.deepEqual(result.counts, { BENCHMARK_INVALID: 8 });
});

test("fabricated supported outcomes without matching observations are rejected", () => {
  const value = candidate("PASS_WITH_SEMANTIC_DIFFERENCE");
  const result = compareRwa(baseline(), value);
  assert.equal(result.candidateValid, false);
  assert.deepEqual(result.counts, { BENCHMARK_INVALID: 8 });
  assert.equal(result.exactEquivalentRate, 0);
  assert.equal(result.behaviorallySupportedRate, 0);
  assert.match(result.candidateViolations.join("\n"), /oracle evidence recomputation/u);
});

test("self-declared passing cases with empty checkpoints and unreached oracles are invalid", () => {
  const value = candidate("PASS_WITH_SEMANTIC_DIFFERENCE");
  for (const entry of value.cases) {
    entry.checkpoints = [];
    for (const oracle of entry.oracles) oracle.status = "NOT_REACHED";
  }
  const result = compareRwa(baseline(), value);
  assert.equal(result.candidateValid, false);
  assert.deepEqual(result.counts, { BENCHMARK_INVALID: 8 });
  assert.match(result.candidateViolations.join("\n"), /lacks raw checkpoints/u);
  assert.match(result.candidateViolations.join("\n"), /NOT_REACHED oracles without a terminal/u);
});

test("baseline validity is derived from frozen source, runtime, retry, and isolation evidence", () => {
  const mutations = [
    ["schema", (value) => { delete value.schema; }],
    ["source postflight", (value) => { value.source.postflight.valid = false; }],
    ["runtime", (value) => { value.runtime.node = "v99.0.0"; }],
    ["runner retries", (value) => { value.cypress.result.config.retries.runMode = 1; }],
    ["test isolation", (value) => { value.cypress.result.config.testIsolation = false; }],
    ["resolved base URL", (value) => { value.cypress.result.config.baseUrl = "http://127.0.0.1:3000"; }],
    ["resolved API URL", (value) => { value.cypress.result.config.apiUrl = "http://127.0.0.1:3001"; }],
    ["resolved Node", (value) => { value.cypress.result.config.resolvedNodeVersion = "22.19.0"; }],
    ["Electron patch", (value) => { value.cypress.result.browserVersion = "138.0.7204.250"; }],
    ["case identity", (value) => { value.cypress.result.runs[0].tests[0].title[1] = "fabricated"; }],
    ["server endpoint", (value) => { value.runtime.externalServers[0].url = "http://localhost:3999/"; }],
    ["server listener", (value) => { value.runtime.externalServers[0].listener.commandMatchesPinnedRole = false; }],
    ["served build", (value) => { value.runtime.externalServers[0].servedBuildTree.sha256 = "0".repeat(64); }],
  ];
  for (const [label, mutate] of mutations) {
    const value = baseline();
    mutate(value);
    assert.equal(validateBaseline(value).valid, false, label);
  }
});

test("candidate envelope, summary, cases, checkpoints, and oracle identities are frozen", () => {
  const mutations = [
    ["schema identity", (value) => { delete value.schema; }],
    ["node identity", (value) => { value.versions.node = "v99.0.0"; }],
    ["endpoint identity", (value) => { value.endpoints.appOrigin = "http://localhost:3999"; }],
    ["execution rules", (value) => { value.rules.retries = 1; }],
    ["summary", (value) => { value.summary.passed = 8; }],
    ["shared blocker", (value) => { value.sharedBlocker = null; }],
    ["semantic differences", (value) => { value.cases[0].semanticDifferenceIds = []; }],
    ["pre-registered boundaries", (value) => { value.cases[0].preRegisteredBoundaries = [{}]; }],
    ["checkpoint sequence", (value) => { value.cases[0].checkpoints[1].sequence = 99; }],
    ["action identity", (value) => { delete value.cases[0].checkpoints[3].action; }],
    ["cleanup evidence", (value) => { value.cases[0].checkpoints.pop(); }],
    ["oracle id", (value) => { value.cases[0].oracles[0].id = "fabricated"; }],
    ["oracle kind", (value) => { value.cases[0].oracles[0].kind = "fabricated"; }],
    ["oracle expectation", (value) => { value.cases[0].oracles[0].expected = "/fabricated"; }],
  ];
  for (const [label, mutate] of mutations) {
    const value = candidate();
    mutate(value);
    assert.equal(validateCandidate(value).valid, false, label);
  }
});

test("passing oracle claims require the complete frozen action and observer trail", () => {
  const value = candidate("PASS_WITH_SEMANTIC_DIFFERENCE");
  for (const entry of value.cases) {
    entry.checkpoints = entry.checkpoints.filter(({ phase }) => phase !== "action");
    entry.checkpoints.forEach((checkpoint, index) => {
      checkpoint.sequence = index + 1;
    });
  }
  const result = compareRwa(baseline(), value);
  assert.equal(result.candidateValid, false);
  assert.deepEqual(result.counts, { BENCHMARK_INVALID: 8 });
  assert.match(result.candidateViolations.join("\n"), /action checkpoint denominator mismatch/u);
});

test("pass and terminal classifications must agree with their material evidence", () => {
  const missingTerminal = candidate();
  missingTerminal.cases[0].terminal = null;
  assert.equal(validateCandidate(missingTerminal).valid, false);

  const mismatchedCheckpoint = candidate();
  mismatchedCheckpoint.cases[0].checkpoints[3].error.code = "different_error";
  assert.equal(validateCandidate(mismatchedCheckpoint).valid, false);

  const exactPassWithRegisteredDifferences = candidate("PASS_EQUIVALENT");
  assert.equal(validateCandidate(exactPassWithRegisteredDifferences).valid, false);
});

test("hostile parsed JSON fails closed without aborting comparison", () => {
  const value = candidate();
  value.cases[0].checkpoints = [null];
  value.cases[0].oracles = value.cases[0].oracles.map(() => null);
  const result = compareRwa(baseline(), value);
  assert.equal(result.candidateValid, false);
  assert.deepEqual(result.counts, { BENCHMARK_INVALID: 8 });
});
