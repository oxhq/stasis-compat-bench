import assert from "node:assert/strict";
import test from "node:test";

import { PublicTargetError } from "../src/wild/public-target.mjs";
import {
  checkRobotsPermission,
  isExactAllowedRobotsDecision,
} from "../src/wild/robots.mjs";

test("only the exact bounded allowed tuple can admit a target", () => {
  assert.equal(isExactAllowedRobotsDecision({
    status: "allowed",
    reason: "robots_allowed",
    redirectCount: 0,
  }), true);
  assert.equal(isExactAllowedRobotsDecision({
    status: "allowed",
    reason: "robots_not_found",
    redirectCount: 5,
  }), true);
  for (const value of [
    { status: "allowed", reason: "opaque", redirectCount: 0 },
    { status: "allowed", reason: "robots_allowed", redirectCount: -1 },
    { status: "allowed", reason: "robots_allowed", redirectCount: 6 },
    { status: "allowed", reason: "robots_allowed", redirectCount: 0, extra: true },
  ]) {
    assert.equal(isExactAllowedRobotsDecision(value), false);
  }
});

const allowInspect = async (value) => ({ url: value, hostname: new URL(value).hostname, addressCount: 1, families: [4] });

test("robots parser honors an explicit disallow for the frozen user agent", async () => {
  const fetchImpl = async () => new Response(
    "User-agent: StasisCompatibilityCensus/1.0\nDisallow: /\n",
    { status: 200, headers: { "content-type": "text/plain" } },
  );
  const result = await checkRobotsPermission("https://example.com/", { fetchImpl, inspect: allowInspect });
  assert.deepEqual(result, { status: "denied", reason: "robots_disallowed", redirectCount: 0 });
});

test("only an exact 404 is treated as no robots file", async () => {
  const notFound = await checkRobotsPermission("https://example.com/", {
    fetchImpl: async () => new Response("", { status: 404 }),
    inspect: allowInspect,
  });
  assert.equal(notFound.status, "allowed");
  assert.equal(notFound.reason, "robots_not_found");

  const unavailable = await checkRobotsPermission("https://example.com/", {
    fetchImpl: async () => new Response("", { status: 503 }),
    inspect: allowInspect,
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.reason, "robots_http_status");
});

test("robots redirects are safety-checked and fail closed", async () => {
  const fetchImpl = async () => new Response("", {
    status: 302,
    headers: { location: "https://metadata.internal/robots.txt" },
  });
  const inspect = async (value) => {
    if (new URL(value).hostname.endsWith(".internal")) {
      throw new PublicTargetError("reserved_hostname_suffix");
    }
    return allowInspect(value);
  };
  const result = await checkRobotsPermission("https://example.com/", { fetchImpl, inspect });
  assert.equal(result.status, "unsafe");
  assert.equal(result.reason, "robots_target_rejected");
  assert.equal(result.detail.code, "reserved_hostname_suffix");
});

test("oversized robots bodies are not silently accepted", async () => {
  const result = await checkRobotsPermission("https://example.com/", {
    fetchImpl: async () => new Response("x", { status: 200, headers: { "content-length": "999" } }),
    inspect: allowInspect,
    maxBytes: 10,
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "robots_too_large");
});
