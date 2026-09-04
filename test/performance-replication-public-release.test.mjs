import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  performanceReplicationContractTargetSha,
  performanceReplicationPublicationAssetNames,
  performanceReplicationPublicationIdentity,
  performanceReplicationReleaseVerificationSchema,
} from "../src/performance/replication-publication.mjs";
import {
  performanceReplicationAnonymousFetchPolicy,
  performanceReplicationAnonymousReleaseVerificationSchema,
  verifyAnonymousPerformanceReplicationPublicRelease,
} from "../src/performance/replication-public-release.mjs";
import {
  performanceReplicationContractIdentity,
} from "../src/performance/replication-hosted-provenance.mjs";

const evidenceTargetSha = "f".repeat(40);
const releaseId = 812_345_678;
const workflowRunId = 33_900_000_000;
const publishedAt = "2026-09-04T12:01:00Z";
const completedAt = "2026-09-04T12:00:00Z";

test("anonymous public release verifier fetches and binds all 28 assets without credentials", async () => {
  const fixture = publicFixture();
  const firstHarness = fetchHarness(fixture);
  let verifiedInput;
  const first = await verifyAnonymousPerformanceReplicationPublicRelease({
    expectedOfflineAssetMap: fixture.expectedMap,
    expectedReleaseTargetSha: evidenceTargetSha,
  }, {
    fetchImpl: firstHarness.fetch,
    verifyRelease: (input) => {
      verifiedInput = input;
      return releaseVerificationReceipt();
    },
  });

  assert.equal(first.schema, performanceReplicationAnonymousReleaseVerificationSchema);
  assert.equal(first.status, "passed");
  assert.equal(first.release.repository, performanceReplicationPublicationIdentity.repository);
  assert.equal(first.release.tag, performanceReplicationPublicationIdentity.tag);
  assert.equal(first.release.releaseId, releaseId);
  assert.equal(first.release.targetCommitSha, evidenceTargetSha);
  assert.equal(first.release.tagBindings.contract.objectSha, performanceReplicationContractTargetSha);
  assert.equal(first.release.tagBindings.evidence.objectSha, evidenceTargetSha);
  assert.equal(first.assetByteMap.length, 28);
  assert.deepEqual(
    first.assetByteMap.map(({ name }) => name),
    performanceReplicationPublicationAssetNames,
  );
  assert.deepEqual(first.transport, performanceReplicationAnonymousFetchPolicy);
  assert.equal(first.verification.releasePublishedAfterAuthoritativeWorkflowCompletion, true);
  assert.equal(first.verification.evidenceTargetDirectSuccessorOfContract, true);
  assert.equal(first.verification.contractTagRefBoundToContractTarget, true);
  assert.equal(first.verification.evidenceTagRefBoundToEvidenceTarget, true);
  assert.equal(first.verification.bothTagsVerifiedLightweight, true);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.assetByteMap), true);
  assert.equal(Object.isFrozen(first.assetByteMap[0]), true);

  assert.equal(verifiedInput.releaseRecord.id, releaseId);
  assert.equal(verifiedInput.contractTagRefRecord.ref, `refs/tags/${performanceReplicationContractIdentity.tag}`);
  assert.equal(verifiedInput.releaseTagRefRecord.ref, `refs/tags/${performanceReplicationPublicationIdentity.tag}`);
  assert.equal(verifiedInput.releaseTargetCommitRecord.sha, evidenceTargetSha);
  assert.equal(verifiedInput.expectedReleaseTargetSha, evidenceTargetSha);
  for (const name of performanceReplicationPublicationAssetNames) {
    assert.deepEqual(verifiedInput.anonymousDownloadedAssetBytes[name], fixture.assetBytes[name]);
  }

  assert.equal(firstHarness.calls.length, 4 + performanceReplicationPublicationAssetNames.length * 2);
  for (const call of firstHarness.calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.redirect, "manual");
    assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.referrerPolicy, "no-referrer");
    const headers = Object.fromEntries(
      Object.entries(call.options.headers).map(([key, value]) => [key.toLowerCase(), value]),
    );
    assert.equal(headers.authorization, undefined);
    assert.equal(headers.cookie, undefined);
    assert.equal(headers["proxy-authorization"], undefined);
    assert.equal(headers["accept-encoding"], "identity");
  }

  const rendered = JSON.stringify(first);
  assert.equal(rendered.includes("https://"), false);
  assert.equal(rendered.includes("public-bytes:"), false);
  assert.equal(rendered.includes("browser_download_url"), false);
  assert.equal(rendered.includes("responseHeaders"), true);

  const secondHarness = fetchHarness(fixture);
  const second = await verifyAnonymousPerformanceReplicationPublicRelease({
    expectedOfflineAssetMap: fixture.expectedMap,
    expectedReleaseTargetSha: evidenceTargetSha,
  }, {
    fetchImpl: secondHarness.fetch,
    verifyRelease: () => releaseVerificationReceipt(),
  });
  assert.deepEqual(second, first);
});

