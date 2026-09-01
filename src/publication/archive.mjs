import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  evidenceChecksumsName,
  evidenceManifestName,
  validatePublicationReleaseIdentity,
  verifyPublicationEvidence,
} from "./evidence-manifest.mjs";

const revisionPattern = /^[a-f0-9]{40}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const safeRelativePathPattern = /^[A-Za-z0-9._/-]+$/u;
const tarBlockBytes = 512;
const tarEndBytes = tarBlockBytes * 2;
const tarFileMode = 0o644;
const maximumTarFileBytes = Number.parseInt("77777777777", 8);
const copyChunkBytes = 1024 * 1024;

export const publicationReleaseContract = deepFreeze({
  schema: "stasis-compat-publication-release-contract-v1",
  archive: {
    format: "posix-ustar-uncompressed-v1",
    name: "stasis-compat-bench-v0.3.3-evidence.tar",
    root: "stasis-compat-bench-v0.3.3-evidence",
    mediaType: "application/x-tar",
    blockBytes: tarBlockBytes,
    endBlockCount: 2,
    fileMode: tarFileMode,
    uid: 0,
    gid: 0,
    mtimeSeconds: 0,
  },
  report: {
    name: "report.md",
    mediaType: "text/markdown",
  },
  checksums: {
    name: "SHA256SUMS.txt",
    mediaType: "text/plain",
  },
  release: {
    tag: "stasis-v0.3.3-evidence",
    name: "Stasis v0.3.3 compatibility evidence",
    draftBeforePublication: true,
    prerelease: false,
    makeLatest: false,
  },
  assetNames: [
    "stasis-compat-bench-v0.3.3-evidence.tar",
    "report.md",
    "SHA256SUMS.txt",
  ],
});

export async function buildPublicationReleaseArtifacts({
  publicationRoot,
  outputDirectory,
  expectedHarnessRevision,
  expectedReleaseIdentity,
}) {
  const expected = normalizeExpectedBindings({
    expectedHarnessRevision,
    expectedReleaseIdentity,
  });
  const root = await assertRealDirectory(publicationRoot, "publication root");
  const output = await assertFreshDirectoryTarget(
    outputDirectory,
    "publication release output directory",
    [root],
  );
  const evidenceVerification = await verifyPublicationEvidence(root, {
    expectedHarnessRevision: expected.harnessRevision,
    expectedReleaseIdentity: expected.releaseIdentity,
  });
  const { manifest, manifestBytes, checksumsBytes } = await loadBoundPublicationManifest(
    root,
    expected,
  );
  const expectedEntries = expectedPublicationEntries({
    checksumsBytes,
    evidenceVerification,
    manifest,
    manifestBytes,
  });
  const actualPaths = await listRegularFiles(root);
  assertExactPaths(actualPaths, expectedEntries.map((entry) => entry.relativePath), "publication root");

  await mkdir(output, { mode: 0o755 });
  const archivePath = path.join(output, publicationReleaseContract.archive.name);
  const archive = await writeCanonicalTar({
    archivePath,
    entries: expectedEntries,
    sourceRoot: root,
  });
  assertExactEntryBindings(archive.entries, expectedEntries, "created publication archive");

  const reportBytes = renderPublicationReport({ archive, evidenceVerification, manifest });
  const report = Object.freeze({
    bytes: reportBytes.length,
    name: publicationReleaseContract.report.name,
    sha256: sha256Buffer(reportBytes),
  });
  await writeFile(path.join(output, report.name), reportBytes, {
    flag: "wx",
    mode: tarFileMode,
  });

  const releaseChecksumsBytes = renderReleaseChecksums({ archive, report });
  const releaseChecksums = Object.freeze({
    bytes: releaseChecksumsBytes.length,
    name: publicationReleaseContract.checksums.name,
    sha256: sha256Buffer(releaseChecksumsBytes),
  });
  await writeFile(path.join(output, releaseChecksums.name), releaseChecksumsBytes, {
    flag: "wx",
    mode: tarFileMode,
  });

  return deepFreeze({
    schema: "stasis-compat-publication-release-artifacts-v1",
    status: "passed",
    outputDirectory: output,
    harnessRevision: expected.harnessRevision,
    archive: publicAssetResult(archive),
    report,
    releaseChecksums,
    evidence: evidenceVerification,
  });
}

