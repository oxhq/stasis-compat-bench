import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import {
  crawlPhaseDiagnosticArtifactEntries,
  crawlPhaseDiagnosticComparisonEvidenceIdentity,
  crawlPhaseDiagnosticContractIdentity,
  crawlPhaseDiagnosticExpectedArtifactNames,
  crawlPhaseDiagnosticHostedIdentity,
  crawlPhaseDiagnosticJobStepIdentity,
  crawlPhaseDiagnosticPreflightSchema,
  crawlPhaseDiagnosticPublicationOutcomeAssetNames,
} from "../../src/performance/crawl-phase-diagnostic-hosted-provenance.mjs";
import {
  performanceReplicationHostedIdentity,
} from "../../src/performance/replication-hosted-provenance.mjs";
import {
  performanceReplicationPublicationAssetNames,
} from "../../src/performance/replication-publication.mjs";

const freshCrawlGzipBase64 =
  "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";

const artifactBindingGzipBase64 =
  "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";

export const crawlPhaseDiagnosticComparisonFixtureBytes = Object.freeze({
  freshCrawlRaw: gunzipSync(Buffer.from(freshCrawlGzipBase64, "base64")),
  artifactBinding: gunzipSync(Buffer.from(artifactBindingGzipBase64, "base64")),
});

const repositoryId = 1342978708;
const runId = 33870000001;
const workflowId = 400000001;
const jobId = 101100000001;
const contractReleaseId = 382700001;
const contractCommitSha = "d".repeat(40);

