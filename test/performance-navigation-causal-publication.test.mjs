import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import AdmZip from "adm-zip";

import {
  canonicalNavigationCausalJsonBytes,
} from "../src/performance/navigation-causal-artifact-binding.mjs";
import {
  navigationCausalContractAssetIdentities,
  navigationCausalContractIdentity,
} from "../src/performance/navigation-causal-contract.mjs";
import { createNavigationCausalHostOutcome } from "../src/performance/navigation-causal.mjs";
import {
  navigationCausalV4EvidenceAssets,
  verifyNavigationCausalAnonymousContractPreflight,
} from "../src/performance/navigation-causal-public-release.mjs";
import {
  buildNavigationCausalPublication,
  navigationCausalPublicationAssetNames,
  navigationCausalPublicationSchema,
  verifyNavigationCausalPublication,
} from "../src/performance/navigation-causal-publication.mjs";
import {
  navigationCausalAnonymousEvidenceVerificationSchema,
  navigationCausalAnonymousPreflightReleaseVerificationSchema,
  verifyAnonymousNavigationCausalContractPreflight,
  verifyAnonymousNavigationCausalPreflightRelease,
  verifyAnonymousNavigationCausalPublicRelease,
  verifyNavigationCausalAnonymousEvidenceRelease,
} from "../src/performance/navigation-causal-public-verification.mjs";
import {
  navigationCausalHarnessIdentity,
  navigationCausalWorkflowSourceIdentity,
} from "../src/performance/navigation-causal-replication.mjs";
import { navigationCausalHostFixtureRaw } from "./fixtures/navigation-causal-host-fixture.mjs";
import { navigationCausalHostedFixtureInput } from "./fixtures/navigation-causal-hosted-fixture.mjs";

test("publication retains exact hosted inputs, host files, receipts, privacy scan, and checksums", async () => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  assert.equal(built.schema, navigationCausalPublicationSchema);
  assert.equal(built.status, "built");
  assert.equal(built.outcome, "VALID_REPLICATED_EFFECT");
  assert.deepEqual(Object.keys(built.assets), navigationCausalPublicationAssetNames);
  const verified = verifyNavigationCausalPublication({
    assets: built.assets,
    v4TagRefRecord: fixture.v4TagRefRecord,
  });
  assert.equal(verified.status, "verified");
  assert.equal(verified.assetCount, 21);
  assert.equal(verified.validMeasurement, true);
  const scan = JSON.parse(built.assets["privacy-scan.json"]);
  assert.equal(scan.scope.controlledDocumentHtmlOmissionCount, 44);
  assert.equal(scan.scope.uniqueControlledDocumentHtmlCount, 1);
  assert.equal(scan.verification.credentialsRetained, false);
  const sums = built.assets["SHA256SUMS.txt"].toString("utf8").trim().split("\n");
  assert.equal(sums.length, 20);
});

test("a valid threshold miss remains publishable without a replicated-effect claim", async () => {
  const fixture = await publicationFixture({ hostBOpenDeltaNs: 0n });
  const built = buildNavigationCausalPublication(fixture);
  assert.equal(built.outcome, "VALID_NO_REPLICATED_EFFECT");
  assert.equal(built.evidencePublicationAuthorized, true);
  assert.equal(built.validMeasurement, true);
});

test("typed invalid host evidence is retained and publishable only as invalid evidence", async () => {
  const fixture = await publicationFixture({ hostAWrongFinalOrdinal: 3 });
  const built = buildNavigationCausalPublication(fixture);
  assert.equal(built.outcome, "INVALID_HOST_MEASUREMENT");
  assert.equal(built.evidencePublicationAuthorized, true);
  assert.equal(built.validMeasurement, false);
  const replication = JSON.parse(built.assets["navigation-causal-replication.json"]);
  assert.deepEqual(replication.invalidHostStatuses, [{
    hostLane: "host-a",
    status: "INVALID_CORRECTNESS",
    rawAuthorityCode: "CORRECTNESS_INVALID",
  }]);
  assert.equal(replication.claimBoundary.matchedNavigationCausalEffectAuthorized, false);
  const scan = JSON.parse(built.assets["privacy-scan.json"]);
  assert.equal(scan.scope.controlledDocumentHtmlOmissionCount, 25);
  assert.deepEqual(scan.scope.controlledDocumentHtmlByHost.map((entry) => [
    entry.hostLane,
    entry.omissionCount,
    entry.identities.length,
  ]), [["host-a", 3, 1], ["host-b", 22, 1]]);
});

