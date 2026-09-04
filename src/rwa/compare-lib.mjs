import { isDeepStrictEqual } from "node:util";

import { rwaAuthCases, rwaAuthSource } from "./cases.mjs";
import {
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "./runtime-identity.mjs";
import {
  classifyStasisFailure,
  evaluateRwaOracles,
  rwaUnsupportedTimeSurfaces,
  rwaUnsupportedWorkKinds,
  rwaUnsupportedWorkReasons,
  rwaUnsupportedWorkRetentionLimit,
} from "./stasis-lane.mjs";

const classifications = new Set([
  "PASS_EQUIVALENT",
  "PASS_WITH_SEMANTIC_DIFFERENCE",
  "SDK_GAP",
  "PROFILE_UNSUPPORTED",
  "ENGINE_BUG",
  "WEB_COMPAT_BUG",
  "BASELINE_FAILURE",
  "APP_MODIFICATION_REQUIRED",
  "BENCHMARK_INVALID",
]);

const supported = new Set(["PASS_EQUIVALENT", "PASS_WITH_SEMANTIC_DIFFERENCE"]);
const unsupportedWorkKindSet = new Set(rwaUnsupportedWorkKinds);
const unsupportedWorkReasonSet = new Set(rwaUnsupportedWorkReasons);
const unsupportedTimeSurfaceSet = new Set(rwaUnsupportedTimeSurfaces);
const maximumU128 = (1n << 128n) - 1n;
const rwaFinalPathProjectionAllowlist = new Set(
  rwaAuthCases.flatMap(({ stasisActions, oracles }) => [
    ...stasisActions
      .filter(({ op }) => op === "openSession")
      .map(({ path }) => path),
    ...oracles
      .filter(({ kind }) =>
        kind === "controlled-open-final-url" || kind === "controlled-settle-final-url")
      .map(({ expected }) => expected),
  ]),
);

const frozen = Object.freeze({
  baselineSchema: "stasis-compat-rwa-cypress-raw-v1",
  baselineLane: "unchanged-rwa-cypress-baseline",
  candidateSchema: "stasis-compat-rwa-stasis-raw-v1",
  rwaTree: "04c8874fbdcfd56a4d6fb74e7810304622fe787f",
  seed: Object.freeze({
    path: "data/database-seed.json",
    blobOid: "9a785bdf968bfdc33d5ae8493ed544121254f4cf",
    blobSha256: "694f9f9e955211cc6037a1d58eb020671375491ea670a3fcf6183a81a34da715",
    worktreeSha256: "c2449435bbf44bcef412a178fb51b8561d3c2d7ba9fc55b10d0b8a09ea66c3a1",
  }),
  node: "v22.20.0",
  resolvedNodeVersion: "22.20.0",
  cypressVersion: "15.17.0",
  electronVersion: "138.0.7204.251",
  baseUrl: "http://localhost:3000",
  apiUrl: "http://localhost:3001",
  viewport: Object.freeze({ width: 1280, height: 1000 }),
  configuredRetries: Object.freeze({ runMode: 2 }),
  primaryRetries: Object.freeze({ runMode: 0, openMode: 0 }),
  externalServers: Object.freeze([
    Object.freeze({
      name: "frontend",
      url: "http://localhost:3000/",
      port: 3000,
      scriptRole: "scripts/testServer.ts",
      contentType: "text/html; charset=UTF-8",
      bodyBytes: 1_986,
      bodySha256: "ac35f7a0c820e107e30fba1fda385af1f0356a3b235aea25c008ac4d5d838f0a",
      servedBuildTree: Object.freeze({
        sha256: "769186804dfdda106af44894a8f9d065fe840db5835a1c515debff3e9c469a09",
        fileCount: 10,
        totalBytes: 12_961_036,
      }),
      generatedRuntimeFiles: RWA_GENERATED_RUNTIME_IDENTITY,
      runtimeCache: RWA_RUNTIME_CACHE_IDENTITY,
      localEnvironmentFiles: RWA_LOCAL_ENV_IDENTITY,
      ambientOverrides: RWA_AMBIENT_OVERRIDE_IDENTITY,
    }),
    Object.freeze({
      name: "backend",
      url: "http://localhost:3001/",
      port: 3001,
      scriptRole: "backend/app.ts",
      contentType: "text/html; charset=utf-8",
      bodyBytes: 31,
      bodySha256: "d6b1c376168804954c90cc66eb240ce7859e5276ddae40e0fcb07a9bfceff412",
    }),
  ]),
  nodeExecutableSha256: "fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d",
  nodeExecutableBytes: 85_588_976,
  candidateTrack: "rwa-auth",
  candidateRunner: "stasis-controlled-web-session-v1",
  sdk: "@oxhq/stasis@0.2.1",
  executableSha256: "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d",
  endpoints: Object.freeze({
    appOrigin: "http://localhost:3000",
    apiOrigin: "http://localhost:3001",
    seed: "http://localhost:3001/testData/seed",
  }),
  rules: Object.freeze({
    retries: 0,
    fallback: false,
    sleeps: false,
    domPolling: false,
    businessApiSubstitution: false,
    processPerCase: 1,
    seedBeforeEveryCase: true,
  }),
});

const preRegisteredBoundaryCatalog = Object.freeze({
  "current-path-sdk-gap": Object.freeze({
    classification: "SDK_GAP",
    typedSurface: "current_top_level_url",
    code: "current_top_level_path_unobservable",
  }),
  "persistent-cookie-profile-gap": Object.freeze({
    classification: "PROFILE_UNSUPPORTED",
    typedSurface: "storage",
    code: "unsupported_persistent_cookie",
  }),
  "visibility-reduced-to-semantic-dom": Object.freeze({
    classification: "PASS_WITH_SEMANTIC_DIFFERENCE",
    typedSurface: "visibility",
    code: "semantic_dom_oracle_only",
  }),
});

const materialClassificationPriority = [
  "BENCHMARK_INVALID",
  "APP_MODIFICATION_REQUIRED",
  "PROFILE_UNSUPPORTED",
  "SDK_GAP",
  "ENGINE_BUG",
  "WEB_COMPAT_BUG",
];

export function compareRwa(baseline, candidate) {
  const baselineValidation = validateBaseline(baseline);
  const candidateValidation = validateCandidate(candidate);
  const cases = rwaAuthCases.map((definition, index) => {
    const baselineCase = baseline?.cypress?.validation?.cases?.[index];
    const candidateCase = candidate?.cases?.[index];
    if (!baselineValidation.valid) {
      return result(definition, "BASELINE_FAILURE", {
        reason: baselineValidation.violations.join("; "),
        baseline: projectBaseline(baselineCase),
      });
    }
    if (!candidateValidation.valid) {
      return result(definition, "BENCHMARK_INVALID", {
        reason: candidateValidation.violations.join("; "),
        baseline: projectBaseline(baselineCase),
        candidate: projectCandidate(candidateCase),
      });
    }
    return result(definition, candidateCase.classification, {
      baseline: projectBaseline(baselineCase),
      candidate: projectCandidate(candidateCase),
    });
  });
  const counts = countClassifications(cases);
  return {
    protocol: "stasis-compat-bench-v1",
    track: "rwa-auth",
    denominator: rwaAuthCases.length,
    baselineValid: baselineValidation.valid,
    baselineViolations: baselineValidation.violations,
    candidateValid: candidateValidation.valid,
    candidateViolations: candidateValidation.violations,
    counts,
    exactEquivalentRate: (counts.PASS_EQUIVALENT ?? 0) / rwaAuthCases.length,
    behaviorallySupportedRate:
      ((counts.PASS_EQUIVALENT ?? 0) + (counts.PASS_WITH_SEMANTIC_DIFFERENCE ?? 0)) /
      rwaAuthCases.length,
    sharedBlocker: candidateValidation.valid ? candidate.sharedBlocker ?? null : null,
    cases,
    diagnosticWallTimeMs: {
      cypress: baseline?.cypress?.result?.totalDuration ?? null,
      stasis: Array.isArray(candidate?.cases)
        ? candidate.cases.reduce((sum, entry) => sum + Number(entry?.wallTimeMs ?? 0), 0)
        : null,
      comparisonClaim: "none; performance is outside the pass criterion",
    },
  };
}

export function validateBaseline(baseline) {
  const violations = [];
  checkEqual(violations, "baseline schema", baseline?.schema, frozen.baselineSchema);
  checkEqual(violations, "baseline protocol", baseline?.protocol, "stasis-compat-bench-v1");
  checkEqual(violations, "baseline lane", baseline?.lane, frozen.baselineLane);
  checkEqual(violations, "baseline valid flag", baseline?.valid, true);
  checkExact(violations, "baseline violations", baseline?.violations, []);

  validateBaselineCheckout(baseline?.source?.preflight, "preflight", violations);
  validateBaselineCheckout(baseline?.source?.postflight, "postflight", violations);
  const preflightRoot = baseline?.source?.preflight?.root;
  const postflightRoot = baseline?.source?.postflight?.root;
  if (typeof preflightRoot !== "string" || preflightRoot.length === 0) {
    violations.push("baseline preflight root is missing");
  } else {
    checkEqual(violations, "baseline postflight root", postflightRoot, preflightRoot);
  }

  checkEqual(violations, "baseline Node", baseline?.runtime?.node, frozen.node);
  checkExact(
    violations,
    "baseline configured retries",
    baseline?.runtime?.configuredRetries,
    frozen.configuredRetries,
  );
  checkExact(
    violations,
    "baseline primary retry override",
    baseline?.runtime?.primaryRetryOverride,
    frozen.primaryRetries,
  );
  validateExternalServers(baseline?.runtime?.externalServers, violations);
  validateCypressInvocation(baseline?.invocation, preflightRoot, violations);

  const cypress = baseline?.cypress;
  checkEqual(violations, "Cypress validation valid flag", cypress?.validation?.valid, true);
  checkExact(violations, "Cypress validation violations", cypress?.validation?.violations, []);
  checkEqual(violations, "Cypress execution error", cypress?.executionError, null);
  validateCypressResultIdentity(cypress?.result, violations);

  const cases = baseline?.cypress?.validation?.cases;
  if (!Array.isArray(cases) || cases.length !== rwaAuthCases.length) {
    violations.push(`baseline denominator is not ${rwaAuthCases.length}`);
    return { valid: false, violations };
  }
  for (let index = 0; index < rwaAuthCases.length; index += 1) {
    const expected = rwaAuthCases[index];
    const actual = cases[index];
    if (actual?.id !== expected.id || actual?.ordinal !== expected.ordinal) {
      violations.push(`baseline case ${index + 1} identity/order mismatch`);
    }
    checkExact(
      violations,
      `${expected.id} baseline title`,
      actual?.title,
      [rwaAuthSource.describeTitle, expected.source.title],
    );
    if (actual?.state !== "passed") violations.push(`${expected.id} baseline did not pass`);
    if (!isDeepStrictEqual(actual?.attempts, [{ state: "passed" }])) {
      violations.push(`${expected.id} baseline did not have exactly one passed attempt`);
    }
    if (actual?.displayError !== null) violations.push(`${expected.id} baseline retained an error`);
  }
  return { valid: violations.length === 0, violations };
}

export function validateCandidate(candidate) {
  const violations = [];
  checkEqual(violations, "candidate schema", candidate?.schema, frozen.candidateSchema);
  checkEqual(violations, "candidate protocol", candidate?.protocol, "stasis-compat-bench-v1");
  checkEqual(violations, "candidate track", candidate?.track, frozen.candidateTrack);
  checkEqual(violations, "candidate runner", candidate?.runner, frozen.candidateRunner);
  checkExact(violations, "candidate source", candidate?.source, rwaAuthSource);
  validateCandidateVersions(candidate?.versions, violations);
  checkExact(violations, "candidate endpoints", candidate?.endpoints, frozen.endpoints);
  checkExact(violations, "candidate rules", candidate?.rules, frozen.rules);
  if (candidate?.denominator !== rwaAuthCases.length) {
    violations.push(`candidate denominator is not ${rwaAuthCases.length}`);
  }
  const cases = candidate?.cases;
  if (!Array.isArray(cases) || cases.length !== rwaAuthCases.length) {
    violations.push(`candidate produced fewer than ${rwaAuthCases.length} classified cases`);
    return { valid: false, violations };
  }
  for (let index = 0; index < rwaAuthCases.length; index += 1) {
    const expected = rwaAuthCases[index];
    const actual = cases[index];
    if (actual?.id !== expected.id || actual?.ordinal !== expected.ordinal) {
      violations.push(`candidate case ${index + 1} identity/order mismatch`);
    }
    if (!classifications.has(actual?.classification)) {
      violations.push(`${expected.id} has unknown classification ${String(actual?.classification)}`);
    }
    checkEqual(violations, `${expected.id} title`, actual?.title, expected.source.title);
    checkExact(violations, `${expected.id} source`, actual?.source, expected.source);
    checkExact(
      violations,
      `${expected.id} semantic differences`,
      actual?.semanticDifferenceIds,
      expected.semanticDifferenceIds,
    );
    checkExact(
      violations,
      `${expected.id} pre-registered boundaries`,
      actual?.preRegisteredBoundaries,
      expectedBoundaries(expected),
    );
    validateCheckpoints(actual, expected, violations);
    validateOracles(actual, expected, violations);
    validateCaseClassification(actual, expected, violations);
  }
  validateCandidateSummary(candidate, violations);
  checkExact(violations, "candidate shared blocker", candidate?.sharedBlocker, deriveSharedBlocker(cases));
  return { valid: violations.length === 0, violations };
}

function validateBaselineCheckout(checkout, phase, violations) {
  checkEqual(violations, `baseline ${phase} valid flag`, checkout?.valid, true);
  checkExact(violations, `baseline ${phase} violations`, checkout?.violations, []);
  checkEqual(violations, `baseline ${phase} revision`, checkout?.revision, rwaAuthSource.revision);
  checkEqual(violations, `baseline ${phase} tree`, checkout?.tree, frozen.rwaTree);
  checkEqual(violations, `baseline ${phase} detached HEAD`, checkout?.detached, true);
  checkExact(violations, `baseline ${phase} auth spec`, checkout?.authSpec, {
    path: rwaAuthSource.specPath,
    blobOid: rwaAuthSource.specBlobOid,
    blobSha256: rwaAuthSource.specBlobSha256,
    worktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
  });
  checkExact(violations, `baseline ${phase} seed`, checkout?.seed, frozen.seed);
  checkExact(
    violations,
    `baseline ${phase} generated runtime files`,
    checkout?.generatedRuntimeFiles,
    RWA_GENERATED_RUNTIME_IDENTITY,
  );
  checkExact(
    violations,
    `baseline ${phase} runtime cache`,
    checkout?.runtimeCache,
    RWA_RUNTIME_CACHE_IDENTITY,
  );
  checkExact(
    violations,
    `baseline ${phase} local environment files`,
    checkout?.localEnvironmentFiles,
    RWA_LOCAL_ENV_IDENTITY,
  );
  checkExact(
    violations,
    `baseline ${phase} ambient overrides`,
    checkout?.ambientOverrides,
    RWA_AMBIENT_OVERRIDE_IDENTITY,
  );

  const status = checkout?.trackedStatusEntries;
  const clean = isDeepStrictEqual(status, []);
  const allowedRuntimeMutation = isDeepStrictEqual(status, [" M data/database.json"]);
  if (!clean && !allowedRuntimeMutation) {
    violations.push(`baseline ${phase} tracked status is not clean or the one allowed runtime mutation`);
  }
  checkEqual(
    violations,
    `baseline ${phase} runtime database path`,
    checkout?.runtimeDatabase?.path,
    "data/database.json",
  );
  checkEqual(
    violations,
    `baseline ${phase} runtime database blob`,
    checkout?.runtimeDatabase?.blobOid,
    frozen.seed.blobOid,
  );
  checkEqual(
    violations,
    `baseline ${phase} runtime database blob SHA-256`,
    checkout?.runtimeDatabase?.blobSha256,
    frozen.seed.blobSha256,
  );
  checkEqual(
    violations,
    `baseline ${phase} runtime mutation flag`,
    checkout?.runtimeDatabase?.allowedRuntimeMutation,
    allowedRuntimeMutation,
  );
  checkEqual(
    violations,
    `baseline ${phase} runtime newline-only flag`,
    checkout?.runtimeDatabase?.newlineOnlyDifference,
    allowedRuntimeMutation,
  );
}

function validateExternalServers(servers, violations) {
  if (!Array.isArray(servers) || servers.length !== frozen.externalServers.length) {
    violations.push(`baseline external server denominator is not ${frozen.externalServers.length}`);
    return;
  }
  const launcherProcessIds = [];
  for (let index = 0; index < frozen.externalServers.length; index += 1) {
    const expected = frozen.externalServers[index];
    const actual = servers[index];
    checkEqual(violations, `baseline server ${index + 1} name`, actual?.name, expected.name);
    checkEqual(violations, `baseline server ${index + 1} URL`, actual?.url, expected.url);
    checkEqual(violations, `baseline server ${index + 1} status`, actual?.status, 200);
    checkEqual(
      violations,
      `baseline server ${index + 1} content type`,
      actual?.contentType,
      expected.contentType,
    );
    checkEqual(
      violations,
      `baseline server ${index + 1} body bytes`,
      actual?.bodyBytes,
      expected.bodyBytes,
    );
    checkEqual(
      violations,
      `baseline server ${index + 1} body hash`,
      actual?.bodySha256,
      expected.bodySha256,
    );
    checkExact(
      violations,
      `baseline server ${index + 1} served build tree`,
      actual?.servedBuildTree,
      expected.servedBuildTree,
    );
    for (const field of ["generatedRuntimeFiles", "runtimeCache", "localEnvironmentFiles", "ambientOverrides"]) {
      checkExact(
        violations,
        `baseline server ${index + 1} ${field}`,
        actual?.[field],
        expected[field],
      );
    }
    const listener = actual?.listener;
    if (
      !isRecord(listener) ||
      !hasExactKeys(listener, [
        "commandMatchesPinnedRole",
        "executableBytes",
        "executableSha256",
        "launcherMatchesFrozenHost",
        "launcherProcessId",
        "nodeVersion",
        "port",
        "processId",
        "processName",
        "scriptRole",
      ]) ||
      listener.port !== expected.port ||
      !Number.isSafeInteger(listener.processId) ||
      listener.processId < 1 ||
      listener.processName !== "node.exe" ||
      listener.nodeVersion !== frozen.node ||
      listener.executableBytes !== frozen.nodeExecutableBytes ||
      listener.executableSha256 !== frozen.nodeExecutableSha256 ||
      !Number.isSafeInteger(listener.launcherProcessId) ||
      listener.launcherProcessId < 1 ||
      listener.launcherMatchesFrozenHost !== true ||
      listener.scriptRole !== expected.scriptRole ||
      listener.commandMatchesPinnedRole !== true
    ) {
      violations.push(`baseline server ${index + 1} listener identity is not frozen`);
    } else {
      launcherProcessIds.push(listener.launcherProcessId);
    }
    const expectedKeys = [
      "bodyBytes",
      "bodySha256",
      "contentType",
      "listener",
      "name",
      "status",
      "url",
      ...(expected.servedBuildTree === undefined ? [] : ["servedBuildTree"]),
      ...(expected.generatedRuntimeFiles === undefined ? [] : ["generatedRuntimeFiles"]),
      ...(expected.runtimeCache === undefined ? [] : ["runtimeCache"]),
      ...(expected.localEnvironmentFiles === undefined ? [] : ["localEnvironmentFiles"]),
      ...(expected.ambientOverrides === undefined ? [] : ["ambientOverrides"]),
    ];
    if (!isRecord(actual) || !hasExactKeys(actual, expectedKeys)) {
      violations.push(`baseline server ${index + 1} evidence contains missing or opaque fields`);
    }
  }
  if (launcherProcessIds.length !== 2 || new Set(launcherProcessIds).size !== 1) {
    violations.push("baseline RWA listeners do not share one frozen server host");
  }
}

function validateCypressInvocation(invocation, root, violations) {
  checkEqual(violations, "baseline browser invocation", invocation?.browser, "electron");
  checkExact(violations, "baseline invocation retries", invocation?.config?.retries, frozen.primaryRetries);
  checkEqual(violations, "baseline headless invocation", invocation?.headless, true);
  checkEqual(violations, "baseline project", invocation?.project, root);
  checkEqual(violations, "baseline quiet invocation", invocation?.quiet, true);
  checkEqual(violations, "baseline record invocation", invocation?.record, false);
  checkEqual(violations, "baseline testing type", invocation?.testingType, "e2e");
  if (typeof root === "string" && root.length > 0) {
    const normalizedRoot = normalizePath(root);
    checkEqual(
      violations,
      "baseline config file",
      normalizePath(invocation?.configFile),
      `${normalizedRoot}/cypress.config.ts`,
    );
    checkEqual(
      violations,
      "baseline spec invocation",
      normalizePath(invocation?.spec),
      `${normalizedRoot}/${rwaAuthSource.specPath}`,
    );
  }
}

function validateCypressResultIdentity(result, violations) {
  checkEqual(violations, "Cypress version", result?.cypressVersion, frozen.cypressVersion);
  checkEqual(violations, "Cypress browser name", result?.browserName, "electron");
  checkEqual(violations, "Cypress bundled browser path", result?.browserPath, "");
  checkEqual(
    violations,
    "Cypress Electron version",
    result?.browserVersion,
    frozen.electronVersion,
  );
  checkEqual(violations, "Cypress OS", result?.osName, "win32");
  checkExact(violations, "resolved Cypress retries", result?.config?.retries, frozen.primaryRetries);
  checkEqual(violations, "resolved Cypress test isolation", result?.config?.testIsolation, true);
  checkEqual(violations, "resolved Cypress base URL", result?.config?.baseUrl, frozen.baseUrl);
  checkEqual(violations, "resolved Cypress API URL", result?.config?.apiUrl, frozen.apiUrl);
  checkEqual(
    violations,
    "resolved Cypress Node version",
    result?.config?.resolvedNodeVersion,
    frozen.resolvedNodeVersion,
  );
  checkEqual(violations, "resolved Cypress viewport width", result?.config?.viewportWidth, frozen.viewport.width);
  checkEqual(violations, "resolved Cypress viewport height", result?.config?.viewportHeight, frozen.viewport.height);
  for (const [field, expected] of Object.entries({
    totalSuites: 1,
    totalTests: rwaAuthCases.length,
    totalPassed: rwaAuthCases.length,
    totalFailed: 0,
    totalPending: 0,
    totalSkipped: 0,
  })) {
    checkEqual(violations, `Cypress ${field}`, result?.[field], expected);
  }

  const runs = result?.runs;
  if (!Array.isArray(runs) || runs.length !== 1) {
    violations.push("Cypress raw result does not contain exactly one run");
    return;
  }
  const run = runs[0];
  checkEqual(violations, "Cypress run error", run?.error, null);
  checkEqual(
    violations,
    "Cypress executed spec",
    normalizePath(run?.spec?.relative),
    rwaAuthSource.specPath,
  );
  for (const [field, expected] of Object.entries({
    tests: rwaAuthCases.length,
    passes: rwaAuthCases.length,
    failures: 0,
    pending: 0,
    skipped: 0,
  })) {
    checkEqual(violations, `Cypress run stats ${field}`, run?.stats?.[field], expected);
  }
  if (!Array.isArray(run?.tests) || run.tests.length !== rwaAuthCases.length) {
    violations.push(`Cypress raw run test denominator is not ${rwaAuthCases.length}`);
    return;
  }
  for (let index = 0; index < rwaAuthCases.length; index += 1) {
    const expected = rwaAuthCases[index];
    const actual = run.tests[index];
    checkExact(
      violations,
      `${expected.id} raw Cypress title`,
      actual?.title,
      [rwaAuthSource.describeTitle, expected.source.title],
    );
    checkEqual(violations, `${expected.id} raw Cypress state`, actual?.state, "passed");
    checkExact(violations, `${expected.id} raw Cypress attempts`, actual?.attempts, [{ state: "passed" }]);
    if (actual?.displayError !== null) violations.push(`${expected.id} raw Cypress result retained an error`);
  }
}

function validateCandidateVersions(versions, violations) {
  checkEqual(violations, "candidate SDK", versions?.sdk, frozen.sdk);
  checkEqual(violations, "candidate Node", versions?.node, frozen.node);
  checkEqual(violations, "candidate expected Node", versions?.expectedNode, frozen.node);
  checkEqual(violations, "candidate Node identity flag", versions?.nodeIdentityMatches, true);
  if (typeof versions?.executablePath !== "string" || versions.executablePath.length === 0) {
    violations.push("candidate executable path is missing");
  }
  checkEqual(
    violations,
    "candidate executable SHA-256",
    versions?.executableSha256,
    frozen.executableSha256,
  );
  checkEqual(
    violations,
    "candidate expected executable SHA-256",
    versions?.expectedExecutableSha256,
    frozen.executableSha256,
  );
  checkEqual(violations, "candidate executable identity flag", versions?.candidateIdentityMatches, true);
}

function validateCheckpoints(actual, expected, violations) {
  const checkpoints = actual?.checkpoints;
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    violations.push(`${expected.id} lacks raw checkpoints`);
    return;
  }
  if (checkpoints.some((checkpoint) => !isRecord(checkpoint))) {
    violations.push(`${expected.id} contains a non-object checkpoint`);
    return;
  }
  for (let index = 0; index < checkpoints.length; index += 1) {
    if (checkpoints[index]?.sequence !== index + 1) {
      violations.push(`${expected.id} checkpoint sequence is not contiguous at position ${index + 1}`);
    }
  }
  if (
    checkpoints[0]?.phase !== "pre-registered-capability-boundary" ||
    checkpoints[0]?.status !== "recorded"
  ) {
    violations.push(`${expected.id} does not begin with its pre-registered capability boundary`);
  }
  checkExact(
    violations,
    `${expected.id} boundary checkpoint`,
    checkpoints[0]?.boundaries,
    expectedBoundaries(expected),
  );

  const terminalPhase = actual?.terminal?.phase;
  const identityOnly = terminalPhase === "candidate-identity" || terminalPhase === "runtime-identity";
  const seedCheckpoints = checkpoints.filter(({ phase }) => phase === "seed");
  if (!identityOnly) {
    if (seedCheckpoints.length !== 1) {
      violations.push(`${expected.id} does not contain exactly one seed checkpoint`);
    } else if (terminalPhase === "seed") {
      if (seedCheckpoints[0].status !== "failed") violations.push(`${expected.id} seed terminal is not recorded as failed`);
    } else if (
      seedCheckpoints[0].status !== "passed" ||
      seedCheckpoints[0].method !== "POST" ||
      seedCheckpoints[0].path !== "/testData/seed" ||
      seedCheckpoints[0].httpStatus !== 200
    ) {
      violations.push(`${expected.id} lacks the exact successful seed HTTP checkpoint`);
    }
  }

  const beforeRuntime = identityOnly || terminalPhase === "seed" || terminalPhase === "seeded-user-fixture";
  const runtimeCheckpoints = checkpoints.filter(({ phase }) => phase === "runtime-launch");
  if (!beforeRuntime) {
    if (runtimeCheckpoints.length !== 1) {
      violations.push(`${expected.id} does not contain exactly one runtime-launch checkpoint`);
    } else if (terminalPhase === "runtime-launch") {
      if (runtimeCheckpoints[0].status !== "failed") {
        violations.push(`${expected.id} runtime-launch terminal is not recorded as failed`);
      }
    } else if (runtimeCheckpoints[0].status !== "passed" || runtimeCheckpoints[0].freshNativeProcess !== true) {
      violations.push(`${expected.id} lacks a successful fresh native runtime launch`);
    }
  }

  validateSetupAndActionTrail(actual, expected, violations);
}

