import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { sha256File } from "../shared/io.mjs";

const execFileAsync = promisify(execFile);
const sha256Pattern = /^[a-f0-9]{64}$/u;
const packageVersionPattern = /^[0-9A-Za-z][0-9A-Za-z.+:~_-]{0,127}$/u;

export const linuxEglRuntimeSchema = "stasis-linux-egl-runtime-prerequisite-v1";

const packageNames = Object.freeze([
  "libegl1",
  "libegl-mesa0",
  "libglvnd0",
]);

const librarySpecs = Object.freeze([
  Object.freeze({
    package: "libegl1",
    soname: "libEGL.so.1",
    basenamePattern: /^libEGL\.so\.1(?:\.[0-9]+)*$/u,
  }),
  Object.freeze({
    package: "libegl-mesa0",
    soname: "libEGL_mesa.so.0",
    basenamePattern: /^libEGL_mesa\.so\.0(?:\.[0-9]+)*$/u,
  }),
  Object.freeze({
    package: "libglvnd0",
    soname: "libGLdispatch.so.0",
    basenamePattern: /^libGLdispatch\.so\.0(?:\.[0-9]+)*$/u,
  }),
]);

const dlopenProbeMethod = "python3_ctypes_cdll_proc_maps_v1";

/**
 * Observes the Ubuntu EGL loader prerequisite before any benchmark timing.
 * Absolute loader paths are used only while inspecting the files and are never
 * retained in the returned evidence.
 */
export async function observeLinuxEglRuntime({
  runtime = () => ({ platform: process.platform, arch: process.arch }),
  readPackageVersion = defaultReadPackageVersion,
  probeLibraries = defaultProbeLibraries,
  inspectLibrary = defaultInspectLibrary,
} = {}) {
  const current = runtime();
  if (current?.platform !== "linux" || current?.arch !== "x64") {
    throw new Error("The Stasis EGL runtime prerequisite requires Linux x64");
  }

  const packages = [];
  for (const name of packageNames) {
    let version;
    try {
      version = await readPackageVersion(name);
    } catch {
      throw new Error(`Required Linux EGL package ${name} is not installed`);
    }
    if (typeof version !== "string" || !packageVersionPattern.test(version)) {
      throw new Error(`Required Linux EGL package ${name} has an invalid version`);
    }
    packages.push({ name, version });
  }

  let discovered;
  try {
    discovered = await probeLibraries(librarySpecs.map(({ soname }) => soname));
  } catch {
    throw new Error("Linux EGL runtime prerequisite dlopen probe failed");
  }
  assertDiscoveredLibraries(discovered);

  const libraries = [];
  for (const spec of librarySpecs) {
    const absolutePath = discovered.find(({ soname }) => soname === spec.soname).path;
    let library;
    try {
      library = await inspectLibrary({
        absolutePath,
        packageName: spec.package,
        soname: spec.soname,
      });
    } catch {
      throw new Error(`Linux EGL library identity failed for ${spec.soname}`);
    }
    libraries.push(library);
  }

  return deepFreeze(assertLinuxEglRuntimeEvidence({
    schema: linuxEglRuntimeSchema,
    dlopen: {
      method: dlopenProbeMethod,
      status: "passed",
    },
    packages,
    libraries,
  }));
}

export function assertLinuxEglRuntimeEvidence(value) {
  if (
    !hasExactKeys(value, ["schema", "dlopen", "packages", "libraries"]) ||
    value.schema !== linuxEglRuntimeSchema ||
    !hasExactKeys(value.dlopen, ["method", "status"]) ||
    value.dlopen.method !== dlopenProbeMethod ||
    value.dlopen.status !== "passed" ||
    !Array.isArray(value.packages) ||
    value.packages.length !== packageNames.length ||
    !Array.isArray(value.libraries) ||
    value.libraries.length !== librarySpecs.length
  ) {
    throw new TypeError("Invalid Linux EGL runtime prerequisite evidence");
  }

  for (let index = 0; index < packageNames.length; index += 1) {
    const entry = value.packages[index];
    if (
      !hasExactKeys(entry, ["name", "version"]) ||
      entry.name !== packageNames[index] ||
      typeof entry.version !== "string" ||
      !packageVersionPattern.test(entry.version)
    ) {
      throw new TypeError("Invalid Linux EGL package identity");
    }
  }

  for (let index = 0; index < librarySpecs.length; index += 1) {
    const entry = value.libraries[index];
    const expected = librarySpecs[index];
    if (
      !hasExactKeys(entry, ["package", "soname", "basename", "bytes", "sha256"]) ||
      entry.package !== expected.package ||
      entry.soname !== expected.soname ||
      typeof entry.basename !== "string" ||
      !expected.basenamePattern.test(entry.basename) ||
      entry.basename.includes("/") ||
      entry.basename.includes("\\") ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      typeof entry.sha256 !== "string" ||
      !sha256Pattern.test(entry.sha256)
    ) {
      throw new TypeError("Invalid Linux EGL library identity");
    }
  }
  return value;
}

