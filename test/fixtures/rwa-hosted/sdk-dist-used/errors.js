export class StasisError extends Error {
    stderrTail;
    constructor(message, stderrTail = "", options) {
        super(message, options);
        this.name = new.target.name;
        this.stderrTail = stderrTail;
    }
}
export class StasisTransportError extends StasisError {
    code;
    constructor(code, message, stderrTail = "", options) {
        super(message, stderrTail, options);
        this.code = code;
    }
}
export class StasisProcessError extends StasisTransportError {
    exitCode;
    signal;
    constructor(message, stderrTail, exitCode = null, signal = null, options) {
        super("process_exit", message, stderrTail, options);
        this.exitCode = exitCode;
        this.signal = signal;
    }
}
export class StasisProtocolError extends StasisError {
    code;
    fatal;
    stateEffect;
    requestId;
    sessionId;
    details;
    constructor(options) {
        super(options.message, options.stderrTail);
        this.code = options.code;
        this.fatal = options.fatal;
        this.stateEffect = options.stateEffect;
        this.requestId = options.requestId;
        this.sessionId = options.sessionId;
        this.details = options.details;
    }
}
export class StasisAbortError extends StasisError {
    code = "aborted";
    reason;
    fatal;
    stateEffect;
    method;
    requestId;
    constructor(reason, stderrTail = "", options = {}) {
        super("The Stasis operation was aborted", stderrTail, { cause: reason });
        this.name = "AbortError";
        this.reason = reason;
        this.fatal = options.fatal ?? false;
        this.stateEffect = options.stateEffect ?? "none";
        this.method = options.method ?? null;
        this.requestId = options.requestId ?? null;
    }
}
/** A written native command exceeded its mandatory wall-clock supervision bound. */
export class StasisCommandTimeoutError extends StasisTransportError {
    fatal = true;
    stateEffect;
    method;
    requestId;
    timeoutMs;
    constructor(options) {
        super("command_timeout", `Stasis command ${options.method} did not complete within ${options.timeoutMs} ms`, options.stderrTail);
        this.stateEffect = options.stateEffect;
        this.method = options.method;
        this.requestId = options.requestId;
        this.timeoutMs = options.timeoutMs;
    }
}
export class StasisStateError extends StasisError {
    code = "invalid_sdk_state";
}
//# sourceMappingURL=errors.js.map