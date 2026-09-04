import assert from "node:assert/strict";
import test from "node:test";

import { finalReportMarkdown } from "../src/final-report.mjs";

function retainedProof(overrides = {}) {
  return {
    manifest: {
      harness: { revision: "harness-revision" },
      stasis: { sourceTree: "source-tree", executableSha256: "exe-sha", archiveSha256: "zip-sha" },
      rwa: { revision: "rwa-revision", buildTree: { sha256: "build-sha" } },
      environment: { node: "v22.20.0", npm: "10.9.3" },
    },
    crawl: {
      baselineValid: true,
      candidateValid: true,
      primaryDenominator: 20,
      exactEquivalentRate: 1,
      behaviorallySupportedRate: 1,
      scheduledUrlJaccard: 1,
      counts: { PASS_EQUIVALENT: 20 },
      negativeControls: [
        { id: "worker", classification: "PROFILE_UNSUPPORTED", expectedSurface: "worker" },
        { id: "iframe", classification: "PROFILE_UNSUPPORTED", expectedSurface: "iframe" },
      ],
    },
    rwa: {
      baselineValid: true,
      candidateValid: true,
      denominator: 8,
      exactEquivalentRate: 0,
      behaviorallySupportedRate: 0,
      counts: { ENGINE_BUG: 8 },
      sharedBlocker: {
        classification: "ENGINE_BUG",
        typedSurface: "navigation_authority",
        code: "navigation_authority_changed",
        phase: "openSession",
        affectedCases: [1, 2, 3, 4, 5, 6, 7, 8],
      },
    },
    postflight: {
      rwa: {
        clean: true,
        serversStopped: true,
        revisionMatchesManifest: true,
        revisionMatchesFrozen: true,
        treeMatchesManifest: true,
        treeMatchesFrozen: true,
        buildTreeMatchesManifest: true,
        buildTreeMatchesFrozen: true,
      },
      harness: { trackedClean: true },
      stasis: {
        sourceTreeMatchesManifest: true,
        sourceTreeMatchesFrozen: true,
        executableSha256MatchesManifest: true,
        executableSha256MatchesFrozen: true,
      },
    },
    ...overrides,
  };
}

test("the consolidated report derives the observed crawl and RWA verdicts", () => {
  const report = finalReportMarkdown(retainedProof());
  assert.match(report, /exactly outcome-equivalent on the crawl track \(20\/20 pages\)/u);
  assert.match(report, /not behaviorally equivalent on the RWA authentication track/u);
  assert.match(report, /PASS_EQUIVALENT: 20/u);
  assert.match(report, /ENGINE_BUG: 8/u);
  assert.match(report, /`worker`: PROFILE_UNSUPPORTED/u);
  assert.match(report, /navigation_authority_changed/u);
  assert.match(report, /no performance claim/u);
  assert.doesNotMatch(report, /undefined/u);
});

test("the consolidated verdict, blocker, counts, and controls change with alternate inputs", () => {
  const base = retainedProof();
  const report = finalReportMarkdown({
    ...base,
    crawl: {
      ...base.crawl,
      exactEquivalentRate: 0.5,
      behaviorallySupportedRate: 1,
      scheduledUrlJaccard: 0.75,
      counts: { PASS_EQUIVALENT: 10, PASS_WITH_SEMANTIC_DIFFERENCE: 10 },
      negativeControls: [
        { id: "worker", classification: "PASS_EQUIVALENT", expectedSurface: "worker" },
      ],
    },
    rwa: {
      ...base.rwa,
      exactEquivalentRate: 1,
      behaviorallySupportedRate: 1,
      counts: { PASS_EQUIVALENT: 8 },
      sharedBlocker: null,
    },
  });

  assert.match(report, /behaviorally supported on the crawl track \(20\/20 pages\), with 10\/20 exactly equivalent/u);
  assert.match(report, /exactly outcome-equivalent on the RWA authentication track \(8\/8 cases\)/u);
  assert.match(report, /PASS_WITH_SEMANTIC_DIFFERENCE: 10/u);
  assert.match(report, /`worker`: PASS_EQUIVALENT/u);
  assert.match(report, /No candidate-wide RWA blocker was detected/u);
  assert.doesNotMatch(report, /ENGINE_BUG: 8/u);
  assert.doesNotMatch(report, /navigation_authority_changed/u);
  assert.doesNotMatch(report, /`iframe`/u);
});
