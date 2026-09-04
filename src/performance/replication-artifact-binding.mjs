import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import AdmZip from "adm-zip";

import {
  performanceReplicationContractIdentity,
  performanceReplicationHostedProvenanceSchema,
  performanceReplicationHostedIdentity,
  performanceReplicationExpectedArtifactNames,
  performanceReplicationExpectedJobNames,
} from "./replication-hosted-provenance.mjs";
import {
  performanceReplicationVerificationSchema,
} from "./replication.mjs";

export const performanceReplicationArtifactBindingSchema =
  "stasis-v0.3.3-performance-replication-artifact-binding-v1";

const artifactNames = Object.freeze({
  source: "stasis-v0.3.3-performance-source-metadata-attempt-1",
  rwaRaw: "stasis-v0.3.3-performance-rwa-raw-attempt-1",
  rwaLogs: "stasis-v0.3.3-performance-rwa-logs-attempt-1",
  crawlRaw: "stasis-v0.3.3-performance-crawl-raw-attempt-1",
  crawlLogs: "stasis-v0.3.3-performance-crawl-logs-attempt-1",
  combined: "stasis-v0.3.3-performance-combined-attempt-1",
  combinedLogs: "stasis-v0.3.3-performance-combined-logs-attempt-1",
});

const jobNames = Object.freeze({
  source: "Validate exact performance inputs",
  rwa: "Windows 2022 RWA Cypress vs Stasis",
  crawl: "Ubuntu 22.04 Crawlee vs Stasis",
  combined: "Combine and verify performance evidence",
});

const laneJobIds = Object.freeze({ rwa: "windows-rwa", crawl: "ubuntu-crawl" });
const parsedArchiveInventory = deepFreeze({
  [artifactNames.rwaRaw]: ["rwa-raw.json"],
  [artifactNames.crawlRaw]: ["crawl-raw.json"],
  [artifactNames.combined]: [
    "performance/SHA256SUMS.txt",
    "performance/combined-evidence.json",
    "performance/combined-evidence.md",
    "performance/combined-verification.json",
    "performance/crawl-raw.json",
    "performance/independent-statistics-replay.json",
    "performance/rwa-raw.json",
  ],
});
const checksumNames = Object.freeze([
  "combined-evidence.json",
  "combined-evidence.md",
  "combined-verification.json",
  "crawl-raw.json",
  "independent-statistics-replay.json",
  "rwa-raw.json",
]);
const sha256Pattern = /^[a-f0-9]{64}$/u;

/**
 * Joins semantic verification to exact GitHub Actions artifact bytes. Only the
 * three evidence-bearing ZIPs are decompressed; the other four archives stay
 * opaque and are bound by their exact hosted size and SHA-256 metadata.
 */
