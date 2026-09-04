import { StasisAbortError } from "./errors.js";
import { CONTROLLED_WEB_SESSION_V2_PROFILE, } from "./profile.js";
const LINK_EXTRACTION_PLAN = {
    rootSelector: "a[href]",
    fields: [
        {
            name: "href",
            selector: "",
            read: "resolved_url",
            attribute: "href",
        },
    ],
};
export class CrawlerOriginPolicyError extends Error {
    code = "crawler_origin_policy";
    constructor(message) {
        super(message);
        this.name = "CrawlerOriginPolicyError";
    }
}
/**
 * Small, deterministic reference workload for the controlled-session runtime.
 * Each page gets one fresh process/session from the pool. It performs no sleep,
 * retry, proxy, stealth, robots, or distributed-frontier behavior.
 */
export async function crawlWithStasis(pool, options) {
    const maxPages = positiveFiniteInteger(options.maxPages, "maxPages");
    const maxDepth = nonNegativeFiniteInteger(options.maxDepth, "maxDepth");
    const concurrency = positiveFiniteInteger(options.concurrency, "concurrency");
    if (!Number.isSafeInteger(pool.maxProcesses) || pool.maxProcesses < 1) {
        throw new RangeError("pool.maxProcesses must be a finite positive safe integer");
    }
    if (concurrency > pool.maxProcesses) {
        throw new RangeError("concurrency cannot exceed pool.maxProcesses");
    }
    throwIfAborted(options.signal);
    const inputs = Array.isArray(options.start) ? options.start : [options.start];
    if (inputs.length === 0)
        throw new RangeError("start must contain at least one URL");
    const canonicalStarts = inputs.map((value) => canonicalHttpUrl(value));
    const primaryOrigin = new URL(canonicalStarts[0]).origin;
    const allowedOrigins = new Set([primaryOrigin]);
    for (const value of options.allowedOrigins ?? []) {
        allowedOrigins.add(canonicalOrigin(value));
    }
    for (const start of canonicalStarts) {
        if (!allowedOrigins.has(new URL(start).origin)) {
            throw new CrawlerOriginPolicyError(`Start URL origin ${new URL(start).origin} requires an explicit allowedOrigins entry`);
        }
    }
    const scheduled = new Set();
    let frontier = [];
    for (const url of canonicalStarts) {
        if (scheduled.size >= maxPages)
            break;
        if (scheduled.has(url))
            continue;
        scheduled.add(url);
        frontier.push({ url, depth: 0 });
    }
    const pages = [];
    while (frontier.length > 0) {
        throwIfAborted(options.signal);
        const round = frontier;
        frontier = [];
        const roundResults = await mapConcurrentOrdered(round, concurrency, (entry) => crawlOne(pool, entry, allowedOrigins, options));
        pages.push(...roundResults);
        for (const page of roundResults) {
            if (page.depth >= maxDepth || page.status !== "crawled")
                continue;
            for (const url of page.links) {
                if (scheduled.size >= maxPages)
                    break;
                if (scheduled.has(url))
                    continue;
                scheduled.add(url);
                frontier.push({ url, depth: page.depth + 1 });
            }
        }
    }
    return { pages, scheduledUrls: [...scheduled] };
}
async function crawlOne(pool, entry, allowedOrigins, options) {
    const sharedOpenOptions = {
        ...(options.state === undefined ? {} : { state: options.state }),
        ...(options.network === undefined ? {} : { network: options.network }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
    const request = options.profile === CONTROLLED_WEB_SESSION_V2_PROFILE
        ? {
            url: entry.url,
            options: {
                ...sharedOpenOptions,
                profile: CONTROLLED_WEB_SESSION_V2_PROFILE,
            },
        }
        : {
            url: entry.url,
            options: {
                ...sharedOpenOptions,
                ...(options.profile === undefined ? {} : { profile: options.profile }),
            },
        };
    return pool.run(request, async (session) => {
        throwIfAborted(options.signal);
        const finalUrl = canonicalHttpUrl(session.url);
        if (!allowedOrigins.has(new URL(finalUrl).origin)) {
            return {
                requestedUrl: entry.url,
                url: finalUrl,
                depth: entry.depth,
                status: "redirect_disallowed",
                settleOutcome: null,
                links: [],
            };
        }
        // The token is deliberately local to this callback/process. The crawler
        // never stores it in the frontier or a result and cannot pass it to a
        // later process.
        const settled = await session.settle(session.stateToken, options.settle ?? {}, options.signal === undefined ? {} : { signal: options.signal });
        if (!isCrawlableOutcome(settled.outcome)) {
            return {
                requestedUrl: entry.url,
                url: finalUrl,
                depth: entry.depth,
                status: "settlement_not_crawlable",
                settleOutcome: settled.outcome,
                links: [],
            };
        }
        const extraction = await session.extract(LINK_EXTRACTION_PLAN, settled.stateToken, options.signal === undefined ? {} : { signal: options.signal });
        const links = [];
        const localSeen = new Set();
        for (const row of extraction.rows) {
            const value = row.fields.find((field) => field.name === "href")?.value;
            if (value === null || value === undefined)
                continue;
            let canonical;
            try {
                canonical = canonicalHttpUrl(value, finalUrl);
            }
            catch {
                continue;
            }
            if (!allowedOrigins.has(new URL(canonical).origin) || localSeen.has(canonical)) {
                continue;
            }
            localSeen.add(canonical);
            links.push(canonical);
        }
        return {
            requestedUrl: entry.url,
            url: finalUrl,
            depth: entry.depth,
            status: "crawled",
            settleOutcome: settled.outcome,
            links,
        };
    }, options.signal === undefined ? {} : { signal: options.signal });
}
/** Normalize an HTTP(S) URL for frontier deduplication and remove its fragment. */
export function canonicalHttpUrl(value, base) {
    let url;
    try {
        url = base === undefined ? new URL(value) : new URL(value, base);
    }
    catch (error) {
        throw new TypeError("Crawler URLs must be valid absolute HTTP(S) URLs", { cause: error });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new TypeError("Crawler URLs must use HTTP or HTTPS");
    }
    if (url.username.length > 0 || url.password.length > 0) {
        throw new TypeError("Crawler URLs must not contain credentials");
    }
    url.hash = "";
    return url.href;
}
function canonicalOrigin(value) {
    const url = new URL(value);
    canonicalHttpUrl(url);
    if (url.pathname !== "/" || url.search.length > 0 || url.hash.length > 0) {
        throw new TypeError("allowedOrigins entries must contain only an HTTP(S) origin");
    }
    return url.origin;
}
async function mapConcurrentOrdered(inputs, concurrency, callback) {
    const results = new Array(inputs.length);
    const failures = [];
    let nextIndex = 0;
    let stopped = false;
    async function worker() {
        for (;;) {
            if (stopped)
                return;
            const index = nextIndex;
            nextIndex += 1;
            if (index >= inputs.length)
                return;
            const input = inputs[index];
            if (input === undefined)
                return;
            try {
                results[index] = await callback(input);
            }
            catch (error) {
                failures.push({ index, error });
                stopped = true;
                return;
            }
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
    await Promise.all(workers);
    if (failures.length > 0) {
        failures.sort((left, right) => left.index - right.index);
        throw failures[0].error;
    }
    return results;
}
function isCrawlableOutcome(outcome) {
    return outcome === "quiescent" || outcome === "quiescent_with_persistent_work";
}
function throwIfAborted(signal) {
    if (signal?.aborted === true)
        throw new StasisAbortError(signal.reason);
}
function positiveFiniteInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError(`${label} must be a finite positive safe integer`);
    }
    return value;
}
function nonNegativeFiniteInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`${label} must be a finite non-negative safe integer`);
    }
    return value;
}
//# sourceMappingURL=crawler.js.map