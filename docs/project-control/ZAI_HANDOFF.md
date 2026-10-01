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
| Phase number | **3** |
| Phase name | **Cross-Chat ChatGPT Continuity** |
| Full designation | **Phase 3 — Cross-Chat ChatGPT Continuity** |
| Current status | **IN_PROGRESS** — developer implementation complete; awaiting architect review |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `31ffd6f4330753f9b42dba231d7e02589d12eb77` — Phase 2 implementation, architect-verified by the `PASS` review (2026-10-01); the Phase 2 closure-record commit `58856e0be6325d0326a2d7c8cde6d6d6312b9000` ("docs: record architect approval of phase 2", directed by this same handoff) is an expected descendant of that baseline and precedes the Phase 3 implementation commit |
| Architect | **ChatGPT** (architect / technical lead / reviewer / controller) |
| Developer | **Z.AI** (developer / implementer) |
| Handoff date | 2026-10-01 |

### Objective

Create a durable `CHAT_CONTINUITY.md` procedure that allows a completely new ChatGPT conversation, with no access to the previous conversation, to recover the exact Clara project state and continue architectural leadership safely from GitHub repository state alone — with stale conversational memory unable to override repository truth.

### Scope (approved)

- Create `docs/project-control/CHAT_CONTINUITY.md`: the durable cross-chat ChatGPT continuity procedure — fresh-ChatGPT initialization; the 17 capability determinations; deterministic read order distinguishing mandatory / conditional / historical reads; the recovery procedure; the recovery-report schema with evidence grading; the repository-authority and stale-memory rules; broken-chat recovery; state-inconsistency → `BLOCKED`; architect-authority recovery; Z.AI authorization rules; a reusable copy/paste initialization prompt; recovery scenarios A–H; the validation procedure.
- Modify `docs/project-control/PROJECT_STATE.md` and `docs/project-control/NEXT_ACTION.md` (phase-state reconciliation to Phase 3).
- Modify other `docs/project-control/` files only where necessary to keep the Final State Contract correct: `CURRENT_PHASE.md` (contract member), this file (Part II instance replacement per §I.12 / D-016), `VERIFICATION_STATE.md` (Phase 3 evidence + reconciled consistency table).

### Non-scope (explicit)

