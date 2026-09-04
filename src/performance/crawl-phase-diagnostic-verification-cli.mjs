import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { jsonReplacer } from "../shared/io.mjs";
import {
  assertCrawlPhaseDiagnosticVerificationReceipt,
  crawlPhaseDiagnosticVerificationFileNames,
  crawlPhaseDiagnosticVerificationSchema,
  verifyCrawlPhaseDiagnosticArtifactSet,
} from "./crawl-phase-diagnostic-verification.mjs";

export const crawlPhaseDiagnosticVerificationCliSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-cli-v1";
export const crawlPhaseDiagnosticVerificationOutputName =
  "diagnostic-verification.json";
export const crawlPhaseDiagnosticVerificationCliUsage =
  "Usage: node src/performance/crawl-phase-diagnostic-verification-cli.mjs verify <absolute-crawlee-raw-json> <absolute-stasis-raw-json> <absolute-composed-evidence-json> <absolute-fresh-authority-raw-json> <absolute-artifact-binding-json> <absolute-diagnostic-verification-output-json>";

const maximumJsonBytes = 64 * 1024 * 1024;

function inspectPathWithBigInt(filePath) {
  return lstat(filePath, { bigint: true });
}

export function parseCrawlPhaseDiagnosticVerificationCommand(argv) {
  if (argv[0] !== "verify" || argv.length !== 7) {
    throw new TypeError(crawlPhaseDiagnosticVerificationCliUsage);
  }
  const definitions = [
    ["crawleeRawPath", argv[1], "Crawlee diagnostic raw"],
    ["stasisRawPath", argv[2], "Stasis diagnostic raw"],
    ["composedEvidencePath", argv[3], "composed diagnostic evidence"],
    ["authoritativeRawPath", argv[4], "fresh authoritative crawl raw"],
    ["artifactBindingPath", argv[5], "performance artifact-binding receipt"],
    ["outputPath", argv[6], "diagnostic verification output"],
  ];
  const parsed = { command: "verify" };
  for (const [key, value, label] of definitions) {
    parsed[key] = requiredAbsolutePath(value, label);
  }
  const paths = definitions.map(([key]) => parsed[key]);
  assertDistinctPaths(paths);
  const diagnosticPaths = paths.slice(0, 3);
  const diagnosticRoot = path.dirname(diagnosticPaths[0]);
  if (
    diagnosticPaths.some((filePath) => !samePath(path.dirname(filePath), diagnosticRoot)) ||
    diagnosticPaths.some((filePath, index) =>
      path.basename(filePath) !== crawlPhaseDiagnosticVerificationFileNames[index])
  ) {
    throw new TypeError(
      "Diagnostic inputs must be the exact three named files in one directory",
    );
  }
  if (path.basename(parsed.outputPath) !== crawlPhaseDiagnosticVerificationOutputName) {
    throw new TypeError(
      `Diagnostic verification output must be named ${crawlPhaseDiagnosticVerificationOutputName}`,
    );
  }
  parsed.diagnosticRoot = diagnosticRoot;
  return Object.freeze(parsed);
}

