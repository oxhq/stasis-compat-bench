import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  hasCanonicalPublicRemote,
  isCanonicalPublicRemoteUrl,
  rawCommitParents,
  verifyPublicProjectionTree,
} from "../src/publication/public-projection.mjs";

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("canonical public remote accepts only the intended GitHub repository", () => {
  assert.equal(
    isCanonicalPublicRemoteUrl("https://github.com/oxhq/stasis-compat-bench.git"),
    true,
  );
  assert.equal(
    isCanonicalPublicRemoteUrl(
      ["git", "github.com:oxhq/stasis-compat-bench.git"].join("@"),
    ),
    true,
  );
  assert.equal(
    isCanonicalPublicRemoteUrl("https://github.com/reviewer/stasis-compat-bench.git"),
    false,
  );
  assert.equal(
    isCanonicalPublicRemoteUrl("https://github.com/oxhq/stasis-compat-bench-fork.git"),
    false,
  );
});

test("complete projection inventory rejects missing, extra, and mutated code in a real root commit", async (t) => {
  const scratchRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-public-projection-"));
  t.after(async () => rm(scratchRoot, { force: true, recursive: true }));
  const projectedRoot = path.join(scratchRoot, "projected");
  await mkdir(projectedRoot);
  const manifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "PUBLIC_PROJECTION.json"), "utf8"),
  );
  for (const relativePath of [
    manifest.projectedTree.manifestPath,
    ...manifest.projectedTree.files.map((entry) => entry.path),
  ]) {
    const target = path.join(projectedRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(repositoryRoot, ...relativePath.split("/")), target);
  }
  await git(projectedRoot, ["init", "--initial-branch=main"]);
  await git(projectedRoot, ["config", "user.name", "Projection Test"]);
  await git(projectedRoot, [
    "config",
    "user.email",
    ["projection", "example.test"].join("@"),
  ]);
  await git(projectedRoot, ["add", "--all"]);
  await git(projectedRoot, ["commit", "-m", "Prepare public benchmark projection"]);

  const verified = await verifyPublicProjectionTree({
    repositoryRoot: projectedRoot,
    manifest,
  });
  assert.equal(verified.sourceHistoryExcluded, true);
  assert.equal(verified.rawHeadParentCount, 0);
  assert.equal(verified.headWorktreeIdentityVerified, true);
  assert.equal(verified.projectedTreeFileCount, manifest.projectedTree.files.length);
  assert.equal(await hasCanonicalPublicRemote(projectedRoot), false);
  await git(projectedRoot, [
    "remote",
    "add",
    "origin",
    "https://github.com/oxhq/stasis-compat-bench.git",
  ]);
  assert.equal(await hasCanonicalPublicRemote(projectedRoot), true);
  await git(projectedRoot, [
    "remote",
    "set-url",
    "--push",
    "origin",
    "https://github.com/reviewer/stasis-compat-bench.git",
  ]);
  assert.equal(await hasCanonicalPublicRemote(projectedRoot), false);
  await git(projectedRoot, [
    "remote",
    "set-url",
    "--push",
    "origin",
    "https://github.com/oxhq/stasis-compat-bench.git",
  ]);

  const mutationPath = manifest.projectedTree.files.find(
    (entry) => entry.path.startsWith("src/") && entry.path.endsWith(".mjs"),
  ).path;
  const mutationTarget = path.join(projectedRoot, ...mutationPath.split("/"));
  const originalMutationBytes = await readFile(mutationTarget);

  const hiddenRoot = path.join(scratchRoot, "hidden-head-bytes");
  await git(scratchRoot, ["clone", projectedRoot, hiddenRoot]);
  await git(hiddenRoot, ["config", "user.name", "Projection Test"]);
  await git(hiddenRoot, [
    "config",
    "user.email",
    ["projection", "example.test"].join("@"),
  ]);
  const hiddenTarget = path.join(hiddenRoot, ...mutationPath.split("/"));
  await writeFile(
    hiddenTarget,
    Buffer.concat([originalMutationBytes, Buffer.from("\n// committed drift\n")]),
  );
  await git(hiddenRoot, ["add", mutationPath]);
  await git(hiddenRoot, ["commit", "--amend", "--no-edit"]);
  await git(hiddenRoot, ["update-index", "--assume-unchanged", "--", mutationPath]);
  await writeFile(hiddenTarget, originalMutationBytes);
  assert.equal((await git(hiddenRoot, ["status", "--porcelain=v1"])).length, 0);
  await assert.rejects(
    verifyPublicProjectionTree({ repositoryRoot: hiddenRoot, manifest }),
    /HEAD blob differs from worktree bytes/u,
  );

  const identityRoot = path.join(scratchRoot, "committer-mismatch");
  await git(scratchRoot, ["clone", projectedRoot, identityRoot]);
  const selectedManifest = structuredClone(manifest);
  const publicName = "Public Projection Author";
  const publicEmail = ["public-projection", "example.test"].join("@");
  selectedManifest.publicationChoices.author = {
    name: publicName,
    email: publicEmail,
  };
  await writeFile(
    path.join(identityRoot, "PUBLIC_PROJECTION.json"),
    `${JSON.stringify(selectedManifest, null, 2)}\n`,
    "utf8",
  );
  await git(identityRoot, ["config", "user.name", "Private Committer"]);
  await git(identityRoot, [
    "config",
    "user.email",
    ["private-committer", "example.test"].join("@"),
  ]);
  await git(identityRoot, ["add", "PUBLIC_PROJECTION.json"]);
  await git(identityRoot, [
    "commit",
    "--amend",
    "--no-edit",
    "--author",
    `${publicName} <${publicEmail}>`,
  ]);
  const identityResult = await verifyPublicProjectionTree({
    repositoryRoot: identityRoot,
    manifest: selectedManifest,
  });
  assert.equal(identityResult.rootAuthorMatchesChoice, true);
  assert.equal(identityResult.rootCommitterMatchesChoice, false);
  assert.equal(identityResult.metadataChoicesComplete, false);

  const replaceRoot = path.join(scratchRoot, "replacement-ref");
  await git(scratchRoot, ["clone", projectedRoot, replaceRoot]);
  await git(replaceRoot, ["config", "user.name", "Private Source Author"]);
  await git(replaceRoot, [
    "config",
    "user.email",
    ["private-source", "example.test"].join("@"),
  ]);
  await git(replaceRoot, ["commit", "--allow-empty", "-m", "Private child commit"]);
  const childRevision = (await git(replaceRoot, ["rev-parse", "HEAD"])).trim();
  const childTree = (await git(replaceRoot, ["show", "-s", "--format=%T", "HEAD"])).trim();
  await git(replaceRoot, ["config", "user.name", "Public Replacement Author"]);
  await git(replaceRoot, [
    "config",
    "user.email",
    ["public-replacement", "example.test"].join("@"),
  ]);
  const replacementRevision = (
    await git(replaceRoot, ["commit-tree", childTree, "-m", "Replacement root"])
  ).trim();
  await git(replaceRoot, ["replace", childRevision, replacementRevision]);
  assert.equal(
    rawCommitParents(await git(replaceRoot, ["cat-file", "-p", "HEAD"])).length,
    0,
  );
  assert.equal(
    rawCommitParents(
      await git(replaceRoot, ["--no-replace-objects", "cat-file", "-p", "HEAD"]),
    ).length,
    1,
  );
  await assert.rejects(
    verifyPublicProjectionTree({ repositoryRoot: replaceRoot, manifest }),
  );

  await writeFile(mutationTarget, Buffer.concat([originalMutationBytes, Buffer.from("\n")]));
  await assert.rejects(
    verifyPublicProjectionTree({ repositoryRoot: projectedRoot, manifest, requireClean: false }),
    /projected tree file bytes changed/u,
  );
  await writeFile(mutationTarget, originalMutationBytes);

  const missingPath = manifest.projectedTree.files.find(
    (entry) => entry.path.startsWith("test/") && entry.path.endsWith(".mjs"),
  ).path;
  const missingTarget = path.join(projectedRoot, ...missingPath.split("/"));
  const missingBytes = await readFile(missingTarget);
  await rm(missingTarget);
  await assert.rejects(
    verifyPublicProjectionTree({ repositoryRoot: projectedRoot, manifest, requireClean: false }),
  );
  await mkdir(path.dirname(missingTarget), { recursive: true });
  await writeFile(missingTarget, missingBytes);

  await writeFile(path.join(projectedRoot, "unexpected-source.mjs"), "export default true;\n");
  await git(projectedRoot, ["add", "unexpected-source.mjs"]);
  await assert.rejects(
    verifyPublicProjectionTree({ repositoryRoot: projectedRoot, manifest, requireClean: false }),
    /tracked files differ from its complete inventory/u,
  );

  await mkdir(path.join(projectedRoot, "artifacts", "runs"), { recursive: true });
  await writeFile(
    path.join(projectedRoot, "artifacts", "runs", "history-marker.txt"),
    "excluded history marker\n",
  );
  await git(projectedRoot, ["add", "--all"]);
  await git(projectedRoot, ["commit", "-m", "Create a non-root projection"]);
  const rawNonRoot = await git(projectedRoot, ["cat-file", "-p", "HEAD"]);
  assert.equal(rawCommitParents(rawNonRoot).length, 1);

  const shallowRoot = path.join(scratchRoot, "shallow");
  await git(scratchRoot, [
    "clone",
    "--depth=1",
    pathToFileURL(projectedRoot).href,
    shallowRoot,
  ]);
  assert.equal((await git(shallowRoot, ["rev-list", "--count", "HEAD"])).trim(), "1");
  const rawShallow = await git(shallowRoot, ["cat-file", "-p", "HEAD"]);
  assert.equal(rawCommitParents(rawShallow).length, 1);
});

async function git(cwd, args) {
  const { stdout } = await executeFile("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}
