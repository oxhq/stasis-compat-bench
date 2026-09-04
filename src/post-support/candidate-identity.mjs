import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { sha256DirectoryTree, sha256File } from "../shared/io.mjs";
import {
  materializeVerifiedSdkArchiveTreeBinding,
  materializeVerifiedWindowsZipExecutableBinding,
} from "./archive-binding.mjs";

export const postSupportRevision = "48c5a718a9ddd63f496e45307e1484974ccf8587";
export const postSupportVersion = "0.3.3";
export const postSupportPackageRunId = 33_506_181_780;
export const postSupportPackageRunAttempt = 1;
export const postSupportProfile = "controlled-web-session-v2";
export const postSupportNodeVersion = "v22.20.0";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const privatePaths = new WeakMap();
const verifiedCandidateProvenance = new WeakMap();
const verifiedCandidateRuntime = new WeakMap();
const defaultCandidateVerificationDependencies = Object.freeze({});
const distributionArchiveFiles = Object.freeze([
  "INSTALL.txt",
  "LICENSE",
  "LICENSE_WHATWG_SPECS",
  "NATIVE-LIBRARIES.txt",
  "README.md",
  "SOURCE.txt",
  "STASIS_UPSTREAM.toml",
  "THIRD_PARTY_LICENSES.html",
  "VERSION.txt",
  "controlled-web-session-v2.json",
  "session-v0.3-candidate.md",
  "stasis",
]);

const exactHostedProofSlices = deepFreeze({
  v2DirectDataSvg: {
    profile: postSupportProfile,
    navigationBoundary: "controlled_ready",
    outcome: "quiescent",
    producerPending: "0",
    producerTerminal: false,
    pendingImages: "0",
    runtimeFailures: "0",
    unsupportedWork: "0",
    externalIo: "0",
    completionTrace: "load:0>loadend:0|now:0",
    evidenceProfile: postSupportProfile,
    httpNavigationBoundary: "controlled_ready",
    httpOutcome: "quiescent",
    httpProducerPending: "0",
    httpProducerTerminal: false,
    httpPendingImages: "0",
    httpRuntimeFailures: "0",
    httpUnsupportedWork: "0",
    httpExternalIo: "0",
    httpCompletionTrace:
      "loaded:load:0>loadend:0|failed:error:0>loadend:0|cached:load:0|now:0",
    httpEvidenceProfile: postSupportProfile,
    sameControlledSession: true,
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  },
  v2InlineSvgRendering: {
    profile: postSupportProfile,
    navigationBoundary: "controlled_ready",
    outcome: "quiescent",
    producerPending: "0",
    producerTerminal: false,
    pendingImages: "0",
    runtimeFailures: "0",
    unsupportedWork: "0",
    externalIo: "0",
    fixtureTrace: "inline-svg:4x3|events:0|now:0",
    domCompletionEvents: "0",
    evidenceProfile: postSupportProfile,
    sharedNavigationBoundary: "controlled_ready",
    sharedOutcome: "quiescent",
    sharedProducerPending: "0",
    sharedProducerTerminal: false,
    sharedPendingImages: "0",
    sharedRuntimeFailures: "0",
    sharedUnsupportedWork: "0",
    sharedExternalIo: "0",
    sharedFixtureTrace: "shared-inline-svg:12|now:0",
    sharedEvidenceProfile: postSupportProfile,
    sameControlledSession: true,
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  },
  v2SettlementUrl: {
    profile: postSupportProfile,
    navigationBoundary: "controlled_ready",
    controlledOpenUrl: "https://packed-sdk-message-channel-v2.example.test/",
    initialOutcome: "quiescent",
    initialUrl:
      "https://packed-sdk-settlement-url-v2.example.test/settlement-url/replaced?proof=initial#attested",
    historyOutcome: "quiescent",
    historyUrl:
      "https://packed-sdk-settlement-url-v2.example.test/settlement-url/pushed?proof=history#attested",
    replacementOutcome: "quiescent",
    replacementUrl:
      "https://packed-sdk-settlement-url-v2.example.test/settlement-url/final?proof=replacement#attested",
    replacementTrace: "replaced",
    sessionUrlStayedAtControlledOpen: true,
    sessionEvidenceExcludesUrl: true,
    standaloneEvidenceExcludesUrl: true,
    unsupportedOutcome: "unsupported_work",
    unsupportedFailureCode: "unsupported_clock_surface",
    unsupportedUrl: "https://packed-sdk-automation-event-timestamps-v2.example.test/",
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  },
  v2PersistentIntervalProgression: {
    profile: postSupportProfile,
    navigationBoundary: "controlled_ready",
    sessionBaselineVirtualTimeNs: "260000000",
    documentElapsedTimeNs: "12000000000",
    implicitVirtualTimeNs: "12260000000",
    implicitPersistentTimers: "1",
    implicitFutureFinite: "0",
    implicitTrace: "interval:1@5000|interval:2@10000|finite@12000",
    strictOutcome: "blocked_on_open_ended_work",
    strictVirtualTimeNs: "12260000000",
    strictTrace: "interval:1@5000|interval:2@10000|finite@12000",
    reportOutcome: "quiescent_with_persistent_work",
    reportVirtualTimeNs: "12260000000",
    reportTrace: "interval:1@5000|interval:2@10000|finite@12000",
    persistentTimers: "1",
    futureFinite: "0",
    persistentKind: "timer",
    persistentReason: "interval",
    persistentCount: "1",
    requestedPeriodNs: "5000000000",
    runtimeFailures: "0",
    unsupportedWork: "0",
    externalIo: "0",
    evidenceProfile: postSupportProfile,
    sameControlledSession: true,
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  },
  v2InputMethodFocus: {
    profile: postSupportProfile,
    navigationBoundary: "controlled_ready",
    outcome: "quiescent",
    producerPending: "0",
    producerTerminal: false,
    runtimeFailures: "0",
    unsupportedWork: "0",
    externalIo: "0",
    completionTrace: "blurred|4|focus:trusted:0>focusin:trusted:0>blur:trusted:0>focusout:trusted:0|rwa-value|2:5",
    evidenceProfile: postSupportProfile,
    sameControlledSession: true,
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  },
  v2CookieSession: {
    profile: postSupportProfile,
    stateSchemaVersion: "1",
    stateProfile: postSupportProfile,
    responseCookieName: "remember_me",
    responseCookieExpiryUnixTimeNs: "2592000000000000",
    maxAgePrecedenceOverPastExpires: true,
    restoredSameSiteCookieSent: true,
    crossSiteResourceReachedServer: true,
    crossSiteLaxCookieFiltered: true,
    crossSiteRequestMethod: "GET",
    crossSiteRequestPath: "/probe.js",
    evidenceProfile: postSupportProfile,
    memoryOnlyExplicitStatePortability: true,
    noImportControlCookieCount: "0",
    noImportControlRequestCookieHeaderEmpty: true,
    noImportControlSameHostContext: true,
    cookieTimeRangeFailureCode: "unsupported_cookie_time_range",
    cookieTimeRangeFatal: false,
    cookieTimeRangeStateEffect: "partial",
    cookieTimeRangeRequestReachedServer: false,
    credentialEnvironmentMode: "explicit_allowlist",
    freshExactBinaryProcesses: "4",
    gracefulCookieSessionProcesses: "4",
    managedRuntimeFallbackAccesses: "0",
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  },
});

