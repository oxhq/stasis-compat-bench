export const performanceReplicationHostedProvenanceSchema =
  "stasis-v0.3.3-performance-replication-hosted-provenance-v1";

export const performanceReplicationHostedIdentity = deepFreeze({
  repository: "oxhq/stasis",
  workflow: {
    id: 348709993,
    name: "Stasis v0.3.3 performance evidence",
    path: ".github/workflows/stasis-v0.3.3-performance-evidence.yml",
  },
  event: "push",
  headBranch: "codex/stasis-v033-performance-evidence",
  headSha: "6c7a6013e00584c8cb8d54c80cee5dbbcf3ca1b9",
  runAttempt: 1,
});

export const performanceReplicationContractIdentity = deepFreeze({
  repository: "oxhq/stasis-compat-bench",
  tag: "stasis-v0.3.3-performance-replication-contract-v1",
  assetName: "stasis-v0.3.3-performance-replication-v1.md",
  assetSizeInBytes: 11702,
  assetSha256: "fe0ef201c36e9fcbdd2fb822aa9204b8d4f98707d5659c043c4fdabd5a43acef",
  soleParentSha: "c5678b045852a29b89ed4b853da0aa39e6e3bf06",
});

const originalRunId = 33851425108;
const originalJobIds = new Set([
  100954874545,
  100954904056,
  100954904065,
  100957175132,
]);

export const performanceReplicationExpectedJobNames = Object.freeze([
  "Validate exact performance inputs",
  "Windows 2022 RWA Cypress vs Stasis",
  "Ubuntu 22.04 Crawlee vs Stasis",
  "Combine and verify performance evidence",
]);

export const performanceReplicationExpectedArtifactNames = Object.freeze([
  "stasis-v0.3.3-performance-source-metadata-attempt-1",
  "stasis-v0.3.3-performance-rwa-raw-attempt-1",
  "stasis-v0.3.3-performance-rwa-logs-attempt-1",
  "stasis-v0.3.3-performance-crawl-raw-attempt-1",
  "stasis-v0.3.3-performance-crawl-logs-attempt-1",
  "stasis-v0.3.3-performance-combined-attempt-1",
  "stasis-v0.3.3-performance-combined-logs-attempt-1",
]);

const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const apiRoot = "https://api.github.com/repos";
const webRoot = "https://github.com";
const uploadRoot = "https://uploads.github.com/repos";

/**
 * Verifies the GitHub REST records for the single preregistered fresh hosted
 * replication. The returned receipt intentionally excludes URLs, actors,
 * runner names, and other ambient REST fields.
 */
export function verifyPerformanceReplicationHostedProvenance({
  runRecord,
  workflowRunsListing,
  jobsListing,
  artifactsListing,
  contractReleaseRecord,
  contractCommitRecord,
} = {}) {
  const run = verifyRunRecord(runRecord);
  const oneShot = verifyWorkflowRunsListing(workflowRunsListing, run);
  const contract = verifyContractPublication(
    contractReleaseRecord,
    contractCommitRecord,
    run,
  );
  const jobs = verifyJobsListing(jobsListing, run.id);
  const artifacts = verifyArtifactsListing(
    artifactsListing,
    run.id,
    run.repositoryId,
  );

  return deepFreeze({
    schema: performanceReplicationHostedProvenanceSchema,
    status: "passed",
    producer: {
      repository: performanceReplicationHostedIdentity.repository,
      repositoryId: run.repositoryId,
      workflowId: performanceReplicationHostedIdentity.workflow.id,
      workflowName: performanceReplicationHostedIdentity.workflow.name,
      workflowPath: performanceReplicationHostedIdentity.workflow.path,
      event: performanceReplicationHostedIdentity.event,
      headBranch: performanceReplicationHostedIdentity.headBranch,
      headSha: performanceReplicationHostedIdentity.headSha,
      runId: run.id,
      runAttempt: performanceReplicationHostedIdentity.runAttempt,
      status: "completed",
      conclusion: "success",
      createdAt: run.createdAt,
      runStartedAt: run.runStartedAt,
    },
    oneShot,
    contract,
    jobs,
    artifacts,
    verification: {
      exactPreregisteredRunIdentity: true,
      completeWorkflowRunsListing: true,
      exactlyOneMatchingFirstAttemptRun: true,
      immutableContractPublishedBeforeRun: true,
      contractCommitHasSoleFrozenParent: true,
      publicApiRepositoryUrlsVerified: true,
      originalRunAndJobIdsRejected: true,
      exactlyFourSuccessfulBenchmarkJobs: true,
      exactlySevenBoundAttemptOneArtifacts: true,
      expiredArtifactsRejected: true,
      urlsRetained: false,
    },
  });
}

