import { readFile } from "node:fs/promises";

import {
  navigationCausalInvalidV1Evidence,
  navigationCausalV1ContractAssetIdentities,
} from "../../src/performance/navigation-causal-contract.mjs";
import {
  navigationCausalExpectedV1Receipt,
} from "../../src/performance/navigation-causal-public-release.mjs";

const repository = "oxhq/stasis-compat-bench";

export async function navigationCausalInvalidV1Fixture() {
  const expected = navigationCausalInvalidV1Evidence;
  const protocolRoot = new URL("../../protocol/", import.meta.url);
  const contractAssets = Object.fromEntries(await Promise.all(
    Object.keys(navigationCausalV1ContractAssetIdentities).map(async (name) => [
      name,
      await readFile(new URL(name, protocolRoot)),
    ]),
  ));
  const contractReleaseRecord = releaseRecord(
    expected.contract,
    Object.entries(navigationCausalV1ContractAssetIdentities).map(([name, identity]) => ({
      id: identity.id,
      name,
      state: "uploaded",
      download_count: 0,
      size: identity.bytes,
      digest: `sha256:${identity.sha256}`,
      browser_download_url: releaseAssetUrl(expected.contract.tag, name),
      uploader: githubUser(),
    })),
  );
  const contractCommitRecord = {
    sha: expected.contract.targetCommitSha,
    url: `https://api.github.com/repos/${repository}/commits/${expected.contract.targetCommitSha}`,
    author: githubUser(),
    committer: githubUser(),
    commit: { tree: { sha: expected.contract.targetTreeSha } },
    parents: [{ sha: expected.contract.soleParentSha }],
    files: v1CommitFiles(),
  };
  const preflightReleaseRecord = releaseRecord(
    expected.preflight,
    [{
      id: expected.preflight.asset.id,
      name: expected.preflight.asset.name,
      state: "uploaded",
      download_count: 0,
      size: expected.preflight.asset.bytes,
      digest: `sha256:${expected.preflight.asset.sha256}`,
      browser_download_url: releaseAssetUrl(
        expected.preflight.tag,
        expected.preflight.asset.name,
      ),
      uploader: githubUser(),
    }],
  );
  return {
    contractReleaseRecord,
    contractCommitRecord,
    contractTagRefRecord: tagRef(expected.contract.tag, expected.contract.targetCommitSha),
    contractAssets,
    preflightReleaseRecord,
    preflightTagRefRecord: tagRef(expected.preflight.tag, expected.preflight.targetCommitSha),
    preflightReceiptBytes: Buffer.from(
      `${JSON.stringify(navigationCausalExpectedV1Receipt, null, 2)}\n`,
      "utf8",
    ),
  };
}

function v1CommitFiles() {
  const names = [
    "PUBLIC_PROJECTION.json",
    "package.json",
    "protocol/stasis-v0.3.3-performance-navigation-causal-preflight-v1.json",
    "protocol/stasis-v0.3.3-performance-navigation-causal-v1.md",
    "protocol/stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1.json",
    "protocol/stasis-v0.3.3-performance-navigation-causal-workflow-v1.yml",
    "src/performance/navigation-causal-artifact-binding.mjs",
    "src/performance/navigation-causal-contract.mjs",
    "src/performance/navigation-causal-hosted-provenance.mjs",
    "src/performance/navigation-causal-public-release.mjs",
    "src/performance/navigation-causal-public-verification.mjs",
    "src/performance/navigation-causal-publication-cli.mjs",
    "src/performance/navigation-causal-publication.mjs",
    "src/performance/navigation-causal-replication.mjs",
    "src/post-support/artifact-privacy.mjs",
    "test/fixtures/crawl-phase-localization-evidence-v4-public.json",
    "test/fixtures/navigation-causal-host-fixture.mjs",
    "test/fixtures/navigation-causal-hosted-fixture.mjs",
    "test/performance-navigation-causal-artifact-binding.test.mjs",
    "test/performance-navigation-causal-contract.test.mjs",
    "test/performance-navigation-causal-hosted-provenance.test.mjs",
    "test/performance-navigation-causal-public-release.test.mjs",
    "test/performance-navigation-causal-publication-cli.test.mjs",
    "test/performance-navigation-causal-publication.test.mjs",
    "test/performance-navigation-causal-replication.test.mjs",
    "test/publication-projection.test.mjs",
  ];
  const identitiesByPath = new Map(Object.entries(navigationCausalV1ContractAssetIdentities)
    .map(([name, identity]) => [`protocol/${name}`, identity]));
  return names.map((filename, index) => {
    const identity = identitiesByPath.get(filename);
    const file = {
      filename,
      status: identity === undefined ? "modified" : "added",
      sha: identity?.blob ?? `${(index % 9) + 1}`.repeat(40),
    };
    if (index === 23) {
      const reviewedPrefix = ["authorization:", "Bearer"].join(" ");
      file.status = "added";
      file.patch =
        "@@ -0,0 +1,2 @@\n" +
        `+  run.documentHtml = "${reviewedPrefix} must-not-be-hidden";\n` +
        `+      '<p>${reviewedPrefix} TOPSECRET123</p></main></body>',`;
    }
    return file;
  });
}

function releaseRecord(identity, assets) {
  return {
    id: identity.releaseId,
    tag_name: identity.tag,
    target_commitish: identity.targetCommitSha,
    immutable: true,
    draft: false,
    prerelease: false,
    created_at: identity.createdAt,
    published_at: identity.publishedAt,
    url: `https://api.github.com/repos/${repository}/releases/${identity.releaseId}`,
    upload_url:
      `https://uploads.github.com/repos/${repository}/releases/${identity.releaseId}/assets{?name,label}`,
    author: githubUser(),
    assets,
  };
}

function githubUser() {
  const login = "garaekz";
  const base = `https://api.github.com/users/${login}`;
  return {
    login,
    id: 14_919_842,
    url: base,
    following_url: `${base}/following{/other_user}`,
    gists_url: `${base}/gists{/gist_id}`,
    starred_url: `${base}/starred{/owner}{/repo}`,
    events_url: `${base}/events{/privacy}`,
  };
}

function tagRef(tag, target) {
  return {
    ref: `refs/tags/${tag}`,
    object: { type: "commit", sha: target },
  };
}

function releaseAssetUrl(tag, name) {
  return `https://github.com/${repository}/releases/download/${tag}/${name}`;
}
