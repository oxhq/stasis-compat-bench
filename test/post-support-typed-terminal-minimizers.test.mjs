import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostSupportCandidateSpec,
  postSupportProfile,
  postSupportRevision,
} from "../src/post-support/candidate-identity.mjs";
import {
  assertAuthoritativeTypedTerminalMinimizerResult,
  assertTypedTerminalMinimizerResult,
  createFinalResponsePartitionedFixture,
  createRedirectHopPartitionedFixture,
  createStaticAnchorLimitFixture,
  createSynchronousDomAnchorLimitFixture,
  frozenPublicWildArtifactIndexSha256,
  runTypedTerminalMinimizers,
  typedMinimizerFixtureBindings,
} from "../src/post-support/typed-terminal-minimizers.mjs";

test("typed-terminal source fixtures retain four independent causal pairs", async (t) => {
  const hashes = Object.values(typedMinimizerFixtureBindings).flatMap(Object.values);
  assert.equal(hashes.length, 8);
  assert.equal(new Set(hashes).size, 8);
  assert.equal(hashes.every((value) => /^[a-f0-9]{64}$/u.test(value)), true);

  await t.test("final response treatment adds only Partitioned", async () => {
    const fixture = await createFinalResponsePartitionedFixture();
    try {
      const [control, treatment] = await Promise.all([
        fetch(fixture.controlUrl),
        fetch(fixture.treatmentUrl),
      ]);
      const controlHeader = control.headers.get("set-cookie");
      const treatmentHeader = treatment.headers.get("set-cookie");
      assert.equal(treatmentHeader, `${controlHeader}; Partitioned`);
      assert.equal(await treatment.text(), await control.text());
      assert.deepEqual(fixture.binding, typedMinimizerFixtureBindings.finalResponse);
      assert.deepEqual(fixture.facts(), { controlRequests: 1, treatmentRequests: 1 });
    } finally {
      await fixture.close();
    }
  });

  await t.test("redirect-hop treatment adds only Partitioned", async () => {
    const fixture = await createRedirectHopPartitionedFixture();
    try {
      const [control, treatment] = await Promise.all([
        fetch(fixture.controlUrl, { redirect: "manual" }),
        fetch(fixture.treatmentUrl, { redirect: "manual" }),
      ]);
      assert.equal(control.status, 302);
      assert.equal(treatment.status, 302);
      assert.equal(treatment.headers.get("location"), control.headers.get("location"));
      assert.equal(
        treatment.headers.get("set-cookie"),
        `${control.headers.get("set-cookie")}; Partitioned`,
      );
      assert.equal(await treatment.text(), await control.text());
      await fetch(new URL(control.headers.get("location"), fixture.controlUrl));
      assert.deepEqual(fixture.binding, typedMinimizerFixtureBindings.redirectHop);
      assert.deepEqual(fixture.facts(), {
        controlStartRequests: 1,
        controlFinalRequests: 1,
        treatmentStartRequests: 1,
        treatmentFinalRequests: 0,
      });
    } finally {
      await fixture.close();
    }
  });

  await t.test("static parser fixtures differ by one anchor", async () => {
    const fixture = await createStaticAnchorLimitFixture();
    try {
      const [control, treatment] = await Promise.all([
        fetch(fixture.controlUrl).then((response) => response.text()),
        fetch(fixture.treatmentUrl).then((response) => response.text()),
      ]);
      assert.equal(control.match(/<a href=/gu)?.length, 128);
      assert.equal(treatment.match(/<a href=/gu)?.length, 129);
      assert.deepEqual(fixture.binding, typedMinimizerFixtureBindings.staticAnchors);
      assert.deepEqual(fixture.facts(), { controlRequests: 1, treatmentRequests: 1 });
    } finally {
      await fixture.close();
    }
  });

  await t.test("synchronous DOM fixtures independently construct 128 and 129 anchors", async () => {
    const fixture = await createSynchronousDomAnchorLimitFixture();
    try {
      const [control, treatment] = await Promise.all([
        fetch(fixture.controlUrl).then((response) => response.text()),
        fetch(fixture.treatmentUrl).then((response) => response.text()),
      ]);
      assert.match(control, /index < 128/u);
      assert.match(treatment, /index < 129/u);
      for (const body of [control, treatment]) {
        assert.match(body, /document\.createElement\("a"\)/u);
        assert.match(body, /root\.appendChild\(anchor\)/u);
        assert.doesNotMatch(body, /<a href=/u);
      }
      assert.deepEqual(
        fixture.binding,
        typedMinimizerFixtureBindings.synchronousDomAnchors,
      );
      assert.deepEqual(fixture.facts(), { controlRequests: 1, treatmentRequests: 1 });
    } finally {
      await fixture.close();
    }
  });
});

