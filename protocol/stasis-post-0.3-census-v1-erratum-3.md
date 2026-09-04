# stasis-post-0.3-census-v1 — erratum 3

Status: `preregistered current-URL observation correction; execution pending`

This erratum corrects one benchmark-integration claim for the exact published
Stasis `v0.3.3` package. It does not change Stasis, either shipped controlled
session profile, the frozen corpus, site order, browser baseline, application
inputs, network policy, settlement policy, extraction operations, concurrency,
or the no-retry/no-fallback rule.

## Correction

The original protocol records `currentUrlObservable: false` because the earlier
frozen 0.3 candidate did not expose a post-settlement top-level URL. That
statement was incorrectly carried into the post-support `v0.3.3` wild runner.
The exact `v0.3.3` SDK already exposes the owner-attested current URL as
`settle().url` when the caller explicitly selects `controlled-web-session-v2`.
The profile, native wire projection, TypeScript conditional result type,
decoder, packaged distribution, and product tests all bind that field. No
product or profile change is justified by this correction.

The immutable public `v0.3.3` evidence index with SHA-256
`76e68ed83f3386186adbbd93e73ee2ec4a1fdc9c3977954501143342799c6e89`
remains valid evidence for the observations it retained. Its 15 successful
Stasis observations were classified as `SDK_GAP` because the benchmark runner
discarded `settle().url`; they do not prove that the published product package
lacked current-URL observation. Those 15 classifications receive no product
support, blocker-prevalence, or performance weight and are not pooled with the
successor evidence.

## Corrected projection and comparison

For the successor run, after `settle()` returns, the Stasis observation must:

- retain `currentUrlObservable: true`;
- canonicalize `settle().url` with the unchanged WHATWG HTTP(S) URL rules;
- retain only `currentUrlIdentity`, using the existing domain-separated
  `stasis-wild-url-identity-v1` SHA-256 commitment;
- retain `openCommittedUrlIdentity` separately as the `session.open` URL
  commitment; and
- never retain either derived URL in raw form.

A successful exact-equivalence classification now requires both the unchanged
extraction comparison and equality between Stasis `currentUrlIdentity` and the
baseline `finalUrlIdentity`. An extraction match with a current-URL mismatch is
`PASS_WITH_SEMANTIC_DIFFERENCE`, not `PASS_EQUIVALENT`. A failure before
settlement retains `currentUrlObservable: false` without a current identity. A
settlement terminal or successful observation must retain the owner-attested
identity. The verifier recomputes every classification from the retained raw
records.

## Evidence version boundary

The published historical family remains accepted only as Stasis raw and case
classification v3, summary/index v4, and post-support identity/result/authority
v1. The corrected family uses Stasis raw and case classification v4,
summary/index v5, and post-support identity/result/authority v2. The v5 rules
explicitly require owner-attested settlement-URL identity for every successful
observation and define successful correctness as extraction plus current-URL
identity. Old false/no-identity records cannot be rewrapped as v5 authority,
and new fields are not made optional under the historical authority schema.

The historical v4 archive remains independently replayable. Its tag, assets,
hashes, report, and anonymous verification are not edited or replaced.

## Frozen execution contract

The successor proof reuses, unchanged:

- the 100-entry Tranco corpus and complete preflight ledger;
- the deterministic fixtures and expected projections;
- the eight Cypress Real World App intents, checkout, seed, and server boundary;
- the exact package-qualified Stasis `v0.3.3` candidate at revision
  `48c5a718a9ddd63f496e45307e1484974ccf8587`;
- explicit `controlled-web-session-v2`;
- Node `22.20.0`, Crawlee `3.18.1`, and Playwright `1.62.1`;
- baseline-before-Stasis adjacency, selected order, concurrency one, one settle
  call, and zero retries, sleeps, polls, replay, fallback, proxy, or stealth.

Before public-site execution, the correction, deterministic regression,
privacy firewall, dual-version verifier, typed-terminal minimizers, and public
projection must be committed in one clean parentless public source root. The
authoritative wild lane may claim exactly one fresh artifact root from that
immutable harness revision. A passing public-site execution is qualification
evidence only; it is not the correctness proof for the observation fix.
Correctness comes from the deterministic owner-attested URL regression and the
fail-closed v4/v5 replay tests.

## Typed-terminal causality and roadmap use

The two dominant organic terminal families in the immutable v4 census remain
separate from the current-URL correction:

- `unsupported_partitioned_cookie` (`storage`), one organic origin; and
- `automation_match_limit_exceeded` (`extraction_limit`), one organic origin.

Before rerunning the unchanged corpora, each family requires two independent,
hash-bound native minimizers with a nearby passing control, one causal delta,
fresh exact-candidate processes, exact typed terminal/fatality/state-effect and
cleanup evidence, and no dependency injection or retry. These minimizers prove
causality, not organic prevalence and not two independent public origins.

The deterministic, RWA, and wild results keep separate denominators. No pooled
success rate or performance claim is permitted. `STAY_0_4_UNASSIGNED` remains
the roadmap decision unless typed cross-stratum evidence independently assigns
one smallest next authority boundary.
