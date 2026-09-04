import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  assertPostSupportDeterministicRaw,
  replayPostSupportDeterministicComparisonClaims,
} from "../post-support/deterministic-lane.mjs";
import {
  assertPostSupportRwaRaw,
  assertPostSupportRwaRuntimeBinding,
  projectResolvedCookieBoundaries,
  replayPostSupportRwaComparisonClaims,
} from "../post-support/rwa-lane.mjs";
import { assertRetainedPostSupportWildNetworkSmoke } from "../post-support/wild-network-smoke.mjs";
import { replayPostSupportWildEvidenceClaims } from "../post-support/wild-result-verifier.mjs";
import {
  assertTypedTerminalMinimizerResult,
  frozenPublicWildArtifactIndexSha256,
} from "../post-support/typed-terminal-minimizers.mjs";
import { preflightLedgerPath, selectedCorpusPath } from "../wild/config.mjs";
import { assertSmokePrecedesPairedRun } from "../wild/network-policy-smoke.mjs";
import {
  assertFrozenProjectedRwaCypressBaselineBytes,
  rwaCypressBaselineProjectionContract,
} from "./rwa-baseline.mjs";
import { verifyWildAuthorityTranscriptEvidence } from "./wild-transcript.mjs";

export const evidenceManifestName = "evidence-manifest.json";
export const evidenceChecksumsName = "SHA256SUMS.txt";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const revisionPattern = /^[a-f0-9]{40}$/u;
const runIdPattern = /^[1-9][0-9]*$/u;
const safeRelativePathPattern = /^[A-Za-z0-9._/-]+$/u;
const textExtensions = new Set([
  ".csv",
  ".json",
  ".log",
  ".md",
  ".txt",
  ".tsv",
  ".yaml",
  ".yml",
]);
const requiredEvidencePaths = Object.freeze([
  "evidence/candidate-verification.json",
  "evidence/cookie-minimizers.json",
  "evidence/deterministic-comparison.json",
  "evidence/deterministic-playwright-raw.json",
  "evidence/deterministic-stasis-raw.json",
  "evidence/rwa-comparison.json",
  "evidence/rwa-cypress-raw.json",
  "evidence/rwa-stasis-raw.json",
  "evidence/wild-authority-extraction-receipt.json",
  "evidence/wild-authority.json",
  "evidence/wild-network-policy-smoke.json",
  "evidence/wild-stdout-transcript.log",
  "evidence/wild/artifact-index.json",
  "evidence/wild/paired-start.json",
  "evidence/wild/summary.json",
]);
const exactEvidencePaths = Object.freeze([
  ...requiredEvidencePaths,
  ...Array.from({ length: 100 }, (_unused, offset) => {
    const slot = String(offset + 1).padStart(3, "0");
    return [
      `evidence/wild/cases/${slot}-classification.json`,
      `evidence/wild/raw/${slot}-baseline-gate.json`,
      `evidence/wild/raw/${slot}-baseline.json`,
      `evidence/wild/raw/${slot}-stasis-gate.json`,
      `evidence/wild/raw/${slot}-stasis.json`,
    ];
  }).flat(),
].sort(comparePaths));
const currentUrlExactEvidencePaths = Object.freeze([
  ...exactEvidencePaths,
  "evidence/typed-terminal-minimizers.json",
].sort(comparePaths));
const deterministicPlaywrightBaselineContract = deepFreeze({
  path: "evidence/deterministic-playwright-raw.json",
  source: {
    bytes: 9_381,
    sha256: "ec0f6c71992a8eeea3655e1800b640ed48e95e862f9a7498849a365ecd93a9e5",
  },
  projected: {
    bytes: 9_334,
    sha256: "1622627885aa3153ad1d8e4cd637eeed19aa5e722edc7d80aacbc72ab550fe38",
  },
  changedJsonPointers: ["/versions/chromiumExecutable"],
});
const publicationReleaseIdentityContract = deepFreeze({
  schema: "stasis-compat-benchmark-release-identity-v2",
  status: "qualified",
  release: {
    version: "0.3.3",
    tag: "v0.3.3",
    sourceRevision: "48c5a718a9ddd63f496e45307e1484974ccf8587",
    githubReleaseId: "380550511",
    githubReleaseUrl: "https://github.com/oxhq/stasis/releases/tag/v0.3.3",
  },
  packageQualification: {
    workflowRunId: "33506181780",
    workflowRunAttempt: 1,
    sdkArchiveSha256: "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec",
    sdkArchiveBytes: 181_292,
    provenanceAttestationUrl: "https://github.com/oxhq/stasis/attestations/44426142",
  },
  registry: {
    package: "@oxhq/stasis",
    version: "0.3.3",
    distIntegrity: "sha512-RbBSACeWpxQ6mIl23aOcoiaQF95/RT2fVEOfIh0T5MTkzzcv0lB2V983hjhjtdMiB3GBytnfwfoMw/Hj8ntUeg==",
    tarballSha256: "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec",
    tarballBytes: 181_292,
    npmAttestationUrl: "https://registry.npmjs.org/-/npm/v1/attestations/@oxhq%2fstasis@0.3.3",
    publicationProducer: {
      workflowRunId: "33523312229",
      workflowRunAttempt: 1,
      workflowRevision: "5eeb51560068566d5035e9e262f9fa7bf4ed33f8",
    },
    anonymousVerification: {
      workflowRunId: "33527160165",
      workflowRunAttempt: 1,
      workflowRevision: "5174958df449aea2b5e6dec9cebefab921097d09",
      platforms: ["linux-x86_64", "macos-aarch64"],
    },
  },
});

