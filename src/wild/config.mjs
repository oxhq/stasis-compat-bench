import path from "node:path";

import { repositoryRoot } from "../shared/io.mjs";

export const protocol = "stasis-post-0.3-census-v1";
export const trancoListId = "74V4X";
export const selectionSeed = `${protocol}|tranco:${trancoListId}`;
export const userAgent = "StasisCompatibilityCensus/1.0";

export const trancoSourceIdentity = Object.freeze({
  schema: "stasis-wild-source-v1",
  provider: "Tranco",
  listId: trancoListId,
  createdOn: "2026-08-25T22:00:02.381111",
  permanentListUrl: "https://tranco-list.eu/list/74V4X/full",
  downloadUrl: "https://tranco-list.eu/download/74V4X/1000000",
  methodologyUrl: "https://tranco-list.eu/methodology",
  localIgnoredFile: "inputs/tranco-74V4X-top-1m.csv",
  bytes: 22_695_497,
  sha256: "23f4686d95c1287765d43b4219eccb62a9575bbd5dbbd20d44fc280403135118",
  rowCount: 1_000_000,
  configuration: Object.freeze({
    aggregation: "Dowdall",
    filterPayLevelDomain: true,
    dateFrom: "2026-07-27",
    dateTo: "2026-08-25",
    providers: Object.freeze(["crux", "farsight", "majestic", "radar", "umbrella"]),
  }),
});
export const trancoSourceMetadataSha256 = "fe121ea509b650659d272b6050e6065ecdf428dd9350801ee28a6859b09d2795";

export const trancoSourceMetadataPath = path.join(
  repositoryRoot,
  "corpora",
  "tranco-74V4X-source.json",
);
export const trancoInputPath = path.join(
  repositoryRoot,
  "inputs",
  "tranco-74V4X-top-1m.csv",
);
export const selectedCorpusPath = path.join(
  repositoryRoot,
  "corpora",
  "wild-tranco-74V4X-v1.json",
);
export const preflightLedgerPath = path.join(
  repositoryRoot,
  "corpora",
  "wild-tranco-74V4X-v1-preflight.json",
);

export const candidate = Object.freeze({
  revision: "cd471fb2f515e1f7227581fb8930e04bd6414767",
  version: "0.3.0",
  executableSha256: "bd6715f5cc30ec66ea2d3b9c0889698ecea54373a3c3ab2c1893c934573916d1",
  sdkSha256: "56bd1860c0f1b4a05a32feb6ee41e71ff1c5947dbe44c2c4e30a31ca40b6bbb4",
  profile: "controlled-web-session-v2",
});

export const networkPolicyIdentity = Object.freeze({
  mode: "live",
  routeCount: 188,
  sha256: "90833c8a995ee2070e21869169430a2453b1d9451ed2e7a9e59ab5922c2dfbe1",
  encodedBytes: 19_612,
});
export const networkPolicySmokePath = "wild-network-policy-smoke.json";

export const repairedRerunIdentity = Object.freeze({
  erratum: Object.freeze({
    path: "protocol/stasis-post-0.3-census-v1-erratum-1.md",
    bytes: 3_164,
    sha256: "a5289d8483e35519c5c6bf5080d65dbf94dde32424085f34e6931d1f594e9969",
  }),
  projectionErratum: Object.freeze({
    path: "protocol/stasis-post-0.3-census-v1-erratum-2.md",
    bytes: 7_767,
    sha256: "ed099546ce5b8c9100a48ebaa3c1488e3dda383f66fea320d1b5afd0b7037ff5",
  }),
  priorInvalidAttempt: Object.freeze({
    runId: "wild-paired-fe64d0d-authoritative",
    harnessCommit: "fe64d0d37df6afc85a63e124a9aac4a28fd8dbd9",
    artifactIndexSha256: "7fed976c9a0ac1b510eb9783266209c20abcaae0cccf5a3aee7e9198063c3608",
    summarySha256: "d0ea5b76f62a90172f628e08a60e9ee4ebde6a3cc37b31881e7da880fe51debc",
    selectedCount: 100,
    baselineExcluded: 6,
    stasisAttempted: 94,
    sharedErrorCode: "invalid_request",
    validPairedDenominator: 0,
    evidenceWeight: 0,
  }),
  priorIncompleteAttempt: Object.freeze({
    runId: "wild-paired-a7ffd90-authoritative-rerun",
    harnessCommit: "a7ffd90f0ad8c91aa5122564f0e8bb1cbc34750f",
    artifactRootTree: Object.freeze({
      sha256: "c52da858d83805afbce5562db790ec5c8cfaac1d609bd6663bce86770a04f836",
      fileCount: 501,
      totalBytes: 919_419,
    }),
    wildTree: Object.freeze({
      sha256: "3e0821951ad3c2aaae7c49798cd53de800e4faf3cbfb61f4d3d2b77e0d6d841e",
      fileCount: 500,
      totalBytes: 917_410,
    }),
    rawTree: Object.freeze({
      sha256: "121e66abe6672e2bd5aa3ed3659eb9742a02a9ed06f865d4775ea3a9e5e3c2ab",
      fileCount: 400,
      totalBytes: 820_069,
    }),
    caseTree: Object.freeze({
      sha256: "c92a3876d74d10f44d238e33fa37aea4fee0a62d9ae55dd778552f3ccee6e946",
      fileCount: 100,
      totalBytes: 97_341,
    }),
    networkPolicySmokeSha256:
      "39903873565415280c73db5cd6f2774b1ed32cb4d95912653bb3556b02efd0d7",
    reconstructedSummary: Object.freeze({
      sha256: "c6c0afc4c25d4cab39cdddf42f61c321d46d56901d482a73bdfda13ab09514ea",
      bytes: 7_071,
    }),
    selectedCount: 100,
    rawRecordCount: 400,
    caseClassificationCount: 100,
    summaryWritten: false,
    artifactIndexWritten: false,
    failureStage: "summary_serialization",
    terminal: "summary_privacy_projection_rejected",
    decisionEligibleDenominator: 0,
    evidenceWeight: 0,
  }),
});

