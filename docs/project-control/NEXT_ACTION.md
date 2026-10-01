# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> Snapshot date: 2026-10-02. Repository state is authoritative. Read PROJECT_STATE.md → CURRENT_PHASE.md → PHASE-7-PLAN.md → ZAI_HANDOFF.md → VERIFICATION_STATE.md → CHAT_CONTINUITY.md.

## Active phase

**Phase 7 — AI Platform Core Foundation — IN_PROGRESS.** Planning-package review: **PASS** on 2026-10-02. Implementation authorized for **7-A and 7-B only**, in order. 7-C deferred. Phase 7 is not closed.

## Authorization baseline

f2c403f11fb944b23eb31cef9de07f8bfb7695d8. Branch: feature/ai-core-from-doable-source. Refresh before acting:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source
git log --oneline -5 origin/feature/ai-core-from-doable-source
```

If the branch moved materially, STOP and request a refreshed handoff.

## Next action

**Z.AI: execute 7-A only**, then stop and submit evidence. ChatGPT must review the actual 7-A diff and evidence. Only a subsequent architect PASS authorizes 7-B.

7-A: host execution-context factory; fail-closed adapter registry/validation; bounded Clara identity/tenant/provider/RAG/transport/secret-boundary adapters; focused tests.

Not authorized: 7-C; MCP/integrations/agent runtime/work mode/memory/skills; attachments/image generation/marketplace/templates/automation; UI expansion; migrations/Supabase; vercel.json; production branches; I-014 resolution; R-3/R-4/R-5 resolution; Phase 8.

## Ratified decisions

D-022: ai-platform-core is the host seam; ai-core remains provider/brain layer.
D-023: I-014 is P2/DEFERRED; no Phase 7 re-vendoring.
D-024: D-P4/R-3 remains open; not a coding prerequisite; Gate F is conditional.
D-021: 7-A/7-B authorized; 7-C deferred.

## Standing governance

P0 always blocks closure; P1 exception policy unchanged; no P2/P3 exception mechanism for acceptance-violating issues. Gate D is architect-only. Developer completion never closes a phase. No force-push, production-branch work, or silent scope expansion.