import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { chromium } from "playwright";

import {
  repositoryRoot,
  sha256DirectoryTree,
  sha256File,
} from "../shared/io.mjs";

const runtimePaths = Object.freeze({
  harnessSdk: path.join(repositoryRoot, "node_modules", "@oxhq", "stasis"),
  crawlee: path.join(repositoryRoot, "node_modules", "crawlee"),
  playwright: path.join(repositoryRoot, "node_modules", "playwright"),
  nodeModules: path.join(repositoryRoot, "node_modules"),
});

export async function observePostSupportHarnessRuntime() {
  const chromiumExecutable = chromium.executablePath();
  const chromiumInstallationRoot = path.dirname(chromiumExecutable);
  const browser = await chromium.launch({ headless: true });
  let chromiumVersion;
  try {
    chromiumVersion = browser.version();
  } finally {
    await browser.close();
  }

  const [
    nodeMetadata,
    nodeExecutableSha256,
    harnessSdk,
    crawlee,
    crawleeTree,
    playwright,
    playwrightTree,
    installedNodeModulesTree,
    chromiumMetadata,
    chromiumExecutableSha256,
    chromiumInstallationTree,
  ] = await Promise.all([
    stat(process.execPath),
    sha256File(process.execPath),
    readPackageVersion(runtimePaths.harnessSdk),
    readPackageVersion(runtimePaths.crawlee),
    sha256DirectoryTree(runtimePaths.crawlee),
    readPackageVersion(runtimePaths.playwright),
    sha256DirectoryTree(runtimePaths.playwright),
    sha256DirectoryTree(runtimePaths.nodeModules),
    stat(chromiumExecutable),
    sha256File(chromiumExecutable),
    sha256DirectoryTree(chromiumInstallationRoot),
  ]);

  return freezeRuntime({
    node: process.version,
    nodeExecutableBasename: path.basename(process.execPath),
    nodeExecutableBytes: nodeMetadata.size,
    nodeExecutableSha256,
    frozenHarnessSdkDependency: harnessSdk,
    crawlee,
    crawleeTree,
    playwright,
    playwrightTree,
    installedNodeModulesTree,
    chromiumVersion,
    chromiumExecutableBasename: path.basename(chromiumExecutable),
    chromiumExecutableBytes: chromiumMetadata.size,
    chromiumExecutableSha256,
    chromiumInstallationTree,
  });
}

export function assertObservedPostSupportHarnessRuntime(
  observed,
  expected,
  phase = "post-support wild runtime",
) {
  if (!isDeepStrictEqual(observed, expected)) {
    throw new Error(`${phase} differs from the frozen preflight runtime`);
  }
  return freezeRuntime(observed);
}

async function readPackageVersion(directory) {
  const value = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  if (typeof value?.version !== "string" || value.version.length === 0) {
    throw new Error(`Post-support runtime dependency lacks a package version: ${directory}`);
  }
  return value.version;
}

function freezeRuntime(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.freeze({
    ...value,
    ...(isTree(value.crawleeTree)
      ? { crawleeTree: Object.freeze({ ...value.crawleeTree }) }
      : {}),
    ...(isTree(value.playwrightTree)
      ? { playwrightTree: Object.freeze({ ...value.playwrightTree }) }
      : {}),
    ...(isTree(value.installedNodeModulesTree)
      ? { installedNodeModulesTree: Object.freeze({ ...value.installedNodeModulesTree }) }
      : {}),
    ...(isTree(value.chromiumInstallationTree)
      ? { chromiumInstallationTree: Object.freeze({ ...value.chromiumInstallationTree }) }
      : {}),
  });
}

function isTree(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
