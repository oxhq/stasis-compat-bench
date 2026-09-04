import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  expectedVersions,
  preflightRules,
  preflightLedgerPath,
  protocol,
  selectedCorpusPath,
  selectionSeed,
  strata,
  trancoInputPath,
  trancoSourceIdentity,
  trancoSourceMetadataPath,
  userAgent,
} from "./config.mjs";
import { runBaselinePreflightObservation } from "./baseline-preflight.mjs";
import {
  serializeWildArtifact,
  writeWildArtifactJson,
} from "./artifact-privacy.mjs";
import { inspectPublicHttpUrl, projectPublicTargetError } from "./public-target.mjs";
import { checkRobotsPermission, isExactAllowedRobotsDecision } from "./robots.mjs";
import { deterministicRankOrder, loadVerifiedTrancoDomains } from "./selection.mjs";
import { readAndVerifyWildRuntimeIdentity } from "./runtime-identity.mjs";
import { assertWildPreregistration } from "./preregistration.mjs";
import {
  artifactRoot,
  sha256File,
} from "../shared/io.mjs";

export async function runWildPreflight({
  inspect = inspectPublicHttpUrl,
  robots = checkRobotsPermission,
  observe = runBaselinePreflightObservation,
  preregister = assertWildPreregistration,
  ensureOutputsAbsent = assertOutputsAbsent,
  readSourceMetadata = async () => JSON.parse(await readFile(trancoSourceMetadataPath, "utf8")),
  runtimeVersion = process.version,
} = {}) {
  const preregistrationCommit = await preregister();
  if (!/^[a-f0-9]{40}$/u.test(preregistrationCommit ?? "")) {
    throw new Error("Wild preregistration gate returned an invalid commit identity");
  }
  await ensureOutputsAbsent();
  if (runtimeVersion !== expectedVersions.node) {
    throw new Error(`Node runtime mismatch: expected ${expectedVersions.node}, got ${runtimeVersion}`);
  }

  const sourceMetadata = await readSourceMetadata();
  validateSourceMetadata(sourceMetadata);
  const [source, sourceMetadataSha256, runtime] = await Promise.all([
    loadVerifiedTrancoDomains(trancoInputPath, sourceMetadata),
    sha256File(trancoSourceMetadataPath),
    readAndVerifyWildRuntimeIdentity(),
  ]);

  const startedAt = new Date().toISOString();
  const attempts = [];
  const selected = [];
  const permutation = [];
  for (const stratum of strata) {
    const order = deterministicRankOrder(stratum, selectionSeed);
    permutation.push({
      stratumId: stratum.id,
      minRank: stratum.minRank,
      maxRank: stratum.maxRank,
      quota: stratum.quota,
      maxAttempts: stratum.maxAttempts,
      offset: order.offset,
      stride: order.stride,
      length: order.length,
    });
    let acceptedInStratum = 0;
    for (
      let permutationIndex = 0;
      permutationIndex < stratum.maxAttempts && acceptedInStratum < stratum.quota;
      permutationIndex += 1
    ) {
      const rank = order.rankAt(permutationIndex);
      const domain = source.domains[rank];
      const requestedUrl = `https://${domain}/`;
      const candidateEntry = { rank, domain, requestedUrl, stratumId: stratum.id, permutationIndex };
      const attempt = { ...candidateEntry };

      let rootGate;
      try {
        rootGate = await inspect(requestedUrl, { requireHttps: true });
      } catch (error) {
        attempts.push({
          ...attempt,
          outcome: "excluded",
          stage: "public_target",
          reason: projectPublicTargetError(error),
        });
        continue;
      }

      const robotsResult = await robots(requestedUrl, { inspect });
      if (robotsResult?.status === "allowed" && !isExactAllowedRobotsDecision(robotsResult)) {
        throw new Error(`Robots gate returned invalid allowed evidence at Tranco rank ${rank}`);
      }
      if (robotsResult.status !== "allowed") {
        attempts.push({
          ...attempt,
          outcome: "excluded",
          stage: "robots",
          reason: robotsResult,
          rootGate: projectRootGate(rootGate),
        });
        continue;
      }

      const baseline = await observe(candidateEntry, { inspect });
      if (baseline.status === "harness_error") {
        const failure = {
          schema: "stasis-wild-preflight-failure-v2",
          protocol,
          source: projectSource(sourceMetadata, sourceMetadataSha256),
          startedAt,
          failedAt: new Date().toISOString(),
          failedCandidate: candidateEntry,
          baseline,
          attempts,
        };
        await writeFailureArtifact(failure);
        throw new Error(`Preflight harness failed at Tranco rank ${rank}: ${baseline.code}`);
      }

      if (baseline.status !== "success") {
        attempts.push({
          ...attempt,
          outcome: "excluded",
          stage: baseline.status === "safety_rejected" ? "public_target" : "baseline",
          reason: projectBaseline(baseline),
          robots: projectRobots(robotsResult),
          rootGate: projectRootGate(rootGate),
        });
        continue;
      }

      acceptedInStratum += 1;
      const selectedEntry = {
        slot: selected.length + 1,
        stratumId: stratum.id,
        stratumSlot: acceptedInStratum,
        permutationIndex,
        rank,
        domain,
        requestedUrl,
      };
      selected.push(selectedEntry);
      attempts.push({
        ...attempt,
        outcome: "selected",
        selectedSlot: selectedEntry.slot,
        stratumSlot: acceptedInStratum,
        stage: "eligible",
        reason: projectBaseline(baseline),
        robots: projectRobots(robotsResult),
        rootGate: projectRootGate(rootGate),
      });
    }

    if (acceptedInStratum !== stratum.quota) {
      const failure = {
        schema: "stasis-wild-preflight-failure-v2",
        protocol,
        source: projectSource(sourceMetadata, sourceMetadataSha256),
        startedAt,
        failedAt: new Date().toISOString(),
        failedStratum: stratum.id,
        requiredQuota: stratum.quota,
        accepted: acceptedInStratum,
        maxAttempts: stratum.maxAttempts,
        permutation,
        attempts,
      };
      await writeFailureArtifact(failure);
      throw new Error(`Preflight quota failed for ${stratum.id}: ${acceptedInStratum}/${stratum.quota}`);
    }
  }

  validateSelected(selected);
  const completedAt = new Date().toISOString();
  const ledger = {
    schema: "stasis-wild-preflight-ledger-v2",
    protocol,
    preregistrationCommit,
    source: projectSource(sourceMetadata, sourceMetadataSha256),
    runtime,
    rules: preflightRules,
    permutation,
    startedAt,
    completedAt,
    selectedCount: selected.length,
    attemptedCount: attempts.length,
    excludedCount: attempts.length - selected.length,
    attempts,
  };
  await writeFrozenJson(preflightLedgerPath, ledger);
  const preflightLedgerSha256 = await sha256File(preflightLedgerPath);

  const corpus = {
    schema: "stasis-wild-corpus-v1",
    protocol,
    preregistrationCommit,
    source: projectSource(sourceMetadata, sourceMetadataSha256),
    selection: {
      seed: selectionSeed,
      algorithm: "sha256-u64be-offset-coprime-stride-full-cycle-v1",
      eligibility: "baseline-preflight-v2",
      preflightLedger: path.basename(preflightLedgerPath),
      preflightLedgerSha256,
      strata: permutation,
    },
    count: selected.length,
    urls: selected,
  };
  await writeFrozenJson(selectedCorpusPath, corpus);
  return {
    corpusPath: path.basename(selectedCorpusPath),
    ledgerPath: path.basename(preflightLedgerPath),
    selectedCount: selected.length,
    attemptedCount: attempts.length,
  };
}

