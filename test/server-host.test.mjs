import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildRwaServerArguments,
  buildRwaServerEnvironment,
  rwaServerRoles,
} from "../src/rwa/server-host.mjs";

const root = "E:\\frozen-rwa";

test("the sealed server host invokes absolute unchanged ts-node roles without NYC", () => {
  assert.deepEqual(buildRwaServerArguments(root, rwaServerRoles[0]), [
    path.join(root, "node_modules", "ts-node", "dist", "bin.js"),
    "-P",
    path.join(root, "tsconfig.tsnode.json"),
    path.join(root, "scripts", "testServer.ts"),
  ]);
  assert.deepEqual(buildRwaServerArguments(root, rwaServerRoles[1]), [
    path.join(root, "node_modules", "ts-node", "dist", "bin.js"),
    "-P",
    path.join(root, "tsconfig.tsnode.json"),
    "--files",
    path.join(root, "backend", "app.ts"),
  ]);
  assert.equal(JSON.stringify(rwaServerRoles).includes("nyc"), false);
});

test("the sealed server environment removes ambient runtime overrides", () => {
  const environment = buildRwaServerEnvironment(root, {
    GITHUB_TOKEN: "ambient-secret",
    OPENAI_API_KEY: "ambient-secret",
    Path: "C:\\Windows\\System32",
    NODE_OPTIONS: "--require hostile.js",
    NYC_CONFIG_OVERRIDE: "{\"cache\":true}",
    PAGINATION_PAGE_SIZE: "999",
    RWA_ROOT: "C:\\wrong",
    SEED_DEFAULT_USER_PASSWORD: "wrong",
    SYSTEMROOT: "C:\\Windows",
    VITE_BACKEND_PORT: "3999",
  });
  assert.equal(environment.NODE_ENV, "test");
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.NODE_OPTIONS, undefined);
  assert.equal(environment.NYC_CONFIG_OVERRIDE, undefined);
  assert.equal(environment.PAGINATION_PAGE_SIZE, undefined);
  assert.equal(environment.RWA_ROOT, undefined);
  assert.equal(environment.SEED_DEFAULT_USER_PASSWORD, undefined);
  assert.equal(environment.VITE_BACKEND_PORT, undefined);
  assert.equal(environment.SystemRoot, "C:\\Windows");
  assert.deepEqual(environment.Path.split(path.delimiter).slice(0, 2), [
    path.join(root, "node_modules", ".bin"),
    path.dirname(process.execPath),
  ]);
});
