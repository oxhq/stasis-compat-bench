import { access, lstat, mkdir, realpath } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";

import { artifactRoot, sha256File } from "../shared/io.mjs";
import { writeWildArtifactJson } from "./artifact-privacy.mjs";
import {
  assertWildRunGeneration,
  freshNonceSha256,
} from "./run-generation.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/u;
export const pairedStartPath = "wild/paired-start.json";
const legacyWildArtifactSchemas = Object.freeze({
  baselineGate: "stasis-wild-baseline-gate-raw-v3",
  baseline: "stasis-wild-baseline-raw-v3",
  stasisGate: "stasis-wild-stasis-gate-raw-v3",
  stasis: "stasis-wild-stasis-raw-v3",
  classification: "stasis-wild-case-classification-v3",
  summary: "stasis-wild-summary-v4",
  index: "stasis-wild-artifact-index-v4",
});
export const currentUrlWildArtifactSchemas = Object.freeze({
  baselineGate: "stasis-wild-baseline-gate-raw-v3",
  baseline: "stasis-wild-baseline-raw-v3",
  stasisGate: "stasis-wild-stasis-gate-raw-v3",
  stasis: "stasis-wild-stasis-raw-v4",
  classification: "stasis-wild-case-classification-v4",
  summary: "stasis-wild-summary-v5",
  index: "stasis-wild-artifact-index-v5",
});

export async function assertFreshWildArtifactLane() {
  const configured = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  if (typeof configured !== "string" || configured.length === 0 || !path.isAbsolute(configured)) {
    throw new Error("STASIS_COMPAT_ARTIFACT_DIR must be an explicit absolute path");
  }
  const wildRoot = path.join(artifactRoot(), "wild");
  try {
    await access(wildRoot);
    throw new Error(`Wild artifact lane already exists: ${wildRoot}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return wildRoot;
}

export async function claimFreshWildArtifactLane({
  runGeneration,
  networkPolicySmoke,
  startedAt,
  protocol,
}) {
  assertWildRunGeneration(runGeneration);
  assertReference(networkPolicySmoke, "network-policy smoke");
  if (
    typeof protocol !== "string" ||
    protocol.length === 0 ||
    !validIsoInstant(startedAt)
  ) {
    throw new Error("Wild paired-start claim has an invalid protocol or start time");
  }
  const wildRoot = await assertFreshWildArtifactLane();
  try {
    await mkdir(wildRoot, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Wild artifact lane already exists: ${wildRoot}`);
    }
    throw error;
  }
  const metadata = await lstat(wildRoot);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !samePath(await realpath(wildRoot), wildRoot)
  ) {
    throw new Error("Wild paired-start claim did not create one real artifact lane");
  }
  const value = {
    schema: "stasis-wild-paired-start-v1",
    protocol,
    nonceSha256: freshNonceSha256(),
    runGeneration: Object.freeze({ ...runGeneration }),
    networkPolicySmoke: Object.freeze({ ...networkPolicySmoke }),
    startedAt,
  };
  const absolutePath = await writeWildArtifactJson(pairedStartPath, value);
  const reference = Object.freeze({
    path: pairedStartPath,
    sha256: await sha256File(absolutePath),
  });
  return Object.freeze({ value: Object.freeze(value), reference });
}

export function createCaseArtifactWriter(pairedRun, schemas = legacyWildArtifactSchemas) {
  assertPairedRunShape(pairedRun);
  assertSupportedWildArtifactSchemas(schemas);
  const frozenPairedRun = Object.freeze(structuredClone(pairedRun));
  return async function persistCase(item) {
    const entry = projectCaseEntry(item.entry);
    const prefix = String(entry.slot).padStart(3, "0");
    const records = [];
    records.push(await writeIndexed(`wild/raw/${prefix}-baseline-gate.json`, {
      schema: schemas.baselineGate,
      pairedRun: frozenPairedRun,
      entry,
      gate: item.baselineGate,
    }));
    records.push(await writeIndexed(`wild/raw/${prefix}-baseline.json`, {
      schema: schemas.baseline,
      pairedRun: frozenPairedRun,
      entry,
      observation: item.baseline,
    }));
    records.push(await writeIndexed(`wild/raw/${prefix}-stasis-gate.json`, {
      schema: schemas.stasisGate,
      pairedRun: frozenPairedRun,
      entry,
      gate: item.stasisGate,
    }));
    records.push(await writeIndexed(`wild/raw/${prefix}-stasis.json`, {
      schema: schemas.stasis,
      pairedRun: frozenPairedRun,
      entry,
      observation: item.stasis,
    }));
    records.push(await writeIndexed(`wild/cases/${prefix}-classification.json`, {
      schema: schemas.classification,
      pairedRun: frozenPairedRun,
      entry,
      classification: item.classification,
    }));
    return { slot: entry.slot, rank: entry.rank, records };
  };
}

