import { publicHttpUrlIdentity } from "./normalize.mjs";

export function classifyWildCase({ entry, baselineGate, baseline, stasisGate, stasis }) {
  if (baselineGate?.status === "harness_error") {
    return invalid(baselineGate.code ?? "baseline_gate_harness_error");
  }
  if (baselineGate?.status !== "allowed") {
    return excluded("BASELINE_FAILURE", "pre_baseline_gate", baselineGate?.code ?? "gate_not_allowed");
  }
  if (baseline?.status === "harness_error") {
    return invalid(baseline.code ?? "baseline_harness_error");
  }
  if (baseline?.status !== "success") {
    return excluded("BASELINE_FAILURE", "baseline_terminal", baseline?.code ?? "baseline_not_successful");
  }
  if (!validBaselineSuccessEvidence(entry, baseline)) {
    return invalid("invalid_baseline_success_evidence");
  }
  if (stasisGate?.status === "harness_error") {
    return invalid(stasisGate.code ?? "stasis_gate_harness_error");
  }
  if (stasisGate?.status !== "allowed") {
    return excluded("BASELINE_FAILURE", "paired_gate_drift", stasisGate?.code ?? "gate_not_allowed");
  }
  if (stasis?.status === "not_run" || stasis === null || stasis === undefined) {
    return invalid("stasis_missing_after_eligible_baseline");
  }
  if (stasis.status === "harness_error") {
    return invalid(stasis.code ?? "stasis_harness_error");
  }
  if (stasis.status === "policy_or_safety_rejected") {
    return {
      primary: "BENCHMARK_INVALID",
      reason: stasis.code ?? "stasis_policy_or_safety_rejected",
      exposure: "organic_primary",
      diagnosisConfidence: "typed",
      eligibleForOrganicBlockerCensus: false,
      firstTerminal: {
        kind: "policy_or_safety",
        phase: "stasis_network_policy",
        code: stasis.code ?? "unknown",
        typedSurface: "safety_policy",
      },
      censoredAfterFirstTerminal: true,
      rootClusterId: clusterId("BENCHMARK_INVALID", "safety_policy", stasis.code ?? "unknown"),
      blockerFamily: null,
      sdkGaps: [],
      extraction: null,
    };
  }
  if (stasis.status === "success") {
    return classifySuccessfulExtraction(entry, baseline, stasis);
  }
  if (stasis.status === "settlement_terminal") {
    return classifySettlementTerminal(stasis.settlement);
  }
  if (stasis.status === "error") {
    return classifyStasisError(stasis.error);
  }
  return invalid("unknown_stasis_observation_status");
}