export async function verifyPublicationReleaseArtifacts({
  packageDirectory,
  extractionDirectory,
  expectedHarnessRevision,
  expectedReleaseIdentity,
}) {
  const expected = normalizeExpectedBindings({
    expectedHarnessRevision,
    expectedReleaseIdentity,
  });
  const packageRoot = await assertRealDirectory(packageDirectory, "downloaded package directory");
  const extraction = await assertFreshDirectoryTarget(
    extractionDirectory,
    "publication release extraction directory",
    [packageRoot],
  );
  await assertExactPackageAssets(packageRoot);

  const archivePath = path.join(packageRoot, publicationReleaseContract.archive.name);
  const reportPath = path.join(packageRoot, publicationReleaseContract.report.name);
  const releaseChecksumsPath = path.join(
    packageRoot,
    publicationReleaseContract.checksums.name,
  );
  const [archiveFile, reportBytes, releaseChecksumsBytes] = await Promise.all([
    sha256FileWithSize(archivePath),
    readFile(reportPath),
    readFile(releaseChecksumsPath),
  ]);
  const report = Object.freeze({
    bytes: reportBytes.length,
    name: publicationReleaseContract.report.name,
    sha256: sha256Buffer(reportBytes),
  });
  const archiveAsset = Object.freeze({
    ...archiveFile,
    name: publicationReleaseContract.archive.name,
  });
  const expectedReleaseChecksums = renderReleaseChecksums({
    archive: archiveAsset,
    report,
  });
  if (!releaseChecksumsBytes.equals(expectedReleaseChecksums)) {
    throw new Error("Publication release SHA256SUMS.txt is not canonical for the exact assets");
  }

  const parsedArchive = await parseCanonicalTar(archivePath);
  if (
    parsedArchive.bytes !== archiveAsset.bytes ||
    parsedArchive.sha256 !== archiveAsset.sha256
  ) {
    throw new Error("Publication archive parser observed different archive bytes");
  }
  const archiveEntries = parsedArchive.entries.map((entry) => ({
    bytes: entry.bytes,
    relativePath: entry.relativePath,
    sha256: entry.sha256,
  }));
  const manifestEntry = requiredArchiveEntry(parsedArchive.entries, evidenceManifestName);
  const checksumsEntry = requiredArchiveEntry(parsedArchive.entries, evidenceChecksumsName);
  const [manifestBytes, internalChecksumsBytes] = await Promise.all([
    readArchiveEntryBytes(archivePath, manifestEntry),
    readArchiveEntryBytes(archivePath, checksumsEntry),
  ]);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Publication archive evidence manifest is not valid JSON");
  }
  assertManifestBindings(manifest, expected);
  const evidenceVerification = evidenceVerificationFromArchive({
    internalChecksumsBytes,
    manifest,
    manifestBytes,
  });
  const expectedEntries = expectedPublicationEntries({
    checksumsBytes: internalChecksumsBytes,
    evidenceVerification,
    manifest,
    manifestBytes,
  });
  assertExactEntryBindings(archiveEntries, expectedEntries, "downloaded publication archive");

  const expectedReportBytes = renderPublicationReport({
    archive: archiveAsset,
    evidenceVerification,
    manifest,
  });
  if (!reportBytes.equals(expectedReportBytes)) {
    throw new Error("Publication release report differs from the exact archive evidence");
  }

  await mkdir(extraction, { mode: 0o755 });
  const extractedPublicationRoot = path.join(
    extraction,
    publicationReleaseContract.archive.root,
  );
  await mkdir(extractedPublicationRoot, { mode: 0o755 });
  await extractCanonicalTar({
    archivePath,
    entries: parsedArchive.entries,
    publicationRoot: extractedPublicationRoot,
  });
  const extractedVerification = await verifyPublicationEvidence(extractedPublicationRoot, {
    expectedHarnessRevision: expected.harnessRevision,
    expectedReleaseIdentity: expected.releaseIdentity,
  });
  if (!isDeepStrictEqual(extractedVerification, evidenceVerification)) {
    throw new Error("Extracted publication evidence differs from the archive manifest");
  }
  const extractedManifest = JSON.parse(
    await readFile(path.join(extractedPublicationRoot, evidenceManifestName), "utf8"),
  );
  assertManifestBindings(extractedManifest, expected);
  if (!isDeepStrictEqual(extractedManifest, manifest)) {
    throw new Error("Extracted publication manifest differs from the parsed archive manifest");
  }

  const releaseChecksums = Object.freeze({
    bytes: releaseChecksumsBytes.length,
    name: publicationReleaseContract.checksums.name,
    sha256: sha256Buffer(releaseChecksumsBytes),
  });
  return deepFreeze({
    schema: "stasis-compat-publication-release-verification-v1",
    status: "passed",
    packageDirectory: packageRoot,
    extractedPublicationRoot,
    harnessRevision: expected.harnessRevision,
    archive: publicAssetResult(archiveAsset),
    report,
    releaseChecksums,
    evidence: extractedVerification,
  });
}

