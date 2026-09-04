import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { repositoryRoot } from "../shared/io.mjs";

const execFileAsync = promisify(execFile);

export async function assertWildPreregistration({
  expectedCommit = process.env.STASIS_WILD_PREREG_COMMIT,
  runGit = git,
} = {}) {
  if (!/^[a-f0-9]{40}$/u.test(expectedCommit ?? "")) {
    throw new Error("STASIS_WILD_PREREG_COMMIT must be one canonical 40-hex commit");
  }
  const [head, status] = await Promise.all([
    runGit(["rev-parse", "HEAD"]),
    runGit(["status", "--porcelain=v1", "--untracked-files=all", "--ignored=no"]),
  ]);
  return validateWildPreregistration({ expectedCommit, head, status });
}

export function validateWildPreregistration({ expectedCommit, head, status }) {
  if (!/^[a-f0-9]{40}$/u.test(expectedCommit ?? "")) {
    throw new Error("STASIS_WILD_PREREG_COMMIT must be one canonical 40-hex commit");
  }
  const actualHead = asText(head).trim();
  if (actualHead !== expectedCommit) {
    throw new Error(
      `Wild preregistration commit mismatch: expected ${expectedCommit}, got ${actualHead}`,
    );
  }
  if (asText(status).trim().length > 0) {
    throw new Error("Wild preflight requires a clean preregistered worktree and index");
  }
  return expectedCommit;
}

async function git(args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

function asText(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return typeof value === "string" ? value : "";
}
