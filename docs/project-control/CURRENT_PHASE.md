# CURRENT_PHASE.md — Active-Phase Contract

> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-01**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance), `CHAT_CONTINUITY.md` (fresh-ChatGPT continuity procedure), `VERIFICATION_STATE.md` (evidence), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan).

## Phase identity

| Field | Value |
|---|---|
| Phase number | **3** |
| Phase name | **Cross-Chat ChatGPT Continuity** |
| Full designation | **Phase 3 — Cross-Chat ChatGPT Continuity** |
| Status | **IN_PROGRESS** — developer implementation complete; awaiting architect review |
| Assigned developer | **Z.AI** (developer/implementer) |
| Architect / reviewer / controller | **ChatGPT** |
| Developer assignment | Phase 3 implementation handoff received from ChatGPT on 2026-10-01 (immediately after the Phase 2 `PASS` review) and fully executed by Z.AI, in two parts: Part A — Phase 2 closure record (commit `58856e0be6325d0326a2d7c8cde6d6d6312b9000`); Part B — this implementation (see VERIFICATION_STATE.md §Phase 3). The handoff is materialized in `ZAI_HANDOFF.md` Part II. **No new handoff is active; Z.AI must not begin Phase 4 without a new architect-issued handoff.** |

**Only ChatGPT/project-owner review can close the phase.** This phase remains OPEN until the architect reviews the Phase 3 evidence and records a review outcome. Only a `PASS` review outcome closes it (`PASS_WITH_FOLLOWUP` keeps it open with follow-ups; `CORRECTION_REQUIRED` triggers a corrective handoff). A developer completion claim never closes a phase.

## Objective

Create a durable `CHAT_CONTINUITY.md` procedure that allows a completely new ChatGPT conversation, with no access to the previous conversation, to recover the exact Clara project state and continue architectural leadership safely from GitHub repository state alone. The continuity system must prevent stale conversational memory from overriding repository truth.

## Scope (approved)

- Create `docs/project-control/CHAT_CONTINUITY.md`: the durable cross-chat ChatGPT continuity procedure — fresh-ChatGPT initialization; the 17 capability determinations; deterministic read order distinguishing mandatory / conditional / historical reads; the recovery procedure; the recovery-report schema with evidence grading (architect-verified / developer-reported / unresolved-stale / inferred-only-after-verification); the repository-authority and stale-memory rules with examples; broken-chat recovery; state-inconsistency → `BLOCKED`; architect-authority recovery; Z.AI authorization rules; a reusable copy/paste initialization prompt; recovery scenarios A–H; the validation procedure.
- Record the Phase 2 architect approval durably in `VERIFICATION_STATE.md` and commit it separately (`docs: record architect approval of phase 2` — delivered as `58856e0b`).
- Modify `PROJECT_STATE.md` and `NEXT_ACTION.md` (phase-state reconciliation to Phase 3).
- Modify other `docs/project-control/` files only where necessary to keep the Final State Contract correct: `CURRENT_PHASE.md` (this file), `ZAI_HANDOFF.md` (Part II instance replacement per §I.12 / D-016), `VERIFICATION_STATE.md` (Phase 3 evidence + reconciled consistency table).

## Non-scope (explicit)

- **Do NOT** modify application product source code, dependencies, database schema/migrations, or Vercel/deployment configuration.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`) or any other library-governed content.
- **Do NOT** create the canonical project `worklog.md` (Phase 4) or `sessions/` records.
- **Do NOT** implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, or any product capability of the north-star program.
- **Do NOT** create a Phase 4 handoff instance or any later-phase artifact.
- **Do NOT** add a validation script/validator to the repository (any reusable script stays outside the repository, in the agent workspace).
- **Do NOT** work directly on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- **Do NOT** modify `README.md` or `AGENTS.md` documents (pending architect decision D-P2).
- **Do NOT** modify the closed Phase 0 reconnaissance report or rewrite historical Phase 0/Phase 1/Phase 2 evidence.

## Prerequisites (all satisfied)

1. Phase 2 `CLOSED` — architect review `PASS` on commit `31ffd6f4330753f9b42dba231d7e02589d12eb77` (2026-10-01); closure recorded in `VERIFICATION_STATE.md` and committed as `58856e0be6325d0326a2d7c8cde6d6d6312b9000` ("docs: record architect approval of phase 2").
2. The Phase 2 handoff system is in force: `ZAI_HANDOFF.md` Part I (durable protocol) and `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md`.
3. Mandatory initialization completed by the developer on 2026-10-01: all required documents read (`README.md`; `.github/copilot-instructions.md`, `Doc/18-09-2026/AGENTS.md`, `docs/doable-source/AGENTS.md`; the eight control documents; the spec and plan; `PHASE-0-RECONNAISSANCE.md`); repository state refreshed (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; clean tree; 12 ahead / 0 behind `Vite-Converted` at the closure-record commit; mainlines unchanged); Phase 2 closure confirmed **from repository evidence**, not chat memory.

## Required deliverables

- `docs/project-control/CHAT_CONTINUITY.md` — the durable continuity procedure, satisfying the Phase 3 continuity contract: fresh-ChatGPT initialization; 17 capability determinations; read order (mandatory / conditional / historical); recovery procedure; recovery-report schema with evidence grading; repository-authority and stale-memory rules («ChatGPT must never treat previous conversational memory as authoritative when repository evidence disagrees with it.»); broken-chat recovery (never assuming completion from commit existence alone); state-inconsistency → `BLOCKED`; architect-authority recovery; Z.AI authorization rules (never inferred from Git history alone); copy/paste initialization prompt (conversation-independent); recovery scenarios A–H; validation procedure; review boundary; procedure-only status (no second source of truth).
- Phase 2 closure record in `VERIFICATION_STATE.md` (delivered in commit `58856e0b`, before this implementation).
- Phase-state reconciliation to Phase 3 across the control documents (Final State Contract): `PROJECT_STATE.md`, `CURRENT_PHASE.md` (this file), `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II), `VERIFICATION_STATE.md`.

