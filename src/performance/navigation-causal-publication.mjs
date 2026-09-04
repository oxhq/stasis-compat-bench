import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AdmZip from "adm-zip";

import {
  assertPostSupportArtifactHtmlPrivacy,
  assertPostSupportArtifactPrivacy,
} from "../post-support/artifact-privacy.mjs";
import {
  bindNavigationCausalActionArchives,
  canonicalNavigationCausalJsonBytes,
  navigationCausalHostArtifactNames,
  parseCanonicalNavigationCausalJson,
} from "./navigation-causal-artifact-binding.mjs";
import {
  navigationCausalContractIdentity,
} from "./navigation-causal-contract.mjs";
import {
  verifyNavigationCausalHostedProvenance,
} from "./navigation-causal-hosted-provenance.mjs";
import {
  assertNavigationCausalAnonymousContractPreflightReceipt,
  verifyNavigationCausalV4SelectionEvidence,
} from "./navigation-causal-public-release.mjs";

export const navigationCausalPublicationSchema =
  "stasis-v0.3.3-performance-navigation-causal-publication-v1";
export const navigationCausalPrivacyScanSchema =
  "stasis-v0.3.3-performance-navigation-causal-privacy-scan-v1";

export const navigationCausalPublicationInputNames = Object.freeze([
  "actions-navigation-causal-host-a.zip",
  "actions-navigation-causal-host-b.zip",
  "anonymous-contract-preflight.json",
  "contract-release.json",
  "contract-commit.json",
  "workflow-run.json",
  "workflow-runs.json",
  "workflow-jobs.json",
  "workflow-artifacts.json",
  "workflow-source-commit.json",
  "v4-evidence-release.json",
  "v4-localization-evidence.json",
]);

export const navigationCausalPublicationAssetNames = Object.freeze([
  ...navigationCausalPublicationInputNames.slice(0, 2),
  "navigation-causal-host-a-raw.json",
  "navigation-causal-host-a-outcome.json",
  "navigation-causal-host-b-raw.json",
  "navigation-causal-host-b-outcome.json",
  "navigation-causal-artifact-binding.json",
  "navigation-causal-hosted-provenance.json",
  "navigation-causal-replication.json",
  ...navigationCausalPublicationInputNames.slice(2),
  "privacy-scan.json",
  "SHA256SUMS.txt",
]);

export function buildNavigationCausalPublication({ inputs, v4TagRefRecord }) {
  assertExactBytesObject(inputs, navigationCausalPublicationInputNames, "publication inputs");
  const records = {
    runRecord: parseJson(inputs["workflow-run.json"], "workflow run"),
    workflowRunsListing: parseJson(inputs["workflow-runs.json"], "workflow runs"),
    jobsListing: parseJson(inputs["workflow-jobs.json"], "workflow jobs"),
    artifactsListing: parseJson(inputs["workflow-artifacts.json"], "workflow artifacts"),
    contractReleaseRecord: parseJson(inputs["contract-release.json"], "contract release"),
    contractCommitRecord: parseJson(inputs["contract-commit.json"], "contract commit"),
    workflowSourceCommitRecord: parseJson(
      inputs["workflow-source-commit.json"],
      "workflow source commit",
    ),
  };
  const hosted = verifyNavigationCausalHostedProvenance(records);
  assertNavigationCausalAnonymousContractPreflightReceipt(
    parseCanonicalNavigationCausalJson(
      inputs["anonymous-contract-preflight.json"],
      "anonymous contract preflight",
    ),
    {
      contractReleaseRecord: records.contractReleaseRecord,
      contractCommitRecord: records.contractCommitRecord,
      v4ReleaseRecord: parseJson(inputs["v4-evidence-release.json"], "V4 evidence release"),
    },
  );
  const archives = {
    "stasis-v0.3.3-navigation-causal-host-a-attempt-1":
      inputs["actions-navigation-causal-host-a.zip"],
    "stasis-v0.3.3-navigation-causal-host-b-attempt-1":
      inputs["actions-navigation-causal-host-b.zip"],
  };
  const binding = bindNavigationCausalActionArchives({ hostedInput: records, archives });
  verifyNavigationCausalV4SelectionEvidence(
    parseJson(inputs["v4-evidence-release.json"], "V4 evidence release"),
    v4TagRefRecord,
    inputs["v4-localization-evidence.json"],
  );
  const hostFiles = extractHostFiles(archives);
  const assets = {
    "actions-navigation-causal-host-a.zip": Buffer.from(inputs["actions-navigation-causal-host-a.zip"]),
    "actions-navigation-causal-host-b.zip": Buffer.from(inputs["actions-navigation-causal-host-b.zip"]),
    ...hostFiles,
    "navigation-causal-artifact-binding.json": canonicalNavigationCausalJsonBytes(binding),
    "navigation-causal-hosted-provenance.json": canonicalNavigationCausalJsonBytes(hosted),
    "navigation-causal-replication.json": canonicalNavigationCausalJsonBytes(binding.replication),
  };
  for (const name of navigationCausalPublicationInputNames.slice(2)) {
    assets[name] = Buffer.from(inputs[name]);
  }
  const privacyScan = createNavigationCausalPrivacyScan(assets, binding);
  assets["privacy-scan.json"] = canonicalNavigationCausalJsonBytes(privacyScan);
  assets["SHA256SUMS.txt"] = renderChecksums(assets);
  assertExactBytesObject(assets, navigationCausalPublicationAssetNames, "publication assets");
  return Object.freeze({
    schema: navigationCausalPublicationSchema,
    status: "built",
    outcome: binding.replication.status,
    evidencePublicationAuthorized: binding.replication.retainedEvidencePublicationAuthorized,
    validMeasurement: binding.replication.validMeasurement,
    assets,
  });
}

