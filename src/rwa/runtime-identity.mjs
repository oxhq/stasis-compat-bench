import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { listRegularFiles, sha256File } from "../shared/io.mjs";

export const RWA_GENERATED_RUNTIME_IDENTITY = deepFreeze({
  valid: true,
  files: [
    {
      path: "src/aws-exports.js",
      sourcePath: "scripts/mock-aws-exports.js",
      bytes: 597,
      sha256: "9964e06bade1826faf2676923983890049f5174a1409b73948033b4500930185",
      sourceBytes: 597,
      sourceSha256: "9964e06bade1826faf2676923983890049f5174a1409b73948033b4500930185",
      exactSourceCopy: true,
    },
    {
      path: "aws-exports-es5.js",
      sourcePath: "scripts/mock-aws-exports-es5.js",
      bytes: 604,
      sha256: "9fb4c3d1a163d4a2c132d67ea56683368b8f6317cbc0485bfbd5b0c59700395e",
      sourceBytes: 604,
      sourceSha256: "9fb4c3d1a163d4a2c132d67ea56683368b8f6317cbc0485bfbd5b0c59700395e",
      exactSourceCopy: true,
    },
  ],
});

export const RWA_RUNTIME_CACHE_IDENTITY = Object.freeze({
  path: "node_modules/.cache",
  regularFileCount: 0,
});

export const RWA_LOCAL_ENV_IDENTITY = Object.freeze({
  pattern: ".env*.local",
  matchedPaths: Object.freeze([]),
});

export const RWA_AMBIENT_OVERRIDE_IDENTITY = Object.freeze({
  presentNames: Object.freeze([]),
});

export async function inspectRwaGeneratedRuntimeFiles(root) {
  const files = [];
  for (const expected of RWA_GENERATED_RUNTIME_IDENTITY.files) {
    const filePath = path.join(root, ...expected.path.split("/"));
    const sourcePath = path.join(root, ...expected.sourcePath.split("/"));
    const [bytes, sourceBytes] = await Promise.all([readFile(filePath), readFile(sourcePath)]);
    files.push({
      path: expected.path,
      sourcePath: expected.sourcePath,
      bytes: bytes.length,
      sha256: await sha256File(filePath),
      sourceBytes: sourceBytes.length,
      sourceSha256: await sha256File(sourcePath),
      exactSourceCopy: bytes.equals(sourceBytes),
    });
  }
  const evidence = { valid: false, files };
  evidence.valid = isDeepStrictEqual(
    { ...evidence, valid: true },
    RWA_GENERATED_RUNTIME_IDENTITY,
  );
  return evidence;
}

export async function assertRwaGeneratedRuntimeFiles(root) {
  const evidence = await inspectRwaGeneratedRuntimeFiles(root);
  if (!evidence.valid) {
    throw new Error("Generated RWA runtime modules differ from their frozen tracked sources");
  }
  return evidence;
}

export async function inspectRwaRuntimeCache(root) {
  const cacheRoot = path.join(root, "node_modules", ".cache");
  let regularFileCount = 0;
  try {
    regularFileCount = (await listRegularFiles(cacheRoot)).length;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { path: RWA_RUNTIME_CACHE_IDENTITY.path, regularFileCount };
}

export async function assertRwaRuntimeCacheEmpty(root) {
  const evidence = await inspectRwaRuntimeCache(root);
  if (!isDeepStrictEqual(evidence, RWA_RUNTIME_CACHE_IDENTITY)) {
    throw new Error("RWA runtime cache must contain zero regular files");
  }
  return evidence;
}

export async function inspectRwaLocalEnvironmentFiles(root) {
  const matchedPaths = (await readdir(root))
    .filter((name) => /^\.env.*\.local$/iu.test(name))
    .sort();
  return { pattern: RWA_LOCAL_ENV_IDENTITY.pattern, matchedPaths };
}

export async function assertRwaLocalEnvironmentFilesAbsent(root) {
  const evidence = await inspectRwaLocalEnvironmentFiles(root);
  if (!isDeepStrictEqual(evidence, RWA_LOCAL_ENV_IDENTITY)) {
    throw new Error("Ignored local RWA environment files are not permitted");
  }
  return evidence;
}

export function inspectRwaAmbientOverrides(environment = process.env) {
  const presentNames = Object.keys(environment)
    .filter((name) => /^(?:AUTH0_|AWS_|BACKEND_PORT$|CYPRESS_|GOOGLE_|NODE_OPTIONS$|NODE_PATH$|NYC_|OKTA_|PAGINATION_PAGE_SIZE$|PORT$|SEED_|TS_NODE_|VITE_)/iu.test(name))
    .sort();
  return { presentNames };
}

export function assertRwaAmbientOverridesAbsent(environment = process.env) {
  const evidence = inspectRwaAmbientOverrides(environment);
  if (!isDeepStrictEqual(evidence, RWA_AMBIENT_OVERRIDE_IDENTITY)) {
    throw new Error("Ambient environment contains an RWA/Cypress behavior override");
  }
  return evidence;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
