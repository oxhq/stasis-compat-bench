import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import {
  assertCrawlPhaseDiagnosticHostedProvenanceReceipt,
  assertCrawlPhaseDiagnosticJobStepTopology,
  assertCrawlPhaseDiagnosticPreflightHostedBinding,
  assertCrawlPhaseDiagnosticRetainedApiBinding,
  assertCrawlPhaseDiagnosticContractAssets,
  crawlPhaseDiagnosticArtifactEntries,
  crawlPhaseDiagnosticComparisonEvidenceIdentity,
  crawlPhaseDiagnosticContractIdentity,
  crawlPhaseDiagnosticExpectedArtifactNames,
  crawlPhaseDiagnosticHostedIdentity,
  crawlPhaseDiagnosticHostedProvenanceSchema,
  crawlPhaseDiagnosticJobStepIdentity,
  crawlPhaseDiagnosticPreflightSchema,
  crawlPhaseDiagnosticPublicationOutcomeAssetNames,
  verifyCrawlPhaseDiagnosticHostedProvenance,
} from "../src/performance/crawl-phase-diagnostic-hosted-provenance.mjs";
import {
  performanceReplicationHostedIdentity,
} from "../src/performance/replication-hosted-provenance.mjs";
import {
  performanceReplicationPublicationAssetNames,
} from "../src/performance/replication-publication.mjs";

import {
  applyDiagnosticFixtureRunUrls as applyRunUrls,
  canonicalDiagnosticFixtureBytes as canonical,
  createCrawlPhaseDiagnosticHostedFixture as fixture,
  diagnosticFixtureSha256 as sha256,
  structuredCloneDiagnosticHostedFixture as structuredCloneExceptBuffers,
} from "./fixtures/crawl-phase-diagnostic-hosted-fixture.mjs";

test("the real contract assets are canonical and bind the exact preregistered workflow blob", async () => {
  const assetUrl = (name) => new URL(`../protocol/${name}`, import.meta.url);
  const protocol = await readFile(assetUrl(crawlPhaseDiagnosticContractIdentity.assets.protocol));
  const workflow = await readFile(assetUrl(crawlPhaseDiagnosticContractIdentity.assets.workflow));
  const preflightBytes = await readFile(
    assetUrl(crawlPhaseDiagnosticContractIdentity.assets.preflight),
  );
  const preflight = JSON.parse(preflightBytes.toString("utf8"));
  const receipt = assertCrawlPhaseDiagnosticContractAssets({
    protocol,
    workflow,
    preflight: { value: preflight, bytes: preflightBytes },
  });
  assert.equal(
    preflight.workflowSource.commitSha,
    "6c142d18631b910ab9e7ce842b52ed817b46ecc5",
  );
  assert.equal(
    preflight.workflowSource.treeSha,
    "e5842f5effda8d09caf99f40900e7dacccaec610",
  );
  assert.equal(
    preflight.workflowSource.workflow.blobSha,
    "61675d581be0f8d40accadef531ff1a7c71deb76",
  );
  assert.equal(receipt.workflow.blobSha, preflight.workflowSource.workflow.blobSha);
  assert.equal(receipt.workflow.sha256, sha256(workflow));
  assert.equal(receipt.workflow.sha256,
    "1cc7eccd1363d9f4e91d2d7860480cc165a59e5d351fce60c28e1bb3130cc58f");
  assert.match(protocol.toString("utf8"), /Every other terminal conclusion remains\n  unpublishable\./u);
  const workflowText = workflow.toString("utf8");
  assert.equal(workflowText.includes("continue-on-error:"), false);
  const workflowStepNames = [...workflowText.matchAll(/^      - name: (.+)$/gmu)]
    .map((match) => match[1]);
  assert.deepEqual(workflowStepNames, [
    ...crawlPhaseDiagnosticJobStepIdentity.preparation.map(({ name }) => name),
    crawlPhaseDiagnosticJobStepIdentity.createOutcome.name,
    crawlPhaseDiagnosticJobStepIdentity.sealBundle.name,
    crawlPhaseDiagnosticJobStepIdentity.uploadBundle.name,
    crawlPhaseDiagnosticJobStepIdentity.propagate.name,
  ]);
  assert.throws(
    () => assertCrawlPhaseDiagnosticContractAssets({
      protocol,
      workflow: Buffer.concat([workflow, Buffer.from("# substituted\n", "utf8")]),
      preflight: { value: preflight, bytes: preflightBytes },
    }),
    /mirror Git blob differs/u,
  );
});

