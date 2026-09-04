import { createHash } from "node:crypto";

import { evidenceIdentity } from "./config.mjs";

export function normalizeTitle(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/gu, " ").trim();
}

export function normalizeTitleIdentity(value) {
  const normalized = normalizeTitle(value);
  return {
    sha256: digestIdentity(evidenceIdentity.title.domain, normalized),
    codePointLength: [...normalized].length,
    utf8Bytes: Buffer.byteLength(normalized, "utf8"),
  };
}

export function canonicalPublicHttpUrl(value, base) {
  const url = base === undefined ? new URL(value) : new URL(value, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`Expected HTTP(S), got ${url.protocol}`);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new TypeError("Credential-bearing URLs are excluded");
  }
  url.hash = "";
  return url.href;
}

export function publicHttpUrlIdentity(value, base) {
  return digestIdentity(
    evidenceIdentity.url.domain,
    canonicalPublicHttpUrl(value, base),
  );
}

export function normalizeLinkIdentitySet(values, base) {
  const links = new Set();
  for (const value of values) {
    try {
      links.add(canonicalPublicHttpUrl(value, base));
    } catch {
      // Non-HTTP(S), credential-bearing, and malformed links are outside the contract.
    }
  }
  return [...links]
    .map((value) => digestIdentity(evidenceIdentity.url.domain, value))
    .sort(codePointCompare);
}

function digestIdentity(domain, value) {
  return createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

function codePointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
