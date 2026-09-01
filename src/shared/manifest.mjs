import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { chromium } from "playwright";

import { repositoryRoot, sha256DirectoryTree, sha256File } from "./io.mjs";
import {
  assertRwaGeneratedRuntimeFiles,
  assertRwaAmbientOverridesAbsent,
  assertRwaLocalEnvironmentFilesAbsent,
  assertRwaRuntimeCacheEmpty,
  RWA_AMBIENT_OVERRIDE_IDENTITY,
  RWA_GENERATED_RUNTIME_IDENTITY,
  RWA_LOCAL_ENV_IDENTITY,
  RWA_RUNTIME_CACHE_IDENTITY,
} from "../rwa/runtime-identity.mjs";

export const FROZEN_IDENTITIES = deepFreeze({
  protocol: "stasis-compat-bench-v1",
  node: "v22.20.0",
  npm: "10.9.3",
  platform: "win32",
  architecture: "x64",
  nodeExecutable: {
    sha256: "fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d",
    bytes: 85_588_976,
  },
  stasis: {
    sourceObject: "5d55c0cff33ea9baaf139c6f6aa31f538b69062e",
    sourceTree: "eaafda92f062a063353376339e566999c5f8db43",
    baseRevision: "68c99e29111050902a3f152af3ec03ad9c8a8b22",
    executableSha256: "7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d",
    archiveSha256: "1fdaefc03e36102b2741406584522c1a9aab786210926b5a093c9cda1eb117f4",
    sdk: "@oxhq/stasis@0.2.1",
  },
  rwa: {
    revision: "28ca4d03e4c68d366ccdbb25d43e1f37b3c67a4d",
    tree: "04c8874fbdcfd56a4d6fb74e7810304622fe787f",
    authSpecOid: "9554bac0826cb996c5bb4cab3c46d3ad81e2603c",
    authSpecBlobSha256: "1bdea574f3b9dd6c608522ddf698a72d2295963bb8e400ae27966d1fa011366d",
    authSpecWorktreeSha256: "b5e2150c626b7c8e9849f70b25f143759a7fafaba1421e804bb94471fe748966",
    seedOid: "9a785bdf968bfdc33d5ae8493ed544121254f4cf",
    seedBlobSha256: "694f9f9e955211cc6037a1d58eb020671375491ea670a3fcf6183a81a34da715",
    seedWorktreeSha256: "c2449435bbf44bcef412a178fb51b8561d3c2d7ba9fc55b10d0b8a09ea66c3a1",
    buildTree: {
      sha256: "769186804dfdda106af44894a8f9d065fe840db5835a1c515debff3e9c469a09",
      fileCount: 10,
      totalBytes: 12_961_036,
    },
    generatedRuntimeFiles: RWA_GENERATED_RUNTIME_IDENTITY,
    runtimeCache: RWA_RUNTIME_CACHE_IDENTITY,
    localEnvironmentFiles: RWA_LOCAL_ENV_IDENTITY,
    ambientOverrides: RWA_AMBIENT_OVERRIDE_IDENTITY,
    installed: {
      nodeModulesTree: {
        sha256: "44a4e04f3e98cbb195ad64d7ec701b215b46963fa1aca03b1a33f06882f9944e",
        fileCount: 122_620,
        totalBytes: 589_323_096,
      },
      cypressPackageTree: {
        sha256: "f4929d43bf3ec26924a90ed25ca5ae10f3d25431aec76c680352711ffceb7303",
        fileCount: 2_349,
        totalBytes: 6_889_137,
      },
      tsNodePackageTree: {
        sha256: "4f3b74021e24f701e1e2bf91d00311c955167dbd22818dc569991fe903db3a47",
        fileCount: 133,
        totalBytes: 1_305_650,
      },
      cypressRuntimeTree: {
        sha256: "894db056ca57f806054dcd97bddd0c49d3fd58d5a40ac8530eec6440a20c13c3",
        fileCount: 21_519,
        totalBytes: 785_105_214,
      },
      cypressExecutableSha256:
        "3af48298e0deb0202601e18dbbb3c1ec0da29a18edd842528e83ea3e53126ecf",
    },
    frontendOrigin: "http://localhost:3000",
    apiOrigin: "http://localhost:3001",
    yarn: "1.22.22",
    cypress: "15.17.0",
    electron: "138.0.7204.251",
    viewport: { width: 1280, height: 1000 },
  },
  installed: {
    nodeModulesTree: {
      sha256: "57d66e9c964a071ed98ee124665e6735875e2a871bfadc3dad42d3d35a62e5fe",
      fileCount: 11_454,
      totalBytes: 94_553_660,
    },
    packageTrees: {
      stasisSdk: {
        sha256: "0932351210fd9124cf3a4eb739bb86b956cde5cf00c5292e374097dabea90f60",
        fileCount: 55,
        totalBytes: 849_583,
      },
      crawleeNamespace: {
        sha256: "b7f3daf2abbaf5bf3865d09a7c9167e905b7ea4cf83bc5fac3f317a3e4f223d4",
        fileCount: 421,
        totalBytes: 2_349_747,
      },
      crawleeFacade: {
        sha256: "114dc8dddef30fb156b8dade09a9d46bf35c5c4a5f2c6cb9e2842f6ed952c921",
        fileCount: 8,
        totalBytes: 35_412,
      },
      playwright: {
        sha256: "dd24f068be6bfa4c5c81985b30d45e7cf7dd4bd34baf0d5f7c6b29257c22d3ee",
        fileCount: 62,
        totalBytes: 5_074_152,
      },
      playwrightCore: {
        sha256: "0059641c074429e818b3c2e9691efe6575769cdb8708dd7b21f867a8e4289fd7",
        fileCount: 111,
        totalBytes: 13_442_086,
      },
    },
  },
  baseline: {
    crawlee: "3.18.1",
    crawleeGitHead: "5dbdf0e0095235cf9128dbf0a34613f4cca5ce74",
    playwright: "1.62.1",
    chromiumRevisionDirectory: "chromium-1234",
    chromiumVersion: "151.0.7922.34",
    chromiumExecutableSha256: "409805a16d6416087e6b2f778df1cf8f7bbb267d6b99f6b5bb0a618eace234f2",
    chromiumInstallTree: {
      sha256: "09593e8d073bbaac0a35703e86d0a1e2d7297d9adde76712b66235872c4ea77c",
      fileCount: 311,
      totalBytes: 447_418_087,
    },
  },
  rules: {
    primaryRetries: 0,
    concurrency: 1,
    performanceClaim: false,
    upstreamApplicationModifications: 0,
    stasisFallback: false,
  },
});

