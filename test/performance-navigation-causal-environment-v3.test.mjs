import assert from "node:assert/strict";
import test from "node:test";

import {
  createNavigationCausalJob,
  createStasisNavigationCausalRunner,
} from "../src/performance/navigation-causal.mjs";
import { linuxPerformanceCandidateIdentity } from "../src/performance/linux-candidate.mjs";
import { runNavigationCausalCommand } from "../src/performance/run-navigation-causal.mjs";
import {
  navigationCausalFixtureEglRuntime,
  navigationCausalHostFixtureRaw,
} from "./fixtures/navigation-causal-host-fixture.mjs";

test("the V3 command snapshots native process.env before the sealed runner boundary", async () => {
  assert.equal(process.version, "v22.20.0");
  const restored = preserveEnvironment([
    "STASIS_NAVIGATION_CAUSAL_HOST",
    "STASIS_LIFECYCLE_TRACE_V1",
  ]);
  process.env.STASIS_NAVIGATION_CAUSAL_HOST = "host-a";
  process.env.STASIS_LIFECYCLE_TRACE_V1 = "diagnostic-only";

  try {
    const expectedCommandEnvironment = { ...process.env };
    const raw = await navigationCausalHostFixtureRaw("host-a");
    let launchCount = 0;
    let disposeCount = 0;
    let runHostCount = 0;
    let commandEnvironment;
    let launchOptions;
    const sdk = {
      CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v2",
      async launch(options) {
        launchCount += 1;
        launchOptions = options;
        throw new Error("mock launch boundary reached");
      },
    };
    const verified = {
      identity: linuxPerformanceCandidateIdentity,
      sdk,
    };

    assert.notEqual(Object.getPrototypeOf(process.env), Object.prototype);
    assert.throws(
      () => createStasisNavigationCausalRunner({
        sdk,
        sdkVersion: "0.3.3",
        executablePath: "/verified/stasis",
        environment: process.env,
      }),
      /The launch environment must be an object/u,
    );
    assert.equal(launchCount, 0);

    const result = await runNavigationCausalCommand({
      loadCandidateSpec(environment) {
        commandEnvironment = environment;
        return { exactCandidate: true };
      },
      async verifyCandidate(spec) {
        assert.deepEqual(spec, { exactCandidate: true });
        return verified;
      },
      assertCandidate(value) {
        assert.equal(value, verified);
      },
      candidateExecutablePath(value) {
        assert.equal(value, verified);
        return "/verified/stasis";
      },
      async disposeCandidate(value) {
        assert.equal(value, verified);
        disposeCount += 1;
      },
      async observeHost({ environment }) {
        assert.equal(environment, commandEnvironment);
        return structuredClone(raw.identity.host);
      },
      async observeEglRuntime() {
        return navigationCausalFixtureEglRuntime();
      },
      async loadProvenance(environment, { hostLane }) {
        assert.equal(environment, commandEnvironment);
        assert.equal(hostLane, "host-a");
        return structuredClone(raw.identity.provenance);
      },
      async runHost({ identity, runner }) {
        runHostCount += 1;
        assert.deepEqual(identity, raw.identity);
        const observation = await runner(createNavigationCausalJob({
          hostLane: "host-a",
          phase: "warmup",
          arm: "A",
          ordinal: 1,
        }));
        assert.equal(observation.status, "failed");
        assert.equal(observation.error.phase, "processProtocolLaunch");
        return raw;
      },
      async assertFreshArtifactRoot() {
        return "/sealed/host-a";
      },
      async writeRaw(relativePath) {
        return `/sealed/host-a/${relativePath}`;
      },
    });

    assert.equal(Object.getPrototypeOf(commandEnvironment), Object.prototype);
    assert.notEqual(commandEnvironment, process.env);
    assert.deepEqual(commandEnvironment, expectedCommandEnvironment);
    assert.equal(runHostCount, 1);
    assert.equal(launchCount, 1);
    assert.equal(disposeCount, 1);
    assert.equal(result.outcome.status, "VALID_HOST_EFFECT");
    assert.equal(launchOptions.executablePath, "/verified/stasis");
    assert.equal(launchOptions.commandTimeoutMs, 30_000);
    assert.equal(Object.getPrototypeOf(launchOptions.env), Object.prototype);
    const expectedLaunchEnvironment = { ...expectedCommandEnvironment };
    delete expectedLaunchEnvironment.STASIS_LIFECYCLE_TRACE_V1;
    assert.deepEqual(launchOptions.env, expectedLaunchEnvironment);
    assert.equal(
      commandEnvironment.STASIS_LIFECYCLE_TRACE_V1,
      "diagnostic-only",
    );
    assert.deepEqual({ ...process.env }, expectedCommandEnvironment);
  } finally {
    restored();
  }
});

function preserveEnvironment(names) {
  const before = new Map(names.map((name) => [
    name,
    Object.hasOwn(process.env, name) ? process.env[name] : undefined,
  ]));
  return () => {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}
