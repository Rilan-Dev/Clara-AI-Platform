# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-01**.
> This file is intentionally short. History lives in Git, in `VERIFICATION_STATE.md`, and in the canonical `worklog.md`; current truth lives in `PROJECT_STATE.md`. A fresh ChatGPT session follows the full procedure in `docs/project-control/CHAT_CONTINUITY.md` (§5).

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` (the Phase 5 contract, including the Phase-Gate requirements and closure conditions) → then `docs/project-control/ZAI_HANDOFF.md` (the Phase 5 handoff instance) → then `docs/project-control/VERIFICATION_STATE.md` (evidence + the durable verification and phase-gate contract). Fresh-ChatGPT initialization procedure: `docs/project-control/CHAT_CONTINUITY.md`. Historical audit trail: repository-root `worklog.md` and `docs/project-control/sessions/`. Verification checklist/template: `docs/project-control/VERIFICATION_CHECKLIST.md`. Codebase agent instructions: `Doc/18-09-2026/AGENTS.md`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`.

## 1. Active phase

**Phase 5 — Verification and Phase-Gate System — `IN_PROGRESS`.** The Phase 5 implementation handoff was received from ChatGPT on 2026-10-01 (baseline `8d8595d0a994510da217af6d12225e3f1d00b2fd` — the architect-accepted Phase 4 closure-evidence correction; Phase 4 stands `CLOSED`; the latest architect-verified implementation remains `5febaacd5dcc55268904d1371038bbe8ff372040`). The implementation is **complete and submitted (developer-reported, NOT YET REVIEWED)**: the durable verification and phase-gate contract in `VERIFICATION_STATE.md`; the canonical `VERIFICATION_CHECKLIST.md`; the deterministic `docs/project-control/verification/phase-closure-eligibility-test.sh`; the Phase 5 contract in `CURRENT_PHASE.md`; the Final State Contract reconciled to Phase 5 `IN_PROGRESS`; the `worklog.md` Phase 5 entry; D-020; session record `SESSION-006`.

## 2. Project state (2026-10-01)

Branch `feature/ai-core-from-doable-source`. Phases 0–4 are all `CLOSED` (Phase 4: architect `PASS` on `5febaacd`; closure record `16b89a94`; closure-evidence correction `8d8595d0` — **accepted by the architect, Phase 4 stands `CLOSED`**). The verification and phase-gate system is established (D-020; binding on closure evidence from Phase 5 onward). No blockers; the active handoff instance is Part II of `ZAI_HANDOFF.md` (the Phase 5 instance, being executed). The external `b65725e5` deployment-config commit remains accepted as an already-existing repository event with provenance not independently established. Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -5 origin/feature/ai-core-from-doable-source
```

## 3. What must happen next

**ChatGPT architect review of the Phase 5 implementation commit** — Gate D under the contract this phase establishes. The architect independently inspects the actual GitHub diff and evidence and records one of `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED` in `VERIFICATION_STATE.md` §Phase 5. Only `PASS` closes Phase 5 (D-009), and the closure decision must itself satisfy the phase-close checklist (`VERIFICATION_CHECKLIST.md` §7). If `CORRECTION_REQUIRED`, a corrective handoff is issued per `ZAI_HANDOFF.md` §I.5 identifying finding, evidence, exact corrective scope, non-scope, expected verification, and stopping boundary. **Z.AI performs no work until the review outcome arrives.**

## 4. Z.AI active handoff status

**Phase 5 handoff — executed; implementation submitted; STOPped at the review boundary.** The implementation commit `docs: establish phase 5 verification and phase gates` (the immediate child of `8d8595d0`) was pushed and validated; the developer completion report was delivered. Z.AI must not begin Phase 6, must not create Phase 6 artifacts or product-feature specifications/plans, must not implement Multi-Provider / Unified Tool Runtime / Integrations / MCP / Agent Runtime / Agent Work Mode / Memory / Skills, must not modify `vercel.json`/Vercel/Supabase state or immutable Doable source, and must not resolve R-3/R-4/R-5 — until a new architect-issued handoff or corrective directive arrives.

## 5. What ChatGPT must verify before advancing

1. The Phase 5 implementation commit is documentation-only: changed paths are exactly the repository-root `worklog.md` and files under `docs/project-control/` (created: `VERIFICATION_CHECKLIST.md`, `verification/phase-closure-eligibility-test.sh`, `sessions/SESSION-006.md`; modified: `VERIFICATION_STATE.md`, `CURRENT_PHASE.md`, `PROJECT_STATE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` Part II, `DECISIONS.md`, `sessions/README.md`); no product code, dependencies, migrations, Vercel configuration, or Doable-source changes; `b65725e5` and `vercel.json` untouched; no force-push; the commit is the immediate child of `8d8595d0`.
2. The durable verification contract exists in `VERIFICATION_STATE.md` (Gates A–F with required records and satisfaction rules; applicability — E/F conditional on changed surfaces with `NOT_APPLICABLE` recorded for this documentation-only phase; binding `PASS`/`PASS_WITH_FOLLOWUP`/`CORRECTION_REQUIRED` semantics; the P0/P1 blocker rule; closure eligibility R1–R7) and `CURRENT_PHASE.md` carries the Phase-Gate requirements and closure conditions.
3. The canonical checklist/template exists (`VERIFICATION_CHECKLIST.md`: per-gate record templates; applicability worksheet; the 22-item phase-close checklist; worked Examples 1 and 2).
4. The deterministic test demonstrates the closure rule: run `bash docs/project-control/verification/phase-closure-eligibility-test.sh` — expected `8/8 determinations correct`, exit 0; case-1 (deliberately incomplete: tests passed + developer claims complete, Gate D missing) → closure eligibility **FAIL**; case-2 (complete applicable-gate state, Gate D architect-verified) → **PASS**.
5. State-machine consistency: phase = Phase 5 and status = `IN_PROGRESS` agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), `VERIFICATION_STATE.md`, and the latest `worklog.md` entry; latest verified commit = `5febaacd` (per the handoff: later documentation commits are not the latest architect-verified implementation); baseline = `8d8595d0`.
6. Evidence classification is correct throughout: developer-reported vs architect-verified strictly separated (D-012); no future ChatGPT review written as completed; no secrets/tokens/private reasoning; the `b65725e5` provenance remains "not independently established".
7. Clean working tree; local/remote synchronized; re-run the validation commands in `VERIFICATION_STATE.md` §Phase 5 (appendix) if desired — they are read-only and repeatable.
