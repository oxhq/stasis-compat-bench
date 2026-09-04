import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { chmod, copyFile, lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

import { sha256DirectoryTree, sha256File } from "../shared/io.mjs";
import { materializeVerifiedSdkArchiveTreeBinding } from "../post-support/archive-binding.mjs";

const exactIdentity = deepFreeze({
  schema: "stasis-v0.3.3-performance-linux-candidate-v1",
  repository: "oxhq/stasis",
  revision: "48c5a718a9ddd63f496e45307e1484974ccf8587",
  version: "0.3.3",
  profile: "controlled-web-session-v2",
  release: {
    tag: "v0.3.3",
    runtimeManifest: {
      name: "stasis-0.3.3-runtime-manifest.json",
      sha256: "4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4",
      bytes: 2_503,
    },
  },
  packageQualification: {
    runId: 33_506_181_780,
    runAttempt: 1,
  },
  linux: {
    platform: "linux-x86_64",
    archive: {
      name: "stasis-0.3.3-linux-x86_64.tar.gz",
      sha256: "5965e932cab407aa75d3f283015bf5d5df92cf06ecbd5f1add03083937208e86",
      bytes: 34_279_279,
    },
    executable: {
      name: "stasis",
      sha256: "c6a37995cde25275454d7f1ee61c2803964b04bf0d35f8fde7c78e9575c74c37",
      bytes: 83_877_352,
    },
    proof: {
      name: "stasis-0.3.3-linux-x86_64-act-settle-inspect.json",
      sha256: "81e44c9dba85bc10cc67536388f11a9e251b7d4d29e3fc740c98afbfefba1cac",
      bytes: 1_160,
    },
  },
  sdk: {
    package: "@oxhq/stasis",
    archive: {
      name: "oxhq-stasis-0.3.3.tgz",
      sha256: "55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec",
      bytes: 181_292,
      integrity:
        "sha512-RbBSACeWpxQ6mIl23aOcoiaQF95/RT2fVEOfIh0T5MTkzzcv0lB2V983hjhjtdMiB3GBytnfwfoMw/Hj8ntUeg==",
    },
    tree: {
      sha256: "20f52ace92961030f8dc5d2743d941eb3445a86949097b194ec97312f5eface8",
      fileCount: 55,
      totalBytes: 896_631,
    },
  },
});

const environmentNames = Object.freeze({
  archive: "STASIS_PERFORMANCE_LINUX_ARCHIVE",
  executable: "STASIS_PERFORMANCE_LINUX_EXECUTABLE",
  proof: "STASIS_PERFORMANCE_LINUX_PROOF",
  runtimeManifest: "STASIS_PERFORMANCE_RUNTIME_MANIFEST",
  sdkArchive: "STASIS_PERFORMANCE_SDK_ARCHIVE",
  sdkPackageRoot: "STASIS_PERFORMANCE_SDK_PACKAGE_ROOT",
});
const privateSpecPaths = new WeakMap();
const privateVerifiedPaths = new WeakMap();
const authoritativeCandidates = new WeakSet();
const defaultDependencies = Object.freeze({});

export const linuxPerformanceCandidateIdentity = exactIdentity;
export const linuxPerformanceCandidateEnvironmentNames = environmentNames;

export function loadLinuxPerformanceCandidateSpec(environment = process.env) {
  return createLinuxPerformanceCandidateSpec(Object.fromEntries(
    Object.entries(environmentNames).map(([field, name]) => [field, required(environment, name)]),
  ));
}

export function createLinuxPerformanceCandidateSpec(input) {
  const paths = Object.freeze({
    archive: exactAbsolutePath(input?.archive, "Linux archive"),
    executable: exactAbsolutePath(input?.executable, "Linux executable"),
    proof: exactAbsolutePath(input?.proof, "Linux proof"),
    runtimeManifest: exactAbsolutePath(input?.runtimeManifest, "runtime manifest"),
    sdkArchive: exactAbsolutePath(input?.sdkArchive, "SDK archive"),
    sdkPackageRoot: exactAbsolutePath(input?.sdkPackageRoot, "SDK package root"),
  });
  const expectedBasenames = {
    archive: exactIdentity.linux.archive.name,
    executable: exactIdentity.linux.executable.name,
    proof: exactIdentity.linux.proof.name,
    runtimeManifest: exactIdentity.release.runtimeManifest.name,
    sdkArchive: exactIdentity.sdk.archive.name,
    sdkPackageRoot: "package",
  };
  for (const [field, expected] of Object.entries(expectedBasenames)) {
    if (path.basename(paths[field]) !== expected) {
      throw new TypeError(`${field} must retain basename ${expected}`);
    }
  }
  const spec = Object.freeze({ identity: exactIdentity });
  privateSpecPaths.set(spec, paths);
  return spec;
}

export async function verifyLinuxPerformanceCandidate(
  spec,
  dependencies = defaultDependencies,
) {
  if (!isDeepStrictEqual(spec?.identity, exactIdentity) || !privateSpecPaths.has(spec)) {
    throw new TypeError("Linux performance candidate spec was not created by this module");
  }
  const paths = privateSpecPaths.get(spec);
  const hashFile = dependencies.hashFile ?? sha256File;
  const hashTree = dependencies.hashTree ?? sha256DirectoryTree;
  const readText = dependencies.readText ?? ((value) => readFile(value, "utf8"));
  const inspectPath = dependencies.inspectPath ?? inspectExactPaths;
  const observeRuntime = dependencies.observeRuntime ?? (() => ({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  }));
  const importSdk = dependencies.importSdk ?? defaultImportSdk;
  const hashIntegrity = dependencies.hashIntegrity ?? defaultHashIntegrity;
  const materializeRuntime = dependencies.materializeRuntime ?? materializeLinuxRuntime;
  const materializeSdk = dependencies.materializeSdk ??
    materializeVerifiedSdkArchiveTreeBinding;

  const runtime = observeRuntime();
  if (
    runtime?.platform !== "linux" ||
    runtime?.arch !== "x64" ||
    runtime?.node !== "v22.20.0" ||
    Object.keys(runtime).sort().join("\0") !== "arch\0node\0platform"
  ) {
    throw new Error("Linux performance candidate requires Node v22.20.0 on Linux x64");
  }
  await inspectPath(paths);

  const [archiveSha256, executableSha256, proofSha256, manifestSha256, sdkArchiveSha256,
    sdkArchiveIntegrity, sdkTree, proofText, manifestText, packageText] = await Promise.all([
    hashFile(paths.archive),
    hashFile(paths.executable),
    hashFile(paths.proof),
    hashFile(paths.runtimeManifest),
    hashFile(paths.sdkArchive),
    hashIntegrity(paths.sdkArchive),
    hashTree(paths.sdkPackageRoot),
    readText(paths.proof),
    readText(paths.runtimeManifest),
    readText(path.join(paths.sdkPackageRoot, "package.json")),
  ]);
  assertExactHash(archiveSha256, exactIdentity.linux.archive.sha256, "Linux archive");
  assertExactHash(executableSha256, exactIdentity.linux.executable.sha256, "Linux executable");
  assertExactHash(proofSha256, exactIdentity.linux.proof.sha256, "Linux proof");
  assertExactHash(
    manifestSha256,
    exactIdentity.release.runtimeManifest.sha256,
    "runtime manifest",
  );
  assertExactHash(sdkArchiveSha256, exactIdentity.sdk.archive.sha256, "SDK archive");
  if (sdkArchiveIntegrity !== exactIdentity.sdk.archive.integrity) {
    throw new Error("SDK archive integrity mismatch");
  }
  if (!isDeepStrictEqual(sdkTree, exactIdentity.sdk.tree)) {
    throw new Error("SDK extracted tree identity mismatch");
  }

  const proof = parseJson(proofText, "Linux proof");
  const manifest = parseJson(manifestText, "runtime manifest");
  const packageManifest = parseJson(packageText, "SDK package manifest");
  assertProof(proof);
  assertManifest(manifest);
  if (
    packageManifest?.name !== exactIdentity.sdk.package ||
    packageManifest?.version !== exactIdentity.version
  ) {
    throw new Error("SDK package manifest identity mismatch");
  }

  let runtimeMaterialization;
  let sdkMaterialization;
  try {
    runtimeMaterialization = await materializeRuntime(paths.executable);
    sdkMaterialization = await materializeSdk({
      archivePath: paths.sdkArchive,
      expectedTree: exactIdentity.sdk.tree,
    });
    assertMaterializations(runtimeMaterialization, sdkMaterialization, dependencies);
    const imported = await importSdk(sdkMaterialization.packageRoot);
    const sdk = projectSdk(imported);
    const verified = deepFreeze({ identity: exactIdentity, runtime, sdk });
    privateVerifiedPaths.set(verified, Object.freeze({
      ...paths,
      executable: runtimeMaterialization.executablePath,
      sdkPackageRoot: sdkMaterialization.packageRoot,
      async dispose() {
        await runtimeMaterialization.dispose?.();
        await sdkMaterialization.dispose?.();
      },
    }));
    if (dependencies === defaultDependencies) authoritativeCandidates.add(verified);
    return verified;
  } catch (error) {
    await runtimeMaterialization?.dispose?.();
    await sdkMaterialization?.dispose?.();
    throw error;
  }
}

export function assertAuthoritativeLinuxPerformanceCandidate(value) {
  assertLinuxPerformanceCandidate(value);
  if (!authoritativeCandidates.has(value)) {
    throw new Error("Linux performance authority requires direct default verification");
  }
  return value;
}

export function assertLinuxPerformanceCandidate(value) {
  if (
    !isDeepStrictEqual(value?.identity, exactIdentity) ||
    value?.runtime?.platform !== "linux" ||
    value?.runtime?.arch !== "x64" ||
    value?.runtime?.node !== "v22.20.0" ||
    typeof value?.sdk?.launch !== "function" ||
    typeof value?.sdk?.crawlWithStasis !== "function" ||
    typeof value?.sdk?.createStasisSessionPool !== "function" ||
    value?.sdk?.CONTROLLED_WEB_SESSION_V2_PROFILE !== exactIdentity.profile ||
    !privateVerifiedPaths.has(value)
  ) {
    throw new TypeError("Invalid verified Linux performance candidate");
  }
  return value;
}

export function linuxPerformanceExecutablePath(value) {
  assertLinuxPerformanceCandidate(value);
  return privateVerifiedPaths.get(value).executable;
}

export async function disposeLinuxPerformanceCandidate(value) {
  assertLinuxPerformanceCandidate(value);
  const retained = privateVerifiedPaths.get(value);
  privateVerifiedPaths.delete(value);
  authoritativeCandidates.delete(value);
  await retained.dispose?.();
}

async function inspectExactPaths(paths) {
  const fileContracts = [
    [paths.archive, exactIdentity.linux.archive.bytes, "Linux archive"],
    [paths.executable, exactIdentity.linux.executable.bytes, "Linux executable"],
    [paths.proof, exactIdentity.linux.proof.bytes, "Linux proof"],
    [paths.runtimeManifest, exactIdentity.release.runtimeManifest.bytes, "runtime manifest"],
    [paths.sdkArchive, exactIdentity.sdk.archive.bytes, "SDK archive"],
  ];
  for (const [filePath, bytes, label] of fileContracts) {
    const metadata = await lstat(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== bytes) {
      throw new Error(`${label} must be an exact regular file of ${bytes} bytes`);
    }
    const resolvedFile = await realpath(filePath);
    if (!samePath(resolvedFile, filePath)) {
      throw new Error(`${label} resolves outside its declared path`);
    }
  }
  const rootMetadata = await lstat(paths.sdkPackageRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("SDK package root must be a real directory");
  }
  const resolved = await realpath(paths.sdkPackageRoot);
  if (!samePath(resolved, paths.sdkPackageRoot)) {
    throw new Error("SDK package root resolves outside its declared path");
  }
}

function assertProof(value) {
  if (
    value?.schema !== 2 ||
    value?.platform !== exactIdentity.linux.platform ||
    value?.version !== exactIdentity.version ||
    value?.revision !== exactIdentity.revision ||
    value?.workflowRunId !== String(exactIdentity.packageQualification.runId) ||
    value?.workflowRunAttempt !== String(exactIdentity.packageQualification.runAttempt) ||
    value?.gate !== "act-settle-inspect" ||
    value?.test !== "release_gate_published_binary_completes_act_settle_inspect" ||
    value?.archive?.name !== exactIdentity.linux.archive.name ||
    value?.archive?.sha256 !== exactIdentity.linux.archive.sha256 ||
    value?.binary?.path !== "stasis-0.3.3-linux-x86_64/stasis" ||
    value?.binary?.sha256 !== exactIdentity.linux.executable.sha256 ||
    value?.source?.stasis_revision !== exactIdentity.revision
  ) {
    throw new Error("Linux release proof identity mismatch");
  }
}

function assertManifest(value) {
  const linux = value?.artifacts?.["linux-x64"];
  if (
    value?.schema !== 1 ||
    value?.releaseTag !== exactIdentity.release.tag ||
    value?.sdkVersion !== exactIdentity.version ||
    value?.implementation?.source?.stasis_revision !== exactIdentity.revision ||
    linux?.releasePlatform !== exactIdentity.linux.platform ||
    linux?.archiveSha256 !== exactIdentity.linux.archive.sha256 ||
    linux?.archiveSizeBytes !== exactIdentity.linux.archive.bytes ||
    linux?.executableSha256 !== exactIdentity.linux.executable.sha256 ||
    linux?.nodePlatform !== "linux" ||
    linux?.nodeArch !== "x64"
  ) {
    throw new Error("Runtime manifest identity mismatch");
  }
}

async function defaultImportSdk(packageRoot) {
  return import(pathToFileURL(path.join(packageRoot, "dist", "index.js")).href);
}

async function defaultHashIntegrity(filePath) {
  const content = await readFile(filePath);
  return `sha512-${createHash("sha512").update(content).digest("base64")}`;
}

async function materializeLinuxRuntime(sourcePath) {
  const ownerRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-performance-linux-"));
  const executablePath = path.join(ownerRoot, exactIdentity.linux.executable.name);
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await rm(ownerRoot, { recursive: true, force: true });
  };
  try {
    await copyFile(sourcePath, executablePath, fsConstants.COPYFILE_EXCL);
    await chmod(executablePath, 0o755);
    const metadata = await lstat(executablePath);
    const sha256 = await sha256File(executablePath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size !== exactIdentity.linux.executable.bytes ||
      sha256 !== exactIdentity.linux.executable.sha256 ||
      !samePath(await realpath(executablePath), executablePath)
    ) {
      throw new Error("Verifier-owned Linux executable differs from the verified input");
    }
    return Object.freeze({ ownerRoot, executablePath, bytes: metadata.size, sha256, dispose });
  } catch (error) {
    await dispose();
    throw error;
  }
}

