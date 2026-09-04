import { createHash } from "node:crypto";

import { validateBaseline } from "../rwa/compare-lib.mjs";

const projectedRoot = "rwa-publication-root";

export const rwaCypressBaselineProjectionContract = deepFreeze({
  schema: "stasis-rwa-cypress-baseline-publication-projection-v1",
  source: {
    bytes: 17_229,
    sha256: "a695fbaf59d39d7bbd7a80bd01e751e1fe346e3447904d705ff3c1910208e372",
  },
  projected: {
    bytes: 17_034,
    sha256: "1b248ee12a7f5f9579c9f497315ae27fb3f766acb9c08957e20beea9bd8d5be7",
  },
  replacementRoot: projectedRoot,
  changedJsonPointers: [
    "/source/preflight/root",
    "/source/postflight/root",
    "/invocation/configFile",
    "/invocation/project",
    "/invocation/spec",
  ],
});

export function projectFrozenRwaCypressBaselineBytes(sourceBytes) {
  assertExactBytes(sourceBytes, rwaCypressBaselineProjectionContract.source, "source RWA baseline");
  const source = parseCanonicalJson(sourceBytes, "source RWA baseline");
  assertValidBaseline(source, "source RWA baseline");

  const projected = structuredClone(source);
  projected.source.preflight.root = projectedRoot;
  projected.source.postflight.root = projectedRoot;
  projected.invocation.configFile = `${projectedRoot}/cypress.config.ts`;
  projected.invocation.project = projectedRoot;
  projected.invocation.spec = `${projectedRoot}/cypress/tests/ui/auth.spec.ts`;
  assertValidBaseline(projected, "projected RWA baseline");

  const bytes = canonicalJsonBytes(projected);
  assertNoMachineLocalPathText(bytes.toString("utf8"));
  assertExactBytes(bytes, rwaCypressBaselineProjectionContract.projected, "projected RWA baseline");
  return Object.freeze({
    bytes,
    receipt: projectionReceipt(),
  });
}

export function assertFrozenProjectedRwaCypressBaselineBytes(projectedBytes) {
  assertExactBytes(
    projectedBytes,
    rwaCypressBaselineProjectionContract.projected,
    "projected RWA baseline",
  );
  const projected = parseCanonicalJson(projectedBytes, "projected RWA baseline");
  assertExactProjectionLocations(projected);
  assertValidBaseline(projected, "projected RWA baseline");
  assertNoMachineLocalPathText(projectedBytes.toString("utf8"));
  return deepFreeze(projected);
}

function assertExactProjectionLocations(value) {
  const expected = [
    value?.source?.preflight?.root,
    value?.source?.postflight?.root,
    value?.invocation?.configFile,
    value?.invocation?.project,
    value?.invocation?.spec,
  ];
  const actual = [
    projectedRoot,
    projectedRoot,
    `${projectedRoot}/cypress.config.ts`,
    projectedRoot,
    `${projectedRoot}/cypress/tests/ui/auth.spec.ts`,
  ];
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("Projected RWA baseline differs at the five allowed host-path fields");
  }
}

function assertValidBaseline(value, label) {
  const validation = validateBaseline(value);
  if (validation.valid !== true) {
    throw new Error(`${label} is not the frozen valid Cypress baseline: ${validation.violations.join("; ")}`);
  }
}

function parseCanonicalJson(bytes, label) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError(`${label} must be one Buffer`);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  if (!bytes.equals(canonicalJsonBytes(value))) {
    throw new Error(`${label} is not canonical pretty JSON`);
  }
  return value;
}

function assertExactBytes(bytes, expected, label) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== expected.bytes ||
    sha256(bytes) !== expected.sha256
  ) {
    throw new Error(`${label} differs from its frozen size and SHA-256`);
  }
}

function assertNoMachineLocalPathText(value) {
  const patterns = [
    /(?:^|[\s"'`(=])(?:[A-Za-z]:[\\/])/mu,
    /file:\/\/(?:\/?[A-Za-z]:|\/(?:Users|home|root)\/)/iu,
    /(?:^|[\s"'`(=])\\\\[^\\/\s]+\\[^\\/\s]+/mu,
    /(?:^|[\s"'`(=])\/(?:Users|home)\/[^/\s]+(?:\/|$)/mu,
    /(?:^|[\s"'`(=])\/root(?:\/|$)/mu,
  ];
  if (patterns.some((pattern) => pattern.test(value))) {
    throw new Error("Projected RWA baseline still contains one machine-local path");
  }
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function projectionReceipt() {
  return deepFreeze({
    schema: rwaCypressBaselineProjectionContract.schema,
    source: structuredClone(rwaCypressBaselineProjectionContract.source),
    projected: structuredClone(rwaCypressBaselineProjectionContract.projected),
    replacementRoot: projectedRoot,
    changedJsonPointers: [...rwaCypressBaselineProjectionContract.changedJsonPointers],
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}
