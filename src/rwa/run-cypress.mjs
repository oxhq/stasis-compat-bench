import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { listRegularFiles, repositoryRoot, serializeError, writeJson } from "../shared/io.mjs";
import { rwaAuthCases, rwaAuthSource } from "./cases.mjs";
import {
  assertRwaAmbientOverridesAbsent,
  assertRwaGeneratedRuntimeFiles,
  assertRwaLocalEnvironmentFilesAbsent,
  assertRwaRuntimeCacheEmpty,
  inspectRwaAmbientOverrides,
  inspectRwaGeneratedRuntimeFiles,
  inspectRwaLocalEnvironmentFiles,
  inspectRwaRuntimeCache,
} from "./runtime-identity.mjs";

const expected = Object.freeze({
  revision: rwaAuthSource.revision,
  tree: "04c8874fbdcfd56a4d6fb74e7810304622fe787f",
  node: "v22.20.0",
  resolvedNodeVersion: "22.20.0",
  cypressVersion: "15.17.0",
  electronVersion: "138.0.7204.251",
  baseUrl: "http://localhost:3000",
  apiUrl: "http://localhost:3001",
  spec: Object.freeze({
    path: rwaAuthSource.specPath,
    blobOid: rwaAuthSource.specBlobOid,
    blobSha256: rwaAuthSource.specBlobSha256,
    worktreeSha256: "b5e2150c626b7c8e9849f70b25f143759a7fafaba1421e804bb94471fe748966",
  }),
  seed: Object.freeze({
    path: "data/database-seed.json",
    blobOid: "9a785bdf968bfdc33d5ae8493ed544121254f4cf",
    blobSha256: "694f9f9e955211cc6037a1d58eb020671375491ea670a3fcf6183a81a34da715",
    worktreeSha256: "c2449435bbf44bcef412a178fb51b8561d3c2d7ba9fc55b10d0b8a09ea66c3a1",
  }),
  databasePath: "data/database.json",
  configuredRetries: Object.freeze({ runMode: 2 }),
  primaryRetries: Object.freeze({ runMode: 0, openMode: 0 }),
  viewport: Object.freeze({ width: 1280, height: 1000 }),
  buildTree: Object.freeze({
    sha256: "769186804dfdda106af44894a8f9d065fe840db5835a1c515debff3e9c469a09",
    fileCount: 10,
    totalBytes: 12_961_036,
  }),
  nodeExecutable: Object.freeze({
    sha256: "fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d",
    bytes: 85_588_976,
  }),
  serverBodies: Object.freeze({
    frontend: Object.freeze({
      contentType: "text/html; charset=UTF-8",
      bytes: 1_986,
      sha256: "ac35f7a0c820e107e30fba1fda385af1f0356a3b235aea25c008ac4d5d838f0a",
    }),
    backend: Object.freeze({
      contentType: "text/html; charset=utf-8",
      bytes: 31,
      sha256: "d6b1c376168804954c90cc66eb240ce7859e5276ddae40e0fcb07a9bfceff412",
    }),
  }),
});

export const rwaBaselineExpected = expected;
export const rwaFrozenServerRuntimeIdentity = Object.freeze({
  buildTree: expected.buildTree,
  serverBodies: expected.serverBodies,
});

export class RwaBaselineInvalidError extends Error {
  constructor(message, artifactPath, artifact) {
    super(message);
    this.name = "RwaBaselineInvalidError";
    this.artifactPath = artifactPath;
    this.artifact = artifact;
  }
}

export function buildCypressRunOptions(upstreamRoot) {
  const root = path.resolve(upstreamRoot);
  return {
    browser: "electron",
    config: { retries: { ...expected.primaryRetries } },
    configFile: path.join(root, "cypress.config.ts"),
    headless: true,
    project: root,
    quiet: true,
    record: false,
    spec: path.join(root, ...expected.spec.path.split("/")),
    testingType: "e2e",
  };
}

export function newlineOnlyEqual(left, right) {
  return normalizeNewlines(left).equals(normalizeNewlines(right));
}

