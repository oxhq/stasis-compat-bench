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
  verifyNavigationCausalGitHubAuthorityPrivacy,
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
import {
  navigationCausalInvalidV2Evidence,
  navigationCausalV2FailureAuthorityRoutes,
} from "../src/performance/navigation-causal-v2-failure.mjs";
import { navigationCausalHostFixtureRaw } from "./fixtures/navigation-causal-host-fixture.mjs";
import { navigationCausalHostedFixtureInput } from "./fixtures/navigation-causal-hosted-fixture.mjs";
import { navigationCausalInvalidV1Fixture } from "./fixtures/navigation-causal-invalid-v1-fixture.mjs";
import { navigationCausalInvalidV2Fixture } from "./fixtures/navigation-causal-invalid-v2-fixture.mjs";

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
  assert.equal(verified.assetCount, 29);
  assert.equal(verified.validMeasurement, true);
  const scan = JSON.parse(built.assets["privacy-scan.json"]);
  assert.equal(scan.scope.controlledDocumentHtmlOmissionCount, 44);
  assert.equal(scan.scope.uniqueControlledDocumentHtmlCount, 1);
  assert.equal(scan.scope.githubUriTemplateProjectionCount, 270);
  assert.equal(scan.scope.githubReleaseAssetStateProjectionCount, 10);
  assert.equal(scan.scope.githubPublicSourcePatchCount, 21);
  assert.equal(scan.scope.githubReviewedSourcePatchLiteralProjectionCount, 2);
  assert.equal(scan.verification.credentialsRetained, false);
  const sums = built.assets["SHA256SUMS.txt"].toString("utf8").trim().split("\n");
  assert.equal(sums.length, 28);
});

