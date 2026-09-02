import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { assertPostSupportArtifactPrivacy } from "../post-support/artifact-privacy.mjs";
import {
  assertFreshSealedArtifactRoot,
  jsonReplacer,
  writeJson,
  writeText,
} from "../shared/io.mjs";
import {
  assertCrawlPerformanceRaw,
} from "./crawl.mjs";
import {
  assertCombinedPerformanceEvidence,
  buildCombinedPerformanceEvidence,
  combinedPerformanceEvidenceSchema,
  renderCombinedPerformanceEvidenceMarkdown,
} from "./evidence.mjs";
import {
  assertRwaPerformanceRaw,
  rwaPerformanceProtocol,
  rwaPerformanceTrack,
} from "./rwa.mjs";

export const combinedPerformanceEvidenceJsonArtifactPath =
  "performance/combined-evidence.json";
export const combinedPerformanceEvidenceMarkdownArtifactPath =
  "performance/combined-evidence.md";
export const rwaPerformanceArtifactSchema =
  "stasis-v0.3.3-performance-rwa-artifact-v1";

const rwaArtifactKeys = Object.freeze([
  "authorityRaw",
  "host",
  "identities",
  "protocol",
  "provenance",
  "recordedAt",
  "schema",
  "sealedRuntime",
  "track",
]);
const rwaHostFactKeys = Object.freeze([
  "arch",
  "cpuModel",
  "imageOs",
  "imageVersion",
  "logicalCpuCount",
  "platform",
  "runnerOs",
]);

export function assertRwaPerformanceArtifact(
  value,
  {
    assertRaw = assertRwaPerformanceRaw,
    assertPrivacy = assertPostSupportArtifactPrivacy,
  } = {},
) {
  assertPrivacy(value);
  exactKeys(value, rwaArtifactKeys, "RWA performance artifact");
  if (
    value.schema !== rwaPerformanceArtifactSchema ||
    value.protocol !== rwaPerformanceProtocol ||
    value.track !== rwaPerformanceTrack ||
    !isCanonicalIsoInstant(value.recordedAt)
  ) {
    throw new TypeError("Invalid RWA performance artifact identity");
  }

  const raw = assertRaw(value.authorityRaw);
  if (
    raw.protocol !== value.protocol ||
    raw.track !== value.track ||
    raw.authority?.valid !== true ||
    raw.authority?.status !== "valid"
  ) {
    throw new TypeError("RWA performance artifact does not retain a valid matching raw authority");
  }

  exactKeys(value.host, [
    "classDigest",
    "facts",
    "machineInstanceSaltedDigest",
  ], "RWA performance artifact host");
  exactKeys(value.host.facts, rwaHostFactKeys, "RWA performance artifact host facts");
  const expectedFacts = Object.fromEntries(
    rwaHostFactKeys.map((key) => [key, raw.host[key]]),
  );
  if (
    !isDeepStrictEqual(value.host.facts, expectedFacts) ||
    value.host.classDigest !== raw.host.identityDigest ||
    value.host.machineInstanceSaltedDigest !== raw.host.instanceDigest
  ) {
    throw new TypeError("RWA performance artifact host bindings do not match its raw authority");
  }

  exactKeys(
    value.sealedRuntime,
    ["continuity", "postflight", "startup"],
    "RWA performance artifact sealed runtime",
  );
  exactKeys(
    value.sealedRuntime.continuity,
    [
      "immutableCheckoutIdentity",
      "sameFrozenServerHostProcesses",
      "shutdownAcknowledged",
    ],
    "RWA performance artifact continuity",
  );
  if (
    value.sealedRuntime.continuity.immutableCheckoutIdentity !== true ||
    value.sealedRuntime.continuity.sameFrozenServerHostProcesses !== true ||
    value.sealedRuntime.continuity.shutdownAcknowledged !== true
  ) {
    throw new TypeError("RWA performance artifact did not retain sealed runtime continuity");
  }
  return raw;
}

