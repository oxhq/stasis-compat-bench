# Stasis v0.3.3 performance crawl phase diagnostic V4

Status: `preregistered; H7 not yet committed; contract release not yet published; S4 branch not pushed`

This protocol freezes one separately hosted, one-shot V4 crawl-phase
diagnostic. Its only purpose is to localize the phases of one Crawlee
observation and one Stasis observation on one GitHub-hosted Ubuntu 22.04
runner. It is not a benchmark rerun, a new Crawlee/Stasis comparison, a
generalized speed claim, a causal experiment, or authority to change Stasis.

V4 exists because the immutable V3 contract release recorded
`target_commitish` as `main`, while its already-published H6 verifier requires
the exact 40-character H6 SHA. The lightweight V3 tag resolves to H6 and the
sole V3 hosted run completed with the expected topology, but that does not
satisfy the frozen release-metadata contract. V4 neither repairs nor
reinterprets V3 and imports none of its artifact payload, raw timing,
diagnostic outcome, or comparison value.

## Immutable authority and chronology

The authority chain is:

- H1 `6c1a0066eb17425628293993fd7312d4cf26e0f5` contains the unchanged
  comparison evidence contract.
- H4 `58742c0f35939558b334eeb792cbf17ae8ab3426` contains the diagnostic
  harness, frozen plain-object SDK adapter, and deterministic regression.
- H5 `54a08f2f63718658a2ed60309eba94c9a00efbc3`, tree
  `f4d02631892cee126970a3fa3485aef37f1aee35`, is H4's direct child and is
  the target of immutable V2 contract release `382863604`.
- H6 `c71a6c1d9ecf4cc27f72b60f7b51050880665fc5`, tree
  `10ef173b0fdcbd619fe7bcd8451cf20ddd759e7f`, is H5's direct child and is
  the target of immutable V3 contract release `382895048`.
- H7 is the not-yet-committed direct child of H6 that contains this protocol,
  its canonical preflight, the exact S4 workflow mirror, the frozen V3
  unpublishable record, and the V4 verification/publication implementation.
  Its commit and tree IDs are deliberately not guessed before the commit
  exists.
- S4 `b4c847b6543e34677630c311b20d9e3ff64d0925` is the exact prepared workflow
  source commit in `oxhq/stasis`. Its sole parent is S3
  `fc1dfca00b0f25d1da35cae23fa206d511aa876e`.

The release sequence is immutable:

1. Commit H7 as the direct child of H6.
2. Require the remote contract tag
   `stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v4` to be absent.
   Create the release with `gh release create`, exactly the four frozen assets,
   `--target <H7_SHA>`, and `--latest=false`. Do not pre-create the tag and do
   not use `--verify-tag`: GitHub must create the lightweight tag from the
   explicit H7 target in the release transaction.
3. Immediately run the standalone anonymous `verify-contract-public` gate.
   It must prove that the public release is immutable, its API
   `target_commitish` is exactly H7, its lightweight tag resolves directly to
   H7, its four assets equal their H7 blobs and bytes, H7 is H6's sole direct
   child, and the S4 branch, S4 commit, V4 evidence tag/release, and every V4
   workflow run are still absent.
4. Only after that gate passes, create the S4 branch with one push. That
   creation push is the only authorized V4 workflow invocation.
5. Wait for that one run to become terminal. Do not rerun it, replace it, or
   repair its result after observation.
6. If and only if the frozen outcome rules accept the run, require the remote
   evidence tag to be absent and publish the exact outcome-specific inventory
   under `stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v4` with
   `gh release create --target <H7_SHA> --latest=false`, again without a
   pre-created tag or `--verify-tag`.
7. Perform an anonymous, credential-free public replay of the complete release
   chain.

A mutable tag, tag move, draft, prerelease, second push, rerun, manual run,
replacement observation, or outcome rule selected after seeing the result
invalidates the protocol.

## H7 contract assets

The V4 contract release contains exactly these four assets and no others:

1. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-unpublishable.json`;
2. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v4-preflight.json`;
3. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v4-workflow.yml`; and
4. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v4.md`.

The first asset is canonical pretty JSON with schema
`stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-unpublishable-v1`, 5,368
bytes, and SHA-256
`8ac79a01296fe13c127b1809602a82e905323a9f59bf2f9c2b9a39d4ec881528`.
The contract release binds every asset to its exact H7 Git blob and released
bytes. Both the lightweight tag ref and the exact 40-character
`target_commitish` must resolve to H7; neither is accepted as a substitute for
the other.

## Frozen V3 observation: unpublishable motivation only

