import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateWildClassifications,
  classifyWildCase,
} from "../src/wild/classification.mjs";
import { serializeWildArtifact } from "../src/wild/artifact-privacy.mjs";
import {
  normalizeLinkIdentitySet,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "../src/wild/normalize.mjs";

const entry = { slot: 1, rank: 1, stratumId: "rank-1-1000", requestedUrl: "https://example.com/" };
const allowed = { status: "allowed", code: "eligible" };
const baseline = {
  status: "success",
  code: "eligible",
  requestedUrl: entry.requestedUrl,
  finalUrlIdentity: publicHttpUrlIdentity("https://example.com/"),
  responseStatus: 200,
  contentType: "text/html",
  extraction: {
    titleIdentity: normalizeTitleIdentity("Example"),
    linkIdentities: normalizeLinkIdentitySet(["https://example.com/a"]),
  },
  wallTimeMs: 1,
};

test("baseline failures are excluded from organic blocker prevalence", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline: { status: "failure", code: "navigation_timeout" },
    stasisGate: { status: "not_run" },
    stasis: { status: "not_run" },
  });
  assert.equal(classification.primary, "BASELINE_FAILURE");
  assert.equal(classification.eligibleForOrganicBlockerCensus, false);
  assert.equal(classification.blockerFamily, null);
});

test("successful extraction retains a separate current-URL SDK gap", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "success",
      openCommittedUrlIdentity: publicHttpUrlIdentity("https://example.com/"),
      currentUrlObservable: false,
      settlement: { outcome: "quiescent" },
      extraction: baseline.extraction,
    },
  });
  assert.equal(classification.primary, "SDK_GAP");
  assert.deepEqual(classification.sdkGaps, ["current_url_observability"]);
  assert.equal(classification.extraction.outcome, "equivalent");
  assert.equal(
    classification.openCommittedUrlIdentityMatchesBaselineFinalUrlIdentity,
    true,
  );
  assert.equal(classification.eligibleForOrganicBlockerCensus, false);
});

test("owner-attested settlement URL closes the SDK gap and gates exact correctness", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "success",
      openCommittedUrlIdentity: publicHttpUrlIdentity("https://example.com/open"),
      currentUrlObservable: true,
      currentUrlIdentity: baseline.finalUrlIdentity,
      settlement: { outcome: "quiescent" },
      extraction: baseline.extraction,
    },
  });
  assert.equal(classification.primary, "PASS_EQUIVALENT");
  assert.deepEqual(classification.sdkGaps, []);
  assert.deepEqual(classification.currentUrl, { outcome: "equivalent" });
  assert.equal(classification.openCommittedUrlIdentityMatchesBaselineFinalUrlIdentity, false);
});

test("a current-URL mismatch is a semantic difference even when extraction is equivalent", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "success",
      openCommittedUrlIdentity: baseline.finalUrlIdentity,
      currentUrlObservable: true,
      currentUrlIdentity: publicHttpUrlIdentity("https://example.com/other"),
      settlement: { outcome: "quiescent" },
      extraction: baseline.extraction,
    },
  });
  assert.equal(classification.primary, "PASS_WITH_SEMANTIC_DIFFERENCE");
  assert.equal(classification.reason, "current_url_divergent");
  assert.equal(classification.extraction.outcome, "equivalent");
  assert.deepEqual(classification.currentUrl, { outcome: "divergent" });
});

test("query-distinct URL commitments remain divergent instead of collapsing", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline: {
      ...baseline,
      finalUrlIdentity: publicHttpUrlIdentity("https://example.com/final?state=one"),
      extraction: {
        titleIdentity: normalizeTitleIdentity("Same"),
        linkIdentities: normalizeLinkIdentitySet(["https://example.com/account?user=alice"]),
      },
    },
    stasisGate: allowed,
    stasis: {
      status: "success",
      openCommittedUrlIdentity: publicHttpUrlIdentity("https://example.com/final?state=two"),
      currentUrlObservable: false,
      settlement: { outcome: "quiescent" },
      extraction: {
        titleIdentity: normalizeTitleIdentity("Same"),
        linkIdentities: normalizeLinkIdentitySet(["https://example.com/account?user=bob"]),
      },
    },
  });
  assert.equal(classification.extraction.outcome, "divergent");
  assert.equal(classification.extraction.linksEqual, false);
  assert.equal(classification.extraction.linkJaccard, 0);
  assert.equal(
    classification.openCommittedUrlIdentityMatchesBaselineFinalUrlIdentity,
    false,
  );
});

