import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { copyFile, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { serializeWildArtifact } from "../src/wild/artifact-privacy.mjs";
import { aggregateWildClassifications, classifyWildCase } from "../src/wild/classification.mjs";
import {
  candidate,
  expectedVersions,
  networkPolicyIdentity,
  networkPolicySmokePath,
  protocol,
  repairedRerunIdentity,
  runtimePins,
  strata,
} from "../src/wild/config.mjs";
import {
  normalizeLinkIdentitySet,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "../src/wild/normalize.mjs";
import { assertSmokePrecedesPairedRun } from "../src/wild/network-policy-smoke.mjs";
import {
  assertVerifiedWildResultProvenance,
  verifyQuiescentWildResult,
  verifyWildResult,
  wildPairedRules,
} from "../src/wild/result-verifier.mjs";
import { assertRepairedRerunIdentity } from "../src/wild/rerun-identity.mjs";
import { wildArtifactRootPathSha256 } from "../src/wild/run-generation.mjs";

const smokeStartedAt = "2026-08-26T00:50:00.000Z";
const smokeCompletedAt = "2026-08-26T00:59:00.000Z";
const startedAt = "2026-08-26T01:00:00.000Z";
const completedAt = "2026-08-26T01:10:00.000Z";
const harnessCommit = "a".repeat(40);
const preregistrationCommit = "b".repeat(40);
const corpusSha256 = "c".repeat(64);
const ledgerSha256 = "d".repeat(64);

test("wild postflight verifies every canonical indexed byte and rebuilds classifications", async (t) => {
  const fixture = await buildFixture(t);
  const result = await fixture.verify();
  assert.equal(result.schema, "stasis-wild-verified-result-v1");
  assert.equal(result.artifactIndexSha256, await hashFile(fixture.indexPath));
  assert.equal(result.summary.selectedCount, 100);
  assert.equal(result.summary.sdkGapCounts.current_url_observability, 1);
  assert.equal(result.summary.baselineExcluded, 99);
  assertDeepFrozen(result);
  assert.throws(() => {
    Object.defineProperty(result, "toJSON", { value: () => ({}) });
  }, TypeError);
  assert.throws(() => {
    result.summary.selectedCount = 0;
  }, TypeError);
  assert.throws(() => {
    Object.setPrototypeOf(result, { toJSON() { return {}; } });
  }, TypeError);
  assert.throws(
    () => assertVerifiedWildResultProvenance(result),
    /authoritative verifyWildResult output/u,
  );
});

test("a current repaired result cannot downgrade to the legacy v2 envelope", async (t) => {
  const fixture = await buildFixture(t);
  await unlink(path.join(fixture.root, networkPolicySmokePath));
  const index = await readJson(fixture.indexPath);
  const summaryPath = path.join(fixture.root, "wild", "summary.json");
  const summary = await readJson(summaryPath);
  for (const identity of [index.identity, summary.identity]) {
    delete identity.networkPolicySmoke;
    delete identity.pairedStart;
    delete identity.rerun;
    delete identity.runGeneration;
  }
  index.schema = "stasis-wild-artifact-index-v2";
  summary.schema = "stasis-wild-summary-v2";
  await writeCanonical(summaryPath, summary);
  index.summary.sha256 = await hashFile(summaryPath);
  await writeCanonical(fixture.indexPath, index);

  await assert.rejects(() => fixture.verify(), /exact retained invalid attempt/u);
});

test("a current repaired result cannot downgrade to the nonexistent v3 envelope", async (t) => {
  const fixture = await buildFixture(t);
  const index = await readJson(fixture.indexPath);
  const summaryPath = path.join(fixture.root, "wild", "summary.json");
  const summary = await readJson(summaryPath);
  index.schema = "stasis-wild-artifact-index-v3";
  summary.schema = "stasis-wild-summary-v3";
  await writeCanonical(summaryPath, summary);
  index.summary.sha256 = await hashFile(summaryPath);
  await writeCanonical(fixture.indexPath, index);

  await assert.rejects(() => fixture.verify(), /invalid supported envelope/u);
});

test("injected binding verification cannot mint decision authority", async (t) => {
  const fixture = await buildFixture(t);
  const result = await fixture.verify();
  for (const attack of [
    result,
    structuredClone(result),
    { ...structuredClone(result), artifactIndexSha256: "0".repeat(64) },
    { ...structuredClone(result), completedAt: "2099-01-01T00:00:00.000Z" },
  ]) {
    assert.throws(
      () => assertVerifiedWildResultProvenance(attack),
      /authoritative verifyWildResult output/u,
    );
  }
  const clean = structuredClone(result);
  const toJsonAttack = structuredClone(result);
  Object.defineProperty(toJsonAttack, "toJSON", {
    value: () => clean,
    enumerable: false,
  });
  toJsonAttack.summary.selectedCount = 0;
  assert.throws(
    () => assertVerifiedWildResultProvenance(toJsonAttack),
    /authoritative verifyWildResult output/u,
  );

  const accessorAttack = structuredClone(result);
  let reads = 0;
  Object.defineProperty(accessorAttack, "summary", {
    enumerable: true,
    get() {
      reads += 1;
      return reads % 2 === 1 ? clean.summary : { ...clean.summary, selectedCount: 0 };
    },
  });
  assert.throws(
    () => assertVerifiedWildResultProvenance(accessorAttack),
    /authoritative verifyWildResult output/u,
  );
  assert.equal(reads, 0);
});

test("ordinary postflight cannot mint decision authority without explicit quiescence", async (t) => {
  const fixture = await buildFixture(t);
  const ordinary = await fixture.verify();
  assert.throws(
    () => assertVerifiedWildResultProvenance(ordinary),
    /authoritative verifyWildResult output/u,
  );

  const prior = process.env.STASIS_WILD_ARTIFACT_ROOT_QUIESCENT;
  delete process.env.STASIS_WILD_ARTIFACT_ROOT_QUIESCENT;
  try {
    await assert.rejects(
      () => verifyQuiescentWildResult({
        artifactRoot: fixture.root,
        loadBinding: async () => fixture.binding,
      }),
      /decision authority requires.*QUIESCENT/u,
    );
  } finally {
    if (prior === undefined) delete process.env.STASIS_WILD_ARTIFACT_ROOT_QUIESCENT;
    else process.env.STASIS_WILD_ARTIFACT_ROOT_QUIESCENT = prior;
  }
});

test("wild postflight requires the exact semantic network-policy smoke", async (t) => {
  await t.test("missing bound smoke", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await unlink(path.join(fixture.root, networkPolicySmokePath));
    await assert.rejects(() => fixture.verify(), /network-policy-smoke|ENOENT/iu);
  });

  await t.test("coherently rehashed failed smoke", async (subtest) => {
    const fixture = await buildFixture(subtest);
    const smokePath = path.join(fixture.root, networkPolicySmokePath);
    const smoke = await readJson(smokePath);
    smoke.status = "failed";
    await writeCanonical(smokePath, smoke);
    const smokeSha256 = await hashFile(smokePath);

    const index = await readJson(fixture.indexPath);
    const summaryPath = path.join(fixture.root, "wild", "summary.json");
    const summary = await readJson(summaryPath);
    index.identity.networkPolicySmoke.sha256 = smokeSha256;
    summary.identity.networkPolicySmoke.sha256 = smokeSha256;
    await writeCanonical(summaryPath, summary);
    index.summary.sha256 = await hashFile(summaryPath);
    await writeCanonical(fixture.indexPath, index);

    await assert.rejects(() => fixture.verify(), /network-policy smoke/iu);
  });
});

test("wild postflight rejects replayed or mixed run generations", async (t) => {
  const legacySchemas = [
    "stasis-wild-gate-raw-v2",
    "stasis-wild-baseline-raw-v2",
    "stasis-wild-gate-raw-v2",
    "stasis-wild-stasis-raw-v2",
    "stasis-wild-case-classification-v2",
  ];
  for (const [recordIndex, schema] of legacySchemas.entries()) {
    await t.test(`legacy v2 record ${recordIndex + 1} rewrapped by a v4 index`, async (subtest) => {
      const fixture = await buildFixture(subtest);
      await fixture.mutateIndexed(0, recordIndex, (record) => {
        record.schema = schema;
        delete record.pairedRun;
      });
      await assert.rejects(
        () => fixture.verify(),
        /unexpected or missing keys|mismatched schema, corpus entry, or paired-run binding/u,
      );
    });
  }

  await t.test("one record from another attempt", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await fixture.mutateIndexed(0, 4, (record) => {
      record.pairedRun.runGeneration.nonceSha256 = "0".repeat(64);
    });
    await assert.rejects(
      () => fixture.verify(),
      /mismatched schema, corpus entry, or paired-run binding/u,
    );
  });

  await t.test("complete slot copied from another current attempt", async (subtest) => {
    const source = await buildFixture(subtest);
    const target = await buildFixture(subtest);
    const sourceIndex = await readJson(source.indexPath);
    const targetIndex = await readJson(target.indexPath);
    for (let recordIndex = 0; recordIndex < 5; recordIndex += 1) {
      const sourceReference = sourceIndex.cases[0].records[recordIndex];
      const targetReference = targetIndex.cases[0].records[recordIndex];
      const sourcePath = path.join(source.root, ...sourceReference.path.split("/"));
      const targetPath = path.join(target.root, ...targetReference.path.split("/"));
      await copyFile(sourcePath, targetPath);
      targetReference.sha256 = await hashFile(targetPath);
    }
    await writeCanonical(target.indexPath, targetIndex);
    await assert.rejects(
      () => target.verify(),
      /mismatched schema, corpus entry, or paired-run binding/u,
    );
  });
});

