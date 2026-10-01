# ZAI_HANDOFF.md — Z.AI Developer Handoff System

> Canonical developer-handoff protocol and active handoff instance for the Clara project-control system.
> **Part I** is the durable, reusable handoff protocol — it applies to every implementation phase and changes only by architect direction.
> **Part II** holds the **active handoff instance**: the current phase's assignment materialized in the authoritative format. When the architect issues a new phase handoff, the developer replaces Part II with the new instance; superseded instances remain recoverable in Git history (and, from Phase 4 onward, in the canonical worklog).
> Snapshot date: **2026-10-01**. Repository state is authoritative — refresh it before acting (§I.6).
> Canonical blank form: `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` — the only handoff template; no duplicate handoff formats may be created.

---

## Part I — Handoff Protocol (durable; applies to every phase)

### I.1 Purpose

Establish one authoritative, reusable format for Z.AI implementation handoffs so that every implementation phase is **explicit, bounded, reproducible, reviewable, and stoppable**, and so that a completely fresh Z.AI session can implement any approved phase **from repository state alone** — without access to any previous conversation. The handoff system is durable repository state (DECISIONS.md D-006), not chat-carried instruction.

### I.2 Roles and authority boundaries

| Role | Holder | Boundaries |
|---|---|---|
| Developer / implementer | **Z.AI** | Executes the active handoff only. Implements, self-verifies, records evidence, commits, pushes, reports, and **STOPs at the phase boundary**. Must never claim architect approval, never close a phase, never assume architect authority, and never start a later phase without a new architect-issued handoff |
| Architect / technical lead / reviewer / controller | **ChatGPT** | Issues handoffs, reviews evidence, records review outcomes, closes phases, controls Vercel/Supabase operations where applicable. Only ChatGPT/project-owner review closes a phase (D-009) |
| Deployment authority | Vercel (controlled by ChatGPT) | Z.AI never deploys unless explicitly authorized in a handoff (D-004) |
| Database authority | Supabase (controlled by ChatGPT) | Z.AI never changes remote database state unless explicitly authorized in a handoff (D-005) |

### I.3 Required handoff structure (mandatory sections)

Every handoff instance — Part II of this file, created from `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` — MUST contain all of the following sections. A handoff missing any section is incomplete and must not be executed.

| # | Section | Must contain |
|---|---|---|
| 1 | Phase identity | Phase number; phase name; current status; repository; branch; baseline commit; architect; developer; handoff date |
| 2 | Objective | Exactly what the developer is being asked to accomplish — one precise statement, no implied extras |
| 3 | Scope | Explicit list of what may be changed (files, areas, documents) |
| 4 | Non-scope | Explicit list of what must NOT be changed — including later phases, product code, database, deployment, and immutable sources as applicable |
| 5 | Prerequisites | Documents, commits, decisions, dependencies, or environmental requirements that must already exist before implementation |
| 6 | Required reading | Exact repository documents the developer must read before implementation |
| 7 | Implementation tasks | Numbered, deterministic tasks in execution order |
| 8 | Files / components | Expected files or bounded areas that may be changed. Where implementation legitimately needs discovery, the permitted architectural area is defined instead of exact files |
| 9 | Interfaces / contracts | API, module, data, tool, adapter, or document contracts that must remain compatible |
| 10 | Security constraints | No secrets; no credentials; no tokens; tenancy boundaries; authorization requirements; immutable-source boundaries; production-branch restrictions — as applicable |
| 11 | Testing requirements | Required tests; validation commands; expected evidence; what must be tested before completion |
| 12 | Acceptance criteria | Concrete pass/fail conditions |
| 13 | Git requirements | Permitted branch; commit requirements; push requirements; no unrelated changes; no production-branch work |
| 14 | Evidence requirements | The developer completion report fields (§I.7) |
| 15 | Review boundary | The statements in §I.8 |
| 16 | STOP boundary | The hard stop defined in §I.9 |

### I.4 Phase lifecycle and status vocabulary

Canonical statuses (D-011; identical vocabulary across all control documents):

