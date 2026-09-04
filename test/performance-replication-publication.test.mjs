import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import AdmZip from "adm-zip";

import {
  buildPerformanceReplicationPublication,
  buildPerformanceReplicationPublicationDirectory,
  performanceReplicationContractTargetSha,
  performanceReplicationPublicationAssetNames,
  performanceReplicationPublicationIdentity,
  performanceReplicationPublicationPayloadNames,
  performanceReplicationPublicationSchema,
  verifyPerformanceReplicationGitHubRelease,
  verifyPerformanceReplicationPublication,
  verifyPerformanceReplicationPublicationDirectory,
} from "../src/performance/replication-publication.mjs";
import {
  performanceReplicationArtifactBindingSchema,
} from "../src/performance/replication-artifact-binding.mjs";
import {
  performanceReplicationContractIdentity,
  performanceReplicationHostedProvenanceSchema,
} from "../src/performance/replication-hosted-provenance.mjs";
import {
  performanceReplicationVerificationSchema,
} from "../src/performance/replication.mjs";

const freshTargetSha = "a".repeat(40);

test("builder deterministically derives an exact 26-to-28 publication", () => {
  const payload = fixturePayload();
  const first = buildPerformanceReplicationPublication(
    { payloadAssetBytes: payload },
    fixtureOptions(),
  );
  const second = buildPerformanceReplicationPublication(
    { payloadAssetBytes: cloneByteMap(payload) },
    fixtureOptions(),
  );

  assert.deepEqual(performanceReplicationPublicationPayloadNames, expectedPayloadNames());
  assert.equal(performanceReplicationPublicationPayloadNames.length, 26);
  assert.equal(performanceReplicationPublicationAssetNames.length, 28);
  assert.deepEqual(first.generatedAssets, second.generatedAssets);
  assert.equal(first.receipt.schema, performanceReplicationPublicationSchema);
  assert.equal(first.receipt.inventory.payloadAssetCount, 26);
  assert.equal(first.receipt.inventory.finalAssetCount, 28);
  assert.equal(first.receipt.inventory.archiveAssetCount, 7);
  assert.equal(first.receipt.inventory.archiveEntryCount, 7);
  assert.equal(first.receipt.inventory.checksumEntryCount, 27);
  assert.equal(Object.isFrozen(first.receipt), true);

  const assets = publicationAssets(payload, first);
  const verified = verifyPerformanceReplicationPublication(
    { assetBytes: assets },
    fixtureOptions(),
  );
  assert.deepEqual(verified, first.receipt);

  const checksums = assets["SHA256SUMS.txt"].toString("utf8").trimEnd().split("\n");
  assert.equal(checksums.length, 27);
  assert.equal(checksums.some((line) => line.endsWith("  SHA256SUMS.txt")), false);
  assert.deepEqual(
    checksums.map((line) => line.slice(66)),
    performanceReplicationPublicationAssetNames.filter(
      (name) => name !== "SHA256SUMS.txt",
    ),
  );

  const privacy = JSON.parse(assets["privacy-scan.json"]);
  assert.equal(privacy.scope.payloadAssetCount, 26);
  assert.equal(privacy.scope.archiveAssetCount, 7);
  assert.deepEqual(
    privacy.assets.map(({ name }) => name),
    performanceReplicationPublicationPayloadNames,
  );
});