function verifyRunRecord(value) {
  requireRecord(value, "Hosted replication run record");
  const repository = verifyRepositoryRecord(
    value.repository,
    "Hosted replication run repository",
    performanceReplicationHostedIdentity.repository,
  );
  const headRepository = verifyRepositoryRecord(
    value.head_repository,
    "Hosted replication run head repository",
    performanceReplicationHostedIdentity.repository,
  );
  const repositoryId = repository.id;

  const expected = performanceReplicationHostedIdentity;
  const checks = [
    [value.run_attempt, expected.runAttempt, "run attempt"],
    [value.event, expected.event, "event"],
    [value.status, "completed", "status"],
    [value.conclusion, "success", "conclusion"],
    [value.head_branch, expected.headBranch, "head branch"],
    [value.head_sha, expected.headSha, "head SHA"],
    [value.path, expected.workflow.path, "workflow path"],
    [value.workflow_id, expected.workflow.id, "workflow ID"],
    [value.name, expected.workflow.name, "workflow name"],
    [headRepository.id, repositoryId, "head repository ID"],
  ];
  for (const [actual, required, label] of checks) {
    if (actual !== required) {
      throw new TypeError(
        `Hosted replication run ${label} mismatch: ${String(actual)}`,
      );
    }
  }

  const id = positiveSafeInteger(value.id, "Hosted replication run ID");
  if (id === originalRunId) {
    throw new TypeError("Hosted replication run reuses the original run ID");
  }
  verifyRunUrls(value, id, "Hosted replication run");
  const created = apiInstant(value.created_at, "Hosted replication run created_at");
  const started = apiInstant(value.run_started_at, "Hosted replication run run_started_at");
  if (started.epochMilliseconds < created.epochMilliseconds) {
    throw new TypeError("Hosted replication run started before it was created");
  }
  return {
    id,
    repositoryId,
    createdAt: created.value,
    createdAtMilliseconds: created.epochMilliseconds,
    runStartedAt: started.value,
    runStartedAtMilliseconds: started.epochMilliseconds,
  };
}

function verifyWorkflowRunsListing(value, selectedRun) {
  requireRecord(value, "Hosted replication workflow-runs listing");
  const totalCount = nonnegativeSafeInteger(
    value.total_count,
    "Hosted replication workflow-runs total_count",
  );
  if (!Array.isArray(value.workflow_runs) || value.workflow_runs.length !== totalCount) {
    throw new TypeError(
      "Hosted replication workflow-runs listing is incomplete or not fully paginated",
    );
  }

  const ids = new Set();
  const matches = [];
  for (const candidate of value.workflow_runs) {
    requireRecord(candidate, "Hosted replication enumerated workflow run");
    const id = positiveSafeInteger(
      candidate.id,
      "Hosted replication enumerated workflow run ID",
    );
    if (ids.has(id)) {
      throw new TypeError("Hosted replication workflow-runs listing duplicates a run ID");
    }
    ids.add(id);
    if (candidate.workflow_id !== performanceReplicationHostedIdentity.workflow.id) {
      throw new TypeError("Hosted replication workflow-runs listing contains another workflow");
    }
    verifyRunUrls(candidate, id, "Hosted replication enumerated workflow run");

    if (matchesPreregisteredInvocation(candidate)) matches.push(candidate);
  }

  if (matches.length !== 1) {
    throw new TypeError(
      `Hosted replication requires exactly one matching first-attempt run; found ${matches.length}`,
    );
  }
  verifyEnumeratedMatchingRun(matches[0], selectedRun);
  if (matches[0].id !== selectedRun.id) {
    throw new TypeError("Hosted replication selected run is not the sole enumerated invocation");
  }

  return {
    completeListing: true,
    enumeratedRunCount: totalCount,
    matchingRunCount: 1,
    selectedRunId: selectedRun.id,
  };
}