export function aggregateWildClassifications(cases) {
  const primaryCounts = {};
  const organicBlockerCounts = {};
  const sdkGapCounts = {};
  const extractionCounts = {};
  const currentUrlCounts = {};
  const rootClusters = new Map();
  const manifestationsByStratum = {};
  const originIdentitiesByFamily = new Map();
  let organicBlockerDenominator = 0;
  let baselineExcluded = 0;
  let validPairedDenominator = 0;
  for (const item of cases) {
    const classification = item.classification;
    const stratum = item.entry?.stratumId ?? "unknown";
    manifestationsByStratum[stratum] ??= {};
    increment(primaryCounts, classification.primary);
    if (classification.primary === "BASELINE_FAILURE") baselineExcluded += 1;
    if (!["BASELINE_FAILURE", "BENCHMARK_INVALID"].includes(classification.primary)) {
      validPairedDenominator += 1;
    }
    if (classification.extraction?.outcome !== undefined) {
      increment(extractionCounts, classification.extraction.outcome);
    }
    if (classification.currentUrl?.outcome !== undefined) {
      increment(currentUrlCounts, classification.currentUrl.outcome);
    }
    for (const gap of classification.sdkGaps ?? []) increment(sdkGapCounts, gap);
    if (classification.eligibleForOrganicBlockerCensus) {
      organicBlockerDenominator += 1;
      const family = classification.blockerFamily ?? "unclassified";
      increment(organicBlockerCounts, family);
      increment(manifestationsByStratum[stratum], family);
      const originIdentity = requestedOriginIdentity(item.entry?.requestedUrl);
      const originIdentities = originIdentitiesByFamily.get(family) ?? new Set();
      if (originIdentity !== null) originIdentities.add(originIdentity);
      originIdentitiesByFamily.set(family, originIdentities);
      const cluster = classification.rootClusterId ?? clusterId(classification.primary, family, classification.reason);
      let rootCluster = rootClusters.get(cluster);
      if (rootCluster === undefined) {
        rootCluster = {
          rootClusterId: cluster,
          primary: classification.primary,
          blockerFamily: family,
          diagnosisConfidence: classification.diagnosisConfidence,
          firstTerminal: {
            phase: classification.firstTerminal?.phase ?? "unknown",
            code: classification.firstTerminal?.code ?? "unknown",
            typedSurface: classification.firstTerminal?.typedSurface ?? "unknown",
          },
          manifestations: 0,
          requestedOriginIdentities: [],
          strata: {},
        };
        rootClusters.set(cluster, rootCluster);
      }
      rootCluster.manifestations += 1;
      if (
        originIdentity !== null &&
        !rootCluster.requestedOriginIdentities.includes(originIdentity)
      ) {
        rootCluster.requestedOriginIdentities.push(originIdentity);
      }
      increment(rootCluster.strata, stratum);
    }
  }
  for (const cluster of rootClusters.values()) {
    cluster.requestedOriginIdentities.sort();
    cluster.independentOriginCount = cluster.requestedOriginIdentities.length;
  }
  const organicRootClusters = [...rootClusters.values()].sort((left, right) =>
    Buffer.compare(Buffer.from(left.rootClusterId, "utf8"), Buffer.from(right.rootClusterId, "utf8"))
  );
  return {
    selectedCount: cases.length,
    baselineExcluded,
    stasisAttempted: cases.filter((item) => item.stasis?.status !== "not_run").length,
    primaryCounts,
    extractionCounts,
    ...(Object.keys(currentUrlCounts).length === 0 ? {} : { currentUrlCounts }),
    sdkGapCounts,
    validPairedDenominator,
    diagnosedOrganicBlockerCount: organicBlockerDenominator,
    // Retained as a compatibility alias for early artifact readers.
    organicBlockerDenominator,
    organicBlockerCounts,
    organicIndependentOriginCounts: Object.fromEntries(
      [...originIdentitiesByFamily].map(([family, identities]) => [family, identities.size]),
    ),
    organicManifestationsByStratum: manifestationsByStratum,
    organicRootClusters,
  };
}

