import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildNavigationCausalPublicationDirectory,
  verifyNavigationCausalPublicationDirectory,
} from "./navigation-causal-publication.mjs";
import {
  verifyAnonymousNavigationCausalContractPreflight,
  verifyAnonymousNavigationCausalPreflightRelease,
  verifyAnonymousNavigationCausalPublicRelease,
} from "./navigation-causal-public-verification.mjs";

export const navigationCausalPublicationCliSchema =
  "stasis-v0.3.3-performance-navigation-causal-publication-cli-v1";
export const navigationCausalPublicationCliUsage =
  "Usage: node src/performance/navigation-causal-publication-cli.mjs build <absolute-input-directory> <absolute-new-output-directory> <absolute-v4-tag-ref-json>|verify <absolute-publication-directory> <absolute-v4-tag-ref-json>|verify-contract-public <expected-h8b-sha> <absolute-new-receipt-json>|verify-preflight-public <expected-h8b-sha> <absolute-existing-preflight-receipt-json>|verify-public <expected-h8b-sha> <absolute-new-receipt-json>";

const gitShaPattern = /^[a-f0-9]{40}$/u;

export function parseNavigationCausalPublicationCommand(argv) {
  if (argv[0] === "build" && argv.length === 4) {
    return Object.freeze({
      command: "build",
      inputDirectory: absolute(argv[1], "input directory"),
      outputDirectory: absolute(argv[2], "output directory"),
      v4TagRefPath: absolute(argv[3], "V4 tag-ref JSON"),
    });
  }
  if (argv[0] === "verify" && argv.length === 3) {
    return Object.freeze({
      command: "verify",
      publicationDirectory: absolute(argv[1], "publication directory"),
      v4TagRefPath: absolute(argv[2], "V4 tag-ref JSON"),
    });
  }
  if (["verify-contract-public", "verify-public"].includes(argv[0]) && argv.length === 3) {
    if (!gitShaPattern.test(argv[1] ?? "")) {
      throw new TypeError("Navigation causal expected H8b target must be one lowercase Git SHA");
    }
    return Object.freeze({
      command: argv[0],
      expectedTargetSha: argv[1],
      receiptOutputPath: absolute(argv[2], "new anonymous receipt JSON"),
    });
  }
  if (argv[0] === "verify-preflight-public" && argv.length === 3) {
    if (!gitShaPattern.test(argv[1] ?? "")) {
      throw new TypeError("Navigation causal expected H8b target must be one lowercase Git SHA");
    }
    return Object.freeze({
      command: argv[0],
      expectedTargetSha: argv[1],
      receiptInputPath: absolute(argv[2], "existing anonymous preflight receipt JSON"),
    });
  }
  throw new TypeError(navigationCausalPublicationCliUsage);
}

export async function runNavigationCausalPublicationCli(
  argv,
  {
    buildDirectory = buildNavigationCausalPublicationDirectory,
    verifyDirectory = verifyNavigationCausalPublicationDirectory,
    verifyContractPublic = verifyAnonymousNavigationCausalContractPreflight,
    verifyPreflightPublic = verifyAnonymousNavigationCausalPreflightRelease,
    verifyPublic = verifyAnonymousNavigationCausalPublicRelease,
    readJson = readJsonFile,
    readBytes = readFile,
    writeReceipt = writeFreshReceipt,
    writeOutput = (value) => process.stdout.write(value),
    nodeVersion = process.version,
  } = {},
) {
  if (nodeVersion !== "v22.20.0") {
    throw new TypeError(`Navigation causal publication requires Node v22.20.0, received ${nodeVersion}`);
  }
  const parsed = parseNavigationCausalPublicationCommand(argv);
  let receipt;
  if (parsed.command === "build") {
    receipt = await buildDirectory(parsed.inputDirectory, parsed.outputDirectory, {
      v4TagRefRecord: await readJson(parsed.v4TagRefPath),
    });
  } else if (parsed.command === "verify") {
    receipt = await verifyDirectory(parsed.publicationDirectory, {
      v4TagRefRecord: await readJson(parsed.v4TagRefPath),
    });
  } else if (parsed.command === "verify-contract-public") {
    receipt = await verifyContractPublic({
      expectedContractTargetSha: parsed.expectedTargetSha,
    });
    await writeReceipt(parsed.receiptOutputPath, canonicalJson(receipt));
  } else if (parsed.command === "verify-preflight-public") {
    receipt = await verifyPreflightPublic({
      expectedContractTargetSha: parsed.expectedTargetSha,
      expectedReceiptBytes: await readBytes(parsed.receiptInputPath),
    });
  } else {
    receipt = await verifyPublic({ expectedReleaseTargetSha: parsed.expectedTargetSha });
    await writeReceipt(parsed.receiptOutputPath, canonicalJson(receipt));
  }
  const cliReceipt = Object.freeze({
    schema: navigationCausalPublicationCliSchema,
    status: "passed",
    command: parsed.command,
    resultSchema: receipt.schema,
    outcome: receipt.outcome ?? null,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
  writeOutput(canonicalJson(cliReceipt));
  return { receipt, cliReceipt };
}

async function readJsonFile(filePath) {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new TypeError(`Navigation causal JSON input is invalid: ${filePath}`, { cause: error });
  }
  return value;
}

async function writeFreshReceipt(filePath, content) {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function absolute(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`Navigation causal ${label} must be absolute`);
  }
  return path.resolve(value);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNavigationCausalPublicationCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
