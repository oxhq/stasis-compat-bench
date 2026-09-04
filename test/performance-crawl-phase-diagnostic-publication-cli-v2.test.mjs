import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertFreshCrawlPhaseDiagnosticPublicReceiptBoundary,
  crawlPhaseDiagnosticPublicationCliSchema,
  diagnosticAssetMapFromVerifiedReceipt,
  parseCrawlPhaseDiagnosticPublicationCommand,
  runCrawlPhaseDiagnosticPublicationCli,
} from "../src/performance/crawl-phase-diagnostic-publication-cli-v2.mjs";
import {
  crawlPhaseDiagnosticOutcomeClasses,
  crawlPhaseDiagnosticPublicationAssetNamesByOutcome,
  crawlPhaseDiagnosticPublicationSchema,
} from "../src/performance/crawl-phase-diagnostic-publication-v2.mjs";
import {
  crawlPhaseDiagnosticAnonymousReleaseVerificationSchema,
} from "../src/performance/crawl-phase-diagnostic-public-release-v2.mjs";

const targetSha = "d".repeat(40);

test("parser exposes only exact absolute build, verify, and verify-public contracts", () => {
  const root = path.resolve("diagnostic-publication-cli-fixture");
  const payload = path.join(root, "payload");
  const publication = path.join(root, "publication");
  const receipt = path.join(root, "receipts", "anonymous.json");
  assert.deepEqual(parseCrawlPhaseDiagnosticPublicationCommand([
    "build", payload, publication,
  ]), { command: "build", payloadDirectory: payload, outputDirectory: publication });
  assert.deepEqual(parseCrawlPhaseDiagnosticPublicationCommand([
    "verify", publication,
  ]), { command: "verify", publicationDirectory: publication });
  assert.deepEqual(parseCrawlPhaseDiagnosticPublicationCommand([
    "verify-public", publication, targetSha, receipt,
  ]), {
    command: "verify-public",
    publicationDirectory: publication,
    expectedReleaseTargetSha: targetSha,
    receiptOutputPath: receipt,
  });
  for (const argv of [
    ["build", "relative", publication],
    ["build", publication, publication],
    ["verify", "relative"],
    ["verify-public", publication, "D".repeat(40), receipt],
    ["verify-public", publication, targetSha, path.join(publication, "receipt.json")],
    ["unknown"],
  ]) assert.throws(() => parseCrawlPhaseDiagnosticPublicationCommand(argv));
});

