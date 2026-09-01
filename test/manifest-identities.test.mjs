import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFrozenManifestIdentities,
  FROZEN_IDENTITIES,
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
