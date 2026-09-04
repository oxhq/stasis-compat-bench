import { isDeepStrictEqual } from "node:util";

import { assertCrawlPerformanceRaw } from "./crawl.mjs";
import { assertRwaPerformanceRaw } from "./rwa.mjs";
import {
  assertStatisticsForPairs,
  summarizePairedDurations,
} from "./statistics.mjs";

const positiveDecimalPattern = /^[1-9][0-9]*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

const pairedCount = 10;
const stasisStatisticsLabel = "stasis";

const claimBoundary = deepFreeze({
  scope: "per_track_single_host_exploratory_only",
  crossHostClaimed: false,
  generalSpeedClaimed: false,
  interpretation:
    "Each retained timing summary is single-host and exploratory within its own preregistered track. This combined artifact does not pool the Windows RWA and hosted Linux crawl timings into a cross-host benchmark and does not support a general speed claim.",
});

const rwaWorkloadInterpretation =
  "RWA timings compare the same complete eight application intents from the frozen authentication slice. They are not a Cypress API-equivalence claim and not a claim about all 45 RWA tests.";

const crawlWorkloadInterpretation =
  "Crawl timings compare the complete frozen deterministic 20-page workload on its retained host only. They do not support a cross-host or general speed claim.";

export const combinedPerformanceEvidenceSchema =
  "stasis-v0.3.3-combined-performance-evidence-v1";

export function buildCombinedPerformanceEvidence({ rwaRaw, crawlRaw }) {
  const validatedRwa = assertRwaPerformanceRaw(rwaRaw);
  if (validatedRwa.authority?.valid !== true || validatedRwa.authority?.status !== "valid") {
    throw new TypeError("Combined performance evidence requires a valid RWA raw authority");
  }
  const validatedCrawl = assertCrawlPerformanceRaw(crawlRaw);
  if (validatedCrawl.authority?.valid !== true || validatedCrawl.authority?.status !== "valid") {
    throw new TypeError("Combined performance evidence requires a valid crawl raw authority");
  }

  const rwaPairs = extractRwaPairs(validatedRwa);
  const crawlPairs = extractCrawlPairs(validatedCrawl);

  return deepFreeze({
    schema: combinedPerformanceEvidenceSchema,
    authority: {
      status: "valid",
      valid: true,
      rule: "both_track_authorities_must_be_valid",
    },
    claimBoundary: structuredClone(claimBoundary),
    rwa: {
      protocol: validatedRwa.protocol,
      rawSchema: validatedRwa.schema,
      track: validatedRwa.track,
      host: structuredClone(validatedRwa.host),
      hostBinding: {
        field: "instanceDigest",
        digest: validatedRwa.host.instanceDigest,
      },
      workload: {
        denominatorKind: "application_intents",
        denominatorCount: validatedRwa.plan.denominator,
        timedPairs: validatedRwa.plan.pairedSamples,
        interpretation: rwaWorkloadInterpretation,
      },
      pairs: rwaPairs,
      statistics: summarizePairedDurations(
        rwaPairs.map((pair) => ({
          baselineNs: pair.baselineDurationNs,
          candidateNs: pair.stasisDurationNs,
        })),
        { baselineLabel: "cypress", candidateLabel: stasisStatisticsLabel },
      ),
    },
    crawl: {
      protocol: validatedCrawl.protocol,
      rawSchema: validatedCrawl.schema,
      track: validatedCrawl.track,
      host: structuredClone(validatedCrawl.identity.host),
      hostBinding: {
        field: "bootInstanceDigest",
        digest: validatedCrawl.identity.host.bootInstanceDigest,
      },
      workload: {
        denominatorKind: "pages",
        denominatorCount: validatedCrawl.authority.primaryPagesPerLane,
        timedPairs: validatedCrawl.authority.requiredPairs,
        interpretation: crawlWorkloadInterpretation,
      },
      pairs: crawlPairs,
      statistics: summarizePairedDurations(
        crawlPairs.map((pair) => ({
          baselineNs: pair.baselineDurationNs,
          candidateNs: pair.stasisDurationNs,
        })),
        { baselineLabel: "crawlee", candidateLabel: stasisStatisticsLabel },
      ),
    },
  });
}