test("ambient token variables are never projected into anonymous requests", async () => {
  const fixture = publicFixture();
  const harness = fetchHarness(fixture);
  const previous = new Map();
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "NODE_AUTH_TOKEN", "NPM_TOKEN"]) {
    previous.set(name, process.env[name]);
    process.env[name] = `must-not-leak-${name}`;
  }
  try {
    await verifyAnonymousPerformanceReplicationPublicRelease({
      expectedOfflineAssetMap: fixture.expectedMap,
      expectedReleaseTargetSha: evidenceTargetSha,
    }, {
      fetchImpl: harness.fetch,
      verifyRelease: () => releaseVerificationReceipt(),
    });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  const serializedHeaders = JSON.stringify(harness.calls.map(({ options }) => options.headers));
  assert.equal(serializedHeaders.includes("must-not-leak"), false);
  assert.equal(/authorization|cookie/iu.test(serializedHeaders), false);
});

test("expected offline map is exact, bounded, and checked before network access", async (t) => {
  const base = publicFixture().expectedMap;
  const firstName = performanceReplicationPublicationAssetNames[0];
  const cases = [
    ["missing asset", (value) => { delete value[firstName]; }],
    ["extra asset", (value) => { value.extra = { bytes: 1, sha256: "0".repeat(64) }; }],
    ["zero bytes", (value) => { value[firstName].bytes = 0; }],
    ["oversized asset", (value) => {
      value[firstName].bytes = performanceReplicationAnonymousFetchPolicy.maximumAssetBytes + 1;
    }],
    ["uppercase digest", (value) => { value[firstName].sha256 = "A".repeat(64); }],
    ["extra identity field", (value) => { value[firstName].path = "private"; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const expectedOfflineAssetMap = structuredClone(base);
      mutate(expectedOfflineAssetMap);
      let calls = 0;
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: async () => { calls += 1; },
          verifyRelease: () => releaseVerificationReceipt(),
        }),
        /offline|asset|byte bound/iu,
      );
      assert.equal(calls, 0);
    });
  }
});

test("release API identity, state, exact inventory, and asset metadata fail closed", async (t) => {
  const cases = [
    ["wrong tag", (release) => { release.tag_name = "wrong"; }],
    ["wrong target", (release) => { release.target_commitish = "e".repeat(40); }],
    ["mutable", (release) => { release.immutable = false; }],
    ["draft", (release) => { release.draft = true; }],
    ["prerelease", (release) => { release.prerelease = true; }],
    ["invalid publication time", (release) => { release.published_at = "yesterday"; }],
    ["wrong repository URL", (release) => { release.url = "https://api.github.com/repos/evil/repo/releases/1"; }],
    ["missing asset", (release) => { release.assets.pop(); }],
    ["extra asset", (release) => { release.assets.push({ ...release.assets[0], name: "extra" }); }],
    ["duplicate asset name", (release) => { release.assets[1].name = release.assets[0].name; }],
    ["duplicate asset ID", (release) => { release.assets[1].id = release.assets[0].id; }],
    ["starter asset", (release) => { release.assets[0].state = "starter"; }],
    ["wrong asset size", (release) => { release.assets[0].size += 1; }],
    ["wrong asset digest", (release) => { release.assets[0].digest = `sha256:${"0".repeat(64)}`; }],
    ["wrong asset API URL", (release) => { release.assets[0].url += "/wrong"; }],
    ["wrong asset download URL", (release) => { release.assets[0].browser_download_url += "?wrong=1"; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fixture = publicFixture();
      mutate(fixture.releaseRecord);
      let requestedAssets = 0;
      const harness = fetchHarness(fixture, {
        onAssetRequest: () => { requestedAssets += 1; },
      });
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap: fixture.expectedMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: harness.fetch,
          verifyRelease: () => releaseVerificationReceipt(),
        }),
        /release|asset|UTC/iu,
      );
      assert.equal(requestedAssets, 0);
    });
  }
});

