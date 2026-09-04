import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual, TextDecoder } from "node:util";

export const wildTranscriptSchemas = Object.freeze([
  "stasis-post-support-wild-smoke-run-v1",
  "stasis-post-support-wild-artifacts-v1",
  "stasis-post-support-wild-authority-v1",
]);
export const currentUrlWildTranscriptSchemas = Object.freeze([
  "stasis-post-support-wild-smoke-run-v1",
  "stasis-post-support-wild-artifacts-v2",
  "stasis-post-support-wild-authority-v2",
]);

const receiptSchema = "stasis-compat-wild-authority-extraction-receipt-v1";
const protocol = "stasis-post-0.3-census-v1";
const sha256Pattern = /^[a-f0-9]{64}$/u;

export async function extractWildAuthorityTranscript({
  transcriptPath,
  authorityOutputPath,
  receiptPath,
}) {
  const transcript = await assertRealInputFile(transcriptPath, "wild stdout transcript");
  const [authorityOutput, receiptOutput] = await Promise.all([
    assertFreshOutputPath(authorityOutputPath, "wild authority output"),
    assertFreshOutputPath(receiptPath, "wild transcript extraction receipt"),
  ]);
  assertDistinctPaths(
    [transcript, authorityOutput, receiptOutput],
    ["wild stdout transcript", "wild authority output", "wild transcript extraction receipt"],
  );

  const transcriptBytes = await readFile(transcript);
  const { authorityBytes, receipt } = verifyWildAuthorityTranscriptEvidence({
    transcriptBytes,
  });
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  await writeFile(authorityOutput, authorityBytes, { flag: "wx" });
  await writeFile(receiptOutput, receiptBytes, { flag: "wx" });
  return receipt;
}

export function verifyWildAuthorityTranscriptEvidence({
  transcriptBytes,
  authorityBytes: retainedAuthorityBytes,
  expectedSmokeReference,
  receipt: retainedReceipt,
}) {
  if (!Buffer.isBuffer(transcriptBytes)) {
    throw new TypeError("Wild stdout transcript evidence must be one Buffer");
  }
  const documents = splitCanonicalDocuments(transcriptBytes);
  const transcriptSchemas = validateWildTranscriptSequence(
    documents.map(({ value }) => value),
  );
  if (
    expectedSmokeReference !== undefined &&
    !isDeepStrictEqual(documents[0].value.artifact, expectedSmokeReference)
  ) {
    throw new Error(
      "Wild stdout transcript smoke reference differs from the retained network-policy smoke",
    );
  }

  const finalDocument = documents[2];
  const authorityBytes = transcriptBytes.subarray(finalDocument.offset);
  const receipt = Object.freeze({
    schema: receiptSchema,
    status: "passed",
    transcript: Object.freeze({
      bytes: transcriptBytes.length,
      sha256: sha256(transcriptBytes),
    }),
    documents: Object.freeze({
      schemas: Object.freeze([...transcriptSchemas]),
      finalAuthorityOffsetBytes: finalDocument.offset,
    }),
    output: Object.freeze({
      schema: finalDocument.value.schema,
      bytes: authorityBytes.length,
      sha256: sha256(authorityBytes),
    }),
  });

  if (
    retainedAuthorityBytes !== undefined &&
    (!Buffer.isBuffer(retainedAuthorityBytes) ||
      !retainedAuthorityBytes.equals(authorityBytes))
  ) {
    throw new Error("Retained wild authority bytes differ from the transcript suffix");
  }
  if (
    retainedReceipt !== undefined &&
    !isDeepStrictEqual(retainedReceipt, receipt)
  ) {
    throw new Error("Wild transcript extraction receipt differs from the retained transcript");
  }
  return Object.freeze({ authorityBytes, receipt });
}

function splitCanonicalDocuments(transcriptBytes) {
  const documents = [];
  let offset = 0;
  for (let index = 0; index < 3; index += 1) {
    const end = findLfTerminatedObjectEnd(transcriptBytes, offset, index + 1);
    const bytes = transcriptBytes.subarray(offset, end);
    const text = decodeUtf8(bytes.subarray(0, -1), index + 1);
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw new Error(`Wild stdout transcript document ${index + 1} is malformed JSON`, {
        cause: error,
      });
    }
    const canonicalBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    if (!bytes.equals(canonicalBytes)) {
      throw new Error(`Wild stdout transcript document ${index + 1} is not canonical JSON`);
    }
    documents.push(Object.freeze({ offset, end, value }));
    offset = end;
  }
  if (offset !== transcriptBytes.length) {
    throw new Error("Wild stdout transcript contains extra bytes after the final authority document");
  }
  return documents;
}

function findLfTerminatedObjectEnd(bytes, offset, ordinal) {
  if (bytes[offset] !== 0x7b) {
    throw new Error(`Wild stdout transcript document ${ordinal} must begin with an object`);
  }
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let index = offset; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === 0x5c) escaped = true;
      else if (byte === 0x22) inString = false;
      continue;
    }
    if (byte === 0x22) {
      inString = true;
      continue;
    }
    if (byte === 0x7b || byte === 0x5b) {
      stack.push(byte);
      continue;
    }
    if (byte !== 0x7d && byte !== 0x5d) continue;
    const expectedOpening = byte === 0x7d ? 0x7b : 0x5b;
    if (stack.pop() !== expectedOpening) {
      throw new Error(`Wild stdout transcript document ${ordinal} has mismatched JSON delimiters`);
    }
    if (stack.length === 0) {
      if (bytes[index + 1] !== 0x0a) {
        throw new Error(`Wild stdout transcript document ${ordinal} must end with one LF`);
      }
      return index + 2;
    }
  }
  throw new Error(`Wild stdout transcript document ${ordinal} is not a complete LF-terminated object`);
}

