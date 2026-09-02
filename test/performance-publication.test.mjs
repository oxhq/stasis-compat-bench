import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parsePerformanceEvidenceCommand,
  runPerformanceEvidenceCli,
} from "../src/performance/evidence-cli.mjs";
import {
  assertRwaPerformanceArtifact,
  combinePerformanceEvidenceFiles,
  combinedPerformanceEvidenceJsonArtifactPath,
  combinedPerformanceEvidenceMarkdownArtifactPath,
  readCanonicalJsonFile,
  rwaPerformanceArtifactSchema,
  verifyCombinedPerformanceEvidenceFiles,
} from "../src/performance/publication.mjs";
import {
  rwaPerformanceProtocol,
  rwaPerformanceTrack,
} from "../src/performance/rwa.mjs";
import { repositoryRoot } from "../src/shared/io.mjs";

test("RWA hosted wrapper binds its identity, host, continuity, and valid raw authority", () => {
  const raw = rwaRawStub();
  const artifact = rwaArtifactStub(raw);
  let assertedRaw;
  const result = assertRwaPerformanceArtifact(artifact, {
    assertRaw(value) {
      assertedRaw = value;
      return value;
    },
  });

  assert.equal(assertedRaw, raw);
  assert.equal(result, raw);
});

test("RWA hosted wrapper rejects schema, raw, host, continuity, and privacy drift", () => {
  const cases = [
    {
      label: "extra wrapper field",
      expected: /Invalid RWA performance artifact/u,
      mutate: (value) => { value.extra = true; },
    },
    {
      label: "wrong wrapper schema",
      expected: /artifact identity/u,
      mutate: (value) => { value.schema = `${rwaPerformanceArtifactSchema}-drift`; },
    },
    {
      label: "wrong wrapper protocol",
      expected: /artifact identity/u,
      mutate: (value) => { value.protocol = `${rwaPerformanceProtocol}-drift`; },
    },
    {
      label: "wrong wrapper track",
      expected: /artifact identity/u,
      mutate: (value) => { value.track = `${rwaPerformanceTrack}-drift`; },
    },
    {
      label: "noncanonical timestamp",
      expected: /artifact identity/u,
      mutate: (value) => { value.recordedAt = "2026-09-02"; },
    },
    {
      label: "raw protocol drift",
      expected: /valid matching raw authority/u,
      mutate: (value) => { value.authorityRaw.protocol = "wrong"; },
    },
    {
      label: "invalid raw authority",
      expected: /valid matching raw authority/u,
      mutate: (value) => {
        value.authorityRaw.authority = { valid: false, status: "invalid" };
      },
    },
    {
      label: "host fact drift",
      expected: /host bindings/u,
      mutate: (value) => { value.host.facts.logicalCpuCount += 1; },
    },
    {
      label: "host class digest drift",
      expected: /host bindings/u,
      mutate: (value) => { value.host.classDigest = "a".repeat(64); },
    },
    {
      label: "host instance digest drift",
      expected: /host bindings/u,
      mutate: (value) => {
        value.host.machineInstanceSaltedDigest = "b".repeat(64);
      },
    },
    {
      label: "broken checkout continuity",
      expected: /sealed runtime continuity/u,
      mutate: (value) => {
        value.sealedRuntime.continuity.immutableCheckoutIdentity = false;
      },
    },
    {
      label: "credential-like addition",
      expected: /sensitive key/u,
      mutate: (value) => { value.identities.token = "private-value"; },
    },
  ];

  for (const item of cases) {
    const artifact = structuredClone(rwaArtifactStub(rwaRawStub()));
    item.mutate(artifact);
    assert.throws(
      () => assertRwaPerformanceArtifact(artifact, { assertRaw: (value) => value }),
      item.expected,
      item.label,
    );
  }
});

