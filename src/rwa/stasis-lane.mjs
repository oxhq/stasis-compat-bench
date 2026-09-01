import { createHash } from "node:crypto";

import { launch } from "@oxhq/stasis";

import { rwaAuthCases, rwaAuthSource } from "./cases.mjs";
import { monotonicMilliseconds, serializeError, sha256File } from "../shared/io.mjs";

export const expectedStasisExecutableSha256 =
  "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d";
export const expectedNodeVersion = "v22.20.0";

const acceptedSettleOutcomes = new Set(["quiescent", "quiescent_with_persistent_work"]);
const settleOutcomes = new Set([
  "blocked_on_external_io",
  "blocked_on_open_ended_work",
  "control_turn_limit_exceeded",
  "microtask_limit_exceeded",
  "mutation_limit_exceeded",
  "quiescent",
  "quiescent_with_persistent_work",
  "rendering_limit_exceeded",
  "runtime_error",
  "task_limit_exceeded",
  "unsupported_work",
  "virtual_time_limit_exceeded",
]);
const settleFailureCodes = new Set([
  "clock_identity_changed",
  "clock_not_controlled",
  "execution_counter_overflow",
  "inconsistent_pending_evidence",
  "ineligible_logical_timer_head",
  "mismatched_advance_authority",
  "missing_advance_authority",
  "missing_finite_scheduler_head",
  "quiet_checkpoint_did_not_advance",
  "runtime_terminals",
  "unclassified_scheduler_head",
  "unsupported_clock_surface",
  "unsupported_open_ended_source",
  "unsupported_rendering",
  "unsupported_retained_tasks",
  "unsupported_source",
  "virtual_time_regressed",
  "web_view_identity_changed",
]);
export const rwaUnsupportedWorkRetentionLimit = 32;
export const rwaUnsupportedWorkKinds = Object.freeze([
  "task",
  "microtask",
  "timer",
  "animation_frame",
  "animation",
  "network",
  "parser",
  "rendering_update",
  "tracked_presence",
  "other",
]);
export const rwaUnsupportedWorkReasons = Object.freeze([
  "time_surface",
  "unclassified_timer",
  "unclassified_animation",
  "animated_image",
  "web_socket",
  "event_source",
  "broadcast_channel",
  "message_port",
  "embedder_control",
  "media_session_action_handler",
  "storage_event_listener",
  "clock_not_controlled",
  "canvas_upload",
  "render_blocking_element",
  "font_load",
  "image_load",
  "inactive_rendering",
  "throttled_rendering",
  "ineligible_logical_timer",
  "throttled_task",
  "inactive_task",
  "cross_event_loop_document",
  "worker",
  "worklet",
  "media_element",
  "graphics_source",
  "storage_backend",
  "service_worker",
  "external_subscription",
  "untracked_callback",
  "script_created_parser_input",
  "suspended_parser",
]);
export const rwaUnsupportedTimeSurfaces = Object.freeze([
  "window_timers",
  "same_event_loop_iframe",
  "java_script_date",
  "performance",
  "host_timestamp",
  "update_rendering",
  "animation_frame",
  "document_timeline",
  "worker",
  "worklet",
  "cross_event_loop_iframe",
  "cross_event_loop_navigation",
  "auxiliary_web_view",
  "resource_thread_io",
  "external_subscription",
  "native_media",
  "embedder_control",
  "history_traversal",
]);
const unsupportedWorkKindSet = new Set(rwaUnsupportedWorkKinds);
const unsupportedWorkReasonSet = new Set(rwaUnsupportedWorkReasons);
const unsupportedTimeSurfaceSet = new Set(rwaUnsupportedTimeSurfaces);
const maximumU128 = (1n << 128n) - 1n;
const rwaFinalPathProjectionAllowlist = new Set(
  rwaAuthCases.flatMap(({ stasisActions, oracles }) => [
    ...stasisActions
      .filter(({ op }) => op === "openSession")
      .map(({ path }) => path),
    ...oracles
      .filter(({ kind }) =>
        kind === "controlled-open-final-url" || kind === "controlled-settle-final-url")
      .map(({ expected }) => expected),
  ]),
);
const auditHardBounds = Object.freeze({
  maxRecords: 4_096,
  maxMetadataBytes: 8 * 1024 * 1024,
  maxPageItems: 1_024,
});
const passingClassifications = new Set(["PASS_EQUIVALENT", "PASS_WITH_SEMANTIC_DIFFERENCE"]);
const preRegisteredBoundaryCatalog = Object.freeze({
  "current-path-sdk-gap": {
    classification: "SDK_GAP",
    typedSurface: "current_top_level_url",
    code: "current_top_level_path_unobservable",
  },
  "persistent-cookie-profile-gap": {
    classification: "PROFILE_UNSUPPORTED",
    typedSurface: "storage",
    code: "unsupported_persistent_cookie",
  },
  "visibility-reduced-to-semantic-dom": {
    classification: "PASS_WITH_SEMANTIC_DIFFERENCE",
    typedSurface: "visibility",
    code: "semantic_dom_oracle_only",
  },
});

export const rwaSettlePolicy = Object.freeze({
  persistentWork: "report",
  maxVirtualTimeNs: 30_000_000_000n,
  maxControlTurns: 100_000n,
  wallIoTimeoutNs: 15_000_000_000n,
});

