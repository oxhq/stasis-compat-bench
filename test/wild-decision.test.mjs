import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { candidate, protocol, strata } from "../src/wild/config.mjs";
import {
  evaluateContextTreeDecision,
  loadDecisionEvidence,
} from "../src/wild/decision.mjs";

const deterministicFixtureIndexPath = fileURLToPath(
  new URL("./fixtures/deterministic-v03/artifact-index.json", import.meta.url),
);
const rwaFixtureIndexPath = fileURLToPath(
  new URL("./fixtures/rwa-hosted/artifact-index.json", import.meta.url),
);
const sharedEvidenceCleanups = [];
let sharedLoadedEvidence;

test.before(async () => {
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  const minimizers = await buildMinimizerFixture({
    after(cleanup) { sharedEvidenceCleanups.push(cleanup); },
  }, verified);
  const reviewRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-decision-reviews-"));
  sharedEvidenceCleanups.push(() => rm(reviewRoot, { recursive: true, force: true }));
  const crossTrackReviewPath = path.join(reviewRoot, "cross-track.json");
  const strategicReviewPath = path.join(reviewRoot, "strategic.json");
  await writeJson(crossTrackReviewPath, crossTrackValue(verified));
  await writeJson(strategicReviewPath, strategicValue(verified));
  sharedLoadedEvidence = await loadDecisionEvidence({
    crossTrackReviewPath,
    minimizerEvidencePath: minimizers.indexPath,
    deterministicIndexPath: deterministicFixtureIndexPath,
    rwaIndexPath: rwaFixtureIndexPath,
    strategicReviewPath,
  });
});

test.after(async () => {
  for (const cleanup of sharedEvidenceCleanups.reverse()) await cleanup();
});

test("synthetic wild facts and asserted minimizers can never produce GO_CONTEXT_TREE_0_4", () => {
  const verified = buildVerified({
    tree: 30,
    blockers: { worker: 10, storage: 5 },
    treeStrata: 3,
  });
  const decision = evaluateContextTreeDecision(verified, validExternalEvidence(verified));
  assert.equal(decision.verdict, "STAY_0_4_UNASSIGNED");
  assert.equal(decision.criteria.criterion1.passed, false);
  assert.equal(decision.criteria.criterion6.passed, false);
  assert.equal(
    decision.criteria.criterion6.reason,
    "runner_backed_tree_minimizer_transcript_validation_is_not_implemented",
  );
  assert.equal(decision.resultRoot.artifactIndexSha256, verified.artifactIndexSha256);
});

test("plain, cloned, mutated, and fake-root wild results lack authoritative postflight provenance", () => {
  const plain = buildVerified({ tree: 30, blockers: { worker: 10 }, treeStrata: 3 });
  const attacks = [
    plain,
    structuredClone(plain),
    { ...structuredClone(plain), artifactIndexSha256: "0".repeat(64) },
    { ...structuredClone(plain), startedAt: "2099-01-01T00:00:00.000Z" },
  ];
  for (const attack of attacks) {
    const decision = evaluateContextTreeDecision(attack, validExternalEvidence(plain));
    assert.equal(decision.criteria.criterion1.passed, false);
    assert.equal(decision.verdict, "STAY_0_4_UNASSIGNED");
  }
});

