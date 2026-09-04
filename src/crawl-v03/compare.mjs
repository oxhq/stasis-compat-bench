import { crawlReportMarkdown } from "../crawl/report.mjs";
import { readJson, writeJson, writeText } from "../shared/io.mjs";
import { compareDeterministicV03 } from "./compare-lib.mjs";
import { deterministicV03ArtifactPrefix } from "./identity.mjs";

const comparison = compareDeterministicV03(
  await readJson(`${deterministicV03ArtifactPrefix}/playwright-raw.json`),
  await readJson(`${deterministicV03ArtifactPrefix}/stasis-raw.json`),
);
console.log(await writeJson(`${deterministicV03ArtifactPrefix}/compatibility.json`, comparison));
console.log(
  await writeText(
    `${deterministicV03ArtifactPrefix}/report.md`,
    crawlReportMarkdown(comparison),
  ),
);
if (!comparison.baselineValid || !comparison.candidateValid) process.exitCode = 1;