test("wild postflight rejects copied smoke and invalid smoke-to-paired ordering", async (t) => {
  await t.test("same-commit smoke copied into another artifact root", async (subtest) => {
    const source = await buildFixture(subtest);
    const target = await buildFixture(subtest);
    await copyFile(
      path.join(source.root, networkPolicySmokePath),
      path.join(target.root, networkPolicySmokePath),
    );
    await rebindSmokeReference(target);
    await assert.rejects(
      () => target.verify(),
      /run generation is bound to a different canonical artifact root/u,
    );
  });

  await t.test("smoke completed after paired execution began", async (subtest) => {
    const fixture = await buildFixture(subtest);
    const smokePath = path.join(fixture.root, networkPolicySmokePath);
    const smoke = await readJson(smokePath);
    smoke.completedAt = "2026-08-26T01:00:00.001Z";
    await writeCanonical(smokePath, smoke);
    await rebindSmokeReference(fixture);
    await assert.rejects(
      () => fixture.verify(),
      /smoke must complete before the paired run starts/u,
    );
  });

  assert.doesNotThrow(() => assertSmokePrecedesPairedRun(
    { completedAt: startedAt },
    startedAt,
  ));
});

test("wild postflight rejects baseline and Stasis gate phase substitution", async (t) => {
  const fixture = await buildFixture(t);
  const index = await readJson(fixture.indexPath);
  const baselineReference = index.cases[0].records[0];
  const stasisReference = index.cases[0].records[2];
  const baselinePath = path.join(fixture.root, ...baselineReference.path.split("/"));
  const stasisPath = path.join(fixture.root, ...stasisReference.path.split("/"));
  const [baselineBytes, stasisBytes] = await Promise.all([
    readFile(baselinePath),
    readFile(stasisPath),
  ]);
  await Promise.all([
    writeFile(baselinePath, stasisBytes),
    writeFile(stasisPath, baselineBytes),
  ]);
  baselineReference.sha256 = await hashFile(baselinePath);
  stasisReference.sha256 = await hashFile(stasisPath);
  await writeCanonical(fixture.indexPath, index);
  await assert.rejects(() => fixture.verify(), /mismatched schema/u);
});

