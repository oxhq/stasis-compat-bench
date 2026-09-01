# Stasis compatibility proof

This is a reviewer-owned harness for `stasis-compat-bench-v1`. It deliberately
lives outside the Stasis, Cypress RWA, and Crawlee repositories so adapters and
fixtures cannot be mistaken for upstream application changes.

## Stasis v0.3.3 evidence boundary

[`publication/release-identity.json`](publication/release-identity.json) is the
sole release-identity binding for the Stasis `v0.3.3` evidence archive. Release
claims require its `qualified` status and successful independent archive
verification. See [`PUBLICATION.md`](PUBLICATION.md) for the exact evidence
inventory, deterministic checksum mechanism, and bounded claim language.

The dependency split is intentional. The top-level `package.json` and lockfile
retain `@oxhq/stasis@0.2.1` for the sealed historical harness and unchanged
legacy-validator projection. Post-support execution instead imports the
independently verified `v0.3.3` SDK archive and runtime from revision
`48c5a718a9ddd63f496e45307e1484974ccf8587`, package workflow run
`33506181780`, attempt `1`. The npm publication producer and later anonymous
native verifier are separate facts in the release identity; none of these
identities may be relabelled or pooled.

The frozen contract is in
[`protocol/stasis-compat-bench-v1.md`](protocol/stasis-compat-bench-v1.md).
Historical local run artifacts remain in the source snapshot for audit, but the
public source projection always excludes `artifacts/runs/` because those files
contain machine-local paths and are not `v0.3.3` evidence. Publication evidence
is assembled only from fresh privacy-projected bytes.

The primary question is behavioral equivalence on unchanged inputs. Runtime
performance is not a pass criterion.

## Observed bounded v0.3.3 results

The unchanged deterministic primary corpus has 20 of 20
`PASS_EQUIVALENT` cases: 20 of 20 exact-equivalent and 20 of 20
behaviorally-supported. Worker and iframe cases remain separately labelled
typed negative controls. The unchanged RWA lane has 8 of 8
`PASS_WITH_SEMANTIC_DIFFERENCE` cases: 0 of 8 exact-equivalent and 8 of 8
behaviorally-supported only for the eight frozen application intents. These
figures are not Cypress API equivalence, a pooled success rate, a performance
claim, prevalence evidence, or a general web-support claim. Wild-lane counts
are stated only by the generated and independently replayed release report.

## Frozen lanes

- Track A runs all eight unchanged auth cases from
  `cypress-io/cypress-realworld-app@28ca4d03e4c68d366ccdbb25d43e1f37b3c67a4d`
  with zero Cypress retries, then executes the same intents through the public
  Stasis controlled-session API. No RWA app/test/config/seed edit is permitted.
- Track B compares pinned Crawlee `PlaywrightCrawler` with the public Stasis
  reference crawler on one immutable 20-page `fixtures_only` corpus. Worker and
  iframe are separately labelled negative controls.

Unsupported or failing cases remain in their frozen denominator. The harness
never substitutes Chromium, a business API, a sleep, or a retry for a failed
Stasis operation.

## Windows prerequisites

The following procedure is the historical sealed `v0.2.1` proof. It is retained
for auditability and is not the `v0.3.3` evidence procedure.

The sealed Windows run requires Node `22.20.0` with its bundled npm `10.9.3`,
Git, PowerShell, and the supplied candidate ZIP. Choose local roots; the proof
does not depend on this author's drive layout:

```powershell
$nodeDir = 'C:\path\to\node-v22.20.0'
$harnessRoot = 'C:\review\stasis-compat-bench-v1'
$stasisRoot = 'C:\review\stasis-source'
$rwaRoot = 'C:\review\cypress-realworld-app-28ca4d0'
$bundleZip = 'C:\review\stasis-0.2.1-windows-x86_64-local-5d55c0cf-r1.zip'
$bundleExtract = 'C:\review\candidate'
$env:Path = "$nodeDir;$env:Path"
$nodeExe = Join-Path $nodeDir 'node.exe'
if ((Get-Item -LiteralPath $nodeExe).Length -ne 85588976) { throw 'Node executable size mismatch' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $nodeExe).Hash.ToLowerInvariant() -ne 'fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d') { throw 'Node executable hash mismatch' }
node --version
npm --version
```

The last two commands must print `v22.20.0` and `10.9.3`. The supplied ZIP
must hash to
`1fdaefc03e36102b2741406584522c1a9aab786210926b5a093c9cda1eb117f4`.
The selected `node.exe` must be 85,588,976 bytes and hash to
`fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d`.
The primary run and finalizer both enforce those executable bytes, not only the
version string.

The sealed `v0.2.1` procedure obtained this harness as a Git repository at the
reviewed preregistration commit recorded as `harness.revision` in the retained
`manifest.json`; it did not assume a public harness remote. A run requires that
exact commit and a tracked-clean harness; the manifest records it again before
execution.
Extract it once and verify the executable:

```powershell
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $bundleZip).Hash.ToLowerInvariant() -ne '1fdaefc03e36102b2741406584522c1a9aab786210926b5a093c9cda1eb117f4') { throw 'candidate ZIP mismatch' }
Expand-Archive -LiteralPath $bundleZip -DestinationPath $bundleExtract
$stasisExe = Join-Path $bundleExtract 'stasis-0.2.1-windows-x86_64-local-5d55c0cf-r1\stasis.exe'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $stasisExe).Hash.ToLowerInvariant() -ne '7a1abdcbd342f35d9c9bf57a429dcfa5b6c79df21f6b214ba707f058722d272d') { throw 'candidate executable mismatch' }
```

For source review, clone the public base and apply the ZIP's LF
`SOURCE.patch`. `git write-tree` must print the frozen candidate tree:

```powershell
git clone https://github.com/oxhq/stasis.git $stasisRoot
git -C $stasisRoot checkout --detach 68c99e29111050902a3f152af3ec03ad9c8a8b22
$sourcePatch = Join-Path $bundleExtract 'stasis-0.2.1-windows-x86_64-local-5d55c0cf-r1\SOURCE.patch'
git -C $stasisRoot apply --check $sourcePatch
git -C $stasisRoot apply --index $sourcePatch
if ((git -C $stasisRoot write-tree).Trim() -ne 'eaafda92f062a063353376339e566999c5f8db43') { throw 'candidate source tree mismatch' }
```

Create the exact detached CRLF RWA checkout, then install and build without
editing tracked application bytes:

```powershell
git -c core.autocrlf=true clone --filter=blob:none https://github.com/cypress-io/cypress-realworld-app.git $rwaRoot
git -C $rwaRoot config core.autocrlf true
git -C $rwaRoot checkout --detach 28ca4d03e4c68d366ccdbb25d43e1f37b3c67a4d
Set-Location $rwaRoot
npx --yes yarn@1.22.22 install --frozen-lockfile
npx --yes yarn@1.22.22 build:ci
if ((git status --porcelain=v1 --untracked-files=all).Length -ne 0) { throw 'RWA tracked checkout is not clean' }
```

The frozen RWA dependency identity covers every regular file below
`node_modules`, with zero regular files permitted below its top-level `.cache`.
The sealed host invokes the two unchanged RWA TypeScript entrypoints directly
through the frozen ts-node package, so NYC's executable transform cache cannot
be read or created. The ignored generated `src/aws-exports.js` and
`aws-exports-es5.js` must be exact copies of their tracked mock sources, and no
`.env*.local` file or ambient RWA/Cypress behavior override is permitted.

Install the harness exactly and install its pinned Playwright Chromium revision:

```powershell
Set-Location $harnessRoot
npm ci
.\node_modules\.bin\playwright.cmd install chromium
npm run check
```

Start the unchanged RWA application roles in a separate terminal. This snippet
is self-contained; use the same three roots chosen above:

```powershell
$nodeDir = 'C:\path\to\node-v22.20.0'
$harnessRoot = 'C:\review\stasis-compat-bench-v1'
$rwaRoot = 'C:\review\cypress-realworld-app-28ca4d0'
$env:Path = "$nodeDir;$env:Path"
$nodeExe = Join-Path $nodeDir 'node.exe'
if ((Get-Item -LiteralPath $nodeExe).Length -ne 85588976) { throw 'Node executable size mismatch' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $nodeExe).Hash.ToLowerInvariant() -ne 'fdddbf4581e046b8102815d56208d6a248950bb554570b81519a8a5dacfee95d') { throw 'Node executable hash mismatch' }
$env:RWA_ROOT = $rwaRoot
$runtimeCache = Join-Path $rwaRoot 'node_modules\.cache'
if ((Test-Path -LiteralPath $runtimeCache) -and @(Get-ChildItem -LiteralPath $runtimeCache -Recurse -File -Force).Count -ne 0) { throw 'clear the generated RWA runtime cache before sealed startup' }
$serverHost = Join-Path $harnessRoot 'src\rwa\server-host.mjs'
& $nodeExe $serverHost
```

The committed server host supplies a minimal environment and absolute
ts-node/config/script argv. Both listeners must be direct children of that same
frozen host process. The upstream NYC coverage wrapper is intentionally outside
this behavioral protocol; no RWA source, configuration, seed, or build byte is
edited.

## Sealed proof run

The harness must be committed and tracked-clean. The artifact root must not
exist and must be one direct child of `$harnessRoot\artifacts\runs`; reparse
points/junctions and extra files are rejected.

```powershell
$env:Path = "$nodeDir;$env:Path"
$env:STASIS_EXECUTABLE = $stasisExe
$env:STASIS_SOURCE_ROOT = $stasisRoot
$env:STASIS_ARCHIVE = $bundleZip
$env:RWA_ROOT = $rwaRoot
$env:STASIS_COMPAT_ARTIFACT_DIR = Join-Path $harnessRoot 'artifacts\runs\review-01'
Set-Location $harnessRoot
npm run proof
```

`npm run proof` independently enforces a fresh `npm ci` immediately before the
scientific run, even if dependencies were installed earlier for `npm run check`.
It succeeds when the scientific artifacts are valid; compatibility itself may
pass, diverge, or terminate on a classified blocker. The RWA origins are sealed
to `http://localhost:3000` and `http://localhost:3001`; defining
`RWA_APP_ORIGIN` or `RWA_API_ORIGIN` invalidates the run.

After the run, stop both upstream servers. Their own lowdb seed endpoint leaves
an expected tracked newline mutation, which must be restored to the pinned Git
bytes before finalization:

```powershell
git -C $rwaRoot restore --source=HEAD --worktree -- data/database.json
Set-Location $harnessRoot
npm run finalize
```

Finalization requires both ports to be down, the upstream checkout clean, the
harness tracked tree unchanged, and every Stasis/RWA/dependency/browser identity
still frozen. It requires the exact pre-final inventory, validates the
inter-lane RWA build guard, and writes `report.md`, `postflight.json`, and a
SHA-256 `artifact-index.json` beside the raw evidence.

## Diagnostic cookie-profile reproductions

The additive local minimizers and optional unchanged-public-page replays for
`unsupported_persistent_cookie` and
`unsupported_cookie_same_site_context` are documented in
[`COOKIE-PROFILE-REPRODUCTIONS.md`](COOKIE-PROFILE-REPRODUCTIONS.md). They are
causal diagnostics only and do not replace any sealed corpus or release gate.

## License

MIT. See [`LICENSE`](LICENSE).
