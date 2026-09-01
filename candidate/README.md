# Frozen Stasis 0.3 candidate inputs

The candidate binaries are deliberately ignored. Stage these exact hosted-run
artifacts in this directory before installing dependencies or running the wild
census:

| Input | Exact identity |
| --- | --- |
| `oxhq-stasis-0.3.0.tgz` | 176,445 bytes; SHA-256 `56bd1860c0f1b4a05a32feb6ee41e71ff1c5947dbe44c2c4e30a31ca40b6bbb4`; SRI `sha512-VoxOGYvG6Yp3h1MTwn0jDvLAFHh041Cq43nK5Tvy+ypjXXCikB2zuI6MjeknJL8xhkNhFfHVoWqPQsxGJFZfeg==` |
| extracted `oxhq-stasis-0.3.0/package/` | 55 regular files; 876,195 bytes; deterministic tree SHA-256 `c38928c342d804f2e5776945ef295162f5f755a3c0bd224b5ef16e1498998449` |
| `stasis-0.3.0-windows-x86_64-ci.zip` | SHA-256 `0ec4d715f37cae4c9abef7f0d5bfed9b60b938abaffb2f30425a80cf76031f86` |
| extracted `stasis.exe` | SHA-256 `bd6715f5cc30ec66ea2d3b9c0889698ecea54373a3c3ab2c1893c934573916d1` |
| extracted `controlled-web-session-v2.json` | SHA-256 `ced49928c0c5f77669285a658434209101d27907bd26d07296d5d40e2ad7a412` |
| extracted `session-v0.3-candidate.md` | SHA-256 `e9360693e31c248c2acb55ac097977a9fdf590976743f60b270390f503d8a524` |

The archive was produced by GitHub Actions run `32976176019`, attempt `1`,
for Stasis revision `cd471fb2f515e1f7227581fb8930e04bd6414767`.
The harness rejects any other executable hash. Set `STASIS_EXECUTABLE` to the
extracted executable's absolute path for `npm run wild:paired`.

Extract the SDK archive from the repository root into the exact ignored path
expected by the verified loader (the destination must not already exist):

```powershell
New-Item -ItemType Directory -Path .\candidate\oxhq-stasis-0.3.0 -ErrorAction Stop
tar.exe -xzf .\candidate\oxhq-stasis-0.3.0.tgz -C .\candidate\oxhq-stasis-0.3.0
```

This must produce
`candidate/oxhq-stasis-0.3.0/package/dist/index.js`; the loader verifies the
archive and the complete extracted tree before importing it.

Before `npm run wild:select`, commit the preregistered protocol and harness,
leave the ignored candidate and Tranco input placed locally in their documented
filesystem locations, and set:

```powershell
$env:STASIS_WILD_PREREG_COMMIT = '<exact clean preregistration HEAD, 40 lowercase hex>'
```

Before `npm run wild:paired`, commit the frozen selected corpus and preflight
ledger, then set all of the following:

```powershell
$env:STASIS_WILD_FROZEN_COMMIT = '<exact clean frozen-corpus HEAD, 40 hex>'
$env:STASIS_WILD_CORPUS_SHA256 = '<SHA-256 of corpora/wild-tranco-74V4X-v1.json, 64 hex>'
$env:STASIS_COMPAT_ARTIFACT_DIR = 'C:\absolute\new\artifact-run'
$env:STASIS_EXECUTABLE = 'C:\absolute\candidate\stasis.exe'
```

`STASIS_COMPAT_ARTIFACT_DIR` must be absolute and its `wild` lane must not
already exist. Both commands reject tracked, modified, staged, or untracked
Git drift; ignored candidate packages, binaries, and raw Tranco input remain
outside the commit while their bytes are verified separately.
