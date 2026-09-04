import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { rwaAuthCases, rwaAuthSource } from "../rwa/cases.mjs";
import { compareRwa } from "../rwa/compare-lib.mjs";
import {
  inspectRwaCheckout,
  probeRwaServers,
  rwaBaselineExpected,
} from "../rwa/run-cypress.mjs";
import {
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "../rwa/runtime-identity.mjs";
import { runStasisRwaProof } from "../rwa/stasis-lane.mjs";
import { sha256File } from "../shared/io.mjs";
import {
  assertAuthoritativePostSupportCandidate,
  assertCandidateIdentity,
  postSupportExecutablePath,
  postSupportNodeVersion,
  postSupportProfile,
  postSupportVersion,
} from "./candidate-identity.mjs";
import {
  assertAuthoritativePositiveCookieMinimizerResult,
  assertPositiveCookieMinimizerResult,
} from "./positive-cookie-minimizers.mjs";
import { assertPostSupportArtifactPrivacy } from "./artifact-privacy.mjs";

const authoritativeRwaRawResults = new WeakSet();
const defaultRwaDependencies = Object.freeze({});
const defaultRwaRoot = path.resolve("inputs", "cypress-realworld-app-28ca4d0");

export const postSupportRwaSchema = "stasis-post-support-rwa-stasis-raw-v1";
export const postSupportRwaRunner = "stasis-controlled-web-session-v2";
export const postSupportRwaRuntimeBindingSchema =
  "stasis-post-support-rwa-sealed-runtime-binding-v1";

export async function runPostSupportRwaProof(
  verifiedCandidate,
  options = defaultRwaDependencies,
) {
  const canMintAuthority = options === defaultRwaDependencies;
  if (canMintAuthority) assertAuthoritativePostSupportCandidate(verifiedCandidate);
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const executablePath = postSupportExecutablePath(verifiedCandidate);
  const runDirectCandidate = () => runStasisRwaProof(executablePath, {
    ...options,
    hashExecutable: options.hashExecutable ?? sha256File,
    launchRuntime: verifiedCandidate.sdk.launch,
    expectedExecutableSha256: identity.windows.executable.sha256,
    expectedNodeVersion: postSupportNodeVersion,
    profile: postSupportProfile,
    runner: postSupportRwaRunner,
    sdkLabel: `@oxhq/stasis@${postSupportVersion}`,
  });
  const execution = canMintAuthority
    ? await runWithSealedRwaRuntime(runDirectCandidate)
    : {
        legacyShaped: await runDirectCandidate(),
        runtimeAuthority: {
          mode: "diagnostic_injected_dependencies",
          authoritative: false,
        },
      };
  const { legacyShaped, runtimeAuthority } = execution;
  const { executablePath: _localPath, ...safeVersions } = legacyShaped.versions;
  const cases = legacyShaped.cases.map((item) => ({
    ...item,
    checkpoints: item.checkpoints.map(projectBackendFacts),
  }));
  const result = assertPostSupportRwaRaw({
    ...legacyShaped,
    schema: postSupportRwaSchema,
    runner: postSupportRwaRunner,
    candidate: identity,
    runtimeAuthority,
    versions: safeVersions,
    cases,
  });
  deepFreeze(result);
  if (canMintAuthority) authoritativeRwaRawResults.add(result);
  return result;
}

export function comparePostSupportRwa(baseline, candidate, cookieMinimizers) {
  if (!authoritativeRwaRawResults.has(candidate)) {
    throw new Error("RWA comparison authority requires the fresh direct in-process RWA result");
  }
  assertPostSupportRwaRaw(candidate);
  assertPostSupportRwaRuntimeBinding(candidate.runtimeAuthority);
  assertAuthoritativePositiveCookieMinimizerResult(cookieMinimizers);
  if (!isDeepStrictEqual(cookieMinimizers.candidate, candidate.candidate)) {
    throw new Error("RWA and cookie minimizers do not bind the same candidate identity");
  }
  const {
    corpusBinding,
    ...replayedClaims
  } = replayPostSupportRwaComparisonClaims(baseline, candidate);
  const result = {
    schema: "stasis-post-support-rwa-comparison-v1",
    protocol: candidate.protocol,
    track: candidate.track,
    candidate: candidate.candidate,
    corpusBinding,
    resolvedBoundaries: projectResolvedCookieBoundaries(cookieMinimizers),
    ...replayedClaims,
  };
  assertPostSupportArtifactPrivacy(result);
  return result;
}

export function replayPostSupportRwaComparisonClaims(baseline, candidate) {
  assertPostSupportRwaRaw(candidate);
  assertPostSupportRwaRuntimeBinding(candidate.runtimeAuthority);
  const structural = compareRwa(
    baseline,
    adaptPostSupportRwaForFrozenValidator(candidate),
  );
  if (!structural.candidateValid) {
    throw new Error(
      `Frozen RWA structural validation rejected the post-support projection: ${structural.candidateViolations.join("; ")}`,
    );
  }
  const result = {
    corpusBinding: {
      corpus: "unchanged_frozen_cypress_rwa_auth_eight_case_corpus",
      baselineValid: structural.baselineValid,
      structuralValidator: "compareRwa",
      validatorProjection: "identity_and_open_profile_only_then_exact_v2_semantics",
      candidateRuntimeAuthority:
        "sealed_frozen_checkout_build_and_server_preflight_postflight",
      candidateRuntimeBindingSchema: candidate.runtimeAuthority.schema,
      sameFrozenServerHostProcesses:
        candidate.runtimeAuthority.continuity.sameFrozenServerHostProcesses,
    },
    counts: structural.counts,
    denominator: structural.denominator,
    exactEquivalentRate: structural.exactEquivalentRate,
    behaviorallySupportedRate: structural.behaviorallySupportedRate,
    sharedBlocker: structural.sharedBlocker,
    cases: projectPostSupportRwaComparisonCases(structural.cases),
  };
  assertPostSupportArtifactPrivacy(result);
  return result;
}

export function projectResolvedCookieBoundaries(cookieMinimizers) {
  const validated = assertPositiveCookieMinimizerResult(cookieMinimizers);
  const [persistent, sameSite] = validated.scenarios;
  const result = [
    {
      id: "persistent-cookie-profile-gap",
      priorTerminalCode: "unsupported_persistent_cookie",
      status: "positively_supported",
      authority: "fresh_direct_in_process_cookie_minimizer_scenario",
      scenarioId: persistent.id,
      processCount: persistent.processCount,
      persistentRestorePassed:
        persistent.status === "passed" &&
        persistent.evidence.persistentCookieCount === 1 &&
        persistent.evidence.nonNullExpiryCount === 1 &&
        persistent.evidence.restoredCredentialPresent === true,
    },
    {
      id: "cookie-same-site-context-gap",
      priorTerminalCode: "unsupported_cookie_same_site_context",
      status: "positively_supported",
      authority: "fresh_direct_in_process_cookie_minimizer_scenario",
      scenarioId: sameSite.id,
      processCount: sameSite.processCount,
      sameSitePolicyPassed:
        sameSite.status === "passed" &&
        sameSite.evidence.sameSiteCredentialPresent === true &&
        sameSite.evidence.sameSiteCookiePairCount === 1 &&
        sameSite.evidence.crossSiteCredentialPresent === false &&
        sameSite.evidence.crossSiteCookiePairCount === 0,
    },
  ];
  assertPostSupportArtifactPrivacy(result);
  return result;
}

export function projectPostSupportRwaComparisonCases(cases) {
  if (!Array.isArray(cases)) {
    throw new TypeError("Post-support RWA comparison cases must be an array");
  }
  const projected = cases.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`Post-support RWA comparison case ${index + 1} is invalid`);
    }
    const { baseline, ...rest } = entry;
    if (baseline === null) return { ...structuredClone(rest), baseline: null };
    if (
      baseline === undefined ||
      baseline === null ||
      typeof baseline !== "object" ||
      Array.isArray(baseline) ||
      !hasExactKeys(baseline, ["attempts", "durationMilliseconds", "state"])
    ) {
      throw new TypeError(`Post-support RWA comparison baseline ${index + 1} is invalid`);
    }
    if (!Number.isSafeInteger(baseline.attempts) || baseline.attempts < 0) {
      throw new TypeError(`Post-support RWA comparison baseline ${index + 1} attempts are invalid`);
    }
    if (
      baseline.durationMilliseconds !== null &&
      (
        typeof baseline.durationMilliseconds !== "number" ||
        !Number.isFinite(baseline.durationMilliseconds) ||
        baseline.durationMilliseconds < 0
      )
    ) {
      throw new TypeError(`Post-support RWA comparison baseline ${index + 1} duration is invalid`);
    }
    const executionStatus = baseline.state === "passed" ? "passed" : "INVALID";
    return {
      ...structuredClone(rest),
      baseline: {
        executionStatus,
        attempts: baseline.attempts,
        durationMilliseconds: baseline.durationMilliseconds,
      },
    };
  });
  assertPostSupportArtifactPrivacy(projected);
  return projected;
}

