import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { chromium } from "playwright";

import { candidate, expectedVersions, runtimePins } from "./config.mjs";
import { assertCandidateV03Sdk, candidateV03 } from "../shared/candidate-v03.mjs";
import {
  repositoryRoot,
  sha256DirectoryTree,
  sha256File,
} from "../shared/io.mjs";

export async function readAndVerifyWildRuntimeIdentity() {
  const paths = {
    harnessSdk: path.join(repositoryRoot, "node_modules", "@oxhq", "stasis"),
    crawlee: path.join(repositoryRoot, "node_modules", "crawlee"),
    playwright: path.join(repositoryRoot, "node_modules", "playwright"),
    nodeModules: path.join(repositoryRoot, "node_modules"),
  };
  const chromiumExecutable = chromium.executablePath();
  const browser = await chromium.launch({ headless: true });
  let chromiumVersion;
  try {
    chromiumVersion = browser.version();
  } finally {
    await browser.close();
  }

  const [
    nodeStat,
    nodeSha256,
    candidateSdkIdentity,
    harnessSdkPackage,
    crawleePackage,
    crawleeTree,
    playwrightPackage,
    playwrightTree,
    installedNodeModulesTree,
    chromiumStat,
    chromiumExecutableSha256,
  ] = await Promise.all([
    stat(process.execPath),
    sha256File(process.execPath),
    assertCandidateV03Sdk(),
    readPackage(paths.harnessSdk),
    readPackage(paths.crawlee),
    sha256DirectoryTree(paths.crawlee),
    readPackage(paths.playwright),
    sha256DirectoryTree(paths.playwright),
    sha256DirectoryTree(paths.nodeModules),
    stat(chromiumExecutable),
    sha256File(chromiumExecutable),
  ]);

  const identity = {
    node: process.version,
    nodeExecutableBasename: path.basename(process.execPath),
    nodeExecutableBytes: nodeStat.size,
    nodeExecutableSha256: nodeSha256,
    candidateSdkTarball: "candidate/oxhq-stasis-0.3.0.tgz",
    candidateSdkTarballBytes: candidateV03.sdkArchiveBytes,
    candidateSdkTarballSha256: candidateSdkIdentity.archiveSha256,
    candidateSdk: candidateV03.version,
    candidateSdkTree: candidateSdkIdentity.tree,
    harnessSdk: harnessSdkPackage.version,
    crawlee: crawleePackage.version,
    crawleeTree,
    playwright: playwrightPackage.version,
    playwrightTree,
    installedNodeModulesTree,
    chromiumVersion,
    chromiumExecutableBasename: path.basename(chromiumExecutable),
    chromiumExecutableBytes: chromiumStat.size,
    chromiumExecutableSha256,
  };
  assertPinnedRuntimeIdentity(identity);
  return identity;
}

export function assertPinnedRuntimeIdentity(identity) {
  const failures = [];
  check(failures, "node", identity.node, expectedVersions.node);
  check(
    failures,
    "nodeExecutableBasename",
    identity.nodeExecutableBasename,
    runtimePins.nodeExecutableBasename,
  );
  check(failures, "nodeExecutableBytes", identity.nodeExecutableBytes, runtimePins.nodeExecutableBytes);
  check(failures, "nodeExecutableSha256", identity.nodeExecutableSha256, runtimePins.nodeExecutableSha256);
  check(failures, "candidateSdkTarballBytes", identity.candidateSdkTarballBytes, runtimePins.candidateSdkTarballBytes);
  check(failures, "candidateSdkTarballSha256", identity.candidateSdkTarballSha256, runtimePins.candidateSdkTarballSha256);
  check(failures, "candidateSdk", identity.candidateSdk, candidate.version);
  check(failures, "candidateSdkTree", identity.candidateSdkTree, runtimePins.candidateSdkTree);
  check(failures, "harnessSdk", identity.harnessSdk, "0.2.1");
  check(failures, "crawlee", identity.crawlee, expectedVersions.crawlee);
  check(failures, "crawleeTree", identity.crawleeTree, runtimePins.crawleeTree);
  check(failures, "playwright", identity.playwright, expectedVersions.playwright);
  check(failures, "playwrightTree", identity.playwrightTree, runtimePins.playwrightTree);
  if (runtimePins.installedNodeModulesTree === null) {
    failures.push("installedNodeModulesTree pin is not frozen");
  } else {
    check(
      failures,
      "installedNodeModulesTree",
      identity.installedNodeModulesTree,
      runtimePins.installedNodeModulesTree,
    );
  }
  check(
    failures,
    "chromiumExecutableBasename",
    identity.chromiumExecutableBasename,
    runtimePins.chromiumExecutableBasename,
  );
  check(failures, "chromiumExecutableBytes", identity.chromiumExecutableBytes, runtimePins.chromiumExecutableBytes);
  check(
    failures,
    "chromiumExecutableSha256",
    identity.chromiumExecutableSha256,
    runtimePins.chromiumExecutableSha256,
  );
  if (failures.length > 0) {
    throw new Error(`Wild runtime identity mismatch: ${failures.join(", ")}`);
  }
}

export function assertMatchesPreflightRuntime(actual, frozen) {
  if (!isDeepStrictEqual(actual, frozen)) {
    throw new Error("Paired runtime identity differs from the frozen preflight runtime identity");
  }
}

async function readPackage(directory) {
  return JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
}

function check(failures, field, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) failures.push(field);
}
