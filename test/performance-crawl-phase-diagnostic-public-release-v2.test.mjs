import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  crawlPhaseDiagnosticComparisonEvidenceIdentity,
  crawlPhaseDiagnosticComparisonEvidenceTargetSha,
  crawlPhaseDiagnosticContractIdentity,
  crawlPhaseDiagnosticOutcomeClasses,
  crawlPhaseDiagnosticPublicationAssetNamesByOutcome,
  crawlPhaseDiagnosticPublicationIdentity,
  crawlPhaseDiagnosticReleaseVerificationSchema,
} from "../src/performance/crawl-phase-diagnostic-publication-v2.mjs";
import {
  crawlPhaseDiagnosticAnonymousFetchPolicy,
  crawlPhaseDiagnosticAnonymousReleaseVerificationSchema,
  verifyAnonymousCrawlPhaseDiagnosticV1Motivation,
  verifyAnonymousCrawlPhaseDiagnosticPublicRelease,
} from "../src/performance/crawl-phase-diagnostic-public-release-v2.mjs";
import {
  crawlPhaseDiagnosticV1InvalidIdentity,
  verifyCrawlPhaseDiagnosticHostedProvenance,
} from "../src/performance/crawl-phase-diagnostic-hosted-provenance-v2.mjs";
import {
  createCrawlPhaseDiagnosticHostedFixture,
} from "./fixtures/crawl-phase-diagnostic-hosted-fixture-v2.mjs";

const targetSha = "d".repeat(40);
const releaseId = 987_654;
const contractReleaseId = 987_653;
const acceptFixturePreflightBinding = (_preflight, hosted) => hosted;
const invalidV1PublicReceiptBytes = readFileSync(new URL(
  "./fixtures/stasis-diagnostic-public-receipt-ff081f0.json",
  import.meta.url,
));

test("anonymous verifier resolves three lightweight tags and downloads every outcome inventory without credentials", async () => {
  for (const outcomeClass of crawlPhaseDiagnosticOutcomeClasses) {
    const fixture = publicFixture(outcomeClass);
    const harness = fetchHarness(fixture);
    let releaseInput;
    const result = await verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
      expectedOfflineAssetMap: fixture.expectedMap,
      expectedReleaseTargetSha: targetSha,
    }, {
      assertPreflightHostedBinding: acceptFixturePreflightBinding,
      fetchImpl: harness.fetch,
      verifyRelease(input) {
        releaseInput = input;
        return releaseVerificationReceipt(fixture);
      },
    });
    assert.equal(result.schema, crawlPhaseDiagnosticAnonymousReleaseVerificationSchema);
    assert.equal(result.outcomeClass, outcomeClass);
    assert.equal(result.release.targetCommitSha, targetSha);
    assert.equal(result.release.tagBindings.comparison.objectSha,
      crawlPhaseDiagnosticComparisonEvidenceTargetSha);
    assert.equal(result.release.tagBindings.contract.objectSha, targetSha);
    assert.equal(result.release.tagBindings.evidence.objectSha, targetSha);
    assert.equal(result.contract.releaseId, contractReleaseId);
    assert.equal(result.contract.targetCommitSha, targetSha);
    assert.equal(result.contract.assetCount, 3);
    assert.equal(result.invalidV1Motivation.status, "passed");
    assert.equal(result.invalidV1Motivation.receipt.sha256,
      crawlPhaseDiagnosticV1InvalidIdentity.publicVerificationRelease.receipt.sha256);
    assert.deepEqual(result.contract.assets.map(({ name }) => name),
      Object.values(crawlPhaseDiagnosticContractIdentity.assets).sort(compareUtf8));
    assert.deepEqual(result.transport, crawlPhaseDiagnosticAnonymousFetchPolicy);
    assert.equal(result.assetByteMap.length,
      crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass].length);
    assert.equal(result.authorityEligible, false);
    assert.equal(result.timingEligible, false);
    assert.equal(result.statisticsEligible, false);
    assert.equal(result.comparisonEligible, false);
    assert.equal(result.optimizationEligible, false);
    assert.equal(result.generalizedSpeedClaimAuthorized, false);
    assert.equal(result.implementationWorkAuthorized, false);
    assert.equal(result.decisionState, "STAY_0_4_UNASSIGNED");
    assert.equal(result.verification.allThreeTagsVerifiedLightweight, true);
    assert.equal(result.verification.exactThreeContractAssetInventory, true);
    assert.equal(result.verification.contractAssetGitBlobsMatchDiagnosticTarget, true);
    assert.equal(result.verification.currentContractStateMatchesRetainedEvidence, true);
    assert.equal(result.verification.contractPreflightMatchesHostedEvidence, true);
    assert.equal(result.verification.contractWorkflowAssetMatchesHostedEvidence, true);
    assert.equal(result.verification.targetDirectSuccessorOfH4, true);
    assert.equal(result.verification.invalidV1EvidenceReleaseFetchedWithoutCredentials, true);
    assert.equal(result.verification.exactInvalidV1PublicReceiptBytesVerified, true);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.assetByteMap), true);
    assert.equal(releaseInput.expectedReleaseTargetSha, targetSha);
    assert.equal(releaseInput.comparisonTagRefRecord.object.sha,
      crawlPhaseDiagnosticComparisonEvidenceTargetSha);
    assert.equal(releaseInput.contractTagRefRecord.object.sha, targetSha);
    assert.equal(releaseInput.releaseTagRefRecord.object.sha, targetSha);
    assert.deepEqual(releaseInput.anonymousDownloadedAssetBytes, fixture.assetBytes);
    assert.equal(
      harness.calls.length,
      27 + 2 * crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass].length,
    );
    for (const call of harness.calls) {
      assert.equal(call.options.method, "GET");
      assert.equal(call.options.redirect, "manual");
      assert.equal(call.options.credentials, "omit");
      assert.equal(call.options.referrerPolicy, "no-referrer");
      assert.equal(call.options.headers["Accept-Encoding"], "identity");
      assert.equal(JSON.stringify(call.options.headers).match(/authorization|cookie/iu), null);
    }
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("https://"), false);
    assert.equal(serialized.includes("fixture-bytes"), false);
  }
});

