import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
} from "../src/performance/navigation-causal-contract.mjs";
import {
  navigationCausalAnonymousContractPreflightSchema,
  navigationCausalV4EvidenceAssets,
  assertNavigationCausalAnonymousContractPreflightReceipt,
  verifyNavigationCausalAnonymousContractPreflight,
} from "../src/performance/navigation-causal-public-release.mjs";

test("anonymous preflight binds contract bytes, direct tag, remote absence, and public V4 selection", async () => {
  const receipt = verifyNavigationCausalAnonymousContractPreflight(await validInput());
  assert.equal(receipt.schema, navigationCausalAnonymousContractPreflightSchema);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.credentialsUsed, false);
  assert.equal(receipt.contract.lightweightTagDirectToTarget, true);
  assert.equal(receipt.contract.publishedAt, "2026-09-04T18:55:00Z");
  assert.equal(receipt.oneShotRules.contractReleaseLatest, false);
  assert.equal(receipt.sourceAbsence.workflowRunCount, 0);
  assert.deepEqual(receipt.sourceAbsence.httpStatuses, {
    sourceRef: 404,
    sourceCommit: 422,
    workflowRuns: 200,
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

test("contract target, tag kind, Git blobs, and exact four assets fail closed", async (t) => {
  const cases = [
    ["main target", (value) => { value.contractReleaseRecord.target_commitish = "main"; }],
    ["annotated tag", (value) => { value.contractTagRefRecord.object.type = "tag"; }],
    ["wrong parent", (value) => { value.contractCommitRecord.parents[0].sha = "a".repeat(40); }],
    ["wrong tree", (value) => { value.contractCommitRecord.commit.tree.sha = "bad"; }],
    ["wrong blob", (value) => { value.contractCommitRecord.files[0].sha = "b".repeat(40); }],
    ["extra release asset", (value) => { value.contractReleaseRecord.assets.push({ name: "extra", size: 1, digest: `sha256:${"a".repeat(64)}` }); }],
    ["changed released bytes", (value) => { value.contractAssets[Object.keys(value.contractAssets)[0]][10] ^= 1; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const value = await validInput();
    mutate(value);
    assert.throws(() => verifyNavigationCausalAnonymousContractPreflight(value));
  });
});

test("any observed source/run/evidence surface blocks the one-shot authorization", async (t) => {
  const cases = [
    ["source ref", (value) => { value.absence.sourceRef.status = 200; }],
    ["source commit", (value) => { value.absence.sourceCommit.status = 200; }],
    ["workflow run", (value) => { value.workflowRunsListing = { total_count: 1, workflow_runs: [{}] }; }],
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
    published_at: "2026-09-04T18:55:00Z",
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
    absence: {
      sourceRef: { status: 404 },
      sourceCommit: { status: 422 },
      workflowRuns: { status: 200 },
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

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}
