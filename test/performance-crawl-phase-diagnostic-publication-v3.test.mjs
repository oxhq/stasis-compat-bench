import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import AdmZip from "adm-zip";

import { jsonReplacer } from "../src/shared/io.mjs";
import {
  bindCrawlPhaseDiagnosticArtifacts,
  crawlPhaseDiagnosticOutcomeSchema,
} from "../src/performance/crawl-phase-diagnostic-artifact-binding-v3.mjs";
import {
  crawlPhaseDiagnosticContractIdentity,
  crawlPhaseDiagnosticExpectedArtifactNames,
  crawlPhaseDiagnosticJobStepIdentity,
  verifyCrawlPhaseDiagnosticHostedProvenance,
} from "../src/performance/crawl-phase-diagnostic-hosted-provenance-v3.mjs";
import {
  assertCrawlPhaseDiagnosticOutcome,
  buildCrawlPhaseDiagnosticPublication,
  buildCrawlPhaseDiagnosticPublicationDirectory,
  crawlPhaseDiagnosticComparisonEvidenceTargetSha,
  crawlPhaseDiagnosticBundleArchiveNamesByOutcome,
  crawlPhaseDiagnosticOutcomeClasses,
  crawlPhaseDiagnosticPrivacyErratumSchema,
  crawlPhaseDiagnosticPrivacyScanSchema,
  crawlPhaseDiagnosticPublicationAssetNamesByOutcome,
  crawlPhaseDiagnosticPublicationIdentity,
  crawlPhaseDiagnosticPublicationPayloadNamesByOutcome,
  crawlPhaseDiagnosticPublicationSchema,
  crawlPhaseDiagnosticReviewedSyntheticPrivacyFixture,
  createCrawlPhaseDiagnosticPrivacyScan,
  publicationAssetNamesForCrawlPhaseDiagnosticOutcome,
  verifyCrawlPhaseDiagnosticGitHubRelease,
  verifyCrawlPhaseDiagnosticPublication,
  verifyCrawlPhaseDiagnosticPublicationDirectory,
} from "../src/performance/crawl-phase-diagnostic-publication-v3.mjs";
import {
  canonicalDiagnosticFixtureBytes,
  createCrawlPhaseDiagnosticHostedFixture,
  crawlPhaseDiagnosticComparisonFixtureBytes,
  diagnosticFixtureSha256,
} from "./fixtures/crawl-phase-diagnostic-hosted-fixture-v3.mjs";
import {
  crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity,
  exactCrawlPhaseDiagnosticReviewedPrivacyFixtureBytes,
} from "./fixtures/crawl-phase-diagnostic-reviewed-privacy-fixture.mjs";

const targetSha = "d".repeat(40);

