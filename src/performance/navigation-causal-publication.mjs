import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import AdmZip from "adm-zip";

import {
  assertPostSupportArtifactHtmlPrivacy,
  assertPostSupportArtifactPrivacy,
  assertPostSupportPublicSourcePatchPrivacy,
} from "../post-support/artifact-privacy.mjs";
import {
  bindNavigationCausalActionArchives,
  canonicalNavigationCausalJsonBytes,
  navigationCausalHostArtifactNames,
  parseCanonicalNavigationCausalJson,
} from "./navigation-causal-artifact-binding.mjs";
import {
  navigationCausalContractIdentity,
  navigationCausalInvalidV1Evidence,
} from "./navigation-causal-contract.mjs";
import {
  verifyNavigationCausalHostedProvenance,
} from "./navigation-causal-hosted-provenance.mjs";
import {
  inspectNavigationCausalV2FailureLogPrivacy,
  navigationCausalInvalidV2Evidence,
  navigationCausalV2FailureAuthorityRoutes,
  verifyNavigationCausalV2FailureArchive,
} from "./navigation-causal-v2-failure.mjs";
import {
  assertNavigationCausalAnonymousContractPreflightReceipt,
  verifyNavigationCausalInvalidV1PreObservationEvidence,
  verifyNavigationCausalV4SelectionEvidence,
} from "./navigation-causal-public-release.mjs";

export const navigationCausalPublicationSchema =
  "stasis-v0.3.3-performance-navigation-causal-publication-v3";
export const navigationCausalPrivacyScanSchema =
  "stasis-v0.3.3-performance-navigation-causal-privacy-scan-v3";

const githubReleaseAuthorityAssetNames = new Set([
  "contract-release.json",
  "invalid-v1-contract-release.json",
  "invalid-v1-preflight-release.json",
  "invalid-v2-contract-release.json",
  "invalid-v2-preflight-release.json",
  "v4-evidence-release.json",
]);
const githubCommitAuthorityAssetNames = new Set([
  "contract-commit.json",
  "invalid-v1-contract-commit.json",
  "invalid-v2-contract-commit.json",
  "invalid-v2-workflow-source-commit.json",
  "workflow-source-commit.json",
]);
const githubUserTemplateSuffixes = Object.freeze({
  following_url: "/following{/other_user}",
  gists_url: "/gists{/gist_id}",
  starred_url: "/starred{/owner}{/repo}",
  events_url: "/events{/privacy}",
});
const githubRepositoryTemplateSuffixes = Object.freeze({
  keys_url: "/keys{/key_id}",
  collaborators_url: "/collaborators{/collaborator}",
  issue_events_url: "/issues/events{/number}",
  assignees_url: "/assignees{/user}",
  branches_url: "/branches{/branch}",
  blobs_url: "/git/blobs{/sha}",
  git_tags_url: "/git/tags{/sha}",
  git_refs_url: "/git/refs{/sha}",
  trees_url: "/git/trees{/sha}",
  statuses_url: "/statuses/{sha}",
  commits_url: "/commits{/sha}",
  git_commits_url: "/git/commits{/sha}",
  comments_url: "/comments{/number}",
  issue_comment_url: "/issues/comments{/number}",
  contents_url: "/contents/{+path}",
  compare_url: "/compare/{base}...{head}",
  archive_url: "/{archive_format}{/ref}",
  issues_url: "/issues{/number}",
  pulls_url: "/pulls{/number}",
  milestones_url: "/milestones{/number}",
  notifications_url: "/notifications{?since,all,participating}",
  labels_url: "/labels{/name}",
  releases_url: "/releases{/id}",
});
const invalidV1ReviewedAuthorizationPrefix = ["authorization:", "Bearer"].join(" ");
const invalidV1ReviewedSourcePatchOccurrences = Object.freeze([
  Object.freeze({
    jsonPointer: "/files/23/patch",
    filename: "test/performance-navigation-causal-publication.test.mjs",
    literal: `${invalidV1ReviewedAuthorizationPrefix} must-not-be-hidden`,
    context:
      `+  run.documentHtml = "${invalidV1ReviewedAuthorizationPrefix} must-not-be-hidden";`,
  }),
  Object.freeze({
    jsonPointer: "/files/23/patch",
    filename: "test/performance-navigation-causal-publication.test.mjs",
    literal: `${invalidV1ReviewedAuthorizationPrefix} TOPSECRET123`,
    context:
      `+      '<p>${invalidV1ReviewedAuthorizationPrefix} TOPSECRET123</p></main></body>',`,
  }),
]);