test("repaired rerun identity rejects drift in both errata and both prior attempts", async () => {
  for (const [label, mutate] of [
    ["network-policy erratum", (value) => { value.erratum.sha256 = "0".repeat(64); }],
    ["projection erratum", (value) => { value.projectionErratum.sha256 = "0".repeat(64); }],
    ["prior invalid attempt", (value) => { value.priorInvalidAttempt.evidenceWeight = 1; }],
    ["prior incomplete attempt", (value) => { value.priorIncompleteAttempt.evidenceWeight = 1; }],
  ]) {
    const value = structuredClone(repairedRerunIdentity);
    mutate(value);
    await assert.rejects(
      () => assertRepairedRerunIdentity(value),
      /identity differs from the frozen erratum and prior attempt/u,
      label,
    );
  }
});

test("wild postflight rechecks repository binding before granting authority", async (t) => {
  const fixture = await buildFixture(t);
  let calls = 0;
  await assert.rejects(
    () => verifyWildResult({
      artifactRoot: fixture.root,
      loadBinding: async () => {
        calls += 1;
        if (calls === 2) throw new Error("final repository binding changed");
        return fixture.binding;
      },
    }),
    /final repository binding changed/u,
  );
  assert.equal(calls, 2);
});

test("wild postflight accepts one fully projected organic tree terminal", async (t) => {
  const fixture = await buildFixture(t, { firstCase: validTreeSettlementCase });
  const result = await fixture.verify();
  assert.equal(result.summary.diagnosedOrganicBlockerCount, 1);
  assert.deepEqual(result.summary.organicBlockerCounts, { browsing_context_tree: 1 });
  assert.equal(result.cases[0].classification.reason, "cross_event_loop_document");
  assert.deepEqual(
    result.cases[0].classification.firstTerminal.unsupportedWork,
    result.cases[0].stasis.settlement.unsupportedWork[0],
  );
  assert.notEqual(
    result.cases[0].classification.firstTerminal.unsupportedWork,
    result.cases[0].stasis.settlement.unsupportedWork[0],
  );
});