function classifySuccessfulExtraction(_entry, baseline, stasis) {
  if (!validSuccessfulEvidence(baseline, stasis)) {
    return invalid("invalid_success_evidence");
  }
  const extraction = compareExtraction(baseline.extraction, stasis.extraction);
  const sdkGaps = stasis.currentUrlObservable === true && isSha256(stasis.currentUrlIdentity)
    ? []
    : ["current_url_observability"];
  if (sdkGaps.length > 0) {
    return {
      primary: "SDK_GAP",
      reason: "current_url_observability",
      exposure: "organic_primary",
      diagnosisConfidence: "typed",
      eligibleForOrganicBlockerCensus: false,
      firstTerminal: {
        kind: "sdk_gap",
        phase: "post_settlement_current_url",
        code: "current_url_observability",
        typedSurface: "sdk_current_url",
      },
      censoredAfterFirstTerminal: false,
      rootClusterId: clusterId("SDK_GAP", "sdk_current_url", "current_url_observability"),
      blockerFamily: null,
      sdkGaps,
      extraction,
      openCommittedUrlIdentityMatchesBaselineFinalUrlIdentity:
        stasis.openCommittedUrlIdentity === baseline.finalUrlIdentity,
    };
  }
  const currentUrl = {
    outcome: stasis.currentUrlIdentity === baseline.finalUrlIdentity
      ? "equivalent"
      : "divergent",
  };
  const correctnessOutcome =
    extraction.outcome === "equivalent" && currentUrl.outcome === "equivalent"
      ? "equivalent"
      : "divergent";
  const reason = correctnessOutcome === "equivalent"
    ? "equivalent"
    : extraction.outcome === "divergent" && currentUrl.outcome === "divergent"
      ? "extraction_and_current_url_divergent"
      : extraction.outcome === "divergent"
        ? "extraction_divergent"
        : "current_url_divergent";
  return {
    primary: correctnessOutcome === "equivalent"
      ? "PASS_EQUIVALENT"
      : "PASS_WITH_SEMANTIC_DIFFERENCE",
    reason,
    exposure: "organic_primary",
    diagnosisConfidence: "typed",
    eligibleForOrganicBlockerCensus: false,
    firstTerminal: {
      kind: "success",
      phase: "correctness_comparison",
      code: reason,
      typedSurface: "correctness_contract",
    },
    censoredAfterFirstTerminal: false,
    rootClusterId: clusterId(
      correctnessOutcome === "equivalent" ? "PASS_EQUIVALENT" : "PASS_WITH_SEMANTIC_DIFFERENCE",
      "correctness_contract",
      reason,
    ),
    blockerFamily: null,
    sdkGaps,
    extraction,
    currentUrl,
    openCommittedUrlIdentityMatchesBaselineFinalUrlIdentity:
      stasis.openCommittedUrlIdentity === baseline.finalUrlIdentity,
  };
}

function validSuccessfulEvidence(baseline, stasis) {
  return (
    isSha256(baseline?.finalUrlIdentity) &&
    isSha256(stasis?.openCommittedUrlIdentity) &&
    typeof stasis.currentUrlObservable === "boolean" &&
    (
      stasis.currentUrlObservable === false
        ? !Object.hasOwn(stasis, "currentUrlIdentity")
        : isSha256(stasis.currentUrlIdentity)
    ) &&
    validExtractionEvidence(baseline.extraction) &&
    validExtractionEvidence(stasis.extraction) &&
    validTitlePair(baseline.extraction.titleIdentity, stasis.extraction.titleIdentity)
  );
}

function validBaselineSuccessEvidence(entry, baseline) {
  return (
    typeof baseline === "object" &&
    baseline !== null &&
    !Array.isArray(baseline) &&
    hasExactKeys(baseline, [
      "code",
      "contentType",
      "extraction",
      "finalUrlIdentity",
      "requestedUrl",
      "responseStatus",
      "status",
      "wallTimeMs",
    ]) &&
    baseline.status === "success" &&
    baseline.code === "eligible" &&
    typeof entry?.requestedUrl === "string" &&
    baseline.requestedUrl === entry.requestedUrl &&
    isSha256(baseline.finalUrlIdentity) &&
    Number.isSafeInteger(baseline.responseStatus) &&
    baseline.responseStatus >= 200 &&
    baseline.responseStatus < 400 &&
    ["text/html", "application/xhtml+xml"].includes(baseline.contentType) &&
    Number.isFinite(baseline.wallTimeMs) &&
    baseline.wallTimeMs >= 0 &&
    validExtractionEvidence(baseline.extraction)
  );
}