export async function buildManifest(executablePath) {
  const sourceRoot = path.resolve(
    process.env.STASIS_SOURCE_ROOT ?? path.join("inputs", "stasis-source"),
  );
  const archivePath = path.resolve(
    process.env.STASIS_ARCHIVE ??
      path.join("candidate", "stasis-0.2.1-windows-x86_64-local-5d55c0cf-r1.zip"),
  );
  const rwaRoot = path.resolve(
    process.env.RWA_ROOT ?? path.join("inputs", "cypress-realworld-app-28ca4d0"),
  );
  requireCleanHarness();
  if (process.version !== FROZEN_IDENTITIES.node) {
    throw new Error(`Node version mismatch: expected ${FROZEN_IDENTITIES.node}, got ${process.version}`);
  }
  const nodeExecutableBytes = statSync(process.execPath).size;
  const nodeExecutableSha256 = await sha256File(process.execPath);
  if (
    nodeExecutableBytes !== FROZEN_IDENTITIES.nodeExecutable.bytes ||
    nodeExecutableSha256 !== FROZEN_IDENTITIES.nodeExecutable.sha256
  ) {
    throw new Error("Node executable bytes differ from the frozen Windows runtime");
  }
  const executableSha256 = await sha256File(executablePath);
  if (executableSha256 !== FROZEN_IDENTITIES.stasis.executableSha256) {
    throw new Error(
      `Stasis executable hash mismatch: expected ${FROZEN_IDENTITIES.stasis.executableSha256}, got ${executableSha256}`,
    );
  }
  const archiveSha256 = await sha256File(archivePath);
  if (archiveSha256 !== FROZEN_IDENTITIES.stasis.archiveSha256) {
    throw new Error(
      `Stasis archive hash mismatch: expected ${FROZEN_IDENTITIES.stasis.archiveSha256}, got ${archiveSha256}`,
    );
  }
  const verificationObject = git(["stash", "create"], sourceRoot);
  const currentSourceTree = verificationObject.length > 0
    ? git(["show", "-s", "--format=%T", verificationObject], sourceRoot)
    : git(["rev-parse", "HEAD^{tree}"], sourceRoot);
  if (currentSourceTree !== FROZEN_IDENTITIES.stasis.sourceTree) {
    throw new Error(
      `Stasis source tree drifted: expected ${FROZEN_IDENTITIES.stasis.sourceTree}, got ${currentSourceTree || "clean/no object"}`,
    );
  }
  const browser = await installedBrowserEvidence();
  const rwa = await verifyRwa(rwaRoot);
  const manifest = {
    protocol: FROZEN_IDENTITIES.protocol,
    protocolStatus: "v1-preregistered",
    createdAt: new Date().toISOString(),
    harness: {
      repository: repositoryRoot,
      revision: git(["rev-parse", "HEAD"], repositoryRoot),
      contractSha256: await sha256File(path.join(repositoryRoot, "protocol", "stasis-compat-bench-v1.md")),
      corpusSha256: await sha256File(path.join(repositoryRoot, "src", "crawl", "corpus.mjs")),
      rwaCasesSha256: await sha256File(path.join(repositoryRoot, "src", "rwa", "cases.mjs")),
      packageLockSha256: await sha256File(path.join(repositoryRoot, "package-lock.json")),
    },
    rwa,
    stasis: {
      sourceRoot,
      sourceObject: FROZEN_IDENTITIES.stasis.sourceObject,
      sourceTree: currentSourceTree,
      workingTreeVerificationObject: verificationObject,
      baseRevision: git(["rev-parse", "HEAD"], sourceRoot),
      sdk: FROZEN_IDENTITIES.stasis.sdk,
      executablePath: path.resolve(executablePath),
      executableSha256,
      archivePath,
      archiveSha256,
    },
    baseline: {
      crawlee: FROZEN_IDENTITIES.baseline.crawlee,
      crawleeGitHead: FROZEN_IDENTITIES.baseline.crawleeGitHead,
      playwright: FROZEN_IDENTITIES.baseline.playwright,
      ...browser,
      installed: await installedPackageEvidence(),
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      osRelease: os.release(),
      osVersion: os.version(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      nodeExecutablePath: path.resolve(process.execPath),
      nodeExecutableBytes,
      nodeExecutableSha256,
      npm: currentNpmVersion(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    rules: {
      ...FROZEN_IDENTITIES.rules,
    },
  };
  assertFrozenManifestIdentities(manifest);
  return manifest;
}

export function assertFrozenManifestIdentities(manifest) {
  const expected = FROZEN_IDENTITIES;
  const checks = [
    ["protocol", manifest?.protocol, expected.protocol],
    ["Node", manifest?.environment?.node, expected.node],
    ["npm", manifest?.environment?.npm, expected.npm],
    ["platform", manifest?.environment?.platform, expected.platform],
    ["architecture", manifest?.environment?.architecture, expected.architecture],
    ["Node executable bytes", manifest?.environment?.nodeExecutableBytes, expected.nodeExecutable.bytes],
    ["Node executable hash", manifest?.environment?.nodeExecutableSha256, expected.nodeExecutable.sha256],
    ["Stasis source object", manifest?.stasis?.sourceObject, expected.stasis.sourceObject],
    ["Stasis source tree", manifest?.stasis?.sourceTree, expected.stasis.sourceTree],
    ["Stasis base revision", manifest?.stasis?.baseRevision, expected.stasis.baseRevision],
    ["Stasis SDK", manifest?.stasis?.sdk, expected.stasis.sdk],
    ["Stasis executable", manifest?.stasis?.executableSha256, expected.stasis.executableSha256],
    ["Stasis archive", manifest?.stasis?.archiveSha256, expected.stasis.archiveSha256],
    ["RWA revision", manifest?.rwa?.revision, expected.rwa.revision],
    ["RWA tree", manifest?.rwa?.tree, expected.rwa.tree],
    ["RWA auth spec OID", manifest?.rwa?.authSpecOid, expected.rwa.authSpecOid],
    ["RWA auth spec blob", manifest?.rwa?.authSpecBlobSha256, expected.rwa.authSpecBlobSha256],
    ["RWA auth spec worktree", manifest?.rwa?.authSpecWorktreeSha256, expected.rwa.authSpecWorktreeSha256],
    ["RWA seed OID", manifest?.rwa?.seedOid, expected.rwa.seedOid],
    ["RWA seed blob", manifest?.rwa?.seedBlobSha256, expected.rwa.seedBlobSha256],
    ["RWA seed worktree", manifest?.rwa?.seedWorktreeSha256, expected.rwa.seedWorktreeSha256],
    ["RWA build tree", manifest?.rwa?.buildTree, expected.rwa.buildTree],
    ["RWA generated runtime files", manifest?.rwa?.generatedRuntimeFiles, expected.rwa.generatedRuntimeFiles],
    ["RWA runtime cache", manifest?.rwa?.runtimeCache, expected.rwa.runtimeCache],
    ["RWA local environment files", manifest?.rwa?.localEnvironmentFiles, expected.rwa.localEnvironmentFiles],
    ["RWA ambient overrides", manifest?.rwa?.ambientOverrides, expected.rwa.ambientOverrides],
    ["RWA node_modules tree", manifest?.rwa?.installed?.nodeModulesTree, expected.rwa.installed.nodeModulesTree],
    ["RWA Cypress package tree", manifest?.rwa?.installed?.cypressPackageTree, expected.rwa.installed.cypressPackageTree],
    ["RWA ts-node package tree", manifest?.rwa?.installed?.tsNodePackageTree, expected.rwa.installed.tsNodePackageTree],
    ["RWA Cypress runtime tree", manifest?.rwa?.installed?.cypressRuntimeTree, expected.rwa.installed.cypressRuntimeTree],
    ["RWA Cypress executable", manifest?.rwa?.installed?.cypressExecutableSha256, expected.rwa.installed.cypressExecutableSha256],
    ["RWA frontend origin", manifest?.rwa?.frontendOrigin, expected.rwa.frontendOrigin],
    ["RWA API origin", manifest?.rwa?.apiOrigin, expected.rwa.apiOrigin],
    ["RWA runtime", manifest?.rwa?.runtime, {
      node: expected.node,
      yarn: expected.rwa.yarn,
      cypress: expected.rwa.cypress,
      electron: expected.rwa.electron,
      viewport: expected.rwa.viewport,
    }],
    ["Crawlee version", manifest?.baseline?.crawlee, expected.baseline.crawlee],
    ["Crawlee Git head", manifest?.baseline?.crawleeGitHead, expected.baseline.crawleeGitHead],
    ["Playwright version", manifest?.baseline?.playwright, expected.baseline.playwright],
    ["Chromium revision directory", manifest?.baseline?.chromiumRevisionDirectory, expected.baseline.chromiumRevisionDirectory],
    ["Chromium version", manifest?.baseline?.chromiumVersion, expected.baseline.chromiumVersion],
    ["Chromium executable", manifest?.baseline?.chromiumExecutableSha256, expected.baseline.chromiumExecutableSha256],
    ["Chromium install tree", manifest?.baseline?.chromiumInstallTree, expected.baseline.chromiumInstallTree],
    ["node_modules tree", manifest?.baseline?.installed?.nodeModulesTree, expected.installed.nodeModulesTree],
    ["selected package trees", manifest?.baseline?.installed?.packageTrees, expected.installed.packageTrees],
    ["rules", manifest?.rules, expected.rules],
  ];
  const violations = checks
    .filter(([, actual, frozen]) => !isDeepStrictEqual(actual, frozen))
    .map(([name, actual, frozen]) => `${name}: expected ${JSON.stringify(frozen)}, got ${JSON.stringify(actual)}`);
  if (violations.length > 0) {
    throw new Error(`Frozen identity mismatch:\n${violations.join("\n")}`);
  }
}

export async function installedPackageEvidence() {
  return {
    nodeModulesTree: await sha256DirectoryTree(path.join(repositoryRoot, "node_modules")),
    packageTrees: {
      stasisSdk: await sha256DirectoryTree(path.join(repositoryRoot, "node_modules", "@oxhq", "stasis")),
      crawleeNamespace: await sha256DirectoryTree(path.join(repositoryRoot, "node_modules", "@crawlee")),
      crawleeFacade: await sha256DirectoryTree(path.join(repositoryRoot, "node_modules", "crawlee")),
      playwright: await sha256DirectoryTree(path.join(repositoryRoot, "node_modules", "playwright")),
      playwrightCore: await sha256DirectoryTree(path.join(repositoryRoot, "node_modules", "playwright-core")),
    },
  };
}

export async function installedRwaEvidence(root) {
  const nodeModulesRoot = path.join(root, "node_modules");
  const cypressPackageRoot = path.join(nodeModulesRoot, "cypress");
  const tsNodePackageRoot = path.join(nodeModulesRoot, "ts-node");
  const cypressCli = path.join(cypressPackageRoot, "bin", "cypress");
  const cacheRoot = command(process.execPath, [cypressCli, "cache", "path"]);
  const cypressRuntimeRoot = path.join(cacheRoot, FROZEN_IDENTITIES.rwa.cypress, "Cypress");
  const cypressExecutablePath = path.join(cypressRuntimeRoot, "Cypress.exe");
  return {
    nodeModulesRoot,
    nodeModulesTree: await sha256DirectoryTree(nodeModulesRoot),
    cypressPackageRoot,
    cypressPackageTree: await sha256DirectoryTree(cypressPackageRoot),
    tsNodePackageRoot,
    tsNodePackageTree: await sha256DirectoryTree(tsNodePackageRoot),
    cypressRuntimeRoot,
    cypressRuntimeTree: await sha256DirectoryTree(cypressRuntimeRoot),
    cypressExecutablePath,
    cypressExecutableBytes: statSync(cypressExecutablePath).size,
    cypressExecutableSha256: await sha256File(cypressExecutablePath),
  };
}

export async function installedBrowserEvidence() {
  const chromiumExecutable = chromium.executablePath();
  const chromiumInstallRoot = path.dirname(path.dirname(chromiumExecutable));
  const browser = await chromium.launch({ headless: true });
  let chromiumVersion;
  try {
    chromiumVersion = browser.version();
  } finally {
    await browser.close();
  }
  return {
    chromiumRevisionDirectory: path.basename(chromiumInstallRoot),
    chromiumVersion,
    chromiumExecutable,
    chromiumExecutableSha256: await sha256File(chromiumExecutable),
    chromiumInstallRoot,
    chromiumInstallTree: await sha256DirectoryTree(chromiumInstallRoot),
  };
}

export function currentNpmVersion() {
  const npmCli = process.env.npm_execpath;
  if (typeof npmCli !== "string" || npmCli.length === 0) {
    throw new Error("The sealed command must run through npm so npm_execpath is available");
  }
  return command(process.execPath, [npmCli, "--version"]);
}

async function verifyRwa(root) {
  const revision = git(["rev-parse", "HEAD"], root);
  const tree = git(["rev-parse", "HEAD^{tree}"], root);
  const specPath = path.join(root, "cypress", "tests", "ui", "auth.spec.ts");
  const seedPath = path.join(root, "data", "database-seed.json");
  const authSpecOid = git(["rev-parse", "HEAD:cypress/tests/ui/auth.spec.ts"], root);
  const seedOid = git(["rev-parse", "HEAD:data/database-seed.json"], root);
  const authSpecBlobSha256 = gitBlobSha256(authSpecOid, root);
  const seedBlobSha256 = gitBlobSha256(seedOid, root);
  const authSpecWorktreeSha256 = await sha256File(specPath);
  const seedWorktreeSha256 = await sha256File(seedPath);
  for (const [name, actual, expected] of [
    ["revision", revision, FROZEN_IDENTITIES.rwa.revision],
    ["tree", tree, FROZEN_IDENTITIES.rwa.tree],
    ["auth spec Git blob", authSpecOid, FROZEN_IDENTITIES.rwa.authSpecOid],
    ["seed Git blob", seedOid, FROZEN_IDENTITIES.rwa.seedOid],
    ["auth spec blob SHA-256", authSpecBlobSha256, FROZEN_IDENTITIES.rwa.authSpecBlobSha256],
    ["seed blob SHA-256", seedBlobSha256, FROZEN_IDENTITIES.rwa.seedBlobSha256],
    ["auth spec worktree SHA-256", authSpecWorktreeSha256, FROZEN_IDENTITIES.rwa.authSpecWorktreeSha256],
    ["seed worktree SHA-256", seedWorktreeSha256, FROZEN_IDENTITIES.rwa.seedWorktreeSha256],
  ]) {
    if (actual !== expected) {
      throw new Error(`RWA ${name} mismatch: expected ${expected}, got ${actual}`);
    }
  }
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"], root);
  const changedPaths = status.length === 0
    ? []
    : status.split(/\r?\n/u).map((line) => line.slice(3));
  const unexpectedPaths = changedPaths.filter((value) => value !== "data/database.json");
  if (unexpectedPaths.length > 0) {
    throw new Error(`RWA checkout contains non-runtime changes:\n${status}`);
  }
  const runtimeDatabaseOid = git(["rev-parse", "HEAD:data/database.json"], root);
  const runtimeDatabaseBlob = gitBlob(runtimeDatabaseOid, root);
  const runtimeDatabaseWorktree = readFileSync(path.join(root, "data", "database.json"));
  const runtimeDatabaseNewlineOnly = normalizedNewlines(runtimeDatabaseBlob).equals(
    normalizedNewlines(runtimeDatabaseWorktree),
  );
  if (changedPaths.includes("data/database.json") && !runtimeDatabaseNewlineOnly) {
    throw new Error("RWA runtime database drift is not the server-owned newline-only mutation");
  }
  return {
    root,
    revision,
    tree,
    frontendOrigin: FROZEN_IDENTITIES.rwa.frontendOrigin,
    apiOrigin: FROZEN_IDENTITIES.rwa.apiOrigin,
    runtime: {
      node: FROZEN_IDENTITIES.node,
      yarn: FROZEN_IDENTITIES.rwa.yarn,
      cypress: FROZEN_IDENTITIES.rwa.cypress,
      electron: FROZEN_IDENTITIES.rwa.electron,
      viewport: FROZEN_IDENTITIES.rwa.viewport,
    },
    authSpecOid,
    authSpecBlobSha256,
    authSpecWorktreeSha256,
    seedOid,
    seedBlobSha256,
    seedWorktreeSha256,
    buildTree: await sha256DirectoryTree(path.join(root, "build")),
    generatedRuntimeFiles: await assertRwaGeneratedRuntimeFiles(root),
    runtimeCache: await assertRwaRuntimeCacheEmpty(root),
    localEnvironmentFiles: await assertRwaLocalEnvironmentFilesAbsent(root),
    ambientOverrides: assertRwaAmbientOverridesAbsent(),
    installed: await installedRwaEvidence(root),
    runtimeStatePathsAtManifest: changedPaths,
    runtimeDatabase: {
      blobOid: runtimeDatabaseOid,
      blobSha256: createHash("sha256").update(runtimeDatabaseBlob).digest("hex"),
      worktreeSha256: createHash("sha256").update(runtimeDatabaseWorktree).digest("hex"),
      newlineOnlyDifference: changedPaths.includes("data/database.json") && runtimeDatabaseNewlineOnly,
    },
    upstreamSourceEdits: 0,
  };
}

function gitBlobSha256(oid, cwd) {
  return createHash("sha256").update(gitBlob(oid, cwd)).digest("hex");
}

function gitBlob(oid, cwd) {
  return execFileSync("git", ["-C", cwd, "cat-file", "blob", oid], {
    encoding: null,
    windowsHide: true,
  });
}

function normalizedNewlines(value) {
  const input = Buffer.from(value);
  const normalized = [];
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === 0x0d && input[index + 1] === 0x0a) {
      normalized.push(0x0a);
      index += 1;
    } else {
      normalized.push(input[index]);
    }
  }
  while (normalized.at(-1) === 0x0a) normalized.pop();
  return Buffer.from(normalized);
}

function requireCleanHarness() {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"], repositoryRoot);
  if (status.length > 0) {
    throw new Error(`Harness must be committed before a primary run:\n${status}`);
  }
}

function git(args, cwd) {
  return command("git", ["-C", cwd, ...args]);
}

function command(file, args) {
  return execFileSync(file, args, { encoding: "utf8", windowsHide: true }).trim();
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
