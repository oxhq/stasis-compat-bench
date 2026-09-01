export interface StasisErrorOptions {
    cause?: unknown;
}
export declare class StasisError extends Error {
    readonly stderrTail: string;
    constructor(message: string, stderrTail?: string, options?: StasisErrorOptions);
}
export declare class StasisTransportError extends StasisError {
    readonly code: string;
    constructor(code: string, message: string, stderrTail?: string, options?: StasisErrorOptions);
}
export declare class StasisProcessError extends StasisTransportError {
    readonly exitCode: number | null;
    readonly signal: string | null;
    constructor(message: string, stderrTail: string, exitCode?: number | null, signal?: string | null, options?: StasisErrorOptions);
}
export type ProtocolStateEffect = "none" | "partial" | "indeterminate";
export type ProtocolErrorDetailValue = null | boolean | number | string | readonly ProtocolErrorDetailValue[] | ProtocolErrorDetails;
export interface ProtocolErrorDetails {
    readonly [key: string]: ProtocolErrorDetailValue;
}
export declare class StasisProtocolError extends StasisError {
    readonly code: string;
    readonly fatal: boolean;
    readonly stateEffect: ProtocolStateEffect;
    readonly requestId: string | null;
    readonly sessionId: string | null;
    readonly details: ProtocolErrorDetails | undefined;
    constructor(options: {
        code: string;
        message: string;
        fatal: boolean;
        stateEffect: ProtocolStateEffect;
        requestId: string | null;
        sessionId: string | null;
        stderrTail: string;
        details: ProtocolErrorDetails | undefined;
    });
}
export declare class StasisAbortError extends StasisError {
    readonly code = "aborted";
    readonly reason: unknown;
    readonly fatal: boolean;
    readonly stateEffect: ProtocolStateEffect;
    readonly method: string | null;
    readonly requestId: string | null;
    constructor(reason: unknown, stderrTail?: string, options?: {
        fatal?: boolean;
        stateEffect?: ProtocolStateEffect;
        method?: string | null;
        requestId?: string | null;
    });
}
/** A written native command exceeded its mandatory wall-clock supervision bound. */
export declare class StasisCommandTimeoutError extends StasisTransportError {
    readonly fatal = true;
    readonly stateEffect: ProtocolStateEffect;
    readonly method: string;
    readonly requestId: string;
    readonly timeoutMs: number;
    constructor(options: {
        method: string;
        requestId: string;
        timeoutMs: number;
        stateEffect: ProtocolStateEffect;
        stderrTail: string;
    });
}
export declare class StasisStateError extends StasisError {
    readonly code = "invalid_sdk_state";
}
//# sourceMappingURL=errors.d.ts.map