export function bindPerformanceReplicationArtifacts({
  semanticReceipt,
  hostedReceipt,
  artifactZipBytes,
} = {}) {
  const semantic = assertSemanticReceipt(semanticReceipt);
  const hosted = assertHostedReceipt(hostedReceipt);
  const exactArchives = assertExactArchiveObject(artifactZipBytes);
  const hostedArtifacts = new Map(hosted.artifacts.map((entry) => [entry.name, entry]));

  const archives = performanceReplicationExpectedArtifactNames.map((name) => {
    const bytes = exactArchives[name];
    const metadata = hostedArtifacts.get(name);
    const sha256 = hash(bytes);
    if (bytes.byteLength !== metadata.sizeInBytes) {
      throw new TypeError(`Artifact ZIP size does not match hosted metadata: ${name}`);
    }
    if (`sha256:${sha256}` !== metadata.digest) {
      throw new TypeError(`Artifact ZIP SHA-256 does not match hosted metadata: ${name}`);
    }
    return {
      name,
      artifactId: metadata.id,
      bytes: bytes.byteLength,
      sha256,
    };
  });

  const rwaArchive = parseExactZip(
    exactArchives[artifactNames.rwaRaw],
    parsedArchiveInventory[artifactNames.rwaRaw],
    artifactNames.rwaRaw,
  );
  const crawlArchive = parseExactZip(
    exactArchives[artifactNames.crawlRaw],
    parsedArchiveInventory[artifactNames.crawlRaw],
    artifactNames.crawlRaw,
  );
  const combinedArchive = parseExactZip(
    exactArchives[artifactNames.combined],
    parsedArchiveInventory[artifactNames.combined],
    artifactNames.combined,
  );

  const rwaRaw = rwaArchive.get("rwa-raw.json");
  const crawlRaw = crawlArchive.get("crawl-raw.json");
  const combinedRwaRaw = combinedArchive.get("performance/rwa-raw.json");
  const combinedCrawlRaw = combinedArchive.get("performance/crawl-raw.json");
  if (!rwaRaw.equals(combinedRwaRaw)) {
    throw new TypeError("RWA lane raw bytes differ from the combined artifact copy");
  }
  if (!crawlRaw.equals(combinedCrawlRaw)) {
    throw new TypeError("Crawl lane raw bytes differ from the combined artifact copy");
  }

  assertCombinedChecksums(combinedArchive);
  const combinedEvidence = combinedArchive.get("performance/combined-evidence.json");
  assertSemanticFileIdentity(semantic.fileBoundary.inputs.fresh.rwa, rwaRaw, "fresh RWA");
  assertSemanticFileIdentity(semantic.fileBoundary.inputs.fresh.crawl, crawlRaw, "fresh crawl");
  assertSemanticFileIdentity(
    semantic.fileBoundary.inputs.fresh.combined,
    combinedEvidence,
    "fresh combined evidence",
  );
  const workflow = assertWorkflowBinding(semantic, hosted);

  const combinedFiles = parsedArchiveInventory[artifactNames.combined].map((name) => {
    const bytes = combinedArchive.get(name);
    return { name, bytes: bytes.byteLength, sha256: hash(bytes) };
  });
  const receipt = {
    schema: performanceReplicationArtifactBindingSchema,
    status: "passed",
    pooling: "none",
    claimBoundary: "two_separate_single_host_observations_only",
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    inputs: {
      semanticReceiptSchema: semantic.schema,
      hostedReceiptSchema: hosted.schema,
      workflow,
    },
    artifactArchives: archives,
    extractedFiles: {
      rwaLaneRaw: {
        archive: artifactNames.rwaRaw,
        name: "rwa-raw.json",
        bytes: rwaRaw.byteLength,
        sha256: hash(rwaRaw),
      },
      crawlLaneRaw: {
        archive: artifactNames.crawlRaw,
        name: "crawl-raw.json",
        bytes: crawlRaw.byteLength,
        sha256: hash(crawlRaw),
      },
      combinedArchive: combinedFiles,
    },
    verification: {
      exactSevenArchiveSet: true,
      allArchiveSizesAndDigestsMatchHostedReceipt: true,
      onlyThreeEvidenceArchivesParsed: true,
      parsedInventoriesExactAndSafe: true,
      laneRawCopiesByteIdentical: true,
      combinedChecksumsExact: true,
      semanticFreshFileBoundaryMatched: true,
      semanticAndHostedWorkflowMatched: true,
      laneJobsMatched: true,
      rawContentsRetained: false,
      urlsRetained: false,
    },
  };
  return deepFreeze(receipt);
}