test("outcome classes freeze exact 22, 17, and 15 asset inventories", () => {
  assert.deepEqual(crawlPhaseDiagnosticOutcomeClasses, [
    "VALID_NON_AUTHORITATIVE",
    "DIAGNOSTIC_INVALID_WITH_STATUS",
    "INFRASTRUCTURE_INVALID_NO_ARTIFACT",
  ]);
  assert.deepEqual(
    crawlPhaseDiagnosticOutcomeClasses.map((name) =>
      crawlPhaseDiagnosticPublicationAssetNamesByOutcome[name].length),
    [22, 17, 15],
  );
  assert.deepEqual(
    crawlPhaseDiagnosticOutcomeClasses.map((name) =>
      crawlPhaseDiagnosticPublicationPayloadNamesByOutcome[name].length),
    [20, 15, 13],
  );
  assert.deepEqual(crawlPhaseDiagnosticPublicationAssetNamesByOutcome, {
    VALID_NON_AUTHORITATIVE: [
      "SHA256SUMS.txt",
      "actions-diagnostic-bundle.zip",
      "comparison-artifact-binding.json",
      "comparison-evidence-release-commit.json",
      "comparison-evidence-release.json",
      "comparison-fresh-crawl-raw.json",
      "comparison-input-verification.json",
      "contract-commit.json",
      "contract-release.json",
      "crawl-phase-crawlee-raw.json",
      "crawl-phase-localization-evidence.json",
      "crawl-phase-stasis-raw.json",
      "diagnostic-artifact-binding.json",
      "diagnostic-outcome.json",
      "diagnostic-verification.json",
      "hosted-provenance.json",
      "privacy-scan.json",
      "workflow-artifacts.json",
      "workflow-jobs.json",
      "workflow-run.json",
      "workflow-runs.json",
      "workflow-source-commit.json",
    ],
    DIAGNOSTIC_INVALID_WITH_STATUS: [
      "SHA256SUMS.txt",
      "actions-diagnostic-bundle.zip",
      "comparison-artifact-binding.json",
      "comparison-evidence-release-commit.json",
      "comparison-evidence-release.json",
      "comparison-fresh-crawl-raw.json",
      "contract-commit.json",
      "contract-release.json",
      "diagnostic-artifact-binding.json",
      "diagnostic-outcome.json",
      "hosted-provenance.json",
      "privacy-scan.json",
      "workflow-artifacts.json",
      "workflow-jobs.json",
      "workflow-run.json",
      "workflow-runs.json",
      "workflow-source-commit.json",
    ],
    INFRASTRUCTURE_INVALID_NO_ARTIFACT: [
      "SHA256SUMS.txt",
      "comparison-artifact-binding.json",
      "comparison-evidence-release-commit.json",
      "comparison-evidence-release.json",
      "comparison-fresh-crawl-raw.json",
      "contract-commit.json",
      "contract-release.json",
      "diagnostic-outcome.json",
      "hosted-provenance.json",
      "privacy-scan.json",
      "workflow-artifacts.json",
      "workflow-jobs.json",
      "workflow-run.json",
      "workflow-runs.json",
      "workflow-source-commit.json",
    ],
  });
  assert.deepEqual(crawlPhaseDiagnosticBundleArchiveNamesByOutcome, {
    VALID_NON_AUTHORITATIVE: [
      "comparison-input-verification.json",
      "crawl-phase-crawlee-raw.json",
      "crawl-phase-localization-evidence.json",
      "crawl-phase-stasis-raw.json",
      "diagnostic-outcome.json",
      "diagnostic-verification.json",
    ],
    DIAGNOSTIC_INVALID_WITH_STATUS: ["diagnostic-outcome.json"],
    INFRASTRUCTURE_INVALID_NO_ARTIFACT: [],
  });
  for (const outcomeClass of crawlPhaseDiagnosticOutcomeClasses) {
    const names = crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass];
    assert.deepEqual(names, [...names].sort(compareUtf8));
    assert.equal(new Set(names).size, names.length);
    assert.equal(names.includes("privacy-scan.json"), true);
    assert.equal(names.includes("SHA256SUMS.txt"), true);
  }
});

test("builder deterministically seals every outcome-specific publication", () => {
  for (const outcomeClass of crawlPhaseDiagnosticOutcomeClasses) {
    const payload = fixturePayload(outcomeClass);
    const first = buildCrawlPhaseDiagnosticPublication(
      { payloadAssetBytes: payload },
      fixtureOptions(outcomeClass),
    );
    const second = buildCrawlPhaseDiagnosticPublication(
      { payloadAssetBytes: cloneMap(payload) },
      fixtureOptions(outcomeClass),
    );
    assert.deepEqual(first.generatedAssets, second.generatedAssets);
    assert.equal(first.receipt.schema, crawlPhaseDiagnosticPublicationSchema);
    assert.equal(first.receipt.outcomeClass, outcomeClass);
    assert.equal(first.receipt.authorityEligible, false);
    assert.equal(first.receipt.timingEligible, false);
    assert.equal(first.receipt.statisticsEligible, false);
    assert.equal(first.receipt.comparisonEligible, false);
    assert.equal(first.receipt.optimizationEligible, false);
    assert.equal(first.receipt.generalizedSpeedClaimAuthorized, false);
    assert.equal(first.receipt.implementationWorkAuthorized, false);
    assert.equal(first.receipt.decisionState, "STAY_0_4_UNASSIGNED");
    assert.equal(
      first.receipt.inventory.finalAssetCount,
      crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass].length,
    );
    assert.equal(
      first.receipt.inventory.archiveAssetCount,
      outcomeClass === "INFRASTRUCTURE_INVALID_NO_ARTIFACT" ? 0 : 1,
    );
    assert.equal(
      first.receipt.inventory.archiveEntryCount,
      crawlPhaseDiagnosticBundleArchiveNamesByOutcome[outcomeClass].length,
    );
    const assets = { ...payload, ...first.generatedAssets };
    assert.deepEqual(
      verifyCrawlPhaseDiagnosticPublication(
        { assetBytes: assets },
        fixtureOptions(outcomeClass),
      ),
      first.receipt,
    );
    const checksumLines = assets["SHA256SUMS.txt"].toString("utf8").trimEnd().split("\n");
    assert.equal(checksumLines.length, first.receipt.inventory.finalAssetCount - 1);
    assert.equal(checksumLines.some((line) => line.endsWith("  SHA256SUMS.txt")), false);
    assert.deepEqual(
      checksumLines.map((line) => line.slice(66)),
      publicationAssetNamesForCrawlPhaseDiagnosticOutcome(outcomeClass)
        .filter((name) => name !== "SHA256SUMS.txt"),
    );
  }
});