test("malformed Stasis success identity evidence can never false-green", () => {
  for (const stasis of [
    {},
    {
      openCommittedUrlIdentity: "not-a-digest",
      currentUrlObservable: false,
      extraction: baseline.extraction,
    },
    {
      openCommittedUrlIdentity: baseline.finalUrlIdentity,
      currentUrlObservable: false,
      extraction: {
        ...baseline.extraction,
        linkIdentities: ["b".repeat(64), "a".repeat(64)],
      },
    },
    {
      openCommittedUrlIdentity: baseline.finalUrlIdentity,
      currentUrlObservable: true,
      extraction: baseline.extraction,
    },
  ]) {
    const classification = classifyWildCase({
      entry,
      baselineGate: allowed,
      baseline,
      stasisGate: allowed,
      stasis: { status: "success", ...stasis },
    });
    assert.equal(classification.primary, "BENCHMARK_INVALID");
    assert.equal(classification.reason, "invalid_success_evidence");
    assert.equal(classification.extraction, null);
  }
});

test("baseline success evidence is exact and precedes typed Stasis classification", () => {
  const mutations = [
    ["missing code", (value) => delete value.code],
    ["unexpected key", (value) => { value.unexpected = true; }],
    ["wrong code", (value) => { value.code = "observed"; }],
    ["wrong requested URL", (value) => { value.requestedUrl = "https://other.example/"; }],
    ["invalid final URL identity", (value) => { value.finalUrlIdentity = "not-a-digest"; }],
    ["status below 200", (value) => { value.responseStatus = 199; }],
    ["status above 399", (value) => { value.responseStatus = 400; }],
    ["non-integer status", (value) => { value.responseStatus = 200.5; }],
    ["non-HTML content type", (value) => { value.contentType = "application/json"; }],
    ["content type parameters", (value) => { value.contentType = "text/html; charset=utf-8"; }],
    ["missing extraction", (value) => delete value.extraction],
    ["extra extraction key", (value) => { value.extraction.extra = true; }],
    ["invalid title identity", (value) => { value.extraction.titleIdentity.sha256 = "bad"; }],
    ["unsorted links", (value) => {
      value.extraction.linkIdentities = ["b".repeat(64), "a".repeat(64)];
    }],
    ["duplicate links", (value) => {
      value.extraction.linkIdentities = ["a".repeat(64), "a".repeat(64)];
    }],
    ["negative wall time", (value) => { value.wallTimeMs = -1; }],
    ["non-finite wall time", (value) => { value.wallTimeMs = Number.NaN; }],
  ];

  for (const [label, mutate] of mutations) {
    const malformedBaseline = structuredClone(baseline);
    mutate(malformedBaseline);
    const classification = classifyWildCase({
      entry,
      baselineGate: allowed,
      baseline: malformedBaseline,
      stasisGate: allowed,
      stasis: {
        status: "settlement_terminal",
        settlement: {
          outcome: "unsupported_work",
          unsupportedWork: [{ kind: "other", count: "1", reason: "worker" }],
        },
      },
    });
    assert.equal(classification.primary, "BENCHMARK_INVALID", label);
    assert.equal(classification.reason, "invalid_baseline_success_evidence", label);
    assert.equal(classification.eligibleForOrganicBlockerCensus, false, label);
    assert.equal(classification.blockerFamily, null, label);
    assert.equal(classification.extraction, null, label);
  }
});