function matchesPreregisteredInvocation(value) {
  const expected = performanceReplicationHostedIdentity;
  return value.workflow_id === expected.workflow.id &&
    value.event === expected.event &&
    value.head_branch === expected.headBranch &&
    value.head_sha === expected.headSha &&
    value.run_attempt === expected.runAttempt;
}

function verifyEnumeratedMatchingRun(value, selectedRun) {
  const repository = verifyRepositoryRecord(
    value.repository,
    "Hosted replication enumerated run repository",
    performanceReplicationHostedIdentity.repository,
  );
  const headRepository = verifyRepositoryRecord(
    value.head_repository,
    "Hosted replication enumerated run head repository",
    performanceReplicationHostedIdentity.repository,
  );
  const created = apiInstant(
    value.created_at,
    "Hosted replication enumerated run created_at",
  );
  const started = apiInstant(
    value.run_started_at,
    "Hosted replication enumerated run run_started_at",
  );
  const checks = [
    [value.id, selectedRun.id, "ID"],
    [value.path, performanceReplicationHostedIdentity.workflow.path, "workflow path"],
    [value.name, performanceReplicationHostedIdentity.workflow.name, "workflow name"],
    [value.status, "completed", "status"],
    [value.conclusion, "success", "conclusion"],
    [repository.id, selectedRun.repositoryId, "repository ID"],
    [headRepository.id, selectedRun.repositoryId, "head repository ID"],
    [created.value, selectedRun.createdAt, "created_at"],
    [started.value, selectedRun.runStartedAt, "run_started_at"],
  ];
  for (const [actual, expected, label] of checks) {
    if (actual !== expected) {
      throw new TypeError(
        `Hosted replication enumerated run ${label} mismatch: ${String(actual)}`,
      );
    }
  }
}

function verifyContractPublication(releaseValue, commitValue, run) {
  const release = verifyContractRelease(releaseValue);
  const commit = verifyContractCommit(commitValue, release.targetCommitSha);
  if (
    release.publishedAtMilliseconds >= run.createdAtMilliseconds ||
    release.publishedAtMilliseconds >= run.runStartedAtMilliseconds
  ) {
    throw new TypeError("Hosted replication contract release was not published before the run");
  }
  return {
    repository: performanceReplicationContractIdentity.repository,
    tag: performanceReplicationContractIdentity.tag,
    releaseId: release.id,
    immutable: true,
    draft: false,
    prerelease: false,
    publishedAt: release.publishedAt,
    targetCommitSha: release.targetCommitSha,
    soleParentSha: performanceReplicationContractIdentity.soleParentSha,
    treeSha: commit.treeSha,
    asset: release.asset,
  };
}

