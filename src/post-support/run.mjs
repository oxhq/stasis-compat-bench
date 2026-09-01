import { isDeepStrictEqual } from "node:util";

import {
  disposePostSupportCandidate,
  loadPostSupportCandidateSpec,
  verifyPostSupportCandidate,
} from "./candidate-identity.mjs";
import {
  comparePostSupportDeterministic,
  runPostSupportDeterministicProof,
} from "./deterministic-lane.mjs";
import {
  assertFreshPostSupportOutputPath,
  readExplicitJsonInput,
  requiredEnvironmentPath,
  writeExplicitPostSupportOutput,
} from "./output.mjs";
import {
  assertPositiveCookieMinimizerResult,
  runPositiveCookieMinimizers,
} from "./positive-cookie-minimizers.mjs";
import { comparePostSupportRwa, runPostSupportRwaProof } from "./rwa-lane.mjs";
import { projectWildCandidateIdentity } from "./wild-identity.mjs";
import { runPostSupportWildProof } from "./wild-lane.mjs";
import { runPostSupportWildNetworkSmoke } from "./wild-network-smoke.mjs";
import {
  assertAuthoritativePostSupportWildResult,
  runAuthoritativePostSupportWildSequence,
  verifyPostSupportWildResult,
} from "./wild-result-verifier.mjs";
import { serializePostSupportArtifact } from "./artifact-privacy.mjs";

const command = process.argv[2];
if (command === "wild") {
  const candidate = await verifyPostSupportCandidate(loadPostSupportCandidateSpec());
  try {
    const verified = await runAuthoritativePostSupportWildSequence({ verifiedCandidate: candidate });
    assertAuthoritativePostSupportWildResult(verified);
    process.stdout.write(serializePostSupportArtifact(wildVerificationOutput(verified, candidate)));
  } finally {
    await disposePostSupportCandidate(candidate);
  }
} else {
  const candidate = await verifyPostSupportCandidate(loadPostSupportCandidateSpec());
  try {
    const output = await runCommand(command, candidate);
    process.stdout.write(serializePostSupportArtifact(output));
  } finally {
    await disposePostSupportCandidate(candidate);
  }
}

async function runCommand(name, candidate) {
  if (name === "candidate") {
    return {
      schema: "stasis-post-support-candidate-verification-v1",
      status: "passed",
      candidate: candidate.identity,
      runtime: candidate.runtime,
    };
  }
  if (name === "cookies") {
    const outputPath = requiredEnvironmentPath("STASIS_POST_SUPPORT_COOKIE_OUTPUT");
    await assertFreshPostSupportOutputPath(outputPath, "post-support cookie output");
    const value = await runPositiveCookieMinimizers(candidate);
    return writeExplicitPostSupportOutput(
      value,
      outputPath,
      "post-support cookie output",
    );
  }
  if (name === "deterministic") {
    const rawPath = requiredEnvironmentPath("STASIS_POST_SUPPORT_DETERMINISTIC_RAW_OUTPUT");
    const comparisonPath = requiredEnvironmentPath(
      "STASIS_POST_SUPPORT_DETERMINISTIC_COMPARISON_OUTPUT",
    );
    assertDistinctPaths(rawPath, comparisonPath, "deterministic outputs");
    await Promise.all([
      assertFreshPostSupportOutputPath(rawPath, "post-support deterministic raw output"),
      assertFreshPostSupportOutputPath(
        comparisonPath,
        "post-support deterministic comparison output",
      ),
    ]);
    const baseline = await readExplicitJsonInput(
      requiredEnvironmentPath("STASIS_POST_SUPPORT_DETERMINISTIC_BASELINE_PATH"),
      "post-support deterministic baseline",
    );
    const raw = await runPostSupportDeterministicProof(candidate);
    const comparison = comparePostSupportDeterministic(baseline, raw);
    const rawOutput = await writeExplicitPostSupportOutput(
      raw,
      rawPath,
      "post-support deterministic raw output",
    );
    const comparisonOutput = await writeExplicitPostSupportOutput(
      comparison,
      comparisonPath,
      "post-support deterministic comparison output",
    );
    return { raw: rawOutput, comparison: comparisonOutput };
  }
  if (name === "rwa") {
    const rawPath = requiredEnvironmentPath("STASIS_POST_SUPPORT_RWA_RAW_OUTPUT");
    const comparisonPath = requiredEnvironmentPath("STASIS_POST_SUPPORT_RWA_COMPARISON_OUTPUT");
    assertDistinctPaths(rawPath, comparisonPath, "RWA outputs");
    await Promise.all([
      assertFreshPostSupportOutputPath(rawPath, "post-support RWA raw output"),
      assertFreshPostSupportOutputPath(comparisonPath, "post-support RWA comparison output"),
    ]);
    const [baseline, persistedCookieMinimizers] = await Promise.all([
      readExplicitJsonInput(
        requiredEnvironmentPath("STASIS_POST_SUPPORT_RWA_BASELINE_PATH"),
        "post-support RWA baseline",
      ),
      readExplicitJsonInput(
        requiredEnvironmentPath("STASIS_POST_SUPPORT_COOKIE_OUTPUT"),
        "post-support cookie output",
      ),
    ]);
    assertPositiveCookieMinimizerResult(persistedCookieMinimizers);
    const cookieMinimizers = await runPositiveCookieMinimizers(candidate);
    if (!isDeepStrictEqual(persistedCookieMinimizers, cookieMinimizers)) {
      throw new Error(
        "Persisted cookie minimizer artifact differs from the fresh authoritative in-process run",
      );
    }
    const raw = await runPostSupportRwaProof(candidate);
    const comparison = comparePostSupportRwa(baseline, raw, cookieMinimizers);
    const rawOutput = await writeExplicitPostSupportOutput(
      raw,
      rawPath,
      "post-support RWA raw output",
    );
    const comparisonOutput = await writeExplicitPostSupportOutput(
      comparison,
      comparisonPath,
      "post-support RWA comparison output",
    );
    return { raw: rawOutput, comparison: comparisonOutput };
  }
  if (name === "wild-smoke") {
    const smoke = await runPostSupportWildNetworkSmoke(candidate);
    return {
      schema: "stasis-post-support-wild-smoke-run-v1",
      status: "passed",
      artifact: smoke.reference,
    };
  }
  if (name === "wild-paired") {
    return runPostSupportWildProof(candidate);
  }
  if (name === "wild-verify") {
    const verified = await verifyPostSupportWildResult({ verifiedCandidate: candidate });
    return wildVerificationOutput(verified, candidate, "diagnostic_only");
  }
  throw new Error(
    "Usage: node src/post-support/run.mjs candidate|cookies|deterministic|rwa|wild-smoke|wild-paired|wild-verify|wild",
  );
}

function wildVerificationOutput(verified, candidate, authority = "quiescent_postflight_verified") {
  return {
    schema: "stasis-post-support-wild-authority-v1",
    status: "passed",
    protocol: verified.protocol,
    artifactIndexSha256: verified.artifactIndexSha256,
    candidate: projectWildCandidateIdentity(candidate.identity),
    caseCount: verified.cases.length,
    summary: verified.summary,
    authority,
  };
}

function assertDistinctPaths(left, right, label) {
  if (left.toLowerCase() === right.toLowerCase()) {
    throw new Error(`Post-support ${label} must use distinct fresh paths`);
  }
}