function normalizeExpectedBindings({ expectedHarnessRevision, expectedReleaseIdentity }) {
  if (typeof expectedHarnessRevision !== "string" || !revisionPattern.test(expectedHarnessRevision)) {
    throw new Error("Expected harness revision must be one exact 40-character SHA");
  }
  let releaseIdentity;
  try {
    releaseIdentity = structuredClone(expectedReleaseIdentity);
  } catch (error) {
    throw new Error("Expected release identity must be one cloneable exact value", { cause: error });
  }
  validatePublicationReleaseIdentity(releaseIdentity, { requireComplete: true });
  return Object.freeze({
    harnessRevision: expectedHarnessRevision,
    releaseIdentity: deepFreeze(releaseIdentity),
  });
}

async function loadBoundPublicationManifest(root, expected) {
  const [manifestBytes, checksumsBytes] = await Promise.all([
    readFile(path.join(root, evidenceManifestName)),
    readFile(path.join(root, evidenceChecksumsName)),
  ]);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Publication evidence manifest is not valid JSON");
  }
  assertManifestBindings(manifest, expected);
  return { manifest, manifestBytes, checksumsBytes };
}

function assertManifestBindings(manifest, expected) {
  if (
    manifest?.harness?.repository !== "oxhq/stasis-compat-bench" ||
    manifest?.harness?.revision !== expected.harnessRevision
  ) {
    throw new Error("Publication manifest differs from the expected public harness revision");
  }
  validatePublicationReleaseIdentity(manifest.releaseIdentity, { requireComplete: true });
  if (!isDeepStrictEqual(manifest.releaseIdentity, expected.releaseIdentity)) {
    throw new Error("Publication manifest differs from the expected release identity");
  }
}

function expectedPublicationEntries({
  checksumsBytes,
  evidenceVerification,
  manifest,
  manifestBytes,
}) {
  if (!Array.isArray(manifest?.evidence?.entries)) {
    throw new Error("Publication manifest evidence inventory is absent");
  }
  const entries = manifest.evidence.entries.map((entry) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== "string" ||
      !sha256Pattern.test(entry.sha256)
    ) {
      throw new Error("Publication manifest contains an invalid evidence entry");
    }
    validateRelativePath(entry.relativePath, "publication manifest evidence path");
    return Object.freeze({
      bytes: entry.bytes,
      relativePath: entry.relativePath,
      sha256: entry.sha256,
    });
  });
  entries.push(
    Object.freeze({
      bytes: manifestBytes.length,
      relativePath: evidenceManifestName,
      sha256: sha256Buffer(manifestBytes),
    }),
    Object.freeze({
      bytes: checksumsBytes.length,
      relativePath: evidenceChecksumsName,
      sha256: sha256Buffer(checksumsBytes),
    }),
  );
  entries.sort(compareEntries);
  if (
    manifest.evidence.fileCount !== entries.length - 2 ||
    evidenceVerification.fileCount !== manifest.evidence.fileCount ||
    evidenceVerification.totalBytes !== manifest.evidence.totalBytes ||
    evidenceVerification.manifestSha256 !== sha256Buffer(manifestBytes) ||
    evidenceVerification.checksumsSha256 !== sha256Buffer(checksumsBytes)
  ) {
    throw new Error("Publication evidence verification differs from its manifest inventory");
  }
  assertStrictPathOrder(entries.map((entry) => entry.relativePath), "publication entry inventory");
  return entries;
}