export function validatePublicationReleaseIdentity(value, { requireComplete = false } = {}) {
  assertPlainObject(value, "publication release identity");
  assertExactKeys(value, [
    "packageQualification",
    "registry",
    "release",
    "schema",
    "status",
  ], "publication release identity");
  if (value.schema !== "stasis-compat-benchmark-release-identity-v2") {
    throw new Error("Publication release identity has the wrong schema");
  }
  if (value.status !== "qualified") {
    throw new Error("Publication release identity must be complete and qualified");
  }

  assertPlainObject(value.release, "release identity");
  assertExactKeys(value.release, [
    "githubReleaseId",
    "githubReleaseUrl",
    "sourceRevision",
    "tag",
    "version",
  ], "release identity");
  if (value.release.version !== "0.3.3" || value.release.tag !== "v0.3.3") {
    throw new Error("Publication target must remain Stasis v0.3.3");
  }
  requiredPattern(value.release.sourceRevision, revisionPattern, "release source revision");
  requiredPattern(value.release.githubReleaseId, runIdPattern, "GitHub release id");
  requiredExactValue(
    value.release.githubReleaseUrl,
    "https://github.com/oxhq/stasis/releases/tag/v0.3.3",
    "GitHub release URL",
  );

  assertPlainObject(value.packageQualification, "package qualification identity");
  assertExactKeys(value.packageQualification, [
    "provenanceAttestationUrl",
    "sdkArchiveBytes",
    "sdkArchiveSha256",
    "workflowRunAttempt",
    "workflowRunId",
  ], "package qualification identity");
  requiredPattern(
    value.packageQualification.workflowRunId,
    runIdPattern,
    "package workflow run id",
  );
  requiredPositiveInteger(
    value.packageQualification.workflowRunAttempt,
    "package workflow run attempt",
  );
  requiredPattern(
    value.packageQualification.sdkArchiveSha256,
    sha256Pattern,
    "SDK archive SHA-256",
  );
  requiredPositiveInteger(
    value.packageQualification.sdkArchiveBytes,
    "SDK archive byte count",
  );
  requiredHttpsUrl(
    value.packageQualification.provenanceAttestationUrl,
    new Set(["github.com"]),
    "provenance attestation URL",
  );

  assertPlainObject(value.registry, "registry identity");
  assertExactKeys(value.registry, [
    "anonymousVerification",
    "distIntegrity",
    "npmAttestationUrl",
    "package",
    "publicationProducer",
    "tarballBytes",
    "tarballSha256",
    "version",
  ], "registry identity");
  if (value.registry.package !== "@oxhq/stasis" || value.registry.version !== "0.3.3") {
    throw new Error("Registry identity must remain @oxhq/stasis@0.3.3");
  }
  if (
    typeof value.registry.distIntegrity !== "string" ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value.registry.distIntegrity)
  ) {
    throw new Error("Registry dist integrity must be one SHA-512 SRI value");
  }
  requiredPattern(value.registry.tarballSha256, sha256Pattern, "registry tarball SHA-256");
  requiredPositiveInteger(value.registry.tarballBytes, "registry tarball byte count");
  requiredHttpsUrl(
    value.registry.npmAttestationUrl,
    new Set(["registry.npmjs.org"]),
    "npm attestation URL",
  );

  const producer = value.registry.publicationProducer;
  assertPlainObject(producer, "registry publication producer");
  assertExactKeys(producer, [
    "workflowRevision",
    "workflowRunAttempt",
    "workflowRunId",
  ], "registry publication producer");
  assertWorkflowIdentity(producer, "registry publication producer");

  const verifier = value.registry.anonymousVerification;
  assertPlainObject(verifier, "registry anonymous verification");
  assertExactKeys(verifier, [
    "platforms",
    "workflowRevision",
    "workflowRunAttempt",
    "workflowRunId",
  ], "registry anonymous verification");
  assertWorkflowIdentity(verifier, "registry anonymous verification");
  if (!isDeepStrictEqual(verifier.platforms, ["linux-x86_64", "macos-aarch64"])) {
    throw new Error("Registry anonymous verification platforms have the wrong order or values");
  }
  if (
    producer.workflowRunId === verifier.workflowRunId ||
    producer.workflowRevision === verifier.workflowRevision
  ) {
    throw new Error("Registry publication producer and anonymous verifier must remain separate");
  }
  if (!isDeepStrictEqual(value, publicationReleaseIdentityContract)) {
    throw new Error("Publication release identity differs from the immutable v0.3.3 contract");
  }
  if (requireComplete !== false && requireComplete !== true) {
    throw new TypeError("requireComplete must be boolean when provided");
  }
  return value;
}