test("wild postflight accepts the v4 cookie cluster representation", async (t) => {
  const fixture = await buildFixture(t, { firstCase: persistentCookieCase });
  const result = await fixture.verify();
  assert.deepEqual(result.summary.organicBlockerCounts, { storage: 1 });
  assert.equal(Array.isArray(result.summary.organicRootClusters), true);
  assert.equal(result.summary.organicRootClusters[0].rootClusterId.includes("persistent_cookie"), true);
});

test("wild postflight final recheck rejects in-process artifact drift", async (t) => {
  const fixture = await buildFixture(t);
  const binding = structuredClone(fixture.binding);
  const lateEntry = binding.corpus.urls.at(-1);
  const requestedUrl = lateEntry.requestedUrl;
  const driftTarget = path.join(fixture.root, "wild", "raw", "001-baseline-gate.json");
  let drifted = false;
  Object.defineProperty(lateEntry, "requestedUrl", {
    enumerable: true,
    get() {
      if (!drifted) {
        drifted = true;
        writeFileSync(driftTarget, serializeWildArtifact({ drifted: true }), "utf8");
      }
      return requestedUrl;
    },
  });
  await assert.rejects(
    () => verifyWildResult({ artifactRoot: fixture.root, loadBinding: async () => binding }),
    /SHA-256 mismatch/u,
  );
  assert.equal(drifted, true);
});

test("wild postflight rejects traversal, duplicate, and reordered index references", async (t) => {
  for (const [label, mutate, pattern] of [
    ["traversal", (index) => { index.cases[0].records[0].path = "../outside.json"; }, /embedded local path|exact five ordered|portable relative/u],
    ["duplicate", (index) => { index.cases[1].records[0] = index.cases[0].records[0]; }, /exact five ordered|duplicate/u],
    ["reordered", (index) => {
      [index.cases[0].records[0], index.cases[0].records[1]] =
        [index.cases[0].records[1], index.cases[0].records[0]];
    }, /exact five ordered/u],
  ]) {
    await t.test(label, async (subtest) => {
      const fixture = await buildFixture(subtest);
      const index = await readJson(fixture.indexPath);
      mutate(index);
      await writeFile(fixture.indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
      await assert.rejects(() => fixture.verify(), pattern);
    });
  }
});

test("wild postflight rejects missing, extra, and hash-mismatched files", async (t) => {
  await t.test("missing", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await unlink(path.join(fixture.root, "wild", "raw", "002-baseline.json"));
    await assert.rejects(() => fixture.verify(), /inventory mismatch/u);
  });
  await t.test("extra root-level file", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await writeCanonical(path.join(fixture.root, "extra.json"), { safe: true });
    await assert.rejects(() => fixture.verify(), /complete wild artifact root inventory mismatch/u);
  });
  await t.test("extra empty root-level directory", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await mkdir(path.join(fixture.root, "empty"));
    await assert.rejects(() => fixture.verify(), /complete wild artifact root inventory mismatch/u);
  });
  await t.test("extra", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await writeCanonical(path.join(fixture.root, "wild", "raw", "extra.json"), { safe: true });
    await assert.rejects(() => fixture.verify(), /inventory mismatch/u);
  });
  await t.test("hash mismatch", async (subtest) => {
    const fixture = await buildFixture(subtest);
    const index = await readJson(fixture.indexPath);
    index.cases[0].records[0].sha256 = "0".repeat(64);
    await writeCanonical(fixture.indexPath, index);
    await assert.rejects(() => fixture.verify(), /SHA-256 mismatch/u);
  });
});

