import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function artifactRoot() {
  return path.resolve(
    process.env.STASIS_COMPAT_ARTIFACT_DIR ?? path.join(repositoryRoot, "artifacts", "work"),
  );
}

export function validateSealedArtifactRootPath(value = artifactRoot()) {
  const target = path.resolve(value);
  const runsRoot = path.join(repositoryRoot, "artifacts", "runs");
  if (!samePath(path.dirname(target), runsRoot)) {
    throw new Error(`Sealed artifact root must be one direct child of ${runsRoot}`);
  }
  const runId = path.basename(target);
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(runId) || runId === "." || runId === "..") {
    throw new Error("Sealed artifact run id must be one safe nonempty path segment");
  }
  return target;
}

export async function assertFreshSealedArtifactRoot() {
  const target = validateSealedArtifactRootPath();
  const runsRoot = path.dirname(target);
  await mkdir(runsRoot, { recursive: true });
  await assertDirectoryChainIsReal(runsRoot);
  try {
    await mkdir(target, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Sealed artifact root already exists: ${target}`);
    }
    throw error;
  }
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Sealed artifact root is not a real directory: ${target}`);
  }
  const resolved = await realpath(target);
  if (!samePath(resolved, target)) {
    throw new Error(`Sealed artifact root resolves elsewhere: ${target} -> ${resolved}`);
  }
  return target;
}