test("production receipt chain binds retained APIs and rejects terminal contradictions", () => {
  const payload = productionDiagnosticInvalidPayload();
  const built = buildCrawlPhaseDiagnosticPublication({ payloadAssetBytes: payload });
  const publication = { ...payload, ...built.generatedAssets };
  assert.deepEqual(
    verifyCrawlPhaseDiagnosticPublication({ assetBytes: publication }),
    built.receipt,
  );
  assert.equal(built.receipt.outcomeClass, "DIAGNOSTIC_INVALID_WITH_STATUS");

  const uploadConflict = cloneMap(payload);
  const jobs = JSON.parse(uploadConflict["workflow-jobs.json"].toString("utf8"));
  const upload = jobs.jobs[0].steps.find(
    ({ name }) => name === crawlPhaseDiagnosticJobStepIdentity.uploadBundle.name,
  );
  assert.notEqual(upload, undefined);
  upload.conclusion = "failure";
  uploadConflict["workflow-jobs.json"] = canonicalBytes(jobs);
  assert.throws(
    () => buildCrawlPhaseDiagnosticPublication({ payloadAssetBytes: uploadConflict }),
    /step conclusions|artifact retained|terminal mode|jobs listing/iu,
  );

  for (const conclusion of ["cancelled", "timed_out"]) {
    const unsupported = cloneMap(payload);
    const run = JSON.parse(unsupported["workflow-run.json"].toString("utf8"));
    const runs = JSON.parse(unsupported["workflow-runs.json"].toString("utf8"));
    run.conclusion = conclusion;
    runs.workflow_runs[0].conclusion = conclusion;
    unsupported["workflow-run.json"] = canonicalBytes(run);
    unsupported["workflow-runs.json"] = canonicalBytes(runs);
    assert.throws(
      () => buildCrawlPhaseDiagnosticPublication({ payloadAssetBytes: unsupported }),
      /run record|terminal|conclusion|hosted receipt/iu,
      conclusion,
    );
  }

  const phaseConflict = cloneMap(payload);
  const conflictingOutcome = fixtureOutcome("DIAGNOSTIC_INVALID_WITH_STATUS");
  conflictingOutcome.phase = "input_verification";
  conflictingOutcome.failure.code = "INPUT_VERIFICATION_FAILED";
  const conflictingOutcomeBytes = canonicalBytes(conflictingOutcome);
  const conflictingBundle = zipBytes([
    ["diagnostic-outcome.json", conflictingOutcomeBytes],
  ]);
  const artifacts = JSON.parse(phaseConflict["workflow-artifacts.json"].toString("utf8"));
  const hosted = JSON.parse(phaseConflict["hosted-provenance.json"].toString("utf8"));
  artifacts.artifacts[0].size_in_bytes = conflictingBundle.byteLength;
  artifacts.artifacts[0].digest = `sha256:${hash(conflictingBundle)}`;
  hosted.artifacts[0].sizeInBytes = conflictingBundle.byteLength;
  hosted.artifacts[0].digest = `sha256:${hash(conflictingBundle)}`;
  phaseConflict["actions-diagnostic-bundle.zip"] = conflictingBundle;
  phaseConflict["diagnostic-outcome.json"] = conflictingOutcomeBytes;
  phaseConflict["workflow-artifacts.json"] = canonicalBytes(artifacts);
  phaseConflict["hosted-provenance.json"] = canonicalBytes(hosted);
  assert.throws(
    () => buildCrawlPhaseDiagnosticPublication({ payloadAssetBytes: phaseConflict }),
    /phase does not match the first failed hosted step/u,
  );
});

test("outcomes fail closed on phase, code, eligibility, and unknown fields", () => {
  const cases = [
    (value) => { value.authorityEligible = true; },
    (value) => { value.runAttempt = 2; },
    (value) => { value.decisionState = "ADVANCE"; },
    (value) => { value.failure.code = "OFFLINE_VERIFICATION_FAILED"; },
    (value) => { value.extra = true; },
  ];
  for (const mutate of cases) {
    const value = fixtureOutcome("DIAGNOSTIC_INVALID_WITH_STATUS");
    mutate(value);
    assert.throws(() => assertCrawlPhaseDiagnosticOutcome(value), /outcome|authority|failure|field/iu);
  }
});

