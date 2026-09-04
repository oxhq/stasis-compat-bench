import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertNavigationCausalContractAssets,
  assertNavigationCausalV4SelectionBinding,
  assertNavigationCausalWorkflowMirror,
  navigationCausalExpectedJobStepTopology,
} from "../src/performance/navigation-causal-contract.mjs";
import {
  navigationCausalPublicationAssetNames,
} from "../src/performance/navigation-causal-publication.mjs";

const protocolRoot = new URL("../protocol/", import.meta.url);

test("the V4 selection binding is exact canonical preregistration input", async () => {
  const bytes = await readFile(new URL(
    "../protocol/stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1.json",
    import.meta.url,
  ));
  const value = JSON.parse(bytes);
  assertNavigationCausalV4SelectionBinding(value);
  assert.equal(`${JSON.stringify(value, null, 2)}\n`, bytes.toString("utf8"));
  assert.equal(value.selection.ordinal, 10);
  assert.equal(value.interpretation.v4TimingImportedIntoCausalStatistics, false);
});

test("both job step topologies are frozen before observation", () => {
  for (const lane of ["host-a", "host-b"]) {
    const steps = navigationCausalExpectedJobStepTopology[lane];
    assert.deepEqual(steps.map(({ number }) => number), [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 33, 34, 35,
    ]);
    assert.equal(steps[0].name, "Set up job");
    assert.equal(steps.at(-1).name, "Complete job");
  }
});

test("the contract workflow mirror must equal the exact S5 bytes", async () => {
  const bytes = await readFile(new URL(
    "../protocol/stasis-v0.3.3-performance-navigation-causal-workflow-v1.yml",
    import.meta.url,
  ));
  assert.strictEqual(assertNavigationCausalWorkflowMirror(bytes), bytes);
  const changed = Buffer.from(bytes);
  changed[20] ^= 1;
  assert.throws(() => assertNavigationCausalWorkflowMirror(changed));
});

test("the four contract assets have one exact byte inventory", async () => {
  const names = [
    "stasis-v0.3.3-performance-navigation-causal-v1.md",
    "stasis-v0.3.3-performance-navigation-causal-preflight-v1.json",
    "stasis-v0.3.3-performance-navigation-causal-workflow-v1.yml",
    "stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v1.json",
  ];
  const assets = Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    await readFile(new URL(name, protocolRoot)),
  ])));
  assert.strictEqual(assertNavigationCausalContractAssets(assets), assets);
  const extra = { ...assets, "extra.txt": Buffer.from("extra") };
  assert.throws(() => assertNavigationCausalContractAssets(extra));
  const changed = { ...assets, [names[0]]: Buffer.from(assets[names[0]]) };
  changed[names[0]][10] ^= 1;
  assert.throws(() => assertNavigationCausalContractAssets(changed));
});

test("the preregistered evidence inventory exactly matches the publication builder", async () => {
  const preflight = JSON.parse(await readFile(new URL(
    "../protocol/stasis-v0.3.3-performance-navigation-causal-preflight-v1.json",
    import.meta.url,
  )));
  assert.deepEqual(preflight.evidenceReleaseAssetNames, navigationCausalPublicationAssetNames);
});