function validateSetupAndActionTrail(actual, expected, violations) {
  const checkpoints = actual.checkpoints;
  const terminal = actual.terminal;
  const terminalPhase = terminal?.phase;
  const seededUserCheckpoints = checkpoints.filter(({ phase }) => phase === "seeded-user-fixture");
  const needsSeededUser = expected.adapterRequirements.includes("seeded-user-fixture");
  const reachedSeededUser = !["candidate-identity", "runtime-identity", "seed"].includes(terminalPhase);
  if (needsSeededUser && reachedSeededUser) {
    if (seededUserCheckpoints.length !== 1) {
      violations.push(`${expected.id} does not contain exactly one seeded-user fixture checkpoint`);
    } else if (terminalPhase === "seeded-user-fixture") {
      if (seededUserCheckpoints[0].status !== "failed") {
        violations.push(`${expected.id} seeded-user terminal is not recorded as failed`);
      }
    } else if (seededUserCheckpoints[0].status !== "passed") {
      violations.push(`${expected.id} seeded-user fixture did not pass`);
    }
  } else if (!needsSeededUser && seededUserCheckpoints.length !== 0) {
    violations.push(`${expected.id} contains an unregistered seeded-user fixture checkpoint`);
  }

  const actions = checkpoints.filter(({ phase }) => phase === "action");
  const terminalActionIndex = Number.isSafeInteger(terminal?.actionIndex)
    ? terminal.actionIndex
    : null;
  const expectedActionCount = terminal === null
    ? expected.stasisActions.length
    : terminalActionIndex === null
      ? 0
      : terminalActionIndex + 1;
  if (actions.length !== expectedActionCount) {
    violations.push(
      `${expected.id} action checkpoint denominator mismatch: expected ${expectedActionCount}, got ${actions.length}`,
    );
  }
  for (let index = 0; index < Math.min(actions.length, expectedActionCount); index += 1) {
    const checkpoint = actions[index];
    checkEqual(violations, `${expected.id} action ${index} index`, checkpoint.actionIndex, index);
    checkExact(
      violations,
      `${expected.id} action ${index} identity`,
      checkpoint.action,
      retainedAction(expected.stasisActions[index]),
    );
    const wantedStatus = terminalActionIndex === index ? ["failed", "blocked"] : ["passed"];
    if (!wantedStatus.includes(checkpoint.status)) {
      violations.push(
        `${expected.id} action ${index} status mismatch: expected ${wantedStatus.join(" or ")}, got ${String(checkpoint.status)}`,
      );
    }
    if (checkpoint.status === "passed" && !Object.hasOwn(checkpoint, "result")) {
      violations.push(`${expected.id} action ${index} passed without retained result evidence`);
    }
    if (Object.hasOwn(checkpoint, "result")) {
      validateActionResultShape(
        checkpoint.result,
        expected.stasisActions[index],
        checkpoint.status,
        `${expected.id} action ${index}`,
        violations,
      );
    }
  }

  validateTerminalAudits(actual, expected, violations);

  const backendCheckpoints = checkpoints.filter(({ phase }) => phase === "backend-state-observer");
  const needsBackend = expected.adapterRequirements.includes("backend-state-observer");
  if (needsBackend && terminal === null) {
    if (backendCheckpoints.length !== 1 || backendCheckpoints[0]?.status !== "passed") {
      violations.push(`${expected.id} lacks its successful backend-state observer checkpoint`);
    }
  } else if (terminalPhase === "backend-state-observer") {
    if (backendCheckpoints.length !== 1 || backendCheckpoints[0]?.status !== "failed") {
      violations.push(`${expected.id} backend-state terminal is not recorded as failed`);
    }
  } else if (!needsBackend && backendCheckpoints.length !== 0) {
    violations.push(`${expected.id} contains an unregistered backend-state observer checkpoint`);
  }

  const runtimeLaunched = checkpoints.some(
    (checkpoint) => checkpoint.phase === "runtime-launch" && checkpoint.status === "passed",
  );
  const cleanup = checkpoints.filter(({ phase }) => phase === "cleanup");
  if (runtimeLaunched) {
    if (cleanup.length !== 1) {
      violations.push(`${expected.id} does not contain exactly one cleanup checkpoint`);
    } else {
      const expectedMode = terminalPhase === "cleanup" || terminal === null
        ? "graceful-session-close"
        : "fail-stop-runtime-close";
      checkEqual(violations, `${expected.id} cleanup mode`, cleanup[0].mode, expectedMode);
      checkEqual(
        violations,
        `${expected.id} cleanup status`,
        cleanup[0].status,
        terminalPhase === "cleanup" ? "failed" : "passed",
      );
    }
  } else if (cleanup.length !== 0) {
    violations.push(`${expected.id} contains cleanup evidence without a launched runtime`);
  }
}

