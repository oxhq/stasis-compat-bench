# stasis-post-0.3-census-v1 — wild-web lane

Status: `preregistered; selection pending`

An initial live preflight produced no admissible corpus: its output retained
local executable locations and an opaque redirect query. Those bytes were
quarantined outside the repository, receive zero evidence weight, and are not
edited or reused. Selection restarts only from the later privacy-hardening
preregistration commit.

This diagnostic lane asks which public-web execution sources block the exact
Stasis 0.3 candidate. It does not claim web determinism or performance and it
does not decide in advance that browsing-context trees should be Stasis 0.4.
The unchanged RWA and deterministic Crawlee lanes remain separate inputs to
that roadmap decision.

## Frozen identities

- Stasis source revision: `cd471fb2f515e1f7227581fb8930e04bd6414767`.
- Hosted Windows executable SHA-256:
  `bd6715f5cc30ec66ea2d3b9c0889698ecea54373a3c3ab2c1893c934573916d1`.
- `@oxhq/stasis@0.3.0` package SHA-256:
  `56bd1860c0f1b4a05a32feb6ee41e71ff1c5947dbe44c2c4e30a31ca40b6bbb4`.
- Node: `22.20.0`; Crawlee: `3.18.1`; Playwright: `1.62.1`.
- Runtime executable locations are never retained. Reproducibility records the
  pinned executable basename, byte length, and SHA-256 instead.
- Public source: permanent Tranco list `74V4X`; the ignored one-million-row
  input must match `corpora/tranco-74V4X-source.json` byte-for-byte by length
  and SHA-256. Every selected or excluded ledger domain is re-derived from the
  verified source row at its recorded rank; internally consistent rewritten
  rank/domain pairs are invalid.

## Selection

The denominator is 100 HTTPS root URLs, 20 from each frozen popularity stratum:

| Stratum | Ranks | Quota | Maximum observed candidates |
| --- | ---: | ---: | ---: |
| `rank-1-1000` | 1–1,000 | 20 | 250 |
| `rank-1001-10000` | 1,001–10,000 | 20 | 250 |
| `rank-10001-100000` | 10,001–100,000 | 20 | 250 |
| `rank-100001-500000` | 100,001–500,000 | 20 | 250 |
| `rank-500001-1000000` | 500,001–1,000,000 | 20 | 250 |

Within each stratum, candidate rank order is a full-cycle modular permutation.
Its offset and coprime stride are derived from SHA-256 of the frozen seed
`stasis-post-0.3-census-v1|tranco:74V4X` plus the stratum ID. Selection takes
the first 20 eligible observations in that order. It fails closed rather than
substituting another stratum when a quota is not reached.

Selection is baseline-only. No Stasis process may visit a public target until
the source metadata, this protocol, the complete preflight ledger, and the
100-entry selected corpus have been reviewed and frozen in a clean Git commit.
The preflight ledger records every attempted rank and a typed acceptance or
exclusion reason. Frozen readers require exact recursive shapes for the corpus,
runtime, permutation, entries, and stage-specific attempt evidence; unknown
fields are rejected, and downstream case artifacts reconstruct only the
validated corpus-entry projection.

An eligible observation must satisfy all of these rules:

- exact request is `https://<Tranco pay-level-domain>/`; there is no HTTP,
  `www`, path, mirror, or alternate-host fallback;
- the target passes the public-address gate, robots permits the root for
  `StasisCompatibilityCensus/1.0`, and no request retry occurs;
- a fresh headless Chromium context completes one read-only GET navigation;
- every observed HTTP(S) browser request passes the public-address gate;
- the final top-level URL is HTTP(S), credential-free, and resolves only to
  global addresses;
- top-level status is 200–399 and the resulting document is HTML or XHTML;
- the response is not an explicit CAPTCHA, Cloudflare challenge, robot check,
  access-denied page, or human-verification interstitial.

## Public-target safety boundary

Before admission, the harness rejects credential-bearing URLs, single-label or
reserved local hostnames, literal non-global addresses, DNS failures, and a
hostname for which any returned address is private, loopback, link-local,
carrier-grade NAT, documentation, benchmark, multicast, unspecified, or other
reserved space. Playwright applies the same check to each HTTP(S) request and
invalidates a page if a redirect, final host, or subresource fails it. Stasis
also receives first-match abort routes for obvious literal localhost and
private IPv4 URL prefixes.