const exactHostedAutomationEvidence = deepFreeze({
  profile: postSupportProfile,
  navigationBoundary: "controlled_ready",
  initialOutcome: "quiescent",
  controlledEventCount: "11",
  controlledTrace: "25|fill:input:25>activate:click:25>reset:reset:25>check:click:25>check:input:25>check:change:25>select:input:25>select:change:25>invalid:invalid:25>submit:submit:25>submit:formdata:25|not-read|20",
  browserEventCountAfterScriptProbe: "12",
  scriptCreatedConstructorCount: "5",
  scriptCreatedTrace: "0,0,0,0,0",
  rejectedOutcome: "unsupported_work",
  failureCode: "unsupported_clock_surface",
  unsupportedKind: "other",
  unsupportedCount: "1",
  unsupportedReason: "time_surface",
  unsupportedTimeSurface: "host_timestamp",
  evidenceProfile: postSupportProfile,
  sameControlledSession: true,
  exactBinaryLaunch: true,
  closeResponseAndEof: true,
});

const maxU128 = (1n << 128n) - 1n;
const automationAdvanceNs = 5_000_000n;

const environmentNames = Object.freeze({
  packageRunId: "STASIS_POST_SUPPORT_PACKAGE_RUN_ID",
  packageRunAttempt: "STASIS_POST_SUPPORT_PACKAGE_RUN_ATTEMPT",
  revision: "STASIS_POST_SUPPORT_REVISION",
  windowsZipPath: "STASIS_POST_SUPPORT_WINDOWS_ZIP_PATH",
  windowsZipSha256: "STASIS_POST_SUPPORT_WINDOWS_ZIP_SHA256",
  windowsZipBytes: "STASIS_POST_SUPPORT_WINDOWS_ZIP_BYTES",
  executablePath: "STASIS_POST_SUPPORT_EXECUTABLE_PATH",
  executableSha256: "STASIS_POST_SUPPORT_EXECUTABLE_SHA256",
  executableBytes: "STASIS_POST_SUPPORT_EXECUTABLE_BYTES",
  sdkArchivePath: "STASIS_POST_SUPPORT_SDK_ARCHIVE_PATH",
  sdkArchiveSha256: "STASIS_POST_SUPPORT_SDK_ARCHIVE_SHA256",
  sdkArchiveBytes: "STASIS_POST_SUPPORT_SDK_ARCHIVE_BYTES",
  sdkProofPath: "STASIS_POST_SUPPORT_SDK_PROOF_PATH",
  sdkProofSha256: "STASIS_POST_SUPPORT_SDK_PROOF_SHA256",
  sdkProofBytes: "STASIS_POST_SUPPORT_SDK_PROOF_BYTES",
  sdkPackageRoot: "STASIS_POST_SUPPORT_SDK_PACKAGE_ROOT",
  sdkTreeSha256: "STASIS_POST_SUPPORT_SDK_TREE_SHA256",
  sdkTreeFileCount: "STASIS_POST_SUPPORT_SDK_TREE_FILE_COUNT",
  sdkTreeBytes: "STASIS_POST_SUPPORT_SDK_TREE_BYTES",
});

