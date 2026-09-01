import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertNoMachineLocalPathText,
  buildPublicationEvidence,
  validatePublicationReleaseIdentity,
  verifyPublicationEvidence,
} from "../src/publication/evidence-manifest.mjs";
import { replayPostSupportDeterministicComparisonClaims } from "../src/post-support/deterministic-lane.mjs";
import {
  projectResolvedCookieBoundaries,
  replayPostSupportRwaComparisonClaims,
} from "../src/post-support/rwa-lane.mjs";
import { extractWildAuthorityTranscript } from "../src/publication/wild-transcript.mjs";
import { aggregateWildClassifications, classifyWildCase } from "../src/wild/classification.mjs";
import { networkPolicyIdentity, protocol } from "../src/wild/config.mjs";
import { wildPairedRules } from "../src/wild/result-verifier.mjs";
import { projectPostSupportHarnessRuntime } from "../src/post-support/wild-network-smoke.mjs";

const revision = "48c5a718a9ddd63f496e45307e1484974ccf8587";
const sdkSha256 = "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec";
const sdkArchiveBytes = 181_292;
const harnessRevision = "c".repeat(40);
const exactReleaseIdentity = JSON.parse(await readFile(
  new URL("../publication/release-identity.json", import.meta.url),
  "utf8",
));

test("qualified v2 identity retains separate exact npm producer and anonymous verifier proof", () => {
  const identity = qualifiedIdentity();
  assert.equal(validatePublicationReleaseIdentity(identity), identity);
  assert.deepEqual(identity.registry.publicationProducer, {
    workflowRunId: "33523312229",
    workflowRunAttempt: 1,
    workflowRevision: "5eeb51560068566d5035e9e262f9fa7bf4ed33f8",
  });
  assert.deepEqual(identity.registry.anonymousVerification, {
    workflowRunId: "33527160165",
    workflowRunAttempt: 1,
    workflowRevision: "5174958df449aea2b5e6dec9cebefab921097d09",
    platforms: ["linux-x86_64", "macos-aarch64"],
  });
});

test("qualified v2 identity rejects role swaps, proof drift, incompleteness, and v1", () => {
  const cases = [
    {
      label: "v1 schema",
      expected: /wrong schema/u,
      mutate: (identity) => { identity.schema = "stasis-compat-benchmark-release-identity-v1"; },
    },
    {
      label: "producer verifier swap",
      expected: /immutable v0\.3\.3 contract/u,
      mutate: (identity) => {
        const producer = identity.registry.publicationProducer;
        const verifier = identity.registry.anonymousVerification;
        [producer.workflowRunId, verifier.workflowRunId] = [
          verifier.workflowRunId,
          producer.workflowRunId,
        ];
        [producer.workflowRunAttempt, verifier.workflowRunAttempt] = [
          verifier.workflowRunAttempt,
          producer.workflowRunAttempt,
        ];
        [producer.workflowRevision, verifier.workflowRevision] = [
          verifier.workflowRevision,
          producer.workflowRevision,
        ];
      },
    },
    {
      label: "zero verifier attempt",
      expected: /positive safe integer/u,
      mutate: (identity) => { identity.registry.anonymousVerification.workflowRunAttempt = 0; },
    },
    {
      label: "wrong positive producer attempt",
      expected: /immutable v0\.3\.3 contract/u,
      mutate: (identity) => { identity.registry.publicationProducer.workflowRunAttempt = 2; },
    },
    {
      label: "wrong valid SDK SHA",
      expected: /immutable v0\.3\.3 contract/u,
      mutate: (identity) => { identity.packageQualification.sdkArchiveSha256 = "a".repeat(64); },
    },
    {
      label: "malformed workflow SHA",
      expected: /workflow revision must be one exact value/u,
      mutate: (identity) => { identity.registry.publicationProducer.workflowRevision = "not-a-sha"; },
    },
    {
      label: "wrong valid verifier workflow SHA",
      expected: /immutable v0\.3\.3 contract/u,
      mutate: (identity) => {
        identity.registry.anonymousVerification.workflowRevision = "a".repeat(40);
      },
    },
    {
      label: "producer reused as verifier",
      expected: /must remain separate/u,
      mutate: (identity) => {
        identity.registry.anonymousVerification.workflowRunId =
          identity.registry.publicationProducer.workflowRunId;
        identity.registry.anonymousVerification.workflowRevision =
          identity.registry.publicationProducer.workflowRevision;
      },
    },
    {
      label: "reversed platforms",
      expected: /wrong order or values/u,
      mutate: (identity) => { identity.registry.anonymousVerification.platforms.reverse(); },
    },
    {
      label: "Node platform aliases",
      expected: /wrong order or values/u,
      mutate: (identity) => {
        identity.registry.anonymousVerification.platforms = ["linux-x64", "darwin-arm64"];
      },
    },
    {
      label: "incomplete producer",
      expected: /unexpected field set/u,
      mutate: (identity) => { delete identity.registry.publicationProducer.workflowRevision; },
    },
    {
      label: "extra registry field",
      expected: /unexpected field set/u,
      mutate: (identity) => { identity.registry.publicationWorkflowRunId = "33523312229"; },
    },
  ];
  for (const { expected, label, mutate } of cases) {
    const identity = qualifiedIdentity();
    mutate(identity);
    assert.throws(
      () => validatePublicationReleaseIdentity(identity, { requireComplete: true }),
      expected,
      label,
    );
  }
});

