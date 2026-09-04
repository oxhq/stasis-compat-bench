import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { jsonReplacer } from "../src/shared/io.mjs";
import {
  assertCrawlPhaseDiagnosticVerificationReceipt,
  crawlPhaseDiagnosticVerificationFileNames,
  crawlPhaseDiagnosticVerificationSchema,
  verifyCrawlPhaseDiagnosticArtifactSet,
} from "../src/performance/crawl-phase-diagnostic-verification.mjs";
import {
  crawlPhaseDiagnosticVerificationCliSchema,
  crawlPhaseDiagnosticVerificationOutputName,
  parseCrawlPhaseDiagnosticVerificationCommand,
  runCrawlPhaseDiagnosticVerificationCli,
} from "../src/performance/crawl-phase-diagnostic-verification-cli.mjs";

function fixtureValues() {
  const crawlee = {
    schema: "diagnostic-fixture",
    lane: "crawlee",
    job: { lane: "crawlee", ordinal: 1 },
    marker: "standalone-crawlee",
  };
  const stasis = {
    schema: "diagnostic-fixture",
    lane: "stasis",
    job: { lane: "stasis", ordinal: 2 },
    marker: "standalone-stasis",
  };
  return {
    crawlee,
    stasis,
    evidence: {
      schema: "diagnostic-evidence-fixture",
      observations: {
        crawlee: structuredClone(crawlee),
        stasis: structuredClone(stasis),
      },
    },
    authority: { schema: "fresh-authority-fixture", marker: "fresh-authority" },
    binding: { schema: "artifact-binding-fixture", marker: "artifact-binding" },
  };
}

function exactBuffers(values) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, canonicalBytes(value)]),
  );
}

