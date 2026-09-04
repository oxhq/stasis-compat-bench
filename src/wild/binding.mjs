import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";

import {
  preflightRules,
  preflightLedgerPath,
  protocol,
  selectedCorpusPath,
  selectionSeed,
  strata,
  trancoInputPath,
  trancoListId,
  trancoSourceIdentity,
  trancoSourceMetadataSha256,
} from "./config.mjs";
import { assertWildArtifactPrivacy } from "./artifact-privacy.mjs";
import { assertPinnedRuntimeIdentity } from "./runtime-identity.mjs";
import { deterministicRankOrder, loadVerifiedTrancoDomains } from "./selection.mjs";
import { repositoryRoot, sha256File } from "../shared/io.mjs";

const execFileAsync = promisify(execFile);

export async function assertFrozenWildBinding({
  expectedCommit = process.env.STASIS_WILD_FROZEN_COMMIT,
  expectedCorpusSha256 = process.env.STASIS_WILD_CORPUS_SHA256,
} = {}) {
  if (!/^[a-f0-9]{40}$/iu.test(expectedCommit ?? "")) {
    throw new Error("STASIS_WILD_FROZEN_COMMIT must be one exact 40-hex commit");
  }
  if (!/^[a-f0-9]{64}$/iu.test(expectedCorpusSha256 ?? "")) {
    throw new Error("STASIS_WILD_CORPUS_SHA256 must be one exact 64-hex SHA-256");
  }

  const [headBuffer, statusBuffer] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  const head = headBuffer.toString("utf8").trim().toLowerCase();
  if (head !== expectedCommit.toLowerCase()) {
    throw new Error(`Frozen harness commit mismatch: expected ${expectedCommit}, got ${head}`);
  }
  const status = statusBuffer.toString("utf8").trim();
  if (status.length > 0) {
    throw new Error("Wild census requires a clean harness worktree");
  }

  const [corpusBytes, ledgerBytes, verifiedSource] = await Promise.all([
    assertTrackedBytesMatchHead(selectedCorpusPath),
    assertTrackedBytesMatchHead(preflightLedgerPath),
    loadVerifiedTrancoDomains(trancoInputPath, trancoSourceIdentity),
  ]);
  const corpusSha256 = sha256(corpusBytes);
  if (corpusSha256 !== expectedCorpusSha256.toLowerCase()) {
    throw new Error(
      `Frozen corpus SHA-256 mismatch: expected ${expectedCorpusSha256}, got ${corpusSha256}`,
    );
  }
  const ledgerSha256 = sha256(ledgerBytes);

  const corpus = JSON.parse(corpusBytes.toString("utf8"));
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  const safeEntries = validateFrozenCorpus(
    corpus,
    ledger,
    ledgerSha256,
    verifiedSource.domains,
  );
  return {
    harnessCommit: head,
    preregistrationCommit: corpus.preregistrationCommit,
    corpusSha256,
    preflightLedgerSha256: ledgerSha256,
    corpusPath: relativeGitPath(selectedCorpusPath),
    preflightLedgerPath: relativeGitPath(preflightLedgerPath),
    preflightRuntime: ledger.runtime,
    corpus: { ...corpus, urls: safeEntries },
  };
}

