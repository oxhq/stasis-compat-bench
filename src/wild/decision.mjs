import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  assertExactFileInventory,
  listRegularFiles,
  sha256DirectoryTree,
} from "../shared/io.mjs";
import {
  immutablePlainJsonSnapshot,
  snapshotOwnDataReferences,
} from "../shared/immutable-json.mjs";
import { candidate, protocol } from "./config.mjs";
import { assertVerifiedWildResultProvenance } from "./result-verifier.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const deterministicArtifactIndexSha256 =
  "3eeb21118b93889cd75495e85d177fbb1395c6fb9f0988e32a32ad33e74287d2";
const deterministicHarnessCommit = "56175c97aad270063494c4c6bcf606a131d7dc48";
const rwaArtifactIndexSha256 =
  "470233284fe59e80b33dbc156dc1cefaa6858f6e4ad13cd8426a69edab2b4a4d";
const loadedEvidenceProvenance = new WeakMap();
const exactTreeReasons = new Set([
  "cross_event_loop_document",
  "cross_event_loop_navigation",
]);
const exactTreeTimeSurfaces = new Set([
  "cross_event_loop_iframe",
  "cross_event_loop_navigation",
  "same_event_loop_iframe",
]);
const externalEvidenceEnvironment = Object.freeze({
  crossTrackReviewPath: "STASIS_CROSS_TRACK_REVIEW",
  minimizerEvidencePath: "STASIS_TREE_MINIMIZER_EVIDENCE",
  deterministicIndexPath: "STASIS_DETERMINISTIC_ARTIFACT_INDEX",
  rwaIndexPath: "STASIS_RWA_ARTIFACT_INDEX",
  strategicReviewPath: "STASIS_TREE_STRATEGIC_REVIEW",
});

export async function loadDecisionEvidence({
  crossTrackReviewPath = process.env[externalEvidenceEnvironment.crossTrackReviewPath],
  minimizerEvidencePath = process.env[externalEvidenceEnvironment.minimizerEvidencePath],
  deterministicIndexPath = process.env[externalEvidenceEnvironment.deterministicIndexPath],
  rwaIndexPath = process.env[externalEvidenceEnvironment.rwaIndexPath],
  strategicReviewPath = process.env[externalEvidenceEnvironment.strategicReviewPath],
} = {}) {
  const [crossTrackReview, minimizerEvidence, deterministicEvidence, strategicEvidence, rwaEvidence] = await Promise.all([
    loadOptionalCanonicalEvidence(crossTrackReviewPath),
    loadOptionalMinimizerEvidence(minimizerEvidencePath),
    loadOptionalDeterministicEvidence(deterministicIndexPath),
    loadOptionalCanonicalEvidence(strategicReviewPath),
    loadOptionalRwaEvidence(rwaIndexPath),
  ]);
  const criterion5 = crossTrackReview === null ? null : brandLoadedEvidence({
    ...crossTrackReview,
    deterministicArtifactIndexSha256: deterministicEvidence?.sha256 ?? null,
    rwaArtifactIndexSha256: rwaEvidence?.sha256 ?? null,
    trackReferencesVerified:
      deterministicEvidence?.sha256 === deterministicArtifactIndexSha256 &&
      deterministicEvidence.referencesVerified === true &&
      rwaEvidence?.sha256 === rwaArtifactIndexSha256 &&
      rwaEvidence.referencesVerified === true,
  }, "criterion5");
  const criterion6 = brandLoadedEvidence(minimizerEvidence, "criterion6");
  const criterion7 = brandLoadedEvidence(deterministicEvidence, "criterion7");
  const criterion8 = brandLoadedEvidence(strategicEvidence, "criterion8");
  return Object.freeze({ criterion5, criterion6, criterion7, criterion8 });
}

