import { evaluateContextTreeDecision, loadDecisionEvidence } from "./decision.mjs";
import { expectedVersions } from "./config.mjs";
import { verifyQuiescentWildResult } from "./result-verifier.mjs";

if (process.version !== expectedVersions.node) {
  throw new Error(`Node runtime mismatch: expected ${expectedVersions.node}, got ${process.version}`);
}
const verifiedWild = await verifyQuiescentWildResult();
const evidence = await loadDecisionEvidence();
const decision = evaluateContextTreeDecision(verifiedWild, evidence);
console.log(JSON.stringify(decision));
