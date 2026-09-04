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
import { cleanHarnessWorktreeEvidence } from "../src/performance/harness-worktree.mjs";
import {
  postSupportNodeVersion,
  postSupportProfile,
  postSupportRevision,
  postSupportVersion,
} from "../src/post-support/candidate-identity.mjs";
import { rwaAuthSource } from "../src/rwa/cases.mjs";
import { rwaBaselineExpected } from "../src/rwa/run-cypress.mjs";
import {
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "../src/rwa/runtime-identity.mjs";
import { repositoryRoot } from "../src/shared/io.mjs";
import { FROZEN_IDENTITIES } from "../src/shared/manifest.mjs";

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
      label: "dirty harness provenance",
      expected: /clean-worktree evidence/u,
      mutate: (value) => { value.provenance.harness.worktree.clean = false; },
    },
    {
      label: "noncanonical workflow attempt",
      expected: /workflow-source provenance/u,
      mutate: (value) => { value.provenance.workflowSource.runAttempt = "01"; },
    },
    {
      label: "Node executable substitution",
      expected: /Node identity/u,
      mutate: (value) => { value.identities.node.executableSha256 = "a".repeat(64); },
    },
    {
      label: "Cypress package substitution",
      expected: /Cypress or Electron identity/u,
      mutate: (value) => { value.identities.cypress.packageVersion = "15.17.1"; },
    },
    {
      label: "Cypress executable-byte substitution",
      expected: /Cypress or Electron identity/u,
      mutate: (value) => { value.identities.cypress.installed.executable.bytes += 1; },
    },
    {
      label: "Cypress runtime-tree substitution",
      expected: /Cypress or Electron identity/u,
      mutate: (value) => { value.identities.cypress.installed.cypressRuntimeTree.sha256 = "0".repeat(64); },
    },
    {
      label: "RWA tree substitution",
      expected: /checkout identity/u,
      mutate: (value) => { value.identities.rwa.tree = "a".repeat(40); },
    },
    {
      label: "Stasis candidate substitution",
      expected: /candidate differs/u,
      mutate: (value) => { value.identities.stasis.candidate.windows.zip.sha256 = "a".repeat(64); },
    },
    {
      label: "Stasis runtime substitution",
      expected: /runtime differs/u,
      mutate: (value) => { value.identities.stasis.runtime.stasisRevision = "a".repeat(40); },
    },
    {
      label: "broken checkout continuity",
      expected: /sealed runtime continuity/u,
      mutate: (value) => {
        value.sealedRuntime.continuity.immutableCheckoutIdentity = false;
      },
    },
    {
      label: "both-invalid checkout continuity",
      expected: /startup phase is not valid/u,
      mutate: (value) => {
        value.sealedRuntime.startup.checkout.valid = false;
        value.sealedRuntime.startup.checkout.violations = ["drift"];
        value.sealedRuntime.postflight.checkout.valid = false;
        value.sealedRuntime.postflight.checkout.violations = ["drift"];
      },
    },
    {
      label: "checkout bytes drift behind a true flag",
      expected: /checkout differs from its frozen identity/u,
      mutate: (value) => {
        value.sealedRuntime.postflight.checkout.revision = "f".repeat(40);
      },
    },
    {
      label: "identical checkout drift in both retained phases",
      expected: /checkout differs from its frozen identity/u,
      mutate: (value) => {
        value.sealedRuntime.startup.checkout.revision = "f".repeat(40);
        value.sealedRuntime.postflight.checkout.revision = "f".repeat(40);
      },
    },
    {
      label: "identical incomplete server evidence in both retained phases",
      expected: /servers differ from their frozen identity/u,
      mutate: (value) => {
        value.sealedRuntime.startup.servers = [{ name: "frontend" }, { name: "backend" }];
        value.sealedRuntime.postflight.servers = [{ name: "frontend" }, { name: "backend" }];
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

test("RWA wrapper continuity accepts only the declared database newline transition", () => {
  const artifact = rwaArtifactStub(rwaRawStub());
  artifact.sealedRuntime.postflight.checkout.trackedStatusEntries = [
    ` M ${rwaBaselineExpected.databasePath}`,
  ];
  artifact.sealedRuntime.postflight.checkout.runtimeDatabase = {
    ...artifact.sealedRuntime.postflight.checkout.runtimeDatabase,
    worktreeSha256: "ce499607bd4d1851353aca0e79b95fd737aa15755fd12d0e10b02af71dd48920",
    newlineOnlyDifference: true,
    allowedRuntimeMutation: true,
  };
  assert.doesNotThrow(
    () => assertRwaPerformanceArtifact(artifact, { assertRaw: (value) => value }),
  );

  artifact.sealedRuntime.postflight.checkout.trackedStatusEntries = [" M arbitrary.txt"];
  assert.throws(
    () => assertRwaPerformanceArtifact(artifact, { assertRaw: (value) => value }),
    /sealed runtime continuity/u,
  );

  const wrongCleanHash = rwaArtifactStub(rwaRawStub());
  wrongCleanHash.sealedRuntime.postflight.checkout.runtimeDatabase.worktreeSha256 = "9".repeat(64);
  assert.throws(
    () => assertRwaPerformanceArtifact(wrongCleanHash, { assertRaw: (value) => value }),
    /sealed runtime continuity/u,
  );

  const reverseTransition = rwaArtifactStub(rwaRawStub());
  reverseTransition.sealedRuntime.startup.checkout.trackedStatusEntries = [
    ` M ${rwaBaselineExpected.databasePath}`,
  ];
  reverseTransition.sealedRuntime.startup.checkout.runtimeDatabase = {
    ...reverseTransition.sealedRuntime.startup.checkout.runtimeDatabase,
    worktreeSha256: "ce499607bd4d1851353aca0e79b95fd737aa15755fd12d0e10b02af71dd48920",
    newlineOnlyDifference: true,
    allowedRuntimeMutation: true,
  };
  assert.throws(
    () => assertRwaPerformanceArtifact(reverseTransition, { assertRaw: (value) => value }),
    /sealed runtime continuity/u,
  );
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
  const identities = rwaIdentitiesStub();
  return {
    schema: rwaPerformanceArtifactSchema,
    protocol: rwaPerformanceProtocol,
    track: rwaPerformanceTrack,
    recordedAt: "2026-09-02T00:00:00.000Z",
    provenance: {
      harness: {
        revision: "3".repeat(40),
        tree: "4".repeat(40),
        worktree: structuredClone(cleanHarnessWorktreeEvidence),
      },
      workflowSource: {
        provider: "github-actions",
        repository: "oxhq/stasis",
        workflow: "Stasis v0.3.3 performance evidence",
        job: "windows-rwa",
        revision: "5".repeat(40),
        ref: "refs/heads/performance",
        runId: "33840000000",
        runAttempt: "1",
      },
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
    identities,
    sealedRuntime: {
      startup: {
        checkout: checkoutStub(),
        servers: serverStubs(identities),
      },
      postflight: {
        checkout: checkoutStub(),
        servers: serverStubs(identities),
      },
      continuity: {
        immutableCheckoutIdentity: true,
        sameFrozenServerHostProcesses: true,
        shutdownAcknowledged: true,
      },
    },
    authorityRaw: raw,
  };
}

function checkoutStub() {
  return {
    valid: true,
    violations: [],
    revision: rwaAuthSource.revision,
    tree: rwaBaselineExpected.tree,
    detached: true,
    authSpec: {
      blobOid: rwaAuthSource.specBlobOid,
      blobSha256: rwaAuthSource.specBlobSha256,
      worktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
    },
    seed: {
      blobOid: rwaBaselineExpected.seed.blobOid,
      blobSha256: rwaBaselineExpected.seed.blobSha256,
      worktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
    },
    generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
    runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
    localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
    ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
    trackedStatusEntries: [],
    runtimeDatabase: {
      blobOid: rwaBaselineExpected.seed.blobOid,
      blobSha256: rwaBaselineExpected.seed.blobSha256,
      worktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
      newlineOnlyDifference: false,
      allowedRuntimeMutation: false,
    },
  };
}

function serverStubs(identities) {
  const listener = (port, scriptRole) => ({
    port,
    processName: "node.exe",
    nodeVersion: identities.node.version,
    executableBytes: identities.node.executableBytes,
    executableSha256: identities.node.executableSha256,
    launcherMatchesFrozenHost: true,
    commandMatchesPinnedRole: true,
    scriptRole,
  });
  return [
    {
      name: "frontend",
      url: `${identities.rwa.endpoints.appOrigin}/`,
      status: 200,
      contentType: identities.rwa.serverBodies.frontend.contentType,
      bodyBytes: identities.rwa.serverBodies.frontend.bytes,
      bodySha256: identities.rwa.serverBodies.frontend.sha256,
      listener: listener(3000, "scripts/testServer.ts"),
      servedBuildTree: structuredClone(identities.rwa.buildTree),
      generatedRuntimeFiles: structuredClone(RWA_GENERATED_RUNTIME_IDENTITY),
      runtimeCache: structuredClone(RWA_RUNTIME_CACHE_IDENTITY),
      localEnvironmentFiles: structuredClone(RWA_LOCAL_ENV_IDENTITY),
      ambientOverrides: structuredClone(RWA_AMBIENT_OVERRIDE_IDENTITY),
    },
    {
      name: "backend",
      url: `${identities.rwa.endpoints.apiOrigin}/`,
      status: 200,
      contentType: identities.rwa.serverBodies.backend.contentType,
      bodyBytes: identities.rwa.serverBodies.backend.bytes,
      bodySha256: identities.rwa.serverBodies.backend.sha256,
      listener: listener(3001, "backend/app.ts"),
    },
  ];
}

function rwaIdentitiesStub() {
  return {
    node: {
      version: postSupportNodeVersion,
      executableSha256: rwaBaselineExpected.nodeExecutable.sha256,
      executableBytes: rwaBaselineExpected.nodeExecutable.bytes,
    },
    cypress: {
      packageVersion: rwaBaselineExpected.cypressVersion,
      browserName: "electron",
      browserVersion: rwaBaselineExpected.electronVersion,
      resolvedNodeVersion: rwaBaselineExpected.resolvedNodeVersion,
      viewport: structuredClone(rwaBaselineExpected.viewport),
      retries: structuredClone(rwaBaselineExpected.primaryRetries),
      installed: {
        nodeModulesTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.nodeModulesTree),
        cypressPackageTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.cypressPackageTree),
        tsNodePackageTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.tsNodePackageTree),
        cypressRuntimeTree: structuredClone(FROZEN_IDENTITIES.rwa.installed.cypressRuntimeTree),
        executable: {
          bytes: FROZEN_IDENTITIES.rwa.installed.cypressExecutableBytes,
          sha256: FROZEN_IDENTITIES.rwa.installed.cypressExecutableSha256,
        },
      },
    },
    rwa: {
      repository: rwaAuthSource.repository,
      revision: rwaAuthSource.revision,
      tree: rwaBaselineExpected.tree,
      specBlobOid: rwaAuthSource.specBlobOid,
      specBlobSha256: rwaAuthSource.specBlobSha256,
      specWorktreeSha256: rwaAuthSource.windowsCrlfWorktreeSha256,
      seedBlobOid: rwaBaselineExpected.seed.blobOid,
      seedBlobSha256: rwaBaselineExpected.seed.blobSha256,
      seedWorktreeSha256: rwaBaselineExpected.seed.worktreeSha256,
      buildTree: structuredClone(rwaBaselineExpected.buildTree),
      serverBodies: structuredClone(rwaBaselineExpected.serverBodies),
      endpoints: {
        appOrigin: rwaBaselineExpected.baseUrl,
        apiOrigin: rwaBaselineExpected.apiUrl,
      },
    },
    stasis: {
      candidate: {
        schema: "stasis-post-support-candidate-identity-v1",
        repository: "oxhq/stasis",
        revision: postSupportRevision,
        version: postSupportVersion,
        profile: postSupportProfile,
        hostedSdkPackageTrain: {
          source: "github_actions_package_workflow",
          id: 33_506_181_780,
          attempt: 1,
        },
        windows: {
          source: "github_actions_package_workflow_ci_only_bundle",
          zip: {
            sha256: "5e95ed4123ee2b03d579313bae637cb35e3050114377072c603b0b5cbd1d217b",
            bytes: 37_188_148,
          },
          executable: {
            sha256: "e12230ec8659775353af50fed0d98fbaad0c2888143baf37667c90d469e738d9",
            bytes: 87_334_400,
          },
        },
        sdk: {
          source: "hosted_package_train",
          archive: {
            sha256: "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec",
            bytes: 181_292,
          },
          proof: {
            sha256: "ec6df3f07f3a27f16bf9fb91b5c2b09daf796bd8f2aed455f6879598f06b9ba4",
            bytes: 10_695,
          },
          tree: {
            sha256: "20f52ace92961030f8dc5d2743d941eb3445a86949097b194ec97312f5eface8",
            fileCount: 55,
            totalBytes: 896_631,
          },
        },
      },
      runtime: {
        implementationName: "stasis-shell",
        implementationVersion: postSupportVersion,
        stasisRevision: postSupportRevision,
        v2ProfileAdvertised: true,
      },
    },
  };
}
