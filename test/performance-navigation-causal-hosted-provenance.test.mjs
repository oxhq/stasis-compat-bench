import assert from "node:assert/strict";
import test from "node:test";

import {
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
  navigationCausalExpectedJobStepTopology,
} from "../src/performance/navigation-causal-contract.mjs";
import {
  navigationCausalHostedProvenanceSchema,
  verifyNavigationCausalHostedProvenance,
} from "../src/performance/navigation-causal-hosted-provenance.mjs";
import {
  navigationCausalWorkflowSourceIdentity,
} from "../src/performance/navigation-causal-replication.mjs";

test("one run, two exact jobs, and two retained artifacts produce a bounded receipt", () => {
  const receipt = verifyNavigationCausalHostedProvenance(validInput());
  assert.equal(receipt.schema, navigationCausalHostedProvenanceSchema);
  assert.equal(receipt.status, "passed");
  assert.deepEqual(receipt.jobs.map(({ lane }) => lane), ["host-a", "host-b"]);
  assert.deepEqual(receipt.artifacts.map(({ lane }) => lane), ["host-a", "host-b"]);
  assert.equal(receipt.verification.exactPreregisteredStepTopologies, true);
  assert.equal(receipt.verification.artifactPayloadBindingDeferred, true);
  assert.equal(JSON.stringify(receipt).includes("https://"), false);
  assert.equal(Object.isFrozen(receipt), true);
});

test("typed-invalid final propagation may fail only after artifact retention", () => {
  const input = validInput();
  input.runRecord.conclusion = "failure";
  input.workflowRunsListing.workflow_runs[0].conclusion = "failure";
  const job = input.jobsListing.jobs[0];
  job.conclusion = "failure";
  job.steps.find(({ number }) => number === 17).conclusion = "failure";
  Object.assign(job.steps.find(({ number }) => number === 33), {
    conclusion: "skipped",
    started_at: null,
    completed_at: null,
  });
  const receipt = verifyNavigationCausalHostedProvenance(input);
  assert.equal(receipt.producer.conclusion, "failure");
  assert.equal(receipt.jobs[0].conclusion, "failure");
  assert.equal(receipt.artifacts.length, 2);
});

