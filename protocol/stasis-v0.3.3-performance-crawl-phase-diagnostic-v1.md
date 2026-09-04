# Stasis v0.3.3 performance crawl phase diagnostic v1

Status: `preregistered; contract release not yet published; diagnostic branch not pushed`

This protocol freezes one separately hosted, one-shot crawl phase diagnostic.
Its purpose is to localize where one Crawlee observation and one Stasis
observation spend time. It is not a performance comparison, benchmark rerun,
replication, optimization authorization, or causal experiment.

The frozen Cypress/RWA and Crawlee/Stasis comparison remains the authority for
the already-published comparison numbers. This diagnostic neither changes that
comparison nor adds observations to it. It consumes the exact sealed crawl raw
and artifact-binding receipt from the immutable comparison-evidence release,
then records new phase intervals under schemas deliberately ineligible for
comparison statistics.

## Publication and execution chronology

The required order is strict:

1. The immutable comparison-evidence release already exists and targets `H1`.
2. This protocol, the exact workflow mirror, and the canonical preflight are
   committed as one direct child of `H1` and published as the immutable
   diagnostic-contract release.
3. Only after that contract release is public and immutable may the already
   frozen `S1` commit be pushed once, creating the diagnostic branch and its
   single push run.
4. The selected run must be terminal before hosted provenance, artifact
   binding, privacy scanning, checksums, or the diagnostic-evidence release is
   produced.
5. The diagnostic-evidence release is published only from the outcome-specific
   inventory frozen below.

The comparison release `published_at` must be strictly earlier than the
diagnostic contract release `published_at`. The contract release
`published_at` must be strictly earlier than both creation and start of the
diagnostic run. The evidence release must postdate the terminal run and its
offline verification. A mutable tag, draft, prerelease, tag move, second push,
rerun, or replacement observation invalidates this protocol.

The contract identity is:

- repository: `oxhq/stasis-compat-bench`;
- sole parent: `6c1a0066eb17425628293993fd7312d4cf26e0f5` (`H1`);
- contract tag:
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-contract-v1`;
- evidence tag:
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-evidence-v1`; and
- exact contract release assets, sorted by UTF-8 basename:
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-preflight.json`,
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-v1.md`, and
  `stasis-v0.3.3-performance-crawl-phase-diagnostic-workflow.yml`.

The contract release must be non-draft, non-prerelease, immutable, and backed
by a lightweight tag that resolves directly to its one-parent commit.

## Frozen comparison inputs

The diagnostic accepts only release `382679391` in
`oxhq/stasis-compat-bench`:

- tag: `stasis-v0.3.3-performance-replication-evidence-v1`;
- target commit (`H1`):
  `6c1a0066eb17425628293993fd7312d4cf26e0f5`;
- target tree: `0d5322a5c2c104d2065a37fb7deecfa6944100bc`;
- release state: non-draft, non-prerelease, immutable; and
- tag form: lightweight commit ref resolving directly to `H1`.

The workflow verifies the release's exact 28-name inventory and anonymously
downloads exactly these two selected inputs over HTTPS, with credentials
absent, redirects restricted to HTTPS, and `--retry 0`:

| Asset | Release asset ID | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `artifact-binding.json` | `544250114` | `5086` | `78d91f9c12f85d538dff1944e772614bf9b0adc9841d647c93ab8f608f1ba4ad` |
| `fresh-crawl-raw.json` | `544250086` | `221543` | `52a76a4ebb726c6ab78b70356655e8abd7a5e84d9ce175a8e0d876f543c1a16b` |

The comparison input identifies workflow run `33862916068`, attempt `1`, and
its Ubuntu crawl job `100991246321`. The comparison raw remains immutable: its
exact bytes are read before the diagnostic and again after both observations,
and the two reads must be byte-identical. Its authority and artifact-binding
receipt must validate before any diagnostic artifact can be composed.

