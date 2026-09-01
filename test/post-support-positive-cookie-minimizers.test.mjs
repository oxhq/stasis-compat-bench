import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostSupportCandidateSpec,
  postSupportProfile,
  postSupportRevision,
} from "../src/post-support/candidate-identity.mjs";
import {
  assertAuthoritativePositiveCookieMinimizerResult,
  assertExactLocalhostResolution,
  assertLocalDistinctSameSiteFixture,
  assertPositiveCookieMinimizerResult,
  createPositivePersistentCookieFixture,
  createPositiveSameSiteFixture,
  exactLoopbackListenOptions,
  runPositiveCookieMinimizers,
  runSameSiteCookieMinimizer,
} from "../src/post-support/positive-cookie-minimizers.mjs";

const secret = "a".repeat(64);

test("positive fixture observations retain only counts and credential booleans", async (t) => {
  await t.test("persistent Max-Age cookie reaches a restored probe", async () => {
    const fixture = await createPositivePersistentCookieFixture(secret);
    try {
      const seed = await fetch(fixture.seedUrl);
      const cookie = seed.headers.get("set-cookie").split(";")[0];
      await fetch(fixture.probeUrl, { headers: { cookie } });
      assert.deepEqual(fixture.facts(), {
        seedRequestCount: 1,
        restoredRequestCount: 1,
        restoredCredentialPresent: true,
      });
      assert.equal(JSON.stringify(fixture.facts()).includes(secret), false);
    } finally {
      await fixture.close();
    }
  });

  await t.test("Lax cookie is present same-site and absent on a cross-site subresource", async () => {
    const fixture = await createPositiveSameSiteFixture(secret);
    try {
      const seed = await fetch(fixture.seedUrl);
      const cookie = seed.headers.get("set-cookie").split(";")[0];
      await fetch(fixture.sameSiteProbeUrl, { headers: { cookie } });
      const topLevel = await fetch(fixture.crossSiteTopLevelUrl).then((response) => response.text());
      const resourceUrl = topLevel.match(/src="([^"]+)"/u)[1];
      await fetch(resourceUrl);
      assert.deepEqual(fixture.facts(), {
        localhostResolutionNonempty: true,
        localhostResolutionOnlyExactLoopback: true,
        localhostResolutionValidatedBeforeRequests: true,
        dualLoopbackListenerCount: 2,
        resourceListenersSharePort: true,
        resourceIpv6Only: true,
        seedRequestCount: 1,
        seedHostHeaderMatchCount: 1,
        seedCredentialCount: 0,
        seedCookiePairCount: 0,
        sameSiteProbeRequestCount: 1,
        sameSiteHostHeaderMatchCount: 1,
        sameSiteCredentialCount: 1,
        sameSiteCookiePairCount: 1,
        sameSiteCredentialPresent: true,
        topLevelRequestCount: 1,
        topLevelHostHeaderMatchCount: 1,
        topLevelCredentialCount: 0,
        topLevelCookiePairCount: 0,
        crossSiteSubresourceRequestCount: 1,
        crossSiteHostHeaderMatchCount: 1,
        crossSiteCredentialCount: 0,
        crossSiteCookiePairCount: 0,
        crossSiteCredentialPresent: false,
        invalidHostRequestCount: 0,
      });
      assert.equal(new URL(fixture.seedUrl).hostname, "localhost");
      assert.equal(new URL(resourceUrl).hostname, "localhost");
      assert.equal(new URL(resourceUrl).port, new URL(fixture.seedUrl).port);
      assert.equal(fixture.canonicalCookieDomain, "localhost");
      assert.equal(assertExactLocalhostResolution(fixture.localhostResolution).length > 0, true);
      assert.deepEqual(fixture.resourceListenerHosts, ["127.0.0.1", "::1"]);
      assert.deepEqual(fixture.resourceListenerPorts, [
        Number(new URL(fixture.seedUrl).port),
        Number(new URL(fixture.seedUrl).port),
      ]);
      assert.equal(fixture.resourceListenerIpv6Only, true);
      assert.equal(assertLocalDistinctSameSiteFixture(fixture), fixture);
      assert.equal(JSON.stringify(fixture.facts()).includes(secret), false);
    } finally {
      await fixture.close();
    }
  });
});

