import { launch } from "./api.js";
import { StasisAbortError } from "./errors.js";
import { CONTROLLED_WEB_SESSION_V2_PROFILE, } from "./profile.js";
export class SessionPoolQueueFullError extends Error {
    code = "session_pool_queue_full";
    constructor(maxQueue) {
        super(`The Stasis session pool queue is full (maximum ${maxQueue})`);
        this.name = "SessionPoolQueueFullError";
    }
}
export class SessionPoolClosedError extends Error {
    code = "session_pool_closed";
    constructor() {
        super("The Stasis session pool is closed");
        this.name = "SessionPoolClosedError";
    }
}
class ExclusiveSessionLease {
    session;
    #finish;
    #finishPromise = null;
    constructor(session, finish) {
        this.session = session;
        this.#finish = finish;
    }
    release() {
        return this.#finishOnce(true);
    }
    poison() {
        return this.#finishOnce(false);
    }
    #finishOnce(healthy) {
        this.#finishPromise ??= this.#finish(healthy);
        return this.#finishPromise;
    }
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
export class FreshSessionPool {
    maxProcesses;
    maxQueue;
    #create;
    #queue = [];
    #activeProcesses = 0;
    #closed = false;
    #drainPromise = null;
    #resolveDrain = null;
    constructor(options) {
        this.maxProcesses = positiveFiniteInteger(options.maxProcesses, "maxProcesses");
        this.maxQueue = nonNegativeFiniteInteger(options.maxQueue, "maxQueue");
        if (typeof options.create !== "function") {
            throw new TypeError("create must be a function");
        }
        this.#create = options.create;
    }
    get activeProcesses() {
        return this.#activeProcesses;
    }
    get queuedAcquisitions() {
        return this.#queue.length;
    }
    get closed() {
        return this.#closed;
    }
    acquire(request, options = {}) {
        if (this.#closed)
            return Promise.reject(new SessionPoolClosedError());
        if (options.signal?.aborted === true) {
            return Promise.reject(new StasisAbortError(options.signal.reason));
        }
        return new Promise((resolve, reject) => {
            const entry = {
                request,
                resolve,
                reject,
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            };
            if (this.#activeProcesses < this.maxProcesses && this.#queue.length === 0) {
                this.#start(entry);
                return;
            }
            if (this.#queue.length >= this.maxQueue) {
                reject(new SessionPoolQueueFullError(this.maxQueue));
                return;
            }
            if (entry.signal !== undefined) {
                const onAbort = () => {
                    const index = this.#queue.indexOf(entry);
                    if (index === -1)
                        return;
                    this.#queue.splice(index, 1);
                    entry.removeAbortListener?.();
                    reject(new StasisAbortError(entry.signal?.reason));
                };
                entry.signal.addEventListener("abort", onAbort, { once: true });
                entry.removeAbortListener = () => {
                    entry.signal?.removeEventListener("abort", onAbort);
                    delete entry.removeAbortListener;
                };
            }
            this.#queue.push(entry);
        });
    }
    /**
     * Run one callback on one fresh session. Successful callbacks close the
     * session; thrown callbacks conservatively poison the process. Work is never
     * retried or replayed.
     */
    async run(request, callback, options = {}) {
        if (typeof callback !== "function")
            throw new TypeError("callback must be a function");
        const lease = await this.acquire(request, options);
        let result;
        try {
            result = await callback(lease.session);
        }
        catch (error) {
            try {
                await lease.poison();
            }
            catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "Session work failed and the poisoned process could not be terminated");
            }
            throw error;
        }
        await lease.release();
        return result;
    }
    /** Stop admission, reject queued work, and resolve after all leases are discarded. */
    close() {
        if (!this.#closed) {
            this.#closed = true;
            const error = new SessionPoolClosedError();
            for (const entry of this.#queue.splice(0)) {
                entry.removeAbortListener?.();
                entry.reject(error);
            }
        }
        if (this.#activeProcesses === 0)
            return Promise.resolve();
        this.#drainPromise ??= new Promise((resolve) => {
            this.#resolveDrain = resolve;
        });
        return this.#drainPromise;
    }
    #pump() {
        while (!this.#closed &&
            this.#activeProcesses < this.maxProcesses &&
            this.#queue.length > 0) {
            const entry = this.#queue.shift();
            if (entry === undefined)
                return;
            entry.removeAbortListener?.();
            if (entry.signal?.aborted === true) {
                entry.reject(new StasisAbortError(entry.signal.reason));
                continue;
            }
            this.#start(entry);
        }
    }
    #start(entry) {
        entry.removeAbortListener?.();
        if (entry.signal?.aborted === true) {
            entry.reject(new StasisAbortError(entry.signal.reason));
            this.#pump();
            return;
        }
        this.#activeProcesses += 1;
        let creation;
        try {
            creation = Promise.resolve(this.#create(entry.request, entry.signal === undefined ? {} : { signal: entry.signal }));
        }
        catch (error) {
            this.#freeProcessSlot();
            entry.reject(error);
            return;
        }
        void creation.then(async (owned) => {
            if (entry.signal?.aborted === true) {
                try {
                    await owned.terminate();
                }
                catch {
                    // Cancellation is the public cause; the process has still been discarded.
                }
                finally {
                    this.#freeProcessSlot();
                }
                entry.reject(new StasisAbortError(entry.signal.reason));
                return;
            }
            entry.resolve(new ExclusiveSessionLease(owned.session, (healthy) => this.#discardOwnedProcess(owned, healthy)));
        }, (error) => {
            this.#freeProcessSlot();
            entry.reject(error);
        });
    }
    async #discardOwnedProcess(owned, healthy) {
        try {
            if (!healthy) {
                await owned.terminate();
                return;
            }
            try {
                await owned.close();
            }
            catch (closeError) {
                try {
                    await owned.terminate();
                }
                catch (terminateError) {
                    throw new AggregateError([closeError, terminateError], "The session close failed and the process could not be terminated");
                }
                throw closeError;
            }
        }
        finally {
            this.#freeProcessSlot();
        }
    }
    #freeProcessSlot() {
        this.#activeProcesses -= 1;
        if (this.#activeProcesses < 0) {
            throw new Error("Stasis session pool process accounting underflow");
        }
        this.#pump();
        if (this.#closed && this.#activeProcesses === 0) {
            this.#resolveDrain?.();
            this.#resolveDrain = null;
        }
    }
}
/** Create the production process-per-session pool used by the reference crawler. */
export function createStasisSessionPool(options) {
    const launchOptions = options.launch ?? {};
    return new FreshSessionPool({
        maxProcesses: options.maxProcesses,
        maxQueue: options.maxQueue,
        create: async (request, context) => {
            const combined = combineAbortSignals(launchOptions.signal, request.options?.signal, context.signal);
            const { signal } = combined;
            let runtime = null;
            try {
                runtime = await launch({
                    ...launchOptions,
                    ...(signal === undefined ? {} : { signal }),
                });
                const session = request.options?.profile === CONTROLLED_WEB_SESSION_V2_PROFILE
                    ? await runtime.openSession(request.url, {
                        ...request.options,
                        profile: CONTROLLED_WEB_SESSION_V2_PROFILE,
                        ...(signal === undefined ? {} : { signal }),
                    })
                    : await runtime.openSession(request.url, {
                        ...request.options,
                        ...(signal === undefined ? {} : { signal }),
                    });
                const typedSession = session;
                return {
                    session: typedSession,
                    close: () => typedSession.close(),
                    terminate: () => runtime?.close() ?? Promise.resolve(),
                };
            }
            catch (error) {
                if (runtime !== null) {
                    try {
                        await runtime.close();
                    }
                    catch (cleanupError) {
                        throw new AggregateError([error, cleanupError], "Could not create a Stasis session and its process could not be terminated");
                    }
                }
                throw error;
            }
            finally {
                combined.dispose();
            }
        },
    });
}
/** @internal */
export function combineAbortSignals(...signals) {
    const present = [
        ...new Set(signals.filter((signal) => signal !== undefined)),
    ];
    if (present.length === 0)
        return { signal: undefined, dispose: () => undefined };
    if (present.length === 1)
        return { signal: present[0], dispose: () => undefined };
    const controller = new AbortController();
    const listeners = [];
    const dispose = () => {
        for (const [signal, listener] of listeners.splice(0)) {
            signal.removeEventListener("abort", listener);
        }
    };
    const abortFrom = (source) => {
        dispose();
        if (!controller.signal.aborted)
            controller.abort(source.reason);
    };
    for (const signal of present) {
        if (signal.aborted) {
            abortFrom(signal);
            break;
        }
        const listener = () => abortFrom(signal);
        signal.addEventListener("abort", listener, { once: true });
        listeners.push([signal, listener]);
    }
    return { signal: controller.signal, dispose };
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
//# sourceMappingURL=session-pool.js.map