export async function inspectRwaCheckout(
  upstreamRoot,
  { runGit = defaultRunGit, readFileImpl = readFile } = {},
) {
  const root = path.resolve(upstreamRoot);
  const violations = [];
  const revision = text(runGit(root, ["rev-parse", "--verify", "HEAD"]));
  const tree = text(runGit(root, ["rev-parse", "HEAD^{tree}"]));
  const symbolicHead = runGit(root, ["symbolic-ref", "-q", "HEAD"], [0, 1]);
  const detached = symbolicHead.status === 1 && text(symbolicHead).length === 0;
  const trackedStatus = text(
    runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=no"]),
    false,
  );
  const trackedStatusEntries = trackedStatus.length === 0
    ? []
    : trackedStatus.split("\0").filter(Boolean);

  const spec = await inspectPinnedFile(root, expected.spec, runGit, readFileImpl);
  const seed = await inspectPinnedFile(root, expected.seed, runGit, readFileImpl);
  const generatedRuntimeFiles = await inspectRwaGeneratedRuntimeFiles(root);
  const runtimeCache = await inspectRwaRuntimeCache(root);
  const localEnvironmentFiles = await inspectRwaLocalEnvironmentFiles(root);
  const ambientOverrides = inspectRwaAmbientOverrides();
  const databaseBlobOid = text(runGit(root, ["rev-parse", `HEAD:${expected.databasePath}`]));
  const databaseBlob = output(runGit(root, ["cat-file", "blob", databaseBlobOid]));
  const databaseWorktree = await readFileImpl(path.join(root, ...expected.databasePath.split("/")));
  const databaseNewlineOnly = newlineOnlyEqual(databaseBlob, databaseWorktree);
  const allowedDatabaseMutation =
    trackedStatusEntries.length === 1 &&
    trackedStatusEntries[0] === ` M ${expected.databasePath}` &&
    databaseNewlineOnly;

  checkEqual(violations, "revision", revision, expected.revision);
  checkEqual(violations, "tree", tree, expected.tree);
  if (!detached) violations.push("HEAD is not detached at the frozen revision");
  appendPinnedFileViolations(violations, "auth spec", spec, expected.spec);
  appendPinnedFileViolations(violations, "seed", seed, expected.seed);
  checkEqual(violations, "runtime database blob", databaseBlobOid, expected.seed.blobOid);
  if (!generatedRuntimeFiles.valid) violations.push("generated runtime modules drifted");
  if (runtimeCache.regularFileCount !== 0) violations.push("RWA runtime cache is not empty");
  if (localEnvironmentFiles.matchedPaths.length !== 0) {
    violations.push("ignored local RWA environment files are present");
  }
  if (ambientOverrides.presentNames.length !== 0) {
    violations.push("ambient RWA/Cypress behavior overrides are present");
  }

  if (trackedStatusEntries.length > 0 && !allowedDatabaseMutation) {
    violations.push(
      `tracked checkout is dirty beyond the allowed newline-only ${expected.databasePath} runtime state: ${trackedStatusEntries.join(", ")}`,
    );
  }

  return {
    valid: violations.length === 0,
    violations,
    root,
    revision,
    tree,
    detached,
    authSpec: spec,
    seed,
    generatedRuntimeFiles,
    runtimeCache,
    localEnvironmentFiles,
    ambientOverrides,
    trackedStatusEntries,
    runtimeDatabase: {
      path: expected.databasePath,
      blobOid: databaseBlobOid,
      blobSha256: sha256(databaseBlob),
      worktreeSha256: sha256(databaseWorktree),
      newlineOnlyDifference: trackedStatusEntries.length > 0 && databaseNewlineOnly,
      allowedRuntimeMutation: allowedDatabaseMutation,
    },
  };
}

