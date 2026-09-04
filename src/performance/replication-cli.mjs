import { createHash, randomUUID } from "node:crypto";
import { link, open, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertCombinedPerformanceEvidence } from "./evidence.mjs";
import { requiredAbsolutePath } from "./publication.mjs";
import {
  bindPerformanceReplicationArtifacts,
} from "./replication-artifact-binding.mjs";
import {
  performanceReplicationVerificationSchema,
  publishedPerformanceAssetDigests,
  verifyFreshHostPerformanceReplication,
} from "./replication.mjs";
import {
  performanceReplicationExpectedArtifactNames,
  verifyPerformanceReplicationHostedProvenance,
} from "./replication-hosted-provenance.mjs";
import { jsonReplacer } from "../shared/io.mjs";

export const performanceReplicationCliReceiptSchema =
  "stasis-v0.3.3-performance-replication-cli-v1";

export const performanceReplicationCliUsage =
  "Usage: node src/performance/replication-cli.mjs verify-raws <absolute-original-rwa-json> <absolute-original-crawl-json> <absolute-original-combined-json> <absolute-fresh-rwa-json> <absolute-fresh-crawl-json> <absolute-fresh-combined-json> <absolute-receipt-output-json> <absolute-markdown-output>|verify-hosted <absolute-run-json> <absolute-workflow-runs-json> <absolute-jobs-json> <absolute-artifacts-json> <absolute-contract-release-json> <absolute-contract-commit-json> <absolute-receipt-output-json>|verify-artifacts <absolute-semantic-receipt-json> <absolute-hosted-receipt-json> <absolute-source-metadata-zip> <absolute-rwa-raw-zip> <absolute-rwa-logs-zip> <absolute-crawl-raw-zip> <absolute-crawl-logs-zip> <absolute-combined-zip> <absolute-combined-logs-zip> <absolute-binding-output-json>";

export function parsePerformanceReplicationCommand(argv) {
  if (argv[0] === "verify-raws" && argv.length === 9) {
    return commandWithDistinctPaths("verify-raws", [
      ["originalRwaPath", argv[1], "original RWA artifact"],
      ["originalCrawlPath", argv[2], "original crawl raw result"],
      ["originalCombinedPath", argv[3], "original combined evidence"],
      ["freshRwaPath", argv[4], "fresh RWA artifact"],
      ["freshCrawlPath", argv[5], "fresh crawl raw result"],
      ["freshCombinedPath", argv[6], "fresh combined evidence"],
      ["receiptOutputPath", argv[7], "replication receipt output"],
      ["markdownOutputPath", argv[8], "replication Markdown output"],
    ]);
  }
  if (argv[0] === "verify-hosted" && argv.length === 8) {
    return commandWithDistinctPaths("verify-hosted", [
      ["runPath", argv[1], "hosted run JSON"],
      ["workflowRunsPath", argv[2], "hosted workflow-runs JSON"],
      ["jobsPath", argv[3], "hosted jobs JSON"],
      ["artifactsPath", argv[4], "hosted artifacts JSON"],
      ["contractReleasePath", argv[5], "contract release JSON"],
      ["contractCommitPath", argv[6], "contract commit JSON"],
      ["receiptOutputPath", argv[7], "hosted provenance receipt output"],
    ]);
  }
  if (argv[0] === "verify-artifacts" && argv.length === 11) {
    return commandWithDistinctPaths("verify-artifacts", [
      ["semanticReceiptPath", argv[1], "semantic replication receipt"],
      ["hostedReceiptPath", argv[2], "hosted provenance receipt"],
      ...performanceReplicationExpectedArtifactNames.map((name, index) => [
        `artifactZipPath${index}`,
        argv[index + 3],
        `Actions artifact ZIP ${name}`,
      ]),
      ["receiptOutputPath", argv[10], "artifact binding receipt output"],
    ]);
  }
  throw new TypeError(performanceReplicationCliUsage);
}

