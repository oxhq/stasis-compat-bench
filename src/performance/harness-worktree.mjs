import { isDeepStrictEqual } from "node:util";

export const cleanHarnessWorktreeEvidence = deepFreeze({
  schema: "stasis-performance-harness-worktree-v1",
  clean: true,
  statusFormat: "porcelain-v1-z",
  untrackedFiles: "all",
  ignoredFiles: "excluded",
  statusEntryCount: 0,
});

export function createCleanHarnessWorktreeEvidence(statusOutput) {
  if (typeof statusOutput !== "string" && !Buffer.isBuffer(statusOutput)) {
    throw new TypeError("Git worktree status output must be a string or Buffer");
  }
  if (statusOutput.length !== 0) {
    throw new Error(
      "Benchmark harness checkout must match HEAD with no tracked or untracked non-ignored changes",
    );
  }
  return structuredClone(cleanHarnessWorktreeEvidence);
}

export function assertCleanHarnessWorktreeEvidence(value) {
  if (!isDeepStrictEqual(value, cleanHarnessWorktreeEvidence)) {
    throw new TypeError("Benchmark harness clean-worktree evidence is invalid");
  }
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
