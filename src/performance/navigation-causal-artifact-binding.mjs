import { createHash } from "node:crypto";
import { isDeepStrictEqual, TextDecoder } from "node:util";

import AdmZip from "adm-zip";

import {
  assertNavigationCausalHostOutcome,
  assertNavigationCausalHostRaw,
} from "./navigation-causal.mjs";
import {
  buildNavigationCausalReplication,
} from "./navigation-causal-replication.mjs";
import {
  verifyNavigationCausalHostedProvenance,
} from "./navigation-causal-hosted-provenance.mjs";

export const navigationCausalArtifactBindingSchema =
  "stasis-v0.3.3-performance-navigation-causal-artifact-binding-v1";
export const navigationCausalHostFileBindingSchema =
  "stasis-v0.3.3-performance-navigation-causal-host-file-binding-v1";

export const navigationCausalHostArtifactNames = Object.freeze({
  "host-a": Object.freeze({
    raw: "navigation-causal-host-a-raw.json",
    outcome: "navigation-causal-host-a-outcome.json",
  }),
  "host-b": Object.freeze({
    raw: "navigation-causal-host-b-raw.json",
    outcome: "navigation-causal-host-b-outcome.json",
  }),
});

export const navigationCausalZipSafetyPolicy = Object.freeze({
  maximumArchiveBytes: 4_000_000,
  maximumEntryBytes: 2_000_000,
  maximumTotalUncompressedBytes: 4_000_000,
  maximumCompressionRatio: 200,
  allowedCompressionMethods: [0, 8],
});

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function bindNavigationCausalHostArtifacts({
  hostARawBytes,
  hostAOutcomeBytes,
  hostBRawBytes,
  hostBOutcomeBytes,
}) {
  const inputs = {
    hostA: parseHost(
      "host-a",
      hostARawBytes,
      hostAOutcomeBytes,
    ),
    hostB: parseHost(
      "host-b",
      hostBRawBytes,
      hostBOutcomeBytes,
    ),
  };
  const replication = buildNavigationCausalReplication(inputs);
  return deepFreeze({
    schema: navigationCausalHostFileBindingSchema,
    status: "passed",
    inputs: {
      hostA: fileIdentities("host-a", hostARawBytes, hostAOutcomeBytes),
      hostB: fileIdentities("host-b", hostBRawBytes, hostBOutcomeBytes),
    },
    replication,
    verification: {
      exactCanonicalHostFiles: true,
      hostOutcomesReplayFromRaw: true,
      sourceAndHarnessChainFrozen: true,
      sameWorkflowRunDistinctJobs: true,
      statisticsCombinedAcrossHosts: false,
      discardedHostArtifacts: false,
    },
  });
}

export function bindNavigationCausalActionArchives({ hostedInput, archives }) {
  const hosted = verifyNavigationCausalHostedProvenance(hostedInput);
  if (archives === null || typeof archives !== "object" || Array.isArray(archives)) {
    throw new TypeError("Navigation causal Actions archives must be an object");
  }
  const expectedArchiveNames = hosted.artifacts.map(({ name }) => name).sort();
  if (!isDeepStrictEqual(Object.keys(archives).sort(), expectedArchiveNames)) {
    throw new TypeError("Navigation causal Actions archive inventory is not exact");
  }
  const extracted = {};
  const archiveIdentities = [];
  for (const metadata of hosted.artifacts) {
    const bytes = archives[metadata.name];
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 ||
      bytes.length > navigationCausalZipSafetyPolicy.maximumArchiveBytes ||
      bytes.length !== metadata.sizeInBytes ||
      `sha256:${navigationCausalFileIdentity(bytes).sha256}` !== metadata.digest) {
      throw new TypeError(`Navigation causal Actions archive differs from metadata: ${metadata.name}`);
    }
    const names = navigationCausalHostArtifactNames[metadata.lane];
    const entries = parseExactZip(bytes, [names.raw, names.outcome], metadata.name);
    extracted[metadata.lane] = {
      raw: entries.get(names.raw),
      outcome: entries.get(names.outcome),
    };
    archiveIdentities.push({
      hostLane: metadata.lane,
      artifactId: metadata.id,
      name: metadata.name,
      bytes: bytes.length,
      sha256: navigationCausalFileIdentity(bytes).sha256,
    });
  }
  const binding = bindNavigationCausalHostArtifacts({
    hostARawBytes: extracted["host-a"].raw,
    hostAOutcomeBytes: extracted["host-a"].outcome,
    hostBRawBytes: extracted["host-b"].raw,
    hostBOutcomeBytes: extracted["host-b"].outcome,
  });
  if (
    binding.replication.hostedIdentity.workflowRunId !== String(hosted.producer.runId) ||
    binding.replication.hostedIdentity.workflowRunAttempt !== "1"
  ) {
    throw new TypeError("Navigation causal Actions metadata and host files name different runs");
  }
  for (const host of binding.replication.hosts) {
    const job = hosted.jobs.find(({ lane }) => lane === host.hostLane);
    const expectedConclusion = host.status.startsWith("VALID_HOST_") ? "success" : "failure";
    if (job?.conclusion !== expectedConclusion) {
      throw new TypeError(`Navigation causal ${host.hostLane} outcome contradicts job conclusion`);
    }
  }
  return deepFreeze({
    schema: navigationCausalArtifactBindingSchema,
    status: "passed",
    hostedRunId: hosted.producer.runId,
    archives: archiveIdentities,
    hostFiles: binding.inputs,
    replication: binding.replication,
    verification: {
      exactTwoArchiveInventory: true,
      distinctArtifactIds: new Set(archiveIdentities.map(({ artifactId }) => artifactId)).size === 2,
      archiveBytesMatchHostedDigests: true,
      exactTwoCanonicalFilesPerArchive: true,
      jobConclusionsMatchTypedHostOutcomes: true,
      statisticsCombinedAcrossHosts: false,
      discardedHostArtifacts: false,
    },
  });
}