export function assertCombinedPerformanceEvidence(value, raws) {
  assertCombinedPerformanceEvidenceShape(value);
  const expected = buildCombinedPerformanceEvidence(raws);
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new TypeError(
      "Combined performance evidence does not replay exactly from the retained raw authorities",
    );
  }
  return value;
}

export function renderCombinedPerformanceEvidenceMarkdown(value) {
  const evidence = assertCombinedPerformanceEvidenceShape(value);
  return `# Stasis v0.3.3 combined performance evidence

${evidence.claimBoundary.interpretation}

## RWA track

- Protocol: \`${evidence.rwa.protocol}\`
- Raw schema: \`${evidence.rwa.rawSchema}\`
- Track: \`${evidence.rwa.track}\`
- Host: \`${evidence.rwa.host.platform}/${evidence.rwa.host.arch}\` on \`${evidence.rwa.host.imageOs}\` \`${evidence.rwa.host.imageVersion}\`
- Host instance digest: \`${evidence.rwa.hostBinding.digest}\`
- Workload: ${evidence.rwa.workload.denominatorCount} complete application intents across ${evidence.rwa.workload.timedPairs} exact AB/BA pairs
- Boundary: ${evidence.rwa.workload.interpretation}
- Cypress median / IQR: ${evidence.rwa.statistics.cypress.medianMilliseconds} ms / ${evidence.rwa.statistics.cypress.iqrMilliseconds} ms
- Stasis median / IQR: ${evidence.rwa.statistics.stasis.medianMilliseconds} ms / ${evidence.rwa.statistics.stasis.iqrMilliseconds} ms
- Median paired Cypress-over-Stasis ratio: ${evidence.rwa.statistics.pairedBaselineOverCandidate.decimal}x

| Pair | Order | Cypress ns | Stasis ns |
| ---: | :---: | ---: | ---: |
${renderPairRows(evidence.rwa.pairs)}

## Crawl track

- Protocol: \`${evidence.crawl.protocol}\`
- Raw schema: \`${evidence.crawl.rawSchema}\`
- Track: \`${evidence.crawl.track}\`
- Host: \`${evidence.crawl.host.platform}/${evidence.crawl.host.arch}\` on \`${evidence.crawl.host.imageOs}\` \`${evidence.crawl.host.imageVersion}\`
- Host boot-instance digest: \`${evidence.crawl.hostBinding.digest}\`
- Workload: ${evidence.crawl.workload.denominatorCount} complete frozen pages across ${evidence.crawl.workload.timedPairs} exact AB/BA pairs
- Boundary: ${evidence.crawl.workload.interpretation}
- Crawlee median / IQR: ${evidence.crawl.statistics.crawlee.medianMilliseconds} ms / ${evidence.crawl.statistics.crawlee.iqrMilliseconds} ms
- Stasis median / IQR: ${evidence.crawl.statistics.stasis.medianMilliseconds} ms / ${evidence.crawl.statistics.stasis.iqrMilliseconds} ms
- Median paired Crawlee-over-Stasis ratio: ${evidence.crawl.statistics.pairedBaselineOverCandidate.decimal}x

| Pair | Order | Crawlee ns | Stasis ns |
| ---: | :---: | ---: | ---: |
${renderPairRows(evidence.crawl.pairs)}
`;
}

