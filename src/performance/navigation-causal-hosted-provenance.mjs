import { isDeepStrictEqual } from "node:util";

import {
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
  navigationCausalExpectedJobStepTopology,
} from "./navigation-causal-contract.mjs";
import {
  navigationCausalWorkflowSourceIdentity,
} from "./navigation-causal-replication.mjs";

export const navigationCausalHostedProvenanceSchema =
  "stasis-v0.3.3-performance-navigation-causal-hosted-provenance-v1";

const repository = "oxhq/stasis";
const harnessRepository = "oxhq/stasis-compat-bench";
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;

export function verifyNavigationCausalHostedProvenance({
  runRecord,
  workflowRunsListing,
  jobsListing,
  artifactsListing,
  contractReleaseRecord,
  contractCommitRecord,
  workflowSourceCommitRecord,
} = {}) {
  const run = verifyRun(runRecord);
  const oneShot = verifyRunListing(workflowRunsListing, run);
  const contract = verifyContract(contractReleaseRecord, contractCommitRecord, run);
  const source = verifySourceCommit(workflowSourceCommitRecord);
  const jobs = verifyJobs(jobsListing, run);
  const expectedRunConclusion = jobs.every(({ conclusion }) => conclusion === "success")
    ? "success"
    : "failure";
  if (run.conclusion !== expectedRunConclusion) {
    throw new TypeError("Navigation causal run conclusion contradicts its two jobs");
  }
  const artifacts = verifyArtifacts(artifactsListing, run);
  return deepFreeze({
    schema: navigationCausalHostedProvenanceSchema,
    status: "passed",
    producer: {
      repository,
      workflowName: navigationCausalWorkflowSourceIdentity.workflow.name,
      workflowPath: navigationCausalWorkflowSourceIdentity.workflow.path,
      event: "push",
      headBranch: navigationCausalWorkflowSourceIdentity.branch,
      headSha: navigationCausalWorkflowSourceIdentity.revision,
      workflowId: run.workflowId,
      runId: run.id,
      runAttempt: 1,
      conclusion: run.conclusion,
      createdAt: run.createdAt,
      runStartedAt: run.runStartedAt,
      completedAt: run.completedAt,
    },
    oneShot,
    contract,
    source,
    jobs,
    artifacts,
    verification: {
      immutableContractPublishedBeforeRun: true,
      contractTargetHasSoleH8aParent: true,
      sourceHasSoleS4Parent: true,
      completeWorkflowRunsListing: true,
      exactlyOneFirstAttemptRun: true,
      exactlyTwoTerminalJobs: true,
      exactPreregisteredStepTopologies: true,
      exactlyTwoNonexpiredArtifacts: true,
      artifactPayloadBindingDeferred: true,
      urlsRetained: false,
    },
  });
}

function verifyRun(value) {
  requireRecord(value, "navigation causal run");
  verifyRepository(value.repository, repository, "run repository");
  verifyRepository(value.head_repository, repository, "run head repository");
  const expected = navigationCausalWorkflowSourceIdentity;
  const checks = [
    [value.run_attempt, 1, "attempt"],
    [value.event, "push", "event"],
    [value.status, "completed", "status"],
    [value.head_branch, expected.branch, "head branch"],
    [value.head_sha, expected.revision, "head SHA"],
    [value.path, expected.workflow.path, "workflow path"],
    [value.name, expected.workflow.name, "workflow name"],
  ];
  for (const [actual, wanted, label] of checks) {
    if (actual !== wanted) throw new TypeError(`Navigation causal run ${label} mismatch`);
  }
  if (!new Set(["success", "failure"]).has(value.conclusion)) {
    throw new TypeError("Navigation causal run conclusion is not a retained terminal class");
  }
  const id = positiveInteger(value.id, "run ID");
  positiveInteger(value.workflow_id, "workflow ID");
  assertApiUrl(value.url, repository, `/actions/runs/${id}`, "run URL");
  const createdAt = instant(value.created_at, "run created_at");
  const runStartedAt = instant(value.run_started_at, "run_started_at");
  const completedAt = instant(value.updated_at, "run updated_at");
  if (runStartedAt.epoch < createdAt.epoch) throw new TypeError("Run started before creation");
  if (completedAt.epoch < runStartedAt.epoch) throw new TypeError("Run completed before it started");
  return {
    id,
    workflowId: value.workflow_id,
    conclusion: value.conclusion,
    createdAt: createdAt.text,
    createdEpoch: createdAt.epoch,
    runStartedAt: runStartedAt.text,
    runStartedEpoch: runStartedAt.epoch,
    completedAt: completedAt.text,
    completedEpoch: completedAt.epoch,
  };
}

