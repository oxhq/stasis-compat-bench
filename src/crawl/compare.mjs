import { compareCrawl } from "./compare-lib.mjs";
import { crawlReportMarkdown } from "./report.mjs";
import { readJson, writeJson, writeText } from "../shared/io.mjs";

const comparison = compareCrawl(
  await readJson("crawlee/playwright-raw.json"),
  await readJson("crawlee/stasis-raw.json"),
);
console.log(await writeJson("crawlee/compatibility.json", comparison));
console.log(await writeText("crawlee/report.md", crawlReportMarkdown(comparison)));
if (!comparison.baselineValid || !comparison.candidateValid) process.exitCode = 1;
