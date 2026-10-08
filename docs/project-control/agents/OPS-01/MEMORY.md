# OPS-01 Role-Local Memory

This is durable memory for OPS-01. It supplements, but never overrides, shared APCP memory or repository authority.

## Read before work
- docs/project-control/AGENT_MEMORY.md
- docs/project-control/AGENT_EVENTS.md
- docs/project-control/AGENT_SESSIONS.md
- docs/project-control/AGENT_HANDOFF.md
- docs/project-control/AGENT_BACKLOG.md
- this file
- current project-control state and applicable architecture/plan

## Record
- recurring issues;
- role-specific mistakes and prevention;
- successful patterns;
- failed approaches;
- environment-specific observations;
- lessons that should be promoted to AGENT_MEMORY.md when cross-agent.

## Do not store
Secrets, tokens, passwords, private keys, or sensitive personal data.

<!-- Append durable OPS-01 lessons below. -->

### 2026-10-09 / OPS-01
- **Issue/symptom:** clara-backend Vercel build failed at npm run db:migrate with duplicate migration numbers detected: 060.
- **Root cause:** deployment source commit 4ea79c3b3bbb5202a25f2411b63471354200b01d added 060_payment_settings_category.sql while the repository already had 060_sarvam_realtime_streaming.sql; the migration runner intentionally rejects duplicate numeric prefixes.
- **Failed approach:** do not disable or relax the duplicate-number guard or skip db:migrate just to make Vercel green; that would hide a real schema-ordering defect and is outside OPS scope.
- **Remedy:** route the application-source correction to FIX-01; retain the fail-closed migration guard and correct the duplicate filename on the deployment branch.
- **Prevention:** when operating Vercel deployments, inspect migration-number integrity before treating a build failure as infrastructure; a deterministic application migration failure is not a Vercel platform fault.
- **Related record:** EVT-OPS-001; BACKLOG-OPS-001; deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf.
