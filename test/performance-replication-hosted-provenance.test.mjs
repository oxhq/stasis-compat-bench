import assert from "node:assert/strict";
import test from "node:test";

import {
  performanceReplicationContractIdentity,
  performanceReplicationExpectedArtifactNames,
  performanceReplicationExpectedJobNames,
  performanceReplicationHostedProvenanceSchema,
  verifyPerformanceReplicationHostedProvenance,
} from "../src/performance/replication-hosted-provenance.mjs";

const runId = 33860000001;
const repositoryId = 1342978708;
const headSha = "6c7a6013e00584c8cb8d54c80cee5dbbcf3ca1b9";
const headBranch = "codex/stasis-v033-performance-evidence";
const workflowName = "Stasis v0.3.3 performance evidence";
const runCreatedAt = "2026-09-04T12:00:00Z";
const runStartedAt = "2026-09-04T12:01:00Z";
const contractCommitSha = "d".repeat(40);
const contractTreeSha = "e".repeat(40);
const contractReleaseId = 250000001;
const contractAssetId = 310000001;

test("hosted provenance verifier returns a deterministic privacy-safe receipt", () => {
  const first = verifyPerformanceReplicationHostedProvenance(validInput());
  const reordered = validInput();
  reordered.workflowRunsListing.workflow_runs.reverse();
  reordered.jobsListing.jobs.reverse();
  reordered.artifactsListing.artifacts.reverse();
  const second = verifyPerformanceReplicationHostedProvenance(reordered);

  assert.deepEqual(first, second);
  assert.equal(first.schema, performanceReplicationHostedProvenanceSchema);
  assert.equal(first.status, "passed");
  assert.equal(first.producer.runId, runId);
  assert.equal(first.oneShot.matchingRunCount, 1);
  assert.equal(first.oneShot.completeListing, true);
  assert.equal(first.contract.immutable, true);
  assert.equal(first.contract.targetCommitSha, contractCommitSha);
  assert.equal(first.contract.soleParentSha, performanceReplicationContractIdentity.soleParentSha);
  assert.deepEqual(first.jobs.map(({ name }) => name), performanceReplicationExpectedJobNames);
  assert.deepEqual(
    first.artifacts.map(({ name }) => name),
    performanceReplicationExpectedArtifactNames,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.jobs), true);
  assert.equal(Object.isFrozen(first.artifacts[0]), true);
  assert.equal(JSON.stringify(first).includes("http"), false);
  assert.equal(JSON.stringify(first).includes("runner_name"), false);
  assert.equal(JSON.stringify(first).includes("not-retained"), false);
});

test("hosted provenance verifier rejects absent, duplicate, and incompletely paginated one-shot runs", async (t) => {
  const cases = [
    ["no matching run", (value) => {
      value.workflowRunsListing.workflow_runs[0].head_sha = "a".repeat(40);
    }],
    ["duplicate matching run", (value) => {
      const duplicate = structuredClone(value.workflowRunsListing.workflow_runs[0]);
      duplicate.id += 100;
      applyRunUrls(duplicate);
      value.workflowRunsListing.workflow_runs.push(duplicate);
      value.workflowRunsListing.total_count += 1;
    }],
    ["incomplete pagination", (value) => {
      value.workflowRunsListing.total_count += 1;
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const value = validInput();
      mutate(value);
      assert.throws(
        () => verifyPerformanceReplicationHostedProvenance(value),
        /workflow-runs|exactly one matching/u,
      );
    });
  }
});

