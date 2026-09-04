import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";

import {
  assertExactFileInventory,
  listRegularFiles,
  sha256DirectoryTree,
} from "../shared/io.mjs";

const execFileAsync = promisify(execFile);
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sha256Pattern = /^[a-f0-9]{64}$/u;
const sourceRevision = "cbdea4ae0c4c3c28a83a8f7bc1529a1889e0e407";
const receiptRelativePath = "publication/path-projection-receipt.json";
const normalizationToken = "<machine-local-value>";
const normalizedJsonAlgorithm = "sha256-canonical-json-pointer-redaction-v1";
const normalizedLineAlgorithm = "sha256-single-line-redaction-v1";
const normalizedIndexAlgorithm = "sha256-canonical-index-reference-redaction-v1";
const normalizedDecisionAlgorithm = "sha256-decision-index-binding-redaction-v1";

const deterministicPlaywrightPath =
  "test/fixtures/deterministic-v03/stasis-post-0.3-census-v1/deterministic/playwright-raw.json";
const deterministicStasisPath =
  "test/fixtures/deterministic-v03/stasis-post-0.3-census-v1/deterministic/stasis-raw.json";
const rwaStasisPath = "test/fixtures/rwa-hosted/rwa/stasis-raw.json";
const rwaAuditPath = "test/fixtures/rwa-hosted/audit.json";
const rwaRunnerStdoutPath = "test/fixtures/rwa-hosted/runner.stdout.log";
const deterministicIndexPath = "test/fixtures/deterministic-v03/artifact-index.json";
const rwaIndexPath = "test/fixtures/rwa-hosted/artifact-index.json";
const decisionPath = "src/wild/decision.mjs";

const jsonProjectionConfigs = Object.freeze([
  Object.freeze({
    path: deterministicPlaywrightPath,
    pointers: Object.freeze(["/versions/chromiumExecutable"]),
    projectedValues: Object.freeze({
      "/versions/chromiumExecutable": "retained-browser/chromium-1234/chrome.exe",
    }),
  }),
  Object.freeze({
    path: deterministicStasisPath,
    pointers: Object.freeze(["/versions/executablePath"]),
    projectedValues: Object.freeze({
      "/versions/executablePath": "candidate/stasis-0.3.0-windows-x86_64-ci/stasis.exe",
    }),
  }),
  Object.freeze({
    path: rwaStasisPath,
    pointers: Object.freeze(["/versions/executablePath"]),
    projectedValues: Object.freeze({
      "/versions/executablePath": "retained-inputs/stasis-0.3.0-windows-x86_64-ci/stasis.exe",
    }),
  }),
  Object.freeze({
    path: rwaAuditPath,
    pointers: Object.freeze([
      "/candidate/archivePath",
      "/candidate/executablePath",
      "/evidence/rawBytes",
      "/evidence/rawSha256",
      "/evidence/runnerStdoutSha256",
      "/harness/root",
      "/rwa/root",
      "/sdk/importedPath",
    ]),
    projectedValues: Object.freeze({
      "/candidate/archivePath": "retained-inputs/stasis-0.3.0-windows-x86_64-ci.zip",
      "/candidate/executablePath": "retained-inputs/stasis-0.3.0-windows-x86_64-ci/stasis.exe",
      "/evidence/rawBytes": Object.freeze({ from: rwaStasisPath, property: "bytes" }),
      "/evidence/rawSha256": Object.freeze({ from: rwaStasisPath, property: "sha256" }),
      "/evidence/runnerStdoutSha256": Object.freeze({ from: rwaRunnerStdoutPath, property: "sha256" }),
      "/harness/root": "reviewer-harness",
      "/rwa/root": "upstream-checkouts/cypress-realworld-app-28ca4d0",
      "/sdk/importedPath": "sdk-dist-used/index.js",
    }),
  }),
]);

const logProjectionConfigs = Object.freeze([
  Object.freeze({
    path: rwaRunnerStdoutPath,
    projectedLine: "rwa/stasis-raw.json",
  }),
]);