function assertSemanticReceipt(value) {
  exactKeys(value, [
    "schema",
    "protocolStatus",
    "pooling",
    "claimBoundary",
    "decisionState",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
    "originalAssetIdentityDeclaration",
    "tracks",
    "fileBoundary",
  ], "semantic replication receipt");
  if (
    value.schema !== performanceReplicationVerificationSchema ||
    value.protocolStatus !== "protocol_valid" ||
    value.pooling !== "none" ||
    value.claimBoundary !== "two_separate_single_host_observations_only" ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false
  ) {
    throw new TypeError("Semantic receipt escalates or changes the replication claim boundary");
  }
  exactKeys(value.tracks, ["rwa", "crawl"], "semantic replication tracks");
  for (const lane of ["rwa", "crawl"]) {
    if (value.tracks[lane]?.protocolStatus !== "protocol_valid") {
      throw new TypeError(`Semantic ${lane} track is not protocol-valid`);
    }
  }
  exactKeys(value.fileBoundary, [
    "originalAssetSha256Verified",
    "canonicalJsonVerified",
    "allInputAndOutputPathsDistinct",
    "outputCreation",
    "authoritativeReceiptPromotedLast",
    "inputs",
  ], "semantic file boundary");
  if (
    value.fileBoundary.originalAssetSha256Verified !== true ||
    value.fileBoundary.canonicalJsonVerified !== true ||
    value.fileBoundary.allInputAndOutputPathsDistinct !== true ||
    value.fileBoundary.outputCreation !== "fsynced_sibling_temp_no_clobber_link" ||
    value.fileBoundary.authoritativeReceiptPromotedLast !== true
  ) {
    throw new TypeError("Semantic receipt file boundary is not verified");
  }
  exactKeys(value.fileBoundary.inputs, ["original", "fresh"], "semantic file inputs");
  for (const group of ["original", "fresh"]) {
    exactKeys(
      value.fileBoundary.inputs[group],
      ["rwa", "crawl", "combined"],
      `semantic ${group} file identities`,
    );
    for (const item of ["rwa", "crawl", "combined"]) {
      assertFileIdentity(value.fileBoundary.inputs[group][item], `${group} ${item}`);
    }
  }
  return value;
}

