import {
  normalizeLinkIdentitySet,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "../wild/normalize.mjs";
import { stasisLiveNetworkPolicy } from "../wild/stasis-network.mjs";
import { settlePolicy, stasisLimits } from "../wild/config.mjs";
import { projectSettlement, projectStasisError } from "../wild/stasis-observation.mjs";
import {
  assertCandidateIdentity,
  postSupportExecutablePath,
  postSupportProfile,
} from "./candidate-identity.mjs";

const crawlableOutcomes = new Set(["quiescent", "quiescent_with_persistent_work"]);
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

export async function runPostSupportWildObservation(entry, verifiedCandidate, dependencies = {}) {
  validateEntry(entry);
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const executablePath = postSupportExecutablePath(verifiedCandidate);
  const launch = dependencies.launch ?? verifiedCandidate.sdk.launch;
  const startedAt = process.hrtime.bigint();
  let runtime = null;
  let session = null;
  let openCommittedUrlIdentity;
  let currentUrlIdentity;
  let outcome;
  try {
    runtime = await launch({ executablePath, commandTimeoutMs: stasisLimits.commandTimeoutMs });
    const signal = (dependencies.timeoutSignal ?? AbortSignal.timeout)(stasisLimits.workloadTimeoutMs);
    session = await runtime.openSession(entry.requestedUrl, {
      profile: postSupportProfile,
      network: stasisLiveNetworkPolicy(),
      signal,
    });
    openCommittedUrlIdentity = publicHttpUrlIdentity(session.url);
    const settled = await session.settle(session.stateToken, settlePolicy, { signal });
    currentUrlIdentity = publicHttpUrlIdentity(settled.url);
    const settlement = projectSettlement(settled);
    const audit = await readCompleteAudit(session, signal);
    const policyRejection = projectPolicyRejection(audit);
    if (!audit.complete) {
      outcome = observation("policy_or_safety_rejected", {
        code: "stasis_audit_incomplete",
        requestedUrl: entry.requestedUrl,
        openCommittedUrlIdentity,
        ...projectCurrentUrlIdentity(currentUrlIdentity),
        settlement,
        audit,
      });
    } else if (policyRejection !== null) {
      outcome = observation("policy_or_safety_rejected", {
        code: policyRejection.code,
        requestedUrl: entry.requestedUrl,
        openCommittedUrlIdentity,
        ...projectCurrentUrlIdentity(currentUrlIdentity),
        settlement,
        audit,
        policyRejection,
      });
    } else if (!crawlableOutcomes.has(settled.outcome)) {
      outcome = observation("settlement_terminal", {
        requestedUrl: entry.requestedUrl,
        openCommittedUrlIdentity,
        ...projectCurrentUrlIdentity(currentUrlIdentity),
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
        openCommittedUrlIdentity,
        ...projectCurrentUrlIdentity(currentUrlIdentity),
        settlement,
        audit,
        extraction: {
          titleIdentity: normalizeTitleIdentity(rawTitle),
          linkIdentities: normalizeLinkIdentitySet(rawLinks),
        },
      });
    }
  } catch (error) {
    outcome = observation("error", {
      code: "stasis_operation_failed",
      requestedUrl: entry.requestedUrl,
      ...(openCommittedUrlIdentity === undefined ? {} : { openCommittedUrlIdentity }),
      ...(session === null ? {} : projectCurrentUrlIdentity(currentUrlIdentity)),
      error: projectStasisError(error),
    });
  }
  const cleanup = await closeOwnedProcess(session, runtime, outcome.status !== "error");
  if (cleanup.status === "failed" && outcome.status === "success") {
    return terminal("error", {
      code: "stasis_cleanup_failed",
      requestedUrl: entry.requestedUrl,
      candidateExecutableSha256: identity.windows.executable.sha256,
      ...(openCommittedUrlIdentity === undefined ? {} : { openCommittedUrlIdentity }),
      ...(session === null ? {} : projectCurrentUrlIdentity(currentUrlIdentity)),
      priorTerminal: { status: outcome.status, code: outcome.details.code },
      error: cleanupFailureError(),
      cleanup,
    }, startedAt);
  }
  return terminal(outcome.status, {
    candidateExecutableSha256: identity.windows.executable.sha256,
    ...outcome.details,
    cleanup,
  }, startedAt);
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
  if (method === "requests") return { method: safeString(record?.method, 16, "UNKNOWN") };
  if (record?.kind === "route_decided") {
    return { kind: "route_decided", decision: safeString(record?.decision, 32, "unknown") };
  }
  return { kind: safeString(record?.kind, 64, "other") };
}

function projectPolicyRejection(audit) {
  const nonReadOnlyCount = audit.requests.filter((record) => record.method !== "GET").length;
  if (nonReadOnlyCount > 0) return { code: "non_read_only_request", requestCount: nonReadOnlyCount };
  const abortCount = audit.evidence.filter(
    (record) => record.kind === "route_decided" && record.decision === "fixture_abort",
  ).length;
  return abortCount === 0 ? null : { code: "literal_private_target_aborted", abortCount };
}

async function closeOwnedProcess(session, runtime, graceful) {
  if (session === null && runtime === null) return { status: "not_required", mode: "not_started" };
  if (session !== null && graceful) {
    try {
      await session.close({ timeoutMs: 5_000 });
      return { status: "passed", mode: "graceful_session_close" };
    } catch (error) {
      const gracefulCloseError = projectStasisError(error);
      try {
        await runtime.close();
        return { status: "passed", mode: "fail_stop_runtime_close", gracefulCloseError };
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

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile ||
    typeof value?.sdk?.launch !== "function"
  ) {
    throw new TypeError("Wild lane requires one verified post-support candidate");
  }
  return identity;
}

function validateEntry(entry) {
  if (
    typeof entry !== "object" || entry === null ||
    !Number.isSafeInteger(entry.rank) ||
    typeof entry.stratumId !== "string" ||
    typeof entry.requestedUrl !== "string"
  ) throw new TypeError("Invalid wild-corpus entry");
}

function safeString(value, maximum, fallback) {
  return typeof value === "string" && value.length <= maximum ? value : fallback;
}

function observation(status, details) {
  return { status, details };
}

function projectCurrentUrlIdentity(currentUrlIdentity) {
  return currentUrlIdentity === undefined
    ? { currentUrlObservable: false }
    : { currentUrlObservable: true, currentUrlIdentity };
}

function terminal(status, details, startedAt) {
  return { status, ...details, wallTimeMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000 };
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
