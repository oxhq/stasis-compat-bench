import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertWildArtifactPrivacy,
  serializeWildArtifact,
  writeWildArtifactJson,
} from "../src/wild/artifact-privacy.mjs";
import { trancoSourceIdentity } from "../src/wild/config.mjs";
import { normalizeTitleIdentity } from "../src/wild/normalize.mjs";

test("wild artifact privacy accepts only allowlisted raw URLs and projected evidence", () => {
  assert.doesNotThrow(() => assertWildArtifactPrivacy({
    requestedUrl: "https://example.com/",
    source: { downloadUrl: trancoSourceIdentity.downloadUrl },
    runtime: {
      nodeExecutableBasename: "node.exe",
      nodeExecutableSha256: "a".repeat(64),
    },
    extraction: {
      titleIdentity: normalizeTitleIdentity("/news"),
      linkIdentities: ["b".repeat(64)],
    },
    artifact: "wild/raw/001-baseline.json",
    ratio: "ratio:1/2",
  }));

  for (const value of [
    "C:\\Users\\person\\node.exe",
    "/home/person/node",
    "prefix C:\\Users\\person\\node.exe suffix",
    "prefix /home/person/node suffix",
    "file:///C:/Users/person/node.exe",
    "file:C:/Users/person/node.exe",
    "path=C:\\Users\\person\\node.exe",
    "path=C:Users\\person\\node.exe",
    "path=/usr/private/node",
    "path=/srv/private/node",
    "prefix /workspace/private/node suffix",
    "see https://example.com/path",
    "ftp://user:secret@example.com/private",
    "ws://user:secret@example.com/private",
    "https%3A%2F%2Fexample.com%2Fprivate",
    "https%253A%252F%252Fexample.com%252Fprivate",
    "password%3DPRIVATE_SENTINEL",
    "password%253DPRIVATE_SENTINEL",
    "password%25253DPRIVATE_SENTINEL",
    "C%3A%5CUsers%5CPrivate%5CMARKER",
    "C%25253A%25255CUsers%25255CPrivate%25255CMARKER",
    "https:%25252F%25252Fprivate-host%25252FMARKER",
    "path=//private-host/MARKER",
  ]) {
    assert.throws(
      () => assertWildArtifactPrivacy({ nested: { value } }),
      /Wild artifact contains/u,
      value,
    );
  }

  for (const requestedUrl of [
    "https://user:secret@example.com/path",
    "http://example.com/",
    "https://example.com/private/account",
    "https://example.com/reset;sessionid=opaque",
    "https://example.com/path?opaque=secret",
    "https://example.com/path#opaque",
  ]) {
    assert.throws(
      () => assertWildArtifactPrivacy({ requestedUrl }),
      /Wild artifact/u,
      requestedUrl,
    );
  }
  for (const value of [
    { nested: { requestedUrl: "https://example.com/" } },
    { "diagnostic.requestedUrl": "https://example.com/" },
    { downloadUrl: "https://example.com/download/source" },
    { nested: { downloadUrl: trancoSourceIdentity.downloadUrl } },
  ]) {
    assert.throws(
      () => assertWildArtifactPrivacy(value),
      /raw URL outside|unrecognized source download URL/u,
    );
  }
  assert.throws(
    () => assertWildArtifactPrivacy({ finalUrl: "https://example.com/path" }),
    /sensitive key|raw URL outside an allowlisted field/u,
  );
});