export function validateFrozenCorpus(corpus, ledger, actualLedgerSha256, sourceDomains) {
  assertWildArtifactPrivacy(corpus);
  assertWildArtifactPrivacy(ledger);
  const expectedCount = strata.reduce((total, stratum) => total + stratum.quota, 0);
  if (
    !hasExactKeys(corpus, [
      "count",
      "preregistrationCommit",
      "protocol",
      "schema",
      "selection",
      "source",
      "urls",
    ]) ||
    corpus?.schema !== "stasis-wild-corpus-v1" ||
    corpus.protocol !== protocol ||
    corpus.source?.listId !== trancoListId ||
    corpus.count !== expectedCount ||
    corpus.selection?.seed !== selectionSeed ||
    corpus.selection?.algorithm !== "sha256-u64be-offset-coprime-stride-full-cycle-v1" ||
    !hasExactKeys(corpus.selection, [
      "algorithm",
      "eligibility",
      "preflightLedger",
      "preflightLedgerSha256",
      "seed",
      "strata",
    ]) ||
    corpus.selection.preflightLedger !== path.basename(preflightLedgerPath) ||
    !Array.isArray(corpus.urls) ||
    corpus.urls.length !== expectedCount ||
    (typeof sourceDomains !== "object" && typeof sourceDomains !== "function") ||
    sourceDomains === null
  ) {
    throw new Error("Frozen wild corpus has an invalid top-level shape");
  }
  if (
    !hasExactKeys(ledger, [
      "attemptedCount",
      "attempts",
      "completedAt",
      "excludedCount",
      "permutation",
      "preregistrationCommit",
      "protocol",
      "rules",
      "runtime",
      "schema",
      "selectedCount",
      "source",
      "startedAt",
    ]) ||
    ledger?.schema !== "stasis-wild-preflight-ledger-v2" ||
    ledger.protocol !== protocol ||
    !/^[a-f0-9]{40}$/u.test(corpus.preregistrationCommit ?? "") ||
    corpus.preregistrationCommit !== ledger.preregistrationCommit ||
    ledger.selectedCount !== expectedCount ||
    !Array.isArray(ledger.attempts) ||
    ledger.attemptedCount !== ledger.attempts.length ||
    ledger.excludedCount !== ledger.attemptedCount - expectedCount ||
    !validIsoInstant(ledger.startedAt) ||
    !validIsoInstant(ledger.completedAt) ||
    ledger.completedAt < ledger.startedAt ||
    !isDeepStrictEqual(ledger.rules, preflightRules) ||
    !isDeepStrictEqual(corpus.source, ledger.source) ||
    !validProjectedSource(corpus.source) ||
    !validProjectedRuntime(ledger.runtime) ||
    !validPermutationEvidence(corpus, ledger, sourceDomains) ||
    corpus.selection?.eligibility !== "baseline-preflight-v2" ||
    corpus.selection?.preflightLedgerSha256 !== actualLedgerSha256
  ) {
    throw new Error("Frozen wild preflight ledger binding is invalid");
  }

  const ranks = new Set();
  const domains = new Set();
  const urls = new Set();
  const perStratum = new Map();
  for (let index = 0; index < corpus.urls.length; index += 1) {
    const entry = corpus.urls[index];
    validateCorpusEntry(entry, index + 1, sourceDomains);
    if (ranks.has(entry.rank) || domains.has(entry.domain) || urls.has(entry.requestedUrl)) {
      throw new Error("Frozen wild corpus contains duplicate rank, domain, or URL entries");
    }
    ranks.add(entry.rank);
    domains.add(entry.domain);
    urls.add(entry.requestedUrl);
    perStratum.set(entry.stratumId, (perStratum.get(entry.stratumId) ?? 0) + 1);
  }
  for (const stratum of strata) {
    if (perStratum.get(stratum.id) !== stratum.quota) {
      throw new Error(`Frozen wild corpus quota mismatch for ${stratum.id}`);
    }
  }

  const selectedAttempts = ledger.attempts.filter((attempt) => attempt?.outcome === "selected");
  if (
    selectedAttempts.length !== expectedCount ||
    selectedAttempts.some((attempt, index) => !validSelectedAttempt(attempt, corpus.urls[index]))
  ) {
    throw new Error("Frozen corpus entries do not match the selected preflight attempts");
  }
  return corpus.urls.map(canonicalCorpusEntry);
}

