import assert from "node:assert/strict";
import test from "node:test";

import { requirePublicPublicationSource } from "../src/publication/source-readiness.mjs";

const revision = "a".repeat(40);

test("publication source readiness accepts only one complete canonical public root", () => {
  assert.equal(
    requirePublicPublicationSource({
      canonicalPublicRemoteConfigured: true,
      projection: readyProjection(),
    }),
    revision,
  );
});

test("publication source readiness rejects private history, exclusions, metadata gaps, and remotes", () => {
  const cases = [
    ["history", (value) => { value.sourceHistoryCommitCount = 30; }, /parentless public root/u],
    ["parent", (value) => { value.rawHeadParentCount = 1; }, /parentless public root/u],
    ["excluded", (value) => { value.sourceExclusionsAbsent = false; }, /parentless public root/u],
    ["metadata", (value) => { value.metadataChoicesComplete = false; }, /parentless public root/u],
    ["author", (value) => { value.rootAuthorMatchesChoice = false; }, /parentless public root/u],
    ["license", (value) => { value.licenseBytesMatchChoice = false; }, /parentless public root/u],
    ["worktree", (value) => { value.headWorktreeIdentityVerified = false; }, /parentless public root/u],
    ["fresh", (value) => { value.freshProjectionRequired = true; }, /parentless public root/u],
    ["revision", (value) => { value.headRevision = "not-a-revision"; }, /exact public root revision/u],
  ];
  for (const [label, mutate, expected] of cases) {
    const projection = readyProjection();
    mutate(projection);
    assert.throws(
      () => requirePublicPublicationSource({
        canonicalPublicRemoteConfigured: true,
        projection,
      }),
      expected,
      label,
    );
  }
  assert.throws(
    () => requirePublicPublicationSource({
      canonicalPublicRemoteConfigured: false,
      projection: readyProjection(),
    }),
    /canonical origin fetch and push URLs/u,
  );
});

function readyProjection() {
  return {
    schema: "stasis-compat-public-projection-verification-v1",
    status: "passed",
    headRevision: revision,
    authorChoiceSelected: true,
    headWorktreeIdentityVerified: true,
    licenseBytesMatchChoice: true,
    licenseChoiceSelected: true,
    metadataChoicesComplete: true,
    pathProjectionReceiptVerified: true,
    rootAuthorMatchesChoice: true,
    rootCommitterMatchesChoice: true,
    sourceExclusionsAbsent: true,
    sourceHistoryExcluded: true,
    freshProjectionRequired: false,
    freshRootCommitRequired: false,
    rawHeadParentCount: 0,
    sourceExcludedFileCount: 0,
    sourceHistoryCommitCount: 1,
  };
}