test("wild decision input rejects toJSON replay, accessors, prototypes, and nested proxies", () => {
  const verified = buildVerified({ tree: 30, blockers: { worker: 10 }, treeStrata: 3 });
  const clean = structuredClone(verified);

  const toJsonAttack = structuredClone(verified);
  Object.defineProperty(toJsonAttack, "toJSON", {
    value: () => clean,
    enumerable: false,
  });
  toJsonAttack.summary.organicBlockerCounts = { browsing_context_tree: 100 };
  assert.throws(
    () => evaluateContextTreeDecision(toJsonAttack, validExternalEvidence(verified)),
    /own data property/u,
  );

  const getterAttack = structuredClone(verified);
  let getterReads = 0;
  Object.defineProperty(getterAttack, "summary", {
    enumerable: true,
    get() {
      getterReads += 1;
      return getterReads % 2 === 1 ? clean.summary : { ...clean.summary, selectedCount: 0 };
    },
  });
  assert.throws(
    () => evaluateContextTreeDecision(getterAttack, validExternalEvidence(verified)),
    /own data property/u,
  );
  assert.equal(getterReads, 0);

  const inheritedToJson = structuredClone(verified);
  Object.setPrototypeOf(inheritedToJson, { toJSON() { return clean; } });
  assert.throws(
    () => evaluateContextTreeDecision(inheritedToJson, validExternalEvidence(verified)),
    /non-plain object prototype/u,
  );

  const proxyAttack = structuredClone(verified);
  proxyAttack.cases[0].classification = new Proxy(proxyAttack.cases[0].classification, {});
  assert.throws(
    () => evaluateContextTreeDecision(proxyAttack, validExternalEvidence(verified)),
    /contains a Proxy/u,
  );
});

test("criterion 2 rejects nine manifestations and only two strata at their exact boundaries", () => {
  const nine = buildVerified({ tree: 9, blockers: { worker: 1 }, treeStrata: 3 });
  const nineDecision = evaluateContextTreeDecision(nine, validExternalEvidence(nine));
  assert.equal(nineDecision.metrics.treeThreshold, 10);
  assert.equal(nineDecision.criteria.criterion2.passed, false);

  const twoStrata = buildVerified({ tree: 10, blockers: { worker: 1 }, treeStrata: 2 });
  const strataDecision = evaluateContextTreeDecision(twoStrata, validExternalEvidence(twoStrata));
  assert.equal(strataDecision.metrics.distinctTreeSiteCount, 10);
  assert.equal(strataDecision.metrics.treeStrata.length, 2);
  assert.equal(strataDecision.criteria.criterion2.passed, false);
});

test("criterion 3 is inclusive at 30 percent and rejects 29.9-ish percent", () => {
  const below = buildVerified({
    tree: 20,
    blockers: { worker: 16, storage: 16, parser: 15 },
    treeStrata: 3,
  });
  const belowDecision = evaluateContextTreeDecision(below, validExternalEvidence(below));
  assert.equal(belowDecision.metrics.diagnosedOrganicBlockerCount, 67);
  assert.ok(belowDecision.metrics.treeShare < 0.30);
  assert.equal(belowDecision.criteria.criterion3.passed, false);

  const exact = buildVerified({
    tree: 21,
    blockers: { worker: 17, storage: 16, parser: 16 },
    treeStrata: 3,
  });
  const exactDecision = evaluateContextTreeDecision(exact, validExternalEvidence(exact));
  assert.equal(exactDecision.metrics.treeShare, 0.30);
  assert.equal(exactDecision.criteria.criterion3.passed, true);
});

test("criterion 4 rejects ties and accepts exact 1.5x, exact ten points, and zero runner-up", () => {
  const tie = buildVerified({ tree: 20, blockers: { worker: 20 }, treeStrata: 3 });
  assert.equal(
    evaluateContextTreeDecision(tie, validExternalEvidence(tie)).criteria.criterion4.passed,
    false,
  );

  const ratio = buildVerified({ tree: 15, blockers: { worker: 10 }, treeStrata: 3 });
  const ratioDecision = evaluateContextTreeDecision(ratio, validExternalEvidence(ratio));
  assert.equal(ratioDecision.metrics.treeCount / ratioDecision.metrics.runnerUpCount, 1.5);
  assert.equal(ratioDecision.criteria.criterion4.passed, true);

  const share = buildVerified({
    tree: 22,
    blockers: { worker: 15, storage: 11, parser: 11, external_io: 11 },
    treeStrata: 3,
  });
  const shareDecision = evaluateContextTreeDecision(share, validExternalEvidence(share));
  assert.ok(shareDecision.metrics.treeCount / shareDecision.metrics.runnerUpCount < 1.5);
  assert.equal(shareDecision.metrics.leadShare, 0.10);
  assert.equal(shareDecision.criteria.criterion4.passed, true);

  const noRunnerUp = buildVerified({ tree: 10, blockers: {}, treeStrata: 3 });
  const noRunnerUpDecision = evaluateContextTreeDecision(
    noRunnerUp,
    validExternalEvidence(noRunnerUp),
  );
  assert.equal(noRunnerUpDecision.metrics.runnerUpCount, 0);
  assert.equal(noRunnerUpDecision.criteria.criterion4.passed, true);
});

