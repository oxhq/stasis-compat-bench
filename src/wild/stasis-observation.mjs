import { candidate, settlePolicy, stasisLimits } from "./config.mjs";
import {
  normalizeLinkIdentitySet,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "./normalize.mjs";
import { stasisLiveNetworkPolicy } from "./stasis-network.mjs";
import { loadVerifiedCandidateV03Sdk } from "../shared/candidate-v03.mjs";
import { serializeError, sha256File } from "../shared/io.mjs";

const crawlableOutcomes = new Set(["quiescent", "quiescent_with_persistent_work"]);
const supplementalStasisErrorCodes = new Set(["runtime_close_failed", "session_close_failed"]);
const auditPageLimit = 64;
const auditRecordLimit = 256;

const titlePlan = Object.freeze({
  rootSelector: "title",
  fields: Object.freeze([{ name: "title", selector: "", read: "text" }]),
});

const linkPlan = Object.freeze({
  rootSelector: "a[href]",
  fields: Object.freeze([
    { name: "href", selector: "", read: "resolved_url", attribute: "href" },
  ]),
});

export async function assertHostedCandidate(executablePath, dependencies = {}) {
  if (typeof executablePath !== "string" || executablePath.length === 0) {
    throw new TypeError("STASIS_EXECUTABLE must name the frozen hosted candidate");
  }
  const hashExecutable = dependencies.hashExecutable ?? sha256File;
  if (typeof hashExecutable !== "function") {
    throw new TypeError("hashExecutable must be a function");
  }
  const actual = await hashExecutable(executablePath);
  if (actual !== candidate.executableSha256) {
    throw new TypeError(
      `Hosted Stasis executable mismatch: expected ${candidate.executableSha256}, got ${actual}`,
    );
  }
  return actual;
}

export async function runStasisObservation(entry, executablePath, dependencies = {}) {
  validateEntry(entry);
  const startedAt = process.hrtime.bigint();
  const executableSha256 = await assertHostedCandidate(executablePath, {
    hashExecutable: dependencies.hashExecutable,
  });
  const launchRuntime = dependencies.launchRuntime ?? (await loadVerifiedCandidateV03Sdk()).launch;
  let runtime = null;
  let session = null;
  let openCommittedUrlIdentity;
  let outcome;

  try {
    runtime = await launchRuntime({
      executablePath,
      commandTimeoutMs: stasisLimits.commandTimeoutMs,
    });
    const signal = AbortSignal.timeout(stasisLimits.workloadTimeoutMs);
    session = await runtime.openSession(entry.requestedUrl, {
      profile: candidate.profile,
      network: stasisLiveNetworkPolicy(),
      signal,
    });
    openCommittedUrlIdentity = publicHttpUrlIdentity(session.url);
    const settled = await session.settle(session.stateToken, settlePolicy, { signal });
    const settlement = projectSettlement(settled);
    const audit = await readCompleteAudit(session, signal);
    const policyRejection = projectPolicyRejection(audit);

    if (!audit.complete) {
      outcome = observation("policy_or_safety_rejected", {
        code: "stasis_audit_incomplete",
        requestedUrl: entry.requestedUrl,
        openCommittedUrlIdentity,
        currentUrlObservable: false,
        settlement,
        audit,
      });
    } else if (policyRejection !== null) {
      outcome = observation("policy_or_safety_rejected", {
        code: policyRejection.code,
        requestedUrl: entry.requestedUrl,
        openCommittedUrlIdentity,
        currentUrlObservable: false,
        settlement,
        audit,
        policyRejection,
      });
    } else if (!crawlableOutcomes.has(settled.outcome)) {
      outcome = observation("settlement_terminal", {
        requestedUrl: entry.requestedUrl,
        openCommittedUrlIdentity,
        currentUrlObservable: false,
        settlement,
        audit,
      });
    } else {
      const titleResult = await session.extract(titlePlan, settled.stateToken, { signal });
      const linkResult = await session.extract(linkPlan, titleResult.stateToken, { signal });
      const rawTitle = titleResult.rows[0]?.fields.find(({ name }) => name === "title")?.value ?? "";
      const rawLinks = linkResult.rows.flatMap(({ fields }) => {
        const value = fields.find(({ name }) => name === "href")?.value;
        return typeof value === "string" ? [value] : [];
      });

      outcome = observation("success", {
        code: "extracted",
        requestedUrl: entry.requestedUrl,
        // Session.url is the owner-attested URL returned by openSession. The
        // frozen 0.3 SDK exposes no post-settlement current/final URL.
        openCommittedUrlIdentity,
        currentUrlObservable: false,
        settlement,
        audit,
        extraction: {
          titleIdentity: normalizeTitleIdentity(rawTitle),
          // resolved_url values must stand on their own. Rebasing a relative
          // value against openCommittedUrlIdentity would invent a current-URL claim.
          linkIdentities: normalizeLinkIdentitySet(rawLinks),
        },
      });
    }
  } catch (error) {
    outcome = observation("error", {
      code: "stasis_operation_failed",
      requestedUrl: entry.requestedUrl,
      ...(openCommittedUrlIdentity === undefined ? {} : { openCommittedUrlIdentity }),
      ...(session === null ? {} : { currentUrlObservable: false }),
      error: projectStasisError(error),
    });
  }

  const cleanup = await closeOwnedProcess(session, runtime, outcome.status !== "error");
  if (cleanup.status === "failed" && outcome.status === "success") {
    return terminal("error", {
      code: "stasis_cleanup_failed",
      requestedUrl: entry.requestedUrl,
      candidateExecutableSha256: executableSha256,
      ...(openCommittedUrlIdentity === undefined ? {} : { openCommittedUrlIdentity }),
      ...(session === null ? {} : { currentUrlObservable: false }),
      priorTerminal: {
        status: outcome.status,
        ...(typeof outcome.details.code === "string" ? { code: outcome.details.code } : {}),
      },
      error: cleanupFailureError(),
      cleanup,
    }, startedAt);
  }
  return terminal(outcome.status, {
    candidateExecutableSha256: executableSha256,
    ...outcome.details,
    cleanup,
  }, startedAt);
}

export function projectSettlement(result) {
  const unsupported = Array.isArray(result?.unsupportedWork) ? result.unsupportedWork : [];
  const persistent = Array.isArray(result?.persistentWork) ? result.persistentWork : [];
  return {
    outcome: safeString(result?.outcome, 64, "unknown"),
    ...(typeof result?.failure?.code === "string"
      ? { failureCode: safeString(result.failure.code, 128, "invalid") }
      : {}),
    ...(typeof result?.limit?.kind === "string"
      ? { limitKind: safeString(result.limit.kind, 64, "invalid") }
      : {}),
    unsupportedWork: unsupported.slice(0, 32).map((item) => ({
      kind: safeString(item?.kind, 64, "other"),
      count: integerString(item?.count),
      reason: safeString(item?.reason, 128, "unknown"),
      ...(typeof item?.timeSurface === "string"
        ? { timeSurface: safeString(item.timeSurface, 128, "unknown") }
        : {}),
    })),
    unsupportedWorkOmitted: Math.max(0, unsupported.length - 32),
    persistentWork: persistent.slice(0, 32).map((item) => ({
      kind: safeString(item?.kind, 64, "other"),
      count: integerString(item?.count),
      reason: safeString(item?.reason, 128, "unknown"),
    })),
    persistentWorkOmitted: Math.max(0, persistent.length - 32),
    externalIoCount: Array.isArray(result?.externalIo) ? result.externalIo.length : 0,
    processed: {
      controlTurns: integerString(result?.processed?.controlTurns),
      tasks: integerString(result?.processed?.tasks),
      microtasks: integerString(result?.processed?.microtasks),
      renderingOpportunities: integerString(result?.processed?.renderingOpportunities),
      mutations: integerString(result?.processed?.mutations),
    },
  };
}

export function projectStasisError(error) {
  const code = typeof error?.code === "string" && isAllowedStasisErrorCode(error.code)
    ? error.code
    : "unclassified_error";
  return {
    name: safeErrorName(error?.name),
    code,
    ...(typeof error?.fatal === "boolean" ? { fatal: error.fatal } : {}),
    ...(typeof error?.stateEffect === "string"
      ? { stateEffect: safeString(error.stateEffect, 32, "unknown") }
      : {}),
    messageOmitted: typeof error?.message === "string" && error.message.length > 0,
    stderrTailOmitted: typeof error?.stderrTail === "string" && error.stderrTail.length > 0,
    stderrTailBytes: typeof error?.stderrTail === "string" ? Buffer.byteLength(error.stderrTail) : 0,
  };
}

function isAllowedStasisErrorCode(value) {
  if (supplementalStasisErrorCodes.has(value)) return true;
  return serializeError({ name: "Error", code: value }).code === value;
}

async function readCompleteAudit(session, signal) {
  const requests = await readAuditKind(session, "requests", signal);
  const evidence = await readAuditKind(session, "evidence", signal);
  return {
    complete: requests.complete && evidence.complete,
    requests: requests.records,
    evidence: evidence.records,
    requestRecordsOmitted: requests.omitted,
    evidenceRecordsOmitted: evidence.omitted,
  };
}

async function readAuditKind(session, method, signal) {
  const records = [];
  let omitted = 0;
  let afterSeq;
  let allPagesComplete = true;
  for (let pageNumber = 0; pageNumber < auditPageLimit; pageNumber += 1) {
    const page = await session[method]({
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: auditRecordLimit,
      signal,
    });
    allPagesComplete &&= page.complete === true;
    for (const record of page.records) {
      if (records.length < 2048) records.push(projectAuditRecord(method, record));
      else omitted += 1;
    }
    if (!page.hasMore) {
      return { complete: allPagesComplete && omitted === 0, records, omitted };
    }
    if (page.nextAfterSeq === undefined || page.nextAfterSeq === afterSeq) {
      throw new Error(`${method} audit pagination stalled`);
    }
    afterSeq = page.nextAfterSeq;
  }
  throw new Error(`${method} audit pagination exceeded ${auditPageLimit} pages`);
}

function projectAuditRecord(method, record) {
  if (method === "requests") {
    return {
      method: safeString(record?.method, 16, "UNKNOWN"),
    };
  }
  if (record?.kind === "route_decided") {
    return {
      kind: "route_decided",
      decision: safeString(record?.decision, 32, "unknown"),
    };
  }
  return { kind: safeString(record?.kind, 64, "other") };
}

function projectPolicyRejection(audit) {
  const nonReadOnlyCount = audit.requests.filter((record) => record.method !== "GET").length;
  if (nonReadOnlyCount > 0) {
    return { code: "non_read_only_request", requestCount: nonReadOnlyCount };
  }
  const aborts = audit.evidence.filter(
    (record) => record.kind === "route_decided" && record.decision === "fixture_abort",
  );
  if (aborts.length === 0) return null;
  return { code: "literal_private_target_aborted", abortCount: aborts.length };
}

async function closeOwnedProcess(session, runtime, graceful) {
  if (session === null && runtime === null) {
    return { status: "not_required", mode: "not_started" };
  }
  if (session !== null && graceful) {
    try {
      await session.close({ timeoutMs: 5_000 });
      return { status: "passed", mode: "graceful_session_close" };
    } catch (error) {
      const gracefulCloseError = projectStasisError(error);
      try {
        await runtime.close();
        return {
          status: "passed",
          mode: "fail_stop_runtime_close",
          gracefulCloseError,
        };
      } catch (failStopError) {
        return {
          status: "failed",
          mode: "fail_stop_runtime_close",
          gracefulCloseError,
          failStopError: projectStasisError(failStopError),
        };
      }
    }
  }
  try {
    await runtime.close();
    return { status: "passed", mode: "fail_stop_runtime_close" };
  } catch (error) {
    return {
      status: "failed",
      mode: "fail_stop_runtime_close",
      failStopError: projectStasisError(error),
    };
  }
}

function cleanupFailureError() {
  return {
    name: "StasisObservationError",
    code: "stasis_cleanup_failed",
    messageOmitted: true,
    stderrTailOmitted: true,
    stderrTailBytes: 0,
  };
}

function observation(status, details) {
  return { status, details };
}

function terminal(status, details, startedAt) {
  return {
    status,
    ...details,
    wallTimeMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
  };
}

function integerString(value) {
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^-?[0-9]+$/u.test(value)) return value;
  return "invalid";
}

function safeString(value, maximum, fallback) {
  return typeof value === "string" && value.length <= maximum ? value : fallback;
}

function safeErrorName(value) {
  return [
    "StasisAbortError",
    "StasisCommandTimeoutError",
    "StasisProcessError",
    "StasisProtocolError",
    "StasisStateError",
    "StasisTransportError",
  ].includes(value) ? value : "StasisObservationError";
}

function validateEntry(entry) {
  if (
    typeof entry !== "object" ||
    entry === null ||
    !Number.isSafeInteger(entry.rank) ||
    typeof entry.stratumId !== "string" ||
    typeof entry.requestedUrl !== "string"
  ) {
    throw new TypeError("Invalid wild-corpus entry");
  }
}