function assertHostedReceipt(value) {
  exactKeys(value, [
    "schema",
    "status",
    "producer",
    "oneShot",
    "contract",
    "jobs",
    "artifacts",
    "verification",
  ], "hosted replication receipt");
  if (
    value.schema !== performanceReplicationHostedProvenanceSchema ||
    value.status !== "passed"
  ) {
    throw new TypeError("Hosted replication receipt is not valid");
  }
  const producerKeys = [
    "repository",
    "repositoryId",
    "workflowId",
    "workflowName",
    "workflowPath",
    "event",
    "headBranch",
    "headSha",
    "runId",
    "runAttempt",
    "status",
    "conclusion",
    "createdAt",
    "runStartedAt",
  ];
  exactKeys(value.producer, producerKeys, "hosted producer");
  const producer = value.producer;
  if (
    producer.repository !== performanceReplicationHostedIdentity.repository ||
    producer.workflowId !== performanceReplicationHostedIdentity.workflow.id ||
    producer.workflowName !== performanceReplicationHostedIdentity.workflow.name ||
    producer.workflowPath !== performanceReplicationHostedIdentity.workflow.path ||
    producer.event !== performanceReplicationHostedIdentity.event ||
    producer.headBranch !== performanceReplicationHostedIdentity.headBranch ||
    producer.headSha !== performanceReplicationHostedIdentity.headSha ||
    producer.runAttempt !== performanceReplicationHostedIdentity.runAttempt ||
    producer.status !== "completed" ||
    producer.conclusion !== "success" ||
    !Number.isSafeInteger(producer.repositoryId) || producer.repositoryId < 1 ||
    !Number.isSafeInteger(producer.runId) || producer.runId < 1
  ) {
    throw new TypeError("Hosted producer identity is invalid");
  }
  const createdAt = canonicalInstant(producer.createdAt, "hosted producer createdAt");
  const runStartedAt = canonicalInstant(
    producer.runStartedAt,
    "hosted producer runStartedAt",
  );
  if (runStartedAt < createdAt) {
    throw new TypeError("Hosted producer started before it was created");
  }
  exactKeys(value.oneShot, [
    "completeListing",
    "enumeratedRunCount",
    "matchingRunCount",
    "selectedRunId",
  ], "hosted one-shot proof");
  if (
    value.oneShot.completeListing !== true ||
    !Number.isSafeInteger(value.oneShot.enumeratedRunCount) ||
    value.oneShot.enumeratedRunCount < 1 ||
    value.oneShot.matchingRunCount !== 1 ||
    value.oneShot.selectedRunId !== producer.runId
  ) {
    throw new TypeError("Hosted one-shot proof is invalid");
  }
  exactKeys(value.contract, [
    "repository",
    "tag",
    "releaseId",
    "immutable",
    "draft",
    "prerelease",
    "publishedAt",
    "targetCommitSha",
    "soleParentSha",
    "treeSha",
    "asset",
  ], "hosted preregistration contract");
  exactKeys(value.contract.asset, [
    "name",
    "id",
    "sizeInBytes",
    "digest",
  ], "hosted preregistration contract asset");
  const contractPublishedAt = canonicalInstant(
    value.contract.publishedAt,
    "hosted preregistration contract publishedAt",
  );
  if (
    value.contract.repository !== performanceReplicationContractIdentity.repository ||
    value.contract.tag !== performanceReplicationContractIdentity.tag ||
    !Number.isSafeInteger(value.contract.releaseId) || value.contract.releaseId < 1 ||
    value.contract.immutable !== true ||
    value.contract.draft !== false ||
    value.contract.prerelease !== false ||
    contractPublishedAt >= createdAt ||
    !sha40Pattern.test(value.contract.targetCommitSha ?? "") ||
    value.contract.soleParentSha !== performanceReplicationContractIdentity.soleParentSha ||
    !sha40Pattern.test(value.contract.treeSha ?? "") ||
    value.contract.asset.name !== performanceReplicationContractIdentity.assetName ||
    !Number.isSafeInteger(value.contract.asset.id) || value.contract.asset.id < 1 ||
    !Number.isSafeInteger(value.contract.asset.sizeInBytes) ||
    value.contract.asset.sizeInBytes < 1 ||
    !/^sha256:[a-f0-9]{64}$/u.test(value.contract.asset.digest ?? "")
  ) {
    throw new TypeError("Hosted preregistration contract identity is invalid");
  }
  if (!Array.isArray(value.jobs) || value.jobs.length !== performanceReplicationExpectedJobNames.length) {
    throw new TypeError("Hosted receipt job inventory is invalid");
  }
  value.jobs.forEach((job, index) => {
    exactKeys(job, ["name", "id", "status", "conclusion"], "hosted job");
    if (
      job.name !== performanceReplicationExpectedJobNames[index] ||
      !Number.isSafeInteger(job.id) || job.id < 1 ||
      job.status !== "completed" || job.conclusion !== "success"
    ) {
      throw new TypeError("Hosted receipt job identity is invalid");
    }
  });
  if (!Array.isArray(value.artifacts) ||
    value.artifacts.length !== performanceReplicationExpectedArtifactNames.length) {
    throw new TypeError("Hosted receipt artifact inventory is invalid");
  }
  value.artifacts.forEach((artifact, index) => {
    exactKeys(artifact, ["name", "id", "sizeInBytes", "digest"], "hosted artifact");
    if (
      artifact.name !== performanceReplicationExpectedArtifactNames[index] ||
      !Number.isSafeInteger(artifact.id) || artifact.id < 1 ||
      !Number.isSafeInteger(artifact.sizeInBytes) || artifact.sizeInBytes < 1 ||
      !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? "")
    ) {
      throw new TypeError("Hosted receipt artifact identity is invalid");
    }
  });
  exactKeys(value.verification, [
    "exactPreregisteredRunIdentity",
    "completeWorkflowRunsListing",
    "exactlyOneMatchingFirstAttemptRun",
    "immutableContractPublishedBeforeRun",
    "contractCommitHasSoleFrozenParent",
    "publicApiRepositoryUrlsVerified",
    "originalRunAndJobIdsRejected",
    "exactlyFourSuccessfulBenchmarkJobs",
    "exactlySevenBoundAttemptOneArtifacts",
    "expiredArtifactsRejected",
    "urlsRetained",
  ], "hosted verification");
  if (
    value.verification.exactPreregisteredRunIdentity !== true ||
    value.verification.completeWorkflowRunsListing !== true ||
    value.verification.exactlyOneMatchingFirstAttemptRun !== true ||
    value.verification.immutableContractPublishedBeforeRun !== true ||
    value.verification.contractCommitHasSoleFrozenParent !== true ||
    value.verification.publicApiRepositoryUrlsVerified !== true ||
    value.verification.originalRunAndJobIdsRejected !== true ||
    value.verification.exactlyFourSuccessfulBenchmarkJobs !== true ||
    value.verification.exactlySevenBoundAttemptOneArtifacts !== true ||
    value.verification.expiredArtifactsRejected !== true ||
    value.verification.urlsRetained !== false
  ) {
    throw new TypeError("Hosted receipt verification boundary is invalid");
  }
  return value;
}

