import { writeJson } from "../shared/io.mjs";
import { deterministicV03ArtifactPrefix } from "./identity.mjs";
import { runPlaywrightV03Proof } from "./playwright-lane.mjs";

const result = await runPlaywrightV03Proof();
console.log(await writeJson(`${deterministicV03ArtifactPrefix}/playwright-raw.json`, result));
if (!result.primary.success) process.exitCode = 1;
