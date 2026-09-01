import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { artifactRoot } from "../shared/io.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/u;

export function createWildRunGeneration(root = artifactRoot()) {
  const generation = {
    schema: "stasis-wild-run-generation-v1",
    nonceSha256: freshNonceSha256(),
    artifactRootPathSha256: wildArtifactRootPathSha256(root),
  };
  return Object.freeze(generation);
}

export function assertWildRunGeneration(value, root = artifactRoot()) {
  const expectedKeys = ["artifactRootPathSha256", "nonceSha256", "schema"];
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), expectedKeys) ||
    value.schema !== "stasis-wild-run-generation-v1" ||
    !sha256Pattern.test(value.nonceSha256 ?? "") ||
    !sha256Pattern.test(value.artifactRootPathSha256 ?? "")
  ) {
    throw new Error("Wild run generation has an invalid shape");
  }
  if (value.artifactRootPathSha256 !== wildArtifactRootPathSha256(root)) {
    throw new Error("Wild run generation is bound to a different canonical artifact root");
  }
  return value;
}

export function wildArtifactRootPathSha256(root = artifactRoot()) {
  if (typeof root !== "string" || root.length === 0 || !path.isAbsolute(root)) {
    throw new Error("Wild run generation requires one explicit absolute artifact root");
  }
  const resolved = path.resolve(root).replaceAll("\\", "/").normalize("NFC");
  const canonical = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  return sha256(Buffer.from(canonical, "utf8"));
}

export function freshNonceSha256() {
  return sha256(randomBytes(32));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
