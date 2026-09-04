import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPublicationReleaseArtifacts,
  publicationReleaseContract,
  verifyPublicationReleaseArtifacts,
} from "../src/publication/archive.mjs";
import { replayPostSupportDeterministicComparisonClaims } from "../src/post-support/deterministic-lane.mjs";
import {
  projectResolvedCookieBoundaries,
  replayPostSupportRwaComparisonClaims,
} from "../src/post-support/rwa-lane.mjs";
import { buildPublicationEvidence } from "../src/publication/evidence-manifest.mjs";
import { extractWildAuthorityTranscript } from "../src/publication/wild-transcript.mjs";
import { aggregateWildClassifications, classifyWildCase } from "../src/wild/classification.mjs";
import { networkPolicyIdentity, protocol } from "../src/wild/config.mjs";
import { wildPairedRules } from "../src/wild/result-verifier.mjs";
import { projectPostSupportHarnessRuntime } from "../src/post-support/wild-network-smoke.mjs";

const productRevision = "48c5a718a9ddd63f496e45307e1484974ccf8587";
const harnessRevision = "c".repeat(40);
const sdkSha256 = "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec";
const sdkArchiveBytes = 181_292;
const exactReleaseIdentity = JSON.parse(await readFile(
  new URL("../publication/release-identity.json", import.meta.url),
  "utf8",
));

