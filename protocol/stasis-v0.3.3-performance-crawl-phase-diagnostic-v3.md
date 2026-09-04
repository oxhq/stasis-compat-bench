# Stasis v0.3.3 performance crawl phase diagnostic V3

Status: `preregistered; H6 not yet committed; contract release not yet published; S3 branch not pushed`

This protocol freezes one separately hosted, one-shot V3 crawl-phase
diagnostic. Its only purpose is to localize the phases of one Crawlee
observation and one Stasis observation on one GitHub-hosted Ubuntu 22.04
runner. It is not a benchmark rerun, a new Crawlee/Stasis comparison, a
generalized speed claim, a causal experiment, or authority to change Stasis.

V3 exists because the only V2 hosted observation cannot satisfy its own frozen
hosted-provenance contract. GitHub numbered the terminal post steps `45`, `46`,
and `47`; the already-published V2 verifier required `44`, `45`, and `46`.
V3 corrects that outer topology contract before obtaining a new observation.
It does not repair, reinterpret, or reuse the V2 observation.

## Immutable authority and chronology

The authority chain is:

- H1 `6c1a0066eb17425628293993fd7312d4cf26e0f5` contains the unchanged
  comparison evidence contract.
- H4 `58742c0f35939558b334eeb792cbf17ae8ab3426` contains the diagnostic
  harness, frozen plain-object SDK adapter, and deterministic regression.
- H5 `54a08f2f63718658a2ed60309eba94c9a00efbc3`, tree
  `f4d02631892cee126970a3fa3485aef37f1aee35`, is H4's direct child and is
  the target of immutable V2 contract release `382863604`.
- H6 is the not-yet-committed direct child of H5 that contains this protocol,
  its canonical preflight, the exact S3 workflow mirror, the frozen V2
  unpublishable record, and the V3 verification/publication implementation.
  Its commit and tree IDs are deliberately not guessed before the commit
  exists.
- S3 `fc1dfca00b0f25d1da35cae23fa206d511aa876e` is the exact prepared workflow
  source commit in `oxhq/stasis`. Its sole parent is S2
  `6dbe0cafd261e7a171c84929233bb9131b9d4b3e`.

The release sequence is immutable:

1. Commit H6 as the direct child of H5.
2. Create the lightweight contract tag
   `stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v3` at H6 and
   publish the public immutable contract release with exactly the four frozen
   assets listed below.
3. Only after that contract release is public and immutable, create the S3
   branch with one push. That creation push is the only authorized V3 workflow
   invocation.
4. Wait for that one run to become terminal. Do not rerun it, replace it, or
   repair its result after observation.
5. If and only if the frozen outcome rules accept the run, assemble the exact
   outcome-specific evidence inventory and publish it under the lightweight
   tag `stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v3`, also
   resolving to H6.
6. Perform an anonymous, credential-free public replay of the complete release
   chain.

A mutable tag, tag move, draft, prerelease, second push, rerun, manual run,
replacement observation, or outcome rule selected after seeing the result
invalidates the protocol.

## H6 contract assets

The V3 contract release contains exactly these four assets and no others:

1. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable.json`;
2. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-preflight.json`;
3. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v3-workflow.yml`; and
4. `stasis-v0.3.3-performance-crawl-phase-diagnostic-v3.md`.

The first asset is canonical pretty JSON with schema
`stasis-v0.3.3-performance-crawl-phase-diagnostic-v2-unpublishable-v1`, 4,715
bytes, and SHA-256
`e4c05eb998ba8101d14b1307db587c09a1acc1649a4589460a6a9e788a7f5e23`.
The contract release binds every asset to its exact H6 Git blob and released
bytes. The contract tag ref, rather than GitHub's mutable-looking
`target_commitish` presentation field, is the revision authority.

## Frozen V2 observation: unpublishable motivation only

The V2 source was S2
`6dbe0cafd261e7a171c84929233bb9131b9d4b3e`, whose sole parent is S1
`6c142d18631b910ab9e7ce842b52ed817b46ecc5`. V2 contract release `382863604`
was created at `2026-09-04T16:07:49Z`, published at
`2026-09-04T16:12:51Z`, is immutable, and resolves through tag
`stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v2` to H5.

The sole V2 observation is run `33893969529`, attempt `1`, job
`101092105779`, created at `2026-09-04T16:13:58Z` and completed successfully
at `2026-09-04T16:15:23Z`. It had 23 core steps. Its terminal API topology was:

| Number | Step |
| ---: | --- |
| `45` | `Post Set up exact Node 22.20.0 x64` |
| `46` | `Post Check out the exact diagnostic harness` |
| `47` | `Complete job` |

The immutable H5 verifier instead required those names at `44`, `45`, and
`46`. It therefore rejects the actual job with the exact error
`Diagnostic hosted job step topology changed`. A counterfactual copy with
those three frozen V2 ordinals is accepted, demonstrating that the failure is
the preregistered topology defect rather than an outcome-based policy change.

V2 artifact `9945005103` was named
`stasis-v0.3.3-crawl-phase-diagnostic-v2-bundle-attempt-1`, was 24,466 bytes,
and had SHA-256
`388572d4e90a6d6aa30ec208cb4d34e0f1ce2d5dba30b246a61488c54653675c`.
It was unexpired when the V2 record was frozen. Later artifact expiry is not a
change to that historical fact and is not a reason to relax or invalidate V3.

The artifact payload may have been inspected during investigation; this
protocol makes no claim that the ZIP was never opened. The V3 motivation
verifier does not download or consume that ZIP, however. It verifies the
frozen V2 contract and hosted metadata, including the exact topology defect.
No V2 raw timing, diagnostic outcome, or comparison value is imported into the
V3 contract or any V3 verifier.

This V2-unpublishable proof is an H6 contract and public-verifier input only.
It is not a hosted S3 workflow step and cannot affect either V3 observation.

The V2 observation is permanently `unpublishable` with reason
`HOSTED_POST_STEP_ORDINAL_CONTRACT_DEFECT`. It authorizes no V2 evidence
release, rerun, replacement observation, post-hoc verifier repair, timing
claim, comparison, optimization, or product decision. V3 is a new
preregistered observation, not a salvage path for V2.

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

V3 changes only the outer hosted, artifact-binding, publication, release, CLI,
and anonymous-public-verification envelopes to V3. S3 keeps the same 23 core
step names and behavior as S2. Every H4-generated inner diagnostic artifact
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
instrumentation. None of these inner versions may be normalized to V3.

## Earlier invalid V1 motivation

S3 preserves S2's anonymous verification of the already-published V1 invalid
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
`100991246321`. S3 reads the authoritative raw comparison bytes before and
after its two observations and requires byte identity. It does not modify or
recompute the comparison corpus, oracle, raw samples, or published statistics.

## Exact S3 workflow source

The sole authorized workflow source in `oxhq/stasis` is:

- branch `codex/stasis-v033-crawl-phase-diagnostic-v3`;
- ref `refs/heads/codex/stasis-v033-crawl-phase-diagnostic-v3`;
- commit `fc1dfca00b0f25d1da35cae23fa206d511aa876e`;
- sole parent S2 `6dbe0cafd261e7a171c84929233bb9131b9d4b3e`;
- tree `5d25832a1678d57359980df4b1f1dacbe5e6bacc`;
- sole changed path, with status `added`,
  `.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v3.yml`;
- workflow Git blob `a9914cdd9c4146a898df3753949e3a864141fc0a`;
- workflow size 63,031 bytes, 1,255 LF lines, zero CR bytes;
- workflow SHA-256
  `58d309cae7286f9ed7858e3f5247e6b4999a7f647070bc7010a498a082571cba`;
- workflow name `Stasis v0.3.3 performance crawl phase diagnostic V3`;
- job ID `crawl-phase-diagnostic-v3`; and
- job name `Native Ubuntu 22.04 crawl phase diagnostic V3`.

The workflow mirror distributed in the H6 contract must match that blob byte
for byte. The targeted nonrecursive tree proof also requires the inherited V2
diagnostic workflow at
`.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic-v2.yml` to
remain blob `0de4bb7e6d7f623ccf38633991f999e1dc38bc45`, the V1 diagnostic workflow to
remain blob `61675d581be0f8d40accadef531ff1a7c71deb76`, and the comparison workflow to
remain blob `e31601363f2506df87f05a585f8adb0c790c5481`.

All preparation and tail steps remain fail closed and omit
`continue-on-error`. The only intended workflow changes from S2 are the outer
V3 workflow, branch, job, contract, and artifact identities plus the corrected
hosted post-step expectation. The 23 core steps and all inner generated
artifacts preserve their V2 names and semantics.

## One-shot environment and candidate

The only authorized invocation is the first creation push of S3. Its push
record must have all-zero `before`, `created: true`, `deleted: false`,
`forced: false`, and `after` equal to S3. There is no `workflow_dispatch`,
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

The V3 job retains exactly 23 core steps. Core steps `1` through `23`,
including the four outcome/tail steps, retain their S2 names; those names still
say `V2` where they describe H4-generated artifacts. The hosted verifier then
requires the terminal post topology:

| Number | Step |
| ---: | --- |
| `45` | `Post Set up exact Node 22.20.0 x64` |
| `46` | `Post Check out the exact diagnostic harness` |
| `47` | `Complete job` |

The old `44`/`45`/`46` topology is a deterministic negative regression and is
rejected by V3. Extra, missing, renamed, reordered, or renumbered core or post
steps are also rejected.

The exact Actions artifact name is
`stasis-v0.3.3-crawl-phase-diagnostic-v3-bundle-attempt-1`. For
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
V3 preflight. `privacy-scan.json` covers every payload asset and
`SHA256SUMS.txt` covers every other release asset while omitting itself. No
extra asset is allowed.

The V3 hosted-provenance verifier binds the immutable H6 contract release,
four exact contract assets, H6's direct H5 ancestry, the unchanged H1
comparison release and selected bytes, exact S3 and its sole S2 ancestry, all
four targeted workflow blobs, the complete one-shot run listing, the sole job,
the exact `1..23,45,46,47` step topology, and zero or one retained Actions
artifact. Its V2-unpublishable motivation input verifies the historical
topology defect without consuming the V2 ZIP or importing its payload.

The V3 artifact-binding verifier binds that hosted receipt to the exact V3 ZIP
entry inventory while retaining the inner V2 outcome and comparison schemas.
It accepts the H4 V1 semantic receipt only for a valid non-authoritative
observation. The V3 publication verifier rebuilds the full receipt chain and
the preregistered outcome-specific inventory without selecting rules after the
result is known.

The V3 anonymous public verifier refetches, without credentials or retries,
the four-asset contract, exact contract/source commits and trees, authoritative
lightweight tag refs, evidence release, and all published evidence bytes. It
also independently replays the frozen V1 public motivation and the V2
unpublishable metadata proof. It does not require the V2 Actions artifact to
remain unexpired and does not download the V2 ZIP.

## Claim boundary

A valid V3 result may describe phase localization for its one Crawlee
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