test("wild postflight rejects entry drift and recorded-classification drift after hashes are resealed", async (t) => {
  await t.test("entry drift", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await fixture.mutateIndexed(0, 1, (record) => { record.entry.rank += 1; });
    await assert.rejects(() => fixture.verify(), /mismatched schema, corpus entry, or paired-run binding/u);
  });
  await t.test("classification drift", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await fixture.mutateIndexed(0, 4, (record) => { record.classification.primary = "PASS_EQUIVALENT"; });
    await assert.rejects(() => fixture.verify(), /raw reclassification/u);
  });
});

test("wild postflight rejects a resealed aggregate that was not rebuilt from raw records", async (t) => {
  const fixture = await buildFixture(t);
  const index = await readJson(fixture.indexPath);
  const summaryPath = path.join(fixture.root, ...index.summary.path.split("/"));
  const summary = await readJson(summaryPath);
  summary.summary.baselineExcluded -= 1;
  await writeCanonical(summaryPath, summary);
  index.summary.sha256 = await hashFile(summaryPath);
  await writeCanonical(fixture.indexPath, index);
  await assert.rejects(() => fixture.verify(), /aggregate rebuilt from raw records/u);
});

test("wild postflight requires exact candidate hash on every actually-run observation", async (t) => {
  const fixture = await buildFixture(t);
  await fixture.mutateIndexed(0, 3, (record) => {
    record.observation.candidateExecutableSha256 = "0".repeat(64);
  });
  await assert.rejects(() => fixture.verify(), /exact candidate executable|mismatched candidate/u);
});

test("wild postflight rejects resealed minimal organic terminals without full raw evidence", async (t) => {
  for (const [label, stasis] of [
    ["settlement", {
      status: "settlement_terminal",
      candidateExecutableSha256: candidate.executableSha256,
      settlement: {
        outcome: "unsupported_work",
        unsupportedWork: [{ reason: "cross_event_loop_document" }],
      },
    }],
    ["error", {
      status: "error",
      candidateExecutableSha256: candidate.executableSha256,
      error: {
        name: "StasisStateError",
        code: "cross_event_loop_navigation",
      },
    }],
  ]) {
    await t.test(label, async (subtest) => {
      const fixture = await buildFixture(subtest);
      const entry = fixture.entries[0];
      const raw = eligibleSdkGapCase(entry);
      raw.stasis = stasis;
      const classification = classifyWildCase({ entry, ...raw });
      assert.equal(classification.blockerFamily, "browsing_context_tree");
      assert.equal(classification.eligibleForOrganicBlockerCensus, true);
      await fixture.mutateIndexed(0, 3, (record) => { record.observation = raw.stasis; });
      await fixture.mutateIndexed(0, 4, (record) => { record.classification = classification; });
      await assert.rejects(
        () => fixture.verify(),
        /lacks exact candidate, requested-root, or bounded wall-time evidence/u,
      );
    });
  }
});

test("wild postflight rejects invalid full-tree audit, projection, and cleanup evidence", async (t) => {
  for (const [label, mutate, pattern] of [
    ["incomplete audit", (observation) => { observation.audit.complete = false; }, /complete uncensored audit/u],
    ["impossible omitted count", (observation) => {
      observation.settlement.unsupportedWorkOmitted = 1;
    }, /exact bounded projection/u],
    ["invalid settlement cleanup", (observation) => {
      observation.cleanup = { status: "not_required", mode: "not_started" };
    }, /owned-process cleanup evidence/u],
  ]) {
    await t.test(label, async (subtest) => {
      const fixture = await buildFixture(subtest, { firstCase: validTreeSettlementCase });
      await fixture.mutateIndexed(0, 3, (record) => { mutate(record.observation); });
      await assert.rejects(() => fixture.verify(), pattern);
    });
  }
});

test("wild postflight rejects a merely allowed-looking robots decision", async (t) => {
  const fixture = await buildFixture(t);
  await fixture.mutateIndexed(0, 0, (record) => {
    record.gate.robots.extra = true;
  });
  await assert.rejects(() => fixture.verify(), /exact allowed public-target and robots decision/u);
});

