import { isDeepStrictEqual } from "node:util";

import {
  assertNavigationCausalHostOutcome,
  assertNavigationCausalHostRaw,
  navigationCausalProtocol,
  navigationCausalTrack,
} from "./navigation-causal.mjs";

export const navigationCausalReplicationSchema =
  "stasis-v0.3.3-performance-navigation-causal-replication-v1";

export const navigationCausalHarnessIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  revision: "11948d347204e3392fb960ed2966fcc63d769271",
  parentRevision: "6b51796f646133dd74feb727a3edeb3ae1a8a443",
  grandparentRevision: "de1c9a000cba734c549f2fcee182e92c0565dff5",
  tree: "c8ba9cf9ddd6bcc85abf10c017349882544e0b1b",
  topology: "two_commit_h8a_stack_from_h7",
});

export const navigationCausalWorkflowSourceIdentity = deepFreeze({
  repository: "oxhq/stasis",
  branch: "codex/stasis-v033-navigation-causal-source",
  ref: "refs/heads/codex/stasis-v033-navigation-causal-source",
  revision: "cb5bba41cda038fce82d2a5da6e4f853f1e97440",
  parentRevision: "b4c847b6543e34677630c311b20d9e3ff64d0925",
  tree: "9883ccb6fd3ddf72c3e4745e9fa3b1d9cc1d95da",
  workflow: {
    path: ".github/workflows/stasis-v0.3.3-performance-navigation-causal.yml",
    blob: "f24f67ac0d2c8b7b7cbd3a1e2bfc8a304c1c8038",
    bytes: 40_758,
    sha256: "4ed396bba197d83b5033f506667df744e5d2a8b6c0e7f81081f3b850853ce472",
    lineCount: 829,
    bootSalt: {
      domain: "stasis-v0.3.3-navigation-causal-boot-salt-v1",
      inputs: ["GITHUB_RUN_ID", "GITHUB_SHA"],
      identicalAcrossJobs: true,
    },
    name: "Stasis v0.3.3 navigation causal experiment",
    jobs: [
      {
        id: "navigation-causal-host-a",
        name: "Native Ubuntu 22.04 navigation causal host A",
        artifact: "stasis-v0.3.3-navigation-causal-host-a-attempt-1",
      },
      {
        id: "navigation-causal-host-b",
        name: "Native Ubuntu 22.04 navigation causal host B",
        artifact: "stasis-v0.3.3-navigation-causal-host-b-attempt-1",
      },
    ],
  },
});

export const navigationCausalReplicationStatuses = Object.freeze([
  "VALID_REPLICATED_EFFECT",
  "VALID_NO_REPLICATED_EFFECT",
  "INVALID_HOST_MEASUREMENT",
  "INVALID_CROSS_HOST_INDEPENDENCE",
  "INVALID_CROSS_HOST_CORRECTNESS",
]);

const validHostStatuses = new Set(["VALID_HOST_EFFECT", "VALID_HOST_NO_EFFECT"]);

