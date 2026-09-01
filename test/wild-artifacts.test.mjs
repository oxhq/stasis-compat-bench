import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertFreshWildArtifactLane,
  claimFreshWildArtifactLane,
  createCaseArtifactWriter,
  writeWildSummaryAndIndex,
} from "../src/wild/artifacts.mjs";
import { assertWildArtifactPrivacy } from "../src/wild/artifact-privacy.mjs";
import { aggregateWildClassifications } from "../src/wild/classification.mjs";
import { normalizeTitleIdentity, publicHttpUrlIdentity } from "../src/wild/normalize.mjs";
import { sha256File } from "../src/shared/io.mjs";
import {
  assertWildRunGeneration,
  wildArtifactRootPathSha256,
} from "../src/wild/run-generation.mjs";

test("wild artifacts are append-only, hash-indexed, and rooted only in the explicit artifact directory", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-wild-artifacts-"));
  const artifactRoot = path.join(temporaryRoot, "run");
  const priorArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  process.env.STASIS_COMPAT_ARTIFACT_DIR = artifactRoot;
  await mkdir(artifactRoot);
  const runGeneration = {
    schema: "stasis-wild-run-generation-v1",
    nonceSha256: "e".repeat(64),
    artifactRootPathSha256: wildArtifactRootPathSha256(artifactRoot),
  };
  t.after(async () => {
    if (priorArtifactRoot === undefined) delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    else process.env.STASIS_COMPAT_ARTIFACT_DIR = priorArtifactRoot;
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  await assertFreshWildArtifactLane();
  const pairedStart = await claimFreshWildArtifactLane({
    runGeneration,
    networkPolicySmoke: {
      path: "wild-network-policy-smoke.json",
      sha256: "f".repeat(64),
    },
    startedAt: "2026-08-26T00:00:00.000Z",
    protocol: "stasis-post-0.3-census-v1",
  });
  const privateMarker = "PRIVATE_ENTRY_SENTINEL";
  const entry = {
    slot: 1,
    stratumId: "rank-1-1000",
    stratumSlot: 1,
    permutationIndex: 0,
    rank: 1,
    domain: "example.com",
    requestedUrl: "https://example.com/",
    title: privateMarker,
    finalUrl: `https://example.com/private/${privateMarker}`,
    hostname: "private.internal",
    sourceId: privateMarker,
  };
  const projectedEntry = {
    slot: 1,
    stratumId: "rank-1-1000",
    stratumSlot: 1,
    permutationIndex: 0,
    rank: 1,
    domain: "example.com",
    requestedUrl: "https://example.com/",
  };
  const item = {
    entry,
    baselineGate: { status: "allowed", code: "eligible" },
    baseline: {
      status: "success",
      finalUrlIdentity: publicHttpUrlIdentity(entry.requestedUrl),
      extraction: { titleIdentity: normalizeTitleIdentity("/news"), linkIdentities: [] },
    },
    stasisGate: { status: "allowed", code: "eligible" },
    stasis: { status: "settlement_terminal", settlement: { outcome: "unsupported_work" } },
    classification: {
      primary: "PROFILE_UNSUPPORTED",
      exposure: "organic_primary",
      diagnosisConfidence: "typed",
      firstTerminal: {
        phase: "settlement",
        code: "unsupported_work",
        typedSurface: "other",
      },
      rootClusterId: "profile_unsupported:other",
      censoredAfterFirstTerminal: true,
    },
  };

  const artifactRecord = await createCaseArtifactWriter(pairedStart.value)(item);
  assert.equal(artifactRecord.records.length, 5);
  const expectedSchemas = [
    "stasis-wild-baseline-gate-raw-v3",
    "stasis-wild-baseline-raw-v3",
    "stasis-wild-stasis-gate-raw-v3",
    "stasis-wild-stasis-raw-v3",
    "stasis-wild-case-classification-v3",
  ];
  for (const [index, record] of artifactRecord.records.entries()) {
    const absolutePath = path.join(artifactRoot, ...record.path.split("/"));
    assert.equal(await sha256File(absolutePath), record.sha256);
    const bytes = await readFile(absolutePath, "utf8");
    const value = JSON.parse(bytes);
    assert.equal(bytes.includes(privateMarker), false);
    assert.equal(value.schema, expectedSchemas[index]);
    assert.deepEqual(value.pairedRun, pairedStart.value);
    assert.deepEqual(value.entry, projectedEntry);
    assertWildArtifactPrivacy(value);
  }

  let domainReads = 0;
  let requestedUrlReads = 0;
  const accessorEntry = {
    ...projectedEntry,
    slot: 2,
    get domain() {
      domainReads += 1;
      return domainReads === 1 ? "example.com" : privateMarker;
    },
    get requestedUrl() {
      requestedUrlReads += 1;
      return requestedUrlReads === 1 ? "https://example.com/" : `https://example.com/${privateMarker}`;
    },
  };
  const accessorRecord = await createCaseArtifactWriter(pairedStart.value)({
    ...item,
    entry: accessorEntry,
    baseline: {
      status: "failure",
      code: "navigation_failed",
      requestedUrl: "https://example.com/",
      error: {
        name: "BrowserNavigationError",
        code: "ENOTFOUND",
        messageOmitted: true,
      },
      wallTimeMs: 1,
    },
  });
  assert.equal(domainReads, 1);
  assert.equal(requestedUrlReads, 1);
  for (const record of accessorRecord.records) {
    const bytes = await readFile(path.join(artifactRoot, ...record.path.split("/")), "utf8");
    assert.equal(bytes.includes(privateMarker), false);
    if (record.path.endsWith("-baseline.json")) {
      assert.equal(JSON.parse(bytes).observation.error.code, "ENOTFOUND");
    }
  }

  const written = await writeWildSummaryAndIndex({
    identity: {
      protocol: "stasis-post-0.3-census-v1",
      harnessCommit: "a".repeat(40),
      pairedStart: pairedStart.reference,
      runGeneration,
    },
    rules: { retries: 0, concurrency: 1 },
    cases: [{ ...item, artifactRecord }],
    summary: aggregateWildClassifications([item]),
    startedAt: "2026-08-26T00:00:00.000Z",
  });
  const index = JSON.parse(await readFile(path.join(artifactRoot, "wild", "artifact-index.json"), "utf8"));
  assert.equal(index.schema, "stasis-wild-artifact-index-v4");
  assert.deepEqual(index.cases, [artifactRecord]);
  assert.equal(path.isAbsolute(written.indexPath), false);
  assert.equal(path.isAbsolute(written.summaryPath), false);
  const summaryPath = path.join(artifactRoot, ...written.summaryPath.split("/"));
  assert.equal(await sha256File(summaryPath), index.summary.sha256);
  assertWildArtifactPrivacy(index);
  assertWildArtifactPrivacy(JSON.parse(await readFile(summaryPath, "utf8")));
  assert.match(
    index.summary.sha256,
    /^[a-f0-9]{64}$/u,
  );
  await assert.rejects(() => assertFreshWildArtifactLane(), /already exists/u);
  await assert.rejects(
    () => claimFreshWildArtifactLane({
      runGeneration,
      networkPolicySmoke: pairedStart.value.networkPolicySmoke,
      startedAt: "2026-08-26T00:00:00.001Z",
      protocol: "stasis-post-0.3-census-v1",
    }),
    /already exists/u,
  );
});

test("wild paired-start claim is atomic across concurrent runners", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-wild-claim-"));
  const artifactRoot = path.join(temporaryRoot, "run");
  const priorArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  process.env.STASIS_COMPAT_ARTIFACT_DIR = artifactRoot;
  await mkdir(artifactRoot);
  t.after(async () => {
    if (priorArtifactRoot === undefined) delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    else process.env.STASIS_COMPAT_ARTIFACT_DIR = priorArtifactRoot;
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  const runGeneration = {
    schema: "stasis-wild-run-generation-v1",
    nonceSha256: "e".repeat(64),
    artifactRootPathSha256: wildArtifactRootPathSha256(artifactRoot),
  };
  const input = {
    runGeneration,
    networkPolicySmoke: {
      path: "wild-network-policy-smoke.json",
      sha256: "f".repeat(64),
    },
    startedAt: "2026-08-26T00:00:00.000Z",
    protocol: "stasis-post-0.3-census-v1",
  };
  const outcomes = await Promise.allSettled([
    claimFreshWildArtifactLane(input),
    claimFreshWildArtifactLane(input),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
  assert.match(
    outcomes.find(({ status }) => status === "rejected").reason.message,
    /already exists/u,
  );
});

test("wild artifact lane rejects implicit and relative roots", async () => {
  const priorArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  try {
    delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    await assert.rejects(() => assertFreshWildArtifactLane(), /explicit absolute path/u);
    process.env.STASIS_COMPAT_ARTIFACT_DIR = "relative-artifacts";
    await assert.rejects(() => assertFreshWildArtifactLane(), /explicit absolute path/u);
  } finally {
    if (priorArtifactRoot === undefined) delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    else process.env.STASIS_COMPAT_ARTIFACT_DIR = priorArtifactRoot;
  }
});

test("wild run generation rejects malformed and cross-label identities", () => {
  const root = path.resolve(os.tmpdir(), "stasis-wild-generation-a");
  const valid = {
    schema: "stasis-wild-run-generation-v1",
    nonceSha256: "e".repeat(64),
    artifactRootPathSha256: wildArtifactRootPathSha256(root),
  };
  assert.deepEqual(assertWildRunGeneration(valid, root), valid);
  for (const mutate of [
    (value) => { value.nonceSha256 = "E".repeat(64); },
    (value) => { value.nonceSha256 = "e".repeat(63); },
    (value) => { value.extra = true; },
    (value) => { value.artifactRootPathSha256 = "0".repeat(64); },
  ]) {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => assertWildRunGeneration(value, root), /run generation/u);
  }
  assert.throws(
    () => assertWildRunGeneration(valid, path.resolve(os.tmpdir(), "stasis-wild-generation-b")),
    /different canonical artifact root/u,
  );
  const sameLabelA = path.resolve(os.tmpdir(), "stasis-wild-parent-a", "same-run");
  const sameLabelB = path.resolve(os.tmpdir(), "stasis-wild-parent-b", "same-run");
  const sameLabelGeneration = {
    ...valid,
    artifactRootPathSha256: wildArtifactRootPathSha256(sameLabelA),
  };
  assert.throws(
    () => assertWildRunGeneration(sameLabelGeneration, sameLabelB),
    /different canonical artifact root/u,
  );
});
