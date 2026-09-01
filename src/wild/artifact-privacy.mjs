import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { artifactRoot, jsonReplacer, serializeError } from "../shared/io.mjs";
import { trancoSourceIdentity } from "./config.mjs";

const safeSensitiveMetadataKeys = new Set([
  "errormessagecount",
  "messageomitted",
  "opaqueidentifiersomitted",
  "passwordexcludedfromreport",
  "stderrtailbytes",
  "stderrtailomitted",
]);
const booleanSensitiveMetadataKeys = new Set([
  "messageomitted",
  "opaqueidentifiersomitted",
  "passwordexcludedfromreport",
  "stderrtailomitted",
]);
const countSensitiveMetadataKeys = new Set([
  "errormessagecount",
  "stderrtailbytes",
]);
const sensitiveKeys = new Set([
  "apikey",
  "authorization",
  "cookie",
  "cookieheader",
  "cookies",
  "credential",
  "credentials",
  "displayerror",
  "errormessages",
  "header",
  "headernames",
  "headers",
  "hostname",
  "id",
  "auth",
  "message",
  "navigationid",
  "nextrequestid",
  "password",
  "privatekey",
  "proxyauthorization",
  "redirectparentid",
  "requestheaders",
  "requestid",
  "responseheaders",
  "sessionid",
  "secretvalue",
  "setcookie",
  "sourceid",
  "stderrtail",
  "xapikey",
  "userid",
]);
const sensitiveKeySuffixes = [
  "apikey",
  "authorization",
  "credential",
  "credentials",
  "navigationid",
  "nextrequestid",
  "password",
  "privatekey",
  "redirectparentid",
  "requestid",
  "secret",
  "secretvalue",
  "sessionid",
  "sourceid",
  "stderrtail",
  "token",
  "userid",
];
const rawValueKeys = new Set([
  "currenturl",
  "finalurl",
  "href",
  "link",
  "links",
  "opencommittedurl",
  "pagetitle",
  "rawtitle",
  "title",
  "url",
]);
const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "cookie2",
  "proxyauthorization",
  "setcookie",
  "setcookie2",
  "xapikey",
]);
const reservedWindowsNames = /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/iu;
const wildMachineCodes = new Set([
  "ABORT_ERR",
  "EACCES",
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOENT",
  "ENOTFOUND",
  "EPERM",
  "EPIPE",
  "ERR_ABORTED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_FAILED",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_NETWORK_CHANGED",
  "ERR_TIMED_OUT",
  "ETIMEDOUT",
  "access_denied",
  "baseline_gate_not_allowed",
  "baseline_gate_harness_error",
  "baseline_harness_error",
  "baseline_not_successful",
  "baseline_not_eligible",
  "baseline_observer_threw",
  "blocked_on_external_io",
  "blocked_on_open_ended_work",
  "captcha_challenge",
  "clock_identity_changed",
  "clock_not_controlled",
  "cloudflare_challenge",
  "control_turn_limit_exceeded",
  "crawlee_run_failed",
  "credential_bearing_url",
  "current_url_observability",
  "dns_empty_answer",
  "dns_resolution_failed",
  "divergent",
  "empty_hostname",
  "eligible",
  "equivalent",
  "execution_counter_overflow",
  "extracted",
  "final_target_rejected",
  "gate_not_allowed",
  "https_required",
  "human_verification",
  "inconsistent_pending_evidence",
  "ineligible_logical_timer_head",
  "invalid",
  "invalid_success_evidence",
  "literal_private_target_aborted",
  "malformed_url",
  "microtask_limit_exceeded",
  "mismatched_advance_authority",
  "missing_advance_authority",
  "missing_finite_scheduler_head",
  "missing_terminal_observation",
  "mutation_limit_exceeded",
  "navigation_timeout",
  "non_global_address",
  "non_html_document",
  "non_http_scheme",
  "non_public_request",
  "non_read_only_method",
  "non_read_only_request",
  "public_target_gate_error",
  "public_target_rejected",
  "quiet_checkpoint_did_not_advance",
  "rendering_limit_exceeded",
  "request_target_rejected",
  "reserved_hostname",
  "reserved_hostname_suffix",
  "robot_check",
  "robots_body_failed",
  "robots_disallowed",
  "robots_fetch_failed",
  "robots_gate_threw",
  "robots_gate_invalid",
  "robots_http_status",
  "robots_invalid_redirect",
  "robots_not_allowed",
  "robots_redirect_limit",
  "robots_redirect_without_location",
  "robots_target_rejected",
  "robots_timeout",
  "robots_too_large",
  "runtime_close_failed",
  "runtime_error",
  "runtime_terminals",
  "session_close_failed",
  "single_label_hostname",
  "stasis_audit_incomplete",
  "stasis_cleanup_failed",
  "stasis_gate_harness_error",
  "stasis_harness_error",
  "stasis_gate_not_allowed",
  "stasis_missing_after_eligible_baseline",
  "stasis_observer_threw",
  "stasis_operation_failed",
  "stasis_policy_or_safety_rejected",
  "task_limit_exceeded",
  "top_level_http_status",
  "unclassified",
  "unclassified_scheduler_head",
  "unexpected_crawlee_skip",
  "unknown",
  "unknown_settlement_terminal",
  "unknown_stasis_observation_status",
  "unsupported_clock_surface",
  "unsupported_open_ended_source",
  "unsupported_rendering",
  "unsupported_retained_tasks",
  "unsupported_source",
  "unsupported_work",
  "virtual_time_limit_exceeded",
  "virtual_time_regressed",
  "wall_time_limit_exceeded",
  "web_view_identity_changed",
]);