test("target commit must be the explicit SHA with exactly the contract target parent", async (t) => {
  const cases = [
    ["wrong SHA", (commit) => { commit.sha = "d".repeat(40); }],
    ["no parent", (commit) => { commit.parents = []; }],
    ["two parents", (commit) => { commit.parents.push(structuredClone(commit.parents[0])); }],
    ["wrong parent", (commit) => { commit.parents[0].sha = "c".repeat(40); }],
    ["wrong commit URL", (commit) => { commit.url += "/wrong"; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fixture = publicFixture();
      mutate(fixture.commitRecord);
      let requestedAssets = 0;
      const harness = fetchHarness(fixture, {
        onAssetRequest: () => { requestedAssets += 1; },
      });
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap: fixture.expectedMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: harness.fetch,
          verifyRelease: () => releaseVerificationReceipt(),
        }),
        /target|commit|parent/iu,
      );
      assert.equal(requestedAssets, 0);
    });
  }

  const fixture = publicFixture();
  let calls = 0;
  await assert.rejects(
    verifyAnonymousPerformanceReplicationPublicRelease({
      expectedOfflineAssetMap: fixture.expectedMap,
      expectedReleaseTargetSha: performanceReplicationContractTargetSha,
    }, {
      fetchImpl: async () => { calls += 1; },
      verifyRelease: () => releaseVerificationReceipt(),
    }),
    /differ from the contract target/u,
  );
  assert.equal(calls, 0);
});

test("both contract and evidence tags must be exact lightweight commit refs", async (t) => {
  const cases = [
    ["evidence wrong ref", "releaseTagRefRecord", (value) => {
      value.ref = "refs/tags/wrong";
    }],
    ["evidence wrong type", "releaseTagRefRecord", (value) => {
      value.object.type = "tree";
    }],
    ["evidence wrong SHA", "releaseTagRefRecord", (value) => {
      value.object.sha = "d".repeat(40);
    }],
    ["evidence annotated tag", "releaseTagRefRecord", (value) => {
      value.object.type = "tag";
      value.object.url = `${repositoryApiRoot()}/git/tags/${value.object.sha}`;
    }],
    ["contract wrong ref", "contractTagRefRecord", (value) => {
      value.ref = "refs/tags/wrong";
    }],
    ["contract wrong type", "contractTagRefRecord", (value) => {
      value.object.type = "tree";
    }],
    ["contract wrong SHA", "contractTagRefRecord", (value) => {
      value.object.sha = "d".repeat(40);
    }],
  ];
  for (const [name, recordName, mutate] of cases) {
    await t.test(name, async () => {
      const fixture = publicFixture();
      mutate(fixture[recordName]);
      let requestedAssets = 0;
      const harness = fetchHarness(fixture, {
        onAssetRequest: () => { requestedAssets += 1; },
      });
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap: fixture.expectedMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: harness.fetch,
          verifyRelease: () => releaseVerificationReceipt(),
        }),
        /tag|ref|lightweight|SHA/iu,
      );
      assert.equal(requestedAssets, 0);
    });
  }
});

test("redirect handling rejects unsafe, cyclic, incomplete, and excessive chains", async (t) => {
  const fixture = publicFixture();
  const releaseEndpoint = releaseApiUrl();
  const cases = [
    ["HTTP downgrade", () => redirectResponse("http://github.com/unsafe")],
    ["foreign host", () => redirectResponse("https://example.invalid/unsafe")],
    ["URL credentials", () => redirectResponse("https://user:secret@github.com/unsafe")],
    ["missing location", () => new Response(null, { status: 302 })],
    ["loop", () => redirectResponse(releaseEndpoint)],
  ];
  for (const [name, response] of cases) {
    await t.test(name, async () => {
      let calls = 0;
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap: fixture.expectedMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: async () => { calls += 1; return response(); },
          verifyRelease: () => releaseVerificationReceipt(),
        }),
        /redirect|URL|policy|loop/iu,
      );
      assert.ok(calls <= 1);
    });
  }

  let redirects = 0;
  await assert.rejects(
    verifyAnonymousPerformanceReplicationPublicRelease({
      expectedOfflineAssetMap: fixture.expectedMap,
      expectedReleaseTargetSha: evidenceTargetSha,
    }, {
      fetchImpl: async () => {
        redirects += 1;
        return redirectResponse(`https://api.github.com/redirect/${redirects}`);
      },
      verifyRelease: () => releaseVerificationReceipt(),
    }),
    /redirect bound/u,
  );
  assert.equal(redirects, performanceReplicationAnonymousFetchPolicy.maximumRedirects + 1);
});

