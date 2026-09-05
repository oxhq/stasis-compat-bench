import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
} from "../src/performance/navigation-causal-contract.mjs";
import {
  navigationCausalHarnessIdentity,
} from "../src/performance/navigation-causal-replication.mjs";
import {
  navigationCausalAnonymousContractPreflightSchema,
  navigationCausalV4EvidenceAssets,
  assertNavigationCausalAnonymousContractPreflightReceipt,
  verifyNavigationCausalAnonymousContractPreflight,
  verifyNavigationCausalInvalidV1PreObservationEvidence,
} from "../src/performance/navigation-causal-public-release.mjs";
import {
  navigationCausalInvalidV1Fixture,
} from "./fixtures/navigation-causal-invalid-v1-fixture.mjs";
import {
  navigationCausalInvalidV2Fixture,
} from "./fixtures/navigation-causal-invalid-v2-fixture.mjs";

test("anonymous preflight binds contract bytes, direct tag, remote absence, and public V4 selection", async () => {
  const receipt = verifyNavigationCausalAnonymousContractPreflight(await validInput());
  assert.equal(receipt.schema, navigationCausalAnonymousContractPreflightSchema);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.credentialsUsed, false);
  assert.equal(receipt.contract.lightweightTagDirectToTarget, true);
  assert.equal(receipt.contract.publishedAt, "2026-09-05T02:11:00Z");
  assert.equal(receipt.invalidV1PreObservation.status, "INVALID_PREFLIGHT_CHRONOLOGY_MODEL");
  assert.equal(receipt.invalidV1PreObservation.observationStarted, false);
  assert.equal(receipt.invalidV2Infrastructure.status,
    "INVALID_PRE_MEASUREMENT_HARNESS_INVOCATION");
  assert.equal(receipt.invalidV2Infrastructure.productMeasurementStarted, false);
  assert.equal(receipt.executionHarness.revision, navigationCausalHarnessIdentity.revision);
  assert.equal(receipt.oneShotRules.contractReleaseLatest, false);
  assert.equal(receipt.sourceAbsence.workflowRunCount, 0);
  assert.deepEqual(receipt.sourceAbsence.httpStatuses, {
    sourceRef: 404,
    sourceCommit: 422,
    workflowRuns: 200,
    invalidV1EvidenceRelease: 404,
    invalidV1EvidenceTagRef: 404,
    evidenceRelease: 404,
    evidenceTagRef: 404,
  });
  assert.equal(receipt.v4.selectedOrdinal, 10);
  assert.equal(receipt.v4.timingImportedIntoCausalStatistics, false);
  const input = await validInput();
  assert.equal(assertNavigationCausalAnonymousContractPreflightReceipt(receipt, {
    contractReleaseRecord: input.contractReleaseRecord,
    contractCommitRecord: input.contractCommitRecord,
    v4ReleaseRecord: input.v4ReleaseRecord,
  }), receipt);
});

