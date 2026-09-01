# Stasis 0.3 cookie-profile reproductions

These harness-only reproductions isolate the two storage blockers in the
decision-eligible wild v4 census without editing either frozen corpus or an
upstream application.

| Scenario | Minimal real path | Required typed terminal | Authoritative representative |
| --- | --- | --- | --- |
| `persistent-login-response` | top-level loopback navigation, semantic button activation, same-site `POST /login`, response `Set-Cookie` with `Max-Age`, settle | `unsupported_persistent_cookie` | hosted RWA cases `auth-02-login-home-redirect` and `auth-03-remember-user-thirty-days`; wild slot 1, `dyndns.org` |
| `cross-site-subresource` | top-level loopback navigation on `127.0.0.1`, parser-blocking subresource attempt on `127.0.0.2`, cookie admission before network start | `unsupported_cookie_same_site_context` | wild slot 9, `ovh.net` |

The local fixture server records only method and path. The persistent fixture
must observe the top-level GET and login POST. The SameSite fixture must observe
the top-level GET but must not receive the rejected cross-site subresource
request. Both scenarios require a non-fatal `StasisProtocolError` with partial
state effect and a successful fail-stop runtime close. A different phase, code,
effect, or cleanup result fails the reproduction. The persistent response is a
`settle` terminal; the parser-blocking SameSite failure is an `openSession`
terminal before the cross-site request reaches the fixture server.

The representative IDs are bound in
`src/minimizers/cookie-profile.mjs`. The wild run is
`wild-paired-4a73bea-authoritative-v4`, whose artifact index SHA-256 is
`e3f9da809243cfd1f6191a1ef115baa6dc24dd6387ff1fae174ddcba39dcdcc9`.
Its decision-eligible result has 40 independent
`unsupported_cookie_same_site_context` origins and 23 independent
`unsupported_persistent_cookie` origins. The RWA raw artifact SHA-256 is
`b3f03b603d426601ec8831e592b98dbda79452bf871b7d40547d02e757163f29`.
Wild slot 1 has classification/raw SHA-256
`df8c37670d77065b1c13a7c695f3ff9bd2ca22e129486531e5677fbb80922b16` /
`9f25295a51c3f769cd68b0bc0287b01c104add3d4775f9085a8ae526911aaded`;
slot 9 has
`d11f4de03f85973b82139a0f99d9a7424aeb5a4cc2e60ebea110f41b79ed2636` /
`2d0526cf0133b11324fe422f3758d5b932c165aad709da58f73d2bca06df7282`.

Run the focused harness tests with the repository's pinned Node executable:

```powershell
$nodeExe = 'C:\path\to\node-v22.20.0\node.exe'
& $nodeExe --test test/cookie-profile-reproductions.test.mjs
```

Run the two local native reproductions against the staged exact hosted
candidate:

```powershell
$env:STASIS_EXECUTABLE = (Resolve-Path '.\candidate\stasis-0.3.0-windows-x86_64-ci\stasis.exe').Path
$env:STASIS_COOKIE_REPRO_INTEGRATION = '1'
& $nodeExe --test test/cookie-profile-reproductions.test.mjs
& $nodeExe src/minimizers/run-cookie-profile.mjs local
```

The optional `wild` mode replays the exact slot-1 and slot-9 public URLs through
the existing wild Stasis observation path without changing the pages:

```powershell
& $nodeExe src/minimizers/run-cookie-profile.mjs wild
```

That replay is diagnostic only. Public page drift can change its result, and it
does not replace the sealed adjacent baseline/Stasis census artifacts. Every
mode has zero retries, fallback, sleeps, and polling.