test("wild postflight rejects runtime, rules, and clean repository binding drift", async (t) => {
  await t.test("runtime", async (subtest) => {
    const fixture = await buildFixture(subtest);
    const index = await readJson(fixture.indexPath);
    index.identity.runtime.nodeExecutableSha256 = "0".repeat(64);
    await writeCanonical(fixture.indexPath, index);
    await assert.rejects(() => fixture.verify(), /runtime identity mismatch/u);
  });
  await t.test("rules", async (subtest) => {
    const fixture = await buildFixture(subtest);
    const index = await readJson(fixture.indexPath);
    index.rules.retries = 1;
    await writeCanonical(fixture.indexPath, index);
    await assert.rejects(() => fixture.verify(), /frozen rules/u);
  });
  await t.test("repository binding", async (subtest) => {
    const fixture = await buildFixture(subtest);
    await assert.rejects(
      () => verifyWildResult({
        artifactRoot: fixture.root,
        loadBinding: async () => { throw new Error("Wild census requires a clean harness worktree"); },
      }),
      /clean harness worktree/u,
    );
  });
});

async function rebindSmokeReference(fixture) {
  const smokeSha256 = await hashFile(path.join(fixture.root, networkPolicySmokePath));
  const index = await readJson(fixture.indexPath);
  const summaryPath = path.join(fixture.root, "wild", "summary.json");
  const summary = await readJson(summaryPath);
  index.identity.networkPolicySmoke.sha256 = smokeSha256;
  summary.identity.networkPolicySmoke.sha256 = smokeSha256;
  await writeCanonical(summaryPath, summary);
  index.summary.sha256 = await hashFile(summaryPath);
  await writeCanonical(fixture.indexPath, index);
}

async function buildFixture(t, { firstCase = eligibleSdkGapCase } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-wild-verifier-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entries = buildEntries();
  const runtime = runtimeIdentity();
  const runGeneration = {
    schema: "stasis-wild-run-generation-v1",
    nonceSha256: "e".repeat(64),
    artifactRootPathSha256: wildArtifactRootPathSha256(root),
  };
  const binding = {
    harnessCommit,
    preregistrationCommit,
    corpusSha256,
    preflightLedgerSha256: ledgerSha256,
    corpusPath: "corpora/wild-tranco-74V4X-v1.json",
    preflightLedgerPath: "corpora/wild-tranco-74V4X-v1-preflight.json",
    preflightRuntime: runtime,
    corpus: { urls: entries },
  };
  const smokePath = path.join(root, networkPolicySmokePath);
  await writeCanonical(smokePath, networkPolicySmokeArtifact(runtime, runGeneration));
  const networkPolicySmoke = {
    path: networkPolicySmokePath,
    sha256: await hashFile(smokePath),
  };
  const pairedRun = {
    schema: "stasis-wild-paired-start-v1",
    protocol,
    nonceSha256: "f".repeat(64),
    runGeneration,
    networkPolicySmoke,
    startedAt,
  };
  const pairedStartPath = path.join(root, "wild", "paired-start.json");
  await writeCanonical(pairedStartPath, pairedRun);
  const pairedStart = {
    path: "wild/paired-start.json",
    sha256: await hashFile(pairedStartPath),
  };
  const identity = {
    protocol,
    harnessCommit,
    preregistrationCommit,
    corpusPath: "corpora/wild-tranco-74V4X-v1.json",
    corpusSha256,
    preflightLedgerPath: "corpora/wild-tranco-74V4X-v1-preflight.json",
    preflightLedgerSha256: ledgerSha256,
    node: expectedVersions.node,
    runtime,
    networkPolicySmoke,
    pairedStart,
    runGeneration,
    rerun: repairedRerunIdentity,
    stasisRevision: candidate.revision,
    stasisVersion: candidate.version,
    stasisProfile: candidate.profile,
    stasisExecutableSha256: candidate.executableSha256,
    stasisSdkArchiveSha256: candidate.sdkSha256,
    stasisSdkTree: runtime.candidateSdkTree,
  };
  const cases = [];
  for (const entry of entries) {
    const raw = entry.slot === 1 ? firstCase(entry) : baselineFailureCase(entry);
    const classification = classifyWildCase({ entry, ...raw });
    const prefix = String(entry.slot).padStart(3, "0");
    const values = [
      [
        `wild/raw/${prefix}-baseline-gate.json`,
        {
          schema: "stasis-wild-baseline-gate-raw-v3",
          pairedRun,
          entry,
          gate: raw.baselineGate,
        },
      ],
      [
        `wild/raw/${prefix}-baseline.json`,
        { schema: "stasis-wild-baseline-raw-v3", pairedRun, entry, observation: raw.baseline },
      ],
      [
        `wild/raw/${prefix}-stasis-gate.json`,
        {
          schema: "stasis-wild-stasis-gate-raw-v3",
          pairedRun,
          entry,
          gate: raw.stasisGate,
        },
      ],
      [
        `wild/raw/${prefix}-stasis.json`,
        { schema: "stasis-wild-stasis-raw-v3", pairedRun, entry, observation: raw.stasis },
      ],
      [
        `wild/cases/${prefix}-classification.json`,
        { schema: "stasis-wild-case-classification-v3", pairedRun, entry, classification },
      ],
    ];
    const records = [];
    for (const [relativePath, value] of values) {
      const absolutePath = path.join(root, ...relativePath.split("/"));
      await writeCanonical(absolutePath, value);
      records.push({ path: relativePath, sha256: await hashFile(absolutePath) });
    }
    cases.push({ entry, ...raw, classification, artifactRecord: { slot: entry.slot, rank: entry.rank, records } });
  }
  const summaryValue = {
    schema: "stasis-wild-summary-v4",
    protocol,
    identity,
    rules: wildPairedRules,
    startedAt,
    completedAt,
    summary: aggregateWildClassifications(cases),
  };
  const summaryPath = path.join(root, "wild", "summary.json");
  await writeCanonical(summaryPath, summaryValue);
  const index = {
    schema: "stasis-wild-artifact-index-v4",
    protocol,
    identity,
    rules: wildPairedRules,
    startedAt,
    completedAt,
    selectedCount: cases.length,
    summary: { path: "wild/summary.json", sha256: await hashFile(summaryPath) },
    cases: cases.map((item) => item.artifactRecord),
  };
  const indexPath = path.join(root, "wild", "artifact-index.json");
  await writeCanonical(indexPath, index);

  return {
    root,
    indexPath,
    entries,
    binding,
    runGeneration,
    verify: () => verifyWildResult({ artifactRoot: root, loadBinding: async () => binding }),
    async mutateIndexed(caseIndex, recordIndex, mutate) {
      const currentIndex = await readJson(indexPath);
      const reference = currentIndex.cases[caseIndex].records[recordIndex];
      const recordPath = path.join(root, ...reference.path.split("/"));
      const record = await readJson(recordPath);
      mutate(record);
      await writeCanonical(recordPath, record);
      reference.sha256 = await hashFile(recordPath);
      await writeCanonical(indexPath, currentIndex);
    },
  };
}

