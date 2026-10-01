# NEXT_ACTION.md — Fresh-Session Continuation Instruction

> The smallest useful instruction for a fresh ChatGPT (or Z.AI) session. Updated at each phase boundary. Snapshot date: **2026-10-01**.
> This file is intentionally short. History lives in Git, in `VERIFICATION_STATE.md`, and in the canonical `worklog.md`; current truth lives in `PROJECT_STATE.md`. A fresh ChatGPT session follows the full procedure in `docs/project-control/CHAT_CONTINUITY.md` (§5).

## Read this first

`docs/project-control/PROJECT_STATE.md` → then `docs/project-control/CURRENT_PHASE.md` → then `docs/project-control/ZAI_HANDOFF.md` (active handoff instance) → then `docs/project-control/VERIFICATION_STATE.md` (evidence). Fresh-ChatGPT initialization procedure: `docs/project-control/CHAT_CONTINUITY.md`. Historical audit trail: repository-root `worklog.md` and `docs/project-control/sessions/`. Codebase agent instructions: `Doc/18-09-2026/AGENTS.md`. Full plan: `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`.

## 1. Active phase

**None.** Phase 4 — Worklog and Session Audit is **`CLOSED`** — architect review outcome **`PASS`** (2026-10-01; architect ChatGPT; developer Z.AI; reviewed implementation commit `5febaacd5dcc55268904d1371038bbe8ff372040`, the immediate child of the baseline `d12b0582f370c0192a97bad0ad1b1dc81b7f0713`; verified relationship `d12b0582 → 5febaacd`; closure record `docs: record architect approval of phase 4` — the immediate child of `5febaacd`). **Phase 5 — Verification and Phase-Gate System is the next phase and has NOT started** — no Phase 5 handoff issued, no Phase 5 implementation performed, no product implementation performed.

## 2. Project state (2026-10-01)

Branch `feature/ai-core-from-doable-source`. Phases 0, 1, 2, 3, and 4 are all `CLOSED` (Phase 4 closed by the architect `PASS` review of `5febaacd5dcc55268904d1371038bbe8ff372040`; closure record `docs: record architect approval of phase 4`; the external `b65725e5` deployment-config commit is accepted as an already-existing repository event with provenance not independently established). The canonical project `worklog.md` and the `docs/project-control/sessions/` audit layer are established (D-018/D-019). No blockers; no active handoff instance (Part II of `ZAI_HANDOFF.md` holds the fully executed Phase 4 instance, status `CLOSED`). Repository state is authoritative — always re-read it:

```bash
git fetch --prune origin
git rev-parse origin/feature/ai-core-from-doable-source   # current tip
git log --oneline -5 origin/feature/ai-core-from-doable-source
```

## 3. What must happen next

**ChatGPT architect review of the Phase 4 closure record, then issuance of the explicit Phase 5 handoff.** The architect verifies the closure record: it references the exact reviewed implementation SHA (`5febaacd5dcc55268904d1371038bbe8ff372040`); Phase 4 is `CLOSED`; Phase 5 — Verification and Phase-Gate System is identified as next but **not started**; all Final State Contract members agree; the commit is documentation-only (no product/DB/deployment/Doable-source changes; `b65725e5`/`vercel.json` untouched); clean tree; local/remote synchronized. The architect then issues the Phase 5 handoff (per the plan), which initializes Phase 5 and replaces `ZAI_HANDOFF.md` Part II with the Phase 5 instance. **Z.AI performs no work until that handoff arrives.** If the closure-record review returns `CORRECTION_REQUIRED`, a corrective handoff is issued per `ZAI_HANDOFF.md` §I.5.

## 4. Z.AI active handoff status

**NONE.** The refreshed Phase 4 handoff (2026-10-01) was fully executed and Phase 4 was closed by the architect `PASS` review (2026-10-01). Z.AI is STOPped at the inter-phase boundary: it must not start Phase 5, must not create Phase 5 implementation artifacts or a Phase 5 handoff instance, must not resolve R-3/R-4/R-5, must not implement Multi-Provider / Unified Tool Runtime / Integrations / MCP / Agent Runtime / Agent Work Mode, and must not implement any product feature until a new architect handoff arrives.

## 5. What ChatGPT must verify before advancing

1. The Phase 4 closure-record commit is documentation-only: changed paths are exactly the repository-root `worklog.md` and files under `docs/project-control/` (`VERIFICATION_STATE.md`, `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` Part II status/closure annotation, `ISSUES.md` I-003 confirmation, `sessions/README.md` record index, `sessions/SESSION-005.md`); no product code, dependencies, migrations, Vercel configuration, or Doable-source changes; `b65725e5` and `vercel.json` untouched; no force-push.
2. The closure record references the exact reviewed implementation SHA `5febaacd5dcc55268904d1371038bbe8ff372040` with the verified relationship `d12b0582 → 5febaacd`, and records: review outcome `PASS`; architect ChatGPT; developer Z.AI; Phase 4 → `CLOSED`.
3. Phase 5 — Verification and Phase-Gate System is identified as next and **not started** (no Phase 5 handoff instance; no Phase 5 implementation; no product implementation).
4. State-machine consistency: phase = Phase 4 and status = `CLOSED` agree across `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), `VERIFICATION_STATE.md`, and the latest `worklog.md` entry; latest verified commit = `5febaacd`.
5. The historical Phase 4 worklog entry is not rewritten — the closure appears as a subsequent append-only architect-verified event; no fabricated timestamps; the `b65725e5` provenance remains "not independently established" (never described as confirmed owner authorship).
6. Re-run the validation commands in `VERIFICATION_STATE.md` §Phase 4 (appendix, closure-record block) if desired — they are read-only and repeatable.
