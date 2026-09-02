import assert from "node:assert/strict";
import test from "node:test";

import { compareCrawl } from "../src/crawl/compare-lib.mjs";
import {
  expectedPrimaryScheduledUrls,
  negativeControls,
} from "../src/crawl/corpus.mjs";
import { compareDeterministicV03 } from "../src/crawl-v03/compare-lib.mjs";
import {
  deterministicV03BaselineEnvelope,
  deterministicV03CandidateEnvelope,
  deterministicV03Protocol,
} from "../src/crawl-v03/identity.mjs";
import { runPlaywrightV03Proof } from "../src/crawl-v03/playwright-lane.mjs";
import {
  runStasisV03Case,
  verifyStasisV03Candidate,
} from "../src/crawl-v03/stasis-lane.mjs";
import { candidateV03 } from "../src/shared/candidate-v03.mjs";

function page(url, lane = "baseline") {
  const index = expectedPrimaryScheduledUrls.indexOf(url);
  return {
    requestedUrl: url,
    url,
    depth: index < 1 ? 0 : index <= 10 ? 1 : 2,
    status: "crawled",
    ...(lane === "candidate" ? { settleOutcome: "quiescent" } : {}),
    links: [],
  };
}

function raw(envelope, lane) {
  return {
    ...structuredClone(envelope),
    primary: {
      success: true,
      wallTimeMs: 1,
      failures: [],
      fixtureMisses: [],
      result: {
        scheduledUrls: [...expectedPrimaryScheduledUrls],
        pages: expectedPrimaryScheduledUrls.map((url) => page(url, lane)),
      },
    },
    negativeControls: negativeControls.map((control) => ({
      id: control.id,
      expectedSurface: control.expectedSurface,
      success: true,
      failures: [],
      fixtureMisses: [],
      result: {
        scheduledUrls: [control.start],
        pages: [page(control.start, lane)],
      },
    })),
  };
}

function v03Baseline() {
  return raw(deterministicV03BaselineEnvelope, "baseline");
}

function v03Candidate() {
  return raw(deterministicV03CandidateEnvelope, "candidate");
}

function v01Baseline() {
  const value = v03Baseline();
  value.schema = "stasis-compat-crawl-playwright-raw-v1";
  value.protocol = "stasis-compat-bench-v1";
  value.track = "crawling";
  return value;
}

function v02Candidate() {
  const value = v03Candidate();
  value.schema = "stasis-compat-crawl-stasis-raw-v1";
  value.protocol = "stasis-compat-bench-v1";
  value.track = "crawling";
  value.runner = "stasis-reference-crawler";
  value.versions = {
    node: "v22.20.0",
    sdk: "0.2.1",
    executableSha256:
      "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d",
  };
  delete value.rules.profile;
  return value;
}

test("v0.3 deterministic evidence is exact under its separate census identity", () => {
  const result = compareDeterministicV03(v03Baseline(), v03Candidate());
  assert.equal(result.protocol, deterministicV03Protocol);
  assert.equal(result.baselineIdentityValid, true);
  assert.equal(result.candidateIdentityValid, true);
  assert.equal(result.baselineValid, true);
  assert.equal(result.candidateValid, true);
  assert.deepEqual(result.counts, { PASS_EQUIVALENT: 20 });
});

test("frozen v0.2 and v0.3 deterministic identities cannot cross-validate", () => {
  const oldLane = compareCrawl(v01Baseline(), v03Candidate());
  assert.equal(oldLane.candidateIdentityValid, false);
  assert.equal(oldLane.candidateValid, false);

  const newLane = compareDeterministicV03(v03Baseline(), v02Candidate());
  assert.equal(newLane.candidateIdentityValid, false);
  assert.equal(newLane.candidateValid, false);
});