function assertCombinedPerformanceEvidenceShape(value) {
  exactKeys(value, ["authority", "claimBoundary", "crawl", "rwa", "schema"], "combined performance evidence");
  if (value.schema !== combinedPerformanceEvidenceSchema) {
    throw new TypeError("Invalid combined performance evidence schema");
  }

  exactKeys(value.authority, ["rule", "status", "valid"], "combined performance evidence authority");
  if (
    value.authority.status !== "valid" ||
    value.authority.valid !== true ||
    value.authority.rule !== "both_track_authorities_must_be_valid"
  ) {
    throw new TypeError("Invalid combined performance evidence authority");
  }

  exactKeys(value.claimBoundary, [
    "crossHostClaimed",
    "generalSpeedClaimed",
    "interpretation",
    "scope",
  ], "combined performance evidence claim boundary");
  if (
    value.claimBoundary.scope !== claimBoundary.scope ||
    value.claimBoundary.crossHostClaimed !== false ||
    value.claimBoundary.generalSpeedClaimed !== false ||
    value.claimBoundary.interpretation !== claimBoundary.interpretation
  ) {
    throw new TypeError("Invalid combined performance evidence claim boundary");
  }

  assertTrackEvidenceShape(value.rwa, {
    label: "RWA",
    baselineRunner: "cypress",
    baselineLabel: "cypress",
    hostBindingField: "instanceDigest",
    hostKeys: [
      "arch",
      "cpuModel",
      "identityDigest",
      "imageOs",
      "imageVersion",
      "instanceDigest",
      "logicalCpuCount",
      "platform",
      "runnerOs",
    ],
    workloadInterpretation: rwaWorkloadInterpretation,
    denominatorCount: 8,
    denominatorKind: "application_intents",
  });
  assertTrackEvidenceShape(value.crawl, {
    label: "crawl",
    baselineRunner: "crawlee",
    baselineLabel: "crawlee",
    hostBindingField: "bootInstanceDigest",
    hostKeys: [
      "arch",
      "bootInstanceDigest",
      "cpuModel",
      "hostClassDigest",
      "imageOs",
      "imageVersion",
      "logicalCpuCount",
      "platform",
      "runnerOs",
    ],
    workloadInterpretation: crawlWorkloadInterpretation,
    denominatorCount: 20,
    denominatorKind: "pages",
  });
  return value;
}

function assertTrackEvidenceShape(value, {
  label,
  baselineRunner,
  baselineLabel,
  hostBindingField,
  hostKeys,
  workloadInterpretation,
  denominatorCount,
  denominatorKind,
}) {
  exactKeys(value, [
    "host",
    "hostBinding",
    "pairs",
    "protocol",
    "rawSchema",
    "statistics",
    "track",
    "workload",
  ], `${label} combined performance track`);
  exactKeys(value.hostBinding, ["digest", "field"], `${label} host binding`);
  if (
    value.hostBinding.field !== hostBindingField ||
    typeof value.hostBinding.digest !== "string" ||
    !sha256Pattern.test(value.hostBinding.digest)
  ) {
    throw new TypeError(`Invalid ${label} host binding`);
  }
  exactKeys(value.workload, [
    "denominatorCount",
    "denominatorKind",
    "interpretation",
    "timedPairs",
  ], `${label} workload`);
  if (
    value.workload.denominatorKind !== denominatorKind ||
    value.workload.denominatorCount !== denominatorCount ||
    value.workload.timedPairs !== pairedCount ||
    value.workload.interpretation !== workloadInterpretation
  ) {
    throw new TypeError(`Invalid ${label} workload summary`);
  }
  if (!isPlainRecord(value.host) || !isDeepStrictEqual(Object.keys(value.host).sort(), [...hostKeys].sort())) {
    throw new TypeError(`Invalid ${label} retained host summary`);
  }
  if (value.host[hostBindingField] !== value.hostBinding.digest) {
    throw new TypeError(`Invalid ${label} host digest binding`);
  }

  const pairs = assertPairs(value.pairs, baselineRunner, label);
  assertStatisticsForPairs(
    value.statistics,
    pairs.map((pair) => ({
      baselineNs: pair.baselineDurationNs,
      candidateNs: pair.stasisDurationNs,
    })),
    { baselineLabel, candidateLabel: stasisStatisticsLabel },
  );
  return value;
}

