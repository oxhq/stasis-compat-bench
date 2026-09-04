import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { assertPostSupportArtifactPrivacy } from "../post-support/artifact-privacy.mjs";
import {
  assertCandidateIdentity,
  postSupportNodeVersion,
  postSupportPackageRunAttempt,
  postSupportPackageRunId,
  postSupportProfile,
  postSupportRevision,
  postSupportVersion,
} from "../post-support/candidate-identity.mjs";
import { rwaAuthSource } from "../rwa/cases.mjs";
import { rwaBaselineExpected } from "../rwa/run-cypress.mjs";
import {
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "../rwa/runtime-identity.mjs";
import {
  assertFreshSealedArtifactRoot,
  jsonReplacer,
  writeJson,
  writeText,
} from "../shared/io.mjs";
import { FROZEN_IDENTITIES } from "../shared/manifest.mjs";
import {
  assertCrawlPerformanceRaw,
} from "./crawl.mjs";
import {
  assertCombinedPerformanceEvidence,
  buildCombinedPerformanceEvidence,
  combinedPerformanceEvidenceSchema,
  renderCombinedPerformanceEvidenceMarkdown,
} from "./evidence.mjs";
import {
  assertRwaPerformanceRaw,
  rwaPerformanceProtocol,
  rwaPerformanceTrack,
} from "./rwa.mjs";
import { assertCleanHarnessWorktreeEvidence } from "./harness-worktree.mjs";
import { rwaCheckoutContinuityMatches } from "./rwa-checkout-continuity.mjs";

export const combinedPerformanceEvidenceJsonArtifactPath =
  "performance/combined-evidence.json";
export const combinedPerformanceEvidenceMarkdownArtifactPath =
  "performance/combined-evidence.md";
export const rwaPerformanceArtifactSchema =
  "stasis-v0.3.3-performance-rwa-artifact-v1";

const rwaArtifactKeys = Object.freeze([
  "authorityRaw",
  "host",
  "identities",
  "protocol",
  "provenance",
  "recordedAt",
  "schema",
  "sealedRuntime",
  "track",
]);
const rwaHostFactKeys = Object.freeze([
  "arch",
  "cpuModel",
  "imageOs",
  "imageVersion",
  "logicalCpuCount",
  "platform",
  "runnerOs",
]);
const expectedPostSupportCandidateIdentity = Object.freeze({
  schema: "stasis-post-support-candidate-identity-v1",
  repository: "oxhq/stasis",
  revision: postSupportRevision,
  version: postSupportVersion,
  profile: postSupportProfile,
  hostedSdkPackageTrain: Object.freeze({
    source: "github_actions_package_workflow",
    id: postSupportPackageRunId,
    attempt: postSupportPackageRunAttempt,
  }),
  windows: Object.freeze({
    source: "github_actions_package_workflow_ci_only_bundle",
    zip: Object.freeze({
      sha256: "5e95ed4123ee2b03d579313bae637cb35e3050114377072c603b0b5cbd1d217b",
      bytes: 37_188_148,
    }),
    executable: Object.freeze({
      sha256: "e12230ec8659775353af50fed0d98fbaad0c2888143baf37667c90d469e738d9",
      bytes: 87_334_400,
    }),
  }),
  sdk: Object.freeze({
    source: "hosted_package_train",
    archive: Object.freeze({
      sha256: "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec",
      bytes: 181_292,
    }),
    proof: Object.freeze({
      sha256: "ec6df3f07f3a27f16bf9fb91b5c2b09daf796bd8f2aed455f6879598f06b9ba4",
      bytes: 10_695,
    }),
    tree: Object.freeze({
      sha256: "20f52ace92961030f8dc5d2743d941eb3445a86949097b194ec97312f5eface8",
      fileCount: 55,
      totalBytes: 896_631,
    }),
  }),
});

export function assertRwaPerformanceArtifact(
  value,
  {
    assertRaw = assertRwaPerformanceRaw,
    assertPrivacy = assertPostSupportArtifactPrivacy,
  } = {},
) {
  assertPrivacy(value);
  exactKeys(value, rwaArtifactKeys, "RWA performance artifact");
  if (
    value.schema !== rwaPerformanceArtifactSchema ||
    value.protocol !== rwaPerformanceProtocol ||
    value.track !== rwaPerformanceTrack ||
    !isCanonicalIsoInstant(value.recordedAt)
  ) {
    throw new TypeError("Invalid RWA performance artifact identity");
  }

  const raw = assertRaw(value.authorityRaw);
  if (
    raw.protocol !== value.protocol ||
    raw.track !== value.track ||
    raw.authority?.valid !== true ||
    raw.authority?.status !== "valid"
  ) {
    throw new TypeError("RWA performance artifact does not retain a valid matching raw authority");
  }

  assertRwaArtifactProvenance(value.provenance);
  assertRwaArtifactIdentities(value.identities);

  exactKeys(value.host, [
    "classDigest",
    "facts",
    "machineInstanceSaltedDigest",
  ], "RWA performance artifact host");
  exactKeys(value.host.facts, rwaHostFactKeys, "RWA performance artifact host facts");
  const expectedFacts = Object.fromEntries(
    rwaHostFactKeys.map((key) => [key, raw.host[key]]),
  );
  if (
    !isDeepStrictEqual(value.host.facts, expectedFacts) ||
    value.host.classDigest !== raw.host.identityDigest ||
    value.host.machineInstanceSaltedDigest !== raw.host.instanceDigest
  ) {
    throw new TypeError("RWA performance artifact host bindings do not match its raw authority");
  }

  exactKeys(
    value.sealedRuntime,
    ["continuity", "postflight", "startup"],
    "RWA performance artifact sealed runtime",
  );
  exactKeys(
    value.sealedRuntime.continuity,
    [
      "immutableCheckoutIdentity",
      "sameFrozenServerHostProcesses",
      "shutdownAcknowledged",
    ],
    "RWA performance artifact continuity",
  );
  assertSealedRwaPhase(value.sealedRuntime.startup, "startup", value.identities);
  assertSealedRwaPhase(value.sealedRuntime.postflight, "postflight", value.identities);
  if (
    value.sealedRuntime.continuity.immutableCheckoutIdentity !== true ||
    value.sealedRuntime.continuity.sameFrozenServerHostProcesses !== true ||
    value.sealedRuntime.continuity.shutdownAcknowledged !== true ||
    !rwaCheckoutContinuityMatches(
      value.sealedRuntime.startup.checkout,
      value.sealedRuntime.postflight.checkout,
    ) ||
    !isDeepStrictEqual(
      value.sealedRuntime.startup.servers,
      value.sealedRuntime.postflight.servers,
    )
  ) {
    throw new TypeError("RWA performance artifact did not retain sealed runtime continuity");
  }
  return raw;
}

function assertRwaArtifactProvenance(value) {
  exactKeys(value, ["harness", "workflowSource"], "RWA performance provenance");
  exactKeys(value.harness, ["revision", "tree", "worktree"], "RWA harness provenance");
  if (
    !isGitSha(value.harness.revision) ||
    !isGitSha(value.harness.tree)
  ) {
    throw new TypeError("Invalid RWA harness revision or tree");
  }
  assertCleanHarnessWorktreeEvidence(value.harness.worktree);

  exactKeys(
    value.workflowSource,
    [
      "job",
      "provider",
      "ref",
      "repository",
      "revision",
      "runAttempt",
      "runId",
      "workflow",
    ],
    "RWA workflow-source provenance",
  );
  if (
    value.workflowSource.provider !== "github-actions" ||
    value.workflowSource.repository !== "oxhq/stasis" ||
    value.workflowSource.workflow !== "Stasis v0.3.3 performance evidence" ||
    value.workflowSource.job !== "windows-rwa" ||
    !isGitSha(value.workflowSource.revision) ||
    typeof value.workflowSource.ref !== "string" ||
    value.workflowSource.ref.length === 0 ||
    value.workflowSource.ref.length > 512 ||
    !isCanonicalPositiveDecimal(value.workflowSource.runId) ||
    !isCanonicalPositiveDecimal(value.workflowSource.runAttempt)
  ) {
    throw new TypeError("Invalid RWA workflow-source provenance");
  }
}

function assertRwaArtifactIdentities(value) {
  exactKeys(value, ["cypress", "node", "rwa", "stasis"], "RWA performance identities");
  const expectedNode = {
    version: postSupportNodeVersion,
    executableSha256: rwaBaselineExpected.nodeExecutable.sha256,
    executableBytes: rwaBaselineExpected.nodeExecutable.bytes,
  };
  exactKeys(value.node, Object.keys(expectedNode), "RWA Node identity");
  if (!isDeepStrictEqual(value.node, expectedNode)) {
    throw new TypeError("RWA Node identity differs from the frozen executable");
  }

  const expectedCypress = {
    packageVersion: rwaBaselineExpected.cypressVersion,
    browserName: "electron",
    browserVersion: rwaBaselineExpected.electronVersion,
    resolvedNodeVersion: rwaBaselineExpected.resolvedNodeVersion,
    viewport: rwaBaselineExpected.viewport,
    retries: rwaBaselineExpected.primaryRetries,
    installed: {
      nodeModulesTree: FROZEN_IDENTITIES.rwa.installed.nodeModulesTree,
      cypressPackageTree: FROZEN_IDENTITIES.rwa.installed.cypressPackageTree,
      tsNodePackageTree: FROZEN_IDENTITIES.rwa.installed.tsNodePackageTree,
      cypressRuntimeTree: FROZEN_IDENTITIES.rwa.installed.cypressRuntimeTree,
      executable: {
        bytes: FROZEN_IDENTITIES.rwa.installed.cypressExecutableBytes,
        sha256: FROZEN_IDENTITIES.rwa.installed.cypressExecutableSha256,
      },
    },
  };
  exactKeys(value.cypress, Object.keys(expectedCypress), "RWA Cypress identity");
  if (!isDeepStrictEqual(value.cypress, expectedCypress)) {
    throw new TypeError("RWA Cypress or Electron identity differs from the frozen baseline");
  }

  const expectedRwa = {
    repository: rwaAuthSource.repository,
    revision: rwaAuthSource.revision,
    tree: rwaBaselineExpected.tree,
    specBlobOid: rwaAuthSource.specBlobOid,
    specBlobSha256: rwaAuthSource.specBlobSha256,
    specWorktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
    seedBlobOid: rwaBaselineExpected.seed.blobOid,
    seedBlobSha256: rwaBaselineExpected.seed.blobSha256,
    seedWorktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
    buildTree: rwaBaselineExpected.buildTree,
    serverBodies: rwaBaselineExpected.serverBodies,
    endpoints: {
      appOrigin: rwaBaselineExpected.baseUrl,
      apiOrigin: rwaBaselineExpected.apiUrl,
    },
  };
  exactKeys(value.rwa, Object.keys(expectedRwa), "RWA checkout identity");
  if (!isDeepStrictEqual(value.rwa, expectedRwa)) {
    throw new TypeError("RWA checkout identity differs from the frozen baseline");
  }

  exactKeys(value.stasis, ["candidate", "runtime"], "RWA Stasis identity");
  assertCandidateIdentity(value.stasis.candidate);
  if (!isDeepStrictEqual(value.stasis.candidate, expectedPostSupportCandidateIdentity)) {
    throw new TypeError("RWA Stasis candidate differs from the frozen v0.3.3 release identity");
  }
  const expectedRuntime = {
    implementationName: "stasis-shell",
    implementationVersion: postSupportVersion,
    stasisRevision: postSupportRevision,
    v2ProfileAdvertised: true,
  };
  exactKeys(value.stasis.runtime, Object.keys(expectedRuntime), "RWA Stasis runtime identity");
  if (!isDeepStrictEqual(value.stasis.runtime, expectedRuntime)) {
    throw new TypeError("RWA Stasis runtime differs from the frozen v0.3.3 identity");
  }
}

export async function combinePerformanceEvidenceFiles({
  rwaArtifactPath,
  crawlRawPath,
  readJsonFile = readCanonicalJsonFile,
  assertRwaArtifact = assertRwaPerformanceArtifact,
  assertCrawlRaw = assertCrawlPerformanceRaw,
  buildEvidence = buildCombinedPerformanceEvidence,
  assertEvidence = assertCombinedPerformanceEvidence,
  renderEvidence = renderCombinedPerformanceEvidenceMarkdown,
  assertPrivacy = assertPostSupportArtifactPrivacy,
  assertFreshArtifactRoot = assertFreshSealedArtifactRoot,
  writeEvidenceJson = writeJson,
  writeEvidenceText = writeText,
} = {}) {
  const rwaPath = requiredAbsolutePath(rwaArtifactPath, "RWA hosted artifact");
  const crawlPath = requiredAbsolutePath(crawlRawPath, "crawl hosted raw artifact");
  const [rwaArtifact, crawlValue] = await Promise.all([
    readJsonFile(rwaPath, "RWA hosted artifact"),
    readJsonFile(crawlPath, "crawl hosted raw artifact"),
  ]);
  const rwaRaw = assertRwaArtifact(rwaArtifact);
  const crawlRaw = assertCrawlRaw(crawlValue);
  const evidence = buildEvidence({ rwaRaw, crawlRaw });
  assertEvidence(evidence, { rwaRaw, crawlRaw });
  assertPrivacy(evidence);
  const markdown = renderEvidence(evidence);
  assertPrivacy(markdown);

  const artifactRoot = await assertFreshArtifactRoot();
  const evidencePath = await writeEvidenceJson(
    combinedPerformanceEvidenceJsonArtifactPath,
    evidence,
  );
  const markdownPath = await writeEvidenceText(
    combinedPerformanceEvidenceMarkdownArtifactPath,
    markdown,
  );
  return Object.freeze({
    artifactRoot,
    evidencePath,
    markdownPath,
    evidence,
  });
}

export async function verifyCombinedPerformanceEvidenceFiles({
  rwaArtifactPath,
  crawlRawPath,
  evidencePath,
  markdownPath,
  readJsonFile = readCanonicalJsonFile,
  readTextFile = readFile,
  assertRwaArtifact = assertRwaPerformanceArtifact,
  assertCrawlRaw = assertCrawlPerformanceRaw,
  assertEvidence = assertCombinedPerformanceEvidence,
  renderEvidence = renderCombinedPerformanceEvidenceMarkdown,
  assertPrivacy = assertPostSupportArtifactPrivacy,
} = {}) {
  const paths = {
    rwa: requiredAbsolutePath(rwaArtifactPath, "RWA hosted artifact"),
    crawl: requiredAbsolutePath(crawlRawPath, "crawl hosted raw artifact"),
    evidence: requiredAbsolutePath(evidencePath, "combined evidence JSON"),
    markdown: requiredAbsolutePath(markdownPath, "combined evidence Markdown"),
  };
  const [rwaArtifact, crawlValue, evidence, markdown] = await Promise.all([
    readJsonFile(paths.rwa, "RWA hosted artifact"),
    readJsonFile(paths.crawl, "crawl hosted raw artifact"),
    readJsonFile(paths.evidence, "combined evidence JSON"),
    readTextFile(paths.markdown, "utf8"),
  ]);
  const rwaRaw = assertRwaArtifact(rwaArtifact);
  const crawlRaw = assertCrawlRaw(crawlValue);
  assertEvidence(evidence, { rwaRaw, crawlRaw });
  assertPrivacy(evidence);
  const expectedMarkdown = renderEvidence(evidence);
  assertPrivacy(expectedMarkdown);
  if (markdown !== expectedMarkdown) {
    throw new TypeError(
      "Combined performance evidence Markdown does not replay exactly from the retained JSON",
    );
  }
  return Object.freeze({
    schema: "stasis-v0.3.3-combined-performance-verification-v1",
    status: "passed",
    combinedEvidenceSchema: combinedPerformanceEvidenceSchema,
    rwaArtifactSchema: rwaPerformanceArtifactSchema,
    rwaRawSchema: rwaRaw.schema,
    crawlRawSchema: crawlRaw.schema,
    markdownReplayVerified: true,
  });
}

export async function readCanonicalJsonFile(filePath, label = "JSON input") {
  const absolutePath = requiredAbsolutePath(filePath, label);
  let text;
  let value;
  try {
    text = await readFile(absolutePath, "utf8");
    value = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${label} is absent or invalid JSON`, { cause: error });
  }
  const canonical = `${JSON.stringify(value, jsonReplacer, 2)}\n`;
  if (text !== canonical) {
    throw new TypeError(`${label} is not canonical deterministic JSON`);
  }
  return value;
}

export function requiredAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be one explicit absolute path`);
  }
  return path.resolve(value);
}