export async function runStasisRwaProof(executablePath, options = {}) {
  if (typeof executablePath !== "string" || executablePath.length === 0) {
    throw new TypeError("A frozen STASIS_EXECUTABLE is required");
  }

  const appOrigin = canonicalOrigin(options.appOrigin ?? "http://localhost:3000");
  const apiOrigin = canonicalOrigin(options.apiOrigin ?? "http://localhost:3001");
  const hashExecutable = options.hashExecutable ?? sha256File;
  const executableSha256 = await hashExecutable(executablePath);
  const nodeVersion = options.nodeVersion ?? process.version;
  const expectedExecutableSha256 =
    options.expectedExecutableSha256 ?? expectedStasisExecutableSha256;
  const expectedRuntimeNodeVersion = options.expectedNodeVersion ?? expectedNodeVersion;
  const selectedProfile = options.profile;
  const runner = options.runner ?? "stasis-controlled-web-session-v1";
  const sdkLabel = options.sdkLabel ?? "@oxhq/stasis@0.2.1";
  const startedAt = new Date().toISOString();
  const dependencies = {
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    launchRuntime: options.launchRuntime ?? launch,
    commandTimeoutMs: options.commandTimeoutMs ?? 30_000,
    appOrigin,
    apiOrigin,
    executablePath,
    selectedProfile,
  };

  let cases;
  if (executableSha256 !== expectedExecutableSha256 || nodeVersion !== expectedRuntimeNodeVersion) {
    const executableMismatch = executableSha256 !== expectedExecutableSha256;
    cases = rwaAuthCases.map((definition) =>
      nonExecutedOutcome(definition, {
        classification: "BENCHMARK_INVALID",
        typedSurface: executableMismatch ? "candidate_identity" : "node_runtime",
        phase: executableMismatch ? "candidate-identity" : "runtime-identity",
        error: executableMismatch
          ? {
              name: "CandidateIdentityError",
              code: "stasis_executable_hash_mismatch",
              message: `expected ${expectedExecutableSha256}, got ${executableSha256}`,
              fatal: false,
              stateEffect: "none",
            }
          : {
              name: "RuntimeIdentityError",
              code: "node_runtime_mismatch",
              message: `expected ${expectedRuntimeNodeVersion}, got ${nodeVersion}`,
              fatal: false,
              stateEffect: "none",
            },
      }),
    );
  } else {
    cases = [];
    for (const definition of rwaAuthCases) {
      cases.push(await runOneCase(definition, dependencies));
    }
  }

  const classifications = Object.fromEntries(
    [...new Set(cases.map(({ classification }) => classification))]
      .sort()
      .map((classification) => [classification, cases.filter((entry) => entry.classification === classification).length]),
  );
  const passed = cases.filter(({ classification }) => passingClassifications.has(classification)).length;

  return {
    schema: "stasis-compat-rwa-stasis-raw-v1",
    protocol: "stasis-compat-bench-v1",
    track: "rwa-auth",
    runner,
    startedAt,
    completedAt: new Date().toISOString(),
    source: rwaAuthSource,
    versions: {
      sdk: sdkLabel,
      node: nodeVersion,
      expectedNode: expectedRuntimeNodeVersion,
      nodeIdentityMatches: nodeVersion === expectedRuntimeNodeVersion,
      executablePath,
      executableSha256,
      expectedExecutableSha256,
      candidateIdentityMatches: executableSha256 === expectedExecutableSha256,
    },
    endpoints: {
      appOrigin,
      apiOrigin,
      seed: `${apiOrigin}/testData/seed`,
    },
    rules: {
      retries: 0,
      fallback: false,
      sleeps: false,
      domPolling: false,
      businessApiSubstitution: false,
      processPerCase: 1,
      seedBeforeEveryCase: true,
    },
    denominator: rwaAuthCases.length,
    cases,
    sharedBlocker: sharedBlocker(cases),
    summary: {
      complete: cases.length === rwaAuthCases.length,
      classified: cases.length,
      passed,
      failedOrUnsupported: cases.length - passed,
      classifications,
    },
  };
}

