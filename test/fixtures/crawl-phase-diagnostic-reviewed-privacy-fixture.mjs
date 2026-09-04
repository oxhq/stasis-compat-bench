import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

const compressedFixtureUrl = new URL(
  "./comparison-evidence-release-commit-6c1a0066.json.br.base64",
  import.meta.url,
);

export const crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity = Object.freeze({
  encodedBytes: 44778,
  encodedSha256: "141f98c0df6a9571addba09a363923bbd927bcd31357ba7d12d6f64e3fcc6061",
  compressedBytes: 33147,
  compressedSha256: "65d2f697f4a5310730bb42566240e90480d38c5702178c3eb22e284e05157c45",
  inflatedBytes: 228009,
  inflatedSha256: "59981d35875e61909e1a16b3c007baf676d8e49e5e10870999dff588adc1f543",
});

const encodedBytes = readFileSync(compressedFixtureUrl);
assertIdentity(encodedBytes, {
  bytes: crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity.encodedBytes,
  sha256: crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity.encodedSha256,
}, "Base64-wrapped frozen-H1 privacy fixture");
const encodedText = encodedBytes.toString("utf8");
if (!Buffer.from(encodedText, "utf8").equals(encodedBytes)) {
  throw new TypeError("Base64-wrapped frozen-H1 privacy fixture is not UTF-8");
}
const encodedLines = encodedText.endsWith("\n") && !encodedText.includes("\r")
  ? encodedText.slice(0, -1).split("\n")
  : [];
if (
  encodedLines.length < 1 ||
  encodedLines.some((line, index) =>
    line.length < 1 || line.length > 76 ||
    (index < encodedLines.length - 1 && line.length !== 76))
) {
  throw new TypeError("Base64-wrapped frozen-H1 privacy fixture has noncanonical lines");
}
const compactBase64 = encodedLines.join("");
if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(compactBase64)) {
  throw new TypeError("Base64-wrapped frozen-H1 privacy fixture is not canonical Base64");
}
const compressedBytes = Buffer.from(compactBase64, "base64");
if (compressedBytes.toString("base64") !== compactBase64) {
  throw new TypeError("Base64-wrapped frozen-H1 privacy fixture did not round-trip");
}
assertIdentity(compressedBytes, {
  bytes: crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity.compressedBytes,
  sha256: crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity.compressedSha256,
}, "compressed frozen-H1 privacy fixture");

const inflatedBytes = brotliDecompressSync(compressedBytes);
assertIdentity(inflatedBytes, {
  bytes: crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity.inflatedBytes,
  sha256: crawlPhaseDiagnosticReviewedPrivacyFixtureIdentity.inflatedSha256,
}, "inflated frozen-H1 privacy fixture");

export function exactCrawlPhaseDiagnosticReviewedPrivacyFixtureBytes() {
  return Buffer.from(inflatedBytes);
}

function assertIdentity(bytes, expected, label) {
  if (
    bytes.byteLength !== expected.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== expected.sha256
  ) {
    throw new TypeError(`${label} identity changed`);
  }
}