test("documentHtml outside the two validated raw observation paths is never projected away", async () => {
  const fixture = await publicationFixture();
  const run = JSON.parse(fixture.inputs["workflow-run.json"]);
  run.documentHtml = "authorization: Bearer must-not-be-hidden";
  fixture.inputs["workflow-run.json"] = Buffer.from(`${JSON.stringify(run)}\n`, "utf8");
  assert.throws(
    () => buildNavigationCausalPublication(fixture),
    /unvalidated documentHtml/u,
  );
});

test("credential-like text inside an otherwise valid equal DOM is never hidden by projection", async () => {
  const fixture = await publicationFixture({
    documentHtml:
      '<head><meta charset="utf-8"><title>navigation-final</title></head>' +
      '<body><main><p id="status" data-state="complete">complete</p>' +
      '<a href="/leaf/navigation">navigation leaf</a>' +
      '<p>authorization: Bearer TOPSECRET123</p></main></body>',
  });
  assert.throws(() => buildNavigationCausalPublication(fixture), /credential-like text/u);
});

test("only the exact fixture path token is exempt in controlled DOM text and attributes", async (t) => {
  for (const [name, documentHtml] of [
    [
      "text",
      '<html><body>/nonstandard/private/location.txt</body></html>',
    ],
    [
      "attribute",
      '<html><body><a data-source="/nonstandard/private/location.txt">leaf</a></body></html>',
    ],
    [
      "text prefix collision",
      '<html><body>/nonstandard/leaf/navigation</body></html>',
    ],
    [
      "text suffix collision",
      '<html><body>/leaf/navigation-private-location.txt</body></html>',
    ],
    [
      "attribute prefix collision",
      '<html><body><a data-source="/nonstandard/leaf/navigation">leaf</a></body></html>',
    ],
    [
      "attribute suffix collision",
      '<html><body><a data-source="/leaf/navigation-private-location.txt">leaf</a></body></html>',
    ],
    [
      "query collision",
      '<html><body><a data-source="/leaf/navigation?source=private">leaf</a></body></html>',
    ],
    [
      "fragment collision",
      '<html><body><a data-source="/leaf/navigation#private">leaf</a></body></html>',
    ],
    [
      "slash collision",
      '<html><body><a data-source="/leaf/navigation/private">leaf</a></body></html>',
    ],
    [
      "backslash collision",
      '<html><body><a data-source="/leaf/navigation\\private">leaf</a></body></html>',
    ],
  ]) {
    await t.test(name, async () => {
      const fixture = await publicationFixture({ documentHtml });
      assert.throws(() => buildNavigationCausalPublication(fixture), /local path/u);
    });
  }
});

test("any changed payload, checksum, inventory, or V4 tag fails replay", async (t) => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const cases = [
    ["payload", (assets) => { assets["navigation-causal-replication.json"][20] ^= 1; }],
    ["checksum", (assets) => { assets["SHA256SUMS.txt"][0] ^= 1; }],
    ["extra", (assets) => { assets["extra.txt"] = Buffer.from("extra"); }],
  ];
  for (const [label, mutate] of cases) await t.test(label, () => {
    const assets = cloneAssets(built.assets);
    mutate(assets);
    assert.throws(() => verifyNavigationCausalPublication({
      assets,
      v4TagRefRecord: fixture.v4TagRefRecord,
    }));
  });
  const wrongTag = structuredClone(fixture.v4TagRefRecord);
  wrongTag.object.sha = "a".repeat(40);
  assert.throws(() => verifyNavigationCausalPublication({ assets: built.assets, v4TagRefRecord: wrongTag }));
});