export function assertPostSupportRwaRaw(value) {
  const identity = assertCandidateIdentity(value?.candidate);
  const sealedRuntime = value?.runtimeAuthority?.mode === "sealed_frozen_rwa_runtime";
  if (
    value?.schema !== postSupportRwaSchema ||
    value?.protocol !== "stasis-compat-bench-v1" ||
    value?.track !== "rwa-auth" ||
    value?.runner !== postSupportRwaRunner ||
    !isDeepStrictEqual(value?.source, rwaAuthSource) ||
    value?.versions?.sdk !== `@oxhq/stasis@${postSupportVersion}` ||
    value?.versions?.node !== postSupportNodeVersion ||
    value?.versions?.expectedNode !== postSupportNodeVersion ||
    value?.versions?.nodeIdentityMatches !== true ||
    value?.versions?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.versions?.expectedExecutableSha256 !== identity.windows.executable.sha256 ||
    value?.versions?.candidateIdentityMatches !== true ||
    Object.hasOwn(value?.versions ?? {}, "executablePath") ||
    value?.denominator !== rwaAuthCases.length ||
    !Array.isArray(value?.cases) ||
    value.cases.length !== rwaAuthCases.length ||
    (!sealedRuntime && !isDiagnosticRuntimeAuthority(value?.runtimeAuthority))
  ) {
    throw new TypeError("Invalid post-support RWA raw result");
  }
  if (sealedRuntime) assertPostSupportRwaRuntimeBinding(value.runtimeAuthority);
  for (const item of value.cases) {
    const opens = item?.checkpoints?.filter(
      (checkpoint) => checkpoint?.phase === "action" &&
        checkpoint?.action?.op === "openSession" &&
        checkpoint?.status === "passed",
    ) ?? [];
    if (opens.some((checkpoint) => checkpoint?.result?.profile !== postSupportProfile)) {
      throw new TypeError("Post-support RWA session did not retain the v2 profile");
    }
  }
  assertNoAbsoluteLocalPaths(value);
  assertPostSupportArtifactPrivacy(value);
  return value;
}

