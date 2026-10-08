# APCP Central Agent Handoffs

Cross-agent handoff register. A handoff transfers context, not authority.

## Required fields

### <HANDOFF-ID> — <YYYY-MM-DD>
- **From:** <agent id / session id>
- **To:** <agent id>
- **Reason:** <why another role is needed>
- **Repository state:** <commit/ref>
- **Work completed:** <summary>
- **Remaining work:** <exact task>
- **Evidence/records:** <paths, issue/event ids>
- **Authorization:** <existing authorization reference or "not authorized; proposal only">
- **Stop condition:** <when receiving agent must stop>
- **Status:** <OPEN | ACCEPTED | COMPLETE | SUPERSEDED>

## Rules

- Never invent authority through a handoff.
- The receiving agent must independently recover current authorization.
- A handoff can be accepted while the sending agent continues unrelated independent work.
- Close or supersede stale handoffs when state changes materially.

### HANDOFF-OPS-20261009-01 — 2026-10-09
- **From:** OPS-01 / SESSION-OPS-20261009-01
- **To:** FIX-01
- **Reason:** Vercel deployment is blocked by an application migration filename-number collision; OPS-01 must not change application migration source under the current operational scope.
- **Repository state:** Vercel-Preview / 4ea79c3b3bbb5202a25f2411b63471354200b01d
- **Work completed:** Confirmed migration runner behavior, exact failing deployment metadata, and the offending PR #273 migration addition. The existing Sarvam migration owns number 060; the payment migration must have a unique number.
- **Remaining work:** Correct the duplicate migration source on the deployment branch, preserve the duplicate-number guard, and record the correction in the appropriate project-control records.
- **Evidence/records:** EVT-OPS-001; BACKLOG-OPS-001; deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf; src/lib/db/migrate.ts; src/lib/db/migrations/060_sarvam_realtime_streaming.sql; src/lib/db/migrations/060_payment_settings_category.sql; src/lib/db/migrations/061_payment_settings_category.sql.
- **Authorization:** not authorized; proposal only. Receiving agent must independently recover current FIX-01 authorization before editing application source.
- **Stop condition:** stop after the bounded duplicate-number correction; do not bypass migrations, alter unrelated migrations, or expand into deployment configuration.
- **Status:** OPEN