test("criterion 1 rejects a tree label without exact typed/source-diagnosed provenance", () => {
  const verified = buildVerified({ tree: 10, blockers: {}, treeStrata: 3 });
  verified.cases[0].classification.reason = "navigation_authority_changed";
  verified.cases[0].classification.diagnosisConfidence = "unknown";
  verified.cases[0].classification.firstTerminal = {
    phase: "stasis_operation",
    code: "navigation_authority_changed",
    typedSurface: "navigation_unknown",
  };
  const decision = evaluateContextTreeDecision(verified, validExternalEvidence(verified));
  assert.equal(decision.criteria.criterion1.passed, false);
  assert.equal(decision.verdict, "STAY_0_4_UNASSIGNED");
});

test("external criteria default false and only runner-backed gates may pass", () => {
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  const missing = evaluateContextTreeDecision(verified);
  for (const key of ["criterion5", "criterion6", "criterion7", "criterion8"]) {
    assert.equal(missing.criteria[key].passed, false, key);
  }
  assert.equal(missing.verdict, "STAY_0_4_UNASSIGNED");

  const loaded = evaluateContextTreeDecision(verified, validExternalEvidence(verified));
  assert.equal(loaded.criteria.criterion5.passed, true);
  assert.equal(loaded.criteria.criterion6.passed, false);
  assert.equal(loaded.criteria.criterion7.passed, true);
  assert.equal(loaded.criteria.criterion8.passed, true);
  assert.equal(loaded.verdict, "STAY_0_4_UNASSIGNED");

  for (const key of ["criterion5", "criterion7", "criterion8"]) {
    const evidence = validExternalEvidence(verified);
    evidence[key] = null;
    const decision = evaluateContextTreeDecision(verified, evidence);
    assert.equal(decision.criteria[key].passed, false, key);
    assert.equal(decision.verdict, "STAY_0_4_UNASSIGNED", key);
  }
});

test("exported evaluator rejects caller-forged or cloned external evidence", () => {
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  for (const key of ["criterion5", "criterion6", "criterion7", "criterion8"]) {
    const evidence = validExternalEvidence(verified);
    evidence[key] = structuredClone(evidence[key]);
    const decision = evaluateContextTreeDecision(verified, evidence);
    assert.equal(decision.criteria[key].passed, false, key);
    assert.equal(decision.verdict, "STAY_0_4_UNASSIGNED", key);
  }

  const forgedCrossTrack = {
    ...wrapped(crossTrackValue(verified)),
    deterministicArtifactIndexSha256:
      "3eeb21118b93889cd75495e85d177fbb1395c6fb9f0988e32a32ad33e74287d2",
    rwaArtifactIndexSha256:
      "470233284fe59e80b33dbc156dc1cefaa6858f6e4ad13cd8426a69edab2b4a4d",
    trackReferencesVerified: true,
  };
  const evidence = validExternalEvidence(verified);
  evidence.criterion5 = forgedCrossTrack;
  assert.equal(evaluateContextTreeDecision(verified, evidence).criteria.criterion5.passed, false);
});

test("deterministic evidence prevents post-load mutation of the exact 20/20 identity", async () => {
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  const loaded = await loadDecisionEvidence({ deterministicIndexPath: deterministicFixtureIndexPath });
  const evidence = validExternalEvidence(verified);
  evidence.criterion7 = loaded.criterion7;
  assert.throws(() => {
    evidence.criterion7.value.result.counts.PASS_EQUIVALENT = 19;
  }, TypeError);
  assert.equal(evaluateContextTreeDecision(verified, evidence).criteria.criterion7.passed, true);
});

