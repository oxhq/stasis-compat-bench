# Stasis v0.3.3 matched-navigation causal experiment V2

Status: `V1 invalid before observation; H8c not yet committed; V2 contract not yet published; S5 branch not pushed`

This protocol freezes one measurement-only, two-host experiment. It asks a
single narrow question selected by the already-public V4 phase-localization
evidence: on the controlled navigation fixture, is the additional time from
requesting `/navigation-start` instead of `/navigation-final` consistently
localized to `engineAndInitialOpen`?

It is not a rerun of the published Cypress/Stasis or Crawlee/Stasis benchmark,
does not change either comparison corpus, does not establish typical product
speed, and does not authorize implementation work. In particular, it cannot
attribute an observed difference to WebRender or physical-shutdown ownership.

## Frozen authority chain

The compatibility-harness chain is:

- H7 `de1c9a000cba734c549f2fcee182e92c0565dff5`;
- preliminary H8a `6b51796f646133dd74feb727a3edeb3ae1a8a443`, whose
  sole parent is H7;
- final H8a `11948d347204e3392fb960ed2966fcc63d769271`, tree
  `c8ba9cf9ddd6bcc85abf10c017349882544e0b1b`, whose sole parent is the
  preliminary H8a commit; and
- H8b `8f84642fb2c2af9e439a7fcb5da89ada1d42bb67`, tree
  `a73d8a07a8c6e81032ff14640e63de4e4fc905ac`, the sole child of final H8a;
  and
- H8c, the not-yet-created sole child of H8b, containing only this transparent
  V2 chronology correction, its four newly named contract assets, implementation,
  and regression coverage.

H8a is deliberately described as a two-commit stack. Final H8a is not a direct
child of H7.

The Stasis workflow-source chain is:

- S4 `b4c847b6543e34677630c311b20d9e3ff64d0925`; and
- final S5 `cb5bba41cda038fce82d2a5da6e4f853f1e97440`, tree
  `9883ccb6fd3ddf72c3e4745e9fa3b1d9cc1d95da`, whose sole parent is S4.

S5 adds only
`.github/workflows/stasis-v0.3.3-performance-navigation-causal.yml`. Its blob
is `f24f67ac0d2c8b7b7cbd3a1e2bfc8a304c1c8038`, its 40,758 bytes have SHA-256
`4ed396bba197d83b5033f506667df744e5d2a8b6c0e7f81081f3b850853ce472`,
and it contains 829 LF bytes, zero CR bytes, no BOM, and a final LF.

## Retained V1 pre-observation failure

V1 is immutable evidence of a failed gate, not a measurement. Contract release
`383003193` and preflight release `383003691` both target H8b and both report
`created_at=2026-09-04T20:39:28Z`. Their publication times are respectively
`2026-09-04T20:40:00Z` and `2026-09-04T20:41:03Z`. The V1 receipt release has
exactly asset `544876950`, `anonymous-contract-preflight.json`, 1,923 bytes,
SHA-256 `2ce4fb18d32d59c653e44aa6c9bc866b1ff5aa4c977ce1106f88ddcd79e90fc1`.

The receipt was canonical and the public source remained absent, but the V1
gate rejected with `Navigation causal preflight receipt release was not
published after its contract`. V1 incorrectly required the preflight
release's `created_at` to be later than the contract's `published_at`. GitHub
uses the target commit timestamp for same-target release `created_at`, so that
comparison did not model release order. No S5 push or observation occurred:
`observationStarted=false`, `authorizedS5CreationPushesConsumed=0`, and
`authorizedS5CreationPushesRemaining=1`. No V1 evidence release or tag exists.

The V2 anonymous gate must live-verify both immutable V1 releases, both direct
lightweight tags, H8b ancestry and V1 contract blobs, the exact V1 receipt
asset and bytes, and the still-empty source branch/run surface. The resulting
V2 receipt canonically classifies V1 as
`INVALID_PREFLIGHT_CHRONOLOGY_MODEL`; it does not authorize a V1 evidence
release and does not consume the one S5 creation push.

## Four-asset contract and chronology

The immutable V2 contract release tag is
`stasis-v0.3.3-performance-navigation-causal-contract-v2`. It contains exactly:

1. `stasis-v0.3.3-performance-navigation-causal-v2.md`;
2. `stasis-v0.3.3-performance-navigation-causal-preflight-v2.json`;
3. `stasis-v0.3.3-performance-navigation-causal-workflow-v2.yml`; and
4. `stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v2.json`.