function validateTerminalAudits(actual, expected, violations) {
  const checkpoints = actual.checkpoints;
  const terminal = actual.terminal;
  const audits = checkpoints.filter(({ phase }) => phase === "terminal-audit");
  if (terminal === null) {
    if (audits.length !== 0) {
      violations.push(`${expected.id} contains terminal audits without a terminal`);
    }
    return;
  }
  if (audits.length > 2) {
    violations.push(`${expected.id} contains more than two terminal audit checkpoints`);
  }
  for (let index = 0; index < audits.length; index += 1) {
    const checkpoint = audits[index];
    const wantedOp = index === 0 ? "requests" : "evidence";
    checkEqual(
      violations,
      `${expected.id} terminal audit ${index + 1} operation`,
      checkpoint.op,
      wantedOp,
    );
    if (checkpoint.status === "passed") {
      if (!hasExactKeys(checkpoint, ["sequence", "phase", "status", "op", "result"])) {
        violations.push(`${expected.id} terminal audit ${index + 1} passed with an invalid checkpoint shape`);
      }
      validateAuditResult(
        checkpoint.result,
        wantedOp === "requests" ? "request" : "evidence",
        checkpoint.status,
        `${expected.id} terminal audit ${index + 1}`,
        violations,
      );
    } else if (checkpoint.status === "failed") {
      if (
        !hasExactKeys(checkpoint, ["sequence", "phase", "status", "op", "error"]) ||
        !isRecord(checkpoint.error)
      ) {
        violations.push(`${expected.id} terminal audit ${index + 1} failed with an invalid checkpoint shape`);
      }
      if (index !== audits.length - 1) {
        violations.push(`${expected.id} continued terminal auditing after an audit failure`);
      }
    } else {
      violations.push(`${expected.id} terminal audit ${index + 1} has invalid status ${String(checkpoint.status)}`);
    }
  }
  if (audits.length === 1 && audits[0].status === "passed") {
    violations.push(`${expected.id} stopped terminal auditing before evidence capture`);
  }

  const terminalCheckpoint = Number.isSafeInteger(terminal?.actionIndex)
    ? checkpoints.find(
        (checkpoint) =>
          checkpoint.phase === "action" && checkpoint.actionIndex === terminal.actionIndex,
      )
    : checkpoints.find((checkpoint) => checkpoint.phase === terminal?.phase);
  if (
    audits.length > 0 &&
    terminalCheckpoint !== undefined &&
    audits[0].sequence <= terminalCheckpoint.sequence
  ) {
    violations.push(`${expected.id} terminal audit precedes its terminal checkpoint`);
  }
  const cleanup = checkpoints.find(({ phase }) => phase === "cleanup");
  if (
    audits.length > 0 &&
    cleanup !== undefined &&
    audits.at(-1).sequence >= cleanup.sequence
  ) {
    violations.push(`${expected.id} terminal audit does not precede cleanup`);
  }
  if (
    terminal?.phase === "settle" &&
    terminal?.error?.name === "RwaSettleTerminalError" &&
    audits.length === 0
  ) {
    violations.push(`${expected.id} returned settle terminal lacks terminal audit capture`);
  }
}