test("contract target, tag kind, Git blobs, and exact six assets fail closed", async (t) => {
  const cases = [
    ["main target", (value) => { value.contractReleaseRecord.target_commitish = "main"; }],
    ["annotated tag", (value) => { value.contractTagRefRecord.object.type = "tag"; }],
    ["wrong parent", (value) => { value.contractCommitRecord.parents[0].sha = "a".repeat(40); }],
    ["wrong tree", (value) => { value.contractCommitRecord.commit.tree.sha = "bad"; }],
    ["wrong blob", (value) => { value.contractCommitRecord.files[0].sha = "b".repeat(40); }],
    ["created after publication", (value) => {
      value.contractReleaseRecord.created_at = "2026-09-05T02:11:01Z";
    }],
    ["not published after invalid V2 terminal", (value) => {
      value.contractReleaseRecord.published_at = "2026-09-05T01:59:17Z";
    }],
    ["extra release asset", (value) => { value.contractReleaseRecord.assets.push({ name: "extra", size: 1, digest: `sha256:${"a".repeat(64)}` }); }],
    ["changed released bytes", (value) => { value.contractAssets[Object.keys(value.contractAssets)[0]][10] ^= 1; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const value = await validInput();
    mutate(value);
    assert.throws(() => verifyNavigationCausalAnonymousContractPreflight(value));
  });
});

test("cross-release created_at does not order the V2 and V3 releases", async () => {
  const value = await validInput();
  value.contractReleaseRecord.created_at = value.invalidV1.preflightReleaseRecord.created_at;
  assert.equal(
    verifyNavigationCausalAnonymousContractPreflight(value).status,
    "passed",
  );
});

test("offline preflight replay rejects a self-consistent contract created after publication", async () => {
  const value = await validInput();
  const receipt = verifyNavigationCausalAnonymousContractPreflight(value);
  value.contractReleaseRecord.created_at = "2026-09-05T02:11:01Z";
  const forged = structuredClone(receipt);
  forged.contract.createdAt = value.contractReleaseRecord.created_at;
  assert.throws(() => assertNavigationCausalAnonymousContractPreflightReceipt(forged, {
    contractReleaseRecord: value.contractReleaseRecord,
    contractCommitRecord: value.contractCommitRecord,
    v4ReleaseRecord: value.v4ReleaseRecord,
  }), /created after/u);
});

test("the exact V1 gate failure replays as typed pre-observation evidence", async (t) => {
  const valid = await navigationCausalInvalidV1Fixture();
  const disposition = verifyNavigationCausalInvalidV1PreObservationEvidence(valid);
  assert.equal(disposition.status, "INVALID_PREFLIGHT_CHRONOLOGY_MODEL");
  assert.equal(disposition.observationStarted, false);
  assert.equal(disposition.contract.createdAt, disposition.preflight.createdAt);
  assert.ok(Date.parse(disposition.contract.publishedAt) <
    Date.parse(disposition.preflight.publishedAt));
  const cases = [
    ["V1 contract metadata drift", (value) => {
      value.contractReleaseRecord.published_at = "2026-09-04T20:40:01Z";
    }],
    ["V1 contract blob drift", (value) => {
      value.contractCommitRecord.files.find(
        ({ filename }) => filename ===
          "protocol/stasis-v0.3.3-performance-navigation-causal-v1.md",
      ).sha = "a".repeat(40);
    }],
    ["V1 preflight tag drift", (value) => {
      value.preflightTagRefRecord.object.type = "tag";
    }],
    ["V1 receipt drift", (value) => {
      value.preflightReceiptBytes[100] ^= 1;
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const value = await navigationCausalInvalidV1Fixture();
    mutate(value);
    assert.throws(() => verifyNavigationCausalInvalidV1PreObservationEvidence(value));
  });
});

test("any observed source/run/evidence surface blocks the one-shot authorization", async (t) => {
  const cases = [
    ["source ref", (value) => { value.absence.sourceRef.status = 200; }],
    ["source commit", (value) => { value.absence.sourceCommit.status = 200; }],
    ["workflow run", (value) => { value.workflowRunsListing = { total_count: 1, workflow_runs: [{}] }; }],
    ["invalid V1 evidence release", (value) => { value.absence.invalidV1EvidenceRelease.status = 200; }],
    ["invalid V1 evidence tag", (value) => { value.absence.invalidV1EvidenceTagRef.status = 200; }],
    ["evidence release", (value) => { value.absence.evidenceRelease.status = 200; }],
    ["evidence tag", (value) => { value.absence.evidenceTagRef.status = 200; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const value = await validInput();
    mutate(value);
    assert.throws(() => verifyNavigationCausalAnonymousContractPreflight(value), /absent/u);
  });
});

test("contract preflight rejects a contract release selected as latest", async () => {
  const value = await validInput();
  value.latestReleaseRecord.id = value.contractReleaseRecord.id;
  assert.throws(
    () => verifyNavigationCausalAnonymousContractPreflight(value),
    /unexpectedly became latest/u,
  );
});

test("V4 release inventory, selected asset ID, bytes, and selected values fail closed", async (t) => {
  const cases = [
    ["mutable", (value) => { value.v4ReleaseRecord.immutable = false; }],
    ["wrong selected ID", (value) => {
      value.v4ReleaseRecord.assets.find(({ name }) =>
        name === "crawl-phase-localization-evidence.json").id += 1;
    }],
    ["wrong other asset", (value) => { value.v4ReleaseRecord.assets[0].size += 1; }],
    ["wrong tag target", (value) => { value.v4TagRefRecord.object.sha = "c".repeat(40); }],
    ["changed bytes", (value) => { value.v4LocalizationBytes[100] ^= 1; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const value = await validInput();
    mutate(value);
    assert.throws(() => verifyNavigationCausalAnonymousContractPreflight(value));
  });
});

async function validInput() {
  const protocolRoot = new URL("../protocol/", import.meta.url);
  const contractAssets = Object.fromEntries(await Promise.all(
    Object.keys(navigationCausalContractAssetIdentities).map(async (name) => [
      name,
      await readFile(new URL(name, protocolRoot)),
    ]),
  ));
  const contractSha = "d".repeat(40);
  const contractCommitRecord = {
    sha: contractSha,
    parents: [{ sha: navigationCausalContractIdentity.soleParentSha }],
    commit: { tree: { sha: "e".repeat(40) } },
    files: Object.entries(contractAssets).map(([name, bytes]) => ({
      filename: `protocol/${name}`,
      status: "added",
      sha: gitBlobSha(bytes),
    })),
  };
  const contractReleaseRecord = {
    id: 382950000,
    tag_name: navigationCausalContractIdentity.tag,
    target_commitish: contractSha,
    immutable: true,
    draft: false,
    prerelease: false,
    created_at: "2026-09-05T02:10:00Z",
    published_at: "2026-09-05T02:11:00Z",
    assets: Object.entries(navigationCausalContractAssetIdentities).map(([name, value]) => ({
      name,
      size: value.bytes,
      digest: `sha256:${value.sha256}`,
    })),
  };
  const binding = JSON.parse(contractAssets[navigationCausalContractIdentity.assets.selection]);
  const v4ReleaseRecord = {
    id: binding.source.releaseId,
    tag_name: binding.source.tag,
    target_commitish: binding.source.targetCommitSha,
    immutable: true,
    draft: false,
    prerelease: false,
    assets: Object.entries(navigationCausalV4EvidenceAssets).map(([name, value], index) => ({
      id: name === binding.source.localizationAsset.name
        ? binding.source.localizationAsset.id
        : 544735000 + index,
      name,
      size: value[0],
      digest: `sha256:${value[1]}`,
    })),
  };
  return {
    contractReleaseRecord,
    contractCommitRecord,
    contractTagRefRecord: {
      ref: `refs/tags/${navigationCausalContractIdentity.tag}`,
      object: { type: "commit", sha: contractSha },
    },
    contractAssets,
    latestReleaseRecord: { id: 382000000 },
    invalidV1: await navigationCausalInvalidV1Fixture(),
    invalidV2: await navigationCausalInvalidV2Fixture(),
    harnessCommitRecord: executionHarnessCommitRecord(),
    absence: {
      sourceRef: { status: 404 },
      sourceCommit: { status: 422 },
      workflowRuns: { status: 200 },
      invalidV1EvidenceRelease: { status: 404 },
      invalidV1EvidenceTagRef: { status: 404 },
      evidenceRelease: { status: 404 },
      evidenceTagRef: { status: 404 },
    },
    workflowRunsListing: { total_count: 0, workflow_runs: [] },
    v4ReleaseRecord,
    v4TagRefRecord: {
      ref: `refs/tags/${binding.source.tag}`,
      object: { type: "commit", sha: binding.source.targetCommitSha },
    },
    v4LocalizationBytes: await readFile(new URL(
      "fixtures/crawl-phase-localization-evidence-v4-public.json",
      import.meta.url,
    )),
  };
}

function executionHarnessCommitRecord() {
  return {
    sha: navigationCausalHarnessIdentity.revision,
    url:
      `https://api.github.com/repos/${navigationCausalHarnessIdentity.repository}/commits/${navigationCausalHarnessIdentity.revision}`,
    parents: [{ sha: navigationCausalHarnessIdentity.parentRevision }],
    commit: { tree: { sha: navigationCausalHarnessIdentity.tree } },
    files: Object.values(navigationCausalHarnessIdentity.files).map((identity) => ({
      filename: identity.path,
      status: identity.path === "test/performance-navigation-causal-environment-v3.test.mjs"
        ? "added"
        : "modified",
      sha: identity.blob,
    })),
  };
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}