test("shifted, missing, extra, renamed, and premature step failures are rejected", async (t) => {
  const cases = [
    ["old false topology", (value) => {
      value.jobsListing.jobs[0].steps.forEach((step) => {
        if (step.number >= 2 && step.number <= 17) step.number -= 1;
        else if (step.number >= 33) step.number -= 2;
      });
    }],
    ["shifted post", (value) => { value.jobsListing.jobs[0].steps.at(-3).number = 32; }],
    ["missing", (value) => { value.jobsListing.jobs[0].steps.pop(); }],
    ["extra", (value) => { value.jobsListing.jobs[0].steps.push({ number: 34, name: "extra", status: "completed", conclusion: "success" }); }],
    ["renamed", (value) => { value.jobsListing.jobs[1].steps[5].name += " changed"; }],
    ["premature failure", (value) => { value.jobsListing.jobs[1].steps[14].conclusion = "failure"; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const input = validInput();
    mutate(input);
    assert.throws(() => verifyNavigationCausalHostedProvenance(input), /step/u);
  });
});

test("duplicate or partial run, job, and artifact listings fail closed", async (t) => {
  const cases = [
    ["partial runs", (value) => { value.workflowRunsListing.total_count = 2; }],
    ["duplicate matching run", (value) => {
      value.workflowRunsListing.workflow_runs.push({
        ...structuredClone(value.workflowRunsListing.workflow_runs[0]),
        id: runId + 1,
      });
      value.workflowRunsListing.total_count = 2;
    }],
    ["second other-SHA run", (value) => {
      const extra = structuredClone(value.workflowRunsListing.workflow_runs[0]);
      extra.id += 2;
      extra.head_sha = "f".repeat(40);
      value.workflowRunsListing.workflow_runs.push(extra);
      value.workflowRunsListing.total_count = 2;
    }],
    ["one job", (value) => { value.jobsListing.jobs.pop(); value.jobsListing.total_count = 1; }],
    ["reused job id", (value) => { value.jobsListing.jobs[1].id = value.jobsListing.jobs[0].id; value.jobsListing.jobs[1].url = value.jobsListing.jobs[0].url; }],
    ["one artifact", (value) => { value.artifactsListing.artifacts.pop(); value.artifactsListing.total_count = 1; }],
    ["expired artifact", (value) => { value.artifactsListing.artifacts[0].expired = true; }],
    ["wrong artifact digest", (value) => { value.artifactsListing.artifacts[0].digest = "sha256:bad"; }],
    ["reused artifact id", (value) => { value.artifactsListing.artifacts[1].id = value.artifactsListing.artifacts[0].id; value.artifactsListing.artifacts[1].url = value.artifactsListing.artifacts[0].url; }],
    ["wrong artifact head", (value) => { value.artifactsListing.artifacts[0].workflow_run.head_sha = "a".repeat(40); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const input = validInput();
    mutate(input);
    assert.throws(() => verifyNavigationCausalHostedProvenance(input));
  });
});

test("late or mutable contract and wrong source ancestry fail closed", async (t) => {
  const cases = [
    ["mutable", (value) => { value.contractReleaseRecord.immutable = false; }],
    ["created after publication", (value) => {
      value.contractReleaseRecord.created_at = "2026-09-04T21:00:01Z";
    }],
    ["late", (value) => { value.contractReleaseRecord.published_at = "2026-09-04T20:00:00Z"; }],
    ["main target", (value) => { value.contractReleaseRecord.target_commitish = "main"; }],
    ["extra parent", (value) => { value.contractCommitRecord.parents.push({ sha: "a".repeat(40) }); }],
    ["wrong source parent", (value) => { value.workflowSourceCommitRecord.parents[0].sha = "b".repeat(40); }],
    ["wrong workflow blob", (value) => { value.workflowSourceCommitRecord.files[0].sha = "c".repeat(40); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const input = validInput();
    mutate(input);
    assert.throws(() => verifyNavigationCausalHostedProvenance(input));
  });
});

test("run conclusion must equal the aggregate of both job conclusions", () => {
  const input = validInput();
  input.jobsListing.jobs[0].conclusion = "failure";
  input.jobsListing.jobs[0].steps.find(({ number }) => number === 17).conclusion = "failure";
  Object.assign(input.jobsListing.jobs[0].steps.find(({ number }) => number === 33), {
    conclusion: "skipped",
    started_at: null,
    completed_at: null,
  });
  assert.throws(
    () => verifyNavigationCausalHostedProvenance(input),
    /contradicts/u,
  );
});

test("job and step timestamps must stay within the terminal run window", async (t) => {
  const cases = [
    ["job before run", (value) => {
      value.jobsListing.jobs[0].started_at = "2026-09-04T19:00:04Z";
    }],
    ["job after run", (value) => {
      value.jobsListing.jobs[0].completed_at = "2026-09-04T19:05:01Z";
    }],
    ["step before job", (value) => {
      value.jobsListing.jobs[0].steps[0].started_at = "2026-09-04T19:00:09Z";
    }],
    ["step after job", (value) => {
      value.jobsListing.jobs[0].steps[0].completed_at = "2026-09-04T19:04:51Z";
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const input = validInput();
    mutate(input);
    assert.throws(() => verifyNavigationCausalHostedProvenance(input), /timestamp/u);
  });
});

const runId = 33910000000;
const workflowId = 999000001;
const contractSha = "d".repeat(40);
const contractTree = "e".repeat(40);

function validInput() {
  const runRecord = {
    id: runId,
    run_attempt: 1,
    workflow_id: workflowId,
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
  return {
    runRecord,
    workflowRunsListing: {
      total_count: 1,
      workflow_runs: [structuredClone(runRecord)],
    },
    jobsListing: { total_count: 2, jobs },
    artifactsListing: { total_count: 2, artifacts },
    contractReleaseRecord: {
      id: 382950000,
      tag_name: navigationCausalContractIdentity.tag,
      target_commitish: contractSha,
      immutable: true,
      draft: false,
      prerelease: false,
      created_at: "2026-09-04T18:50:00Z",
      published_at: "2026-09-04T18:55:00Z",
      url: "https://api.github.com/repos/oxhq/stasis-compat-bench/releases/382950000",
      assets: contractAssets,
    },
    contractCommitRecord: {
      sha: contractSha,
      url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${contractSha}`,
      parents: [{ sha: navigationCausalContractIdentity.soleParentSha }],
      commit: { tree: { sha: contractTree } },
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
