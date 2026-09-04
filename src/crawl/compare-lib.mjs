import { isDeepStrictEqual } from "node:util";

import { expectedPrimaryScheduledUrls, negativeControls } from "./corpus.mjs";

const baselineStatuses = new Set(["crawled"]);
const candidateStatuses = new Set([
  "crawled",
  "settlement_not_crawlable",
  "redirect_disallowed",
]);
const crawlableSettleOutcomes = new Set(["quiescent", "quiescent_with_persistent_work"]);
const nonCrawlableSettleOutcomes = new Set([
  "blocked_on_external_io",
  "blocked_on_open_ended_work",
  "runtime_error",
  "unsupported_work",
]);
const frozenPrimaryDepths = new Map(
  expectedPrimaryScheduledUrls.map((url, index) => [url, index === 0 ? 0 : index <= 10 ? 1 : 2]),
);
const expectedNegativeControlIds = negativeControls.map((control) => control.id);
const frozenBaselineEnvelope = Object.freeze({
  schema: "stasis-compat-crawl-playwright-raw-v1",
  protocol: "stasis-compat-bench-v1",
  track: "crawling",
  runner: "crawlee-playwright",
  versions: Object.freeze({
    node: "v22.20.0",
    crawlee: "3.18.1",
    playwright: "1.62.1",
    chromiumRevisionDirectory: "chromium-1234",
    chromiumVersion: "151.0.7922.34",
    chromiumExecutableSha256:
      "409805a16d6416087e6b2f778df1cf8f7bbb267d6b99f6b5bb0a618eace234f2",
  }),
  rules: Object.freeze({
    concurrency: 1,
    maxRequestRetries: 0,
    maxPages: 20,
    maxDepth: 2,
    persistStorage: false,
    useSessionPool: false,
  }),
});
const frozenCandidateEnvelope = Object.freeze({
  schema: "stasis-compat-crawl-stasis-raw-v1",
  protocol: "stasis-compat-bench-v1",
  track: "crawling",
  runner: "stasis-reference-crawler",
  versions: Object.freeze({
    node: "v22.20.0",
    sdk: "0.2.1",
    executableSha256:
      "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d",
  }),
  rules: Object.freeze({
    concurrency: 1,
    maxRequestRetries: 0,
    maxPages: 20,
    maxDepth: 2,
    fallback: false,
  }),
});

export function compareCrawl(playwright, stasis) {
  const baselineIdentityValid = envelopeMatches(playwright, frozenBaselineEnvelope);
  const candidateIdentityValid = envelopeMatches(stasis, frozenCandidateEnvelope);
  const primaryBaselineValid = baselineIdentityValid && baselineIsValid(playwright?.primary);
  const primaryCases = comparePrimary(
    playwright?.primary,
    stasis?.primary,
    primaryBaselineValid,
    candidateIdentityValid,
  );

  const baselineControls = playwright?.negativeControls;
  const candidateControls = stasis?.negativeControls;
  const baselineControlInventoryValid =
    baselineIdentityValid && controlInventoryMatches(baselineControls);
  const candidateControlInventoryShapeValid =
    candidateIdentityValid && controlInventoryHasValidShape(candidateControls);
  const candidateControlInventoryMatches = controlInventoryMatches(candidateControls);
  const candidateValid =
    candidateIdentityValid &&
    candidateRunEvidenceIsValid(stasis?.primary) &&
    candidateControlInventoryMatches &&
    candidateControls.every((control) => candidateRunEvidenceIsValid(control));
  const negativeResults = negativeControls.map((control) =>
    compareNegative(
      control,
      controlById(baselineControls, control.id),
      controlById(candidateControls, control.id),
      {
        baselineControlInventoryValid,
        candidateIdentityValid,
        candidateControlInventoryShapeValid,
        candidateControlInventoryMatches,
      },
    ),
  );
  const negativeControlsBaselineValid = negativeResults.every(
    ({ classification }) => classification !== "BASELINE_FAILURE",
  );
  const baselineValid = primaryBaselineValid && negativeControlsBaselineValid;
  const counts = countClassifications(primaryCases);
  const baselineSet = scheduledUrlSet(playwright?.primary);
  const stasisSet = scheduledUrlSet(stasis?.primary);
  return {
    protocol: "stasis-compat-bench-v1",
    track: "crawling",
    baselineValid,
    baselineIdentityValid,
    candidateIdentityValid,
    candidateValid,
    primaryBaselineValid,
    negativeControlsBaselineValid,
    primaryDenominator: expectedPrimaryScheduledUrls.length,
    counts,
    exactEquivalentRate: (counts.PASS_EQUIVALENT ?? 0) / expectedPrimaryScheduledUrls.length,
    behaviorallySupportedRate:
      ((counts.PASS_EQUIVALENT ?? 0) + (counts.PASS_WITH_SEMANTIC_DIFFERENCE ?? 0)) /
      expectedPrimaryScheduledUrls.length,
    scheduledUrlJaccard: jaccard(baselineSet, stasisSet),
    primaryCases,
    negativeControls: negativeResults,
    diagnosticWallTimeMs: {
      crawleePlaywright: playwright?.primary?.wallTimeMs,
      stasisFreshProcessPerPage: stasis?.primary?.wallTimeMs,
      comparisonClaim: "none; execution units differ and performance is outside the pass criterion",
    },
  };
}