export function canonicalNavigationCausalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
}

export function parseCanonicalNavigationCausalJson(bytes, label) {
  const retained = requireBytes(bytes, label);
  let value;
  try {
    value = JSON.parse(retained.toString("utf8"));
  } catch (error) {
    throw new TypeError(`${label} is not valid JSON`, { cause: error });
  }
  if (!canonicalNavigationCausalJsonBytes(value).equals(retained)) {
    throw new TypeError(`${label} is not canonical pretty JSON`);
  }
  return value;
}

export function navigationCausalFileIdentity(bytes) {
  const retained = requireBytes(bytes, "Navigation causal file");
  return {
    bytes: retained.length,
    sha256: createHash("sha256").update(retained).digest("hex"),
  };
}

function parseHost(lane, rawBytes, outcomeBytes) {
  const names = navigationCausalHostArtifactNames[lane];
  const raw = parseCanonicalNavigationCausalJson(rawBytes, names.raw);
  const outcome = parseCanonicalNavigationCausalJson(outcomeBytes, names.outcome);
  assertNavigationCausalHostRaw(raw);
  assertNavigationCausalHostOutcome(outcome, raw);
  if (raw.identity.hostLane !== lane || outcome.hostLane !== lane) {
    throw new TypeError(`Navigation causal ${lane} artifact contains another lane`);
  }
  return { raw, outcome };
}

function fileIdentities(lane, rawBytes, outcomeBytes) {
  const names = navigationCausalHostArtifactNames[lane];
  return {
    raw: { name: names.raw, ...navigationCausalFileIdentity(rawBytes) },
    outcome: { name: names.outcome, ...navigationCausalFileIdentity(outcomeBytes) },
  };
}

function requireBytes(value, label) {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty Buffer`);
  }
  return value;
}

function parseExactZip(bytes, expectedNames, label) {
  let entries;
  try {
    entries = new AdmZip(bytes).getEntries();
  } catch (error) {
    throw new TypeError(`Navigation causal artifact is not a ZIP: ${label}`, { cause: error });
  }
  if (entries.length !== expectedNames.length) {
    throw new TypeError(`Navigation causal artifact ZIP inventory is not exact: ${label}`);
  }
  const contents = new Map();
  let total = 0;
  for (const entry of entries) {
    if (!Buffer.isBuffer(entry.rawEntryName)) {
      throw new TypeError(`Navigation causal ZIP entry name is unavailable: ${label}`);
    }
    let name;
    try {
      name = utf8.decode(entry.rawEntryName);
    } catch (error) {
      throw new TypeError(`Navigation causal ZIP entry name is not UTF-8: ${label}`, { cause: error });
    }
    const header = entry.header ?? {};
    const mode = (entry.attr >>> 16) & 0o170000;
    if (!Buffer.from(name, "utf8").equals(entry.rawEntryName) || entry.isDirectory ||
      name.includes("/") || name.includes("\\") || name.includes("\0") ||
      name.normalize("NFC") !== name || !expectedNames.includes(name) || contents.has(name) ||
      !navigationCausalZipSafetyPolicy.allowedCompressionMethods.includes(header.method) ||
      ((header.flags ?? 0) & 1) !== 0 || (mode !== 0 && mode !== 0o100000) ||
      !Number.isSafeInteger(header.size) || header.size < 1 ||
      header.size > navigationCausalZipSafetyPolicy.maximumEntryBytes ||
      !Number.isSafeInteger(header.compressedSize) || header.compressedSize < 1 ||
      header.size / header.compressedSize > navigationCausalZipSafetyPolicy.maximumCompressionRatio) {
      throw new TypeError(`Navigation causal ZIP entry is unsafe: ${label}: ${name}`);
    }
    total += header.size;
    if (total > navigationCausalZipSafetyPolicy.maximumTotalUncompressedBytes) {
      throw new TypeError(`Navigation causal ZIP expands beyond its safety policy: ${label}`);
    }
    const data = entry.getData();
    if (!Buffer.isBuffer(data) || data.length !== header.size) {
      throw new TypeError(`Navigation causal ZIP entry bytes are inconsistent: ${label}: ${name}`);
    }
    contents.set(name, Buffer.from(data));
  }
  if (!isDeepStrictEqual([...contents.keys()].sort(), [...expectedNames].sort())) {
    throw new TypeError(`Navigation causal artifact ZIP names changed: ${label}`);
  }
  return contents;
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
