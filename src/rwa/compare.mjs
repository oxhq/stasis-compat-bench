import { compareRwa } from "./compare-lib.mjs";
import { rwaReportMarkdown } from "./report.mjs";
import { readJson, writeJson, writeText } from "../shared/io.mjs";

const comparison = compareRwa(
  await readJson("rwa/cypress-raw.json"),
  await readJson("rwa/stasis-raw.json"),
);
console.log(await writeJson("rwa/compatibility.json", comparison));
console.log(await writeText("rwa/report.md", rwaReportMarkdown(comparison)));
if (!comparison.baselineValid || !comparison.candidateValid) process.exitCode = 1;