function networkPolicySmokeArtifact(runtime, runGeneration) {
  return {
    schema: "stasis-wild-network-policy-smoke-v2",
    protocol,
    status: "passed",
    startedAt: smokeStartedAt,
    completedAt: smokeCompletedAt,
    runGeneration,
    harnessCommit,
    preregistrationCommit,
    corpusSha256,
    preflightLedgerSha256: ledgerSha256,
    node: {
      version: runtime.node,
      executableBasename: runtime.nodeExecutableBasename,
      executableBytes: runtime.nodeExecutableBytes,
      executableSha256: runtime.nodeExecutableSha256,
    },
    candidate: {
      revision: candidate.revision,
      version: candidate.version,
      profile: candidate.profile,
      executableSha256: candidate.executableSha256,
      sdkArchiveSha256: candidate.sdkSha256,
      sdkTreeSha256: runtimePins.candidateSdkTree.sha256,
      sdkTreeFileCount: runtimePins.candidateSdkTree.fileCount,
      sdkTreeBytes: runtimePins.candidateSdkTree.totalBytes,
    },
    policy: {
      declaredMode: networkPolicyIdentity.mode,
      appliedMode: "fixtures_only",
      routeCount: networkPolicyIdentity.routeCount,
      sha256: networkPolicyIdentity.sha256,
      encodedBytes: networkPolicyIdentity.encodedBytes,
      compiledRouteCount: networkPolicyIdentity.routeCount + 1,
      coverage:
        "common_non_get_http_https_and_best_effort_private_ipv4_localhost_default_port_ipv6_literals",
      excluded:
        "ipv6_cidr_and_non_default_ipv6_ports_unrepresentable_in_frozen_native_url_matcher",
    },
    fixture: {
      targetClass: "synthetic_reserved_invalid_origin",
      method: "GET",
      routeDecision: "fixture_fulfill",
    },
    result: {
      outcome: "quiescent",
      requestCount: 1,
      requestMethods: ["GET"],
      routeDecisionCount: 1,
      liveDecisionCount: 0,
      cleanup: "graceful_session_close",
    },
  };
}

