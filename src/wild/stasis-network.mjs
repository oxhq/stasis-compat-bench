const readOnlyMethod = "GET";
const nativeRouteLimit = 256;

const commonMethods = Object.freeze([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);

const nonReadOnlyMethods = Object.freeze(commonMethods.filter((method) => method !== "GET"));

const privateLiteralHostGlobs = Object.freeze([
  "0.*.*.*",
  "10.*.*.*",
  ...Array.from({ length: 64 }, (_, offset) => `100.${64 + offset}.*.*`),
  "127.*.*.*",
  "169.254.*.*",
  ...Array.from({ length: 16 }, (_, offset) => `172.${16 + offset}.*.*`),
  "192.168.*.*",
  // The native URL matcher cannot express CIDR ranges or a wildcard inside an
  // IPv6 literal. Preflight and post-settlement audit retain that documented
  // boundary; this native table covers canonical private IPv4 plus localhost.
  "localhost*",
]);

const defaultPortIpv6LiteralGlobs = Object.freeze(["[::]", "[::1]"]);

/**
 * Best-effort native backstop for literal local targets and common non-GET
 * requests. The native matcher has exact methods rather than a method wildcard;
 * complete post-settlement audit therefore rejects any other observed non-GET
 * method after the fact. DNS safety remains a preflight property, and the
 * protocol does not promote this policy into a sandbox or DNS-rebinding claim.
 */
export function stasisLiveNetworkPolicy() {
  const routes = [];
  for (const method of nonReadOnlyMethods) {
    for (const scheme of ["http://", "https://"]) {
      routes.push(abortGlob(method, `${scheme}*/*`));
    }
  }
  // Enumerated non-GET requests already match one of the global routes above.
  // Repeating every literal-host route for every method would exceed the frozen
  // runtime's MAX_FIXTURE_ROUTES = 256 limit before a session can open.
  for (const scheme of ["http://", "https://"]) {
    for (const hostGlob of privateLiteralHostGlobs) {
      routes.push(abortGlob(readOnlyMethod, `${scheme}${hostGlob}/*`));
    }
    // Complete bracketed IPv6 literals parse in the frozen matcher grammar.
    // These cover the default-port unspecified and loopback forms only; CIDR
    // ranges and arbitrary non-default IPv6 ports remain outside this backstop.
    for (const hostGlob of defaultPortIpv6LiteralGlobs) {
      routes.push(abortGlob(readOnlyMethod, `${scheme}${hostGlob}/*`));
    }
  }
  if (routes.length > nativeRouteLimit) {
    throw new RangeError(`Stasis live safety policy exceeds ${nativeRouteLimit} routes`);
  }
  return Object.freeze({ mode: "live", routes: Object.freeze(routes) });
}

function abortGlob(method, glob) {
  return Object.freeze({
    match: Object.freeze({ method, url: Object.freeze({ glob }) }),
    abort: Object.freeze({ reason: "blocked_by_fixture" }),
  });
}
