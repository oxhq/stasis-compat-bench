import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import AdmZip from "adm-zip";

import {
  bindPerformanceReplicationArtifacts,
  performanceReplicationArtifactBindingSchema,
} from "../src/performance/replication-artifact-binding.mjs";
import {
  performanceReplicationContractIdentity,
  performanceReplicationExpectedArtifactNames,
  performanceReplicationExpectedJobNames,
  performanceReplicationHostedIdentity,
  performanceReplicationHostedProvenanceSchema,
} from "../src/performance/replication-hosted-provenance.mjs";
import {
  performanceReplicationVerificationSchema,
} from "../src/performance/replication.mjs";

const archiveName = Object.freeze({
  rwa: "stasis-v0.3.3-performance-rwa-raw-attempt-1",
  crawl: "stasis-v0.3.3-performance-crawl-raw-attempt-1",
  combined: "stasis-v0.3.3-performance-combined-attempt-1",
});
const combinedNames = Object.freeze([
  "combined-evidence.json",
  "combined-evidence.md",
  "combined-verification.json",
  "crawl-raw.json",
  "independent-statistics-replay.json",
  "rwa-raw.json",
]);
const hostedRunId = 33860000000;
const hostedCreatedAt = "2026-09-04T12:00:00Z";
const hostedStartedAt = "2026-09-04T12:01:00Z";

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileIdentity(bytes) {
  return { bytes: bytes.byteLength, sha256: hash(bytes) };
}

function zip(entries) {
  const value = new AdmZip();
  for (const [name, bytes] of entries) value.addFile(name, bytes);
  return value.toBuffer();
}

function checksumBytes(entries) {
  return Buffer.from(combinedNames.map((name) =>
    `${hash(entries.get(`performance/${name}`))}  ${name}\n`
  ).join(""), "utf8");
}

function makeFixture() {
  const rwaRaw = Buffer.from(
    '{"lane":"rwa","privateRawMarker":"must-not-enter-receipt"}\n',
    "utf8",
  );
  const crawlRaw = Buffer.from(
    '{"lane":"crawl","privateRawMarker":"must-not-enter-receipt"}\n',
    "utf8",
  );
  const combinedEntries = new Map([
    ["performance/combined-evidence.json", Buffer.from('{"combined":true}\n', "utf8")],
    ["performance/combined-evidence.md", Buffer.from("# Combined evidence\n", "utf8")],
    ["performance/combined-verification.json", Buffer.from('{"status":"passed"}\n', "utf8")],
    ["performance/crawl-raw.json", Buffer.from(crawlRaw)],
    ["performance/independent-statistics-replay.json", Buffer.from('{"replay":"passed"}\n', "utf8")],
    ["performance/rwa-raw.json", Buffer.from(rwaRaw)],
  ]);
  combinedEntries.set("performance/SHA256SUMS.txt", checksumBytes(combinedEntries));

  const archives = Object.fromEntries(performanceReplicationExpectedArtifactNames.map(
    (name, index) => [name, zip([[`opaque-${index}.txt`, Buffer.from(`opaque-${index}\n`)]])],
  ));
  archives[archiveName.rwa] = zip([["rwa-raw.json", rwaRaw]]);
  archives[archiveName.crawl] = zip([["crawl-raw.json", crawlRaw]]);
  archives[archiveName.combined] = zip([...combinedEntries]);

  const workflow = {
    provider: "github-actions",
    repository: performanceReplicationHostedIdentity.repository,
    workflow: performanceReplicationHostedIdentity.workflow.name,
    runId: String(hostedRunId),
    runAttempt: String(performanceReplicationHostedIdentity.runAttempt),
    workflowSourceSha: performanceReplicationHostedIdentity.headSha,
    workflowSourceRef: `refs/heads/${performanceReplicationHostedIdentity.headBranch}`,
    jobs: { rwa: "windows-rwa", crawl: "ubuntu-crawl" },
  };
  const placeholder = Buffer.from("original\n", "utf8");
  const semanticReceipt = {
    schema: performanceReplicationVerificationSchema,
    protocolStatus: "protocol_valid",
    pooling: "none",
    claimBoundary: "two_separate_single_host_observations_only",
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    originalAssetIdentityDeclaration: { retained: true },
    tracks: {
      rwa: {
        protocolStatus: "protocol_valid",
        observations: { fresh: { workflow: structuredClone(workflow) } },
      },
      crawl: {
        protocolStatus: "protocol_valid",
        observations: { fresh: { workflow: structuredClone(workflow) } },
      },
    },
    fileBoundary: {
      originalAssetSha256Verified: true,
      canonicalJsonVerified: true,
      allInputAndOutputPathsDistinct: true,
      outputCreation: "fsynced_sibling_temp_no_clobber_link",
      authoritativeReceiptPromotedLast: true,
      inputs: {
        original: {
          rwa: fileIdentity(placeholder),
          crawl: fileIdentity(placeholder),
          combined: fileIdentity(placeholder),
        },
        fresh: {
          rwa: fileIdentity(rwaRaw),
          crawl: fileIdentity(crawlRaw),
          combined: fileIdentity(combinedEntries.get("performance/combined-evidence.json")),
        },
      },
    },
  };
  return {
    semanticReceipt,
    hostedReceipt: hostedReceiptFor(archives),
    archives,
    rwaRaw,
    crawlRaw,
    combinedEntries,
  };
}

