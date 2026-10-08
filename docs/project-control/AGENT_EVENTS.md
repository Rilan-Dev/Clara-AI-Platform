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