test("anonymous V1 motivation replay binds H2 evidence, H3 errata, and exact receipt bytes", async () => {
  const fixture = publicFixture("DIAGNOSTIC_INVALID_WITH_STATUS");
  const harness = fetchHarness(fixture);
  const result = await verifyAnonymousCrawlPhaseDiagnosticV1Motivation({
    fetchImpl: harness.fetch,
  });
  assert.equal(result.status, "passed");
  assert.equal(result.purpose, "invalid_v1_public_motivation_only");
  assert.equal(result.evidenceRelease.tagTargetSha,
    crawlPhaseDiagnosticV1InvalidIdentity.evidenceRelease.targetCommitSha);
  assert.equal(result.verifierErratumRelease.tagTargetSha,
    crawlPhaseDiagnosticV1InvalidIdentity.verifierErratumRelease.targetCommitSha);
  assert.equal(result.publicVerificationRelease.tagTargetSha,
    crawlPhaseDiagnosticV1InvalidIdentity.publicVerificationRelease.targetCommitSha);
  assert.equal(result.receipt.bytes, invalidV1PublicReceiptBytes.byteLength);
  assert.equal(result.receipt.sha256, hash(invalidV1PublicReceiptBytes));
  assert.equal(harness.calls.length, 8);

  const annotated = publicFixture("DIAGNOSTIC_INVALID_WITH_STATUS");
  annotated.invalidV1.erratumTagRef.object.type = "tag";
  await assert.rejects(
    verifyAnonymousCrawlPhaseDiagnosticV1Motivation({
      fetchImpl: fetchHarness(annotated).fetch,
    }),
    /lightweight/u,
  );

  const changedReceipt = publicFixture("DIAGNOSTIC_INVALID_WITH_STATUS");
  changedReceipt.invalidV1.publicReceiptBytes[100] ^= 1;
  await assert.rejects(
    verifyAnonymousCrawlPhaseDiagnosticV1Motivation({
      fetchImpl: fetchHarness(changedReceipt).fetch,
    }),
    /byte identity/u,
  );
});

test("offline map must match exactly one bounded 22, 17, or 15 asset inventory before network", async () => {
  const fixture = publicFixture("VALID_NON_AUTHORITATIVE");
  const first = crawlPhaseDiagnosticPublicationAssetNamesByOutcome.VALID_NON_AUTHORITATIVE[0];
  const cases = [
    (map) => { delete map[first]; },
    (map) => { map.extra = { bytes: 1, sha256: "0".repeat(64) }; },
    (map) => { map[first].bytes = 0; },
    (map) => { map[first].bytes = crawlPhaseDiagnosticAnonymousFetchPolicy.maximumAssetBytes + 1; },
    (map) => { map[first].sha256 = "A".repeat(64); },
    (map) => { map[first].extra = true; },
  ];
  for (const mutate of cases) {
    const map = structuredClone(fixture.expectedMap);
    mutate(map);
    let calls = 0;
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: map,
        expectedReleaseTargetSha: targetSha,
      }, {
        assertPreflightHostedBinding: acceptFixturePreflightBinding,
        fetchImpl: async () => { calls += 1; },
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /offline|inventory|identity|byte bound/iu,
    );
    assert.equal(calls, 0);
  }
});