function fileIdentity(bytes) {
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function fixtureBoundary(buffers) {
  return {
    exactThreeFileDiagnosticInventoryBeforeOutput: true,
    eachInputJsonReadExactlyOnce: true,
    canonicalJsonVerified: true,
    allInputAndOutputPathsAbsoluteAndDistinct: true,
    allInputsRealStableRegularFiles: true,
    symlinksRejected: true,
    fileIdentityCollisionsRejected: true,
    outputInitiallyAbsent: true,
    outputCreation: "fsynced_sibling_temp_no_clobber_link",
    inputs: {
      crawleeRaw: fileIdentity(buffers.crawlee),
      stasisRaw: fileIdentity(buffers.stasis),
      composedEvidence: fileIdentity(buffers.evidence),
      freshAuthorityRaw: fileIdentity(buffers.authority),
      artifactBindingReceipt: fileIdentity(buffers.binding),
    },
  };
}

function fixtureInvocation({ values = fixtureValues(), buffers = exactBuffers(values) } = {}) {
  return {
    crawleeDiagnostic: values.crawlee,
    crawleeDiagnosticBytes: buffers.crawlee,
    stasisDiagnostic: values.stasis,
    stasisDiagnosticBytes: buffers.stasis,
    composedEvidence: values.evidence,
    composedEvidenceBytes: buffers.evidence,
    authoritativeRaw: values.authority,
    authoritativeRawBytes: buffers.authority,
    authoritativeRawSha256: fileIdentity(buffers.authority).sha256,
    artifactBindingReceipt: values.binding,
    artifactBindingReceiptBytes: buffers.binding,
    fileBoundary: fixtureBoundary(buffers),
  };
}

function validatingDependencies(invocation, calls = {}) {
  return {
    assertDiagnostic(value) {
      calls.diagnostics = [...(calls.diagnostics ?? []), value.lane];
      if (value.marker !== `standalone-${value.lane}`) {
        throw new TypeError("fixture standalone diagnostic invalid");
      }
      return value;
    },
    assertEvidence(value, options) {
      calls.evidence = (calls.evidence ?? 0) + 1;
      assert.equal(value, invocation.composedEvidence);
      assert.equal(options.authoritativeRaw, invocation.authoritativeRaw);
      assert.equal(
        options.authoritativeRawBytes.equals(invocation.authoritativeRawBytes),
        true,
      );
      assert.equal(
        options.authoritativeRawBytesAfterDiagnostics.equals(
          invocation.authoritativeRawBytes,
        ),
        true,
      );
      assert.equal(
        options.authoritativeRawBytes,
        options.authoritativeRawBytesAfterDiagnostics,
      );
      assert.equal(options.authoritativeRawSha256, invocation.authoritativeRawSha256);
      assert.equal(options.artifactBindingReceipt, invocation.artifactBindingReceipt);
      return value;
    },
  };
}

function verifyFixture(invocation = fixtureInvocation(), calls = {}) {
  return verifyCrawlPhaseDiagnosticArtifactSet(
    invocation,
    validatingDependencies(invocation, calls),
  );
}

test("offline verifier validates both lanes, exact retained observations, and one immutable authority replay", () => {
  const invocation = fixtureInvocation();
  const calls = {};
  const receipt = verifyFixture(invocation, calls);

  assert.deepEqual(calls.diagnostics, ["crawlee", "stasis"]);
  assert.equal(calls.evidence, 1);
  assert.equal(receipt.schema, crawlPhaseDiagnosticVerificationSchema);
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.authorityEligible, false);
  assert.equal(receipt.timingEligible, false);
  assert.equal(receipt.statisticsEligible, false);
  assert.equal(receipt.comparisonEligible, false);
  assert.equal(receipt.optimizationEligible, false);
  assert.equal(receipt.generalizedSpeedClaimAuthorized, false);
  assert.equal(receipt.implementationWorkAuthorized, false);
  assert.equal(receipt.decisionState, "STAY_0_4_UNASSIGNED");
  assert.deepEqual(receipt.diagnosticSet.order, ["crawlee", "stasis"]);
  assert.deepEqual(
    receipt.diagnosticSet.expectedInputFileNames,
    crawlPhaseDiagnosticVerificationFileNames,
  );
  assert.equal(
    receipt.diagnosticSet.observationBindings.crawlee.standaloneSha256,
    receipt.diagnosticSet.observationBindings.crawlee
      .composedObservationCanonicalSha256,
  );
  assert.equal(
    receipt.diagnosticSet.observationBindings.stasis.standaloneSha256,
    receipt.diagnosticSet.observationBindings.stasis
      .composedObservationCanonicalSha256,
  );
  assert.deepEqual(receipt.authorityReplay, {
    mode: "offline_single_immutable_authority_input",
    inputSha256: invocation.authoritativeRawSha256,
    inputBytes: invocation.authoritativeRawBytes.byteLength,
    exactBytesUsedForBeforeAndAfterReplay: true,
    temporalBeforeAfterReadsReenacted: false,
  });
  assert.equal(receipt.verification.authorityBytesStableDuringOfflineRead, true);
  assert.equal(receipt.verification.temporalBeforeAfterReadsReenacted, false);
  assert.equal(receipt.verification.timingAuthorityGranted, false);
  assert.equal(receipt.verification.comparisonAuthorityGranted, false);
  assert.equal(receipt.verification.optimizationAuthorityGranted, false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(assertCrawlPhaseDiagnosticVerificationReceipt(receipt), receipt);
});

test("offline verifier rejects lane/order, standalone value, byte, authority, binding, and boundary mutations", async (context) => {
  const cases = [
    ["lane order", (invocation) => {
      invocation.stasisDiagnostic.job.ordinal = 3;
      invocation.composedEvidence.observations.stasis.job.ordinal = 3;
      invocation.stasisDiagnosticBytes = canonicalBytes(invocation.stasisDiagnostic);
      invocation.composedEvidenceBytes = canonicalBytes(invocation.composedEvidence);
      invocation.fileBoundary = fixtureBoundary({
        crawlee: invocation.crawleeDiagnosticBytes,
        stasis: invocation.stasisDiagnosticBytes,
        evidence: invocation.composedEvidenceBytes,
        authority: invocation.authoritativeRawBytes,
        binding: invocation.artifactBindingReceiptBytes,
      });
    }, /lane identity|order changed/u],
    ["value", (invocation) => {
      invocation.composedEvidence.observations.crawlee.marker = "changed";
      invocation.composedEvidenceBytes = canonicalBytes(invocation.composedEvidence);
    }, /values do not match/u],
    ["standalone bytes", (invocation) => {
      invocation.crawleeDiagnosticBytes = Buffer.from("{ }\n", "utf8");
    }, /bytes do not match/u],
    ["authority digest", (invocation) => {
      invocation.authoritativeRawSha256 = "0".repeat(64);
    }, /SHA-256 does not match/u],
    ["file identity", (invocation) => {
      invocation.fileBoundary.inputs.stasisRaw.sha256 = "0".repeat(64);
    }, /file identities/u],
    ["composed evidence byte/value split", (invocation) => {
      invocation.composedEvidenceBytes = canonicalBytes({ substituted: true });
      invocation.fileBoundary.inputs.composedEvidence = fileIdentity(
        invocation.composedEvidenceBytes,
      );
    }, /Composed diagnostic evidence bytes do not represent/u],
    ["authority byte/value split", (invocation) => {
      invocation.authoritativeRawBytes = canonicalBytes({ substituted: true });
      invocation.authoritativeRawSha256 = fileIdentity(
        invocation.authoritativeRawBytes,
      ).sha256;
      invocation.fileBoundary.inputs.freshAuthorityRaw = fileIdentity(
        invocation.authoritativeRawBytes,
      );
    }, /Fresh authoritative crawl raw bytes do not represent/u],
    ["artifact binding byte/value split", (invocation) => {
      invocation.artifactBindingReceiptBytes = canonicalBytes({ substituted: true });
      invocation.fileBoundary.inputs.artifactBindingReceipt = fileIdentity(
        invocation.artifactBindingReceiptBytes,
      );
    }, /Performance artifact-binding receipt bytes do not represent/u],
  ];

  for (const [name, mutate, pattern] of cases) {
    await context.test(name, () => {
      const invocation = fixtureInvocation();
      mutate(invocation);
      assert.throws(() => verifyFixture(invocation), pattern);
    });
  }

  await context.test("authority value reaches evidence replay", () => {
    const invocation = fixtureInvocation();
    invocation.authoritativeRaw.marker = "changed";
    invocation.authoritativeRawBytes = canonicalBytes(invocation.authoritativeRaw);
    invocation.authoritativeRawSha256 = fileIdentity(
      invocation.authoritativeRawBytes,
    ).sha256;
    invocation.fileBoundary.inputs.freshAuthorityRaw = fileIdentity(
      invocation.authoritativeRawBytes,
    );
    assert.throws(
      () => verifyCrawlPhaseDiagnosticArtifactSet(invocation, {
        assertDiagnostic: () => undefined,
        assertEvidence(_evidence, options) {
          if (options.authoritativeRaw.marker !== "fresh-authority") {
            throw new TypeError("fresh authority replay failed");
          }
        },
      }),
      /fresh authority replay failed/u,
    );
  });

  await context.test("binding value reaches evidence replay", () => {
    const invocation = fixtureInvocation();
    invocation.artifactBindingReceipt.marker = "changed";
    invocation.artifactBindingReceiptBytes = canonicalBytes(
      invocation.artifactBindingReceipt,
    );
    invocation.fileBoundary.inputs.artifactBindingReceipt = fileIdentity(
      invocation.artifactBindingReceiptBytes,
    );
    assert.throws(
      () => verifyCrawlPhaseDiagnosticArtifactSet(invocation, {
        assertDiagnostic: () => undefined,
        assertEvidence(_evidence, options) {
          if (options.artifactBindingReceipt.marker !== "artifact-binding") {
            throw new TypeError("artifact binding replay failed");
          }
        },
      }),
      /artifact binding replay failed/u,
    );
  });
});

test("receipt validator rejects every attempt to grant diagnostic authority", async (context) => {
  const receipt = verifyFixture();
  for (const field of [
    "authorityEligible",
    "timingEligible",
    "statisticsEligible",
    "comparisonEligible",
    "optimizationEligible",
    "generalizedSpeedClaimAuthorized",
    "implementationWorkAuthorized",
  ]) {
    await context.test(field, () => {
      const changed = structuredClone(receipt);
      changed[field] = true;
      assert.throws(
        () => assertCrawlPhaseDiagnosticVerificationReceipt(changed),
        /forbidden authority/u,
      );
    });
  }
  for (const field of [
    "temporalBeforeAfterReadsReenacted",
    "timingAuthorityGranted",
    "comparisonAuthorityGranted",
    "optimizationAuthorityGranted",
  ]) {
    await context.test(`verification.${field}`, () => {
      const changed = structuredClone(receipt);
      changed.verification[field] = true;
      assert.throws(
        () => assertCrawlPhaseDiagnosticVerificationReceipt(changed),
        /invalid verification claims/u,
      );
    });
  }
});

test("receipt validator rejects retained identity and nested-shape mutations", async (context) => {
  const cases = [
    ["diagnostic hash", (receipt) => {
      receipt.diagnosticSet.observationBindings.crawlee.standaloneSha256 =
        "0".repeat(64);
    }],
    ["diagnostic canonical hash", (receipt) => {
      receipt.diagnosticSet.observationBindings.stasis
        .composedObservationCanonicalSha256 = "0".repeat(64);
    }],
    ["authority replay hash", (receipt) => {
      receipt.authorityReplay.inputSha256 = "0".repeat(64);
    }],
    ["authority replay bytes", (receipt) => {
      receipt.authorityReplay.inputBytes += 1;
    }],
    ["file-boundary input hash", (receipt) => {
      receipt.fileBoundary.inputs.crawleeRaw.sha256 = "0".repeat(64);
    }],
    ["file-boundary input bytes", (receipt) => {
      receipt.fileBoundary.inputs.artifactBindingReceipt.bytes = 0;
    }],
    ["nested extra field", (receipt) => {
      receipt.diagnosticSet.observationBindings.crawlee.unexpected = true;
    }],
  ];
  for (const [name, mutate] of cases) {
    await context.test(name, () => {
      const changed = structuredClone(verifyFixture());
      mutate(changed);
      assert.throws(
        () => assertCrawlPhaseDiagnosticVerificationReceipt(changed),
        /invalid|not cross-bound/u,
      );
    });
  }
});

test("default semantic validators are wired fail-closed", () => {
  assert.throws(
    () => verifyCrawlPhaseDiagnosticArtifactSet(fixtureInvocation()),
    /Invalid crawl phase diagnostic artifact/u,
  );
});

test("CLI reads each canonical input exactly once and creates one no-clobber receipt", async () => {
  const workspace = await createDiskFixture();
  try {
    const counts = new Map();
    const stdout = [];
    const invocation = fixtureInvocation({ values: workspace.values, buffers: workspace.buffers });
    const result = await runCrawlPhaseDiagnosticVerificationCli(workspace.argv, {
      async readBytes(filePath) {
        counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
        return readFile(filePath);
      },
      verifyArtifactSet(input) {
        return verifyCrawlPhaseDiagnosticArtifactSet(
          input,
          validatingDependencies(input),
        );
      },
      writeOutput(value) {
        stdout.push(value);
      },
    });

    for (const inputPath of workspace.inputPaths) {
      assert.equal(counts.get(inputPath), 1, inputPath);
    }
    assert.equal(counts.size, 5);
    assert.equal(result.receipt.schema, crawlPhaseDiagnosticVerificationSchema);
    assert.equal(result.cliReceipt.schema, crawlPhaseDiagnosticVerificationCliSchema);
    assert.deepEqual(JSON.parse(await readFile(workspace.outputPath, "utf8")), result.receipt);
    assert.equal(
      await readFile(workspace.outputPath, "utf8"),
      canonicalBytes(result.receipt).toString("utf8"),
    );
    assert.deepEqual(JSON.parse(stdout.join("")), result.cliReceipt);
    assert.equal(result.receipt.authorityReplay.inputSha256, invocation.authoritativeRawSha256);
    await assert.rejects(
      () => runCrawlPhaseDiagnosticVerificationCli(workspace.argv, {
        verifyArtifactSet: (input) => verifyCrawlPhaseDiagnosticArtifactSet(
          input,
          validatingDependencies(input),
        ),
        writeOutput() {},
      }),
      /inventory must be exactly|must not already exist/u,
    );
  } finally {
    await removeDiskFixture(workspace);
  }
});

test("CLI keeps distinct 64-bit Windows file identities distinct without Number rounding", async () => {
  const workspace = await createDiskFixture();
  try {
    const identityByPath = new Map(
      workspace.inputPaths.map((filePath, index) => [
        path.resolve(filePath).toLowerCase(),
        9_007_199_254_740_992n + BigInt(index),
      ]),
    );
    assert.equal(
      Number(identityByPath.get(path.resolve(workspace.inputPaths[0]).toLowerCase())),
      Number(identityByPath.get(path.resolve(workspace.inputPaths[1]).toLowerCase())),
    );
    const result = await runCrawlPhaseDiagnosticVerificationCli(workspace.argv, {
      async inspectPath(filePath) {
        const metadata = await lstat(filePath, { bigint: true });
        const identity = identityByPath.get(path.resolve(filePath).toLowerCase());
        if (identity !== undefined) {
          Object.defineProperty(metadata, "ino", { value: identity });
        }
        return metadata;
      },
      verifyArtifactSet: (input) => verifyCrawlPhaseDiagnosticArtifactSet(
        input,
        validatingDependencies(input),
      ),
      writeOutput() {},
    });
    assert.equal(result.receipt.status, "passed");
  } finally {
    await removeDiskFixture(workspace);
  }
});

test("CLI rejects noncanonical JSON before semantic verification", async (context) => {
  for (const index of [0, 1, 2, 3, 4]) {
    await context.test(`input ${index + 1}`, async () => {
      const workspace = await createDiskFixture();
      try {
        await writeFile(workspace.inputPaths[index], "{ }\n", "utf8");
        let verifies = 0;
        await assert.rejects(
          () => runCrawlPhaseDiagnosticVerificationCli(workspace.argv, {
            verifyArtifactSet() {
              verifies += 1;
            },
            writeOutput() {},
          }),
          /not canonical deterministic JSON/u,
        );
        assert.equal(verifies, 0);
        await assert.rejects(() => readFile(workspace.outputPath), /ENOENT/u);
      } finally {
        await removeDiskFixture(workspace);
      }
    });
  }
});

test("CLI rejects extra inventory, hard-link identity collisions, and existing output", async (context) => {
  await context.test("extra diagnostic file", async () => {
    const workspace = await createDiskFixture();
    try {
      await writeFile(path.join(workspace.diagnosticRoot, "extra.json"), "{}\n", "utf8");
      await assert.rejects(
        () => runCrawlPhaseDiagnosticVerificationCli(workspace.argv),
        /inventory must be exactly/u,
      );
    } finally {
      await removeDiskFixture(workspace);
    }
  });

  await context.test("hard-linked inputs", async () => {
    const workspace = await createDiskFixture();
    try {
      await unlink(workspace.stasisPath);
      await link(workspace.crawleePath, workspace.stasisPath);
      await assert.rejects(
        () => runCrawlPhaseDiagnosticVerificationCli(workspace.argv, {
          verifyArtifactSet() {
            throw new Error("semantic verifier must not run");
          },
        }),
        /file-identity collision/u,
      );
    } finally {
      await removeDiskFixture(workspace);
    }
  });

  await context.test("preexisting output", async () => {
    const workspace = await createDiskFixture();
    try {
      await writeFile(workspace.outputPath, "occupied", "utf8");
      await assert.rejects(
        () => runCrawlPhaseDiagnosticVerificationCli(workspace.argv),
        /inventory must be exactly|must not already exist/u,
      );
      assert.equal(await readFile(workspace.outputPath, "utf8"), "occupied");
    } finally {
      await removeDiskFixture(workspace);
    }
  });
});

test("CLI rejects symbolic-link inputs where the platform permits their creation", async (context) => {
  const workspace = await createDiskFixture();
  try {
    await unlink(workspace.stasisPath);
    try {
      await symlink(workspace.crawleePath, workspace.stasisPath, "file");
    } catch (error) {
      if (error?.code === "EPERM") {
        context.skip("file symlink creation is not permitted on this Windows host");
        return;
      }
      throw error;
    }
    await assert.rejects(
      () => runCrawlPhaseDiagnosticVerificationCli(workspace.argv),
      /inventory must be exactly|real regular file/u,
    );
  } finally {
    await removeDiskFixture(workspace);
  }
});

test("CLI rejects a file changed during its sole read and creates no receipt", async () => {
  const workspace = await createDiskFixture();
  try {
    let changed = false;
    await assert.rejects(
      () => runCrawlPhaseDiagnosticVerificationCli(workspace.argv, {
        async readBytes(filePath) {
          const bytes = await readFile(filePath);
          if (!changed && filePath === workspace.authorityPath) {
            changed = true;
            await writeFile(filePath, Buffer.concat([bytes, Buffer.from("\n", "utf8")]));
          }
          return bytes;
        },
        writeOutput() {},
      }),
      /changed during its single offline read/u,
    );
    await assert.rejects(() => readFile(workspace.outputPath), /ENOENT/u);
  } finally {
    await removeDiskFixture(workspace);
  }
});

test("CLI parser requires exact absolute, distinct, named paths", () => {
  const root = path.resolve("diagnostic-parser-fixture");
  const good = [
    "verify",
    ...crawlPhaseDiagnosticVerificationFileNames.map((name) => path.join(root, name)),
    path.join(root, "authority", "crawl.json"),
    path.join(root, "authority", "binding.json"),
    path.join(root, crawlPhaseDiagnosticVerificationOutputName),
  ];
  assert.equal(
    parseCrawlPhaseDiagnosticVerificationCommand(good).diagnosticRoot,
    root,
  );
  assert.throws(
    () => parseCrawlPhaseDiagnosticVerificationCommand([
      ...good.slice(0, 1),
      "relative.json",
      ...good.slice(2),
    ]),
    /explicit absolute path/u,
  );
  assert.throws(
    () => parseCrawlPhaseDiagnosticVerificationCommand([
      ...good.slice(0, 2),
      good[1],
      ...good.slice(3),
    ]),
    /paths must all be distinct/u,
  );
  assert.throws(
    () => parseCrawlPhaseDiagnosticVerificationCommand([
      ...good.slice(0, 3),
      path.join(root, "wrong-evidence.json"),
      ...good.slice(4),
    ]),
    /exact three named files/u,
  );
  assert.throws(
    () => parseCrawlPhaseDiagnosticVerificationCommand([
      ...good.slice(0, 6),
      path.join(root, "wrong-output.json"),
    ]),
    /must be named diagnostic-verification\.json/u,
  );
});

async function createDiskFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-crawl-diagnostic-verify-"));
  const diagnosticRoot = path.join(root, "diagnostic");
  const authorityRoot = path.join(root, "authority");
  await mkdir(diagnosticRoot);
  await mkdir(authorityRoot);
  const values = fixtureValues();
  const buffers = exactBuffers(values);
  const crawleePath = path.join(diagnosticRoot, crawlPhaseDiagnosticVerificationFileNames[0]);
  const stasisPath = path.join(diagnosticRoot, crawlPhaseDiagnosticVerificationFileNames[1]);
  const evidencePath = path.join(diagnosticRoot, crawlPhaseDiagnosticVerificationFileNames[2]);
  const authorityPath = path.join(authorityRoot, "fresh-crawl-raw.json");
  const bindingPath = path.join(authorityRoot, "artifact-binding.json");
  const outputPath = path.join(diagnosticRoot, crawlPhaseDiagnosticVerificationOutputName);
  const inputPaths = [
    crawleePath,
    stasisPath,
    evidencePath,
    authorityPath,
    bindingPath,
  ];
  await Promise.all(inputPaths.map((filePath, index) =>
    writeFile(filePath, Object.values(buffers)[index])
  ));
  return {
    root,
    diagnosticRoot,
    values,
    buffers,
    crawleePath,
    stasisPath,
    evidencePath,
    authorityPath,
    bindingPath,
    outputPath,
    inputPaths,
    argv: ["verify", ...inputPaths, outputPath],
  };
}

async function removeDiskFixture(workspace) {
  const resolved = path.resolve(workspace.root);
  assert.equal(resolved.startsWith(path.resolve(os.tmpdir())), true);
  await rm(resolved, { recursive: true, force: true });
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, jsonReplacer, 2)}\n`, "utf8");
}