test("first typed unsupported terminal determines the organic root family", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "settlement_terminal",
      settlement: {
        outcome: "unsupported_work",
        failureCode: "unsupported_source",
        unsupportedWork: [
          { kind: "other", count: "1", reason: "cross_event_loop_document" },
          { kind: "other", count: "1", reason: "worker" },
        ],
      },
    },
  });
  assert.equal(classification.primary, "PROFILE_UNSUPPORTED");
  assert.equal(classification.blockerFamily, "browsing_context_tree");
  assert.equal(classification.eligibleForOrganicBlockerCensus, true);
  assert.equal(
    classification.firstTerminal.unsupportedWork.reason,
    "cross_event_loop_document",
  );
  assert.equal(classification.exposure, "organic_primary");
  assert.equal(classification.diagnosisConfidence, "source_diagnosed");
  assert.equal(classification.censoredAfterFirstTerminal, true);
  assert.match(classification.rootClusterId, /browsing_context_tree/u);
  assert.equal(classification.firstTerminal.phase, "settlement");
  assert.equal(classification.firstTerminal.code, "unsupported_source");
  assert.equal(classification.firstTerminal.typedSurface, "other");
});

test("runtime failures remain engine bugs and do not inherit later source guesses", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "settlement_terminal",
      settlement: { outcome: "runtime_error", failureCode: "runtime_terminals" },
    },
  });
  assert.equal(classification.primary, "ENGINE_BUG");
  assert.equal(classification.blockerFamily, "engine_correctness");
});

test("generic navigation authority errors stay unconfirmed and out of blocker prevalence", () => {
  for (const code of ["navigation_authority_changed", "session_navigation_authority_unavailable"]) {
    const classification = classifyWildCase({
      entry,
      baselineGate: allowed,
      baseline,
      stasisGate: allowed,
      stasis: {
        status: "error",
        error: { name: "StasisStateError", code },
      },
    });
    assert.equal(classification.primary, "PROFILE_UNSUPPORTED");
    assert.equal(classification.blockerFamily, "navigation_unknown");
    assert.equal(classification.diagnosisConfidence, "unknown");
    assert.equal(classification.eligibleForOrganicBlockerCensus, false);
    assert.notEqual(classification.blockerFamily, "browsing_context_tree");
  }
});

test("generic navigation authority unsupported work is not promoted to context tree", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "settlement_terminal",
      settlement: {
        outcome: "unsupported_work",
        unsupportedWork: [{ kind: "other", count: "1", reason: "navigation_authority_changed" }],
      },
    },
  });
  assert.equal(classification.blockerFamily, "navigation_unknown");
  assert.notEqual(classification.blockerFamily, "browsing_context_tree");
});

test("only explicit UnsupportedReason or TimeSurface values establish tree provenance", () => {
  const typed = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "settlement_terminal",
      settlement: {
        outcome: "unsupported_work",
        unsupportedWork: [{
          kind: "other",
          count: "1",
          reason: "unsupported_time_surface",
          timeSurface: "same_event_loop_iframe",
        }],
      },
    },
  });
  assert.equal(typed.blockerFamily, "browsing_context_tree");
  assert.equal(typed.firstTerminal.typedSurface, "same_event_loop_iframe");

  const broad = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "settlement_terminal",
      settlement: {
        outcome: "unsupported_work",
        unsupportedWork: [{ kind: "other", count: "1", reason: "document" }],
      },
    },
  });
  assert.equal(broad.blockerFamily, "unknown");
  assert.equal(broad.eligibleForOrganicBlockerCensus, false);
  assert.notEqual(broad.blockerFamily, "browsing_context_tree");
});

test("broad rendering failure remains rendering_unknown", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "error",
      error: { name: "StasisStateError", code: "unsupported_rendering" },
    },
  });
  assert.equal(classification.blockerFamily, "rendering_unknown");
});

test("unknown Stasis errors cannot become engine bugs by default", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "error",
      error: { name: "StasisObservationError", code: "unclassified" },
    },
  });
  assert.equal(classification.primary, "BENCHMARK_INVALID");
  assert.equal(classification.eligibleForOrganicBlockerCensus, false);
  assert.equal(classification.diagnosisConfidence, "unknown");
  assert.equal(classification.blockerFamily, null);
});

