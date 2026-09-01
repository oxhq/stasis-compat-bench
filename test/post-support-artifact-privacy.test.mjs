import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPostSupportArtifactPrivacy,
  serializePostSupportArtifact,
} from "../src/post-support/artifact-privacy.mjs";

test("post-support serializer accepts typed evidence without false path or engine-code rejections", () => {
  const value = {
    code: "ERR_FAILED",
    networkCode: "ENOTFOUND",
    ratio: "1/2",
    kind: "response_headers",
    cases: [{ checkpoints: [{ method: "GET", path: "/users", status: 200 }] }],
    repository: "oxhq/stasis",
    cookies: [{ name: "remember_token", valuePresent: true, expiresUnixTimeNs: "1" }],
    restoredCredentialPresent: true,
    persistentCookieCount: 1,
  };
  assert.equal(assertPostSupportArtifactPrivacy(value), value);
  assert.deepEqual(JSON.parse(serializePostSupportArtifact(value)), value);
});

test("post-support serializer accepts projected unsupported-work facts and rejects private extensions", () => {
  const value = {
    cases: [{
      checkpoints: [{
        result: {
          unsupportedWorkCount: 1,
          unsupportedWork: [{
            kind: "rendering_update",
            count: "1",
            reason: "inactive_rendering",
            timeSurface: "update_rendering",
          }],
          unsupportedWorkOmitted: 0,
        },
      }],
    }],
  };
  assert.deepEqual(JSON.parse(serializePostSupportArtifact(value)), value);

  const attack = structuredClone(value);
  attack.cases[0].checkpoints[0].result.unsupportedWork[0].credential =
    "PRIVATE_SENTINEL";
  assert.throws(() => serializePostSupportArtifact(attack), /sensitive key/u);
});

test("post-support serializer accepts only the frozen RWA route narratives in typed checkpoint actions", () => {
  const controls = [
    rwaCheckpointAction({ purpose: "record POST /login and navigation diagnostics" }),
    rwaCheckpointAction({ purpose: "record POST /login status and navigation diagnostics" }),
    rwaCheckpointAction({ stage: "POST /users and sign-in form ready" }),
    rwaCheckpointAction({
      purpose: "record /users, /login, /graphql, /logout, and navigation diagnostics",
    }),
    rwaCheckpointAction({ purpose: "record POST /login" }),
  ];
  for (const control of controls) {
    assert.doesNotThrow(() => serializePostSupportArtifact(control));
  }
});

test("typed RWA action narratives still reject local, encoded, traversal, credential, and arbitrary slash text", () => {
  const frozenStage = "POST /users and sign-in form ready";
  const frozenPurpose = "record POST /login";
  const frozenStageBase64 = Buffer.from(frozenStage).toString("base64");
  const attacks = [
    rwaCheckpointAction({ stage: "/Users/private/proof.txt" }),
    rwaCheckpointAction({ purpose: "/home/private/proof.txt" }),
    rwaCheckpointAction({ stage: "C:\\Users\\private\\proof.txt" }),
    rwaCheckpointAction({ purpose: "\\\\server\\share\\private.txt" }),
    rwaCheckpointAction({ stage: "record POST /../private" }),
    rwaCheckpointAction({ purpose: "Authorization: Bearer PRIVATE_SENTINEL" }),
    rwaCheckpointAction({ stage: "arbitrary /route-bearing text" }),
    rwaCheckpointAction({ stage: encodeURIComponent("/Users/private/proof.txt") }),
    rwaCheckpointAction({ purpose: Buffer.from("/home/private/proof.txt").toString("base64") }),
    rwaCheckpointAction({ stage: encodeURIComponent("C:\\Users\\private\\proof.txt") }),
    rwaCheckpointAction({ purpose: encodeURIComponent("\\\\server\\share\\private.txt") }),
    rwaCheckpointAction({ stage: encodeURIComponent("record POST /../private") }),
    rwaCheckpointAction({
      purpose: Buffer.from("Authorization: Bearer PRIVATE_SENTINEL").toString("base64"),
    }),
    rwaCheckpointAction({ stage: encodeURIComponent(frozenStage) }),
    rwaCheckpointAction({ stage: frozenStageBase64 }),
    rwaCheckpointAction({ stage: `base64:${frozenStageBase64}` }),
    rwaCheckpointAction({ stage: frozenStage.replace("/", "／") }),
    rwaCheckpointAction({ stage: frozenStage.replace("/", "\u200b/") }),
    { cases: [{ checkpoints: [{ detail: { stage: frozenStage } }] }] },
    { stage: frozenStage },
    { wrapper: rwaCheckpointAction({ stage: frozenStage }) },
    { Cases: [{ checkpoints: [{ action: { stage: frozenStage } }] }] },
    { cases: [{ Checkpoints: [{ action: { stage: frozenStage } }] }] },
    { cases: [{ checkpoints: [{ Action: { stage: frozenStage } }] }] },
    { cases: [{ checkpoints: [{ action: { Stage: frozenStage } }] }] },
    { cases: [{ checkpoints: [{ action: { Purpose: frozenPurpose } }] }] },
    { cases: { 0: { checkpoints: [{ action: { stage: frozenStage } }] } } },
  ];
  for (const [index, attack] of attacks.entries()) {
    assert.throws(
      () => serializePostSupportArtifact(attack),
      /Post-support/u,
      `typed RWA narrative attack ${index + 1}: ${JSON.stringify(attack)}`,
    );
  }
});