The release must be created with an explicit H8c target and `--latest=false`.
GitHub must create the lightweight tag in that release transaction. The
release must be immutable, non-draft, and non-prerelease; both its exact
40-character `target_commitish` and its lightweight tag must resolve directly
to H8c. H8c must have H8b as its sole parent, and released asset bytes
must equal their H8c blobs. The anonymous gate fetches `/releases/latest` and
requires that this contract release is not selected as latest.

Before S5 exists remotely, the anonymous contract preflight must additionally
prove that its branch/ref, commit, workflow runs, both V1 and V2 evidence tags,
and both V1 and V2 evidence releases are absent. Only then may one creation
push create the S5 branch. That
push is the sole authorized invocation. A second push, rerun, replacement run,
manual dispatch, mutable tag, or observed-rule change invalidates the protocol.

From the clean H8c checkout, substitute its exact lowercase SHA for
`<H8C_SHA>` and create the contract release with this one transaction (do not
precreate the tag and do not add `--verify-tag`):

```text
gh release create stasis-v0.3.3-performance-navigation-causal-contract-v2 protocol/stasis-v0.3.3-performance-navigation-causal-v2.md protocol/stasis-v0.3.3-performance-navigation-causal-preflight-v2.json protocol/stasis-v0.3.3-performance-navigation-causal-workflow-v2.yml protocol/stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v2.json --repo oxhq/stasis-compat-bench --target <H8C_SHA> --title "Stasis v0.3.3 matched-navigation causal contract V2" --notes "Corrected immutable preregistration after the retained V1 pre-observation chronology-model failure; no benchmark or implementation claim." --latest=false
```

With exact Node 22.20.0 and no GitHub credentials, run the executable public
gate below before the sole S5 push. The receipt path must not already exist.
Its basename must be exactly `anonymous-contract-preflight-v2.json`.

```text
node src/performance/navigation-causal-publication-cli.mjs verify-contract-public <H8C_SHA> <ABSOLUTE_NEW_PREFLIGHT_RECEIPT_V2_JSON>
```

Before S5 is pushed, anchor exactly that receipt in a separate immutable
one-asset release. The release tag is
`stasis-v0.3.3-performance-navigation-causal-preflight-v2`; it targets H8c,
contains only `anonymous-contract-preflight-v2.json`, and is created without a
pre-existing tag and with `--latest=false`:

```text
gh release create stasis-v0.3.3-performance-navigation-causal-preflight-v2 <ABSOLUTE_NEW_PREFLIGHT_RECEIPT_V2_JSON> --repo oxhq/stasis-compat-bench --target <H8C_SHA> --title "Stasis v0.3.3 matched-navigation causal preflight V2" --notes "Corrected immutable pre-S5 receipt after the retained V1 chronology-model failure; no benchmark or implementation claim." --latest=false
```

Then anonymously verify the direct lightweight tag, target, one-asset
inventory, exact receipt bytes, contract-before-receipt chronology, and that
neither the contract nor receipt release is latest. This gate rechecks S5 and
evidence absence after observing the receipt release. Only a passing command
authorizes the sole S5 push:

```text
node src/performance/navigation-causal-publication-cli.mjs verify-preflight-public <H8C_SHA> <ABSOLUTE_NEW_PREFLIGHT_RECEIPT_V2_JSON>
```

Retain the anchored receipt as `anonymous-contract-preflight-v2.json` in the
evidence publication input. Final public verification refetches the preflight
release and requires its publication time to be strictly after the contract
and strictly before the hosted run was created.

Every release validates only that its own `created_at` is not later than its
own `published_at`. Cross-event order is determined exclusively by strict
`published_at` boundaries:

`V1 contract < V1 preflight < V2 contract < V2 preflight < S5 run creation`.

No V2 gate compares `created_at` values across same-target releases. Likewise,
the evidence release requires its own `created_at <= published_at` and its
`published_at` strictly after the hosted terminal time; it never requires its
`created_at` to be later than the run.

After the single run is terminal, safe retained evidence may be published under
`stasis-v0.3.3-performance-navigation-causal-evidence-v2`, targeted exactly at
H8c with `--latest=false`. An anonymous credential-free replay must verify the
contract, chronology, source, run, jobs, artifacts, payloads, classification,
checksums, and release metadata.