test("asset responses reject HTTP, encoding, length, size, and hash failures without retry", async (t) => {
  const cases = [
    ["HTTP error", () => new Response("missing", { status: 404 }), /HTTP 404/u],
    ["encoded response", (bytes) => byteResponse(bytes, { "content-encoding": "gzip" }), /encoded/u],
    ["wrong Content-Length", (bytes) => byteResponse(bytes, {
      "content-length": String(bytes.byteLength + 1),
    }), /Content-Length/u],
    ["truncated body", (bytes) => byteResponse(bytes.subarray(0, bytes.byteLength - 1)), /byte length/u],
    ["oversized body", (bytes) => byteResponse(Buffer.concat([bytes, Buffer.from("x")])), /byte bound/u],
    ["same-size hash drift", (bytes) => byteResponse(Buffer.alloc(bytes.byteLength, 0x78)), /bytes mismatch/u],
  ];
  for (const [name, responseFactory, pattern] of cases) {
    await t.test(name, async () => {
      const fixture = publicFixture();
      const firstName = performanceReplicationPublicationAssetNames[0];
      let affectedCalls = 0;
      const harness = fetchHarness(fixture, {
        assetResponse: (assetName, bytes) => {
          if (assetName !== firstName) return null;
          affectedCalls += 1;
          return responseFactory(bytes);
        },
      });
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap: fixture.expectedMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: harness.fetch,
          verifyRelease: () => releaseVerificationReceipt(),
        }),
        pattern,
      );
      assert.equal(affectedCalls, 1);
    });
  }
});

test("release publication must be strictly after a completed successful workflow updated_at", async (t) => {
  const cases = [
    ["in progress", { status: "in_progress", conclusion: null, updated_at: completedAt }, publishedAt],
    ["failed", { status: "completed", conclusion: "failure", updated_at: completedAt }, publishedAt],
    ["invalid updated_at", { status: "completed", conclusion: "success", updated_at: "later" }, publishedAt],
    ["same instant", { status: "completed", conclusion: "success", updated_at: publishedAt }, publishedAt],
    ["published earlier", { status: "completed", conclusion: "success", updated_at: publishedAt }, completedAt],
  ];
  for (const [name, workflow, releaseTime] of cases) {
    await t.test(name, async () => {
      const fixture = publicFixture({ workflowRun: workflow, releasePublishedAt: releaseTime });
      const harness = fetchHarness(fixture);
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap: fixture.expectedMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: harness.fetch,
          verifyRelease: () => releaseVerificationReceipt(),
        }),
        /workflow|completion|completed|UTC/iu,
      );
    });
  }
});

test("the independent release verifier must return its exact passed receipt boundary", async (t) => {
  const fixture = publicFixture();
  const cases = [
    ["unverified bytes", (receipt) => { receipt.anonymousDownloadedBytesVerified = false; }],
    ["wrong release ID", (receipt) => { receipt.releaseId += 1; }],
    ["wrong contract target", (receipt) => { receipt.contractTargetSha = "b".repeat(40); }],
    ["wrong workflow run", (receipt) => { receipt.workflowRunId += 1; }],
    ["wrong decision", (receipt) => { receipt.decisionState = "PROMOTE"; }],
    ["wrong evidence tag ref", (receipt) => {
      receipt.tagBindings.evidence.ref = "refs/tags/wrong";
    }],
    ["wrong contract tag type", (receipt) => {
      receipt.tagBindings.contract.objectType = "tag";
    }],
    ["missing direct-successor proof", (receipt) => {
      receipt.directSuccessorOfContractTarget = false;
    }],
    ["missing asset identities", (receipt) => { delete receipt.assets; }],
    ["short asset identities", (receipt) => { receipt.assets.pop(); }],
    ["reordered asset identities", (receipt) => {
      [receipt.assets[0], receipt.assets[1]] = [receipt.assets[1], receipt.assets[0]];
    }],
    ["drifted asset byte count", (receipt) => { receipt.assets[0].bytes += 1; }],
    ["drifted asset digest", (receipt) => { receipt.assets[0].sha256 = "0".repeat(64); }],
    ["extra asset identity field", (receipt) => { receipt.assets[0].url = "private"; }],
    ["extra receipt field", (receipt) => { receipt.unexpected = true; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const harness = fetchHarness(fixture);
      const invalidReceipt = releaseVerificationReceipt(fixture.expectedMap);
      mutate(invalidReceipt);
      await assert.rejects(
        verifyAnonymousPerformanceReplicationPublicRelease({
          expectedOfflineAssetMap: fixture.expectedMap,
          expectedReleaseTargetSha: evidenceTargetSha,
        }, {
          fetchImpl: harness.fetch,
          verifyRelease: () => invalidReceipt,
        }),
        /release verification (?:receipt|asset)/u,
      );
    });
  }
});