export async function probeRwaServers({
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000,
  upstreamRoot = process.env.RWA_ROOT ??
    path.resolve("inputs", "cypress-realworld-app-28ca4d0"),
  expectedRuntimeIdentity = rwaFrozenServerRuntimeIdentity,
} = {}) {
  const root = path.resolve(upstreamRoot);
  const endpoints = [
    { name: "frontend", url: "http://localhost:3000/", bodyPattern: /<!doctype html/i },
    {
      name: "backend",
      url: "http://localhost:3001/",
      bodyPattern: /Cypress Realworld App - backend/u,
    },
  ];
  const generatedRuntimeFiles = await assertRwaGeneratedRuntimeFiles(root);
  const runtimeCache = await assertRwaRuntimeCacheEmpty(root);
  const localEnvironmentFiles = await assertRwaLocalEnvironmentFilesAbsent(root);
  const ambientOverrides = assertRwaAmbientOverridesAbsent();
  const listeners = probeWindowsListenerOwners(root);
  const servedBuildTree = await probeServedBuildTree(root, fetchImpl, timeoutMs);

  const observations = [];
  for (const endpoint of endpoints) {
    const response = await fetchImpl(endpoint.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    if (response.status !== 200 || !endpoint.bodyPattern.test(body)) {
      throw new Error(
        `${endpoint.name} readiness failed: expected HTTP 200 and the unchanged RWA marker, got ${response.status}`,
      );
    }
    const listener = listeners.find(({ port }) => port === new URL(endpoint.url).port * 1);
    const observation = {
      name: endpoint.name,
      url: endpoint.url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyBytes: Buffer.byteLength(body),
      bodySha256: sha256(Buffer.from(body)),
      listener,
      ...(endpoint.name === "frontend"
        ? { servedBuildTree, generatedRuntimeFiles, runtimeCache, localEnvironmentFiles, ambientOverrides }
        : {}),
    };
    if (listener === undefined) {
      throw new Error(`${endpoint.name} listener identity drifted from the frozen RWA server`);
    }
    observations.push(observation);
  }
  assertRwaServerRuntimeIdentity(observations, expectedRuntimeIdentity);
  await assertRwaGeneratedRuntimeFiles(root);
  await assertRwaRuntimeCacheEmpty(root);
  await assertRwaLocalEnvironmentFilesAbsent(root);
  assertRwaAmbientOverridesAbsent();
  return observations;
}

export function createRwaServerRuntimeIdentity(observations) {
  if (
    !Array.isArray(observations) ||
    observations.length !== 2 ||
    observations[0]?.name !== "frontend" ||
    observations[1]?.name !== "backend"
  ) {
    throw new TypeError("RWA server runtime identity requires the ordered frontend and backend observations");
  }
  const frontend = observations[0];
  const backend = observations[1];
  const identity = {
    buildTree: structuredClone(frontend.servedBuildTree),
    serverBodies: {
      frontend: {
        contentType: frontend.contentType,
        bytes: frontend.bodyBytes,
        sha256: frontend.bodySha256,
      },
      backend: {
        contentType: backend.contentType,
        bytes: backend.bodyBytes,
        sha256: backend.bodySha256,
      },
    },
  };
  return assertRwaServerRuntimeIdentityValue(identity);
}

export function assertRwaServerRuntimeIdentityValue(identity) {
  if (
    identity === null ||
    typeof identity !== "object" ||
    Array.isArray(identity) ||
    !isDeepStrictEqual(Object.keys(identity).sort(), ["buildTree", "serverBodies"]) ||
    identity.serverBodies === null ||
    typeof identity.serverBodies !== "object" ||
    Array.isArray(identity.serverBodies) ||
    !isDeepStrictEqual(Object.keys(identity.serverBodies).sort(), ["backend", "frontend"])
  ) {
    throw new TypeError("Invalid RWA server runtime identity");
  }
  assertBuildTreeIdentity(identity.buildTree);
  for (const [name, body] of Object.entries(identity.serverBodies)) {
    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !isDeepStrictEqual(Object.keys(body).sort(), ["bytes", "contentType", "sha256"]) ||
      typeof body.contentType !== "string" ||
      body.contentType.length === 0 ||
      body.contentType.length > 256 ||
      !Number.isSafeInteger(body.bytes) ||
      body.bytes <= 0 ||
      !/^[a-f0-9]{64}$/u.test(body.sha256 ?? "")
    ) {
      throw new TypeError(`Invalid ${name} RWA server body identity`);
    }
  }
  if (
    identity.buildTree.fileCount !== expected.buildTree.fileCount ||
    identity.serverBodies.frontend.contentType !== expected.serverBodies.frontend.contentType ||
    identity.serverBodies.frontend.bytes !== expected.serverBodies.frontend.bytes ||
    !isDeepStrictEqual(identity.serverBodies.backend, expected.serverBodies.backend)
  ) {
    throw new TypeError("RWA server runtime identity violates its frozen structural bounds");
  }
  return identity;
}

export function assertRwaServerRuntimeIdentity(
  observations,
  expectedRuntimeIdentity = rwaFrozenServerRuntimeIdentity,
) {
  const actual = createRwaServerRuntimeIdentity(observations);
  if (expectedRuntimeIdentity === null) return actual;
  assertRwaServerRuntimeIdentityValue(expectedRuntimeIdentity);
  if (!isDeepStrictEqual(actual, expectedRuntimeIdentity)) {
    throw new Error("RWA server runtime identity drifted from the expected build and response bytes");
  }
  return actual;
}

async function probeServedBuildTree(root, fetchImpl, timeoutMs) {
  const buildRoot = path.join(root, "build");
  const relativePaths = await listRegularFiles(buildRoot);
  const aggregate = createHash("sha256");
  let totalBytes = 0;
  for (const relativePath of relativePaths) {
    const urlPath = relativePath.split("/").map(encodeURIComponent).join("/");
    const response = await fetchImpl(`http://localhost:3000/${urlPath}`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      throw new Error(`served RWA build file ${relativePath} returned HTTP ${response.status}`);
    }
    const served = Buffer.from(await response.arrayBuffer());
    const local = await readFile(path.join(buildRoot, ...relativePath.split("/")));
    if (!served.equals(local)) {
      throw new Error(`served RWA build file ${relativePath} differs from the locally generated build bytes`);
    }
    const fileSha256 = sha256(served);
    totalBytes += served.length;
    aggregate.update(relativePath, "utf8");
    aggregate.update("\0", "utf8");
    aggregate.update(String(served.length), "utf8");
    aggregate.update("\0", "utf8");
    aggregate.update(fileSha256, "ascii");
    aggregate.update("\n", "ascii");
  }
  const evidence = {
    sha256: aggregate.digest("hex"),
    fileCount: relativePaths.length,
    totalBytes,
  };
  return evidence;
}

function assertBuildTreeIdentity(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), ["fileCount", "sha256", "totalBytes"]) ||
    !/^[a-f0-9]{64}$/u.test(value.sha256 ?? "") ||
    !Number.isSafeInteger(value.fileCount) ||
    value.fileCount <= 0 ||
    !Number.isSafeInteger(value.totalBytes) ||
    value.totalBytes <= 0
  ) {
    throw new TypeError("Invalid RWA build-tree identity");
  }
}