test("release state and exact outcome inventory are rejected before asset downloads", async () => {
  const cases = [
    (release) => { release.tag_name = "wrong"; },
    (release) => { release.target_commitish = "a".repeat(40); },
    (release) => { release.immutable = false; },
    (release) => { release.draft = true; },
    (release) => { release.prerelease = true; },
    (release) => { release.assets.pop(); },
    (release) => { release.assets[0].size += 1; },
    (release) => { release.assets[0].digest = `sha256:${"0".repeat(64)}`; },
    (release) => { release.assets[1].id = release.assets[0].id; },
  ];
  for (const mutate of cases) {
    const fixture = publicFixture("DIAGNOSTIC_INVALID_WITH_STATUS");
    mutate(fixture.releaseRecord);
    const harness = fetchHarness(fixture);
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: fixture.expectedMap,
        expectedReleaseTargetSha: targetSha,
      }, {
        assertPreflightHostedBinding: acceptFixturePreflightBinding,
        fetchImpl: harness.fetch,
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /release|asset|inventory|metadata/iu,
    );
    assert.equal(harness.assetRequests, 0);
  }
});

test("comparison, contract, and evidence refs must all be lightweight and exact", async () => {
  for (const [field, mutate] of [
    ["comparisonTagRef", (value) => { value.object.sha = "a".repeat(40); }],
    ["contractTagRef", (value) => { value.object.type = "tag"; }],
    ["evidenceTagRef", (value) => { value.ref = "refs/tags/wrong"; }],
  ]) {
    const fixture = publicFixture("VALID_NON_AUTHORITATIVE");
    mutate(fixture[field]);
    const harness = fetchHarness(fixture);
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: fixture.expectedMap,
        expectedReleaseTargetSha: targetSha,
      }, {
        assertPreflightHostedBinding: acceptFixturePreflightBinding,
        fetchImpl: harness.fetch,
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /tag|ref|lightweight|exact/iu,
    );
    assert.equal(harness.assetRequests, 0);
  }
});

test("V2 evidence target must be the sole direct child of H4", async () => {
  for (const mutate of [
    (commit) => { commit.sha = "a".repeat(40); },
    (commit) => { commit.parents = []; },
    (commit) => { commit.parents.push(structuredClone(commit.parents[0])); },
    (commit) => { commit.parents[0].sha = "b".repeat(40); },
  ]) {
    const fixture = publicFixture("INFRASTRUCTURE_INVALID_NO_ARTIFACT");
    mutate(fixture.commitRecord);
    const harness = fetchHarness(fixture);
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: fixture.expectedMap,
        expectedReleaseTargetSha: targetSha,
      }, {
        assertPreflightHostedBinding: acceptFixturePreflightBinding,
        fetchImpl: harness.fetch,
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /commit|parent|successor/u,
    );
    assert.equal(harness.assetRequests, 0);
  }
});

test("anonymous contract replay rejects substituted, missing, duplicate, and extra assets", async () => {
  const cases = [
    ["missing", (fixture) => { fixture.contractReleaseRecord.assets.pop(); }],
    ["duplicate", (fixture) => {
      fixture.contractReleaseRecord.assets[1].name = fixture.contractReleaseRecord.assets[0].name;
    }],
    ["extra", (fixture) => {
      fixture.contractReleaseRecord.assets.push({
        ...fixture.contractReleaseRecord.assets[0],
        id: 799_999,
        name: "unexpected-contract-asset.txt",
      });
    }],
    ["substituted", (fixture) => {
      const name = crawlPhaseDiagnosticContractIdentity.assets.protocol;
      const bytes = Buffer.from(fixture.contractAssetBytes[name]);
      bytes[0] ^= 0x01;
      fixture.contractAssetBytes[name] = bytes;
    }],
  ];
  for (const [label, mutate] of cases) {
    const fixture = publicFixture("VALID_NON_AUTHORITATIVE");
    mutate(fixture);
    const harness = fetchHarness(fixture);
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: fixture.expectedMap,
        expectedReleaseTargetSha: targetSha,
      }, {
        assertPreflightHostedBinding: acceptFixturePreflightBinding,
        fetchImpl: harness.fetch,
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /contract|asset|inventory|bytes|duplicated/iu,
      label,
    );
  }
});

