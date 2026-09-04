import { rwaBaselineExpected } from "../rwa/run-cypress.mjs";

const allowedRuntimeDatabasePostflightSha256 =
  "ce499607bd4d1851353aca0e79b95fd737aa15755fd12d0e10b02af71dd48920";

export function rwaCheckoutContinuityMatches(startup, postflight) {
  if (
    !isCleanProjectedCheckoutState(startup) ||
    (!isCleanProjectedCheckoutState(postflight) &&
      !isAllowedPostflightProjectedCheckoutState(postflight))
  ) {
    return false;
  }
  return sameJson(
    projectImmutableCheckoutIdentity(startup),
    projectImmutableCheckoutIdentity(postflight),
  );
}

function isProjectedCheckoutBaseState(value) {
  return value !== null &&
    typeof value === "object" &&
    value.valid === true &&
    Array.isArray(value.violations) &&
    value.violations.length === 0 &&
    Array.isArray(value.trackedStatusEntries) &&
    value.runtimeDatabase !== null &&
    typeof value.runtimeDatabase === "object" &&
    /^[a-f0-9]{64}$/u.test(value.runtimeDatabase.worktreeSha256 ?? "");
}

function isCleanProjectedCheckoutState(value) {
  return isProjectedCheckoutBaseState(value) &&
    value.trackedStatusEntries.length === 0 &&
    value.runtimeDatabase.worktreeSha256 === rwaBaselineExpected.seed.worktreeSha256 &&
    value.runtimeDatabase.newlineOnlyDifference === false &&
    value.runtimeDatabase.allowedRuntimeMutation === false;
}

function isAllowedPostflightProjectedCheckoutState(value) {
  return isProjectedCheckoutBaseState(value) &&
    sameJson(value.trackedStatusEntries, [` M ${rwaBaselineExpected.databasePath}`]) &&
    value.runtimeDatabase.worktreeSha256 === allowedRuntimeDatabasePostflightSha256 &&
    value.runtimeDatabase.newlineOnlyDifference === true &&
    value.runtimeDatabase.allowedRuntimeMutation === true;
}

function projectImmutableCheckoutIdentity(value) {
  const projected = structuredClone(value);
  delete projected.trackedStatusEntries;
  delete projected.runtimeDatabase.worktreeSha256;
  delete projected.runtimeDatabase.newlineOnlyDifference;
  delete projected.runtimeDatabase.allowedRuntimeMutation;
  return projected;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
