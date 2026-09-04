import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { assertCrawlPerformanceRaw } from "./crawl.mjs";
import { assertRwaPerformanceArtifact } from "./publication.mjs";
import { summarizePairedDurations } from "./statistics.mjs";

export const performanceReplicationVerificationSchema =
  "stasis-v0.3.3-performance-replication-verification-v1";

export const immutablePerformanceHarness = Object.freeze({
  revision: "c5678b045852a29b89ed4b853da0aa39e6e3bf06",
  tree: "4e491acd7d781878a5e84f57ac769e863ee58ac2",
});

export const publishedPerformanceObservation = deepFreeze({
  workflowRunId: "33851425108",
  workflowRunAttempt: "1",
  workflowSourceSha: "54dde177fe63c34ca1c5059a1381fd7434585f77",
  workflowSourceRef: "refs/heads/codex/stasis-v033-performance-evidence",
  rwa: {
    baselineMedianMilliseconds: "17499.546000",
    baselineIqrMilliseconds: "403.706400",
    stasisMedianMilliseconds: "3890.592700",
    stasisIqrMilliseconds: "133.104900",
    pairedBaselineOverStasis: "4.479108",
  },
  crawl: {
    baselineMedianMilliseconds: "2195.796579",
    baselineIqrMilliseconds: "30.278462",
    stasisMedianMilliseconds: "2378.866899",
    stasisIqrMilliseconds: "69.292015",
    pairedBaselineOverStasis: "0.929559",
  },
});

export const publishedPerformanceAssetDigests = Object.freeze({
  rwaRawJson: "98c938f7070c6f45d1e2b2d37632eb5180d7c1b1d48d2eb84db9e26b6c22092d",
  crawlRawJson: "7db718346d73e3acf3b6919f20318929e60e2a15d5c5f954f849a6b46fa054db",
  combinedEvidenceJson: "088c8a7b3f536be2790dbe339b303a7b8276d2ad70678138dac4e64e5fbbbf70",
});

export const freshPerformanceTrigger = Object.freeze({
  workflowSourceSha: "6c7a6013e00584c8cb8d54c80cee5dbbcf3ca1b9",
  workflowSourceRef: "refs/heads/codex/stasis-v033-performance-evidence",
  workflowRunAttempt: "1",
});

/**
 * Validates one fresh hosted replication against the immutable published run.
 * Statistics remain attached to their own host; this function never combines
 * samples from the two executions.
 */
export function verifyFreshHostPerformanceReplication(value) {
  exactKeys(value, ["fresh", "original"], "performance replication input");
  const original = validateBundle(value.original, "original");
  const fresh = validateBundle(value.fresh, "fresh");

  assertPublishedExecution(original);
  assertPreregisteredFreshExecution(fresh);
  assertFirstAttempts(original, fresh);
  assertImmutableHarness(original, "original");
  assertImmutableHarness(fresh, "fresh");
  assertFreshExecution(original, fresh);

  const rwaScientificIdentity = assertSameScientificIdentity(
    projectRwaScientificIdentity(original.rwaArtifact),
    projectRwaScientificIdentity(fresh.rwaArtifact),
    "RWA",
  );
  const crawlScientificIdentity = assertSameScientificIdentity(
    projectCrawlScientificIdentity(original.crawlRaw),
    projectCrawlScientificIdentity(fresh.crawlRaw),
    "crawl",
  );

  const originalRwaStatistics = summarizeRwa(original.rwaRaw);
  const freshRwaStatistics = summarizeRwa(fresh.rwaRaw);
  const originalCrawlStatistics = summarizeCrawl(original.crawlRaw);
  const freshCrawlStatistics = summarizeCrawl(fresh.crawlRaw);
  assertPublishedStatistics(originalRwaStatistics, originalCrawlStatistics);

  return deepFreeze({
    schema: performanceReplicationVerificationSchema,
    protocolStatus: "protocol_valid",
    pooling: "none",
    claimBoundary: "two_separate_single_host_observations_only",
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    originalAssetIdentityDeclaration: {
      expectedSha256: publishedPerformanceAssetDigests,
      bytesVerifiedByThisFunction: false,
      requiredExternalBoundary: "canonical_file_sha256_before_parsing",
    },
    tracks: {
      rwa: trackReceipt({
        baseline: "cypress",
        hostBindingField: "instanceDigest",
        originalHost: original.rwaRaw.host,
        freshHost: fresh.rwaRaw.host,
        originalWorkflow: original.workflow,
        freshWorkflow: fresh.workflow,
        scientificIdentitySha256: rwaScientificIdentity,
        originalStatistics: originalRwaStatistics,
        freshStatistics: freshRwaStatistics,
        pathDerivedRwaBuildIdentities: {
          original: projectPathDerivedRwaBuildIdentity(original.rwaArtifact),
          fresh: projectPathDerivedRwaBuildIdentity(fresh.rwaArtifact),
        },
        pathDerivedRwaBuildDifferencesExcluded: [
          "identities.rwa.buildTree.sha256",
          "identities.rwa.buildTree.totalBytes",
          "identities.rwa.serverBodies.frontend.sha256",
        ],
      }),
      crawl: trackReceipt({
        baseline: "crawlee",
        hostBindingField: "bootInstanceDigest",
        originalHost: original.crawlRaw.identity.host,
        freshHost: fresh.crawlRaw.identity.host,
        originalHostRuntime: {
          eglRuntime: original.crawlRaw.identity.stasis.eglRuntime,
        },
        freshHostRuntime: {
          eglRuntime: fresh.crawlRaw.identity.stasis.eglRuntime,
        },
        originalWorkflow: original.workflow,
        freshWorkflow: fresh.workflow,
        scientificIdentitySha256: crawlScientificIdentity,
        originalStatistics: originalCrawlStatistics,
        freshStatistics: freshCrawlStatistics,
      }),
    },
  });
}

