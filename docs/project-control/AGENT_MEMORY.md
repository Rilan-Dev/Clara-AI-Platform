# APCP Shared Agent Memory

This is the shared, durable memory layer for all APCP agents. It is a memory/lessons record, not an authorization source.

## Authority order

1. Current explicit owner requirement
2. Repository-local governing instructions
3. GitHub committed source/state
4. Active authorization and project-control state
5. This shared memory
6. Per-agent memory
7. Chat/session memory

Memory never overrides current requirements, authorization, or repository truth.

## Purpose

Record reusable lessons so a newly invoked agent can avoid repeating known mistakes without needing a previous chat.

Record:
- recurring bugs and root causes;
- failed approaches and why they failed;
- successful remedies;
- regression-prevention rules;
- environment/deployment lessons;
- cross-agent lessons that materially affect future work.

Never record secrets, tokens, passwords, private keys, or sensitive personal data.

## Read-first rule

Every invoked agent reads this file before starting work, then reads its own role-local MEMORY.md and WORKLOG.md. The agent also reads AGENT_EVENTS.md, AGENT_SESSIONS.md, AGENT_HANDOFF.md, and AGENT_BACKLOG.md when relevant.

## Entry format

Append lessons under the owning agent section:

- **Date/session:** <date / session id>
- **Agent:** <agent id>
- **Issue/symptom:** <what happened>
- **Root cause:** <confirmed cause>
- **Failed approach:** <what did not work and why>
- **Remedy:** <what worked>
- **Prevention:** <how future agents should avoid recurrence>
- **Related record:** <issue/event/commit/path>

## Agent memory sections

### DEV-01 / Forge


- **Date/session:** 2026-10-09 / SESSION-DEV-20261009-01
- **Agent:** DEV-01 / Forge
- **Issue/symptom:** Realtime voice exposed only `rag_search`; integration tools could not be invoked by a live voice session.
- **Root cause:** The Realtime session descriptor list and browser tool-call handler were not connected to the existing server-side integration runtime.
- **Failed approach:** Treating client-supplied KB/tenant/agent identity or a model tool descriptor as sufficient authorization would bypass server-side provenance and tenant boundaries.
- **Remedy:** Gate descriptors behind both existing default-off flags and authenticated KB membership; submit calls to a same-origin route that derives org/agent/user/session identity from server state and invokes the existing Unified Tool Runtime.
- **Prevention:** Every voice tool call must pass server authentication, KB access checks, a factory-minted execution context, and the existing runtime; public embed sessions must not receive these workspace integration tools.
- **Related record:** `src/modules/assistant/api/realtime-tool.ts`; source commits a2dee343b099edef6ad6337fef976047c3f59aa5, c36b5b67beabad175ea9530293846ef8763b3151, f3e8efda5b7a12173e313ee4f476774c62092e52, a64e8f3258b9ab8e59f4f0258c600b1e0ddf13e9, a218e2a354e0c83e7944dbe9b32ad6bebbb574bf, f830efd8fb03f778a4277b2817cc2e684266c3cb, 29e470aea416cd3cc1af56e0a27a1320013498f5, e6da6968d3d7d6e422b309e5188562578f2adb56.

<!-- Append durable development lessons here. -->

### DEV-01 / 2026-10-09 — OAuth token refresh contract
- **Issue/symptom:** A provider OAuth token exchange may succeed with client credentials sent via HTTP Basic, but later refresh can fail if the runtime always places credentials in the form body.
- **Root cause:** OAuth client-auth mode was not preserved in the stored connection credential contract.
- **Remedy:** Persist `authorization_method` with OAuth2 token data and make both authorization-code exchange and refresh honor the provider registry's HEADER/BODY setting.
- **Prevention:** When adding an OAuth consent flow, review the full token lifecycle (authorization code, refresh, expiry, reconnect), not only the initial exchange. Never log token endpoint response bodies or credentials.
- **Related record:** `src/app/api/integrations/oauth/callback/route.ts`; `src/modules/integrations/runtime/runner-helpers.ts`; `src/modules/integrations/types.ts`.

### FIX-01 / Sentinel