test("orchestrator uses five fresh processes and emits no state, value, header, or path", async () => {
  let launches = 0;
  const closedRuntimes = [];
  const candidate = verifiedCandidate();
  const persistentFacts = {
    seedRequestCount: 1,
    restoredRequestCount: 1,
    restoredCredentialPresent: true,
  };
  const sameSiteFacts = exactSameSiteFacts();
  const result = await runPositiveCookieMinimizers(candidate, {
    launch: async () => {
      const runtimeIndex = launches++;
      return fakeRuntime(runtimeIndex, closedRuntimes);
    },
    makeSecret: () => secret,
    createPersistentFixture: async () => ({
      cookieName: "persistent",
      seedUrl: "http://fixture.test/persistent-seed",
      probeUrl: "http://fixture.test/persistent-probe",
      facts: () => ({ ...persistentFacts }),
      close: async () => undefined,
    }),
    createSameSiteFixture: async () => fakeSameSiteFixture(sameSiteFacts),
  });
  assert.equal(launches, 5);
  assert.deepEqual(closedRuntimes, [0, 1, 2, 3, 4]);
  assert.equal(result.scenarios[0].evidence.nonNullExpiryCount, 1);
  assert.equal(result.scenarios[1].evidence.crossSiteCredentialPresent, false);
  assert.throws(
    () => assertAuthoritativePositiveCookieMinimizerResult(result),
    /fresh direct in-process/u,
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("C:\\private"), false);
  assert.doesNotMatch(serialized, /set-cookie|cookieHeader|cookieValue|stateBlob/iu);
  assert.doesNotMatch(
    serialized,
    /"resourceListener(?:Hosts|Ports)"|"localhostResolution":|127\.0\.0\.1|::1/iu,
  );
});

test("localhost resolution and exact listener options fail closed before cookie work", async () => {
  assert.deepEqual(exactLoopbackListenOptions("127.0.0.1", 1234), {
    host: "127.0.0.1",
    port: 1234,
  });
  assert.deepEqual(exactLoopbackListenOptions("::1", 1234), {
    host: "::1",
    port: 1234,
    ipv6Only: true,
  });
  assert.throws(() => exactLoopbackListenOptions("0.0.0.0", 1234), /exact loopback/u);
  assert.deepEqual(assertExactLocalhostResolution([
    { address: "127.0.0.1", family: 4 },
    { address: "::1", family: 6 },
  ]), [
    { address: "127.0.0.1", family: 4 },
    { address: "::1", family: 6 },
  ]);
  for (const invalid of [
    [],
    [{ address: "127.0.0.2", family: 4 }],
    [{ address: "::ffff:127.0.0.1", family: 6 }],
    [{ address: "127.0.0.1", family: 6 }],
    [{ address: "127.0.0.1", family: 4 }, { address: "127.0.0.1", family: 4 }],
  ]) {
    assert.throws(() => assertExactLocalhostResolution(invalid), /localhost/u);
  }
  await assert.rejects(
    () => createPositiveSameSiteFixture(secret, { resolveLocalhost: async () => [] }),
    /at least one exact loopback/u,
  );
});

test("zero-injection cookie authority also requires the direct candidate brand", async () => {
  await assert.rejects(
    () => runPositiveCookieMinimizers(verifiedCandidate()),
    /direct default candidate verification output/u,
  );
});

test("a zero-own-key dependency Proxy cannot mint cookie authority", async () => {
  let runtimeIndex = 0;
  const injected = {
    launch: async () => fakeRuntime(runtimeIndex++, []),
    makeSecret: () => secret,
    createPersistentFixture: async () => ({
      cookieName: "persistent",
      seedUrl: "http://fixture.test/persistent-seed",
      probeUrl: "http://fixture.test/persistent-probe",
      facts: () => ({
        seedRequestCount: 1,
        restoredRequestCount: 1,
        restoredCredentialPresent: true,
      }),
      close: async () => undefined,
    }),
    createSameSiteFixture: async () => fakeSameSiteFixture(exactSameSiteFacts()),
  };
  const proxy = new Proxy({}, {
    get(_target, key) { return injected[key]; },
    ownKeys() { return []; },
    getOwnPropertyDescriptor() { return undefined; },
  });
  const result = await runPositiveCookieMinimizers(verifiedCandidate(), proxy);
  assert.equal(runtimeIndex, 5);
  assert.throws(
    () => assertAuthoritativePositiveCookieMinimizerResult(result),
    /fresh direct in-process/u,
  );
});

test("SameSite fixture fails closed on non-public Host and duplicate credentials", async (t) => {
  await t.test("direct listener access cannot impersonate the localhost resource site", async () => {
    const fixture = await createPositiveSameSiteFixture(secret);
    try {
      const port = new URL(fixture.seedUrl).port;
      const response = await fetch(`http://127.0.0.1:${port}/seed`);
      assert.equal(response.status, 400);
      assert.equal(fixture.facts().seedRequestCount, 1);
      assert.equal(fixture.facts().seedHostHeaderMatchCount, 0);
      assert.equal(fixture.facts().invalidHostRequestCount, 1);
    } finally {
      await fixture.close();
    }
  });

  await t.test("the same-site positive control requires one exact cookie pair", async () => {
    const fixture = await createPositiveSameSiteFixture(secret);
    try {
      const credential = `${fixture.cookieName}=${secret}`;
      const response = await fetch(fixture.sameSiteProbeUrl, {
        headers: { cookie: `${credential}; ${credential}` },
      });
      assert.equal(response.status, 200);
      assert.equal(fixture.facts().sameSiteCredentialCount, 2);
      assert.equal(fixture.facts().sameSiteCookiePairCount, 2);
      assert.equal(fixture.facts().sameSiteCredentialPresent, false);
    } finally {
      await fixture.close();
    }
  });
});

