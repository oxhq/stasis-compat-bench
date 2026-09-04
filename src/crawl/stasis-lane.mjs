import {
  crawlWithStasis,
  createStasisSessionPool,
} from "@oxhq/stasis";

import {
  concurrency,
  maxDepth,
  maxPages,
  negativeControls,
  startUrl,
  stasisNetwork,
} from "./corpus.mjs";
import { monotonicMilliseconds, serializeError, sha256File } from "../shared/io.mjs";

const settlePolicy = {
  persistentWork: "report",
  maxVirtualTimeNs: 30_000_000_000n,
  maxControlTurns: 100_000n,
  wallIoTimeoutNs: 15_000_000_000n,
};

export async function runStasisProof(executablePath) {
  if (typeof executablePath !== "string" || executablePath.length === 0) {
    throw new TypeError("A frozen STASIS_EXECUTABLE is required");
  }
  return {
    schema: "stasis-compat-crawl-stasis-raw-v1",
    protocol: "stasis-compat-bench-v1",
    track: "crawling",
    runner: "stasis-reference-crawler",
    versions: {
      node: process.version,
      sdk: "0.2.1",
      executablePath,
      executableSha256: await sha256File(executablePath),
    },
    rules: {
      concurrency,
      maxRequestRetries: 0,
      maxPages,
      maxDepth,
      fallback: false,
    },
    primary: await runOne({
      start: startUrl,
      pageLimit: maxPages,
      depthLimit: maxDepth,
      executablePath,
    }),
    negativeControls: await runControls(executablePath),
  };
}

async function runControls(executablePath) {
  const results = [];
  for (const control of negativeControls) {
    results.push({
      id: control.id,
      expectedSurface: control.expectedSurface,
      ...(await runOne({
        start: control.start,
        pageLimit: 1,
        depthLimit: 0,
        executablePath,
      })),
    });
  }
  return results;
}

async function runOne({ start, pageLimit, depthLimit, executablePath }) {
  const startedAt = process.hrtime.bigint();
  const pool = createStasisSessionPool({
    maxProcesses: concurrency,
    maxQueue: pageLimit,
    launch: { executablePath, commandTimeoutMs: 30_000 },
  });
  try {
    const result = await crawlWithStasis(pool, {
      start,
      maxPages: pageLimit,
      maxDepth: depthLimit,
      concurrency,
      network: stasisNetwork(),
      settle: settlePolicy,
    });
    return {
      success: true,
      result,
      wallTimeMs: monotonicMilliseconds(startedAt),
    };
  } catch (error) {
    return {
      success: false,
      error: serializeError(error),
      wallTimeMs: monotonicMilliseconds(startedAt),
    };
  } finally {
    await pool.close().catch(() => undefined);
  }
}
