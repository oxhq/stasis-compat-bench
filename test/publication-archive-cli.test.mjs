import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const executeFile = promisify(execFile);
const cliPath = fileURLToPath(new URL("../src/publication/cli.mjs", import.meta.url));

test("package scripts expose deterministic archive build and verification commands", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(
    packageJson.scripts["publication:archive"],
    "node src/publication/cli.mjs archive",
  );
  assert.equal(
    packageJson.scripts["publication:archive:verify"],
    "node src/publication/cli.mjs archive-verify",
  );
  assert.equal(
    packageJson.scripts["publication:project-rwa-baseline"],
    "node src/publication/cli.mjs project-rwa-baseline",
  );
});

test("archive CLI commands reject non-absolute paths before reading publication state", async () => {
  const cases = [
    [
      "archive",
      ["relative-publication", "relative-output"],
      /publication root must be one explicit absolute path/u,
    ],
    [
      "archive-verify",
      ["relative-package", "relative-extraction"],
      /downloaded package directory must be one explicit absolute path/u,
    ],
    [
      "project-rwa-baseline",
      ["relative-source", "relative-output"],
      /frozen RWA Cypress baseline must be one explicit absolute path/u,
    ],
  ];
  for (const [command, args, expected] of cases) {
    await assert.rejects(
      executeFile(process.execPath, [cliPath, command, ...args], { encoding: "utf8" }),
      (error) => {
        assert.equal(error.code, 1, command);
        assert.equal(error.stdout, "", command);
        assert.match(error.stderr, expected, command);
        assert.doesNotMatch(error.stderr, /Usage:/u, command);
        return true;
      },
    );
  }
});

test("publication CLI usage documents archive and baseline projection operations", async () => {
  await assert.rejects(
    executeFile(process.execPath, [cliPath], { encoding: "utf8" }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(
        error.stderr,
        /archive <absolute-publication-root> <absolute-output-directory>/u,
      );
      assert.match(
        error.stderr,
        /archive-verify <absolute-package-directory> <absolute-extraction-directory>/u,
      );
      assert.match(
        error.stderr,
        /project-rwa-baseline <absolute-source> <absolute-output>/u,
      );
      return true;
    },
  );
});
