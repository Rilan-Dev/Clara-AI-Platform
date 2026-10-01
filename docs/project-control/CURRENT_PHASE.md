# CURRENT_PHASE.md — Active-Phase Contract

> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-01**. Cross-references: `PROJECT_STATE.md` (authoritative state), `ZAI_HANDOFF.md` (active handoff instance), `VERIFICATION_STATE.md` (evidence), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan).

## Phase identity

| Field | Value |
|---|---|
| Phase number | **2** |
| Phase name | **Z.AI Developer Handoff System** |
| Full designation | **Phase 2 — Z.AI Developer Handoff System** |
| Status | **IN_PROGRESS** — developer implementation complete; awaiting architect review |
| Assigned developer | **Z.AI** (developer/implementer) |
| Architect / reviewer / controller | **ChatGPT** |
| Developer assignment | Phase 2 implementation handoff received from ChatGPT on 2026-10-01 (immediately after the Phase 1 `PASS` review) and fully executed by Z.AI, in two parts: Part A — Phase 1 closure record (commit `6d1c6c9d`); Part B — this implementation (see VERIFICATION_STATE.md §Phase 2). The handoff is materialized in `ZAI_HANDOFF.md` Part II. **No new handoff is active; Z.AI must not begin Phase 3 without a new architect-issued handoff.** |

**Only ChatGPT/project-owner review can close the phase.** This phase remains OPEN until the architect reviews the Phase 2 evidence and records a review outcome. Only a `PASS` review outcome closes it (`PASS_WITH_FOLLOWUP` keeps it open with follow-ups; `CORRECTION_REQUIRED` triggers a corrective handoff). A developer completion claim never closes a phase.

## Objective

Create a durable, reusable developer-handoff protocol that allows Z.AI to implement any future approved phase from repository state alone. The handoff system must make every implementation phase explicit, bounded, reproducible, reviewable, and stoppable.

## Scope (approved)

- Create `docs/project-control/ZAI_HANDOFF.md`: **Part I** — the durable handoff protocol (mandatory 16-section structure; phase lifecycle and status vocabulary; correction protocol; handoff integrity/staleness protection; evidence requirements; review boundary; STOP boundary; fresh-session usability; relationship to control documents; template and instance management); **Part II** — the active handoff instance (the Phase 2 assignment itself, materialized in the authoritative format).
- Create one reusable template: `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` — the single canonical blank form (justified by Phase 0 report §10 "templates under `docs/project-control/templates/`" and plan Phase 2 "handoff template under project-control/templates/ if appropriate").
- Record the Phase 1 architect approval durably in `VERIFICATION_STATE.md` and commit it separately (`docs: record architect approval of phase 1` — delivered as `6d1c6c9d`).
- Reconcile phase state to Phase 2 `IN_PROGRESS` across `PROJECT_STATE.md`, `CURRENT_PHASE.md` (this file), `NEXT_ACTION.md`, `DECISIONS.md`, `VERIFICATION_STATE.md` (Final State Contract).

## Non-scope (explicit)