`--retry 0` and the no-retry rule freeze protocol-controlled client retries and
benchmark observations. GitHub infrastructure and pinned Actions may perform
transport-internal retries that are not exposed by the retained REST evidence;
those do not authorize another workflow invocation or benchmark observation.
Likewise, `fallbacks: false` forbids protocol-controlled alternate candidates,
workloads, observations, source records, or replacement runs. A pinned setup
Action may use its own acquisition endpoints, but the next gate still requires
the exact Node `22.20.0` x64 runtime; no alternate runtime version is accepted.
That acquisition implementation detail grants no retry, rerun, or observation
replacement authority.

## Frozen harness and workflow source

The diagnostic harness checkout is exactly `H1`, commit
`6c1a0066eb17425628293993fd7312d4cf26e0f5`, tree
`0d5322a5c2c104d2065a37fb7deecfa6944100bc`. It contains the diagnostic runner,
semantic composer, and offline verifier. The measured runner implementation is
still `src/performance/crawl.mjs`; the phase layer delegates to it rather than
substituting another crawler or workload.

The only authorized workflow source is `S1` in `oxhq/stasis`:

- branch: `codex/stasis-v033-crawl-phase-diagnostic-v1`;
- ref: `refs/heads/codex/stasis-v033-crawl-phase-diagnostic-v1`;
- commit: `6c142d18631b910ab9e7ce842b52ed817b46ecc5`;
- sole parent: `6c7a6013e00584c8cb8d54c80cee5dbbcf3ca1b9`;
- tree: `e5842f5effda8d09caf99f40900e7dacccaec610`;
- sole changed file, with status `added`:
  `.github/workflows/stasis-v0.3.3-performance-crawl-phase-diagnostic.yml`;
- diagnostic workflow Git blob:
  `61675d581be0f8d40accadef531ff1a7c71deb76`;
- diagnostic workflow byte SHA-256:
  `1cc7eccd1363d9f4e91d2d7860480cc165a59e5d351fce60c28e1bb3130cc58f`;
- workflow name: `Stasis v0.3.3 performance crawl phase diagnostic`;
- job ID: `crawl-phase-diagnostic`; and
- job name: `Native Ubuntu 22.04 crawl phase diagnostic`.

The workflow mirror distributed with this contract must be byte-for-byte equal
to the `S1` Git blob and have the stated SHA-256. The comparison workflow at
`.github/workflows/stasis-v0.3.3-performance-evidence.yml` must remain the
unchanged Git blob `e31601363f2506df87f05a585f8adb0c790c5481`.

All 17 preparation steps and the three outcome/seal/upload tail steps omit
`continue-on-error`. Their explicit chained conditions and `always()` tail
conditions preserve fail-closed execution while ensuring each raw failure is
observable as `failure`, rather than rewritten to `success`, in GitHub's job
steps REST record. The retained job-step names, numbers, order, conclusions,
and timestamps are part of hosted provenance.

## One-shot hosted boundary

The only invocation is the first creation push of `S1` to the frozen branch.
The push payload must have an all-zero `before`, `created: true`,
`deleted: false`, `forced: false`, and `after` equal to `S1`. The event is
`push`, and `GITHUB_RUN_ATTEMPT` is `1`. There is no manual trigger, schedule,
matrix, cache, concurrent cancellation, second push, or authoritative rerun.

The hosted API proof is limited to exactly one matching invocation among the
runs currently retained by GitHub. It cannot prove that a prior matching run
was never deleted. Deleting a run would breach this protocol, but absence of a
deleted run is not observable evidence that it never existed.

The run contains exactly one job with these fixed properties:

- GitHub-hosted label: `ubuntu-22.04`;
- runner OS and architecture: `Linux` and `X64`;
- Node: `22.20.0`, x64, with package-manager caching disabled;
- Playwright: the harness lockfile's Chromium, installed fresh with system
  dependencies into a new runner-temporary browser directory; and
- EGL prerequisites: `libegl1`, `libegl-mesa0`, and `libglvnd0`, followed by an
  explicit `libEGL.so.1`/`eglGetProcAddress` load check.

The `ubuntu-22.04` label plus the runtime OS and architecture checks prove the
reported scheduler label and observed runtime properties. They are not a
cryptographic attestation of the physical host or complete runner image.

The Stasis candidate is the immutable successful package run `33506181780`,
attempt `1`, at revision
`48c5a718a9ddd63f496e45307e1484974ccf8587`. The workflow verifies and uses:

| Candidate input | Bytes | SHA-256 |
| --- | ---: | --- |
| `stasis-0.3.3-linux-x86_64.tar.gz` | `34279279` | `5965e932cab407aa75d3f283015bf5d5df92cf06ecbd5f1add03083937208e86` |
| `stasis-0.3.3-linux-x86_64-act-settle-inspect.json` | `1160` | `81e44c9dba85bc10cc67536388f11a9e251b7d4d29e3fc740c98afbfefba1cac` |
| `oxhq-stasis-0.3.3.tgz` | `181292` | `55063c0ab9fc802e101d792831c292f1a7b0b497a141603102eacbef9fc029ec` |
| `stasis-0.3.3-runtime-manifest.json` | `2503` | `4e466dbd269fb08738c265133aa5bed2d139d2750db6a5060230e63527ee39a4` |
| extracted `stasis` executable | `83877352` | `c6a37995cde25275454d7f1ee61c2803964b04bf0d35f8fde7c78e9575c74c37` |

All source and candidate checks, dependency installation, browser installation,
and EGL provisioning are outside diagnostic intervals. They are input gates,
not timing observations.

## Frozen workload and observation order

The diagnostic reuses the deterministic primary crawl without modifying the
application or corpus:

- start URL: `http://stasis-compat.test/`;
- page limit: `20`;
- depth limit: `2`;
- concurrency: `1`;
- network: the exact fixture-only route set; and
- correctness: the same exact `20/20` result projection bound to the sealed
  comparison raw.

There are exactly two observations, in this preregistered order:

1. one Crawlee observation with ordinal `1`; then
2. one Stasis observation with ordinal `2`.

There are zero warm-ups. There are no retries, sleeps, fallbacks, replacement
observations, discarded failures, outlier removal, early successful stopping,
statistics, or pooling. A failed or rejected interval remains in its raw
artifact. The fixed order is not counterbalanced and is therefore another
reason these two observations cannot support a comparative speed claim.

## Phase definitions

Every phase uses injected monotonic nanoseconds. Every clock read, settlement,
incomplete interval, and serialized execution failure is retained. The outer
`runner_total` interval encloses all lane-specific intervals.

For Crawlee:

- `browser_launch` runs from the exact browser-launch invocation through its
  settlement;
- `browser_resident_workload` runs from successful launch settlement through
  the first browser-close invocation; and
- each `browser_close` runs from that close invocation through its settlement.

For Stasis:

- `pool_creation` covers pool creation invocation through settlement;
- `acquire_open` covers `pool.run` invocation through entry into the unchanged
  work callback;
- `settle_extract` covers work-callback entry through callback settlement;
- `release_physical_cleanup` covers callback settlement through settlement of
  the enclosing `pool.run`; and
- `pool_close` covers pool-close invocation through settlement.

Adjacent Stasis phases must be continuous where their predecessors settle, all
phases must lie within their lane's outer interval, and Crawlee's workload
window must meet the successful launch and first close boundaries exactly.
Phase durations may be summed only within one observation after explicit
non-overlap validation. A phase duration is not a benchmark sample and may not
be combined across lanes, hosts, or runs.

## Semantic and offline gates

The runner writes exactly three lane/composition files with no-clobber
semantics. The composer requires:

- the unchanged comparison authority bytes before and after execution;
- exact comparison release and artifact-binding identities;
- Crawlee then Stasis ordinals and runner identities;
- exact workload and correctness equivalence to the sealed crawl oracle;
- complete interval ordering and non-overlap; and
- all authority, timing, statistics, comparison, and optimization eligibility
  fields to remain false.

The offline verifier reads each of the three diagnostic files and the two
comparison inputs once as stable, canonical, distinct regular files. It rejects
symlinks, path aliases, file-identity collisions, mutations during a read,
extra diagnostic inventory, noncanonical JSON, and a preexisting output. It
replays the semantic composition from the exact authority bytes and creates
`diagnostic-verification.json` only after all gates pass.

## Actions artifact policy