const artifactIndexConfigs = Object.freeze([
  Object.freeze({
    path: deterministicIndexPath,
    changedEntries: Object.freeze([
      Object.freeze({
        artifactPath: "stasis-post-0.3-census-v1/deterministic/playwright-raw.json",
        projectPath: deterministicPlaywrightPath,
      }),
      Object.freeze({
        artifactPath: "stasis-post-0.3-census-v1/deterministic/stasis-raw.json",
        projectPath: deterministicStasisPath,
      }),
    ]),
  }),
  Object.freeze({
    path: rwaIndexPath,
    changedEntries: Object.freeze([
      Object.freeze({ artifactPath: "rwa/stasis-raw.json", projectPath: rwaStasisPath }),
      Object.freeze({ artifactPath: "audit.json", projectPath: rwaAuditPath }),
      Object.freeze({ artifactPath: "runner.stdout.log", projectPath: rwaRunnerStdoutPath }),
    ]),
  }),
]);

const decisionBindingConfigs = Object.freeze([
  Object.freeze({
    constant: "deterministicArtifactIndexSha256",
    indexPath: deterministicIndexPath,
  }),
  Object.freeze({
    constant: "rwaArtifactIndexSha256",
    indexPath: rwaIndexPath,
  }),
]);

export async function createPathProjectionReceipt({ root = moduleRoot } = {}) {
  const resolvedRoot = path.resolve(root);
  if (!await gitHasCommit(resolvedRoot, sourceRevision)) {
    throw new Error(`Path projection source commit is unavailable: ${sourceRevision}`);
  }

  const identities = new Map();
  const jsonProjections = [];
  for (const config of jsonProjectionConfigs) {
    const sourceBytes = await readGitBlob(resolvedRoot, sourceRevision, config.path);
    const projectedBytes = await readRegularFile(resolvedRoot, config.path);
    const sourceValue = parseCanonicalPrettyJson(sourceBytes, `source ${config.path}`);
    const projectedValue = parseCanonicalPrettyJson(projectedBytes, `projected ${config.path}`);
    assertExactPointerChanges(sourceValue, projectedValue, config.pointers, config.path);
    const sourceNormalized = normalizeJsonPointers(sourceValue, config.pointers);
    const projectedNormalized = normalizeJsonPointers(projectedValue, config.pointers);
    if (!sourceNormalized.equals(projectedNormalized)) {
      throw new Error(`Allowed pointer normalization did not preserve semantics: ${config.path}`);
    }
    const item = {
      kind: "canonical-json-pointer-projection-v1",
      path: config.path,
      allowedJsonPointers: [...config.pointers],
      source: identity(sourceBytes),
      projected: identity(projectedBytes),
      normalized: {
        algorithm: normalizedJsonAlgorithm,
        sourceSha256: sha256(sourceNormalized),
        projectedSha256: sha256(projectedNormalized),
      },
    };
    identities.set(config.path, { source: item.source, projected: item.projected });
    jsonProjections.push(item);
  }

  const logProjections = [];
  for (const config of logProjectionConfigs) {
    const sourceBytes = await readGitBlob(resolvedRoot, sourceRevision, config.path);
    const projectedBytes = await readRegularFile(resolvedRoot, config.path);
    assertOneTerminatedLine(sourceBytes, `source ${config.path}`);
    assertOneTerminatedLine(projectedBytes, `projected ${config.path}`);
    if (sourceBytes.equals(projectedBytes)) {
      throw new Error(`Single-line projection did not change: ${config.path}`);
    }
    if (projectedBytes.toString("utf8") !== `${config.projectedLine}\n`) {
      throw new Error(`Projected log line does not match its public relative path: ${config.path}`);
    }
    const normalized = Buffer.from(`${normalizationToken}\n`, "utf8");
    const item = {
      kind: "single-line-path-projection-v1",
      path: config.path,
      projectedLine: config.projectedLine,
      source: identity(sourceBytes),
      projected: identity(projectedBytes),
      normalized: {
        algorithm: normalizedLineAlgorithm,
        sourceSha256: sha256(normalized),
        projectedSha256: sha256(normalized),
      },
    };
    identities.set(config.path, { source: item.source, projected: item.projected });
    logProjections.push(item);
  }

  await assertExpectedProjectedValues(jsonProjections, identities, resolvedRoot);

  const artifactIndexes = [];
  for (const config of artifactIndexConfigs) {
    const sourceBytes = await readGitBlob(resolvedRoot, sourceRevision, config.path);
    const projectedBytes = await readRegularFile(resolvedRoot, config.path);
    const sourceValue = parseCanonicalPrettyJson(sourceBytes, `source ${config.path}`);
    const projectedValue = parseCanonicalPrettyJson(projectedBytes, `projected ${config.path}`);
    await assertProjectedArtifactIndex(resolvedRoot, config, projectedValue);
    const reconstructedSource = reconstructSourceIndex(projectedValue, config, identities);
    const reconstructedBytes = canonicalPrettyJson(reconstructedSource);
    if (!sourceBytes.equals(reconstructedBytes) || !isDeepStrictEqual(sourceValue, reconstructedSource)) {
      throw new Error(`Artifact index has changes outside projected file identities: ${config.path}`);
    }
    const sourceNormalized = normalizeArtifactIndex(sourceValue, config);
    const projectedNormalized = normalizeArtifactIndex(projectedValue, config);
    if (!sourceNormalized.equals(projectedNormalized)) {
      throw new Error(`Artifact index normalization did not preserve semantics: ${config.path}`);
    }
    const item = {
      kind: "artifact-index-reference-rebind-v1",
      path: config.path,
      changedEntries: config.changedEntries.map((entry) => ({ ...entry })),
      source: identity(sourceBytes),
      projected: identity(projectedBytes),
      normalized: {
        algorithm: normalizedIndexAlgorithm,
        sourceSha256: sha256(sourceNormalized),
        projectedSha256: sha256(projectedNormalized),
      },
    };
    identities.set(config.path, { source: item.source, projected: item.projected });
    artifactIndexes.push(item);
  }

  const sourceDecisionBytes = await readGitBlob(resolvedRoot, sourceRevision, decisionPath);
  const projectedDecisionBytes = await readRegularFile(resolvedRoot, decisionPath);
  const decisionBinding = buildDecisionReceipt(
    sourceDecisionBytes,
    projectedDecisionBytes,
    identities,
  );

  return {
    schema: "stasis-public-fixture-path-projection-receipt-v1",
    sourceRevision,
    normalizationToken,
    jsonProjections,
    logProjections,
    artifactIndexes,
    decisionBinding,
  };
}

