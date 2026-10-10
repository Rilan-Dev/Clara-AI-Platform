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
