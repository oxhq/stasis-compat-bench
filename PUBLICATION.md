# Public benchmark evidence

The public evidence release targets Stasis `v0.3.3` and is bound by
[`publication/release-identity.json`](publication/release-identity.json).
Every qualified field is backed separately by the package run, immutable
GitHub release, npm registry bytes, provenance/attestation record, publication
producer, and anonymous Linux and macOS verifier. Nulls are never estimated or
treated as evidence.

The frozen corpus inputs and product candidate are not changed for publication.
The first immutable evidence release also left runner semantics and evidence
classifications unchanged. The separately versioned successor correction below
keeps those corpus and product bytes fixed while changing the benchmark
runner's current-URL projection and the classifications derived from it. It
also adds typed-causality and cross-family packaging gates, and discloses all
of those evidence changes in its manifest. The post-support candidate
identity is the exact package-qualified `v0.3.3` candidate at revision
`48c5a718a9ddd63f496e45307e1484974ccf8587`, workflow run `33506181780`,
attempt `1`. That package evidence remains distinct from the immutable release,
signed npm publication producer, and anonymous-consumer verifier bound by the
public archive.

## Historical v4 publication sequence

1. Qualify the exact `v0.3.3` product revision, including both native Jammy
   stress lanes and all Linux, macOS, and Windows package, binding, provenance,
   and attestation gates.
2. Promote the immutable GitHub release, publish the exact
   `@oxhq/stasis@0.3.3` bytes, preserve the signed npm producer identity, and
   pass non-mutating anonymous native verification on Linux x86_64 and macOS
   arm64.
3. Bind the isolated post-support candidate and the complete qualified release
   identity to those observed facts.
4. Select and bind the repository license plus exact author/committer identity,
   project the declared source inventory, and create one clean parentless root
   commit with the canonical public `origin`.
5. From that exact clean root, run the one-shot unchanged 100-case wild lane and
   retain all 500 indexed case records. Copy the already retained unchanged
   cookie, deterministic, RWA, candidate, and baseline evidence without editing
   it.
6. Build and independently verify the evidence manifest, checksums, canonical
   archive, and generated report.
7. Publish exactly `stasis-compat-bench-v0.3.3-evidence.tar`, `report.md`, and
   `SHA256SUMS.txt`. The generated report copies raw counts from the verified
   manifest without pooling or reclassification.

A successful rerun is not a correctness argument. The release correction needs
its causal regression and the archive records the exact qualified run; it does
not convert repetition into proof.

## Successor current-URL evidence

The immutable `stasis-v0.3.3-evidence` tag, report, assets, and anonymous
verification remain unchanged. The successor defined by
[`protocol/stasis-post-0.3-census-v1-erratum-3.md`](protocol/stasis-post-0.3-census-v1-erratum-3.md)
uses the same product release identity and unchanged corpus/application bytes,
but fixes the wild observer to retain the privacy-projected identity of the
owner-attested `settle().url` already shipped in explicit
`controlled-web-session-v2`.

[`protocol/stasis-post-0.3-census-v1-erratum-4.md`](protocol/stasis-post-0.3-census-v1-erratum-4.md)
retains a zero-case, pre-smoke failure caused by claiming the first authority
directory before the ignored Tranco input was admitted. The replacement root
orders complete binding/runtime verification before the artifact claim and
permits exactly one replacement target; the failed target remains disqualified.

Before public-site execution, the successor requires four authoritative native
causal pairs in `evidence/typed-terminal-minimizers.json`: final-response and
redirect-hop `Partitioned` controls/treatments, and two independently
constructed 128/129 automation-match boundaries. Those minimizers are bound to
the immutable prior wild index and establish causality, not organic prevalence.

The successor uses the unmixed v5 wild evidence family and a new parentless
public source root. Its release contract is:

- tag: `stasis-v0.3.3-current-url-evidence`;
- archive: `stasis-compat-bench-v0.3.3-current-url-evidence.tar`;
- report: `report.md`;
- checksums: `SHA256SUMS.txt`.

