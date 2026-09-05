import { readFile } from "node:fs/promises";

import {
  navigationCausalInvalidV2Evidence,
  navigationCausalV2ContractAssetIdentities,
} from "../../src/performance/navigation-causal-v2-failure.mjs";

const protocolRoot = new URL("../../protocol/", import.meta.url);

export async function navigationCausalInvalidV2Fixture() {
  const authorityBundleBytes = await readFile(new URL(
    navigationCausalInvalidV2Evidence.capture.authorityAsset,
    protocolRoot,
  ));
  const actionsLogsZipBytes = await readFile(new URL(
    navigationCausalInvalidV2Evidence.capture.actionsLogsAsset,
    protocolRoot,
  ));
  const bundle = JSON.parse(authorityBundleBytes.toString("utf8"));
  const v2ContractAssets = Object.fromEntries(await Promise.all(
    Object.keys(navigationCausalV2ContractAssetIdentities).map(async (name) => [
      name,
      await readFile(new URL(name, protocolRoot)),
    ]),
  ));
  const liveRecords = structuredClone(bundle.records);
  delete liveRecords.preflightReceipt;
  return {
    authorityBundleBytes,
    actionsLogsZipBytes,
    liveRecords,
    v2ContractAssets,
    v2PreflightReceiptBytes: Buffer.from(
      `${JSON.stringify(bundle.records.preflightReceipt, null, 2)}\n`,
      "utf8",
    ),
    evidenceReleaseStatus: 404,
    evidenceTagRefStatus: 404,
  };
}