test("canonical JSON reader rejects formatting and duplicate-key ambiguity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-performance-json-"));
  try {
    const canonicalPath = path.join(root, "canonical.json");
    const compactPath = path.join(root, "compact.json");
    const duplicatePath = path.join(root, "duplicate.json");
    await Promise.all([
      writeFile(canonicalPath, `${JSON.stringify({ alpha: 1 }, null, 2)}\n`, "utf8"),
      writeFile(compactPath, '{"alpha":1}\n', "utf8"),
      writeFile(duplicatePath, '{\n  "alpha": 1,\n  "alpha": 1\n}\n', "utf8"),
    ]);

    assert.deepEqual(await readCanonicalJsonFile(canonicalPath), { alpha: 1 });
    await assert.rejects(
      () => readCanonicalJsonFile(compactPath),
      /not canonical deterministic JSON/u,
    );
    await assert.rejects(
      () => readCanonicalJsonFile(duplicatePath),
      /not canonical deterministic JSON/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hosted combine writes fixed outputs once under one fresh sealed root", async () => {
  const inputRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-performance-inputs-"));
  const outputRoot = path.join(
    repositoryRoot,
    "artifacts",
    "runs",
    `performance-publication-${process.pid}-${Date.now()}`,
  );
  const previousArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  const rwaPath = path.join(inputRoot, "rwa-raw.json");
  const crawlPath = path.join(inputRoot, "crawl-raw.json");
  const raw = rwaRawStub();
  const artifact = rwaArtifactStub(raw);
  const crawl = { marker: "crawl-raw" };
  const evidence = { schema: "test-combined-evidence-v1", status: "valid" };
  const markdown = "# Deterministic combined evidence\n";

  try {
    await Promise.all([
      writeFile(rwaPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8"),
      writeFile(crawlPath, `${JSON.stringify(crawl, null, 2)}\n`, "utf8"),
    ]);
    process.env.STASIS_COMPAT_ARTIFACT_DIR = outputRoot;
    const dependencies = {
      assertRwaArtifact(value) {
        assert.deepEqual(value, artifact);
        return value.authorityRaw;
      },
      assertCrawlRaw(value) {
        assert.deepEqual(value, crawl);
        return value;
      },
      buildEvidence(value) {
        assert.deepEqual(value, { rwaRaw: raw, crawlRaw: crawl });
        return evidence;
      },
      assertEvidence(value, raws) {
        assert.equal(value, evidence);
        assert.deepEqual(raws, { rwaRaw: raw, crawlRaw: crawl });
        return value;
      },
      renderEvidence(value) {
        assert.equal(value, evidence);
        return markdown;
      },
    };
    const result = await combinePerformanceEvidenceFiles({
      rwaArtifactPath: rwaPath,
      crawlRawPath: crawlPath,
      ...dependencies,
    });

    assert.equal(result.artifactRoot, outputRoot);
    assert.equal(
      result.evidencePath,
      path.join(outputRoot, ...combinedPerformanceEvidenceJsonArtifactPath.split("/")),
    );
    assert.equal(
      result.markdownPath,
      path.join(outputRoot, ...combinedPerformanceEvidenceMarkdownArtifactPath.split("/")),
    );
    assert.deepEqual(
      JSON.parse(await readFile(result.evidencePath, "utf8")),
      evidence,
    );
    assert.equal(await readFile(result.markdownPath, "utf8"), markdown);

    await assert.rejects(
      () => combinePerformanceEvidenceFiles({
        rwaArtifactPath: rwaPath,
        crawlRawPath: crawlPath,
        ...dependencies,
      }),
      /already exists/u,
    );
  } finally {
    if (previousArtifactRoot === undefined) {
      delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    } else {
      process.env.STASIS_COMPAT_ARTIFACT_DIR = previousArtifactRoot;
    }
    await rm(inputRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("downloaded-file verifier replays only the four explicit local files", async () => {
  const root = path.resolve("downloaded-performance-assets");
  const paths = {
    rwa: path.join(root, "rwa-raw.json"),
    crawl: path.join(root, "crawl-raw.json"),
    evidence: path.join(root, "combined-evidence.json"),
    markdown: path.join(root, "combined-evidence.md"),
  };
  const raw = rwaRawStub();
  const artifact = rwaArtifactStub(raw);
  const crawl = { marker: "crawl" };
  const evidence = { schema: "combined" };
  const markdown = "# Exact report\n";
  const jsonByPath = new Map([
    [paths.rwa, artifact],
    [paths.crawl, crawl],
    [paths.evidence, evidence],
  ]);
  const reads = [];

  const receipt = await verifyCombinedPerformanceEvidenceFiles({
    rwaArtifactPath: paths.rwa,
    crawlRawPath: paths.crawl,
    evidencePath: paths.evidence,
    markdownPath: paths.markdown,
    readJsonFile: async (filePath) => {
      reads.push(filePath);
      return jsonByPath.get(filePath);
    },
    readTextFile: async (filePath, encoding) => {
      reads.push(filePath);
      assert.equal(encoding, "utf8");
      return markdown;
    },
    assertRwaArtifact: (value) => {
      assert.equal(value, artifact);
      return raw;
    },
    assertCrawlRaw: (value) => {
      assert.equal(value, crawl);
      return value;
    },
    assertEvidence: (value, raws) => {
      assert.equal(value, evidence);
      assert.deepEqual(raws, { rwaRaw: raw, crawlRaw: crawl });
      return value;
    },
    renderEvidence: (value) => {
      assert.equal(value, evidence);
      return markdown;
    },
  });

  assert.deepEqual(reads.sort(), Object.values(paths).sort());
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.markdownReplayVerified, true);

  await assert.rejects(
    () => verifyCombinedPerformanceEvidenceFiles({
      rwaArtifactPath: paths.rwa,
      crawlRawPath: paths.crawl,
      evidencePath: paths.evidence,
      markdownPath: paths.markdown,
      readJsonFile: async (filePath) => jsonByPath.get(filePath),
      readTextFile: async () => `${markdown}drift`,
      assertRwaArtifact: () => raw,
      assertCrawlRaw: (value) => value,
      assertEvidence: (value) => value,
      renderEvidence: () => markdown,
    }),
    /does not replay exactly/u,
  );
});

test("CLI exposes one exact combine contract and one exact offline verify contract", async () => {
  const root = path.resolve("performance-cli-contract");
  const combineArgs = [
    "combine",
    path.join(root, "rwa.json"),
    path.join(root, "crawl.json"),
    path.join(repositoryRoot, "artifacts", "runs", "combined"),
  ];
  const verifyArgs = [
    "verify",
    path.join(root, "rwa.json"),
    path.join(root, "crawl.json"),
    path.join(root, "combined.json"),
    path.join(root, "combined.md"),
  ];
  assert.equal(parsePerformanceEvidenceCommand(combineArgs).command, "combine");
  assert.equal(parsePerformanceEvidenceCommand(verifyArgs).command, "verify");
  assert.throws(
    () => parsePerformanceEvidenceCommand(combineArgs.slice(0, -1)),
    /Usage:/u,
  );
  assert.throws(
    () => parsePerformanceEvidenceCommand([...verifyArgs, path.join(root, "extra")]),
    /Usage:/u,
  );
  assert.throws(
    () => parsePerformanceEvidenceCommand(["verify", "relative", ...verifyArgs.slice(2)]),
    /explicit absolute path/u,
  );

  const environment = {};
  const output = [];
  let combineInput;
  const combineReceipt = await runPerformanceEvidenceCli(combineArgs, {
    environment,
    combine: async (value) => {
      combineInput = value;
      return { evidence: { schema: "combined-schema" } };
    },
    writeOutput: (value) => output.push(value),
  });
  assert.deepEqual(combineInput, {
    rwaArtifactPath: combineArgs[1],
    crawlRawPath: combineArgs[2],
  });
  assert.equal(environment.STASIS_COMPAT_ARTIFACT_DIR, combineArgs[3]);
  assert.equal(combineReceipt.status, "passed");
  assert.equal(output.join("").includes(combineArgs[3]), false);

  let verifyInput;
  const expectedVerifyReceipt = { schema: "verification", status: "passed" };
  const verifyReceipt = await runPerformanceEvidenceCli(verifyArgs, {
    verify: async (value) => {
      verifyInput = value;
      return expectedVerifyReceipt;
    },
    writeOutput: (value) => output.push(value),
  });
  assert.deepEqual(verifyInput, {
    rwaArtifactPath: verifyArgs[1],
    crawlRawPath: verifyArgs[2],
    evidencePath: verifyArgs[3],
    markdownPath: verifyArgs[4],
  });
  assert.equal(verifyReceipt, expectedVerifyReceipt);
});

function rwaRawStub() {
  return {
    schema: "stasis-v0.3.3-performance-rwa-raw-v1",
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    host: {
      platform: "win32",
      arch: "x64",
      runnerOs: "Windows",
      imageOs: "windows-2025",
      imageVersion: "20260824.1",
      cpuModel: "Hosted CPU",
      logicalCpuCount: 4,
      identityDigest: "1".repeat(64),
      instanceDigest: "2".repeat(64),
    },
    authority: { valid: true, status: "valid" },
  };
}

function rwaArtifactStub(raw) {
  return {
    schema: rwaPerformanceArtifactSchema,
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    recordedAt: "2026-09-02T00:00:00.000Z",
    provenance: {
      harness: { revision: "3".repeat(40), tree: "4".repeat(40) },
      workflowSource: { revision: "5".repeat(40), ref: "refs/heads/performance" },
    },
    host: {
      facts: {
        platform: raw.host.platform,
        arch: raw.host.arch,
        runnerOs: raw.host.runnerOs,
        imageOs: raw.host.imageOs,
        imageVersion: raw.host.imageVersion,
        cpuModel: raw.host.cpuModel,
        logicalCpuCount: raw.host.logicalCpuCount,
      },
      classDigest: raw.host.identityDigest,
      machineInstanceSaltedDigest: raw.host.instanceDigest,
    },
    identities: { runner: "sealed-test-runner" },
    sealedRuntime: {
      startup: { status: "passed" },
      postflight: { status: "passed" },
      continuity: {
        immutableCheckoutIdentity: true,
        sameFrozenServerHostProcesses: true,
        shutdownAcknowledged: true,
      },
    },
    authorityRaw: raw,
  };
}
