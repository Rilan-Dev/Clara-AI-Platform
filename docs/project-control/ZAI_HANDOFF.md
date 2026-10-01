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
| Phase number | **4** |
| Phase name | **Worklog and Session Audit** |
| Full designation | **Phase 4 — Worklog and Session Audit** |
| Current status | **CLOSED** — architect review `PASS` (2026-10-01); the handoff is fully executed. Phase 5 — Verification and Phase-Gate System is the next phase and has NOT started (no Phase 5 handoff instance exists) |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `d12b0582f370c0192a97bad0ad1b1dc81b7f0713` — the Phase 3 closure-record commit (child of the external `b65725e5` after the documented rebase); branch history `3706b977` → `b65725e5` → `d12b0582`. The `b65725e5` commit is accepted as an already-existing repository event (provenance not independently established) and must not be rewritten, reverted, amended, or otherwise modified |
| Architect | **ChatGPT** (architect / technical lead / reviewer / controller) |
| Developer | **Z.AI** (developer / implementer) |
| Handoff date | 2026-10-01 (refreshed Phase 4 implementation handoff, issued after the architect's review of the moved baseline) |

### Objective

Create the durable project-wide worklog and session-audit layer so future ChatGPT sessions can reconstruct project history without depending on conversation memory — with the worklog established as an audit/history artifact that does not replace the current-state authority of the project-control documents.

### Scope (approved)

- Create `worklog.md` at the repository root — the canonical Clara project worklog (explicitly authorized by this handoff, superseding the Phase 3 prohibition; distinct from the library-scoped `docs/doable-source/WORKLOG.md`): canonical entry schema; explicit status values; append-only convention with explicit corrections only; accurate Phase 0–3 historical reconstruction (reconnaissance and stale-evidence correction; Phase 1 foundation, `PASS`, closure, transition; Phase 2 handoff system, `PASS`, closure, transition; Phase 3 continuity implementation, `PASS`, closure, transition); a clearly identified repository-event entry for `b65725e5` with exactly the authorized facts; developer-reported/architect-verified evidence classification; the explicit declaration that it does not replace `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md`, or `VERIFICATION_STATE.md`.
- Create the session audit records under `docs/project-control/sessions/` required by the approved Phase 4 specification/plan, using the canonical structure (session identity; date/time only if actually known; role; phase; starting repository state; work performed; evidence produced; decisions/actions; resulting commits; validation; stopping boundary; next responsible role). Do not invent additional current-state files.
- Reconcile `PROJECT_STATE.md`, `CURRENT_PHASE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` Part II (this instance), and `VERIFICATION_STATE.md` to Phase 4 `IN_PROGRESS` with baseline `d12b0582`.
- Consequential register updates entailed by the deliverables: `ISSUES.md` I-003 resolution with dated evidence; `DECISIONS.md` D-018/D-019 with D-P1 marked confirmed.

### Non-scope (explicit)

- **Do NOT** modify `src/` or `packages/`; do not implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, or any AI provider behavior.
- **Do NOT** modify database schema, create migrations, or run remote database mutations.
- **Do NOT** modify `vercel.json` or any Vercel configuration; do not deploy; do not modify `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- **Do NOT** rewrite, revert, amend, or otherwise modify `b65725e5`.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`).
- **Do NOT** resolve R-3, R-4, or R-5, or rotate the Vercel token, unless explicitly handed off later.
- **Do NOT** resolve unrelated issues, start Phase 5, or create any later-phase artifact.
- **Do NOT** add a validation script/validator to the repository (any reusable script stays outside the repository, in the agent workspace, per the Phase 3 convention).
- **Do NOT** modify `README.md` or `AGENTS.md` documents (pending architect decision D-P2), or the closed Phase 0 reconnaissance report, or rewrite historical Phase 0/1/2/3 evidence.

### Prerequisites (all satisfied 2026-10-01)

1. Phase 3 `CLOSED` — architect review `PASS` (2026-10-01) on implementation commit `3706b977099e8a1aa8b867c936149439b1f700c0`; closure record `d12b0582f370c0192a97bad0ad1b1dc81b7f0713` ("docs: record architect approval of phase 3").
2. The architect reviewed the moved baseline: `b65725e5` independently verified as changing only `vercel.json` and enabling Vercel deployment for this branch; accepted as an already-existing repository event (provenance not independently established); R-3/R-4/R-5 remain out of Phase 4 scope; Phase 4 authorized to continue from `d12b0582`.
3. Mandatory initialization completed by the developer on 2026-10-01: all documents in Required reading read; repository state refreshed (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; HEAD `d12b0582` = origin tip, clean tree; 15 ahead / 0 behind `Vite-Converted`; mainlines unchanged); Phase 3 closure and the refreshed baseline confirmed from repository evidence, not chat memory.