export async function runPerformanceReplicationCli(
  argv,
  {
    readBytes = readFile,
    expectedOriginalDigests = publishedPerformanceAssetDigests,
    verifyRaws = verifyFreshHostPerformanceReplication,
    assertCombined = assertCombinedPerformanceEvidence,
    verifyHosted = verifyPerformanceReplicationHostedProvenance,
    bindArtifacts = bindPerformanceReplicationArtifacts,
    writeFreshFiles = writeFreshUtf8Files,
    writeOutput = (value) => process.stdout.write(value),
  } = {},
) {
  const parsed = parsePerformanceReplicationCommand(argv);
  if (parsed.command === "verify-raws") {
    const [
      originalRwa,
      originalCrawl,
      originalCombined,
      freshRwa,
      freshCrawl,
      freshCombined,
    ] = await Promise.all([
      readCanonicalJsonBytes(parsed.originalRwaPath, "original RWA artifact", {
        readBytes,
        expectedSha256: expectedOriginalDigests.rwaRawJson,
      }),
      readCanonicalJsonBytes(parsed.originalCrawlPath, "original crawl raw result", {
        readBytes,
        expectedSha256: expectedOriginalDigests.crawlRawJson,
      }),
      readCanonicalJsonBytes(parsed.originalCombinedPath, "original combined evidence", {
        readBytes,
        expectedSha256: expectedOriginalDigests.combinedEvidenceJson,
      }),
      readCanonicalJsonBytes(parsed.freshRwaPath, "fresh RWA artifact", { readBytes }),
      readCanonicalJsonBytes(parsed.freshCrawlPath, "fresh crawl raw result", { readBytes }),
      readCanonicalJsonBytes(parsed.freshCombinedPath, "fresh combined evidence", { readBytes }),
    ]);
    const semanticReceipt = verifyRaws({
      original: { rwaArtifact: originalRwa.value, crawlRaw: originalCrawl.value },
      fresh: { rwaArtifact: freshRwa.value, crawlRaw: freshCrawl.value },
    });
    assertCombined(originalCombined.value, {
      rwaRaw: originalRwa.value.authorityRaw,
      crawlRaw: originalCrawl.value,
    });
    assertCombined(freshCombined.value, {
      rwaRaw: freshRwa.value.authorityRaw,
      crawlRaw: freshCrawl.value,
    });
    const receipt = deepFreeze({
      ...semanticReceipt,
      fileBoundary: {
        originalAssetSha256Verified: true,
        canonicalJsonVerified: true,
        allInputAndOutputPathsDistinct: true,
        outputCreation: "fsynced_sibling_temp_no_clobber_link",
        authoritativeReceiptPromotedLast: true,
        inputs: {
          original: {
            rwa: fileIdentity(originalRwa),
            crawl: fileIdentity(originalCrawl),
            combined: fileIdentity(originalCombined),
          },
          fresh: {
            rwa: fileIdentity(freshRwa),
            crawl: fileIdentity(freshCrawl),
            combined: fileIdentity(freshCombined),
          },
        },
      },
    });
    const markdown = renderPerformanceReplicationMarkdown(receipt);
    await writeFreshFiles([
      { path: parsed.markdownOutputPath, text: markdown },
      {
        path: parsed.receiptOutputPath,
        text: `${JSON.stringify(receipt, null, 2)}\n`,
      },
    ]);
    const cliReceipt = deepFreeze({
      schema: performanceReplicationCliReceiptSchema,
      status: "passed",
      command: parsed.command,
      receiptSchema: receipt.schema,
      outputsCreatedExclusively: true,
    });
    writeOutput(`${JSON.stringify(cliReceipt, null, 2)}\n`);
    return { receipt, markdown, cliReceipt };
  }

  if (parsed.command === "verify-artifacts") {
    const [semanticReceipt, hostedReceipt, ...artifactBuffers] = await Promise.all([
      readCanonicalJsonBytes(
        parsed.semanticReceiptPath,
        "semantic replication receipt",
        { readBytes },
      ),
      readCanonicalJsonBytes(parsed.hostedReceiptPath, "hosted provenance receipt", {
        readBytes,
      }),
      ...performanceReplicationExpectedArtifactNames.map((_name, index) =>
        readBytes(parsed[`artifactZipPath${index}`])),
    ]);
    const artifactZipBytes = Object.fromEntries(
      performanceReplicationExpectedArtifactNames.map((name, index) => {
        const bytes = artifactBuffers[index];
        if (!Buffer.isBuffer(bytes)) {
          throw new TypeError(`Actions artifact ZIP reader did not return bytes: ${name}`);
        }
        return [name, bytes];
      }),
    );
    const receipt = bindArtifacts({
      semanticReceipt: semanticReceipt.value,
      hostedReceipt: hostedReceipt.value,
      artifactZipBytes,
    });
    await writeFreshFiles([{
      path: parsed.receiptOutputPath,
      text: `${JSON.stringify(receipt, null, 2)}\n`,
    }]);
    const cliReceipt = deepFreeze({
      schema: performanceReplicationCliReceiptSchema,
      status: "passed",
      command: parsed.command,
      receiptSchema: receipt.schema,
      outputsCreatedExclusively: true,
      fileBoundary: {
        canonicalJsonVerified: true,
        allInputAndOutputPathsDistinct: true,
        outputCreation: "fsynced_sibling_temp_no_clobber_link",
        inputs: {
          semanticReceipt: fileIdentity(semanticReceipt),
          hostedReceipt: fileIdentity(hostedReceipt),
        },
      },
    });
    writeOutput(`${JSON.stringify(cliReceipt, null, 2)}\n`);
    return { receipt, cliReceipt };
  }

  const [
    runRecord,
    workflowRunsListing,
    jobsListing,
    artifactsListing,
    contractReleaseRecord,
    contractCommitRecord,
  ] = await Promise.all([
    readCanonicalJsonBytes(parsed.runPath, "hosted run JSON", { readBytes }),
    readCanonicalJsonBytes(parsed.workflowRunsPath, "hosted workflow-runs JSON", { readBytes }),
    readCanonicalJsonBytes(parsed.jobsPath, "hosted jobs JSON", { readBytes }),
    readCanonicalJsonBytes(parsed.artifactsPath, "hosted artifacts JSON", { readBytes }),
    readCanonicalJsonBytes(parsed.contractReleasePath, "contract release JSON", { readBytes }),
    readCanonicalJsonBytes(parsed.contractCommitPath, "contract commit JSON", { readBytes }),
  ]);
  const receipt = verifyHosted({
    runRecord: runRecord.value,
    workflowRunsListing: workflowRunsListing.value,
    jobsListing: jobsListing.value,
    artifactsListing: artifactsListing.value,
    contractReleaseRecord: contractReleaseRecord.value,
    contractCommitRecord: contractCommitRecord.value,
  });
  await writeFreshFiles([{
    path: parsed.receiptOutputPath,
    text: `${JSON.stringify(receipt, null, 2)}\n`,
  }]);
  const cliReceipt = deepFreeze({
    schema: performanceReplicationCliReceiptSchema,
    status: "passed",
    command: parsed.command,
    receiptSchema: receipt.schema,
    outputsCreatedExclusively: true,
    fileBoundary: {
      canonicalJsonVerified: true,
      allInputAndOutputPathsDistinct: true,
      outputCreation: "fsynced_sibling_temp_no_clobber_link",
      inputs: {
        run: fileIdentity(runRecord),
        workflowRuns: fileIdentity(workflowRunsListing),
        jobs: fileIdentity(jobsListing),
        artifacts: fileIdentity(artifactsListing),
        contractRelease: fileIdentity(contractReleaseRecord),
        contractCommit: fileIdentity(contractCommitRecord),
      },
    },
  });
  writeOutput(`${JSON.stringify(cliReceipt, null, 2)}\n`);
  return { receipt, cliReceipt };
}

