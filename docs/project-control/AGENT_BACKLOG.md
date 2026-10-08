# APCP Central Agent Backlog

Cross-agent coordination backlog. This records ownership and dependencies; it does not authorize implementation.

## Entry format

### <BACKLOG-ID> — <YYYY-MM-DD>
- **Work:** <task>
- **Owner:** <DEV-01 | FIX-01 | OPS-01 | WORK-01>
- **State:** <READY | ACTIVE | BLOCKED | ROUTED | DONE | SUPERSEDED>
- **Dependency:** <none or exact dependency>
- **Authorization:** <authorization reference>
- **Suggested next action:** <concrete action>
- **Related session/event/handoff:** <ids>

## Routing rule

If a task belongs to another agent, create or update a backlog entry and continue independent work. Do not poll repeatedly for the dependency.

### BACKLOG-OPS-001 — 2026-10-09
- **Work:** Fix duplicate 060 migration numbering blocking the clara-backend Vercel build from Vercel-Preview commit 4ea79c3b3bbb5202a25f2411b63471354200b01d.
- **Owner:** FIX-01
- **State:** ROUTED
- **Dependency:** Correct the migration source on the deployment branch; then a new deployment can be created from the corrected commit.
- **Authorization:** Not authorized for OPS-01 to change application migration source; routed for FIX-01 correction.
- **Suggested next action:** Preserve 060_sarvam_realtime_streaming.sql; remove or renumber the duplicate payment migration so its filename has a unique numeric prefix. The already-established corrected pattern uses 061_payment_settings_category.sql. Keep the duplicate-number guard in src/lib/db/migrate.ts. Do not skip migrations as a deployment workaround.
- **Related session/event/handoff:** EVT-OPS-001; OPS-01 / 2026-10-09