test("hosted provenance verifies immutable chronology, exact workflow bytes, and one valid first attempt", () => {
  const input = fixture();
  const first = verifyCrawlPhaseDiagnosticHostedProvenance(input);
  const second = verifyCrawlPhaseDiagnosticHostedProvenance(structuredCloneExceptBuffers(input));

  assert.deepEqual(first, second);
  assert.equal(first.schema, crawlPhaseDiagnosticHostedProvenanceSchema);
  assert.equal(first.outcomeClass, "VALID_NON_AUTHORITATIVE");
  assert.equal(first.artifactMode, "bundle_valid");
  assert.equal(first.producer.runAttempt, 1);
  assert.equal(first.job.labels[0], "ubuntu-22.04");
  assert.equal(first.oneShot.rerunCount, 0);
  assert.equal(first.workflowSource.workflow.sha256, sha256(input.workflowSourceBytes));
  assert.equal(first.verification.statisticsAndPoolingRejected, true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(/https?:\/\//u.test(JSON.stringify(first)), false);
  assert.equal(assertCrawlPhaseDiagnosticHostedProvenanceReceipt(first), first);
});

test("narrow job-step and preflight bridges bind the retained production topology", () => {
  const input = fixture();
  const hosted = verifyCrawlPhaseDiagnosticHostedProvenance(input);
  const rawJob = input.jobsListing.jobs[0];
  const workflowIdentity = {
    bytes: input.workflowSourceBytes.byteLength,
    sha256: sha256(input.workflowSourceBytes),
    blobSha: input.diagnosticContractAssets.preflight.value.workflowSource.workflow.blobSha,
  };
  const topology = assertCrawlPhaseDiagnosticJobStepTopology(rawJob, "bundle_valid");
  assert.equal(topology.artifactMode, "bundle_valid");
  assert.equal(topology.conclusion, "success");
  assert.equal(
    assertCrawlPhaseDiagnosticPreflightHostedBinding(
      input.diagnosticContractAssets.preflight.value,
      hosted,
      { workflow: workflowIdentity },
    ),
    hosted,
  );

  assert.throws(
    () => assertCrawlPhaseDiagnosticJobStepTopology(rawJob, "bundle_status"),
    /differs from artifact mode/u,
  );
  for (const changedWorkflowIdentity of [
    { ...workflowIdentity, bytes: workflowIdentity.bytes + 1 },
    { ...workflowIdentity, sha256: "0".repeat(64) },
  ]) {
    assert.throws(
      () => assertCrawlPhaseDiagnosticPreflightHostedBinding(
        input.diagnosticContractAssets.preflight.value,
        hosted,
        { workflow: changedWorkflowIdentity },
      ),
      /workflow asset differs/u,
    );
  }
  const conflicting = fixture({
    conclusion: "failure",
    artifactCount: 0,
    stepMode: "no_artifact_upload",
  }).jobsListing.jobs[0];
  assert.throws(
    () => assertCrawlPhaseDiagnosticJobStepTopology(conflicting, "bundle_status"),
    /differs from artifact mode/u,
  );

  const driftedHosted = structuredClone(hosted);
  driftedHosted.workflowSource.treeSha = "4".repeat(40);
  assert.equal(assertCrawlPhaseDiagnosticHostedProvenanceReceipt(driftedHosted), driftedHosted);
  assert.throws(
    () => assertCrawlPhaseDiagnosticPreflightHostedBinding(
      input.diagnosticContractAssets.preflight.value,
      driftedHosted,
      { workflow: workflowIdentity },
    ),
    /workflow source differs/u,
  );

  const driftedPreflightDigest = structuredClone(hosted);
  driftedPreflightDigest.contract.preflightSha256 = "5".repeat(64);
  assert.equal(
    assertCrawlPhaseDiagnosticHostedProvenanceReceipt(driftedPreflightDigest),
    driftedPreflightDigest,
  );
  assert.throws(
    () => assertCrawlPhaseDiagnosticPreflightHostedBinding(
      input.diagnosticContractAssets.preflight.value,
      driftedPreflightDigest,
      { workflow: workflowIdentity },
    ),
    /contract identity differs/u,
  );
});

test("hosted provenance closes over outcome-bundle and no-artifact terminal outcomes", () => {
  const statusOnly = verifyCrawlPhaseDiagnosticHostedProvenance(fixture({ conclusion: "failure" }));
  assert.equal(statusOnly.outcomeClass, "DIAGNOSTIC_INVALID_WITH_STATUS");
  assert.equal(statusOnly.artifactMode, "bundle_status");

  const noArtifact = verifyCrawlPhaseDiagnosticHostedProvenance(
    fixture({ conclusion: "failure", artifactCount: 0, stepMode: "no_artifact" }),
  );
  assert.equal(noArtifact.outcomeClass, "INFRASTRUCTURE_INVALID_NO_ARTIFACT");
  assert.equal(noArtifact.artifactMode, "no_artifact");

  for (const stepMode of [
    "no_artifact_create", "no_artifact_seal", "no_artifact_upload",
  ]) {
    const receipt = verifyCrawlPhaseDiagnosticHostedProvenance(
      fixture({ conclusion: "failure", artifactCount: 0, stepMode }),
    );
    assert.equal(receipt.artifactMode, "no_artifact");
  }

  assert.throws(
    () => verifyCrawlPhaseDiagnosticHostedProvenance(
      fixture({ conclusion: "success", artifactCount: 0 }),
    ),
    /count differs from terminal step mode/u,
  );
  assert.throws(
    () => verifyCrawlPhaseDiagnosticHostedProvenance(
      fixture({ conclusion: "failure", artifactCount: 2 }),
    ),
    /incomplete or out of bounds/u,
  );
});

test("hosted provenance binds exact step topology and rejects ambiguous upload states", async (context) => {
  const cases = [
    ["missing step", (input) => { input.jobsListing.jobs[0].steps.splice(4, 1); },
      /step identity changed/u],
    ["reordered steps", (input) => {
      const steps = input.jobsListing.jobs[0].steps;
      [steps[3], steps[4]] = [steps[4], steps[3]];
    }, /step identity changed/u],
    ["upload conclusion changed", (input) => {
      const step = input.jobsListing.jobs[0].steps.find(
        ({ name }) => name === crawlPhaseDiagnosticJobStepIdentity.uploadBundle.name,
      );
      step.conclusion = "failure";
    }, /step conclusions do not match/u],
    ["propagation conclusion changed", (input) => {
      const step = input.jobsListing.jobs[0].steps.find(
        ({ name }) => name === crawlPhaseDiagnosticJobStepIdentity.propagate.name,
      );
      step.conclusion = "success";
    }, /step conclusions do not match/u],
  ];
  for (const [name, mutate, pattern] of cases) {
    await context.test(name, () => {
      const input = fixture();
      mutate(input);
      assert.throws(() => verifyCrawlPhaseDiagnosticHostedProvenance(input), pattern);
    });
  }

  await context.test("retained artifact after upload failure", () => {
    const input = fixture({ conclusion: "failure", artifactCount: 1, stepMode: "no_artifact" });
    assert.throws(
      () => verifyCrawlPhaseDiagnosticHostedProvenance(input),
      /retained after an outcome, seal, or upload failure is ambiguous/u,
    );
  });

  for (const conclusion of [
    "action_required", "cancelled", "neutral", "skipped", "stale",
    "startup_failure", "timed_out",
  ]) {
    await context.test(`${conclusion} run is unpublishable`, () => {
      const input = fixture({ conclusion, artifactCount: 0, stepMode: "no_artifact" });
      assert.throws(
        () => verifyCrawlPhaseDiagnosticHostedProvenance(input),
        /run conclusion is not a publishable terminal conclusion/u,
      );
    });
  }
});

test("retained API binding structurally revalidates the exact raw snapshots", async (context) => {
  const input = fixture();
  const receipt = verifyCrawlPhaseDiagnosticHostedProvenance(input);
  const retained = {
    receipt,
    runRecord: input.runRecord,
    workflowRunsListing: input.workflowRunsListing,
    jobsListing: input.jobsListing,
    artifactsListing: input.artifactsListing,
    workflowSourceCommitRecord: input.workflowSourceCommitRecord,
    diagnosticContractReleaseRecord: input.diagnosticContractReleaseRecord,
    diagnosticContractCommitRecord: input.diagnosticContractCommitRecord,
    comparisonEvidenceReleaseRecord: input.comparisonEvidenceReleaseRecord,
    comparisonEvidenceCommitRecord: input.comparisonEvidenceCommitRecord,
  };
  assert.equal(assertCrawlPhaseDiagnosticRetainedApiBinding(retained), receipt);

  const cases = [
    ["second different-SHA run", (value) => {
      const second = structuredClone(value.workflowRunsListing.workflow_runs[0]);
      second.id += 9;
      second.head_sha = "4".repeat(40);
      applyRunUrls(second);
      value.workflowRunsListing.workflow_runs.push(second);
      value.workflowRunsListing.total_count = 2;
    }],
    ["wrong job", (value) => { value.jobsListing.jobs[0].name = "wrong job"; }],
    ["wrong artifact name", (value) => { value.artifactsListing.artifacts[0].name = "wrong"; }],
    ["wrong artifact digest", (value) => {
      value.artifactsListing.artifacts[0].digest = `sha256:${"0".repeat(64)}`;
    }],
  ];
  for (const [name, mutate] of cases) {
    await context.test(name, () => {
      const changed = structuredClone(retained);
      mutate(changed);
      assert.throws(() => assertCrawlPhaseDiagnosticRetainedApiBinding(changed));
    });
  }
});

test("hosted provenance rejects reruns, reused comparison identities, and non-native jobs", async (context) => {
  const cases = [
    ["rerun", (input) => {
      const rerun = structuredClone(input.runRecord);
      rerun.id += 1;
      rerun.run_attempt = 2;
      applyRunUrls(rerun);
      input.workflowRunsListing.workflow_runs.push(rerun);
      input.workflowRunsListing.total_count += 1;
    }, /one total invocation and no rerun/u],
    ["second push at another SHA", (input) => {
      const second = structuredClone(input.runRecord);
      second.id += 2;
      second.head_sha = "4".repeat(40);
      applyRunUrls(second);
      input.workflowRunsListing.workflow_runs.push(second);
      input.workflowRunsListing.total_count += 1;
    }, /exactly one total invocation/u],
    ["incomplete listing", (input) => { input.workflowRunsListing.total_count += 1; }, /fully paginated/u],
    ["comparison run", (input) => {
      input.runRecord.id = crawlPhaseDiagnosticHostedIdentity.comparison.runId;
    }, /reuses comparison run/u],
    ["comparison job", (input) => {
      input.jobsListing.jobs[0].id = crawlPhaseDiagnosticHostedIdentity.comparison.crawlJobId;
    }, /reuses comparison crawl job/u],
    ["wrong label", (input) => { input.jobsListing.jobs[0].labels = ["ubuntu-latest"]; },
      /Ubuntu 22\.04/u],
    ["second job", (input) => {
      input.jobsListing.jobs.push(structuredClone(input.jobsListing.jobs[0]));
      input.jobsListing.total_count = 2;
    }, /exactly one hosted job/u],
  ];
  for (const [name, mutate, pattern] of cases) {
    await context.test(name, () => {
      const input = fixture();
      mutate(input);
      assert.throws(() => verifyCrawlPhaseDiagnosticHostedProvenance(input), pattern);
    });
  }
});

test("hosted provenance rejects contract, comparison, source, and chronology drift", async (context) => {
  const cases = [
    ["mutable contract", (input) => { input.diagnosticContractReleaseRecord.immutable = false; },
      /release identity/u],
    ["late contract", (input) => {
      input.diagnosticContractReleaseRecord.published_at = input.runRecord.created_at;
    }, /not chronological/u],
    ["contract parent", (input) => {
      const parent = "1".repeat(40);
      input.diagnosticContractCommitRecord.parents[0] = {
        sha: parent,
        url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${parent}`,
        html_url: `https://github.com/oxhq/stasis-compat-bench/commit/${parent}`,
      };
    }, /sole comparison-evidence parent/u],
    ["annotated tag", (input) => {
      input.diagnosticContractTagRefRecord.object.type = "tag";
    }, /lightweight commit tag/u],
    ["comparison asset byte", (input) => {
      input.comparisonEvidenceAssets.freshCrawlRaw = Buffer.from("{}\n");
    }, /exact bytes changed/u],
    ["workflow mirror", (input) => {
      input.diagnosticContractAssets.workflow = Buffer.from("different\n");
      const asset = input.diagnosticContractReleaseRecord.assets.find(
        ({ name }) => name === crawlPhaseDiagnosticContractIdentity.assets.workflow,
      );
      asset.size = input.diagnosticContractAssets.workflow.byteLength;
      asset.digest = `sha256:${sha256(input.diagnosticContractAssets.workflow)}`;
    }, /asset commit blob changed|source bytes differ/u],
    ["contract asset missing from H2", (input) => {
      input.diagnosticContractCommitRecord.files.splice(0, 1);
    }, /not all exact added blobs/u],
    ["contract asset substituted in H2", (input) => {
      input.diagnosticContractCommitRecord.files[0].sha = "3".repeat(40);
    }, /asset commit blob changed/u],
    ["contract asset duplicate path", (input) => {
      input.diagnosticContractCommitRecord.files.push(
        structuredClone(input.diagnosticContractCommitRecord.files[0]),
      );
    }, /paths are invalid or duplicated/u],
    ["source parent", (input) => {
      input.workflowSourceCommitRecord.parents[0].sha = "1".repeat(40);
    }, /source commit parent/u],
    ["preserved workflow", (input) => {
      input.workflowSourceTreeRecord.tree[1].sha = "2".repeat(40);
    }, /tree entry changed/u],
    ["truncated tree", (input) => { input.workflowSourceTreeRecord.truncated = true; },
      /recursive tree is incomplete/u],
  ];
  for (const [name, mutate, pattern] of cases) {
    await context.test(name, () => {
      const input = fixture();
      mutate(input);
      assert.throws(() => verifyCrawlPhaseDiagnosticHostedProvenance(input), pattern);
    });
  }
});

test("preflight rejects retries, sleeps, fallbacks, discards, statistics, pooling, and authority", async (context) => {
  const cases = [
    ["retries", (p) => { p.execution.retries = true; }],
    ["sleeps", (p) => { p.execution.sleeps = true; }],
    ["fallbacks", (p) => { p.execution.fallbacks = true; }],
    ["discards", (p) => { p.execution.discardedObservations = true; }],
    ["statistics", (p) => { p.execution.statistics = true; }],
    ["pooling", (p) => { p.execution.pooling = "across_hosts"; }],
    ["optimization authority", (p) => { p.claimBoundary.optimizationEligible = true; }],
    ["implementation authority", (p) => { p.claimBoundary.implementationWorkAuthorized = true; }],
    ["publication inventory", (p) => { p.publicationOutcomes.VALID_NON_AUTHORITATIVE.pop(); }],
  ];
  for (const [name, mutate] of cases) {
    await context.test(name, () => {
      const input = fixture();
      mutate(input.diagnosticContractAssets.preflight.value);
      input.diagnosticContractAssets.preflight.bytes = canonical(
        input.diagnosticContractAssets.preflight.value,
      );
      const asset = input.diagnosticContractReleaseRecord.assets.find(
        ({ name: assetName }) => assetName === crawlPhaseDiagnosticContractIdentity.assets.preflight,
      );
      asset.size = input.diagnosticContractAssets.preflight.bytes.byteLength;
      asset.digest = `sha256:${sha256(input.diagnosticContractAssets.preflight.bytes)}`;
      assert.throws(
        () => verifyCrawlPhaseDiagnosticHostedProvenance(input),
        /preflight|claim boundary/u,
      );
    });
  }
});

test("strict hosted receipt assertion rejects authorization, identity drift, and URL retention", async (context) => {
  const receipt = verifyCrawlPhaseDiagnosticHostedProvenance(fixture());
  const cases = [
    ["run", (value) => { value.producer.runId = crawlPhaseDiagnosticHostedIdentity.comparison.runId; }],
    ["job", (value) => { value.job.id = crawlPhaseDiagnosticHostedIdentity.comparison.crawlJobId; }],
    ["rerun", (value) => { value.oneShot.rerunCount = 1; }],
    ["claim", (value) => { value.claimBoundary.timingEligible = true; }],
    ["verification", (value) => { value.verification.retriesRejected = false; }],
    ["URL", (value) => { value.workflowSource.source = "https://example.test"; }],
  ];
  for (const [name, mutate] of cases) {
    await context.test(name, () => {
      const changed = structuredClone(receipt);
      mutate(changed);
      assert.throws(() => assertCrawlPhaseDiagnosticHostedProvenanceReceipt(changed));
    });
  }
});
