# Post-support release-correction proof runner

The committed candidate verifier is bound to the exact `v0.3.3` package
qualification identity at Stasis revision
`48c5a718a9ddd63f496e45307e1484974ccf8587`, workflow run `33506181780`,
attempt `1`. Candidate identity/archive literals are isolated from the frozen
corpora, which remain unchanged. See [`PUBLICATION.md`](PUBLICATION.md) for the
separate public-release evidence boundaries.

The additive post-support runner keeps the frozen deterministic, RWA, and wild corpus bytes unchanged. It accepts the candidate only through explicit exact inputs and persists privacy-projected JSON with fresh-file semantics.

Use the repository-pinned Node v22.20.0 executable. Supply every candidate input below as an absolute path, exact byte count, or lowercase SHA-256:

- `STASIS_POST_SUPPORT_PACKAGE_RUN_ID`
- `STASIS_POST_SUPPORT_PACKAGE_RUN_ATTEMPT`
- `STASIS_POST_SUPPORT_REVISION`
- `STASIS_POST_SUPPORT_WINDOWS_ZIP_PATH`
- `STASIS_POST_SUPPORT_WINDOWS_ZIP_SHA256`
- `STASIS_POST_SUPPORT_WINDOWS_ZIP_BYTES`
- `STASIS_POST_SUPPORT_EXECUTABLE_PATH`
- `STASIS_POST_SUPPORT_EXECUTABLE_SHA256`
- `STASIS_POST_SUPPORT_EXECUTABLE_BYTES`
- `STASIS_POST_SUPPORT_SDK_ARCHIVE_PATH`
- `STASIS_POST_SUPPORT_SDK_ARCHIVE_SHA256`
- `STASIS_POST_SUPPORT_SDK_ARCHIVE_BYTES`
- `STASIS_POST_SUPPORT_SDK_PROOF_PATH`
- `STASIS_POST_SUPPORT_SDK_PROOF_SHA256`
- `STASIS_POST_SUPPORT_SDK_PROOF_BYTES`
- `STASIS_POST_SUPPORT_SDK_PACKAGE_ROOT`
- `STASIS_POST_SUPPORT_SDK_TREE_SHA256`
- `STASIS_POST_SUPPORT_SDK_TREE_FILE_COUNT`
- `STASIS_POST_SUPPORT_SDK_TREE_BYTES`

`npm run post-support:candidate` fails closed unless the hosted exact-revision Windows workflow ZIP/executable, hosted package archive/extracted tree and proof manifest, package manifest, distribution manifest, and launched runtime all attest the same v0.3.3 candidate. The Windows verifier checks the exact 21-member inventory, replays all 20 member hashes from `SHA256SUMS.txt`, binds the archived executable to the separately verified executable, and requires the embedded workflow marker to name the exact version, revision, package run ID, and package run attempt. It launches only from a fresh verifier-owned ZIP extraction, so adjacent runtime DLLs cannot be replaced. The SDK verifier binds the gzip/tar bytes to the separately verified extracted tree, imports only from its own fresh tarball extraction, exact-validates both distribution artifacts, binds the proof's native digest to the Darwin manifest executable, and requires the hosted proof manifest to name the same workflow run, attempt, source revision, tarball digest, and complete v2 proof-slice inventory. `gateLogSha256` remains a proof-file self-attestation because the package artifact does not include the underlying log. Candidate authority is minted only when the verifier's module-private frozen default-dependency sentinel is selected by omitting the dependency argument; every explicit dependency object or Proxy remains diagnostic regardless of its visible keys. The verifier also rejects every package run or attempt other than run `33506181780`, attempt `1`; artifacts from another run or attempt cannot be combined or substituted.

`candidate/README.md` remains the byte-frozen v0.3.0 reference procedure used by the unchanged-corpus proof. The top-level `@oxhq/stasis@0.2.1` dependency is intentionally retained for sealed historical lanes and the unchanged legacy-validator projection. Post-support execution imports `v0.3.3` only from the independently verified SDK archive and a fresh verifier-owned extraction. Package qualification is distinct from immutable-release, signed npm-publication, and anonymous-consumer evidence; no historical procedure or package gate is relabelled as another boundary.

Run the positive cookie minimizers with a fresh absolute `STASIS_POST_SUPPORT_COOKIE_OUTPUT`, then run the unchanged deterministic and RWA comparisons:

```text
npm run post-support:cookies
npm run post-support:deterministic
npm run post-support:rwa
```