function isCanonicalIsoInstant(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isGitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
}

function isCanonicalPositiveDecimal(value) {
  return typeof value === "string" && /^[1-9][0-9]*$/u.test(value);
}

function assertSealedRwaPhase(value, label, identities) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.checkout === null ||
    typeof value.checkout !== "object" ||
    Array.isArray(value.checkout) ||
    value.checkout.valid !== true ||
    !Array.isArray(value.checkout.violations) ||
    value.checkout.violations.length !== 0 ||
    !Array.isArray(value.servers) ||
    value.servers.length !== 2
  ) {
    throw new TypeError(`RWA performance artifact ${label} phase is not valid`);
  }
  exactKeys(value, ["checkout", "servers"], `RWA performance artifact ${label} phase`);
  const checkout = value.checkout;
  exactKeys(checkout, [
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
  ], `RWA performance artifact ${label} checkout`);
  exactKeys(checkout.authSpec, ["blobOid", "blobSha256", "worktreeSha256"], `${label} auth spec`);
  exactKeys(checkout.seed, ["blobOid", "blobSha256", "worktreeSha256"], `${label} seed`);
  exactKeys(
    checkout.runtimeDatabase,
    ["allowedRuntimeMutation", "blobOid", "blobSha256", "newlineOnlyDifference", "worktreeSha256"],
    `${label} runtime database`,
  );
  if (
    checkout.revision !== identities.rwa.revision ||
    checkout.tree !== identities.rwa.tree ||
    checkout.detached !== true ||
    !isDeepStrictEqual(checkout.authSpec, {
      blobOid: identities.rwa.specBlobOid,
      blobSha256: identities.rwa.specBlobSha256,
      worktreeSha256: identities.rwa.specWorktreeSha256,
    }) ||
    !isDeepStrictEqual(checkout.seed, {
      blobOid: identities.rwa.seedBlobOid,
      blobSha256: identities.rwa.seedBlobSha256,
      worktreeSha256: identities.rwa.seedWorktreeSha256,
    }) ||
    !isDeepStrictEqual(checkout.generatedRuntimeFiles, RWA_GENERATED_RUNTIME_IDENTITY) ||
    !isDeepStrictEqual(checkout.runtimeCache, RWA_RUNTIME_CACHE_IDENTITY) ||
    !isDeepStrictEqual(checkout.localEnvironmentFiles, RWA_LOCAL_ENV_IDENTITY) ||
    !isDeepStrictEqual(checkout.ambientOverrides, RWA_AMBIENT_OVERRIDE_IDENTITY) ||
    checkout.runtimeDatabase.blobOid !== identities.rwa.seedBlobOid ||
    checkout.runtimeDatabase.blobSha256 !== identities.rwa.seedBlobSha256
  ) {
    throw new TypeError(`RWA performance artifact ${label} checkout differs from its frozen identity`);
  }
  assertSealedRwaServers(value.servers, label, identities);
}

function assertSealedRwaServers(value, label, identities) {
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
  const expected = [
    {
      name: "frontend",
      url: `${identities.rwa.endpoints.appOrigin}/`,
      status: 200,
      contentType: identities.rwa.serverBodies.frontend.contentType,
      bodyBytes: identities.rwa.serverBodies.frontend.bytes,
      bodySha256: identities.rwa.serverBodies.frontend.sha256,
      listener: listener(3000, "scripts/testServer.ts"),
      servedBuildTree: identities.rwa.buildTree,
      generatedRuntimeFiles: RWA_GENERATED_RUNTIME_IDENTITY,
      runtimeCache: RWA_RUNTIME_CACHE_IDENTITY,
      localEnvironmentFiles: RWA_LOCAL_ENV_IDENTITY,
      ambientOverrides: RWA_AMBIENT_OVERRIDE_IDENTITY,
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
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError(`RWA performance artifact ${label} servers differ from their frozen identity`);
  }
}

function exactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())
  ) {
    throw new TypeError(`Invalid ${label}`);
  }
}
