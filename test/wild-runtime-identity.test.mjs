import assert from "node:assert/strict";
import test from "node:test";

import { candidate, expectedVersions, runtimePins } from "../src/wild/config.mjs";
import {
  assertMatchesPreflightRuntime,
  assertPinnedRuntimeIdentity,
} from "../src/wild/runtime-identity.mjs";

const identity = Object.freeze({
  node: expectedVersions.node,
  nodeExecutableBasename: runtimePins.nodeExecutableBasename,
  nodeExecutableBytes: runtimePins.nodeExecutableBytes,
  nodeExecutableSha256: runtimePins.nodeExecutableSha256,
  candidateSdkTarball: "candidate/oxhq-stasis-0.3.0.tgz",
  candidateSdkTarballBytes: runtimePins.candidateSdkTarballBytes,
  candidateSdkTarballSha256: runtimePins.candidateSdkTarballSha256,
  candidateSdk: candidate.version,
  candidateSdkTree: runtimePins.candidateSdkTree,
  harnessSdk: "0.2.1",
  crawlee: expectedVersions.crawlee,
  crawleeTree: runtimePins.crawleeTree,
  playwright: expectedVersions.playwright,
  playwrightTree: runtimePins.playwrightTree,
  installedNodeModulesTree: runtimePins.installedNodeModulesTree,
  chromiumVersion: "151.0.7922.34",
  chromiumExecutableBasename: runtimePins.chromiumExecutableBasename,
  chromiumExecutableBytes: runtimePins.chromiumExecutableBytes,
  chromiumExecutableSha256: runtimePins.chromiumExecutableSha256,
});

test("pinned runtime identity checks actual Node, candidate SDK, dependency, and browser bytes", () => {
  if (runtimePins.installedNodeModulesTree === null) {
    assert.throws(
      () => assertPinnedRuntimeIdentity(identity),
      /installedNodeModulesTree pin is not frozen/u,
    );
  } else {
    assert.doesNotThrow(() => assertPinnedRuntimeIdentity(identity));
  }
  assert.equal(Object.hasOwn(identity, "nodeExecutable"), false);
  assert.equal(Object.hasOwn(identity, "chromiumExecutable"), false);
  assert.throws(
    () => assertPinnedRuntimeIdentity({ ...identity, nodeExecutableBasename: "node-copy.exe" }),
    /nodeExecutableBasename/u,
  );
  assert.throws(
    () => assertPinnedRuntimeIdentity({ ...identity, nodeExecutableSha256: "0".repeat(64) }),
    /nodeExecutableSha256/u,
  );
  assert.throws(
    () => assertPinnedRuntimeIdentity({
      ...identity,
      candidateSdkTree: { ...identity.candidateSdkTree, totalBytes: 1 },
    }),
    /candidateSdkTree/u,
  );
  assert.throws(
    () => assertPinnedRuntimeIdentity({ ...identity, chromiumExecutableSha256: "0".repeat(64) }),
    /chromiumExecutableSha256/u,
  );
});

test("paired runtime must exactly match the preflight runtime record", () => {
  assert.doesNotThrow(() => assertMatchesPreflightRuntime(identity, identity));
  assert.throws(
    () => assertMatchesPreflightRuntime(identity, { ...identity, chromiumVersion: "drift" }),
    /differs from the frozen preflight/u,
  );
});