test("post-support serializer fails closed on secret, state, header, and path variants", () => {
  const base64Authorization = Buffer.from("Authorization").toString("base64");
  const base64SetCookie = Buffer.from("Set-Cookie").toString("base64");
  const base64AuthKey = Buffer.from("auth").toString("base64");
  const base64CookieKey = Buffer.from("cookie").toString("base64");
  const percentThenBase64Credential = Buffer.from(
    encodeURIComponent("Authorization: Bearer PRIVATE_SENTINEL"),
  ).toString("base64");
  const base64ThenPercentCredential = encodeURIComponent(
    Buffer.from("Authorization: Bearer PRIVATE_SENTINEL").toString("base64"),
  );
  const wrappedAuthKey = `wrapped(${base64AuthKey})`;
  const prefixedCookieKey = `prefix-${base64CookieKey}`;
  const wrappedNameKey = `wrapped(${Buffer.from("name").toString("base64")})`;
  const base64CookiesKey = Buffer.from("cookies").toString("base64");
  const attacks = [
    { auth: "PRIVATE_SENTINEL" },
    { authValue: "PRIVATE_SENTINEL" },
    { cookieValue: "PRIVATE_SENTINEL" },
    { sessionCookie: "PRIVATE_SENTINEL" },
    { cookieJar: "PRIVATE_SENTINEL" },
    { rawCookie: "PRIVATE_SENTINEL" },
    { requestCookie: "PRIVATE_SENTINEL" },
    { cookiePayload: "PRIVATE_SENTINEL" },
    { cookieString: "PRIVATE_SENTINEL" },
    { credentials: "PRIVATE_SENTINEL" },
    { authorizationHeader: "PRIVATE_SENTINEL" },
    { authHeader: "PRIVATE_SENTINEL" },
    { proxyAuthorizationHeader: "PRIVATE_SENTINEL" },
    { passwordData: "PRIVATE_SENTINEL" },
    { secretData: "PRIVATE_SENTINEL" },
    { tokenData: "PRIVATE_SENTINEL" },
    { credentialData: "PRIVATE_SENTINEL" },
    { sessionData: "PRIVATE_SENTINEL" },
    { cookieMaterial: "PRIVATE_SENTINEL" },
    { authorizationString: "PRIVATE_SENTINEL" },
    { secretValue: "PRIVATE_SENTINEL" },
    { authorizationValue: "PRIVATE_SENTINEL" },
    { AUTHORIZATION_VALUE: "PRIVATE_SENTINEL" },
    { "Ａｕｔｈ": "PRIVATE_SENTINEL" },
    { "authorizati%6fnValue": "PRIVATE_SENTINEL" },
    { headers: { Authorization: "PRIVATE_SENTINEL" } },
    { record: { name: "Authorization", Value: "PRIVATE_SENTINEL" } },
    { record: { name: "safe", key: "Authorization", value: "PRIVATE_SENTINEL" } },
    { record: { name: "X-Auth-Token", value: "PRIVATE_SENTINEL" } },
    { record: { name: "X-Auth-Token", payload: "PRIVATE_SENTINEL" } },
    { record: { key: "x-api-token", content: "PRIVATE_SENTINEL" } },
    { record: { name: "Api-Key", payload: "PRIVATE_SENTINEL" } },
    { record: { key: "Api-Token", content: "PRIVATE_SENTINEL" } },
    { record: { name: "Credential", data: "PRIVATE_SENTINEL" } },
    { record: { name: "Secret", payload: "PRIVATE_SENTINEL" } },
    { record: { name: "Session", content: "PRIVATE_SENTINEL" } },
    { record: { name: "My-Secret", Value: "PRIVATE_SENTINEL" } },
    { record: ["X-Access-Token", "PRIVATE_SENTINEL"] },
    { record: { name: "X-CSRF-Token", value: "PRIVATE_SENTINEL" } },
    { record: { NaMe: "Set-Cookie", vAlUe: "PRIVATE_SENTINEL" } },
    { record: { headerName: "Authorization", benignCount: 1 } },
    { record: { name: "Authorizati%6fn", benignCount: 1 } },
    { record: ["Authorization", "PRIVATE_SENTINEL"] },
    { record: ["Set%2dCookie", "PRIVATE_SENTINEL"] },
    { nested: { records: [["Set-Cookie", "PRIVATE_SENTINEL"]] } },
    { state: { sensitive: true, origins: [] } },
    { stateBlob: "PRIVATE_SENTINEL" },
    { sessionStateToken: "PRIVATE_SENTINEL" },
    { cookieHeader: "PRIVATE_SENTINEL" },
    {
      cookies: [{
        name: "session",
        value: "PRIVATE_SENTINEL",
        valuePresent: true,
        expiresUnixTimeNs: null,
      }],
    },
    { detail: "C:\\Users\\private\\proof.txt" },
    { detail: "localPath:C:\\Users\\private\\proof.txt" },
    { detail: "wrapped[E:/stasis/private/proof.txt]" },
    { detail: "file:///E:/stasis/private/proof.txt" },
    { detail: "file:///E:\\stasis\\private\\proof.txt" },
    { detail: encodeURIComponent(encodeURIComponent(encodeURIComponent("C:\\Users\\private\\proof.txt"))) },
    { detail: Buffer.from("C:\\Users\\private\\proof.txt").toString("base64") },
    { detail: "/home/private/proof.txt" },
    { detail: "localPath:/Users/private/proof.txt" },
    { detail: "localPath:\\Users\\private\\proof.txt" },
    { detail: "localPath:/workspace/stasis/private.txt" },
    { detail: "localPath:/mnt/e/stasis/private.txt" },
    { detail: "localPath:/data/private.txt" },
    { detail: "prefix //host/private/proof.txt" },
    { detail: "https://user:password@example.test/" },
    { detail: "ftp://user:password@example.test/" },
    { detail: '{"password":"PRIVATE_SENTINEL"}' },
    { detail: '{"cookie":"session=PRIVATE_SENTINEL"}' },
    { detail: '{"Authorization":"PRIVATE_SENTINEL"}' },
    { detail: '{\\"Cookie\\":\\"session=PRIVATE_SENTINEL\\"}' },
    { detail: '{\\"Password\\":\\"PRIVATE_SENTINEL\\"}' },
    { detail: "-----BEGIN PRIVATE KEY----- PRIVATE_SENTINEL" },
    { detail: Buffer.from('{"password":"PRIVATE_SENTINEL"}').toString("base64") },
    { detail: encodeURIComponent("ftp://user:password@example.test/") },
    { detail: "Authorization: Bearer PRIVATE_SENTINEL" },
    { detail: "Ａｕｔｈｏｒｉｚａｔｉｏｎ： Bearer PRIVATE_SENTINEL" },
    { detail: "Authoriza\u200btion: Bearer PRIVATE_SENTINEL" },
    { detail: encodeURIComponent(encodeURIComponent("Authorization: Bearer PRIVATE_SENTINEL")) },
    { detail: Buffer.from("Authorization: Bearer PRIVATE_SENTINEL").toString("base64") },
    { detail: Buffer.from("Authorization: Bearer PRIVATE_SENTINEL").toString("base64url") },
    { detail: "Bearer PRIVATE_SENTINEL" },
    { restoredCredentialPresent: "PRIVATE_SENTINEL" },
    { persistentCookieCount: "PRIVATE_SENTINEL" },
    { [base64AuthKey]: "PRIVATE_SENTINEL" },
    { [base64CookieKey]: "raw-cookie-secret" },
    { [wrappedAuthKey]: "PRIVATE_SENTINEL" },
    { [prefixedCookieKey]: "PRIVATE_SENTINEL" },
    { record: { [wrappedNameKey]: "Authorization", value: "PRIVATE_SENTINEL" } },
    { [base64CookiesKey]: [{ name: "session", value: "PRIVATE_SENTINEL" }] },
    { "Y29v.a2llVmFsdWU=": "PRIVATE_SENTINEL" },
    {
      [`wrapped(${base64CookiesKey})`]: [{
        name: "session",
        value: "PRIVATE_SENTINEL",
      }],
    },
    { record: { name: base64Authorization, value: "PRIVATE_SENTINEL" } },
    { record: [base64SetCookie, "PRIVATE_SENTINEL"] },
    { detail: percentThenBase64Credential },
    { detail: base64ThenPercentCredential },
    { detail: encodeLayers("Authorization: Bearer PRIVATE_SENTINEL", 9) },
    { detail: wrapBase64Layers("typed safe detail", 9) },
    { path: "/workspace/private/secret.txt" },
    { path: "/mnt/data/private/secret.txt" },
    { path: "/srv/build/private/secret.txt" },
  ];
  for (const [index, attack] of attacks.entries()) {
    assert.throws(
      () => serializePostSupportArtifact(attack),
      /Post-support/u,
      `privacy attack ${index + 1}: ${JSON.stringify(attack)}`,
    );
  }
});

