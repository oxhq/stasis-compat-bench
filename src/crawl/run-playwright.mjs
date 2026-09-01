import { runPlaywrightProof } from "./playwright-lane.mjs";
import { writeJson } from "../shared/io.mjs";

const result = await runPlaywrightProof();
console.log(await writeJson("crawlee/playwright-raw.json", result));
if (!result.primary.success) process.exitCode = 1;