test("deterministic public evidence package is canonical, externally bound, and safely verified", async (t) => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), "stasis-publication-archive-"));
  t.after(async () => rm(scratch, { recursive: true, force: true }));
  const publicationRoot = path.join(scratch, "publication-root");
  const identity = qualifiedIdentity();
  await mkdir(publicationRoot);
  await writeFixtureEvidence(publicationRoot, identity);
  const builtEvidence = await buildPublicationEvidence({
    publicationRoot,
    releaseIdentity: identity,
    harnessRevision,
  });
  assert.equal(builtEvidence.manifest.evidence.fileCount, 515);

  await t.test("exports one deeply frozen exact release contract", () => {
    assert.equal(Object.isFrozen(publicationReleaseContract), true);
    assert.equal(Object.isFrozen(publicationReleaseContract.archive), true);
    assert.equal(Object.isFrozen(publicationReleaseContract.assetNames), true);
    assert.deepEqual(publicationReleaseContract.assetNames, [
      "stasis-compat-bench-v0.3.3-evidence.tar",
      "report.md",
      "SHA256SUMS.txt",
    ]);
    assert.equal(publicationReleaseContract.release.tag, "stasis-v0.3.3-evidence");
    assert.equal(publicationReleaseContract.release.name, "Stasis v0.3.3 compatibility evidence");
    assert.equal(publicationReleaseContract.archive.format, "posix-ustar-uncompressed-v1");
  });

  const firstOutput = path.join(scratch, "package-one");
  const first = await buildPublicationReleaseArtifacts({
    publicationRoot,
    outputDirectory: firstOutput,
    expectedHarnessRevision: harnessRevision,
    expectedReleaseIdentity: identity,
  });
  assert.equal(first.schema, "stasis-compat-publication-release-artifacts-v1");
  assert.deepEqual(Object.keys(first), [
    "schema",
    "status",
    "outputDirectory",
    "harnessRevision",
    "archive",
    "report",
    "releaseChecksums",
    "evidence",
  ]);

  await t.test("normalizes host metadata and round-trips exact evidence", async () => {
    const metadataProbe = path.join(
      publicationRoot,
      "evidence",
      "wild",
      "raw",
      "001-baseline-gate.json",
    );
    await utimes(metadataProbe, new Date("2040-02-03T04:05:06Z"), new Date("2040-02-03T04:05:06Z"));
    await chmod(metadataProbe, 0o600);
    const secondOutput = path.join(scratch, "package-two");
    const second = await buildPublicationReleaseArtifacts({
      publicationRoot,
      outputDirectory: secondOutput,
      expectedHarnessRevision: harnessRevision,
      expectedReleaseIdentity: structuredClone(identity),
    });
    assert.deepEqual(
      {
        archive: second.archive,
        report: second.report,
        releaseChecksums: second.releaseChecksums,
      },
      {
        archive: first.archive,
        report: first.report,
        releaseChecksums: first.releaseChecksums,
      },
    );
    for (const assetName of publicationReleaseContract.assetNames) {
      assert.deepEqual(
        await readFile(path.join(firstOutput, assetName)),
        await readFile(path.join(secondOutput, assetName)),
      );
    }
    assert.deepEqual(
      {
        archive: first.archive.sha256,
        report: first.report.sha256,
        releaseChecksums: first.releaseChecksums.sha256,
      },
      {
        archive: "64d68f9b111e0709f1016e781fe31f65fb17c0d86680a94208e082ae0be8bc98",
        report: "b33c44f21bd5fe92fa7f21245d34767e94a77bdaf08a7906ce1dc28eebef94ae",
        releaseChecksums: "6edbb9f0f2ccd464afb939772e0ee80524d998339e884d2f0faf25618d235775",
      },
    );

    const archiveBytes = await readFile(
      path.join(firstOutput, publicationReleaseContract.archive.name),
    );
    assert.equal(archiveBytes.length % 512, 0);
    assert.deepEqual(archiveBytes.subarray(-1024), Buffer.alloc(1024));
    assert.equal(archiveBytes.subarray(100, 108).toString("ascii"), "0000644\0");
    assert.equal(archiveBytes.subarray(108, 116).toString("ascii"), "0000000\0");
    assert.equal(archiveBytes.subarray(116, 124).toString("ascii"), "0000000\0");
    assert.equal(archiveBytes.subarray(136, 148).toString("ascii"), "00000000000\0");
    assert.equal(archiveBytes.subarray(156, 157).toString("ascii"), "0");
    assert.equal(archiveBytes.subarray(257, 263).toString("binary"), "ustar\0");
    assert.equal(archiveBytes.subarray(263, 265).toString("ascii"), "00");

    const report = await readFile(
      path.join(firstOutput, publicationReleaseContract.report.name),
      "utf8",
    );
    assert.match(report, new RegExp(harnessRevision, "u"));
    assert.match(report, /compatibility evidence, not a performance comparison/u);
    assert.match(report, /no pooled success rate is computed across lanes/u);
    assert.match(report, /Unsupported outcomes remain typed outcomes/u);
    assert.match(report, /## Frozen baseline inputs/u);
    assert.match(report, /evidence\/deterministic-playwright-raw\.json/u);
    assert.match(report, /evidence\/rwa-cypress-raw\.json/u);
    assert.doesNotMatch(report, /\r/u);
    const releaseChecksums = await readFile(
      path.join(firstOutput, publicationReleaseContract.checksums.name),
      "utf8",
    );
    assert.equal(releaseChecksums.split("\n").length, 3);
    assert.match(
      releaseChecksums,
      new RegExp(`^[a-f0-9]{64}  ${escapeRegExp(publicationReleaseContract.archive.name)}\\n` +
        `[a-f0-9]{64}  ${escapeRegExp(publicationReleaseContract.report.name)}\\n$`, "u"),
    );

    const extractionDirectory = path.join(scratch, "verified-extraction");
    const verified = await verifyPublicationReleaseArtifacts({
      packageDirectory: firstOutput,
      extractionDirectory,
      expectedHarnessRevision: harnessRevision,
      expectedReleaseIdentity: identity,
    });
    assert.equal(verified.schema, "stasis-compat-publication-release-verification-v1");
    assert.deepEqual(Object.keys(verified), [
      "schema",
      "status",
      "packageDirectory",
      "extractedPublicationRoot",
      "harnessRevision",
      "archive",
      "report",
      "releaseChecksums",
      "evidence",
    ]);
    assert.equal(verified.status, "passed");
    assert.equal(verified.harnessRevision, harnessRevision);
    assert.deepEqual(verified.archive, first.archive);
    assert.deepEqual(verified.report, first.report);
    assert.deepEqual(verified.releaseChecksums, first.releaseChecksums);
    assert.equal(verified.evidence.fileCount, 515);
    assert.equal(Object.isFrozen(verified), true);
    assert.equal(Object.isFrozen(verified.evidence), true);
    assert.deepEqual(
      JSON.parse(await readFile(
        path.join(verified.extractedPublicationRoot, "evidence-manifest.json"),
        "utf8",
      )).releaseIdentity,
      identity,
    );
  });

  await t.test("requires a fresh safe output and mandatory external identities", async () => {
    await assert.rejects(
      buildPublicationReleaseArtifacts({
        publicationRoot,
        outputDirectory: firstOutput,
        expectedHarnessRevision: harnessRevision,
        expectedReleaseIdentity: identity,
      }),
      /fresh and absent/u,
    );
    const insidePublicationRoot = path.join(publicationRoot, "release-output");
    await assert.rejects(
      buildPublicationReleaseArtifacts({
        publicationRoot,
        outputDirectory: insidePublicationRoot,
        expectedHarnessRevision: harnessRevision,
        expectedReleaseIdentity: identity,
      }),
      /outside protected input directories/u,
    );
    assert.equal(await exists(insidePublicationRoot), false);
    await assert.rejects(
      buildPublicationReleaseArtifacts({
        publicationRoot,
        outputDirectory: path.join(scratch, "wrong-build-revision"),
        expectedHarnessRevision: "e".repeat(40),
        expectedReleaseIdentity: identity,
      }),
      /expected public harness revision/u,
    );
    const changedIdentity = structuredClone(identity);
    changedIdentity.release.githubReleaseId = "380000002";
    await assert.rejects(
      verifyPublicationReleaseArtifacts({
        packageDirectory: firstOutput,
        extractionDirectory: path.join(scratch, "wrong-identity-extraction"),
        expectedHarnessRevision: harnessRevision,
        expectedReleaseIdentity: changedIdentity,
      }),
      /immutable v0\.3\.3 contract/u,
    );
    await assert.rejects(
      verifyPublicationReleaseArtifacts({
        packageDirectory: firstOutput,
        extractionDirectory: path.join(scratch, "wrong-revision-extraction"),
        expectedHarnessRevision: "f".repeat(40),
        expectedReleaseIdentity: identity,
      }),
      /expected public harness revision/u,
    );
  });

  await t.test("rejects extra assets, resealed report drift, unsafe paths, and terminal padding", async () => {
    const extraPackage = await copyPackage(firstOutput, path.join(scratch, "package-extra"));
    await writeFile(path.join(extraPackage, "unexpected.txt"), "unexpected\n", "utf8");
    await assert.rejects(
      verifyPackage(extraPackage, path.join(scratch, "extract-extra"), identity),
      /exact release asset set/u,
    );

    const reportPackage = await copyPackage(firstOutput, path.join(scratch, "package-report"));
    await writeFile(
      path.join(reportPackage, publicationReleaseContract.report.name),
      Buffer.concat([
        await readFile(path.join(reportPackage, publicationReleaseContract.report.name)),
        Buffer.from("invented claim\n", "utf8"),
      ]),
    );
    await rewriteReleaseChecksums(reportPackage);
    await assert.rejects(
      verifyPackage(reportPackage, path.join(scratch, "extract-report"), identity),
      /report differs from the exact archive evidence/u,
    );

    const unsafePackage = await copyPackage(firstOutput, path.join(scratch, "package-unsafe"));
    const unsafeArchivePath = path.join(unsafePackage, publicationReleaseContract.archive.name);
    const unsafeArchive = await readFile(unsafeArchivePath);
    rewriteFirstTarPath(unsafeArchive, "../escape");
    await writeFile(unsafeArchivePath, unsafeArchive);
    await rewriteReleaseChecksums(unsafePackage);
    await assert.rejects(
      verifyPackage(unsafePackage, path.join(scratch, "extract-unsafe"), identity),
      /canonical relative path|unsafe path component/u,
    );
    assert.equal(await exists(path.join(scratch, "escape")), false);

    const paddedPackage = await copyPackage(firstOutput, path.join(scratch, "package-padded"));
    const paddedArchivePath = path.join(paddedPackage, publicationReleaseContract.archive.name);
    await writeFile(
      paddedArchivePath,
      Buffer.concat([await readFile(paddedArchivePath), Buffer.alloc(512)]),
    );
    await rewriteReleaseChecksums(paddedPackage);
    await assert.rejects(
      verifyPackage(paddedPackage, path.join(scratch, "extract-padded"), identity),
      /exactly two zero blocks/u,
    );

    const crlfPackage = await copyPackage(firstOutput, path.join(scratch, "package-crlf"));
    const sumsPath = path.join(crlfPackage, publicationReleaseContract.checksums.name);
    await writeFile(sumsPath, (await readFile(sumsPath, "utf8")).replaceAll("\n", "\r\n"));
    await assert.rejects(
      verifyPackage(crlfPackage, path.join(scratch, "extract-crlf"), identity),
      /SHA256SUMS.txt is not canonical/u,
    );
  });
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
  await writeJson(indexPath, {
    schema: "stasis-wild-artifact-index-v4",
    protocol,
    selectedCount: 100,
    summary: summaryReference,
    identity: identityRecord,
    rules: wildPairedRules,
    startedAt,
    completedAt,
    cases,
  });
  const authority = {
    schema: "stasis-post-support-wild-authority-v1",
    status: "passed",
    protocol,
    authority: "quiescent_postflight_verified",
    caseCount: 100,
    artifactIndexSha256: sha256(await readFile(indexPath)),
    candidate: wildCandidate,
    summary: wildSummary,
  };
  const transcriptPath = path.join(evidenceRoot, "wild-stdout-transcript.log");
  await writeFile(
    transcriptPath,
    Buffer.concat([
      canonicalJsonBytes({
        schema: "stasis-post-support-wild-smoke-run-v1",
        status: "passed",
        artifact: smokeReference,
      }),
      canonicalJsonBytes({
        schema: "stasis-post-support-wild-artifacts-v1",
        protocol,
        authority: "requires_separate_quiescent_postflight_verification",
        candidate: wildCandidate,
        artifactIndex: "wild/artifact-index.json",
        summaryArtifact: "wild/summary.json",
        caseCount: 100,
        rawRecordCount: 500,
        summary: wildSummary,
      }),
      canonicalJsonBytes(authority),
    ]),
    { flag: "wx" },
  );
  await extractWildAuthorityTranscript({
    transcriptPath,
    authorityOutputPath: path.join(evidenceRoot, "wild-authority.json"),
    receiptPath: path.join(evidenceRoot, "wild-authority-extraction-receipt.json"),
  });
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

async function writeReference(root, publicationPath, value, indexedPath) {
  const absolutePath = path.join(root, ...publicationPath.split("/"));
  await writeJson(absolutePath, value);
  return { path: indexedPath, sha256: sha256(await readFile(absolutePath)) };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, canonicalJsonBytes(value), { flag: "wx" });
}