function assertExactArchiveObject(value) {
  exactKeys(value, performanceReplicationExpectedArtifactNames, "artifact ZIP byte object");
  for (const name of performanceReplicationExpectedArtifactNames) {
    if (!Buffer.isBuffer(value[name]) || value[name].byteLength < 1) {
      throw new TypeError(`Artifact ZIP must be a non-empty exact byte Buffer: ${name}`);
    }
  }
  return value;
}

function parseExactZip(bytes, expectedNames, label) {
  let entries;
  try {
    entries = new AdmZip(bytes).getEntries();
  } catch (error) {
    throw new TypeError(`Artifact is not a readable ZIP: ${label}`, { cause: error });
  }
  const contents = new Map();
  for (const entry of entries) {
    const name = rawEntryName(entry, label);
    if (entry.isDirectory) {
      throw new TypeError(`Artifact ZIP contains a directory entry: ${label}: ${name}`);
    }
    assertSafeArchiveName(name, label);
    if (contents.has(name)) {
      throw new TypeError(`Artifact ZIP contains a duplicate entry: ${label}: ${name}`);
    }
    let data;
    try {
      data = entry.getData();
    } catch (error) {
      throw new TypeError(`Artifact ZIP entry cannot be read: ${label}: ${name}`, { cause: error });
    }
    if (!Buffer.isBuffer(data)) {
      throw new TypeError(`Artifact ZIP entry did not yield bytes: ${label}: ${name}`);
    }
    contents.set(name, Buffer.from(data));
  }
  const actualNames = [...contents.keys()].sort();
  const exactNames = [...expectedNames].sort();
  if (!isDeepStrictEqual(actualNames, exactNames)) {
    throw new TypeError(`Artifact ZIP inventory is not exact: ${label}`);
  }
  return contents;
}

function rawEntryName(entry, label) {
  if (!Buffer.isBuffer(entry.rawEntryName)) {
    throw new TypeError(`Artifact ZIP entry name is unavailable: ${label}`);
  }
  const name = entry.rawEntryName.toString("utf8");
  if (!Buffer.from(name, "utf8").equals(entry.rawEntryName)) {
    throw new TypeError(`Artifact ZIP entry name is not valid UTF-8: ${label}`);
  }
  return name;
}

function assertSafeArchiveName(name, label) {
  const segments = name.split("/");
  if (
    name.length === 0 || name.includes("\\") || name.includes("\0") ||
    name.startsWith("/") || /^[A-Za-z]:/u.test(name) ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new TypeError(`Artifact ZIP contains an unsafe entry name: ${label}: ${name}`);
  }
}

function assertCombinedChecksums(contents) {
  const expected = checksumNames.map((name) => {
    const bytes = contents.get(`performance/${name}`);
    return `${hash(bytes)}  ${name}\n`;
  }).join("");
  const actual = contents.get("performance/SHA256SUMS.txt");
  if (!actual.equals(Buffer.from(expected, "utf8"))) {
    throw new TypeError("Combined SHA256SUMS.txt is not the exact six-entry non-self manifest");
  }
}

