import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parsePerformanceReplicationCommand,
  performanceReplicationCliReceiptSchema,
  renderPerformanceReplicationMarkdown,
  runPerformanceReplicationCli,
} from "../src/performance/replication-cli.mjs";
import {
  performanceReplicationVerificationSchema,
} from "../src/performance/replication.mjs";
import {
  performanceReplicationExpectedArtifactNames,
} from "../src/performance/replication-hosted-provenance.mjs";

test("parser accepts only the three exact absolute and pairwise-distinct contracts", () => {
  const root = path.resolve("replication-cli-contract");
  const rawArgs = [
    "verify-raws",
    ...[
      "original-rwa", "original-crawl", "original-combined",
      "fresh-rwa", "fresh-crawl", "fresh-combined", "receipt", "report",
    ]
      .map((name) => path.join(root, `${name}.json`)),
  ];
  const hostedArgs = [
    "verify-hosted",
    ...[
      "run", "workflow-runs", "jobs", "artifacts",
      "contract-release", "contract-commit", "hosted-receipt",
    ]
      .map((name) => path.join(root, `${name}.json`)),
  ];
  const artifactArgs = [
    "verify-artifacts",
    path.join(root, "semantic-receipt.json"),
    path.join(root, "hosted-receipt.json"),
    ...performanceReplicationExpectedArtifactNames.map((_name, index) =>
      path.join(root, `artifact-${index}.zip`)),
    path.join(root, "artifact-binding.json"),
  ];

  assert.equal(parsePerformanceReplicationCommand(rawArgs).command, "verify-raws");
  assert.equal(parsePerformanceReplicationCommand(hostedArgs).command, "verify-hosted");
  assert.equal(
    parsePerformanceReplicationCommand(artifactArgs).command,
    "verify-artifacts",
  );
  assert.throws(() => parsePerformanceReplicationCommand(rawArgs.slice(0, -1)), /Usage:/u);
  const relative = [...rawArgs];
  relative[1] = "relative.json";
  assert.throws(
    () => parsePerformanceReplicationCommand(relative),
    /explicit absolute path/u,
  );
  const duplicate = [...rawArgs];
  duplicate[8] = duplicate[7];
  assert.throws(
    () => parsePerformanceReplicationCommand(duplicate),
    /paths must all be distinct/u,
  );
  const hostedDuplicate = [...hostedArgs];
  hostedDuplicate[7] = hostedDuplicate[6];
  assert.throws(
    () => parsePerformanceReplicationCommand(hostedDuplicate),
    /paths must all be distinct/u,
  );
  const artifactDuplicate = [...artifactArgs];
  artifactDuplicate[10] = artifactDuplicate[9];
  assert.throws(
    () => parsePerformanceReplicationCommand(artifactDuplicate),
    /paths must all be distinct/u,
  );
});