export async function verifyPathProjectionReceipt({ root = moduleRoot } = {}) {
  const resolvedRoot = path.resolve(root);
  const receiptBytes = await readRegularFile(resolvedRoot, receiptRelativePath);
  const receipt = parseCanonicalPrettyJson(receiptBytes, receiptRelativePath);
  assertReceiptEnvelope(receipt);
  const sourceRevisionAvailable = await gitHasCommit(resolvedRoot, sourceRevision);
  const identities = new Map();

  for (let index = 0; index < jsonProjectionConfigs.length; index += 1) {
    const config = jsonProjectionConfigs[index];
    const item = receipt.jsonProjections[index];
    const projectedBytes = await readRegularFile(resolvedRoot, config.path);
    assertIdentity(projectedBytes, item.projected, `projected ${config.path}`);
    const projectedValue = parseCanonicalPrettyJson(projectedBytes, `projected ${config.path}`);
    const projectedNormalized = normalizeJsonPointers(projectedValue, config.pointers);
    assertNormalizedReceipt(item.normalized, normalizedJsonAlgorithm, projectedNormalized, config.path);
    identities.set(config.path, { source: item.source, projected: item.projected });
    if (sourceRevisionAvailable) {
      const sourceBytes = await readGitBlob(resolvedRoot, sourceRevision, config.path);
      assertIdentity(sourceBytes, item.source, `source ${config.path}`);
      const sourceValue = parseCanonicalPrettyJson(sourceBytes, `source ${config.path}`);
      assertExactPointerChanges(sourceValue, projectedValue, config.pointers, config.path);
      const sourceNormalized = normalizeJsonPointers(sourceValue, config.pointers);
      assertSourceNormalizedReceipt(item.normalized, sourceNormalized, config.path);
      if (!sourceNormalized.equals(projectedNormalized)) {
        throw new Error(`Source/projected normalized JSON differs: ${config.path}`);
      }
    }
  }

  for (let index = 0; index < logProjectionConfigs.length; index += 1) {
    const config = logProjectionConfigs[index];
    const item = receipt.logProjections[index];
    const projectedBytes = await readRegularFile(resolvedRoot, config.path);
    assertIdentity(projectedBytes, item.projected, `projected ${config.path}`);
    assertOneTerminatedLine(projectedBytes, `projected ${config.path}`);
    if (projectedBytes.toString("utf8") !== `${config.projectedLine}\n`) {
      throw new Error(`Projected log line changed: ${config.path}`);
    }
    const normalized = Buffer.from(`${normalizationToken}\n`, "utf8");
    assertNormalizedReceipt(item.normalized, normalizedLineAlgorithm, normalized, config.path);
    identities.set(config.path, { source: item.source, projected: item.projected });
    if (sourceRevisionAvailable) {
      const sourceBytes = await readGitBlob(resolvedRoot, sourceRevision, config.path);
      assertIdentity(sourceBytes, item.source, `source ${config.path}`);
      assertOneTerminatedLine(sourceBytes, `source ${config.path}`);
      if (sourceBytes.equals(projectedBytes)) {
        throw new Error(`Source/projected log line unexpectedly matches: ${config.path}`);
      }
      assertSourceNormalizedReceipt(item.normalized, normalized, config.path);
    }
  }

  await assertExpectedProjectedValues(receipt.jsonProjections, identities, resolvedRoot);

  for (let index = 0; index < artifactIndexConfigs.length; index += 1) {
    const config = artifactIndexConfigs[index];
    const item = receipt.artifactIndexes[index];
    const projectedBytes = await readRegularFile(resolvedRoot, config.path);
    assertIdentity(projectedBytes, item.projected, `projected ${config.path}`);
    const projectedValue = parseCanonicalPrettyJson(projectedBytes, `projected ${config.path}`);
    await assertProjectedArtifactIndex(resolvedRoot, config, projectedValue);
    const reconstructedSource = reconstructSourceIndex(projectedValue, config, identities);
    const reconstructedSourceBytes = canonicalPrettyJson(reconstructedSource);
    assertIdentity(reconstructedSourceBytes, item.source, `reconstructed source ${config.path}`);
    const sourceNormalized = normalizeArtifactIndex(reconstructedSource, config);
    const projectedNormalized = normalizeArtifactIndex(projectedValue, config);
    assertSourceNormalizedReceipt(item.normalized, sourceNormalized, config.path);
    assertNormalizedReceipt(item.normalized, normalizedIndexAlgorithm, projectedNormalized, config.path);
    if (!sourceNormalized.equals(projectedNormalized)) {
      throw new Error(`Source/projected normalized artifact index differs: ${config.path}`);
    }
    identities.set(config.path, { source: item.source, projected: item.projected });
    if (sourceRevisionAvailable) {
      const sourceBytes = await readGitBlob(resolvedRoot, sourceRevision, config.path);
      if (!sourceBytes.equals(reconstructedSourceBytes)) {
        throw new Error(`Reconstructed artifact index does not match source commit: ${config.path}`);
      }
    }
  }

  const projectedDecisionBytes = await readRegularFile(resolvedRoot, decisionPath);
  assertIdentity(projectedDecisionBytes, receipt.decisionBinding.projected, `projected ${decisionPath}`);
  const reconstructedDecisionBytes = reconstructSourceDecision(
    projectedDecisionBytes,
    identities,
  );
  assertIdentity(reconstructedDecisionBytes, receipt.decisionBinding.source, `reconstructed source ${decisionPath}`);
  const sourceNormalizedDecision = normalizeDecisionBindings(reconstructedDecisionBytes, identities, "source");
  const projectedNormalizedDecision = normalizeDecisionBindings(projectedDecisionBytes, identities, "projected");
  assertSourceNormalizedReceipt(receipt.decisionBinding.normalized, sourceNormalizedDecision, decisionPath);
  assertNormalizedReceipt(
    receipt.decisionBinding.normalized,
    normalizedDecisionAlgorithm,
    projectedNormalizedDecision,
    decisionPath,
  );
  if (!sourceNormalizedDecision.equals(projectedNormalizedDecision)) {
    throw new Error(`Source/projected normalized decision binding differs: ${decisionPath}`);
  }
  if (sourceRevisionAvailable) {
    const sourceDecisionBytes = await readGitBlob(resolvedRoot, sourceRevision, decisionPath);
    if (!sourceDecisionBytes.equals(reconstructedDecisionBytes)) {
      throw new Error("Reconstructed decision source does not match the source commit");
    }
  }

  return Object.freeze({
    schema: receipt.schema,
    sourceRevision: receipt.sourceRevision,
    sourceRevisionAvailable,
    jsonProjectionCount: receipt.jsonProjections.length,
    logProjectionCount: receipt.logProjections.length,
    artifactIndexCount: receipt.artifactIndexes.length,
    decisionBindingCount: receipt.decisionBinding.bindings.length,
    normalizedSemanticsEqual: true,
    projectedReferencesVerified: true,
    sourceIndexesReconstructed: true,
    sourceDecisionReconstructed: true,
  });
}

