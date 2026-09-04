# stasis-compat-bench-v1 — frozen proof contract

Status: `v1-preregistered`

The purpose of this proof is to determine whether the frozen Stasis candidate
can produce the same important application outcomes as two independent browser
workloads. It is not a speed contest. Performance measurements are diagnostic
only and cannot upgrade a compatibility result.

## Frozen identities

| Component | Exact identity |
| --- | --- |
| Stasis source candidate | Stable Git tree `eaafda92f062a063353376339e566999c5f8db43`; exact source commit `5d55c0cff33ea9baaf139c6f6aa31f538b69062e`; reconstruction base `68c99e29111050902a3f152af3ec03ad9c8a8b22` |
| Stasis Windows executable | SHA-256 `7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d` |
| Stasis local Windows archive | `stasis-0.2.1-windows-x86_64-local-5d55c0cf-r1.zip`, SHA-256 `1fdaefc03e36102b2741406584522c1a9aab786210926b5a093c9cda1eb117f4`; bundled LF `SOURCE.patch` SHA-256 `cc7cf7b8ede1e2d8cfbd42a8a60ea5b4846badc960e9b2d6b1a092e16d06176a` reconstructs tree `eaafda92f062a063353376339e566999c5f8db43` |
| Stasis SDK | `@oxhq/stasis@0.2.1`, npm integrity `sha512-tZH6tbEfGTgZgFGkrMYqsTSvxBVGOfAiwpuyvtcY1KYNqnOAzh5168d22aC2RkL4FgQqwNW4wlcoD05JFMd/2A==` |
| Cypress RWA | `cypress-io/cypress-realworld-app@28ca4d03e4c68d366ccdbb25d43e1f37b3c67a4d`; tree `04c8874fbdcfd56a4d6fb74e7810304622fe787f` |
| RWA auth input | `auth.spec.ts` Git blob `9554bac0826cb996c5bb4cab3c46d3ad81e2603c`, blob SHA-256 `1bdea574f3b9dd6c608522ddf698a72d2295963bb8e400ae27966d1fa011366d`; seed Git blob `9a785bdf968bfdc33d5ae8493ed544121254f4cf`, blob SHA-256 `694f9f9e955211cc6037a1d58eb020671375491ea670a3fcf6183a81a34da715` |
| RWA runtime | Node `22.20.0`, frozen `node.exe` SHA-256 `fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d` (85,588,976 bytes), Yarn `1.22.22`, Cypress `15.17.0`, bundled Electron `138.0.7204.251`, viewport `1280x1000`; fixed frontend `http://localhost:3000` and API `http://localhost:3001` |
| RWA production build | 10-file tree, 12,961,036 bytes, aggregate SHA-256 `769186804dfdda106af44894a8f9d065fe840db5835a1c515debff3e9c469a09` |
| RWA installed execution bytes | Full cache-empty `node_modules`: 122,620 files, 589,323,096 bytes, tree SHA-256 `44a4e04f3e98cbb195ad64d7ec701b215b46963fa1aca03b1a33f06882f9944e`; zero regular files are permitted under top-level `.cache`; Cypress npm tree `f4929d43bf3ec26924a90ed25ca5ae10f3d25431aec76c680352711ffceb7303`; ts-node tree `4f3b74021e24f701e1e2bf91d00311c955167dbd22818dc569991fe903db3a47`; Cypress runtime tree `894db056ca57f806054dcd97bddd0c49d3fd58d5a40ac8530eec6440a20c13c3`; `Cypress.exe` SHA-256 `3af48298e0deb0202601e18dbbb3c1ec0da29a18edd842528e83ea3e53126ecf` |
| RWA ignored runtime inputs | `src/aws-exports.js` must equal tracked `scripts/mock-aws-exports.js`, 597 bytes, SHA-256 `9964e06bade1826faf2676923983890049f5174a1409b73948033b4500930185`; `aws-exports-es5.js` must equal tracked `scripts/mock-aws-exports-es5.js`, 604 bytes, SHA-256 `9fb4c3d1a163d4a2c132d67ea56683368b8f6317cbc0485bfbd5b0c59700395e`; `.env*.local` must be absent |
| Crawlee | `crawlee@3.18.1`, git head `5dbdf0e0095235cf9128dbf0a34613f4cca5ce74`, npm integrity `sha512-NP/uod8hePPGFWs5dXS+rlIu+e2QypYnHCvagCOk6IGd0meVAeLT1qb1YBol+O9fOy96f6Rh/TmBSJ3uNQJcvA==` |
| Playwright browser | `playwright@1.62.1`; Chromium revision directory `chromium-1234`, browser `151.0.7922.34`, executable SHA-256 `409805a16d6416087e6b2f778df1cf8f7bbb267d6b99f6b5bb0a618eace234f2`; 311-file install tree SHA-256 `09593e8d073bbaac0a35703e86d0a1e2d7297d9adde76712b66235872c4ea77c` |
| Installed JavaScript tree | npm `10.9.3`, fresh `npm ci`; 11,454 files, 94,553,660 bytes, aggregate SHA-256 `57d66e9c964a071ed98ee124665e6735875e2a871bfadc3dad42d3d35a62e5fe` |
| Harness | The Git commit containing this contract, recorded in each run manifest |