test("anonymous evidence release replay binds direct tags, bytes, and post-run chronology", async () => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const publicInput = publicReleaseFixture(built.assets, fixture.v4TagRefRecord);
  const receipt = verifyNavigationCausalAnonymousEvidenceRelease(publicInput);
  assert.equal(receipt.schema, navigationCausalAnonymousEvidenceVerificationSchema);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.outcome, "VALID_REPLICATED_EFFECT");
  assert.equal(receipt.release.assetCount, navigationCausalPublicationAssetNames.length);
  assert.equal(receipt.claimBoundary.matchedNavigationCausalEffectAuthorized, true);
});

test("anonymous evidence release rejects mutable, indirect, late, reused-ID, and changed-byte surfaces", async (t) => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const cases = [
    ["mutable", (value) => { value.releaseRecord.immutable = false; }],
    ["annotated tag", (value) => { value.evidenceTagRefRecord.object.type = "tag"; }],
    ["created before terminal", (value) => { value.releaseRecord.created_at = "2026-09-04T19:04:59Z"; }],
    ["not after terminal", (value) => { value.releaseRecord.published_at = "2026-09-04T19:05:00Z"; }],
    ["reused asset ID", (value) => { value.releaseRecord.assets[1].id = value.releaseRecord.assets[0].id; }],
    ["changed downloaded byte", (value) => { value.assets["privacy-scan.json"][10] ^= 1; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const value = publicReleaseFixture(cloneAssets(built.assets), fixture.v4TagRefRecord);
    mutate(value);
    assert.throws(() => verifyNavigationCausalAnonymousEvidenceRelease(value));
  });
});

test("credential-free live preflight fetches the contract, V4 anchor, and exact absence surfaces", async () => {
  const fixture = await publicationFixture();
  const target = fixture.hosted.contractCommitRecord.sha;
  const harnessApi = "https://api.github.com/repos/oxhq/stasis-compat-bench";
  const sourceApi = "https://api.github.com/repos/oxhq/stasis";
  const routes = new Map([
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(fixture.hosted.contractReleaseRecord)],
    [`${harnessApi}/releases/latest`, jsonRoute({ id: 382000000 })],
    [`${harnessApi}/commits/${target}`, jsonRoute(fixture.hosted.contractCommitRecord)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(fixture.contractTagRefRecord)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4Release)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4TagRefRecord)],
    [`${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`, statusRoute(404)],
    [`${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`, statusRoute(422)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${sourceApi}/actions/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&event=push&per_page=100`, jsonRoute({ total_count: 0, workflow_runs: [] })],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${fixture.v4Release.tag_name}/crawl-phase-localization-evidence.json`, bytesRoute(fixture.inputs["v4-localization-evidence.json"])],
  ]);
  for (const [name, bytes] of Object.entries(fixture.contractAssets)) {
    routes.set(
      `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.tag}/${name}`,
      bytesRoute(bytes),
    );
  }
  const receipt = await verifyAnonymousNavigationCausalContractPreflight(
    { expectedContractTargetSha: target },
    { fetchImpl: routedAnonymousFetch(routes) },
  );
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.sourceAbsence.httpStatuses.sourceCommit, 422);
});

test("credential-free pre-S5 gate binds the immutable receipt release and rechecks absence", async () => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const { routes } = preS5ReceiptRoutes(fixture, built);
  const receipt = await verifyAnonymousNavigationCausalPreflightRelease(
    {
      expectedContractTargetSha: fixture.hosted.contractCommitRecord.sha,
      expectedReceiptBytes: built.assets["anonymous-contract-preflight.json"],
    },
    { fetchImpl: routedAnonymousFetch(routes) },
  );
  assert.equal(receipt.schema, navigationCausalAnonymousPreflightReleaseVerificationSchema);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.release.lightweightTagDirectToTarget, true);
  assert.equal(receipt.sourceAbsenceRecheckedAfterReceiptRelease, true);
  assert.equal(receipt.preflightReceiptReleaseLatest, false);
});