test("every v0.3 candidate identity field is fail-closed", () => {
  const mutations = [
    (value) => { value.protocol = "stasis-compat-bench-v1"; },
    (value) => { value.versions.sdk = "0.2.1"; },
    (value) => { value.versions.sourceRevision = "0".repeat(40); },
    (value) => { value.versions.executableSha256 = "0".repeat(64); },
    (value) => { value.versions.sdkArchiveSha256 = "0".repeat(64); },
    (value) => { value.versions.sdkArchiveBytes += 1; },
    (value) => { value.versions.sdkTree.sha256 = "0".repeat(64); },
    (value) => { value.versions.sdkTree.fileCount += 1; },
    (value) => { value.versions.sdkTree.totalBytes += 1; },
    (value) => { value.rules.profile = "controlled-web-session-v1"; },
  ];
  for (const mutate of mutations) {
    const candidate = v03Candidate();
    mutate(candidate);
    const result = compareDeterministicV03(v03Baseline(), candidate);
    assert.equal(result.candidateIdentityValid, false);
    assert.equal(result.candidateValid, false);
    assert.deepEqual(result.counts, { BENCHMARK_INVALID: 20 });
  }
});

test("wrong native bytes fail before candidate SDK loading", async () => {
  let sdkLoaded = false;
  await assert.rejects(
    verifyStasisV03Candidate("C:\\candidate\\stasis.exe", {
      hashExecutable: async () => "0".repeat(64),
      loadSdk: async () => {
        sdkLoaded = true;
        return {};
      },
    }),
    /requires hosted candidate/u,
  );
  assert.equal(sdkLoaded, false);
});

test("verified native identity requires the exact v2 SDK surface", async () => {
  const verified = await verifyStasisV03Candidate("C:\\candidate\\stasis.exe", {
    hashExecutable: async () => candidateV03.executableSha256,
    loadSdk: async () => ({
      crawlWithStasis() {},
      createStasisSessionPool() {},
      CONTROLLED_WEB_SESSION_V2_PROFILE: candidateV03.profile,
    }),
  });
  assert.equal(verified.executableSha256, candidateV03.executableSha256);

  await assert.rejects(
    verifyStasisV03Candidate("C:\\candidate\\stasis.exe", {
      hashExecutable: async () => candidateV03.executableSha256,
      loadSdk: async () => ({
        crawlWithStasis() {},
        createStasisSessionPool() {},
        CONTROLLED_WEB_SESSION_V2_PROFILE: "controlled-web-session-v1",
      }),
    }),
    /SDK surface is incomplete/u,
  );
});

test("v0.3 baseline wrapper changes only the census envelope", async () => {
  const frozen = v01Baseline();
  const wrapped = await runPlaywrightV03Proof({ runFrozenBaseline: async () => frozen });
  assert.equal(wrapped.schema, deterministicV03BaselineEnvelope.schema);
  assert.equal(wrapped.protocol, deterministicV03Protocol);
  assert.equal(wrapped.track, deterministicV03BaselineEnvelope.track);
  assert.deepEqual(wrapped.primary, frozen.primary);
  assert.deepEqual(wrapped.versions, frozen.versions);
  assert.deepEqual(wrapped.rules, frozen.rules);
});

test("runtime_error is valid terminal evidence and classifies as ENGINE_BUG", () => {
  const candidate = v03Candidate();
  const terminal = candidate.primary.result.pages[0];
  terminal.status = "settlement_not_crawlable";
  terminal.settleOutcome = "runtime_error";
  terminal.links = [];

  const result = compareDeterministicV03(v03Baseline(), candidate);
  assert.equal(result.candidateValid, true);
  assert.deepEqual(result.counts, { ENGINE_BUG: 1, PASS_EQUIVALENT: 19 });
  assert.deepEqual(
    {
      classification: result.primaryCases[0].classification,
      surface: result.primaryCases[0].surface,
      settleOutcome: result.primaryCases[0].settleOutcome,
      retainedOutcome: result.primaryCases[0].stasis.settleOutcome,
    },
    {
      classification: "ENGINE_BUG",
      surface: "engine_correctness",
      settleOutcome: "runtime_error",
      retainedOutcome: "runtime_error",
    },
  );
});

