# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-01**.
> This file is intentionally short. History lives in Git, in `VERIFICATION_STATE.md`, and in the canonical `worklog.md`; current truth lives in `PROJECT_STATE.md`. A fresh ChatGPT session follows the full procedure in `docs/project-control/CHAT_CONTINUITY.md` (§5).

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` (the Phase 5 contract, including the Phase-Gate requirements and closure conditions) → then `docs/project-control/ZAI_HANDOFF.md` (the Phase 5 handoff instance) → then `docs/project-control/VERIFICATION_STATE.md` (evidence + the durable verification and phase-gate contract). Fresh-ChatGPT initialization procedure: `docs/project-control/CHAT_CONTINUITY.md`. Historical audit trail: repository-root `worklog.md` and `docs/project-control/sessions/`. Verification checklist/template: `docs/project-control/VERIFICATION_CHECKLIST.md`. Codebase agent instructions: `Doc/18-09-2026/AGENTS.md`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`.

## 1. Active phase

**None.** Phase 5 — Verification and Phase-Gate System is **`CLOSED`** — architect re-review outcome **`PASS`** (2026-10-01; architect ChatGPT; developer Z.AI; reviewed implementation commit `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef` — the corrected Phase 5 implementation, the immediate child of the Phase 5 implementation commit `f9ce6a833bc67205384e17bb92433c78967f4363`; verified relationship `f9ce6a83 → fb4ad5f5`; the architect's first review had returned `CORRECTION_REQUIRED`, the P0-policy contradiction, corrected by `fb4ad5f5` and then re-reviewed `PASS`; closure record `docs: record architect approval of phase 5` — the immediate child of `fb4ad5f5`). **Phase 6 is the next phase and the next authorized phase; it has NOT started** — no Phase 6 handoff issued, no Phase 6 implementation performed, no product implementation performed; only ChatGPT may authorize Phase 6.

## 2. Project state (2026-10-01)

Branch `feature/ai-core-from-doable-source`. Phases 0–5 are all `CLOSED` (Phase 5: architect `PASS` re-review of the corrected implementation `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`; closure record `docs: record architect approval of phase 5`; the correction cycle is recorded in `VERIFICATION_STATE.md` §Phase 5). The verification and phase-gate system is established (D-020; binding on closure evidence from Phase 5 onward). No blockers; no active handoff instance (Part II of `ZAI_HANDOFF.md` holds the fully executed Phase 5 instance, status `CLOSED`). The external `b65725e5` deployment-config commit remains accepted as an already-existing repository event with provenance not independently established. Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -5 origin/feature/ai-core-from-doable-source
```

## 3. What must happen next

**ChatGPT architect review of the Phase 5 closure record, then issuance of the explicit Phase 6 handoff.** The architect verifies the closure record: it references the exact reviewed implementation SHA (`fb4ad5f59b5661dc2bc7f38039805fc6294d58ef`) with the verified relationship `f9ce6a83 → fb4ad5f5`; the evidence-classification distinction is maintained (the reviewed implementation vs. the closure-record commit — the closure-record SHA does not replace the reviewed-implementation SHA); Phase 5 is `CLOSED`; Phase 6 is identified as next and the next authorized phase but **not started**; all Final State Contract members agree; the commit is documentation-only (no product/DB/deployment/immutable-source changes; `b65725e5`/`vercel.json` untouched); clean tree; local/remote synchronized. The architect then issues the Phase 6 handoff (per the plan), which initializes Phase 6 and replaces `ZAI_HANDOFF.md` Part II with the Phase 6 instance. **Z.AI performs no work until that handoff arrives.** If the closure-record review returns `CORRECTION_REQUIRED`, a corrective handoff is issued per `ZAI_HANDOFF.md` §I.5.

## 4. Z.AI active handoff status

**NONE.** The Phase 5 handoff (2026-10-01) was fully executed — implementation, then the architect-directed P0-policy correction — and Phase 5 was closed by the architect `PASS` re-review (2026-10-01). Z.AI is STOPped at the inter-phase boundary: it must not start Phase 6, must not create Phase 6 artifacts, product-feature specifications, or implementation plans, must not create a Phase 6 implementation handoff, must not resolve R-3/R-4/R-5, must not implement Multi-Provider / Unified Tool Runtime / Integrations / MCP / Agent Runtime / Agent Work Mode / Memory / Skills, and must not implement any product feature until a new architect handoff arrives. Only ChatGPT may authorize Phase 6.

## 5. What ChatGPT must verify before advancing

1. The Phase 5 closure-record commit is documentation-only: changed paths are exactly the repository-root `worklog.md` and files under `docs/project-control/` (`VERIFICATION_STATE.md`, `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` Part II status/closure annotation, `sessions/README.md` record index, `sessions/SESSION-007.md`); no product code, dependencies, migrations, Vercel configuration, or Doable-source changes; `b65725e5` and `vercel.json` untouched; no force-push; the commit is the immediate child of `fb4ad5f5`.
2. The closure record references the exact reviewed implementation SHA `fb4ad5f59b5661dc2bc7f38039805fc6294d58ef` with the verified relationship `f9ce6a83 → fb4ad5f5`, and records: review outcome `PASS`; architect ChatGPT; developer Z.AI; Phase 5 → `CLOSED`; the implementation → correction → re-review → `PASS` → `CLOSED` sequence; Phase 6 → `NOT STARTED` (next authorized phase). The closure-record commit is not itself described as the reviewed implementation.
3. Phase 6 is identified as next and **not started** (no Phase 6 handoff instance; no Phase 6 implementation; no product implementation; no Phase 6 artifacts created by the developer).
4. State-machine consistency: phase = Phase 5 and status = `CLOSED` agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), `VERIFICATION_STATE.md`, and the latest `worklog.md` entry; latest verified commit = `fb4ad5f5` (the corrected Phase 5 implementation; the closure record is a developer-recorded closure event, not the reviewed implementation).
5. The historical Phase 5 worklog entry (and every earlier entry) is not rewritten — the closure appears as a subsequent append-only event; no fabricated timestamps (the closure handoff supplied no separate review timestamp); the `b65725e5` provenance remains "not independently established" (never described as confirmed owner authorship).
6. The corrected canonical P0 rule stands unchanged (P0 prevents phase closure — always; there is no P0 exception path) and the P1 exception mechanism is intact; the deterministic test still computes 8/8 with the P0 fixture → closure eligibility `FAIL`.
7. Re-run the validation commands in `VERIFICATION_STATE.md` §Phase 5 (appendix, closure-record block) if desired — they are read-only and repeatable.