test("pre-S5 receipt release gate rejects latest, chronology, tag, bytes, and observed source", async (t) => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const cases = [
    ["receipt release is latest", (live) => {
      live.latestRelease.id = live.preflightRelease.id;
    }],
    ["receipt predates contract", (live) => {
      live.preflightRelease.created_at = "2026-09-04T18:54:59Z";
    }],
    ["annotated receipt tag", (live) => {
      live.preflightTagRef.object.type = "tag";
    }],
    ["changed receipt digest", (live) => {
      live.preflightRelease.assets[0].digest = `sha256:${"a".repeat(64)}`;
    }],
    ["source appeared", (live) => {
      live.sourceRefStatus = 200;
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const { routes } = preS5ReceiptRoutes(fixture, built, mutate);
    await assert.rejects(() => verifyAnonymousNavigationCausalPreflightRelease(
      {
        expectedContractTargetSha: fixture.hosted.contractCommitRecord.sha,
        expectedReceiptBytes: built.assets["anonymous-contract-preflight.json"],
      },
      { fetchImpl: routedAnonymousFetch(routes) },
    ));
  });
});

test("credential-free live evidence verification refetches contract and hosted Actions authority", async () => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const publicInput = publicReleaseFixture(built.assets, fixture.v4TagRefRecord);
  const target = fixture.hosted.contractCommitRecord.sha;
  const { routes } = liveEvidenceRoutes(fixture, built, publicInput);
  const receipt = await verifyAnonymousNavigationCausalPublicRelease(
    { expectedReleaseTargetSha: target },
    { fetchImpl: routedAnonymousFetch(routes) },
  );
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.release.targetCommitSha, target);
  assert.equal(
    receipt.preflightReceiptRelease.tag,
    navigationCausalContractIdentity.preflightTag,
  );
  assert.equal(receipt.preflightReceiptRelease.latest, false);
  assert.equal(
    receipt.liveHostedAuthority.workflowSourceCommitSha,
    navigationCausalWorkflowSourceIdentity.revision,
  );
  assert.equal(receipt.liveHostedAuthority.workflowRunId, fixture.hosted.runRecord.id);
  assert.deepEqual(
    receipt.liveHostedAuthority.artifacts.map(({ expiredAtVerification }) =>
      expiredAtVerification),
    [false, false],
  );
});

test("live evidence verification is intentionally bounded to nonexpired Actions metadata", async () => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const publicInput = publicReleaseFixture(built.assets, fixture.v4TagRefRecord);
  const { routes } = liveEvidenceRoutes(fixture, built, publicInput, (live) => {
    for (const artifact of live.hosted.artifactsListing.artifacts) artifact.expired = true;
  });
  await assert.rejects(() => verifyAnonymousNavigationCausalPublicRelease(
    { expectedReleaseTargetSha: fixture.hosted.contractCommitRecord.sha },
    { fetchImpl: routedAnonymousFetch(routes) },
  ), /artifact metadata is invalid/u);
});