async function runOneCase(definition, dependencies) {
  const startedAt = process.hrtime.bigint();
  const checkpoints = [];
  const observations = [];
  const addCheckpoint = (phase, status, details = {}) => {
    checkpoints.push({ sequence: checkpoints.length + 1, phase, status, ...details });
  };
  const preRegisteredBoundaries = boundariesFor(definition);
  addCheckpoint("pre-registered-capability-boundary", "recorded", {
    boundaries: preRegisteredBoundaries,
  });
  let runtime = null;
  let session = null;
  let terminal = null;
  let seededUser = null;
  let backendState = null;
  let documentToken = null;

  try {
    try {
      const response = await dependencies.fetchImpl(`${dependencies.apiOrigin}/testData/seed`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw setupHttpError("seed", response.status);
      addCheckpoint("seed", "passed", {
        method: "POST",
        path: "/testData/seed",
        httpStatus: response.status,
        serverOwnedRuntimeMutation: "data/database.json",
      });
    } catch (error) {
      terminal = terminalFromError(error, "seed");
      addCheckpoint("seed", "failed", { error: terminal.error });
    }

    if (terminal === null && definition.adapterRequirements.includes("seeded-user-fixture")) {
      try {
        const users = await getTestDataEntity(dependencies.fetchImpl, dependencies.apiOrigin, "users");
        if (users.length === 0) throw harnessError("seeded_user_missing", "the seeded users collection is empty");
        seededUser = pickSeededUser(users[0]);
        addCheckpoint("seeded-user-fixture", "passed", {
          fixtureIndex: 0,
          idPresent: true,
          usernamePresent: true,
        });
      } catch (error) {
        terminal = terminalFromError(error, "seeded-user-fixture");
        addCheckpoint("seeded-user-fixture", "failed", { error: terminal.error });
      }
    }

    if (terminal === null) {
      try {
        runtime = await dependencies.launchRuntime({
          executablePath: dependencies.executablePath,
          commandTimeoutMs: dependencies.commandTimeoutMs,
        });
        addCheckpoint("runtime-launch", "passed", { freshNativeProcess: true });
      } catch (error) {
        terminal = terminalFromError(error, "runtime-launch");
        addCheckpoint("runtime-launch", "failed", { error: terminal.error });
      }
    }

    const openAction = definition.stasisActions[0];
    if (terminal === null) {
      try {
        session = await runtime.openSession(`${dependencies.appOrigin}${openAction.path}`, {
          ...(dependencies.selectedProfile === undefined
            ? {}
            : { profile: dependencies.selectedProfile }),
          network: { mode: "live", routes: [] },
        });
        documentToken = session.stateToken;
        const result = {
          requestedUrl: `${dependencies.appOrigin}${openAction.path}`,
          path: safeControlledFinalPath(session.url),
          boundary: session.boundary,
          clockMode: session.clockMode,
          profile: session.profile,
        };
        observations.push({ actionIndex: 0, op: "openSession", result });
        addCheckpoint("action", "passed", { actionIndex: 0, action: publicAction(openAction), result });
      } catch (error) {
        terminal = terminalFromError(error, "openSession", 0);
        addCheckpoint("action", "failed", {
          actionIndex: 0,
          action: publicAction(openAction),
          error: terminal.error,
        });
      }
    }

    const variables = { ...(definition.fixtureInputs ?? {}), ...(seededUser === null ? {} : { seededUser }) };
    if (terminal === null) {
      for (let actionIndex = 1; actionIndex < definition.stasisActions.length; actionIndex += 1) {
        const mappedAction = definition.stasisActions[actionIndex];
        try {
          const execution = await executeAction(session, mappedAction, documentToken, variables);
          documentToken = execution.stateToken ?? documentToken;
          const retainedResult = sanitizeActionResult(mappedAction.op, execution.result, mappedAction);
          observations.push({
            actionIndex,
            op: mappedAction.op,
            ...(mappedAction.selector === undefined ? {} : { selector: mappedAction.selector }),
            result: retainedResult,
          });
          if (execution.terminal !== null) {
            terminal = terminalFromError(execution.terminal, mappedAction.op, actionIndex);
            addCheckpoint("action", "blocked", {
              actionIndex,
              action: publicAction(mappedAction),
              result: retainedResult,
              error: terminal.error,
            });
            if (session !== null && execution.terminal.fatal !== true) {
              await captureTerminalAudits(session, observations, addCheckpoint);
            }
            break;
          }
          addCheckpoint("action", "passed", {
            actionIndex,
            action: publicAction(mappedAction),
            result: retainedResult,
          });
        } catch (error) {
          terminal = terminalFromError(error, mappedAction.op, actionIndex);
          addCheckpoint("action", "failed", {
            actionIndex,
            action: publicAction(mappedAction),
            error: terminal.error,
          });
          if (session !== null && error?.fatal !== true) {
            await captureTerminalAudits(session, observations, addCheckpoint);
          }
          break;
        }
      }
    }

    if (terminal === null && definition.adapterRequirements.includes("backend-state-observer")) {
      try {
        const [users, bankaccounts] = await Promise.all([
          getTestDataEntity(dependencies.fetchImpl, dependencies.apiOrigin, "users"),
          getTestDataEntity(dependencies.fetchImpl, dependencies.apiOrigin, "bankaccounts"),
        ]);
        backendState = projectRelevantBackendState(definition, users, bankaccounts);
        addCheckpoint("backend-state-observer", "passed", { state: backendState });
      } catch (error) {
        terminal = terminalFromError(error, "backend-state-observer");
        addCheckpoint("backend-state-observer", "failed", { error: terminal.error });
      }
    }
  } finally {
    if (session !== null && terminal === null) {
      try {
        await session.close();
        addCheckpoint("cleanup", "passed", { mode: "graceful-session-close" });
      } catch (error) {
        terminal = terminalFromError(error, "cleanup");
        addCheckpoint("cleanup", "failed", { mode: "graceful-session-close", error: terminal.error });
        await runtime?.close().catch(() => undefined);
      }
    } else if (runtime !== null) {
      try {
        await runtime.close();
        addCheckpoint("cleanup", "passed", { mode: "fail-stop-runtime-close" });
      } catch (error) {
        addCheckpoint("cleanup", "failed", {
          mode: "fail-stop-runtime-close",
          error: serializeRwaError(error),
        });
      }
    }
  }

  const oracleResults = evaluateRwaOracles(definition, observations, backendState, terminal);
  const classification = terminal?.classification ?? classificationFromOracles(oracleResults, definition);
  return {
    ordinal: definition.ordinal,
    id: definition.id,
    title: definition.source.title,
    source: definition.source,
    classification,
    ...(terminal?.typedSurface === undefined ? {} : { typedSurface: terminal.typedSurface }),
    success: passingClassifications.has(classification),
    semanticDifferenceIds: definition.semanticDifferenceIds,
    preRegisteredBoundaries,
    terminal,
    checkpoints,
    oracles: oracleResults,
    wallTimeMs: monotonicMilliseconds(startedAt),
  };
}

async function executeAction(session, mappedAction, documentToken, variables) {
  let result;
  switch (mappedAction.op) {
    case "settle":
      result = await session.settle(documentToken, rwaSettlePolicy);
      return {
        result,
        stateToken: result.stateToken,
        terminal: settleTerminal(result),
      };
    case "fill":
      result = await session.fill(
        mappedAction.selector,
        mappedAction.valueRef === undefined ? mappedAction.value : resolveReference(variables, mappedAction.valueRef),
        documentToken,
      );
      break;
    case "focus":
      result = await session.focus(mappedAction.selector, documentToken);
      break;
    case "check":
      result = await session.check(mappedAction.selector, documentToken);
      break;
    case "activate":
      result = await session.activate(mappedAction.selector, documentToken);
      break;
    case "query":
      result = await session.query(mappedAction.selector, documentToken);
      break;
    case "text":
      result = await session.text(mappedAction.selector, documentToken);
      break;
    case "extract": {
      const [read, attribute] = mappedAction.field.split(":", 2);
      if (read !== "attribute" || attribute.length === 0) {
        throw harnessError("invalid_extract_mapping", `unsupported extract field ${mappedAction.field}`);
      }
      result = await session.extract(
        {
          rootSelector: mappedAction.selector,
          fields: [{ name: attribute, selector: "", read, attribute }],
        },
        documentToken,
      );
      break;
    }
    case "getCookies":
      result = await session.getCookies();
      return { result, stateToken: documentToken, terminal: null };
    case "requests":
      result = await readCompleteAudit(session, "requests");
      break;
    case "evidence":
      result = await readCompleteAudit(session, "evidence");
      break;
    default:
      throw harnessError("unknown_mapped_action", `unknown public action ${mappedAction.op}`);
  }
  return { result, stateToken: result.stateToken ?? documentToken, terminal: null };
}

export async function readCompleteAudit(session, method) {
  const records = [];
  const pages = [];
  let allPagesComplete = true;
  let afterSeq;
  let lastRecordSeq;
  let snapshotCursors;
  let page = await session[method]({});
  const bounds = validateAuditBounds(page?.bounds, method);
  for (let pageNumber = 1; pageNumber <= bounds.maxRecords; pageNumber += 1) {
    validateAuditPage(page, bounds, afterSeq, lastRecordSeq, snapshotCursors, method);
    snapshotCursors ??= auditCursorSnapshot(page);
    allPagesComplete &&= page.complete === true;
    if (records.length + page.records.length > bounds.maxRecords) {
      throw harnessError("invalid_result", `${method} exceeded its advertised record bound`);
    }
    records.push(...page.records);
    if (page.records.length > 0) lastRecordSeq = page.records.at(-1).seq;
    pages.push({
      pageNumber,
      recordCount: page.records.length,
      complete: page.complete,
      hasMore: page.hasMore,
      ...(page.firstRetainedSeq === undefined ? {} : { firstRetainedSeq: page.firstRetainedSeq }),
      ...(page.latestSeq === undefined ? {} : { latestSeq: page.latestSeq }),
      ...(page.droppedThroughSeq === undefined ? {} : { droppedThroughSeq: page.droppedThroughSeq }),
    });
    if (!page.hasMore) return { ...page, complete: allPagesComplete, records, pages };
    if (records.length >= bounds.maxRecords) {
      throw harnessError("invalid_result", `${method} advertised more records than its record bound`);
    }
    afterSeq = page.nextAfterSeq;
    page = await session[method]({ afterSeq, limit: bounds.maxPageItems });
  }
  throw harnessError(
    "audit_page_limit_exceeded",
    `${method} exceeded its advertised ${bounds.maxRecords}-record audit bound`,
  );
}

function validateAuditBounds(value, method) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw harnessError("invalid_result", `${method} did not advertise audit bounds`);
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys[0] !== "maxMetadataBytes" || keys[1] !== "maxPageItems" || keys[2] !== "maxRecords") {
    throw harnessError("invalid_result", `${method} advertised malformed audit bounds`);
  }
  for (const [field, hardMaximum] of Object.entries(auditHardBounds)) {
    const actual = value[field];
    if (!Number.isSafeInteger(actual) || actual < 1 || actual > hardMaximum) {
      throw harnessError("invalid_result", `${method} advertised an invalid ${field} audit bound`);
    }
  }
  return {
    maxRecords: value.maxRecords,
    maxMetadataBytes: value.maxMetadataBytes,
    maxPageItems: value.maxPageItems,
  };
}

