import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLinuxEglRuntimeEvidence,
  linuxEglRuntimeSchema,
  observeLinuxEglRuntime,
} from "../src/performance/linux-egl-runtime.mjs";

const packageVersions = Object.freeze({
  libegl1: "1.4.0-1",
  "libegl-mesa0": "22.0.5-0ubuntu0.1~22.04.1",
  libglvnd0: "1.4.0-1",
});

const discoveredLibraries = Object.freeze([
  Object.freeze({
    soname: "libEGL.so.1",
    path: "/usr/lib/x86_64-linux-gnu/libEGL.so.1.1.0",
  }),
  Object.freeze({
    soname: "libEGL_mesa.so.0",
    path: "/usr/lib/x86_64-linux-gnu/libEGL_mesa.so.0.0.0",
  }),
  Object.freeze({
    soname: "libGLdispatch.so.0",
    path: "/usr/lib/x86_64-linux-gnu/libGLdispatch.so.0.0.0",
  }),
]);

const libraryBySoname = Object.freeze({
  "libEGL.so.1": Object.freeze({
    package: "libegl1",
    soname: "libEGL.so.1",
    basename: "libEGL.so.1.1.0",
    bytes: 84_992,
    sha256: "a".repeat(64),
  }),
  "libEGL_mesa.so.0": Object.freeze({
    package: "libegl-mesa0",
    soname: "libEGL_mesa.so.0",
    basename: "libEGL_mesa.so.0.0.0",
    bytes: 288_248,
    sha256: "b".repeat(64),
  }),
  "libGLdispatch.so.0": Object.freeze({
    package: "libglvnd0",
    soname: "libGLdispatch.so.0",
    basename: "libGLdispatch.so.0.0.0",
    bytes: 718_032,
    sha256: "c".repeat(64),
  }),
});

function evidenceFixture() {
  return {
    schema: linuxEglRuntimeSchema,
    dlopen: {
      method: "python3_ctypes_cdll_proc_maps_v1",
      status: "passed",
    },
    packages: Object.entries(packageVersions).map(([name, version]) => ({ name, version })),
    libraries: discoveredLibraries.map(({ soname }) => structuredClone(libraryBySoname[soname])),
  };
}

test("Linux EGL observation verifies packages before dlopen and retains only exact path-free identities", async () => {
  const events = [];
  const observed = await observeLinuxEglRuntime({
    runtime: () => ({ platform: "linux", arch: "x64" }),
    readPackageVersion: async (name) => {
      events.push(`package:${name}`);
      return packageVersions[name];
    },
    probeLibraries: async (sonames) => {
      events.push("dlopen");
      assert.deepEqual(sonames, discoveredLibraries.map(({ soname }) => soname));
      return structuredClone(discoveredLibraries);
    },
    inspectLibrary: async ({ absolutePath, packageName, soname }) => {
      events.push(`inspect:${soname}`);
      assert.equal(
        absolutePath,
        discoveredLibraries.find((entry) => entry.soname === soname).path,
      );
      assert.equal(packageName, libraryBySoname[soname].package);
      return structuredClone(libraryBySoname[soname]);
    },
  });

  assert.equal(assertLinuxEglRuntimeEvidence(observed), observed);
  assert.deepEqual(events, [
    "package:libegl1",
    "package:libegl-mesa0",
    "package:libglvnd0",
    "dlopen",
    "inspect:libEGL.so.1",
    "inspect:libEGL_mesa.so.0",
    "inspect:libGLdispatch.so.0",
  ]);
  assert.equal(JSON.stringify(observed).includes("/usr/"), false);
  assert.equal(Object.isFrozen(observed), true);
  assert.equal(Object.isFrozen(observed.libraries[0]), true);
});

test("Linux EGL observation rejects package or loader failures without leaking hostile diagnostics", async () => {
  let probeCalls = 0;
  await assert.rejects(
    observeLinuxEglRuntime({
      runtime: () => ({ platform: "linux", arch: "x64" }),
      readPackageVersion: async (name) => {
        if (name === "libegl-mesa0") throw new Error("private-package-path-sentinel");
        return packageVersions[name];
      },
      probeLibraries: async () => {
        probeCalls += 1;
        return structuredClone(discoveredLibraries);
      },
    }),
    (error) => {
      assert.equal(error.message, "Required Linux EGL package libegl-mesa0 is not installed");
      assert.equal(error.message.includes("private-package-path-sentinel"), false);
      return true;
    },
  );
  assert.equal(probeCalls, 0);

  await assert.rejects(
    observeLinuxEglRuntime({
      runtime: () => ({ platform: "linux", arch: "x64" }),
      readPackageVersion: async (name) => packageVersions[name],
      probeLibraries: async () => {
        throw new Error("private loader output /opt/secret");
      },
    }),
    (error) => {
      assert.equal(error.message, "Linux EGL runtime prerequisite dlopen probe failed");
      assert.equal(error.message.includes("/opt/secret"), false);
      return true;
    },
  );
});

test("Linux EGL observation rejects a forged or noncanonical dlopen inventory", async () => {
  const mutations = [
    (value) => value.reverse(),
    (value) => { value[0].extra = "forged"; },
    (value) => { value[0].soname = "libSecret.so.1"; },
    (value) => { value[0].path = "relative/libEGL.so.1"; },
    (value) => { value[0].path = "/tmp/libEGL.so.1\n/private"; },
  ];
  for (const mutate of mutations) {
    let inspectCalls = 0;
    const changed = structuredClone(discoveredLibraries);
    mutate(changed);
    await assert.rejects(
      observeLinuxEglRuntime({
        runtime: () => ({ platform: "linux", arch: "x64" }),
        readPackageVersion: async (name) => packageVersions[name],
        probeLibraries: async () => changed,
        inspectLibrary: async () => {
          inspectCalls += 1;
          return {};
        },
      }),
      /invalid library inventory/u,
    );
    assert.equal(inspectCalls, 0);
  }
});

test("Linux EGL exact evidence validation rejects identity and privacy mutations", () => {
  const mutations = [
    (value) => { value.extra = true; },
    (value) => { value.schema = `${linuxEglRuntimeSchema}-drift`; },
    (value) => { value.dlopen.status = "failed"; },
    (value) => { value.dlopen.method = "shell-ldd"; },
    (value) => { value.packages.reverse(); },
    (value) => { value.packages[0].version = "private/path"; },
    (value) => { value.packages[0].version = 1; },
    (value) => { value.libraries.reverse(); },
    (value) => { value.libraries[0].package = "forged"; },
    (value) => { value.libraries[0].soname = "libEGL.so"; },
    (value) => { value.libraries[0].basename = "/private/libEGL.so.1.1.0"; },
    (value) => { value.libraries[0].basename = "..\\libEGL.so.1.1.0"; },
    (value) => { value.libraries[0].bytes = 0; },
    (value) => { value.libraries[0].sha256 = "A".repeat(64); },
    (value) => { value.libraries[0].sha256 = BigInt("1".repeat(64)); },
  ];
  for (const mutate of mutations) {
    const changed = evidenceFixture();
    mutate(changed);
    assert.throws(
      () => assertLinuxEglRuntimeEvidence(changed),
      /Invalid Linux EGL/u,
    );
  }
});

test("Linux EGL observation is unavailable outside the hosted Linux x64 lane", async () => {
  for (const runtime of [
    { platform: "win32", arch: "x64" },
    { platform: "linux", arch: "arm64" },
  ]) {
    await assert.rejects(
      observeLinuxEglRuntime({ runtime: () => runtime }),
      /requires Linux x64/u,
    );
  }
});