The Windows checkout uses CRLF worktree conversion. Its expected worktree
SHA-256 values are `b5e2150c626b7c8e9849f70b25f143759a7fafaba1421e804bb94471fe748966`
for the auth spec and
`c2449435bbf44bcef412a178fb51b8561d3c2d7ba9fc55b10d0b8a09ea66c3a1`
for the seed. The manifest verifies both canonical Git objects and those local
bytes so line-ending conversion is explicit rather than mistaken for drift.

## Non-negotiable rules

- The Stasis candidate is frozen for a primary run. If a defect is fixed, all
  paired measurements restart under a new candidate identity.
- The RWA checkout is detached at its exact commit. No source, test, server,
  seed, configuration, or lockfile edit is admissible. The upstream server's
  own lowdb writes are runtime state, must be reset before each case, and the
  tracked database file must be restored to its pinned bytes after shutdown.
- Crawlee and Playwright package code is unchanged. The deterministic crawl
  corpus and adapters belong to this reviewer-owned harness.
- The primary command performs a fresh `npm ci`. The manifest and postflight
  both hash the complete harness dependency tree, the full cache-empty RWA
  dependency tree, selected runner package trees, the Node and Playwright
  Chromium executables, and the browser installation. A version string without
  matching installed bytes is invalid.
- RWA uses its own production build, unchanged `scripts/testServer.ts` and
  backend entrypoints, lowdb seed, and `/testData/seed` reset endpoint. The
  frozen harness host invokes both roles directly through the frozen ts-node
  package with absolute argv and a minimal environment; NYC coverage and its
  executable cache are outside this behavioral proof. Both runners target the
  same processes and data at the fixed localhost origins. The baseline binds
  ports 3000/3001 to the same frozen host and Node executable, then
  byte-compares all ten served frontend files with the frozen build tree.
  Local environment files or ambient behavior overrides invalidate the protocol.
- Primary scientific attempts have zero runner retries and zero fallback to
  Chromium from Stasis. A failed written mutation is never replayed.
- Stasis uses no sleeps, `waitForTimeout`, or DOM polling for progress. Its only
  progress primitive is `settle()`. A wall timeout is a safety boundary and is
  always reported.
- Cypress's configured retries are overridden to zero for the primary proof so
  both primary attempts have the same denominator. The unmodified configured
  value (`runMode: 2`) is recorded separately rather than silently exercised.
- Every case begins from a freshly seeded RWA database. Cypress retains its
  upstream test-isolation behavior inside the one baseline run; each Stasis
  case uses a fresh native process/session. The crawl uses a fresh request queue
  and storage.
- Unsupported work, fixture misses, missing cases, baseline failures, and
  harness errors can never be counted as success.
- Machine-readable observations are retained with the report after removing
  opaque authority tokens, cookie values, and ambient Cypress env/expose data.

## Result vocabulary

Every selected case receives exactly one primary classification:

```text
PASS_EQUIVALENT
PASS_WITH_SEMANTIC_DIFFERENCE
SDK_GAP
PROFILE_UNSUPPORTED
ENGINE_BUG
WEB_COMPAT_BUG
BASELINE_FAILURE
APP_MODIFICATION_REQUIRED
BENCHMARK_INVALID
```

`PROFILE_UNSUPPORTED` also records a typed surface such as `worker`, `iframe`,
`websocket`, `selector`, `pointer_input`, `navigation`, or `storage`.

## Track A — Cypress RWA authentication slice

