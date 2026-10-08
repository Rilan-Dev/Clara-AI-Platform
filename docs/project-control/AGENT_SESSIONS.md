# APCP Central Agent Sessions

Central index of autonomous agent sessions. Each agent also maintains its own role-local WORKLOG.md and MEMORY.md.

## Why this exists

A fresh chat may invoke any agent at any time. The next agent must be able to discover that another agent was active, what it was doing, what it left pending, and what lessons were learned without reopening the old chat.

## Session entry

### <SESSION-ID> — <YYYY-MM-DD>
- **Agent:** <DEV-01 | FIX-01 | OPS-01 | WORK-01>
- **Invocation:** <prompt/task summary>
- **Started from:** <commit/ref>
- **Scope:** <authorized task or safe maintenance task>
- **Status:** <ACTIVE | PAUSED | HANDOFF | COMPLETE | BLOCKED>
- **Completed:** <summary>
- **Pending:** <exact remaining work>
- **Blockers:** <none or durable blocker>
- **Handoff:** <AGENT_HANDOFF entry or none>
- **Next action:** <exact next action>

## Concurrency rule

Multiple sessions may be ACTIVE simultaneously. Session records are coordination evidence only; they do not grant authorization and do not require another agent to stop.

### SESSION-OPS-20261009-01 — 2026-10-09
- **Agent:** OPS-01
- **Invocation:** Diagnose the reported clara-backend Vercel build failure as OPS-01 / Shipwright, make only the smallest authorized operational change, and route application defects to FIX-01.
- **Started from:** Vercel deployment aBdMD92VM3ZoHmQzqKQULZPuLTvf; Vercel-Preview / 4ea79c3b3bbb5202a25f2411b63471354200b01d.
- **Scope:** Deployment diagnosis, infrastructure/application classification, evidence recording, and routing. No application-source correction authorized.
- **Status:** HANDOFF
- **Completed:** Confirmed the Vercel failure is deterministic application migration validation, not Vercel infrastructure. Recorded evidence and routed the duplicate 060 migration defect to FIX-01.
- **Pending:** FIX-01 must correct the duplicate migration filename/number on the deployment source.
- **Blockers:** Duplicate migration prefix 060 on the failed deployment source.
- **Handoff:** HANDOFF-OPS-20261009-01
- **Next action:** Do not poll. Resume only when a new authorized operational task or corrected deployment is available.
