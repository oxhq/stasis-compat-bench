export const postSupportWildProcessSteps = Object.freeze([
  "wild-smoke",
  "wild-paired",
]);

export function postSupportWildStepEnvironment(step, environment = process.env) {
  if (!postSupportWildProcessSteps.includes(step)) {
    throw new TypeError("Unknown post-support wild process step");
  }
  const projected = { ...environment };
  delete projected.STASIS_POST_SUPPORT_WILD_ARTIFACT_ROOT_QUIESCENT;
  return projected;
}

export async function executePostSupportWildProcessPlan(runChild, environment = process.env) {
  if (typeof runChild !== "function") {
    throw new TypeError("Post-support wild process plan requires one child runner");
  }
  for (const step of postSupportWildProcessSteps) {
    await runChild(step, postSupportWildStepEnvironment(step, environment));
  }
}