async function assertTrackedBytesMatchHead(absolutePath) {
  const relativePath = relativeGitPath(absolutePath);
  await git(["ls-files", "--error-unmatch", "--", relativePath]);
  const [localBytes, committedBytes] = await Promise.all([
    readFile(absolutePath),
    git(["show", `HEAD:${relativePath}`]),
  ]);
  if (!localBytes.equals(committedBytes)) {
    throw new Error(`Tracked wild input differs from HEAD: ${relativePath}`);
  }
  return localBytes;
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

function validateCorpusEntry(entry, expectedSlot, sourceDomains) {
  if (
    typeof entry !== "object" ||
    entry === null ||
    !hasExactKeys(entry, [
      "domain",
      "permutationIndex",
      "rank",
      "requestedUrl",
      "slot",
      "stratumId",
      "stratumSlot",
    ]) ||
    entry.slot !== expectedSlot ||
    !Number.isSafeInteger(entry.rank) ||
    !Number.isSafeInteger(entry.stratumSlot) ||
    !Number.isSafeInteger(entry.permutationIndex) ||
    typeof entry.domain !== "string" ||
    typeof entry.stratumId !== "string" ||
    typeof entry.requestedUrl !== "string"
  ) {
    throw new Error(`Invalid frozen wild corpus entry at slot ${expectedSlot}`);
  }
  const stratum = strata.find(({ id }) => id === entry.stratumId);
  const url = new URL(entry.requestedUrl);
  const sourceDomain = sourceDomains[entry.rank];
  if (
    stratum === undefined ||
    entry.rank < stratum.minRank ||
    entry.rank > stratum.maxRank ||
    typeof sourceDomain !== "string" ||
    entry.domain !== sourceDomain ||
    url.protocol !== "https:" ||
    url.hostname !== entry.domain ||
    entry.requestedUrl !== `https://${entry.domain}/` ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(`Unsafe or out-of-stratum frozen corpus entry at slot ${expectedSlot}`);
  }
}

function validSelectedAttempt(attempt, entry) {
  return (
    hasExactKeys(attempt, [
      "domain",
      "outcome",
      "permutationIndex",
      "rank",
      "reason",
      "requestedUrl",
      "robots",
      "rootGate",
      "selectedSlot",
      "stage",
      "stratumId",
      "stratumSlot",
    ]) &&
    attempt.outcome === "selected" &&
    attempt.stage === "eligible" &&
    attempt.selectedSlot === entry.slot &&
    attempt.stratumSlot === entry.stratumSlot &&
    attempt.permutationIndex === entry.permutationIndex &&
    attempt.rank === entry.rank &&
    attempt.domain === entry.domain &&
    attempt.stratumId === entry.stratumId &&
    attempt.requestedUrl === entry.requestedUrl &&
    hasExactKeys(attempt.reason, [
      "code",
      "contentType",
      "finalUrlIdentity",
      "linkCount",
      "responseStatus",
      "status",
      "titleCodePointLength",
      "titleIdentity",
      "titleUtf8Bytes",
      "wallTimeMs",
    ]) &&
    attempt.reason?.status === "success" &&
    attempt.reason?.code === "eligible" &&
    Number.isSafeInteger(attempt.reason?.responseStatus) &&
    attempt.reason.responseStatus >= 200 &&
    attempt.reason.responseStatus < 400 &&
    ["text/html", "application/xhtml+xml"].includes(attempt.reason?.contentType) &&
    isSha256(attempt.reason?.finalUrlIdentity) &&
    isSha256(attempt.reason?.titleIdentity) &&
    Number.isSafeInteger(attempt.reason?.titleCodePointLength) &&
    attempt.reason.titleCodePointLength >= 0 &&
    Number.isSafeInteger(attempt.reason?.titleUtf8Bytes) &&
    attempt.reason.titleUtf8Bytes >= 0 &&
    Number.isSafeInteger(attempt.reason?.linkCount) &&
    attempt.reason.linkCount >= 0 &&
    finiteNonnegative(attempt.reason.wallTimeMs) &&
    validAllowedRobots(attempt.robots) &&
    validRootGate(attempt.rootGate)
  );
}

function validAttempt(attempt, sourceDomains) {
  if (
    typeof attempt !== "object" ||
    attempt === null ||
    !Number.isSafeInteger(attempt.rank) ||
    typeof attempt.stratumId !== "string" ||
    !Number.isSafeInteger(attempt.permutationIndex) ||
    attempt.permutationIndex < 0 ||
    typeof attempt.domain !== "string" ||
    attempt.domain !== sourceDomains[attempt.rank] ||
    attempt.requestedUrl !== `https://${attempt.domain}/`
  ) {
    return false;
  }
  if (attempt.outcome === "selected") {
    if (
      !Number.isSafeInteger(attempt.selectedSlot) ||
      attempt.selectedSlot < 1 ||
      !Number.isSafeInteger(attempt.stratumSlot) ||
      attempt.stratumSlot < 1
    ) {
      return false;
    }
    return validSelectedAttempt(attempt, {
      slot: attempt.selectedSlot,
      stratumSlot: attempt.stratumSlot,
      permutationIndex: attempt.permutationIndex,
      rank: attempt.rank,
      domain: attempt.domain,
      stratumId: attempt.stratumId,
      requestedUrl: attempt.requestedUrl,
    });
  }
  return attempt.outcome === "excluded" && validExcludedAttempt(attempt);
}

function validExcludedAttempt(attempt) {
  const common = [
    "domain",
    "outcome",
    "permutationIndex",
    "rank",
    "reason",
    "requestedUrl",
    "stage",
    "stratumId",
  ];
  if (attempt.stage === "public_target") {
    if (hasExactKeys(attempt, common)) {
      return validPublicTargetReason(attempt.reason);
    }
    return hasExactKeys(attempt, [...common, "robots", "rootGate"]) &&
      validAllowedRobots(attempt.robots) &&
      validRootGate(attempt.rootGate) &&
      validBaselineExcludedReason(attempt.reason, new Set(["safety_rejected"]));
  }
  if (attempt.stage === "robots") {
    return hasExactKeys(attempt, [...common, "rootGate"]) &&
      validRootGate(attempt.rootGate) &&
      validRobotsExclusion(attempt.reason);
  }
  if (attempt.stage === "baseline") {
    return hasExactKeys(attempt, [...common, "robots", "rootGate"]) &&
      validAllowedRobots(attempt.robots) &&
      validRootGate(attempt.rootGate) &&
      validBaselineExcludedReason(attempt.reason, new Set(["failure", "policy_excluded"]));
  }
  return false;
}

function validPublicTargetReason(reason) {
  if (typeof reason !== "object" || reason === null || typeof reason.code !== "string") {
    return false;
  }
  if (reason.code === "non_global_address") {
    return hasExactKeys(reason, ["code", "family"]) && [4, 6, "unknown"].includes(reason.family);
  }
  if (reason.code === "non_http_scheme") {
    return hasExactKeys(reason, ["code", "protocol"]) &&
      typeof reason.protocol === "string" && /^[a-z][a-z0-9+.-]{0,31}:$/u.test(reason.protocol);
  }
  return hasExactKeys(reason, ["code"]) && new Set([
    "credential_bearing_url",
    "dns_empty_answer",
    "dns_resolution_failed",
    "empty_hostname",
    "https_required",
    "malformed_url",
    "public_target_gate_error",
    "reserved_hostname",
    "reserved_hostname_suffix",
    "single_label_hostname",
  ]).has(reason.code);
}

function validRobotsExclusion(reason) {
  if (
    typeof reason !== "object" ||
    reason === null ||
    !Number.isSafeInteger(reason.redirectCount) ||
    reason.redirectCount < 0 ||
    reason.redirectCount > 5
  ) {
    return false;
  }
  if (reason.status === "denied") {
    return hasExactKeys(reason, ["reason", "redirectCount", "status"]) &&
      reason.reason === "robots_disallowed";
  }
  if (reason.status === "unsafe") {
    return hasExactKeys(reason, ["detail", "reason", "redirectCount", "status"]) &&
      reason.reason === "robots_target_rejected" &&
      validPublicTargetReason(reason.detail);
  }
  if (reason.status !== "unavailable") return false;
  if (reason.reason === "robots_http_status") {
    return hasExactKeys(reason, ["httpStatus", "reason", "redirectCount", "status"]) &&
      Number.isSafeInteger(reason.httpStatus) && reason.httpStatus >= 100 && reason.httpStatus <= 599;
  }
  return hasExactKeys(reason, ["reason", "redirectCount", "status"]) && new Set([
    "robots_body_failed",
    "robots_fetch_failed",
    "robots_invalid_redirect",
    "robots_redirect_limit",
    "robots_redirect_without_location",
    "robots_timeout",
    "robots_too_large",
  ]).has(reason.reason);
}

function validAllowedRobots(value) {
  return hasExactKeys(value, ["reason", "redirectCount", "status"]) &&
    value.status === "allowed" &&
    ["robots_allowed", "robots_not_found"].includes(value.reason) &&
    Number.isSafeInteger(value.redirectCount) &&
    value.redirectCount >= 0 &&
    value.redirectCount <= 5;
}

function validRootGate(value) {
  return hasExactKeys(value, ["addressCount", "families"]) &&
    Number.isSafeInteger(value.addressCount) &&
    value.addressCount > 0 &&
    Array.isArray(value.families) &&
    value.families.length > 0 &&
    value.families.every((family, index, values) =>
      [4, 6].includes(family) && (index === 0 || values[index - 1] < family)
    );
}

function validBaselineExcludedReason(reason, allowedStatuses) {
  if (
    typeof reason !== "object" ||
    reason === null ||
    !allowedStatuses.has(reason.status) ||
    typeof reason.code !== "string" ||
    !finiteNonnegative(reason.wallTimeMs)
  ) {
    return false;
  }
  if (["navigation_failed", "navigation_timeout"].includes(reason.code)) {
    return reason.status === "failure" && hasExactKeys(reason, ["code", "status", "wallTimeMs"]);
  }
  if (reason.code === "top_level_http_status") {
    return reason.status === "failure" &&
      hasExactKeys(reason, ["code", "finalUrlIdentity", "responseStatus", "status", "wallTimeMs"]) &&
      isSha256(reason.finalUrlIdentity) &&
      (reason.responseStatus === null ||
        (Number.isSafeInteger(reason.responseStatus) &&
          (reason.responseStatus < 200 || reason.responseStatus >= 400)));
  }
  if (reason.code === "non_html_document") {
    return reason.status === "failure" &&
      hasExactKeys(reason, [
        "code", "contentType", "finalUrlIdentity", "responseStatus", "status", "wallTimeMs",
      ]) &&
      isSha256(reason.finalUrlIdentity) &&
      Number.isSafeInteger(reason.responseStatus) &&
      reason.responseStatus >= 200 && reason.responseStatus < 400 &&
      typeof reason.contentType === "string" &&
      !["text/html", "application/xhtml+xml"].includes(reason.contentType);
  }
  if (new Set([
    "access_denied",
    "captcha_challenge",
    "cloudflare_challenge",
    "human_verification",
    "robot_check",
  ]).has(reason.code)) {
    return reason.status === "policy_excluded" &&
      hasExactKeys(reason, [
        "code", "contentType", "finalUrlIdentity", "responseStatus", "status", "wallTimeMs",
      ]) &&
      isSha256(reason.finalUrlIdentity) &&
      Number.isSafeInteger(reason.responseStatus) &&
      reason.responseStatus >= 200 && reason.responseStatus < 400 &&
      ["text/html", "application/xhtml+xml"].includes(reason.contentType);
  }
  if (["non_read_only_request", "request_target_rejected"].includes(reason.code)) {
    const expectedStatus = reason.code === "request_target_rejected" ? "safety_rejected" : "policy_excluded";
    return reason.status === expectedStatus &&
      hasExactKeys(reason, [
        "blockedRequestDetailsOmitted", "blockedRequests", "code", "status", "wallTimeMs",
      ]) &&
      validBlockedRequests(reason.blockedRequests, reason.code) &&
      Number.isSafeInteger(reason.blockedRequestDetailsOmitted) &&
      reason.blockedRequestDetailsOmitted >= 0;
  }
  if (reason.code === "final_target_rejected") {
    return reason.status === "safety_rejected" &&
      hasExactKeys(reason, ["code", "detail", "status", "wallTimeMs"]) &&
      validPublicTargetReason(reason.detail);
  }
  return false;
}

function validBlockedRequests(items, reasonCode) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 32) return false;
  let sawNonPublic = false;
  for (const item of items) {
    if (item?.code === "non_read_only_method") {
      if (
        !hasExactKeys(item, ["code", "method", "resourceType"]) ||
        typeof item.method !== "string" ||
        !/^[A-Z][A-Z0-9!#$%&'*+.^_`|~-]{0,31}$/u.test(item.method) ||
        !validResourceType(item.resourceType)
      ) return false;
      continue;
    }
    if (
      item?.code !== "non_public_request" ||
      !hasExactKeys(item, ["code", "detail", "resourceType"]) ||
      !validResourceType(item.resourceType) ||
      !validPublicTargetReason(item.detail)
    ) return false;
    sawNonPublic = true;
  }
  return reasonCode === "request_target_rejected" ? sawNonPublic : !sawNonPublic;
}

