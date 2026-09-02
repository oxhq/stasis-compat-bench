# Stasis v0.3.3 deterministic crawl performance protocol

Status: `preregistered; execution pending`

Protocol: `stasis-v0.3.3-performance-crawl-v1`

Track: `deterministic-crawl-20-page`

Raw schema: `stasis-v0.3.3-performance-crawl-raw-v1`

## Claim boundary

This is a separate performance authority for the complete frozen deterministic
twenty-page crawl. It does not change, pool with, or reinterpret the published
compatibility evidence. Correctness is a prerequisite for retaining any timing;
the protocol does not preregister a winner.

The comparison is same-host and process-local on one GitHub-hosted Ubuntu
runner:

- Crawlee `3.18.1` `PlaywrightCrawler`, Playwright `1.62.1`, and its pinned
  Chromium;
- the public `@oxhq/stasis@0.3.3` SDK and public Linux x86-64 v0.3.3 runtime
  from Stasis revision `48c5a718a9ddd63f496e45307e1484974ccf8587`;
- Node `v22.20.0`, concurrency one, maximum depth two, maximum pages twenty,
  and zero request retries in both lanes.

The v0.3.3 SDK and runtime are verified and supplied from outside the benchmark
module. The repository-root `@oxhq/stasis@0.2.1` dependency is sealed historical
input and is forbidden for this authority. Package acquisition, extraction,
hashing, runtime inspection, and other identity checks occur before measurement.

## Host binding and privacy

The raw result retains exactly these host facts: `platform: linux`, `arch: x64`,
`runnerOs: Linux`, the GitHub `ImageOS` value beginning
with `ubuntu`, `ImageVersion`, CPU model, and logical CPU count. It excludes
hostname, username, filesystem paths, IP addresses, environment variables, and
other machine identifiers.

A canonical SHA-256 digest is computed over the retained host facts in the
schema's fixed field order. Both the Crawlee and Stasis identities must attest
that same digest. A missing, divergent, or noncanonical host binding prevents
execution.

## Frozen workload and correctness oracle

Every primary observation executes the complete unchanged corpus from
`src/crawl/corpus.mjs`, starting at `http://stasis-compat.test/`. Its exact
breadth-first scheduled URL order, requested URL, final URL, depth, status, and
ordered extracted links are checked for all twenty pages. Crawlee must also
retain HTTP status 200, no failed requests, and no fixture misses. Stasis must
retain `quiescent` for each finite page and
`quiescent_with_persistent_work` for the designed interval page.

Post-timing structural replay checks each lane against that frozen oracle and
then checks the two observations in a pair for exact equality of requested URL,
final URL, depth, crawl status, and ordered links. Matching the other runner
while jointly diverging from the frozen oracle is not a pass.

## Execution order

All observations use fresh state. There is no retry, rerun, replacement sample,
backoff, harness sleep, sample removal, or outlier removal.

1. Run one untimed Crawlee warm-up with a fresh queue, crawler, and browser.
2. Run one untimed Stasis warm-up with a fresh pool and native processes.
3. Run ten timed pairs. Odd pairs are `AB` (Crawlee then Stasis); even pairs are
   `BA` (Stasis then Crawlee).
4. After a valid ten-pair schedule, run the worker and iframe controls once in
   each lane, untimed and outside the primary denominator.

Warm-ups must independently pass the twenty-page oracle and be exact-equivalent.
They are never timed or included in statistics. The first failed runner,
cleanup, page oracle, or pair-equivalence observation is retained and marks the
whole authority invalid. Execution then stops without a retry because further
load cannot restore authority. When fail-stop occurs before controls, the raw
control status is `not_run`; the already-published compatibility controls remain
unchanged.

The worker and iframe observations are diagnostic compatibility controls only.
Their raw typed outcomes are preserved, but they cannot contribute samples,
pages, time, success counts, or weights to the twenty-page primary performance
denominator.

## Timing boundary

The authoritative clock is `process.hrtime.bigint()`. Each timed observation
reads it immediately before invoking the lane runner and immediately after the
runner promise settles. Duration is retained as canonical decimal nanoseconds.
The clock is outside the lane so a runner cannot end its own measurement before
cleanup.

The measured Crawlee boundary includes:

- new in-memory configuration and request queue;
- new crawler and Chromium startup;
- navigation, fixture routing, event-driven completion waits, all twenty page
  handlers, and all extraction oracles;
- Crawlee browser-pool, crawler, storage-client, and event-manager teardown.

The measured Stasis boundary includes:

- new session pool and fresh native process startup under the reference crawler;
- navigation, deterministic settlement, all twenty pages, and extraction
  oracles;
- pool close and native process cleanup.

The boundary excludes package/setup/identity work, warm-ups, post-run structural
and pair validation, raw object materialization, serialization, report I/O, and
worker/iframe controls. Timeouts are failure bounds, not sleeps. The harness
adds no delay; lifecycle work performed internally by the pinned runners remains
inside their measured promises.

## Authority rule

The authority is valid only if all of the following are true:

- both single warm-ups pass and are exact-equivalent;
- all ten preregistered pairs complete in their fixed order;
- every Crawlee observation is exactly 20/20 against the frozen oracle;
- every Stasis observation is exactly 20/20 against the frozen oracle;
- every pair is exactly 20/20 equivalent;
- every measured runner promise includes successful cleanup.

Any other outcome is whole-authority invalid. An invalid authority permits no
median, ratio, ranking, or performance claim, even if a subset of observations
would otherwise look favorable.

## Raw result

`src/performance/crawl.mjs` has no top-level execution or report I/O. Its
dependency-injected orchestration returns one immutable raw value containing:

- schema, protocol, track, exact host and runner identity, and frozen rules;
- untimed warm-up runs and their post-timing oracle results;
- ordered pair records with lane order, complete raw lane results, canonical
  nanosecond durations, and exact-equivalence counts;
- untimed worker/iframe observations kept outside the denominator;
- a derived valid/invalid authority verdict, completed-pair count,
  exact-equivalent-pair count, and reason codes.

Thrown runner errors and cleanup failures are serialized, retained, and
invalidating. The schema accepts a fail-stopped prefix only when the verdict is
invalid and disallows presenting that prefix as a completed authority.
