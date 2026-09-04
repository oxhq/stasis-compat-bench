import { randomUUID } from "node:crypto";
import { link, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { jsonReplacer } from "../shared/io.mjs";
import {
  buildCrawlPhaseDiagnosticPublicationDirectory,
  crawlPhaseDiagnosticOutcomeClasses,
  crawlPhaseDiagnosticPublicationAssetNamesByOutcome,
  crawlPhaseDiagnosticPublicationSchema,
  verifyCrawlPhaseDiagnosticPublicationDirectory,
} from "./crawl-phase-diagnostic-publication.mjs";
import {
  crawlPhaseDiagnosticAnonymousReleaseVerificationSchema,
  verifyAnonymousCrawlPhaseDiagnosticPublicRelease,
} from "./crawl-phase-diagnostic-public-release.mjs";

export const crawlPhaseDiagnosticPublicationCliSchema =
  "stasis-v0.3.3-performance-crawl-phase-diagnostic-publication-cli-v1";

export const crawlPhaseDiagnosticPublicationCliUsage =
  "Usage: node src/performance/crawl-phase-diagnostic-publication-cli.mjs build <absolute-payload-directory> <absolute-fresh-publication-directory>|verify <absolute-publication-directory>|verify-public <absolute-publication-directory> <expected-diagnostic-target-sha> <absolute-receipt-output-json>";

const gitShaPattern = /^[a-f0-9]{40}$/u;

export function parseCrawlPhaseDiagnosticPublicationCommand(argv) {
  if (argv[0] === "build" && argv.length === 3) {
    const payloadDirectory = requiredAbsolutePath(argv[1], "diagnostic payload directory");
    const outputDirectory = requiredAbsolutePath(argv[2], "diagnostic publication directory");
    if (samePath(payloadDirectory, outputDirectory)) {
      throw new TypeError("Diagnostic publication build paths must be distinct");
    }
    return Object.freeze({ command: "build", payloadDirectory, outputDirectory });
  }
  if (argv[0] === "verify" && argv.length === 2) {
    return Object.freeze({
      command: "verify",
      publicationDirectory: requiredAbsolutePath(argv[1], "diagnostic publication directory"),
    });
  }
  if (argv[0] === "verify-public" && argv.length === 4) {
    const publicationDirectory = requiredAbsolutePath(argv[1], "diagnostic publication directory");
    if (!gitShaPattern.test(argv[2] ?? "")) {
      throw new TypeError("Expected diagnostic target must be one lowercase Git SHA");
    }
    const receiptOutputPath = requiredAbsolutePath(argv[3], "anonymous diagnostic receipt output");
    if (
      samePath(receiptOutputPath, publicationDirectory) ||
      isWithinPath(receiptOutputPath, publicationDirectory)
    ) {
      throw new TypeError("Anonymous diagnostic receipt must be outside publication assets");
    }
    return Object.freeze({
      command: "verify-public",
      publicationDirectory,
      expectedReleaseTargetSha: argv[2],
      receiptOutputPath,
    });
  }
  throw new TypeError(crawlPhaseDiagnosticPublicationCliUsage);
}

export async function runCrawlPhaseDiagnosticPublicationCli(
  argv,
  {
    buildDirectory = buildCrawlPhaseDiagnosticPublicationDirectory,
    verifyDirectory = verifyCrawlPhaseDiagnosticPublicationDirectory,
    verifyPublic = verifyAnonymousCrawlPhaseDiagnosticPublicRelease,
    assertReceiptBoundary = assertFreshCrawlPhaseDiagnosticPublicReceiptBoundary,
    writeReceipt = writeFreshReceipt,
    writeOutput = (value) => process.stdout.write(value),
  } = {},
) {
  const parsed = parseCrawlPhaseDiagnosticPublicationCommand(argv);
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
  const expectedOfflineAssetMap = diagnosticAssetMapFromVerifiedReceipt(offlineReceipt);
  const receipt = await verifyPublic({
    expectedOfflineAssetMap,
    expectedReleaseTargetSha: parsed.expectedReleaseTargetSha,
  });
  assertAnonymousReceiptBoundary(receipt, offlineReceipt.outcomeClass);
  await writeReceipt(parsed.receiptOutputPath, canonicalJson(receipt));
  const cliReceipt = deepFreeze({
    schema: crawlPhaseDiagnosticPublicationCliSchema,
    status: receipt.status,
    outcomeClass: offlineReceipt.outcomeClass,
    command: "verify-public",
    offlineReceiptSchema: offlineReceipt.schema,
    publicReceiptSchema: receipt.schema,
    exactOutcomeSpecificOfflineByteMapDerived: true,
    outputCreatedExclusively: true,
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
  writeOutput(canonicalJson(cliReceipt));
  return { offlineReceipt, receipt, cliReceipt };
}

function assertAnonymousReceiptBoundary(value, outcomeClass) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.schema !== crawlPhaseDiagnosticAnonymousReleaseVerificationSchema ||
    value.status !== "passed" ||
    value.diagnosticStatus !==
      (outcomeClass === "VALID_NON_AUTHORITATIVE" ? "passed" : "failed") ||
    value.outcomeClass !== outcomeClass ||
    value.authorityEligible !== false ||
    value.timingEligible !== false ||
    value.statisticsEligible !== false ||
    value.comparisonEligible !== false ||
    value.optimizationEligible !== false ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false ||
    value.decisionState !== "STAY_0_4_UNASSIGNED"
  ) {
    throw new TypeError("Anonymous diagnostic public verification receipt is invalid");
  }
  return value;
}

export function diagnosticAssetMapFromVerifiedReceipt(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.schema !== crawlPhaseDiagnosticPublicationSchema ||
    value.status !== "passed" ||
    !crawlPhaseDiagnosticOutcomeClasses.includes(value.outcomeClass) ||
    value.authorityEligible !== false ||
    value.timingEligible !== false ||
    value.statisticsEligible !== false ||
    value.comparisonEligible !== false ||
    value.optimizationEligible !== false ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    !Array.isArray(value.assets)
  ) {
    throw new TypeError("Offline diagnostic publication receipt is invalid");
  }
  const names = crawlPhaseDiagnosticPublicationAssetNamesByOutcome[value.outcomeClass];
  if (value.assets.length !== names.length) {
    throw new TypeError("Offline diagnostic publication receipt asset count is invalid");
  }
  const result = {};
  for (const [index, asset] of value.assets.entries()) {
    if (
      asset === null ||
      typeof asset !== "object" ||
      Reflect.ownKeys(asset).length !== 3 ||
      !["name", "bytes", "sha256"].every((key) => Object.hasOwn(asset, key)) ||
      asset.name !== names[index] ||
      Object.hasOwn(result, asset.name) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 1 ||
      !/^[a-f0-9]{64}$/u.test(asset.sha256 ?? "")
    ) {
      throw new TypeError("Offline diagnostic publication asset identity is invalid");
    }
    result[asset.name] = { bytes: asset.bytes, sha256: asset.sha256 };
  }
  return deepFreeze(result);
}

