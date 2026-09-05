# Stasis v0.3.3 matched-navigation causal experiment V3

Status: `V1 chronology-gate failure and V2 pre-measurement harness failure retained; H9a and S6 frozen; V3 contract not yet published; S6 branch not pushed`

This protocol freezes one measurement-only, two-host experiment. It asks a
single narrow question selected by the already-public V4 phase-localization
evidence: on the controlled navigation fixture, is the additional time from
requesting `/navigation-start` instead of `/navigation-final` consistently
localized to `engineAndInitialOpen`?

It is not a rerun of the published Cypress/Stasis or Crawlee/Stasis benchmark,
does not change either comparison corpus, does not establish typical product
speed, and does not authorize implementation work. In particular, it cannot
attribute an observed difference to WebRender or physical-shutdown ownership.

## Frozen source identities

The historical compatibility-harness chain remains unchanged:

- H7 `de1c9a000cba734c549f2fcee182e92c0565dff5`;
- preliminary H8a `6b51796f646133dd74feb727a3edeb3ae1a8a443`, sole child of H7;
- final H8a `11948d347204e3392fb960ed2966fcc63d769271`, tree
  `c8ba9cf9ddd6bcc85abf10c017349882544e0b1b`, sole child of preliminary H8a;
- H8b `8f84642fb2c2af9e439a7fcb5da89ada1d42bb67`, tree
  `a73d8a07a8c6e81032ff14640e63de4e4fc905ac`, sole child of final H8a; and
- H8c `a1352f2d31cb21bed7fae200c7fd638f850274f4`, tree
  `6ad9c9e0cddcfe3b7317c9b76b1d1e38677b14b9`, sole child of H8b.

Final H8a is not a direct child of H7. V3 has two distinct harness roles:

- Execution H9a `84efe2bbc7e41a7b01e4feae12db7a7e7344c539`, tree
  `4a2b5ec6364b2d24f95166883db23e03293d2e43`, is the sole child of final H8a.
- Publication H9b is the not-yet-created sole child of H8c containing this V3
  contract, retained V2 failure, corrected verification, and regression coverage.
  Its exact SHA is supplied explicitly to every release and public verifier.

The Stasis workflow-source chain is S4
`b4c847b6543e34677630c311b20d9e3ff64d0925`, then its sole child S5
`cb5bba41cda038fce82d2a5da6e4f853f1e97440`, then S6
`6a785f438ecffaf3433ec907059f4df4fd4eedfa`, whose sole parent is S5.
S6 tree is `5868bafc2843cb16e2f33c4d739dd484705f4fd4`. It adds only
`.github/workflows/stasis-v0.3.3-performance-navigation-causal-v3.yml`.
The new file has blob `9c01b6ad4b02d1d21426d31c85c451c685b80a1a`,
40,950 bytes, SHA-256
`d46cfeb840d139b2cbd10c834e114fc0df7a53fd677e026cfe0145549307bdd0`,
831 LF bytes, zero CR bytes, no BOM, and a final LF.

The new source branch is
`codex/stasis-v033-navigation-causal-source-v3`; its workflow name is
`Stasis v0.3.3 navigation causal experiment V3`. S5's existing workflow and
branch remain unchanged and must not be invoked again.

## Retained failures and causally justified correction

V1 is immutable evidence of a failed pre-observation gate. Contract release
`383003193` and preflight release `383003691` both target H8b and report
`created_at=2026-09-04T20:39:28Z`. Their publication times are respectively
`2026-09-04T20:40:00Z` and `2026-09-04T20:41:03Z`. Receipt asset
`544876950`, `anonymous-contract-preflight.json`, is 1,923 bytes with SHA-256
`2ce4fb18d32d59c653e44aa6c9bc866b1ff5aa4c977ce1106f88ddcd79e90fc1`.

V1 wrongly required the preflight release's `created_at` to follow the
contract's `published_at`. The same-target timestamps did not model that
publication order. Its disposition remains
`INVALID_PREFLIGHT_CHRONOLOGY_MODEL`. No S5 push occurred under V1, and no V1
evidence release or tag exists. The V1 archived receipt is historical evidence
of the source absence at that time, not a claim that S5 remains absent now.

