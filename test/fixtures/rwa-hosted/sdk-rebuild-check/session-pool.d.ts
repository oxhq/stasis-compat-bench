import { type Session } from "./api.js";
import { type SelectableSessionProfile, type SessionSupportProfile } from "./profile.js";
import type { LaunchOptions, SessionOpenOptions } from "./types.js";
/** A freshly-created native process and its single terminal session. */
export interface OwnedSessionProcess<SessionType> {
    readonly session: SessionType;
    /** Close the session, observe the native process exit, and discard it. */
    close(): Promise<void>;
    /** Abruptly terminate and discard a poisoned process. */
    terminate(): Promise<void>;
}
export interface SessionProcessFactoryContext {
    readonly signal?: AbortSignal;
}
export type SessionProcessFactory<Request, SessionType> = (request: Request, context: SessionProcessFactoryContext) => Promise<OwnedSessionProcess<SessionType>>;
export interface FreshSessionPoolOptions<Request, SessionType> {
    /** Maximum native processes that may be spawning, leased, or closing at once. */
    readonly maxProcesses: number;
    /** Maximum waiters. Set to zero to reject whenever all process slots are occupied. */
    readonly maxQueue: number;
    /** Must create a fresh process and its only session for every invocation. */
    readonly create: SessionProcessFactory<Request, SessionType>;
}
export interface SessionAcquireOptions {
    /** Cancellation is guaranteed while queued and is also forwarded to process creation. */
    readonly signal?: AbortSignal;
}
export declare class SessionPoolQueueFullError extends Error {
    readonly code = "session_pool_queue_full";
    constructor(maxQueue: number);
}
export declare class SessionPoolClosedError extends Error {
    readonly code = "session_pool_closed";
    constructor();
}
/**
 * Exclusive ownership of one fresh native process and its one session.
 * A lease is terminal: release closes the process; poison terminates it.
 */
export interface SessionLease<SessionType> {
    readonly session: SessionType;
    release(): Promise<void>;
    poison(): Promise<void>;
}
/**
 * Bounded FIFO coordination for process-per-session Stasis work.
 *
 * There is intentionally no idle process cache. A released lease performs the
 * terminal close handshake, observes process exit, and frees its slot only
 * after the process has been discarded. The next waiter then creates a fresh
 * process, so document/session tokens can never be carried to another lease by
 * the pool.
 */
export declare class FreshSessionPool<Request, SessionType> {
    #private;
    readonly maxProcesses: number;
    readonly maxQueue: number;
    constructor(options: FreshSessionPoolOptions<Request, SessionType>);
    get activeProcesses(): number;
    get queuedAcquisitions(): number;
    get closed(): boolean;
    acquire(request: Request, options?: SessionAcquireOptions): Promise<SessionLease<SessionType>>;
    /**
     * Run one callback on one fresh session. Successful callbacks close the
     * session; thrown callbacks conservatively poison the process. Work is never
     * retried or replayed.
     */
    run<Result>(request: Request, callback: (session: SessionType) => Result | Promise<Result>, options?: SessionAcquireOptions): Promise<Result>;
    /** Stop admission, reject queued work, and resolve after all leases are discarded. */
    close(): Promise<void>;
}
export type StasisSessionRequest<Profile extends SelectableSessionProfile = SessionSupportProfile> = Profile extends SessionSupportProfile ? {
    readonly url: string | URL;
    readonly options?: SessionOpenOptions<SessionSupportProfile>;
} : {
    readonly url: string | URL;
    readonly options: SessionOpenOptions<Profile> & {
        readonly profile: Profile;
    };
};
export interface StasisSessionPoolOptions {
    readonly maxProcesses: number;
    readonly maxQueue: number;
    /** Defaults shared by every newly-spawned native process. */
    readonly launch?: LaunchOptions;
}
/** Create the production process-per-session pool used by the reference crawler. */
export declare function createStasisSessionPool<Profile extends SelectableSessionProfile = SessionSupportProfile>(options: StasisSessionPoolOptions): FreshSessionPool<StasisSessionRequest<Profile>, Session<Profile>>;
//# sourceMappingURL=session-pool.d.ts.map