test("SameSite proof rejects weakened Host, positive-control, and negative-control evidence", async () => {
  const attacks = [
    ["invalid Host", { invalidHostRequestCount: 1 }],
    ["missing positive credential", {
      sameSiteCredentialCount: 0,
      sameSiteCookiePairCount: 0,
      sameSiteCredentialPresent: false,
    }],
    ["duplicate positive credential", {
      sameSiteCredentialCount: 2,
      sameSiteCookiePairCount: 2,
      sameSiteCredentialPresent: false,
    }],
    ["cross-site credential leak", {
      crossSiteCredentialCount: 1,
      crossSiteCookiePairCount: 1,
      crossSiteCredentialPresent: true,
    }],
    ["seed request carried a cookie", { seedCookiePairCount: 1 }],
    ["top-level request carried a cookie", { topLevelCookiePairCount: 1 }],
  ];
  for (const [label, override] of attacks) {
    let runtimeIndex = 0;
    await assert.rejects(
      runSameSiteCookieMinimizer({
        executablePath: "C:\\private\\stasis.exe",
        launch: async () => fakeSameSiteRuntime(runtimeIndex++),
        makeSecret: () => secret,
        createFixture: async () => fakeSameSiteFixture({ ...exactSameSiteFacts(), ...override }),
      }),
      /exact observations/u,
      label,
    );
    assert.equal(runtimeIndex, 3, label);
  }
});

test("result validator rejects added sensitive projections", () => {
  const valid = validCookieResult(verifiedCandidate().identity);
  assert.equal(assertPositiveCookieMinimizerResult(valid), valid);
  assert.throws(
    () => assertPositiveCookieMinimizerResult({ ...valid, cookieHeader: `proof=${secret}` }),
    /Invalid positive|Unsafe cookie proof property/u,
  );
  const attacks = [
    (() => {
      const value = structuredClone(valid);
      delete value.scenarios[0].evidence;
      return value;
    })(),
    (() => {
      const value = structuredClone(valid);
      value.scenarios[0].evidence.restoredCredentialPresent = false;
      return value;
    })(),
    (() => {
      const value = structuredClone(valid);
      delete value.scenarios[1].evidence.resourceIpv6Only;
      return value;
    })(),
    (() => {
      const value = structuredClone(valid);
      value.scenarios[1].evidence.sameSiteCredentialCount = 2;
      return value;
    })(),
    (() => {
      const value = structuredClone(valid);
      value.scenarios[0].evidence.untypedExtraCount = 1;
      return value;
    })(),
  ];
  for (const attack of attacks) {
    assert.throws(() => assertPositiveCookieMinimizerResult(attack), /Invalid positive/u);
    assert.throws(
      () => assertAuthoritativePositiveCookieMinimizerResult(attack),
      /Invalid positive/u,
    );
  }
  assert.throws(
    () => assertAuthoritativePositiveCookieMinimizerResult(structuredClone(valid)),
    /fresh direct in-process/u,
  );
});

function fakeRuntime(runtimeIndex, closedRuntimes) {
  return {
    async openSession(url, options) {
      assert.equal(options.profile, postSupportProfile);
      if ([1, 3, 4].includes(runtimeIndex)) assert.equal(options.state?.profile, postSupportProfile);
      const cookieName = runtimeIndex < 2 ? "persistent" : "same-site";
      return {
        stateToken: "opaque",
        async settle() { return { outcome: "quiescent" }; },
        async getCookies() {
          return {
            cookies: cookieName === "persistent"
              ? [{ name: cookieName, value: secret, expiresUnixTimeNs: 1n }]
              : [{
                  name: cookieName,
                  value: secret,
                  domain: "localhost",
                  sameSite: "lax",
                  expiresUnixTimeNs: null,
                }],
          };
        },
        async exportState() {
          return { state: { profile: postSupportProfile, sensitive: true, cookies: [] } };
        },
        async close() { assert.equal(typeof url, "string"); },
      };
    },
    async close() { closedRuntimes.push(runtimeIndex); },
  };
}