export async function readCanonicalJsonBytes(
  filePath,
  label,
  { readBytes = readFile, expectedSha256 } = {},
) {
  const bytes = await readBytes(filePath);
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError(`${label} reader did not return bytes`);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== undefined && sha256 !== expectedSha256) {
    throw new TypeError(`${label} bytes do not match the published SHA-256`);
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
  return Object.freeze({ value, bytes: bytes.byteLength, sha256 });
}

export function renderPerformanceReplicationMarkdown(receipt) {
  if (
    receipt?.schema !== performanceReplicationVerificationSchema ||
    receipt?.protocolStatus !== "protocol_valid" ||
    receipt?.pooling !== "none" ||
    receipt?.decisionState !== "STAY_0_4_UNASSIGNED" ||
    receipt?.generalizedSpeedClaimAuthorized !== false ||
    receipt?.implementationWorkAuthorized !== false
  ) {
    throw new TypeError("Cannot render an invalid performance replication receipt");
  }

  return [
    "# Stasis v0.3.3 performance replication",
    "",
    "The original and fresh results below are separate single-host observations. No samples are pooled across hosts or tracks. This evidence does not authorize a generalized speed claim or product implementation work.",
    "",
    ...renderTrack("RWA: Cypress versus Stasis", receipt.tracks.rwa),
    "",
    ...renderTrack("Deterministic crawl: Crawlee versus Stasis", receipt.tracks.crawl),
    "",
    `Decision state: ${codeSpan(receipt.decisionState)}.`,
    "",
  ].join("\n");
}

