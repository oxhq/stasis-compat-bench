import {
  defaultCandidateExecutablePath,
  runLocalCookieProfileReproductions,
  runUnchangedWildCookieProfileReproductions,
} from "./cookie-profile.mjs";

const [mode = "local", ...extraArguments] = process.argv.slice(2);
if (extraArguments.length > 0 || !["local", "wild"].includes(mode)) {
  throw new Error("Usage: node src/minimizers/run-cookie-profile.mjs [local|wild]");
}

const executablePath = process.env.STASIS_EXECUTABLE ?? defaultCandidateExecutablePath;
const result = mode === "local"
  ? await runLocalCookieProfileReproductions(executablePath)
  : await runUnchangedWildCookieProfileReproductions(executablePath);

console.log(JSON.stringify(result, null, 2));
