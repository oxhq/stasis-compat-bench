# Stasis v0.3.3 performance crawl phase diagnostic V2

Status: `preregistered; contract release not yet published; diagnostic branch not pushed`

This protocol freezes one separately hosted, one-shot V2 crawl phase diagnostic.
It exists because V1 produced no timing observation: its JavaScript `Proxy`
attempted to replace non-configurable function properties on the frozen SDK
projection and failed before either lane ran. V2 uses H4's frozen plain-object
SDK adapter and deterministic regression. The diagnostic may localize the
phases of one Crawlee observation and one Stasis observation. It is not a
benchmark rerun, a new comparison, a generalized speed claim, a causal
experiment, or authorization to change Stasis.

## Strict chronology

The order is immutable:

1. The unchanged comparison evidence release `382679391` already exists at
   H1 `6c1a0066eb17425628293993fd7312d4cf26e0f5`.
2. The V1 invalid evidence release `382790743`, H3 verifier-erratum release
   `382789634`, and H3 anonymous-verification release `382795113` already
   exist and are immutable.
3. H4 `58742c0f35939558b334eeb792cbf17ae8ab3426` is the exact harness revision
   with the frozen-SDK adapter and regression.
4. This protocol, canonical preflight, exact S2 workflow mirror, and all V2
   publication verifiers are committed together as H5, whose sole parent is
   H4. The immutable contract release and lightweight contract tag resolve to
   H5.
5. Only after the H5 contract release is public and immutable may S2 be pushed
   once to its new branch. Its first push is the only diagnostic invocation.
6. The selected run must be terminal before any outcome-specific publication
   is assembled. No rerun or replacement observation is authorized.
7. A V2 evidence release may be published only from the preregistered
   outcome-specific inventory and must use a lightweight tag that resolves to
   H5.

A mutable tag, draft, prerelease, tag move, second push, rerun, manual run,
replacement observation, or post-hoc outcome rule invalidates the protocol.

## H4 harness identity

The exact harness is in `oxhq/stasis-compat-bench`:

- commit: `58742c0f35939558b334eeb792cbf17ae8ab3426`;
- sole parent: `ff081f0defd22420e6928701ef4aefb52a3f8b11`;
- tree: `f6c9e5b56ee34135c4197fc080cb67f5a4d01fa5`;
- raw diagnostic schema/protocol:
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-v2`;
- localization schema:
  `stasis-v0.3.3-performance-crawl-phase-localization-evidence-v2`;
- localization protocol:
  `stasis-v0.3.3-performance-crawl-phase-localization-v2`; and
- Stasis hook identity: `sdk_frozen_plain_object_adapter_v2`.

The V2 adapter retains the original `crawlWithStasis` and
`createStasisSessionPool` functions, invokes each with the original frozen SDK
receiver exactly once, and instruments only the returned pool. The regression
requires the source SDK's non-writable, non-configurable descriptors and values
to remain unchanged, exact phase continuity on fulfillment, no calls or clock
reads before construction, and rejection of a second runner invocation.

H4 intentionally retains the already-frozen verifier schemas
`stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-v1` and
`stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-cli-v1`.
Those names identify the stable offline verification envelope, not the V1
instrumentation. S2's inline `comparison-input-verification.json` and
`diagnostic-outcome.json` instead use their V2 schemas. The mixed versioning is
intentional and must not be normalized after observation.

## Frozen invalid V1 motivation

V1 source S1 is commit
`6c142d18631b910ab9e7ce842b52ed817b46ecc5`, run `33878174891`, attempt `1`,
job `101040077123`. The retained Actions artifact is `9938737579`, 491 bytes,
SHA-256
`b512db23bd922943606f8c366c144fab99163a0bb2a4a606f53b24c63fb7b676`.
Its only entry is a 612-byte V1 diagnostic outcome with SHA-256
`27c81015c1e3e095f9148e71b4fd32039eda1dfc16b7c5be4aedc17caa82cc03`,
class `DIAGNOSTIC_INVALID_WITH_STATUS`, phase `diagnostic_execution`, and code
`DIAGNOSTIC_EXECUTION_FAILED`. The retained hosted receipt is 15,477 bytes,
SHA-256
`42ccfa01f80d8c791182d92010c803327af386b4fc08dc63515ccc843bfe10db`.
There were zero V1 timing observations.

The immutable V1 evidence release is `382790743`, tag
`stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v1`, target H2
`24242dcbcf652f07ca9ae62e8b48ce35949dda15`, published
`2026-09-04T14:26:45Z`. The H3 verifier erratum is immutable release
`382789634`, tag
`stasis-v0.3.3-performance-crawl-phase-diagnostic-verifier-erratum-1`,
published `2026-09-04T14:25:02Z`. The anonymous public verification is
immutable release `382795113`, tag
`stasis-v0.3.3-performance-crawl-phase-diagnostic-public-verification-v1`,
published `2026-09-04T14:33:20Z`. Both H3 tags are lightweight refs to
`ff081f0defd22420e6928701ef4aefb52a3f8b11`; their GitHub
`target_commitish` field is not used as revision authority.

The anonymous receipt asset is ID `544462676`, name
`stasis-diagnostic-public-receipt-ff081f0.json`, 7,434 bytes, SHA-256
`05299186edea4e770abc26900e55ce7fa485d7a84093a8ea240d3470e10a6343`.
S2 anonymously verifies this public motivation before dependency installation
or either diagnostic observation.

## Frozen comparison inputs

The diagnostic consumes only immutable comparison release `382679391` in
`oxhq/stasis-compat-bench`, tag
`stasis-v0.3.3-performance-replication-evidence-v1`, H1 commit
`6c1a0066eb17425628293993fd7312d4cf26e0f5`, and tree
`0d5322a5c2c104d2065a37fb7deecfa6944100bc`.

The anonymously downloaded inputs are exactly:

| Asset | Release asset ID | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `artifact-binding.json` | `544250114` | `5086` | `78d91f9c12f85d538dff1944e772614bf9b0adc9841d647c93ab8f608f1ba4ad` |
| `fresh-crawl-raw.json` | `544250086` | `221543` | `52a76a4ebb726c6ab78b70356655e8abd7a5e84d9ce175a8e0d876f543c1a16b` |

They identify comparison run `33862916068`, attempt `1`, and crawl job
`100991246321`. The authority raw bytes are read before and after the two
diagnostic observations and must remain identical. The comparison corpus,
oracle, and published statistics remain unchanged.

## S2 workflow source

The sole authorized source in `oxhq/stasis` is:

- branch `codex/stasis-v033-crawl-phase-diagnostic-v2`;
- ref `refs/heads/codex/stasis-v033-crawl-phase-diagnostic-v2`;
- commit `6dbe0cafd261e7a171c84929233bb9131b9d4b3e`;
- sole parent S1 `6c142d18631b910ab9e7ce842b52ed817b46ecc5`;
- tree `f7fc355e14eab45e74710521d7e13b16d4b4a922`;
- sole added path
  `.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v2.yml`;
- workflow Git blob `0de4bb7e6d7f623ccf38633991f999e1dc38bc45`;
- workflow bytes `63031`, 1,255 LF lines, SHA-256
  `43d4dee4df84277b99cb680056705b8ed77d2e6cb5de6c37a6f6cba34a8cdc91`;
- workflow name `Stasis v0.3.3 performance crawl phase diagnostic V2`;
- job ID `crawl-phase-diagnostic-v2`; and
- job name `Native Ubuntu 22.04 crawl phase diagnostic V2`.

The targeted nonrecursive tree proof also binds both inherited parent blobs:
the V1 diagnostic workflow at
`.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic.yml`, blob
`61675d581be0f8d40accadef531ff1a7c71deb76`, and the unchanged comparison
workflow at `.github/workflows/stasis-v0.3.3-performance-evidence.yml`, blob
`e31601363f2506df87f05a585f8adb0c790c5481`.

The workflow mirror distributed with H5 must match the source blob byte for
byte. The source commit must change exactly the V2 workflow. All preparation
and tail steps omit `continue-on-error` and preserve a fail-closed chain.

## One-shot environment and candidate

The only invocation is the first creation push of S2. It must have all-zero
`before`, `created: true`, `deleted: false`, `forced: false`, and `after` equal
to S2. There is no manual dispatch, schedule, matrix, cache, cancellation
replacement, second push, or rerun.

The sole job uses the GitHub-hosted `ubuntu-22.04` label and observes `Linux`
`X64`. It requires Node `22.20.0` x64, fresh Playwright Chromium, no package
cache, and explicit EGL provisioning and load validation. The Stasis candidate
remains the immutable successful package run `33506181780`, attempt `1`, at
revision `48c5a718a9ddd63f496e45307e1484974ccf8587`, with the same exact Linux
binary, package, proof, manifest, sizes, and hashes frozen by V1.

Protocol-controlled retries, sleeps, fallbacks, replacement inputs, discarded
failures, warm-ups, statistics, and host pooling are forbidden. `--retry 0`
freezes controlled HTTP retries; pinned Actions or GitHub transport internals
do not authorize another workflow invocation or observation.

## Workload and phase boundaries

The unchanged deterministic fixture crawl uses start URL
`http://stasis-compat.test/`, limit `20`, depth `2`, concurrency `1`, the exact
fixture route set, and the same exact `20/20` oracle. The order is fixed:

1. Crawlee ordinal 1;
2. Stasis ordinal 2.

Crawlee records `browser_launch`, `browser_resident_workload`, and every
`browser_close`. Stasis records `pool_creation`, `acquire_open`,
`settle_extract`, `release_physical_cleanup`, and `pool_close`. The monotonic
outer runner interval encloses every phase. Adjacent Stasis phases must share
their exact boundaries, successful Crawlee work begins at launch settlement
and ends at the first close invocation, and all failures remain serialized in
the raw observation. Durations may be summed only within one observation after
non-overlap validation.

## Outcome and Actions artifact contract

The exact Actions artifact name is
`stasis-v0.3.3-crawl-phase-diagnostic-v2-bundle-attempt-1`.

For `VALID_NON_AUTHORITATIVE`, its exact six entries are:

- `comparison-input-verification.json` using schema
  `stasis-v0.3.3-performance-crawl-phase-comparison-input-verification-v2`;
- `crawl-phase-crawlee-raw.json`;
- `crawl-phase-localization-evidence.json`;
- `crawl-phase-stasis-raw.json`;
- `diagnostic-outcome.json` using schema
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-outcome-v2`; and
- `diagnostic-verification.json` using the intentionally retained H4 V1
  verifier schema.

For `DIAGNOSTIC_INVALID_WITH_STATUS`, the bundle contains only the V2
`diagnostic-outcome.json`. For `INFRASTRUCTURE_INVALID_NO_ARTIFACT`, the
publisher may derive the safe outcome only when the exact tail-step topology
shows outcome creation, sealing, or upload failure and GitHub retained zero
artifacts. All other terminal conclusions and all ambiguous or partial artifact
states are unpublishable.

The only allowed failure pairs are:

- `input_verification` / `INPUT_VERIFICATION_FAILED`;
- `diagnostic_execution` / `DIAGNOSTIC_EXECUTION_FAILED`; and
- `offline_verification` / `OFFLINE_VERIFICATION_FAILED`.

Every outcome keeps authority, timing, statistics, comparison, optimization,
generalized-speed, and implementation flags false and keeps decision state
`STAY_0_4_UNASSIGNED`.

## Publication and public replay

The outcome-specific release inventories are exactly those in the canonical
V2 preflight. `privacy-scan.json` covers every payload asset and
`SHA256SUMS.txt` covers every other release asset while omitting itself. No
extra asset is allowed.

The hosted verifier binds the exact contract release and H5 commit, H1
comparison release/commit/tag and selected bytes, S2 commit and three targeted
workflow blobs, the fully paginated one-shot run listing, sole job and exact
steps, and zero or one retained Actions artifact. The artifact-binding verifier
binds that hosted receipt to the exact ZIP entries and accepts the H4 V1
semantic receipt only for a valid V2 observation.

The publication verifier rebuilds the receipt chain and outcome-specific
inventory without selecting rules after seeing the result. The anonymous
public verifier refetches the V2 contract, source objects, evidence assets, and
all lightweight tags without credentials or retries. It also independently
refetches the immutable V1 evidence, H3 erratum, H3 public-verification
release, their authoritative tag refs, and the exact 7,434-byte V1 anonymous
receipt.

## Claim boundary

A valid result may describe which phase dominated each single observation on
that host. It may not report a new Crawlee/Stasis ratio, modify the published
comparison, establish typical performance, attribute causality to WebRender or
any other subsystem, authorize an optimization, or assign Stasis 0.4 scope.
A causal product change requires a separately preregistered control/treatment
experiment after a valid localization result.

The decision remains `STAY_0_4_UNASSIGNED`.