export function serializeWildArtifact(value) {
  assertInputSensitiveKeys(value, [], new WeakSet());
  const json = JSON.stringify(value, jsonReplacer, 2);
  if (typeof json !== "string") {
    throw new Error("Wild artifact is not JSON-serializable as an object or value");
  }
  // Validate the exact plain-JSON projection that callers write unchanged.
  // Accessors and toJSON hooks may run while producing it, so privacy decisions
  // are made only after that projection exists.
  assertProjectedPrivacy(JSON.parse(json), [], new WeakSet());
  return `${json}\n`;
}

function assertInputSensitiveKeys(value, location, seen) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key)) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assertSafeProjectedKey(
      key,
      location,
      descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined,
    );
    if (descriptor !== undefined && "value" in descriptor) {
      assertInputSensitiveKeys(descriptor.value, [...location, key], seen);
    }
  }
}

export function assertWildArtifactPrivacy(value) {
  serializeWildArtifact(value);
}

export async function writeWildArtifactJson(relativePath, value) {
  const segments = portableArtifactPathSegments(relativePath);
  const bytes = serializeWildArtifact(value);
  const root = path.resolve(artifactRoot());
  const destination = path.resolve(root, ...segments);
  if (!isPathInside(root, destination)) {
    throw new TypeError("Wild artifact path must remain inside the artifact root");
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const [resolvedRoot, resolvedParent] = await Promise.all([
    realpath(root),
    realpath(path.dirname(destination)),
  ]);
  if (!samePath(root, resolvedRoot) || !isPathInside(resolvedRoot, resolvedParent, true)) {
    throw new TypeError("Wild artifact path resolves outside the artifact root");
  }
  await writeFile(destination, bytes, { encoding: "utf8", flag: "wx" });
  return destination;
}

function portableArtifactPathSegments(relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.length > 512 ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new TypeError("Wild artifact path must be one portable relative JSON path");
  }
  const segments = relativePath.split("/");
  if (
    segments.some((segment) =>
      segment.length === 0 ||
      segment.length > 128 ||
      !/^[a-z0-9][a-z0-9._-]*$/u.test(segment) ||
      segment.endsWith(".") ||
      reservedWindowsNames.test(segment.split(".", 1)[0])
    ) ||
    !segments.at(-1).endsWith(".json")
  ) {
    throw new TypeError("Wild artifact path must be one portable relative JSON path");
  }
  return segments;
}

