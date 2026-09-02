import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import {
  assertFreshSealedArtifactRoot,
  repositoryRoot,
  sha256File,
  writeJson,
} from "../shared/io.mjs";
import {
  assertAuthoritativeLinuxPerformanceCandidate,
  disposeLinuxPerformanceCandidate,
  linuxPerformanceExecutablePath,
  loadLinuxPerformanceCandidateSpec,
  verifyLinuxPerformanceCandidate,
} from "./linux-candidate.mjs";
import {
  createCrawlPerformanceGithubProvenance,
  createCrawlPerformanceHostIdentity,
  createCrawlPerformanceIdentity,
  createCrawleePerformanceRunner,
  createStasisPerformanceRunner,
  crawlPerformanceRawArtifactPath,
  runCrawlPerformanceAuthority,
} from "./crawl.mjs";

const execFileAsync = promisify(execFile);
const packageResolver = createRequire(import.meta.url);
const bootIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

const environmentNames = Object.freeze({
  bootSalt: "STASIS_PERFORMANCE_BOOT_SALT",
  imageOs: "ImageOS",
  imageVersion: "ImageVersion",
  repository: "GITHUB_REPOSITORY",
  workflow: "GITHUB_WORKFLOW",
  job: "GITHUB_JOB",
  ref: "GITHUB_REF",
  runId: "GITHUB_RUN_ID",
  runAttempt: "GITHUB_RUN_ATTEMPT",
  sha: "GITHUB_SHA",
  runnerArch: "RUNNER_ARCH",
  runnerOs: "RUNNER_OS",
});

export async function runCrawlPerformanceCommand({
  environment = process.env,
  now = () => process.hrtime.bigint(),
  assertFreshArtifactRoot = assertFreshSealedArtifactRoot,
  loadCandidateSpec = loadLinuxPerformanceCandidateSpec,
  verifyCandidate = verifyLinuxPerformanceCandidate,
  assertCandidate = assertAuthoritativeLinuxPerformanceCandidate,
  candidateExecutablePath = linuxPerformanceExecutablePath,
  disposeCandidate = disposeLinuxPerformanceCandidate,
  observeHost = observeCrawlPerformanceHost,
  observeBaseline = observeCrawleePerformanceIdentity,
  loadProvenance = loadCrawlPerformanceProvenanceFromEnvironment,
  createCrawleeRunner = createCrawleePerformanceRunner,
  createStasisRunner = createStasisPerformanceRunner,
  runAuthority = runCrawlPerformanceAuthority,
  writeRaw = writeJson,
} = {}) {
  const spec = loadCandidateSpec(environment);
  const verified = await verifyCandidate(spec);
  assertCandidate(verified);

  let disposed = false;
  const disposeVerified = async () => {
    if (disposed) return;
    disposed = true;
    await disposeCandidate(verified);
  };

  try {
    const host = await observeHost({ environment });
    const provenance = await loadProvenance(environment);
    const crawlee = await observeBaseline({ host, environment });
    const stasis = buildCrawlPerformanceStasisIdentity(verified, host.hostClassDigest);
    const identity = createCrawlPerformanceIdentity({
      host,
      provenance,
      crawlee,
      stasis,
    });

    const artifactRoot = await assertFreshArtifactRoot();
    const raw = await runAuthority({
      identity,
      runners: {
        crawlee: createCrawleeRunner(),
        stasis: createStasisRunner({
          sdk: verified.sdk,
          sdkVersion: verified.identity.version,
          executablePath: candidateExecutablePath(verified),
        }),
      },
      now,
    });
    const rawPath = await writeRaw(crawlPerformanceRawArtifactPath, raw);
    await disposeVerified();
    return Object.freeze({ artifactRoot, rawPath, raw });
  } catch (error) {
    await disposeVerified();
    throw error;
  }
}

export async function observeCrawlPerformanceHost({
  environment = process.env,
  runtime = () => ({ platform: process.platform, arch: process.arch }),
  cpuInfo = () => os.cpus(),
  readBootId = defaultReadBootId,
} = {}) {
  const facts = runtime();
  if (environment?.[environmentNames.runnerArch] !== "X64") {
    throw new Error("RUNNER_ARCH must be X64 for the Ubuntu crawl performance lane");
  }
  const cpus = cpuInfo();
  if (!Array.isArray(cpus) || cpus.length < 1) {
    throw new Error("Hosted Ubuntu CPU inventory is unavailable");
  }
  const cpuModels = [...new Set(cpus.map((entry) => String(entry?.model ?? "").trim()).filter(Boolean))];
  if (cpuModels.length !== 1) {
    throw new Error("Hosted Ubuntu CPU model must retain one exact string");
  }
  const bootSalt = required(environment, environmentNames.bootSalt);
  const bootId = (await readBootId()).trim();
  if (!bootIdPattern.test(bootId)) {
    throw new Error("Ubuntu boot identity must be one canonical UUID");
  }
  return createCrawlPerformanceHostIdentity({
    platform: facts?.platform,
    arch: facts?.arch,
    runnerOs: required(environment, environmentNames.runnerOs),
    imageOs: required(environment, environmentNames.imageOs),
    imageVersion: required(environment, environmentNames.imageVersion),
    cpuModel: cpuModels[0],
    logicalCpuCount: cpus.length,
    bootInstanceDigest: digestUtf8(`${bootSalt}\0${bootId}`),
  });
}

