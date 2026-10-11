# FIX-01 / Sentinel — Role-local worklog

## 2026-10-10 — I-096 canonical OAuth callback setup
- Symptom: admin integration setup displayed `https://your-domain/api/.../callback`.
- Root cause: editable generic placeholder and stale UI copy did not reflect the existing shared server callback and OAuth lifecycle.
- Remedy: UI derives `window.location.origin + /api/integrations/oauth/callback` when no saved URI exists, shows it read-only with copy action, and explains provider console setup and save-vs-connect semantics. Server validation requires the canonical path and rejects query strings/placeholders.
- Regression: focused cases added/updated in `src/modules/integrations/oauth-app-validation.test.ts`.
- Commits: `8c64ed818fdfb1185472ec62f74d3f9e1d79ae25`; `c12071271a9c79870b93093ce78375ddab96b4bd`; `3bb395bef2069d39dd4cf80b9261b73400a99c52`.
- Failed approach: generic callback placeholder; do not imply saved OAuth credentials mean an account is connected.
- Prevention: keep UI/server callback contract aligned and server validation authoritative.
- Evidence: source review and commits only; tests not run, no live provider flow or deployment verified.
- Next: inspect actual Doable source paths; add registry-grounded provider-console links/scope guidance if available; keep runtime work on existing OAuth lifecycle. Route infra to OPS-01.


## 2026-10-10 — OAuth provider guidance / readiness

- Provider setup guide helper + regression test authored; admin screen links official consoles for recognized integrations and gives a generic fallback for unknown IDs.
- OAuth-app GET returns source/readiness booleans only; encrypted client secret is not returned. UI updates readiness after save.
- Environment fallback not implemented: retain encrypted DB as single source until credential precedence/rotation/audit are designed.
- Commits: `7fb942255f2dd3daf13e9a9e32270d70ff02938c`, `f1ebf20ef6242204ccb144b570f0ace5a874e052`, `9652855d4408737f3a6930f02caced07002eb65f`, `3a0a3e8864f0497facd85626b22e537a8225e1df`, `c55294c100647b9d3287503a7909197aa0960c85`, `f97140906cc4c63e7840d007e2a5d3c5b42ba986`.
- Not run: Vitest, lint, typecheck, build, browser, provider consent/token exchange, deployment/runtime. Local test execution was blocked by absent checkout and failed GitHub DNS lookup; not a test failure. Keep I-096 open.