function publicFixture({
  workflowRun = {
    id: workflowRunId,
    status: "completed",
    conclusion: "success",
    updated_at: completedAt,
  },
  releasePublishedAt = publishedAt,
} = {}) {
  const assetBytes = Object.fromEntries(
    performanceReplicationPublicationAssetNames.map((name) => [
      name,
      name === "workflow-run.json"
        ? canonicalJsonBytes(workflowRun)
        : Buffer.from(`public-bytes:${name}\n`, "utf8"),
    ]),
  );
  const expectedMap = Object.fromEntries(
    performanceReplicationPublicationAssetNames.map((name) => [
      name,
      { bytes: assetBytes[name].byteLength, sha256: sha256(assetBytes[name]) },
    ]),
  );
  return {
    assetBytes,
    expectedMap,
    releaseRecord: releaseRecord(expectedMap, releasePublishedAt),
    contractTagRefRecord: tagRefRecord(
      performanceReplicationContractIdentity.tag,
      performanceReplicationContractTargetSha,
    ),
    releaseTagRefRecord: tagRefRecord(
      performanceReplicationPublicationIdentity.tag,
      evidenceTargetSha,
    ),
    commitRecord: commitRecord(),
  };
}

function releaseRecord(expectedMap, releasePublishedAt) {
  const identity = performanceReplicationPublicationIdentity;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  return {
    id: releaseId,
    tag_name: identity.tag,
    target_commitish: evidenceTargetSha,
    immutable: true,
    draft: false,
    prerelease: false,
    published_at: releasePublishedAt,
    url: `${api}/releases/${releaseId}`,
    assets_url: `${api}/releases/${releaseId}/assets`,
    upload_url: `https://uploads.github.com/repos/${identity.repository}/releases/${releaseId}/assets{?name,label}`,
    html_url: `${web}/releases/tag/${identity.tag}`,
    assets: [...performanceReplicationPublicationAssetNames].reverse().map((name, index) => {
      const id = 900_000_000 + index;
      return {
        id,
        name,
        state: "uploaded",
        size: expectedMap[name].bytes,
        digest: `sha256:${expectedMap[name].sha256}`,
        url: `${api}/releases/assets/${id}`,
        browser_download_url: assetDownloadUrl(name),
      };
    }),
  };
}

function commitRecord() {
  const identity = performanceReplicationPublicationIdentity;
  const api = `https://api.github.com/repos/${identity.repository}`;
  const web = `https://github.com/${identity.repository}`;
  return {
    sha: evidenceTargetSha,
    url: `${api}/commits/${evidenceTargetSha}`,
    html_url: `${web}/commit/${evidenceTargetSha}`,
    commit: {
      tree: {
        sha: "a".repeat(40),
        url: `${api}/git/trees/${"a".repeat(40)}`,
      },
    },
    parents: [{
      sha: performanceReplicationContractTargetSha,
      url: `${api}/commits/${performanceReplicationContractTargetSha}`,
      html_url: `${web}/commit/${performanceReplicationContractTargetSha}`,
    }],
  };
}