The workflow creates and validates the bounded outcome before any Actions
upload. It then seals one outcome-dependent local bundle and makes exactly one
`actions/upload-artifact` invocation:

- artifact name: `stasis-v0.3.3-crawl-phase-diagnostic-bundle-attempt-1`;
- availability: `outcome_dependent`;
- for `VALID_NON_AUTHORITATIVE`, exact six-entry ZIP inventory:
  `comparison-input-verification.json`,
  `crawl-phase-crawlee-raw.json`,
  `crawl-phase-localization-evidence.json`,
  `crawl-phase-stasis-raw.json`,
  `diagnostic-outcome.json`, and
  `diagnostic-verification.json`;
- for `DIAGNOSTIC_INVALID_WITH_STATUS`, exact one-entry ZIP inventory:
  `diagnostic-outcome.json`; and
- if outcome creation or bundle sealing fails, no upload is attempted.

There are no optional entries, logs, environment dumps, raw error messages, or
stack traces. Terminal failure propagation is skipped only when outcome
creation, bundle sealing, and upload all succeed and the outcome status is
`passed`. A typed diagnostic-invalid outcome is retained first and then makes
the job fail. Any outcome-creation, sealing, or upload failure also makes the
job fail.

The only publishable terminal run conclusions are `success` for the exact
valid-bundle step topology and `failure` for an exact status-bundle or
no-artifact topology. A status bundle requires one visible preparation failure,
all later preparation steps skipped, successful outcome creation, sealing, and
upload, and a failing terminal propagation step. A no-artifact outcome requires
the first failing tail step to be outcome creation, sealing, or upload, with
later inapplicable tail steps skipped, failing terminal propagation, and zero
retained artifacts. GitHub terminal conclusions `action_required`, `cancelled`,
`neutral`, `skipped`, `stale`, `startup_failure`, and `timed_out` are
deliberately unpublishable; they do not authorize a publisher-derived
infrastructure outcome.

The sole outcome-specific upload removes cross-artifact partial-order states.
It does not make a failed upload action proof that no remote artifact exists:
the action or GitHub transport may fail after transferring some or all bytes.
Zero retained artifacts is the only no-artifact infrastructure state. Any
artifact state that is duplicated, partial, unexpected after an upload failure,
or does not have the exact class-specific inventory and bytes above is
ambiguous, protocol-invalid, and unpublishable. It may not be repaired by
synthesizing an outcome, reinterpreting files, rerunning, or replacing the
observation.

The canonical status schema is
`stasis-v0.3.3-performance-crawl-phase-diagnostic-outcome-v1`. Every status has
the exact fields `schema`, `status`, `outcomeClass`, `phase`, `runAttempt`,
`evidenceArtifactEligible`, `authorityEligible`, `timingEligible`,
`statisticsEligible`, `comparisonEligible`, `optimizationEligible`,
`generalizedSpeedClaimAuthorized`, `implementationWorkAuthorized`,
`decisionState`, and `failure`.

The outcome classes are:

- `VALID_NON_AUTHORITATIVE`: status `passed`, phase `complete`, attempt `1`,
  evidence eligible, failure `null`, and every authority/claim flag false;
- `DIAGNOSTIC_INVALID_WITH_STATUS`: status `failed`, evidence ineligible, and a
  safe failure object `{ "code": <code>, "messageOmitted": true }`. The only
  phase/code pairs are `input_verification` / `INPUT_VERIFICATION_FAILED`,
  `diagnostic_execution` / `DIAGNOSTIC_EXECUTION_FAILED`, and
  `offline_verification` / `OFFLINE_VERIFICATION_FAILED`; and
- `INFRASTRUCTURE_INVALID_NO_ARTIFACT`: publisher-derived only when the run
  conclusion is exactly `failure`, the retained steps prove one recognized
  outcome-creation/sealing/upload tail failure topology, and the run retained
  zero bundle artifacts. It is never synthesized as a successful observation
  and has no Actions artifact. Every other terminal conclusion remains
  unpublishable.

Every class keeps `authorityEligible`, `timingEligible`,
`statisticsEligible`, `comparisonEligible`, `optimizationEligible`,
`generalizedSpeedClaimAuthorized`, and `implementationWorkAuthorized` false,
with decision state `STAY_0_4_UNASSIGNED`.

