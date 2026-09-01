import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPathProjectionReceipt,
  verifyPathProjectionReceipt,
} from "../src/publication/path-projection-receipt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("path projection receipt is reproduced from the exact source commit", async () => {
  const expected = JSON.parse(await readFile(
    path.join(root, "publication", "path-projection-receipt.json"),
    "utf8",
  ));
  assert.deepEqual(await createPathProjectionReceipt({ root }), expected);

  const result = await verifyPathProjectionReceipt({ root });
  assert.deepEqual(result, {
    schema: "stasis-public-fixture-path-projection-receipt-v1",
    sourceRevision: "cbdea4ae0c4c3c28a83a8f7bc1529a1889e0e407",
    sourceRevisionAvailable: true,
    jsonProjectionCount: 4,
    logProjectionCount: 1,
    artifactIndexCount: 2,
    decisionBindingCount: 2,
    normalizedSemanticsEqual: true,
    projectedReferencesVerified: true,
    sourceIndexesReconstructed: true,
    sourceDecisionReconstructed: true,
  });
});

test("receipt remains verifiable in a fresh root without the source commit", async (context) => {
  const publicRoot = await copyPublicReceiptInputs();
  context.after(() => rm(publicRoot, { force: true, recursive: true }));

  const result = await verifyPathProjectionReceipt({ root: publicRoot });
  assert.equal(result.sourceRevisionAvailable, false);
  assert.equal(result.normalizedSemanticsEqual, true);
  assert.equal(result.projectedReferencesVerified, true);
  assert.equal(result.sourceIndexesReconstructed, true);
  assert.equal(result.sourceDecisionReconstructed, true);
});

test("fresh-root verification rejects a non-allowlisted fixture mutation", async (context) => {
  const publicRoot = await copyPublicReceiptInputs();
  context.after(() => rm(publicRoot, { force: true, recursive: true }));
  const target = path.join(
    publicRoot,
    "test",
    "fixtures",
    "deterministic-v03",
    "stasis-post-0.3-census-v1",
    "deterministic",
    "playwright-raw.json",
  );
  const value = JSON.parse(await readFile(target, "utf8"));
  value.protocol = "mutated-outside-path-allowlist";
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  await assert.rejects(
    verifyPathProjectionReceipt({ root: publicRoot }),
    /projected .*playwright-raw\.json identity is/u,
  );
});

async function copyPublicReceiptInputs() {
  const target = await mkdtemp(path.join(tmpdir(), "stasis-path-projection-receipt-"));
  const copies = [
    "publication/path-projection-receipt.json",
    "src/wild/decision.mjs",
    "test/fixtures/deterministic-v03",
    "test/fixtures/rwa-hosted",
  ];
  for (const relativePath of copies) {
    const source = path.join(root, ...relativePath.split("/"));
    const destination = path.join(target, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true });
  }
  return target;
}