test("anonymous contract replay rejects digest, size, blob, tag, commit, and retained-state drift", async () => {
  const cases = [
    ["digest", (fixture) => {
      fixture.contractReleaseRecord.assets[0].digest = `sha256:${"0".repeat(64)}`;
    }],
    ["size", (fixture) => { fixture.contractReleaseRecord.assets[0].size += 1; }],
    ["blob", (fixture) => { fixture.commitRecord.files[0].sha = "0".repeat(40); }],
    ["blob URL encoding", (fixture) => {
      fixture.commitRecord.files[0].blob_url =
        fixture.commitRecord.files[0].blob_url.replaceAll("%2F", "/");
    }],
    ["tag", (fixture) => { fixture.contractReleaseRecord.tag_name = "wrong"; }],
    ["commit", (fixture) => {
      const treeSha = "f".repeat(40);
      fixture.commitRecord.commit.tree.sha = treeSha;
      fixture.commitRecord.commit.tree.url =
        `https://api.github.com/repos/${crawlPhaseDiagnosticPublicationIdentity.repository}/git/trees/${treeSha}`;
    }],
    ["retained release", (fixture) => {
      const retained = structuredClone(fixture.contractReleaseRecord);
      retained.published_at = "2026-09-04T12:00:01Z";
      replaceEvidenceAsset(fixture, "contract-release.json", canonicalBytes(retained));
    }],
    ["retained commit", (fixture) => {
      const retained = structuredClone(fixture.commitRecord);
      retained.commit.tree.sha = "f".repeat(40);
      retained.commit.tree.url =
        `https://api.github.com/repos/${crawlPhaseDiagnosticPublicationIdentity.repository}/git/trees/${"f".repeat(40)}`;
      replaceEvidenceAsset(fixture, "contract-commit.json", canonicalBytes(retained));
    }],
  ];
  for (const [label, mutate] of cases) {
    const fixture = publicFixture("DIAGNOSTIC_INVALID_WITH_STATUS");
    mutate(fixture);
    const harness = fetchHarness(fixture);
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: fixture.expectedMap,
        expectedReleaseTargetSha: targetSha,
      }, {
        assertPreflightHostedBinding: acceptFixturePreflightBinding,
        fetchImpl: harness.fetch,
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /contract|asset|digest|length|blob|tag|commit|retained/iu,
      label,
    );
  }
});

test("anonymous replay independently rejects workflow source REST representation drift", async () => {
  const cases = [
    ["source commit URL encoding", (fixture) => {
      fixture.workflowSourceCommitRecord.files[0].raw_url =
        fixture.workflowSourceCommitRecord.files[0].raw_url.replaceAll("%2F", "/");
    }],
    ["truncated root tree", (fixture) => {
      fixture.workflowSourceTreeRecords.root.truncated = true;
    }],
    ["wrong workflows tree blob", (fixture) => {
      fixture.workflowSourceTreeRecords.workflows.tree[0].sha = "0".repeat(40);
    }],
    ["noncanonical blob wrapping", (fixture) => {
      fixture.workflowSourceBlobRecord.content =
        fixture.workflowSourceBlobRecord.content.replace("\n", " ");
    }],
  ];
  for (const [label, mutate] of cases) {
    const fixture = publicFixture("DIAGNOSTIC_INVALID_WITH_STATUS");
    mutate(fixture);
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: fixture.expectedMap,
        expectedReleaseTargetSha: targetSha,
      }, {
        fetchImpl: fetchHarness(fixture).fetch,
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /workflow|tree|blob|URL|base64/iu,
      label,
    );
  }
});

test("anonymous contract replay binds the preregistered workflow source to hosted evidence", async () => {
  const fixture = publicFixture("VALID_NON_AUTHORITATIVE");
  const result = await verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
    expectedOfflineAssetMap: fixture.expectedMap,
    expectedReleaseTargetSha: targetSha,
  }, {
    fetchImpl: fetchHarness(fixture).fetch,
    verifyRelease: () => releaseVerificationReceipt(fixture),
  });
  assert.equal(result.verification.contractPreflightMatchesHostedEvidence, true);

  const retainedHosted = JSON.parse(
    fixture.assetBytes["hosted-provenance.json"].toString("utf8"),
  );
  const driftedHosted = structuredClone(retainedHosted);
  driftedHosted.workflowSource.commitSha = "4".repeat(40);
  driftedHosted.producer.headSha = "4".repeat(40);
  replaceEvidenceAsset(
    fixture,
    "hosted-provenance.json",
    canonicalBytes(driftedHosted),
  );
  await assert.rejects(
    verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
      expectedOfflineAssetMap: fixture.expectedMap,
      expectedReleaseTargetSha: targetSha,
    }, {
      fetchImpl: fetchHarness(fixture).fetch,
      verifyRelease: () => releaseVerificationReceipt(fixture),
    }),
    /preflight workflow source differs|preflight.*hosted/iu,
  );

  const wrongWorkflowIdentity = structuredClone(retainedHosted);
  wrongWorkflowIdentity.workflowSource.workflow.bytes += 1;
  wrongWorkflowIdentity.workflowSource.workflow.sha256 = "5".repeat(64);
  replaceEvidenceAsset(
    fixture,
    "hosted-provenance.json",
    canonicalBytes(wrongWorkflowIdentity),
  );
  await assert.rejects(
    verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
      expectedOfflineAssetMap: fixture.expectedMap,
      expectedReleaseTargetSha: targetSha,
    }, {
      fetchImpl: fetchHarness(fixture).fetch,
      verifyRelease: () => releaseVerificationReceipt(fixture),
    }),
    /contract workflow asset differs from hosted receipt/u,
  );
});