test("build and verify modes forward only normalized directory arguments", async () => {
  const root = path.resolve("diagnostic-publication-cli-forwarding");
  const payload = path.join(root, "payload");
  const publication = path.join(root, "publication");
  const receipt = offlineReceipt("VALID_NON_AUTHORITATIVE");
  const calls = [];
  const outputs = [];
  const dependencies = {
    buildDirectory: async (value) => { calls.push(["build", value]); return receipt; },
    verifyDirectory: async (value) => { calls.push(["verify", value]); return receipt; },
    writeOutput: (value) => outputs.push(value),
  };
  assert.equal(
    await runCrawlPhaseDiagnosticPublicationCli(["build", payload, publication], dependencies),
    receipt,
  );
  assert.equal(
    await runCrawlPhaseDiagnosticPublicationCli(["verify", publication], dependencies),
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

test("verify-public derives each exact outcome byte map and creates receipt once", async () => {
  for (const outcomeClass of crawlPhaseDiagnosticOutcomeClasses) {
    const root = await mkdtemp(path.join(os.tmpdir(), "stasis-diagnostic-public-cli-"));
    try {
      const publication = path.join(root, "publication");
      const output = path.join(root, "anonymous.json");
      const offline = offlineReceipt(outcomeClass);
      const publicReceipt = {
        schema: crawlPhaseDiagnosticAnonymousReleaseVerificationSchema,
        status: "passed",
        diagnosticStatus: outcomeClass === "VALID_NON_AUTHORITATIVE" ? "passed" : "failed",
        outcomeClass,
        authorityEligible: false,
        timingEligible: false,
        statisticsEligible: false,
        comparisonEligible: false,
        optimizationEligible: false,
        generalizedSpeedClaimAuthorized: false,
        implementationWorkAuthorized: false,
        decisionState: "STAY_0_4_UNASSIGNED",
      };
      let received;
      const outputs = [];
      const dependencies = {
        assertReceiptBoundary: async () => {},
        verifyDirectory: async () => offline,
        verifyPublic: async (value) => { received = value; return publicReceipt; },
        writeOutput: (value) => outputs.push(value),
      };
      const result = await runCrawlPhaseDiagnosticPublicationCli([
        "verify-public", publication, targetSha, output,
      ], dependencies);
      assert.equal(received.expectedReleaseTargetSha, targetSha);
      assert.deepEqual(received.expectedOfflineAssetMap,
        diagnosticAssetMapFromVerifiedReceipt(offline));
      assert.deepEqual(JSON.parse(await readFile(output, "utf8")), publicReceipt);
      assert.equal(result.cliReceipt.schema, crawlPhaseDiagnosticPublicationCliSchema);
      assert.equal(result.cliReceipt.outcomeClass, outcomeClass);
      assert.equal(result.cliReceipt.exactOutcomeSpecificOfflineByteMapDerived, true);
      assert.equal(result.cliReceipt.authorityEligible, false);
      assert.equal(result.cliReceipt.timingEligible, false);
      assert.equal(result.cliReceipt.statisticsEligible, false);
      assert.equal(result.cliReceipt.comparisonEligible, false);
      assert.equal(result.cliReceipt.optimizationEligible, false);
      assert.equal(result.cliReceipt.generalizedSpeedClaimAuthorized, false);
      assert.equal(result.cliReceipt.implementationWorkAuthorized, false);
      assert.equal(JSON.parse(outputs[0]).command, "verify-public");
      await assert.rejects(
        runCrawlPhaseDiagnosticPublicationCli([
          "verify-public", publication, targetSha, output,
        ], dependencies),
        /EEXIST/u,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("verify-public rejects a public receipt that grants authority or changes outcome", async () => {
  const root = path.resolve("diagnostic-publication-cli-invalid-public-receipt");
  const publication = path.join(root, "publication");
  const output = path.join(root, "receipt.json");
  const offline = offlineReceipt("DIAGNOSTIC_INVALID_WITH_STATUS");
  for (const mutate of [
    (value) => { value.authorityEligible = true; },
    (value) => { value.statisticsEligible = true; },
    (value) => { value.outcomeClass = "VALID_NON_AUTHORITATIVE"; },
  ]) {
    const publicReceipt = {
      schema: crawlPhaseDiagnosticAnonymousReleaseVerificationSchema,
      status: "passed",
      diagnosticStatus: "failed",
      outcomeClass: "DIAGNOSTIC_INVALID_WITH_STATUS",
      authorityEligible: false,
      timingEligible: false,
      statisticsEligible: false,
      comparisonEligible: false,
      optimizationEligible: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    };
    mutate(publicReceipt);
    let writes = 0;
    await assert.rejects(
      runCrawlPhaseDiagnosticPublicationCli([
        "verify-public", publication, targetSha, output,
      ], {
        assertReceiptBoundary: async () => {},
        verifyDirectory: async () => offline,
        verifyPublic: async () => publicReceipt,
        writeReceipt: async () => { writes += 1; },
        writeOutput: () => {},
      }),
      /public verification receipt/iu,
    );
    assert.equal(writes, 0);
  }
});

test("offline receipt map rejects cross-class, reordered, duplicated, and malformed identities", () => {
  const cases = [
    (value) => { value.assets.pop(); },
    (value) => { [value.assets[0], value.assets[1]] = [value.assets[1], value.assets[0]]; },
    (value) => { value.assets[1].name = value.assets[0].name; },
    (value) => { value.assets[0].bytes = 0; },
    (value) => { value.assets[0].sha256 = "A".repeat(64); },
    (value) => { value.assets[0].extra = true; },
    (value) => { value.outcomeClass = "UNKNOWN"; },
  ];
  for (const mutate of cases) {
    const value = structuredClone(offlineReceipt("DIAGNOSTIC_INVALID_WITH_STATUS"));
    mutate(value);
    assert.throws(() => diagnosticAssetMapFromVerifiedReceipt(value), /offline|asset|identity|count/iu);
  }
});

test("public receipt boundary rejects existing output and directory aliases", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-diagnostic-boundary-"));
  try {
    const publication = path.join(root, "publication");
    const receipts = path.join(root, "receipts");
    const alias = path.join(root, "publication-alias");
    await mkdir(publication);
    await mkdir(receipts);
    const output = path.join(receipts, "receipt.json");
    await assertFreshCrawlPhaseDiagnosticPublicReceiptBoundary({
      publicationDirectory: publication,
      receiptOutputPath: output,
    });
    await writeFile(output, "retained\n", { flag: "wx" });
    await assert.rejects(
      assertFreshCrawlPhaseDiagnosticPublicReceiptBoundary({
        publicationDirectory: publication,
        receiptOutputPath: output,
      }),
      /already exists/u,
    );
    try {
      await symlink(publication, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
        context.skip(`directory alias unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      assertFreshCrawlPhaseDiagnosticPublicReceiptBoundary({
        publicationDirectory: publication,
        receiptOutputPath: path.join(alias, "receipt.json"),
      }),
      /parent must be one real directory|outside real publication/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function offlineReceipt(outcomeClass) {
  return {
    schema: crawlPhaseDiagnosticPublicationSchema,
    status: "passed",
    outcomeClass,
    authorityEligible: false,
    timingEligible: false,
    statisticsEligible: false,
    comparisonEligible: false,
    optimizationEligible: false,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
    assets: crawlPhaseDiagnosticPublicationAssetNamesByOutcome[outcomeClass].map(
      (name, index) => ({ name, bytes: index + 1, sha256: index.toString(16).padStart(64, "0") }),
    ),
  };
}