- **Do NOT** modify application product source code.
- **Do NOT** modify database or migrations.
- **Do NOT** modify Vercel/deployment configuration.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`).
- **Do NOT** create the Phase 4 worklog (repository root `worklog.md`) or session records (`docs/project-control/sessions/`).
- **Do NOT** implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, or any product capability of the north-star program.
- **Do NOT** create a Phase 4 handoff instance or any later-phase artifact.
- **Do NOT** add a validation script/validator to the repository (any reusable script stays outside the repository, in the agent workspace).
- **Do NOT** modify `README.md` or `AGENTS.md` documents (pending architect decision D-P2).
- **Do NOT** modify the closed Phase 0 reconnaissance report or rewrite historical Phase 0/Phase 1/Phase 2 evidence.
- **Do NOT** work directly on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.

### Prerequisites (all satisfied 2026-10-01)

1. Phase 2 `CLOSED` — architect review `PASS` on `31ffd6f4330753f9b42dba231d7e02589d12eb77` (2026-10-01); closure recorded in `VERIFICATION_STATE.md` and committed as `58856e0be6325d0326a2d7c8cde6d6d6312b9000` ("docs: record architect approval of phase 2").
2. The Phase 2 handoff system is in force: Part I of this file (durable protocol) and `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md`.
3. Mandatory initialization completed by the developer on 2026-10-01: all documents in Required reading read; repository state refreshed (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; clean tree; 12 ahead / 0 behind `Vite-Converted` at the closure-record commit; mainlines unchanged); Phase 2 closure confirmed **from repository evidence**, not chat memory.

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
10. `docs/project-control/ZAI_HANDOFF.md` (Part I protocol + the Phase 2 instance then active)
11. `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md`
12. `docs/superpowers/plans/2026-10-01-clara-project-control-system.md`
13. `docs/project-control/PHASE-0-RECONNAISSANCE.md`

### Implementation tasks (numbered, deterministic)

1. Complete the mandatory initialization (Required reading; repository refresh; confirm Phase 2 architect-verified and `CLOSED` from repository evidence).
2. Record the Phase 2 closure in `VERIFICATION_STATE.md` (architect `PASS` review trail; Phase 2 → `CLOSED`; Phase 3 next) and commit separately as `docs: record architect approval of phase 2`; push; verify clean status. *(Delivered: commit `58856e0be6325d0326a2d7c8cde6d6d6312b9000`.)*
3. Replace Part II of this file with the Phase 3 handoff instance (this instance, per §I.12).
4. Create `docs/project-control/CHAT_CONTINUITY.md` per the architect's continuity contract (Scope above).
5. Reconcile phase state to Phase 3 `IN_PROGRESS`: update `PROJECT_STATE.md` (current phase, commit state, last architect verification, completed phases, next action, document index), `CURRENT_PHASE.md` (Phase 3 contract), `NEXT_ACTION.md` (Phase 3 continuation instruction), `VERIFICATION_STATE.md` (Phase 3 evidence + reconciled Final State Contract table + appendix).
6. Execute the validation suite (Testing requirements below); record commands and results in `VERIFICATION_STATE.md` §Phase 3.
7. Commit as `docs: establish cross-chat ChatGPT continuity`; push to `origin/feature/ai-core-from-doable-source`; verify clean status and sync.
8. Deliver the developer completion report (Evidence requirements below) and STOP.

### Files / components

| Path | Action | Bounded change |
|---|---|---|
| `docs/project-control/CHAT_CONTINUITY.md` | create | The durable cross-chat ChatGPT continuity procedure |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II instance replacement only (Phase 2 → Phase 3); Part I protocol untouched |
| `docs/project-control/PROJECT_STATE.md` | modify | Phase-state reconciliation only; document contract preserved |
| `docs/project-control/CURRENT_PHASE.md` | modify | Replace Phase 2 contract with Phase 3 contract (same contract structure) |
| `docs/project-control/NEXT_ACTION.md` | modify | Phase 3 continuation instruction (same 5-part structure) |
| `docs/project-control/VERIFICATION_STATE.md` | modify | Phase 3 evidence section, reconciled consistency table, appendix commands |

Not modified (no change justified): `DECISIONS.md` (not a Final State Contract member; the continuity rules are already governed by D-001/D-002/D-003/D-009/D-011/D-012/D-017 — no new decision ID is required), `ISSUES.md` (no new defect; I-001/I-003/I-007 unchanged), `RISKS.md` (R-1's recorded mitigation already spans Phases 1–4), `PHASE-0-RECONNAISSANCE.md` (historical evidence), `README.md` / `AGENTS.md` documents (D-P2 pending), all application/product/database/deployment/immutable-source paths.

### Interfaces / contracts

- **Control-document contracts** (Phase 1): the documents' required fields and headings remain intact; only dated state values are reconciled.
- **Final State Contract** (plan): `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (this Part II Phase identity) = `VERIFICATION_STATE.phase` = **Phase 3 — Cross-Chat ChatGPT Continuity, `IN_PROGRESS`**; latest verified commit = `31ffd6f4` (Phase 2 implementation, architect-verified by the `PASS` review, 2026-10-01). Latest worklog entry: canonical worklog does not exist yet (Phase 4) — no conflict possible.
- **Status vocabulary** (D-011): `PLANNED` / `IN_PROGRESS` / `BLOCKED` / `CORRECTION_REQUIRED` / `VERIFIED` / `CLOSED` — no conflicting vocabulary.
- **Evidence classes** (D-012): developer-reported vs architect-verified, strictly separated; no un-happened architect verification is claimed.
- **Review outcomes** (D-009): `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED`; only `PASS` closes.
- **Handoff integrity** (D-017 / §I.6): unchanged and binding for this instance.
- **`CHAT_CONTINUITY.md`'s own contract** (new, this phase): a procedure-only document — no second source of truth (its §1.3); its read order, recovery procedure, recovery-report schema, `BLOCKED` rule, Z.AI authorization rules, initialization prompt, and scenarios A–H are the durable ChatGPT-side counterpart of this file's Part I.

### Security constraints

- No secrets, credentials, or access tokens may be written into any handoff or control document; the exposed Vercel token (R-5) is never reproduced.
- No private chain-of-thought — handoffs record decisions and observable evidence only.
- Tenancy boundaries and authorization requirements: this phase is documentation-only and touches no application security surface; future handoffs must state tenant-authorization and RBAC requirements wherever the scope touches application code.
- Immutable-source boundaries: `docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**` are never modified (D-007).
- Production-branch restrictions: no work on `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main` (D-008); no deployment operations.

### Testing requirements (validation before commit)