test("live evidence verification rejects source, run, job, artifact, and contract drift", async (t) => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const publicInput = publicReleaseFixture(built.assets, fixture.v4TagRefRecord);
  const cases = [
    ["moved source branch", (live) => {
      live.sourceBranchRef.object.sha = "a".repeat(40);
    }],
    ["second workflow run", (live) => {
      const extra = structuredClone(live.hosted.workflowRunsListing.workflow_runs[0]);
      extra.id += 1;
      extra.head_sha = "b".repeat(40);
      live.hosted.workflowRunsListing.total_count = 2;
      live.hosted.workflowRunsListing.workflow_runs.push(extra);
    }],
    ["rerun attempt", (live) => {
      live.hosted.runRecord.run_attempt = 2;
    }],
    ["job topology drift", (live) => {
      live.hosted.jobsListing.jobs[0].steps[1].name = "Changed live step";
    }],
    ["artifact digest drift", (live) => {
      live.hosted.artifactsListing.artifacts[0].digest = `sha256:${"c".repeat(64)}`;
    }],
    ["source commit drift", (live) => {
      live.hosted.workflowSourceCommitRecord.commit.tree.sha = "d".repeat(40);
    }],
    ["contract published_at drift", (live) => {
      live.hosted.contractReleaseRecord.published_at = "2026-09-04T18:54:59Z";
    }],
    ["preflight receipt published after run creation", (live) => {
      live.preflightRelease.created_at = "2026-09-04T19:00:00Z";
      live.preflightRelease.published_at = "2026-09-04T19:00:01Z";
    }],
    ["evidence release is latest", (live) => {
      live.latestRelease.id = publicInput.releaseRecord.id;
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const { routes } = liveEvidenceRoutes(fixture, built, publicInput, mutate);
    await assert.rejects(() => verifyAnonymousNavigationCausalPublicRelease(
      { expectedReleaseTargetSha: fixture.hosted.contractCommitRecord.sha },
      { fetchImpl: routedAnonymousFetch(routes) },
    ));
  });
});

