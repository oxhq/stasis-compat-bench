# Stasis v0.3.3 performance replication v1

Status: `preregistered; replication trigger not pushed`

This protocol independently repeats the two already-published, single-host
Stasis v0.3.3 performance tracks. It asks two separate questions:

1. Can the exact Windows Cypress/RWA protocol complete as a new valid authority
   on a fresh GitHub-hosted Windows VM, and is its host-level direction again
   Cypress-over-Stasis greater than `1`?
2. Can the exact Ubuntu Crawlee/Stasis protocol complete as a new valid
   authority on a fresh GitHub-hosted Ubuntu VM, and is its host-level direction
   again Crawlee-over-Stasis less than `1`?

The replication does not preregister numeric equality, a tolerance around the
published ratios, a pooled result, or a winner. An opposite-direction valid
result is evidence and must pass the replication verifier. It may not be
replaced.

This contract and its successor verifier are published before measurement at
the immutable tag
`stasis-v0.3.3-performance-replication-contract-v1`. A valid result is later
published separately at
`stasis-v0.3.3-performance-replication-evidence-v1`; the result tag cannot be
used as evidence that the contract preceded execution.

The contract release must be non-draft, non-prerelease, and immutable. Its tag
targets one direct child of `c5678b...`, and its exact release inventory is the
single asset `stasis-v0.3.3-performance-replication-v1.md`. The hosted verifier
retains the release and target-commit API records and requires the release
publication instant to precede both creation and start of the replication run.

## Published observations being repeated

The immutable public input is release
`stasis-v0.3.3-performance-evidence` in `oxhq/stasis-compat-bench`, targeting the
parentless harness commit
`c5678b045852a29b89ed4b853da0aa39e6e3bf06`, tree
`4e491acd7d781878a5e84f57ac769e863ee58ac2`.

The original producer is `oxhq/stasis` workflow run `33851425108`, attempt `1`,
at revision `54dde177fe63c34ca1c5059a1381fd7434585f77`. Its relevant jobs are:

- validation: `100954874545`;
- Windows RWA: `100954904056`;
- Ubuntu crawl: `100954904065`; and
- combine/replay: `100957175132`.

The public inputs have these exact SHA-256 digests:

| Asset | SHA-256 |
| --- | --- |
| `rwa-raw.json` | `98c938f7070c6f45d1e2b2d37632eb5180d7c1b1d48d2eb84db9e26b6c22092d` |
| `crawl-raw.json` | `7db718346d73e3acf3b6919f20318929e60e2a15d5c5f954f849a6b46fa054db` |
| `combined-evidence.json` | `088c8a7b3f536be2790dbe339b303a7b8276d2ad70678138dac4e64e5fbbbf70` |

The published host-level median paired ratios are `4.479108` for
Cypress/Stasis on the RWA track and `0.929559` for Crawlee/Stasis on the crawl
track. Those values are observations, not acceptance thresholds.

## One-shot hosted invocation

The authoritative runner and workflow remain byte-for-byte unchanged. The only
new `oxhq/stasis` commit is the empty trigger commit
`6c7a6013e00584c8cb8d54c80cee5dbbcf3ca1b9`, with:

- parent `54dde177fe63c34ca1c5059a1381fd7434585f77`;
- tree `f1a97eb551569ca412b3f11fabd18c87be8c2a84`; and
- `.github/workflows/stasis-v0.3.3-performance-evidence.yml` Git blob
  `e31601363f2506df87f05a585f8adb0c790c5481`.

The commit is pushed once to
`refs/heads/codex/stasis-v033-performance-evidence`. The workflow must observe a
`push` event and `GITHUB_RUN_ATTEMPT=1`. GitHub's rerun controls are not
replication authority. A failed, cancelled, incomplete, or directionally
discordant run remains retained and is never replaced by another run under
this protocol.

The unchanged workflow checks out the exact public harness commit `c5678b...`.
The successor commit containing this protocol and the replication verifier is
never used as either measured runner.

## Fresh-host boundary

The new measurement jobs must be separate GitHub-hosted jobs on `windows-2022`
and `ubuntu-22.04`, with new run and job IDs. Each receives a fresh VM and
performs fresh checkouts, dependency installation, candidate extraction, RWA
build, queues, browser/native processes, and artifact-root creation. No Actions
cache, prior workspace, prior raw result, restored browser state, or generated
benchmark artifact is an input.

The retained host facts and instance digests must validate and differ from the
published raw artifacts. This rejects a copied raw artifact, but it is not a
cryptographic proof of different physical hardware: the Windows instance
digest and Linux boot-instance digest use independently generated salts. The
fresh-host claim is therefore limited to new GitHub-hosted VM jobs with distinct
provenance. CPU, runner image, and EGL-package differences are disclosed as
host-class differences, never normalized away.

## Frozen measurements

The original protocols remain the only measurement definitions:

- `protocol/stasis-v0.3.3-performance-rwa-v1.md`;
- `protocol/stasis-v0.3.3-performance-crawl-v1.md`.

Both tracks retain their exact software and corpus identities, one untimed
warm-up per implementation, ten timed alternating `AB, BA` pairs, one external
monotonic timing boundary, and complete cleanup inside each measured promise.
Every RWA lane must remain supported `8/8`; every crawl pair must remain exact
equivalent `20/20`. All raw observations and failures are retained. There are
no retries, replacement samples, added sleeps, fallbacks, discarded failures,
outlier removal, extra warm-ups, or early successful stopping.

The RWA generated production build is the single expected portable-byte
exception because its instrumentation embeds its absolute checkout path. The
existing wrapper must independently discover it outside timing and prove exact
startup/postflight byte continuity on the same server processes.