test("builder rejects cross-class missing/extra assets and generated drift", () => {
  const payload = fixturePayload("VALID_NON_AUTHORITATIVE");
  delete payload["actions-diagnostic-bundle.zip"];
  assert.throws(
    () => buildCrawlPhaseDiagnosticPublication(
      { payloadAssetBytes: payload },
      fixtureOptions("VALID_NON_AUTHORITATIVE"),
    ),
    /exact asset inventory/u,
  );

  const intact = fixturePayload("DIAGNOSTIC_INVALID_WITH_STATUS");
  const built = buildCrawlPhaseDiagnosticPublication(
    { payloadAssetBytes: intact },
    fixtureOptions("DIAGNOSTIC_INVALID_WITH_STATUS"),
  );
  const drift = { ...intact, ...built.generatedAssets };
  drift["privacy-scan.json"] = canonicalBytes({ forged: true });
  assert.throws(
    () => verifyCrawlPhaseDiagnosticPublication(
      { assetBytes: drift },
      fixtureOptions("DIAGNOSTIC_INVALID_WITH_STATUS"),
    ),
    /privacy-scan/u,
  );
});

test("privacy seal rejects direct, encoded, split-line, archived, and private-path data", () => {
  const token = `ghp_${"A".repeat(24)}`;
  const mutators = [
    (payload) => { payload["workflow-run.json"] = canonicalBytes({ marker: token }); },
    (payload) => {
      payload["hosted-provenance.json"] = canonicalBytes({ marker: Buffer.from(token).toString("base64") });
    },
    (payload) => {
      payload["workflow-run.json"] = canonicalBytes({ marker: `${token.slice(0, 8)}\n${token.slice(8)}` });
    },
    (payload) => {
      payload["workflow-run.json"] = canonicalBytes({
        marker: ["E:", "stasis", "secret"].join("\\"),
      });
    },
    (payload) => {
      payload["actions-diagnostic-bundle.zip"] = zipBytes([
        ["diagnostic-outcome.json", canonicalBytes({ marker: token })],
      ]);
    },
  ];
  for (const [index, mutate] of mutators.entries()) {
    const payload = fixturePayload("DIAGNOSTIC_INVALID_WITH_STATUS");
    mutate(payload);
    assert.throws(
      () => buildCrawlPhaseDiagnosticPublication(
        { payloadAssetBytes: payload },
        fixtureOptions("DIAGNOSTIC_INVALID_WITH_STATUS"),
      ),
      /privacy|credential|path/iu,
      `privacy mutator ${index}`,
    );
  }
});

