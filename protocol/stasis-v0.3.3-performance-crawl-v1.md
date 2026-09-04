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
The retained GitHub provenance binds repository, workflow, job, run ID/attempt,
workflow-source SHA/ref, and the executing harness HEAD/tree. The harness gate
requires no tracked or untracked non-ignored changes. Ignored dependency,
candidate-input, and generated-artifact directories stay outside the source
checkout identity and are governed by their own byte/fresh-output checks.

Before retained benchmark artifact-root creation, warm-up, or timing, the
Ubuntu job provisions the Stasis runtime's dynamically loaded EGL prerequisite
with `libegl1`. The
preflight first requires installed `libegl1`, `libegl-mesa0`, and `libglvnd0`
packages, then successfully loads `libEGL.so.1`, `libEGL_mesa.so.0`, and
`libGLdispatch.so.0` through the system dynamic loader. It retains each exact
package version and each loader-resolved real regular file's basename, byte
length, and SHA-256 under the Stasis identity. Package ownership must bind each
file to its declared package. Absolute library paths and loader diagnostics are
not retained. Provisioning and inspection finish before both lanes' warm-ups,
so Crawlee and Stasis observe the same host state and none of this work enters a
measured boundary.

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

The Stasis warm-up copies the complete inherited child-process environment and
forces `STASIS_LIFECYCLE_TRACE_V1=1`. Every timed Stasis sample and both Stasis
controls receive a fresh copy with that key explicitly absent, even if it was
present in the harness environment. The harness never mutates `process.env`.
Consequently fixed-vocabulary native lifecycle tracing can diagnose a failed
untimed warm-up without adding stderr work to either the measured Stasis lane or
the controls.

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
runner promise settles. The start, end, and duration are retained as canonical
decimal nanoseconds; every duration is strictly positive, replays exactly as
`end - start`, and every later start is greater than or equal to the preceding
end. The clock is outside the lane so a runner cannot end its own measurement
before cleanup, and the retained boundaries prove the global order from the one
clock.
A start/end clock exception, invalid clock value, stationary reading, or
backwards reading is retained once as a typed terminal `clock_error` with the
available partial boundary and no invented duration. It invalidates authority
and stops the remaining schedule without retry.

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

## Pre-measurement EGL prerequisite correction

Hosted runs `33842085298` and `33845796769` both stopped at the untimed Stasis
warm-up and therefore established no performance authority. The repeat retained
exit code `101`, exactly 262 omitted stderr bytes, and stderr SHA-256
`a3208b7cd3938de389f5b3200851f289168770901a97e920353bac6fbb00e4e5` for the
exact v0.3.3 Linux executable SHA-256
`c6a37995cde25275454d7f1ee61c2803964b04bf0d35f8fde7c78e9575c74c37`.
That byte length and digest reproduce the Rust panic at surfman `0.13.0`
`base/egl/device.rs:42:5`: `Unable to load the libEGL shared object`. The exact
released binary contains that source location and message, while the hosted
Playwright `install --with-deps chromium` transaction did not install
`libegl1`. No lifecycle phase was expected because this panic precedes Stasis
engine construction and the first lifecycle checkpoint; it is not evidence
that the warm-up-only trace environment was lost. Xvfb cannot supply the
missing dynamically loaded library and is not part of this correction.

The bounded correction is explicit `libegl1` provisioning plus the fail-closed
package, loader, ownership, and byte-identity preflight above. Both failed runs
remain invalid and are not revalidated. Because no valid raw-v1 crawl authority
was published before this pre-measurement correction, the preregistered v1
schema spelling remains unchanged; older raw values without the exact EGL
identity do not validate under the corrected schema.

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
- the Stasis EGL prerequisite's successful loader probe, exact package
  versions, and path-free real-library byte identities;
- untimed warm-up runs and their post-timing oracle results;
- ordered pair records with lane order, complete raw lane results, canonical
  nanosecond start/end/duration boundaries, and exact-equivalence counts;
- untimed worker/iframe observations kept outside the denominator;
- a derived valid/invalid authority verdict, completed-pair count,
  exact-equivalent-pair count, and reason codes.

Thrown runner errors and cleanup failures are serialized, retained, and
invalidating. The schema accepts a fail-stopped prefix only when the verdict is
invalid and disallows presenting that prefix as a completed authority.
For a `StasisProcessError` with code `process_exit`, the retained projection
contains a nullable nonnegative safe-integer exit code, a nullable allow-listed
signal, the omitted stderr tail's UTF-8 byte count and SHA-256, fixed allow-listed
crash markers, and unique fixed-vocabulary phases found only in exact
`stasis_lifecycle_v1 phase=` tokens. Raw stderr, messages, paths, URLs, and
environment values remain excluded. A harness-owned `failurePhase` can identify
only the coarse `crawl` or `pool_close` catch boundary; it never invents a page
ordinal or a more precise SDK operation.

This is a pre-measurement correction to raw schema v1. Hosted run `33842085298`
failed during the untimed Stasis warm-up and never established a performance
authority; its older diagnostic projection intentionally does not validate
under this corrected exact schema and is not reclassified. Because no valid v1
authority was published before this correction, the v1 schema spelling remains
the preregistered spelling for the first authoritative execution.