function probeWindowsListenerOwners(root) {
  if (process.platform !== "win32") {
    throw new Error("The sealed RWA listener-owner probe requires Windows");
  }
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class NativeCommandLine {
  [DllImport("shell32.dll", SetLastError = true)]
  private static extern IntPtr CommandLineToArgvW(
    [MarshalAs(UnmanagedType.LPWStr)] string commandLine,
    out int argumentCount
  );

  [DllImport("kernel32.dll")]
  private static extern IntPtr LocalFree(IntPtr memory);

  public static string[] Parse(string commandLine) {
    int argumentCount;
    IntPtr arguments = CommandLineToArgvW(commandLine, out argumentCount);
    if (arguments == IntPtr.Zero) throw new Win32Exception();
    try {
      string[] result = new string[argumentCount];
      for (int index = 0; index < argumentCount; index++) {
        IntPtr argument = Marshal.ReadIntPtr(arguments, index * IntPtr.Size);
        result[index] = Marshal.PtrToStringUni(argument);
      }
      return result;
    } finally {
      LocalFree(arguments);
    }
  }
}
'@
function Resolve-ExistingPath([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value) -or -not [IO.Path]::IsPathRooted($value)) {
    return $null
  }
  try {
    return [IO.Path]::GetFullPath((Get-Item -LiteralPath $value -ErrorAction Stop).FullName)
  } catch {
    return $null
  }
}
$root = Resolve-ExistingPath $env:STASIS_COMPAT_RWA_PROBE_ROOT
$harnessRoot = Resolve-ExistingPath $env:STASIS_COMPAT_HARNESS_PROBE_ROOT
$tsconfig = Resolve-ExistingPath ([IO.Path]::Combine($root, 'tsconfig.tsnode.json'))
$roles = @(
  [pscustomobject]@{
    Port = 3000
    ScriptRole = 'scripts/testServer.ts'
    Tail = @('-P', $tsconfig, (Resolve-ExistingPath ([IO.Path]::Combine($root, 'scripts', 'testServer.ts'))))
  },
  [pscustomobject]@{
    Port = 3001
    ScriptRole = 'backend/app.ts'
    Tail = @('-P', $tsconfig, '--files', (Resolve-ExistingPath ([IO.Path]::Combine($root, 'backend', 'app.ts'))))
  }
)
$evidence = foreach ($role in $roles) {
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort $role.Port | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1) { throw "expected one listener owner" }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
  if ($null -eq $process) { throw "listener process missing" }
  $command = [string]$process.CommandLine
  $arguments = [NativeCommandLine]::Parse($command)
  $expectedNode = Resolve-ExistingPath ([string]$process.ExecutablePath)
  $expectedTsNode = Resolve-ExistingPath (
    [IO.Path]::Combine($root, 'node_modules', 'ts-node', 'dist', 'bin.js')
  )
  $commandMatchesPinnedRole = $arguments.Count -eq (2 + $role.Tail.Count)
  if ($commandMatchesPinnedRole) {
    $actualNode = Resolve-ExistingPath ([string]$arguments[0])
    $actualTsNode = Resolve-ExistingPath ([string]$arguments[1])
    $commandMatchesPinnedRole =
      $null -ne $actualNode -and
      $null -ne $actualTsNode -and
      [string]::Equals($actualNode, $expectedNode, [StringComparison]::OrdinalIgnoreCase) -and
      [string]::Equals($actualTsNode, $expectedTsNode, [StringComparison]::OrdinalIgnoreCase)
  }
  if ($commandMatchesPinnedRole) {
    for ($index = 0; $index -lt $role.Tail.Count; $index++) {
      $actualArgument = [string]$arguments[$index + 2]
      $expectedArgument = [string]$role.Tail[$index]
      $argumentMatches = if ([IO.Path]::IsPathRooted($expectedArgument)) {
        $resolvedArgument = Resolve-ExistingPath $actualArgument
        $null -ne $resolvedArgument -and [string]::Equals(
          $resolvedArgument,
          $expectedArgument,
          [StringComparison]::OrdinalIgnoreCase
        )
      } else {
        [string]::Equals($actualArgument, $expectedArgument, [StringComparison]::Ordinal)
      }
      if (-not $argumentMatches) {
        $commandMatchesPinnedRole = $false
        break
      }
    }
  }
  $launcher = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ParentProcessId)"
  $launcherMatchesFrozenHost = $null -ne $launcher -and
    [string]::Equals([string]$launcher.Name, 'node.exe', [StringComparison]::OrdinalIgnoreCase)
  if ($launcherMatchesFrozenHost) {
    $launcherArguments = [NativeCommandLine]::Parse([string]$launcher.CommandLine)
    $expectedLauncher = Resolve-ExistingPath (
      [IO.Path]::Combine($harnessRoot, 'src', 'rwa', 'server-host.mjs')
    )
    $launcherMatchesFrozenHost = $launcherArguments.Count -eq 2
  }
  if ($launcherMatchesFrozenHost) {
    $actualLauncherNode = Resolve-ExistingPath ([string]$launcherArguments[0])
    $launcherScriptArgument = [string]$launcherArguments[1]
    $launcherArgumentIsAbsolute = [IO.Path]::IsPathRooted($launcherScriptArgument)
    $actualLauncherScript = if ($launcherArgumentIsAbsolute) {
      Resolve-ExistingPath $launcherScriptArgument
    } else { $null }
    $actualLauncherExecutable = Resolve-ExistingPath ([string]$launcher.ExecutablePath)
    $launcherMatchesFrozenHost =
      $launcherArgumentIsAbsolute -and
      $null -ne $actualLauncherNode -and
      $null -ne $actualLauncherScript -and
      $null -ne $actualLauncherExecutable -and
      [string]::Equals($actualLauncherNode, $expectedNode, [StringComparison]::OrdinalIgnoreCase) -and
      [string]::Equals(
        $actualLauncherExecutable,
        $expectedNode,
        [StringComparison]::OrdinalIgnoreCase
      ) -and
      [string]::Equals($actualLauncherScript, $expectedLauncher, [StringComparison]::OrdinalIgnoreCase)
  }
  $commandMatchesPinnedRole = $commandMatchesPinnedRole -and $launcherMatchesFrozenHost
  $stream = [IO.File]::OpenRead($process.ExecutablePath)
  try {
    $hasher = [Security.Cryptography.SHA256]::Create()
    $hashBytes = $hasher.ComputeHash($stream)
    $executableSha256 = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
  } finally {
    $stream.Dispose()
    if ($null -ne $hasher) { $hasher.Dispose() }
  }
  [pscustomobject]@{
    port = $role.Port
    processId = [int]$process.ProcessId
    processName = [string]$process.Name
    nodeVersion = ((& $process.ExecutablePath --version) | Out-String).Trim()
    executableBytes = [int64](Get-Item -LiteralPath $process.ExecutablePath).Length
    executableSha256 = $executableSha256
    scriptRole = $role.ScriptRole
    launcherProcessId = if ($null -eq $launcher) { 0 } else { [int]$launcher.ProcessId }
    launcherMatchesFrozenHost = [bool]$launcherMatchesFrozenHost
    commandMatchesPinnedRole = [bool]$commandMatchesPinnedRole
  }
}
$evidence | ConvertTo-Json -Compress
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      STASIS_COMPAT_RWA_PROBE_ROOT: root,
      STASIS_COMPAT_HARNESS_PROBE_ROOT: repositoryRoot,
    },
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("Unable to bind the RWA listener owners to frozen processes");
  const evidence = JSON.parse(result.stdout);
  if (!Array.isArray(evidence) || evidence.length !== 2) {
    throw new Error("RWA listener-owner evidence has the wrong denominator");
  }
  for (const listener of evidence) {
    if (
      ![3000, 3001].includes(listener.port) ||
      !Number.isSafeInteger(listener.processId) ||
      listener.processId < 1 ||
      listener.processName.toLowerCase() !== "node.exe" ||
      listener.nodeVersion !== expected.node ||
      listener.executableBytes !== expected.nodeExecutable.bytes ||
      listener.executableSha256 !== expected.nodeExecutable.sha256 ||
      !Number.isSafeInteger(listener.launcherProcessId) ||
      listener.launcherProcessId < 1 ||
      listener.launcherMatchesFrozenHost !== true ||
      listener.commandMatchesPinnedRole !== true
    ) {
      throw new Error("An RWA listener is not the frozen Node/script role");
    }
  }
  if (new Set(evidence.map(({ launcherProcessId }) => launcherProcessId)).size !== 1) {
    throw new Error("Both RWA listeners must be children of the same frozen server host");
  }
  return evidence.sort((left, right) => left.port - right.port);
}

