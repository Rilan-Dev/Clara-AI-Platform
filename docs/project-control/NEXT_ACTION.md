# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-01**.
> This file is intentionally short. History lives in Git and in VERIFICATION_STATE.md; current truth lives in PROJECT_STATE.md. A fresh ChatGPT session follows the full procedure in `docs/project-control/CHAT_CONTINUITY.md` (§5).

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` → then `docs/project-control/ZAI_HANDOFF.md` (active handoff instance) → then `docs/project-control/VERIFICATION_STATE.md` (evidence). Fresh-ChatGPT initialization procedure: `docs/project-control/CHAT_CONTINUITY.md`. Codebase agent instructions: `Doc/18-09-2026/AGENTS.md`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`.

## 1. Active phase

**Phase 3 — Cross-Chat ChatGPT Continuity** (status: `IN_PROGRESS` — developer implementation complete; awaiting architect review; phase remains open).

## 2. Project state (2026-10-01)

Branch `feature/ai-core-from-doable-source`. Phases 0, 1, and 2 are all `CLOSED` (Phase 2 closed by architect `PASS` review of `31ffd6f4330753f9b42dba231d7e02589d12eb77`, recorded in commit `58856e0be6325d0326a2d7c8cde6d6d6312b9000` "docs: record architect approval of phase 2"). On top of the closure record sits the Phase 3 implementation commit (`docs: establish cross-chat ChatGPT continuity`), introducing `docs/project-control/CHAT_CONTINUITY.md` (the cross-chat ChatGPT continuity procedure), replacing the `ZAI_HANDOFF.md` Part II instance with the Phase 3 handoff, and reconciling phase state across the control documents. No blockers. Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -5 origin/feature/ai-core-from-doable-source
```

## 3. What must happen next

**ChatGPT architect review of the Phase 3 implementation.** ChatGPT inspects the two Phase 3 commits (`58856e0b` closure record; the implementation commit — immediate child of `58856e0b`) and their actual diffs, verifies the continuity contract (fresh-session initialization, 17 capability determinations, mandatory/conditional/historical read order, recovery procedure and report schema, repository-authority and stale-memory rules, broken-chat recovery, state-inconsistency → `BLOCKED`, architect-authority recovery, Z.AI authorization rules, copy/paste initialization prompt, scenarios A–H, no second source of truth), then records a review outcome (`PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`) in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 3; the phase then advances to **Phase 4 — Worklog and Session Audit** (per the plan), initialized by a new architect-issued handoff. If `CORRECTION_REQUIRED`, a corrective handoff is issued to Z.AI per `ZAI_HANDOFF.md` §I.5.

## 4. Z.AI active handoff status

**NONE.** The Phase 3 handoff (2026-10-01) was fully executed — Part A (Phase 2 closure record, commit `58856e0b`) and Part B (continuity-system implementation) — and its evidence report was delivered; the handoff instance is materialized in `ZAI_HANDOFF.md` Part II. Z.AI is STOPped at the phase boundary. Z.AI must not start Phase 4, create the canonical `worklog.md`, create `sessions/` records, implement Multi-Provider / Unified Tool Runtime / Integrations / MCP / Agent Runtime / Agent Work Mode, or implement any product feature until a new architect handoff arrives.

## 5. What ChatGPT must verify before advancing

1. The two Phase 3 commits are documentation-only: changed paths under `docs/project-control/` only; no product code, dependencies, migrations, Vercel config, or Doable-source changes.
2. `CHAT_CONTINUITY.md` satisfies its full contract: initialization procedure; the 17 determinations (§3); read order distinguishing mandatory/conditional/historical (§4); recovery procedure (§5); recovery-report schema with the four evidence classes (§6); stale-memory rule with the verbatim authority statement and the required example classes (§2); broken-chat recovery covering all required situations (§7); state-inconsistency → `BLOCKED` with no silent selection and no guessing (§8); architect-authority recovery including the Vercel/Supabase/phase-advancement authorities and the "Z.AI must not become the authority" rule (§9); Z.AI authorization rules with the no-Git-history-inference rule (§10); the reusable copy/paste initialization prompt (§11); scenarios A–H (§12); procedure-only status — no second source of truth (§1.3).
3. The Phase 2 closure record is accurate (`PASS`, reviewed implementation commit `31ffd6f4330753f9b42dba231d7e02589d12eb77`, reviewed alongside closure commit `6d1c6c9d`, Phase 2 `CLOSED`, Phase 3 next) and does not rewrite historical Phase 0/Phase 1 evidence or claim un-happened ChatGPT actions.
4. State-machine consistency: phase = Phase 3 and status = `IN_PROGRESS` agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), `VERIFICATION_STATE.md`; latest verified commit = `31ffd6f4`.
5. No developer-reported evidence is presented as architect-verified; no Phase 3 verification is claimed; no secrets/tokens are written.
6. Re-run the validation commands in `VERIFICATION_STATE.md` §Phase 3 if desired — they are read-only and repeatable.