export const navigationCausalInvalidV1PublicationInputNames = Object.freeze([
  "invalid-v1-contract-release.json",
  "invalid-v1-contract-commit.json",
  "invalid-v1-contract-tag-ref.json",
  "invalid-v1-preflight-release.json",
  "invalid-v1-preflight-tag-ref.json",
  "invalid-v1-anonymous-contract-preflight.json",
]);

export const navigationCausalPublicationInputNames = Object.freeze([
  "actions-navigation-causal-host-a.zip",
  "actions-navigation-causal-host-b.zip",
  "anonymous-contract-preflight-v3.json",
  ...navigationCausalInvalidV1PublicationInputNames,
  navigationCausalInvalidV2Evidence.capture.authorityAsset,
  navigationCausalInvalidV2Evidence.capture.actionsLogsAsset,
  "contract-release.json",
  "contract-commit.json",
  "workflow-run.json",
  "workflow-runs.json",
  "workflow-jobs.json",
  "workflow-artifacts.json",
  "workflow-source-commit.json",
  "v4-evidence-release.json",
  "v4-localization-evidence.json",
]);

export const navigationCausalPublicationAssetNames = Object.freeze([
  ...navigationCausalPublicationInputNames.slice(0, 2),
  "navigation-causal-host-a-raw.json",
  "navigation-causal-host-a-outcome.json",
  "navigation-causal-host-b-raw.json",
  "navigation-causal-host-b-outcome.json",
  "navigation-causal-artifact-binding.json",
  "navigation-causal-hosted-provenance.json",
  "navigation-causal-replication.json",
  ...navigationCausalPublicationInputNames.slice(2),
  "privacy-scan.json",
  "SHA256SUMS.txt",
]);

export function buildNavigationCausalPublication({ inputs, v4TagRefRecord }) {
  assertExactBytesObject(inputs, navigationCausalPublicationInputNames, "publication inputs");
  const records = {
    runRecord: parseJson(inputs["workflow-run.json"], "workflow run"),
    workflowRunsListing: parseJson(inputs["workflow-runs.json"], "workflow runs"),
    jobsListing: parseJson(inputs["workflow-jobs.json"], "workflow jobs"),
    artifactsListing: parseJson(inputs["workflow-artifacts.json"], "workflow artifacts"),
    contractReleaseRecord: parseJson(inputs["contract-release.json"], "contract release"),
    contractCommitRecord: parseJson(inputs["contract-commit.json"], "contract commit"),
    workflowSourceCommitRecord: parseJson(
      inputs["workflow-source-commit.json"],
      "workflow source commit",
    ),
  };
  const hosted = verifyNavigationCausalHostedProvenance(records);
  const invalidV1 = {
    contractReleaseRecord: parseJson(
      inputs["invalid-v1-contract-release.json"],
      "invalid V1 contract release",
    ),
    contractCommitRecord: parseJson(
      inputs["invalid-v1-contract-commit.json"],
      "invalid V1 contract commit",
    ),
    contractTagRefRecord: parseJson(
      inputs["invalid-v1-contract-tag-ref.json"],
      "invalid V1 contract tag ref",
    ),
    preflightReleaseRecord: parseJson(
      inputs["invalid-v1-preflight-release.json"],
      "invalid V1 preflight release",
    ),
    preflightTagRefRecord: parseJson(
      inputs["invalid-v1-preflight-tag-ref.json"],
      "invalid V1 preflight tag ref",
    ),
    preflightReceiptBytes: inputs["invalid-v1-anonymous-contract-preflight.json"],
  };
  verifyNavigationCausalInvalidV1PreObservationEvidence(invalidV1);
  assertNavigationCausalAnonymousContractPreflightReceipt(
    parseCanonicalNavigationCausalJson(
      inputs["anonymous-contract-preflight-v3.json"],
      "anonymous contract preflight",
    ),
    {
      contractReleaseRecord: records.contractReleaseRecord,
      contractCommitRecord: records.contractCommitRecord,
      v4ReleaseRecord: parseJson(inputs["v4-evidence-release.json"], "V4 evidence release"),
    },
  );
  verifyNavigationCausalV2FailureArchive({
    authorityBundleBytes: inputs[navigationCausalInvalidV2Evidence.capture.authorityAsset],
    actionsLogsZipBytes: inputs[navigationCausalInvalidV2Evidence.capture.actionsLogsAsset],
  });
  const archives = {
    "stasis-v0.3.3-navigation-causal-host-a-attempt-1":
      inputs["actions-navigation-causal-host-a.zip"],
    "stasis-v0.3.3-navigation-causal-host-b-attempt-1":
      inputs["actions-navigation-causal-host-b.zip"],
  };
  const binding = bindNavigationCausalActionArchives({ hostedInput: records, archives });
  verifyNavigationCausalV4SelectionEvidence(
    parseJson(inputs["v4-evidence-release.json"], "V4 evidence release"),
    v4TagRefRecord,
    inputs["v4-localization-evidence.json"],
  );
  const hostFiles = extractHostFiles(archives);
  const assets = {
    "actions-navigation-causal-host-a.zip": Buffer.from(inputs["actions-navigation-causal-host-a.zip"]),
    "actions-navigation-causal-host-b.zip": Buffer.from(inputs["actions-navigation-causal-host-b.zip"]),
    ...hostFiles,
    "navigation-causal-artifact-binding.json": canonicalNavigationCausalJsonBytes(binding),
    "navigation-causal-hosted-provenance.json": canonicalNavigationCausalJsonBytes(hosted),
    "navigation-causal-replication.json": canonicalNavigationCausalJsonBytes(binding.replication),
  };
  for (const name of navigationCausalPublicationInputNames.slice(2)) {
    assets[name] = Buffer.from(inputs[name]);
  }
  const privacyScan = createNavigationCausalPrivacyScan(assets, binding);
  assets["privacy-scan.json"] = canonicalNavigationCausalJsonBytes(privacyScan);
  assets["SHA256SUMS.txt"] = renderChecksums(assets);
  assertExactBytesObject(assets, navigationCausalPublicationAssetNames, "publication assets");
  return Object.freeze({
    schema: navigationCausalPublicationSchema,
    status: "built",
    outcome: binding.replication.status,
    evidencePublicationAuthorized: binding.replication.retainedEvidencePublicationAuthorized,
    validMeasurement: binding.replication.validMeasurement,
    assets,
  });
}

