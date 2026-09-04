# stasis-post-0.3-census-v1 — erratum 4

Status: `preregistered replacement after nonexecuting input-admission failure`

This erratum records and corrects one harness lifecycle-ordering defect found
before the successor public-site corpus began. It does not change Stasis, the
current-URL observation correction, either shipped profile, any corpus entry or
order, the browser baseline, network policy, settlement policy, extraction
operation, typed minimizer, concurrency, or the zero-retry/no-fallback rule.

## Retained failed authority target

Parentless harness revision
`e654047dc97cfaab014b44902db2e101d6c589d9` attempted authority target
`post-v033-current-url-authoritative-01`. The network-policy smoke claimed the
fresh target directory and then failed while loading the frozen binding because
the ignored runtime input `inputs/tranco-74V4X-top-1m.csv` had not been
materialized in that new worktree.

The failure is retained with these exact boundaries:

- stdout transcript: 0 bytes, SHA-256
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;
- stderr: 1,838 bytes, SHA-256
  `07adc35593d3d0c5d48fd57342f187e075d28dcb048981bd1bcddc8e7297e6cb`;
- claimed artifact directory: zero files and zero evidence bytes;
- no network-policy smoke record, paired-start record, case record, summary, or
  artifact index was written; and
- zero public-site cases and zero Stasis public-site processes executed.

This target is disqualified and must never be reused, deleted, promoted, or
counted as corpus evidence.

## Causal correction

The smoke must now verify the complete frozen binding and ignored runtime
identity before it claims the fresh artifact directory. Only after the Tranco
source, frozen corpus, preflight ledger, clean repository binding, Node and
dependency trees, browser installation, and exact candidate are admitted may
the target directory be created and the synthetic smoke process begin.

A deterministic regression injects a binding failure and a runtime-identity
failure, then proves both occur before directory creation and before candidate
launch. This is lifecycle-ordering proof; a later successful run is not used as
proof of the correction.

The ignored Tranco source materialized for the replacement run must be exactly
22,695,497 bytes with SHA-256
`23f4686d95c1287765d43b4219eccb62a9575bbd5dbbd20d44fc280403135118`
and 1,000,000 rows. The binding independently rehashes and parses it before the
artifact claim.

## Replacement authority

One new clean parentless harness revision containing this erratum and regression
may use exactly one fresh target named
`post-v033-current-url-authoritative-02`. It must retain the same exact product
candidate, corpus SHA-256, runtime pins, baseline-before-Stasis adjacency, and
all erratum 3 comparison and version rules. Any pre-smoke failure of that target
is retained and terminal; no third target is authorized by this erratum.

The deterministic regression remains the correctness proof. The replacement
wild run can qualify only its exact frozen candidate/harness/environment tuple
and cannot establish performance, pooled success, prevalence beyond its
unchanged denominator, or correctness by repetition. `STAY_0_4_UNASSIGNED`
continues unless the retained typed cross-stratum evidence independently meets
the preregistered authority-selection criteria.
