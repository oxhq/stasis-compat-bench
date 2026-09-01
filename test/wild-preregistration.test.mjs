import assert from "node:assert/strict";
import test from "node:test";

import {
  assertWildPreregistration,
  validateWildPreregistration,
} from "../src/wild/preregistration.mjs";
import { runWildPreflight, validateSourceMetadata } from "../src/wild/preflight.mjs";
import { expectedVersions, trancoSourceIdentity } from "../src/wild/config.mjs";

const commit = "a".repeat(40);

test("wild preregistration requires a canonical exact commit before consulting Git", async () => {
  let gitCalls = 0;
  await assert.rejects(
    () => assertWildPreregistration({
      expectedCommit: "A".repeat(40),
      runGit: async () => {
        gitCalls += 1;
        return "";
      },
    }),
    /canonical 40-hex commit/u,
  );
  assert.equal(gitCalls, 0);
});

test("wild preregistration binds HEAD and rejects staged, modified, or untracked state", () => {
  assert.equal(validateWildPreregistration({ expectedCommit: commit, head: `${commit}\n`, status: "" }), commit);
  assert.throws(
    () => validateWildPreregistration({ expectedCommit: commit, head: `${"b".repeat(40)}\n`, status: "" }),
    /commit mismatch/u,
  );
  for (const status of [
    "M  protocol/stasis-post-0.3-census-v1.md\n",
    " M src/wild/preflight.mjs\n",
    "?? untracked.txt\n",
  ]) {
    assert.throws(
      () => validateWildPreregistration({ expectedCommit: commit, head: commit, status }),
      /clean preregistered worktree and index/u,
    );
  }
});

test("wild preregistration runs exact clean-status checks and returns the frozen commit", async () => {
  const calls = [];
  const result = await assertWildPreregistration({
    expectedCommit: commit,
    runGit: async (args) => {
      calls.push(args);
      return args[0] === "rev-parse" ? Buffer.from(`${commit}\n`) : Buffer.alloc(0);
    },
  });
  assert.equal(result, commit);
  assert.deepEqual(calls, [
    ["rev-parse", "HEAD"],
    ["status", "--porcelain=v1", "--untracked-files=all", "--ignored=no"],
  ]);
});

test("preflight stops at preregistration before inspecting or observing any target", async () => {
  let downstreamCalls = 0;
  await assert.rejects(
    () => runWildPreflight({
      preregister: async () => {
        throw new Error("preregistration rejected");
      },
      inspect: async () => {
        downstreamCalls += 1;
      },
      robots: async () => {
        downstreamCalls += 1;
      },
      observe: async () => {
        downstreamCalls += 1;
      },
    }),
    /preregistration rejected/u,
  );
  assert.equal(downstreamCalls, 0);
});

test("preflight rejects an invalid injected preregistration result before downstream work", async () => {
  let downstreamCalls = 0;
  await assert.rejects(
    () => runWildPreflight({
      preregister: async () => "not-a-commit",
      inspect: async () => {
        downstreamCalls += 1;
      },
    }),
    /invalid commit identity/u,
  );
  assert.equal(downstreamCalls, 0);
});

test("unsafe source metadata fails before any public target observation", async () => {
  assert.doesNotThrow(() => validateSourceMetadata(structuredClone(trancoSourceIdentity)));
  let downstreamCalls = 0;
  await assert.rejects(
    () => runWildPreflight({
      preregister: async () => commit,
      ensureOutputsAbsent: async () => undefined,
      runtimeVersion: expectedVersions.node,
      readSourceMetadata: async () => ({
        ...structuredClone(trancoSourceIdentity),
        downloadUrl: "https://user:secret@tranco-list.eu/download/74V4X/1000000?opaque=1",
      }),
      inspect: async () => {
        downstreamCalls += 1;
      },
      robots: async () => {
        downstreamCalls += 1;
      },
      observe: async () => {
        downstreamCalls += 1;
      },
    }),
    /Invalid frozen Tranco source metadata/u,
  );
  assert.equal(downstreamCalls, 0);
});
