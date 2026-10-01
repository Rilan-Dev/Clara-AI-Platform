# PHASE_HANDOFF_TEMPLATE.md — Canonical Blank Handoff Form

> **The single authoritative template for Z.AI implementation handoffs** (ZAI_HANDOFF.md §I.12; DECISIONS.md D-016). No other handoff template or format may be created.
> **Usage (developer):** when the architect (ChatGPT) issues a new phase handoff, copy this form into **Part II of `docs/project-control/ZAI_HANDOFF.md`** (replacing the previous instance) and fill every section from the architect's issued handoff — transcribe faithfully; never invent scope, tasks, criteria, or dates. Sections you cannot fill from the architect's handoff are a defect: stop and ask the architect.
> **Usage (correction):** use the dedicated canonical correction-handoff template — `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` — whenever the architect returns `CORRECTION_REQUIRED` (established by Phase 6, 2026-10-01; the appendix variant below is the superseded Phase 0–5 convention, retained as historical record only).
> Every instance must satisfy ZAI_HANDOFF.md §I.3 (mandatory sections), §I.6 (integrity fields), §I.10 (fresh-session usability), §I.8 (review boundary), and §I.9 (STOP boundary).

---

## Phase identity

| Field | Value |
|---|---|
| Phase number | *(from the architect's handoff)* |
| Phase name | *(from the architect's handoff)* |
| Full designation | *Phase N — Name* |
| Current status | *(canonical status: PLANNED / IN_PROGRESS / …)* |
| Repository | `Rilan-Dev/Clara-AI-Platform` |
| Branch | *(permitted branch, e.g. `feature/ai-core-from-doable-source`)* |
| Baseline commit | *(full SHA of the state the handoff is issued against)* |
| Architect | ChatGPT |
| Developer | Z.AI |
| Handoff date | *(YYYY-MM-DD)* |

## Objective

*(Exactly what the developer is being asked to accomplish — one precise statement.)*

## Scope (approved)

*(Explicit list of what may be changed: files, areas, documents. If implementation legitimately needs discovery, define the permitted architectural area instead of exact files.)*

## Non-scope (explicit)

*(Explicit list of what must NOT be changed: later phases, product code, dependencies, database/migrations, deployment/Vercel configuration, immutable Doable-source trees, production branches, historical evidence — as applicable.)*

## Prerequisites

*(Documents, commits, decisions, dependencies, or environmental requirements that must already exist before implementation.)*

## Required reading

*(Exact repository documents the developer must read before implementation.)*

## Implementation tasks (numbered, deterministic)

1. *(deterministic task in execution order)*
2. *(…)*

## Files / components

| Path | Action | Bounded change |
|---|---|---|
| *(path or permitted architectural area)* | create/modify/inspect | *(what may change there)* |

## Interfaces / contracts

*(API, module, data, tool, adapter, or document contracts that must remain compatible — including control-document contracts, the Final State Contract, status vocabulary, and evidence classes where applicable.)*

## Security constraints

- No secrets, credentials, or access tokens may be written (R-5 token never reproduced).
- No private chain-of-thought — observable evidence only.
- Tenancy boundaries and authorization requirements: *(state where the scope touches application code; "documentation-only — no application security surface" where it does not)*.
- Immutable-source boundaries: `docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**` never modified (D-007).
- Production-branch restrictions: no work on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main` (D-008); no deployment unless explicitly authorized.

## Testing requirements

| # | Check | Method | Expected evidence |
|---|---|---|---|
| 1 | *(required test or validation)* | *(command)* | *(expected result)* |

## Acceptance criteria (pass/fail)

1. *(concrete pass/fail condition)*

## Git requirements

- Permitted branch: *(branch)* only.
- Commit(s): *(message(s) and sequencing)*; push to `origin/<branch>`; no unrelated changes; no squashing of unrelated history; no production-branch work.

## Evidence requirements

*(Per ZAI_HANDOFF.md §I.7: exact changed files; implementation summary; tests; validation commands and outputs/results; Git status; commit SHA(s); remaining issues; remaining risks; deviations from scope; unresolved questions; confirmation that no later phase was started.)*

## Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

*(State what ChatGPT must review and which outcome closes the phase.)*

## STOP boundary

*(The explicit hard stop: after implementation, validation, commit/push, and the evidence report, Z.AI MUST STOP and wait for architect review. List what Z.AI must not do: start the next phase; implement unrelated improvements; make architectural decisions outside the handoff; deploy unless explicitly authorized; modify production; silently expand scope.)*

---

## Appendix — Corrective handoff variant (for `CORRECTION_REQUIRED`) — SUPERSEDED from Phase 6 onward

*Superseded (2026-10-01, Phase 6): the dedicated canonical correction-handoff template — `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` — is now the single authoritative correction-handoff form (ZAI_HANDOFF.md §I.5/§I.12; `ISSUES.md` §"Issue-control system"; `VERIFICATION_STATE.md` §"Correction and issue-control workflow"). This appendix variant is retained only as the historical record of the Phase 0–5 corrective-handoff convention (used by the Phase 0, Phase 4, and Phase 5 correction cycles); it must not be used for new corrective handoffs.*

*Historical form (Phase 0–5 convention) — use when the architect issues a corrective handoff after a review finds a defect (ZAI_HANDOFF.md §I.5 as then worded). The developer must not independently broaden the correction.*

| Field | Value |
|---|---|
| Corrected phase | *(phase number and name)* |
| Review finding | *(the exact defect found in architect review)* |
| Affected scope | *(files/documents/areas touched by the defect)* |
| Required correction | *(precisely what must change)* |
| Acceptance criteria | *(concrete pass/fail conditions for the correction)* |
| Verification requirements | *(commands/evidence demonstrating the correction)* |
| Explicit non-scope | *(what the correction must NOT touch)* |
| Stop condition | *(where the developer stops after delivering the correction)* |
| Baseline commit | *(full SHA the corrective handoff is issued against)* |
| Architect / developer / date | ChatGPT / Z.AI / *(YYYY-MM-DD)* |

Correction rules: execute only the corrective scope; deliver a focused commit referencing the finding; re-review follows the normal review boundary; only `PASS` closes the phase.
