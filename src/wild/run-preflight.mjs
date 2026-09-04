import { runWildPreflight } from "./preflight.mjs";

const result = await runWildPreflight();
console.log(JSON.stringify(result));
