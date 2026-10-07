# SESSION-057 — I-086 Organisation Integration Mutation Serialization

**Date:** 2026-10-07  
**Role:** ChatGPT — architect / implementation owner  
**Phase:** Integrations I-2  
**Branch:** `feature/ai-core-from-doable-source`

## Objective

Continue the bounded I-2 credential/connection authorization review without waiting for GitHub Actions, Vercel, Gate-C, or Gate-D.

## Control state consulted

- `docs/project-control/CHAT_CONTINUITY.md`
- `docs/project-control/NEXT_ACTION.md`
- `docs/project-control/ISSUES.md`
- `docs/project-control/PROJECT_STATE.md`

Current control state remains I-2 **IMPLEMENTED — VERIFICATION PENDING**, Gate-C **MISSING**, Gate-D **IN PROGRESS**. No I-3, MCP expansion, production promotion, or unrelated implementation is authorized.

## Finding — I-086

The organisation integration connect transaction used `SELECT ... FOR UPDATE` on the existing `organisation_integrations` row before checking `max_integrations`. A first-time connection has no existing grant row, so concurrent connects for different integrations could both observe the same slot count and both create grants.

The same organisation-level mutation domain also lacked a common serialization boundary for disable/disconnect.

## Correction

File:
- `src/app/api/orgs/[orgId]/integrations/route.ts`

Commit:
- `51c14f65b7dac8812ccae353bc23e9cf07694d8c`

Changes:
1. Connect now acquires `pg_advisory_xact_lock(hashtextextended(orgId, 0))` before reading the grant and integration count.
2. Disable acquires the same transaction lock.
3. Disconnect acquires the same transaction lock.
4. Existing entitlement, transaction, credential, tenant, and provider behavior remains otherwise unchanged.

## Disposition

I-086 is **RESOLVED — architect source correction**.

No generated-code tests, CI, Vercel build, Gate-C, or Gate-D result was awaited.

## Next action

Continue bounded I-2 source review, prioritizing credential/connection and authorization race boundaries, then remaining custom-action, AI-tool, egress/secret, action-input, and tenant-isolation gaps. Continue implementation directly and do not wait on CI/CD or gates.

## Evidence status

- Source correction: completed.
- Executable Gate-C evidence: pending by design.
- Final Gate-D review: pending by design.