function evidenceVerificationFromArchive({ internalChecksumsBytes, manifest, manifestBytes }) {
  if (
    !Number.isSafeInteger(manifest?.evidence?.fileCount) ||
    manifest.evidence.fileCount < 0 ||
    !Number.isSafeInteger(manifest.evidence.totalBytes) ||
    manifest.evidence.totalBytes < 0
  ) {
    throw new Error("Publication archive manifest has invalid evidence totals");
  }
  const canonicalInternalChecksums = renderInternalChecksums(manifest.evidence.entries, manifestBytes);
  if (!internalChecksumsBytes.equals(canonicalInternalChecksums)) {
    throw new Error("Publication archive internal SHA256SUMS.txt is not canonical");
  }
  return Object.freeze({
    manifestSha256: sha256Buffer(manifestBytes),
    checksumsSha256: sha256Buffer(internalChecksumsBytes),
    fileCount: manifest.evidence.fileCount,
    totalBytes: manifest.evidence.totalBytes,
  });
}

function renderInternalChecksums(evidenceEntries, manifestBytes) {
  if (!Array.isArray(evidenceEntries)) {
    throw new Error("Publication archive manifest evidence entries are absent");
  }
  const entries = evidenceEntries.map((entry) => ({
    relativePath: entry.relativePath,
    sha256: entry.sha256,
  }));
  entries.push({
    relativePath: evidenceManifestName,
    sha256: sha256Buffer(manifestBytes),
  });
  entries.sort(compareEntries);
  return Buffer.from(
    entries.map((entry) => `${entry.sha256}  ${entry.relativePath}\n`).join(""),
    "utf8",
  );
}

async function writeCanonicalTar({ archivePath, entries, sourceRoot }) {
  const handle = await open(archivePath, "wx", tarFileMode);
  const archiveHash = createHash("sha256");
  const writtenEntries = [];
  let archiveBytes = 0;
  try {
    const append = async (bytes) => {
      await writeAll(handle, bytes);
      archiveHash.update(bytes);
      archiveBytes += bytes.length;
    };
    for (const entry of entries) {
      const archiveEntryPath = `${publicationReleaseContract.archive.root}/${entry.relativePath}`;
      const header = createTarHeader(archiveEntryPath, entry.bytes);
      await append(header);
      const contentHash = createHash("sha256");
      let contentBytes = 0;
      const sourcePath = path.join(sourceRoot, ...entry.relativePath.split("/"));
      for await (const chunk of createReadStream(sourcePath)) {
        contentBytes += chunk.length;
        if (contentBytes > entry.bytes) {
          throw new Error(`Publication source file grew while archiving: ${entry.relativePath}`);
        }
        contentHash.update(chunk);
        await append(chunk);
      }
      const contentSha256 = contentHash.digest("hex");
      if (contentBytes !== entry.bytes || contentSha256 !== entry.sha256) {
        throw new Error(`Publication source file changed while archiving: ${entry.relativePath}`);
      }
      const paddingBytes = paddedBytes(contentBytes) - contentBytes;
      if (paddingBytes > 0) await append(Buffer.alloc(paddingBytes));
      writtenEntries.push(Object.freeze({
        bytes: contentBytes,
        relativePath: entry.relativePath,
        sha256: contentSha256,
      }));
    }
    await append(Buffer.alloc(tarEndBytes));
    await handle.sync();
  } finally {
    await handle.close();
  }
  return Object.freeze({
    bytes: archiveBytes,
    entries: Object.freeze(writtenEntries),
    name: publicationReleaseContract.archive.name,
    sha256: archiveHash.digest("hex"),
  });
}