function buildEntries() {
  const entries = [];
  let slot = 1;
  for (const stratum of strata) {
    for (let index = 0; index < stratum.quota; index += 1) {
      const domain = `wild-census-${slot}.com`;
      entries.push({
        slot,
        stratumId: stratum.id,
        stratumSlot: index + 1,
        permutationIndex: index,
        rank: stratum.minRank + index,
        domain,
        requestedUrl: `https://${domain}/`,
      });
      slot += 1;
    }
  }
  return entries;
}

function eligibleSdkGapCase(entry) {
  const extraction = {
    titleIdentity: normalizeTitleIdentity("Example"),
    linkIdentities: normalizeLinkIdentitySet([`${entry.requestedUrl}page`]),
  };
  return {
    baselineGate: allowedGate(),
    baseline: {
      status: "success",
      code: "eligible",
      requestedUrl: entry.requestedUrl,
      finalUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
      responseStatus: 200,
      contentType: "text/html",
      extraction,
      wallTimeMs: 1,
    },
    stasisGate: allowedGate(),
    stasis: {
      status: "success",
      code: "extracted",
      requestedUrl: entry.requestedUrl,
      candidateExecutableSha256: candidate.executableSha256,
      openCommittedUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
      currentUrlObservable: false,
      settlement: { outcome: "quiescent" },
      extraction,
      wallTimeMs: 1,
    },
  };
}

function persistentCookieCase(entry) {
  const baselineCase = eligibleSdkGapCase(entry);
  return {
    ...baselineCase,
    stasis: {
      status: "error",
      code: "stasis_operation_failed",
      requestedUrl: entry.requestedUrl,
      candidateExecutableSha256: candidate.executableSha256,
      error: {
        name: "StasisProtocolError",
        code: "unsupported_persistent_cookie",
        fatal: false,
        stateEffect: "partial",
        messageOmitted: true,
        stderrTailOmitted: true,
        stderrTailBytes: 1,
      },
      cleanup: { status: "passed", mode: "fail_stop_runtime_close" },
      wallTimeMs: 1,
    },
  };
}

function validTreeSettlementCase(entry) {
  const baselineCase = eligibleSdkGapCase(entry);
  return {
    ...baselineCase,
    stasis: {
      status: "settlement_terminal",
      requestedUrl: entry.requestedUrl,
      candidateExecutableSha256: candidate.executableSha256,
      openCommittedUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
      currentUrlObservable: false,
      settlement: {
        outcome: "unsupported_work",
        unsupportedWork: [{
          kind: "other",
          count: "1",
          reason: "cross_event_loop_document",
          timeSurface: "same_event_loop_iframe",
        }],
        unsupportedWorkOmitted: 0,
        persistentWork: [],
        persistentWorkOmitted: 0,
        externalIoCount: 0,
        processed: {
          controlTurns: "1",
          tasks: "0",
          microtasks: "0",
          renderingOpportunities: "0",
          mutations: "0",
        },
      },
      audit: {
        complete: true,
        requests: [{ method: "GET" }],
        evidence: [{ kind: "route_decided", decision: "network" }],
        requestRecordsOmitted: 0,
        evidenceRecordsOmitted: 0,
      },
      cleanup: { status: "passed", mode: "graceful_session_close" },
      wallTimeMs: 1,
    },
  };
}

function baselineFailureCase() {
  return {
    baselineGate: allowedGate(),
    baseline: { status: "failure", code: "navigation_timeout" },
    stasisGate: { status: "not_run", code: "baseline_not_eligible" },
    stasis: { status: "not_run", code: "baseline_not_eligible" },
  };
}

function allowedGate() {
  return {
    status: "allowed",
    code: "eligible",
    robots: { status: "allowed", reason: "robots_not_found", redirectCount: 0 },
    root: { addressCount: 1, families: [4] },
  };
}

function runtimeIdentity() {
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
    chromiumVersion: "151.0.7922.34",
    chromiumExecutableBasename: runtimePins.chromiumExecutableBasename,
    chromiumExecutableBytes: runtimePins.chromiumExecutableBytes,
    chromiumExecutableSha256: runtimePins.chromiumExecutableSha256,
  };
}

async function writeCanonical(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, serializeWildArtifact(value), "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}