function verifyRunListing(value, selected) {
  requireRecord(value, "workflow runs listing");
  const total = nonnegativeInteger(value.total_count, "workflow runs total_count");
  if (!Array.isArray(value.workflow_runs) || value.workflow_runs.length !== total) {
    throw new TypeError("Navigation causal workflow runs listing is not fully paginated");
  }
  if (total !== 1) {
    throw new TypeError("Navigation causal workflow and branch must have exactly one run total");
  }
  const matches = value.workflow_runs.filter((entry) => {
    requireRecord(entry, "enumerated workflow run");
    return entry.workflow_id === selected.workflowId && entry.event === "push" &&
      entry.head_branch === navigationCausalWorkflowSourceIdentity.branch &&
      entry.head_sha === navigationCausalWorkflowSourceIdentity.revision &&
      entry.run_attempt === 1;
  });
  if (matches.length !== 1 || matches[0].id !== selected.id ||
    matches[0].status !== "completed" || matches[0].conclusion !== selected.conclusion ||
    matches[0].path !== navigationCausalWorkflowSourceIdentity.workflow.path ||
    matches[0].name !== navigationCausalWorkflowSourceIdentity.workflow.name) {
    throw new TypeError("Navigation causal workflow requires exactly one matching run");
  }
  return { completeListing: true, enumeratedRunCount: total, matchingRunCount: 1 };
}

function verifyContract(release, commit, run) {
  requireRecord(release, "contract release");
  requireRecord(commit, "contract commit");
  if (release.tag_name !== navigationCausalContractIdentity.tag || release.immutable !== true ||
    release.draft !== false || release.prerelease !== false ||
    !gitShaPattern.test(release.target_commitish ?? "") ||
    commit.sha !== release.target_commitish || !Array.isArray(commit.parents) ||
    commit.parents.length !== 1 || commit.parents[0]?.sha !== navigationCausalContractIdentity.soleParentSha ||
    !gitShaPattern.test(commit.commit?.tree?.sha ?? "")) {
    throw new TypeError("Navigation causal contract release or ancestry is invalid");
  }
  const expectedNames = Object.keys(navigationCausalContractAssetIdentities).sort();
  if (!Array.isArray(release.assets) || release.assets.length !== expectedNames.length) {
    throw new TypeError("Navigation causal contract release asset inventory is invalid");
  }
  const assets = [...release.assets].sort((a, b) => a.name.localeCompare(b.name));
  if (!isDeepStrictEqual(assets.map(({ name }) => name), expectedNames)) {
    throw new TypeError("Navigation causal contract release asset names changed");
  }
  for (const asset of assets) {
    const expected = navigationCausalContractAssetIdentities[asset.name];
    if (asset.size !== expected.bytes || asset.digest !== `sha256:${expected.sha256}`) {
      throw new TypeError(`Navigation causal contract release asset changed: ${asset.name}`);
    }
  }
  const created = instant(release.created_at, "contract created_at");
  const published = instant(release.published_at, "contract published_at");
  if (created.epoch > published.epoch) {
    throw new TypeError("Navigation causal contract was created after it was published");
  }
  if (published.epoch >= run.createdEpoch) {
    throw new TypeError("Navigation causal contract was not published before the run");
  }
  assertApiUrl(release.url, harnessRepository, `/releases/${release.id}`, "contract release URL");
  assertApiUrl(commit.url, harnessRepository, `/commits/${commit.sha}`, "contract commit URL");
  return {
    releaseId: positiveInteger(release.id, "contract release ID"),
    tag: release.tag_name,
    targetCommitSha: commit.sha,
    targetTreeSha: commit.commit.tree.sha,
    soleParentSha: navigationCausalContractIdentity.soleParentSha,
    createdAt: created.text,
    publishedAt: published.text,
    immutable: true,
    assetCount: assets.length,
  };
}

