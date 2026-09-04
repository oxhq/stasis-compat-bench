import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  repositoryRoot,
  sha256DirectoryTree,
  sha256File,
} from "./io.mjs";

export const candidateV03 = Object.freeze({
  revision: "cd471fb2f515e1f7227581fb8930e04bd6414767",
  version: "0.3.0",
  executableSha256: "bd6715f5cc30ec66ea2d3b9c0889698ecea54373a3c3ab2c1893c934573916d1",
  sdkArchiveSha256: "56bd1860c0f1b4a05a32feb6ee41e71ff1c5947dbe44c2c4e30a31ca40b6bbb4",
  sdkArchiveBytes: 176_445,
  sdkTreeSha256: "c38928c342d804f2e5776945ef295162f5f755a3c0bd224b5ef16e1498998449",
  sdkTreeFileCount: 55,
  sdkTreeBytes: 876_195,
  profile: "controlled-web-session-v2",
});

export const candidateV03ArchivePath = path.join(
  repositoryRoot,
  "candidate",
  "oxhq-stasis-0.3.0.tgz",
);

export const candidateV03PackageRoot = path.join(
  repositoryRoot,
  "candidate",
  "oxhq-stasis-0.3.0",
  "package",
);

export async function assertCandidateV03Sdk({
  archivePath = candidateV03ArchivePath,
  packageRoot = candidateV03PackageRoot,
} = {}) {
  const [archiveMetadata, packageMetadata, resolvedPackageRoot] = await Promise.all([
    lstat(archivePath),
    lstat(packageRoot),
    realpath(packageRoot),
  ]);
  if (!archiveMetadata.isFile() || archiveMetadata.isSymbolicLink()) {
    throw new Error(`Candidate SDK archive is not a regular file: ${archivePath}`);
  }
  if (archiveMetadata.size !== candidateV03.sdkArchiveBytes) {
    throw new Error(
      `Candidate SDK archive length mismatch: expected ${candidateV03.sdkArchiveBytes}, got ${archiveMetadata.size}`,
    );
  }
  if (!packageMetadata.isDirectory() || packageMetadata.isSymbolicLink()) {
    throw new Error(`Candidate SDK extraction is not a real directory: ${packageRoot}`);
  }
  if (!samePath(resolvedPackageRoot, packageRoot)) {
    throw new Error(`Candidate SDK extraction resolves elsewhere: ${packageRoot} -> ${resolvedPackageRoot}`);
  }

  const [archiveSha256, tree, packageManifest] = await Promise.all([
    sha256File(archivePath),
    sha256DirectoryTree(packageRoot),
    readFile(path.join(packageRoot, "package.json"), "utf8").then(JSON.parse),
  ]);
  if (archiveSha256 !== candidateV03.sdkArchiveSha256) {
    throw new Error(
      `Candidate SDK archive mismatch: expected ${candidateV03.sdkArchiveSha256}, got ${archiveSha256}`,
    );
  }
  if (
    tree.sha256 !== candidateV03.sdkTreeSha256 ||
    tree.fileCount !== candidateV03.sdkTreeFileCount ||
    tree.totalBytes !== candidateV03.sdkTreeBytes
  ) {
    throw new Error(
      `Candidate SDK extraction mismatch: expected ${candidateV03.sdkTreeSha256}/${candidateV03.sdkTreeFileCount}/${candidateV03.sdkTreeBytes}, got ${tree.sha256}/${tree.fileCount}/${tree.totalBytes}`,
    );
  }
  if (packageManifest.name !== "@oxhq/stasis" || packageManifest.version !== candidateV03.version) {
    throw new Error("Candidate SDK package manifest identity mismatch");
  }
  return Object.freeze({ archiveSha256, tree: Object.freeze(tree), packageRoot });
}

export async function loadVerifiedCandidateV03Sdk() {
  await assertCandidateV03Sdk();
  const entryPath = path.join(candidateV03PackageRoot, "dist", "index.js");
  const sdk = await import(pathToFileURL(entryPath).href);
  if (
    typeof sdk.launch !== "function" ||
    typeof sdk.crawlWithStasis !== "function" ||
    typeof sdk.createStasisSessionPool !== "function" ||
    sdk.CONTROLLED_WEB_SESSION_V2_PROFILE !== candidateV03.profile
  ) {
    throw new Error("Candidate SDK public export contract mismatch");
  }
  return Object.freeze({
    launch: sdk.launch,
    crawlWithStasis: sdk.crawlWithStasis,
    createStasisSessionPool: sdk.createStasisSessionPool,
    CONTROLLED_WEB_SESSION_V2_PROFILE: sdk.CONTROLLED_WEB_SESSION_V2_PROFILE,
  });
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