test("post-support serializer accepts adjacent bounded and encoded safe controls", () => {
  const controls = [
    { detail: Buffer.from("typed safe detail").toString("base64") },
    { detail: Buffer.from(encodeURIComponent("typed safe detail")).toString("base64") },
    { detail: encodeURIComponent(Buffer.from("typed safe detail").toString("base64")) },
    { detail: encodeLayers("typed safe detail", 8) },
    { detail: wrapBase64Layers("typed safe detail", 8) },
    { [Buffer.from("typedCount").toString("base64")]: 1 },
  ];
  for (const control of controls) {
    assert.doesNotThrow(() => serializePostSupportArtifact(control));
  }
  assert.throws(
    () => serializePostSupportArtifact({ detail: encodeLayers("typed safe detail", 9) }),
    /exceeds 8 decode layers/u,
  );
});

test("five independent final-audit encoding bypass reproductions fail closed", () => {
  const attacks = [
    { [Buffer.from("cookie").toString("base64")]: "raw-cookie-secret" },
    {
      record: {
        name: Buffer.from("Authorization").toString("base64"),
        value: "PRIVATE_SENTINEL",
      },
    },
    {
      record: [
        Buffer.from("Set-Cookie").toString("base64"),
        "PRIVATE_SENTINEL",
      ],
    },
    {
      detail: Buffer.from(
        encodeURIComponent("Authorization: Bearer PRIVATE_SENTINEL"),
      ).toString("base64"),
    },
    { detail: encodeLayers("Authorization: Bearer PRIVATE_SENTINEL", 9) },
  ];
  for (const [index, attack] of attacks.entries()) {
    assert.throws(
      () => serializePostSupportArtifact(attack),
      /Post-support/u,
      `final-audit encoding bypass ${index + 1}`,
    );
  }
});

