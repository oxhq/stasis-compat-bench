import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { rwaAuthCases, rwaAuthSource } from "../src/rwa/cases.mjs";
import {
  RwaBaselineInvalidError,
  buildCypressRunOptions,
  newlineOnlyEqual,
  projectCypressResultForArtifact,
  runCypressBaseline,
  validateCypressResult,
} from "../src/rwa/run-cypress.mjs";

const upstreamRoot = "E:\\frozen-rwa";

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
      env: { defaultPassword: "s3cret", reviewerToken: "ambient-secret" },
      expose: { apiUrl: "http://localhost:3001", providerSecret: "exposed-secret" },
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
        spec: { relative: "cypress\\tests\\ui\\auth.spec.ts" },
        stats: { failures: 0, passes: 8, pending: 0, skipped: 0, tests: 8 },
        tests,
      },
    ],
    totalFailed: 0,
    totalPassed: 8,
    totalPending: 0,
    totalSkipped: 0,
    totalTests: 8,
  };
}

test("Cypress invocation pins one unchanged spec to bundled Electron and zero retries", () => {
  const options = buildCypressRunOptions(upstreamRoot);
  assert.deepEqual(options, {
    browser: "electron",
    config: { retries: { runMode: 0, openMode: 0 } },
    configFile: path.resolve(upstreamRoot, "cypress.config.ts"),
    headless: true,
    project: path.resolve(upstreamRoot),
    quiet: true,
    record: false,
    spec: path.resolve(upstreamRoot, "cypress", "tests", "ui", "auth.spec.ts"),
    testingType: "e2e",
  });
});

test("structured Cypress results preserve the frozen eight-case denominator and order", () => {
  const validation = validateCypressResult(validCypressResult(), upstreamRoot);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.violations, []);
  assert.deepEqual(
    validation.cases.map(({ id, ordinal, state, attempts }) => [
      id,
      ordinal,
      state,
      attempts.length,
    ]),
    rwaAuthCases.map(({ id, ordinal }) => [id, ordinal, "passed", 1]),
  );
});

test("missing, reordered, retried, or failed cases invalidate the baseline", () => {
  const result = validCypressResult();
  [result.runs[0].tests[0], result.runs[0].tests[1]] = [
    result.runs[0].tests[1],
    result.runs[0].tests[0],
  ];
  result.runs[0].tests[2].attempts.push({ state: "passed" });
  result.runs[0].tests[3].state = "failed";
  result.runs[0].tests.pop();
  result.runs[0].stats.tests = 7;
  result.runs[0].stats.passes = 6;
  result.runs[0].stats.failures = 1;
  result.totalTests = 7;
  result.totalPassed = 6;
  result.totalFailed = 1;

  const validation = validateCypressResult(result, upstreamRoot);
  assert.equal(validation.valid, false);
  assert.match(validation.violations.join("\n"), /title\/order mismatch/u);
  assert.match(validation.violations.join("\n"), /exactly one attempt/u);
  assert.match(validation.violations.join("\n"), /state mismatch/u);
  assert.match(validation.violations.join("\n"), /structured tests/u);
  assert.equal(validation.cases.at(-1).state, "missing");
});

test("runtime, endpoint, retry, and isolation drift invalidate the Cypress baseline", () => {
  const mutations = [
    ["Electron version", (result) => { result.browserVersion = "138.0.7204.250"; }],
    ["base URL", (result) => { result.config.baseUrl = "http://127.0.0.1:3000"; }],
    ["API URL", (result) => { result.config.expose.apiUrl = "http://127.0.0.1:3001"; }],
    ["Node version", (result) => { result.config.resolvedNodeVersion = "22.19.0"; }],
    ["test isolation", (result) => { result.config.testIsolation = false; }],
    ["run-mode retries", (result) => { result.config.retries.runMode = 1; }],
  ];
  for (const [label, mutate] of mutations) {
    const result = validCypressResult();
    mutate(result);
    const validation = validateCypressResult(result, upstreamRoot);
    assert.equal(validation.valid, false, label);
    assert.match(validation.violations.join("\n"), new RegExp(label, "iu"), label);
  }
});

test("Cypress startup failure objects cannot masquerade as raw test results", () => {
  const validation = validateCypressResult(
    { failures: 1, message: "Could not find a Cypress configuration file", status: "failed" },
    upstreamRoot,
  );
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.cases, []);
  assert.match(validation.violations[0], /Could not find/u);
});

test("artifact projection omits sentinel secrets from Cypress env and expose", () => {
  const raw = validCypressResult();
  const projection = projectCypressResultForArtifact(raw);
  assert.deepEqual(projection.result.config, {
    apiUrl: "http://localhost:3001",
    baseUrl: "http://localhost:3000",
    resolvedNodeVersion: "22.20.0",
    retries: { openMode: 0, runMode: 0 },
    testIsolation: true,
    viewportHeight: 1000,
    viewportWidth: 1280,
  });
  assert.equal(projection.omittedFields.config, 1);
  assert.deepEqual(raw.config.env, {
    defaultPassword: "s3cret",
    reviewerToken: "ambient-secret",
  });
  const json = JSON.stringify(projection);
  assert.equal(json.includes("s3cret"), false);
  assert.equal(json.includes("ambient-secret"), false);
  assert.equal(json.includes("exposed-secret"), false);
  assert.deepEqual(projection.result.runs[0].tests, raw.runs[0].tests);
});