V2 corrected that chronology gate. Immutable contract release `383100231`
and preflight release `383100433` target H8c, published at
`2026-09-05T01:56:58Z` and `2026-09-05T01:57:47Z`. The sole S5 creation
push produced run `33937724071`, attempt 1, created at
`2026-09-05T01:58:17Z` and terminal with failure at
`2026-09-05T01:59:17Z`. Jobs `101228807491` and `101228807574` both
failed with `The launch environment must be an object`. There are zero
Actions artifacts and no V2 measurement evidence release or tag.

V2 is classified `INVALID_PRE_MEASUREMENT_HARNESS_INVOCATION`, reason
`NON_PLAIN_PROCESS_ENV_REJECTED_BEFORE_RUN_HOST`. Source inspection and the
deterministic mocked regression establish that Node 22.20.0's actual
`process.env` object has a non-plain prototype and the runner factory rejected
it synchronously before host measurement or SDK launch. Public job metadata
alone does not prove a native launch count; the receipt explicitly says so.
The failure is not a Stasis product measurement or a measured product failure.

H9a changes exactly three production literals: the command default becomes
`environment = { ...process.env }`, and the expected workflow name/ref become
the new V3 values. The dedicated
`test/performance-navigation-causal-environment-v3.test.mjs` proves the old
factory rejects the actual environment before a launch, while the corrected
command passes one plain snapshot to one mocked launch, disposes once, and
removes only the lifecycle-trace variable from that launch snapshot.
It performs no native launch, network access, filesystem operation, or retry.
Each S6 host runs this regression before the unchanged measurement command.
No workload, sample schedule, phase boundary, extraction, cleanup, product
package, or decision rule changes.

The V3 contract freezes two additional failure assets:

- `stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json`:
  370,631 bytes, SHA-256
  `2fd870809f4c3198c23c8f1118d2b8f2461b318fcd8790b81f66c2ea2a9dc51a`.
  It preserves canonical full API record values and the exact V2 receipt.
- `stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip`:
  113,247 bytes, SHA-256
  `a7415037cbe660f632625b6b43a19ff845148a0f33669810f1171086b97e2297`.
  It contains 40 entries and 419,052 uncompressed bytes.

The ZIP is an authenticated GitHub Actions log capture, retained without
credentials and scanned before publication. Anonymous consumers can replay its
frozen bytes and corroborating public run/job/artifact metadata; they cannot
independently refetch the original Actions logs anonymously. No stronger
anonymous-log provenance claim is made. The S5 invocation is consumed forever;
V3 is a newly preregistered correction, not a retry or a replacement sample.
A later successful hosted run would not by itself prove the harness correction.

## Six-asset contract and chronology

The immutable contract tag is
`stasis-v0.3.3-performance-navigation-causal-contract-v3`, containing exactly:

1. `stasis-v0.3.3-performance-navigation-causal-v3.md`;
2. `stasis-v0.3.3-performance-navigation-causal-preflight-v3.json`;
3. `stasis-v0.3.3-performance-navigation-causal-workflow-v3.yml`;
4. `stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v3.json`;
5. `stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json`; and
6. `stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip`.

Create the release with the explicit H9b SHA and `--latest=false`. GitHub must
create the direct lightweight tag in that transaction. The release must be
immutable, non-draft, and non-prerelease. Its exact 40-character
`target_commitish` and tag must resolve to H9b, whose sole parent is H8c.
All six released assets must equal the frozen identities and H9b blobs.
The contract and receipt must not become the repository's latest release.

Before S6 exists remotely, anonymous preflight must prove its branch/ref,
commit, all-event branch run census, and evidence release/tag are absent.
It must also replay the retained V1 authority and V2 failure: S5's exact
unchanged source, one all-event branch run and one head-SHA run, attempt 1,
both exact failed jobs and step topology, zero artifacts, and continued
absence of the V1 and V2 measurement evidence releases/tags.

