import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import AdmZip from "adm-zip";

import {
  bindNavigationCausalHostArtifacts,
  bindNavigationCausalActionArchives,
  canonicalNavigationCausalJsonBytes,
  navigationCausalArtifactBindingSchema,
  navigationCausalHostFileBindingSchema,
} from "../src/performance/navigation-causal-artifact-binding.mjs";
import { createNavigationCausalHostOutcome } from "../src/performance/navigation-causal.mjs";
import {
  navigationCausalHarnessIdentity,
  navigationCausalWorkflowSourceIdentity,
} from "../src/performance/navigation-causal-replication.mjs";
import { navigationCausalHostFixtureRaw } from "./fixtures/navigation-causal-host-fixture.mjs";
import { navigationCausalHostedFixtureInput } from "./fixtures/navigation-causal-hosted-fixture.mjs";

test("four canonical host files replay to one unpooled replication outcome", async () => {
  const files = await fixtureFiles();
  const receipt = bindNavigationCausalHostArtifacts(files);

  assert.equal(receipt.schema, navigationCausalHostFileBindingSchema);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.replication.status, "VALID_REPLICATED_EFFECT");
  assert.equal(receipt.verification.exactCanonicalHostFiles, true);
  assert.equal(receipt.verification.statisticsCombinedAcrossHosts, false);
  assert.equal(receipt.inputs.hostA.raw.bytes, files.hostARawBytes.length);
  assert.match(receipt.inputs.hostA.raw.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(Object.isFrozen(receipt), true);
});

test("noncanonical, altered, crossed-lane, and stale-outcome inputs fail closed", async (t) => {
  const cases = [
    ["noncanonical", async (files) => {
      files.hostARawBytes = Buffer.from(files.hostARawBytes.toString("utf8").trim(), "utf8");
    }],
    ["altered", async (files) => {
      const raw = JSON.parse(files.hostARawBytes);
      raw.statistics.effect = "host_effect_rule_not_met";
      files.hostARawBytes = canonicalNavigationCausalJsonBytes(raw);
    }],
    ["crossed", async (files) => {
      [files.hostARawBytes, files.hostBRawBytes] = [files.hostBRawBytes, files.hostARawBytes];
    }],
    ["stale outcome", async (files) => {
      const outcome = JSON.parse(files.hostAOutcomeBytes);
      outcome.status = "VALID_HOST_NO_EFFECT";
      files.hostAOutcomeBytes = canonicalNavigationCausalJsonBytes(outcome);
    }],
  ];
  for (const [label, mutate] of cases) {
    await t.test(label, async () => {
      const files = await fixtureFiles();
      await mutate(files);
      assert.throws(() => bindNavigationCausalHostArtifacts(files));
    });
  }
});

test("two hosted ZIPs bind exact IDs, digests, entries, and job outcomes", async () => {
  const files = await fixtureFiles();
  const archives = archiveFixture(files);
  const hostedInput = hostedInputForArchives(archives);
  const receipt = bindNavigationCausalActionArchives({ hostedInput, archives });
  assert.equal(receipt.schema, navigationCausalArtifactBindingSchema);
  assert.equal(receipt.verification.exactTwoCanonicalFilesPerArchive, true);
  assert.equal(receipt.verification.jobConclusionsMatchTypedHostOutcomes, true);
  assert.equal(receipt.archives.length, 2);
  assert.equal(receipt.replication.status, "VALID_REPLICATED_EFFECT");
});

test("archive byte, inventory, and job-outcome contradictions fail closed", async (t) => {
  const cases = [
    ["wrong bytes", ({ archives }) => { archives[Object.keys(archives)[0]][10] ^= 1; }],
    ["extra entry", ({ files, archives, hostedInput }) => {
      const metadata = hostedInput.artifactsListing.artifacts[0];
      const zip = new AdmZip(archives[metadata.name]);
      zip.addFile("extra.txt", Buffer.from("extra"));
      archives[metadata.name] = zip.toBuffer();
      alignArchiveMetadata(metadata, archives[metadata.name]);
    }],
    ["path entry", ({ files, archives, hostedInput }) => replaceHostAArchive(
      archives,
      hostedInput,
      archiveFor({
        "nested/navigation-causal-host-a-raw.json": files.hostARawBytes,
        "navigation-causal-host-a-outcome.json": files.hostAOutcomeBytes,
      }),
    )],
    ["case-changed entry", ({ files, archives, hostedInput }) => replaceHostAArchive(
      archives,
      hostedInput,
      archiveFor({
        "Navigation-causal-host-a-raw.json": files.hostARawBytes,
        "navigation-causal-host-a-outcome.json": files.hostAOutcomeBytes,
      }),
    )],
    ["invalid UTF-8 entry", ({ archives, hostedInput }) => {
      const metadata = hostedInput.artifactsListing.artifacts[0];
      const changed = corruptZipEntryNameUtf8(
        archives[metadata.name],
        "navigation-causal-host-a-raw.json",
      );
      replaceHostAArchive(archives, hostedInput, changed);
    }],
    ["symlink entry", ({ archives, hostedInput }) => {
      const metadata = hostedInput.artifactsListing.artifacts[0];
      const zip = new AdmZip(archives[metadata.name]);
      zip.getEntry("navigation-causal-host-a-raw.json").attr = (0o120777 << 16) >>> 0;
      replaceHostAArchive(archives, hostedInput, zip.toBuffer());
    }],
    ["encrypted entry flag", ({ archives, hostedInput }) => {
      const metadata = hostedInput.artifactsListing.artifacts[0];
      replaceHostAArchive(
        archives,
        hostedInput,
        setZipGeneralPurposeFlag(archives[metadata.name], 1),
      );
    }],
    ["archive oversize", ({ archives, hostedInput }) => {
      const metadata = hostedInput.artifactsListing.artifacts[0];
      replaceHostAArchive(
        archives,
        hostedInput,
        Buffer.concat([archives[metadata.name], Buffer.alloc(4_000_001)]),
      );
    }],
    ["compression ratio", ({ files, archives, hostedInput }) => replaceHostAArchive(
      archives,
      hostedInput,
      archiveFor({
        "navigation-causal-host-a-raw.json": Buffer.alloc(1_000_000, 0x20),
        "navigation-causal-host-a-outcome.json": files.hostAOutcomeBytes,
      }),
    )],
    ["corrupt ZIP", ({ archives, hostedInput }) => {
      const metadata = hostedInput.artifactsListing.artifacts[0];
      replaceHostAArchive(
        archives,
        hostedInput,
        archives[metadata.name].subarray(0, archives[metadata.name].length - 20),
      );
    }],
    ["duplicate artifact ID", ({ hostedInput }) => {
      const [left, right] = hostedInput.artifactsListing.artifacts;
      right.id = left.id;
      right.url = left.url;
    }],
    ["wrong job conclusion", ({ hostedInput }) => {
      hostedInput.runRecord.conclusion = "failure";
      hostedInput.workflowRunsListing.workflow_runs[0].conclusion = "failure";
      const job = hostedInput.jobsListing.jobs[0];
      job.conclusion = "failure";
      job.steps.find(({ number }) => number === 17).conclusion = "failure";
      Object.assign(job.steps.find(({ number }) => number === 33), {
        conclusion: "skipped",
        started_at: null,
        completed_at: null,
      });
    }],
    ["wrong hosted run", ({ hostedInput }) => {
      hostedInput.runRecord.id += 1;
    }],
  ];
  for (const [label, mutate] of cases) await t.test(label, async () => {
    const files = await fixtureFiles();
    const archives = archiveFixture(files);
    const hostedInput = hostedInputForArchives(archives);
    mutate({ files, archives, hostedInput });
    assert.throws(() => bindNavigationCausalActionArchives({ hostedInput, archives }));
  });
});