## Outcome-specific publication inventories

The immutable diagnostic-evidence release must contain exactly one of the
following sorted inventories. `privacy-scan.json` scans every payload asset;
`SHA256SUMS.txt` covers every other release asset and omits itself. No extra
asset is permitted.

For `VALID_NON_AUTHORITATIVE`, exactly 22 assets:

- `SHA256SUMS.txt`
- `actions-diagnostic-bundle.zip`
- `comparison-artifact-binding.json`
- `comparison-evidence-release-commit.json`
- `comparison-evidence-release.json`
- `comparison-fresh-crawl-raw.json`
- `comparison-input-verification.json`
- `contract-commit.json`
- `contract-release.json`
- `crawl-phase-crawlee-raw.json`
- `crawl-phase-localization-evidence.json`
- `crawl-phase-stasis-raw.json`
- `diagnostic-artifact-binding.json`
- `diagnostic-outcome.json`
- `diagnostic-verification.json`
- `hosted-provenance.json`
- `privacy-scan.json`
- `workflow-artifacts.json`
- `workflow-jobs.json`
- `workflow-run.json`
- `workflow-runs.json`
- `workflow-source-commit.json`

For `DIAGNOSTIC_INVALID_WITH_STATUS`, exactly 17 assets:

- `SHA256SUMS.txt`
- `actions-diagnostic-bundle.zip`
- `comparison-artifact-binding.json`
- `comparison-evidence-release-commit.json`
- `comparison-evidence-release.json`
- `comparison-fresh-crawl-raw.json`
- `contract-commit.json`
- `contract-release.json`
- `diagnostic-artifact-binding.json`
- `diagnostic-outcome.json`
- `hosted-provenance.json`
- `privacy-scan.json`
- `workflow-artifacts.json`
- `workflow-jobs.json`
- `workflow-run.json`
- `workflow-runs.json`
- `workflow-source-commit.json`

For `INFRASTRUCTURE_INVALID_NO_ARTIFACT`, exactly 15 assets:

- `SHA256SUMS.txt`
- `comparison-artifact-binding.json`
- `comparison-evidence-release-commit.json`
- `comparison-evidence-release.json`
- `comparison-fresh-crawl-raw.json`
- `contract-commit.json`
- `contract-release.json`
- `diagnostic-outcome.json`
- `hosted-provenance.json`
- `privacy-scan.json`
- `workflow-artifacts.json`
- `workflow-jobs.json`
- `workflow-run.json`
- `workflow-runs.json`
- `workflow-source-commit.json`

The hosted verifier must retain complete REST snapshots for the contract and
comparison releases and commits, `S1`, the selected run, all matching workflow
runs, its sole job, and its zero-to-one Actions artifact. It must prove there
was exactly one attempt-1 invocation, verify source and mirror bytes, bind each
downloaded Actions ZIP to its API digest and exact inner inventory, and enforce
the chronology above before any publication class is assigned.

## Claim and causal boundary

All outputs are non-authoritative. They may report the observed interval
decomposition for this one sequential pair, but they may not report or imply a
new Crawlee/Stasis ratio, median, ranking, winner, generalized speed result,
population estimate, optimization approval, or replacement comparison.

Decomposition localizes observed elapsed time; it does not prove a causal
counterfactual. In particular, a large `release_physical_cleanup` interval can
support the hypothesis that physical shutdown ownership deserves a controlled
test, but it cannot prove that WebRender shutdown—or any other subsystem—caused
the comparison difference. Host state, fixed order, and all other uncontrolled
differences remain possible explanations.

Any product optimization requires a separate protocol published before its
experiment. That protocol must change exactly one hypothesized factor between
control and treatment, retain all other candidate, corpus, correctness,
lifecycle, timing, host, and cleanup boundaries, preregister independent-host
sampling and analysis, retain every failure, and include a deterministic
regression for the proposed lifecycle invariant. Until such treatment/control
evidence exists, implementation work and generalized speed claims remain
unauthorized and the decision is `STAY_0_4_UNASSIGNED`.