test("anonymous contract replay enforces metadata and streamed-body byte bounds", async () => {
  const oversizedMetadata = publicFixture("INFRASTRUCTURE_INVALID_NO_ARTIFACT");
  oversizedMetadata.contractReleaseRecord.assets[0].size =
    crawlPhaseDiagnosticAnonymousFetchPolicy.maximumContractAssetBytes + 1;
  await assert.rejects(
    verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
      expectedOfflineAssetMap: oversizedMetadata.expectedMap,
      expectedReleaseTargetSha: targetSha,
    }, {
      assertPreflightHostedBinding: acceptFixturePreflightBinding,
      fetchImpl: fetchHarness(oversizedMetadata).fetch,
      verifyRelease: () => releaseVerificationReceipt(oversizedMetadata),
    }),
    /contract.*(?:metadata|byte bound)|byte bound/iu,
  );

  const streamedOverflow = publicFixture("INFRASTRUCTURE_INVALID_NO_ARTIFACT");
  await assert.rejects(
    verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
      expectedOfflineAssetMap: streamedOverflow.expectedMap,
      expectedReleaseTargetSha: targetSha,
    }, {
      assertPreflightHostedBinding: acceptFixturePreflightBinding,
      fetchImpl: fetchHarness(streamedOverflow, "contract_body_overflow").fetch,
      verifyRelease: () => releaseVerificationReceipt(streamedOverflow),
    }),
    /contract.*(?:byte bound|byte length)|exceeds byte bound/iu,
  );
});

test("redirects are bounded to credential-free GitHub HTTPS and bodies are byte-bounded", async () => {
  for (const mode of ["evil_redirect", "encoded", "wrong_length", "loop"]) {
    const fixture = publicFixture("DIAGNOSTIC_INVALID_WITH_STATUS");
    const harness = fetchHarness(fixture, mode);
    await assert.rejects(
      verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
        expectedOfflineAssetMap: fixture.expectedMap,
        expectedReleaseTargetSha: targetSha,
      }, {
        assertPreflightHostedBinding: acceptFixturePreflightBinding,
        fetchImpl: harness.fetch,
        verifyRelease: () => releaseVerificationReceipt(fixture),
      }),
      /HTTPS policy|encoded|Content-Length|loop/u,
    );
  }
});

test("ambient token variables never enter anonymous request headers", async () => {
  const fixture = publicFixture("INFRASTRUCTURE_INVALID_NO_ARTIFACT");
  const harness = fetchHarness(fixture);
  const old = process.env.GH_TOKEN;
  process.env.GH_TOKEN = "must-not-leak";
  try {
    await verifyAnonymousCrawlPhaseDiagnosticPublicRelease({
      expectedOfflineAssetMap: fixture.expectedMap,
      expectedReleaseTargetSha: targetSha,
    }, {
      assertPreflightHostedBinding: acceptFixturePreflightBinding,
      fetchImpl: harness.fetch,
      verifyRelease: () => releaseVerificationReceipt(fixture),
    });
  } finally {
    if (old === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = old;
  }
  assert.equal(JSON.stringify(harness.calls).includes("must-not-leak"), false);
});

function publicFixture(outcomeClass) {
  const names = crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass];
  const hostedInput = hostedInputFixture(outcomeClass);
  const hostedReceipt = verifyCrawlPhaseDiagnosticHostedProvenance(hostedInput);
  const contractAssetBytes = {
    [crawlPhaseDiagnosticContractIdentity.assets.protocol]:
      Buffer.from(hostedInput.diagnosticContractAssets.protocol),
    [crawlPhaseDiagnosticContractIdentity.assets.workflow]:
      Buffer.from(hostedInput.diagnosticContractAssets.workflow),
    [crawlPhaseDiagnosticContractIdentity.assets.preflight]:
      Buffer.from(hostedInput.diagnosticContractAssets.preflight.bytes),
  };
  const commitRecord = commitRecordFixture(contractAssetBytes);
  const contractReleaseRecord = contractReleaseRecordFixture(contractAssetBytes);
  const assetBytes = Object.fromEntries(names.map((name) => [
    name,
    Buffer.from(`fixture-bytes:${outcomeClass}:${name}\n`, "utf8"),
  ]));
  assetBytes["hosted-provenance.json"] = canonicalBytes(hostedReceipt);
  assetBytes["contract-commit.json"] = canonicalBytes(commitRecord);
  assetBytes["contract-release.json"] = canonicalBytes(contractReleaseRecord);
  const expectedMap = Object.fromEntries(names.map((name) => [name, {
    bytes: assetBytes[name].byteLength,
    sha256: hash(assetBytes[name]),
  }]));
  const releaseRecord = releaseRecordFixture(assetBytes);
  const invalidV1 = invalidV1MotivationFixture();
  return {
    outcomeClass,
    assetBytes,
    expectedMap,
    releaseRecord,
    contractAssetBytes,
    contractReleaseRecord,
    comparisonTagRef: tagRef(
      crawlPhaseDiagnosticComparisonEvidenceIdentity.tag,
      crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    ),
    contractTagRef: tagRef(crawlPhaseDiagnosticContractIdentity.tag, targetSha),
    evidenceTagRef: tagRef(crawlPhaseDiagnosticPublicationIdentity.tag, targetSha),
    commitRecord,
    workflowSourceCommitRecord: hostedInput.workflowSourceCommitRecord,
    workflowSourceTreeRecords: hostedInput.workflowSourceTreeRecords,
    workflowSourceBlobRecord: hostedInput.workflowSourceBlobRecord,
    preservedV1DiagnosticWorkflowBlobRecord:
      hostedInput.preservedV1DiagnosticWorkflowBlobRecord,
    preservedComparisonWorkflowBlobRecord:
      hostedInput.preservedComparisonWorkflowBlobRecord,
    invalidV1,
  };
}

