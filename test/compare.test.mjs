import assert from "node:assert/strict";
import test from "node:test";

import { compareCrawl } from "../src/crawl/compare-lib.mjs";
import { expectedPrimaryScheduledUrls, negativeControls } from "../src/crawl/corpus.mjs";

function page(url, lane) {
  const index = expectedPrimaryScheduledUrls.indexOf(url);
  const depth = index < 1 ? 0 : index <= 10 ? 1 : 2;
  return {
    requestedUrl: url,
    url,
    depth,
    status: "crawled",
    ...(lane === "candidate" ? { settleOutcome: "quiescent" } : {}),
    links: [],
  };
}

function exactRaw(lane) {
  return {
    ...(lane === "baseline" ? baselineEnvelope() : candidateEnvelope()),
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
      result: { scheduledUrls: [control.start], pages: [page(control.start, lane)] },
    })),
  };
}

function baselineEnvelope() {
  return {
    schema: "stasis-compat-crawl-playwright-raw-v1",
    protocol: "stasis-compat-bench-v1",
    track: "crawling",
    runner: "crawlee-playwright",
    versions: {
      node: "v22.20.0",
      crawlee: "3.18.1",
      playwright: "1.62.1",
      chromiumRevisionDirectory: "chromium-1234",
      chromiumVersion: "151.0.7922.34",
      chromiumExecutableSha256: "409805a16d6416087e6b2f778df1cf8f7bbb267d6b99f6b5bb0a618eace234f2",
    },
    rules: {
      concurrency: 1,
      maxRequestRetries: 0,
      maxPages: 20,
      maxDepth: 2,
      persistStorage: false,
      useSessionPool: false,
    },
  };
}

function candidateEnvelope() {
  return {
    schema: "stasis-compat-crawl-stasis-raw-v1",
    protocol: "stasis-compat-bench-v1",
    track: "crawling",
    runner: "stasis-reference-crawler",
    versions: {
      node: "v22.20.0",
      sdk: "0.2.1",
      executableSha256: "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d",
    },
    rules: {
      concurrency: 1,
      maxRequestRetries: 0,
      maxPages: 20,
      maxDepth: 2,
      fallback: false,
    },
  };
}

test("exact paired outcomes classify every primary page as equivalent", () => {
  const baseline = exactRaw("baseline");
  const candidate = exactRaw("candidate");
  const result = compareCrawl(baseline, candidate);
  assert.equal(result.baselineValid, true);
  assert.equal(result.candidateValid, true);
  assert.deepEqual(result.counts, { PASS_EQUIVALENT: 20 });
  assert.equal(result.scheduledUrlJaccard, 1);
});

test("a candidate-wide terminal is visible for the full frozen denominator", () => {
  const baseline = exactRaw("baseline");
  const candidate = exactRaw("candidate");
  candidate.primary = { success: false, error: { name: "StasisProcessError", message: "child died" } };
  const result = compareCrawl(baseline, candidate);
  assert.equal(result.candidateValid, true);
  assert.deepEqual(result.counts, { ENGINE_BUG: 20 });
});

test("an invalid baseline can never become candidate success", () => {
  const baseline = exactRaw("baseline");
  baseline.primary.result.pages.pop();
  const result = compareCrawl(baseline, exactRaw("candidate"));
  assert.equal(result.baselineValid, false);
  assert.deepEqual(result.counts, { BASELINE_FAILURE: 20 });
});

test("a failed negative-control baseline invalidates the crawl track", () => {
  const baseline = exactRaw("baseline");
  baseline.negativeControls[0].success = false;
  delete baseline.negativeControls[0].result;
  baseline.negativeControls[0].error = { message: "baseline control failed" };
  const result = compareCrawl(baseline, exactRaw("candidate"));
  assert.equal(result.primaryBaselineValid, true);
  assert.equal(result.negativeControlsBaselineValid, false);
  assert.equal(result.baselineValid, false);
  assert.equal(result.negativeControls[0].classification, "BASELINE_FAILURE");
});