function baselineIsValid(primary) {
  return (
    successfulRunHasValidShape(primary, baselineStatuses, true, "baseline") &&
    primaryMatchesFrozenDenominator(primary)
  );
}

function comparePrimary(baseline, candidate, baselineValid, candidateIdentityValid) {
  if (!baselineValid) {
    return classifyEveryPrimary(
      "BASELINE_FAILURE",
      "The pinned baseline did not produce exact, failure-free evidence for the frozen 20-page denominator",
    );
  }
  if (!candidateIdentityValid) {
    return classifyEveryPrimary(
      "BENCHMARK_INVALID",
      "The candidate raw envelope does not match the frozen runner, version, executable, or rule identity",
    );
  }
  if (candidate?.success !== true) {
    return classifyEveryPrimary(
      classifyCandidateError(candidate?.error),
      "The Stasis reference crawl terminated before producing the complete denominator",
      candidate?.error,
    );
  }
  if (!successfulRunHasValidShape(candidate, candidateStatuses, false, "candidate")) {
    return classifyEveryPrimary(
      "ENGINE_BUG",
      "The Stasis runner reported success with malformed, duplicate, failed, or fixture-miss evidence",
    );
  }
  if (!primaryMatchesFrozenDenominator(candidate)) {
    return classifyEveryPrimary(
      "WEB_COMPAT_BUG",
      "The Stasis runner produced a structurally valid but non-frozen scheduled/page denominator",
    );
  }

  const baselinePages = new Map(baseline.result.pages.map((page) => [page.requestedUrl, page]));
  const candidatePages = new Map(candidate.result.pages.map((page) => [page.requestedUrl, page]));
  return expectedPrimaryScheduledUrls.map((requestedUrl) => {
    const left = baselinePages.get(requestedUrl);
    const right = candidatePages.get(requestedUrl);
    if (left === undefined) {
      return { requestedUrl, classification: "BASELINE_FAILURE", reason: "Baseline page missing" };
    }
    if (right === undefined) {
      return { requestedUrl, classification: "ENGINE_BUG", reason: "Stasis page missing" };
    }
    if (right.status === "settlement_not_crawlable") {
      return {
        requestedUrl,
        classification: "PROFILE_UNSUPPORTED",
        surface: settleSurface(right.settleOutcome),
        baseline: project(left),
        stasis: project(right),
      };
    }
    if (right.status !== "crawled") {
      return {
        requestedUrl,
        classification: "ENGINE_BUG",
        reason: `Unexpected Stasis page status ${right.status}`,
        baseline: project(left),
        stasis: project(right),
      };
    }
    const exact = left.url === right.url && arraysEqual(left.links, right.links);
    if (exact) {
      return {
        requestedUrl,
        classification: "PASS_EQUIVALENT",
        baseline: project(left),
        stasis: project(right),
      };
    }
    if (setsEqual(new Set(left.links), new Set(right.links))) {
      return {
        requestedUrl,
        classification: "PASS_WITH_SEMANTIC_DIFFERENCE",
        differences: [
          ...(left.url === right.url ? [] : ["final_url"]),
          ...(arraysEqual(left.links, right.links) ? [] : ["link_order"]),
        ],
        baseline: project(left),
        stasis: project(right),
      };
    }
    return {
      requestedUrl,
      classification: "WEB_COMPAT_BUG",
      reason: "Resolved link extraction diverged under an in-profile contract",
      baseline: project(left),
      stasis: project(right),
    };
  });
}