The V3 contract is H6
`c71a6c1d9ecf4cc27f72b60f7b51050880665fc5`, whose sole parent is H5
`54a08f2f63718658a2ed60309eba94c9a00efbc3`. Its lightweight contract tag
resolves directly to H6. Immutable release `382895048` was created at
`2026-09-04T17:07:48Z` and published at `2026-09-04T17:10:56Z`, but its API
record contains `target_commitish: main`; H6 requires its exact SHA.

The sole V3 observation is run `33899303292`, attempt `1`, job
`101109351746`, created at `2026-09-04T17:12:16Z` and completed at
`2026-09-04T17:13:36Z`. It had 23 core steps and terminal post steps
`45`/`46`/`47`. Artifact `9947025197` is named
`stasis-v0.3.3-crawl-phase-diagnostic-v3-bundle-attempt-1`, is 24,531 bytes,
and has SHA-256
`d0c9cd619e95664e8fb0ce9758f45b738248bd1a81b4f5bf522b7c988177380c`.

The immutable H6 verifier rejects the real release/run inputs with exact error
`diagnostic contract release identity is invalid`. A counterfactual changing
only `target_commitish` from `main` to H6 is accepted, including the real
`1..23,45,46,47` topology. This proves the frozen metadata defect without
changing an outcome rule. Later Actions artifact expiry is tolerated because
the V4 motivation verifier consumes neither the ZIP nor its payload.

No V3 raw timing, diagnostic outcome, or comparison value is imported into
the V4 contract or any V4 verifier. V3 is permanently `unpublishable` with
reason `CONTRACT_TARGET_COMMITISH_METADATA_MISMATCH`; it authorizes no evidence
release, rerun, replacement observation, post-hoc repair, timing claim,
comparison, optimization, or product decision. The earlier V2 topology defect
remains transitively frozen through H6 and likewise contributes no timing.

## H4 harness and preserved inner semantics

The exact harness is in `oxhq/stasis-compat-bench`:

- commit `58742c0f35939558b334eeb792cbf17ae8ab3426`;
- sole parent `ff081f0defd22420e6928701ef4aefb52a3f8b11`;
- tree `f6c9e5b56ee34135c4197fc080cb67f5a4d01fa5`;
- raw diagnostic schema and protocol
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-v2`;
- localization schema
  `stasis-v0.3.3-performance-crawl-phase-localization-evidence-v2`;
- localization protocol
  `stasis-v0.3.3-performance-crawl-phase-localization-v2`; and
- Stasis hook identity `sdk_frozen_plain_object_adapter_v2`.

The adapter retains the original `crawlWithStasis` and
`createStasisSessionPool` functions, invokes each with the original frozen SDK
receiver exactly once, and instruments only the returned pool. Its regression
requires the source SDK's non-writable, non-configurable descriptors and
values to remain unchanged, exact phase continuity on fulfillment, no calls or
clock reads before construction, and rejection of a second runner invocation.

V4 changes only the outer hosted, artifact-binding, publication, release, CLI,
and anonymous-public-verification envelopes to V4. S4 keeps the same 23 core
step names and behavior as S3 and S2. Every H4-generated inner diagnostic artifact
remains V2, including:

- raw diagnostic protocol/schema
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-v2`;
- localization evidence/schema/protocol V2;
- `comparison-input-verification.json` schema
  `stasis-v0.3.3-performance-crawl-phase-comparison-input-verification-v2`;
  and