export async function assertFreshCrawlPhaseDiagnosticPublicReceiptBoundary({
  publicationDirectory,
  receiptOutputPath,
} = {}) {
  const publication = requiredAbsolutePath(publicationDirectory, "diagnostic publication directory");
  const receipt = requiredAbsolutePath(receiptOutputPath, "anonymous diagnostic receipt output");
  const publicationMetadata = await lstat(publication);
  const publicationReal = await realpath(publication);
  if (
    !publicationMetadata.isDirectory() ||
    publicationMetadata.isSymbolicLink() ||
    !samePath(publicationReal, publication)
  ) {
    throw new TypeError("Diagnostic publication directory must be one real directory");
  }
  const parent = path.dirname(receipt);
  const parentMetadata = await lstat(parent);
  const parentReal = await realpath(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || !samePath(parentReal, parent)) {
    throw new TypeError("Anonymous diagnostic receipt parent must be one real directory");
  }
  const canonicalReceipt = path.join(parentReal, path.basename(receipt));
  if (
    samePath(canonicalReceipt, publicationReal) ||
    isWithinPath(canonicalReceipt, publicationReal)
  ) {
    throw new TypeError("Anonymous diagnostic receipt must be outside real publication assets");
  }
  try {
    await lstat(canonicalReceipt);
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ publicationReal, receipt: canonicalReceipt });
    throw error;
  }
  throw new TypeError("Anonymous diagnostic receipt output already exists");
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
      throw new TypeError("Anonymous diagnostic receipt readback mismatch");
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
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
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
  await runCrawlPhaseDiagnosticPublicationCli(process.argv.slice(2));
}