function verifySourceCommit(value) {
  requireRecord(value, "workflow source commit");
  const expected = navigationCausalWorkflowSourceIdentity;
  if (value.sha !== expected.revision || value.commit?.tree?.sha !== expected.tree ||
    !Array.isArray(value.parents) || value.parents.length !== 1 ||
    value.parents[0]?.sha !== expected.parentRevision || !Array.isArray(value.files) ||
    value.files.length !== 1) {
    throw new TypeError("Navigation causal workflow source commit identity is invalid");
  }
  const file = value.files[0];
  if (file.filename !== expected.workflow.path || file.status !== "added" ||
    file.sha !== expected.workflow.blob || file.additions !== expected.workflow.lineCount ||
    file.deletions !== 0 || file.changes !== expected.workflow.lineCount) {
    throw new TypeError("Navigation causal workflow source change is not exact");
  }
  assertApiUrl(value.url, repository, `/commits/${value.sha}`, "workflow source commit URL");
  return {
    commitSha: value.sha,
    parentCommitSha: value.parents[0].sha,
    treeSha: value.commit.tree.sha,
    workflowBlobSha: file.sha,
  };
}

function verifyJobs(value, run) {
  requireRecord(value, "jobs listing");
  if (value.total_count !== 2 || !Array.isArray(value.jobs) || value.jobs.length !== 2) {
    throw new TypeError("Navigation causal jobs listing must contain exactly two jobs");
  }
  const byName = new Map(value.jobs.map((job) => [job.name, job]));
  if (byName.size !== 2) throw new TypeError("Navigation causal jobs are duplicated");
  const result = navigationCausalWorkflowSourceIdentity.workflow.jobs.map((expected) => {
    const lane = expected.id.endsWith("host-a") ? "host-a" : "host-b";
    const job = byName.get(expected.name);
    requireRecord(job, `${lane} job`);
    if (job.run_id !== run.id || job.run_attempt !== 1 || job.head_sha !== navigationCausalWorkflowSourceIdentity.revision ||
      job.status !== "completed" || !new Set(["success", "failure"]).has(job.conclusion) ||
      !isDeepStrictEqual(job.labels, ["ubuntu-22.04"])) {
      throw new TypeError(`Navigation causal ${lane} job identity is invalid`);
    }
    const started = instant(job.started_at, `${lane} job started_at`);
    const completed = instant(job.completed_at, `${lane} job completed_at`);
    if (started.epoch < run.runStartedEpoch || completed.epoch < started.epoch ||
      completed.epoch > run.completedEpoch) {
      throw new TypeError(`Navigation causal ${lane} job timestamps escape the run`);
    }
    verifyJobSteps(job.steps, lane, job.conclusion, started, completed);
    const id = positiveInteger(job.id, `${lane} job ID`);
    assertApiUrl(job.url, repository, `/actions/jobs/${id}`, `${lane} job URL`);
    return {
      lane,
      id,
      name: job.name,
      conclusion: job.conclusion,
      startedAt: started.text,
      completedAt: completed.text,
    };
  });
  if (new Set(result.map(({ id }) => id)).size !== result.length) {
    throw new TypeError("Navigation causal jobs reuse one job ID");
  }
  return result;
}