function buildDecisionReceipt(sourceBytes, projectedBytes, identities) {
  for (const config of decisionBindingConfigs) {
    const indexIdentity = identities.get(config.indexPath);
    assertDecisionBinding(sourceBytes, config.constant, indexIdentity.source.sha256, "source");
    assertDecisionBinding(projectedBytes, config.constant, indexIdentity.projected.sha256, "projected");
  }
  const reconstructedSource = reconstructSourceDecision(projectedBytes, identities);
  if (!sourceBytes.equals(reconstructedSource)) {
    throw new Error("Decision module has changes outside artifact-index hash bindings");
  }
  const sourceNormalized = normalizeDecisionBindings(sourceBytes, identities, "source");
  const projectedNormalized = normalizeDecisionBindings(projectedBytes, identities, "projected");
  if (!sourceNormalized.equals(projectedNormalized)) {
    throw new Error("Decision binding normalization did not preserve source semantics");
  }
  return {
    kind: "decision-artifact-index-rebind-v1",
    path: decisionPath,
    bindings: decisionBindingConfigs.map((config) => ({ ...config })),
    source: identity(sourceBytes),
    projected: identity(projectedBytes),
    normalized: {
      algorithm: normalizedDecisionAlgorithm,
      sourceSha256: sha256(sourceNormalized),
      projectedSha256: sha256(projectedNormalized),
    },
  };
}