| # | Check | Method |
|---|---|---|
| 1 | `CHAT_CONTINUITY.md` exists | file-existence test |
| 2 | Required sections exist | `rg -F` heading checks (§1–§15) |
| 3 | Read order explicit | §4: ordered mandatory list, conditional reads, historical evidence |
| 4 | Repository authority explicit | §2 verbatim rule present |
| 5 | Stale-memory rule exists | §2 rule + example table |
| 6 | Recovery-report schema exists | §6 field list + evidence classes |
| 7 | Broken-chat procedure exists | §7 case list |
| 8 | State inconsistency → `BLOCKED` | §8 checks |
| 9 | Architect/developer role separation exists | §9 checks |
| 10 | Z.AI authorization rules exist | §10 checks |
| 11 | Copy/paste initialization prompt exists | §11 fenced block |
| 12 | Recovery scenarios exist | §12 A–H |
| 13 | References resolve | backtick-path extraction + existence test; non-existent paths exactly the declared ones (`docs/AGENTS.md` per I-001) |
| 14 | No competing state source | `git ls-files` control-document check; `CHAT_CONTINUITY.md` is procedure, not state |
| 15 | No secrets introduced | credential-pattern scan of `docs/project-control/` |
| 16 | Final State Contract consistent | phase/status agreement across the five documents; latest verified commit `31ffd6f4` |
| 17 | Lightweight repository validation | `npm run validate:model-config` (read-only) |
| 18 | Diff within Phase 3 scope | `git status` / `git diff --stat`: only `docs/project-control/` paths |

### Acceptance criteria (pass/fail)

1. A fresh ChatGPT session can reconstruct Clara state without the previous conversation (§5 procedure + §11 initialization prompt) — PASS/FAIL.
2. Repository state is explicitly authoritative, and stale ChatGPT memory cannot override GitHub evidence (§2) — PASS/FAIL.
3. The active phase, the active Z.AI handoff, and the latest architect-verified commit can be determined from repository state alone (§3) — PASS/FAIL.
4. Developer-reported evidence is distinguishable from architect-verified evidence (§6 evidence classes; D-012) — PASS/FAIL.
5. Broken-chat recovery is deterministic (§7) — PASS/FAIL.
6. State inconsistencies become `BLOCKED` (§8) — PASS/FAIL.
7. Z.AI authorization can be determined without conversational memory (§10) — PASS/FAIL.
8. The initialization prompt is reusable and conversation-independent (§11) — PASS/FAIL.
9. No competing source of truth is introduced (§1.3; `git ls-files` check) — PASS/FAIL.
10. No product feature implemented; no database/deployment changes; immutable Doable-source boundaries untouched — PASS/FAIL.
11. Final State Contract values agree across all control documents (Phase 3 `IN_PROGRESS`; latest verified commit `31ffd6f4`) — PASS/FAIL.
12. Working tree clean; both commits pushed to `feature/ai-core-from-doable-source` — PASS/FAIL.

### Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`.
- Two focused documentation commits (no squashing of unrelated history):
  1. `docs: record architect approval of phase 2` (closure record — delivered as `58856e0be6325d0326a2d7c8cde6d6d6312b9000`);
  2. `docs: establish cross-chat ChatGPT continuity` (this implementation — the immediate child of `58856e0b`; exact SHA via `git rev-parse origin/feature/ai-core-from-doable-source` after push).
- Both pushed to `origin/feature/ai-core-from-doable-source`; no unrelated changes ride along.

### Evidence requirements

The developer completion report must provide (per §I.7 and the Phase 3 handoff): phase; status; exact changed files; exact commits; Phase 2 closure evidence; the Phase 3 implementation summary; validation commands and results; Git evidence (baseline `31ffd6f4`, closure SHA `58856e0b`, implementation SHA, current HEAD, branch, clean/in-sync status, remote synchronization); the security check; the scope check; the Final State Contract check; unresolved issues; remaining risks; deviations from scope; unresolved questions; explicit confirmation that no product feature was implemented; explicit confirmation that no later phase was started; and the explicit statement that ChatGPT must independently review and close Phase 3 — no architect approval of Phase 3 is claimed.

### Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

ChatGPT must independently inspect the actual commits (`58856e0b` and the implementation commit), the actual diff, `CHAT_CONTINUITY.md`, the state documents, the Final State Contract, the validation evidence, and the security/scope boundaries, then record one of `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED` in `VERIFICATION_STATE.md`. Only `PASS` closes Phase 3.

### STOP boundary

After the Phase 3 implementation, validation, commits, push, and the evidence report: **Z.AI STOPs.** Z.AI must not start Phase 4, must not create `worklog.md`, must not create session records, must not implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, or Agent Work Mode, must not modify application product code, must not deploy, must not modify Supabase or production branches, must not make unrelated improvements, and must not broaden scope. Z.AI waits for ChatGPT architect review and a new handoff. Only ChatGPT/project-owner review can close Phase 3.
