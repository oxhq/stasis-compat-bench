import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import {
  projectBrowserError,
  projectCrawleeSkipReason,
  projectHarnessError,
  runBaselinePreflightObservation,
} from "../src/wild/baseline-preflight.mjs";
import {
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "../src/wild/normalize.mjs";

test("baseline preflight performs one read-only root observation without retries", async () => {
  const methods = [];
  const server = createServer((request, response) => {
    methods.push(request.method);
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end('<!doctype html><title>  Fixture\n title </title><a href="/next#fragment">next</a>');
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const requestedUrl = `http://127.0.0.1:${address.port}/`;
  const allowLocalFixture = async (value) => ({
    url: new URL(value).href,
    hostname: new URL(value).hostname,
    addressCount: 1,
    families: [4],
  });
  try {
    const result = await runBaselinePreflightObservation(
      { rank: 1, stratumId: "fixture", requestedUrl },
      { inspect: allowLocalFixture },
    );
    assert.equal(result.status, "success");
    assert.deepEqual(result.extraction.titleIdentity, normalizeTitleIdentity("Fixture title"));
    assert.deepEqual(result.extraction.linkIdentities, [
      publicHttpUrlIdentity(`http://127.0.0.1:${address.port}/next`),
    ]);
    assert.deepEqual(methods, ["GET"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("baseline observations commit redirect and link queries without retaining them", async () => {
  const methods = [];
  const server = createServer((request, response) => {
    methods.push(request.method);
    if (request.url === "/") {
      response.writeHead(302, { Location: "/final?opaque=redirect-secret#ignored" });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end('<!doctype html><title>Final</title><a href="next?opaque=link-secret#ignored">next</a>');
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const requestedUrl = `http://127.0.0.1:${address.port}/`;
  const allowLocalFixture = async (value) => ({
    url: new URL(value).href,
    hostname: new URL(value).hostname,
    addressCount: 1,
    families: [4],
  });
  try {
    const result = await runBaselinePreflightObservation(
      { rank: 2, stratumId: "fixture", requestedUrl },
      { inspect: allowLocalFixture },
    );
    assert.equal(result.status, "success");
    assert.equal(
      result.finalUrlIdentity,
      publicHttpUrlIdentity(`http://127.0.0.1:${address.port}/final?opaque=redirect-secret`),
    );
    assert.deepEqual(result.extraction.linkIdentities, [
      publicHttpUrlIdentity(`http://127.0.0.1:${address.port}/next?opaque=link-secret`),
    ]);
    assert.equal(JSON.stringify(result).includes("redirect-secret"), false);
    assert.equal(JSON.stringify(result).includes("link-secret"), false);
    assert.deepEqual(methods, ["GET", "GET"]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("browser and harness errors preserve only frozen dependency codes", () => {
  for (const code of ["ENOTFOUND", "ERR_FAILED", "ECONNRESET", "ERR_TIMED_OUT"]) {
    const error = Object.assign(new Error("omitted dependency detail"), { code });
    assert.equal(projectBrowserError(error).code, code);
    assert.equal(projectHarnessError(error).code, code);
  }

  const sharedCode = Object.assign(new Error("omitted shared detail"), {
    code: "navigation_failed",
  });
  assert.equal(projectHarnessError(sharedCode).code, "navigation_failed");

  for (const code of ["PRIVATE_UPPERCASE_CODE", "arbitrary-private-code", "C:\\private\\path"]) {
    const error = Object.assign(new Error("private message"), { code });
    const browser = projectBrowserError(error);
    const harness = projectHarnessError(error);
    assert.equal(browser.code, "unclassified_error", code);
    assert.equal(harness.code, "unclassified_error", code);
    assert.equal(JSON.stringify([browser, harness]).includes(code), false, code);
    assert.equal(browser.messageOmitted, true, code);
    assert.equal(harness.messageOmitted, true, code);
  }
});

test("Crawlee skip reasons use an exact closed vocabulary", () => {
  for (const reason of ["robotsTxt", "limit", "enqueueLimit", "filters", "redirect", "depth"]) {
    assert.equal(projectCrawleeSkipReason(reason), reason);
  }
  assert.equal(projectCrawleeSkipReason("opaque private reason"), "unclassified_error");
  assert.equal(projectCrawleeSkipReason(undefined), "unclassified_error");
});