function invalidV1MotivationFixture() {
  const identity = crawlPhaseDiagnosticV1InvalidIdentity;
  assert.equal(invalidV1PublicReceiptBytes.byteLength,
    identity.publicVerificationRelease.receipt.bytes);
  assert.equal(hash(invalidV1PublicReceiptBytes),
    identity.publicVerificationRelease.receipt.sha256);
  const publicReceipt = JSON.parse(invalidV1PublicReceiptBytes.toString("utf8"));
  const selected = new Map(Object.values(identity.evidenceRelease.selectedAssets)
    .map((asset) => [asset.name, asset]));
  const evidenceAssets = publicReceipt.assetByteMap.map((entry, index) => {
    const exact = selected.get(entry.name);
    return releaseAssetFixture(identity.evidenceRelease, {
      id: exact?.id ?? 910_000 + index,
      name: entry.name,
      bytes: exact?.bytes ?? entry.bytes,
      sha256: exact?.sha256 ?? entry.sha256,
    });
  });
  return {
    evidenceRelease: motivationReleaseFixture(identity.evidenceRelease, evidenceAssets,
      identity.evidenceRelease.targetCommitSha),
    evidenceTagRef: tagRef(identity.evidenceRelease.tag,
      identity.evidenceRelease.targetCommitSha),
    erratumRelease: motivationReleaseFixture(identity.verifierErratumRelease, [], "main"),
    erratumTagRef: tagRef(identity.verifierErratumRelease.tag,
      identity.verifierErratumRelease.targetCommitSha),
    publicRelease: motivationReleaseFixture(identity.publicVerificationRelease, [
      releaseAssetFixture(identity.publicVerificationRelease,
        identity.publicVerificationRelease.receipt),
    ], "main"),
    publicTagRef: tagRef(identity.publicVerificationRelease.tag,
      identity.publicVerificationRelease.targetCommitSha),
    publicReceiptBytes: Buffer.from(invalidV1PublicReceiptBytes),
  };
}

function motivationReleaseFixture(identity, assets, targetCommitish) {
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  return {
    id: identity.releaseId,
    tag_name: identity.tag,
    target_commitish: targetCommitish,
    immutable: true,
    draft: false,
    prerelease: false,
    created_at: identity.createdAt,
    published_at: identity.publishedAt,
    url: `${api}/releases/${identity.releaseId}`,
    assets_url: `${api}/releases/${identity.releaseId}/assets`,
    upload_url: `https://uploads.github.com/repos/${identity.repository}/releases/${identity.releaseId}/assets{?name,label}`,
    html_url: `${web}/releases/tag/${identity.tag}`,
    assets,
  };
}

function releaseAssetFixture(releaseIdentity, asset) {
  const api = `https://api.github.com/repos/${releaseIdentity.repository}`;
  const web = `https://github.com/${releaseIdentity.repository}`;
  return {
    id: asset.id,
    name: asset.name,
    state: "uploaded",
    size: asset.bytes,
    digest: `sha256:${asset.sha256}`,
    url: `${api}/releases/assets/${asset.id}`,
    browser_download_url: `${web}/releases/download/${releaseIdentity.tag}/${asset.name}`,
  };
}

function hostedInputFixture(outcomeClass) {
  if (outcomeClass === "VALID_NON_AUTHORITATIVE") {
    return createCrawlPhaseDiagnosticHostedFixture();
  }
  if (outcomeClass === "DIAGNOSTIC_INVALID_WITH_STATUS") {
    return createCrawlPhaseDiagnosticHostedFixture({ conclusion: "failure" });
  }
  return createCrawlPhaseDiagnosticHostedFixture({
    conclusion: "failure",
    artifactCount: 0,
    stepMode: "no_artifact",
  });
}

function contractReleaseRecordFixture(assetBytes) {
  const identity = crawlPhaseDiagnosticContractIdentity;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  return {
    id: contractReleaseId,
    tag_name: identity.tag,
    target_commitish: targetSha,
    immutable: true,
    draft: false,
    prerelease: false,
    published_at: "2026-09-04T12:00:00Z",
    url: `${api}/releases/${contractReleaseId}`,
    assets_url: `${api}/releases/${contractReleaseId}/assets`,
    upload_url:
      `https://uploads.github.com/repos/${identity.repository}/releases/${contractReleaseId}/assets{?name,label}`,
    html_url: `${web}/releases/tag/${identity.tag}`,
    assets: Object.keys(assetBytes).sort(compareUtf8).map((name, index) => ({
      id: 700_000 + index,
      name,
      state: "uploaded",
      size: assetBytes[name].byteLength,
      digest: `sha256:${hash(assetBytes[name])}`,
      url: `${api}/releases/assets/${700_000 + index}`,
      browser_download_url: `${web}/releases/download/${identity.tag}/${name}`,
    })),
  };
}

