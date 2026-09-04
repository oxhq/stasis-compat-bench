import { runStasisProof } from "./stasis-lane.mjs";
import { writeJson } from "../shared/io.mjs";

const result = await runStasisProof(process.env.STASIS_EXECUTABLE);
console.log(await writeJson("crawlee/stasis-raw.json", result));
if (!result.primary.success) process.exitCode = 1;
