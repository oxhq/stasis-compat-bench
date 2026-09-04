import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertPublicProjectionText,
  assertProjectionReceiptSource,
  publicProjectionManifestPrivacyText,
  validatePublicProjectionManifest,
  verifyPublicProjectionTree,
} from "../src/publication/public-projection.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = new URL("../PUBLIC_PROJECTION.json", import.meta.url);
const selectedAuthorEmail = ["garaekz", "gmail.com"].join("@");

test("public projection binds v0.3.3 and the selected publication metadata", async () => {
  const manifest = await loadManifest();
  assert.equal(validatePublicProjectionManifest(manifest), manifest);
  assert.deepEqual(manifest.releaseTarget, {
    identityPath: "publication/release-identity.json",
    package: "@oxhq/stasis",
    version: "0.3.3",
  });
  assert.deepEqual(manifest.publicationChoices, {
    author: {
      email: selectedAuthorEmail,
      name: "David Garay",
    },
    license: {
      bytes: 1061,
      path: "LICENSE",
      sha256: "0301f33644716c8d6d4edd6bb426347d775346109662ff483ae65fc09b60eedb",
      spdxId: "MIT",
    },
  });
  assert.equal(manifest.projectedTree.manifestPath, "PUBLIC_PROJECTION.json");
  assert.equal(manifest.projectedTree.fileCount, manifest.projectedTree.files.length);
  assert.equal(manifest.claimBoundary.correctnessBeforePerformance, true);
  assert.equal(manifest.claimBoundary.performanceClaim, false);
  assert.equal(manifest.claimBoundary.pooledSuccessRate, false);
  assert.equal(manifest.claimBoundary.rwaApiEquivalenceClaim, false);
  assert.equal(manifest.claimBoundary.wildPrevalenceClaim, false);
  assert.equal(manifest.claimBoundary.resultCountAuthority, "generated_evidence_manifest");
  assert.equal(manifest.claimBoundary.applicationChanges, false);
  assert.equal(manifest.claimBoundary.unsupportedOutcomes, "retained_typed_in_denominator");
});

test("public projection freezes every corpus and protocol byte", async () => {
  const manifest = await loadManifest();
  const expectedPaths = [
    "corpora/tranco-74V4X-source.json",
    "corpora/wild-tranco-74V4X-v1-preflight.json",
    "corpora/wild-tranco-74V4X-v1.json",
    "protocol/stasis-compat-bench-v1.md",
    "protocol/stasis-post-0.3-census-v1-erratum-1.md",
    "protocol/stasis-post-0.3-census-v1-erratum-2.md",
    "protocol/stasis-post-0.3-census-v1-erratum-3.md",
    "protocol/stasis-post-0.3-census-v1-erratum-4.md",
    "protocol/stasis-post-0.3-census-v1.md",
  ];
  assert.deepEqual(manifest.unchangedInputs.map((entry) => entry.path), expectedPaths);
  for (const entry of manifest.unchangedInputs) {
    const bytes = await readFile(path.join(repositoryRoot, ...entry.path.split("/")));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha256(bytes), entry.sha256, entry.path);
  }
});

test("public projection path and email exceptions are exact-byte sentinels", () => {
  const machineText = ["C:", "private", "proof.json"].join("\\");
  const machineBytes = Buffer.from(machineText, "utf8");
  const machineException = {
    path: "test/synthetic-path.txt",
    bytes: machineBytes.length,
    sha256: sha256(machineBytes),
    reason: "synthetic path test",
  };
  assert.equal(
    assertPublicProjectionText({
      bytes: machineBytes,
      machinePathException: machineException,
      relativePath: machineException.path,
      text: machineText,
    }),
    machineText,
  );
  assert.throws(
    () => assertPublicProjectionText({
      bytes: Buffer.from(`${machineText}.changed`, "utf8"),
      machinePathException: machineException,
      relativePath: machineException.path,
      text: `${machineText}.changed`,
    }),
    /exception bytes changed/u,
  );
  assert.throws(
    () => assertPublicProjectionText({
      bytes: machineBytes,
      relativePath: machineException.path,
      text: machineText,
    }),
    /unreviewed machine-local path/u,
  );

  const emailText = ["reviewer", "example.test"].join("@");
  const emailBytes = Buffer.from(emailText, "utf8");
  const emailException = {
    path: "test/synthetic-email.txt",
    bytes: emailBytes.length,
    sha256: sha256(emailBytes),
    reason: "synthetic email test",
  };
  assert.equal(
    assertPublicProjectionText({
      bytes: emailBytes,
      emailException,
      relativePath: emailException.path,
      text: emailText,
    }),
    emailText,
  );
  assert.throws(
    () => assertPublicProjectionText({
      bytes: emailBytes,
      relativePath: emailException.path,
      text: emailText,
    }),
    /unreviewed email address/u,
  );
});

test("public projection rejects broader exclusions, receipt drift, and email substring masking", async () => {
  const manifest = await loadManifest();
  const broadened = structuredClone(manifest);
  broadened.sourceExclusions.push({
    pathPrefix: "src/",
    reason: "unapproved source exclusion",
  });
  assert.throws(
    () => validatePublicProjectionManifest(broadened),
    /sole approved prefix/u,
  );

  assert.throws(
    () => assertProjectionReceiptSource(manifest, { sourceRevision: "0".repeat(40) }),
    /receipt source differs/u,
  );

  const selectedEmail = ["a", "example.com"].join("@");
  const unreviewedEmail = `x${selectedEmail}`;
  const selected = structuredClone(manifest);
  selected.publicationChoices.author = {
    name: unreviewedEmail,
    email: selectedEmail,
  };
  const selectedText = `${JSON.stringify(selected, null, 2)}\n`;
  const privacyText = publicProjectionManifestPrivacyText(selectedText, selected);
  assert.equal(privacyText.includes(selectedEmail), true);
  assert.throws(
    () => assertPublicProjectionText({
      bytes: Buffer.from(selectedText, "utf8"),
      relativePath: "PUBLIC_PROJECTION.json",
      text: privacyText,
    }),
    /unreviewed email address/u,
  );
});

test("prepared projection tree reports the remaining fresh-root operation explicitly", async () => {
  const result = await verifyPublicProjectionTree({
    repositoryRoot,
    manifest: await loadManifest(),
    requireClean: false,
  });
  assert.equal(result.status, "passed");
  assert.equal(
    result.sourceTrackedFileCount - result.projectedTrackedFileCount,
    result.sourceExcludedFileCount,
  );
  assert.equal(
    result.freshProjectionRequired,
    !result.sourceHistoryExcluded || !result.sourceExclusionsAbsent,
  );
  if (!result.sourceHistoryExcluded) assert.equal(result.sourceSnapshotVerified, true);
  assert.equal(result.unchangedInputCount, 11);
  assert.equal(result.pathProjectionReceiptVerified, true);
  assert.equal(result.pathProjectionJsonPointerCount, 4);
  assert.equal(result.pathProjectionLogLineCount, 1);
  assert.equal(result.projectedTreeFileCount, result.projectedTrackedFileCount - 1);
  assert.equal(result.authorChoiceSelected, true);
  assert.equal(result.rootAuthorMatchesChoice, true);
  assert.equal(result.rootCommitterMatchesChoice, true);
  assert.equal(result.licenseChoiceSelected, true);
  assert.equal(result.licenseBytesMatchChoice, true);
  assert.equal(result.metadataChoicesComplete, true);
});

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
