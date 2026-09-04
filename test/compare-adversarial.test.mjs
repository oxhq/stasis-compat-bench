import assert from "node:assert/strict";
import test from "node:test";

import { compareCrawl } from "../src/crawl/compare-lib.mjs";
import {
  expectedPrimaryScheduledUrls,
  negativeControls,
  origin,
} from "../src/crawl/corpus.mjs";

function page(url, lane = "baseline", status = "crawled") {
  const index = expectedPrimaryScheduledUrls.indexOf(url);
  const depth = index < 1 ? 0 : index <= 10 ? 1 : 2;
  return {
    requestedUrl: url,
    url,
    depth,
    status,
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

function baselineRaw() {
  return exactRaw("baseline");
}

function candidateRaw() {
  return exactRaw("candidate");
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

function assertNoPrimaryPass(result, classification) {
  assert.deepEqual(result.counts, { [classification]: expectedPrimaryScheduledUrls.length });
  assert.equal(result.exactEquivalentRate, 0);
  assert.equal(result.behaviorallySupportedRate, 0);
  assert.equal(
    result.primaryCases.some((item) => item.classification === "PASS_EQUIVALENT"),
    false,
  );
}

test("an extra candidate scheduled URL invalidates every success and preserves Jaccard evidence", () => {
  const baseline = baselineRaw();
  const candidate = candidateRaw();
  candidate.primary.result.scheduledUrls.push(`${origin}/unexpected-extra`);

  const result = compareCrawl(baseline, candidate);

  assert.equal(result.primaryBaselineValid, true);
  assertNoPrimaryPass(result, "WEB_COMPAT_BUG");
  assert.equal(result.scheduledUrlJaccard, 20 / 21);
  assert.ok(result.scheduledUrlJaccard < 1);
});

test("missing, reordered, or extra candidate denominator evidence cannot retain partial passes", () => {
  const mutations = [
    (candidate) => {
      candidate.primary.result.scheduledUrls.pop();
      candidate.primary.result.pages.pop();
    },
    (candidate) => {
      [candidate.primary.result.scheduledUrls[0], candidate.primary.result.scheduledUrls[1]] = [
        candidate.primary.result.scheduledUrls[1],
        candidate.primary.result.scheduledUrls[0],
      ];
    },
    (candidate) => {
      candidate.primary.result.pages.push(page(`${origin}/unexpected-page`, "candidate"));
    },
  ];

  for (const mutate of mutations) {
    const candidate = candidateRaw();
    mutate(candidate);
    assertNoPrimaryPass(compareCrawl(baselineRaw(), candidate), "WEB_COMPAT_BUG");
  }
});

test("malformed candidate success evidence is an engine failure for the whole denominator", () => {
  const candidates = [
    (() => {
      const candidate = candidateRaw();
      candidate.primary.result.pages.push(page(expectedPrimaryScheduledUrls[0], "candidate"));
      return candidate;
    })(),
    (() => {
      const candidate = candidateRaw();
      candidate.primary.result.pages[0].status = "success";
      return candidate;
    })(),
    (() => {
      const candidate = candidateRaw();
      candidate.primary.failures.push({ requestedUrl: expectedPrimaryScheduledUrls[0] });
      return candidate;
    })(),
    (() => {
      const candidate = candidateRaw();
      candidate.primary.fixtureMisses.push({ method: "GET", url: `${origin}/missing` });
      return candidate;
    })(),
  ];

  for (const candidate of candidates) {
    const result = compareCrawl(baselineRaw(), candidate);
    assert.equal(result.candidateValid, false);
    assertNoPrimaryPass(result, "ENGINE_BUG");
  }
});

test("baseline success requires exact order, pages, statuses, and empty issue collections", () => {
  const mutations = [
    (baseline) => baseline.primary.failures.push({ message: "failed request" }),
    (baseline) => baseline.primary.fixtureMisses.push({ method: "GET", url: `${origin}/miss` }),
    (baseline) => baseline.primary.result.scheduledUrls.push(`${origin}/extra`),
    (baseline) => baseline.primary.result.pages.pop(),
    (baseline) => {
      baseline.primary.result.pages[0].status = "settlement_not_crawlable";
    },
  ];

  for (const mutate of mutations) {
    const baseline = baselineRaw();
    mutate(baseline);
    const result = compareCrawl(baseline, candidateRaw());
    assert.equal(result.primaryBaselineValid, false);
    assertNoPrimaryPass(result, "BASELINE_FAILURE");
  }
});

test("negative baseline success requires its exact one-page result and full control inventory", () => {
  const malformedRuns = [
    (baseline) => baseline.negativeControls[0].failures.push({ message: "failed request" }),
    (baseline) => baseline.negativeControls[0].fixtureMisses.push({ url: `${origin}/miss` }),
    (baseline) => baseline.negativeControls[0].result.scheduledUrls.push(`${origin}/extra`),
    (baseline) => baseline.negativeControls[0].result.pages.push(page(`${origin}/extra`)),
    (baseline) => {
      baseline.negativeControls[0].result.pages[0].status = "redirect_disallowed";
    },
  ];

  for (const mutate of malformedRuns) {
    const baseline = baselineRaw();
    mutate(baseline);
    const result = compareCrawl(baseline, candidateRaw());
    assert.equal(result.negativeControlsBaselineValid, false);
    assert.equal(result.baselineValid, false);
    assert.equal(result.negativeControls[0].classification, "BASELINE_FAILURE");
  }

  const extraControlBaseline = baselineRaw();
  extraControlBaseline.negativeControls.push({
    id: "unexpected",
    expectedSurface: "unexpected",
    success: true,
    failures: [],
    fixtureMisses: [],
    result: { scheduledUrls: [`${origin}/negative/unexpected`], pages: [page(`${origin}/negative/unexpected`)] },
  });
  const result = compareCrawl(extraControlBaseline, candidateRaw());
  assert.equal(result.negativeControlsBaselineValid, false);
  assert.ok(result.negativeControls.every((item) => item.classification === "BASELINE_FAILURE"));
});

test("a structurally valid non-frozen negative candidate cannot pass", () => {
  const candidate = candidateRaw();
  candidate.negativeControls[0].result.scheduledUrls.push(`${origin}/negative/extra`);

  const result = compareCrawl(baselineRaw(), candidate);

  assert.equal(result.negativeControls[0].classification, "WEB_COMPAT_BUG");
});

test("raw runner identity drift cannot retain a pass", () => {
  const baseline = baselineRaw();
  baseline.versions.node = "v25.9.0";
  const invalidBaseline = compareCrawl(baseline, candidateRaw());
  assert.equal(invalidBaseline.baselineIdentityValid, false);
  assertNoPrimaryPass(invalidBaseline, "BASELINE_FAILURE");

  const candidate = candidateRaw();
  candidate.versions.executableSha256 = "0".repeat(64);
  const invalidCandidate = compareCrawl(baselineRaw(), candidate);
  assert.equal(invalidCandidate.candidateIdentityValid, false);
  assert.equal(invalidCandidate.candidateValid, false);
  assertNoPrimaryPass(invalidCandidate, "BENCHMARK_INVALID");
});

test("candidate pages require typed settlement outcomes and the frozen BFS depths", () => {
  const missingOutcome = candidateRaw();
  delete missingOutcome.primary.result.pages[0].settleOutcome;
  const missingResult = compareCrawl(baselineRaw(), missingOutcome);
  assert.equal(missingResult.candidateValid, false);
  assertNoPrimaryPass(missingResult, "ENGINE_BUG");

  const impossibleDepths = candidateRaw();
  for (const pageResult of impossibleDepths.primary.result.pages) pageResult.depth = 0;
  const depthResult = compareCrawl(baselineRaw(), impossibleDepths);
  assert.equal(depthResult.candidateValid, true);
  assertNoPrimaryPass(depthResult, "WEB_COMPAT_BUG");
});

test("candidate settlement status and outcome combinations are not self-declared", () => {
  const malformed = candidateRaw();
  malformed.primary.result.pages[0].status = "settlement_not_crawlable";
  malformed.primary.result.pages[0].settleOutcome = "quiescent";
  const malformedResult = compareCrawl(baselineRaw(), malformed);
  assert.equal(malformedResult.candidateValid, false);
  assertNoPrimaryPass(malformedResult, "ENGINE_BUG");

  const typed = candidateRaw();
  typed.primary.result.pages[0].status = "settlement_not_crawlable";
  typed.primary.result.pages[0].settleOutcome = "unsupported_work";
  const typedResult = compareCrawl(baselineRaw(), typed);
  assert.equal(typedResult.candidateValid, true);
  assert.equal(typedResult.primaryCases[0].classification, "PROFILE_UNSUPPORTED");
});
