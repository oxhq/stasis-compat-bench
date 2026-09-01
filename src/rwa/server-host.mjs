import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertRwaGeneratedRuntimeFiles,
  assertRwaLocalEnvironmentFilesAbsent,
  assertRwaRuntimeCacheEmpty,
} from "./runtime-identity.mjs";

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

export function buildRwaServerEnvironment(root, source = process.env) {
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
  const environment = buildRwaServerEnvironment(root);
  const children = rwaServerRoles.map((role) => ({
    role,
    child: spawn(process.execPath, buildRwaServerArguments(root, role), {
      cwd: root,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    }),
  }));
  for (const { role, child } of children) {
    console.log(`sealed RWA ${role.name} host pid=${child.pid} port=${role.port}`);
  }

  let stopping = false;
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

  const first = await Promise.race(exits);
  if (!stopping) {
    stop(1);
    throw new Error(`sealed RWA ${first.role} server exited unexpectedly`);
  }
  await Promise.allSettled(exits);
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
