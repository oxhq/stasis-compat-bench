import assert from "node:assert/strict";
import test from "node:test";

import {
  navigationCausalPublicationCliSchema,
  parseNavigationCausalPublicationCommand,
  runNavigationCausalPublicationCli,
} from "../src/performance/navigation-causal-publication-cli.mjs";

const root = process.platform === "win32" ? "E:\\causal" : "/tmp/causal";
const target = "d".repeat(40);

test("CLI parses only the five exact absolute command forms", () => {
  assert.equal(parseNavigationCausalPublicationCommand([
    "build",
    `${root}${separator()}input`,
    `${root}${separator()}output`,
    `${root}${separator()}v4-tag.json`,
  ]).command, "build");
  assert.equal(parseNavigationCausalPublicationCommand([
    "verify",
    `${root}${separator()}output`,
    `${root}${separator()}v4-tag.json`,
  ]).command, "verify");
  assert.equal(parseNavigationCausalPublicationCommand([
    "verify-contract-public",
    target,
    `${root}${separator()}preflight.json`,
  ]).command, "verify-contract-public");
  assert.equal(parseNavigationCausalPublicationCommand([
    "verify-preflight-public",
    target,
    `${root}${separator()}preflight.json`,
  ]).command, "verify-preflight-public");
  assert.equal(parseNavigationCausalPublicationCommand([
    "verify-public",
    target,
    `${root}${separator()}public.json`,
  ]).command, "verify-public");
  assert.throws(() => parseNavigationCausalPublicationCommand(["verify", "relative", "relative"]));
  assert.throws(() => parseNavigationCausalPublicationCommand([
    "verify-public",
    "main",
    `${root}${separator()}public.json`,
  ]));
});

test("CLI dispatches build and verify with the exact V4 tag record", async () => {
  const tag = { ref: "refs/tags/v4" };
  const calls = [];
  const dependencies = {
    nodeVersion: "v22.20.0",
    readJson: async () => tag,
    buildDirectory: async (...args) => {
      calls.push(["build", ...args]);
      return { schema: "built", outcome: "VALID_NO_REPLICATED_EFFECT" };
    },
    verifyDirectory: async (...args) => {
      calls.push(["verify", ...args]);
      return { schema: "verified", outcome: "VALID_NO_REPLICATED_EFFECT" };
    },
    writeOutput() {},
  };
  const input = `${root}${separator()}input`;
  const output = `${root}${separator()}output`;
  const tagPath = `${root}${separator()}v4-tag.json`;
  const built = await runNavigationCausalPublicationCli(
    ["build", input, output, tagPath],
    dependencies,
  );
  const verified = await runNavigationCausalPublicationCli(
    ["verify", output, tagPath],
    dependencies,
  );
  assert.equal(built.cliReceipt.schema, navigationCausalPublicationCliSchema);
  assert.equal(verified.cliReceipt.command, "verify");
  assert.deepEqual(calls, [
    ["build", input, output, { v4TagRefRecord: tag }],
    ["verify", output, { v4TagRefRecord: tag }],
  ]);
});

test("CLI anchors the preflight input and writes fresh contract and final receipts", async () => {
  const writes = [];
  const calls = [];
  const dependencies = {
    nodeVersion: "v22.20.0",
    verifyContractPublic: async (input) => {
      calls.push(["contract", input]);
      return { schema: "contract-preflight", status: "passed" };
    },
    verifyPreflightPublic: async (input) => {
      calls.push(["preflight", input]);
      return { schema: "preflight-release", status: "passed" };
    },
    verifyPublic: async (input) => {
      calls.push(["public", input]);
      return { schema: "public-release", status: "passed", outcome: "INVALID_HOST_MEASUREMENT" };
    },
    writeReceipt: async (...args) => writes.push(args),
    readBytes: async () => Buffer.from("preflight-receipt"),
    writeOutput() {},
  };
  const preflightPath = `${root}${separator()}preflight.json`;
  const publicPath = `${root}${separator()}public.json`;
  await runNavigationCausalPublicationCli(
    ["verify-contract-public", target, preflightPath],
    dependencies,
  );
  await runNavigationCausalPublicationCli(
    ["verify-preflight-public", target, preflightPath],
    dependencies,
  );
  const result = await runNavigationCausalPublicationCli(
    ["verify-public", target, publicPath],
    dependencies,
  );
  assert.deepEqual(calls, [
    ["contract", { expectedContractTargetSha: target }],
    ["preflight", {
      expectedContractTargetSha: target,
      expectedReceiptBytes: Buffer.from("preflight-receipt"),
    }],
    ["public", { expectedReleaseTargetSha: target }],
  ]);
  assert.deepEqual(writes.map(([name]) => name), [preflightPath, publicPath]);
  assert.equal(result.cliReceipt.outcome, "INVALID_HOST_MEASUREMENT");
  assert.equal(result.cliReceipt.generalizedSpeedClaimAuthorized, false);
});

test("CLI rejects every Node version except exact v22.20.0 before dispatch", async () => {
  await assert.rejects(
    runNavigationCausalPublicationCli(
      ["verify-public", target, `${root}${separator()}public.json`],
      { nodeVersion: "v22.21.0" },
    ),
    /v22\.20\.0/u,
  );
});

function separator() {
  return process.platform === "win32" ? "\\" : "/";
}