function validateActionResultShape(result, action, status, label, violations) {
  if (!isRecord(result)) {
    violations.push(`${label} retained result is not an object`);
    return;
  }
  switch (action?.op) {
    case "openSession": {
      const expectedRequestedUrl = new URL(action.path, "http://localhost:3000").href;
      if (
        !hasExactKeys(result, ["boundary", "clockMode", "path", "profile", "requestedUrl"]) ||
        result.requestedUrl !== expectedRequestedUrl ||
        !isSafeRwaRoutePath(result.path) ||
        result.boundary !== "controlled_ready" ||
        result.clockMode !== "controlled" ||
        result.profile !== "controlled-web-session-v1"
      ) {
        violations.push(`${label} openSession evidence is outside the frozen controlled document profile`);
      }
      return;
    }
    case "settle":
      if (
        !hasOnlyKeys(result, [
          "failureCodeSha256",
          "limitPresent",
          "outcome",
          "path",
          "unsupportedWork",
          "unsupportedWorkCount",
          "unsupportedWorkOmitted",
        ]) ||
        typeof result.outcome !== "string" ||
        !Number.isSafeInteger(result.unsupportedWorkCount) ||
        result.unsupportedWorkCount < 0 ||
        (
          Object.hasOwn(result, "path") &&
          !(result.path === null || isSafeRwaRoutePath(result.path))
        ) ||
        (result.failureCodeSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(result.failureCodeSha256)) ||
        (result.limitPresent !== undefined && result.limitPresent !== true)
      ) {
        violations.push(`${label} settle evidence has an invalid retained shape`);
      }
      if (
        (action.observeSettledPath === true) !== Object.hasOwn(result, "path")
      ) {
        violations.push(`${label} settle path projection does not match its frozen action mapping`);
      }
      validateUnsupportedWorkProjection(result, label, violations);
      if (
        status === "passed" &&
        !["quiescent", "quiescent_with_persistent_work"].includes(result.outcome)
      ) {
        violations.push(`${label} passed with a non-crawlable settle outcome`);
      }
      return;
    case "fill":
    case "focus":
    case "activate":
      if (!hasExactKeys(result, [])) violations.push(`${label} mutation evidence contains opaque fields`);
      return;
    case "check":
      if (
        !hasOnlyKeys(result, ["changed", "checked"]) ||
        Object.values(result).some((value) => typeof value !== "boolean")
      ) violations.push(`${label} check evidence has an invalid retained shape`);
      return;
    case "query":
      if (!hasExactKeys(result, ["count"]) || !/^-?[0-9]+$/u.test(result.count)) {
        violations.push(`${label} query evidence has an invalid retained shape`);
      }
      return;
    case "text":
      if (
        !hasExactKeys(result, ["value"]) ||
        !(result.value === null || (typeof result.value === "string" && result.value.length <= 4096))
      ) violations.push(`${label} text evidence has an invalid retained shape`);
      return;
    case "extract":
      if (!hasExactKeys(result, ["attributePresent"]) || typeof result.attributePresent !== "boolean") {
        violations.push(`${label} extract evidence has an invalid retained shape`);
      }
      return;
    case "getCookies":
      if (
        !hasExactKeys(result, ["cookies"]) ||
        !Array.isArray(result.cookies) ||
        result.cookies.some(
          (cookie) =>
            !isRecord(cookie) ||
            !hasExactKeys(cookie, ["expiresUnixTimeNs", "name", "valuePresent"]) ||
            cookie.name !== action.name ||
            typeof cookie.valuePresent !== "boolean" ||
            !(cookie.expiresUnixTimeNs === null || /^-?[0-9]+$/u.test(cookie.expiresUnixTimeNs)),
        )
      ) violations.push(`${label} cookie evidence has an invalid retained shape`);
      return;
    case "requests":
      validateAuditResult(result, "request", status, label, violations);
      return;
    case "evidence":
      validateAuditResult(result, "evidence", status, label, violations);
      return;
    default:
      violations.push(`${label} uses an unknown action result schema`);
  }
}