function fakeSameSiteRuntime(runtimeIndex) {
  return {
    async openSession(_url, options) {
      assert.equal(options.profile, postSupportProfile);
      if (runtimeIndex > 0) assert.equal(options.state?.profile, postSupportProfile);
      return {
        stateToken: "opaque",
        async settle() { return { outcome: "quiescent" }; },
        async getCookies() {
          return {
            cookies: [{
              name: "same-site",
              value: secret,
              domain: "localhost",
              sameSite: "lax",
              expiresUnixTimeNs: null,
            }],
          };
        },
        async exportState() {
          return { state: { profile: postSupportProfile, sensitive: true, cookies: [] } };
        },
        async close() {},
      };
    },
    async close() {},
  };
}

function fakeSameSiteFixture(facts) {
  return {
    cookieName: "same-site",
    canonicalCookieDomain: "localhost",
    localhostResolution: [
      { address: "127.0.0.1", family: 4 },
      { address: "::1", family: 6 },
    ],
    resourceListenerHosts: ["127.0.0.1", "::1"],
    resourceListenerPorts: [1234, 1234],
    resourceListenerIpv6Only: true,
    seedUrl: "http://localhost:1234/seed",
    sameSiteProbeUrl: "http://localhost:1234/same-site-probe",
    crossSiteTopLevelUrl: "http://127.0.0.1:1235/",
    facts: () => ({ ...facts }),
    close: async () => undefined,
  };
}

function exactSameSiteFacts() {
  return {
    localhostResolutionNonempty: true,
    localhostResolutionOnlyExactLoopback: true,
    localhostResolutionValidatedBeforeRequests: true,
    dualLoopbackListenerCount: 2,
    resourceListenersSharePort: true,
    resourceIpv6Only: true,
    seedRequestCount: 1,
    seedHostHeaderMatchCount: 1,
    seedCredentialCount: 0,
    seedCookiePairCount: 0,
    sameSiteProbeRequestCount: 1,
    sameSiteHostHeaderMatchCount: 1,
    sameSiteCredentialCount: 1,
    sameSiteCookiePairCount: 1,
    sameSiteCredentialPresent: true,
    topLevelRequestCount: 1,
    topLevelHostHeaderMatchCount: 1,
    topLevelCredentialCount: 0,
    topLevelCookiePairCount: 0,
    crossSiteSubresourceRequestCount: 1,
    crossSiteHostHeaderMatchCount: 1,
    crossSiteCredentialCount: 0,
    crossSiteCookiePairCount: 0,
    crossSiteCredentialPresent: false,
    invalidHostRequestCount: 0,
  };
}

function validCookieResult(candidate) {
  return {
    schema: "stasis-post-support-cookie-minimizers-v1",
    claimBoundary: "local positive causal proof; not corpus, hosted CI, release, or publication proof",
    candidate,
    rules: {
      appCodeChanges: false,
      retries: 0,
      sleeps: false,
      polling: false,
      stateTransfer: "memory_only",
      persistedEvidence: "booleans_counts_and_typed_properties_only",
    },
    scenarios: [
      {
        id: "persistent-cookie-fresh-process-restore",
        status: "passed",
        processCount: 2,
        cookiePersistence: "max_age",
        evidence: {
          seedRequestCount: 1,
          persistentCookieCount: 1,
          nonNullExpiryCount: 1,
          restoredRequestCount: 1,
          restoredCredentialPresent: true,
          stateArtifactTransferredInMemory: true,
        },
      },
      {
        id: "same-site-lax-cross-site-subresource",
        status: "passed",
        processCount: 3,
        sameSitePolicy: "lax",
        evidence: {
          ...exactSameSiteFacts(),
          laxCookieCount: 1,
          canonicalCookieDomainObserved: true,
          stateArtifactTransferredInMemory: true,
        },
      },
    ],
  };
}

function verifiedCandidate() {
  const identity = createPostSupportCandidateSpec({
    packageRunId: "33506181780",
    packageRunAttempt: "1",
    revision: postSupportRevision,
    windowsZipPath: "C:\\private\\stasis-0.3.3-windows-x86_64-ci.zip",
    windowsZipSha256: "1".repeat(64),
    windowsZipBytes: "10",
    executablePath: "C:\\private\\stasis.exe",
    executableSha256: "2".repeat(64),
    executableBytes: "20",
    sdkArchivePath: "C:\\private\\oxhq-stasis-0.3.3.tgz",
    sdkArchiveSha256: "3".repeat(64),
    sdkArchiveBytes: "30",
    sdkProofPath: "C:\\private\\stasis-0.3.3-typescript-act-settle-inspect.json",
    sdkProofSha256: "5".repeat(64),
    sdkProofBytes: "50",
    sdkPackageRoot: "C:\\private\\oxhq-stasis-0.3.3\\package",
    sdkTreeSha256: "4".repeat(64),
    sdkTreeFileCount: "5",
    sdkTreeBytes: "40",
  });
  return {
    identity,
    executableSha256: identity.windows.executable.sha256,
    sdk: {
      launch() {},
      CONTROLLED_WEB_SESSION_V2_PROFILE: postSupportProfile,
    },
  };
}
