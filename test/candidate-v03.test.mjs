import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  assertCandidateV03Sdk,
  candidateV03,
  candidateV03ArchivePath,
  candidateV03PackageRoot,
  loadVerifiedCandidateV03Sdk,
} from "../src/shared/candidate-v03.mjs";

test("real candidate 0.3 archive and extracted tree match every frozen identity", async () => {
  const result = await assertCandidateV03Sdk();
  assert.equal(result.archiveSha256, candidateV03.sdkArchiveSha256);
  assert.equal(result.packageRoot, candidateV03PackageRoot);
  assert.deepEqual(result.tree, {
    sha256: candidateV03.sdkTreeSha256,
    fileCount: candidateV03.sdkTreeFileCount,
    totalBytes: candidateV03.sdkTreeBytes,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.tree), true);
});

test("same-length archive mutation is rejected even with an exact extracted tree", async () => {
  await withCandidateCopy(async ({ archivePath, packageRoot }) => {
    const original = await assertCandidateV03Sdk({ archivePath, packageRoot });
    assert.equal(original.archiveSha256, candidateV03.sdkArchiveSha256);

    const bytes = await readFile(archivePath);
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    await writeFile(archivePath, bytes);
    await assert.rejects(
      assertCandidateV03Sdk({ archivePath, packageRoot }),
      /Candidate SDK archive mismatch/u,
    );
  });
});

test("same-length extracted-module mutation is rejected with the exact archive", async () => {
  await withCandidateCopy(async ({ archivePath, packageRoot }) => {
    const entryPath = path.join(packageRoot, "dist", "index.js");
    const bytes = await readFile(entryPath);
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    await writeFile(entryPath, bytes);
    await assert.rejects(
      assertCandidateV03Sdk({ archivePath, packageRoot }),
      /Candidate SDK extraction mismatch/u,
    );
  });
});

test("verified loader imports the exact extraction and allowlists the 0.3 export contract", async () => {
  const sdk = await loadVerifiedCandidateV03Sdk();
  assert.equal(Object.isFrozen(sdk), true);
  assert.deepEqual(Object.keys(sdk).sort(), [
    "CONTROLLED_WEB_SESSION_V2_PROFILE",
    "crawlWithStasis",
    "createStasisSessionPool",
    "launch",
  ]);
  assert.equal(typeof sdk.launch, "function");
  assert.equal(typeof sdk.crawlWithStasis, "function");
  assert.equal(typeof sdk.createStasisSessionPool, "function");
  assert.equal(sdk.CONTROLLED_WEB_SESSION_V2_PROFILE, candidateV03.profile);

  const exactModule = await import(
    pathToFileURL(path.join(candidateV03PackageRoot, "dist", "index.js")).href
  );
  assert.equal(sdk.launch, exactModule.launch);
  assert.equal(sdk.crawlWithStasis, exactModule.crawlWithStasis);
  assert.equal(sdk.createStasisSessionPool, exactModule.createStasisSessionPool);
});

async function withCandidateCopy(run) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "stasis-candidate-v03-test-"));
  const archivePath = path.join(temporaryRoot, "oxhq-stasis-0.3.0.tgz");
  const packageRoot = path.join(temporaryRoot, "package");
  try {
    await Promise.all([
      cp(candidateV03ArchivePath, archivePath),
      cp(candidateV03PackageRoot, packageRoot, { recursive: true }),
    ]);
    await run({ archivePath, packageRoot });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}