function validateUnsupportedWorkProjection(result, label, violations) {
  if (!Number.isSafeInteger(result.unsupportedWorkCount) || result.unsupportedWorkCount < 0) return;
  const hasWork = Object.hasOwn(result, "unsupportedWork");
  const hasOmitted = Object.hasOwn(result, "unsupportedWorkOmitted");
  if (result.unsupportedWorkCount === 0) {
    if (hasWork || hasOmitted) {
      violations.push(`${label} empty unsupported work contains retained detail fields`);
    }
    return;
  }
  if (!hasWork || !hasOmitted || !Array.isArray(result.unsupportedWork)) {
    violations.push(`${label} nonempty unsupported work lacks bounded typed details`);
    return;
  }
  const expectedRetained = Math.min(
    result.unsupportedWorkCount,
    rwaUnsupportedWorkRetentionLimit,
  );
  const expectedOmitted = result.unsupportedWorkCount - expectedRetained;
  if (
    result.unsupportedWork.length !== expectedRetained ||
    !Number.isSafeInteger(result.unsupportedWorkOmitted) ||
    result.unsupportedWorkOmitted !== expectedOmitted
  ) {
    violations.push(`${label} unsupported work retention counts are inconsistent`);
  }
  for (let index = 0; index < result.unsupportedWork.length; index += 1) {
    const item = result.unsupportedWork[index];
    const expectedKeys = [
      "count",
      "kind",
      "reason",
      ...(Object.hasOwn(item ?? {}, "timeSurface") ? ["timeSurface"] : []),
    ];
    if (
      !isRecord(item) ||
      !hasExactKeys(item, expectedKeys) ||
      !unsupportedWorkKindSet.has(item.kind) ||
      !unsupportedWorkReasonSet.has(item.reason) ||
      !isCanonicalPositiveU128Decimal(item.count) ||
      (
        Object.hasOwn(item, "timeSurface") &&
        !unsupportedTimeSurfaceSet.has(item.timeSurface)
      )
    ) {
      violations.push(`${label} unsupported work entry ${index + 1} has an invalid typed shape`);
    }
  }
}