export async function loadCrawlPerformanceProvenanceFromEnvironment(
  environment = process.env,
  {
    checkoutRoot = repositoryRoot,
    readHarnessCheckoutIdentity = defaultReadHarnessCheckoutIdentity,
  } = {},
) {
  const checkout = await readHarnessCheckoutIdentity(checkoutRoot);
  return createCrawlPerformanceGithubProvenance({
    provider: "github-actions",
    repository: required(environment, environmentNames.repository),
    workflow: required(environment, environmentNames.workflow),
    job: required(environment, environmentNames.job),
    runId: required(environment, environmentNames.runId),
    runAttempt: required(environment, environmentNames.runAttempt),
    workflowSourceSha: required(environment, environmentNames.sha),
    workflowSourceRef: required(environment, environmentNames.ref),
    harnessCheckoutRevision: checkout.revision,
    harnessCheckoutTree: checkout.tree,
  });
}

export async function observeCrawleePerformanceIdentity({
  host,
  environment = process.env,
  launcher = chromium,
  readPackageVersion = defaultReadPackageVersion,
  statPath = stat,
  hashFile = sha256File,
  runExecutable = defaultRunExecutable,
} = {}) {
  if (host?.hostClassDigest === undefined) {
    throw new TypeError("Crawl performance host identity is required");
  }
  if (environment?.[environmentNames.runnerArch] !== "X64") {
    throw new Error("RUNNER_ARCH must be X64 for the Ubuntu crawl performance lane");
  }
  const installedCrawlee = await readPackageVersion("crawlee");
  if (installedCrawlee !== "3.18.1") {
    throw new Error(`Installed Crawlee must be 3.18.1, got ${installedCrawlee}`);
  }
  const installedPlaywright = await readPackageVersion("playwright");
  if (installedPlaywright !== "1.62.1") {
    throw new Error(`Installed Playwright must be 1.62.1, got ${installedPlaywright}`);
  }
  if (typeof launcher?.executablePath !== "function") {
    throw new TypeError("A Playwright Chromium launcher is required");
  }
  const executablePath = launcher.executablePath();
  if (!path.isAbsolute(executablePath)) {
    throw new Error("Playwright Chromium executable path must be absolute");
  }
  const metadata = await statPath(executablePath);
  if (!metadata.isFile() || metadata.size < 1) {
    throw new Error("Playwright Chromium executable must be a non-empty regular file");
  }
  const chromiumVersion = await runExecutable(executablePath);
  return Object.freeze({
    runner: "crawlee-playwrightcrawler",
    nodeVersion: process.version,
    crawleeVersion: installedCrawlee,
    playwrightVersion: installedPlaywright,
    browser: "chromium",
    chromiumVersion,
    chromiumExecutableBytes: metadata.size,
    chromiumExecutableSha256: await hashFile(executablePath),
    hostClassDigest: host.hostClassDigest,
  });
}

export function buildCrawlPerformanceStasisIdentity(verified, hostClassDigest) {
  return Object.freeze({
    runner: "stasis-reference-crawler-v0.3.3",
    nodeVersion: process.version,
    package: verified?.identity?.sdk?.package,
    sdkVersion: verified?.identity?.version,
    revision: verified?.identity?.revision,
    profile: verified?.identity?.profile,
    releaseTag: verified?.identity?.release?.tag,
    packageQualificationRunId: String(verified?.identity?.packageQualification?.runId ?? ""),
    packageQualificationRunAttempt: String(verified?.identity?.packageQualification?.runAttempt ?? ""),
    sdkArchiveSha256: verified?.identity?.sdk?.archive?.sha256,
    executableSha256: verified?.identity?.linux?.executable?.sha256,
    runtimeManifestSha256: verified?.identity?.release?.runtimeManifest?.sha256,
    hostClassDigest,
  });
}

async function defaultReadBootId() {
  const { readFile } = await import("node:fs/promises");
  return readFile("/proc/sys/kernel/random/boot_id", "utf8");
}

async function defaultReadPackageVersion(packageName) {
  const packageJsonPath = packageResolver.resolve(`${packageName}/package.json`);
  const { readFile } = await import("node:fs/promises");
  const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (typeof manifest?.version !== "string" || manifest.version.length === 0) {
    throw new Error(`${packageName} package.json does not expose a version`);
  }
  return manifest.version;
}

async function defaultRunExecutable(executablePath) {
  const { stdout } = await execFileAsync(executablePath, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const version = stdout.trim();
  if (version.length === 0) {
    throw new Error("Playwright Chromium --version produced no output");
  }
  return version;
}

async function defaultReadHarnessCheckoutIdentity(checkoutRoot) {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "HEAD", "HEAD^{tree}"],
    {
      cwd: checkoutRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const [revision, tree, ...extra] = stdout.trim().split(/\r?\n/u);
  if (
    extra.length !== 0 ||
    !/^[a-f0-9]{40}$/u.test(revision ?? "") ||
    !/^[a-f0-9]{40}$/u.test(tree ?? "")
  ) {
    throw new Error("Benchmark harness checkout identity is invalid");
  }
  return Object.freeze({ revision, tree });
}

function required(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function digestUtf8(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main() {
  try {
    const result = await runCrawlPerformanceCommand();
    console.log(result.rawPath);
    if (!result.raw.authority.valid) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