function projectSource(metadata, metadataSha256) {
  return {
    listId: metadata.listId,
    createdOn: metadata.createdOn,
    downloadUrl: metadata.downloadUrl,
    bytes: metadata.bytes,
    sha256: metadata.sha256,
    rowCount: metadata.rowCount,
    metadataFile: path.basename(trancoSourceMetadataPath),
    metadataSha256,
  };
}

function projectRootGate(value) {
  return {
    addressCount: value.addressCount,
    families: value.families,
  };
}

function projectRobots(value) {
  return {
    status: value.status,
    reason: value.reason,
    redirectCount: value.redirectCount,
  };
}

function projectBaseline(value) {
  return {
    status: value.status,
    code: value.code,
    ...(value.finalUrlIdentity === undefined
      ? {}
      : { finalUrlIdentity: value.finalUrlIdentity }),
    ...(value.responseStatus === undefined ? {} : { responseStatus: value.responseStatus }),
    ...(value.contentType === undefined ? {} : { contentType: value.contentType }),
    ...(value.extraction === undefined
      ? {}
      : {
          titleCodePointLength: value.extraction.titleIdentity.codePointLength,
          titleUtf8Bytes: value.extraction.titleIdentity.utf8Bytes,
          titleIdentity: value.extraction.titleIdentity.sha256,
          linkCount: value.extraction.linkIdentities.length,
        }),
    ...(value.detail === undefined ? {} : { detail: value.detail }),
    ...(value.blockedRequests === undefined ? {} : { blockedRequests: value.blockedRequests }),
    ...(value.blockedRequestDetailsOmitted === undefined
      ? {}
      : { blockedRequestDetailsOmitted: value.blockedRequestDetailsOmitted }),
    wallTimeMs: value.wallTimeMs,
  };
}

export function validateSourceMetadata(value) {
  if (!isDeepStrictEqual(value, trancoSourceIdentity)) {
    throw new Error("Invalid frozen Tranco source metadata");
  }
  // This projection is persisted later; reject unsafe metadata before any
  // public target observation begins.
  serializeWildArtifact(projectSource(value, "0".repeat(64)));
}

function validateSelected(selected) {
  const expectedCount = strata.reduce((total, stratum) => total + stratum.quota, 0);
  if (selected.length !== expectedCount) {
    throw new Error(`Selected corpus count mismatch: expected ${expectedCount}, got ${selected.length}`);
  }
  if (new Set(selected.map((entry) => entry.rank)).size !== selected.length) {
    throw new Error("Selected corpus contains duplicate ranks");
  }
  if (new Set(selected.map((entry) => entry.requestedUrl)).size !== selected.length) {
    throw new Error("Selected corpus contains duplicate URLs");
  }
}

async function assertOutputsAbsent() {
  for (const outputPath of [preflightLedgerPath, selectedCorpusPath]) {
    try {
      await access(outputPath);
      throw new Error(`Frozen preflight output already exists: ${outputPath}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function writeFrozenJson(destination, value) {
  const bytes = serializeWildArtifact(value);
  await writeFile(destination, bytes, {
    encoding: "utf8",
    flag: "wx",
  });
}

async function writeFailureArtifact(value) {
  try {
    await writeWildArtifactJson("wild/preflight-failure.json", value);
  } catch {
    // The primary error must remain the preflight failure; artifact collision is still fail-closed.
  }
}

export function preflightFailureArtifactPath() {
  return path.join(artifactRoot(), "wild", "preflight-failure.json");
}
