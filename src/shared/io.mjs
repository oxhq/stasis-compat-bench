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
    ...(typeof error.stderrTail === "string"
      ? { stderrTailOmitted: true, stderrTailBytes: Buffer.byteLength(error.stderrTail) }
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