export async function buildPublicationEvidence({
  publicationRoot,
  releaseIdentity,
  harnessRevision,
}) {
  validatePublicationReleaseIdentity(releaseIdentity, { requireComplete: true });
  if (!revisionPattern.test(harnessRevision ?? "")) {
    throw new Error("Publication manifest requires one exact harness revision");
  }
  const root = await assertRealDirectory(publicationRoot, "publication root");
  const existingFiles = await listRegularFiles(root);
  if (
    existingFiles.includes(evidenceManifestName) ||
    existingFiles.includes(evidenceChecksumsName)
  ) {
    throw new Error("Publication manifest outputs must not already exist");
  }
  const unexpectedTopLevel = existingFiles.filter((relativePath) =>
    !relativePath.startsWith("evidence/"));
  if (unexpectedTopLevel.length > 0) {
    throw new Error(
      `Publication root has files outside evidence/: ${JSON.stringify(unexpectedTopLevel)}`,
    );
  }
  const evidencePaths = existingFiles.filter((relativePath) => relativePath.startsWith("evidence/"));
  await assertCompleteEvidenceInventory(root, evidencePaths);

  const entries = [];
  const parsedJson = new Map();
  for (const relativePath of evidencePaths) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const metadata = await lstat(absolutePath);
    const sha256 = await sha256File(absolutePath);
    if (textExtensions.has(path.extname(relativePath).toLowerCase())) {
      const textValue = await readFile(absolutePath, "utf8");
      assertNoMachineLocalPathText(textValue, relativePath);
      if (path.extname(relativePath).toLowerCase() === ".json") {
        let value;
        try {
          value = JSON.parse(textValue);
        } catch {
          throw new Error(`Publication evidence is not valid JSON: ${relativePath}`);
        }
        parsedJson.set(relativePath, value);
      }
    }
    entries.push({ relativePath, bytes: metadata.size, sha256 });
  }

  assertEvidenceCandidateBindings(parsedJson, releaseIdentity);
  await assertBaselineInputBindings(root, entries, parsedJson);
  assertComparisonReplayBindings(parsedJson);
  const replayedWild = await assertWildEvidenceBindings(
    entries,
    parsedJson,
    harnessRevision,
  );
  await assertWildTranscriptEvidenceBindings(root, parsedJson);
  const reportedResults = extractReportedResults(parsedJson, replayedWild.summary);
  const aggregate = aggregateEntries(entries);
  const manifest = {
    schema: replayedWild.evidenceVersion === 5
      ? "stasis-compat-public-evidence-manifest-v2"
      : "stasis-compat-public-evidence-manifest-v1",
    protocol: "stasis-post-0.3-census-v1",
    harness: {
      repository: "oxhq/stasis-compat-bench",
      revision: harnessRevision,
    },
    releaseIdentity,
    baselineInputs: publicationBaselineInputs(),
    scope: publicationScope(replayedWild.evidenceVersion),
    reportedResults,
    evidence: {
      fileCount: entries.length,
      totalBytes: aggregate.totalBytes,
      treeSha256: aggregate.sha256,
      entries,
    },
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const manifestSha256 = sha256Buffer(manifestBytes);
  const checksumEntries = [
    ...entries,
    {
      relativePath: evidenceManifestName,
      bytes: manifestBytes.length,
      sha256: manifestSha256,
    },
  ].sort(compareEntries);
  const checksumBytes = Buffer.from(
    checksumEntries.map((entry) => `${entry.sha256}  ${entry.relativePath}\n`).join(""),
    "utf8",
  );

  await writeFile(path.join(root, evidenceManifestName), manifestBytes, { flag: "wx" });
  await writeFile(path.join(root, evidenceChecksumsName), checksumBytes, { flag: "wx" });
  return Object.freeze({
    manifest,
    manifestSha256,
    checksumsSha256: sha256Buffer(checksumBytes),
  });
}

export async function verifyPublicationEvidence(publicationRoot, {
  expectedHarnessRevision,
  expectedReleaseIdentity,
} = {}) {
  if (!revisionPattern.test(expectedHarnessRevision ?? "")) {
    throw new Error("Publication evidence verification requires one external harness revision");
  }
  validatePublicationReleaseIdentity(expectedReleaseIdentity, { requireComplete: true });
  const root = await assertRealDirectory(publicationRoot, "publication root");
  const [manifestText, checksumsText] = await Promise.all([
    readFile(path.join(root, evidenceManifestName), "utf8"),
    readFile(path.join(root, evidenceChecksumsName), "utf8"),
  ]);
  let actualManifest;
  try {
    actualManifest = JSON.parse(manifestText);
  } catch {
    throw new Error("Publication evidence manifest is not valid JSON");
  }
  validatePublicationReleaseIdentity(actualManifest?.releaseIdentity, { requireComplete: true });
  if (
    actualManifest?.harness?.repository !== "oxhq/stasis-compat-bench" ||
    actualManifest?.harness?.revision !== expectedHarnessRevision
  ) {
    throw new Error("Publication evidence differs from the expected public harness revision");
  }
  if (!isDeepStrictEqual(actualManifest.releaseIdentity, expectedReleaseIdentity)) {
    throw new Error("Publication evidence differs from the expected immutable release identity");
  }
  const files = await listRegularFiles(root);
  const exactTopLevelFiles = files.filter((relativePath) => !relativePath.startsWith("evidence/"));
  if (!isDeepStrictEqual(exactTopLevelFiles, [evidenceChecksumsName, evidenceManifestName].sort())) {
    throw new Error("Publication bundle has unexpected top-level files");
  }
  const temporaryRoot = {
    root,
    files: files.filter((relativePath) => relativePath.startsWith("evidence/")),
  };
  const expected = await createManifestWithoutWriting({
    ...temporaryRoot,
    releaseIdentity: expectedReleaseIdentity,
    harnessRevision: expectedHarnessRevision,
  });
  if (!isDeepStrictEqual(actualManifest, expected.manifest)) {
    throw new Error("Publication evidence manifest differs from the evidence bytes");
  }
  if (checksumsText !== expected.checksumsText) {
    throw new Error("Publication SHA256SUMS.txt differs from the evidence bytes");
  }
  return Object.freeze({
    manifestSha256: sha256Buffer(Buffer.from(manifestText, "utf8")),
    checksumsSha256: sha256Buffer(Buffer.from(checksumsText, "utf8")),
    fileCount: actualManifest.evidence.fileCount,
    totalBytes: actualManifest.evidence.totalBytes,
  });
}