function validateBundle(value, label) {
  exactKeys(value, ["crawlRaw", "rwaArtifact"], `${label} performance bundle`);
  const rwaRaw = assertRwaPerformanceArtifact(value.rwaArtifact);
  const crawlRaw = assertCrawlPerformanceRaw(value.crawlRaw);
  if (
    rwaRaw.authority.valid !== true ||
    rwaRaw.authority.status !== "valid" ||
    crawlRaw.authority.valid !== true ||
    crawlRaw.authority.status !== "valid"
  ) {
    throw new TypeError(`${label} performance bundle must contain two valid authorities`);
  }
  const workflow = coherentWorkflow(value.rwaArtifact, crawlRaw, label);
  return { rwaArtifact: value.rwaArtifact, rwaRaw, crawlRaw, workflow };
}

function coherentWorkflow(rwaArtifact, crawlRaw, label) {
  const rwa = rwaArtifact.provenance.workflowSource;
  const crawl = crawlRaw.identity.provenance;
  const sharedRwa = {
    provider: rwa.provider,
    repository: rwa.repository,
    workflow: rwa.workflow,
    runId: rwa.runId,
    runAttempt: rwa.runAttempt,
    workflowSourceSha: rwa.revision,
    workflowSourceRef: rwa.ref,
  };
  const sharedCrawl = {
    provider: crawl.provider,
    repository: crawl.repository,
    workflow: crawl.workflow,
    runId: crawl.runId,
    runAttempt: crawl.runAttempt,
    workflowSourceSha: crawl.workflowSourceSha,
    workflowSourceRef: crawl.workflowSourceRef,
  };
  if (!isDeepStrictEqual(sharedRwa, sharedCrawl)) {
    throw new TypeError(`${label} RWA and crawl inputs do not share one workflow execution`);
  }
  if (rwa.job !== "windows-rwa" || crawl.job !== "ubuntu-crawl") {
    throw new TypeError(`${label} performance bundle changed its frozen workflow jobs`);
  }
  return {
    ...sharedRwa,
    jobs: { rwa: rwa.job, crawl: crawl.job },
  };
}

function assertPublishedExecution(original) {
  if (
    original.workflow.runId !== publishedPerformanceObservation.workflowRunId ||
    original.workflow.runAttempt !== publishedPerformanceObservation.workflowRunAttempt ||
    original.workflow.workflowSourceSha !== publishedPerformanceObservation.workflowSourceSha ||
    original.workflow.workflowSourceRef !== publishedPerformanceObservation.workflowSourceRef
  ) {
    throw new TypeError("Original inputs are not the published performance workflow execution");
  }
}

function assertPreregisteredFreshExecution(fresh) {
  if (
    fresh.workflow.workflowSourceSha !== freshPerformanceTrigger.workflowSourceSha ||
    fresh.workflow.workflowSourceRef !== freshPerformanceTrigger.workflowSourceRef ||
    fresh.workflow.runAttempt !== freshPerformanceTrigger.workflowRunAttempt
  ) {
    throw new TypeError("Fresh inputs are not the preregistered workflow trigger execution");
  }
}

function assertFirstAttempts(original, fresh) {
  if (original.workflow.runAttempt !== "1" || fresh.workflow.runAttempt !== "1") {
    throw new TypeError("Performance replication accepts only first workflow attempts");
  }
}