async function parseCanonicalTar(archivePath) {
  const handle = await open(archivePath, "r");
  const metadata = await handle.stat();
  if (
    !metadata.isFile() ||
    !Number.isSafeInteger(metadata.size) ||
    metadata.size < tarEndBytes ||
    metadata.size % tarBlockBytes !== 0
  ) {
    await handle.close();
    throw new Error("Publication archive has an invalid block-aligned size");
  }
  const archiveHash = createHash("sha256");
  const entries = [];
  const exactPaths = new Set();
  const foldedPaths = new Set();
  let previousPath = null;
  let offset = 0;
  try {
    const readNext = async (length) => {
      const bytes = await readExact(handle, length, offset);
      offset += length;
      archiveHash.update(bytes);
      return bytes;
    };
    while (offset < metadata.size) {
      const headerOffset = offset;
      const header = await readNext(tarBlockBytes);
      if (isZeroBlock(header)) {
        const finalBlock = await readNext(tarBlockBytes);
        if (!isZeroBlock(finalBlock) || offset !== metadata.size) {
          throw new Error("Publication archive must end with exactly two zero blocks");
        }
        return Object.freeze({
          bytes: metadata.size,
          entries: Object.freeze(entries),
          sha256: archiveHash.digest("hex"),
        });
      }
      const archiveEntryPath = readTarPath(header);
      const size = readCanonicalTarSize(header);
      const expectedHeader = createTarHeader(archiveEntryPath, size);
      if (!header.equals(expectedHeader)) {
        throw new Error(`Publication archive has a noncanonical ustar header: ${archiveEntryPath}`);
      }
      const rootPrefix = `${publicationReleaseContract.archive.root}/`;
      if (!archiveEntryPath.startsWith(rootPrefix)) {
        throw new Error("Publication archive entry is outside the exact root prefix");
      }
      const relativePath = archiveEntryPath.slice(rootPrefix.length);
      validateRelativePath(relativePath, "publication archive entry path");
      if (previousPath !== null && comparePaths(previousPath, relativePath) >= 0) {
        throw new Error("Publication archive entries are not strictly UTF-8 byte ordered");
      }
      const foldedPath = relativePath.toLowerCase();
      if (exactPaths.has(relativePath) || foldedPaths.has(foldedPath)) {
        throw new Error("Publication archive contains a duplicate or case-colliding path");
      }
      exactPaths.add(relativePath);
      foldedPaths.add(foldedPath);
      previousPath = relativePath;

      const dataOffset = offset;
      const contentHash = createHash("sha256");
      let remaining = size;
      while (remaining > 0) {
        const chunk = await readNext(Math.min(remaining, copyChunkBytes));
        contentHash.update(chunk);
        remaining -= chunk.length;
      }
      const paddingBytes = paddedBytes(size) - size;
      if (paddingBytes > 0) {
        const padding = await readNext(paddingBytes);
        if (!isZeroBlock(padding)) {
          throw new Error(`Publication archive has nonzero data padding: ${relativePath}`);
        }
      }
      entries.push(Object.freeze({
        archiveEntryPath,
        bytes: size,
        dataOffset,
        headerOffset,
        relativePath,
        sha256: contentHash.digest("hex"),
      }));
    }
  } finally {
    await handle.close();
  }
  throw new Error("Publication archive is missing its exact terminal zero blocks");
}

