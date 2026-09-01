import { runStasisRwaProof } from "./stasis-lane.mjs";
import { writeJson } from "../shared/io.mjs";

for (const variable of ["RWA_APP_ORIGIN", "RWA_API_ORIGIN"]) {
  if (Object.hasOwn(process.env, variable)) {
    throw new Error(`${variable} is forbidden: the sealed lane uses the frozen localhost origins`);
  }
}

const result = await runStasisRwaProof(process.env.STASIS_EXECUTABLE);

console.log(await writeJson("rwa/stasis-raw.json", result));
if (result.summary.passed !== result.denominator) process.exitCode = 1;
