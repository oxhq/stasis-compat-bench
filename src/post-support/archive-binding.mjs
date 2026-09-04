import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";

import { sha256DirectoryTree } from "../shared/io.mjs";

const windowsRoot = "stasis-0.3.3-windows-x86_64-ci";
const windowsInventory = Object.freeze([
  "controlled-web-session-v2.json",
  "INSTALL.txt",
  "libEGL.dll",
  "libGLESv2.dll",
  "LICENSE",
  "LICENSE_WHATWG_SPECS",
  "MSVC-RUNTIME.txt",
  "MSVCP140.dll",
  "README.md",
  "RELEASES.md",
  "session-v0.3-candidate.md",
  "SHA256SUMS.txt",
  "SOURCE.txt",
  "STASIS_UPSTREAM.toml",
  "stasis.exe",
  "STASIS.md",
  "THIRD_PARTY_LICENSES.html",
  "VCRUNTIME140_1.dll",
  "VCRUNTIME140.dll",
  "VERSION.txt",
  "WINDOWS-CI-ARTIFACT.txt",
]);
const maximumWindowsZipBytes = 512 * 1024 * 1024;
const maximumWindowsExpandedBytes = 512 * 1024 * 1024;
const maximumSdkArchiveBytes = 64 * 1024 * 1024;
const maximumSdkTarBytes = 256 * 1024 * 1024;

export async function verifyWindowsZipExecutableBinding({
  archivePath,
  executableSha256,
  executableBytes,
  expectedRevision,
  expectedVersion,
  expectedRunId,
  expectedRunAttempt,
}) {
  const inspected = await inspectWindowsZipExecutableBinding({
    archivePath,
    executableSha256,
    executableBytes,
    expectedRevision,
    expectedVersion,
    expectedRunId,
    expectedRunAttempt,
  });
  return inspected.verification;
}