export function validateCypressResult(result, upstreamRoot) {
  const violations = [];
  if (result === null || typeof result !== "object" || !Array.isArray(result.runs)) {
    const detail = result?.message === undefined ? "missing structured runs" : result.message;
    return { valid: false, violations: [`Cypress did not return a structured run result: ${detail}`], cases: [] };
  }

  checkEqual(violations, "Cypress version", result.cypressVersion, expected.cypressVersion);
  checkEqual(violations, "browser name", result.browserName, "electron");
  checkEqual(violations, "Electron version", result.browserVersion, expected.electronVersion);
  checkEqual(
    violations,
    "bundled Electron browser path",
    result.browserPath,
    "",
  );

  const resolvedRetries = result.config?.retries;
  const resolvedRunMode = typeof resolvedRetries === "number"
    ? resolvedRetries
    : resolvedRetries?.runMode;
  checkEqual(violations, "resolved run-mode retries", resolvedRunMode, 0);
  checkEqual(violations, "resolved test isolation", result.config?.testIsolation, true);
  checkEqual(violations, "resolved base URL", result.config?.baseUrl, expected.baseUrl);
  checkEqual(violations, "resolved API URL", result.config?.expose?.apiUrl, expected.apiUrl);
  checkEqual(
    violations,
    "resolved Node version",
    result.config?.resolvedNodeVersion,
    expected.resolvedNodeVersion,
  );
  checkEqual(violations, "resolved viewport width", result.config?.viewportWidth, expected.viewport.width);
  checkEqual(violations, "resolved viewport height", result.config?.viewportHeight, expected.viewport.height);

  for (const [field, wanted] of Object.entries({
    totalTests: rwaAuthCases.length,
    totalPassed: rwaAuthCases.length,
    totalFailed: 0,
    totalPending: 0,
    totalSkipped: 0,
  })) {
    checkEqual(violations, field, result[field], wanted);
  }

  if (result.runs.length !== 1) {
    violations.push(`expected exactly one spec run, got ${result.runs.length}`);
  }
  const run = result.runs[0];
  if (run === undefined) return { valid: false, violations, cases: [] };

  const relativeSpec = normalizeRelativeSpec(run.spec, upstreamRoot);
  checkEqual(violations, "executed spec", relativeSpec, expected.spec.path);
  if (run.error !== null) violations.push(`spec run reported an error: ${String(run.error)}`);

  for (const [field, wanted] of Object.entries({
    tests: rwaAuthCases.length,
    passes: rwaAuthCases.length,
    failures: 0,
    pending: 0,
    skipped: 0,
  })) {
    checkEqual(violations, `spec stats ${field}`, run.stats?.[field], wanted);
  }

  const tests = Array.isArray(run.tests) ? run.tests : [];
  if (tests.length !== rwaAuthCases.length) {
    violations.push(`expected ${rwaAuthCases.length} structured tests, got ${tests.length}`);
  }

  const cases = rwaAuthCases.map((frozenCase, index) => {
    const testResult = tests[index];
    const expectedTitle = [rwaAuthSource.describeTitle, frozenCase.source.title];
    if (testResult === undefined) {
      return {
        id: frozenCase.id,
        ordinal: frozenCase.ordinal,
        title: expectedTitle,
        state: "missing",
        attempts: [],
      };
    }
    if (!arraysEqual(testResult.title, expectedTitle)) {
      violations.push(
        `${frozenCase.id} title/order mismatch: expected ${JSON.stringify(expectedTitle)}, got ${JSON.stringify(testResult.title)}`,
      );
    }
    checkEqual(violations, `${frozenCase.id} state`, testResult.state, "passed");
    if (!Array.isArray(testResult.attempts) || testResult.attempts.length !== 1) {
      violations.push(
        `${frozenCase.id} expected exactly one attempt with zero retries, got ${testResult.attempts?.length ?? "none"}`,
      );
    }
    checkEqual(
      violations,
      `${frozenCase.id} attempt state`,
      testResult.attempts?.[0]?.state,
      "passed",
    );
    return {
      id: frozenCase.id,
      ordinal: frozenCase.ordinal,
      title: expectedTitle,
      state: canonicalState(testResult.state),
      durationMilliseconds: Number.isFinite(testResult.duration) ? testResult.duration : null,
      attempts: Array.isArray(testResult.attempts)
        ? testResult.attempts.map((attempt) => ({ state: canonicalState(attempt?.state) }))
        : [],
      displayError: errorPresence(testResult.displayError),
    };
  });

  return { valid: violations.length === 0, violations, cases };
}