function isCanonicalPositiveU128Decimal(value) {
  if (
    typeof value !== "string" ||
    value.length > 39 ||
    !/^[1-9][0-9]*$/u.test(value)
  ) return false;
  return BigInt(value) <= maximumU128;
}

function validateAuditResult(result, kind, status, label, violations) {
  const recordsValid = Array.isArray(result?.records) && result.records.every((record) => {
    if (!isRecord(record) || !/^[a-f0-9]{64}$/u.test(record.requestKeySha256)) return false;
    if (kind === "request") {
      return (
        hasExactKeys(record, ["method", "requestKeySha256", "url"]) &&
        ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "UNKNOWN"].includes(record.method) &&
        isRecord(record.url) &&
        hasExactKeys(record.url, ["path"]) &&
        typeof record.url.path === "string" &&
        record.url.path.startsWith("/") &&
        record.url.path.length <= 2048
      );
    }
    return (
      hasExactKeys(record, ["kind", "requestKeySha256", "status"]) &&
      record.kind === "response_headers" &&
      Number.isSafeInteger(record.status)
    );
  });
  if (
    !hasExactKeys(result, ["complete", "hasMore", "records"]) ||
    typeof result?.complete !== "boolean" ||
    typeof result?.hasMore !== "boolean" ||
    !recordsValid
  ) violations.push(`${label} ${kind} audit evidence has an invalid retained shape`);
  if (status === "passed" && (result?.complete !== true || result?.hasMore !== false)) {
    violations.push(`${label} passed with an incomplete ${kind} audit`);
  }
}

function hasOnlyKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function hasExactKeys(value, expected) {
  return hasOnlyKeys(value, expected) && Object.keys(value).length === expected.length;
}

function validateOracles(actual, expected, violations) {
  const oracles = actual?.oracles;
  if (!Array.isArray(oracles) || oracles.length !== expected.oracles.length) {
    violations.push(`${expected.id} oracle denominator mismatch`);
    return;
  }
  for (let index = 0; index < expected.oracles.length; index += 1) {
    const frozenOracle = expected.oracles[index];
    const observedOracle = oracles[index];
    checkEqual(violations, `${expected.id} oracle ${index + 1} id`, observedOracle?.id, frozenOracle.id);
    checkEqual(violations, `${expected.id} oracle ${index + 1} kind`, observedOracle?.kind, frozenOracle.kind);
    checkExact(
      violations,
      `${expected.id} oracle ${index + 1} expectation`,
      observedOracle?.expected,
      frozenOracle.expected,
    );
    if (!["PASS", "FAIL", "UNOBSERVABLE", "NOT_REACHED"].includes(observedOracle?.status)) {
      violations.push(`${expected.id} oracle ${frozenOracle.id} has invalid status ${String(observedOracle?.status)}`);
    }
  }
  const checkpoints = Array.isArray(actual?.checkpoints) ? actual.checkpoints : [];
  const observations = checkpoints
    .filter((checkpoint) => checkpoint?.phase === "action" && Object.hasOwn(checkpoint, "result"))
    .map((checkpoint) => ({
      actionIndex: checkpoint.actionIndex,
      op: checkpoint.action?.op,
      ...(checkpoint.action?.selector === undefined
        ? {}
        : { selector: checkpoint.action.selector }),
      result: checkpoint.result,
    }));
  for (const checkpoint of checkpoints) {
    if (
      checkpoint?.phase === "terminal-audit" &&
      checkpoint.status === "passed" &&
      Object.hasOwn(checkpoint, "result")
    ) {
      observations.push({
        actionIndex: null,
        op: checkpoint.op,
        diagnostic: true,
        result: checkpoint.result,
      });
    }
  }
  const backendState = checkpoints.find(
    (checkpoint) => checkpoint?.phase === "backend-state-observer" && checkpoint.status === "passed",
  )?.state ?? null;
  const replayTerminal = actual?.terminal === null
    ? null
    : isRecord(actual?.terminal)
      ? actual.terminal
      : { classification: "BENCHMARK_INVALID", phase: "invalid-terminal" };
  const derived = evaluateRwaOracles(expected, observations, backendState, replayTerminal);
  checkExact(
    violations,
    `${expected.id} oracle evidence recomputation`,
    actual.oracles.map(oracleEvidenceProjection),
    derived.map(oracleEvidenceProjection),
  );
}