From clean H9b, substitute its exact lowercase SHA for `<H9B_SHA>`.
Do not precreate the tag or add `--verify-tag`:

```text
gh release create stasis-v0.3.3-performance-navigation-causal-contract-v3 protocol/stasis-v0.3.3-performance-navigation-causal-v3.md protocol/stasis-v0.3.3-performance-navigation-causal-preflight-v3.json protocol/stasis-v0.3.3-performance-navigation-causal-workflow-v3.yml protocol/stasis-v0.3.3-performance-navigation-causal-v4-selection-binding-v3.json protocol/stasis-v0.3.3-performance-navigation-causal-v2-failure-authority.json protocol/stasis-v0.3.3-performance-navigation-causal-v2-actions-logs.zip --repo oxhq/stasis-compat-bench --target <H9B_SHA> --title "Stasis v0.3.3 matched-navigation causal contract V3" --notes "Immutable preregistration after retained V1 chronology and V2 pre-measurement harness failures; deterministic environment-snapshot correction; no benchmark or implementation claim." --latest=false
```

With exact Node 22.20.0 and no GitHub credentials, run:

```text
node src/performance/navigation-causal-publication-cli.mjs verify-contract-public <H9B_SHA> <ABSOLUTE_NEW_PREFLIGHT_RECEIPT_V3_JSON>
```

The receipt path must not exist; its basename must be exactly
`anonymous-contract-preflight-v3.json`. Anchor those exact bytes in a separate
immutable one-asset release, then run the second anonymous gate:

```text
gh release create stasis-v0.3.3-performance-navigation-causal-preflight-v3 <ABSOLUTE_NEW_PREFLIGHT_RECEIPT_V3_JSON> --repo oxhq/stasis-compat-bench --target <H9B_SHA> --title "Stasis v0.3.3 matched-navigation causal preflight V3" --notes "Immutable pre-S6 anonymous receipt retaining V1 and V2 failures; no benchmark or implementation claim." --latest=false
node src/performance/navigation-causal-publication-cli.mjs verify-preflight-public <H9B_SHA> <ABSOLUTE_NEW_PREFLIGHT_RECEIPT_V3_JSON>
```

Only the passing second gate authorizes the sole creation push of S6. A second
push, rerun, replacement host/run/sample, manual dispatch, mutable tag, or
post-observation rule change invalidates V3. Retain the anchored receipt in
the final evidence publication input.

Each release validates its own `created_at <= published_at`. Cross-release
order uses strict publication times, never one release's creation time against
another's publication time. Required event order is:

`V1 contract < V1 preflight < V2 contract < V2 preflight < S5 run creation < S5 terminal < V3 contract < V3 preflight < S6 run creation < S6 terminal < V3 evidence publication`.

After the single S6 run is terminal, safe retained evidence may be published at
`stasis-v0.3.3-performance-navigation-causal-evidence-v3`, targeted exactly at
H9b with `--latest=false`. Its exact 29-asset inventory is the prior
27-asset evidence layout with the active V3 receipt plus the two frozen V2
failure assets. The six separately retained V1 authority/receipt records remain.

The final credential-free consumer command is:

```text
node src/performance/navigation-causal-publication-cli.mjs verify-public <H9B_SHA> <ABSOLUTE_NEW_PUBLIC_RECEIPT_JSON>
```

That gate refetches the contract, receipt, evidence and latest-release metadata;
both historical failure authorities; current S6 source, global all-event
branch census, selected run, all-attempt jobs and artifacts; and replays exact
payloads, ZIP binding, checksums, classification and host statistics.
The contract, receipt and evidence releases must not be selected as latest.

Live Actions verification is retention-bounded: both S6 artifacts must remain
publicly present and nonexpired. Immutable release ZIPs survive that retention,
but indefinite independent live Actions replay is not claimed. Retained V1
release JSON stays unchanged; its live comparison normalizes only validated
nonnegative asset `download_count`, which may increase through public access.
V2 raw API values remain canonical and unprojected in their frozen bundle;
live identity and topology checks corroborate that retained capture.

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
