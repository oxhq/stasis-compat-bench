import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { compareCrawl } from "./crawl/compare-lib.mjs";
import { finalReportMarkdown } from "./final-report.mjs";
import { compareRwa } from "./rwa/compare-lib.mjs";
import {
  artifactRoot,
  assertExactFileInventory,
  assertExistingSealedArtifactRoot,
  listRegularFiles,
  readJson,
  repositoryRoot,
  sha256DirectoryTree,
  sha256File,
  writeJson,
  writeText,
} from "./shared/io.mjs";
import {
  assertFrozenManifestIdentities,
  currentNpmVersion,
  FROZEN_IDENTITIES,
  installedBrowserEvidence,
  installedPackageEvidence,
  installedRwaEvidence,
} from "./shared/manifest.mjs";
import {
  assertRwaAmbientOverridesAbsent,
  assertRwaGeneratedRuntimeFiles,
  assertRwaLocalEnvironmentFilesAbsent,
  assertRwaRuntimeCacheEmpty,
} from "./rwa/runtime-identity.mjs";

const sourceRoot = path.resolve(
  process.env.STASIS_SOURCE_ROOT ?? path.join("inputs", "stasis-source"),
);
const rwaRoot = path.resolve(
  process.env.RWA_ROOT ?? path.join("inputs", "cypress-realworld-app-28ca4d0"),
);
const executablePath = path.resolve(
  process.env.STASIS_EXECUTABLE ??
    path.join(
      "candidate",
      "stasis-0.2.1-windows-x86_64-local-5d55c0cf-r1",
      "stasis.exe",
    ),
);
const archivePath = path.resolve(
  process.env.STASIS_ARCHIVE ??
    path.join("candidate", "stasis-0.2.1-windows-x86_64-local-5d55c0cf-r1.zip"),
);
const preFinalInventory = [
  "crawlee/compatibility.json",
  "crawlee/playwright-raw.json",
  "crawlee/report.md",
  "crawlee/stasis-raw.json",
  "manifest.json",
  "rwa/build-tree-guard.json",
  "rwa/compatibility.json",
  "rwa/cypress-raw.json",
  "rwa/report.md",
  "rwa/stasis-raw.json",
];

if (process.version !== FROZEN_IDENTITIES.node) {
  throw new Error(
    `Finalization requires Node ${FROZEN_IDENTITIES.node}, got ${process.version}`,
  );
}
if (currentNpmVersion() !== FROZEN_IDENTITIES.npm) {
  throw new Error(
    `Finalization requires npm ${FROZEN_IDENTITIES.npm}, got ${currentNpmVersion()}`,
  );
}
if (
  process.platform !== FROZEN_IDENTITIES.platform ||
  process.arch !== FROZEN_IDENTITIES.architecture
) {
  throw new Error(
    `Finalization requires ${FROZEN_IDENTITIES.platform}/${FROZEN_IDENTITIES.architecture}, got ${process.platform}/${process.arch}`,
  );
}
const nodeExecutable = {
  path: path.resolve(process.execPath),
  bytes: statSync(process.execPath).size,
  sha256: await sha256File(process.execPath),
};
if (
  nodeExecutable.bytes !== FROZEN_IDENTITIES.nodeExecutable.bytes ||
  nodeExecutable.sha256 !== FROZEN_IDENTITIES.nodeExecutable.sha256
) {
  throw new Error("Finalization Node executable differs from the frozen Windows runtime");
}

await requireServersStopped();
await assertExistingSealedArtifactRoot();
assertExactFileInventory(
  await listRegularFiles(artifactRoot()),
  preFinalInventory,
  "pre-final proof",
);

