import { isDeepStrictEqual } from "node:util";

import { compareCrawl } from "../crawl/compare-lib.mjs";
import {
  deterministicV03BaselineEnvelope,
  deterministicV03CandidateEnvelope,
  deterministicV03Protocol,
  deterministicV03Track,
} from "./identity.mjs";

const legacyProtocol = "stasis-compat-bench-v1";
const legacyExecutableSha256 =
  "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d";
const limitKinds = new Map([
  ["virtual_time_limit_exceeded", "virtual_time"],
  ["control_turn_limit_exceeded", "control_turns"],
  ["task_limit_exceeded", "ordinary_tasks"],
  ["microtask_limit_exceeded", "microtasks"],
  ["rendering_limit_exceeded", "rendering_opportunities"],
  ["mutation_limit_exceeded", "mutations"],
]);

export function compareDeterministicV03(playwright, stasis) {
  const baselineIdentityValid = envelopeMatches(
    playwright,
    deterministicV03BaselineEnvelope,
    "baseline",
  );
  const candidateIdentityValid = envelopeMatches(
    stasis,
    deterministicV03CandidateEnvelope,
    "candidate",
  );
  const legacy = compareCrawl(
    adaptBaseline(playwright, baselineIdentityValid),
    adaptCandidate(stasis, candidateIdentityValid),
  );
  const primaryCases = restoreV03PrimarySemantics(
    legacy.primaryCases,
    stasis,
    candidateIdentityValid,
  );
  const counts = countClassifications(primaryCases);
  const negativeControls = restoreV03ControlSemantics(
    legacy.negativeControls,
    stasis,
    candidateIdentityValid,
  );
  return {
    ...legacy,
    protocol: deterministicV03Protocol,
    track: deterministicV03Track,
    baselineIdentityValid,
    candidateIdentityValid,
    counts,
    exactEquivalentRate: (counts.PASS_EQUIVALENT ?? 0) / legacy.primaryDenominator,
    behaviorallySupportedRate:
      ((counts.PASS_EQUIVALENT ?? 0) + (counts.PASS_WITH_SEMANTIC_DIFFERENCE ?? 0)) /
      legacy.primaryDenominator,
    primaryCases,
    negativeControls,
  };
}

function envelopeMatches(raw, expected, lane) {
  if (raw === null || typeof raw !== "object") return false;
  const projected = {
    schema: raw.schema,
    protocol: raw.protocol,
    track: raw.track,
    runner: raw.runner,
    versions: lane === "baseline"
      ? {
          node: raw.versions?.node,
          crawlee: raw.versions?.crawlee,
          playwright: raw.versions?.playwright,
          chromiumRevisionDirectory: raw.versions?.chromiumRevisionDirectory,
          chromiumVersion: raw.versions?.chromiumVersion,
          chromiumExecutableSha256: raw.versions?.chromiumExecutableSha256,
        }
      : {
          node: raw.versions?.node,
          sdk: raw.versions?.sdk,
          sourceRevision: raw.versions?.sourceRevision,
          executableSha256: raw.versions?.executableSha256,
          sdkArchiveSha256: raw.versions?.sdkArchiveSha256,
          sdkArchiveBytes: raw.versions?.sdkArchiveBytes,
          sdkTree: raw.versions?.sdkTree,
        },
    rules: raw.rules,
  };
  return isDeepStrictEqual(projected, expected);
}

function adaptBaseline(raw, valid) {
  if (!valid || raw === null || typeof raw !== "object") {
    return {
      ...(raw ?? {}),
      schema: "invalid-v03-baseline-envelope",
      protocol: "invalid-v03-envelope",
      track: "invalid-v03-envelope",
    };
  }
  return {
    ...raw,
    schema: "stasis-compat-crawl-playwright-raw-v1",
    protocol: legacyProtocol,
    track: "crawling",
  };
}

function adaptCandidate(raw, valid) {
  if (!valid || raw === null || typeof raw !== "object") {
    return {
      ...(raw ?? {}),
      schema: "invalid-v03-candidate-envelope",
      protocol: "invalid-v03-envelope",
      track: "invalid-v03-envelope",
    };
  }
  const { profile: _profile, ...legacyRules } = raw.rules;
  return {
    ...raw,
    schema: "stasis-compat-crawl-stasis-raw-v1",
    protocol: legacyProtocol,
    track: "crawling",
    runner: "stasis-reference-crawler",
    versions: {
      ...raw.versions,
      sdk: "0.2.1",
      executableSha256: legacyExecutableSha256,
    },
    rules: legacyRules,
    primary: adaptCandidateRun(raw.primary),
    negativeControls: Array.isArray(raw.negativeControls)
      ? raw.negativeControls.map(adaptCandidateRun)
      : raw.negativeControls,
  };
}