test("orchestrator uses eight fresh profile-v2 processes and retains exact terminals", async () => {
  const candidate = verifiedCandidate();
  const closedRuntimes = [];
  const gracefullyClosedSessions = [];
  let launches = 0;
  const result = await runTypedTerminalMinimizers(candidate, {
    launch: async () => fakeRuntime(launches++, closedRuntimes, gracefullyClosedSessions),
    createFinalResponseFixture: async () => fakeFixture(
      "final",
      typedMinimizerFixtureBindings.finalResponse,
      { controlRequests: 1, treatmentRequests: 1 },
    ),
    createRedirectHopFixture: async () => fakeFixture(
      "redirect",
      typedMinimizerFixtureBindings.redirectHop,
      {
        controlStartRequests: 1,
        controlFinalRequests: 1,
        treatmentStartRequests: 1,
        treatmentFinalRequests: 0,
      },
    ),
    createStaticAnchorFixture: async () => fakeFixture(
      "static",
      typedMinimizerFixtureBindings.staticAnchors,
      { controlRequests: 1, treatmentRequests: 1 },
    ),
    createSynchronousDomAnchorFixture: async () => fakeFixture(
      "script",
      typedMinimizerFixtureBindings.synchronousDomAnchors,
      { controlRequests: 1, treatmentRequests: 1 },
    ),
  });

  assert.equal(launches, 8);
  assert.deepEqual(closedRuntimes, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(gracefullyClosedSessions, [
    "final-control",
    "redirect-control",
    "static-control",
    "script-control",
  ]);
  assert.equal(result.candidate.version, "0.3.3");
  assert.equal(result.candidate.profile, postSupportProfile);
  assert.equal(result.executionAuthority, "diagnostic_only");
  assert.equal(result.rules.injectedDependencies, true);
  assert.equal(
    result.wildEvidenceBinding.artifactIndexSha256,
    frozenPublicWildArtifactIndexSha256,
  );
  assert.deepEqual(
    result.scenarios.map(({ treatment }) => treatment.terminal),
    [
      {
        kind: "error",
        name: "StasisProtocolError",
        phase: "open_session",
        code: "unsupported_partitioned_cookie",
        fatal: false,
        stateEffect: "partial",
      },
      {
        kind: "error",
        name: "StasisProtocolError",
        phase: "open_session",
        code: "unsupported_partitioned_cookie",
        fatal: false,
        stateEffect: "partial",
      },
      {
        kind: "error",
        name: "StasisProtocolError",
        phase: "extract",
        code: "automation_match_limit_exceeded",
        fatal: false,
        stateEffect: "none",
      },
      {
        kind: "error",
        name: "StasisProtocolError",
        phase: "query",
        code: "automation_match_limit_exceeded",
        fatal: false,
        stateEffect: "none",
      },
    ],
  );
  assert.equal(result.scenarios[2].control.terminal.observedMatches, 128);
  assert.equal(result.scenarios[3].control.terminal.observedMatches, 128);
  assert.throws(
    () => assertAuthoritativeTypedTerminalMinimizerResult(result),
    /fresh direct in-process/u,
  );
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /http:\/\/fixture|set-cookie|stasis_partitioned_/iu);
  assert.doesNotMatch(serialized, /[a-z]:\\|stderr|message/iu);
});

