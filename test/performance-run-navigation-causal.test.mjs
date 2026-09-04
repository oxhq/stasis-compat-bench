import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createNavigationCausalHostOutcome,
} from "../src/performance/navigation-causal.mjs";
import {
  loadNavigationCausalProvenanceFromEnvironment,
  navigationCausalHostOutcomeArtifactPath,
  navigationCausalHostRawArtifactPath,
  runNavigationCausalCommand,
  verifyNavigationCausalHostFiles,
} from "../src/performance/run-navigation-causal.mjs";
import { linuxPerformanceCandidateIdentity } from "../src/performance/linux-candidate.mjs";
import { cleanHarnessWorktreeEvidence } from "../src/performance/harness-worktree.mjs";
import {
  navigationCausalFixtureEglRuntime,
  navigationCausalHostFixtureRaw,
} from "./fixtures/navigation-causal-host-fixture.mjs";

test("host provenance requires the exact explicit job, ref, attempt, and clean checkout", async () => {
  const environment = githubEnvironment("host-a");
  const provenance = await loadNavigationCausalProvenanceFromEnvironment(environment, {
    hostLane: "host-a",
    checkoutRoot: "E:\\fixture",
    async readHarnessCheckoutIdentity(root) {
      assert.equal(root, "E:\\fixture");
      return {
        revision: "f".repeat(40),
        tree: "1".repeat(40),
        worktree: structuredClone(cleanHarnessWorktreeEvidence),
      };
    },
  });
  assert.equal(provenance.job, "navigation-causal-host-a");
  assert.equal(provenance.hostLane, "host-a");
  assert.equal(provenance.runAttempt, "1");
  assert.equal(
    provenance.workflowSourceRef,
    "refs/heads/codex/stasis-v033-navigation-causal-source",
  );

  await assert.rejects(
    loadNavigationCausalProvenanceFromEnvironment(
      { ...environment, GITHUB_JOB: "navigation-causal-host-b" },
      {
        hostLane: "host-a",
        async readHarnessCheckoutIdentity() {
          return {
            revision: "f".repeat(40),
            tree: "1".repeat(40),
            worktree: structuredClone(cleanHarnessWorktreeEvidence),
          };
        },
      },
    ),
    /Invalid navigation causal GitHub provenance/u,
  );
});

test("the command verifies once, writes sealed raw and outcome files, and disposes once", async () => {
  const raw = await navigationCausalHostFixtureRaw("host-a");
  const verified = {
    identity: linuxPerformanceCandidateIdentity,
    sdk: {
      launch() {},
      CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
    },
  };
  const calls = {
    assertCandidate: 0,
    createRunner: 0,
    dispose: 0,
    writes: [],
  };
  const result = await runNavigationCausalCommand({
    environment: {
      STASIS_NAVIGATION_CAUSAL_HOST: "host-a",
      DISPLAY: ":99",
    },
    loadCandidateSpec(environment) {
      assert.equal(environment.STASIS_NAVIGATION_CAUSAL_HOST, "host-a");
      return { spec: true };
    },
    async verifyCandidate(spec) {
      assert.deepEqual(spec, { spec: true });
      return verified;
    },
    assertCandidate(value) {
      calls.assertCandidate += 1;
      assert.equal(value, verified);
    },
    candidateExecutablePath(value) {
      assert.equal(value, verified);
      return "/verified/stasis";
    },
    async disposeCandidate(value) {
      calls.dispose += 1;
      assert.equal(value, verified);
    },
    async observeHost() {
      return structuredClone(raw.identity.host);
    },
    async observeEglRuntime() {
      return navigationCausalFixtureEglRuntime();
    },
    async loadProvenance(_environment, { hostLane }) {
      assert.equal(hostLane, "host-a");
      return structuredClone(raw.identity.provenance);
    },
    createRunner(options) {
      calls.createRunner += 1;
      assert.equal(options.sdk, verified.sdk);
      assert.equal(options.sdkVersion, "0.3.3");
      assert.equal(options.executablePath, "/verified/stasis");
      return "runner-sentinel";
    },
    async runHost({ identity, runner }) {
      assert.deepEqual(identity, raw.identity);
      assert.equal(runner, "runner-sentinel");
      return raw;
    },
    async assertFreshArtifactRoot() {
      return "E:\\sealed\\host-a";
    },
    async writeRaw(relativePath, value) {
      calls.writes.push({ relativePath, value });
      return `E:\\sealed\\host-a\\${relativePath.replaceAll("/", "\\")}`;
    },
  });

  assert.equal(calls.assertCandidate, 1);
  assert.equal(calls.createRunner, 1);
  assert.equal(calls.dispose, 1);
  assert.deepEqual(
    calls.writes.map(({ relativePath }) => relativePath),
    [
      navigationCausalHostRawArtifactPath("host-a"),
      navigationCausalHostOutcomeArtifactPath("host-a"),
    ],
  );
  assert.equal(calls.writes[0].value, raw);
  assert.deepEqual(calls.writes[1].value, createNavigationCausalHostOutcome(raw));
  assert.equal(result.outcome.status, "VALID_HOST_EFFECT");
});

test("candidate materialization is disposed when host execution throws", async () => {
  const raw = await navigationCausalHostFixtureRaw("host-b");
  const verified = {
    identity: linuxPerformanceCandidateIdentity,
    sdk: { launch() {}, CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2" },
  };
  let disposed = 0;
  await assert.rejects(
    runNavigationCausalCommand({
      environment: { STASIS_NAVIGATION_CAUSAL_HOST: "host-b" },
      loadCandidateSpec: () => ({}),
      verifyCandidate: async () => verified,
      assertCandidate() {},
      candidateExecutablePath: () => "/verified/stasis",
      async disposeCandidate() { disposed += 1; },
      observeHost: async () => structuredClone(raw.identity.host),
      observeEglRuntime: async () => navigationCausalFixtureEglRuntime(),
      loadProvenance: async () => structuredClone(raw.identity.provenance),
      createRunner: () => () => undefined,
      runHost: async () => { throw new Error("host execution failed"); },
      assertFreshArtifactRoot: async () => "E:\\sealed\\host-b",
    }),
    /host execution failed/u,
  );
  assert.equal(disposed, 1);
});

test("canonical raw and outcome files replay exactly and altered bytes fail closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-navigation-causal-"));
  const raw = await navigationCausalHostFixtureRaw("host-b", { openDeltaNs: 0n });
  const outcome = createNavigationCausalHostOutcome(raw);
  const rawPath = path.join(root, "raw.json");
  const outcomePath = path.join(root, "outcome.json");
  try {
    await writeFile(rawPath, canonicalJson(raw));
    await writeFile(outcomePath, canonicalJson(outcome));
    const verified = await verifyNavigationCausalHostFiles(rawPath, outcomePath);
    assert.equal(verified.outcome.status, "VALID_HOST_NO_EFFECT");

    await writeFile(outcomePath, `${canonicalJson(outcome)}\n`);
    await assert.rejects(
      verifyNavigationCausalHostFiles(rawPath, outcomePath),
      /not canonical JSON/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function githubEnvironment(hostLane) {
  return {
    GITHUB_REPOSITORY: "oxhq/stasis",
    GITHUB_WORKFLOW: "Stasis v0.3.3 navigation causal experiment",
    GITHUB_JOB: `navigation-causal-${hostLane}`,
    GITHUB_REF: "refs/heads/codex/stasis-v033-navigation-causal-source",
    GITHUB_RUN_ID: "33900000000",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: "e".repeat(40),
  };
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