export function evaluateContextTreeDecision(verifiedWild, evidence = {}) {
  const { authoritativePostflight, snapshot: decisionWild } = snapshotDecisionWild(verifiedWild);
  const evidenceSnapshot = snapshotOwnDataReferences(
    evidence,
    ["criterion5", "criterion6", "criterion7", "criterion8"],
    "context-tree decision evidence",
  );
  const facts = deriveWildDecisionFacts(decisionWild);
  const external = {
    criterion5: validateCrossTrackEvidence(evidenceSnapshot.criterion5, decisionWild),
    criterion6: validateMinimizerEvidence(evidenceSnapshot.criterion6, decisionWild),
    criterion7: validateDeterministicEvidence(evidenceSnapshot.criterion7),
    criterion8: validateStrategicEvidence(evidenceSnapshot.criterion8, decisionWild),
  };
  const criteria = {
    criterion1: criterion(
      authoritativePostflight && facts.treeCases.every(hasExactTreeProvenance),
      "authoritative_postflight_and_all_counted_tree_cases_have_exact_provenance",
      "wild_result_lacks_authoritative_postflight_or_exact_tree_provenance",
    ),
    criterion2: criterion(
      facts.treeCount >= 10 &&
        10 * facts.treeCount >= facts.validPairedDenominator &&
        facts.distinctTreeSiteCount === facts.treeCount &&
        facts.treeStrata.length >= 3,
      "tree_meets_manifestation_site_and_stratum_thresholds",
      "tree_misses_manifestation_site_or_three_strata_threshold",
    ),
    criterion3: criterion(
      facts.diagnosedOrganicBlockerCount > 0 &&
        10 * facts.treeCount >= 3 * facts.diagnosedOrganicBlockerCount,
      "tree_is_at_least_thirty_percent_of_diagnosed_organic_blockers",
      "tree_is_below_thirty_percent_or_has_no_diagnosed_denominator",
    ),
    criterion4: criterion(
      facts.treeCount > facts.runnerUpCount &&
        (facts.runnerUpCount === 0 ||
          2 * facts.treeCount >= 3 * facts.runnerUpCount ||
          10 * (facts.treeCount - facts.runnerUpCount) >= facts.diagnosedOrganicBlockerCount),
      "tree_is_largest_and_meets_the_ratio_or_share_lead",
      "tree_is_not_the_unique_leader_or_misses_the_required_lead",
    ),
    criterion5: external.criterion5,
    criterion6: external.criterion6,
    criterion7: external.criterion7,
    criterion8: external.criterion8,
  };
  const passed = Object.values(criteria).every((item) => item.passed);
  return {
    schema: "stasis-0.4-context-tree-decision-v1",
    protocol,
    resultRoot: {
      artifactIndexSha256: decisionWild.artifactIndexSha256,
    },
    verdict: passed ? "GO_CONTEXT_TREE_0_4" : "STAY_0_4_UNASSIGNED",
    metrics: {
      validPairedDenominator: facts.validPairedDenominator,
      diagnosedOrganicBlockerCount: facts.diagnosedOrganicBlockerCount,
      treeCount: facts.treeCount,
      treeThreshold: facts.treeThreshold,
      distinctTreeSiteCount: facts.distinctTreeSiteCount,
      treeStrata: facts.treeStrata,
      runnerUpCount: facts.runnerUpCount,
      runnerUpFamilies: facts.runnerUpFamilies,
      treeShare: facts.treeShare,
      leadShare: facts.leadShare,
      blockerCounts: facts.blockerCounts,
    },
    criteria,
    evidenceRoots: {
      criterion5: evidenceSnapshot.criterion5?.sha256 ?? null,
      criterion6: evidenceSnapshot.criterion6?.sha256 ?? null,
      criterion7: evidenceSnapshot.criterion7?.sha256 ?? null,
      criterion8: evidenceSnapshot.criterion8?.sha256 ?? null,
    },
  };
}

function snapshotDecisionWild(value) {
  try {
    return {
      authoritativePostflight: true,
      snapshot: assertVerifiedWildResultProvenance(value),
    };
  } catch {
    return {
      authoritativePostflight: false,
      snapshot: immutablePlainJsonSnapshot(value, "untrusted wild decision input"),
    };
  }
}

