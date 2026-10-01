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
| Phase number | **5** |
| Phase name | **Verification and Phase-Gate System** |
| Full designation | **Phase 5 — Verification and Phase-Gate System** |
| Current status | **IN_PROGRESS** — the handoff is being executed by the Phase 5 implementation commit (`docs: establish phase 5 verification and phase gates`, the immediate child of the baseline); implementation complete and submitted, developer-reported, **NOT YET REVIEWED**; awaiting ChatGPT architect review |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |
| Baseline commit | `8d8595d0a994510da217af6d12225e3f1d00b2fd` — the Phase 4 closure-evidence correction commit, **accepted by the architect (Phase 4 stands `CLOSED`)**; branch history `5febaacd` → `16b89a94` → `8d8595d0`. The latest architect-verified implementation remains `5febaacd5dcc55268904d1371038bbe8ff372040` — later documentation commits (closure record, correction, and this phase's implementation) are not to be confused with it. The `b65725e5` external commit remains accepted as an already-existing repository event (provenance not independently established) and must not be rewritten, reverted, amended, or otherwise modified |
| Architect | **ChatGPT** (architect / technical lead / reviewer / controller) |
| Developer | **Z.AI** (developer / implementer) |
| Handoff date | 2026-10-01 (Phase 5 implementation handoff, issued after the architect's acceptance of the Phase 4 closure-evidence correction) |

### Objective

Implement the **Verification and Phase-Gate System** defined by the project-control plan. The completed system must make it impossible, under the documented project-control process, to treat tests alone, a developer claim, a successful build, a clean Git tree, or a successful deployment as sufficient evidence for phase closure when additional verification gates are required — explicitly distinguishing developer-reported evidence; architect-verified evidence; required gates; optional/non-applicable gates; blockers; review outcomes; and closure eligibility.

### Scope (approved)

1. Extend `VERIFICATION_STATE.md` with a durable verification contract (binding on closure evidence from Phase 5 onward).
2. Extend `CURRENT_PHASE.md` with the Phase-Gate requirements and closure conditions.
3. Create one canonical verification checklist/template under `docs/project-control/` — `VERIFICATION_CHECKLIST.md`.
4. Update the root `worklog.md` with the Phase 5 implementation entry.
5. Reconcile the current-state documents to Phase 5 `IN_PROGRESS`: `PROJECT_STATE.md`, `NEXT_ACTION.md`, `ZAI_HANDOFF.md` (this Part II instance, per §I.12 / D-016), `VERIFICATION_STATE.md`, `CURRENT_PHASE.md`.
6. Define the review-outcome contract: `PASS`, `PASS_WITH_FOLLOWUP`, `CORRECTION_REQUIRED` (binding semantics).
7. Define the P0/P1 blocker rule.
8. Define a phase-close checklist.
9. Define gate applicability so DB/deployment gates are required only when the phase actually changes those surfaces.
10. Add a deterministic test demonstrating that an incomplete verification state cannot legitimately be represented as `CLOSED` — `docs/project-control/verification/phase-closure-eligibility-test.sh`.

Consequential register updates entailed by the deliverables: `DECISIONS.md` D-020 (the system's establishment as a binding decision); session record `SESSION-006.md` + its `sessions/README.md` index row (per D-019).

### Non-scope (explicit)

- **Do NOT** modify `src/` or `packages/`; do not implement Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills, or any application provider behavior.
- **Do NOT** modify database schema, create migrations, execute Supabase mutations, execute Vercel deployments, or modify `vercel.json`.
- **Do NOT** modify production branches (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); do not rewrite, revert, or amend `b65725e5`.
- **Do NOT** modify the immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`); do not place Phase 5 material into the library-scoped `docs/doable-source/WORKLOG.md`.
- **Do NOT** resolve R-3, R-4, or R-5, or rotate credentials/tokens (the R-5 exposed Vercel token is referenced but never reproduced).
- **Do NOT** change existing architecture decisions, or silently resolve I-001 or I-007.
- **Do NOT** create Phase 6 artifacts, product-feature specifications, or product-feature implementation plans; do not implement any Clara product capability.

Phase 5 is a **project-control/governance phase only**.

### Prerequisites (all satisfied 2026-10-01)

1. Phase 4 `CLOSED` — architect review `PASS` (2026-10-01) on implementation commit `5febaacd5dcc55268904d1371038bbe8ff372040`; closure record `16b89a946d0848884ff74ffb435693402fc31a52`; closure-evidence correction `8d8595d0a994510da217af6d12225e3f1d00b2fd` **accepted by the architect — Phase 4 stands `CLOSED`**.
2. The Phase 5 implementation handoff issued 2026-10-01 with baseline `8d8595d0` (the repository tip at issuance); the latest architect-verified implementation remains `5febaacd`.
3. Mandatory initialization completed by the developer on 2026-10-01: all documents in Required reading read; repository state refreshed per §I.6 (`git fetch --prune`; branch `feature/ai-core-from-doable-source`; HEAD `8d8595d0` = origin tip, clean tree; 18 ahead / 0 behind `Vite-Converted`; mainlines unchanged; `b65725e5` ancestry intact; `vercel.json` unchanged) — confirmed from repository evidence, not chat memory.

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
10. `docs/project-control/ZAI_HANDOFF.md` (Part I protocol + the Phase 4 instance then active)
11. `docs/project-control/CHAT_CONTINUITY.md`
12. `docs/superpowers/specs/2026-10-01-clara-project-control-architecture-design.md` (incl. §Phase Completion Contract)
13. `docs/superpowers/plans/2026-10-01-clara-project-control-system.md` (Phase 5 section)
14. `docs/project-control/PHASE-0-RECONNAISSANCE.md`
15. `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md`
16. Repository-root `worklog.md` (canonical audit trail)
17. `docs/project-control/sessions/README.md` + the session records through `SESSION-005.md` (whose record carries the accepted Phase 4 closure-correction note)

### Implementation tasks (numbered, deterministic)

1. Complete the mandatory initialization (Required reading; repository refresh per §I.6; confirm Phase 4 `CLOSED` with the accepted correction and the baseline `8d8595d0` from repository evidence).
2. Replace Part II of this file with this Phase 5 handoff instance (per §I.12).
3. Extend `VERIFICATION_STATE.md` with the durable verification and phase-gate contract: Gates A–F with required records and satisfaction rules; gate applicability (E/F conditional on changed surfaces); binding review-outcome semantics; the P0/P1 blocker rule; closure-eligibility rules R1–R7; evidence-class obligations.
4. Create `docs/project-control/VERIFICATION_CHECKLIST.md` — the canonical checklist/template (five never-sufficient-alone evidences; per-gate record templates; applicability worksheet; outcome/P0/P1 summaries; the 22-item phase-close checklist; closure-eligibility rules; worked Examples 1 and 2).
5. Create `docs/project-control/verification/phase-closure-eligibility-test.sh` — the deterministic, read-only, self-contained closure-rule demonstration (incomplete → FAIL; complete → PASS; plus the P0/P1/exception/evidence-class/applicability/blocking-correction cases), and verify it exits 0 with 8/8 correct determinations.
6. Rewrite `CURRENT_PHASE.md` as the Phase 5 contract (Phase-Gate requirements and closure conditions) and reconcile `PROJECT_STATE.md`, `NEXT_ACTION.md`, and `VERIFICATION_STATE.md` (Phase 5 section + consistency table + appendix commands) to Phase 5 `IN_PROGRESS`.
7. Apply the consequential register updates: append `DECISIONS.md` D-020; create session record `SESSION-006.md` and add its index row to `sessions/README.md`; append the `worklog.md` Phase 5 implementation entry.
8. Execute the validation suite (Testing requirements below); record commands and results in `VERIFICATION_STATE.md` §Phase 5.
9. Commit as `docs: establish phase 5 verification and phase gates`; push to `origin/feature/ai-core-from-doable-source`; verify clean status and sync.
10. Deliver the developer completion report (Evidence requirements below) and STOP.

### Files / components

| Path | Action | Bounded change |
|---|---|---|
| `docs/project-control/VERIFICATION_STATE.md` | modify | Durable verification and phase-gate contract + the Phase 5 evidence section + the reconciled consistency table + appendix Phase 5 commands |
| `docs/project-control/VERIFICATION_CHECKLIST.md` | create | The canonical verification checklist/template (gate-record templates; applicability worksheet; phase-close checklist; worked examples) |
| `docs/project-control/verification/phase-closure-eligibility-test.sh` | create | The deterministic closure-eligibility demonstration (read-only governance artifact; not a CI gate; no application dependency) |
| `docs/project-control/CURRENT_PHASE.md` | modify | Replace the Phase 4 contract with the Phase 5 contract (same contract structure; adds the Phase-Gate requirements and closure conditions) |
| `docs/project-control/PROJECT_STATE.md` | modify | Phase-state reconciliation only; document contract preserved |
| `docs/project-control/NEXT_ACTION.md` | modify | Phase 5 continuation instruction (same 5-part structure) |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II instance replacement only (Phase 4 → Phase 5); Part I protocol untouched |
| `docs/project-control/DECISIONS.md` | modify | D-020 appended (consequential register update) |
| `docs/project-control/sessions/SESSION-006.md` | create | Session audit record for this implementation session (twelve determinations) |
| `docs/project-control/sessions/README.md` | modify | SESSION-006 index row |
| `worklog.md` | modify | The Phase 5 implementation entry appended (append-only) |

Not modified (no change justified): `ISSUES.md` (no new defects; I-001/I-007 explicitly non-scope — not silently resolved), `RISKS.md` (R-1's mitigation-status transition and the R-3/R-4/R-5 dispositions remain architect calls; no risk facts changed), `CHAT_CONTINUITY.md`, `PHASE-0-RECONNAISSANCE.md` (historical evidence), `templates/PHASE_HANDOFF_TEMPLATE.md`, `README.md` / `AGENTS.md` documents (D-P2 pending), all application/product/database/deployment/immutable-source paths, `vercel.json`.

### Interfaces / contracts

- **Control-document contracts** (Phase 1): the documents' required fields and headings remain intact; only dated state values are reconciled.
- **Final State Contract** (plan): `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (this Part II Phase identity) = `VERIFICATION_STATE.phase` = latest worklog phase = **Phase 5 — Verification and Phase-Gate System, `IN_PROGRESS`**; baseline = `8d8595d0`; latest verified commit = `5febaacd` (the latest architect-verified product/control implementation — `16b89a94` is a closure-record commit, `8d8595d0` is an architect-accepted closure-evidence correction commit, and this phase's implementation commit is a developer-reported documentation commit; `b65725e5` is an external repository event; none of the latter is an architect-verified implementation).
- **Verification and phase-gate contract** (new, this phase; D-020): the binding rules in `VERIFICATION_STATE.md` — Gates A–F, applicability, review-outcome semantics, P0/P1 blocker rule, closure eligibility R1–R7 — operationalized by `VERIFICATION_CHECKLIST.md` (the form) and demonstrated by the deterministic test. It governs closure evidence only; it introduces no second source of truth and transfers no closure authority (D-009 stands).
- **Status vocabulary** (D-011): `PLANNED` / `IN_PROGRESS` / `BLOCKED` / `CORRECTION_REQUIRED` / `VERIFIED` / `CLOSED` — no conflicting vocabulary.
- **Evidence classes** (D-012): developer-reported vs architect-verified, strictly separated; no un-happened architect verification is claimed; Git commands are never claimed on the architect's behalf.
- **`b65725e5` handling rules** (standing): accepted as an already-existing repository event; not rewritten/reverted/amended; `vercel.json` non-scope; provenance reported as not independently established.
- **Handoff integrity** (D-017 / §I.6): unchanged and binding for this instance.

### Security constraints

- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads may be written into any control document; the exposed Vercel token (R-5) is never reproduced — referenced only.
- No fabricated timestamps; no unsupported claims; observable evidence only.
- A future or intended ChatGPT review is never written as already completed; a command Z.AI executed is never claimed on ChatGPT's behalf.
- The provenance of `b65725e5` must be reported as **not independently established** unless new repository evidence proves otherwise; Git-metadata inferences are recorded as inferences only (D-012).
- Tenancy boundaries and authorization requirements: this phase is documentation-only and touches no application security surface.
- Immutable-source boundaries (D-007) and production-branch restrictions (D-008) remain in force; no deployment operations; no force-push.

### Testing requirements (validation before commit — the handoff's 25 checks)

| # | Check | Method |
|---|---|---|
| 1 | Phase 5 required documents exist | existence checks (contract, checklist, test script, Phase 5 contract in `CURRENT_PHASE.md`) |
| 2 | Verification checklist/template exists | `git ls-files` (exactly one `VERIFICATION_CHECKLIST.md`) |
| 3 | Required verification fields exist | `rg` gate-field checks (Gates A–F required records) |
| 4 | All three review outcomes exist | `rg 'PASS_WITH_FOLLOWUP'` in contract/checklist/`CURRENT_PHASE.md` |
| 5 | P0/P1 blocker policy exists | `rg 'P0 prevents\|P1 prevents'` |
| 6 | Implementation gate exists | Gate B present in contract + checklist |
| 7 | Test gate exists | Gate C present in contract + checklist |
| 8 | Code-review gate exists | Gate D present in contract + checklist |
| 9 | Database applicability/gate exists | Gate E + recorded `NOT_APPLICABLE` for this phase |
| 10 | Deployment applicability/gate exists | Gate F + recorded `NOT_APPLICABLE` for this phase |
| 11 | Phase-close checklist exists | `rg '^## 7\. Phase-close checklist'` + the 22 items |
| 12 | Deliberately incomplete phase cannot be marked closure-eligible | deterministic test case-1 → `FAIL` |
| 13 | Complete example can be closure-eligible | deterministic test case-2 → `PASS` |
| 14 | Developer/architect evidence separation exists | label checks across changed documents |
| 15 | No competing current-state source introduced | `git ls-files` (one checklist, one test script; no new state docs) |
| 16 | No secrets introduced | credential-pattern scan of all changed paths |
| 17 | No product source changed | diff-scope check vs `8d8595d0` |
| 18 | No DB/migration files changed | diff-scope check |
| 19 | No `vercel.json` change | diff-scope check |
| 20 | Immutable Doable-source trees unchanged | diff-scope check |
| 21 | Final State Contract consistent | phase/status agreement across the five members + latest worklog entry |
| 22 | Worklog contains the Phase 5 implementation entry | `rg '^## 2026-10-01 — Phase 5' worklog.md` |
| 23 | Git diff fully inspected | full-diff review of every changed path |
| 24 | Working tree clean after commit | `git status` clean |
| 25 | Branch synchronized with origin | local HEAD = `origin` tip after push |

Plus `npm run validate:model-config` (read-only) where appropriate — **not interpreted as sufficient phase verification**. The deterministic test must exit 0 with 8/8 correct determinations. The reusable aggregate validation script stays outside the repository (`/home/z/my-project/scripts/validate-phase5-control-docs.sh`), per the Phase 3/4 convention.

### Acceptance criteria (pass/fail — per the handoff §18)

1. Verification evidence has a durable schema — PASS/FAIL.
2. Developer and architect evidence are explicitly separated — PASS/FAIL.
3. Implementation verification is defined — PASS/FAIL.
4. Test verification is defined — PASS/FAIL.
5. Code-review verification is defined — PASS/FAIL.
6. Database verification applicability is defined — PASS/FAIL.
7. Deployment verification applicability is defined — PASS/FAIL.
8. `PASS`, `PASS_WITH_FOLLOWUP`, and `CORRECTION_REQUIRED` are defined — PASS/FAIL.
9. P0/P1 closure blocking is defined — PASS/FAIL.
10. Phase-close checklist exists — PASS/FAIL.
11. Deliberately incomplete phase fails closure eligibility — PASS/FAIL.
12. Complete applicable-gate example passes closure eligibility — PASS/FAIL.
13. No duplicate source of truth is introduced — PASS/FAIL.
14. No secrets/private reasoning are introduced — PASS/FAIL.
15. No product/DB/deployment/immutable-source changes occur — PASS/FAIL.
16. Final State Contract is consistent — PASS/FAIL.
17. Worklog records the Phase 5 implementation — PASS/FAIL.
18. Commit is pushed and synchronized — PASS/FAIL.
19. Z.AI stops at the Phase 5 review boundary — PASS/FAIL.

### Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, or `main`; no force-push.
- One focused documentation-only implementation commit: `docs: establish phase 5 verification and phase gates` — the immediate child of `8d8595d0`; changed paths limited to the repository-root `worklog.md` and `docs/project-control/**`; no unrelated changes ride along.
- Push normally to `origin/feature/ai-core-from-doable-source`.
- Do not modify or rewrite `b65725e5`; do not modify `vercel.json`; do not amend the baseline commit.

### Evidence requirements

The developer completion report must provide (per §I.7 and this handoff §16): phase; objective; scope completed; explicit non-scope; files changed; the verification model implemented; the review-outcome model; the P0/P1 policy; the phase-close checklist; the incomplete-phase test; the complete-phase test; commands executed; results; security checks; scope checks; the Final State Contract; the commit SHA; the parent SHA; branch state; local/remote synchronization; known issues; follow-ups; deviations; and the explicit confirmation that no product capability was implemented, no database mutation was performed, no deployment was performed, and no later phase was started. No architect approval of Phase 5 is claimed.

### Review boundary

**Developer completion does not equal phase completion.**

**Only ChatGPT/project-owner architect review can close the phase.**

The review is Gate D under the contract this phase establishes. ChatGPT must independently inspect the actual implementation commit and its full diff, the durable contract, `VERIFICATION_CHECKLIST.md`, the deterministic test and its expected FAIL/PASS demonstration, the state documents, the Final State Contract, the validation evidence, and the security/scope boundaries, then record one of `PASS` / `PASS_WITH_FOLLOWUP` / `CORRECTION_REQUIRED` in `VERIFICATION_STATE.md` §Phase 5. Only `PASS` closes Phase 5 — and the closure decision must itself satisfy the phase-close checklist (`VERIFICATION_CHECKLIST.md` §7).

### STOP boundary

After the Phase 5 implementation commit, push, validation, and the completion report: **Z.AI STOPs.** Do not begin Phase 6. Do not create Phase 6 artifacts. Do not implement product features. Do not create Multi-Provider code, Tool Runtime code, Integrations, MCP, Agent Runtime, or Agent Work Mode. Do not modify Vercel, Supabase, or immutable Doable source. Do not resolve R-3/R-4/R-5. Wait for ChatGPT's independent Phase 5 review. Only ChatGPT can close Phase 5.