test("raw mode reads six buffers once and promotes deterministic no-clobber outputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-replication-cli-"));
  try {
    const inputNames = [
      "original-rwa", "original-crawl", "original-combined",
      "fresh-rwa", "fresh-crawl", "fresh-combined",
    ];
    const paths = Object.fromEntries(
      [...inputNames, "receipt", "report"]
        .map((name) => [name, path.join(root, `${name}.json`)]),
    );
    const inputValues = Object.fromEntries(inputNames.map((name) => [name, { kind: name }]));
    for (const name of inputNames) {
      await writeFile(paths[name], canonicalText(inputValues[name]), "utf8");
    }
    const readCounts = new Map();
    const readBytes = async (filePath) => {
      readCounts.set(filePath, (readCounts.get(filePath) ?? 0) + 1);
      return readFile(filePath);
    };
    const expectedOriginalDigests = fixtureOriginalDigests(inputValues);
    const verifyRaws = (value) => {
      assert.deepEqual(value, {
        original: {
          rwaArtifact: inputValues["original-rwa"],
          crawlRaw: inputValues["original-crawl"],
        },
        fresh: {
          rwaArtifact: inputValues["fresh-rwa"],
          crawlRaw: inputValues["fresh-crawl"],
        },
      });
      return replicationReceipt();
    };
    const combinedCalls = [];
    const assertCombined = (combined, raws) => {
      combinedCalls.push({ combined, raws });
      return combined;
    };
    const output = [];
    const args = [
      "verify-raws",
      paths["original-rwa"],
      paths["original-crawl"],
      paths["original-combined"],
      paths["fresh-rwa"],
      paths["fresh-crawl"],
      paths["fresh-combined"],
      paths.receipt,
      paths.report,
    ];
    const result = await runPerformanceReplicationCli(args, {
      readBytes,
      expectedOriginalDigests,
      verifyRaws,
      assertCombined,
      writeOutput: (value) => output.push(value),
    });

    assert.deepEqual(
      [...readCounts.entries()].map(([filePath, count]) => [path.basename(filePath), count]).sort(),
      inputNames.map((name) => [`${name}.json`, 1]).sort(),
    );
    assert.deepEqual(combinedCalls, [
      {
        combined: inputValues["original-combined"],
        raws: {
          rwaRaw: inputValues["original-rwa"].authorityRaw,
          crawlRaw: inputValues["original-crawl"],
        },
      },
      {
        combined: inputValues["fresh-combined"],
        raws: {
          rwaRaw: inputValues["fresh-rwa"].authorityRaw,
          crawlRaw: inputValues["fresh-crawl"],
        },
      },
    ]);
    assert.equal(result.receipt.fileBoundary.originalAssetSha256Verified, true);
    assert.equal(result.receipt.fileBoundary.canonicalJsonVerified, true);
    assert.equal(
      result.receipt.fileBoundary.outputCreation,
      "fsynced_sibling_temp_no_clobber_link",
    );
    assert.equal(result.receipt.fileBoundary.authoritativeReceiptPromotedLast, true);
    for (const generation of ["original", "fresh"]) {
      for (const kind of ["rwa", "crawl", "combined"]) {
        const identity = result.receipt.fileBoundary.inputs[generation][kind];
        const name = `${generation}-${kind === "combined" ? "combined" : kind}`;
        assert.equal(identity.bytes, Buffer.byteLength(canonicalText(inputValues[name])));
        assert.equal(identity.sha256, digest(canonicalText(inputValues[name])));
      }
    }
    assert.equal(result.cliReceipt.schema, performanceReplicationCliReceiptSchema);
    assert.equal(
      await readFile(paths.receipt, "utf8"),
      `${JSON.stringify(result.receipt, null, 2)}\n`,
    );
    assert.equal(await readFile(paths.report, "utf8"), result.markdown);
    assert.equal(output.join(""), `${JSON.stringify(result.cliReceipt, null, 2)}\n`);

    await assert.rejects(
      () => runPerformanceReplicationCli(args, {
        readBytes,
        expectedOriginalDigests,
        verifyRaws: () => replicationReceipt(),
        assertCombined,
        writeOutput: () => undefined,
      }),
      (error) => error?.code === "EEXIST",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raw mode rejects a wrong original combined hash before verification", async () => {
  const root = path.resolve("wrong-original-boundary");
  let verifies = 0;
  const inputNames = [
    "original-rwa", "original-crawl", "original-combined",
    "fresh-rwa", "fresh-crawl", "fresh-combined",
  ];
  const values = Object.fromEntries(inputNames.map((name) => [name, { kind: name }]));
  const expectedOriginalDigests = fixtureOriginalDigests(values);
  expectedOriginalDigests.combinedEvidenceJson = "0".repeat(64);
  const args = [
    "verify-raws",
    ...[...inputNames, "receipt", "report"]
      .map((name) => path.join(root, `${name}.json`)),
  ];
  await assert.rejects(
    () => runPerformanceReplicationCli(args, {
      readBytes: async (filePath) => Buffer.from(canonicalText(values[path.basename(filePath, ".json")])),
      expectedOriginalDigests,
      verifyRaws: () => {
        verifies += 1;
        return replicationReceipt();
      },
    }),
    /original combined evidence bytes/u,
  );
  assert.equal(verifies, 0);
});