function assertPairs(value, baselineRunner, label) {
  if (!Array.isArray(value) || value.length !== pairedCount) {
    throw new TypeError(`Combined performance evidence requires exactly ${pairedCount} ${label} pairs`);
  }
  return value.map((pair, index) => {
    exactKeys(pair, [
      "baselineDurationNs",
      "baselineRunner",
      "order",
      "pairIndex",
      "stasisDurationNs",
      "stasisRunner",
    ], `${label} pair ${index + 1}`);
    const expectedPairIndex = index + 1;
    const expectedOrder = expectedPairIndex % 2 === 1 ? "AB" : "BA";
    if (
      pair.pairIndex !== expectedPairIndex ||
      pair.order !== expectedOrder ||
      pair.baselineRunner !== baselineRunner ||
      pair.stasisRunner !== stasisStatisticsLabel ||
      !positiveDecimalPattern.test(pair.baselineDurationNs ?? "") ||
      !positiveDecimalPattern.test(pair.stasisDurationNs ?? "")
    ) {
      throw new TypeError(`Invalid combined performance ${label} pair ${index + 1}`);
    }
    return pair;
  });
}

function extractRwaPairs(raw) {
  const pairs = [];
  for (let pairIndex = 1; pairIndex <= pairedCount; pairIndex += 1) {
    const order = pairIndex % 2 === 1 ? "AB" : "BA";
    const pairSamples = raw.samples.filter((sample) => sample.pairIndex === pairIndex);
    if (pairSamples.length !== 2) {
      throw new TypeError("Combined performance evidence requires ten complete RWA pairs");
    }
    const byRunner = Object.fromEntries(pairSamples.map((sample) => [sample.runner, sample]));
    const cypress = byRunner.cypress;
    const stasis = byRunner["stasis-v0.3.3"];
    if (
      cypress?.status !== "passed" ||
      stasis?.status !== "passed" ||
      cypress?.timing?.durationNs === undefined ||
      stasis?.timing?.durationNs === undefined
    ) {
      throw new TypeError("Combined performance evidence requires a fully valid RWA authority");
    }
    pairs.push({
      pairIndex,
      order,
      baselineRunner: "cypress",
      stasisRunner: stasisStatisticsLabel,
      baselineDurationNs: cypress.timing.durationNs,
      stasisDurationNs: stasis.timing.durationNs,
    });
  }
  return pairs;
}

function extractCrawlPairs(raw) {
  if (!Array.isArray(raw.pairs) || raw.pairs.length !== pairedCount) {
    throw new TypeError("Combined performance evidence requires ten complete crawl pairs");
  }
  return raw.pairs.map((pair, index) => {
    const pairIndex = index + 1;
    const order = pairIndex % 2 === 1 ? "AB" : "BA";
    if (pair.pairIndex !== pairIndex || pair.order !== order || pair.observations.length !== 2) {
      throw new TypeError("Combined performance evidence requires ten exact crawl pairs");
    }
    const byLane = Object.fromEntries(pair.observations.map((observation) => [observation.lane, observation]));
    const crawlee = byLane.crawlee;
    const stasis = byLane.stasis;
    if (
      crawlee?.oracle?.valid !== true ||
      stasis?.oracle?.valid !== true ||
      pair.equivalence?.valid !== true ||
      !positiveDecimalPattern.test(crawlee?.timing?.durationNs ?? "") ||
      !positiveDecimalPattern.test(stasis?.timing?.durationNs ?? "")
    ) {
      throw new TypeError("Combined performance evidence requires a fully valid crawl authority");
    }
    return {
      pairIndex,
      order,
      baselineRunner: "crawlee",
      stasisRunner: stasisStatisticsLabel,
      baselineDurationNs: crawlee.timing.durationNs,
      stasisDurationNs: stasis.timing.durationNs,
    };
  });
}

function renderPairRows(pairs) {
  return pairs
    .map(
      (pair) =>
        `| ${pair.pairIndex} | ${pair.order} | ${pair.baselineDurationNs} | ${pair.stasisDurationNs} |`,
    )
    .join("\n");
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value) || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) {
    throw new TypeError(`Invalid ${label}`);
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