## Acceptance criteria

1. A fresh ChatGPT session can reconstruct Clara state without the previous conversation.
2. Repository state is explicitly authoritative; stale ChatGPT memory cannot override GitHub evidence.
3. The active phase, the active Z.AI handoff, and the latest architect-verified commit can be determined from repository state alone.
4. Developer-reported evidence is distinguishable from architect-verified evidence.
5. Broken-chat recovery is deterministic.
6. State inconsistencies become `BLOCKED`.
7. Z.AI authorization can be determined without conversational memory.
8. The initialization prompt is reusable and conversation-independent.
9. No competing source of truth is introduced.
10. No product feature is implemented; no database/deployment changes occur; immutable Doable-source boundaries remain untouched.
11. Final State Contract values agree across all control documents (Phase 3 `IN_PROGRESS`; latest verified commit `31ffd6f4`).

## Verification requirements (developer, before commit)

Run and record: (1) `CHAT_CONTINUITY.md` existence; (2) required-section checks (§1–§15); (3) read-order explicitness; (4) repository-authority rule; (5) stale-memory rule; (6) recovery-report schema; (7) broken-chat procedure; (8) state-inconsistency → `BLOCKED`; (9) role separation; (10) Z.AI authorization rules; (11) initialization prompt; (12) recovery scenarios A–H; (13) internal-reference resolution; (14) no competing state source (`git ls-files`); (15) secret/credential scan of `docs/project-control/`; (16) Final State Contract consistency across the five documents; (17) `npm run validate:model-config`; (18) scope check (`git diff` / `git status`: documentation-only, `docs/project-control/` only). Commands and results are recorded in `VERIFICATION_STATE.md` §Phase 3.

## Security constraints

- No secrets, credentials, access tokens, or private chain-of-thought may be written into any control document (plan Global Constraints). The exposed Vercel token referenced by R-5 must never be reproduced here.
- Control documents record decisions and observable evidence only — not hidden reasoning.
- This phase changes documentation only; no security/tenancy surface of the application is touched.

## Git/branch constraints

- Work only on `feature/ai-core-from-doable-source`; never on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- Two focused documentation-only commits (no squashing of unrelated history, no unrelated changes riding along):
  1. `docs: record architect approval of phase 2` — closure record (delivered: `58856e0be6325d0326a2d7c8cde6d6d6312b9000`);
  2. `docs: establish cross-chat ChatGPT continuity` — this implementation (immediate child of `58856e0b`).
- Both pushed to `origin/feature/ai-core-from-doable-source`.

## Stopping boundary

Implementation stops immediately after: the continuity procedure is created, the phase state is reconciled, validation passes, the commit is created and pushed, and the developer evidence report is delivered. **Z.AI then STOPs.** Phase 3 advances only after ChatGPT review records an outcome in VERIFICATION_STATE.md (only `PASS` closes the phase and initializes Phase 4 — Worklog and Session Audit, per the plan). If review returns `CORRECTION_REQUIRED`, Z.AI acts only on the corrective handoff (ZAI_HANDOFF.md §I.5). A fresh ChatGPT session resuming leadership mid-boundary follows `CHAT_CONTINUITY.md` §5.

## Developer-reported completion state (2026-10-01)

Implementation complete: `CHAT_CONTINUITY.md` exists and satisfies the continuity contract; the Phase 3 handoff instance is materialized in `ZAI_HANDOFF.md` Part II; the phase state is reconciled across all control documents; validation was executed (commands and results in VERIFICATION_STATE.md §Phase 3); the implementation commit is the immediate child of `58856e0b` on `feature/ai-core-from-doable-source`. Awaiting architect review. **The phase is NOT closed.**