- **Date/session:** 2026-10-09 / SESSION-FIX-20261009-01
- **Agent:** FIX-01 / Sentinel
- **Issue/symptom:** Docker production build failed resolving five relative TypeScript modules: `store.js`, `files-service.js`, `connections-manager.js` from `context-builder.ts`, and `action-input-validation.js`, `error-normalization.js` from `runner-core.ts`.
- **Root cause:** The source used explicit `.js` suffixes for sibling modules implemented as TypeScript files; Next.js webpack did not resolve those five imports in this build path. The target `.ts` modules exist in the same runtime directory.
- **Failed approach:** Rebuilding the image without correcting source could not change module resolution; bringing the service up with `--no-deps` merely left the previous healthy container running and was not evidence that the new source built.
- **Remedy:** Changed only those five relative imports to extensionless paths, consistent with the other runner-core imports and the existing Next.js webpack path.
- **Prevention:** For this Next.js webpack runtime, keep local TypeScript sibling imports extensionless where the build resolver does not map explicit `.js` specifiers to `.ts`. Do not weaken the build or substitute a stale container for a successful image build.
- **Related record:** `src/modules/integrations/runtime/context-builder.ts`; `src/modules/integrations/runtime/runner-core.ts`; commits `ec1d0cd88d16e626ffbb9af7ed44a6b9e1320210`, `8da4ec31da847a9a024d27ad49c2ee53d67f0372`; EVT-FIX-003.

<!-- Append durable error/root-cause lessons here. -->

### OPS-01 / Shipwright
<!-- Append durable CI/CD/deployment/infrastructure lessons here. -->

### WORK-01 / Rover
<!-- Append durable daily-worker/maintenance lessons here. -->

### OPS-01 / 2026-10-09
- **Issue/symptom:** Vercel clara-backend build failed during db:migrate with duplicate migration number 060.
- **Root cause:** deployment commit 4ea79c3b3bbb5202a25f2411b63471354200b01d introduced a second 060 migration while 060_sarvam_realtime_streaming.sql already existed; the migration runner correctly rejects duplicate numeric prefixes.
- **Failed approach:** treating the failure as Vercel infrastructure and bypassing db:migrate or weakening the guard.
- **Remedy:** route the migration-source correction to FIX-01 and preserve the fail-closed guard.
- **Prevention:** distinguish deterministic repository migration failures from Vercel platform failures before changing deployment configuration.
- **Related record:** EVT-OPS-001; BACKLOG-OPS-001; deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf.

## Memory conflict rule

If shared memory conflicts with current repository state or current requirements, ignore the stale memory, record the conflict in AGENT_EVENTS.md or ISSUES.md when material, and follow current repository truth.

### OPS-01 / 2026-10-09 — split deployment paths
- **Issue/symptom:** Vercel-Preview and feature/ai-core-from-doable-source had different active failures even though both had historical migration/Tailwind blockers recorded.
- **Root cause:** Vercel-Preview was at an older divergent source state with a missing CliLog import and incomplete seed dependency set; the feature branch Dockerfile had a brittle assumption that ioredis transitive dependencies are top-level hoisted.
- **Remedy:** Diagnose each deployment path against its exact branch/commit and route application/build defects to FIX-01; do not change Vercel infrastructure or weaken Docker/npm reproducibility.
- **Prevention:** Always inspect the actual deployed ref and latest build stage before relying on prior incident records.
- **Related record:** EVT-OPS-003; EVT-OPS-004; HANDOFF-OPS-20261009-02.


### FIX-01 / 2026-10-09 — Follow-on webpack sibling import failures
- **Date/session:** 2026-10-09 / SESSION-FIX-20261009-02
- **Agent:** FIX-01 / Sentinel
- **Issue/symptom:** Docker's Next.js 16.4.0 webpack build still reported unresolved `credential-vault.js`, `execution-authorization.js`, `runner-helpers.js`, and `error-normalization.js` imports after an earlier five-import correction.
- **Root cause:** Three runtime files still used explicit `.js` suffixes for sibling modules implemented as TypeScript source: `connections-manager.ts`, `runner-core.ts`, and `runner-fetch.ts`. The import traces exposed the exact remaining specifiers.
- **Failed approach:** The prior correction only addressed the five imports shown in the earlier build log; it did not cover newly exposed sibling imports in the dependency chain. Re-running Docker without source changes cannot fix resolution.
- **Remedy:** Converted the five remaining relative imports in those three files to extensionless paths, matching the already established local webpack convention.
- **Prevention:** When a module-resolution build error moves deeper through the import graph, inspect each exact failing specifier and its source extension; don't assume the previous batch covered the whole dependency chain.
- **Related record:** `connections-manager.ts`, `runner-core.ts`, `runner-fetch.ts`; commits `f507443805130d1068b8fe570bc0940f4e8ace1b`, `8eb329af87f1225342b10b9c299fa8163812a9eb`, `21576b8e5e3db30fd5a61325712e0d89dfe38369`.