The deterministic command additionally requires `STASIS_POST_SUPPORT_DETERMINISTIC_BASELINE_PATH`, `STASIS_POST_SUPPORT_DETERMINISTIC_RAW_OUTPUT`, and `STASIS_POST_SUPPORT_DETERMINISTIC_COMPARISON_OUTPUT`. The RWA command requires `STASIS_POST_SUPPORT_RWA_BASELINE_PATH`, `STASIS_POST_SUPPORT_RWA_RAW_OUTPUT`, and `STASIS_POST_SUPPORT_RWA_COMPARISON_OUTPUT`. Persisted cookie JSON is informational: the RWA command reruns both minimizers in-process with the directly verified candidate, requires an exact match with the prior cookie artifact, and grants boundary authority only to the fresh result selected through the minimizer's own module-private frozen default-dependency sentinel. Any explicit dependency object or Proxy is non-authoritative. Evidence-free, forged, injected, or stale JSON cannot mint support.

The authoritative RWA run also seals the upstream runtime around the direct candidate lane. Before execution and again after it, the runner re-inspects the exact detached frozen checkout, tracked spec and seed, generated runtime modules, empty runtime cache, absent local/ambient overrides, served ten-file production build, exact frontend/backend response bodies, pinned Node executable, script roles, and common `server-host.mjs` launcher. Both observations must retain the same listener and launcher process IDs and exact server evidence; only the explicitly allowed newline-only `data/database.json` server mutation may differ. A fake service on localhost ports 3000/3001, a replaced listener between observations, or an injected observer/dependency object therefore cannot mint the module-private RWA comparison authority.

Start `src/rwa/server-host.mjs` with the pinned Node executable before `npm run post-support:rwa` and leave that same host alive through postflight. An arbitrary development server on the same ports is intentionally rejected.

For wild proof, set `STASIS_COMPAT_ARTIFACT_DIR` to an absolute path that does not exist and run:

```text
npm run post-support:wild
```

For a retained publication transcript, prepend the pinned Node executable's
directory to `PATH`, require `node --version` to report exactly `v22.20.0`, and
invoke that Node and npm CLI with `--silent`. npm child scripts resolve `node`
through `PATH`, and npm's ordinary script banner would add bytes before the
first canonical JSON document; either mismatch is rejected by the publication
capture boundary.

That authority orchestrator launches two separate children in order: the fixture-only network-policy smoke and the 100-case paired census with exactly 500 indexed case records. It awaits an exact clean exit from each child and only then performs quiescent postflight verification in the owning parent process. No environment flag or direct verifier command can mint release authority. Smoke and stable postflight independently re-observe and exact-compare the pinned Node executable plus the complete SDK, Crawlee, Playwright, `node_modules`, and Chromium installation-tree identities; ignored dependency drift therefore cannot borrow the frozen ledger's authority. The individual `post-support:wild:smoke` and `post-support:wild:paired` scripts are available for diagnostics, as is non-authoritative `post-support:wild:verify:diagnostic`.

No post-support artifact contains cookie values, session-state blobs, raw headers, credentials, tokens, secrets, or absolute local paths. The candidate loader consumes absolute paths privately; persisted candidate identity contains only provenance labels, hashes, sizes, counts, versions, and typed booleans.

The artifact privacy firewall evaluates percent and plausible Base64 transformations in either order, recognizes case-insensitive `BASE64:` labels, and scans embedded canonical Base64 tokens in wrappers and labeled text. It permits at most eight decode layers, 32 unique embedded candidates, and 16,384 bytes per candidate; the next layer/candidate or an oversized token fails closed, including for otherwise benign text. Deeply wrapped credentials, header names, keys, and paths therefore cannot bypass projection while ordinary hashes, typed codes, ratios, and bounded safe encodings remain valid.

The SameSite positive minimizer exposes one `http://localhost:PORT` resource origin backed by exact `127.0.0.1` and `::1` listeners on the same port; the IPv6 listener is explicitly IPv6-only. Before any credential-bearing request, `localhost` must resolve to a nonempty set containing only the exact `127.0.0.1`/IPv4 and `::1`/IPv6 pairs. The top-level site is exact `127.0.0.1` on a distinct port. Authority requires canonical `localhost` cookie scope, exact Host headers, one cookie pair on the same-site positive control, and no cookie pairs on the seed, top-level, or cross-site subresource requests; only the resulting booleans and counts are persisted.