test("hosted provenance verifier rejects mutable, late, or otherwise wrong contract releases", async (t) => {
  const cases = [
    ["mutable", (value) => { value.contractReleaseRecord.immutable = false; }],
    ["late", (value) => { value.contractReleaseRecord.published_at = runCreatedAt; }],
    ["wrong tag", (value) => { value.contractReleaseRecord.tag_name += "-wrong"; }],
    ["draft", (value) => { value.contractReleaseRecord.draft = true; }],
    ["prerelease", (value) => { value.contractReleaseRecord.prerelease = true; }],
    ["missing asset", (value) => { value.contractReleaseRecord.assets = []; }],
    ["zero asset size", (value) => { value.contractReleaseRecord.assets[0].size = 0; }],
    ["wrong positive asset size", (value) => {
      value.contractReleaseRecord.assets[0].size =
        performanceReplicationContractIdentity.assetSizeInBytes + 1;
    }],
    ["wrong well-formed asset digest", (value) => {
      value.contractReleaseRecord.assets[0].digest = `sha256:${"d".repeat(64)}`;
    }],
    ["invalid asset digest", (value) => {
      value.contractReleaseRecord.assets[0].digest = "sha256:not-a-digest";
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const value = validInput();
      mutate(value);
      assert.throws(
        () => verifyPerformanceReplicationHostedProvenance(value),
        /contract release/u,
      );
    });
  }
});

test("hosted provenance verifier rejects wrong contract target, parent, or tree", async (t) => {
  const cases = [
    ["wrong target", (value) => {
      value.contractReleaseRecord.target_commitish = "a".repeat(40);
    }],
    ["wrong commit SHA", (value) => { value.contractCommitRecord.sha = "a".repeat(40); }],
    ["wrong parent", (value) => {
      value.contractCommitRecord.parents[0].sha = "b".repeat(40);
    }],
    ["extra parent", (value) => {
      value.contractCommitRecord.parents.push(structuredClone(value.contractCommitRecord.parents[0]));
    }],
    ["invalid tree", (value) => { value.contractCommitRecord.commit.tree.sha = "not-a-tree"; }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const value = validInput();
      mutate(value);
      assert.throws(
        () => verifyPerformanceReplicationHostedProvenance(value),
        /contract commit/u,
      );
    });
  }
});

test("hosted provenance verifier rejects public URLs bound to another repository", async (t) => {
  const cases = [
    ["selected run", (value) => {
      value.runRecord.url = value.runRecord.url.replace("/oxhq/stasis/", "/other/stasis/");
    }],
    ["enumerated run", (value) => {
      const run = value.workflowRunsListing.workflow_runs[0];
      run.url = run.url.replace("/oxhq/stasis/", "/other/stasis/");
    }],
    ["job", (value) => {
      const job = value.jobsListing.jobs[0];
      job.url = job.url.replace("/oxhq/stasis/", "/other/stasis/");
    }],
    ["artifact", (value) => {
      const artifact = value.artifactsListing.artifacts[0];
      artifact.url = artifact.url.replace("/oxhq/stasis/", "/other/stasis/");
    }],
    ["release", (value) => {
      value.contractReleaseRecord.url = value.contractReleaseRecord.url.replace(
        "/oxhq/stasis-compat-bench/",
        "/other/stasis-compat-bench/",
      );
    }],
    ["release asset", (value) => {
      const asset = value.contractReleaseRecord.assets[0];
      asset.url = asset.url.replace(
        "/oxhq/stasis-compat-bench/",
        "/other/stasis-compat-bench/",
      );
    }],
    ["commit", (value) => {
      value.contractCommitRecord.url = value.contractCommitRecord.url.replace(
        "/oxhq/stasis-compat-bench/",
        "/other/stasis-compat-bench/",
      );
    }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const value = validInput();
      mutate(value);
      assert.throws(
        () => verifyPerformanceReplicationHostedProvenance(value),
        /URL repository binding mismatch/u,
      );
    });
  }
});

test("hosted provenance verifier rejects wrong run identity and attempt", async (t) => {
  const cases = [
    ["original run", (value) => { value.runRecord.id = 33851425108; }],
    ["wrong attempt", (value) => { value.runRecord.run_attempt = 2; }],
    ["wrong repository", (value) => { value.runRecord.repository.full_name = "other/stasis"; }],
    ["wrong workflow", (value) => { value.runRecord.workflow_id += 1; }],
    ["wrong path", (value) => { value.runRecord.path += ".changed"; }],
    ["wrong event", (value) => { value.runRecord.event = "workflow_dispatch"; }],
    ["wrong branch", (value) => { value.runRecord.head_branch = "main"; }],
    ["wrong SHA", (value) => { value.runRecord.head_sha = "a".repeat(40); }],
    ["nonterminal run", (value) => { value.runRecord.status = "in_progress"; }],
    ["failed run", (value) => { value.runRecord.conclusion = "failure"; }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const value = validInput();
      mutate(value);
      assert.throws(
        () => verifyPerformanceReplicationHostedProvenance(value),
        /Hosted replication run/u,
      );
    });
  }
});

