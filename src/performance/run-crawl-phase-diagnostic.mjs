import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  assertFreshSealedArtifactRoot,
  repositoryRoot,
  writeJson,
} from "../shared/io.mjs";
import {
  bindAuthoritativeCrawlRaw,
  composeCrawlPhaseDiagnosticEvidence,
  createCrawlPhaseDiagnosticInputIdentity,
  createCrawlPhaseDiagnosticJob,
  createCrawleeCrawlPhaseDiagnosticRunner,
  createStasisCrawlPhaseDiagnosticRunner,
} from "./crawl-phase-diagnostic.mjs";
import {
  assertAuthoritativeLinuxPerformanceCandidate,
  disposeLinuxPerformanceCandidate,
  linuxPerformanceExecutablePath,
  loadLinuxPerformanceCandidateSpec,
  verifyLinuxPerformanceCandidate,
} from "./linux-candidate.mjs";
import { observeLinuxEglRuntime } from "./linux-egl-runtime.mjs";
import { readCanonicalJsonBytes } from "./replication-cli.mjs";
import {
  buildCrawlPerformanceStasisIdentity,
  observeCrawleePerformanceIdentity,
  observeCrawlPerformanceHost,
  readCrawlHarnessCheckoutIdentity,
} from "./run-crawl.mjs";

export const crawlPhaseDiagnosticCrawleeRawArtifactPath =
  "performance/diagnostics/crawl-phase-crawlee-raw.json";
export const crawlPhaseDiagnosticStasisRawArtifactPath =
  "performance/diagnostics/crawl-phase-stasis-raw.json";
export const crawlPhaseDiagnosticEvidenceArtifactPath =
  "performance/diagnostics/crawl-phase-localization-evidence.json";

const environmentNames = Object.freeze({
  authoritativeRawPath: "STASIS_PERFORMANCE_AUTHORITY_CRAWL_RAW_PATH",
  authoritativeRawSha256: "STASIS_PERFORMANCE_AUTHORITY_CRAWL_RAW_SHA256",
  artifactBindingPath: "STASIS_PERFORMANCE_ARTIFACT_BINDING_PATH",
  repository: "GITHUB_REPOSITORY",
  workflow: "GITHUB_WORKFLOW",
  job: "GITHUB_JOB",
  ref: "GITHUB_REF",
  runId: "GITHUB_RUN_ID",
  runAttempt: "GITHUB_RUN_ATTEMPT",
  sha: "GITHUB_SHA",
});

/**
 * Runs one separately hosted diagnostic in the fixed order Crawlee then
 * Stasis. Lane artifacts are written with wx semantics before the validating
 * composer runs, so a failed equality/localization gate is retained rather
 * than silently discarded.
 */