export function adaptPostSupportRwaForFrozenValidator(candidate) {
  assertPostSupportRwaRaw(candidate);
  const adapted = structuredClone(candidate);
  adapted.schema = "stasis-compat-rwa-stasis-raw-v1";
  adapted.runner = "stasis-controlled-web-session-v1";
  delete adapted.candidate;
  delete adapted.runtimeAuthority;
  adapted.versions = {
    ...adapted.versions,
    sdk: "@oxhq/stasis@0.2.1",
    executablePath: "post-support-identity-projection-only",
    executableSha256: "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d",
    expectedExecutableSha256:
      "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d",
  };
  for (const item of adapted.cases) {
    for (const checkpoint of item.checkpoints ?? []) {
      if (checkpoint?.phase === "backend-state-observer" && checkpoint?.backendFacts !== undefined) {
        checkpoint.state = checkpoint.backendFacts;
        delete checkpoint.backendFacts;
      }
      if (
        checkpoint?.phase === "action" &&
        checkpoint?.action?.op === "openSession" &&
        checkpoint?.status === "passed" &&
        checkpoint?.result !== undefined
      ) {
        checkpoint.result.profile = "controlled-web-session-v1";
      }
    }
  }
  return adapted;
}

export function assertPostSupportRwaRuntimeBinding(value) {
  if (
    !hasExactKeys(value, [
      "authoritative",
      "continuity",
      "mode",
      "postflight",
      "preflight",
      "schema",
    ]) ||
    value.schema !== postSupportRwaRuntimeBindingSchema ||
    value.mode !== "sealed_frozen_rwa_runtime" ||
    value.authoritative !== true ||
    !hasExactKeys(value.continuity, [
      "exactServerEvidence",
      "immutableCheckoutIdentity",
      "sameFrozenServerHostProcesses",
    ]) ||
    value.continuity.exactServerEvidence !== true ||
    value.continuity.immutableCheckoutIdentity !== true ||
    value.continuity.sameFrozenServerHostProcesses !== true
  ) {
    throw new TypeError("Invalid post-support sealed RWA runtime binding");
  }
  for (const phase of ["preflight", "postflight"]) {
    const observation = value[phase];
    if (!hasExactKeys(observation, ["checkout", "servers"])) {
      throw new TypeError(`Invalid post-support RWA ${phase} observation`);
    }
    assertProjectedRwaCheckout(observation.checkout, phase);
    assertProjectedRwaServers(observation.servers, phase);
  }
  if (
    !isDeepStrictEqual(
      immutableCheckoutIdentity(value.preflight.checkout),
      immutableCheckoutIdentity(value.postflight.checkout),
    ) ||
    !isDeepStrictEqual(value.preflight.servers, value.postflight.servers) ||
    !sameFrozenServerHostProcesses(value.preflight.servers, value.postflight.servers)
  ) {
    throw new Error("Post-support RWA runtime changed across the direct candidate lane");
  }
  assertPostSupportArtifactPrivacy(value);
  return value;
}