function hostedReceiptFor(archives) {
  return {
    schema: performanceReplicationHostedProvenanceSchema,
    status: "passed",
    producer: {
      repository: performanceReplicationHostedIdentity.repository,
      repositoryId: 12345,
      workflowId: performanceReplicationHostedIdentity.workflow.id,
      workflowName: performanceReplicationHostedIdentity.workflow.name,
      workflowPath: performanceReplicationHostedIdentity.workflow.path,
      event: performanceReplicationHostedIdentity.event,
      headBranch: performanceReplicationHostedIdentity.headBranch,
      headSha: performanceReplicationHostedIdentity.headSha,
      runId: hostedRunId,
      runAttempt: performanceReplicationHostedIdentity.runAttempt,
      status: "completed",
      conclusion: "success",
      createdAt: hostedCreatedAt,
      runStartedAt: hostedStartedAt,
    },
    oneShot: {
      completeListing: true,
      enumeratedRunCount: 1,
      matchingRunCount: 1,
      selectedRunId: hostedRunId,
    },
    contract: {
      repository: performanceReplicationContractIdentity.repository,
      tag: performanceReplicationContractIdentity.tag,
      releaseId: 250000001,
      immutable: true,
      draft: false,
      prerelease: false,
      publishedAt: "2026-09-04T11:00:00Z",
      targetCommitSha: "d".repeat(40),
      soleParentSha: performanceReplicationContractIdentity.soleParentSha,
      treeSha: "e".repeat(40),
      asset: {
        name: performanceReplicationContractIdentity.assetName,
        id: 310000001,
        sizeInBytes: 4096,
        digest: `sha256:${"c".repeat(64)}`,
      },
    },
    jobs: performanceReplicationExpectedJobNames.map((name, index) => ({
      name,
      id: 1000 + index,
      status: "completed",
      conclusion: "success",
    })),
    artifacts: performanceReplicationExpectedArtifactNames.map((name, index) => ({
      name,
      id: 2000 + index,
      sizeInBytes: archives[name].byteLength,
      digest: `sha256:${hash(archives[name])}`,
    })),
    verification: {
      exactPreregisteredRunIdentity: true,
      completeWorkflowRunsListing: true,
      exactlyOneMatchingFirstAttemptRun: true,
      immutableContractPublishedBeforeRun: true,
      contractCommitHasSoleFrozenParent: true,
      publicApiRepositoryUrlsVerified: true,
      originalRunAndJobIdsRejected: true,
      exactlyFourSuccessfulBenchmarkJobs: true,
      exactlySevenBoundAttemptOneArtifacts: true,
      expiredArtifactsRejected: true,
      urlsRetained: false,
    },
  };
}