function deriveWildDecisionFacts(verified) {
  if (
    typeof verified !== "object" ||
    verified === null ||
    verified.schema !== "stasis-wild-verified-result-v1" ||
    verified.protocol !== protocol ||
    !sha256Pattern.test(verified.artifactIndexSha256 ?? "") ||
    verified.identity?.stasisRevision !== candidate.revision ||
    verified.identity?.stasisVersion !== candidate.version ||
    verified.identity?.stasisProfile !== candidate.profile ||
    verified.identity?.stasisExecutableSha256 !== candidate.executableSha256 ||
    verified.identity?.stasisSdkArchiveSha256 !== candidate.sdkSha256 ||
    !Array.isArray(verified.cases) ||
    typeof verified.summary !== "object" ||
    verified.summary === null
  ) {
    throw new Error("Context-tree decision requires one verified exact-candidate wild result");
  }

  const blockerCounts = {};
  let validPairedDenominator = 0;
  let diagnosedOrganicBlockerCount = 0;
  const treeCases = [];
  const treeSites = new Set();
  const treeStrata = new Set();
  for (const item of verified.cases) {
    const classification = item?.classification;
    if (typeof classification !== "object" || classification === null) {
      throw new Error("Verified wild result contains a missing classification");
    }
    if (!["BASELINE_FAILURE", "BENCHMARK_INVALID"].includes(classification.primary)) {
      validPairedDenominator += 1;
    }
    if (classification.eligibleForOrganicBlockerCensus === true) {
      diagnosedOrganicBlockerCount += 1;
      const family = classification.blockerFamily ?? "unclassified";
      blockerCounts[family] = (blockerCounts[family] ?? 0) + 1;
      if (family === "browsing_context_tree") {
        treeCases.push(item);
        treeSites.add(new URL(item.entry.requestedUrl).origin);
        treeStrata.add(item.entry.stratumId);
      }
    }
  }
  if (
    verified.summary.selectedCount !== verified.cases.length ||
    verified.summary.validPairedDenominator !== validPairedDenominator ||
    verified.summary.diagnosedOrganicBlockerCount !== diagnosedOrganicBlockerCount ||
    !isDeepStrictEqual(verified.summary.organicBlockerCounts, blockerCounts)
  ) {
    throw new Error("Verified wild result and its mechanical decision facts disagree");
  }

  const treeCount = blockerCounts.browsing_context_tree ?? 0;
  const runnerUpCount = Math.max(
    0,
    ...Object.entries(blockerCounts)
      .filter(([family]) => family !== "browsing_context_tree")
      .map(([, count]) => count),
  );
  const runnerUpFamilies = Object.entries(blockerCounts)
    .filter(([family, count]) => family !== "browsing_context_tree" && count === runnerUpCount && count > 0)
    .map(([family]) => family)
    .sort();
  return {
    validPairedDenominator,
    diagnosedOrganicBlockerCount,
    treeCount,
    treeThreshold: Math.max(10, Math.ceil(validPairedDenominator / 10)),
    distinctTreeSiteCount: treeSites.size,
    treeStrata: [...treeStrata].sort(),
    runnerUpCount,
    runnerUpFamilies,
    treeShare: diagnosedOrganicBlockerCount === 0 ? 0 : treeCount / diagnosedOrganicBlockerCount,
    leadShare: diagnosedOrganicBlockerCount === 0
      ? 0
      : (treeCount - runnerUpCount) / diagnosedOrganicBlockerCount,
    blockerCounts,
    treeCases,
  };
}

