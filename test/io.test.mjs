import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertExactFileInventory,
  repositoryRoot,
  sha256DirectoryTree,
  sha256File,
  validateSealedArtifactRootPath,
} from "../src/shared/io.mjs";

test("file and directory hashes are byte-sensitive and path-order deterministic", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-compat-io-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const left = path.join(root, "left");
  const right = path.join(root, "right");
  await mkdir(path.join(left, "nested"), { recursive: true });
  await mkdir(path.join(right, "nested"), { recursive: true });

  await writeFile(path.join(left, "z.txt"), "z\n", "utf8");
  await writeFile(path.join(left, "nested", "a.txt"), "alpha\r\n", "utf8");
  await writeFile(path.join(right, "nested", "a.txt"), "alpha\r\n", "utf8");
  await writeFile(path.join(right, "z.txt"), "z\n", "utf8");

  assert.equal(
    await sha256File(path.join(left, "z.txt")),
    "c865f6c5ab8d1b0bcd383a5e1e3879d22681c96bf462c269b7581d523fbe70ab",
  );
  const leftTree = await sha256DirectoryTree(left);
  const rightTree = await sha256DirectoryTree(right);
  assert.deepEqual(leftTree, rightTree);
  assert.equal(leftTree.fileCount, 2);
  assert.equal(leftTree.totalBytes, 9);

  await writeFile(path.join(right, "z.txt"), "changed\n", "utf8");
  assert.notEqual((await sha256DirectoryTree(right)).sha256, leftTree.sha256);
});

test("sealed artifact roots and inventories are exact, narrow, and order-independent", () => {
  const valid = path.join(repositoryRoot, "artifacts", "runs", "review-01");
  assert.equal(validateSealedArtifactRootPath(valid), path.resolve(valid));
  assert.throws(
    () => validateSealedArtifactRootPath(path.join(repositoryRoot, "artifacts", "work")),
    /one direct child/u,
  );
  assert.throws(
    () => validateSealedArtifactRootPath(path.join(repositoryRoot, "artifacts", "runs", "nested", "run")),
    /one direct child/u,
  );
  assert.doesNotThrow(() => assertExactFileInventory(["b", "a"], ["a", "b"]));
  assert.throws(() => assertExactFileInventory(["a", "extra"], ["a"]), /inventory mismatch/u);
});
