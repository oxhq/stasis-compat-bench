# Deterministic v0.3 census lane

This lane reruns the frozen twenty-page deterministic corpus under
`stasis-post-0.3-census-v1` and `controlled-web-session-v2`. It is additive:
the original `stasis-compat-bench-v1` scripts, identities, artifacts, and
manifest remain the v0.2 proof.

Before running, stage the exact ignored inputs documented in
`candidate/README.md`:

- `candidate/oxhq-stasis-0.3.0.tgz`;
- its extraction at `candidate/oxhq-stasis-0.3.0/package`;
- the hosted Windows executable at
  `candidate/stasis-0.3.0-windows-x86_64-ci/stasis.exe`.

The loader hashes the candidate tarball and complete extracted SDK tree before
it imports candidate JavaScript. The runner separately hashes the native
executable before invoking that loader. All identities must match
`src/shared/candidate-v03.mjs`.

Use the pinned Node 22.20.0 runtime, set `STASIS_EXECUTABLE` to the absolute
hosted executable path, then run one of:

```text
npm run census:deterministic:baseline
npm run census:deterministic:stasis
npm run census:deterministic:compare
```

or the single local fixture-only proof:

```text
npm run census:deterministic:proof
```

Artifacts are written below
`stasis-post-0.3-census-v1/deterministic/` inside the explicit artifact root.
This deterministic 20-page denominator and its two designed negative controls
must not be pooled into the RWA or wild-census prevalence denominators.