function hasExactTreeProvenance(item) {
  const classification = item.classification;
  const terminal = classification.firstTerminal;
  const unsupported = terminal?.unsupportedWork;
  return (
    classification.blockerFamily === "browsing_context_tree" &&
    classification.eligibleForOrganicBlockerCensus === true &&
    ["source_diagnosed", "typed"].includes(classification.diagnosisConfidence) &&
    (
      exactTreeReasons.has(classification.reason) ||
      exactTreeReasons.has(terminal?.code) ||
      exactTreeReasons.has(unsupported?.reason) ||
      exactTreeTimeSurfaces.has(terminal?.typedSurface) ||
      exactTreeTimeSurfaces.has(unsupported?.timeSurface)
    )
  );
}

function validateCrossTrackEvidence(wrapper, verifiedWild) {
  if (!validCrossTrackWrapper(wrapper)) return missingOrInvalid(wrapper, "cross_track_review");
  const value = wrapper.value;
  if (!hasExactKeys(value, [
    "candidate",
    "decision",
    "protocol",
    "schema",
    "tracks",
    "wildArtifactIndexSha256",
  ]) ||
    value.schema !== "stasis-0.4-cross-track-review-v1" ||
    value.protocol !== protocol ||
    value.wildArtifactIndexSha256 !== verifiedWild.artifactIndexSha256 ||
    !validEvidenceCandidate(value.candidate) ||
    value.decision !== "no_conflicting_material_leader" ||
    wrapper.trackReferencesVerified !== true ||
    wrapper.deterministicArtifactIndexSha256 !== deterministicArtifactIndexSha256 ||
    wrapper.rwaArtifactIndexSha256 !== rwaArtifactIndexSha256 ||
    !Array.isArray(value.tracks) ||
    value.tracks.length !== 2
  ) {
    return failed("cross_track_review_is_invalid_or_not_bound_to_this_result");
  }
  const expected = [
    ["deterministic", "regression_only_no_prevalence_claim", deterministicArtifactIndexSha256],
    ["rwa", "no_material_conflicting_leader", rwaArtifactIndexSha256],
  ];
  const actual = [...value.tracks].sort((left, right) => String(left?.track).localeCompare(String(right?.track)));
  const valid = actual.every((item, index) =>
    hasExactKeys(item, ["artifactIndexSha256", "assessment", "track"]) &&
    item.track === expected[index][0] &&
    item.assessment === expected[index][1] &&
    item.artifactIndexSha256 === expected[index][2]
  );
  return valid
    ? passed("hash_backed_cross_track_review_finds_no_conflicting_material_leader")
    : failed("cross_track_review_does_not_cover_rwa_and_deterministic_separately");
}

function validateMinimizerEvidence(wrapper, verifiedWild) {
  if (!validMinimizerWrapper(wrapper)) return missingOrInvalid(wrapper, "tree_minimizer_evidence");
  const value = wrapper.value;
  if (!hasExactKeys(value, [
    "candidate",
    "cases",
    "protocol",
    "schema",
    "wildArtifactIndexSha256",
  ]) ||
    value.schema !== "stasis-0.4-tree-minimizers-v1" ||
    value.protocol !== protocol ||
    value.wildArtifactIndexSha256 !== verifiedWild.artifactIndexSha256 ||
    !validEvidenceCandidate(value.candidate) ||
    !Array.isArray(value.cases) ||
    value.cases.length < 2 ||
    wrapper.referencesVerified !== true ||
    !Array.isArray(wrapper.caseArtifacts) ||
    wrapper.caseArtifacts.length !== value.cases.length
  ) {
    return failed("tree_minimizer_evidence_is_invalid_or_not_bound_to_this_result");
  }
  return failed("runner_backed_tree_minimizer_transcript_validation_is_not_implemented");
}