function reconstructSourceDecision(projectedBytes, identities) {
  let text = projectedBytes.toString("utf8");
  for (const config of decisionBindingConfigs) {
    const indexIdentity = identities.get(config.indexPath);
    text = replaceDecisionBinding(
      text,
      config.constant,
      indexIdentity.projected.sha256,
      indexIdentity.source.sha256,
    );
  }
  return Buffer.from(text, "utf8");
}

function normalizeDecisionBindings(bytes, identities, side) {
  let text = bytes.toString("utf8");
  const token = "x".repeat(64);
  for (const config of decisionBindingConfigs) {
    const expected = identities.get(config.indexPath)[side].sha256;
    text = replaceDecisionBinding(text, config.constant, expected, token);
  }
  return Buffer.from(text, "utf8");
}

function assertDecisionBinding(bytes, constant, expected, label) {
  const text = bytes.toString("utf8");
  const actual = readDecisionBinding(text, constant);
  if (actual !== expected) {
    throw new Error(`${label} decision binding ${constant} is ${actual}, expected ${expected}`);
  }
}

function replaceDecisionBinding(text, constant, expected, replacement) {
  const match = findDecisionBinding(text, constant);
  if (match.value !== expected) {
    throw new Error(`Decision binding ${constant} is ${match.value}, expected ${expected}`);
  }
  return `${text.slice(0, match.valueStart)}${replacement}${text.slice(match.valueEnd)}`;
}

function readDecisionBinding(text, constant) {
  return findDecisionBinding(text, constant).value;
}

function findDecisionBinding(text, constant) {
  const escaped = constant.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`\\bconst\\s+${escaped}\\s*=\\s*\\r?\\n?\\s*\"([a-f0-9]{64})\";`, "gu");
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`Decision module must declare exactly one ${constant} binding`);
  }
  const value = matches[0][1];
  const valueStart = matches[0].index + matches[0][0].indexOf(value);
  return { value, valueStart, valueEnd: valueStart + value.length };
}