test("full GitHub authority privacy projection is exact and source-patch aware", async (t) => {
  const cases = [
    ["wrong user template suffix", (value) => {
      value.author.following_url = value.author.following_url.replace(
        "{/other_user}",
        "{/other_user}{/secret}",
      );
    }],
    ["wrong user template base", (value) => {
      value.author.following_url = value.author.following_url.replace(
        "/users/garaekz/",
        "/users/another/",
      );
    }],
    ["wrong reviewed contract commit", (value) => {
      value.sha = "f".repeat(40);
      value.url = `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${value.sha}`;
    }],
    ["different reviewed patch file", (value) => {
      [value.files[22], value.files[23]] = [value.files[23], value.files[22]];
    }],
    ["extra reviewed literal occurrence", (value) => {
      const prefix = ["authorization:", "Bearer"].join(" ");
      value.files[23].patch += `\n+${prefix} TOPSECRET123`;
    }],
    ["changed reviewed literal context", (value) => {
      value.files[23].patch = value.files[23].patch.replace(
        "+  run.documentHtml",
        "+  other.documentHtml",
      );
    }],
    ["changed reviewed literal", (value) => {
      value.files[23].patch = value.files[23].patch.replace(
        "TOPSECRET123",
        "TOPSECRET124",
      );
    }],
    ["credential elsewhere in patch", (value) => {
      const token = ["github", "pat", "realisticcredentialvalue1234567890"].join("_");
      value.files[23].patch += `\n+const leaked = "${token}";`;
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const fixture = await publicationFixture();
    const record = JSON.parse(fixture.inputs["invalid-v1-contract-commit.json"]);
    mutate(record);
    fixture.inputs["invalid-v1-contract-commit.json"] =
      Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    assert.throws(() => buildNavigationCausalPublication(fixture));
  });
  await t.test("release state drift", async () => {
    const fixture = await publicationFixture();
    const record = JSON.parse(fixture.inputs["invalid-v1-contract-release.json"]);
    record.assets[0].state = "open";
    fixture.inputs["invalid-v1-contract-release.json"] =
      Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    assert.throws(() => buildNavigationCausalPublication(fixture));
  });
});

test("future full-shaped H8c and S5 commit records receive the same patch privacy gate", () => {
  const user = githubUserFixture();
  for (const [name, repository] of [
    ["contract-commit.json", "oxhq/stasis-compat-bench"],
    ["workflow-source-commit.json", "oxhq/stasis"],
  ]) {
    const sha = "a".repeat(40);
    const receipt = verifyNavigationCausalGitHubAuthorityPrivacy({
      sha,
      url: `https://api.github.com/repos/${repository}/commits/${sha}`,
      author: structuredClone(user),
      committer: structuredClone(user),
      files: [{
        filename: "src/future.mjs",
        status: "added",
        sha: "b".repeat(40),
        patch: '+import value from "./public-source.mjs";',
      }],
    }, name);
    assert.equal(receipt.uriTemplateProjectionCount, 8);
    assert.equal(receipt.sourcePatchCount, 1);
  }
  const sha = "c".repeat(40);
  const credential = ["authorization:", "Bearer", "futuresecret123"].join(" ");
  assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
    sha,
    url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
    author: structuredClone(user),
    committer: structuredClone(user),
    files: [{
      filename: "src/future.mjs",
      status: "added",
      sha: "d".repeat(40),
      patch: `+const leaked = "${credential}";`,
    }],
  }, "contract-commit.json"), /credential-like text/u);
  const encodedCredential = Buffer.from(
    ["authorization:", "Bearer", "encodedfuturesecret123"].join(" "),
    "utf8",
  ).toString("base64");
  assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
    sha,
    url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
    author: structuredClone(user),
    committer: structuredClone(user),
    files: [{
      filename: "src/future.mjs",
      status: "added",
      sha: "e".repeat(40),
      patch: `+const encoded = "${encodedCredential}";`,
    }],
  }, "contract-commit.json"), /credential-like text/u);
  const nestedCredential = ["authorization:", "Bearer", "nestedfuturesecret123"].join(" ");
  const doubleEncodedCredential = Buffer.from(
    Buffer.from(nestedCredential, "utf8").toString("base64"),
    "utf8",
  ).toString("base64");
  const percentAndDoubleEncodedCredential = encodeURIComponent(doubleEncodedCredential);
  const splitOffset = Math.floor(doubleEncodedCredential.length / 2);
  const escapedOffset = 11;
  const escapedHex = doubleEncodedCredential.charCodeAt(escapedOffset)
    .toString(16).padStart(2, "0");
  const projectionMutations = [
    doubleEncodedCredential,
    percentAndDoubleEncodedCredential,
    `${doubleEncodedCredential.slice(0, escapedOffset)}%${escapedHex}${doubleEncodedCredential.slice(escapedOffset + 1)}`,
    `${doubleEncodedCredential.slice(0, escapedOffset)}\\x${escapedHex}${doubleEncodedCredential.slice(escapedOffset + 1)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}\n${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}" + "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}" /*public*/ + /*public*/ "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}" "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}" + // public\n+  "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}" // public\n+  + "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}" // public\n+  "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}" # public\n+  "${doubleEncodedCredential.slice(splitOffset)}`,
    ...["L", "u8", "u", "U", "b", "r", "br", "rb"].map((prefix) =>
      `${doubleEncodedCredential.slice(0, splitOffset)}" ${prefix}"${doubleEncodedCredential.slice(splitOffset)}`),
    `${doubleEncodedCredential.slice(0, splitOffset)}" +\n+  "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}"\n+  + "${doubleEncodedCredential.slice(splitOffset)}`,
    `${doubleEncodedCredential.slice(0, splitOffset)}")\n+  + ("${doubleEncodedCredential.slice(splitOffset)}`,
    ...[1, 2, 3].map((width) =>
      doubleEncodedCredential.replace(/=+$/u, "")
        .match(new RegExp(`.{1,${width}}`, "gu"))
        .join('" + "')),
  ];
  for (let index = 0; index < projectionMutations.length; index += 1) {
    const encoded = projectionMutations[index];
    assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
      sha,
      url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
      author: structuredClone(user),
      committer: structuredClone(user),
      files: [{
        filename: "src/future.mjs",
        status: "added",
        sha: "f".repeat(40),
        patch: `+const nested = "${encoded}";`,
      }],
    }, "contract-commit.json"), /credential-like text/u,
    `projection mutation ${index} must be rejected`);
  }
  const [authorizationLiteral, bearerLiteral, secretLiteral] = [
    "authorization:",
    " Bearer ",
    "futuresecret123",
  ].map((part) => JSON.stringify(part));
  for (const leaked of [
    [authorizationLiteral, " + ", bearerLiteral, " + ", secretLiteral].join(""),
    [
      authorizationLiteral,
      " /*public*/ + /*public*/ ",
      bearerLiteral,
      " + ",
      secretLiteral,
    ].join(""),
    [authorizationLiteral, " ", bearerLiteral, " ", secretLiteral].join(""),
    [authorizationLiteral, " + // public\n+  ", bearerLiteral, " + ", secretLiteral].join(""),
    [authorizationLiteral, " // public\n+  ", bearerLiteral, " ", secretLiteral].join(""),
    [authorizationLiteral, " # public\n+  ", bearerLiteral, " ", secretLiteral].join(""),
  ]) {
    assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
      sha,
      url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
      author: structuredClone(user),
      committer: structuredClone(user),
      files: [{
        filename: "src/future.mjs",
        status: "added",
        sha: "3".repeat(40),
        patch: `+const leaked = ${leaked};`,
      }],
    }, "contract-commit.json"), /credential-like text/u);
  }
  for (const marker of ["+", "-"]) {
    for (const indentation of ["", "  ", "\t"]) {
      assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
        sha,
        url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
        author: structuredClone(user),
        committer: structuredClone(user),
        files: [{
          filename: "src/future.mjs",
          status: "modified",
          sha: "9".repeat(40),
          patch: [
            "@@ -1,2 +1,2 @@",
            `${marker}${doubleEncodedCredential.slice(0, splitOffset)}`,
            `${marker}${indentation}${doubleEncodedCredential.slice(splitOffset)}`,
          ].join("\n"),
        }],
      }, "contract-commit.json"), /credential-like text/u);
    }
  }
  const whitespaceEncodedCredential = Buffer.from(
    ["authorization:", "Bearer", "whitespacefuturesecret123x"].join(" "),
    "utf8",
  ).toString("base64");
  assert.equal(whitespaceEncodedCredential.endsWith("="), false);
  const whitespaceSplitOffset = Math.floor(whitespaceEncodedCredential.length / 2);
  for (const indentation of ["  ", "\t"]) {
    for (const [encoded, offset] of [
      [whitespaceEncodedCredential, whitespaceSplitOffset],
      [doubleEncodedCredential, splitOffset],
    ]) {
      assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
        sha,
        url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
        author: structuredClone(user),
        committer: structuredClone(user),
        files: [{
          filename: "src/future.mjs",
          status: "added",
          sha: "7".repeat(40),
          patch: [
            "@@ -0,0 +1,4 @@",
            "+start",
            `+${indentation}${encoded.slice(0, offset)}`,
            `+${indentation}${encoded.slice(offset)}`,
            "+data:",
          ].join("\n"),
        }],
      }, "contract-commit.json"), /credential-like text/u);
    }
  }
  for (const source of [
    `const nested = "${doubleEncodedCredential.slice(0, splitOffset)}"\n  + "${doubleEncodedCredential.slice(splitOffset)}";`,
    `const nested = ("${doubleEncodedCredential.slice(0, splitOffset)}")\n  + ("${doubleEncodedCredential.slice(splitOffset)}");`,
    `const nested = "${doubleEncodedCredential.slice(0, splitOffset)}\\\n  ${doubleEncodedCredential.slice(splitOffset)}";`,
    `const nested = "${doubleEncodedCredential.slice(0, splitOffset)}\\\n\t${doubleEncodedCredential.slice(splitOffset)}";`,
  ]) {
    const addedLines = source.split("\n").map((line) => `+${line}`);
    assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
      sha,
      url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
      author: structuredClone(user),
      committer: structuredClone(user),
      files: [{
        filename: "src/future.mjs",
        status: "added",
        sha: "8".repeat(40),
        patch: [
          `@@ -0,0 +1,${addedLines.length} @@`,
          ...addedLines,
        ].join("\n"),
      }],
    }, "contract-commit.json"), /credential-like text/u);
  }
  for (const sensitive of [
    ["password", "12345678"].join("="),
    ["/home", "garae", "x"].join("/"),
  ]) {
    const encoded = Buffer.from(sensitive, "utf8").toString("base64");
    assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
      sha,
      url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
      author: structuredClone(user),
      committer: structuredClone(user),
      files: [{
        filename: "src/future.mjs",
        status: "added",
        sha: "6".repeat(40),
        patch: `+const shortEncoded = "${encoded}";`,
      }],
    }, "contract-commit.json"));
  }
  let excessiveLayers = nestedCredential;
  for (let index = 0; index < 9; index += 1) {
    excessiveLayers = Buffer.from(excessiveLayers, "utf8").toString("base64");
  }
  assert.throws(() => verifyNavigationCausalGitHubAuthorityPrivacy({
    sha,
    url: `https://api.github.com/repos/oxhq/stasis-compat-bench/commits/${sha}`,
    author: structuredClone(user),
    committer: structuredClone(user),
    files: [{
      filename: "src/future.mjs",
      status: "added",
      sha: "2".repeat(40),
      patch: `+const tooDeep = "${excessiveLayers}";`,
    }],
  }, "contract-commit.json"), /exceeds 8 decode layers/u);
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
    ["created after publication", (value) => { value.releaseRecord.created_at = "2026-09-05T02:20:01Z"; }],
    ["not after terminal", (value) => { value.releaseRecord.published_at = "2026-09-05T02:18:00Z"; }],
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
    [`${harnessApi}/commits/${navigationCausalHarnessIdentity.revision}`, jsonRoute(executionHarnessCommitRecord())],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(fixture.contractTagRefRecord)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4Release)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4TagRefRecord)],
    [`${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`, statusRoute(404)],
    [`${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`, statusRoute(422)],
    [`${harnessApi}/releases/tags/${encodeURIComponent("stasis-v0.3.3-performance-navigation-causal-evidence-v1")}`, statusRoute(404)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent("stasis-v0.3.3-performance-navigation-causal-evidence-v1")}`, statusRoute(404)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${sourceApi}/actions/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&per_page=100`, jsonRoute({ total_count: 0, workflow_runs: [] })],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${fixture.v4Release.tag_name}/crawl-phase-localization-evidence.json`, bytesRoute(fixture.inputs["v4-localization-evidence.json"])],
  ]);
  addInvalidV1Routes(routes, fixture.invalidV1);
  addInvalidV2Routes(routes, fixture.invalidV2);
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

test("credential-free pre-S6 gate binds the immutable receipt release and rechecks absence", async () => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const { routes } = preS6ReceiptRoutes(fixture, built);
  const receipt = await verifyAnonymousNavigationCausalPreflightRelease(
    {
      expectedContractTargetSha: fixture.hosted.contractCommitRecord.sha,
      expectedReceiptBytes: built.assets["anonymous-contract-preflight-v3.json"],
    },
    { fetchImpl: routedAnonymousFetch(routes) },
  );
  assert.equal(receipt.schema, navigationCausalAnonymousPreflightReleaseVerificationSchema);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.release.lightweightTagDirectToTarget, true);
  assert.equal(receipt.sourceAbsenceRecheckedAfterReceiptRelease, true);
  assert.equal(receipt.preflightReceiptReleaseLatest, false);
});

test("pre-S6 receipt release gate rejects latest, chronology, tag, bytes, and observed source", async (t) => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const cases = [
    ["receipt release is latest", (live) => {
      live.latestRelease.id = live.preflightRelease.id;
    }],
    ["receipt publication predates contract", (live) => {
      live.preflightRelease.published_at = "2026-09-05T02:10:59Z";
    }],
    ["receipt created after its own publication", (live) => {
      live.preflightRelease.created_at = "2026-09-05T02:12:01Z";
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
    ["manual dispatch appeared", (live) => {
      live.workflowRunsListing = {
        total_count: 1,
        workflow_runs: [{ id: 99_100_001, event: "workflow_dispatch" }],
      };
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const { routes } = preS6ReceiptRoutes(fixture, built, mutate);
    await assert.rejects(() => verifyAnonymousNavigationCausalPreflightRelease(
      {
        expectedContractTargetSha: fixture.hosted.contractCommitRecord.sha,
        expectedReceiptBytes: built.assets["anonymous-contract-preflight-v3.json"],
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

test("live V1 full-record replay tolerates only validated download-count movement", async () => {
  const fixture = await publicationFixture();
  const built = buildNavigationCausalPublication(fixture);
  const publicInput = publicReleaseFixture(built.assets, fixture.v4TagRefRecord);
  const target = fixture.hosted.contractCommitRecord.sha;
  const { routes } = liveEvidenceRoutes(fixture, built, publicInput, (live) => {
    live.invalidV1.contractReleaseRecord.assets[0].download_count += 7;
    live.invalidV1.preflightReleaseRecord.assets[0].download_count += 3;
  });
  const receipt = await verifyAnonymousNavigationCausalPublicRelease(
    { expectedReleaseTargetSha: target },
    { fetchImpl: routedAnonymousFetch(routes) },
  );
  assert.equal(receipt.status, "passed");
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
    ["unrelated workflow run on the source branch", (live) => {
      const extra = structuredClone(live.hosted.workflowRunsListing.workflow_runs[0]);
      extra.id += 2;
      extra.workflow_id += 1;
      extra.path = ".github/workflows/unrelated.yml";
      extra.name = "Unrelated source-branch workflow";
      live.hosted.workflowRunsListing.total_count = 2;
      live.hosted.workflowRunsListing.workflow_runs.push(extra);
    }],
    ["manual dispatch run on the source branch", (live) => {
      const extra = structuredClone(live.hosted.workflowRunsListing.workflow_runs[0]);
      extra.id += 3;
      extra.event = "workflow_dispatch";
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
      live.hosted.contractReleaseRecord.published_at = "2026-09-05T02:10:59Z";
    }],
    ["invalid V1 authority drift", (live) => {
      live.invalidV1.preflightReleaseRecord.published_at = "2026-09-04T20:41:04Z";
    }],
    ["invalid V1 download count type drift", (live) => {
      live.invalidV1.contractReleaseRecord.assets[0].download_count = -1;
    }],
    ["invalid V1 receipt drift", (live) => {
      live.invalidV1.preflightReceiptBytes[100] ^= 1;
    }],
    ["unauthorized V1 evidence release appeared", (live) => {
      live.invalidV1EvidenceReleaseStatus = 200;
    }],
    ["unauthorized V1 evidence tag appeared", (live) => {
      live.invalidV1EvidenceTagStatus = 200;
    }],
    ["preflight receipt published after run creation", (live) => {
      live.preflightRelease.published_at = "2026-09-05T02:13:00Z";
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
    "../protocol/stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v3.json",
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
  const invalidV1 = await navigationCausalInvalidV1Fixture();
  const invalidV2 = await navigationCausalInvalidV2Fixture();
  const anonymousPreflight = verifyNavigationCausalAnonymousContractPreflight({
    contractReleaseRecord: hosted.contractReleaseRecord,
    contractCommitRecord: hosted.contractCommitRecord,
    contractTagRefRecord,
    contractAssets,
    latestReleaseRecord: { id: 382000000 },
    invalidV1,
    invalidV2,
    harnessCommitRecord: executionHarnessCommitRecord(),
    absence: {
      sourceRef: { status: 404 },
      sourceCommit: { status: 422 },
      workflowRuns: { status: 200 },
      invalidV1EvidenceRelease: { status: 404 },
      invalidV1EvidenceTagRef: { status: 404 },
      evidenceRelease: { status: 404 },
      evidenceTagRef: { status: 404 },
    },
    workflowRunsListing: { total_count: 0, workflow_runs: [] },
    v4ReleaseRecord: v4Release,
    v4TagRefRecord,
    v4LocalizationBytes,
  });
  const inputRecords = {
    "anonymous-contract-preflight-v3.json": anonymousPreflight,
    "invalid-v1-contract-release.json": invalidV1.contractReleaseRecord,
    "invalid-v1-contract-commit.json": invalidV1.contractCommitRecord,
    "invalid-v1-contract-tag-ref.json": invalidV1.contractTagRefRecord,
    "invalid-v1-preflight-release.json": invalidV1.preflightReleaseRecord,
    "invalid-v1-preflight-tag-ref.json": invalidV1.preflightTagRefRecord,
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
      "stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json":
        Buffer.from(invalidV2.authorityBundleBytes),
      "stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip":
        Buffer.from(invalidV2.actionsLogsZipBytes),
      ...Object.fromEntries(Object.entries(inputRecords).map(([name, value]) => [
        name,
        Buffer.from(`${JSON.stringify(value)}\n`, "utf8"),
      ])),
      "anonymous-contract-preflight-v3.json": canonicalNavigationCausalJsonBytes(
        anonymousPreflight,
      ),
      "invalid-v1-anonymous-contract-preflight.json":
        Buffer.from(invalidV1.preflightReceiptBytes),
      "v4-localization-evidence.json": v4LocalizationBytes,
    },
    v4TagRefRecord,
    v4Release,
    contractTagRefRecord,
    contractAssets,
    invalidV1,
    invalidV2,
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
    created_at: "2026-09-05T02:19:00Z",
    published_at: "2026-09-05T02:20:00Z",
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

function preS6ReceiptRoutes(fixture, built, mutate = undefined) {
  const receiptBytes = built.assets["anonymous-contract-preflight-v3.json"];
  const target = fixture.hosted.contractCommitRecord.sha;
  const live = {
    latestRelease: { id: 382000000 },
    sourceRefStatus: 404,
    preflightTagRef: {
      ref: `refs/tags/${navigationCausalContractIdentity.preflightTag}`,
      object: { type: "commit", sha: target },
    },
    preflightRelease: fixturePreflightRelease(target, receiptBytes),
    workflowRunsListing: { total_count: 0, workflow_runs: [] },
  };
  mutate?.(live);
  const harnessApi = "https://api.github.com/repos/oxhq/stasis-compat-bench";
  const sourceApi = "https://api.github.com/repos/oxhq/stasis";
  const routes = new Map([
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(fixture.hosted.contractReleaseRecord)],
    [`${harnessApi}/commits/${target}`, jsonRoute(fixture.hosted.contractCommitRecord)],
    [`${harnessApi}/commits/${navigationCausalHarnessIdentity.revision}`, jsonRoute(executionHarnessCommitRecord())],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.tag)}`, jsonRoute(fixture.contractTagRefRecord)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4Release)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4TagRefRecord)],
    [`${harnessApi}/releases/latest`, jsonRoute(live.latestRelease)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`, jsonRoute(live.preflightRelease)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.preflightTag)}`, jsonRoute(live.preflightTagRef)],
    [`${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`, statusRoute(live.sourceRefStatus)],
    [`${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`, statusRoute(422)],
    [`${harnessApi}/releases/tags/${encodeURIComponent("stasis-v0.3.3-performance-navigation-causal-evidence-v1")}`, statusRoute(404)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent("stasis-v0.3.3-performance-navigation-causal-evidence-v1")}`, statusRoute(404)],
    [`${harnessApi}/releases/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent(navigationCausalContractIdentity.evidenceTag)}`, statusRoute(404)],
    [`${sourceApi}/actions/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&per_page=100`, jsonRoute(live.workflowRunsListing)],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${fixture.v4Release.tag_name}/crawl-phase-localization-evidence.json`, bytesRoute(fixture.inputs["v4-localization-evidence.json"])],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.preflightTag}/${navigationCausalContractIdentity.preflightAsset}`, bytesRoute(receiptBytes)],
  ]);
  addInvalidV1Routes(routes, fixture.invalidV1);
  addInvalidV2Routes(routes, fixture.invalidV2);
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
    created_at: "2026-09-05T02:10:00Z",
    published_at: "2026-09-05T02:12:00Z",
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
  const receiptBytes = built.assets["anonymous-contract-preflight-v3.json"];
  const target = fixture.hosted.contractCommitRecord.sha;
  const live = {
    latestRelease: { id: 382000000 },
    invalidV1: {
      ...fixture.invalidV1,
      contractReleaseRecord: structuredClone(fixture.invalidV1.contractReleaseRecord),
      contractCommitRecord: structuredClone(fixture.invalidV1.contractCommitRecord),
      contractTagRefRecord: structuredClone(fixture.invalidV1.contractTagRefRecord),
      preflightReleaseRecord: structuredClone(fixture.invalidV1.preflightReleaseRecord),
      preflightTagRefRecord: structuredClone(fixture.invalidV1.preflightTagRefRecord),
      contractAssets: cloneAssets(fixture.invalidV1.contractAssets),
      preflightReceiptBytes: Buffer.from(fixture.invalidV1.preflightReceiptBytes),
    },
    invalidV1EvidenceReleaseStatus: 404,
    invalidV1EvidenceTagStatus: 404,
    invalidV2: cloneInvalidV2Fixture(fixture.invalidV2),
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
    [`${harnessApi}/commits/${navigationCausalHarnessIdentity.revision}`, jsonRoute(executionHarnessCommitRecord())],
    [`${harnessApi}/releases/tags/${encodeURIComponent(fixture.v4Release.tag_name)}`, jsonRoute(fixture.v4Release)],
    [`${harnessApi}/releases/tags/${encodeURIComponent("stasis-v0.3.3-performance-navigation-causal-evidence-v1")}`, statusRoute(live.invalidV1EvidenceReleaseStatus)],
    [`${harnessApi}/git/ref/tags/${encodeURIComponent("stasis-v0.3.3-performance-navigation-causal-evidence-v1")}`, statusRoute(live.invalidV1EvidenceTagStatus)],
    [`${sourceApi}/git/ref/heads/${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}`, jsonRoute(live.sourceBranchRef)],
    [`${sourceApi}/commits/${navigationCausalWorkflowSourceIdentity.revision}`, jsonRoute(live.hosted.workflowSourceCommitRecord)],
    [`${sourceApi}/actions/runs/${runId}`, jsonRoute(live.hosted.runRecord)],
    [`${sourceApi}/actions/runs?branch=${encodeURIComponent(navigationCausalWorkflowSourceIdentity.branch)}&per_page=100`, jsonRoute(live.hosted.workflowRunsListing)],
    [`${sourceApi}/actions/runs/${runId}/jobs?filter=all&per_page=100`, jsonRoute(live.hosted.jobsListing)],
    [`${sourceApi}/actions/runs/${runId}/artifacts?per_page=100`, jsonRoute(live.hosted.artifactsListing)],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${fixture.v4Release.tag_name}/crawl-phase-localization-evidence.json`, bytesRoute(fixture.inputs["v4-localization-evidence.json"])],
    [`https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalContractIdentity.preflightTag}/${navigationCausalContractIdentity.preflightAsset}`, bytesRoute(receiptBytes)],
  ]);
  addInvalidV1Routes(routes, live.invalidV1);
  addInvalidV2Routes(routes, live.invalidV2);
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