test("all six v0.3 settlement limits validate and retain their typed limit kind", () => {
  const limits = new Map([
    ["virtual_time_limit_exceeded", "virtual_time"],
    ["control_turn_limit_exceeded", "control_turns"],
    ["task_limit_exceeded", "ordinary_tasks"],
    ["microtask_limit_exceeded", "microtasks"],
    ["rendering_limit_exceeded", "rendering_opportunities"],
    ["mutation_limit_exceeded", "mutations"],
  ]);

  for (const [outcome, limitKind] of limits) {
    const candidate = v03Candidate();
    const terminal = candidate.primary.result.pages[0];
    terminal.status = "settlement_not_crawlable";
    terminal.settleOutcome = outcome;
    terminal.links = [];

    const result = compareDeterministicV03(v03Baseline(), candidate);
    assert.equal(result.candidateValid, true, outcome);
    assert.deepEqual(
      result.counts,
      { PROFILE_UNSUPPORTED: 1, PASS_EQUIVALENT: 19 },
      outcome,
    );
    assert.deepEqual(
      {
        classification: result.primaryCases[0].classification,
        surface: result.primaryCases[0].surface,
        settleOutcome: result.primaryCases[0].settleOutcome,
        limitKind: result.primaryCases[0].limitKind,
        retainedOutcome: result.primaryCases[0].stasis.settleOutcome,
      },
      {
        classification: "PROFILE_UNSUPPORTED",
        surface: "execution_limit",
        settleOutcome: outcome,
        limitKind,
        retainedOutcome: outcome,
      },
      outcome,
    );
  }
});

test("designed controls preserve typed worker and iframe terminals", () => {
  const candidate = v03Candidate();
  candidate.negativeControls = [
    {
      id: "worker",
      expectedSurface: "worker",
      success: false,
      error: { name: "StasisProtocolError", code: "unsupported_work" },
    },
    {
      id: "iframe",
      expectedSurface: "iframe",
      success: false,
      error: { name: "StasisStateError", code: "navigation_authority_changed" },
    },
  ];

  const result = compareDeterministicV03(v03Baseline(), candidate);
  assert.equal(result.candidateValid, true);
  assert.deepEqual(
    result.negativeControls.map((control) => ({
      id: control.id,
      classification: control.classification,
      surface: control.surface,
      diagnosisConfidence: control.diagnosisConfidence,
      terminal: control.terminal,
    })),
    [
      {
        id: "worker",
        classification: "PROFILE_UNSUPPORTED",
        surface: "worker",
        diagnosisConfidence: "typed_designed_control",
        terminal: { kind: "error", code: "unsupported_work" },
      },
      {
        id: "iframe",
        classification: "PROFILE_UNSUPPORTED",
        surface: "iframe",
        diagnosisConfidence: "typed_designed_control",
        terminal: { kind: "error", code: "navigation_authority_changed" },
      },
    ],
  );
});

test("a generic unsupported control terminal cannot self-promote to a typed surface", () => {
  const candidate = v03Candidate();
  candidate.negativeControls[0] = {
    id: "worker",
    expectedSurface: "worker",
    success: false,
    error: { name: "StasisStateError", code: "unsupported_profile_method" },
  };

  const result = compareDeterministicV03(v03Baseline(), candidate);
  const worker = result.negativeControls[0];
  assert.equal(worker.classification, "PROFILE_UNSUPPORTED");
  assert.equal(worker.diagnosisConfidence, "unconfirmed_designed_control");
  assert.equal(Object.hasOwn(worker, "surface"), false);
  assert.deepEqual(worker.terminal, {
    kind: "error",
    code: "unsupported_profile_method",
  });
});