export function projectCypressResultForArtifact(result, upstreamRoot) {
  if (result === null || typeof result !== "object") {
    return { result: null, omittedFields: emptyOmissionCounts() };
  }
  if (!Array.isArray(result.runs)) {
    return {
      result: {
        status: canonicalState(result.status),
        failures: safeCount(result.failures),
        ...(typeof result.message === "string" ? { messageOmitted: true } : {}),
      },
      omittedFields: {
        ...emptyOmissionCounts(),
        topLevel: omittedFieldCount(result, ["status", "failures", "message"]),
      },
    };
  }

  const topLevelKeys = ["browserName", "browserPath", "browserVersion", "config", "cypressVersion", "endedTestsAt", "osName", "runs", "startedTestsAt", "totalDuration", "totalFailed", "totalPassed", "totalPending", "totalSkipped", "totalSuites", "totalTests"];
  const configKeys = ["baseUrl", "expose", "resolvedNodeVersion", "retries", "testIsolation", "viewportHeight", "viewportWidth"];
  const runKeys = ["error", "stats", "spec", "tests"];
  const testKeys = ["attempts", "displayError", "duration", "state", "title"];
  const attemptKeys = ["state"];
  const projectedRuns = result.runs.map((candidateRun) => {
    const run = isRecord(candidateRun) ? candidateRun : {};
    const tests = Array.isArray(run.tests) ? run.tests : [];
    return {
      error: errorPresence(run.error),
      stats: projectCounts(run.stats, ["tests", "passes", "failures", "pending", "skipped"]),
      spec: { relative: canonicalSpec(run.spec, upstreamRoot) },
      tests: tests.map((candidateTest, index) => {
        const test = isRecord(candidateTest) ? candidateTest : {};
        return {
          attempts: Array.isArray(test.attempts)
            ? test.attempts.map((attempt) => ({ state: canonicalState(attempt?.state) }))
            : [],
          displayError: errorPresence(test.displayError),
          duration: safeDuration(test.duration),
          state: canonicalState(test.state),
          title: canonicalTestTitle(test.title, index),
        };
      }),
    };
  });
  const runs = result.runs;
  const tests = runs.flatMap((run) => (Array.isArray(run.tests) ? run.tests : []));
  const attempts = tests.flatMap((test) => (Array.isArray(test.attempts) ? test.attempts : []));
  return {
    result: {
      browserName: result.browserName === "electron" ? "electron" : "noncanonical_omitted",
      browserPath: result.browserPath === "" ? "" : "noncanonical_omitted",
      browserVersion: result.browserVersion === expected.electronVersion
        ? expected.electronVersion
        : "noncanonical_omitted",
      cypressVersion: result.cypressVersion === expected.cypressVersion
        ? expected.cypressVersion
        : "noncanonical_omitted",
      osName: result.osName === "win32" ? "win32" : "noncanonical_omitted",
      endedTestsAt: canonicalTimestamp(result.endedTestsAt),
      startedTestsAt: canonicalTimestamp(result.startedTestsAt),
      totalDuration: safeDuration(result.totalDuration),
      ...projectCounts(result, ["totalFailed", "totalPassed", "totalPending", "totalSkipped", "totalSuites", "totalTests"]),
      config: {
        baseUrl: result.config?.baseUrl === expected.baseUrl
          ? expected.baseUrl
          : "noncanonical_omitted",
        resolvedNodeVersion: result.config?.resolvedNodeVersion === expected.resolvedNodeVersion
          ? expected.resolvedNodeVersion
          : "noncanonical_omitted",
        apiUrl: result.config?.expose?.apiUrl === expected.apiUrl
          ? expected.apiUrl
          : "noncanonical_omitted",
        retries: projectRetries(result.config?.retries),
        testIsolation: typeof result.config?.testIsolation === "boolean"
          ? result.config.testIsolation
          : null,
        viewportHeight: safeCount(result.config?.viewportHeight),
        viewportWidth: safeCount(result.config?.viewportWidth),
      },
      runs: projectedRuns,
    },
    omittedFields: {
      topLevel: omittedFieldCount(result, topLevelKeys),
      config: omittedFieldCount(result.config, configKeys),
      run: runs.reduce((count, run) => count + omittedFieldCount(run, runKeys), 0),
      spec: runs.reduce((count, run) => count + omittedFieldCount(run?.spec, ["relative", "absolute"]), 0),
      test: tests.reduce((count, test) => count + omittedFieldCount(test, testKeys), 0),
      attempt: attempts.reduce((count, attempt) => count + omittedFieldCount(attempt, attemptKeys), 0),
    },
  };
}