function assertImmutableHarness(bundle, label) {
  const rwaHarness = bundle.rwaArtifact.provenance.harness;
  const crawlHarness = bundle.crawlRaw.identity.provenance;
  const actual = {
    rwa: { revision: rwaHarness.revision, tree: rwaHarness.tree },
    crawl: {
      revision: crawlHarness.harnessCheckoutRevision,
      tree: crawlHarness.harnessCheckoutTree,
    },
  };
  if (
    !isDeepStrictEqual(actual.rwa, immutablePerformanceHarness) ||
    !isDeepStrictEqual(actual.crawl, immutablePerformanceHarness)
  ) {
    throw new TypeError(`${label} performance bundle did not use the immutable harness`);
  }
}

function assertFreshExecution(original, fresh) {
  if (fresh.workflow.runId === original.workflow.runId) {
    throw new TypeError("Fresh replication copied the published workflow run identity");
  }
  if (
    fresh.rwaRaw.host.instanceDigest === original.rwaRaw.host.instanceDigest ||
    fresh.crawlRaw.identity.host.bootInstanceDigest ===
      original.crawlRaw.identity.host.bootInstanceDigest
  ) {
    throw new TypeError("Fresh replication copied a published host-instance identity");
  }
  if (
    isDeepStrictEqual(
      fresh.rwaArtifact.provenance.workflowSource,
      original.rwaArtifact.provenance.workflowSource,
    ) ||
    isDeepStrictEqual(
      fresh.crawlRaw.identity.provenance,
      original.crawlRaw.identity.provenance,
    )
  ) {
    throw new TypeError("Fresh replication copied published workflow provenance");
  }
}

function projectRwaScientificIdentity(artifact) {
  const { buildTree, serverBodies, ...rwaCheckout } = artifact.identities.rwa;
  return {
    schema: artifact.schema,
    protocol: artifact.protocol,
    track: artifact.track,
    harness: {
      revision: artifact.provenance.harness.revision,
      tree: artifact.provenance.harness.tree,
    },
    preregistration: {
      schema: artifact.authorityRaw.schema,
      protocol: artifact.authorityRaw.protocol,
      track: artifact.authorityRaw.track,
      source: artifact.authorityRaw.source,
      plan: artifact.authorityRaw.plan,
      semanticDifferenceDisclosure: artifact.authorityRaw.semanticDifferenceDisclosure,
    },
    identities: {
      node: artifact.identities.node,
      cypress: artifact.identities.cypress,
      stasis: artifact.identities.stasis,
      rwa: {
        ...rwaCheckout,
        buildTree: { fileCount: buildTree.fileCount },
        serverBodies: {
          frontend: {
            contentType: serverBodies.frontend.contentType,
            bytes: serverBodies.frontend.bytes,
          },
          backend: serverBodies.backend,
        },
      },
    },
  };
}

function projectCrawlScientificIdentity(raw) {
  const { hostClassDigest: _crawleeHost, ...crawlee } = raw.identity.crawlee;
  const {
    hostClassDigest: _stasisHost,
    eglRuntime: _hostEglRuntime,
    ...stasis
  } = raw.identity.stasis;
  return {
    schema: raw.schema,
    protocol: raw.protocol,
    track: raw.track,
    rules: raw.rules,
    harness: {
      revision: raw.identity.provenance.harnessCheckoutRevision,
      tree: raw.identity.provenance.harnessCheckoutTree,
    },
    corpus: raw.identity.corpus,
    crawlee,
    stasis,
  };
}

function projectPathDerivedRwaBuildIdentity(artifact) {
  return {
    buildTree: structuredClone(artifact.identities.rwa.buildTree),
    frontendBodySha256: artifact.identities.rwa.serverBodies.frontend.sha256,
  };
}

function assertSameScientificIdentity(original, fresh, label) {
  if (!isDeepStrictEqual(original, fresh)) {
    throw new TypeError(`${label} fresh run changed the frozen scientific identity`);
  }
  return createHash("sha256").update(JSON.stringify(original), "utf8").digest("hex");
}

function summarizeRwa(raw) {
  const pairs = Array.from({ length: 10 }, (_unused, index) => {
    const pairIndex = index + 1;
    const samples = raw.samples.filter((sample) => sample.pairIndex === pairIndex);
    const cypress = samples.find((sample) => sample.runner === "cypress");
    const stasis = samples.find((sample) => sample.runner === "stasis-v0.3.3");
    if (samples.length !== 2 || cypress === undefined || stasis === undefined) {
      throw new TypeError(`RWA pair ${pairIndex} is incomplete`);
    }
    return {
      baselineNs: cypress.timing.durationNs,
      candidateNs: stasis.timing.durationNs,
    };
  });
  return summarizePairedDurations(pairs, {
    baselineLabel: "cypress",
    candidateLabel: "stasis",
  });
}

