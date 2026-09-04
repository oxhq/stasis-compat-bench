import { writeJson } from "../shared/io.mjs";
import { deterministicV03ArtifactPrefix } from "./identity.mjs";
import { runStasisV03Proof } from "./stasis-lane.mjs";

const result = await runStasisV03Proof(process.env.STASIS_EXECUTABLE);
console.log(await writeJson(`${deterministicV03ArtifactPrefix}/stasis-raw.json`, result));
if (!result.primary.success) process.exitCode = 1;
