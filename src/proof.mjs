import { compareCrawl } from "./crawl/compare-lib.mjs";
import { runPlaywrightProof } from "./crawl/playwright-lane.mjs";
import { crawlReportMarkdown } from "./crawl/report.mjs";
import { runStasisProof } from "./crawl/stasis-lane.mjs";
import { compareRwa } from "./rwa/compare-lib.mjs";
import { probeRwaServers, runCypressBaseline } from "./rwa/run-cypress.mjs";
import { runStasisRwaProof } from "./rwa/stasis-lane.mjs";
import { rwaReportMarkdown } from "./rwa/report.mjs";
import {
  assertFreshSealedArtifactRoot,
  sha256DirectoryTree,
  writeJson,
  writeText,
} from "./shared/io.mjs";
import { buildManifest, FROZEN_IDENTITIES } from "./shared/manifest.mjs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

for (const variable of ["RWA_APP_ORIGIN", "RWA_API_ORIGIN"]) {
  if (Object.hasOwn(process.env, variable)) {
    throw new Error(`${variable} is forbidden: the sealed proof uses the frozen localhost origins`);
  }
}

const executablePath = process.env.STASIS_EXECUTABLE;
if (typeof executablePath !== "string" || executablePath.length === 0) {
  throw new Error("STASIS_EXECUTABLE must name the frozen native candidate");
}

await assertFreshSealedArtifactRoot();

const manifest = await buildManifest(executablePath);
console.log(await writeJson("manifest.json", manifest));

const playwright = await runPlaywrightProof();
console.log(await writeJson("crawlee/playwright-raw.json", playwright));
const stasisCrawl = await runStasisProof(executablePath);
console.log(await writeJson("crawlee/stasis-raw.json", stasisCrawl));
const crawlComparison = compareCrawl(playwright, stasisCrawl);
console.log(await writeJson("crawlee/compatibility.json", crawlComparison));
console.log(await writeText("crawlee/report.md", crawlReportMarkdown(crawlComparison)));

const { artifact: cypress } = await runCypressBaseline();
const serversAfterCypressBaseline = await probeRwaServers({ upstreamRoot: manifest.rwa.root });
if (!isDeepStrictEqual(serversAfterCypressBaseline, cypress.runtime.externalServers)) {
  throw new Error("RWA listener or served-build identity changed during the Cypress baseline");
}
const rwaBuildAfterBaseline = await assertFrozenRwaBuildTree(
  "after Cypress baseline",
  manifest.rwa.root,
);
const stasisRwa = await runStasisRwaProof(executablePath);
const serversAfterStasisCandidate = await probeRwaServers({ upstreamRoot: manifest.rwa.root });
if (!isDeepStrictEqual(serversAfterStasisCandidate, serversAfterCypressBaseline)) {
  throw new Error("RWA listener or served-build identity changed between paired lanes");
}
const rwaBuildAfterCandidate = await assertFrozenRwaBuildTree(
  "after Stasis candidate",
  manifest.rwa.root,
);
console.log(
  await writeJson("rwa/build-tree-guard.json", {
    schema: "stasis-compat-rwa-build-tree-guard-v1",
    protocol: FROZEN_IDENTITIES.protocol,
    expected: FROZEN_IDENTITIES.rwa.buildTree,
    afterCypressBaseline: rwaBuildAfterBaseline,
    afterStasisCandidate: rwaBuildAfterCandidate,
    serversAfterCypressBaseline,
    serversAfterStasisCandidate,
  }),
);
console.log(await writeJson("rwa/stasis-raw.json", stasisRwa));
const rwaComparison = compareRwa(cypress, stasisRwa);
console.log(await writeJson("rwa/compatibility.json", rwaComparison));
console.log(await writeText("rwa/report.md", rwaReportMarkdown(rwaComparison)));

if (
  !crawlComparison.baselineValid ||
  !crawlComparison.candidateValid ||
  !rwaComparison.baselineValid ||
  !rwaComparison.candidateValid
) {
  throw new Error("A baseline or candidate artifact was invalid; inspect the retained raw terminals");
}

console.log("Scientific run complete. Stop the RWA servers, restore data/database.json, then run npm run finalize.");

async function assertFrozenRwaBuildTree(stage, rwaRoot) {
  const actual = await sha256DirectoryTree(path.join(rwaRoot, "build"));
  if (!isDeepStrictEqual(actual, FROZEN_IDENTITIES.rwa.buildTree)) {
    throw new Error(
      `RWA production build drifted ${stage}: expected ${JSON.stringify(FROZEN_IDENTITIES.rwa.buildTree)}, got ${JSON.stringify(actual)}`,
    );
  }
  return actual;
}
