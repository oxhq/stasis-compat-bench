import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  assertAuthoritativeLinuxPerformanceCandidate,
  createLinuxPerformanceCandidateSpec,
  linuxPerformanceCandidateIdentity,
  linuxPerformanceExecutablePath,
  verifyLinuxPerformanceCandidate,
} from "../src/performance/linux-candidate.mjs";

function candidatePaths(root = path.resolve("fixture-root")) {
  return {
    archive: path.join(root, linuxPerformanceCandidateIdentity.linux.archive.name),
    executable: path.join(root, "stasis-0.3.3-linux-x86_64", "stasis"),
    proof: path.join(root, linuxPerformanceCandidateIdentity.linux.proof.name),
    runtimeManifest: path.join(
      root,
      linuxPerformanceCandidateIdentity.release.runtimeManifest.name,
    ),
    sdkArchive: path.join(root, linuxPerformanceCandidateIdentity.sdk.archive.name),
    sdkPackageRoot: path.join(root, "package"),
  };
}

function proof() {
  const identity = linuxPerformanceCandidateIdentity;
  return {
    schema: 2,
    platform: identity.linux.platform,
    version: identity.version,
    revision: identity.revision,
    workflowRunId: String(identity.packageQualification.runId),
    workflowRunAttempt: String(identity.packageQualification.runAttempt),
    gate: "act-settle-inspect",
    test: "release_gate_published_binary_completes_act_settle_inspect",
    archive: { name: identity.linux.archive.name, sha256: identity.linux.archive.sha256 },
    binary: {
      path: "stasis-0.3.3-linux-x86_64/stasis",
      sha256: identity.linux.executable.sha256,
    },
    source: { stasis_revision: identity.revision },
  };
}

function manifest() {
  const identity = linuxPerformanceCandidateIdentity;
  return {
    schema: 1,
    releaseTag: identity.release.tag,
    sdkVersion: identity.version,
    implementation: { source: { stasis_revision: identity.revision } },
    artifacts: {
      "linux-x64": {
        releasePlatform: identity.linux.platform,
        archiveSha256: identity.linux.archive.sha256,
        archiveSizeBytes: identity.linux.archive.bytes,
        executableSha256: identity.linux.executable.sha256,
        nodePlatform: "linux",
        nodeArch: "x64",
      },
    },
  };
}

function sdk() {
  return {
    launch() {},
    crawlWithStasis() {},
    createStasisSessionPool() {},
    CONTROLLED_WEB_SESSION_V2_PROFILE: linuxPerformanceCandidateIdentity.profile,
  };
}

function dependencies(overrides = {}) {
  const identity = linuxPerformanceCandidateIdentity;
  const hashes = [
    identity.linux.archive.sha256,
    identity.linux.executable.sha256,
    identity.linux.proof.sha256,
    identity.release.runtimeManifest.sha256,
    identity.sdk.archive.sha256,
  ];
  let hashIndex = 0;
  return {
    observeRuntime: () => ({ platform: "linux", arch: "x64", node: "v22.20.0" }),
    inspectPath: async () => undefined,
    hashFile: async () => hashes[hashIndex++],
    hashIntegrity: async () => identity.sdk.archive.integrity,
    hashTree: async () => structuredClone(identity.sdk.tree),
    readText: async (value) => {
      if (value.endsWith(identity.linux.proof.name)) return JSON.stringify(proof());
      if (value.endsWith(identity.release.runtimeManifest.name)) return JSON.stringify(manifest());
      return JSON.stringify({ name: identity.sdk.package, version: identity.version });
    },
    materializeRuntime: async () => ({
      ownerRoot: path.join(candidatePaths().archive, "..", "owned-runtime"),
      executablePath: candidatePaths().executable,
      bytes: identity.linux.executable.bytes,
      sha256: identity.linux.executable.sha256,
      async dispose() {},
    }),
    materializeSdk: async () => ({
      ownerRoot: path.join(candidatePaths().archive, "..", "owned-sdk"),
      packageRoot: candidatePaths().sdkPackageRoot,
      tree: structuredClone(identity.sdk.tree),
      async dispose() {},
    }),
    importSdk: async () => sdk(),
    ...overrides,
  };
}

test("Linux candidate verification binds release, executable, and SDK identities", async () => {
  const spec = createLinuxPerformanceCandidateSpec(candidatePaths());
  const verified = await verifyLinuxPerformanceCandidate(spec, dependencies());
  assert.deepEqual(verified.identity, linuxPerformanceCandidateIdentity);
  assert.equal(verified.runtime.platform, "linux");
  assert.equal(linuxPerformanceExecutablePath(verified), candidatePaths().executable);
  assert.throws(
    () => assertAuthoritativeLinuxPerformanceCandidate(verified),
    /default verification/u,
  );
});

test("Linux candidate verification fails before SDK import on a wrong binary", async () => {
  let imported = false;
  const spec = createLinuxPerformanceCandidateSpec(candidatePaths());
  const deps = dependencies({
    hashFile: async (value) => value.endsWith("stasis")
      ? "0".repeat(64)
      : dependencies().hashFile(value),
    importSdk: async () => {
      imported = true;
      return sdk();
    },
  });
  await assert.rejects(
    verifyLinuxPerformanceCandidate(spec, deps),
    /Linux executable SHA-256 mismatch/u,
  );
  assert.equal(imported, false);
});

test("Linux candidate paths and runtime identity fail closed", async () => {
  const values = candidatePaths();
  assert.throws(
    () => createLinuxPerformanceCandidateSpec({ ...values, archive: "relative.tar.gz" }),
    /absolute/u,
  );
  const spec = createLinuxPerformanceCandidateSpec(values);
  await assert.rejects(
    verifyLinuxPerformanceCandidate(spec, dependencies({
      observeRuntime: () => ({ platform: "win32", arch: "x64", node: "v22.20.0" }),
    })),
    /Linux x64/u,
  );
});

test("Linux candidate rejects a mismatched manifest or SDK tree", async () => {
  const spec = createLinuxPerformanceCandidateSpec(candidatePaths());
  await assert.rejects(
    verifyLinuxPerformanceCandidate(spec, dependencies({
      hashTree: async () => ({
        ...linuxPerformanceCandidateIdentity.sdk.tree,
        totalBytes: linuxPerformanceCandidateIdentity.sdk.tree.totalBytes + 1,
      }),
    })),
    /SDK extracted tree/u,
  );

  await assert.rejects(
    verifyLinuxPerformanceCandidate(spec, dependencies({
      readText: async (value) => value.endsWith(
        linuxPerformanceCandidateIdentity.release.runtimeManifest.name,
      )
        ? JSON.stringify({ ...manifest(), releaseTag: "v0.3.2" })
        : value.endsWith(linuxPerformanceCandidateIdentity.linux.proof.name)
          ? JSON.stringify(proof())
          : JSON.stringify({
              name: linuxPerformanceCandidateIdentity.sdk.package,
              version: linuxPerformanceCandidateIdentity.version,
            }),
    })),
    /Runtime manifest identity/u,
  );
});