async function assertProjectedArtifactIndex(root, config, value) {
  if (!Array.isArray(value?.files)) {
    throw new Error(`Artifact index files are missing: ${config.path}`);
  }
  const indexRoot = path.dirname(resolveProjectPath(root, config.path));
  const expectedInventory = [path.basename(config.path)];
  for (const item of value.files) {
    assertFileReference(item, config.path);
    const target = resolveChild(indexRoot, item.path);
    const bytes = await readRealRegularFile(target, `${config.path}:${item.path}`);
    assertIdentity(bytes, { bytes: item.bytes, sha256: item.sha256 }, `${config.path}:${item.path}`);
    expectedInventory.push(item.path);
  }
  if (value.directories !== undefined) {
    if (!Array.isArray(value.directories)) {
      throw new Error(`Artifact index directories are invalid: ${config.path}`);
    }
    for (const item of value.directories) {
      assertExactKeys(item, ["fileCount", "path", "sha256", "totalBytes"], `${config.path} directory`);
      assertSafeRelativePath(item.path, `${config.path} directory`);
      const target = resolveChild(indexRoot, item.path);
      const metadata = await lstat(target);
      if (!metadata.isDirectory() || metadata.isSymbolicLink() || !samePath(await realpath(target), target)) {
        throw new Error(`Artifact index directory is not one real directory: ${item.path}`);
      }
      const tree = await sha256DirectoryTree(target);
      if (!isDeepStrictEqual(tree, {
        sha256: item.sha256,
        fileCount: item.fileCount,
        totalBytes: item.totalBytes,
      })) {
        throw new Error(`Artifact index directory identity changed: ${item.path}`);
      }
      const files = await listRegularFiles(target);
      expectedInventory.push(...files.map((relative) => `${item.path}/${relative}`));
    }
  }
  assertExactFileInventory(await listRegularFiles(indexRoot), expectedInventory, config.path);
  for (const change of config.changedEntries) {
    const matches = value.files.filter((item) => item.path === change.artifactPath);
    if (matches.length !== 1) {
      throw new Error(`Artifact index must contain exactly one changed entry: ${change.artifactPath}`);
    }
  }
}

function reconstructSourceIndex(projectedValue, config, identities) {
  const value = structuredClone(projectedValue);
  for (const change of config.changedEntries) {
    const matches = value.files.filter((item) => item.path === change.artifactPath);
    if (matches.length !== 1) {
      throw new Error(`Artifact index changed entry is missing: ${change.artifactPath}`);
    }
    const sourceIdentity = identities.get(change.projectPath)?.source;
    if (sourceIdentity === undefined) {
      throw new Error(`Source projection identity is missing: ${change.projectPath}`);
    }
    matches[0].bytes = sourceIdentity.bytes;
    matches[0].sha256 = sourceIdentity.sha256;
  }
  return value;
}

function normalizeArtifactIndex(value, config) {
  const normalized = structuredClone(value);
  for (const change of config.changedEntries) {
    const matches = normalized.files.filter((item) => item.path === change.artifactPath);
    if (matches.length !== 1) {
      throw new Error(`Artifact index normalization entry is missing: ${change.artifactPath}`);
    }
    matches[0].bytes = normalizationToken;
    matches[0].sha256 = normalizationToken;
  }
  return canonicalJson(normalized);
}

function assertExpectedProjectedValues(_items, identities, root) {
  return Promise.all(jsonProjectionConfigs.map(async (config) => {
    const bytes = await readRegularFile(root, config.path);
    const value = parseCanonicalPrettyJson(bytes, `projected ${config.path}`);
    for (const pointer of config.pointers) {
      const expected = resolveExpectedValue(config.projectedValues[pointer], identities);
      const actual = getJsonPointer(value, pointer);
      if (!isDeepStrictEqual(actual, expected)) {
        throw new Error(`Projected value at ${config.path}${pointer} does not match the public projection`);
      }
    }
  }));
}

function resolveExpectedValue(value, identities) {
  if (typeof value === "object" && value !== null && "from" in value) {
    const projected = identities.get(value.from)?.projected;
    if (projected === undefined || !(value.property in projected)) {
      throw new Error(`Projected derived identity is unavailable: ${value.from}.${value.property}`);
    }
    return projected[value.property];
  }
  return value;
}

function assertExactPointerChanges(source, projected, pointers, label) {
  const actual = changedJsonPointers(source, projected).sort();
  const expected = [...pointers].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} changed JSON pointers ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function changedJsonPointers(left, right, pointer = "", output = []) {
  if (isDeepStrictEqual(left, right)) return output;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      output.push(pointer);
      return output;
    }
    for (let index = 0; index < left.length; index += 1) {
      changedJsonPointers(left[index], right[index], `${pointer}/${index}`, output);
    }
    return output;
  }
  if (plainObject(left) && plainObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const child = `${pointer}/${escapeJsonPointer(key)}`;
      if (!(key in left) || !(key in right)) output.push(child);
      else changedJsonPointers(left[key], right[key], child, output);
    }
    return output;
  }
  output.push(pointer);
  return output;
}