function fetchHarness(fixture, { assetResponse, onAssetRequest } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === releaseApiUrl()) return jsonResponse(fixture.releaseRecord);
      if (url === contractTagRefApiUrl()) return jsonResponse(fixture.contractTagRefRecord);
      if (url === releaseTagRefApiUrl()) return jsonResponse(fixture.releaseTagRefRecord);
      if (url === commitApiUrl()) return jsonResponse(fixture.commitRecord);
      const directPrefix = `${releaseDownloadRoot()}/`;
      if (url.startsWith(directPrefix)) {
        const name = decodeURIComponent(url.slice(directPrefix.length));
        onAssetRequest?.(name, "initial");
        return redirectResponse(
          `https://release-assets.githubusercontent.com/download/${encodeURIComponent(name)}`,
        );
      }
      const redirectedPrefix = "https://release-assets.githubusercontent.com/download/";
      if (url.startsWith(redirectedPrefix)) {
        const name = decodeURIComponent(url.slice(redirectedPrefix.length));
        onAssetRequest?.(name, "redirected");
        const custom = assetResponse?.(name, fixture.assetBytes[name]);
        if (custom !== undefined && custom !== null) return custom;
        return byteResponse(fixture.assetBytes[name], {
          "content-length": String(fixture.assetBytes[name].byteLength),
        });
      }
      throw new Error("unexpected test URL");
    },
  };
}

function releaseVerificationReceipt(expectedMap = publicFixture().expectedMap) {
  return {
    schema: performanceReplicationReleaseVerificationSchema,
    status: "passed",
    repository: performanceReplicationPublicationIdentity.repository,
    tag: performanceReplicationPublicationIdentity.tag,
    releaseId,
    contractTargetSha: performanceReplicationContractTargetSha,
    evidenceTargetSha,
    tagBindings: {
      contract: tagBinding(
        performanceReplicationContractIdentity.tag,
        performanceReplicationContractTargetSha,
      ),
      evidence: tagBinding(
        performanceReplicationPublicationIdentity.tag,
        evidenceTargetSha,
      ),
    },
    workflowRunId,
    assetCount: 28,
    assets: performanceReplicationPublicationAssetNames.map((name) => ({
      name,
      bytes: expectedMap[name].bytes,
      sha256: expectedMap[name].sha256,
    })),
    anonymousDownloadedBytesVerified: true,
    releaseImmutable: true,
    releaseDraft: false,
    releasePrerelease: false,
    directSuccessorOfContractTarget: true,
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
  };
}

function tagBinding(tag, objectSha) {
  return {
    ref: `refs/tags/${tag}`,
    objectType: "commit",
    objectSha,
    lightweight: true,
  };
}

function tagRefRecord(tag, objectSha) {
  const api = repositoryApiRoot();
  return {
    ref: `refs/tags/${tag}`,
    url: `${api}/git/refs/tags/${encodeURIComponent(tag)}`,
    object: {
      type: "commit",
      sha: objectSha,
      url: `${api}/git/commits/${objectSha}`,
    },
  };
}

function releaseApiUrl() {
  const identity = performanceReplicationPublicationIdentity;
  return `https://api.github.com/repos/${identity.repository}/releases/tags/${encodeURIComponent(identity.tag)}`;
}

function contractTagRefApiUrl() {
  return `${repositoryApiRoot()}/git/ref/tags/${encodeURIComponent(performanceReplicationContractIdentity.tag)}`;
}

function releaseTagRefApiUrl() {
  return `${repositoryApiRoot()}/git/ref/tags/${encodeURIComponent(performanceReplicationPublicationIdentity.tag)}`;
}

function repositoryApiRoot() {
  return `https://api.github.com/repos/${performanceReplicationPublicationIdentity.repository}`;
}

function commitApiUrl() {
  const identity = performanceReplicationPublicationIdentity;
  return `https://api.github.com/repos/${identity.repository}/commits/${evidenceTargetSha}`;
}

function releaseDownloadRoot() {
  const identity = performanceReplicationPublicationIdentity;
  return `https://github.com/${identity.repository}/releases/download/${identity.tag}`;
}

function assetDownloadUrl(name) {
  return `${releaseDownloadRoot()}/${name}`;
}

function jsonResponse(value) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  return byteResponse(bytes, { "content-length": String(bytes.byteLength) });
}

function byteResponse(bytes, headers = {}) {
  return new Response(bytes, { status: 200, headers });
}

function redirectResponse(location) {
  return new Response(null, { status: 302, headers: { location } });
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
