import { candidateV03 } from "../shared/candidate-v03.mjs";

export const deterministicV03Protocol = "stasis-post-0.3-census-v1";
export const deterministicV03Track = "deterministic-crawling";
export const deterministicV03ArtifactPrefix =
  `${deterministicV03Protocol}/deterministic`;

export const deterministicV03BaselineEnvelope = Object.freeze({
  schema: "stasis-post-0.3-deterministic-playwright-raw-v1",
  protocol: deterministicV03Protocol,
  track: deterministicV03Track,
  runner: "crawlee-playwright",
  versions: Object.freeze({
    node: "v22.20.0",
    crawlee: "3.18.1",
    playwright: "1.62.1",
    chromiumRevisionDirectory: "chromium-1234",
    chromiumVersion: "151.0.7922.34",
    chromiumExecutableSha256:
      "409805a16d6416087e6b2f778df1cf8f7bbb267d6b99f6b5bb0a618eace234f2",
  }),
  rules: Object.freeze({
    concurrency: 1,
    maxRequestRetries: 0,
    maxPages: 20,
    maxDepth: 2,
    persistStorage: false,
    useSessionPool: false,
  }),
});

export const deterministicV03CandidateEnvelope = Object.freeze({
  schema: "stasis-post-0.3-deterministic-stasis-raw-v1",
  protocol: deterministicV03Protocol,
  track: deterministicV03Track,
  runner: "stasis-reference-crawler-v03",
  versions: Object.freeze({
    node: "v22.20.0",
    sdk: candidateV03.version,
    sourceRevision: candidateV03.revision,
    executableSha256: candidateV03.executableSha256,
    sdkArchiveSha256: candidateV03.sdkArchiveSha256,
    sdkArchiveBytes: candidateV03.sdkArchiveBytes,
    sdkTree: Object.freeze({
      sha256: candidateV03.sdkTreeSha256,
      fileCount: candidateV03.sdkTreeFileCount,
      totalBytes: candidateV03.sdkTreeBytes,
    }),
  }),
  rules: Object.freeze({
    concurrency: 1,
    maxRequestRetries: 0,
    maxPages: 20,
    maxDepth: 2,
    profile: candidateV03.profile,
    fallback: false,
  }),
});