export function assertNoMachineLocalPathText(value, label = "publication text") {
  if (typeof value !== "string") throw new TypeError("Publication path scan requires text");
  const patterns = [
    /(?:^|[\s"'`(=])(?:[A-Za-z]:[\\/])/mu,
    /file:\/\/(?:\/?[A-Za-z]:|\/(?:Users|home|root)\/)/iu,
    /(?:^|[\s"'`(=])\\\\[^\\/\s]+\\[^\\/\s]+/mu,
    /(?:^|[\s"'`(=])\/(?:Users|home)\/[^/\s]+(?:\/|$)/mu,
    /(?:^|[\s"'`(=])\/root(?:\/|$)/mu,
  ];
  if (patterns.some((pattern) => pattern.test(value))) {
    throw new Error(`Publication text contains a machine-local path: ${label}`);
  }
  return value;
}

async function createManifestWithoutWriting({ root, files, releaseIdentity, harnessRevision }) {
  validatePublicationReleaseIdentity(releaseIdentity, { requireComplete: true });
  if (!revisionPattern.test(harnessRevision ?? "")) {
    throw new Error("Publication manifest has an invalid harness revision");
  }
  await assertCompleteEvidenceInventory(root, files);
  const entries = [];
  const parsedJson = new Map();
  for (const relativePath of files) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const metadata = await lstat(absolutePath);
    const sha256 = await sha256File(absolutePath);
    if (textExtensions.has(path.extname(relativePath).toLowerCase())) {
      const textValue = await readFile(absolutePath, "utf8");
      assertNoMachineLocalPathText(textValue, relativePath);
      if (path.extname(relativePath).toLowerCase() === ".json") {
        parsedJson.set(relativePath, JSON.parse(textValue));
      }
    }
    entries.push({ relativePath, bytes: metadata.size, sha256 });
  }
  entries.sort(compareEntries);
  assertEvidenceCandidateBindings(parsedJson, releaseIdentity);
  await assertBaselineInputBindings(root, entries, parsedJson);
  assertComparisonReplayBindings(parsedJson);
  const replayedWild = await assertWildEvidenceBindings(
    entries,
    parsedJson,
    harnessRevision,
  );
  await assertWildTranscriptEvidenceBindings(root, parsedJson);
  const aggregate = aggregateEntries(entries);
  const manifest = {
    schema: replayedWild.evidenceVersion === 5
      ? "stasis-compat-public-evidence-manifest-v2"
      : "stasis-compat-public-evidence-manifest-v1",
    protocol: "stasis-post-0.3-census-v1",
    harness: { repository: "oxhq/stasis-compat-bench", revision: harnessRevision },
    releaseIdentity,
    baselineInputs: publicationBaselineInputs(),
    scope: publicationScope(replayedWild.evidenceVersion),
    reportedResults: extractReportedResults(parsedJson, replayedWild.summary),
    evidence: {
      fileCount: entries.length,
      totalBytes: aggregate.totalBytes,
      treeSha256: aggregate.sha256,
      entries,
    },
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestBytes = Buffer.from(manifestText, "utf8");
  const checksumEntries = [
    ...entries,
    {
      relativePath: evidenceManifestName,
      bytes: manifestBytes.length,
      sha256: sha256Buffer(manifestBytes),
    },
  ].sort(compareEntries);
  return {
    manifest,
    checksumsText: checksumEntries
      .map((entry) => `${entry.sha256}  ${entry.relativePath}\n`)
      .join(""),
  };
}

async function assertCompleteEvidenceInventory(root, evidencePaths) {
  const ordered = [...evidencePaths].sort(comparePaths);
  if (ordered.length !== evidencePaths.length || !isDeepStrictEqual(ordered, evidencePaths)) {
    evidencePaths.sort(comparePaths);
  }
  for (const relativePath of evidencePaths) {
    if (!safeRelativePathPattern.test(relativePath) || relativePath.includes("..")) {
      throw new Error(`Publication evidence path is not canonical: ${relativePath}`);
    }
  }
  if (
    !isDeepStrictEqual(evidencePaths, exactEvidencePaths) &&
    !isDeepStrictEqual(evidencePaths, currentUrlExactEvidencePaths)
  ) {
    const expected = new Set(currentUrlExactEvidencePaths);
    const unexpected = evidencePaths.filter((relativePath) => !expected.has(relativePath));
    const missing = exactEvidencePaths.filter((relativePath) => !evidencePaths.includes(relativePath));
    if (missing.length > 0) {
      throw new Error(`Publication evidence inventory is incomplete: ${JSON.stringify(missing)}`);
    }
    if (unexpected.length > 0) {
      throw new Error(`Publication evidence inventory has unexpected files: ${JSON.stringify(unexpected)}`);
    }
    throw new Error("Publication evidence inventory differs from a supported exact path set");
  }
  const casePaths = evidencePaths.filter((relativePath) =>
    /^evidence\/wild\/cases\/[0-9]{3}-classification\.json$/u.test(relativePath));
  const rawPaths = evidencePaths.filter((relativePath) =>
    /^evidence\/wild\/raw\/[0-9]{3}-(?:baseline-gate|baseline|stasis-gate|stasis)\.json$/u
      .test(relativePath));
  if (casePaths.length !== 100 || rawPaths.length !== 400) {
    throw new Error(
      `Publication wild evidence must retain 100 case and 400 raw records; got ${casePaths.length} and ${rawPaths.length}`,
    );
  }
  await assertRealDirectory(path.join(root, "evidence"), "publication evidence directory");
}

function assertEvidenceCandidateBindings(parsedJson, identity) {
  const candidateVerification = parsedJson.get("evidence/candidate-verification.json");
  if (
    candidateVerification?.schema !== "stasis-post-support-candidate-verification-v1" ||
    candidateVerification?.status !== "passed" ||
    candidateVerification?.candidate?.schema !== "stasis-post-support-candidate-identity-v1"
  ) {
    throw new Error("Candidate verification evidence is not one passed authoritative record");
  }
  const authoritativeCandidate = candidateVerification.candidate;
  assertCandidateMatchesRelease(
    authoritativeCandidate,
    identity,
    "evidence/candidate-verification.json",
  );

  const requiredCandidateFiles = [
    "evidence/candidate-verification.json",
    "evidence/cookie-minimizers.json",
    "evidence/deterministic-comparison.json",
    "evidence/deterministic-stasis-raw.json",
    "evidence/rwa-comparison.json",
    "evidence/rwa-stasis-raw.json",
    ...(parsedJson.has("evidence/typed-terminal-minimizers.json")
      ? ["evidence/typed-terminal-minimizers.json"]
      : []),
    "evidence/wild-authority.json",
    "evidence/wild/artifact-index.json",
  ];
  for (const relativePath of requiredCandidateFiles) {
    const value = parsedJson.get(relativePath);
    if (value === undefined) throw new Error(`Required JSON evidence is absent: ${relativePath}`);
    const candidates = [];
    collectCandidateIdentities(value, candidates);
    if (candidates.length === 0) {
      throw new Error(`Evidence does not contain a bound candidate identity: ${relativePath}`);
    }
    for (const candidate of candidates) {
      assertCandidateMatchesRelease(candidate, identity, relativePath);
      if (
        !isDeepStrictEqual(
          normalizeEvidenceCandidate(candidate, relativePath),
          authoritativeCandidate,
        )
      ) {
        throw new Error(
          `Evidence candidate identity differs from authoritative candidate verification: ${relativePath}`,
        );
      }
    }
  }
}

async function assertBaselineInputBindings(root, entries, parsedJson) {
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  assertExactEvidenceEntry(
    entryByPath.get(deterministicPlaywrightBaselineContract.path),
    deterministicPlaywrightBaselineContract.projected,
    deterministicPlaywrightBaselineContract.path,
  );
  const deterministicBaseline = parsedJson.get(deterministicPlaywrightBaselineContract.path);
  if (deterministicBaseline?.schema !== "stasis-post-0.3-deterministic-playwright-raw-v1") {
    throw new Error("Publication deterministic baseline has the wrong frozen schema");
  }

  const rwaPath = "evidence/rwa-cypress-raw.json";
  assertExactEvidenceEntry(
    entryByPath.get(rwaPath),
    rwaCypressBaselineProjectionContract.projected,
    rwaPath,
  );
  const rwaBytes = await readFile(path.join(root, "evidence", "rwa-cypress-raw.json"));
  const assertedRwa = assertFrozenProjectedRwaCypressBaselineBytes(rwaBytes);
  if (!isDeepStrictEqual(assertedRwa, parsedJson.get(rwaPath))) {
    throw new Error("Publication RWA baseline parser differs from its frozen projected bytes");
  }
}

function assertComparisonReplayBindings(parsedJson) {
  const deterministicComparison = parsedJson.get("evidence/deterministic-comparison.json");
  const deterministicRaw = parsedJson.get("evidence/deterministic-stasis-raw.json");
  const deterministicBaseline = parsedJson.get("evidence/deterministic-playwright-raw.json");
  assertPostSupportDeterministicRaw(deterministicRaw);
  assertPlainObject(deterministicComparison, "publication deterministic comparison");
  assertExactKeys(deterministicComparison, [
    "behaviorallySupportedRate",
    "candidate",
    "corpusBinding",
    "counts",
    "denominator",
    "exactEquivalentRate",
    "negativeControls",
    "primaryCases",
    "protocol",
    "schema",
    "track",
  ], "publication deterministic comparison");
  if (
    deterministicComparison?.schema !== "stasis-post-support-deterministic-comparison-v1" ||
    deterministicComparison.protocol !== deterministicRaw.protocol ||
    deterministicComparison.track !== deterministicRaw.track ||
    !isDeepStrictEqual(deterministicComparison?.candidate, deterministicRaw?.candidate)
  ) {
    throw new Error("Publication deterministic comparison is not bound to its retained candidate raw");
  }
  const expectedDeterministic = replayPostSupportDeterministicComparisonClaims(
    deterministicBaseline,
    deterministicRaw,
  );
  const actualDeterministic = projectKeys(deterministicComparison, [
    "behaviorallySupportedRate",
    "corpusBinding",
    "counts",
    "denominator",
    "exactEquivalentRate",
    "negativeControls",
    "primaryCases",
  ], "deterministic comparison replay");
  if (!isDeepStrictEqual(actualDeterministic, expectedDeterministic)) {
    throw new Error("Publication deterministic comparison differs from baseline-plus-candidate replay");
  }

  const rwaComparison = parsedJson.get("evidence/rwa-comparison.json");
  const rwaRaw = parsedJson.get("evidence/rwa-stasis-raw.json");
  const rwaBaseline = parsedJson.get("evidence/rwa-cypress-raw.json");
  const cookieMinimizers = parsedJson.get("evidence/cookie-minimizers.json");
  assertPostSupportRwaRaw(rwaRaw);
  assertPostSupportRwaRuntimeBinding(rwaRaw.runtimeAuthority);
  assertPlainObject(rwaComparison, "publication RWA comparison");
  assertExactKeys(rwaComparison, [
    "behaviorallySupportedRate",
    "candidate",
    "cases",
    "corpusBinding",
    "counts",
    "denominator",
    "exactEquivalentRate",
    "protocol",
    "resolvedBoundaries",
    "schema",
    "sharedBlocker",
    "track",
  ], "publication RWA comparison");
  if (
    rwaComparison?.schema !== "stasis-post-support-rwa-comparison-v1" ||
    rwaComparison.protocol !== rwaRaw.protocol ||
    rwaComparison.track !== rwaRaw.track ||
    !isDeepStrictEqual(rwaComparison?.candidate, rwaRaw?.candidate)
  ) {
    throw new Error("Publication RWA comparison is not bound to its retained candidate raw");
  }
  const expectedRwa = replayPostSupportRwaComparisonClaims(rwaBaseline, rwaRaw);
  const actualRwa = projectKeys(rwaComparison, [
    "behaviorallySupportedRate",
    "cases",
    "corpusBinding",
    "counts",
    "denominator",
    "exactEquivalentRate",
    "sharedBlocker",
  ], "RWA comparison replay");
  if (!isDeepStrictEqual(actualRwa, expectedRwa)) {
    throw new Error("Publication RWA comparison differs from baseline-plus-candidate replay");
  }
  if (
    !isDeepStrictEqual(cookieMinimizers?.candidate, rwaRaw.candidate) ||
    !isDeepStrictEqual(
      rwaComparison.resolvedBoundaries,
      projectResolvedCookieBoundaries(cookieMinimizers),
    )
  ) {
    throw new Error("Publication RWA resolved boundaries differ from retained cookie proof");
  }
}

function assertExactEvidenceEntry(actual, expected, label) {
  if (actual?.bytes !== expected.bytes || actual?.sha256 !== expected.sha256) {
    throw new Error(`Publication baseline input differs from its frozen identity: ${label}`);
  }
}

function publicationBaselineInputs() {
  return {
    deterministicPlaywright: {
      path: deterministicPlaywrightBaselineContract.path,
      source: structuredClone(deterministicPlaywrightBaselineContract.source),
      projected: structuredClone(deterministicPlaywrightBaselineContract.projected),
      changedJsonPointers: [...deterministicPlaywrightBaselineContract.changedJsonPointers],
    },
    rwaCypress: {
      path: "evidence/rwa-cypress-raw.json",
      source: structuredClone(rwaCypressBaselineProjectionContract.source),
      projected: structuredClone(rwaCypressBaselineProjectionContract.projected),
      replacementRoot: rwaCypressBaselineProjectionContract.replacementRoot,
      changedJsonPointers: [...rwaCypressBaselineProjectionContract.changedJsonPointers],
    },
  };
}

function collectCandidateIdentities(value, found, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (
    value.schema === "stasis-post-support-candidate-identity-v1" ||
    value.schema === "stasis-post-support-wild-candidate-v1"
  ) {
    found.push(value);
  }
  for (const entry of Array.isArray(value) ? value : Object.values(value)) {
    collectCandidateIdentities(entry, found, seen);
  }
}

function normalizeEvidenceCandidate(candidate, label) {
  if (candidate.schema === "stasis-post-support-candidate-identity-v1") return candidate;
  if (candidate.schema !== "stasis-post-support-wild-candidate-v1") {
    throw new Error(`Evidence contains an unsupported candidate identity: ${label}`);
  }
  assertPlainObject(candidate.hostedSdkPackageTrain, `${label} wild package train`);
  assertExactKeys(candidate.hostedSdkPackageTrain, [
    "attemptNumber",
    "runNumber",
    "source",
  ], `${label} wild package train`);
  return {
    ...candidate,
    schema: "stasis-post-support-candidate-identity-v1",
    hostedSdkPackageTrain: {
      source: candidate.hostedSdkPackageTrain.source,
      id: candidate.hostedSdkPackageTrain.runNumber,
      attempt: candidate.hostedSdkPackageTrain.attemptNumber,
    },
  };
}

function assertCandidateMatchesRelease(candidate, identity, label) {
  const train = candidate.hostedSdkPackageTrain;
  const runId = train?.id ?? train?.runNumber;
  const runAttempt = train?.attempt ?? train?.attemptNumber;
  if (
    candidate.repository !== "oxhq/stasis" ||
    candidate.revision !== identity.release.sourceRevision ||
    candidate.version !== identity.release.version ||
    String(runId) !== identity.packageQualification.workflowRunId ||
    runAttempt !== identity.packageQualification.workflowRunAttempt ||
    candidate.sdk?.archive?.sha256 !== identity.packageQualification.sdkArchiveSha256 ||
    candidate.sdk?.archive?.bytes !== identity.packageQualification.sdkArchiveBytes
  ) {
    throw new Error(`Evidence candidate identity differs from the release identity: ${label}`);
  }
}

async function assertWildEvidenceBindings(entries, parsedJson, harnessRevision) {
  const entryByPath = new Map(entries.map((entry) => [entry.relativePath, entry]));
  const index = parsedJson.get("evidence/wild/artifact-index.json");
  const evidenceVersion = index?.schema === "stasis-wild-artifact-index-v4"
    ? 4
    : index?.schema === "stasis-wild-artifact-index-v5"
      ? 5
      : 0;
  const typedMinimizers = parsedJson.get("evidence/typed-terminal-minimizers.json");
  if (
    evidenceVersion === 0 ||
    index?.selectedCount !== 100 ||
    !Array.isArray(index?.cases) ||
    index.cases.length !== 100 ||
    index.cases.some((item) => !Array.isArray(item?.records) || item.records.length !== 5)
  ) {
    throw new Error("Wild artifact index does not bind exactly 100 cases and 500 records");
  }
  if (evidenceVersion === 4 && typedMinimizers !== undefined) {
    throw new Error("Historical v4 evidence cannot absorb successor typed-terminal minimizers");
  }
  if (evidenceVersion === 5) {
    assertTypedTerminalMinimizerResult(typedMinimizers);
    if (
      typedMinimizers.executionAuthority !== "default_verified_candidate_uninjected" ||
      typedMinimizers.wildEvidenceBinding.artifactIndexSha256 !==
        frozenPublicWildArtifactIndexSha256
    ) {
      throw new Error("Current-URL evidence lacks authoritative frozen-census minimizers");
    }
  }
  const references = [index.summary, index.identity?.pairedStart, index.identity?.networkPolicySmoke];
  for (const item of index.cases) references.push(...item.records);
  const referencedPaths = new Set();
  for (const reference of references) {
    if (
      typeof reference?.path !== "string" ||
      !sha256Pattern.test(reference?.sha256 ?? "")
    ) {
      throw new Error("Wild artifact index contains an invalid file reference");
    }
    const publicationPath = `evidence/${reference.path}`;
    const entry = entryByPath.get(publicationPath);
    if (entry?.sha256 !== reference.sha256 || referencedPaths.has(publicationPath)) {
      throw new Error(`Wild artifact reference is absent, duplicated, or changed: ${publicationPath}`);
    }
    referencedPaths.add(publicationPath);
  }
  const indexedCaseAndRaw = entries
    .map((entry) => entry.relativePath)
    .filter((relativePath) =>
      relativePath.startsWith("evidence/wild/cases/") ||
      relativePath.startsWith("evidence/wild/raw/"));
  if (indexedCaseAndRaw.some((relativePath) => !referencedPaths.has(relativePath))) {
    throw new Error("Wild publication evidence contains an unindexed case or raw record");
  }

  const authority = parsedJson.get("evidence/wild-authority.json");
  const summary = parsedJson.get("evidence/wild/summary.json");
  const indexEntry = entryByPath.get("evidence/wild/artifact-index.json");
  const expectedAuthoritySchema = evidenceVersion === 4
    ? "stasis-post-support-wild-authority-v1"
    : "stasis-post-support-wild-authority-v2";
  if (
    authority?.schema !== expectedAuthoritySchema ||
    authority?.status !== "passed" ||
    authority?.authority !== "quiescent_postflight_verified" ||
    authority?.caseCount !== 100 ||
    authority?.artifactIndexSha256 !== indexEntry?.sha256 ||
    !isDeepStrictEqual(authority?.summary, summary?.summary)
  ) {
    throw new Error("Wild authority evidence does not bind the retained artifact tree");
  }

  const [corpusBytes, preflightLedgerBytes] = await Promise.all([
    readFile(selectedCorpusPath),
    readFile(preflightLedgerPath),
  ]);
  let corpus;
  let preflightLedger;
  try {
    corpus = JSON.parse(corpusBytes.toString("utf8"));
    preflightLedger = JSON.parse(preflightLedgerBytes.toString("utf8"));
  } catch {
    throw new Error("Tracked wild corpus or preflight ledger is not valid JSON");
  }
  const recordsByPath = new Map();
  for (const item of index.cases) {
    for (const reference of item.records) {
      recordsByPath.set(reference.path, parsedJson.get(`evidence/${reference.path}`));
    }
  }
  const replay = replayPostSupportWildEvidenceClaims({
    candidateIdentity: parsedJson.get("evidence/candidate-verification.json")?.candidate,
    corpus,
    corpusPath: "corpora/wild-tranco-74V4X-v1.json",
    corpusSha256: sha256Buffer(corpusBytes),
    harnessRevision,
    index,
    pairedRun: parsedJson.get("evidence/wild/paired-start.json"),
    preflightLedger,
    preflightLedgerPath: "corpora/wild-tranco-74V4X-v1-preflight.json",
    preflightLedgerSha256: sha256Buffer(preflightLedgerBytes),
    recordsByPath,
    summaryEnvelope: summary,
  });
  const smoke = parsedJson.get("evidence/wild-network-policy-smoke.json");
  assertRetainedPostSupportWildNetworkSmoke(smoke, {
    candidate: index.identity.candidate,
    corpusSha256: index.identity.corpusSha256,
    executionAuthority: "default_verified_candidate_uninjected",
    harnessCommit: harnessRevision,
    preflightLedgerSha256: index.identity.preflightLedgerSha256,
    preregistrationCommit: index.identity.preregistrationCommit,
    runGeneration: index.identity.runGeneration,
    runtime: index.identity.runtime,
  });
  assertSmokePrecedesPairedRun(smoke, index.startedAt);
  return Object.freeze({ summary: replay.summary, evidenceVersion });
}

async function assertWildTranscriptEvidenceBindings(root, parsedJson) {
  const [transcriptBytes, authorityBytes] = await Promise.all([
    readFile(path.join(root, "evidence", "wild-stdout-transcript.log")),
    readFile(path.join(root, "evidence", "wild-authority.json")),
  ]);
  verifyWildAuthorityTranscriptEvidence({
    transcriptBytes,
    authorityBytes,
    expectedSmokeReference: parsedJson.get("evidence/wild/artifact-index.json")
      ?.identity?.networkPolicySmoke,
    receipt: parsedJson.get("evidence/wild-authority-extraction-receipt.json"),
  });
}

function extractReportedResults(parsedJson, replayedWildSummary) {
  const deterministic = parsedJson.get("evidence/deterministic-comparison.json");
  const rwa = parsedJson.get("evidence/rwa-comparison.json");
  const typedMinimizers = parsedJson.get("evidence/typed-terminal-minimizers.json");
  const wild = replayedWildSummary;
  if (
    deterministic?.schema !== "stasis-post-support-deterministic-comparison-v1" ||
    rwa?.schema !== "stasis-post-support-rwa-comparison-v1" ||
    wild === null ||
    typeof wild !== "object"
  ) {
    throw new Error("Publication result evidence has an unexpected schema");
  }
  return {
    deterministic: projectKeys(deterministic, [
      "behaviorallySupportedRate",
      "counts",
      "denominator",
      "exactEquivalentRate",
    ], "deterministic result"),
    rwa: projectKeys(rwa, [
      "behaviorallySupportedRate",
      "counts",
      "denominator",
      "exactEquivalentRate",
    ], "RWA result"),
    ...(typedMinimizers === undefined
      ? {}
      : {
        typedTerminalMinimizers: {
          claimBoundary: typedMinimizers.claimBoundary,
          executionAuthority: typedMinimizers.executionAuthority,
          processCount: typedMinimizers.rules.processCount,
          wildEvidenceBinding: structuredClone(typedMinimizers.wildEvidenceBinding),
          scenarios: typedMinimizers.scenarios.map((scenario) => ({
            id: scenario.id,
            family: scenario.family,
            construction: scenario.construction,
            causalDelta: scenario.causalDelta,
            causalContract: structuredClone(scenario.causalContract),
            fixtureBinding: structuredClone(scenario.fixtureBinding),
            control: structuredClone(scenario.control),
            treatment: structuredClone(scenario.treatment),
          })),
        },
      }),
    wild: projectKeys(wild, [
      "baselineExcluded",
      "diagnosedOrganicBlockerCount",
      "extractionCounts",
      ...(Object.hasOwn(wild, "currentUrlCounts") ? ["currentUrlCounts"] : []),
      "organicBlockerCounts",
      "organicBlockerDenominator",
      "organicIndependentOriginCounts",
      "primaryCounts",
      "sdkGapCounts",
      "selectedCount",
      "stasisAttempted",
      "validPairedDenominator",
    ], "wild result"),
  };
}

function publicationScope(evidenceVersion) {
  return {
    corpusInputsChanged: false,
    runnerSemanticsChanged: evidenceVersion === 5,
    evidenceClassificationsChanged: evidenceVersion === 5,
    performanceClaim: false,
    prevalenceClaim: false,
    generalSupportClaim: false,
  };
}

function projectKeys(value, keys, label) {
  const projected = {};
  for (const key of keys) {
    if (!(key in value)) throw new Error(`${label} is missing ${key}`);
    projected[key] = structuredClone(value[key]);
  }
  return projected;
}

function aggregateEntries(entries) {
  const hash = createHash("sha256");
  let totalBytes = 0;
  for (const entry of entries) {
    totalBytes += entry.bytes;
    hash.update(entry.relativePath, "utf8");
    hash.update("\0", "ascii");
    hash.update(String(entry.bytes), "ascii");
    hash.update("\0", "ascii");
    hash.update(entry.sha256, "ascii");
    hash.update("\n", "ascii");
  }
  return { totalBytes, sha256: hash.digest("hex") };
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listRegularFiles(root) {
  const files = [];
  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(root, ...relativeDirectory.split("/").filter(Boolean));
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => comparePaths(left.name, right.name));
    for (const entry of entries) {
      const relativePath = relativeDirectory.length === 0
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath.replaceAll("\\", "/"));
      } else {
        throw new Error(`Publication bundle contains a non-regular entry: ${relativePath}`);
      }
    }
  }
  await visit("");
  return files.sort(comparePaths);
}

async function assertRealDirectory(value, label) {
  const absolutePath = path.resolve(value);
  const metadata = await lstat(absolutePath);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !samePath(await realpath(absolutePath), absolutePath)
  ) {
    throw new Error(`${label} must be one real directory`);
  }
  return absolutePath;
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be one plain object`);
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort(comparePaths);
  const orderedExpected = [...expected].sort(comparePaths);
  if (!isDeepStrictEqual(actual, orderedExpected)) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function requiredPattern(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} must be one exact value`);
  }
}

function requiredPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be one positive safe integer`);
  }
}

function requiredExactValue(value, exact, label) {
  if (value !== exact) {
    throw new Error(`${label} must be ${exact}`);
  }
}

function requiredHttpsUrl(value, allowedHosts, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be one valid URL`);
  }
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error(`${label} must be one HTTPS URL on an allowed host`);
  }
}

function assertWorkflowIdentity(value, label) {
  requiredPattern(value.workflowRunId, runIdPattern, `${label} workflow run id`);
  requiredPositiveInteger(value.workflowRunAttempt, `${label} workflow run attempt`);
  requiredPattern(value.workflowRevision, revisionPattern, `${label} workflow revision`);
}

function compareEntries(left, right) {
  return comparePaths(left.relativePath, right.relativePath);
}

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}