function verifyContractRelease(value) {
  requireRecord(value, "Hosted replication contract release");
  const expected = performanceReplicationContractIdentity;
  const id = positiveSafeInteger(value.id, "Hosted replication contract release ID");
  const checks = [
    [value.tag_name, expected.tag, "tag"],
    [value.draft, false, "draft state"],
    [value.prerelease, false, "prerelease state"],
    [value.immutable, true, "immutable state"],
  ];
  for (const [actual, required, label] of checks) {
    if (actual !== required) {
      throw new TypeError(
        `Hosted replication contract release ${label} mismatch: ${String(actual)}`,
      );
    }
  }
  if (!gitShaPattern.test(value.target_commitish ?? "")) {
    throw new TypeError("Hosted replication contract release target_commitish is not a Git SHA");
  }
  verifyContractReleaseUrls(value, id);
  const published = apiInstant(
    value.published_at,
    "Hosted replication contract release published_at",
  );
  if (!Array.isArray(value.assets) || value.assets.length !== 1) {
    throw new TypeError("Hosted replication contract release requires exactly one asset");
  }
  const assetValue = requireRecord(value.assets[0], "Hosted replication contract release asset");
  const assetId = positiveSafeInteger(
    assetValue.id,
    "Hosted replication contract release asset ID",
  );
  const sizeInBytes = positiveSafeInteger(
    assetValue.size,
    "Hosted replication contract release asset size",
  );
  if (
    assetValue.name !== expected.assetName ||
    assetValue.state !== "uploaded" ||
    sizeInBytes !== expected.assetSizeInBytes ||
    assetValue.digest !== `sha256:${expected.assetSha256}`
  ) {
    throw new TypeError("Hosted replication contract release asset identity is invalid");
  }
  verifyContractAssetUrls(assetValue, assetId);
  return {
    id,
    targetCommitSha: value.target_commitish,
    publishedAt: published.value,
    publishedAtMilliseconds: published.epochMilliseconds,
    asset: {
      name: expected.assetName,
      id: assetId,
      sizeInBytes,
      digest: assetValue.digest,
    },
  };
}

function verifyContractCommit(value, targetCommitSha) {
  requireRecord(value, "Hosted replication contract commit");
  if (value.sha !== targetCommitSha) {
    throw new TypeError("Hosted replication contract commit does not match release target_commitish");
  }
  verifyExactUrl(
    value.url,
    `${apiRoot}/${performanceReplicationContractIdentity.repository}/commits/${targetCommitSha}`,
    "Hosted replication contract commit API URL",
  );
  verifyExactUrl(
    value.html_url,
    `${webRoot}/${performanceReplicationContractIdentity.repository}/commit/${targetCommitSha}`,
    "Hosted replication contract commit web URL",
  );
  const commit = requireRecord(value.commit, "Hosted replication contract commit payload");
  const tree = requireRecord(commit.tree, "Hosted replication contract commit tree");
  if (!gitShaPattern.test(tree.sha ?? "")) {
    throw new TypeError("Hosted replication contract commit tree SHA is invalid");
  }
  verifyExactUrl(
    tree.url,
    `${apiRoot}/${performanceReplicationContractIdentity.repository}/git/trees/${tree.sha}`,
    "Hosted replication contract commit tree URL",
  );
  if (!Array.isArray(value.parents) || value.parents.length !== 1) {
    throw new TypeError("Hosted replication contract commit must have exactly one parent");
  }
  const parent = requireRecord(value.parents[0], "Hosted replication contract commit parent");
  if (parent.sha !== performanceReplicationContractIdentity.soleParentSha) {
    throw new TypeError("Hosted replication contract commit parent is not the frozen harness");
  }
  verifyExactUrl(
    parent.url,
    `${apiRoot}/${performanceReplicationContractIdentity.repository}/commits/${parent.sha}`,
    "Hosted replication contract commit parent API URL",
  );
  verifyExactUrl(
    parent.html_url,
    `${webRoot}/${performanceReplicationContractIdentity.repository}/commit/${parent.sha}`,
    "Hosted replication contract commit parent web URL",
  );
  return { treeSha: tree.sha };
}