This gate materially reduces accidental local-network access; it is not a
sandbox and is not proof against a malicious public origin, a browser exploit,
DNS rebinding between the harness lookup and the runtime's connection, or a
hostname-only Stasis subresource that changes to a non-global address. Runs
belong on an isolated, unprivileged host with no sensitive network reachability.

The crawl performs no click, form submission, authentication, CAPTCHA solving,
Cloudflare bypass, stealth, proxy, or residential-network behavior.

## Paired execution

The selected file order is the run order. For each URL, and before moving to
the next URL:

1. repeat the public-address and robots gates;
2. run one fresh, concurrency-one Crawlee `PlaywrightCrawler` observation with
   `maxRequestRetries: 0`, `retryOnBlocked: false`, and no persisted storage;
3. close its page and browser;
4. unless policy or safety rejected the URL, open one fresh native Stasis
   process/session using explicit `controlled-web-session-v2`;
5. call `settle()` once as the only progress primitive, retain a bounded
   sanitized settlement projection, optionally extract, and close fail-stop.

There is no sleep, DOM polling, retry, replay, proxy, stealth, or Chromium
fallback in the Stasis lane. Command, navigation, and wall-I/O timeouts are
reported safety boundaries. Unsupported work and execution limits are
terminals, never success.

## Extraction contract

Both engines return bounded evidence from one loaded document, but their URL
authority is not symmetric:

- both retain the exact canonical requested root URL because it is the frozen
  query-free replay input;
- derived HTTP(S) URLs are canonicalized with WHATWG URL semantics, retain the
  canonicalized query component and its parameter order, remove only the
  fragment, and are committed by hashing the UTF-8 bytes of
  `stasis-wild-url-identity-v1`, followed by one NUL byte (`0x00`), followed by
  the UTF-8 bytes of `canonicalUrl`;
- the baseline retains `finalUrlIdentity`, the commitment to Chromium's final
  top-level URL after navigation;
- Stasis retains `openCommittedUrlIdentity`, the commitment to the
  owner-attested URL returned by `session.open`; it is not interpreted as a
  post-settlement final/current URL;
- Stasis records `currentUrlObservable: false` because the frozen 0.3 SDK does
  not expose the current top-level URL after settlement. This is an SDK gap,
  not evidence that the committed open URL remained current;
- both collapse Unicode whitespace and trim the title, then retain only
  `titleIdentity`, Unicode code-point length, and UTF-8 byte length. The title
  commitment hashes the UTF-8 bytes of `stasis-wild-title-identity-v1`, followed
  by one NUL byte (`0x00`), followed by the UTF-8 bytes of the normalized title;
- baseline relative anchors are resolved against the full transient final URL;
  Stasis `resolved_url` values must already be absolute and are never rebased;
- credential-free HTTP(S) anchors are canonicalized with query preserved and
  fragment removed, de-duplicated before hashing, then their `linkIdentities`
  are sorted by code point. Query-distinct links therefore remain distinct;
- opaque request IDs are omitted. Persisted wild-census values pass a
  fail-closed exact-byte projection that rejects local paths/file URLs,
  credential-bearing or query/fragment-bearing raw URLs, embedded URL/path
  text, sensitive keys, untyped redaction markers, and unrecognized machine
  codes before those same serialized bytes are written. Browser/dependency
  errors pass through a closed projection before persistence.

Requested URL, title, and link-set comparisons remain diagnostic. Baseline
`finalUrlIdentity` and Stasis `openCommittedUrlIdentity` are separately
labelled commitments and do not support an exact final-URL equivalence claim.
The current-top-level-URL SDK gap is reported separately and receives no
blocker-prevalence weight.

These unkeyed digests are deterministic pseudonymous commitments for equality
and auditability, not anonymization or protection against dictionary attacks.
No raw title, derived link, derived final/open URL, executable location, or
absolute output path belongs in accepted wild artifacts or CLI result JSON.
This is a wild-lane publication boundary; legacy v0.2 proof artifacts have a
different path-retention contract.

There is no screenshot, DOM-byte comparison, recursive frontier, click, or
post-load polling. A native extraction bound reached before the link set is
returned is a typed blocker rather than permission to truncate one engine.

## Result model and roadmap use

Each URL keeps independent `baseline`, `stasis`, `comparison`, and
`classification` records. Robots/safety exclusions, live-site drift, baseline
navigation/HTTP/non-HTML failures, and challenge pages are not Stasis blockers.
Network/navigation ambiguity remains `web_compat_or_site_drift`; only
protocol/process/internal-runtime evidence is eligible for `engine_bug`.

Every frozen unit records at least:

- evidence validity and exact candidate/corpus/harness identities;
- exposure as `organic_primary`, `designed_negative_control`, or `diagnostic`;
- baseline disposition and Stasis disposition independently;
- the first terminal's phase, public code, typed surface, and bounded details;
- normalized root family, causal-cluster ID, and diagnosis confidence;
- whether that first terminal censored later sources or oracles.

Direct Stasis terminals are normalized only as far as their evidence permits.
Root families include `browsing_context_tree`, `worker`, `storage`,
`rendering_unknown`, diagnosed rendering subfamilies, `external_io`,
`open_ended_source`, `execution_limit`, `engine_correctness`, and `unknown`.
The broad `unsupported_rendering` terminal remains `rendering_unknown`; it is
not promoted to image loading or another rendering subtype without current
candidate source diagnosis or a minimized reproducer. Likewise, a generic
navigation or unsupported-work terminal is not promoted to tree or worker
without typed or confirmed provenance.

Only valid, organic-primary, final-baseline-passed, exact-candidate-attributable
first terminals enter blocker prevalence. Repeated manifestations count toward
affected-unit impact, while a causal cluster is merged only when the same
typed admission boundary and source diagnosis or minimized reproducer establish
one cause. Later sources and oracles remain censored until the unchanged unit is
rerun after the first blocker is removed. Semantic differences and SDK gaps are
reported separately and receive zero blocker weight. A baseline marked success
must carry the exact requested root, final-URL commitment, 200–399 HTML/XHTML
response evidence, complete title/link commitments, and bounded wall time before
any Stasis terminal can receive organic-blocker weight.

## Separate evidence tracks

The roadmap consumes three separate evidence tracks and never adds their raw
denominators or derives one pooled compatibility/blocker rate:

- RWA: eight unchanged application flows, measuring real-app flow depth;
- deterministic Crawlee: twenty designed primary pages, acting as a regression
  and capability gate rather than a prevalence sample;
- wild web: up to 100 frozen, baseline-eligible public roots, measuring breadth
  only within that selected population.

Designed iframe and worker controls remain outside every primary denominator
and have exactly zero prevalence weight. They test classification behavior,
not how often a source occurs organically. Each track reports manifestations,
independent origins, causal clusters, affected rate within its own eligible
denominator, and share within its own diagnosed blockers.

## Pre-registered 0.4 dominance gate

Context-tree is a candidate hypothesis, not a frozen 0.4 commitment. Let
`N_wild` be the wild units whose paired final baseline and exact-candidate
evidence remain valid, `B_wild` the diagnosed organic Stasis first-terminal
blockers among them, `T_wild` the confirmed context-tree subset, and `R_wild`
the runner-up root family. Tree authority earns the next architectural release
only when all of these conditions hold:

1. Every counted tree manifestation is typed or confirmed by current-candidate
   source diagnosis or a minimized reproducer; broad navigation failures remain
   `unknown`.
2. `T_wild >= max(10, ceil(0.10 * N_wild))`, with independent affected sites
   represented in at least three of the five popularity strata.
3. `B_wild > 0` and `T_wild / B_wild >= 0.30`.
4. Tree is the largest wild blocker family and beats `R_wild` by either at
   least `1.5x` manifestations or at least ten percentage points of diagnosed
   blocker share.
5. No comparably broad organic track identifies a conflicting material leader;
   RWA, deterministic, and wild results are compared as separate views rather
   than pooled counts.
6. At least two minimized current-candidate cases confirm the ownership
   boundary: one child-context creation/navigation/removal case and one nested,
   cross-origin, or cross-event-loop case.
7. The deterministic twenty-page primary corpus remains green with the exact
   hosted 0.3 SDK and executable under explicit `controlled-web-session-v2`.
8. Tree remains strategically eligible after reviewing the winning boundary.

If a strategically excluded family wins—for example workers or a deliberately
unsupported persistence boundary—the decision is an explicit `STAY` or roadmap
pivot, never automatic promotion of the second-place family. If tree misses any
gate, 0.4 remains unassigned while evidence is gathered or the actual eligible
leader is addressed. Timing is diagnostic only and cannot be presented as a
performance win.

The decision command is a local postflight over an owned, trusted artifact root.
Run it only after the paired runner has exited and no process can mutate that
root, and explicitly attest that precondition with
`STASIS_WILD_ARTIFACT_ROOT_QUIESCENT=1`. The verifier repeats the exact inventory
and every indexed file hash after semantic validation to reject accidental
in-process drift. Hostile concurrent writers and hard-link aliasing are outside
this run's proof boundary.