function normalizeJsonPointers(value, pointers) {
  const normalized = structuredClone(value);
  for (const pointer of pointers) setJsonPointer(normalized, pointer, normalizationToken);
  return canonicalJson(normalized);
}

function setJsonPointer(value, pointer, replacement) {
  const segments = parseJsonPointer(pointer);
  let owner = value;
  for (const segment of segments.slice(0, -1)) {
    if ((typeof owner !== "object" || owner === null) || !(segment in owner)) {
      throw new Error(`JSON pointer does not exist: ${pointer}`);
    }
    owner = owner[segment];
  }
  const key = segments.at(-1);
  if ((typeof owner !== "object" || owner === null) || !(key in owner)) {
    throw new Error(`JSON pointer does not exist: ${pointer}`);
  }
  owner[key] = replacement;
}

function getJsonPointer(value, pointer) {
  let current = value;
  for (const segment of parseJsonPointer(pointer)) {
    if ((typeof current !== "object" || current === null) || !(segment in current)) {
      throw new Error(`JSON pointer does not exist: ${pointer}`);
    }
    current = current[segment];
  }
  return current;
}

function parseJsonPointer(pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/") || pointer === "/") {
    throw new Error(`Invalid JSON pointer: ${pointer}`);
  }
  return pointer.slice(1).split("/").map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function escapeJsonPointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function assertReceiptEnvelope(value) {
  assertExactKeys(value, [
    "artifactIndexes",
    "decisionBinding",
    "jsonProjections",
    "logProjections",
    "normalizationToken",
    "schema",
    "sourceRevision",
  ], "path projection receipt");
  if (
    value.schema !== "stasis-public-fixture-path-projection-receipt-v1" ||
    value.sourceRevision !== sourceRevision ||
    value.normalizationToken !== normalizationToken
  ) {
    throw new Error("Path projection receipt identity is invalid");
  }
  assertConfiguredProjectionItems(value.jsonProjections, jsonProjectionConfigs, "JSON projection", (item, config) => {
    assertExactKeys(item, ["allowedJsonPointers", "kind", "normalized", "path", "projected", "source"], "JSON projection");
    if (
      item.kind !== "canonical-json-pointer-projection-v1" ||
      !isDeepStrictEqual(item.allowedJsonPointers, [...config.pointers])
    ) throw new Error(`JSON projection allowlist changed: ${config.path}`);
    assertProjectionIdentitiesAndNormalization(item, normalizedJsonAlgorithm, config.path);
  });
  assertConfiguredProjectionItems(value.logProjections, logProjectionConfigs, "log projection", (item, config) => {
    assertExactKeys(item, ["kind", "normalized", "path", "projected", "projectedLine", "source"], "log projection");
    if (item.kind !== "single-line-path-projection-v1" || item.projectedLine !== config.projectedLine) {
      throw new Error(`Log projection policy changed: ${config.path}`);
    }
    assertProjectionIdentitiesAndNormalization(item, normalizedLineAlgorithm, config.path);
  });
  assertConfiguredProjectionItems(value.artifactIndexes, artifactIndexConfigs, "artifact index", (item, config) => {
    assertExactKeys(item, ["changedEntries", "kind", "normalized", "path", "projected", "source"], "artifact index");
    if (
      item.kind !== "artifact-index-reference-rebind-v1" ||
      !isDeepStrictEqual(item.changedEntries, config.changedEntries.map((entry) => ({ ...entry })))
    ) throw new Error(`Artifact index rebind policy changed: ${config.path}`);
    assertProjectionIdentitiesAndNormalization(item, normalizedIndexAlgorithm, config.path);
  });
  const decision = value.decisionBinding;
  assertExactKeys(decision, ["bindings", "kind", "normalized", "path", "projected", "source"], "decision binding");
  if (
    decision.kind !== "decision-artifact-index-rebind-v1" ||
    decision.path !== decisionPath ||
    !isDeepStrictEqual(decision.bindings, decisionBindingConfigs.map((config) => ({ ...config })))
  ) throw new Error("Decision artifact-index binding policy changed");
  assertProjectionIdentitiesAndNormalization(decision, normalizedDecisionAlgorithm, decisionPath);
}

