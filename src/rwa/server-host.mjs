import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertRwaGeneratedRuntimeFiles,
  assertRwaLocalEnvironmentFilesAbsent,
  assertRwaRuntimeCacheEmpty,
} from "./runtime-identity.mjs";

const serverPreloadEnvironmentName = "STASIS_COMPAT_RWA_SERVER_PRELOAD_PATH";
const childRoleEnvironmentName = "STASIS_COMPAT_RWA_SERVER_ROLE";
const childPortEnvironmentName = "STASIS_COMPAT_RWA_SERVER_PORT";

export const rwaServerRoles = Object.freeze([
  Object.freeze({
    name: "frontend",
    port: 3000,
    tail: Object.freeze(["scripts/testServer.ts"]),
  }),
  Object.freeze({
    name: "backend",
    port: 3001,
    tail: Object.freeze(["--files", "backend/app.ts"]),
  }),
]);

export function buildRwaServerEnvironment(root, source = process.env, options = {}) {
  const environment = {};
  for (const retainedName of ["ComSpec", "PATHEXT", "SystemRoot", "TEMP", "TMP", "WINDIR"]) {
    const sourceName = Object.keys(source).find(
      (name) => name.toLowerCase() === retainedName.toLowerCase(),
    );
    if (sourceName !== undefined && source[sourceName] !== undefined) {
      environment[retainedName] = source[sourceName];
    }
  }
  environment.Path = [
    path.join(root, "node_modules", ".bin"),
    path.dirname(process.execPath),
    environment.SystemRoot === undefined ? null : path.join(environment.SystemRoot, "System32"),
  ].filter(Boolean).join(path.delimiter);
  environment.NODE_ENV = "test";
  if (typeof options.preloadPath === "string" && options.preloadPath.length > 0) {
    environment.NODE_OPTIONS = `--require=${path.resolve(options.preloadPath)}`;
  }
  if (typeof options.roleName === "string" && options.roleName.length > 0) {
    environment[childRoleEnvironmentName] = options.roleName;
  }
  if (Number.isSafeInteger(options.rolePort) && options.rolePort > 0) {
    environment[childPortEnvironmentName] = String(options.rolePort);
  }
  return environment;
}

export function buildRwaServerArguments(root, role) {
  return [
    path.join(root, "node_modules", "ts-node", "dist", "bin.js"),
    "-P",
    path.join(root, "tsconfig.tsnode.json"),
    ...role.tail.map((value) => value.endsWith(".ts") ? path.join(root, ...value.split("/")) : value),
  ];
}

export function normalizeRwaServerChildSignal(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (!["rwa-server-ready", "rwa-server-closed"].includes(value.type)) return null;
  if (typeof value.role !== "string" || !Number.isSafeInteger(value.port) || value.port < 1) {
    return null;
  }
  return Object.freeze({
    type: value.type,
    role: value.role,
    port: value.port,
  });
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64" || process.version !== "v22.20.0") {
    throw new Error("The sealed RWA server host requires Node v22.20.0 on Windows x64");
  }
  const root = path.resolve(
    process.env.RWA_ROOT ?? path.join("inputs", "cypress-realworld-app-28ca4d0"),
  );
  await assertRwaRuntimeCacheEmpty(root);
  await assertRwaGeneratedRuntimeFiles(root);
  await assertRwaLocalEnvironmentFilesAbsent(root);
  const preloadPath = process.env[serverPreloadEnvironmentName];
  const children = rwaServerRoles.map((role) => ({
    role,
    child: spawn(process.execPath, buildRwaServerArguments(root, role), {
      cwd: root,
      env: buildRwaServerEnvironment(root, process.env, {
        preloadPath,
        roleName: role.name,
        rolePort: role.port,
      }),
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      windowsHide: true,
    }),
  }));
  for (const { role, child } of children) {
    console.log(`sealed RWA ${role.name} host pid=${child.pid} port=${role.port}`);
  }

  let stopping = false;
  let readySent = false;
  const readyRoles = new Set();
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const sendHostMessage = (type, extra = {}) => {
    if (typeof process.send !== "function") return;
    process.send({ type, ...extra });
  };
  for (const { role, child } of children) {
    child.on("message", (message) => {
      const signal = normalizeRwaServerChildSignal(message);
      if (signal === null || signal.role !== role.name || signal.port !== role.port) return;
      if (signal.type === "rwa-server-ready") {
        readyRoles.add(role.name);
        if (!readySent && readyRoles.size === children.length) {
          readySent = true;
          sendHostMessage("rwa-host-ready", {
            roles: children.map(({ role: item }) => ({
              name: item.name,
              port: item.port,
            })),
          });
          resolveReady();
        }
      }
    });
  }
  if (children.length === 0) {
    readySent = true;
    resolveReady();
  }
  const exits = children.map(({ role, child }) => new Promise((resolve) => {
    child.once("error", (error) => resolve({ role: role.name, errorName: error.name }));
    child.once("exit", (code, signal) => resolve({ role: role.name, code, signal }));
  }));
  const stop = (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    process.exitCode = exitCode;
    for (const { child } of children) terminateTree(child.pid);
  };
  process.once("SIGINT", () => stop(130));
  process.once("SIGTERM", () => stop(143));
  process.on("message", (message) => {
    if (message?.type === "rwa-host-stop") stop(0);
  });
  const firstExit = Promise.race(exits);
  await Promise.race([
    ready,
    firstExit.then((first) => {
      if (stopping) return;
      throw new Error(`sealed RWA ${first.role} server exited unexpectedly`);
    }),
  ]);
  const first = await firstExit;
  if (!stopping) {
    stop(1);
    throw new Error(`sealed RWA ${first.role} server exited unexpectedly`);
  }
  await Promise.allSettled(exits);
  sendHostMessage("rwa-host-stopped");
}

function terminateTree(processId) {
  if (!Number.isSafeInteger(processId) || processId < 1) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(processId), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
  }
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  await main();
}