- **Do NOT create** `CHAT_CONTINUITY.md` (Phase 3) or any Phase 3 continuity artifact.
- **Do NOT create** the canonical project `worklog.md` (Phase 4) or `sessions/` records.
- **Do NOT create** a separate correction-handoff template file (Phase 6 per plan; the correction *protocol* is defined in `ZAI_HANDOFF.md` §I.5, the template *file* is not).
- **Do NOT create** a Phase 3 handoff instance — the plan's Phase 2 checklist item "Add a first real Phase 3 handoff instance" is deliberately not executed: the architect's live Phase 2 handoff supersedes the plan checklist and forbids future-phase artifacts; a Phase 3 instance can only be authored from the architect's future Phase 3 assignment.
- **Do NOT** modify application product code, dependencies, database schema/migrations, or Vercel/deployment configuration.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`) or any other library-governed content.
- **Do NOT** work directly on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- **Do NOT** modify `README.md` or `AGENTS.md` documents (pending architect decision D-P2).
- **Do NOT** modify the closed Phase 0 reconnaissance report or rewrite historical Phase 0/Phase 1 evidence.

## Prerequisites (all satisfied)

1. Phase 1 `CLOSED` — architect review `PASS` on commit `3a8b8b4ef8a62c8c7843bbe30af4d046ca9b002f` (2026-10-01); closure recorded in `VERIFICATION_STATE.md` and committed as `6d1c6c9d` ("docs: record architect approval of phase 1").
2. The seven Phase 1 control documents exist and their contracts are in force.
3. Mandatory initialization completed by the developer on 2026-10-01: all 12 required documents read (`README.md`; `Doc/18-09-2026/AGENTS.md` and `docs/doable-source/AGENTS.md`; the seven control documents; the spec and plan; `PHASE-0-RECONNAISSANCE.md`); repository state refreshed (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; clean tree; 10 ahead / 0 behind `Vite-Converted`; mainlines unchanged); Phase 1 closure confirmed **from repository evidence**, not chat memory.

## Required deliverables

- `docs/project-control/ZAI_HANDOFF.md` — Part I protocol + Part II active instance, satisfying the handoff contract: reusable structure with phase identity (number, name, status, repository, branch, baseline commit, architect, developer, handoff date), objective, scope, non-scope, prerequisites, required reading, numbered deterministic tasks, files/components, interfaces/contracts, security constraints, testing requirements, acceptance criteria, git requirements, evidence requirements, review boundary («Developer completion does not equal phase completion.» / «Only ChatGPT/project-owner architect review can close the phase.»), and STOP boundary; plus lifecycle (`PLANNED` → `IN_PROGRESS` → developer completion → `VERIFIED` → `CLOSED`, with `CORRECTION_REQUIRED` and `BLOCKED`), the correction protocol (finding, affected scope, required correction, acceptance criteria, verification requirements, explicit non-scope, stop condition), handoff integrity (repository/branch/baseline/phase/date/status identification; GitHub authoritative; refresh-before-implement; stop on materially changed baseline), and the ten fresh-session usability requirements.
- `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` — the single reusable blank form (with the corrective-handoff variant appendix).
- Phase-state reconciliation to Phase 2 across the control documents (Final State Contract).
- Phase 1 closure record in `VERIFICATION_STATE.md` (delivered in commit `6d1c6c9d`, before this implementation).

## Acceptance criteria

1. A fresh Z.AI session can implement the active phase from repository documents alone (plan Phase 2 acceptance).
2. The handoff document structure is validated: all mandatory sections present in the protocol and the instance.
3. All internal references resolve (or are explicitly declared planned artifacts).
4. No duplicate handoff source exists repository-wide; exactly one template under `docs/project-control/templates/`.
5. Status vocabulary, role separation, evidence-class separation, and the Final State Contract are consistent across all control documents.
6. The correction protocol and the explicit STOP boundary are present and consistent.
7. No secrets, credentials, or tokens are written.
8. Scope is Phase 2 only: documentation-only diff under `docs/project-control/`; no product/DB/deployment/immutable-source changes; no Phase 3+ artifacts.

## Verification requirements (developer, before commit)

Run and record: (1) handoff document structure validation; (2) internal-reference resolution check; (3) no-duplicate-handoff-source check (`git ls-files`); (4) status vocabulary consistency check; (5) role-separation check; (6) explicit STOP boundary check; (7) correction protocol check; (8) evidence-requirements check; (9) secret/credential scan of `docs/project-control/`; (10) `git diff` and `git status` inspection; (11) scope confirmation (Phase 2 only, documentation-only); (12) lightweight read-only repository check (`npm run validate:model-config`). Commands and results are recorded in `VERIFICATION_STATE.md` §Phase 2.

## Security constraints

- No secrets, credentials, access tokens, or private chain-of-thought may be written into any control document (plan Global Constraints). The exposed Vercel token referenced by R-5 must never be reproduced here.
- Control documents record decisions and observable evidence only — not hidden reasoning.
- This phase changes documentation only; no security/tenancy surface of the application is touched.

## Git/branch constraints

- Work only on `feature/ai-core-from-doable-source`; never on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- Two focused documentation-only commits (no squashing of unrelated history, no unrelated changes riding along):
  1. `docs: record architect approval of phase 1` — closure record (delivered: `6d1c6c9d`);
  2. `docs: establish zai developer handoff system` — this implementation (immediate child of `6d1c6c9d`).
- Both pushed to `origin/feature/ai-core-from-doable-source`.

## Stopping boundary

Implementation stops immediately after: the handoff system is created, the phase state is reconciled, validation passes, the commit is created and pushed, and the developer evidence report is delivered. **Z.AI then STOPs.** Phase 2 advances only after ChatGPT review records an outcome in VERIFICATION_STATE.md (only `PASS` closes the phase and initializes Phase 3 — Cross-Chat ChatGPT Continuity, per the plan). If review returns `CORRECTION_REQUIRED`, Z.AI acts only on the corrective handoff (ZAI_HANDOFF.md §I.5).

## Developer-reported completion state (2026-10-01)

Implementation complete: `ZAI_HANDOFF.md` (protocol + Phase 2 instance) and `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` exist; the phase state is reconciled across all control documents; validation was executed (commands and results in VERIFICATION_STATE.md §Phase 2); the implementation commit is the immediate child of `6d1c6c9d` on `feature/ai-core-from-doable-source`. Awaiting architect review. **The phase is NOT closed.**
