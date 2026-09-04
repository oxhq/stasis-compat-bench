import { type SettlementEvidenceV2 } from "./evidence.js";
import { type LegacySupportProfile, type SelectableSessionProfile, type SessionSupportProfile } from "./profile.js";
import type { AdvanceToNextResult, AutomationMutationResult, CommandOptions, ExtractPlan, ExtractResult, LaunchOptions, OpenOptions, PendingSnapshot, QueryResult, RuntimeInfo, SessionAdvanceToNextResult, SessionAuditOptions, SessionAutomationMutationResult, SessionCookie, SessionCookiesResult, SessionEvidenceResult, SessionFocusResult, SessionCheckResult, SessionExtractPlan, SessionExtractResult, SessionNavigateResult, SessionOpenOptions, SessionOriginState, SessionPendingSnapshot, SessionQueryResult, SessionRequestsResult, SessionSelectResult, SessionSettleResult, SessionState, SessionStateExportResult, SessionStateMutationResult, SessionStateToken, SessionStorageResult, SessionSubmitResult, SessionTextResult, DocumentStateToken, SettlePolicy, SettleResult } from "./types.js";
export declare function launch(options?: LaunchOptions): Promise<Runtime>;
export declare class Runtime {
    #private;
    readonly info: RuntimeInfo;
    private constructor();
    get pid(): number | undefined;
    get stderrTail(): string;
    open(url: string | URL, options?: OpenOptions): Promise<App>;
    /** Open a controlled session using the stable v1 profile when selection is omitted. */
    openSession(url: string | URL, options?: SessionOpenOptions<SessionSupportProfile>): Promise<Session<SessionSupportProfile>>;
    /** Open a controlled session using an explicitly selected advertised profile. */
    openSession<Profile extends SelectableSessionProfile>(url: string | URL, options: SessionOpenOptions<Profile> & {
        readonly profile: Profile;
    }): Promise<Session<Profile>>;
    /** Abruptly terminates the owned process. Use App.close()/Session.close() for graceful close. */
    close(): Promise<void>;
}
export declare class App {
    #private;
    readonly requestedUrl: string;
    readonly url: string;
    readonly boundary: "load_complete" | "controlled_ready";
    readonly clockMode: "real" | "controlled";
    readonly profile: LegacySupportProfile | null;
    private constructor();
    get stderrTail(): string;
    evaluate(expression: string, options?: CommandOptions): Promise<unknown>;
    /** Activate the exact-one element matched by a native CSS selector. */
    activate(selector: string, expectedGeneration: bigint, options?: CommandOptions): Promise<AutomationMutationResult>;
    /** Replace the value of the exact-one supported form control matched by a native CSS selector. */
    fill(selector: string, value: string, expectedGeneration: bigint, options?: CommandOptions): Promise<AutomationMutationResult>;
    /** Count selector matches without creating persistent DOM handles. */
    query(selector: string, expectedGeneration: bigint, options?: CommandOptions): Promise<QueryResult>;
    /** Read raw textContent from the exact-one element matched by a native CSS selector. */
    text(selector: string, expectedGeneration: bigint, options?: CommandOptions): Promise<string>;
    /** Extract ordered text/HTML fields from every root matched by a native CSS selector. */
    extract(plan: ExtractPlan, expectedGeneration: bigint, options?: CommandOptions): Promise<ExtractResult>;
    pending(options?: CommandOptions): Promise<PendingSnapshot>;
    settle(policy?: SettlePolicy, options?: CommandOptions): Promise<SettleResult>;
    advanceToNext(options?: CommandOptions): Promise<AdvanceToNextResult>;
    close(options?: CommandOptions): Promise<void>;
}
/**
 * Controlled session API. Document and session-state authorities are opaque and intentionally
 * cannot be substituted for legacy generations or for each other.
 */
export declare class Session<Profile extends SelectableSessionProfile = SessionSupportProfile> {
    #private;
    readonly requestedUrl: string;
    readonly url: string;
    readonly boundary: "controlled_ready";
    readonly clockMode: "controlled";
    readonly profile: Profile;
    /** Initial document authority returned by session.open. Later operations return replacements. */
    readonly stateToken: DocumentStateToken;
    /** Initial state authority returned by session.open. State operations return replacements. */
    readonly sessionStateToken: SessionStateToken;
    private constructor();
    get stderrTail(): string;
    activate(selector: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionAutomationMutationResult>;
    fill(selector: string, value: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionAutomationMutationResult>;
    focus(selector: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionFocusResult>;
    check(selector: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionCheckResult>;
    uncheck(selector: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionCheckResult>;
    select(selector: string, values: readonly string[], expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionSelectResult>;
    submit(selector: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionSubmitResult>;
    query(selector: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionQueryResult>;
    text(selector: string, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionTextResult>;
    extract(plan: SessionExtractPlan, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionExtractResult>;
    /** Read-only recovery operation; no expected document token is required. */
    pending(options?: CommandOptions): Promise<SessionPendingSnapshot>;
    settle(expectedStateToken: DocumentStateToken, policy?: SettlePolicy, options?: CommandOptions): Promise<SessionSettleResult<Profile>>;
    /** Build bounded terminal evidence bound to this session's selected profile identity. */
    settlementEvidence(result: SessionSettleResult<Profile>): SettlementEvidenceV2<Profile>;
    advanceToNext(expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionAdvanceToNextResult>;
    navigate(url: string | URL, expectedStateToken: DocumentStateToken, options?: CommandOptions): Promise<SessionNavigateResult>;
    getCookies(options?: CommandOptions): Promise<SessionCookiesResult>;
    setCookies(cookies: readonly SessionCookie[], expectedSessionStateToken: SessionStateToken, options?: CommandOptions): Promise<SessionStateMutationResult>;
    getStorage(options?: CommandOptions): Promise<SessionStorageResult>;
    setStorage(origins: readonly SessionOriginState[], expectedSessionStateToken: SessionStateToken, options?: CommandOptions): Promise<SessionStateMutationResult>;
    exportState(options?: CommandOptions): Promise<SessionStateExportResult>;
    /**
     * Retained as the wire-level post-publication import endpoint. A published session can no
     * longer import state, so this always rejects with `session_state_import_phase_closed`.
     * Supply initial state through `Runtime.openSession(..., { state })` instead. The SDK
     * intentionally does not serialize either argument because the closed-phase response is
     * unconditional and session state is sensitive.
     */
    importState(state: SessionState, expectedSessionStateToken: SessionStateToken, options?: CommandOptions): Promise<never>;
    requests(options?: SessionAuditOptions): Promise<SessionRequestsResult>;
    evidence(options?: SessionAuditOptions): Promise<SessionEvidenceResult>;
    close(options?: CommandOptions): Promise<void>;
}
//# sourceMappingURL=api.d.ts.map