### Required reading (completed 2026-10-01)

1. `README.md`
2. Applicable agent-instruction documents: `.github/copilot-instructions.md`, `Doc/18-09-2026/AGENTS.md` (codebase agent instructions) and `docs/doable-source/AGENTS.md` (immutable-source boundary rules)
3. `docs/project-control/PROJECT_STATE.md`
4. `docs/project-control/CURRENT_PHASE.md`
5. `docs/project-control/NEXT_ACTION.md`
6. `docs/project-control/DECISIONS.md`
7. `docs/project-control/ISSUES.md`
8. `docs/project-control/RISKS.md`
9. `docs/project-control/VERIFICATION_STATE.md`
10. `docs/project-control/ZAI_HANDOFF.md` (Part I protocol + the Phase 3 instance then active)
11. `docs/project-control/CHAT_CONTINUITY.md`
12. `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md`
13. `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (Phase 4 section)
14. `docs/project-control/PHASE-0-RECONNAISSANCE.md`
15. `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md`

### Implementation tasks (numbered, deterministic)

1. Complete the mandatory initialization (Required reading; repository refresh per §I.6; confirm Phase 3 `CLOSED` and the refreshed baseline `d12b0582` from repository evidence).
2. Replace Part II of this file with this Phase 4 handoff instance (per §I.12).
3. Create the canonical project worklog at the repository root (`worklog.md`) per the Historical worklog requirements: preamble with authority classification (audit/history, not current-state authority), evidence classes, status vocabulary, canonical entry schema, append-only/timestamp/security conventions; branch context; historical entries for Phases 0–3; the dedicated `b65725e5` mid-handoff event entry; the Phase 4 entry.
4. Create `docs/project-control/sessions/` (`README.md` convention + session records covering the Z.AI developer sessions, architect bounding actions recorded within with evidence classes).
5. Reconcile phase state to Phase 4 `IN_PROGRESS`: update `PROJECT_STATE.md` (current phase, commit state including the re-baselined branch-delta record, last architect verification, completed phases + Phase 3, next action, document index), `CURRENT_PHASE.md` (Phase 4 contract), `NEXT_ACTION.md` (Phase 4 continuation instruction), `VERIFICATION_STATE.md` (Phase 4 evidence + architect moved-baseline review trail + validation results + reconciled Final State Contract table + appendix commands).
6. Apply the consequential register updates: resolve `ISSUES.md` I-003 with dated evidence; append `DECISIONS.md` D-018/D-019 and mark D-P1 confirmed.
7. Execute the validation suite (Testing requirements below); record commands and results in `VERIFICATION_STATE.md` §Phase 4.
8. Commit as `docs: establish phase 4 worklog and session audit`; push to `origin/feature/ai-core-from-doable-source`; verify clean status and sync.
9. Deliver the developer completion report (Evidence requirements below) and STOP.

### Files / components

| Path | Action | Bounded change |
|---|---|---|
| `worklog.md` | create | The canonical Clara project worklog (audit/history artifact; Phases 0–3 + the `b65725e5` event + the Phase 4 entry) |
| `docs/project-control/sessions/README.md` | create | Session-audit convention and record schema |
| `docs/project-control/sessions/SESSION-00*.md` | create | Session audit records (Z.AI developer sessions; architect bounding actions within) |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II instance replacement only (Phase 3 → Phase 4); Part I protocol untouched |
| `docs/project-control/PROJECT_STATE.md` | modify | Phase-state reconciliation only; document contract preserved |
| `docs/project-control/CURRENT_PHASE.md` | modify | Replace Phase 3 contract with Phase 4 contract (same contract structure) |
| `docs/project-control/NEXT_ACTION.md` | modify | Phase 4 continuation instruction (same 5-part structure) |
| `docs/project-control/VERIFICATION_STATE.md` | modify | Phase 4 evidence, architect moved-baseline review trail, validation results, reconciled consistency table, appendix commands |
| `docs/project-control/ISSUES.md` | modify | I-003 → resolved with dated evidence (consequential register update) |
| `docs/project-control/DECISIONS.md` | modify | D-018/D-019 appended; D-P1 marked confirmed (consequential register update) |

Not modified (no change justified): `RISKS.md` (R-1's mitigation-span completion and the R-3/R-4/R-5 dispositions remain architect calls; no risk facts changed), `CHAT_CONTINUITY.md` (contains no worklog/session references; its procedure is unaffected), `PHASE-0-RECONNAISSANCE.md` (historical evidence), `README.md` / `AGENTS.md` documents (D-P2 pending), all application/product/database/deployment/immutable-source paths, `vercel.json`.

### Interfaces / contracts

- **Control-document contracts** (Phase 1): the documents' required fields and headings remain intact; only dated state values are reconciled.
- **Final State Contract** (plan): `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (this Part II Phase identity) = `VERIFICATION_STATE.phase` = **Phase 4 — Worklog and Session Audit, `IN_PROGRESS`**; baseline = `d12b0582`; latest verified commit = `3706b977` (the latest architect-verified product/control implementation — `d12b0582` is a closure-record commit, and `b65725e5` is an external repository event, neither an architect-verified implementation); latest worklog phase entry = Phase 4 `IN_PROGRESS`.
- **Worklog contract** (new, this phase): `worklog.md` is the canonical audit/history layer — chronological, append-only except explicit dated corrections, evidence-classified, canonical status vocabulary — and never a second source of truth for current state (its §1; plan Phase 4).
- **Session-audit contract** (new, this phase): `docs/project-control/sessions/` records make the twelve determinations available; no fabricated timestamps; no credentials/tokens/private chain-of-thought/unsupported claims.
- **Status vocabulary** (D-011): `PLANNED` / `IN_PROGRESS` / `BLOCKED` / `CORRECTION_REQUIRED` / `VERIFIED` / `CLOSED` — no conflicting vocabulary.
- **Evidence classes** (D-012): developer-reported vs architect-verified, strictly separated; no un-happened architect verification is claimed; Git commands are never claimed on the architect's behalf.
- **`b65725e5` handling rules** (this handoff): accepted as an already-existing repository event; not rewritten/reverted/amended; `vercel.json` non-scope; provenance reported as not independently established.
- **Handoff integrity** (D-017 / §I.6): unchanged and binding for this instance.