export function diagnosticFixtureSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.byteLength}\0`))
    .update(bytes)
    .digest("hex");
}

export function canonicalDiagnosticFixtureBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function createCrawlPhaseDiagnosticHostedFixture({ conclusion = "success", artifactCount, stepMode } = {}) {
  const workflowBytes = Buffer.from("name: frozen diagnostic workflow\n", "utf8");
  const preservedBytes = Buffer.from("name: preserved comparison workflow\n", "utf8");
  const workflowBlobSha = gitBlobSha(workflowBytes);
  const preservedBlobSha = gitBlobSha(preservedBytes);
  const sourceSha = "a".repeat(40);
  const sourceTreeSha = "b".repeat(40);
  const publicationOutcomes = structuredClone(crawlPhaseDiagnosticPublicationOutcomeAssetNames);
  const preflight = {
    schema: crawlPhaseDiagnosticPreflightSchema,
    status: "preregistered",
    comparisonEvidence: {
      repository: crawlPhaseDiagnosticComparisonEvidenceIdentity.repository,
      releaseId: crawlPhaseDiagnosticComparisonEvidenceIdentity.releaseId,
      tag: crawlPhaseDiagnosticComparisonEvidenceIdentity.tag,
      targetCommitSha: crawlPhaseDiagnosticComparisonEvidenceIdentity.targetCommitSha,
      targetTreeSha: crawlPhaseDiagnosticComparisonEvidenceIdentity.targetTreeSha,
      assets: [
        crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.artifactBinding,
        crawlPhaseDiagnosticComparisonEvidenceIdentity.assets.freshCrawlRaw,
      ].map(({ name, bytes, sha256: digest }) => ({ name, bytes, sha256: digest })),
    },
    diagnosticContract: {
      repository: crawlPhaseDiagnosticContractIdentity.repository,
      parentCommitSha: crawlPhaseDiagnosticContractIdentity.soleParentSha,
      tag: crawlPhaseDiagnosticContractIdentity.tag,
      evidenceTag: crawlPhaseDiagnosticContractIdentity.evidenceTag,
      releaseAssetNames: Object.values(crawlPhaseDiagnosticContractIdentity.assets).sort(),
    },
    workflowSource: {
      repository: crawlPhaseDiagnosticHostedIdentity.repository,
      branch: crawlPhaseDiagnosticHostedIdentity.headBranch,
      ref: crawlPhaseDiagnosticHostedIdentity.headRef,
      commitSha: sourceSha,
      parentCommitSha: performanceReplicationHostedIdentity.headSha,
      treeSha: sourceTreeSha,
      changedFiles: [{ status: "added", path: crawlPhaseDiagnosticHostedIdentity.workflow.path }],
      workflow: {
        path: crawlPhaseDiagnosticHostedIdentity.workflow.path,
        blobSha: workflowBlobSha,
        name: crawlPhaseDiagnosticHostedIdentity.workflow.name,
        jobId: crawlPhaseDiagnosticHostedIdentity.job.id,
        jobName: crawlPhaseDiagnosticHostedIdentity.job.name,
      },
      preservedComparisonWorkflow: {
        path: performanceReplicationHostedIdentity.workflow.path,
        blobSha: preservedBlobSha,
      },
    },
    execution: {
      event: "push",
      runAttempt: 1,
      runnerLabels: ["ubuntu-22.04"],
      runnerOs: "Linux",
      runnerArch: "X64",
      nodeVersion: "22.20.0",
      comparisonRunId: crawlPhaseDiagnosticHostedIdentity.comparison.runId,
      comparisonCrawlJobId: crawlPhaseDiagnosticHostedIdentity.comparison.crawlJobId,
      order: ["crawlee", "stasis"],
      warmups: 0,
      retries: false,
      sleeps: false,
      fallbacks: false,
      discardedObservations: false,
      statistics: false,
      pooling: "none",
    },
    actionsArtifacts: {
      bundle: {
        name: crawlPhaseDiagnosticExpectedArtifactNames[0],
        availability: "outcome_dependent",
        validRequiredEntries: [...crawlPhaseDiagnosticArtifactEntries.valid],
        invalidRequiredEntries: [...crawlPhaseDiagnosticArtifactEntries.status],
        optionalEntries: [],
      },
    },
    publicationOutcomes,
    claimBoundary: {
      authorityEligible: false,
      timingEligible: false,
      statisticsEligible: false,
      comparisonEligible: false,
      optimizationEligible: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
  };
  const contractAssets = {
    protocol: Buffer.from("# Frozen diagnostic protocol\n", "utf8"),
    workflow: workflowBytes,
    preflight: { value: preflight, bytes: canonicalDiagnosticFixtureBytes(preflight) },
  };
  const run = runRecord({ conclusion, sourceSha });
  const count = artifactCount ?? 1;
  const artifacts = artifactListing(count, run);
  return {
    runRecord: run,
    workflowRunsListing: { total_count: 1, workflow_runs: [structuredClone(run)] },
    jobsListing: jobsRecord({
      conclusion,
      sourceSha,
      stepMode: stepMode ?? (conclusion === "success" ? "bundle_valid" : "bundle_status"),
    }),
    artifactsListing: artifacts,
    diagnosticContractReleaseRecord: releaseRecord({
      repository: crawlPhaseDiagnosticContractIdentity.repository,
      tag: crawlPhaseDiagnosticContractIdentity.tag,
      id: contractReleaseId,
      target: contractCommitSha,
      publishedAt: "2026-09-04T12:00:00Z",
      assets: Object.fromEntries([
        [crawlPhaseDiagnosticContractIdentity.assets.protocol, contractAssets.protocol],
        [crawlPhaseDiagnosticContractIdentity.assets.workflow, contractAssets.workflow],
        [crawlPhaseDiagnosticContractIdentity.assets.preflight, contractAssets.preflight.bytes],
      ]),
    }),
    diagnosticContractCommitRecord: contractSourceCommit(commitRecord({
      repository: crawlPhaseDiagnosticContractIdentity.repository,
      sha: contractCommitSha,
      tree: "e".repeat(40),
      parents: [crawlPhaseDiagnosticContractIdentity.soleParentSha],
    }), contractAssets),
    diagnosticContractTagRefRecord: tagRef(
      crawlPhaseDiagnosticContractIdentity.repository,
      crawlPhaseDiagnosticContractIdentity.tag,
      contractCommitSha,
    ),
    diagnosticContractAssets: contractAssets,
    comparisonEvidenceReleaseRecord: comparisonRelease(),
    comparisonEvidenceCommitRecord: commitRecord({
      repository: crawlPhaseDiagnosticComparisonEvidenceIdentity.repository,
      sha: crawlPhaseDiagnosticComparisonEvidenceIdentity.targetCommitSha,
      tree: crawlPhaseDiagnosticComparisonEvidenceIdentity.targetTreeSha,
      parents: ["f".repeat(40)],
    }),
    comparisonEvidenceTagRefRecord: tagRef(
      crawlPhaseDiagnosticComparisonEvidenceIdentity.repository,
      crawlPhaseDiagnosticComparisonEvidenceIdentity.tag,
      crawlPhaseDiagnosticComparisonEvidenceIdentity.targetCommitSha,
    ),
    comparisonEvidenceAssets: {
      artifactBinding: Buffer.from(crawlPhaseDiagnosticComparisonFixtureBytes.artifactBinding),
      freshCrawlRaw: Buffer.from(crawlPhaseDiagnosticComparisonFixtureBytes.freshCrawlRaw),
    },
    workflowSourceCommitRecord: sourceCommit(preflight),
    workflowSourceTreeRecord: sourceTree(preflight),
    workflowSourceBlobRecord: blobRecord(
      crawlPhaseDiagnosticHostedIdentity.repository,
      workflowBytes,
    ),
    workflowSourceBytes: workflowBytes,
    preservedComparisonWorkflowBlobRecord: blobRecord(
      crawlPhaseDiagnosticHostedIdentity.repository,
      preservedBytes,
    ),
  };
}

function runRecord({ conclusion, sourceSha }) {
  const api = `https://api.github.com/repos/${crawlPhaseDiagnosticHostedIdentity.repository}`;
  const web = `https://github.com/${crawlPhaseDiagnosticHostedIdentity.repository}`;
  return {
    id: runId,
    run_attempt: 1,
    event: "push",
    status: "completed",
    conclusion,
    head_branch: crawlPhaseDiagnosticHostedIdentity.headBranch,
    head_sha: sourceSha,
    path: crawlPhaseDiagnosticHostedIdentity.workflow.path,
    workflow_id: workflowId,
    name: crawlPhaseDiagnosticHostedIdentity.workflow.name,
    repository: { id: repositoryId, full_name: crawlPhaseDiagnosticHostedIdentity.repository, url: api },
    head_repository: { id: repositoryId, full_name: crawlPhaseDiagnosticHostedIdentity.repository, url: api },
    url: `${api}/actions/runs/${runId}`,
    html_url: `${web}/actions/runs/${runId}`,
    jobs_url: `${api}/actions/runs/${runId}/jobs`,
    artifacts_url: `${api}/actions/runs/${runId}/artifacts`,
    created_at: "2026-09-04T13:00:00Z",
    run_started_at: "2026-09-04T13:01:00Z",
    updated_at: "2026-09-04T13:10:00Z",
  };
}