async function extractCanonicalTar({ archivePath, entries, publicationRoot }) {
  const input = await open(archivePath, "r");
  try {
    for (const entry of entries) {
      const target = path.join(publicationRoot, ...entry.relativePath.split("/"));
      await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
      const output = await open(target, "wx", tarFileMode);
      try {
        let sourceOffset = entry.dataOffset;
        let remaining = entry.bytes;
        while (remaining > 0) {
          const chunkLength = Math.min(remaining, copyChunkBytes);
          const chunk = await readExact(input, chunkLength, sourceOffset);
          await writeAll(output, chunk);
          sourceOffset += chunk.length;
          remaining -= chunk.length;
        }
        await output.sync();
      } finally {
        await output.close();
      }
    }
  } finally {
    await input.close();
  }
}

function createTarHeader(archiveEntryPath, size) {
  validateRelativePath(archiveEntryPath, "publication ustar path");
  if (!Number.isSafeInteger(size) || size < 0 || size > maximumTarFileBytes) {
    throw new Error("Publication ustar entry size is outside the canonical range");
  }
  const { name, prefix } = splitTarPath(archiveEntryPath);
  const header = Buffer.alloc(tarBlockBytes);
  writeTarText(header, 0, 100, name);
  writeTarOctal(header, 100, 8, tarFileMode);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, size);
  writeTarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeTarText(header, 257, 6, "ustar\0", { allowNull: true });
  writeTarText(header, 263, 2, "00");
  writeTarOctal(header, 329, 8, 0);
  writeTarOctal(header, 337, 8, 0);
  writeTarText(header, 345, 155, prefix);
  const checksum = header.reduce((total, byte) => total + byte, 0).toString(8).padStart(6, "0");
  header.write(checksum, 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function splitTarPath(value) {
  if (Buffer.byteLength(value, "utf8") <= 100) return { name: value, prefix: "" };
  for (let index = value.lastIndexOf("/"); index > 0; index = value.lastIndexOf("/", index - 1)) {
    const prefix = value.slice(0, index);
    const name = value.slice(index + 1);
    if (
      Buffer.byteLength(prefix, "utf8") <= 155 &&
      Buffer.byteLength(name, "utf8") <= 100
    ) {
      return { name, prefix };
    }
  }
  throw new Error(`Publication path does not fit canonical ustar fields: ${value}`);
}

function readTarPath(header) {
  const name = readTarText(header, 0, 100, "name");
  const prefix = readTarText(header, 345, 155, "prefix");
  const value = prefix.length === 0 ? name : `${prefix}/${name}`;
  validateRelativePath(value, "publication ustar path");
  return value;
}

function readCanonicalTarSize(header) {
  const value = header.subarray(124, 136).toString("ascii");
  if (!/^[0-7]{11}\0$/u.test(value)) {
    throw new Error("Publication archive has a noncanonical ustar size");
  }
  const size = Number.parseInt(value.slice(0, -1), 8);
  if (!Number.isSafeInteger(size) || size > maximumTarFileBytes) {
    throw new Error("Publication archive ustar size exceeds the supported range");
  }
  return size;
}

function writeTarText(target, offset, width, value, { allowNull = false } = {}) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > width || (!allowNull && bytes.includes(0))) {
    throw new Error("Publication ustar text field exceeds its canonical width");
  }
  bytes.copy(target, offset);
}

function readTarText(source, offset, width, label) {
  const field = source.subarray(offset, offset + width);
  const nullIndex = field.indexOf(0);
  const content = nullIndex < 0 ? field : field.subarray(0, nullIndex);
  if (nullIndex >= 0 && !isZeroBlock(field.subarray(nullIndex))) {
    throw new Error(`Publication archive ustar ${label} has nonzero trailing bytes`);
  }
  const value = content.toString("utf8");
  if (!Buffer.from(value, "utf8").equals(content)) {
    throw new Error(`Publication archive ustar ${label} is not canonical UTF-8`);
  }
  return value;
}

function writeTarOctal(target, offset, width, value) {
  const digits = value.toString(8);
  if (digits.length > width - 1) {
    throw new Error("Publication ustar numeric field exceeds its canonical width");
  }
  target.write(`${digits.padStart(width - 1, "0")}\0`, offset, width, "ascii");
}