test("builder and verifier reject missing, extra, noncanonical, and drifted assets", () => {
  const payload = fixturePayload();
  const missing = cloneByteMap(payload);
  delete missing[performanceReplicationPublicationPayloadNames[0]];
  assert.throws(
    () => buildPerformanceReplicationPublication(
      { payloadAssetBytes: missing },
      fixtureOptions(),
    ),
    /exact asset inventory/u,
  );

  const extra = { ...cloneByteMap(payload), "extra.json": canonicalBytes({ safe: true }) };
  assert.throws(
    () => buildPerformanceReplicationPublication(
      { payloadAssetBytes: extra },
      fixtureOptions(),
    ),
    /exact asset inventory/u,
  );

  const built = buildPerformanceReplicationPublication(
    { payloadAssetBytes: payload },
    fixtureOptions(),
  );
  const assets = publicationAssets(payload, built);
  const noncanonical = cloneByteMap(assets);
  noncanonical["workflow-run.json"] = Buffer.concat([
    noncanonical["workflow-run.json"],
    Buffer.from(" ", "utf8"),
  ]);
  assert.throws(
    () => verifyPerformanceReplicationPublication(
      { assetBytes: noncanonical },
      fixtureOptions(),
    ),
    /canonical deterministic JSON/u,
  );

  const privacyDrift = cloneByteMap(assets);
  const privacy = JSON.parse(privacyDrift["privacy-scan.json"]);
  privacy.status = "forged";
  privacyDrift["privacy-scan.json"] = canonicalBytes(privacy);
  assert.throws(
    () => verifyPerformanceReplicationPublication(
      { assetBytes: privacyDrift },
      fixtureOptions(),
    ),
    /privacy-scan\.json differs/u,
  );

  const checksumDrift = cloneByteMap(assets);
  checksumDrift["SHA256SUMS.txt"] = Buffer.from(
    checksumDrift["SHA256SUMS.txt"].toString("utf8").replaceAll("\n", "\r\n"),
    "utf8",
  );
  assert.throws(
    () => verifyPerformanceReplicationPublication(
      { assetBytes: checksumDrift },
      fixtureOptions(),
    ),
    /canonical 27-entry non-self manifest/u,
  );
});

test("privacy scan rejects direct, encoded, split-line, and archived credentials", () => {
  const token = `ghp_${"A".repeat(24)}`;
  for (const mutate of [
    (payload) => {
      payload["workflow-run.json"] = canonicalBytes({ token });
    },
    (payload) => {
      payload["workflow-run.json"] = canonicalBytes({ encoded: Buffer.from(token).toString("base64") });
    },
    (payload) => {
      payload["actions-crawl-logs.zip"] = archiveBytes([
        ["runner.log", `${token.slice(0, 8)}\n${token.slice(8, 17)}\n${token.slice(17)}\n`],
      ]);
    },
    (payload) => {
      payload["actions-crawl-logs.zip"] = archiveBytes([
        ["runner.log", `${token.slice(0, 8)}\r${token.slice(8, 17)}\r${token.slice(17)}\r`],
      ]);
    },
    (payload) => {
      payload["actions-crawl-logs.zip"] = archiveBytes([
        ["runner.log", `${token.slice(0, 8)}%0A${token.slice(8, 17)}%0a${token.slice(17)}`],
      ]);
    },
    (payload) => {
      payload["actions-crawl-logs.zip"] = archiveBytes([
        ["runner.log", `${token.slice(0, 8)}\\n${token.slice(8, 17)}\\r${token.slice(17)}`],
      ]);
    },
    (payload) => {
      payload["actions-rwa-logs.zip"] = archiveBytes([
        ["runner.log", `${token}\n`],
      ]);
    },
    (payload) => {
      const percentEncoded = [...Buffer.from(token, "utf8")]
        .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
        .join("");
      payload["actions-combined-logs.zip"] = archiveBytes([
        ["runner.log", `${percentEncoded}\n`],
      ]);
    },
    (payload) => {
      const escaped = [...Buffer.from(token, "utf8")]
        .map((byte) => `\\x${byte.toString(16).padStart(2, "0")}`)
        .join("");
      payload["actions-combined-logs.zip"] = archiveBytes([
        ["runner.log", `${escaped}\n`],
      ]);
    },
  ]) {
    const payload = fixturePayload();
    mutate(payload);
    assert.throws(
      () => buildPerformanceReplicationPublication(
        { payloadAssetBytes: payload },
        fixtureOptions(),
      ),
      /canonical deterministic JSON|privacy|credential/iu,
    );
  }
});