function bind(fixture) {
  return bindPerformanceReplicationArtifacts({
    semanticReceipt: fixture.semanticReceipt,
    hostedReceipt: fixture.hostedReceipt,
    artifactZipBytes: fixture.archives,
  });
}

function replaceAllBytes(bytes, from, to) {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to));
  const changed = Buffer.from(bytes);
  const needle = Buffer.from(from, "utf8");
  const replacement = Buffer.from(to, "utf8");
  let offset = 0;
  let count = 0;
  for (;;) {
    const index = changed.indexOf(needle, offset);
    if (index < 0) break;
    replacement.copy(changed, index);
    offset = index + replacement.byteLength;
    count += 1;
  }
  assert.equal(count >= 2, true);
  return changed;
}

test("artifact joiner binds all seven ZIPs and returns a deterministic URL-free receipt", () => {
  const fixture = makeFixture();
  const first = bind(fixture);
  const second = bind(fixture);

  assert.deepEqual(first, second);
  assert.equal(first.schema, performanceReplicationArtifactBindingSchema);
  assert.equal(first.status, "passed");
  assert.equal(first.pooling, "none");
  assert.equal(first.decisionState, "STAY_0_4_UNASSIGNED");
  assert.equal(first.generalizedSpeedClaimAuthorized, false);
  assert.equal(first.implementationWorkAuthorized, false);
  assert.equal(first.artifactArchives.length, 7);
  assert.deepEqual(first.artifactArchives.map(({ name }) => name),
    performanceReplicationExpectedArtifactNames);
  assert.equal(first.extractedFiles.rwaLaneRaw.sha256, hash(fixture.rwaRaw));
  assert.equal(first.extractedFiles.crawlLaneRaw.sha256, hash(fixture.crawlRaw));
  assert.equal(first.extractedFiles.combinedArchive.length, 7);
  assert.equal(first.inputs.workflow.jobs.rwa.lane, "windows-rwa");
  assert.equal(first.inputs.workflow.jobs.rwa.hostedJobId, 1001);
  assert.equal(first.inputs.workflow.jobs.crawl.lane, "ubuntu-crawl");
  assert.equal(first.inputs.workflow.jobs.crawl.hostedJobId, 1002);
  assert.equal(first.verification.laneRawCopiesByteIdentical, true);
  assert.equal(first.verification.combinedChecksumsExact, true);
  assert.equal(first.verification.urlsRetained, false);
  assert.equal(Object.isFrozen(first), true);
  const rendered = JSON.stringify(first);
  assert.equal(rendered.includes("must-not-enter-receipt"), false);
  assert.equal(/https?:\/\//u.test(rendered), false);
});

test("artifact joiner requires each hosted ZIP's exact digest and positive size", async (context) => {
  await context.test("digest mismatch", () => {
    const fixture = makeFixture();
    const changed = Buffer.from(fixture.archives[archiveName.rwa]);
    changed[changed.length - 1] ^= 1;
    fixture.archives[archiveName.rwa] = changed;
    assert.throws(() => bind(fixture), /SHA-256 does not match hosted metadata/u);
  });

  await context.test("size mismatch", () => {
    const fixture = makeFixture();
    const metadata = fixture.hostedReceipt.artifacts.find(
      ({ name }) => name === archiveName.rwa,
    );
    metadata.sizeInBytes += 1;
    assert.throws(() => bind(fixture), /size does not match hosted metadata/u);
  });

  await context.test("non-positive size", () => {
    const fixture = makeFixture();
    const metadata = fixture.hostedReceipt.artifacts.find(
      ({ name }) => name === archiveName.rwa,
    );
    metadata.sizeInBytes = 0;
    assert.throws(() => bind(fixture), /artifact identity is invalid/u);
  });
});

test("artifact ZIP inventory rejects unsafe, extra, missing, directory, and duplicate entries", async (context) => {
  await context.test("unsafe", () => {
    const fixture = makeFixture();
    const ordinary = zip([["xx/evil.json", Buffer.from("bad")]]);
    fixture.archives[archiveName.rwa] = replaceAllBytes(
      ordinary,
      "xx/evil.json",
      "../evil.json",
    );
    fixture.hostedReceipt = hostedReceiptFor(fixture.archives);
    assert.throws(() => bind(fixture), /unsafe entry name/u);
  });

  await context.test("extra", () => {
    const fixture = makeFixture();
    fixture.archives[archiveName.rwa] = zip([
      ["rwa-raw.json", fixture.rwaRaw],
      ["extra.txt", Buffer.from("extra")],
    ]);
    fixture.hostedReceipt = hostedReceiptFor(fixture.archives);
    assert.throws(() => bind(fixture), /inventory is not exact/u);
  });

  await context.test("missing", () => {
    const fixture = makeFixture();
    fixture.archives[archiveName.rwa] = zip([["not-rwa.json", fixture.rwaRaw]]);
    fixture.hostedReceipt = hostedReceiptFor(fixture.archives);
    assert.throws(() => bind(fixture), /inventory is not exact/u);
  });

  await context.test("directory", () => {
    const fixture = makeFixture();
    fixture.archives[archiveName.rwa] = zip([["rwa-raw.json/", Buffer.alloc(0)]]);
    fixture.hostedReceipt = hostedReceiptFor(fixture.archives);
    assert.throws(() => bind(fixture), /directory entry/u);
  });

  await context.test("duplicate", () => {
    const fixture = makeFixture();
    const ordinary = zip([
      ["rwa-raw.json", fixture.rwaRaw],
      ["xxx-raw.json", Buffer.from("second")],
    ]);
    fixture.archives[archiveName.rwa] = replaceAllBytes(
      ordinary,
      "xxx-raw.json",
      "rwa-raw.json",
    );
    fixture.hostedReceipt = hostedReceiptFor(fixture.archives);
    assert.throws(() => bind(fixture), /duplicate entry/u);
  });
});

test("artifact joiner rejects lane/combined byte drift and checksum drift", async (context) => {
  await context.test("lane copy differs", () => {
    const fixture = makeFixture();
    const changedEntries = new Map(fixture.combinedEntries);
    changedEntries.set("performance/rwa-raw.json", Buffer.from("different\n"));
    changedEntries.set("performance/SHA256SUMS.txt", checksumBytes(changedEntries));
    fixture.archives[archiveName.combined] = zip([...changedEntries]);
    fixture.hostedReceipt = hostedReceiptFor(fixture.archives);
    assert.throws(() => bind(fixture), /lane raw bytes differ/u);
  });

  await context.test("checksum differs", () => {
    const fixture = makeFixture();
    const changedEntries = new Map(fixture.combinedEntries);
    const manifest = Buffer.from(changedEntries.get("performance/SHA256SUMS.txt"));
    manifest[0] = manifest[0] === 0x61 ? 0x62 : 0x61;
    changedEntries.set("performance/SHA256SUMS.txt", manifest);
    fixture.archives[archiveName.combined] = zip([...changedEntries]);
    fixture.hostedReceipt = hostedReceiptFor(fixture.archives);
    assert.throws(() => bind(fixture), /exact six-entry non-self manifest/u);
  });
});

test("artifact joiner cross-binds semantic file sizes and hashes", () => {
  for (const item of ["rwa", "crawl", "combined"]) {
    for (const field of ["bytes", "sha256"]) {
      const fixture = makeFixture();
      const identity = fixture.semanticReceipt.fileBoundary.inputs.fresh[item];
      identity[field] = field === "bytes" ? identity.bytes + 1 : "f".repeat(64);
      assert.throws(() => bind(fixture), /semantic file boundary/u);
    }
  }
});

test("artifact joiner rejects run, SHA, ref, and lane-job receipt mismatch", async (context) => {
  const scenarios = [
    ["run", (workflow) => { workflow.runId = "9"; }],
    ["run attempt", (workflow) => { workflow.runAttempt = "2"; }],
    ["SHA", (workflow) => { workflow.workflowSourceSha = "b".repeat(40); }],
    ["ref", (workflow) => { workflow.workflowSourceRef = "refs/heads/wrong"; }],
    ["lane job", (workflow) => { workflow.jobs.rwa = "wrong-rwa"; }],
  ];
  for (const [name, mutate] of scenarios) {
    await context.test(name, () => {
      const fixture = makeFixture();
      for (const lane of ["rwa", "crawl"]) {
        mutate(fixture.semanticReceipt.tracks[lane].observations.fresh.workflow);
      }
      assert.throws(() => bind(fixture), /workflow|job/u);
    });
  }
});

test("artifact joiner requires the stabilized one-shot and contract proof fields", async (context) => {
  const scenarios = [
    ["one-shot receipt", (fixture) => { delete fixture.hostedReceipt.oneShot; }],
    ["contract receipt", (fixture) => { delete fixture.hostedReceipt.contract; }],
    ["producer timestamps", (fixture) => { delete fixture.hostedReceipt.producer.createdAt; }],
    ["semantic output mode", (fixture) => {
      fixture.semanticReceipt.fileBoundary.outputCreation = "exclusive_wx";
    }],
    ["semantic receipt promotion", (fixture) => {
      fixture.semanticReceipt.fileBoundary.authoritativeReceiptPromotedLast = false;
    }],
    ["one-shot run binding", (fixture) => { fixture.hostedReceipt.oneShot.selectedRunId += 1; }],
    ["contract publication", (fixture) => {
      fixture.hostedReceipt.contract.publishedAt = hostedCreatedAt;
    }],
    ["complete listing verification", (fixture) => {
      fixture.hostedReceipt.verification.completeWorkflowRunsListing = false;
    }],
    ["one matching run verification", (fixture) => {
      fixture.hostedReceipt.verification.exactlyOneMatchingFirstAttemptRun = false;
    }],
    ["immutable contract verification", (fixture) => {
      fixture.hostedReceipt.verification.immutableContractPublishedBeforeRun = false;
    }],
    ["frozen parent verification", (fixture) => {
      fixture.hostedReceipt.verification.contractCommitHasSoleFrozenParent = false;
    }],
    ["repository URL verification", (fixture) => {
      fixture.hostedReceipt.verification.publicApiRepositoryUrlsVerified = false;
    }],
  ];
  for (const [name, mutate] of scenarios) {
    await context.test(name, () => {
      const fixture = makeFixture();
      mutate(fixture);
      assert.throws(
        () => bind(fixture),
        /unexpected|one-shot|contract|producer|verification|file boundary/u,
      );
    });
  }
});

test("artifact joiner rejects any claim, pooling, decision, or implementation escalation", () => {
  const scenarios = [
    ["pooling", "pooled"],
    ["claimBoundary", "generalized"],
    ["decisionState", "ASSIGN_0_4"],
    ["generalizedSpeedClaimAuthorized", true],
    ["implementationWorkAuthorized", true],
  ];
  for (const [field, value] of scenarios) {
    const fixture = makeFixture();
    fixture.semanticReceipt[field] = value;
    assert.throws(() => bind(fixture), /escalates|claim boundary/u);
  }
});

test("artifact joiner requires the exact seven-key Buffer object", () => {
  const missing = makeFixture();
  delete missing.archives[performanceReplicationExpectedArtifactNames[0]];
  assert.throws(() => bind(missing), /unexpected or missing fields/u);

  const extra = makeFixture();
  extra.archives.unexpected = Buffer.from("x");
  assert.throws(() => bind(extra), /unexpected or missing fields/u);

  const nonBuffer = makeFixture();
  nonBuffer.archives[performanceReplicationExpectedArtifactNames[0]] = new Uint8Array([1]);
  nonBuffer.hostedReceipt = hostedReceiptFor(Object.fromEntries(
    Object.entries(nonBuffer.archives).map(([name, bytes]) => [name, Buffer.from(bytes)]),
  ));
  assert.throws(() => bind(nonBuffer), /exact byte Buffer/u);
});
