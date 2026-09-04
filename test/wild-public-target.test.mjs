import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectPublicHttpUrl,
  isGlobalIpAddress,
  PublicTargetError,
  projectPublicTargetError,
} from "../src/wild/public-target.mjs";

test("literal and resolved non-global addresses are rejected", async () => {
  assert.equal(isGlobalIpAddress("8.8.8.8"), true);
  assert.equal(isGlobalIpAddress("10.0.0.1"), false);
  assert.equal(isGlobalIpAddress("127.0.0.1"), false);
  assert.equal(isGlobalIpAddress("2001:4860:4860::8888"), true);
  assert.equal(isGlobalIpAddress("fc00::1"), false);
  assert.equal(isGlobalIpAddress("::1"), false);

  await assert.rejects(inspectPublicHttpUrl("http://127.0.0.1/"), hasCode("non_global_address"));
  await assert.rejects(inspectPublicHttpUrl("https://localhost/"), hasCode("reserved_hostname"));
  await assert.rejects(inspectPublicHttpUrl("https://printer.local/"), hasCode("reserved_hostname_suffix"));
  await assert.rejects(inspectPublicHttpUrl("https://intranet/"), hasCode("single_label_hostname"));
});

test("DNS admission requires every answer to be global", async () => {
  const mixedLookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "192.168.1.2", family: 4 },
  ];
  await assert.rejects(
    inspectPublicHttpUrl("https://example.com/", { lookup: mixedLookup, requireHttps: true }),
    hasCode("non_global_address"),
  );

  const publicLookup = async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
  ];
  const result = await inspectPublicHttpUrl("https://example.com/path#fragment", {
    lookup: publicLookup,
    requireHttps: true,
  });
  assert.equal(result.url, "https://example.com/path");
  assert.deepEqual(result.families, [4, 6]);
});

test("HTTPS-only admission and credential rejection are explicit", async () => {
  await assert.rejects(
    inspectPublicHttpUrl("http://example.com/", { requireHttps: true }),
    hasCode("https_required"),
  );
  await assert.rejects(
    inspectPublicHttpUrl("https://user:pass@example.com/"),
    hasCode("credential_bearing_url"),
  );
});

test("projected DNS failures retain only the typed public-target code", () => {
  const error = new PublicTargetError("dns_resolution_failed", { dnsCode: "PRIVATE_SENTINEL" });
  assert.deepEqual(projectPublicTargetError(error), { code: "dns_resolution_failed" });
});

function hasCode(code) {
  return (error) => error instanceof PublicTargetError && error.code === code;
}
