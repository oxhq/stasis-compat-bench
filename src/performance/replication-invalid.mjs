import { isDeepStrictEqual } from "node:util";

import {
  performanceReplicationExpectedArtifactNames,
  performanceReplicationHostedIdentity,
} from "./replication-hosted-provenance.mjs";

export const performanceReplicationInvalidSchema =
  "stasis-v0.3.3-performance-replication-invalid-v1";

export const performanceReplicationInvalidReasonCodes = deepFreeze({
  hosted_run_terminal_non_success: "HOSTED_RUN_TERMINAL_NON_SUCCESS",
  hosted_provenance_invalid: "HOSTED_PROVENANCE_INVALID",
  semantic_authority_invalid: "SEMANTIC_AUTHORITY_INVALID",
  artifact_binding_invalid: "ARTIFACT_BINDING_INVALID",
  publication_invalid: "PUBLICATION_INVALID",
});

export const performanceReplicationInvalidStages = Object.freeze(
  Object.keys(performanceReplicationInvalidReasonCodes),
);

const expectedArtifactNameSet = new Set(performanceReplicationExpectedArtifactNames);
const terminalNonSuccessConclusions = new Set([
  "action_required",
  "cancelled",
  "failure",
  "neutral",
  "skipped",
  "stale",
  "startup_failure",
  "timed_out",
]);
const originalRunId = 33851425108;
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/u;
const apiRoot = "https://api.github.com/repos";
const webRoot = "https://github.com";

export function buildPerformanceReplicationInvalidManifest(input = {}) {
  exactKeys(
    input,
    ["stage", "reasonCode", "runRecord", "artifactsListing"],
    "replication invalid builder input",
  );
  const { stage, reasonCode } = assertFailure(input.stage, input.reasonCode);
  const producer = projectRun(input.runRecord, stage);
  const artifacts = projectArtifacts(
    input.artifactsListing,
    producer.runId,
    producer.repositoryId,
  );

  return verifyPerformanceReplicationInvalidManifest({
    schema: performanceReplicationInvalidSchema,
    outcome: "REPLICATION_INVALID",
    failure: { stage, reasonCode },
    producer,
    artifacts,
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    retryAuthorized: false,
    replacementRunAuthorized: false,
  });
}

export function verifyPerformanceReplicationInvalidManifest(value) {
  assertPrivacyBoundary(value);
  exactKeys(value, [
    "schema",
    "outcome",
    "failure",
    "producer",
    "artifacts",
    "decisionState",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
    "retryAuthorized",
    "replacementRunAuthorized",
  ], "replication invalid manifest");
  if (
    value.schema !== performanceReplicationInvalidSchema ||
    value.outcome !== "REPLICATION_INVALID" ||
    value.decisionState !== "STAY_0_4_UNASSIGNED" ||
    value.generalizedSpeedClaimAuthorized !== false ||
    value.implementationWorkAuthorized !== false ||
    value.retryAuthorized !== false ||
    value.replacementRunAuthorized !== false
  ) {
    throw new TypeError("Replication invalid manifest changes its fail-closed boundary");
  }

  exactKeys(value.failure, ["stage", "reasonCode"], "replication invalid failure");
  const failure = assertFailure(value.failure.stage, value.failure.reasonCode);
  assertProducer(value.producer, failure.stage);
  assertProjectedArtifacts(value.artifacts);
  return deepFreeze(value);
}

function projectRun(value, stage) {
  const run = requireRecord(value, "replication invalid GitHub run record");
  const repository = requireRecord(
    run.repository,
    "replication invalid GitHub run repository",
  );
  const headRepository = requireRecord(
    run.head_repository,
    "replication invalid GitHub run head repository",
  );
  const repositoryId = positiveSafeInteger(
    repository.id,
    "replication invalid GitHub run repository ID",
  );
  const expected = performanceReplicationHostedIdentity;
  const checks = [
    [repository.full_name, expected.repository, "repository"],
    [headRepository.full_name, expected.repository, "head repository"],
    [headRepository.id, repositoryId, "head repository ID"],
    [run.workflow_id, expected.workflow.id, "workflow ID"],
    [run.name, expected.workflow.name, "workflow name"],
    [run.path, expected.workflow.path, "workflow path"],
    [run.head_branch, expected.headBranch, "head branch"],
    [run.head_sha, expected.headSha, "head SHA"],
    [run.event, expected.event, "event"],
    [run.run_attempt, expected.runAttempt, "run attempt"],
    [run.status, "completed", "terminal status"],
  ];
  for (const [actual, required, label] of checks) {
    if (actual !== required) {
      throw new TypeError(`Replication invalid GitHub run ${label} mismatch`);
    }
  }
  const runId = positiveSafeInteger(run.id, "replication invalid GitHub run ID");
  if (runId === originalRunId) {
    throw new TypeError("Replication invalid GitHub run reuses the original run ID");
  }
  assertStageConclusion(stage, run.conclusion);
  exactUrl(repository.url, `${apiRoot}/${expected.repository}`, "repository API URL");
  exactUrl(headRepository.url, `${apiRoot}/${expected.repository}`, "head repository API URL");
  exactUrl(run.url, `${apiRoot}/${expected.repository}/actions/runs/${runId}`, "run API URL");
  exactUrl(run.html_url, `${webRoot}/${expected.repository}/actions/runs/${runId}`, "run web URL");
  exactUrl(run.jobs_url, `${apiRoot}/${expected.repository}/actions/runs/${runId}/jobs`, "jobs API URL");
  exactUrl(
    run.artifacts_url,
    `${apiRoot}/${expected.repository}/actions/runs/${runId}/artifacts`,
    "artifacts API URL",
  );

  return {
    provider: "github-actions",
    repository: expected.repository,
    repositoryId,
    workflowId: expected.workflow.id,
    workflowName: expected.workflow.name,
    workflowPath: expected.workflow.path,
    event: expected.event,
    headBranch: expected.headBranch,
    headSha: expected.headSha,
    runId,
    runAttempt: expected.runAttempt,
    status: "completed",
    conclusion: run.conclusion,
  };
}

