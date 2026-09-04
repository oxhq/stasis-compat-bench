import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostSupportCandidateSpec,
  postSupportProfile,
  postSupportRevision,
} from "../src/post-support/candidate-identity.mjs";
import { runPostSupportWildObservation } from "../src/post-support/wild-observation.mjs";
import { replayPostSupportWildEvidenceClaims } from "../src/post-support/wild-result-verifier.mjs";
import { assertWildArtifactPrivacy } from "../src/wild/artifact-privacy.mjs";
import {
  currentUrlWildArtifactSchemas,
  writeWildSummaryAndIndex,
} from "../src/wild/artifacts.mjs";
import { classifyWildCase } from "../src/wild/classification.mjs";
import { protocol } from "../src/wild/config.mjs";
import {
  normalizeLinkIdentitySet,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "../src/wild/normalize.mjs";
import {
  currentUrlWildPairedRules,
  wildPairedRules,
} from "../src/wild/result-verifier.mjs";

const entry = Object.freeze({
  slot: 1,
  rank: 1,
  stratumId: "rank-1-1000",
  requestedUrl: "https://site-1.example/",
});
const allowedGate = Object.freeze({ status: "allowed", code: "eligible" });
const openUrl = "https://site-1.example/open?phase=initial#open";
const settledUrl = "https://site-1.example/final?phase=settled#terminal";
const alternateSettledUrl = "https://site-1.example/final?phase=other#terminal";
const settleOutcomes = Object.freeze([
  "quiescent",
  "quiescent_with_persistent_work",
  "blocked_on_external_io",
  "blocked_on_open_ended_work",
  "unsupported_work",
  "virtual_time_limit_exceeded",
  "task_limit_exceeded",
  "microtask_limit_exceeded",
  "rendering_limit_exceeded",
  "mutation_limit_exceeded",
  "control_turn_limit_exceeded",
  "runtime_error",
]);

test("owner-attested settle URL is retained for every returned outcome without rereading Session.url", async () => {
  for (const outcome of settleOutcomes) {
    const fixture = observationFixture({ outcome });
    const observation = await runPostSupportWildObservation(entry, fixture.candidate, {
      timeoutSignal: () => new AbortController().signal,
    });

    assert.equal(fixture.sessionUrlReads(), 1, outcome);
    assert.equal(
      observation.status,
      ["quiescent", "quiescent_with_persistent_work"].includes(outcome)
        ? "success"
        : "settlement_terminal",
      outcome,
    );
    assert.equal(observation.settlement.outcome, outcome);
    assert.equal(observation.openCommittedUrlIdentity, publicHttpUrlIdentity(openUrl));
    assert.equal(observation.currentUrlObservable, true);
    assert.equal(observation.currentUrlIdentity, publicHttpUrlIdentity(settledUrl));
    assert.notEqual(observation.currentUrlIdentity, observation.openCommittedUrlIdentity);
    assert.equal(
      observation.currentUrlIdentity,
      publicHttpUrlIdentity("https://site-1.example/final?phase=settled"),
      "the evidence identity intentionally excludes URL fragments",
    );
  }
});

test("the returned-settlement boundary distinguishes failures before and after current-URL authority", async () => {
  const before = observationFixture({ failAt: "settle" });
  const beforeObservation = await runPostSupportWildObservation(entry, before.candidate, {
    timeoutSignal: () => new AbortController().signal,
  });
  assert.equal(beforeObservation.status, "error");
  assert.equal(beforeObservation.currentUrlObservable, false);
  assert.equal(Object.hasOwn(beforeObservation, "currentUrlIdentity"), false);
  assert.equal(beforeObservation.openCommittedUrlIdentity, publicHttpUrlIdentity(openUrl));
  assert.equal(before.sessionUrlReads(), 1);

  const after = observationFixture({ failAt: "requests" });
  const afterObservation = await runPostSupportWildObservation(entry, after.candidate, {
    timeoutSignal: () => new AbortController().signal,
  });
  assert.equal(afterObservation.status, "error");
  assert.equal(afterObservation.currentUrlObservable, true);
  assert.equal(afterObservation.currentUrlIdentity, publicHttpUrlIdentity(settledUrl));
  assert.equal(afterObservation.openCommittedUrlIdentity, publicHttpUrlIdentity(openUrl));
  assert.equal(after.sessionUrlReads(), 1);

  const beforeOpen = verifiedCandidate(async () => {
    throw typedFailure("runtime_close_failed");
  });
  const beforeOpenObservation = await runPostSupportWildObservation(entry, beforeOpen, {
    timeoutSignal: () => new AbortController().signal,
  });
  assert.equal(beforeOpenObservation.status, "error");
  assert.equal(Object.hasOwn(beforeOpenObservation, "openCommittedUrlIdentity"), false);
  assert.equal(Object.hasOwn(beforeOpenObservation, "currentUrlObservable"), false);
  assert.equal(Object.hasOwn(beforeOpenObservation, "currentUrlIdentity"), false);
});

test("malformed or non-public settled URLs fail closed without fabricating observability", async () => {
  for (const malformedUrl of [
    undefined,
    "not a URL",
    "ftp://site-1.example/final",
    "https://user:secret@site-1.example/final",
  ]) {
    const fixture = observationFixture({ settledUrl: malformedUrl });
    const observation = await runPostSupportWildObservation(entry, fixture.candidate, {
      timeoutSignal: () => new AbortController().signal,
    });
    assert.equal(observation.status, "error");
    assert.equal(observation.currentUrlObservable, false);
    assert.equal(Object.hasOwn(observation, "currentUrlIdentity"), false);
    assert.equal(observation.openCommittedUrlIdentity, publicHttpUrlIdentity(openUrl));
    assert.equal(fixture.sessionUrlReads(), 1);
  }
});

test("extraction and current-URL equivalence form an exact four-case correctness matrix", () => {
  const baseline = successfulBaseline();
  const equivalentExtraction = baseline.extraction;
  const divergentExtraction = {
    titleIdentity: normalizeTitleIdentity("Different"),
    linkIdentities: normalizeLinkIdentitySet(["https://site-1.example/different"]),
  };
  const cases = [
    {
      extraction: equivalentExtraction,
      currentUrlIdentity: baseline.finalUrlIdentity,
      primary: "PASS_EQUIVALENT",
      reason: "equivalent",
      extractionOutcome: "equivalent",
      currentUrlOutcome: "equivalent",
    },
    {
      extraction: divergentExtraction,
      currentUrlIdentity: baseline.finalUrlIdentity,
      primary: "PASS_WITH_SEMANTIC_DIFFERENCE",
      reason: "extraction_divergent",
      extractionOutcome: "divergent",
      currentUrlOutcome: "equivalent",
    },
    {
      extraction: equivalentExtraction,
      currentUrlIdentity: publicHttpUrlIdentity(alternateSettledUrl),
      primary: "PASS_WITH_SEMANTIC_DIFFERENCE",
      reason: "current_url_divergent",
      extractionOutcome: "equivalent",
      currentUrlOutcome: "divergent",
    },
    {
      extraction: divergentExtraction,
      currentUrlIdentity: publicHttpUrlIdentity(alternateSettledUrl),
      primary: "PASS_WITH_SEMANTIC_DIFFERENCE",
      reason: "extraction_and_current_url_divergent",
      extractionOutcome: "divergent",
      currentUrlOutcome: "divergent",
    },
  ];

  for (const expected of cases) {
    const classification = classifyWildCase({
      entry,
      baselineGate: allowedGate,
      baseline,
      stasisGate: allowedGate,
      stasis: successfulStasis(expected.extraction, expected.currentUrlIdentity),
    });
    assert.equal(classification.primary, expected.primary);
    assert.equal(classification.reason, expected.reason);
    assert.deepEqual(classification.sdkGaps, []);
    assert.equal(classification.extraction.outcome, expected.extractionOutcome);
    assert.equal(classification.currentUrl.outcome, expected.currentUrlOutcome);
  }
});

test("contradictory current-URL projections and raw current URLs cannot false-green", () => {
  const baseline = successfulBaseline();
  for (const projection of [
    { currentUrlObservable: true },
    { currentUrlObservable: true, currentUrlIdentity: "not-a-digest" },
    { currentUrlObservable: false, currentUrlIdentity: baseline.finalUrlIdentity },
    { currentUrlObservable: "yes", currentUrlIdentity: baseline.finalUrlIdentity },
  ]) {
    const stasis = successfulStasis(baseline.extraction, baseline.finalUrlIdentity);
    delete stasis.currentUrlObservable;
    delete stasis.currentUrlIdentity;
    Object.assign(stasis, projection);
    const classification = classifyWildCase({
      entry,
      baselineGate: allowedGate,
      baseline,
      stasisGate: allowedGate,
      stasis,
    });
    assert.equal(classification.primary, "BENCHMARK_INVALID");
    assert.equal(classification.reason, "invalid_success_evidence");
  }

  assert.throws(
    () => assertWildArtifactPrivacy({ observation: { currentUrl: settledUrl } }),
    /sensitive key|raw URL/u,
  );
  assert.doesNotThrow(() => assertWildArtifactPrivacy({
    observation: {
      currentUrlObservable: true,
      currentUrlIdentity: publicHttpUrlIdentity(settledUrl),
    },
    classification: { currentUrl: { outcome: "equivalent" } },
  }));
});

test("artifact writers and replay reject mixed v4/v5 schema families", async () => {
  await assert.rejects(
    writeWildSummaryAndIndex({
      schemas: {
        ...currentUrlWildArtifactSchemas,
        index: "stasis-wild-artifact-index-v4",
      },
    }),
    /supported immutable schema set/u,
  );

  assert.throws(
    () => replayPostSupportWildEvidenceClaims({
      index: replayIndex("stasis-wild-artifact-index-v5", wildPairedRules),
    }),
    /rules differ from v5/u,
  );
  assert.throws(
    () => replayPostSupportWildEvidenceClaims({
      index: replayIndex("stasis-wild-artifact-index-v4", currentUrlWildPairedRules),
    }),
    /rules differ from v4/u,
  );
});

function observationFixture(options = {}) {
  const outcome = options.outcome ?? "quiescent";
  const failAt = options.failAt;
  const returnedUrl = Object.hasOwn(options, "settledUrl")
    ? options.settledUrl
    : settledUrl;
  let urlReads = 0;
  let extractionCalls = 0;
  const session = {
    get url() {
      urlReads += 1;
      if (urlReads !== 1) throw new Error("Session.url was reread after open");
      return openUrl;
    },
    stateToken: "open-document-authority",
    async settle() {
      if (failAt === "settle") throw typedFailure("unsupported_work");
      return settleResult(outcome, returnedUrl);
    },
    async requests() {
      if (failAt === "requests") throw typedFailure("runtime_error");
      return { complete: true, hasMore: false, records: [{ method: "GET" }] };
    },
    async evidence() {
      return { complete: true, hasMore: false, records: [{ kind: "response_headers" }] };
    },
    async extract() {
      extractionCalls += 1;
      return extractionCalls === 1
        ? {
            stateToken: "title-authority",
            rows: [{ fields: [{ name: "title", value: "Example" }] }],
          }
        : {
            stateToken: "link-authority",
            rows: [{ fields: [{ name: "href", value: "https://site-1.example/next" }] }],
          };
    },
    async close() {},
  };
  const runtime = {
    async openSession() { return session; },
    async close() {},
  };
  return {
    candidate: verifiedCandidate(async () => runtime),
    sessionUrlReads: () => urlReads,
  };
}

function settleResult(outcome, url) {
  const limitKinds = {
    virtual_time_limit_exceeded: "virtual_time",
    task_limit_exceeded: "ordinary_tasks",
    microtask_limit_exceeded: "microtasks",
    rendering_limit_exceeded: "rendering_opportunities",
    mutation_limit_exceeded: "mutations",
    control_turn_limit_exceeded: "control_turns",
  };
  return {
    outcome,
    url,
    stateToken: "settled-document-authority",
    unsupportedWork: [],
    persistentWork: [],
    externalIo: [],
    processed: {
      controlTurns: 1n,
      tasks: 1n,
      microtasks: 0n,
      renderingOpportunities: 1n,
      mutations: 0n,
    },
    ...(["unsupported_work", "runtime_error"].includes(outcome)
      ? { failure: { code: outcome } }
      : {}),
    ...(Object.hasOwn(limitKinds, outcome)
      ? { limit: { kind: limitKinds[outcome] } }
      : {}),
  };
}

function successfulBaseline() {
  return {
    status: "success",
    code: "eligible",
    requestedUrl: entry.requestedUrl,
    finalUrlIdentity: publicHttpUrlIdentity(settledUrl),
    responseStatus: 200,
    contentType: "text/html",
    extraction: {
      titleIdentity: normalizeTitleIdentity("Example"),
      linkIdentities: normalizeLinkIdentitySet(["https://site-1.example/next"]),
    },
    wallTimeMs: 1,
  };
}

function successfulStasis(extraction, currentUrlIdentity) {
  return {
    status: "success",
    openCommittedUrlIdentity: publicHttpUrlIdentity(openUrl),
    currentUrlObservable: true,
    currentUrlIdentity,
    settlement: { outcome: "quiescent" },
    extraction,
  };
}

function verifiedCandidate(launch) {
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
    sdk: { launch, CONTROLLED_WEB_SESSION_V2_PROFILE: postSupportProfile },
  };
}

function typedFailure(code) {
  return Object.assign(new Error("omitted diagnostic"), {
    name: "StasisProtocolError",
    code,
  });
}

function replayIndex(schema, rules) {
  return {
    schema,
    protocol,
    identity: {},
    rules,
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:01.000Z",
    selectedCount: 100,
    summary: { path: "wild/summary.json", sha256: "a".repeat(64) },
    cases: Array.from({ length: 100 }, () => ({})),
  };
}
