import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import packageJson from "../package.json" with { type: "json" };
import {
  assertFreshPublicReceiptBoundary,
  assetMapFromVerifiedReceipt,
  parsePerformanceReplicationPublicationCommand,
  performanceReplicationPublicationCliSchema,
  runPerformanceReplicationPublicationCli,
} from "../src/performance/replication-publication-cli.mjs";
import {
  performanceReplicationPublicationAssetNames,
  performanceReplicationPublicationSchema,
} from "../src/performance/replication-publication.mjs";
import {
  performanceReplicationAnonymousReleaseVerificationSchema,
} from "../src/performance/replication-public-release.mjs";

const evidenceTargetSha = "a".repeat(40);

test("package scripts expose the three explicit publication modes", () => {
  assert.equal(
    packageJson.scripts["performance:replication:publication:build"],
    "node src/performance/replication-publication-cli.mjs build",
  );
  assert.equal(
    packageJson.scripts["performance:replication:publication:verify"],
    "node src/performance/replication-publication-cli.mjs verify",
  );
  assert.equal(
    packageJson.scripts["performance:replication:publication:verify-public"],
    "node src/performance/replication-publication-cli.mjs verify-public",
  );
});

test("parser accepts only exact absolute mode contracts and keeps public receipt outside assets", () => {
  const root = path.resolve("publication-cli-fixture");
  const payload = path.join(root, "payload");
  const publication = path.join(root, "publication");
  const receipt = path.join(root, "receipts", "anonymous.json");
  assert.deepEqual(parsePerformanceReplicationPublicationCommand([
    "build", payload, publication,
  ]), { command: "build", payloadDirectory: payload, outputDirectory: publication });
  assert.deepEqual(parsePerformanceReplicationPublicationCommand([
    "verify", publication,
  ]), { command: "verify", publicationDirectory: publication });
  assert.deepEqual(parsePerformanceReplicationPublicationCommand([
    "verify-public", publication, evidenceTargetSha, receipt,
  ]), {
    command: "verify-public",
    publicationDirectory: publication,
    expectedReleaseTargetSha: evidenceTargetSha,
    receiptOutputPath: receipt,
  });

  for (const argv of [
    ["build", "relative", publication],
    ["build", publication, publication],
    ["verify", "relative"],
    ["verify-public", publication, "A".repeat(40), receipt],
    ["verify-public", publication, evidenceTargetSha, path.join(publication, "receipt.json")],
    ["unknown"],
  ]) {
    assert.throws(() => parsePerformanceReplicationPublicationCommand(argv));
  }
});

test("build and verify modes forward only validated directory arguments", async () => {
  const root = path.resolve("publication-cli-forwarding");
  const payload = path.join(root, "payload");
  const publication = path.join(root, "publication");
  const receipt = fixtureOfflineReceipt();
  const calls = [];
  const outputs = [];
  const dependencies = {
    buildDirectory: async (value) => { calls.push(["build", value]); return receipt; },
    verifyDirectory: async (value) => { calls.push(["verify", value]); return receipt; },
    writeOutput: (value) => outputs.push(value),
  };
  assert.equal(
    await runPerformanceReplicationPublicationCli(["build", payload, publication], dependencies),
    receipt,
  );
  assert.equal(
    await runPerformanceReplicationPublicationCli(["verify", publication], dependencies),
    receipt,
  );
  assert.deepEqual(calls, [
    ["build", { payloadDirectory: payload, outputDirectory: publication }],
    ["verify", { publicationDirectory: publication }],
  ]);
  assert.equal(outputs.length, 2);
  assert.deepEqual(JSON.parse(outputs[0]), receipt);
  assert.equal(outputs[0].endsWith("\n"), true);
});