export function verifyNavigationCausalPublication({ assets, v4TagRefRecord }) {
  assertExactBytesObject(assets, navigationCausalPublicationAssetNames, "publication assets");
  const inputs = Object.fromEntries(navigationCausalPublicationInputNames.map((name) => [
    name,
    assets[name],
  ]));
  const rebuilt = buildNavigationCausalPublication({ inputs, v4TagRefRecord });
  for (const name of navigationCausalPublicationAssetNames) {
    if (!rebuilt.assets[name].equals(assets[name])) {
      throw new TypeError(`Navigation causal publication asset does not replay: ${name}`);
    }
  }
  return Object.freeze({
    schema: navigationCausalPublicationSchema,
    status: "verified",
    outcome: rebuilt.outcome,
    assetCount: navigationCausalPublicationAssetNames.length,
    evidencePublicationAuthorized: rebuilt.evidencePublicationAuthorized,
    validMeasurement: rebuilt.validMeasurement,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
}

export function verifyNavigationCausalGitHubAuthorityPrivacy(value, name) {
  const retained = [];
  assertNoDocumentHtmlKey(value, name);
  const projected = projectValidatedGitHubAuthorityForPrivacy(value, name, retained);
  assertPostSupportArtifactPrivacy(projected);
  if (retained.length !== 1) {
    throw new TypeError(`Navigation causal GitHub privacy authority type is unsupported: ${name}`);
  }
  return Object.freeze(structuredClone(retained[0]));
}

export function verifyNavigationCausalV2FailureAuthorityPrivacy(value) {
  const retained = [];
  assertNoDocumentHtmlKey(value, navigationCausalInvalidV2Evidence.capture.authorityAsset);
  const projected = projectInvalidV2FailureAuthorityForPrivacy(value, retained);
  assertPostSupportArtifactPrivacy(projected);
  if (retained.length < 1) {
    throw new TypeError("Navigation causal V2 failure authority had no validated GitHub records");
  }
  return Object.freeze(structuredClone(retained));
}

export async function buildNavigationCausalPublicationDirectory(
  inputDirectory,
  outputDirectory,
  { v4TagRefRecord },
) {
  requireAbsoluteDirectory(inputDirectory, "input");
  requireAbsoluteDirectory(outputDirectory, "output");
  if (path.resolve(inputDirectory) === path.resolve(outputDirectory)) {
    throw new TypeError("Navigation causal input and output directories must differ");
  }
  const inputs = Object.fromEntries(await Promise.all(
    navigationCausalPublicationInputNames.map(async (name) => [
      name,
      await readFile(path.join(inputDirectory, name)),
    ]),
  ));
  const built = buildNavigationCausalPublication({ inputs, v4TagRefRecord });
  await mkdir(outputDirectory, { recursive: false });
  for (const name of navigationCausalPublicationAssetNames) {
    await writeFile(path.join(outputDirectory, name), built.assets[name], { flag: "wx" });
  }
  return verifyNavigationCausalPublicationDirectory(outputDirectory, { v4TagRefRecord });
}

export async function verifyNavigationCausalPublicationDirectory(
  directory,
  { v4TagRefRecord },
) {
  requireAbsoluteDirectory(directory, "publication");
  const names = (await readdir(directory)).sort();
  if (JSON.stringify(names) !== JSON.stringify([...navigationCausalPublicationAssetNames].sort())) {
    throw new TypeError("Navigation causal publication directory inventory is not exact");
  }
  const assets = Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    await readFile(path.join(directory, name)),
  ])));
  return verifyNavigationCausalPublication({ assets, v4TagRefRecord });
}