async function publicationFixture({
  documentHtml = undefined,
  hostBOpenDeltaNs = 70n,
  hostAWrongFinalOrdinal = null,
} = {}) {
  const hostA = await frozenRaw("host-a", {
    documentHtml,
    openDeltaNs: 70n,
    wrongFinalOrdinal: hostAWrongFinalOrdinal,
  });
  const hostB = await frozenRaw("host-b", { documentHtml, openDeltaNs: hostBOpenDeltaNs });
  const archiveA = archive({
    "navigation-causal-host-a-raw.json": canonicalNavigationCausalJsonBytes(hostA),
    "navigation-causal-host-a-outcome.json": canonicalNavigationCausalJsonBytes(
      createNavigationCausalHostOutcome(hostA),
    ),
  });
  const archiveB = archive({
    "navigation-causal-host-b-raw.json": canonicalNavigationCausalJsonBytes(hostB),
    "navigation-causal-host-b-outcome.json": canonicalNavigationCausalJsonBytes(
      createNavigationCausalHostOutcome(hostB),
    ),
  });
  const hosted = navigationCausalHostedFixtureInput();
  const { readFile } = await import("node:fs/promises");
  const contractAssets = Object.fromEntries(await Promise.all(
    Object.keys(navigationCausalContractAssetIdentities).map(async (name) => [
      name,
      await readFile(new URL(`../protocol/${name}`, import.meta.url)),
    ]),
  ));
  hosted.contractCommitRecord.files = Object.entries(contractAssets).map(([name, bytes]) => ({
    filename: `protocol/${name}`,
    status: "added",
    sha: gitBlobSha(bytes),
  }));
  const archives = [archiveA, archiveB];
  hosted.artifactsListing.artifacts.forEach((metadata, index) => {
    metadata.size_in_bytes = archives[index].length;
    metadata.digest = `sha256:${sha256(archives[index])}`;
  });
  if (hostAWrongFinalOrdinal !== null) {
    hosted.runRecord.conclusion = "failure";
    hosted.workflowRunsListing.workflow_runs[0].conclusion = "failure";
    const job = hosted.jobsListing.jobs[0];
    job.conclusion = "failure";
    job.steps.find(({ number }) => number === 17).conclusion = "failure";
    Object.assign(job.steps.find(({ number }) => number === 33), {
      conclusion: "skipped",
      started_at: null,
      completed_at: null,
    });
  }
  const v4Binding = JSON.parse(await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL(
      "../protocol/stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1.json",
      import.meta.url,
    ))));
  const v4Release = {
    id: v4Binding.source.releaseId,
    tag_name: v4Binding.source.tag,
    target_commitish: v4Binding.source.targetCommitSha,
    immutable: true,
    draft: false,
    prerelease: false,
    assets: Object.entries(navigationCausalV4EvidenceAssets).map(([name, value], index) => ({
      id: name === v4Binding.source.localizationAsset.name
        ? v4Binding.source.localizationAsset.id
        : 544735000 + index,
      name,
      size: value[0],
      digest: `sha256:${value[1]}`,
    })),
  };
  const contractTagRefRecord = {
    ref: `refs/tags/${navigationCausalContractIdentity.tag}`,
    object: { type: "commit", sha: hosted.contractCommitRecord.sha },
  };
  const v4TagRefRecord = {
    ref: `refs/tags/${v4Binding.source.tag}`,
    object: { type: "commit", sha: v4Binding.source.targetCommitSha },
  };
  const v4LocalizationBytes = await readFile(new URL(
    "fixtures/crawl-phase-localization-evidence-v4-public.json",
    import.meta.url,
  ));
  const anonymousPreflight = verifyNavigationCausalAnonymousContractPreflight({
    contractReleaseRecord: hosted.contractReleaseRecord,
    contractCommitRecord: hosted.contractCommitRecord,
    contractTagRefRecord,
    contractAssets,
    latestReleaseRecord: { id: 382000000 },
    absence: {
      sourceRef: { status: 404 },
      sourceCommit: { status: 422 },
      workflowRuns: { status: 200 },
      evidenceRelease: { status: 404 },
      evidenceTagRef: { status: 404 },
    },
    workflowRunsListing: { total_count: 0, workflow_runs: [] },
    v4ReleaseRecord: v4Release,
    v4TagRefRecord,
    v4LocalizationBytes,
  });
  const inputRecords = {
    "anonymous-contract-preflight.json": anonymousPreflight,
    "contract-release.json": hosted.contractReleaseRecord,
    "contract-commit.json": hosted.contractCommitRecord,
    "workflow-run.json": hosted.runRecord,
    "workflow-runs.json": hosted.workflowRunsListing,
    "workflow-jobs.json": hosted.jobsListing,
    "workflow-artifacts.json": hosted.artifactsListing,
    "workflow-source-commit.json": hosted.workflowSourceCommitRecord,
    "v4-evidence-release.json": v4Release,
  };
  return {
    inputs: {
      "actions-navigation-causal-host-a.zip": archiveA,
      "actions-navigation-causal-host-b.zip": archiveB,
      ...Object.fromEntries(Object.entries(inputRecords).map(([name, value]) => [
        name,
        Buffer.from(`${JSON.stringify(value)}\n`, "utf8"),
      ])),
      "anonymous-contract-preflight.json": canonicalNavigationCausalJsonBytes(
        anonymousPreflight,
      ),
      "v4-localization-evidence.json": v4LocalizationBytes,
    },
    v4TagRefRecord,
    v4Release,
    contractTagRefRecord,
    contractAssets,
    hosted,
  };
}

async function frozenRaw(lane, options) {
  const raw = structuredClone(await navigationCausalHostFixtureRaw(lane, options));
  raw.identity.provenance.workflowSourceSha = navigationCausalWorkflowSourceIdentity.revision;
  raw.identity.provenance.harnessCheckoutRevision = navigationCausalHarnessIdentity.revision;
  raw.identity.provenance.harnessCheckoutTree = navigationCausalHarnessIdentity.tree;
  return raw;
}

function archive(entries) {
  const zip = new AdmZip();
  for (const [name, bytes] of Object.entries(entries)) zip.addFile(name, bytes);
  return zip.toBuffer();
}

function cloneAssets(value) {
  return Object.fromEntries(Object.entries(value).map(([name, bytes]) => [name, Buffer.from(bytes)]));
}

