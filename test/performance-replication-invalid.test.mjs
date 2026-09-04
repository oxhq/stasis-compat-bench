import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPerformanceReplicationInvalidManifest,
  performanceReplicationInvalidReasonCodes,
  performanceReplicationInvalidSchema,
  performanceReplicationInvalidStages,
  verifyPerformanceReplicationInvalidManifest,
} from "../src/performance/replication-invalid.mjs";
import {
  performanceReplicationExpectedArtifactNames,
  performanceReplicationHostedIdentity,
} from "../src/performance/replication-hosted-provenance.mjs";

const runId = 33860000001;
const repositoryId = 1342978708;

test("builder emits one deterministic frozen and privacy-safe REPLICATION_INVALID manifest", () => {
  assert.deepEqual(performanceReplicationInvalidStages, [
    "hosted_run_terminal_non_success",
    "hosted_provenance_invalid",
    "semantic_authority_invalid",
    "artifact_binding_invalid",
    "publication_invalid",
  ]);
  assert.deepEqual(performanceReplicationInvalidReasonCodes, {
    hosted_run_terminal_non_success: "HOSTED_RUN_TERMINAL_NON_SUCCESS",
    hosted_provenance_invalid: "HOSTED_PROVENANCE_INVALID",
    semantic_authority_invalid: "SEMANTIC_AUTHORITY_INVALID",
    artifact_binding_invalid: "ARTIFACT_BINDING_INVALID",
    publication_invalid: "PUBLICATION_INVALID",
  });
  assert.equal(Object.isFrozen(performanceReplicationInvalidReasonCodes), true);
  assert.equal(Object.isFrozen(performanceReplicationInvalidStages), true);

  const runRecord = validRun("failure");
  const selectedNames = [
    performanceReplicationExpectedArtifactNames[4],
    performanceReplicationExpectedArtifactNames[0],
    performanceReplicationExpectedArtifactNames[2],
  ];
  const retainedArtifacts = artifactsListing(selectedNames, runRecord);
  const input = invalidInput(
    "hosted_run_terminal_non_success",
    runRecord,
    retainedArtifacts,
  );

  const first = buildPerformanceReplicationInvalidManifest(input);
  const reordered = invalidInput(
    "hosted_run_terminal_non_success",
    structuredClone(runRecord),
    {
      total_count: retainedArtifacts.total_count,
      artifacts: structuredClone(retainedArtifacts.artifacts).reverse(),
    },
  );
  const second = buildPerformanceReplicationInvalidManifest(reordered);

  assert.deepEqual(first, second);
  assert.equal(first.schema, performanceReplicationInvalidSchema);
  assert.equal(first.outcome, "REPLICATION_INVALID");
  assert.deepEqual(first.failure, {
    stage: "hosted_run_terminal_non_success",
    reasonCode: "HOSTED_RUN_TERMINAL_NON_SUCCESS",
  });
  assert.equal(first.producer.headSha, performanceReplicationHostedIdentity.headSha);
  assert.equal(first.producer.conclusion, "failure");
  assert.deepEqual(
    first.artifacts.map(({ name }) => name),
    [...selectedNames].sort(),
  );
  for (const artifact of first.artifacts) {
    assert.deepEqual(
      Object.keys(artifact),
      ["name", "id", "size", "digest", "expired"],
    );
  }
  assert.equal(first.decisionState, "STAY_0_4_UNASSIGNED");
  assert.equal(first.generalizedSpeedClaimAuthorized, false);
  assert.equal(first.implementationWorkAuthorized, false);
  assert.equal(first.retryAuthorized, false);
  assert.equal(first.replacementRunAuthorized, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.failure), true);
  assert.equal(Object.isFrozen(first.artifacts[0]), true);
  assert.equal(verifyPerformanceReplicationInvalidManifest(first), first);
});