export async function runCrawlPhaseDiagnosticVerificationCli(argv, {
  readBytes = readFile,
  readDirectory = readdir,
  inspectPath = inspectPathWithBigInt,
  resolvePath = realpath,
  verifyArtifactSet = verifyCrawlPhaseDiagnosticArtifactSet,
  assertReceipt = assertCrawlPhaseDiagnosticVerificationReceipt,
  writeReceipt = writeFreshCanonicalJson,
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const parsed = parseCrawlPhaseDiagnosticVerificationCommand(argv);
  await assertRealDirectory(parsed.diagnosticRoot, "diagnostic input directory", {
    inspectPath,
    resolvePath,
  });
  await assertExactDiagnosticInventory(parsed.diagnosticRoot, { readDirectory });
  await assertFreshOutputPath(parsed.outputPath, { inspectPath, resolvePath });

  const inputDefinitions = [
    ["crawleeRaw", parsed.crawleeRawPath, "Crawlee diagnostic raw"],
    ["stasisRaw", parsed.stasisRawPath, "Stasis diagnostic raw"],
    ["composedEvidence", parsed.composedEvidencePath, "composed diagnostic evidence"],
    ["freshAuthorityRaw", parsed.authoritativeRawPath, "fresh authoritative crawl raw"],
    ["artifactBindingReceipt", parsed.artifactBindingPath, "performance artifact-binding receipt"],
  ];
  const records = await Promise.all(inputDefinitions.map(([, filePath, label]) =>
    readCanonicalStableRegularFile(filePath, label, {
      readBytes,
      inspectPath,
      resolvePath,
    })
  ));
  assertDistinctFileIdentities(records);
  const byName = Object.fromEntries(
    inputDefinitions.map(([name], index) => [name, records[index]]),
  );
  const fileBoundary = {
    exactThreeFileDiagnosticInventoryBeforeOutput: true,
    eachInputJsonReadExactlyOnce: true,
    canonicalJsonVerified: true,
    allInputAndOutputPathsAbsoluteAndDistinct: true,
    allInputsRealStableRegularFiles: true,
    symlinksRejected: true,
    fileIdentityCollisionsRejected: true,
    outputInitiallyAbsent: true,
    outputCreation: "fsynced_sibling_temp_no_clobber_link",
    inputs: Object.fromEntries(inputDefinitions.map(([name]) => [
      name,
      { bytes: byName[name].bytes.byteLength, sha256: byName[name].sha256 },
    ])),
  };
  const receipt = verifyArtifactSet({
    crawleeDiagnostic: byName.crawleeRaw.value,
    crawleeDiagnosticBytes: byName.crawleeRaw.bytes,
    stasisDiagnostic: byName.stasisRaw.value,
    stasisDiagnosticBytes: byName.stasisRaw.bytes,
    composedEvidence: byName.composedEvidence.value,
    composedEvidenceBytes: byName.composedEvidence.bytes,
    authoritativeRaw: byName.freshAuthorityRaw.value,
    authoritativeRawBytes: byName.freshAuthorityRaw.bytes,
    authoritativeRawSha256: byName.freshAuthorityRaw.sha256,
    artifactBindingReceipt: byName.artifactBindingReceipt.value,
    artifactBindingReceiptBytes: byName.artifactBindingReceipt.bytes,
    fileBoundary,
  });
  assertReceipt(receipt);
  await writeReceipt(parsed.outputPath, receipt);

  const cliReceipt = deepFreeze({
    schema: crawlPhaseDiagnosticVerificationCliSchema,
    status: "passed",
    command: parsed.command,
    receiptSchema: crawlPhaseDiagnosticVerificationSchema,
    outputCreatedExclusively: true,
    outputName: crawlPhaseDiagnosticVerificationOutputName,
  });
  writeOutput(`${JSON.stringify(cliReceipt, null, 2)}\n`);
  return { receipt, cliReceipt };
}

export async function readCanonicalStableRegularFile(filePath, label, {
  readBytes = readFile,
  inspectPath = inspectPathWithBigInt,
  resolvePath = realpath,
} = {}) {
  const before = await assertRealRegularFile(filePath, label, { inspectPath, resolvePath });
  if (before.size > maximumJsonBytes) {
    throw new TypeError(`${label} exceeds the diagnostic JSON byte limit`);
  }
  const bytes = await readBytes(filePath);
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError(`${label} reader did not return exact bytes`);
  }
  const after = await assertRealRegularFile(filePath, label, { inspectPath, resolvePath });
  if (!sameFileSnapshot(before, after) || bytes.byteLength !== before.size) {
    throw new TypeError(`${label} changed during its single offline read`);
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    throw new TypeError(`${label} is not valid UTF-8`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${label} is invalid JSON`, { cause: error });
  }
  const canonical = Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
  if (!canonical.equals(bytes)) {
    throw new TypeError(`${label} is not canonical deterministic JSON`);
  }
  return Object.freeze({
    value,
    bytes: Buffer.from(bytes),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    device: before.dev,
    inode: before.ino,
    realPath: before.realPath,
  });
}

export async function writeFreshCanonicalJson(filePath, value, {
  openFile = open,
  createLink = link,
  readBack = readFile,
  removeFile = unlink,
  inspectPath = inspectPathWithBigInt,
  resolvePath = realpath,
} = {}) {
  const text = `${JSON.stringify(value, jsonReplacer, 2)}\n`;
  const expected = Buffer.from(text, "utf8");
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let promoted = false;
  try {
    const handle = await openFile(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(expected);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await createLink(temporaryPath, filePath);
    promoted = true;
    const metadata = await assertRealRegularFile(filePath, "diagnostic verification output", {
      inspectPath,
      resolvePath,
    });
    if (metadata.size !== expected.byteLength) {
      throw new TypeError("Diagnostic verification output size changed after promotion");
    }
    const observed = await readBack(filePath);
    if (!Buffer.isBuffer(observed) || !observed.equals(expected)) {
      throw new TypeError("Diagnostic verification output readback mismatch");
    }
    await removeFile(temporaryPath);
  } catch (error) {
    await Promise.allSettled([
      removeFile(temporaryPath),
      ...(promoted ? [removeFile(filePath)] : []),
    ]);
    throw error;
  }
}

async function assertExactDiagnosticInventory(root, { readDirectory = readdir } = {}) {
  const entries = await readDirectory(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  const expected = [...crawlPhaseDiagnosticVerificationFileNames].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index]) ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  ) {
    throw new TypeError(
      `Diagnostic input inventory must be exactly ${JSON.stringify(expected)}`,
    );
  }
}

async function assertFreshOutputPath(
  filePath,
  { inspectPath = inspectPathWithBigInt, resolvePath = realpath } = {},
) {
  await assertRealDirectory(path.dirname(filePath), "diagnostic output directory", {
    inspectPath,
    resolvePath,
  });
  try {
    const metadata = await inspectPath(filePath);
    if (metadata.isSymbolicLink()) {
      throw new TypeError("Diagnostic verification output path must not be a symbolic link");
    }
    throw new TypeError("Diagnostic verification output must not already exist");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function assertRealRegularFile(filePath, label, { inspectPath, resolvePath }) {
  const metadata = await inspectPath(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TypeError(`${label} must be one real regular file`);
  }
  const resolved = await resolvePath(filePath);
  if (!samePath(resolved, filePath)) {
    throw new TypeError(`${label} must not resolve through a symbolic link or path alias`);
  }
  const size = exactSafeInteger(metadata.size, `${label} size`);
  return Object.freeze({
    dev: metadata.dev,
    ino: metadata.ino,
    size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
    realPath: path.resolve(resolved),
  });
}

function exactSafeInteger(value, label) {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return number;
}

async function assertRealDirectory(directoryPath, label, { inspectPath, resolvePath }) {
  const metadata = await inspectPath(directoryPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new TypeError(`${label} must be one real directory`);
  }
  const resolved = await resolvePath(directoryPath);
  if (!samePath(resolved, directoryPath)) {
    throw new TypeError(`${label} must not resolve through a symbolic link or path alias`);
  }
}

function assertDistinctFileIdentities(records) {
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      if (
        samePath(records[left].realPath, records[right].realPath) ||
        (records[left].device === records[right].device &&
          records[left].inode === records[right].inode)
      ) {
        throw new TypeError("Diagnostic verifier inputs contain a file-identity collision");
      }
    }
  }
}

function assertDistinctPaths(paths) {
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      if (samePath(paths[left], paths[right])) {
        throw new TypeError("Diagnostic verifier input and output paths must all be distinct");
      }
    }
  }
}

function requiredAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be one explicit absolute path`);
  }
  return path.resolve(value);
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    samePath(left.realPath, right.realPath);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

if (
  process.argv[1] !== undefined &&
  samePath(fileURLToPath(import.meta.url), process.argv[1])
) {
  try {
    await runCrawlPhaseDiagnosticVerificationCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
