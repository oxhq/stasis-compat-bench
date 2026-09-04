import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  crawlPhaseDiagnosticContractIdentity as v3ContractIdentity,
} from "../../src/performance/crawl-phase-diagnostic-hosted-provenance-v3.mjs";
import {
  crawlPhaseDiagnosticV3UnpublishableIdentity,
} from "../../src/performance/crawl-phase-diagnostic-v3-unpublishable.mjs";
import {
  createCrawlPhaseDiagnosticHostedFixture,
} from "./crawl-phase-diagnostic-hosted-fixture-v3.mjs";

export function createCrawlPhaseDiagnosticV3UnpublishableFixture() {
  const fixture = createCrawlPhaseDiagnosticHostedFixture();
  const identity = crawlPhaseDiagnosticV3UnpublishableIdentity;
  const source = identity.workflowSource;
  const observation = identity.hostedObservation;
  const contract = identity.v3Contract;
  makeSourceTreeChildrenUnique(fixture.workflowSourceTreeRecords, source.repository);
  const protocol = readFileSync(new URL(
    "../../protocol/stasis-v0.3.3-performance-crawl-phase-diagnostic-v3.md",
    import.meta.url,
  ));
  const workflow = readFileSync(new URL(
    "../../protocol/stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-workflow.yml",
    import.meta.url,
  ));
  const preflightBytes = readFileSync(new URL(
    "../../protocol/stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-preflight.json",
    import.meta.url,
  ));
  const v2Unpublishable = readFileSync(new URL(
    "../../protocol/stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable.json",
    import.meta.url,
  ));
  fixture.diagnosticContractAssets = {
    protocol,
    workflow,
    preflight: { value: JSON.parse(preflightBytes), bytes: preflightBytes },
    v2Unpublishable,
  };

  Object.assign(fixture.runRecord, {
    id: observation.runId,
    workflow_id: 350_375_679,
    name: "Stasis v0.3.3 performance crawl phase diagnostic V3",
    path: source.workflowPath,
    head_branch: source.branch,
    head_sha: source.commitSha,
    run_attempt: observation.runAttempt,
    created_at: observation.createdAt,
    run_started_at: observation.runStartedAt,
    updated_at: observation.completedAt,
  });
  applyRunUrls(fixture.runRecord);
  fixture.workflowRunsListing = {
    total_count: 1,
    workflow_runs: [structuredClone(fixture.runRecord)],
  };

  const job = fixture.jobsListing.jobs[0];
  Object.assign(job, {
    id: observation.jobId,
    run_id: observation.runId,
    run_attempt: observation.runAttempt,
    name: "Native Ubuntu 22.04 crawl phase diagnostic V3",
    workflow_name: fixture.runRecord.name,
    head_branch: source.branch,
    head_sha: source.commitSha,
    started_at: "2026-09-04T17:12:20Z",
    completed_at: "2026-09-04T17:13:30Z",
    url: `https://api.github.com/repos/${source.repository}/actions/jobs/${observation.jobId}`,
    html_url: `https://github.com/${source.repository}/actions/runs/${observation.runId}/job/${observation.jobId}`,
  });
  const stepOrigin = Date.parse(job.started_at);
  job.steps.forEach((step, index) => {
    step.started_at = new Date(stepOrigin + index * 1_000).toISOString().replace(".000Z", "Z");
    step.completed_at = new Date(stepOrigin + (index + 1) * 1_000).toISOString()
      .replace(".000Z", "Z");
  });

  const artifact = fixture.artifactsListing.artifacts[0];
  Object.assign(artifact, {
    id: observation.artifact.id,
    name: observation.artifact.name,
    size_in_bytes: observation.artifact.bytes,
    digest: `sha256:${observation.artifact.sha256}`,
    expired: false,
    url: `https://api.github.com/repos/${source.repository}/actions/artifacts/${observation.artifact.id}`,
    archive_download_url:
      `https://api.github.com/repos/${source.repository}/actions/artifacts/${observation.artifact.id}/zip`,
  });
  Object.assign(artifact.workflow_run, {
    id: observation.runId,
    head_branch: source.branch,
    head_sha: source.commitSha,
  });

  const repositoryApi = `https://api.github.com/repos/${contract.repository}`;
  const repositoryWeb = `https://github.com/${contract.repository}`;
  Object.assign(fixture.diagnosticContractReleaseRecord, {
    id: contract.releaseId,
    tag_name: contract.tag,
    target_commitish: contract.targetCommitish,
    immutable: contract.immutable,
    created_at: contract.createdAt,
    published_at: contract.publishedAt,
    url: `${repositoryApi}/releases/${contract.releaseId}`,
    assets_url: `${repositoryApi}/releases/${contract.releaseId}/assets`,
    upload_url:
      `https://uploads.github.com/repos/${contract.repository}/releases/${contract.releaseId}/assets{?name,label}`,
    html_url: `${repositoryWeb}/releases/tag/${contract.tag}`,
  });
  fixture.diagnosticContractReleaseRecord.assets = contract.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    size: asset.bytes,
    digest: `sha256:${asset.sha256}`,
    state: "uploaded",
    url: `${repositoryApi}/releases/assets/${asset.id}`,
    browser_download_url: `${repositoryWeb}/releases/download/${contract.tag}/${asset.name}`,
  }));

  Object.assign(fixture.diagnosticContractCommitRecord, {
    sha: contract.commitSha,
    url: `${repositoryApi}/commits/${contract.commitSha}`,
    html_url: `${repositoryWeb}/commit/${contract.commitSha}`,
    commit: {
      tree: {
        sha: contract.treeSha,
        url: `${repositoryApi}/git/trees/${contract.treeSha}`,
      },
    },
    parents: [{
      sha: contract.parentCommitSha,
      url: `${repositoryApi}/commits/${contract.parentCommitSha}`,
      html_url: `${repositoryWeb}/commit/${contract.parentCommitSha}`,
    }],
  });
  const byName = {
    [v3ContractIdentity.assets.protocol]: protocol,
    [v3ContractIdentity.assets.workflow]: workflow,
    [v3ContractIdentity.assets.preflight]: preflightBytes,
    [v3ContractIdentity.assets.v2Unpublishable]: v2Unpublishable,
  };
  fixture.diagnosticContractCommitRecord.files = Object.entries(byName).map(
    ([name, bytes]) => contractFileRecord(name, bytes, contract),
  );
  fixture.diagnosticContractTagRefRecord = {
    ref: `refs/tags/${contract.tag}`,
    url: `${repositoryApi}/git/refs/tags/${contract.tag}`,
    object: {
      type: "commit",
      sha: contract.commitSha,
      url: `${repositoryApi}/git/commits/${contract.commitSha}`,
    },
  };

  return {
    runRecord: fixture.runRecord,
    workflowRunsListing: fixture.workflowRunsListing,
    jobsListing: fixture.jobsListing,
    artifactsListing: fixture.artifactsListing,
    contractReleaseRecord: fixture.diagnosticContractReleaseRecord,
    contractCommitRecord: fixture.diagnosticContractCommitRecord,
    contractTagRefRecord: fixture.diagnosticContractTagRefRecord,
    diagnosticContractAssets: fixture.diagnosticContractAssets,
    comparisonEvidenceReleaseRecord: fixture.comparisonEvidenceReleaseRecord,
    comparisonEvidenceCommitRecord: fixture.comparisonEvidenceCommitRecord,
    comparisonEvidenceTagRefRecord: fixture.comparisonEvidenceTagRefRecord,
    comparisonEvidenceAssets: fixture.comparisonEvidenceAssets,
    workflowSourceCommitRecord: fixture.workflowSourceCommitRecord,
    workflowSourceTreeRecords: fixture.workflowSourceTreeRecords,
    workflowSourceBlobRecord: fixture.workflowSourceBlobRecord,
    workflowSourceBytes: fixture.workflowSourceBytes,
    preservedV2DiagnosticWorkflowBlobRecord:
      fixture.preservedV2DiagnosticWorkflowBlobRecord,
    preservedV1DiagnosticWorkflowBlobRecord:
      fixture.preservedV1DiagnosticWorkflowBlobRecord,
    preservedComparisonWorkflowBlobRecord:
      fixture.preservedComparisonWorkflowBlobRecord,
  };
}

