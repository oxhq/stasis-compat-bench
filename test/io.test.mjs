import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertExactFileInventory,
  assertSerializedError,
  repositoryRoot,
  serializeError,
  sha256DirectoryTree,
  sha256File,
  validateSealedArtifactRootPath,
} from "../src/shared/io.mjs";

test("file and directory hashes are byte-sensitive and path-order deterministic", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-compat-io-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const left = path.join(root, "left");
  const right = path.join(root, "right");
  await mkdir(path.join(left, "nested"), { recursive: true });
  await mkdir(path.join(right, "nested"), { recursive: true });

  await writeFile(path.join(left, "z.txt"), "z\n", "utf8");
  await writeFile(path.join(left, "nested", "a.txt"), "alpha\r\n", "utf8");
  await writeFile(path.join(right, "nested", "a.txt"), "alpha\r\n", "utf8");
  await writeFile(path.join(right, "z.txt"), "z\n", "utf8");

  assert.equal(
    await sha256File(path.join(left, "z.txt")),
    "c865f6c5ab8d1b0bcd383a5e1e3879d22681c96bf462c269b7581d523fbe70ab",
  );
  const leftTree = await sha256DirectoryTree(left);
  const rightTree = await sha256DirectoryTree(right);
  assert.deepEqual(leftTree, rightTree);
  assert.equal(leftTree.fileCount, 2);
  assert.equal(leftTree.totalBytes, 9);

  await writeFile(path.join(right, "z.txt"), "changed\n", "utf8");
  assert.notEqual((await sha256DirectoryTree(right)).sha256, leftTree.sha256);
});

test("sealed artifact roots and inventories are exact, narrow, and order-independent", () => {
  const valid = path.join(repositoryRoot, "artifacts", "runs", "review-01");
  assert.equal(validateSealedArtifactRootPath(valid), path.resolve(valid));
  assert.throws(
    () => validateSealedArtifactRootPath(path.join(repositoryRoot, "artifacts", "work")),
    /one direct child/u,
  );
  assert.throws(
    () => validateSealedArtifactRootPath(path.join(repositoryRoot, "artifacts", "runs", "nested", "run")),
    /one direct child/u,
  );
  assert.doesNotThrow(() => assertExactFileInventory(["b", "a"], ["a", "b"]));
  assert.throws(() => assertExactFileInventory(["a", "extra"], ["a"]), /inventory mismatch/u);
});

test("Stasis process errors retain only bounded fixed-vocabulary diagnostics", () => {
  const privateText = ["C:", "Users", "private", "target?token=PRIVATE_SENTINEL"].join("\\");
  const stderrTail = [
    privateText,
    "stasis_lifecycle_v1 phase=close_accepted",
    "stasis_lifecycle_v1 phase=hostile_secret",
    "stasis_lifecycle_v1 phase=close_accepted_suffix",
    "stasis_lifecycle_v1 phase=engine_close_begin",
    "stasis_lifecycle_v1 phase=close_accepted",
    "Redirecting call to abort() to mozalloc_abort",
  ].join("\n");
  const error = new Error(`private message ${privateText}`);
  error.name = "StasisProcessError";
  error.code = "process_exit";
  error.exitCode = null;
  error.signal = "SIGABRT";
  error.stderrTail = stderrTail;

  const projected = serializeError(error);
  assert.deepEqual(projected.crashMarkers, ["mozalloc_abort"]);
  assert.deepEqual(projected.lifecyclePhases, ["close_accepted", "engine_close_begin"]);
  assert.equal(projected.exitCode, null);
  assert.equal(projected.signal, "SIGABRT");
  assert.equal(projected.stderrTailBytes, Buffer.byteLength(stderrTail));
  assert.equal(
    projected.stderrTailSha256,
    createHash("sha256").update(stderrTail, "utf8").digest("hex"),
  );
  assert.equal(assertSerializedError(projected), projected);
  assert.equal(JSON.stringify(projected).includes(privateText), false);
  assert.equal(JSON.stringify(projected).includes("hostile_secret"), false);

  const hostile = serializeError({
    name: "StasisProcessError",
    code: "process_exit",
    message: privateText,
    stderrTail: privateText,
    exitCode: Number.MAX_SAFE_INTEGER + 1,
    signal: privateText,
  });
  assert.equal(hostile.exitCode, null);
  assert.equal(hostile.signal, null);
  assert.deepEqual(hostile.crashMarkers, []);
  assert.deepEqual(hostile.lifecyclePhases, []);
  assert.equal(assertSerializedError(hostile), hostile);
});

test("serialized Stasis process diagnostic schema rejects forged fields and vocabulary", () => {
  const nullThrow = serializeError(null);
  assert.deepEqual(nullThrow, {
    name: "NonErrorThrow",
    thrownType: "object",
    valueOmitted: true,
  });
  assert.equal(assertSerializedError(nullThrow), nullThrow);

  const error = {
    name: "StasisProcessError",
    code: "process_exit",
    stderrTail: "stasis_lifecycle_v1 phase=close_accepted",
    exitCode: 134,
    signal: null,
  };
  const valid = serializeError(error);
  const mutations = [
    (value) => { value.extra = "forged"; },
    (value) => { delete value.exitCode; },
    (value) => { value.exitCode = -1; },
    (value) => { value.signal = "SIGUSR1"; },
    (value) => { value.stderrTailSha256 = "0".repeat(63); },
    (value) => { value.crashMarkers.push("private_marker"); },
    (value) => { value.lifecyclePhases.push("hostile_secret"); },
    (value) => { value.lifecyclePhases.push("close_accepted"); },
    (value) => { value.failurePhase = "page_19"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => assertSerializedError(changed), /Invalid|unknown/u);
  }
  assert.throws(
    () => assertSerializedError({
      name: "Error",
      exitCode: 1,
      signal: null,
      crashMarkers: [],
      lifecyclePhases: [],
    }),
    /require/u,
  );
});
