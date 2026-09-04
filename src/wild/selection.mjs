import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { sha256File } from "../shared/io.mjs";

export function deterministicRankOrder(stratum, seed) {
  validateStratum(stratum);
  if (typeof seed !== "string" || seed.length === 0) {
    throw new TypeError("Selection seed must be a nonempty string");
  }
  const length = stratum.maxRank - stratum.minRank + 1;
  const offset = Number(hashUint64(`${seed}|${stratum.id}|offset`) % BigInt(length));
  let stride = Number(hashUint64(`${seed}|${stratum.id}|stride`) % BigInt(length - 1)) + 1;
  while (greatestCommonDivisor(stride, length) !== 1) {
    stride += 1;
    if (stride >= length) stride = 1;
  }
  return Object.freeze({
    offset,
    stride,
    length,
    rankAt(index) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
        throw new RangeError(`Permutation index ${index} is outside 0..${length - 1}`);
      }
      return stratum.minRank + ((offset + index * stride) % length);
    },
  });
}

export async function loadVerifiedTrancoDomains(inputPath, sourceMetadata) {
  if (typeof sourceMetadata !== "object" || sourceMetadata === null) {
    throw new TypeError("Tranco source metadata is required");
  }
  const [bytes, actualSha256] = await Promise.all([
    readFile(inputPath),
    sha256File(inputPath),
  ]);
  if (bytes.length !== sourceMetadata.bytes) {
    throw new Error(`Tranco byte length mismatch: expected ${sourceMetadata.bytes}, got ${bytes.length}`);
  }
  if (actualSha256 !== sourceMetadata.sha256) {
    throw new Error(`Tranco SHA-256 mismatch: expected ${sourceMetadata.sha256}, got ${actualSha256}`);
  }
  const text = bytes.toString("utf8");
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== sourceMetadata.rowCount) {
    throw new Error(`Tranco row count mismatch: expected ${sourceMetadata.rowCount}, got ${lines.length}`);
  }
  const domains = new Array(lines.length + 1);
  for (let index = 0; index < lines.length; index += 1) {
    const comma = lines[index].indexOf(",");
    if (comma <= 0 || lines[index].indexOf(",", comma + 1) !== -1) {
      throw new Error(`Malformed Tranco row ${index + 1}`);
    }
    const rank = Number(lines[index].slice(0, comma));
    const domain = lines[index].slice(comma + 1).trim().toLowerCase();
    if (rank !== index + 1 || !isPayLevelDomain(domain)) {
      throw new Error(`Invalid Tranco rank/domain at row ${index + 1}`);
    }
    domains[rank] = domain;
  }
  return Object.freeze({
    domains,
    bytes: bytes.length,
    sha256: actualSha256,
    rowCount: lines.length,
  });
}

export function isPayLevelDomain(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 253) return false;
  if (!value.includes(".") || value.startsWith(".") || value.endsWith(".")) return false;
  try {
    const url = new URL(`https://${value}/`);
    return (
      url.hostname === value &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.port.length === 0 &&
      url.pathname === "/"
    );
  } catch {
    return false;
  }
}

function hashUint64(value) {
  const digest = createHash("sha256").update(value, "utf8").digest();
  return digest.readBigUInt64BE(0);
}

function greatestCommonDivisor(left, right) {
  let a = left;
  let b = right;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function validateStratum(value) {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    !Number.isSafeInteger(value.minRank) ||
    !Number.isSafeInteger(value.maxRank) ||
    value.minRank < 1 ||
    value.maxRank <= value.minRank
  ) {
    throw new TypeError("Invalid rank stratum");
  }
}