test("privacy erratum masks only the exact reviewed frozen-H1 synthetic fixture", () => {
  assert.equal(
    crawlPhaseDiagnosticPrivacyScanSchema,
    "stasis-v0.3.3-performance-crawl-phase-diagnostic-privacy-scan-v3",
  );
  assert.deepEqual(crawlPhaseDiagnosticReviewedSyntheticPrivacyFixture, {
    ruleId: "credentialed_url",
    asset: {
      name: "comparison-evidence-release-commit.json",
      bytes: 228009,
      sha256: "59981d35875e61909e1a16b3c007baf676d8e49e5e10870999dff588adc1f543",
    },
    source: {
      commitSha: "6c1a0066eb17425628293993fd7312d4cf26e0f5",
      treeSha: "0d5322a5c2c104d2065a37fb7deecfa6944100bc",
      jsonPointer: "/files/8/patch",
      filename: "test/performance-replication-public-release.test.mjs",
      blobSha: "d0c28f94c133819f8260bb298e3dfe0afb8bd797",
      contextLabel: "URL credentials",
    },
    occurrence: {
      rawOccurrenceCount: 1,
      byteStart: 181160,
      byteEnd: 181197,
      derivedProjectionMatchCount: 13,
    },
  });
  assert.equal(Object.isFrozen(crawlPhaseDiagnosticReviewedSyntheticPrivacyFixture), true);
  assert.equal(Object.isFrozen(crawlPhaseDiagnosticReviewedSyntheticPrivacyFixture.asset), true);
  assert.deepEqual(crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity, {
    encodedBytes: 44778,
    encodedSha256: "141f98c0df6a9571addba09a363923bbd927bcd31357ba7d12d6f64e3fcc6061",
    compressedBytes: 33147,
    compressedSha256: "65d2f697f4a5310730bb42566240e90480d38c5702178c3eb22e284e05157c45",
    inflatedBytes: 228009,
    inflatedSha256: "59981d35875e61909e1a16b3c007baf676d8e49e5e10870999dff588adc1f543",
  });

  const payload = fixturePayload("DIAGNOSTIC_INVALID_WITH_STATUS");
  const reviewedBytes = payload["comparison-evidence-release-commit.json"];
  const reviewedLiteral = Buffer.from(
    ["https://user", ["secret", "github.com/unsafe"].join("@")].join(":"),
    "utf8",
  );
  assert.equal(reviewedBytes.byteLength, 228009);
  assert.equal(hash(reviewedBytes), crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity.inflatedSha256);
  assert.equal(reviewedBytes.indexOf(reviewedLiteral), 181160);
  assert.equal(reviewedBytes.lastIndexOf(reviewedLiteral), 181160);

  const receipt = createFixturePrivacyScan(payload);
  assert.equal(receipt.erratum.schema, crawlPhaseDiagnosticPrivacyErratumSchema);
  assert.equal(receipt.erratum.status, "applied");
  assert.equal(receipt.erratum.ruleId, "credentialed_url");
  assert.deepEqual(
    receipt.erratum.asset,
    crawlPhaseDiagnosticReviewedSyntheticPrivacyFixture.asset,
  );
  assert.deepEqual(
    receipt.erratum.source,
    crawlPhaseDiagnosticReviewedSyntheticPrivacyFixture.source,
  );
  assert.deepEqual(receipt.erratum.occurrence, {
    rawOccurrenceCount: 1,
    byteStart: 181160,
    byteEnd: 181197,
    derivedProjectionMatchCount: 13,
    unreviewedMatchCount: 0,
  });
  assert.deepEqual(receipt.erratum.treatment, {
    rawBytesRetained: true,
    onlyReviewedRangeMaskedInScanCopy: true,
    everyRemainingByteScannedByExistingRules: true,
  });

  const cases = [
    ["wrong name", (value) => {
      value["workflow-source-commit.json"] = Buffer.from(reviewedBytes);
    }, /privacy scan rejected.*workflow-source-commit/u],
    ["wrong hash", (value) => {
      value["comparison-evidence-release-commit.json"] = mutateReviewedCommit(
        reviewedBytes,
        (record) => { record.node_id = `${record.node_id}x`; },
      );
    }, /asset identity changed/u],
    ["removed credential colon", (value) => {
      value["comparison-evidence-release-commit.json"] = mutateReviewedCommit(
        reviewedBytes,
        (record) => {
          record.files[8].patch = record.files[8].patch.replace(
            ["https://user", ["secret", "github.com/unsafe"].join("@")].join(":"),
            ["https://user", ["secret", "github.com/unsafe"].join("@")].join("-"),
          );
        },
      );
    }, /asset identity changed/u],
    ["wrong context", (value) => {
      value["comparison-evidence-release-commit.json"] = mutateReviewedCommit(
        reviewedBytes,
        (record) => {
          record.files[8].patch = record.files[8].patch.replace(
            "URL credentials",
            "URL credentialx",
          );
        },
      );
    }, /asset identity changed/u],
    ["second occurrence", (value) => {
      value["comparison-evidence-release-commit.json"] = mutateReviewedCommit(
        reviewedBytes,
        (record) => { record.files[8].patch += `\n+${reviewedLiteral.toString("utf8")}`; },
      );
    }, /asset identity changed/u],
    ["other match", (value) => {
      value["workflow-source-commit.json"] = canonicalBytes({
        redirect: ["https://other", ["private", "github.com/other"].join("@")].join(":"),
      });
    }, /privacy scan rejected.*workflow-source-commit/u],
  ];
  for (const [label, mutate, pattern] of cases) {
    const drift = fixturePayload("DIAGNOSTIC_INVALID_WITH_STATUS");
    mutate(drift);
    assert.throws(() => createFixturePrivacyScan(drift), pattern, label);
  }
});

test("ZIP inspection rejects nested archives, unsafe names, and case collisions", () => {
  const nested = fixturePayload("DIAGNOSTIC_INVALID_WITH_STATUS");
  nested["actions-diagnostic-bundle.zip"] = zipBytes([
    ["diagnostic-outcome.json", zipBytes([["inner.json", canonicalBytes({ ok: true })]])],
  ]);
  assert.throws(
    () => buildCrawlPhaseDiagnosticPublication(
      { payloadAssetBytes: nested },
      fixtureOptions("DIAGNOSTIC_INVALID_WITH_STATUS"),
    ),
    /nested archive/u,
  );

  for (const [index, entries] of [
    [["C:diagnostic-outcome.json", canonicalBytes({ ok: true })]],
    [
      ["diagnostic-outcome.json", canonicalBytes({ ok: true })],
      ["DIAGNOSTIC-OUTCOME.JSON", canonicalBytes({ ok: true })],
    ],
  ].entries()) {
    const payload = fixturePayload("DIAGNOSTIC_INVALID_WITH_STATUS");
    payload["actions-diagnostic-bundle.zip"] = zipBytes(entries);
    assert.throws(
      () => buildCrawlPhaseDiagnosticPublication(
        { payloadAssetBytes: payload },
        fixtureOptions("DIAGNOSTIC_INVALID_WITH_STATUS"),
      ),
      /unsafe path|unsafe metadata/u,
      `ZIP mutation ${index}`,
    );
  }
});

