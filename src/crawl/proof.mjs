import { compareCrawl } from "./compare-lib.mjs";
import { runPlaywrightProof } from "./playwright-lane.mjs";
import { crawlReportMarkdown } from "./report.mjs";
import { runStasisProof } from "./stasis-lane.mjs";
import { buildManifest } from "../shared/manifest.mjs";
import { writeJson, writeText } from "../shared/io.mjs";

const executablePath = process.env.STASIS_EXECUTABLE;
if (typeof executablePath !== "string" || executablePath.length === 0) {
  throw new Error("STASIS_EXECUTABLE must name the frozen native candidate");
}

const manifest = await buildManifest(executablePath);
console.log(await writeJson("manifest.json", manifest));

const playwright = await runPlaywrightProof();
console.log(await writeJson("crawlee/playwright-raw.json", playwright));
if (
  !playwright.primary.success ||
  playwright.negativeControls.some((control) => !control.success)
) {
  throw new Error("The pinned Crawlee/Playwright baseline failed; candidate comparison is invalid");
}

const stasis = await runStasisProof(executablePath);
console.log(await writeJson("crawlee/stasis-raw.json", stasis));

const comparison = compareCrawl(playwright, stasis);
console.log(await writeJson("crawlee/compatibility.json", comparison));
console.log(await writeText("crawlee/report.md", crawlReportMarkdown(comparison)));
if (!comparison.baselineValid || !comparison.candidateValid) {
  throw new Error("The crawl comparison artifact failed its frozen evidence validation");
}
