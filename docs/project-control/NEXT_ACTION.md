# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-01**.
> This file is intentionally short. History lives in Git, in `VERIFICATION_STATE.md`, and in the canonical `worklog.md`; current truth lives in `PROJECT_STATE.md`. A fresh ChatGPT session follows the full procedure in `docs/project-control/CHAT_CONTINUITY.md` (§5).

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` → then `docs/project-control/ZAI_HANDOFF.md` (active handoff instance) → then `docs/project-control/VERIFICATION_STATE.md` (evidence). Fresh-ChatGPT initialization procedure: `docs/project-control/CHAT_CONTINUITY.md`. Historical audit trail: repository-root `worklog.md` and `docs/project-control/sessions/`. Codebase agent instructions: `Doc/18-09-2026/AGENTS.md`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`.

## 1. Active phase

**Phase 4 — Worklog and Session Audit** (status: `IN_PROGRESS` — developer implementation complete; awaiting architect review; phase remains open).

## 2. Project state (2026-10-01)

Branch `feature/ai-core-from-doable-source`. Phases 0, 1, 2, and 3 are all `CLOSED` (Phase 3 closed by the architect `PASS` review of `3706b977099e8a1aa8b867c936149439b1f700c0`; closure record `d12b0582f370c0192a97bad0ad1b1dc81b7f0713`; the external `b65725e5` deployment-config commit between them is accepted as an already-existing repository event with provenance not independently established). On top of `d12b0582` sits the Phase 4 implementation commit (`docs: establish phase 4 worklog and session audit`), creating the canonical project `worklog.md` (Phases 0–3 + the `b65725e5` event, evidence-classified, append-only, audit-not-authority), the session-audit records under `docs/project-control/sessions/`, and the reconciliation of the control documents to Phase 4. No blockers. Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -5 origin/feature/ai-core-from-doable-source
```

## 3. What must happen next

**ChatGPT architect review of the Phase 4 implementation.** ChatGPT inspects the Phase 4 implementation commit (the immediate child of `d12b0582`) and its actual diff, verifies: the worklog's canonical structure (entry schema; six status values; append-only convention); accurate Phases 0–3 historical coverage; the accurately represented `b65725e5` event (with provenance reported as not independently established); developer/architect evidence classification; session records following the approved structure with no fabricated timestamps; the worklog as historical — not current-state — authority; no duplicate current-state source; no secrets/tokens/credentials; scope boundaries (no product source, DB/migrations, `vercel.json`, or Doable-source changes; no deployment/database operations; R-3/R-4/R-5 unresolved by design); and the Final State Contract. Then record an outcome (`PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`) in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 4; the phase then advances to **Phase 5 — Verification and Phase-Gate System** (per the plan), initialized by a new architect-issued handoff. If `CORRECTION_REQUIRED`, a corrective handoff is issued to Z.AI per `ZAI_HANDOFF.md` §I.5.

## 4. Z.AI active handoff status

**NONE.** The refreshed Phase 4 handoff (2026-10-01 — issued after the architect's moved-baseline review authorized continuation from `d12b0582`) was fully executed: the worklog and session-audit layer were created, the state was reconciled, validation passed, and the evidence report was delivered; the handoff instance is materialized in `ZAI_HANDOFF.md` Part II. Z.AI is STOPped at the phase boundary. Z.AI must not start Phase 5, must not resolve R-3/R-4/R-5, must not implement Multi-Provider / Unified Tool Runtime / Integrations / MCP / Agent Runtime / Agent Work Mode, and must not implement any product feature until a new architect handoff arrives.

## 5. What ChatGPT must verify before advancing

1. The Phase 4 implementation commit is documentation-only: changed paths are exactly the repository-root `worklog.md` and files under `docs/project-control/`; no product code, dependencies, migrations, Vercel configuration, or Doable-source changes; `b65725e5` and `vercel.json` untouched; no force-push.
2. `worklog.md` satisfies its contract: canonical entry schema (phase, role, date, objective, implementation, verification, review, commit, issues, correction, next action); the six status values; append-only-with-explicit-corrections convention; accurate Phases 0–3 reconstruction (including the Phase 0 `CORRECTION_REQUIRED` cycle and each phase's `PASS`/closure/transition); the clearly identified `b65725e5` event entry with exactly the authorized facts; developer-reported vs architect-verified classification throughout; the explicit non-replacement of the five current-state authority documents.
3. No unsupported provenance claim about `b65725e5` anywhere in the new artifacts (reported as not independently established; Git-metadata observations labeled as inference).
4. `docs/project-control/sessions/` records follow the approved structure (twelve determinations per record; README convention; no fabricated timestamps; reconstruction basis stated for the lost prior-environment record).
5. State-machine consistency: phase = Phase 4 and status = `IN_PROGRESS` agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), `VERIFICATION_STATE.md`, and the latest `worklog.md` phase entry; baseline = `d12b0582`; latest verified commit = `3706b977` (with `d12b0582` classified as a closure record and `b65725e5` as an external event).
6. No developer-reported evidence is presented as architect-verified; no Phase 4 verification is claimed; no secrets/tokens are written; no product feature was implemented; no database/deployment operation was performed; no later phase was started.
7. Re-run the validation commands in `VERIFICATION_STATE.md` §Phase 4 if desired — they are read-only and repeatable.