function verifyJobsListing(value, runId) {
  requireRecord(value, "Hosted replication jobs listing");
  if (
    value.total_count !== performanceReplicationExpectedJobNames.length ||
    !Array.isArray(value.jobs) ||
    value.jobs.length !== performanceReplicationExpectedJobNames.length
  ) {
    throw new TypeError("Hosted replication requires exactly four benchmark jobs");
  }

  const byName = new Map();
  const ids = new Set();
  for (const job of value.jobs) {
    requireRecord(job, "Hosted replication job");
    if (
      typeof job.name !== "string" ||
      !performanceReplicationExpectedJobNames.includes(job.name) ||
      byName.has(job.name)
    ) {
      throw new TypeError("Hosted replication job names are missing or duplicated");
    }
    const id = positiveSafeInteger(job.id, `Hosted replication job ID for ${job.name}`);
    if (ids.has(id) || originalJobIds.has(id)) {
      throw new TypeError("Hosted replication job IDs are duplicated or reused");
    }
    ids.add(id);
    verifyExactUrl(
      job.url,
      `${apiRoot}/${performanceReplicationHostedIdentity.repository}/actions/jobs/${id}`,
      `Hosted replication job ${job.name} API URL`,
    );
    verifyExactUrl(
      job.html_url,
      `${webRoot}/${performanceReplicationHostedIdentity.repository}/actions/runs/${runId}/job/${id}`,
      `Hosted replication job ${job.name} web URL`,
    );

    const checks = [
      [job.run_id, runId, "run ID"],
      [job.run_attempt, performanceReplicationHostedIdentity.runAttempt, "run attempt"],
      [job.head_sha, performanceReplicationHostedIdentity.headSha, "head SHA"],
      [job.workflow_name, performanceReplicationHostedIdentity.workflow.name, "workflow name"],
      [job.status, "completed", "status"],
      [job.conclusion, "success", "conclusion"],
    ];
    for (const [actual, expected, label] of checks) {
      if (actual !== expected) {
        throw new TypeError(
          `Hosted replication job ${job.name} ${label} mismatch: ${String(actual)}`,
        );
      }
    }
    byName.set(job.name, {
      name: job.name,
      id,
      status: "completed",
      conclusion: "success",
    });
  }

  return performanceReplicationExpectedJobNames.map((name) => {
    const job = byName.get(name);
    if (job === undefined) {
      throw new TypeError(`Hosted replication job is missing: ${name}`);
    }
    return job;
  });
}

function verifyArtifactsListing(value, runId, repositoryId) {
  requireRecord(value, "Hosted replication artifacts listing");
  if (
    value.total_count !== performanceReplicationExpectedArtifactNames.length ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length !== performanceReplicationExpectedArtifactNames.length
  ) {
    throw new TypeError("Hosted replication requires exactly seven attempt-1 artifacts");
  }

  const byName = new Map();
  const ids = new Set();
  for (const artifact of value.artifacts) {
    requireRecord(artifact, "Hosted replication artifact");
    if (
      typeof artifact.name !== "string" ||
      !performanceReplicationExpectedArtifactNames.includes(artifact.name) ||
      byName.has(artifact.name)
    ) {
      throw new TypeError("Hosted replication artifact names are missing or duplicated");
    }
    const id = positiveSafeInteger(
      artifact.id,
      `Hosted replication artifact ID for ${artifact.name}`,
    );
    if (ids.has(id)) {
      throw new TypeError("Hosted replication artifact IDs are duplicated");
    }
    ids.add(id);
    const sizeInBytes = positiveSafeInteger(
      artifact.size_in_bytes,
      `Hosted replication artifact size for ${artifact.name}`,
    );
    if (artifact.expired !== false) {
      throw new TypeError(`Hosted replication artifact is expired: ${artifact.name}`);
    }
    if (!sha256DigestPattern.test(artifact.digest ?? "")) {
      throw new TypeError(`Hosted replication artifact digest is invalid: ${artifact.name}`);
    }
    verifyExactUrl(
      artifact.url,
      `${apiRoot}/${performanceReplicationHostedIdentity.repository}/actions/artifacts/${id}`,
      `Hosted replication artifact ${artifact.name} API URL`,
    );
    verifyExactUrl(
      artifact.archive_download_url,
      `${apiRoot}/${performanceReplicationHostedIdentity.repository}/actions/artifacts/${id}/zip`,
      `Hosted replication artifact ${artifact.name} archive URL`,
    );

    const workflowRun = requireRecord(
      artifact.workflow_run,
      `Hosted replication artifact workflow binding for ${artifact.name}`,
    );
    const checks = [
      [workflowRun.id, runId, "run ID"],
      [workflowRun.head_branch, performanceReplicationHostedIdentity.headBranch, "head branch"],
      [workflowRun.head_sha, performanceReplicationHostedIdentity.headSha, "head SHA"],
      [workflowRun.repository_id, repositoryId, "repository ID"],
      [workflowRun.head_repository_id, repositoryId, "head repository ID"],
    ];
    for (const [actual, expected, label] of checks) {
      if (actual !== expected) {
        throw new TypeError(
          `Hosted replication artifact ${artifact.name} ${label} mismatch: ${String(actual)}`,
        );
      }
    }

    byName.set(artifact.name, {
      name: artifact.name,
      id,
      sizeInBytes,
      digest: artifact.digest,
    });
  }

  return performanceReplicationExpectedArtifactNames.map((name) => {
    const artifact = byName.get(name);
    if (artifact === undefined) {
      throw new TypeError(`Hosted replication artifact is missing: ${name}`);
    }
    return artifact;
  });
}

