import {
  Configuration,
  PlaywrightCrawler,
  RequestQueue,
} from "crawlee";
import path from "node:path";
import { chromium } from "playwright";

import {
  concurrency,
  fixtureFor,
  maxDepth,
  maxPages,
  negativeControls,
  normalizeLinks,
  origin,
  startUrl,
} from "./corpus.mjs";
import {
  canonicalHttpUrl,
  monotonicMilliseconds,
  serializeError,
  sha256File,
} from "../shared/io.mjs";

export async function runPlaywrightProof() {
  const chromiumExecutable = chromium.executablePath();
  const browser = await chromium.launch({ headless: true });
  let chromiumVersion;
  try {
    chromiumVersion = browser.version();
  } finally {
    await browser.close();
  }
  return {
    schema: "stasis-compat-crawl-playwright-raw-v1",
    protocol: "stasis-compat-bench-v1",
    track: "crawling",
    runner: "crawlee-playwright",
    versions: {
      node: process.version,
      crawlee: "3.18.1",
      playwright: "1.62.1",
      chromiumRevisionDirectory: path.basename(path.dirname(path.dirname(chromiumExecutable))),
      chromiumVersion,
      chromiumExecutable,
      chromiumExecutableSha256: await sha256File(chromiumExecutable),
    },
    rules: {
      concurrency,
      maxRequestRetries: 0,
      maxPages,
      maxDepth,
      persistStorage: false,
      useSessionPool: false,
    },
    primary: await runOne({
      id: "primary",
      start: startUrl,
      pageLimit: maxPages,
      depthLimit: maxDepth,
    }),
    negativeControls: await runControls(),
  };
}

async function runControls() {
  const results = [];
  for (const control of negativeControls) {
    results.push({
      id: control.id,
      expectedSurface: control.expectedSurface,
      ...(await runOne({ id: `negative-${control.id}`, start: control.start, pageLimit: 1, depthLimit: 0 })),
    });
  }
  return results;
}

async function runOne({ id, start, pageLimit, depthLimit }) {
  const startedAt = process.hrtime.bigint();
  const config = new Configuration({
    persistStorage: false,
    purgeOnStart: true,
    defaultRequestQueueId: `stasis-compat-${id}`,
    logLevel: "ERROR",
  });
  const requestQueue = await RequestQueue.open(null, { config });
  const scheduled = new Set([canonicalHttpUrl(start)]);
  const pages = [];
  const failures = [];
  const fixtureMisses = [];
  let crawler;
  try {
    crawler = new PlaywrightCrawler(
      {
        requestQueue,
        minConcurrency: concurrency,
        maxConcurrency: concurrency,
        maxRequestRetries: 0,
        maxRequestsPerCrawl: pageLimit,
        requestHandlerTimeoutSecs: 20,
        navigationTimeoutSecs: 20,
        useSessionPool: false,
        headless: true,
        launchContext: {
          launcher: chromium,
          launchOptions: { headless: true },
        },
        preNavigationHooks: [
          async ({ page }) => {
            await page.route("**/*", async (route) => {
              const request = route.request();
              const fixture = fixtureFor(request.method(), request.url());
              if (fixture === undefined) {
                fixtureMisses.push({ method: request.method(), url: request.url() });
                await route.abort("failed");
                return;
              }
              await route.fulfill({
                status: fixture.status,
                headers: Object.fromEntries(fixture.headers),
                body: fixture.body,
              });
            });
          },
        ],
        async requestHandler({ page, request, response }) {
          const depth = Number(request.userData.depth ?? 0);
          await page.locator('#status[data-state="complete"]').waitFor({
            state: "attached",
            timeout: 15_000,
          });
          const finalUrl = canonicalHttpUrl(page.url());
          const rawLinks = await page.locator("a[href]").evaluateAll((anchors) =>
            anchors.map((anchor) => anchor.href),
          );
          const links = normalizeLinks(rawLinks, finalUrl);
          pages.push({
            requestedUrl: canonicalHttpUrl(request.url),
            url: finalUrl,
            depth,
            status: "crawled",
            responseStatus: response?.status() ?? null,
            links,
          });
          if (depth >= depthLimit) return;
          const additions = [];
          for (const link of links) {
            if (scheduled.size >= pageLimit) break;
            if (new URL(link).origin !== origin || scheduled.has(link)) continue;
            scheduled.add(link);
            additions.push({ url: link, uniqueKey: link, userData: { depth: depth + 1 } });
          }
          if (additions.length > 0) await crawler.addRequests(additions);
        },
        async failedRequestHandler({ request, error }) {
          failures.push({
            requestedUrl: canonicalHttpUrl(request.url),
            depth: Number(request.userData.depth ?? 0),
            error: serializeError(error),
            errorMessageCount: Array.isArray(request.errorMessages)
              ? request.errorMessages.length
              : 0,
          });
        },
      },
      config,
    );

    await crawler.run([{ url: start, uniqueKey: canonicalHttpUrl(start), userData: { depth: 0 } }]);
    return {
      success: failures.length === 0 && fixtureMisses.length === 0,
      result: { pages, scheduledUrls: [...scheduled] },
      failures,
      fixtureMisses,
      wallTimeMs: monotonicMilliseconds(startedAt),
    };
  } catch (error) {
    return {
      success: false,
      result: { pages, scheduledUrls: [...scheduled] },
      failures,
      fixtureMisses,
      error: serializeError(error),
      wallTimeMs: monotonicMilliseconds(startedAt),
    };
  } finally {
    await config.getEventManager().close().catch(() => undefined);
  }
}
