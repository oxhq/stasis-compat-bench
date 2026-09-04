import type { CommandOptions, DocumentStateToken, SessionExtractPlan, SessionNetworkOptions, SessionState, SettleOutcome, SettlePolicy } from "./types.js";
import { type SelectableSessionProfile } from "./profile.js";
import type { SessionAcquireOptions, StasisSessionRequest } from "./session-pool.js";
export interface ReferenceCrawlerSession {
    readonly requestedUrl: string;
    readonly url: string;
    readonly stateToken: DocumentStateToken;
    settle(expectedStateToken: DocumentStateToken, policy?: SettlePolicy, options?: CommandOptions): Promise<{
        readonly outcome: SettleOutcome;
        readonly stateToken: DocumentStateToken;
    }>;
    extract(plan: SessionExtractPlan, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<{
        readonly rows: readonly {
            readonly fields: readonly {
                readonly name: string;
                readonly value: string | null;
            }[];
        }[];
        readonly stateToken: DocumentStateToken;
    }>;
}
/** Minimal structural pool surface, allowing native-free crawler tests and custom instrumentation. */
export interface ReferenceCrawlerPool<SessionType extends ReferenceCrawlerSession> {
    readonly maxProcesses: number;
    run<Result>(request: StasisSessionRequest<SelectableSessionProfile>, callback: (session: SessionType) => Result | Promise<Result>, options?: SessionAcquireOptions): Promise<Result>;
}
export interface ReferenceCrawlerOptions {
    readonly start: string | URL | readonly (string | URL)[];
    readonly maxPages: number;
    readonly maxDepth: number;
    readonly concurrency: number;
    /**
     * Exact HTTP(S) origins allowed in addition to the first start URL's origin.
     * Without this list, the crawl is strictly same-origin.
     */
    readonly allowedOrigins?: readonly (string | URL)[];
    /** Defaults to controlled-web-session-v1; candidate profiles require explicit selection. */
    readonly profile?: SelectableSessionProfile;
    /** Imported into every fresh session before its first request. */
    readonly state?: SessionState;
    /** Use fixtures_only for a cross-run reproducible crawl. */
    readonly network?: SessionNetworkOptions;
    readonly settle?: SettlePolicy;
    readonly signal?: AbortSignal;
}
export type CrawlPageStatus = "crawled" | "settlement_not_crawlable" | "redirect_disallowed";
export interface CrawlPageResult {
    /** Canonical scheduled URL: HTTP(S), normalized by URL, with no fragment. */
    readonly requestedUrl: string;
    /** Canonical final URL after the initial navigation and redirects. */
    readonly url: string;
    readonly depth: number;
    readonly status: CrawlPageStatus;
    readonly settleOutcome: SettleOutcome | null;
    /** Canonical, policy-admitted links in DOM order, before global deduplication. */
    readonly links: readonly string[];
}
export interface ReferenceCrawlResult {
    /** Deterministic breadth-first order, independent of concurrent completion order. */
    readonly pages: readonly CrawlPageResult[];
    /** Canonical URLs admitted to the bounded frontier, in admission order. */
    readonly scheduledUrls: readonly string[];
}
export declare class CrawlerOriginPolicyError extends Error {
    readonly code = "crawler_origin_policy";
    constructor(message: string);
}
/**
 * Small, deterministic reference workload for the controlled-session runtime.
 * Each page gets one fresh process/session from the pool. It performs no sleep,
 * retry, proxy, stealth, robots, or distributed-frontier behavior.
 */
export declare function crawlWithStasis<SessionType extends ReferenceCrawlerSession>(pool: ReferenceCrawlerPool<SessionType>, options: ReferenceCrawlerOptions): Promise<ReferenceCrawlResult>;
/** Normalize an HTTP(S) URL for frontier deduplication and remove its fragment. */
export declare function canonicalHttpUrl(value: string | URL, base?: string | URL): string;
//# sourceMappingURL=crawler.d.ts.map