## Independent replication receipt

After the one-shot run is terminal, the successor evidence chain consumes six
exact JSON documents: the public and fresh RWA wrappers, crawl raws, and
combined evidence files. Every document is read once as bytes; its SHA-256 and
canonical JSON value are derived from that same read. The three public hashes
must equal their published release digests. The chain also consumes complete
REST snapshots for the selected run, all runs of the workflow on the measured
branch, jobs, artifacts, the immutable contract release, and its target commit,
plus the exact seven downloaded Actions artifact ZIPs. It must:

1. invoke the existing full JavaScript raw/wrapper validators;
2. replay both combined evidence files from their corresponding exact raws;
3. reject reused run, job, workflow-source, and instance identities;
4. prove that exactly one attempt-1 push run exists at the preregistered fresh
   SHA and that the immutable contract release predates it;
5. hash all seven artifact ZIPs against their API records, validate the exact
   raw/combined ZIP entry inventories, and require the lane raws to be
   byte-identical to the copies in the combined artifact;
6. compare immutable scientific projections while allowing only new hosted
   provenance, retained host facts, timing triples, and the explicitly
   path-derived RWA build projection to differ;
7. recompute each original and fresh host's statistics independently from exact
   integer timing values;
8. emit separate RWA and crawl outcomes; and
9. expose no cross-host or cross-track aggregate.

The output vocabulary is:

- `REPLICATION_INVALID`: any freshness, identity, schedule, correctness,
  cleanup, or raw validation gate fails;
- `PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_CONCORDANT`: the fresh authority is
  valid and its median paired ratio is on the original side of `1`; or
- `PROTOCOL_REPLICATION_VALID_DIRECTIONALLY_DISCORDANT`: the fresh authority is
  valid and its median paired ratio is on the opposite side of `1` (a ratio
  exactly equal to `1` is also non-concordant and must be reported explicitly).

The ten pairs are nested observations on one host, not ten independent hosts.
The original and fresh host results remain separate. Even two valid host-level
observations do not support a general speed, population-variance, production,
or formal-equivalence claim.

## Verifier invocation

The tagged successor exposes one exact CLI with three fail-closed modes. Every
path is absolute, every input and output path in a mode is distinct, and an
existing output is never replaced:

```text
npm run performance:replication -- verify-raws <original-rwa> <original-crawl> <original-combined> <fresh-rwa> <fresh-crawl> <fresh-combined> <replication-verification.json> <replication-report.md>
npm run performance:replication -- verify-hosted <workflow-run.json> <workflow-runs.json> <workflow-jobs.json> <workflow-artifacts.json> <contract-release.json> <contract-commit.json> <hosted-provenance.json>
npm run performance:replication -- verify-artifacts <replication-verification.json> <hosted-provenance.json> <source-metadata.zip> <rwa-raw.zip> <rwa-logs.zip> <crawl-raw.zip> <crawl-logs.zip> <combined.zip> <combined-logs.zip> <artifact-binding.json>
```

Receipt files are promoted only after fsynced sibling staging and no-clobber
linking. The semantic receipt is promoted after its Markdown companion. This
provides per-file atomic visibility, not crash-atomic multi-file publication;
the later immutable release is the publication transaction.

## Valid-result publication inventory

If the fresh run is protocol-valid, publish an immutable replication release
with exactly these 28 assets:

- `original-rwa-raw.json`, `original-crawl-raw.json`, and
  `original-combined-evidence.json`;
- `fresh-rwa-raw.json`, `fresh-crawl-raw.json`,
  `fresh-combined-evidence.json`, `fresh-combined-evidence.md`,
  `fresh-combined-verification.json`, and
  `fresh-independent-statistics-replay.json`;
- `replication-verification.json`, `replication-report.md`,
  `hosted-provenance.json`, and `artifact-binding.json`;
- `contract-release.json`, `contract-commit.json`, `workflow-run.json`,
  `workflow-runs.json`, `workflow-jobs.json`, and `workflow-artifacts.json`;
- `actions-source-metadata.zip`, `actions-rwa-raw.zip`,
  `actions-rwa-logs.zip`, `actions-crawl-raw.zip`,
  `actions-crawl-logs.zip`, `actions-combined.zip`, and
  `actions-combined-logs.zip`;
- `privacy-scan.json`; and
- `SHA256SUMS.txt`.

`privacy-scan.json` covers the 26 payload assets other than itself and the
checksum file. `SHA256SUMS.txt` covers the other 27 assets and explicitly omits
itself. No unlisted release asset is allowed.

An invalid fresh run is never relabelled or replaced. It publishes a
machine-readable `REPLICATION_INVALID` manifest, the complete API snapshots,
and every artifact actually retained by the failed first run, with no median,
ratio, ranking, or successful-replication label.

## Separate crawl phase diagnostic

Phase decomposition is not measurement authority and cannot delay, alter, or
repair the one-shot replication. It runs only after the authoritative raw crawl
artifact has been sealed, in a successor harness path with
`authorityEligible: false` and `timingEligible: false`. The raw authoritative
artifact is hashed before and after diagnostics and must remain byte-identical.

Diagnostics may localize startup/session acquisition, settle-and-extract
workload, lease/session/native-process cleanup, and pool drain; they must retain
interval overlap and failures. They cannot contribute samples or statistics,
remove observations, trigger a replacement authority, or by themselves prove
causation. A causal product change still requires a separately preregistered
one-variable treatment/control and deterministic regression.

Decision state remains `STAY_0_4_UNASSIGNED`. Neither a generalized speed claim
nor product optimization is authorized by this protocol alone.
