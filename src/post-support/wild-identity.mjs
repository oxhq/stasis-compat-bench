import { assertCandidateIdentity } from "./candidate-identity.mjs";

export function projectWildCandidateIdentity(identity) {
  assertCandidateIdentity(identity);
  return {
    schema: "stasis-post-support-wild-candidate-v1",
    repository: identity.repository,
    revision: identity.revision,
    version: identity.version,
    profile: identity.profile,
    hostedSdkPackageTrain: {
      source: identity.hostedSdkPackageTrain.source,
      runNumber: identity.hostedSdkPackageTrain.id,
      attemptNumber: identity.hostedSdkPackageTrain.attempt,
    },
    windows: identity.windows,
    sdk: identity.sdk,
  };
}