test("wild artifact privacy validates the exact JSON projection", () => {
  assert.doesNotThrow(() => assertWildArtifactPrivacy({
    classification: { currentUrl: { outcome: "equivalent" } },
  }));
  for (const currentUrl of [
    "https://example.com/private",
    { outcome: "unknown" },
    { outcome: "equivalent", raw: "https://example.com/private" },
  ]) {
    assert.throws(
      () => assertWildArtifactPrivacy({ classification: { currentUrl } }),
      /sensitive key/u,
    );
  }

  assert.throws(
    () => assertWildArtifactPrivacy(new URL("https://user:secret@example.com/?q=opaque#fragment")),
    /Wild artifact contains/u,
  );
  assert.throws(
    () => assertWildArtifactPrivacy({
      nested: { toJSON: () => "C:\\Users\\person\\secret.txt" },
    }),
    /absolute local path/u,
  );

  for (const key of [
    "api.key",
    "authorization ",
    "cookie",
    "cookies",
    "credentials",
    "auth",
    "db_password",
    "message ",
    "privateKey",
    "request.id",
    "set-cookie",
    "stderr_tail",
    "x-api-key",
    "x-request-id",
    "proxy-authorization",
    "requestId",
    "sessionId",
    "secretValue",
    "sourceId",
    "hostname",
    "id",
    "title",
    "userId",
  ]) {
    assert.throws(
      () => assertWildArtifactPrivacy({ [key]: "opaque" }),
      /sensitive key/u,
      key,
    );
  }

  for (const value of [
    { metadata: [["Cookie", "session=opaque"]] },
    { metadata: [["X-API-Key", "opaque"]] },
    { metadata: [["x.api.key", "opaque"]] },
    { metadata: [["proxy_authorization", "opaque"]] },
    { record: { key: "Authorization", value: "PRIVATE_SENTINEL" } },
    { record: { name: "ordinary", key: "Authorization", value: "PRIVATE_SENTINEL" } },
    { record: { name: "Cookie", content: "PRIVATE_SENTINEL" } },
    { record: { name: "Authorization", Value: "PRIVATE_SENTINEL" } },
    { record: { Name: "Authorization", value: "PRIVATE_SENTINEL" } },
    { record: { name: "Authorization", "v a l u e": "PRIVATE_SENTINEL" } },
    { value: "x-api-key: opaque" },
    { value: "password=opaque" },
    { value: "callback?code=opaque" },
  ]) {
    assert.throws(
      () => assertWildArtifactPrivacy(value),
      /sensitive header (?:tuple|record)|credential-like string material/u,
    );
  }

  assert.throws(
    () => assertWildArtifactPrivacy({ "pass%77ord": "PRIVATE_SENTINEL" }),
    /encoded key material/u,
  );

  let headerNameReads = 0;
  assert.throws(
    () => serializeWildArtifact({
      record: {
        get name() {
          headerNameReads += 1;
          return headerNameReads === 1 ? "authorization" : "ordinary";
        },
        value: "opaque-header-value",
      },
    }),
    /sensitive header record/u,
  );
  assert.equal(headerNameReads, 3);

  let repeatedReads = 0;
  const repeated = {
    get detail() {
      repeatedReads += 1;
      return repeatedReads === 1 ? "safe" : "path=/srv/private/late.txt";
    },
  };
  assert.throws(
    () => serializeWildArtifact({ first: repeated, second: repeated }),
    /embedded local path text/u,
  );
  assert.equal(repeatedReads, 2);

  assert.doesNotThrow(() => serializeWildArtifact({
    code: "eligible",
    failureCode: "unsupported_rendering",
    excludedCode: "navigation_timeout",
  }));
  for (const key of ["code", "failureCode", "excludedCode", "dnsCode"]) {
    assert.throws(
      () => serializeWildArtifact({ nested: { [key]: "PRIVATE_SENTINEL" } }),
      /unrecognized machine code/u,
      key,
    );
  }

  for (const value of [
    { error: { messageOmitted: "PRIVATE_SENTINEL" } },
    { error: { stderrTailBytes: "PRIVATE_SENTINEL" } },
    { error: { opaqueIdentifiersOmitted: 1 } },
  ]) {
    assert.throws(
      () => serializeWildArtifact(value),
      /invalid redaction metadata/u,
    );
  }
  assert.doesNotThrow(() => serializeWildArtifact({
    error: {
      messageOmitted: true,
      stderrTailOmitted: false,
      stderrTailBytes: 0,
      opaqueIdentifiersOmitted: true,
    },
  }));

  let getterReads = 0;
  const bytes = serializeWildArtifact({
    get value() {
      getterReads += 1;
      return getterReads === 1 ? "safe" : "C:\\Users\\person\\late.txt";
    },
  });
  assert.equal(getterReads, 1);
  assert.deepEqual(JSON.parse(bytes), { value: "safe" });
});

test("wild writer persists the same bytes it validates and returns an internal absolute destination", async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "stasis-wild-private-bytes-"));
  const priorArtifactRoot = process.env.STASIS_COMPAT_ARTIFACT_DIR;
  process.env.STASIS_COMPAT_ARTIFACT_DIR = temporaryRoot;
  t.after(async () => {
    if (priorArtifactRoot === undefined) delete process.env.STASIS_COMPAT_ARTIFACT_DIR;
    else process.env.STASIS_COMPAT_ARTIFACT_DIR = priorArtifactRoot;
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  let reads = 0;
  const destination = await writeWildArtifactJson("wild/exact.json", {
    requestedUrl: "https://example.com/",
    get state() {
      reads += 1;
      return reads === 1 ? "stable" : "C:\\Users\\person\\changed.txt";
    },
  });
  assert.equal(reads, 1);
  assert.equal(path.isAbsolute(destination), true);
  assert.equal(
    await readFile(destination, "utf8"),
    '{\n  "requestedUrl": "https://example.com/",\n  "state": "stable"\n}\n',
  );

  for (const invalidPath of [
    "../escape.json",
    "wild/report.json:stream",
    "wild/file.json::$DATA",
    "CON.json",
    "wild/trailing.json.",
    "wild/trailing .json",
    "wild\\backslash.json",
    "wild/not-json.txt",
    path.join(temporaryRoot, "absolute.json"),
  ]) {
    await assert.rejects(
      () => writeWildArtifactJson(invalidPath, { state: "safe" }),
      /portable relative JSON path/u,
      invalidPath,
    );
  }
});
