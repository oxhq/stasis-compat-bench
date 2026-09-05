import { isDeepStrictEqual } from "node:util";

import {
  assertNavigationCausalHostOutcome,
  assertNavigationCausalHostRaw,
  navigationCausalProtocol,
  navigationCausalTrack,
} from "./navigation-causal.mjs";

export const navigationCausalReplicationSchema =
  "stasis-v0.3.3-performance-navigation-causal-replication-v1";

export const navigationCausalHistoricalH8aIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  revision: "11948d347204e3392fb960ed2966fcc63d769271",
  parentRevision: "6b51796f646133dd74feb727a3edeb3ae1a8a443",
  grandparentRevision: "de1c9a000cba734c549f2fcee182e92c0565dff5",
  tree: "c8ba9cf9ddd6bcc85abf10c017349882544e0b1b",
  topology: "two_commit_h8a_stack_from_h7",
});

export const navigationCausalHarnessIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  revision: "84efe2bbc7e41a7b01e4feae12db7a7e7344c539",
  parentRevision: navigationCausalHistoricalH8aIdentity.revision,
  tree: "4a2b5ec6364b2d24f95166883db23e03293d2e43",
  topology: "one_commit_h9a_execution_successor_from_h8a",
  files: {
    runner: {
      path: "src/performance/navigation-causal.mjs",
      blob: "623323b78991fb02c1980f7bed66242b2e91194f",
      bytes: 40_512,
      sha256: "1ea7ff361729e5ea200c77858e8b715a67f5fdec6946973626bee47ed6317646",
    },
    cli: {
      path: "src/performance/run-navigation-causal.mjs",
      blob: "c3c79a85cb7d2ae4cdf157a83478ad96e5844de7",
      bytes: 7_703,
      sha256: "38140a5785fd44e6aef8763776e624b97ad6f96922fbb507c9d1e0d35556b359",
    },
    environmentRegression: {
      path: "test/performance-navigation-causal-environment-v3.test.mjs",
      blob: "82c9dce0b7ff1158a8058867ba1e97ab31378f44",
      bytes: 4_935,
      sha256: "824db18fc3ce3ca9c8874397bb8c4bb32b50c985f986c912eba2a9f46c1f1fe8",
    },
    hostFixture: {
      path: "test/fixtures/navigation-causal-host-fixture.mjs",
      blob: "7320b82df3dd063d747765e52e03b5325f95ffe1",
      bytes: 5_252,
      sha256: "3a4508ef3a2c2f5fcef409da78b3e9527497ad61f024fd5c9c0652dd78dd18e3",
    },
    runnerTest: {
      path: "test/performance-navigation-causal.test.mjs",
      blob: "becf3135160fb5755d21bc61586168576096fbfb",
      bytes: 15_333,
      sha256: "2fa10b305abc0ba43d47eeae61bbb11e212f52304e0054e4becfabde03360493",
    },
    cliTest: {
      path: "test/performance-run-navigation-causal.test.mjs",
      blob: "cb9da78c0778160a33795a583701ea5ba44a92bc",
      bytes: 7_442,
      sha256: "e5cb9f0a9cb032ac0f0359d0d3318d7123cdf32af1e446b4919d51d4bd2fc6d0",
    },
  },
});

export const navigationCausalWorkflowSourceIdentity = deepFreeze({
  repository: "oxhq/stasis",
  branch: "codex/stasis-v033-navigation-causal-source-v3",
  ref: "refs/heads/codex/stasis-v033-navigation-causal-source-v3",
  revision: "6a785f438ecffaf3433ec907059f4df4fd4eedfa",
  parentRevision: "cb5bba41cda038fce82d2a5da6e4f853f1e97440",
  tree: "5868bafc2843cb16e2f33c4d739dd484705f4fd4",
  workflow: {
    path: ".github/workflows/stasis-v0.3.3-performance-navigation-causal-v3.yml",
    blob: "9c01b6ad4b02d1d21426d31c85c451c685b80a1a",
    bytes: 40_950,
    sha256: "d46cfeb840d139b2cbd10c834e114fc0df7a53fd677e026cfe0145549307bdd0",
    lineCount: 831,
    bootSalt: {
      domain: "stasis-v0.3.3-navigation-causal-boot-salt-v1",
      inputs: ["GITHUB_RUN_ID", "GITHUB_SHA"],
      identicalAcrossJobs: true,
    },
    name: "Stasis v0.3.3 navigation causal experiment V3",
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