test("hosted provenance verifier rejects failed, missing, reused, and duplicate jobs", async (t) => {
  const cases = [
    ["failed", (value) => { value.jobsListing.jobs[1].conclusion = "failure"; }],
    ["missing", (value) => {
      value.jobsListing.jobs.pop();
      value.jobsListing.total_count = 3;
    }],
    ...[
      100954874545,
      100954904056,
      100954904065,
      100957175132,
    ].map((originalId, index) => [
      `reused original ID ${originalId}`,
      (value) => { value.jobsListing.jobs[index].id = originalId; },
    ]),
    ["duplicate ID", (value) => { value.jobsListing.jobs[1].id = value.jobsListing.jobs[0].id; }],
    ["duplicate name", (value) => { value.jobsListing.jobs[1].name = value.jobsListing.jobs[0].name; }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const value = validInput();
      mutate(value);
      assert.throws(
        () => verifyPerformanceReplicationHostedProvenance(value),
        /Hosted replication (?:job|requires)/u,
      );
    });
  }
});

test("hosted provenance verifier rejects expired, misbound, missing, and duplicate artifacts", async (t) => {
  const cases = [
    ["expired", (value) => { value.artifactsListing.artifacts[0].expired = true; }],
    ["wrong run binding", (value) => { value.artifactsListing.artifacts[0].workflow_run.id += 1; }],
    ["wrong SHA binding", (value) => { value.artifactsListing.artifacts[0].workflow_run.head_sha = "b".repeat(40); }],
    ["wrong repository binding", (value) => { value.artifactsListing.artifacts[0].workflow_run.repository_id += 1; }],
    ["missing", (value) => {
      value.artifactsListing.artifacts.pop();
      value.artifactsListing.total_count = 6;
    }],
    ["duplicate ID", (value) => {
      value.artifactsListing.artifacts[1].id = value.artifactsListing.artifacts[0].id;
    }],
    ["duplicate name", (value) => {
      value.artifactsListing.artifacts[1].name = value.artifactsListing.artifacts[0].name;
    }],
    ["zero size", (value) => { value.artifactsListing.artifacts[0].size_in_bytes = 0; }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const value = validInput();
      mutate(value);
      assert.throws(
        () => verifyPerformanceReplicationHostedProvenance(value),
        /Hosted replication (?:artifact|requires)/u,
      );
    });
  }
});

