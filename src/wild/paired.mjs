import {
  projectHarnessError,
  runBaselinePreflightObservation,
} from "./baseline-preflight.mjs";
import { classifyWildCase, aggregateWildClassifications } from "./classification.mjs";
import { inspectPublicHttpUrl, projectPublicTargetError } from "./public-target.mjs";
import { checkRobotsPermission, isExactAllowedRobotsDecision } from "./robots.mjs";
import { runStasisObservation } from "./stasis-observation.mjs";

const robotsGateReasons = new Set([
  "robots_allowed",
  "robots_body_failed",
  "robots_disallowed",
  "robots_fetch_failed",
  "robots_http_status",
  "robots_invalid_redirect",
  "robots_not_found",
  "robots_redirect_limit",
  "robots_redirect_without_location",
  "robots_target_rejected",
  "robots_timeout",
  "robots_too_large",
]);

export async function runPairedCases(
  entries,
  {
    executablePath,
    inspect = inspectPublicHttpUrl,
    robots = checkRobotsPermission,
    baseline = runBaselinePreflightObservation,
    stasis = runStasisObservation,
    persistCase = async () => undefined,
  },
) {
  if (!Array.isArray(entries)) throw new TypeError("Frozen wild entries must be an array");
  const completed = [];
  for (const entry of entries) {
    const baselineGate = await runAdjacentGate(entry, { inspect, robots });
    const baselineObservation = baselineGate.status === "allowed"
      ? await callBaseline(baseline, entry, inspect)
      : notRun("baseline_gate_not_allowed");

    let stasisGate;
    let stasisObservation;
    if (baselineObservation.status !== "success") {
      stasisGate = notRun("baseline_not_eligible");
      stasisObservation = notRun("baseline_not_eligible");
    } else {
      // Repeat both gates immediately before the native process starts. The
      // second check is not reused from baseline admission.
      stasisGate = await runAdjacentGate(entry, { inspect, robots });
      stasisObservation = stasisGate.status === "allowed"
        ? await callStasis(stasis, entry, executablePath)
        : notRun("stasis_gate_not_allowed");
    }

    const classification = classifyWildCase({
      entry,
      baselineGate,
      baseline: baselineObservation,
      stasisGate,
      stasis: stasisObservation,
    });
    const item = {
      entry,
      baselineGate,
      baseline: baselineObservation,
      stasisGate,
      stasis: stasisObservation,
      classification,
    };
    const artifactRecord = await persistCase(item);
    completed.push({ ...item, ...(artifactRecord === undefined ? {} : { artifactRecord }) });
  }
  return {
    cases: completed,
    summary: aggregateWildClassifications(completed),
  };
}

export async function runAdjacentGate(
  entry,
  { inspect = inspectPublicHttpUrl, robots = checkRobotsPermission } = {},
) {
  let root;
  try {
    root = await inspect(entry.requestedUrl, { requireHttps: true });
  } catch (error) {
    return {
      status: "rejected",
      code: "public_target_rejected",
      detail: projectPublicTargetError(error),
    };
  }
  let robotsResult;
  try {
    robotsResult = await robots(entry.requestedUrl, { inspect });
  } catch (error) {
    return {
      status: "harness_error",
      code: "robots_gate_threw",
      error: projectHarnessError(error),
      root: projectRoot(root),
    };
  }
  if (robotsResult?.status === "allowed" && !isExactAllowedRobotsDecision(robotsResult)) {
    return {
      status: "harness_error",
      code: "robots_gate_invalid",
      root: projectRoot(root),
    };
  }
  if (robotsResult.status !== "allowed") {
    return {
      status: "rejected",
      code: projectRobotsGateReason(robotsResult.reason),
      robots: projectRobots(robotsResult),
      root: projectRoot(root),
    };
  }
  return {
    status: "allowed",
    code: "eligible",
    robots: projectRobots(robotsResult),
    root: projectRoot(root),
  };
}

async function callBaseline(baseline, entry, inspect) {
  try {
    return await baseline(entry, { inspect });
  } catch (error) {
    return {
      status: "harness_error",
      code: "baseline_observer_threw",
      requestedUrl: entry.requestedUrl,
      error: projectHarnessError(error),
    };
  }
}

async function callStasis(stasis, entry, executablePath) {
  try {
    return await stasis(entry, executablePath);
  } catch (error) {
    return {
      status: "harness_error",
      code: "stasis_observer_threw",
      requestedUrl: entry.requestedUrl,
      error: projectHarnessError(error),
    };
  }
}

function projectRoot(value) {
  return {
    addressCount: value.addressCount,
    families: value.families,
  };
}

function projectRobots(value) {
  return {
    status: value.status,
    reason: projectRobotsGateReason(value.reason),
    redirectCount: value.redirectCount,
  };
}

export function projectRobotsGateReason(value) {
  return robotsGateReasons.has(value) ? value : "unclassified_error";
}

function notRun(code) {
  return { status: "not_run", code };
}