function projectArtifacts(value, runId, repositoryId) {
  const listing = requireRecord(value, "replication invalid artifacts listing");
  if (
    !Number.isSafeInteger(listing.total_count) ||
    listing.total_count < 0 ||
    listing.total_count > performanceReplicationExpectedArtifactNames.length ||
    !Array.isArray(listing.artifacts) ||
    listing.artifacts.length !== listing.total_count
  ) {
    throw new TypeError("Replication invalid artifacts listing is incomplete or out of bounds");
  }

  const names = new Set();
  const ids = new Set();
  const projected = [];
  for (const rawArtifact of listing.artifacts) {
    const artifact = requireRecord(rawArtifact, "replication invalid artifact");
    if (
      typeof artifact.name !== "string" ||
      !expectedArtifactNameSet.has(artifact.name) ||
      names.has(artifact.name)
    ) {
      throw new TypeError("Replication invalid artifact name is unknown or duplicated");
    }
    names.add(artifact.name);
    const id = positiveSafeInteger(
      artifact.id,
      `replication invalid artifact ID for ${artifact.name}`,
    );
    if (ids.has(id)) {
      throw new TypeError("Replication invalid artifact ID is duplicated");
    }
    ids.add(id);
    const size = nonnegativeSafeInteger(
      artifact.size_in_bytes,
      `replication invalid artifact size for ${artifact.name}`,
    );
    if (!sha256DigestPattern.test(artifact.digest ?? "")) {
      throw new TypeError(`Replication invalid artifact digest is invalid: ${artifact.name}`);
    }
    if (typeof artifact.expired !== "boolean") {
      throw new TypeError(`Replication invalid artifact expired flag is invalid: ${artifact.name}`);
    }

    const repository = performanceReplicationHostedIdentity.repository;
    exactUrl(
      artifact.url,
      `${apiRoot}/${repository}/actions/artifacts/${id}`,
      `artifact API URL for ${artifact.name}`,
    );
    exactUrl(
      artifact.archive_download_url,
      `${apiRoot}/${repository}/actions/artifacts/${id}/zip`,
      `artifact archive URL for ${artifact.name}`,
    );
    const workflowRun = requireRecord(
      artifact.workflow_run,
      `replication invalid artifact workflow binding for ${artifact.name}`,
    );
    const bindingChecks = [
      [workflowRun.id, runId, "run ID"],
      [workflowRun.head_branch, performanceReplicationHostedIdentity.headBranch, "head branch"],
      [workflowRun.head_sha, performanceReplicationHostedIdentity.headSha, "head SHA"],
      [workflowRun.repository_id, repositoryId, "repository ID"],
      [workflowRun.head_repository_id, repositoryId, "head repository ID"],
    ];
    for (const [actual, required, label] of bindingChecks) {
      if (actual !== required) {
        throw new TypeError(
          `Replication invalid artifact ${artifact.name} ${label} binding mismatch`,
        );
      }
    }

    projected.push({
      name: artifact.name,
      id,
      size,
      digest: artifact.digest,
      expired: artifact.expired,
    });
  }
  projected.sort(compareArtifactNames);
  return projected;
}

function assertFailure(stage, reasonCode) {
  if (!Object.hasOwn(performanceReplicationInvalidReasonCodes, stage)) {
    throw new TypeError("Replication invalid failure stage is not in the closed vocabulary");
  }
  const expectedReasonCode = performanceReplicationInvalidReasonCodes[stage];
  if (reasonCode !== expectedReasonCode) {
    throw new TypeError("Replication invalid reasonCode does not match its failure stage");
  }
  return { stage, reasonCode };
}