async function defaultReadPackageVersion(packageName) {
  const { stdout } = await execFileAsync(
    "/usr/bin/dpkg-query",
    ["--show", "--showformat=${Status}\\n${Version}\\n", packageName],
    commandOptions(4 * 1024),
  );
  const lines = stdout.endsWith("\n")
    ? stdout.slice(0, -1).split("\n")
    : stdout.split("\n");
  if (lines.length !== 2 || lines[0] !== "install ok installed") {
    throw new Error("Package is not installed");
  }
  return lines[1];
}

async function defaultProbeLibraries(sonames) {
  const script = `import ctypes
import json
import os

sonames = ${JSON.stringify(sonames)}
mode = getattr(os, "RTLD_LOCAL", 0) | getattr(os, "RTLD_LAZY", 1)
handles = [ctypes.CDLL(soname, mode=mode) for soname in sonames]
matches = {soname: set() for soname in sonames}
with open("/proc/self/maps", "r", encoding="ascii", errors="strict") as maps:
    for line in maps:
        fields = line.rstrip("\\n").split(maxsplit=5)
        if len(fields) != 6 or not fields[5].startswith("/"):
            continue
        candidate = fields[5]
        basename = os.path.basename(candidate)
        for soname in sonames:
            if basename == soname or basename.startswith(soname + "."):
                matches[soname].add(os.path.realpath(candidate))
libraries = []
for soname in sonames:
    paths = sorted(matches[soname])
    if len(paths) != 1:
        raise RuntimeError("required library did not resolve uniquely")
    libraries.append({"soname": soname, "path": paths[0]})
print(json.dumps({"libraries": libraries}, separators=(",", ":")))
`;
  const { stdout } = await execFileAsync(
    "/usr/bin/python3",
    ["-I", "-c", script],
    commandOptions(64 * 1024),
  );
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Invalid dlopen probe output");
  }
  if (!hasExactKeys(parsed, ["libraries"])) {
    throw new Error("Invalid dlopen probe output");
  }
  return parsed.libraries;
}

async function defaultInspectLibrary({ absolutePath, packageName, soname }) {
  if (typeof absolutePath !== "string" || !path.posix.isAbsolute(absolutePath)) {
    throw new Error("Loaded library path is not absolute");
  }
  const resolved = await realpath(absolutePath);
  if (resolved !== absolutePath) {
    throw new Error("Loaded library path is not canonical");
  }
  const metadata = await lstat(resolved);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    !Number.isSafeInteger(metadata.size) ||
    metadata.size < 1
  ) {
    throw new Error("Loaded library is not a non-empty real regular file");
  }

  const { stdout } = await execFileAsync(
    "/usr/bin/dpkg-query",
    ["--search", resolved],
    commandOptions(16 * 1024),
  );
  const ownerLines = stdout.trimEnd().split("\n");
  const expectedOwners = new Set([packageName, `${packageName}:amd64`]);
  if (ownerLines.length !== 1) {
    throw new Error("Loaded library package ownership is ambiguous");
  }
  const delimiter = ownerLines[0].indexOf(": ");
  if (
    delimiter < 1 ||
    !expectedOwners.has(ownerLines[0].slice(0, delimiter)) ||
    ownerLines[0].slice(delimiter + 2) !== resolved
  ) {
    throw new Error("Loaded library is not owned by its required package");
  }

  return {
    package: packageName,
    soname,
    basename: path.posix.basename(resolved),
    bytes: metadata.size,
    sha256: await sha256File(resolved),
  };
}

function assertDiscoveredLibraries(value) {
  if (!Array.isArray(value) || value.length !== librarySpecs.length) {
    throw new Error("Linux EGL dlopen probe returned an invalid library inventory");
  }
  for (let index = 0; index < librarySpecs.length; index += 1) {
    const entry = value[index];
    if (
      !hasExactKeys(entry, ["soname", "path"]) ||
      entry.soname !== librarySpecs[index].soname ||
      typeof entry.path !== "string" ||
      !path.posix.isAbsolute(entry.path) ||
      entry.path.includes("\0") ||
      entry.path.includes("\n") ||
      entry.path.includes("\r")
    ) {
      throw new Error("Linux EGL dlopen probe returned an invalid library inventory");
    }
  }
}

function commandOptions(maxBuffer) {
  return {
    encoding: "utf8",
    maxBuffer,
    windowsHide: true,
  };
}

function hasExactKeys(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
