import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertFrozenProjectedRwaCypressBaselineBytes,
  projectFrozenRwaCypressBaselineBytes,
  rwaCypressBaselineProjectionContract,
} from "../src/publication/rwa-baseline.mjs";

const projectedFixture = new URL(
  "./fixtures/publication/rwa-cypress-raw.json",
  import.meta.url,
);

test("frozen Cypress baseline projection has one exact privacy-preserving identity", async () => {
  const bytes = await readFile(projectedFixture);
  const baseline = assertFrozenProjectedRwaCypressBaselineBytes(bytes);

  assert.equal(Object.isFrozen(rwaCypressBaselineProjectionContract), true);
  assert.equal(Object.isFrozen(rwaCypressBaselineProjectionContract.source), true);
  assert.equal(Object.isFrozen(rwaCypressBaselineProjectionContract.projected), true);
  assert.equal(Object.isFrozen(baseline), true);
  assert.deepEqual(rwaCypressBaselineProjectionContract.changedJsonPointers, [
    "/source/preflight/root",
    "/source/postflight/root",
    "/invocation/configFile",
    "/invocation/project",
    "/invocation/spec",
  ]);
  assert.equal(baseline.source.preflight.root, "rwa-publication-root");
  assert.equal(baseline.source.postflight.root, "rwa-publication-root");
  assert.equal(baseline.invocation.configFile, "rwa-publication-root/cypress.config.ts");
  assert.equal(baseline.invocation.project, "rwa-publication-root");
  assert.equal(
    baseline.invocation.spec,
    "rwa-publication-root/cypress/tests/ui/auth.spec.ts",
  );
});

test("frozen Cypress baseline projection rejects altered and wrong-role bytes", async () => {
  const bytes = await readFile(projectedFixture);
  const altered = Buffer.from(bytes);
  altered[altered.indexOf(Buffer.from("rwa-publication-root", "utf8"))] ^= 1;
  assert.throws(
    () => assertFrozenProjectedRwaCypressBaselineBytes(altered),
    /frozen size and SHA-256/u,
  );
  assert.throws(
    () => projectFrozenRwaCypressBaselineBytes(bytes),
    /source RWA baseline differs from its frozen size and SHA-256/u,
  );
});