export async function materializeVerifiedWindowsZipExecutableBinding(input) {
  const inspected = await inspectWindowsZipExecutableBinding(input);
  const ownerRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-post-support-windows-"));
  const runtimeRoot = path.join(ownerRoot, windowsRoot);
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await rm(ownerRoot, { recursive: true, force: true });
  };
  try {
    await mkdir(runtimeRoot, { recursive: false });
    for (const name of windowsInventory) {
      await writeFile(
        path.join(runtimeRoot, name),
        inspected.contents.get(`${windowsRoot}/${name}`),
        { flag: "wx" },
      );
    }
    const expectedTree = hashMemoryTree(new Map(
      windowsInventory.map((name) => [name, inspected.contents.get(`${windowsRoot}/${name}`)]),
    ));
    const tree = await sha256DirectoryTree(runtimeRoot);
    if (
      tree.sha256 !== expectedTree.sha256 ||
      tree.fileCount !== expectedTree.fileCount ||
      tree.totalBytes !== expectedTree.totalBytes
    ) {
      throw new Error("Verifier-owned Windows runtime tree differs from the verified ZIP");
    }
    return Object.freeze({
      ...inspected.verification,
      ownerRoot,
      runtimeRoot,
      executablePath: path.join(runtimeRoot, "stasis.exe"),
      tree: Object.freeze(tree),
      dispose,
    });
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function inspectWindowsZipExecutableBinding({
  archivePath,
  executableSha256,
  executableBytes,
  expectedRevision,
  expectedVersion,
  expectedRunId,
  expectedRunAttempt,
}) {
  if (!/^[a-f0-9]{40}$/u.test(expectedRevision ?? "")) {
    throw new TypeError("Windows ZIP expected revision must be one lowercase Git object id");
  }
  if (typeof expectedVersion !== "string" || expectedVersion.length === 0) {
    throw new TypeError("Windows ZIP expected version is required");
  }
  if (typeof expectedRunId !== "string" || !/^[1-9][0-9]*$/u.test(expectedRunId)) {
    throw new TypeError("Windows ZIP expected workflow run ID must be one canonical positive integer");
  }
  if (typeof expectedRunAttempt !== "string" || !/^[1-9][0-9]*$/u.test(expectedRunAttempt)) {
    throw new TypeError("Windows ZIP expected workflow run attempt must be one canonical positive integer");
  }
  const archive = await readBoundedFile(archivePath, maximumWindowsZipBytes, "Windows ZIP");
  const entries = readZipEntries(archive);
  const expectedNames = windowsInventory.map((name) => `${windowsRoot}/${name}`).sort();
  const actualNames = [...entries.keys()].sort();
  assertSameStrings(actualNames, expectedNames, "Windows ZIP inventory");
  const contents = new Map(
    actualNames.map((name) => [name, extractZipEntry(archive, entries.get(name))]),
  );
  const executable = contents.get(`${windowsRoot}/stasis.exe`);
  if (
    executable.length !== executableBytes ||
    sha256(executable) !== executableSha256
  ) {
    throw new Error("Windows ZIP stasis.exe differs from the separately verified executable");
  }
  const checksums = parseWindowsChecksums(contents.get(`${windowsRoot}/SHA256SUMS.txt`));
  const checksummedNames = actualNames.filter((name) => name !== `${windowsRoot}/SHA256SUMS.txt`);
  assertSameStrings([...checksums.keys()].sort(), checksummedNames, "Windows ZIP checksum inventory");
  for (const name of checksummedNames) {
    if (checksums.get(name) !== sha256(contents.get(name))) {
      throw new Error(`Windows ZIP checksum manifest differs for ${name}`);
    }
  }
  const marker = parseWindowsArtifactMarker(
    contents.get(`${windowsRoot}/WINDOWS-CI-ARTIFACT.txt`),
  );
  if (
    marker.Version !== expectedVersion ||
    marker.Revision !== expectedRevision ||
    marker.Run !== expectedRunId ||
    marker.Attempt !== expectedRunAttempt
  ) {
    throw new Error("Windows ZIP artifact marker differs from the exact hosted package train");
  }
  const verification = Object.freeze({
    root: windowsRoot,
    fileCount: actualNames.length,
    executableSha256,
    executableBytes,
    revision: marker.Revision,
    version: marker.Version,
    workflowRunId: marker.Run,
    workflowRunAttempt: marker.Attempt,
    checksumCount: checksums.size,
  });
  return { verification, contents };
}

export async function verifySdkArchiveTreeBinding({ archivePath, expectedTree }) {
  const inspected = await inspectSdkArchiveTreeBinding({ archivePath, expectedTree });
  return inspected.verification;
}

export async function materializeVerifiedSdkArchiveTreeBinding(input) {
  const inspected = await inspectSdkArchiveTreeBinding(input);
  const ownerRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-post-support-sdk-"));
  const packageRoot = path.join(ownerRoot, "package");
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await rm(ownerRoot, { recursive: true, force: true });
  };
  try {
    await mkdir(packageRoot, { recursive: false });
    for (const [relativePath, content] of inspected.files) {
      const destination = path.join(packageRoot, ...relativePath.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content, { flag: "wx" });
    }
    const tree = await sha256DirectoryTree(packageRoot);
    if (
      tree.sha256 !== inspected.verification.sha256 ||
      tree.fileCount !== inspected.verification.fileCount ||
      tree.totalBytes !== inspected.verification.totalBytes
    ) {
      throw new Error("Verifier-owned SDK package tree differs from the verified tarball");
    }
    return Object.freeze({
      ...inspected.verification,
      ownerRoot,
      packageRoot,
      tree: Object.freeze(tree),
      dispose,
    });
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function inspectSdkArchiveTreeBinding({ archivePath, expectedTree }) {
  const archive = await readBoundedFile(archivePath, maximumSdkArchiveBytes, "SDK archive");
  let tar;
  try {
    tar = gunzipSync(archive, { maxOutputLength: maximumSdkTarBytes });
  } catch (error) {
    throw new Error("SDK archive is not one bounded gzip stream", { cause: error });
  }
  const files = readNpmTarFiles(tar);
  const tree = hashMemoryTree(files);
  if (
    tree.sha256 !== expectedTree.sha256 ||
    tree.fileCount !== expectedTree.fileCount ||
    tree.totalBytes !== expectedTree.totalBytes
  ) {
    throw new Error("SDK archive contents differ from the separately verified extracted tree");
  }
  return { verification: Object.freeze(tree), files };
}

function readZipEntries(archive) {
  const eocdOffset = findEndOfCentralDirectory(archive);
  const disk = archive.readUInt16LE(eocdOffset + 4);
  const centralDisk = archive.readUInt16LE(eocdOffset + 6);
  const diskEntries = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  const centralBytes = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const commentBytes = archive.readUInt16LE(eocdOffset + 20);
  if (
    disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries ||
    totalEntries < 1 || totalEntries >= 0xffff ||
    centralOffset + centralBytes !== eocdOffset ||
    eocdOffset + 22 + commentBytes !== archive.length
  ) {
    throw new Error("Windows ZIP central directory is not one bounded non-ZIP64 archive");
  }
  const entries = new Map();
  let expandedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > eocdOffset || archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Windows ZIP central directory is malformed");
    }
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const compressedBytes = archive.readUInt32LE(offset + 20);
    const uncompressedBytes = archive.readUInt32LE(offset + 24);
    const nameBytes = archive.readUInt16LE(offset + 28);
    const extraBytes = archive.readUInt16LE(offset + 30);
    const entryCommentBytes = archive.readUInt16LE(offset + 32);
    const startDisk = archive.readUInt16LE(offset + 34);
    const localOffset = archive.readUInt32LE(offset + 42);
    const end = offset + 46 + nameBytes + extraBytes + entryCommentBytes;
    if (
      end > eocdOffset || startDisk !== 0 || (flags & 1) !== 0 ||
      [compressedBytes, uncompressedBytes, localOffset].includes(0xffffffff)
    ) {
      throw new Error("Windows ZIP entry uses an unsupported boundary");
    }
    const name = archive.subarray(offset + 46, offset + 46 + nameBytes).toString("utf8");
    assertSafeArchivePath(name, "Windows ZIP entry");
    if (name.endsWith("/") || entries.has(name)) {
      throw new Error("Windows ZIP contains a directory or duplicate entry");
    }
    expandedBytes += uncompressedBytes;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > maximumWindowsExpandedBytes) {
      throw new Error("Windows ZIP expanded bytes exceed the verification limit");
    }
    entries.set(name, Object.freeze({
      name,
      flags,
      method,
      compressedBytes,
      uncompressedBytes,
      localOffset,
    }));
    offset = end;
  }
  if (offset !== eocdOffset) throw new Error("Windows ZIP central directory length changed");
  return entries;
}

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Windows ZIP end-of-central-directory record is missing");
}