function releaseRecordFixture(assetBytes) {
  const identity = crawlPhaseDiagnosticPublicationIdentity;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  return {
    id: releaseId,
    tag_name: identity.tag,
    target_commitish: targetSha,
    immutable: true,
    draft: false,
    prerelease: false,
    published_at: "2026-09-04T13:00:00Z",
    url: `${api}/releases/${releaseId}`,
    assets_url: `${api}/releases/${releaseId}/assets`,
    upload_url: `https://uploads.github.com/repos/${identity.repository}/releases/${releaseId}/assets{?name,label}`,
    html_url: `${web}/releases/tag/${identity.tag}`,
    assets: Object.keys(assetBytes).map((name, index) => ({
      id: 800_000 + index,
      name,
      state: "uploaded",
      size: assetBytes[name].byteLength,
      digest: `sha256:${hash(assetBytes[name])}`,
      url: `${api}/releases/assets/${800_000 + index}`,
      browser_download_url: `${web}/releases/download/${identity.tag}/${name}`,
    })),
  };
}

function replaceEvidenceAsset(fixture, name, bytes) {
  fixture.assetBytes[name] = Buffer.from(bytes);
  fixture.expectedMap[name] = {
    bytes: bytes.byteLength,
    sha256: hash(bytes),
  };
  const metadata = fixture.releaseRecord.assets.find((asset) => asset.name === name);
  assert.notEqual(metadata, undefined);
  metadata.size = bytes.byteLength;
  metadata.digest = `sha256:${hash(bytes)}`;
}