function assertConfiguredProjectionItems(items, configs, label, validate) {
  if (!Array.isArray(items) || items.length !== configs.length) {
    throw new Error(`${label} inventory changed`);
  }
  for (let index = 0; index < configs.length; index += 1) {
    if (items[index]?.path !== configs[index].path) {
      throw new Error(`${label} path changed at index ${index}`);
    }
    validate(items[index], configs[index]);
  }
}

function assertProjectionIdentitiesAndNormalization(item, algorithm, label) {
  assertStoredIdentity(item.source, `${label} source`);
  assertStoredIdentity(item.projected, `${label} projected`);
  assertExactKeys(item.normalized, ["algorithm", "projectedSha256", "sourceSha256"], `${label} normalization`);
  if (
    item.normalized.algorithm !== algorithm ||
    !sha256Pattern.test(item.normalized.sourceSha256 ?? "") ||
    !sha256Pattern.test(item.normalized.projectedSha256 ?? "") ||
    item.normalized.sourceSha256 !== item.normalized.projectedSha256
  ) throw new Error(`${label} normalized semantic identity is invalid`);
}

function assertNormalizedReceipt(receipt, algorithm, bytes, label) {
  if (receipt.algorithm !== algorithm || receipt.projectedSha256 !== sha256(bytes)) {
    throw new Error(`Projected normalized semantic hash changed: ${label}`);
  }
}

function assertSourceNormalizedReceipt(receipt, bytes, label) {
  if (receipt.sourceSha256 !== sha256(bytes)) {
    throw new Error(`Source normalized semantic hash changed: ${label}`);
  }
}

function assertStoredIdentity(value, label) {
  assertExactKeys(value, ["bytes", "sha256"], label);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || !sha256Pattern.test(value.sha256 ?? "")) {
    throw new Error(`${label} identity is invalid`);
  }
}

function assertFileReference(value, label) {
  assertExactKeys(value, ["bytes", "path", "sha256"], `${label} file reference`);
  assertSafeRelativePath(value.path, `${label} file reference`);
  assertStoredIdentity({ bytes: value.bytes, sha256: value.sha256 }, `${label}:${value.path}`);
}

function assertExactKeys(value, keys, label) {
  if (!plainObject(value)) throw new Error(`${label} must be one object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} keys are ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function plainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCanonicalPrettyJson(bytes, label) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!bytes.equals(canonicalPrettyJson(value))) {
    throw new Error(`${label} is not canonical pretty JSON`);
  }
  return value;
}

function canonicalPrettyJson(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function canonicalJson(value) {
  return Buffer.from(`${JSON.stringify(sortJson(value))}\n`, "utf8");
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}

function identity(bytes) {
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function assertIdentity(bytes, expected, label) {
  const actual = identity(bytes);
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} identity is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertOneTerminatedLine(bytes, label) {
  const text = bytes.toString("utf8");
  if (Buffer.byteLength(text, "utf8") !== bytes.length || !/^[^\r\n]+\n$/u.test(text)) {
    throw new Error(`${label} must be exactly one LF-terminated UTF-8 line`);
  }
}

async function gitHasCommit(root, revision) {
  try {
    await execFileAsync("git", ["--no-replace-objects", "cat-file", "-e", `${revision}^{commit}`], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function readGitBlob(root, revision, relativePath) {
  const { stdout } = await execFileAsync(
    "git",
    ["--no-replace-objects", "show", `${revision}:${relativePath}`],
    {
      cwd: root,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

async function readRegularFile(root, relativePath) {
  const target = resolveProjectPath(root, relativePath);
  return readRealRegularFile(target, relativePath);
}

async function readRealRegularFile(target, label) {
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(target), target)) {
    throw new Error(`${label} is not one real regular file`);
  }
  return readFile(target);
}

function resolveProjectPath(root, relativePath) {
  assertSafeRelativePath(relativePath, "project path");
  const target = path.resolve(root, ...relativePath.split("/"));
  if (!isPathInside(root, target)) throw new Error(`Project path escapes root: ${relativePath}`);
  return target;
}

function resolveChild(root, relativePath) {
  assertSafeRelativePath(relativePath, "artifact path");
  const target = path.resolve(root, ...relativePath.split("/"));
  if (!isPathInside(root, target)) throw new Error(`Artifact path escapes root: ${relativePath}`);
  return target;
}

function assertSafeRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) throw new Error(`${label} is not one portable relative path`);
}

function isPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
