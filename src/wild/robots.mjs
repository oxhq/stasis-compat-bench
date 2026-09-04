import { RobotsTxtFile } from "crawlee";

import { baselineLimits, userAgent } from "./config.mjs";
import { inspectPublicHttpUrl, projectPublicTargetError } from "./public-target.mjs";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export function isExactAllowedRobotsDecision(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3 &&
    keys[0] === "reason" && keys[1] === "redirectCount" && keys[2] === "status" &&
    value.status === "allowed" &&
    ["robots_allowed", "robots_not_found"].includes(value.reason) &&
    Number.isSafeInteger(value.redirectCount) &&
    value.redirectCount >= 0 &&
    value.redirectCount <= baselineLimits.robotsMaxRedirects;
}

export async function checkRobotsPermission(
  targetUrl,
  {
    fetchImpl = globalThis.fetch,
    inspect = inspectPublicHttpUrl,
    timeoutMs = baselineLimits.robotsTimeoutMs,
    maxBytes = baselineLimits.robotsMaxBytes,
    maxRedirects = baselineLimits.robotsMaxRedirects,
  } = {},
) {
  const target = new URL(targetUrl);
  const robotsUrl = new URL("/robots.txt", target);
  robotsUrl.search = "";
  robotsUrl.hash = "";
  let current = robotsUrl.href;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    try {
      await inspect(current, { requireHttps: true });
    } catch (error) {
      return {
        status: "unsafe",
        reason: "robots_target_rejected",
        detail: projectPublicTargetError(error),
        redirectCount,
      };
    }

    let response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": userAgent, Accept: "text/plain,*/*;q=0.1" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return {
        status: "unavailable",
        reason: error?.name === "TimeoutError" ? "robots_timeout" : "robots_fetch_failed",
        redirectCount,
      };
    }

    if (redirectStatuses.has(response.status)) {
      const location = response.headers.get("location");
      if (location === null) {
        return { status: "unavailable", reason: "robots_redirect_without_location", redirectCount };
      }
      if (redirectCount === maxRedirects) {
        return { status: "unavailable", reason: "robots_redirect_limit", redirectCount };
      }
      try {
        current = new URL(location, current).href;
      } catch {
        return { status: "unavailable", reason: "robots_invalid_redirect", redirectCount };
      }
      continue;
    }

    if (response.status === 404) {
      return { status: "allowed", reason: "robots_not_found", redirectCount };
    }
    if (response.status < 200 || response.status >= 300) {
      return {
        status: "unavailable",
        reason: "robots_http_status",
        httpStatus: response.status,
        redirectCount,
      };
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { status: "unavailable", reason: "robots_too_large", redirectCount };
    }
    let content;
    try {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > maxBytes) {
        return { status: "unavailable", reason: "robots_too_large", redirectCount };
      }
      content = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return { status: "unavailable", reason: "robots_body_failed", redirectCount };
    }

    const robots = RobotsTxtFile.from(current, content);
    const allowed = robots.isAllowed(target.href, userAgent);
    return {
      status: allowed ? "allowed" : "denied",
      reason: allowed ? "robots_allowed" : "robots_disallowed",
      redirectCount,
    };
  }

  return { status: "unavailable", reason: "robots_redirect_limit", redirectCount: maxRedirects };
}