function jobsRecord({ conclusion, sourceSha, stepMode }) {
  const repository = crawlPhaseDiagnosticHostedIdentity.repository;
  return {
    total_count: 1,
    jobs: [{
      id: jobId,
      name: crawlPhaseDiagnosticHostedIdentity.job.name,
      run_id: runId,
      run_attempt: 1,
      head_sha: sourceSha,
      workflow_name: crawlPhaseDiagnosticHostedIdentity.workflow.name,
      status: "completed",
      conclusion,
      labels: ["ubuntu-22.04"],
      url: `https://api.github.com/repos/${repository}/actions/jobs/${jobId}`,
      html_url: `https://github.com/${repository}/actions/runs/${runId}/job/${jobId}`,
      started_at: "2026-09-04T13:01:30Z",
      completed_at: "2026-09-04T13:09:30Z",
      steps: jobSteps(stepMode),
    }],
  };
}

function jobSteps(mode) {
  const identity = crawlPhaseDiagnosticJobStepIdentity;
  const preparation = identity.preparation.map((step) => ({ ...step, conclusion: "success" }));
  if (mode === "bundle_status") {
    const failureIndex = 14;
    preparation.forEach((step, index) => {
      step.conclusion = index < failureIndex ? "success" : index === failureIndex ? "failure" : "skipped";
    });
  }
  const tail = {
    bundle_valid: ["success", "success", "success", "skipped"],
    bundle_status: ["success", "success", "success", "failure"],
    no_artifact: ["success", "success", "failure", "failure"],
    no_artifact_create: ["failure", "skipped", "skipped", "failure"],
    no_artifact_seal: ["success", "failure", "skipped", "failure"],
    no_artifact_upload: ["success", "success", "failure", "failure"],
  }[mode];
  assert.notEqual(tail, undefined);
  const conclusion = mode === "bundle_valid" ? "success" : "failure";
  const specifications = [
    { ...identity.setup, conclusion: "success" },
    ...preparation,
    { ...identity.createOutcome, conclusion: tail[0] },
    { ...identity.sealBundle, conclusion: tail[1] },
    { ...identity.uploadBundle, conclusion: tail[2] },
    { ...identity.propagate, conclusion: tail[3] },
    { ...identity.postSetupNode, conclusion: conclusion === "success" ? "success" : "skipped" },
    { ...identity.postCheckout, conclusion: "success" },
    { ...identity.complete, conclusion: "success" },
  ];
  const origin = Date.parse("2026-09-04T13:01:30Z");
  return specifications.map((step, index) => ({
    number: step.number,
    name: step.name,
    status: "completed",
    conclusion: step.conclusion,
    started_at: new Date(origin + index * 1_000).toISOString().replace(".000Z", "Z"),
    completed_at: new Date(origin + (index + 1) * 1_000).toISOString().replace(".000Z", "Z"),
  }));
}