### FIX-01 / 2026-10-09 — Third webpack import-resolution pass
- **Date/session:** 2026-10-09 / SESSION-FIX-20261009-03
- **Issue/symptom:** The next owner-provided Docker build exposed five further unresolved imports in `execution-authorization.ts` and `runner-helpers.ts`: registry index, error normalization, credential vault, runner fetch, and runtime types.
- **Root cause:** These files retained explicit `.js` suffixes for TypeScript source imports; the registry import used an explicit `../registry/index.js` despite the actual registry being `src/modules/integrations/registry/index.ts`.
- **Failed approach:** Correcting only import statements reported in previous webpack output left deeper dependency imports unresolved. The newly pasted build was run against the prior correction state and did not include this newest correction.
- **Remedy:** Changed only the six remaining explicit `.js` import specifiers in the two affected files to extensionless paths.
- **Prevention:** Follow each fresh webpack import trace to the importing file and compare the resolved target path and extension; do not stop at the first layer or treat an old running container as proof.
- **Related record:** `execution-authorization.ts`, `runner-helpers.ts`; commits `d9d114c8492892ebf4ce16ae4e6d93baa8ab97a8`, `a47d087cfc5dc68251eb4c421dbdf4b1ac6c373b`; I-092.


### FIX-01 / 2026-10-10 — Missing-schema poller errors and dialog text overflow
- **Date/session:** 2026-10-10 / SESSION-FIX-20261010-01
- **Agent:** FIX-01 / Sentinel
- **Issue/symptom:** Owner-provided PostgreSQL logs from 2026-10-08 show repeated missing relations (`documents`, `ingest_jobs`, `event_outbox`, `kb_reindex_jobs`, `platform_integration_oauth_apps`) plus a demo-agent organisation foreign-key failure. Owner also reports modal/card width defects and text wrapping one word/letter per vertical line.
- **Root cause:** The database log pattern is consistent with background consumers and seed code running against a schema that was not fully migrated. Current branch source in `src/instrumentation.node.ts` already gates local cron/ingest/subscription workers behind successful migrations (`schemaReady`) and leaves them disabled when migrations fail or are disabled. Project-control also records the old runtime/image as unverified/stale and states the demo-org-before-agent seed order is already present in current source. Therefore the supplied historical log does not prove the current branch still has that defect; an old image or failed/partial migration is the strongest source-supported explanation. UI root cause was shared dialog geometry: `DialogContent` used `w-full` with no viewport-height bound or scroll container and the header/title/description did not enforce shrink-safe wrapping.
- **Failed approach:** Do not create missing tables manually, reset the database, or treat a healthy old container as proof that new source is running. No CSS per-page patchwork was used.
- **Remedy:** Updated shared `src/components/ui/dialog.tsx` with viewport-safe responsive width/height, vertical scrolling, shrink-safe header/title/description, and overflow wrapping (commit `8beed2bd32c117a3e7f8594c3d17d068471a5fd8`). Updated shared `src/components/ui/card.tsx` with shrink-safe card/title/description/content and wrapping footer controls (commit `f309ab93f80eb9eaa6246d72d17aa5d2d1c5c88f`). Database source guard was inspected and is already present; no duplicate migration/seed rewrite was made without fresh current-runtime evidence.
- **Prevention:** On missing-relation storms, confirm the exact running image/commit and migration outcome first; keep all background DB workers behind migration readiness and never hand-create schema to silence logs. For modal UX, fix shared dialog primitives before adding local component overrides; test narrow viewport, long unbroken strings, and long dialog content.
- **Related record:** EVT-FIX-010; `src/instrumentation.node.ts`; `src/lib/db/migrate.ts`; `src/lib/db/seed/production.ts`; `src/components/ui/dialog.tsx`.