export function loadPostSupportCandidateSpec(environment = process.env) {
  return createPostSupportCandidateSpec(Object.fromEntries(
    Object.entries(environmentNames).map(([field, name]) => [field, required(environment, name)]),
  ));
}

export function createPostSupportCandidateSpec(input) {
  const revision = exactString(input?.revision, "revision");
  if (revision !== postSupportRevision) {
    throw new TypeError(`Post-support proof requires Stasis revision ${postSupportRevision}`);
  }
  const paths = Object.freeze({
    windowsZip: exactAbsolutePath(input.windowsZipPath, "Windows ZIP path"),
    executable: exactAbsolutePath(input.executablePath, "Windows executable path"),
    sdkArchive: exactAbsolutePath(input.sdkArchivePath, "SDK archive path"),
    sdkProof: exactAbsolutePath(input.sdkProofPath, "SDK proof path"),
    sdkPackageRoot: exactAbsolutePath(input.sdkPackageRoot, "SDK package root"),
  });
  if (path.basename(paths.windowsZip) !== "stasis-0.3.3-windows-x86_64-ci.zip") {
    throw new TypeError("Windows ZIP must retain the exact workflow artifact filename");
  }
  if (path.basename(paths.executable).toLowerCase() !== "stasis.exe") {
    throw new TypeError("Windows executable must be named stasis.exe");
  }
  if (path.basename(paths.sdkArchive) !== "oxhq-stasis-0.3.3.tgz") {
    throw new TypeError("SDK archive must retain the hosted package filename");
  }
  if (path.basename(paths.sdkProof) !== "stasis-0.3.3-typescript-act-settle-inspect.json") {
    throw new TypeError("SDK proof must retain the exact hosted package filename");
  }

  const packageRunId = positiveInteger(input.packageRunId, "hosted package run id");
  const packageRunAttempt = positiveInteger(
    input.packageRunAttempt,
    "hosted package run attempt",
  );
  if (
    packageRunId !== postSupportPackageRunId ||
    packageRunAttempt !== postSupportPackageRunAttempt
  ) {
    throw new TypeError(
      `Post-support proof requires hosted package run ${postSupportPackageRunId}, attempt ${postSupportPackageRunAttempt}`,
    );
  }

  const identity = {
    schema: "stasis-post-support-candidate-identity-v1",
    repository: "oxhq/stasis",
    revision,
    version: postSupportVersion,
    profile: postSupportProfile,
    hostedSdkPackageTrain: {
      source: "github_actions_package_workflow",
      id: packageRunId,
      attempt: packageRunAttempt,
    },
    windows: {
      source: "github_actions_package_workflow_ci_only_bundle",
      zip: {
        sha256: exactSha256(input.windowsZipSha256, "Windows ZIP SHA-256"),
        bytes: positiveInteger(input.windowsZipBytes, "Windows ZIP bytes"),
      },
      executable: {
        sha256: exactSha256(input.executableSha256, "Windows executable SHA-256"),
        bytes: positiveInteger(input.executableBytes, "Windows executable bytes"),
      },
    },
    sdk: {
      source: "hosted_package_train",
      archive: {
        sha256: exactSha256(input.sdkArchiveSha256, "SDK archive SHA-256"),
        bytes: positiveInteger(input.sdkArchiveBytes, "SDK archive bytes"),
      },
      proof: {
        sha256: exactSha256(input.sdkProofSha256, "SDK proof SHA-256"),
        bytes: positiveInteger(input.sdkProofBytes, "SDK proof bytes"),
      },
      tree: {
        sha256: exactSha256(input.sdkTreeSha256, "SDK tree SHA-256"),
        fileCount: positiveInteger(input.sdkTreeFileCount, "SDK tree file count"),
        totalBytes: positiveInteger(input.sdkTreeBytes, "SDK tree bytes"),
      },
    },
  };
  deepFreeze(identity);
  privatePaths.set(identity, paths);
  return identity;
}