function validateWildTranscriptSequence([smoke, artifacts, authority]) {
  assertExactKeys(smoke, ["artifact", "schema", "status"], "wild smoke document");
  assertExactKeys(
    artifacts,
    [
      "artifactIndex",
      "authority",
      "candidate",
      "caseCount",
      "protocol",
      "rawRecordCount",
      "schema",
      "summary",
      "summaryArtifact",
    ],
    "wild artifacts document",
  );
  assertExactKeys(
    authority,
    [
      "artifactIndexSha256",
      "authority",
      "candidate",
      "caseCount",
      "protocol",
      "schema",
      "status",
      "summary",
    ],
    "wild final authority document",
  );
  const observedSchemas = [smoke, artifacts, authority].map((value) => value.schema);
  const transcriptSchemas = [wildTranscriptSchemas, currentUrlWildTranscriptSchemas]
    .find((candidate) => isDeepStrictEqual(observedSchemas, candidate));
  if (transcriptSchemas === undefined) {
    for (let index = 0; index < observedSchemas.length; index += 1) {
      if (
        observedSchemas[index] !== wildTranscriptSchemas[index] &&
        observedSchemas[index] !== currentUrlWildTranscriptSchemas[index]
      ) {
        throw new Error(`Wild stdout transcript document ${index + 1} has the wrong schema`);
      }
    }
    throw new Error("Wild stdout transcript mixes incompatible schema generations");
  }
  for (let index = 0; index < transcriptSchemas.length; index += 1) {
    if (observedSchemas[index] !== transcriptSchemas[index]) {
      throw new Error(`Wild stdout transcript document ${index + 1} has the wrong schema`);
    }
  }
  if (smoke.status !== "passed" || authority.status !== "passed") {
    throw new Error("Wild stdout transcript has the wrong status transition");
  }
  if (
    artifacts.authority !== "requires_separate_quiescent_postflight_verification" ||
    authority.authority !== "quiescent_postflight_verified"
  ) {
    throw new Error("Wild stdout transcript has the wrong authority transition");
  }
  assertExactKeys(smoke.artifact, ["path", "sha256"], "wild smoke artifact reference");
  if (
    smoke.artifact.path !== "wild-network-policy-smoke.json" ||
    !sha256Pattern.test(smoke.artifact.sha256 ?? "")
  ) {
    throw new Error("Wild stdout transcript has an invalid smoke artifact reference");
  }
  if (
    artifacts.protocol !== protocol ||
    authority.protocol !== protocol ||
    artifacts.artifactIndex !== "wild/artifact-index.json" ||
    artifacts.summaryArtifact !== "wild/summary.json" ||
    artifacts.caseCount !== 100 ||
    authority.caseCount !== 100 ||
    artifacts.rawRecordCount !== 500 ||
    !sha256Pattern.test(authority.artifactIndexSha256 ?? "")
  ) {
    throw new Error("Wild stdout transcript has invalid exact artifact authority metadata");
  }
  if (
    !isDeepStrictEqual(artifacts.candidate, authority.candidate) ||
    !isDeepStrictEqual(artifacts.summary, authority.summary)
  ) {
    throw new Error("Wild stdout transcript final authority does not bind the artifacts document");
  }
  return transcriptSchemas;
}

function assertExactKeys(value, expected, label) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort())
  ) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
}

async function assertRealInputFile(value, label) {
  const absolutePath = explicitAbsolutePath(value, label);
  const metadata = await lstat(absolutePath);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    !samePath(await realpath(absolutePath), absolutePath)
  ) {
    throw new Error(`${label} must be one real regular file`);
  }
  return absolutePath;
}

async function assertFreshOutputPath(value, label) {
  const absolutePath = explicitAbsolutePath(value, label);
  const parent = path.dirname(absolutePath);
  const parentMetadata = await lstat(parent);
  if (
    !parentMetadata.isDirectory() ||
    parentMetadata.isSymbolicLink() ||
    !samePath(await realpath(parent), parent)
  ) {
    throw new Error(`${label} parent must be one real directory`);
  }
  try {
    await lstat(absolutePath);
    throw new Error(`${label} must be one fresh path that does not exist`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return absolutePath;
}

function explicitAbsolutePath(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${label} must be one explicit absolute path`);
  }
  return path.resolve(value);
}

function assertDistinctPaths(paths, labels) {
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      if (samePath(paths[left], paths[right])) {
        throw new Error(`${labels[left]} and ${labels[right]} must use distinct paths`);
      }
    }
  }
}

function decodeUtf8(bytes, ordinal) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new Error(`Wild stdout transcript document ${ordinal} is not valid UTF-8`, {
      cause: error,
    });
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function samePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}
