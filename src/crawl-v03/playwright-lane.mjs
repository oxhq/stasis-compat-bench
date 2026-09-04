import { runPlaywrightProof } from "../crawl/playwright-lane.mjs";
import {
  deterministicV03BaselineEnvelope,
  deterministicV03Protocol,
  deterministicV03Track,
} from "./identity.mjs";

export async function runPlaywrightV03Proof({
  runFrozenBaseline = runPlaywrightProof,
} = {}) {
  const result = await runFrozenBaseline();
  return {
    ...result,
    schema: deterministicV03BaselineEnvelope.schema,
    protocol: deterministicV03Protocol,
    track: deterministicV03Track,
  };
}