export async function verifyPostSupportCandidate(
  identity,
  dependencies = defaultCandidateVerificationDependencies,
) {
  assertCandidateIdentity(identity);
  if ((dependencies.platform ?? process.platform) !== "win32" ||
      (dependencies.architecture ?? process.arch) !== "x64") {
    throw new Error("Post-support candidate verification requires Windows x64");
  }
  if ((dependencies.nodeVersion ?? process.version) !== postSupportNodeVersion) {
    throw new Error(`Post-support candidate verification requires Node ${postSupportNodeVersion}`);
  }
  const paths = requiredPrivatePaths(identity);
  const inspectFile = dependencies.inspectFile ?? inspectRegularFile;
  const inspectDirectory = dependencies.inspectDirectory ?? inspectRealDirectory;
  const hashFile = dependencies.hashFile ?? sha256File;
  const hashArchiveIntegrity = dependencies.hashArchiveIntegrity ?? defaultHashArchiveIntegrity;
  const hashTree = dependencies.hashTree ?? sha256DirectoryTree;
  const readManifest = dependencies.readManifest ?? defaultReadManifest;
  const loadDistributionManifest =
    dependencies.loadDistributionManifest ?? defaultLoadDistributionManifest;

  const [zipMetadata, executableMetadata, archiveMetadata, proofMetadata, packageRoot] = await Promise.all([
    inspectFile(paths.windowsZip, "Windows ZIP"),
    inspectFile(paths.executable, "Windows executable"),
    inspectFile(paths.sdkArchive, "SDK archive"),
    inspectFile(paths.sdkProof, "SDK proof"),
    inspectDirectory(paths.sdkPackageRoot, "SDK package root"),
  ]);
  assertBytes(zipMetadata.size, identity.windows.zip.bytes, "Windows ZIP");
  assertBytes(executableMetadata.size, identity.windows.executable.bytes, "Windows executable");
  assertBytes(archiveMetadata.size, identity.sdk.archive.bytes, "SDK archive");
  assertBytes(proofMetadata.size, identity.sdk.proof.bytes, "SDK proof");

  const [
    zipSha256,
    executableSha256,
    archiveSha256,
    proofSha256,
    archiveIntegrity,
    tree,
    manifest,
    sdkProof,
  ] = await Promise.all([
    hashFile(paths.windowsZip),
    hashFile(paths.executable),
    hashFile(paths.sdkArchive),
    hashFile(paths.sdkProof),
    hashArchiveIntegrity(paths.sdkArchive),
    hashTree(packageRoot),
    readManifest(packageRoot),
    (dependencies.readSdkProof ?? defaultReadSdkProof)(paths.sdkProof),
  ]);
  assertHash(zipSha256, identity.windows.zip.sha256, "Windows ZIP");
  assertHash(executableSha256, identity.windows.executable.sha256, "Windows executable");
  assertHash(archiveSha256, identity.sdk.archive.sha256, "SDK archive");
  assertHash(proofSha256, identity.sdk.proof.sha256, "SDK proof");
  if (
    tree?.sha256 !== identity.sdk.tree.sha256 ||
    tree?.fileCount !== identity.sdk.tree.fileCount ||
    tree?.totalBytes !== identity.sdk.tree.totalBytes
  ) {
    throw new Error("SDK extracted tree identity mismatch");
  }
  if (manifest?.name !== "@oxhq/stasis" || manifest?.version !== postSupportVersion) {
    throw new Error("SDK package manifest identity mismatch");
  }
  const sdkRuntime = await (
    dependencies.verifySdkArchive ?? materializeVerifiedSdkArchiveTreeBinding
  )({
    archivePath: paths.sdkArchive,
    expectedTree: identity.sdk.tree,
  });
  let windowsRuntime;
  try {
    windowsRuntime = await (
      dependencies.verifyWindowsArchive ?? materializeVerifiedWindowsZipExecutableBinding
    )({
      archivePath: paths.windowsZip,
      executableSha256,
      executableBytes: identity.windows.executable.bytes,
      expectedRevision: postSupportRevision,
      expectedVersion: postSupportVersion,
      expectedRunId: String(identity.hostedSdkPackageTrain.id),
      expectedRunAttempt: String(identity.hostedSdkPackageTrain.attempt),
    });
    const runtimeExecutablePath = windowsRuntime?.executablePath ?? paths.executable;
    const runtimePackageRoot = sdkRuntime?.packageRoot ?? packageRoot;
    if (
      dependencies === defaultCandidateVerificationDependencies &&
      (
        typeof windowsRuntime?.dispose !== "function" ||
        typeof windowsRuntime?.runtimeRoot !== "string" ||
        typeof windowsRuntime?.tree?.sha256 !== "string" ||
        typeof sdkRuntime?.dispose !== "function" ||
        typeof sdkRuntime?.packageRoot !== "string" ||
        typeof sdkRuntime?.tree?.sha256 !== "string"
      )
    ) {
      throw new Error("Authoritative candidate lacks verifier-owned runtime extractions");
    }

    const distributionManifest = await loadDistributionManifest(runtimePackageRoot);
    assertDistributionManifest(distributionManifest);
    assertHostedSdkProof(sdkProof, identity, distributionManifest, archiveIntegrity);

    const loadSdk = dependencies.loadSdk ?? defaultLoadSdk;
    const sdk = await loadSdk(runtimePackageRoot);
    if (
      typeof sdk?.launch !== "function" ||
      typeof sdk?.crawlWithStasis !== "function" ||
      typeof sdk?.createStasisSessionPool !== "function" ||
      sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== postSupportProfile
    ) {
      throw new Error("Verified SDK does not expose the complete controlled-web-session-v2 surface");
    }
    const inspectRuntime = dependencies.inspectRuntime ?? defaultInspectRuntime;
    const runtimeIdentity = await inspectRuntime(sdk, runtimeExecutablePath);
    if (
      runtimeIdentity?.implementationName !== "stasis-shell" ||
      runtimeIdentity?.implementationVersion !== postSupportVersion ||
      runtimeIdentity?.stasisRevision !== postSupportRevision ||
      runtimeIdentity?.v2ProfileAdvertised !== true
    ) {
      throw new Error("Windows executable embedded runtime identity mismatch");
    }
    const verified = Object.freeze({
      identity,
      executableSha256,
      runtime: Object.freeze({
        implementationName: runtimeIdentity.implementationName,
        implementationVersion: runtimeIdentity.implementationVersion,
        stasisRevision: runtimeIdentity.stasisRevision,
        v2ProfileAdvertised: runtimeIdentity.v2ProfileAdvertised,
      }),
      sdk: Object.freeze({
        launch: sdk.launch,
        crawlWithStasis: sdk.crawlWithStasis,
        createStasisSessionPool: sdk.createStasisSessionPool,
        CONTROLLED_WEB_SESSION_V2_PROFILE: sdk.CONTROLLED_WEB_SESSION_V2_PROFILE,
      }),
    });
    verifiedCandidateProvenance.set(
      verified,
      dependencies === defaultCandidateVerificationDependencies,
    );
    verifiedCandidateRuntime.set(verified, Object.freeze({
      executablePath: runtimeExecutablePath,
      async dispose() {
        await windowsRuntime?.dispose?.();
        await sdkRuntime?.dispose?.();
      },
    }));
    return verified;
  } catch (error) {
    if (typeof windowsRuntime?.dispose === "function") await windowsRuntime.dispose();
    if (typeof sdkRuntime?.dispose === "function") await sdkRuntime.dispose();
    throw error;
  }
}

