import { randomUUID } from "node:crypto";
import { link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { jsonReplacer } from "../shared/io.mjs";
import {
  buildPerformanceReplicationPublicationDirectory,
  performanceReplicationPublicationAssetNames,
  verifyPerformanceReplicationPublicationDirectory,
} from "./replication-publication.mjs";
import {
  verifyAnonymousPerformanceReplicationPublicRelease,
} from "./replication-public-release.mjs";

export const performanceReplicationPublicationCliSchema =
  "stasis-v0.3.3-performance-replication-publication-cli-v1";

export const performanceReplicationPublicationCliUsage =
  "Usage: node src/performance/replication-publication-cli.mjs build <absolute-26-payload-directory> <absolute-fresh-28-publication-directory>|verify <absolute-28-publication-directory>|verify-public <absolute-28-publication-directory> <expected-evidence-target-sha> <absolute-receipt-output-json>";

const gitShaPattern = /^[a-f0-9]{40}$/u;

export function parsePerformanceReplicationPublicationCommand(argv) {
  if (argv[0] === "build" && argv.length === 3) {
    const payloadDirectory = requiredAbsolutePath(argv[1], "replication payload directory");
    const outputDirectory = requiredAbsolutePath(argv[2], "replication publication directory");
    if (samePath(payloadDirectory, outputDirectory)) {
      throw new TypeError("Replication publication build paths must be distinct");
    }
    return Object.freeze({ command: "build", payloadDirectory, outputDirectory });
  }
  if (argv[0] === "verify" && argv.length === 2) {
    return Object.freeze({
      command: "verify",
      publicationDirectory: requiredAbsolutePath(
        argv[1],
        "replication publication directory",
      ),
    });
  }
  if (argv[0] === "verify-public" && argv.length === 4) {
    const publicationDirectory = requiredAbsolutePath(
      argv[1],
      "replication publication directory",
    );
    if (!gitShaPattern.test(argv[2] ?? "")) {
      throw new TypeError("Expected replication evidence target must be one lowercase Git SHA");
    }
    const receiptOutputPath = requiredAbsolutePath(
      argv[3],
      "anonymous release receipt output",
    );
    if (samePath(receiptOutputPath, publicationDirectory) || isWithinPath(receiptOutputPath, publicationDirectory)) {
      throw new TypeError("Anonymous release receipt must be outside the 28-asset publication");
    }
    return Object.freeze({
      command: "verify-public",
      publicationDirectory,
      expectedReleaseTargetSha: argv[2],
      receiptOutputPath,
    });
  }
  throw new TypeError(performanceReplicationPublicationCliUsage);
}

export async function runPerformanceReplicationPublicationCli(
  argv,
  {
    buildDirectory = buildPerformanceReplicationPublicationDirectory,
    verifyDirectory = verifyPerformanceReplicationPublicationDirectory,
    verifyPublic = verifyAnonymousPerformanceReplicationPublicRelease,
    assertReceiptBoundary = assertFreshPublicReceiptBoundary,
    writeReceipt = writeFreshReceipt,
    writeOutput = (value) => process.stdout.write(value),
  } = {},
) {
  const parsed = parsePerformanceReplicationPublicationCommand(argv);
  if (parsed.command === "build") {
    const receipt = await buildDirectory({
      payloadDirectory: parsed.payloadDirectory,
      outputDirectory: parsed.outputDirectory,
    });
    writeOutput(canonicalJson(receipt));
    return receipt;
  }
  if (parsed.command === "verify") {
    const receipt = await verifyDirectory({
      publicationDirectory: parsed.publicationDirectory,
    });
    writeOutput(canonicalJson(receipt));
    return receipt;
  }

  await assertReceiptBoundary({
    publicationDirectory: parsed.publicationDirectory,
    receiptOutputPath: parsed.receiptOutputPath,
  });
  const offlineReceipt = await verifyDirectory({
    publicationDirectory: parsed.publicationDirectory,
  });
  const expectedOfflineAssetMap = assetMapFromVerifiedReceipt(offlineReceipt);
  const receipt = await verifyPublic({
    expectedOfflineAssetMap,
    expectedReleaseTargetSha: parsed.expectedReleaseTargetSha,
  });
  await writeReceipt(parsed.receiptOutputPath, canonicalJson(receipt));
  const cliReceipt = deepFreeze({
    schema: performanceReplicationPublicationCliSchema,
    status: "passed",
    command: "verify-public",
    offlineReceiptSchema: offlineReceipt.schema,
    publicReceiptSchema: receipt.schema,
    exactOfflineByteMapDerived: true,
    outputCreatedExclusively: true,
  });
  writeOutput(canonicalJson(cliReceipt));
  return { offlineReceipt, receipt, cliReceipt };
}

export async function assertFreshPublicReceiptBoundary({
  publicationDirectory,
  receiptOutputPath,
} = {}) {
  const publication = requiredAbsolutePath(
    publicationDirectory,
    "replication publication directory",
  );
  const receipt = requiredAbsolutePath(
    receiptOutputPath,
    "anonymous release receipt output",
  );
  const publicationMetadata = await lstat(publication);
  const publicationReal = await realpath(publication);
  if (
    !publicationMetadata.isDirectory() ||
    publicationMetadata.isSymbolicLink() ||
    !samePath(publicationReal, publication)
  ) {
    throw new TypeError("Replication publication directory must be one real directory");
  }
  const receiptParent = path.dirname(receipt);
  const parentMetadata = await lstat(receiptParent);
  const parentReal = await realpath(receiptParent);
  if (
    !parentMetadata.isDirectory() ||
    parentMetadata.isSymbolicLink() ||
    !samePath(parentReal, receiptParent)
  ) {
    throw new TypeError("Anonymous release receipt parent must be one real directory");
  }
  const canonicalReceipt = path.join(parentReal, path.basename(receipt));
  if (
    samePath(canonicalReceipt, publicationReal) ||
    isWithinPath(canonicalReceipt, publicationReal)
  ) {
    throw new TypeError("Anonymous release receipt must be outside the real 28-asset publication");
  }
  try {
    await lstat(canonicalReceipt);
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ publicationReal, receipt: canonicalReceipt });
    throw error;
  }
  throw new TypeError("Anonymous release receipt output already exists");
}