async function runWithSealedRwaRuntime(runDirectCandidate) {
  const root = path.resolve(process.env.RWA_ROOT ?? defaultRwaRoot);
  const preflight = await observeSealedRwaRuntime(root, "preflight");
  let legacyShaped;
  let executionError;
  try {
    legacyShaped = await runDirectCandidate();
  } catch (error) {
    executionError = error;
  }

  let postflight;
  let postflightError;
  try {
    postflight = await observeSealedRwaRuntime(root, "postflight");
  } catch (error) {
    postflightError = error;
  }
  if (executionError !== undefined && postflightError !== undefined) {
    throw new AggregateError(
      [executionError, postflightError],
      "The direct RWA lane and its sealed postflight both failed",
    );
  }
  if (postflightError !== undefined) throw postflightError;
  if (executionError !== undefined) throw executionError;

  const runtimeAuthority = {
    schema: postSupportRwaRuntimeBindingSchema,
    mode: "sealed_frozen_rwa_runtime",
    authoritative: true,
    preflight,
    postflight,
    continuity: {
      immutableCheckoutIdentity: isDeepStrictEqual(
        immutableCheckoutIdentity(preflight.checkout),
        immutableCheckoutIdentity(postflight.checkout),
      ),
      exactServerEvidence: isDeepStrictEqual(preflight.servers, postflight.servers),
      sameFrozenServerHostProcesses: sameFrozenServerHostProcesses(
        preflight.servers,
        postflight.servers,
      ),
    },
  };
  assertPostSupportRwaRuntimeBinding(runtimeAuthority);
  return { legacyShaped, runtimeAuthority };
}

async function observeSealedRwaRuntime(root, phase) {
  const checkout = await inspectRwaCheckout(root);
  if (checkout?.valid !== true) {
    const violations = Array.isArray(checkout?.violations)
      ? checkout.violations.join("; ")
      : "missing frozen checkout evidence";
    throw new Error(`Post-support RWA ${phase} checkout failed: ${violations}`);
  }
  const servers = await probeRwaServers({ upstreamRoot: root });
  const observation = {
    checkout: projectRwaCheckout(checkout),
    servers: structuredClone(servers),
  };
  assertProjectedRwaCheckout(observation.checkout, phase);
  assertProjectedRwaServers(observation.servers, phase);
  return observation;
}