function publicReleaseFixture(assets, v4TagRefRecord) {
  const target = JSON.parse(assets["contract-release.json"]).target_commitish;
  const releaseRecord = {
    id: 382960000,
    tag_name: navigationCausalContractIdentity.evidenceTag,
    target_commitish: target,
    immutable: true,
    draft: false,
    prerelease: false,
    created_at: "2026-09-04T19:05:30Z",
    published_at: "2026-09-04T19:06:00Z",
    url: "https://api.github.com/repos/oxhq/stasis-compat-bench/releases/382960000",
    assets: navigationCausalPublicationAssetNames.map((name, index) => ({
      id: 544900000 + index,
      name,
      state: "uploaded",
      size: assets[name].length,
      digest: `sha256:${sha256(assets[name])}`,
      browser_download_url:
        `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.evidenceTag}/${name}`,
    })),
  };
  return {
    releaseRecord,
    evidenceTagRefRecord: {
      ref: `refs/tags/${navigationCausalContractIdentity.evidenceTag}`,
      object: { type: "commit", sha: target },
    },
    contractTagRefRecord: {
      ref: `refs/tags/${navigationCausalContractIdentity.tag}`,
      object: { type: "commit", sha: target },
    },
    v4TagRefRecord: structuredClone(v4TagRefRecord),
    assets,
  };
}

