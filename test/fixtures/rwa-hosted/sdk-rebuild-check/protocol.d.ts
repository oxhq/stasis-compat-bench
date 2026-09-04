import { type ProtocolStateEffect } from "./errors.js";
type SessionExpectation = null | string | "<open>";
interface RequestOptions {
    sessionId: string | null;
    expectedResponseSessionId: SessionExpectation;
    signal?: AbortSignal;
    terminatesProcess?: boolean;
    timeoutMs?: number;
    timeoutStateEffect: ProtocolStateEffect;
}
export interface ProtocolSuccess<Result = unknown> {
    result: Result;
    sessionId: string | null;
}
export interface SpawnClientOptions {
    executablePath: string;
    args: readonly string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxStderrBytes: number;
    maxFrameBytes: number;
    closeTimeoutMs: number;
    commandTimeoutMs: number;
}
export declare class ProtocolClient {
    #private;
    static spawn(options: SpawnClientOptions): ProtocolClient;
    private constructor();
    get pid(): number | undefined;
    get stderrTail(): string;
    get isUsable(): boolean;
    waitForCleanExit(signal?: AbortSignal): Promise<void>;
    request<Result>(method: string, params: Record<string, unknown>, options: RequestOptions, decode: (result: unknown, sessionId: string | null) => Result): Promise<ProtocolSuccess<Result>>;
    terminate(): Promise<void>;
}
export {};
//# sourceMappingURL=protocol.d.ts.map