test("loaded C5, C7, and C8 evidence is immutable and clone attacks stay untrusted", () => {
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  const mutations = {
    criterion5(wrapper) { wrapper.value.decision = "forged"; },
    criterion7(wrapper) { wrapper.value.result.counts.PASS_EQUIVALENT = 19; },
    criterion8(wrapper) { wrapper.value.winningBoundary = "worker"; },
  };
  for (const key of ["criterion5", "criterion7", "criterion8"]) {
    const wrapper = sharedLoadedEvidence[key];
    assertDeepFrozen(wrapper);
    assert.throws(() => mutations[key](wrapper), TypeError, `${key} nested mutation`);
    assert.throws(() => {
      Object.defineProperty(wrapper, "toJSON", { value: () => ({}) });
    }, TypeError, `${key} toJSON definition`);
    assert.throws(() => {
      Object.defineProperty(wrapper.value, "candidate", { get() { return evidenceCandidate(); } });
    }, TypeError, `${key} accessor definition`);
    assert.throws(() => {
      Object.setPrototypeOf(wrapper.value, { toJSON() { return {}; } });
    }, TypeError, `${key} prototype mutation`);

    const clone = structuredClone(wrapper);
    const clean = structuredClone(clone);
    Object.defineProperty(clone, "toJSON", { value: () => clean, enumerable: false });
    mutations[key](clone);
    const evidence = validExternalEvidence(verified);
    evidence[key] = clone;
    const decision = evaluateContextTreeDecision(verified, evidence);
    assert.equal(decision.criteria[key].passed, false, key);
    assert.equal(decision.verdict, "STAY_0_4_UNASSIGNED", key);
  }
});

test("evidence bundle rejects alternating getters and proxies without rereading criteria", () => {
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  let reads = 0;
  const alternating = { ...validExternalEvidence(verified) };
  Object.defineProperty(alternating, "criterion5", {
    enumerable: true,
    get() {
      reads += 1;
      return reads % 2 === 1 ? sharedLoadedEvidence.criterion5 : null;
    },
  });
  assert.throws(
    () => evaluateContextTreeDecision(verified, alternating),
    /criterion5 is not one enumerable own data property/u,
  );
  assert.equal(reads, 0);
  assert.throws(
    () => evaluateContextTreeDecision(verified, new Proxy(validExternalEvidence(verified), {})),
    /plain own-data object/u,
  );
});

test("evidence loader rejects a fabricated deterministic index even when all claimed bytes match", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-decision-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deterministic = deterministicValue();
  for (const item of deterministic.files) {
    const target = path.join(root, ...item.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    const bytes = Buffer.from(`evidence:${item.path}\n`, "utf8");
    await writeFile(target, bytes);
    item.bytes = bytes.length;
    item.sha256 = digest(bytes);
  }
  const indexPath = path.join(root, "artifact-index.json");
  await writeJson(indexPath, deterministic);
  const loaded = await loadDecisionEvidence({ deterministicIndexPath: indexPath });
  assert.equal(loaded.criterion7.referencesVerified, false);
  assert.equal(loaded.criterion7.sha256, digest(Buffer.from(`${JSON.stringify(deterministic, null, 2)}\n`)));
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  const evidence = validExternalEvidence(verified);
  evidence.criterion7 = loaded.criterion7;
  assert.equal(evaluateContextTreeDecision(verified, evidence).criteria.criterion7.passed, false);
  assert.equal(loaded.criterion5, null);

  await assert.rejects(
    () => loadDecisionEvidence({ crossTrackReviewPath: "true" }),
    /explicit absolute file paths/u,
  );
});

test("evidence loader accepts the immutable frozen 20/20 deterministic artifact", async () => {
  const indexPath = fileURLToPath(
    new URL("./fixtures/deterministic-v03/artifact-index.json", import.meta.url),
  );
  const loaded = await loadDecisionEvidence({ deterministicIndexPath: indexPath });
  assert.equal(
    loaded.criterion7.sha256,
    "3eeb21118b93889cd75495e85d177fbb1395c6fb9f0988e32a32ad33e74287d2",
  );
  assert.equal(loaded.criterion7.referencesVerified, true);
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  const evidence = validExternalEvidence(verified);
  evidence.criterion7 = loaded.criterion7;
  assert.equal(evaluateContextTreeDecision(verified, evidence).criteria.criterion7.passed, true);
});

