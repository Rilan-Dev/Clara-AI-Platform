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