function validateDeterministicEvidence(wrapper) {
  if (!validDeterministicWrapper(wrapper)) return missingOrInvalid(wrapper, "deterministic_evidence");
  const value = wrapper.value;
  const expectedPaths = [
    "stasis-post-0.3-census-v1/deterministic/compatibility.json",
    "stasis-post-0.3-census-v1/deterministic/playwright-raw.json",
    "stasis-post-0.3-census-v1/deterministic/report.md",
    "stasis-post-0.3-census-v1/deterministic/stasis-raw.json",
  ];
  const valid = hasExactKeys(value, [
    "candidate",
    "files",
    "harnessCommit",
    "protocol",
    "result",
    "schema",
  ]) &&
    value.schema === "stasis-post-0.3-deterministic-artifact-index-v1" &&
    value.protocol === protocol &&
    wrapper.sha256 === deterministicArtifactIndexSha256 &&
    value.harnessCommit === deterministicHarnessCommit &&
    hasExactKeys(value.candidate, [
      "executableSha256",
      "profile",
      "sdkArchiveSha256",
      "sourceRevision",
    ]) &&
    value.candidate.sourceRevision === candidate.revision &&
    value.candidate.executableSha256 === candidate.executableSha256 &&
    value.candidate.sdkArchiveSha256 === candidate.sdkSha256 &&
    value.candidate.profile === candidate.profile &&
    hasExactKeys(value.result, [
      "baselineValid",
      "candidateValid",
      "counts",
      "designedControlsExcludedFromPrevalence",
      "primaryDenominator",
      "scheduledUrlJaccard",
    ]) &&
    value.result.baselineValid === true &&
    value.result.candidateValid === true &&
    value.result.primaryDenominator === 20 &&
    isDeepStrictEqual(value.result.counts, { PASS_EQUIVALENT: 20 }) &&
    value.result.scheduledUrlJaccard === 1 &&
    value.result.designedControlsExcludedFromPrevalence === true &&
    Array.isArray(value.files) &&
    value.files.length === expectedPaths.length &&
    value.files.every((item, index) =>
      hasExactKeys(item, ["bytes", "path", "sha256"]) &&
      item.path === expectedPaths[index] &&
      Number.isSafeInteger(item.bytes) && item.bytes >= 0 &&
      sha256Pattern.test(item.sha256 ?? "")
    );
  return valid
    ? passed("exact_candidate_deterministic_primary_is_20_of_20_equivalent")
    : failed("deterministic_evidence_is_not_the_exact_green_twenty_page_artifact");
}

function validateStrategicEvidence(wrapper, verifiedWild) {
  if (!validBasicWrapper(wrapper)) return missingOrInvalid(wrapper, "strategic_review");
  const value = wrapper.value;
  const valid = hasExactKeys(value, [
    "candidate",
    "decision",
    "protocol",
    "schema",
    "wildArtifactIndexSha256",
    "winningBoundary",
  ]) &&
    value.schema === "stasis-0.4-strategic-review-v1" &&
    value.protocol === protocol &&
    value.wildArtifactIndexSha256 === verifiedWild.artifactIndexSha256 &&
    validEvidenceCandidate(value.candidate) &&
    value.winningBoundary === "browsing_context_tree" &&
    value.decision === "tree_strategically_eligible_for_0_4";
  return valid
    ? passed("hash_backed_review_keeps_the_winning_tree_boundary_strategically_eligible")
    : failed("strategic_review_is_absent_invalid_or_excludes_the_tree_boundary");
}

function validEvidenceCandidate(value) {
  return hasExactKeys(value, [
    "executableSha256",
    "profile",
    "revision",
    "sdkArchiveSha256",
    "version",
  ]) &&
    value.revision === candidate.revision &&
    value.version === candidate.version &&
    value.profile === candidate.profile &&
    value.executableSha256 === candidate.executableSha256 &&
    value.sdkArchiveSha256 === candidate.sdkSha256;
}

async function loadOptionalCanonicalEvidence(filePath) {
  if (filePath === undefined || filePath === null || filePath === "") return null;
  return readCanonicalEvidenceFile(filePath);
}

async function loadOptionalMinimizerEvidence(filePath) {
  if (filePath === undefined || filePath === null || filePath === "") return null;
  const wrapper = await readCanonicalEvidenceFile(filePath);
  const references = await verifyMinimizerReferences(filePath, wrapper.value);
  wrapper.referencesVerified = references.verified;
  wrapper.caseArtifacts = references.caseArtifacts;
  return wrapper;
}