function addInvalidV1Routes(routes, invalidV1) {
  const harnessApi = "https://api.github.com/repos/oxhq/stasis-compat-bench";
  routes.set(
    `${harnessApi}/releases/tags/${encodeURIComponent(invalidV1.contractReleaseRecord.tag_name)}`,
    jsonRoute(invalidV1.contractReleaseRecord),
  );
  routes.set(
    `${harnessApi}/commits/${invalidV1.contractCommitRecord.sha}`,
    jsonRoute(invalidV1.contractCommitRecord),
  );
  routes.set(
    `${harnessApi}/git/ref/tags/${encodeURIComponent(invalidV1.contractReleaseRecord.tag_name)}`,
    jsonRoute(invalidV1.contractTagRefRecord),
  );
  routes.set(
    `${harnessApi}/releases/tags/${encodeURIComponent(invalidV1.preflightReleaseRecord.tag_name)}`,
    jsonRoute(invalidV1.preflightReleaseRecord),
  );
  routes.set(
    `${harnessApi}/git/ref/tags/${encodeURIComponent(invalidV1.preflightReleaseRecord.tag_name)}`,
    jsonRoute(invalidV1.preflightTagRefRecord),
  );
  for (const [name, bytes] of Object.entries(invalidV1.contractAssets)) {
    routes.set(
      `https://github.com/oxhq/stasis-compat-bench/releases/download/${invalidV1.contractReleaseRecord.tag_name}/${name}`,
      bytesRoute(bytes),
    );
  }
  routes.set(
    invalidV1.preflightReleaseRecord.assets[0].browser_download_url,
    bytesRoute(invalidV1.preflightReceiptBytes),
  );
}

