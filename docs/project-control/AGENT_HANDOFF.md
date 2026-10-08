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

### HANDOFF-OPS-20261009-02 — 2026-10-09
- **From:** OPS-01 / Shipwright
- **To:** FIX-01
- **Reason:** Two current branch-specific application/build defects block the two deployment paths: Vercel-Preview TypeScript seed compilation and feature-branch Docker standalone dependency packaging.
- **Repository state:** Vercel-Preview / fa46778f08b604125e942f4d39b249017254a8d2; feature/ai-core-from-doable-source / 8efae4712accd025ce5be6c476a3019e8199c1d0.
- **Work completed:** Confirmed migrations now complete on Vercel; current failure is Cannot find name 'CliLog'; Vercel-Preview lacks integrations/registry.ts while feature seed imports it; Docker fails at cp node_modules/lodash.defaults after worker export.
- **Remaining work:** Apply two bounded FIX-01 corrections: reconcile Vercel-Preview seed dependencies and make Docker standalone packaging robust to actual npm layout.
- **Evidence/records:** EVT-OPS-003; EVT-OPS-004; BACKLOG-OPS-003; BACKLOG-OPS-004; Vercel deployment dpl_22XsSPHMrei8mh5StC8b4ytVGGke; Dockerfile; package.json; package-lock.json.
- **Authorization:** not authorized for OPS-01 to modify application/build source; receiving agent must recover FIX-01 authorization independently.
- **Stop condition:** stop after the two bounded corrections; no unrelated product work, Vercel setting changes, migration bypasses, or reproducibility weakening.
- **Status:** OPEN