The archive builder selects this contract only when the replayed manifest
discloses both changed runner semantics and changed classifications. Anonymous
verification rejects a mismatch between outer asset family and inner evidence
scope. A successful live run qualifies the frozen candidate/harness pair; the
deterministic regression and dual-family fail-closed verifier are the
correctness proof.

## Public source projection

[`PUBLIC_PROJECTION.json`](PUBLIC_PROJECTION.json) binds the historical private
source snapshot used by the retained path-projection receipt and a complete
path/size/SHA-256 inventory of every current projected tracked file except the
self-referential manifest. The successor corrections are bound by that current
root inventory; they are not claimed to be present in the historical source
snapshot. The manifest also binds every frozen corpus/protocol byte, the public
claim boundary, and the small exact-hash exception set for intentional
synthetic path/email literals.
Run `npm run publication:projection` before copying the tree. The public
repository must be one fresh root commit and must omit the declared historical
`artifacts/runs/` source exclusion; copying this checkout's Git history or that
directory is a failed projection.

The path-only edits below `test/fixtures/` remove workstation locations from
test inputs and rebind their fixture indexes. The exact source/projected byte
identities, allowed JSON pointers, normalized semantic hashes, one projected
log line, reconstructed source indexes, and decision-module hash bindings are
recorded in
[`publication/path-projection-receipt.json`](publication/path-projection-receipt.json)
and verified by `publication:projection`. They do not alter case outcomes,
counts, classifications, corpora, or protocols, and they are not substitutes
for the fresh `v0.3.3` evidence archive.

## Fresh archive layout

The historical v4 manifest requires this exact frozen 515-file layout. The
successor v5 manifest requires exactly 516 files by adding
`typed-terminal-minimizers.json`. Missing, additional, cross-family, or
differently named files below `evidence/` are rejected:

```text
publication-root/
  evidence/
    candidate-verification.json
    cookie-minimizers.json
    deterministic-comparison.json
    deterministic-playwright-raw.json
    deterministic-stasis-raw.json
    rwa-comparison.json
    rwa-cypress-raw.json
    rwa-stasis-raw.json
    typed-terminal-minimizers.json  (v5 successor only)
    wild-authority-extraction-receipt.json
    wild-authority.json
    wild-network-policy-smoke.json
    wild-stdout-transcript.log
    wild/
      artifact-index.json
      paired-start.json
      summary.json
      cases/  (100 classification records)
      raw/    (400 baseline/Stasis records)
```

Before capture, prepend the pinned Node executable's directory to `PATH` and
require `node --version` in that environment to report exactly `v22.20.0`;
npm child scripts resolve `node` through `PATH` even when npm-cli itself was
started by an absolute Node path. Capture the candidate and wild commands
through that repository-pinned Node and npm CLI with npm's script banner disabled, for example
`& $node $npmCli --silent run post-support:candidate` and
`& $node $npmCli --silent run post-support:wild`. Capture the first command as
`candidate-verification.json`. Retain the complete second command's stdout as
`wild-stdout-transcript.log` with the evidence; it must begin at byte zero with
the canonical smoke document and contain exactly the smoke, artifacts, and
final-authority JSON documents in that order. An ordinary `npm run` banner is
not evidence and makes the transcript invalid. Run
`npm run publication:extract-wild-authority --` with the absolute transcript,
`wild-authority.json`, and receipt paths to losslessly copy the validated final
document and write `wild-authority-extraction-receipt.json`. Copy the fresh
outputs produced by the cookie, deterministic, and RWA commands without editing
them. The v5 successor also requires the fresh authoritative typed-terminal
minimizer output. Copy the complete wild artifact root, including its
network-policy smoke record.

The two comparison baselines are retained as first-class evidence rather than
being implied by the generated comparison documents. Copy the already frozen
privacy-projected deterministic Playwright baseline byte-for-byte to
`evidence/deterministic-playwright-raw.json`. Project the exact frozen Cypress
baseline with `npm run publication:project-rwa-baseline --`, supplying one
absolute source path and one fresh absolute output path, then copy that output
byte-for-byte to `evidence/rwa-cypress-raw.json`. The projector permits exactly
the five declared host-path fields to change and requires the frozen source and
projected size/SHA-256 identities. Manifest construction and verification
require both raw baselines, hash them, and replay the deterministic and RWA
comparison claims from the retained candidate-plus-baseline raw evidence. The
RWA comparison's resolved cookie boundaries are independently replayed from
`evidence/cookie-minimizers.json`.