function projectRwaCheckout(checkout) {
  return {
    valid: checkout.valid,
    violations: structuredClone(checkout.violations),
    revision: checkout.revision,
    tree: checkout.tree,
    detached: checkout.detached,
    authSpec: structuredClone(checkout.authSpec),
    seed: structuredClone(checkout.seed),
    generatedRuntimeFiles: structuredClone(checkout.generatedRuntimeFiles),
    runtimeCache: structuredClone(checkout.runtimeCache),
    localEnvironmentFiles: structuredClone(checkout.localEnvironmentFiles),
    ambientOverrides: structuredClone(checkout.ambientOverrides),
    trackedStatusEntries: structuredClone(checkout.trackedStatusEntries),
    runtimeDatabase: structuredClone(checkout.runtimeDatabase),
  };
}

function assertProjectedRwaCheckout(value, phase) {
  if (
    !hasExactKeys(value, [
      "ambientOverrides",
      "authSpec",
      "detached",
      "generatedRuntimeFiles",
      "localEnvironmentFiles",
      "revision",
      "runtimeCache",
      "runtimeDatabase",
      "seed",
      "trackedStatusEntries",
      "tree",
      "valid",
      "violations",
    ]) ||
    value.valid !== true ||
    !isDeepStrictEqual(value.violations, []) ||
    value.revision !== rwaBaselineExpected.revision ||
    value.tree !== rwaBaselineExpected.tree ||
    value.detached !== true ||
    !isDeepStrictEqual(value.authSpec, rwaBaselineExpected.spec) ||
    !isDeepStrictEqual(value.seed, rwaBaselineExpected.seed) ||
    !isDeepStrictEqual(value.generatedRuntimeFiles, RWA_GENERATED_RUNTIME_IDENTITY) ||
    !isDeepStrictEqual(value.runtimeCache, RWA_RUNTIME_CACHE_IDENTITY) ||
    !isDeepStrictEqual(value.localEnvironmentFiles, RWA_LOCAL_ENV_IDENTITY) ||
    !isDeepStrictEqual(value.ambientOverrides, RWA_AMBIENT_OVERRIDE_IDENTITY) ||
    !validRuntimeDatabaseState(value.trackedStatusEntries, value.runtimeDatabase)
  ) {
    throw new TypeError(`Invalid post-support RWA ${phase} checkout identity`);
  }
}

function validRuntimeDatabaseState(trackedStatusEntries, database) {
  if (
    !hasExactKeys(database, [
      "allowedRuntimeMutation",
      "blobOid",
      "blobSha256",
      "newlineOnlyDifference",
      "path",
      "worktreeSha256",
    ]) ||
    database.path !== rwaBaselineExpected.databasePath ||
    database.blobOid !== rwaBaselineExpected.seed.blobOid ||
    database.blobSha256 !== rwaBaselineExpected.seed.blobSha256 ||
    !/^[a-f0-9]{64}$/u.test(database.worktreeSha256 ?? "")
  ) {
    return false;
  }
  if (isDeepStrictEqual(trackedStatusEntries, [])) {
    return database.worktreeSha256 === rwaBaselineExpected.seed.worktreeSha256 &&
      database.allowedRuntimeMutation === false &&
      database.newlineOnlyDifference === false;
  }
  return isDeepStrictEqual(trackedStatusEntries, [` M ${rwaBaselineExpected.databasePath}`]) &&
    database.allowedRuntimeMutation === true &&
    database.newlineOnlyDifference === true;
}