async function fixtureFiles() {
  const hostA = await frozenRaw("host-a");
  const hostB = await frozenRaw("host-b");
  return {
    hostARawBytes: canonicalNavigationCausalJsonBytes(hostA),
    hostAOutcomeBytes: canonicalNavigationCausalJsonBytes(
      createNavigationCausalHostOutcome(hostA),
    ),
    hostBRawBytes: canonicalNavigationCausalJsonBytes(hostB),
    hostBOutcomeBytes: canonicalNavigationCausalJsonBytes(
      createNavigationCausalHostOutcome(hostB),
    ),
  };
}

async function frozenRaw(lane) {
  const raw = structuredClone(await navigationCausalHostFixtureRaw(lane));
  raw.identity.provenance.workflowSourceSha = navigationCausalWorkflowSourceIdentity.revision;
  raw.identity.provenance.harnessCheckoutRevision = navigationCausalHarnessIdentity.revision;
  raw.identity.provenance.harnessCheckoutTree = navigationCausalHarnessIdentity.tree;
  return raw;
}

function archiveFixture(files) {
  return {
    "stasis-v0.3.3-navigation-causal-host-a-attempt-1": archiveFor({
      "navigation-causal-host-a-raw.json": files.hostARawBytes,
      "navigation-causal-host-a-outcome.json": files.hostAOutcomeBytes,
    }),
    "stasis-v0.3.3-navigation-causal-host-b-attempt-1": archiveFor({
      "navigation-causal-host-b-raw.json": files.hostBRawBytes,
      "navigation-causal-host-b-outcome.json": files.hostBOutcomeBytes,
    }),
  };
}

function archiveFor(entries) {
  const zip = new AdmZip();
  for (const [name, bytes] of Object.entries(entries)) zip.addFile(name, bytes);
  return zip.toBuffer();
}

function hostedInputForArchives(archives) {
  const input = navigationCausalHostedFixtureInput();
  input.artifactsListing.artifacts.forEach((metadata) => {
    alignArchiveMetadata(metadata, archives[metadata.name]);
  });
  return input;
}

function alignArchiveMetadata(metadata, bytes) {
  metadata.size_in_bytes = bytes.length;
  metadata.digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function replaceHostAArchive(archives, hostedInput, bytes) {
  const metadata = hostedInput.artifactsListing.artifacts[0];
  archives[metadata.name] = bytes;
  alignArchiveMetadata(metadata, bytes);
}

function corruptZipEntryNameUtf8(bytes, name) {
  const result = Buffer.from(bytes);
  const needle = Buffer.from(name, "utf8");
  let replacements = 0;
  for (let offset = result.indexOf(needle); offset !== -1; offset = result.indexOf(needle, offset + 1)) {
    result[offset] = 0xff;
    replacements += 1;
  }
  assert.equal(replacements, 2);
  return result;
}

function setZipGeneralPurposeFlag(bytes, flag) {
  const result = Buffer.from(bytes);
  let headers = 0;
  for (let offset = 0; offset <= result.length - 10; offset += 1) {
    const signature = result.readUInt32LE(offset);
    const flagOffset = signature === 0x04034b50
      ? offset + 6
      : signature === 0x02014b50
        ? offset + 8
        : null;
    if (flagOffset === null) continue;
    result.writeUInt16LE(result.readUInt16LE(flagOffset) | flag, flagOffset);
    headers += 1;
  }
  assert.equal(headers, 4);
  return result;
}
