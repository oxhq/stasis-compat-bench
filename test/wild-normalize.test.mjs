import assert from "node:assert/strict";
import test from "node:test";

import { classifyChallengeSignals } from "../src/wild/baseline-preflight.mjs";
import {
  canonicalPublicHttpUrl,
  normalizeLinkIdentitySet,
  normalizeTitle,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "../src/wild/normalize.mjs";

test("wild evidence identities preserve query semantics without retaining raw values", () => {
  assert.equal(normalizeTitle("  A\n\t title  "), "A title");
  assert.deepEqual(normalizeTitleIdentity("  A\n\t title  "), {
    sha256: "08ae9db7bc33ebc9482709d537068086989920b35d7dd3dceff6d3859d56bb6f",
    codePointLength: 7,
    utf8Bytes: 7,
  });

  const first = publicHttpUrlIdentity("https://example.com/a?x=1#fragment");
  const sameWithoutFragment = publicHttpUrlIdentity("https://example.com/a?x=1#other");
  const differentQuery = publicHttpUrlIdentity("https://example.com/a?x=2");
  assert.equal(first, "39098e3887614491eea05483742c15f24b5068c8290fb64445480e73578cfe36");
  assert.equal(first, sameWithoutFragment);
  assert.notEqual(first, differentQuery);
  assert.equal(canonicalPublicHttpUrl("https://example.com/a?x=1#fragment"), "https://example.com/a?x=1");

  const identities = normalizeLinkIdentitySet([
    "/a?x=1#fragment",
    "/a?x=2",
    "/a?x=1#duplicate",
    "mailto:test@example.com",
    "https://user:secret@example.com/private",
  ], "https://example.com/root?base=retained");
  assert.deepEqual(identities, [
    "39098e3887614491eea05483742c15f24b5068c8290fb64445480e73578cfe36",
    "f1ba8f3f975bd58e42db6f314a87be388e6660cc117357c7d8049455f7c98d56",
  ]);
  assert.equal(JSON.stringify({ first, identities }).includes("x=1"), false);
});

test("relative link identity resolution uses the complete query-bearing base", () => {
  const fromQueryBearingBase = normalizeLinkIdentitySet(
    [""],
    "https://example.com/final?opaque=retained-only-in-memory#fragment",
  );
  assert.deepEqual(fromQueryBearingBase, [
    publicHttpUrlIdentity("https://example.com/final?opaque=retained-only-in-memory"),
  ]);
});

test("challenge classification uses explicit markers", () => {
  assert.equal(classifyChallengeSignals({ cloudflareSelector: true }), "cloudflare_challenge");
  assert.equal(classifyChallengeSignals({ captchaSelector: true }), "captcha_challenge");
  assert.equal(classifyChallengeSignals({ humanBody: true }), "human_verification");
  assert.equal(classifyChallengeSignals({}), null);
});