- `diagnostic-outcome.json` schema
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-outcome-v2`.

The semantic verification receipt and verification CLI receipt intentionally
remain
`stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-v1` and
`stasis-v0.3.3-performance-crawl-phase-diagnostic-verification-cli-v1`.
These names identify the already-frozen offline verifier, not V1
instrumentation. None of these inner versions may be normalized to V4.

## Earlier invalid V1 motivation

S4 preserves S3's anonymous verification of the already-published V1 invalid
motivation before dependency installation or either observation. The source
was S1 `6c142d18631b910ab9e7ce842b52ed817b46ecc5`, run `33878174891`, attempt
`1`, job `101040077123`. It produced zero timing observations because its
JavaScript `Proxy` attempted to replace non-configurable properties on the
frozen SDK projection before either lane ran.

The immutable V1 evidence release is `382790743`; the H3 verifier-erratum
release is `382789634`; and the H3 anonymous-verification release is
`382795113`. The frozen anonymous receipt is asset `544462676`, named
`stasis-diagnostic-public-receipt-ff081f0.json`, 7,434 bytes, with SHA-256
`05299186edea4e770abc26900e55ce7fa485d7a84093a8ea240d3470e10a6343`.
This retained V1 proof remains motivation only and contributes no timing.

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
`100991246321`. S4 reads the authoritative raw comparison bytes before and
after its two observations and requires byte identity. It does not modify or
recompute the comparison corpus, oracle, raw samples, or published statistics.

## Exact S4 workflow source

The sole authorized workflow source in `oxhq/stasis` is:

- branch `codex/stasis-v033-crawl-phase-diagnostic-v4`;
- ref `refs/heads/codex/stasis-v033-crawl-phase-diagnostic-v4`;
- commit `b4c847b6543e34677630c311b20d9e3ff64d0925`;
- sole parent S3 `fc1dfca00b0f25d1da35cae23fa206d511aa876e`;
- tree `4e11df78819a34dbba86e7d6c5a42ae6e4c4e7c5`;
- sole changed path, with status `added`,
  `.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v4.yml`;
- workflow Git blob `1f6b5c2433a3684bbc18096fd43e783a67b0a61f`;
- workflow size 63,031 bytes, 1,255 LF lines, zero CR bytes;
- workflow SHA-256
  `b9430486edbbc45cdf432781b515a0b69c78e742417274145a4b7c422d4a5cba`;
- workflow name `Stasis v0.3.3 performance crawl phase diagnostic V4`;
- job ID `crawl-phase-diagnostic-v4`; and
- job name `Native Ubuntu 22.04 crawl phase diagnostic V4`.

The workflow mirror distributed in the H7 contract must match that blob byte
for byte. The targeted nonrecursive tree proof also requires the inherited V3
diagnostic workflow at
`.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v3.yml` to
remain blob `a9914cdd9c4146a898df3753949e3a864141fc0a`, the V2 diagnostic workflow at
`.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v2.yml` to
remain blob `0de4bb7e6d7f623ccf38633991f999e1dc38bc45`, the V1 diagnostic workflow to
remain blob `61675d581be0f8d40accadef531ff1a7c71deb76`, and the comparison workflow to
remain blob `e31601363f2506df87f05a585f8adb0c790c5481`.

All preparation and tail steps remain fail closed and omit
`continue-on-error`. The only intended workflow changes from S3 are the outer
V4 workflow, branch, job, contract, and artifact identities. The 23 core steps,
the corrected hosted post-step expectation, and all inner generated
artifacts preserve their V2 names and semantics.

## One-shot environment and candidate

The only authorized invocation is the first creation push of S4. Its push
record must have all-zero `before`, `created: true`, `deleted: false`,
`forced: false`, and `after` equal to S4. There is no `workflow_dispatch`,
schedule, matrix, cache, cancellation replacement, second push, or rerun.

The sole job uses GitHub's `ubuntu-22.04` label and must observe `Linux` `X64`.
It requires exact Node `22.20.0` x64, fresh Playwright Chromium, no package
cache, and explicit EGL provisioning and load validation. The Stasis candidate
remains the immutable successful package run `33506181780`, attempt `1`, at
revision `48c5a718a9ddd63f496e45307e1484974ccf8587`, with the exact Linux binary,
package, proof, manifest, sizes, and hashes already frozen by V1.

Protocol-controlled retries, sleeps, fallbacks, replacement inputs, discarded
failures, warm-ups, statistics, and host pooling are forbidden. `--retry 0`
freezes the controlled HTTP layer; transport behavior inside pinned Actions or
GitHub services does not authorize another workflow invocation or another
observation.

## Workload and localization boundary

The unchanged deterministic fixture crawl uses start URL
`http://stasis-compat.test/`, limit `20`, depth `2`, concurrency `1`, the exact
fixture route set, and the same exact `20/20` correctness oracle. The order is
fixed:

1. Crawlee, ordinal `1`;
2. Stasis, ordinal `2`.

Crawlee records `browser_launch`, `browser_resident_workload`, and every
`browser_close`. Stasis records `pool_creation`, `acquire_open`,
`settle_extract`, `release_physical_cleanup`, and `pool_close`. The monotonic
outer runner interval encloses every phase. Adjacent Stasis phases share exact
boundaries; successful Crawlee resident work begins at launch settlement and
ends at the first close invocation; and failures remain serialized in the raw
observation. Durations may be summed only inside one observation after the
frozen non-overlap checks pass.

Even a valid result is localization-only. It can describe which phase
dominated each of these two single observations on this one host. It cannot be
used as a comparison number or merged with the unchanged benchmark corpus.

## Hosted topology and outcome contract

The V4 job retains exactly 23 core steps. Core steps `1` through `23`,
including the four outcome/tail steps, retain their S3/S2 names; those names still
say `V2` where they describe H4-generated artifacts. The hosted verifier then
requires the terminal post topology:

| Number | Step |
| ---: | --- |
| `45` | `Post Set up exact Node 22.20.0 x64` |
| `46` | `Post Check out the exact diagnostic harness` |
| `47` | `Complete job` |

The old `44`/`45`/`46` topology is a deterministic negative regression and is
rejected by V4. Extra, missing, renamed, reordered, or renumbered core or post
steps are also rejected.

The exact Actions artifact name is
`stasis-v0.3.3-crawl-phase-diagnostic-v4-bundle-attempt-1`. For
`VALID_NON_AUTHORITATIVE`, its exact six entries are:

- `comparison-input-verification.json` using the V2 schema;
- `crawl-phase-crawlee-raw.json` using the H4 V2 diagnostic semantics;
- `crawl-phase-localization-evidence.json` using the V2 localization schema;
- `crawl-phase-stasis-raw.json` using the H4 V2 diagnostic semantics;
- `diagnostic-outcome.json` using the V2 outcome schema; and
- `diagnostic-verification.json` using the intentionally retained H4 V1
  semantic-verification schema.

For `DIAGNOSTIC_INVALID_WITH_STATUS`, the bundle contains only the V2
`diagnostic-outcome.json`. For `INFRASTRUCTURE_INVALID_NO_ARTIFACT`, the
publisher may derive the safe outcome only when the exact frozen tail topology
shows outcome creation, sealing, or upload failure and the complete GitHub
artifact listing contains zero artifacts. All other terminal conclusions and
all ambiguous or partial artifact states are unpublishable.

The only allowed failure pairs are:

- `input_verification` / `INPUT_VERIFICATION_FAILED`;
- `diagnostic_execution` / `DIAGNOSTIC_EXECUTION_FAILED`; and
- `offline_verification` / `OFFLINE_VERIFICATION_FAILED`.

Every outcome keeps authority, timing, statistics, comparison, optimization,
generalized-speed, and implementation flags false and keeps decision state
`STAY_0_4_UNASSIGNED`.

## Publication and anonymous public replay

The outcome-specific evidence release inventories are frozen in the canonical
V4 preflight. `privacy-scan.json` covers every payload asset and
`SHA256SUMS.txt` covers every other release asset while omitting itself. No
extra asset is allowed.

Before S4 exists, the standalone anonymous contract verifier binds the exact
four-asset immutable contract, exact H7 target metadata and lightweight tag,
H7's direct H6 ancestry, each released asset to its H7 blob, and the absence
of every S4/V4 observation surface. Its receipt remains in local evidence and
grants no authority.

The V4 hosted-provenance verifier binds the same immutable H7 contract
release, four exact contract assets, H7's direct H6 ancestry, the unchanged H1
comparison release and selected bytes, exact S4 and its sole S3 ancestry, all
five targeted workflow blobs, the complete one-shot run listing, the sole job,
the exact `1..23,45,46,47` step topology, and zero or one retained Actions
artifact. Its V3-unpublishable motivation input reproduces the frozen H6
target-metadata failure and target-only counterfactual without consuming the
V3 ZIP or importing its payload. The earlier V2 topology defect remains bound
through the immutable H6 contract.

The V4 artifact-binding verifier binds that hosted receipt to the exact V4 ZIP
entry inventory while retaining the inner V2 outcome and comparison schemas.
It accepts the H4 V1 semantic receipt only for a valid non-authoritative
observation. The V4 publication verifier rebuilds the full receipt chain and
the preregistered outcome-specific inventory without selecting rules after the
result is known.

The V4 anonymous public verifier refetches, without credentials or retries,
the four-asset contract, exact contract/source commits and trees, authoritative
lightweight tag refs, evidence release, and all published evidence bytes. It
also independently replays the frozen V1 public motivation and the V3
unpublishable metadata proof. It does not require the V3 Actions artifact to
remain unexpired and does not download the V3 ZIP.

## Claim boundary

A valid V4 result may describe phase localization for its one Crawlee
observation and one Stasis observation on its single hosted runner. It may not:

- publish a new Crawlee/Stasis ratio or comparison number;
- alter or append to the unchanged comparison corpus;
- establish typical or cross-host performance;
- attribute causality to WebRender, physical shutdown ownership, or any other
  subsystem;
- authorize an optimization or implementation change; or
- assign Stasis 0.4 scope.

A causal product change requires a separately preregistered control/treatment
experiment after a valid localization result. No retry, successful rerun,
post-hoc repair, or favorable timing can cross this boundary.

The decision remains `STAY_0_4_UNASSIGNED`.