function tagRef(tag, sha) {
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

function commitRecordFixture(contractAssetBytes) {
  const repository = crawlPhaseDiagnosticPublicationIdentity.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const web = `https://github.com/${repository}`;
  const treeSha = "e".repeat(40);
  return {
    sha: targetSha,
    url: `${api}/commits/${targetSha}`,
    html_url: `${web}/commit/${targetSha}`,
    commit: { tree: { sha: treeSha, url: `${api}/git/trees/${treeSha}` } },
    parents: [{
      sha: crawlPhaseDiagnosticContractIdentity.soleParentSha,
      url: `${api}/commits/${crawlPhaseDiagnosticContractIdentity.soleParentSha}`,
      html_url: `${web}/commit/${crawlPhaseDiagnosticContractIdentity.soleParentSha}`,
    }],
    files: Object.keys(contractAssetBytes).sort(compareUtf8).map((name) => {
      const filename = `protocol/${name}`;
      const encodedFilename = encodeURIComponent(filename);
      return {
        filename,
        status: "added",
        sha: gitBlobHash(contractAssetBytes[name]),
        blob_url: `${web}/blob/${targetSha}/${encodedFilename}`,
        raw_url: `${web}/raw/${targetSha}/${encodedFilename}`,
        contents_url: `${api}/contents/${encodedFilename}?ref=${targetSha}`,
      };
    }),
  };
}

function releaseVerificationReceipt(fixture) {
  const names = crawlPhaseDiagnosticPublicationAssetNamesByOutcome[fixture.outcomeClass];
  return {
    schema: crawlPhaseDiagnosticReleaseVerificationSchema,
    status: "passed",
    diagnosticStatus: fixture.outcomeClass === "VALID_NON_AUTHORITATIVE" ? "passed" : "failed",
    outcomeClass: fixture.outcomeClass,
    releaseId,
    contractTargetSha: targetSha,
    evidenceTargetSha: targetSha,
    comparisonEvidenceTargetSha: crawlPhaseDiagnosticComparisonEvidenceTargetSha,
    assetCount: names.length,
    assets: names.map((name) => ({ name, ...fixture.expectedMap[name] })),
    tagBindings: {
      comparison: binding(crawlPhaseDiagnosticComparisonEvidenceIdentity.tag,
        crawlPhaseDiagnosticComparisonEvidenceTargetSha),
      contract: binding(crawlPhaseDiagnosticContractIdentity.tag, targetSha),
      evidence: binding(crawlPhaseDiagnosticPublicationIdentity.tag, targetSha),
    },
    anonymousDownloadedBytesVerified: true,
    releaseImmutable: true,
    releaseDraft: false,
    releasePrerelease: false,
    contractAndEvidenceTagsShareExactTarget: true,
    targetDirectSuccessorOfH4: true,
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  };
}

function binding(tag, sha) {
  return { ref: `refs/tags/${tag}`, objectType: "commit", objectSha: sha, lightweight: true };
}

function fetchHarness(fixture, mode = "ok") {
  const calls = [];
  let assetRequests = 0;
  const json = new Map([
    [`/releases/tags/${encodeURIComponent(crawlPhaseDiagnosticPublicationIdentity.tag)}`, fixture.releaseRecord],
    [`/releases/tags/${encodeURIComponent(crawlPhaseDiagnosticContractIdentity.tag)}`, fixture.contractReleaseRecord],
    [`/git/ref/tags/${encodeURIComponent(crawlPhaseDiagnosticComparisonEvidenceIdentity.tag)}`, fixture.comparisonTagRef],
    [`/git/ref/tags/${encodeURIComponent(crawlPhaseDiagnosticContractIdentity.tag)}`, fixture.contractTagRef],
    [`/git/ref/tags/${encodeURIComponent(crawlPhaseDiagnosticPublicationIdentity.tag)}`, fixture.evidenceTagRef],
    [`/commits/${targetSha}`, fixture.commitRecord],
    [`/commits/${fixture.workflowSourceCommitRecord.sha}`, fixture.workflowSourceCommitRecord],
    [`/git/trees/${fixture.workflowSourceTreeRecords.root.sha}`,
      fixture.workflowSourceTreeRecords.root],
    [`/git/trees/${fixture.workflowSourceTreeRecords.github.sha}`,
      fixture.workflowSourceTreeRecords.github],
    [`/git/trees/${fixture.workflowSourceTreeRecords.workflows.sha}`,
      fixture.workflowSourceTreeRecords.workflows],
    [`/git/blobs/${fixture.workflowSourceBlobRecord.sha}`, fixture.workflowSourceBlobRecord],
    [`/git/blobs/${fixture.preservedV1DiagnosticWorkflowBlobRecord.sha}`,
      fixture.preservedV1DiagnosticWorkflowBlobRecord],
    [`/git/blobs/${fixture.preservedComparisonWorkflowBlobRecord.sha}`,
      fixture.preservedComparisonWorkflowBlobRecord],
    [`/releases/${crawlPhaseDiagnosticV1InvalidIdentity.evidenceRelease.releaseId}`,
      fixture.invalidV1.evidenceRelease],
    [`/git/ref/tags/${encodeURIComponent(crawlPhaseDiagnosticV1InvalidIdentity.evidenceRelease.tag)}`,
      fixture.invalidV1.evidenceTagRef],
    [`/releases/${crawlPhaseDiagnosticV1InvalidIdentity.verifierErratumRelease.releaseId}`,
      fixture.invalidV1.erratumRelease],
    [`/git/ref/tags/${encodeURIComponent(crawlPhaseDiagnosticV1InvalidIdentity.verifierErratumRelease.tag)}`,
      fixture.invalidV1.erratumTagRef],
    [`/releases/${crawlPhaseDiagnosticV1InvalidIdentity.publicVerificationRelease.releaseId}`,
      fixture.invalidV1.publicRelease],
    [`/git/ref/tags/${encodeURIComponent(crawlPhaseDiagnosticV1InvalidIdentity.publicVerificationRelease.tag)}`,
      fixture.invalidV1.publicTagRef],
  ]);
  const harness = {
    calls,
    get assetRequests() { return assetRequests; },
    async fetch(url, options) {
      calls.push({ url, options });
      const parsed = new URL(url);
      for (const [suffix, value] of json) {
        if (parsed.pathname.endsWith(suffix)) return response(JSON.stringify(value), 200);
      }
      if (parsed.hostname === "github.com") {
        assetRequests += 1;
        if (mode === "evil_redirect") return response(null, 302, { location: "https://evil.example/asset" });
        if (mode === "loop") return response(null, 302, { location: url });
        const name = decodeURIComponent(parsed.pathname.slice(parsed.pathname.lastIndexOf("/") + 1));
        return response(null, 302, { location: `https://release-assets.githubusercontent.com/${encodeURIComponent(name)}` });
      }
      if (parsed.hostname === "release-assets.githubusercontent.com") {
        const name = decodeURIComponent(parsed.pathname.slice(1));
        const bytes = fixture.contractAssetBytes[name] ?? fixture.assetBytes[name] ??
          (name === crawlPhaseDiagnosticV1InvalidIdentity.publicVerificationRelease.receipt.name
            ? fixture.invalidV1.publicReceiptBytes : undefined);
        if (mode === "contract_body_overflow" && Object.hasOwn(fixture.contractAssetBytes, name)) {
          return response(Buffer.concat([bytes, Buffer.from([0])]), 200);
        }
        if (mode === "encoded") return response(bytes, 200, { "content-encoding": "gzip" });
        if (mode === "wrong_length") return response(bytes, 200, { "content-length": String(bytes.byteLength + 1) });
        return response(bytes, 200, { "content-length": String(bytes.byteLength) });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  };
  return harness;
}

function response(body, status, headers = {}) {
  return new Response(body, { status, headers });
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobHash(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