function extractHostFiles(archives) {
  const result = {};
  for (const lane of ["host-a", "host-b"]) {
    const artifactName = `stasis-v0.3.3-navigation-causal-${lane}-attempt-1`;
    const zip = new AdmZip(archives[artifactName]);
    const names = navigationCausalHostArtifactNames[lane];
    const raw = zip.readFile(names.raw);
    const outcome = zip.readFile(names.outcome);
    if (!Buffer.isBuffer(raw) || !Buffer.isBuffer(outcome)) {
      throw new TypeError(`Navigation causal ${lane} publication payload is missing`);
    }
    result[names.raw] = Buffer.from(raw);
    result[names.outcome] = Buffer.from(outcome);
  }
  return result;
}

function createNavigationCausalPrivacyScan(assets, binding) {
  const scanned = [];
  const controlledDomIdentitiesByHost = [];
  const githubAuthorityProjections = [];
  const capturedLogArchives = [];
  for (const [name, bytes] of Object.entries(assets)) {
    if (name === navigationCausalInvalidV2Evidence.capture.actionsLogsAsset) {
      const inspected = inspectNavigationCausalV2FailureLogPrivacy(
        bytes,
        assertPostSupportPublicSourcePatchPrivacy,
      );
      capturedLogArchives.push({
        name,
        bytes: bytes.length,
        sha256: sha256(bytes),
        entryCount: inspected.entryCount,
        totalUncompressedBytes: inspected.entries.reduce(
          (total, entry) => total + entry.bytes,
          0,
        ),
      });
      continue;
    }
    if (name.endsWith(".zip")) continue;
    const value = parseJson(bytes, `privacy payload ${name}`);
    const lane = name === navigationCausalHostArtifactNames["host-a"].raw
      ? "host-a"
      : name === navigationCausalHostArtifactNames["host-b"].raw
        ? "host-b"
        : null;
    const projected = lane === null
      ? rejectUnvalidatedDocumentHtml(value, name, githubAuthorityProjections)
      : projectValidatedHostRawDocumentHtml(value, lane, controlledDomIdentitiesByHost);
    assertPostSupportArtifactPrivacy(projected);
    scanned.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const expectedHostFileIdentities = binding.hostFiles;
  for (const entry of controlledDomIdentitiesByHost) {
    const expected = entry.hostLane === "host-a"
      ? expectedHostFileIdentities.hostA.raw
      : expectedHostFileIdentities.hostB.raw;
    if (expected.name !== entry.sourceAsset ||
      expected.sha256 !== scanned.find(({ name }) => name === entry.sourceAsset)?.sha256) {
      throw new TypeError(`Navigation causal ${entry.hostLane} DOM projection was not derived from its validated raw file`);
    }
    const replicatedHost = binding.replication.hosts.find(
      ({ hostLane }) => hostLane === entry.hostLane,
    );
    if (replicatedHost?.documentHtmlSha256 !== null &&
      (entry.identities.length !== 1 ||
        entry.identities[0].sha256 !== replicatedHost.documentHtmlSha256)) {
      throw new TypeError(`Navigation causal ${entry.hostLane} controlled DOM identity changed`);
    }
  }
  const omissionCount = controlledDomIdentitiesByHost
    .reduce((total, entry) => total + entry.omissionCount, 0);
  const identities = [...new Map(controlledDomIdentitiesByHost
    .flatMap(({ identities: entries }) => entries)
    .map((entry) => [entry.sha256, entry])).values()]
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
  return {
    schema: navigationCausalPrivacyScanSchema,
    status: "passed",
    scope: {
      scannedJsonAssetCount: scanned.length,
      archiveCount: 2,
      controlledDocumentHtmlOmissionCount: omissionCount,
      uniqueControlledDocumentHtmlCount: identities.length,
      controlledDocumentHtmlIdentities: identities,
      controlledDocumentHtmlByHost: controlledDomIdentitiesByHost,
      githubAuthorityProjectionCount: githubAuthorityProjections.length,
      githubApiRouteProjectionCount: githubAuthorityProjections.reduce(
        (total, entry) => total + entry.apiRouteProjectionCount,
        0,
      ),
      githubUriTemplateProjectionCount: githubAuthorityProjections.reduce(
        (total, entry) => total + entry.uriTemplateProjectionCount,
        0,
      ),
      githubRepositoryUriTemplateProjectionCount: githubAuthorityProjections.reduce(
        (total, entry) => total + entry.repositoryUriTemplateProjectionCount,
        0,
      ),
      githubReleaseAssetStateProjectionCount: githubAuthorityProjections.reduce(
        (total, entry) => total + entry.releaseAssetStateProjectionCount,
        0,
      ),
      githubPublicSourcePatchCount: githubAuthorityProjections.reduce(
        (total, entry) => total + entry.sourcePatchCount,
        0,
      ),
      githubPublicSourcePatchBytes: githubAuthorityProjections.reduce(
        (total, entry) => total + entry.sourcePatchBytes,
        0,
      ),
      githubReviewedSourcePatchLiteralProjectionCount: githubAuthorityProjections.reduce(
        (total, entry) => total + entry.reviewedSourcePatchLiteralProjectionCount,
        0,
      ),
      githubAuthorityProjections,
      capturedLogArchiveCount: capturedLogArchives.length,
      capturedLogArchives,
    },
    scannedAssets: scanned.sort((a, b) => a.name.localeCompare(b.name)),
    verification: {
      hostPayloadsValidatedBeforeProjection: true,
      everyOmittedDocumentHtmlPrivacyScanned: true,
      documentHtmlPrivacyProjection:
        "replace_exact_public_fixture_path_literal_only_then_scan",
      onlyValidatedDocumentHtmlOmittedFromPrivacyProjection: true,
      rawGitHubAuthorityBytesRetained: true,
      onlyExactValidatedGitHubUriTemplatesProjectedForPrivacy: true,
      everyProjectedGitHubSourcePatchPrivacyScannedAndIdentityRetained: true,
      everyInvalidV2CapturedLogEntryPrivacyScanned: true,
      invalidV2CapturedLogsAnonymousLiveRefetchSupported: false,
      credentialsRetained: false,
      rawHeadersRetained: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
  };
}

function projectValidatedHostRawDocumentHtml(value, lane, retained) {
  const frozenPublicFixturePath = "/leaf/navigation";
  const privacyPathMarker = "stasis-navigation-causal-public-fixture-path";
  const projected = structuredClone(value);
  const observations = [
    ...projected.warmups,
    ...projected.pairs.flatMap(({ observations: entries }) => entries),
  ];
  const identities = new Map();
  let omissionCount = 0;
  for (const observation of observations) {
    if (observation.result === null || typeof observation.result !== "object" ||
      !Object.hasOwn(observation.result, "documentHtml")) continue;
    const documentHtml = observation.result.documentHtml;
    if (typeof documentHtml !== "string" || documentHtml.length === 0) {
      throw new TypeError(`Navigation causal ${lane} controlled DOM is invalid`);
    }
    const identity = {
      bytes: Buffer.byteLength(documentHtml, "utf8"),
      sha256: sha256(Buffer.from(documentHtml, "utf8")),
    };
    assertPostSupportArtifactHtmlPrivacy(projectExactPublicFixturePath(
      documentHtml,
      frozenPublicFixturePath,
      privacyPathMarker,
    ));
    identities.set(identity.sha256, identity);
    omissionCount += 1;
    delete observation.result.documentHtml;
  }
  assertNoDocumentHtmlKey(projected, `${lane} projected raw`);
  retained.push({
    hostLane: lane,
    sourceAsset: navigationCausalHostArtifactNames[lane].raw,
    omissionCount,
    identities: [...identities.values()].sort((left, right) =>
      left.sha256.localeCompare(right.sha256)),
  });
  return projected;
}

function projectExactPublicFixturePath(documentHtml, fixturePath, marker) {
  const token = /(^|[\s"'=>(])\/leaf\/navigation(?=$|[\s"'<)>])/gu;
  if (fixturePath !== "/leaf/navigation") {
    throw new TypeError("Navigation causal frozen public fixture path changed");
  }
  return documentHtml.replace(token, (_match, boundary) => `${boundary}${marker}`);
}

function rejectUnvalidatedDocumentHtml(value, name, githubAuthorityProjections) {
  assertNoDocumentHtmlKey(value, name);
  const projected = name === navigationCausalInvalidV2Evidence.capture.authorityAsset
    ? projectInvalidV2FailureAuthorityForPrivacy(value, githubAuthorityProjections)
    : projectValidatedGitHubAuthorityForPrivacy(
      value,
      name,
      githubAuthorityProjections,
    );
  if (name === "anonymous-contract-preflight-v3.json" ||
    name === "invalid-v1-anonymous-contract-preflight.json") {
    if (projected?.v4?.selectedJsonPointer !== "/observations/stasis/phases/poolRuns/9") {
      throw new TypeError("Navigation causal anonymous preflight JSON pointer changed");
    }
    projected.v4.selectedJsonPointer = "validated-public-v4-selection-pointer";
  }
  return projected;
}

function projectInvalidV2FailureAuthorityForPrivacy(value, retained) {
  const projected = structuredClone(value);
  if (!isDeepStrictEqual(projected.routes, navigationCausalV2FailureAuthorityRoutes)) {
    throw new TypeError("Navigation causal invalid V2 GitHub API routes changed");
  }
  const routeCount = Object.keys(projected.routes).length;
  projected.routes = Object.fromEntries(Object.keys(projected.routes).map((key) => [
    key,
    "validated-public-github-api-route",
  ]));
  retained.push({
    sourceAsset: navigationCausalInvalidV2Evidence.capture.authorityAsset,
    apiRouteProjectionCount: routeCount,
    uriTemplateProjectionCount: 0,
    repositoryUriTemplateProjectionCount: 0,
    releaseAssetStateProjectionCount: 0,
    sourcePatchCount: 0,
    sourcePatchBytes: 0,
    reviewedSourcePatchLiteralProjectionCount: 0,
    sourcePatchIdentities: [],
  });
  const mappings = [
    ["contractRelease", "invalid-v2-contract-release.json"],
    ["contractCommit", "invalid-v2-contract-commit.json"],
    ["contractTagRef", "invalid-v2-contract-tag-ref.json"],
    ["preflightRelease", "invalid-v2-preflight-release.json"],
    ["preflightTagRef", "invalid-v2-preflight-tag-ref.json"],
    ["sourceBranchRef", "invalid-v2-source-branch-ref.json"],
    ["workflowSourceCommit", "invalid-v2-workflow-source-commit.json"],
    ["workflowRun", "invalid-v2-workflow-run.json"],
    ["workflowRunsByBranch", "invalid-v2-workflow-runs-branch.json"],
    ["workflowRunsByHeadSha", "invalid-v2-workflow-runs-head-sha.json"],
    ["workflowJobsAllAttempts", "invalid-v2-workflow-jobs.json"],
    ["workflowArtifacts", "invalid-v2-workflow-artifacts.json"],
  ];
  for (const [key, virtualName] of mappings) {
    projected.records[key] = projectValidatedGitHubAuthorityForPrivacy(
      projected.records[key],
      virtualName,
      retained,
    );
  }
  if (projected.records.preflightReceipt?.v4?.selectedJsonPointer !==
    "/observations/stasis/phases/poolRuns/9") {
    throw new TypeError("Navigation causal invalid V2 preflight JSON pointer changed");
  }
  projected.records.preflightReceipt.v4.selectedJsonPointer =
    "validated-public-v4-selection-pointer";
  return projected;
}

function projectValidatedGitHubAuthorityForPrivacy(value, name, retained) {
  const isRelease = githubReleaseAuthorityAssetNames.has(name);
  const isCommit = githubCommitAuthorityAssetNames.has(name);
  const projected = structuredClone(value);
  const receipt = {
    sourceAsset: name,
    apiRouteProjectionCount: 0,
    uriTemplateProjectionCount: 0,
    releaseAssetStateProjectionCount: 0,
    sourcePatchCount: 0,
    sourcePatchBytes: 0,
    reviewedSourcePatchLiteralProjectionCount: 0,
    repositoryUriTemplateProjectionCount: 0,
    sourcePatchIdentities: [],
  };
  if (isRelease) projectGitHubReleaseForPrivacy(projected, name, receipt);
  if (isCommit) projectGitHubCommitForPrivacy(projected, name, receipt);
  projectGitHubUriTemplates(projected, name, receipt);
  if (isRelease || isCommit || receipt.uriTemplateProjectionCount > 0) {
    retained.push(receipt);
  }
  return projected;
}

function projectGitHubReleaseForPrivacy(value, name, receipt) {
  const fullRecordRequired = name === "invalid-v1-contract-release.json" ||
    name === "invalid-v1-preflight-release.json" ||
    name === "invalid-v2-contract-release.json" ||
    name === "invalid-v2-preflight-release.json";
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    !Number.isSafeInteger(value.id) || value.id < 1 || !Array.isArray(value.assets) ||
    (fullRecordRequired && value.url !==
      `https://api.github.com/repos/oxhq/stasis-compat-bench/releases/${value.id}`)) {
    throw new TypeError(`Navigation causal GitHub release privacy authority is invalid: ${name}`);
  }
  if (value.upload_url !== undefined || fullRecordRequired) {
    if (value.upload_url !==
      `https://uploads.github.com/repos/oxhq/stasis-compat-bench/releases/${value.id}/assets{?name,label}`) {
      throw new TypeError(`Navigation causal GitHub release upload URI template is invalid: ${name}`);
    }
    value.upload_url =
      `https://uploads.github.com/repos/oxhq/stasis-compat-bench/releases/${value.id}/assets/validated-template-name-label`;
    receipt.uriTemplateProjectionCount += 1;
  }
  for (const asset of value.assets) {
    if (asset === null || typeof asset !== "object" || Array.isArray(asset) ||
      (fullRecordRequired && asset.state !== "uploaded") ||
      (asset.state !== undefined && asset.state !== "uploaded")) {
      throw new TypeError(`Navigation causal GitHub release asset state is invalid: ${name}`);
    }
    if (asset.state === "uploaded") {
      delete asset.state;
      receipt.releaseAssetStateProjectionCount += 1;
    }
  }
}

function projectGitHubCommitForPrivacy(value, name, receipt) {
  const repository = name === "workflow-source-commit.json" ||
    name === "invalid-v2-workflow-source-commit.json"
    ? "oxhq/stasis"
    : "oxhq/stasis-compat-bench";
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    !/^[a-f0-9]{40}$/u.test(value.sha ?? "") ||
    value.url !== `https://api.github.com/repos/${repository}/commits/${value.sha}` ||
    !Array.isArray(value.files)) {
    throw new TypeError(`Navigation causal GitHub commit privacy authority is invalid: ${name}`);
  }
  if (name === "invalid-v1-contract-commit.json" &&
    value.sha !== navigationCausalInvalidV1Evidence.contract.targetCommitSha) {
    throw new TypeError("Navigation causal invalid V1 privacy projection commit is not exact H8b");
  }
  const reviewedPrivacyPatches = name === "invalid-v1-contract-commit.json"
    ? reviewInvalidV1SourcePatchOccurrences(value.files)
    : new Map();
  for (let fileIndex = 0; fileIndex < value.files.length; fileIndex += 1) {
    const file = value.files[fileIndex];
    if (file === null || typeof file !== "object" || Array.isArray(file) ||
      typeof file.filename !== "string" || file.filename.length === 0 ||
      typeof file.status !== "string" || !/^[a-f0-9]{40}$/u.test(file.sha ?? "")) {
      throw new TypeError(`Navigation causal GitHub commit file is invalid: ${name}`);
    }
    if (!Object.hasOwn(file, "patch")) continue;
    if (typeof file.patch !== "string" || file.patch.length === 0) {
      throw new TypeError(`Navigation causal GitHub source patch is invalid: ${name}`);
    }
    const patch = file.patch;
    const privacyPatch = reviewedPrivacyPatches.get(fileIndex) ?? patch;
    assertPostSupportPublicSourcePatchPrivacy(privacyPatch);
    const identity = {
      filename: file.filename,
      bytes: Buffer.byteLength(patch, "utf8"),
      sha256: sha256(Buffer.from(patch, "utf8")),
    };
    receipt.sourcePatchCount += 1;
    receipt.sourcePatchBytes += identity.bytes;
    receipt.sourcePatchIdentities.push(identity);
    file.patch = {
      sourcePatchPrivacyScanned: true,
      bytes: identity.bytes,
      sha256: identity.sha256,
    };
  }
  receipt.reviewedSourcePatchLiteralProjectionCount = reviewedPrivacyPatches.size === 0
    ? 0
    : invalidV1ReviewedSourcePatchOccurrences.length;
  receipt.sourcePatchIdentities.sort((left, right) =>
    left.filename.localeCompare(right.filename));
}

function reviewInvalidV1SourcePatchOccurrences(files) {
  const result = new Map();
  for (const reviewed of invalidV1ReviewedSourcePatchOccurrences) {
    const pointerMatch = /^\/files\/([0-9]+)\/patch$/u.exec(reviewed.jsonPointer);
    const fileIndex = Number(pointerMatch?.[1]);
    const file = files[fileIndex];
    if (!Number.isSafeInteger(fileIndex) || file?.filename !== reviewed.filename ||
      typeof file.patch !== "string" ||
      countOccurrences(file.patch, reviewed.context) !== 1 ||
      countOccurrences(
        files.map((entry) => typeof entry.patch === "string" ? entry.patch : "").join("\n"),
        reviewed.literal,
      ) !== 1) {
      throw new TypeError(
        `Navigation causal invalid V1 reviewed source patch occurrence changed: ${reviewed.jsonPointer}`,
      );
    }
    const current = result.get(fileIndex) ?? file.patch;
    result.set(fileIndex, current.replace(
      reviewed.context,
      reviewed.context.replace(
        reviewed.literal,
        "reviewed-public-h8b-privacy-regression-literal",
      ),
    ));
  }
  return result;
}

function countOccurrences(value, needle) {
  let count = 0;
  for (let offset = 0; offset <= value.length - needle.length;) {
    const found = value.indexOf(needle, offset);
    if (found === -1) break;
    count += 1;
    offset = found + 1;
  }
  return count;
}

function projectGitHubUriTemplates(value, name, receipt) {
  const pending = [value];
  const seen = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (!Array.isArray(current) && Object.hasOwn(current, "login") &&
      Object.keys(githubUserTemplateSuffixes).some(
        (key) => Object.hasOwn(current, key),
      )) {
      projectOneGitHubUser(current, name, receipt);
    }
    if (!Array.isArray(current) && Object.hasOwn(current, "full_name") &&
      Object.keys(githubRepositoryTemplateSuffixes).some(
        (key) => Object.hasOwn(current, key),
      )) {
      projectOneGitHubRepository(current, name, receipt);
    }
    for (const item of Object.values(current)) pending.push(item);
  }
}

function projectOneGitHubRepository(value, name, receipt) {
  if (typeof value.full_name !== "string" ||
    !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u.test(value.full_name) ||
    !Number.isSafeInteger(value.id) || value.id < 1) {
    throw new TypeError(`Navigation causal GitHub repository identity is invalid: ${name}`);
  }
  const base = `https://api.github.com/repos/${value.full_name}`;
  if (value.url !== base) {
    throw new TypeError(`Navigation causal GitHub repository API URL is invalid: ${name}`);
  }
  for (const [key, suffix] of Object.entries(githubRepositoryTemplateSuffixes)) {
    if (value[key] !== `${base}${suffix}`) {
      throw new TypeError(
        `Navigation causal GitHub repository URI template is invalid: ${name}:${key}`,
      );
    }
    value[key] = `${base}/${key.replace(/_url$/u, "")}/validated-uri-template`;
    receipt.uriTemplateProjectionCount += 1;
    receipt.repositoryUriTemplateProjectionCount += 1;
  }
}

function projectOneGitHubUser(value, name, receipt) {
  if (typeof value.login !== "string" || !/^[A-Za-z0-9-]{1,39}$/u.test(value.login) ||
    !Number.isSafeInteger(value.id) || value.id < 1) {
    throw new TypeError(`Navigation causal GitHub user identity is invalid: ${name}`);
  }
  const base = `https://api.github.com/users/${value.login}`;
  if (value.url !== base) {
    throw new TypeError(`Navigation causal GitHub user API URL is invalid: ${name}`);
  }
  for (const [key, suffix] of Object.entries(githubUserTemplateSuffixes)) {
    if (value[key] !== `${base}${suffix}`) {
      throw new TypeError(`Navigation causal GitHub user URI template is invalid: ${name}:${key}`);
    }
    value[key] = `${base}/${key.replace(/_url$/u, "")}/validated-uri-template`;
    receipt.uriTemplateProjectionCount += 1;
  }
}

function assertNoDocumentHtmlKey(value, label) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    for (const [key, item] of Object.entries(current)) {
      if (key === "documentHtml") {
        throw new TypeError(`Navigation causal unvalidated documentHtml appears in ${label}`);
      }
      pending.push(item);
    }
  }
}

function renderChecksums(assets) {
  return Buffer.from(Object.keys(assets).sort().map((name) =>
    `${sha256(assets[name])}  ${name}\n`).join(""), "utf8");
}

function parseJson(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new TypeError(`${label} is empty`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new TypeError(`${label} is not JSON`, { cause: error });
  }
}

function assertExactBytesObject(value, names, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...names].sort()) ||
    Object.values(value).some((bytes) => !Buffer.isBuffer(bytes) || bytes.length === 0)) {
    throw new TypeError(`Navigation causal ${label} inventory is invalid`);
  }
}

function requireAbsoluteDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`Navigation causal ${label} directory must be absolute`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export const navigationCausalEvidenceReleaseIdentity = Object.freeze({
  repository: "oxhq/stasis-compat-bench",
  tag: navigationCausalContractIdentity.evidenceTag,
  contractTag: navigationCausalContractIdentity.tag,
  assetCount: navigationCausalPublicationAssetNames.length,
});
