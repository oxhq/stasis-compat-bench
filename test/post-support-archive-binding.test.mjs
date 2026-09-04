import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  materializeVerifiedWindowsZipExecutableBinding,
  verifyWindowsZipExecutableBinding,
} from "../src/post-support/archive-binding.mjs";

const root = "stasis-0.3.3-windows-x86_64-ci";
const version = "0.3.3";
const revision = "48c5a718a9ddd63f496e45307e1484974ccf8587";
const workflowRunId = "33506181780";
const workflowRunAttempt = "1";
const fileNames = [
  "controlled-web-session-v2.json",
  "INSTALL.txt",
  "libEGL.dll",
  "libGLESv2.dll",
  "LICENSE",
  "LICENSE_WHATWG_SPECS",
  "MSVC-RUNTIME.txt",
  "MSVCP140.dll",
  "README.md",
  "RELEASES.md",
  "session-v0.3-candidate.md",
  "SHA256SUMS.txt",
  "SOURCE.txt",
  "STASIS_UPSTREAM.toml",
  "stasis.exe",
  "STASIS.md",
  "THIRD_PARTY_LICENSES.html",
  "VCRUNTIME140_1.dll",
  "VCRUNTIME140.dll",
  "VERSION.txt",
  "WINDOWS-CI-ARTIFACT.txt",
];

test("Windows archive binding replays every checksum and the exact hosted run identity", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "stasis-post-support-zip-"));
  try {
    const executable = Buffer.from("separately verified executable", "utf8");
    const validContents = createContents(executable, revision);
    const validPath = path.join(temporaryRoot, "valid.zip");
    await writeFile(validPath, createStoredZip(validContents));
    const verified = await verifyWindowsZipExecutableBinding({
      archivePath: validPath,
      executableSha256: sha256(executable),
      executableBytes: executable.length,
      expectedRevision: revision,
      expectedVersion: version,
      expectedRunId: workflowRunId,
      expectedRunAttempt: workflowRunAttempt,
    });
    assert.equal(verified.fileCount, 21);
    assert.equal(verified.checksumCount, 20);
    assert.equal(verified.revision, revision);
    assert.equal(verified.workflowRunId, workflowRunId);
    assert.equal(verified.workflowRunAttempt, workflowRunAttempt);

    const materialized = await materializeVerifiedWindowsZipExecutableBinding({
      archivePath: validPath,
      executableSha256: sha256(executable),
      executableBytes: executable.length,
      expectedRevision: revision,
      expectedVersion: version,
      expectedRunId: workflowRunId,
      expectedRunAttempt: workflowRunAttempt,
    });
    assert.equal(path.basename(materialized.executablePath), "stasis.exe");
    assert.equal(materialized.tree.fileCount, 21);
    assert.deepEqual(await readFile(materialized.executablePath), executable);
    assert.notEqual(path.dirname(materialized.executablePath), path.dirname(validPath));
    await materialized.dispose();
    await assert.rejects(() => stat(materialized.ownerRoot), { code: "ENOENT" });

    const badChecksumContents = createContents(executable, revision);
    badChecksumContents.set(
      `${root}/SHA256SUMS.txt`,
      Buffer.from(
        badChecksumContents.get(`${root}/SHA256SUMS.txt`).toString("utf8")
          .replace(/^[a-f0-9]{64}/u, "0".repeat(64)),
        "utf8",
      ),
    );
    const badChecksumPath = path.join(temporaryRoot, "bad-checksum.zip");
    await writeFile(badChecksumPath, createStoredZip(badChecksumContents));
    await assert.rejects(
      verifyWindowsZipExecutableBinding({
        archivePath: badChecksumPath,
        executableSha256: sha256(executable),
        executableBytes: executable.length,
        expectedRevision: revision,
        expectedVersion: version,
        expectedRunId: workflowRunId,
        expectedRunAttempt: workflowRunAttempt,
      }),
      /checksum manifest differs/u,
    );

    const wrongRevisionContents = createContents(executable, "0".repeat(40));
    const wrongRevisionPath = path.join(temporaryRoot, "wrong-revision.zip");
    await writeFile(wrongRevisionPath, createStoredZip(wrongRevisionContents));
    await assert.rejects(
      verifyWindowsZipExecutableBinding({
        archivePath: wrongRevisionPath,
        executableSha256: sha256(executable),
        executableBytes: executable.length,
        expectedRevision: revision,
        expectedVersion: version,
        expectedRunId: workflowRunId,
        expectedRunAttempt: workflowRunAttempt,
      }),
      /artifact marker differs/u,
    );

    const wrongRunContents = createContents(executable, revision, "33424783572");
    const wrongRunPath = path.join(temporaryRoot, "wrong-run.zip");
    await writeFile(wrongRunPath, createStoredZip(wrongRunContents));
    await assert.rejects(
      verifyWindowsZipExecutableBinding({
        archivePath: wrongRunPath,
        executableSha256: sha256(executable),
        executableBytes: executable.length,
        expectedRevision: revision,
        expectedVersion: version,
        expectedRunId: workflowRunId,
        expectedRunAttempt: workflowRunAttempt,
      }),
      /artifact marker differs/u,
    );

    const wrongAttemptContents = createContents(executable, revision, workflowRunId, "2");
    const wrongAttemptPath = path.join(temporaryRoot, "wrong-attempt.zip");
    await writeFile(wrongAttemptPath, createStoredZip(wrongAttemptContents));
    await assert.rejects(
      verifyWindowsZipExecutableBinding({
        archivePath: wrongAttemptPath,
        executableSha256: sha256(executable),
        executableBytes: executable.length,
        expectedRevision: revision,
        expectedVersion: version,
        expectedRunId: workflowRunId,
        expectedRunAttempt: workflowRunAttempt,
      }),
      /artifact marker differs/u,
    );

    for (const [field, values, expectedError] of [
      [
        "expectedRunId",
        [undefined, "", "0", "01"],
        /expected workflow run ID must be one canonical positive integer/u,
      ],
      [
        "expectedRunAttempt",
        [undefined, "", "0", "01"],
        /expected workflow run attempt must be one canonical positive integer/u,
      ],
    ]) {
      for (const value of values) {
        await assert.rejects(
          verifyWindowsZipExecutableBinding({
            archivePath: validPath,
            executableSha256: sha256(executable),
            executableBytes: executable.length,
            expectedRevision: revision,
            expectedVersion: version,
            expectedRunId: workflowRunId,
            expectedRunAttempt: workflowRunAttempt,
            [field]: value,
          }),
          expectedError,
        );
      }
    }

    for (const [name, transform, expectedError] of [
      [
        "omitted-run",
        (marker) => marker.replace(`Run: ${workflowRunId}\r\n`, ""),
        /artifact marker omits Run/u,
      ],
      [
        "omitted-attempt",
        (marker) => marker.replace(`Attempt: ${workflowRunAttempt}\r\n`, ""),
        /artifact marker omits Attempt/u,
      ],
      [
        "repeated-run",
        (marker) => marker.replace(
          `Run: ${workflowRunId}\r\n`,
          `Run: ${workflowRunId}\r\nRun: ${workflowRunId}\r\n`,
        ),
        /artifact marker repeats a field/u,
      ],
      [
        "repeated-attempt",
        (marker) => marker.replace(
          `Attempt: ${workflowRunAttempt}\r\n`,
          `Attempt: ${workflowRunAttempt}\r\nAttempt: ${workflowRunAttempt}\r\n`,
        ),
        /artifact marker repeats a field/u,
      ],
    ]) {
      const malformedContents = mutateMarkerAndReseal(validContents, transform);
      const malformedPath = path.join(temporaryRoot, `${name}.zip`);
      await writeFile(malformedPath, createStoredZip(malformedContents));
      await assert.rejects(
        verifyWindowsZipExecutableBinding({
          archivePath: malformedPath,
          executableSha256: sha256(executable),
          executableBytes: executable.length,
          expectedRevision: revision,
          expectedVersion: version,
          expectedRunId: workflowRunId,
          expectedRunAttempt: workflowRunAttempt,
        }),
        expectedError,
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true });
  }
});