export async function runCypressBaseline({
  upstreamRoot = process.env.RWA_ROOT ??
    path.resolve("inputs", "cypress-realworld-app-28ca4d0"),
  inspectCheckout = inspectRwaCheckout,
  probeServers = probeRwaServers,
  loadCypress = loadCypressFromCheckout,
  writeArtifact = writeJson,
  now = () => new Date(),
} = {}) {
  const root = path.resolve(upstreamRoot);
  const startedAt = now();
  const invocation = buildCypressRunOptions(root);
  let preflight = null;
  let postflight = null;
  let servers = null;
  let rawResult = null;
  let executionError = null;

  try {
    if (process.version !== expected.node) {
      throw new Error(`Node version mismatch: expected ${expected.node}, got ${process.version}`);
    }
    preflight = await inspectCheckout(root);
    if (!preflight.valid) {
      throw new Error(`RWA preflight failed: ${preflight.violations.join("; ")}`);
    }
    servers = await probeServers({ upstreamRoot: root });
    const cypress = await loadCypress(root);
    if (cypress === null || typeof cypress !== "object" || typeof cypress.run !== "function") {
      throw new TypeError("The pinned checkout did not provide the Cypress module API");
    }
    rawResult = await cypress.run(invocation);
  } catch (error) {
    executionError = serializeError(error);
  } finally {
    if (preflight?.valid) {
      try {
        postflight = await inspectCheckout(root);
      } catch (error) {
        const serialized = serializeError(error);
        postflight = {
          valid: false,
          violations: [`${serialized.name}:${serialized.code ?? "unclassified_error"}`],
        };
      }
    }
  }

  const resultValidation = rawResult === null
    ? { valid: false, violations: ["Cypress did not produce a result"], cases: [] }
    : validateCypressResult(rawResult, root);
  const violations = [
    ...(executionError === null
      ? []
      : [`execution failed: ${executionError.name}:${executionError.code ?? "unclassified_error"}`]),
    ...(preflight?.violations ?? []),
    ...(postflight?.violations ?? []),
    ...resultValidation.violations,
  ];
  const valid =
    executionError === null &&
    preflight?.valid === true &&
    postflight?.valid === true &&
    resultValidation.valid;
  const artifactCypressResult = projectCypressResultForArtifact(rawResult, root);
  const artifact = {
    schema: "stasis-compat-rwa-cypress-raw-v1",
    protocol: "stasis-compat-bench-v1",
    lane: "unchanged-rwa-cypress-baseline",
    createdAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    valid,
    violations,
    source: { preflight, postflight },
    runtime: {
      node: process.version,
      configuredRetries: expected.configuredRetries,
      primaryRetryOverride: expected.primaryRetries,
      externalServers: servers,
    },
    invocation,
    cypress: {
      validation: resultValidation,
      executionError,
      projectionPolicy:
        "Only canonical scalar browser/runtime identity, fixed app/API endpoints, retry/viewport/test-isolation config, numeric totals/stats, the frozen spec/title, allowlisted states, and error presence are retained; all opaque values and unknown field names are omitted.",
      omittedFields: artifactCypressResult.omittedFields,
      result: artifactCypressResult.result,
    },
  };
  const artifactPath = await writeArtifact("rwa/cypress-raw.json", artifact);
  if (!valid) {
    throw new RwaBaselineInvalidError(
      `The unchanged RWA Cypress baseline is invalid: ${violations.join("; ")}`,
      artifactPath,
      artifact,
    );
  }
  return { artifactPath, artifact };
}