function artifactListing(count, run) {
  const artifacts = Array.from({ length: count }, (_, index) => {
    const name = crawlPhaseDiagnosticExpectedArtifactNames[index] ?? `unexpected-${index}`;
    const id = 500000001 + index;
    const bytes = Buffer.from(`zip-${index + 1}`, "utf8");
    return {
      id,
      name,
      size_in_bytes: bytes.byteLength,
      digest: `sha256:${diagnosticFixtureSha256(bytes)}`,
      expired: false,
      url: `https://api.github.com/repos/oxhq/stasis/actions/artifacts/${id}`,
      archive_download_url: `https://api.github.com/repos/oxhq/stasis/actions/artifacts/${id}/zip`,
      workflow_run: {
        id: run.id,
        head_branch: run.head_branch,
        head_sha: run.head_sha,
        repository_id: repositoryId,
        head_repository_id: repositoryId,
      },
    };
  });
  return { total_count: artifacts.length, artifacts };
}

function releaseRecord({ repository, tag, id, target, publishedAt, assets }) {
  return {
    id,
    tag_name: tag,
    draft: false,
    prerelease: false,
    immutable: true,
    target_commitish: target,
    published_at: publishedAt,
    url: `https://api.github.com/repos/${repository}/releases/${id}`,
    html_url: `https://github.com/${repository}/releases/tag/${tag}`,
    assets_url: `https://api.github.com/repos/${repository}/releases/${id}/assets`,
    upload_url: `https://uploads.github.com/repos/${repository}/releases/${id}/assets{?name,label}`,
    assets: Object.entries(assets).map(([name, bytes], index) => {
      const assetId = id * 10 + index + 1;
      return {
        id: assetId,
        name,
        size: bytes.byteLength,
        digest: `sha256:${diagnosticFixtureSha256(bytes)}`,
        state: "uploaded",
        url: `https://api.github.com/repos/${repository}/releases/assets/${assetId}`,
        browser_download_url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
      };
    }),
  };
}