export function buildNavigationCausalReplication({ hostA, hostB }) {
  const hosts = [
    retainHostInput(hostA, "host-a"),
    retainHostInput(hostB, "host-b"),
  ];
  assertSharedHostedIdentity(hosts);

  const [left, right] = hosts;
  const invalidHostStatuses = hosts
    .filter(({ outcome }) => !validHostStatuses.has(outcome.status))
    .map(({ lane, outcome }) => ({
      hostLane: lane,
      status: outcome.status,
      rawAuthorityCode: outcome.rawAuthorityCode,
    }));
  const distinctBootInstanceDigests =
    left.raw.identity.host.bootInstanceDigest !== right.raw.identity.host.bootInstanceDigest;
  const distinctHostClassDigests =
    left.raw.identity.host.hostClassDigest !== right.raw.identity.host.hostClassDigest;
  const hostsMeasurementValid = invalidHostStatuses.length === 0;
  const leftDocument = hostsMeasurementValid ? finalDocumentHtml(left.raw) : null;
  const rightDocument = hostsMeasurementValid ? finalDocumentHtml(right.raw) : null;
  const exactFinalDocumentHtmlAcrossHosts = hostsMeasurementValid
    ? leftDocument === rightDocument
    : null;

  let status;
  if (!hostsMeasurementValid) {
    status = "INVALID_HOST_MEASUREMENT";
  } else if (!distinctBootInstanceDigests) {
    status = "INVALID_CROSS_HOST_INDEPENDENCE";
  } else if (!exactFinalDocumentHtmlAcrossHosts) {
    status = "INVALID_CROSS_HOST_CORRECTNESS";
  } else if (hosts.every(({ outcome }) => outcome.status === "VALID_HOST_EFFECT")) {
    status = "VALID_REPLICATED_EFFECT";
  } else {
    status = "VALID_NO_REPLICATED_EFFECT";
  }

  const validMeasurement = status.startsWith("VALID_");
  const value = {
    schema: navigationCausalReplicationSchema,
    protocol: navigationCausalProtocol,
    track: navigationCausalTrack,
    status,
    validMeasurement,
    retainedEvidencePublicationAuthorized: true,
    workflowSuccess: validMeasurement,
    replicatedEffectRuleMet: status === "VALID_REPLICATED_EFFECT",
    noReplicatedEffectConclusion: status === "VALID_NO_REPLICATED_EFFECT",
    invalidHostStatuses,
    hostedIdentity: {
      workflowRunId: left.raw.identity.provenance.runId,
      workflowRunAttempt: "1",
      workflowSourceRevision: navigationCausalWorkflowSourceIdentity.revision,
      harnessRevision: navigationCausalHarnessIdentity.revision,
    },
    crossHostChecks: {
      sameWorkflowRun: true,
      distinctJobKeys: true,
      distinctBootInstanceDigests,
      distinctHostClassDigests,
      hostClassDigestsMayMatch: true,
      exactFinalDocumentHtmlAcrossHosts,
      statisticsPooledAcrossHosts: false,
    },
    hosts: hosts.map(({ lane, raw, outcome }) => ({
      hostLane: lane,
      job: raw.identity.provenance.job,
      bootInstanceDigest: raw.identity.host.bootInstanceDigest,
      hostClassDigest: raw.identity.host.hostClassDigest,
      status: outcome.status,
      rawAuthorityCode: outcome.rawAuthorityCode,
      documentHtmlSha256: raw.statistics?.documentHtmlSha256 ?? null,
      statistics: structuredClone(raw.statistics),
    })),
    claimBoundary: {
      matchedNavigationCausalEffectAuthorized: status === "VALID_REPLICATED_EFFECT",
      noEffectClaimAuthorized: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      comparisonCorpusChanged: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
  };
  return deepFreeze(value);
}

export function assertNavigationCausalReplication(value, inputs) {
  const expected = buildNavigationCausalReplication(inputs);
  if (!isDeepStrictEqual(value, expected)) {
    throw new TypeError("Navigation causal replication outcome does not replay");
  }
  return value;
}

function retainHostInput(value, lane) {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["raw", "outcome"])) {
    throw new TypeError(`Navigation causal ${lane} input is invalid`);
  }
  const raw = structuredClone(value.raw);
  const outcome = structuredClone(value.outcome);
  assertNavigationCausalHostRaw(raw);
  assertNavigationCausalHostOutcome(outcome, raw);
  if (raw.identity.hostLane !== lane || outcome.hostLane !== lane) {
    throw new TypeError(`Navigation causal ${lane} input is assigned to the wrong lane`);
  }
  assertFrozenHostIdentity(raw, lane);
  return { lane, raw, outcome };
}

function assertFrozenHostIdentity(raw, lane) {
  const provenance = raw.identity.provenance;
  if (
    provenance.workflowSourceSha !== navigationCausalWorkflowSourceIdentity.revision ||
    provenance.workflowSourceRef !== navigationCausalWorkflowSourceIdentity.ref ||
    provenance.harnessCheckoutRevision !== navigationCausalHarnessIdentity.revision ||
    provenance.harnessCheckoutTree !== navigationCausalHarnessIdentity.tree ||
    provenance.job !== `navigation-causal-${lane}` ||
    provenance.runAttempt !== "1"
  ) {
    throw new TypeError(`Navigation causal ${lane} input is outside the frozen source chain`);
  }
}

function assertSharedHostedIdentity(hosts) {
  const [left, right] = hosts.map(({ raw }) => raw.identity.provenance);
  if (
    left.runId !== right.runId ||
    left.runAttempt !== right.runAttempt ||
    left.workflowSourceSha !== right.workflowSourceSha ||
    left.workflowSourceRef !== right.workflowSourceRef ||
    left.harnessCheckoutRevision !== right.harnessCheckoutRevision ||
    left.harnessCheckoutTree !== right.harnessCheckoutTree ||
    left.job === right.job
  ) {
    throw new TypeError("Navigation causal hosts are not two jobs from one frozen workflow run");
  }
}

function finalDocumentHtml(raw) {
  const observations = [
    ...raw.warmups,
    ...raw.pairs.flatMap(({ observations: entries }) => entries),
  ];
  if (observations.length !== 22) {
    throw new TypeError("Valid navigation causal host must retain exactly 22 observations");
  }
  const documentHtml = observations[0]?.result?.documentHtml;
  if (typeof documentHtml !== "string" || documentHtml.length === 0 ||
    observations.some(({ result }) => result?.documentHtml !== documentHtml)) {
    throw new TypeError("Valid navigation causal host does not retain one exact final DOM");
  }
  return documentHtml;
}

function hasExactKeys(value, expected) {
  return isPlainRecord(value) && isDeepStrictEqual(
    Reflect.ownKeys(value).sort(),
    [...expected].sort(),
  );
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
