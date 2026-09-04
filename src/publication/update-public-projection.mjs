import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  projectedTreeDigest,
  validatePublicProjectionManifest,
} from "./public-projection.mjs";

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const manifestPath = path.join(repositoryRoot, "PUBLIC_PROJECTION.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
validatePublicProjectionManifest(manifest);

const { stdout } = await executeFile("git", ["ls-files", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  windowsHide: true,
});
const trackedPaths = stdout.split("\0").filter(Boolean).sort(compareUtf8);
const projectedPaths = trackedPaths.filter(
  (entry) =>
    entry !== manifest.projectedTree.manifestPath &&
    !manifest.sourceExclusions.some(({ pathPrefix }) => entry.startsWith(pathPrefix)),
);
const files = [];
for (const relativePath of projectedPaths) {
  const absolutePath = path.join(repositoryRoot, ...relativePath.split("/"));
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Projected tree entry is not one regular file: ${relativePath}`);
  }
  const bytes = await readFile(absolutePath);
  files.push({
    bytes: bytes.length,
    path: relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

manifest.projectedTree.files = files;
manifest.projectedTree.fileCount = files.length;
manifest.projectedTree.totalBytes = files.reduce((total, entry) => total + entry.bytes, 0);
manifest.projectedTree.sha256 = projectedTreeDigest(files);
manifest.unchangedInputs = files
  .filter(({ path: relativePath }) =>
    relativePath.startsWith("corpora/") || relativePath.startsWith("protocol/"))
  .map((entry) => ({ ...entry }));
validatePublicProjectionManifest(manifest);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  schema: "stasis-compat-public-projection-update-v1",
  status: "updated",
  fileCount: manifest.projectedTree.fileCount,
  totalBytes: manifest.projectedTree.totalBytes,
  sha256: manifest.projectedTree.sha256,
}, null, 2)}\n`);

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