function validExtractionEvidence(extraction) {
  if (
    typeof extraction !== "object" ||
    extraction === null ||
    !hasExactKeys(extraction, ["linkIdentities", "titleIdentity"]) ||
    typeof extraction.titleIdentity !== "object" ||
    extraction.titleIdentity === null ||
    !hasExactKeys(extraction.titleIdentity, ["codePointLength", "sha256", "utf8Bytes"]) ||
    !isSha256(extraction.titleIdentity.sha256) ||
    !Number.isSafeInteger(extraction.titleIdentity.codePointLength) ||
    extraction.titleIdentity.codePointLength < 0 ||
    !Number.isSafeInteger(extraction.titleIdentity.utf8Bytes) ||
    extraction.titleIdentity.utf8Bytes < extraction.titleIdentity.codePointLength ||
    (extraction.titleIdentity.codePointLength === 0) !==
      (extraction.titleIdentity.utf8Bytes === 0) ||
    (extraction.titleIdentity.codePointLength === 0 &&
      extraction.titleIdentity.sha256 !==
        "fac7ef91b43a7d6457d8c8b0583d1ef95177395cc6efa5bca58b6e3c586191eb") ||
    !Array.isArray(extraction.linkIdentities)
  ) {
    return false;
  }
  return extraction.linkIdentities.every((identity, index, values) =>
    isSha256(identity) && (index === 0 || values[index - 1] < identity)
  );
}

