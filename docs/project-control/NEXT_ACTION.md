# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-01**.
> This file is intentionally short. History lives in Git and in the Phase 0 report; current truth lives in PROJECT_STATE.md.

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` → then `docs/project-control/VERIFICATION_STATE.md` (evidence). Codebase agent instructions: `Doc/18-09-2026/AGENTS.md`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`.

## 1. Active phase

**Phase 1 — Durable Project-Control Foundation** (status: `IN_PROGRESS` — developer implementation complete; awaiting architect review; phase remains open).

## 2. Project state (2026-10-01)

Branch `feature/ai-core-from-doable-source`; baseline `bcc1769d` (latest architect-reviewed state, Phase 0 evidence correction); on top of it the Phase 1 foundation commit (`docs: establish durable project control foundation`) introducing the seven control documents in `docs/project-control/`. Phase 0 is `CLOSED`. No blockers. Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -3 origin/feature/ai-core-from-doable-source
```

## 3. What must happen next

**ChatGPT architect review of the Phase 1 foundation.** ChatGPT inspects the commit diff and the seven documents, then records a review outcome (`PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`) in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 1; the phase then advances to **Phase 2 — Z.AI Developer Handoff System** (per the plan), initialized by a new architect-issued handoff. If `CORRECTION_REQUIRED`, a corrective handoff is issued to Z.AI.

## 4. Z.AI active handoff status

**NONE.** The Phase 1 handoff (2026-10-01) was fully executed and its evidence report delivered; Z.AI is STOPped at the phase boundary. Z.AI must not start Phase 2, create `ZAI_HANDOFF.md`, or implement any product feature until a new architect handoff arrives.

## 5. What ChatGPT must verify before advancing

1. Commit diff is documentation-only: exactly seven new files under `docs/project-control/`; no product code, dependencies, migrations, Vercel config, or Doable-source changes.
2. Each document satisfies its contract (required fields/headings; see CURRENT_PHASE.md §Required deliverables).
3. State-machine consistency: phase = Phase 1 and status = `IN_PROGRESS` agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `VERIFICATION_STATE.md`.
4. Phase 0 evidence is represented accurately (`adbc9e16` evidence, `bcc1769d` correction, 8-ahead/0-behind docs-only branch relationship).
5. No developer-reported evidence is presented as architect-verified; no Phase 1 verification is claimed; no secrets/tokens are written.
6. Re-run the validation commands in `VERIFICATION_STATE.md` §Phase 1 if desired — they are read-only and repeatable.
