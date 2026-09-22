# Clara AI Production Performance & Security Hardening Plan

Date: 2026-09-22
Base branch: Vite-Converted
Working branch: audit/perf-security-hardening

## Verified production findings

### P0 — database/migration path
- HTTP handlers call `ensureMigrated()` across many API routes.
- Production telemetry shows migration 050 duplicate-ledger failures, migration 052 PostgreSQL type conflicts, missing tables, and PostgreSQL connection timeouts.
- Request-path migration has been disabled on the audit branch.
- Vercel build is configured to run `npm run db:migrate` before `next build`.
- Migration 050 must still be reconciled against the actual production schema/ledger before deployment.

### P0 — credential exposure
The repository contained secret-bearing environment snapshots, including:
- `backups/.env`
- `backups/.env.example1`
- `.env.example.v1`

These files were removed from the audit branch and matching ignore rules were added.

Because the values existed in Git history, deletion is not sufficient. Operators must rotate any credentials that were real:
- OpenAI
- Gemini
- Stripe
- Razorpay
- Qdrant
- AUTH_SECRET
- database credentials
- admin credentials
- Next.js server-actions encryption key

Do not paste replacement credentials into Git.

### P0 — production authentication bypass
`SKIP_AUTH=true` previously disabled middleware/RBAC authentication. The audit branch now only honors this bypass outside production.

### P1 — public embed metadata
`/api/embed/config` returned provider/model/source/flag metadata. The audit branch removes implementation details and retains only browser-required runtime selections.

### P1 — embed CORS
The middleware returned credentialed wildcard CORS for embed traffic. Credentialed wildcard CORS was removed from the embed header set; bearer-key embed requests do not require browser credentials.

## Phase 2 — next implementation

1. Reconcile production `schema_migrations` against every SQL file.
2. Add a migration preflight command that detects:
   - duplicate numeric prefixes
   - ledger/file drift
   - missing expected tables
   - unexpected schema state
3. Canonicalize all Next.js dynamic route segment names and verify the route tree in CI.
4. Add request IDs and server timing.
5. Standardize API error envelopes and remove raw exception messages.
6. Audit all auth/RBAC checks for IDOR/BOLA and tenant-bound queries.
7. Fix PostgreSQL serverless connection configuration and measure pool saturation.
8. Add tenant-scoped caching for public/embed configuration only after cache-key isolation is proven.
9. Consolidate dashboard requests into screen-level summary endpoints.
10. Add payment idempotency and provider timeout handling.
11. Make email/queue provider failures non-blocking for unrelated critical requests.
12. Add API load tests for p50/p95/p99 and 4xx/5xx/timeout rates.
13. Re-test voice/realtime provider latency after the HTTP/DB foundation is stable.

## Deployment gate

Do not promote this branch until:
- migration preflight passes against production;
- secret rotation is completed for exposed credentials;
- production auth bypass is confirmed false/unavailable;
- TypeScript/lint/tests pass;
- representative API smoke tests pass;
- no cross-tenant data exposure is found;
- payment/webhook tests pass;
- production error rate is stable after rollout.
