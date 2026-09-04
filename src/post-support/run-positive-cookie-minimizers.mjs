import {
  loadPostSupportCandidateSpec,
  verifyPostSupportCandidate,
} from "./candidate-identity.mjs";
import { runPositiveCookieMinimizers } from "./positive-cookie-minimizers.mjs";
import { serializePostSupportArtifact } from "./artifact-privacy.mjs";

const candidate = await verifyPostSupportCandidate(loadPostSupportCandidateSpec());
const result = await runPositiveCookieMinimizers(candidate);
process.stdout.write(serializePostSupportArtifact(result));