export function assetMapFromVerifiedReceipt(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.status !== "passed" ||
    !Array.isArray(value.assets) ||
    value.assets.length !== 28
  ) {
    throw new TypeError("Offline publication receipt is not one passed 28-asset verification");
  }
  const result = {};
  for (const [index, asset] of value.assets.entries()) {
    if (
      asset === null ||
      typeof asset !== "object" ||
      asset.name !== performanceReplicationPublicationAssetNames[index] ||
      Reflect.ownKeys(asset).length !== 3 ||
      !["bytes", "name", "sha256"].every((key) => Object.hasOwn(asset, key)) ||
      Object.hasOwn(result, asset.name) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 1 ||
      !/^[a-f0-9]{64}$/u.test(asset.sha256 ?? "")
    ) {
      throw new TypeError("Offline publication receipt asset identity is invalid");
    }
    result[asset.name] = { bytes: asset.bytes, sha256: asset.sha256 };
  }
  return deepFreeze(result);
}

async function writeFreshReceipt(destination, text) {
  const temporaryPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let promoted = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(text, { encoding: "utf8" });
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporaryPath, destination);
    promoted = true;
    if (!(await readFile(destination)).equals(Buffer.from(text, "utf8"))) {
      throw new TypeError("Anonymous release receipt output readback mismatch");
    }
    await unlink(temporaryPath);
  } catch (error) {
    await Promise.allSettled([unlink(temporaryPath)]);
    if (promoted) await Promise.allSettled([unlink(destination)]);
    throw error;
  }
}

function requiredAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be one explicit absolute path`);
  }
  return path.resolve(value);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, jsonReplacer, 2)}\n`;
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isWithinPath(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
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
  await runPerformanceReplicationPublicationCli(process.argv.slice(2));
}
