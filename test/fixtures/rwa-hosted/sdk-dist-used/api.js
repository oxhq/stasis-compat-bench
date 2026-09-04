import { readFileSync } from "node:fs";
import { StasisAbortError, StasisProcessError, StasisStateError, } from "./errors.js";
import { bindSessionSettleResultProfile, settlementEvidence as buildSettlementEvidence, } from "./evidence.js";
import { ProtocolClient } from "./protocol.js";
import { assertManagedRuntimeIdentity, resolveRuntimeExecutable } from "./runtime-resolver.js";
import { CONTROLLED_WEBAPP_V1_PROFILE, CONTROLLED_WEB_SESSION_V1_PROFILE, } from "./profile.js";
import { METHOD, decodeActivation, decodeAdvanceToNext, decodeClose, decodeEvaluation, decodeExtract, decodeFill, decodeOpenResult, decodePending, decodeQuery, decodeRuntimeInfo, decodeSettle, decodeSessionActivation, decodeSessionAdvanceToNext, decodeSessionCookies, decodeSessionEvidence, decodeSessionExtract, decodeSessionFill, decodeSessionFocus, decodeSessionCheck, decodeSessionSelect, decodeSessionSubmit, decodeSessionUncheck, decodeSessionNavigate, decodeSessionOpenResult, decodeSessionPending, decodeSessionQuery, decodeSessionRequests, decodeSessionSettle, decodeSessionStateExport, decodeSessionStateMutation, decodeSessionStorage, decodeSessionText, decodeText, decodeUnexpectedSessionStateImportSuccess, encodeDocumentTargetParams, encodeExtractParams, encodeFillParams, encodeOpenParams, encodeSettleParams, encodeExpectedStateTokenParams, encodeSessionAuditParams, encodeSessionCookiesSetParams, encodeSessionDocumentTargetParams, encodeSessionExtractParams, encodeSessionFillParams, encodeSessionNavigateParams, encodeSessionOpenParams, encodeSessionSelectParams, encodeSessionSettleParams, encodeSessionStorageSetParams, } from "./wire.js";
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;
const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_CLOSE_TIMEOUT_MS = 30_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1_000;
const SDK_VERSION = readPackageVersion();
export async function launch(options = {}) {
    if (options.signal?.aborted === true) {
        throw new StasisAbortError(options.signal.reason);
    }
    const maxStderrBytes = boundedSize(options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES, "maxStderrBytes", true);
    const maxFrameBytes = boundedSize(options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES, "maxFrameBytes", false);
    const closeTimeoutMs = boundedTimeoutMs(options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS, "closeTimeoutMs");
    const commandTimeoutMs = boundedTimeoutMs(options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS, "commandTimeoutMs");
    const managedRuntime = options.executablePath === undefined;
    let executablePath;
    if (managedRuntime) {
        executablePath = await resolveRuntimeExecutable(SDK_VERSION, {
            ...(options.runtimeCacheDirectory === undefined
                ? {}
                : { cacheDirectory: options.runtimeCacheDirectory }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
    }
    else {
        if (typeof options.executablePath !== "string" || options.executablePath.length === 0) {
            throw new TypeError("executablePath must be a non-empty string when provided");
        }
        executablePath = options.executablePath;
    }
    let client;
    try {
        client = ProtocolClient.spawn({
            executablePath,
            args: options.args ?? [],
            ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
            ...(options.env === undefined ? {} : { env: options.env }),
            maxStderrBytes,
            maxFrameBytes,
            closeTimeoutMs,
            commandTimeoutMs,
        });
    }
    catch (error) {
        throw new StasisProcessError("Could not spawn Stasis", "", null, null, { cause: error });
    }
    try {
        const { result } = await client.request(METHOD.initialize, { client: { name: "@oxhq/stasis", version: SDK_VERSION } }, {
            sessionId: null,
            expectedResponseSessionId: null,
            timeoutStateEffect: "none",
            ...(options.timeoutMs === undefined
                ? {}
                : { timeoutMs: boundedTimeoutMs(options.timeoutMs, "timeoutMs") }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        }, decodeRuntimeInfo);
        if (managedRuntime)
            assertManagedRuntimeIdentity(SDK_VERSION, result);
        return Runtime.create(client, result);
    }
    catch (error) {
        await client.terminate().catch(() => undefined);
        throw error;
    }
}
export class Runtime {
    #client;
    info;
    #state = "ready";
    constructor(client, info) {
        this.#client = client;
        this.info = info;
    }
    /** @internal */
    static create(client, info) {
        return new Runtime(client, info);
    }
    get pid() {
        return this.#client.pid;
    }
    get stderrTail() {
        return this.#client.stderrTail;
    }
    async open(url, options = {}) {
        if (this.#state !== "ready") {
            throw new StasisStateError("Runtime.open() may be called exactly once", this.stderrTail);
        }
        this.#state = "opening";
        try {
            const params = encodeOpenParams(url, options.clock, options.profile);
            const expectedClockMode = params.clockMode === "controlled" ? "controlled" : "real";
            const expectedProfile = expectedClockMode === "controlled" ? CONTROLLED_WEBAPP_V1_PROFILE : null;
            if (expectedProfile !== null &&
                !this.info.capabilities.profiles.includes(expectedProfile)) {
                throw new StasisStateError(`The Stasis runtime did not advertise profile ${expectedProfile}`, this.stderrTail);
            }
            const response = await this.#client.request(METHOD.open, params, {
                sessionId: null,
                expectedResponseSessionId: "<open>",
                timeoutStateEffect: "indeterminate",
                ...(options.timeoutMs === undefined
                    ? {}
                    : { timeoutMs: boundedTimeoutMs(options.timeoutMs, "timeoutMs") }),
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            }, (value, sessionId) => decodeOpenResult(value, sessionId, expectedClockMode, expectedProfile));
            this.#state = "open";
            return App.create(this, this.#client, response.result);
        }
        catch (error) {
            this.#state = this.#client.isUsable ? "ready" : "closed";
            throw error;
        }
    }
    async openSession(url, options = {}) {
        if (this.#state !== "ready") {
            throw new StasisStateError("Runtime.openSession() may be called exactly once", this.stderrTail);
        }
        this.#state = "opening";
        try {
            const params = encodeSessionOpenParams(url, options);
            const expectedProfile = params.profile;
            if (!this.info.capabilities.profiles.includes(expectedProfile)) {
                throw new StasisStateError(`The Stasis runtime did not advertise profile ${expectedProfile}`, this.stderrTail);
            }
            const response = await this.#client.request(METHOD.open, params, {
                sessionId: null,
                expectedResponseSessionId: "<open>",
                timeoutStateEffect: "indeterminate",
                ...(options.timeoutMs === undefined
                    ? {}
                    : { timeoutMs: boundedTimeoutMs(options.timeoutMs, "timeoutMs") }),
                ...(options.signal === undefined ? {} : { signal: options.signal }),
            }, (value, sessionId) => decodeSessionOpenResult(value, sessionId, expectedProfile));
            this.#state = "open";
            return Session.create(this, this.#client, response.result);
        }
        catch (error) {
            this.#state = this.#client.isUsable ? "ready" : "closed";
            throw error;
        }
    }
    /** Abruptly terminates the owned process. Use App.close()/Session.close() for graceful close. */
    async close() {
        this.#state = "closed";
        await this.#client.terminate();
    }
    /** @internal */
    appDidClose() {
        this.#state = "closed";
    }
}
export class App {
    #runtime;
    #client;
    #sessionId;
    #closePromise = null;
    requestedUrl;
    url;
    boundary;
    clockMode;
    profile;
    constructor(runtime, client, open) {
        this.#runtime = runtime;
        this.#client = client;
        this.#sessionId = open.sessionId;
        this.requestedUrl = open.requestedUrl;
        this.url = open.url;
        this.boundary = open.boundary;
        this.clockMode = open.clockMode;
        this.profile = open.profile;
    }
    /** @internal */
    static create(runtime, client, open) {
        return new App(runtime, client, open);
    }
    get stderrTail() {
        return this.#client.stderrTail;
    }
    async evaluate(expression, options = {}) {
        this.#assertOpen();
        if (typeof expression !== "string")
            throw new TypeError("expression must be a string");
        const { result } = await this.#client.request(METHOD.evaluate, { expression }, this.#requestOptions(options, "indeterminate"), decodeEvaluation);
        return result;
    }
    /** Activate the exact-one element matched by a native CSS selector. */
    async activate(selector, expectedGeneration, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.activate);
        const { result } = await this.#client.request(METHOD.activate, encodeDocumentTargetParams(selector, expectedGeneration), this.#requestOptions(options, "indeterminate"), decodeActivation);
        return result;
    }
    /** Replace the value of the exact-one supported form control matched by a native CSS selector. */
    async fill(selector, value, expectedGeneration, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.fill);
        const { result } = await this.#client.request(METHOD.fill, encodeFillParams(selector, value, expectedGeneration), this.#requestOptions(options, "indeterminate"), decodeFill);
        return result;
    }
    /** Count selector matches without creating persistent DOM handles. */
    async query(selector, expectedGeneration, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.query);
        const { result } = await this.#client.request(METHOD.query, encodeDocumentTargetParams(selector, expectedGeneration), this.#requestOptions(options, "none"), decodeQuery);
        return result;
    }
    /** Read raw textContent from the exact-one element matched by a native CSS selector. */
    async text(selector, expectedGeneration, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.text);
        const { result } = await this.#client.request(METHOD.text, encodeDocumentTargetParams(selector, expectedGeneration), this.#requestOptions(options, "none"), decodeText);
        return result;
    }
    /** Extract ordered text/HTML fields from every root matched by a native CSS selector. */
    async extract(plan, expectedGeneration, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.extract);
        const { result } = await this.#client.request(METHOD.extract, encodeExtractParams(plan, expectedGeneration), this.#requestOptions(options, "none"), decodeExtract);
        return result;
    }
    async pending(options = {}) {
        this.#assertOpen();
        const { result } = await this.#client.request(METHOD.pending, {}, this.#requestOptions(options, "none"), decodePending);
        return result;
    }
    async settle(policy = {}, options = {}) {
        this.#assertOpen();
        const params = encodeSettleParams(policy);
        const { result } = await this.#client.request(METHOD.settle, params, this.#requestOptions(options, "indeterminate"), decodeSettle);
        return result;
    }
    async advanceToNext(options = {}) {
        this.#assertOpen();
        const { result } = await this.#client.request(METHOD.advanceToNext, {}, this.#requestOptions(options, "indeterminate"), decodeAdvanceToNext);
        return result;
    }
    close(options = {}) {
        if (this.#closePromise !== null)
            return this.#closePromise;
        this.#closePromise = this.#close(options);
        return this.#closePromise;
    }
    async #close(options) {
        try {
            const { result } = await this.#client.request(METHOD.close, {}, {
                ...this.#requestOptions(options, "indeterminate"),
                terminatesProcess: true,
            }, (value) => {
                decodeClose(value);
            });
            void result;
            await this.#client.waitForCleanExit(options.signal);
            this.#runtime.appDidClose();
        }
        catch (error) {
            this.#closePromise = null;
            throw error;
        }
    }
    #assertOpen() {
        if (this.#closePromise !== null) {
            throw new StasisStateError("The Stasis app is closing or closed", this.stderrTail);
        }
    }
    #assertMethod(method) {
        if (!this.#runtime.info.capabilities.methods.includes(method)) {
            throw new StasisStateError(`The Stasis runtime did not advertise ${method}`, this.stderrTail);
        }
    }
    #requestOptions(options, timeoutStateEffect) {
        return {
            sessionId: this.#sessionId,
            expectedResponseSessionId: this.#sessionId,
            timeoutStateEffect,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            ...(options.timeoutMs === undefined
                ? {}
                : { timeoutMs: boundedTimeoutMs(options.timeoutMs, "timeoutMs") }),
        };
    }
}
/**
 * Controlled session API. Document and session-state authorities are opaque and intentionally
 * cannot be substituted for legacy generations or for each other.
 */