function verifyRepositoryRecord(value, label, expectedFullName) {
  const repository = requireRecord(value, label);
  const id = positiveSafeInteger(repository.id, `${label} ID`);
  if (repository.full_name !== expectedFullName) {
    throw new TypeError(`${label} full name mismatch: ${String(repository.full_name)}`);
  }
  verifyExactUrl(
    repository.url,
    `${apiRoot}/${expectedFullName}`,
    `${label} API URL`,
  );
  return { id };
}

function verifyRunUrls(value, id, label) {
  const repository = performanceReplicationHostedIdentity.repository;
  verifyExactUrl(
    value.url,
    `${apiRoot}/${repository}/actions/runs/${id}`,
    `${label} API URL`,
  );
  verifyExactUrl(
    value.html_url,
    `${webRoot}/${repository}/actions/runs/${id}`,
    `${label} web URL`,
  );
  verifyExactUrl(
    value.jobs_url,
    `${apiRoot}/${repository}/actions/runs/${id}/jobs`,
    `${label} jobs URL`,
  );
  verifyExactUrl(
    value.artifacts_url,
    `${apiRoot}/${repository}/actions/runs/${id}/artifacts`,
    `${label} artifacts URL`,
  );
}

function verifyContractReleaseUrls(value, releaseId) {
  const { repository, tag } = performanceReplicationContractIdentity;
  verifyExactUrl(
    value.url,
    `${apiRoot}/${repository}/releases/${releaseId}`,
    "Hosted replication contract release API URL",
  );
  verifyExactUrl(
    value.html_url,
    `${webRoot}/${repository}/releases/tag/${tag}`,
    "Hosted replication contract release web URL",
  );
  verifyExactUrl(
    value.assets_url,
    `${apiRoot}/${repository}/releases/${releaseId}/assets`,
    "Hosted replication contract release assets URL",
  );
  verifyExactUrl(
    value.upload_url,
    `${uploadRoot}/${repository}/releases/${releaseId}/assets{?name,label}`,
    "Hosted replication contract release upload URL",
  );
}

function verifyContractAssetUrls(value, assetId) {
  const { repository, tag, assetName } = performanceReplicationContractIdentity;
  verifyExactUrl(
    value.url,
    `${apiRoot}/${repository}/releases/assets/${assetId}`,
    "Hosted replication contract release asset API URL",
  );
  verifyExactUrl(
    value.browser_download_url,
    `${webRoot}/${repository}/releases/download/${tag}/${assetName}`,
    "Hosted replication contract release asset download URL",
  );
}

function verifyExactUrl(value, expected, label) {
  if (value !== expected) {
    throw new TypeError(`${label} repository binding mismatch: ${String(value)}`);
  }
}

function apiInstant(value, label) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) {
    throw new TypeError(`${label} must be one canonical UTC instant`);
  }
  const epochMilliseconds = Date.parse(value);
  const millisecondForm = value.includes(".") ? value : value.replace(/Z$/u, ".000Z");
  if (!Number.isFinite(epochMilliseconds) || new Date(epochMilliseconds).toISOString() !== millisecondForm) {
    throw new TypeError(`${label} must be one valid canonical UTC instant`);
  }
  return { value, epochMilliseconds };
}

function nonnegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
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

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