export async function combinePerformanceEvidenceFiles({
  rwaArtifactPath,
  crawlRawPath,
  readJsonFile = readCanonicalJsonFile,
  assertRwaArtifact = assertRwaPerformanceArtifact,
  assertCrawlRaw = assertCrawlPerformanceRaw,
  buildEvidence = buildCombinedPerformanceEvidence,
  assertEvidence = assertCombinedPerformanceEvidence,
  renderEvidence = renderCombinedPerformanceEvidenceMarkdown,
  assertPrivacy = assertPostSupportArtifactPrivacy,
  assertFreshArtifactRoot = assertFreshSealedArtifactRoot,
  writeEvidenceJson = writeJson,
  writeEvidenceText = writeText,
} = {}) {
  const rwaPath = requiredAbsolutePath(rwaArtifactPath, "RWA hosted artifact");
  const crawlPath = requiredAbsolutePath(crawlRawPath, "crawl hosted raw artifact");
  const [rwaArtifact, crawlValue] = await Promise.all([
    readJsonFile(rwaPath, "RWA hosted artifact"),
    readJsonFile(crawlPath, "crawl hosted raw artifact"),
  ]);
  const rwaRaw = assertRwaArtifact(rwaArtifact);
  const crawlRaw = assertCrawlRaw(crawlValue);
  const evidence = buildEvidence({ rwaRaw, crawlRaw });
  assertEvidence(evidence, { rwaRaw, crawlRaw });
  assertPrivacy(evidence);
  const markdown = renderEvidence(evidence);
  assertPrivacy(markdown);

  const artifactRoot = await assertFreshArtifactRoot();
  const evidencePath = await writeEvidenceJson(
    combinedPerformanceEvidenceJsonArtifactPath,
    evidence,
  );
  const markdownPath = await writeEvidenceText(
    combinedPerformanceEvidenceMarkdownArtifactPath,
    markdown,
  );
  return Object.freeze({
    artifactRoot,
    evidencePath,
    markdownPath,
    evidence,
  });
}

export async function verifyCombinedPerformanceEvidenceFiles({
  rwaArtifactPath,
  crawlRawPath,
  evidencePath,
  markdownPath,
  readJsonFile = readCanonicalJsonFile,
  readTextFile = readFile,
  assertRwaArtifact = assertRwaPerformanceArtifact,
  assertCrawlRaw = assertCrawlPerformanceRaw,
  assertEvidence = assertCombinedPerformanceEvidence,
  renderEvidence = renderCombinedPerformanceEvidenceMarkdown,
  assertPrivacy = assertPostSupportArtifactPrivacy,
} = {}) {
  const paths = {
    rwa: requiredAbsolutePath(rwaArtifactPath, "RWA hosted artifact"),
    crawl: requiredAbsolutePath(crawlRawPath, "crawl hosted raw artifact"),
    evidence: requiredAbsolutePath(evidencePath, "combined evidence JSON"),
    markdown: requiredAbsolutePath(markdownPath, "combined evidence Markdown"),
  };
  const [rwaArtifact, crawlValue, evidence, markdown] = await Promise.all([
    readJsonFile(paths.rwa, "RWA hosted artifact"),
    readJsonFile(paths.crawl, "crawl hosted raw artifact"),
    readJsonFile(paths.evidence, "combined evidence JSON"),
    readTextFile(paths.markdown, "utf8"),
  ]);
  const rwaRaw = assertRwaArtifact(rwaArtifact);
  const crawlRaw = assertCrawlRaw(crawlValue);
  assertEvidence(evidence, { rwaRaw, crawlRaw });
  assertPrivacy(evidence);
  const expectedMarkdown = renderEvidence(evidence);
  assertPrivacy(expectedMarkdown);
  if (markdown !== expectedMarkdown) {
    throw new TypeError(
      "Combined performance evidence Markdown does not replay exactly from the retained JSON",
    );
  }
  return Object.freeze({
    schema: "stasis-v0.3.3-combined-performance-verification-v1",
    status: "passed",
    combinedEvidenceSchema: combinedPerformanceEvidenceSchema,
    rwaArtifactSchema: rwaPerformanceArtifactSchema,
    rwaRawSchema: rwaRaw.schema,
    crawlRawSchema: crawlRaw.schema,
    markdownReplayVerified: true,
  });
}

export async function readCanonicalJsonFile(filePath, label = "JSON input") {
  const absolutePath = requiredAbsolutePath(filePath, label);
  let text;
  let value;
  try {
    text = await readFile(absolutePath, "utf8");
    value = JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${label} is absent or invalid JSON`, { cause: error });
  }
  const canonical = `${JSON.stringify(value, jsonReplacer, 2)}\n`;
  if (text !== canonical) {
    throw new TypeError(`${label} is not canonical deterministic JSON`);
  }
  return value;
}

export function requiredAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be one explicit absolute path`);
  }
  return path.resolve(value);
}

function isCanonicalIsoInstant(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function exactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())
  ) {
    throw new TypeError(`Invalid ${label}`);
  }
}