### FIX-01 lesson — responsive floating panels and text wrapping (2026-10-10)
- **Issue/symptom:** Popup/panel widths and card text could overflow narrow layouts; long labels could wrap poorly. Blanket `break-all` is not an acceptable global fix because it can split ordinary words into narrow vertical-looking stacks.
- **Root cause:** Shared floating primitives had fixed widths or lacked viewport max-width, shrink-safe sizing, or bounded scrolling/wrapping contracts. This is a source-level diagnosis; individual screen-specific defects still need visual confirmation.
- **Failed approach:** Do not apply global `word-break: break-all` or treat class-source tests as proof of correct visual rendering.
- **Remedy:** Constrain shared popover/hover-card/tooltip/dropdown widths to the viewport, allow overflow wrapping for long tokens, and add max-height/scrolling/shrink safety to dialog-like surfaces. Add focused regression tests for the shared contracts.
- **Prevention:** Fix shared primitives before per-screen overrides. Follow with a feature-level search for custom width/whitespace classes and perform browser checks at narrow and desktop widths.
- **Related record:** FIX-01 `SESSION-FIX-20261010-02`; `src/components/ui/layout-primitives.test.ts`; commit `da0f74909bfa4e92d1268ef4e0eb384d07ad9ed6`.


## 2026-10-10 — FIX-01 OAuth configuration UX lesson

The platform OAuth form must never ask admins to register a generic `your-domain/api/.../callback` placeholder. Clara's current shared callback contract is `/api/integrations/oauth/callback`; the UI should derive the origin from the current deployment, display the URI read-only, and the server must independently validate the same path. Keep platform OAuth app setup separate from end-user consent/connection status. Doable's docs also distinguish sign-in OAuth from integration OAuth and show credential source/readiness; adapt the principle, not its different callback routing architecture. This record is not authorization and does not claim live verification.


## 2026-10-10 — Doable integration OAuth source comparison
Inspected Doable source: `services/api/src/integrations/oauth2.ts`, `services/api/src/routes/integrations-oauth.ts`, and `services/api/src/routes/integrations-admin.ts`. Useful patterns: derive public redirect origin separately from internal service URL; support an explicit public redirect override for reverse proxies; resolve OAuth credentials from admin DB then per-integration and shared Google/GitHub env; never return client secrets; make credential source/readiness visible. Adapt these principles to Clara's own route/schema/runtime; do not copy Doable's different storage/routing implementation.


### OAuth setup follow-up — 2026-10-10

- Provider-specific setup guidance belongs in a pure helper with tests; unknown integration IDs must fall back to generic steps instead of guessed links.
- Safe OAuth-app readiness metadata may expose credential source and a boolean that a secret is configured, but never the encrypted secret itself.
- Keep platform-managed OAuth credentials database-backed and encrypted. Do not add environment-variable fallback until precedence, rotation, audit, and deployment ownership are explicitly designed.
- Source commits for the latest follow-up: `7fb942255f2dd3daf13e9a9e32270d70ff02938c`, `f1ebf20ef6242204ccb144b570f0ace5a874e052`, `9652855d4408737f3a6930f02caced07002eb65f`, `3a0a3e8864f0497facd85626b22e537a8225e1df`, `c55294c100647b9d3287503a7909197aa0960c85`, `f97140906cc4c63e7840d007e2a5d3c5b42ba986`.
- Authored tests are not executed evidence. In an environment without a checkout or GitHub DNS, record the execution blocker separately from test results. Keep I-096 open until provider-backed OAuth and runtime evidence are recorded.


## 2026-10-11 — FIX-01 Stripe invoice webhook orphan organisation

