import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { repairedRerunIdentity } from "./config.mjs";
import { repositoryRoot, sha256File } from "../shared/io.mjs";

export async function assertRepairedRerunIdentity(value = repairedRerunIdentity) {
  if (!isDeepStrictEqual(value, repairedRerunIdentity)) {
    throw new Error("Wild repaired-run identity differs from the frozen erratum and prior attempt");
  }
  for (const erratum of [
    repairedRerunIdentity.erratum,
    repairedRerunIdentity.projectionErratum,
  ]) {
    const erratumPath = path.join(repositoryRoot, ...erratum.path.split("/"));
    const metadata = await lstat(erratumPath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size !== erratum.bytes ||
      !samePath(await realpath(erratumPath), erratumPath) ||
      await sha256File(erratumPath) !== erratum.sha256
    ) {
      throw new Error("Wild repaired-run erratum bytes differ from their frozen identity");
    }
  }
  return repairedRerunIdentity;
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