The final credential-free consumer command is:

```text
node src/performance/navigation-causal-publication-cli.mjs verify-public <H8C_SHA> <ABSOLUTE_NEW_PUBLIC_RECEIPT_JSON>
```

That final gate fetches `/releases/latest` and requires that the contract,
preflight-receipt, and evidence releases are not selected as latest. It also
refetches the current S5 branch, source commit, complete workflow/branch run
listing, selected run, all-attempt jobs, and Actions artifacts, then replays
the hosted, ZIP-binding, and replication receipts. This live authority replay
is intentionally retention-bounded: both Actions artifact records must still
be publicly present and nonexpired. The immutable evidence release preserves
the exact ZIP bytes after Actions retention, but the protocol does not claim
indefinite independent live Actions re-verification.

The V2 evidence release separately retains the full V1 contract-release,
contract-commit, contract-tag-ref, preflight-release, and preflight-tag-ref API
records plus the raw canonical V1 preflight receipt. They are checksum-bound
assets distinct from the nested V1 disposition in the V2 receipt. Final live
verification refetches their public authority and requires the archived
records, receipt bytes, and typed disposition to replay exactly. Raw release
records remain unchanged; retained-versus-live comparison normalizes only each
validated nonnegative asset `download_count`, because downloading the public
assets can increment that counter without changing their identity or bytes.

## V4 question selection

The fourth contract asset binds immutable V4 evidence release `382939276`, tag
`stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v4`, target H7,
and localization asset `544735276` (130,092 bytes; SHA-256
`fdc8cd495f8cd6116763ddbbc84ec896123bde828d6fb17bcb508b1bc772f34f`).
The selected value is Stasis `poolRuns[9]`, ordinal 10, requested URL
`http://stasis-compat.test/navigation-start`: `acquireOpenNs=2138374998`,
`settleExtractNs=1585211`, and `releasePhysicalCleanupNs=17473395`.

Those V4 values select the follow-up question only. They are not copied into
the causal samples or statistics and are not evidence that a causal effect or
WebRender mechanism already exists.

## Exactly one changed variable

Arm A requests `http://stasis-compat.test/navigation-start`, whose HTTP 200
fixture body performs a JavaScript `location.href` navigation. Arm B requests
`http://stasis-compat.test/navigation-final` directly. It is incorrect to call
arm A an HTTP redirect.

Every other runner input is exact. Both arms must end at the same final URL,
controlled-ready boundary, profile, quiescent settle outcome, full DOM string,
title, status text, status state, and resolved link. The requested URL is the
only excluded equality field. Equality is required within every adjacent pair,
across all 22 observations on each host, and directly across both hosts.

Each observation launches a fresh `@oxhq/stasis@0.3.3` native process. There is
no session pool, cache, or process reuse. Successful observations end only with
graceful `Session.close`; `Runtime.close` is not part of a successful sample.

## Schedule and lifecycle

There are two explicit, independent `ubuntu-22.04` jobs:

- host A: one untimed A warmup, one untimed B warmup, then adjacent
  `AB,BA,AB,BA,AB,BA,AB,BA,AB,BA` pairs;
- host B: one untimed B warmup, one untimed A warmup, then adjacent
  `BA,AB,BA,AB,BA,AB,BA,AB,BA,AB` pairs.

There are exactly 22 fresh processes per host and 10 timing-eligible adjacent
pairs per host. No retry, sleep, fallback, discard, replacement, cache, pool,
or cross-host timing combination is allowed.

Each observation is one continuous monotonic partition in this order:

1. `processProtocolLaunch`;
2. `engineAndInitialOpen`;
3. `settle`;
4. `extract`; and
5. `physicalClose`.

Adjacent phase boundaries must be identical and phase durations must sum to
the outer duration.

## Independent hosts and shared boot salt

Both jobs derive the identical, non-secret salt as SHA-256 over the exact
domain `stasis-v0.3.3-navigation-causal-boot-salt-v1`, `GITHUB_RUN_ID`, and
`GITHUB_SHA`, with NUL separators. Each host then hashes that same salt with
its Linux boot ID. Only after the exact workflow proves identical salt inputs
may unequal `bootInstanceDigest` values establish distinct boots.