test("hand-authored source and asserted result bytes cannot satisfy criterion 6", async (t) => {
  const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
  const fixture = await buildMinimizerFixture(t, verified);
  const loaded = await loadDecisionEvidence({ minimizerEvidencePath: fixture.indexPath });
  assert.equal(loaded.criterion6.referencesVerified, true);
  const evidence = validExternalEvidence(verified);
  evidence.criterion6 = loaded.criterion6;
  const decision = evaluateContextTreeDecision(verified, evidence);
  assert.equal(decision.criteria.criterion6.passed, false);
  assert.equal(
    decision.criteria.criterion6.reason,
    "runner_backed_tree_minimizer_transcript_validation_is_not_implemented",
  );
  assert.equal(decision.verdict, "STAY_0_4_UNASSIGNED");
});

test("minimizer loader rejects nonexistent refs, arbitrary bytes, and extra inventory", async (t) => {
  await t.test("nonexistent", async (subtest) => {
    const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
    const fixture = await buildMinimizerFixture(subtest, verified);
    await unlink(path.join(fixture.root, "reproducers", "2.mjs"));
    const loaded = await loadDecisionEvidence({ minimizerEvidencePath: fixture.indexPath });
    assert.equal(loaded.criterion6.referencesVerified, false);
  });
  await t.test("arbitrary result bytes", async (subtest) => {
    const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
    const fixture = await buildMinimizerFixture(subtest, verified);
    const target = path.join(fixture.root, "cases", "1-result.json");
    const bytes = Buffer.from("arbitrary bytes\n", "utf8");
    await writeFile(target, bytes);
    await fixture.updateReference(0, "artifact", bytes);
    const loaded = await loadDecisionEvidence({ minimizerEvidencePath: fixture.indexPath });
    assert.equal(loaded.criterion6.referencesVerified, false);
  });
  await t.test("extra file", async (subtest) => {
    const verified = buildVerified({ tree: 20, blockers: { worker: 5 }, treeStrata: 3 });
    const fixture = await buildMinimizerFixture(subtest, verified);
    await writeFile(path.join(fixture.root, "extra.txt"), "extra\n", "utf8");
    const loaded = await loadDecisionEvidence({ minimizerEvidencePath: fixture.indexPath });
    assert.equal(loaded.criterion6.referencesVerified, false);
  });
});

async function buildMinimizerFixture(t, verified) {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-tree-minimizers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const indexPath = path.join(root, "artifact-index.json");
  const candidateIdentity = evidenceCandidate();
  const definitions = [
    {
      kind: "child_context_creation_navigation_removal",
      artifactPath: "cases/1-result.json",
      sourcePath: "reproducers/1.mjs",
      source: "export const treeCase = 'child-create-navigate-remove';\n",
    },
    {
      kind: "nested_context",
      artifactPath: "cases/2-result.json",
      sourcePath: "reproducers/2.mjs",
      source: "export const treeCase = 'nested-context';\n",
    },
  ];
  const cases = [];
  for (const definition of definitions) {
    const sourceBytes = Buffer.from(definition.source, "utf8");
    await mkdir(path.dirname(path.join(root, definition.sourcePath)), { recursive: true });
    await writeFile(path.join(root, definition.sourcePath), sourceBytes);
    const artifact = minimizerArtifact(
      definition.kind,
      digest(sourceBytes),
      verified.artifactIndexSha256,
      candidateIdentity,
    );
    await writeJson(path.join(root, definition.artifactPath), artifact);
    const artifactBytes = await readFile(path.join(root, definition.artifactPath));
    cases.push({
      kind: definition.kind,
      artifact: {
        path: definition.artifactPath,
        bytes: artifactBytes.length,
        sha256: digest(artifactBytes),
      },
      source: {
        path: definition.sourcePath,
        bytes: sourceBytes.length,
        sha256: digest(sourceBytes),
      },
    });
  }
  await writeJson(indexPath, {
    schema: "stasis-0.4-tree-minimizers-v1",
    protocol,
    wildArtifactIndexSha256: verified.artifactIndexSha256,
    candidate: candidateIdentity,
    cases,
  });

  async function updateReference(caseIndex, field, bytes) {
    const index = JSON.parse(await readFile(indexPath, "utf8"));
    index.cases[caseIndex][field].bytes = bytes.length;
    index.cases[caseIndex][field].sha256 = digest(bytes);
    await writeJson(indexPath, index);
  }

  return { root, indexPath, updateReference };
}

