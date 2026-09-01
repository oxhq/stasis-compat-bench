import assert from "node:assert/strict";
import test from "node:test";

import { validateFrozenCorpus } from "../src/wild/binding.mjs";
import {
  candidate,
  evidenceIdentity,
  expectedVersions,
  preflightRules,
  protocol,
  runtimePins,
  selectionSeed,
  strata,
  trancoSourceIdentity,
  trancoSourceMetadataSha256,
} from "../src/wild/config.mjs";
import { deterministicRankOrder } from "../src/wild/selection.mjs";

test("frozen corpus validator binds all 100 entries to selected preflight attempts", () => {
  const urls = [];
  const attempts = [];
  const sourceDomains = [];
  let slot = 0;
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
    const excludedRank = order.rankAt(0);
    const excludedDomain = `site-${excludedRank}.example.com`;
    sourceDomains[excludedRank] = excludedDomain;
    attempts.push(excludedAttempt(permutation.length - 1, {
      permutationIndex: 0,
      rank: excludedRank,
      domain: excludedDomain,
      requestedUrl: `https://${excludedDomain}/`,
      stratumId: stratum.id,
    }));
    for (let offset = 0; offset < stratum.quota; offset += 1) {
      slot += 1;
      const permutationIndex = offset + 1;
      const rank = order.rankAt(permutationIndex);
      const domain = `site-${rank}.example.com`;
      sourceDomains[rank] = domain;
      const entry = {
        slot,
        stratumId: stratum.id,
        stratumSlot: offset + 1,
        permutationIndex,
        rank,
        domain,
        requestedUrl: `https://${domain}/`,
      };
      urls.push(entry);
      attempts.push({
        outcome: "selected",
        stage: "eligible",
        selectedSlot: slot,
        stratumSlot: entry.stratumSlot,
        permutationIndex: entry.permutationIndex,
        rank,
        domain: entry.domain,
        stratumId: entry.stratumId,
        requestedUrl: entry.requestedUrl,
        reason: {
          status: "success",
          code: "eligible",
          responseStatus: 200,
          contentType: "text/html",
          finalUrlIdentity: "d".repeat(64),
          titleIdentity: "e".repeat(64),
          titleCodePointLength: 7,
          titleUtf8Bytes: 7,
          linkCount: 1,
          wallTimeMs: 1,
        },
        robots: { status: "allowed", reason: "robots_allowed", redirectCount: 0 },
        rootGate: { addressCount: 1, families: [4] },
      });
    }
  }
  const ledgerSha256 = "a".repeat(64);
  const preregistrationCommit = "c".repeat(40);
  const source = {
    listId: trancoSourceIdentity.listId,
    createdOn: trancoSourceIdentity.createdOn,
    downloadUrl: trancoSourceIdentity.downloadUrl,
    bytes: trancoSourceIdentity.bytes,
    sha256: trancoSourceIdentity.sha256,
    rowCount: trancoSourceIdentity.rowCount,
    metadataFile: "tranco-74V4X-source.json",
    metadataSha256: trancoSourceMetadataSha256,
  };
  const corpus = {
    schema: "stasis-wild-corpus-v1",
    protocol,
    preregistrationCommit,
    source,
    count: 100,
    selection: {
      eligibility: "baseline-preflight-v2",
      seed: selectionSeed,
      algorithm: "sha256-u64be-offset-coprime-stride-full-cycle-v1",
      strata: permutation,
      preflightLedgerSha256: ledgerSha256,
      preflightLedger: "wild-tranco-74V4X-v1-preflight.json",
    },
    urls,
  };
  const ledger = {
    schema: "stasis-wild-preflight-ledger-v2",
    protocol,
    preregistrationCommit,
    selectedCount: 100,
    attemptedCount: 105,
    excludedCount: 5,
    source: corpus.source,
    rules: preflightRules,
    runtime: frozenRuntime(),
    permutation,
    startedAt: "2026-08-26T00:00:00.000Z",
    completedAt: "2026-08-26T00:01:00.000Z",
    attempts,
  };
  assert.doesNotThrow(() => validateFrozenCorpus(corpus, ledger, ledgerSha256, sourceDomains));
  assert.throws(
    () => validateFrozenCorpus(corpus, ledger, "b".repeat(64), sourceDomains),
    /ledger binding is invalid/u,
  );
  assert.throws(
    () => validateFrozenCorpus(
      { ...corpus, preregistrationCommit: "d".repeat(40) },
      ledger,
      ledgerSha256,
      sourceDomains,
    ),
    /ledger binding is invalid/u,
  );

  const policyInvalidLedger = structuredClone(ledger);
  policyInvalidLedger.attempts[0].stage = "baseline";
  assert.throws(
    () => validateFrozenCorpus(corpus, policyInvalidLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );

  const forgedEvidenceLedger = structuredClone(ledger);
  const firstSelectedIndex = forgedEvidenceLedger.attempts.findIndex(
    (attempt) => attempt.outcome === "selected",
  );
  forgedEvidenceLedger.attempts[firstSelectedIndex].reason.finalUrlIdentity = "not-a-digest";
  assert.throws(
    () => validateFrozenCorpus(corpus, forgedEvidenceLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid|selected preflight attempts/u,
  );

  const missingEligibilityLedger = structuredClone(ledger);
  delete missingEligibilityLedger.attempts[firstSelectedIndex].reason.contentType;
  assert.throws(
    () => validateFrozenCorpus(corpus, missingEligibilityLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid|selected preflight attempts/u,
  );

  const wrongRulesLedger = structuredClone(ledger);
  wrongRulesLedger.rules.seed = "wrong";
  assert.throws(
    () => validateFrozenCorpus(corpus, wrongRulesLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );

  const lateAttemptLedger = structuredClone(ledger);
  const firstOrder = deterministicRankOrder(strata[0], selectionSeed);
  const lateRank = firstOrder.rankAt(strata[0].quota);
  lateAttemptLedger.attempts.splice(strata[0].quota, 0, {
    outcome: "excluded",
    stage: "baseline",
    stratumId: strata[0].id,
    permutationIndex: strata[0].quota,
    rank: lateRank,
    domain: `site-${lateRank}.example.com`,
    requestedUrl: `https://site-${lateRank}.example.com/`,
  });
  lateAttemptLedger.attemptedCount += 1;
  lateAttemptLedger.excludedCount += 1;
  assert.throws(
    () => validateFrozenCorpus(corpus, lateAttemptLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );

  const defaultPortCorpus = structuredClone(corpus);
  const defaultPortLedger = structuredClone(ledger);
  defaultPortCorpus.urls[0].requestedUrl = `https://${defaultPortCorpus.urls[0].domain}:443/`;
  defaultPortLedger.attempts.find((attempt) => attempt.outcome === "selected").requestedUrl =
    defaultPortCorpus.urls[0].requestedUrl;
  assert.throws(
    () => validateFrozenCorpus(defaultPortCorpus, defaultPortLedger, ledgerSha256, sourceDomains),
    /Wild artifact contains|ledger binding is invalid|Unsafe or out-of-stratum/u,
  );

  const rewrittenCorpus = structuredClone(corpus);
  const rewrittenLedger = structuredClone(ledger);
  const rewrittenEntry = rewrittenCorpus.urls[0];
  const rewrittenAttempt = rewrittenLedger.attempts.find(
    (attempt) => attempt.outcome === "selected" && attempt.selectedSlot === rewrittenEntry.slot,
  );
  rewrittenEntry.domain = "coherently-rewritten.example.com";
  rewrittenEntry.requestedUrl = "https://coherently-rewritten.example.com/";
  rewrittenAttempt.domain = rewrittenEntry.domain;
  rewrittenAttempt.requestedUrl = rewrittenEntry.requestedUrl;
  assert.throws(
    () => validateFrozenCorpus(rewrittenCorpus, rewrittenLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid|Unsafe or out-of-stratum/u,
  );

  const enrichedCorpus = structuredClone(corpus);
  enrichedCorpus.urls[0].title = "PRIVATE TITLE";
  assert.throws(
    () => validateFrozenCorpus(enrichedCorpus, ledger, ledgerSha256, sourceDomains),
    /Wild artifact contains|invalid top-level shape|Invalid frozen wild corpus entry/u,
  );

  const malformedExcludedLedger = structuredClone(ledger);
  delete malformedExcludedLedger.attempts[0].reason;
  assert.throws(
    () => validateFrozenCorpus(corpus, malformedExcludedLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );

  const selectedFieldsOnExcluded = structuredClone(ledger);
  selectedFieldsOnExcluded.attempts[0].selectedSlot = 999;
  assert.throws(
    () => validateFrozenCorpus(corpus, selectedFieldsOnExcluded, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );

  const relabeledExcluded = structuredClone(ledger);
  relabeledExcluded.attempts[0].stage = "baseline";
  relabeledExcluded.attempts[0].reason = {
    status: "success",
    code: "eligible",
    wallTimeMs: 1,
  };
  assert.throws(
    () => validateFrozenCorpus(corpus, relabeledExcluded, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );

  const missingRootGate = structuredClone(ledger);
  delete missingRootGate.attempts.find((attempt) => attempt.stage === "robots").rootGate;
  assert.throws(
    () => validateFrozenCorpus(corpus, missingRootGate, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );

  const enrichedRuntime = structuredClone(ledger);
  enrichedRuntime.runtime.nodeExecutable = "C:\\Users\\private\\node.exe";
  assert.throws(
    () => validateFrozenCorpus(corpus, enrichedRuntime, ledgerSha256, sourceDomains),
    /Wild artifact contains|ledger binding is invalid/u,
  );

  const beaconExcludedLedger = structuredClone(ledger);
  beaconExcludedLedger.attempts[0] = {
    ...beaconExcludedLedger.attempts[0],
    stage: "baseline",
    reason: {
      status: "policy_excluded",
      code: "non_read_only_request",
      blockedRequests: [{
        code: "non_read_only_method",
        method: "POST",
        resourceType: "ping",
      }],
      blockedRequestDetailsOmitted: 0,
      wallTimeMs: 1,
    },
    robots: { status: "allowed", reason: "robots_allowed", redirectCount: 0 },
    rootGate: { addressCount: 1, families: [4] },
  };
  assert.doesNotThrow(
    () => validateFrozenCorpus(corpus, beaconExcludedLedger, ledgerSha256, sourceDomains),
  );

  const unknownResourceLedger = structuredClone(beaconExcludedLedger);
  unknownResourceLedger.attempts[0].reason.blockedRequests[0].resourceType = "future_type";
  assert.throws(
    () => validateFrozenCorpus(corpus, unknownResourceLedger, ledgerSha256, sourceDomains),
    /ledger binding is invalid/u,
  );
});

function excludedAttempt(index, candidateEntry) {
  const rootGate = { addressCount: 1, families: [4] };
  const robots = { status: "allowed", reason: "robots_allowed", redirectCount: 0 };
  const common = { ...candidateEntry, outcome: "excluded" };
  if (index === 0) {
    return { ...common, stage: "public_target", reason: { code: "dns_resolution_failed" } };
  }
  if (index === 1) {
    return {
      ...common,
      stage: "robots",
      reason: { status: "unavailable", reason: "robots_timeout", redirectCount: 0 },
      rootGate,
    };
  }
  if (index === 2) {
    return {
      ...common,
      stage: "public_target",
      reason: {
        status: "safety_rejected",
        code: "final_target_rejected",
        detail: { code: "non_global_address", family: 4 },
        wallTimeMs: 1,
      },
      robots,
      rootGate,
    };
  }
  if (index === 3) {
    return {
      ...common,
      stage: "baseline",
      reason: { status: "failure", code: "navigation_timeout", wallTimeMs: 1 },
      robots,
      rootGate,
    };
  }
  return {
    ...common,
    stage: "baseline",
    reason: {
      status: "policy_excluded",
      code: "captcha_challenge",
      finalUrlIdentity: "d".repeat(64),
      responseStatus: 200,
      contentType: "text/html",
      wallTimeMs: 1,
    },
    robots,
    rootGate,
  };
}

function frozenRuntime() {
  return {
    node: expectedVersions.node,
    nodeExecutableBasename: runtimePins.nodeExecutableBasename,
    nodeExecutableBytes: runtimePins.nodeExecutableBytes,
    nodeExecutableSha256: runtimePins.nodeExecutableSha256,
    candidateSdkTarball: "candidate/oxhq-stasis-0.3.0.tgz",
    candidateSdkTarballBytes: runtimePins.candidateSdkTarballBytes,
    candidateSdkTarballSha256: runtimePins.candidateSdkTarballSha256,
    candidateSdk: candidate.version,
    candidateSdkTree: runtimePins.candidateSdkTree,
    harnessSdk: "0.2.1",
    crawlee: expectedVersions.crawlee,
    crawleeTree: runtimePins.crawleeTree,
    playwright: expectedVersions.playwright,
    playwrightTree: runtimePins.playwrightTree,
    installedNodeModulesTree: runtimePins.installedNodeModulesTree,
    chromiumVersion: "140.0.7339.16",
    chromiumExecutableBasename: runtimePins.chromiumExecutableBasename,
    chromiumExecutableBytes: runtimePins.chromiumExecutableBytes,
    chromiumExecutableSha256: runtimePins.chromiumExecutableSha256,
  };
}