function validateAuditPage(page, expectedBounds, afterSeq, priorRecordSeq, expectedCursors, method) {
  if (page === null || typeof page !== "object" || Array.isArray(page)) {
    throw harnessError("invalid_result", `${method} returned a malformed audit page`);
  }
  const actualBounds = validateAuditBounds(page.bounds, method);
  if (
    actualBounds.maxRecords !== expectedBounds.maxRecords ||
    actualBounds.maxMetadataBytes !== expectedBounds.maxMetadataBytes ||
    actualBounds.maxPageItems !== expectedBounds.maxPageItems
  ) {
    throw harnessError("invalid_result", `${method} audit bounds changed during pagination`);
  }
  if (!Array.isArray(page.records) || page.records.length > expectedBounds.maxPageItems) {
    throw harnessError("invalid_result", `${method} returned an invalid bounded record page`);
  }
  if (afterSeq !== undefined && page.records.length === 0) {
    throw harnessError("audit_pagination_stalled", `${method} pagination returned no records`);
  }
  if (typeof page.complete !== "boolean" || typeof page.hasMore !== "boolean") {
    throw harnessError("invalid_result", `${method} returned invalid audit page flags`);
  }
  for (const field of ["firstRetainedSeq", "nextAfterSeq", "latestSeq", "droppedThroughSeq"]) {
    if (page[field] !== undefined && (typeof page[field] !== "bigint" || page[field] < 0n)) {
      throw harnessError("invalid_result", `${method} returned an invalid ${field} audit cursor`);
    }
  }
  const cursor = afterSeq ?? 0n;
  const expectedComplete = page.droppedThroughSeq === undefined || cursor >= page.droppedThroughSeq;
  if (page.complete !== expectedComplete) {
    throw harnessError("invalid_result", `${method} returned contradictory audit completeness`);
  }
  if (expectedCursors !== undefined) {
    for (const field of ["firstRetainedSeq", "latestSeq", "droppedThroughSeq"]) {
      if (page[field] !== expectedCursors[field]) {
        throw harnessError("invalid_result", `${method} audit ${field} changed during pagination`);
      }
    }
  }
  if (
    page.droppedThroughSeq !== undefined &&
    page.firstRetainedSeq !== undefined &&
    page.droppedThroughSeq >= page.firstRetainedSeq
  ) {
    throw harnessError("invalid_result", `${method} returned overlapping retained and dropped cursors`);
  }
  if ((page.firstRetainedSeq === undefined) !== (page.latestSeq === undefined)) {
    throw harnessError("invalid_result", `${method} returned inconsistent retained audit cursors`);
  }
  if (page.firstRetainedSeq !== undefined) {
    if (page.firstRetainedSeq > page.latestSeq) {
      throw harnessError("invalid_result", `${method} retained cursor exceeded its latest cursor`);
    }
    const expectedFirst = page.droppedThroughSeq === undefined ? 1n : page.droppedThroughSeq + 1n;
    if (page.firstRetainedSeq !== expectedFirst) {
      throw harnessError("invalid_result", `${method} returned a missing retained audit prefix`);
    }
  } else if (page.droppedThroughSeq !== undefined || page.records.length > 0 || page.hasMore) {
    throw harnessError("invalid_result", `${method} returned work without a retained audit range`);
  }
  let previous = priorRecordSeq;
  for (const record of page.records) {
    if (typeof record?.seq !== "bigint" || record.seq < 0n || (previous !== undefined && record.seq <= previous)) {
      throw harnessError("invalid_result", `${method} audit sequence did not increase`);
    }
    if (method === "evidence" && previous !== undefined && record.seq !== previous + 1n) {
      throw harnessError("invalid_result", "evidence audit sequence omitted a retained record");
    }
    previous = record.seq;
  }
  const first = page.records[0];
  if (first !== undefined) {
    if (page.firstRetainedSeq === undefined || first.seq < page.firstRetainedSeq) {
      throw harnessError("invalid_result", `${method} returned records outside its retained cursor`);
    }
  }
  if (page.records.length > 0 && page.nextAfterSeq !== previous) {
    throw harnessError("invalid_result", `${method} next cursor did not match the returned record sequence`);
  }
  if (page.records.length > 0 && (page.latestSeq === undefined || previous > page.latestSeq)) {
    throw harnessError("invalid_result", `${method} latest cursor did not include its returned records`);
  }
  if (page.records.length === 0 && page.nextAfterSeq !== afterSeq) {
    throw harnessError("invalid_result", `${method} empty page changed its audit cursor`);
  }
  if (method === "evidence") {
    const expectedFirstReturned = page.firstRetainedSeq === undefined
      ? undefined
      : cursor < page.firstRetainedSeq
        ? page.firstRetainedSeq
        : cursor + 1n;
    if (first !== undefined && first.seq !== expectedFirstReturned) {
      throw harnessError("invalid_result", "evidence audit page omitted its first retained record");
    }
    const expectedHasMore = page.latestSeq !== undefined && (previous ?? cursor) < page.latestSeq;
    if (page.hasMore !== expectedHasMore) {
      throw harnessError("invalid_result", "evidence audit pagination contradicted its latest cursor");
    }
  }
  if (page.hasMore) {
    if (page.records.length === 0 || typeof page.nextAfterSeq !== "bigint") {
      throw harnessError("audit_pagination_stalled", `${method} pagination did not return an advancing cursor`);
    }
    if (afterSeq !== undefined && page.nextAfterSeq <= afterSeq) {
      throw harnessError("audit_pagination_stalled", `${method} pagination did not advance`);
    }
  }
}

function auditCursorSnapshot(page) {
  return {
    firstRetainedSeq: page.firstRetainedSeq,
    latestSeq: page.latestSeq,
    droppedThroughSeq: page.droppedThroughSeq,
  };
}

async function captureTerminalAudits(session, observations, addCheckpoint) {
  for (const op of ["requests", "evidence"]) {
    try {
      const result = await readCompleteAudit(session, op);
      const retainedResult = sanitizeActionResult(op, result);
      observations.push({ actionIndex: null, op, diagnostic: true, result: retainedResult });
      addCheckpoint("terminal-audit", "passed", { op, result: retainedResult });
    } catch (error) {
      addCheckpoint("terminal-audit", "failed", { op, error: serializeRwaError(error) });
      break;
    }
  }
}

function settleTerminal(result) {
  if (acceptedSettleOutcomes.has(result.outcome)) return null;
  if (!settleOutcomes.has(result.outcome)) {
    throw harnessError("invalid_result", "settle returned an unknown outcome");
  }
  const code = result.outcome === "unsupported_work" || result.outcome === "runtime_error"
    ? result.failure?.code
    : `settle_${result.outcome}`;
  if (
    (result.outcome === "unsupported_work" || result.outcome === "runtime_error") &&
    !settleFailureCodes.has(code)
  ) {
    throw harnessError("invalid_result", "settle returned an unknown typed failure code");
  }
  return new RwaSettleTerminalError(code, result.outcome);
}

class RwaSettleTerminalError extends Error {
  constructor(code, outcome) {
    super(`settle returned ${outcome}`);
    this.name = "RwaSettleTerminalError";
    this.code = code;
    this.outcome = outcome;
    this.fatal = false;
    this.stateEffect = "none";
  }

  safeRecord() {
    return {
      name: "RwaSettleTerminalError",
      code: this.code,
      outcome: this.outcome,
      fatal: false,
      stateEffect: "none",
      messageOmitted: true,
    };
  }
}