function summarizeCrawl(raw) {
  const pairs = raw.pairs.map((pair) => {
    const crawlee = pair.observations.find((observation) => observation.lane === "crawlee");
    const stasis = pair.observations.find((observation) => observation.lane === "stasis");
    if (pair.observations.length !== 2 || crawlee === undefined || stasis === undefined) {
      throw new TypeError(`Crawl pair ${pair.pairIndex} is incomplete`);
    }
    return {
      baselineNs: crawlee.timing.durationNs,
      candidateNs: stasis.timing.durationNs,
    };
  });
  return summarizePairedDurations(pairs, {
    baselineLabel: "crawlee",
    candidateLabel: "stasis",
  });
}

function assertPublishedStatistics(rwa, crawl) {
  const actualRwa = publishedProjection(rwa, "cypress");
  const actualCrawl = publishedProjection(crawl, "crawlee");
  if (
    !isDeepStrictEqual(actualRwa, publishedPerformanceObservation.rwa) ||
    !isDeepStrictEqual(actualCrawl, publishedPerformanceObservation.crawl)
  ) {
    throw new TypeError("Original inputs do not replay the published performance observations");
  }
}

function publishedProjection(statistics, baseline) {
  return {
    baselineMedianMilliseconds: statistics[baseline].medianMilliseconds,
    baselineIqrMilliseconds: statistics[baseline].iqrMilliseconds,
    stasisMedianMilliseconds: statistics.stasis.medianMilliseconds,
    stasisIqrMilliseconds: statistics.stasis.iqrMilliseconds,
    pairedBaselineOverStasis: statistics.pairedBaselineOverCandidate.decimal,
  };
}

function trackReceipt({
  baseline,
  hostBindingField,
  originalHost,
  freshHost,
  originalHostRuntime,
  freshHostRuntime,
  originalWorkflow,
  freshWorkflow,
  scientificIdentitySha256,
  originalStatistics,
  freshStatistics,
  pathDerivedRwaBuildIdentities,
  pathDerivedRwaBuildDifferencesExcluded,
}) {
  const originalDirection = direction(originalStatistics.pairedBaselineOverCandidate.exact);
  const freshDirection = direction(freshStatistics.pairedBaselineOverCandidate.exact);
  const receipt = {
    protocolStatus: "protocol_valid",
    scientificIdentityStatus: "matching",
    scientificIdentitySha256,
    baseline,
    ratio: `${baseline}_over_stasis`,
    observations: {
      original: observationReceipt(
        originalHost,
        hostBindingField,
        originalWorkflow,
        originalStatistics,
        originalDirection,
        originalHostRuntime,
      ),
      fresh: observationReceipt(
        freshHost,
        hostBindingField,
        freshWorkflow,
        freshStatistics,
        freshDirection,
        freshHostRuntime,
      ),
    },
    freshRatioRelationToOne: freshDirection === "tie"
      ? "equal"
      : freshDirection === "baseline_slower_than_stasis"
        ? "greater_than_one"
        : "less_than_one",
    outcome: originalDirection === freshDirection && originalDirection !== "tie"
      ? "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT"
      : "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_DISCORDANT",
  };
  if (pathDerivedRwaBuildDifferencesExcluded !== undefined) {
    receipt.pathDerivedRwaBuildDifferencesExcluded = pathDerivedRwaBuildDifferencesExcluded;
    receipt.pathDerivedRwaBuildIdentities = pathDerivedRwaBuildIdentities;
  }
  return receipt;
}

function observationReceipt(
  host,
  hostBindingField,
  workflow,
  statistics,
  ratioDirection,
  hostRuntime,
) {
  const receipt = {
    workflow: structuredClone(workflow),
    host: structuredClone(host),
    hostBinding: { field: hostBindingField, digest: host[hostBindingField] },
    statistics,
    ratioDirection,
  };
  if (hostRuntime !== undefined) receipt.hostRuntime = structuredClone(hostRuntime);
  return receipt;
}

function direction({ numerator, denominator }) {
  const left = BigInt(numerator);
  const right = BigInt(denominator);
  return left > right
    ? "baseline_slower_than_stasis"
    : left < right
      ? "baseline_faster_than_stasis"
      : "tie";
}

function exactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())
  ) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