### Security constraints

- No secrets, credentials, or access tokens may be written into the worklog, session records, or any control document; the exposed Vercel token (R-5) is never reproduced.
- No private chain-of-thought — observable evidence only; no fabricated timestamps (only dates or repository-derived information actually available).
- The provenance of `b65725e5` must be reported as **not independently established** unless new repository evidence proves otherwise; Git-metadata inferences are recorded as inferences only (D-012).
- Tenancy boundaries and authorization requirements: this phase is documentation-only and touches no application security surface.
- Immutable-source boundaries: `docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**` are never modified (D-007); project entries are never folded into `docs/doable-source/WORKLOG.md` (I-008).
- Production-branch restrictions: no work on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main` (D-008); no deployment operations; no force-push.

### Testing requirements (validation before commit)

| # | Check | Method |
|---|---|---|
| 1 | `worklog.md` exists | file-existence test at the repository root |
| 2 | Canonical structure verified | entry-schema fields; six status values; append-only convention; evidence classes; authority declaration |
| 3 | Phases 0–3 represented | per-phase entry checks (objective/implementation/verification/review/commits/issues/next action) |
| 4 | `b65725e5` event represented accurately | position between `3706b977` and `d12b0582`; vercel.json-only; deployment-enabling; occurred during Phase 3 closure; caused the push rejection; stale-baseline protection; Z.AI stop; architect disposition |
| 5 | Evidence classification present | developer-reported vs architect-verified labels throughout |
| 6 | No unsupported provenance claim | no statement of definite owner authorship for `b65725e5`; "not independently established" present; metadata labeled as inference |
| 7 | Session records follow the approved structure | twelve determinations per record; README convention |
| 8 | Worklog is historical, not current-state authority | non-replacement declaration listing the five authority documents |
| 9 | No duplicate current-state source | `git ls-files` (exactly one project worklog; one sessions/ directory; no competing state files) |
| 10 | No secrets/tokens/credentials | credential-pattern scan of all changed paths |
| 11 | No product source changed | diff-scope check (`src/`, `packages/` untouched) |
| 12 | No DB/migration files changed | diff-scope check |
| 13 | `vercel.json` unchanged | diff-scope check; `b65725e5` untouched |
| 14 | Immutable Doable-source trees unchanged | diff-scope check |
| 15 | Lightweight repository validation | `npm run validate:model-config` (read-only) |
| 16 | Full diff inspection | `git diff` review of every changed path |
| 17 | Final State Contract | phase/status agreement across the five documents + latest worklog entry |
| 18 | Commit and push | single focused commit; push to `origin/feature/ai-core-from-doable-source`; no force-push |
| 19 | Clean tree and synchronization | `git status` clean; local HEAD = `origin` tip |

### Acceptance criteria (pass/fail)

1. `worklog.md` exists at the repository root with the canonical structure — PASS/FAIL.
2. Phases 0–3 are accurately represented, including the Phase 0 `CORRECTION_REQUIRED` cycle — PASS/FAIL.
3. The `b65725e5` event is represented accurately, with provenance reported as not independently established — PASS/FAIL.
4. Developer/architect evidence classification is present and correct throughout — PASS/FAIL.
5. Session records follow the approved structure with no fabricated timestamps — PASS/FAIL.
6. The worklog explicitly does not replace the current-state authority documents; no duplicate current-state source exists — PASS/FAIL.
7. No secrets/tokens/credentials introduced — PASS/FAIL.
8. No product source, DB/migration files, `vercel.json`, or immutable Doable-source trees changed; `b65725e5` untouched; no deployment/database operation performed — PASS/FAIL.
9. Final State Contract values agree (Phase 4 `IN_PROGRESS`; baseline `d12b0582`; latest verified commit `3706b977`; latest worklog entry Phase 4) — PASS/FAIL.
10. Working tree clean; the implementation commit pushed and local/remote synchronized — PASS/FAIL.

### Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`; no force-push.
- One focused documentation-only implementation commit: `docs: establish phase 4 worklog and session audit` — the immediate child of `d12b0582`; changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`; no unrelated changes ride along.
- Push to `origin/feature/ai-core-from-doable-source`.
- Do not modify or rewrite `b65725e5`; do not modify `vercel.json`.

### Evidence requirements

The developer completion report must provide (per §I.7 and this handoff): Phase 4 status; exact HEAD; exact commits; changed files; worklog structure; historical coverage; session records; validation commands/results; Git status; local/remote synchronization; security scan; scope verification; Final State Contract verification; remaining issues; remaining risks; deviations; unresolved questions; the explicit statement that no product feature was implemented; the explicit statement that no database/deployment operation was performed; the explicit statement that no later phase was started; and the explicit report that the `b65725e5` provenance is **not independently established**. No architect approval of Phase 4 is claimed.

### Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

ChatGPT must independently inspect the actual implementation commit and its full diff, `worklog.md`, the session records, the state documents, the Final State Contract, the validation evidence, and the security/scope boundaries, then record one of `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED` in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 4.

### STOP boundary

After the Phase 4 implementation, validation, commit, push, and the evidence report: **Z.AI STOPs.** Do not start Phase 5. Do not implement product capabilities. Do not modify deployment or database state. Do not resolve R-3/R-4/R-5 unless separately authorized. Do not modify `b65725e5` or `vercel.json`. Wait for ChatGPT architect review. Only ChatGPT/project-owner review can close Phase 4.

### Closure record (2026-10-01)

**Architect review of Phase 4 — outcome `PASS` → Phase 4 `CLOSED`.** Architect: **ChatGPT**. Developer: **Z.AI**. Reviewed implementation commit: `5febaacd5dcc55268904d1371038bbe8ff372040` ("docs: establish phase 4 worklog and session audit"; the immediate child of this instance's baseline `d12b0582f370c0192a97bad0ad1b1dc81b7f0713`; verified relationship `d12b0582 → 5febaacd`). ChatGPT independently reviewed the actual GitHub repository state and the Phase 4 implementation; scope verification: documentation-only, satisfying the Phase 4 acceptance criteria. [architect-verified — as communicated by the architect in the Phase 4 closure handoff]

**Phase 5 — Verification and Phase-Gate System is the next phase; it has NOT started.** No Phase 5 handoff has been issued; no Phase 5 implementation has been performed; no product implementation has been performed. [architect-verified]

This instance is fully executed and its phase is closed; it remains materialized here until the architect issues the Phase 5 handoff, at which point Part II is replaced with the Phase 5 instance per §I.12 (this instance remains recoverable in Git history at the closure-record commit and in the canonical `worklog.md`). The closure record itself is committed as `docs: record architect approval of phase 4` — the immediate child of `5febaacd`. The `b65725e5` handling rules above remain in force: provenance not independently established (never described as confirmed owner authorship); not modified, amended, reverted, or rewritten; `vercel.json` non-scope. The historical Phase 4 worklog entry is preserved unrewritten; the closure appears as a subsequent append-only architect-verified event. Z.AI is STOPped at the inter-phase boundary. [developer-reported]