function assertProjectedPrivacy(value, location, seen) {
  if (typeof value === "string") {
    assertSafeProjectedString(value, location);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    if (isSensitiveHeaderTuple(value)) {
      throw new Error(`Wild artifact contains a sensitive header tuple at ${formatLocation(location)}`);
    }
    value.forEach((item, index) => assertProjectedPrivacy(item, [...location, index], seen));
    return;
  }
  if (isSensitiveHeaderRecord(value)) {
    throw new Error(`Wild artifact contains a sensitive header record at ${formatLocation(location)}`);
  }
  for (const [key, item] of Object.entries(value)) {
    assertSafeProjectedKey(key, location, item);
    assertSafeMachineCode(key, item, [...location, key]);
    assertProjectedPrivacy(item, [...location, key], seen);
  }
}

function assertSafeProjectedKey(key, location, value) {
  if (/%[0-9a-f]{2}/iu.test(key)) {
    throw new Error(`Wild artifact contains encoded key material at ${formatLocation(location)}`);
  }
  const normalized = normalizeKey(key);
  if (safeSensitiveMetadataKeys.has(normalized)) {
    const valid = booleanSensitiveMetadataKeys.has(normalized)
      ? typeof value === "boolean"
      : countSensitiveMetadataKeys.has(normalized) &&
        Number.isSafeInteger(value) && value >= 0;
    if (!valid) {
      throw new Error(
        `Wild artifact contains invalid redaction metadata at ${formatLocation([...location, key])}`,
      );
    }
    return;
  }
  if (
    ["title", "url"].includes(normalized) &&
    location.at(-1) === "evidenceIdentity" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return;
  }
  if (
    sensitiveKeys.has(normalized) ||
    sensitiveKeySuffixes.some((suffix) => normalized.endsWith(suffix)) ||
    normalized.includes("cookie") ||
    rawValueKeys.has(normalized) ||
    normalized.endsWith("pagetitle") ||
    normalized.endsWith("rawtitle")
  ) {
    throw new Error(`Wild artifact contains a sensitive key at ${formatLocation(location)}`);
  }
}

function assertSafeMachineCode(key, value, location) {
  const normalized = normalizeKey(key);
  if (!["code", "dnscode", "excludedcode", "failurecode"].includes(normalized)) return;
  if (
    typeof value !== "string" ||
    !(
      wildMachineCodes.has(value) ||
      serializeError({ name: "Error", code: value }).code === value
    )
  ) {
    throw new Error(`Wild artifact contains an unrecognized machine code at ${formatLocation(location)}`);
  }
}

function assertSafeProjectedString(value, location) {
  assertSafeProjectedStringVariant(value, location);
  if (/%[0-9a-f]{2}/iu.test(value)) {
    throw new Error(`Wild artifact contains encoded string material at ${formatLocation(location)}`);
  }
}

