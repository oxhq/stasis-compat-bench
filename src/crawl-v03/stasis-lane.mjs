import {
  candidateV03,
  loadVerifiedCandidateV03Sdk,
} from "../shared/candidate-v03.mjs";
import {
  concurrency,
  maxDepth,
  maxPages,
  negativeControls,
  startUrl,
  stasisNetwork,
} from "../crawl/corpus.mjs";
import {
  monotonicMilliseconds,
  serializeError,
  sha256File,
} from "../shared/io.mjs";
import {
  deterministicV03CandidateEnvelope,
  deterministicV03Protocol,
  deterministicV03Track,
} from "./identity.mjs";

const settlePolicy = Object.freeze({
  persistentWork: "report",
  maxVirtualTimeNs: 30_000_000_000n,
  maxControlTurns: 100_000n,
  wallIoTimeoutNs: 15_000_000_000n,
});

export async function verifyStasisV03Candidate(
  executablePath,
  {
    hashExecutable = sha256File,
    loadSdk = loadVerifiedCandidateV03Sdk,
  } = {},
) {
  if (typeof executablePath !== "string" || executablePath.length === 0) {
    throw new TypeError("A frozen STASIS_EXECUTABLE is required");
  }

  const executableSha256 = await hashExecutable(executablePath);
  if (executableSha256 !== candidateV03.executableSha256) {
    throw new TypeError(
      `The deterministic v0.3 census requires hosted candidate ${candidateV03.executableSha256}, got ${executableSha256}`,
    );
  }

  // The default loader verifies the tarball and extracted tree before importing
  // any candidate JavaScript. Keeping this after the executable check makes a
  // wrong native candidate fail before candidate SDK code can be evaluated.
  const sdk = await loadSdk();
  if (
    typeof sdk?.crawlWithStasis !== "function" ||
    typeof sdk?.createStasisSessionPool !== "function" ||
    sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== candidateV03.profile
  ) {
    throw new TypeError("The verified Stasis v0.3 SDK surface is incomplete");
  }
  return Object.freeze({ executableSha256, sdk });
}

export async function runStasisV03Proof(executablePath) {
  const verified = await verifyStasisV03Candidate(executablePath);
  return {
    schema: deterministicV03CandidateEnvelope.schema,
    protocol: deterministicV03Protocol,
    track: deterministicV03Track,
    runner: deterministicV03CandidateEnvelope.runner,
    versions: {
      node: process.version,
      sdk: candidateV03.version,
      sourceRevision: candidateV03.revision,
      executablePath,
      executableSha256: verified.executableSha256,
      sdkArchiveSha256: candidateV03.sdkArchiveSha256,
      sdkArchiveBytes: candidateV03.sdkArchiveBytes,
      sdkTree: {
        sha256: candidateV03.sdkTreeSha256,
        fileCount: candidateV03.sdkTreeFileCount,
        totalBytes: candidateV03.sdkTreeBytes,
      },
    },
    rules: {
      concurrency,
      maxRequestRetries: 0,
      maxPages,
      maxDepth,
      profile: candidateV03.profile,
      fallback: false,
    },
    primary: await runStasisV03Case({
      sdk: verified.sdk,
      start: startUrl,
      pageLimit: maxPages,
      depthLimit: maxDepth,
      executablePath,
    }),
    negativeControls: await runControls(verified.sdk, executablePath),
  };
}

async function runControls(sdk, executablePath) {
  const results = [];
  for (const control of negativeControls) {
    results.push({
      id: control.id,
      expectedSurface: control.expectedSurface,
      ...(await runStasisV03Case({
        sdk,
        start: control.start,
        pageLimit: 1,
        depthLimit: 0,
        executablePath,
      })),
    });
  }
  return results;
}

export async function runStasisV03Case({
  sdk,
  start,
  pageLimit,
  depthLimit,
  executablePath,
  profile = candidateV03.profile,
  networkOptions = stasisNetwork(),
  recordWallTime = true,
}) {
  const startedAt = recordWallTime ? process.hrtime.bigint() : null;
  const pool = sdk.createStasisSessionPool({
    maxProcesses: concurrency,
    maxQueue: pageLimit,
    launch: { executablePath, commandTimeoutMs: 30_000 },
  });
  let terminal;
  try {
    const result = await sdk.crawlWithStasis(pool, {
      start,
      maxPages: pageLimit,
      maxDepth: depthLimit,
      concurrency,
      profile,
      network: networkOptions,
      settle: settlePolicy,
    });
    terminal = {
      success: true,
      result,
    };
  } catch (error) {
    terminal = {
      success: false,
      error: serializeError(error),
    };
  }

  try {
    await pool.close();
  } catch (error) {
    const cleanupError = serializeError(error);
    return {
      success: false,
      error: {
        name: "StasisProcessError",
        code: "internal_runtime_failure",
        stateEffect: "indeterminate",
        messageOmitted: true,
        cause: cleanupError,
      },
      cleanup: {
        status: "failed",
        phase: "pool_close",
        error: cleanupError,
      },
      priorTerminal: terminal.success
        ? { success: true }
        : { success: false, error: terminal.error },
      ...(recordWallTime ? { wallTimeMs: monotonicMilliseconds(startedAt) } : {}),
    };
  }

  return {
    ...terminal,
    cleanup: { status: "passed", phase: "pool_close" },
    ...(recordWallTime ? { wallTimeMs: monotonicMilliseconds(startedAt) } : {}),
  };
}
