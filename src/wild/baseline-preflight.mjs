import { Configuration, PlaywrightCrawler } from "crawlee";
import { chromium } from "playwright";

import { serializeError } from "../shared/io.mjs";
import { baselineLimits, userAgent } from "./config.mjs";
import {
  normalizeLinkIdentitySet,
  normalizeTitleIdentity,
  publicHttpUrlIdentity,
} from "./normalize.mjs";
import { inspectPublicHttpUrl, projectPublicTargetError } from "./public-target.mjs";

const supplementalDependencyErrorCodes = new Set([
  "ABORT_ERR",
  "EACCES",
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOENT",
  "ENOTFOUND",
  "EPERM",
  "EPIPE",
  "ERR_ABORTED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_FAILED",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_NETWORK_CHANGED",
  "ERR_TIMED_OUT",
  "ETIMEDOUT",
]);
const crawleeSkipReasons = new Set([
  "depth",
  "enqueueLimit",
  "filters",
  "limit",
  "redirect",
  "robotsTxt",
]);

export async function runBaselinePreflightObservation(
  entry,
  { inspect = inspectPublicHttpUrl } = {},
) {
  validateEntry(entry);
  const startedAt = process.hrtime.bigint();
  const gate = { blocked: [], omitted: 0 };
  const dnsCache = new Map();
  let observation = null;
  let crawlerFailure = null;

  const config = new Configuration({
    persistStorage: false,
    purgeOnStart: true,
    defaultRequestQueueId: `wild-preflight-${entry.rank}`,
    logLevel: "ERROR",
  });
  const crawler = new PlaywrightCrawler(
    {
      minConcurrency: 1,
      maxConcurrency: 1,
      maxRequestRetries: 0,
      maxRequestsPerCrawl: 1,
      requestHandlerTimeoutSecs: baselineLimits.requestHandlerTimeoutSecs,
      navigationTimeoutSecs: baselineLimits.navigationTimeoutSecs,
      retryOnBlocked: false,
      // Robots is checked explicitly, fail-closed, immediately before this function.
      respectRobotsTxtFile: false,
      useSessionPool: false,
      headless: true,
      launchContext: {
        launcher: chromium,
        userAgent,
        useIncognitoPages: true,
        launchOptions: { headless: true },
      },
      preNavigationHooks: [
        async ({ page }) => {
          await page.route("**/*", async (route) => {
            const request = route.request();
            if (request.method() !== "GET") {
              recordBlocked(gate, {
                code: "non_read_only_method",
                method: request.method(),
                resourceType: request.resourceType(),
              });
              await route.abort("blockedbyclient");
              return;
            }
            try {
              await inspectWithHostnameCache(request.url(), inspect, dnsCache);
              await route.continue();
            } catch (error) {
              recordBlocked(gate, {
                code: "non_public_request",
                resourceType: request.resourceType(),
                detail: projectPublicTargetError(error),
              });
              await route.abort("blockedbyclient");
            }
          });
        },
      ],
      async requestHandler({ page, request, response }) {
        observation = await observeLoadedPage(page, entry.requestedUrl, response, inspect);
        await page.close();
        observation = applyRequestGate(observation, gate);
      },
      async failedRequestHandler({ page, request, error }) {
        await page?.close().catch(() => undefined);
        const gated = applyRequestGate(null, gate);
        observation = gated ?? {
          status: "failure",
          code: error?.name === "TimeoutError" ? "navigation_timeout" : "navigation_failed",
          requestedUrl: entry.requestedUrl,
          error: projectBrowserError(error),
          errorMessageCount: Array.isArray(request.errorMessages) ? request.errorMessages.length : 0,
        };
      },
      async onSkippedRequest({ url, reason }) {
        observation = {
          status: "harness_error",
          code: "unexpected_crawlee_skip",
          requestedUrl: entry.requestedUrl,
          skipReason: projectCrawleeSkipReason(reason),
        };
      },
    },
    config,
  );

  try {
    await crawler.run([
      {
        url: entry.requestedUrl,
        uniqueKey: `${entry.stratumId}:${entry.rank}`,
        userData: { rank: entry.rank, stratumId: entry.stratumId },
      },
    ]);
  } catch (error) {
    crawlerFailure = projectHarnessError(error);
  } finally {
    await config.getEventManager().close().catch(() => undefined);
  }

  if (crawlerFailure !== null) {
    return {
      status: "harness_error",
      code: "crawlee_run_failed",
      requestedUrl: entry.requestedUrl,
      error: crawlerFailure,
      wallTimeMs: elapsedMilliseconds(startedAt),
    };
  }
  if (observation === null) {
    return {
      status: "harness_error",
      code: "missing_terminal_observation",
      requestedUrl: entry.requestedUrl,
      wallTimeMs: elapsedMilliseconds(startedAt),
    };
  }
  return { ...observation, wallTimeMs: elapsedMilliseconds(startedAt) };
}

export function classifyChallengeSignals(signals) {
  if (signals.cloudflareSelector || signals.cloudflareTitle) return "cloudflare_challenge";
  if (signals.captchaSelector || signals.captchaTitle) return "captcha_challenge";
  if (signals.robotTitle || signals.robotBody) return "robot_check";
  if (signals.humanTitle || signals.humanBody) return "human_verification";
  if (signals.accessDeniedTitle || signals.accessDeniedBody) return "access_denied";
  return null;
}