test("ZIP scan rejects case collisions, hidden metadata, and nested archives", () => {
  const caseCollision = fixturePayload();
  caseCollision["actions-rwa-logs.zip"] = archiveBytes([
    ["Log.txt", "safe\n"],
    ["log.txt", "safe\n"],
  ]);
  assert.throws(
    () => buildPerformanceReplicationPublication(
      { payloadAssetBytes: caseCollision },
      fixtureOptions(),
    ),
    /directory or duplicate/u,
  );

  const commented = fixturePayload();
  const commentZip = new AdmZip();
  commentZip.addFile("runner.log", Buffer.from("safe\n"));
  commentZip.addZipComment("opaque");
  commented["actions-rwa-logs.zip"] = commentZip.toBuffer();
  assert.throws(
    () => buildPerformanceReplicationPublication(
      { payloadAssetBytes: commented },
      fixtureOptions(),
    ),
    /opaque archive comment/u,
  );

  const nested = fixturePayload();
  nested["actions-rwa-logs.zip"] = archiveBytes([
    ["nested.zip", archiveBytes([["inside.txt", "safe\n"]])],
  ]);
  assert.throws(
    () => buildPerformanceReplicationPublication(
      { payloadAssetBytes: nested },
      fixtureOptions(),
    ),
    /nested archive/u,
  );
});