function renderPublicationReport({ archive, evidenceVerification, manifest }) {
  const lines = [
    `# ${publicationReleaseContract.release.name}`,
    "",
    "This report is generated deterministically from the retained public evidence.",
    "",
    "## Exact bindings",
    "",
    `- Benchmark repository: \`${manifest.harness.repository}\``,
    `- Harness revision: \`${manifest.harness.revision}\``,
    `- Stasis version: \`${manifest.releaseIdentity.release.version}\``,
    `- Stasis source revision: \`${manifest.releaseIdentity.release.sourceRevision}\``,
    `- Package workflow run: \`${manifest.releaseIdentity.packageQualification.workflowRunId}\`, attempt \`${manifest.releaseIdentity.packageQualification.workflowRunAttempt}\``,
    `- Evidence archive: \`${publicationReleaseContract.archive.name}\``,
    `- Evidence archive bytes: \`${archive.bytes}\``,
    `- Evidence archive SHA-256: \`${archive.sha256}\``,
    `- Evidence manifest SHA-256: \`${evidenceVerification.manifestSha256}\``,
    `- Internal checksums SHA-256: \`${evidenceVerification.checksumsSha256}\``,
    `- Retained evidence files: \`${evidenceVerification.fileCount}\``,
    `- Retained evidence bytes: \`${evidenceVerification.totalBytes}\``,
    "",
    "## Qualified release identity",
    "",
    ...indentedJson(manifest.releaseIdentity),
    "",
    "## Frozen baseline inputs",
    "",
    ...indentedJson(manifest.baselineInputs),
    "",
    "## Retained lane results",
    "",
    "### Deterministic",
    "",
    ...indentedJson(manifest.reportedResults.deterministic),
    "",
    "### RWA",
    "",
    ...indentedJson(manifest.reportedResults.rwa),
    "",
    "### Wild",
    "",
    ...indentedJson(manifest.reportedResults.wild),
    "",
    "## Claim boundary",
    "",
    "- This is compatibility evidence, not a performance comparison.",
    "- The RWA lane measures frozen application intents, retains every disclosed semantic difference, and is not Cypress API equivalence.",
    "- The wild lane is one preregistered sample and supports neither prevalence nor general web-support claims.",
    "- Baseline failures and benchmark-invalid cases remain visible; no pooled success rate is computed across lanes.",
    "- Unsupported outcomes remain typed outcomes in their denominators.",
    "- No application, corpus, retry, sleep, polling, or Chromium fallback was introduced for this publication run.",
    "",
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

function indentedJson(value) {
  return JSON.stringify(value, null, 2).split("\n").map((line) => `    ${line}`);
}

function renderReleaseChecksums({ archive, report }) {
  return Buffer.from(
    `${archive.sha256}  ${publicationReleaseContract.archive.name}\n` +
      `${report.sha256}  ${publicationReleaseContract.report.name}\n`,
    "utf8",
  );
}

async function assertExactPackageAssets(packageRoot) {
  const entries = await readdir(packageRoot, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  const names = entries.map((entry) => entry.name);
  const expectedNames = [...publicationReleaseContract.assetNames].sort(comparePaths);
  if (!isDeepStrictEqual(names, expectedNames)) {
    throw new Error("Downloaded package directory does not contain the exact release asset set");
  }
  for (const entry of entries) {
    const metadata = await lstat(path.join(packageRoot, entry.name));
    if (!entry.isFile() || metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`Downloaded release asset is not one regular file: ${entry.name}`);
    }
  }
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
      const absolutePath = path.join(root, ...relativePath.split("/"));
      const metadata = await lstat(absolutePath);
      if (metadata.isSymbolicLink()) {
        throw new Error(`Publication root contains a symbolic link: ${relativePath}`);
      }
      if (metadata.isDirectory()) {
        await visit(relativePath);
      } else if (metadata.isFile()) {
        validateRelativePath(relativePath, "publication root file path");
        files.push(relativePath);
      } else {
        throw new Error(`Publication root contains a non-regular entry: ${relativePath}`);
      }
    }
  }
  await visit("");
  return files.sort(comparePaths);
}