function makeSourceTreeChildrenUnique(trees, repository) {
  const githubSha = "7".repeat(40);
  const workflowsSha = "8".repeat(40);
  trees.root.tree[0].sha = githubSha;
  trees.root.tree[0].url =
    `https://api.github.com/repos/${repository}/git/trees/${githubSha}`;
  trees.github.sha = githubSha;
  trees.github.url =
    `https://api.github.com/repos/${repository}/git/trees/${githubSha}`;
  trees.github.tree[0].sha = workflowsSha;
  trees.github.tree[0].url =
    `https://api.github.com/repos/${repository}/git/trees/${workflowsSha}`;
  trees.workflows.sha = workflowsSha;
  trees.workflows.url =
    `https://api.github.com/repos/${repository}/git/trees/${workflowsSha}`;
}

function applyRunUrls(run) {
  const repository = crawlPhaseDiagnosticV3UnpublishableIdentity.workflowSource.repository;
  const api = `https://api.github.com/repos/${repository}`;
  const web = `https://github.com/${repository}`;
  run.url = `${api}/actions/runs/${run.id}`;
  run.html_url = `${web}/actions/runs/${run.id}`;
  run.jobs_url = `${api}/actions/runs/${run.id}/jobs`;
  run.artifacts_url = `${api}/actions/runs/${run.id}/artifacts`;
}

function contractFileRecord(name, bytes, contract) {
  const filename = `protocol/${name}`;
  const encoded = encodeURIComponent(filename);
  return {
    status: "added",
    filename,
    sha: gitBlobSha(bytes),
    blob_url:
      `https://github.com/${contract.repository}/blob/${contract.commitSha}/${encoded}`,
    raw_url:
      `https://github.com/${contract.repository}/raw/${contract.commitSha}/${encoded}`,
    contents_url:
      `https://api.github.com/repos/${contract.repository}/contents/${encoded}?ref=${contract.commitSha}`,
  };
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.byteLength}\0`))
    .update(bytes)
    .digest("hex");
}