```
PLANNED → IN_PROGRESS → developer completion → VERIFIED (architect review) → CLOSED
                        ↘ CORRECTION_REQUIRED (architect review found a defect) → corrective handoff → correction → re-review
                        ↘ BLOCKED (state values disagree, or the phase cannot safely proceed) → reconcile → resume
```

Rules:

1. `PLANNED` — phase defined but not started. Assignment received but not yet begun keeps the phase `PLANNED` until implementation starts.
2. `IN_PROGRESS` — active work underway. **Developer implementation complete, awaiting architect review, is still `IN_PROGRESS`.**
3. Developer completion NEVER transitions a phase to `VERIFIED` or `CLOSED`. Only architect review records `VERIFIED`, and only a `PASS` review outcome closes a phase (`CLOSED`). `PASS_WITH_FOLLOWUP` keeps the phase open with recorded follow-ups.
4. `CORRECTION_REQUIRED` — architect review found a defect; §I.5 applies.
5. `BLOCKED` — the Final State Contract values disagree across control documents, or a blocker prevents safe progress. The phase stays `BLOCKED` until reconciled; reconciliation is recorded in `VERIFICATION_STATE.md`.
6. Phase status is recorded in `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (Part II Phase identity), and `VERIFICATION_STATE.md` — these must always agree (Final State Contract).

### I.5 Correction protocol (`CORRECTION_REQUIRED`)

When architect review returns `CORRECTION_REQUIRED`, the architect issues a **corrective handoff** to the developer. The corrective handoff contains, at minimum:

1. **Finding** — the exact defect or divergence found in review;
2. **Affected scope** — the files/documents/areas touched by the defect;
3. **Required correction** — precisely what must change;
4. **Acceptance criteria** — concrete pass/fail conditions for the correction;
5. **Verification requirements** — commands/evidence required to demonstrate the correction;
6. **Explicit non-scope** — what the correction must NOT touch;
7. **Stop condition** — where the developer stops after delivering the correction.

Rules:

- The developer executes **only** the corrective scope. The developer must NOT independently broaden the correction, fix unrelated issues, refactor, or ride along any extra change.
- The correction is delivered as a focused commit whose message and evidence reference the finding (traceability: finding → corrective handoff → developer commit → re-review, per plan §Review Focus #5).
- Re-review follows the normal review boundary (§I.8). Only `PASS` closes the phase.
- Observed exemplar: the Phase 0 correction cycle (architect finding → corrective directive → developer commit `bcc1769d` → architect advancement; ISSUES.md I-002).
- The dedicated correction-handoff template file is planned for Phase 6 (plan Phase 6); until then, corrective handoffs are recorded in Part II of this file (replacing or annotating the active instance) and in `VERIFICATION_STATE.md`.

### I.6 Handoff integrity (staleness protection)

Every handoff instance must identify: **repository, branch, baseline commit, phase, date, current status** (Part II Phase identity). GitHub is authoritative (D-001); chat history is supplementary.

Before implementing any handoff, Z.AI MUST refresh repository state and verify the handoff is current:

```bash
git fetch --prune origin
git status --porcelain=v1                 # must be clean
git branch --show-current                  # must equal the handoff's branch
git rev-parse HEAD                         # must equal the handoff's baseline commit, or a documented descendant of it
git rev-parse origin/<branch>              # local HEAD must not be behind origin
```

If the baseline has changed materially — unexpected commits on the branch, divergence from origin, phase-state disagreement among the control documents, or a control-document record of a different active phase — Z.AI MUST STOP and request/await a refreshed handoff rather than blindly applying stale instructions. A stale handoff executed against a moved baseline is exactly the drift failure the control system exists to prevent (RISKS.md R-1; ISSUES.md I-002, I-004).

### I.7 Developer evidence and completion report

At completion of the assigned scope, Z.AI reports ALL of the following (mirrors plan §Required Z.AI Evidence Format):

- exact changed files;
- implementation summary (what was created/changed);
- tests run;
- validation commands and their outputs/results;
- Git status (clean/in-sync) and the implementation commit SHA;
- remaining issues;
- remaining risks;
- deviations from scope (if any);
- unresolved questions (if any);
- security/tenancy considerations (if applicable);
- migration/deployment details (only if applicable);
- explicit confirmation that no later phase was started.

The report is developer-reported evidence, submitted for architect review. Z.AI must not claim architect approval.

### I.8 Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

Review outcomes are `PASS` (closes the phase), `PASS_WITH_FOLLOWUP` (phase stays open with recorded follow-ups), and `CORRECTION_REQUIRED` (corrective handoff issued; §I.5). Review outcomes and their evidence are recorded by the architect workflow in `VERIFICATION_STATE.md`, which strictly separates developer-reported from architect-verified evidence (D-012).

### I.9 STOP boundary (hard stop)

After completing the assigned scope, validation, commit/push, and the evidence report, Z.AI MUST STOP and wait for architect review. Until a new architect-issued handoff arrives, Z.AI must NOT:

1. start the next phase (or any later phase);
2. implement unrelated improvements;
3. make architectural decisions outside the handoff;
4. deploy unless explicitly authorized;
5. modify production (branches, database, deployment configuration);
6. silently expand scope.

This STOP boundary is mandatory for every handoff instance.

### I.10 Fresh-session usability requirements

A completely new Z.AI session with no previous conversation must be able to, from repository files alone:

1. identify its role (developer/implementer — §I.2);
2. identify the active phase (Part II Phase identity; `PROJECT_STATE.md`);
3. identify the exact scope (Part II Scope);
4. identify the non-scope (Part II Non-scope);
5. know what to read (Part II Required reading);
6. know what to implement (Part II Implementation tasks);
7. know what to test (Part II Testing requirements);
8. know what evidence to produce (Part II Evidence requirements; §I.7);
9. know when to stop (Part II STOP boundary; §I.9);
10. know that ChatGPT must review the result (Part II Review boundary; §I.8).

A handoff instance that fails any of these ten checks is defective and must be corrected before execution.

### I.11 Relationship to other control documents

Fresh-session read order for a Z.AI developer session:

1. `docs/project-control/PROJECT_STATE.md` (authoritative current state);
2. `docs/project-control/CURRENT_PHASE.md` (active-phase contract);
3. **this file** — `docs/project-control/ZAI_HANDOFF.md` (active handoff instance);
4. `docs/project-control/VERIFICATION_STATE.md` (evidence and verification state);
5. `docs/project-control/NEXT_ACTION.md` (smallest continuation instruction);
6. registers as needed: `DECISIONS.md`, `ISSUES.md`, `RISKS.md`;
7. codebase agent instructions: `Doc/18-09-2026/AGENTS.md`; immutable-source rules: `docs/doable-source/AGENTS.md`.

`ZAI_HANDOFF.phase` (Part II Phase identity) participates in the Final State Contract and must agree with `PROJECT_STATE.current_phase`, `CURRENT_PHASE.phase`, `NEXT_ACTION.phase`, `VERIFICATION_STATE.phase`, and the latest verified commit.

### I.12 Template and instance management

- `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` is the single canonical blank form (Phase 0 report §10; plan Phase 2). No other handoff template may be created; no duplicate handoff source may exist (`git ls-files` must show exactly one handoff protocol file and one handoff template file under `docs/project-control/`).
- New instances are created by filling the template from the architect's issued handoff and replacing Part II of this file as the first implementation task of the new phase.
- Superseded instances are NOT kept as separate files (that would create competing sources of truth); they remain recoverable in Git history, and from Phase 4 onward in the canonical worklog.
- The correction-handoff template file is planned for Phase 6 (§I.5).

---

## Part II — Active Handoff Instance

### Phase identity

| Field | Value |
|---|---|
| Phase number | **2** |
| Phase name | **Z.AI Developer Handoff System** |
| Full designation | **Phase 2 — Z.AI Developer Handoff System** |
| Current status | **IN_PROGRESS** — developer implementation complete; awaiting architect review |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `3a8b8b4ef8a62c8c7843bbe30af4d046ca9b002f` — Phase 1 implementation, architect-verified by the `PASS` review (2026-10-01); the closure-record commit `6d1c6c9d61a2f3a54a48acaa2e9fc135facb3309` ("docs: record architect approval of phase 1", directed by this same handoff) precedes the Phase 2 implementation commit |
| Architect | **ChatGPT** (architect / technical lead / reviewer / controller) |
| Developer | **Z.AI** (developer / implementer) |
| Handoff date | 2026-10-01 |

### Objective

Create a durable, reusable developer-handoff protocol that allows Z.AI to implement any future approved phase from repository state alone, making every implementation phase explicit, bounded, reproducible, reviewable, and stoppable.

### Scope (approved)

- Create `docs/project-control/ZAI_HANDOFF.md` (this document): Part I — the durable handoff protocol (structure, lifecycle, correction protocol, integrity, evidence, review boundary, STOP boundary, fresh-session usability); Part II — the active handoff instance (this Phase 2 assignment materialized in the authoritative format).
- Create one reusable template: `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` — justified by the existing architecture (Phase 0 report §10 recommends templates under `docs/project-control/templates/` for Phase 2/6; plan Phase 2: "handoff template under project-control/templates/ if appropriate").
- Record the Phase 1 architect approval durably in `docs/project-control/VERIFICATION_STATE.md` and commit it separately (delivered: commit `6d1c6c9d`).
- Reconcile phase state across the control documents to Phase 2 `IN_PROGRESS` (Final State Contract): `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `DECISIONS.md`, `VERIFICATION_STATE.md`.

