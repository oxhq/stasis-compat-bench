import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { repositoryRoot, sha256DirectoryTree } from "../src/shared/io.mjs";

const frozenTrees = Object.freeze({
  corpora: Object.freeze({
    sha256: "9723a5b8174b70c92098b763d4783d19a61488cfb5a335336fce080f42e0fbd4",
    fileCount: 3,
    totalBytes: 1_012_431,
  }),
  protocol: Object.freeze({
    sha256: "008c95d8829af9598df4545c6d1b0ec54fd85e16f8cf1f742c967692b3f5579a",
    fileCount: 4,
    totalBytes: 38_007,
  }),
});

test("post-support work preserves every frozen corpus and protocol byte", async () => {
  for (const [relativePath, expected] of Object.entries(frozenTrees)) {
    assert.deepEqual(
      await sha256DirectoryTree(path.join(repositoryRoot, ...relativePath.split("/"))),
      expected,
      relativePath,
    );
  }
});

test("public projection freezes the path-projected wild decision binding", async () => {
  assert.deepEqual(
    await sha256DirectoryTree(path.join(repositoryRoot, "src", "wild")),
    {
      sha256: "44ec819855b46800f0d36ae3849ae5c0bf23933329e06ac8933d59e6132c2742",
      fileCount: 25,
      totalBytes: 244_236,
    },
  );
});
