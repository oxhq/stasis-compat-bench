import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const nonGlobal = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  nonGlobal.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
]) {
  nonGlobal.addSubnet(network, prefix, "ipv6");
}

const reservedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
]);

const reservedSuffixes = [
  ".localhost",
  ".local",
  ".lan",
  ".internal",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
];

export class PublicTargetError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "PublicTargetError";
    this.code = code;
    this.details = details;
  }
}

export async function inspectPublicHttpUrl(
  value,
  { lookup = dnsLookup, requireHttps = false } = {},
) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PublicTargetError("malformed_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicTargetError("non_http_scheme", { protocol: url.protocol });
  }
  if (requireHttps && url.protocol !== "https:") {
    throw new PublicTargetError("https_required");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new PublicTargetError("credential_bearing_url");
  }

  const hostname = stripIpv6Brackets(url.hostname.toLowerCase().replace(/\.$/u, ""));
  rejectReservedHostname(hostname);
  const literalFamily = isIP(hostname);
  let addresses;
  if (literalFamily !== 0) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new PublicTargetError("dns_resolution_failed", {
        dnsCode: typeof error?.code === "string" ? error.code : "unclassified",
      });
    }
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new PublicTargetError("dns_empty_answer");
  }

  const families = new Set();
  for (const answer of addresses) {
    const family = normalizeFamily(answer?.family, answer?.address);
    if (family === 0 || !isGlobalIpAddress(answer.address)) {
      throw new PublicTargetError("non_global_address", {
        family: family === 0 ? "unknown" : family,
      });
    }
    families.add(family);
  }

  url.hash = "";
  return Object.freeze({
    url: url.href,
    hostname,
    addressCount: addresses.length,
    families: [...families].sort(),
  });
}

export function isGlobalIpAddress(value) {
  if (typeof value !== "string") return false;
  const normalized = stripIpv6Brackets(value.split("%")[0].toLowerCase());
  if (normalized.startsWith("::ffff:")) return false;
  const family = isIP(normalized);
  if (family === 0) return false;
  return !nonGlobal.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

export function projectPublicTargetError(error) {
  if (error instanceof PublicTargetError) {
    return {
      code: error.code,
      ...(error.details?.family === undefined ? {} : { family: error.details.family }),
      ...(error.details?.protocol === undefined ? {} : { protocol: error.details.protocol }),
    };
  }
  return { code: "public_target_gate_error" };
}

function rejectReservedHostname(hostname) {
  if (hostname.length === 0) throw new PublicTargetError("empty_hostname");
  if (reservedHostnames.has(hostname)) throw new PublicTargetError("reserved_hostname");
  if (reservedSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new PublicTargetError("reserved_hostname_suffix");
  }
  if (isIP(hostname) === 0 && !hostname.includes(".")) {
    throw new PublicTargetError("single_label_hostname");
  }
}

function normalizeFamily(value, address) {
  if (value === 4 || value === "IPv4") return 4;
  if (value === 6 || value === "IPv6") return 6;
  return isIP(stripIpv6Brackets(String(address ?? "").split("%")[0]));
}

function stripIpv6Brackets(value) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}