function compareNegative(control, baseline, candidate, inventory) {
  if (
    !inventory.baselineControlInventoryValid ||
    !successfulRunHasValidShape(baseline, baselineStatuses, true, "baseline") ||
    !runMatchesDenominator(baseline, [control.start])
  ) {
    return {
      id: control.id,
      classification: "BASELINE_FAILURE",
      expectedSurface: control.expectedSurface,
      reason: "The negative baseline did not produce its exact, failure-free one-page denominator",
      baseline,
    };
  }
  if (!inventory.candidateIdentityValid) {
    return {
      id: control.id,
      classification: "BENCHMARK_INVALID",
      expectedSurface: control.expectedSurface,
      reason: "The candidate raw envelope does not match the frozen identity",
    };
  }
  if (candidate?.success !== true) {
    return {
      id: control.id,
      classification: classifyCandidateError(candidate?.error, control.expectedSurface),
      expectedSurface: control.expectedSurface,
      candidateError: candidate?.error,
    };
  }
  if (
    !inventory.candidateControlInventoryShapeValid ||
    !successfulRunHasValidShape(candidate, candidateStatuses, false, "candidate")
  ) {
    return {
      id: control.id,
      classification: "ENGINE_BUG",
      expectedSurface: control.expectedSurface,
      reason: "The negative candidate reported success with malformed evidence",
    };
  }
  if (!inventory.candidateControlInventoryMatches || !runMatchesDenominator(candidate, [control.start])) {
    return {
      id: control.id,
      classification: "WEB_COMPAT_BUG",
      expectedSurface: control.expectedSurface,
      reason: "The negative candidate produced a structurally valid but non-frozen denominator",
    };
  }

  const candidatePage = candidate.result.pages[0];
  if (candidatePage.status === "settlement_not_crawlable") {
    return {
      id: control.id,
      classification: "PROFILE_UNSUPPORTED",
      expectedSurface: control.expectedSurface,
      settleOutcome: candidatePage.settleOutcome,
    };
  }
  const baselinePage = baseline.result.pages[0];
  if (
    candidatePage.status === "crawled" &&
    baselinePage.url === candidatePage.url &&
    arraysEqual(baselinePage.links, candidatePage.links)
  ) {
    return {
      id: control.id,
      classification: "PASS_EQUIVALENT",
      expectedSurface: control.expectedSurface,
    };
  }
  return {
    id: control.id,
    classification: "WEB_COMPAT_BUG",
    expectedSurface: control.expectedSurface,
    baseline: project(baselinePage),
    stasis: project(candidatePage),
  };
}

function successfulRunHasValidShape(run, allowedStatuses, requireIssueCollections, lane) {
  if (
    run?.success !== true ||
    !isRecord(run.result) ||
    (run.error !== undefined && run.error !== null) ||
    !hasZeroIssueCollection(run, "failures", requireIssueCollections) ||
    !hasZeroIssueCollection(run, "fixtureMisses", requireIssueCollections)
  ) {
    return false;
  }
  const { scheduledUrls, pages } = run.result;
  if (
    !hasUniqueCanonicalUrls(scheduledUrls) ||
    !Array.isArray(pages) ||
    pages.some((page) => !pageHasValidShape(page, allowedStatuses, lane))
  ) {
    return false;
  }
  return hasUniqueCanonicalUrls(pages.map((page) => page.requestedUrl));
}

function envelopeMatches(raw, expected) {
  if (!isRecord(raw) || !isRecord(raw.versions)) return false;
  const actual = {
    schema: raw.schema,
    protocol: raw.protocol,
    track: raw.track,
    runner: raw.runner,
    versions: expected.runner === "crawlee-playwright"
      ? {
          node: raw.versions.node,
          crawlee: raw.versions.crawlee,
          playwright: raw.versions.playwright,
          chromiumRevisionDirectory: raw.versions.chromiumRevisionDirectory,
          chromiumVersion: raw.versions.chromiumVersion,
          chromiumExecutableSha256: raw.versions.chromiumExecutableSha256,
        }
      : {
          node: raw.versions.node,
          sdk: raw.versions.sdk,
          executableSha256: raw.versions.executableSha256,
        },
    rules: raw.rules,
  };
  return isDeepStrictEqual(actual, expected);
}