export class Session {
    #runtime;
    #client;
    #sessionId;
    #closePromise = null;
    requestedUrl;
    url;
    boundary;
    clockMode;
    profile;
    /** Initial document authority returned by session.open. Later operations return replacements. */
    stateToken;
    /** Initial state authority returned by session.open. State operations return replacements. */
    sessionStateToken;
    constructor(runtime, client, open) {
        this.#runtime = runtime;
        this.#client = client;
        this.#sessionId = open.sessionId;
        this.requestedUrl = open.requestedUrl;
        this.url = open.url;
        this.boundary = open.boundary;
        this.clockMode = open.clockMode;
        this.profile = open.profile;
        this.stateToken = open.stateToken;
        this.sessionStateToken = open.sessionStateToken;
    }
    /** @internal */
    static create(runtime, client, open) {
        return new Session(runtime, client, open);
    }
    get stderrTail() {
        return this.#client.stderrTail;
    }
    async activate(selector, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.activate);
        const { result } = await this.#client.request(METHOD.activate, encodeSessionDocumentTargetParams(selector, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionActivation);
        return result;
    }
    async fill(selector, value, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.fill);
        const { result } = await this.#client.request(METHOD.fill, encodeSessionFillParams(selector, value, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionFill);
        return result;
    }
    async focus(selector, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.focus);
        const { result } = await this.#client.request(METHOD.focus, encodeSessionDocumentTargetParams(selector, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionFocus);
        return result;
    }
    async check(selector, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.check);
        const { result } = await this.#client.request(METHOD.check, encodeSessionDocumentTargetParams(selector, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionCheck);
        return result;
    }
    async uncheck(selector, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.uncheck);
        const { result } = await this.#client.request(METHOD.uncheck, encodeSessionDocumentTargetParams(selector, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionUncheck);
        return result;
    }
    async select(selector, values, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.select);
        const { result } = await this.#client.request(METHOD.select, encodeSessionSelectParams(selector, values, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionSelect);
        return result;
    }
    async submit(selector, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.submit);
        const { result } = await this.#client.request(METHOD.submit, encodeSessionDocumentTargetParams(selector, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionSubmit);
        return result;
    }
    async query(selector, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.query);
        const { result } = await this.#client.request(METHOD.query, encodeSessionDocumentTargetParams(selector, expectedStateToken), this.#requestOptions(options, "none"), decodeSessionQuery);
        return result;
    }
    async text(selector, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.text);
        const { result } = await this.#client.request(METHOD.text, encodeSessionDocumentTargetParams(selector, expectedStateToken), this.#requestOptions(options, "none"), decodeSessionText);
        return result;
    }
    async extract(plan, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.extract);
        const { result } = await this.#client.request(METHOD.extract, encodeSessionExtractParams(plan, expectedStateToken), this.#requestOptions(options, "none"), decodeSessionExtract);
        return result;
    }
    /** Read-only recovery operation; no expected document token is required. */
    async pending(options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.pending);
        const { result } = await this.#client.request(METHOD.pending, {}, this.#requestOptions(options, "none"), decodeSessionPending);
        return result;
    }
    async settle(expectedStateToken, policy = {}, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.settle);
        const { result } = await this.#client.request(METHOD.settle, encodeSessionSettleParams(expectedStateToken, policy), this.#requestOptions(options, "indeterminate"), decodeSessionSettle);
        return bindSessionSettleResultProfile(result, this.profile);
    }
    /** Build bounded terminal evidence bound to this session's selected profile identity. */
    settlementEvidence(result) {
        return buildSettlementEvidence(result, this.profile);
    }
    async advanceToNext(expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.advanceToNext);
        const { result } = await this.#client.request(METHOD.advanceToNext, encodeExpectedStateTokenParams(expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionAdvanceToNext);
        return result;
    }
    async navigate(url, expectedStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.navigate);
        const { result } = await this.#client.request(METHOD.navigate, encodeSessionNavigateParams(url, expectedStateToken), this.#requestOptions(options, "indeterminate"), decodeSessionNavigate);
        return result;
    }
    async getCookies(options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.getCookies);
        const { result } = await this.#client.request(METHOD.getCookies, {}, this.#requestOptions(options, "none"), decodeSessionCookies);
        return result;
    }
    async setCookies(cookies, expectedSessionStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.setCookies);
        const { result } = await this.#client.request(METHOD.setCookies, encodeSessionCookiesSetParams(cookies, expectedSessionStateToken), this.#requestOptions(options, "indeterminate"), (value) => decodeSessionStateMutation(value, "session.cookies.set result"));
        return result;
    }
    async getStorage(options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.getStorage);
        const { result } = await this.#client.request(METHOD.getStorage, {}, this.#requestOptions(options, "none"), decodeSessionStorage);
        return result;
    }
    async setStorage(origins, expectedSessionStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.setStorage);
        const { result } = await this.#client.request(METHOD.setStorage, encodeSessionStorageSetParams(origins, expectedSessionStateToken), this.#requestOptions(options, "indeterminate"), (value) => decodeSessionStateMutation(value, "session.storage.set result"));
        return result;
    }
    async exportState(options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.exportState);
        const { result } = await this.#client.request(METHOD.exportState, {}, this.#requestOptions(options, "none"), decodeSessionStateExport);
        return result;
    }
    /**
     * Retained as the wire-level post-publication import endpoint. A published session can no
     * longer import state, so this always rejects with `session_state_import_phase_closed`.
     * Supply initial state through `Runtime.openSession(..., { state })` instead. The SDK
     * intentionally does not serialize either argument because the closed-phase response is
     * unconditional and session state is sensitive.
     */
    async importState(state, expectedSessionStateToken, options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.importState);
        void state;
        void expectedSessionStateToken;
        const { result } = await this.#client.request(METHOD.importState, {}, this.#requestOptions(options, "none"), decodeUnexpectedSessionStateImportSuccess);
        return result;
    }
    async requests(options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.requests);
        const { result } = await this.#client.request(METHOD.requests, encodeSessionAuditParams(options), this.#requestOptions(options, "none"), decodeSessionRequests);
        return result;
    }
    async evidence(options = {}) {
        this.#assertOpen();
        this.#assertMethod(METHOD.evidence);
        const { result } = await this.#client.request(METHOD.evidence, encodeSessionAuditParams(options), this.#requestOptions(options, "none"), decodeSessionEvidence);
        return result;
    }
    close(options = {}) {
        if (this.#closePromise !== null)
            return this.#closePromise;
        this.#closePromise = this.#close(options);
        return this.#closePromise;
    }
    async #close(options) {
        try {
            const { result } = await this.#client.request(METHOD.close, {}, {
                ...this.#requestOptions(options, "indeterminate"),
                terminatesProcess: true,
            }, (value) => {
                decodeClose(value);
            });
            void result;
            await this.#client.waitForCleanExit(options.signal);
            this.#runtime.appDidClose();
        }
        catch (error) {
            this.#closePromise = null;
            throw error;
        }
    }
    #assertOpen() {
        if (this.#closePromise !== null) {
            throw new StasisStateError("The Stasis session is closing or closed", this.stderrTail);
        }
    }
    #assertMethod(method) {
        if (!this.#runtime.info.capabilities.methods.includes(method)) {
            throw new StasisStateError(`The Stasis runtime did not advertise ${method}`, this.stderrTail);
        }
    }
    #requestOptions(options, timeoutStateEffect) {
        return {
            sessionId: this.#sessionId,
            expectedResponseSessionId: this.#sessionId,
            timeoutStateEffect,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            ...(options.timeoutMs === undefined
                ? {}
                : { timeoutMs: boundedTimeoutMs(options.timeoutMs, "timeoutMs") }),
        };
    }
}
function boundedTimeoutMs(value, label) {
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
        throw new RangeError(`${label} must be a safe integer between 1 and ${MAX_TIMEOUT_MS} ms`);
    }
    return value;
}
function boundedSize(value, label, allowZero) {
    if (!Number.isSafeInteger(value) ||
        value < (allowZero ? 0 : 1) ||
        value > 1024 * 1024 * 1024) {
        throw new RangeError(`${label} must be a safe integer between ${allowZero ? 0 : 1} and 1 GiB`);
    }
    return value;
}
function readPackageVersion() {
    const value = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("@oxhq/stasis package metadata must be an object");
    }
    const version = value.version;
    if (typeof version !== "string" || version.length === 0) {
        throw new TypeError("@oxhq/stasis package metadata must contain a version");
    }
    return version;
}
//# sourceMappingURL=api.js.map