async function observeLoadedPage(page, requestedUrl, response, inspect) {
  let finalTarget;
  try {
    finalTarget = await inspect(page.url());
  } catch (error) {
    return {
      status: "safety_rejected",
      code: "final_target_rejected",
      requestedUrl,
      detail: projectPublicTargetError(error),
    };
  }
  // Retain the inspected URL only as an in-memory resolution base. Artifact
  // evidence receives only its domain-separated identity commitment.
  const finalResolutionBase = finalTarget.url;
  const finalUrlIdentity = publicHttpUrlIdentity(finalResolutionBase);
  const responseStatus = response?.status() ?? null;
  if (responseStatus === null || responseStatus < 200 || responseStatus >= 400) {
    return {
      status: "failure",
      code: "top_level_http_status",
      requestedUrl,
      finalUrlIdentity,
      responseStatus,
    };
  }

  const contentType = String(await page.evaluate(() => document.contentType)).toLowerCase();
  if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
    return {
      status: "failure",
      code: "non_html_document",
      requestedUrl,
      finalUrlIdentity,
      responseStatus,
      contentType,
    };
  }

  const signals = await page.evaluate(() => {
    const title = document.title.trim();
    const body = (document.body?.innerText ?? "").slice(0, 24_000);
    return {
      cloudflareSelector: Boolean(document.querySelector("#challenge-running, #challenge-stage, .cf-challenge")),
      cloudflareTitle: /^just a moment(?:\.\.\.)?$/iu.test(title),
      captchaSelector: Boolean(document.querySelector('iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], [data-sitekey]')),
      captchaTitle: /^(?:captcha|security check)$/iu.test(title),
      robotTitle: /^(?:robot check|are you a robot\??)$/iu.test(title),
      robotBody: /(?:unusual traffic|confirm you are not a robot)/iu.test(body),
      humanTitle: /^(?:verify (?:that )?you are human|human verification)$/iu.test(title),
      humanBody: /(?:verify (?:that )?you are human|complete the security verification)/iu.test(body),
      accessDeniedTitle: /^(?:access denied|attention required!?)(?:\s*\|.*)?$/iu.test(title),
      accessDeniedBody: /(?:access denied.{0,160}(?:reference|request id)|you do not have permission to access)/isu.test(body),
    };
  });
  const challenge = classifyChallengeSignals(signals);
  if (challenge !== null) {
    return {
      status: "policy_excluded",
      code: challenge,
      requestedUrl,
      finalUrlIdentity,
      responseStatus,
      contentType,
    };
  }

  const [rawTitle, rawLinks] = await Promise.all([
    page.title(),
    page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.href)),
  ]);
  return {
    status: "success",
    code: "eligible",
    requestedUrl,
    finalUrlIdentity,
    responseStatus,
    contentType,
    extraction: {
      titleIdentity: normalizeTitleIdentity(rawTitle),
      linkIdentities: normalizeLinkIdentitySet(rawLinks, finalResolutionBase),
    },
  };
}

async function inspectWithHostnameCache(value, inspect, cache) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.username.length > 0 || url.password.length > 0) {
    await inspect(value);
    return;
  }
  const key = url.hostname.toLowerCase().replace(/\.$/u, "");
  let pending = cache.get(key);
  if (pending === undefined) {
    const root = new URL("/", url);
    root.search = "";
    root.hash = "";
    pending = inspect(root.href);
    cache.set(key, pending);
  }
  await pending;
}

function applyRequestGate(observation, gate) {
  if (gate.blocked.length === 0 && gate.omitted === 0) return observation;
  const safety = gate.blocked.find((item) => item.code === "non_public_request");
  return {
    status: safety === undefined ? "policy_excluded" : "safety_rejected",
    code: safety === undefined ? "non_read_only_request" : "request_target_rejected",
    requestedUrl: observation?.requestedUrl ?? null,
    blockedRequests: gate.blocked,
    blockedRequestDetailsOmitted: gate.omitted,
  };
}

function recordBlocked(gate, item) {
  if (gate.blocked.length < 32) gate.blocked.push(item);
  else gate.omitted += 1;
}

export function projectBrowserError(error) {
  return projectSanitizedError(
    error,
    error?.name === "TimeoutError" ? "TimeoutError" : "BrowserNavigationError",
  );
}

export function projectHarnessError(error) {
  return projectSanitizedError(error);
}

export function projectCrawleeSkipReason(value) {
  return crawleeSkipReasons.has(value) ? value : "unclassified_error";
}

function projectSanitizedError(error, nameOverride) {
  const shared = serializeError(error);
  const rawCode = typeof error?.code === "string" ? error.code : undefined;
  return {
    name: nameOverride ?? shared.name,
    code: supplementalDependencyErrorCodes.has(rawCode)
      ? rawCode
      : shared.code ?? "unclassified_error",
    messageOmitted: shared.messageOmitted === true,
  };
}

function validateEntry(entry) {
  if (
    typeof entry !== "object" ||
    entry === null ||
    !Number.isSafeInteger(entry.rank) ||
    typeof entry.stratumId !== "string" ||
    typeof entry.requestedUrl !== "string"
  ) {
    throw new TypeError("Invalid preflight entry");
  }
}

function elapsedMilliseconds(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}