function comparisonRelease() {
  const expected = crawlPhaseDiagnosticComparisonEvidenceIdentity;
  const placeholder = Buffer.from("x", "utf8");
  const assets = Object.fromEntries(performanceReplicationPublicationAssetNames.map((name) => [name, placeholder]));
  assets[expected.assets.artifactBinding.name] = crawlPhaseDiagnosticComparisonFixtureBytes.artifactBinding;
  assets[expected.assets.freshCrawlRaw.name] = crawlPhaseDiagnosticComparisonFixtureBytes.freshCrawlRaw;
  const release = releaseRecord({
    repository: expected.repository,
    tag: expected.tag,
    id: expected.releaseId,
    target: expected.targetCommitSha,
    publishedAt: "2026-09-04T11:37:42Z",
    assets,
  });
  for (const [key, identity] of Object.entries(expected.assets)) {
    const asset = release.assets.find(({ name }) => name === identity.name);
    asset.id = identity.id;
    asset.url = `https://api.github.com/repos/${expected.repository}/releases/assets/${identity.id}`;
    void key;
  }
  return release;
}

function commitRecord({ repository, sha, tree, parents }) {
  return {
    sha,
    url: `https://api.github.com/repos/${repository}/commits/${sha}`,
    html_url: `https://github.com/${repository}/commit/${sha}`,
    commit: { tree: { sha: tree, url: `https://api.github.com/repos/${repository}/git/trees/${tree}` } },
    parents: parents.map((parent) => ({
      sha: parent,
      url: `https://api.github.com/repos/${repository}/commits/${parent}`,
      html_url: `https://github.com/${repository}/commit/${parent}`,
    })),
  };
}

function tagRef(repository, tag, sha) {
  return {
    ref: `refs/tags/${tag}`,
    url: `https://api.github.com/repos/${repository}/git/refs/tags/${tag}`,
    object: {
      type: "commit",
      sha,
      url: `https://api.github.com/repos/${repository}/git/commits/${sha}`,
    },
  };
}

function sourceCommit(preflight) {
  const source = preflight.workflowSource;
  const result = commitRecord({
    repository: source.repository,
    sha: source.commitSha,
    tree: source.treeSha,
    parents: [source.parentCommitSha],
  });
  result.files = [{
    status: "added",
    filename: source.workflow.path,
    sha: source.workflow.blobSha,
    blob_url: `https://github.com/${source.repository}/blob/${source.commitSha}/${source.workflow.path}`,
    raw_url: `https://github.com/${source.repository}/raw/${source.commitSha}/${source.workflow.path}`,
    contents_url: `https://api.github.com/repos/${source.repository}/contents/${source.workflow.path}?ref=${source.commitSha}`,
  }];
  return result;
}

function contractSourceCommit(commit, assets) {
  const byName = {
    [crawlPhaseDiagnosticContractIdentity.assets.protocol]: assets.protocol,
    [crawlPhaseDiagnosticContractIdentity.assets.workflow]: assets.workflow,
    [crawlPhaseDiagnosticContractIdentity.assets.preflight]: assets.preflight.bytes,
  };
  commit.files = Object.entries(byName).map(([name, bytes]) => {
    const filename = `protocol/${name}`;
    const blobSha = gitBlobSha(bytes);
    return {
      status: "added",
      filename,
      sha: blobSha,
      blob_url: `https://github.com/oxhq/stasis-compat-bench/blob/${commit.sha}/${filename}`,
      raw_url: `https://github.com/oxhq/stasis-compat-bench/raw/${commit.sha}/${filename}`,
      contents_url: `https://api.github.com/repos/oxhq/stasis-compat-bench/contents/${filename}?ref=${commit.sha}`,
    };
  });
  commit.files.push({
    status: "added",
    filename: "src/unrelated-implementation.mjs",
    sha: "9".repeat(40),
  });
  return commit;
}

function sourceTree(preflight) {
  const source = preflight.workflowSource;
  return {
    sha: source.treeSha,
    url: `https://api.github.com/repos/${source.repository}/git/trees/${source.treeSha}`,
    truncated: false,
    tree: [source.workflow, source.preservedComparisonWorkflow].map((entry) => ({
      path: entry.path,
      mode: "100644",
      type: "blob",
      sha: entry.blobSha,
      size: 10,
      url: `https://api.github.com/repos/${source.repository}/git/blobs/${entry.blobSha}`,
    })),
  };
}