test("validator rejects weakened bindings, terminals, cleanup, and controls", () => {
  const valid = validResult(verifiedCandidate().identity);
  assert.equal(assertTypedTerminalMinimizerResult(valid), valid);
  const attacks = [
    mutate(valid, (value) => {
      value.wildEvidenceBinding.artifactIndexSha256 = "f".repeat(64);
    }),
    mutate(valid, (value) => {
      value.scenarios[0].fixtureBinding.controlSha256 = "e".repeat(64);
    }),
    mutate(valid, (value) => {
      value.scenarios[1].treatment.terminal.stateEffect = "none";
    }),
    mutate(valid, (value) => {
      value.scenarios[2].treatment.cleanup.mode = "graceful_session_close_then_runtime_close";
    }),
    mutate(valid, (value) => {
      value.scenarios[3].control.terminal.observedMatches = 129;
    }),
    mutate(valid, (value) => {
      value.scenarios[2].causalContract.treatmentMatches = 128;
    }),
    mutate(valid, (value) => {
      value.executionAuthority = "diagnostic_only";
    }),
  ];
  for (const attack of attacks) {
    assert.throws(() => assertTypedTerminalMinimizerResult(attack), /Invalid typed-terminal/u);
  }
});

test("zero-injection authority requires the direct candidate brand", async () => {
  await assert.rejects(
    () => runTypedTerminalMinimizers(verifiedCandidate()),
    /direct default candidate verification output/u,
  );
});

function fakeRuntime(runtimeIndex, closedRuntimes, gracefullyClosedSessions) {
  return {
    async openSession(url, options) {
      assert.equal(options.profile, postSupportProfile);
      assert.deepEqual(options.network, { mode: "live", routes: [] });
      const id = new URL(url).pathname.slice(1);
      if (["final-treatment", "redirect-treatment"].includes(id)) {
        throw typedError("unsupported_partitioned_cookie", "partial");
      }
      return {
        stateToken: "open-token",
        async settle(expectedToken) {
          assert.equal(expectedToken, "open-token");
          return { outcome: "quiescent", stateToken: "settled-token" };
        },
        async extract(_plan, expectedToken) {
          assert.equal(expectedToken, "settled-token");
          if (id === "static-treatment") {
            throw typedError("automation_match_limit_exceeded", "none");
          }
          return { rows: Array.from({ length: 128 }, () => ({ fields: [] })) };
        },
        async query(_selector, expectedToken) {
          assert.equal(expectedToken, "settled-token");
          if (id === "script-treatment") {
            throw typedError("automation_match_limit_exceeded", "none");
          }
          return { count: 128n };
        },
        async close() { gracefullyClosedSessions.push(id); },
      };
    },
    async close() { closedRuntimes.push(runtimeIndex); },
  };
}

function typedError(code, stateEffect) {
  const error = new Error(code);
  error.name = "StasisProtocolError";
  error.code = code;
  error.fatal = false;
  error.stateEffect = stateEffect;
  return error;
}

function fakeFixture(id, binding, evidence) {
  return {
    controlUrl: `http://fixture.test/${id}-control`,
    treatmentUrl: `http://fixture.test/${id}-treatment`,
    binding,
    facts: () => ({ ...evidence }),
    close: async () => undefined,
  };
}