const manifest = await readJson("manifest.json");
assertFrozenManifestIdentities(manifest);
for (const [name, current, recorded] of [
  ["RWA root", rwaRoot, manifest.rwa.root],
  ["Stasis source root", sourceRoot, manifest.stasis.sourceRoot],
  ["Stasis executable", executablePath, manifest.stasis.executablePath],
  ["Stasis archive", archivePath, manifest.stasis.archivePath],
  ["Node executable", nodeExecutable.path, manifest.environment.nodeExecutablePath],
]) {
  if (!samePath(current, recorded)) {
    throw new Error(`${name} differs from the path used by the retained primary run`);
  }
}
const buildTreeGuard = await readJson("rwa/build-tree-guard.json");
const crawl = await readJson("crawlee/compatibility.json");
const rwa = await readJson("rwa/compatibility.json");
const cypressRaw = await readJson("rwa/cypress-raw.json");
if (
  buildTreeGuard?.schema !== "stasis-compat-rwa-build-tree-guard-v1" ||
  buildTreeGuard?.protocol !== FROZEN_IDENTITIES.protocol ||
  !isDeepStrictEqual(buildTreeGuard?.expected, FROZEN_IDENTITIES.rwa.buildTree) ||
  !isDeepStrictEqual(buildTreeGuard?.afterCypressBaseline, FROZEN_IDENTITIES.rwa.buildTree) ||
  !isDeepStrictEqual(buildTreeGuard?.afterStasisCandidate, FROZEN_IDENTITIES.rwa.buildTree) ||
  !isDeepStrictEqual(
    buildTreeGuard?.serversAfterCypressBaseline,
    cypressRaw?.runtime?.externalServers,
  ) ||
  !isDeepStrictEqual(
    buildTreeGuard?.serversAfterStasisCandidate,
    cypressRaw?.runtime?.externalServers,
  )
) {
  throw new Error("RWA build/listener guard does not contain the exact frozen paired-lane evidence");
}
const recomputedCrawl = compareCrawl(
  await readJson("crawlee/playwright-raw.json"),
  await readJson("crawlee/stasis-raw.json"),
);
const recomputedRwa = compareRwa(
  cypressRaw,
  await readJson("rwa/stasis-raw.json"),
);
if (!isDeepStrictEqual(crawl, recomputedCrawl) || !isDeepStrictEqual(rwa, recomputedRwa)) {
  throw new Error("Stored comparison output does not match recomputation from raw evidence");
}
if (
  manifest.protocol !== "stasis-compat-bench-v1" ||
  crawl.baselineValid !== true ||
  crawl.candidateValid !== true ||
  crawl.primaryDenominator !== 20 ||
  rwa.baselineValid !== true ||
  rwa.candidateValid !== true ||
  rwa.denominator !== 8
) {
  throw new Error("Frozen protocol, baseline, or denominator gate failed during finalization");
}
if (manifest.harness.revision !== git(["rev-parse", "HEAD"], repositoryRoot)) {
  throw new Error("Harness revision changed after the primary manifest was written");
}
const harnessTrackedStatus = git(
  ["status", "--porcelain=v1", "--untracked-files=no"],
  repositoryRoot,
);
if (harnessTrackedStatus.length > 0) {
  throw new Error(`Harness tracked files changed after the primary run:\n${harnessTrackedStatus}`);
}
const rwaStatus = git(["status", "--porcelain=v1", "--untracked-files=all"], rwaRoot);
if (rwaStatus.length > 0) throw new Error(`RWA checkout was not restored clean:\n${rwaStatus}`);

const verificationObject = git(["stash", "create"], sourceRoot);
const sourceTree = verificationObject.length > 0
  ? git(["show", "-s", "--format=%T", verificationObject], sourceRoot)
  : git(["rev-parse", "HEAD^{tree}"], sourceRoot);
