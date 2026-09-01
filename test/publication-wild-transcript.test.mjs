import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractWildAuthorityTranscript,
  verifyWildAuthorityTranscriptEvidence,
  wildTranscriptSchemas,
} from "../src/publication/wild-transcript.mjs";

test("wild transcript extraction losslessly selects and binds the final authority suffix", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-wild-transcript-"));
  try {
    const documents = validDocuments();
    const documentBytes = documents.map(canonicalBytes);
    const transcriptBytes = Buffer.concat(documentBytes);
    const transcriptPath = path.join(root, "wild-stdout.log");
    const authorityPath = path.join(root, "wild-authority.json");
    const receiptPath = path.join(root, "wild-authority-extraction.json");
    await writeFile(transcriptPath, transcriptBytes, { flag: "wx" });

    const receipt = await extractWildAuthorityTranscript({
      transcriptPath,
      authorityOutputPath: authorityPath,
      receiptPath,
    });

    assert.deepEqual(receipt.documents.schemas, wildTranscriptSchemas);
    assert.equal(
      receipt.documents.finalAuthorityOffsetBytes,
      documentBytes[0].length + documentBytes[1].length,
    );
    assert.deepEqual(await readFile(authorityPath), documentBytes[2]);
    assert.equal(receipt.transcript.bytes, transcriptBytes.length);
    assert.equal(receipt.transcript.sha256, sha256(transcriptBytes));
    assert.equal(receipt.output.schema, wildTranscriptSchemas[2]);
    assert.equal(receipt.output.bytes, documentBytes[2].length);
    assert.equal(receipt.output.sha256, sha256(documentBytes[2]));
    assert.equal(
      await readFile(receiptPath, "utf8"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wild transcript extraction rejects overwrite before writing either output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stasis-wild-transcript-overwrite-"));
  try {
    const transcriptPath = path.join(root, "wild-stdout.log");
    const authorityPath = path.join(root, "wild-authority.json");
    const receiptPath = path.join(root, "wild-authority-extraction.json");
    await writeFile(transcriptPath, Buffer.concat(validDocuments().map(canonicalBytes)), {
      flag: "wx",
    });
    await writeFile(authorityPath, "sentinel", { flag: "wx" });
    await assert.rejects(
      () => extractWildAuthorityTranscript({
        transcriptPath,
        authorityOutputPath: authorityPath,
        receiptPath,
      }),
      /fresh path/u,
    );
    assert.equal(await readFile(authorityPath, "utf8"), "sentinel");
    await assert.rejects(() => stat(receiptPath), { code: "ENOENT" });

    await rm(authorityPath);
    await writeFile(receiptPath, "sentinel", { flag: "wx" });
    await assert.rejects(
      () => extractWildAuthorityTranscript({
        transcriptPath,
        authorityOutputPath: authorityPath,
        receiptPath,
      }),
      /fresh path/u,
    );
    assert.equal(await readFile(receiptPath, "utf8"), "sentinel");
    await assert.rejects(() => stat(authorityPath), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wild transcript extraction rejects malformed, noncanonical, and extra transcript bytes", async () => {
  const documents = validDocuments();
  const canonical = documents.map(canonicalBytes);
  const cases = [
    ["malformed", Buffer.concat([canonical[0], canonical[1], canonical[2].subarray(0, -2)]), /complete/u],
    [
      "noncanonical",
      Buffer.concat([Buffer.from(`${JSON.stringify(documents[0])}\n`), canonical[1], canonical[2]]),
      /canonical/u,
    ],
    ["extra", Buffer.concat([...canonical, Buffer.from("\n")]), /extra bytes/u],
  ];
  for (const [label, transcriptBytes, expected] of cases) {
    await rejectsTranscript(transcriptBytes, expected, label);
  }
});

test("wild transcript extraction rejects wrong schemas, statuses, authorities, and bindings", async () => {
  const cases = [
    ["schema", (documents) => { documents[0].schema = "wrong"; }, /schema/u],
    ["status", (documents) => { documents[2].status = "failed"; }, /status/u],
    ["authority", (documents) => { documents[1].authority = "diagnostic_only"; }, /authority/u],
    ["binding", (documents) => { documents[2].summary = { selectedCount: 99 }; }, /does not bind/u],
    ["extra-key", (documents) => { documents[0].extra = true; }, /unexpected or missing keys/u],
  ];
  for (const [label, mutate, expected] of cases) {
    const documents = validDocuments();
    mutate(documents);
    await rejectsTranscript(Buffer.concat(documents.map(canonicalBytes)), expected, label);
  }
});

test("wild transcript verification binds the exact retained smoke reference", () => {
  const documents = validDocuments();
  const transcriptBytes = Buffer.concat(documents.map(canonicalBytes));
  assert.doesNotThrow(() => verifyWildAuthorityTranscriptEvidence({
    transcriptBytes,
    expectedSmokeReference: structuredClone(documents[0].artifact),
  }));
  assert.throws(
    () => verifyWildAuthorityTranscriptEvidence({
      transcriptBytes,
      expectedSmokeReference: {
        ...documents[0].artifact,
        sha256: "f".repeat(64),
      },
    }),
    /differs from the retained network-policy smoke/u,
  );
});

test("package scripts expose the wild transcript extraction CLI", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(
    packageJson.scripts["publication:extract-wild-authority"],
    "node src/publication/cli.mjs extract-wild-authority",
  );
});

async function rejectsTranscript(transcriptBytes, expected, label) {
  const root = await mkdtemp(path.join(os.tmpdir(), `stasis-wild-${label}-`));
  try {
    const transcriptPath = path.join(root, "wild-stdout.log");
    const authorityPath = path.join(root, "wild-authority.json");
    const receiptPath = path.join(root, "wild-authority-extraction.json");
    await writeFile(transcriptPath, transcriptBytes, { flag: "wx" });
    await assert.rejects(
      () => extractWildAuthorityTranscript({
        transcriptPath,
        authorityOutputPath: authorityPath,
        receiptPath,
      }),
      expected,
    );
    await assert.rejects(() => stat(authorityPath), { code: "ENOENT" });
    await assert.rejects(() => stat(receiptPath), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function validDocuments() {
  const candidate = {
    schema: "stasis-post-support-wild-candidate-v1",
    revision: "b".repeat(40),
  };
  const summary = { selectedCount: 100, counts: { PASS_EQUIVALENT: 100 } };
  return [
    {
      schema: wildTranscriptSchemas[0],
      status: "passed",
      artifact: {
        path: "wild-network-policy-smoke.json",
        sha256: "a".repeat(64),
      },
    },
    {
      schema: wildTranscriptSchemas[1],
      protocol: "stasis-post-0.3-census-v1",
      authority: "requires_separate_quiescent_postflight_verification",
      candidate,
      artifactIndex: "wild/artifact-index.json",
      summaryArtifact: "wild/summary.json",
      caseCount: 100,
      rawRecordCount: 500,
      summary,
    },
    {
      schema: wildTranscriptSchemas[2],
      status: "passed",
      protocol: "stasis-post-0.3-census-v1",
      artifactIndexSha256: "c".repeat(64),
      candidate: structuredClone(candidate),
      caseCount: 100,
      summary: structuredClone(summary),
      authority: "quiescent_postflight_verified",
    },
  ];
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