function validResourceType(value) {
  return new Set([
    "document", "eventsource", "fetch", "font", "image", "manifest", "media", "other",
    "ping", "script", "stylesheet", "texttrack", "websocket", "xhr",
  ]).has(value);
}

function validProjectedSource(source) {
  return (
    hasExactKeys(source, [
      "bytes",
      "createdOn",
      "downloadUrl",
      "listId",
      "metadataFile",
      "metadataSha256",
      "rowCount",
      "sha256",
    ]) &&
    source?.listId === trancoSourceIdentity.listId &&
    source.createdOn === trancoSourceIdentity.createdOn &&
    source.downloadUrl === trancoSourceIdentity.downloadUrl &&
    source.bytes === trancoSourceIdentity.bytes &&
    source.sha256 === trancoSourceIdentity.sha256 &&
    source.rowCount === trancoSourceIdentity.rowCount &&
    source.metadataFile === "tranco-74V4X-source.json" &&
    source.metadataSha256 === trancoSourceMetadataSha256
  );
}

function validProjectedRuntime(runtime) {
  if (
    !hasExactKeys(runtime, [
      "candidateSdk",
      "candidateSdkTarball",
      "candidateSdkTarballBytes",
      "candidateSdkTarballSha256",
      "candidateSdkTree",
      "chromiumExecutableBasename",
      "chromiumExecutableBytes",
      "chromiumExecutableSha256",
      "chromiumVersion",
      "crawlee",
      "crawleeTree",
      "harnessSdk",
      "installedNodeModulesTree",
      "node",
      "nodeExecutableBasename",
      "nodeExecutableBytes",
      "nodeExecutableSha256",
      "playwright",
      "playwrightTree",
    ]) ||
    runtime.candidateSdkTarball !== "candidate/oxhq-stasis-0.3.0.tgz" ||
    typeof runtime.chromiumVersion !== "string" ||
    !/^\d+(?:\.\d+){1,3}$/u.test(runtime.chromiumVersion) ||
    ![runtime.candidateSdkTree, runtime.crawleeTree, runtime.playwrightTree,
      runtime.installedNodeModulesTree].every(validTreeIdentity)
  ) {
    return false;
  }
  try {
    assertPinnedRuntimeIdentity(runtime);
    return true;
  } catch {
    return false;
  }
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validPermutationEvidence(corpus, ledger, sourceDomains) {
  if (
    !Array.isArray(ledger.permutation) ||
    ledger.permutation.length !== strata.length ||
    !isDeepStrictEqual(corpus.selection?.strata, ledger.permutation)
  ) {
    return false;
  }
  let consumedAttempts = 0;
  for (const stratum of strata) {
    const order = deterministicRankOrder(stratum, selectionSeed);
    const frozen = ledger.permutation.find((item) => item?.stratumId === stratum.id);
    if (
      !hasExactKeys(frozen, [
        "length",
        "maxAttempts",
        "maxRank",
        "minRank",
        "offset",
        "quota",
        "stratumId",
        "stride",
      ]) ||
      frozen?.minRank !== stratum.minRank ||
      frozen.maxRank !== stratum.maxRank ||
      frozen.quota !== stratum.quota ||
      frozen.maxAttempts !== stratum.maxAttempts ||
      frozen.offset !== order.offset ||
      frozen.stride !== order.stride ||
      frozen.length !== order.length
    ) {
      return false;
    }
    const attempts = ledger.attempts.filter((attempt) => attempt?.stratumId === stratum.id);
    if (
      attempts.length === 0 ||
      attempts.length > stratum.maxAttempts ||
      ledger.attempts
        .slice(consumedAttempts, consumedAttempts + attempts.length)
        .some((attempt, index) => attempt !== attempts[index]) ||
      attempts.some((attempt, index) =>
        !validAttempt(attempt, sourceDomains) ||
        attempt.permutationIndex !== index ||
        attempt.rank !== order.rankAt(index) ||
        attempt.domain !== sourceDomains[attempt.rank] ||
        attempt.requestedUrl !== `https://${sourceDomains[attempt.rank]}/`
      )
    ) {
      return false;
    }
    consumedAttempts += attempts.length;
    const selected = attempts.filter((attempt) => attempt.outcome === "selected");
    if (
      selected.length !== stratum.quota ||
      selected.some((attempt, index) => attempt.stratumSlot !== index + 1) ||
      attempts.at(-1) !== selected.at(-1)
    ) {
      return false;
    }
  }
  return consumedAttempts === ledger.attempts.length;
}

function validTreeIdentity(value) {
  return hasExactKeys(value, ["fileCount", "sha256", "totalBytes"]) &&
    isSha256(value.sha256) &&
    Number.isSafeInteger(value.fileCount) && value.fileCount > 0 &&
    Number.isSafeInteger(value.totalBytes) && value.totalBytes > 0;
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validIsoInstant(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function hasExactKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function canonicalCorpusEntry(entry) {
  return {
    slot: entry.slot,
    stratumId: entry.stratumId,
    stratumSlot: entry.stratumSlot,
    permutationIndex: entry.permutationIndex,
    rank: entry.rank,
    domain: entry.domain,
    requestedUrl: entry.requestedUrl,
  };
}

function relativeGitPath(absolutePath) {
  return path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function frozenCorpusSha256() {
  return sha256File(selectedCorpusPath);
}