export function assertAuthoritativePostSupportCandidate(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    verifiedCandidateProvenance.get(value) !== true
  ) {
    throw new Error(
      "Post-support proof authority requires the direct default candidate verification output",
    );
  }
  return value;
}

export function assertCandidateIdentity(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    value.schema !== "stasis-post-support-candidate-identity-v1" ||
    value.repository !== "oxhq/stasis" ||
    value.revision !== postSupportRevision ||
    value.version !== postSupportVersion ||
    value.profile !== postSupportProfile ||
    value.hostedSdkPackageTrain?.source !== "github_actions_package_workflow" ||
    !Number.isSafeInteger(value.hostedSdkPackageTrain?.id) ||
    value.hostedSdkPackageTrain.id < 1 ||
    !Number.isSafeInteger(value.hostedSdkPackageTrain?.attempt) ||
    value.hostedSdkPackageTrain.attempt < 1 ||
    value.windows?.source !== "github_actions_package_workflow_ci_only_bundle" ||
    !sha256Pattern.test(value.windows?.zip?.sha256 ?? "") ||
    !Number.isSafeInteger(value.windows?.zip?.bytes) ||
    value.windows.zip.bytes < 1 ||
    !sha256Pattern.test(value.windows?.executable?.sha256 ?? "") ||
    !Number.isSafeInteger(value.windows?.executable?.bytes) ||
    value.windows.executable.bytes < 1 ||
    value.sdk?.source !== "hosted_package_train" ||
    !sha256Pattern.test(value.sdk?.archive?.sha256 ?? "") ||
    !Number.isSafeInteger(value.sdk?.archive?.bytes) ||
    value.sdk.archive.bytes < 1 ||
    !sha256Pattern.test(value.sdk?.proof?.sha256 ?? "") ||
    !Number.isSafeInteger(value.sdk?.proof?.bytes) ||
    value.sdk.proof.bytes < 1 ||
    !sha256Pattern.test(value.sdk?.tree?.sha256 ?? "") ||
    !Number.isSafeInteger(value.sdk?.tree?.fileCount) ||
    value.sdk.tree.fileCount < 1 ||
    !Number.isSafeInteger(value.sdk?.tree?.totalBytes) ||
    value.sdk.tree.totalBytes < 1
  ) {
    throw new TypeError("Invalid post-support candidate identity");
  }
  return value;
}

