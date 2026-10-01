# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-01**.
> This file is intentionally short. History lives in Git and in VERIFICATION_STATE.md; current truth lives in PROJECT_STATE.md.

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` → then `docs/project-control/ZAI_HANDOFF.md` (active handoff instance) → then `docs/project-control/VERIFICATION_STATE.md` (evidence). Codebase agent instructions: `Doc/18-09-2026/AGENTS.md`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`.

## 1. Active phase

**Phase 2 — Z.AI Developer Handoff System** (status: `IN_PROGRESS` — developer implementation complete; awaiting architect review; phase remains open).

## 2. Project state (2026-10-01)

Branch `feature/ai-core-from-doable-source`. Phase 0 and Phase 1 are both `CLOSED` (Phase 1 closed by architect `PASS` review of `3a8b8b4ef8a62c8c7843bbe30af4d046ca9b002f`, recorded in commit `6d1c6c9d` "docs: record architect approval of phase 1"). On top of the closure record sits the Phase 2 implementation commit (`docs: establish zai developer handoff system`), introducing `docs/project-control/ZAI_HANDOFF.md` (handoff protocol + active instance) and `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md`, and reconciling phase state across the control documents. No blockers. Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -4 origin/feature/ai-core-from-doable-source
```

## 3. What must happen next

**ChatGPT architect review of the Phase 2 implementation.** ChatGPT inspects the two Phase 2 commits (`6d1c6c9d` closure record; the implementation commit — immediate child of `6d1c6c9d`), verifies the handoff-system contract (mandatory structure, lifecycle, correction protocol, integrity rules, evidence requirements, fresh-session usability, review boundary, STOP boundary, single-template rule), then records a review outcome (`PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`) in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 2; the phase then advances to **Phase 3 — Cross-Chat ChatGPT Continuity** (per the plan), initialized by a new architect-issued handoff. If `CORRECTION_REQUIRED`, a corrective handoff is issued to Z.AI per `ZAI_HANDOFF.md` §I.5.

## 4. Z.AI active handoff status

**NONE.** The Phase 2 handoff (2026-10-01) was fully executed — Part A (Phase 1 closure record, commit `6d1c6c9d`) and Part B (handoff-system implementation) — and its evidence report was delivered; the handoff instance is materialized in `ZAI_HANDOFF.md` Part II. Z.AI is STOPped at the phase boundary. Z.AI must not start Phase 3, create `CHAT_CONTINUITY.md`, create the canonical `worklog.md`, or implement any product feature until a new architect handoff arrives.

## 5. What ChatGPT must verify before advancing

1. The two Phase 2 commits are documentation-only: changed paths under `docs/project-control/` only; no product code, dependencies, migrations, Vercel config, or Doable-source changes.
2. `ZAI_HANDOFF.md` satisfies its full contract: Part I protocol (mandatory 16-section structure; lifecycle with all six statuses; correction protocol with all seven corrective-handoff fields; integrity rules; evidence requirements; review boundary; STOP boundary; ten fresh-session usability requirements) + Part II active instance (all 16 sections filled for Phase 2).
3. Exactly one handoff template exists (`docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md`) and no duplicate handoff source exists repository-wide.
4. The Phase 1 closure record is accurate (`PASS`, reviewed commit `3a8b8b4ef8a62c8c7843bbe30af4d046ca9b002f`, Phase 1 `CLOSED`, Phase 2 next) and does not rewrite historical Phase 0 evidence or claim un-happened ChatGPT actions.
5. State-machine consistency: phase = Phase 2 and status = `IN_PROGRESS` agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md`, `VERIFICATION_STATE.md`; latest verified commit = `3a8b8b4`.
6. No developer-reported evidence is presented as architect-verified; no Phase 2 verification is claimed; no secrets/tokens are written.
7. Re-run the validation commands in `VERIFICATION_STATE.md` §Phase 2 if desired — they are read-only and repeatable.
