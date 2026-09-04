import {
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
  navigationCausalExpectedJobStepTopology,
} from "../../src/performance/navigation-causal-contract.mjs";
import {
  navigationCausalWorkflowSourceIdentity,
} from "../../src/performance/navigation-causal-replication.mjs";

export const navigationCausalHostedFixtureRunId = 33900000000;

export function navigationCausalHostedFixtureInput() {
  const runId = navigationCausalHostedFixtureRunId;
  const runRecord = {
    id: runId,
    run_attempt: 1,
    workflow_id: 999000001,
    event: "push",
    status: "completed",
    conclusion: "success",
    head_branch: navigationCausalWorkflowSourceIdentity.branch,
    head_sha: navigationCausalWorkflowSourceIdentity.revision,
    path: navigationCausalWorkflowSourceIdentity.workflow.path,
    name: navigationCausalWorkflowSourceIdentity.workflow.name,
    created_at: "2026-09-04T19:00:00Z",
    run_started_at: "2026-09-04T19:00:05Z",
    updated_at: "2026-09-04T19:05:00Z",
    url: `https://api.github.com/repos/oxhq/stasis/actions/runs/${runId}`,
    repository: { full_name: "oxhq/stasis" },
    head_repository: { full_name: "oxhq/stasis" },
  };
  const jobs = navigationCausalWorkflowSourceIdentity.workflow.jobs.map((expected, index) => ({
    id: 101200000000 + index,
    run_id: runId,
    run_attempt: 1,
    head_sha: navigationCausalWorkflowSourceIdentity.revision,
    name: expected.name,
    status: "completed",
    conclusion: "success",
    labels: ["ubuntu-22.04"],
    started_at: "2026-09-04T19:00:10Z",
    completed_at: "2026-09-04T19:04:50Z",
    url: `https://api.github.com/repos/oxhq/stasis/actions/jobs/${101200000000 + index}`,
    steps: navigationCausalExpectedJobStepTopology[index === 0 ? "host-a" : "host-b"]
      .map((step) => ({
        ...step,
        status: "completed",
        conclusion: "success",
        started_at: "2026-09-04T19:00:11Z",
        completed_at: "2026-09-04T19:04:49Z",
      })),
  }));
  const artifacts = navigationCausalWorkflowSourceIdentity.workflow.jobs.map((expected, index) => ({
    id: 9950000000 + index,
    name: expected.artifact,
    size_in_bytes: 25_000 + index,
    digest: `sha256:${String(index + 1).repeat(64)}`,
    expired: false,
    url: `https://api.github.com/repos/oxhq/stasis/actions/artifacts/${9950000000 + index}`,
    workflow_run: {
      id: runId,
      head_branch: navigationCausalWorkflowSourceIdentity.branch,
      head_sha: navigationCausalWorkflowSourceIdentity.revision,
    },
  }));
  const contractAssets = Object.entries(navigationCausalContractAssetIdentities)
    .map(([name, identity], index) => ({
      id: 544800000 + index,
      name,
      size: identity.bytes,
      digest: `sha256:${identity.sha256}`,
    }));
  const contractSha = "d".repeat(40);
  return {
    runRecord,
    workflowRunsListing: { total_count: 1, workflow_runs: [structuredClone(runRecord)] },
    jobsListing: { total_count: 2, jobs },
    artifactsListing: { total_count: 2, artifacts },
    contractReleaseRecord: {
      id: 382950000,
      tag_name: navigationCausalContractIdentity.tag,
      target_commitish: contractSha,
      immutable: true,
      draft: false,
      prerelease: false,
      published_at: "2026-09-04T18:55:00Z",
      url: "https://api.github.com/repos/oxhq/stasis-compat-bench/releases/382950000",
      assets: contractAssets,
    },
    contractCommitRecord: {
      sha: contractSha,
      url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${contractSha}`,
      parents: [{ sha: navigationCausalContractIdentity.soleParentSha }],
      commit: { tree: { sha: "e".repeat(40) } },
    },
    workflowSourceCommitRecord: {
      sha: navigationCausalWorkflowSourceIdentity.revision,
      url: `https://api.github.com/repos/oxhq/stasis/commits/${navigationCausalWorkflowSourceIdentity.revision}`,
      parents: [{ sha: navigationCausalWorkflowSourceIdentity.parentRevision }],
      commit: { tree: { sha: navigationCausalWorkflowSourceIdentity.tree } },
      files: [{
        filename: navigationCausalWorkflowSourceIdentity.workflow.path,
        status: "added",
        sha: navigationCausalWorkflowSourceIdentity.workflow.blob,
        additions: navigationCausalWorkflowSourceIdentity.workflow.lineCount,
        deletions: 0,
        changes: navigationCausalWorkflowSourceIdentity.workflow.lineCount,
      }],
    },
  };
}