export async function runCrawlPhaseDiagnosticCommand({
  environment = process.env,
  now = () => process.hrtime.bigint(),
  launcher = chromium,
  readAuthorityFile = readFile,
  readArtifactBindingFile = readFile,
  assertFreshArtifactRoot = assertFreshSealedArtifactRoot,
  loadCandidateSpec = loadLinuxPerformanceCandidateSpec,
  verifyCandidate = verifyLinuxPerformanceCandidate,
  assertCandidate = assertAuthoritativeLinuxPerformanceCandidate,
  candidateExecutablePath = linuxPerformanceExecutablePath,
  disposeCandidate = disposeLinuxPerformanceCandidate,
  observeHost = observeCrawlPerformanceHost,
  observeBaseline = observeCrawleePerformanceIdentity,
  observeEglRuntime = observeLinuxEglRuntime,
  loadDiagnosticProvenance = loadCrawlPhaseDiagnosticProvenanceFromEnvironment,
  createCrawleeDiagnosticRunner = createCrawleeCrawlPhaseDiagnosticRunner,
  createStasisDiagnosticRunner = createStasisCrawlPhaseDiagnosticRunner,
  composeEvidence = composeCrawlPhaseDiagnosticEvidence,
  writeRaw = writeJson,
} = {}) {
  const authorityPath = required(environment, environmentNames.authoritativeRawPath);
  if (!path.isAbsolute(authorityPath)) {
    throw new TypeError("The authoritative crawl raw path must be absolute");
  }
  const authoritativeRawSha256 = required(
    environment,
    environmentNames.authoritativeRawSha256,
  );
  const artifactBindingPath = required(environment, environmentNames.artifactBindingPath);
  if (!path.isAbsolute(artifactBindingPath)) {
    throw new TypeError("The performance artifact-binding receipt path must be absolute");
  }
  const artifactBindingInput = await readCanonicalJsonBytes(
    artifactBindingPath,
    "performance replication artifact-binding receipt",
    { readBytes: readArtifactBindingFile },
  );
  const authoritativeRawBytes = await readAuthorityFile(authorityPath);
  const authoritativeRaw = parseJsonBytes(authoritativeRawBytes);
  const authority = bindAuthoritativeCrawlRaw({
    raw: authoritativeRaw,
    bytes: authoritativeRawBytes,
    sha256: authoritativeRawSha256,
    artifactBindingReceipt: artifactBindingInput.value,
  });

  const spec = loadCandidateSpec(environment);
  const verified = await verifyCandidate(spec);
  assertCandidate(verified);
  let disposed = false;
  const disposeVerified = async () => {
    if (disposed) return;
    disposed = true;
    await disposeCandidate(verified);
  };

  try {
    const host = await observeHost({ environment });
    const provenance = await loadDiagnosticProvenance(environment);
    const eglRuntime = await observeEglRuntime();
    const crawlee = await observeBaseline({ host, environment, launcher });
    const stasis = buildCrawlPerformanceStasisIdentity(
      verified,
      host.hostClassDigest,
      eglRuntime,
    );
    const diagnosticAttestation = Object.freeze({ host, provenance, crawlee, stasis });
    const inputIdentity = createCrawlPhaseDiagnosticInputIdentity({
      authorityBinding: authority.binding,
      diagnosticAttestation,
    });
    const artifactRoot = await assertFreshArtifactRoot();

    const crawleeRunner = createCrawleeDiagnosticRunner({
      identity: inputIdentity,
      launcher,
      now,
    });
    const stasisRunner = createStasisDiagnosticRunner({
      identity: inputIdentity,
      sdk: verified.sdk,
      sdkVersion: verified.identity.version,
      executablePath: candidateExecutablePath(verified),
      environment,
      now,
    });

    const crawleeDiagnostic = await crawleeRunner(
      createCrawlPhaseDiagnosticJob({ lane: "crawlee", ordinal: 1 }),
    );
    const crawleeRawPath = await writeRaw(
      crawlPhaseDiagnosticCrawleeRawArtifactPath,
      crawleeDiagnostic,
    );
    const stasisDiagnostic = await stasisRunner(
      createCrawlPhaseDiagnosticJob({ lane: "stasis", ordinal: 2 }),
    );
    const stasisRawPath = await writeRaw(
      crawlPhaseDiagnosticStasisRawArtifactPath,
      stasisDiagnostic,
    );
    const authoritativeRawBytesAfterDiagnostics = await readAuthorityFile(authorityPath);

    const evidence = composeEvidence({
      authoritativeRaw: authority.raw,
      authoritativeRawBytes,
      authoritativeRawBytesAfterDiagnostics,
      authoritativeRawSha256,
      artifactBindingReceipt: artifactBindingInput.value,
      diagnosticAttestation,
      crawleeDiagnostic,
      stasisDiagnostic,
    });
    const evidencePath = await writeRaw(
      crawlPhaseDiagnosticEvidenceArtifactPath,
      evidence,
    );
    await disposeVerified();
    return Object.freeze({
      artifactRoot,
      crawleeRawPath,
      stasisRawPath,
      evidencePath,
      evidence,
    });
  } catch (error) {
    await disposeVerified();
    throw error;
  }
}

export async function loadCrawlPhaseDiagnosticProvenanceFromEnvironment(
  environment = process.env,
  {
    checkoutRoot = repositoryRoot,
    readHarnessCheckoutIdentity = readCrawlHarnessCheckoutIdentity,
  } = {},
) {
  const checkout = await readHarnessCheckoutIdentity(checkoutRoot);
  return Object.freeze({
    provider: "github-actions",
    repository: required(environment, environmentNames.repository),
    workflow: required(environment, environmentNames.workflow),
    job: required(environment, environmentNames.job),
    runId: required(environment, environmentNames.runId),
    runAttempt: required(environment, environmentNames.runAttempt),
    workflowSourceSha: required(environment, environmentNames.sha),
    workflowSourceRef: required(environment, environmentNames.ref),
    harnessCheckoutRevision: checkout.revision,
    harnessCheckoutTree: checkout.tree,
    harnessCheckoutWorktree: checkout.worktree,
  });
}

function parseJsonBytes(value) {
  if (!(typeof value === "string" || value instanceof Uint8Array)) {
    throw new TypeError("The authoritative crawl raw reader must return exact bytes");
  }
  try {
    return JSON.parse(
      typeof value === "string"
        ? value
        : Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8"),
    );
  } catch (error) {
    throw new TypeError("The authoritative crawl raw file is not valid JSON", { cause: error });
  }
}

function required(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

async function main() {
  try {
    const result = await runCrawlPhaseDiagnosticCommand();
    console.log(result.evidencePath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