function assertMaterializations(runtimeMaterialization, sdkMaterialization, dependencies) {
  if (
    runtimeMaterialization?.bytes !== exactIdentity.linux.executable.bytes ||
    runtimeMaterialization?.sha256 !== exactIdentity.linux.executable.sha256 ||
    typeof runtimeMaterialization?.executablePath !== "string" ||
    sdkMaterialization?.tree?.sha256 !== exactIdentity.sdk.tree.sha256 ||
    sdkMaterialization?.tree?.fileCount !== exactIdentity.sdk.tree.fileCount ||
    sdkMaterialization?.tree?.totalBytes !== exactIdentity.sdk.tree.totalBytes ||
    typeof sdkMaterialization?.packageRoot !== "string"
  ) {
    throw new Error("Verifier-owned Linux candidate materialization mismatch");
  }
  if (
    dependencies === defaultDependencies &&
    (
      typeof runtimeMaterialization.ownerRoot !== "string" ||
      typeof runtimeMaterialization.dispose !== "function" ||
      typeof sdkMaterialization.ownerRoot !== "string" ||
      typeof sdkMaterialization.dispose !== "function"
    )
  ) {
    throw new Error("Authoritative Linux candidate lacks verifier-owned materializations");
  }
}

function projectSdk(value) {
  if (
    typeof value?.launch !== "function" ||
    typeof value?.crawlWithStasis !== "function" ||
    typeof value?.createStasisSessionPool !== "function" ||
    value?.CONTROLLED_WEB_SESSION_V2_PROFILE !== exactIdentity.profile
  ) {
    throw new Error("Stasis v0.3.3 SDK public export contract mismatch");
  }
  return Object.freeze({
    launch: value.launch,
    crawlWithStasis: value.crawlWithStasis,
    createStasisSessionPool: value.createStasisSessionPool,
    CONTROLLED_WEB_SESSION_V2_PROFILE: value.CONTROLLED_WEB_SESSION_V2_PROFILE,
  });
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function assertExactHash(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} SHA-256 mismatch`);
}

function exactAbsolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || !path.isAbsolute(value)) {
    throw new TypeError(`${label} path must be absolute`);
  }
  const resolved = path.resolve(value);
  if (resolved !== value) throw new TypeError(`${label} path must already be normalized`);
  return resolved;
}

function required(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function samePath(left, right) {
  return process.platform === "win32"
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