function assertProjectedRwaServers(value, phase) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new TypeError(`Invalid post-support RWA ${phase} server denominator`);
  }
  const roles = [
    {
      name: "frontend",
      url: "http://localhost:3000/",
      port: 3000,
      scriptRole: "scripts/testServer.ts",
      body: rwaBaselineExpected.serverBodies.frontend,
      extraKeys: [
        "ambientOverrides",
        "generatedRuntimeFiles",
        "localEnvironmentFiles",
        "runtimeCache",
        "servedBuildTree",
      ],
    },
    {
      name: "backend",
      url: "http://localhost:3001/",
      port: 3001,
      scriptRole: "backend/app.ts",
      body: rwaBaselineExpected.serverBodies.backend,
      extraKeys: [],
    },
  ];
  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index];
    const server = value[index];
    if (
      !hasExactKeys(server, [
        "bodyBytes",
        "bodySha256",
        "contentType",
        "listener",
        "name",
        "status",
        "url",
        ...role.extraKeys,
      ]) ||
      server.name !== role.name ||
      server.url !== role.url ||
      server.status !== 200 ||
      server.contentType !== role.body.contentType ||
      server.bodyBytes !== role.body.bytes ||
      server.bodySha256 !== role.body.sha256 ||
      !validRwaListener(server.listener, role)
    ) {
      throw new TypeError(`Invalid post-support RWA ${phase} ${role.name} server identity`);
    }
    if (role.name === "frontend" && (
      !isDeepStrictEqual(server.servedBuildTree, rwaBaselineExpected.buildTree) ||
      !isDeepStrictEqual(server.generatedRuntimeFiles, RWA_GENERATED_RUNTIME_IDENTITY) ||
      !isDeepStrictEqual(server.runtimeCache, RWA_RUNTIME_CACHE_IDENTITY) ||
      !isDeepStrictEqual(server.localEnvironmentFiles, RWA_LOCAL_ENV_IDENTITY) ||
      !isDeepStrictEqual(server.ambientOverrides, RWA_AMBIENT_OVERRIDE_IDENTITY)
    )) {
      throw new TypeError(`Invalid post-support RWA ${phase} served build identity`);
    }
  }
  if (new Set(value.map(({ listener }) => listener.launcherProcessId)).size !== 1) {
    throw new TypeError(`Invalid post-support RWA ${phase} sealed server host`);
  }
}

function validRwaListener(listener, role) {
  return hasExactKeys(listener, [
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
  ]) &&
    listener.port === role.port &&
    Number.isSafeInteger(listener.processId) &&
    listener.processId > 0 &&
    typeof listener.processName === "string" &&
    listener.processName.toLowerCase() === "node.exe" &&
    listener.nodeVersion === rwaBaselineExpected.node &&
    listener.executableBytes === rwaBaselineExpected.nodeExecutable.bytes &&
    listener.executableSha256 === rwaBaselineExpected.nodeExecutable.sha256 &&
    Number.isSafeInteger(listener.launcherProcessId) &&
    listener.launcherProcessId > 0 &&
    listener.launcherMatchesFrozenHost === true &&
    listener.commandMatchesPinnedRole === true &&
    listener.scriptRole === role.scriptRole;
}

function immutableCheckoutIdentity(checkout) {
  const {
    trackedStatusEntries: _trackedStatusEntries,
    runtimeDatabase: _runtimeDatabase,
    ...identity
  } = checkout;
  return identity;
}

function sameFrozenServerHostProcesses(preflight, postflight) {
  const processIdentity = (servers) => servers.map(({ listener }) => ({
    port: listener.port,
    processId: listener.processId,
    launcherProcessId: listener.launcherProcessId,
  }));
  return isDeepStrictEqual(processIdentity(preflight), processIdentity(postflight));
}

function isDiagnosticRuntimeAuthority(value) {
  return hasExactKeys(value, ["authoritative", "mode"]) &&
    value.mode === "diagnostic_injected_dependencies" &&
    value.authoritative === false;
}

function hasExactKeys(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function projectBackendFacts(checkpoint) {
  if (checkpoint?.phase !== "backend-state-observer" || checkpoint?.state === undefined) {
    return checkpoint;
  }
  const { state, ...rest } = checkpoint;
  return { ...rest, backendFacts: state };
}

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile ||
    typeof value?.sdk?.launch !== "function"
  ) {
    throw new TypeError("RWA lane requires one verified post-support candidate");
  }
  return identity;
}

function assertNoAbsoluteLocalPaths(value) {
  const localPath = /(?:^[a-z]:[\\/]|^\\\\|^\/(?:home|users|tmp|var)\/)/iu;
  const visit = (entry) => {
    if (typeof entry === "string" && localPath.test(entry)) {
      throw new TypeError("Post-support RWA artifact contains an absolute local path");
    }
    if (entry !== null && typeof entry === "object") {
      for (const child of Object.values(entry)) visit(child);
    }
  };
  visit(value);
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  }
}