- **Symptom/evidence:** User's freshly rebuilt Docker image starts and reports migrations already applied, but repeated `invoice.paid` event `evt_1UP9JaSH7giJdRbDjderTSey` fails inserting `billing_events` with PostgreSQL FK `billing_events_org_id_fkey`: `org_id=d8f78644-3198-41db-bcc3-278ecad0ecb4` does not exist in `organisations`. The app sends an alert email and Stripe retries, producing the same error.
- **Source trace:** `src/app/api/webhooks/stripe/route.ts` obtains the organisation via `invoiceOrgId(inv)`, optionally updates `org_subscriptions` by that ID, then unconditionally inserts the billing event. `src/lib/stripe-activation.ts` resolves invoice organisation from legacy/modern subscription metadata or invoice metadata; this is metadata, not proof that the organisation exists in the current database.
- **Root-cause boundary:** Confirmed immediate cause is an orphan/stale Stripe organisation identifier relative to the active database. The evidence does not yet distinguish stale Stripe metadata/test event, database restored without matching organisation/subscription rows, or an earlier lifecycle path that left a Stripe subscription pointing to a deleted/missing tenant. Migration output says all migrations applied, so do not assume this is a missing-schema/migration defect.
- **Disposition:** Route the live database/Stripe-to-tenant reconciliation to OPS-01. FIX-01 makes no speculative billing or database mutation. Do not create an organisation, disable the FK, insert a placeholder tenant, reset/seed the database, or acknowledge/ignore a paid invoice in application code before tracing subscription/customer mappings and billing invariants.
- **Prevention:** For FK errors, inspect the exact failed relation/key and correlate Stripe invoice → subscription/customer metadata → `org_subscriptions` → `organisations` in the same deployed database. Verify running image/commit and migration status first. Any eventual app-side orphan-event guard must preserve paid-event reconciliation and avoid silently losing receipts or entitlements.
- **Verification:** Source trace only; no database query, Stripe API retrieval, tests, or code correction executed by FIX-01. Runtime status remains unresolved.


## 2026-10-11 — FIX-01 MCP missing platform bearer credential response

- **Symptom:** `POST /api/platform/mcp-servers/test` returns HTTP 502 with `MCP_NO_PLATFORM_CREDENTIAL` for a registered bearer-auth server when the stored credential is absent and the request omits `bearerToken`.
- **Root cause:** The route correctly detected missing local credential configuration and did not call the upstream resolver, but mislabeled this local client/configuration error as a Bad Gateway response.
- **Remedy:** Changed only this specific missing-platform-bearer response to HTTP 400. Added `src/app/api/platform/mcp-servers/test/route.test.ts` asserting the status/error code and that the upstream handshake is not called. Commits: `426e06fde3da96ee60b155ecafcf3b6c59825105`, `9e63b8bffcacf391557ad281303294a6e5352d18`.
- **Failed approach:** An initial scripted patch failed its exact-text guard and made no change; the edit was retried with a narrower unique response-block match.
- **Prevention:** Distinguish local missing configuration (4xx) from a remote MCP endpoint/handshake failure (502). Never infer upstream health from a missing-credential response.
- **Security:** If an operator pastes a session/bearer cookie into a diagnostic, advise revocation/rotation and never echo it into project records.
- **Verification:** Source committed; test authored but not executed. Production behavior is not verified. The request without `bearerToken` still cannot perform a handshake; configure a stored credential or supply a temporary token in the request.

### FIX-01 / Sentinel — 2026-10-12 — Stripe ambient type shadowing

- **Date/session:** 2026-10-12 / SESSION-FIX-20261012-01
- **Agent:** FIX-01 / Sentinel
- **Issue/symptom:** TypeScript reported missing Stripe SDK methods and fields across checkout, payment health, webhooks, and subscription activation despite the project depending directly on `stripe@23.0.0`.
- **Root cause:** `src/types/payments.d.ts` declared an ambient module named `"stripe"` containing a hand-written, incomplete replacement surface. It shadowed the installed SDK declarations, omitting APIs such as balance retrieval, Checkout Session retrieval/status, webhook endpoint listing, prices, and current Invoice/Subscription item fields.
- **Failed approach:** The installed dependency tree did not show duplicate Stripe versions; treating this as a stale install or broadly downgrading dependencies would not fix the declaration that masks the official API.
- **Remedy:** Removed only the ambient `declare module "stripe"` block from `src/types/payments.d.ts`; preserved the independent Razorpay declaration. Source commit: `34aca73cd5ad2fc5c67396d1d35f24dcf38d7964`.
- **Prevention:** Do not recreate third-party SDK modules with partial ambient declarations. Use the installed package's own types; if a local compatibility abstraction is required, define it under a project-owned module rather than replacing the package module.
- **Evidence/verification:** Owner-provided `npm run type-check` output; source inspection of `src/types/payments.d.ts`; dependency inspection showed `stripe@23.0.0` directly installed. Post-change type-check has not been run; this is not a PASS.
- **Related record:** I-097; EVT-FIX-20261012-01; `src/types/payments.d.ts`.