function validTitlePair(left, right) {
  return left.sha256 !== right.sha256 || (
    left.codePointLength === right.codePointLength &&
    left.utf8Bytes === right.utf8Bytes
  );
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function classifySettlementTerminal(settlement) {
  const outcome = settlement?.outcome ?? "unknown";
  const firstUnsupported = Array.isArray(settlement?.unsupportedWork)
    ? settlement.unsupportedWork[0]
    : undefined;
  const firstTerminal = {
    kind: "settlement",
    outcome,
    ...(settlement?.failureCode === undefined ? {} : { failureCode: settlement.failureCode }),
    ...(settlement?.limitKind === undefined ? {} : { limitKind: settlement.limitKind }),
    ...(firstUnsupported === undefined ? {} : { unsupportedWork: firstUnsupported }),
  };
  if (outcome === "runtime_error") {
    return organic(
      "ENGINE_BUG",
      settlement?.failureCode ?? "runtime_error",
      "engine_correctness",
      firstTerminal,
      "typed",
    );
  }
  if (outcome === "unsupported_work") {
    const reason = firstUnsupported?.reason ?? settlement?.failureCode ?? "unsupported_work";
    const family = blockerFamilyFor(reason, firstUnsupported?.kind, firstUnsupported?.timeSurface);
    if (["unknown", "navigation_unknown"].includes(family)) {
      return unconfirmedOrganic("PROFILE_UNSUPPORTED", reason, family, firstTerminal);
    }
    return organic(
      "PROFILE_UNSUPPORTED",
      reason,
      family,
      firstTerminal,
      firstUnsupported === undefined ? "typed" : "source_diagnosed",
    );
  }
  if (outcome === "blocked_on_external_io") {
    return organic("PROFILE_UNSUPPORTED", outcome, "external_io", firstTerminal, "typed");
  }
  if (outcome === "blocked_on_open_ended_work") {
    return organic("PROFILE_UNSUPPORTED", outcome, "open_ended_source", firstTerminal, "typed");
  }
  if (outcome.endsWith("_limit_exceeded")) {
    return organic(
      "PROFILE_UNSUPPORTED",
      outcome,
      limitFamily(settlement?.limitKind, outcome),
      firstTerminal,
      "typed",
    );
  }
  return unknownDiagnosis("unknown_settlement_terminal", firstTerminal);
}

function classifyStasisError(error) {
  const code = error?.code ?? "unclassified";
  const firstTerminal = { kind: "error", code, name: error?.name ?? "unknown" };
  if (code.startsWith("unsupported_") || code === "unsupported_work") {
    const family = blockerFamilyFor(code);
    return family === "unknown"
      ? unconfirmedOrganic("PROFILE_UNSUPPORTED", code, family, firstTerminal)
      : organic("PROFILE_UNSUPPORTED", code, family, firstTerminal, "typed");
  }
  if (code === "cross_event_loop_navigation") {
    return organic("PROFILE_UNSUPPORTED", code, "browsing_context_tree", firstTerminal, "source_diagnosed");
  }
  if (["navigation_authority_changed", "session_navigation_authority_unavailable"].includes(code)) {
    return unconfirmedOrganic("PROFILE_UNSUPPORTED", code, "navigation_unknown", firstTerminal);
  }
  if ([
    "command_timeout",
    "navigation_failed",
    "navigation_transport_failure",
    "engine_session_navigation_failed",
    "wall_time_limit_exceeded",
  ].includes(code)) {
    return unconfirmedOrganic("WEB_COMPAT_BUG", code, "web_compat_or_site_drift", firstTerminal);
  }
  if ([
    "automation_match_limit_exceeded",
    "automation_output_limit_exceeded",
    "request_frame_too_large",
  ].includes(code)) {
    return organic("PROFILE_UNSUPPORTED", code, "extraction_limit", firstTerminal, "typed");
  }
  return unknownDiagnosis(code, firstTerminal);
}

function compareExtraction(baseline, stasis) {
  const leftTitle = typeof baseline?.titleIdentity?.sha256 === "string"
    ? baseline.titleIdentity.sha256
    : "";
  const rightTitle = typeof stasis?.titleIdentity?.sha256 === "string"
    ? stasis.titleIdentity.sha256
    : "";
  const leftLinks = Array.isArray(baseline?.linkIdentities) ? baseline.linkIdentities : [];
  const rightLinks = Array.isArray(stasis?.linkIdentities) ? stasis.linkIdentities : [];
  const leftSet = new Set(leftLinks);
  const rightSet = new Set(rightLinks);
  const union = new Set([...leftSet, ...rightSet]);
  let intersection = 0;
  for (const link of leftSet) if (rightSet.has(link)) intersection += 1;
  const titleEqual = leftTitle === rightTitle;
  const linksEqual = arraysEqual(leftLinks, rightLinks);
  return {
    outcome: titleEqual && linksEqual ? "equivalent" : "divergent",
    titleEqual,
    linksEqual,
    baselineLinkCount: leftLinks.length,
    stasisLinkCount: rightLinks.length,
    linkIntersection: intersection,
    linkUnion: union.size,
    linkJaccard: union.size === 0 ? 1 : intersection / union.size,
  };
}

function blockerFamilyFor(reason, kind, timeSurface) {
  const value = `${reason ?? ""}|${kind ?? ""}`;
  if (reason === "unsupported_rendering") return "rendering_unknown";
  if (["navigation_authority_changed", "session_navigation_authority_unavailable"].includes(reason)) {
    return "navigation_unknown";
  }
  if (
    reason === "cross_event_loop_document" ||
    [
      "same_event_loop_iframe",
      "cross_event_loop_iframe",
      "cross_event_loop_navigation",
    ].includes(timeSurface)
  ) {
    return "browsing_context_tree";
  }
  if (/service_worker|worker|worklet/iu.test(value)) return "worker";
  if (/storage|cookie/iu.test(value)) return "storage";
  if (/render|image|font|canvas|graphics|animation/iu.test(value)) return "rendering";
  if (/message_port/iu.test(value)) return "message_port";
  if (/web_socket|event_source|broadcast_channel|external_subscription|open_ended/iu.test(value)) {
    return "open_ended_source";
  }
  if (/parser/iu.test(value)) return "parser";
  if (/time_surface|clock|timer/iu.test(value)) return "time_surface";
  if (/selector|extract|automation|frame_too_large/iu.test(value)) return "extraction_limit";
  if (/network|external_io/iu.test(value)) return "external_io";
  if (/task|callback/iu.test(value)) return "task_source";
  return "unknown";
}

function limitFamily(_kind, _outcome) {
  return "execution_limit";
}

function excluded(primary, reason, code) {
  return {
    primary,
    reason,
    exposure: "organic_primary",
    diagnosisConfidence: "typed",
    excludedCode: code,
    eligibleForOrganicBlockerCensus: false,
    firstTerminal: {
      kind: "excluded",
      phase: reason,
      code,
      typedSurface: "baseline_or_gate",
    },
    censoredAfterFirstTerminal: true,
    rootClusterId: clusterId(primary, "baseline_or_gate", code),
    blockerFamily: null,
    sdkGaps: [],
    extraction: null,
  };
}

function invalid(reason) {
  return {
    primary: "BENCHMARK_INVALID",
    reason,
    exposure: "organic_primary",
    diagnosisConfidence: "unknown",
    eligibleForOrganicBlockerCensus: false,
    firstTerminal: {
      kind: "harness",
      phase: "harness",
      code: reason,
      typedSurface: "unknown",
    },
    censoredAfterFirstTerminal: true,
    rootClusterId: clusterId("BENCHMARK_INVALID", "unknown", reason),
    blockerFamily: null,
    sdkGaps: [],
    extraction: null,
  };
}

function organic(primary, reason, blockerFamily, firstTerminal, diagnosisConfidence) {
  const normalizedTerminal = {
    ...firstTerminal,
    phase: firstTerminal.kind === "settlement" ? "settlement" : "stasis_operation",
    code: firstTerminal.failureCode ?? firstTerminal.code ?? firstTerminal.outcome ?? reason,
    typedSurface:
      firstTerminal.unsupportedWork?.timeSurface ??
      firstTerminal.unsupportedWork?.kind ??
      blockerFamily,
  };
  return {
    primary,
    reason,
    exposure: "organic_primary",
    diagnosisConfidence,
    eligibleForOrganicBlockerCensus: true,
    firstTerminal: normalizedTerminal,
    censoredAfterFirstTerminal: true,
    rootClusterId: terminalClusterId(primary, blockerFamily, reason, normalizedTerminal),
    blockerFamily,
    sdkGaps: [],
    extraction: null,
  };
}

function unconfirmedOrganic(primary, reason, blockerFamily, firstTerminal) {
  const normalizedTerminal = {
    ...firstTerminal,
    phase: firstTerminal.kind === "settlement" ? "settlement" : "stasis_operation",
    code: firstTerminal.failureCode ?? firstTerminal.code ?? firstTerminal.outcome ?? reason,
    typedSurface: blockerFamily,
  };
  return {
    primary,
    reason,
    exposure: "organic_primary",
    diagnosisConfidence: "unknown",
    eligibleForOrganicBlockerCensus: false,
    firstTerminal: normalizedTerminal,
    censoredAfterFirstTerminal: true,
    rootClusterId: terminalClusterId(primary, blockerFamily, reason, normalizedTerminal),
    blockerFamily,
    sdkGaps: [],
    extraction: null,
  };
}

function unknownDiagnosis(reason, firstTerminal) {
  return {
    primary: "BENCHMARK_INVALID",
    reason,
    exposure: "organic_primary",
    diagnosisConfidence: "unknown",
    eligibleForOrganicBlockerCensus: false,
    firstTerminal: {
      ...firstTerminal,
      phase: firstTerminal.kind === "settlement" ? "settlement" : "stasis_operation",
      code: firstTerminal.code ?? firstTerminal.outcome ?? reason,
      typedSurface: "unknown",
    },
    censoredAfterFirstTerminal: true,
    rootClusterId: clusterId("BENCHMARK_INVALID", "unknown", reason),
    blockerFamily: null,
    sdkGaps: [],
    extraction: null,
  };
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function clusterId(primary, family, reason) {
  return `${primary}:${family}:${reason}`.toLowerCase().replace(/[^a-z0-9:_-]+/gu, "_");
}

function terminalClusterId(primary, family, reason, terminal) {
  return clusterId(
    primary,
    `${family}:${terminal.phase}:${terminal.code}:${terminal.typedSurface}`,
    reason,
  );
}

function requestedOriginIdentity(value) {
  try {
    return publicHttpUrlIdentity(new URL(new URL(value).origin).href);
  } catch {
    return null;
  }
}
