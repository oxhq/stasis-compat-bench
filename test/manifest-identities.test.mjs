import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFrozenManifestIdentities,
  assertFrozenRwaInstalledPackageTrees,
  FROZEN_IDENTITIES,
  installedRwaEvidence,
} from "../src/shared/manifest.mjs";

test("the frozen identity validator rejects a coherently rewritten run manifest", () => {
  const manifest = validIdentityProjection();
  assert.doesNotThrow(() => assertFrozenManifestIdentities(manifest));

  manifest.stasis.executableSha256 = "0".repeat(64);
  assert.throws(
    () => assertFrozenManifestIdentities(manifest),
    /Stasis executable/u,
  );
});

test("frozen identity constants are recursively immutable", () => {
  assert.equal(Object.isFrozen(FROZEN_IDENTITIES), true);
  assert.equal(Object.isFrozen(FROZEN_IDENTITIES.rwa.buildTree), true);
  assert.equal(Object.isFrozen(FROZEN_IDENTITIES.rwa.installed), true);
  assert.equal(Object.isFrozen(FROZEN_IDENTITIES.installed.packageTrees), true);
});

test("Cypress cache discovery is gated by exact installed package trees", () => {
  const installed = FROZEN_IDENTITIES.rwa.installed;
  const trees = structuredClone({
    nodeModulesTree: installed.nodeModulesTree,
    cypressPackageTree: installed.cypressPackageTree,
    tsNodePackageTree: installed.tsNodePackageTree,
  });
  assert.equal(assertFrozenRwaInstalledPackageTrees(trees), trees);

  trees.cypressPackageTree.sha256 = "0".repeat(64);
  assert.throws(
    () => assertFrozenRwaInstalledPackageTrees(trees),
    /before Cypress cache discovery/u,
  );
});

test("installed RWA inspection cannot execute Cypress before package-tree admission", async () => {
  let commandCalls = 0;
  await assert.rejects(
    () => installedRwaEvidence("C:\\frozen-rwa", {
      hashDirectory: async () => ({
        sha256: "0".repeat(64),
        fileCount: 1,
        totalBytes: 1,
      }),
      runCommand: () => {
        commandCalls += 1;
        return "C:\\unreachable-cache";
      },
    }),
    /before Cypress cache discovery/u,
  );
  assert.equal(commandCalls, 0);
});

function validIdentityProjection() {
  const frozen = FROZEN_IDENTITIES;
  return structuredClone({
    protocol: frozen.protocol,
    environment: {
      node: frozen.node,
      npm: frozen.npm,
      platform: frozen.platform,
      architecture: frozen.architecture,
      nodeExecutableBytes: frozen.nodeExecutable.bytes,
      nodeExecutableSha256: frozen.nodeExecutable.sha256,
    },
    stasis: {
      ...frozen.stasis,
    },
    rwa: {
      revision: frozen.rwa.revision,
      tree: frozen.rwa.tree,
      authSpecOid: frozen.rwa.authSpecOid,
      authSpecBlobSha256: frozen.rwa.authSpecBlobSha256,
      authSpecWorktreeSha256: frozen.rwa.authSpecWorktreeSha256,
      seedOid: frozen.rwa.seedOid,
      seedBlobSha256: frozen.rwa.seedBlobSha256,
      seedWorktreeSha256: frozen.rwa.seedWorktreeSha256,
      buildTree: frozen.rwa.buildTree,
      generatedRuntimeFiles: frozen.rwa.generatedRuntimeFiles,
      runtimeCache: frozen.rwa.runtimeCache,
      localEnvironmentFiles: frozen.rwa.localEnvironmentFiles,
      ambientOverrides: frozen.rwa.ambientOverrides,
      installed: frozen.rwa.installed,
      frontendOrigin: frozen.rwa.frontendOrigin,
      apiOrigin: frozen.rwa.apiOrigin,
      runtime: {
        node: frozen.node,
        yarn: frozen.rwa.yarn,
        cypress: frozen.rwa.cypress,
        electron: frozen.rwa.electron,
        viewport: frozen.rwa.viewport,
      },
    },
    baseline: {
      crawlee: frozen.baseline.crawlee,
      crawleeGitHead: frozen.baseline.crawleeGitHead,
      playwright: frozen.baseline.playwright,
      chromiumRevisionDirectory: frozen.baseline.chromiumRevisionDirectory,
      chromiumVersion: frozen.baseline.chromiumVersion,
      chromiumExecutableSha256: frozen.baseline.chromiumExecutableSha256,
      chromiumInstallTree: frozen.baseline.chromiumInstallTree,
      installed: frozen.installed,
    },
    rules: frozen.rules,
  });
}