async function writeFreshUtf8Files(entries) {
  const staged = [];
  const promoted = [];
  try {
    for (const entry of entries) {
      await mkdir(path.dirname(entry.path), { recursive: true });
      const temporaryPath = path.join(
        path.dirname(entry.path),
        `.${path.basename(entry.path)}.${process.pid}.${randomUUID()}.tmp`,
      );
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(entry.text, { encoding: "utf8" });
        await handle.sync();
      } finally {
        await handle.close();
      }
      staged.push({ ...entry, temporaryPath });
    }
    for (const entry of staged) {
      await link(entry.temporaryPath, entry.path);
      promoted.push(entry.path);
      const finalBytes = await readFile(entry.path);
      if (!finalBytes.equals(Buffer.from(entry.text, "utf8"))) {
        throw new TypeError(`Replication output readback mismatch: ${entry.path}`);
      }
      await unlink(entry.temporaryPath);
    }
  } catch (error) {
    await Promise.allSettled(staged.map(({ temporaryPath }) => unlink(temporaryPath)));
    await Promise.allSettled(promoted.map((createdPath) => unlink(createdPath)));
    throw error;
  }
}

function renderTrack(title, track) {
  return [
    `## ${title}`,
    "",
    `Protocol: ${codeSpan(track.protocolStatus)}. Scientific identity: ${codeSpan(track.scientificIdentityStatus)}.`,
    "",
    ...renderObservation("Published original", track, track.observations.original),
    "",
    ...renderObservation("Fresh replication", track, track.observations.fresh),
    "",
    `Fresh ratio relation to 1: ${codeSpan(track.freshRatioRelationToOne)}.`,
    `Outcome: ${codeSpan(track.outcome)}.`,
  ];
}

function renderObservation(label, track, observation) {
  const baselineName = track.baseline === "cypress" ? "Cypress" : "Crawlee";
  const statistics = observation.statistics;
  const host = observation.host;
  return [
    `### ${label}`,
    "",
    `- Host: ${codeSpan(`${host.platform}/${host.arch}`)}; runner image ${codeSpan(`${host.imageOs} ${host.imageVersion}`)}; CPU ${codeSpan(host.cpuModel)}; logical CPUs ${codeSpan(host.logicalCpuCount)}.`,
    `- Host binding: ${codeSpan(`${observation.hostBinding.field}=${observation.hostBinding.digest}`)}.`,
    `- Workflow run: ${codeSpan(observation.workflow.runId)}, attempt ${codeSpan(observation.workflow.runAttempt)}, job ${codeSpan(observation.workflow.jobs[track.baseline === "cypress" ? "rwa" : "crawl"])}.`,
    `- ${baselineName} median / IQR: ${statistics[track.baseline].medianMilliseconds} ms / ${statistics[track.baseline].iqrMilliseconds} ms.`,
    `- Stasis median / IQR: ${statistics.stasis.medianMilliseconds} ms / ${statistics.stasis.iqrMilliseconds} ms.`,
    `- Median paired ${baselineName}-over-Stasis ratio: ${statistics.pairedBaselineOverCandidate.decimal}x (${codeSpan(observation.ratioDirection)}).`,
  ];
}

function commandWithDistinctPaths(command, definitions) {
  const parsed = { command };
  for (const [key, value, label] of definitions) {
    parsed[key] = requiredAbsolutePath(value, label);
  }
  const paths = definitions.map(([key]) => parsed[key]);
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      if (samePath(paths[left], paths[right])) {
        throw new TypeError("Replication CLI input and output paths must all be distinct");
      }
    }
  }
  return Object.freeze(parsed);
}

function fileIdentity(record) {
  return { bytes: record.bytes, sha256: record.sha256 };
}

function codeSpan(value) {
  const text = String(value).replace(/[\r\n]/gu, " ");
  const runs = text.match(/`+/gu) ?? [];
  const fenceLength = Math.max(1, ...runs.map((run) => run.length + 1));
  const fence = "`".repeat(fenceLength);
  const padded = text.startsWith("`") || text.endsWith("`")
    ? ` ${text} `
    : text;
  return `${fence}${padded}${fence}`;
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
  await runPerformanceReplicationCli(process.argv.slice(2));
}