function validInput() {
  const runRecord = applyRunUrls({
    id: runId,
    run_attempt: 1,
    event: "push",
    status: "completed",
    conclusion: "success",
    head_branch: headBranch,
    head_sha: headSha,
    path: ".github/workflows/stasis-v0.3.3-performance-evidence.yml",
    workflow_id: 348709993,
    name: workflowName,
    created_at: runCreatedAt,
    run_started_at: runStartedAt,
    repository: {
      id: repositoryId,
      full_name: "oxhq/stasis",
      url: "https://api.github.com/repos/oxhq/stasis",
    },
    head_repository: {
      id: repositoryId,
      full_name: "oxhq/stasis",
      url: "https://api.github.com/repos/oxhq/stasis",
    },
    actor: { login: "not-retained", url: "https://api.github.com/users/not-retained" },
  });
  const unrelatedRun = applyRunUrls({
    ...structuredClone(runRecord),
    id: runId - 1,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "a".repeat(40),
  });
  return {
    runRecord,
    workflowRunsListing: {
      total_count: 2,
      workflow_runs: [structuredClone(runRecord), unrelatedRun],
    },
    jobsListing: {
      total_count: performanceReplicationExpectedJobNames.length,
      jobs: performanceReplicationExpectedJobNames.map((name, index) => ({
        id: 101000000001 + index,
        run_id: runId,
        run_attempt: 1,
        head_sha: headSha,
        workflow_name: workflowName,
        name,
        status: "completed",
        conclusion: "success",
        url: `https://api.github.com/repos/oxhq/stasis/actions/jobs/${101000000001 + index}`,
        html_url:
          `https://github.com/oxhq/stasis/actions/runs/${runId}/job/${101000000001 + index}`,
        runner_name: `Hosted Agent ${index}`,
      })),
    },
    artifactsListing: {
      total_count: performanceReplicationExpectedArtifactNames.length,
      artifacts: performanceReplicationExpectedArtifactNames.map((name, index) => ({
        id: 9930000001 + index,
        name,
        size_in_bytes: 1000 + index,
        digest: `sha256:${String(index + 1).repeat(64)}`,
        expired: false,
        url:
          `https://api.github.com/repos/oxhq/stasis/actions/artifacts/${9930000001 + index}`,
        archive_download_url:
          `https://api.github.com/repos/oxhq/stasis/actions/artifacts/${9930000001 + index}/zip`,
        workflow_run: {
          id: runId,
          head_branch: headBranch,
          head_sha: headSha,
          repository_id: repositoryId,
          head_repository_id: repositoryId,
        },
      })),
    },
    contractReleaseRecord: {
      id: contractReleaseId,
      tag_name: performanceReplicationContractIdentity.tag,
      target_commitish: contractCommitSha,
      draft: false,
      prerelease: false,
      immutable: true,
      published_at: "2026-09-04T11:00:00Z",
      url:
        `https://api.github.com/repos/oxhq/stasis-compat-bench/releases/${contractReleaseId}`,
      html_url:
        `https://github.com/oxhq/stasis-compat-bench/releases/tag/${performanceReplicationContractIdentity.tag}`,
      assets_url:
        `https://api.github.com/repos/oxhq/stasis-compat-bench/releases/${contractReleaseId}/assets`,
      upload_url:
        `https://uploads.github.com/repos/oxhq/stasis-compat-bench/releases/${contractReleaseId}/assets{?name,label}`,
      author: { login: "not-retained" },
      assets: [{
        id: contractAssetId,
        name: performanceReplicationContractIdentity.assetName,
        state: "uploaded",
        size: performanceReplicationContractIdentity.assetSizeInBytes,
        digest: `sha256:${performanceReplicationContractIdentity.assetSha256}`,
        url:
          `https://api.github.com/repos/oxhq/stasis-compat-bench/releases/assets/${contractAssetId}`,
        browser_download_url:
          `https://github.com/oxhq/stasis-compat-bench/releases/download/${performanceReplicationContractIdentity.tag}/${performanceReplicationContractIdentity.assetName}`,
        uploader: { login: "not-retained" },
      }],
    },
    contractCommitRecord: {
      sha: contractCommitSha,
      url:
        `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${contractCommitSha}`,
      html_url:
        `https://github.com/oxhq/stasis-compat-bench/commit/${contractCommitSha}`,
      commit: {
        tree: {
          sha: contractTreeSha,
          url:
            `https://api.github.com/repos/oxhq/stasis-compat-bench/git/trees/${contractTreeSha}`,
        },
      },
      parents: [{
        sha: performanceReplicationContractIdentity.soleParentSha,
        url:
          `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${performanceReplicationContractIdentity.soleParentSha}`,
        html_url:
          `https://github.com/oxhq/stasis-compat-bench/commit/${performanceReplicationContractIdentity.soleParentSha}`,
      }],
    },
  };
}

function applyRunUrls(value) {
  value.url = `https://api.github.com/repos/oxhq/stasis/actions/runs/${value.id}`;
  value.html_url = `https://github.com/oxhq/stasis/actions/runs/${value.id}`;
  value.jobs_url = `https://api.github.com/repos/oxhq/stasis/actions/runs/${value.id}/jobs`;
  value.artifacts_url =
    `https://api.github.com/repos/oxhq/stasis/actions/runs/${value.id}/artifacts`;
  return value;
}