export function classifyStasisFailure(error, phase = "action") {
  const code = typeof error?.code === "string" ? error.code : "unclassified_failure";
  if (["seed", "seeded-user-fixture", "backend-state-observer", "candidate-identity"].includes(phase)) {
    return { classification: "BENCHMARK_INVALID", typedSurface: "harness_setup" };
  }
  if (error?.name === "RwaHarnessError" || code.startsWith("invalid_") || code === "stale_generation") {
    return { classification: "BENCHMARK_INVALID", typedSurface: "harness_adapter" };
  }
  if (code === "navigation_authority_changed") {
    return { classification: "ENGINE_BUG", typedSurface: "navigation_authority" };
  }
  if (error?.outcome === "runtime_error") {
    return { classification: "ENGINE_BUG", typedSurface: "controlled_runtime" };
  }
  if (error?.outcome === "unsupported_work") {
    return { classification: "PROFILE_UNSUPPORTED", typedSurface: unsupportedSurface(code, error) };
  }
  if (
    code.startsWith("unsupported_") ||
    code.endsWith("_unsupported") ||
    code === "unsupported_work" ||
    code === "unsupported_open_ended_source" ||
    error?.outcome === "blocked_on_open_ended_work"
  ) {
    return { classification: "PROFILE_UNSUPPORTED", typedSurface: unsupportedSurface(code, error) };
  }
  if (code === "element_not_found" || code === "extraction_field_not_found" || code === "disabled_activation_element") {
    return { classification: "WEB_COMPAT_BUG", typedSurface: "semantic_dom" };
  }
  if (code === "settle_blocked_on_external_io") {
    return { classification: "WEB_COMPAT_BUG", typedSurface: "network" };
  }
  if (code.startsWith("settle_") && code !== "settle_runtime_error") {
    return { classification: "WEB_COMPAT_BUG", typedSurface: "settlement" };
  }
  if (
    error?.name === "StasisProtocolError" ||
    error?.name === "StasisProcessError" ||
    error?.name === "StasisTransportError" ||
    error?.name === "StasisCommandTimeoutError" ||
    code === "settle_runtime_error"
  ) {
    return { classification: "ENGINE_BUG", typedSurface: "controlled_runtime" };
  }
  return { classification: "BENCHMARK_INVALID", typedSurface: "harness_adapter" };
}

function unsupportedSurface(code, error) {
  if (/cookie|persistent|partitioned/u.test(code)) return "storage";
  if (/selector|dom_serialization/u.test(code)) return "selector";
  if (/fill|focus|check|select|submit|activation/u.test(code)) return "forms";
  if (/navigation/u.test(code)) return "navigation";
  if (/open_ended|websocket/u.test(code) || error?.outcome === "blocked_on_open_ended_work") return "open_ended_work";
  if (/network/u.test(code)) return "network";
  return "controlled_profile";
}

function terminalFromError(error, phase, actionIndex) {
  const serialized = serializeRwaError(error);
  const classified = classifyStasisFailure(error, phase);
  return {
    phase,
    ...(actionIndex === undefined ? {} : { actionIndex }),
    ...classified,
    error: serialized,
  };
}

function serializeRwaError(error) {
  if (error instanceof RwaSettleTerminalError) return error.safeRecord();
  return serializeError(error);
}

export function evaluateRwaOracles(definition, observations, backendState, terminal) {
  const cursors = new Map();
  return definition.oracles.map((expected) => {
    if (
      terminal !== null &&
      !oracleEvidenceAvailable(expected, observations, backendState, cursors)
    ) {
      return terminalNotReachedOracle(expected, terminal);
    }
    return evaluateOracle(expected, observations, backendState, cursors);
  });
}

function terminalNotReachedOracle(expected, terminal) {
  return {
    id: expected.id,
    kind: expected.kind,
    status: "NOT_REACHED",
    expected: expected.expected,
    reason: `terminal ${terminal.classification} at ${terminal.phase}`,
    ...(expected.kind === "top-level-path"
      ? { preRegisteredClassification: preRegisteredBoundaryCatalog["current-path-sdk-gap"] }
      : {}),
    ...(expected.kind === "cookie-property"
      ? { preRegisteredClassification: preRegisteredBoundaryCatalog["persistent-cookie-profile-gap"] }
      : {}),
  };
}

function oracleEvidenceAvailable(expected, observations, backendState, cursors) {
  switch (expected.kind) {
    case "top-level-path":
      return false;
    case "controlled-open-final-url":
      return controlledOpenFinalPath(observations) !== null;
    case "controlled-settle-final-url":
      return controlledSettleFinalPath(observations) !== null;
    case "dom-text":
      return textEvidenceAvailable(expected.expected, observations, cursors);
    case "dom-text-set": {
      const probe = new Map(cursors);
      return expected.expected.every((part) => textEvidenceAvailable(part, observations, probe, true));
    }
    case "semantic-dom":
      return [...expected.expected.present, ...expected.expected.absent].every((selector) =>
        observations.some(
          ({ op, selector: observedSelector }) => op === "query" && observedSelector === selector,
        )
      );
    case "native-disabled":
      return observations.some(
        ({ op, selector }) => op === "extract" && selector === expected.expected.selector,
      );
    case "cookie-property":
      return observations.some(({ op }) => op === "getCookies");
    case "network-response":
      return completeAuditEvidenceAvailable(expected.expected, observations);
    case "persisted-backend-state":
      return backendState !== null;
    default:
      return true;
  }
}

function textEvidenceAvailable(expected, observations, cursors, consume = false) {
  const selector = expected.selector;
  const candidates = observations.filter(
    ({ op, selector: observedSelector }) => op === "text" && observedSelector === selector,
  );
  const cursor = cursors.get(selector) ?? 0;
  if (candidates[cursor] === undefined) return false;
  if (consume) cursors.set(selector, cursor + 1);
  return true;
}

function completeAuditEvidenceAvailable(expected, observations) {
  const requestPages = observations.filter(({ op }) => op === "requests");
  const evidencePages = observations.filter(({ op }) => op === "evidence");
  return (
    requestPages.length > 0 &&
    evidencePages.length > 0 &&
    [...requestPages, ...evidencePages].every(
      ({ result }) =>
        result?.complete === true &&
        result?.hasMore === false &&
        Array.isArray(result?.records),
    ) &&
    requestPages.some(({ result }) =>
      result.records.some(
        (record) =>
          record?.method === expected.method &&
          record?.url?.path === expected.path,
      )
    )
  );
}

