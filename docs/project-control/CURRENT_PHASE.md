# CURRENT_PHASE.md — Active-Phase Contract

> Canonical current-phase contract. Snapshot date: 2026-10-02. Planning history remains in docs/project-control/PHASE-7-PLAN.md; current authority is this file plus PROJECT_STATE.md, ZAI_HANDOFF.md, and VERIFICATION_STATE.md.

> **Phase 7 is now IN_PROGRESS.** ChatGPT reviewed the Phase 7 planning package on 2026-10-02 and returned **PASS**, then issued explicit implementation authorization for **7-A and 7-B only**. Phase 7 is not closed. Sub-phase 7-C is deferred/not authorized.

## Phase identity

| Field | Value |
|---|---|
| Phase number | 7 |
| Phase name | AI Platform Core Foundation |
| Full designation | Phase 7 — AI Platform Core Foundation |
| Status | IN_PROGRESS — implementation authorized for 7-A/7-B; developer must stop for architect review after each authorized sub-phase |
| Assigned developer | Z.AI |
| Architect / reviewer / controller | ChatGPT |
| Implementation baseline | f2c403f11fb944b23eb31cef9de07f8bfb7695d8 — reviewed planning-package commit |
| Planning baseline | 3657035ac878da98decd98929fb0deb45aed1fbe — Phase 6 closure record |
| Review outcome | PASS for the planning package, 2026-10-02 |
| Authorization | 7-A + 7-B only; 7-C deferred |

Only ChatGPT/project-owner review can close Phase 7. Developer implementation completion never creates PASS.

## Objective

Establish the Clara host-side AI Platform Core foundation: 7-A host execution-context and fail-closed adapter seam under src/modules/ai-platform-core/**; then 7-B Unified Tool Runtime with behavior-preserving rag_search migration. Existing Clara ai-core, ai-governance, RAG, tenancy, quota/metering, audit, and voice infrastructure remain authoritative and are not duplicated. 7-C provider tool-calling/agentic loop is deferred.

## Scope (approved)

### 7-A
- src/modules/ai-platform-core/**: execution-context factory; host adapter registry/validation; bounded Clara identity/tenant/provider/RAG/transport/secret-boundary adapters.
- Focused tests; no production route migration.

### 7-B
- src/modules/ai-platform-core/**: tool definition/schema, registry, invocation, mandatory execution context, authorization hooks, result/error normalization, streaming tool-event types, metering hooks.
- Register/migrate rag_search through the runtime with parity, authorization, tenancy, metering, and regression tests.
- Zero new runtime dependencies anticipated; any dependency addition requires fresh architect authorization.

## Non-scope

7-C; MCP/integrations/agent runtime/work mode/memory/skills; attachments/image generation/marketplace/templates/automation; UI expansion; provider-stack rewrite in src/modules/ai-core/**; DB migrations/Supabase; vercel.json/deployment operations/production branches; b65725e5; immutable Doable-source changes/imports; I-014 resolution; I-001/I-007 resolution; R-3/R-4/R-5 resolution; Phase 8+.

## Prerequisites

1. Planning package PASS on 2026-10-02.
2. D-022 resolves D-P3/I-005: ai-platform-core is the host seam above ai-core.
3. D-023 triages I-014 P2/DEFERRED.
4. D-020 governance remains binding.
5. Refresh GitHub state before implementation; if the branch moves materially from the authorization baseline, STOP and request a refreshed handoff.

## Required reading

PROJECT_STATE.md; PHASE-7-PLAN.md §§8–25; ZAI_HANDOFF.md Part I + Part II; VERIFICATION_STATE.md; ISSUES.md; DECISIONS.md; RISKS.md; src/modules/ai-platform-core/README.md; src/modules/ai-platform-core/clara-runtime.ts; src/modules/ai-core/types.ts; docs/doable-source/ADAPTER_ARCHITECTURE.md; docs/doable-source/contracts/; docs/doable-source/adapters/; docs/doable-source/capabilities/tools/MANIFEST.md.

## Implementation tasks

1. Execute 7-A only; build the fail-closed execution-context/adapter foundation; focused tests; commit; report; STOP.
2. Await ChatGPT review. Do not start 7-B automatically.
3. After a separate architect PASS, execute 7-B; build the Unified Tool Runtime; migrate rag_search; add parity/authz/tenancy/metering/error/streaming tests; commit; report; STOP.
4. Out-of-scope discovery: STOP, record a new OPEN issue, await direction.

## Interfaces / contracts

Effective tenant identity is mandatory; incomplete context fails closed. Every tool invocation carries execution context and surface. rag_search remains KB/org scoped. Existing provider resolution, entitlement gating, metering, audit, and brain/voice separation remain authoritative. No runtime import from docs/doable-source/**. Final State Contract and issue lifecycle remain binding.

## Testing / acceptance

Fail-closed context and registry tests; tool registry/schema tests; rag_search parity; authorization; metering; error/streaming normalization; relevant regression checks; governance 8/8 and 24/24; immutable-source integrity with I-014 remaining deferred. No production route behavior change, no DB/deployment config change, no secrets, no unresolved blocking issue at sub-phase review.

## Review boundary

Gate D is architect-only. After each sub-phase ChatGPT reviews the actual diff/evidence and returns PASS, PASS_WITH_FOLLOWUP, or CORRECTION_REQUIRED. Phase 7 closes only after all authorized sub-phases and applicable Gates A–F satisfy the contract.

## STOP boundary

After 7-A, STOP. Do not begin 7-B until a subsequent ChatGPT PASS. After 7-B, STOP. Do not begin 7-C, Phase 8, later capabilities, DB/deployment operations, I-014/R-3/R-4/R-5 resolution, or unrelated work.