import { CONTROLLED_WEBAPP_V1_PROFILE, CONTROLLED_WEB_SESSION_V1_PROFILE, CONTROLLED_WEB_SESSION_V2_PROFILE, isSelectableSessionProfile, } from "./profile.js";
export { CONTROLLED_WEBAPP_V1_PROFILE, CONTROLLED_WEB_SESSION_V1_PROFILE, CONTROLLED_WEB_SESSION_V2_PROFILE, } from "./profile.js";
export const SETTLEMENT_EVIDENCE_MAX_ITEMS = 32;
const runtimeSessionSettleProfiles = new WeakMap();
export function settlementEvidence(result, profile) {
    const stateToken = sessionDocumentStateToken(result);
    const reason = settlementEvidenceReason(result);
    if (stateToken !== null) {
        if (profile !== undefined && !isSelectableSessionProfile(profile)) {
            throw new TypeError("Session settlement evidence requires a supported session profile");
        }
        const runtimeProfile = runtimeSessionSettleProfiles.get(result);
        if (runtimeProfile === undefined &&
            profile !== undefined &&
            profile !== CONTROLLED_WEB_SESSION_V1_PROFILE) {
            throw new TypeError(`Unbound session settle results can only produce ${CONTROLLED_WEB_SESSION_V1_PROFILE} evidence`);
        }
        if (runtimeProfile !== undefined && profile !== undefined && runtimeProfile !== profile) {
            throw new TypeError(`Session settlement evidence profile ${profile} does not match runtime-bound profile ${runtimeProfile}`);
        }
        const selectedProfile = runtimeProfile ?? profile ?? CONTROLLED_WEB_SESSION_V1_PROFILE;
        return {
            schemaVersion: 2,
            completeness: "terminal_snapshot",
            profile: selectedProfile,
            stateToken,
            outcome: result.outcome,
            virtualTimeNs: result.virtualTimeNs,
            stateGeneration: result.stateGeneration,
            domEpoch: result.domEpoch,
            reason,
            bounds: { maxItems: SETTLEMENT_EVIDENCE_MAX_ITEMS },
        };
    }
    if (profile !== undefined) {
        throw new TypeError("Legacy settlement evidence cannot carry a session profile");
    }
    const base = {
        schemaVersion: 1,
        completeness: "terminal_snapshot",
        profile: CONTROLLED_WEBAPP_V1_PROFILE,
        outcome: result.outcome,
        virtualTimeNs: result.virtualTimeNs,
        stateGeneration: result.stateGeneration,
        domEpoch: result.domEpoch,
        bounds: { maxItems: SETTLEMENT_EVIDENCE_MAX_ITEMS },
    };
    return { ...base, reason };
}
function settlementEvidenceReason(result) {
    switch (result.outcome) {
        case "quiescent":
            return { kind: "quiescent" };
        case "quiescent_with_persistent_work":
        case "blocked_on_open_ended_work": {
            const { items, omitted } = boundedCopy(result.persistentWork, copyPersistentWork);
            return { kind: "persistent_work", items, omitted };
        }
        case "blocked_on_external_io": {
            const { items, omitted } = boundedCopy(result.externalIo, copyExternalIo);
            return { kind: "external_io", items, omitted };
        }
        case "unsupported_work": {
            const { items, omitted } = boundedCopy(result.unsupportedWork, copyUnsupportedWork);
            return { kind: "unsupported_work", code: result.failure.code, items, omitted };
        }
        case "virtual_time_limit_exceeded":
        case "task_limit_exceeded":
        case "microtask_limit_exceeded":
        case "rendering_limit_exceeded":
        case "mutation_limit_exceeded":
        case "control_turn_limit_exceeded":
            return { kind: "limit", limit: copyLimit(result.limit) };
        case "runtime_error":
            return { kind: "runtime_error", code: result.failure.code };
    }
}
function sessionDocumentStateToken(result) {
    const resultRecord = result;
    const snapshotValue = resultRecord.snapshot;
    const snapshotRecord = typeof snapshotValue === "object" && snapshotValue !== null && !Array.isArray(snapshotValue)
        ? snapshotValue
        : null;
    const resultHasToken = Object.hasOwn(resultRecord, "stateToken");
    const snapshotHasToken = snapshotRecord !== null && Object.hasOwn(snapshotRecord, "stateToken");
    if (!resultHasToken && !snapshotHasToken)
        return null;
    if (!resultHasToken || !snapshotHasToken) {
        throw new TypeError("Session settlement evidence requires stateToken on both the result and its snapshot");
    }
    const stateToken = resultRecord.stateToken;
    const snapshotStateToken = snapshotRecord.stateToken;
    if (typeof stateToken !== "string" || stateToken.length === 0) {
        throw new TypeError("Session settlement evidence requires a non-empty stateToken");
    }
    if (snapshotStateToken !== stateToken) {
        throw new TypeError("Session settlement evidence stateToken disagrees with its snapshot");
    }
    return stateToken;
}
function boundedCopy(values, copy) {
    const retained = values.slice(0, SETTLEMENT_EVIDENCE_MAX_ITEMS);
    return {
        items: retained.map(copy),
        omitted: Math.max(0, values.length - retained.length),
    };
}
/** @internal Bind a decoded SDK result to its selected session without mutating wire evidence. */
export function bindSessionSettleResultProfile(result, profile) {
    if (!isSelectableSessionProfile(profile)) {
        throw new TypeError("Session settle result requires a supported session profile");
    }
    runtimeSessionSettleProfiles.set(result, profile);
    return result;
}
function copyPersistentWork(work) {
    return {
        ...(work.sourceId === undefined ? {} : { sourceId: work.sourceId }),
        kind: work.kind,
        count: work.count,
        reason: work.reason,
        ...(work.requestedPeriodNs === undefined
            ? {}
            : { requestedPeriodNs: work.requestedPeriodNs }),
    };
}
function copyExternalIo(operation) {
    return {
        sourceId: operation.sourceId,
        kind: operation.kind,
        phase: operation.phase,
        owner: operation.owner,
        loadBlocking: operation.loadBlocking,
        startedAtNs: operation.startedAtNs,
    };
}
function copyUnsupportedWork(work) {
    return {
        ...(work.sourceId === undefined ? {} : { sourceId: work.sourceId }),
        kind: work.kind,
        count: work.count,
        reason: work.reason,
        ...(work.timeSurface === undefined ? {} : { timeSurface: work.timeSurface }),
    };
}
function copyLimit(limit) {
    if (limit.kind === "virtual_time") {
        return {
            kind: "virtual_time",
            limit: limit.limit,
            startVirtualTimeNs: limit.startVirtualTimeNs,
            requestedVirtualTimeNs: limit.requestedVirtualTimeNs,
        };
    }
    if (limit.kind === "control_turns") {
        return { kind: "control_turns", limit: limit.limit };
    }
    return { kind: limit.kind, limit: limit.limit, observed: limit.observed };
}
//# sourceMappingURL=evidence.js.map