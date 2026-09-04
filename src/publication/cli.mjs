import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPublicationReleaseArtifacts,
  verifyPublicationReleaseArtifacts,
} from "./archive.mjs";
import {
  buildPublicationEvidence,
  validatePublicationReleaseIdentity,
  verifyPublicationEvidence,
} from "./evidence-manifest.mjs";
import {
  hasCanonicalPublicRemote,
  verifyPublicProjectionTree,
} from "./public-projection.mjs";
import { requirePublicPublicationSource } from "./source-readiness.mjs";
import { projectFrozenRwaCypressBaselineBytes } from "./rwa-baseline.mjs";
import { extractWildAuthorityTranscript } from "./wild-transcript.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const identityPath = path.join(repositoryRoot, "publication", "release-identity.json");
const projectionPath = path.join(repositoryRoot, "PUBLIC_PROJECTION.json");
const command = process.argv[2];

if (command === "extract-wild-authority") {
  const receipt = await extractWildAuthorityTranscript({
    transcriptPath: requiredAbsolutePath(process.argv[3], "wild stdout transcript"),
    authorityOutputPath: requiredAbsolutePath(process.argv[4], "wild authority output"),
    receiptPath: requiredAbsolutePath(
      process.argv[5],
      "wild transcript extraction receipt",
    ),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} else if (command === "project-rwa-baseline") {
  const sourcePath = requiredAbsolutePath(process.argv[3], "frozen RWA Cypress baseline");
  const outputPath = requiredAbsolutePath(
    process.argv[4],
    "projected RWA Cypress baseline output",
  );
  if (samePath(sourcePath, outputPath)) {
    throw new Error("RWA baseline projection source and output must be distinct paths");
  }
  const projection = projectFrozenRwaCypressBaselineBytes(await readFile(sourcePath));
  await writeFile(outputPath, projection.bytes, { flag: "wx", mode: 0o644 });
  process.stdout.write(`${JSON.stringify({
    ...projection.receipt,
    outputPath,
  }, null, 2)}\n`);
} else if (command === "plan") {
  const [identity, projectionManifest] = await Promise.all([
    loadReleaseIdentity(),
    loadProjectionManifest(),
  ]);
  validatePublicationReleaseIdentity(identity);
  const [canonicalPublicRemoteConfigured, projection] = await Promise.all([
    hasCanonicalPublicRemote(repositoryRoot),
    verifyPublicProjectionTree({ repositoryRoot, manifest: projectionManifest }),
  ]);
  const repositoryPublicationReady =
    identity.status === "qualified" &&
    canonicalPublicRemoteConfigured &&
    projection.status === "passed" &&
    projection.headWorktreeIdentityVerified &&
    projection.sourceHistoryCommitCount === 1 &&
    projection.rawHeadParentCount === 0 &&
    projection.sourceHistoryExcluded &&
    projection.sourceExclusionsAbsent &&
    projection.metadataChoicesComplete;
  process.stdout.write(`${JSON.stringify({
    schema: "stasis-compat-publication-plan-check-v1",
    status: "passed",
    target: `${identity.registry.package}@${identity.registry.version}`,
    identityStatus: identity.status,
    manifestBuildReady: repositoryPublicationReady,
    licenseChoiceSelected: projection.licenseChoiceSelected,
    licenseBytesMatchChoice: projection.licenseBytesMatchChoice,
    authorChoiceSelected: projection.authorChoiceSelected,
    rootAuthorMatchesChoice: projection.rootAuthorMatchesChoice,
    rootCommitterMatchesChoice: projection.rootCommitterMatchesChoice,
    canonicalPublicRemoteConfigured,
    projectionPreparationVerified: projection.status === "passed",
    projectionTreeReady:
      projection.status === "passed" && projection.sourceExclusionsAbsent,
    freshRootCommitReady: projection.sourceHistoryExcluded,
    sourceExclusionsAbsent: projection.sourceExclusionsAbsent,
    metadataChoicesComplete: projection.metadataChoicesComplete,
    repositoryPublicationReady,
  }, null, 2)}\n`);
} else if (command === "projection") {
  const projection = await verifyPublicProjectionTree({
    repositoryRoot,
    manifest: await loadProjectionManifest(),
  });
  process.stdout.write(`${JSON.stringify(projection, null, 2)}\n`);
} else if (command === "build") {
  const publicationRoot = requiredAbsolutePath(process.argv[3], "publication root");
  const { harnessRevision, identity } = await loadQualifiedPublicationBindings();
  const result = await buildPublicationEvidence({
    publicationRoot,
    releaseIdentity: identity,
    harnessRevision,
  });
  process.stdout.write(`${JSON.stringify({
    schema: "stasis-compat-publication-manifest-build-v1",
    status: "passed",
    harnessRevision,
    manifestSha256: result.manifestSha256,
    checksumsSha256: result.checksumsSha256,
    evidenceFileCount: result.manifest.evidence.fileCount,
    evidenceBytes: result.manifest.evidence.totalBytes,
  }, null, 2)}\n`);
} else if (command === "verify") {
  const publicationRoot = requiredAbsolutePath(process.argv[3], "publication root");
  const { harnessRevision, identity } = await loadQualifiedPublicationBindings();
  const result = await verifyPublicationEvidence(publicationRoot, {
    expectedHarnessRevision: harnessRevision,
    expectedReleaseIdentity: identity,
  });
  process.stdout.write(`${JSON.stringify({
    schema: "stasis-compat-publication-manifest-verification-v1",
    status: "passed",
    ...result,
  }, null, 2)}\n`);
} else if (command === "archive") {
  const publicationRoot = requiredAbsolutePath(process.argv[3], "publication root");
  const outputDirectory = requiredAbsolutePath(
    process.argv[4],
    "publication release output directory",
  );
  const { harnessRevision, identity } = await loadQualifiedPublicationBindings();
  const result = await buildPublicationReleaseArtifacts({
    publicationRoot,
    outputDirectory,
    expectedHarnessRevision: harnessRevision,
    expectedReleaseIdentity: identity,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (command === "archive-verify") {
  const packageDirectory = requiredAbsolutePath(
    process.argv[3],
    "downloaded package directory",
  );
  const extractionDirectory = requiredAbsolutePath(
    process.argv[4],
    "publication release extraction directory",
  );
  const { harnessRevision, identity } = await loadQualifiedPublicationBindings();
  const result = await verifyPublicationReleaseArtifacts({
    packageDirectory,
    extractionDirectory,
    expectedHarnessRevision: harnessRevision,
    expectedReleaseIdentity: identity,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  throw new Error(
    "Usage: node src/publication/cli.mjs extract-wild-authority <absolute-transcript> <absolute-authority-output> <absolute-receipt-output>|project-rwa-baseline <absolute-source> <absolute-output>|plan|projection|build <absolute-publication-root>|verify <absolute-publication-root>|archive <absolute-publication-root> <absolute-output-directory>|archive-verify <absolute-package-directory> <absolute-extraction-directory>",
  );
}

async function loadQualifiedPublicationBindings() {
  const [identity, projectionManifest] = await Promise.all([
    loadReleaseIdentity(),
    loadProjectionManifest(),
  ]);
  validatePublicationReleaseIdentity(identity, { requireComplete: true });
  const [canonicalPublicRemoteConfigured, projection] = await Promise.all([
    hasCanonicalPublicRemote(repositoryRoot),
    verifyPublicProjectionTree({ repositoryRoot, manifest: projectionManifest }),
  ]);
  return {
    harnessRevision: requirePublicPublicationSource({
      canonicalPublicRemoteConfigured,
      projection,
    }),
    identity,
  };
}

async function loadReleaseIdentity() {
  try {
    return JSON.parse(await readFile(identityPath, "utf8"));
  } catch (error) {
    throw new Error("Publication release identity is absent or invalid JSON", { cause: error });
  }
}

async function loadProjectionManifest() {
  try {
    return JSON.parse(await readFile(projectionPath, "utf8"));
  } catch (error) {
    throw new Error("Public projection manifest is absent or invalid JSON", { cause: error });
  }
}

function requiredAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  return path.resolve(value);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
