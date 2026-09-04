import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNavigationCausalReplication,
  buildNavigationCausalReplication,
  navigationCausalHarnessIdentity,
  navigationCausalWorkflowSourceIdentity,
} from "../src/performance/navigation-causal-replication.mjs";
import { createNavigationCausalHostOutcome } from "../src/performance/navigation-causal.mjs";
import { navigationCausalHostFixtureRaw } from "./fixtures/navigation-causal-host-fixture.mjs";

test("two independent host effects produce the bounded replicated-effect class", async () => {
  const inputs = await validInputs();
  const value = buildNavigationCausalReplication(inputs);

  assertNavigationCausalReplication(value, inputs);
  assert.equal(value.status, "VALID_REPLICATED_EFFECT");
  assert.equal(value.validMeasurement, true);
  assert.equal(value.replicatedEffectRuleMet, true);
  assert.equal(value.crossHostChecks.distinctBootInstanceDigests, true);
  assert.equal(value.crossHostChecks.exactFinalDocumentHtmlAcrossHosts, true);
  assert.equal(value.crossHostChecks.statisticsPooledAcrossHosts, false);
  assert.notStrictEqual(value.hosts[0].statistics, value.hosts[1].statistics);
  assert.equal(value.claimBoundary.generalizedSpeedClaimAuthorized, false);
  assert.equal(value.claimBoundary.implementationWorkAuthorized, false);
  assert.equal(value.claimBoundary.decisionState, "STAY_0_4_UNASSIGNED");
});

test("one host threshold miss means only that the two-host rule was not met", async () => {
  const hostARaw = await frozenRaw("host-a", { openDeltaNs: 70n });
  const hostBRaw = await frozenRaw("host-b", { openDeltaNs: 0n });
  const inputs = hostInputs(hostARaw, hostBRaw);
  const value = buildNavigationCausalReplication(inputs);

  assert.equal(value.status, "VALID_NO_REPLICATED_EFFECT");
  assert.equal(value.validMeasurement, true);
  assert.equal(value.noReplicatedEffectConclusion, true);
  assert.equal(value.claimBoundary.noEffectClaimAuthorized, false);
  assert.deepEqual(value.hosts.map(({ status }) => status), [
    "VALID_HOST_EFFECT",
    "VALID_HOST_NO_EFFECT",
  ]);
});

test("typed host invalidity is retained without manufacturing a measurement", async () => {
  const inputs = await validInputs();
  const raw = structuredClone(inputs.hostA.raw);
  const failed = raw.pairs[0].observations[0];
  failed.status = "incorrect";
  failed.timingEligible = false;
  failed.result.finalUrl = "http://stasis-compat.test/wrong-final";
  failed.oracle = { valid: false, reasons: ["final_url_mismatch"] };
  raw.pairs[0].observations = [failed];
  raw.pairs[0].equivalence = { evaluated: false, valid: false, differingFields: [] };
  raw.pairs[0].deltasNs = null;
  raw.pairs = [raw.pairs[0]];
  raw.statistics = null;
  raw.measurementEligible = false;
  raw.authority = {
    status: "invalid",
    valid: false,
    code: "CORRECTNESS_INVALID",
    firstInvalidOrdinal: 3,
    retriesOrReplacementAuthorized: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  };
  inputs.hostA = { raw, outcome: createNavigationCausalHostOutcome(raw) };

  const value = buildNavigationCausalReplication(inputs);
  assert.equal(value.status, "INVALID_HOST_MEASUREMENT");
  assert.equal(value.validMeasurement, false);
  assert.equal(value.workflowSuccess, false);
  assert.equal(value.retainedEvidencePublicationAuthorized, true);
  assert.deepEqual(value.invalidHostStatuses, [{
    hostLane: "host-a",
    status: "INVALID_CORRECTNESS",
    rawAuthorityCode: "CORRECTNESS_INVALID",
  }]);
  assert.equal(value.crossHostChecks.exactFinalDocumentHtmlAcrossHosts, null);
});

