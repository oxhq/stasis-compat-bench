import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { selectionSeed, strata } from "../src/wild/config.mjs";
import {
  deterministicRankOrder,
  isPayLevelDomain,
  loadVerifiedTrancoDomains,
} from "../src/wild/selection.mjs";

test("frozen Tranco strata have stable permutation identities", () => {
  assert.deepEqual(
    strata.map((stratum) => {
      const order = deterministicRankOrder(stratum, selectionSeed);
      return {
        id: stratum.id,
        offset: order.offset,
        stride: order.stride,
        firstFive: Array.from({ length: 5 }, (_, index) => order.rankAt(index)),
      };
    }),
    [
      { id: "rank-1-1000", offset: 933, stride: 879, firstFive: [934, 813, 692, 571, 450] },
      { id: "rank-1001-10000", offset: 8934, stride: 1073, firstFive: [9935, 2008, 3081, 4154, 5227] },
      { id: "rank-10001-100000", offset: 74939, stride: 31619, firstFive: [84940, 26559, 58178, 89797, 31416] },
      { id: "rank-100001-500000", offset: 242758, stride: 169269, firstFive: [342759, 112028, 281297, 450566, 219835] },
      { id: "rank-500001-1000000", offset: 337071, stride: 72859, firstFive: [837072, 909931, 982790, 555649, 628508] },
    ],
  );
});

test("rank traversal is a stable full-cycle permutation", () => {
  const stratum = { id: "fixture", minRank: 101, maxRank: 111 };
  const first = deterministicRankOrder(stratum, "frozen-seed");
  const second = deterministicRankOrder(stratum, "frozen-seed");
  const ranks = Array.from({ length: first.length }, (_, index) => first.rankAt(index));

  assert.deepEqual(ranks, Array.from({ length: second.length }, (_, index) => second.rankAt(index)));
  assert.equal(new Set(ranks).size, 11);
  assert.deepEqual([...ranks].sort((left, right) => left - right), [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]);
  assert.equal(gcd(first.stride, first.length), 1);
  assert.throws(() => first.rankAt(-1), RangeError);
  assert.throws(() => first.rankAt(first.length), RangeError);
});

test("verified Tranco parser rejects identity drift and preserves rank indexing", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "stasis-wild-selection-"));
  const input = path.join(temporary, "tranco.csv");
  const bytes = Buffer.from("1,example.com\n2,example.org\n", "utf8");
  await writeFile(input, bytes);
  const metadata = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rowCount: 2,
  };
  try {
    const result = await loadVerifiedTrancoDomains(input, metadata);
    assert.equal(result.domains[1], "example.com");
    assert.equal(result.domains[2], "example.org");
    await assert.rejects(
      loadVerifiedTrancoDomains(input, { ...metadata, sha256: "0".repeat(64) }),
      /SHA-256 mismatch/u,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("pay-level-domain shape excludes single-label and URL-like input", () => {
  assert.equal(isPayLevelDomain("example.com"), true);
  assert.equal(isPayLevelDomain("xn--bcher-kva.example"), true);
  assert.equal(isPayLevelDomain("localhost"), false);
  assert.equal(isPayLevelDomain("https://example.com"), false);
  assert.equal(isPayLevelDomain("example.com/path"), false);
});

function gcd(left, right) {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