const sourceBaseRevision = git(["rev-parse", "HEAD"], sourceRoot);
const executableSha256 = await sha256File(executablePath);
if (!existsSync(archivePath)) throw new Error(`Frozen Stasis archive is missing: ${archivePath}`);
const archiveSha256 = await sha256File(archivePath);
const rwaRevision = git(["rev-parse", "HEAD"], rwaRoot);
const rwaTree = git(["rev-parse", "HEAD^{tree}"], rwaRoot);
const rwaBuildTree = await sha256DirectoryTree(path.join(rwaRoot, "build"));
const rwaInstalled = await installedRwaEvidence(rwaRoot);
const rwaGeneratedRuntimeFiles = await assertRwaGeneratedRuntimeFiles(rwaRoot);
const rwaRuntimeCache = await assertRwaRuntimeCacheEmpty(rwaRoot);
const rwaLocalEnvironmentFiles = await assertRwaLocalEnvironmentFilesAbsent(rwaRoot);
const rwaAmbientOverrides = assertRwaAmbientOverridesAbsent();
const installed = await installedPackageEvidence();
const browser = await installedBrowserEvidence();
const postflight = {
  protocol: "stasis-compat-bench-v1",
  createdAt: new Date().toISOString(),
  harness: {
    revision: manifest.harness.revision,
    trackedClean: true,
  },
  rwa: {
    root: rwaRoot,
    revision: rwaRevision,
    revisionMatchesManifest: rwaRevision === manifest.rwa.revision,
    revisionMatchesFrozen: rwaRevision === FROZEN_IDENTITIES.rwa.revision,
    tree: rwaTree,
    treeMatchesManifest: rwaTree === manifest.rwa.tree,
    treeMatchesFrozen: rwaTree === FROZEN_IDENTITIES.rwa.tree,
    buildTree: rwaBuildTree,
    buildTreeMatchesManifest: isDeepStrictEqual(rwaBuildTree, manifest.rwa.buildTree),
    buildTreeMatchesFrozen: isDeepStrictEqual(rwaBuildTree, FROZEN_IDENTITIES.rwa.buildTree),
    installed: {
      ...rwaInstalled,
      nodeModulesTreeMatchesManifest: isDeepStrictEqual(
        rwaInstalled.nodeModulesTree,
        manifest.rwa.installed.nodeModulesTree,
      ),
      nodeModulesTreeMatchesFrozen: isDeepStrictEqual(
        rwaInstalled.nodeModulesTree,
        FROZEN_IDENTITIES.rwa.installed.nodeModulesTree,
      ),
      cypressPackageTreeMatchesManifest: isDeepStrictEqual(
        rwaInstalled.cypressPackageTree,
        manifest.rwa.installed.cypressPackageTree,
      ),
      cypressPackageTreeMatchesFrozen: isDeepStrictEqual(
        rwaInstalled.cypressPackageTree,
        FROZEN_IDENTITIES.rwa.installed.cypressPackageTree,
      ),
      tsNodePackageTreeMatchesManifest: isDeepStrictEqual(
        rwaInstalled.tsNodePackageTree,
        manifest.rwa.installed.tsNodePackageTree,
      ),
      tsNodePackageTreeMatchesFrozen: isDeepStrictEqual(
        rwaInstalled.tsNodePackageTree,
        FROZEN_IDENTITIES.rwa.installed.tsNodePackageTree,
      ),
      cypressRuntimeTreeMatchesManifest: isDeepStrictEqual(
        rwaInstalled.cypressRuntimeTree,
        manifest.rwa.installed.cypressRuntimeTree,
      ),
      cypressRuntimeTreeMatchesFrozen: isDeepStrictEqual(
        rwaInstalled.cypressRuntimeTree,
        FROZEN_IDENTITIES.rwa.installed.cypressRuntimeTree,
      ),
      cypressExecutableMatchesManifest:
        rwaInstalled.cypressExecutableSha256 === manifest.rwa.installed.cypressExecutableSha256,
      cypressExecutableMatchesFrozen:
        rwaInstalled.cypressExecutableSha256 === FROZEN_IDENTITIES.rwa.installed.cypressExecutableSha256,
    },
    generatedRuntimeFiles: rwaGeneratedRuntimeFiles,
    generatedRuntimeFilesMatchManifest: isDeepStrictEqual(
      rwaGeneratedRuntimeFiles,
      manifest.rwa.generatedRuntimeFiles,
    ),
    generatedRuntimeFilesMatchFrozen: isDeepStrictEqual(
      rwaGeneratedRuntimeFiles,
      FROZEN_IDENTITIES.rwa.generatedRuntimeFiles,
    ),
    runtimeCache: rwaRuntimeCache,
    runtimeCacheMatchesManifest: isDeepStrictEqual(rwaRuntimeCache, manifest.rwa.runtimeCache),
    runtimeCacheMatchesFrozen: isDeepStrictEqual(rwaRuntimeCache, FROZEN_IDENTITIES.rwa.runtimeCache),
    localEnvironmentFiles: rwaLocalEnvironmentFiles,
    localEnvironmentFilesMatchManifest: isDeepStrictEqual(
      rwaLocalEnvironmentFiles,
      manifest.rwa.localEnvironmentFiles,
    ),
    localEnvironmentFilesMatchFrozen: isDeepStrictEqual(
      rwaLocalEnvironmentFiles,
      FROZEN_IDENTITIES.rwa.localEnvironmentFiles,
    ),
    ambientOverrides: rwaAmbientOverrides,
    ambientOverridesMatchManifest: isDeepStrictEqual(
      rwaAmbientOverrides,
      manifest.rwa.ambientOverrides,
    ),
    ambientOverridesMatchFrozen: isDeepStrictEqual(
      rwaAmbientOverrides,
      FROZEN_IDENTITIES.rwa.ambientOverrides,
    ),
    clean: true,
    serversStopped: true,
  },
  stasis: {
    sourceRoot,
    sourceObject: FROZEN_IDENTITIES.stasis.sourceObject,
    sourceObjectIsProvenanceOnly: true,
    baseRevision: sourceBaseRevision,
    baseRevisionMatchesManifest: sourceBaseRevision === manifest.stasis.baseRevision,
    baseRevisionMatchesFrozen: sourceBaseRevision === FROZEN_IDENTITIES.stasis.baseRevision,
    sourceTree,
    sourceTreeMatchesManifest: sourceTree === manifest.stasis.sourceTree,
    sourceTreeMatchesFrozen: sourceTree === FROZEN_IDENTITIES.stasis.sourceTree,
    executablePath,
    executableSha256,
    executableSha256MatchesManifest: executableSha256 === manifest.stasis.executableSha256,
    executableSha256MatchesFrozen:
      executableSha256 === FROZEN_IDENTITIES.stasis.executableSha256,
    archive: {
      path: archivePath,
      sha256: archiveSha256,
      sha256MatchesManifest: archiveSha256 === manifest.stasis.archiveSha256,
      sha256MatchesFrozen: archiveSha256 === FROZEN_IDENTITIES.stasis.archiveSha256,
    },
  },
  installed: {
    ...installed,
    nodeModulesTreeMatchesManifest: isDeepStrictEqual(
      installed.nodeModulesTree,
      manifest.baseline.installed.nodeModulesTree,
    ),
    nodeModulesTreeMatchesFrozen: isDeepStrictEqual(
      installed.nodeModulesTree,
      FROZEN_IDENTITIES.installed.nodeModulesTree,
    ),
    packageTreesMatchManifest: isDeepStrictEqual(
      installed.packageTrees,
      manifest.baseline.installed.packageTrees,
    ),
    packageTreesMatchFrozen: isDeepStrictEqual(
      installed.packageTrees,
      FROZEN_IDENTITIES.installed.packageTrees,
    ),
  },
  nodeRuntime: {
    ...nodeExecutable,
    pathMatchesManifest: samePath(nodeExecutable.path, manifest.environment.nodeExecutablePath),
    bytesMatchManifest: nodeExecutable.bytes === manifest.environment.nodeExecutableBytes,
    bytesMatchFrozen: nodeExecutable.bytes === FROZEN_IDENTITIES.nodeExecutable.bytes,
    sha256MatchesManifest: nodeExecutable.sha256 === manifest.environment.nodeExecutableSha256,
    sha256MatchesFrozen: nodeExecutable.sha256 === FROZEN_IDENTITIES.nodeExecutable.sha256,
  },
  browser: {
    ...browser,
    revisionMatchesManifest:
      browser.chromiumRevisionDirectory === manifest.baseline.chromiumRevisionDirectory,
    revisionMatchesFrozen:
      browser.chromiumRevisionDirectory === FROZEN_IDENTITIES.baseline.chromiumRevisionDirectory,
    versionMatchesManifest: browser.chromiumVersion === manifest.baseline.chromiumVersion,
    versionMatchesFrozen: browser.chromiumVersion === FROZEN_IDENTITIES.baseline.chromiumVersion,
    executableMatchesManifest:
      browser.chromiumExecutableSha256 === manifest.baseline.chromiumExecutableSha256,
    executableMatchesFrozen:
      browser.chromiumExecutableSha256 === FROZEN_IDENTITIES.baseline.chromiumExecutableSha256,
    installTreeMatchesManifest: isDeepStrictEqual(
      browser.chromiumInstallTree,
      manifest.baseline.chromiumInstallTree,
    ),
    installTreeMatchesFrozen: isDeepStrictEqual(
      browser.chromiumInstallTree,
      FROZEN_IDENTITIES.baseline.chromiumInstallTree,
    ),
  },
};
if (
  !postflight.rwa.revisionMatchesManifest ||
  !postflight.rwa.revisionMatchesFrozen ||
  !postflight.rwa.treeMatchesManifest ||
  !postflight.rwa.treeMatchesFrozen ||
  !postflight.rwa.buildTreeMatchesManifest ||
  !postflight.rwa.buildTreeMatchesFrozen ||
  !postflight.rwa.installed.nodeModulesTreeMatchesManifest ||
  !postflight.rwa.installed.nodeModulesTreeMatchesFrozen ||
  !postflight.rwa.installed.cypressPackageTreeMatchesManifest ||
  !postflight.rwa.installed.cypressPackageTreeMatchesFrozen ||
  !postflight.rwa.installed.tsNodePackageTreeMatchesManifest ||
  !postflight.rwa.installed.tsNodePackageTreeMatchesFrozen ||
  !postflight.rwa.installed.cypressRuntimeTreeMatchesManifest ||
  !postflight.rwa.installed.cypressRuntimeTreeMatchesFrozen ||
  !postflight.rwa.installed.cypressExecutableMatchesManifest ||
  !postflight.rwa.installed.cypressExecutableMatchesFrozen ||
  !postflight.rwa.generatedRuntimeFilesMatchManifest ||
  !postflight.rwa.generatedRuntimeFilesMatchFrozen ||
  !postflight.rwa.runtimeCacheMatchesManifest ||
  !postflight.rwa.runtimeCacheMatchesFrozen ||
  !postflight.rwa.localEnvironmentFilesMatchManifest ||
  !postflight.rwa.localEnvironmentFilesMatchFrozen ||
  !postflight.rwa.ambientOverridesMatchManifest ||
  !postflight.rwa.ambientOverridesMatchFrozen ||
  !postflight.stasis.baseRevisionMatchesManifest ||
  !postflight.stasis.baseRevisionMatchesFrozen ||
  !postflight.stasis.sourceTreeMatchesManifest ||
  !postflight.stasis.sourceTreeMatchesFrozen ||
  !postflight.stasis.executableSha256MatchesManifest ||
  !postflight.stasis.executableSha256MatchesFrozen ||
  !postflight.stasis.archive.sha256MatchesManifest ||
  !postflight.stasis.archive.sha256MatchesFrozen ||
  !postflight.installed.nodeModulesTreeMatchesManifest ||
  !postflight.installed.nodeModulesTreeMatchesFrozen ||
  !postflight.installed.packageTreesMatchManifest ||
  !postflight.installed.packageTreesMatchFrozen ||
  !postflight.nodeRuntime.pathMatchesManifest ||
  !postflight.nodeRuntime.bytesMatchManifest ||
  !postflight.nodeRuntime.bytesMatchFrozen ||
  !postflight.nodeRuntime.sha256MatchesManifest ||
  !postflight.nodeRuntime.sha256MatchesFrozen ||
  !postflight.browser.revisionMatchesManifest ||
  !postflight.browser.revisionMatchesFrozen ||
  !postflight.browser.versionMatchesManifest ||
  !postflight.browser.versionMatchesFrozen ||
  !postflight.browser.executableMatchesManifest ||
  !postflight.browser.executableMatchesFrozen ||
  !postflight.browser.installTreeMatchesManifest ||
  !postflight.browser.installTreeMatchesFrozen
) {
  throw new Error("A frozen source, build, executable, package, or browser identity drifted during proof execution");
}