test("embedded, wrapped, and case-insensitive labeled Base64 cannot hide credentials or paths", () => {
  const credential = Buffer.from("Authorization: Bearer PRIVATE_SENTINEL").toString("base64");
  const localPath = Buffer.from("C:\\Users\\private\\proof.txt").toString("base64");
  const attacks = [
    { detail: `BASE64:${credential}` },
    { detail: `bAsE64:${localPath}` },
    { detail: `payload=${credential}` },
    { detail: encodeURIComponent(`payload=${credential}`) },
    { detail: `credential ${credential}` },
    { detail: `blob ${localPath}` },
    { detail: `wrapped(${credential})` },
    { detail: "QXV0.aG9y.aXph.dGlv.bjog.QmVh.cmVy.IFNF.Q1JF.VDEy.MzQ=" },
    { detail: "base64:QXV0.aG9y.aXph.dGlv.bjog.QmVh.cmVy.IFNF.Q1JF.VDEy.MzQ=" },
    { detail: "QXV0-aG9y-aXph-dGlv-bjog-QmVh-cmVy-IFNF-Q1JF-VDEy-MzQ=" },
    { detail: "Zmls.ZTov.Ly9F.Oi9w.cml2.YXRl.L3Nl.Y3Jl.dC50.eHQ=" },
    { detail: "QXV0:aG9y:aXph:dGlv:bjog:QmVh:cmVy:IFBS:SVZB:VEVf:U0VO:VElO:RUw=" },
    { detail: "QXV0!aG9y!aXph!dGlv!bjog!QmVh!cmVy!IFBS!SVZB!VEVf!U0VO!VElO!RUw=" },
    { detail: "QXV0..aG9y..aXph..dGlv..bjog..QmVh..cmVy..IFBS..SVZB..VEVf..U0VO..VElO..RUw=" },
    { detail: "QXV0.aG9y-aXph.dGlv-bjog.QmVh-cmVy.IFBS-SVZB.VEVf-U0VO.VElO-RUw=" },
    { detail: "QXV0 aG9y aXph dGlv bjog QmVh cmVy IFBS SVZB VEVf U0VO VElO RUw=" },
    { detail: "QXV0_aG9y_aXph_dGlv_bjog_QmVh_cmVy_IFBS_SVZB_VEVf_U0VO_VElO_RUw=" },
    { detail: "QXV0|aG9y|aXph|dGlv|bjog|QmVh|cmVy|IFBS|SVZB|VEVf|U0VO|VElO|RUw=" },
    { detail: "wrapped(QXV0:aG9y:aXph:dGlv:bjog:QmVh:cmVy:IFBS:SVZB:VEVf:U0VO:VElO:RUw=)" },
    { detail: "Zmls:ZTov:Ly9F:Oi9w:cml2:YXRl:L3Nl:Y3Jl:dC50:eHQ=" },
    { detail: "QXV.0aG.9ya.Xph.dGl.vbj.ogQ.mVh.cmV.yIF.BSS.VZB.VEV.fU0.VOV.ElO.RUw.=" },
    { detail: "QXV.0aG9y:aXp.hdGlv:bjo.gQmVh:cmV.yIFBS:SVZ.BVEVf:U0V.OVElO:RUw.=" },
    { detail: segmentBase64ByWidth("Authorization: Bearer PRIVATE_SENTINEL", 1, "!") },
    { detail: segmentBase64ByWidth("Authorization: Bearer PRIVATE_SENTINEL", 2, "|") },
    { detail: segmentBase64ByWidth("Authorization: Bearer PRIVATE_SENTINEL", 6, "..") },
    { detail: "Qzp:cVXNl!cnN:ccHJp!dmF:0ZVxw!cm9:vZi50!eHQ:=" },
  ];
  for (const [index, attack] of attacks.entries()) {
    assert.throws(
      () => serializePostSupportArtifact(attack),
      /Post-support/u,
      `embedded Base64 attack ${index + 1}`,
    );
  }

  const safe = Buffer.from("typed safe detail").toString("base64");
  const controls = [
    { detail: `BASE64:${safe}` },
    { detail: `payload=${safe}` },
    { detail: encodeURIComponent(`payload=${safe}`) },
    { detail: `label ${safe}` },
    { detail: `payload=${"a".repeat(64)}` },
    { detail: segmentBase64("typed safe detail", ".") },
    { detail: segmentBase64("typed safe detail", "-") },
    { detail: "foo.bar" },
    { detail: "ERR-FAILED" },
    { detail: "error.code.with.parts" },
    { detail: "1/2" },
    { record: { name: "case-id", payload: "typed" } },
    { code: "ERR_FAILED", networkCode: "ENOTFOUND", ratio: "1/2" },
  ];
  for (const control of controls) {
    assert.doesNotThrow(() => serializePostSupportArtifact(control));
  }

  const boundedCandidates = Array.from(
    { length: 33 },
    (_value, index) => Buffer.from(`typed safe candidate ${String(index).padStart(2, "0")}`).toString("base64"),
  );
  assert.doesNotThrow(
    () => serializePostSupportArtifact({ detail: boundedCandidates.slice(0, 32).join(" ") }),
  );
  assert.throws(
    () => serializePostSupportArtifact({ detail: boundedCandidates.join(" ") }),
    /exceeds 32 embedded Base64 candidates/u,
  );
  assert.throws(
    () => serializePostSupportArtifact({ detail: "A".repeat(16_385) }),
    /oversized encoded text/u,
  );
});