function extractZipEntry(archive, entry) {
  if (entry === undefined) throw new Error("Windows ZIP omits a required entry");
  const offset = entry.localOffset;
  if (offset + 30 > archive.length || archive.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error("Windows ZIP local header is malformed");
  }
  const flags = archive.readUInt16LE(offset + 6);
  const method = archive.readUInt16LE(offset + 8);
  const nameBytes = archive.readUInt16LE(offset + 26);
  const extraBytes = archive.readUInt16LE(offset + 28);
  const name = archive.subarray(offset + 30, offset + 30 + nameBytes).toString("utf8");
  const dataOffset = offset + 30 + nameBytes + extraBytes;
  const dataEnd = dataOffset + entry.compressedBytes;
  if (
    flags !== entry.flags || method !== entry.method || name !== entry.name ||
    dataOffset > archive.length || dataEnd > archive.length
  ) {
    throw new Error("Windows ZIP local and central headers differ");
  }
  const compressed = archive.subarray(dataOffset, dataEnd);
  let content;
  if (method === 0) content = Buffer.from(compressed);
  else if (method === 8) {
    try {
      content = inflateRawSync(compressed, { maxOutputLength: entry.uncompressedBytes });
    } catch (error) {
      throw new Error("Windows ZIP deflate stream is invalid", { cause: error });
    }
  } else {
    throw new Error(`Windows ZIP entry uses unsupported compression method ${method}`);
  }
  if (content.length !== entry.uncompressedBytes) {
    throw new Error("Windows ZIP entry uncompressed length changed");
  }
  return content;
}

function parseWindowsChecksums(content) {
  const text = decodeUtf8(content, "Windows ZIP checksum manifest");
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const withoutLineEndings = text.replaceAll(lineEnding, "");
  if (withoutLineEndings.includes("\r") || withoutLineEndings.includes("\n") || !text.endsWith(lineEnding)) {
    throw new Error("Windows ZIP checksum manifest has mixed or noncanonical line endings");
  }
  const checksums = new Map();
  for (const line of text.slice(0, -lineEnding.length).split(lineEnding)) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    if (match === null) throw new Error("Windows ZIP checksum manifest line is malformed");
    const [, digest, name] = match;
    assertSafeArchivePath(name, "Windows ZIP checksum");
    if (!name.startsWith(`${windowsRoot}/`) || checksums.has(name)) {
      throw new Error("Windows ZIP checksum manifest contains an unexpected or duplicate path");
    }
    checksums.set(name, digest);
  }
  return checksums;
}