### Non-scope (explicit)

- **Do NOT** create `CHAT_CONTINUITY.md` (Phase 3) or any Phase 3 continuity artifact.
- **Do NOT** create the canonical `worklog.md` (Phase 4) or `sessions/` records.
- **Do NOT** create a separate correction-handoff template file (Phase 6 per the plan; the correction *protocol* is defined in §I.5, the template *file* is not).
- **Do NOT** create a Phase 3 handoff instance. (The plan's Phase 2 checklist item "Add a first real Phase 3 handoff instance" is deliberately NOT executed: this architect handoff supersedes the plan checklist and forbids future-phase artifacts; a Phase 3 instance can only be authored from the architect's future Phase 3 assignment.)
- **Do NOT** modify application source, dependencies, database schema/migrations, or Vercel/deployment configuration.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`).
- **Do NOT** deploy, and do NOT work directly on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- **Do NOT** modify `README.md` or `AGENTS.md` documents (pending architect decision D-P2; plan Phase 2 allows modification only if Phase 0 confirms, and Phase 0 left this decision open).
- **Do NOT** modify the closed Phase 0 reconnaissance report or rewrite historical Phase 0/Phase 1 evidence.

### Prerequisites (all satisfied 2026-10-01)

1. Phase 1 `CLOSED` — architect review `PASS` on `3a8b8b4ef8a62c8c7843bbe30af4d046ca9b002f`; closure recorded in `VERIFICATION_STATE.md` and committed as `6d1c6c9d` ("docs: record architect approval of phase 1").
2. The seven Phase 1 control documents exist in `docs/project-control/` and their contracts are in force.
3. Mandatory initialization completed by the developer: all documents in Required reading read; repository state refreshed (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; clean tree; 10 ahead / 0 behind `Vite-Converted`; mainlines unchanged); Phase 1 closure confirmed **from repository evidence**, not chat memory.

### Required reading (completed 2026-10-01)

1. `README.md`
2. Applicable `AGENTS.md` documents: `Doc/18-09-2026/AGENTS.md` (codebase agent instructions) and `docs/doable-source/AGENTS.md` (immutable-source boundary rules)
3. `docs/project-control/PROJECT_STATE.md`
4. `docs/project-control/CURRENT_PHASE.md`
5. `docs/project-control/NEXT_ACTION.md`
6. `docs/project-control/DECISIONS.md`
7. `docs/project-control/ISSUES.md`
8. `docs/project-control/RISKS.md`
9. `docs/project-control/VERIFICATION_STATE.md`
10. `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md`
11. `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`
12. `docs/project-control/PHASE-0-RECONNAISSANCE.md`

### Implementation tasks (numbered, deterministic)

1. Complete the mandatory initialization (Required reading; repository refresh; confirm Phase 1 architect-verified and CLOSED from repository evidence).
2. Record the Phase 1 closure in `VERIFICATION_STATE.md` (architect `PASS` review trail; Phase 1 → `CLOSED`; Phase 2 next) and commit separately as `docs: record architect approval of phase 1`; push; verify clean status. *(Delivered: commit `6d1c6c9d`.)*
3. Create `docs/project-control/ZAI_HANDOFF.md` — Part I protocol + Part II (this instance).
4. Create `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` (single authoritative blank form).
5. Reconcile phase state to Phase 2 `IN_PROGRESS`: update `PROJECT_STATE.md` (current phase, commit state, last architect verification, completed phases, next action, document index), `CURRENT_PHASE.md` (Phase 2 contract), `NEXT_ACTION.md` (Phase 2 continuation instruction), `DECISIONS.md` (append handoff-system decisions), `VERIFICATION_STATE.md` (Phase 2 evidence + reconciled Final State Contract table + appendix).
6. Execute the validation suite (Testing requirements below); record commands and results in `VERIFICATION_STATE.md`.
7. Commit as `docs: establish zai developer handoff system`; push to `origin/feature/ai-core-from-doable-source`; verify clean status and sync.
8. Deliver the developer completion report (Evidence requirements below) and STOP.

### Files / components

| Path | Action | Bounded change |
|---|---|---|
| `docs/project-control/ZAI_HANDOFF.md` | create | This document (protocol + active instance) |
| `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` | create | Single reusable blank form |
| `docs/project-control/PROJECT_STATE.md` | modify | Phase-state reconciliation only; document contract preserved |
| `docs/project-control/CURRENT_PHASE.md` | modify | Replace Phase 1 contract with Phase 2 contract (same contract structure) |
| `docs/project-control/NEXT_ACTION.md` | modify | Phase 2 continuation instruction (same 5-part structure) |
| `docs/project-control/DECISIONS.md` | modify | Append new decisions only (append-only register) |
| `docs/project-control/VERIFICATION_STATE.md` | modify | Phase 2 evidence section, reconciled consistency table, appendix commands |

Not modified (no change justified): `ISSUES.md`, `RISKS.md` (no new defects/risks discovered; no architect direction to change), `PHASE-0-RECONNAISSANCE.md` (historical evidence), `README.md` / `AGENTS.md` documents (D-P2 pending), all application/product/database/deployment/immutable-source paths.

### Interfaces / contracts

- **Control-document contracts** (Phase 1): the seven documents' required fields and headings remain intact; only dated state values are reconciled.
- **Final State Contract** (plan): `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` = `VERIFICATION_STATE.phase` = Phase 2; latest verified commit = `3a8b8b4` (Phase 1, architect-verified). Latest worklog entry: canonical worklog does not exist yet (Phase 4) — no conflict possible.
- **Status vocabulary** (D-011): `PLANNED` / `IN_PROGRESS` / `BLOCKED` / `CORRECTION_REQUIRED` / `VERIFIED` / `CLOSED` — no conflicting vocabulary.
- **Evidence classes** (D-012): developer-reported vs architect-verified, strictly separated; no un-happened architect verification is claimed.
- **Review outcomes** (D-009): `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`; only `PASS` closes.
- **This document's own contract** (new, this phase): Part I protocol + Part II active instance + `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` = the single authoritative handoff format (DECISIONS.md D-016).
- **Spec §Developer Handoff Contract** and **plan §Phase 2 Interfaces**: satisfied by §I.3 and Part II.

### Security constraints

- No secrets, credentials, or access tokens may be written into any handoff or control document; the exposed Vercel token (R-5) is never reproduced.
- No private chain-of-thought — handoffs record decisions and observable evidence only.
- Tenancy boundaries and authorization requirements: this phase is documentation-only and touches no application security surface; future handoffs must state tenant-authorization and RBAC requirements wherever the scope touches application code.
- Immutable-source boundaries: `docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**` are never modified (D-007).
- Production-branch restrictions: no work on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main` (D-008); no deployment operations.