function createContents(
  executable,
  embeddedRevision,
  embeddedRunId = workflowRunId,
  embeddedRunAttempt = workflowRunAttempt,
) {
  const contents = new Map();
  for (const name of fileNames) {
    if (name === "SHA256SUMS.txt") continue;
    let content = Buffer.from(`fixture ${name}\n`, "utf8");
    if (name === "stasis.exe") content = executable;
    if (name === "WINDOWS-CI-ARTIFACT.txt") {
      content = Buffer.from(
        [
          "Stasis Windows x86-64 CI-only artifact",
          "",
          `Version: ${version}`,
          `Revision: ${embeddedRevision}`,
          `Run: ${embeddedRunId}`,
          `Attempt: ${embeddedRunAttempt}`,
          "",
        ].join("\r\n"),
        "utf8",
      );
    }
    contents.set(`${root}/${name}`, content);
  }
  const manifest = [...contents.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([name, content]) => `${sha256(content)}  ${name}`)
    .join("\r\n");
  contents.set(`${root}/SHA256SUMS.txt`, Buffer.from(`${manifest}\r\n`, "utf8"));
  return contents;
}

function mutateMarkerAndReseal(contents, transform) {
  const mutated = new Map(contents);
  const markerName = `${root}/WINDOWS-CI-ARTIFACT.txt`;
  mutated.set(
    markerName,
    Buffer.from(transform(mutated.get(markerName).toString("utf8")), "utf8"),
  );
  const manifest = [...mutated.entries()]
    .filter(([name]) => name !== `${root}/SHA256SUMS.txt`)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([name, content]) => `${sha256(content)}  ${name}`)
    .join("\r\n");
  mutated.set(`${root}/SHA256SUMS.txt`, Buffer.from(`${manifest}\r\n`, "utf8"));
  return mutated;
}

function createStoredZip(contents) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, content] of contents) {
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, nameBytes);
    localOffset += local.length + nameBytes.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(contents.size, 8);
  eocd.writeUInt16LE(contents.size, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