test("terminal non-success is allowed only at the hosted-run stage and success only later", () => {
  const firstStage = "hosted_run_terminal_non_success";
  for (const conclusion of [
    "action_required", "cancelled", "failure", "neutral", "skipped", "stale",
    "startup_failure", "timed_out",
  ]) {
    const failedRun = validRun(conclusion);
    assert.doesNotThrow(() => buildPerformanceReplicationInvalidManifest(
      invalidInput(firstStage, failedRun, artifactsListing([], failedRun)),
    ));
  }
  assert.throws(
    () => buildPerformanceReplicationInvalidManifest(
      invalidInput(firstStage, validRun("success"), artifactsListing([], validRun("success"))),
    ),
    /requires a terminal non-success conclusion/u,
  );
  for (const conclusion of [null, "arbitrary_terminal_value"]) {
    const invalidRun = validRun(conclusion);
    assert.throws(
      () => buildPerformanceReplicationInvalidManifest(
        invalidInput(firstStage, invalidRun, artifactsListing([], invalidRun)),
      ),
      /requires a terminal non-success conclusion/u,
    );
  }

  for (const stage of performanceReplicationInvalidStages.slice(1)) {
    const successRun = validRun("success");
    assert.doesNotThrow(() => buildPerformanceReplicationInvalidManifest(
      invalidInput(stage, successRun, artifactsListing([], successRun)),
    ));
    const failedRun = validRun("failure");
    assert.throws(
      () => buildPerformanceReplicationInvalidManifest(
        invalidInput(stage, failedRun, artifactsListing([], failedRun)),
      ),
      /requires a successful hosted run/u,
    );
  }

  const nonterminal = validRun("failure");
  nonterminal.status = "in_progress";
  assert.throws(
    () => buildPerformanceReplicationInvalidManifest(
      invalidInput(firstStage, nonterminal, artifactsListing([], nonterminal)),
    ),
    /terminal status mismatch/u,
  );

  const reusedOriginal = validRun("failure");
  reusedOriginal.id = 33851425108;
  assert.throws(
    () => buildPerformanceReplicationInvalidManifest(
      invalidInput(firstStage, reusedOriginal, artifactsListing([], reusedOriginal)),
    ),
    /reuses the original run ID/u,
  );
});

test("artifact projection accepts zero, partial, or all seven exact retained names", () => {
  const runRecord = validRun("failure");
  for (const count of [0, 1, 4, performanceReplicationExpectedArtifactNames.length]) {
    const names = performanceReplicationExpectedArtifactNames.slice(0, count).reverse();
    const listing = artifactsListing(names, runRecord);
    if (listing.artifacts[0] !== undefined) listing.artifacts[0].expired = true;
    const manifest = buildPerformanceReplicationInvalidManifest(
      invalidInput("hosted_run_terminal_non_success", runRecord, listing),
    );
    assert.equal(manifest.artifacts.length, count);
    assert.deepEqual(manifest.artifacts.map(({ name }) => name), [...names].sort());
    if (manifest.artifacts.length > 0) {
      assert.equal(manifest.artifacts.some(({ expired }) => expired), true);
    }
  }
});

test("artifact projection rejects unknown, duplicate, and misbound API artifacts", async (t) => {
  const cases = [
    ["unknown name", (listing) => {
      listing.artifacts[0].name = "unknown-attempt-1";
    }, /unknown or duplicated/u],
    ["duplicate name", (listing) => {
      const duplicate = structuredClone(listing.artifacts[0]);
      duplicate.id += 100;
      applyArtifactUrls(duplicate);
      listing.artifacts.push(duplicate);
      listing.total_count += 1;
    }, /unknown or duplicated/u],
    ["duplicate ID", (listing) => {
      listing.artifacts[1].id = listing.artifacts[0].id;
    }, /ID is duplicated/u],
    ["wrong run", (listing) => {
      listing.artifacts[0].workflow_run.id += 1;
    }, /run ID binding mismatch/u],
    ["wrong SHA", (listing) => {
      listing.artifacts[0].workflow_run.head_sha = "a".repeat(40);
    }, /head SHA binding mismatch/u],
    ["wrong repository", (listing) => {
      listing.artifacts[0].workflow_run.repository_id += 1;
    }, /repository ID binding mismatch/u],
    ["wrong repository URL", (listing) => {
      listing.artifacts[0].url = listing.artifacts[0].url.replace("/oxhq/stasis/", "/other/stasis/");
    }, /repository binding mismatch/u],
    ["incomplete listing", (listing) => {
      listing.total_count += 1;
    }, /incomplete or out of bounds/u],
  ];

  for (const [label, mutate, pattern] of cases) {
    await t.test(label, () => {
      const runRecord = validRun("failure");
      const listing = artifactsListing(
        performanceReplicationExpectedArtifactNames.slice(0, 2),
        runRecord,
      );
      mutate(listing);
      assert.throws(
        () => buildPerformanceReplicationInvalidManifest(
          invalidInput("hosted_run_terminal_non_success", runRecord, listing),
        ),
        pattern,
      );
    });
  }
});