function pageHasValidShape(page, allowedStatuses, lane) {
  const common = (
    isRecord(page) &&
    isCanonicalHttpUrl(page.requestedUrl) &&
    isCanonicalHttpUrl(page.url) &&
    Number.isSafeInteger(page.depth) &&
    page.depth >= 0 &&
    allowedStatuses.has(page.status) &&
    hasUniqueCanonicalUrls(page.links)
  );
  if (!common) return false;
  if (lane === "baseline") return !Object.hasOwn(page, "settleOutcome");
  if (lane !== "candidate") return false;
  if (page.status === "crawled") return crawlableSettleOutcomes.has(page.settleOutcome);
  if (page.status === "settlement_not_crawlable") {
    return nonCrawlableSettleOutcomes.has(page.settleOutcome) && page.links.length === 0;
  }
  return page.status === "redirect_disallowed" && page.settleOutcome === null && page.links.length === 0;
}

function hasZeroIssueCollection(run, key, required) {
  const value = run[key];
  // Playwright always emits these side channels. The Stasis lane is fail-fast and omits them,
  // but an adapter that does emit either collection may only claim success when it is empty.
  if (value === undefined) return !required;
  return Array.isArray(value) && value.length === 0;
}

function primaryMatchesFrozenDenominator(run) {
  return runMatchesDenominator(run, expectedPrimaryScheduledUrls);
}

function runMatchesDenominator(run, expectedUrls) {
  const expectedDepths = expectedUrls.map((url) => frozenPrimaryDepths.get(url) ?? 0);
  return (
    arraysEqual(run?.result?.scheduledUrls, expectedUrls) &&
    arraysEqual(
      run?.result?.pages?.map((page) => page.requestedUrl),
      expectedUrls,
    ) &&
    arraysEqual(run?.result?.pages?.map((page) => page.depth), expectedDepths)
  );
}

function controlInventoryHasValidShape(items) {
  if (!Array.isArray(items)) return false;
  const ids = items.map((item) => (isRecord(item) ? item.id : undefined));
  return ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length;
}

function controlInventoryMatches(items) {
  return (
    controlInventoryHasValidShape(items) &&
    arraysEqual(items.map((item) => item.id), expectedNegativeControlIds) &&
    items.every(
      (item, index) => item.expectedSurface === negativeControls[index].expectedSurface,
    )
  );
}

function candidateRunEvidenceIsValid(run) {
  if (!isRecord(run)) return false;
  if (run.success === true) {
    return successfulRunHasValidShape(run, candidateStatuses, false, "candidate");
  }
  return run.success === false && isRecord(run.error);
}

function controlById(items, id) {
  return Array.isArray(items) ? items.find((item) => item?.id === id) : undefined;
}

function classifyEveryPrimary(classification, reason, candidateError) {
  return expectedPrimaryScheduledUrls.map((requestedUrl) => ({
    requestedUrl,
    classification,
    reason,
    ...(candidateError === undefined ? {} : { candidateError }),
  }));
}

function classifyCandidateError(error, expectedSurface) {
  if (
    (expectedSurface === "worker" && error?.code === "unsupported_work") ||
    (expectedSurface === "iframe" && error?.code === "navigation_authority_changed")
  ) {
    return "PROFILE_UNSUPPORTED";
  }
  let text;
  try {
    text = JSON.stringify(error ?? {}).toLowerCase();
  } catch {
    text = String(error ?? "").toLowerCase();
  }
  if (
    text.includes("unsupported") ||
    text.includes("open_ended") ||
    (expectedSurface !== undefined && text.includes(expectedSurface))
  ) {
    return "PROFILE_UNSUPPORTED";
  }
  if (text.includes("selector") || text.includes("crawler")) return "SDK_GAP";
  return "ENGINE_BUG";
}

function settleSurface(outcome) {
  if (outcome === "unsupported_work") return "typed_runtime_surface";
  if (outcome === "blocked_on_open_ended_work") return "open_ended_work";
  if (outcome === "blocked_on_external_io") return "external_io";
  return "execution_limit_or_runtime";
}

function project(page) {
  return {
    url: page.url,
    status: page.status,
    ...(page.settleOutcome === undefined ? {} : { settleOutcome: page.settleOutcome }),
    links: page.links,
  };
}

function countClassifications(cases) {
  const counts = {};
  for (const item of cases) counts[item.classification] = (counts[item.classification] ?? 0) + 1;
  return counts;
}

function scheduledUrlSet(primary) {
  const values = primary?.result?.scheduledUrls;
  return new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []);
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}

function hasUniqueCanonicalUrls(values) {
  return (
    Array.isArray(values) &&
    values.every(isCanonicalHttpUrl) &&
    new Set(values).size === values.length
  );
}

function isCanonicalHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0 &&
      url.href === value
    );
  } catch {
    return false;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arraysEqual(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