function evaluateOracle(expected, observations, backendState, cursors) {
  switch (expected.kind) {
    case "top-level-path":
      return oracleResult(expected, "UNOBSERVABLE", {
        classification: "SDK_GAP",
        typedSurface: "current_top_level_url",
        reason: "the public Session API does not expose the live pathname after History API changes",
      });
    case "controlled-open-final-url": {
      const observed = controlledOpenFinalPath(observations);
      const pass = observed === expected.expected;
      return oracleResult(expected, pass ? "PASS" : "FAIL", {
        observed,
        ...(pass
          ? {}
          : { classification: "WEB_COMPAT_BUG", typedSurface: "navigation" }),
      });
    }
    case "controlled-settle-final-url": {
      const observed = controlledSettleFinalPath(observations);
      const pass = observed === expected.expected;
      return oracleResult(expected, pass ? "PASS" : "FAIL", {
        observed,
        ...(pass
          ? {}
          : { classification: "WEB_COMPAT_BUG", typedSurface: "navigation" }),
      });
    }
    case "dom-text":
      return evaluateTextExpectation(expected, observations, cursors);
    case "dom-text-set": {
      const parts = expected.expected.map((part, index) =>
        evaluateTextExpectation(
          { id: `${expected.id}:${index + 1}`, kind: "dom-text", expected: part },
          observations,
          cursors,
        ),
      );
      return oracleResult(expected, parts.every(({ status }) => status === "PASS") ? "PASS" : "FAIL", {
        observed: parts,
        ...(parts.every(({ status }) => status === "PASS")
          ? {}
          : { classification: "WEB_COMPAT_BUG", typedSurface: "semantic_dom" }),
      });
    }
    case "semantic-dom": {
      const observed = {};
      let pass = true;
      for (const selector of expected.expected.present) {
        const count = latestQueryCount(observations, selector);
        observed[selector] = count;
        if (count === null || toBigInt(count) < 1n) pass = false;
      }
      for (const selector of expected.expected.absent) {
        const count = latestQueryCount(observations, selector);
        observed[selector] = count;
        if (count === null || toBigInt(count) !== 0n) pass = false;
      }
      return oracleResult(expected, pass ? "PASS" : "FAIL", {
        observed,
        ...(pass ? {} : { classification: "WEB_COMPAT_BUG", typedSurface: "semantic_dom" }),
      });
    }
    case "native-disabled": {
      const record = observations.find(
        ({ op, selector }) => op === "extract" && selector === expected.expected.selector,
      );
      const observed = record?.result?.attributePresent === true;
      return oracleResult(expected, observed === expected.expected.value ? "PASS" : "FAIL", {
        observed,
        ...(observed === expected.expected.value
          ? {}
          : { classification: "WEB_COMPAT_BUG", typedSurface: "semantic_forms" }),
      });
    }
    case "cookie-property": {
      const record = observations.findLast(({ op }) => op === "getCookies");
      const cookies = Array.isArray(record?.result?.cookies) ? record.result.cookies : [];
      const cookie = cookies.find((entry) => entry?.name === expected.expected.name);
      const observed = cookie?.[expected.expected.stasisField] ?? null;
      const pass = expected.expected.predicate === "non-null" && observed !== null;
      return oracleResult(expected, pass ? "PASS" : "UNOBSERVABLE", {
        observed,
        ...(pass
          ? {}
          : {
              classification: "PROFILE_UNSUPPORTED",
              typedSurface: "storage",
              reason: "controlled-web-session-v1 exposes session cookies only",
            }),
      });
    }
    case "network-response":
      return evaluateNetworkResponse(expected, observations);
    case "persisted-backend-state":
      return evaluateBackendState(expected, backendState);
    default:
      return oracleResult(expected, "FAIL", {
        classification: "BENCHMARK_INVALID",
        typedSurface: "oracle_adapter",
        reason: `unknown oracle kind ${expected.kind}`,
      });
  }
}

function controlledOpenFinalPath(observations) {
  const record = observations.find(
    ({ op, result }) =>
      op === "openSession" &&
      result?.boundary === "controlled_ready" &&
      typeof result?.path === "string",
  );
  if (record === undefined) return null;
  return record.result.path;
}

function controlledSettleFinalPath(observations) {
  const records = observations.filter(
    ({ op, result }) =>
      op === "settle" &&
      Object.hasOwn(result ?? {}, "path"),
  );
  if (records.length !== 1) return null;
  return typeof records[0].result.path === "string" ? records[0].result.path : null;
}

function evaluateTextExpectation(expected, observations, cursors) {
  const selector = expected.expected.selector;
  const candidates = observations.filter(({ op, selector: observedSelector }) => op === "text" && observedSelector === selector);
  const cursor = cursors.get(selector) ?? 0;
  const record = candidates[cursor];
  cursors.set(selector, cursor + 1);
  const observed = record?.result?.value;
  const pass =
    typeof observed === "string" &&
    (expected.expected.exact === undefined
      ? observed.includes(expected.expected.contains)
      : observed === expected.expected.exact);
  return oracleResult(expected, pass ? "PASS" : "FAIL", {
    observed: observed ?? null,
    ...(pass ? {} : { classification: "WEB_COMPAT_BUG", typedSurface: "semantic_dom" }),
  });
}

function latestQueryCount(observations, selector) {
  const record = observations.findLast(({ op, selector: observedSelector }) => op === "query" && observedSelector === selector);
  return record?.result?.count ?? null;
}

function evaluateNetworkResponse(expected, observations) {
  const requestPages = observations.filter(({ op }) => op === "requests");
  const evidencePages = observations.filter(({ op }) => op === "evidence");
  const auditComplete =
    requestPages.length > 0 &&
    evidencePages.length > 0 &&
    [...requestPages, ...evidencePages].every(
      ({ result }) =>
        result?.complete === true &&
        result?.hasMore === false &&
        Array.isArray(result?.records),
    );
  const requests = requestPages.flatMap(({ result }) =>
    Array.isArray(result?.records) ? result.records.filter(isRecordValue) : [],
  );
  const evidence = evidencePages.flatMap(({ result }) =>
    Array.isArray(result?.records) ? result.records.filter(isRecordValue) : [],
  );
  if (!auditComplete) {
    return oracleResult(expected, "FAIL", {
      observed: { auditComplete: false, matchingRequestCount: 0, statuses: [] },
      classification: "BENCHMARK_INVALID",
      typedSurface: "network_audit",
    });
  }
  const matching = requests.filter(
    (record) =>
      record.method === expected.expected.method &&
      record.url?.path === expected.expected.path &&
      typeof record.requestKeySha256 === "string",
  );
  const statuses = matching.flatMap(({ requestKeySha256 }) =>
    evidence
      .filter(
        (record) =>
          record.kind === "response_headers" &&
          record.requestKeySha256 === requestKeySha256,
      )
      .map(({ status }) => status),
  );
  const [minimum, maximum] = expected.expected.statusRange;
  const pass = statuses.some((status) => status >= minimum && status <= maximum);
  return oracleResult(expected, pass ? "PASS" : "FAIL", {
    observed: { matchingRequestCount: matching.length, statuses },
    ...(pass
      ? {}
      : {
          classification: requestPages.length === 0 || evidencePages.length === 0 ? "BENCHMARK_INVALID" : "WEB_COMPAT_BUG",
          typedSurface: "network",
        }),
  });
}

function isRecordValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function evaluateBackendState(expected, backendState) {
  if (backendState === null) {
    return oracleResult(expected, "FAIL", {
      classification: "BENCHMARK_INVALID",
      typedSurface: "backend_state_observer",
      reason: "backend state was not captured",
    });
  }
  if (expected.expected.entity === "user") {
    const observed = Number.isSafeInteger(backendState.createdUserCount)
      ? backendState.createdUserCount
      : -1;
    return oracleResult(expected, observed === 1 ? "PASS" : "FAIL", {
      observed,
      ...(observed === 1 ? {} : { classification: "WEB_COMPAT_BUG", typedSurface: "backend_mutation" }),
    });
  }
  const observed = Number.isSafeInteger(backendState.createdBankAccountCount)
    ? backendState.createdBankAccountCount
    : -1;
  return oracleResult(expected, observed === 1 ? "PASS" : "FAIL", {
    observed,
    ...(observed === 1 ? {} : { classification: "WEB_COMPAT_BUG", typedSurface: "backend_mutation" }),
  });
}

function oracleResult(expected, status, details) {
  return { id: expected.id, kind: expected.kind, status, expected: expected.expected, ...details };
}

function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?[0-9]+$/u.test(value)) return BigInt(value);
  return -1n;
}

function classificationFromOracles(results, definition) {
  const material = results.filter(({ status }) => status !== "PASS");
  if (material.length > 0) {
    const priority = ["BENCHMARK_INVALID", "PROFILE_UNSUPPORTED", "SDK_GAP", "ENGINE_BUG", "WEB_COMPAT_BUG"];
    return priority.find((classification) => material.some((result) => result.classification === classification)) ?? "BENCHMARK_INVALID";
  }
  return definition.semanticDifferenceIds.length === 0 ? "PASS_EQUIVALENT" : "PASS_WITH_SEMANTIC_DIFFERENCE";
}

function projectRelevantBackendState(definition, users, bankaccounts) {
  const fixtureUser = definition.fixtureInputs?.user;
  const fixtureBank = definition.fixtureInputs?.bankAccount;
  const createdUsers = fixtureUser === undefined
    ? []
    : users
        .filter(
          ({ firstName, lastName, username }) =>
            firstName === fixtureUser.firstName && lastName === fixtureUser.lastName && username === fixtureUser.username,
        )
        .map(({ id, firstName, lastName, username }) => ({ id, firstName, lastName, username }));
  const createdIds = new Set(createdUsers.map(({ id }) => id));
  const createdBankAccounts = fixtureBank === undefined
    ? []
    : bankaccounts
        .filter(
          ({ userId, bankName, accountNumber, routingNumber, isDeleted }) =>
            createdIds.has(userId) &&
            bankName === fixtureBank.bankName &&
            accountNumber === fixtureBank.accountNumber &&
            routingNumber === fixtureBank.routingNumber &&
            isDeleted === false,
        )
        .map(({ id, userId, bankName, accountNumber, routingNumber, isDeleted }) => ({
          id,
          userId,
          bankName,
          accountNumber,
          routingNumber,
          isDeleted,
        }));
  return {
    userCount: users.length,
    bankAccountCount: bankaccounts.length,
    createdUserCount: createdUsers.length,
    createdBankAccountCount: createdBankAccounts.length,
  };
}

