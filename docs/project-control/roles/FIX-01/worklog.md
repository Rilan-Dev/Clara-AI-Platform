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

## 2026-10-20 — FIX-01 / Sentinel — Qdrant document-deletion fail-open correction

- **Task/role:** Owner-authorized independent RAG deletion-integrity bug fix on `feature/ai-core-from-doable-source`; do not take over DEV-01 canonical document ingestion/reindex feature work.
- **Starting state:** Branch `5782790b81f47dc36d6e037826f786b16fe71558` (PR #299 merged); read `docs/project-control/CHAT_CONTINUITY.md`, `NEXT_ACTION.md`, current project-control state and FIX-01 records. No CI/Vercel gate awaited.
- **Reproduction from source:** `deleteDocumentChunks()` swallowed failures from Qdrant index creation/deletion, while document-delete and scrape-rollback callers unconditionally deleted the source DB record. Result: a false successful deletion can leave orphaned searchable vectors. The previous best-effort `dualWrite()` could similarly swallow removal failures in an in-progress reindex target.
- **Correction:** Qdrant deletion errors now propagate before source-row deletion. An absent KB fails closed in the document deletion route and scrape rollback. A never-created collection is safe to skip only after an explicit Qdrant getCollection 404 with collection-not-found evidence; transient failures still reject. Pass the trusted KB id from both deletion callers, and require strict mirror deletion for active reindex targets while preserving best-effort behavior for unrelated index writes.
- **Files:** `src/modules/admin/core/vector-store-kb.ts`, `src/modules/admin/core/vector-store-kb.deletion.test.ts`, `src/modules/knowledge-bases/api/documents.ts`, `src/modules/knowledge-bases/api/documents.deletion.test.ts`, `src/modules/knowledge-bases/api/scrape.ts`.
- **Regression source:** Seven vector-store cases (Qdrant delete failure, index failure, confirmed no collection, outage, active reindex failure, missing-live target cleanup, success); three route cases (failed vectors, missing KB, successful ordering). Ten tests authored; **not executed**.
- **Commits:** `680a9641` (vector regression), `008c6df3` (delete propagation), `79472db2` (KB lookup), `bbed7868` (route regression), `1910c8d1` (confirmed-absent collection), `723464d4` (absence regression), `0480d694` (strict mirror), `520c3d42` and `7c5a9e93` (caller KB binding), `c938019f` and `3565c904` (mirror/route regressions), `2ffb20dc` (scrape missing-KB guard).
- **Verification:** Current-branch source reread confirmed expected guards and ten `it()` test declarations; GitHub accepted the commits. Checkout/runtime unavailable here: local `git ls-remote` failed resolving github.com. No Vitest, TypeScript, build, browser, live Qdrant, CI, deployment, or production deletion PASS is claimed.
- **Limitations:** Published immutable KB snapshots and random-ID reprocessing may need independent stale-vector lifecycle fixes; no deletion of existing tenant data was performed. The canonical structured-document and version-safe reindex architecture remains DEV-01 scope.
- **Next FIX-01 action:** On a fresh current-head recovery, inspect a separately reproducible ingestion/reindex integration defect (e.g. duplicate stale chunks on reprocess) without overlapping DEV-01; add bounded correction and regressions when ownership permits. Do not wait for CI/Vercel or change other markdown files.