test("directory build creates a fresh exact publication and verifier rejects extras", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-diagnostic-publication-"));
  try {
    const payloadRoot = path.join(root, "payload");
    const outputRoot = path.join(root, "publication");
    await mkdir(payloadRoot);
    const payload = fixturePayload("INFRASTRUCTURE_INVALID_NO_ARTIFACT");
    await Promise.all(Object.entries(payload).map(([name, bytes]) =>
      writeFile(path.join(payloadRoot, name), bytes, { flag: "wx" })));
    const receipt = await buildCrawlPhaseDiagnosticPublicationDirectory(
      { payloadDirectory: payloadRoot, outputDirectory: outputRoot },
      fixtureOptions("INFRASTRUCTURE_INVALID_NO_ARTIFACT"),
    );
    assert.deepEqual(
      (await readdir(outputRoot)).sort(compareUtf8),
      [...crawlPhaseDiagnosticPublicationAssetNamesByOutcome.INFRASTRUCTURE_INVALID_NO_ARTIFACT],
    );
    assert.deepEqual(
      await verifyCrawlPhaseDiagnosticPublicationDirectory(
        { publicationDirectory: outputRoot },
        fixtureOptions("INFRASTRUCTURE_INVALID_NO_ARTIFACT"),
      ),
      receipt,
    );
    await writeFile(path.join(outputRoot, "extra.json"), "{}\n");
    await assert.rejects(
      verifyCrawlPhaseDiagnosticPublicationDirectory(
        { publicationDirectory: outputRoot },
        fixtureOptions("INFRASTRUCTURE_INVALID_NO_ARTIFACT"),
      ),
      /exact asset inventory/u,
    );
    assert.equal((await readFile(path.join(outputRoot, "diagnostic-outcome.json"))).equals(
      payload["diagnostic-outcome.json"]), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("core release verifier binds three lightweight tags, H5 ancestry, chronology, and exact bytes", () => {
  const outcomeClass = "DIAGNOSTIC_INVALID_WITH_STATUS";
  const payload = fixturePayload(outcomeClass);
  const built = buildCrawlPhaseDiagnosticPublication(
    { payloadAssetBytes: payload },
    fixtureOptions(outcomeClass),
  );
  const assets = { ...payload, ...built.generatedAssets };
  const releaseRecord = releaseFixture(assets);
  const receipt = verifyCrawlPhaseDiagnosticGitHubRelease({
    releaseRecord,
    comparisonTagRefRecord: tagRefFixture(
      "stasis-v0.3.3-performance-replication-evidence-v1",
      crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    ),
    contractTagRefRecord: tagRefFixture(
      crawlPhaseDiagnosticContractIdentity.tag,
      targetSha,
    ),
    releaseTagRefRecord: tagRefFixture(crawlPhaseDiagnosticPublicationIdentity.tag, targetSha),
    releaseTargetCommitRecord: commitFixture(
      targetSha,
      crawlPhaseDiagnosticContractIdentity.soleParentSha,
    ),
    expectedReleaseTargetSha: targetSha,
    anonymousDownloadedAssetBytes: assets,
  }, fixtureOptions(outcomeClass));
  assert.equal(receipt.outcomeClass, outcomeClass);
  assert.equal(receipt.contractAndEvidenceTagsShareExactTarget, true);
  assert.equal(receipt.targetDirectSuccessorOfH5, true);
  assert.equal(receipt.assetCount, 17);
  assert.equal(receipt.authorityEligible, false);
  assert.equal(receipt.timingEligible, false);
  assert.equal(receipt.statisticsEligible, false);
  assert.equal(receipt.comparisonEligible, false);
  assert.equal(receipt.optimizationEligible, false);
  assert.equal(receipt.generalizedSpeedClaimAuthorized, false);
  assert.equal(receipt.implementationWorkAuthorized, false);
  assert.equal(receipt.decisionState, "STAY_0_4_UNASSIGNED");

  const wrongParent = commitFixture(targetSha, "a".repeat(40));
  assert.throws(() => verifyCrawlPhaseDiagnosticGitHubRelease({
    releaseRecord,
    comparisonTagRefRecord: tagRefFixture(
      "stasis-v0.3.3-performance-replication-evidence-v1",
      crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    ),
    contractTagRefRecord: tagRefFixture(
      crawlPhaseDiagnosticContractIdentity.tag,
      targetSha,
    ),
    releaseTagRefRecord: tagRefFixture(crawlPhaseDiagnosticPublicationIdentity.tag, targetSha),
    releaseTargetCommitRecord: wrongParent,
    expectedReleaseTargetSha: targetSha,
    anonymousDownloadedAssetBytes: assets,
  }, fixtureOptions(outcomeClass)), /parent/u);
});

function fixtureOutcome(outcomeClass) {
  const base = {
    schema: crawlPhaseDiagnosticOutcomeSchema,
    status: "failed",
    outcomeClass,
    phase: "hosted_infrastructure",
    runAttempt: 1,
    evidenceArtifactEligible: false,
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    failure: { code: "HOSTED_INFRASTRUCTURE_FAILED", messageOmitted: true },
  };
  if (outcomeClass === "VALID_NON_AUTHORITATIVE") {
    return { ...base, status: "passed", phase: "complete", evidenceArtifactEligible: true, failure: null };
  }
  if (outcomeClass === "DIAGNOSTIC_INVALID_WITH_STATUS") {
    return {
      ...base,
      phase: "diagnostic_execution",
      failure: { code: "DIAGNOSTIC_EXECUTION_FAILED", messageOmitted: true },
    };
  }
  return base;
}

function productionDiagnosticInvalidPayload() {
  const outcome = fixtureOutcome("DIAGNOSTIC_INVALID_WITH_STATUS");
  const outcomeBytes = canonicalBytes(outcome);
  const bundleBytes = zipBytes([["diagnostic-outcome.json", outcomeBytes]]);
  const hostedInput = createCrawlPhaseDiagnosticHostedFixture({ conclusion: "failure" });
  hostedInput.comparisonEvidenceReleaseRecord.created_at = "2026-09-04T11:36:56Z";
  const comparisonParentSha = "efd08ca4a0768951d49107cc7ff3c17af06047a1";
  const comparisonRepository = "oxhq/stasis-compat-bench";
  hostedInput.comparisonEvidenceCommitRecord.parents = [{
    sha: comparisonParentSha,
    url: `https://api.github.com/repos/${comparisonRepository}/commits/${comparisonParentSha}`,
    html_url: `https://github.com/${comparisonRepository}/commit/${comparisonParentSha}`,
  }];
  const artifact = hostedInput.artifactsListing.artifacts[0];
  artifact.size_in_bytes = bundleBytes.byteLength;
  artifact.digest = `sha256:${diagnosticFixtureSha256(bundleBytes)}`;
  const hostedReceipt = verifyCrawlPhaseDiagnosticHostedProvenance(hostedInput);
  const artifactBinding = bindCrawlPhaseDiagnosticArtifacts({
    hostedReceipt,
    artifactZipBytes: {
      [crawlPhaseDiagnosticExpectedArtifactNames[0]]: bundleBytes,
    },
  });
  return {
    "actions-diagnostic-bundle.zip": bundleBytes,
    "comparison-artifact-binding.json": Buffer.from(
      crawlPhaseDiagnosticComparisonFixtureBytes.artifactBinding,
    ),
    "comparison-evidence-release-commit.json":
      exactCrawlPhaseDiagnosticReviewedPrivacyFixtureBytes(),
    "comparison-evidence-release.json": canonicalDiagnosticFixtureBytes(
      hostedInput.comparisonEvidenceReleaseRecord,
    ),
    "comparison-fresh-crawl-raw.json": Buffer.from(
      crawlPhaseDiagnosticComparisonFixtureBytes.freshCrawlRaw,
    ),
    "contract-commit.json": canonicalDiagnosticFixtureBytes(
      hostedInput.diagnosticContractCommitRecord,
    ),
    "contract-release.json": canonicalDiagnosticFixtureBytes(
      hostedInput.diagnosticContractReleaseRecord,
    ),
    "diagnostic-artifact-binding.json": canonicalDiagnosticFixtureBytes(artifactBinding),
    "diagnostic-outcome.json": outcomeBytes,
    "hosted-provenance.json": canonicalDiagnosticFixtureBytes(hostedReceipt),
    "workflow-artifacts.json": canonicalDiagnosticFixtureBytes(hostedInput.artifactsListing),
    "workflow-jobs.json": canonicalDiagnosticFixtureBytes(hostedInput.jobsListing),
    "workflow-run.json": canonicalDiagnosticFixtureBytes(hostedInput.runRecord),
    "workflow-runs.json": canonicalDiagnosticFixtureBytes(hostedInput.workflowRunsListing),
    "workflow-source-commit.json": canonicalDiagnosticFixtureBytes(
      hostedInput.workflowSourceCommitRecord,
    ),
  };
}

function fixturePayload(outcomeClass) {
  const names = crawlPhaseDiagnosticPublicationPayloadNamesByOutcome[outcomeClass];
  const outcomeBytes = canonicalBytes(fixtureOutcome(outcomeClass));
  const result = Object.fromEntries(names.map((name) => [
    name,
    canonicalBytes({ schema: "safe-fixture", marker: name }),
  ]));
  result["comparison-evidence-release-commit.json"] =
    exactCrawlPhaseDiagnosticReviewedPrivacyFixtureBytes();
  result["diagnostic-outcome.json"] = outcomeBytes;
  if (names.includes("actions-diagnostic-bundle.zip")) {
    const bundleNames = outcomeClass === "VALID_NON_AUTHORITATIVE"
      ? [
          "comparison-input-verification.json",
          "crawl-phase-crawlee-raw.json",
          "crawl-phase-localization-evidence.json",
          "crawl-phase-stasis-raw.json",
          "diagnostic-outcome.json",
          "diagnostic-verification.json",
        ]
      : ["diagnostic-outcome.json"];
    result["actions-diagnostic-bundle.zip"] = zipBytes(
      bundleNames.map((name) => [name, result[name]]),
    );
  }
  return result;
}

function createFixturePrivacyScan(payload) {
  const outcomeClass = "DIAGNOSTIC_INVALID_WITH_STATUS";
  const outcome = fixtureOutcome(outcomeClass);
  return createCrawlPhaseDiagnosticPrivacyScan(
    payload,
    fixtureOptions(outcomeClass).receiptChainValidator(),
    outcome,
  );
}

function mutateReviewedCommit(bytes, mutate) {
  const value = JSON.parse(bytes.toString("utf8"));
  mutate(value);
  return canonicalBytes(value);
}

function fixtureOptions(outcomeClass) {
  return {
    receiptChainValidator() {
      return {
        outcomeClass,
        contractTargetSha: targetSha,
        comparisonEvidenceTargetSha: crawlPhaseDiagnosticComparisonEvidenceTargetSha,
        workflowSourceSha: "e".repeat(40),
        workflowRunId: 33_900_000_001,
        hostedCreatedAt: "2026-09-04T11:59:00Z",
        hostedStartedAt: "2026-09-04T11:59:10Z",
        hostedCompletedAt: "2026-09-04T12:00:00Z",
        receipts: {
          semantic: outcomeClass === "VALID_NON_AUTHORITATIVE" ? "semantic-v1" : null,
          hosted: "hosted-v1",
          artifactBinding: outcomeClass === "INFRASTRUCTURE_INVALID_NO_ARTIFACT"
            ? null
            : "binding-v1",
        },
      };
    },
  };
}

function releaseFixture(assets) {
  const repository = crawlPhaseDiagnosticPublicationIdentity.repository;
  const tag = crawlPhaseDiagnosticPublicationIdentity.tag;
  const releaseId = 900_001;
  return {
    id: releaseId,
    tag_name: tag,
    target_commitish: targetSha,
    immutable: true,
    draft: false,
    prerelease: false,
    published_at: "2026-09-04T12:01:00Z",
    url: `https://api.github.com/repos/${repository}/releases/${releaseId}`,
    assets_url: `https://api.github.com/repos/${repository}/releases/${releaseId}/assets`,
    upload_url: `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets{?name,label}`,
    html_url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets: Object.keys(assets).map((name, index) => ({
      id: 910_000 + index,
      name,
      state: "uploaded",
      size: assets[name].byteLength,
      digest: `sha256:${hash(assets[name])}`,
      url: `https://api.github.com/repos/${repository}/releases/assets/${910_000 + index}`,
      browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
    })),
  };
}

function tagRefFixture(tag, sha) {
  const repository = crawlPhaseDiagnosticPublicationIdentity.repository;
  return {
    ref: `refs/tags/${tag}`,
    url: `https://api.github.com/repos/${repository}/git/refs/tags/${encodeURIComponent(tag)}`,
    object: {
      type: "commit",
      sha,
      url: `https://api.github.com/repos/${repository}/git/commits/${sha}`,
    },
  };
}

function commitFixture(sha, parentSha) {
  const repository = crawlPhaseDiagnosticPublicationIdentity.repository;
  return {
    sha,
    url: `https://api.github.com/repos/${repository}/commits/${sha}`,
    html_url: `https://github.com/${repository}/commit/${sha}`,
    commit: { tree: {
      sha: "f".repeat(40),
      url: `https://api.github.com/repos/${repository}/git/trees/${"f".repeat(40)}`,
    } },
    parents: [{
      sha: parentSha,
      url: `https://api.github.com/repos/${repository}/commits/${parentSha}`,
      html_url: `https://github.com/${repository}/commit/${parentSha}`,
    }],
  };
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
}

function zipBytes(entries) {
  const archive = new AdmZip();
  for (const [name, bytes] of entries) archive.addFile(name, Buffer.from(bytes));
  return archive.toBuffer();
}

function cloneMap(value) {
  return Object.fromEntries(Object.entries(value).map(([name, bytes]) => [name, Buffer.from(bytes)]));
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
