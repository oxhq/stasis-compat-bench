# stasis-post-0.3-census-v1 — erratum 2

This erratum repairs the aggregate representation of causal root clusters after
the first repaired wild rerun completed all paired observations but failed
before writing its summary and artifact index. A pre-execution provenance audit
also found that the proposed v4 envelope could rewrap unchanged records from
that failed attempt. This erratum therefore adds runner-enforced generation and
paired-start binding without changing the frozen corpus, selection order,
candidate, SDK, profile, network policy, browser baseline, concurrency,
retry/fallback rules, settlement policy, extraction, classification, blocker
families, or decision thresholds.

## Failed repaired attempt

The failed repaired attempt is retained immutably under artifact run ID
`wild-paired-a7ffd90-authoritative-rerun`.

- harness commit: `a7ffd90f0ad8c91aa5122564f0e8bb1cbc34750f`
- artifact-root tree SHA-256:
  `c52da858d83805afbce5562db790ec5c8cfaac1d609bd6663bce86770a04f836`
- artifact-root inventory: 501 files, 919419 bytes
- `wild/` tree SHA-256:
  `3e0821951ad3c2aaae7c49798cd53de800e4faf3cbfb61f4d3d2b77e0d6d841e`
- `wild/` inventory: 500 files, 917410 bytes
- `wild/raw/` tree SHA-256:
  `121e66abe6672e2bd5aa3ed3659eb9742a02a9ed06f865d4775ea3a9e5e3c2ab`
- `wild/raw/` inventory: 400 files, 820069 bytes
- `wild/cases/` tree SHA-256:
  `c92a3876d74d10f44d238e33fa37aea4fee0a62d9ae55dd778552f3ccee6e946`
- `wild/cases/` inventory: 100 files, 97341 bytes
- network-policy smoke SHA-256:
  `39903873565415280c73db5cd6f2774b1ed32cb4d95912653bb3556b02efd0d7`
- summary written: no
- artifact index written: no
- decision-eligible denominator: 0
- evidence weight: 0

Tree identities use depth-first traversal. At each directory, entries are
ordered by `name.localeCompare(otherName, "en")`, directories are descended
immediately, and regular files are framed as
`forwardSlashRelativePath NUL decimalSize NUL fileSha256 LF`.

All 100 slots produced fresh adjacent baseline and Stasis observations, and all
100 stored classifications rederive from their raw records. Those records are
diagnostic only. They cannot be reused, copied, selectively retried, pooled into
a denominator, or cited as authoritative product or roadmap evidence.

A read-only reconstruction of the uncommitted aggregate had canonical pretty
JSON SHA-256 `c6c0afc4c25d4cab39cdddf42f61c321d46d56901d482a73bdfda13ab09514ea`
and 7071 bytes. Its zero-weight diagnostic counts were:

- baseline excluded: 3; Stasis attempted: 97; reconstructed valid pairs: 92;
- primary classes: 81 `PROFILE_UNSUPPORTED`, 11 `SDK_GAP`, 5
  `BENCHMARK_INVALID`, and 3 `BASELINE_FAILURE`;
- diagnosed organic blockers: 63, all storage — 24
  `unsupported_persistent_cookie` and 39
  `unsupported_cookie_same_site_context`;
- storage manifestations by the five frozen strata: 13, 17, 11, 12, and 10;
- unconfirmed terminals: 16 `unsupported_work` and 2
  `navigation_authority_changed`;
- invalid terminals: 3 `invalid_controlled_cookie` and 2
  `unclassified_error`;
- successful extraction SDK gaps: 11, of which 10 were equivalent and 1 was
  divergent.

These counts disclose why serialization reached the rejected keys; they remain
outside every release and roadmap denominator.

The terminal was in the harness after observation: aggregate summary privacy
serialization rejected a dynamic causal-cluster object key containing the
machine term `cookie`. The case records already store the same controlled
machine text safely as a value. No Stasis session, browser baseline, extraction,
or classification operation caused this terminal.

## Repair

`organicRootClusters` changes from a map whose dynamic property names are
causal-cluster IDs to a deterministically sorted array. Each record carries the
same `rootClusterId` as ordinary data together with its primary class, blocker
family, diagnosis confidence, first terminal, manifestation count, independent
origin identities, and stratum counts. Sorting is by UTF-8 bytes of
`rootClusterId`.

This removes data-dependent property names without weakening the privacy key
firewall and does not merge, split, reclassify, or reweight any cluster.

The smoke command now atomically claims a previously absent artifact root before
launching Stasis and writes `stasis-wild-network-policy-smoke-v2`. It creates a
256-bit random run generation and binds it to the SHA-256 of the canonical local
artifact-root path. Moving or renaming the bundle invalidates authoritative
postflight verification; its indexed bytes and hashes remain independently
inspectable, but a relocated copy cannot mint roadmap authority.

The paired command atomically claims `wild/` and writes
`wild/paired-start.json` before any baseline or Stasis observation. That claim
contains a second 256-bit random nonce, the smoke generation and exact smoke
reference, and the paired start instant. Any crash after either atomic claim
burns that root or lane: it cannot be resumed or retried, and a new artifact
root plus new smoke is required.

Raw gate, observation, and case-classification records move from v2 to v3 and
embed the complete paired-start value. Baseline and Stasis gates use distinct
schemas so their phases cannot be substituted. Postflight requires the same
paired value in all 500 records, the same generation and references in the
smoke, paired-start, summary, and index, and
`smoke.completedAt <= paired.startedAt`. Unchanged v2 records from either prior
attempt therefore cannot be admitted by a v4 result.

The admissible rerun uses `stasis-wild-summary-v4` and
`stasis-wild-artifact-index-v4`. No valid v3 summary/index pair exists, so v3 is
not an accepted result envelope and cannot mint decision authority. Exact
inspection of the original retained v2 invalid attempt remains non-authoritative.

## Admissible rerun

One fresh rerun is admissible because neither retained attempt produced a valid
paired result index or decision-eligible denominator. It must:

1. commit this erratum and the aggregate-shape repair before execution;
2. begin at frozen slot 1 in a new artifact root;
3. run a new exact-candidate network-policy smoke in that root;
4. atomically claim the paired lane before executing all 100 slots in order with
   fresh adjacent baseline and Stasis observations;
5. bind both runner generations, both prior attempts, both errata, the unchanged corpus and preflight
   ledger, candidate, SDK, profile, runtime, policy, and smoke;
6. recheck the clean repository, both errata, smoke, complete inventory, and all
   indexed bytes before decision authority is granted and the root is declared
   quiescent.

The prior v2 and failed v3 attempts remain immutable, visible, and zero-weight.
Their raw observations and baselines may not be reused in the v4 rerun.

## Proof boundary

These bindings prevent stale or accidental replay, mixed generations, phase
substitution, concurrent paired runners, and retry after an official runner has
claimed a root or lane. The frozen clean runner code provides the operational
baseline-before-Stasis adjacency; local wall-clock fields are not treated as a
trusted chronology for every phase.

Ordinary postflight verification is inspection-only. Only the quiescent
verification entry point, invoked after the paired process has exited with the
explicit root-quiescence assertion, can brand a v4 result for decision use.

This is local harness-integrity evidence, not cryptographic execution
attestation. An operator who can fabricate every local artifact, clock, nonce,
canonical artifact-root path, quiescence assertion, and hash can fabricate a
coherent bundle. Strong adversarial freshness would require an external signed
challenge or append-only attestation service, which is outside this census.