function preS5ReceiptRoutes(fixture, built, mutate = undefined) {
  const receiptBytes = built.assets["anonymous-contract-preflight.json"];
  const target = fixture.hosted.contractCommitRecord.sha;
  const live = {
    latestRelease: { id: 382000000 },
    sourceRefStatus: 404,
    preflightTagRef: {
      ref: `refs/tags/${navigationCausalContractIdentity.preflightTag}`,
      object: { type: "commit", sha: target },
    },
    preflightRelease: fixturePreflightRelease(target, receiptBytes),
  };
  mutate?.(live);
  const harnessApi = "https://api.github.com/repos/oxhq/stasis-compat-bench";
  const sourceApi = "https://api.github.com/repos/oxhq/stasis";
  const routes = new Map([
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(fixture.hosted.contractReleaseRecord)],
    [`${harnessApi}/commits/${target}`, jsonRoute(fixture.hosted.contractCommitRecord)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(fixture.contractTagRefRecord)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4Release)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4TagRefRecord)],
    [`${harnessApi}/releases/latest`, jsonRoute(live.latestRelease)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`, jsonRoute(live.preflightRelease)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`, jsonRoute(live.preflightTagRef)],
    [`${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`, statusRoute(live.sourceRefStatus)],
    [`${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`, statusRoute(422)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${sourceApi}/actions/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&event=push&per_page=100`, jsonRoute({ total_count: 0, workflow_runs: [] })],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${fixture.v4Release.tag_name}/crawl-phase-localization-evidence.json`, bytesRoute(fixture.inputs["v4-localization-evidence.json"])],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.preflightTag}/${navigationCausalContractIdentity.preflightAsset}`, bytesRoute(receiptBytes)],
  ]);
  for (const [name, bytes] of Object.entries(fixture.contractAssets)) {
    routes.set(
      `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.tag}/${name}`,
      bytesRoute(bytes),
    );
  }
  return { live, routes };
}

function fixturePreflightRelease(target, receiptBytes) {
  return {
    id: 382955000,
    tag_name: navigationCausalContractIdentity.preflightTag,
    target_commitish: target,
    immutable: true,
    draft: false,
    prerelease: false,
    created_at: "2026-09-04T18:55:30Z",
    published_at: "2026-09-04T18:56:00Z",
    url: "https://api.github.com/repos/oxhq/stasis-compat-bench/releases/382955000",
    assets: [{
      id: 544850000,
      name: navigationCausalContractIdentity.preflightAsset,
      state: "uploaded",
      size: receiptBytes.length,
      digest: `sha256:${sha256(receiptBytes)}`,
      browser_download_url:
        `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.preflightTag}/${navigationCausalContractIdentity.preflightAsset}`,
    }],
  };
}

function liveEvidenceRoutes(fixture, built, publicInput, mutate = undefined) {
  const receiptBytes = built.assets["anonymous-contract-preflight.json"];
  const target = fixture.hosted.contractCommitRecord.sha;
  const live = {
    latestRelease: { id: 382000000 },
    sourceBranchRef: {
      ref: navigationCausalWorkflowSourceIdentity.ref,
      object: {
        type: "commit",
        sha: navigationCausalWorkflowSourceIdentity.revision,
      },
    },
    hosted: structuredClone(fixture.hosted),
    preflightRelease: fixturePreflightRelease(target, receiptBytes),
  };
  mutate?.(live);
  const harnessApi = "https://api.github.com/repos/oxhq/stasis-compat-bench";
  const sourceApi = "https://api.github.com/repos/oxhq/stasis";
  const runId = fixture.hosted.runRecord.id;
  const workflowId = fixture.hosted.runRecord.workflow_id;
  const routes = new Map([
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, jsonRoute(publicInput.releaseRecord)],
    [`${harnessApi}/releases/latest`, jsonRoute(live.latestRelease)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, jsonRoute(publicInput.evidenceTagRefRecord)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(publicInput.contractTagRefRecord)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`, jsonRoute(live.preflightRelease)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`, jsonRoute({
      ref: `refs/tags/${navigationCausalContractIdentity.preflightTag}`,
      object: { type: "commit", sha: target },
    })],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4TagRefRecord)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(live.hosted.contractReleaseRecord)],
    [`${harnessApi}/commits/${target}`, jsonRoute(live.hosted.contractCommitRecord)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4Release)],
    [`${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`, jsonRoute(live.sourceBranchRef)],
    [`${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`, jsonRoute(live.hosted.workflowSourceCommitRecord)],
    [`${sourceApi}/actions/runs/${runId}`, jsonRoute(live.hosted.runRecord)],
    [`${sourceApi}/actions/workflows/${workflowId}/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&event=push&per_page=100`, jsonRoute(live.hosted.workflowRunsListing)],
    [`${sourceApi}/actions/runs/${runId}/jobs?filter=all&per_page=100`, jsonRoute(live.hosted.jobsListing)],
    [`${sourceApi}/actions/runs/${runId}/artifacts?per_page=100`, jsonRoute(live.hosted.artifactsListing)],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${fixture.v4Release.tag_name}/crawl-phase-localization-evidence.json`, bytesRoute(fixture.inputs["v4-localization-evidence.json"])],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.preflightTag}/${navigationCausalContractIdentity.preflightAsset}`, bytesRoute(receiptBytes)],
  ]);
  for (const [name, bytes] of Object.entries(fixture.contractAssets)) {
    routes.set(
      `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.tag}/${name}`,
      bytesRoute(bytes),
    );
  }
  for (const [name, bytes] of Object.entries(built.assets)) {
    routes.set(
      `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.evidenceTag}/${name}`,
      bytesRoute(bytes),
    );
  }
  return { live, routes };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function jsonRoute(value) {
  return bytesRoute(Buffer.from(JSON.stringify(value), "utf8"));
}

function bytesRoute(bytes) {
  return { status: 200, bytes: Buffer.from(bytes) };
}

function statusRoute(status) {
  return { status, bytes: Buffer.alloc(0) };
}

function routedAnonymousFetch(routes) {
  return async (url, options) => {
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers["accept-encoding"], "identity");
    const route = routes.get(String(url));
    if (route === undefined) throw new TypeError(`Unexpected anonymous URL: ${url}`);
    return new Response(route.bytes, {
      status: route.status,
      headers: route.status === 200
        ? { "content-length": String(route.bytes.length) }
        : {},
    });
  };
}
