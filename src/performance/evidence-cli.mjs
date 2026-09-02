import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  combinePerformanceEvidenceFiles,
  requiredAbsolutePath,
  verifyCombinedPerformanceEvidenceFiles,
} from "./publication.mjs";

const usage =
  "Usage: node src/performance/evidence-cli.mjs combine <absolute-rwa-artifact-json> <absolute-crawl-raw-json> <absolute-sealed-output-root>|verify <absolute-rwa-artifact-json> <absolute-crawl-raw-json> <absolute-combined-evidence-json> <absolute-combined-evidence-markdown>";

export function parsePerformanceEvidenceCommand(argv) {
  if (argv[0] === "combine" && argv.length === 4) {
    return Object.freeze({
      command: "combine",
      rwaArtifactPath: requiredAbsolutePath(argv[1], "RWA hosted artifact"),
      crawlRawPath: requiredAbsolutePath(argv[2], "crawl hosted raw artifact"),
      artifactRoot: requiredAbsolutePath(argv[3], "sealed output root"),
    });
  }
  if (argv[0] === "verify" && argv.length === 5) {
    return Object.freeze({
      command: "verify",
      rwaArtifactPath: requiredAbsolutePath(argv[1], "RWA hosted artifact"),
      crawlRawPath: requiredAbsolutePath(argv[2], "crawl hosted raw artifact"),
      evidencePath: requiredAbsolutePath(argv[3], "combined evidence JSON"),
      markdownPath: requiredAbsolutePath(argv[4], "combined evidence Markdown"),
    });
  }
  throw new TypeError(usage);
}

export async function runPerformanceEvidenceCli(
  argv,
  {
    combine = combinePerformanceEvidenceFiles,
    verify = verifyCombinedPerformanceEvidenceFiles,
    environment = process.env,
    writeOutput = (value) => process.stdout.write(value),
  } = {},
) {
  const parsed = parsePerformanceEvidenceCommand(argv);
  if (parsed.command === "combine") {
    environment.STASIS_COMPAT_ARTIFACT_DIR = parsed.artifactRoot;
    const result = await combine({
      rwaArtifactPath: parsed.rwaArtifactPath,
      crawlRawPath: parsed.crawlRawPath,
    });
    const receipt = {
      schema: "stasis-v0.3.3-combined-performance-build-v1",
      status: "passed",
      evidenceSchema: result.evidence.schema,
      evidencePath: "performance/combined-evidence.json",
      markdownPath: "performance/combined-evidence.md",
    };
    writeOutput(`${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  }

  const receipt = await verify({
    rwaArtifactPath: parsed.rwaArtifactPath,
    crawlRawPath: parsed.crawlRawPath,
    evidencePath: parsed.evidencePath,
    markdownPath: parsed.markdownPath,
  });
  writeOutput(`${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

if (
  process.argv[1] !== undefined &&
  samePath(fileURLToPath(import.meta.url), process.argv[1])
) {
  await runPerformanceEvidenceCli(process.argv.slice(2));
}