async function getTestDataEntity(fetchImpl, apiOrigin, entity) {
  const response = await fetchImpl(`${apiOrigin}/testData/${entity}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw setupHttpError(`testData/${entity}`, response.status);
  const body = await response.json();
  if (!Array.isArray(body?.results)) {
    throw harnessError("invalid_testdata_response", `/testData/${entity} did not return a results array`);
  }
  return body.results;
}

function pickSeededUser(user) {
  if (typeof user?.id !== "string" || typeof user?.username !== "string") {
    throw harnessError("invalid_seeded_user", "the first seeded user lacks an id or username");
  }
  return { id: user.id, username: user.username };
}

function setupHttpError(operation, status) {
  return harnessError("upstream_testdata_http_error", `${operation} returned HTTP ${status}`);
}

function harnessError(code, message) {
  const error = new Error(message);
  error.name = "RwaHarnessError";
  error.code = code;
  error.fatal = false;
  error.stateEffect = "none";
  return error;
}

function resolveReference(variables, reference) {
  let value = variables;
  for (const segment of reference.split(".")) value = value?.[segment];
  if (typeof value !== "string") throw harnessError("unresolved_fixture_reference", `could not resolve ${reference}`);
  return value;
}

function publicAction(mappedAction) {
  const copy = { ...mappedAction };
  if (Object.hasOwn(copy, "value")) {
    copy.valueLength = String(copy.value).length;
    delete copy.value;
  }
  return copy;
}

export function projectRwaUnsupportedWork(value) {
  if (!isDensePlainDataArray(value)) {
    throw harnessError("invalid_result", "settle unsupported work is not a dense plain data array");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const retained = Array.from(
    { length: Math.min(value.length, rwaUnsupportedWorkRetentionLimit) },
    (_, index) => projectRwaUnsupportedWorkItem(descriptors[String(index)].value, index),
  );
  return {
    unsupportedWorkCount: value.length,
    ...(value.length === 0
      ? {}
      : {
          unsupportedWork: retained,
          unsupportedWorkOmitted: value.length - retained.length,
        }),
  };
}

function isDensePlainDataArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors).filter((key) => key !== "length");
  if (keys.some((key) => typeof key !== "string") || keys.length !== value.length) return false;
  return keys.every((key) => {
    const descriptor = descriptors[key];
    return (
      /^(?:0|[1-9][0-9]*)$/u.test(key) &&
      Number(key) < value.length &&
      descriptor.enumerable === true &&
      Object.hasOwn(descriptor, "value")
    );
  });
}

function projectRwaUnsupportedWorkItem(item, index) {
  const allowedKeys = new Set(["count", "kind", "reason", "sourceId", "timeSurface"]);
  const values = snapshotPlainDataRecord(item, allowedKeys);
  if (
    values === null ||
    !Object.hasOwn(values, "count") ||
    !Object.hasOwn(values, "kind") ||
    !Object.hasOwn(values, "reason") ||
    !unsupportedWorkKindSet.has(values.kind) ||
    !unsupportedWorkReasonSet.has(values.reason)
  ) {
    throw harnessError(
      "invalid_result",
      `settle unsupported work entry ${index + 1} has an invalid typed shape`,
    );
  }
  if (
    Object.hasOwn(values, "sourceId") &&
    !canonicalU128Decimal(values.sourceId)
  ) {
    throw harnessError(
      "invalid_result",
      `settle unsupported work entry ${index + 1} has an invalid source identity`,
    );
  }
  if (
    Object.hasOwn(values, "timeSurface") &&
    !unsupportedTimeSurfaceSet.has(values.timeSurface)
  ) {
    throw harnessError(
      "invalid_result",
      `settle unsupported work entry ${index + 1} has an invalid time surface`,
    );
  }
  const count = canonicalPositiveU128Decimal(values.count);
  if (count === null) {
    throw harnessError(
      "invalid_result",
      `settle unsupported work entry ${index + 1} has an invalid count`,
    );
  }
  return {
    kind: values.kind,
    count,
    reason: values.reason,
    ...(Object.hasOwn(values, "timeSurface") ? { timeSurface: values.timeSurface } : {}),
  };
}

function snapshotPlainDataRecord(value, allowedKeys) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowedKeys.has(key)) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return descriptor.enumerable !== true || !Object.hasOwn(descriptor, "value");
    })
  ) return null;
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function canonicalPositiveU128Decimal(value) {
  let parsed;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (
    typeof value === "string" &&
    value.length <= 39 &&
    /^(?:0|[1-9][0-9]*)$/u.test(value)
  ) parsed = BigInt(value);
  else return null;
  return parsed > 0n && parsed <= maximumU128 ? parsed.toString(10) : null;
}

function canonicalU128Decimal(value) {
  if (
    typeof value !== "string" ||
    value.length > 39 ||
    !/^(?:0|[1-9][0-9]*)$/u.test(value)
  ) return false;
  return BigInt(value) <= maximumU128;
}

function sanitizeActionResult(op, result, mappedAction = {}) {
  switch (op) {
    case "settle":
      return {
        outcome: safeSettleOutcome(result?.outcome),
        ...projectRwaUnsupportedWork(result?.unsupportedWork),
        ...(mappedAction.observeSettledPath === true
          ? { path: safeControlledFinalPath(result?.url) }
          : {}),
        ...(typeof result?.failure?.code === "string"
          ? { failureCodeSha256: sha256Opaque(result.failure.code) }
          : {}),
        ...(result?.limit === undefined ? {} : { limitPresent: true }),
      };
    case "fill":
    case "focus":
    case "activate":
      return {};
    case "check":
      return {
        ...(typeof result?.changed === "boolean" ? { changed: result.changed } : {}),
        ...(typeof result?.checked === "boolean" ? { checked: result.checked } : {}),
      };
    case "query":
      return { count: safeIntegerString(result?.count) };
    case "text":
      return { value: safeObservedText(result?.value) };
    case "extract": {
      const value = result?.rows?.[0]?.fields?.find(
        (field) => field?.name === mappedAction.field?.split(":", 2)[1],
      )?.value;
      return { attributePresent: value !== undefined && value !== null };
    }
    case "getCookies":
      return {
        cookies: Array.isArray(result?.cookies)
          ? result.cookies
              .filter((cookie) => cookie?.name === mappedAction.name)
              .map((cookie) => ({
                name: mappedAction.name,
                valuePresent: typeof cookie.value === "string" && cookie.value.length > 0,
                expiresUnixTimeNs: safeOptionalIntegerString(cookie.expiresUnixTimeNs),
              }))
          : [],
      };
    case "requests":
      return {
        records: Array.isArray(result?.records)
          ? result.records.flatMap((record) => {
              if (
                typeof record?.requestId !== "string" ||
                typeof record?.method !== "string" ||
                typeof record?.url?.path !== "string" ||
                !record.url.path.startsWith("/") ||
                record.url.path.length > 2048
              ) return [];
              return [{
                requestKeySha256: sha256Opaque(record.requestId),
                method: safeHttpMethod(record.method),
                url: { path: record.url.path },
              }];
            })
          : [],
        complete: result?.complete === true,
        hasMore: result?.hasMore === true,
      };
    case "evidence":
      return {
        records: Array.isArray(result?.records)
          ? result.records.flatMap((record) => {
              if (
                record?.kind !== "response_headers" ||
                typeof record?.requestId !== "string" ||
                !Number.isSafeInteger(record?.status)
              ) return [];
              return [{
                kind: "response_headers",
                requestKeySha256: sha256Opaque(record.requestId),
                status: record.status,
              }];
            })
          : [],
        complete: result?.complete === true,
        hasMore: result?.hasMore === true,
      };
    default:
      return {};
  }
}

function safeSettleOutcome(value) {
  return [
    "blocked_on_external_io",
    "blocked_on_open_ended_work",
    "quiescent",
    "quiescent_with_persistent_work",
    "runtime_error",
    "unsupported_work",
  ].includes(value) ? value : "unknown";
}

function safeControlledFinalPath(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username.length !== 0 ||
      url.password.length !== 0 ||
      url.pathname.length > 2_048 ||
      !rwaFinalPathProjectionAllowlist.has(url.pathname)
    ) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function safeIntegerString(value) {
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^-?[0-9]+$/u.test(value)) return value;
  return "invalid";
}

function safeOptionalIntegerString(value) {
  return value === null || value === undefined ? null : safeIntegerString(value);
}

function safeObservedText(value) {
  if (typeof value !== "string") return null;
  if (value.length > 4096) return null;
  return value
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/giu, "$1 [REDACTED]")
    .replace(/([?&](?:token|secret|password|api[_-]?key)=)[^&#\s]*/giu, "$1[REDACTED]");
}

function safeHttpMethod(value) {
  return ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"].includes(value)
    ? value
    : "UNKNOWN";
}

function sha256Opaque(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function nonExecutedOutcome(definition, terminalInput) {
  const terminal = {
    phase: terminalInput.phase,
    classification: terminalInput.classification,
    typedSurface: terminalInput.typedSurface,
    error: terminalInput.error,
  };
  return {
    ordinal: definition.ordinal,
    id: definition.id,
    title: definition.source.title,
    source: definition.source,
    classification: terminal.classification,
    typedSurface: terminal.typedSurface,
    success: false,
    semanticDifferenceIds: definition.semanticDifferenceIds,
    preRegisteredBoundaries: boundariesFor(definition),
    terminal,
    checkpoints: [
      {
        sequence: 1,
        phase: "pre-registered-capability-boundary",
        status: "recorded",
        boundaries: boundariesFor(definition),
      },
      { sequence: 2, phase: terminal.phase, status: "failed", error: terminal.error },
    ],
    oracles: definition.oracles.map((expected) => ({
      id: expected.id,
      kind: expected.kind,
      status: "NOT_REACHED",
      expected: expected.expected,
      reason: `terminal ${terminal.classification} at ${terminal.phase}`,
    })),
    wallTimeMs: 0,
  };
}

function boundariesFor(definition) {
  return definition.semanticDifferenceIds.flatMap((id) => {
    const boundary = preRegisteredBoundaryCatalog[id];
    return boundary === undefined ? [] : [{ id, ...boundary }];
  });
}

function sharedBlocker(cases) {
  if (cases.length === 0 || cases.some(({ terminal }) => terminal === null)) return null;
  const signatures = new Set(
    cases.map(
      ({ classification, terminal }) =>
        `${classification}|${terminal.phase}|${terminal.error?.code ?? "unclassified_failure"}`,
    ),
  );
  if (signatures.size !== 1) return null;
  const first = cases[0];
  return {
    classification: first.classification,
    typedSurface: first.typedSurface,
    phase: first.terminal.phase,
    code: first.terminal.error?.code ?? "unclassified_failure",
    affectedCases: cases.map(({ ordinal }) => ordinal),
  };
}

function canonicalOrigin(value) {
  const url = new URL(value);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError(`Expected an HTTP(S) origin, got ${value}`);
  }
  return url.origin;
}
