import { isDeepStrictEqual } from "node:util";

import {
  concurrency,
  maxDepth,
  maxPages,
  negativeControls,
  startUrl,
  stasisNetwork,
} from "../crawl/corpus.mjs";
import { compareDeterministicV03 } from "../crawl-v03/compare-lib.mjs";
import {
  deterministicV03CandidateEnvelope,
  deterministicV03Protocol,
  deterministicV03Track,
} from "../crawl-v03/identity.mjs";
import { runStasisV03Case } from "../crawl-v03/stasis-lane.mjs";
import {
  assertAuthoritativePostSupportCandidate,
  assertCandidateIdentity,
  postSupportExecutablePath,
  postSupportNodeVersion,
  postSupportProfile,
} from "./candidate-identity.mjs";
import { assertPostSupportArtifactPrivacy } from "./artifact-privacy.mjs";

const authoritativeDeterministicRawResults = new WeakSet();
const defaultDeterministicDependencies = Object.freeze({});

export const postSupportDeterministicSchema =
  "stasis-post-support-deterministic-stasis-raw-v1";
export const postSupportDeterministicRunner =
  "stasis-controlled-web-session-v2-reference-crawler";

export async function runPostSupportDeterministicProof(
  verifiedCandidate,
  dependencies = defaultDeterministicDependencies,
) {
  const canMintAuthority = dependencies === defaultDeterministicDependencies;
  if (canMintAuthority) assertAuthoritativePostSupportCandidate(verifiedCandidate);
  const identity = assertVerifiedCandidate(verifiedCandidate);
  const executablePath = postSupportExecutablePath(verifiedCandidate);
  const run = (input) => runStasisV03Case({
    sdk: verifiedCandidate.sdk,
    executablePath,
    profile: postSupportProfile,
    networkOptions: stasisNetwork(),
    ...input,
  });
  const primary = await run({ start: startUrl, pageLimit: maxPages, depthLimit: maxDepth });
  const controls = [];
  for (const control of negativeControls) {
    controls.push({
      id: control.id,
      expectedSurface: control.expectedSurface,
      ...(await run({ start: control.start, pageLimit: 1, depthLimit: 0 })),
    });
  }
  const result = assertPostSupportDeterministicRaw({
    schema: postSupportDeterministicSchema,
    protocol: deterministicV03Protocol,
    track: deterministicV03Track,
    runner: postSupportDeterministicRunner,
    candidate: identity,
    rules: {
      concurrency,
      maxRequestRetries: 0,
      maxPages,
      maxDepth,
      profile: postSupportProfile,
      fallback: false,
    },
    primary,
    negativeControls: controls,
  });
  deepFreeze(result);
  if (canMintAuthority) authoritativeDeterministicRawResults.add(result);
  return result;
}

export function comparePostSupportDeterministic(playwright, stasis) {
  if (!authoritativeDeterministicRawResults.has(stasis)) {
    throw new Error(
      "Deterministic comparison authority requires the fresh direct in-process proof result",
    );
  }
  assertPostSupportDeterministicRaw(stasis);
  const result = {
    schema: "stasis-post-support-deterministic-comparison-v1",
    protocol: deterministicV03Protocol,
    track: deterministicV03Track,
    candidate: stasis.candidate,
    ...replayPostSupportDeterministicComparisonClaims(playwright, stasis),
  };
  assertPostSupportArtifactPrivacy(result);
  return result;
}

export function replayPostSupportDeterministicComparisonClaims(playwright, stasis) {
  assertPostSupportDeterministicRaw(stasis);
  const projectedCandidate = adaptPostSupportDeterministicForFrozenValidator(stasis);
  const structural = compareDeterministicV03(
    playwright,
    projectedCandidate,
  );
  if (!structural.candidateIdentityValid) {
    throw new Error("Frozen deterministic structural validation rejected the post-support projection");
  }
  return {
    corpusBinding: {
      corpus: "unchanged_frozen_deterministic_twenty_page_bfs",
      baselineIdentityValid: structural.baselineIdentityValid,
      structuralValidator: "compareDeterministicV03",
      validatorProjection: "identity_only_legacy_projection_then_exact_v2_semantics",
    },
    counts: structural.counts,
    denominator: structural.primaryDenominator,
    exactEquivalentRate: structural.exactEquivalentRate,
    behaviorallySupportedRate: structural.behaviorallySupportedRate,
    primaryCases: structural.primaryCases,
    negativeControls: structural.negativeControls,
  };
}

export function assertPostSupportDeterministicRaw(value) {
  assertCandidateIdentity(value?.candidate);
  const expectedRules = {
    concurrency,
    maxRequestRetries: 0,
    maxPages,
    maxDepth,
    profile: postSupportProfile,
    fallback: false,
  };
  if (
    value?.schema !== postSupportDeterministicSchema ||
    value?.protocol !== deterministicV03Protocol ||
    value?.track !== deterministicV03Track ||
    value?.runner !== postSupportDeterministicRunner ||
    !isDeepStrictEqual(value?.rules, expectedRules) ||
    value?.primary === null ||
    typeof value?.primary !== "object" ||
    !Array.isArray(value?.negativeControls) ||
    !isDeepStrictEqual(
      value.negativeControls.map(({ id, expectedSurface }) => ({ id, expectedSurface })),
      negativeControls.map(({ id, expectedSurface }) => ({ id, expectedSurface })),
    )
  ) {
    throw new TypeError("Invalid post-support deterministic raw result");
  }
  assertPostSupportArtifactPrivacy(value);
  return value;
}

export function adaptPostSupportDeterministicForFrozenValidator(stasis) {
  assertPostSupportDeterministicRaw(stasis);
  return {
    schema: deterministicV03CandidateEnvelope.schema,
    protocol: deterministicV03CandidateEnvelope.protocol,
    track: deterministicV03CandidateEnvelope.track,
    runner: deterministicV03CandidateEnvelope.runner,
    versions: {
      ...deterministicV03CandidateEnvelope.versions,
      node: postSupportNodeVersion,
    },
    rules: deterministicV03CandidateEnvelope.rules,
    primary: stasis.primary,
    negativeControls: stasis.negativeControls,
  };
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  }
}

function assertVerifiedCandidate(value) {
  const identity = assertCandidateIdentity(value?.identity);
  if (
    value?.executableSha256 !== identity.windows.executable.sha256 ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile ||
    typeof value?.sdk?.crawlWithStasis !== "function" ||
    typeof value?.sdk?.createStasisSessionPool !== "function"
  ) {
    throw new TypeError("Deterministic lane requires one verified post-support candidate");
  }
  return identity;
}