test("directory builder copies into one fresh distinct root and never clobbers", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-replication-publication-"));
  try {
    const payloadRoot = path.join(temporaryRoot, "payload");
    const outputRoot = path.join(temporaryRoot, "publication");
    await mkdir(payloadRoot);
    const payload = fixturePayload();
    await Promise.all(Object.entries(payload).map(([name, bytes]) =>
      writeFile(path.join(payloadRoot, name), bytes, { flag: "wx" })
    ));

    const receipt = await buildPerformanceReplicationPublicationDirectory(
      { payloadDirectory: payloadRoot, outputDirectory: outputRoot },
      fixtureOptions(),
    );
    assert.equal(receipt.inventory.finalAssetCount, 28);
    assert.deepEqual((await readdir(payloadRoot)).sort(), [...performanceReplicationPublicationPayloadNames].sort());
    assert.deepEqual((await readdir(outputRoot)).sort(), [...performanceReplicationPublicationAssetNames].sort());
    const verified = await verifyPerformanceReplicationPublicationDirectory(
      { publicationDirectory: outputRoot },
      fixtureOptions(),
    );
    assert.deepEqual(verified, receipt);

    await assert.rejects(
      buildPerformanceReplicationPublicationDirectory(
        { payloadDirectory: payloadRoot, outputDirectory: outputRoot },
        fixtureOptions(),
      ),
      /already exists/u,
    );
    await assert.rejects(
      buildPerformanceReplicationPublicationDirectory(
        { payloadDirectory: payloadRoot, outputDirectory: path.join(payloadRoot, "nested") },
        fixtureOptions(),
      ),
      /distinct and unnested/u,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("release verifier keeps contract and direct-successor evidence identities separate", () => {
  const payload = fixturePayload({
    "workflow-run.json": canonicalBytes({
      conclusion: "success",
      status: "completed",
      updated_at: "2026-09-04T10:40:00Z",
    }),
  });
  const built = buildPerformanceReplicationPublication(
    { payloadAssetBytes: payload },
    fixtureOptions(),
  );
  const assets = publicationAssets(payload, built);
  const release = releaseRecord(assets);
  const commit = targetCommitRecord();
  const contractTagRef = tagRefRecord(
    performanceReplicationContractIdentity.tag,
    performanceReplicationContractTargetSha,
  );
  const evidenceTagRef = tagRefRecord(
    performanceReplicationPublicationIdentity.tag,
    freshTargetSha,
  );

  const receipt = verifyPerformanceReplicationGitHubRelease({
    releaseRecord: release,
    contractTagRefRecord: contractTagRef,
    releaseTagRefRecord: evidenceTagRef,
    releaseTargetCommitRecord: commit,
    expectedReleaseTargetSha: freshTargetSha,
    anonymousDownloadedAssetBytes: assets,
  }, fixtureOptions());
  assert.equal(receipt.contractTargetSha, performanceReplicationContractTargetSha);
  assert.equal(receipt.evidenceTargetSha, freshTargetSha);
  assert.equal(receipt.directSuccessorOfContractTarget, true);
  assert.equal(receipt.tagBindings.contract.objectSha, performanceReplicationContractTargetSha);
  assert.equal(receipt.tagBindings.evidence.objectSha, freshTargetSha);

  for (const mutate of [
    (value) => { value.immutable = false; },
    (value) => { value.draft = true; },
    (value) => { value.prerelease = true; },
    (value) => { value.tag_name = "wrong"; },
    (value) => { value.target_commitish = "b".repeat(40); },
    (value) => { value.assets[0].digest = `sha256:${"0".repeat(64)}`; },
    (value) => { value.assets.pop(); },
    (value) => { value.assets.push({ ...value.assets[0], id: 999, name: "extra" }); },
  ]) {
    const drifted = structuredClone(release);
    mutate(drifted);
    assert.throws(() => verifyPerformanceReplicationGitHubRelease({
      releaseRecord: drifted,
      contractTagRefRecord: contractTagRef,
      releaseTagRefRecord: evidenceTagRef,
      releaseTargetCommitRecord: commit,
      expectedReleaseTargetSha: freshTargetSha,
      anonymousDownloadedAssetBytes: assets,
    }, fixtureOptions()));
  }

  for (const [recordName, mutate] of [
    ["contractTagRefRecord", (value) => { value.object.sha = "b".repeat(40); }],
    ["releaseTagRefRecord", (value) => { value.ref = "refs/tags/wrong"; }],
    ["releaseTagRefRecord", (value) => { value.object.type = "tag"; }],
  ]) {
    const records = {
      contractTagRefRecord: structuredClone(contractTagRef),
      releaseTagRefRecord: structuredClone(evidenceTagRef),
    };
    mutate(records[recordName]);
    assert.throws(
      () => verifyPerformanceReplicationGitHubRelease({
        releaseRecord: release,
        ...records,
        releaseTargetCommitRecord: commit,
        expectedReleaseTargetSha: freshTargetSha,
        anonymousDownloadedAssetBytes: assets,
      }, fixtureOptions()),
      /tag|ref|lightweight|SHA/iu,
    );
  }

  const lineageDrift = structuredClone(commit);
  lineageDrift.parents[0].sha = "b".repeat(40);
  assert.throws(
    () => verifyPerformanceReplicationGitHubRelease({
      releaseRecord: release,
      contractTagRefRecord: contractTagRef,
      releaseTagRefRecord: evidenceTagRef,
      releaseTargetCommitRecord: lineageDrift,
      expectedReleaseTargetSha: freshTargetSha,
      anonymousDownloadedAssetBytes: assets,
    }, fixtureOptions()),
    /not a direct successor/u,
  );
  assert.throws(
    () => verifyPerformanceReplicationGitHubRelease({
      releaseRecord: release,
      contractTagRefRecord: contractTagRef,
      releaseTagRefRecord: evidenceTagRef,
      releaseTargetCommitRecord: commit,
      expectedReleaseTargetSha: performanceReplicationContractTargetSha,
      anonymousDownloadedAssetBytes: assets,
    }, fixtureOptions()),
    /distinct from the contract/u,
  );
});

function fixturePayload(overrides = {}) {
  return Object.fromEntries(performanceReplicationPublicationPayloadNames.map((name) => {
    if (Object.hasOwn(overrides, name)) return [name, Buffer.from(overrides[name])];
    if (name.endsWith(".zip")) {
      return [name, archiveBytes([[`${name.slice(0, -4)}.txt`, "safe fixture\n"]])];
    }
    if (name.endsWith(".json")) return [name, canonicalBytes({ asset: name, safe: true })];
    return [name, Buffer.from(`# ${name}\n\nsafe fixture\n`, "utf8")];
  }));
}

function fixtureOptions() {
  return { receiptChainValidator: () => fixtureChain() };
}

function fixtureChain() {
  return {
    contractTargetSha: performanceReplicationContractTargetSha,
    workflowRunId: 33862916068,
    hostedCreatedAt: "2026-09-04T10:22:28Z",
    hostedStartedAt: "2026-09-04T10:22:31Z",
    receipts: {
      semantic: performanceReplicationVerificationSchema,
      hosted: performanceReplicationHostedProvenanceSchema,
      artifactBinding: performanceReplicationArtifactBindingSchema,
    },
  };
}

function publicationAssets(payload, built) {
  return {
    ...cloneByteMap(payload),
    "privacy-scan.json": Buffer.from(built.generatedAssets["privacy-scan.json"]),
    "SHA256SUMS.txt": Buffer.from(built.generatedAssets["SHA256SUMS.txt"]),
  };
}

function cloneByteMap(value) {
  return Object.fromEntries(Object.entries(value).map(([name, bytes]) => [name, Buffer.from(bytes)]));
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function archiveBytes(entries) {
  const archive = new AdmZip();
  for (const [name, value] of entries) {
    archive.addFile(name, Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8"));
  }
  return archive.toBuffer();
}

function releaseRecord(assets) {
  const identity = performanceReplicationPublicationIdentity;
  const releaseId = 12345;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  return {
    id: releaseId,
    tag_name: identity.tag,
    target_commitish: freshTargetSha,
    immutable: true,
    draft: false,
    prerelease: false,
    published_at: "2026-09-04T10:41:00Z",
    url: `${api}/releases/${releaseId}`,
    assets_url: `${api}/releases/${releaseId}/assets`,
    upload_url: `https://uploads.github.com/repos/${identity.repository}/releases/${releaseId}/assets{?name,label}`,
    html_url: `${web}/releases/tag/${identity.tag}`,
    assets: performanceReplicationPublicationAssetNames.map((name, index) => ({
      id: 20_000 + index,
      name,
      state: "uploaded",
      size: assets[name].byteLength,
      digest: `sha256:${sha256(assets[name])}`,
      url: `${api}/releases/assets/${20_000 + index}`,
      browser_download_url: `${web}/releases/download/${identity.tag}/${name}`,
    })),
  };
}

function targetCommitRecord() {
  const repository = performanceReplicationPublicationIdentity.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const web = `https://github.com/${repository}`;
  const treeSha = "c".repeat(40);
  return {
    sha: freshTargetSha,
    url: `${api}/commits/${freshTargetSha}`,
    html_url: `${web}/commit/${freshTargetSha}`,
    commit: { tree: { sha: treeSha, url: `${api}/git/trees/${treeSha}` } },
    parents: [{
      sha: performanceReplicationContractTargetSha,
      url: `${api}/commits/${performanceReplicationContractTargetSha}`,
      html_url: `${web}/commit/${performanceReplicationContractTargetSha}`,
    }],
  };
}

function tagRefRecord(tag, objectSha) {
  const repository = performanceReplicationPublicationIdentity.repository;
  const api = `https://api.github.com/repos/${repository}`;
  return {
    ref: `refs/tags/${tag}`,
    url: `${api}/git/refs/tags/${encodeURIComponent(tag)}`,
    object: {
      type: "commit",
      sha: objectSha,
      url: `${api}/git/commits/${objectSha}`,
    },
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedPayloadNames() {
  return [
    "actions-combined-logs.zip",
    "actions-combined.zip",
    "actions-crawl-logs.zip",
    "actions-crawl-raw.zip",
    "actions-rwa-logs.zip",
    "actions-rwa-raw.zip",
    "actions-source-metadata.zip",
    "artifact-binding.json",
    "contract-commit.json",
    "contract-release.json",
    "fresh-combined-evidence.json",
    "fresh-combined-evidence.md",
    "fresh-combined-verification.json",
    "fresh-crawl-raw.json",
    "fresh-independent-statistics-replay.json",
    "fresh-rwa-raw.json",
    "hosted-provenance.json",
    "original-combined-evidence.json",
    "original-crawl-raw.json",
    "original-rwa-raw.json",
    "replication-report.md",
    "replication-verification.json",
    "workflow-artifacts.json",
    "workflow-jobs.json",
    "workflow-run.json",
    "workflow-runs.json",
  ];
}