export function postSupportExecutablePath(candidateOrIdentity) {
  const runtime = verifiedCandidateRuntime.get(candidateOrIdentity);
  if (runtime !== undefined) return runtime.executablePath;
  const identity = candidateOrIdentity?.identity ?? candidateOrIdentity;
  return requiredPrivatePaths(identity).executable;
}

export async function disposePostSupportCandidate(candidate) {
  const runtime = verifiedCandidateRuntime.get(candidate);
  if (runtime === undefined) return;
  verifiedCandidateRuntime.delete(candidate);
  if (typeof runtime.dispose === "function") await runtime.dispose();
}

async function inspectRegularFile(filePath, label) {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || !samePath(await realpath(filePath), filePath)) {
    throw new Error(`${label} must be one real regular file`);
  }
  return metadata;
}

async function inspectRealDirectory(directoryPath, label) {
  const metadata = await lstat(directoryPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() ||
      !samePath(await realpath(directoryPath), directoryPath)) {
    throw new Error(`${label} must be one real directory`);
  }
  return directoryPath;
}

async function defaultReadManifest(packageRoot) {
  return JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
}

async function defaultLoadSdk(packageRoot) {
  return import(pathToFileURL(path.join(packageRoot, "dist", "index.js")).href);
}

async function defaultLoadDistributionManifest(packageRoot) {
  const loaded = await import(
    pathToFileURL(path.join(packageRoot, "dist", "runtime-manifest.generated.js")).href
  );
  return loaded.RUNTIME_DISTRIBUTION_MANIFEST;
}

async function defaultReadSdkProof(proofPath) {
  return JSON.parse(await readFile(proofPath, "utf8"));
}

async function defaultHashArchiveIntegrity(archivePath) {
  return `sha512-${createHash("sha512").update(await readFile(archivePath)).digest("base64")}`;
}

async function defaultInspectRuntime(sdk, executablePath) {
  const runtime = await sdk.launch({ executablePath, commandTimeoutMs: 30_000 });
  try {
    return {
      implementationName: runtime.info?.implementation?.name,
      implementationVersion: runtime.info?.implementation?.version,
      stasisRevision: runtime.info?.implementation?.source?.stasis_revision,
      v2ProfileAdvertised:
        runtime.info?.capabilities?.profiles?.includes(postSupportProfile) === true,
    };
  } finally {
    await runtime.close();
  }
}

function assertDistributionManifest(value) {
  if (
    value?.schema !== 1 ||
    value?.packageName !== "@oxhq/stasis" ||
    value?.sdkVersion !== postSupportVersion ||
    value?.releaseTag !== `v${postSupportVersion}` ||
    value?.implementation?.name !== "stasis-shell" ||
    value?.implementation?.source?.stasis_revision !== postSupportRevision ||
    !sameStringKeys(value?.artifacts, ["darwin-arm64", "linux-x64"])
  ) {
    throw new Error("Hosted SDK distribution manifest identity mismatch");
  }
  assertDistributionArtifact(value.artifacts["darwin-arm64"], {
    nodePlatform: "darwin",
    nodeArch: "arm64",
    releasePlatform: "macos-aarch64",
    executablePath: "stasis",
  });
  assertDistributionArtifact(value.artifacts["linux-x64"], {
    nodePlatform: "linux",
    nodeArch: "x64",
    releasePlatform: "linux-x86_64",
    executablePath: "stasis",
  });
}

function assertDistributionArtifact(value, expected) {
  const archiveRoot = `stasis-${postSupportVersion}-${expected.releasePlatform}`;
  if (
    !isPlainRecord(value) ||
    !sameStringKeys(value, [
      "archiveFiles",
      "archiveRoot",
      "archiveSha256",
      "archiveSizeBytes",
      "archiveUrl",
      "executablePath",
      "executableSha256",
      "nodeArch",
      "nodePlatform",
      "releasePlatform",
    ]) ||
    value.nodePlatform !== expected.nodePlatform ||
    value.nodeArch !== expected.nodeArch ||
    value.releasePlatform !== expected.releasePlatform ||
    value.archiveUrl !==
      `https://github.com/oxhq/stasis/releases/download/v${postSupportVersion}/${archiveRoot}.tar.gz` ||
    value.archiveRoot !== archiveRoot ||
    !isDeepStrictEqual(value.archiveFiles, distributionArchiveFiles) ||
    value.executablePath !== expected.executablePath ||
    !Number.isSafeInteger(value.archiveSizeBytes) ||
    value.archiveSizeBytes < 1 ||
    !sha256Pattern.test(value.archiveSha256 ?? "") ||
    !sha256Pattern.test(value.executableSha256 ?? "")
  ) {
    throw new Error(`Hosted SDK distribution manifest ${expected.releasePlatform} artifact mismatch`);
  }
}