function addInvalidV2Routes(routes, invalidV2) {
  for (const name of [
    "contractRelease",
    "contractCommit",
    "contractTagRef",
    "preflightRelease",
    "preflightTagRef",
    "sourceBranchRef",
    "workflowSourceCommit",
    "workflowRun",
    "workflowRunsByBranch",
    "workflowRunsByHeadSha",
    "workflowJobsAllAttempts",
    "workflowArtifacts",
  ]) {
    routes.set(
      `https://api.github.com${navigationCausalV2FailureAuthorityRoutes[name]}`,
      jsonRoute(invalidV2.liveRecords[name]),
    );
  }
  routes.set(
    `https://api.github.com${navigationCausalV2FailureAuthorityRoutes.v2EvidenceRelease}`,
    statusRoute(invalidV2.evidenceReleaseStatus),
  );
  routes.set(
    `https://api.github.com${navigationCausalV2FailureAuthorityRoutes.v2EvidenceTagRef}`,
    statusRoute(invalidV2.evidenceTagRefStatus),
  );
  for (const [name, bytes] of Object.entries(invalidV2.v2ContractAssets)) {
    routes.set(
      `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalInvalidV2Evidence.contract.tag}/${name}`,
      bytesRoute(bytes),
    );
  }
  routes.set(
    `https://github.com/oxhq/stasis-compat-bench/releases/download/${navigationCausalInvalidV2Evidence.preflight.tag}/${navigationCausalInvalidV2Evidence.preflight.asset.name}`,
    bytesRoute(invalidV2.v2PreflightReceiptBytes),
  );
}