function validateCaseClassification(actual, expected, violations) {
  const classification = actual?.classification;
  const success = supported.has(classification);
  if (actual?.success !== success) {
    violations.push(`${expected.id} success flag contradicts classification`);
  }
  if (!Array.isArray(actual?.oracles) || actual.oracles.length !== expected.oracles.length) return;

  const terminal = actual?.terminal;
  const allOraclesPass = actual.oracles.every((oracle) => oracle?.status === "PASS");
  if (terminal === null) {
    if (actual.oracles.some((oracle) => oracle?.status === "NOT_REACHED")) {
      violations.push(`${expected.id} has NOT_REACHED oracles without a terminal`);
    }
    const expectedClassification = allOraclesPass
      ? expected.semanticDifferenceIds.length === 0
        ? "PASS_EQUIVALENT"
        : "PASS_WITH_SEMANTIC_DIFFERENCE"
      : classificationFromMaterialOracles(actual.oracles);
    if (expectedClassification === null) {
      violations.push(`${expected.id} nonpassing oracle evidence lacks a material classification`);
    } else if (classification !== expectedClassification) {
      violations.push(
        `${expected.id} classification contradicts its oracle evidence: expected ${expectedClassification}, got ${String(classification)}`,
      );
    }
    return;
  }

  if (terminal === undefined || typeof terminal !== "object") {
    violations.push(`${expected.id} terminal must be null or an object`);
    return;
  }
  if (success) violations.push(`${expected.id} passing classification cannot have a terminal`);
  checkEqual(violations, `${expected.id} terminal classification`, terminal.classification, classification);
  checkEqual(violations, `${expected.id} terminal typed surface`, terminal.typedSurface, actual?.typedSurface);
  if (typeof terminal.phase !== "string" || terminal.phase.length === 0) {
    violations.push(`${expected.id} terminal phase is missing`);
  }
  if (terminal.error === null || typeof terminal.error !== "object") {
    violations.push(`${expected.id} terminal error evidence is missing`);
  }
  const derivedTerminal = terminalIdentityClassification(terminal);
  checkEqual(
    violations,
    `${expected.id} derived terminal classification`,
    classification,
    derivedTerminal.classification,
  );
  checkEqual(
    violations,
    `${expected.id} derived terminal surface`,
    actual?.typedSurface,
    derivedTerminal.typedSurface,
  );
  const matchingTerminalCheckpoint = Array.isArray(actual.checkpoints) &&
    actual.checkpoints.some((checkpoint) =>
      (checkpoint?.status === "failed" || checkpoint?.status === "blocked") &&
      (
        checkpoint.phase === terminal.phase ||
        (checkpoint.phase === "action" && checkpoint.actionIndex === terminal.actionIndex)
      ) &&
      isDeepStrictEqual(checkpoint.error, terminal.error));
  if (matchingTerminalCheckpoint !== true) {
    violations.push(`${expected.id} terminal does not match a failed or blocked checkpoint`);
  }
}

function classificationFromMaterialOracles(oracles) {
  const material = oracles.filter((oracle) => oracle?.status !== "PASS");
  if (material.length === 0) return null;
  for (const oracle of material) {
    if (!classifications.has(oracle?.classification) || supported.has(oracle.classification) || oracle.classification === "BASELINE_FAILURE") {
      return null;
    }
  }
  return materialClassificationPriority.find((classification) =>
    material.some((oracle) => oracle.classification === classification)) ?? null;
}

function expectedBoundaries(definition) {
  return definition.semanticDifferenceIds.flatMap((id) => {
    const boundary = preRegisteredBoundaryCatalog[id];
    return boundary === undefined ? [] : [{ id, ...boundary }];
  });
}

function retainedAction(action) {
  const copy = structuredClone(action);
  if (Object.hasOwn(copy, "value")) {
    copy.valueLength = String(copy.value).length;
    delete copy.value;
  }
  return copy;
}

function oracleEvidenceProjection(oracle) {
  if (oracle === null || typeof oracle !== "object") return oracle;
  const { reason: _reason, ...evidence } = oracle;
  return evidence;
}

function terminalIdentityClassification(terminal) {
  if (terminal?.phase === "candidate-identity") {
    return { classification: "BENCHMARK_INVALID", typedSurface: "candidate_identity" };
  }
  if (terminal?.phase === "runtime-identity") {
    return { classification: "BENCHMARK_INVALID", typedSurface: "node_runtime" };
  }
  return classifyStasisFailure(terminal?.error, terminal?.phase);
}

function validateCandidateSummary(candidate, violations) {
  const cases = Array.isArray(candidate?.cases) ? candidate.cases : [];
  const passed = cases.filter((entry) => supported.has(entry?.classification)).length;
  const classifications = Object.fromEntries(
    [...new Set(cases.map((entry) => entry?.classification))]
      .sort()
      .map((classification) => [classification, cases.filter((entry) => entry?.classification === classification).length]),
  );
  checkExact(violations, "candidate summary", candidate?.summary, {
    complete: cases.length === rwaAuthCases.length,
    classified: cases.length,
    passed,
    failedOrUnsupported: cases.length - passed,
    classifications,
  });
}

function deriveSharedBlocker(cases) {
  if (
    !Array.isArray(cases) ||
    cases.length === 0 ||
    cases.some((entry) => entry === null || typeof entry !== "object" || entry.terminal === null)
  ) return null;
  if (cases.some((entry) => entry.terminal === undefined || typeof entry.terminal !== "object")) return null;
  const signatures = new Set(
    cases.map(
      ({ classification, terminal }) =>
        `${classification}|${terminal.phase}|${terminal.error?.code ?? "unclassified_failure"}`,
    ),
  );
  if (signatures.size !== 1) return null;
  const first = cases[0];
  return {
    classification: first.classification,
    typedSurface: first.typedSurface,
    phase: first.terminal.phase,
    code: first.terminal.error?.code ?? "unclassified_failure",
    affectedCases: cases.map(({ ordinal }) => ordinal),
  };
}

function checkEqual(violations, label, actual, expected) {
  if (actual !== expected) violations.push(`${label} mismatch: expected ${String(expected)}, got ${String(actual)}`);
}

function checkExact(violations, label, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) violations.push(`${label} mismatch`);
}

function normalizePath(value) {
  return typeof value === "string" ? value.replaceAll("\\", "/").replace(/\/$/u, "") : value;
}

function result(definition, classification, details) {
  return {
    ordinal: definition.ordinal,
    id: definition.id,
    title: definition.source.title,
    classification,
    ...details,
  };
}

function projectBaseline(value) {
  if (value === undefined) return null;
  return {
    state: value.state,
    attempts: value.attempts?.length ?? 0,
    durationMilliseconds: value.durationMilliseconds,
  };
}

function projectCandidate(value) {
  if (value === undefined || value === null) return null;
  const oracleCounts = {};
  for (const oracle of Array.isArray(value.oracles) ? value.oracles : []) {
    const status = typeof oracle?.status === "string" ? oracle.status : "INVALID";
    oracleCounts[status] = (oracleCounts[status] ?? 0) + 1;
  }
  return {
    classification: value.classification,
    ...(value.typedSurface === undefined ? {} : { typedSurface: value.typedSurface }),
    phase: value.terminal?.phase ?? "completed",
    code: value.terminal?.error?.code ?? null,
    checkpointCount: value.checkpoints?.length ?? 0,
    oracleCounts,
    semanticDifferenceIds: value.semanticDifferenceIds ?? [],
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0 &&
      url.href === value
    );
  } catch {
    return false;
  }
}

function isSafeRwaRoutePath(value) {
  return (
    typeof value === "string" &&
    rwaFinalPathProjectionAllowlist.has(value) &&
    value.length <= 2_048 &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\x00-\x20"'<>]/u.test(value) &&
    !value.split("/").some((part) => part === "." || part === "..")
  );
}

function countClassifications(values) {
  const counts = {};
  for (const value of values) counts[value.classification] = (counts[value.classification] ?? 0) + 1;
  return counts;
}