### Testing requirements (validation before commit)

| # | Check | Method |
|---|---|---|
| 1 | Handoff document structure | All 16 mandatory sections present in Part II and in the template; Part I contains lifecycle, correction protocol, integrity, evidence, review boundary, STOP boundary, fresh-session usability |
| 2 | Internal references resolve | Backtick-path extraction + existence test; unresolved paths must be exactly the declared planned ones |
| 3 | No duplicate handoff source | `git ls-files` — exactly one handoff protocol file + one template under `docs/project-control/` |
| 4 | Status vocabulary consistency | Phase 2 `IN_PROGRESS` agrees across `PROJECT_STATE` / `CURRENT_PHASE` / `NEXT_ACTION` / `ZAI_HANDOFF` / `VERIFICATION_STATE` |
| 5 | Role separation | Developer never presented as architect; no architect-verification claims for Phase 2 output |
| 6 | Explicit STOP boundary | §I.9 + Part II STOP boundary present and consistent |
| 7 | Correction protocol | §I.5 present with all seven corrective-handoff fields |
| 8 | Evidence requirements | §I.7 + Part II Evidence requirements list all report fields |
| 9 | No secrets | Credential-pattern scan of `docs/project-control/` |
| 10 | Scope check | `git diff` / `git status`: documentation-only, `docs/project-control/` only |
| 11 | Lightweight repository validation | `npm run validate:model-config` (read-only) |