function cloneInvalidV2Fixture(invalidV2) {
  return {
    authorityBundleBytes: Buffer.from(invalidV2.authorityBundleBytes),
    actionsLogsZipBytes: Buffer.from(invalidV2.actionsLogsZipBytes),
    liveRecords: structuredClone(invalidV2.liveRecords),
    v2ContractAssets: cloneAssets(invalidV2.v2ContractAssets),
    v2PreflightReceiptBytes: Buffer.from(invalidV2.v2PreflightReceiptBytes),
    evidenceReleaseStatus: invalidV2.evidenceReleaseStatus,
    evidenceTagRefStatus: invalidV2.evidenceTagRefStatus,
  };
}

function executionHarnessCommitRecord() {
  return {
    sha: navigationCausalHarnessIdentity.revision,
    url:
      `https://api.github.com/repos/${navigationCausalHarnessIdentity.repository}/commits/${navigationCausalHarnessIdentity.revision}`,
    parents: [{ sha: navigationCausalHarnessIdentity.parentRevision }],
    commit: { tree: { sha: navigationCausalHarnessIdentity.tree } },
    files: Object.values(navigationCausalHarnessIdentity.files).map((identity) => ({
      filename: identity.path,
      status: identity.path === "test/performance-navigation-causal-environment-v3.test.mjs"
        ? "added"
        : "modified",
      sha: identity.blob,
    })),
  };
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

function githubUserFixture() {
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