function assertProducer(value, stage) {
  exactKeys(value, [
    "provider",
    "repository",
    "repositoryId",
    "workflowId",
    "workflowName",
    "workflowPath",
    "event",
    "headBranch",
    "headSha",
    "runId",
    "runAttempt",
    "status",
    "conclusion",
  ], "replication invalid producer");
  const expected = performanceReplicationHostedIdentity;
  const checks = [
    [value.provider, "github-actions"],
    [value.repository, expected.repository],
    [value.workflowId, expected.workflow.id],
    [value.workflowName, expected.workflow.name],
    [value.workflowPath, expected.workflow.path],
    [value.event, expected.event],
    [value.headBranch, expected.headBranch],
    [value.headSha, expected.headSha],
    [value.runAttempt, expected.runAttempt],
    [value.status, "completed"],
  ];
  if (checks.some(([actual, required]) => actual !== required)) {
    throw new TypeError("Replication invalid producer identity is not frozen");
  }
  positiveSafeInteger(value.repositoryId, "replication invalid producer repository ID");
  positiveSafeInteger(value.runId, "replication invalid producer run ID");
  assertStageConclusion(stage, value.conclusion);
}

function assertProjectedArtifacts(value) {
  if (
    !Array.isArray(value) ||
    value.length > performanceReplicationExpectedArtifactNames.length
  ) {
    throw new TypeError("Replication invalid projected artifact inventory is out of bounds");
  }
  const names = new Set();
  const ids = new Set();
  let previousName;
  for (const artifact of value) {
    exactKeys(
      artifact,
      ["name", "id", "size", "digest", "expired"],
      "replication invalid projected artifact",
    );
    if (
      typeof artifact.name !== "string" ||
      !expectedArtifactNameSet.has(artifact.name) ||
      names.has(artifact.name) ||
      (previousName !== undefined && compareNames(previousName, artifact.name) >= 0)
    ) {
      throw new TypeError("Replication invalid projected artifacts are not unique name order");
    }
    names.add(artifact.name);
    previousName = artifact.name;
    positiveSafeInteger(artifact.id, `replication invalid projected artifact ID: ${artifact.name}`);
    if (ids.has(artifact.id)) {
      throw new TypeError("Replication invalid projected artifact ID is duplicated");
    }
    ids.add(artifact.id);
    nonnegativeSafeInteger(
      artifact.size,
      `replication invalid projected artifact size: ${artifact.name}`,
    );
    if (!sha256DigestPattern.test(artifact.digest ?? "")) {
      throw new TypeError("Replication invalid projected artifact digest is invalid");
    }
    if (typeof artifact.expired !== "boolean") {
      throw new TypeError("Replication invalid projected artifact expired flag is invalid");
    }
  }
}

function assertStageConclusion(stage, conclusion) {
  if (stage === "hosted_run_terminal_non_success") {
    if (!terminalNonSuccessConclusions.has(conclusion)) {
      throw new TypeError(
        "Replication invalid terminal-run stage requires a terminal non-success conclusion",
      );
    }
    return;
  }
  if (conclusion !== "success") {
    throw new TypeError(
      "Replication invalid post-run validation stage requires a successful hosted run",
    );
  }
}

function assertPrivacyBoundary(value) {
  const seen = new WeakSet();
  const visit = (current) => {
    if (typeof current === "string") {
      if (/(?:https?:\/\/|api\.github\.com\/|github\.com\/)/iu.test(current)) {
        throw new TypeError("Replication invalid manifest must not retain URLs");
      }
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (seen.has(current)) {
      throw new TypeError("Replication invalid manifest must be acyclic JSON data");
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (const child of current) visit(child);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      const normalized = key.toLowerCase();
      if (
        normalized.includes("median") ||
        normalized.includes("ratio") ||
        normalized.includes("statistic") ||
        normalized.includes("ranking") ||
        normalized.includes("error") ||
        normalized.includes("message") ||
        normalized.includes("stderr") ||
        normalized.includes("stdout") ||
        normalized.includes("url") ||
        normalized.includes("actor") ||
        normalized.includes("raw")
      ) {
        throw new TypeError(`Replication invalid manifest contains forbidden field: ${key}`);
      }
      visit(child);
    }
  };
  visit(value);
}

function exactUrl(actual, expected, label) {
  if (actual !== expected) {
    throw new TypeError(`Replication invalid ${label} repository binding mismatch`);
  }
}

function compareArtifactNames(left, right) {
  return compareNames(left.name, right.name);
}

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function exactKeys(value, expected, label) {
  const record = requireRecord(value, label);
  const actualKeys = Reflect.ownKeys(record);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    !isDeepStrictEqual(actualKeys.sort(), [...expected].sort())
  ) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  return record;
}

function requireRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonnegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