test("verifier rejects reason drift, authorization, and forbidden fields at any depth", async (t) => {
  const runRecord = validRun("failure");
  const manifest = buildPerformanceReplicationInvalidManifest(
    invalidInput(
      "hosted_run_terminal_non_success",
      runRecord,
      artifactsListing([performanceReplicationExpectedArtifactNames[0]], runRecord),
    ),
  );
  assertNoForbiddenManifestContent(manifest);

  const cases = [
    ["unknown stage", (value) => {
      value.failure.stage = "unknown_stage";
    }, /closed vocabulary/u],
    ["reason mismatch", (value) => {
      value.failure.reasonCode = "SEMANTIC_AUTHORITY_INVALID";
    }, /reasonCode does not match/u],
    ["statistics", (value) => {
      value.failure.statistics = { median: "1.0", ratio: "2.0" };
    }, /forbidden field/u],
    ["raw error", (value) => {
      value.failure.rawErrorMessage = "secret diagnostics";
    }, /forbidden field/u],
    ["URL", (value) => {
      value.producer.source = "https://github.com/oxhq/stasis";
    }, /must not retain URLs/u],
    ["actor", (value) => {
      value.producer.triggeringActor = "someone";
    }, /forbidden field/u],
    ["retry authorization", (value) => {
      value.retryAuthorized = true;
    }, /fail-closed boundary/u],
    ["replacement authorization", (value) => {
      value.replacementRunAuthorized = true;
    }, /fail-closed boundary/u],
    ["claim authorization", (value) => {
      value.generalizedSpeedClaimAuthorized = true;
    }, /fail-closed boundary/u],
  ];

  for (const [label, mutate, pattern] of cases) {
    await t.test(label, () => {
      const value = structuredClone(manifest);
      mutate(value);
      assert.throws(() => verifyPerformanceReplicationInvalidManifest(value), pattern);
    });
  }
});

function invalidInput(stage, runRecord, artifacts) {
  return {
    stage,
    reasonCode: performanceReplicationInvalidReasonCodes[stage],
    runRecord,
    artifactsListing: artifacts,
  };
}

function validRun(conclusion) {
  const expected = performanceReplicationHostedIdentity;
  const api = `https://api.github.com/repos/${expected.repository}`;
  const web = `https://github.com/${expected.repository}`;
  return {
    id: runId,
    run_attempt: expected.runAttempt,
    event: expected.event,
    status: "completed",
    conclusion,
    head_branch: expected.headBranch,
    head_sha: expected.headSha,
    path: expected.workflow.path,
    workflow_id: expected.workflow.id,
    name: expected.workflow.name,
    repository: {
      id: repositoryId,
      full_name: expected.repository,
      url: api,
    },
    head_repository: {
      id: repositoryId,
      full_name: expected.repository,
      url: api,
    },
    url: `${api}/actions/runs/${runId}`,
    html_url: `${web}/actions/runs/${runId}`,
    jobs_url: `${api}/actions/runs/${runId}/jobs`,
    artifacts_url: `${api}/actions/runs/${runId}/artifacts`,
  };
}

function artifactsListing(names, runRecord) {
  const artifacts = names.map((name, index) => artifact(name, index, runRecord));
  return { total_count: artifacts.length, artifacts };
}

function artifact(name, index, runRecord) {
  const id = 300000000 + index;
  const value = {
    name,
    id,
    size_in_bytes: index,
    digest: `sha256:${String(index + 1).padStart(64, "0")}`,
    expired: false,
    workflow_run: {
      id: runRecord.id,
      head_branch: runRecord.head_branch,
      head_sha: runRecord.head_sha,
      repository_id: runRecord.repository.id,
      head_repository_id: runRecord.head_repository.id,
    },
  };
  applyArtifactUrls(value);
  return value;
}

function applyArtifactUrls(value) {
  const repository = performanceReplicationHostedIdentity.repository;
  value.url = `https://api.github.com/repos/${repository}/actions/artifacts/${value.id}`;
  value.archive_download_url = `${value.url}/zip`;
}

function assertNoForbiddenManifestContent(value) {
  const forbidden = [
    "median", "ratio", "statistic", "ranking", "error", "message",
    "stderr", "stdout", "url", "actor", "raw",
  ];
  const visit = (current) => {
    if (typeof current === "string") {
      assert.equal(/https?:\/\//iu.test(current), false);
      return;
    }
    if (current === null || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      const normalized = key.toLowerCase();
      assert.equal(
        forbidden.some((token) => normalized.includes(token)),
        false,
        `forbidden manifest field: ${key}`,
      );
      visit(child);
    }
  };
  visit(value);
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("protocol_valid"), false);
  assert.equal(serialized.includes("PROTOCOL_REPLICATION_VALID_"), false);
  assert.equal(/successful.?replication/iu.test(serialized), false);
}