With the repository-pinned Node `v22.20.0` executable:

```powershell
$publicationRoot = Join-Path $env:TEMP 'stasis-v0.3.3-evidence'
$releaseAssets = Join-Path $env:TEMP 'stasis-v0.3.3-release-assets'
$verifiedExtraction = Join-Path $env:TEMP 'stasis-v0.3.3-verified-extraction'
npm run publication:projection
npm run publication:plan
npm run publication:build -- $publicationRoot
npm run publication:verify -- $publicationRoot
npm run publication:archive -- $publicationRoot $releaseAssets
npm run publication:archive:verify -- $releaseAssets $verifiedExtraction
```

For the successor, use fresh directories labelled for
`v0.3.3-current-url-evidence`. The manifest remains bound to the same qualified
product release identity; the archive and anonymous verifier automatically
select the successor asset contract from the exact v5 evidence scope and reject
cross-family packaging.

```powershell
$publicationRoot = Join-Path $env:TEMP 'stasis-v0.3.3-current-url-evidence'
$releaseAssets = Join-Path $env:TEMP 'stasis-v0.3.3-current-url-release-assets'
$verifiedExtraction = Join-Path $env:TEMP 'stasis-v0.3.3-current-url-verified-extraction'
npm run publication:projection
npm run publication:plan
npm run publication:build -- $publicationRoot
npm run publication:verify -- $publicationRoot
npm run publication:archive -- $publicationRoot $releaseAssets
npm run publication:archive:verify -- $releaseAssets $verifiedExtraction
```

`publication:build` requires a tracked-clean harness commit and a complete
qualified release identity. It rejects symlinks and other non-regular entries,
missing wild records, broken wild index hashes, candidate identities from a
different revision/run/archive, and machine-local paths in publishable text.
It writes deterministic `evidence-manifest.json` and `SHA256SUMS.txt` files.
`publication:verify` recomputes both from the retained bytes.
`publication:archive` deterministically emits the exact three release assets,
and `publication:archive:verify` requires a fresh extraction directory, rejects
any extra or missing asset, parses the canonical tar independently, and
re-verifies the extracted evidence against the public root revision and release
identity.

## Claim boundary

The report may state the exact deterministic, RWA, and wild counts embedded in
the generated manifest. It must also say all of the following:

- the deterministic primary corpus is 20 of 20 `PASS_EQUIVALENT`, with 20 of
  20 exact-equivalent and 20 of 20 behaviorally-supported cases; worker and
  iframe cases are separate typed negative controls;
- the RWA lane is 8 of 8 `PASS_WITH_SEMANTIC_DIFFERENCE`, with 0 of 8
  exact-equivalent and 8 of 8 behaviorally-supported frozen intents;
- this is compatibility evidence, not a performance comparison;
- the RWA lane measures the frozen application intents and must retain every
  disclosed semantic difference; it is not Cypress API equivalence;
- the wild lane is one preregistered sample and supports neither prevalence nor
  general web-support claims;
- baseline failures and benchmark-invalid cases remain visible, and no pooled
  success rate is computed across lanes;
- unsupported outcomes remain typed outcomes, not removed denominators;
- no application, corpus, retry, sleep, polling, or Chromium fallback was
  introduced for the publication run.
- the v5 successor discloses its current-URL observer/classification change and
  does not reclassify or pool the 15 historical v4 SDK-gap records;
- the four typed-terminal minimizers establish local causality only and do not
  claim additional organic origins or prevalence.

## Repository identity invariants

Publication tooling binds the selected SPDX license to one regular top-level
license file and requires its exact size and SHA-256. It also requires the sole
root commit's author and committer name/email to match the selected publication
identity. The verified tree is one fresh parentless commit so private source
history is never copied, and both `origin` URLs must identify the canonical
`oxhq/stasis-compat-bench` GitHub repository. Any mismatch fails publication
readiness.