export function loadCypressFromCheckout(upstreamRoot) {
  const requireFromUpstream = createRequire(path.join(path.resolve(upstreamRoot), "package.json"));
  return requireFromUpstream("cypress");
}

async function inspectPinnedFile(root, identity, runGit, readFileImpl) {
  const blobOid = text(runGit(root, ["rev-parse", `HEAD:${identity.path}`]));
  const blob = output(runGit(root, ["cat-file", "blob", blobOid]));
  const worktree = await readFileImpl(path.join(root, ...identity.path.split("/")));
  return {
    path: identity.path,
    blobOid,
    blobSha256: sha256(blob),
    worktreeSha256: sha256(worktree),
  };
}

function appendPinnedFileViolations(violations, label, actual, identity) {
  checkEqual(violations, `${label} blob OID`, actual.blobOid, identity.blobOid);
  checkEqual(violations, `${label} blob SHA-256`, actual.blobSha256, identity.blobSha256);
  checkEqual(
    violations,
    `${label} worktree SHA-256`,
    actual.worktreeSha256,
    identity.worktreeSha256,
  );
}

function defaultRunGit(root, args, acceptedStatuses = [0]) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (!acceptedStatuses.includes(result.status)) {
    throw new Error(
      `git ${args.join(" ")} exited ${result.status}: ${Buffer.from(result.stderr ?? []).toString("utf8").trim()}`,
    );
  }
  return result;
}

function output(result) {
  return Buffer.isBuffer(result) ? result : Buffer.from(result.stdout ?? []);
}

function text(result, trim = true) {
  const value = output(result).toString("utf8");
  return trim ? value.trim() : value;
}

function normalizeNewlines(value) {
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function checkEqual(violations, label, actual, wanted) {
  if (actual !== wanted) violations.push(`${label} mismatch: expected ${wanted}, got ${String(actual)}`);
}

function arraysEqual(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function errorPresence(value) {
  if (value === null || value === undefined) return value ?? null;
  return {
    present: true,
    type: typeof value === "object" ? "object" : canonicalPrimitiveType(value),
  };
}

function canonicalPrimitiveType(value) {
  return ["boolean", "bigint", "number", "string", "symbol", "undefined"].includes(typeof value)
    ? typeof value
    : "noncanonical_omitted";
}

function canonicalState(value) {
  return ["passed", "failed", "pending", "skipped"].includes(value)
    ? value
    : "noncanonical_omitted";
}

function canonicalTimestamp(value) {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function projectCounts(value, keys) {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(keys.map((key) => [key, safeCount(record[key])]));
}

function projectRetries(value) {
  const runMode = typeof value === "number" ? value : value?.runMode;
  const openMode = typeof value === "object" && value !== null ? value.openMode : value;
  return { openMode: safeCount(openMode), runMode: safeCount(runMode) };
}

function canonicalSpec(spec, upstreamRoot) {
  const relative = normalizeRelativeSpec(spec, upstreamRoot);
  return relative === expected.spec.path ? expected.spec.path : "noncanonical_omitted";
}

function canonicalTestTitle(value, index) {
  const frozenCase = rwaAuthCases[index];
  if (frozenCase === undefined) return ["noncanonical_omitted"];
  const expectedTitle = [rwaAuthSource.describeTitle, frozenCase.source.title];
  return arraysEqual(value, expectedTitle) ? expectedTitle : ["noncanonical_omitted"];
}

function omittedFieldCount(value, retainedKeys) {
  if (!isRecord(value)) return 0;
  const retained = new Set(retainedKeys);
  return Object.keys(value).filter((key) => !retained.has(key)).length;
}

function emptyOmissionCounts() {
  return { topLevel: 0, config: 0, run: 0, spec: 0, test: 0, attempt: 0 };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelativeSpec(spec, upstreamRoot) {
  if (typeof spec?.relative === "string") return spec.relative.replaceAll("\\", "/");
  if (typeof spec?.absolute === "string" && typeof upstreamRoot === "string") {
    return path.relative(upstreamRoot, spec.absolute).replaceAll("\\", "/");
  }
  return "";
}

async function main() {
  try {
    const { artifactPath } = await runCypressBaseline();
    console.log(artifactPath);
  } catch (error) {
    if (error?.artifactPath !== undefined) console.error(`Raw artifact: ${error.artifactPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
