import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { serializePostSupportArtifact } from "../src/post-support/artifact-privacy.mjs";
import { writeExplicitPostSupportOutput } from "../src/post-support/output.mjs";
import {
  executePostSupportWildProcessPlan,
  postSupportWildProcessSteps,
  postSupportWildStepEnvironment,
} from "../src/post-support/wild-process-plan.mjs";

const execFileAsync = promisify(execFile);

test("post-support CLI links every module before reading candidate environment", async () => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("STASIS_POST_SUPPORT_")),
  );
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [fileURLToPath(new URL("../src/post-support/run.mjs", import.meta.url)), "candidate"],
      { env: environment, windowsHide: true },
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /STASIS_POST_SUPPORT_PACKAGE_RUN_ID is required/u);
      assert.doesNotMatch(error.stderr, /SyntaxError|does not provide an export/u);
      return true;
    },
  );
});

test("post-support wild orchestrator strips caller authority flags and awaits both children", async () => {
  assert.deepEqual(postSupportWildProcessSteps, ["wild-smoke", "wild-paired"]);
  for (const step of postSupportWildProcessSteps) {
    const environment = postSupportWildStepEnvironment(step, {
      STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT: "untrusted-parent-value",
      RETAINED: "yes",
    });
    assert.equal(environment.RETAINED, "yes");
    assert.equal(
      Object.hasOwn(environment, "STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT"),
      false,
    );
  }
  const events = [];
  await executePostSupportWildProcessPlan(async (step) => {
    events.push(`start:${step}`);
    await Promise.resolve();
    events.push(`exit:${step}`);
  });
  assert.deepEqual(events, [
    "start:wild-smoke",
    "exit:wild-smoke",
    "start:wild-paired",
    "exit:wild-paired",
  ]);
  assert.throws(() => postSupportWildStepEnvironment("other"), /Unknown/u);
});

test("post-support output writer emits only canonical privacy-projected fresh bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "stasis-post-support-output-"));
  try {
    const destination = path.join(directory, "proof.json");
    const value = {
      schema: "typed-proof-v1",
      passed: true,
      count: 1,
      code: "ERR_FAILED",
      ratio: "1/2",
    };
    const record = await writeExplicitPostSupportOutput(value, destination, "test output");
    assert.equal(record.written, true);
    assert.match(record.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(await readFile(destination, "utf8"), serializePostSupportArtifact(value));
    assert.equal(JSON.stringify(record).includes(directory), false);
    await assert.rejects(
      () => writeExplicitPostSupportOutput(value, destination, "test output"),
      /fresh path/u,
    );
    await assert.rejects(
      () => writeExplicitPostSupportOutput(
        { authorizationValue: "PRIVATE_SENTINEL" },
        path.join(directory, "private.json"),
        "private output",
      ),
      /sensitive key/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("package scripts expose every clean-checkout post-support lane", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(
    Object.fromEntries(Object.entries(packageJson.scripts).filter(([name]) => name.startsWith("post-support:"))),
    {
      "post-support:candidate": "node src/post-support/run.mjs candidate",
      "post-support:cookies": "node src/post-support/run.mjs cookies",
      "post-support:typed-minimizers": "node src/post-support/run.mjs typed-minimizers",
      "post-support:deterministic": "node src/post-support/run.mjs deterministic",
      "post-support:rwa": "node src/post-support/run.mjs rwa",
      "post-support:wild:smoke": "node src/post-support/run.mjs wild-smoke",
      "post-support:wild:paired": "node src/post-support/run.mjs wild-paired",
      "post-support:wild:verify:diagnostic": "node src/post-support/run.mjs wild-verify",
      "post-support:wild": "node src/post-support/run.mjs wild",
    },
  );
});
