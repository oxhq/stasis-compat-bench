import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";

import { verifyPathProjectionReceipt } from "./path-projection-receipt.mjs";

const executeFile = promisify(execFile);

const revisionPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const spdxIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9.+-]*$/u;
const licensePathPattern = /^(?:COPYING(?:\.md)?|LICENSE(?:\.md)?)$/u;
const canonicalPathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const machinePathPatterns = Object.freeze([
  /(?:^|[\s"'`(=])(?:[A-Za-z]:[\\/])/mu,
  /file:\/\/(?:\/?[A-Za-z]:|\/(?:Users|home|root)\/)/iu,
  /(?:^|[\s"'`(=])\\\\[^\\/\s]+\\[^\\/\s]+/mu,
  /(?:^|[\s"'`(=])\/(?:Users|home)\/[^/\s]+(?:\/|$)/mu,
  /(?:^|[\s"'`(=])\/root(?:\/|$)/mu,
]);
const textExtensions = new Set([
  "",
  ".css",
  ".html",
  ".js",
  ".json",
  ".log",
  ".map",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const exactSourceExclusions = Object.freeze([
  Object.freeze({
    pathPrefix: "artifacts/runs/",
    reason: "historical local proof contains machine-local paths and is not v0.3.3 publication evidence",
  }),
]);

export function validatePublicProjectionManifest(value) {
  plainObject(value, "public projection manifest");
  exactKeys(value, [
    "claimBoundary",
    "history",
    "privacy",
    "projectedTree",
    "publicationChoices",
    "releaseTarget",
    "schema",
    "sourceSnapshot",
    "sourceExclusions",
    "targetRepository",
    "unchangedInputs",
  ], "public projection manifest");
  if (value.schema !== "stasis-compat-public-projection-v1") {
    throw new Error("Public projection manifest has the wrong schema");
  }
  if (value.targetRepository !== "oxhq/stasis-compat-bench") {
    throw new Error("Public projection target repository is not canonical");
  }

  plainObject(value.projectedTree, "public projection tree identity");
  exactKeys(value.projectedTree, [
    "algorithm",
    "fileCount",
    "files",
    "manifestPath",
    "sha256",
    "totalBytes",
  ], "public projection tree identity");
  if (value.projectedTree.algorithm !== "sha256-canonical-json-file-list-v1") {
    throw new Error("Public projection tree identity has the wrong algorithm");
  }
  if (value.projectedTree.manifestPath !== "PUBLIC_PROJECTION.json") {
    throw new Error("Public projection tree identity must exclude only its manifest");
  }
  if (!Array.isArray(value.projectedTree.files)) {
    throw new Error("Public projection tree identity must contain one file inventory");
  }
  validateBoundEntries(value.projectedTree.files, "projected tree file");
  if (
    value.projectedTree.files.some(
      (entry) => entry.path === value.projectedTree.manifestPath,
    )
  ) {
    throw new Error("Public projection tree inventory must exclude its self-referential manifest");
  }
  if (
    !Number.isSafeInteger(value.projectedTree.fileCount) ||
    value.projectedTree.fileCount < 0 ||
    value.projectedTree.fileCount !== value.projectedTree.files.length
  ) {
    throw new Error("Public projection tree file count differs from its inventory");
  }
  const declaredTotalBytes = value.projectedTree.files.reduce(
    (total, entry) => total + entry.bytes,
    0,
  );
  if (
    !Number.isSafeInteger(value.projectedTree.totalBytes) ||
    value.projectedTree.totalBytes < 0 ||
    !Number.isSafeInteger(declaredTotalBytes) ||
    value.projectedTree.totalBytes !== declaredTotalBytes
  ) {
    throw new Error("Public projection tree byte count differs from its inventory");
  }
  pattern(value.projectedTree.sha256, sha256Pattern, "projected tree SHA-256");
  if (value.projectedTree.sha256 !== projectedTreeDigest(value.projectedTree.files)) {
    throw new Error("Public projection tree digest differs from its inventory");
  }

  plainObject(value.sourceSnapshot, "public projection source snapshot");
  exactKeys(value.sourceSnapshot, ["revision", "tree"], "public projection source snapshot");
  pattern(value.sourceSnapshot.revision, revisionPattern, "source snapshot revision");
  pattern(value.sourceSnapshot.tree, revisionPattern, "source snapshot tree");

  if (!Array.isArray(value.sourceExclusions)) {
    throw new Error("Public projection source exclusions must be an array");
  }
  let previousExclusion = null;
  for (const entry of value.sourceExclusions) {
    plainObject(entry, "public projection source exclusion");
    exactKeys(entry, ["pathPrefix", "reason"], "public projection source exclusion");
    canonicalPathPrefix(entry.pathPrefix, "public projection source exclusion path prefix");
    if (
      previousExclusion !== null &&
      compareUtf8(previousExclusion, entry.pathPrefix) >= 0
    ) {
      throw new Error("Public projection source exclusions must be sorted and unique");
    }
    previousExclusion = entry.pathPrefix;
    if (typeof entry.reason !== "string" || entry.reason.length === 0) {
      throw new Error("Public projection source exclusion reason must be nonempty");
    }
  }
  if (!isDeepStrictEqual(value.sourceExclusions, exactSourceExclusions)) {
    throw new Error("Public projection source exclusions differ from the sole approved prefix");
  }

  plainObject(value.history, "public projection history policy");
  exactKeys(value.history, ["includeSourceHistory", "mode"], "public projection history policy");
  if (
    value.history.mode !== "fresh-root-commit" ||
    value.history.includeSourceHistory !== false
  ) {
    throw new Error("Public projection must exclude source Git history using one fresh root commit");
  }

  plainObject(value.releaseTarget, "public projection release target");
  exactKeys(
    value.releaseTarget,
    ["identityPath", "package", "version"],
    "public projection release target",
  );
  if (
    value.releaseTarget.identityPath !== "publication/release-identity.json" ||
    value.releaseTarget.package !== "@oxhq/stasis" ||
    value.releaseTarget.version !== "0.3.3"
  ) {
    throw new Error("Public projection must remain bound to @oxhq/stasis@0.3.3");
  }

  if (!Array.isArray(value.unchangedInputs) || value.unchangedInputs.length === 0) {
    throw new Error("Public projection must bind the unchanged corpus and protocol inputs");
  }
  validateBoundEntries(value.unchangedInputs, "unchanged input");

  plainObject(value.privacy, "public projection privacy policy");
  exactKeys(
    value.privacy,
    [
      "emailLiteralExceptions",
      "machinePathLiteralExceptions",
      "rejectEmailAddresses",
      "rejectMachineLocalPaths",
    ],
    "public projection privacy policy",
  );
  if (
    value.privacy.rejectEmailAddresses !== true ||
    value.privacy.rejectMachineLocalPaths !== true
  ) {
    throw new Error("Public projection privacy checks must remain fail-closed");
  }
  if (!Array.isArray(value.privacy.machinePathLiteralExceptions)) {
    throw new Error("Public projection machine-path exceptions must be an array");
  }
  validateBoundEntries(
    value.privacy.machinePathLiteralExceptions,
    "machine-path literal exception",
    { requireReason: true },
  );
  if (!Array.isArray(value.privacy.emailLiteralExceptions)) {
    throw new Error("Public projection email exceptions must be an array");
  }
  validateBoundEntries(
    value.privacy.emailLiteralExceptions,
    "email literal exception",
    { requireReason: true },
  );

  plainObject(value.claimBoundary, "public projection claim boundary");
  exactKeys(value.claimBoundary, [
    "applicationChanges",
    "correctnessBeforePerformance",
    "corpusInputsChanged",
    "fallback",
    "performanceClaim",
    "pooledSuccessRate",
    "polling",
    "protocolChanged",
    "resultCountAuthority",
    "retries",
    "rwaApiEquivalenceClaim",
    "sleeps",
    "unsupportedOutcomes",
    "wildPrevalenceClaim",
  ], "public projection claim boundary");
  const expectedBoundary = {
    applicationChanges: false,
    correctnessBeforePerformance: true,
    corpusInputsChanged: false,
    fallback: false,
    performanceClaim: false,
    pooledSuccessRate: false,
    polling: false,
    protocolChanged: false,
    resultCountAuthority: "generated_evidence_manifest",
    retries: 0,
    rwaApiEquivalenceClaim: false,
    sleeps: false,
    unsupportedOutcomes: "retained_typed_in_denominator",
    wildPrevalenceClaim: false,
  };
  if (!isDeepStrictEqual(value.claimBoundary, expectedBoundary)) {
    throw new Error("Public projection claim boundary was weakened");
  }

  plainObject(value.publicationChoices, "public projection publication choices");
  exactKeys(
    value.publicationChoices,
    ["author", "license"],
    "public projection publication choices",
  );
  validatePublicationAuthor(value.publicationChoices.author);
  validatePublicationLicense(value.publicationChoices.license);
  return value;
}

export async function verifyPublicProjectionTree({
  repositoryRoot,
  manifest,
  requireClean = true,
}) {
  validatePublicProjectionManifest(manifest);
  const root = path.resolve(repositoryRoot);
  const headRevision = (await git(root, ["rev-parse", "HEAD"])).trim();
  pattern(headRevision, revisionPattern, "prepared projection revision");
  const [
    tree,
    status,
    trackedOutput,
    historyCountOutput,
    historyRevisionsOutput,
    shallowRepositoryOutput,
    rawHeadCommit,
    headIdentityOutput,
  ] = await Promise.all([
    git(root, ["show", "-s", "--format=%T", headRevision]),
    git(root, ["status", "--porcelain=v1", "--untracked-files=all"]),
    git(root, ["ls-files", "-z"]),
    git(root, ["rev-list", "--count", headRevision]),
    git(root, ["rev-list", headRevision]),
    git(root, ["rev-parse", "--is-shallow-repository"]),
    git(root, ["cat-file", "-p", headRevision]),
    git(root, ["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce", headRevision]),
  ]);
  const headTree = tree.trim();
  const historyCommitCount = Number.parseInt(historyCountOutput.trim(), 10);
  pattern(headTree, revisionPattern, "prepared projection tree");
  if (requireClean && status.length !== 0) {
    throw new Error("Public projection verification requires one tracked-clean checkout");
  }
  if (!Number.isSafeInteger(historyCommitCount) || historyCommitCount < 1) {
    throw new Error("Public projection could not count source history");
  }
  if (shallowRepositoryOutput.trim() !== "false") {
    throw new Error("Public projection verification requires complete non-shallow history");
  }
  const historyRevisions = historyRevisionsOutput.trim().split(/\r?\n/u).filter(Boolean);
  if (
    historyRevisions.length !== historyCommitCount ||
    new Set(historyRevisions).size !== historyRevisions.length
  ) {
    throw new Error("Public projection source history enumeration is incomplete or duplicated");
  }
  for (const historyRevision of historyRevisions) {
    pattern(historyRevision, revisionPattern, "source history revision");
  }
  if (historyRevisions[0] !== headRevision) {
    throw new Error("Public projection source history is not anchored to the prepared revision");
  }
  const headParents = rawCommitParents(rawHeadCommit);
  const { sourceHistoryExcluded, sourceSnapshotVerified } =
    await verifySourceSnapshotReachability({
      repositoryRoot: root,
      historyRevisions,
      sourceSnapshot: manifest.sourceSnapshot,
    });

  const [
    headAuthorName,
    headAuthorEmail,
    headCommitterName,
    headCommitterEmail,
    ...unexpectedIdentityFields
  ] = headIdentityOutput
    .replace(/\r?\n$/u, "")
    .split("\0");
  if (
    unexpectedIdentityFields.length !== 0 ||
    typeof headAuthorName !== "string" ||
    typeof headAuthorEmail !== "string" ||
    typeof headCommitterName !== "string" ||
    typeof headCommitterEmail !== "string"
  ) {
    throw new Error("Public projection could not read the root commit identities");
  }

  const trackedPaths = trackedOutput.split("\0").filter(Boolean);
  trackedPaths.sort(compareUtf8);
  const trackedSet = new Set(trackedPaths);
  if (trackedSet.has(".git") || [...trackedSet].some((entry) => entry.startsWith(".git/"))) {
    throw new Error("Public projection must never track Git metadata");
  }
  let headWorktreeIdentityVerified = false;
  if (requireClean) {
    const [headEntriesOutput, objectFormatOutput] = await Promise.all([
      git(root, ["ls-tree", "-r", "-z", "--full-tree", headRevision]),
      git(root, ["rev-parse", "--show-object-format"]),
    ]);
    await assertHeadWorktreeIdentity({
      root,
      trackedPaths,
      headEntriesOutput,
      objectFormat: objectFormatOutput.trim(),
    });
    headWorktreeIdentityVerified = true;
  }

  const excludedPaths = trackedPaths.filter((entry) =>
    manifest.sourceExclusions.some(({ pathPrefix }) => entry.startsWith(pathPrefix)),
  );
  const projectedPaths = trackedPaths.filter((entry) => !excludedPaths.includes(entry));
  const projectedSet = new Set(projectedPaths);
  if (!projectedSet.has(manifest.projectedTree.manifestPath)) {
    throw new Error("Public projection manifest is not one tracked projected file");
  }
  const trackedManifestText = await readFile(
    path.join(root, ...manifest.projectedTree.manifestPath.split("/")),
    "utf8",
  );
  const trackedManifest = JSON.parse(trackedManifestText);
  if (!isDeepStrictEqual(trackedManifest, manifest)) {
    throw new Error("Verified public projection manifest differs from the tracked manifest");
  }
  if (trackedManifestText !== `${JSON.stringify(trackedManifest, null, 2)}\n`) {
    throw new Error("Tracked public projection manifest is not canonical pretty JSON");
  }
  const actualProjectedInventoryPaths = projectedPaths.filter(
    (entry) => entry !== manifest.projectedTree.manifestPath,
  );
  const declaredProjectedInventoryPaths = manifest.projectedTree.files.map(
    (entry) => entry.path,
  );
  if (
    JSON.stringify(actualProjectedInventoryPaths) !==
    JSON.stringify(declaredProjectedInventoryPaths)
  ) {
    throw new Error("Public projection tracked files differ from its complete inventory");
  }
  const machinePathExceptions = new Map(
    manifest.privacy.machinePathLiteralExceptions.map((entry) => [entry.path, entry]),
  );
  const emailExceptions = new Map(
    manifest.privacy.emailLiteralExceptions.map((entry) => [entry.path, entry]),
  );
  const usedMachinePathExceptions = new Set();
  const usedEmailExceptions = new Set();
  let scannedTextFileCount = 0;
  for (const relativePath of projectedPaths) {
    canonicalPath(relativePath, "tracked public projection path");
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Public projection contains a non-regular tracked entry: ${relativePath}`);
    }
    if (!isTextPath(relativePath)) continue;
    scannedTextFileCount += 1;
    const bytes = await readFile(absolutePath);
    const text = decodeUtf8(bytes, relativePath);
    assertPublicProjectionText({
      bytes,
      emailException: emailExceptions.get(relativePath),
      machinePathException: machinePathExceptions.get(relativePath),
      relativePath,
      text:
        relativePath === manifest.projectedTree.manifestPath
          ? publicProjectionManifestPrivacyText(text, manifest)
          : text,
    });
    if (machinePathExceptions.has(relativePath)) usedMachinePathExceptions.add(relativePath);
    if (emailExceptions.has(relativePath)) usedEmailExceptions.add(relativePath);
  }
  for (const exceptionPath of machinePathExceptions.keys()) {
    if (!projectedSet.has(exceptionPath)) {
      throw new Error(`Public projection machine-path exception is not tracked: ${exceptionPath}`);
    }
    if (!usedMachinePathExceptions.has(exceptionPath)) {
      throw new Error(`Public projection machine-path exception is stale: ${exceptionPath}`);
    }
  }
  for (const exceptionPath of emailExceptions.keys()) {
    if (!projectedSet.has(exceptionPath)) {
      throw new Error(`Public projection email exception is not tracked: ${exceptionPath}`);
    }
    if (!usedEmailExceptions.has(exceptionPath)) {
      throw new Error(`Public projection email exception is stale: ${exceptionPath}`);
    }
  }

  for (const entry of manifest.projectedTree.files) {
    await assertBoundFile(root, entry, "projected tree file");
  }

  const expectedInputs = projectedPaths.filter(
    (entry) => entry.startsWith("corpora/") || entry.startsWith("protocol/"),
  );
  const declaredInputs = manifest.unchangedInputs.map((entry) => entry.path);
  if (JSON.stringify(expectedInputs) !== JSON.stringify(declaredInputs)) {
    throw new Error("Public projection unchanged-input inventory differs from tracked corpora/protocols");
  }
  for (const entry of manifest.unchangedInputs) {
    await assertBoundFile(root, entry, "unchanged corpus/protocol input");
  }

  const identity = JSON.parse(
    await readFile(path.join(root, ...manifest.releaseTarget.identityPath.split("/")), "utf8"),
  );
  if (
    identity?.release?.version !== manifest.releaseTarget.version ||
    identity?.registry?.package !== manifest.releaseTarget.package ||
    identity?.registry?.version !== manifest.releaseTarget.version
  ) {
    throw new Error("Public projection release identity differs from its declared target");
  }

  const pathProjectionReceipt = await verifyPathProjectionReceipt({ root });
  assertProjectionReceiptSource(manifest, pathProjectionReceipt);


  const authorChoiceSelected = manifest.publicationChoices.author !== null;
  const rootAuthorMatchesChoice =
    authorChoiceSelected &&
    manifest.publicationChoices.author.name === headAuthorName &&
    manifest.publicationChoices.author.email === headAuthorEmail;
  const rootCommitterMatchesChoice =
    authorChoiceSelected &&
    manifest.publicationChoices.author.name === headCommitterName &&
    manifest.publicationChoices.author.email === headCommitterEmail;
  const licenseChoiceSelected = manifest.publicationChoices.license !== null;
  let licenseBytesMatchChoice = false;
  if (licenseChoiceSelected) {
    const license = manifest.publicationChoices.license;
    if (!projectedSet.has(license.path)) {
      throw new Error("Selected publication license is not one tracked projected file");
    }
    await assertBoundFile(root, license, "selected publication license");
    licenseBytesMatchChoice = true;
  }

  return Object.freeze({
    schema: "stasis-compat-public-projection-verification-v1",
    status: "passed",
    headRevision,
    headTree,
    headWorktreeIdentityVerified,
    sourceTrackedFileCount: trackedPaths.length,
    projectedTrackedFileCount: projectedPaths.length,
    sourceExcludedFileCount: excludedPaths.length,
    sourceExclusionsAbsent: excludedPaths.length === 0,
    scannedTextFileCount,
    unchangedInputCount: manifest.unchangedInputs.length,
    machinePathLiteralExceptionCount: machinePathExceptions.size,
    emailLiteralExceptionCount: emailExceptions.size,
    sourceHistoryCommitCount: historyCommitCount,
    rawHeadParentCount: headParents.length,
    sourceHistoryExcluded,
    sourceSnapshotVerified,
    freshRootCommitRequired: !sourceHistoryExcluded,
    freshProjectionRequired: !sourceHistoryExcluded || excludedPaths.length !== 0,
    projectedTreeSha256: manifest.projectedTree.sha256,
    projectedTreeFileCount: manifest.projectedTree.fileCount,
    projectedTreeBytes: manifest.projectedTree.totalBytes,
    pathProjectionReceiptVerified: true,
    pathProjectionSourceRevisionAvailable:
      pathProjectionReceipt.sourceRevisionAvailable,
    pathProjectionJsonPointerCount: pathProjectionReceipt.jsonProjectionCount,
    pathProjectionLogLineCount: pathProjectionReceipt.logProjectionCount,
    pathProjectionArtifactIndexCount: pathProjectionReceipt.artifactIndexCount,
    pathProjectionDecisionBindingCount: pathProjectionReceipt.decisionBindingCount,
    authorChoiceSelected,
    rootAuthorMatchesChoice,
    rootCommitterMatchesChoice,
    licenseChoiceSelected,
    licenseBytesMatchChoice,
    metadataChoicesComplete:
      rootAuthorMatchesChoice &&
      rootCommitterMatchesChoice &&
      licenseBytesMatchChoice,
  });
}

export async function verifySourceSnapshotReachability({
  repositoryRoot,
  historyRevisions,
  sourceSnapshot,
}) {
  if (!Array.isArray(historyRevisions) || historyRevisions.length === 0) {
    throw new Error("Public projection source history must be one nonempty revision list");
  }
  for (const historyRevision of historyRevisions) {
    pattern(historyRevision, revisionPattern, "source history revision");
  }
  pattern(sourceSnapshot?.revision, revisionPattern, "source snapshot revision");
  pattern(sourceSnapshot?.tree, revisionPattern, "source snapshot tree");
  if (!historyRevisions.includes(sourceSnapshot.revision)) {
    return Object.freeze({
      sourceHistoryExcluded: true,
      sourceSnapshotVerified: false,
    });
  }
  const sourceSnapshotTree = (
    await git(path.resolve(repositoryRoot), [
      "show",
      "-s",
      "--format=%T",
      sourceSnapshot.revision,
    ])
  ).trim();
  if (sourceSnapshotTree !== sourceSnapshot.tree) {
    throw new Error("Public projection source snapshot tree differs from its declaration");
  }
  return Object.freeze({
    sourceHistoryExcluded: false,
    sourceSnapshotVerified: true,
  });
}

export function assertPublicProjectionText({
  bytes,
  emailException,
  machinePathException,
  relativePath,
  text,
}) {
  const actualSha256 = sha256(bytes);
  if (emailPattern.test(text)) {
    if (emailException === undefined) {
      throw new Error(`Public projection text contains an unreviewed email address: ${relativePath}`);
    }
    if (emailException.sha256 !== actualSha256) {
      throw new Error(`Public projection email exception bytes changed: ${relativePath}`);
    }
    if (emailException.bytes !== bytes.length) {
      throw new Error(`Public projection email exception size changed: ${relativePath}`);
    }
  } else if (emailException !== undefined) {
    throw new Error(`Public projection email exception is stale: ${relativePath}`);
  }
  const hasMachinePath = machinePathPatterns.some((pattern) => pattern.test(text));
  if (!hasMachinePath) {
    if (machinePathException !== undefined) {
      throw new Error(`Public projection machine-path exception is stale: ${relativePath}`);
    }
    return text;
  }
  if (machinePathException === undefined) {
    throw new Error(`Public projection text contains an unreviewed machine-local path: ${relativePath}`);
  }
  if (machinePathException.sha256 !== actualSha256) {
    throw new Error(`Public projection machine-path exception bytes changed: ${relativePath}`);
  }
  if (machinePathException.bytes !== bytes.length) {
    throw new Error(`Public projection machine-path exception size changed: ${relativePath}`);
  }
  return text;
}

export function publicProjectionManifestPrivacyText(text, manifest) {
  const parsed = JSON.parse(text);
  if (!isDeepStrictEqual(parsed, manifest)) {
    throw new Error("Public projection privacy scan input differs from its manifest");
  }
  if (parsed.publicationChoices.author === null) return text;
  parsed.publicationChoices.author.email = "<selected-public-commit-email>";
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function assertProjectionReceiptSource(manifest, receipt) {
  if (receipt.sourceRevision !== manifest.sourceSnapshot.revision) {
    throw new Error("Path projection receipt source differs from the projection source snapshot");
  }
}

async function assertHeadWorktreeIdentity({
  root,
  trackedPaths,
  headEntriesOutput,
  objectFormat,
}) {
  if (objectFormat !== "sha1" && objectFormat !== "sha256") {
    throw new Error("Public projection repository uses an unsupported Git object format");
  }
  const entries = headEntriesOutput.split("\0").filter(Boolean).map((record) => {
    const tab = record.indexOf("\t");
    if (tab < 0) throw new Error("Public projection HEAD tree record is malformed");
    const [mode, type, objectId, ...unexpected] = record.slice(0, tab).split(" ");
    const entryPath = record.slice(tab + 1);
    if (
      unexpected.length !== 0 ||
      type !== "blob" ||
      (mode !== "100644" && mode !== "100755") ||
      !new RegExp(`^[a-f0-9]{${objectFormat === "sha1" ? 40 : 64}}$`, "u").test(objectId)
    ) {
      throw new Error(`Public projection HEAD contains a non-regular entry: ${entryPath}`);
    }
    canonicalPath(entryPath, "HEAD tree path");
    return { objectId, path: entryPath };
  });
  entries.sort((left, right) => compareUtf8(left.path, right.path));
  if (
    JSON.stringify(entries.map((entry) => entry.path)) !==
    JSON.stringify(trackedPaths)
  ) {
    throw new Error("Public projection HEAD tree differs from the tracked-file inventory");
  }
  for (const entry of entries) {
    const target = path.join(root, ...entry.path.split("/"));
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Public projection worktree entry is not regular: ${entry.path}`);
    }
    const bytes = await readFile(target);
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    const worktreeObjectId = createHash(objectFormat)
      .update(header)
      .update(bytes)
      .digest("hex");
    if (worktreeObjectId !== entry.objectId) {
      throw new Error(`Public projection HEAD blob differs from worktree bytes: ${entry.path}`);
    }
  }
}

async function assertBoundFile(root, entry, label) {
  const absolutePath = path.join(root, ...entry.path.split("/"));
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} is not one regular file: ${entry.path}`);
  }
  const bytes = await readFile(absolutePath);
  if (metadata.size !== entry.bytes || sha256(bytes) !== entry.sha256) {
    throw new Error(`${label} bytes changed: ${entry.path}`);
  }
}

function validateBoundEntries(entries, label, { requireReason = false } = {}) {
  let previous = null;
  for (const entry of entries) {
    plainObject(entry, label);
    exactKeys(
      entry,
      requireReason ? ["bytes", "path", "reason", "sha256"] : ["bytes", "path", "sha256"],
      label,
    );
    canonicalPath(entry.path, `${label} path`);
    if (previous !== null && compareUtf8(previous, entry.path) >= 0) {
      throw new Error(`${label} paths must be sorted and unique by UTF-8 bytes`);
    }
    previous = entry.path;
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`${label} bytes must be a non-negative safe integer`);
    }
    pattern(entry.sha256, sha256Pattern, `${label} SHA-256`);
    if (requireReason && (typeof entry.reason !== "string" || entry.reason.length === 0)) {
      throw new Error(`${label} reason must be nonempty`);
    }
  }
}

function canonicalPath(value, label) {
  if (
    typeof value !== "string" ||
    !canonicalPathPattern.test(value) ||
    value.includes("\\") ||
    path.posix.normalize(value) !== value
  ) {
    throw new Error(`${label} is not one canonical repository-relative path`);
  }
  return value;
}

function canonicalPathPrefix(value, label) {
  if (typeof value !== "string" || !value.endsWith("/")) {
    throw new Error(`${label} must end in one slash`);
  }
  canonicalPath(value.slice(0, -1), label);
  return value;
}

function isTextPath(relativePath) {
  const basename = path.posix.basename(relativePath);
  return basename.startsWith(".") || textExtensions.has(path.posix.extname(relativePath).toLowerCase());
}

function decodeUtf8(bytes, relativePath) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`Public projection text is not valid UTF-8: ${relativePath}`, { cause: error });
  }
}

async function git(repositoryRoot, args) {
  const { stdout } = await executeFile("git", ["--no-replace-objects", ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function projectedTreeDigest(entries) {
  const canonicalEntries = entries.map(({ bytes, path: entryPath, sha256: entrySha256 }) => ({
    bytes,
    path: entryPath,
    sha256: entrySha256,
  }));
  return sha256(Buffer.from(`${JSON.stringify(canonicalEntries)}\n`, "utf8"));
}

export function rawCommitParents(rawCommit) {
  if (typeof rawCommit !== "string") {
    throw new Error("Raw commit object must be text");
  }
  const header = rawCommit.split(/\r?\n\r?\n/u, 1)[0];
  const parents = header
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("parent "))
    .map((line) => line.slice("parent ".length));
  for (const parent of parents) pattern(parent, revisionPattern, "raw commit parent");
  return parents;
}

export function isCanonicalPublicRemoteUrl(value) {
  return typeof value === "string" && [
    /^https:\/\/github\.com\/oxhq\/stasis-compat-bench(?:\.git)?$/u,
    /^git@github\.com:oxhq\/stasis-compat-bench(?:\.git)?$/u,
    /^ssh:\/\/git@github\.com\/oxhq\/stasis-compat-bench(?:\.git)?$/u,
  ].some((expected) => expected.test(value));
}

export async function hasCanonicalPublicRemote(repositoryRoot) {
  try {
    const [fetchOutput, pushOutput] = await Promise.all([
      git(repositoryRoot, ["remote", "get-url", "--all", "origin"]),
      git(repositoryRoot, ["remote", "get-url", "--push", "--all", "origin"]),
    ]);
    const fetchUrls = fetchOutput.split(/\r?\n/u).filter(Boolean);
    const pushUrls = pushOutput.split(/\r?\n/u).filter(Boolean);
    return (
      fetchUrls.length > 0 &&
      pushUrls.length > 0 &&
      [...fetchUrls, ...pushUrls].every(isCanonicalPublicRemoteUrl)
    );
  } catch (error) {
    if (typeof error?.code === "number") return false;
    throw error;
  }
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort(compareUtf8);
  const sortedExpected = [...expected].sort(compareUtf8);
  if (JSON.stringify(actual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function plainObject(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function pattern(value, expected, label) {
  if (typeof value !== "string" || !expected.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function validatePublicationAuthor(value) {
  if (value === null) return;
  plainObject(value, "publication author choice");
  exactKeys(value, ["email", "name"], "publication author choice");
  for (const [field, fieldValue] of Object.entries(value)) {
    if (
      typeof fieldValue !== "string" ||
      fieldValue.length === 0 ||
      /[\0\r\n]/u.test(fieldValue)
    ) {
      throw new Error(`publication author ${field} must be one nonempty string`);
    }
  }
  if (!emailPattern.test(value.email) || value.email.match(emailPattern)?.[0] !== value.email) {
    throw new Error("Publication author email is invalid");
  }
}

function validatePublicationLicense(value) {
  if (value === null) return;
  plainObject(value, "publication license choice");
  exactKeys(
    value,
    ["bytes", "path", "sha256", "spdxId"],
    "publication license choice",
  );
  canonicalPath(value.path, "publication license path");
  if (!licensePathPattern.test(value.path)) {
    throw new Error("Publication license path must be one conventional top-level license file");
  }
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1) {
    throw new Error("Publication license bytes must be one positive safe integer");
  }
  pattern(value.sha256, sha256Pattern, "publication license SHA-256");
  pattern(value.spdxId, spdxIdentifierPattern, "publication license SPDX identifier");
}
