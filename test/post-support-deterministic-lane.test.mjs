import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPostSupportCandidateSpec,
  postSupportProfile,
  postSupportRevision,
} from "../src/post-support/candidate-identity.mjs";
import {
  adaptPostSupportDeterministicForFrozenValidator,
  comparePostSupportDeterministic,
  postSupportDeterministicRunner,
  postSupportDeterministicSchema,
  runPostSupportDeterministicProof,
} from "../src/post-support/deterministic-lane.mjs";
import { compareDeterministicV03 } from "../src/crawl-v03/compare-lib.mjs";

test("post-support deterministic lane keeps the frozen denominator and selects v2", async () => {
  const profiles = [];
  const starts = [];
  let poolCloses = 0;
  const candidate = verifiedCandidate({
    createStasisSessionPool: () => ({ async close() { poolCloses += 1; } }),
    async crawlWithStasis(_pool, options) {
      profiles.push(options.profile);
      starts.push(options.start);
      return { pages: [] };
    },
  });
  const raw = await runPostSupportDeterministicProof(candidate, {});
  assert.equal(raw.schema, postSupportDeterministicSchema);
  assert.equal(raw.runner, postSupportDeterministicRunner);
  assert.equal(raw.rules.maxPages, 20);
  assert.deepEqual(profiles, [postSupportProfile, postSupportProfile, postSupportProfile]);
  assert.equal(starts.length, 3);
  assert.equal(poolCloses, 3);
  assert.equal(JSON.stringify(raw).includes("C:\\private"), false);
});

test("frozen deterministic comparator is reused only through an explicit identity projection", async () => {
  const prefix = "test/fixtures/deterministic-v03/stasis-post-0.3-census-v1/deterministic";
  const [baseline, oldCandidate] = await Promise.all([
    readJson(`${prefix}/playwright-raw.json`),
    readJson(`${prefix}/stasis-raw.json`),
  ]);
  const actual = {
    schema: postSupportDeterministicSchema,
    protocol: oldCandidate.protocol,
    track: oldCandidate.track,
    runner: postSupportDeterministicRunner,
    candidate: verifiedCandidate({
      createStasisSessionPool() {},
      crawlWithStasis() {},
    }).identity,
    rules: { ...oldCandidate.rules, profile: postSupportProfile },
    primary: oldCandidate.primary,
    negativeControls: oldCandidate.negativeControls,
  };
  assert.throws(
    () => comparePostSupportDeterministic(baseline, actual),
    /fresh direct in-process/u,
  );
  const comparison = compareDeterministicV03(
    baseline,
    adaptPostSupportDeterministicForFrozenValidator(actual),
  );
  assert.equal(comparison.baselineIdentityValid, true);
  assert.equal(comparison.primaryDenominator, 20);
  assert.equal(comparison.counts.BENCHMARK_INVALID ?? 0, 0);
});

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function verifiedCandidate(sdk) {
  const identity = createPostSupportCandidateSpec({
    packageRunId: "33506181780",
    packageRunAttempt: "1",
    revision: postSupportRevision,
    windowsZipPath: "C:\\private\\stasis-0.3.3-windows-x86_64-ci.zip",
    windowsZipSha256: "1".repeat(64),
    windowsZipBytes: "10",
    executablePath: "C:\\private\\stasis.exe",
    executableSha256: "2".repeat(64),
    executableBytes: "20",
    sdkArchivePath: "C:\\private\\oxhq-stasis-0.3.3.tgz",
    sdkArchiveSha256: "3".repeat(64),
    sdkArchiveBytes: "30",
    sdkProofPath: "C:\\private\\stasis-0.3.3-typescript-act-settle-inspect.json",
    sdkProofSha256: "5".repeat(64),
    sdkProofBytes: "50",
    sdkPackageRoot: "C:\\private\\oxhq-stasis-0.3.3\\package",
    sdkTreeSha256: "4".repeat(64),
    sdkTreeFileCount: "5",
    sdkTreeBytes: "40",
  });
  return { identity, executableSha256: identity.windows.executable.sha256, sdk: {
    ...sdk,
    CONTROLLED_WEB_SESSION_V2_PROFILE: postSupportProfile,
  } };
}