function assertHostedSdkProof(value, identity, distributionManifest, archiveIntegrity) {
  const expectedKeys = [
    "gate",
    "gateLogSha256",
    "nativeBinarySha256",
    "package",
    "revision",
    "schema",
    "source",
    "tarball",
    "v2AutomationEventTimestamps",
    "v2CookieSession",
    "v2CssAnimationEventTimestamps",
    "v2DirectDataSvg",
    "v2InlineSvgRendering",
    "v2InputMethodFocus",
    "v2MessageChannel",
    "v2PersistentIntervalProgression",
    "v2SettlementUrl",
    "workflowRunAttempt",
    "workflowRunId",
  ].sort();
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), expectedKeys) ||
    value.schema !== 10 ||
    value.gate !== "sdk-act-settle-inspect" ||
    value.package !== `@oxhq/stasis@${postSupportVersion}` ||
    value.revision !== postSupportRevision ||
    value.workflowRunId !== String(identity.hostedSdkPackageTrain.id) ||
    value.workflowRunAttempt !== String(identity.hostedSdkPackageTrain.attempt) ||
    !isDeepStrictEqual(value.source, distributionManifest.implementation.source) ||
    value.tarball?.name !== "oxhq-stasis-0.3.3.tgz" ||
    value.tarball?.sha256 !== identity.sdk.archive.sha256 ||
    value.tarball?.integrity !== archiveIntegrity ||
    !isDeepStrictEqual(Object.keys(value.tarball ?? {}).sort(), ["integrity", "name", "sha256"]) ||
    !sha256Pattern.test(value.gateLogSha256 ?? "") ||
    value.nativeBinarySha256 !==
      distributionManifest.artifacts["darwin-arm64"].executableSha256
  ) {
    throw new Error("Hosted SDK proof differs from the exact package train");
  }
  for (const [key, expected] of Object.entries(exactHostedProofSlices)) {
    if (!isDeepStrictEqual(value[key], expected)) {
      throw new Error(`Hosted SDK proof differs from exact ${key} evidence`);
    }
  }
  assertHostedAutomationProof(value.v2AutomationEventTimestamps);
  assertHostedMessageChannelProof(value.v2MessageChannel);
  assertHostedCssAnimationProof(value.v2CssAnimationEventTimestamps);
}

function assertHostedAutomationProof(value) {
  const timeKeys = [
    "initialVirtualTimeNs",
    "advancedVirtualTimeNs",
    "dispatchedVirtualTimeNs",
  ];
  if (
    !isPlainRecord(value) ||
    !sameStringKeys(value, [...Object.keys(exactHostedAutomationEvidence), ...timeKeys]) ||
    Object.entries(exactHostedAutomationEvidence).some(([key, expectedValue]) =>
      !isDeepStrictEqual(value[key], expectedValue)
    )
  ) {
    throw new Error("Hosted SDK proof differs from exact v2AutomationEventTimestamps evidence");
  }
  const initial = canonicalU128(value.initialVirtualTimeNs);
  const advanced = canonicalU128(value.advancedVirtualTimeNs);
  const dispatched = canonicalU128(value.dispatchedVirtualTimeNs);
  if (
    initial === undefined ||
    advanced === undefined ||
    dispatched === undefined ||
    initial > maxU128 - automationAdvanceNs ||
    advanced !== initial + automationAdvanceNs ||
    dispatched !== advanced
  ) {
    throw new Error("Hosted SDK proof differs from exact v2AutomationEventTimestamps evidence");
  }
}

function assertHostedMessageChannelProof(value) {
  const expected = {
    profile: postSupportProfile,
    idleOutcome: "quiescent",
    idleMessagePortSources: "0",
    idleRuntimeFailures: "0",
    bufferActionRotatedStateToken: true,
    pendingPreservedBufferedStateToken: true,
    pendingMessagePortSources: "1",
    pendingRuntimeFailures: "0",
    startActionRotatedStateToken: true,
    drainedOutcome: "quiescent",
    drainedMessagePortSources: "0",
    drainedRuntimeFailures: "0",
    trace: "callback1>microtask1>callback2>microtask2",
    evidenceProfile: postSupportProfile,
    unsupportedWork: "0",
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  };
  const aggregate = value?.aggregateProcessedOrdinaryTasks;
  if (
    !isPlainRecord(value) ||
    !sameStringKeys(value, [...Object.keys(expected), "aggregateProcessedOrdinaryTasks"]) ||
    Object.entries(expected).some(([key, expectedValue]) =>
      !isDeepStrictEqual(value[key], expectedValue)
    ) ||
    typeof aggregate !== "string" ||
    !/^(?:0|[1-9][0-9]*)$/u.test(aggregate) ||
    BigInt(aggregate) < 2n
  ) {
    throw new Error("Hosted SDK proof differs from exact v2MessageChannel evidence");
  }
}

