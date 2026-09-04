# stasis-post-0.3-census-v1 — erratum 1

This erratum repairs only the native URL-matcher representation used by the
wild lane's read-only network backstop. It does not change the frozen corpus,
selection order, candidate, SDK, profile, browser baseline, concurrency,
retry/fallback rules, settlement policy, extraction, or classification rules.

## Invalid first paired attempt

The first complete paired attempt is retained immutably under artifact run ID
`wild-paired-fe64d0d-authoritative`.

- artifact-index SHA-256:
  `7fed976c9a0ac1b510eb9783266209c20abcaae0cccf5a3aee7e9198063c3608`
- summary SHA-256:
  `d0ea5b76f62a90172f628e08a60e9ee4ebde6a3cc37b31881e7da880fe51debc`
- selected: 100
- baseline-excluded: 6
- Stasis attempted: 94
- shared Stasis terminal: 94 `invalid_request`
- valid paired denominator: 0

Every attempted Stasis case failed before session creation because route zero
used the incomplete prefix `http://`. The frozen SDK forwarded it, but the
native matcher requires every exact, prefix, or glob probe to parse as a
complete HTTP(S) URL. Partial numeric prefixes also compiled into canonical
URLs that did not match their intended private IPv4 ranges. The attempt has
zero product/blocker evidence weight and none of its case observations or
baselines may be reused in the repaired run.

## Repair

- common non-GET aborts use the parseable full-URL globs `http://*/*` and
  `https://*/*`;
- private IPv4 GET aborts use canonical dotted-quad host globs with a path
  wildcard;
- localhost GET aborts retain non-default-port coverage;
- complete `[::]` and `[::1]` GET globs retain default-port coverage;
- unrepresentable IPv6 CIDR ranges and non-default IPv6 ports remain outside
  this best-effort native backstop, as already bounded by the protocol's
  no-sandbox/no-DNS-rebinding statement;
- the repaired table has 188 routes, below the frozen limit of 256.

Before a public rerun, the complete table must pass both unit boundary tests
and a network-free exact-candidate smoke: a leading synthetic fixture for
`https://stasis.invalid/`, followed by all 188 safety routes in
`fixtures_only` mode, must compile, settle quiescently, record only GET and
`fixture_fulfill`, make zero live decisions, and close cleanly.

## Admissible rerun

One fresh rerun is admissible because the invalid attempt produced no valid
paired Stasis observation. It must start again at frozen slot 1, execute all
100 slots in order with fresh adjacent baseline and Stasis observations, write
to a new artifact root, and bind the unchanged corpus, preflight ledger,
candidate, SDK, profile, runtime, repaired harness commit, smoke artifact, and
both old and new artifact hashes. Selective retry, baseline reuse, mixed
denominators, or silent replacement of the invalid attempt is forbidden.

The repaired run uses `stasis-wild-summary-v3` and
`stasis-wild-artifact-index-v3`. Its identity directly binds this erratum, the
invalid attempt's two hashes and zero denominator, and the exact network-policy
smoke reference. Raw gate, observation, and case-classification records retain
their v2 schemas because their treatment and projection did not change.