function assertPairedRunShape(value) {
  const expectedKeys = [
    "networkPolicySmoke",
    "nonceSha256",
    "protocol",
    "runGeneration",
    "schema",
    "startedAt",
  ];
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), expectedKeys) ||
    value.schema !== "stasis-wild-paired-start-v1" ||
    typeof value.protocol !== "string" ||
    value.protocol.length === 0 ||
    !sha256Pattern.test(value.nonceSha256 ?? "") ||
    !validIsoInstant(value.startedAt)
  ) {
    throw new Error("Wild paired-run binding has an invalid shape");
  }
  assertWildRunGeneration(value.runGeneration);
  assertReference(value.networkPolicySmoke, "paired-run network-policy smoke");
}

function assertReference(value, label) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), ["path", "sha256"]) ||
    typeof value.path !== "string" ||
    !sha256Pattern.test(value.sha256 ?? "")
  ) {
    throw new Error(`Wild ${label} reference is invalid`);
  }
}

function validIsoInstant(value) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export async function writeWildSummaryAndIndex({
  identity,
  rules,
  cases,
  summary,
  startedAt,
  schemas = legacyWildArtifactSchemas,
}) {
  assertSupportedWildArtifactSchemas(schemas);
  const completedAt = new Date().toISOString();
  const summaryValue = {
    schema: schemas.summary,
    protocol: identity.protocol,
    identity,
    rules,
    startedAt,
    completedAt,
    summary,
  };
  const summaryRecord = await writeIndexed("wild/summary.json", summaryValue);
  const caseArtifacts = cases.map((item) => item.artifactRecord);
  const indexValue = {
    schema: schemas.index,
    protocol: identity.protocol,
    identity,
    rules,
    startedAt,
    completedAt,
    selectedCount: cases.length,
    summary: summaryRecord,
    cases: caseArtifacts,
  };
  await writeWildArtifactJson("wild/artifact-index.json", indexValue);
  return { indexPath: "wild/artifact-index.json", summaryPath: summaryRecord.path };
}

function assertSupportedWildArtifactSchemas(value) {
  if (value !== legacyWildArtifactSchemas && value !== currentUrlWildArtifactSchemas) {
    throw new TypeError("Wild artifact schemas must select one supported immutable schema set");
  }
}

async function writeIndexed(relativePath, value) {
  const absolutePath = await writeWildArtifactJson(relativePath, value);
  return {
    path: relativePath.replaceAll("\\", "/"),
    sha256: await sha256File(absolutePath),
  };
}

function projectCaseEntry(value) {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Wild case artifact requires one complete canonical corpus entry");
  }
  // Read each exported-boundary field once. Bound corpus entries are plain JSON,
  // but this prevents an accessor from changing a value between validation and
  // projection when the writer is called directly.
  const entry = {
    slot: value.slot,
    stratumId: value.stratumId,
    stratumSlot: value.stratumSlot,
    permutationIndex: value.permutationIndex,
    rank: value.rank,
    domain: value.domain,
    requestedUrl: value.requestedUrl,
  };
  if (
    !Number.isSafeInteger(entry.slot) ||
    entry.slot <= 0 ||
    !Number.isSafeInteger(entry.rank) ||
    entry.rank <= 0 ||
    !Number.isSafeInteger(entry.stratumSlot) ||
    entry.stratumSlot <= 0 ||
    !Number.isSafeInteger(entry.permutationIndex) ||
    entry.permutationIndex < 0 ||
    typeof entry.stratumId !== "string" ||
    !/^rank-[1-9][0-9]*-[1-9][0-9]*$/u.test(entry.stratumId) ||
    typeof entry.domain !== "string" ||
    typeof entry.requestedUrl !== "string"
  ) {
    throw new TypeError("Wild case artifact requires one complete canonical corpus entry");
  }
  const [, minimumText, maximumText] = /^rank-([1-9][0-9]*)-([1-9][0-9]*)$/u.exec(entry.stratumId);
  const minimum = Number(minimumText);
  const maximum = Number(maximumText);
  let url;
  try {
    url = new URL(entry.requestedUrl);
  } catch {
    throw new TypeError("Wild case artifact requires one canonical HTTPS root entry");
  }
  if (
    entry.rank < minimum ||
    entry.rank > maximum ||
    url.href !== entry.requestedUrl ||
    url.protocol !== "https:" ||
    url.hostname !== entry.domain ||
    url.port.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    entry.requestedUrl !== `${url.origin}/`
  ) {
    throw new TypeError("Wild case artifact requires one canonical HTTPS root entry");
  }
  return entry;
}