test("a known unsupported profile error survives without invented source attribution", () => {
  const classification = classifyWildCase({
    entry,
    baselineGate: allowed,
    baseline,
    stasisGate: allowed,
    stasis: {
      status: "error",
      error: { name: "StasisStateError", code: "unsupported_profile_method" },
    },
  });
  assert.equal(classification.primary, "PROFILE_UNSUPPORTED");
  assert.equal(classification.reason, "unsupported_profile_method");
  assert.equal(classification.blockerFamily, "unknown");
  assert.equal(classification.eligibleForOrganicBlockerCensus, false);
});

test("cookie task-source clusters serialize as sorted v4 records, never dynamic keys", () => {
  const cases = [
    "unsupported_persistent_cookie",
    "unsupported_cookie_same_site_context",
  ].map((code, index) => {
    const caseEntry = {
      ...entry,
      slot: index + 1,
      rank: index + 1,
      requestedUrl: `https://example${index + 1}.com/`,
    };
    return {
      entry: caseEntry,
      classification: classifyWildCase({
        entry: caseEntry,
        baselineGate: allowed,
        baseline: {
          ...baseline,
          requestedUrl: caseEntry.requestedUrl,
          finalUrlIdentity: publicHttpUrlIdentity(caseEntry.requestedUrl),
        },
        stasisGate: allowed,
        stasis: {
          status: "error",
          error: { name: "StasisProtocolError", code },
        },
      }),
      stasis: { status: "error" },
    };
  });
  const summary = aggregateWildClassifications(cases);
  assert.equal(Array.isArray(summary.organicRootClusters), true);
  assert.equal(summary.organicRootClusters.length, 2);
  assert.deepEqual(
    summary.organicRootClusters.map((cluster) => cluster.rootClusterId),
    [...summary.organicRootClusters]
      .map((cluster) => cluster.rootClusterId)
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
  );
  assert.doesNotThrow(() => serializeWildArtifact({ summary }));
});

test("summary keeps SDK gaps and organic blockers in separate ledgers", () => {
  const cases = [
    { entry, classification: classifyWildCase({
      entry,
      baselineGate: allowed,
      baseline,
      stasisGate: allowed,
      stasis: {
        status: "success",
        openCommittedUrlIdentity: baseline.finalUrlIdentity,
        currentUrlObservable: false,
        settlement: { outcome: "quiescent" },
        extraction: baseline.extraction,
      },
    }), stasis: { status: "success" } },
    { entry, classification: classifyWildCase({
      entry,
      baselineGate: allowed,
      baseline,
      stasisGate: allowed,
      stasis: {
        status: "settlement_terminal",
        settlement: {
          outcome: "unsupported_work",
          unsupportedWork: [{ kind: "other", count: "1", reason: "worker" }],
        },
      },
    }), stasis: { status: "settlement_terminal" } },
  ];
  const summary = aggregateWildClassifications(cases);
  assert.equal(summary.sdkGapCounts.current_url_observability, 1);
  assert.equal(Object.hasOwn(summary, "currentUrlCounts"), false);
  assert.equal(summary.organicBlockerDenominator, 1);
  assert.equal(summary.diagnosedOrganicBlockerCount, 1);
  assert.equal(summary.validPairedDenominator, 2);
  assert.equal(summary.organicBlockerCounts.worker, 1);
  assert.equal(summary.organicIndependentOriginCounts.worker, 1);
  assert.equal(summary.organicManifestationsByStratum[entry.stratumId].worker, 1);
  assert.equal(Array.isArray(summary.organicRootClusters), true);
  assert.equal(summary.organicRootClusters[0].manifestations, 1);
  assert.equal(summary.organicRootClusters[0].independentOriginCount, 1);
  assert.equal(summary.organicRootClusters[0].rootClusterId, cases.at(-1).classification.rootClusterId);
});