The jobs must have different job keys and different boot-instance digests in
one workflow run. `hostClassDigest` is descriptive: two independent runners
may correctly have the same OS/image/CPU host class, so equality or inequality
of that field is never an independence gate.

## Preregistered per-host and replicated rules

Within each host, all ten pairs must be exactly correct and equivalent. The
host effect rule additionally requires:

- at least 9 of 10 positive Arm-A-minus-Arm-B `engineAndInitialOpen` deltas;
- a positive median `engineAndInitialOpen` delta;
- a positive median total delta; and
- at least 8 of 10 pairs where the positive open delta exceeds the absolute
  combined delta of every other phase.

The only replicated-effect result is `VALID_REPLICATED_EFFECT`, requiring both
independent hosts to meet every per-host rule. If both hosts are valid but one
or both miss the threshold, the result is `VALID_NO_REPLICATED_EFFECT`. That
means only that this preregistered two-host replication rule was not met; it is
not a claim of zero effect.

`INVALID_HOST_MEASUREMENT` retains the exact typed host outcomes, including
`INVALID_CORRECTNESS`, `INVALID_CLEAN_EXIT`, `INVALID_RUNTIME_OPERATION`, or
`INVALID_INCOMPLETE`. `INVALID_CROSS_HOST_INDEPENDENCE` and
`INVALID_CROSS_HOST_CORRECTNESS` are separate typed terminal results. Safe
structurally valid invalid evidence may be published, but it authorizes no
measurement claim and the source job fails only after uploading it. Missing or
noncanonical files are infrastructure ambiguity and cannot be synthesized into
an experiment outcome.

All statistics remain nested under their originating host. There is no pooled
sample array, pooled median, combined effect estimate, or host replacement.

Before any raw DOM is omitted from the privacy projection, every validated DOM
is scanned by the shared artifact-privacy rules. The HTML-aware scan treats
closing tags as markup and replaces only the exact public fixture path literal
`/leaf/navigation` with a fixed non-path marker; it does not replace or hide
credential-like text. The privacy receipt retains the original DOM byte count,
SHA-256 identity, and omission count.

The full retained GitHub authority JSON remains byte-for-byte unchanged and
checksum-bound. In a scan-only clone, only canonical GitHub RFC6570 user and
release-upload URI templates are replaced after their exact API base, field,
and suffix have been validated; only validated `state=uploaded` release-asset
fields are omitted. Every present commit `files[].patch` first receives a
source-aware credential, bounded embedded-Base64, and private-task-path scan,
and its original filename, byte count, and SHA-256 are retained before the
patch is replaced in that clone. Generic local-path matching is not applied to
source diffs because module imports, URL routes, and workflow paths are source
text rather than captured machine paths. The two intentional V1 credential
regression literals are masked only at their frozen H8b file, JSON pointer,
source context, and single occurrences; any relocation, context change,
additional occurrence, or other credential-like text is rejected.

## Hosted topology

GitHub REST reports implicit `Set up job` as step 1, followed by the 16
declared steps numbered 2 through 17. The frozen post topology is:

- 33: `Post Set up exact Node 22.20.0 x64`;
- 34: `Post Check out the exact navigation causal runner`;
- 35: `Complete job`.

For a retained typed-invalid host, declared propagation step 17 fails, post
Node step 33 is skipped, post-checkout step 34 succeeds, and complete-job step
35 succeeds while the job conclusion is failure. Every preceding step,
including artifact upload at step 16, must have succeeded. A successful host
has success for every listed step.

Shifted, missing, additional, renamed, duplicate, or reordered steps are
invalid. The exact artifact names are
`stasis-v0.3.3-navigation-causal-host-a-attempt-1` and
`stasis-v0.3.3-navigation-causal-host-b-attempt-1`. Each ZIP contains exactly
its lane's canonical raw and outcome JSON files. A typed semantic invalidity
must still pass artifact retention before the final propagation step fails.

## Claim boundary

Even `VALID_REPLICATED_EFFECT` authorizes only the bounded statement that, on
these two independent hosted observations of this exact controlled fixture,
the extra matched-navigation time satisfied the frozen localization rule. It
does not establish typical speed, change the published comparisons, identify
an internal mechanism, or authorize a Stasis change.

Every outcome keeps `generalizedSpeedClaimAuthorized=false`,
`implementationWorkAuthorized=false`, `comparisonCorpusChanged=false`, and
`decisionState=STAY_0_4_UNASSIGNED`.