async function copyPackage(source, target) {
  await cp(source, target, { recursive: true, errorOnExist: true, force: false });
  return target;
}

async function verifyPackage(packageDirectory, extractionDirectory, identity) {
  return verifyPublicationReleaseArtifacts({
    packageDirectory,
    extractionDirectory,
    expectedHarnessRevision: harnessRevision,
    expectedReleaseIdentity: identity,
  });
}

async function rewriteReleaseChecksums(packageRoot) {
  const archive = await readFile(path.join(packageRoot, publicationReleaseContract.archive.name));
  const report = await readFile(path.join(packageRoot, publicationReleaseContract.report.name));
  await writeFile(
    path.join(packageRoot, publicationReleaseContract.checksums.name),
    `${sha256(archive)}  ${publicationReleaseContract.archive.name}\n` +
      `${sha256(report)}  ${publicationReleaseContract.report.name}\n`,
  );
}

function rewriteFirstTarPath(archive, replacement) {
  const replacementBytes = Buffer.from(replacement, "ascii");
  assert.ok(replacementBytes.length <= 100);
  archive.fill(0, 0, 100);
  replacementBytes.copy(archive, 0);
  archive.fill(0x20, 148, 156);
  const checksum = archive.subarray(0, 512)
    .reduce((total, byte) => total + byte, 0)
    .toString(8)
    .padStart(6, "0");
  archive.write(checksum, 148, 6, "ascii");
  archive[154] = 0;
  archive[155] = 0x20;
}

async function exists(target) {
  try {
    await readdir(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