function samePath(left, right) {
  if (typeof right !== "string" || right.length === 0) return false;
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
console.log(await writeJson("postflight.json", postflight));
console.log(await writeText("report.md", finalReportMarkdown({ manifest, crawl, rwa, postflight })));

const finalFilesBeforeIndex = [...preFinalInventory, "postflight.json", "report.md"];
const indexedFiles = await listRegularFiles(artifactRoot());
assertExactFileInventory(indexedFiles, finalFilesBeforeIndex, "final proof before index");
const entries = [];
for (const relativePath of indexedFiles) {
  const absolutePath = path.join(artifactRoot(), ...relativePath.split("/"));
  const metadata = await lstat(absolutePath);
  entries.push({ relativePath, bytes: metadata.size, sha256: await sha256File(absolutePath) });
}
console.log(
  await writeJson("artifact-index.json", {
    schema: "stasis-compat-artifact-index-v1",
    protocol: "stasis-compat-bench-v1",
    createdAt: new Date().toISOString(),
    scope: "Every retained proof file except this self-index",
    fileCount: entries.length,
    entries,
  }),
);
assertExactFileInventory(
  await listRegularFiles(artifactRoot()),
  [...finalFilesBeforeIndex, "artifact-index.json"],
  "sealed proof",
);

async function requireServersStopped() {
  const results = await Promise.all(
    ["127.0.0.1", "::1"].flatMap((host) => [3000, 3001].map((port) => probeTcpPort(host, port))),
  );
  const live = results.filter(({ state }) => state !== "refused");
  if (live.length > 0) {
    throw new Error(`RWA server ports must be provably stopped: ${JSON.stringify(live)}`);
  }
}

function probeTcpPort(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let finished = false;
    const finish = (state, detail) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ host, port, state, ...(detail === undefined ? {} : { detail }) });
    };
    socket.setTimeout(1_500, () => finish("unknown", "connect timeout"));
    socket.once("connect", () => finish("listening"));
    socket.once("error", (error) => {
      finish(error.code === "ECONNREFUSED" ? "refused" : "unknown", error.code ?? error.message);
    });
  });
}

function git(args, cwd) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}