### Acceptance criteria (pass/fail)

1. `docs/project-control/ZAI_HANDOFF.md` exists and satisfies its full contract (structure, lifecycle, correction protocol, integrity, fresh-session usability, review boundary, STOP boundary) — PASS/FAIL.
2. Exactly one reusable template exists under `docs/project-control/templates/`, matching the protocol structure, with no duplicate handoff sources repository-wide — PASS/FAIL.
3. Final State Contract values agree across all control documents (Phase 2 `IN_PROGRESS`; latest verified commit `3a8b8b4`) — PASS/FAIL.
4. Phase 1 closure trail is durably recorded (`PASS` review, `3a8b8b4`, closure commit `6d1c6c9d`) without rewriting historical Phase 0 evidence — PASS/FAIL.
5. No product, dependency, database/migration, Vercel/deployment, or immutable-source changes — PASS/FAIL.
6. No Phase 3+ artifacts exist (`CHAT_CONTINUITY.md`, `worklog.md`, `sessions/`, Phase 3 handoff instance) — PASS/FAIL.
7. A fresh Z.AI session can determine role, phase, scope, non-scope, reading list, tasks, tests, evidence, stop point, and review requirement from repository files alone — PASS/FAIL.
8. Working tree clean; both commits pushed to `feature/ai-core-from-doable-source` — PASS/FAIL.

### Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- Two focused documentation commits (no squashing of unrelated history):
  1. `docs: record architect approval of phase 1` (closure record — delivered as `6d1c6c9d`);
  2. `docs: establish zai developer handoff system` (this implementation — the immediate child of `6d1c6c9d`; exact SHA via `git rev-parse origin/feature/ai-core-from-doable-source` after push).
- Both pushed to `origin/feature/ai-core-from-doable-source`; no unrelated changes ride along.

### Evidence requirements

The developer completion report must provide: phase; status; exact changed files; the Phase 1 closure commit SHA; implementation summary; validation commands and results; Git evidence (before SHA `3a8b8b4`, closure SHA `6d1c6c9d`, implementation SHA, current HEAD, branch, clean/in-sync status); scope verification (no product/DB/deployment/immutable-source/Phase 3+ changes); remaining issues; remaining risks; deviations from scope; unresolved questions; and the explicit statement that ChatGPT must independently review and close Phase 2 (§I.7, plan §Required Z.AI Evidence Format).

### Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

ChatGPT must independently review the Phase 2 implementation commit (and the closure commit `6d1c6c9d`), verify the handoff-system contract, and record one of `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED` in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 2.

### STOP boundary

After the Phase 2 implementation, commit/push, and evidence report: **Z.AI STOPs.** Z.AI must not begin Phase 3, must not create `CHAT_CONTINUITY.md`, must not create `worklog.md`, must not implement product features, must not deploy, and must not modify production. Z.AI waits for ChatGPT architect review. Only ChatGPT/project-owner review can close Phase 2.