The denominator is all eight `it(...)` cases in the unchanged upstream
`cypress/tests/ui/auth.spec.ts`, in source order. The baseline executes that
exact spec with zero retries. The Stasis side ports test intent into this
harness; it does not claim Cypress API compatibility.

The eight cases are unauthenticated redirect, remembered login, 30-day cookie
and logout, signup/onboarding/bank account/logout, login validation, signup
validation, invalid user, and invalid password for an existing user. All eight
remain in the denominator even if one is unsupported. Sixteen Percy snapshot
calls are excluded because they are visual diagnostics rather than independent
behavioral cases.

For each case, the pre-registered behavioral oracle includes the same relevant
subset of:

- final top-level path;
- required or absent semantic DOM text/elements;
- login/session cookie properties exposed by each public runner;
- relevant backend mutation or response status;
- fresh-database persisted state when the upstream case mutates it.

Visual snapshots, Cypress command-log shape, animation timing, full DOM bytes,
and implementation-specific request ordering are not equivalence oracles.

The Stasis port may use only public controlled-session operations: semantic
forms, activate, settle, query/text/extract, navigation, state, requests, and
evidence. It may call the upstream seed endpoint from the harness before a case,
just as the upstream Cypress task does. It may not invoke application-internal
React/XState objects, inject scripts, or call the business API instead of a UI
action being tested.

The public SDK does not expose computed visibility or the current path after an
application-driven same-document history change. A matching semantic DOM state
may therefore support `PASS_WITH_SEMANTIC_DIFFERENCE`, but cannot be promoted to
`PASS_EQUIVALENT` for an oracle that requires Cypress `be.visible` or
`cy.location()`. A persistent `Max-Age` or `Expires` cookie rejected by the
published session-cookie profile is `PROFILE_UNSUPPORTED`; the harness must not
remove or rewrite that cookie to continue the case.

## Track B — deterministic crawling

The primary corpus contains exactly 20 scheduled HTML pages reachable from one
start URL at depth at most two. It covers static links, canonical/fragment
de-duplication, `<base>` URL resolution, microtasks, finite timers,
requestAnimationFrame, fetch with both 200 and 503 responses, XHR plus
MutationObserver, cookies and local/session storage, same-document history,
top-level script navigation, and a reported persistent interval. All HTTP
inputs come from one immutable fixture manifest. Playwright route fulfillment
and Stasis `fixtures_only` routes are mechanically derived from that same
object. HTTP 3xx behavior is excluded from the primary denominator because the
exploratory fixture-layer semantics were not equivalent; it may be reported as
a separately labelled live-network diagnostic but cannot affect the primary
result.

The pinned baseline is Crawlee `PlaywrightCrawler` with one worker, a fresh
`RequestQueue`, zero request retries, and an explicit readiness oracle in each
page's observable DOM. The candidate is the public Stasis
`crawlWithStasis()` helper with one fresh native process per page and the same
finite page/depth/concurrency bounds.

This is an outcome-level crawl comparison. It does not claim that Stasis
implements or retains Crawlee's RequestQueue, Dataset, Router, session pool, or
browser context model.

Primary per-page oracles are:

- canonical requested URL;
- canonical final top-level URL;
- exact frozen BFS depth and a typed Stasis settlement outcome;
- ordered, same-origin, fragment-free, de-duplicated resolved link list;
- scheduled URL set and crawl completeness.

The report includes exact ordered equality, normalized set equality, and the
scheduled-URL Jaccard index. Two separately labelled negative controls exercise
`worker` and `iframe`; they are not hidden inside the 20-page primary corpus and
do not truncate its fail-fast reference crawl.

## Completion gate

The proof is finished when both baselines and both Stasis lanes have either a
raw terminal result or a reproducible classified blocker; the upstream RWA
checkout is still clean; manifests and hashes validate; comparison output is
generated from raw data; and another invocation can reproduce the same
denominators without editing either upstream codebase. Expected runtime lowdb
mutation is not an upstream codebase edit and must be reverted after the run.
Finalization rehashes the ignored RWA production build, installed package and
browser trees, Stasis executable/archive/source, and applies immutable frozen
constants independently of the run manifest. The artifact root must be a fresh
non-reparse direct child of `artifacts/runs`; finalization requires the exact
registered inventory and validates the inter-lane build guard before sealing
the self-index. Equivalence is an outcome to discover, not a condition for
calling the proof complete.
