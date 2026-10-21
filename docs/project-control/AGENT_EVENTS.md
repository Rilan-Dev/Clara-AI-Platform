### EVT-FIX-20261016-01 — 2026-10-16
- **Agent/session:** FIX-01 / Sentinel / task-a-round4
- **Type:** CORRECTION + LESSON (branch-history loss + no-op deploy)
- **Summary:** The embedBatch batch-contract degradation fix (c40d266c, pushed 2026-10-15 22:30 UTC) was silently removed from `feature/ai-core-from-doable-source` by a force-push from a stale local checkout (owner's export-qdrant a9e5b8e3, then the stale-default/ai-catalog session landing on top — head 977489ef). Independently, the owner's redeploy (`git pull && docker compose up -d --build`) ran BEFORE the fix was pushed: "Already up to date." + every Docker source layer CACHED + containers not recreated, so the running image stayed at 6cbece5a and ingest kept failing with the pre-fix signature "Embedding provider returned 1 vectors for 20 inputs". FIX-01 rebased the fix onto 977489ef (preserving the stale-default/ai-catalog work and their probe improvement), added a probe build marker (v3 banner), and pushed with a normal fast-forward push — no other session's work was discarded.
- **Impact:** cross-agent: every agent pushing to the shared feature branch MUST fetch + rebase/merge first and MUST NOT force-push; a pushed commit is invisible to sessions working from stale checkouts, and force-push destroys it silently.
- **Owner:** FIX-01
- **Suggested next action:** Owner deploys through the verification gate: `git log --oneline -2` shows the fix commit (bfc7b816 embedBatch degradation + probe-marker commit on top) → Docker build shows `COPY src ./src` NOT cached → in-container probe prints "probe build: v3" and the BATCH/QDRANT stages → Retry both failed documents.
- **Related records:** commits c40d266c (clobbered) → bfc7b816 (recovered); docs/project-control/NEXT_ACTION.md and VERIFICATION_STATE.md 2026-10-16 entries; AGENT_MEMORY.md FIX-01 lesson 2026-10-16.

---

### EVT-DEV-002 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-02
- **Type:** CORRECTION
- **Summary:** Completed the remaining I-6 async MCP policy-snapshot hardening and continued the authorized integration roadmap with a generic OAuth state/authorization-code flow, encrypted tenant connection persistence, token-refresh auth-mode parity, safe connection health, and server-side credential validation. Source and regression files were committed directly to the feature branch.
- **Impact:** cross-module integration security and connection setup reliability.
- **Owner:** DEV-01
- **Suggested next action:** Continue P0 connection recovery and P1 shared integration capability/readiness contracts; keep OAuth secrets and access tokens encrypted and never expose them to models or browser responses.
- **Related records:** `docs/project-control/NEXT_ACTION.md`; `docs/project-control/CURRENT_PHASE.md`; `src/modules/ai-platform-core/mcp-tool-bridge.ts`; `src/app/api/integrations/oauth/callback/route.ts`; `src/app/api/orgs/[orgId]/integrations/[integrationId]/oauth/start/route.ts`; `src/modules/integrations/connection-validation.ts`.

---

# APCP Central Agent Events

Append-only central event log for material cross-agent events. This is not a replacement for WORKLOG.md or project-control state.

## Use when

Record:
- cross-agent blockers/routing;
- significant errors and corrections;
- requirement-impact discoveries;
- handoff creation/completion;
- agent-session takeover/switching;
- material lessons that affect multiple roles;
- governance/process incidents.

Routine implementation details belong in the owning agent's WORKLOG.md.

## Event format

### <EVENT-ID> — <YYYY-MM-DD>
- **Agent/session:** <agent id / session id>
- **Type:** <BLOCKER | ROUTE | ERROR | CORRECTION | HANDOFF | REQUIREMENT | SESSION | LESSON>
- **Summary:** <one paragraph>
- **Impact:** <none / local / cross-agent / scope>
- **Owner:** <agent id>
- **Suggested next action:** <concrete action>
- **Related records:** <paths / issue ids / commits>

### EVT-OPS-003 — 2026-10-09
- **Agent/session:** OPS-01 / Shipwright
- **Type:** ROUTE
- **Summary:** Current Vercel-Preview deployment dpl_22XsSPHMrei8mh5StC8b4ytVGGke at commit fa46778f08b604125e942f4d39b249017254a8d2 now completes db:migrate and applies 061_payment_settings_category.sql. The active blocker is TypeScript compilation: src/lib/db/seed/production.ts:37 references CliLog without importing it. Vercel-Preview also lacks src/modules/integrations/registry.ts, while the feature branch seed imports it; FIX-01 must reconcile the complete dependency change, not just the type alias.
- **Impact:** Vercel Preview deployment blocker; no Vercel infrastructure outage identified.
- **Owner:** FIX-01
- **Suggested next action:** Correct the Vercel-Preview application source coherently; preserve npm run db:migrate && npm run build and do not weaken TypeScript/build checks.
- **Related records:** deployment dpl_22XsSPHMrei8mh5StC8b4ytVGGke; commit fa46778f08b604125e942f4d39b249017254a8d2; production.ts; observability.ts; integrations/registry.ts; HANDOFF-OPS-20261009-02.

### EVT-OPS-004 — 2026-10-09
- **Agent/session:** OPS-01 / Shipwright
- **Type:** ROUTE
- **Summary:** Current local Docker build on feature/ai-core-from-doable-source reaches standalone packaging and fails at the Dockerfile hard-coded ioredis runtime copy: cp: cannot stat node_modules/lodash.defaults. clara-worker exports successfully. This is a deterministic Dockerfile/npm dependency-layout mismatch, not a Docker daemon or BuildKit outage; the Dockerfile assumes ioredis transitive dependencies are always top-level hoisted.
- **Impact:** local production-image build blocker.
- **Owner:** FIX-01
- **Suggested next action:** Replace the brittle top-level transitive-package copy assumption with a reproducible dependency-closure packaging strategy. Do not disable npm ci or remove ElevenLabs/ioredis runtime dependencies.
- **Related records:** feature/ai-core-from-doable-source; Dockerfile; package.json; package-lock.json; local BuildKit log; HANDOFF-OPS-20261009-02.

### EVT-FIX-003 — 2026-10-09
- **Agent/session:** FIX-01 / SESSION-FIX-20261009-01
- **Type:** CORRECTION
- **Summary:** Corrected five relative TypeScript imports that the supplied Docker Next.js webpack build could not resolve. The failing imports were in integration runtime context-builder.ts and runner-core.ts; target TypeScript modules were present, so this was an import-specifier/build-resolver mismatch rather than missing source files or a Docker daemon failure.
- **Impact:** local production-image build source blocker; rebuild outcome remains unverified.
- **Owner:** FIX-01
- **Suggested next action:** Continue the authorized roadmap from NEXT_ACTION.md without waiting for CI/Vercel/Gates; when normal verification is next run, rebuild the image and investigate any newly exposed failure separately. Do not claim the reported Docker build is fixed until rebuilt.
- **Related records:** commits ec1d0cd88d16e626ffbb9af7ed44a6b9e1320210 and 8da4ec31da847a9a024d27ad49c2ee53d67f0372; VERIFICATION_STATE.md; agents/FIX-01/WORKLOG.md.

<!-- Append new events above this marker. -->

### EVT-OPS-001 — 2026-10-09
- **Agent/session:** OPS-01 / Shipwright
- **Type:** ROUTE
- **Summary:** Vercel deployment clara-backend failed during the build step because the deployed Vercel-Preview commit 4ea79c3b3bbb5202a25f2411b63471354200b01d contains a duplicate migration-number condition: 060_sarvam_realtime_streaming.sql and the payment-category migration introduced by PR #273 as 060_payment_settings_category.sql. The migration runner correctly fails closed before next build.
- **Impact:** cross-agent deployment blocker; no infrastructure outage identified.
- **Owner:** FIX-01
- **Suggested next action:** remove or rename the duplicate payment migration on the deployment source so exactly one migration owns number 060; do not bypass npm run db:migrate or weaken the duplicate-number guard. Then allow the normal deployment path to rebuild the corrected commit.
- **Related records:** Vercel deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf; commit 4ea79c3b3bbb5202a25f2411b63471354200b01d; src/lib/db/migrate.ts; src/lib/db/migrations/060_sarvam_realtime_streaming.sql; src/lib/db/migrations/060_payment_settings_category.sql; src/lib/db/migrations/061_payment_settings_category.sql; docs/project-control/agents/OPS-01/WORKLOG.md


### EVT-OPS-002 — 2026-10-09
- Agent/session: OPS-01 / Shipwright
- Type: ROUTE
- Summary: Local Docker Compose build on feature/ai-core-from-doable-source fails inside Next.js CSS compilation because Tailwind CSS 4.3 is paired with the obsolete Tailwind v3 PostCSS plugin declaration. Docker/BuildKit stages are functioning; clara-worker builds successfully while clara-backend fails at next build with the explicit message that the PostCSS plugin moved to @tailwindcss/postcss.
- Impact: local developer build blocker; likely shared with CI/Vercel builds using the same dependency/configuration path.
- Owner: FIX-01
- Suggested next action: add a lockfile-backed @tailwindcss/postcss dependency compatible with Tailwind 4.3, update postcss.config.js to use it, regenerate package-lock.json, then verify later when external verification is resumed. Do not downgrade Tailwind, bypass CSS processing, or change Docker reproducibility as an operational workaround.
- Related records: feature/ai-core-from-doable-source; package.json; package-lock.json; postcss.config.js; docs/project-control/agents/OPS-01/WORKLOG.md

- **EVT-FIX-001 — 2026-10-09** — FIX-01 completed the Tailwind v4/PostCSS Docker build blocker on `feature/ai-core-from-doable-source`; added `@tailwindcss/postcss` 4.3.3, switched PostCSS registration, and regenerated the lock dependency closure. Source commits: `ed56e33d49a391025d605919183cb8cdc581fd20`, `d119c02853ef2a33eb508c69418745eeab385782`, `0d1666efa24950a1a23a995cea57ba4a7adfd4da`.

- **EVT-FIX-002 — 2026-10-09** — Local Docker `npm ci` exposed one remaining lockfile-sync defect from the Tailwind migration: `@tailwindcss/node@4.3.3` requires `magic-string@^0.30.21`, while the lockfile only had the unrelated `magic-string@1.4.3` tree. Added the required nested `node_modules/@tailwindcss/node/node_modules/magic-string@0.30.21` lock entry. Commit: `a9d50dfafd29e9645705363906b128883148e4cc`. No application logic changed.


### EVT-DEV-001 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-01
- **Type:** HANDOFF
- **Summary:** Implemented the authorized realtime voice integration dispatch slice through the existing Unified Tool Runtime. Session descriptors remain default-off and require authenticated KB access; the server route derives identity rather than trusting request-body IDs. Regression source was added but not executed.
- **Impact:** local feature capability; architect review required before verification status can advance.
- **Owner:** ChatGPT / architect review
- **Suggested next action:** Review the implementation commits and test source; route any substantial bug to FIX-01. Do not wait/poll for CI/Vercel to perform this review.
- **Related records:** `docs/project-control/NEXT_ACTION.md`; `src/modules/assistant/api/realtime-tool.ts`; commits a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.


### EVT-FIX-004 — 2026-10-09
- **Agent/session:** FIX-01 / SESSION-FIX-20261009-02
- **Type:** CORRECTION
- **Summary:** Follow-on review of the owner-provided Docker webpack failure found five remaining explicit `.js` sibling imports in `connections-manager.ts`, `runner-core.ts`, and `runner-fetch.ts`, targeting TypeScript files. Converted only those import specifiers to extensionless paths.
- **Impact:** local production-image build source blocker; rebuild outcome remains unverified.
- **Owner:** FIX-01
- **Suggested next action:** Continue the authorized roadmap from `NEXT_ACTION.md`; when normal verification is next run, rebuild and assess the next actual result. Do not claim the image build is fixed without a new build.
- **Related records:** commits `f507443805130d1068b8fe570bc0940f4e8ace1b`, `8eb329af87f1225342b10b9c299fa8163812a9eb`, `21576b8e5e3db30fd5a61325712e0d89dfe38369`; `VERIFICATION_STATE.md`; `agents/FIX-01/WORKLOG.md`.


### EVT-FIX-005 — 2026-10-09
- **Agent/session:** FIX-01 / SESSION-FIX-20261009-03
- **Type:** CORRECTION
- **Summary:** Follow-on Docker webpack log identified unresolved imports in `execution-authorization.ts` and `runner-helpers.ts`. Six explicit `.js` import specifiers targeting TypeScript modules were converted to extensionless paths.
- **Impact:** Removes the exact reported import-resolution blockers at source level; next build outcome remains unknown.
- **Owner:** FIX-01
- **Next action:** Continue roadmap implementation without waiting for CI/Vercel/gates; if a later ordinary build is run, diagnose its actual next result.
- **Commits:** `d9d114c8492892ebf4ce16ae4e6d93baa8ab97a8`, `a47d087cfc5dc68251eb4c421dbdf4b1ac6c373b`.


## EVT-FIX-006 — OAuth token contract typing
- **Date:** 2026-10-09
- **Role:** FIX-01 / Sentinel continuation
- **Finding:** `ensureTokenFresh()` branches on persisted `authorization_method` to retain OAuth HEADER vs BODY client authentication, but `OAuth2TokenData` did not declare the field.
- **Correction:** Added optional `authorization_method?: "HEADER" | "BODY"` to the token data contract. No runtime behavior changed; persisted legacy records without the field retain the existing BODY fallback.
- **Commit:** `5d0d64c22c04c32f01a44cbb0ad95b3fee7b4921`
- **Verification:** Source-only; no build, test, typecheck, Docker, CI, Vercel, gate, or deployment result is claimed.


## EVT-FIX-007 — Docker build follow-up: files-service import
- **Date:** 2026-10-09
- **Role:** FIX-01 / Sentinel
- **Evidence:** User-provided `docker compose build clara-backend` output after pull to `0665f6f3` failed in `src/modules/integrations/runtime/runner-helpers.ts`: webpack could not resolve `./files-service.js`. The corresponding module exists as `files-service.ts` in the same runtime directory.
- **Root cause:** A remaining explicit JavaScript extension in a dynamic import targeting a TypeScript source module.
- **Correction:** Changed `await import("./files-service.js")` to `await import("./files-service")` only. No business logic, auth, secrets, or webpack configuration changed.
- **Commit:** `bda45fd90379154e098d39076823829d2b741bd7`
- **Verification:** Correction is source-committed; rebuild has not yet been run. No build PASS or production recovery is claimed.
## EVT-FIX-008 — Self-hosted PDF parser startup isolation
- **Date:** 2026-10-09
- **Role:** FIX-01 / Sentinel
- **Evidence:** Owner-provided `docker compose logs --tail=150 clara-backend` shows repeated `ReferenceError: DOMMatrix is not defined`, ingest poller startup failure, and a warning that `@napi-rs/canvas` is unavailable.
- **Root cause identified in source:** `src/modules/ingest/parsers/pdf.ts` statically imported `PDFParse`, causing the PDF.js runtime to be evaluated when the parser registry is imported, rather than only when parsing a PDF.
- **Correction:** Changed the import to type-only and moved the runtime import inside `PDFParser.parse()`. Commit: `cdcad9f89105f4aa9d3c867e88cf73ef34efcfba`.
- **Scope:** Startup module loading only; no PDF parsing algorithm, authorization, or upload validation changed.
- **Verification:** Source committed only. No tests/build/PDF job run. Actual PDF parsing may still require a canvas/DOMMatrix dependency fix.
- **Next action:** Continue development without waiting for external gates; rebuild on the next normal verification pass and address any reproduced PDF-runtime error.


## EVT-FIX-008 — Self-hosted PDF parser startup isolation
- **Date:** 2026-10-09
- **Role:** FIX-01 / Sentinel
- **Evidence:** Owner logs show `DOMMatrix is not defined`, ingest poller startup failure, and a warning that `@napi-rs/canvas` is unavailable.
- **Root cause identified in source:** `src/modules/ingest/parsers/pdf.ts` statically imported `PDFParse`, evaluating PDF.js when the parser registry was imported.
- **Correction:** Changed the import to type-only and moved the runtime import inside `PDFParser.parse()`. Commit: `cdcad9f89105f4aa9d3c867e88cf73ef34efcfba`.
- **Scope:** Startup module loading only; no PDF parsing algorithm, authorization, or upload validation changed.
- **Verification:** Source committed only. No tests/build/PDF job run. Actual PDF parsing may still require a canvas/DOMMatrix dependency fix.
- **Next action:** Rebuild on the next normal verification pass and address any reproduced PDF-runtime error; do not wait for external gates.


### EVT-FIX-009 — PDF canvas dependency declaration
- **Date:** 2026-10-09
- **Role:** FIX-01 / Sentinel
- **Finding:** The lockfile already contained `@napi-rs/canvas@0.1.80` and its optional platform packages, but it was not declared as a root production dependency, matching the runtime warning that the package could not be loaded.
- **Correction:** Declared `@napi-rs/canvas@^0.1.80` in `package.json` and synchronized the root dependency set in `package-lock.json`.
- **Commits:** `3f1b5db3fdf5b009e05ca5b03ae197cc26af9338`; `9fa3a134e4492de0ba8ab2f323a3df1e7984b85b`.
- **Verification:** No npm ci, Docker build, native module load, or PDF extraction was run. Runtime confirmation remains pending.


### EVT-DEV-003 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-03
- **Type:** CORRECTION
- **Summary:** Added a Messaging entry point to the existing agent workspace and identified that the WhatsApp-specific connection/webhook/message-persistence lifecycle is absent from source. UI stays Not connected and does not treat external Meta navigation as authorization.
- **Impact:** Makes the channel reachable while keeping the missing backend capability explicit.
- **Owner:** DEV-01
- **Suggested next action:** Implement authenticated Meta WhatsApp connection lifecycle and durable webhook/message state; bind UI status to server truth.
- **Related records:** SESSION-DEV-20261009-03; `docs/project-control/NEXT_ACTION.md`; `src/features/admin/screens/agent-messaging-screen.tsx`.


### EVT-DEV-004 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-04
- **Type:** CORRECTION
- **Summary:** Advanced WhatsApp Business from UI-only to a source-level server lifecycle: agent-authorized Meta OAuth with one-time state, encrypted token/session persistence, one-active-phone constraints, WABA subscription, raw-body HMAC verification, idempotent transactional webhook event processing, durable inbound message/status rows, and server-backed connection/briefing readiness. The daily briefing flag remains eligibility/preference only; no outbound sender or scheduled summary worker exists yet.
- **Impact:** Product capability/security boundary improved; live provider behavior and runtime correctness remain unverified.
- **Owner:** DEV-01
- **Suggested next action:** Implement outbound message sending and provider delivery persistence, then a `CRON_SECRET`-protected daily summary worker that only selects active, webhook-verified, briefing-enabled connections. Add route-level regression source for tenant isolation, OAuth replay, phone uniqueness, and briefing gating.
- **Related records:** I-090; SESSION-DEV-20261009-04; `src/lib/db/migrations/067_whatsapp_business_lifecycle.sql`; `src/app/api/whatsapp/oauth/callback/route.ts`; `src/app/api/webhooks/whatsapp/route.ts`; `docs/deployment/whatsapp-business.md`.


### EVT-DEV-005 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-04
- **Type:** CORRECTION
- **Summary:** Extended the WhatsApp lifecycle with explicit E.164 briefing recipient and opt-in persistence, a verified-connection-only eligibility action, and a CRON_SECRET-protected daily briefing sender scheduled from `vercel.json` at 03:00 UTC. The sender uses a configured approved Meta template, persists one run per connection/date, and records outbound provider message IDs/status. Current summary content is a deterministic digest of inbound message excerpts.
- **Impact:** Source now covers the initial scheduled outbound path; real provider setup and runtime delivery remain unverified.
- **Owner:** DEV-01
- **Suggested next action:** Add token expiry/revocation/reconnect handling, route-level security regressions, and reconciliation for ambiguous sending runs/provider-status races. Do not automatically resend ambiguous outcomes.
- **Related records:** I-090; SESSION-DEV-20261009-04; `src/app/api/cron/whatsapp-daily-briefings/route.ts`; `src/lib/db/migrations/067_whatsapp_business_lifecycle.sql`; `vercel.json`; `docs/deployment/whatsapp-business.md`.


### EVT-DEV-006 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-04
- **Type:** CORRECTION
- **Summary:** Added persistence for Meta `expires_in` when returned; the connection-status route and scheduled worker mark expired active tokens as errors and disable briefing eligibility. Graph 401/403 send responses also mark the connection unhealthy. Reconnect is exposed through the existing Connect action when status requires attention.
- **Impact:** Known-expired or provider-rejected credentials are no longer treated as briefing-ready or used for further scheduled sends.
- **Owner:** DEV-01
- **Verification:** Source-only. No token expiry transition, Graph error, test, build, or live provider behavior was executed.
- **Next:** Add revocation/permission-health probes, safe reconnect state, and route-level regression source. Keep ambiguous sends from being automatically duplicated.
- **Related records:** I-090; SESSION-DEV-20261009-04; `src/app/api/whatsapp/oauth/callback/route.ts`; `src/app/api/cron/whatsapp-daily-briefings/route.ts`.


### EVT-DEV-007 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-04
- **Type:** CORRECTION
- **Summary:** Persisted Meta token expiry when provided; expired tokens and Graph 401/403 send responses disable briefing eligibility. Added opt-in withdrawal, queue rotation/retry limits, and monotonic provider delivery status transitions shared by webhook and early-status reconciliation. Added route/helper regression source for OAuth replay/permission, tenant boundary, briefing gate, signatures/idempotency, recipient validation, digest bounds, and delivery ordering.
- **Impact:** Improves connection health handling, recipient consent control, queue fairness, and out-of-order delivery correctness.
- **Owner:** DEV-01
- **Verification:** Source only; regression tests have not been executed. No live Meta or scheduled send was run.
- **Next:** Add remaining phone uniqueness and duplicate webhook retry tests, proactive revocation/reconnect health, and reconciliation for ambiguous `sending` runs. No CI/Vercel polling.
- **Related records:** I-090; SESSION-DEV-20261009-04; `docs/project-control/NEXT_ACTION.md`; `src/modules/integrations/whatsapp-message-status.ts`.


### EVT-DEV-008 — 2026-10-09
- **Agent/session:** DEV-01 / SESSION-DEV-20261009-04
- **Type:** CORRECTION
- **Summary:** Added an authenticated WABA access probe to Messaging. A Meta 401/403 response marks the connection unhealthy and disables briefing eligibility; UI refreshes server status after verification/subscription errors. Added route regression source for this transition.
- **Impact:** Operators can check current Meta WABA access and are offered reconnection when provider credentials/permissions are rejected.
- **Verification:** Source only; tests and live Meta verification remain unexecuted.
- **Next:** Proactive token revocation/permission health, route-level uniqueness/duplicate retry coverage, and safe reconciliation of ambiguous sends.


### EVT-FIX-010 — 2026-10-09 — Gate background DB workers on migration success
- **Agent/session:** FIX-01 / SESSION-FIX-20261009-05
- **Type:** CORRECTION
- **Summary:** Owner-provided PostgreSQL logs showed repeated missing-table queries after migration failure. Self-hosted startup now disables local cron, ingest/reindex polling, and subscription sweeps unless migrations complete successfully; HTTP remains available for diagnosis.
- **Impact:** Reduces repeated background errors against an incomplete schema and prevents queue consumers from running before required tables exist.
- **Owner:** FIX-01
- **Commit:** `039847f0c6cd8496dcdeec163eb087b366f52f9b`
- **Verification:** Source-only; Docker/runtime behavior not verified.
- **Suggested next action:** Rebuild the current branch, then inspect fresh startup logs and migration output. Investigate the demo-organisation FK error only if it reproduces with current seed source.
- **Related records:** I-094; `src/instrumentation.node.ts`; `docs/project-control/VERIFICATION_STATE.md`.


### EVT-FIX-010 — 2026-10-10
- **Agent/session:** FIX-01 / SESSION-FIX-20261010-01
- **Type:** CORRECTION
- **Summary:** Investigated owner-provided missing-relation PostgreSQL logs and reported modal text overflow. Current source already prevents self-hosted pollers/crons from starting unless migrations completed; project records say the old runtime image and seed failure were not verified against current branch source. Applied a shared dialog primitive fix for viewport-safe dimensions and readable wrapping.
- **Impact:** UI correction committed; database runtime root cause remains source-supported but not runtime-confirmed.
- **Owner:** FIX-01
- **Suggested next action:** When the next normal runtime verification is performed, compare the running image commit with the feature branch and capture migration logs before deciding whether another DB source change is needed. Exercise the shared dialog with narrow viewport and long content.
- **Related records:** commit `8beed2bd32c117a3e7f8594c3d17d068471a5fd8`; `src/instrumentation.node.ts`; `src/lib/db/migrate.ts`; `src/lib/db/seed/production.ts`; `src/components/ui/dialog.tsx`; `docs/project-control/agents/FIX-01/WORKLOG.md`.


### EVT-FIX-011 — 2026-10-10
- **Agent/session:** FIX-01 / SESSION-FIX-20261010-01
- **Type:** ROUTE
- **Summary:** Historical PostgreSQL logs report missing `documents`, `ingest_jobs`, `event_outbox`, `kb_reindex_jobs`, and `platform_integration_oauth_apps`, followed by a seed FK error for a demo agent whose organisation row was absent. Current source already has migration-readiness guards and demo-organisation seed ordering, so these logs alone do not prove a current source defect. Database identity, running image/commit, migration ledger and migration failure output need OPS-01 investigation; no manual schema creation or database reset is authorized.
- **Impact:** Runtime/environment uncertainty; possible partial/stale schema. No current runtime PASS or failure reproduction established.
- **Owner:** OPS-01 for runtime/database identity and migration investigation; FIX-01 remains owner for source defects if current evidence isolates one.
- **Suggested next action:** Compare the running container image/commit and target database against the current branch; inspect `db:migrate` output and applied migration ledger, then route a reproducible application migration/bootstrap defect back to FIX-01. Do not wait for DEV-01.
- **Related records:** `docs/project-control/agents/FIX-01/WORKLOG.md`; `docs/project-control/AGENT_MEMORY.md`; `src/instrumentation.node.ts`; `src/lib/db/migrate.ts`; `src/lib/db/seed/production.ts`.


### EVT-FIX-012 — 2026-10-10
- **Agent/session:** FIX-01 / SESSION-FIX-20261010-02
- **Type:** CORRECTION
- **Summary:** Continued the authorized shared UI audit after the Modal fix. Added viewport-bounded sizing and wrapping/scroll safety to Popover, HoverCard, AlertDialog, Sheet, Drawer, Tooltip and DropdownMenu; added a focused source-contract regression test for shared panel/card layout. Existing Dialog/Card/Modal protections were retained.
- **Impact:** Shared UI primitives across screens; intended to prevent narrow popup overflow and pathological long-token layout.
- **Owner:** FIX-01
- **Suggested next action:** Run the focused Vitest test/typecheck when local execution is available and visually inspect representative popovers/dialogs/cards at mobile and desktop widths. Continue checking feature-level overrides; do not claim UI-wide verification from source assertions.
- **Related records:** `docs/project-control/agents/FIX-01/WORKLOG.md`; `docs/project-control/AGENT_MEMORY.md`; `src/components/ui/layout-primitives.test.ts`; commits `da0f74909bfa4e92d1268ef4e0eb384d07ad9ed6` and related UI commits.


## EVT-FIX-013 — 2026-10-10 — Feature-level dialog wrapping
- FIX-01 continued the UI audit beyond shared primitives. Organisation integration credential and platform OAuth dialogs now have viewport-bounded height, internal scrolling, shrink-safe headers/content and overflow wrapping; AI capability drawer is viewport-constrained; KB collection identifiers use readable wrapping instead of blanket `break-all`.
- Regression test extended for these feature-specific contracts. Source commits: `51e6bb6e63558366b7965e644e0a02f61bbff951`, `1cc758978a0f89d86d8116f7217a63aa5b8f91cc`, `7934375741d50d91fc80a7615ee54dd6a7d4762e`, `3957e0e56d83fbd73ad00c27712b71a4f57d3ed6`, `13f353079f87c06d7b30d92d8cc00e180dbe1b90`.
- No local tests/typecheck/build or browser review executed; no pass claimed. PostgreSQL missing-relation and seed FK incident remains with OPS-01; no DB changes.


## EVT-FIX-014 — 2026-10-10 — Subscription and agent workspace overlays
- FIX-01 corrected viewport/overflow risks in subscription manager, plan editor, billing-history drawer, publish-review dialog, and create-knowledge-base dialog. Published preview/public URLs now use natural wrapping plus overflow fallback rather than blanket `break-all`.
- Source commits: `a6210e04a989bce8edb2cb76792411919281d54a`, `3432cfc4e242c8368516e662ad8ff483f8fc2dc4`, `0829d7de2e73804b70dcf1a5e94a5dafd852bdfb`, `de3cbeb8dd55b445e2dd41376d0a8e54386013fc`. Regression test commits: `7978dfbe315eade0624f69dc6cb00991f025d4c9`, `9ac73b5e16911336cb07aff7c855e7dba34467c0`.
- No local tests/typecheck/build or browser visual inspection executed; no pass claimed. PostgreSQL missing relations and seed FK incident remain assigned to OPS-01; no DB changes.


## EVT-FIX-015 — 2026-10-10 — API-key/account dialogs and remaining long-text wrapping
- FIX-01 further corrected published URL controls, profile/security, API-key reveal/create/edit, create-agent, deploy/publish control overlays, organisation detail values, verification email addresses, API endpoint paths and email-template links. Replaced blanket character breaking with natural wrapping and an overflow fallback where relevant.
- Main source commits: `12d2084e632d2e3ac4f148866ca9c306b6692634`, `2a0dd11877a8a9f0bbf696cf22da67b431a93993`, `83c0e3fb204fb6d02a0c7f85eff40bd0efe88343`, `b3dd007174d26d7211c0731765f3af21ae5946f4`, `6a469d8a8e5913135d138d88dc6dac20239ebae4`, `1daaa3499d4ba23d3c7467ae1f693540c31e73c8`, `23d97b61778841324c0433c6848fe564fa782197`, `67ff1f93b0ace55e0d0779725fc3f74f85a666f3`, `70bb57b56ac4df0cab45ade6b6b2ac5ba3197c90`, `6820bc0b6c378dcb91b220d9b96dafd174b10b9b`, `3968b0a8c874b522e7c56593fdecf1b892e286c7`.
- Regression suite expanded to 8 source-contract tests (`7ef3079c6030517173ece75654f0ba248443b7cc`). GitHub source was re-fetched, but local tests/typecheck/browser inspection remain outstanding; no PASS claimed. PostgreSQL incident remains with OPS-01.


## EVT-FIX-016 — 2026-10-10 — Configuration editor and long identifier layouts
- FIX-01 corrected viewport bounds on the fullscreen system-prompt editor, removed destructive truncation from the workspace creation CopyField, and added overflow-safe layout to embed API-key display/edit UI. Added regression source-contract coverage (9 tests total).
- Source commits: `f08a22b362f8e8f22a2f6ae4a54cc24920699308`, `df664109eb702e46d412fa0de782254ea926926a`, `902957dfec2c9c5c10a9a52e463e63be180b5439`; test commit `90e99a0b25907f4501c0d05e5c8b3662b1d348fb`.
- No local test/typecheck/build or browser visual inspection performed; no pass claimed. PostgreSQL issue remains with OPS-01.


## EVT-FIX-017 — 2026-10-10 — Status diagnostics and identifiers
- FIX-01 removed destructive `break-all` formatting from AI-provider error cards and the Qdrant collection identifier, and removed truncation from the organisation ID in workspace facts. Source-contract suite now contains 10 tests.
- Source commits: `be2d3984232c7245bac1213fa749fa0d1f7a4866`, `6e418d2144b44070d4ae7f6703512dc4a200f553`, `515355ef503c0874e53ffa58106b9a097fa52e85`; test commit `294b17f5f5f7f4dac75f89c70f6608fc8cce4deb`.
- No local execution or browser visual inspection; no PASS claimed. OPS-01 continues to own the PostgreSQL incident.


## EVT-FIX-018 — 2026-10-10 — Analytics and agent-card text visibility
- FIX-01 corrected remaining Qdrant collection `break-all` formatting and changed recent-agent names/descriptions and analytics top-query text to natural wrapping rather than truncation. Regression suite now contains 11 source-contract tests.
- Commits: `515355ef503c0874e53ffa58106b9a097fa52e85`, `03d4131fbd87e458483da77fd5103cbd6cb8124a`, `ca58ea8a429bc4c12524e1949112ccbef8950f9e`; test commit `53c1501ca5a42d8110ed26869388c2ac4df6d7eb`.
- No local tests/typecheck or browser visual review run; no PASS claimed. OPS-01 owns the PostgreSQL incident.


## EVT-FIX-019 — 2026-10-10 — Demo text and OAuth form width containment
- FIX-01 traced the reported width issue to demo chat bubbles relying on `max-w-[85%]` inside flex rows with avatar siblings, without `min-w-0`/explicit remaining-width constraints. Constrained the chat container, bubbles, and citations; made OAuth modal footer wrap and form controls shrink safely.
- Commits: landing demo `a2ddf694fcb6c4e76f5c0c85879ebed13ee632aa`, bubble correction `982801734aad1757336d118067ec145be5bd8299`, OAuth form `018d87da30f5479d61f447d5263c2acaa388fdad`; test commit `a3a0112b4907bc18ad1a216830b216344c2f671b`.
- Source-contract suite now has 12 tests. Tests/typecheck/browser review not executed; no PASS claimed. OPS-01 owns database incident.


## EVT-FIX-020 — 2026-10-10 — Live conversation bubble width containment
- FIX-01 found the same flex-bubble width pattern in the live conversation UI. Removed percentage-only max-widths that did not account for avatar/gap space, applied shrink-safe width bounds and natural long-text wrapping to welcome/user/assistant messages.
- Source commit `ef49a5a4d13409be85f325f0644e65c2259326b4`; regression test commit `c42cb59fc726985dc6ad71ecb1626233b0c9c8ca`. Source-contract suite now has 13 tests.
- Local tests/typecheck/browser visual review not performed; no PASS claimed. OPS-01 retains database incident.


## EVT-FIX-021 — 2026-10-10 — Long text in email and billing cards
- FIX-01 removed truncation from email-template audit subjects, organisation billing notes, and email variable descriptions/custom values; affected rows now shrink and wrap instead of hiding text or forcing a rigid row.
- Commits: `67a9f793113a34494287804861e6b60eae435a19`, `aaacf4c12d036ee108eeeb1d911f15d4e266ce59`, `dde58e8a6737d0619e4884f5f8d37facf05cf781`; test commit `ba188039024cc1177d420a9f56b8a8fe98c34a3c`. Source-contract suite now has 14 tests.
- Local test/typecheck/browser review not run; no PASS claimed. OPS-01 retains PostgreSQL incident.


## EVT-FIX-022 — 2026-10-10 — Long URLs and source-card labels
- FIX-01 changed payment webhook URL display, organisation member identity rows, uploaded document labels, and web source title/filename/root URL display to wrap safely rather than truncate in constrained flex layouts.
- Commits: `43db1b383e2af3cd97e5f031de3c91bd603c3247`, `ecc48ef8eb02808a099678c6aeafbeb43afbb5b6`, `d60cd3c580db17e341124c497a5a0310cf495f64`, `e0a2afaac07ac2d2b3a93f005c715a100d3221fe`; regression test commit `683d05a51c973b13575413a0d1b88ebd7b0bc17d` (15 source-contract tests).
- Vitest/typecheck/browser review not run; no PASS claimed. OPS-01 retains PostgreSQL incident.

- **EVT-FIX-022 follow-up:** Also fixed the root URL in pending/empty web-crawl session cards, which a second source review found still used truncation. Commit: `f82471c07fa9cc1a2205b71c09b0ab6470c9e130`.


## EVT-FIX-023 — 2026-10-10 — Analytics and configuration text wrapping
- FIX-01 removed truncation from top-query analytics text, organisation usage names/slugs and metric values, configuration option labels/descriptions/preset names, and language picker names.
- Commits: `0d22fb9cb26b86c3495e1c06809a514382460c7b`, `7dc2f59cadcee1a8a4d57fe98c17bcb68a933c69`, `22c83d90b470259f963e458e9acf22b2c04ec206`, `0769bb726ba0d5d427cb40f3955c2a6f9472abd6`; test commit `6dac46b7bf397c9751e18e611f9ff6f06ac5fecf` (16 source-contract tests).
- Runtime tests/typecheck/browser review remain pending; no PASS claimed. OPS-01 retains PostgreSQL incident. This independent FIX-01 work does not supersede current NEXT_ACTION.md owner/workstream.


## 2026-10-10 — FIX-01 landing/login card clipping follow-up
Owner reported the same clipping/design issue on the public landing page and login card. FIX-01 adjusted the landing hero wrapper and feature-card text to be shrink-safe/wrappable, and constrained the login card/form fields to their container. Regression source was added to `src/components/ui/layout-primitives.test.ts`. Source commits: `4dcf32954d6e2c31ac3b022977af20dba7565e24`, `06c9343cb0cf3f8ffcc76bfacde63a22f58aeb40`. Runtime test and deployed-browser verification remain pending; no PASS claimed.


## EVT-FIX-20261010-02 — Public/authentication card audit
FIX-01 extended responsive clipping fixes to signup plan/account wizard, forgot-password, reset-password, and email-verification cards. Inputs now use shrink-safe border-box sizing, cards are constrained to their parent width, and signup plan rows wrap on narrow viewports. Source commits: `e88747825ffb3923543e056e14c46b0c88cafe1c`, `b45db54a1342b9153face2848232428c1c00a6ef`, `2de0043febf3d0f20f7e2c996ae6da2cbd729736`, `eac422cfaa8cf7199ad56968448d0ab7fc2b1c43`. Live mobile DOM checks returned HTTP 200 for landing/login; screenshot service returned upstream 502. No Vitest/typecheck/browser visual PASS claimed.


## EVT-FIX-20261010-03 — Roadmap resumed; WhatsApp health and failure handling
- Corrected daily-briefing send error handling so Meta failure classification is computed before the run error code is persisted; added pure classification regression cases.
- Added migration 068 for health-probe timestamps and a new authenticated-by-secret scheduled WABA health endpoint. It expires stale tokens, probes active WABA access in bounded batches, marks auth/permission-rejected connections unhealthy and disables briefing eligibility, and does not mark transient provider/network failures as revocation.
- Added Vercel cron schedule every 15 minutes and tests for health classification. Commits: `4b51268cc6b892d94d3db5b3e071fcebdb89b1cf`, `4f7dbcc1826fc19a77bd6b45a07b77255162c1b7`, `c1bf0e723720aa70b299bf396580634c3cf25960`, `c3aa12fa670a15316d8e8c80acf6d2c646182fc2`, `ab4436eb6f21114f67706ef227336679ec36af9c`, `bf753134206cb69d1dfcd52352c5c68694ca92a6`, `996080bfcf93cd039291cd78f96d3936dc6c8ac6`, `9497f19585ad386ea721536bb20092e0634c84c5`.
- No test/typecheck/build/deployment PASS claimed. Browser DOM checks succeeded at HTTP 200 but screenshot capture failed upstream, so visual review remains pending.


## EVT-FIX-20261010-04 — Pricing and checkout card audit
- Extended the UI clipping audit to pricing cards/feature lists/FAQ, checkout plan summary/payment method panels, checkout-success receipt rows and transaction reference, and the legacy signup verification screen.
- Added regression assertions for those surfaces. Commits: `cb2cf12daad6690e370df6d79b948e696de900a8`, `1b46a4f70634e90aeb0786fd401331d9f5930090`, `eede473e8a51462ba0397cd9dacc54ee087101ac`, `cbfc751f0c51e7bffe1fd119e10933195535383f`, `96f30aeabcafa4aa6a5495e36cec75f2d03d6b93`.
- Tests/typecheck and visual review remain pending. Browser screenshot service returned upstream 502; DOM crawl timestamps predate the latest commits. No PASS claimed.


## EVT-FIX-20261010-05 — WhatsApp health route regression coverage
Added `src/app/api/cron/whatsapp-connection-health/route.test.ts` for CRON_SECRET enforcement, expiry handling, token revocation/permission rejection, and transient Graph API failures. Commit: `023ba0b25b615f3badd6ff5b30b47b93afe7d832`. Test source only; Vitest/typecheck not run because no repository runtime/dependencies are available and outbound GitHub clone DNS failed.


## EVT-FIX-20261010-06 — Safe reconnect and ambiguous-send quarantine
- Messaging now gives an explicit reconnect affordance and explains that briefing eligibility remains disabled for unhealthy saved connections until the connection and webhook are healthy. Regression source added.
- Daily briefing cron now quarantines stale `sending` runs with no provider message ID after 30 minutes as terminal `SEND_OUTCOME_UNKNOWN`, raises attempt_count to the retry limit, and avoids an automatic resend that could duplicate a message. Route regression source covers this condition.
- Commits: `ab9a776eced829f8e88847d1c42a72170a70f8e3`, `2ab69e96434de51baadd8ebfaad6a85e563ffe97`, `afe11cf0ff1a95e4e6524f2e02b90cc168f785fb`, `3d506bf3e91734e9b9851702e0651dcc2d6c49cf`. Tests/typecheck not run; no provider delivery PASS claimed.


## EVT-FIX-20261010-07 — Public contact card audit
The public contact page now uses shrink-safe layout wrappers, bounded card width and border-box form controls. Added regression coverage. Commits: `59a671286a55ff04bd34ba41003c5db015b5afa2`, `518c238d84e93f4d214e0ff802c9b317fd834e01`. Runtime tests/typecheck and screenshot-based visual verification remain pending.


## EVT-FIX-20261011-01 — Stripe invoice.paid references missing organisation

- **Symptom:** Rebuilt backend is healthy and migrations report applied, but Stripe `invoice.paid` event `evt_1UP9JaSH7giJdRbDjderTSey` repeatedly fails with SQLSTATE 23503 on `billing_events_org_id_fkey`; missing key is organisation `d8f78644-3198-41db-bcc3-278ecad0ecb4`.
- **Root-cause trace:** `invoiceOrgId()` reads subscription/invoice metadata; webhook inserts that ID into `billing_events` without verifying it maps to an organisation in the active database. The direct failure is a Stripe-to-database tenant referential mismatch. Why the tenant is absent is not yet established.
- **Failed approaches prohibited:** Do not disable/drop the FK, create a placeholder organisation, reset/reseed production data, or change webhook acknowledgement semantics to suppress retries without reconciling the paid event.
- **Remedy/route:** OPS-01 to correlate the exact invoice/subscription/customer against `org_subscriptions` and `organisations` in the same DB used by the running container, verify DB/image/environment alignment, then report the authoritative tenant mapping. FIX-01 holds application changes until evidence proves an application-side lifecycle defect.
- **Prevention lesson:** Migration success proves schema application, not tenant-row consistency. Trace metadata-to-row relationships before changing schema or billing logic.
- **Evidence:** User-provided Docker logs; source inspection of `src/app/api/webhooks/stripe/route.ts` and `src/lib/stripe-activation.ts`.
- **Verification:** Not resolved. No DB/Stripe API access, tests, or source patch performed.
- **Next:** OPS-01 investigation; preserve the exact event ID and org UUID in internal logs, never expose customer secrets.


## EVT-FIX-20261011-02 — MCP missing credential mislabeled as 502

- **Symptom:** MCP test route returned 502 with `MCP_NO_PLATFORM_CREDENTIAL` when the registered server had no stored platform bearer credential and the caller supplied no temporary `bearerToken`.
- **Root cause:** A local configuration/input failure was assigned the same HTTP status as an upstream handshake failure; the resolver was not called in this case.
- **Remedy:** Missing platform bearer credential now returns HTTP 400. Added a route regression asserting error code/status and no upstream probe. Commits: `426e06fde3da96ee60b155ecafcf3b6c59825105`, `9e63b8bffcacf391557ad281303294a6e5352d18`.
- **Verification:** Regression source authored, not executed; no live MCP handshake or deployed behavior verified.
- **Prevention:** Keep local config failures in 4xx responses and upstream endpoint/handshake failures in 502 responses. Do not include user-provided auth cookies in durable logs.

## EVT-FIX-20261012-01 — 2026-10-12

- **Agent/session:** FIX-01 / SESSION-FIX-20261012-01
- **Type:** CORRECTION
- **Summary:** Root-cause trace of the supplied 44-error type-check report found a partial ambient `declare module "stripe"` in `src/types/payments.d.ts` shadowing the installed Stripe SDK types. Removed that block while preserving the separate Razorpay declaration.
- **Impact:** Local application type-check source blocker; Stripe-related missing-member diagnostics should be reassessed against official SDK types after the user reruns type-check.
- **Owner:** FIX-01
- **Suggested next action:** Pull commit `34aca73cd5ad2fc5c67396d1d35f24dcf38d7964`, rerun `npm run type-check`, and triage only the residual compiler errors. Do not downgrade dependencies or suppress type errors.
- **Related records:** I-097; SESSION-FIX-20261012-01; `src/types/payments.d.ts`.

### EVT-FIX-20261012-02 — FIX-01 continues type-check correction
- Date: 2026-10-12.
- Owner reran npm run type-check after Stripe ambient declaration removal; diagnostics fell from 44 errors / 19 files to 33 / 15 files.
- FIX-01 committed compatibility corrections for Stripe API version, DayPicker v10, Recharts v3, react-resizable-panels v4, ioredis/BullMQ option typing, pdf-parse v2 metadata, ReactMarkdown v10, test import resolution, and lazy queue typing.
- Evidence status: source commits only; no post-change compiler output yet. Not PASS.
- Next: pull latest branch and rerun type-check; triage only fresh residual diagnostics.

### EVT-DEV-20261022-FEATURE-FLAGS-01 — 2026-10-22
- **Agent/session:** DEV-01 / Forge / SESSION-DEV-20261022-FEATURE-FLAGS-01.
- **Type:** OWNER-AUTHORIZED PRODUCT IMPLEMENTATION / CROSS-ENVIRONMENT ISOLATION.
- **Symptom/root cause:** Feature 13 widget and Feature 23 integrations/MCP/WhatsApp were entangled with production routes and setup UI. Existing `CLARA_ENV` isolated databases/queues, but absent dedicated feature admission meant hiding a UI tile could not stop public endpoints, OAuth, webhooks or already-registered tools.
- **Remedy:** Two deployment-process flags, development ON and production OFF by default, strict per-env overrides, middleware 404 gates before OPTIONS or handler, no-store client capability display, navigation/settings/KB/publish/landing/console filtering, underlying integration runner and registered MCP tool execution guards, unchanged security/tenant checks. Source commits `3a651654`, `5418fc46`, `928290d1`, `fe8a5abb`, `2ab1b507`, `74b45a8c`, `cea132ca`, `954a2261`; tests `ac606782`, `09e22f8a`, `190a8093`, `390771c0`, `a4861ce3`.
- **Lesson:** Shared-environment toggles must be process/deployment scoped, never shared DB, NEXT_PUBLIC build state or UI-only; enforce on every credential/provider entrypoint and call-time runtime seam, keeping core endpoints operational. Disabled does not imply erased code/configuration.
- **Verification:** GitHub source commits accepted, no executable test/typecheck/build/deploy performed; cannot claim production state. Historical CI PASS does not cover this change.
- **Handoff:** OPS-01 controls env deployment/smoke checks; DEV-01 source-only; route independently reproduced defects to FIX-01.
- **Next:** Bounded tests/type-check when checkout available; targeted fixes to reported errors; no CI/Vercel wait.