function parseWindowsArtifactMarker(content) {
  const text = decodeUtf8(content, "Windows ZIP artifact marker").replaceAll("\r\n", "\n");
  if (text.includes("\r") || !text.startsWith("Stasis Windows x86-64 CI-only artifact\n\n")) {
    throw new Error("Windows ZIP artifact marker header changed");
  }
  const fields = Object.create(null);
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9_]*): (.+)$/u.exec(line);
    if (match === null) continue;
    const [, key, value] = match;
    if (Object.hasOwn(fields, key)) throw new Error("Windows ZIP artifact marker repeats a field");
    fields[key] = value;
  }
  for (const key of ["Version", "Revision", "Run", "Attempt"]) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Windows ZIP artifact marker omits ${key}`);
  }
  return fields;
}

function decodeUtf8(content, label) {
  const text = content.toString("utf8");
  if (text.includes("\uFFFD") || text.includes("\0")) {
    throw new Error(`${label} is not canonical UTF-8 text`);
  }
  return text;
}

function readNpmTarFiles(tar) {
  const files = new Map();
  let offset = 0;
  let terminalBlocks = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      terminalBlocks += 1;
      if (terminalBlocks === 2) break;
      continue;
    }
    if (terminalBlocks !== 0) throw new Error("SDK tar contains data after one terminal block");
    assertTarChecksum(header);
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const fullName = prefix.length === 0 ? name : `${prefix}/${name}`;
    const type = header[156];
    const size = tarOctal(header, 124, 12, "SDK tar entry size");
    if ((type !== 0 && type !== 0x30) || !fullName.startsWith("package/")) {
      throw new Error("SDK tar contains a non-regular or non-package entry");
    }
    const relativePath = fullName.slice("package/".length);
    assertSafeArchivePath(relativePath, "SDK tar entry");
    if (files.has(relativePath) || offset + size > tar.length) {
      throw new Error("SDK tar contains a duplicate or truncated entry");
    }
    files.set(relativePath, Buffer.from(tar.subarray(offset, offset + size)));
    offset += Math.ceil(size / 512) * 512;
  }
  if (terminalBlocks !== 2 || tar.subarray(offset).some((byte) => byte !== 0)) {
    throw new Error("SDK tar does not end with canonical zero blocks");
  }
  if (files.size < 1) throw new Error("SDK tar contains no package files");
  return files;
}

function assertTarChecksum(header) {
  const expected = tarOctal(header, 148, 8, "SDK tar checksum");
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) throw new Error("SDK tar header checksum mismatch");
}

function tarString(header, offset, length) {
  const bytes = header.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString("utf8");
}

function tarOctal(header, offset, length, label) {
  const text = tarString(header, offset, length).trim();
  if (!/^[0-7]+$/u.test(text)) throw new Error(`${label} is not canonical octal`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is out of range`);
  return value;
}

function hashMemoryTree(files) {
  const aggregate = createHash("sha256");
  let totalBytes = 0;
  const paths = [...files.keys()].sort((left, right) => left.localeCompare(right, "en"));
  for (const relativePath of paths) {
    const content = files.get(relativePath);
    totalBytes += content.length;
    aggregate.update(relativePath, "utf8");
    aggregate.update("\0", "utf8");
    aggregate.update(String(content.length), "utf8");
    aggregate.update("\0", "utf8");
    aggregate.update(sha256(content), "ascii");
    aggregate.update("\n", "ascii");
  }
  return { sha256: aggregate.digest("hex"), fileCount: paths.length, totalBytes };
}

function assertSafeArchivePath(value, label) {
  if (
    typeof value !== "string" || value.length === 0 || value.includes("\\") ||
    value.startsWith("/") || value.endsWith("/") || value.includes("\0") ||
    value.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(`${label} path is unsafe`);
  }
}

async function readBoundedFile(filePath, maximumBytes, label) {
  const bytes = await readFile(filePath);
  if (bytes.length < 1 || bytes.length > maximumBytes) {
    throw new Error(`${label} bytes are outside the verification limit`);
  }
  return bytes;
}

function assertSameStrings(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} differs from the exact workflow contract`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
