import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { repositoryRoot, sha256DirectoryTree } from "../src/shared/io.mjs";

const historicalProtocolInputs = Object.freeze([
  Object.freeze({
    path: "protocol/stasis-compat-bench-v1.md",
    bytes: 12_491,
    sha256: "d0167e159c4b872e52ac2beb1e8a473bc85ed5ec58a3aaabb764a9c8b975557c",
  }),
  Object.freeze({
    path: "protocol/stasis-post-0.3-census-v1-erratum-1.md",
    bytes: 3_164,
    sha256: "a5289d8483e35519c5c6bf5080d65dbf94dde32424085f34e6931d1f594e9969",
  }),
  Object.freeze({
    path: "protocol/stasis-post-0.3-census-v1-erratum-2.md",
    bytes: 7_767,
    sha256: "ed099546ce5b8c9100a48ebaa3c1488e3dda383f66fea320d1b5afd0b7037ff5",
  }),
  Object.freeze({
    path: "protocol/stasis-post-0.3-census-v1.md",
    bytes: 14_585,
    sha256: "37cea038762e3d120ad548d0e01f711f48b164a8139428cc9150a4948cde34a9",
  }),
]);

test("post-support work preserves every frozen corpus and historical protocol byte", async () => {
  assert.deepEqual(
    await sha256DirectoryTree(path.join(repositoryRoot, "corpora")),
    {
      sha256: "9723a5b8174b70c92098b763d4783d19a61488cfb5a335336fce080f42e0fbd4",
      fileCount: 3,
      totalBytes: 1_012_431,
    },
    "corpora",
  );
  for (const expected of historicalProtocolInputs) {
    const bytes = await readFile(path.join(repositoryRoot, ...expected.path.split("/")));
    assert.deepEqual({
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }, {
      bytes: expected.bytes,
      sha256: expected.sha256,
    }, expected.path);
  }
});

test("current-URL projection freezes the complete wild decision layer", async () => {
  assert.deepEqual(
    await sha256DirectoryTree(path.join(repositoryRoot, "src", "wild")),
    {
      sha256: "3d1187f7f3e2af46ba5a4d1177d2277048d271fde2ffd321dbf86e76364e26aa",
      fileCount: 25,
      totalBytes: 247_211,
    },
  );
});
