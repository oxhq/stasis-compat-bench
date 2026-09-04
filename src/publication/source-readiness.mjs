const revisionPattern = /^[a-f0-9]{40}$/u;

export function requirePublicPublicationSource({
  canonicalPublicRemoteConfigured,
  projection,
}) {
  if (projection?.schema !== "stasis-compat-public-projection-verification-v1") {
    throw new Error("Publication build requires one verified public projection");
  }
  const requiredTrue = [
    "authorChoiceSelected",
    "headWorktreeIdentityVerified",
    "licenseBytesMatchChoice",
    "licenseChoiceSelected",
    "metadataChoicesComplete",
    "pathProjectionReceiptVerified",
    "rootAuthorMatchesChoice",
    "rootCommitterMatchesChoice",
    "sourceExclusionsAbsent",
    "sourceHistoryExcluded",
  ];
  const failedTrue = requiredTrue.filter((field) => projection[field] !== true);
  const requiredFalse = ["freshProjectionRequired", "freshRootCommitRequired"];
  const failedFalse = requiredFalse.filter((field) => projection[field] !== false);
  if (
    projection.status !== "passed" ||
    projection.rawHeadParentCount !== 0 ||
    projection.sourceHistoryCommitCount !== 1 ||
    projection.sourceExcludedFileCount !== 0 ||
    failedTrue.length > 0 ||
    failedFalse.length > 0
  ) {
    throw new Error(
      `Publication build requires one ready parentless public root: ${JSON.stringify({
        failedFalse,
        failedTrue,
        rawHeadParentCount: projection.rawHeadParentCount,
        sourceExcludedFileCount: projection.sourceExcludedFileCount,
        sourceHistoryCommitCount: projection.sourceHistoryCommitCount,
        status: projection.status,
      })}`,
    );
  }
  if (canonicalPublicRemoteConfigured !== true) {
    throw new Error("Publication build requires canonical origin fetch and push URLs");
  }
  if (!revisionPattern.test(projection.headRevision ?? "")) {
    throw new Error("Publication build could not resolve one exact public root revision");
  }
  return projection.headRevision;
}