function blobRecord(repository, bytes) {
  const sha = gitBlobSha(bytes);
  return {
    sha,
    size: bytes.byteLength,
    encoding: "base64",
    content: `${bytes.toString("base64")}\n`,
    url: `https://api.github.com/repos/${repository}/git/blobs/${sha}`,
  };
}

export function applyDiagnosticFixtureRunUrls(run) {
  const api = `https://api.github.com/repos/${crawlPhaseDiagnosticHostedIdentity.repository}`;
  const web = `https://github.com/${crawlPhaseDiagnosticHostedIdentity.repository}`;
  run.url = `${api}/actions/runs/${run.id}`;
  run.html_url = `${web}/actions/runs/${run.id}`;
  run.jobs_url = `${api}/actions/runs/${run.id}/jobs`;
  run.artifacts_url = `${api}/actions/runs/${run.id}/artifacts`;
}

export function structuredCloneDiagnosticHostedFixture(value) {
  const clone = structuredClone(value);
  // Node preserves Uint8Array rather than Buffer through structuredClone.
  clone.diagnosticContractAssets.protocol = Buffer.from(value.diagnosticContractAssets.protocol);
  clone.diagnosticContractAssets.workflow = Buffer.from(value.diagnosticContractAssets.workflow);
  clone.diagnosticContractAssets.preflight.bytes = Buffer.from(
    value.diagnosticContractAssets.preflight.bytes,
  );
  clone.comparisonEvidenceAssets.artifactBinding = Buffer.from(
    value.comparisonEvidenceAssets.artifactBinding,
  );
  clone.comparisonEvidenceAssets.freshCrawlRaw = Buffer.from(
    value.comparisonEvidenceAssets.freshCrawlRaw,
  );
  clone.workflowSourceBytes = Buffer.from(value.workflowSourceBytes);
  return clone;
}

export function alignDiagnosticHostedReceiptToPreflight(receipt, preflight) {
  const aligned = structuredClone(receipt);
  const source = preflight.workflowSource;
  const workflowBytes = readFileSync(new URL(
    "../../protocol/stasis-v0.3.3-performance-crawl-phase-diagnostic-workflow.yml",
    import.meta.url,
  ));
  const preflightBytes = canonicalDiagnosticFixtureBytes(preflight);
  const preflightSha256 = diagnosticFixtureSha256(preflightBytes);
  aligned.producer.headBranch = source.branch;
  aligned.producer.headSha = source.commitSha;
  aligned.workflowSource.repository = source.repository;
  aligned.workflowSource.branch = source.branch;
  aligned.workflowSource.ref = source.ref;
  aligned.workflowSource.commitSha = source.commitSha;
  aligned.workflowSource.soleParentSha = source.parentCommitSha;
  aligned.workflowSource.treeSha = source.treeSha;
  aligned.workflowSource.changedFile = structuredClone(source.changedFiles[0]);
  aligned.workflowSource.workflow = {
    ...aligned.workflowSource.workflow,
    ...structuredClone(source.workflow),
    bytes: workflowBytes.byteLength,
    sha256: diagnosticFixtureSha256(workflowBytes),
  };
  aligned.workflowSource.preservedComparisonWorkflow = structuredClone(
    source.preservedComparisonWorkflow,
  );
  aligned.contract.preflightSha256 = preflightSha256;
  const retainedPreflight = aligned.contract.assets.find(
    ({ name }) => name === crawlPhaseDiagnosticContractIdentity.assets.preflight,
  );
  retainedPreflight.sizeInBytes = preflightBytes.byteLength;
  retainedPreflight.digest = `sha256:${preflightSha256}`;
  aligned.execution = structuredClone(preflight.execution);
  aligned.job.key = source.workflow.jobId;
  aligned.job.name = source.workflow.jobName;
  aligned.job.labels = [...preflight.execution.runnerLabels];
  aligned.publicationOutcomes = structuredClone(preflight.publicationOutcomes);
  aligned.claimBoundary = structuredClone(preflight.claimBoundary);
  return aligned;
}