async function assertRealDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
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

async function assertFreshDirectoryTarget(value, label, disallowedRoots) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  const target = path.resolve(value);
  for (const root of disallowedRoots) {
    if (samePath(target, root) || isWithin(root, target)) {
      throw new Error(`${label} must remain outside protected input directories`);
    }
  }
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await assertRealDirectory(path.dirname(target), `${label} parent`);
    return target;
  }
  throw new Error(`${label} must be fresh and absent`);
}

function validateRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !safeRelativePathPattern.test(value) ||
    value.includes("\\") ||
    path.posix.isAbsolute(value)
  ) {
    throw new Error(`${label} is not one canonical relative path`);
  }
  const components = value.split("/");
  if (components.some((component) => component.length === 0 || component === "." || component === "..")) {
    throw new Error(`${label} contains an unsafe path component`);
  }
  return value;
}

function assertExactEntryBindings(actual, expected, label) {
  const actualProjection = actual.map(({ bytes, relativePath, sha256 }) => ({
    bytes,
    relativePath,
    sha256,
  }));
  const expectedProjection = expected.map(({ bytes, relativePath, sha256 }) => ({
    bytes,
    relativePath,
    sha256,
  }));
  if (!isDeepStrictEqual(actualProjection, expectedProjection)) {
    throw new Error(`${label} differs from the exact publication evidence inventory`);
  }
}

function assertExactPaths(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} differs from the exact publication file inventory`);
  }
}

function assertStrictPathOrder(paths, label) {
  const folded = new Set();
  for (let index = 0; index < paths.length; index += 1) {
    const current = paths[index];
    validateRelativePath(current, label);
    if (index > 0 && comparePaths(paths[index - 1], current) >= 0) {
      throw new Error(`${label} is not strictly UTF-8 byte ordered`);
    }
    const foldedPath = current.toLowerCase();
    if (folded.has(foldedPath)) throw new Error(`${label} contains a case-colliding path`);
    folded.add(foldedPath);
  }
}

function requiredArchiveEntry(entries, relativePath) {
  const entry = entries.find((candidate) => candidate.relativePath === relativePath);
  if (entry === undefined) {
    throw new Error(`Publication archive is missing required entry: ${relativePath}`);
  }
  return entry;
}

async function readArchiveEntryBytes(archivePath, entry) {
  if (entry.bytes > 64 * 1024 * 1024) {
    throw new Error(`Publication metadata entry is unexpectedly large: ${entry.relativePath}`);
  }
  const handle = await open(archivePath, "r");
  try {
    return await readExact(handle, entry.bytes, entry.dataOffset);
  } finally {
    await handle.close();
  }
}

async function sha256FileWithSize(filePath) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !Number.isSafeInteger(metadata.size)) {
    throw new Error("Publication release asset must be one regular file with a safe size");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  if (bytes !== metadata.size) throw new Error("Publication release asset changed while hashing");
  return Object.freeze({ bytes, sha256: hash.digest("hex") });
}

async function readExact(handle, length, position) {
  const output = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(output, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new Error("Publication archive is truncated");
    offset += bytesRead;
  }
  return output;
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, null);
    if (bytesWritten === 0) throw new Error("Publication archive write made no progress");
    offset += bytesWritten;
  }
}

function paddedBytes(value) {
  return Math.ceil(value / tarBlockBytes) * tarBlockBytes;
}

function isZeroBlock(bytes) {
  for (const byte of bytes) if (byte !== 0) return false;
  return true;
}

function publicAssetResult(asset) {
  return Object.freeze({
    bytes: asset.bytes,
    name: asset.name,
    sha256: asset.sha256,
  });
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareEntries(left, right) {
  return comparePaths(left.relativePath, right.relativePath);
}

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
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