export function verifyNavigationCausalPublication({ assets, v4TagRefRecord }) {
  assertExactBytesObject(assets, navigationCausalPublicationAssetNames, "publication assets");
  const inputs = Object.fromEntries(navigationCausalPublicationInputNames.map((name) => [
    name,
    assets[name],
  ]));
  const rebuilt = buildNavigationCausalPublication({ inputs, v4TagRefRecord });
  for (const name of navigationCausalPublicationAssetNames) {
    if (!rebuilt.assets[name].equals(assets[name])) {
      throw new TypeError(`Navigation causal publication asset does not replay: ${name}`);
    }
  }
  return Object.freeze({
    schema: navigationCausalPublicationSchema,
    status: "verified",
    outcome: rebuilt.outcome,
    assetCount: navigationCausalPublicationAssetNames.length,
    evidencePublicationAuthorized: rebuilt.evidencePublicationAuthorized,
    validMeasurement: rebuilt.validMeasurement,
    generalizedSpeedClaimAuthorized: false,
    implementationWorkAuthorized: false,
    decisionState: "STAY_0_4_UNASSIGNED",
  });
}

export async function buildNavigationCausalPublicationDirectory(
  inputDirectory,
  outputDirectory,
  { v4TagRefRecord },
) {
  requireAbsoluteDirectory(inputDirectory, "input");
  requireAbsoluteDirectory(outputDirectory, "output");
  if (path.resolve(inputDirectory) === path.resolve(outputDirectory)) {
    throw new TypeError("Navigation causal input and output directories must differ");
  }
  const inputs = Object.fromEntries(await Promise.all(
    navigationCausalPublicationInputNames.map(async (name) => [
      name,
      await readFile(path.join(inputDirectory, name)),
    ]),
  ));
  const built = buildNavigationCausalPublication({ inputs, v4TagRefRecord });
  await mkdir(outputDirectory, { recursive: false });
  for (const name of navigationCausalPublicationAssetNames) {
    await writeFile(path.join(outputDirectory, name), built.assets[name], { flag: "wx" });
  }
  return verifyNavigationCausalPublicationDirectory(outputDirectory, { v4TagRefRecord });
}