function adaptCandidateRun(run) {
  if (
    run === null ||
    typeof run !== "object" ||
    run.success !== true ||
    run.result === null ||
    typeof run.result !== "object" ||
    !Array.isArray(run.result.pages)
  ) {
    return run;
  }
  return {
    ...run,
    result: {
      ...run.result,
      pages: run.result.pages.map((page) => {
        if (
          page?.status !== "settlement_not_crawlable" ||
          !limitKinds.has(page.settleOutcome)
        ) {
          return page;
        }
        // The immutable v0.2 validator predates v0.3 execution-limit outcomes.
        // Adapt only for its structural checks, then restore the exact typed
        // outcome in the public v0.3 comparison below.
        return { ...page, settleOutcome: "unsupported_work" };
      }),
    },
  };
}

function restoreV03PrimarySemantics(cases, stasis, candidateIdentityValid) {
  if (!candidateIdentityValid || !Array.isArray(cases)) return cases;
  const pages = new Map(
    Array.isArray(stasis?.primary?.result?.pages)
      ? stasis.primary.result.pages.map((page) => [page?.requestedUrl, page])
      : [],
  );
  return cases.map((item) => {
    if (item?.classification !== "PROFILE_UNSUPPORTED") return item;
    const page = pages.get(item.requestedUrl);
    if (page?.status !== "settlement_not_crawlable") return item;
    const stasisEvidence = projectV03Page(page);
    if (page.settleOutcome === "runtime_error") {
      return {
        ...item,
        classification: "ENGINE_BUG",
        reason: "The controlled runtime returned the typed runtime_error settlement terminal",
        surface: "engine_correctness",
        settleOutcome: page.settleOutcome,
        stasis: stasisEvidence,
      };
    }
    const limitKind = limitKinds.get(page.settleOutcome);
    if (limitKind !== undefined) {
      return {
        ...item,
        classification: "PROFILE_UNSUPPORTED",
        reason: "The controlled runtime reached a typed execution limit",
        surface: "execution_limit",
        settleOutcome: page.settleOutcome,
        limitKind,
        stasis: stasisEvidence,
      };
    }
    return { ...item, stasis: stasisEvidence };
  });
}

function restoreV03ControlSemantics(controls, stasis, candidateIdentityValid) {
  if (!candidateIdentityValid || !Array.isArray(controls)) return controls;
  return controls.map((item) => {
    if (item?.classification !== "PROFILE_UNSUPPORTED") return item;
    const run = Array.isArray(stasis?.negativeControls)
      ? stasis.negativeControls.find((candidate) => candidate?.id === item.id)
      : undefined;
    const terminal = run?.success === false
      ? { kind: "error", code: run.error?.code ?? "unknown" }
      : {
          kind: "settlement",
          outcome: run?.result?.pages?.[0]?.settleOutcome ?? "unknown",
        };
    if (terminal.kind === "settlement" && terminal.outcome === "runtime_error") {
      return {
        ...item,
        classification: "ENGINE_BUG",
        surface: "engine_correctness",
        diagnosisConfidence: "typed",
        settleOutcome: terminal.outcome,
        terminal,
      };
    }
    const limitKind = terminal.kind === "settlement"
      ? limitKinds.get(terminal.outcome)
      : undefined;
    if (limitKind !== undefined) {
      return {
        ...item,
        classification: "PROFILE_UNSUPPORTED",
        surface: "execution_limit",
        diagnosisConfidence: "typed",
        settleOutcome: terminal.outcome,
        limitKind,
        terminal,
      };
    }
    if (!isTypedDesignedControl(item.id, terminal)) {
      return {
        ...item,
        diagnosisConfidence: "unconfirmed_designed_control",
        terminal,
      };
    }
    return {
      ...item,
      surface: item.expectedSurface,
      diagnosisConfidence: "typed_designed_control",
      terminal,
    };
  });
}

function isTypedDesignedControl(id, terminal) {
  return (
    terminal.kind === "error" &&
    ((id === "worker" && terminal.code === "unsupported_work") ||
      (id === "iframe" && terminal.code === "navigation_authority_changed"))
  );
}

function projectV03Page(page) {
  return {
    url: page.url,
    status: page.status,
    settleOutcome: page.settleOutcome,
    links: page.links,
  };
}

function countClassifications(cases) {
  const counts = {};
  for (const item of cases) {
    counts[item.classification] = (counts[item.classification] ?? 0) + 1;
  }
  return counts;
}