export async function assertExistingSealedArtifactRoot() {
  const target = validateSealedArtifactRootPath();
  await assertDirectoryChainIsReal(path.dirname(target));
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Sealed artifact root is not a real directory: ${target}`);
  }
  const resolved = await realpath(target);
  if (!samePath(resolved, target)) {
    throw new Error(`Sealed artifact root resolves elsewhere: ${target} -> ${resolved}`);
  }
  return target;
}

export async function writeJson(relativePath, value) {
  const destination = path.join(artifactRoot(), relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, jsonReplacer, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return destination;
}

export async function writeText(relativePath, value) {
  const destination = path.join(artifactRoot(), relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, value, { encoding: "utf8", flag: "wx" });
  return destination;
}

export async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(artifactRoot(), relativePath), "utf8"));
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function sha256DirectoryTree(directoryPath) {
  const root = path.resolve(directoryPath);
  const files = await listRegularFiles(root);
  const aggregate = createHash("sha256");
  let totalBytes = 0;
  for (const relativePath of files) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile()) throw new Error(`Expected regular file: ${absolutePath}`);
    const fileSha256 = await sha256File(absolutePath);
    totalBytes += metadata.size;
    aggregate.update(relativePath, "utf8");
    aggregate.update("\0", "utf8");
    aggregate.update(String(metadata.size), "utf8");
    aggregate.update("\0", "utf8");
    aggregate.update(fileSha256, "ascii");
    aggregate.update("\n", "ascii");
  }
  return {
    sha256: aggregate.digest("hex"),
    fileCount: files.length,
    totalBytes,
  };
}

export async function listRegularFiles(root) {
  const found = [];
  async function visit(relativeDirectory) {
    const absoluteDirectory = path.join(root, ...relativeDirectory.split("/").filter(Boolean));
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relativePath = relativeDirectory.length === 0
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else if (entry.isFile()) {
        found.push(relativePath.replaceAll("\\", "/"));
      } else {
        throw new Error(`Build tree contains a non-regular entry: ${relativePath}`);
      }
    }
  }
  await visit("");
  return found;
}

export function assertExactFileInventory(actual, expected, label = "artifact") {
  const normalizedActual = [...actual].sort();
  const normalizedExpected = [...expected].sort();
  if (
    normalizedActual.length !== normalizedExpected.length ||
    normalizedActual.some((value, index) => value !== normalizedExpected[index])
  ) {
    throw new Error(
      `${label} inventory mismatch: expected ${JSON.stringify(normalizedExpected)}, got ${JSON.stringify(normalizedActual)}`,
    );
  }
}

async function assertDirectoryChainIsReal(runsRoot) {
  const directories = [
    repositoryRoot,
    path.join(repositoryRoot, "artifacts"),
    runsRoot,
  ];
  for (const directory of directories) {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`Artifact path component is not a real directory: ${directory}`);
    }
    const resolved = await realpath(directory);
    if (!samePath(resolved, directory)) {
      throw new Error(`Artifact path component resolves elsewhere: ${directory} -> ${resolved}`);
    }
  }
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export function jsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString(10);
  if (/violations$/iu.test(_key) && Array.isArray(value) && value.length > 0) {
    return value.map((_entry, index) => `validation_detail_${index + 1}_omitted`);
  }
  if (isSensitiveArtifactKey(_key)) {
    return value === null || value === undefined ? value : undefined;
  }
  if (
    _key === "value" &&
    this !== null &&
    typeof this === "object" &&
    typeof this.name === "string" &&
    /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/iu.test(this.name)
  ) {
    return "[REDACTED]";
  }
  return typeof value === "string" ? redactCredentialSyntax(value) : value;
}

export function serializeError(error) {
  return serializeErrorAtDepth(error, 0, new WeakSet());
}

function serializeErrorAtDepth(error, depth, seen) {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) {
    return { name: "NonErrorThrow", thrownType: typeof error, valueOmitted: true };
  }
  if (depth >= 4 || seen.has(error)) return { name: "ErrorCauseOmitted", cycleOrDepth: true };
  seen.add(error);
  const isStasisProcessExit = error.name === "StasisProcessError" && error.code === "process_exit";
  const stderrTail = typeof error.stderrTail === "string"
    ? error.stderrTail
    : isStasisProcessExit ? "" : null;
  const serialized = {
    name: allowlistedValue(error.name, allowedErrorNames, "UnclassifiedError"),
    ...(error.code === undefined
      ? {}
      : { code: allowlistedValue(error.code, allowedErrorCodes, "unclassified_error") }),
    ...(typeof error.fatal === "boolean" ? { fatal: error.fatal } : {}),
    ...(error.stateEffect === undefined
      ? {}
      : { stateEffect: allowlistedValue(error.stateEffect, allowedStateEffects, "unknown") }),
    ...(error.outcome === undefined
      ? {}
      : { outcome: allowlistedValue(error.outcome, allowedOutcomes, "unknown") }),
    ...(error.limit === undefined ? {} : { limit: safeScalar(error.limit) }),
    ...(typeof error.message === "string" && error.message.length > 0 ? { messageOmitted: true } : {}),
    ...(stderrTail === null
      ? {}
      : {
          stderrTailOmitted: true,
          stderrTailBytes: Buffer.byteLength(stderrTail),
          ...(isStasisProcessExit
            ? { stderrTailSha256: createHash("sha256").update(stderrTail, "utf8").digest("hex") }
            : {}),
        }),
    ...(isStasisProcessExit
      ? {
          exitCode: safeProcessExitCode(error.exitCode),
          signal: safeProcessSignal(error.signal),
          crashMarkers: extractStasisCrashMarkers(stderrTail),
          lifecyclePhases: extractStasisLifecyclePhases(stderrTail),
        }
      : {}),
    ...("requestId" in error || "sessionId" in error
      ? { opaqueIdentifiersOmitted: true }
      : {}),
  };
  if (error.cause !== undefined) {
    serialized.cause = serializeErrorAtDepth(error.cause, depth + 1, seen);
  }
  return serialized;
}

export function assertSerializedError(value) {
  if (!isPlainRecord(value)) throw new TypeError("Invalid serialized error");
  if (value.name === "NonErrorThrow") {
    assertOnlyKeys(value, ["name", "thrownType", "valueOmitted", "failurePhase"]);
    if (
      value.valueOmitted !== true ||
      (Object.hasOwn(value, "thrownType") && !allowedThrownTypes.has(value.thrownType))
    ) {
      throw new TypeError("Invalid serialized non-error throw");
    }
    assertFailurePhase(value);
    return value;
  }
  if (value.name === "ErrorCauseOmitted") {
    assertOnlyKeys(value, ["name", "cycleOrDepth", "failurePhase"]);
    if (value.cycleOrDepth !== true) throw new TypeError("Invalid omitted error cause");
    assertFailurePhase(value);
    return value;
  }

  assertOnlyKeys(value, [
    "name",
    "code",
    "fatal",
    "stateEffect",
    "outcome",
    "limit",
    "messageOmitted",
    "stderrTailOmitted",
    "stderrTailBytes",
    "stderrTailSha256",
    "opaqueIdentifiersOmitted",
    "exitCode",
    "signal",
    "crashMarkers",
    "lifecyclePhases",
    "failurePhase",
    "cause",
  ]);
  if (
    !allowedErrorNames.has(value.name) ||
    (Object.hasOwn(value, "code") && !allowedErrorCodes.has(value.code)) ||
    (Object.hasOwn(value, "fatal") && typeof value.fatal !== "boolean") ||
    (Object.hasOwn(value, "stateEffect") && !allowedStateEffects.has(value.stateEffect)) ||
    (Object.hasOwn(value, "outcome") && !allowedOutcomes.has(value.outcome)) ||
    (Object.hasOwn(value, "limit") && !isSafeSerializedScalar(value.limit)) ||
    (Object.hasOwn(value, "messageOmitted") && value.messageOmitted !== true) ||
    (Object.hasOwn(value, "opaqueIdentifiersOmitted") && value.opaqueIdentifiersOmitted !== true)
  ) {
    throw new TypeError("Invalid serialized error fields");
  }
  const isStasisProcessExit = value.name === "StasisProcessError" && value.code === "process_exit";
  assertFailurePhase(value);
  assertSerializedStderr(value, isStasisProcessExit);

  const processKeys = ["exitCode", "signal", "crashMarkers", "lifecyclePhases"];
  if (isStasisProcessExit) {
    if (
      processKeys.some((key) => !Object.hasOwn(value, key)) ||
      !Object.hasOwn(value, "stderrTailSha256") ||
      !(value.exitCode === null || (Number.isSafeInteger(value.exitCode) && value.exitCode >= 0)) ||
      !(value.signal === null || allowedProcessSignals.has(value.signal)) ||
      !isUniqueAllowlistedArray(value.crashMarkers, allowedCrashMarkers) ||
      !isUniqueAllowlistedArray(value.lifecyclePhases, allowedLifecyclePhases)
    ) {
      throw new TypeError("Invalid serialized Stasis process diagnostics");
    }
  } else if (processKeys.some((key) => Object.hasOwn(value, key))) {
    throw new TypeError("Stasis process diagnostics require a process_exit error");
  }
  if (Object.hasOwn(value, "cause")) assertSerializedError(value.cause);
  return value;
}

function assertSerializedStderr(value, requireSha256) {
  const keys = ["stderrTailOmitted", "stderrTailBytes", "stderrTailSha256"];
  const present = keys.filter((key) => Object.hasOwn(value, key)).length;
  if (present === 0) return;
  if (
    present !== (requireSha256 ? keys.length : keys.length - 1) ||
    value.stderrTailOmitted !== true ||
    !Number.isSafeInteger(value.stderrTailBytes) ||
    value.stderrTailBytes < 0 ||
    (requireSha256
      ? !/^[a-f0-9]{64}$/u.test(value.stderrTailSha256)
      : Object.hasOwn(value, "stderrTailSha256"))
  ) {
    throw new TypeError("Invalid serialized stderr diagnostics");
  }
}

function assertFailurePhase(value) {
  if (
    Object.hasOwn(value, "failurePhase") &&
    !allowedHarnessFailurePhases.has(value.failurePhase)
  ) {
    throw new TypeError("Invalid serialized error failure phase");
  }
}

function assertOnlyKeys(value, allowed) {
  const keySet = new Set(allowed);
  if (Object.keys(value).some((key) => !keySet.has(key))) {
    throw new TypeError("Serialized error contains an unknown field");
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function isSafeSerializedScalar(value) {
  return value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && (value === "omitted" || /^-?[0-9]+$/u.test(value)));
}

function isUniqueAllowlistedArray(value, allowed) {
  return Array.isArray(value) &&
    value.length <= allowed.size &&
    new Set(value).size === value.length &&
    value.every((entry) => allowed.has(entry));
}

function safeProcessExitCode(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeProcessSignal(value) {
  return typeof value === "string" && allowedProcessSignals.has(value) ? value : null;
}

function extractStasisCrashMarkers(stderrTail) {
  return crashMarkerNeedles
    .filter(({ needle }) => stderrTail.includes(needle))
    .map(({ marker }) => marker);
}

function extractStasisLifecyclePhases(stderrTail) {
  const found = [];
  const retained = new Set();
  const pattern = /stasis_lifecycle_v1 phase=([a-z_]+)/gu;
  for (const match of stderrTail.matchAll(pattern)) {
    const phase = match[1];
    if (allowedLifecyclePhases.has(phase) && !retained.has(phase)) {
      retained.add(phase);
      found.push(phase);
    }
  }
  return found;
}

function allowlistedValue(value, allowed, fallback) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function safeScalar(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "boolean" || value === null) return value;
  return "omitted";
}

function isSensitiveArtifactKey(key) {
  const normalized = String(key).toLowerCase();
  if (
    [
      "cookies",
      "messageomitted",
      "stderrtailomitted",
      "opaqueidentifiersomitted",
      "passwordexcludedfromreport",
    ].includes(normalized)
  ) {
    return false;
  }
  return (
    /^(?:message|stderrTail|displayError|errorMessages)$/iu.test(key) ||
    /(?:token|secret)$/iu.test(normalized) ||
    normalized === "password" ||
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "sessionid" ||
    normalized === "apikey" ||
    normalized === "cookieheader" ||
    normalized === "setcookie"
  );
}

const allowedThrownTypes = new Set([
  "bigint",
  "boolean",
  "function",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
]);

const allowedHarnessFailurePhases = new Set(["crawl", "pool_close"]);

const allowedProcessSignals = new Set([
  "SIGABRT",
  "SIGBUS",
  "SIGFPE",
  "SIGILL",
  "SIGKILL",
  "SIGSEGV",
  "SIGTERM",
  "SIGTRAP",
]);

const crashMarkerNeedles = Object.freeze([
  Object.freeze({
    marker: "mozalloc_abort",
    needle: "Redirecting call to abort() to mozalloc_abort",
  }),
]);
const allowedCrashMarkers = new Set(crashMarkerNeedles.map(({ marker }) => marker));

// This is the exact compile-time lifecycle vocabulary of the frozen Stasis
// v0.3.3 revision. Only these values can cross the public artifact boundary.
const allowedLifecyclePhases = new Set([
  "paint_pipeline_retirement_owners_observed",
  "painter_webrender_retirement_send_begin",
  "painter_webrender_retirement_frame_built_queued",
  "painter_renderer_retirement_removal_consumed",
  "painter_webrender_retirement_transaction_failed",
  "constellation_paint_retirement_callback_observed",
  "controlled_replacement_reroute_begin",
  "close_accepted",
  "engine_close_begin",
  "webview_drop_begin",
  "painter_drop_begin",
  "painter_webrender_shutdown_begin",
  "painter_webrender_shutdown_ack_observed",
  "painter_webrender_shutdown_failed",
  "painter_webrender_threads_join_begin",
  "painter_webrender_threads_join_end",
  "painter_webrender_threads_join_failed",
  "painter_webrender_workers_join_begin",
  "painter_webrender_workers_join_end",
  "painter_webrender_workers_join_failed",
  "painter_renderer_deinit_begin",
  "painter_renderer_deinit_end",
  "painter_renderer_deinit_failed",
  "painter_drop_body_end",
  "webview_drop_end",
  "pre_shutdown_spin_begin",
  "pre_shutdown_spin_end",
  "servo_owner_drop_begin",
  "servo_inner_drop_begin",
  "constellation_exit_send_begin",
  "script_threads_join_begin",
  "script_threads_join_end",
  "script_threads_join_failed",
  "style_thread_pool_shutdown_begin",
  "style_thread_pool_shutdown_end",
  "style_thread_pool_shutdown_failed",
  "fetch_thread_join_begin",
  "fetch_thread_join_end",
  "fetch_thread_join_failed",
  "canvas_paint_thread_join_begin",
  "canvas_paint_thread_join_end",
  "canvas_paint_thread_join_failed",
  "resource_manager_join_begin",
  "resource_manager_join_end",
  "resource_manager_join_failed",
  "storage_threads_join_begin",
  "storage_threads_join_end",
  "storage_threads_join_failed",
  "global_thread_pool_shutdown_begin",
  "global_thread_pool_shutdown_end",
  "global_thread_pool_shutdown_failed",
  "system_font_service_join_begin",
  "system_font_service_join_end",
  "system_font_service_join_failed",
  "async_runtime_shutdown_begin",
  "async_runtime_shutdown_end",
  "async_runtime_shutdown_failed",
  "subsystems_shutdown_end",
  "subsystems_shutdown_failed",
  "constellation_run_end",
  "constellation_state_drop_begin",
  "constellation_state_drop_end",
  "shutdown_complete_send_begin",
  "shutdown_complete_observed",
  "constellation_join_begin",
  "constellation_join_end",
  "constellation_join_failed",
  "tls_prewarm_join_begin",
  "tls_prewarm_join_end",
  "tls_prewarm_join_failed",
  "servo_inner_drop_body_end",
  "memory_profiler_exit_send_begin",
  "memory_profiler_join_begin",
  "memory_profiler_join_end",
  "memory_profiler_join_failed",
  "js_engine_drop_begin",
  "js_engine_drop_end",
  "js_engine_drop_failed",
  "servo_owner_drop_end",
  "engine_close_end",
  "engine_session_drop_begin",
  "engine_session_drop_end",
  "rendering_context_owner_drop_begin",
  "software_rendering_context_drop_begin",
  "software_rendering_context_drop_body_end",
  "surfman_rendering_context_drop_begin",
  "surfman_rendering_context_drop_body_end",
  "rendering_context_owner_drop_end",
  "close_response_written",
  "shell_run_end",
  "protocol_reader_join_begin",
  "protocol_reader_join_end",
  "protocol_reader_join_failed",
  "shell_drop_begin",
  "shell_drop_end",
  "main_body_end",
]);

const allowedErrorNames = new Set([
  "AbortError",
  "CandidateIdentityError",
  "Error",
  "ErrorCauseOmitted",
  "NonErrorThrow",
  "RuntimeIdentityError",
  "RwaHarnessError",
  "RwaSettleTerminalError",
  "StasisAbortError",
  "StasisCommandTimeoutError",
  "StasisProcessError",
  "StasisProtocolError",
  "StasisStateError",
  "StasisTransportError",
  "UnclassifiedError",
]);

const allowedStateEffects = new Set(["none", "partial", "indeterminate", "unknown"]);
const allowedOutcomes = new Set([
  "blocked_on_external_io",
  "blocked_on_open_ended_work",
  "quiescent",
  "quiescent_with_persistent_work",
  "runtime_error",
  "unsupported_work",
  "unknown",
]);
const allowedErrorCodes = new Set([
  "aborted",
  "audit_page_limit_exceeded",
  "audit_pagination_stalled",
  "automation_dom_traversal_limit_exceeded",
  "automation_match_limit_exceeded",
  "automation_output_limit_exceeded",
  "automation_selector_evaluation_limit_exceeded",
  "close_timeout",
  "command_timeout",
  "control_turn_limit_exceeded",
  "controlled_network_active_operation_limit_exceeded",
  "controlled_open_timeout",
  "cross_event_loop_navigation",
  "disabled_activation_element",
  "document_automation_transport_failed",
  "document_control_transport_failed",
  "document_transition_limit_exceeded",
  "element_not_found",
  "engine_session_navigation_failed",
  "extraction_field_not_found",
  "history_limit_exceeded",
  "internal_runtime_failure",
  "invalid_automation_request",
  "invalid_controlled_cookie",
  "invalid_envelope",
  "invalid_extract_mapping",
  "invalid_json",
  "invalid_request",
  "invalid_result",
  "invalid_sdk_state",
  "invalid_seeded_user",
  "invalid_select_multiplicity",
  "invalid_selector",
  "invalid_session_cookie",
  "invalid_session_state_profile",
  "invalid_session_state_schema",
  "invalid_session_state_sensitive_marker",
  "invalid_session_storage_origin",
  "invalid_session_storage_scope",
  "invalid_state",
  "invalid_testdata_response",
  "invalid_utf8",
  "microtask_limit_exceeded",
  "mutation_limit_exceeded",
  "navigation_authority_changed",
  "navigation_failed",
  "navigation_in_progress",
  "navigation_source_inactive",
  "navigation_start_failed",
  "navigation_transport_failure",
  "node_runtime_mismatch",
  "process_exit",
  "redirect_limit_exceeded",
  "rendering_limit_exceeded",
  "request_encoding_failed",
  "request_frame_too_large",
  "request_sequence_exhausted",
  "seeded_user_missing",
  "select_value_disabled",
  "select_value_not_found",
  "session_command_transport_failure",
  "session_navigation_authority_unavailable",
  "settle_blocked_on_external_io",
  "settle_blocked_on_open_ended_work",
  "settle_runtime_error",
  "settle_unsupported_work",
  "stale_generation",
  "stale_session_state_token",
  "stale_state_token",
  "stasis_executable_hash_mismatch",
  "stdin_error",
  "stdin_write_failed",
  "task_limit_exceeded",
  "termination_timeout",
  "unclassified_error",
  "unexpected_stdout_eof",
  "unknown_mapped_action",
  "unresolved_fixture_reference",
  "unsupported_activation_element",
  "unsupported_check_element",
  "unsupported_cookie_same_site_context",
  "unsupported_dom_serialization",
  "unsupported_fill_element",
  "unsupported_focus_element",
  "unsupported_navigation_scheme",
  "unsupported_network_request_body_length",
  "unsupported_network_request_metadata",
  "unsupported_open_ended_source",
  "unsupported_partitioned_cookie",
  "unsupported_persistent_cookie",
  "unsupported_profile_method",
  "unsupported_protocol",
  "unsupported_select_element",
  "unsupported_selector",
  "unsupported_submit_element",
  "unsupported_uncheck_element",
  "unsupported_work",
  "upstream_testdata_http_error",
  "virtual_time_limit_exceeded",
  "wall_time_limit_exceeded",
]);

function redactCredentialSyntax(value) {
  return value
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/giu, "$1 [REDACTED]")
    .replace(/\b(authorization|proxy-authorization|set-cookie|cookie)\s*[:=]\s*[^\r\n]+/giu, "$1: [REDACTED]")
    .replace(/([?&](?:token|secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token)=)[^&#\s]*/giu, "$1[REDACTED]");
}

export function canonicalHttpUrl(value, base) {
  const url = base === undefined ? new URL(value) : new URL(value, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`Expected HTTP(S), got ${url.protocol}`);
  }
  url.hash = "";
  return url.href;
}

export function monotonicMilliseconds(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}