function buildVerified({ tree, blockers, treeStrata }) {
  const cases = [];
  let slot = 1;
  const treeStratumIds = strata.slice(0, treeStrata).map((item) => item.id);
  for (let index = 0; index < tree; index += 1) {
    cases.push(decisionCase(slot, treeClassification(), treeStratumIds[index % treeStratumIds.length]));
    slot += 1;
  }
  for (const [family, count] of Object.entries(blockers)) {
    for (let index = 0; index < count; index += 1) {
      cases.push(decisionCase(slot, blockerClassification(family), strata[index % strata.length].id));
      slot += 1;
    }
  }
  while (cases.length < 100) {
    cases.push(decisionCase(slot, passClassification(), strata[(slot - 1) % strata.length].id));
    slot += 1;
  }
  if (cases.length > 100) throw new Error("Decision test fixture exceeds the frozen wild denominator");
  const blockerCounts = { browsing_context_tree: tree, ...blockers };
  if (tree === 0) delete blockerCounts.browsing_context_tree;
  return {
    schema: "stasis-wild-verified-result-v1",
    protocol,
    artifactIndexSha256: "1".repeat(64),
    identity: {
      stasisRevision: candidate.revision,
      stasisVersion: candidate.version,
      stasisProfile: candidate.profile,
      stasisExecutableSha256: candidate.executableSha256,
      stasisSdkArchiveSha256: candidate.sdkSha256,
    },
    summary: {
      selectedCount: 100,
      validPairedDenominator: 100,
      diagnosedOrganicBlockerCount: tree + Object.values(blockers).reduce((a, b) => a + b, 0),
      organicBlockerCounts: blockerCounts,
    },
    cases,
  };
}

function decisionCase(slot, classification, stratumId) {
  return {
    entry: {
      slot,
      stratumId,
      requestedUrl: `https://decision-site-${slot}.com/`,
    },
    classification,
  };
}

function treeClassification() {
  return {
    primary: "PROFILE_UNSUPPORTED",
    reason: "cross_event_loop_document",
    diagnosisConfidence: "source_diagnosed",
    eligibleForOrganicBlockerCensus: true,
    blockerFamily: "browsing_context_tree",
    firstTerminal: {
      phase: "settlement",
      code: "unsupported_source",
      typedSurface: "other",
      unsupportedWork: { kind: "other", reason: "cross_event_loop_document" },
    },
  };
}

function blockerClassification(family) {
  return {
    primary: "PROFILE_UNSUPPORTED",
    reason: family,
    diagnosisConfidence: "source_diagnosed",
    eligibleForOrganicBlockerCensus: true,
    blockerFamily: family,
    firstTerminal: { phase: "settlement", code: "unsupported_source", typedSurface: family },
  };
}

function passClassification() {
  return {
    primary: "PASS_EQUIVALENT",
    reason: "equivalent",
    diagnosisConfidence: "typed",
    eligibleForOrganicBlockerCensus: false,
    blockerFamily: null,
    firstTerminal: { phase: "extraction", code: "equivalent", typedSurface: "extraction_contract" },
  };
}

function validExternalEvidence(verified) {
  if (verified.artifactIndexSha256 !== "1".repeat(64) || sharedLoadedEvidence === undefined) {
    throw new Error("Decision test evidence is not bound to the shared verified wild root");
  }
  return { ...sharedLoadedEvidence };
}

