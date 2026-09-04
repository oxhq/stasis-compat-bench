import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedPrimaryScheduledUrls,
  fixtureFor,
  maxDepth,
  maxPages,
  negativeControls,
  normalizeLinks,
  origin,
  routes,
  startUrl,
  stasisNetwork,
} from "../src/crawl/corpus.mjs";

const expected = [
  `${origin}/`,
  `${origin}/static`,
  `${origin}/canonical`,
  `${origin}/microtask`,
  `${origin}/timer`,
  `${origin}/raf`,
  `${origin}/fetch`,
  `${origin}/xhr`,
  `${origin}/state`,
  `${origin}/navigation-start`,
  `${origin}/interval`,
  `${origin}/leaf/static`,
  `${origin}/leaf/canonical`,
  `${origin}/leaf/microtask`,
  `${origin}/leaf/timer`,
  `${origin}/leaf/raf`,
  `${origin}/leaf/fetch`,
  `${origin}/leaf/xhr`,
  `${origin}/state/ready/leaf`,
  `${origin}/leaf/navigation`,
];

test("the primary denominator is the exact frozen twenty-page BFS contract", () => {
  assert.equal(maxPages, 20);
  assert.equal(maxDepth, 2);
  assert.deepEqual(expectedPrimaryScheduledUrls, expected);
  assert.equal(new Set(expectedPrimaryScheduledUrls).size, 20);
  for (const url of expectedPrimaryScheduledUrls) {
    assert.ok(fixtureFor("GET", url), `missing primary fixture for ${url}`);
  }
});

test("the root admits ten ordered seeds and rejects duplicates and foreign schemes", () => {
  const root = fixtureFor("GET", startUrl);
  assert.ok(root);
  const hrefs = [...root.body.matchAll(/<a href="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(normalizeLinks(hrefs, startUrl), expectedPrimaryScheduledUrls.slice(1, 11));
});

test("one immutable fixture manifest mechanically feeds both runners", () => {
  assert.equal(new Set(routes.map((route) => `${route.method} ${route.url}`)).size, routes.length);
  assert.equal(stasisNetwork().routes.length, routes.length);
  for (const route of routes) {
    assert.equal(fixtureFor(route.method, route.url), route);
  }
});

test("the deterministic primary uses script navigation and contains no HTTP redirect response", () => {
  assert.equal(routes.some((route) => route.status >= 300 && route.status < 400), false);
  const navigation = fixtureFor("GET", `${origin}/navigation-start`);
  const destination = fixtureFor("GET", `${origin}/navigation-final`);
  assert.ok(navigation?.body.includes('location.href = "/navigation-final"'));
  assert.ok(destination?.body.includes('href="/leaf/navigation"'));
  assert.equal(expectedPrimaryScheduledUrls.includes(`${origin}/navigation-final`), false);
});

test("the positive corpus preregisters the current controlled-runtime surfaces", () => {
  const body = (path) => fixtureFor("GET", `${origin}${path}`)?.body ?? "";
  assert.match(body("/canonical"), /<base href=/u);
  assert.match(body("/microtask"), /Promise\.resolve/u);
  assert.match(body("/timer"), /setTimeout/u);
  assert.match(body("/raf"), /requestAnimationFrame/u);
  assert.match(body("/fetch"), /fetch\("\/api\/link"\)/u);
  assert.match(body("/xhr"), /MutationObserver/u);
  assert.match(body("/xhr"), /XMLHttpRequest/u);
  assert.match(body("/state"), /document\.cookie/u);
  assert.match(body("/state"), /localStorage/u);
  assert.match(body("/state"), /sessionStorage/u);
  assert.match(body("/state"), /history\.pushState/u);
  assert.match(body("/interval"), /setInterval/u);
});

test("link normalization matches the Stasis HTTP policy", () => {
  assert.deepEqual(
    normalizeLinks(
      [
        "/a#one",
        "/a#two",
        "https://elsewhere.test/no",
        "/b",
        "mailto:x@y.test",
        "http://user:password@stasis-compat.test/credentialed",
      ],
      `${origin}/root`,
    ),
    [`${origin}/a`, `${origin}/b`],
  );
});

test("worker and iframe controls remain isolated from the primary denominator", () => {
  assert.deepEqual(negativeControls.map((control) => control.id), ["worker", "iframe"]);
  for (const control of negativeControls) {
    assert.equal(expectedPrimaryScheduledUrls.includes(control.start), false);
    assert.ok(fixtureFor("GET", control.start));
  }
});