function verifyJobSteps(value, lane, jobConclusion, jobStarted, jobCompleted) {
  const expected = navigationCausalExpectedJobStepTopology[lane];
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new TypeError(`Navigation causal ${lane} job step count changed`);
  }
  value.forEach((step, index) => {
    const wanted = expected[index];
    if (step.number !== wanted.number || step.name !== wanted.name || step.status !== "completed") {
      throw new TypeError(`Navigation causal ${lane} job step topology changed`);
    }
    const expectedConclusion = jobConclusion === "success"
      ? "success"
      : wanted.number === 17
        ? "failure"
        : wanted.number === 33
          ? "skipped"
          : "success";
    if (step.conclusion !== expectedConclusion) {
      throw new TypeError(`Navigation causal ${lane} job step conclusion changed`);
    }
    if (step.conclusion === "skipped") {
      if (!(step.started_at === null && step.completed_at === null)) {
        throw new TypeError(`Navigation causal ${lane} skipped step has timestamps`);
      }
    } else {
      const started = instant(step.started_at, `${lane} step ${wanted.number} started_at`);
      const completed = instant(step.completed_at, `${lane} step ${wanted.number} completed_at`);
      if (started.epoch < jobStarted.epoch || completed.epoch < started.epoch ||
        completed.epoch > jobCompleted.epoch) {
        throw new TypeError(`Navigation causal ${lane} step ${wanted.number} timestamps escape the job`);
      }
    }
  });
}

function verifyArtifacts(value, run) {
  requireRecord(value, "artifacts listing");
  if (value.total_count !== 2 || !Array.isArray(value.artifacts) || value.artifacts.length !== 2) {
    throw new TypeError("Navigation causal artifacts listing must contain exactly two artifacts");
  }
  const byName = new Map(value.artifacts.map((artifact) => [artifact.name, artifact]));
  if (byName.size !== 2) throw new TypeError("Navigation causal artifacts are duplicated");
  const result = navigationCausalWorkflowSourceIdentity.workflow.jobs.map((expected) => {
    const lane = expected.id.endsWith("host-a") ? "host-a" : "host-b";
    const artifact = byName.get(expected.artifact);
    requireRecord(artifact, `${lane} artifact`);
    if (artifact.expired !== false || artifact.workflow_run?.id !== run.id ||
      artifact.workflow_run?.head_branch !== navigationCausalWorkflowSourceIdentity.branch ||
      artifact.workflow_run?.head_sha !== navigationCausalWorkflowSourceIdentity.revision ||
      !digestPattern.test(artifact.digest ?? "") || !Number.isSafeInteger(artifact.size_in_bytes) ||
      artifact.size_in_bytes < 1) {
      throw new TypeError(`Navigation causal ${lane} artifact metadata is invalid`);
    }
    const id = positiveInteger(artifact.id, `${lane} artifact ID`);
    assertApiUrl(artifact.url, repository, `/actions/artifacts/${id}`, `${lane} artifact URL`);
    return {
      lane,
      id,
      name: artifact.name,
      sizeInBytes: artifact.size_in_bytes,
      digest: artifact.digest,
    };
  });
  if (new Set(result.map(({ id }) => id)).size !== result.length) {
    throw new TypeError("Navigation causal artifacts reuse one artifact ID");
  }
  return result;
}

function verifyRepository(value, expected, label) {
  requireRecord(value, label);
  if (value.full_name !== expected) throw new TypeError(`${label} mismatch`);
}

function assertApiUrl(value, repo, suffix, label) {
  if (value !== `https://api.github.com/repos/${repo}${suffix}`) {
    throw new TypeError(`${label} mismatch`);
  }
}

function instant(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new TypeError(`${label} is invalid`);
  return { text: value, epoch };
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} is invalid`);
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} is invalid`);
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
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