test("identical boot evidence is a typed cross-host independence failure", async () => {
  const inputs = await validInputs();
  inputs.hostB.raw.identity.host.bootInstanceDigest =
    inputs.hostA.raw.identity.host.bootInstanceDigest;
  inputs.hostB.raw.identity.host.hostClassDigest =
    inputs.hostA.raw.identity.host.hostClassDigest;
  inputs.hostB.raw.identity.stasis.hostClassDigest =
    inputs.hostA.raw.identity.stasis.hostClassDigest;
  inputs.hostB.outcome = createNavigationCausalHostOutcome(inputs.hostB.raw);

  const value = buildNavigationCausalReplication(inputs);
  assert.equal(value.status, "INVALID_CROSS_HOST_INDEPENDENCE");
  assert.equal(value.crossHostChecks.distinctBootInstanceDigests, false);
  assert.equal(value.crossHostChecks.distinctHostClassDigests, false);
  assert.equal(value.crossHostChecks.hostClassDigestsMayMatch, true);
});

test("a different but internally exact final DOM is cross-host correctness invalid", async () => {
  const inputs = await validInputs();
  const changed = structuredClone(inputs.hostB.raw);
  const replacement = changed.warmups[0].result.documentHtml.replace(
    "navigation leaf",
    "different navigation leaf",
  );
  for (const observation of [
    ...changed.warmups,
    ...changed.pairs.flatMap(({ observations }) => observations),
  ]) observation.result.documentHtml = replacement;
  for (const pair of changed.pairs) pair.equivalence.differingFields = [];
  const { createHash } = await import("node:crypto");
  changed.statistics.documentHtmlSha256 = createHash("sha256")
    .update(replacement, "utf8")
    .digest("hex");
  inputs.hostB = { raw: changed, outcome: createNavigationCausalHostOutcome(changed) };

  const value = buildNavigationCausalReplication(inputs);
  assert.equal(value.status, "INVALID_CROSS_HOST_CORRECTNESS");
  assert.equal(value.crossHostChecks.exactFinalDocumentHtmlAcrossHosts, false);
});

test("source, run, lane, and harness drift fail closed before classification", async () => {
  const mutations = [
    (inputs) => { inputs.hostB.raw.identity.provenance.runId = "33900000001"; },
    (inputs) => { inputs.hostA.raw.identity.provenance.workflowSourceSha = "a".repeat(40); },
    (inputs) => { inputs.hostA.raw.identity.provenance.harnessCheckoutRevision = "b".repeat(40); },
    (inputs) => { inputs.hostA.raw.identity.provenance.job = "navigation-causal-host-b"; },
  ];
  for (const mutate of mutations) {
    const inputs = await validInputs();
    mutate(inputs);
    assert.throws(() => buildNavigationCausalReplication(inputs));
  }
  assert.equal(navigationCausalHarnessIdentity.revision.length, 40);
  assert.equal(navigationCausalWorkflowSourceIdentity.revision.length, 40);
});

async function validInputs() {
  return hostInputs(
    await frozenRaw("host-a", { openDeltaNs: 70n }),
    await frozenRaw("host-b", { openDeltaNs: 70n }),
  );
}

function hostInputs(hostARaw, hostBRaw) {
  return {
    hostA: { raw: hostARaw, outcome: createNavigationCausalHostOutcome(hostARaw) },
    hostB: { raw: hostBRaw, outcome: createNavigationCausalHostOutcome(hostBRaw) },
  };
}

async function frozenRaw(hostLane, options) {
  const raw = structuredClone(await navigationCausalHostFixtureRaw(hostLane, options));
  raw.identity.provenance.workflowSourceSha = navigationCausalWorkflowSourceIdentity.revision;
  raw.identity.provenance.harnessCheckoutRevision = navigationCausalHarnessIdentity.revision;
  raw.identity.provenance.harnessCheckoutTree = navigationCausalHarnessIdentity.tree;
  return raw;
}