function assertSafeProjectedStringVariant(value, location) {
  const displayLocation = formatLocation(location);
  if (path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new Error(`Wild artifact contains an absolute local path at ${displayLocation}`);
  }

  const httpMatch = /https?:\/\//iu.exec(value);
  if (httpMatch !== null) {
    if (httpMatch.index !== 0) {
      throw new Error(`Wild artifact contains an embedded public URL at ${displayLocation}`);
    }
    assertAllowedRawHttpUrl(value, location);
    return;
  }
  if (/[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
    throw new Error(`Wild artifact contains a non-HTTP raw URL at ${displayLocation}`);
  }
  if (/\b(?:blob|data|file|javascript|mailto|vbscript):/iu.test(value)) {
    throw new Error(`Wild artifact contains a non-public URL scheme at ${displayLocation}`);
  }
  if (/\b(?:https?|wss?|ftp|file)%(?:25)*3a/iu.test(value)) {
    throw new Error(`Wild artifact contains encoded URL material at ${displayLocation}`);
  }
  if (
    /\b(?:authorization|proxy[-_. ]?authorization|cookie|set[-_. ]?cookie|x[-_. ]?api[-_. ]?key|api[-_. ]?key|password|access[-_. ]?token|refresh[-_. ]?token)\s*[:=]/iu.test(value) ||
    /[?&](?:code|token|secret|password|api[-_. ]?key|access[-_. ]?token|refresh[-_. ]?token)=/iu.test(value)
  ) {
    throw new Error(`Wild artifact contains credential-like string material at ${displayLocation}`);
  }
  if (
    /(?:^|[\s"'=(])[a-z]:[^\s"']*[\\/]/iu.test(value) ||
    /\\\\(?:[?.]\\|[^\\])/u.test(value) ||
    /(?:^|[\s"'=(])\/\/[a-z0-9._~-]+(?:[/:]|$)/iu.test(value) ||
    /(?:^|[\s"'=(])\/(?!\/)[^\s"'<>]+/u.test(value) ||
    /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(value)
  ) {
    throw new Error(`Wild artifact contains embedded local path text at ${displayLocation}`);
  }
}

function assertAllowedRawHttpUrl(value, location) {
  const displayLocation = formatLocation(location);
  const kind = allowedRawUrlKind(location);
  if (kind === null) {
    throw new Error(`Wild artifact contains a raw URL outside an allowlisted field at ${displayLocation}`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Wild artifact contains an invalid public URL at ${displayLocation}`);
  }
  if (
    url.href !== value ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(`Wild artifact contains unsafe or noncanonical URL text at ${displayLocation}`);
  }
  if (kind === "download") {
    if (value !== trancoSourceIdentity.downloadUrl) {
      throw new Error(`Wild artifact contains an unrecognized source download URL at ${displayLocation}`);
    }
    return;
  }
  if (
    url.protocol !== "https:" ||
    url.port.length > 0 ||
    url.pathname !== "/" ||
    value !== `${url.origin}/`
  ) {
    throw new Error(`Wild artifact requested URL must be one canonical HTTPS origin root at ${displayLocation}`);
  }
}

function allowedRawUrlKind(location) {
  if (matchesLocation(location, ["downloadUrl"]) || matchesLocation(location, ["source", "downloadUrl"])) {
    return "download";
  }
  if (
    matchesLocation(location, ["requestedUrl"]) ||
    matchesLocation(location, ["entry", "requestedUrl"]) ||
    matchesLocation(location, ["observation", "requestedUrl"]) ||
    matchesLocation(location, ["failedCandidate", "requestedUrl"]) ||
    matchesLocation(location, ["baseline", "requestedUrl"]) ||
    matchesIndexedLocation(location, "attempts", "requestedUrl") ||
    matchesIndexedLocation(location, "urls", "requestedUrl")
  ) {
    return "requested";
  }
  return null;
}

function matchesLocation(actual, expected) {
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

function matchesIndexedLocation(actual, collection, field) {
  return actual.length === 3 && actual[0] === collection && Number.isSafeInteger(actual[1]) && actual[2] === field;
}

function isSensitiveHeaderTuple(value) {
  return value.length >= 2 && typeof value[0] === "string" && sensitiveHeaderNames.has(normalizeHeaderName(value[0]));
}

function isSensitiveHeaderRecord(value) {
  const entries = Object.entries(value).map(([key, item]) => [normalizeKey(key), item]);
  const headerNameKeys = new Set(["name", "key", "headername"]);
  const headerPayloadKeys = new Set(["content", "headervalue", "headervalues", "value", "values"]);
  const hasSensitiveName = entries.some(([key, candidate]) =>
    headerNameKeys.has(key) &&
    typeof candidate === "string" &&
    sensitiveHeaderNames.has(normalizeHeaderName(candidate))
  );
  if (!hasSensitiveName) return false;
  return entries.some(([key]) => headerPayloadKeys.has(key));
}

function normalizeKey(value) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]/gu, "");
}

function normalizeHeaderName(value) {
  return normalizeKey(value);
}

function formatLocation(location) {
  return location.reduce(
    (rendered, segment) => Number.isSafeInteger(segment)
      ? `${rendered}[${segment}]`
      : `${rendered}[${JSON.stringify(segment)}]`,
    "$",
  );
}

function isPathInside(root, candidate, allowEqual = false) {
  const relative = path.relative(root, candidate);
  return (allowEqual && relative.length === 0) || (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