test("artifact projection canonicalizes every retained Cypress slot", () => {
  const raw = validCypressResult();
  const marker = "OPAQUE_SECRET_SENTINEL_9f2";
  raw.osVersion = { debug: marker };
  raw.config.retries.debug = marker;
  raw.runs[0].stats.debug = marker;
  raw.runs[0].spec.fileName = marker;
  raw.runs[0].tests[0].duration = { debug: marker };
  raw.runs[0].tests[0].attempts[0].debug = marker;
  raw[marker] = marker;

  const projection = projectCypressResultForArtifact(raw, upstreamRoot);
  assert.equal(projection.result.runs[0].tests[0].duration, null);
  assert.deepEqual(projection.result.config.retries, { openMode: 0, runMode: 0 });
  assert.equal(JSON.stringify(projection).includes(marker), false);
});

test("validation cases retain only the frozen Cypress evidence schema", () => {
  const raw = validCypressResult();
  raw.runs[0].tests[0].attempts[0].debug = "OPAQUE_SENTINEL_abc123";
  raw.runs[0].tests[0].opaquePayload = "OPAQUE_SENTINEL_abc123";
  const validation = validateCypressResult(raw, upstreamRoot);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.cases[0].attempts, [{ state: "passed" }]);
  assert.equal(JSON.stringify(validation).includes("OPAQUE_SENTINEL_abc123"), false);
});

test("the runtime database exception permits newline encoding and trailing-newline changes only", () => {
  const canonical = Buffer.from("{\n  \"unchanged\": true\n}\n\n");
  const runtime = Buffer.from("{\r\n  \"unchanged\": true\r\n}");
  const edited = Buffer.from("{\n  \"unchanged\": false\n}\n");
  assert.equal(newlineOnlyEqual(canonical, runtime), true);
  assert.equal(newlineOnlyEqual(canonical, edited), false);
});

test("the runner writes the raw module result only after both checkout inspections pass", async () => {
  const source = { valid: true, violations: [], revision: rwaAuthSource.revision };
  const rawResult = validCypressResult();
  const calls = [];
  let written;
  const result = await runCypressBaseline({
    upstreamRoot,
    inspectCheckout: async () => {
      calls.push("inspect");
      return source;
    },
    probeServers: async () => {
      calls.push("probe");
      return [{ name: "frontend", status: 200 }, { name: "backend", status: 200 }];
    },
    loadCypress: async () => ({
      run: async (options) => {
        calls.push("run");
        assert.deepEqual(options, buildCypressRunOptions(upstreamRoot));
        return rawResult;
      },
    }),
    writeArtifact: async (relativePath, artifact) => {
      calls.push("write");
      written = { relativePath, artifact };
      return "E:\\artifacts\\rwa\\cypress-raw.json";
    },
    now: () => new Date("2026-08-25T06:00:00.000Z"),
  });

  assert.deepEqual(calls, ["inspect", "probe", "run", "inspect", "write"]);
  assert.equal(written.relativePath, "rwa/cypress-raw.json");
  assert.equal(written.artifact.valid, true);
  assert.equal(Object.hasOwn(written.artifact.cypress, "rawResult"), false);
  assert.deepEqual(written.artifact.cypress.result.config, {
    apiUrl: "http://localhost:3001",
    baseUrl: "http://localhost:3000",
    resolvedNodeVersion: "22.20.0",
    retries: { openMode: 0, runMode: 0 },
    testIsolation: true,
    viewportHeight: 1000,
    viewportWidth: 1280,
  });
  assert.equal(written.artifact.cypress.omittedFields.config, 1);
  const artifactJson = JSON.stringify(written.artifact);
  assert.equal(artifactJson.includes("s3cret"), false);
  assert.equal(artifactJson.includes("ambient-secret"), false);
  assert.equal(artifactJson.includes("exposed-secret"), false);
  assert.equal(written.artifact.cypress.validation.cases.length, 8);
  assert.equal(result.artifactPath, "E:\\artifacts\\rwa\\cypress-raw.json");
});

test("a dirty preflight skips Cypress, writes a failure artifact, and throws", async () => {
  let loaded = false;
  let artifact;
  await assert.rejects(
    runCypressBaseline({
      upstreamRoot,
      inspectCheckout: async () => ({
        valid: false,
        violations: ["tracked application source changed"],
      }),
      probeServers: async () => {
        throw new Error("must not probe after a failed source preflight");
      },
      loadCypress: async () => {
        loaded = true;
        return { run: async () => validCypressResult() };
      },
      writeArtifact: async (_relativePath, value) => {
        artifact = value;
        return "E:\\artifacts\\rwa\\cypress-raw.json";
      },
    }),
    (error) => {
      assert.equal(error instanceof RwaBaselineInvalidError, true);
      assert.match(error.message, /tracked application source changed/u);
      return true;
    },
  );
  assert.equal(loaded, false);
  assert.equal(artifact.valid, false);
  assert.equal(artifact.cypress.result, null);
});