test("machine-local path scanner rejects Windows, UNC, and user-home evidence paths", () => {
  for (const value of [
    "C:\\private\\proof.json",
    "file:///Users/private/proof.json",
    "\\\\server\\share\\proof.json",
    "/home/private/proof.json",
    "/root/proof.json",
  ]) {
    assert.throws(() => assertNoMachineLocalPathText(value), /machine-local path/u);
  }
  assert.equal(
    assertNoMachineLocalPathText("https://example.test/home/report and typed count 20/20"),
    "https://example.test/home/report and typed count 20/20",
  );
});

test("publication builder retains the complete indexed evidence and verifies its checksums", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-publication-test-"));
  try {
    const identity = qualifiedIdentity();
    await writeFixtureEvidence(root, identity);
    const built = await buildPublicationEvidence({
      publicationRoot: root,
      releaseIdentity: identity,
      harnessRevision,
    });
    assert.equal(built.manifest.releaseIdentity.release.version, "0.3.3");
    assert.equal(built.manifest.evidence.fileCount, 515);
    assert.equal(built.manifest.reportedResults.deterministic.counts.PASS_EQUIVALENT, 20);
    assert.equal(built.manifest.reportedResults.rwa.denominator, 8);
    assert.equal(built.manifest.reportedResults.wild.selectedCount, 100);
    assert.equal(built.manifest.reportedResults.wild.primaryCounts.BASELINE_FAILURE, 100);
    const verified = await verifyPublicationEvidence(root, {
      expectedHarnessRevision: harnessRevision,
      expectedReleaseIdentity: identity,
    });
    assert.equal(verified.manifestSha256, built.manifestSha256);
    assert.equal(verified.checksumsSha256, built.checksumsSha256);
    await assert.rejects(
      () => verifyPublicationEvidence(root),
      /requires one external harness revision/u,
    );
    await assert.rejects(
      () => verifyPublicationEvidence(root, {
        expectedHarnessRevision: "d".repeat(40),
        expectedReleaseIdentity: identity,
      }),
      /expected public harness revision/u,
    );
    const sums = await readFile(path.join(root, "SHA256SUMS.txt"), "utf8");
    assert.match(sums, /evidence\/wild\/raw\/100-stasis\.json/u);
    assert.match(sums, /evidence-manifest\.json/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication builder rejects every payload outside the exact 515-file evidence inventory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-publication-extra-evidence-"));
  try {
    const identity = qualifiedIdentity();
    await writeFixtureEvidence(root, identity);
    await writeJson(path.join(root, "evidence", "unindexed-extra.json"), {
      schema: "invented-extra-v1",
    });
    await assert.rejects(
      () => buildPublicationEvidence({
        publicationRoot: root,
        releaseIdentity: identity,
        harnessRevision,
      }),
      /inventory has unexpected files/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication builder rejects candidate identity splices outside the release subset", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-publication-candidate-splice-"));
  try {
    const identity = qualifiedIdentity();
    await writeFixtureEvidence(root, identity);
    const rawPath = path.join(root, "evidence", "deterministic-stasis-raw.json");
    const originalBytes = await readFile(rawPath);
    const cases = [
      ["Windows ZIP SHA-256", (candidate) => { candidate.windows.zip.sha256 = "a".repeat(64); }],
      ["Windows ZIP bytes", (candidate) => { candidate.windows.zip.bytes += 1; }],
      [
        "Windows executable SHA-256",
        (candidate) => { candidate.windows.executable.sha256 = "a".repeat(64); },
      ],
      ["Windows executable bytes", (candidate) => { candidate.windows.executable.bytes += 1; }],
      ["SDK proof SHA-256", (candidate) => { candidate.sdk.proof.sha256 = "a".repeat(64); }],
      ["SDK proof bytes", (candidate) => { candidate.sdk.proof.bytes += 1; }],
      ["SDK tree SHA-256", (candidate) => { candidate.sdk.tree.sha256 = "a".repeat(64); }],
      ["SDK tree file count", (candidate) => { candidate.sdk.tree.fileCount += 1; }],
      ["SDK tree total bytes", (candidate) => { candidate.sdk.tree.totalBytes += 1; }],
    ];
    for (const [label, mutate] of cases) {
      const raw = JSON.parse(originalBytes);
      mutate(raw.candidate);
      await writeFile(rawPath, canonicalJsonBytes(raw));
      await assert.rejects(
        () => buildPublicationEvidence({
          publicationRoot: root,
          releaseIdentity: identity,
          harnessRevision,
        }),
        /candidate identity differs from authoritative candidate verification/u,
        label,
      );
      await writeFile(rawPath, originalBytes);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication builder requires and semantically binds the wild transcript evidence", async () => {
  const cases = [
    {
      label: "missing-transcript",
      expected: /inventory is incomplete/u,
      mutate: async (root) => {
        await rm(path.join(root, "evidence", "wild-stdout-transcript.log"));
      },
    },
    {
      label: "receipt",
      expected: /receipt differs/u,
      mutate: async (root) => {
        const receiptPath = path.join(
          root,
          "evidence",
          "wild-authority-extraction-receipt.json",
        );
        const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
        receipt.documents.finalAuthorityOffsetBytes += 1;
        await writeFile(receiptPath, canonicalJsonBytes(receipt));
      },
    },
    {
      label: "authority-bytes",
      expected: /authority bytes differ/u,
      mutate: async (root) => {
        const authorityPath = path.join(root, "evidence", "wild-authority.json");
        const authority = JSON.parse(await readFile(authorityPath, "utf8"));
        await writeFile(authorityPath, `${JSON.stringify(authority)}\n`, "utf8");
      },
    },
    {
      label: "transcript-extra-bytes",
      expected: /extra bytes/u,
      mutate: async (root) => {
        const transcriptPath = path.join(root, "evidence", "wild-stdout-transcript.log");
        const transcript = await readFile(transcriptPath);
        await writeFile(transcriptPath, Buffer.concat([transcript, Buffer.from("\n")]));
      },
    },
  ];
  for (const { expected, label, mutate } of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), `stasis-publication-${label}-`));
    try {
      const identity = qualifiedIdentity();
      await writeFixtureEvidence(root, identity);
      await mutate(root);
      await assert.rejects(
        () => buildPublicationEvidence({
          publicationRoot: root,
          releaseIdentity: identity,
          harnessRevision,
        }),
        expected,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("publication builder replays comparison claims from valid retained raw evidence", async () => {
  const cases = [
    {
      label: "deterministic-claim-drift",
      expected: /deterministic comparison differs from baseline-plus-candidate replay/u,
      mutate: async (root) => {
        const filePath = path.join(root, "evidence", "deterministic-comparison.json");
        const comparison = JSON.parse(await readFile(filePath, "utf8"));
        comparison.counts.PASS_EQUIVALENT -= 1;
        await writeFile(filePath, canonicalJsonBytes(comparison));
      },
    },
    {
      label: "rwa-claim-drift",
      expected: /RWA comparison differs from baseline-plus-candidate replay/u,
      mutate: async (root) => {
        const filePath = path.join(root, "evidence", "rwa-comparison.json");
        const comparison = JSON.parse(await readFile(filePath, "utf8"));
        comparison.counts.PASS_WITH_SEMANTIC_DIFFERENCE -= 1;
        await writeFile(filePath, canonicalJsonBytes(comparison));
      },
    },
    {
      label: "rwa-cookie-boundary-drift",
      expected: /RWA resolved boundaries differ from retained cookie proof/u,
      mutate: async (root) => {
        const filePath = path.join(root, "evidence", "rwa-comparison.json");
        const comparison = JSON.parse(await readFile(filePath, "utf8"));
        comparison.resolvedBoundaries[0].persistentRestorePassed = false;
        await writeFile(filePath, canonicalJsonBytes(comparison));
      },
    },
    {
      label: "unsealed-rwa-raw",
      expected: /Invalid post-support sealed RWA runtime binding/u,
      mutate: async (root) => {
        const filePath = path.join(root, "evidence", "rwa-stasis-raw.json");
        const raw = JSON.parse(await readFile(filePath, "utf8"));
        raw.runtimeAuthority.authoritative = false;
        await writeFile(filePath, canonicalJsonBytes(raw));
      },
    },
  ];
  for (const { expected, label, mutate } of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), `stasis-publication-${label}-`));
    try {
      const identity = qualifiedIdentity();
      await writeFixtureEvidence(root, identity);
      await mutate(root);
      await assert.rejects(
        () => buildPublicationEvidence({
          publicationRoot: root,
          releaseIdentity: identity,
          harnessRevision,
        }),
        expected,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("publication builder rejects resealed wild replay contradictions and identity drift", async () => {
  const cases = [
    {
      label: "raw",
      expected: /classification differs from raw records at slot 1/u,
      mutate: async (root) => {
        const filePath = path.join(
          root,
          "evidence",
          "wild",
          "raw",
          "001-baseline-gate.json",
        );
        const value = JSON.parse(await readFile(filePath, "utf8"));
        value.gate.code = "resealed_baseline_gate_not_allowed";
        await writeFile(filePath, canonicalJsonBytes(value));
      },
    },
    {
      label: "classification",
      expected: /classification differs from raw records at slot 1/u,
      mutate: async (root) => {
        const filePath = path.join(
          root,
          "evidence",
          "wild",
          "cases",
          "001-classification.json",
        );
        const value = JSON.parse(await readFile(filePath, "utf8"));
        value.classification.reason = "resealed_classification_claim";
        await writeFile(filePath, canonicalJsonBytes(value));
      },
    },
    {
      label: "summary",
      expected: /summary differs from its 100 raw cases/u,
      mutate: async (root) => {
        const filePath = path.join(root, "evidence", "wild", "summary.json");
        const value = JSON.parse(await readFile(filePath, "utf8"));
        value.summary.baselineExcluded -= 1;
        await writeFile(filePath, canonicalJsonBytes(value));
      },
    },
    {
      label: "corpus",
      expected: /tracked corpus or public harness revision/u,
      mutate: async (root) => {
        const filePath = path.join(root, "evidence", "wild", "artifact-index.json");
        const value = JSON.parse(await readFile(filePath, "utf8"));
        value.identity.corpusSha256 = "e".repeat(64);
        await writeFile(filePath, canonicalJsonBytes(value));
      },
    },
    {
      label: "runtime",
      expected: /tracked corpus or public harness revision/u,
      mutate: async (root) => {
        const filePath = path.join(root, "evidence", "wild", "artifact-index.json");
        const value = JSON.parse(await readFile(filePath, "utf8"));
        value.identity.runtime.nodeExecutableSha256 = "e".repeat(64);
        await writeFile(filePath, canonicalJsonBytes(value));
      },
    },
  ];
  for (const { expected, label, mutate } of cases) {
    const root = await mkdtemp(path.join(os.tmpdir(), `stasis-publication-wild-${label}-`));
    try {
      const identity = qualifiedIdentity();
      await writeFixtureEvidence(root, identity);
      await mutate(root);
      await resealWildEvidence(root);
      await assert.rejects(
        () => buildPublicationEvidence({
          publicationRoot: root,
          releaseIdentity: identity,
          harnessRevision,
        }),
        expected,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-publication-wild-harness-"));
  try {
    const identity = qualifiedIdentity();
    await writeFixtureEvidence(root, identity);
    await assert.rejects(
      () => buildPublicationEvidence({
        publicationRoot: root,
        releaseIdentity: identity,
        harnessRevision: "f".repeat(40),
      }),
      /tracked corpus or public harness revision/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function qualifiedIdentity() {
  return structuredClone(exactReleaseIdentity);
}

async function writeFixtureEvidence(root, identity) {
  const evidenceRoot = path.join(root, "evidence");
  const wildRoot = path.join(evidenceRoot, "wild");
  const [
    deterministicBaselineBytes,
    rwaBaselineBytes,
    cookieMinimizerBytes,
    deterministicRawBytes,
    rwaRawBytes,
  ] = await Promise.all([
    readFile(new URL(
      "./fixtures/deterministic-v03/stasis-post-0.3-census-v1/deterministic/playwright-raw.json",
      import.meta.url,
    )),
    readFile(new URL("./fixtures/publication/rwa-cypress-raw.json", import.meta.url)),
    readFile(new URL("./fixtures/publication/cookie-minimizers.json", import.meta.url)),
    readFile(new URL("./fixtures/publication/deterministic-stasis-raw.json", import.meta.url)),
    readFile(new URL("./fixtures/publication/rwa-stasis-raw.json", import.meta.url)),
  ]);
  const deterministicBaseline = JSON.parse(deterministicBaselineBytes);
  const rwaBaseline = JSON.parse(rwaBaselineBytes);
  const cookieMinimizers = JSON.parse(cookieMinimizerBytes);
  const deterministicRaw = JSON.parse(deterministicRawBytes);
  const rwaRaw = JSON.parse(rwaRawBytes);
  assert.deepEqual(deterministicRaw.candidate, rwaRaw.candidate);
  assert.deepEqual(deterministicRaw.candidate, cookieMinimizers.candidate);
  const candidate = deterministicRaw.candidate;
  await Promise.all([
    mkdir(path.join(wildRoot, "cases"), { recursive: true }),
    mkdir(path.join(wildRoot, "raw"), { recursive: true }),
  ]);
  const wildCandidate = {
    ...candidate,
    schema: "stasis-post-support-wild-candidate-v1",
    hostedSdkPackageTrain: {
      source: "github_actions_package_workflow",
      runNumber: Number(identity.packageQualification.workflowRunId),
      attemptNumber: identity.packageQualification.workflowRunAttempt,
    },
  };
  const deterministic = {
    schema: "stasis-post-support-deterministic-comparison-v1",
    protocol: deterministicRaw.protocol,
    track: deterministicRaw.track,
    candidate,
    ...replayPostSupportDeterministicComparisonClaims(
      deterministicBaseline,
      deterministicRaw,
    ),
  };
  const { corpusBinding: rwaCorpusBinding, ...rwaClaims } =
    replayPostSupportRwaComparisonClaims(rwaBaseline, rwaRaw);
  const rwa = {
    schema: "stasis-post-support-rwa-comparison-v1",
    protocol: rwaRaw.protocol,
    track: rwaRaw.track,
    candidate,
    corpusBinding: rwaCorpusBinding,
    resolvedBoundaries: projectResolvedCookieBoundaries(cookieMinimizers),
    ...rwaClaims,
  };
  await Promise.all([
    writeJson(path.join(evidenceRoot, "candidate-verification.json"), {
      schema: "stasis-post-support-candidate-verification-v1",
      status: "passed",
      candidate,
    }),
    writeFile(
      path.join(evidenceRoot, "cookie-minimizers.json"),
      cookieMinimizerBytes,
      { flag: "wx" },
    ),
    writeJson(path.join(evidenceRoot, "deterministic-comparison.json"), deterministic),
    writeFile(
      path.join(evidenceRoot, "deterministic-playwright-raw.json"),
      deterministicBaselineBytes,
      { flag: "wx" },
    ),
    writeFile(
      path.join(evidenceRoot, "deterministic-stasis-raw.json"),
      deterministicRawBytes,
      { flag: "wx" },
    ),
    writeJson(path.join(evidenceRoot, "rwa-comparison.json"), rwa),
    writeFile(
      path.join(evidenceRoot, "rwa-cypress-raw.json"),
      rwaBaselineBytes,
      { flag: "wx" },
    ),
    writeFile(
      path.join(evidenceRoot, "rwa-stasis-raw.json"),
      rwaRawBytes,
      { flag: "wx" },
    ),
  ]);

  const startedAt = "2026-08-30T00:00:00.000Z";
  const completedAt = "2026-08-30T00:00:01.000Z";
  const runGeneration = {
    schema: "stasis-wild-run-generation-v1",
    nonceSha256: "a".repeat(64),
    artifactRootPathSha256: "b".repeat(64),
  };
  const [corpusBytes, preflightLedgerBytes] = await Promise.all([
    readFile(new URL("../corpora/wild-tranco-74V4X-v1.json", import.meta.url)),
    readFile(new URL("../corpora/wild-tranco-74V4X-v1-preflight.json", import.meta.url)),
  ]);
  const corpus = JSON.parse(corpusBytes);
  const preflightLedger = JSON.parse(preflightLedgerBytes);
  const runtime = {
    ...projectPostSupportHarnessRuntime(preflightLedger.runtime),
    chromiumInstallationTree: {
      sha256: "d".repeat(64),
      fileCount: 1,
      totalBytes: 1,
    },
  };
  const smokeReference = await writeReference(
    root,
    "evidence/wild-network-policy-smoke.json",
    fixtureNetworkPolicySmoke({
      candidate: wildCandidate,
      corpus,
      corpusBytes,
      preflightLedgerBytes,
      runGeneration,
      runtime,
    }),
    "wild-network-policy-smoke.json",
  );
  const pairedRun = {
    schema: "stasis-wild-paired-start-v1",
    protocol,
    startedAt,
    nonceSha256: "c".repeat(64),
    networkPolicySmoke: smokeReference,
    runGeneration,
  };
  const pairedStartReference = await writeReference(
    root,
    "evidence/wild/paired-start.json",
    pairedRun,
    "wild/paired-start.json",
  );
  const identityRecord = {
    schema: "stasis-post-support-wild-artifact-identity-v1",
    protocol,
    harnessCommit: harnessRevision,
    preregistrationCommit: corpus.preregistrationCommit,
    corpusPath: "corpora/wild-tranco-74V4X-v1.json",
    corpusSha256: sha256(corpusBytes),
    preflightLedgerPath: `corpora/${corpus.selection.preflightLedger}`,
    preflightLedgerSha256: sha256(preflightLedgerBytes),
    exactTrackedBytesVerified: true,
    executionAuthority: "default_verified_candidate_uninjected",
    candidate: wildCandidate,
    runtime,
    networkPolicySmoke: smokeReference,
    pairedStart: pairedStartReference,
    runGeneration,
  };

  const cases = [];
  const replayCases = [];
  for (let offset = 0; offset < corpus.urls.length; offset += 1) {
    const slot = offset + 1;
    const entry = corpus.urls[offset];
    const prefix = String(slot).padStart(3, "0");
    const item = {
      entry,
      baselineGate: { status: "not_run", code: "fixture_baseline_gate_not_allowed" },
      baseline: { status: "not_run", code: "fixture_baseline_not_run" },
      stasisGate: { status: "not_run", code: "fixture_stasis_gate_not_run" },
      stasis: { status: "not_run", code: "fixture_stasis_not_run" },
    };
    const classification = classifyWildCase(item);
    const records = [
      await writeReference(
        root,
        `evidence/wild/raw/${prefix}-baseline-gate.json`,
        {
          schema: "stasis-wild-baseline-gate-raw-v3",
          entry,
          pairedRun,
          gate: item.baselineGate,
        },
        `wild/raw/${prefix}-baseline-gate.json`,
      ),
      await writeReference(
        root,
        `evidence/wild/raw/${prefix}-baseline.json`,
        {
          schema: "stasis-wild-baseline-raw-v3",
          entry,
          pairedRun,
          observation: item.baseline,
        },
        `wild/raw/${prefix}-baseline.json`,
      ),
      await writeReference(
        root,
        `evidence/wild/raw/${prefix}-stasis-gate.json`,
        {
          schema: "stasis-wild-stasis-gate-raw-v3",
          entry,
          pairedRun,
          gate: item.stasisGate,
        },
        `wild/raw/${prefix}-stasis-gate.json`,
      ),
      await writeReference(
        root,
        `evidence/wild/raw/${prefix}-stasis.json`,
        {
          schema: "stasis-wild-stasis-raw-v3",
          entry,
          pairedRun,
          observation: item.stasis,
        },
        `wild/raw/${prefix}-stasis.json`,
      ),
      await writeReference(
        root,
        `evidence/wild/cases/${prefix}-classification.json`,
        {
          schema: "stasis-wild-case-classification-v3",
          entry,
          pairedRun,
          classification,
        },
        `wild/cases/${prefix}-classification.json`,
      ),
    ];
    cases.push({ slot, rank: entry.rank, records });
    replayCases.push({ ...item, classification });
  }
  const wildSummary = aggregateWildClassifications(replayCases);
  const summaryReference = await writeReference(
    root,
    "evidence/wild/summary.json",
    {
      schema: "stasis-wild-summary-v4",
      protocol,
      identity: identityRecord,
      rules: wildPairedRules,
      startedAt,
      completedAt,
      summary: wildSummary,
    },
    "wild/summary.json",
  );

  const indexPath = path.join(wildRoot, "artifact-index.json");
  const index = {
    schema: "stasis-wild-artifact-index-v4",
    protocol,
    selectedCount: 100,
    summary: summaryReference,
    identity: identityRecord,
    rules: wildPairedRules,
    startedAt,
    completedAt,
    cases,
  };
  await writeJson(indexPath, index);
  const indexSha256 = sha256(await readFile(indexPath));
  const authority = {
    schema: "stasis-post-support-wild-authority-v1",
    status: "passed",
    protocol: "stasis-post-0.3-census-v1",
    authority: "quiescent_postflight_verified",
    caseCount: 100,
    artifactIndexSha256: indexSha256,
    candidate: wildCandidate,
    summary: wildSummary,
  };
  await writeWildTranscriptEvidence(root, index, authority);
}

function fixtureNetworkPolicySmoke({
  candidate,
  corpus,
  corpusBytes,
  preflightLedgerBytes,
  runGeneration,
  runtime,
}) {
  return {
    schema: "stasis-post-support-wild-network-policy-smoke-v1",
    protocol,
    status: "passed",
    executionAuthority: "default_verified_candidate_uninjected",
    runGeneration,
    startedAt: "2026-08-29T23:59:58.000Z",
    completedAt: "2026-08-29T23:59:59.000Z",
    harnessCommit: harnessRevision,
    preregistrationCommit: corpus.preregistrationCommit,
    corpusSha256: sha256(corpusBytes),
    preflightLedgerSha256: sha256(preflightLedgerBytes),
    runtime,
    candidate,
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

async function writeWildTranscriptEvidence(root, index, authority, { replace = false } = {}) {
  const evidenceRoot = path.join(root, "evidence");
  const transcriptPath = path.join(evidenceRoot, "wild-stdout-transcript.log");
  const authorityOutputPath = path.join(evidenceRoot, "wild-authority.json");
  const receiptPath = path.join(evidenceRoot, "wild-authority-extraction-receipt.json");
  if (replace) {
    await Promise.all([
      rm(transcriptPath),
      rm(authorityOutputPath),
      rm(receiptPath),
    ]);
  }
  await writeFile(
    transcriptPath,
    Buffer.concat([
      canonicalJsonBytes({
        schema: "stasis-post-support-wild-smoke-run-v1",
        status: "passed",
        artifact: index.identity.networkPolicySmoke,
      }),
      canonicalJsonBytes({
        schema: "stasis-post-support-wild-artifacts-v1",
        protocol,
        authority: "requires_separate_quiescent_postflight_verification",
        candidate: authority.candidate,
        artifactIndex: "wild/artifact-index.json",
        summaryArtifact: "wild/summary.json",
        caseCount: 100,
        rawRecordCount: 500,
        summary: authority.summary,
      }),
      canonicalJsonBytes(authority),
    ]),
    { flag: "wx" },
  );
  await extractWildAuthorityTranscript({
    transcriptPath,
    authorityOutputPath,
    receiptPath,
  });
}

async function resealWildEvidence(root) {
  const evidenceRoot = path.join(root, "evidence");
  const indexPath = path.join(evidenceRoot, "wild", "artifact-index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const references = [
    index.identity.networkPolicySmoke,
    index.identity.pairedStart,
    index.summary,
    ...index.cases.flatMap((item) => item.records),
  ];
  for (const reference of references) {
    reference.sha256 = sha256(await readFile(path.join(evidenceRoot, ...reference.path.split("/"))));
  }
  await writeFile(indexPath, canonicalJsonBytes(index));

  const authorityPath = path.join(evidenceRoot, "wild-authority.json");
  const summaryEnvelope = JSON.parse(
    await readFile(path.join(evidenceRoot, "wild", "summary.json"), "utf8"),
  );
  const authority = JSON.parse(await readFile(authorityPath, "utf8"));
  authority.artifactIndexSha256 = sha256(await readFile(indexPath));
  authority.summary = summaryEnvelope.summary;
  await writeWildTranscriptEvidence(root, index, authority, { replace: true });
}

async function writeReference(root, publicationPath, value, indexedPath) {
  const absolutePath = path.join(root, ...publicationPath.split("/"));
  await writeJson(absolutePath, value);
  return { path: indexedPath, sha256: sha256(await readFile(absolutePath)) };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}