function validResult(candidate) {
  const control = (phase, observedMatches) => ({
    status: "passed",
    terminal: {
      kind: "success",
      phase,
      code: "completed",
      fatal: null,
      stateEffect: null,
      settleOutcome: "quiescent",
      ...(observedMatches === undefined ? {} : { observedMatches }),
    },
    cleanup: { status: "passed", mode: "graceful_session_close_then_runtime_close" },
  });
  const treatment = (phase, code, stateEffect) => ({
    status: "passed",
    terminal: {
      kind: "error",
      name: "StasisProtocolError",
      phase,
      code,
      fatal: false,
      stateEffect,
    },
    cleanup: { status: "passed", mode: "fail_stop_runtime_close" },
  });
  return {
    schema: "stasis-post-support-typed-terminal-minimizers-v1",
    claimBoundary:
      "local causal typed-terminal proof bound to frozen organic evidence; not a new corpus prevalence claim",
    executionAuthority: "default_verified_candidate_uninjected",
    candidate,
    wildEvidenceBinding: { artifactIndexSha256: frozenPublicWildArtifactIndexSha256 },
    rules: {
      appCodeChanges: false,
      profile: postSupportProfile,
      freshNativeProcessPerVariant: true,
      processCount: 8,
      retries: 0,
      sleeps: false,
      polling: false,
      fallback: false,
      injectedDependencies: false,
    },
    scenarios: [
      {
        id: "partitioned-final-response",
        family: "storage",
        construction: "final_response_set_cookie",
        causalDelta: "one Partitioned response attribute",
        causalContract: {
          controlPartitionedAttribute: false,
          treatmentPartitionedAttribute: true,
          rejectionBoundary: "before_cookie_jar_mutation",
        },
        processCount: 2,
        fixtureBinding: typedMinimizerFixtureBindings.finalResponse,
        control: control("settle"),
        treatment: treatment("open_session", "unsupported_partitioned_cookie", "partial"),
        evidence: { controlRequests: 1, treatmentRequests: 1 },
      },
      {
        id: "partitioned-redirect-hop",
        family: "storage",
        construction: "redirect_hop_set_cookie",
        causalDelta: "one Partitioned response attribute",
        causalContract: {
          controlPartitionedAttribute: false,
          treatmentPartitionedAttribute: true,
          rejectionBoundary: "before_cookie_jar_mutation",
        },
        processCount: 2,
        fixtureBinding: typedMinimizerFixtureBindings.redirectHop,
        control: control("settle"),
        treatment: treatment("open_session", "unsupported_partitioned_cookie", "partial"),
        evidence: {
          controlStartRequests: 1,
          controlFinalRequests: 1,
          treatmentStartRequests: 1,
          treatmentFinalRequests: 0,
        },
      },
      {
        id: "static-anchor-match-limit",
        family: "extraction_limit",
        construction: "parser_inserted_static_anchors_extract",
        causalDelta: "one additional static anchor match",
        causalContract: {
          publicMaximumMatches: 128,
          controlMatches: 128,
          treatmentMatches: 129,
        },
        processCount: 2,
        fixtureBinding: typedMinimizerFixtureBindings.staticAnchors,
        control: control("extract", 128),
        treatment: treatment("extract", "automation_match_limit_exceeded", "none"),
        evidence: { controlRequests: 1, treatmentRequests: 1 },
      },
      {
        id: "synchronous-dom-anchor-match-limit",
        family: "extraction_limit",
        construction: "script_created_anchors_query",
        causalDelta: "one additional synchronous DOM anchor match",
        causalContract: {
          publicMaximumMatches: 128,
          controlMatches: 128,
          treatmentMatches: 129,
        },
        processCount: 2,
        fixtureBinding: typedMinimizerFixtureBindings.synchronousDomAnchors,
        control: control("query", 128),
        treatment: treatment("query", "automation_match_limit_exceeded", "none"),
        evidence: { controlRequests: 1, treatmentRequests: 1 },
      },
    ],
  };
}

function mutate(value, mutation) {
  const cloned = structuredClone(value);
  mutation(cloned);
  return cloned;
}

function verifiedCandidate() {
  const identity = createPostSupportCandidateSpec({
    packageRunId: "33506181780",
    packageRunAttempt: "1",
    revision: postSupportRevision,
    windowsZipPath: "C:\\private\\stasis-0.3.3-windows-x86_64-ci.zip",
    windowsZipSha256: "1".repeat(64),
    windowsZipBytes: "10",
    executablePath: "C:\\private\\stasis.exe",
    executableSha256: "2".repeat(64),
    executableBytes: "20",
    sdkArchivePath: "C:\\private\\oxhq-stasis-0.3.3.tgz",
    sdkArchiveSha256: "3".repeat(64),
    sdkArchiveBytes: "30",
    sdkProofPath: "C:\\private\\stasis-0.3.3-typescript-act-settle-inspect.json",
    sdkProofSha256: "5".repeat(64),
    sdkProofBytes: "50",
    sdkPackageRoot: "C:\\private\\oxhq-stasis-0.3.3\\package",
    sdkTreeSha256: "4".repeat(64),
    sdkTreeFileCount: "5",
    sdkTreeBytes: "40",
  });
  return {
    identity,
    executableSha256: identity.windows.executable.sha256,
    sdk: {
      launch() {},
      CONTROLLED_WEB_SESSION_V2_PROFILE: postSupportProfile,
    },
  };
}
