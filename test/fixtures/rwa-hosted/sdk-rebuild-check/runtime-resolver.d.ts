import { StasisError } from "./errors.js";
export declare class RuntimeResolutionError extends StasisError {
    constructor(message: string, options?: ErrorOptions);
}
export interface RuntimeResolutionOptions {
    /** Override the per-user runtime cache. Relative paths are resolved from cwd. */
    cacheDirectory?: string;
    signal?: AbortSignal;
}
/**
 * Resolve, install, and verify the native runtime bound to an exact SDK
 * version. This function performs network I/O only when the digest-keyed cache
 * does not already contain a verified executable.
 */
export declare function resolveRuntimeExecutable(sdkVersion: string, options?: RuntimeResolutionOptions): Promise<string>;
//# sourceMappingURL=runtime-resolver.d.ts.map