function crossTrackValue(verified) {
  const candidateIdentity = evidenceCandidate();
  return {
    schema: "stasis-0.4-cross-track-review-v1",
    protocol,
    wildArtifactIndexSha256: verified.artifactIndexSha256,
    candidate: candidateIdentity,
    decision: "no_conflicting_material_leader",
    tracks: [
      {
        track: "deterministic",
        artifactIndexSha256:
          "3eeb21118b93889cd75495e85d177fbb1395c6fb9f0988e32a32ad33e74287d2",
        assessment: "regression_only_no_prevalence_claim",
      },
      {
        track: "rwa",
        artifactIndexSha256:
          "470233284fe59e80b33dbc156dc1cefaa6858f6e4ad13cd8426a69edab2b4a4d",
        assessment: "no_material_conflicting_leader",
      },
    ],
  };
}

function strategicValue(verified) {
  return {
      schema: "stasis-0.4-strategic-review-v1",
      protocol,
      wildArtifactIndexSha256: verified.artifactIndexSha256,
      candidate: evidenceCandidate(),
      winningBoundary: "browsing_context_tree",
      decision: "tree_strategically_eligible_for_0_4",
  };
}

function deterministicValue() {
  return {
    schema: "stasis-post-0.3-deterministic-artifact-index-v1",
    protocol,
    harnessCommit: "56175c97aad270063494c4c6bcf606a131d7dc48",
    candidate: {
      sourceRevision: candidate.revision,
      executableSha256: candidate.executableSha256,
      sdkArchiveSha256: candidate.sdkSha256,
      profile: candidate.profile,
    },
    result: {
      baselineValid: true,
      candidateValid: true,
      primaryDenominator: 20,
      counts: { PASS_EQUIVALENT: 20 },
      scheduledUrlJaccard: 1,
      designedControlsExcludedFromPrevalence: true,
    },
    files: [
      {
        path: "stasis-post-0.3-census-v1/deterministic/compatibility.json",
        bytes: 12404,
        sha256: "26d4204d71e8b7f651e0930015f20cc7f6c8f1953c27a1768eacd0801b691206",
      },
      {
        path: "stasis-post-0.3-census-v1/deterministic/playwright-raw.json",
        bytes: 9381,
        sha256: "1622627885aa3153ad1d8e4cd637eeed19aa5e722edc7d80aacbc72ab550fe38",
      },
      {
        path: "stasis-post-0.3-census-v1/deterministic/report.md",
        bytes: 1764,
        sha256: "769d98eb5139165f318bd0b4bb8259054740df18ae31becaa73a0f2cf866c9c3",
      },
      {
        path: "stasis-post-0.3-census-v1/deterministic/stasis-raw.json",
        bytes: 9480,
        sha256: "43ea58350709e228d04a2492e90927bce198ec9bc7987fb1eb7b958bb0906d54",
      },
    ],
  };
}

function evidenceCandidate() {
  return {
    revision: candidate.revision,
    version: candidate.version,
    profile: candidate.profile,
    executableSha256: candidate.executableSha256,
    sdkArchiveSha256: candidate.sdkSha256,
  };
}

function minimizerArtifact(kind, sourceSha256, wildArtifactIndexSha256, candidateIdentity) {
  return {
    schema: "stasis-0.4-tree-minimizer-case-v1",
    protocol,
    wildArtifactIndexSha256,
    candidate: candidateIdentity,
    kind,
    reproducerSourceSha256: sourceSha256,
    result: {
      outcome: "confirmed_tree_ownership_boundary",
      primary: "PROFILE_UNSUPPORTED",
      blockerFamily: "browsing_context_tree",
      diagnosisConfidence: "source_diagnosed",
      eligibleForOrganicBlockerCensus: true,
      candidateExecutableSha256: candidate.executableSha256,
      profile: candidate.profile,
      firstTerminal: {
        phase: "settlement",
        code: "unsupported_source",
        reason: "cross_event_loop_document",
        typedSurface: "same_event_loop_iframe",
      },
    },
  };
}

function wrapped(value) {
  return { sha256: digest(Buffer.from(`${JSON.stringify(value, null, 2)}\n`)), value };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}
