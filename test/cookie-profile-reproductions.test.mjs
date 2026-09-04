import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTypedTerminal,
  cookieProfileReproductionDefinitions as definitions,
  createCrossSiteSubresourceFixture,
  createPersistentLoginFixture,
  runLocalCookieProfileReproductions,
} from "../src/minimizers/cookie-profile.mjs";

test("definitions bind the persistent and SameSite authoritative representatives", () => {
  assert.deepEqual(definitions.persistent.rwa.caseIds, [
    "auth-02-login-home-redirect",
    "auth-03-remember-user-thirty-days",
  ]);
  assert.deepEqual(
    [definitions.persistent.code, definitions.persistent.phase, definitions.persistent.wild.slot],
    ["unsupported_persistent_cookie", "settle", 1],
  );
  assert.deepEqual(
    [definitions.sameSite.code, definitions.sameSite.phase, definitions.sameSite.wild.slot],
    ["unsupported_cookie_same_site_context", "openSession", 9],
  );
});

test("typed terminal requires the exact partial fail-stop result", () => {
  const terminal = {
    phase: "settle",
    error: {
      name: "StasisProtocolError",
      code: "unsupported_persistent_cookie",
      fatal: false,
      stateEffect: "partial",
    },
    cleanup: { status: "passed", mode: "fail_stop_runtime_close" },
  };
  assert.equal(assertTypedTerminal(terminal, terminal.error.code, terminal.phase), terminal);
  assert.throws(
    () => assertTypedTerminal({ ...terminal, phase: "activate" }, terminal.error.code, terminal.phase),
    /Expected unsupported_persistent_cookie/u,
  );
});

test("fixtures expose the real minimal cookie paths", async (t) => {
  await t.test("same-site login response carries Max-Age", async () => {
    const local = await createPersistentLoginFixture();
    try {
      const page = await fetch(local.url).then((response) => response.text());
      const loginUrl = page.match(/fetch\("(http:\/\/127\.0\.0\.1:[0-9]+\/login)"/u)[1];
      const response = await fetch(loginUrl, { method: "POST" });
      assert.match(response.headers.get("set-cookie"), /Max-Age=2592000/u);
    } finally {
      await local.close();
    }
  });

  await t.test("parser-blocking resource uses a different loopback site", async () => {
    const local = await createCrossSiteSubresourceFixture();
    try {
      assert.equal(new URL(local.url).hostname, "127.0.0.1");
      assert.equal(new URL(local.resourceUrl).hostname, "127.0.0.2");
      assert.match(await fetch(local.url).then((response) => response.text()), /cross-site\.js/u);
    } finally {
      await local.close();
    }
  });
});

test("exact 0.3 candidate reproduces both typed cookie terminals", {
  skip: process.env.STASIS_COOKIE_REPRO_INTEGRATION !== "1",
}, async () => {
  const result = await runLocalCookieProfileReproductions(process.env.STASIS_EXECUTABLE);
  assert.deepEqual(
    result.scenarios.map(({ id, phase, error }) => ({ id, phase, code: error.code })),
    [
      { id: "persistent-login-response", phase: "settle", code: "unsupported_persistent_cookie" },
      { id: "cross-site-subresource", phase: "openSession", code: "unsupported_cookie_same_site_context" },
    ],
  );
  assert.equal(result.scenarios[0].networkEvidence.loginPostObserved, true);
  assert.equal(result.scenarios[1].networkEvidence.crossSiteRequestReachedServer, false);
});