test("verify-public derives the exact byte map from offline verification and writes once", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-publication-cli-"));
  try {
    const publication = path.join(temporaryRoot, "publication");
    const output = path.join(temporaryRoot, "anonymous-receipt.json");
    const offline = fixtureOfflineReceipt();
    const publicReceipt = {
      schema: performanceReplicationAnonymousReleaseVerificationSchema,
      status: "passed",
    };
    let received;
    const outputs = [];
    const dependencies = {
      assertReceiptBoundary: async () => {},
      verifyDirectory: async () => offline,
      verifyPublic: async (value) => { received = value; return publicReceipt; },
      writeOutput: (value) => outputs.push(value),
    };
    const result = await runPerformanceReplicationPublicationCli([
      "verify-public", publication, evidenceTargetSha, output,
    ], dependencies);
    assert.equal(received.expectedReleaseTargetSha, evidenceTargetSha);
    assert.deepEqual(received.expectedOfflineAssetMap, assetMapFromVerifiedReceipt(offline));
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), publicReceipt);
    assert.equal(result.cliReceipt.schema, performanceReplicationPublicationCliSchema);
    assert.equal(result.cliReceipt.exactOfflineByteMapDerived, true);
    assert.equal(JSON.parse(outputs[0]).command, "verify-public");

    await assert.rejects(
      runPerformanceReplicationPublicationCli([
        "verify-public", publication, evidenceTargetSha, output,
      ], dependencies),
      /EEXIST/u,
    );
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), publicReceipt);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("public receipt boundary rejects a symlink or junction alias into the 28 assets", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-publication-alias-"));
  try {
    const publication = path.join(temporaryRoot, "publication");
    const receipts = path.join(temporaryRoot, "receipts");
    const alias = path.join(temporaryRoot, "publication-alias");
    await mkdir(publication);
    await mkdir(receipts);
    await assertFreshPublicReceiptBoundary({
      publicationDirectory: publication,
      receiptOutputPath: path.join(receipts, "receipt.json"),
    });
    await writeFile(path.join(receipts, "existing.json"), "retained\n", { flag: "wx" });
    await assert.rejects(
      assertFreshPublicReceiptBoundary({
        publicationDirectory: publication,
        receiptOutputPath: path.join(receipts, "existing.json"),
      }),
      /already exists/u,
    );

    try {
      await symlink(
        publication,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
        context.skip(`directory alias creation is unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      assertFreshPublicReceiptBoundary({
        publicationDirectory: publication,
        receiptOutputPath: path.join(alias, "receipt.json"),
      }),
      /parent must be one real directory|outside the real 28-asset publication/u,
    );
    let downstreamCalls = 0;
    await assert.rejects(
      runPerformanceReplicationPublicationCli([
        "verify-public",
        publication,
        evidenceTargetSha,
        path.join(alias, "receipt.json"),
      ], {
        verifyDirectory: async () => { downstreamCalls += 1; },
        verifyPublic: async () => { downstreamCalls += 1; },
      }),
      /parent must be one real directory|outside the real 28-asset publication/u,
    );
    assert.equal(downstreamCalls, 0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("offline receipt projection rejects reordered, mutated, missing, and extra identities", () => {
  const receipt = fixtureOfflineReceipt();
  const expected = assetMapFromVerifiedReceipt(receipt);
  assert.deepEqual(Object.keys(expected), performanceReplicationPublicationAssetNames);
  assert.equal(Object.isFrozen(expected), true);

  for (const mutate of [
    (value) => { value.status = "failed"; },
    (value) => { value.assets.reverse(); },
    (value) => { value.assets.pop(); },
    (value) => { value.assets[0].bytes = 0; },
    (value) => { value.assets[0].sha256 = "A".repeat(64); },
    (value) => { value.assets[0].extra = true; },
  ]) {
    const drifted = structuredClone(receipt);
    mutate(drifted);
    assert.throws(() => assetMapFromVerifiedReceipt(drifted));
  }
});

function fixtureOfflineReceipt() {
  return {
    schema: performanceReplicationPublicationSchema,
    status: "passed",
    assets: performanceReplicationPublicationAssetNames.map((name, index) => ({
      name,
      bytes: index + 1,
      sha256: index.toString(16).padStart(64, "0"),
    })),
  };
}
