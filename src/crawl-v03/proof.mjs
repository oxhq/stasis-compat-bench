import { crawlReportMarkdown } from "../crawl/report.mjs";
import { writeJson, writeText } from "../shared/io.mjs";
import { compareDeterministicV03 } from "./compare-lib.mjs";
import { deterministicV03ArtifactPrefix } from "./identity.mjs";
import { runPlaywrightV03Proof } from "./playwright-lane.mjs";
import {
  runStasisV03Proof,
  verifyStasisV03Candidate,
} from "./stasis-lane.mjs";

const executablePath = process.env.STASIS_EXECUTABLE;
await verifyStasisV03Candidate(executablePath);

const playwright = await runPlaywrightV03Proof();
console.log(await writeJson(`${deterministicV03ArtifactPrefix}/playwright-raw.json`, playwright));
if (
  !playwright.primary.success ||
  playwright.negativeControls.some((control) => !control.success)
) {
  throw new Error("The pinned Crawlee/Playwright baseline failed; candidate comparison is invalid");
}

const stasis = await runStasisV03Proof(executablePath);
console.log(await writeJson(`${deterministicV03ArtifactPrefix}/stasis-raw.json`, stasis));

const comparison = compareDeterministicV03(playwright, stasis);
console.log(await writeJson(`${deterministicV03ArtifactPrefix}/compatibility.json`, comparison));
console.log(
  await writeText(
    `${deterministicV03ArtifactPrefix}/report.md`,
    crawlReportMarkdown(comparison),
  ),
);
if (!comparison.baselineValid || !comparison.candidateValid) {
  throw new Error("The v0.3 deterministic comparison failed its frozen evidence validation");
}
