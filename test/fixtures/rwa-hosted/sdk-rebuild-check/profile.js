/** The exact controlled browser subset supported by Stasis 0.1. */
export const CONTROLLED_WEBAPP_V1_PROFILE = "controlled-webapp-v1";
/** The bounded controlled session subset introduced by the additive Stasis 0.2 API. */
export const CONTROLLED_WEB_SESSION_V1_PROFILE = "controlled-web-session-v1";
/** Candidate Stasis 0.3 session profile with controlled local MessageChannel delivery. */
export const CONTROLLED_WEB_SESSION_V2_PROFILE = "controlled-web-session-v2";
/** Session profiles understood by this SDK, in compatibility order. */
export const SESSION_SUPPORT_PROFILES = Object.freeze([
    CONTROLLED_WEB_SESSION_V1_PROFILE,
    CONTROLLED_WEB_SESSION_V2_PROFILE,
]);
/** @internal */
export function isSelectableSessionProfile(value) {
    return (value === CONTROLLED_WEB_SESSION_V1_PROFILE ||
        value === CONTROLLED_WEB_SESSION_V2_PROFILE);
}
//# sourceMappingURL=profile.js.map