function assertSemanticFileIdentity(identity, bytes, label) {
  if (identity.bytes !== bytes.byteLength || identity.sha256 !== hash(bytes)) {
    throw new TypeError(`${label} bytes do not match the semantic file boundary`);
  }
}

function assertWorkflowBinding(semantic, hosted) {
  const rwa = semantic.tracks.rwa?.observations?.fresh?.workflow;
  const crawl = semantic.tracks.crawl?.observations?.fresh?.workflow;
  if (!isPlainRecord(rwa) || !isDeepStrictEqual(rwa, crawl)) {
    throw new TypeError("Semantic fresh RWA and crawl workflow identities differ");
  }
  exactKeys(rwa, [
    "provider",
    "repository",
    "workflow",
    "runId",
    "runAttempt",
    "workflowSourceSha",
    "workflowSourceRef",
    "jobs",
  ], "semantic fresh workflow");
  exactKeys(rwa.jobs, ["rwa", "crawl"], "semantic fresh workflow jobs");
  const producer = hosted.producer;
  if (
    rwa.provider !== "github-actions" ||
    rwa.repository !== producer.repository ||
    rwa.workflow !== producer.workflowName ||
    rwa.runId !== String(producer.runId) ||
    rwa.runAttempt !== String(producer.runAttempt) ||
    rwa.workflowSourceSha !== producer.headSha ||
    rwa.workflowSourceRef !== `refs/heads/${producer.headBranch}`
  ) {
    throw new TypeError("Semantic and hosted workflow run/SHA/ref identities differ");
  }
  if (!isDeepStrictEqual(rwa.jobs, laneJobIds)) {
    throw new TypeError("Semantic lane job names differ from the frozen workflow jobs");
  }
  const hostedNames = hosted.jobs.map(({ name }) => name);
  if (!isDeepStrictEqual(hostedNames, performanceReplicationExpectedJobNames) ||
    hostedNames[0] !== jobNames.source || hostedNames[1] !== jobNames.rwa ||
    hostedNames[2] !== jobNames.crawl || hostedNames[3] !== jobNames.combined) {
    throw new TypeError("Hosted job names do not bind the semantic lanes");
  }
  const hostedJobs = new Map(hosted.jobs.map((job) => [job.name, job]));
  return {
    provider: "github-actions",
    repository: producer.repository,
    workflow: producer.workflowName,
    runId: producer.runId,
    runAttempt: producer.runAttempt,
    workflowSourceSha: producer.headSha,
    workflowSourceRef: `refs/heads/${producer.headBranch}`,
    jobs: {
      rwa: {
        lane: laneJobIds.rwa,
        hostedName: jobNames.rwa,
        hostedJobId: hostedJobs.get(jobNames.rwa).id,
      },
      crawl: {
        lane: laneJobIds.crawl,
        hostedName: jobNames.crawl,
        hostedJobId: hostedJobs.get(jobNames.crawl).id,
      },
      combined: {
        hostedName: jobNames.combined,
        hostedJobId: hostedJobs.get(jobNames.combined).id,
      },
    },
  };
}

function assertFileIdentity(value, label) {
  exactKeys(value, ["bytes", "sha256"], `${label} file identity`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1 ||
    !sha256Pattern.test(value.sha256 ?? "")) {
    throw new TypeError(`Invalid ${label} file identity`);
  }
}

const sha40Pattern = /^[a-f0-9]{40}$/u;

function canonicalInstant(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) {
    throw new TypeError(`${label} is not a canonical UTC instant`);
  }
  const milliseconds = Date.parse(value);
  const millisecondForm = value.includes(".") ? value : value.replace(/Z$/u, ".000Z");
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== millisecondForm) {
    throw new TypeError(`${label} is not a valid canonical UTC instant`);
  }
  return milliseconds;
}

function exactKeys(value, expected, label) {
  if (!isPlainRecord(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