export async function verifyNavigationCausalPublicationDirectory(
  directory,
  { v4TagRefRecord },
) {
  requireAbsoluteDirectory(directory, "publication");
  const names = (await readdir(directory)).sort();
  if (JSON.stringify(names) !== JSON.stringify([...navigationCausalPublicationAssetNames].sort())) {
    throw new TypeError("Navigation causal publication directory inventory is not exact");
  }
  const assets = Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    await readFile(path.join(directory, name)),
  ])));
  return verifyNavigationCausalPublication({ assets, v4TagRefRecord });
}

function extractHostFiles(archives) {
  const result = {};
  for (const lane of ["host-a", "host-b"]) {
    const artifactName = `stasis-v0.3.3-navigation-causal-${lane}-attempt-1`;
    const zip = new AdmZip(archives[artifactName]);
    const names = navigationCausalHostArtifactNames[lane];
    const raw = zip.readFile(names.raw);
    const outcome = zip.readFile(names.outcome);
    if (!Buffer.isBuffer(raw) || !Buffer.isBuffer(outcome)) {
      throw new TypeError(`Navigation causal ${lane} publication payload is missing`);
    }
    result[names.raw] = Buffer.from(raw);
    result[names.outcome] = Buffer.from(outcome);
  }
  return result;
}

function createNavigationCausalPrivacyScan(assets, binding) {
  const scanned = [];
  const controlledDomIdentitiesByHost = [];
  for (const [name, bytes] of Object.entries(assets)) {
    if (name.endsWith(".zip")) continue;
    const value = parseJson(bytes, `privacy payload ${name}`);
    const lane = name === navigationCausalHostArtifactNames["host-a"].raw
      ? "host-a"
      : name === navigationCausalHostArtifactNames["host-b"].raw
        ? "host-b"
        : null;
    const projected = lane === null
      ? rejectUnvalidatedDocumentHtml(value, name)
      : projectValidatedHostRawDocumentHtml(value, lane, controlledDomIdentitiesByHost);
    assertPostSupportArtifactPrivacy(projected);
    scanned.push({ name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const expectedHostFileIdentities = binding.hostFiles;
  for (const entry of controlledDomIdentitiesByHost) {
    const expected = entry.hostLane === "host-a"
      ? expectedHostFileIdentities.hostA.raw
      : expectedHostFileIdentities.hostB.raw;
    if (expected.name !== entry.sourceAsset ||
      expected.sha256 !== scanned.find(({ name }) => name === entry.sourceAsset)?.sha256) {
      throw new TypeError(`Navigation causal ${entry.hostLane} DOM projection was not derived from its validated raw file`);
    }
    const replicatedHost = binding.replication.hosts.find(
      ({ hostLane }) => hostLane === entry.hostLane,
    );
    if (replicatedHost?.documentHtmlSha256 !== null &&
      (entry.identities.length !== 1 ||
        entry.identities[0].sha256 !== replicatedHost.documentHtmlSha256)) {
      throw new TypeError(`Navigation causal ${entry.hostLane} controlled DOM identity changed`);
    }
  }
  const omissionCount = controlledDomIdentitiesByHost
    .reduce((total, entry) => total + entry.omissionCount, 0);
  const identities = [...new Map(controlledDomIdentitiesByHost
    .flatMap(({ identities: entries }) => entries)
    .map((entry) => [entry.sha256, entry])).values()]
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
  return {
    schema: navigationCausalPrivacyScanSchema,
    status: "passed",
    scope: {
      scannedJsonAssetCount: scanned.length,
      archiveCount: 2,
      controlledDocumentHtmlOmissionCount: omissionCount,
      uniqueControlledDocumentHtmlCount: identities.length,
      controlledDocumentHtmlIdentities: identities,
      controlledDocumentHtmlByHost: controlledDomIdentitiesByHost,
    },
    scannedAssets: scanned.sort((a, b) => a.name.localeCompare(b.name)),
    verification: {
      hostPayloadsValidatedBeforeProjection: true,
      everyOmittedDocumentHtmlPrivacyScanned: true,
      documentHtmlPrivacyProjection:
        "replace_exact_public_fixture_path_literal_only_then_scan",
      onlyValidatedDocumentHtmlOmittedFromPrivacyProjection: true,
      credentialsRetained: false,
      rawHeadersRetained: false,
      generalizedSpeedClaimAuthorized: false,
      implementationWorkAuthorized: false,
      decisionState: "STAY_0_4_UNASSIGNED",
    },
  };
}

function projectValidatedHostRawDocumentHtml(value, lane, retained) {
  const frozenPublicFixturePath = "/leaf/navigation";
  const privacyPathMarker = "stasis-navigation-causal-public-fixture-path";
  const projected = structuredClone(value);
  const observations = [
    ...projected.warmups,
    ...projected.pairs.flatMap(({ observations: entries }) => entries),
  ];
  const identities = new Map();
  let omissionCount = 0;
  for (const observation of observations) {
    if (observation.result === null || typeof observation.result !== "object" ||
      !Object.hasOwn(observation.result, "documentHtml")) continue;
    const documentHtml = observation.result.documentHtml;
    if (typeof documentHtml !== "string" || documentHtml.length === 0) {
      throw new TypeError(`Navigation causal ${lane} controlled DOM is invalid`);
    }
    const identity = {
      bytes: Buffer.byteLength(documentHtml, "utf8"),
      sha256: sha256(Buffer.from(documentHtml, "utf8")),
    };
    assertPostSupportArtifactHtmlPrivacy(projectExactPublicFixturePath(
      documentHtml,
      frozenPublicFixturePath,
      privacyPathMarker,
    ));
    identities.set(identity.sha256, identity);
    omissionCount += 1;
    delete observation.result.documentHtml;
  }
  assertNoDocumentHtmlKey(projected, `${lane} projected raw`);
  retained.push({
    hostLane: lane,
    sourceAsset: navigationCausalHostArtifactNames[lane].raw,
    omissionCount,
    identities: [...identities.values()].sort((left, right) =>
      left.sha256.localeCompare(right.sha256)),
  });
  return projected;
}

function projectExactPublicFixturePath(documentHtml, fixturePath, marker) {
  const token = /(^|[\s"'=>(])\/leaf\/navigation(?=$|[\s"'<)>])/gu;
  if (fixturePath !== "/leaf/navigation") {
    throw new TypeError("Navigation causal frozen public fixture path changed");
  }
  return documentHtml.replace(token, (_match, boundary) => `${boundary}${marker}`);
}

function rejectUnvalidatedDocumentHtml(value, name) {
  assertNoDocumentHtmlKey(value, name);
  if (name === "anonymous-contract-preflight.json") {
    if (value?.v4?.selectedJsonPointer !== "/observations/stasis/phases/poolRuns/9") {
      throw new TypeError("Navigation causal anonymous preflight JSON pointer changed");
    }
    const projected = structuredClone(value);
    projected.v4.selectedJsonPointer = "validated-public-v4-selection-pointer";
    return projected;
  }
  return value;
}

function assertNoDocumentHtmlKey(value, label) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== "object") continue;
    for (const [key, item] of Object.entries(current)) {
      if (key === "documentHtml") {
        throw new TypeError(`Navigation causal unvalidated documentHtml appears in ${label}`);
      }
      pending.push(item);
    }
  }
}

function renderChecksums(assets) {
  return Buffer.from(Object.keys(assets).sort().map((name) =>
    `${sha256(assets[name])}  ${name}\n`).join(""), "utf8");
}

function parseJson(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new TypeError(`${label} is empty`);
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new TypeError(`${label} is not JSON`, { cause: error });
  }
}

function assertExactBytesObject(value, names, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...names].sort()) ||
    Object.values(value).some((bytes) => !Buffer.isBuffer(bytes) || bytes.length === 0)) {
    throw new TypeError(`Navigation causal ${label} inventory is invalid`);
  }
}

function requireAbsoluteDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`Navigation causal ${label} directory must be absolute`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export const navigationCausalEvidenceReleaseIdentity = Object.freeze({
  repository: "oxhq/stasis-compat-bench",
  tag: navigationCausalContractIdentity.evidenceTag,
  contractTag: navigationCausalContractIdentity.tag,
  assetCount: navigationCausalPublicationAssetNames.length,
});
