# CURRENT_PHASE.md — Active-Phase Contract

> Canonical contract for the currently active phase of the Clara project-control system.
> Snapshot date: **2026-10-01**. Cross-references: `PROJECT_STATE.md` (authoritative state), `VERIFICATION_STATE.md` (evidence), `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (full 13-phase plan).

## Phase identity

| Field | Value |
|---|---|
| Phase number | **1** |
| Phase name | **Durable Project-Control Foundation** |
| Full designation | **Phase 1 — Durable Project-Control Foundation** |
| Status | **IN_PROGRESS** — developer implementation complete; awaiting architect review |
| Assigned developer | **Z.AI** (developer/implementer) |
| Architect / reviewer / controller | **ChatGPT** |
| Developer assignment | Phase 1 implementation handoff received from ChatGPT on 2026-10-01 and fully executed by Z.AI (see VERIFICATION_STATE.md §Phase 1). **No new handoff is active; Z.AI must not begin Phase 2 without a new architect-issued handoff.** |

**Only ChatGPT/project-owner review can close the phase.** This phase remains OPEN until the architect reviews the Phase 1 evidence and records a review outcome. Only a `PASS` review outcome closes it (`PASS_WITH_FOLLOWUP` keeps it open with follow-ups; `CORRECTION_REQUIRED` triggers a corrective handoff). A developer completion claim never closes a phase.

## Objective

Create the authoritative, durable project-control state layer in the canonical location identified by Phase 0 (`docs/project-control/`), so that a completely fresh ChatGPT session can determine the exact current project state, active phase, next action, decisions, issues, risks, and verification evidence by reading repository files — without relying on previous chat history.

## Scope (approved)

- Create exactly these documents in `docs/project-control/`: `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `DECISIONS.md`, `ISSUES.md`, `RISKS.md`, `VERIFICATION_STATE.md`.
- Define the canonical phase/status vocabulary (`PLANNED`, `IN_PROGRESS`, `BLOCKED`, `CORRECTION_REQUIRED`, `VERIFIED`, `CLOSED`) and use it consistently across all control documents.
- Define and consistently apply the evidence classes: **developer-reported** vs **architect-verified**.
- Record Phase 0 evidence accurately (status, evidence commit `adbc9e16`, correction commit `bcc1769d`, branch relationship to `Vite-Converted`, documentation-only scope).
- Record the Phase 0 decisions, issues, and risks durably (DECISIONS.md / ISSUES.md / RISKS.md).
- Ensure cross-document state-machine consistency (Final State Contract values must agree).

## Non-scope (explicit)

- **Do NOT create** `ZAI_HANDOFF.md` (Phase 2), `CHAT_CONTINUITY.md` (Phase 3), the canonical project `worklog.md` (Phase 4), `sessions/` records (Phase 4, optional), or handoff/correction templates (Phase 2/6).
- **Do NOT** implement Phase 2 or any later phase; do NOT create Phase 3 continuity documents.
- **Do NOT** modify application product code, database schema/migrations, Vercel configuration, or deployment state.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`) or any other library-governed content.
- **Do NOT** work directly on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- **Do NOT** modify the closed Phase 0 reconnaissance report (`docs/project-control/PHASE-0-RECONNAISSANCE.md`) — it is historical evidence.

## Prerequisites (all satisfied)

1. Phase 0 `CLOSED` — reconnaissance report @ `adbc9e16`, evidence correction @ `bcc1769d`, closed by architect Phase 1 handoff issuance (2026-10-01).
2. Phase 0 canonical-location finding adopted: control documents live in `docs/project-control/` (architect-confirmed by the Phase 1 handoff).
3. Mandatory initialization completed by the developer on 2026-10-01: read `README.md`, `Doc/18-09-2026/AGENTS.md`, `docs/doable-source/AGENTS.md` (boundary rules), the control-system spec and plan, and the Phase 0 report; inspected branch/HEAD and confirmed no competing control documents exist.

## Required deliverables

The seven control documents listed in Scope, each satisfying its document contract:

- `PROJECT_STATE.md` — authoritative current-state summary with all required fields, evidence-class labels, and links to sibling control documents.
- `CURRENT_PHASE.md` — this contract.
- `NEXT_ACTION.md` — smallest useful fresh-session continuation instruction (short; answers: active phase, project state, what happens next, what to read, active handoff status, architect verification prerequisites).
- `DECISIONS.md` — durable decision register in a stable appendable format.
- `ISSUES.md` — durable issue register separated into open / resolved / deferred / informational.
- `RISKS.md` — durable risk register with ID, status, description, impact, mitigation, owner, phase, evidence (no unsupported ratings).
- `VERIFICATION_STATE.md` — evidence register strictly separating developer-reported from architect-verified evidence.

## Acceptance criteria

1. A reviewer can determine project status without reading the chat (plan Phase 1 acceptance).
2. Every required file exists with stable headings and required fields.
3. No duplicate/competing source of truth exists in the repository.
4. All cross-references point to real repository paths (future documents are explicitly marked "planned — does not exist yet").
5. Phase 0 evidence is represented accurately (commits, branch relationship, documentation-only scope, correction trail).
6. Developer-reported evidence is never presented as architect-verified; no architect verification of Phase 1 is claimed.
7. State-machine consistency: `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `VERIFICATION_STATE.phase` = Phase 1, with status `IN_PROGRESS`.

## Verification requirements (developer, before commit)

Run and record: (1) required-file existence check; (2) required-field/heading presence checks; (3) no-competing-documents check (`git ls-files`); (4) cross-reference path check; (5) Phase 0 evidence accuracy check; (6) evidence-class separation check; (7) secret/credential scan of `docs/project-control/`; (8) available document validation (none configured in-repo — structural checks used; see VERIFICATION_STATE.md); (9) lightweight read-only repository check (`npm run validate:model-config`); (10–11) `git diff` and `git status` inspection; (12) scope confirmation (only `docs/project-control/` additions).

## Security constraints

- No secrets, credentials, access tokens, or private chain-of-thought may be written into any control document (plan Global Constraints). The exposed Vercel token referenced by R-5 must never be reproduced here.
- Control documents record decisions and observable evidence only — not hidden reasoning.
- This phase changes documentation only; no security/tenancy surface of the application is touched.

## Git/branch constraints

- Work only on `feature/ai-core-from-doable-source`; never on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- One focused documentation-only commit: `docs: establish durable project control foundation`, pushed to `origin/feature/ai-core-from-doable-source`.
- No squashing of unrelated commits; no unrelated refactors riding along.

## Stopping boundary

Implementation stops immediately after: the seven documents are created, validation passes, the commit is created and pushed, and the developer evidence report is delivered. **Z.AI then STOPs.** Phase 1 advances only after ChatGPT review records an outcome in VERIFICATION_STATE.md (only `PASS` closes the phase and initializes Phase 2 — Z.AI Developer Handoff System, per the plan). If review returns `CORRECTION_REQUIRED`, Z.AI acts only on the corrective handoff.

## Developer-reported completion state (2026-10-01)

Implementation complete: the seven documents exist, validation was executed (commands and results in VERIFICATION_STATE.md), the foundation commit is the immediate child of `bcc1769d` on `feature/ai-core-from-doable-source`. Awaiting architect review. **The phase is NOT closed.**