test("negative-control runtime_error remains ENGINE_BUG with zero primary prevalence weight", () => {
  const candidate = v03Candidate();
  const page = candidate.negativeControls[0].result.pages[0];
  page.status = "settlement_not_crawlable";
  page.settleOutcome = "runtime_error";
  page.links = [];

  const result = compareDeterministicV03(v03Baseline(), candidate);
  const worker = result.negativeControls[0];
  assert.equal(result.candidateValid, true);
  assert.deepEqual(result.counts, { PASS_EQUIVALENT: 20 });
  assert.deepEqual(
    {
      classification: worker.classification,
      surface: worker.surface,
      diagnosisConfidence: worker.diagnosisConfidence,
      settleOutcome: worker.settleOutcome,
      terminal: worker.terminal,
    },
    {
      classification: "ENGINE_BUG",
      surface: "engine_correctness",
      diagnosisConfidence: "typed",
      settleOutcome: "runtime_error",
      terminal: { kind: "settlement", outcome: "runtime_error" },
    },
  );
});

test("negative-control limits retain all six exact execution-limit kinds with zero prevalence weight", () => {
  const limits = new Map([
    ["virtual_time_limit_exceeded", "virtual_time"],
    ["control_turn_limit_exceeded", "control_turns"],
    ["task_limit_exceeded", "ordinary_tasks"],
    ["microtask_limit_exceeded", "microtasks"],
    ["rendering_limit_exceeded", "rendering_opportunities"],
    ["mutation_limit_exceeded", "mutations"],
  ]);

  for (const [outcome, limitKind] of limits) {
    const candidate = v03Candidate();
    const page = candidate.negativeControls[0].result.pages[0];
    page.status = "settlement_not_crawlable";
    page.settleOutcome = outcome;
    page.links = [];

    const result = compareDeterministicV03(v03Baseline(), candidate);
    const worker = result.negativeControls[0];
    assert.equal(result.candidateValid, true, outcome);
    assert.deepEqual(result.counts, { PASS_EQUIVALENT: 20 }, outcome);
    assert.deepEqual(
      {
        classification: worker.classification,
        surface: worker.surface,
        diagnosisConfidence: worker.diagnosisConfidence,
        settleOutcome: worker.settleOutcome,
        limitKind: worker.limitKind,
        terminal: worker.terminal,
      },
      {
        classification: "PROFILE_UNSUPPORTED",
        surface: "execution_limit",
        diagnosisConfidence: "typed",
        settleOutcome: outcome,
        limitKind,
        terminal: { kind: "settlement", outcome },
      },
      outcome,
    );
  }
});

test("pool close failure overrides success with bounded fail-stop evidence", async () => {
  const secret = "private pool close diagnostic";
  const sdk = {
    createStasisSessionPool() {
      return {
        async close() {
          throw new Error(secret);
        },
      };
    },
    async crawlWithStasis() {
      return { pages: [], scheduledUrls: [] };
    },
  };

  const result = await runStasisV03Case({
    sdk,
    start: "http://stasis-compat.test/",
    pageLimit: 1,
    depthLimit: 0,
    executablePath: "C:\\candidate\\stasis.exe",
  });
  assert.equal(result.success, false);
  assert.equal(result.error.code, "internal_runtime_failure");
  assert.equal(result.error.stateEffect, "indeterminate");
  assert.deepEqual(result.cleanup.status, "failed");
  assert.equal(result.cleanup.phase, "pool_close");
  assert.deepEqual(result.priorTerminal, { success: true });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("performance callers can disable the asymmetric inner wall clock", async () => {
  const events = [];
  const sdk = {
    createStasisSessionPool() {
      return {
        async close() {
          events.push("close");
        },
      };
    },
    async crawlWithStasis() {
      events.push("crawl");
      return { pages: [], scheduledUrls: [] };
    },
  };

  const result = await runStasisV03Case({
    sdk,
    start: "http://stasis-compat.test/",
    pageLimit: 1,
    depthLimit: 0,
    executablePath: "/verified/stasis",
    recordWallTime: false,
  });

  assert.deepEqual(events, ["crawl", "close"]);
  assert.equal(result.success, true);
  assert.equal(result.cleanup.status, "passed");
  assert.equal(Object.hasOwn(result, "wallTimeMs"), false);
});