test("post-support serializer rejects accessors, toJSON hooks, symbols, functions, and cycles", () => {
  const accessor = {};
  Object.defineProperty(accessor, "detail", {
    enumerable: true,
    get() { return "PRIVATE_SENTINEL"; },
  });
  const hiddenToJson = { safe: true };
  Object.defineProperty(hiddenToJson, "toJSON", {
    enumerable: false,
    value() { return { headers: { Authorization: "PRIVATE_SENTINEL" } }; },
  });
  const withSymbol = { safe: true, [Symbol("private")]: "PRIVATE_SENTINEL" };
  const withFunction = { safe: () => "PRIVATE_SENTINEL" };
  const cycle = { safe: true };
  cycle.self = cycle;
  const sparse = new Array(1);
  for (const attack of [accessor, hiddenToJson, withSymbol, withFunction, cycle, sparse, { count: NaN }]) {
    assert.throws(() => serializePostSupportArtifact(attack), /Post-support/u);
  }
});

test("post-support serializer snapshots descriptor values instead of re-reading a mutable proxy", () => {
  let ownKeyReads = 0;
  const target = { safe: "typed" };
  const proxy = new Proxy(target, {
    ownKeys() {
      ownKeyReads += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_target, key) {
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: key === "safe" ? "typed" : undefined,
      };
    },
    get(_target, key) {
      if (key === "safe") return "Authorization: Bearer PRIVATE_SENTINEL";
      return Reflect.get(target, key);
    },
  });
  assert.deepEqual(JSON.parse(serializePostSupportArtifact(proxy)), { safe: "typed" });
  assert.equal(ownKeyReads >= 1, true);
});

function encodeLayers(value, count) {
  let encoded = value;
  for (let index = 0; index < count; index += 1) encoded = encodeURIComponent(encoded);
  return encoded;
}

function wrapBase64Layers(value, count) {
  let encoded = value;
  for (let index = 0; index < count; index += 1) {
    encoded = `wrapped(${Buffer.from(encoded).toString("base64")})`;
  }
  return encoded;
}

function segmentBase64(value, delimiter) {
  return Buffer.from(value).toString("base64").match(/.{1,4}/gu).join(delimiter);
}

function segmentBase64ByWidth(value, width, delimiter) {
  return Buffer.from(value).toString("base64").match(new RegExp(`.{1,${width}}`, "gu")).join(delimiter);
}

function rwaCheckpointAction(action) {
  return { cases: [{ checkpoints: [{ action }] }] };
}