async function loadOptionalDeterministicEvidence(filePath) {
  if (filePath === undefined || filePath === null || filePath === "") return null;
  const wrapper = await readCanonicalEvidenceFile(filePath);
  wrapper.referencesVerified = await verifyDeterministicReferences(filePath, wrapper.value);
  return wrapper;
}

async function loadOptionalRwaEvidence(filePath) {
  if (filePath === undefined || filePath === null || filePath === "") return null;
  const wrapper = await readCanonicalEvidenceFile(filePath);
  wrapper.referencesVerified = await verifyRwaReferences(filePath, wrapper);
  return wrapper;
}

async function readCanonicalEvidenceFile(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error("Decision evidence paths must be explicit absolute file paths");
  }
  const target = path.resolve(filePath);
  const metadata = await lstat(target);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(target), target)) {
    throw new Error(`Decision evidence is not one real regular file: ${target}`);
  }
  const bytes = await readFile(target);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Decision evidence is not valid JSON: ${target}`);
  }
  const snapshot = immutablePlainJsonSnapshot(value, `decision evidence ${target}`);
  const canonical = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  if (!bytes.equals(canonical)) {
    throw new Error(`Decision evidence is not canonical JSON: ${target}`);
  }
  return { sha256: sha256(bytes), value: snapshot };
}

async function verifyDeterministicReferences(indexPath, value) {
  try {
    const indexBytes = await readFile(path.resolve(indexPath));
    if (
      sha256(indexBytes) !== deterministicArtifactIndexSha256 ||
      value?.harnessCommit !== deterministicHarnessCommit ||
      !Array.isArray(value?.files)
    ) return false;
    const root = path.dirname(path.resolve(indexPath));
    const expectedInventory = [path.basename(indexPath), ...value.files.map((item) => item?.path)];
    if (expectedInventory.some((item) => typeof item !== "string")) return false;
    assertExactFileInventory(await listRegularFiles(root), expectedInventory, "deterministic evidence");
    for (const item of value.files) {
      if (
        !hasExactKeys(item, ["bytes", "path", "sha256"]) ||
        !safeRelativePath(item.path) ||
        !Number.isSafeInteger(item.bytes) ||
        item.bytes < 0 ||
        !sha256Pattern.test(item.sha256 ?? "")
      ) return false;
      const target = path.resolve(root, ...item.path.split("/"));
      if (!isPathInside(root, target)) return false;
      const metadata = await lstat(target);
      if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(target), target)) {
        return false;
      }
      if (metadata.size !== item.bytes || sha256(await readFile(target)) !== item.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function verifyMinimizerReferences(indexPath, value) {
  const failedResult = { verified: false, caseArtifacts: [] };
  try {
    if (!Array.isArray(value?.cases) || value.cases.length < 2) return failedResult;
    const root = path.dirname(path.resolve(indexPath));
    const referencedPaths = [];
    for (const item of value.cases) {
      if (
        !hasExactKeys(item, ["artifact", "kind", "source"]) ||
        !validFileReference(item.artifact) ||
        !validFileReference(item.source) ||
        !item.artifact.path.endsWith(".json") ||
        !/\.(?:js|mjs)$/u.test(item.source.path)
      ) return failedResult;
      referencedPaths.push(item.artifact.path, item.source.path);
    }
    assertExactFileInventory(
      await listRegularFiles(root),
      [path.basename(indexPath), ...referencedPaths],
      "tree minimizer evidence",
    );
    const caseArtifacts = [];
    for (const item of value.cases) {
      const artifactTarget = resolveEvidenceChild(root, item.artifact.path);
      const sourceTarget = resolveEvidenceChild(root, item.source.path);
      const [artifactMetadata, sourceMetadata] = await Promise.all([
        lstat(artifactTarget),
        lstat(sourceTarget),
      ]);
      if (
        !artifactMetadata.isFile() || artifactMetadata.isSymbolicLink() ||
        !sourceMetadata.isFile() || sourceMetadata.isSymbolicLink() ||
        !samePath(await realpath(artifactTarget), artifactTarget) ||
        !samePath(await realpath(sourceTarget), sourceTarget)
      ) return failedResult;
      const [artifactWrapper, sourceBytes] = await Promise.all([
        readCanonicalEvidenceFile(artifactTarget),
        readFile(sourceTarget),
      ]);
      const sourceSha256 = sha256(sourceBytes);
      if (
        artifactMetadata.size !== item.artifact.bytes ||
        artifactWrapper.sha256 !== item.artifact.sha256 ||
        sourceMetadata.size !== item.source.bytes ||
        sourceBytes.length === 0 ||
        sourceSha256 !== item.source.sha256
      ) return failedResult;
      caseArtifacts.push({
        artifactSha256: artifactWrapper.sha256,
        sourceSha256,
        value: artifactWrapper.value,
      });
    }
    return { verified: true, caseArtifacts };
  } catch {
    return failedResult;
  }
}

async function verifyRwaReferences(indexPath, wrapper) {
  try {
    if (
      wrapper.sha256 !== rwaArtifactIndexSha256 ||
      !validRwaIndexEnvelope(wrapper.value)
    ) return false;
    const value = wrapper.value;
    const root = path.dirname(path.resolve(indexPath));
    const expectedInventory = [path.basename(indexPath), ...value.files.map((item) => item.path)];
    for (const item of value.files) {
      const target = resolveEvidenceChild(root, item.path);
      const metadata = await lstat(target);
      if (
        !metadata.isFile() || metadata.isSymbolicLink() ||
        !samePath(await realpath(target), target) ||
        metadata.size !== item.bytes ||
        sha256(await readFile(target)) !== item.sha256
      ) return false;
    }
    for (const item of value.directories) {
      const target = resolveEvidenceChild(root, item.path);
      const metadata = await lstat(target);
      if (
        !metadata.isDirectory() || metadata.isSymbolicLink() ||
        !samePath(await realpath(target), target)
      ) return false;
      const files = await listRegularFiles(target);
      expectedInventory.push(...files.map((relativePath) => `${item.path}/${relativePath}`));
      if (!isDeepStrictEqual(await sha256DirectoryTree(target), {
        sha256: item.sha256,
        fileCount: item.fileCount,
        totalBytes: item.totalBytes,
      })) return false;
    }
    assertExactFileInventory(await listRegularFiles(root), expectedInventory, "RWA evidence");
    return true;
  } catch {
    return false;
  }
}

function validRwaIndexEnvelope(value) {
  return hasExactKeys(value, [
    "boundary",
    "candidateExecutableSha256",
    "candidateRevision",
    "directories",
    "files",
    "schema",
    "summary",
    "validation",
  ]) &&
    value.schema === "stasis-rwa-hosted-census-artifact-index-v1" &&
    value.boundary === "exploratory-hosted-executable-blocker-census-not-sealed-paired-proof" &&
    value.candidateRevision === candidate.revision &&
    value.candidateExecutableSha256 === candidate.executableSha256 &&
    Array.isArray(value.files) &&
    value.files.length === 8 &&
    value.files.every(validFileReference) &&
    Array.isArray(value.directories) &&
    value.directories.length === 2 &&
    value.directories.every((item) =>
      hasExactKeys(item, ["fileCount", "path", "sha256", "totalBytes"]) &&
      safeRelativePath(item.path) &&
      Number.isSafeInteger(item.fileCount) && item.fileCount > 0 &&
      Number.isSafeInteger(item.totalBytes) && item.totalBytes > 0 &&
      sha256Pattern.test(item.sha256 ?? "")
    ) &&
    hasExactKeys(value.validation, [
      "candidateEnvelopeValid",
      "normalizedCaseCheckpointOracleMatchToPriorLocalExactRun",
      "violations",
    ]) &&
    value.validation.candidateEnvelopeValid === true &&
    value.validation.normalizedCaseCheckpointOracleMatchToPriorLocalExactRun === true &&
    Array.isArray(value.validation.violations) && value.validation.violations.length === 0 &&
    hasExactKeys(value.summary, [
      "denominator",
      "engineBug",
      "exactEquivalent",
      "semanticOracleDifference",
      "typedUnsupported",
    ]) &&
    value.summary.denominator === 8 &&
    value.summary.exactEquivalent === 0 &&
    value.summary.semanticOracleDifference === 5 &&
    value.summary.typedUnsupported === 3 &&
    value.summary.engineBug === 0;
}

function validBasicWrapper(value) {
  return hasExactKeys(value, ["sha256", "value"]) &&
    hasLoadedEvidenceProvenance(value, "criterion8") &&
    sha256Pattern.test(value.sha256 ?? "") &&
    typeof value.value === "object" && value.value !== null && !Array.isArray(value.value);
}

function validDeterministicWrapper(value) {
  return hasExactKeys(value, ["referencesVerified", "sha256", "value"]) &&
    hasLoadedEvidenceProvenance(value, "criterion7") &&
    value.referencesVerified === true &&
    validCanonicalWrappedValue(value);
}

function validCrossTrackWrapper(value) {
  return hasExactKeys(value, [
    "deterministicArtifactIndexSha256",
    "rwaArtifactIndexSha256",
    "sha256",
    "trackReferencesVerified",
    "value",
  ]) &&
    hasLoadedEvidenceProvenance(value, "criterion5") &&
    typeof value.trackReferencesVerified === "boolean" &&
    validCanonicalWrappedValue(value);
}

function validMinimizerWrapper(value) {
  return hasExactKeys(value, ["caseArtifacts", "referencesVerified", "sha256", "value"]) &&
    hasLoadedEvidenceProvenance(value, "criterion6") &&
    typeof value.referencesVerified === "boolean" &&
    Array.isArray(value.caseArtifacts) &&
    validCanonicalWrappedValue(value);
}

function validCanonicalWrappedValue(value) {
  return sha256Pattern.test(value.sha256 ?? "") &&
    typeof value.value === "object" && value.value !== null && !Array.isArray(value.value);
}

function brandLoadedEvidence(wrapper, kind) {
  if (wrapper === null) return null;
  const snapshot = immutablePlainJsonSnapshot(wrapper, `${kind} decision evidence`);
  loadedEvidenceProvenance.set(snapshot, kind);
  return snapshot;
}

function hasLoadedEvidenceProvenance(wrapper, kind) {
  if (typeof wrapper !== "object" || wrapper === null || Array.isArray(wrapper)) return false;
  return loadedEvidenceProvenance.get(wrapper) === kind;
}

function validFileReference(value) {
  return hasExactKeys(value, ["bytes", "path", "sha256"]) &&
    safeRelativePath(value.path) &&
    Number.isSafeInteger(value.bytes) && value.bytes >= 0 &&
    sha256Pattern.test(value.sha256 ?? "");
}

function criterion(condition, passReason, failReason) {
  return condition ? passed(passReason) : failed(failReason);
}

function passed(reason) {
  return { passed: true, reason };
}

function failed(reason) {
  return { passed: false, reason };
}

function missingOrInvalid(value, label) {
  return failed(value === null || value === undefined ? `${label}_is_missing` : `${label}_is_invalid`);
}

function hasExactKeys(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function safeRelativePath(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !path.posix.isAbsolute(value) &&
    !path.win32.isAbsolute(value) &&
    value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function resolveEvidenceChild(root, relativePath) {
  if (!safeRelativePath(relativePath)) {
    throw new Error("Decision evidence reference is not one portable relative path");
  }
  const target = path.resolve(root, ...relativePath.split("/"));
  if (!isPathInside(root, target)) {
    throw new Error("Decision evidence reference escapes its index directory");
  }
  return target;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