function assertHostedCssAnimationProof(value) {
  const expected = {
    profile: postSupportProfile,
    initialOutcome: "quiescent",
    settledVirtualTimeNs: "5000000",
    controlledOutcome: "quiescent",
    controlledEventCount: "2",
    controlledEventKinds: "animationend,animationstart",
    controlledOwnedEventCount: "2",
    controlledRuntimeFailures: "0",
    controlledUnsupportedWork: "0",
    controlledExternalIo: "0",
    pendingAnimationEvents: "0",
    finiteAnimations: "0",
    infiniteAnimations: "0",
    unsupportedAnimations: "0",
    producerPending: "0",
    producerTerminal: false,
    postReflowOutcome: "quiescent",
    postReflowVirtualTimeNs: "90000000",
    postReflowTrace:
      "armed:20|animationstart:trusted:70:70>animationcancel:trusted:90:90",
    postReflowEventCount: "2",
    postReflowEventKinds: "animationcancel,animationstart",
    postReflowRuntimeFailures: "0",
    postReflowUnsupportedWork: "0",
    postReflowExternalIo: "0",
    postReflowPendingAnimationEvents: "0",
    postReflowNextOpportunityNs: "none",
    postReflowStateTokenPreserved: true,
    postReflowOwnedQueueDrain: true,
    scriptCreatedConstructorCount: "2",
    scriptCreatedTrace: "script:0,0",
    rejectedOutcome: "unsupported_work",
    failureCode: "unsupported_clock_surface",
    unsupportedKind: "other",
    unsupportedCount: "1",
    unsupportedReason: "time_surface",
    unsupportedTimeSurface: "host_timestamp",
    evidenceProfile: postSupportProfile,
    publicNonAuxiliaryControlledTarget: true,
    sameControlledSession: true,
    freshExactBinaryProcess: true,
    managedRuntimeFallbackAccesses: "0",
    exactBinaryLaunch: true,
    closeResponseAndEof: true,
  };
  const dispatchCount = value?.controlledDispatchTimeCount;
  const renderingOpportunities = value?.processedRenderingOpportunities;
  const postReflowRenderingOpportunities =
    value?.postReflowProcessedRenderingOpportunities;
  if (
    !isPlainRecord(value) ||
    !sameStringKeys(value, [
      ...Object.keys(expected),
      "controlledDispatchTimeCount",
      "postReflowProcessedRenderingOpportunities",
      "processedRenderingOpportunities",
    ]) ||
    Object.entries(expected).some(([key, expectedValue]) =>
      !isDeepStrictEqual(value[key], expectedValue)
    ) ||
    typeof dispatchCount !== "string" ||
    !/^[1-9][0-9]*$/u.test(dispatchCount) ||
    BigInt(dispatchCount) > 2n ||
    typeof renderingOpportunities !== "string" ||
    !/^[1-9][0-9]*$/u.test(renderingOpportunities) ||
    typeof postReflowRenderingOpportunities !== "string" ||
    !/^[1-9][0-9]*$/u.test(postReflowRenderingOpportunities)
  ) {
    throw new Error("Hosted SDK proof differs from exact v2CssAnimationEventTimestamps evidence");
  }
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalU128(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const parsed = BigInt(value);
  return parsed <= maxU128 ? parsed : undefined;
}

function sameStringKeys(value, expected) {
  return isPlainRecord(value) &&
    isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
}

function requiredPrivatePaths(identity) {
  assertCandidateIdentity(identity);
  const paths = privatePaths.get(identity);
  if (paths === undefined) throw new TypeError("Candidate identity lacks its validated local inputs");
  return paths;
}

function required(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function exactString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
  return value;
}

function exactAbsolutePath(value, label) {
  const input = exactString(value, label);
  if (!path.isAbsolute(input)) throw new TypeError(`${label} must be absolute`);
  return path.resolve(input);
}

function exactSha256(value, label) {
  const input = exactString(value, label);
  if (!sha256Pattern.test(input)) throw new TypeError(`${label} must be 64 lowercase hex characters`);
  return input;
}

function positiveInteger(value, label) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || String(number) !== String(value)) {
    throw new TypeError(`${label} must be one canonical positive integer`);
  }
  return number;
}

function assertBytes(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} byte length mismatch`);
}

function assertHash(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} SHA-256 mismatch`);
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}
