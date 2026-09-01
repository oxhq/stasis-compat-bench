import type { DocumentStateToken, ExternalIoSnapshot, PersistentWork, SessionSettleResult, SettleFailureCode, SettleLimit, SettleOutcome, SettleResult, UnsupportedWork } from "./types.js";
import { CONTROLLED_WEBAPP_V1_PROFILE, type SelectableSessionProfile, type SessionSupportProfile } from "./profile.js";
export { CONTROLLED_WEBAPP_V1_PROFILE, CONTROLLED_WEB_SESSION_V1_PROFILE, CONTROLLED_WEB_SESSION_V2_PROFILE, } from "./profile.js";
export declare const SETTLEMENT_EVIDENCE_MAX_ITEMS: 32;
export type SettlementEvidenceReason = {
    readonly kind: "quiescent";
} | {
    readonly kind: "persistent_work";
    readonly items: readonly Readonly<PersistentWork>[];
    readonly omitted: number;
} | {
    readonly kind: "external_io";
    readonly items: readonly Readonly<ExternalIoSnapshot>[];
    readonly omitted: number;
} | {
    readonly kind: "unsupported_work";
    readonly code: SettleFailureCode;
    readonly items: readonly Readonly<UnsupportedWork>[];
    readonly omitted: number;
} | {
    readonly kind: "limit";
    readonly limit: Readonly<SettleLimit>;
} | {
    readonly kind: "runtime_error";
    readonly code: SettleFailureCode;
};
/**
 * A bounded explanation of why one settlement call terminated.
 *
 * This is deliberately a terminal snapshot, not a causal journal. It copies only the
 * allow-listed blocker metadata already present in SettleResult. Selectors, fill values, URLs,
 * headers, and bodies cannot enter this projection.
 */
export interface SettlementEvidenceV1 {
    readonly schemaVersion: 1;
    readonly completeness: "terminal_snapshot";
    readonly profile: typeof CONTROLLED_WEBAPP_V1_PROFILE;
    readonly outcome: SettleOutcome;
    readonly virtualTimeNs: bigint;
    readonly stateGeneration: bigint;
    readonly domEpoch: bigint;
    readonly reason: SettlementEvidenceReason;
    readonly bounds: {
        readonly maxItems: typeof SETTLEMENT_EVIDENCE_MAX_ITEMS;
    };
}
/** A bounded session terminal snapshot bound to one exact document and selected session profile. */
export interface SettlementEvidenceV2<Profile extends SelectableSessionProfile = SessionSupportProfile> {
    readonly schemaVersion: 2;
    readonly completeness: "terminal_snapshot";
    readonly profile: Profile;
    readonly stateToken: DocumentStateToken;
    readonly outcome: SettleOutcome;
    readonly virtualTimeNs: bigint;
    readonly stateGeneration: bigint;
    readonly domEpoch: bigint;
    readonly reason: SettlementEvidenceReason;
    readonly bounds: {
        readonly maxItems: typeof SETTLEMENT_EVIDENCE_MAX_ITEMS;
    };
}
/** Build session evidence using the result's SDK-bound profile, or v1 for a manual legacy result. */
export declare function settlementEvidence<Profile extends SelectableSessionProfile = SessionSupportProfile>(result: SessionSettleResult<Profile>): SettlementEvidenceV2<Profile>;
/** A structurally copied or manual session result has only the legacy-v1 identity. */
export declare function settlementEvidence(result: SessionSettleResult): SettlementEvidenceV2<SessionSupportProfile>;
/** Build session evidence bound to an explicitly selected session profile. */
export declare function settlementEvidence<Profile extends SelectableSessionProfile>(result: SessionSettleResult<Profile>, profile: NoInfer<Profile>): SettlementEvidenceV2<Profile>;
export declare function settlementEvidence(result: SettleResult & {
    readonly stateToken?: never;
}): SettlementEvidenceV1;
//# sourceMappingURL=evidence.d.ts.map