test("raw mode rejects noncanonical bytes from its single read", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-replication-canonical-"));
  try {
    const names = [
      "original-rwa", "original-crawl", "original-combined",
      "fresh-rwa", "fresh-crawl", "fresh-combined",
    ];
    const inputs = names
      .map((name) => path.join(root, `${name}.json`));
    await Promise.all(inputs.map((filePath, index) =>
      writeFile(filePath, index === 5 ? "{ }\n" : canonicalText({ index }), "utf8")
    ));
    const originals = {
      "original-rwa": { index: 0 },
      "original-crawl": { index: 1 },
      "original-combined": { index: 2 },
    };
    await assert.rejects(
      () => runPerformanceReplicationCli([
        "verify-raws",
        ...inputs,
        path.join(root, "receipt.json"),
        path.join(root, "report.md"),
      ], {
        expectedOriginalDigests: fixtureOriginalDigests(originals),
        verifyRaws: () => {
          throw new Error("verifier must not receive noncanonical JSON");
        },
        writeOutput: () => undefined,
      }),
      /fresh combined evidence is not canonical deterministic JSON/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("raw mode rejects a fresh combined artifact that does not replay from its fresh raws", async () => {
  const root = path.resolve("fresh-combined-mismatch");
  const names = [
    "original-rwa", "original-crawl", "original-combined",
    "fresh-rwa", "fresh-crawl", "fresh-combined",
  ];
  const values = Object.fromEntries(names.map((name) => [name, {
    kind: name,
    ...(name.endsWith("rwa") ? { authorityRaw: { generation: name } } : {}),
  }]));
  const args = [
    "verify-raws",
    ...[...names, "receipt", "report"].map((name) => path.join(root, `${name}.json`)),
  ];
  let combinedCalls = 0;
  await assert.rejects(
    () => runPerformanceReplicationCli(args, {
      readBytes: async (filePath) => Buffer.from(canonicalText(values[path.basename(filePath, ".json")])),
      expectedOriginalDigests: fixtureOriginalDigests(values),
      verifyRaws: () => replicationReceipt(),
      assertCombined() {
        combinedCalls += 1;
        if (combinedCalls === 2) {
          throw new TypeError("Combined performance evidence does not replay exactly");
        }
      },
      writeOutput: () => undefined,
    }),
    /does not replay exactly/u,
  );
  assert.equal(combinedCalls, 2);
});

test("hosted mode reads and hashes all six canonical REST records once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-replication-hosted-cli-"));
  try {
    const inputNames = [
      "run", "workflow-runs", "jobs", "artifacts", "contract-release", "contract-commit",
    ];
    const inputPaths = Object.fromEntries(
      inputNames.map((name) => [name, path.join(root, `${name}.json`)]),
    );
    const outputPath = path.join(root, "receipt.json");
    const inputValues = Object.fromEntries(
      inputNames.map((name) => [name, { kind: name }]),
    );
    for (const name of inputNames) {
      await writeFile(inputPaths[name], canonicalText(inputValues[name]), "utf8");
    }
    const readCounts = new Map();
    const readBytes = async (filePath) => {
      readCounts.set(filePath, (readCounts.get(filePath) ?? 0) + 1);
      return readFile(filePath);
    };
    const hostedReceipt = Object.freeze({
      schema: "stasis-v0.3.3-performance-replication-hosted-provenance-v1",
      status: "passed",
    });
    let received;
    const result = await runPerformanceReplicationCli([
      "verify-hosted",
      inputPaths.run,
      inputPaths["workflow-runs"],
      inputPaths.jobs,
      inputPaths.artifacts,
      inputPaths["contract-release"],
      inputPaths["contract-commit"],
      outputPath,
    ], {
      readBytes,
      verifyHosted(value) {
        received = value;
        return hostedReceipt;
      },
      writeOutput: () => undefined,
    });
    assert.deepEqual(received, {
      runRecord: { kind: "run" },
      workflowRunsListing: { kind: "workflow-runs" },
      jobsListing: { kind: "jobs" },
      artifactsListing: { kind: "artifacts" },
      contractReleaseRecord: { kind: "contract-release" },
      contractCommitRecord: { kind: "contract-commit" },
    });
    assert.deepEqual(
      [...readCounts.entries()].map(([filePath, count]) => [path.basename(filePath), count]).sort(),
      inputNames.map((name) => [`${name}.json`, 1]).sort(),
    );
    const boundaryNames = {
      run: "run",
      workflowRuns: "workflow-runs",
      jobs: "jobs",
      artifacts: "artifacts",
      contractRelease: "contract-release",
      contractCommit: "contract-commit",
    };
    for (const [boundaryName, inputName] of Object.entries(boundaryNames)) {
      assert.deepEqual(result.cliReceipt.fileBoundary.inputs[boundaryName], {
        bytes: Buffer.byteLength(canonicalText(inputValues[inputName])),
        sha256: digest(canonicalText(inputValues[inputName])),
      });
    }
    assert.equal(result.cliReceipt.fileBoundary.canonicalJsonVerified, true);
    assert.equal(result.cliReceipt.fileBoundary.allInputAndOutputPathsDistinct, true);
    assert.equal(
      result.cliReceipt.fileBoundary.outputCreation,
      "fsynced_sibling_temp_no_clobber_link",
    );
    assert.equal(result.receipt, hostedReceipt);
    assert.equal(await readFile(outputPath, "utf8"), `${JSON.stringify(hostedReceipt, null, 2)}\n`);
    await assert.rejects(
      () => runPerformanceReplicationCli([
        "verify-hosted",
        inputPaths.run,
        inputPaths["workflow-runs"],
        inputPaths.jobs,
        inputPaths.artifacts,
        inputPaths["contract-release"],
        inputPaths["contract-commit"],
        outputPath,
      ], {
        readBytes,
        verifyHosted: () => hostedReceipt,
        writeOutput: () => undefined,
      }),
      (error) => error?.code === "EEXIST",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact mode joins two canonical receipts to all seven exact ZIP buffers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-replication-artifacts-cli-"));
  try {
    const semanticPath = path.join(root, "semantic.json");
    const hostedPath = path.join(root, "hosted.json");
    const outputPath = path.join(root, "binding.json");
    const semanticReceipt = { schema: "semantic-fixture", status: "passed" };
    const hostedReceipt = { schema: "hosted-fixture", status: "passed" };
    await writeFile(semanticPath, canonicalText(semanticReceipt), "utf8");
    await writeFile(hostedPath, canonicalText(hostedReceipt), "utf8");
    const archivePaths = [];
    const expectedArchives = {};
    for (const [index, name] of performanceReplicationExpectedArtifactNames.entries()) {
      const archivePath = path.join(root, `artifact-${index}.zip`);
      const bytes = Buffer.from(`exact-zip-${index}`, "utf8");
      await writeFile(archivePath, bytes);
      archivePaths.push(archivePath);
      expectedArchives[name] = bytes;
    }
    const readCounts = new Map();
    const readBytes = async (filePath) => {
      readCounts.set(filePath, (readCounts.get(filePath) ?? 0) + 1);
      return readFile(filePath);
    };
    const bindingReceipt = Object.freeze({
      schema: "stasis-v0.3.3-performance-replication-artifact-binding-v1",
      status: "passed",
    });
    const result = await runPerformanceReplicationCli([
      "verify-artifacts",
      semanticPath,
      hostedPath,
      ...archivePaths,
      outputPath,
    ], {
      readBytes,
      bindArtifacts: ({
        semanticReceipt: suppliedSemantic,
        hostedReceipt: suppliedHosted,
        artifactZipBytes,
      }) => {
        assert.deepEqual(suppliedSemantic, semanticReceipt);
        assert.deepEqual(suppliedHosted, hostedReceipt);
        assert.deepEqual(Object.keys(artifactZipBytes), performanceReplicationExpectedArtifactNames);
        for (const name of performanceReplicationExpectedArtifactNames) {
          assert.equal(artifactZipBytes[name].equals(expectedArchives[name]), true);
        }
        return bindingReceipt;
      },
      writeOutput: () => {},
    });
    for (const inputPath of [semanticPath, hostedPath, ...archivePaths]) {
      assert.equal(readCounts.get(inputPath), 1);
    }
    assert.equal(result.receipt, bindingReceipt);
    assert.equal(
      await readFile(outputPath, "utf8"),
      `${JSON.stringify(bindingReceipt, null, 2)}\n`,
    );
    assert.equal(result.cliReceipt.command, "verify-artifacts");
    assert.equal(
      result.cliReceipt.fileBoundary.outputCreation,
      "fsynced_sibling_temp_no_clobber_link",
    );
    assert.deepEqual(result.cliReceipt.fileBoundary.inputs.semanticReceipt, {
      bytes: Buffer.byteLength(canonicalText(semanticReceipt)),
      sha256: digest(canonicalText(semanticReceipt)),
    });
    assert.deepEqual(result.cliReceipt.fileBoundary.inputs.hostedReceipt, {
      bytes: Buffer.byteLength(canonicalText(hostedReceipt)),
      sha256: digest(canonicalText(hostedReceipt)),
    });
    await assert.rejects(
      () => runPerformanceReplicationCli([
        "verify-artifacts",
        semanticPath,
        hostedPath,
        ...archivePaths,
        outputPath,
      ], {
        readBytes,
        bindArtifacts: () => bindingReceipt,
        writeOutput: () => {},
      }),
      /EEXIST/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Markdown deterministically reports each host and statistic without a pooled claim", () => {
  const receipt = replicationReceipt();
  const first = renderPerformanceReplicationMarkdown(receipt);
  const second = renderPerformanceReplicationMarkdown(receipt);
  assert.equal(first, second);
  assert.equal(first, [
    "# Stasis v0.3.3 performance replication",
    "",
    "The original and fresh results below are separate single-host observations. No samples are pooled across hosts or tracks. This evidence does not authorize a generalized speed claim or product implementation work.",
    "",
    "## RWA: Cypress versus Stasis",
    "",
    "Protocol: `protocol_valid`. Scientific identity: `matching`.",
    "",
    "### Published original",
    "",
    "- Host: `win32/x64`; runner image `windows-2022 1`; CPU `CPU A`; logical CPUs `4`.",
    "- Host binding: `instanceDigest=1111`.",
    "- Workflow run: `33851425108`, attempt `1`, job `windows-rwa`.",
    "- Cypress median / IQR: 17.000000 ms / 1.000000 ms.",
    "- Stasis median / IQR: 4.000000 ms / 0.500000 ms.",
    "- Median paired Cypress-over-Stasis ratio: 4.250000x (`baseline_slower_than_stasis`).",
    "",
    "### Fresh replication",
    "",
    "- Host: `win32/x64`; runner image `windows-2022 2`; CPU `CPU B`; logical CPUs `4`.",
    "- Host binding: `instanceDigest=2222`.",
    "- Workflow run: `33860000000`, attempt `1`, job `windows-rwa`.",
    "- Cypress median / IQR: 18.000000 ms / 1.200000 ms.",
    "- Stasis median / IQR: 4.100000 ms / 0.600000 ms.",
    "- Median paired Cypress-over-Stasis ratio: 4.390244x (`baseline_slower_than_stasis`).",
    "",
    "Fresh ratio relation to 1: `greater_than_one`.",
    "Outcome: `PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT`.",
    "",
    "## Deterministic crawl: Crawlee versus Stasis",
    "",
    "Protocol: `protocol_valid`. Scientific identity: `matching`.",
    "",
    "### Published original",
    "",
    "- Host: `linux/x64`; runner image `ubuntu22 1`; CPU `CPU C`; logical CPUs `4`.",
    "- Host binding: `bootInstanceDigest=3333`.",
    "- Workflow run: `33851425108`, attempt `1`, job `ubuntu-crawl`.",
    "- Crawlee median / IQR: 2.100000 ms / 0.100000 ms.",
    "- Stasis median / IQR: 2.300000 ms / 0.200000 ms.",
    "- Median paired Crawlee-over-Stasis ratio: 0.913043x (`baseline_faster_than_stasis`).",
    "",
    "### Fresh replication",
    "",
    "- Host: `linux/x64`; runner image `ubuntu22 2`; CPU `CPU D`; logical CPUs `4`.",
    "- Host binding: `bootInstanceDigest=4444`.",
    "- Workflow run: `33860000000`, attempt `1`, job `ubuntu-crawl`.",
    "- Crawlee median / IQR: 2.200000 ms / 0.150000 ms.",
    "- Stasis median / IQR: 2.400000 ms / 0.250000 ms.",
    "- Median paired Crawlee-over-Stasis ratio: 0.916667x (`baseline_faster_than_stasis`).",
    "",
    "Fresh ratio relation to 1: `less_than_one`.",
    "Outcome: `PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT`.",
    "",
    "Decision state: `STAY_0_4_UNASSIGNED`.",
    "",
  ].join("\n"));
  assert.equal(/pooled median|general speed claim is authorized/iu.test(first), false);
});

test("Markdown safely contains hostile host fields inside variable-length code spans", () => {
  const receipt = replicationReceipt();
  receipt.tracks.rwa.observations.fresh.host.cpuModel =
    "CPU `one``two```\n## forged heading\n<img src=x onerror=alert(1)>";
  receipt.tracks.rwa.observations.fresh.host.imageOs =
    "windows``](javascript:alert(2))";
  receipt.tracks.crawl.observations.original.host.imageVersion =
    "1`\n- forged list item";

  const markdown = renderPerformanceReplicationMarkdown(receipt);

  assert.equal(/^## forged heading$/mu.test(markdown), false);
  assert.equal(/^- forged list item$/mu.test(markdown), false);
  assert.equal(/^<img src=x onerror=alert\(1\)>$/mu.test(markdown), false);
  assert.match(
    markdown,
    /CPU ````CPU `one``two``` ## forged heading <img src=x onerror=alert\(1\)>````;/u,
  );
  assert.match(
    markdown,
    /runner image ```windows``\]\(javascript:alert\(2\)\) 2```;/u,
  );
  assert.match(markdown, /runner image ``ubuntu22 1` - forged list item``;/u);
  assert.equal(markdown, renderPerformanceReplicationMarkdown(receipt));
});

function canonicalText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fixtureOriginalDigests(values) {
  return {
    rwaRawJson: digest(canonicalText(values["original-rwa"])),
    crawlRawJson: digest(canonicalText(values["original-crawl"])),
    combinedEvidenceJson: digest(canonicalText(values["original-combined"])),
  };
}

function replicationReceipt() {
  const workflow = (runId) => ({
    provider: "github-actions",
    repository: "oxhq/stasis",
    workflow: "Stasis v0.3.3 performance evidence",
    runId,
    runAttempt: "1",
    workflowSourceSha: "a".repeat(40),
    workflowSourceRef: "refs/heads/codex/stasis-v033-performance-evidence",
    jobs: { rwa: "windows-rwa", crawl: "ubuntu-crawl" },
  });
  const host = (platform, imageVersion, cpuModel, digestField, digest) => ({
    platform,
    arch: "x64",
    runnerOs: platform === "win32" ? "Windows" : "Linux",
    imageOs: platform === "win32" ? "windows-2022" : "ubuntu22",
    imageVersion,
    cpuModel,
    logicalCpuCount: 4,
    [digestField]: digest,
    [platform === "win32" ? "identityDigest" : "hostClassDigest"]: "f".repeat(64),
  });
  const statistics = (baseline, median, iqr, stasisMedian, stasisIqr, ratio) => ({
    [baseline]: { medianMilliseconds: median, iqrMilliseconds: iqr },
    stasis: { medianMilliseconds: stasisMedian, iqrMilliseconds: stasisIqr },
    pairedBaselineOverCandidate: { decimal: ratio },
  });
  const observation = (
    hostValue,
    digestField,
    workflowValue,
    statisticsValue,
    ratioDirection,
  ) => ({
    workflow: workflowValue,
    host: hostValue,
    hostBinding: { field: digestField, digest: hostValue[digestField] },
    statistics: statisticsValue,
    ratioDirection,
  });
  return {
    schema: performanceReplicationVerificationSchema,
    protocolStatus: "protocol_valid",
    pooling: "none",
    claimBoundary: "two_separate_single_host_observations_only",
    decisionState: "STAY_0_4_UNASSIGNED",
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    tracks: {
      rwa: {
        protocolStatus: "protocol_valid",
        scientificIdentityStatus: "matching",
        baseline: "cypress",
        observations: {
          original: observation(
            host("win32", "1", "CPU A", "instanceDigest", "1111"),
            "instanceDigest",
            workflow("33851425108"),
            statistics("cypress", "17.000000", "1.000000", "4.000000", "0.500000", "4.250000"),
            "baseline_slower_than_stasis",
          ),
          fresh: observation(
            host("win32", "2", "CPU B", "instanceDigest", "2222"),
            "instanceDigest",
            workflow("33860000000"),
            statistics("cypress", "18.000000", "1.200000", "4.100000", "0.600000", "4.390244"),
            "baseline_slower_than_stasis",
          ),
        },
        freshRatioRelationToOne: "greater_than_one",
        outcome: "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT",
      },
      crawl: {
        protocolStatus: "protocol_valid",
        scientificIdentityStatus: "matching",
        baseline: "crawlee",
        observations: {
          original: observation(
            host("linux", "1", "CPU C", "bootInstanceDigest", "3333"),
            "bootInstanceDigest",
            workflow("33851425108"),
            statistics("crawlee", "2.100000", "0.100000", "2.300000", "0.200000", "0.913043"),
            "baseline_faster_than_stasis",
          ),
          fresh: observation(
            host("linux", "2", "CPU D", "bootInstanceDigest", "4444"),
            "bootInstanceDigest",
            workflow("33860000000"),
            statistics("crawlee", "2.200000", "0.150000", "2.400000", "0.250000", "0.916667"),
            "baseline_faster_than_stasis",
          ),
        },
        freshRatioRelationToOne: "less_than_one",
        outcome: "PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT",
      },
    },
  };
}
