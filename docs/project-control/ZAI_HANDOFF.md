## Part II — Active Handoff Instance

> **Phase 7 implementation handoff — architect-issued 2026-10-02 after planning-package review PASS.** It authorizes 7-A and 7-B only, in order, and defers 7-C.

## Phase identity

| Field | Value |
|---|---|
| Phase number | 7 |
| Phase name | AI Platform Core Foundation |
| Full designation | Phase 7 — AI Platform Core Foundation |
| Current status | IN_PROGRESS |
| Repository | Rilan-Dev/Clara-AI-Platform |
| Branch | feature/ai-core-from-doable-source |
| Baseline commit | f2c403f11fb944b23eb31cef9de07f8bfb7695d8 |
| Architect | ChatGPT |
| Developer | Z.AI |
| Handoff date | 2026-10-02 |

## Objective

Implement 7-A host contracts/adapter foundation, then 7-B Unified Tool Runtime with behavior-preserving rag_search migration. Existing ai-core, ai-governance, RAG, tenancy, quota/metering, audit, and voice infrastructure remain authoritative. 7-C is deferred.

## Scope (approved)

### 7-A
src/modules/ai-platform-core/**: execution-context factory; fail-closed adapter registry/validation; bounded Clara identity/tenant/provider/RAG/transport/secret-boundary adapters; focused tests; no production route migration.

### 7-B
src/modules/ai-platform-core/**: tool definitions/schemas, registry, invocation, mandatory execution context, authorization hooks, result/error normalization, streaming tool events, metering hooks; rag_search migration with parity/authz/tenancy/metering/error/streaming tests; no schema changes.

## Non-scope

7-C; MCP/integrations/agent runtime/work mode/memory/skills; attachments/image generation/marketplace/templates/automation; UI expansion; provider-stack rewrite; DB migrations/Supabase; vercel.json/deployment operations/production branches; b65725e5; immutable Doable-source changes/imports; I-014/I-001/I-007 resolution; R-3/R-4/R-5 resolution; Phase 8+.

## Prerequisites

Planning package PASS; D-022 seam decision; D-023 I-014 P2/DEFERRED; D-024 D-P4/R-3 open with conditional Gate F; D-020 governance; refresh GitHub state and STOP if baseline moves materially.

## Required reading

PROJECT_STATE.md; CURRENT_PHASE.md; PHASE-7-PLAN.md §§8–25; VERIFICATION_STATE.md; ISSUES.md; DECISIONS.md; RISKS.md; docs/doable-source/ADAPTER_ARCHITECTURE.md; docs/doable-source/contracts/; docs/doable-source/adapters/; docs/doable-source/capabilities/tools/MANIFEST.md; src/modules/ai-platform-core/README.md; src/modules/ai-platform-core/clara-runtime.ts; src/modules/ai-core/types.ts.

## Implementation tasks

1. Execute 7-A only; build the fail-closed execution-context/adapter foundation; focused tests; commit; report; STOP.
2. Await ChatGPT review; do not start 7-B automatically.
3. After a separate architect PASS, execute 7-B; build Unified Tool Runtime, migrate rag_search, test parity/authz/tenancy/metering/error/streaming; commit; report; STOP.
4. Out-of-scope issue: STOP, record OPEN issue, await direction.

## Interfaces / contracts

Effective tenant identity mandatory; incomplete context fails closed. Every tool invocation carries execution context and surface. rag_search remains KB/org scoped. Existing provider resolution, entitlement gating, metering, audit, and brain/voice separation remain authoritative. No runtime import from docs/doable-source/**.

## Security constraints

No secrets/tokens/private reasoning. Tools never receive raw provider credentials. Authorization fails closed. Public/embed exposure must not broaden. Immutable Doable source and production branches never change. No deployment operation.

## Testing requirements

Context/adapter fail-closed; registry/schema; rag_search parity; authorization; metering; error/streaming; relevant regression; governance 8/8 + 24/24; immutable-source integrity with I-014 remaining deferred.

## Acceptance criteria

1. 7-A fail-closed execution-context/adapter foundation.
2. 7-B Unified Tool Runtime with behavior-preserving rag_search migration.
3. Production route behavior unchanged by 7-A/7-B.
4. Existing provider/RAG/usage/audit/tenancy semantics remain authoritative.
5. No immutable-source/secret-boundary violation.
6. No DB schema/migration/deployment configuration changes.
7. Required tests/evidence recorded.
8. No new blocking issue unresolved at sub-phase review.
9. STOP after each sub-phase for architect review.

## Git requirements

feature/ai-core-from-doable-source only; no force-push/rebase/production work; focused 7-A/7-B commits; push normally; report exact SHAs; STOP on baseline movement.

## Evidence requirements

Exact changed paths; implementation summary; tests/results; immutable-source and secret scans; Git status; commit SHA/parent; remaining issues/risks; deviations; unresolved questions; confirmation no unauthorized phase started.

## Review boundary

Gate D is architect-only. ChatGPT reviews actual diff/evidence after 7-A and 7-B. Only PASS advances; Phase 7 closes only after authorized sub-phases and applicable Gates A–F.

## STOP boundary

After 7-A STOP. Do not begin 7-B until a subsequent ChatGPT PASS. After 7-B STOP. Do not begin 7-C, Phase 8, later capabilities, DB/deployment operations, I-014/R-3/R-4/R-5 resolution, or unrelated work.