export const expectedVersions = Object.freeze({
  node: "v22.20.0",
  crawlee: "3.18.1",
  playwright: "1.62.1",
});

export const evidenceIdentity = Object.freeze({
  url: Object.freeze({
    algorithm: "sha256-domain-separated-utf8-v1",
    domain: "stasis-wild-url-identity-v1",
    canonicalization: "whatwg-http-url-query-preserved-fragment-removed",
  }),
  title: Object.freeze({
    algorithm: "sha256-domain-separated-utf8-v1",
    domain: "stasis-wild-title-identity-v1",
    canonicalization: "unicode-whitespace-collapsed-trimmed",
  }),
});

export const preflightRules = Object.freeze({
  seed: selectionSeed,
  userAgent,
  rootMethod: "GET",
  rootScheme: "https",
  concurrency: 1,
  requestRetries: 0,
  alternateHostFallback: false,
  antiBotBypass: false,
  publicTargetGate: true,
  robotsFailClosed: true,
  challengePagesExcluded: true,
  evidenceIdentity,
});

export const runtimePins = Object.freeze({
  nodeExecutableBasename: "node.exe",
  nodeExecutableBytes: 85_588_976,
  nodeExecutableSha256: "fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d",
  candidateSdkTarballBytes: 176_445,
  candidateSdkTarballSha256: candidate.sdkSha256,
  candidateSdkTree: Object.freeze({
    sha256: "c38928c342d804f2e5776945ef295162f5f755a3c0bd224b5ef16e1498998449",
    fileCount: 55,
    totalBytes: 876_195,
  }),
  crawleeTree: Object.freeze({
    sha256: "114dc8dddef30fb156b8dade09a9d46bf35c5c4a5f2c6cb9e2842f6ed952c921",
    fileCount: 8,
    totalBytes: 35_412,
  }),
  playwrightTree: Object.freeze({
    sha256: "dd24f068be6bfa4c5c81985b30d45e7cf7dd4bd34baf0d5f7c6b29257c22d3ee",
    fileCount: 62,
    totalBytes: 5_074_152,
  }),
  // Measured after an exact `npm ci` from the restored v0.2.1 lock.
  installedNodeModulesTree: Object.freeze({
    sha256: "57d66e9c964a071ed98ee124665e6735875e2a871bfadc3dad42d3d35a62e5fe",
    fileCount: 11_454,
    totalBytes: 94_553_660,
  }),
  chromiumExecutableBasename: "chrome.exe",
  chromiumExecutableBytes: 4_024_832,
  chromiumExecutableSha256: "409805a16d6416087e6b2f778df1cf8f7bbb267d6b99f6b5bb0a618eace234f2",
});

export const strata = Object.freeze([
  Object.freeze({ id: "rank-1-1000", minRank: 1, maxRank: 1_000, quota: 20, maxAttempts: 250 }),
  Object.freeze({ id: "rank-1001-10000", minRank: 1_001, maxRank: 10_000, quota: 20, maxAttempts: 250 }),
  Object.freeze({ id: "rank-10001-100000", minRank: 10_001, maxRank: 100_000, quota: 20, maxAttempts: 250 }),
  Object.freeze({ id: "rank-100001-500000", minRank: 100_001, maxRank: 500_000, quota: 20, maxAttempts: 250 }),
  Object.freeze({ id: "rank-500001-1000000", minRank: 500_001, maxRank: 1_000_000, quota: 20, maxAttempts: 250 }),
]);

export const baselineLimits = Object.freeze({
  navigationTimeoutSecs: 20,
  requestHandlerTimeoutSecs: 35,
  robotsTimeoutMs: 10_000,
  robotsMaxBytes: 512 * 1024,
  robotsMaxRedirects: 5,
});

export const settlePolicy = Object.freeze({
  persistentWork: "report",
  maxVirtualTimeNs: 30_000_000_000n,
  maxControlTurns: 100_000n,
  wallIoTimeoutNs: 20_000_000_000n,
});

export const stasisLimits = Object.freeze({
  commandTimeoutMs: 60_000,
  workloadTimeoutMs: 75_000,
});
